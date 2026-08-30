import { validateFeatureRuntime } from './RuntimeSnapshot';
import { disposeOwnedObject } from './DisposeOwnedObject';
import { gameplayWallet } from './GameplayWallet';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { BarricadeConfig, BarricadeDef, BarricadeState, BarricadeTier } from './types';

export const DEFAULT_BARRICADE_CONFIG: BarricadeConfig = {
  enabled: true,
  repairHoldDurationSec: 0.75,
  pointsPerPlank: 10,
  barricades: [
    { id: 'window_north', position: { x: 0, y: 1, z: -10 }, maxPlanks: 6, tier: 'wood', name: 'North Window' },
    { id: 'window_south', position: { x: 0, y: 1, z: 10 }, maxPlanks: 6, tier: 'wood', name: 'South Window' },
    { id: 'window_east', position: { x: 10, y: 1, z: 0 }, maxPlanks: 6, tier: 'wood', name: 'East Window' },
    { id: 'window_west', position: { x: -10, y: 1, z: 0 }, maxPlanks: 6, tier: 'wood', name: 'West Window' },
  ],
};

export class BarricadeBoardingSystem {
  private config: BarricadeConfig;
  private readonly barricades = new Map<string, BarricadeState>();
  private readonly barricadeMeshes = new Map<string, THREE.Group>();
  private readonly rootGroup = new THREE.Group();
  private readonly unsubs: Array<() => void> = [];

  constructor(private readonly engine: Engine, initialConfig: BarricadeConfig = DEFAULT_BARRICADE_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'BarricadeBoardingRoot';
    this.initializeBarricades();
  }

  private initializeBarricades(): void {
    this.clearAll();
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    for (const def of this.config.barricades) {
      const pos = new THREE.Vector3(def.position.x, def.position.y, def.position.z);
      const state: BarricadeState = {
        id: def.id,
        currentPlanks: def.maxPlanks,
        maxPlanks: def.maxPlanks,
        tier: def.tier,
        isBreached: false,
        position: pos,
      };
      this.barricades.set(def.id, state);
      this.createBarricadeMesh(state);
    }
  }

