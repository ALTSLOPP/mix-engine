import { gameplayWallet, type GameplayWallet } from './GameplayWallet';
import { validateRuntimeSnapshot, validateFeatureRuntime } from './RuntimeSnapshot';
import type { Engine } from '../../engine/Engine';
import { createFpsStarterWeapons, createFpsStarterSlots, createFpsStarterGrenades } from '../../content/FpsStarterPack';
import type {
  GameplayFeatureConfigMap,
  GameplayFeatureId,
} from './types';
import { GAMEPLAY_PRESETS, type GameplayPreset } from './GameplayPresets';
import { validateFeatureConfig } from './FeatureValidation';
import { GameplayFeatureRegistry } from './GameplayFeatureRegistry';
import { TargetLockSystem } from './TargetLockSystem';
import { TimedHitboxSystem } from './TimedHitboxSystem';
import { ComboSystem } from './ComboSystem';
import { DodgeGuardStaminaSystem } from './DodgeGuardStaminaSystem';
import { HitReactionSystem } from './HitReactionSystem';
import { AbilityElementalSystem } from './AbilityElementalSystem';
import { EncounterAISystem } from './EncounterAISystem';
import { StatsProgressionSystem } from './StatsProgressionSystem';
import { ArenaWaveSystem } from './ArenaWaveSystem';
import { StealthSystem } from './StealthSystem';
import { ParkourSystem } from './ParkourSystem';
import { LootInventorySystem } from './LootInventorySystem';
import { DialogueSystem } from './DialogueSystem';
import { RangedShooterSystem } from './RangedShooterSystem';
import { VehicleMountSystem } from './VehicleMountSystem';
import { GrappleHookSystem } from './GrappleHookSystem';
import { TimeMechanicsSystem } from './TimeMechanicsSystem';
import { CraftingSystem } from './CraftingSystem';
import { CompanionSystem } from './CompanionSystem';
import { WeaponLoadoutSystem } from './WeaponLoadoutSystem';
import { CoverPeekingSystem } from './CoverPeekingSystem';
import { ExplosivesSystem } from './ExplosivesSystem';
import { KillstreakSystem } from './KillstreakSystem';
import { BonfireCheckpointSystem } from './BonfireCheckpointSystem';
import { EstusFlaskSystem } from './EstusFlaskSystem';
import { BloodstainSystem } from './BloodstainSystem';
import { PostureVisceralSystem } from './PostureVisceralSystem';
import { TwoAxisCombatSystem } from './TwoAxisCombatSystem';
import { ShrinkingStormSystem } from './ShrinkingStormSystem';
import { SuperheroFlightMotor } from '../../character/SuperheroFlightMotor';
import { DeformableGroundSystem } from '../destruction/DeformableGroundSystem';
import { AnimeCombatDirector } from '../combat/AnimeCombatDirector';
import { MeshSlicingSystem } from '../destruction/DestructibleMeshComponent';
import { ProceduralCityDirector } from '../city';

import { PauseMenuSystem } from './PauseMenuSystem';
import { GameSettingsSystem } from './GameSettingsSystem';
import { ObjectiveTrackerSystem } from './ObjectiveTrackerSystem';
import { NotificationsSystem } from './NotificationsSystem';
import { SessionFlowSystem } from './SessionFlowSystem';
import { GeneralGameplayUI } from './GeneralGameplayUI';

import { TrafficSimulationSystem } from './TrafficSimulationSystem';
import { CivilianPopulationSystem } from './CivilianPopulationSystem';
import { WantedCrimeSystem } from './WantedCrimeSystem';
import { PoliceResponseSystem } from './PoliceResponseSystem';
import { VehicleTheftSystem } from './VehicleTheftSystem';
import { EscortMissionSystem } from './EscortMissionSystem';
import { MinimapRadarSystem } from './MinimapRadarSystem';
import { SpaceshipFlightSystem } from './SpaceshipFlightSystem';
import { PhoneShellSystem } from './PhoneShellSystem';
import { PhoneMessagingSystem } from './PhoneMessagingSystem';
import { SocialEncounterSystem } from './SocialEncounterSystem';
import { LocationVisitSystem } from './LocationVisitSystem';
import { ZombieHordeAISystem } from './ZombieHordeAISystem';
import { BarricadeBoardingSystem } from './BarricadeBoardingSystem';
import { MysteryBoxSystem } from './MysteryBoxSystem';
import { PerkVendingSystem } from './PerkVendingSystem';
import { PackAPunchSystem } from './PackAPunchSystem';
import { InfectionImmunitySystem } from './InfectionImmunitySystem';
import { PowerGridDoorsSystem } from './PowerGridDoorsSystem';
import { ZombiePowerupDropsSystem } from './ZombiePowerupDropsSystem';
import { ZombieWonderWeaponsSystem } from './ZombieWonderWeaponsSystem';
import { ZombieBossEncounterSystem } from './ZombieBossEncounterSystem';
import { ZombieBuildablesSystem } from './ZombieBuildablesSystem';
import { ZombieEasterEggQuestSystem } from './ZombieEasterEggQuestSystem';
import { GobbleGumSystem } from './GobbleGumSystem';
import { HellhoundSpecialRoundSystem } from './HellhoundSpecialRoundSystem';
import { ZombieSurvivalHUD } from './ZombieSurvivalHUD';

