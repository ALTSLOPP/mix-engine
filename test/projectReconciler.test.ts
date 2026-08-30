import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  createEmptyProject,
  migrateProjectDocument,
  ProjectCompiler,
  ProjectReconciler,
  type ProjectDocument,
  type EntityRecord,
} from '../src/project';

describe('ProjectDocument Migration Unit Tests', () => {
  it('migrates legacy scene.json with numeric IDs to versioned GUID project document', () => {
    const legacyScene = {
      name: 'Old Level',
      entities: [
        {
          originalId: 10,
          name: 'Hero',
          tags: ['player'],
          kind: 'character',
          position: [0, 1, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        {
          originalId: 20,
          parentId: 10,
          name: 'Weapon',
          kind: 'sword',
          position: [0, 1.5, 0],
        },
      ],
    };

    const doc = migrateProjectDocument(legacyScene);
    expect(doc.version).toBe(3);
    expect(doc.name).toBe('Old Level');
    expect(doc.scenes['main']).toHaveLength(2);

    const hero = doc.scenes['main'][0];
    const weapon = doc.scenes['main'][1];

    expect(hero.guid).toBeDefined();
    expect(weapon.guid).toBeDefined();
    expect(hero.name).toBe('Hero');
    expect(hero.tags).toContain('player');

    // Verify parent GUID relationship was migrated from legacy numeric IDs
    expect(weapon.parentGuid).toBe(hero.guid);
  });
});

describe('ProjectCompiler Unit Tests', () => {
  it('compiles declarative ProjectDocument to atomic AICommand stream', () => {
    const doc: ProjectDocument = {
      ...createEmptyProject('TestProject'),
      environment: {
        timeOfDay: 14,
        fogDensity: 0.02,
        fogColor: '#abcdef',
      },
      scenes: {
        main: [
          {
            guid: 'g-hero',
            name: 'Hero',
            tags: ['player'],
            blueprint: { kind: 'hero_mesh', params: { assetId: 'hero.glb' } },
            transform: { position: [0, 1, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
            components: { Health: { hp: 100 } },
          },
          {
            guid: 'g-sword',
            name: 'Sword',
            parentGuid: 'g-hero',
            blueprint: { kind: 'sword_mesh', params: {} },
            transform: { position: [0, 2, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          },
        ],
      },
    };

    const commands = ProjectCompiler.compileDocument(doc, 'main');
    expect(commands.length).toBeGreaterThan(0);

    const types = commands.map((c) => c.type);
    expect(types).toContain('set_time_of_day');
    expect(types).toContain('fog_set_params');
    expect(types).toContain('spawn_entity');
    expect(types).toContain('set_entity_name');
    expect(types).toContain('tag_entity');
    expect(types).toContain('component_add');
    expect(types).toContain('parent_entity');
    const heroSpawn = commands.find((c: any) => c.type === 'spawn_entity' && c.guid === 'g-hero') as any;
    const heroName = commands.find((c: any) => c.type === 'set_entity_name' && c.name === 'Hero') as any;
    expect(heroSpawn.as).toBeTruthy();
    expect(heroName.entityId).toEqual({ $ref: `${heroSpawn.as}.id` });
    const parent = commands.find((c: any) => c.type === 'parent_entity') as any;
    expect(parent.entityId.$ref).toContain('spawn_g_sword');
    expect(parent.parentId.$ref).toContain('spawn_g_hero');
  });
});

describe('ProjectReconciler Unit Tests', () => {
  it('computes minimal delta for modified, added, and removed entities', () => {
    const liveEntities: EntityRecord[] = [
      {
        guid: 'g-keep-unchanged',
        name: 'Rock',
        blueprint: { kind: 'rock', params: {} },
        transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
      {
        guid: 'g-modify-me',
        name: 'HeroOldName',
        tags: ['old_tag'],
        blueprint: { kind: 'hero', params: {} },
        transform: { position: [0, 1, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
        components: { Health: { hp: 50 } },
      },
      {
        guid: 'g-delete-me',
        name: 'EnemyOld',
        blueprint: { kind: 'enemy', params: {} },
        transform: { position: [10, 0, 10], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ];

    const desiredEntities: EntityRecord[] = [
      {
        guid: 'g-keep-unchanged',
        name: 'Rock',
        blueprint: { kind: 'rock', params: {} },
        transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
      {
        guid: 'g-modify-me',
        name: 'HeroNewName', // Name modified
        tags: ['new_tag'], // Tag modified
        blueprint: { kind: 'hero', params: {} },
        transform: { position: [0, 5, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }, // Position modified
        components: { Health: { hp: 100 } }, // Component modified
      },
      {
        guid: 'g-new-spawn', // Added
        name: 'Castle',
        blueprint: { kind: 'castle', params: {} },
        transform: { position: [50, 0, 50], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ];

    const report = ProjectReconciler.reconcile(desiredEntities, liveEntities);

    expect(report.unchangedGuids).toEqual(['g-keep-unchanged']);
    expect(report.addedGuids).toEqual(['g-new-spawn']);
    expect(report.removedGuids).toEqual(['g-delete-me']);
    expect(report.modifiedGuids).toEqual(['g-modify-me']);

    const cmdTypes = report.commands.map((c) => c.type);
    expect(cmdTypes).toContain('destroy_entity');
    expect(cmdTypes).toContain('spawn_entity');
    expect(cmdTypes).toContain('set_transform');
    expect(cmdTypes).toContain('set_entity_name');
    expect(cmdTypes).toContain('tag_entity');
    expect(cmdTypes).toContain('remove_tag');
    expect(cmdTypes).toContain('component_add');
  });
});
