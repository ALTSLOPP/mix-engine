export interface DirtyRect { i0: number; i1: number; j0: number; j1: number; } // inclusive

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'undefined') return Buffer.from(bytes).toString('base64');
  const parts: string[] = [];
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length);
    let part = '';
    for (let j = i; j < end; j++) part += String.fromCharCode(bytes[j]);
    parts.push(part);
  }
  return btoa(parts.join(''));
}

export function bytesToBase64Async(bytes: Uint8Array): Promise<string> {
  if (typeof FileReader === 'undefined' || typeof Blob === 'undefined') {
    return Promise.resolve(bytesToBase64(bytes));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Base64 encoding failed'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma === -1) reject(new Error('Invalid FileReader data URL'));
      else resolve(result.slice(comma + 1));
    };
    const copy = bytes.slice();
    reader.readAsDataURL(new Blob([copy.buffer], { type: 'application/octet-stream' }));
  });
}

export class Heightmap {
  readonly res: number;
  readonly cells: number;
  readonly size: number;
  readonly step: number;
  readonly half: number;
  readonly heights: Float32Array;

  constructor(res: number, size: number, initial?: Float32Array) {
    this.res = res; this.cells = res - 1; this.size = size;
    this.step = size / this.cells; this.half = size / 2;
    this.heights = initial ?? new Float32Array(res * res);
  }

  idx(i: number, j: number): number { return j * this.res + i; }

  /** Clamped read — neighbours past the edge return the edge value (no wraparound, no NaN). */
  at(i: number, j: number): number {
    const ci = i < 0 ? 0 : i >= this.res ? this.res - 1 : i;
    const cj = j < 0 ? 0 : j >= this.res ? this.res - 1 : j;
    return this.heights[cj * this.res + ci];
  }

  toI(lx: number): number {
    return Math.floor((lx + this.size / 2) / this.step);
  }

  toJ(lz: number): number {
    return Math.floor((lz + this.size / 2) / this.step);
  }

  /** Bilinear height at a fractional local (x,z); used by erosion + height queries. */
  sampleLocal(x: number, z: number): number {
    const fi = (x + this.half) / this.step;
    const fj = (z + this.half) / this.step;
    const i = Math.floor(fi), j = Math.floor(fj);
    const fx = fi - i, fz = fj - j;
    const h00 = this.at(i, j),   h10 = this.at(i + 1, j);
    const h01 = this.at(i, j + 1), h11 = this.at(i + 1, j + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  /** Inclusive vertex-index rect covering a brush circle centred at local (cx,cz) radius R. */
  rectFor(cx: number, cz: number, R: number): DirtyRect {
    const toI = (x: number) => (x + this.half) / this.step;
    const c = (v: number) => Math.min(Math.max(v, 0), this.res - 1);
    return {
      i0: c(Math.floor(toI(cx - R))), i1: c(Math.ceil(toI(cx + R))),
      j0: c(Math.floor(toI(cz - R))), j1: c(Math.ceil(toI(cz + R))),
    };
  }

  /** Serialize the raw Float32 height bytes to base64. Works in the browser AND Node (Vitest).
   *  main.ts serialize calls this for `terrainBase64`; without it, saving a scene with a terrain threw. */
  toBase64(): string {
    const bytes = new Uint8Array(this.heights.buffer, this.heights.byteOffset, this.heights.byteLength);
    return bytesToBase64(bytes);
  }

  toBase64Async(): Promise<string> {
    const bytes = new Uint8Array(this.heights.buffer, this.heights.byteOffset, this.heights.byteLength);
    return bytesToBase64Async(bytes);
  }

  /** Restore heights from `toBase64`. Length-checked: a resolution mismatch is ignored rather than
   *  corrupting the field (the terrain just stays flat instead of reading garbage). */
  fromBase64(b64: string): boolean {
    const binary = typeof atob === 'undefined' ? Buffer.from(b64, 'base64').toString('binary') : atob(b64);
    if (binary.length !== this.heights.byteLength) return false;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    this.heights.set(new Float32Array(bytes.buffer, 0, this.heights.length));
    return true;
  }
}

/** Brush falloff. d = planar (XZ) distance; R = radius; hardness ∈ [0,1] = flat-top fraction. */
export function brushWeight(d: number, R: number, hardness: number): number {
  if (d >= R) return 0;
  const inner = R * Math.min(Math.max(hardness, 0), 0.999);
  if (d <= inner) return 1;
  const x = (d - inner) / (R - inner);   // 0 → 1 across the soft band
  return 1 - x * x * (3 - 2 * x);        // smoothstep, 1 → 0  (C1, monotonic)
}

/** dir = +1 raise, −1 lower. amount is already time-scaled by the caller. Returns dirty rect. */
export function applyRaise(hm: Heightmap, cx: number, cz: number, R: number,
                           hardness: number, amount: number, dir: number): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const w = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (w === 0) continue;
      hm.heights[hm.idx(i, j)] += dir * amount * w;
    }
  }
  return r;
}