export class GameplayFeatureManager {
  readonly wallet: GameplayWallet;
  readonly pause: PauseMenuSystem;
  readonly settings: GameSettingsSystem;
  readonly objectives: ObjectiveTrackerSystem;
  readonly notifications: NotificationsSystem;
  readonly session: SessionFlowSystem;
  readonly generalUI: GeneralGameplayUI;
  readonly zombieHUD: ZombieSurvivalHUD;
  readonly targetLock: TargetLockSystem;
  readonly hitboxes: TimedHitboxSystem;
  readonly combo: ComboSystem;
  readonly defense: DodgeGuardStaminaSystem;
  readonly hitReactions: HitReactionSystem;
  readonly abilities: AbilityElementalSystem;
  readonly encounterAI: EncounterAISystem;
  readonly stats: StatsProgressionSystem;
  readonly arena: ArenaWaveSystem;
  readonly stealth: StealthSystem;
  readonly parkour: ParkourSystem;
  readonly loot: LootInventorySystem;
  readonly dialogue: DialogueSystem;
  readonly ranged: RangedShooterSystem;
  readonly vehicle: VehicleMountSystem;
  readonly grapple: GrappleHookSystem;
  readonly time: TimeMechanicsSystem;
  readonly crafting: CraftingSystem;
  readonly companion: CompanionSystem;
  readonly loadout: WeaponLoadoutSystem;
  readonly cover: CoverPeekingSystem;
  readonly explosives: ExplosivesSystem;
  readonly killstreaks: KillstreakSystem;
  readonly bonfire: BonfireCheckpointSystem;
  readonly flasks: EstusFlaskSystem;
  readonly bloodstain: BloodstainSystem;
  readonly posture: PostureVisceralSystem;
  readonly twoAxisCombat: TwoAxisCombatSystem;
  readonly storm: ShrinkingStormSystem;
  readonly flight: SuperheroFlightMotor;
  readonly deformableGround: DeformableGroundSystem;
  readonly combatDirector: AnimeCombatDirector;
  readonly meshSlicing: MeshSlicingSystem;
  readonly city: ProceduralCityDirector;

  // GTA & City Systems
  readonly traffic: TrafficSimulationSystem;
  readonly civilian: CivilianPopulationSystem;
  readonly wanted: WantedCrimeSystem;
  readonly police: PoliceResponseSystem;
  readonly vehicleTheft: VehicleTheftSystem;
  readonly escort: EscortMissionSystem;
  readonly radar: MinimapRadarSystem;
  readonly spaceship: SpaceshipFlightSystem;

  // Phone & Social Systems
  readonly phoneShell: PhoneShellSystem;
  readonly messaging: PhoneMessagingSystem;
  readonly socialEncounter: SocialEncounterSystem;
  readonly locationVisits: LocationVisitSystem;

  // Zombie Survival Systems
  readonly zombieHorde: ZombieHordeAISystem;
  readonly barricades: BarricadeBoardingSystem;
  readonly mysteryBox: MysteryBoxSystem;
  readonly perkVending: PerkVendingSystem;
  readonly packAPunch: PackAPunchSystem;
  readonly infection: InfectionImmunitySystem;
  readonly powerGrid: PowerGridDoorsSystem;
  readonly zombiePowerups: ZombiePowerupDropsSystem;
  readonly wonderWeapons: ZombieWonderWeaponsSystem;
  readonly zombieBosses: ZombieBossEncounterSystem;
  readonly zombieBuildables: ZombieBuildablesSystem;
  readonly easterEggQuest: ZombieEasterEggQuestSystem;
  readonly gobbleGums: GobbleGumSystem;
  readonly hellhounds: HellhoundSpecialRoundSystem;

  private systems!: Record<GameplayFeatureId, any>;
  private readonly initialConfigs = new Map<GameplayFeatureId, Record<string, unknown>>();
  private readonly initialRuntime = new Map<GameplayFeatureId, Record<string, unknown>>();

