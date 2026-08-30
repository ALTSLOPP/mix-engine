import * as THREE from 'three';
import type { EntityId, SceneManager } from '../ecs/SceneManager';
import type { WorldOrigin } from '../streaming/WorldOrigin';

export type AudioBus = 'music' | 'sfx' | 'ambient' | 'voice';

interface BusChannel {
  gain: GainNode;
  volume: number;
}

interface CrossfadeState {
  fromSrc: string | null;
  toSrc: string;
  progress: number;
  duration: number;
  fromGain?: GainNode;
  toGain: GainNode;
  toNode: AudioBufferSourceNode;
  resolve: () => void;
}

export interface TriggerZoneConfig {
  id: string;
  /** World-space centre. */
  x: number; y: number; z: number;
  /** Radius in metres. */
  radius: number;
  /** Sound to play on enter (optional). */
  enterSound?: string;
  /** Sound to play on exit (optional). */
  exitSound?: string;
  /** Sound to loop while inside (optional). */
  ambientSound?: string;
  /** Bus for the ambient loop. */
  bus?: AudioBus;
  /** Volume for triggered sounds. */
  volume?: number;
  /** Called on enter. */
  onEnter?: () => void;
  /** Called on exit. */
  onExit?: () => void;
}

export class AudioMixer {
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly ambient: GainNode;
  readonly voice: GainNode;

  private readonly buses = new Map<AudioBus, BusChannel>();
  private crossfade: CrossfadeState | null = null;
  private readonly ctx: AudioContext;
  private readonly cache = new Map<string, AudioBuffer>();

  // Trigger zones
  private triggerZones: TriggerZoneConfig[] = [];
  private readonly insideZone = new Set<string>();
  private readonly zoneAmbientSources = new Map<string, ActiveAmbient>();
  private readonly sceneManager: SceneManager | null;
  private readonly worldOrigin: WorldOrigin | null;
  private readonly _eng = new THREE.Vector3();

  constructor(ctx: AudioContext, destination: AudioNode, deps?: { sceneManager?: SceneManager; worldOrigin?: WorldOrigin }) {
    this.ctx = ctx;
    this.sceneManager = deps?.sceneManager ?? null;
    this.worldOrigin = deps?.worldOrigin ?? null;

    this.music = this.createBus('music', 0.5);
    this.sfx = this.createBus('sfx', 1.0);
    this.ambient = this.createBus('ambient', 0.7);
    this.voice = this.createBus('voice', 1.0);

    // Route each bus to the destination.
    this.music.connect(destination);
    this.sfx.connect(destination);
    this.ambient.connect(destination);
    this.voice.connect(destination);
  }

  private createBus(name: AudioBus, defaultVolume: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = defaultVolume;
    this.buses.set(name, { gain, volume: defaultVolume });
    return gain;
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    const ch = this.buses.get(bus);
    if (!ch) return;
    ch.volume = THREE.MathUtils.clamp(volume, 0, 1);
    ch.gain.gain.linearRampToValueAtTime(ch.volume, this.ctx.currentTime + 0.05);
  }

  getBusVolume(bus: AudioBus): number {
    return this.buses.get(bus)?.volume ?? 0;
  }