export function applySmooth(hm: Heightmap, cx: number, cz: number, R: number,
                            hardness: number, rate: number): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  // Snapshot rect + 1 ring so the 3×3 kernel reads pre-smooth values.
  const si0 = Math.max(r.i0 - 1, 0), si1 = Math.min(r.i1 + 1, hm.res - 1);
  const sj0 = Math.max(r.j0 - 1, 0), sj1 = Math.min(r.j1 + 1, hm.res - 1);
  const w = si1 - si0 + 1, h = sj1 - sj0 + 1;
  const snap = new Float32Array(w * h);
  for (let j = sj0; j <= sj1; j++)
    for (let i = si0; i <= si1; i++)
      snap[(j - sj0) * w + (i - si0)] = hm.heights[hm.idx(i, j)];
  const S = (i: number, j: number) => {                // clamped read from snapshot
    const ci = Math.min(Math.max(i, si0), si1), cj = Math.min(Math.max(j, sj0), sj1);
    return snap[(cj - sj0) * w + (ci - si0)];
  };
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const bw = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (bw === 0) continue;
      const avg = (S(i-1,j-1)+S(i,j-1)+S(i+1,j-1)+S(i-1,j)+S(i,j)+S(i+1,j)+S(i-1,j+1)+S(i,j+1)+S(i+1,j+1)) / 9;
      const k = hm.idx(i, j);
      const t = Math.min(rate * bw, 1);               // lerp factor, clamped
      hm.heights[k] = hm.heights[k] * (1 - t) + avg * t;
    }
  }
  return r;
}

/** mode 'flatten' drives toward target; 'terrace' snaps toward nearest multiple of stepH. */
export function applyFlatten(hm: Heightmap, cx: number, cz: number, R: number, hardness: number,
                             rate: number, target: number, terraceStep = 0): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const bw = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (bw === 0) continue;
      const k = hm.idx(i, j);
      const goal = terraceStep > 0 ? Math.round(hm.heights[k] / terraceStep) * terraceStep : target;
      const t = Math.min(rate * bw, 1);
      hm.heights[k] = hm.heights[k] * (1 - t) + goal * t;
    }
  }
  return r;
}

/** A,B are local-space points {x,y,z}; y is the target height at each end. halfWidth in metres. */
export function applyRamp(hm: Heightmap, A: {x:number;y:number;z:number}, B: {x:number;y:number;z:number},
                          halfWidth: number, hardness: number): DirtyRect {
  const abx = B.x - A.x, abz = B.z - A.z;
  const abLen2 = abx * abx + abz * abz || 1e-6;
  const minX = Math.min(A.x, B.x) - halfWidth, maxX = Math.max(A.x, B.x) + halfWidth;
  const minZ = Math.min(A.z, B.z) - halfWidth, maxZ = Math.max(A.z, B.z) + halfWidth;
  const r = hm.rectFor((minX+maxX)/2, (minZ+maxZ)/2, Math.max(maxX-minX, maxZ-minZ)/2);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      let t = ((x - A.x) * abx + (z - A.z) * abz) / abLen2; // projection param
      t = Math.min(Math.max(t, 0), 1);
      const px = A.x + abx * t, pz = A.z + abz * t;          // closest point on segment
      const dperp = Math.hypot(x - px, z - pz);
      if (dperp > halfWidth) continue;
      const goal = A.y * (1 - t) + B.y * t;
      const w = brushWeight(dperp, halfWidth, hardness);
      const k = hm.idx(i, j);
      hm.heights[k] = hm.heights[k] * (1 - w) + goal * w;
    }
  }
  return r;
}

export function applyNoise(hm: Heightmap, cx: number, cz: number, R: number, hardness: number,
                           amplitude: number, sampleH: (x:number,z:number)=>number): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const w = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (w === 0) continue;
      hm.heights[hm.idx(i, j)] += amplitude * w * sampleH(x, z); // sampleH returns ~[-1,1]
    }
  }
  return r;
}
