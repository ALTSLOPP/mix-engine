import type {
  TestScript,
  PlaybackFpsMetrics,
  PlaybackAnomaly,
  PlaybackAssertionResult,
  FeelProfile,
  VisionAnalysisRequest,
  VisionFrameRef,
  KeyframeArtifact,
} from './types';

/**
 * SENSORIUM — VisionReportBuilder.
 *
 * Assembles the package a vision model needs to "watch" the run and report back. It
 * produces three things:
 *   • a corrected, feel-aware instruction prompt (the old PLAYBACK prompt reported
 *     page-uptime as the test duration and never mentioned the felt experience),
 *   • a structured, model-agnostic VisionAnalysisRequest (system + instructions +
 *     video + captioned frames + contact sheet + rubric), and
 *   • a captioned contact-sheet montage so image-only models can see the whole arc
 *     of the playthrough in a single image.
 */

export interface ContactSheetSource {
  t: number;
  dataUrl: string;
  caption?: string;
}

export class VisionReportBuilder {
  buildAnalysisRequest(args: {
    script: TestScript;
    fps: PlaybackFpsMetrics;
    feel: FeelProfile;
    anomalies: PlaybackAnomaly[];
    assertions: PlaybackAssertionResult[];
    duration: number;
    videoUrl: string;
    keyframes: KeyframeArtifact[];
    contactSheetUrl?: string;
  }): VisionAnalysisRequest {
    const { script, keyframes, videoUrl, contactSheetUrl } = args;
    const frames: VisionFrameRef[] = keyframes.map((k) => ({ t: k.t, path: k.path, caption: k.note }));
    return {
      system:
        'You are a senior gameplay QA engineer and game-feel specialist. You review recorded ' +
        'playthroughs and report concrete, timestamped, prioritized findings a developer can act on. ' +
        'You are given engine telemetry alongside the footage; trust the video for anything visual ' +
        'and treat telemetry as corroborating evidence.',
      instructions: this.buildInstructions(args),
      video: videoUrl || undefined,
      frames,
      contactSheet: contactSheetUrl,
      rubric: this.rubric(script),
    };
  }

  /** The human-readable prompt (also stored as report.visionPrompt for back-compat). */
  buildInstructions(args: {
    script: TestScript;
    fps: PlaybackFpsMetrics;
    feel: FeelProfile;
    anomalies: PlaybackAnomaly[];
    assertions: PlaybackAssertionResult[];
    duration: number;
  }): string {
    const { script, fps, feel, anomalies, assertions, duration } = args;
    const L: string[] = [];
    L.push(`You are reviewing a recorded playthrough of a 3D game built in the MIX Engine.`);
    L.push('');
    L.push(`# Test: ${script.name}${script.profile ? `  (profile: ${script.profile})` : ''}`);
    if (script.description) L.push(`Description: ${script.description}`);
    if (script.visionContext) { L.push(''); L.push(script.visionContext); }
    L.push('');

    L.push(`# What the engine measured (corroborating evidence)`);
    L.push(`- Duration: ${duration.toFixed(1)}s`);
    L.push(`- Average FPS: ${fps.avg.toFixed(1)} (min ${fps.min.toFixed(1)}, p1 ${fps.p1.toFixed(1)})`);
    if (fps.longStutterMs > 0) L.push(`- Longest stutter (<30 fps): ${fps.longStutterMs.toFixed(0)}ms over ${fps.stutterEvents} event(s)`);

    L.push('');
    L.push(`# How it FELT (kinesthetic telemetry — the engine's own read)`);
    L.push(`- Overall feel: ${feel.overall}/100 (${feel.band}). ${feel.summary}`);
    L.push(`- Responsiveness: ${feel.responsivenessMs.toFixed(0)}ms input→motion. Top speed ${feel.topSpeed.toFixed(1)} m/s, peak accel ${feel.peakAccel.toFixed(1)} m/s².`);
    for (const m of feel.metrics) L.push(`  · ${m.label}: ${m.score}/100 — ${m.note}`);
    L.push(`Cross-check these against the video: if your eyes disagree with a number, say so and trust your eyes.`);

    if (anomalies.length) {
      L.push('');
      L.push(`# Auto-detected anomalies (may be noisy — confirm against the video)`);
      for (const a of anomalies) L.push(`- [${a.severity}] t=${a.t.toFixed(2)}s ${a.kind}: ${a.detail}`);
    }
    if (assertions.length) {
      L.push('');
      L.push(`# Hard assertions`);
      for (const a of assertions) L.push(`- ${a.passed ? '✓' : '✗'} ${a.name}: ${a.message}`);
    }

    L.push('');
    L.push(`# Your job — evaluate GAME FEEL`);
    L.push(`Watch the footage and report on responsiveness, movement/physics, camera, animation, ` +
      `collision feedback/juice, pacing, and visual quality. Be specific, cite timestamps, and ` +
      `prioritize what a player would actually notice. Where the telemetry above flags something, ` +
      `confirm or refute it from the video.`);
    L.push('');
    L.push(`Return the structured rubric below.`);
    return L.join('\n');
  }