  constructor(private readonly engine: Engine) {
    (this.engine as any).gameplayFeatures = this;
    this.wallet = gameplayWallet(engine);
    // Instantiate all feature subsystems with default configurations
    this.targetLock = new TargetLockSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('target_lock'));
    this.hitboxes = new TimedHitboxSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('timed_hitboxes'));
    this.combo = new ComboSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('combo_system'));
    this.defense = new DodgeGuardStaminaSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('dodge_guard_stamina'));
    this.hitReactions = new HitReactionSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('hit_reactions'));
    this.abilities = new AbilityElementalSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('abilities_magic'));
    this.encounterAI = new EncounterAISystem(engine, GameplayFeatureRegistry.getInactiveDefaults('enemy_boss_ai'));
    this.stats = new StatsProgressionSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('stats_progression'));
    this.arena = new ArenaWaveSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('arena_flow'));
    this.stealth = new StealthSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('stealth_detection'));
    this.parkour = new ParkourSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('parkour_traversal'));
    this.loot = new LootInventorySystem(engine, GameplayFeatureRegistry.getInactiveDefaults('loot_inventory'));
    this.dialogue = new DialogueSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('dialogue_system'));
    this.ranged = new RangedShooterSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('ranged_shooter'));
    this.vehicle = new VehicleMountSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('vehicle_mount'));
    this.grapple = new GrappleHookSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('grapple_swing'));
    this.time = new TimeMechanicsSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('time_mechanics'));
    this.crafting = new CraftingSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('crafting_gathering'));
    this.companion = new CompanionSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('companion_summon'));
    this.loadout = new WeaponLoadoutSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('weapon_wheel_loadout'));
    this.cover = new CoverPeekingSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('cover_peeking'));
    this.explosives = new ExplosivesSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('ballistics_explosives'));
    this.killstreaks = new KillstreakSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('killstreaks_rewards'));
    this.bonfire = new BonfireCheckpointSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('bonfire_checkpoint'));
    this.flasks = new EstusFlaskSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('estus_flask_healing'));
    this.bloodstain = new BloodstainSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('bloodstain_souls'));
    this.posture = new PostureVisceralSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('posture_visceral'));
    this.twoAxisCombat = new TwoAxisCombatSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('two_axis_combat'));
    this.storm = new ShrinkingStormSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('shrinking_storm'));
    this.flight = new SuperheroFlightMotor(GameplayFeatureRegistry.getInactiveDefaults('superhero_flight_system'));
    this.deformableGround = new DeformableGroundSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('deformable_ground'));
    this.combatDirector = new AnimeCombatDirector(engine, GameplayFeatureRegistry.getInactiveDefaults('anime_combat_director'));
    this.meshSlicing = new MeshSlicingSystem(engine);
    this.city = new ProceduralCityDirector(engine, GameplayFeatureRegistry.getInactiveDefaults('procedural_city_generator'));

    // GTA Systems
    this.traffic = new TrafficSimulationSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('traffic_simulation'));
    this.civilian = new CivilianPopulationSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('civilian_population'));
    this.wanted = new WantedCrimeSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('wanted_crime'));
    this.police = new PoliceResponseSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('police_response'));
    this.vehicleTheft = new VehicleTheftSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('vehicle_theft'));
    this.escort = new EscortMissionSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('escort_missions'));
    this.radar = new MinimapRadarSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('minimap_radar'));
    this.spaceship = new SpaceshipFlightSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('spaceship_flight'));

    // Phone & Social Systems
    this.phoneShell = new PhoneShellSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('phone_shell'));
    this.messaging = new PhoneMessagingSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('phone_messaging'));
    this.socialEncounter = new SocialEncounterSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('social_encounter'));
    this.locationVisits = new LocationVisitSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('location_visits'));

    // Zombie Survival Systems
    this.zombieHorde = new ZombieHordeAISystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_horde_ai'));
    this.barricades = new BarricadeBoardingSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('barricade_boarding'));
    this.mysteryBox = new MysteryBoxSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('mystery_box_gambling'));
    this.perkVending = new PerkVendingSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('perk_vending_machines'));
    this.packAPunch = new PackAPunchSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('pack_a_punch_upgrade'));
    this.infection = new InfectionImmunitySystem(engine, GameplayFeatureRegistry.getInactiveDefaults('infection_immunity_meter'));
    this.powerGrid = new PowerGridDoorsSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('power_grid_doors'));
    this.zombiePowerups = new ZombiePowerupDropsSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_powerups_drops'));
    this.wonderWeapons = new ZombieWonderWeaponsSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_wonder_weapons'));
    this.zombieBosses = new ZombieBossEncounterSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_boss_encounters'));
    this.zombieBuildables = new ZombieBuildablesSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_craftable_traps'));
    this.easterEggQuest = new ZombieEasterEggQuestSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_easter_egg_quest'));
    this.gobbleGums = new GobbleGumSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_gobs_elixirs'));
    this.hellhounds = new HellhoundSpecialRoundSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('zombie_hellhounds_round'));

    this.pause = new PauseMenuSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('pause_menu'));
    this.settings = new GameSettingsSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('game_settings'));
    this.objectives = new ObjectiveTrackerSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('objective_tracker'));
    this.notifications = new NotificationsSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('game_notifications'));
    this.session = new SessionFlowSystem(engine, GameplayFeatureRegistry.getInactiveDefaults('session_flow'));

    this.systems = {
      pause_menu: this.pause,
      game_settings: this.settings,
      objective_tracker: this.objectives,
      game_notifications: this.notifications,
      session_flow: this.session,
      target_lock: this.targetLock,
      timed_hitboxes: this.hitboxes,
      combo_system: this.combo,
      dodge_guard_stamina: this.defense,
      hit_reactions: this.hitReactions,
      abilities_magic: this.abilities,
      enemy_boss_ai: this.encounterAI,
      stats_progression: this.stats,
      arena_flow: this.arena,
      stealth_detection: this.stealth,
      parkour_traversal: this.parkour,
      loot_inventory: this.loot,
      dialogue_system: this.dialogue,
      ranged_shooter: this.ranged,
      vehicle_mount: this.vehicle,
      grapple_swing: this.grapple,
      time_mechanics: this.time,
      crafting_gathering: this.crafting,
      companion_summon: this.companion,
      weapon_wheel_loadout: this.loadout,
      cover_peeking: this.cover,
      ballistics_explosives: this.explosives,
      killstreaks_rewards: this.killstreaks,
      bonfire_checkpoint: this.bonfire,
      estus_flask_healing: this.flasks,
      bloodstain_souls: this.bloodstain,
      posture_visceral: this.posture,
      two_axis_combat: this.twoAxisCombat,
      shrinking_storm: this.storm,
      superhero_flight_system: this.flight,
      deformable_ground: this.deformableGround,
      anime_combat_director: this.combatDirector,
      procedural_city_generator: this.city,
      traffic_simulation: this.traffic,
      civilian_population: this.civilian,
      wanted_crime: this.wanted,
      police_response: this.police,
      vehicle_theft: this.vehicleTheft,
      escort_missions: this.escort,
      minimap_radar: this.radar,
      spaceship_flight: this.spaceship,
      phone_shell: this.phoneShell,
      phone_messaging: this.messaging,
      social_encounter: this.socialEncounter,
      location_visits: this.locationVisits,
      zombie_horde_ai: this.zombieHorde,
      barricade_boarding: this.barricades,
      mystery_box_gambling: this.mysteryBox,
      perk_vending_machines: this.perkVending,
      pack_a_punch_upgrade: this.packAPunch,
      infection_immunity_meter: this.infection,
      power_grid_doors: this.powerGrid,
      zombie_powerups_drops: this.zombiePowerups,
      zombie_wonder_weapons: this.wonderWeapons,
      zombie_boss_encounters: this.zombieBosses,
      zombie_craftable_traps: this.zombieBuildables,
      zombie_easter_egg_quest: this.easterEggQuest,
      zombie_gobs_elixirs: this.gobbleGums,
      zombie_hellhounds_round: this.hellhounds,
    } satisfies Record<GameplayFeatureId, unknown>;

    for (const { id } of GameplayFeatureRegistry.list()) {
      const system = this.getSystem(id) as any;
      this.initialConfigs.set(id, JSON.parse(JSON.stringify(system.getConfig())));
      if (system.toJSON && system.fromJSON) this.initialRuntime.set(id, JSON.parse(JSON.stringify(system.toJSON())));
    }

    // Enable core gameplay systems by default
    this.enableFeature('target_lock');
    this.enableFeature('timed_hitboxes');
    this.enableFeature('combo_system');
    this.enableFeature('dodge_guard_stamina');
    this.enableFeature('hit_reactions');
    this.enableFeature('abilities_magic');
    this.enableFeature('enemy_boss_ai');
    this.enableFeature('stats_progression');
    this.enableFeature('arena_flow');
    this.enableFeature('stealth_detection');
    this.enableFeature('parkour_traversal');
    this.enableFeature('loot_inventory');
    this.enableFeature('dialogue_system');
    this.enableFeature('deformable_ground');
    this.enableFeature('anime_combat_director');
    this.enableFeature('ranged_shooter');
    this.enableFeature('vehicle_mount');
    this.enableFeature('grapple_swing');
    this.enableFeature('time_mechanics');
    this.enableFeature('crafting_gathering');
    this.enableFeature('companion_summon');
    this.enableFeature('weapon_wheel_loadout');
    this.enableFeature('cover_peeking');
    this.enableFeature('ballistics_explosives');
    this.enableFeature('killstreaks_rewards');
    this.enableFeature('bonfire_checkpoint');
    this.enableFeature('estus_flask_healing');
    this.enableFeature('bloodstain_souls');
    this.enableFeature('posture_visceral');
    this.enableFeature('two_axis_combat');
    this.enableFeature('shrinking_storm');
    this.enableFeature('superhero_flight_system');
    this.enableFeature('pause_menu');
    this.enableFeature('game_settings');
    this.enableFeature('objective_tracker');
    this.enableFeature('game_notifications');
    this.enableFeature('session_flow');
    this.generalUI = new GeneralGameplayUI(engine, this);
    this.zombieHUD = new ZombieSurvivalHUD(engine, this);
  }

  isFeatureEnabled(id: GameplayFeatureId): boolean {
    return this.getSystem(id)?.getConfig().enabled === true;
  }

  enableFeature(id: GameplayFeatureId): boolean {
    const descriptor = GameplayFeatureRegistry.get(id);
    if (!descriptor || !this.getSystem(id)) return false;
    for (const dependency of descriptor.requires ?? []) this.enableFeature(dependency);
    const sys = this.getSystem(id);
    if (sys && 'setConfig' in sys) {
      sys.setConfig({ enabled: true } as any);
    }
    this.notifyChanged();
    return this.isFeatureEnabled(id);
  }

  disableFeature(id: GameplayFeatureId): boolean {
    if (!GameplayFeatureRegistry.get(id) || !this.getSystem(id)) return false;
    const sys = this.getSystem(id);
    if (sys && 'setConfig' in sys) {
      sys.setConfig({ enabled: false } as any);
    }
    this.notifyChanged();
    return !this.isFeatureEnabled(id);
  }

  toggleFeature(id: GameplayFeatureId): boolean {
    if (this.isFeatureEnabled(id)) {
      this.disableFeature(id);
      return false;
    } else {
      return this.enableFeature(id);
    }
  }

  enableAllFeatures(): void {
    const list = GameplayFeatureRegistry.list();
    for (const desc of list) {
      this.enableFeature(desc.id);
    }
  }

  disableAllFeatures(): void {
    const list = GameplayFeatureRegistry.list();
    for (const desc of list) {
      this.disableFeature(desc.id);
    }
  }

  getSystem(id: 'pause_menu'): PauseMenuSystem;
  getSystem(id: 'game_settings'): GameSettingsSystem;
  getSystem(id: 'objective_tracker'): ObjectiveTrackerSystem;
  getSystem(id: 'game_notifications'): NotificationsSystem;
  getSystem(id: 'session_flow'): SessionFlowSystem;
  getSystem(id: 'target_lock'): TargetLockSystem;
  getSystem(id: 'timed_hitboxes'): TimedHitboxSystem;
  getSystem(id: 'combo_system'): ComboSystem;
  getSystem(id: 'dodge_guard_stamina'): DodgeGuardStaminaSystem;
  getSystem(id: 'hit_reactions'): HitReactionSystem;
  getSystem(id: 'abilities_magic'): AbilityElementalSystem;
  getSystem(id: 'enemy_boss_ai'): EncounterAISystem;
  getSystem(id: 'stats_progression'): StatsProgressionSystem;
  getSystem(id: 'arena_flow'): ArenaWaveSystem;
  getSystem(id: 'stealth_detection'): StealthSystem;
  getSystem(id: 'parkour_traversal'): ParkourSystem;
  getSystem(id: 'loot_inventory'): LootInventorySystem;
  getSystem(id: 'dialogue_system'): DialogueSystem;
  getSystem(id: 'ranged_shooter'): RangedShooterSystem;
  getSystem(id: 'vehicle_mount'): VehicleMountSystem;
  getSystem(id: 'grapple_swing'): GrappleHookSystem;
  getSystem(id: 'time_mechanics'): TimeMechanicsSystem;
  getSystem(id: 'crafting_gathering'): CraftingSystem;
  getSystem(id: 'companion_summon'): CompanionSystem;
  getSystem(id: 'weapon_wheel_loadout'): WeaponLoadoutSystem;
  getSystem(id: 'cover_peeking'): CoverPeekingSystem;
  getSystem(id: 'ballistics_explosives'): ExplosivesSystem;
  getSystem(id: 'killstreaks_rewards'): KillstreakSystem;
  getSystem(id: 'bonfire_checkpoint'): BonfireCheckpointSystem;
  getSystem(id: 'estus_flask_healing'): EstusFlaskSystem;
  getSystem(id: 'bloodstain_souls'): BloodstainSystem;
  getSystem(id: 'posture_visceral'): PostureVisceralSystem;
  getSystem(id: 'two_axis_combat'): TwoAxisCombatSystem;
  getSystem(id: 'shrinking_storm'): ShrinkingStormSystem;
  getSystem(id: 'superhero_flight_system'): SuperheroFlightMotor;
  getSystem(id: 'deformable_ground'): DeformableGroundSystem;
  getSystem(id: 'anime_combat_director'): AnimeCombatDirector;
  getSystem(id: 'procedural_city_generator'): ProceduralCityDirector;
  getSystem(id: 'traffic_simulation'): TrafficSimulationSystem;
  getSystem(id: 'civilian_population'): CivilianPopulationSystem;
  getSystem(id: 'wanted_crime'): WantedCrimeSystem;
  getSystem(id: 'police_response'): PoliceResponseSystem;
  getSystem(id: 'vehicle_theft'): VehicleTheftSystem;
  getSystem(id: 'escort_missions'): EscortMissionSystem;
  getSystem(id: 'minimap_radar'): MinimapRadarSystem;
  getSystem(id: 'spaceship_flight'): SpaceshipFlightSystem;
  getSystem(id: 'phone_shell'): PhoneShellSystem;
  getSystem(id: 'phone_messaging'): PhoneMessagingSystem;
  getSystem(id: 'social_encounter'): SocialEncounterSystem;
  getSystem(id: 'location_visits'): LocationVisitSystem;
  getSystem(id: 'zombie_horde_ai'): ZombieHordeAISystem;
  getSystem(id: 'barricade_boarding'): BarricadeBoardingSystem;
  getSystem(id: 'mystery_box_gambling'): MysteryBoxSystem;
  getSystem(id: 'perk_vending_machines'): PerkVendingSystem;
  getSystem(id: 'pack_a_punch_upgrade'): PackAPunchSystem;
  getSystem(id: 'infection_immunity_meter'): InfectionImmunitySystem;
  getSystem(id: 'power_grid_doors'): PowerGridDoorsSystem;
  getSystem(id: 'zombie_powerups_drops'): ZombiePowerupDropsSystem;
  getSystem(id: 'zombie_wonder_weapons'): ZombieWonderWeaponsSystem;
  getSystem(id: 'zombie_boss_encounters'): ZombieBossEncounterSystem;
  getSystem(id: 'zombie_craftable_traps'): ZombieBuildablesSystem;
  getSystem(id: 'zombie_easter_egg_quest'): ZombieEasterEggQuestSystem;
  getSystem(id: 'zombie_gobs_elixirs'): GobbleGumSystem;
  getSystem(id: 'zombie_hellhounds_round'): HellhoundSpecialRoundSystem;
  getSystem(id: GameplayFeatureId): any;
  getSystem(id: GameplayFeatureId): any {
    return this.systems[id];
  }

  configureFeature<K extends GameplayFeatureId>(id: K, config: Partial<GameplayFeatureConfigMap[K]>): void {
    const sys = this.getSystem(id);
    const descriptor = GameplayFeatureRegistry.get(id);
    if (!sys || !descriptor) throw new Error(`Unknown gameplay feature: ${id}`);
    validateFeatureConfig({ ...descriptor, defaultConfig: { ...this.initialConfigs.get(id), ...descriptor.defaultConfig as object } }, config);
    if (sys && 'setConfig' in sys) {
      sys.setConfig(JSON.parse(JSON.stringify(config)) as any);
    }
    if (config.enabled) for (const dependency of descriptor.requires ?? []) this.enableFeature(dependency);
    this.notifyChanged();
  }

  /** Explicit administrative reset, distinct from a temporary feature disable. */
  resetFeature(id: GameplayFeatureId): void {
    const system = this.getSystem(id);
    if (!system || !GameplayFeatureRegistry.get(id)) throw new Error(`Unknown gameplay feature: ${id}`);
    const enabled = this.isFeatureEnabled(id);
    system.setConfig({ ...this.initialConfigs.get(id), ...GameplayFeatureRegistry.getInactiveDefaults<any>(id) });
    const initial = this.initialRuntime.get(id);
    if (initial && system.fromJSON) system.fromJSON(JSON.parse(JSON.stringify(initial)));
    if (enabled) this.enableFeature(id);
    this.notifyChanged();
  }

  applyPreset(presetName: GameplayPreset): GameplayFeatureId[] {
    if (!GAMEPLAY_PRESETS.includes(presetName)) throw new Error(`Unknown gameplay preset: ${presetName}`);
    this.disableAllFeatures();
    for (const { id } of GameplayFeatureRegistry.list()) this.resetFeature(id);
    this.addPreset(presetName);
    return GameplayFeatureRegistry.list().filter(d => this.isFeatureEnabled(d.id)).map(d => d.id);
  }

  /** Explicit composition; unlike applyPreset this keeps existing features. */
  addPreset(presetName: GameplayPreset): void {
    if (!GAMEPLAY_PRESETS.includes(presetName)) throw new Error(`Unknown gameplay preset: ${presetName}`);
    if (presetName === 'zombie_ultimate_experience') {
      this.addPreset('zombie_nazi_survival');
      this.enableFeature('infection_immunity_meter');
      this.enableFeature('zombie_wonder_weapons');
      this.enableFeature('zombie_boss_encounters');
      this.enableFeature('zombie_craftable_traps');
      this.enableFeature('zombie_easter_egg_quest');
      this.enableFeature('zombie_gobs_elixirs');
      this.enableFeature('zombie_hellhounds_round');
      return;
    }
    if (presetName === 'zombie_survival' || presetName === 'fps_zombies' || presetName === 'zombie_nazi_survival' || presetName === 'zombie_arcade_frenzy') {
      this.addPreset('fps_starter');
      this.enableFeature('zombie_horde_ai');
      this.enableFeature('barricade_boarding');
      this.enableFeature('mystery_box_gambling');
      this.enableFeature('perk_vending_machines');
      this.enableFeature('pack_a_punch_upgrade');
      this.enableFeature('power_grid_doors');
      this.enableFeature('zombie_powerups_drops');
      this.configureFeature('zombie_horde_ai', { enabled: true, mode: 'waves' });
      this.zombieHorde.startWave(0);
      return;
    }
    if (presetName === 'zombie_outbreak_rpg') {
      this.addPreset('fps_starter');
      this.enableFeature('zombie_horde_ai');
      this.enableFeature('infection_immunity_meter');
      this.enableFeature('crafting_gathering');
      this.enableFeature('loot_inventory');
      this.configureFeature('zombie_horde_ai', { enabled: true, mode: 'open_world_wandering' });
      return;
    }
    if (presetName === 'fps_starter') {
      this.addPreset('shooter');
      this.configureFeature('ranged_shooter', { enabled: true, weapons: createFpsStarterWeapons(), defaultWeapon: 'fps_ak47', showViewModel: true });
      this.configureFeature('weapon_wheel_loadout', { enabled: true, slots: createFpsStarterSlots() });
      this.configureFeature('ballistics_explosives', { enabled: true, grenades: createFpsStarterGrenades() });
      this.loadout.selectSlot(1);
      return;
    }
    if (presetName === 'essentials') {
      this.enableFeature('pause_menu');
      this.enableFeature('game_settings');
      this.enableFeature('objective_tracker');
      this.enableFeature('game_notifications');
      this.enableFeature('session_flow');
      return;
    }
    if (presetName === 'defaults') {
      const list = GameplayFeatureRegistry.list();
      for (const desc of list) {
        this.configureFeature(desc.id, GameplayFeatureRegistry.getDefaults(desc.id));
        this.enableFeature(desc.id);
      }
      return;
    }

    if (presetName === 'gta_full_open_world' || presetName === 'gta_open_world') {
      this.enableFeature('procedural_city_generator');
      this.enableFeature('vehicle_mount');
      this.enableFeature('ranged_shooter');
      this.enableFeature('weapon_wheel_loadout');
      this.enableFeature('parkour_traversal');
      this.enableFeature('traffic_simulation');
      this.enableFeature('civilian_population');
      this.enableFeature('wanted_crime');
      this.enableFeature('police_response');
      this.enableFeature('vehicle_theft');
      this.enableFeature('escort_missions');
      this.enableFeature('minimap_radar');
      this.enableFeature('spaceship_flight');
      this.enableFeature('phone_shell');
      this.enableFeature('phone_messaging');
      this.enableFeature('social_encounter');
      this.enableFeature('location_visits');
      this.city.loadBlueprint('GTA_Los_Santos');
      return;
    }

    if (presetName === 'city_builder') {
      this.enableFeature('procedural_city_generator');
      this.city.generateWorld();
      return;
    }

    if (presetName === 'souls' || presetName === 'action' || presetName === 'anime') {
      for (const id of ['target_lock', 'timed_hitboxes', 'combo_system', 'dodge_guard_stamina', 'hit_reactions', 'abilities_magic', 'enemy_boss_ai', 'stats_progression'] as GameplayFeatureId[]) this.enableFeature(id);
    }
    if (presetName === 'anime') {
      this.enableFeature('two_axis_combat');
      this.enableFeature('superhero_flight_system');
      this.enableFeature('anime_combat_director');
      this.enableFeature('deformable_ground');
      this.configureFeature('dodge_guard_stamina', { maxStamina: 180, dodgeStaminaCost: 10, staminaRegenRate: 60 });
      this.configureFeature('combo_system', { inputBufferDuration: 0.45, comboResetDelay: 3 });
      this.configureFeature('hit_reactions', { defaultPoise: 30, juggleDamageMultiplier: 1.75 });
      this.configureFeature('two_axis_combat', { maxKi: 150, kiChargeRate: 40 });
      return;
    }
    if (presetName === 'souls') {
      this.configureFeature('dodge_guard_stamina', {
        maxStamina: 100,
        dodgeStaminaCost: 25,
        staminaRegenRate: 22,
        parryWindowDuration: 0.12,
        dodgeIframesDuration: 0.22,
      });
      this.configureFeature('combo_system', {
        inputBufferDuration: 0.25,
        comboResetDelay: 1.0,
      });
      this.configureFeature('hit_reactions', {
        defaultPoise: 80,
        poiseRegenRate: 15,
      });
      this.enableFeature('bonfire_checkpoint');
      this.enableFeature('estus_flask_healing');
      this.enableFeature('bloodstain_souls');
      this.enableFeature('posture_visceral');
    } else if (presetName === 'action') {
      this.configureFeature('dodge_guard_stamina', {
        maxStamina: 150,
        dodgeStaminaCost: 12,
        staminaRegenRate: 50,
        parryWindowDuration: 0.25,
        dodgeIframesDuration: 0.35,
      });
      this.configureFeature('combo_system', {
        inputBufferDuration: 0.45,
        comboResetDelay: 2.0,
      });
      this.configureFeature('hit_reactions', {
        defaultPoise: 40,
        juggleDamageMultiplier: 1.5,
      });
    } else if (presetName === 'shooter') {
      this.enableFeature('ranged_shooter');
      this.enableFeature('weapon_wheel_loadout');
      this.enableFeature('cover_peeking');
      this.enableFeature('ballistics_explosives');
      this.enableFeature('killstreaks_rewards');
    }
  }

  updateRealtime(dt: number): void {
    if (this.isFeatureEnabled('ranged_shooter')) this.ranged.updatePresentation();
    this.pause.update();
    this.notifications.update(dt);
    this.generalUI.update();
  }

  update(dt: number): void {
    if (this.pause.isPaused) return;
    this.session.update(dt);
    if (this.pause.isPaused) return;
    const playerEntityId = this.engine.player.getPossessedId();
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const asm = playerRb ? this.engine.findAnimationStateMachine(playerRb) : null;

    if (this.isFeatureEnabled('target_lock')) this.targetLock.update(dt);
    if (this.isFeatureEnabled('timed_hitboxes')) this.hitboxes.update(dt);
    if (this.isFeatureEnabled('combo_system')) this.combo.update(dt, asm);
    if (this.isFeatureEnabled('dodge_guard_stamina')) this.defense.update(dt, asm);
    if (this.isFeatureEnabled('hit_reactions')) this.hitReactions.update(dt);
    if (this.isFeatureEnabled('abilities_magic')) this.abilities.update(dt);
    if (this.isFeatureEnabled('enemy_boss_ai')) this.encounterAI.update(dt);
    if (this.isFeatureEnabled('arena_flow')) this.arena.update(dt);
    if (this.isFeatureEnabled('stealth_detection')) this.stealth.update(dt);
    if (this.isFeatureEnabled('parkour_traversal')) this.parkour.update(dt);
    if (this.isFeatureEnabled('loot_inventory')) this.loot.update(dt);
    if (this.isFeatureEnabled('dialogue_system')) this.dialogue.update(dt);
    if (this.isFeatureEnabled('ranged_shooter')) this.ranged.update(dt);
    if (this.isFeatureEnabled('grapple_swing')) this.grapple.update(dt);
    if (this.isFeatureEnabled('time_mechanics')) this.time.update(this.engine.time?.wallClockDt ?? dt);
    if (this.isFeatureEnabled('crafting_gathering')) this.crafting.update(dt);
    if (this.isFeatureEnabled('companion_summon')) this.companion.update(dt);
    if (this.isFeatureEnabled('weapon_wheel_loadout')) this.loadout.update(dt);
    if (this.isFeatureEnabled('cover_peeking')) this.cover.update(dt);
    if (this.isFeatureEnabled('ballistics_explosives')) this.explosives.update(dt);
    if (this.isFeatureEnabled('killstreaks_rewards')) this.killstreaks.update(dt);
    if (this.isFeatureEnabled('bonfire_checkpoint')) this.bonfire.update(dt);
    if (this.isFeatureEnabled('estus_flask_healing')) this.flasks.update(dt);
    if (this.isFeatureEnabled('bloodstain_souls')) this.bloodstain.update(dt);
    if (this.isFeatureEnabled('posture_visceral')) this.posture.update(dt);
    if (this.isFeatureEnabled('two_axis_combat')) this.twoAxisCombat.update(dt);
    if (this.isFeatureEnabled('anime_combat_director')) this.combatDirector.update(dt);
    if (this.isFeatureEnabled('shrinking_storm')) {
      const playerPos = (playerRb as any)?.mesh?.position ?? this.engine.viewport?.camera?.position;
      this.storm.update(dt, playerPos);
    }

    // GTA & Open World Simulation Loops
    if (this.isFeatureEnabled('traffic_simulation')) this.traffic.update(dt);
    if (this.isFeatureEnabled('civilian_population')) this.civilian.update(dt);
    if (this.isFeatureEnabled('wanted_crime')) this.wanted.update(dt, this.vehicle.isMounted);
    if (this.isFeatureEnabled('police_response')) this.police.update(dt, this.wanted.getWantedLevel(), this.vehicle.isMounted);
    if (this.isFeatureEnabled('escort_missions')) this.escort.update(dt);
    if (this.isFeatureEnabled('phone_messaging')) this.messaging.update(dt);

    // Zombie Survival Loops
    if (this.isFeatureEnabled('zombie_horde_ai')) this.zombieHorde.update(dt);
    if (this.isFeatureEnabled('mystery_box_gambling')) this.mysteryBox.update(dt);
    if (this.isFeatureEnabled('perk_vending_machines')) this.perkVending.update(dt);
    if (this.isFeatureEnabled('pack_a_punch_upgrade')) this.packAPunch.update(dt);
    if (this.isFeatureEnabled('infection_immunity_meter')) this.infection.update(dt);
    if (this.isFeatureEnabled('power_grid_doors')) this.powerGrid.update(dt);
    if (this.isFeatureEnabled('zombie_powerups_drops')) this.zombiePowerups.update(dt);
    if (this.isFeatureEnabled('zombie_wonder_weapons')) this.wonderWeapons.update(dt);
    if (this.isFeatureEnabled('zombie_boss_encounters')) this.zombieBosses.update(dt);
    if (this.isFeatureEnabled('zombie_craftable_traps')) this.zombieBuildables.update(dt);
    if (this.isFeatureEnabled('zombie_easter_egg_quest')) this.easterEggQuest.update(dt);
    if (this.isFeatureEnabled('zombie_gobs_elixirs')) this.gobbleGums.update(dt);
    if (this.isFeatureEnabled('zombie_hellhounds_round')) this.hellhounds.update(dt);
  }

  dispose(): void {
    this.generalUI.dispose();
    this.zombieHUD?.dispose?.();
    this.disableAllFeatures();
    for (const { id } of GameplayFeatureRegistry.list()) this.getSystem(id).dispose?.();
  }

  private notifyChanged(): void {
    this.zombieHUD?.update?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mix:gameplay-features-changed'));
    }
  }

  toJSON(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      version: 2,
      runtime: Object.fromEntries(GameplayFeatureRegistry.list().flatMap(({ id }) => {
        const system = this.getSystem(id) as any;
        return system.toJSON && system.fromJSON ? [[id, system.toJSON()]] : [];
      })),
      activeFeatures: GameplayFeatureRegistry.list().filter(d => this.isFeatureEnabled(d.id)).map(d => d.id),
    };
    for (const { id } of GameplayFeatureRegistry.list()) data[id] = this.getSystem(id).getConfig();
    return JSON.parse(JSON.stringify(data));
  }

  validateSnapshot(data: any): void {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Gameplay snapshot must be an object');
    if (data.version !== undefined && data.version !== 2) throw new Error('Unsupported gameplay snapshot version');
    validateRuntimeSnapshot(data);
    for (const { id } of GameplayFeatureRegistry.list()) {
      const registered = GameplayFeatureRegistry.get(id)!;
      const descriptor = { ...registered, defaultConfig: { ...this.initialConfigs.get(id), ...registered.defaultConfig as object } };
      if (data[id]) validateFeatureConfig(descriptor, data[id]);
      const runtime = data.runtime?.[id];
      if (runtime) {
        validateFeatureRuntime(id, runtime);
        validateRuntimeSnapshot(runtime, this.initialRuntime.get(id), id);
        // Older subsystem serializers include configuration fields in their runtime payload.
        const configFields = Object.fromEntries(Object.entries(runtime).filter(([key]) => Object.hasOwn(descriptor.defaultConfig as object, key)));
        // Barricade runtime records are not authored barricade definitions.
        if (id === 'barricade_boarding') delete configFields.barricades;
        validateFeatureConfig(descriptor, configFields);
      }
    }
  }

  fromJSON(data: any): void {
    if (!data || typeof data !== 'object') return;
    this.validateSnapshot(data);
    const active = Array.isArray(data.activeFeatures) ? new Set(data.activeFeatures) : null;
    for (const { id } of GameplayFeatureRegistry.list()) {
      const config = data[id];
      if (config && typeof config === 'object' && !Array.isArray(config)) this.configureFeature(id, config);
      const system = this.getSystem(id) as any;
      const runtime = data.runtime?.[id];
      if (runtime && system.fromJSON) {
        const baseline = this.initialRuntime.get(id);
        if (baseline) system.fromJSON(JSON.parse(JSON.stringify(baseline)));
        system.fromJSON(JSON.parse(JSON.stringify(runtime)));
      }
      if (active && !active.has(id)) system.setConfig({ enabled: false });
    }
    if (active) for (const { id } of GameplayFeatureRegistry.list()) {
      const system = this.getSystem(id);
      if (system.getConfig().enabled !== active.has(id)) system.setConfig({ enabled: active.has(id) });
    }
    this.settings.initialize();
    this.notifyChanged();
  }
}
