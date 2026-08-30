/** Non-destructive, error-bounded key reduction and elapsed-time-preserving animation LOD. */
import * as THREE from 'three';

export interface AnimOptimizeOptions {
  quaternionToleranceRad?: number;
  translationTolerance?: number;
  scaleTolerance?: number;
  preserveRootMotion?: boolean;
  pruneConstantTracks?: boolean;
}

export class AnimationOptimizer {
  static optimizeClip(clip: THREE.AnimationClip, opts: AnimOptimizeOptions = {}): THREE.AnimationClip {
    const result = clip.clone();
    const optimizedTracks: THREE.KeyframeTrack[] = [];

    for (const track of clip.tracks) {
      const copy = track.clone();
      const name = track.name.toLowerCase();
      if ((opts.preserveRootMotion ?? true) && (name.includes('root') || name.includes('hips'))) {
        optimizedTracks.push(copy);
        continue;
      }
      const quaternion = track instanceof THREE.QuaternionKeyframeTrack;
      const vector = track instanceof THREE.VectorKeyframeTrack;
      const size = track.getValueSize();
      // Discrete, smooth and glTF cubic-spline tracks have different interpolation contracts.
      if ((!quaternion && !vector) || size !== (quaternion ? 4 : 3) ||
          track.getInterpolation() !== THREE.InterpolateLinear || track.times.length < 3) {
        optimizedTracks.push(copy);
        continue;
      }
      const tolerance = quaternion ? opts.quaternionToleranceRad ?? 0.002
        : name.endsWith('.scale') ? opts.scaleTolerance ?? 0.001 : opts.translationTolerance ?? 0.001;
      if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Animation tolerance must be finite and nonnegative.');
      const times = track.times, values = track.values;
      if (Array.from(times).some((time, i) => !Number.isFinite(time) || (i > 0 && time <= times[i - 1]))) {
        optimizedTracks.push(copy);
        continue;
      }

      // Check if track is constant
      const constant = Array.from(values).every((v, i) => Math.abs(v - values[i % size]) < 1e-6);
      if (constant && opts.pruneConstantTracks === true) {
        // Pruned constant track from clip
        continue;
      }

      const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qOriginal = new THREE.Quaternion(), qPredicted = new THREE.Quaternion();
      const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vOriginal = new THREE.Vector3(), vPredicted = new THREE.Vector3();
      const keep = new Set<number>([0, times.length - 1]);
      const spans: Array<[number, number]> = [[0, times.length - 1]];
      // Each accepted span validates every original key it replaces, not just its last neighbor.
      while (spans.length) {
        const [start, end] = spans.pop()!;
        if (end - start < 2) continue;
        if (quaternion) {
          qA.fromArray(values, start * size).normalize();
          qB.fromArray(values, end * size).normalize();
        } else {
          vA.fromArray(values, start * size);
          vB.fromArray(values, end * size);
        }
        let largestError = tolerance, split = -1;
        for (let i = start + 1; i < end; i++) {
          const alpha = (times[i] - times[start]) / (times[end] - times[start]);
          const error = quaternion
            ? qOriginal.fromArray(values, i * size).normalize().angleTo(qPredicted.copy(qA).slerp(qB, alpha))
            : vOriginal.fromArray(values, i * size).distanceTo(vPredicted.copy(vA).lerp(vB, alpha));
          if (error > largestError) { largestError = error; split = i; }
        }
        if (split !== -1) { keep.add(split); spans.push([start, split], [split, end]); }
      }

      const indices = [...keep].sort((a, b) => a - b);
      copy.times = new Float32Array(indices.map(i => times[i]));
      copy.values = new Float32Array(indices.flatMap(i => Array.from(values.slice(i * size, (i + 1) * size))));
      optimizedTracks.push(copy);
    }
    result.tracks = optimizedTracks;
    return result;
  }
}

export interface AnimatedInstance {
  id: string;
  mixer: THREE.AnimationMixer;
  rootObject: THREE.Object3D;
  isHero?: boolean;
  lastUpdateFrame?: number;
}

export class AnimationLodManager {
  private readonly instances = new Map<string, AnimatedInstance>();
  private readonly pendingSeconds = new Map<string, number>();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly objectPosition = new THREE.Vector3();
  private animationLodBias = 1.0;

  get registeredCount(): number {
    return this.instances.size;
  }

  setAnimationLodBias(bias: number): void {
    this.animationLodBias = Math.max(0.1, Math.min(10.0, bias));
  }

  getAnimationLodBias(): number {
    return this.animationLodBias;
  }

  getPendingElapsed(id: string): number {
    return this.pendingSeconds.get(id) ?? 0;
  }

  register(instance: AnimatedInstance): void {
    this.instances.set(instance.id, instance);
    this.pendingSeconds.set(instance.id, 0);
  }

  unregister(id: string): void {
    this.instances.delete(id);
    this.pendingSeconds.delete(id);
  }

  clear(): void {
    this.instances.clear();
    this.pendingSeconds.clear();
  }

  update(camera: THREE.Camera, deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
    camera.getWorldPosition(this.cameraPosition);
    const bias = this.animationLodBias;
    const nearThresh = 15.0 / bias;
    const midThresh = 45.0 / bias;

    for (const inst of this.instances.values()) {
      const elapsed = (this.pendingSeconds.get(inst.id) ?? 0) + deltaSeconds;
      inst.rootObject.getWorldPosition(this.objectPosition);
      const distance = this.objectPosition.distanceTo(this.cameraPosition);

      // Target update rate based on distance:
      // - Hero or close (< 15m/bias): Full presentation rate (tick every frame)
      // - Midground (< 45m/bias): 30 Hz (interval = 1/30 s)
      // - Background (>= 45m/bias): 15 Hz (interval = 1/15 s)
      const minInterval = inst.isHero || distance < nearThresh ? 0 : distance < midThresh ? (1.0 / 30.0) : (1.0 / 15.0);

      if (elapsed >= minInterval) {
        inst.mixer.update(elapsed);
        this.pendingSeconds.set(inst.id, 0);
      } else {
        this.pendingSeconds.set(inst.id, elapsed);
      }
    }
  }
}

