import { describe, it, expect } from 'vitest';
import {
  PropertyTree,
  SerializationEngine,
  ValidatorRegistry,
  defineInspector,
} from '../src/inspector';

describe('MIX Inspector Studio Validation & Serialization', () => {
  it('validates property ranges and expressions with live auto-fix', () => {
    const schema = defineInspector('EnemyStats', {
      properties: {
        health: { type: 'number', range: [0, 100] },
        stamina: { type: 'number', validate: 'stamina >= 0' },
      },
    });

    const enemy = { health: 150, stamina: -20 };
    const tree = new PropertyTree(enemy, schema);
    const report = ValidatorRegistry.validateTarget(enemy, tree);

    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(1);

    // Run auto-fix
    ValidatorRegistry.validateTarget(enemy, tree, { autoFix: true });
    expect(enemy.health).toBe(100); // Clamped to range max
  });

  it('serializes and deserializes objects, Maps, Sets, and TypedArrays deterministically', () => {
    const data = {
      name: 'Player1',
      score: 4200,
      tags: new Set(['hero', 'warrior']),
      inventory: new Map([
        ['sword', { damage: 15 }],
        ['shield', { armor: 30 }],
      ]),
      positions: new Float32Array([1.0, 2.5, 3.8]),
    };

    const json = SerializationEngine.serialize(data);
    expect(json).toBeDefined();
    expect(typeof json).toBe('string');

    const restored = SerializationEngine.deserialize<typeof data>(json);
    expect(restored.name).toBe('Player1');
    expect(restored.score).toBe(4200);
    expect(restored.tags instanceof Set).toBe(true);
    expect(restored.tags.has('hero')).toBe(true);
    expect(restored.inventory instanceof Map).toBe(true);
    expect(restored.inventory.get('sword')).toEqual({ damage: 15 });
    expect(restored.positions instanceof Float32Array).toBe(true);
    expect(restored.positions[1]).toBeCloseTo(2.5, 3);
  });

  it('handles schema migrations across versions', () => {
    // Migration v1 -> v2: rename 'hp' to 'health' and multiply by 10
    SerializationEngine.registerMigration('CharacterData', 1, 2, (data) => {
      return {
        ...data,
        health: (Number(data.hp) || 0) * 10,
        hp: undefined,
        $version: 2,
      };
    });

    const v1Json = JSON.stringify({
      $type: 'CharacterData',
      $version: 1,
      name: 'Hero',
      hp: 10,
    });

    const upgraded = SerializationEngine.deserialize<any>(v1Json);
    expect(upgraded.health).toBe(100);
    expect(upgraded.hp).toBeUndefined();
  });

  it('computes structural diffs between two inspector objects', () => {
    const original = { speed: 10, weapon: 'dagger', armor: 20 };
    const modified = { speed: 15, weapon: 'dagger', armor: 25 };

    const diffs = SerializationEngine.diff(original, modified);
    expect(diffs.speed).toEqual({ oldVal: 10, newVal: 15 });
    expect(diffs.armor).toEqual({ oldVal: 20, newVal: 25 });
    expect(diffs.weapon).toBeUndefined();
  });
});
