import * as THREE from 'three';

/**
 * FoliageMaterial — a MeshStandardMaterial (so instanced trees/bushes get the engine's lights,
 * shadows, fog and tonemapping) extended via onBeforeCompile with GPU WIND SWAY: each vertex is
 * pushed along the wind direction by an amount that grows with its local height (trunk base stays
 * planted, canopy bends), with a per-instance phase so a forest doesn't sway in lockstep.
 * Uses vertex colours (trunk vs canopy) so one instanced draw call renders a whole multi-part tree.
 */
export class FoliageMaterial extends THREE.MeshStandardMaterial {
  readonly uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uWindStrength: { value: 1 },
    uSway: { value: 0.35 },        // metres of canopy travel at full wind
    uFoliageHeight: { value: 4 },  // local height over which sway ramps in
    uWindFreq: { value: 1.6 },
  };

  constructor(opts: { sway?: number; foliageHeight?: number } = {}) {
    super({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
    if (opts.sway !== undefined) this.uniforms.uSway.value = opts.sway;
    if (opts.foliageHeight !== undefined) this.uniforms.uFoliageHeight.value = opts.foliageHeight;

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        uniform float uSway;
        uniform float uFoliageHeight;
        uniform float uWindFreq;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Sway ramps from 0 at the base to 1 at the canopy top (local Y).
        float swayAmt = smoothstep(0.0, uFoliageHeight, position.y);
        #ifdef USE_INSTANCING
          vec3 instPos = instanceMatrix[3].xyz;       // per-instance phase offset
        #else
          vec3 instPos = vec3(0.0);
        #endif
        float phase = uTime * uWindFreq + dot(instPos.xz, vec2(0.13, 0.21));
        float bend = swayAmt * uSway * uWindStrength;
        transformed.x += sin(phase) * bend * uWindDir.x;
        transformed.z += cos(phase * 0.9) * bend * uWindDir.y;
        `
      );
    };
    this.customProgramCacheKey = () => 'FoliageMaterial';
  }

  setWind(dir: THREE.Vector2, strength: number): void {
    this.uniforms.uWindDir.value.copy(dir);
    this.uniforms.uWindStrength.value = strength;
  }
  setTime(t: number): void { this.uniforms.uTime.value = t; }
}
