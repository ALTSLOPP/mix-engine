import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { AudioMixer, type AudioBus, type TriggerZoneConfig } from './AudioMixer';
import { StreamingAudioBank } from './StreamingAudioBank';
import { InteractiveMusicDirector } from './InteractiveMusicDirector';

/**
 * AudioManager.ts — positional audio for the engine, with spatial occlusion.

 *
 * The IDE drives this via the `play_sound` / `attach_sound` AI commands: drop a .mp3 /
 * .wav / .ogg into `public/audio/` and call `play_sound { src, x, y, z, volume, loop }`
 * to fire a one-shot at a world position, or `attach_sound { entityId, src }` to bind a
 * source to a moving entity (footsteps, engine hum, dialogue). The listener is synced
 * to the main camera every frame so panning + distance attenuation "just work".
 *
 * Uses the Web Audio API directly (not three.js PositionalAudio) so each source is a
 * tiny graph: AudioBufferSourceNode → PannerNode (HRTF) → BiquadFilter (occlusion
 * lowpass) → master GainNode → destination. The lowpass filter is inserted between the
 * panner and the master gain; its cutoff frequency is driven by the occlusion system
 * each frame (a ray from the listener to the source — if a wall is between them, the
 * cutoff drops and the gain is attenuated, modeling the muffling effect of a building).
 *
 * Coordinates are ENGINE space for the listener and positional sources (the camera and
 * entity meshes are already in engine space), so relative geometry is correct without
 * any world-origin conversion. Attached sounds read their entity's mesh position each
 * frame and write it to the PannerNode.
 */

interface ActiveSource {
  node: AudioBufferSourceNode;
  panner: PannerNode;
  /** Occlusion lowpass filter — inserted between panner and gain. */
  filter: BiquadFilterNode;
  gain: GainNode;
  /** User-authored volume (from PlaySoundOptions.volume) — the occlusion pass
   *  attenuates relative to this and restores back to it when un-occluded. */
  baseVolume: number;
  entityId?: EntityId;
  /** WORLD-space position for a static positional source — re-projected to engine space
   *  every frame so it doesn't drift when the floating origin shifts. */
  worldPos?: THREE.Vector3;
  loop: boolean;
  src: string;
  /** Whether this source participates in the occlusion pass (positional only). */
  positional: boolean;
}

export interface PlaySoundOptions {
  volume?: number;
  loop?: boolean;
  /** World-space position; omit for a non-positional (flat) source. */
  x?: number; y?: number; z?: number;
  /** Reference distance for distance attenuation (metres). */
  refDistance?: number;
  /** Max distance for distance attenuation. */
  maxDistance?: number;
  /** Playback rate (1 = normal). */
  playbackRate?: number;
  /** Route through a specific mixer bus (default: 'sfx'). */
  bus?: AudioBus;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private listener: AudioListener | null = null;
  private readonly active = new Set<ActiveSource>();
  private readonly cache = new Map<string, AudioBuffer>();
  private masterVolume = 1;
  private _mixer: AudioMixer | null = null;
  private readonly sceneManager: SceneManager;
  private readonly worldOrigin: WorldOrigin;
  private physicsWorld: PhysicsWorld | null = null;
  private occlusionEnabled = true;
  private readonly _eng = new THREE.Vector3();
  private readonly _listenerPos = new THREE.Vector3();
  private readonly _sourcePos = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _worldPos = new THREE.Vector3();
  readonly streaming = new StreamingAudioBank();
  readonly musicDirector = new InteractiveMusicDirector(this.streaming);
  private listenerObject: THREE.Object3D | null = null;
  maxVoices = 32;

  constructor(sceneManager: SceneManager, worldOrigin: WorldOrigin) {
    this.sceneManager = sceneManager;
    this.worldOrigin = worldOrigin;
  }

  /** Inject the physics world for the occlusion raycast pass. Called by the Engine
   *  after PhysicsWorld.create() completes (the constructor runs before that). */
  setPhysicsWorld(pw: PhysicsWorld): void { this.physicsWorld = pw; }
  setOcclusionEnabled(on: boolean): void { this.occlusionEnabled = on; }
  /** Override the camera listener with an entity/object (VR head, possessed pawn, etc.). */
  setListenerObject(object: THREE.Object3D | null): void { this.listenerObject = object; }