  private createBarricadeMesh(state: BarricadeState): void {
    const group = new THREE.Group();
    group.name = `Barricade_${state.id}`;
    group.position.copy(state.position);

    // Frame
    const frameGeo = new THREE.BoxGeometry(2.2, 2.6, 0.2);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x332211, wireframe: true });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    group.add(frameMesh);

    // Planks
    const plankGroup = new THREE.Group();
    plankGroup.name = 'Planks';

    let plankColor = 0x8b5a2b; // Wood
    if (state.tier === 'metal') plankColor = 0x708090;
    if (state.tier === 'electrified') plankColor = 0x00bfff;

    for (let i = 0; i < state.maxPlanks; i++) {
      const plankGeo = new THREE.BoxGeometry(2.0, 0.3, 0.08);
      const plankMat = new THREE.MeshBasicMaterial({ color: plankColor });
      const plankMesh = new THREE.Mesh(plankGeo, plankMat);
      plankMesh.name = `Plank_${i}`;
      plankMesh.position.set(0, -1.0 + i * 0.4, 0.05);
      plankMesh.visible = i < state.currentPlanks;
      plankGroup.add(plankMesh);
    }

    group.add(plankGroup);
    this.rootGroup.add(group);
    this.barricadeMeshes.set(state.id, group);
  }

  setConfig(config: Partial<BarricadeConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
    if (config.barricades) {
      this.config.barricades = [...config.barricades];
      this.initializeBarricades();
    }
    this.rootGroup.visible = this.config.enabled;
  }

  getConfig(): Readonly<BarricadeConfig> {
    return this.config;
  }

  getBarricade(id: string): BarricadeState | undefined {
    return this.barricades.get(id);
  }

  getBarricades(): readonly BarricadeState[] {
    return Array.from(this.barricades.values());
  }

  damageBarricade(id: string, planksTorn = 1): boolean {
    if (!this.config.enabled || !Number.isInteger(planksTorn) || planksTorn < 1) return false;
    const b = this.barricades.get(id);
    if (!b || b.currentPlanks <= 0) return false;

    b.currentPlanks = Math.max(0, b.currentPlanks - planksTorn);
    b.isBreached = b.currentPlanks === 0;

    this.updatePlankVisuals(b);
    this.engine.sceneManager?.events?.emit('barricade_damaged', {
      id: b.id,
      planksRemaining: b.currentPlanks,
      isBreached: b.isBreached,
    });

    if (b.isBreached) {
      this.engine.sceneManager?.events?.emit('barricade_breached', { id: b.id });
    }

    return true;
  }

  repairBarricade(id: string, planksAdded = 1): number {
    if (!this.config.enabled || !Number.isInteger(planksAdded) || planksAdded < 1) return 0;
    const b = this.barricades.get(id);
    if (!b || b.currentPlanks >= b.maxPlanks) return 0;

    const actualAdded = Math.min(planksAdded, b.maxPlanks - b.currentPlanks);
    b.currentPlanks += actualAdded;
    b.isBreached = false;

    this.updatePlankVisuals(b);

    const pointsAwarded = actualAdded * this.config.pointsPerPlank;
    gameplayWallet(this.engine).add(pointsAwarded);

    this.engine.sceneManager?.events?.emit('barricade_repaired', {
      id: b.id,
      planksAdded: actualAdded,
      currentPlanks: b.currentPlanks,
      pointsAwarded,
    });

    return actualAdded;
  }

  repairAllBarricades(): number {
    if (!this.config.enabled) return 0;
    let totalAdded = 0;
    for (const b of this.barricades.values()) {
      if (b.currentPlanks < b.maxPlanks) {
        const needed = b.maxPlanks - b.currentPlanks;
        b.currentPlanks = b.maxPlanks;
        b.isBreached = false;
        this.updatePlankVisuals(b);
        totalAdded += needed;
      }
    }
    this.engine.sceneManager?.events?.emit('all_barricades_repaired', { totalPlanksRestored: totalAdded });
    return totalAdded;
  }

  upgradeTier(id: string, newTier: BarricadeTier): boolean {
    if (!this.config.enabled) return false;
    const b = this.barricades.get(id);
    if (!b) return false;

    b.tier = newTier;
    this.updatePlankVisuals(b);
    this.engine.sceneManager?.events?.emit('barricade_upgraded', { id: b.id, tier: newTier });
    return true;
  }

  private updatePlankVisuals(b: BarricadeState): void {
    const meshGroup = this.barricadeMeshes.get(b.id);
    if (!meshGroup) return;

    const plankGroup = meshGroup.getObjectByName('Planks');
    if (plankGroup) {
      for (let i = 0; i < b.maxPlanks; i++) {
        const plank = plankGroup.getObjectByName(`Plank_${i}`);
        if (plank) {
          plank.visible = i < b.currentPlanks;
        }
      }
    }
  }

  clearAll(): void {
    this.barricades.clear();
    for (const mesh of this.barricadeMeshes.values()) {
      disposeOwnedObject(mesh);
      this.rootGroup.remove(mesh);
    }
    this.barricadeMeshes.clear();
    disposeOwnedObject(this.rootGroup);
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.clearAll();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      barricades: Array.from(this.barricades.values()).map((b) => ({
        id: b.id,
        currentPlanks: b.currentPlanks,
        maxPlanks: b.maxPlanks,
        tier: b.tier,
      })),
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    validateFeatureRuntime('barricade_boarding', data);
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (Array.isArray(data.barricades)) {
      for (const item of data.barricades) {
        const b = this.barricades.get(item.id);
        if (b) {
          b.currentPlanks = item.currentPlanks;
          b.isBreached = b.currentPlanks === 0;
          if (item.tier) b.tier = item.tier;
          this.updatePlankVisuals(b);
        }
      }
    }
  }
}
