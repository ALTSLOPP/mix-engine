import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import {
  isVisualStyleName,
  resolveVisualStyle,
  applyVisualStyle,
  captureVisualStyle,
  VISUAL_STYLE_NAMES,
  type VisualStyle,
} from '../../features/VisualStyles';

/** Fallback look registry when no BakeRegistry is wired (e.g. bare unit tests). */
const bakedLooks = new Map<string, VisualStyle>();

interface LookStore {
  set: (n: string, v: VisualStyle) => void;
  setActive: (n: string) => boolean;
  list: () => string[];
  get: (n: string) => VisualStyle | undefined;
}

/** Prefer the engine's persistable {@link BakeRegistry}; fall back to the module map. */
function store(ctx: CmdCtx): LookStore {
  if (ctx.bakes) {
    return {
      set: (n, v) => ctx.bakes!.setLook(n, v),
      setActive: (n) => ctx.bakes!.setActiveLook(n),
      list: () => ctx.bakes!.listLooks(),
      get: (n) => ctx.bakes!.getLook(n),
    };
  }
  return {
    set: (n, v) => { bakedLooks.set(n, v); },
    setActive: (n) => { if (!bakedLooks.has(n)) return false; bakedLooks.set(n, bakedLooks.get(n)!); return true; },
    list: () => Array.from(bakedLooks.keys()),
    get: (n) => bakedLooks.get(n),
  };
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  const s = store(ctx);

  map.set('set_visual_style', (cmd: Extract<AICommand, { type: 'set_visual_style' }>) => {
    if (!isVisualStyleName(cmd.style)) {
      ctx.setQueryResult({
        ok: false,
        error: `Unknown style "${String(cmd.style)}". Known: ${VISUAL_STYLE_NAMES.join(', ')}`,
      });
      return;
    }
    const style = resolveVisualStyle(cmd.style, cmd.overrides);
    applyVisualStyle(ctx.viewport, style);
    // Remember the live look so a later save_game persists it for reload.
    s.set(cmd.style, style);
    ctx.setQueryResult({ ok: true, style: cmd.style, applied: true });
  });

  map.set('bake_scene', (cmd: Extract<AICommand, { type: 'bake_scene' }>) => {
    const name = cmd.name ?? 'default';
    const recipe = captureVisualStyle(ctx.viewport);
    s.set(name, recipe);
    ctx.setQueryResult({
      ok: true,
      baked: name,
      // A token-efficient summary so the agent can verify the bake landed without
      // round-tripping the whole 30-field recipe.
      recipe: summaryOf(recipe),
    });
  });

  map.set('bake_apply', (cmd: Extract<AICommand, { type: 'bake_apply' }>) => {
    const recipe = s.get(cmd.name);
    if (!recipe) {
      ctx.setQueryResult({ ok: false, error: `No baked look named "${cmd.name}".` });
      return;
    }
    applyVisualStyle(ctx.viewport, recipe);
    s.setActive(cmd.name);
    ctx.setQueryResult({ ok: true, applied: cmd.name });
  });

  map.set('bake_list', () => {
    ctx.setQueryResult({ ok: true, baked: s.list() });
  });
}

/** Compact human-readable snapshot of a recipe (for the agent's reasoning). */
function summaryOf(r: VisualStyle): Record<string, unknown> {
  return {
    sun: { elevationDeg: Math.round(r.elevationDeg), azimuthDeg: Math.round(r.azimuthDeg) },
    exposure: +r.exposure.toFixed(3),
    fogDensity: +r.fogDensity.toFixed(4),
    shadowStrategy: r.shadowStrategy,
    bloom: r.bloom,
    ssr: r.ssr,
    volumetricFog: r.volumetricFog,
    contactShadows: r.contactShadows,
    taa: r.taa,
    colorGrade: r.colorGrade,
    vignette: r.vignette,
  };
}
