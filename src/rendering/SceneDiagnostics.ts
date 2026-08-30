import * as THREE from 'three';

/**
 * SceneDiagnostics.ts — render-grounded "visual grounding" for agents.
 *
 * The MIX Engine is driven by LLM coding agents that CANNOT SEE the screen. HELM lets
 * them author and inspect scene *state* (entity exists, position, count) — but state is
 * not pixels. The entire bug class this project has fought (a 1 cm-tall invisible
 * character, a 238 m-tall mis-normalised one, a T-posed mesh, a pitch-black frame, a
 * blown-out exposure, an object fully behind a wall) all PASS a state check while the
 * frame is broken. An agent with no human at the screen has no way to notice.
 *
 * This module gives them eyes, as text. It renders the live scene into its OWN small
 * offscreen targets (so it works even when the on-screen canvas is backgrounded/zero-size
 * in a headless agent session) and reports:
 *
 *   • frame health   — average luminance + black / blown-out fractions (lighting/exposure
 *                       broken? camera staring into the void?).
 *   • per-entity      — OCCLUSION-AWARE on-screen pixel coverage via a flat-colour id pass
 *                       (each entity gets a unique colour, everything else is black; the
 *                       histogram of the readback is exactly how many un-occluded pixels
 *                       each entity actually draws), plus its on-screen centroid and a
 *                       world-space size sanity check.
 *   • anomalies       — plain-English flags an agent can act on ("#5 'ayo' renders 0 px —
 *                       invisible/occluded/too small", "frame is almost entirely black").
 *
 * Surfaced through HELM as op:'observe' and the entity_visible / frame_renders assertions,
 * so an agent can finally close the loop: build → observe → assert it actually renders.
 */

export interface DiagEntity {
  id: number;
  /** The entity's root Object3D (engine space — same frame as the live camera). */
  object: THREE.Object3D;
  name?: string;
  kind?: string;
}

export interface EntityDiag {
  id: number;
  name?: string;
  kind?: string;
  /** Renders ≥1 un-occluded pixel this frame. */
  visible: boolean;
  /** Un-occluded pixels the entity draws (in the diagnostic viewport). */
  coveragePx: number;
  /** Coverage as a fraction of the whole frame (0..1). */
  coveragePct: number;
  /** True if the entity projects in front of the camera within the frustum. */
  onScreen: boolean;
  behindCamera: boolean;
  /** Normalised on-screen position (x right, y down, [0,1]); pixel centroid when visible,
   *  else the projected AABB centre. */
  screen?: { x: number; y: number };
  /** World-space bounding-box size (metres). */
  sizeM: { x: number; y: number; z: number };
  maxDimM: number;
  /** Plain-English problem flags (empty = looks fine). */
  flags: string[];
}

export interface FrameHealth {
  width: number;
  height: number;
  /** Mean luminance, 0..255. */
  avgLuminance: number;
  /** Fraction of near-black / near-white pixels (0..1). */
  blackPct: number;
  brightPct: number;
  isBlack: boolean;
  isBlownOut: boolean;
}

export interface DiagReport {
  frame: FrameHealth;
  entities: EntityDiag[];
  anomalies: string[];
}

export interface DiagOptions {
  width?: number;
  height?: number;
  /** Coverage below this fraction is flagged 'barely_visible' (default 0.0008 ≈ 0.08%). */
  prominentMinPct?: number;
  /** Max dimension under this (metres) → 'tiny' (default 0.05). */
  tinyMaxDimM?: number;
  /** Max dimension over this (metres) → 'huge' (default 60). */
  hugeMaxDimM?: number;
}

const DEFAULT_W = 320;
const DEFAULT_H = 200;

/** Kinds that are world-scale on purpose — never flag THEM as "suspiciously large"
 *  (a 600 m map is fine; a 238 m character is the bug we actually want to catch). */
const LARGE_BY_DESIGN = new Set(['mapModel', 'map', 'terrain', 'ground', 'dojo', 'sky', 'water', 'navmesh', 'water_plane']);

/** Flat-colour id material: writes a raw rgb id straight to a NoColorSpace target so the
 *  readback bytes are exact (no tone-map / no OETF — it's a plain ShaderMaterial output). */
function makeIdMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uId: { value: new THREE.Vector3(0, 0, 0) } },
    vertexShader: /* glsl */ `
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uId;
      void main() { gl_FragColor = vec4(uId, 1.0); }
    `,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export class SceneDiagnostics {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private colorRT?: THREE.WebGLRenderTarget;
  private idRT?: THREE.WebGLRenderTarget;
  private readonly blackMat = makeIdMaterial();
  /** Pool of id materials reused across calls (index → material), index 0 is `blackMat`. */
  private readonly idMatPool: THREE.ShaderMaterial[] = [];
  private readonly _box = new THREE.Box3();
  private readonly _size = new THREE.Vector3();
  private readonly _center = new THREE.Vector3();
  private readonly _ndc = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  /** Render-ground the scene and report frame health + per-entity visibility. */
  analyze(entities: DiagEntity[], opts: DiagOptions = {}): DiagReport {
    const W = Math.max(16, opts.width ?? DEFAULT_W);
    const H = Math.max(16, opts.height ?? DEFAULT_H);
    // Editor overlays (the TransformControls gizmo) are scene children whose custom
    // updateMatrixWorld assumes the editor's own render path — drawing them here throws,
    // and they aren't "what the game looks like" anyway. Detach them around our renders.
    const reattach = this.detachEditorHelpers();
    let frame: FrameHealth, coverage: Map<number, { px: number; sumX: number; sumY: number }>;
    try {
      frame = this.renderFrameHealth(W, H);
      coverage = this.renderIdCoverage(entities, W, H);
    } finally {
      reattach();
    }
    const total = W * H;
    const entitiesOut: EntityDiag[] = entities.map((e, i) => {
      const cov = coverage.get(i + 1);
      const px = cov?.px ?? 0;
      const geom = this.projectGeometry(e.object);
      const screen = px > 0 && cov
        ? { x: +(cov.sumX / cov.px / W).toFixed(3), y: +(1 - cov.sumY / cov.px / H).toFixed(3) }
        : geom.screen;
      const d: EntityDiag = {
        id: e.id,
        name: e.name,
        kind: e.kind,
        visible: px > 0,
        coveragePx: px,
        coveragePct: +(px / total).toFixed(5),
        onScreen: px > 0 || geom.onScreen,
        behindCamera: geom.behindCamera,
        screen,
        sizeM: { x: +geom.size.x.toFixed(2), y: +geom.size.y.toFixed(2), z: +geom.size.z.toFixed(2) },
        maxDimM: +geom.maxDim.toFixed(2),
        flags: [],
      };
      d.flags = SceneDiagnostics.flagsFor(d, opts);
      return d;
    });
    const anomalies = SceneDiagnostics.collectAnomalies(frame, entitiesOut);
    return { frame, entities: entitiesOut, anomalies };
  }

  /** Temporarily lift editor-only overlays (TransformControls gizmo, anything flagged
   *  userData.editorOnly) out of the scene graph for a diagnostic render, restoring them
   *  after. Synchronous between detach and restore, so the engine loop can't interleave. */
  private detachEditorHelpers(): () => void {
    const removed: THREE.Object3D[] = [];
    for (const c of [...this.scene.children]) {
      const name = (c as { isTransformControlsRoot?: boolean }).isTransformControlsRoot
        ? 'TransformControlsRoot'
        : (c.constructor?.name ?? c.type ?? '');
      if (/TransformControls/.test(name) || c.userData?.editorOnly) {
        this.scene.remove(c);
        removed.push(c);
      }
    }
    return () => { for (const c of removed) this.scene.add(c); };
  }

  // ── frame health ───────────────────────────────────────────────────────────

  private renderFrameHealth(W: number, H: number): FrameHealth {
    const rt = this.ensureColorRT(W, H);
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);            // real materials → ACES + sRGB into rt
    const buf = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    r.setRenderTarget(prevTarget);
    let sum = 0, black = 0, bright = 0;
    const n = W * H;
    for (let i = 0; i < buf.length; i += 4) {
      const lum = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      sum += lum;
      if (lum < 8) black++;
      else if (lum > 250) bright++;
    }
    const avg = sum / n;
    const blackPct = black / n;
    const brightPct = bright / n;
    return {
      width: W, height: H,
      avgLuminance: +avg.toFixed(1),
      blackPct: +blackPct.toFixed(3),
      brightPct: +brightPct.toFixed(3),
      isBlack: avg < 5 || blackPct > 0.985,
      isBlownOut: brightPct > 0.8,
    };
  }

  // ── occlusion-aware id coverage ──────────────────────────────────────────────

  private renderIdCoverage(entities: DiagEntity[], W: number, H: number): Map<number, { px: number; sumX: number; sumY: number }> {
    const rt = this.ensureIdRT(W, H);
    const r = this.renderer;
    // Stash every mesh material, blanket the scene black, then paint each entity's
    // meshes a unique id colour. A single render gives occlusion for free (a nearer
    // black occluder overwrites the entity's pixels via the depth test).
    const stash: { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { stash.push({ mesh: m, mat: m.material }); m.material = this.blackMat; }
    });
    entities.forEach((e, i) => {
      const mat = this.idMaterialFor(i + 1);
      e.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat; });
    });

    const prevTarget = r.getRenderTarget();
    const prevBg = this.scene.background;
    const prevAutoClear = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevClearAlpha = r.getClearAlpha();
    this.scene.background = null;
    r.autoClear = true;
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(rt);
    r.clear();
    r.render(this.scene, this.camera);

    const buf = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);

    // Restore state + every material.
    this.scene.background = prevBg;
    r.autoClear = prevAutoClear;
    r.setClearColor(prevClear, prevClearAlpha);
    r.setRenderTarget(prevTarget);
    for (const s of stash) s.mesh.material = s.mat;

    // Histogram exact id colours → pixel count + centroid (readback rows are bottom-up).
    const hist = new Map<number, { px: number; sumX: number; sumY: number }>();
    for (let p = 0; p < buf.length; p += 4) {
      const id = buf[p] + buf[p + 1] * 256 + buf[p + 2] * 65536;
      if (id === 0) continue;
      const px = (p >> 2) % W;
      const py = (p >> 2) / W | 0;
      const e = hist.get(id);
      if (e) { e.px++; e.sumX += px + 0.5; e.sumY += py + 0.5; }
      else hist.set(id, { px: 1, sumX: px + 0.5, sumY: py + 0.5 });
    }
    return hist;
  }

  private idMaterialFor(index: number): THREE.ShaderMaterial {
    let mat = this.idMatPool[index];
    if (!mat) { mat = makeIdMaterial(); this.idMatPool[index] = mat; }
    (mat.uniforms.uId.value as THREE.Vector3).set(
      (index & 0xff) / 255,
      ((index >> 8) & 0xff) / 255,
      ((index >> 16) & 0xff) / 255,
    );
    return mat;
  }

  // ── geometry (frame-consistent: object + camera both in engine space) ────────

  private projectGeometry(object: THREE.Object3D): {
    onScreen: boolean; behindCamera: boolean; screen?: { x: number; y: number };
    size: THREE.Vector3; maxDim: number;
  } {
    this._box.setFromObject(object);
    const empty = this._box.isEmpty() || !isFinite(this._box.min.x) || !isFinite(this._box.max.x);
    if (empty) return { onScreen: false, behindCamera: false, size: new THREE.Vector3(), maxDim: 0 };
    this._box.getSize(this._size);
    this._box.getCenter(this._center);
    const size = this._size.clone();
    const maxDim = Math.max(size.x, size.y, size.z);
    // Front/behind from the camera's own forward axis (ndc alone flips sign behind the
    // camera, so test the dot product directly), then project the centre to NDC for x/y.
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const behind = this._center.clone().sub(this.camera.position).dot(camFwd) <= 0;
    this._ndc.copy(this._center).project(this.camera);
    const inNdc = Math.abs(this._ndc.x) <= 1 && Math.abs(this._ndc.y) <= 1;
    const onScreen = !behind && inNdc;
    const screen = behind ? undefined : {
      x: +THREE.MathUtils.clamp(this._ndc.x * 0.5 + 0.5, 0, 1).toFixed(3),
      y: +THREE.MathUtils.clamp(-this._ndc.y * 0.5 + 0.5, 0, 1).toFixed(3),
    };
    return { onScreen, behindCamera: behind, screen, size, maxDim };
  }

  // ── pure helpers (unit-testable without a GL context) ────────────────────────

  /** Compute the problem flags for one entity from its measured numbers. */
  static flagsFor(d: EntityDiag, opts: DiagOptions = {}): string[] {
    const flags: string[] = [];
    const tiny = opts.tinyMaxDimM ?? 0.05;
    const huge = opts.hugeMaxDimM ?? 60;
    const prominent = opts.prominentMinPct ?? 0.0008;
    if (d.coveragePx === 0) {
      flags.push(d.behindCamera ? 'behind_camera' : d.onScreen ? 'occluded_or_unrendered' : 'offscreen');
      flags.push('invisible');
    } else if (d.coveragePct < prominent) {
      flags.push('barely_visible');
    }
    if (d.maxDimM > 0 && d.maxDimM < tiny) flags.push('tiny');
    if (d.maxDimM > huge && !LARGE_BY_DESIGN.has(d.kind ?? '')) flags.push('huge');
    return flags;
  }

  /** Roll measured entities + frame health up into plain-English anomalies for an agent. */
  static collectAnomalies(frame: FrameHealth, entities: EntityDiag[]): string[] {
    const out: string[] = [];
    if (frame.isBlack) {
      out.push(`Frame is almost entirely black (avg luminance ${frame.avgLuminance}/255, ${Math.round(frame.blackPct * 100)}% black pixels) — no lighting, the camera is aimed into the void, or everything is culled.`);
    } else if (frame.isBlownOut) {
      out.push(`Frame is blown out (${Math.round(frame.brightPct * 100)}% near-white pixels) — exposure/bloom too high, or a full-screen bright object.`);
    }
    for (const e of entities) {
      const who = `#${e.id}${e.name ? ` "${e.name}"` : ''}${e.kind ? ` (${e.kind})` : ''}`;
      // Off-screen / behind-camera is NORMAL when the camera is aimed elsewhere — not an
      // anomaly (it stays in per-entity data + drives entity_visible assertions, which is
      // where an agent expresses "I expected to see this"). Only the genuinely-wrong case
      // surfaces here: the entity IS in the frustum yet still draws nothing.
      if (e.flags.includes('occluded_or_unrendered')) {
        out.push(`${who}: in the camera's view but renders 0 px — fully occluded, mis-scaled, or not rendering (bad/zero-scale or unlit material). Worth checking.`);
      } else if (e.flags.includes('barely_visible')) {
        out.push(`${who}: only ${e.coveragePx} px (${(e.coveragePct * 100).toFixed(2)}%) on screen — barely visible; may be very far or mostly occluded.`);
      }
      if (e.flags.includes('tiny')) out.push(`${who}: max dimension ${e.maxDimM} m — suspiciously SMALL (sub-5 cm). Likely a scale/normalise bug (e.g. an un-normalised import).`);
      if (e.flags.includes('huge')) out.push(`${who}: max dimension ${e.maxDimM} m — suspiciously LARGE for its kind. Likely a scale/normalise bug.`);
    }
    return out;
  }

  /** One-screen, token-efficient rendering of a report for an agent to reason over. */
  static summarize(report: DiagReport): string {
    const f = report.frame;
    const lines: string[] = [];
    lines.push(`frame ${f.width}×${f.height}: avg lum ${f.avgLuminance}/255` +
      (f.isBlack ? ' — BLACK' : f.isBlownOut ? ' — BLOWN OUT' : ' — ok'));
    const vis = report.entities.filter((e) => e.visible).length;
    lines.push(`entities: ${report.entities.length} observed, ${vis} visible on screen`);
    for (const e of report.entities.slice(0, 40)) {
      const tag = e.visible ? `${(e.coveragePct * 100).toFixed(2)}% @ (${e.screen?.x ?? '?'}, ${e.screen?.y ?? '?'})` : 'NOT VISIBLE';
      lines.push(`  #${e.id}${e.name ? ` "${e.name}"` : ''}${e.kind ? ` ${e.kind}` : ''}: ${tag}` +
        (e.flags.length ? ` [${e.flags.join(',')}]` : ''));
    }
    if (report.anomalies.length) {
      lines.push('anomalies:');
      for (const a of report.anomalies) lines.push(`  ⚠ ${a}`);
    } else {
      lines.push('anomalies: none');
    }
    return lines.join('\n');
  }

  // ── render targets ───────────────────────────────────────────────────────────

  private ensureColorRT(W: number, H: number): THREE.WebGLRenderTarget {
    if (!this.colorRT) {
      this.colorRT = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
      this.colorRT.texture.colorSpace = THREE.SRGBColorSpace; // display-referred readback bytes
      this.colorRT.texture.minFilter = THREE.NearestFilter;
      this.colorRT.texture.magFilter = THREE.NearestFilter;
    } else if (this.colorRT.width !== W || this.colorRT.height !== H) {
      this.colorRT.setSize(W, H);
    }
    return this.colorRT;
  }

  private ensureIdRT(W: number, H: number): THREE.WebGLRenderTarget {
    if (!this.idRT) {
      this.idRT = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
      this.idRT.texture.colorSpace = THREE.NoColorSpace;     // exact raw id bytes
      this.idRT.texture.minFilter = THREE.NearestFilter;
      this.idRT.texture.magFilter = THREE.NearestFilter;
      this.idRT.texture.generateMipmaps = false;
    } else if (this.idRT.width !== W || this.idRT.height !== H) {
      this.idRT.setSize(W, H);
    }
    return this.idRT;
  }

  dispose(): void {
    this.colorRT?.dispose();
    this.idRT?.dispose();
    this.blackMat.dispose();
    for (const m of this.idMatPool) m?.dispose();
    this.idMatPool.length = 0;
  }
}
