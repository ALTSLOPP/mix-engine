import type { AssetEntry } from '../animation/AssetManifest';

/**
 * SemanticAssetRegistry.ts — natural-language → asset resolution.
 *
 * The spec: an agent writes `spawn('rusty red car')` and the engine should
 *   1. find a vehicle mesh tagged `sedan`/`car`,
 *   2. work out the material adjustments (red base colour + procedural rust),
 *   3. (the builder then) auto-fit a compound physics collider.
 *
 * This module owns steps 1–2 as PURE, deterministic, unit-testable logic over the
 * AssetManifest's tag metadata. It never touches THREE or the GPU — it produces a plain
 * {@link AssetResolution} describing WHICH asset and HOW to dress it; the `semanticInstance`
 * builder consumes that to clone materials, tint, weather, and build the collider.
 *
 * The parsing is intentionally lexicon-driven rather than ML: a small, legible map of
 * colour words, weathering words, material words, and category synonyms. An LLM author
 * can read it, predict it, and extend it — the AI-native spirit (no opaque black box
 * between the prompt and the spawn).
 */

/** A colour word → packed 0xRRGGBB. */
export const COLOR_LEXICON: Record<string, number> = {
  red: 0xc0392b, crimson: 0xb01030, scarlet: 0xd0211a,
  orange: 0xe67e22, amber: 0xff9f1a,
  yellow: 0xf1c40f, gold: 0xd4af37, golden: 0xd4af37,
  green: 0x2ecc71, lime: 0x7fdc3a, olive: 0x808000, emerald: 0x2ecc71,
  teal: 0x008f8f, cyan: 0x17c0c0, turquoise: 0x1abc9c,
  blue: 0x2e6fc0, navy: 0x1b2a4a, azure: 0x3a8fe0, sky: 0x7fb6e8,
  purple: 0x8e44ad, violet: 0x8a2be2, magenta: 0xc0207a, pink: 0xe084b0,
  brown: 0x6b4423, tan: 0xb08d57, beige: 0xd8c8a8,
  black: 0x141414, white: 0xf0f0f0, gray: 0x808080, grey: 0x808080,
  silver: 0xc0c4c8, chrome: 0xcfd4d8, gunmetal: 0x4a5058,
};

/** Words that imply weathering/material finish, mapped onto material params. */
interface FinishHint {
  rust?: number;
  dirt?: number;
  metalness?: number;
  roughness?: number;
}
export const FINISH_LEXICON: Record<string, FinishHint> = {
  rusty: { rust: 0.85, roughness: 0.95, metalness: 0.15 },
  rusted: { rust: 0.9, roughness: 0.95, metalness: 0.1 },
  rust: { rust: 0.8, roughness: 0.95 },
  corroded: { rust: 0.8, roughness: 0.9 },
  weathered: { rust: 0.4, dirt: 0.4, roughness: 0.85 },
  worn: { rust: 0.25, dirt: 0.3, roughness: 0.8 },
  old: { rust: 0.3, dirt: 0.35, roughness: 0.8 },
  dirty: { dirt: 0.7, roughness: 0.8 },
  grimy: { dirt: 0.75, roughness: 0.85 },
  muddy: { dirt: 0.8, roughness: 0.9 },
  dusty: { dirt: 0.5, roughness: 0.8 },
  clean: { rust: 0, dirt: 0, roughness: 0.4 },
  new: { rust: 0, dirt: 0, roughness: 0.4 },
  pristine: { rust: 0, dirt: 0, roughness: 0.25 },
  metallic: { metalness: 0.9, roughness: 0.3 },
  metal: { metalness: 0.85, roughness: 0.35 },
  steel: { metalness: 0.9, roughness: 0.3 },
  chrome: { metalness: 1.0, roughness: 0.08 },
  shiny: { roughness: 0.12 },
  polished: { roughness: 0.1 },
  glossy: { roughness: 0.15 },
  matte: { roughness: 0.9, metalness: 0.0 },
  rough: { roughness: 0.9 },
};

