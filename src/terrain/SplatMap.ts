import * as THREE from 'three';
import { brushWeight } from './Heightmap';
import { bytesToBase64, bytesToBase64Async } from './Heightmap';

/**
 * Pure kernel for painting a splat layer circle.
 * Modifies the weights array in place, ensuring the 4 layers always sum to 255 per texel.
 */
export function paintCircle(
  weights: Uint8Array,
  res: number,
  terrainSize: number,
  layer: number,
  cxLocal: number,
  czLocal: number,
  radiusLocal: number,
  hardness: number,
  strength: number
): void {
  const half = terrainSize / 2;
  const step = terrainSize / res;
  
  const minX = Math.max(0, Math.floor((cxLocal - radiusLocal + half) / step));
  const maxX = Math.min(res - 1, Math.ceil((cxLocal + radiusLocal + half) / step));
  const minZ = Math.max(0, Math.floor((czLocal - radiusLocal + half) / step));
  const maxZ = Math.min(res - 1, Math.ceil((czLocal + radiusLocal + half) / step));

  for (let j = minZ; j <= maxZ; j++) {
    const zLocal = j * step - half;
    for (let i = minX; i <= maxX; i++) {
      const xLocal = i * step - half;
      const d = Math.hypot(xLocal - cxLocal, zLocal - czLocal);
      const bw = brushWeight(d, radiusLocal, hardness);
      if (bw === 0) continue;

      const t = Math.min(bw * strength, 1);
      const idx = (j * res + i) * 4;

      for (let l = 0; l < 4; l++) {
        const target = (l === layer) ? 255 : 0;
        weights[idx + l] = Math.round(weights[idx + l] * (1 - t) + target * t);
      }
      
      // Ensure perfectly normalized (rounding can cause slight drift)
      let sum = weights[idx] + weights[idx+1] + weights[idx+2] + weights[idx+3];
      if (sum > 0 && sum !== 255) {
        weights[idx] = Math.round((weights[idx] / sum) * 255);
        weights[idx+1] = Math.round((weights[idx+1] / sum) * 255);
        weights[idx+2] = Math.round((weights[idx+2] / sum) * 255);
        weights[idx+3] = Math.round((weights[idx+3] / sum) * 255);
        
        sum = weights[idx] + weights[idx+1] + weights[idx+2] + weights[idx+3];
        if (sum !== 255) {
          let maxL = 0, maxV = -1;
          for (let l = 0; l < 4; l++) {
            if (weights[idx + l] > maxV) { maxV = weights[idx + l]; maxL = l; }
          }
          weights[idx + maxL] += (255 - sum);
        }
      }
    }
  }
}

/**
 * SplatMap wraps the raw weights in a THREE.DataTexture so we can push updates to the GPU.
 */
export class SplatMap {
  readonly res: number;
  readonly weights: Uint8Array;
  readonly texture: THREE.DataTexture;

  constructor(res: number, initial?: Uint8Array) {
    this.res = res;
    if (initial && initial.length === res * res * 4) {
      this.weights = initial;
    } else {
      this.weights = new Uint8Array(res * res * 4);
      // Initialize everything to layer 0
      for (let i = 0; i < this.weights.length; i += 4) {
        this.weights[i] = 255;
      }
    }
    
    // Use nearest filter so splat data is un-blurred during sampling (or linear for smooth blending)
    this.texture = new THREE.DataTexture(this.weights as any, res, res, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  toBase64(): string {
    return bytesToBase64(this.weights);
  }

  toBase64Async(): Promise<string> { return bytesToBase64Async(this.weights); }

  fromBase64(b64: string): boolean {
    let binary: string;
    if (typeof atob === 'undefined') {
      binary = Buffer.from(b64, 'base64').toString('binary');
    } else {
      binary = atob(b64);
    }
    
    if (binary.length !== this.weights.length) return false;
    for (let i = 0; i < binary.length; i++) {
      this.weights[i] = binary.charCodeAt(i);
    }
    this.texture.needsUpdate = true;
    return true;
  }
}
