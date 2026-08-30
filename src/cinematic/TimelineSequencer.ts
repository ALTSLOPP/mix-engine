import * as THREE from 'three';
import type { EventBus } from '../ecs/EventBus';

export interface TransformKeyframe {
  time: number; // seconds
  position?: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion [x, y, z, w]
  scale?: [number, number, number];
}

export interface EventKeyframe {
  time: number;
  eventName: string;
  payload?: Record<string, unknown>;
}

export interface TimelineTrack {
  id: string;
  type: 'transform' | 'event';
  targetEntityId?: number;
  transformKeys?: TransformKeyframe[];
  eventKeys?: EventKeyframe[];
}

export interface TimelineDef {
  id: string;
  duration: number; // seconds
  loop?: boolean;
  tracks: TimelineTrack[];
}

export class TimelineSequencer {
  private readonly timelines = new Map<string, TimelineDef>();
  private readonly activePlayback = new Map<
    string,
    { currentTime: number; loop: boolean; playing: boolean; lastDispatchedTime: number }
  >();

  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _q2 = new THREE.Quaternion();

  constructor(
    private readonly getEntityObject?: (id: number) => THREE.Object3D | null,
    private readonly eventBus?: EventBus,
    private readonly toEngineSpace?: (worldPosition: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3,
    private readonly onTransformApplied?: (id: number, object: THREE.Object3D) => void,
  ) {}

  addTimeline(def: TimelineDef): void {
    this.timelines.set(def.id, def);
  }

  play(id: string, loop = false): boolean {
    const def = this.timelines.get(id);
    if (!def) return false;

    this.activePlayback.set(id, {
      currentTime: 0,
      loop: loop || !!def.loop,
      playing: true,
      lastDispatchedTime: -0.001,
    });
    return true;
  }

  pause(id: string): void {
    const p = this.activePlayback.get(id);
    if (p) p.playing = false;
  }

  stop(id: string): void {
    this.activePlayback.delete(id);
  }

  scrub(id: string, time: number): void {
    const def = this.timelines.get(id);
    if (!def) return;

    let p = this.activePlayback.get(id);
    if (!p) {
      p = { currentTime: 0, loop: !!def.loop, playing: false, lastDispatchedTime: -0.001 };
      this.activePlayback.set(id, p);
    }
    p.currentTime = THREE.MathUtils.clamp(time, 0, def.duration);
    this.evaluate(def, p.currentTime, p.lastDispatchedTime);
    p.lastDispatchedTime = p.currentTime;
  }

  update(dt: number): void {
    for (const [id, playback] of this.activePlayback.entries()) {
      if (!playback.playing) continue;

      const def = this.timelines.get(id);
      if (!def) continue;

      const prevTime = playback.currentTime;
      playback.currentTime += dt;

      if (playback.currentTime >= def.duration) {
        if (playback.loop) {
          playback.currentTime %= def.duration;
          playback.lastDispatchedTime = -0.001;
        } else {
          playback.currentTime = def.duration;
          playback.playing = false;
        }
      }

      this.evaluate(def, playback.currentTime, prevTime);
      playback.lastDispatchedTime = playback.currentTime;
    }
  }

  private evaluate(def: TimelineDef, time: number, prevTime: number): void {
    for (const track of def.tracks) {
      if (track.type === 'transform' && track.targetEntityId !== undefined && track.transformKeys && this.getEntityObject) {
        const obj = this.getEntityObject(track.targetEntityId);
        if (obj) {
          this.sampleTransformTrack(obj, track.transformKeys, time);
          this.onTransformApplied?.(track.targetEntityId, obj);
        }
      } else if (track.type === 'event' && track.eventKeys && this.eventBus) {
        for (const k of track.eventKeys) {
          if (prevTime < k.time && time >= k.time) {
            this.eventBus.emit(k.eventName, k.payload ?? {});
          }
        }
      }
    }
  }

  private sampleTransformTrack(obj: THREE.Object3D, keys: TransformKeyframe[], time: number): void {
    if (keys.length === 0) return;
    if (keys.length === 1 || time <= keys[0].time) {
      const k = keys[0];
      if (k.position) obj.position.copy(this.resolvePosition(k.position, this._v1));
      if (k.rotation) obj.quaternion.set(k.rotation[0], k.rotation[1], k.rotation[2], k.rotation[3]);
      if (k.scale) obj.scale.set(k.scale[0], k.scale[1], k.scale[2]);
      return;
    }

    if (time >= keys[keys.length - 1].time) {
      const k = keys[keys.length - 1];
      if (k.position) obj.position.copy(this.resolvePosition(k.position, this._v1));
      if (k.rotation) obj.quaternion.set(k.rotation[0], k.rotation[1], k.rotation[2], k.rotation[3]);
      if (k.scale) obj.scale.set(k.scale[0], k.scale[1], k.scale[2]);
      return;
    }

    // Find keyframe interval
    for (let i = 0; i < keys.length - 1; i++) {
      const kA = keys[i];
      const kB = keys[i + 1];
      if (time >= kA.time && time <= kB.time) {
        const span = kB.time - kA.time;
        const alpha = span > 0 ? (time - kA.time) / span : 0;

        if (kA.position && kB.position) {
          this.resolvePosition(kA.position, this._v1);
          this.resolvePosition(kB.position, this._v2);
          obj.position.lerpVectors(this._v1, this._v2, alpha);
        }

        if (kA.rotation && kB.rotation) {
          this._q1.set(kA.rotation[0], kA.rotation[1], kA.rotation[2], kA.rotation[3]);
          this._q2.set(kB.rotation[0], kB.rotation[1], kB.rotation[2], kB.rotation[3]);
          obj.quaternion.slerpQuaternions(this._q1, this._q2, alpha);
        }
        if (kA.scale && kB.scale) {
          this._v1.set(kA.scale[0], kA.scale[1], kA.scale[2]);
          this._v2.set(kB.scale[0], kB.scale[1], kB.scale[2]);
          obj.scale.lerpVectors(this._v1, this._v2, alpha);
        }
        break;
      }
    }
  }

  private resolvePosition(position: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
    out.set(position[0], position[1], position[2]);
    return this.toEngineSpace ? this.toEngineSpace(out, out) : out;
  }

  getActivePlayback(id: string) {
    return this.activePlayback.get(id);
  }
}
