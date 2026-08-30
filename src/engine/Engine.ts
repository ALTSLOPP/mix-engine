import * as THREE from 'three';
import { Time } from './Time';
import { InputManager } from './InputManager';
import { Viewport } from '../rendering/Viewport';
import { EditorCamera } from '../rendering/EditorCamera';
import { TransformGizmo } from '../rendering/TransformGizmo';
import { WorldOrigin } from '../streaming/WorldOrigin';
import { PhysicsWorld, type CollisionEvent } from '../physics/PhysicsWorld';
import { SceneManager, type EntityBlueprint } from '../ecs/SceneManager';
import { AssetCache } from '../animation/AssetCache';
import { AssetManifest } from '../animation/AssetManifest';
import { registerFpsStarterAssets } from '../content/FpsStarterPack';
import { AssetLoaderQueue } from '../animation/AssetLoaderQueue';
import { SemanticAssetRegistry } from '../assets/SemanticAssetRegistry';
import { ChunkManager } from '../streaming/ChunkManager';
import { AIBridge, type AICommand } from '../ai/AIBridge';
import { NavigationSystem } from '../ai/NavigationSystem';
import { CullingSystem } from '../rendering/CullingSystem';
import { LODSystem } from '../rendering/LODSystem';
import { CombatSystem } from '../ecs/CombatSystem';
import { WorkerAssetLoader } from '../streaming/WorkerAssetLoader';
import { RuntimeAssetImporter } from '../streaming/RuntimeAssetImporter';
import { VehicleSystem } from '../physics/VehicleSystem';
import type { AnimationStateMachine } from '../animation/AnimationStateMachine';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { TerrainSystem } from '../terrain/TerrainSystem';
import { DayNightCycle } from '../rendering/DayNightCycle';
import { CloudLayer } from '../rendering/CloudLayer';
import { WaterSystem } from '../water/WaterSystem';
import { WindSystem } from '../world/WindSystem';
import { FoliageSystem } from '../world/FoliageSystem';
import { ToolManager } from './ToolManager';
import { registerCoreBuilders } from './builders';
import { InputReplay } from '../playback/InputReplay';
import { MIXAMO_CHARACTERS, MIXAMO_ANIMATIONS } from '../animation/MixamoPresets';
import { STOCK_ENEMY_AI_SCRIPT } from './StockEnemyAI';
import { PlayerController } from './PlayerController';
import { CinematicCamera } from '../cinematic/CinematicCamera';
import { CutsceneDirector } from '../cinematic/CutsceneDirector';
import { AudioManager } from '../audio/AudioManager';
import { ParticleEmitter, type VfxPresetName } from '../vfx/ParticleEmitter';
import { SensoriumRunner } from '../sensorium';
import type { TestScript, SensoriumReport, ScenarioProfile, ScenarioOptions } from '../sensorium';
import { HelmBridge } from '../helm';
import type { HelmRequest, HelmResponse } from '../helm';
import { EffectsController } from '../effects/EffectsController';
import { PrefabManager } from './PrefabManager';
import { TexturePresets } from '../materials/TexturePresets';
import { MaterialManager } from '../materials/MaterialManager';
import { DebugDraw } from '../rendering/DebugDraw';
import { HUD } from '../ui/HUD';
import { DialogueSystem } from '../ui/DialogueSystem';
import { escapeHtml } from '../ui/domUtils';
import { GameplayDirector, type GpEntitySnapshot } from '../gameplay';
import { InventorySystem } from '../items';
import { InteractionSystem } from '../interaction';
import { SpawnerSystem } from '../spawning';
import { SaveSystem } from '../persistence';
import { BakeRegistry, BAKE_STATE_KEY } from '../features/BakeRegistry';
import { CrashReporter } from '../diagnostics/CrashReporter';
import { DetailManager } from '../rendering/DetailManager';
import { QualityScaler } from '../rendering/QualityScaler';
import { RaycastIndex } from '../physics/RaycastIndex';
import { InstancedEffectPool } from '../vfx/InstancedEffectPool';
import { AnimationPackRegistry } from '../animation/AnimationPackRegistry';
import { AnimationImporter } from '../animation/AnimationImporter';
import { BoneSocketManager } from '../animation/BoneSockets';
import { AnimNotifyManager } from '../animation/AnimNotifies';
import { MotionDirectorManager } from '../motion';
import { InspectorStudioManager } from '../inspector';
import { TweenDirectorManager } from '../tween';
import { JointSystem } from '../physics/JointSystem';
import { RagdollBuilder } from '../physics/RagdollBuilder';
import type { CharacterLocomotor } from '../character/CharacterLocomotor';
import type { CharacterLocomotorComponent } from '../ecs/components/CharacterLocomotorComponent';
import { CommandHistory } from '../authoring/CommandHistory';
import { MorphTargetSystem } from '../animation/MorphTargetSystem';
import { StateMachineEventBridge } from '../animation/StateMachineEventBridge';
import { AimIKSolver, type AimBoneConfig } from '../animation/AimIKSolver';
import { ReverbZoneSystem } from '../audio/ReverbZoneSystem';
import { TimelineSequencer } from '../cinematic/TimelineSequencer';
import { VolumetricFogSystem } from '../rendering/VolumetricFogSystem';
import { LightCluster } from '../rendering/LightCluster';
import { ShadowAtlas } from '../rendering/ShadowAtlas';
import { ReflectionProbe, type ReflectionProbeConfig } from '../rendering/ReflectionProbe';
import { DecalSystem } from '../rendering/DecalSystem';
import { MeshFracturer } from '../physics/MeshFracturer';
import { VerletClothSystem } from '../physics/VerletClothSystem';
import { WeatherSystem } from '../environment/WeatherSystem';
import { AIDirector } from '../ai/AIDirector';
import { GLOBAL_CHUNK } from '../streaming/chunkMath';
import { ChunkDeltaBinder } from '../streaming/ChunkDeltaBinder';
import { SpringBoneSystem } from '../physics/SpringBoneSystem';
import { ActiveRagdollSystem } from '../physics/ActiveRagdollSystem';
import { BuoyancySystem } from '../physics/BuoyancySystem';
import { FootIKSystem } from '../animation/FootIKSystem';
import { HlodSystem } from '../rendering/HlodSystem';
import { NetworkSystem } from '../network/NetworkSystem';
import { GpuParticleSystem } from '../vfx/GpuParticleSystem';
import { FrameProfiler } from '../diagnostics/FrameProfiler';
import { SelectionManager } from '../editor/SelectionManager';
import { stringifyAsync } from '../persistence/asyncJson';
import { TimeDilationManager } from '../playback/TimeDilationManager';
import { MultiTargetCamera } from '../rendering/MultiTargetCamera';
import { RibbonTrailManager } from '../vfx/RibbonTrailSystem';
import { GameplayFeatureManager } from '../features/gameplay/GameplayFeatureManager';
import { ActionCombatHUD } from '../editor/featureHubPanel';
import { CAMERA_PRESETS, getCameraPreset, resolvePresetPose, type CameraPreset } from '../cinematic/CameraPresets';

export type UpdateHook = (dt: number) => void;
export type CollisionHandler = (e: CollisionEvent) => void;

