import * as THREE from 'three';

export class TweenPool {
  // Scratch objects for zero-allocation hot paths
  static readonly v2_0 = new THREE.Vector2();
  static readonly v2_1 = new THREE.Vector2();
  static readonly v2_2 = new THREE.Vector2();

  static readonly v3_0 = new THREE.Vector3();
  static readonly v3_1 = new THREE.Vector3();
  static readonly v3_2 = new THREE.Vector3();
  static readonly v3_3 = new THREE.Vector3();
  static readonly v3_4 = new THREE.Vector3();
  static readonly v3_5 = new THREE.Vector3();

  static readonly v4_0 = new THREE.Vector4();
  static readonly v4_1 = new THREE.Vector4();

  static readonly quat_0 = new THREE.Quaternion();
  static readonly quat_1 = new THREE.Quaternion();
  static readonly quat_2 = new THREE.Quaternion();
  static readonly quat_3 = new THREE.Quaternion();

  static readonly euler_0 = new THREE.Euler();
  static readonly euler_1 = new THREE.Euler();
  static readonly euler_2 = new THREE.Euler();

  static readonly color_0 = new THREE.Color();
  static readonly color_1 = new THREE.Color();
  static readonly color_2 = new THREE.Color();

  static readonly mat4_0 = new THREE.Matrix4();
  static readonly mat4_1 = new THREE.Matrix4();

  // Dynamic Pools
  private static v3Pool: THREE.Vector3[] = [];
  private static quatPool: THREE.Quaternion[] = [];
  private static eulerPool: THREE.Euler[] = [];
  private static colorPool: THREE.Color[] = [];

  static acquireVector3(x = 0, y = 0, z = 0): THREE.Vector3 {
    const v = TweenPool.v3Pool.pop() ?? new THREE.Vector3();
    v.set(x, y, z);
    return v;
  }

  static releaseVector3(v: THREE.Vector3): void {
    if (TweenPool.v3Pool.length < 500) {
      TweenPool.v3Pool.push(v);
    }
  }

  static acquireQuaternion(x = 0, y = 0, z = 0, w = 1): THREE.Quaternion {
    const q = TweenPool.quatPool.pop() ?? new THREE.Quaternion();
    q.set(x, y, z, w);
    return q;
  }

  static releaseQuaternion(q: THREE.Quaternion): void {
    if (TweenPool.quatPool.length < 500) {
      TweenPool.quatPool.push(q);
    }
  }

  static acquireEuler(x = 0, y = 0, z = 0, order: THREE.EulerOrder = 'XYZ'): THREE.Euler {
    const e = TweenPool.eulerPool.pop() ?? new THREE.Euler();
    e.set(x, y, z, order);
    return e;
  }

  static releaseEuler(e: THREE.Euler): void {
    if (TweenPool.eulerPool.length < 500) {
      TweenPool.eulerPool.push(e);
    }
  }

  static acquireColor(r = 1, g = 1, b = 1): THREE.Color {
    const c = TweenPool.colorPool.pop() ?? new THREE.Color();
    c.setRGB(r, g, b);
    return c;
  }

  static releaseColor(c: THREE.Color): void {
    if (TweenPool.colorPool.length < 500) {
      TweenPool.colorPool.push(c);
    }
  }

  static getPoolStats(): {
    vector3: number;
    quaternion: number;
    euler: number;
    color: number;
  } {
    return {
      vector3: TweenPool.v3Pool.length,
      quaternion: TweenPool.quatPool.length,
      euler: TweenPool.eulerPool.length,
      color: TweenPool.colorPool.length,
    };
  }

  static clearPools(): void {
    TweenPool.v3Pool.length = 0;
    TweenPool.quatPool.length = 0;
    TweenPool.eulerPool.length = 0;
    TweenPool.colorPool.length = 0;
  }
}
