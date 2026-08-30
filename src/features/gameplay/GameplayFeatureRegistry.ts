import type {
  FeatureDescriptor,
  GameplayFeatureId,
  TargetLockConfig,
  TimedHitboxConfig,
  ComboConfig,
  DodgeGuardStaminaConfig,
  HitReactionConfig,
  AbilityElementalConfig,
  EncounterAIConfig,
  StatsProgressionConfig,
  ArenaWaveConfig,
  StealthConfig,
  ParkourConfig,
  LootInventoryConfig,
  DialogueConfig,
  RangedShooterConfig,
  VehicleMountConfig,
  GrappleHookConfig,
  TimeMechanicsConfig,
  CraftingGatheringConfig,
  CompanionSummonConfig,
  WeaponWheelConfig,
  CoverPeekingConfig,
  ExplosivesConfig,
  KillstreakConfig,
  BonfireCheckpointConfig,
  EstusFlaskConfig,
  BloodstainSoulsConfig,
  PostureVisceralConfig,
  TwoAxisCombatConfig,
  ShrinkingStormConfig,
  SuperheroFlightConfig,
  DeformableGroundConfig,
  AnimeCombatDirectorConfig,
  TrafficSimulationConfig,
  CivilianPopulationConfig,
  WantedCrimeConfig,
  PoliceResponseConfig,
  VehicleTheftConfig,
  EscortMissionConfig,
  MinimapRadarConfig,
  SpaceshipFlightConfig,
  PhoneShellConfig,
  PhoneMessagingConfig,
  SocialEncounterConfig,
  LocationVisitConfig,
  ZombieHordeConfig,
  BarricadeConfig,
  MysteryBoxConfig,
  PerkVendingConfig,
  PackAPunchConfig,
  InfectionConfig,
  PowerGridConfig,
  ZombiePowerupsConfig,
  WonderWeaponsConfig,
  ZombieBossConfig,
  ZombieBuildablesConfig,
  EasterEggQuestConfig,
  GobbleGumConfig,
  HellhoundsConfig,
} from './types';
import { DEFAULT_ZOMBIE_HORDE_CONFIG } from './ZombieHordeAISystem';
import { DEFAULT_BARRICADE_CONFIG } from './BarricadeBoardingSystem';
import { DEFAULT_MYSTERY_BOX_CONFIG } from './MysteryBoxSystem';
import { DEFAULT_PERK_VENDING_CONFIG } from './PerkVendingSystem';
import { DEFAULT_PACK_A_PUNCH_CONFIG } from './PackAPunchSystem';
import { DEFAULT_INFECTION_CONFIG } from './InfectionImmunitySystem';
import { DEFAULT_POWER_GRID_CONFIG } from './PowerGridDoorsSystem';
import { DEFAULT_ZOMBIE_POWERUPS_CONFIG } from './ZombiePowerupDropsSystem';
import { DEFAULT_WONDER_WEAPONS_CONFIG } from './ZombieWonderWeaponsSystem';
import { DEFAULT_ZOMBIE_BOSS_CONFIG } from './ZombieBossEncounterSystem';
import { DEFAULT_ZOMBIE_BUILDABLES_CONFIG } from './ZombieBuildablesSystem';
import { DEFAULT_EASTER_EGG_CONFIG } from './ZombieEasterEggQuestSystem';
import { DEFAULT_GOBBLEGUM_CONFIG } from './GobbleGumSystem';
import { DEFAULT_HELLHOUNDS_CONFIG } from './HellhoundSpecialRoundSystem';

import { generalFeatureDescriptors } from './GeneralFeatureDescriptors';

export class GameplayFeatureRegistry {
  private static readonly descriptors = new Map<GameplayFeatureId, FeatureDescriptor<any>>();

  static register<TConfig>(descriptor: FeatureDescriptor<TConfig>): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  static get<TConfig>(id: GameplayFeatureId): FeatureDescriptor<TConfig> | undefined {
    return this.descriptors.get(id);
  }

  static list(): FeatureDescriptor<any>[] {
    return Array.from(this.descriptors.values());
  }

