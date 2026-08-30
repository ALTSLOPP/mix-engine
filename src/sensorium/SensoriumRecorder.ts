import type { KeyframeArtifact } from './types';
import type { ContactSheetSource } from './VisionReportBuilder';

/**
 * SENSORIUM — SensoriumRecorder.
 *
 * Owns the visual capture: a MediaRecorder over the canvas captureStream for the
 * WebM, and periodic PNG keyframe extraction for vision-model thumbnails + the
 * contact sheet.
 *
 * Fixes vs the original PLAYBACK recorder:
 *  • Keyframe artifact paths now match where the server actually writes them
 *    (`/<root>/<rec>/keyframes/<file>` — the old code dropped the `keyframes/`
 *    segment, so every frame handed to the model 404'd).
 *  • Keyframe filenames are generated identically on client + server so the URL is
 *    guaranteed to resolve.
 *  • MediaRecorder.stop() is awaited with a timeout so a stalled recorder can never
 *    hang the whole run.
 */
export class SensoriumRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaChunks: Blob[] = [];
  private recordMime = '';
  private readonly keyframes: KeyframeArtifact[] = [];
  private readonly sheetSources: ContactSheetSource[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly recordingName: string,
    /** URL prefix the artifacts will be served from, e.g. "/sensorium". */
    private readonly publicRoot: string,
    /** API base for uploads, e.g. "/api/sensorium". */
    private readonly apiBase: string,
  ) {}

  /** Start video capture. Returns false (and degrades to telemetry-only) if unavailable. */
  async startVideo(fps: number): Promise<boolean> {
    let stream: MediaStream;
    try {
      stream = this.canvas.captureStream(fps);
    } catch (err) {
      console.warn('[SENSORIUM] canvas.captureStream failed:', err);
      return false;
    }
    const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    if (!mime) { console.warn('[SENSORIUM] no supported MediaRecorder mime'); return false; }
    this.recordMime = mime;
    try {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    } catch (err) {
      console.warn('[SENSORIUM] MediaRecorder construction failed:', err);
      return false;
    }
    this.mediaChunks = [];
    this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) this.mediaChunks.push(e.data); };
    this.mediaRecorder.start(250);
    return true;
  }

  /** Grab a single keyframe at time `t`. Stores it for the contact sheet and POSTs it. */
  captureKeyframe(t: number, caption?: string): void {
    let dataUrl: string;
    try {
      dataUrl = this.canvas.toDataURL('image/png');
    } catch {
      return; // tainted canvas — skip silently
    }
    const fileName = SensoriumRecorder.frameName(t);
    const path = `${this.publicRoot}/${this.recordingName}/keyframes/${fileName}`;
    this.keyframes.push({ t, path, note: caption });
    this.sheetSources.push({ t, dataUrl, caption });
    // Bound the in-memory dataURLs for the contact sheet on long runs — decimate to a
    // ~uniform spread by dropping every other frame once we exceed the cap. (Keyframe
    // FILES are still all uploaded; only the montage source set is capped.)
    if (this.sheetSources.length > 160) {
      for (let i = this.sheetSources.length - 2; i >= 0; i -= 2) this.sheetSources.splice(i, 1);
    }
    void fetch(`${this.apiBase}/keyframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recording: this.recordingName, t, dataUrl }),
    }).catch(() => {});
  }

  /** Stop the recorder and POST the assembled WebM. Returns the public URL ('' if none). */
  async stopVideo(): Promise<string> {
    const rec = this.mediaRecorder;
    if (!rec || rec.state === 'inactive') return '';
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      rec.onstop = done;
      // Safety net: never hang the run if onstop doesn't fire.
      const timer = setTimeout(done, 3000);
      rec.onstop = () => { clearTimeout(timer); resolve(); };
      try { rec.stop(); } catch { clearTimeout(timer); resolve(); }
    });
    if (!this.mediaChunks.length) return '';
    const blob = new Blob(this.mediaChunks, { type: this.recordMime });
    if (blob.size < 1024) return ''; // empty/degenerate capture (e.g. headless w/o real frames)
    const dataUrl = await blobToDataUrl(blob);
    // Only report the URL if the upload actually persisted the file, so the report
    // never points a vision model at a video that isn't there.
    const res = await fetch(`${this.apiBase}/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recording: this.recordingName, mime: this.recordMime, dataUrl }),
    }).catch(() => null);
    return res && res.ok ? `${this.publicRoot}/${this.recordingName}/video.webm` : '';
  }

  /** Upload a pre-rendered contact sheet PNG (data URL). Returns its public URL ('' on failure). */
  async uploadContactSheet(dataUrl: string): Promise<string> {
    if (!dataUrl) return '';
    try {
      const res = await fetch(`${this.apiBase}/contactsheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording: this.recordingName, dataUrl }),
      });
      return res.ok ? `${this.publicRoot}/${this.recordingName}/contact-sheet.png` : '';
    } catch { return ''; }
  }

  getKeyframes(): KeyframeArtifact[] { return this.keyframes; }
  getContactSheetSources(): ContactSheetSource[] { return this.sheetSources; }

  /** Shared client/server filename so the artifact URL always resolves. */
  static frameName(t: number): string {
    return `frame_${t.toFixed(2).replace('.', '_')}.png`;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