  rubric(script: TestScript): string[] {
    const base = [
      'VERDICT: pass | minor_issues | major_issues',
      'FEEL_SCORE: 1-10 (your own, after watching — compare to the engine\'s number and explain any gap)',
      'ISSUES: bullet list of concrete problems with timestamps (e.g. "0:04 — vehicle slides on turn, no steering response for 0.3s")',
      'SUGGESTIONS: concrete fixes ranked by impact',
      'POSITIVES: 1-3 things working well',
    ];
    if (script.profile === 'driving') base.splice(2, 0, 'HANDLING: oversteer | understeer | neutral | twitchy — with evidence');
    if (script.profile === 'camera') base.splice(2, 0, 'MOTION_SICKNESS_RISK: low | medium | high — why');
    return base;
  }

  followUps(script: TestScript, anomalies: PlaybackAnomaly[], feel: FeelProfile): string[] {
    const out: string[] = [];
    const find = (k: PlaybackAnomaly['kind']) => anomalies.find((a) => a.kind === k);
    if (find('stuck')) out.push(`Re-run paused at the "stuck" region (t=${find('stuck')!.t.toFixed(2)}s) and describe the exact geometry the entity caught on.`);
    if (find('fall_through')) out.push('Investigate the fall-through region: missing collider, low-fps tunneling, or a slope edge case?');
    if (find('never_moved')) out.push('The body never moved despite movement inputs — verify the entity is possessable and the input mapping matches this game\'s controls.');
    if (find('low_fps')) out.push('Profile the stutter: identify the most expensive visual element in the affected frame.');
    if (find('oscillation')) out.push('The controller oscillated — check for fighting between root motion and manual kinematic translation.');
    const weakest = feel.metrics.filter((m) => m.samples > 0).sort((a, b) => a.score - b.score)[0];
    if (weakest && weakest.score < 50) out.push(`Feel weak point: "${weakest.label}" scored ${weakest.score}. Re-run a focused ${script.profile ?? 'free'} scenario isolating it.`);
    if (out.length === 0) {
      out.push('Re-run with a denser action timeline (more turns/interactions) to surface edge cases.');
      out.push('Save this run as a baseline, then diff future builds against it to catch feel regressions.');
    }
    return out;
  }

  /**
   * Build a captioned montage of keyframes (browser-only — uses canvas + Image).
   * Returns a PNG data URL, or '' if nothing could be drawn.
   */
  async buildContactSheet(sources: ContactSheetSource[], cells = 12): Promise<string> {
    if (typeof document === 'undefined' || sources.length === 0) return '';
    // Sub-sample evenly to `cells`.
    const picks: ContactSheetSource[] = [];
    if (sources.length <= cells) picks.push(...sources);
    else {
      for (let i = 0; i < cells; i++) picks.push(sources[Math.round((i * (sources.length - 1)) / (cells - 1))]);
    }
    const images = await Promise.all(picks.map((p) => loadImage(p.dataUrl)));
    const valid = picks.map((p, i) => ({ p, img: images[i] })).filter((x) => x.img);
    if (valid.length === 0) return '';

    const cols = Math.ceil(Math.sqrt(valid.length));
    const rows = Math.ceil(valid.length / cols);
    const cellW = 320, cellH = 180, pad = 6, capH = 18;
    const canvas = document.createElement('canvas');
    canvas.width = cols * (cellW + pad) + pad;
    canvas.height = rows * (cellH + capH + pad) + pad;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    valid.forEach(({ p, img }, i) => {
      const cx = pad + (i % cols) * (cellW + pad);
      const cy = pad + Math.floor(i / cols) * (cellH + capH + pad);
      try { ctx.drawImage(img as CanvasImageSource, cx, cy, cellW, cellH); } catch { /* tainted/failed */ }
      ctx.fillStyle = '#00f0ff';
      const cap = `t=${p.t.toFixed(2)}s${p.caption ? '  ' + p.caption : ''}`;
      ctx.fillText(cap.slice(0, 46), cx + 2, cy + cellH + 2);
    });
    try { return canvas.toDataURL('image/png'); } catch { return ''; }
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
