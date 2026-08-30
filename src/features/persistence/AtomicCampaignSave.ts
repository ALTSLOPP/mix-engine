export interface PlayerSaveData {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  level: number;
  exp: number;
}

export interface CampaignSaveFile {
  version: number;
  timestamp: number;
  saveSlot: number;
  campaignName: string;
  gameTimeHours: number;
  player: PlayerSaveData;
  inventory: Array<{ itemId: string; quantity: number }>;
  quests: Array<{ id: string; status: string; progress: Record<string, number> }>;
  solvedPuzzles: string[];
  unlockedRoadblocks: string[];
  worldFlags: Record<string, boolean | number | string>;
}

export class CampaignSaveCodec {
  static readonly CURRENT_VERSION = 1;

  /**
   * Validates save data integrity and bounds.
   */
  static validate(data: unknown): data is CampaignSaveFile {
    if (!data || typeof data !== 'object') return false;
    const save = data as Partial<CampaignSaveFile>;

    if (typeof save.version !== 'number' || save.version < 1) return false;
    if (typeof save.timestamp !== 'number' || isNaN(save.timestamp)) return false;
    if (!save.player || typeof save.player !== 'object') return false;

    const p = save.player;
    if (!Array.isArray(p.position) || p.position.length !== 3 || p.position.some(v => typeof v !== 'number' || isNaN(v))) {
      return false;
    }
    if (typeof p.health !== 'number' || p.health <= 0 || isNaN(p.health)) return false;
    if (typeof p.maxHealth !== 'number' || p.maxHealth <= 0 || isNaN(p.maxHealth)) return false;
    if (typeof p.level !== 'number' || p.level < 1 || isNaN(p.level)) return false;

    if (!Array.isArray(save.inventory)) return false;
    if (!Array.isArray(save.quests)) return false;
    if (!Array.isArray(save.solvedPuzzles)) return false;
    if (!Array.isArray(save.unlockedRoadblocks)) return false;
    if (!save.worldFlags || typeof save.worldFlags !== 'object') return false;

    return true;
  }

  /**
   * Serializes save data to JSON string.
   */
  static serialize(save: CampaignSaveFile): string {
    if (!this.validate(save)) {
      throw new Error('Cannot serialize invalid campaign save file');
    }
    return JSON.stringify(save, null, 2);
  }

  /**
   * Deserializes and validates a save string.
   */
  static deserialize(jsonString: string): CampaignSaveFile {
    try {
      const parsed = JSON.parse(jsonString);
      if (!this.validate(parsed)) {
        throw new Error('Save file failed schema validation');
      }
      return parsed;
    } catch (e: any) {
      throw new Error(`Failed to load save file: ${e.message}`);
    }
  }

  /**
   * Creates a fresh starter campaign save.
   */
  static createNewCampaign(slot = 1, campaignName = 'New Adventure'): CampaignSaveFile {
    return {
      version: this.CURRENT_VERSION,
      timestamp: Date.now(),
      saveSlot: slot,
      campaignName,
      gameTimeHours: 12.0,
      player: {
        position: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        level: 1,
        exp: 0,
      },
      inventory: [
        { itemId: 'potion_healing', quantity: 3 },
        { itemId: 'wooden_sword', quantity: 1 },
      ],
      quests: [
        { id: 'quest_starter_intro', status: 'active', progress: {} },
      ],
      solvedPuzzles: [],
      unlockedRoadblocks: [],
      worldFlags: {
        hasMetElder: false,
        starterTownVisited: true,
      },
    };
  }
}

/**
 * In-memory / storage atomic save manager simulating .tmp -> .bak atomic replacement.
 */
export class AtomicSaveManager {
  private primaryStorage = new Map<number, string>();
  private backupStorage = new Map<number, string>();

  save(slot: number, data: CampaignSaveFile): boolean {
    if (!CampaignSaveCodec.validate(data)) return false;

    const serialized = CampaignSaveCodec.serialize(data);

    // 1. Stage in temporary
    const tempPayload = serialized;

    // 2. Backup existing primary if present
    const existing = this.primaryStorage.get(slot);
    if (existing) {
      this.backupStorage.set(slot, existing);
    }

    // 3. Commit temporary to primary
    this.primaryStorage.set(slot, tempPayload);
    return true;
  }

  load(slot: number): CampaignSaveFile | null {
    const primary = this.primaryStorage.get(slot);
    if (primary) {
      try {
        return CampaignSaveCodec.deserialize(primary);
      } catch {
        // Primary corrupted, attempt recovery from backup
        const backup = this.backupStorage.get(slot);
        if (backup) {
          try {
            return CampaignSaveCodec.deserialize(backup);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  hasSave(slot: number): boolean {
    return this.primaryStorage.has(slot);
  }

  deleteSave(slot: number): void {
    this.primaryStorage.delete(slot);
    this.backupStorage.delete(slot);
  }
}
