import { describe, it, expect } from 'vitest';
import {
  PropertyTree,
  SafeResolver,
  SchemaRegistry,
  defineInspector,
  Inspectable,
  InspectField,
} from '../src/inspector';

class MockCombatConfig {
  stamina = 100;
  damage = 25;
  attackSpeed = 1.2;
  enabled = true;
  combo = ['jab', 'cross'];
  stats = {
    critChance: 0.15,
    armor: 50,
  };
}

describe('MIX Inspector Studio Core', () => {
  it('builds PropertyTree with nested paths and reflection', () => {
    const target = new MockCombatConfig();
    const tree = new PropertyTree(target);

    expect(tree.readValue('stamina')).toBe(100);
    expect(tree.readValue('stats.critChance')).toBe(0.15);

    tree.writeValue('stamina', 85);
    expect(target.stamina).toBe(85);
    expect(tree.readValue('stamina')).toBe(85);

    tree.writeValue('stats.armor', 75);
    expect(target.stats.armor).toBe(75);
    expect(tree.readValue('stats.armor')).toBe(75);
  });

  it('supports multi-target editing and mixed value detection', () => {
    const objA = { health: 100, speed: 5 };
    const objB = { health: 100, speed: 8 };

    const tree = new PropertyTree([objA, objB]);

    const healthNode = tree.findNode('health');
    const speedNode = tree.findNode('speed');

    expect(healthNode?.isMixedValue).toBe(false);
    expect(speedNode?.isMixedValue).toBe(true);

    tree.writeValue('speed', 10);
    expect(objA.speed).toBe(10);
    expect(objB.speed).toBe(10);
    expect(tree.findNode('speed')?.isMixedValue).toBe(false);
  });

  it('evaluates expressions safely with SafeResolver without eval', () => {
    const context = {
      stamina: 50,
      isAlive: true,
      mode: 'combat',
      stats: { armor: 30 },
    };

    // Comparisons & Boolean logic
    expect(SafeResolver.evaluateBoolean('stamina > 20', context)).toBe(true);
    expect(SafeResolver.evaluateBoolean('stamina <= 10', context)).toBe(false);
    expect(SafeResolver.evaluateBoolean("isAlive && mode == 'combat'", context)).toBe(true);
    expect(SafeResolver.evaluateBoolean("!isAlive || mode != 'combat'", context)).toBe(false);
    expect(SafeResolver.evaluateBoolean('stats.armor >= 30', context)).toBe(true);

    // Arithmetic in expressions
    const mathRes = SafeResolver.evaluate<number>('stamina + 25 * 2', context);
    expect(mathRes.success).toBe(true);
    expect(mathRes.value).toBe(100);

    // Ternary expression
    const ternaryRes = SafeResolver.evaluate<string>("stamina > 20 ? 'ready' : 'tired'", context);
    expect(ternaryRes.success).toBe(true);
    expect(ternaryRes.value).toBe('ready');
  });

  it('returns structured error on invalid expression syntax', () => {
    const res = SafeResolver.evaluate('stamina > + + / ?', { stamina: 10 });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error?.expression).toBe('stamina > + + / ?');
  });

  it('rejects trailing tokens and unterminated strings', () => {
    expect(SafeResolver.evaluate('true false').success).toBe(false);
    expect(SafeResolver.evaluate("mode == 'combat").success).toBe(false);
  });

  it('registers and retrieves inspector schemas', () => {
    const schema = defineInspector('CharacterConfig', {
      title: 'Character Config',
      groups: {
        stats: { type: 'tab', label: 'Stats' },
      },
      properties: {
        stamina: { type: 'number', range: [0, 100], group: 'stats' },
        heavyAttack: { type: 'string', showIf: 'enabled' },
      },
    });

    expect(schema).toBeDefined();
    expect(schema.title).toBe('Character Config');

    const retrieved = SchemaRegistry.get('CharacterConfig');
    expect(retrieved).toBe(schema);
    expect(retrieved?.properties.stamina.range).toEqual([0, 100]);
  });
});
