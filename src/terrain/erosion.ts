export interface HydraulicOptions {
  iterations: number;     // # droplets (e.g. 50_000 for a 256² tile)
  maxLifetime: number;    // 30
  inertia: number;        // 0.05  (0 = follow gradient exactly; 1 = keep direction)
  capacityFactor: number; // 4
  minCapacity: number;    // 0.01
  depositSpeed: number;   // 0.3
  erodeSpeed: number;     // 0.3
  evaporateSpeed: number; // 0.01
  gravity: number;        // 4
  erosionRadius: number;  // 3 (cells)
  startSpeed: number;     // 1
  startWater: number;     // 1
}

export function erodeHydraulic(heights: Float32Array, res: number,
                               opts: HydraulicOptions, rng: () => number,
                               region: { i0:number; i1:number; j0:number; j1:number }): void {
  const at = (i: number, j: number) => heights[
    Math.min(Math.max(j,0),res-1) * res + Math.min(Math.max(i,0),res-1)];

  // Precompute a normalised erosion kernel (weights ∝ max(0, radius - dist)).
  const rad = opts.erosionRadius;
  const kernel: { di:number; dj:number; w:number }[] = [];
  let kw = 0;
  for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    const d = Math.hypot(di, dj);
    if (d < rad) { const w = rad - d; kernel.push({ di, dj, w }); kw += w; }
  }
  for (const k of kernel) k.w /= kw;

  for (let n = 0; n < opts.iterations; n++) {
    let px = region.i0 + rng() * (region.i1 - region.i0);   // float cell coords
    let pz = region.j0 + rng() * (region.j1 - region.j0);
    let dx = 0, dz = 0, speed = opts.startSpeed, water = opts.startWater, sediment = 0;

    for (let life = 0; life < opts.maxLifetime; life++) {
      const ci = Math.floor(px), cj = Math.floor(pz);
      const fx = px - ci, fz = pz - cj;
      const h00 = at(ci,cj), h10 = at(ci+1,cj), h01 = at(ci,cj+1), h11 = at(ci+1,cj+1);
      const oldH = (h00*(1-fx)+h10*fx)*(1-fz) + (h01*(1-fx)+h11*fx)*fz;
      // Gradient of the bilinear patch.
      const gx = (h10 - h00)*(1-fz) + (h11 - h01)*fz;
      const gz = (h01 - h00)*(1-fx) + (h11 - h10)*fx;
      // Update direction with inertia, then normalise.
      dx = dx*opts.inertia - gx*(1-opts.inertia);
      dz = dz*opts.inertia - gz*(1-opts.inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) break;                  // sitting in a flat pit — stop
      dx /= len; dz /= len;
      const nx = px + dx, nz = pz + dz;
      if (nx < region.i0 || nx > region.i1 || nz < region.j0 || nz > region.j1) break;

      const newH = (() => { const i=Math.floor(nx), j=Math.floor(nz), a=nx-i, b=nz-j;
        return (at(i,j)*(1-a)+at(i+1,j)*a)*(1-b) + (at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b; })();
      const dH = newH - oldH;
      const capacity = Math.max(-dH * speed * water * opts.capacityFactor, opts.minCapacity);

      if (sediment > capacity || dH > 0) {
        // Deposit. Going uphill: try to fill the pit (capped at dH). Else drop the excess.
        const drop = dH > 0 ? Math.min(dH, sediment) : (sediment - capacity) * opts.depositSpeed;
        sediment -= drop;
        // Spread the deposit onto the 4 corners of the OLD cell (bilinear).
        heights[cj*res+ci]         += drop*(1-fx)*(1-fz);
        heights[cj*res+ci+1]       += drop*fx*(1-fz);
        heights[(cj+1)*res+ci]     += drop*(1-fx)*fz;
        heights[(cj+1)*res+ci+1]   += drop*fx*fz;
      } else {
        // Erode, but never dig deeper than the height drop (no negative spikes).
        const take = Math.min((capacity - sediment) * opts.erodeSpeed, -dH);
        for (const k of kernel) {
          const i = ci + k.di, j = cj + k.dj;
          if (i < 0 || i >= res || j < 0 || j >= res) continue;
          heights[j*res+i] -= take * k.w;
        }
        sediment += take;
      }
      speed = Math.sqrt(Math.max(0, speed*speed + (oldH - newH) * opts.gravity)); // downhill speeds up
      water *= (1 - opts.evaporateSpeed);
      px = nx; pz = nz;
    }
  }
}

export function erodeThermal(heights: Float32Array, res: number,
                             talus: number, factor: number, iterations: number,
                             region: { i0:number;i1:number;j0:number;j1:number }): void {
  const delta = new Float32Array(heights.length);
  const N = [[-1,0],[1,0],[0,-1],[0,1]] as const;
  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let j = region.j0; j <= region.j1; j++) {
      for (let i = region.i0; i <= region.i1; i++) {
        const h = heights[j*res+i];
        for (const [di,dj] of N) {
          const ni = i+di, nj = j+dj;
          if (ni<0||ni>=res||nj<0||nj>=res) continue;
          const diff = h - heights[nj*res+ni];
          if (diff > talus) {
            const move = (diff - talus) * factor * 0.5;   // 0.5 = split evenly, stable
            delta[j*res+i]   -= move;
            delta[nj*res+ni] += move;
          }
        }
      }
    }
    for (let k = 0; k < heights.length; k++) heights[k] += delta[k];
  }
}
