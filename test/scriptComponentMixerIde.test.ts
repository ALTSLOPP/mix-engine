import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ScriptComponent } from '../src/ecs/ScriptComponent';
import { PersistentGameState } from '../src/ecs/PersistentGameState';
import { EventBus } from '../src/ecs/EventBus';
import type { SceneManager, EntityId } from '../src/ecs/SceneManager';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { createMockEngine } from './helpers/gameplayEngine';
import { CommandRegistry } from '../src/commands/CommandRegistry';

describe('Mixer IDE & AI Assistant Friendly Scripting API', () => {
  it('exposes 1-line destruction, ground, and combat director APIs to entity scripts', () => {
    const engine = createMockEngine();
    const gfm = new GameplayFeatureManager(engine);
    engine.gameplayFeatures = gfm;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.geometry.computeVertexNormals();

    const sm = {
      gameState: new PersistentGameState(),
      events: new EventBus(),
      gameplayFeatures: gfm,
      debugDraw: undefined,
      hud: undefined,
      getRigidBody: (id: number) => ({ mesh, rapierBody: {} }),
      rigidBodyList: [{ mesh, rapierBody: {} }],
      entityAtIndex: () => 1,
      hasTag: () => true,
    } as unknown as SceneManager;

    const scriptSource = `
      // 1. One-line Anime Combat Director triggers
      api.combat.impactFrame('crimson', 2);
      api.combat.hitStop(0.1, 0.05);
      api.combat.cameraPunch(-6, 0.15);
      const outline = api.combat.addOutline(0.04, 0x000000);
      api.state.setItem('hasOutline', !!outline);

      // 2. One-line Ground Crater
      const craterSuccess = api.ground.createCrater(new api.THREE.Vector3(0, 0, 0), 2.5, 0.6);
      api.state.setItem('craterCalled', craterSuccess !== undefined);
    `;

    const sc = new ScriptComponent(1 as EntityId, sm, scriptSource);
    sc.update(0.016);

    expect(sm.gameState.getItem('hasOutline')).toBe(true);
    expect(sm.gameState.getItem('craterCalled')).toBe(true);
    expect(gfm.combatDirector.getImpactState().active).toBe(true);
    expect(gfm.combatDirector.getImpactState().style).toBe('crimson');
  });

  it('validates destruction and anime combat director commands in CommandRegistry', () => {
    const registry = CommandRegistry.default;

    expect(registry.validateCommand({ type: 'destruction_slice_mesh', entityId: 5 }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'destruction_create_crater', center: { x: 0, y: 0, z: 0 } }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'combat_trigger_impact_frame', style: 'crimson' }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'combat_trigger_impact_frame', style: 'invalid_style' }).valid).toBe(false);
    expect(registry.validateCommand({ type: 'combat_trigger_hit_stop', duration: 0.12 }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'combat_trigger_camera_punch', fovPunch: -8.0 }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'combat_create_anime_outline', entityId: 10 }).valid).toBe(true);
  });
});
