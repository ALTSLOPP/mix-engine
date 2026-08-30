import { describe, it, expect } from 'vitest';
import { WorldGraphGenerator } from '../src/features/world/WorldGraphGenerator';
import { DayNightEncounterDirector } from '../src/features/world/DayNightEncounterDirector';
import { QuestAndRoadblockManager } from '../src/features/world/QuestAndRoadblocks';
import {
  CircuitPlatesSolver,
  SequenceLockSolver,
  PillarWeightSolver,
  FloorPlateSequenceSolver,
} from '../src/features/world/PuzzleSolvers';
import {
  CampaignSaveCodec,
  AtomicSaveManager,
} from '../src/features/persistence/AtomicCampaignSave';

describe('Crestbound World Generation, Day/Night, Puzzles & Persistence', () => {
  it('generates deterministic connected world graph with routes, towns, and danger levels', () => {
    const graph1 = WorldGraphGenerator.generate(42, 8);
    const graph2 = WorldGraphGenerator.generate(42, 8);

    expect(graph1.nodes.length).toBe(8);
    expect(graph1.nodes[0].type).toBe('town');
    expect(graph1.nodes[0].position.length()).toBe(0); // starter town at center

    // Deterministic repeatability from same seed
    expect(graph1.nodes.map(n => n.id)).toEqual(graph2.nodes.map(n => n.id));
    expect(graph1.edges.length).toBeGreaterThanOrEqual(7);

    // All nodes should be connected in the graph
    for (const node of graph1.nodes) {
      expect(node.connectedNodeIds.length).toBeGreaterThan(0);
    }
  });

  it('updates day/night cycle, changes lighting periods, and rolls time-appropriate encounters', () => {
    const director = new DayNightEncounterDirector();

    director.setTime(12.0); // Noon
    expect(director.getPeriod()).toBe('day');
    expect(director.getLighting().sunIntensity).toBeGreaterThan(1.0);

    const dayEncounters = director.getAvailableEncounters();
    expect(dayEncounters.some(e => e.creatureId === 'wild_deer')).toBe(true);
    expect(dayEncounters.some(e => e.creatureId === 'shadow_stalker')).toBe(false);

    director.setTime(22.0); // Night
    expect(director.getPeriod()).toBe('night');
    expect(director.getLighting().sunIntensity).toBeLessThan(0.3);

    const nightEncounters = director.getAvailableEncounters();
    expect(nightEncounters.some(e => e.creatureId === 'shadow_stalker')).toBe(true);
    expect(nightEncounters.some(e => e.creatureId === 'wild_deer')).toBe(false);

    // Living instincts
    expect(director.evaluateInstinct('herbivore', 4.0)).toBe('flee');
    expect(director.evaluateInstinct('predator', 4.0)).toBe('aggro');
  });

  it('manages quest objectives, completion, and roadblock unlocking', () => {
    const manager = new QuestAndRoadblockManager();

    manager.registerQuest({
      id: 'quest_wolves',
      title: 'Cull the Wolves',
      description: 'Defeat 2 forest wolves',
      status: 'not_started',
      objectives: [{
        id: 'obj_slay',
        description: 'Slay 2 wolves',
        type: 'slay',
        targetId: 'forest_wolf',
        requiredCount: 2,
        currentCount: 0,
        isCompleted: false,
      }],
      rewards: { exp: 100, gold: 50 },
    });

    manager.registerRoadblock({
      id: 'rb_bridge_1',
      name: 'Broken Forest Bridge',
      type: 'broken_bridge',
      requiredUnlockType: 'item',
      requiredKey: 'bridge_repair_planks',
      isUnlocked: false,
    });

    expect(manager.isRoadblockPassable('rb_bridge_1')).toBe(false);
    expect(manager.tryUnlockRoadblock('rb_bridge_1', 'wrong_key')).toBe(false);
    expect(manager.tryUnlockRoadblock('rb_bridge_1', 'bridge_repair_planks')).toBe(true);
    expect(manager.isRoadblockPassable('rb_bridge_1')).toBe(true);

    // Quest progression
    manager.startQuest('quest_wolves');
    expect(manager.getQuest('quest_wolves')?.status).toBe('active');

    manager.updateObjectiveProgress('quest_wolves', 'obj_slay', 1);
    expect(manager.getQuest('quest_wolves')?.status).toBe('active');

    manager.updateObjectiveProgress('quest_wolves', 'obj_slay', 1);
    expect(manager.getQuest('quest_wolves')?.status).toBe('completed');
  });

  it('solves all 4 Crestbound puzzle contracts with validation and reset handling', () => {
    // 1. Circuit Plates
    const circuit = new CircuitPlatesSolver('circuit_1', 4, [
      [1],
      [0, 2],
      [1, 3],
      [2],
    ]);
    expect(circuit.isSolved).toBe(false);
    circuit.pressPlate(0);
    circuit.pressPlate(2);
    expect(circuit.attempts).toBe(2);

    // 2. Sequence Lock
    const seq = new SequenceLockSolver('seq_1', [1, 2, 3]);
    expect(seq.pressButton(1)).toBe(false);
    expect(seq.pressButton(0)).toBe(false); // wrong step -> resets
    expect(seq.getCurrentStep()).toBe(0);
    expect(seq.pressButton(1)).toBe(false);
    expect(seq.pressButton(2)).toBe(false);
    expect(seq.pressButton(3)).toBe(true); // completed!

    // 3. Pillar Weight
    const weight = new PillarWeightSolver('weight_1', 100, 5);
    weight.addWeight(60);
    expect(weight.isSolved).toBe(false);
    weight.addWeight(42); // total 102 (within 100 +- 5)
    expect(weight.isSolved).toBe(true);

    // 4. Floor Plate Sequence
    const floor = new FloorPlateSequenceSolver('floor_1', ['p1', 'p2', 'p3']);
    floor.stepOnPlate('p1');
    floor.stepOnPlate('trap'); // wrong -> resets to 0
    expect(floor.getProgress()).toBe(0);
    floor.stepOnPlate('p1');
    floor.stepOnPlate('p2');
    floor.stepOnPlate('p3');
    expect(floor.isSolved).toBe(true);
  });

  it('validates, serializes, atomically saves and recovers campaign save files', () => {
    const saveManager = new AtomicSaveManager();
    const newSave = CampaignSaveCodec.createNewCampaign(1, 'Hero Quest');

    expect(CampaignSaveCodec.validate(newSave)).toBe(true);

    // Modify player state
    newSave.player.position = [12.5, 0, -45.2];
    newSave.player.health = 85;
    newSave.player.level = 3;
    newSave.solvedPuzzles.push('circuit_1');

    // Save to slot 1
    const saved = saveManager.save(1, newSave);
    expect(saved).toBe(true);
    expect(saveManager.hasSave(1)).toBe(true);

    // Load from slot 1
    const loaded = saveManager.load(1);
    expect(loaded).not.toBeNull();
    expect(loaded?.player.health).toBe(85);
    expect(loaded?.player.level).toBe(3);
    expect(loaded?.solvedPuzzles).toContain('circuit_1');

    // Invalid save validation
    const corrupted: any = { ...newSave, player: { health: -10, position: ['not_a_number'] } };
    expect(CampaignSaveCodec.validate(corrupted)).toBe(false);
  });
});
