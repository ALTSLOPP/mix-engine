import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

interface Job {
  id: string;
  path: string;
  resolve: (group: THREE.Group) => void;
  reject: (err: Error) => void;
}

/**
 * AssetLoaderQueue.ts — Concurrency-limited GLB + FBX loader.
 *
 * MIX Animation Retarget Pro: the IDE must handle artist packs from FAB/Mixamo/
 * Unity Store that ship as FBX _or_ glTF. This queue auto-detects the file
 * extension and dispatches to the right loader (GLTFLoader vs FBXLoader), so
 * enqueue(id, path) works regardless of format.
 */
export class AssetLoaderQueue {
  static readonly MAX_CONCURRENT_FETCH = 4;

  private readonly gltfLoader = new GLTFLoader();
  private readonly fbxLoader = new FBXLoader();
  /** Backward compat: `loader` alias used by older callers / error messages. */
  get loader(): GLTFLoader { return this.gltfLoader; }
  /** Decompresses DRACO-compressed glTF geometry (many third-party props ship this way).
   *  Without it the GLTFLoader throws "No DRACOLoader instance provided" on those GLBs and
   *  the asset never loads. Decoder binaries are served from public/draco/ (copied from
   *  three/examples/jsm/libs/draco/gltf at build setup). */
  private readonly dracoLoader = new DRACOLoader();
  private readonly queue: Job[] = [];
  private readonly inflight = new Map<string, Promise<THREE.Group>>();
  private active = 0;
  private disposed = false;

  constructor() {
    this.dracoLoader.setDecoderPath('/draco/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  private isFbx(path: string): boolean {
    return path.toLowerCase().endsWith('.fbx');
  }

  enqueue(id: string, path: string): Promise<THREE.Group> {
    // If the queue was disposed (engine teardown / HMR), reject immediately — a
    // post-dispose enqueue would otherwise sit in the queue forever (pump() skips
    // when disposed) and the caller's await would hang.
    if (this.disposed) return Promise.reject(new Error('AssetLoaderQueue disposed'));
    const existing = this.inflight.get(id);
    if (existing) return existing;

    const promise = new Promise<THREE.Group>((resolve, reject) => {
      this.queue.push({ id, path, resolve, reject });
      this.pump();
    });
    this.inflight.set(id, promise);
    // Keep unhandled rejections from escaping the dedupe map cleanup.
    promise.then(
      () => this.inflight.delete(id),
      () => this.inflight.delete(id),
    );
    return promise;
  }

  private pump(): void {
    while (!this.disposed && this.active < AssetLoaderQueue.MAX_CONCURRENT_FETCH && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active += 1;
      const promise: Promise<THREE.Group> = this.isFbx(job.path)
        ? this.fbxLoader.loadAsync(job.path).then((obj) => {
            // FBXLoader returns a Group whose animations live at obj.animations.
            // Normalise to the same shape as GLTF (scene + animations).
            const group = obj as unknown as THREE.Group & { animations: THREE.AnimationClip[] };
            Object.assign(group, { animations: group.animations ?? [] });
            return group as THREE.Group;
          })
        : this.gltfLoader.loadAsync(job.path).then((gltf) => {
            Object.assign(gltf.scene, { animations: gltf.animations });
            return gltf.scene;
          });

      promise
        .then((group) => {
          if (this.disposed) job.reject(new Error('AssetLoaderQueue disposed'));
          else job.resolve(group);
        })
        .catch((err: unknown) => job.reject(err instanceof Error ? err : new Error(String(err))))
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }

  get pending(): number {
    return this.queue.length + this.active;
  }

  dispose(): void {
    this.disposed = true;
    for (const job of this.queue) job.reject(new Error('AssetLoaderQueue disposed'));
    this.queue.length = 0;
    this.dracoLoader.dispose();
  }
}
