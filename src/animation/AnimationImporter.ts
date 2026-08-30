import * as THREE from 'three';
import { retargetClips, collectTargetBoneNames, extractSkeletonGraph, type SkeletonNode } from './RetargetEngine';
import { collectBoneNamesFromObject } from './SkeletonProfile';
import type { AnimationPackDef, RuntimeAnimationPack, PackEntryMeta } from './AnimationPack';
import { inferCategory, inferLoop, sanitizeEntryId } from './AnimationPack';
import type { AnimationPackRegistry } from './AnimationPackRegistry';
import type { AssetEntry } from './AssetManifest';
import { classifyAsset, normalizeModel } from '../assets/ScaleNormalizer';
import { buildRetargetProReport, type RetargetProReport } from './RetargetProReport';

/** Clip names Mixamo/FBX exporters use that carry no information — replaced by the file name. */
const GENERIC_CLIP_NAMES = new Set(['mixamo.com', 'take 001', 'take 001 ', 'animation', 'unnamed', '']);

function isGenericClipName(name: string): boolean {
  return GENERIC_CLIP_NAMES.has(name.trim().toLowerCase())
    // Unreal/FBX stack names such as Hips|Hips|Take1|BaseLayer are metadata,
    // not useful animation titles. Prefer the source filename for the UI.
    || /\|(?:take\s*\d+|baselayer)\b/i.test(name);
}

export interface ImportPackOptions {
  packId: string;
  displayName?: string;
  targetRig: string;
  sourceFiles?: Array<{ name: string; buffer: ArrayBuffer }>;
  sourcePath?: string;
  boneMappingOverride?: Record<string, string>;
  scaleOverride?: number;
  /** Default TRUE — the ASM captures the root track and feeds root motion to physics. */
  keepRootMotion?: boolean;
  /** AAA enables end-effector contact correction; balanced is the production default. */
  qualityPreset?: 'aaa' | 'balanced' | 'fast';
  /** Explicit override for the two-bone foot contact pass. */
  footLock?: boolean;
  targetBoneNamesOverride?: string[];
}

export interface ImportPackResult {
  ok: boolean;
  pack?: RuntimeAnimationPack;
  imported: number;
  warnings: string[];
  error?: string;
  /** Machine-readable quality gate for Codex/Claude Code/HELM and CI. */
  report?: RetargetProReport;
}

export class AnimationImporter {
  constructor(
    private readonly registry: AnimationPackRegistry,
    private readonly assetCache: { checkout: (id: string) => THREE.Group; has: (id: string) => boolean; getAnimations?: (id: string) => THREE.AnimationClip[] },
    /** Optional: lets the importer measure the target rig at the size it is actually
     *  RENDERED at rather than at its raw export scale. See resolveTargetBones. */
    private readonly manifest?: { get: (id: string) => AssetEntry | undefined },
  ) {}