/** Category nouns → the tags they should match (synonym expansion). */
export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  car: ['vehicle', 'car', 'sedan', 'automobile'],
  sedan: ['vehicle', 'sedan', 'car'],
  truck: ['vehicle', 'truck', 'lorry'],
  van: ['vehicle', 'van'],
  bus: ['vehicle', 'bus'],
  bike: ['vehicle', 'bike', 'motorcycle', 'motorbike'],
  motorcycle: ['vehicle', 'motorcycle', 'bike'],
  vehicle: ['vehicle'],
  tree: ['tree', 'vegetation', 'flora'],
  bush: ['bush', 'vegetation', 'flora', 'shrub'],
  shrub: ['bush', 'shrub', 'vegetation'],
  grass: ['grass', 'vegetation', 'flora'],
  plant: ['vegetation', 'flora', 'plant'],
  lamp: ['lamp', 'streetlamp', 'light', 'prop'],
  streetlamp: ['streetlamp', 'lamp', 'light', 'prop'],
  light: ['light', 'lamp', 'streetlamp'],
  bench: ['bench', 'seating', 'prop'],
  trash: ['trash', 'debris', 'garbage', 'bin'],
  garbage: ['trash', 'garbage', 'debris', 'bin'],
  bin: ['bin', 'trash', 'garbage'],
  can: ['can', 'trash', 'bin'],
  fountain: ['fountain', 'prop'],
  mailbox: ['mailbox', 'prop'],
  planter: ['planter', 'prop'],
  gate: ['gate', 'prop'],
  vending: ['vending', 'machine', 'prop'],
  machine: ['machine', 'vending', 'prop'],
  sword: ['sword', 'weapon', 'blade', 'katana'],
  katana: ['katana', 'sword', 'weapon', 'blade'],
  blade: ['blade', 'sword', 'weapon'],
  weapon: ['weapon'],
  enemy: ['enemy', 'character'],
  character: ['character'],
  building: ['building', 'structure'],
  prop: ['prop'],
  debris: ['debris', 'trash'],
};

/** Words ignored entirely when picking the noun. */
const STOPWORDS = new Set(['a', 'an', 'the', 'with', 'of', 'and', 'some', 'my', 'that', 'this']);

export interface SemanticDescriptor {
  query: string;
  /** Cleaned noun tokens (after stripping colour/finish/stopwords), in original order. */
  nouns: string[];
  /** All tags the nouns expand to (for scoring). */
  tagTokens: string[];
  /** Resolved base colour (0xRRGGBB) or null if none named. */
  color: number | null;
  rust: number;
  dirt: number;
  metalness?: number;
  roughness?: number;
}

export interface MaterialAdjustment {
  tint?: number;
  metalness?: number;
  roughness?: number;
  rust?: number;
  dirt?: number;
}

export interface AssetResolution {
  assetId: string;
  /** Tag-overlap confidence, 0..1. */
  score: number;
  descriptor: SemanticDescriptor;
  material: MaterialAdjustment;
}

/** Split a free-text query into lowercase alphanumeric tokens. */
export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

/**
 * Parse a free-text descriptor ("rusty red car") into structured colour / finish / noun
 * data. Pure + deterministic. A token may contribute to several buckets, but a colour or
 * finish word is never treated as a noun.
 */
export function parseDescriptor(query: string): SemanticDescriptor {
  const tokens = tokenize(query);
  let color: number | null = null;
  let rust = 0;
  let dirt = 0;
  let metalness: number | undefined;
  let roughness: number | undefined;
  const nouns: string[] = [];

  for (const t of tokens) {
    // A token can be both a colour AND a finish (e.g. 'chrome' → silvery + metallic), so
    // apply both effects; only skip the noun bucket if it was either.
    const isColor = t in COLOR_LEXICON;
    const isFinish = t in FINISH_LEXICON;
    if (isColor) color = COLOR_LEXICON[t];
    if (isFinish) {
      const f = FINISH_LEXICON[t];
      if (f.rust !== undefined) rust = Math.max(rust, f.rust);
      if (f.dirt !== undefined) dirt = Math.max(dirt, f.dirt);
      if (f.metalness !== undefined) metalness = f.metalness;
      if (f.roughness !== undefined) roughness = f.roughness;
      // 'clean'/'new' explicitly zero weathering even if another word raised it.
      if (f.rust === 0) rust = 0;
      if (f.dirt === 0) dirt = 0;
    }
    if (isColor || isFinish) continue;
    if (STOPWORDS.has(t)) continue;
    nouns.push(t);
  }

  // Expand nouns into the tag tokens used for scoring (synonyms + the noun itself).
  const tagSet = new Set<string>();
  for (const n of nouns) {
    tagSet.add(n);
    for (const syn of CATEGORY_SYNONYMS[n] ?? []) tagSet.add(syn);
  }

  return { query, nouns, tagTokens: [...tagSet], color, rust, dirt, metalness, roughness };
}