  static getDefaults<TConfig>(id: GameplayFeatureId): TConfig {
    const desc = this.descriptors.get(id);
    if (!desc) throw new Error(`Unknown gameplay feature: ${id}`);
    return JSON.parse(JSON.stringify(desc.defaultConfig));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 1: Target Lock and Switching
// ─────────────────────────────────────────────────────────────────────────────
const targetLockDescriptor: FeatureDescriptor<TargetLockConfig> = {
  id: 'target_lock',
  name: 'Target Lock-On & Cycling',
  category: 'combat',
  icon: '🎯',
  description: 'Z-targeting lock-on camera system with automatic target switching, strafe movement, and 3D lock reticle.',
  tags: ['camera', 'targeting', 'combat', 'lockon'],
  defaultConfig: {
    enabled: true,
    maxDistance: 25.0,
    fovAngle: 130,
    autoSwitchOnDeath: true,
    breakDistance: 32.0,
    breakTimeOutOfView: 2.0,
    cameraOrbitWeight: 0.75,
    showReticle: true,
    reticleColor: '#00f0ff',
    reticleScale: 1.0,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxDistance', label: 'Max Lock Range (m)', type: 'number', min: 5, max: 60, step: 1, default: 25 },
    { key: 'fovAngle', label: 'Lock FOV Angle (°)', type: 'number', min: 45, max: 180, step: 5, default: 130 },
    { key: 'autoSwitchOnDeath', label: 'Auto-Switch on Death', type: 'boolean', default: true },
    { key: 'breakDistance', label: 'Break Distance (m)', type: 'number', min: 10, max: 80, step: 1, default: 32 },
    { key: 'cameraOrbitWeight', label: 'Camera Lock Weight', type: 'number', min: 0.1, max: 1.0, step: 0.05, default: 0.75 },
    { key: 'reticleColor', label: 'Reticle Color', type: 'color', default: '#00f0ff' },
  ],
  presets: {
    souls: { maxDistance: 20, breakDistance: 26, cameraOrbitWeight: 0.85 },
    action: { maxDistance: 30, breakDistance: 40, cameraOrbitWeight: 0.65 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 2: Animation-Timed Hitboxes & Hurtboxes
// ─────────────────────────────────────────────────────────────────────────────
const timedHitboxDescriptor: FeatureDescriptor<TimedHitboxConfig> = {
  id: 'timed_hitboxes',
  name: 'Animation-Timed Hitboxes',
  category: 'combat',
  icon: '⚔️',
  description: 'Frame-accurate hitbox and hurtbox activation synchronized with animation notifies and weapon sockets.',
  tags: ['hitboxes', 'damage', 'collision', 'notifies'],
  defaultConfig: {
    enabled: true,
    debugDraw: false,
    multiHitAllowed: false,
    defaultDamage: 25,
    hitboxColor: '#ff2255',
    hurtboxColor: '#22cc88',
    weaponSockets: ['WeaponSocket', 'mixamorig:RightHand', 'mixamorig_RightHand', 'RightHand'],
    limbSockets: ['mixamorig:LeftHand', 'mixamorig:RightFoot', 'mixamorig:LeftFoot', 'mixamorig:Head'],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'debugDraw', label: 'Show Debug Hitbox Volumes', type: 'boolean', default: false },
    { key: 'multiHitAllowed', label: 'Allow Multi-Hit per Swing', type: 'boolean', default: false },
    { key: 'defaultDamage', label: 'Default Base Damage', type: 'number', min: 1, max: 500, step: 5, default: 25 },
    { key: 'hitboxColor', label: 'Hitbox Visual Color', type: 'color', default: '#ff2255' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 3: Combo Chains, Input Buffering & Cancel Windows
// ─────────────────────────────────────────────────────────────────────────────
const comboDescriptor: FeatureDescriptor<ComboConfig> = {
  id: 'combo_system',
  name: 'Combo Chains & Input Buffer',
  category: 'combat',
  icon: '⚡',
  description: 'Multi-hit branchable light/heavy combo chains, input buffering window, cancel frames, and combo rating counter.',
  tags: ['combos', 'action', 'buffer', 'cancels', 'rank'],
  defaultConfig: {
    enabled: true,
    inputBufferDuration: 0.35,
    comboResetDelay: 1.25,
    allowDodgeCancel: true,
    allowJumpCancel: true,
    allowBlockCancel: true,
    showComboCounter: true,
    lightCombo: [
      {
        name: 'Light 1 (Jab / Slash)',
        animation: 'Hook Punch',
        damageMultiplier: 1.0,
        poiseDamage: 15,
        cancelStartNorm: 0.55,
        inputBufferWindow: 0.3,
        knockbackForce: 2.0,
        audio: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
      },
      {
        name: 'Light 2 (Cross / Sweep)',
        animation: 'Uppercut Jab',
        damageMultiplier: 1.25,
        poiseDamage: 20,
        cancelStartNorm: 0.5,
        inputBufferWindow: 0.3,
        knockbackForce: 3.5,
        audio: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
      },
      {
        name: 'Light 3 (Kick / Thrust)',
        animation: 'Hurricane Kick',
        damageMultiplier: 1.6,
        poiseDamage: 35,
        cancelStartNorm: 0.6,
        inputBufferWindow: 0.3,
        knockbackForce: 6.0,
        audio: '/assets/audio/MELEE HEAVY/HEAVYKICK.wav',
      },
      {
        name: 'Light 4 (Finisher Slam)',
        animation: 'Punch To Elbow Combo',
        damageMultiplier: 2.2,
        poiseDamage: 60,
        cancelStartNorm: 0.7,
        inputBufferWindow: 0.25,
        knockbackForce: 12.0,
        audio: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
      },
    ],
    heavyCombo: [
      {
        name: 'Heavy 1 (Power Strike)',
        animation: 'Great Sword Slash',
        damageMultiplier: 2.0,
        poiseDamage: 50,
        cancelStartNorm: 0.65,
        inputBufferWindow: 0.35,
        knockbackForce: 8.0,
        audio: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
      },
      {
        name: 'Heavy 2 (Launcher Strike)',
        animation: 'Kicking',
        damageMultiplier: 2.8,
        poiseDamage: 85,
        cancelStartNorm: 0.7,
        inputBufferWindow: 0.3,
        knockbackForce: 15.0,
        audio: '/assets/audio/MELEE HEAVY/HEAVYKICK.wav',
      },
    ],
    runningAttack: {
      name: 'Running Slide Slash',
      animation: 'Mma Kick',
      damageMultiplier: 1.4,
      poiseDamage: 30,
      cancelStartNorm: 0.6,
      inputBufferWindow: 0.3,
      knockbackForce: 7.0,
      audio: '/assets/audio/MELEE HEAVY/HEAVYKICK.wav',
    },
    dodgeAttack: {
      name: 'Dodge Counter Attack',
      animation: 'Uppercut Jab',
      damageMultiplier: 1.75,
      poiseDamage: 45,
      cancelStartNorm: 0.55,
      inputBufferWindow: 0.35,
      knockbackForce: 9.0,
      audio: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
    },
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'inputBufferDuration', label: 'Input Buffer Window (s)', type: 'number', min: 0.1, max: 0.8, step: 0.05, default: 0.35 },
    { key: 'comboResetDelay', label: 'Combo Reset Delay (s)', type: 'number', min: 0.5, max: 3.0, step: 0.1, default: 1.25 },
    { key: 'allowDodgeCancel', label: 'Allow Dodge-Cancel on Hit', type: 'boolean', default: true },
    { key: 'allowJumpCancel', label: 'Allow Jump-Cancel', type: 'boolean', default: true },
    { key: 'allowBlockCancel', label: 'Allow Block-Cancel', type: 'boolean', default: true },
    { key: 'showComboCounter', label: 'Show Combo UI & Rank HUD', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: Dodge, Blocking, Parrying, Invulnerability & Stamina
// ─────────────────────────────────────────────────────────────────────────────
const dodgeGuardStaminaDescriptor: FeatureDescriptor<DodgeGuardStaminaConfig> = {
  id: 'dodge_guard_stamina',
  name: 'Dodge, Guard, Parry & Stamina',
  category: 'defense',
  icon: '🛡️',
  description: 'Directional dodge rolls with i-frames, guarded blocking stance, frame-tight parrying with hitstop counter, and stamina resource management.',
  tags: ['dodge', 'parry', 'block', 'stamina', 'iframes', 'defense'],
  defaultConfig: {
    enabled: true,
    // Stamina
    maxStamina: 100,
    staminaRegenRate: 30,
    staminaRegenDelay: 0.65,
    dodgeStaminaCost: 20,
    attackStaminaCost: 12,
    blockStaminaDrainRate: 15,
    guardBreakStunDuration: 2.0,
    // Dodge
    dodgeSpeed: 14.0,
    dodgeDuration: 0.45,
    dodgeIframesDuration: 0.28,
    dodgeTrailVfx: true,
    dodgeTrailColor: '#00f0ff',
    // Block & Parry
    blockDamageReduction: 0.85,
    blockAngleDegrees: 150,
    parryWindowDuration: 0.18,
    parryCounterCritMultiplier: 2.0,
    parryHitstopDuration: 0.08,
    parryVfx: 'impact_gold',
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxStamina', label: 'Max Stamina', type: 'number', min: 50, max: 300, step: 10, default: 100 },
    { key: 'staminaRegenRate', label: 'Stamina Regen / sec', type: 'number', min: 5, max: 100, step: 5, default: 30 },
    { key: 'dodgeStaminaCost', label: 'Dodge Stamina Cost', type: 'number', min: 5, max: 50, step: 5, default: 20 },
    { key: 'dodgeIframesDuration', label: 'Dodge Invulnerability (s)', type: 'number', min: 0.1, max: 0.6, step: 0.02, default: 0.28 },
    { key: 'blockDamageReduction', label: 'Block Damage Reduction (%)', type: 'number', min: 0.3, max: 1.0, step: 0.05, default: 0.85 },
    { key: 'parryWindowDuration', label: 'Parry Window (s)', type: 'number', min: 0.05, max: 0.4, step: 0.02, default: 0.18 },
    { key: 'parryCounterCritMultiplier', label: 'Parry Counter Multiplier', type: 'number', min: 1.2, max: 4.0, step: 0.1, default: 2.0 },
  ],
  presets: {
    souls: { maxStamina: 100, dodgeStaminaCost: 25, staminaRegenRate: 20, parryWindowDuration: 0.12, dodgeIframesDuration: 0.24 },
    action: { maxStamina: 120, dodgeStaminaCost: 15, staminaRegenRate: 45, parryWindowDuration: 0.22, dodgeIframesDuration: 0.35 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 5: Stagger, Knockback, Launch, Recovery & Hit Reactions
// ─────────────────────────────────────────────────────────────────────────────
const hitReactionDescriptor: FeatureDescriptor<HitReactionConfig> = {
  id: 'hit_reactions',
  name: 'Hit Reactions, Poise & Juggle',
  category: 'combat',
  icon: '💥',
  description: 'Super armor / poise system, flinches, heavy staggers, directional knockbacks, vertical launches into juggle airborne combos, and knockdown recoveries.',
  tags: ['poise', 'stagger', 'knockback', 'launch', 'juggle', 'hitstop'],
  defaultConfig: {
    enabled: true,
    defaultPoise: 60,
    poiseRegenRate: 20,
    poiseRegenDelay: 2.5,
    knockbackFriction: 8.0,
    launchGravity: 22.0,
    juggleDamageMultiplier: 1.35,
    groundBounceDuration: 0.5,
    wakeUpIframesDuration: 0.4,
    hitstopDuration: 0.06,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'defaultPoise', label: 'Default Character Poise', type: 'number', min: 10, max: 300, step: 10, default: 60 },
    { key: 'juggleDamageMultiplier', label: 'Air Juggle Damage Bonus', type: 'number', min: 1.0, max: 2.5, step: 0.05, default: 1.35 },
    { key: 'hitstopDuration', label: 'Impact Hitstop Freeze (s)', type: 'number', min: 0, max: 0.2, step: 0.01, default: 0.06 },
    { key: 'wakeUpIframesDuration', label: 'Wake-Up Invulnerability (s)', type: 'number', min: 0.1, max: 1.0, step: 0.05, default: 0.4 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 6: Abilities, MP, Cooldowns, Status Effects & Elemental Rules
// ─────────────────────────────────────────────────────────────────────────────
const abilityElementalDescriptor: FeatureDescriptor<AbilityElementalConfig> = {
  id: 'abilities_magic',
  name: 'Abilities, Status & Elements',
  category: 'combat',
  icon: '🔮',
  description: 'Action hotbar skill abilities (1-4 / Q, E, R, F), MP mana pool, cooldown timers, elemental reactions (Vaporize, Shockwave, Firestorm), and status ailments.',
  tags: ['abilities', 'spells', 'mana', 'elements', 'status', 'magic'],
  defaultConfig: {
    enabled: true,
    maxMp: 100,
    mpRegenRate: 5,
    enableElementalReactions: true,
    abilities: [
      {
        id: 'fireball_burst',
        name: 'Flame Surge',
        slot: 1,
        keybind: '1 / Q',
        icon: '🔥',
        mpCost: 25,
        cooldown: 4.0,
        castTime: 0.2,
        element: 'fire',
        baseDamage: 55,
        range: 16,
        radius: 3.5,
        animation: 'Spell cast with Sword',
        vfx: 'impact_fire',
        audio: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
        description: 'Launches a searing projectile wave that explodes on contact, burning targets.',
        statusEffect: 'burn',
      },
      {
        id: 'frost_nova',
        name: 'Glacial Nova',
        slot: 2,
        keybind: '2 / E',
        icon: '❄️',
        mpCost: 30,
        cooldown: 6.0,
        castTime: 0.15,
        element: 'ice',
        baseDamage: 40,
        range: 6,
        radius: 6.0,
        animation: 'Standing 2H Magic Attack 03',
        vfx: 'impact_cyan',
        audio: '/assets/audio/MELEE HEAVY/HEAVYKICK.wav',
        description: 'Releases a radial frost blast freezing and slowing nearby enemies.',
        statusEffect: 'freeze',
      },
      {
        id: 'thunder_chain',
        name: 'Lightning Bolt',
        slot: 3,
        keybind: '3 / R',
        icon: '⚡',
        mpCost: 45,
        cooldown: 10.0,
        castTime: 0.3,
        element: 'lightning',
        baseDamage: 90,
        range: 20,
        radius: 4.0,
        animation: 'Two Hand Spell Casting',
        vfx: 'impact_purple',
        audio: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
        description: 'Strikes the target with high-voltage lightning causing heavy stagger.',
        statusEffect: 'shock',
      },
      {
        id: 'divine_shield',
        name: 'Sacred Aegis & Heal',
        slot: 4,
        keybind: '4 / F',
        icon: '✨',
        mpCost: 40,
        cooldown: 14.0,
        castTime: 0.25,
        element: 'holy',
        baseDamage: 0,
        range: 0,
        radius: 4.0,
        animation: 'Magic Heal',
        vfx: 'impact_gold',
        audio: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
        description: 'Restores 40 HP and creates a glowing barrier absorbing the next 2 hits.',
        statusEffect: 'barrier',
      },
    ],
    statusEffects: [
      {
        id: 'burn',
        name: 'Burning',
        element: 'fire',
        duration: 5.0,
        tickInterval: 1.0,
        tickDamage: 8,
        speedMultiplier: 1.0,
        damageMultiplier: 1.0,
        stun: false,
        vfxColor: '#ff4400',
        icon: '🔥',
      },
      {
        id: 'freeze',
        name: 'Frozen / Chilled',
        element: 'ice',
        duration: 3.5,
        tickInterval: 0,
        tickDamage: 0,
        speedMultiplier: 0.45,
        damageMultiplier: 1.0,
        stun: false,
        vfxColor: '#00ddff',
        icon: '❄️',
      },
      {
        id: 'shock',
        name: 'Shocked',
        element: 'lightning',
        duration: 3.0,
        tickInterval: 1.0,
        tickDamage: 12,
        speedMultiplier: 0.8,
        damageMultiplier: 1.15,
        stun: false,
        vfxColor: '#c084fc',
        icon: '⚡',
      },
      {
        id: 'barrier',
        name: 'Holy Barrier',
        element: 'holy',
        duration: 8.0,
        tickInterval: 0,
        tickDamage: 0,
        speedMultiplier: 1.1,
        damageMultiplier: 0.5,
        stun: false,
        vfxColor: '#ffd479',
        icon: '✨',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxMp', label: 'Max MP (Mana Pool)', type: 'number', min: 50, max: 500, step: 10, default: 100 },
    { key: 'mpRegenRate', label: 'MP Regen Rate / sec', type: 'number', min: 1, max: 30, step: 1, default: 5 },
    { key: 'enableElementalReactions', label: 'Enable Elemental Reactions (Melt/Vaporize)', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 7: Enemy Telegraphs, Spacing & Boss Phases
// ─────────────────────────────────────────────────────────────────────────────
const encounterAIDescriptor: FeatureDescriptor<EncounterAIConfig> = {
  id: 'enemy_boss_ai',
  name: 'Enemy Telegraphs & Boss Phases',
  category: 'ai',
  icon: '👹',
  description: 'Ground danger telegraph markers, attack token coordinator for smart enemy spacing/circling, and multi-phase boss encounters.',
  tags: ['ai', 'boss', 'phases', 'telegraphs', 'tokens', 'spacing'],
  defaultConfig: {
    enabled: true,
    enableTelegraphs: true,
    telegraphDuration: 0.85,
    telegraphColor: '#ff2244',
    maxSimultaneousAttackTokens: 2,
    combatSpacingRadius: 5.0,
    circlingSpeed: 2.2,
    enableBossPhases: true,
    bossPhases: [
      {
        phase: 1,
        hpThresholdPercent: 100,
        name: 'Phase 1: Guardian Stance',
        themeColor: '#00f0ff',
        speedMultiplier: 1.0,
        damageMultiplier: 1.0,
        attackIntervalMultiplier: 1.0,
        unlockedAbilities: ['slash', 'jab'],
        transitionVfx: 'impact_cyan',
      },
      {
        phase: 2,
        hpThresholdPercent: 65,
        name: 'Phase 2: Raging Demon',
        themeColor: '#ffd479',
        speedMultiplier: 1.25,
        damageMultiplier: 1.35,
        attackIntervalMultiplier: 0.8,
        unlockedAbilities: ['slash', 'jab', 'fireball_burst'],
        transitionVfx: 'impact_gold',
      },
      {
        phase: 3,
        hpThresholdPercent: 30,
        name: 'Phase 3: Cataclysm Unleashed',
        themeColor: '#ff2255',
        speedMultiplier: 1.5,
        damageMultiplier: 1.8,
        attackIntervalMultiplier: 0.6,
        unlockedAbilities: ['slash', 'jab', 'fireball_burst', 'frost_nova', 'thunder_chain'],
        transitionVfx: 'impact_red',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'enableTelegraphs', label: 'Show Ground Attack Telegraphs', type: 'boolean', default: true },
    { key: 'telegraphDuration', label: 'Telegraph Warning Duration (s)', type: 'number', min: 0.3, max: 2.0, step: 0.05, default: 0.85 },
    { key: 'maxSimultaneousAttackTokens', label: 'Max Attacking Enemies at Once', type: 'number', min: 1, max: 6, step: 1, default: 2 },
    { key: 'combatSpacingRadius', label: 'Enemy Combat Spacing Ring (m)', type: 'number', min: 2, max: 12, step: 0.5, default: 5.0 },
    { key: 'enableBossPhases', label: 'Enable Boss Multi-Phase Transitions', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 8: Character Stats, Leveling & Equipment
// ─────────────────────────────────────────────────────────────────────────────
const statsProgressionDescriptor: FeatureDescriptor<StatsProgressionConfig> = {
  id: 'stats_progression',
  name: 'Stats, Leveling & Equipment',
  category: 'progression',
  icon: '📈',
  description: 'Full RPG character attributes (HP, MP, Stamina, Attack, Defense, Crit), EXP leveling curve, level-up milestones, and equipment bonuses.',
  tags: ['rpg', 'stats', 'leveling', 'exp', 'equipment', 'progression'],
  defaultConfig: {
    enabled: true,
    levelCap: 50,
    baseAttributes: {
      level: 1,
      currentExp: 0,
      expToNextLevel: 100,
      maxHp: 100,
      maxMp: 100,
      maxStamina: 100,
      attackPower: 25,
      defense: 10,
      critRate: 0.1,
      critDamage: 1.5,
      moveSpeed: 6.0,
    },
    statGrowthPerLevel: {
      maxHp: 15,
      maxMp: 10,
      maxStamina: 5,
      attackPower: 4,
      defense: 2,
      critRate: 0.01,
    },
    equipment: [
      { id: 'katana_void', name: 'Void Edge Katana', slot: 'weapon', attackBonus: 20, critRateBonus: 0.08, element: 'dark', icon: '⚔️' },
      { id: 'armor_shadow', name: 'Shadow Gi', slot: 'armor', defenseBonus: 15, hpBonus: 30, icon: '🥋' },
      { id: 'ring_fury', name: 'Ring of Frenzy', slot: 'accessory', attackBonus: 10, critRateBonus: 0.05, icon: '💍' },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'levelCap', label: 'Max Level Cap', type: 'number', min: 10, max: 100, step: 5, default: 50 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 9: Arena Waves, Victory/Reward/Rematch Flow
// ─────────────────────────────────────────────────────────────────────────────
const arenaWaveDescriptor: FeatureDescriptor<ArenaWaveConfig> = {
  id: 'arena_flow',
  name: 'Arena Waves & Rematch Flow',
  category: 'encounter',
  icon: '🏆',
  description: 'Multi-wave enemy spawner rounds, wave announcement overlays, victory grade calculation (S/A/B/C), reward payouts, and rematch/retry loops.',
  tags: ['arena', 'waves', 'rewards', 'victory', 'rematch', 'encounter'],
  defaultConfig: {
    enabled: true,
    autoStartOnPlay: false,
    victoryBanner: 'VICTORY ACHIEVED',
    defeatBanner: 'YOU HAVE FALLEN',
    showWaveHUD: true,
    enableRematchFlow: true,
    waves: [
      {
        waveNumber: 1,
        title: 'Wave 1: Scout Patrol',
        rewardExp: 150,
        rewardGold: 50,
        intermissionSec: 3.0,
        enemies: [
          { blueprint: 'opp', count: 3, delaySec: 0.5, customHp: 80 },
        ],
      },
      {
        waveNumber: 2,
        title: 'Wave 2: Elite Vanguard',
        rewardExp: 300,
        rewardGold: 120,
        intermissionSec: 4.0,
        enemies: [
          { blueprint: 'opp', count: 3, delaySec: 0.5, customHp: 100 },
          { blueprint: 'hana', count: 1, delaySec: 1.0, isElite: true, customHp: 200 },
        ],
      },
      {
        waveNumber: 3,
        title: 'Wave 3: Boss Encounter — The Warlord',
        rewardExp: 1000,
        rewardGold: 500,
        intermissionSec: 0,
        enemies: [
          { blueprint: 'ayo', count: 1, delaySec: 0, isBoss: true, customHp: 600 },
          { blueprint: 'opp', count: 2, delaySec: 2.0, customHp: 80 },
        ],
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'autoStartOnPlay', label: 'Auto-Start Wave 1 on Play Mode', type: 'boolean', default: false },
    { key: 'showWaveHUD', label: 'Show Arena Wave HUD Banner', type: 'boolean', default: true },
    { key: 'enableRematchFlow', label: 'Enable Victory / Rematch Screen Flow', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 10: Stealth, Vision Cones & Backstab Assassination
// ─────────────────────────────────────────────────────────────────────────────
const stealthDescriptor: FeatureDescriptor<StealthConfig> = {
  id: 'stealth_detection',
  name: 'Stealth & Assassination',
  category: 'stealth',
  icon: '🥷',
  description: 'Crouch sneak stance, enemy vision cones, detection meters, and backstab critical executions.',
  tags: ['stealth', 'crouch', 'assassination', 'detection', 'backstab'],
  defaultConfig: {
    enabled: true,
    crouchSpeedMultiplier: 0.45,
    detectionRange: 15.0,
    detectionAngle: 100,
    detectionSpeed: 1.5,
    backstabAngleThreshold: 60,
    backstabDamageMultiplier: 4.0,
    backstabRange: 2.0,
    executionAnimation: 'Punch To Elbow Combo',
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'crouchSpeedMultiplier', label: 'Crouch Speed Multiplier', type: 'number', min: 0.2, max: 1.0, step: 0.05, default: 0.45 },
    { key: 'detectionRange', label: 'Enemy Vision Range (m)', type: 'number', min: 5, max: 40, step: 1, default: 15.0 },
    { key: 'detectionAngle', label: 'Vision Cone Angle (°)', type: 'number', min: 40, max: 180, step: 5, default: 100 },
    { key: 'backstabDamageMultiplier', label: 'Backstab Crit Multiplier (x)', type: 'number', min: 1.5, max: 10.0, step: 0.5, default: 4.0 },
    { key: 'backstabRange', label: 'Backstab Trigger Range (m)', type: 'number', min: 1.0, max: 4.0, step: 0.2, default: 2.0 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 11: Parkour & Ledge Traversal
// ─────────────────────────────────────────────────────────────────────────────
const parkourDescriptor: FeatureDescriptor<ParkourConfig> = {
  id: 'parkour_traversal',
  name: 'Parkour & Ledge Traversal',
  category: 'traversal',
  icon: '🏃',
  description: 'Dynamic obstacle vaulting, ledge detection, wall climb, and mantle animations.',
  tags: ['parkour', 'vault', 'climb', 'ledge', 'traversal'],
  defaultConfig: {
    enabled: true,
    vaultMaxHeight: 1.2,
    vaultMinHeight: 0.4,
    climbMaxHeight: 2.5,
    wallRunDuration: 1.2,
    autoLedgeGrab: true,
    mantleAnimation: 'Backflip',
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'vaultMaxHeight', label: 'Max Vault Height (m)', type: 'number', min: 0.6, max: 2.0, step: 0.1, default: 1.2 },
    { key: 'climbMaxHeight', label: 'Max Climb Height (m)', type: 'number', min: 1.5, max: 4.0, step: 0.2, default: 2.5 },
    { key: 'autoLedgeGrab', label: 'Auto-Grab Ledges on Jump', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 12: Loot Drops & Inventory Grid
// ─────────────────────────────────────────────────────────────────────────────
const lootInventoryDescriptor: FeatureDescriptor<LootInventoryConfig> = {
  id: 'loot_inventory',
  name: 'Loot Drops & Inventory',
  category: 'progression',
  icon: '💎',
  description: '3D glowing item pickups, rarity tiers (Common -> Legendary), inventory storage, and stat equipment bonuses.',
  tags: ['loot', 'inventory', 'equipment', 'rarity', 'drops'],
  defaultConfig: {
    enabled: true,
    dropRate: 0.85,
    pickupRadius: 2.2,
    autoPickupGold: true,
    maxInventorySlots: 24,
    highlightRarityColor: true,
    possibleDrops: [
      { id: 'sword_iron', name: 'Iron Longsword', rarity: 'common', category: 'weapon', value: 25, icon: '⚔️', color: '#ffffff', statBonus: { attack: 10 } },
      { id: 'sword_flame', name: 'Blazing Greatsword', rarity: 'rare', category: 'weapon', value: 120, icon: '🗡️', color: '#3b82f6', statBonus: { attack: 28 } },
      { id: 'armor_knight', name: 'Steel Plate Armor', rarity: 'uncommon', category: 'armor', value: 75, icon: '🛡️', color: '#22c55e', statBonus: { defense: 15, maxHp: 50 } },
      { id: 'potion_heal', name: 'Greater Healing Potion', rarity: 'rare', category: 'potion', value: 40, icon: '🧪', color: '#3b82f6' },
      { id: 'relic_dragon', name: 'Dragon Heart Core', rarity: 'legendary', category: 'material', value: 500, icon: '👑', color: '#f59e0b', statBonus: { attack: 50, defense: 30, maxHp: 100 } },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'dropRate', label: 'Enemy Drop Chance (0..1)', type: 'number', min: 0.1, max: 1.0, step: 0.05, default: 0.85 },
    { key: 'pickupRadius', label: 'Pickup Proximity Radius (m)', type: 'number', min: 1.0, max: 5.0, step: 0.5, default: 2.2 },
    { key: 'autoPickupGold', label: 'Auto-Pickup Gold on Walkover', type: 'boolean', default: true },
    { key: 'maxInventorySlots', label: 'Max Bag Slots', type: 'number', min: 10, max: 64, step: 2, default: 24 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 13: Interactive Dialogue & Cutscene Choices
// ─────────────────────────────────────────────────────────────────────────────
const dialogueDescriptor: FeatureDescriptor<DialogueConfig> = {
  id: 'dialogue_system',
  name: 'Interactive Dialogue & Choices',
  category: 'narrative',
  icon: '💬',
  description: 'Branching dialogue tree with speaker portraits, typewriter subtitles, choices, and camera framing.',
  tags: ['dialogue', 'story', 'choices', 'npc', 'narrative'],
  defaultConfig: {
    enabled: true,
    dialogueCameraFraming: true,
    typingSpeedCharsPerSec: 45,
    interactionRadius: 3.0,
    nodes: {
      intro: {
        id: 'intro',
        speakerName: 'Guildmaster Vance',
        text: 'Welcome, warrior. The arena awaits your blade. Are you prepared to face the warlords?',
        choices: [
          { text: '⚔️ I am ready for battle.', action: 'start_arena' },
          { text: '🛡️ Tell me about the combat techniques.', nextId: 'tips' },
        ],
      },
      tips: {
        id: 'tips',
        speakerName: 'Guildmaster Vance',
        text: 'Time your blocks precisely on incoming strikes to parry and stagger your foe. Use dodge rolls when super armor cannot be broken!',
        choices: [
          { text: '⚔️ Understood! Let the trial begin.', action: 'start_arena' },
        ],
      },
    },
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'dialogueCameraFraming', label: 'Frame Camera on Speaker', type: 'boolean', default: true },
    { key: 'typingSpeedCharsPerSec', label: 'Typewriter Text Speed (chars/s)', type: 'number', min: 15, max: 100, step: 5, default: 45 },
    { key: 'interactionRadius', label: 'Interaction Trigger Distance (m)', type: 'number', min: 1.5, max: 6.0, step: 0.5, default: 3.0 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 14: Over-The-Shoulder Ranged Shooter & Gunplay
// ─────────────────────────────────────────────────────────────────────────────
const rangedShooterDescriptor: FeatureDescriptor<RangedShooterConfig> = {
  id: 'ranged_shooter',
  name: 'Third-Person Gunplay',
  category: 'ranged',
  icon: '🎯',
  description: 'Over-the-shoulder aim zoom, ballistics, headshots, dynamic crosshairs, and reload mechanics.',
  tags: ['shooter', 'aim', 'gun', 'ballistics', 'headshot', 'crosshair'],
  defaultConfig: {
    enabled: true,
    aimZoomFov: 45,
    aimShoulderOffset: { x: 0.6, y: 1.4, z: -1.8 },
    crosshairSpread: 0.02,
    headshotMultiplier: 2.5,
    defaultWeapon: 'rifle',
    weapons: [
      {
        id: 'pistol',
        name: 'Tactical Pistol',
        type: 'pistol',
        damage: 25,
        fireRate: 4.0,
        magazineSize: 12,
        reloadDuration: 1.2,
        range: 40,
        spread: 0.015,
        muzzleVfx: 'spark',
        impactVfx: 'spark',
        audioFire: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
        audioReload: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
      },
      {
        id: 'rifle',
        name: 'Assault Carbine',
        type: 'rifle',
        damage: 32,
        fireRate: 8.5,
        magazineSize: 30,
        reloadDuration: 1.8,
        range: 65,
        spread: 0.025,
        muzzleVfx: 'spark',
        impactVfx: 'spark',
        audioFire: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
        audioReload: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'aimZoomFov', label: 'Aim Zoom FOV (°)', type: 'number', min: 30, max: 70, step: 5, default: 45 },
    { key: 'headshotMultiplier', label: 'Headshot Crit Multiplier (x)', type: 'number', min: 1.5, max: 5.0, step: 0.25, default: 2.5 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 15: Vehicle Driving & Mount System
// ─────────────────────────────────────────────────────────────────────────────
const vehicleMountDescriptor: FeatureDescriptor<VehicleMountConfig> = {
  id: 'vehicle_mount',
  name: 'Vehicles & Mounts',
  category: 'vehicles',
  icon: '🏎️',
  description: 'Mount/dismount vehicles, arcade driving physics, drifting, nitro boost, and speedometers.',
  tags: ['vehicle', 'car', 'mount', 'driving', 'nitro', 'speed'],
  defaultConfig: {
    enabled: true,
    mountRadius: 3.0,
    maxSpeed: 28.0,
    acceleration: 18.0,
    turnSpeed: 2.8,
    driftFactor: 0.85,
    boostMultiplier: 1.8,
    boostDuration: 4.0,
    vehicles: [
      {
        id: 'car_buggy',
        name: 'Dune Buggy',
        type: 'car',
        maxSpeed: 28.0,
        acceleration: 18.0,
        turnSpeed: 2.8,
        driftFactor: 0.85,
        boostMultiplier: 1.8,
        boostDuration: 4.0,
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxSpeed', label: 'Top Speed (m/s)', type: 'number', min: 10, max: 60, step: 2, default: 28.0 },
    { key: 'acceleration', label: 'Acceleration Rate', type: 'number', min: 5, max: 40, step: 1, default: 18.0 },
    { key: 'boostMultiplier', label: 'Nitro Boost Multiplier', type: 'number', min: 1.2, max: 3.0, step: 0.1, default: 1.8 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 16: Grappling Hook & Web Swing Physics
// ─────────────────────────────────────────────────────────────────────────────
const grappleHookDescriptor: FeatureDescriptor<GrappleHookConfig> = {
  id: 'grapple_swing',
  name: 'Grapple Hook & Zip-line',
  category: 'traversal',
  icon: '🪝',
  description: 'Physics spring pull toward anchor points, slingshot momentum releases, and enemy reel-in.',
  tags: ['grapple', 'hook', 'zip', 'swing', 'traversal', 'physics'],
  defaultConfig: {
    enabled: true,
    maxRange: 35.0,
    pullSpeed: 24.0,
    swingGravity: 9.8,
    ropeColor: '#00f0ff',
    slingshotBoost: 14.0,
    pullEnemies: true,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxRange', label: 'Max Grapple Range (m)', type: 'number', min: 10, max: 80, step: 5, default: 35.0 },
    { key: 'pullSpeed', label: 'Pull Velocity (m/s)', type: 'number', min: 10, max: 50, step: 2, default: 24.0 },
    { key: 'pullEnemies', label: 'Reel-In Light Enemies', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 17: Bullet Time & Time Rewind Mechanics
// ─────────────────────────────────────────────────────────────────────────────
const timeMechanicsDescriptor: FeatureDescriptor<TimeMechanicsConfig> = {
  id: 'time_mechanics',
  name: 'Bullet Time & Time Dilation',
  category: 'combat',
  icon: '⏳',
  description: 'Slow-motion bullet time on perfect parries/triggers, time dilation, and 3-second temporal rewind.',
  tags: ['time', 'bullet_time', 'slowmo', 'rewind', 'dilation'],
  defaultConfig: {
    enabled: true,
    bulletTimeScale: 0.2,
    bulletTimeDuration: 3.5,
    bulletTimeCooldown: 8.0,
    rewindDuration: 3.0,
    triggerOnPerfectDodge: true,
    screenEffect: true,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'bulletTimeScale', label: 'Slowmo Time Scale (0..1)', type: 'number', min: 0.05, max: 0.5, step: 0.05, default: 0.2 },
    { key: 'bulletTimeDuration', label: 'Bullet Time Duration (s)', type: 'number', min: 1.0, max: 8.0, step: 0.5, default: 3.5 },
    { key: 'triggerOnPerfectDodge', label: 'Auto-Trigger on Perfect Parry', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 18: Crafting & Resource Gathering
// ─────────────────────────────────────────────────────────────────────────────
const craftingGatheringDescriptor: FeatureDescriptor<CraftingGatheringConfig> = {
  id: 'crafting_gathering',
  name: 'Crafting & Alchemy',
  category: 'crafting',
  icon: '🛠️',
  description: 'Resource gathering, recipe matrix, potion brewing, weapon crafting, and instant queue.',
  tags: ['crafting', 'recipes', 'alchemy', 'gathering', 'resources'],
  defaultConfig: {
    enabled: true,
    harvestRadius: 2.5,
    harvestTime: 1.2,
    autoDiscoverRecipes: true,
    recipes: [
      {
        id: 'craft_blazing_sword',
        resultItemId: 'sword_flame',
        resultCount: 1,
        ingredients: [
          { itemId: 'sword_iron', count: 1 },
          { itemId: 'relic_dragon', count: 1 },
        ],
        craftDuration: 1.5,
        category: 'weapon',
      },
      {
        id: 'craft_heal_potion',
        resultItemId: 'potion_heal',
        resultCount: 2,
        ingredients: [
          { itemId: 'sword_iron', count: 1 },
        ],
        craftDuration: 0.8,
        category: 'potion',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'harvestRadius', label: 'Resource Interact Range (m)', type: 'number', min: 1.0, max: 5.0, step: 0.5, default: 2.5 },
    { key: 'autoDiscoverRecipes', label: 'Auto-Discover All Recipes', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 19: Pet, Companion & Summon Follower AI
// ─────────────────────────────────────────────────────────────────────────────
const companionSummonDescriptor: FeatureDescriptor<CompanionSummonConfig> = {
  id: 'companion_summon',
  name: 'Pet & Companion Summon',
  category: 'ai',
  icon: '🐺',
  description: 'Summon battle pets / familiars with follow, assist, enemy aggro, and emergency revival heals.',
  tags: ['companion', 'pet', 'summon', 'familiar', 'ally', 'follower'],
  defaultConfig: {
    enabled: true,
    companionName: 'Spirit Wolf',
    companionModel: 'wolf',
    followDistance: 3.5,
    aggroRadius: 14.0,
    attackCooldown: 1.8,
    attackDamage: 22,
    reviveThresholdHpPercent: 25,
    commandMode: 'assist',
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'followDistance', label: 'Follow Leash Distance (m)', type: 'number', min: 2.0, max: 8.0, step: 0.5, default: 3.5 },
    { key: 'aggroRadius', label: 'Enemy Aggro Range (m)', type: 'number', min: 5.0, max: 30.0, step: 1.0, default: 14.0 },
    { key: 'attackDamage', label: 'Companion Attack Power', type: 'number', min: 5, max: 100, step: 5, default: 22 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 20: Weapon Wheel & Multi-Slot Loadout
// ─────────────────────────────────────────────────────────────────────────────
const weaponLoadoutDescriptor: FeatureDescriptor<WeaponWheelConfig> = {
  id: 'weapon_wheel_loadout',
  name: 'Weapon Wheel & Loadouts',
  category: 'loadout',
  icon: '🔫',
  description: 'Radial weapon wheel selector (Tab), 6 configurable weapon slots, slow-motion selection matrix, and instant hotkey cycling (1-6 / Scroll).',
  tags: ['weapon', 'wheel', 'loadout', 'slots', 'guns', 'inventory'],
  defaultConfig: {
    enabled: true,
    switchTime: 0.35,
    slowTimeDuringWheel: true,
    timeScale: 0.15,
    slots: [
      {
        slot: 1,
        id: 'pistol_9mm',
        name: '9mm Tactical Pistol',
        category: 'pistol',
        damage: 28,
        fireRate: 4.5,
        magazineCapacity: 15,
        reloadTime: 1.2,
        range: 45,
        icon: '🔫',
        crosshairType: 'dot',
      },
      {
        slot: 2,
        id: 'assault_rifle',
        name: 'ARC-15 Assault Rifle',
        category: 'rifle',
        damage: 34,
        fireRate: 9.0,
        magazineCapacity: 30,
        reloadTime: 1.8,
        range: 80,
        icon: '🎯',
        crosshairType: 'cross',
      },
      {
        slot: 3,
        id: 'pump_shotgun',
        name: 'Breacher 12G Shotgun',
        category: 'shotgun',
        damage: 85,
        fireRate: 1.2,
        magazineCapacity: 8,
        reloadTime: 2.4,
        range: 20,
        icon: '💥',
        crosshairType: 'shotgun',
      },
      {
        slot: 4,
        id: 'sniper_bolt',
        name: 'Viper .50cal Sniper',
        category: 'sniper',
        damage: 180,
        fireRate: 0.8,
        magazineCapacity: 5,
        reloadTime: 2.8,
        range: 200,
        icon: '🔭',
        crosshairType: 'cross',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'switchTime', label: 'Weapon Draw Delay (s)', type: 'number', min: 0.1, max: 1.0, step: 0.05, default: 0.35 },
    { key: 'slowTimeDuringWheel', label: 'Bullet-Time on Wheel Open', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 21: Cover & Tactical Peeking System
// ─────────────────────────────────────────────────────────────────────────────
const coverPeekingDescriptor: FeatureDescriptor<CoverPeekingConfig> = {
  id: 'cover_peeking',
  name: 'Cover & Tactical Peeking',
  category: 'stealth',
  icon: '🧱',
  description: 'Wall proximity cover snapping (C), automatic low/high barricade classification, and corner leaning / peeking (Q/E).',
  tags: ['cover', 'peeking', 'lean', 'tactical', 'shooter', 'stealth'],
  defaultConfig: {
    enabled: true,
    snapDistance: 1.6,
    lowCoverHeight: 1.2,
    highCoverHeight: 2.0,
    leanAngle: 0.35,
    aimStepOutDistance: 0.7,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'snapDistance', label: 'Cover Snap Distance (m)', type: 'number', min: 0.8, max: 3.0, step: 0.1, default: 1.6 },
    { key: 'leanAngle', label: 'Lean Angle (rad)', type: 'number', min: 0.1, max: 0.6, step: 0.05, default: 0.35 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 22: Ballistics, Grenades & Explosives
// ─────────────────────────────────────────────────────────────────────────────
const explosivesDescriptor: FeatureDescriptor<ExplosivesConfig> = {
  id: 'ballistics_explosives',
  name: 'Grenades & Explosives',
  category: 'explosives',
  icon: '💣',
  description: 'Physics-lobbed grenades (Key G), bounce physics, fuse timers, area blast falloff damage, and shockwave impulse physics.',
  tags: ['grenades', 'explosives', 'physics', 'ballistics', 'aoe', 'blast'],
  defaultConfig: {
    enabled: true,
    maxCarriedGrenades: 4,
    grenadeThrowCooldown: 1.5,
    grenades: [
      {
        id: 'frag_grenade',
        name: 'M67 Frag Grenade',
        type: 'frag',
        blastRadius: 8.0,
        damage: 120,
        fuseTime: 2.5,
        throwVelocity: 16.0,
        bounciness: 0.45,
        icon: '💣',
      },
      {
        id: 'smoke_grenade',
        name: 'Thermal Smoke Grenade',
        type: 'smoke',
        blastRadius: 10.0,
        damage: 0,
        fuseTime: 1.8,
        throwVelocity: 14.0,
        bounciness: 0.3,
        icon: '💨',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxCarriedGrenades', label: 'Max Carried Grenades', type: 'number', min: 1, max: 10, step: 1, default: 4 },
    { key: 'grenadeThrowCooldown', label: 'Throw Cooldown (s)', type: 'number', min: 0.5, max: 5.0, step: 0.25, default: 1.5 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 23: Killstreaks & Tactical Rewards
// ─────────────────────────────────────────────────────────────────────────────
const killstreakDescriptor: FeatureDescriptor<KillstreakConfig> = {
  id: 'killstreaks_rewards',
  name: 'Killstreaks & Rewards',
  category: 'loadout',
  icon: '🎖️',
  description: 'Multi-kill streak detection, radar UAV enemy pings, tactical supply health drops, and orbital artillery strikes.',
  tags: ['killstreak', 'multi-kill', 'rewards', 'radar', 'airstrike', 'score'],
  defaultConfig: {
    enabled: true,
    streakResetTime: 6.0,
    rewards: [
      {
        streakCount: 3,
        id: 'uav_radar',
        name: 'UAV Recon Scan',
        type: 'uav_radar',
        duration: 12.0,
        icon: '📡',
        bannerTitle: 'UAV ONLINE (Radar Active)',
      },
      {
        streakCount: 5,
        id: 'health_pack',
        name: 'Emergency Med-Kit',
        type: 'health_pack',
        duration: 0,
        icon: '💉',
        bannerTitle: 'MED-KIT DEPLOYED (+50 HP)',
      },
      {
        streakCount: 7,
        id: 'airstrike',
        name: 'Artillery Strike',
        type: 'airstrike',
        duration: 2.0,
        icon: '🚀',
        bannerTitle: 'AIRSTRIKE INBOUND (100 AOE Dmg)',
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'streakResetTime', label: 'Streak Timeout (s)', type: 'number', min: 2.0, max: 15.0, step: 0.5, default: 6.0 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 24: Bonfire / Grace Checkpoint & World Respawn
// ─────────────────────────────────────────────────────────────────────────────
const bonfireCheckpointDescriptor: FeatureDescriptor<BonfireCheckpointConfig> = {
  id: 'bonfire_checkpoint',
  name: 'Bonfire & World Respawn',
  category: 'souls',
  icon: '🪵',
  description: 'Interactive Sites of Grace / Bonfires (Key E), full HP/MP/Flask recovery, non-boss enemy world respawns, and fast travel.',
  tags: ['bonfire', 'souls', 'grace', 'checkpoint', 'respawn', 'fast-travel'],
  defaultConfig: {
    enabled: true,
    healOnRest: true,
    restoreFlasksOnRest: true,
    respawnEnemiesOnRest: true,
    interactionRadius: 2.5,
    bonfires: [
      {
        id: 'sanctuary_bonfire',
        name: 'Shrine of the First Flame',
        position: { x: 0, y: 0, z: 0 } as any,
        discovered: true,
      },
      {
        id: 'arena_bonfire',
        name: 'Gladiator Gates Grace',
        position: { x: 0, y: 0, z: -25 } as any,
        discovered: false,
      },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'healOnRest', label: 'Heal Player to Full on Rest', type: 'boolean', default: true },
    { key: 'restoreFlasksOnRest', label: 'Refill Estus Flasks on Rest', type: 'boolean', default: true },
    { key: 'respawnEnemiesOnRest', label: 'Respawn Non-Boss World Enemies', type: 'boolean', default: true },
    { key: 'interactionRadius', label: 'Interaction Radius (m)', type: 'number', min: 1.0, max: 5.0, step: 0.5, default: 2.5 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 25: Estus Flask & Healing Consumables
// ─────────────────────────────────────────────────────────────────────────────
const estusFlaskDescriptor: FeatureDescriptor<EstusFlaskConfig> = {
  id: 'estus_flask_healing',
  name: 'Estus Flasks & Tears',
  category: 'souls',
  icon: '🧪',
  description: 'Rechargeable Crimson (HP) & Cerulean (MP) Tear flasks, deliberate drinking slowdown frames, upgrade tiers, and bonfire refill.',
  tags: ['estus', 'flask', 'heal', 'souls', 'crimson', 'cerulean', 'mana'],
  defaultConfig: {
    enabled: true,
    maxCrimsonFlasks: 5,
    maxCeruleanFlasks: 3,
    crimsonHealAmount: 60,
    ceruleanMpAmount: 50,
    drinkDuration: 1.4,
    drinkMoveSpeedMultiplier: 0.35,
    upgradeLevel: 1,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxCrimsonFlasks', label: 'Max Crimson Flask Charges', type: 'number', min: 1, max: 15, step: 1, default: 5 },
    { key: 'crimsonHealAmount', label: 'Crimson Heal Amount (HP)', type: 'number', min: 20, max: 200, step: 10, default: 60 },
    { key: 'drinkDuration', label: 'Drinking Animation Delay (s)', type: 'number', min: 0.5, max: 3.0, step: 0.1, default: 1.4 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 26: Bloodstain & Lost Souls Recovery
// ─────────────────────────────────────────────────────────────────────────────
const bloodstainSoulsDescriptor: FeatureDescriptor<BloodstainSoulsConfig> = {
  id: 'bloodstain_souls',
  name: 'Bloodstain & Lost Souls',
  category: 'souls',
  icon: '🩸',
  description: 'On death, drop all unspent souls into a glowing beacon. Retrieve on next life or lose permanently upon a second death.',
  tags: ['bloodstain', 'souls', 'death', 'recovery', 'runes', 'hardcore'],
  defaultConfig: {
    enabled: true,
    pickupRadius: 2.2,
    beaconVfxColor: '#00f0ff',
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'pickupRadius', label: 'Bloodstain Pickup Radius (m)', type: 'number', min: 1.0, max: 5.0, step: 0.2, default: 2.2 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 27: Posture Break & Visceral Deathblows
// ─────────────────────────────────────────────────────────────────────────────
const postureVisceralDescriptor: FeatureDescriptor<PostureVisceralConfig> = {
  id: 'posture_visceral',
  name: 'Posture & Visceral Deathblows',
  category: 'souls',
  icon: '🔴',
  description: 'Sekiro-style posture/stance meter, posture damage on parries/heavy attacks, red deathblow trigger, and invincible visceral executions (4.0x Crit).',
  tags: ['posture', 'visceral', 'deathblow', 'sekiro', 'parry', 'execution'],
  defaultConfig: {
    enabled: true,
    maxPosture: 100,
    postureDecayDelay: 3.0,
    postureDecayRate: 15.0,
    parryPostureDamage: 40.0,
    heavyAttackPostureDamage: 30.0,
    visceralDamageMultiplier: 4.0,
    visceralRange: 2.4,
    vulnerableDuration: 4.0,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxPosture', label: 'Max Posture Stance', type: 'number', min: 50, max: 300, step: 10, default: 100 },
    { key: 'parryPostureDamage', label: 'Parry Posture Damage', type: 'number', min: 10, max: 100, step: 5, default: 40.0 },
    { key: 'visceralDamageMultiplier', label: 'Visceral Deathblow Multiplier', type: 'number', min: 2.0, max: 8.0, step: 0.5, default: 4.0 },
    { key: 'vulnerableDuration', label: 'Posture Break Vulnerable Time (s)', type: 'number', min: 1.5, max: 8.0, step: 0.5, default: 4.0 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 28: Two-Axis Anime Combat State Machine & Ki Meter
// ─────────────────────────────────────────────────────────────────────────────
const twoAxisCombatDescriptor: FeatureDescriptor<TwoAxisCombatConfig> = {
  id: 'two_axis_combat',
  name: 'Two-Axis Anime Combat & Ki',
  category: 'combat',
  icon: '🥋',
  description: 'Two-axis state machine (Movement Mode x Action), Ki energy charging/draining, frame-phase cancel windows (Startup -> Active -> Recovery), and hitstop freeze.',
  tags: ['anime', 'fsm', 'ki', 'combat', 'cancel', 'hitstop', 'shonen'],
  defaultConfig: {
    enabled: true,
    maxKi: 100,
    kiChargeRate: 35.0,
    beamCostPerSec: 25.0,
    teleportCost: 20.0,
    hitStopDuration: 0.08,
    enableCancelWindows: true,
    enableDirectionalMelee: true,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxKi', label: 'Max Ki Reserve', type: 'number', min: 50, max: 500, step: 10, default: 100 },
    { key: 'kiChargeRate', label: 'Ki Charge Rate / sec', type: 'number', min: 10, max: 100, step: 5, default: 35.0 },
    { key: 'hitStopDuration', label: 'Hit-Stop Freeze Duration (s)', type: 'number', min: 0.02, max: 0.2, step: 0.01, default: 0.08 },
    { key: 'enableCancelWindows', label: 'Enable Frame-Phase Cancel Windows', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 29: Battle Royale Shrinking Storm Zone
// ─────────────────────────────────────────────────────────────────────────────
const shrinkingStormDescriptor: FeatureDescriptor<ShrinkingStormConfig> = {
  id: 'shrinking_storm',
  name: 'Battle Royale Shrinking Storm',
  category: 'encounter',
  icon: '⚡',
  description: 'Multi-phase contracting safe zone circle, 3D cylindrical barrier visualizer, center-point shifting, and periodic out-of-zone damage ticks.',
  tags: ['storm', 'battle_royale', 'zone', 'damage', 'ring', 'safe_zone'],
  defaultConfig: {
    enabled: true,
    initialRadius: 200.0,
    minRadius: 15.0,
    tickInterval: 1.0,
    barrierColor: '#7c3aed',
    barrierHeight: 80.0,
    enableVisualBarrier: true,
    phases: [
      { phase: 1, waitDuration: 30, shrinkDuration: 25, targetRadius: 120, damagePerSec: 2, centerShiftMaxDistance: 20 },
      { phase: 2, waitDuration: 25, shrinkDuration: 20, targetRadius: 70, damagePerSec: 5, centerShiftMaxDistance: 15 },
      { phase: 3, waitDuration: 20, shrinkDuration: 15, targetRadius: 35, damagePerSec: 10, centerShiftMaxDistance: 10 },
      { phase: 4, waitDuration: 15, shrinkDuration: 15, targetRadius: 15, damagePerSec: 20, centerShiftMaxDistance: 5 },
    ],
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'initialRadius', label: 'Initial Ring Radius (m)', type: 'number', min: 50, max: 1000, step: 25, default: 200.0 },
    { key: 'barrierColor', label: 'Barrier Ring Color', type: 'color', default: '#7c3aed' },
    { key: 'enableVisualBarrier', label: 'Render 3D Visual Barrier Wall', type: 'boolean', default: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 30: 3D Superhero Flight Traversal System
// ─────────────────────────────────────────────────────────────────────────────
const superheroFlightDescriptor: FeatureDescriptor<SuperheroFlightConfig> = {
  id: 'superhero_flight_system',
  name: '3D Superhero Flight Traversal',
  category: 'traversal',
  icon: '🦸',
  description: '6-DOF Superhero flight motor with omnidirectional hover moves, high-speed cruise banking, 4-way aerial dodges, and impact superhero landings.',
  tags: ['flight', 'superhero', 'hover', 'dodge', 'aerial', 'traversal'],
  defaultConfig: {
    enabled: true,
    hoverSpeed: 8.0,
    fastSpeed: 22.0,
    boostSpeed: 38.0,
    verticalSpeed: 12.0,
    dodgeSpeed: 32.0,
    dodgeDuration: 0.32,
    landingThresholdSpeed: 14.0,
    landingFreezeDuration: 0.65,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'hoverSpeed', label: 'Hover Speed (m/s)', type: 'number', min: 2, max: 20, step: 1, default: 8.0 },
    { key: 'fastSpeed', label: 'Cruise Flight Speed (m/s)', type: 'number', min: 10, max: 60, step: 2, default: 22.0 },
    { key: 'boostSpeed', label: 'Hyperflight Boost Speed (m/s)', type: 'number', min: 20, max: 100, step: 5, default: 38.0 },
    { key: 'dodgeSpeed', label: 'Aerial Dodge Speed (m/s)', type: 'number', min: 15, max: 80, step: 2, default: 32.0 },
  ],
};

const deformableGroundDescriptor: FeatureDescriptor<DeformableGroundConfig> = {
  id: 'deformable_ground',
  name: 'Deformable Ground & Craters',
  category: 'encounter',
  icon: '💥',
  description: 'Real-time ground and terrain vertex displacement depression on heavy impact slams, superhero landings, and meteor strikes with raised rim lips.',
  tags: ['ground', 'deformation', 'craters', 'destruction', 'impact', 'terrain'],
  defaultConfig: {
    enabled: true,
    maxDepth: 6.0,
    defaultRadius: 3.5,
    defaultDepth: 1.2,
    defaultLipHeight: 0.35,
    normalRecalcThreshold: 0.1,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'maxDepth', label: 'Max Dent Depth (m)', type: 'number', min: 1, max: 20, step: 0.5, default: 6.0 },
    { key: 'defaultRadius', label: 'Default Crater Radius (m)', type: 'number', min: 1, max: 15, step: 0.5, default: 3.5 },
    { key: 'defaultDepth', label: 'Default Crater Depth (m)', type: 'number', min: 0.2, max: 5.0, step: 0.1, default: 1.2 },
    { key: 'defaultLipHeight', label: 'Raised Outer Rim Lip (m)', type: 'number', min: 0, max: 2.0, step: 0.05, default: 0.35 },
  ],
};

const animeCombatDirectorDescriptor: FeatureDescriptor<AnimeCombatDirectorConfig> = {
  id: 'anime_combat_director',
  name: 'Anime Combat Director & Presentation',
  category: 'combat',
  icon: '🎬',
  description: 'Cinematic anime presentation coordinator: high-contrast inverted impact frames, coordinated hit-stop timescale dips, camera FOV punches, and inverted hull ink outlines.',
  tags: ['anime', 'director', 'impact_frames', 'hitstop', 'camera_punch', 'outline'],
  defaultConfig: {
    enabled: true,
    hitStopDefaultScale: 0.08,
    hitStopMaxDuration: 0.25,
    impactFrameEnabled: true,
    defaultOutlineThickness: 0.025,
    defaultOutlineColor: 0x0a0a0a,
    cameraPunchMultiplier: 1.0,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'hitStopDefaultScale', label: 'Hit-Stop TimeScale Factor', type: 'number', min: 0.01, max: 0.5, step: 0.01, default: 0.08 },
    { key: 'impactFrameEnabled', label: 'Enable Inverted Impact Frames', type: 'boolean', default: true },
    { key: 'defaultOutlineThickness', label: 'Inverted Hull Outline Thickness', type: 'number', min: 0.005, max: 0.1, step: 0.005, default: 0.025 },
  ],
};

const proceduralCityDescriptor: FeatureDescriptor<any> = {
  id: 'procedural_city_generator',
  name: 'Procedural City & Map Builder',
  category: 'general',
  icon: '🏙️',
  description: 'Procedural road networks, district zoning, modular buildings, bridges, street furniture, foliage, and GTA V blueprint map layouts.',
  tags: ['city', 'pcg', 'roads', 'buildings', 'zoning', 'gta', 'props', 'foliage'],
  defaultConfig: {
    enabled: true,
    worldSize: 500,
    roadAlgorithm: 'Grid',
    roadDensity: 0.65,
    enableSidewalks: true,
    enableLaneMarkings: true,
    enableBuildings: true,
    enableStreetProps: true,
    enableVegetation: true,
    enableBridges: true,
  },
  properties: [
    { key: 'enabled', label: 'Feature Enabled', type: 'boolean', default: true },
    { key: 'worldSize', label: 'World Size (Meters)', type: 'number', min: 100, max: 2000, step: 50, default: 500 },
    { key: 'roadDensity', label: 'Road Density Factor', type: 'number', min: 0.2, max: 1.0, step: 0.05, default: 0.65 },
    { key: 'enableSidewalks', label: 'Enable Sidewalks & Curbs', type: 'boolean', default: true },
    { key: 'enableBuildings', label: 'Populate Buildings', type: 'boolean', default: true },
  ],
};

// Register all feature descriptors into the registry
GameplayFeatureRegistry.register(targetLockDescriptor);
GameplayFeatureRegistry.register(timedHitboxDescriptor);
GameplayFeatureRegistry.register(comboDescriptor);
GameplayFeatureRegistry.register(dodgeGuardStaminaDescriptor);
GameplayFeatureRegistry.register(hitReactionDescriptor);
GameplayFeatureRegistry.register(abilityElementalDescriptor);
GameplayFeatureRegistry.register(encounterAIDescriptor);
GameplayFeatureRegistry.register(statsProgressionDescriptor);
GameplayFeatureRegistry.register(arenaWaveDescriptor);
GameplayFeatureRegistry.register(stealthDescriptor);
GameplayFeatureRegistry.register(parkourDescriptor);
GameplayFeatureRegistry.register(lootInventoryDescriptor);
GameplayFeatureRegistry.register(dialogueDescriptor);
GameplayFeatureRegistry.register(rangedShooterDescriptor);
GameplayFeatureRegistry.register(vehicleMountDescriptor);
GameplayFeatureRegistry.register(grappleHookDescriptor);
GameplayFeatureRegistry.register(timeMechanicsDescriptor);
GameplayFeatureRegistry.register(craftingGatheringDescriptor);
GameplayFeatureRegistry.register(companionSummonDescriptor);
GameplayFeatureRegistry.register(weaponLoadoutDescriptor);
GameplayFeatureRegistry.register(coverPeekingDescriptor);
GameplayFeatureRegistry.register(explosivesDescriptor);
GameplayFeatureRegistry.register(killstreakDescriptor);
GameplayFeatureRegistry.register(bonfireCheckpointDescriptor);
GameplayFeatureRegistry.register(estusFlaskDescriptor);
GameplayFeatureRegistry.register(bloodstainSoulsDescriptor);
GameplayFeatureRegistry.register(postureVisceralDescriptor);
GameplayFeatureRegistry.register(twoAxisCombatDescriptor);
GameplayFeatureRegistry.register(shrinkingStormDescriptor);
GameplayFeatureRegistry.register(superheroFlightDescriptor);
GameplayFeatureRegistry.register(deformableGroundDescriptor);
GameplayFeatureRegistry.register(animeCombatDirectorDescriptor);
// ── GTA & Open World City Descriptors ────────────────────────────────────────

const trafficSimulationDescriptor: FeatureDescriptor<TrafficSimulationConfig> = {
  id: 'traffic_simulation',
  name: 'Traffic Simulation & Routes',
  category: 'city',
  icon: '🚗',
  description: 'Multi-lane procedural traffic vehicle simulation with distance-based spawning, recycling, and hijacking support.',
  tags: ['traffic', 'vehicles', 'city', 'simulation'],
  defaultConfig: {
    enabled: true,
    maxCars: 16,
    spawnRangeMin: 35,
    despawnRange: 160,
    minSpeed: 8,
    maxSpeed: 16,
    visibleRange: 120,
    laneOffset: 4.0,
    modelAssetIds: ['car_sedan', 'car_suv', 'car_truck'],
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'maxCars', label: 'Max Active Cars', type: 'number', min: 1, max: 64, step: 1, default: 16 },
    { key: 'spawnRangeMin', label: 'Min Spawn Distance (m)', type: 'number', min: 10, max: 100, step: 5, default: 35 },
    { key: 'despawnRange', label: 'Despawn Range (m)', type: 'number', min: 50, max: 400, step: 10, default: 160 },
    { key: 'minSpeed', label: 'Min Speed (m/s)', type: 'number', min: 2, max: 30, step: 1, default: 8 },
    { key: 'maxSpeed', label: 'Max Speed (m/s)', type: 'number', min: 5, max: 50, step: 1, default: 16 },
    { key: 'laneOffset', label: 'Lane Offset (m)', type: 'number', min: 1, max: 10, step: 0.5, default: 4.0 },
  ],
  presets: {
    dense_city: { maxCars: 28, despawnRange: 200, minSpeed: 6, maxSpeed: 14 },
    highway: { maxCars: 18, despawnRange: 260, minSpeed: 18, maxSpeed: 32 },
  },
};

const civilianPopulationDescriptor: FeatureDescriptor<CivilianPopulationConfig> = {
  id: 'civilian_population',
  name: 'Civilian Population & Reactions',
  category: 'city',
  icon: '🚶',
  description: 'Walking pedestrians, civilian drivers, dynamic gunfire panic reactions, damage handling, and driver ejection.',
  tags: ['civilians', 'pedestrians', 'ai', 'city', 'panic'],
  defaultConfig: {
    enabled: true,
    maxWalkers: 12,
    maxDrivers: 4,
    spawnRangeMin: 20,
    despawnRange: 140,
    walkerSpeed: 2.2,
    panicSpeed: 5.2,
    health: 100,
    panicRadius: 60,
    modelAssetIds: ['civ_walker_1', 'civ_walker_2'],
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'maxWalkers', label: 'Max Pedestrians', type: 'number', min: 1, max: 40, step: 1, default: 12 },
    { key: 'maxDrivers', label: 'Max Drivers', type: 'number', min: 0, max: 16, step: 1, default: 4 },
    { key: 'walkerSpeed', label: 'Walk Speed (m/s)', type: 'number', min: 0.5, max: 6, step: 0.2, default: 2.2 },
    { key: 'panicSpeed', label: 'Panic Speed (m/s)', type: 'number', min: 2, max: 12, step: 0.5, default: 5.2 },
    { key: 'panicRadius', label: 'Gunfire Perception Radius (m)', type: 'number', min: 10, max: 200, step: 5, default: 60 },
  ],
  presets: {
    busy_sidewalks: { maxWalkers: 24, maxDrivers: 6, panicRadius: 80 },
    calm_suburb: { maxWalkers: 6, maxDrivers: 2, panicRadius: 40 },
  },
};

const wantedCrimeDescriptor: FeatureDescriptor<WantedCrimeConfig> = {
  id: 'wanted_crime',
  name: 'Wanted Level & Crime Law',
  category: 'law',
  icon: '⭐',
  description: 'Heat accumulation, crime types, wanted level (0-5 stars), pursuit tracking, and foot/vehicle decay rules.',
  tags: ['wanted', 'crime', 'law', 'heat', 'police'],
  defaultConfig: {
    enabled: true,
    maxWantedLevel: 5,
    cooldownAfterCrimeSec: 12.0,
    decayWindowFootSec: 20.0,
    decayWindowVehicleSec: 35.0,
    crimeThresholds: {
      shooting_in_public: 20,
      vehicle_theft: 40,
      assault: 45,
      hit_and_run: 60,
      resisting_arrest: 80,
      homicide: 100,
    },
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'maxWantedLevel', label: 'Max Wanted Level (Stars)', type: 'number', min: 1, max: 6, step: 1, default: 5 },
    { key: 'cooldownAfterCrimeSec', label: 'Crime Cooldown (s)', type: 'number', min: 2, max: 60, step: 1, default: 12.0 },
    { key: 'decayWindowFootSec', label: 'Foot Decay Window (s)', type: 'number', min: 5, max: 90, step: 1, default: 20.0 },
    { key: 'decayWindowVehicleSec', label: 'Vehicle Decay Window (s)', type: 'number', min: 10, max: 120, step: 2, default: 35.0 },
  ],
  presets: {
    arcade_forgiving: { cooldownAfterCrimeSec: 6.0, decayWindowFootSec: 12.0, decayWindowVehicleSec: 20.0 },
    hardcore_pursuit: { cooldownAfterCrimeSec: 25.0, decayWindowFootSec: 40.0, decayWindowVehicleSec: 65.0 },
  },
};

const policeResponseDescriptor: FeatureDescriptor<PoliceResponseConfig> = {
  id: 'police_response',
  name: 'Police Response & Pursuit',
  category: 'law',
  icon: '🚓',
  description: 'Scalable police response squads, cruisers + officers on foot, transitions, combat shooting, and arrest mechanics.',
  tags: ['police', 'pursuit', 'law', 'combat', 'arrest'],
  defaultConfig: {
    enabled: true,
    maxUnits: 10,
    basePatrolUnits: 2,
    unitsPerWantedLevel: 1,
    officerSpeed: 4.8,
    cruiserSpeed: 18.0,
    arrestDistance: 2.5,
    shootDistance: 22.0,
    shootInterval: 0.8,
    officerModelAssetId: 'police_officer',
    cruiserModelAssetId: 'police_cruiser',
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'maxUnits', label: 'Max Police Units', type: 'number', min: 2, max: 32, step: 1, default: 10 },
    { key: 'basePatrolUnits', label: 'Base Patrol Count', type: 'number', min: 0, max: 8, step: 1, default: 2 },
    { key: 'cruiserSpeed', label: 'Cruiser Pursuit Speed (m/s)', type: 'number', min: 10, max: 45, step: 1, default: 18.0 },
    { key: 'officerSpeed', label: 'Officer Foot Speed (m/s)', type: 'number', min: 2, max: 10, step: 0.2, default: 4.8 },
    { key: 'arrestDistance', label: 'Bust Arrest Radius (m)', type: 'number', min: 1, max: 8, step: 0.5, default: 2.5 },
  ],
  presets: {
    aggressive_swat: { maxUnits: 16, cruiserSpeed: 24.0, shootInterval: 0.5 },
    standard_city: { maxUnits: 10, cruiserSpeed: 18.0, shootInterval: 0.8 },
  },
};

const vehicleTheftDescriptor: FeatureDescriptor<VehicleTheftConfig> = {
  id: 'vehicle_theft',
  name: 'Vehicle Theft & Carjacking',
  category: 'vehicles',
  icon: '🔑',
  description: 'Carjacking interaction with occupied vehicle detection, physical driver ejection impulse, and crime escalation.',
  tags: ['theft', 'carjacking', 'vehicles', 'crime'],
  defaultConfig: {
    enabled: true,
    theftRange: 4.5,
    ejectionImpulse: 8.0,
    stolenCarWantedEscalation: 1,
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'theftRange', label: 'Carjack Reach Radius (m)', type: 'number', min: 1, max: 10, step: 0.5, default: 4.5 },
    { key: 'ejectionImpulse', label: 'Driver Ejection Impulse', type: 'number', min: 2, max: 20, step: 1, default: 8.0 },
  ],
};

const escortMissionDescriptor: FeatureDescriptor<EscortMissionConfig> = {
  id: 'escort_missions',
  name: 'Escort & Passenger Missions',
  category: 'encounter',
  icon: '👥',
  description: 'Companion recruitment, formation slot offsets, seamless vehicle boarding/exiting, catchup recovery, and delivery checks.',
  tags: ['escort', 'passenger', 'companion', 'mission'],
  defaultConfig: {
    enabled: true,
    interactRange: 6.0,
    followWalkSpeed: 3.5,
    followRunSpeed: 6.5,
    catchupSpeed: 9.0,
    teleportDistance: 45.0,
    deliveryRadius: 8.0,
    maxFollowers: 3,
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'interactRange', label: 'Recruitment Range (m)', type: 'number', min: 2, max: 15, step: 0.5, default: 6.0 },
    { key: 'followWalkSpeed', label: 'Follow Walk Speed (m/s)', type: 'number', min: 1, max: 8, step: 0.5, default: 3.5 },
    { key: 'deliveryRadius', label: 'Objective Delivery Radius (m)', type: 'number', min: 2, max: 25, step: 1, default: 8.0 },
  ],
};

const minimapRadarDescriptor: FeatureDescriptor<MinimapRadarConfig> = {
  id: 'minimap_radar',
  name: 'Minimap & Radar Tracking',
  category: 'general',
  icon: '🗺️',
  description: 'Generic 2D radar blip tracker with dynamic zoom, player/camera yaw rotation, compass cardinals, and edge clamping.',
  tags: ['minimap', 'radar', 'hud', 'navigation'],
  defaultConfig: {
    enabled: true,
    radius: 100,
    zoom: 1.0,
    rotateWithPlayer: true,
    showCardinals: true,
    showBorder: true,
    radarColor: '#00f0ff',
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'radius', label: 'Radar Radius (px)', type: 'number', min: 40, max: 200, step: 5, default: 100 },
    { key: 'zoom', label: 'Zoom Multiplier', type: 'number', min: 0.1, max: 3.0, step: 0.05, default: 1.0 },
    { key: 'rotateWithPlayer', label: 'Rotate with Player', type: 'boolean', default: true },
  ],
};

const spaceshipFlightDescriptor: FeatureDescriptor<SpaceshipFlightConfig> = {
  id: 'spaceship_flight',
  name: 'Spaceship Flight & Evasion',
  category: 'vehicles',
  icon: '🚀',
  description: '6-DOF spaceship flight dynamics with turbo boost, vertical thrusters, banking, barrel rolls, and chase/cockpit cameras.',
  tags: ['spaceship', 'flight', 'boost', 'barrelroll', 'vehicles'],
  defaultConfig: {
    enabled: true,
    maxSpeed: 80,
    turboSpeed: 180,
    accel: 35,
    brake: 50,
    drag: 10,
    verticalSpeed: 30,
    turnRate: 1.4,
    pitchRate: 1.0,
    rollRate: 1.8,
    bankMax: 0.45,
    barrelRollDuration: 0.72,
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'maxSpeed', label: 'Max Speed (m/s)', type: 'number', min: 20, max: 300, step: 5, default: 80 },
    { key: 'turboSpeed', label: 'Turbo Speed (m/s)', type: 'number', min: 50, max: 600, step: 10, default: 180 },
    { key: 'accel', label: 'Acceleration', type: 'number', min: 10, max: 120, step: 5, default: 35 },
    { key: 'barrelRollDuration', label: 'Barrel Roll Duration (s)', type: 'number', min: 0.3, max: 2.0, step: 0.05, default: 0.72 },
  ],
};

// ── Phone & Social Architecture Descriptors ─────────────────────────────────

const phoneShellDescriptor: FeatureDescriptor<PhoneShellConfig> = {
  id: 'phone_shell',
  name: 'Smartphone Shell & Apps',
  category: 'social',
  icon: '📱',
  description: 'In-game smartphone overlay with open/close actions, extensible app registration, badge indicators, and input trapping.',
  tags: ['phone', 'ui', 'social', 'apps'],
  defaultConfig: {
    enabled: true,
    openKey: 'KeyP',
    allowWhileDriving: true,
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'openKey', label: 'Open Key Binding', type: 'string', default: 'KeyP' },
    { key: 'allowWhileDriving', label: 'Allow in Vehicles', type: 'boolean', default: true },
  ],
};

const phoneMessagingDescriptor: FeatureDescriptor<PhoneMessagingConfig> = {
  id: 'phone_messaging',
  name: 'Phone Messaging & Texting',
  category: 'social',
  icon: '💬',
  description: 'Data-driven conversation trees with branching choices, simulated delayed contact replies, and full save/load persistence.',
  tags: ['messages', 'sms', 'social', 'dialogue', 'persistence'],
  defaultConfig: {
    enabled: true,
    contacts: [],
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
};

const socialEncounterDescriptor: FeatureDescriptor<SocialEncounterConfig> = {
  id: 'social_encounter',
  name: 'Social Encounters & Dates',
  category: 'social',
  icon: '☕',
  description: 'Data-driven dates, hangout meetings, multi-activity progression, success/failure conditions, and follow-up visit invitations.',
  tags: ['dating', 'hangouts', 'social', 'activities', 'encounters'],
  defaultConfig: {
    enabled: true,
    templates: [],
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
};

const locationVisitDescriptor: FeatureDescriptor<LocationVisitConfig> = {
  id: 'location_visits',
  name: 'Location & Home Visits',
  category: 'social',
  icon: '🏠',
  description: 'Optional post-encounter visit invitations with accept/decline, destination waypoints, arrival detection, and completion hooks.',
  tags: ['visits', 'homes', 'social', 'destinations'],
  defaultConfig: {
    enabled: true,
    templates: [],
  },
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
};

const zombieHordeAIDescriptor: FeatureDescriptor<ZombieHordeConfig> = {
  id: 'zombie_horde_ai',
  name: 'Zombie Horde AI System',
  category: 'ai',
  icon: '🧟',
  description: 'Multi-archetype zombie horde behaviors, sight & gunfire noise perception, 360-degree surrounding flocking, dismemberment/crawlers, spitters, and wave survival rounds.',
  tags: ['zombies', 'horde', 'infected', 'ai', 'survival', 'horror', 'waves', 'flocking'],
  defaultConfig: DEFAULT_ZOMBIE_HORDE_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { label: 'Waves', value: 'waves' },
        { label: 'Open World', value: 'open_world_wandering' },
        { label: 'Dormant Ambush', value: 'dormant_ambush' },
      ],
      default: 'waves',
    },
    { key: 'maxActiveZombies', label: 'Max Active Zombies', type: 'number', min: 1, max: 200, step: 1, default: 40 },
    { key: 'spawnDistanceMin', label: 'Min Spawn Distance', type: 'number', min: 2, max: 50, step: 1, default: 12.0 },
    { key: 'spawnDistanceMax', label: 'Max Spawn Distance', type: 'number', min: 10, max: 150, step: 1, default: 35.0 },
    { key: 'hearingSensitivity', label: 'Hearing Sensitivity', type: 'number', min: 0, max: 5, step: 0.1, default: 1.0 },
    { key: 'screechAlertRadius', label: 'Screech Alert Radius', type: 'number', min: 5, max: 100, step: 1, default: 25.0 },
    { key: 'enableSurroundBehavior', label: '360° Surround Flocking', type: 'boolean', default: true },
    { key: 'surroundSlotsCount', label: 'Surround Slots Count', type: 'number', min: 4, max: 16, step: 1, default: 8 },
    { key: 'surroundDistance', label: 'Surround Distance', type: 'number', min: 1, max: 10, step: 0.5, default: 2.5 },
    { key: 'headshotInstakillThreshold', label: 'Headshot Instakill Threshold', type: 'number', min: 10, max: 500, step: 5, default: 50 },
    { key: 'legDismemberHealthPercent', label: 'Leg Dismember Health %', type: 'number', min: 0.05, max: 0.8, step: 0.05, default: 0.35 },
  ],
  presets: {
    slow_shamblers: {
      mode: 'open_world_wandering',
      hearingSensitivity: 1.2,
      enableSurroundBehavior: true,
      headshotInstakillThreshold: 35,
    },
    fast_frenzy: {
      mode: 'waves',
      hearingSensitivity: 2.0,
      screechAlertRadius: 40.0,
    },
    special_infected: {
      mode: 'waves',
      maxActiveZombies: 50,
    },
    night_outbreak: {
      mode: 'waves',
      hearingSensitivity: 2.5,
      spawnDistanceMin: 8.0,
      spawnDistanceMax: 25.0,
    },
    hardcore_survival: {
      mode: 'waves',
      maxActiveZombies: 65,
      headshotInstakillThreshold: 80,
    },
  },
};

const barricadeBoardingDescriptor: FeatureDescriptor<BarricadeConfig> = {
  id: 'barricade_boarding',
  name: 'Barricade Boarding & Defense',
  category: 'defense',
  icon: '🪵',
  description: 'Repairable window barricades with plank tearing AI, player hold-to-repair interaction, and upgradeable reinforcement tiers.',
  tags: ['barricade', 'planks', 'defense', 'repair', 'windows', 'zombie'],
  defaultConfig: DEFAULT_BARRICADE_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'repairHoldDurationSec', label: 'Repair Duration (s)', type: 'number', min: 0.1, max: 3.0, step: 0.1, default: 0.75 },
    { key: 'pointsPerPlank', label: 'Points Per Plank', type: 'number', min: 0, max: 100, step: 5, default: 10 },
  ],
  presets: {
    quick_repair: {
      repairHoldDurationSec: 0.3,
      pointsPerPlank: 20,
    },
    hardcore_defense: {
      repairHoldDurationSec: 1.5,
      pointsPerPlank: 5,
    },
  },
};

const mysteryBoxDescriptor: FeatureDescriptor<MysteryBoxConfig> = {
  id: 'mystery_box_gambling',
  name: 'Mystery Box Magic Chest',
  category: 'progression',
  icon: '🎁',
  description: 'Random weapon roulette crate with sky light beam, weighted weapon catalog, timeout grab window, and teddy bear relocation.',
  tags: ['mystery_box', 'gambling', 'weapons', 'loot', 'magic_chest', 'wonder_weapon'],
  defaultConfig: DEFAULT_MYSTERY_BOX_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'spinCost', label: 'Spin Cost (pts)', type: 'number', min: 10, max: 5000, step: 50, default: 950 },
    { key: 'spinDurationSec', label: 'Spin Duration (s)', type: 'number', min: 1, max: 10, step: 0.5, default: 3.5 },
    { key: 'grabTimeoutSec', label: 'Grab Timeout (s)', type: 'number', min: 2, max: 30, step: 1, default: 10.0 },
    { key: 'teddyBearRollChance', label: 'Teddy Bear Relocation Chance', type: 'number', min: 0, max: 1, step: 0.01, default: 0.12 },
  ],
  presets: {
    cheap_spins: {
      spinCost: 500,
      teddyBearRollChance: 0.05,
    },
    high_stakes: {
      spinCost: 1500,
      teddyBearRollChance: 0.25,
    },
  },
};

const perkVendingDescriptor: FeatureDescriptor<PerkVendingConfig> = {
  id: 'perk_vending_machines',
  name: 'Perk Vending Machines',
  category: 'progression',
  icon: '🥤',
  description: 'Drinkable perk machines granting Juggernog (+HP), Speed Cola (fast reload), Quick Revive (self-revive), Double Tap (fire rate), Stamin-Up (sprint), and Deadshot (headshots).',
  tags: ['perks', 'vending', 'buffs', 'juggernog', 'speed_cola', 'powerup'],
  defaultConfig: DEFAULT_PERK_VENDING_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'maxPerksPerPlayer', label: 'Max Perks Per Player', type: 'number', min: 1, max: 7, step: 1, default: 4 },
    { key: 'drinkDurationSec', label: 'Drinking Animation Duration (s)', type: 'number', min: 0.5, max: 4.0, step: 0.25, default: 1.5 },
  ],
  presets: {
    classic_four: {
      maxPerksPerPlayer: 4,
    },
    all_perk_godmode: {
      maxPerksPerPlayer: 7,
    },
  },
};

const packAPunchDescriptor: FeatureDescriptor<PackAPunchConfig> = {
  id: 'pack_a_punch_upgrade',
  name: 'Pack-A-Punch Weapon Upgrade & AAT',
  category: 'progression',
  icon: '⚡',
  description: 'Weapon upgrading station with damage multipliers, increased capacity, and Alternate Ammo Types (Blast Furnace, Dead Wire, Cryo Freeze, Brain Rot).',
  tags: ['pack_a_punch', 'weapon_upgrade', 'aat', 'elemental_ammo', 'damage_boost'],
  defaultConfig: DEFAULT_PACK_A_PUNCH_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'upgradeCostTier1', label: 'Tier 1 Upgrade Cost', type: 'number', min: 1000, max: 10000, step: 500, default: 5000 },
    { key: 'upgradeCostTier2', label: 'Tier 2 Upgrade Cost', type: 'number', min: 5000, max: 25000, step: 1000, default: 15000 },
    { key: 'upgradeCostTier3', label: 'Tier 3 Upgrade Cost', type: 'number', min: 10000, max: 50000, step: 2500, default: 30000 },
    { key: 'aatCost', label: 'AAT Elemental Mod Cost', type: 'number', min: 500, max: 5000, step: 250, default: 2000 },
  ],
  presets: {
    arcade_cheap: {
      upgradeCostTier1: 2500,
      upgradeCostTier2: 7500,
      upgradeCostTier3: 15000,
    },
  },
};

const infectionImmunityDescriptor: FeatureDescriptor<InfectionConfig> = {
  id: 'infection_immunity_meter',
  name: 'Infection & Immunity Meter',
  category: 'survival',
  icon: '☣️',
  description: 'Player viral infection gauge that accumulates from bites and acid, causing progressive symptoms, critical health drain, and antidote treatments.',
  tags: ['infection', 'virus', 'immunity', 'antidote', 'survival', 'horror'],
  defaultConfig: DEFAULT_INFECTION_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'biteInfectionAmount', label: 'Bite Infection %', type: 'number', min: 1, max: 50, step: 1, default: 15 },
    { key: 'acidInfectionRatePerSec', label: 'Acid Infection / Sec', type: 'number', min: 5, max: 50, step: 1, default: 20 },
    { key: 'passiveDecayRatePerSec', label: 'Passive Recovery / Sec', type: 'number', min: 0, max: 5, step: 0.1, default: 0.5 },
    { key: 'tickDamageCritical', label: 'Critical Tick Damage', type: 'number', min: 1, max: 20, step: 1, default: 5 },
  ],
  presets: {
    hardcore_biohazard: {
      biteInfectionAmount: 30,
      passiveDecayRatePerSec: 0,
      tickDamageCritical: 10,
    },
    casual_immunity: {
      biteInfectionAmount: 5,
      passiveDecayRatePerSec: 2.0,
    },
  },
};

const powerGridDoorsDescriptor: FeatureDescriptor<PowerGridConfig> = {
  id: 'power_grid_doors',
  name: 'Power Grid, Doors & Perimeter Traps',
  category: 'defense',
  icon: '🔌',
  description: 'Master power switch, point-unlockable debris and doors, plus interactive electric gate and flame jet perimeter traps.',
  tags: ['power_grid', 'electricity', 'doors', 'traps', 'electric_gate', 'fire_trap'],
  defaultConfig: DEFAULT_POWER_GRID_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'requiresPowerForPerks', label: 'Requires Power for Perks', type: 'boolean', default: true },
    { key: 'requiresPowerForTraps', label: 'Requires Power for Traps', type: 'boolean', default: true },
  ],
  presets: {
    free_power: {
      requiresPowerForPerks: false,
      requiresPowerForTraps: false,
    },
  },
};

const zombiePowerupsDescriptor: FeatureDescriptor<ZombiePowerupsConfig> = {
  id: 'zombie_powerups_drops',
  name: 'Zombie Power-Up Drops',
  category: 'combat',
  icon: '💣',
  description: 'Random glowing floating drop powerups: Insta-Kill, Nuke, Max Ammo, Carpenter, Double Points, and Fire Sale.',
  tags: ['powerups', 'nuke', 'insta_kill', 'max_ammo', 'carpenter', 'double_points', 'fire_sale'],
  defaultConfig: DEFAULT_ZOMBIE_POWERUPS_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'dropChanceOnKill', label: 'Drop Chance On Kill', type: 'number', min: 0.01, max: 0.5, step: 0.01, default: 0.06 },
    { key: 'powerupDurationSec', label: 'Buff Duration (s)', type: 'number', min: 5, max: 60, step: 5, default: 30.0 },
    { key: 'floatDurationSec', label: 'Drop Lifespan (s)', type: 'number', min: 5, max: 60, step: 5, default: 25.0 },
  ],
  presets: {
    frequent_drops: {
      dropChanceOnKill: 0.15,
      powerupDurationSec: 45.0,
    },
    famine_scarcity: {
      dropChanceOnKill: 0.02,
      powerupDurationSec: 20.0,
    },
  },
};

// ── Feature Registration ────────────────────────────────────────────────────
GameplayFeatureRegistry.register(targetLockDescriptor);
GameplayFeatureRegistry.register(timedHitboxDescriptor);
GameplayFeatureRegistry.register(comboDescriptor);
GameplayFeatureRegistry.register(dodgeGuardStaminaDescriptor);
GameplayFeatureRegistry.register(hitReactionDescriptor);
GameplayFeatureRegistry.register(abilityElementalDescriptor);
GameplayFeatureRegistry.register(encounterAIDescriptor);
GameplayFeatureRegistry.register(statsProgressionDescriptor);
GameplayFeatureRegistry.register(arenaWaveDescriptor);
GameplayFeatureRegistry.register(stealthDescriptor);
GameplayFeatureRegistry.register(parkourDescriptor);
GameplayFeatureRegistry.register(lootInventoryDescriptor);
GameplayFeatureRegistry.register(dialogueDescriptor);
GameplayFeatureRegistry.register(rangedShooterDescriptor);
GameplayFeatureRegistry.register(vehicleMountDescriptor);
GameplayFeatureRegistry.register(grappleHookDescriptor);
GameplayFeatureRegistry.register(timeMechanicsDescriptor);
GameplayFeatureRegistry.register(craftingGatheringDescriptor);
GameplayFeatureRegistry.register(companionSummonDescriptor);
GameplayFeatureRegistry.register(weaponLoadoutDescriptor);
GameplayFeatureRegistry.register(coverPeekingDescriptor);
GameplayFeatureRegistry.register(explosivesDescriptor);
GameplayFeatureRegistry.register(killstreakDescriptor);
GameplayFeatureRegistry.register(bonfireCheckpointDescriptor);
GameplayFeatureRegistry.register(estusFlaskDescriptor);
GameplayFeatureRegistry.register(bloodstainSoulsDescriptor);
GameplayFeatureRegistry.register(postureVisceralDescriptor);
GameplayFeatureRegistry.register(twoAxisCombatDescriptor);
GameplayFeatureRegistry.register(shrinkingStormDescriptor);
GameplayFeatureRegistry.register(superheroFlightDescriptor);
GameplayFeatureRegistry.register(deformableGroundDescriptor);
GameplayFeatureRegistry.register(animeCombatDirectorDescriptor);
GameplayFeatureRegistry.register(proceduralCityDescriptor);

// GTA & Open World Registrations
GameplayFeatureRegistry.register(trafficSimulationDescriptor);
GameplayFeatureRegistry.register(civilianPopulationDescriptor);
GameplayFeatureRegistry.register(wantedCrimeDescriptor);
GameplayFeatureRegistry.register(policeResponseDescriptor);
GameplayFeatureRegistry.register(vehicleTheftDescriptor);
GameplayFeatureRegistry.register(escortMissionDescriptor);
GameplayFeatureRegistry.register(minimapRadarDescriptor);
GameplayFeatureRegistry.register(spaceshipFlightDescriptor);

// Phone & Social Registrations
GameplayFeatureRegistry.register(phoneShellDescriptor);
GameplayFeatureRegistry.register(phoneMessagingDescriptor);
GameplayFeatureRegistry.register(socialEncounterDescriptor);
GameplayFeatureRegistry.register(locationVisitDescriptor);

const wonderWeaponsDescriptor: FeatureDescriptor<WonderWeaponsConfig> = {
  id: 'zombie_wonder_weapons',
  name: 'Zombie Wonder Weapons & Decoys',
  category: 'combat',
  icon: '⚡',
  description: 'Legendary exotic wonder weapons including Wunderwaffe DG-2 lightning cannon, Ray Gun Mark II, musical Monkey Bomb decoys, and Gersch Device black hole singularities.',
  tags: ['wonder_weapons', 'wunderwaffe', 'ray_gun', 'monkey_bomb', 'gersch_device', 'black_hole'],
  defaultConfig: DEFAULT_WONDER_WEAPONS_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'wunderwaffeChainCount', label: 'Wunderwaffe Chain Count', type: 'number', min: 1, max: 24, step: 1, default: 12 },
    { key: 'monkeyBombFuseSec', label: 'Monkey Bomb Fuse (s)', type: 'number', min: 2, max: 15, step: 1, default: 8.0 },
    { key: 'monkeyBombRadius', label: 'Monkey Bomb Radius', type: 'number', min: 4, max: 30, step: 1, default: 12.0 },
    { key: 'gerschDurationSec', label: 'Gersch Duration (s)', type: 'number', min: 2, max: 20, step: 1, default: 6.0 },
  ],
  presets: {
    overpowered_wonder: {
      wunderwaffeChainCount: 24,
      monkeyBombRadius: 20.0,
      gerschDurationSec: 10.0,
    },
  },
};

const zombieBossDescriptor: FeatureDescriptor<ZombieBossConfig> = {
  id: 'zombie_boss_encounters',
  name: 'Special Boss Infected Encounters',
  category: 'ai',
  icon: '👹',
  description: 'Formidable multi-phase boss infected including the armored Panzer Soldat, Bile Bloater, Crying Witch, and Nemesis Stalker.',
  tags: ['boss', 'panzer', 'bloater', 'witch', 'nemesis', 'infected'],
  defaultConfig: DEFAULT_ZOMBIE_BOSS_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'panzerHp', label: 'Panzer Soldat HP', type: 'number', min: 500, max: 10000, step: 100, default: 1800 },
    { key: 'bloaterHp', label: 'Bile Bloater HP', type: 'number', min: 200, max: 5000, step: 100, default: 900 },
    { key: 'witchHp', label: 'Crying Witch HP', type: 'number', min: 300, max: 5000, step: 100, default: 1200 },
    { key: 'nemesisHp', label: 'Nemesis Stalker HP', type: 'number', min: 500, max: 15000, step: 250, default: 2500 },
  ],
  presets: {
    nightmare_bosses: {
      panzerHp: 3500,
      nemesisHp: 5000,
    },
  },
};

const zombieBuildablesDescriptor: FeatureDescriptor<ZombieBuildablesConfig> = {
  id: 'zombie_craftable_traps',
  name: 'Zombie Craftable Buildables & Shields',
  category: 'crafting',
  icon: '🛡️',
  description: 'Scavenge parts and assemble deployables at workbenches: Zombie Riot Shield (block bites & bash), Turbine Generator, Sentry Turret, and Spikemores.',
  tags: ['buildables', 'riot_shield', 'turbine', 'sentry', 'spikemore', 'workbench'],
  defaultConfig: DEFAULT_ZOMBIE_BUILDABLES_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'shieldMaxDurability', label: 'Shield Max Durability', type: 'number', min: 100, max: 2000, step: 50, default: 500 },
    { key: 'turbineDurationSec', label: 'Turbine Duration (s)', type: 'number', min: 30, max: 300, step: 10, default: 120.0 },
    { key: 'sentryDamage', label: 'Sentry Bullet Damage', type: 'number', min: 10, max: 200, step: 5, default: 45 },
  ],
  presets: {
    durable_builds: {
      shieldMaxDurability: 1000,
      turbineDurationSec: 240.0,
    },
  },
};

const easterEggQuestDescriptor: FeatureDescriptor<EasterEggQuestConfig> = {
  id: 'zombie_easter_egg_quest',
  name: 'Easter Egg Quest Engine & Soul Boxes',
  category: 'narrative',
  icon: '🗿',
  description: 'Multi-step main quest progression with Soul Box charging, cipher puzzles, lockdown arena containment, and Perkaholic victory rewards.',
  tags: ['easter_egg', 'main_quest', 'soul_boxes', 'puzzle', 'lockdown', 'story'],
  defaultConfig: DEFAULT_EASTER_EGG_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'lockdownDurationSec', label: 'Lockdown Duration (s)', type: 'number', min: 10, max: 120, step: 5, default: 45.0 },
  ],
  presets: {
    speedrun_quest: {
      lockdownDurationSec: 20.0,
    },
  },
};

const gobbleGumDescriptor: FeatureDescriptor<GobbleGumConfig> = {
  id: 'zombie_gobs_elixirs',
  name: 'GobbleGum & Consumable Elixirs',
  category: 'progression',
  icon: '🍬',
  description: 'Chewable gum modifiers: Shopping Free (free buys for 60s), Perkaholic (all perks), In Plain Sight (stealth invisibility), Alchemical Antithesis, and Self Medication.',
  tags: ['gobblegum', 'elixirs', 'buffs', 'shopping_free', 'perkaholic', 'in_plain_sight'],
  defaultConfig: DEFAULT_GOBBLEGUM_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'shoppingFreeDurationSec', label: 'Shopping Free Duration (s)', type: 'number', min: 10, max: 120, step: 5, default: 60.0 },
    { key: 'inPlainSightDurationSec', label: 'In Plain Sight Duration (s)', type: 'number', min: 3, max: 30, step: 1, default: 10.0 },
  ],
  presets: {
    extended_gums: {
      shoppingFreeDurationSec: 90.0,
      inPlainSightDurationSec: 15.0,
    },
  },
};

const hellhoundsDescriptor: FeatureDescriptor<HellhoundsConfig> = {
  id: 'zombie_hellhounds_round',
  name: 'Hellhound Special Rounds',
  category: 'ai',
  icon: '🐕',
  description: 'Special atmospheric thunder/fog round spawning fast fiery hellhounds with death explosions and a guaranteed Max Ammo completion reward.',
  tags: ['hellhounds', 'dogs', 'special_round', 'max_ammo', 'fire'],
  defaultConfig: DEFAULT_HELLHOUNDS_CONFIG,
  properties: [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'roundInterval', label: 'Round Interval', type: 'number', min: 3, max: 10, step: 1, default: 5 },
    { key: 'dogsPerPlayer', label: 'Dogs Per Round', type: 'number', min: 2, max: 30, step: 1, default: 8 },
    { key: 'dogSpeed', label: 'Dog Sprint Speed', type: 'number', min: 4, max: 15, step: 0.5, default: 8.5 },
    { key: 'guaranteeMaxAmmo', label: 'Guarantee Max Ammo', type: 'boolean', default: true },
  ],
  presets: {
    frenzied_hounds: {
      dogsPerPlayer: 16,
      dogSpeed: 11.0,
    },
  },
};

// ── Feature Registration ────────────────────────────────────────────────────
GameplayFeatureRegistry.register(targetLockDescriptor);
GameplayFeatureRegistry.register(timedHitboxDescriptor);
GameplayFeatureRegistry.register(comboDescriptor);
GameplayFeatureRegistry.register(dodgeGuardStaminaDescriptor);
GameplayFeatureRegistry.register(hitReactionDescriptor);
GameplayFeatureRegistry.register(abilityElementalDescriptor);
GameplayFeatureRegistry.register(encounterAIDescriptor);
GameplayFeatureRegistry.register(statsProgressionDescriptor);
GameplayFeatureRegistry.register(arenaWaveDescriptor);
GameplayFeatureRegistry.register(stealthDescriptor);
GameplayFeatureRegistry.register(parkourDescriptor);
GameplayFeatureRegistry.register(lootInventoryDescriptor);
GameplayFeatureRegistry.register(dialogueDescriptor);
GameplayFeatureRegistry.register(rangedShooterDescriptor);
GameplayFeatureRegistry.register(vehicleMountDescriptor);
GameplayFeatureRegistry.register(grappleHookDescriptor);
GameplayFeatureRegistry.register(timeMechanicsDescriptor);
GameplayFeatureRegistry.register(craftingGatheringDescriptor);
GameplayFeatureRegistry.register(companionSummonDescriptor);
GameplayFeatureRegistry.register(weaponLoadoutDescriptor);
GameplayFeatureRegistry.register(coverPeekingDescriptor);
GameplayFeatureRegistry.register(explosivesDescriptor);
GameplayFeatureRegistry.register(killstreakDescriptor);
GameplayFeatureRegistry.register(bonfireCheckpointDescriptor);
GameplayFeatureRegistry.register(estusFlaskDescriptor);
GameplayFeatureRegistry.register(bloodstainSoulsDescriptor);
GameplayFeatureRegistry.register(postureVisceralDescriptor);
GameplayFeatureRegistry.register(twoAxisCombatDescriptor);
GameplayFeatureRegistry.register(shrinkingStormDescriptor);
GameplayFeatureRegistry.register(superheroFlightDescriptor);
GameplayFeatureRegistry.register(deformableGroundDescriptor);
GameplayFeatureRegistry.register(animeCombatDirectorDescriptor);
GameplayFeatureRegistry.register(proceduralCityDescriptor);

// GTA & Open World Registrations
GameplayFeatureRegistry.register(trafficSimulationDescriptor);
GameplayFeatureRegistry.register(civilianPopulationDescriptor);
GameplayFeatureRegistry.register(wantedCrimeDescriptor);
GameplayFeatureRegistry.register(policeResponseDescriptor);
GameplayFeatureRegistry.register(vehicleTheftDescriptor);
GameplayFeatureRegistry.register(escortMissionDescriptor);
GameplayFeatureRegistry.register(minimapRadarDescriptor);
GameplayFeatureRegistry.register(spaceshipFlightDescriptor);

// Phone & Social Registrations
GameplayFeatureRegistry.register(phoneShellDescriptor);
GameplayFeatureRegistry.register(phoneMessagingDescriptor);
GameplayFeatureRegistry.register(socialEncounterDescriptor);
GameplayFeatureRegistry.register(locationVisitDescriptor);

// Zombie Survival Registrations
GameplayFeatureRegistry.register(zombieHordeAIDescriptor);
GameplayFeatureRegistry.register(barricadeBoardingDescriptor);
GameplayFeatureRegistry.register(mysteryBoxDescriptor);
GameplayFeatureRegistry.register(perkVendingDescriptor);
GameplayFeatureRegistry.register(packAPunchDescriptor);
GameplayFeatureRegistry.register(infectionImmunityDescriptor);
GameplayFeatureRegistry.register(powerGridDoorsDescriptor);
GameplayFeatureRegistry.register(zombiePowerupsDescriptor);
GameplayFeatureRegistry.register(wonderWeaponsDescriptor);
GameplayFeatureRegistry.register(zombieBossDescriptor);
GameplayFeatureRegistry.register(zombieBuildablesDescriptor);
GameplayFeatureRegistry.register(easterEggQuestDescriptor);
GameplayFeatureRegistry.register(gobbleGumDescriptor);
GameplayFeatureRegistry.register(hellhoundsDescriptor);

for (const descriptor of generalFeatureDescriptors) GameplayFeatureRegistry.register(descriptor);




