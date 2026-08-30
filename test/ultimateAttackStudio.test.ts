import { describe, it, expect } from 'vitest';
import { UltimateAttackStudio, PRESET_ULTIMATES } from '../src/features/combat/UltimateAttackStudio';

describe('UltimateAttackStudio', () => {
  it('loads preset anime ultimate techniques', () => {
    const studio = new UltimateAttackStudio();
    const recipes = studio.getRecipes();
    expect(recipes.length).toBeGreaterThanOrEqual(3);

    const beam = studio.getRecipe('final_beam_cannon');
    expect(beam).toBeDefined();
    expect(beam?.name).toBe('Final Beam Cannon');
    expect(beam?.element).toBe('lightning');
  });

  it('synthesizes custom ultimate recipe into a runtime AbilityDef', () => {
    const studio = new UltimateAttackStudio();
    const recipe = {
      id: 'custom_god_burst',
      name: 'God Ki Nova Flash',
      battleCall: 'Transcend all limits!',
      blueprint: 'spirit_nova' as const,
      element: 'fire' as const,
      chargeTime: 0.9,
      kiCost: 65,
      baseDamage: 320,
      radius: 12.0,
      cameraPunch: 1.5,
      screenShake: 2.0,
      auraColor: '#ff2200',
      animation: '028_dbz_extra_a_fighter_charges_with_clenched_fists_and_releases_a_shockwave_through_the_ground',
      vfx: 'impact_fire',
      icon: '🔥',
    };

    studio.saveRecipe(recipe);
    expect(studio.getRecipe('custom_god_burst')).toBeDefined();

    const ability = studio.synthesizeAbility(recipe);
    expect(ability.slot).toBe(4);
    expect(ability.baseDamage).toBe(320);
    expect(ability.mpCost).toBe(65);
    expect(ability.statusEffect).toBe('burn');
    expect(ability.description).toContain('Transcend all limits!');
  });

  it('equips ultimate recipes to active loadout', () => {
    const studio = new UltimateAttackStudio();
    expect(studio.getEquippedRecipe().id).toBe('final_beam_cannon');

    const equipped = studio.equipRecipe('cataclysm_meteor_drop');
    expect(equipped).toBe(true);
    expect(studio.getEquippedRecipe().name).toBe('Dragon God Meteor Drop');
  });
});
