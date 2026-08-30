import type * as THREE from 'three';
import type { PauseMenuConfig, GameSettingsConfig, ObjectiveTrackerConfig, NotificationsConfig, SessionFlowConfig } from './GeneralFeatureTypes';
export type * from './GeneralFeatureTypes';
import type { EntityId } from '../../ecs/SceneManager';

export type GameplayFeatureId = keyof GameplayFeatureConfigMap;

export type FeatureCategory =
  | 'general'
  | 'combat'
  | 'defense'
  | 'progression'
  | 'encounter'
  | 'ai'
  | 'stealth'
  | 'traversal'
  | 'narrative'
  | 'ranged'
  | 'vehicles'
  | 'magic'
  | 'crafting'
  | 'souls'
  | 'explosives'
  | 'loadout'
  | 'city'
  | 'law'
  | 'social'
  | 'survival';

export interface FeaturePropertySchema {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'select' | 'color';
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
  default: unknown;
}

export interface FeatureDescriptor<TConfig = Record<string, unknown>> {
  id: GameplayFeatureId;
  name: string;
  category: FeatureCategory;
  icon: string;
  description: string;
  tags: string[];
  defaultConfig: TConfig;
  properties: FeaturePropertySchema[];
  presets?: Record<string, Partial<TConfig>>;
  /** Required feature activation dependencies; optional integrations must tolerate absence. */
  requires?: GameplayFeatureId[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Specific Feature Configurations
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetLockConfig {
  enabled: boolean;
  maxDistance: number;
  fovAngle: number;
  autoSwitchOnDeath: boolean;
  breakDistance: number;
  breakTimeOutOfView: number;
  cameraOrbitWeight: number;
  showReticle: boolean;
  reticleColor: string;
  reticleScale: number;
}

export interface TimedHitboxConfig {
  enabled: boolean;
  debugDraw: boolean;
  multiHitAllowed: boolean;
  defaultDamage: number;
  hitboxColor: string;
  hurtboxColor: string;
  weaponSockets: string[];
  limbSockets: string[];
}

export interface ComboStep {
  name: string;
  animation: string;
  damageMultiplier: number;
  poiseDamage: number;
  cancelStartNorm: number;
  inputBufferWindow: number;
  knockbackForce: number;
  vfx?: string;
  audio?: string;
}

export interface ComboConfig {
  enabled: boolean;
  inputBufferDuration: number;
  comboResetDelay: number;
  allowDodgeCancel: boolean;
  allowJumpCancel: boolean;
  allowBlockCancel: boolean;
  lightCombo: ComboStep[];
  heavyCombo: ComboStep[];
  runningAttack: ComboStep;
  dodgeAttack: ComboStep;
  showComboCounter: boolean;
}

export interface DodgeGuardStaminaConfig {
  enabled: boolean;
  // Stamina
  maxStamina: number;
  staminaRegenRate: number;
  staminaRegenDelay: number;
  dodgeStaminaCost: number;
  attackStaminaCost: number;
  blockStaminaDrainRate: number;
  guardBreakStunDuration: number;
  // Dodge
  dodgeSpeed: number;
  dodgeDuration: number;
  dodgeIframesDuration: number;
  dodgeTrailVfx: boolean;
  dodgeTrailColor: string;
  // Block & Parry
  blockDamageReduction: number;
  blockAngleDegrees: number;
  parryWindowDuration: number;
  parryCounterCritMultiplier: number;
  parryHitstopDuration: number;
  parryVfx: string;
}

export type HitReactionType = 'none' | 'flinch_light' | 'flinch_heavy' | 'stagger' | 'knockback' | 'launch' | 'knockdown';

export interface HitReactionConfig {
  enabled: boolean;
  defaultPoise: number;
  poiseRegenRate: number;
  poiseRegenDelay: number;
  knockbackFriction: number;
  launchGravity: number;
  juggleDamageMultiplier: number;
  groundBounceDuration: number;
  wakeUpIframesDuration: number;
  hitstopDuration: number;
}

export type ElementType = 'physical' | 'fire' | 'ice' | 'lightning' | 'wind' | 'holy' | 'dark';

export interface AbilityDef {
  id: string;
  name: string;
  slot: 1 | 2 | 3 | 4;
  keybind: string;
  icon: string;
  mpCost: number;
  cooldown: number;
  castTime: number;
  element: ElementType;
  baseDamage: number;
  range: number;
  radius: number;
  animation: string;
  vfx: string;
  audio: string;
  description: string;
  statusEffect?: string;
}

export interface StatusEffectDef {
  id: string;
  name: string;
  element: ElementType;
  duration: number;
  tickInterval: number;
  tickDamage: number;
  speedMultiplier: number;
  damageMultiplier: number;
  stun: boolean;
  vfxColor: string;
  icon: string;
}

export interface AbilityElementalConfig {
  enabled: boolean;
  maxMp: number;
  mpRegenRate: number;
  abilities: AbilityDef[];
  statusEffects: StatusEffectDef[];
  enableElementalReactions: boolean;
}

export interface BossPhaseDef {
  phase: number;
  hpThresholdPercent: number;
  name: string;
  themeColor: string;
  speedMultiplier: number;
  damageMultiplier: number;
  attackIntervalMultiplier: number;
  unlockedAbilities: string[];
  transitionVfx: string;
  transitionAudio?: string;
}

export interface EncounterAIConfig {
  enabled: boolean;
  enableTelegraphs: boolean;
  telegraphDuration: number;
  telegraphColor: string;
  maxSimultaneousAttackTokens: number;
  combatSpacingRadius: number;
  circlingSpeed: number;
  enableBossPhases: boolean;
  bossPhases: BossPhaseDef[];
}

export interface CharacterAttributes {
  level: number;
  currentExp: number;
  expToNextLevel: number;
  maxHp: number;
  maxMp: number;
  maxStamina: number;
  attackPower: number;
  defense: number;
  critRate: number;
  critDamage: number;
  moveSpeed: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  slot: 'weapon' | 'armor' | 'accessory';
  attackBonus?: number;
  defenseBonus?: number;
  hpBonus?: number;
  critRateBonus?: number;
  element?: ElementType;
  icon?: string;
}

export interface StatsProgressionConfig {
  enabled: boolean;
  baseAttributes: CharacterAttributes;
  statGrowthPerLevel: Partial<CharacterAttributes>;
  levelCap: number;
  equipment: EquipmentItem[];
}

export interface WaveEnemyDef {
  blueprint: string;
  count: number;
  delaySec: number;
  isElite?: boolean;
  isBoss?: boolean;
  customHp?: number;
}

export interface WaveDef {
  waveNumber: number;
  title: string;
  enemies: WaveEnemyDef[];
  rewardExp: number;
  rewardGold?: number;
  intermissionSec: number;
}

export interface ArenaWaveConfig {
  enabled: boolean;
  autoStartOnPlay: boolean;
  waves: WaveDef[];
  victoryBanner: string;
  defeatBanner: string;
  showWaveHUD: boolean;
  enableRematchFlow: boolean;
}

export interface StealthConfig {
  enabled: boolean;
  crouchSpeedMultiplier: number;
  detectionRange: number;
  detectionAngle: number;
  detectionSpeed: number;
  backstabAngleThreshold: number;
  backstabDamageMultiplier: number;
  backstabRange: number;
  executionAnimation: string;
}

export interface ParkourConfig {
  enabled: boolean;
  vaultMaxHeight: number;
  vaultMinHeight: number;
  climbMaxHeight: number;
  wallRunDuration: number;
  autoLedgeGrab: boolean;
  mantleAnimation: string;
}

export interface LootItemDef {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  category: 'weapon' | 'armor' | 'potion' | 'material';
  value: number;
  icon: string;
  color: string;
  statBonus?: { attack?: number; defense?: number; maxHp?: number };
}

export interface LootInventoryConfig {
  enabled: boolean;
  dropRate: number;
  pickupRadius: number;
  autoPickupGold: boolean;
  maxInventorySlots: number;
  highlightRarityColor: boolean;
  possibleDrops: LootItemDef[];
}

export interface DialogueChoice {
  text: string;
  nextId?: string;
  action?: string;
}

export interface DialogueNode {
  id: string;
  speakerName: string;
  speakerPortrait?: string;
  text: string;
  choices?: DialogueChoice[];
  audio?: string;
}

export interface DialogueConfig {
  enabled: boolean;
  dialogueCameraFraming: boolean;
  typingSpeedCharsPerSec: number;
  interactionRadius: number;
  nodes: Record<string, DialogueNode>;
}

export interface RangedWeaponDef {
  id: string;
  name: string;
  type: 'pistol' | 'rifle' | 'shotgun' | 'sniper' | 'rocket';
  damage: number;
  fireRate: number; // rounds per sec
  magazineSize: number;
  reloadDuration: number;
  range: number;
  spread: number;
  muzzleVfx: string;
  impactVfx: string;
  audioFire: string;
  audioReload: string;
  modelAssetId?: string;
  modelSize?: number;
  viewModelRotation?: [number, number, number];
  automatic?: boolean;
}

export interface RangedShooterConfig {
  enabled: boolean;
  /** Optional camera-relative weapon model; existing third-person setups opt out. */
  showViewModel?: boolean;
  aimZoomFov: number;
  aimShoulderOffset: { x: number; y: number; z: number };
  crosshairSpread: number;
  headshotMultiplier: number;
  defaultWeapon: string;
  weapons: RangedWeaponDef[];
}

export interface VehicleHandlingDef {
  id: string;
  name: string;
  type: 'car' | 'mech' | 'hover' | 'flyer';
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  driftFactor: number;
  boostMultiplier: number;
  boostDuration: number;
}

export interface VehicleMountConfig {
  enabled: boolean;
  mountRadius: number;
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  driftFactor: number;
  boostMultiplier: number;
  boostDuration: number;
  vehicles: VehicleHandlingDef[];
}

export interface GrappleHookConfig {
  enabled: boolean;
  maxRange: number;
  pullSpeed: number;
  swingGravity: number;
  ropeColor: string;
  slingshotBoost: number;
  pullEnemies: boolean;
}

export interface TimeMechanicsConfig {
  enabled: boolean;
  bulletTimeScale: number;
  bulletTimeDuration: number;
  bulletTimeCooldown: number;
  rewindDuration: number;
  triggerOnPerfectDodge: boolean;
  screenEffect: boolean;
}

export interface CraftingIngredient {
  itemId: string;
  count: number;
}

export interface CraftingRecipeDef {
  id: string;
  resultItemId: string;
  resultCount: number;
  ingredients: CraftingIngredient[];
  craftDuration: number;
  category: 'weapon' | 'armor' | 'potion' | 'ammo';
}

export interface CraftingGatheringConfig {
  enabled: boolean;
  harvestRadius: number;
  harvestTime: number;
  autoDiscoverRecipes: boolean;
  recipes: CraftingRecipeDef[];
}

export interface CompanionSummonConfig {
  enabled: boolean;
  companionName: string;
  companionModel: string;
  followDistance: number;
  aggroRadius: number;
  attackCooldown: number;
  attackDamage: number;
  reviveThresholdHpPercent: number;
  commandMode: 'follow' | 'assist' | 'guard' | 'passive';
}

export interface GameplayFeatureConfigMap {
  pause_menu: PauseMenuConfig;
  game_settings: GameSettingsConfig;
  objective_tracker: ObjectiveTrackerConfig;
  game_notifications: NotificationsConfig;
  session_flow: SessionFlowConfig;
  target_lock: TargetLockConfig;
  timed_hitboxes: TimedHitboxConfig;
  combo_system: ComboConfig;
  dodge_guard_stamina: DodgeGuardStaminaConfig;
  hit_reactions: HitReactionConfig;
  abilities_magic: AbilityElementalConfig;
  enemy_boss_ai: EncounterAIConfig;
  stats_progression: StatsProgressionConfig;
  arena_flow: ArenaWaveConfig;
  stealth_detection: StealthConfig;
  parkour_traversal: ParkourConfig;
  loot_inventory: LootInventoryConfig;
  dialogue_system: DialogueConfig;
  ranged_shooter: RangedShooterConfig;
  vehicle_mount: VehicleMountConfig;
  grapple_swing: GrappleHookConfig;
  time_mechanics: TimeMechanicsConfig;
  crafting_gathering: CraftingGatheringConfig;
  companion_summon: CompanionSummonConfig;
  weapon_wheel_loadout: WeaponWheelConfig;
  cover_peeking: CoverPeekingConfig;
  ballistics_explosives: ExplosivesConfig;
  killstreaks_rewards: KillstreakConfig;
  bonfire_checkpoint: BonfireCheckpointConfig;
  estus_flask_healing: EstusFlaskConfig;
  bloodstain_souls: BloodstainSoulsConfig;
  posture_visceral: PostureVisceralConfig;
  two_axis_combat: TwoAxisCombatConfig;
  shrinking_storm: ShrinkingStormConfig;
  superhero_flight_system: SuperheroFlightConfig;
  deformable_ground: DeformableGroundConfig;
  anime_combat_director: AnimeCombatDirectorConfig;
  procedural_city_generator: {
    enabled: boolean;
    worldSize?: number;
    roadAlgorithm?: 'Grid' | 'Organic' | 'Radial';
    roadDensity?: number;
    enableSidewalks?: boolean;
    enableLaneMarkings?: boolean;
    enableBuildings?: boolean;
    enableStreetProps?: boolean;
    enableVegetation?: boolean;
    enableBridges?: boolean;
  };
  traffic_simulation: TrafficSimulationConfig;
  civilian_population: CivilianPopulationConfig;
  wanted_crime: WantedCrimeConfig;
  police_response: PoliceResponseConfig;
  vehicle_theft: VehicleTheftConfig;
  escort_missions: EscortMissionConfig;
  minimap_radar: MinimapRadarConfig;
  spaceship_flight: SpaceshipFlightConfig;
  phone_shell: PhoneShellConfig;
  phone_messaging: PhoneMessagingConfig;
  social_encounter: SocialEncounterConfig;
  location_visits: LocationVisitConfig;
  zombie_horde_ai: ZombieHordeConfig;
  barricade_boarding: BarricadeConfig;
  mystery_box_gambling: MysteryBoxConfig;
  perk_vending_machines: PerkVendingConfig;
  pack_a_punch_upgrade: PackAPunchConfig;
  infection_immunity_meter: InfectionConfig;
  power_grid_doors: PowerGridConfig;
  zombie_powerups_drops: ZombiePowerupsConfig;
  zombie_wonder_weapons: WonderWeaponsConfig;
  zombie_boss_encounters: ZombieBossConfig;
  zombie_craftable_traps: ZombieBuildablesConfig;
  zombie_easter_egg_quest: EasterEggQuestConfig;
  zombie_gobs_elixirs: GobbleGumConfig;
  zombie_hellhounds_round: HellhoundsConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Events & States
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveStatusEffect {
  attackerId?: EntityId | null;
  id: string;
  def: StatusEffectDef;
  targetId: EntityId;
  remainingTime: number;
  lastTickTime: number;
  stacks: number;
}

export interface TargetLockState {
  lockedTargetId: EntityId | null;
  candidateIds: EntityId[];
  lockWorldPos: THREE.Vector3;
  screenPos: { x: number; y: number; visible: boolean };
}

export interface ComboState {
  currentStepIndex: number;
  currentChain: 'light' | 'heavy' | 'running' | 'dodge' | 'none';
  isInCancelWindow: boolean;
  canBufferInput: boolean;
  bufferedAction: 'light' | 'heavy' | 'dodge' | 'ability_1' | 'ability_2' | 'ability_3' | 'ability_4' | null;
  comboCount: number;
  comboScore: number;
  comboRank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SSS';
  comboTimer: number;
}

export interface DodgeGuardStaminaState {
  currentStamina: number;
  isDodging: boolean;
  isInvulnerable: boolean;
  dodgeTimeRemaining: number;
  dodgeDirection: THREE.Vector3;
  isBlocking: boolean;
  isParryWindowActive: boolean;
  parryTimeRemaining: number;
  isGuardBroken: boolean;
  guardBreakTimeRemaining: number;
  staminaRegenDelayRemaining: number;
}

export interface HitReactionState {
  currentPoise: number;
  poiseRegenDelayRemaining: number;
  reactionType: HitReactionType;
  reactionTimeRemaining: number;
  knockbackVelocity: THREE.Vector3;
  isLaunched: boolean;
  isGrounded: boolean;
}

export interface AbilityState {
  currentMp: number;
  cooldowns: Map<string, number>;
  activeCasts: Map<string, number>;
}

export interface BossPhaseState {
  bossEntityId: EntityId | null;
  currentPhaseIndex: number;
  currentPhase: BossPhaseDef | null;
  isTransitioning: boolean;
}

export interface ArenaWaveState {
  active: boolean;
  currentWaveIndex: number;
  enemiesRemaining: number;
  state: 'idle' | 'countdown' | 'in_wave' | 'intermission' | 'victory' | 'defeat';
  timer: number;
  totalKills: number;
  startTime: number;
}

// ── 1. Weapon Wheel & Loadouts ──────────────────────────────────────────────
export interface WeaponSlotDef {
  slot: number;
  id: string;
  name: string;
  category: 'pistol' | 'rifle' | 'shotgun' | 'sniper' | 'heavy' | 'magic';
  damage: number;
  fireRate: number;
  magazineCapacity: number;
  reloadTime: number;
  range: number;
  icon: string;
  modelAssetId?: string;
  crosshairType?: 'dot' | 'cross' | 'circle' | 'shotgun';
}

export interface WeaponWheelConfig {
  enabled: boolean;
  slots: WeaponSlotDef[];
  switchTime: number;
  slowTimeDuringWheel: boolean;
  timeScale: number;
}

export interface WeaponWheelState {
  activeSlot: number;
  isOpen: boolean;
  switching: boolean;
  switchProgress: number;
}

// ── 2. Cover & Peeking System ───────────────────────────────────────────────
export interface CoverPeekingConfig {
  enabled: boolean;
  snapDistance: number;
  lowCoverHeight: number;
  highCoverHeight: number;
  leanAngle: number;
  aimStepOutDistance: number;
}

export interface CoverState {
  inCover: boolean;
  coverType: 'low' | 'high' | 'none';
  coverNormal: THREE.Vector3;
  leanDirection: 'left' | 'right' | 'none';
  isPeeking: boolean;
}

// ── 3. Ballistics & Explosives ──────────────────────────────────────────────
export interface GrenadeDef {
  id: string;
  name: string;
  type: 'frag' | 'smoke' | 'flash' | 'incendiary';
  blastRadius: number;
  damage: number;
  fuseTime: number;
  throwVelocity: number;
  bounciness: number;
  icon: string;
  modelAssetId?: string;
  modelSize?: number;
  audioThrow?: string;
  audioExplosion?: string;
}

export interface ExplosivesConfig {
  enabled: boolean;
  grenades: GrenadeDef[];
  maxCarriedGrenades: number;
  grenadeThrowCooldown: number;
}

export interface ActiveGrenade {
  attackerId?: EntityId | null;
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  fuseRemaining: number;
  def: GrenadeDef;
}

// ── 4. Killstreaks & Tactical Rewards ───────────────────────────────────────
export interface KillstreakRewardDef {
  streakCount: number;
  id: string;
  name: string;
  type: 'uav_radar' | 'airstrike' | 'health_pack' | 'damage_boost';
  duration: number;
  icon: string;
  bannerTitle: string;
}

export interface KillstreakConfig {
  enabled: boolean;
  rewards: KillstreakRewardDef[];
  streakResetTime: number;
}

export interface KillstreakState {
  currentStreak: number;
  highestStreak: number;
  timeSinceLastKill: number;
  activeBuffs: Set<string>;
  radarActiveUntil: number;
}

// ── 5. Bonfire / Grace Checkpoint ───────────────────────────────────────────
export interface BonfireDef {
  id: string;
  name: string;
  position: THREE.Vector3;
  discovered: boolean;
}

export interface BonfireCheckpointConfig {
  enabled: boolean;
  bonfires: BonfireDef[];
  healOnRest: boolean;
  restoreFlasksOnRest: boolean;
  respawnEnemiesOnRest: boolean;
  interactionRadius: number;
}

export interface BonfireState {
  lastRestedBonfireId: string | null;
  isResting: boolean;
  discoveredCount: number;
}

// ── 6. Estus Flasks & Healing ───────────────────────────────────────────────
export interface EstusFlaskConfig {
  enabled: boolean;
  maxCrimsonFlasks: number;
  maxCeruleanFlasks: number;
  crimsonHealAmount: number;
  ceruleanMpAmount: number;
  drinkDuration: number;
  drinkMoveSpeedMultiplier: number;
  upgradeLevel: number;
}

export interface EstusFlaskState {
  crimsonFlasksRemaining: number;
  ceruleanFlasksRemaining: number;
  isDrinking: boolean;
  drinkTimer: number;
  activeFlaskType: 'crimson' | 'cerulean' | null;
}

// ── 7. Bloodstain & Lost Souls ──────────────────────────────────────────────
export interface BloodstainData {
  position: THREE.Vector3;
  soulsAmount: number;
  timestamp: number;
}

export interface BloodstainSoulsConfig {
  enabled: boolean;
  pickupRadius: number;
  beaconVfxColor: string;
}

export interface BloodstainState {
  activeBloodstain: BloodstainData | null;
  totalCollectedSouls: number;
}

// ── 8. Posture Break & Visceral Deathblows ──────────────────────────────────
export interface PostureVisceralConfig {
  enabled: boolean;
  maxPosture: number;
  postureDecayDelay: number;
  postureDecayRate: number;
  parryPostureDamage: number;
  heavyAttackPostureDamage: number;
  visceralDamageMultiplier: number;
  visceralRange: number;
  vulnerableDuration: number;
}

export interface PostureState {
  currentPosture: number;
  maxPosture: number;
  isBroken: boolean;
  breakTimer: number;
  decayDelayTimer: number;
}

// ── 9. Two-Axis Combat State Machine & Ki Meter ─────────────────────────────
export type CombatMovementMode = 'grounded' | 'airborne' | 'flight';

export type CombatAction =
  | 'idle'
  | 'melee_string'
  | 'dash'
  | 'teleport_windup'
  | 'charging'
  | 'beam_channel'
  | 'beam_clash'
  | 'guard'
  | 'hit_stun'
  | 'downed'
  | 'dead'
  | 'omen_channel';

export type FramePhase = 'startup' | 'active' | 'recovery';

export interface TwoAxisCombatConfig {
  enabled: boolean;
  maxKi: number;
  kiChargeRate: number;
  beamCostPerSec: number;
  teleportCost: number;
  hitStopDuration: number;
  enableCancelWindows: boolean;
  enableDirectionalMelee: boolean;
}

export interface TwoAxisCombatState {
  movementMode: CombatMovementMode;
  action: CombatAction;
  phase: FramePhase;
  currentKi: number;
  maxKi: number;
  isChargingKi: boolean;
  hitStopTimer: number;
  actionTimer: number;
  actionDuration: number;
  cancelWindowOpen: boolean;
  comboStep: number;
}

// ── 10. Shrinking Storm & Battle Royale Circle ──────────────────────────────
export interface StormPhaseDef {
  phase: number;
  waitDuration: number;
  shrinkDuration: number;
  targetRadius: number;
  damagePerSec: number;
  centerShiftMaxDistance: number;
}

export interface ShrinkingStormConfig {
  enabled: boolean;
  initialRadius: number;
  minRadius: number;
  tickInterval: number;
  barrierColor: string;
  barrierHeight: number;
  enableVisualBarrier: boolean;
  phases: StormPhaseDef[];
}

export interface ShrinkingStormState {
  currentPhaseIndex: number;
  state: 'idle' | 'waiting' | 'shrinking' | 'final';
  currentCenter: { x: number; z: number };
  targetCenter: { x: number; z: number };
  currentRadius: number;
  targetRadius: number;
  phaseTimer: number;
  totalElapsed: number;
  isPlayerInSafeZone: boolean;
  damageAccumulator: number;
}

// ── 11. Superhero Flight Traversal System ───────────────────────────────────
export interface SuperheroFlightConfig {
  enabled: boolean;
  hoverSpeed: number;
  fastSpeed: number;
  boostSpeed: number;
  verticalSpeed: number;
  dodgeSpeed: number;
  dodgeDuration: number;
  landingThresholdSpeed: number;
  landingFreezeDuration: number;
}

export interface SuperheroFlightState {
  isFlying: boolean;
  flightState: 'inactive' | 'takeoff' | 'hover' | 'fast_move' | 'dodge' | 'landing';
  speed: number;
  altitude: number;
  activeClip: string;
  isLandingLocked: boolean;
}

// ── 12. Deformable Ground & Impact Craters ──────────────────────────────────
export interface DeformableGroundConfig {
  enabled: boolean;
  maxDepth: number;
  defaultRadius: number;
  defaultDepth: number;
  defaultLipHeight: number;
  normalRecalcThreshold: number;
}

// ── 13. Anime Combat Director & Presentation ────────────────────────────────
export interface AnimeCombatDirectorConfig {
  enabled: boolean;
  hitStopDefaultScale: number;
  hitStopMaxDuration: number;
  impactFrameEnabled: boolean;
  defaultOutlineThickness: number;
  defaultOutlineColor: number;
  cameraPunchMultiplier: number;
}

// ── 14. Traffic Simulation System ───────────────────────────────────────────
export interface RoadRouteDef {
  id: string;
  axis: 'x' | 'z';
  direction: 1 | -1;
  roadCenter: number;
  laneOffset: number;
  length?: number;
}

export interface TrafficSimulationConfig {
  enabled: boolean;
  maxCars: number;
  spawnRangeMin: number;
  despawnRange: number;
  minSpeed: number;
  maxSpeed: number;
  visibleRange: number;
  laneOffset: number;
  modelAssetIds: string[];
}

export interface TrafficCarState {
  driverId?: string | null;
  id: string;
  active: boolean;
  route: RoadRouteDef;
  position: THREE.Vector3;
  speed: number;
  yaw: number;
  modelAssetId: string;
}

// ── 15. Civilian Population System ──────────────────────────────────────────
export type CivilianBehaviorMode = 'walking' | 'idle' | 'driving' | 'panicking' | 'fleeing' | 'dead' | 'ejected';

export interface CivilianPopulationConfig {
  enabled: boolean;
  maxWalkers: number;
  maxDrivers: number;
  spawnRangeMin: number;
  despawnRange: number;
  walkerSpeed: number;
  panicSpeed: number;
  health: number;
  panicRadius: number;
  modelAssetIds: string[];
}

export interface CivilianState {
  vehicleId?: string | null;
  id: string;
  entityId: EntityId | null;
  mode: CivilianBehaviorMode;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  health: number;
  panicTimer: number;
  panicOrigin: THREE.Vector3 | null;
  modelAssetId: string;
}

// ── 16. Wanted / Crime System ───────────────────────────────────────────────
export type CrimeType =
  | 'vehicle_theft'
  | 'hit_and_run'
  | 'assault'
  | 'homicide'
  | 'shooting_in_public'
  | 'resisting_arrest';

export interface CrimeReport {
  type: CrimeType;
  position: THREE.Vector3;
  severity: number;
  timestamp: number;
}

export interface WantedCrimeConfig {
  enabled: boolean;
  maxWantedLevel: number;
  cooldownAfterCrimeSec: number;
  decayWindowFootSec: number;
  decayWindowVehicleSec: number;
  crimeThresholds: Record<CrimeType, number>;
}

export interface WantedState {
  wantedLevel: number;
  heat: number;
  timeSinceLastCrimeSec: number;
  decayProgressSec: number;
  policePursuitActive: boolean;
}

// ── 17. Police Response System ──────────────────────────────────────────────
export type PoliceUnitMode = 'patrol' | 'pursuit_drive' | 'exiting_vehicle' | 'pursuit_foot' | 'arresting' | 'combat_shooting' | 'entering_vehicle';
export type PoliceUnitRole = 'patrol' | 'response';

export interface PoliceResponseConfig {
  enabled: boolean;
  maxUnits: number;
  basePatrolUnits: number;
  unitsPerWantedLevel: number;
  officerSpeed: number;
  cruiserSpeed: number;
  arrestDistance: number;
  shootDistance: number;
  shootInterval: number;
  officerModelAssetId: string;
  cruiserModelAssetId: string;
}

export interface PoliceUnitState {
  id: string;
  role: PoliceUnitRole;
  mode: PoliceUnitMode;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  health: number;
  targetPosition: THREE.Vector3 | null;
  shootCooldown: number;
  officerEntityId: EntityId | null;
  cruiserEntityId: EntityId | null;
}

// ── 18. Vehicle Theft System ────────────────────────────────────────────────
export interface VehicleTheftConfig {
  enabled: boolean;
  theftRange: number;
  ejectionImpulse: number;
  stolenCarWantedEscalation: number;
}

// ── 19. Escort / Passenger Missions ─────────────────────────────────────────
export type EscortMode = 'idle' | 'following' | 'in_vehicle';

export interface EscortMissionConfig {
  enabled: boolean;
  interactRange: number;
  followWalkSpeed: number;
  followRunSpeed: number;
  catchupSpeed: number;
  teleportDistance: number;
  deliveryRadius: number;
  maxFollowers: number;
}

export interface EscortFollowerState {
  id: string;
  entityId: EntityId;
  name: string;
  mode: EscortMode;
  position: THREE.Vector3;
  yaw: number;
  isRecruited: boolean;
  slotIndex: number;
}

// ── 20. Minimap / Radar System ──────────────────────────────────────────────
export type RadarMarkerType =
  | 'player'
  | 'enemy'
  | 'police'
  | 'civilian'
  | 'vehicle'
  | 'objective'
  | 'contact'
  | 'destination'
  | 'custom';

export interface RadarMarker {
  id: string;
  type: RadarMarkerType;
  position: THREE.Vector3;
  label?: string;
  color?: string;
  icon?: string;
  visible: boolean;
  blipSize?: number;
  clampToEdge?: boolean;
}

export interface MinimapRadarConfig {
  enabled: boolean;
  radius: number;
  zoom: number;
  rotateWithPlayer: boolean;
  showCardinals: boolean;
  showBorder: boolean;
  radarColor: string;
}

// ── 21. Spaceship Flight System ─────────────────────────────────────────────
export type ShipCameraMode = 'chase' | 'rear' | 'cockpit' | 'cinematic';

export interface SpaceshipFlightConfig {
  enabled: boolean;
  maxSpeed: number;
  turboSpeed: number;
  accel: number;
  brake: number;
  drag: number;
  verticalSpeed: number;
  turnRate: number;
  pitchRate: number;
  rollRate: number;
  bankMax: number;
  barrelRollDuration: number;
}

export interface SpaceshipFlightState {
  isFlying: boolean;
  speed: number;
  velocity: THREE.Vector3;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  isTurboActive: boolean;
  isBarrelRolling: boolean;
  barrelRollProgress: number;
  barrelRollDirection: 'left' | 'right';
  cameraMode: ShipCameraMode;
}

// ── 22. Phone Shell System ──────────────────────────────────────────────────
export interface PhoneAppDefinition {
  id: string;
  name: string;
  icon: string;
  badgeCount?: number;
}

export interface PhoneShellConfig {
  enabled: boolean;
  openKey: string;
  allowWhileDriving: boolean;
  soundOpen?: string;
  soundClose?: string;
}

export interface PhoneShellState {
  isOpen: boolean;
  activeAppId: string | null;
  unreadCount: number;
}

// ── 23. Phone Messaging System ──────────────────────────────────────────────
export interface MessageChoice {
  id: string;
  text: string;
  nextNodeId: string;
  requiredCondition?: string;
  eventTrigger?: string;
  eventPayload?: Record<string, unknown>;
}

export interface MessageNode {
  id: string;
  sender: 'contact' | 'player';
  text: string;
  choices?: MessageChoice[];
  delaySeconds?: number;
  nextNodeId?: string;
  eventTrigger?: string;
  eventPayload?: Record<string, unknown>;
}

export interface ConversationThread {
  id: string;
  contactId: string;
  title: string;
  currentNodeId: string;
  history: Array<{ sender: 'contact' | 'player'; text: string; timestamp: number }>;
  pendingChoices?: MessageChoice[];
  isCompleted: boolean;
}

export interface PhoneContact {
  id: string;
  name: string;
  avatarIcon?: string;
  relationshipScore: number;
  status: 'available' | 'busy' | 'offline';
  homeLocation?: { x: number; y: number; z: number; name: string };
}

export interface PendingScheduledMessage {
  id: string;
  threadId: string;
  node: MessageNode;
  fireGameTime: number;
}

export interface PhoneMessagingConfig {
  enabled: boolean;
  contacts: PhoneContact[];
}

export interface PhoneMessagingState {
  threads: Map<string, ConversationThread>;
  scheduledMessages: PendingScheduledMessage[];
}

// ── 24. Social Encounters / Dates System ────────────────────────────────────
export type SocialEncounterStatus =
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'scheduled'
  | 'active'
  | 'activity_progress'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'completed';

export interface EncounterActivity {
  id: string;
  title: string;
  description: string;
  targetScore: number;
  durationSeconds: number;
  dialogueGraphId?: string;
}

export interface SocialEncounterTemplate {
  id: string;
  contactId: string;
  title: string;
  kind: 'romance_date' | 'friend_hangout' | 'business_meeting';
  meetingLocation: { x: number; y: number; z: number; radius: number; name: string };
  timeWindowHours: { startHour: number; endHour: number };
  activities: EncounterActivity[];
  minSuccessScore: number;
  allowHomeVisitOnSuccess: boolean;
}

export interface SocialEncounterState {
  activeEncounter: {
    templateId: string;
    contactId: string;
    status: SocialEncounterStatus;
    scheduledGameHour: number;
    currentActivityIndex: number;
    accumulatedScore: number;
    elapsedSeconds: number;
  } | null;
}

export interface SocialEncounterConfig {
  enabled: boolean;
  templates: SocialEncounterTemplate[];
}

// ── 25. Follow-Up Location Visits System ────────────────────────────────────
export type LocationVisitStatus =
  | 'invitation_available'
  | 'accepted'
  | 'declined'
  | 'postponed'
  | 'travelling'
  | 'arrived'
  | 'completed'
  | 'expired';

export interface LocationVisitTemplate {
  id: string;
  contactId: string;
  title: string;
  location: { x: number; y: number; z: number; radius: number; name: string };
  expiryDurationGameHours: number;
  completionEvent?: string;
  completionDialogueId?: string;
}

export interface LocationVisitState {
  activeVisit: {
    templateId: string;
    contactId: string;
    status: LocationVisitStatus;
    invitationTimestamp: number;
    expiryTimestamp: number;
  } | null;
}

export interface LocationVisitConfig {
  enabled: boolean;
  templates: LocationVisitTemplate[];
}

// ── 26. Zombie Horde AI System ──────────────────────────────────────────────
export type ZombieArchetype = 'shambler' | 'runner' | 'spitter' | 'tank' | 'crawler';

export type ZombieBehaviorState =
  | 'idle'
  | 'wandering'
  | 'investigating_noise'
  | 'chasing'
  | 'lunging'
  | 'attacking'
  | 'spitting'
  | 'staggered'
  | 'crawling'
  | 'dead';

export interface ZombieAttackDef {
  name: string;
  damage: number;
  range: number;
  cooldown: number;
  windup: number;
  knockback: number;
  poiseDamage: number;
  isAOE?: boolean;
  aoeRadius?: number;
}

export interface ZombieArchetypeDef {
  archetype: ZombieArchetype;
  maxHealth: number;
  speed: number;
  runSpeed: number;
  frenzySpeedMultiplier: number;
  poise: number;
  headshotMultiplier: number;
  detectionRange: number;
  fovAngle: number;
  attacks: ZombieAttackDef[];
  modelAssetId?: string;
}

export interface ZombieSpitProjectile {
  id: string;
  sourceZombieId: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  lifeTime: number;
}

export interface ZombieState {
  id: string;
  entityId: EntityId | null;
  archetype: ZombieArchetype;
  state: ZombieBehaviorState;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  health: number;
  maxHealth: number;
  poise: number;
  targetEntityId: EntityId | null;
  targetPosition: THREE.Vector3 | null;
  attackCooldown: number;
  stateTimer: number;
  staggerTimer: number;
  isCrawling: boolean;
  isFrenzied: boolean;
  assignedSurroundSlot: number;
  lastNoisePosition: THREE.Vector3 | null;
  noiseTimer: number;
}

export interface ZombieWaveDef {
  waveNumber: number;
  totalZombies: number;
  spawnRate: number; // zombies spawned per second
  archetypeWeights: Record<ZombieArchetype, number>;
  intermissionSec: number;
}

export interface ZombieWaveState {
  active: boolean;
  currentWaveIndex: number;
  zombiesSpawned: number;
  zombiesAlive: number;
  totalKills: number;
  intermissionRemaining: number;
  isWaveCompleted: boolean;
}

export interface ZombieHordeConfig {
  enabled: boolean;
  mode: 'waves' | 'open_world_wandering' | 'dormant_ambush';
  maxActiveZombies: number;
  spawnDistanceMin: number;
  spawnDistanceMax: number;
  hearingSensitivity: number;
  screechAlertRadius: number;
  enableSurroundBehavior: boolean;
  surroundSlotsCount: number;
  surroundDistance: number;
  headshotInstakillThreshold: number;
  legDismemberHealthPercent: number;
  archetypes: Record<ZombieArchetype, ZombieArchetypeDef>;
  waves: ZombieWaveDef[];
}

// ── 27. Barricade Boarding & Defense System ──────────────────────────────────
export type BarricadeTier = 'wood' | 'metal' | 'electrified';

export interface BarricadeDef {
  id: string;
  position: { x: number; y: number; z: number };
  maxPlanks: number;
  tier: BarricadeTier;
  name?: string;
}

export interface BarricadeState {
  id: string;
  currentPlanks: number;
  maxPlanks: number;
  tier: BarricadeTier;
  isBreached: boolean;
  position: THREE.Vector3;
}

export interface BarricadeConfig {
  enabled: boolean;
  repairHoldDurationSec: number;
  pointsPerPlank: number;
  barricades: BarricadeDef[];
}

// ── 28. Mystery Box System ──────────────────────────────────────────────────
export interface MysteryBoxLocation {
  id: string;
  position: { x: number; y: number; z: number };
  yaw?: number;
}

export interface MysteryBoxWeaponDef {
  weaponId: string;
  name: string;
  weight: number;
  isWonderWeapon?: boolean;
}

export interface MysteryBoxConfig {
  enabled: boolean;
  spinCost: number;
  spinDurationSec: number;
  grabTimeoutSec: number;
  teddyBearRollChance: number;
  weapons: MysteryBoxWeaponDef[];
  locations: MysteryBoxLocation[];
}

export interface MysteryBoxState {
  activeLocationId: string;
  isSpinning: boolean;
  currentRolledWeapon: string | null;
  grabTimeRemaining: number;
  totalSpinsInCurrentLocation: number;
}

// ── 29. Perk Vending Machines System ─────────────────────────────────────────
export type PerkType =
  | 'juggernog'
  | 'speed_cola'
  | 'quick_revive'
  | 'double_tap'
  | 'stamin_up'
  | 'deadshot'
  | 'mule_kick';

export interface PerkMachineDef {
  perkType: PerkType;
  cost: number;
  name: string;
  icon: string;
  position: { x: number; y: number; z: number };
  description: string;
}

export interface PerkVendingConfig {
  enabled: boolean;
  maxPerksPerPlayer: number;
  drinkDurationSec: number;
  machines: PerkMachineDef[];
}

export interface PerkVendingState {
  activePerks: PerkType[];
  isDrinking: boolean;
}

// ── 30. Pack-A-Punch Upgrade & AAT System ───────────────────────────────────
export type AATType = 'none' | 'blast_furnace' | 'dead_wire' | 'cryo_freeze' | 'brain_rot';

export interface WeaponUpgradeState {
  weaponId: string;
  tier: number;
  damageMultiplier: number;
  aat: AATType;
  maxReserveMultiplier: number;
}

export interface PackAPunchConfig {
  enabled: boolean;
  upgradeCostTier1: number;
  upgradeCostTier2: number;
  upgradeCostTier3: number;
  aatCost: number;
  upgradeTimeSec: number;
}

export interface PackAPunchState {
  isUpgrading: boolean;
  upgradingWeaponId: string | null;
  timeRemaining: number;
}

// ── 31. Infection & Immunity Meter System ───────────────────────────────────
export type InfectionStage = 'none' | 'mild' | 'moderate' | 'critical' | 'fatal';

export interface InfectionConfig {
  enabled: boolean;
  biteInfectionAmount: number;
  acidInfectionRatePerSec: number;
  passiveDecayRatePerSec: number;
  tickDamageCritical: number;
  antiobioticHealAmount: number;
}

export interface InfectionState {
  infectionPercent: number;
  currentStage: InfectionStage;
  hasImmunityBoost: boolean;
  immunityTimeRemaining: number;
}

// ── 32. Power Grid, Doors & Traps System ────────────────────────────────────
export interface BuyableDoorDef {
  id: string;
  name: string;
  cost: number;
  position: { x: number; y: number; z: number };
  isOpened: boolean;
}

export type TrapType = 'electric_gate' | 'flame_jet';

export interface TrapDef {
  id: string;
  name: string;
  type: TrapType;
  cost: number;
  durationSec: number;
  cooldownSec: number;
  position: { x: number; y: number; z: number };
  damagePerSec: number;
}

export interface PowerGridConfig {
  enabled: boolean;
  requiresPowerForPerks: boolean;
  requiresPowerForTraps: boolean;
  doors: BuyableDoorDef[];
  traps: TrapDef[];
}

export interface PowerGridState {
  isPowerOn: boolean;
  openedDoorIds: string[];
  activeTraps: Record<string, { timeRemaining: number; cooldownRemaining: number }>;
}

// ── 33. Zombie Power-Up Drops System ────────────────────────────────────────
export type PowerupType =
  | 'insta_kill'
  | 'nuke'
  | 'max_ammo'
  | 'carpenter'
  | 'double_points'
  | 'fire_sale';

export interface ZombiePowerupsConfig {
  enabled: boolean;
  dropChanceOnKill: number;
  powerupDurationSec: number;
  floatDurationSec: number;
  nukePointsAward: number;
  carpenterPointsAward: number;
}

export interface ActivePowerupDrop {
  id: string;
  type: PowerupType;
  position: THREE.Vector3;
  timeRemaining: number;
}

export interface ZombiePowerupsState {
  activeEffects: Record<PowerupType, number>;
  activeDrops: ActivePowerupDrop[];
}

// ── 34. Wonder Weapons System ───────────────────────────────────────────────
export type WonderWeaponType = 'wunderwaffe_dg2' | 'ray_gun_mk2' | 'monkey_bomb' | 'gersch_device';

export interface ActiveMonkeyBomb {
  id: string;
  position: THREE.Vector3;
  timeRemaining: number;
  hasDetonated: boolean;
}

export interface ActiveGerschDevice {
  id: string;
  position: THREE.Vector3;
  timeRemaining: number;
}

export interface WonderWeaponsConfig {
  enabled: boolean;
  wunderwaffeChainCount: number;
  wunderwaffeDamage: number;
  monkeyBombFuseSec: number;
  monkeyBombRadius: number;
  gerschDurationSec: number;
  gerschRadius: number;
}

export interface WonderWeaponsState {
  activeMonkeyBombs: ActiveMonkeyBomb[];
  activeGerschVortices: ActiveGerschDevice[];
}

// ── 35. Special Boss Infected Encounters ────────────────────────────────────
export type ZombieBossArchetype = 'panzer_soldat' | 'bile_bloater' | 'crying_witch' | 'nemesis_stalker';

export interface ZombieBossState {
  id: string;
  entityId: EntityId;
  archetype: ZombieBossArchetype;
  health: number;
  maxHealth: number;
  isEnraged: boolean;
  position: THREE.Vector3;
  yaw: number;
  attackCooldown: number;
  specialTimer: number;
}

export interface ZombieBossConfig {
  enabled: boolean;
  panzerHp: number;
  bloaterHp: number;
  witchHp: number;
  nemesisHp: number;
  bossSpawnWaveInterval: number;
}

export interface ZombieBossStateMap {
  activeBosses: ZombieBossState[];
}

// ── 36. Zombie Craftable Traps & Buildables ─────────────────────────────────
export type BuildableItemType = 'riot_shield' | 'turbine_generator' | 'sentry_turret' | 'spikemore';

export interface ScavengedPart {
  id: string;
  name: string;
  requiredFor: BuildableItemType;
  collected: boolean;
  spawnPosition: { x: number; y: number; z: number };
}

export interface DeployedBuildable {
  id: string;
  type: BuildableItemType;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  timeRemaining?: number;
}

export interface ZombieBuildablesConfig {
  enabled: boolean;
  shieldMaxDurability: number;
  turbineDurationSec: number;
  sentryDamage: number;
  parts: ScavengedPart[];
}

export interface ZombieBuildablesState {
  assembledItems: BuildableItemType[];
  deployedBuildables: DeployedBuildable[];
  activeShieldDurability: number;
}

// ── 37. Easter Egg Quest Engine & Soul Boxes ────────────────────────────────
export interface SoulBoxDef {
  id: string;
  name?: string;
  position: { x: number; y: number; z: number };
  requiredSouls: number;
  currentSouls: number;
  isCharged: boolean;
}

export interface QuestStep {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
}

export interface EasterEggQuestConfig {
  enabled: boolean;
  steps: QuestStep[];
  soulBoxes: SoulBoxDef[];
  lockdownDurationSec: number;
}

export interface EasterEggQuestState {
  currentStepIndex: number;
  soulBoxes: SoulBoxDef[];
  isLockdownActive: boolean;
  lockdownTimeRemaining: number;
  isQuestCompleted: boolean;
}

// ── 38. GobbleGum & Consumable Elixirs ──────────────────────────────────────
export type GobbleGumType =
  | 'shopping_free'
  | 'perkaholic'
  | 'in_plain_sight'
  | 'alchemical_antithesis'
  | 'self_medication';

export interface GobbleGumConfig {
  enabled: boolean;
  shoppingFreeDurationSec: number;
  inPlainSightDurationSec: number;
  alchemicalDurationSec: number;
}

export interface GobbleGumState {
  activeGums: Record<GobbleGumType, number>;
  remainingCharges: Record<GobbleGumType, number>;
}

// ── 39. Hellhound Special Rounds ────────────────────────────────────────────
export interface HellhoundState {
  id: string;
  entityId: EntityId;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  health: number;
  isLeaping: boolean;
}

export interface HellhoundsConfig {
  enabled: boolean;
  roundInterval: number;
  dogsPerPlayer: number;
  dogHp: number;
  dogSpeed: number;
  guaranteeMaxAmmo: boolean;
}

export interface HellhoundsRoundState {
  isHellhoundRound: boolean;
  houndsRemaining: number;
  houndsAlive: number;
}