  async importPack(opts: ImportPackOptions): Promise<ImportPackResult> {
    const packId = sanitizePackId(opts.packId);
    if (!packId) return { ok: false, imported: 0, warnings: [], error: 'packId must be a non-empty slug' };

    const targetNames = await this.resolveTargetBones(opts);
    if (!targetNames.ok) return { ok: false, imported: 0, warnings: targetNames.warnings, error: targetNames.error };
    const targetBoneNames = targetNames.boneNames;
    const targetSkeleton = targetNames.skeleton;
    const targetRigId = targetNames.rigId;

    const sources = await this.gatherSources(opts);
    if (!sources.ok) return { ok: false, imported: 0, warnings: sources.warnings, error: sources.error };
    const rawFiles = sources.files;
    if (rawFiles.length === 0) return { ok: false, imported: 0, warnings: sources.warnings, error: 'No .fbx/.glb/.gltf files found in source' };

    const allWarnings: string[] = [...sources.warnings, ...targetNames.warnings];
    const packEntries: PackEntryMeta[] = [];
    const retargetedByEntry = new Map<string, THREE.AnimationClip>();
    const keepRootMotion = opts.keepRootMotion ?? true;

    for (const { fileName, clips, boneNames, skeleton } of rawFiles) {
      if (clips.length === 0) {
        allWarnings.push(`[import] ${fileName}: no animation clips found (is it a mesh-only file?)`);
        continue;
      }
      const fileBase = fileName.replace(/\.[^.]+$/, '');
      for (let ci = 0; ci < clips.length; ci++) {
        const rawClip = clips[ci];
        const entryIdBase = sanitizeEntryId(fileBase);
        const clipName = String(rawClip.name ?? '');
        const entryId = clips.length === 1 ? entryIdBase : `${entryIdBase}__${sanitizeEntryId(clipName || `clip${ci + 1}`)}`;
        // Display name: real clip name unless it's a generic exporter placeholder.
        const displayName = clipName && !isGenericClipName(clipName)
          ? clipName
          : fileBase;

        const retarget = retargetClips([rawClip], targetBoneNames, {
          sourceBoneNames: [...skeleton.keys()],
          translationScale: opts.scaleOverride,
          keepRootMotion,
          sourceSkeleton: skeleton,
          targetSkeleton,
          footLock: opts.footLock ?? opts.qualityPreset === 'aaa',
        });
        allWarnings.push(...retarget.warnings);
        const outClip = retarget.clips[0];
        if (!outClip || outClip.tracks.length === 0) {
          allWarnings.push(`[import] ${fileName} :: ${clipName || 'clip'}: retarget produced empty clip — skipping.`);
          continue;
        }

        const cat = inferCategory(fileName);
        const loop = inferLoop(fileName, cat);
        const entry: PackEntryMeta = {
          id: dedupeEntryId(packEntries, entryId),
          displayName,
          fileName,
          category: cat,
          tags: [cat],
          duration: outClip.duration,
          loop,
          rootMotion: retarget.hasRootTrack[0] ?? false,
          sourceProfileId: retarget.sourceMatch.profile.id,
          translationScale: retarget.scales[0] ?? 1,
        };
        outClip.name = entry.id;
        retargetedByEntry.set(entry.id, outClip);
        packEntries.push(entry);
      }
    }

    if (packEntries.length === 0) {
      return { ok: false, imported: 0, warnings: allWarnings, error: 'All files retargeted to 0 tracks — check that the source skeleton matches a known profile (Mixamo/UE Manny/humanoid)' };
    }

    const def: AnimationPackDef = {
      id: packId,
      displayName: opts.displayName ?? packId,
      targetRig: targetRigId,
      sourcePath: opts.sourcePath ?? '(file drop)',
      createdAt: Date.now(),
      entries: packEntries,
      boneMappingOverride: opts.boneMappingOverride,
      retargetOptions: {
        qualityPreset: opts.qualityPreset,
        footLock: opts.footLock,
        keepRootMotion: opts.keepRootMotion,
        scaleOverride: opts.scaleOverride,
      },
    };
    const pack: RuntimeAnimationPack = { def, clips: retargetedByEntry };
    // retargetClips runs once per clip, so rig-level diagnostics (profile detection,
    // scale, world-frame alignment) repeat for every clip in the pack. Identical
    // strings carry no extra information and only bury the per-clip ones.
    const deduped = [...new Set(allWarnings)];
    this.registry.register(pack, deduped);
    const report = buildRetargetProReport(def, deduped);
    return { ok: true, pack, imported: packEntries.length, warnings: deduped, report };
  }

  /** Reimport a previously-registered pack from its sourcePath (survives reload). */
  async reimport(packId: string): Promise<ImportPackResult> {
    const existing = this.registry.get(packId);
    if (!existing) return { ok: false, imported: 0, warnings: [], error: `no pack '${packId}'` };
    if (!existing.def.sourcePath || existing.def.sourcePath.startsWith('(')) {
      return { ok: false, imported: 0, warnings: [], error: `pack '${packId}' was imported from a file drop — drop the folder again to rebuild it` };
    }
    return this.importPack({
      packId: existing.def.id,
      displayName: existing.def.displayName,
      targetRig: existing.def.targetRig,
      sourcePath: existing.def.sourcePath,
      boneMappingOverride: existing.def.boneMappingOverride,
      qualityPreset: existing.def.retargetOptions?.qualityPreset,
      footLock: existing.def.retargetOptions?.footLock,
      keepRootMotion: existing.def.retargetOptions?.keepRootMotion,
      scaleOverride: existing.def.retargetOptions?.scaleOverride,
    });
  }

