/**
 * Bundled, redistribution-safe animation packs and project animation libraries.
 *
 * These are source folders rather than individually registered preset assets:
 * AnimationImporter loads the clips, runs Retarget Pro against the Ayo/Mixamo/UE
 * target rig, and registers the resulting runtime pack for Animancer-style
 * state-machine application.
 */
export interface FreeAnimationPackPreset {
  id: string;
  displayName: string;
  sourcePath: string;
  license: 'CC0-1.0' | 'Custom' | 'Project' | 'Mixamo';
  sourceUrl?: string;
  licenseUrl?: string;
  categoryCount?: number;
}

export const FREE_ANIMATION_PACKS: FreeAnimationPackPreset[] = [
  {
    id: 'quaternius_ual1',
    displayName: 'Quaternius Universal Animation Library',
    sourcePath: '/assets/animations/quaternius-universal-1',
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/universalanimationlibrary.html',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'quaternius_ual2',
    displayName: 'Quaternius Universal Animation Library 2',
    sourcePath: '/assets/animations/quaternius-universal-2',
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/packs/universalanimationlibrary2.html',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'omen_dbz_combat',
    displayName: 'Omen DBZ & Anime Combat Pack',
    sourcePath: '/assets/animations/omen-dbz-combat',
    license: 'Project',
  },
  {
    id: 'omen_superhero_flight',
    displayName: 'Omen Superhero 3D Flight Pack',
    sourcePath: '/assets/animations/omen-superhero-flight',
    license: 'Project',
  },
  {
    id: 'omen_nodachi_combat',
    displayName: 'Omen Nodachi Greatsword Pack',
    sourcePath: '/assets/animations/omen-nodachi-combat',
    license: 'Project',
  },
  {
    id: 'omen_katana_combat',
    displayName: 'Omen Katana Combat Pack',
    sourcePath: '/assets/animations/omen-katana-combat',
    license: 'Project',
  },
  {
    id: 'omen_parkour_locomotion',
    displayName: 'Omen Parkour & Traversal Pack',
    sourcePath: '/assets/animations/omen-parkour-locomotion',
    license: 'Project',
  },

  // Mixamo Full Motion Pack for UE5 / Mix Engine (2,457 Total FBX animations)
  {
    id: 'mixamo_all',
    displayName: 'Mixamo Complete Motion Master Bank (All 2,457 Animations)',
    sourcePath: '/assets/animations/mixamo-all',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_locomotion',
    displayName: 'Mixamo Locomotion Bank (Walk, Run, Sprint, Strafe)',
    sourcePath: '/assets/animations/mixamo-all/locomotion',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_melee_combat',
    displayName: 'Mixamo Melee & Martial Arts Combat Bank',
    sourcePath: '/assets/animations/mixamo-all/melee-combat',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_pose_stance',
    displayName: 'Mixamo Poses, Stances & Idle Blends Bank',
    sourcePath: '/assets/animations/mixamo-all/pose-stance',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_shooting',
    displayName: 'Mixamo Weaponry & Firearm Handling Bank',
    sourcePath: '/assets/animations/mixamo-all/shooting',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_emotes_gestures',
    displayName: 'Mixamo Emotes, Gestures & Social Expressions Bank',
    sourcePath: '/assets/animations/mixamo-all/emotes-gestures',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_dance',
    displayName: 'Mixamo Dances & Choreography Bank',
    sourcePath: '/assets/animations/mixamo-all/dance',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_sports_fitness',
    displayName: 'Mixamo Sports, Athletics & Fitness Bank',
    sourcePath: '/assets/animations/mixamo-all/sports-fitness',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_death_fall',
    displayName: 'Mixamo Deaths, Knockdowns & Ragdoll Transitions Bank',
    sourcePath: '/assets/animations/mixamo-all/death-fall',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_interaction_props',
    displayName: 'Mixamo Object Interactions & Environment Props Bank',
    sourcePath: '/assets/animations/mixamo-all/interaction-props',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_cinematic_transitions',
    displayName: 'Mixamo Cinematic Transitions & Narrative Bank',
    sourcePath: '/assets/animations/mixamo-all/cinematic-transitions',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_shooting_locomotion',
    displayName: 'Mixamo Tactical Shooter Locomotion Bank',
    sourcePath: '/assets/animations/mixamo-all/shooting-locomotion',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_acrobatics_evasion',
    displayName: 'Mixamo Acrobatics, Vaults & Evasion Bank',
    sourcePath: '/assets/animations/mixamo-all/acrobatics-evasion',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_hit_reaction',
    displayName: 'Mixamo Hit Reactions & Impact Staggers Bank',
    sourcePath: '/assets/animations/mixamo-all/hit-reaction',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_zombie',
    displayName: 'Mixamo Zombie, Undead & Creature Bank',
    sourcePath: '/assets/animations/mixamo-all/zombie',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_magic',
    displayName: 'Mixamo Magic & Arcane Spellcasting Bank',
    sourcePath: '/assets/animations/mixamo-all/magic',
    license: 'Mixamo',
  },
  {
    id: 'mixamo_uncategorized',
    displayName: 'Mixamo Extended Motions Bank',
    sourcePath: '/assets/animations/mixamo-all/uncategorized',
    license: 'Mixamo',
  },
];
