/** Heights are caps, not a request to stretch the viewport or supersample a small panel. */
export interface RenderResolutionSettings {
  fsrEnabled: boolean;
  fsrSharpness: number;
  outputHeight: number;
  internalHeight: number;
  /** Used when internalHeight is 0 (automatic). */
  renderScale: number;
}

export const LOW_SPEC_RESOLUTION: Readonly<RenderResolutionSettings> = Object.freeze({
  fsrEnabled: true, fsrSharpness: 0.35, outputHeight: 900, internalHeight: 540, renderScale: 0.6,
});

export function sanitizeResolution(patch: Partial<RenderResolutionSettings>, previous = LOW_SPEC_RESOLUTION): RenderResolutionSettings {
  const next = { ...previous };
  if (typeof patch.fsrEnabled === 'boolean') next.fsrEnabled = patch.fsrEnabled;
  for (const [key, min, max] of [
    ['fsrSharpness', 0, 1], ['outputHeight', 0, 4320], ['internalHeight', 0, 4320], ['renderScale', 0.5, 1.5],
  ] as const) {
    const value = patch[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = Math.max(min, Math.min(max, value));
  }
  for (const key of ['outputHeight', 'internalHeight'] as const) {
    next[key] = next[key] === 0 ? 0 : Math.max(240, Math.round(next[key]));
  }
  return next;
}

export function resolveRenderResolution(width: number, height: number, dpr: number,
  settings: RenderResolutionSettings, maxTextureSize = 4096) {
  const positive = (n: number, fallback: number) => Number.isFinite(n) && n > 0 ? n : fallback;
  const w = positive(width, 1), h = positive(height, 1);
  const ratio = Math.min(positive(dpr, 1), 2);
  const limit = positive(maxTextureSize, 4096);
  const outputScale = Math.min(ratio, limit / w, limit / h,
    settings.outputHeight > 0 ? settings.outputHeight / h : Infinity,
    settings.outputHeight > 0 ? settings.outputHeight * 16 / 9 / w : Infinity);
  const outputWidth = Math.max(1, Math.floor(w * outputScale));
  const outputHeight = Math.max(1, Math.floor(h * outputScale));
  const internalScale = settings.internalHeight > 0
    ? Math.min(1, settings.internalHeight / outputHeight, settings.internalHeight * 16 / 9 / outputWidth)
    : settings.renderScale;
  const boundedScale = Math.min(internalScale, limit / outputWidth, limit / outputHeight);
  return {
    outputWidth, outputHeight,
    internalWidth: Math.max(1, Math.round(outputWidth * boundedScale)),
    internalHeight: Math.max(1, Math.round(outputHeight * boundedScale)),
  };
}
