import type { Engine } from '../../engine/Engine';
import { createFpsStarterWeapons, createFpsStarterSlots, createFpsStarterGrenades } from '../../content/FpsStarterPack';
import type {
  GameplayFeatureConfigMap,
  GameplayFeatureId,
} from './types';
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

  private readonly activeFeatures = new Set<GameplayFeatureId>();

  constructor(private readonly engine: Engine) {
    (this.engine as any).gameplayFeatures = this;
    // Instantiate all feature subsystems with default configurations
    this.targetLock = new TargetLockSystem(engine, GameplayFeatureRegistry.getDefaults('target_lock'));
    this.hitboxes = new TimedHitboxSystem(engine, GameplayFeatureRegistry.getDefaults('timed_hitboxes'));
    this.combo = new ComboSystem(engine, GameplayFeatureRegistry.getDefaults('combo_system'));
    this.defense = new DodgeGuardStaminaSystem(engine, GameplayFeatureRegistry.getDefaults('dodge_guard_stamina'));
    this.hitReactions = new HitReactionSystem(engine, GameplayFeatureRegistry.getDefaults('hit_reactions'));
    this.abilities = new AbilityElementalSystem(engine, GameplayFeatureRegistry.getDefaults('abilities_magic'));
    this.encounterAI = new EncounterAISystem(engine, GameplayFeatureRegistry.getDefaults('enemy_boss_ai'));
    this.stats = new StatsProgressionSystem(engine, GameplayFeatureRegistry.getDefaults('stats_progression'));
    this.arena = new ArenaWaveSystem(engine, GameplayFeatureRegistry.getDefaults('arena_flow'));
    this.stealth = new StealthSystem(engine, GameplayFeatureRegistry.getDefaults('stealth_detection'));
    this.parkour = new ParkourSystem(engine, GameplayFeatureRegistry.getDefaults('parkour_traversal'));
    this.loot = new LootInventorySystem(engine, GameplayFeatureRegistry.getDefaults('loot_inventory'));
    this.dialogue = new DialogueSystem(engine, GameplayFeatureRegistry.getDefaults('dialogue_system'));
    this.ranged = new RangedShooterSystem(engine, GameplayFeatureRegistry.getDefaults('ranged_shooter'));
    this.vehicle = new VehicleMountSystem(engine, GameplayFeatureRegistry.getDefaults('vehicle_mount'));
    this.grapple = new GrappleHookSystem(engine, GameplayFeatureRegistry.getDefaults('grapple_swing'));
    this.time = new TimeMechanicsSystem(engine, GameplayFeatureRegistry.getDefaults('time_mechanics'));
    this.crafting = new CraftingSystem(engine, GameplayFeatureRegistry.getDefaults('crafting_gathering'));
    this.companion = new CompanionSystem(engine, GameplayFeatureRegistry.getDefaults('companion_summon'));
    this.loadout = new WeaponLoadoutSystem(engine, GameplayFeatureRegistry.getDefaults('weapon_wheel_loadout'));
    this.cover = new CoverPeekingSystem(engine, GameplayFeatureRegistry.getDefaults('cover_peeking'));
    this.explosives = new ExplosivesSystem(engine, GameplayFeatureRegistry.getDefaults('ballistics_explosives'));
    this.killstreaks = new KillstreakSystem(engine, GameplayFeatureRegistry.getDefaults('killstreaks_rewards'));
    this.bonfire = new BonfireCheckpointSystem(engine, GameplayFeatureRegistry.getDefaults('bonfire_checkpoint'));
    this.flasks = new EstusFlaskSystem(engine, GameplayFeatureRegistry.getDefaults('estus_flask_healing'));
    this.bloodstain = new BloodstainSystem(engine, GameplayFeatureRegistry.getDefaults('bloodstain_souls'));
    this.posture = new PostureVisceralSystem(engine, GameplayFeatureRegistry.getDefaults('posture_visceral'));
    this.twoAxisCombat = new TwoAxisCombatSystem(engine, GameplayFeatureRegistry.getDefaults('two_axis_combat'));
    this.storm = new ShrinkingStormSystem(engine, GameplayFeatureRegistry.getDefaults('shrinking_storm'));
    this.flight = new SuperheroFlightMotor(GameplayFeatureRegistry.getDefaults('superhero_flight_system'));
    this.deformableGround = new DeformableGroundSystem(engine, GameplayFeatureRegistry.getDefaults('deformable_ground'));
    this.combatDirector = new AnimeCombatDirector(engine, GameplayFeatureRegistry.getDefaults('anime_combat_director'));
    this.meshSlicing = new MeshSlicingSystem(engine);
    this.city = new ProceduralCityDirector(engine, GameplayFeatureRegistry.getDefaults('procedural_city_generator'));

    // GTA Systems
    this.traffic = new TrafficSimulationSystem(engine, GameplayFeatureRegistry.getDefaults('traffic_simulation'));
    this.civilian = new CivilianPopulationSystem(engine, GameplayFeatureRegistry.getDefaults('civilian_population'));
    this.wanted = new WantedCrimeSystem(engine, GameplayFeatureRegistry.getDefaults('wanted_crime'));
    this.police = new PoliceResponseSystem(engine, GameplayFeatureRegistry.getDefaults('police_response'));
    this.vehicleTheft = new VehicleTheftSystem(engine, GameplayFeatureRegistry.getDefaults('vehicle_theft'));
    this.escort = new EscortMissionSystem(engine, GameplayFeatureRegistry.getDefaults('escort_missions'));
    this.radar = new MinimapRadarSystem(engine, GameplayFeatureRegistry.getDefaults('minimap_radar'));
    this.spaceship = new SpaceshipFlightSystem(engine, GameplayFeatureRegistry.getDefaults('spaceship_flight'));

    // Phone & Social Systems
    this.phoneShell = new PhoneShellSystem(engine, GameplayFeatureRegistry.getDefaults('phone_shell'));
    this.messaging = new PhoneMessagingSystem(engine, GameplayFeatureRegistry.getDefaults('phone_messaging'));
    this.socialEncounter = new SocialEncounterSystem(engine, GameplayFeatureRegistry.getDefaults('social_encounter'));
    this.locationVisits = new LocationVisitSystem(engine, GameplayFeatureRegistry.getDefaults('location_visits'));

    // Zombie Survival Systems
    this.zombieHorde = new ZombieHordeAISystem(engine, GameplayFeatureRegistry.getDefaults('zombie_horde_ai'));
    this.barricades = new BarricadeBoardingSystem(engine, GameplayFeatureRegistry.getDefaults('barricade_boarding'));
    this.mysteryBox = new MysteryBoxSystem(engine, GameplayFeatureRegistry.getDefaults('mystery_box_gambling'));
    this.perkVending = new PerkVendingSystem(engine, GameplayFeatureRegistry.getDefaults('perk_vending_machines'));
    this.packAPunch = new PackAPunchSystem(engine, GameplayFeatureRegistry.getDefaults('pack_a_punch_upgrade'));
    this.infection = new InfectionImmunitySystem(engine, GameplayFeatureRegistry.getDefaults('infection_immunity_meter'));
    this.powerGrid = new PowerGridDoorsSystem(engine, GameplayFeatureRegistry.getDefaults('power_grid_doors'));
    this.zombiePowerups = new ZombiePowerupDropsSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_powerups_drops'));
    this.wonderWeapons = new ZombieWonderWeaponsSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_wonder_weapons'));
    this.zombieBosses = new ZombieBossEncounterSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_boss_encounters'));
    this.zombieBuildables = new ZombieBuildablesSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_craftable_traps'));
    this.easterEggQuest = new ZombieEasterEggQuestSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_easter_egg_quest'));
    this.gobbleGums = new GobbleGumSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_gobs_elixirs'));
    this.hellhounds = new HellhoundSpecialRoundSystem(engine, GameplayFeatureRegistry.getDefaults('zombie_hellhounds_round'));

    this.pause = new PauseMenuSystem(engine, GameplayFeatureRegistry.getDefaults('pause_menu'));
    this.settings = new GameSettingsSystem(engine, GameplayFeatureRegistry.getDefaults('game_settings'));
    this.objectives = new ObjectiveTrackerSystem(engine, GameplayFeatureRegistry.getDefaults('objective_tracker'));
    this.notifications = new NotificationsSystem(engine, GameplayFeatureRegistry.getDefaults('game_notifications'));
    this.session = new SessionFlowSystem(engine, GameplayFeatureRegistry.getDefaults('session_flow'));

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

  enableFeature(id: GameplayFeatureId): void {
    if (!GameplayFeatureRegistry.get(id)) return;
    this.activeFeatures.add(id);
    const sys = this.getSystem(id);
    if (sys && 'setConfig' in sys) {
      sys.setConfig({ enabled: true } as any);
    }
    this.notifyChanged();
  }

  disableFeature(id: GameplayFeatureId): void {
    this.activeFeatures.delete(id);
    const sys = this.getSystem(id);
    if (sys && 'setConfig' in sys) {
      sys.setConfig({ enabled: false } as any);
    }
    this.notifyChanged();
  }

  toggleFeature(id: GameplayFeatureId): boolean {
    if (this.isFeatureEnabled(id)) {
      this.disableFeature(id);
      return false;
    } else {
      this.enableFeature(id);
      return true;
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
    switch (id) {
      case 'pause_menu': return this.pause;
      case 'game_settings': return this.settings;
      case 'objective_tracker': return this.objectives;
      case 'game_notifications': return this.notifications;
      case 'session_flow': return this.session;
      case 'target_lock': return this.targetLock;
      case 'timed_hitboxes': return this.hitboxes;
      case 'combo_system': return this.combo;
      case 'dodge_guard_stamina': return this.defense;
      case 'hit_reactions': return this.hitReactions;
      case 'abilities_magic': return this.abilities;
      case 'enemy_boss_ai': return this.encounterAI;
      case 'stats_progression': return this.stats;
      case 'arena_flow': return this.arena;
      case 'stealth_detection': return this.stealth;
      case 'parkour_traversal': return this.parkour;
      case 'loot_inventory': return this.loot;
      case 'dialogue_system': return this.dialogue;
      case 'ranged_shooter': return this.ranged;
      case 'vehicle_mount': return this.vehicle;
      case 'grapple_swing': return this.grapple;
      case 'time_mechanics': return this.time;
      case 'crafting_gathering': return this.crafting;
      case 'companion_summon': return this.companion;
      case 'weapon_wheel_loadout': return this.loadout;
      case 'cover_peeking': return this.cover;
      case 'ballistics_explosives': return this.explosives;
      case 'killstreaks_rewards': return this.killstreaks;
      case 'bonfire_checkpoint': return this.bonfire;
      case 'estus_flask_healing': return this.flasks;
      case 'bloodstain_souls': return this.bloodstain;
      case 'posture_visceral': return this.posture;
      case 'two_axis_combat': return this.twoAxisCombat;
      case 'shrinking_storm': return this.storm;
      case 'superhero_flight_system': return this.flight;
      case 'deformable_ground': return this.deformableGround;
      case 'anime_combat_director': return this.combatDirector;
      case 'procedural_city_generator': return this.city;
      case 'traffic_simulation': return this.traffic;
      case 'civilian_population': return this.civilian;
      case 'wanted_crime': return this.wanted;
      case 'police_response': return this.police;
      case 'vehicle_theft': return this.vehicleTheft;
      case 'escort_missions': return this.escort;
      case 'minimap_radar': return this.radar;
      case 'spaceship_flight': return this.spaceship;
      case 'phone_shell': return this.phoneShell;
      case 'phone_messaging': return this.messaging;
      case 'social_encounter': return this.socialEncounter;
      case 'location_visits': return this.locationVisits;
      case 'zombie_horde_ai': return this.zombieHorde;
      case 'barricade_boarding': return this.barricades;
      case 'mystery_box_gambling': return this.mysteryBox;
      case 'perk_vending_machines': return this.perkVending;
      case 'pack_a_punch_upgrade': return this.packAPunch;
      case 'infection_immunity_meter': return this.infection;
      case 'power_grid_doors': return this.powerGrid;
      case 'zombie_powerups_drops': return this.zombiePowerups;
      case 'zombie_wonder_weapons': return this.wonderWeapons;
      case 'zombie_boss_encounters': return this.zombieBosses;
      case 'zombie_craftable_traps': return this.zombieBuildables;
      case 'zombie_easter_egg_quest': return this.easterEggQuest;
      case 'zombie_gobs_elixirs': return this.gobbleGums;
      case 'zombie_hellhounds_round': return this.hellhounds;
    }
  }

  configureFeature<K extends GameplayFeatureId>(id: K, config: Partial<GameplayFeatureConfigMap[K]>): void {
    const sys = this.getSystem(id);
    if (!sys || !config || typeof config !== 'object') return;
    if (sys && 'setConfig' in sys) {
      sys.setConfig(JSON.parse(JSON.stringify(config)) as any);
    }
    if (config && 'enabled' in config) {
      if (config.enabled) this.activeFeatures.add(id);
      else this.activeFeatures.delete(id);
    }
    this.notifyChanged();
  }

  applyPreset(presetName: 'souls' | 'action' | 'shooter' | 'anime' | 'defaults' | 'essentials' | 'gta_open_world' | 'gta_full_open_world' | 'city_builder' | 'fps_starter' | 'zombie_survival' | 'fps_zombies' | 'zombie_nazi_survival' | 'zombie_outbreak_rpg' | 'zombie_arcade_frenzy' | 'zombie_ultimate_experience'): void {
    if (presetName === 'zombie_ultimate_experience') {
      this.applyPreset('zombie_nazi_survival');
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
      this.applyPreset('fps_starter');
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
      this.applyPreset('fps_starter');
      this.enableFeature('zombie_horde_ai');
      this.enableFeature('infection_immunity_meter');
      this.enableFeature('crafting_gathering');
      this.enableFeature('loot_inventory');
      this.configureFeature('zombie_horde_ai', { enabled: true, mode: 'open_world_wandering' });
      return;
    }
    if (presetName === 'fps_starter') {
      this.applyPreset('shooter');
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
    this.ranged.updatePresentation();
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
      activeFeatures: GameplayFeatureRegistry.list().filter(d => this.isFeatureEnabled(d.id)).map(d => d.id),
    };
    for (const { id } of GameplayFeatureRegistry.list()) data[id] = this.getSystem(id).getConfig();
    return JSON.parse(JSON.stringify(data));
  }

  fromJSON(data: any): void {
    if (!data || typeof data !== 'object') return;
    const active = Array.isArray(data.activeFeatures) ? new Set(data.activeFeatures) : null;
    for (const { id } of GameplayFeatureRegistry.list()) {
      const config = data[id];
      if (config && typeof config === 'object' && !Array.isArray(config)) this.configureFeature(id, config);
      if (active) this.configureFeature(id, { enabled: active.has(id) });
    }
    this.settings.initialize();
    this.notifyChanged();
  }
}