/**
 * Score how well an asset matches a descriptor's noun/tag tokens, 0..1. The asset's tags
 * plus its id (tokenized) are matched against the descriptor's expanded tag tokens. Exact
 * tag hits weigh full; an id substring match weighs less. Normalised by the noun count so
 * a single matched category gives a strong score.
 */
export function scoreAsset(descriptor: SemanticDescriptor, entry: AssetEntry): number {
  if (descriptor.tagTokens.length === 0) return 0;
  const assetTags = new Set(entry.tags.map((t) => t.toLowerCase()));
  const idTokens = tokenize(entry.id);
  // Weighted COVERAGE: how many of the requested tag tokens this asset matches, by quality
  // (exact tag = 1, id-token = 0.6, fuzzy id substring = 0.3), normalised by the request
  // size. Coverage — not a single strong hit — is what discriminates a `bench` from a
  // `trash can` when both happen to share the generic `prop` tag.
  let sum = 0;
  for (const tok of descriptor.tagTokens) {
    if (assetTags.has(tok)) sum += 1;
    else if (idTokens.includes(tok)) sum += 0.6;
    else if (idTokens.some((it) => it.includes(tok) || tok.includes(it))) sum += 0.3;
  }
  if (sum === 0) return 0;
  return Math.min(1, sum / descriptor.tagTokens.length);
}

/** Build the material adjustment a builder applies, from a parsed descriptor. */
export function materialFromDescriptor(d: SemanticDescriptor): MaterialAdjustment {
  const m: MaterialAdjustment = {};
  if (d.color !== null) m.tint = d.color;
  if (d.rust > 0) m.rust = d.rust;
  if (d.dirt > 0) m.dirt = d.dirt;
  if (d.metalness !== undefined) m.metalness = d.metalness;
  if (d.roughness !== undefined) m.roughness = d.roughness;
  return m;
}

/** Minimal manifest surface the registry reads (kept narrow for testability). */
export interface AssetCatalog {
  toJSON(): AssetEntry[];
}

export class SemanticAssetRegistry {
  constructor(private readonly catalog: AssetCatalog) {}

  /** Resolve a free-text query to the best-matching asset + how to dress it. Returns the
   *  top match above `minScore`, or null if nothing matches (caller decides the fallback). */
  resolve(query: string, minScore = 0.15): AssetResolution | null {
    const descriptor = parseDescriptor(query);
    const material = materialFromDescriptor(descriptor);
    let best: AssetResolution | null = null;
    for (const entry of this.catalog.toJSON()) {
      const score = scoreAsset(descriptor, entry);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { assetId: entry.id, score, descriptor, material };
    }
    if (!best || best.score < minScore) return null;
    return best;
  }

  /** Like resolve() but returns the top `k` candidates (descending score) — useful for an
   *  agent that wants to disambiguate ("did you mean the sedan or the truck?"). */
  rank(query: string, k = 5): AssetResolution[] {
    const descriptor = parseDescriptor(query);
    const material = materialFromDescriptor(descriptor);
    const scored: AssetResolution[] = [];
    for (const entry of this.catalog.toJSON()) {
      const score = scoreAsset(descriptor, entry);
      if (score > 0) scored.push({ assetId: entry.id, score, descriptor, material });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