  /** Preload a sound into the shared cache. */
  async preload(src: string): Promise<AudioBuffer | null> {
    if (this.cache.has(src)) return this.cache.get(src)!;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const audioBuf = await this.ctx.decodeAudioData(buf);
      this.cache.set(src, audioBuf);
      return audioBuf;
    } catch (err) {
      console.warn(`[AudioMixer] Failed to load '${src}':`, err);
      return null;
    }
  }

  /** Create an AudioBufferSourceNode wired to the given bus. Returns the node + gain. */
  createSource(buffer: AudioBuffer, bus: AudioBus, opts: { loop?: boolean; playbackRate?: number; volume?: number } = {}): { source: AudioBufferSourceNode; gain: GainNode } {
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = !!opts.loop;
    node.playbackRate.value = Math.max(0.1, opts.playbackRate ?? 1);

    const gain = this.ctx.createGain();
    gain.gain.value = THREE.MathUtils.clamp(opts.volume ?? 1, 0, 1);

    node.connect(gain);
    const busGain = this.buses.get(bus);
    if (busGain) {
      gain.connect(busGain.gain);
    } else {
      gain.connect(this.sfx);
    }
    return { source: node, gain };
  }

  // ── Music Crossfade ───────────────────────────────────────────────────────

  /** Crossfade from the current music track to a new one. If no track is playing,
   *  the new one fades in. Duration is the crossfade time in seconds. */
  async crossfadeMusic(src: string, duration = 2): Promise<void> {
    const buffer = await this.preload(src);
    if (!buffer) return;

    // If a crossfade is already in progress, fade the outgoing track out over the
    // new duration, stop its node once silent, and resolve its promise. The old
    // code hard-cut the gain to 0 (audible click) and leaked the source node, and
    // its promise never resolved on natural completion so `await` hung forever.
    const prev = this.crossfade;
    if (prev) {
      prev.toGain.gain.cancelScheduledValues(this.ctx.currentTime);
      prev.toGain.gain.setValueAtTime(prev.toGain.gain.value, this.ctx.currentTime);
      prev.toGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
      const prevNode = prev.toNode;
      setTimeout(() => { try { prevNode.stop(); } catch { /* already stopped */ } }, (duration * 1000) + 50);
      prev.resolve();
      this.crossfade = null;
    }

    const toGain = this.ctx.createGain();
    toGain.gain.value = 0;
    toGain.connect(this.music);

    const toNode = this.ctx.createBufferSource();
    toNode.buffer = buffer;
    toNode.loop = true;
    toNode.connect(toGain);
    toNode.start();

    toGain.gain.setValueAtTime(0, this.ctx.currentTime);
    toGain.gain.linearRampToValueAtTime(this.getBusVolume('music'), this.ctx.currentTime + duration);

    return new Promise<void>((resolve) => {
      this.crossfade = { fromSrc: prev?.toSrc ?? null, toSrc: src, progress: 0, duration, toGain, toNode, resolve };
      // Resolve once the fade-in has finished (the track continues looping).
      setTimeout(() => {
        if (this.crossfade?.toNode === toNode) {
          this.crossfade.progress = 1;
          const r = this.crossfade.resolve;
          this.crossfade.resolve = () => {};
          r();
        }
      }, duration * 1000);
    });
  }

  /** Stop the current music with a fade-out. */
  async stopMusic(fadeOut = 1): Promise<void> {
    if (!this.crossfade) return;
    const cf = this.crossfade;
    cf.toGain.gain.cancelScheduledValues(this.ctx.currentTime);
    cf.toGain.gain.setValueAtTime(cf.toGain.gain.value, this.ctx.currentTime);
    cf.toGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOut);
    setTimeout(() => {
      try { cf.toNode.stop(); } catch { /* */ }
    }, (fadeOut * 1000) + 50);
    // Resolve the crossfade's promise so any `await crossfadeMusic(...)` doesn't hang.
    const r = cf.resolve;
    cf.resolve = () => {};
    r();
    this.crossfade = null;
  }

  /** Current music source URL, or null if none. */
  get currentMusicSrc(): string | null {
    return this.crossfade?.toSrc ?? null;
  }

  // ── Trigger Zones ─────────────────────────────────────────────────────────

  addTriggerZone(config: TriggerZoneConfig): void {
    // Remove existing zone with same id.
    this.triggerZones = this.triggerZones.filter((z) => z.id !== config.id);
    this.triggerZones.push(config);
  }

  removeTriggerZone(id: string): void {
    this.triggerZones = this.triggerZones.filter((z) => z.id !== id);
    this.insideZone.delete(id);
    const ambient = this.zoneAmbientSources.get(id);
    if (ambient) {
      try { ambient.source.stop(); } catch { /* */ }
      this.zoneAmbientSources.delete(id);
    }
  }

  /** Tick trigger zones against a world-space position (typically the camera). */
  update(worldPos: THREE.Vector3): void {
    for (const zone of this.triggerZones) {
      const dx = worldPos.x - zone.x;
      const dy = worldPos.y - zone.y;
      const dz = worldPos.z - zone.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const radiusSq = zone.radius * zone.radius;
      const inside = distSq <= radiusSq;

      const wasInside = this.insideZone.has(zone.id);
      if (inside && !wasInside) {
        this.insideZone.add(zone.id);
        zone.onEnter?.();
        if (zone.enterSound) {
          this.playTriggerSound(zone.enterSound, zone.bus ?? 'sfx', zone.volume);
        }
        if (zone.ambientSound) {
          this.startZoneAmbient(zone);
        }
      } else if (!inside && wasInside) {
        this.insideZone.delete(zone.id);
        zone.onExit?.();
        if (zone.exitSound) {
          this.playTriggerSound(zone.exitSound, zone.bus ?? 'sfx', zone.volume);
        }
        this.stopZoneAmbient(zone.id);
      }
    }
  }

  private async playTriggerSound(src: string, bus: AudioBus, volume?: number): Promise<void> {
    const buffer = await this.preload(src);
    if (!buffer) return;
    const { source } = this.createSource(buffer, bus, { volume });
    source.start();
    source.onended = () => {
      try { source.disconnect(); } catch { /* */ }
    };
  }

  private async startZoneAmbient(zone: TriggerZoneConfig): Promise<void> {
    if (!zone.ambientSound) return;
    // Stop existing ambient for this zone.
    this.stopZoneAmbient(zone.id);

    const buffer = await this.preload(zone.ambientSound);
    if (!buffer) return;
    const { source, gain } = this.createSource(buffer, zone.bus ?? 'ambient', { loop: true, volume: zone.volume ?? 0.5 });
    source.start();
    this.zoneAmbientSources.set(zone.id, { source, gain });
  }

  private stopZoneAmbient(id: string): void {
    const ambient = this.zoneAmbientSources.get(id);
    if (ambient) {
      try { ambient.source.stop(); } catch { /* */ }
      this.zoneAmbientSources.delete(id);
    }
  }

  /** Clean up. */
  dispose(): void {
    if (this.crossfade) {
      try { this.crossfade.toNode.stop(); } catch { /* */ }
      this.crossfade = null;
    }
    for (const [id, ambient] of this.zoneAmbientSources) {
      try { ambient.source.stop(); } catch { /* */ }
    }
    this.zoneAmbientSources.clear();
    this.triggerZones = [];
    this.insideZone.clear();
  }
}

interface ActiveAmbient {
  source: AudioBufferSourceNode;
  gain: GainNode;
}