  // ─── Target skeleton resolution ─────────────────────────────────────────
  private async resolveTargetBones(opts: ImportPackOptions): Promise<{ ok: true; boneNames: string[]; skeleton: Map<string, SkeletonNode>; rigId: string; warnings: string[] } | { ok: false; error: string; warnings: string[] }> {
    if (opts.targetBoneNamesOverride && opts.targetBoneNamesOverride.length > 0) {
      return { ok: true, boneNames: opts.targetBoneNamesOverride, skeleton: new Map(), rigId: '(override)', warnings: [] };
    }
    const rigId = opts.targetRig;
    if (!rigId) return { ok: false, error: 'targetRig is required (character asset id like "ayo")', warnings: [] };
    try {
      // NOTE: preloaded characters (all MIXAMO_CHARACTERS) are PINNED in the
      // AssetCache, so this checkout/release pair is side-effect free. For an
      // unpinned rig the release may evict the canonical — re-preload it after.
      const group = this.assetCache.checkout(rigId);
      // Measure the rig at the size it will actually be RENDERED at, not at its raw
      // export scale. The character builder normalises every character to its locked
      // height on spawn, so extracting the skeleton from an un-normalised checkout
      // would describe a rig 160x smaller than the one the clips end up driving —
      // which is exactly what made the retargeter report a 0.005-unit leg and refuse
      // to reason about scale at all.
      const entry = this.manifest?.get(rigId);
      if (entry) {
        normalizeModel(
          group,
          classifyAsset({ type: entry.type, tags: entry.tags, sizeClass: entry.sizeClass }),
          { targetSize: entry.targetSize },
        );
      }
      const bones = collectTargetBoneNames(group);
      const skeleton = extractSkeletonGraph(group);
      (this.assetCache as unknown as { release?: (id: string) => void }).release?.(rigId);
      if (bones.length < 5) return { ok: false, error: `target rig '${rigId}' has too few bones (${bones.length}) — not a skinned character?`, warnings: [] };
      return { ok: true, boneNames: bones, skeleton, rigId, warnings: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `target rig '${rigId}' not loaded: ${msg} — preload the character first (drag it into the scene), or pass targetBoneNamesOverride`, warnings: [] };
    }
  }

  // ─── Source gathering ───────────────────────────────────────────────────
  private async gatherSources(opts: ImportPackOptions): Promise<{ ok: true; files: Array<{ fileName: string; clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }>; warnings: string[] } | { ok: false; error: string; warnings: string[] }> {
    const warnings: string[] = [];
    if (opts.sourceFiles && opts.sourceFiles.length > 0) {
      const files = await this.loadFromBuffers(opts.sourceFiles, warnings);
      return { ok: true, files, warnings };
    }
    if (opts.sourcePath) {
      try {
        const listing = await this.listDevServerFolder(opts.sourcePath);
        if (listing.files.length === 0) {
          return { ok: false, error: `No files returned for folder '${opts.sourcePath}' — is the dev server running and does the folder exist under public/ (or games/<active>/assets)?`, warnings };
        }
        const base = listing.base ?? opts.sourcePath;
        const buffers: Array<{ name: string; buffer: ArrayBuffer }> = [];
        const loadedFromUrls: Array<{ fileName: string; clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }> = [];
        for (const entry of listing.files) {
          if (!/\.(fbx|glb|gltf)$/i.test(entry)) continue;
          const url = joinUrl(base, entry);
          try {
            // A .gltf commonly keeps its binary payload in a sibling .bin file.
            // Loading the URL directly lets GLTFLoader resolve that external buffer;
            // the old buffer-only path intentionally remains for dropped files and
            // self-contained GLB/FBX sources.
            if (/\.gltf$/i.test(entry)) {
              loadedFromUrls.push({ fileName: entry, ...(await this.loadGltfUrl(entry, url)) });
              continue;
            }
            const res = await fetch(url);
            if (!res.ok) { warnings.push(`[import] fetch ${url}: ${res.status}`); continue; }
            buffers.push({ name: entry, buffer: await res.arrayBuffer() });
          } catch (e) {
            warnings.push(`[import] fetch ${url} failed: ${String(e)}`);
          }
        }
        const loaded = await this.loadFromBuffers(buffers, warnings);
        return { ok: true, files: [...loadedFromUrls, ...loaded], warnings };
      } catch (e) {
        return { ok: false, error: `listing folder '${opts.sourcePath}' failed: ${String(e)} — the dev server's /api/list-assets may not be running.  Fallback: drag the folder onto the viewport instead.`, warnings };
      }
    }
    return { ok: false, error: 'importPack requires either sourceFiles (folder drop) or sourcePath (dev-server folder)', warnings };
  }