  /** Lazily create the AudioContext on first use (autoplay policies require a user gesture). */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.listener = this.ctx.listener;
      this._mixer = new AudioMixer(this.ctx, this.master, {
        sceneManager: this.sceneManager,
        worldOrigin: this.worldOrigin,
      });
    } catch (err) {
      console.warn('[AudioManager] Web Audio unavailable — sounds disabled:', err);
      this.ctx = null;
    }
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ensureContext();
  }

  /** Master mix node, exposed for engine-owned post-mix DSP such as reverb zones. */
  get outputNode(): GainNode | null {
    this.ensureContext();
    return this.master;
  }

  get mixer(): AudioMixer | null {
    return this._mixer;
  }

  /** Call from a user-gesture handler to unlock audio on browsers that require it. */
  resume(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  setMasterVolume(v: number): void {
    this.masterVolume = THREE.MathUtils.clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.masterVolume;
  }
  getMasterVolume(): number {
    return this.masterVolume;
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    this.ensureContext();
    this._mixer?.setBusVolume(bus, volume);
  }

  getBusVolume(bus: AudioBus): number {
    return this._mixer?.getBusVolume(bus) ?? 0;
  }

  /** Crossfade to a new music track. */
  async crossfadeMusic(src: string, duration = 2): Promise<void> {
    // Long-form music must stay on the HTMLMediaElement streaming path. Decoding it
    // through AudioMixer's AudioBuffer path retains the entire track in memory and
    // defeats the streaming bank's memory guarantee.
    const id = `music:${src}`;
    this.streaming.crossfade(id, src, duration, { loop: true });
  }

  /** Stop the current music with a fade-out. */
  async stopMusic(fadeOut = 1): Promise<void> {
    this.streaming.stopMusic(fadeOut);
  }

  get currentMusicSrc(): string | null {
    return this.streaming.currentMusicSrc;
  }

  /** Add an audio trigger zone (fires enter/exit sounds based on camera proximity). */
  addTriggerZone(config: TriggerZoneConfig): void {
    this.ensureContext();
    this._mixer?.addTriggerZone(config);
  }

  removeTriggerZone(id: string): void {
    this._mixer?.removeTriggerZone(id);
  }

  /** Pre-load a sound so the first play() has no fetch latency. */
  async preload(src: string): Promise<void> {
    if (this.cache.has(src)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(buf);
      this.cache.set(src, audioBuf);
    } catch (err) {
      console.warn(`[AudioManager] Failed to load '${src}':`, err);
    }
  }

  /** Play a sound at a world position (positional) or flat (no coords). */
  async play(src: string, opts: PlaySoundOptions = {}): Promise<ActiveSource | null> {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return null;
    await this.preload(src);
    const buffer = this.cache.get(src);
    if (!buffer) return null;

    // Voice virtualization: cap concurrent audio sources to prevent browser audio pipeline overload
    if (this.active.size >= this.maxVoices) {
      for (const item of this.active) {
        if (!item.loop) {
          try { item.node.stop(); } catch {}
          this.active.delete(item);
          break;
        }
      }
    }

    const bus = opts.bus ?? 'sfx';
    const busGain = this._mixer ? this._mixer[bus] : this.master;

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = !!opts.loop;
    node.playbackRate.value = Math.max(0.1, opts.playbackRate ?? 1);

    const gain = ctx.createGain();
    const baseVolume = THREE.MathUtils.clamp(opts.volume ?? 1, 0, 1);
    gain.gain.value = baseVolume;

    // Occlusion lowpass filter (inserted between panner and gain for positional sources).
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 22050; // fully open (no occlusion) by default
    filter.Q.value = 0.7;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = opts.refDistance ?? 2;
    panner.maxDistance = opts.maxDistance ?? 200;
    panner.rolloffFactor = 1.2;
    const isPositional = opts.x !== undefined && opts.y !== undefined && opts.z !== undefined;
    if (isPositional) {
      this.worldOrigin.toEngineSpaceInto(this._eng, new THREE.Vector3(opts.x, opts.y, opts.z));
      panner.positionX.value = this._eng.x;
      panner.positionY.value = this._eng.y;
      panner.positionZ.value = this._eng.z;
    }

    node.connect(gain);
    if (isPositional) {
      gain.connect(filter);
      filter.connect(panner);
      panner.connect(busGain);
    } else {
      gain.connect(busGain);
    }
    node.start();

    const active: ActiveSource = {
      node, panner, filter, gain, baseVolume, loop: !!opts.loop, src,
      worldPos: isPositional ? new THREE.Vector3(opts.x, opts.y, opts.z) : undefined,
      positional: isPositional,
    };
    this.active.add(active);

    node.onended = () => {
      this.active.delete(active);
      try { panner.disconnect(); } catch { /* already */ }
      try { filter.disconnect(); } catch { /* already */ }
      try { gain.disconnect(); } catch { /* already */ }
    };
    return active;
  }

  /** Bind a sound to a moving entity — the panner follows the entity each frame. */
  async attachToEntity(entityId: EntityId, src: string, opts: PlaySoundOptions = {}): Promise<ActiveSource | null> {
    const active = await this.play(src, { ...opts, loop: opts.loop ?? true });
    if (active) {
      active.entityId = entityId;
      // Seed the panner at the entity's current engine-space position.
      const rb = this.sceneManager.getRigidBody(entityId);
      if (rb) {
        const p = rb.mesh.position;
        active.panner.positionX.value = p.x;
        active.panner.positionY.value = p.y;
        active.panner.positionZ.value = p.z;
      }
    }
    return active;
  }

  /** Stop all sources matching `src` and/or entityId. */
  stop(opts: { src?: string; entityId?: EntityId } = {}): void {
    for (const a of [...this.active]) {
      if (opts.src && a.src !== opts.src) continue;
      if (opts.entityId !== undefined && a.entityId !== opts.entityId) continue;
      try { a.node.stop(); } catch { /* already ended */ }
      this.active.delete(a);
    }
  }

  /** Stop everything. */
  stopAll(): void {
    for (const a of [...this.active]) {
      try { a.node.stop(); } catch { /* already ended */ }
    }
    this.active.clear();
  }

  /** Loop hook — sync the listener to the camera and attached sources to their entities. */
  update(camera: THREE.Camera, _dt: number): void {
    // Streaming BGM fades are cooperative — nothing interpolates unless the bank is
    // ticked. This ran before the fade loop existed and left `streaming` inert.
    this.streaming.update(_dt);
    this.musicDirector.update(_dt);
    if (!this.ctx || !this.listener) return;
    const listenerObject = this.listenerObject?.parent ? this.listenerObject : camera;
    listenerObject.getWorldPosition(this._listenerPos);
    this.listener.positionX.value = this._listenerPos.x;
    this.listener.positionY.value = this._listenerPos.y;
    this.listener.positionZ.value = this._listenerPos.z;

    // Tick trigger zones with the camera's world-space position.
    if (this._mixer) {
      this.worldOrigin.toWorldSpaceInto(this._worldPos, this._listenerPos);
      this._mixer.update(this._worldPos);
    }
    listenerObject.getWorldQuaternion(_listenerQuat);
    const fwd = _fwd.set(0, 0, -1).applyQuaternion(_listenerQuat);
    const up = _up.set(0, 1, 0).applyQuaternion(_listenerQuat);
    // Some browsers expose the matrix setter directly; setting forward/up is portable.
    if (this.listener.forwardX) {
      this.listener.forwardX.value = fwd.x;
      this.listener.forwardY.value = fwd.y;
      this.listener.forwardZ.value = fwd.z;
      this.listener.upX.value = up.x;
      this.listener.upY.value = up.y;
      this.listener.upZ.value = up.z;
    } else {
      // Legacy API: setOrientation(fx,fy,fz, ux,uy,uz).
      (this.listener as unknown as { setOrientation: (a: number, b: number, c: number, d: number, e: number, f: number) => void })
        .setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }

    // Re-anchor positional sources every frame so they stay correct across origin shifts.
    for (const a of this.active) {
      if (a.entityId !== undefined) {
        // Attached source — follow the entity (engine space).
        const rb = this.sceneManager.getRigidBody(a.entityId);
        if (!rb) {
          // Entity gone — stop the attached source.
          try { a.node.stop(); } catch { /* already */ }
          this.active.delete(a);
          continue;
        }
        const p = rb.mesh.position;
        a.panner.positionX.value = p.x;
        a.panner.positionY.value = p.y;
        a.panner.positionZ.value = p.z;
      } else if (a.worldPos) {
        // Static positional source — re-project its WORLD position into engine space so a
        // floating-origin shift (which moves the listener) doesn't make it drift.
        this.worldOrigin.toEngineSpaceInto(this._eng, a.worldPos);
        a.panner.positionX.value = this._eng.x;
        a.panner.positionY.value = this._eng.y;
        a.panner.positionZ.value = this._eng.z;
      }

      // Spatial occlusion: cast a ray from the listener to the source; if it hits a
      // collider before reaching the source, the source is occluded (muffled). The
      // gain attenuation is applied as a MULTIPLIER on the user's baseVolume (the old
      // code wrote an absolute 0.3–1.0 value, which could make a quiet source louder
      // than intended and never restored it once the line of sight cleared).
      if (a.positional && this.occlusionEnabled && this.physicsWorld) {
        this._sourcePos.set(a.panner.positionX.value, a.panner.positionY.value, a.panner.positionZ.value);
        this._dir.copy(this._sourcePos).sub(this._listenerPos);
        const dist = this._dir.length();
        if (dist > 1e-3) {
          this._dir.multiplyScalar(1 / dist);
          const hit = this.physicsWorld.raycast(this._listenerPos, this._dir, dist - 0.5, true);
          // Target gain — either the user volume (un-occluded) or that volume scaled by
          // an occlusion factor (0.3 = fully blocked, 1.0 = barely occluded).
          const occlusionMul = hit ? THREE.MathUtils.lerp(0.3, 1.0, Math.min(1, hit.toi / dist)) : 1.0;
          const targetGain = a.baseVolume * occlusionMul;
          a.gain.gain.value = THREE.MathUtils.lerp(a.gain.gain.value, targetGain, 0.1);
          const cutoff = hit ? THREE.MathUtils.lerp(400, 22050, Math.min(1, hit.toi / dist)) : 22050;
          a.filter.frequency.value = THREE.MathUtils.lerp(a.filter.frequency.value, cutoff, 0.1);
        }
      }
    }
  }

  dispose(): void {
    this.stopAll();
    this.musicDirector.dispose();
    this._mixer?.dispose();
    this._mixer = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.listener = null;
    }
    this.cache.clear();
  }
}

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _listenerQuat = new THREE.Quaternion();
