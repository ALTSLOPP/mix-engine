import type { EntityId } from '../../ecs/SceneManager';

export type QuestStatus = 'not_started' | 'active' | 'completed' | 'failed';
export type ObjectiveType = 'slay' | 'collect' | 'explore' | 'puzzle_solve';

export interface QuestObjective {
  id: string;
  description: string;
  type: ObjectiveType;
  targetId: string;
  requiredCount: number;
  currentCount: number;
  isCompleted: boolean;
}

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  status: QuestStatus;
  objectives: QuestObjective[];
  rewards: {
    exp: number;
    gold: number;
    items?: string[];
  };
}

export interface EnvironmentalRoadblock {
  id: string;
  name: string;
  type: 'fallen_tree' | 'energy_barrier' | 'broken_bridge' | 'ancient_gate';
  requiredUnlockType: 'ability' | 'item' | 'puzzle' | 'quest';
  requiredKey: string; // e.g. 'fire_ability', 'ancient_crest_key', 'puzzle_circuit_1'
  isUnlocked: boolean;
}

export class QuestAndRoadblockManager {
  private readonly quests = new Map<string, QuestDefinition>();
  private readonly roadblocks = new Map<string, EnvironmentalRoadblock>();

  registerQuest(quest: QuestDefinition): void {
    this.quests.set(quest.id, JSON.parse(JSON.stringify(quest)));
  }

  getQuest(id: string): QuestDefinition | undefined {
    return this.quests.get(id);
  }

  getAllQuests(): QuestDefinition[] {
    return Array.from(this.quests.values());
  }

  startQuest(id: string): boolean {
    const q = this.quests.get(id);
    if (!q || q.status !== 'not_started') return false;
    q.status = 'active';
    return true;
  }

  updateObjectiveProgress(questId: string, objectiveId: string, progressDelta = 1): boolean {
    const q = this.quests.get(questId);
    if (!q || q.status !== 'active') return false;

    const obj = q.objectives.find(o => o.id === objectiveId);
    if (!obj || obj.isCompleted) return false;

    obj.currentCount = Math.min(obj.requiredCount, obj.currentCount + progressDelta);
    if (obj.currentCount >= obj.requiredCount) {
      obj.isCompleted = true;
    }

    // Check if all objectives completed
    if (q.objectives.every(o => o.isCompleted)) {
      q.status = 'completed';
    }

    return true;
  }

  registerRoadblock(roadblock: EnvironmentalRoadblock): void {
    this.roadblocks.set(roadblock.id, { ...roadblock });
  }

  getRoadblock(id: string): EnvironmentalRoadblock | undefined {
    return this.roadblocks.get(id);
  }

  tryUnlockRoadblock(roadblockId: string, providedKey: string): boolean {
    const rb = this.roadblocks.get(roadblockId);
    if (!rb || rb.isUnlocked) return false;

    if (rb.requiredKey === providedKey) {
      rb.isUnlocked = true;
      return true;
    }
    return false;
  }

  isRoadblockPassable(roadblockId: string): boolean {
    const rb = this.roadblocks.get(roadblockId);
    return !rb || rb.isUnlocked;
  }
}
