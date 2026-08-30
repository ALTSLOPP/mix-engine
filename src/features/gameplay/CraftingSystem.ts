import type { Engine } from '../../engine/Engine';
import type { CraftingGatheringConfig, CraftingRecipeDef } from './types';

export class CraftingSystem {
  private config: CraftingGatheringConfig;
  private readonly discoveredRecipeIds = new Set<string>();

  constructor(private readonly engine: Engine, initialConfig: CraftingGatheringConfig) {
    this.config = { ...initialConfig };
    if (this.config.autoDiscoverRecipes) {
      for (const r of this.config.recipes) {
        this.discoveredRecipeIds.add(r.id);
      }
    }
  }

  setConfig(config: Partial<CraftingGatheringConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<CraftingGatheringConfig> {
    return this.config;
  }

  get recipes(): readonly CraftingRecipeDef[] {
    return this.config.recipes;
  }

  canCraft(recipeId: string): boolean {
    const recipe = this.config.recipes.find((r) => r.id === recipeId);
    if (!this.config.enabled || !recipe) return false;

    const lootSys = this.engine.gameplayFeatures?.loot;
    if (!lootSys) return false;

    const playerId = this.engine.player.getPossessedId();
    if (playerId === null || !this.engine.sceneManager.getRigidBody(playerId)) return false;
    if (!lootSys.getConfig().possibleDrops.some(d => d.id === recipe.resultItemId)) return false;
    const required = new Map<string, number>();
    for (const ingredient of recipe.ingredients) {
      if (!Number.isInteger(ingredient.count) || ingredient.count <= 0) return false;
      required.set(ingredient.itemId, (required.get(ingredient.itemId) ?? 0) + ingredient.count);
    }
    for (const [id, count] of required) {
      if (lootSys.items.filter(item => item.id === id).length < count) return false;
    }
    return true;
  }

  craft(recipeId: string): boolean {
    if (!this.config.enabled || !this.canCraft(recipeId)) return false;

    const recipe = this.config.recipes.find((r) => r.id === recipeId);
    if (!this.config.enabled || !recipe) return false;

    const lootSys = this.engine.gameplayFeatures?.loot;
    if (!lootSys) return false;

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      lootSys.removeItem(ing.itemId, ing.count);
    }

    // Spawn crafted item
    const playerEntityId = this.engine.player.getPossessedId();
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const pos = playerRb ? playerRb.mesh.position.clone() : undefined;

    if (pos) {
      const dropDef = lootSys.getConfig().possibleDrops.find((d) => d.id === recipe.resultItemId);
      if (dropDef) {
        lootSys.spawnLoot(dropDef, pos);
      }
    }

    if (pos) {
      this.engine.burstVfx('glow', pos, 18);
    }
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.8, loop: false });
    this.engine.sceneManager.events.emit('item_crafted', { recipeId, resultItemId: recipe.resultItemId });
    return true;
  }

  update(_dt: number): void {
    // Proximity gathering node check could be extended here
  }
}