  private async loadFromBuffers(
    files: Array<{ name: string; buffer: ArrayBuffer }>,
    warnings: string[],
  ): Promise<Array<{ fileName: string; clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }>> {
    const out: Array<{ fileName: string; clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }> = [];
    for (const { name, buffer } of files) {
      if (!/\.(fbx|glb|gltf)$/i.test(name)) {
        warnings.push(`[import] skipping ${name}: not a .fbx/.glb/.gltf`);
        continue;
      }
      try {
        const { clips, boneNames, skeleton } = await this.loadSingleFile(name, buffer);
        out.push({ fileName: name, clips, boneNames, skeleton });
      } catch (e) {
        warnings.push(`[import] ${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return out;
  }

  private async loadSingleFile(fileName: string, buffer: ArrayBuffer): Promise<{ clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }> {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.fbx')) return this.loadFbx(fileName, buffer);
    return this.loadGltf(fileName, buffer);
  }

  private async loadFbx(fileName: string, buffer: ArrayBuffer): Promise<{ clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }> {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const loader = new FBXLoader();
    const group = loader.parse(buffer, '');
    const clips: THREE.AnimationClip[] = (group as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [];
    const boneNames = collectBoneNamesFromObject(group);
    const skeleton = extractSkeletonGraph(group);
    void fileName;
    return { clips, boneNames, skeleton };
  }

  private async loadGltf(fileName: string, buffer: ArrayBuffer): Promise<{ clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    try {
      const gltf = await loader.loadAsync(url);
      const clips: THREE.AnimationClip[] = gltf.animations ?? [];
      const boneNames = collectBoneNamesFromObject(gltf.scene);
      const skeleton = extractSkeletonGraph(gltf.scene);
      return { clips, boneNames, skeleton };
    } finally {
      URL.revokeObjectURL(url);
      void fileName;
    }
  }

  private async loadGltfUrl(fileName: string, url: string): Promise<{ clips: THREE.AnimationClip[]; boneNames: string[]; skeleton: Map<string, SkeletonNode> }> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const clips: THREE.AnimationClip[] = gltf.animations ?? [];
    const boneNames = collectBoneNamesFromObject(gltf.scene);
    const skeleton = extractSkeletonGraph(gltf.scene);
    void fileName;
    return { clips, boneNames, skeleton };
  }

  private async listDevServerFolder(folder: string): Promise<{ files: string[]; base?: string }> {
    const url = `/api/list-assets?path=${encodeURIComponent(folder)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { files?: string[]; entries?: string[]; base?: string };
    return { files: data.files ?? data.entries ?? [], base: data.base };
  }
}

function sanitizePackId(id: string): string {
  return id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function joinUrl(folder: string, file: string): string {
  const base = folder.endsWith('/') ? folder : folder + '/';
  return base + encodeURIComponent(file);
}

function dedupeEntryId(existing: PackEntryMeta[], base: string): string {
  if (!existing.some(e => e.id === base)) return base;
  let n = 2;
  while (existing.some(e => e.id === `${base}_${n}`)) n++;
  return `${base}_${n}`;
}
