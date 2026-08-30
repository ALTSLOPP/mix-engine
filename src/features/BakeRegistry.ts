import * as THREE from 'three';
import { applyVisualStyle, type VisualStyle } from './VisualStyles';
import { bakeVertexAO } from './BakePipeline';
import type { Viewport } from '../rendering/Viewport';

/** GameState kv key that carries bakes through `save_game` / `load_game`. */
export const BAKE_STATE_KEY = '__bakes__';

/** The exact params needed to re-run a deterministic AO bake. */
export interface AORecipe {
  samples: number;
  distance: number;
  seed: number;
  strength: number;
}

export interface BakeRegistrySnapshot {
  /** Named look recipes. */
  looks: Record<string, VisualStyle>;
  /** The name of the currently-applied look, if any. */
  activeLook: string | null;
  /** The last AO bake params, if any (re-run to reproduce on reload). */
  ao: AORecipe | null;
}

/**
 * BakeRegistry — single source of truth for the *persistable* baking state: named visual
 * look recipes plus the last deterministic AO bake. Because AO bakes are seeded and
 * reproducible, persistence stores the *recipe*, not vertex buffers: re-running the same
 * `bakeVertexAO(params)` on a freshly-recreated world yields bit-identical occlusion, so a
 * baked look survives reload with zero geometry coupling.
 */
export class BakeRegistry {
  private looks: Map<string, VisualStyle> = new Map();
  private activeLook: string | null = null;
  private ao: AORecipe | null = null;
  private pending = false;

  /** Record a named look recipe and make it active (e.g. after `bake_scene`). */
  setLook(name: string, style: VisualStyle): void {
    this.looks.set(name, style);
    this.activeLook = name;
    this.pending = true;
  }

  hasLook(name: string): boolean {
    return this.looks.has(name);
  }

  getLook(name: string): VisualStyle | undefined {
    return this.looks.get(name);
  }

  listLooks(): string[] {
    return Array.from(this.looks.keys());
  }

  setActiveLook(name: string): boolean {
    if (!this.looks.has(name)) return false;
    this.activeLook = name;
    this.pending = true;
    return true;
  }

  get activeLookName(): string | null {
    return this.activeLook;
  }

  /** The style currently in force (used by `bake_apply` to re-apply on the viewport). */
  activeVisualStyle(): VisualStyle | undefined {
    return this.activeLook ? this.looks.get(this.activeLook) : undefined;
  }

  /** Record the params of the last AO bake (re-run to reproduce on reload). */
  setAO(recipe: AORecipe): void {
    this.ao = recipe;
    this.pending = true;
  }

  get aoRecipe(): AORecipe | null {
    return this.ao;
  }

  clearAO(): void {
    this.ao = null;
    this.pending = true;
  }

  serialize(): BakeRegistrySnapshot {
    const looks: Record<string, VisualStyle> = {};
    for (const [name, style] of this.looks) looks[name] = style;
    return { looks, activeLook: this.activeLook, ao: this.ao };
  }

  /** Restore a previous snapshot; marks a pending re-apply for the engine frame. */
  restore(snapshot: BakeRegistrySnapshot): void {
    this.looks.clear();
    for (const [name, style] of Object.entries(snapshot.looks ?? {})) this.looks.set(name, style);
    this.activeLook = snapshot.activeLook ?? null;
    this.ao = snapshot.ao ?? null;
    this.pending = true;
  }

  /** Clear all state (called on world teardown / load_scene). */
  reset(): void {
    this.looks.clear();
    this.activeLook = null;
    this.ao = null;
    this.pending = false;
  }

  /**
   * Engine-frame hook: if a restore/set left a pending apply and there are meshes to bake,
   * re-apply the active look style to the viewport and re-run the deterministic AO bake on
   * the (now-rebuilt) world. Returns true when it completed.
   */
  applyPending(viewport: Viewport, roots: THREE.Object3D[]): boolean {
    if (!this.pending) return true;
    const style = this.activeVisualStyle();
    if (style) applyVisualStyle(viewport, style);

    const meshes: THREE.Mesh[] = [];
    if (this.ao) {
      for (const root of roots) {
        if (!root) continue;
        root.traverse((node) => {
          const m = node as THREE.Mesh;
          if (m.isMesh && m.geometry?.attributes?.position) meshes.push(m);
        });
      }
      if (meshes.length) {
        viewport.scene.updateMatrixWorld(true);
        bakeVertexAO(meshes, this.ao);
      }
    }
    this.pending = false;
    return true;
  }
}
