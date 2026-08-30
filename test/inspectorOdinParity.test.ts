import { describe, it, expect, beforeEach } from 'vitest';
import {
  DrawerRegistry,
  InspectorStudioManager,
  PropertyTree,
  SchemaRegistry,
  defineInspector,
} from '../src/inspector';

describe('MIX Inspector Studio Odin Parity Suite', () => {
  let studio: InspectorStudioManager;

  beforeEach(() => {
    studio = new InspectorStudioManager();
  });

  it('supports dynamic array mutations: insert, move up, move down, remove', () => {
    const config = {
      name: 'Warrior',
      skills: ['Slash', 'Parry', 'Dash'],
    };

    const tree = new PropertyTree(config);

    // 1. Insert item
    tree.insertArrayItem('skills', 3, 'Execute');
    expect(config.skills).toEqual(['Slash', 'Parry', 'Dash', 'Execute']);

    // 2. Move item up (move Execute from 3 to 2)
    tree.moveArrayItem('skills', 3, 2);
    expect(config.skills).toEqual(['Slash', 'Parry', 'Execute', 'Dash']);

    // 3. Move item down (move Slash from 0 to 1)
    tree.moveArrayItem('skills', 0, 1);
    expect(config.skills).toEqual(['Parry', 'Slash', 'Execute', 'Dash']);

    // 4. Remove item
    tree.removeArrayItem('skills', 1); // remove Slash
    expect(config.skills).toEqual(['Parry', 'Execute', 'Dash']);
  });

  it('supports dynamic map/dictionary mutations: set and remove entries', () => {
    const lootTable = {
      rates: {
        gold_coin: 0.8,
        health_potion: 0.2,
      },
    };

    const tree = new PropertyTree(lootTable);

    tree.setMapEntry('rates', 'mana_potion', 0.15);
    expect(lootTable.rates).toHaveProperty('mana_potion', 0.15);

    tree.removeMapEntry('rates', 'gold_coin');
    expect(lootTable.rates).not.toHaveProperty('gold_coin');
  });

  it('keeps Map mutations undoable and blocks prototype-polluting paths', () => {
    const config = { values: new Map([['safe', 1]]) };
    const tree = new PropertyTree(config);
    tree.setMapEntry('values', 'new', 2);
    expect(config.values.get('new')).toBe(2);
    tree.undo();
    expect(config.values.has('new')).toBe(false);
    expect(() => tree.writeValue('__proto__.polluted', true)).toThrow(/Unsafe/);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('supports transactional undo and redo on PropertyTree mutations', () => {
    const character = {
      health: 100,
      stamina: 50,
    };

    const tree = new PropertyTree(character);
    expect(tree.canUndo()).toBe(false);

    // Mutation 1
    tree.writeValue('health', 80);
    expect(character.health).toBe(80);
    expect(tree.canUndo()).toBe(true);

    // Mutation 2
    tree.writeValue('health', 60);
    expect(character.health).toBe(60);

    // Undo 1
    tree.undo();
    expect(character.health).toBe(80);
    expect(tree.canRedo()).toBe(true);

    // Undo 2
    tree.undo();
    expect(character.health).toBe(100);

    // Redo 1
    tree.redo();
    expect(character.health).toBe(80);

    // Redo 2
    tree.redo();
    expect(character.health).toBe(60);
  });

  it('renders polymorphic type drawers with schema reflection', () => {
    const AIConfigSchema = defineInspector('AIConfig', {
      properties: {
        behavior: {
          type: 'polymorphic',
          polymorphicTypes: {
            PatrolBehavior: { speed: 2.0, waypoints: [] },
            ChaseBehavior: { target: 'player', aggroRadius: 15 },
          },
        },
      },
    });

    const aiEntity = {
      behavior: {
        $type: 'PatrolBehavior',
        speed: 2.0,
      },
    };

    const html = studio.renderInspectorHTML(aiEntity, undefined, undefined, AIConfigSchema);
    expect(html).toContain('PatrolBehavior');
    expect(html).toContain('ChaseBehavior');
    expect(html).toContain('[Polymorphic]');
  });


  it('filters visible properties via search query in InspectorStudioManager', () => {
    const EnemySchema = defineInspector('EnemyData', {
      properties: {
        maxHealth: { type: 'number', label: 'Maximum Health' },
        attackDamage: { type: 'number', label: 'Attack Damage' },
        defenseArmor: { type: 'number', label: 'Defense Armor' },
      },
    });

    const enemy = {
      maxHealth: 500,
      attackDamage: 45,
      defenseArmor: 20,
    };

    const tree = studio.getTree(enemy, EnemySchema);

    // Render with search filter 'armor'
    const filteredHtml = studio.renderInspectorHTML(enemy, undefined, 'armor');
    expect(filteredHtml).toContain('Defense Armor');
    expect(filteredHtml).not.toContain('Maximum Health');
    expect(filteredHtml).not.toContain('Attack Damage');
  });
});
