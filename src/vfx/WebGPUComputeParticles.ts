export interface ComputeParticleParams {
  maxParticles?: number; // default 100,000
  emissionRate?: number;
  gravity?: [number, number, number];
  drag?: number;
  curlNoiseStrength?: number;
  emitterPos?: [number, number, number];
}

/**
 * WebGPUComputeParticles.ts — Massively parallel GPU Compute Particle Simulation in WGSL.
 * Simulates 100,000+ dynamic particles with curl noise, ground collisions, and instanced rendering.
 */
export class WebGPUComputeParticles {
  readonly maxParticles: number;
  readonly emissionRate: number;
  readonly gravity: [number, number, number];
  readonly drag: number;
  readonly curlNoiseStrength: number;

  constructor(params: ComputeParticleParams = {}) {
    this.maxParticles = params.maxParticles ?? 100000;
    this.emissionRate = params.emissionRate ?? 5000;
    this.gravity = params.gravity ?? [0, -9.81, 0];
    this.drag = params.drag ?? 0.1;
    this.curlNoiseStrength = params.curlNoiseStrength ?? 1.5;
  }

  /**
   * Initializes particle state array on CPU for initial buffer seeding.
   * Format per particle (8 floats = 32 bytes):
   * [posX, posY, posZ, life, velX, velY, velZ, seed]
   */
  createInitialParticleBuffer(): Float32Array {
    const buffer = new Float32Array(this.maxParticles * 8);

    for (let i = 0; i < this.maxParticles; i++) {
      const offset = i * 8;
      // Position
      buffer[offset] = 0;
      buffer[offset + 1] = 0;
      buffer[offset + 2] = 0;
      // Initial life (staggered so all particles don't spawn at the exact same instant)
      buffer[offset + 3] = (i / this.maxParticles);

      // Velocity (random cone)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * 0.5;
      const speed = 2.0 + Math.random() * 3.0;

      buffer[offset + 4] = Math.sin(phi) * Math.cos(theta) * speed;
      buffer[offset + 5] = Math.cos(phi) * speed;
      buffer[offset + 6] = Math.sin(phi) * Math.sin(theta) * speed;

      // Seed for noise
      buffer[offset + 7] = Math.random();
    }

    return buffer;
  }

  /**
   * WGSL Compute Shader for simulating 100k+ particles on GPU.
   */
  static getParticleComputeShader(): string {
    return /* wgsl */ `
struct Particle {
  posAndLife: vec4<f32>, // xyz = position, w = remaining life (0 to 1)
  velAndSeed: vec4<f32>, // xyz = velocity, w = random seed
};

struct SimParams {
  deltaTime: f32,
  drag: f32,
  curlStrength: f32,
  particleCount: u32,
  gravity: vec4<f32>,
  emitterPos: vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;

// Fast Simplex-style pseudo noise
fn hash3(p: vec3<f32>) -> vec3<f32> {
  let q = vec3<f32>(
    dot(p, vec3<f32>(127.1, 311.7, 74.7)),
    dot(p, vec3<f32>(269.5, 183.3, 246.1)),
    dot(p, vec3<f32>(113.5, 271.9, 124.6))
  );
  // fract() is what bounds this to [0,1); without it the hash returns values on the
  // order of 1e4, and both the respawn velocity and the curl term below explode —
  // every particle left the visible world on its first frame.
  return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  if (index >= params.particleCount) {
    return;
  }

  var p = particles[index];
  var pos = p.posAndLife.xyz;
  var life = p.posAndLife.w;
  var vel = p.velAndSeed.xyz;
  let seed = p.velAndSeed.w;

  life = life - (params.deltaTime * 0.5);

  if (life <= 0.0) {
    // Respawn particle at emitter origin
    pos = params.emitterPos.xyz;
    let noise = hash3(pos + vec3<f32>(seed, f32(index), seed * 2.0));
    vel = vec3<f32>(noise.x * 2.0, 3.0 + abs(noise.y) * 4.0, noise.z * 2.0);
    life = 1.0;
  } else {
    // Curl turbulence noise
    let noiseVec = hash3(pos * 0.5);
    let curl = cross(noiseVec, vec3<f32>(0.0, 1.0, 0.0)) * params.curlStrength;

    // Integrate velocity & position
    vel = vel + (params.gravity.xyz + curl) * params.deltaTime;
    vel = vel * max(0.0, 1.0 - params.drag * params.deltaTime);
    pos = pos + vel * params.deltaTime;

    // Ground plane bounce
    if (pos.y < 0.0) {
      pos.y = 0.0;
      vel.y = -vel.y * 0.4;
    }
  }

  p.posAndLife = vec4<f32>(pos, life);
  p.velAndSeed = vec4<f32>(vel, seed);
  particles[index] = p;
}
`;
  }
}