function decodedBase64Length(value: unknown): number {
  if (typeof value !== 'string') return -1;
  const clean = value.replace(/\s/g, '');
  if (clean.length === 0 || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return -1;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return (clean.length / 4) * 3 - padding;
}

/**
 * Engine.ts — Orchestrator. Builds every subsystem in dependency order and runs the
 * canonical engine loop (see the plan's "Engine Loop"). Structural ECS mutations happen
 * only at the single flush point; the origin shift precedes interpolation precedes render.
 */
export class Engine {
  readonly time = new Time();
  readonly viewport: Viewport;
  readonly input: InputManager;
  readonly worldOrigin = new WorldOrigin();
  readonly physicsWorld: PhysicsWorld;
  readonly sceneManager: SceneManager;
  readonly editorCamera: EditorCamera;
  readonly gizmo: TransformGizmo;
  readonly assetCache = new AssetCache();
  readonly manifest: AssetManifest;
  /** Semantic asset registry — resolves natural-language spawns ('rusty red car') to a
   *  tagged GLB + material dressing. Drives `engine.spawn()` and the `spawn_smart` command. */
  readonly assets: SemanticAssetRegistry;
  readonly loaderQueue = new AssetLoaderQueue();
  readonly chunkManager: ChunkManager;
  /** Persists streamed-chunk destruction, transforms, and gameplay state. */
  readonly chunkDeltas: ChunkDeltaBinder;
  readonly aiBridge: AIBridge;
  /** Navigation + AI steering stack: heightfield NavMesh + A* Pathfinder + Reynolds
   *  steering behaviors + behavior trees + per-entity NavAgents. Built on demand by
   *  the `navmesh_build` AICommand; agents are added via `add_nav_agent`. */
  readonly nav: NavigationSystem;
  /** Hierarchical frustum + software occlusion culling. Opt-in via `cull_enable`;
   *  runs in the loop before viewport.render() so the renderer draws fewer objects. */
  readonly culling: CullingSystem;
  /** Modular raycast-vehicle physics. Attach to any dynamic body via `add_vehicle`;
   *  the loop ticks every vehicle each fixed step before physicsWorld.step(). */
   readonly vehicles: VehicleSystem;
  /** Level-of-Detail system. Auto-generates simplified meshes + swaps by camera distance.
   *  Opt-in per entity via `lod_register`; the loop ticks it before the cull. */
   readonly lod: LODSystem;
  /** Combat pipeline: health, hitboxes, weapons, projectiles, damage queue. */
  readonly combat: CombatSystem;
  /** Worker-thread asset fetcher (offloads the network round-trip from the main thread). */
  readonly workerLoader: WorkerAssetLoader;
  /** Runtime asset import + IndexedDB cache (download third-party GLBs at runtime). */
  readonly assetImporter: RuntimeAssetImporter;
  readonly tools: ToolManager;
  readonly terrain: TerrainSystem;
  /** Animated time-of-day (sun arc + colour + fog), throttled sky re-bake. */
  readonly dayNight: DayNightCycle;
  /** Gerstner-wave ocean/lake surfaces (+ buoyancy sampling). */
  readonly water: WaterSystem;
  /** Raymarched volumetric cloud dome (sun-lit, day/night-tinted). */
  readonly clouds: CloudLayer;
  /** Global wind field (drives foliage sway + cloud drift coherently). */
  readonly wind: WindSystem;
  /** Biome-aware instanced vegetation (trees/bushes/rocks) with GPU wind sway. */
  readonly foliage: FoliageSystem;
  readonly player: PlayerController;
  readonly cinematic: CinematicCamera;
  readonly cutsceneDirector: CutsceneDirector;
  readonly audio: AudioManager;
  /** VFX facade — `engine.vfx.spawn('fire', worldPos, {...})` from the IDE or REPL. */
  readonly vfx: {
    spawn: (preset: VfxPresetName, worldPos: THREE.Vector3, opts?: { duration?: number; loop?: boolean; maxParticles?: number }) => ParticleEmitter;
    burst: (preset: VfxPresetName, worldPos: THREE.Vector3, count?: number) => ParticleEmitter;
  };
  /** Effects facade — game-feel / cinematic effects (shake, flash, trails,
   *  decals, weather, time scale, hit/explosion combos) under one API. */
  readonly effects: EffectsController;
  readonly dialogueSystem: DialogueSystem;
  /** Declarative gameplay-logic director — rules/quests/zones/timers that turn the
   *  world simulation into a *game*. Authored as one JSON blob via `gameplay_load`;
   *  its actions reach the whole engine through AICommands. Ticked in the loop. */
  readonly gameplay: GameplayDirector;
  /** Items & Inventory — registered item types + per-owner bags; item `onUse` effects
   *  are AICommands. Composes with the gameplay director (giveItem/hasItem/item_used). */
  readonly items: InventorySystem;
  /** World-space interaction — proximity/facing "press E" interactables whose actions
   *  are AICommands (open a chest, talk, pull a lever). Emits `interacted` → gameplay
   *  `interact` triggers. Ticked in the loop after the gameplay director. */
  readonly interaction: InteractionSystem;
  /** Declarative entity spawners — time-based spawning with concurrent/lifetime caps +
   *  per-spawn config; `spawner_cleared` chains into gameplay rules for waves. Ticked
   *  in the loop after interaction. */
  readonly spawner: SpawnerSystem;
    /** Save-game bundling — snapshots gameplay (def+runtime) + inventory + persistent
     *  flags + player position into a named localStorage slot for resumable games. */
    readonly saves: SaveSystem;
   /** Persistable bake state — named look recipes + the deterministic AO recipe, carried
    *  through `save_game`/`load_game` so a baked look survives reload. */
   readonly bakes: BakeRegistry;
   /** Diagnostics: WebGL context lost + uncaught errors → ring buffer + /api/crash-report. */
   readonly crashReporter: CrashReporter;
   /** Content-side detail-cap + proxy-swap policy (N detailed, rest proxy/hidden). */
   readonly detailManager: DetailManager;
   /** Runtime FPS-driven dynamic quality scaler (resolution + post passes + shadows). */
   readonly qualityScaler: QualityScaler;
   /** Mesh-level raycast accel (sphere+AABB broadphase) for HELM/picking. */
   readonly raycastIndex: RaycastIndex;
   /** Allocation-free InstancedMesh VFX pools (tracer/flash/spark). */
   readonly fxPool: InstancedEffectPool;
    /** Animation Retarget Pro — pack registry + bulk importer (FBX/GLB → retarget → combat). */
     readonly animPacks: AnimationPackRegistry;
     readonly animImporter: AnimationImporter;
     readonly boneSockets = new BoneSocketManager();
     readonly animNotifies = new AnimNotifyManager();
     readonly timeDilation = new TimeDilationManager();
     readonly multiTargetCamera = new MultiTargetCamera();
     readonly ribbonTrails = new RibbonTrailManager();
     readonly motion: MotionDirectorManager;
     readonly inspector: InspectorStudioManager;
     readonly tweens: TweenDirectorManager;
     readonly jointSystem: JointSystem;
     readonly ragdollBuilder: RagdollBuilder;
     readonly activeRagdolls: ActiveRagdollSystem;
     readonly springBones = new SpringBoneSystem();
     readonly footIK: FootIKSystem;
     readonly buoyancy: BuoyancySystem;
     readonly hlod: HlodSystem;
     readonly network: NetworkSystem;
     /** Optional WebGPU compute simulation with a WebGL-visible proxy. */
     readonly gpuParticles = new GpuParticleSystem();
     readonly profiler = new FrameProfiler();
     readonly selection = new SelectionManager();
     readonly history = new CommandHistory();
     readonly morphSystem = new MorphTargetSystem();
     readonly animEventBridge: StateMachineEventBridge;
      readonly reverb: ReverbZoneSystem;
      readonly timelineSequencer: TimelineSequencer;
       readonly volumetricFog: VolumetricFogSystem;
       readonly lightCluster = new LightCluster();
       readonly shadowAtlas = new ShadowAtlas();
       readonly reflectionProbes = new Map<string, ReflectionProbe>();
       readonly decalSystem: DecalSystem;
       readonly meshFracturer: MeshFracturer;
       readonly clothSystem: VerletClothSystem;
       readonly weatherSystem: WeatherSystem;
       readonly aiDirector: AIDirector;
       readonly prefabs: PrefabManager;
  readonly textures: TexturePresets;
  readonly materials: MaterialManager;
  readonly gameplayFeatures: GameplayFeatureManager;
  readonly actionCombatHud: ActionCombatHUD;
  /** AI-Native 3D debug draw — transient lines, boxes, spheres, text annotations
   *  that auto-expire. Lets the AI "see" its math (pathfinding, raycasts, vectors)
   *  in SENSORIUM recordings and the viewport. */
  readonly debugDraw: DebugDraw;
  /** Declarative HUD overlay — JSON-defined screen-space UI with data binding. */
  readonly hud: HUD;
  /** Deterministic input recorder / time-travel debugger. */
  readonly replay: InputReplay;
  /** SENSORIUM — the AI's perception layer: a vision-driven, feel-aware gameplay
   *  test runner. The AI watches the footage AND feels the telemetry. */
  readonly sensorium: SensoriumRunner;
  /** HELM — the agent control plane: a request/response RPC surface for IDE coding
   *  agents (structured results, scene introspection, checkpoints, assertions). */
  readonly helm: HelmBridge;
  /** @deprecated Use `sensorium`. Kept so older code/UIs keep working. */
  get playback(): SensoriumRunner { return this.sensorium; }
  /** SENSORIUM: true while a test is driving the engine. Suppresses main.ts
   *  auto-possess so the runner can set its own target. */
  isTestMode = false;
  physicsPaused = false;

  private readonly animationMachines = new Set<AnimationStateMachine>();
  private readonly aimSolvers = new Map<number, AimIKSolver>();
  private readonly aimTargets = new Map<number, { worldTarget: THREE.Vector3; weight: number }>();
  private readonly _aimEngineTarget = new THREE.Vector3();
  private readonly updateHooks = new Set<UpdateHook>();
  private readonly postRenderHooks = new Set<() => void>();
  private readonly collisionHandlers = new Set<CollisionHandler>();
  private readonly particleEmitters = new Set<ParticleEmitter>();
  private readonly dynamicLights = new Set<THREE.Light>();
  private readonly advancedLights: THREE.Light[] = [];
  private advancedLightsDirty = true;
  private advancedLightsEntityRevision = -1;
  private advancedLightsViewportRevision = -1;
  private readonly clusteredLights: Array<{ position: THREE.Vector3; radius: number }> = [];
  private readonly shadowLightIds = new WeakMap<THREE.Light, string>();
  private readonly liveShadowIds = new Set<string>();
  private readonly reflectionProbeWorldPositions = new Map<string, THREE.Vector3>();
  private readonly _probeEngine = new THREE.Vector3();
  private readonly _probeObjectPos = new THREE.Vector3();
  private nextShadowLightId = 1;
  private weatherLightningOff: (() => void) | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _lightOffset = new THREE.Vector3();
  private readonly _reverbWorld = new THREE.Vector3();
  private pendingPick: { x: number; y: number; additive: boolean; toggle: boolean } | null = null;
  private selectionDrag: { x0: number; y0: number; x1: number; y1: number; additive: boolean; toggle: boolean } | null = null;
  private pendingPlayerTransform: { pos: [number, number, number]; quat: [number, number, number, number] } | null = null;
  private dialoguePreviousTimeScale: number | null = null;
  private readonly notifyState = new Map<number, { state: string; time: number }>();
  /** Bodies temporarily disabled by entity-scoped full hitstop. */
  private readonly hitstopFrozenBodies = new Set<RigidBodyComponent>();
  private frameHandle = 0;
  private disposed = false;

  private constructor(physicsWorld: PhysicsWorld, container: HTMLElement) {
    this.physicsWorld = physicsWorld;

    // --- Sequential, dependency-ordered construction ---
    this.viewport = new Viewport(container);
    this.input = new InputManager(this.viewport.renderer.domElement);
    this.sceneManager = new SceneManager(
      this.viewport.scene,
      this.physicsWorld,
      this.assetCache,
      this.worldOrigin,
    );
    this.sceneManager['ctx'].addAnimationStateMachine = (asm) => this.addAnimationStateMachine(asm);
    this.sceneManager['ctx'].removeAnimationStateMachine = (asm) => this.removeAnimationStateMachine(asm);
    // Expose an ASM lookup so the AIBridge's play_animation command can resolve the
    // state machine owning a given rigid body without reaching into Engine internals.
    this.sceneManager['ctx'].findAnimationStateMachine = (rb: unknown) =>
      this.findAnimationStateMachine(rb as RigidBodyComponent);
    // Note: animPacks is assigned AFTER this.animPacks is created below (see Engine.ctor second half).
    this.editorCamera = new EditorCamera(this.viewport.camera, this.input);
    this.gizmo = new TransformGizmo(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.editorCamera,
      this.viewport.scene,
    );
    this.gizmo.onTransformCommitted = (record) => {
      const rb = record.rb;
      const entityId = this.sceneManager.getEntityForRigidBody(rb);
      const entityLabel = entityId !== undefined ? `#${entityId}` : 'Entity';
      this.history.record({
        id: `gizmo_transform_${Date.now()}_${Math.random()}`,
        name: `Move ${entityLabel}`,
        timestamp: Date.now(),
        undo: () => {
          rb.teleport(record.oldPosition, record.oldQuaternion);
          rb.mesh.scale.copy(record.oldScale);
          rb.syncToPhysics();
          if (this.gizmo.attached === rb) {
            this.gizmo.attach(rb);
          }
        },
        redo: () => {
          rb.teleport(record.newPosition, record.newQuaternion);
          rb.mesh.scale.copy(record.newScale);
          rb.syncToPhysics();
          if (this.gizmo.attached === rb) {
            this.gizmo.attach(rb);
          }
        },
      });
    };
    this.debugDraw = new DebugDraw(this.viewport.scene);
    this.sceneManager.debugDraw = this.debugDraw;
    this.hud = new HUD(this.sceneManager);
    this.sceneManager.hud = this.hud;
    
    this.dialogueSystem = new DialogueSystem();
    this.dialogueSystem.onShow = () => {
      if (this.dialoguePreviousTimeScale === null) this.dialoguePreviousTimeScale = this.timeDilation.getGlobalBaseTimeScale();
      this.timeDilation.setGlobalTimeScale(0);
    };
    this.dialogueSystem.onHide = () => {
      this.timeDilation.setGlobalTimeScale(this.dialoguePreviousTimeScale ?? 1);
      this.dialoguePreviousTimeScale = null;
    };

    this.replay = new InputReplay(this.input, { physics: this.physicsWorld, time: this.time });
    this.prefabs = new PrefabManager(this);
    this.textures = new TexturePresets(this);
    this.materials = new MaterialManager(this);
    this.sceneManager['ctx'].getMaterial = (id) => this.materials.get(id);
    this.manifest = new AssetManifest(this.loaderQueue, this.assetCache);
    // Builders resolve an asset's size class from its manifest entry, so the manifest
    // has to reach the BuildContext — it is created after the SceneManager.
    this.sceneManager.provideBuildContext({ manifest: this.manifest });
    this.assets = new SemanticAssetRegistry(this.manifest);
    this.registerPresets();
    this.chunkDeltas = new ChunkDeltaBinder(this.sceneManager, this.worldOrigin);
    this.chunkManager = new ChunkManager({
      camera: this.viewport.camera,
      scene: this.viewport.scene,
      worldOrigin: this.worldOrigin,
      physicsWorld: this.physicsWorld,
      sceneManager: this.sceneManager,
      gizmo: this.gizmo,
      // Chunk-aware navmesh: when a chunk's colliders stream in/out, mark its footprint
      // dirty so the dynamic navmesh re-rasterizes it (no-op unless nav is in dynamic mode).
      onChunkLoaded: (cx, cz) => this.nav?.markChunkDirty(cx, cz),
      onChunkUnloaded: (cx, cz) => this.nav?.markChunkDirty(cx, cz),
      deltas: this.chunkDeltas,
    });
    // --- Cinematic / audio / VFX subsystems (IDE-facing) ---
    this.cinematic = new CinematicCamera(this.viewport.camera, this.worldOrigin, this.sceneManager);
    this.cutsceneDirector = new CutsceneDirector(this.cinematic);
    this.audio = new AudioManager(this.sceneManager, this.worldOrigin);
    this.audio.setPhysicsWorld(this.physicsWorld);
    this.vfx = {
      spawn: (preset, worldPos, opts) => this.spawnVfx(preset, worldPos, opts),
      burst: (preset, worldPos, count) => this.burstVfx(preset, worldPos, count),
    };
    this.effects = new EffectsController({
      viewport: this.viewport,
      physicsWorld: this.physicsWorld,
      worldOrigin: this.worldOrigin,
      setTimeScale: (scale) => this.timeDilation.setGlobalTimeScale(scale),
      burstVfx: (preset, worldPos, count) => this.burstVfx(preset, worldPos, count),
    });
    // Navigation + AI steering stack. Constructed before AIBridge so it can be passed
    // as a dep (the nav_* commands drive it). The engine loop ticks it every frame
    // after aiBridge.update.
    this.nav = new NavigationSystem({
      sceneManager: this.sceneManager,
      physicsWorld: this.physicsWorld,
      worldOrigin: this.worldOrigin,
      scene: this.viewport.scene,
      // Lazy thunk: aiBridge is assigned later in this ctor, but the resolver only runs
      // at navigateTo() time, by which point it's live. Lets the AI name destinations
      // ('@player', 'building_42', a tag) and have nav resolve them to a world point.
      resolveEntityRef: (ref) => this.aiBridge?.resolveEntity(ref),
      // Drive a walk/run/idle locomotion clip as an agent's gait changes (if it has one).
      playLocomotion: (entityId, state) => {
        const rb = this.sceneManager.getRigidBody(entityId);
        if (!rb) return;
        const asm = this.findAnimationStateMachine(rb);
        if (asm && asm.hasAnimation(state)) asm.transition(state, 0.2);
      },
    });
    // Culling system (hierarchical frustum + software occlusion). Constructed disabled;
    // the `cull_enable` command turns it on. The loop runs `cull.cull()` before render.
    this.culling = new CullingSystem(this.viewport.scene, this.viewport.camera, {
      occlusionResolution: 256,
      occlusionEnabled: true,
      hierarchicalFrustum: true,
    });
    // Vehicle physics system (raycast suspension + traction + steering). The loop ticks
    // it inside the fixed-step physics loop before world.step().
    this.vehicles = new VehicleSystem({
      physicsWorld: this.physicsWorld,
      sceneManager: this.sceneManager,
      worldOrigin: this.worldOrigin,
    });
    this.lod = new LODSystem(this.viewport.camera, this.sceneManager);
    this.combat = new CombatSystem({
      getEngine: () => this,
      sceneManager: this.sceneManager,
      physicsWorld: this.physicsWorld,
      worldOrigin: this.worldOrigin,
      burstVfx: (preset, worldPos, count) => this.burstVfx(preset as any, worldPos, count),
    });
    this.workerLoader = new WorkerAssetLoader();
    this.assetImporter = new RuntimeAssetImporter();
    this.tools = new ToolManager();
    this.terrain = new TerrainSystem(this);
    // Day/night cycle. Deps read `this.viewport.shadow` lazily so it follows a shadow-strategy
    // swap (single ⇄ CSM); the sky re-bake is the only expensive call and the cycle throttles it.
    this.dayNight = new DayNightCycle({
      setShadowSunDirection: (dir) => {
        const s = this.viewport.shadow as unknown as { sunDir?: THREE.Vector3; setSunDirection?: (d: THREE.Vector3) => void };
        if (s.sunDir) s.sunDir.copy(dir);
        if (s.setSunDirection) s.setSunDirection(dir);
      },
      bakeSky: (dir) => this.viewport.skyEnv.setSunDirection(dir, this.viewport.scene),
      setSunColor: (c) => this.viewport.shadow.setSunColor(c),
      setSunIntensity: (i) => this.viewport.shadow.setSunIntensity(i),
      setFogColor: (c) => this.viewport.skyEnv.setFogColor(c, this.viewport.scene),
    });
    this.addUpdateHook((dt) => this.dayNight.update(dt));
    // Global wind — constructed before the consumers (clouds/foliage) so it's live on frame 1.
    this.wind = new WindSystem(this);
    this.water = new WaterSystem(this);
    // Volumetric cloud dome (radius < camera far). Fed the live camera + sun + wind each frame.
    this.clouds = new CloudLayer(this.viewport.scene, 4500);
    this.addUpdateHook((dt) => {
      const s = this.viewport.shadow as unknown as { sunDir: THREE.Vector3; sun: THREE.DirectionalLight };
      this.clouds.setWind(this.wind.dir.x, this.wind.dir.y);
      this.clouds.update(dt, this.viewport.camera.position, s.sunDir, s.sun.color);
    });
    this.foliage = new FoliageSystem(this);
    // SENSORIUM: owned by the engine. Constructed BEFORE AIBridge because the bridge's
    // deps need the runner reference (used by sensorium_run / sensorium_test commands).
    // AIBridge is passed to the runner as a dep so the runner can dispatch aiCommands
    // during setup; the bridge's sensorium reference points back to this same runner,
    // forming a two-way link resolved at the moment the bridge is constructed below.
    this.sensorium = new SensoriumRunner(this, /* aiBridge */ null as unknown as AIBridge);
    // HELM: also constructed before the bridge; same two-way link pattern as SENSORIUM.
    this.helm = new HelmBridge(this, /* aiBridge */ null as unknown as AIBridge);
    // Items & Inventory. Constructed before the gameplay director (its host reads
    // item counts) and AIBridge (a dep). `this.aiBridge` resolves lazily at call time.
    this.items = new InventorySystem({
      execute: (cmd) => this.aiBridge.execute(cmd),
      emit: (event, data) => this.sceneManager.events.emit(event, data),
      persist: (s) => this.sceneManager.gameState.setItem('__inventory__', s),
    });
    // Gameplay-logic director. Constructed before AIBridge (passed as a dep). Its host
    // closes over `this`, so `this.aiBridge` / `this.player` / `this.items` resolve lazily
    // at call time (assigned later in this ctor) — the same lazy pattern the nav system uses.
    this.gameplay = new GameplayDirector({
      execute: (cmd) => this.aiBridge.execute(cmd),
      on: (event, cb) => this.sceneManager.events.on(event, cb),
      emit: (event, data) => this.sceneManager.events.emit(event, data),
      listEntities: () => this.listGameplayEntities(),
      getPlayerPosition: () => this.getPlayerWorldPosition(),
      itemCount: (owner, item) => this.items.count(owner, item),
      persist: (s) => this.sceneManager.gameState.setItem('__gameplay__', s),
    });
    // World-space interaction. Reuses the gameplay entity snapshot (structurally an
    // IxEntity[]); player pose = possessed body world pos + camera forward; interact key
    // is edge-triggered KeyE in play mode (the editor flycam — which also uses E — is off
    // whenever a player is possessed). `this.aiBridge` resolves lazily.
    this.interaction = new InteractionSystem({
      execute: (cmd) => this.aiBridge.execute(cmd),
      emit: (event, data) => this.sceneManager.events.emit(event, data),
      listEntities: () => this.listGameplayEntities(),
      getPlayerPose: () => this.getPlayerPose(),
      isInteractPressed: () => this.input.mode === 'play' && this.input.isActionPressed('Interact'),
      showPrompt: (text, entityId) => this.showInteractionPrompt(text, entityId),
    });
    // Declarative spawners. `spawn` uses the immediate spawnNow (like spawnEnemy) so the
    // new entity id is available for tagging / onSpawn config / alive-tracking; entities
    // live in GLOBAL_CHUNK so streaming never unloads them. `this.aiBridge` resolves lazily.
    this.spawner = new SpawnerSystem({
      spawn: (blueprint, x, y, z) => this.spawnFromSpawner(blueprint, x, y, z),
      despawn: (id) => this.sceneManager.requestDestroy(id),
      tag: (id, tag) => this.sceneManager.addTag(id, tag),
      execute: (cmd) => this.aiBridge.execute(cmd),
      emit: (event, data) => this.sceneManager.events.emit(event, data),
      on: (event, cb) => this.sceneManager.events.on(event, cb),
    });
    // Borrowed: persistable bake state (look recipes + deterministic AO) through saves.
    this.bakes = new BakeRegistry();
    this.crashReporter = new CrashReporter();
    try { this.crashReporter.install(); } catch {}
    try { this.crashReporter.setDiagnosticsProvider(() => ({ render: (this.viewport.renderer as unknown as { info?: { render?: { calls: number; triangles: number; geometries: number; textures: number } } })?.info?.render ?? null } as unknown as import('../diagnostics/CrashReporter').CrashDiagnostics)); } catch {}
    try { this.crashReporter.attachCanvas(this.viewport.renderer.domElement); } catch {}
    this.detailManager = new DetailManager();
    this.qualityScaler = new QualityScaler(this.viewport.renderer as unknown as THREE.WebGLRenderer, (this.viewport as unknown as { pipeline?: import('../rendering/RenderPipeline').RenderPipeline })?.pipeline ?? null);
    this.raycastIndex = new RaycastIndex();
    this.fxPool = new InstancedEffectPool(this.viewport.scene);
    this.addUpdateHook((dt) => { try { this.fxPool.update(dt); } catch {} });
    // Save-game bundling. Orchestrates the gameplay/inventory/state systems + player
    // transform into named localStorage slots. `this.gameplay`/`this.items`/`this.player`
    // resolve lazily at call time. Bake state is piggy-backed into PersistentGameState.
    this.saves = new SaveSystem({
      gameplayDef: () => this.gameplay.getDef(),
      gameplaySerialize: () => (this.gameplay.loaded ? this.gameplay.serialize() : null),
      gameplayLoad: (def) => this.gameplay.load(def, { quiet: true }),
      gameplayRestore: (s) => this.gameplay.restore(s),
      inventorySerialize: () => this.items.serialize(),
      inventoryRestore: (s) => this.items.restore(s),
      stateGetAll: () => {
        const state = this.sceneManager.gameState.getAll();
        (state as Record<string, unknown>)[BAKE_STATE_KEY] = this.bakes.serialize();
        return state;
      },
      stateSet: (k, v) => {
        this.sceneManager.gameState.setItem(k, v);
        if (k === BAKE_STATE_KEY && v && typeof v === 'object') this.bakes.restore(v as never);
      },
      stateClear: () => this.sceneManager.gameState.clear(),
      getPlayerTransform: () => this.capturePlayerTransform(),
      setPlayerTransform: (pos, quat) => this.applyPlayerTransform(pos, quat),
      worldSnapshot: () => this.captureWorldSnapshot(),
      worldRestore: (snap) => this.restoreWorldSnapshot(snap),
      store: (slot, json) => { try { localStorage.setItem(`mix_save_${slot}`, json); } catch { /* full/unavailable */ } },
      read: (slot) => { try { return localStorage.getItem(`mix_save_${slot}`); } catch { return null; } },
      listSlots: () => this.listSaveSlots(),
      removeSlot: (slot) => { try { localStorage.removeItem(`mix_save_${slot}`); } catch { /* ignore */ } },
    });
    this.animPacks = new AnimationPackRegistry();
    try { this.animPacks.hydrateFromStorage(); } catch {}
    this.animImporter = new AnimationImporter(this.animPacks, this.assetCache as unknown as { checkout: (id: string) => THREE.Group; has: (id: string) => boolean }, this.manifest);
    this.motion = new MotionDirectorManager();
    this.inspector = new InspectorStudioManager();
    this.tweens = new TweenDirectorManager(this);
    this.jointSystem = new JointSystem(this.physicsWorld, this.sceneManager);
    this.ragdollBuilder = new RagdollBuilder(this.physicsWorld, this.sceneManager, this.jointSystem);
    this.activeRagdolls = new ActiveRagdollSystem(this.sceneManager, this.ragdollBuilder);
    this.footIK = new FootIKSystem(this.sceneManager, this.physicsWorld);
    this.buoyancy = new BuoyancySystem(this.sceneManager, this.worldOrigin, this.water);
    this.hlod = new HlodSystem(this.viewport.scene, this.viewport.renderer);
    this.network = new NetworkSystem(this.sceneManager, this.worldOrigin);
    this.animEventBridge = new StateMachineEventBridge(this.sceneManager.events);
    this.animEventBridge.registerDefaultCombatMarkers();
    const audioContext = this.audio.context ?? undefined;
    this.reverb = new ReverbZoneSystem(
      audioContext,
      this.audio.outputNode ?? undefined,
      audioContext?.destination,
    );
    this.timelineSequencer = new TimelineSequencer(
      (id) => this.sceneManager.getRigidBody(id)?.mesh ?? null,
      this.sceneManager.events,
      (worldPosition, out) => this.worldOrigin.toEngineSpaceInto(out, worldPosition),
      (id, object) => {
        const rb = this.sceneManager.getRigidBody(id);
        if (rb) rb.teleport(object.position, object.quaternion);
      },
    );
    this.decalSystem = new DecalSystem(this.viewport.scene);
    this.volumetricFog = new VolumetricFogSystem(
      {},
      this.viewport.scene,
      (worldPosition, out) => this.worldOrigin.toEngineSpaceInto(out, worldPosition),
    );
    this.meshFracturer = new MeshFracturer(this.physicsWorld, this.sceneManager);
    this.clothSystem = new VerletClothSystem(this.viewport.scene);
    this.weatherSystem = new WeatherSystem(this.sceneManager.events);
    this.weatherLightningOff = this.sceneManager.events.on('weather_lightning', (payload) => {
      const intensity = Math.min(1, ((payload as { intensity?: number })?.intensity ?? 1) / 3);
      this.effects.flash({ color: '#e8f2ff', intensity, duration: 0.15, mode: 'pulse' });
    });
    this.aiDirector = new AIDirector(this.sceneManager.events);
    // Gameplay constructors resolve the player; settings also initialize its controls.
    this.player = new PlayerController(this);
    this.gameplayFeatures = new GameplayFeatureManager(this);
    this.sceneManager.gameplayFeatures = this.gameplayFeatures;
    this.gameplayFeatures.settings.initialize();
    this.actionCombatHud = new ActionCombatHUD(this);
    if (typeof window !== 'undefined') {
      (window as any).gameplayFeatures = this.gameplayFeatures;
    }
    this.aiBridge = new AIBridge({
      sceneManager: this.sceneManager,
      worldOrigin: this.worldOrigin,
      input: this.input,
      manifest: this.manifest,
      assets: this.assets,
      viewport: this.viewport,
      physicsWorld: this.physicsWorld,
      cinematic: this.cinematic,
      cutsceneDirector: this.cutsceneDirector,
      audio: this.audio,
      sensorium: this.sensorium,
      spawnVfx: (preset, worldPos, opts) => { this.spawnVfx(preset, worldPos, opts); },
      burstVfx: (preset, worldPos, count) => { this.burstVfx(preset, worldPos, count); },
      captureScreenshot: (filename, w, h) => this.captureScreenshot(filename, w, h),
      setTimeOfDay: (hour) => this.setTimeOfDay(hour),
      dayNight: this.dayNight,
      terrain: this.terrain,
      water: this.water,
      clouds: this.clouds,
      wind: this.wind,
      foliage: this.foliage,
      chunkManager: this.chunkManager,
      effects: this.effects,
      zoomIn: (f) => this.zoomIn(f),
      zoomOut: (f) => this.zoomOut(f),
      zoomReset: () => this.zoomReset(),
      frameAll: (p) => this.frameAll(p),
      frameEntity: (id, p) => this.frameEntity(id, p),
      applyCameraPreset: (id, opts) => this.applyCameraPreset(id, opts),
      cycleCameraPreset: (dir) => this.cycleCameraPreset(dir),
      listCameraPresets: () => this.listCameraPresets(),
      markDynamicLightsDirty: () => this.markDynamicLightsDirty(),
      nav: this.nav,
      culling: this.culling,
      vehicles: this.vehicles,
      lod: this.lod,
      combat: this.combat,
      assetImporter: this.assetImporter,
      debugDraw: this.debugDraw,
      hud: this.hud,
      dialogueSystem: this.dialogueSystem,
      replay: this.replay,
      gameplay: this.gameplay,
      items: this.items,
      interaction: this.interaction,
      spawner: this.spawner,
      saves: this.saves,
      bakes: this.bakes,
      animRegistry: this.animPacks,
      animImporter: this.animImporter,
      motionDirector: this.motion,
      inspectorStudio: this.inspector,
      tweenDirector: this.tweens,
      jointSystem: this.jointSystem,
      ragdollBuilder: this.ragdollBuilder,
      getLocomotor: (id: number) => this.getLocomotor(id),
      history: this.history,
      morphSystem: this.morphSystem,
      animEventBridge: this.animEventBridge,
      getAimIKSolver: (id) => this.getOrCreateAimIKSolver(id),
      setAimIKTarget: (id, worldTarget, weight) => this.setAimIKTarget(id, worldTarget, weight),
      reverbSystem: this.reverb,
      timelineSequencer: this.timelineSequencer,
      volumetricFog: this.volumetricFog,
      decalSystem: this.decalSystem,
      meshFracturer: this.meshFracturer,
      weatherSystem: this.weatherSystem,
      aiDirector: this.aiDirector,
      clothSystem: this.clothSystem,
      createReflectionProbe: (id, position, config) => this.createReflectionProbe(id, position, config),
      removeReflectionProbe: (id) => this.removeReflectionProbe(id),
      markReflectionProbeDirty: (id) => {
        const probe = this.reflectionProbes.get(id);
        if (!probe) return false;
        probe.dirty = true;
        return true;
      },
      findAsm: (id: number) => { const rb = this.sceneManager.getRigidBody(id); return rb ? this.findAnimationStateMachine(rb) : null; },
      getAllAsm: () => this.animationMachines,
      getSelectedEntityId: () => { const rb = this.gizmo.attached; return rb ? this.sceneManager.entityOf(rb) : null; },
      springBones: this.springBones,
      activeRagdolls: this.activeRagdolls,
      footIK: this.footIK,
      buoyancy: this.buoyancy,
      chunkDeltas: this.chunkDeltas,
      hlod: this.hlod,
      network: this.network,
      gpuParticles: this.gpuParticles,
      prefabs: this.prefabs,
      profiler: this.profiler,
      selection: this.selection,
      selectionChanged: () => this.syncGizmoToSelection(),
      gameplayFeatures: this.gameplayFeatures,
    });
    // Now that the bridge exists, hand it to the runner + control plane (links close here).
    this.sensorium.attachAIBridge(this.aiBridge);
    this.helm.attachAIBridge(this.aiBridge);
    this.cutsceneDirector.executeCommand = (cmd) => this.aiBridge.execute(cmd);
    this.cutsceneDirector.resolveEntity = (ref) => this.aiBridge.resolveEntity(ref);

    // Pointer lock is refused while the gizmo drags (no cursor capture mid-operation).
    this.input.setPointerLockGuard(() => this.gizmo.dragging || this.gameplayFeatures.pause.isPaused);
    registerCoreBuilders(this.sceneManager);
    this.bindEditorInput();
  }

  static async create(container: HTMLElement): Promise<Engine> {
    // WASM init must complete before the loop touches physics.
    const physicsWorld = await PhysicsWorld.create();
    const engine = new Engine(physicsWorld, container);
    engine.start();
    return engine;
  }

  // --- Public registration ------------------------------------------------
  addUpdateHook(hook: UpdateHook): () => void {
    this.updateHooks.add(hook);
    return () => this.updateHooks.delete(hook);
  }
  /** SENSORIUM: register a hook that runs immediately after the frame is rendered
   *  (so callers can grab the canvas pixels via toDataURL while the framebuffer
   *  still has the rendered frame). Errors in a hook don't kill the loop. */
  addPostRenderHook(hook: () => void): () => void {
    this.postRenderHooks.add(hook);
    return () => this.postRenderHooks.delete(hook);
  }
  addAnimationStateMachine(asm: AnimationStateMachine): void {
    this.animationMachines.add(asm);
  }
  removeAnimationStateMachine(asm: AnimationStateMachine): void {
    this.animationMachines.delete(asm);
  }
  /** Find the animation state machine driving a given rigid body, or null. */
  findAnimationStateMachine(rb: RigidBodyComponent): AnimationStateMachine | null {
    for (const asm of this.animationMachines) {
      if (asm.rigidBody === rb) return asm;
    }
    return null;
  }
  /** Read-only view of every live animation state machine (UI/panels iterate this). */
  get animationStateMachines(): ReadonlySet<AnimationStateMachine> {
    return this.animationMachines;
  }
  onCollision(handler: CollisionHandler): () => void {
    this.collisionHandlers.add(handler);
    return () => this.collisionHandlers.delete(handler);
  }

  // --- IDE-facing subsystem helpers ---------------------------------------

  // --- Viewport zoom (dolly the camera along its view direction) ---------
  /** Distance scalar applied by each `zoomIn` / `zoomOut` call and by wheel ticks. */
  private _zoomFactor = 1.18;
  private readonly _zoomMin = 0.35;
  private readonly _zoomMax = 800;
  private readonly _zoomForward = new THREE.Vector3();
  private readonly _zoomPivot = new THREE.Vector3(0, 1, 0);
  private readonly _tmpVec = new THREE.Vector3();
  private readonly _tmpPos = new THREE.Vector3();
  private readonly _tmpLook = new THREE.Vector3();
  private _currentPresetId: string | null = 'default';

  /**
   * Dolly the camera CLOSER to the point it's looking at.
   * Fixed: moves ALONG the camera's forward axis (no snap to bounding-box centre) so
   * repeated zooms feel smooth and don't yank the lookAt. Clamps to [_zoomMin, _zoomMax].
   */
  zoomIn(factor: number = this._zoomFactor): void {
    this.dollyCamera(1 / factor);
  }
  /** Dolly the camera FURTHER from the point it's looking at. */
  zoomOut(factor: number = this._zoomFactor): void {
    this.dollyCamera(factor);
  }
  /**
   * Reset the camera to the default editor position (matches Viewport default
   * and the 'default' camera preset).
   */
  zoomReset(): void {
    this.applyCameraPreset('default', { anchorToSelection: false });
  }
  /** Frame ALL entities in the scene (compute bounding box, reposition camera). */
  frameAll(padding: number = 1.4): void {
    const box = this.computeEntitiesBoundingBox();
    if (!box) return;
    this.frameBox(box, padding);
  }
  /** Frame a specific entity in the viewport. */
  frameEntity(entityId: number, padding: number = 1.4): void {
    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) return;
    const box = new THREE.Box3().setFromObject(rb.mesh);
    this.frameBox(box, padding);
  }
  /** Frame an arbitrary world-space box. */
  frameBox(box: THREE.Box3, padding: number = 1.4): void {
    const cam = this.viewport.camera;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * padding;
    // Choose a 3/4 view direction.
    const dir = new THREE.Vector3(0.7, 0.55, 1).normalize();
    cam.position.copy(centre).addScaledVector(dir, radius * 1.4);
    cam.lookAt(centre);
    this._zoomPivot.copy(centre);
    // Keep editor camera angles in sync so RMB-look continues from this view.
    this.editorCamera.syncToCamera();
  }
  /** Computed bounding box of every entity in the scene (engine-space). */
  computeEntitiesBoundingBox(): THREE.Box3 | null {
    const list = this.sceneManager.rigidBodyList;
    if (list.length === 0) return null;
    const box = new THREE.Box3();
    for (const rb of list) {
      const o = new THREE.Box3().setFromObject(rb.mesh);
      box.union(o);
    }
    if (box.isEmpty()) return null;
    return box;
  }

  /** Current zoom pivot — where the camera is considered to be looking. */
  getZoomPivot(out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(this._zoomPivot);
    return out;
  }
  /** Update the internal zoom pivot to the current selection or scene centre. */
  refreshZoomPivot(): void {
    const selId = this.selection.primary;
    if (selId !== null) {
      const rb = this.sceneManager.getRigidBody(selId);
      if (rb) { this._zoomPivot.copy(rb.mesh.position); return; }
    }
    const box = this.computeEntitiesBoundingBox();
    if (box) box.getCenter(this._zoomPivot);
    else this._zoomPivot.set(0, 1, 0);
  }

  /**
   * Smooth exponential dolly along the camera's forward axis.
   * multiplier < 1 → zoom in, > 1 → zoom out.
   * Does NOT reset lookAt — preserves whatever direction the camera had.
   */
  private dollyCamera(multiplier: number): void {
    const cam = this.viewport.camera;
    cam.getWorldDirection(this._zoomForward);
    // Use a projected pivot distance so speed scales with how far away the action is.
    // Fallback to 10m when pivot is behind or too close (prevents jitter at origin).
    this._tmpVec.subVectors(this._zoomPivot, cam.position);
    let forwardDist = this._tmpVec.dot(this._zoomForward);
    // If we are looking away from the pivot or pivot is stale, recompute it.
    if (forwardDist < 0.5 || forwardDist > this._zoomMax) {
      this.refreshZoomPivot();
      this._tmpVec.subVectors(this._zoomPivot, cam.position);
      forwardDist = this._tmpVec.dot(this._zoomForward);
      if (forwardDist < 0.5) forwardDist = Math.max(cam.position.length(), 8);
    }
    const newForwardDist = THREE.MathUtils.clamp(forwardDist * multiplier, this._zoomMin, this._zoomMax);
    const delta = newForwardDist - forwardDist;
    // Moving opposite forward when delta positive means zoom out (backward). Actually
    // forwardDist grows when zooming out, so delta = new - old >0 → move backward.
    // We need: newPos = oldPos - forward * delta  (since forwardDist is distance along forward to pivot)
    // But pivot = pos + forward * forwardDist. To keep same forwardDir while changing distance,
    // pos' = pivot - forward * newForwardDist = (pos + forward*forwardDist) - forward*new = pos - forward*(new-old)
    cam.position.addScaledVector(this._zoomForward, -delta);
    cam.updateMatrixWorld();
    this.editorCamera.syncToCamera();
  }

  /** Wheel-driven zoom — converts raw deltaY to an exponential multiplier. */
  dollyByWheel(deltaY: number): void {
    if (deltaY === 0) return;
    // Normalize: typical notch is ~100px, trackpad can be 5-30. Clamp multiplier per frame.
    const clamped = THREE.MathUtils.clamp(deltaY, -300, 300);
    // Exponential: 100 → factor 1.22, -100 → 0.82, preserves feel across devices.
    const factor = Math.exp(clamped * 0.0018);
    this.dollyCamera(factor);
  }

  // --- Camera presets -----------------------------------------------------
  get currentCameraPresetId(): string | null { return this._currentPresetId; }
  get cameraPresets(): readonly CameraPreset[] { return CAMERA_PRESETS; }

  listCameraPresets(): CameraPreset[] { return [...CAMERA_PRESETS]; }

  getCameraPreset(id: string): CameraPreset | undefined { return getCameraPreset(id); }

  /**
   * Apply a named camera preset. By default it anchors to the current selection
   * or scene bounding-box so the preset isn't stranded at world origin when the
   * action is elsewhere. Pass `anchorToSelection:false` for literal world coords.
   */
  applyCameraPreset(id: string, opts: { anchorToSelection?: boolean; pivot?: THREE.Vector3 } = {}): boolean {
    const preset = getCameraPreset(id);
    if (!preset) return false;
    const cam = this.viewport.camera;
    let pivot: THREE.Vector3 | null = null;
    if (opts.pivot) pivot = opts.pivot;
    else if (opts.anchorToSelection !== false) {
      // Prefer selection, else scene centre
      const selId = this.selection.primary;
      if (selId !== null) {
        const rb = this.sceneManager.getRigidBody(selId);
        if (rb) pivot = rb.mesh.position.clone();
      }
      if (!pivot) {
        const box = this.computeEntitiesBoundingBox();
        if (box) pivot = box.getCenter(new THREE.Vector3());
      }
    }
    resolvePresetPose(preset, pivot, this._tmpPos, this._tmpLook);
    // Apply FOV first
    if (preset.fov !== undefined && Math.abs(cam.fov - preset.fov) > 0.01) {
      cam.fov = preset.fov;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(this._tmpPos);
    cam.lookAt(this._tmpLook);
    // Dutch roll — apply after lookAt
    if (preset.roll) {
      cam.getWorldDirection(this._zoomForward);
      const q = new THREE.Quaternion().setFromAxisAngle(this._zoomForward.clone().normalize(), preset.roll);
      cam.quaternion.multiply(q);
    }
    cam.updateMatrixWorld();
    this._zoomPivot.copy(this._tmpLook);
    this._currentPresetId = id;
    this.editorCamera.syncToCamera();
    return true;
  }

  cycleCameraPreset(dir: 1 | -1 = 1): string | null {
    const idx = CAMERA_PRESETS.findIndex(p => p.id === this._currentPresetId);
    const next = (idx < 0 ? 0 : (idx + dir + CAMERA_PRESETS.length) % CAMERA_PRESETS.length);
    const id = CAMERA_PRESETS[next].id;
    this.applyCameraPreset(id);
    return id;
  }

  /** Set the sun position + sky/IBL from a 24h clock hour (0–24). */
  setTimeOfDay(hour: number): void {
    const phi = THREE.MathUtils.degToRad(90 - Math.sin((hour - 6) / 12 * Math.PI) * 55);
    const theta = THREE.MathUtils.degToRad((hour / 24) * 360 - 90);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();
    const shadow = this.viewport.shadow as unknown as { sunDir?: THREE.Vector3; setSunDirection?: (d: THREE.Vector3) => void };
    if (shadow && shadow.sunDir) shadow.sunDir.copy(dir);
    if (shadow && shadow.setSunDirection) shadow.setSunDirection(dir);
    this.viewport.skyEnv.setSunDirection(dir, this.viewport.scene);
  }

  /**
   * High-resolution offscreen screenshot, independent of the viewport size. Renders
   * the scene to a temp target at the requested resolution, reads the pixels back,
   * encodes a PNG via a 2D canvas, and POSTs it to the dev server's `/api/screenshot`
   * endpoint so the IDE can pick the file up from disk. No-op in prod without a server.
   */
  async captureScreenshot(filename: string, width = 1920, height = 1080): Promise<void> {
    const renderer = this.viewport.renderer;
    const scene = this.viewport.scene;
    const mainCam = this.viewport.camera;
    // Clone the camera so the live viewport is undisturbed; fix aspect to the still size.
    const cam = mainCam.clone();
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    });
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevClearAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, cam);
      const pixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      // Flip vertically (WebGL origin is bottom-left; PNG is top-left).
      const flip = new Uint8Array(pixels.length);
      const rowBytes = width * 4;
      for (let y = 0; y < height; y++) {
        flip.set(pixels.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes), y * rowBytes);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(flip);
      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const res = await fetch(`/api/screenshot?name=${encodeURIComponent(safe)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) console.warn('[Engine] screenshot upload failed:', res.status);
    } catch (err) {
      console.warn('[Engine] captureScreenshot failed:', err);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClear, prevClearAlpha);
      target.dispose();
    }
  }

  /** One-command cinematic look — `engine.setVisualStyle('golden_hour')` wraps `set_visual_style`. */
  setVisualStyle(style: import('../features/VisualStyles').VisualStyleName): void {
    this.aiBridge.execute({ type: 'set_visual_style', style });
  }
  bakeScene(name = 'default'): void { this.aiBridge.execute({ type: 'bake_scene', name }); }
  applyBake(name: string): void { this.aiBridge.execute({ type: 'bake_apply', name }); }
  listBakes(): void { this.aiBridge.execute({ type: 'bake_list' }); }
  bakeAO(options: { samples?: number; distance?: number; strength?: number; seed?: number } = {}): void {
    this.aiBridge.execute({ type: 'bake_ao', ...options });
  }
  bakeFlush(): void { this.aiBridge.execute({ type: 'bake_flush' }); }

  private getOrCreateAimIKSolver(entityId: number): AimIKSolver | undefined {
    const existing = this.aimSolvers.get(entityId);
    if (existing) return existing;
    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) return undefined;

    const bones: AimBoneConfig[] = [];
    rb.mesh.traverse((object) => {
      const bone = object as THREE.Bone;
      if (!bone.isBone) return;
      const name = bone.name.toLowerCase();
      if (name.includes('head')) bones.push({ bone, weight: 0.45 });
      else if (name.includes('neck')) bones.push({ bone, weight: 0.25 });
      else if (name.includes('spine2') || name.includes('chest')) bones.push({ bone, weight: 0.2 });
      else if (name.includes('spine1') || name.endsWith('spine')) bones.push({ bone, weight: 0.1 });
    });
    if (bones.length === 0) return undefined;
    const total = bones.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    for (const entry of bones) entry.weight /= total;
    const solver = new AimIKSolver(bones);
    this.aimSolvers.set(entityId, solver);
    return solver;
  }

  private setAimIKTarget(entityId: number, worldTarget: THREE.Vector3, weight: number): boolean {
    if (weight <= 0) {
      this.aimTargets.delete(entityId);
      return true;
    }
    if (!this.getOrCreateAimIKSolver(entityId)) return false;
    this.aimTargets.set(entityId, { worldTarget: worldTarget.clone(), weight: THREE.MathUtils.clamp(weight, 0, 1) });
    return true;
  }

  private updateAimIKTargets(): void {
    for (const [entityId, target] of Array.from(this.aimTargets.entries())) {
      const solver = this.getOrCreateAimIKSolver(entityId);
      if (!solver || !this.sceneManager.getRigidBody(entityId)) {
        this.aimTargets.delete(entityId);
        this.aimSolvers.delete(entityId);
        continue;
      }
      this.worldOrigin.toEngineSpaceInto(this._aimEngineTarget, target.worldTarget);
      solver.aimAt(this._aimEngineTarget, target.weight);
    }
  }

  getLocomotor(entityId?: number): CharacterLocomotor | undefined {
    if (entityId === undefined || entityId === this.player.getPossessedId()) {
      return this.player.getLocomotor() ?? undefined;
    }
    return this.sceneManager.getComponent<CharacterLocomotorComponent>(entityId, 'characterLocomotor')?.controller ?? undefined;
  }

  /** Queue a batch of AI commands from the IDE / REPL (`window.engine.runScript([...])`). */
  runScript(commands: AICommand[]): void {
    this.aiBridge.executeAll(commands);
  }

  /** SENSORIUM: run a fully-authored test script. Resolves with the SensoriumReport
   *  once the recording is saved, the feel is analyzed, and artifacts are POSTed. */
  runSensorium(script: TestScript): Promise<SensoriumReport> {
    return this.sensorium.run(script);
  }
  /** SENSORIUM: generate + run a scenario by profile name ("driving", "locomotion",
   *  "jump", "combat", "camera", "stress"). This is the one-liner an agent uses to
   *  "test the driving mechanics" — the engine drives the real PlayerController. */
  testSensorium(profile: ScenarioProfile, opts?: ScenarioOptions): Promise<SensoriumReport> {
    return this.sensorium.test(profile, opts);
  }
  /** SENSORIUM: stop the currently-active test (if any). */
  abortSensorium(): void {
    this.sensorium.abort();
  }

  /** HELM: handle one agent control-plane request, resolving with a structured result. */
  runHelm(req: HelmRequest): Promise<HelmResponse> {
    return this.helm.handle(req);
  }

  /** @deprecated Use {@link runSensorium}. */
  runPlayback(script: TestScript): Promise<SensoriumReport> {
    return this.sensorium.run(script);
  }
  /** @deprecated Use {@link abortSensorium}. */
  abortPlayback(): void {
    this.sensorium.abort();
  }

  /** Spawn a VFX emitter at a WORLD-space position; the engine owns + updates it. */
  spawnVfx(
    preset: VfxPresetName,
    worldPos: THREE.Vector3,
    opts: { duration?: number; loop?: boolean; maxParticles?: number; collide?: boolean; bounce?: number } = {},
  ): ParticleEmitter {
    this.worldOrigin.toEngineSpaceInto(this._vfxEng, worldPos);
    const emitter = new ParticleEmitter(this.viewport.scene, this._vfxEng.clone(), {
      preset,
      duration: opts.duration,
      loop: opts.loop,
      maxParticles: opts.maxParticles,
      collide: opts.collide
        ? (origin, dir, maxDist) => {
            const hit = this.physicsWorld.raycast(origin, dir, maxDist, true);
            return hit ? hit.toi : null;
          }
        : undefined,
      bounce: opts.bounce,
    });
    this.particleEmitters.add(emitter);
    return emitter;
  }

  /** One-shot VFX burst at a WORLD-space position. */
  burstVfx(preset: VfxPresetName, worldPos: THREE.Vector3, count = 40): ParticleEmitter {
    this.worldOrigin.toEngineSpaceInto(this._vfxEng, worldPos);
    const emitter = new ParticleEmitter(this.viewport.scene, this._vfxEng.clone(), {
      preset,
      loop: false,
      duration: 0.2,
    });
    emitter.burst(count);
    this.particleEmitters.add(emitter);
    return emitter;
  }

  /**
   * Spawns a "stock enemy" for prototyping, complete with physics, a model, and 
   * the built-in StockEnemyAI script (chase, health, damage, vfx).
   */
  async spawnEnemy(presetId: string, worldPos: THREE.Vector3): Promise<number> {
    // The model must live in the AssetCache before the (synchronous) glbInstance builder
    // checks it out, so preload it first. `presetId` is an AssetManifest id — e.g. one of
    // the registered enemy presets ('Akademiks', 'Granny', 'JellyRoll').
    if (this.manifest.get(presetId)) await this.manifest.preload([presetId]);

    // Dynamic body + bounding-box collider (glbInstance). Rotations are locked so a chasing
    // enemy slides upright instead of toppling from contact torque.
    const eid = this.sceneManager.spawnNow(worldPos, {
      kind: 'glbInstance',
      params: { assetId: presetId },
    });
    this.sceneManager.getRigidBody(eid)?.rapierBody.lockRotations(true, true);

    // Attach the built-in chase / hurt / attack behaviour.
    this.sceneManager.addScript(eid, STOCK_ENEMY_AI_SCRIPT);
    return eid;
  }

  /**
   * AI-native semantic spawn — `await engine.spawn('rusty red car', pos)`.
   *
   * Resolves the free-text query to a tagged asset via the SemanticAssetRegistry, preloads
   * it, and spawns a `semanticInstance` with the parsed material dressing (tint + procedural
   * rust/dirt + metalness/roughness) and an auto-fitted COMPOUND collider — so an agent never
   * spawns a raw mesh with no physics or the wrong look. Resolves with the new entity id, or
   * null if nothing matched the query.
   */
  async spawn(
    query: string,
    worldPos: THREE.Vector3,
    opts: { dynamic?: boolean; scale?: number; compound?: boolean } = {},
  ): Promise<number | null> {
    const resolution = this.assets.resolve(query);
    if (!resolution) {
      console.warn(`[Engine] spawn('${query}'): no asset matched (register GLBs with semantic tags).`);
      return null;
    }
    if (this.manifest.get(resolution.assetId)) await this.manifest.preload([resolution.assetId]);
    return this.sceneManager.spawnNow(worldPos, {
      kind: 'semanticInstance',
      params: {
        assetId: resolution.assetId,
        dynamic: opts.dynamic ?? true,
        scale: opts.scale ?? 1,
        compound: opts.compound ?? true,
        ...resolution.material,
      },
    });
  }

  // --- Gameplay-logic host adapters --------------------------------------
  private readonly _gpWorld = new THREE.Vector3();
  private _gpEntityCache: { token: number; list: GpEntitySnapshot[] } | null = null;

  /** World-space snapshot of every physics entity for the GameplayDirector (zone
   *  occupancy + entity conditions). Memoized per frame (keyed on elapsed time) so
   *  multiple reads in one tick don't re-walk the scene. */
  private listGameplayEntities(): GpEntitySnapshot[] {
    const token = this.time.elapsed;
    if (this._gpEntityCache && this._gpEntityCache.token === token) return this._gpEntityCache.list;
    const list: GpEntitySnapshot[] = [];
    for (const id of this.sceneManager.allEntityIds()) {
      const rb = this.sceneManager.getRigidBody(id);
      if (!rb) continue;
      this.worldOrigin.toWorldSpaceInto(this._gpWorld, rb.mesh.position);
      list.push({
        id,
        name: this.aiBridge?.getEntityName(id),
        kind: this.sceneManager.getBlueprint(id)?.kind,
        tags: this.sceneManager.getTags(id),
        x: this._gpWorld.x, y: this._gpWorld.y, z: this._gpWorld.z,
      });
    }
    this._gpEntityCache = { token, list };
    return list;
  }

  /** Possessed player's WORLD position (or null if nobody is possessed). */
  private getPlayerWorldPosition(): { x: number; y: number; z: number } | null {
    const id = this.player?.getPossessedId();
    if (id === null || id === undefined) return null;
    const rb = this.sceneManager.getRigidBody(id);
    if (!rb) return null;
    this.worldOrigin.toWorldSpaceInto(this._gpWorld, rb.mesh.position);
    return { x: this._gpWorld.x, y: this._gpWorld.y, z: this._gpWorld.z };
  }

  private readonly _gpForward = new THREE.Vector3();
  /** Player pose for the InteractionSystem: possessed body world position + camera
   *  forward (what the player is aiming at). Null when nobody is possessed. */
  private getPlayerPose(): { x: number; y: number; z: number; fx: number; fy: number; fz: number } | null {
    const pos = this.getPlayerWorldPosition();
    if (!pos) return null;
    this.viewport.camera.getWorldDirection(this._gpForward);
    return { ...pos, fx: this._gpForward.x, fy: this._gpForward.y, fz: this._gpForward.z };
  }

  // --- Save-game host adapters --------------------------------------------
  private readonly _saveVec = new THREE.Vector3();
  /** Possessed player's WORLD transform for a save bundle (pos + quaternion), or null. */
  private capturePlayerTransform(): { pos: [number, number, number]; quat: [number, number, number, number] } | null {
    const id = this.player?.getPossessedId();
    if (id === null || id === undefined) return null;
    const rb = this.sceneManager.getRigidBody(id);
    if (!rb) return null;
    this.worldOrigin.toWorldSpaceInto(this._saveVec, rb.mesh.position);
    const q = rb.mesh.quaternion;
    return { pos: [this._saveVec.x, this._saveVec.y, this._saveVec.z], quat: [q.x, q.y, q.z, q.w] };
  }

  /** Teleport the possessed player to a saved WORLD transform (or cache it if nobody is possessed). */
  private applyPlayerTransform(pos: [number, number, number], quat: [number, number, number, number]): void {
    const id = this.player?.getPossessedId();
    if (id === null || id === undefined) {
      this.pendingPlayerTransform = { pos, quat };
      return;
    }
    const rb = this.sceneManager.getRigidBody(id);
    if (!rb) {
      this.pendingPlayerTransform = { pos, quat };
      return;
    }
    this._saveVec.set(pos[0], pos[1], pos[2]);
    this.worldOrigin.toEngineSpaceInto(this._saveVec, this._saveVec);
    rb.teleport(this._saveVec.clone(), new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]));
  }

  /** Apply and clear any pending player transform for the newly possessed entity. */
  consumePendingPlayerTransform(entityId: number): void {
    if (!this.pendingPlayerTransform) return;
    const rb = this.sceneManager.getRigidBody(entityId);
    if (rb) {
      const { pos, quat } = this.pendingPlayerTransform;
      this._saveVec.set(pos[0], pos[1], pos[2]);
      this.worldOrigin.toEngineSpaceInto(this._saveVec, this._saveVec);
      rb.teleport(this._saveVec.clone(), new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]));
    }
    this.pendingPlayerTransform = null;
  }

  /** Names of saved slots (localStorage keys under the mix_save_ prefix). */
  private listSaveSlots(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mix_save_')) out.push(k.slice('mix_save_'.length));
      }
    } catch { /* localStorage unavailable */ }
    return out;
  }

  /** Full mutable world snapshot for SaveSystem — entities, hierarchy, scripts, tags, terrain. */
  private async captureWorldSnapshot(): Promise<string | null> {
    try {
      const sm: any = this.sceneManager;
      const entities: any[] = [];
      const guidMap = new Map<number, string>();
      for (const id of sm.allEntityIds()) {
        const g = typeof sm.ensureGuid === 'function' ? sm.ensureGuid(id) : (sm.getGuid?.(id) ?? (() => {
          try { const c: any = (globalThis as any).crypto; if (c?.randomUUID) return c.randomUUID(); } catch {}
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
            const r = (Math.random() * 16) | 0; const v = ch === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
          });
        })());
        guidMap.set(id, g);
      }
      for (const id of sm.allEntityIds()) {
        const rb = sm.getRigidBody(id); const bp = sm.getBlueprint(id);
        if (!rb || !bp) continue;
        if (bp.kind === 'dojo' || bp.kind === 'mapModel') continue;
        if (bp.kind === 'box' && bp.params.hx === 50 && bp.params.hy === 0.5 && bp.params.hz === 50 && bp.params.dynamic === false) continue;
        const worldPos = new THREE.Vector3(); this.worldOrigin.toWorldSpaceInto(worldPos, rb.mesh.position);
        const q = rb.mesh.quaternion; const s = rb.mesh.scale;
        const body = rb.rapierBody; let bodyType = 'dynamic';
        try { if (body.isFixed()) bodyType = 'fixed'; else if (body.isKinematic()) bodyType = 'kinematic'; } catch {}
        const parentId = sm.getParent(id);
        const scriptComp: any = sm.getComponent?.(id, 'script');
        const rec: any = {
          guid: guidMap.get(id),
          parentGuid: parentId !== undefined ? (guidMap.get(parentId) ?? null) : null,
          name: (this as any).aiBridge?.getEntityName?.(id),
          tags: sm.getTags(id), blueprint: bp,
          position: [worldPos.x, worldPos.y, worldPos.z],
          quaternion: [q.x, q.y, q.z, q.w], scale: [s.x, s.y, s.z],
          bodyType, additionalMass: rb.additionalMass, rootMotion: sm.isRootMotion(id),
          scriptSource: scriptComp?.sourceCode ?? null,
        };
        if (bp.kind === 'terrain' && rb.mesh.userData.terrain) {
          rec.terrainBase64 = await rb.mesh.userData.terrain.hm.toBase64Async();
          rec.splatBase64 = await rb.mesh.userData.terrain.splatMap?.toBase64Async();
        }
        entities.push(rec);
      }
      // Capture runtime systems previously omitted (joints, ragdolls, nav, tweens, audio, vfx, foliage)
      const runtime: any = {};
      try {
        if ((this as any).jointSystem?.serialize) runtime.joints = (this as any).jointSystem.serialize();
        if ((this as any).nav?.getAgentCount) runtime.navAgents = (this as any).nav.getAgentCount();
        if ((this as any).tweens?.serialize) runtime.tweens = (this as any).tweens.serialize();
      } catch {}
      return await stringifyAsync({ v: 1, entities, chunkDeltas: null, runtime: Object.keys(runtime).length ? runtime : null });
    } catch { return null; }
  }

  private restoreWorldSnapshot(snapshot: string): void {
    try {
      const data = JSON.parse(snapshot);
      if (!data || !Array.isArray(data.entities)) return;
      // Validate all terrain payload sizes before destroying the current world. A bad
      // save must fail atomically instead of replacing valid terrain with flat fields.
      for (const ent of data.entities) {
        if (ent?.blueprint?.kind !== 'terrain' || !ent.terrainBase64) continue;
        const params = ent.blueprint.params ?? {};
        const res = Number(params.resolution ?? 257);
        const splatRes = Number(params.splatResolution ?? (res - 1));
        if (!Number.isInteger(res) || res < 2 || decodedBase64Length(ent.terrainBase64) !== res * res * 4) {
          throw new Error(`Invalid terrain height payload for '${ent.guid ?? ent.legacyId ?? 'unknown'}'`);
        }
        if (ent.splatBase64 && decodedBase64Length(ent.splatBase64) !== splatRes * splatRes * 4) {
          throw new Error(`Invalid terrain splat payload for '${ent.guid ?? ent.legacyId ?? 'unknown'}'`);
        }
      }
      const sm: any = this.sceneManager;
      // Clear existing (keep physics world alive)
      const ids = sm.allEntityIds();
      for (const id of ids) sm.requestDestroy(id);
      sm.flushDeferredOperations();
      // Also clear world origin drift? Do not reset camera — only world entities.
      const guidToId = new Map<string, number>();
      for (const ent of data.entities) {
        const worldPos = new THREE.Vector3(ent.position[0], ent.position[1], ent.position[2]);
        const id = sm.spawnNow(worldPos, ent.blueprint, { rootMotion: !!ent.rootMotion });
        if (ent.guid) {
          if (typeof sm.setGuid === 'function') sm.setGuid(id, ent.guid);
          guidToId.set(ent.guid, id);
        }
        const rb = sm.getRigidBody(id);
        if (rb) {
          rb.mesh.quaternion.set(ent.quaternion[0], ent.quaternion[1], ent.quaternion[2], ent.quaternion[3]);
          rb.mesh.scale.set(ent.scale[0], ent.scale[1], ent.scale[2]);
          rb.rescaleCollider(); rb.resetInterpolationBuffers(); rb.syncToPhysics();
          try {
            const body = rb.rapierBody; const R = this.physicsWorld.RAPIER;
            if (ent.bodyType === 'fixed') body.setBodyType(R.RigidBodyType.Fixed, true);
            else if (ent.bodyType === 'kinematic') body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
            else body.setBodyType(R.RigidBodyType.Dynamic, true);
          } catch {}
          if (ent.additionalMass !== undefined) rb.setAdditionalMass(ent.additionalMass);
          if (ent.tags) for (const t of ent.tags) sm.addTag(id, t);
          if (ent.name) (this as any).aiBridge?.setEntityName?.(id, ent.name);
          if (ent.scriptSource) try { sm.addScript(id, ent.scriptSource); } catch {}
          if (ent.terrainBase64 && rb.mesh.userData.terrain) {
            try {
              if (!rb.mesh.userData.terrain.hm.fromBase64(ent.terrainBase64)) {
                throw new Error('Terrain height payload length changed during restore');
              }
              rb.mesh.userData.terrain.rebuildCollider();
              rb.mesh.userData.terrain.applyRect({ i0: 0, i1: rb.mesh.userData.terrain.hm.res - 1, j0: 0, j1: rb.mesh.userData.terrain.hm.res - 1 });
              if (ent.splatBase64 && !rb.mesh.userData.terrain.splatMap.fromBase64(ent.splatBase64)) {
                throw new Error('Terrain splat payload length changed during restore');
              }
            } catch (err) {
              console.warn('[Engine] terrain restore failed:', err);
              throw err;
            }
          }
        }
      }
      for (const ent of data.entities) {
        if (!ent.parentGuid || !ent.guid) continue;
        const cid = guidToId.get(ent.guid); const pid = guidToId.get(ent.parentGuid);
        if (cid !== undefined && pid !== undefined) sm.parentEntity(cid, pid);
      }
      sm.flushDeferredOperations();
    } catch (err) { console.warn('[Engine] restoreWorldSnapshot failed:', err); }
  }

  /** SpawnerSystem host: spawn a blueprint at a WORLD position (immediate, like
   *  spawnEnemy, so the new id is returned). Entities go to GLOBAL_CHUNK so streaming
   *  doesn't unload them. Returns null if the spawn throws (e.g. GLB not preloaded). */
  private spawnFromSpawner(blueprint: EntityBlueprint, x: number, y: number, z: number): number | null {
    try {
      return this.sceneManager.spawnNow(new THREE.Vector3(x, y, z), blueprint, {
        chunkId: GLOBAL_CHUNK,
        rootMotion: blueprint.kind === 'character',
      });
    } catch (err) {
      console.warn('[Engine] spawner spawn failed (asset preloaded?):', (err as Error).message);
      return null;
    }
  }

  /** Show/update (or hide, when text is null) the on-screen interaction prompt. */
  private _interactPromptEl: HTMLElement | null = null;
  private showInteractionPrompt(text: string | null, _entityId?: number): void {
    if (typeof document === 'undefined') return;
    if (text === null) {
      if (this._interactPromptEl) this._interactPromptEl.style.display = 'none';
      return;
    }
    if (!this._interactPromptEl) {
      const el = document.createElement('div');
      el.id = 'mix-interact-prompt';
      el.style.cssText =
        'position:fixed;left:50%;bottom:14%;transform:translateX(-50%);z-index:9000;' +
        'padding:8px 16px;border-radius:8px;background:rgba(0,0,0,0.66);color:#fff;' +
        'font:600 14px/1.2 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none;' +
        'border:1px solid rgba(255,255,255,0.18);box-shadow:0 2px 12px rgba(0,0,0,0.4)';
      (document.body ?? document.documentElement).appendChild(el);
      this._interactPromptEl = el;
    }
    this._interactPromptEl.innerHTML = `<span style="opacity:.7">[E]</span> ${escapeHtml(text)}`;
    this._interactPromptEl.style.display = 'block';
  }

  private updateParticleEmitters(dt: number): void {
    if (this.particleEmitters.size === 0) return;
    for (const emitter of this.particleEmitters) {
      emitter.update(dt);
      if (emitter.finished) {
        emitter.dispose();
        this.particleEmitters.delete(emitter);
      }
    }
  }

  /** AIBridge.add_light adds a follow-camera light straight to the scene; this flag tells
   *  the loop to rescan once and pick it up (instead of scanning every single frame). */
  private dynamicLightsDirty = false;
  private presentedWeather: 'clear' | 'rain' | 'snow' | 'haze' = 'clear';
  markDynamicLightsDirty(): void {
    this.dynamicLightsDirty = true;
    this.advancedLightsDirty = true;
  }

  /** Re-anchor camera-following ad-hoc lights (created via the `add_light` command). */
  private updateDynamicLights(): void {
    if (this.dynamicLightsDirty) {
      this.dynamicLightsDirty = false;
      for (const child of this.viewport.scene.children) {
        if ((child as unknown as { isLight?: boolean }).isLight && child.userData.followCamera) {
          this.dynamicLights.add(child as THREE.Light);
        }
      }
    }
    if (this.dynamicLights.size === 0) return;
    const camPos = this.viewport.camera.position;
    for (const light of this.dynamicLights) {
      if (!light.parent) { this.dynamicLights.delete(light); continue; }
      const offset = light.userData.followOffset as THREE.Vector3 | undefined;
      if (offset) light.position.copy(camPos).add(offset);
      if (light.userData.targetFollowsCamera && (light as THREE.SpotLight).target) {
        (light as THREE.SpotLight).target.position.copy(camPos);
        (light as THREE.SpotLight).target.updateMatrixWorld();
      }
    }
  }

  createReflectionProbe(id: string, worldPosition: THREE.Vector3, config: ReflectionProbeConfig = {}): boolean {
    this.removeReflectionProbe(id);
    this.worldOrigin.toEngineSpaceInto(this._probeEngine, worldPosition);
    const probe = new ReflectionProbe(this._probeEngine, config);
    this.reflectionProbes.set(id, probe);
    this.reflectionProbeWorldPositions.set(id, worldPosition.clone());
    return true;
  }

  removeReflectionProbe(id: string): boolean {
    const probe = this.reflectionProbes.get(id);
    if (!probe) return false;
    probe.dispose();
    this.reflectionProbes.delete(id);
    this.reflectionProbeWorldPositions.delete(id);
    return true;
  }

  /** Build the live light grid, enforce the shadow budget, and refresh one dirty probe. */
  private updateAdvancedLighting(): void {
    let lightCount = 0;
    const liveShadowIds = this.liveShadowIds;
    liveShadowIds.clear();
    const entityRevision = this.sceneManager.structuralRevision;
    const viewportRevision = this.viewport.lightRevision;
    if (
      this.advancedLightsDirty ||
      entityRevision !== this.advancedLightsEntityRevision ||
      viewportRevision !== this.advancedLightsViewportRevision
    ) {
      this.advancedLights.length = 0;
      this.viewport.scene.traverse((object) => {
        const light = object as THREE.Light;
        if (light.isLight) this.advancedLights.push(light);
      });
      this.viewport.setDirectionalLights(this.advancedLights);
      this.advancedLightsDirty = false;
      this.advancedLightsEntityRevision = entityRevision;
      this.advancedLightsViewportRevision = this.viewport.lightRevision;
    }

    for (const baseLight of this.advancedLights) {
      if (!baseLight.parent) { this.advancedLightsDirty = true; continue; }
      const light = baseLight as THREE.Light & {
        distance?: number;
        castShadow?: boolean;
        shadow?: { mapSize: THREE.Vector2 };
      };

      let record = this.clusteredLights[lightCount];
      if (!record) {
        record = { position: new THREE.Vector3(), radius: 0 };
        this.clusteredLights[lightCount] = record;
      }
      light.getWorldPosition(record.position);
      record.radius = Math.max(0.1, light.distance && light.distance > 0 ? light.distance : 200);
      lightCount++;

      if (light.castShadow && light.shadow) {
        let id = this.shadowLightIds.get(light);
        if (!id) {
          id = `runtime_light_${this.nextShadowLightId++}`;
          this.shadowLightIds.set(light, id);
        }
        liveShadowIds.add(id);
        const desired = Math.max(light.shadow.mapSize.x, light.shadow.mapSize.y, 256);
        const tile = this.shadowAtlas.allocate(id, desired);
        if (tile) light.shadow.mapSize.set(tile.size, tile.size);
      }
    }
    this.clusteredLights.length = lightCount;
    this.lightCluster.build(this.clusteredLights, this.viewport.camera);
    for (const id of this.shadowAtlas.allocatedIds()) {
      if (typeof id === 'string' && id.startsWith('runtime_light_') && !liveShadowIds.has(id)) {
        this.shadowAtlas.free(id);
      }
    }

    for (const [id, probe] of this.reflectionProbes) {
      const worldPosition = this.reflectionProbeWorldPositions.get(id);
      if (worldPosition) {
        this.worldOrigin.toEngineSpaceInto(this._probeEngine, worldPosition);
        if (probe.position.distanceToSquared(this._probeEngine) > 1e-8) probe.setPosition(this._probeEngine);
      }
      if (!probe.dirty) continue;
      probe.capture(this.viewport.renderer, this.viewport.scene);
      this.applyReflectionProbe(probe);
      break; // amortize cubemap captures across frames
    }
  }

  private applyReflectionProbe(probe: ReflectionProbe): void {
    this.viewport.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.getWorldPosition(this._probeObjectPos);
      const p = this._probeObjectPos;
      if (
        p.x < probe.boxMin.x || p.x > probe.boxMax.x ||
        p.y < probe.boxMin.y || p.y > probe.boxMax.y ||
        p.z < probe.boxMin.z || p.z > probe.boxMax.z
      ) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const envMaterial = material as THREE.MeshStandardMaterial;
        if (!('envMap' in envMaterial)) continue;
        envMaterial.envMap = probe.renderTarget.texture;
        envMaterial.envMapIntensity = probe.intensity;
        envMaterial.needsUpdate = true;
      }
    });
  }

  /** Bridge the simulation-facing weather/fog state into the live renderer and effects. */
  private syncAtmospherePresentation(): void {
    const weather = this.weatherSystem;
    let kind: 'clear' | 'rain' | 'snow' | 'haze' = 'clear';
    let intensity = 0;
    if (weather.snowIntensity > weather.rainIntensity && weather.snowIntensity > 0.02) {
      kind = 'snow';
      intensity = weather.snowIntensity;
    } else if (weather.rainIntensity > 0.02) {
      kind = 'rain';
      intensity = weather.rainIntensity;
    } else if (weather.fogDensity > 0.025) {
      kind = 'haze';
      intensity = THREE.MathUtils.clamp(weather.fogDensity / 0.08, 0, 1);
    }
    if (kind !== this.presentedWeather) {
      this.effects.setWeather(kind, { intensity });
      this.presentedWeather = kind;
    } else {
      this.effects.setWeatherIntensity(intensity);
    }

    this.wind.set({ strength: weather.windSpeed / 5 });
    this.clouds.setParams({ coverage: weather.cloudCover });
    this.viewport.scene.userData.weather = {
      type: weather.currentWeather,
      wetness: weather.wetness,
      rainIntensity: weather.rainIntensity,
      snowIntensity: weather.snowIntensity,
      windSpeed: weather.windSpeed,
    };

    const fog = this.volumetricFog;
    const density = Math.max(fog.density, weather.fogDensity);
    this.viewport.skyEnv.setFogDensity(density, this.viewport.scene);
    const pass = this.viewport.pipeline.volumetricFogPass;
    if (pass) {
      pass.enabled = density > 0.00001;
      pass.uniforms.density.value = density;
      pass.uniforms.heightFalloff.value = fog.heightFalloff;
      pass.uniforms.fogBaseHeight.value = fog.groundLevel - this.worldOrigin.offset.y;
      pass.uniforms.fogColor.value.copy(fog.color);
      pass.uniforms.anisotropy.value = fog.anisotropy;
      pass.uniforms.maxDistance.value = fog.maxDistance;
    }
  }

  private readonly _vfxEng = new THREE.Vector3();

  // --- Loop ---------------------------------------------------------------
  private start(): void {
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  private readonly loop = (timestamp: number): void => this.runFrame(timestamp);

  private runFrame(timestamp: number): void {
    if (this.disposed) return;

    // Error containment: any throw in a subsystem must NOT kill the rAF loop.
    // We log and reschedule so a single bad frame (e.g. a corrupt GLB) doesn't freeze
    // the entire engine.
    try {
      this.profiler.beginFrame();
      // 1
      this.aiBridge.processQueue();
      this.gameplayFeatures.pause.update();
      this.time.setTimeScale(this.gameplayFeatures.pause.isPaused ? 0 : this.timeDilation.getGlobalTimeScale());
      this.time.update(timestamp);
      this.gameplayFeatures.updateRealtime(this.time.wallClockDt);
      if (this.gameplayFeatures.pause.isPaused) {
        this.viewport.render();
        this.profiler.endFrame(this.viewport.renderer, this.viewport.scene);
      } else {
      this.timeDilation.update(this.time.wallClockDt * 1000);
      // 1b — capture input snapshot if recording
      this.replay.captureSnapshot();
      // 1c — if replaying, advance one frame
      this.replay.tick();
      // 2
      // Cinematic override: while a sequence is playing, the scripted camera owns the
      // viewport — the editor flycam, the player third-person camera, and pointer lock
      // are all suppressed so the AI can direct a clean cutscene.
      const cinematicActive = this.cinematic.active || this.cutsceneDirector.active;
      if (cinematicActive) {
        this.editorCamera.enabled = false;
        if (this.cutsceneDirector.active) this.cutsceneDirector.update(this.time.dt);
        if (this.cinematic.active) this.cinematic.update(this.time.dt);
      } else {
        // Only the loop manages the flycam enable flag, but it never fights an in-progress
        // gizmo drag (the gizmo's dragging-changed handler owns it while dragging).
        if (!this.gizmo.dragging) {
          this.editorCamera.enabled = this.input.mode === 'editor' || this.player.getPossessedId() === null;
        }
        this.editorCamera.update(this.time.dt);
        this.player.update(this.time.dt);
        if (this.multiTargetCamera.hasTargets) {
          this.multiTargetCamera.update(this.viewport.camera, this.sceneManager, this.time.wallClockDt);
        }
      }
      this.processEditorInput();
      for (const hook of this.updateHooks) hook(this.time.dt);
      this.profiler.mark('input+hooks');
      // 3
      this.chunkManager.update();
      // 4 — command queue is processed before the pause gate.
      // Advance AI-driven path followers (per-frame, outside the 2ms sync budget).
      this.aiBridge.update(this.time.dt);
      // Advance navigation agents (pathfinding + steering + behavior trees). Runs after
      // the AIBridge so any nav commands dispatched this frame are reflected the same frame.
      this.nav.update(this.time.dt);
      // Advance the combat system (projectiles + damage queue). Runs after nav so
      // projectile hits land on agents that have already moved this frame.
      this.combat.update(this.time.dt);
      // Advance runtime scripts (user/IDE gameplay logic).
      for (let i = 0; i < this.sceneManager.scriptList.length; i++) {
        const script = this.sceneManager.scriptList[i];
        const entityId = this.sceneManager.scriptEntityAt(i);
        const scale = entityId === undefined ? 1 : this.timeDilation.getEntityTimeScale(entityId);
        script.update(this.time.wallClockDt * scale);
      }
      // Advance modular ECS components (render rate).
      this.sceneManager.lifecycle.stepUpdate(this.time.dt);
      // Advance the declarative gameplay-logic director (timers, zone occupancy, rules).
      // Runs after scripts so a script that moved an entity is reflected in zone checks.
      this.gameplay.update(this.time.dt);
      this.gameplayFeatures.update(this.time.dt);
      // World-space interaction (proximity/facing prompt + interact key). After gameplay
      // so an interactable disabled by a rule this frame is respected immediately.
      this.interaction.update(this.time.dt);
      // Declarative spawners (time-based spawning + wave-clear detection). Uses the
      // immediate spawnNow, same as scripts that call engine.spawnEnemy mid-loop.
      this.spawner.update(this.time.dt);
      // Audio listener + attached sources follow the camera every frame.
      this.audio.update(this.viewport.camera, this.time.dt);
      this.worldOrigin.toWorldSpaceInto(this._reverbWorld, this.viewport.camera.position);
      this.reverb.update(this._reverbWorld, this.time.dt);
      // Re-anchor camera-following lights so they stay near the action across origin shifts.
      this.updateDynamicLights();
      // 5 — advance mixers (smooth pose) and ACCUMULATE root motion.
      for (const asm of this.animationMachines) {
        const owningId = this.sceneManager.entityOf(asm.rigidBody);
        const animDt = owningId === null ? this.time.dt : this.time.wallClockDt * this.timeDilation.getEntityTimeScale(owningId);
        asm.update(animDt);
        const state = asm.currentState;
        const normalizedTime = asm.currentNormalizedTime;
        const entityId = owningId;
        if (state && normalizedTime !== null && entityId !== null) {
          this.animEventBridge.processState(entityId, state, normalizedTime);
          const previous = this.notifyState.get(entityId);
          const previousTime = previous?.state === state ? previous.time : 0;
          this.animNotifies.checkNotifies(state, previousTime, normalizedTime, (notify) => {
            this.sceneManager.events.emit(notify.event, { entityId, state, ...notify.payload });
          });
          this.notifyState.set(entityId, { state, time: normalizedTime });
        }
      }
      this.motion.update(this.time.dt);
      this.updateAimIKTargets();
      this.tweens.update(this.time.dt, this.time.wallClockDt);
      this.morphSystem.update(this.time.dt, this.viewport.camera.position);
      this.timelineSequencer.update(this.time.dt);
      this.decalSystem.update(this.time.dt);
      this.meshFracturer.update(this.time.dt);
      this.weatherSystem.update(this.time.dt);
      this.syncAtmospherePresentation();
      this.aiDirector.update(this.time.dt);
      this.network.update(this.time.dt);
      this.profiler.mark('gameplay+ai');

      // 6 — fixed-rate physics loop (capped).
      this.syncEntityHitstopPhysics();
      while (this.time.shouldStepPhysics()) {
        if (!this.physicsPaused) {
          // Player KCC locomotor fixed step
          this.player.fixedStep(this.time.fixedDt);
          for (const c of this.sceneManager.rootMotionList) c.consumeRootMotionForStep(this.time.fixedDt);
          // Modular ECS components fixed step (deterministic)
          this.sceneManager.lifecycle.stepFixed(this.time.fixedDt);
          this.clothSystem.fixedStep(this.time.fixedDt);
          this.buoyancy.fixedStep(this.time.fixedDt);
          this.activeRagdolls.fixedStep(this.time.fixedDt);
          // Joint break check & physics update
          this.jointSystem.fixedStep(this.time.fixedDt);
          // Vehicle physics: apply suspension + traction forces BEFORE the world step
          // so Rapier integrates them this step. Runs every fixed substep for stability.
          this.vehicles.preStep(this.time.fixedDt);
          this.physicsWorld.step(this.time.fixedDt);
          // Rapier ≥0.12 removed drainIntersectionEvents — sensor intersections now arrive
          // through the SAME collision-event stream, split apart in handleCollision below.
          this.physicsWorld.drainCollisionEvents(this.handleCollision);
          for (const rb of this.sceneManager.rigidBodyList) rb.syncFromPhysics();
        }
        this.time.consumeFixedStep();
      }

      // 7 — finalize the frame's interpolation factor + keep-ratio. `computeAlpha`
      // returns the kept-time ratio (<1 when MAX_SUBSTEPS saturated and physics debt
      // was dropped) so root motion can be dilated to match. Without this call
      // `time.alpha` stays 0 and every body renders one fixed step behind its actual
      // physics pose (visible stutter on smooth motion), and the debt-dropping branch
      // never runs (spiral of death under load).
      const keepRatio = this.time.computeAlpha();
      this.profiler.mark('physics');
      this.sceneManager.scalePendingRootMotion(keepRatio);

      // 8 — deferred flush: the single structural mutation point. Applies queued
      // spawns/destroys (from AI commands, collision handlers, scripts). Physics has
      // already stepped this frame so this is the safe point documented in the plan.
      this.sceneManager.flushDeferredOperations();
      this.chunkDeltas.endUnload();
      const previousPrimarySelection = this.selection.primary;
      this.selection.prune(this.sceneManager);
      if (this.selection.primary !== previousPrimarySelection) this.syncGizmoToSelection();

      // 9 — floating origin: recenter engine space when the camera drifts past the
      // threshold. Runs BEFORE interpolation so the shift is reflected in the
      // interpolation buffers (RigidBodyComponent.shiftOrigin updates prev/curr).
      this.chunkManager.checkFloatingOrigin(this.viewport.camera.position);

      // 10 — interpolation (gizmo-authority entities skip it). Each interpolate() call
      // also updates the mesh's matrixWorld so the parent-child pass below sees a
      // fresh parent matrix (otherwise the child teleports to a position computed from
      // the previous frame's parent matrix and visibly lags by one frame).
      const alpha = this.time.alpha;
      for (const rb of this.sceneManager.rigidBodyList) {
        if (rb.transformAuthority !== 'gizmo') rb.interpolate(alpha);
      }
      // 10b — logical parent-child attachments. Runs AFTER interpolation so the parent's
      // matrixWorld is current. teleport() resets the child's interpolation buffer to
      // the parent-derived pose, so the next frame interpolates from the new baseline.
      this.sceneManager.updateParentChildTransforms();
      // Post-interpolation, pre-render late update for modular components.
      this.sceneManager.lifecycle.stepLate(this.time.dt);
      // Secondary animation post-passes must run after mixers and interpolation.
      this.springBones.update(this.time.dt);
      this.footIK.update(this.time.dt);
      this.boneSockets.update(this.sceneManager);
      this.profiler.mark('transforms+animation');

      // 11 — re-anchor sun, advance VFX, draw, then run post-render hooks.
      this.updateParticleEmitters(this.time.dt);
      this.ribbonTrails.update(this.sceneManager);
      // Effects tick: trails, decals, weather, screen-flash CSS overlay. The
      // camera shake is applied as a per-frame offset that we revert in
      // `endFrame` so the underlying transform isn't drifted.
      this.effects.update(this.time.dt, this.time.elapsed);
      // Hierarchical frustum + occlusion cull (runs only if enabled via cull_enable).
      // Skips objects tagged userData.cullExclude; occluders tagged userData.occluder.
      // LOD update runs first so the cull sees the correct visible geometry.
      this.updateAdvancedLighting();
      this.lod.update();
      this.hlod.update(this.viewport.camera);
      this.gpuParticles.update(this.time.dt);
      this.culling.cull();
      this.debugDraw.update(this.time.dt);
      this.hud.update();
      this.actionCombatHud.update();
      this.viewport.pipeline.tick(this.time.elapsed);
      this.viewport.render();
      this.profiler.endFrame(this.viewport.renderer, this.viewport.scene);
      for (const hook of this.postRenderHooks) {
        try { hook(); } catch (err) { console.error('[Engine] post-render hook error (suppressed):', err); }
      }
      } // simulation pause gate
    } catch (err) {
      console.error('[Engine] frame loop error (suppressed to keep loop alive):', err);
    } finally {
      // Undo the per-frame camera shake so the next AI / cinematic write is
      // applied to the original transform.
      this.effects.endFrame();
      // 12
      this.input.endFrame();
    }

    this.frameHandle = requestAnimationFrame(this.loop);
  }

  private readonly handleCollision = (e: CollisionEvent): void => {
    // Sensor intersections share this stream (Rapier ≥0.12). Route any pair that
    // involves a sensor collider to script.onSensor; leave solid contacts for the
    // registered collision handlers.
    if (
      this.physicsWorld.isSensorCollider(e.colliderA) ||
      this.physicsWorld.isSensorCollider(e.colliderB)
    ) {
      this.handleIntersection(e.colliderA, e.colliderB, e.started);
      return;
    }
    // Emit collision events on the global bus and fan out to modular components.
    const entityA = this.entityFromCollider(e.colliderA);
    const entityB = this.entityFromCollider(e.colliderB);
    if (entityA !== null && entityB !== null) {
      const eventName = e.started ? 'collision_start' : 'collision_end';
      this.sceneManager.events.emit(eventName, { entityA, entityB });

      const infoA = { otherEntity: entityB, otherCollider: e.colliderB, selfCollider: e.colliderA };
      const infoB = { otherEntity: entityA, otherCollider: e.colliderA, selfCollider: e.colliderB };
      if (e.started) {
        this.sceneManager.lifecycle.dispatchCollisionEnter(entityA, infoA);
        this.sceneManager.lifecycle.dispatchCollisionEnter(entityB, infoB);
      } else {
        this.sceneManager.lifecycle.dispatchCollisionExit(entityA, infoA);
        this.sceneManager.lifecycle.dispatchCollisionExit(entityB, infoB);
      }
    }
    for (const h of this.collisionHandlers) h(e);
  };

  private syncEntityHitstopPhysics(): void {
    const live = new Set(this.sceneManager.rigidBodyList);
    for (let i = 0; i < this.sceneManager.rigidBodyList.length; i++) {
      const rb = this.sceneManager.rigidBodyList[i];
      const entityId = this.sceneManager.entityAtIndex(i);
      if (entityId === undefined) continue;
      const frozen = this.timeDilation.getEntityTimeScale(entityId) === 0;
      try {
        if (frozen && !this.hitstopFrozenBodies.has(rb) && rb.rapierBody.isEnabled()) {
          rb.rapierBody.setEnabled(false);
          this.hitstopFrozenBodies.add(rb);
        } else if (!frozen && this.hitstopFrozenBodies.delete(rb)) {
          rb.rapierBody.setEnabled(true);
          rb.resetInterpolationBuffers();
        }
      } catch {
        this.hitstopFrozenBodies.delete(rb);
      }
    }
    for (const rb of [...this.hitstopFrozenBodies]) {
      if (live.has(rb)) continue;
      this.hitstopFrozenBodies.delete(rb);
    }
  }

  private entityFromCollider(colliderHandle: number): number | null {
    const body = this.physicsWorld.rapierBodyFromColliderHandle(colliderHandle);
    if (!body) return null;
    return this.sceneManager.entityOfRapierBody(body);
  }

  private readonly handleIntersection = (colliderA: number, colliderB: number, intersecting: boolean): void => {
    const entityA = this.entityFromCollider(colliderA);
    const entityB = this.entityFromCollider(colliderB);
    if (entityA === null || entityB === null) return;
    
    // Emit sensor events on the global bus.
    const eventName = intersecting ? 'sensor_enter' : 'sensor_exit';
    this.sceneManager.events.emit(eventName, { selfEntityId: entityA, otherEntityId: entityB });
    this.sceneManager.events.emit(eventName, { selfEntityId: entityB, otherEntityId: entityA });

    // Fan out to modular components
    if (intersecting) {
      this.sceneManager.lifecycle.dispatchTriggerEnter(entityA, entityB);
      this.sceneManager.lifecycle.dispatchTriggerEnter(entityB, entityA);
    } else {
      this.sceneManager.lifecycle.dispatchTriggerExit(entityA, entityB);
      this.sceneManager.lifecycle.dispatchTriggerExit(entityB, entityA);
    }
    
    // Also route to per-script sensor callbacks (backwards compat).
    const sm = this.sceneManager as any;
    const scriptA = sm.getComponent(entityA, 'script');
    if (scriptA) scriptA.onSensor(entityB, intersecting);
    const scriptB = sm.getComponent(entityB, 'script');
    if (scriptB) scriptB.onSensor(entityA, intersecting);
  };

  // --- Editor interaction -------------------------------------------------
  private bindEditorInput(): void {
    this.input.on('pointerdown', (p) => {
      if (this.tools.active) return;
      if (
        p.button === 0 &&
        this.input.mode === 'editor' &&
        !this.input.isMouseButtonDown(2)
      ) {
        this.selectionDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: p.shift, toggle: p.ctrl };
      }
    });
    this.input.on('pointermove', (p) => {
      if (!this.selectionDrag || !this.input.isMouseButtonDown(0)) return;
      this.selectionDrag.x1 = p.x;
      this.selectionDrag.y1 = p.y;
    });
    this.input.on('pointerup', (p) => {
      if (p.button !== 0 || !this.selectionDrag || this.input.mode !== 'editor') return;
      const drag = this.selectionDrag;
      this.selectionDrag = null;
      if (Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) >= 6) {
        const el = this.viewport.renderer.domElement;
        this.selection.selectScreenRect(this.sceneManager, this.viewport.camera, el.clientWidth, el.clientHeight, drag.x0, drag.y0, drag.x1, drag.y1, drag.additive || drag.toggle);
        this.syncGizmoToSelection();
      } else {
        this.pendingPick = { x: p.x, y: p.y, additive: drag.additive, toggle: drag.toggle };
      }
    });
  }

  private processEditorInput(): void {
    if (this.input.mode === 'editor') {
      const lookHeld = this.input.isMouseButtonDown(2);
      if (!lookHeld) {
        if (this.input.isKeyPressed('Digit1')) { this.tools.setActive(null); this.gizmo.setMode('translate'); }
        if (this.input.isKeyPressed('Digit2')) { this.tools.setActive(null); this.gizmo.setMode('rotate'); }
        if (this.input.isKeyPressed('Digit3')) { this.tools.setActive(null); this.gizmo.setMode('scale'); }
        // Preset shortcuts: ] / [ cycle presets
        if (this.input.isKeyPressed('BracketRight')) this.cycleCameraPreset(1);
        if (this.input.isKeyPressed('BracketLeft')) this.cycleCameraPreset(-1);
        // Number row 5-8 jump to headline presets (quick access)
        if (this.input.isKeyPressed('Digit5')) this.applyCameraPreset('isometric');
        if (this.input.isKeyPressed('Digit6')) this.applyCameraPreset('top_down');
        if (this.input.isKeyPressed('Digit7')) this.applyCameraPreset('front');
        if (this.input.isKeyPressed('Digit8')) this.applyCameraPreset('wide');
      }
    }

    if (this.input.isKeyPressed('F5')) {
      this.input.setMode(this.input.mode === 'editor' ? 'play' : 'editor');
    }
    if (this.input.isKeyPressed('Escape')) {
      this.tools.setActive(null);
      this.input.setMode('editor');
      this.gizmo.detach();
    }

    // ── Wheel → dolly zoom (the fix: wheel now actually zooms when NOT in RMB-look) ──
    const wheel = this.input.getWheelDelta();
    const cinematicActive = this.cinematic.active || this.cutsceneDirector.active;
    if (wheel !== 0 && this.input.mode === 'editor' && !cinematicActive && !this.input.isMouseButtonDown(2)) {
      // Ctrl/Cmd + wheel → FOV tweak instead of dolly (optional precision)
      if (this.input.isKeyDown('ControlLeft') || this.input.isKeyDown('ControlRight') || this.input.isKeyDown('MetaLeft') || this.input.isKeyDown('MetaRight')) {
        const cam = this.viewport.camera;
        cam.fov = THREE.MathUtils.clamp(cam.fov + wheel * 0.015, 12, 110);
        cam.updateProjectionMatrix();
      } else {
        this.dollyByWheel(wheel);
      }
    }

    // Picking is an editor-only interaction.
    if (this.input.mode === 'editor' && !this.tools.active) this.resolvePendingPick();
  }

  private resolvePendingPick(): void {
    const pick = this.pendingPick;
    if (!pick) return;
    this.pendingPick = null;
    // If the gizmo grabbed a handle on this press, it owns the click.
    if (this.gizmo.dragging) return;
    // Re-check mode defensively in case it flipped between the queue and the resolve.
    if (this.input.mode !== 'editor') return;

    const el = this.viewport.renderer.domElement;
    this._ndc.set((pick.x / el.clientWidth) * 2 - 1, -(pick.y / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.viewport.camera);
    const meshes = this.sceneManager.rigidBodyList.map((rb) => rb.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    const rb = hits.length > 0 ? this.sceneManager.pickRigidBody(hits[0].object) : null;
    if (rb) {
      const id = this.sceneManager.entityOf(rb);
      if (id !== null) {
        if (pick.toggle) this.selection.toggle(id);
        else if (pick.additive) this.selection.add(id);
        else this.selection.set([id], id);
      }
    } else if (!pick.additive && !pick.toggle) this.selection.clear();
    this.syncGizmoToSelection();
  }

  private syncGizmoToSelection(): void {
    const rb = this.selection.primary !== null ? this.sceneManager.getRigidBody(this.selection.primary) : null;
    if (rb) this.gizmo.attach(rb);
    else this.gizmo.detach();
  }

  // --- Teardown -----------------------------------------------------------
  private registerPresets(): void {
    registerFpsStarterAssets(this.manifest);
    // 1. Register base characters.
    //
    // FINAL standing heights, in metres. These are locked rather than auto-normalised.
    // The four GLBs export at ~1/160 scale (10.9-11.5mm tall) but their RELATIVE
    // proportions are real, so rather than flattening the roster to one height we scaled
    // the whole set by a single factor (×158.1) chosen to put its mean at 5'10". Every
    // character therefore keeps its authored build and lands inside the 5'6"-6'2" band:
    //
    //   ayo 5'9.2"   hana 5'9.1"   opp 5'10.3"   RAYNEFBX 5'11.5"
    //
    // A single shared factor also keeps the rigs mutually consistent, which matters
    // because they all play the same retargeted animation packs. Re-derive these if the
    // source GLBs are ever re-exported.
    const CHARACTER_HEIGHTS_M: Record<string, number> = {
      ayo: 1.757,
      hana: 1.755,
      opp: 1.785,
      RAYNEFBX: 1.815,
    };
    for (const char of MIXAMO_CHARACTERS) {
      this.manifest.register({
        id: char.id,
        path: char.path,
        type: 'character',
        tags: ['preset', 'character'],
        targetSize: CHARACTER_HEIGHTS_M[char.id],
      });
    }

    // 2. Register custom enemies and weapons
    const customModels = [
      { id: 'Akademiks', path: '/assets/models/enemies/Akademiks.glb', tags: ['enemy'] },
      { id: 'Granny', path: '/assets/models/enemies/Granny.glb', tags: ['enemy'] },
      { id: 'JellyRoll', path: '/assets/models/enemies/Jelly roll.glb', tags: ['enemy'] },
      { id: 'AyosKatana', path: '/assets/models/weapons/ayoskatana.glb', tags: ['weapon', 'sword', 'katana'] },
      { id: 'Katana', path: '/assets/models/weapons/katana.glb', tags: ['weapon', 'sword', 'katana'] },
      { id: 'NeoArcBlade', path: '/assets/models/weapons/neo-arc_blade__sci-fi_energy_sword.glb', tags: ['weapon', 'sword', 'blade'] },
      { id: 'NightSkySword', path: '/assets/models/weapons/night_sky_sword.glb', tags: ['weapon', 'sword'] },
      // Large static level geometry (the default landing scene's backdrop).
      { id: 'NarutoVillage', path: '/assets/models/maps/naruto_hiddenly_village.glb', tags: ['map'] },
      
      // Outdoor Props presets (semantic tags so `spawn_smart`/`engine.spawn` can resolve them).
      { id: 'AptMailbox', path: '/assets/models/props/aptmailbox.glb', tags: ['prop', 'outdoor', 'mailbox'] },
      { id: 'Bench', path: '/assets/models/props/bench_20251203_044016.glb', tags: ['prop', 'outdoor', 'bench', 'seating'] },
      { id: 'HighwayStreetLights', path: '/assets/models/props/highway street lights.glb', tags: ['prop', 'outdoor', 'lamp', 'streetlamp', 'light'] },
      { id: 'Planter', path: '/assets/models/props/prop_planter_01_20260315_171011.glb', tags: ['prop', 'outdoor', 'planter'] },
      { id: 'PublicTrashCan', path: '/assets/models/props/public trash can.glb', tags: ['prop', 'outdoor', 'trash', 'bin', 'can', 'garbage'] },
      { id: 'SmallGate', path: '/assets/models/props/small gate.glb', tags: ['prop', 'outdoor', 'gate'] },
      { id: 'StreetLamp2', path: '/assets/models/props/street lamp 2.glb', tags: ['prop', 'outdoor', 'lamp', 'streetlamp', 'light'] },
      { id: 'StreetLamp', path: '/assets/models/props/street lamp.glb', tags: ['prop', 'outdoor', 'lamp', 'streetlamp', 'light'] },
      { id: 'VendingMachine', path: '/assets/models/props/vend machine.glb', tags: ['prop', 'outdoor', 'vending', 'machine'] },
      { id: 'VendingMachine2', path: '/assets/models/props/VENDING MACHINE_20251203_144202.glb', tags: ['prop', 'outdoor', 'vending', 'machine'] },
      { id: 'WaterFountain', path: '/assets/models/props/water fountain.glb', tags: ['prop', 'outdoor', 'fountain'] },

      // Vegetation presets
      { id: 'AnimeBush', path: '/assets/models/vegetation/bush/jabami_anime_bush_v1.glb', tags: ['vegetation', 'flora', 'bush'] },
      { id: 'RealGrass', path: '/assets/models/vegetation/grass/real grass.glb', tags: ['vegetation', 'flora', 'grass'] },
      { id: 'AnimeTree1', path: '/assets/models/vegetation/trees/jabami_anime_tree_v1.glb', tags: ['vegetation', 'flora', 'tree'] },
      { id: 'AnimeTree3', path: '/assets/models/vegetation/trees/jabami_anime_tree_v3.glb', tags: ['vegetation', 'flora', 'tree'] },
      { id: 'AnimeTree3_Alt', path: '/assets/models/vegetation/trees/jabami_anime_tree_v3_alt.glb', tags: ['vegetation', 'flora', 'tree'] },
    ];

    for (const model of customModels) {
      this.manifest.register({
        id: model.id,
        path: model.path,
        type: 'misc',
        tags: ['preset', 'model', ...model.tags],
      });
    }

    // 2b. Register 91 Trash and Debris presets
    for (let i = 1; i <= 91; i++) {
      this.manifest.register({
        id: `TrashDebris${i}`,
        path: `/assets/models/trash/trash_and_debris_${i}.glb`,
        type: 'misc',
        tags: ['preset', 'model', 'trash', 'debris'],
      });
    }

    // 3. Register animations
    // Dedupe by generated id: MixamoPresets lists some animations twice (e.g. the
    // "swords animations" folder shadows its "sword locomotion" subfolder). The first
    // registration wins so the preset browser never shows duplicate buttons.
    const seenAnim = new Set<string>();
    for (const [cat, list] of Object.entries(MIXAMO_ANIMATIONS)) {
      for (const anim of list) {
        const cleanCat = cat.replace(/[^a-zA-Z0-9]/g, '_');
        const cleanId = anim.id.replace(/[^a-zA-Z0-9]/g, '_');
        const id = `anim_${cleanCat}_${cleanId}`;
        if (seenAnim.has(id)) continue;
        seenAnim.add(id);
        this.manifest.register({
          id,
          path: anim.path,
          type: 'misc',
          tags: ['preset', 'animation', cat],
        });
      }
    }

    // Automatically register the generated texture presets as materials
    const styles = ['anime', 'realistic'] as const;
    const types = [
      'grass', 'sidewalk', 'street', 'wood', 'brick', 'asphalt', 
      'water', 'dirt', 'sand', 'scifi', 'barrier', 'chainlink', 
      'concrete', 'metal_grate', 'rooftop', 'school_wood', 'stadium', 
      'subway_tile', 'tatami', 'billboard', 'brick_alley', 'cracked_earth', 
      'dojo_mat', 'energy_cracks', 'glass_shattered', 'graffiti_wall', 
      'school_tile', 'shrine_wood', 'vending_machine'
    ] as const;

    for (const style of styles) {
      for (const type of types) {
        const capitalizedStyle = style.charAt(0).toUpperCase() + style.slice(1);
        const capitalizedType = type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
        this.materials.register({
          id: `${capitalizedStyle}${capitalizedType}`,
          type: 'standard',
          texturePreset: { style, type: type as any, repeat: 1 }
        });
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.sensorium.abort();
    this.helm.dispose();
    this.gameplayFeatures.dispose();
    this.gameplay.dispose();
    this.items.dispose();
    this.interaction.dispose();
    this.spawner.dispose();
    this.weatherLightningOff?.();
    this.weatherLightningOff = null;
    this._interactPromptEl?.remove();
    this._interactPromptEl = null;
    this.nav.dispose();
    this.network.disconnect();
    this.chunkDeltas.dispose();
    this.springBones.clear();
    this.footIK.clear();
    this.activeRagdolls.clear();
    this.buoyancy.clear();
    this.hlod.dispose();
    this.gpuParticles.dispose();
    this.culling.disable();
    this.vehicles.dispose();
    this.lod.dispose();
    this.combat.dispose();
    this.clothSystem.dispose();
    this.meshFracturer.dispose();
    this.volumetricFog.dispose();
    for (const probe of this.reflectionProbes.values()) probe.dispose();
    this.reflectionProbes.clear();
    this.reverb.dispose();
    this.effects.dispose();
    this.boneSockets.clear();
    this.animNotifies.clear();
    this.timeDilation.clear();
    for (const rb of this.hitstopFrozenBodies) {
      try { rb.rapierBody.setEnabled(true); } catch {}
    }
    this.hitstopFrozenBodies.clear();
    this.multiTargetCamera.reset();
    this.ribbonTrails.clear(this.viewport.scene);
    this.workerLoader.dispose();
    this.assetImporter.dispose();
    this.isTestMode = false;
    this.cinematic.stop();
    for (const emitter of this.particleEmitters) emitter.dispose();
    this.particleEmitters.clear();
    for (const asm of this.animationMachines) asm.dispose();
    this.animationMachines.clear();
    this.aimTargets.clear();
    this.aimSolvers.clear();
    this.debugDraw.dispose();
    this.hud.dispose();
    this.gizmo.dispose();
    this.input.dispose();
    this.loaderQueue.dispose();
    this.sceneManager.dispose();
    this.physicsWorld.dispose();
    this.audio.dispose();
    this.viewport.dispose();
    this.materials.dispose();
    this.tweens.dispose();
    this.assetCache.disposeAll();
  }
}
