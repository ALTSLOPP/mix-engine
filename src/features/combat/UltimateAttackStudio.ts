import type { AbilityDef } from '../gameplay/types';

export type UltimateBlueprint =
  | 'beam_cannon'
  | 'judgement_sword'
  | 'fist_barrage'
  | 'spirit_nova'
  | 'cataclysm_meteor'
  | 'dimensional_cleave';

export type UltimateElement = 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' | 'wind';

export interface UltimateAttackRecipe {
  id: string;
  name: string;
  battleCall: string;
  blueprint: UltimateBlueprint;
  element: UltimateElement;
  chargeTime: number; // seconds
  kiCost: number;
  baseDamage: number;
  radius: number;
  cameraPunch: number; // FOV punch factor
  screenShake: number; // Rumble factor
  auraColor: string;
  animation: string;
  vfx: string;
  icon: string;
}

export const ULTIMATE_BLUEPRINT_PRESETS: Record<UltimateBlueprint, { name: string; icon: string; defaultAnim: string; defaultVfx: string }> = {
  beam_cannon: {
    name: 'Energy Beam Cannon',
    icon: '⚡',
    defaultAnim: '026_dbz_extra_a_fighter_plants_a_wide_stance_and_unleashes_a_massive_two_handed_energy_blast',
    defaultVfx: 'impact_cyan',
  },
  judgement_sword: {
    name: 'Judgement Sword Arc',
    icon: '🗡️',
    defaultAnim: 'AS_Combo_Attack_Wave_02_Seq',
    defaultVfx: 'impact_gold',
  },
  fist_barrage: {
    name: '100-Fist Rush',
    icon: '👊',
    defaultAnim: '039_dbz_a_fighter_performs_a_rapid_flurry_of_punches',
    defaultVfx: 'impact_red',
  },
  spirit_nova: {
    name: 'Spirit Nova Blast',
    icon: '💥',
    defaultAnim: '028_dbz_extra_a_fighter_charges_with_clenched_fists_and_releases_a_shockwave_through_the_ground',
    defaultVfx: 'impact_gold',
  },
  cataclysm_meteor: {
    name: 'Cataclysm Meteor Dive',
    icon: '☄️',
    defaultAnim: '032_dbz_extra_a_fighter_flies_upward_pauses_in_midair_then_dives_with_a_meteor_like_attack',
    defaultVfx: 'impact_fire',
  },
  dimensional_cleave: {
    name: 'Dimensional Space Cleave',
    icon: '🌀',
    defaultAnim: '029_dbz_extra_a_fighter_flashes_behind_an_opponent_with_a_teleport_like_burst_and_strikes_downward',
    defaultVfx: 'impact_purple',
  },
};

export const PRESET_ULTIMATES: UltimateAttackRecipe[] = [
  {
    id: 'final_beam_cannon',
    name: 'Final Beam Cannon',
    battleCall: 'Unleash the full fury of Heaven!',
    blueprint: 'beam_cannon',
    element: 'lightning',
    chargeTime: 0.8,
    kiCost: 60,
    baseDamage: 250,
    radius: 8.0,
    cameraPunch: 1.4,
    screenShake: 1.8,
    auraColor: '#00f0ff',
    animation: '026_dbz_extra_a_fighter_plants_a_wide_stance_and_unleashes_a_massive_two_handed_energy_blast',
    vfx: 'impact_cyan',
    icon: '⚡',
  },
  {
    id: 'cataclysm_meteor_drop',
    name: 'Dragon God Meteor Drop',
    battleCall: 'Crush the world below!',
    blueprint: 'cataclysm_meteor',
    element: 'fire',
    chargeTime: 1.2,
    kiCost: 80,
    baseDamage: 350,
    radius: 14.0,
    cameraPunch: 1.6,
    screenShake: 2.5,
    auraColor: '#ff4400',
    animation: '032_dbz_extra_a_fighter_flies_upward_pauses_in_midair_then_dives_with_a_meteor_like_attack',
    vfx: 'impact_fire',
    icon: '☄️',
  },
  {
    id: 'limitless_space_cleave',
    name: 'Void Realm Sunder',
    battleCall: 'Sever the fabric of reality!',
    blueprint: 'dimensional_cleave',
    element: 'dark',
    chargeTime: 0.5,
    kiCost: 70,
    baseDamage: 280,
    radius: 10.0,
    cameraPunch: 1.3,
    screenShake: 1.5,
    auraColor: '#a855f7',
    animation: '029_dbz_extra_a_fighter_flashes_behind_an_opponent_with_a_teleport_like_burst_and_strikes_downward',
    vfx: 'impact_purple',
    icon: '🌀',
  },
];

/**
 * Ultimate Attack Studio: Synthesizes custom player-authored anime ultimates
 * into executable runtime AbilityDef instances for MIX Engine.
 */
export class UltimateAttackStudio {
  private recipes = new Map<string, UltimateAttackRecipe>();
  private activeEquippedRecipeId: string = 'final_beam_cannon';

  constructor() {
    for (const preset of PRESET_ULTIMATES) {
      this.recipes.set(preset.id, { ...preset });
    }
  }

  getRecipes(): UltimateAttackRecipe[] {
    return Array.from(this.recipes.values());
  }

  getRecipe(id: string): UltimateAttackRecipe | undefined {
    return this.recipes.get(id);
  }

  saveRecipe(recipe: UltimateAttackRecipe): void {
    this.recipes.set(recipe.id, { ...recipe });
  }

  deleteRecipe(id: string): boolean {
    return this.recipes.delete(id);
  }

  equipRecipe(id: string): boolean {
    if (!this.recipes.has(id)) return false;
    this.activeEquippedRecipeId = id;
    return true;
  }

  getEquippedRecipe(): UltimateAttackRecipe {
    return this.recipes.get(this.activeEquippedRecipeId) ?? PRESET_ULTIMATES[0];
  }

  /**
   * Convert recipe into a standard MIX Engine AbilityDef ready for AbilityElementalSystem / Hotbar Slot 4.
   */
  synthesizeAbility(recipe: UltimateAttackRecipe): AbilityDef {
    return {
      id: recipe.id,
      name: recipe.name,
      slot: 4,
      keybind: '4 / R',
      icon: recipe.icon,
      mpCost: recipe.kiCost,
      cooldown: 18.0,
      castTime: recipe.chargeTime,
      element: recipe.element,
      baseDamage: recipe.baseDamage,
      range: 25.0,
      radius: recipe.radius,
      animation: recipe.animation,
      vfx: recipe.vfx,
      audio: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
      description: `${recipe.battleCall} (Custom Ultimate Technique)`,
      statusEffect: recipe.element === 'fire' ? 'burn' : recipe.element === 'ice' ? 'freeze' : recipe.element === 'lightning' ? 'shock' : undefined,
    };
  }
}
