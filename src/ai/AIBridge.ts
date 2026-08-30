import * as THREE from 'three';
import type { SceneManager, EntityId, EntityBlueprint } from '../ecs/SceneManager';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import type { InputManager, InputMode } from '../engine/InputManager';
import type { AssetManifest, AssetType } from '../animation/AssetManifest';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { Viewport } from '../rendering/Viewport';
import type { CinematicCamera, CinematicSequence } from '../cinematic/CinematicCamera';
import type { CutsceneSequence, CutsceneDirector } from '../cinematic/CutsceneDirector';
import type { AudioManager } from '../audio/AudioManager';
import type { AudioBus } from '../audio/AudioMixer';
import type { VfxPresetName } from '../vfx/ParticleEmitter';
import type { TestScript, SensoriumReport, ScenarioProfile, ScenarioOptions } from '../sensorium';
import type { SensoriumRunner } from '../sensorium';
import { GLOBAL_CHUNK } from '../streaming/chunkMath';
import { Path } from '../cinematic/Path';
import type { ChunkManager } from '../streaming/ChunkManager';
import type { NavigationSystem, NavAgentMode } from '../ai/NavigationSystem';
import type { NavMeshBuildOptions } from '../ai/NavMesh';
import type { SteeringParams } from '../ai/Steering';
import type { BTJson } from '../ai/BehaviorTree';
import type { CullingSystem } from '../rendering/CullingSystem';
import type { VehicleSystem } from '../physics/VehicleSystem';
import type { WheelSpec, VehicleSpec, VehicleInput } from '../physics/VehiclePhysics';
import type { LODSystem } from '../rendering/LODSystem';
import type { CombatSystem, WeaponSpec, DamageType } from '../ecs/CombatSystem';
import type { DebugDraw } from '../rendering/DebugDraw';
import type { HUD, HUDLayout } from '../ui/HUD';
import type { InputReplay } from '../playback/InputReplay';
import type { CommandMap } from './commands/BridgeContext';
import type { CmdCtx, PathFollower } from './commands/BridgeContext';
import { register as registerEntity } from './commands/EntityCommands';
import { register as registerPhysics } from './commands/PhysicsCommands';
import { register as registerRender } from './commands/RenderCommands';
import { register as registerAudio } from './commands/AudioCommands';
import { register as registerCinematic } from './commands/CinematicCommands';
import { register as registerQuery } from './commands/QueryCommands';
import { register as registerSceneIO } from './commands/SceneIOCommands';
import { register as registerNav } from './commands/NavCommands';
import { register as registerSystems } from './commands/SystemsCommands';
import { register as registerWorld } from './commands/WorldCommands';
import { register as registerSensorium } from './commands/SensoriumCommands';
import { register as registerEffects } from './commands/EffectsCommands';
import { register as registerGameplay } from './commands/GameplayCommands';
import { register as registerInventory } from './commands/InventoryCommands';
import { register as registerInteraction } from './commands/InteractionCommands';
import { register as registerSpawner } from './commands/SpawnerCommands';
import { register as registerSave } from './commands/SaveCommands';
import { register as registerMisc } from './commands/MiscCommands';
import { register as registerAnim } from './commands/AnimationPackCommands';
import { register as registerMotion } from './commands/MotionDirectorCommands';
import { register as registerInspect } from './commands/InspectorStudioCommands';
import { register as registerTween } from './commands/TweenDirectorCommands';
import { register as registerHighLevel } from './commands/HighLevelOrchestrationCommands';
import { register as registerVisualStyle } from './commands/VisualStyleCommands';
import { register as registerBake } from './commands/BakeCommands';
import { register as registerComponent } from './commands/ComponentCommands';
import { register as registerInput } from './commands/InputCommands';
import { register as registerChar } from './commands/CharacterCommands';
import { register as registerJoint } from './commands/JointCommands';
import { register as registerHistory } from './commands/HistoryCommands';
import { register as registerAuthoring } from './commands/AuthoringCommands';
import { register as registerPresentation } from './commands/PresentationCommands';
import { register as registerExport } from './commands/ExportCommands';
import { register as registerIntelligence } from './commands/IntelligenceCommands';
import { register as registerRealism } from './commands/WorldRealismCommands';
import { register as registerDirector } from './commands/DirectorAndClothCommands';
import { register as registerRuntimeIntegrations } from './commands/RuntimeIntegrationCommands';
import { register as registerFeature } from './commands/FeatureCommands';
import type { GameplayDef, GpValue } from '../gameplay';
import type { ItemDef } from '../items';
import type { InteractableDef } from '../interaction';
import type { SpawnerDef } from '../spawning';

// ─────────────────────────────────────────────────────────────────────────────
// AICommand — the IDE-facing vocabulary. Every command here is scriptable from
// any IDE (opencode, Claude Code, Codex, Copilot) via the dev-server WS bridge
// (`/api/cli-command`), the in-engine JSON terminal, or `window.engine.runScript`.
// All coordinates are WORLD space unless noted; the bridge converts to engine
// space at the moment of application so floating-origin shifts can't misplace
// spawns/teleports/paths/cinematic targets.
// ─────────────────────────────────────────────────────────────────────────────

export type AICommand =
  // --- Original Step-2 surface (kept stable) ---
  | { type: 'spawn_entity'; x: number; y: number; z: number; glbPath: string; params?: Record<string, any>; blueprint?: EntityBlueprint; guid?: string }
  | { type: 'destroy_entity'; entityId: EntityId }
  | {
      type: 'set_transform';
      entityId: EntityId;
      position?: { x: number; y: number; z: number };
      rotation?: { x: number; y: number; z: number; w: number };
      scale?: { x: number; y: number; z: number };
    }
  | { type: 'set_mode'; mode: InputMode }
  | { type: 'save_scene'; name?: string }
  | { type: 'load_scene'; name?: string }
  | { type: 'clear_scene' }

  // --- Remote UI / Viewport / Controls ---
  | { type: 'set_snap'; enabled?: boolean; translateSnap?: number; rotateSnap?: number }
  | { type: 'set_grid'; size?: number; divisions?: number; colorCenterLine?: string; colorGrid?: string; visible?: boolean }
  | { type: 'set_gizmo_mode'; mode: 'translate' | 'rotate' | 'scale' }
  | { type: 'set_gravity'; gravity: number }
  | { type: 'viewport_detach' }
  | { type: 'viewport_reattach' }
  | { type: 'parent_entity'; entityId: EntityId; parentId: EntityId | null }

  // --- Animation ---
  | { type: 'play_animation'; entityId: EntityId; state: string; fade?: number }

  // --- Physics (trigger events / forces from the IDE) ---
  | { type: 'apply_impulse'; entityId: EntityId; x: number; y: number; z: number }
  | { type: 'set_velocity'; entityId: EntityId; x: number; y: number; z: number }
  | { type: 'set_angular_velocity'; entityId: EntityId; x: number; y: number; z: number }
  | { type: 'set_ccd'; entityId: EntityId; enabled: boolean }
  | { type: 'collision_layer_define'; name: string; id?: number; collidesWith: string[] }
  | { type: 'collision_set_layer'; entityId: EntityId; layer: string }
  | { type: 'collision_matrix_get' }

  // --- Modular Component System (S4) ---
  | { type: 'component_add'; entityId: EntityId; component: string; props?: Record<string, any> }
  | { type: 'component_remove'; entityId: EntityId; component: string }
  | { type: 'component_set'; entityId: EntityId; component: string; prop: string; value: any }
  | { type: 'component_get'; entityId: EntityId; component: string }
  | { type: 'components_list' }

  // --- KCC & Kinematic Locomotion (S1) ---
  | { type: 'kcc_set_params'; entityId: EntityId; params: Partial<import('../character/KccParams').KccParams> }
  | { type: 'kcc_get_params'; entityId: EntityId }
  | { type: 'kcc_teleport'; entityId: EntityId; x: number; y: number; z: number }
  | { type: 'kcc_get_telemetry'; entityId: EntityId }
  | { type: 'kcc_telemetry_get'; entityId: EntityId }
  | { type: 'kcc_get_state'; entityId: EntityId }

  // --- Universal Input Action Mapping (S3) ---
  | { type: 'input_context_push'; name: string; priority?: number; actions?: import('../input/types').ActionDef[]; maskAllBelow?: boolean }
  | { type: 'input_context_pop'; name?: string }
  | { type: 'input_contexts' }
  | { type: 'input_action_define'; name: string; kind: import('../input/types').ActionKind; bindings?: import('../input/types').Binding[]; deadzone?: number; responseCurve?: import('../input/types').ResponseCurve; context?: string }
  | { type: 'input_bind'; action: string; binding: import('../input/types').Binding }
  | { type: 'input_unbind'; action: string }
  | { type: 'input_actions' }
  | { type: 'input_remap'; actions: import('../input/types').InputActionAsset | import('../input/types').ActionDef[] | string; context?: string }
  | { type: 'input_action_state'; action: string }
  | { type: 'input_gamepad_status' }
  | { type: 'input_gamepad_controls' }
  | { type: 'input_gamepad_rumble'; pad?: number; durationMs?: number; weakMagnitude?: number; strongMagnitude?: number }
  | { type: 'input_synthetic'; action: string; value: import('../input/types').ActionValue }

  // --- Physics Joints & Ragdolls (S2) ---
  | { type: 'joint_create'; jointType: import('../physics/JointSystem').JointType; entityA: EntityId; entityB: EntityId; anchorA: { x: number; y: number; z: number }; anchorB: { x: number; y: number; z: number }; axisA?: { x: number; y: number; z: number }; axisB?: { x: number; y: number; z: number }; limits?: [number, number]; motor?: import('../physics/JointSystem').JointMotorConfig; breakForce?: number }
  | { type: 'joint_remove'; jointId: string }
  | { type: 'joints_list' }
  | { type: 'ragdoll_create'; rootEntity: EntityId; x?: number; y?: number; z?: number }
  | { type: 'ragdoll_spawn'; rootEntity: EntityId; x?: number; y?: number; z?: number }
  | { type: 'ragdoll_set_active'; rootEntity: EntityId; active: boolean }
  | { type: 'ragdoll_set_dynamic'; rootEntity: EntityId; dynamic: boolean }
  | { type: 'ragdoll_destroy'; rootEntity: EntityId }
  | { type: 'active_ragdoll_attach'; entityId: EntityId; muscleStiffness?: number; muscleDamping?: number; strength?: number }
  | { type: 'active_ragdoll_knockdown'; entityId: EntityId; seconds?: number }
  | { type: 'active_ragdoll_strength'; entityId: EntityId; strength: number }
  | { type: 'spring_bone_add'; entityId: EntityId; bones: string[]; stiffness?: number; damping?: number; inertia?: number; radius?: number; gravity?: [number, number, number] }
  | { type: 'spring_bone_collider'; entityId: EntityId; bone?: string; radius: number; offset?: [number, number, number] }
  | { type: 'spring_bone_capsule'; entityId: EntityId; startBone: string; endBone: string; radius: number }
  | { type: 'spring_bone_remove'; entityId: EntityId }
  | { type: 'foot_ik_set'; entityId: EntityId; enabled: boolean; rayLength?: number; footOffset?: number; maxPelvisDrop?: number; smoothSpeed?: number }
  | { type: 'buoyancy_add'; entityId: EntityId; volume?: number; height?: number }
  | { type: 'buoyancy_remove'; entityId: EntityId }
  | { type: 'buoyancy_status'; entityId: EntityId }

  // --- Integrated runtime systems (multi-layer nav, EQS, streaming, HLOD, net) ---
  | { type: 'navmesh_build_multilayer'; centerX: number; centerZ: number; size: number; cellSize?: number; agentRadius?: number; agentHeight?: number; maxSlopeDeg?: number; maxStepHeight?: number }
  | { type: 'eqs_query'; querier: [number, number, number]; target?: [number, number, number]; generator: { kind: 'grid'; extent: number; spacing: number } | { kind: 'ring'; radius: number; count: number } | { kind: 'donut'; inner: number; outer: number; rings: number; pointsPerRing: number }; tests: import('./EnvironmentQuery').EqsTest[] }
  | { type: 'chunk_deltas_export' }
  | { type: 'chunk_deltas_import'; data: string }
  | { type: 'chunk_deltas_clear' }
  | { type: 'hlod_create'; id: string; entityIds: EntityId[]; prototypeEntityId?: EntityId; nearDistance?: number; farDistance?: number; views?: number; tileSize?: number }
  | { type: 'hlod_remove'; id: string }
  | { type: 'hlod_list' }
  | { type: 'network_host'; url: string }
  | { type: 'network_join'; url: string }
  | { type: 'network_disconnect' }
  | { type: 'network_replicate'; entityId: EntityId; enabled?: boolean }
  | { type: 'network_local_player'; entityId: EntityId | null }
  | { type: 'network_status' }
  | { type: 'gpu_particles_start'; maxParticles?: number; x?: number; y?: number; z?: number }
  | { type: 'gpu_particles_stop' }
  | { type: 'gpu_particles_status' }
  | { type: 'prefab_register'; prefab: import('../engine/PrefabManager').Prefab }
  | { type: 'prefab_spawn'; name: string; position: [number, number, number]; rotation?: [number, number, number, number]; variant?: string }
  | { type: 'prefab_unpack'; rootEntity: EntityId }
  | { type: 'prefab_list' }
  | { type: 'prefab_instances' }
  | { type: 'profiler_set'; enabled: boolean }
  | { type: 'profiler_status' }
  | { type: 'profiler_history'; limit?: number }
  | { type: 'profiler_clear' }
  | { type: 'selection_set'; entityIds: EntityId[]; primary?: EntityId }
  | { type: 'selection_add'; entityId: EntityId }
  | { type: 'selection_toggle'; entityId: EntityId }
  | { type: 'selection_clear' }
  | { type: 'selection_get' }

  // --- Transactional Command History & Diffing (S5) ---
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'history_list' }
  | { type: 'history_clear' }
  | { type: 'scene_diff'; beforeEntities?: import('../authoring/SceneDiffer').EntitySnapshotData[]; afterEntities?: import('../authoring/SceneDiffer').EntitySnapshotData[] }

  // --- Morph Targets & Animation Authoring (S7) ---
  | { type: 'morph_set'; entityId: EntityId; morph: string; weight: number; duration?: number }
  | { type: 'morph_set_weight'; entityId: EntityId; morph: string; weight: number; duration?: number }
  | { type: 'morph_get'; entityId: EntityId; morph: string }
  | { type: 'morphs_list'; entityId: EntityId }
  | { type: 'anim_event_add'; state: string; normalizedTime: number; event: string; payload?: Record<string, any> }
  | { type: 'ik_aim_target'; entityId: EntityId; target: { x: number; y: number; z: number }; weight?: number }

  // --- Presentation, 3D World UI & Audio DSP (S8, S9, S10) ---
  | { type: 'world_canvas_create'; canvasId: string; width?: number; height?: number; billboard?: import('../ui/WorldCanvas').BillboardMode; position?: { x: number; y: number; z: number }; text?: string }
  | { type: 'world_canvas_set_text'; canvasId: string; text: string; color?: string; background?: string }
  | { type: 'world_canvas_destroy'; canvasId: string }
  | { type: 'reverb_zone_create'; zoneId: string; name: string; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; wet?: number; duration?: number; decay?: number }
  | { type: 'reverb_zone_remove'; zoneId: string }
  | { type: 'reflection_probe_create'; probeId: string; position: { x: number; y: number; z: number }; resolution?: number; boxSize?: [number, number, number]; intensity?: number }
  | { type: 'reflection_probe_remove'; probeId: string }
  | { type: 'reflection_probe_capture'; probeId: string }

  // --- Export & Packaging Pipeline (S10) ---
  | { type: 'package_game'; title?: string; entryScene?: string; visualStyle?: string }
  | { type: 'export_tauri_manifest'; title?: string; version?: string; fullscreen?: boolean }

  // --- Tactical GOAP Intelligence & Cinematic Timeline (S11) ---
  | { type: 'goap_plan'; startState: Record<string, any>; goalState: Record<string, any>; actions: import('./goap').GoapActionDef[] }
  | { type: 'timeline_create'; id: string; duration: number; loop?: boolean; tracks: import('../cinematic/TimelineSequencer').TimelineTrack[] }
  | { type: 'timeline_play'; id: string; loop?: boolean }
  | { type: 'timeline_scrub'; id: string; time: number }
  | { type: 'timeline_stop'; id: string }

  // --- World Realism, Fog, Decals & Destructibles (S12) ---
  | { type: 'fog_set_params'; density?: number; heightFalloff?: number; groundLevel?: number; color?: number | string; anisotropy?: number }
  | { type: 'fog_volume_add'; id: string; position: { x: number; y: number; z: number }; radius: number; density: number; color?: number | string }
  | { type: 'decal_spawn'; position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; size?: number | [number, number]; color?: number | string; lifespan?: number }
  | { type: 'mesh_fracture'; entityId: EntityId; epicenter?: { x: number; y: number; z: number }; pieces?: number; impulse?: number; lifespan?: number }

  // --- Autonomous AI Director, Dynamic Weather & Cloth Physics (S13) ---
  | { type: 'weather_set'; state: import('../environment/WeatherSystem').WeatherType; transitionDuration?: number }
  | { type: 'director_set_phase'; phase: import('./AIDirector').DirectorPacingPhase }
  | { type: 'cloth_create_grid'; id: string; width: number; height: number; segsX: number; segsY: number; pinTop?: boolean }
  | { type: 'cloth_remove'; id: string }
  | { type: 'cloth_list' }

  // --- Visual / material (cinematic look control per entity) ---
  | {
      type: 'set_material';
      entityId: EntityId;
      color?: number | string;
      roughness?: number;
      metalness?: number;
      emissive?: number | string;
      emissiveIntensity?: number;
      transparent?: boolean;
      opacity?: number;
    }

  // --- Environment / lighting (atmosphere from a prompt) ---
  | { type: 'set_time_of_day'; hour: number }
  /** Animated day/night cycle: enable + advance time automatically (sun arc, colour, fog). */
  | { type: 'day_night_cycle'; enabled?: boolean; hour?: number; speed?: number }
  | { type: 'set_weather'; fogDensity?: number; fogColor?: string; ambient?: number }
  | { type: 'add_light'; kind: 'point' | 'spot' | 'directional' | 'area'; position: [number, number, number]; color?: number | string; intensity?: number; distance?: number; castShadow?: boolean; target?: [number, number, number]; angle?: number; penumbra?: number; decay?: number; width?: number; height?: number; cookie?: string }
  | { type: 'set_exposure'; value: number }
  /** Image-based lighting: swap the procedural sky for an equirectangular HDRI (or
   *  revert to it), and tune IBL / background intensity + blur. Omit `hdri` and pass
   *  `sky:true` to go back to the procedural sky. */
  | { type: 'set_environment'; hdri?: string; sky?: boolean; background?: boolean; environmentIntensity?: number; backgroundIntensity?: number; backgroundBlurriness?: number }
  /** Position the procedural sky's sun + tune its fog (distinct from set_environment's IBL). */
  | { type: 'set_sky_environment'; elevationDeg?: number; azimuthDeg?: number; fogDensity?: number; fogColor?: number | string }

  // --- Post-processing (cinematic grade) ---
  /** Toggle + tune the post-FX chain. Every field is optional; only the passes whose
   *  fields are provided are touched (handled in commands/RenderCommands.ts). */
  | {
      type: 'set_post_fx';
      // Bloom
      bloom?: boolean; bloomStrength?: number; bloomRadius?: number; bloomThreshold?: number;
      // Outline
      outline?: boolean; outlineThickness?: number;
      // Vignette
      vignette?: boolean; vignetteIntensity?: number;
      // Colour grade
      colorGrade?: boolean; saturation?: number; contrast?: number; brightness?: number; hueShift?: number;
      // Chromatic aberration
      chromaticAberration?: boolean;
      // Film grain
      filmGrain?: boolean; filmGrainAmount?: number;
      // God rays
      godRays?: boolean; godRaysStrength?: number; godRaysDensity?: number; godRaysDecay?: number;
      godRaysWeight?: number; godRaysExposure?: number; godRaysThreshold?: number; godRaysColor?: number | string;
      // Depth of field
      dof?: boolean; dofFocusDistance?: number; dofFocusRange?: number; dofBokehScale?: number; dofAutoFocus?: boolean;
      // Screen-space reflections
      ssr?: boolean; ssrIntensity?: number; ssrMaxDistance?: number; ssrThickness?: number; ssrFresnel?: number;
      // Volumetric fog
      volumetricFog?: boolean; fogDensity?: number; fogColor?: number | string; fogColorSun?: number | string;
      fogHeight?: number; fogHeightFalloff?: number; fogScattering?: number; fogAnisotropy?: number; fogMaxDistance?: number;
      // Motion blur
      motionBlur?: boolean; motionBlurIntensity?: number; motionBlurMax?: number;
      // Contact shadows
      contactShadows?: boolean; contactShadowIntensity?: number; contactShadowDistance?: number;
      // Auto exposure
      autoExposure?: boolean; exposureKey?: number; exposureMin?: number; exposureMax?: number; exposureSpeed?: number;
      // Temporal AA
      taa?: boolean; taaFeedback?: number;
    }
  /** Tone-mapping exposure (a simpler sibling of set_exposure, kept for the cinematic API). */
  | { type: 'set_tone'; exposure: number }

  // --- Visual style (one-command cinematic look) ---
  /** Apply a complete cinematic look in ONE command — sun, sky atmosphere, fog, exposure, IBL,
   *  shadow strategy and the full post-FX grade (bloom/vignette/colour grade/god rays/SSR/…).
   *  Curated styles: golden_hour, neon_night, stylized, photoreal, moody, midnight, daylight.
   *  Optional per-command `overrides` layer on top of the named recipe. */
  | { type: 'set_visual_style'; style: import('../features/VisualStyles').VisualStyleName; overrides?: Partial<import('../features/VisualStyles').VisualStyle> }
  /** Bake the CURRENT look into a named recipe (a deterministic, re-appliable snapshot of the
   *  sun/atmosphere/fog/exposure/IBL/post grade). Returns a compact summary. */
  | { type: 'bake_scene'; name?: string }
  /** Re-apply a previously baked look by name. */
  | { type: 'bake_apply'; name: string }
  /** List the named baked looks. */
  | { type: 'bake_list' }
  /** Deterministic vertex-AO bake: stamps ambient occlusion into static meshes' vertex
   *  colors (bake instead of per-frame SSAO). `seed` guarantees reproducible bakes. */
  | { type: 'bake_ao'; samples?: number; distance?: number; strength?: number; seed?: number }
  /** Reverse a vertex-AO bake: restore original (shared) materials + drop baked colors.
   *  Idempotent; native vertex colors (foliage) survive. */
  | { type: 'bake_flush' }

  // --- VFX ---
  | { type: 'spawn_vfx'; preset: VfxPresetName; x: number; y: number; z: number; duration?: number; loop?: boolean; maxParticles?: number }
  | { type: 'burst_vfx'; preset: VfxPresetName; x: number; y: number; z: number; count?: number }

  // --- Audio ---
  | { type: 'play_sound'; src: string; x?: number; y?: number; z?: number; volume?: number; loop?: boolean; refDistance?: number; maxDistance?: number; bus?: AudioBus }
  | { type: 'attach_sound'; entityId: EntityId; src: string; volume?: number; loop?: boolean; bus?: AudioBus }
  | { type: 'stop_sound'; src?: string; entityId?: EntityId }
  | { type: 'set_master_volume'; volume: number }
  | { type: 'set_bus_volume'; bus: AudioBus; volume: number }
  | { type: 'crossfade_music'; src: string; duration?: number }
  | { type: 'stop_music'; fadeOut?: number }
  | { type: 'add_trigger_zone'; id: string; x: number; y: number; z: number; radius: number; enterSound?: string; exitSound?: string; ambientSound?: string; volume?: number }
  | { type: 'remove_trigger_zone'; id: string }

  // --- Cinematic camera (THE cutscene director) ---
  | { type: 'cinematic_play'; sequence: CinematicSequence }
  | { type: 'cinematic_stop' }
  | { type: 'cutscene_play'; sequence: CutsceneSequence }
  | { type: 'cutscene_stop' }
  | { type: 'cutscene_subtitle'; text: string; speaker?: string; duration?: number }
  | { type: 'set_camera'; position: [number, number, number]; lookAt?: [number, number, number]; fov?: number }

  // --- Path following (entities/cameras that travel a spline) ---
  | { type: 'follow_path'; entityId: EntityId; points: [number, number, number][]; speed?: number; loop?: boolean; lookAlongPath?: boolean }

  // --- Camera focus ---
  | { type: 'focus_entity'; entityId: EntityId }

  // --- Capture (the IDE can grab cinematic stills to disk) ---
  | { type: 'screenshot'; filename?: string; width?: number; height?: number }

  // --- Asset pipeline (drop in new GLBs at runtime) ---
  | { type: 'register_asset'; id: string; path: string; assetType?: AssetType }
  | { type: 'preload_assets'; ids: string[] }
  /** SEMANTIC spawn: resolve a free-text description ('rusty red car') to a tagged asset
   *  via the SemanticAssetRegistry, then spawn it with the parsed material dressing
   *  (tint + procedural rust/dirt) and an auto-fitted compound collider. Async — writes the
   *  chosen {assetId, score, material} to lastQueryResult. */
  | { type: 'spawn_smart'; query: string; x: number; y: number; z: number; dynamic?: boolean; scale?: number; compound?: boolean }

  // --- Entity metadata (so the IDE can reason about named/tagged objects) ---
  | { type: 'set_entity_name'; entityId: EntityId; name: string }
  | { type: 'tag_entity'; entityId: EntityId; tag: string }
  | { type: 'remove_tag'; entityId: EntityId; tag: string }

  // --- Batch construction (build a whole block / forest in one command) ---
  | { type: 'spawn_group'; blueprint: EntityBlueprint; positions: [number, number, number][] }
  | { type: 'scatter'; blueprint: EntityBlueprint; count: number; center: [number, number, number]; radius: number; seed?: number }

  // --- Scene introspection (the IDE asks "what's there?" and gets state back) ---
  | { type: 'query_scene'; filter?: { kind?: string; tag?: string; name?: string } }
  | { type: 'query_raycast'; origin: [number, number, number]; direction: [number, number, number]; maxDistance?: number }
  | { type: 'query_sphere'; center: [number, number, number]; radius: number; tags?: string[] }

  // --- Scripting (batch + name a sequence of commands) ---
  | { type: 'run_script'; commands: AICommand[] }
  | { type: 'add_script'; entityId: EntityId; sourceCode: string }
  | { type: 'remove_script'; entityId: EntityId }

  // --- SENSORIUM: vision-driven, feel-aware gameplay testing ---
  /** Generate + run a scenario by profile ("driving", "locomotion", "jump", …). */
  | { type: 'sensorium_test'; profile: ScenarioProfile; options?: ScenarioOptions }
  /** Run a fully-authored test script. */
  | { type: 'sensorium_run'; script: TestScript }
  /** Stop the active run. */
  | { type: 'sensorium_stop' }
  /** Pull the last report onto lastSensoriumReport. */
  | { type: 'sensorium_status' }
  /** Save the last run's FeelProfile as a named regression baseline. */
  | { type: 'sensorium_baseline'; name: string }

  // --- PLAYBACK: deprecated aliases (route to SENSORIUM) ---
  | { type: 'playback_run'; script: TestScript }
  | { type: 'playback_stop' }
  | { type: 'playback_status' }

  // --- Graphical effects / game-feel (called by an AI agent in a script) ---
  /** Trigger a camera shake. trauma 0..1, duration in seconds, frequency in Hz. */
  | { type: 'camera_shake'; trauma?: number; duration?: number; frequency?: number; translation?: number; rotation?: number }
  /** Trigger a full-screen flash. CSS color, 0..1 intensity, seconds. */
  | { type: 'screen_flash'; color?: string | number; intensity?: number; duration?: number; mode?: 'fade' | 'pulse' }
  /** Global time scale. 1 = real-time, 0.25 = bullet-time, 2 = fast-forward. */
  | { type: 'set_time_scale'; scale: number }
  /** Switch the active weather. */
  | { type: 'set_weather_preset'; kind: 'clear' | 'rain' | 'snow' | 'haze' | 'ash'; intensity?: number }
  /** One-call "got hit" combo. */
  | { type: 'hit_feedback'; x?: number; y?: number; z?: number; color?: string | number; intensity?: number; vfx?: VfxPresetName }
  /** One-call explosion combo. */
  | { type: 'explosion_feedback'; x?: number; y?: number; z?: number; color?: string | number }
  /** Viewport zoom controls (dolly the camera). */
  | { type: 'zoom_in'; factor?: number }
  | { type: 'zoom_out'; factor?: number }
  | { type: 'zoom_reset' }
  /** Built-in camera presets (18 that ship with the engine). */
  | { type: 'camera_preset'; preset: string; anchorToSelection?: boolean }
  | { type: 'camera_preset_next' }
  | { type: 'camera_preset_prev' }
  | { type: 'list_camera_presets' }
  | { type: 'frame_all'; padding?: number }
  | { type: 'frame_entity'; entityId: EntityId; padding?: number }
  // --- AI-Native 3D Debug Draw ---
  | { type: 'draw_debug_line'; fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; color?: number | string; lifetime?: number }
  | { type: 'draw_debug_ray'; originX: number; originY: number; originZ: number; dirX: number; dirY: number; dirZ: number; length: number; color?: number | string; lifetime?: number }
  | { type: 'draw_debug_box'; centerX: number; centerY: number; centerZ: number; sizeX: number; sizeY: number; sizeZ: number; color?: number | string; lifetime?: number }
  | { type: 'draw_debug_sphere'; centerX: number; centerY: number; centerZ: number; radius: number; color?: number | string; lifetime?: number }
  | { type: 'draw_debug_text'; x: number; y: number; z: number; text: string; color?: number | string; size?: number; lifetime?: number }
  | { type: 'clear_debug_draw' }
  | { type: 'set_debug_draw'; enabled: boolean }

  // --- HUD / UI ---
  /** Load a declarative HUD layout (replaces current). */
  | { type: 'hud_load'; layout: HUDLayout }
  /** Show a HUD widget by id. */
  | { type: 'hud_show'; id: string }
  /** Hide a HUD widget by id. */
  | { type: 'hud_hide'; id: string }
  /** Clear all HUD widgets. */
  | { type: 'hud_clear' }
  /** Show an interactive dialogue UI and pause the game (optional). */
  | { type: 'dialogue_show'; text: string; speaker?: string; choices?: { text: string; command?: AICommand }[]; pauseGame?: boolean }

  /** Export type definitions for IDE agents (writes .claude/mix-engine.d.ts etc.). */
  | { type: 'export_typings' }

  // --- Deterministic Input Replay ---
  | { type: 'replay_start_recording' }
  | { type: 'replay_stop_recording' }
  | { type: 'replay_play' }
  | { type: 'replay_pause' }
  | { type: 'replay_stop' }
  | { type: 'replay_step' }
  | { type: 'replay_step_back' }
  | { type: 'replay_set_frame'; frame: number }

  // --- Event Bus ---
  /** Emit a custom event on the global event bus. */
  | { type: 'emit_event'; event: string; data?: unknown }

  /** Drop a decal at a world raycast. */
  | { type: 'spawn_decal'; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; size?: number; color?: number | string; lifetime?: number; tag?: string }
  /** Spawn a free-floating motion / sword trail. Returns a trail id the IDE can stop later. */
  | { type: 'spawn_trail'; color?: number | string; lifetime?: number; width?: number; segments?: number }

  // --- Navigation & AI (the open-world NPC stack) ---
  /** (Re)build the heightfield navmesh over a world-space region. Async — resolves with stats. */
  | { type: 'navmesh_build'; centerX: number; centerZ: number; size: number; cellSize?: number; agentRadius?: number; agentHeight?: number; maxSlopeDeg?: number; maxStepHeight?: number }
  /** Toggle the navmesh + path debug overlay. */
  | { type: 'nav_debug'; enabled?: boolean }
  /** Query walkable floor height at a world position (writes to lastQueryResult). */
  | { type: 'nav_query'; x: number; z: number }
  /** Find an A* path between two world positions (writes waypoints to lastQueryResult). */
  | { type: 'find_path'; fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; smooth?: boolean; goalTolerance?: number }
  /** Attach a NavAgent to an entity (steering + pathfinding + behavior). */
  | { type: 'add_nav_agent'; entityId: EntityId; mode?: NavAgentMode; targetX?: number; targetY?: number; targetZ?: number; targetEntityId?: EntityId; patrol?: [number, number, number][]; patrolLoop?: boolean; steering?: Partial<SteeringParams>; behaviorTree?: BTJson; faceMovement?: boolean; groundSnap?: boolean; tag?: string; flockRadius?: number; queueLaneWidth?: number; enableTrace?: boolean }
  /** Set / change an agent's mode + target (resets its path). */
  | { type: 'set_nav_target'; entityId: EntityId; mode: NavAgentMode; targetX?: number; targetY?: number; targetZ?: number; targetEntityId?: EntityId; patrol?: [number, number, number][] }
  /** Install / replace an agent's behavior tree (sets mode to 'behavior_tree'). */
  | { type: 'set_nav_behavior_tree'; entityId: EntityId; tree: BTJson; enableTrace?: boolean }
  /** Override an agent's steering parameters (maxSpeed, arriveRadius, wanderJitter, …). */
  | { type: 'set_nav_steering'; entityId: EntityId; steering: Partial<SteeringParams> }
  /** Set a blackboard key on an agent's behavior tree. */
  | { type: 'set_nav_blackboard'; entityId: EntityId; key: string; value: unknown }
  /** Remove a NavAgent (the entity itself is untouched). */
  | { type: 'remove_nav_agent'; entityId: EntityId }
  /** SEMANTIC pathfinding: send an agent to a named landmark, a named/tagged entity, or a
   *  world point, at a gait (walk/run/sprint). Auto-creates the agent. Async — writes the
   *  arrival result (status/elapsed/pathLength) to lastQueryResult when it settles. */
  | { type: 'nav_goto'; entityId: EntityId; target: string | [number, number, number]; pathMode?: import('./NavAgentHandle').PathMode; arriveRadius?: number; requirePath?: boolean; timeoutSec?: number }
  /** Register (or move) a named semantic destination the AI can `nav_goto` by string. */
  | { type: 'nav_register_landmark'; name: string; x: number; y: number; z: number; radius?: number }
  /** Enable/configure the dynamic, chunk-aware navmesh (incremental region re-rasterization). */
  | { type: 'navmesh_auto'; enabled: boolean; maxRegionsPerFrame?: number; maxQueued?: number }
  /** Invalidate a world-space rectangle of the navmesh (re-rasterized on the next ticks).
   *  Call after extruding/demolishing a building so paths route around its new collider. */
  | { type: 'navmesh_invalidate'; minX: number; minZ: number; maxX: number; maxZ: number }

  // --- Culling (hierarchical frustum + software occlusion) ---
  /** Enable / disable the culling system. When enabled, the loop runs `cull()` before render. */
  | { type: 'cull_enable'; enabled: boolean; occlusion?: boolean; hierarchicalFrustum?: boolean }
  /** Rebuild the culling BVH from the scene's current top-level objects (call after chunk load/unload). */
  | { type: 'cull_rebuild' }
  /** Tag an entity's root mesh as an occluder (drawn into the software depth buffer). */
  | { type: 'cull_set_occluder'; entityId: EntityId; occluder: boolean }
  /** Tag an entity's root mesh to be excluded from culling entirely (lights, gizmo, debug). */
  | { type: 'cull_set_exclude'; entityId: EntityId; exclude: boolean }
  /** Query the last cull stats (writes to lastQueryResult). */
  | { type: 'cull_status' }

  // --- Vehicles (modular raycast-vehicle physics) ---
  /** Attach a raycast-vehicle controller to an existing dynamic entity (the chassis). */
  | { type: 'add_vehicle'; entityId: EntityId; wheels: Array<{ attach: [number, number, number]; suspensionRestLength?: number; springStiffness?: number; springDamping?: number; radius: number; maxTravel?: number; lateralFriction?: number; longitudinalFriction?: number; driven?: boolean; steered?: boolean }>; spec?: Partial<VehicleSpec> }
  /** Set / update the controller input (throttle, brake, steer, handbrake). */
  | { type: 'set_vehicle_input'; entityId: EntityId; throttle?: number; brake?: number; steer?: number; handbrake?: number }
  /** Remove a vehicle controller (the chassis entity is untouched). */
  | { type: 'remove_vehicle'; entityId: EntityId }
  /** Query vehicle status (speed, rpm, input, wheels in contact). */
  | { type: 'vehicle_status'; entityId?: EntityId }

  // --- Rendering: shadow strategy ---
  /** Swap the shadow strategy: 'single' (one 2048² map) or 'csm' (4-cascade, open-world). */
  | { type: 'set_shadow_strategy'; strategy: 'single' | 'csm' }

  // --- LOD (level-of-detail) ---
  /** Enable/disable the LOD system (auto-generates simplified meshes + swaps by distance). */
  | { type: 'lod_enable'; enabled: boolean }
  /** Register an entity for LOD (generates 2 simplified levels). */
  | { type: 'lod_register'; entityId: EntityId; distances?: number[]; ratios?: number[] }
  /** Unregister an entity (restores the original mesh). */
  | { type: 'lod_unregister'; entityId: EntityId }

  // --- Combat (health, hitboxes, weapons, projectiles) ---
  | { type: 'combat_add_health'; entityId: EntityId; hp: number; faction?: string; damageMultiplier?: number }
  | { type: 'combat_add_hitbox'; entityId: EntityId; colliderHandle: number; part: string; multiplier?: number }
  | { type: 'combat_equip_weapon'; entityId: EntityId; weapon: WeaponSpec | string }
  | { type: 'combat_fire'; entityId: EntityId; originX: number; originY: number; originZ: number; dirX: number; dirY: number; dirZ: number }
  | { type: 'combat_apply_damage'; attackerId?: EntityId; targetId: EntityId; amount: number; damageType?: DamageType }
  | { type: 'combat_status' }

  // --- Runtime asset import (IndexedDB cache) ---
  /** Download a third-party asset from a URL, cache it in IndexedDB, and register it with the manifest. */
  | { type: 'import_asset'; id: string; url: string; assetType?: AssetType }
  /** List all cached asset ids (from IndexedDB). */
  | { type: 'import_list' }
  /** Clear a cached asset (or all if id is omitted). */
  | { type: 'import_clear'; id?: string }

  // --- Terrain Sculpting ---
  /** Create a sculptable terrain mesh at a world position. */
  | { type: 'terrain_create'; x: number; y: number; z: number; size?: number; resolution?: number; materialId?: string; seed?: number; baseNoiseAmplitude?: number }
  /** Apply a sculpting operation to the given terrain. */
  | { type: 'terrain_sculpt'; entityId?: EntityId; op: import('../terrain/TerrainSystem').BrushOp; x: number; z: number; radius: number; strength?: number; hardness?: number; targetHeight?: number; terraceStep?: number }
  /** Apply a linear ramp. */
  | { type: 'terrain_ramp'; entityId?: EntityId; from: [number,number,number]; to: [number,number,number]; width: number; hardness?: number }
  /** Apply fBm noise over an area. */
  | { type: 'terrain_noise'; entityId?: EntityId; x: number; z: number; radius: number; amplitude: number; frequency?: number; octaves?: number; seed?: number; hardness?: number }
  /** Apply erosion to a region. */
  | { type: 'terrain_erode'; entityId?: EntityId; kind: 'hydraulic'|'thermal'; x?: number; z?: number; radius?: number; iterations?: number; options?: Record<string, number> }
  /** Apply multi-layer material painting. */
  | { type: 'terrain_paint'; entityId?: EntityId; layer: number; x: number; z: number; radius: number; strength?: number; hardness?: number }
  /** Set multi-layer material presets for a terrain. */
  | { type: 'terrain_material_layers'; entityId?: EntityId; layers: { layer: number; presetOrUrl: string; repeat?: number }[] }
  /** Conform terrain to a spline path. */
  | { type: 'terrain_spline'; entityId?: EntityId; points: {x: number, y: number, z: number}[]; width: number; hardness?: number; mode?: 'flatten' | 'carve' }
  /** Toggle/refresh grass+pebble scatter. `density` scales the default density; `regenerate` forces a rebuild. */
  | { type: 'terrain_scatter'; entityId?: EntityId; enabled?: boolean; density?: number; regenerate?: boolean }
  /** Query world height at (x,z). */
  | { type: 'terrain_sample'; entityId?: EntityId; x: number; z: number }
  /** Tune the chunked-LOD distance bands (metres, ascending) and/or read back LOD state. */
  | { type: 'terrain_lod'; entityId?: EntityId; distances?: number[] }
  /** Reset terrain height to 0. */
  | { type: 'terrain_reset'; entityId?: EntityId }
  /** Procedurally generate an ENTIRE open world (continents/mountains/biomes/texturing/scatter)
   *  from a seed. Operates on an existing terrain field, or creates one first if none exists. */
  | {
      type: 'world_generate';
      entityId?: EntityId;
      seed?: number;
      size?: number;
      resolution?: number;
      amplitude?: number;
      oceanDepthRatio?: number;
      continentScale?: number;
      landBias?: number;
      mountainScale?: number;
      mountainAmount?: number;
      hillScale?: number;
      detailScale?: number;
      moistureScale?: number;
      warp?: number;
      island?: boolean;
      islandFalloff?: number;
      climate?: 'temperate' | 'desert' | 'arctic' | 'tropical' | 'volcanic';
    }
  /** WORLD COMPOSER: one command builds terrain, authored traversal paths/POIs, water,
   *  foliage, cinematic atmosphere, weather, and an optional navigation bake. */
  | ({ type: 'world_compose' } & import('../world/WorldComposer').WorldComposeRequest)
  /** WORLD COMPOSER QA: return the last recipe plus live subsystem/readiness checks. */
  | { type: 'world_report' }
  /** WATER: create a Gerstner-wave ocean (camera-following, sits at sea level) or a fixed lake. */
  | {
      type: 'water_create';
      kind?: 'ocean' | 'lake';
      seaLevel?: number;
      size?: number;
      segments?: number;
      position?: [number, number];
      waveScale?: number;
      choppiness?: number;
      foam?: number;
      opacity?: number;
      deepColor?: number | string;
      shallowColor?: number | string;
      foamColor?: number | string;
    }
  /** WATER: tune the primary water body (creates an ocean if none exists). */
  | {
      type: 'water_set';
      seaLevel?: number;
      waveScale?: number;
      choppiness?: number;
      foam?: number;
      opacity?: number;
      deepColor?: number | string;
      shallowColor?: number | string;
      foamColor?: number | string;
    }
  /** WATER: remove all water bodies. */
  | { type: 'water_remove' }
  /** WATER: query the wave surface height at a world (x,z) — for buoyancy. */
  | { type: 'water_sample'; x: number; z: number }
  /** CLOUDS: enable/tune the volumetric cloud layer (coverage/density/speed/height/colour). */
  | {
      type: 'clouds_set';
      enabled?: boolean;
      coverage?: number;
      density?: number;
      speed?: number;
      scale?: number;
      heightBottom?: number;
      heightTop?: number;
      color?: number | string;
    }
  /** WIND: set the global wind that drives foliage sway + cloud drift. */
  | { type: 'wind_set'; dirX?: number; dirZ?: number; strength?: number; gustiness?: number }
  /** FOLIAGE: populate biome-aware vegetation (trees/bushes/rocks) over the terrain. */
  | { type: 'foliage_populate'; entityId?: EntityId; density?: number; radius?: number; seed?: number }
  /** FOLIAGE: enable/disable or rescale the foliage density. */
  | { type: 'foliage_set'; enabled?: boolean; density?: number }
  /** FOLIAGE: remove all foliage instances. */
  | { type: 'foliage_clear' }

  // --- Gameplay Logic (declarative rules / quests / zones / timers) ---
  | { type: 'feature_list' }
  | { type: 'feature_enable'; feature: import('../features/gameplay/types').GameplayFeatureId }
  | { type: 'feature_disable'; feature: import('../features/gameplay/types').GameplayFeatureId }
  | { type: 'feature_configure'; feature: import('../features/gameplay/types').GameplayFeatureId; config: Record<string, unknown> }
  | { type: 'feature_enable_all' }
  | { type: 'feature_apply_preset'; preset: 'souls' | 'action' | 'shooter' | 'anime' | 'defaults' | 'essentials' | 'city_builder' | 'gta_open_world' | 'fps_starter' }
  | ({ type: 'city_generate_world' } & import('../features/city/types').CityGenerationConfig)
  | ({ type: 'city_build_roads'; algorithm?: import('../features/city/types').RoadAlgorithm; density?: number } & import('../features/city/types').CityGenerationConfig)
  | { type: 'city_zone_districts'; worldSize?: number }
  | { type: 'city_spawn_buildings'; seed?: number }
  | { type: 'city_load_blueprint'; blueprintName?: string }
  | { type: 'city_clear' }
  | { type: 'arena_start' }
  | { type: 'target_lock_toggle' }
  | { type: 'ability_cast'; slot: 1 | 2 | 3 | 4 }
  | { type: 'arena_launch_demo' }
  | { type: 'game_pause' }
  | { type: 'game_resume' }
  | { type: 'game_settings_set'; settings: Partial<import('../features/gameplay/GeneralFeatureTypes').GameSettingsConfig> }
  | { type: 'objective_add'; id: string; title: string; target: number }
  | { type: 'objective_advance'; id: string; amount: number }
  | { type: 'game_notify'; message: string }
  | { type: 'session_start' }
  | { type: 'session_add_score'; amount: number }
  | { type: 'session_finish'; result: 'won' | 'lost' }
  | { type: 'game_essentials_status' }

  /** Load (replace) the whole declarative game definition and start it. The single
   *  most powerful authoring call: an entire game's rules + quests + trigger zones +
   *  timers as one JSON object. Writes the runtime status to lastQueryResult. */
  | { type: 'gameplay_load'; def: GameplayDef }
  /** Clear the loaded game definition (back to an empty director). */
  | { type: 'gameplay_reset' }
  /** Read the full gameplay runtime (status, variables, quests+objective progress,
   *  zones, timers) into lastQueryResult. */
  | { type: 'gameplay_status' }
  /** Set a gameplay variable (fires `var_changed` rules). */
  | { type: 'gameplay_set_var'; key: string; value: GpValue }
  /** Raise a custom gameplay signal (fires `signal` rules + echoes on the EventBus). */
  | { type: 'gameplay_signal'; name: string; data?: unknown }
  /** Activate a quest. */
  | { type: 'gameplay_start_quest'; quest: string }
  /** Advance an objective's progress counter (default by 1). */
  | { type: 'gameplay_advance'; quest: string; objective: string; by?: number }
  /** Force-complete a quest (runs its rewards). */
  | { type: 'gameplay_complete_quest'; quest: string }
  /** Fail a quest. */
  | { type: 'gameplay_fail_quest'; quest: string }
  /** Open a branching dialogue tree (defined in the loaded gameplay def) by id. */
  | { type: 'gameplay_dialogue_start'; id: string }
  /** Pick a choice on the active dialogue node (index into the node's choices; -1 =
   *  the synthesized "Continue"). Usually issued by the dialogue UI, not authored by hand. */
  | { type: 'gameplay_dialogue_choose'; index: number }

  // --- Items & Inventory ---
  /** Register an item type (name/icon/stack rules/tags + `onUse` command effects). */
  | { type: 'item_define'; def: ItemDef }
  /** Add items to an owner's inventory ('player' by default). Writes {added} to lastQueryResult. */
  | { type: 'inventory_give'; item: string; count?: number; owner?: string }
  /** Remove items from an owner. Writes {removed} to lastQueryResult. */
  | { type: 'inventory_remove'; item: string; count?: number; owner?: string }
  /** Move items between two owners (e.g. loot a 'chest_01' into 'player'). */
  | { type: 'inventory_transfer'; from: string; to: string; item: string; count?: number }
  /** Use one unit of an item (runs its onUse effects, consumes it if consumable). */
  | { type: 'inventory_use'; item: string; owner?: string }
  /** Read an owner's items (or every owner + item-def count) into lastQueryResult. */
  | { type: 'inventory_list'; owner?: string }
  /** Empty an owner's inventory. */
  | { type: 'inventory_clear'; owner?: string }

  // --- Interaction (world-space "press E" interactables) ---
  /** Mark an entity (by id/name/tag) interactable: prompt + commands run on activation. */
  | { type: 'interaction_register'; def: InteractableDef }
  /** Remove an interactable. */
  | { type: 'interaction_unregister'; id: string }
  /** Enable/disable an interactable at runtime. */
  | { type: 'interaction_set_enabled'; id: string; enabled: boolean }
  /** Programmatically activate an interactable (ignores range; respects once/cooldown). */
  | { type: 'interaction_trigger'; id: string }
  /** Read the registered interactables + current prompt target into lastQueryResult. */
  | { type: 'interaction_status' }

  // --- Spawners / Waves (declarative entity spawners) ---
  /** Define (or replace) a spawner: blueprint + area + count/interval/maxAlive/total +
   *  tags + per-spawn `onSpawn` commands ("$entity" → new id). */
  | { type: 'spawner_create'; def: SpawnerDef }
  /** Start (or restart a finished) spawner. */
  | { type: 'spawner_start'; id: string }
  /** Pause a spawner. */
  | { type: 'spawner_stop'; id: string }
  /** Remove a spawner (its already-spawned entities are left alone). */
  | { type: 'spawner_remove'; id: string }
  /** Despawn every entity a spawner created (clear the arena). */
  | { type: 'spawner_clear'; id: string }
  /** Read spawner runtime (running/alive/spawnedTotal/exhausted) into lastQueryResult. */
  | { type: 'spawner_status'; id?: string }

  // --- Save Games (resumable progress bundles) ---
  /** Snapshot ALL progress (gameplay def+runtime, inventory, persistent flags, player
   *  position) into a named slot. Writes a summary to lastQueryResult. */
  | { type: 'save_game'; slot: string }
  /** Restore a saved slot (rebuilds gameplay structure quietly, then applies progress). */
  | { type: 'load_game'; slot: string }
  /** List saved slots (summaries) into lastQueryResult. */
  | { type: 'list_saves' }
  /** Delete a saved slot. */
  | { type: 'delete_save'; slot: string }

  // --- Persistent Game State ---
  /** Set a key-value pair in the persistent game state store (saved to localStorage). */
  | { type: 'set_state'; key: string; value: unknown }
  /** Read a key from the persistent game state store. Writes the value to lastQueryResult. */
  | { type: 'get_state'; key: string }
  /** Return all keys in the store (writes to lastQueryResult). */
  | { type: 'list_state' }
  /** Save a named snapshot of the entire game state (for checkpoint/restore). */
  | { type: 'save_state_snapshot'; name: string }
  /** Restore a named snapshot. */
  | { type: 'load_state_snapshot'; name: string }
  /** Delete a key from the store. */
  | { type: 'remove_state'; key: string }
  /** Clear the entire game state store. */
  | { type: 'clear_state' }

  // --- Animation Packs (MIX Retarget Pro — bulk FBX/GLB import → retarget → wire) ---
  /** Bulk-import a folder of FBX/GLB animations into a named pack, retargeted to a character rig. */
  | { type: 'import_animation_pack'; packId: string; targetRig: string; sourcePath?: string; displayName?: string; boneMappingOverride?: Record<string,string>; scaleOverride?: number; keepRootMotion?: boolean; qualityPreset?: 'aaa'|'balanced'|'fast'; footLock?: boolean }
  /** One-command IDE workflow: import, quality-gate, apply, auto-wire combat, optionally preview. */
  | { type: 'retarget_pro_build'; packId: string; targetRig: string; sourcePath: string; displayName?: string; qualityPreset?: 'aaa'|'balanced'|'fast'; strict?: boolean; target?: 'all'|number|string|number[]; autoApply?: boolean; autoWireCombat?: boolean; previewEntry?: string; prefix?: string; keepRootMotion?: boolean; boneMappingOverride?: Record<string,string>; scaleOverride?: number }
  /** Return a deterministic machine-readable readiness report for one/all packs. */
  | { type: 'retarget_pro_report'; packId?: string }
  /** List every registered pack (defs + issues) into lastQueryResult / /api/scene-query. */
  | { type: 'anim_pack_list' }
  /** Remove a pack (clips remain on already-wired ASMs until they are cleared). */
  | { type: 'anim_pack_remove'; packId: string }
  /** Register every clip in a pack onto target AnimationStateMachines. */
  | { type: 'anim_pack_apply'; packId: string; target?: 'all' | number | string | number[]; prefix?: string }
  /** Wire a pack's combat-relevant clips onto logical combat slots (idle/lightAttack/…), with auto-map fallback. */
  | { type: 'anim_pack_wire_combat'; packId: string; mapping?: Partial<Record<import('../animation/CombatRigWiring').CombatSlot,string>>; auto?: boolean; target?: 'all' | 'selection' | number[] | string; prefix?: string }
  /** Preview one clip on a character (selects it or pass entityId). */
  | { type: 'anim_pack_preview'; packId: string; entryId: string; entityId?: number; fade?: number }

  // --- MIX Motion Director (Animancer 8.4-inspired Code-Driven Motion Engine) ---
  | { type: 'motion_play'; entityId: EntityId; clip: string; packId?: string; layer?: string | number; fade?: number; speed?: number; loop?: boolean; rootMotion?: import('../motion').RootMotionMode }
  | { type: 'motion_stop'; entityId: EntityId; fade?: number; layer?: string | number }
  | { type: 'motion_pause'; entityId: EntityId }
  | { type: 'motion_resume'; entityId: EntityId }
  | { type: 'motion_crossfade'; entityId: EntityId; targetClip: string; fade?: number; layer?: string | number }
  | { type: 'motion_layer_create'; entityId: EntityId; name: string; index?: number; blendMode?: import('../motion').LayerBlendMode; mask?: string }
  | { type: 'motion_layer_weight'; entityId: EntityId; layer: string | number; weight: number; fade?: number }
  | { type: 'motion_parameter_set'; entityId: EntityId; name: string; value: unknown; damping?: number }
  | { type: 'motion_parameter_get'; entityId: EntityId; name: string }
  | { type: 'motion_graph_inspect'; entityId: EntityId; include?: string[] }
  | { type: 'motion_preview'; clip: string; packId?: string; entityId?: number; fade?: number }

  // --- MIX Inspector Studio (Odin 4.0.2.4-inspired Metadata & Validation Engine) ---
  | { type: 'inspect_schema_get'; target: string }
  | { type: 'inspect_schema_define'; target: string; schema: import('../inspector').InspectorSchemaDef }
  | { type: 'inspect_schema_patch'; target: string; patch: Partial<import('../inspector').InspectorSchemaDef> }
  | { type: 'inspect_property_get'; entityId: EntityId; path: string }
  | { type: 'inspect_property_set'; entityId: EntityId; path: string; value: unknown }
  | { type: 'inspect_validate'; entityId?: EntityId; scope?: 'entity' | 'project' | 'scene'; dryRun?: boolean; autoFix?: boolean }
  | { type: 'inspect_serialize'; entityId: EntityId }
  | { type: 'inspect_deserialize'; json: string }
  | { type: 'inspect_diff'; a: any; b: any }

  // --- High-Level Orchestration Commands ---
  | { type: 'character_motion_setup'; entityId: EntityId; packId?: string }
  | { type: 'combat_motion_setup'; entityId: EntityId; packId?: string }
  | { type: 'locomotion_motion_setup'; entityId: EntityId; mode?: '1d' | 'directional' | '8way' }
  | { type: 'motion_quality_report'; entityId: EntityId }

  // --- MIX Tween Director ---
  | { type: 'tween_to'; target?: any; entityId?: EntityId; property: string; to: any; duration?: number; delay?: number; ease?: string; loops?: number; loopType?: any; conflictPolicy?: any; id?: string }
  | { type: 'tween_from'; target?: any; entityId?: EntityId; property: string; from: any; duration?: number; delay?: number; ease?: string; loops?: number; loopType?: any; conflictPolicy?: any; id?: string }
  | { type: 'tween_from_to'; target?: any; entityId?: EntityId; property: string; from: any; to: any; duration?: number; delay?: number; ease?: string; loops?: number; loopType?: any; conflictPolicy?: any; id?: string }
  | { type: 'tween_move'; entityId?: EntityId; x?: number; y?: number; z?: number; duration?: number; ease?: string; loops?: number; loopType?: any; conflictPolicy?: any; id?: string }
  | { type: 'tween_rotate'; entityId?: EntityId; x?: number; y?: number; z?: number; duration?: number; ease?: string; loops?: number; loopType?: any; conflictPolicy?: any; id?: string }
  | { type: 'tween_scale'; entityId?: EntityId; scale?: number; x?: number; y?: number; z?: number; duration?: number; ease?: string; loops?: number; loopType?: any; conflictPolicy?: any; id?: string }
  | { type: 'tween_punch'; entityId?: EntityId; property?: string; x?: number; y?: number; z?: number; duration?: number; vibrato?: number; elasticity?: number }
  | { type: 'tween_shake'; entityId?: EntityId; property?: string; x?: number; y?: number; z?: number; duration?: number; frequency?: number; fadeOut?: boolean }
  | { type: 'tween_sequence_create'; sequenceId?: string; timeScale?: number; loops?: number; loopType?: any; autoPlay?: boolean }
  | { type: 'tween_sequence_append'; sequenceId: string; entityId?: EntityId; op: 'move' | 'rotate' | 'scale'; x?: number; y?: number; z?: number; scale?: any; duration?: number; ease?: string }
  | { type: 'tween_sequence_join'; sequenceId: string; entityId?: EntityId; op: 'move' | 'rotate' | 'scale'; x?: number; y?: number; z?: number; scale?: any; duration?: number; ease?: string }
  | { type: 'tween_sequence_marker'; sequenceId: string; name: string; time?: number }
  | { type: 'tween_sequence_play'; sequenceId: string }
  | { type: 'tween_pause'; id?: string }
  | { type: 'tween_resume'; id?: string }
  | { type: 'tween_cancel'; id?: string; entityId?: EntityId }
  | { type: 'tween_complete'; id?: string }
  | { type: 'tween_inspect' }
  | { type: 'tween_validate'; sequenceJson: any }
  | { type: 'tween_camera'; x?: number; y?: number; z?: number; fov?: number; lookAt?: [number, number, number]; duration?: number; ease?: string }
  | { type: 'tween_color'; entityId?: EntityId; property?: string; color: string; duration?: number; ease?: string }
  | { type: 'tween_material'; entityId: EntityId; opacity?: number; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; duration?: number; ease?: string }
  | { type: 'tween_audio'; trackId?: string; volume: number; duration?: number; ease?: string }
  | { type: 'tween_path'; entityId: EntityId; waypoints: Array<[number, number, number]>; duration?: number; ease?: string; lookAhead?: number; autoRotate?: boolean }
  | { type: 'tween_seek'; id: string; time?: number; progress?: number }
  | { type: 'tween_reverse'; id: string }
  | { type: 'tween_effect_create'; effectId?: string; autoPlay?: boolean; steps: Array<{ op: 'move' | 'rotate' | 'scale' | 'material' | 'marker' | 'interval'; entityId?: EntityId; to?: any; property?: any; duration?: number; ease?: string; join?: boolean; name?: string; offset?: number }> };

export interface AIBridgeDeps {
  sceneManager: SceneManager;
  worldOrigin: WorldOrigin;
  input: InputManager;
  manifest: AssetManifest;
  /** Semantic asset registry (natural-language → tagged GLB). Drives `spawn_smart`. */
  assets?: import('../assets/SemanticAssetRegistry').SemanticAssetRegistry;
  viewport: Viewport;
  physicsWorld: PhysicsWorld;
  cinematic: CinematicCamera;
  cutsceneDirector?: CutsceneDirector;
  audio: AudioManager;
  sensorium: SensoriumRunner;
  chunkManager?: ChunkManager;
  spawnVfx: (preset: VfxPresetName, worldPos: THREE.Vector3, opts: { duration?: number; loop?: boolean; maxParticles?: number }) => void;
  burstVfx: (preset: VfxPresetName, worldPos: THREE.Vector3, count: number) => void;
  captureScreenshot: (filename: string, width?: number, height?: number) => Promise<void>;
  setTimeOfDay: (hour: number) => void;
  /** Optional IDE-facing effects facade (engine.effects). Injected by the
   *  Engine constructor; defaults to no-op shims if the dep is missing. */
  effects?: import('../effects/EffectsController').EffectsController;
  /** Optional viewport-zoom helpers. */
  zoomIn?: (factor?: number) => void;
  zoomOut?: (factor?: number) => void;
  zoomReset?: () => void;
  frameAll?: (padding?: number) => void;
  frameEntity?: (entityId: number, padding?: number) => void;
  applyCameraPreset?: (id: string, opts?: { anchorToSelection?: boolean }) => boolean;
  cycleCameraPreset?: (dir: 1 | -1) => string | null;
  listCameraPresets?: () => import('../cinematic/CameraPresets').CameraPreset[];
  /** Tell the engine a camera-following light was added so it rescans for it (instead of
   *  the engine scanning the whole scene every frame). */
  markDynamicLightsDirty?: () => void;
  /** The navigation + AI steering stack. Required for the `nav_*` commands; if absent
   *  (e.g. in a headless test) those commands no-op with a warning. */
  nav?: NavigationSystem;
  /** The culling system. Required for the `cull_*` commands; if absent they no-op. */
  culling?: CullingSystem;
  /** The vehicle physics system. Required for the `add_vehicle` / `set_vehicle_input` commands. */
  vehicles?: VehicleSystem;
  /** The LOD system. Required for the `lod_*` commands. */
  lod?: LODSystem;
  /** The combat system. Required for `combat_*` commands. */
  combat?: CombatSystem;
  /** Runtime asset importer (IndexedDB cache). */
  assetImporter?: import('../streaming/RuntimeAssetImporter').RuntimeAssetImporter;
  /** Terrain system. Required for `terrain_*` and `world_generate` commands. */
  terrain?: import('../terrain/TerrainSystem').TerrainSystem;
  /** Animated time-of-day cycle. Required for `day_night_cycle`. */
  dayNight?: import('../rendering/DayNightCycle').DayNightCycle;
  /** Gerstner water system. Required for `water_*` commands. */
  water?: import('../water/WaterSystem').WaterSystem;
  /** Volumetric cloud layer. Required for `clouds_set`. */
  clouds?: import('../rendering/CloudLayer').CloudLayer;
  /** Global wind. Required for `wind_set`. */
  wind?: import('../world/WindSystem').WindSystem;
  /** Biome-aware foliage. Required for `foliage_*` commands. */
  foliage?: import('../world/FoliageSystem').FoliageSystem;
  /** AI-Native 3D debug draw. Used by `draw_debug_*` commands. */
  debugDraw?: DebugDraw;
  /** Declarative HUD overlay. Used by `hud_*` commands. */
  hud?: HUD;
  /** Deterministic input replay. Used by `replay_*` commands. */
  replay?: InputReplay;
  /** Interactive dialogue overlay system. */
  dialogueSystem?: import('../ui/DialogueSystem').DialogueSystem;
  /** Declarative gameplay-logic director. Required for the `gameplay_*` commands. */
  gameplay?: import('../gameplay').GameplayDirector;
  /** Items & Inventory system. Required for the `item_*` / `inventory_*` commands. */
  items?: import('../items').InventorySystem;
  /** Interaction system. Required for the `interaction_*` commands. */
  interaction?: import('../interaction').InteractionSystem;
  /** Spawner system. Required for the `spawner_*` commands. */
  spawner?: import('../spawning').SpawnerSystem;
   /** Save-game system. Required for the `save_game`/`load_game`/`list_saves`/`delete_save` commands. */
   saves?: import('../persistence').SaveSystem;
  bakes?: import('../features/BakeRegistry').BakeRegistry;
  animRegistry?: import('../animation/AnimationPackRegistry').AnimationPackRegistry;
  animImporter?: import('../animation/AnimationImporter').AnimationImporter;
  findAsm?: (entityId: number) => import('../animation/AnimationStateMachine').AnimationStateMachine | null;
  getAllAsm?: () => Iterable<import('../animation/AnimationStateMachine').AnimationStateMachine>;
  getSelectedEntityId?: () => number | null;
  motionDirector?: import('../motion').MotionDirectorManager;
  inspectorStudio?: import('../inspector').InspectorStudioManager;
  tweenDirector?: import('../tween').TweenDirectorManager;
  jointSystem?: import('../physics/JointSystem').JointSystem;
  ragdollBuilder?: import('../physics/RagdollBuilder').RagdollBuilder;
  getLocomotor?: (entityId: number) => import('../character/CharacterLocomotor').CharacterLocomotor | undefined;
  history?: import('../authoring/CommandHistory').CommandHistory;
  morphSystem?: import('../animation/MorphTargetSystem').MorphTargetSystem;
  animEventBridge?: import('../animation/StateMachineEventBridge').StateMachineEventBridge;
  getAimIKSolver?: (entityId: number) => import('../animation/AimIKSolver').AimIKSolver | undefined;
  setAimIKTarget?: (entityId: number, worldTarget: THREE.Vector3, weight: number) => boolean;
  reverbSystem?: import('../audio/ReverbZoneSystem').ReverbZoneSystem;
  timelineSequencer?: import('../cinematic/TimelineSequencer').TimelineSequencer;
  volumetricFog?: import('../rendering/VolumetricFogSystem').VolumetricFogSystem;
  decalSystem?: import('../rendering/DecalSystem').DecalSystem;
  meshFracturer?: import('../physics/MeshFracturer').MeshFracturer;
  weatherSystem?: import('../environment/WeatherSystem').WeatherSystem;
  aiDirector?: import('./AIDirector').AIDirector;
  clothSystem?: import('../physics/VerletClothSystem').VerletClothSystem;
  createReflectionProbe?: (id: string, position: THREE.Vector3, config?: import('../rendering/ReflectionProbe').ReflectionProbeConfig) => boolean;
  removeReflectionProbe?: (id: string) => boolean;
  markReflectionProbeDirty?: (id: string) => boolean;
  springBones?: import('../physics/SpringBoneSystem').SpringBoneSystem;
  activeRagdolls?: import('../physics/ActiveRagdollSystem').ActiveRagdollSystem;
  footIK?: import('../animation/FootIKSystem').FootIKSystem;
  buoyancy?: import('../physics/BuoyancySystem').BuoyancySystem;
  chunkDeltas?: import('../streaming/ChunkDeltaBinder').ChunkDeltaBinder;
  hlod?: import('../rendering/HlodSystem').HlodSystem;
  network?: import('../network/NetworkSystem').NetworkSystem;
  gpuParticles?: import('../vfx/GpuParticleSystem').GpuParticleSystem;
  prefabs?: import('../engine/PrefabManager').PrefabManager;
  profiler?: import('../diagnostics/FrameProfiler').FrameProfiler;
  selection?: import('../editor/SelectionManager').SelectionManager;
  selectionChanged?: () => void;
  gameplayFeatures?: import('../features/gameplay/GameplayFeatureManager').GameplayFeatureManager;
}

/**
 * AIBridge.ts — the IDE's control surface. Commands are QUEUED (never inline) and
 * drained once per frame under a 2ms sync budget; async work (GLB loads, saves,
 * sounds, screenshots) is dispatched and applied through the deferred spawn point
 * or callbacks. Per-frame followers (paths) advance in `update(dt)`.
 */
export class AIBridge {
  static readonly COMMAND_BUDGET_MS = 2;

  private readonly queue: AICommand[] = [];
  private readonly handlerMap: CommandMap = new Map();
  private readonly ctx: CmdCtx;

  /** Optional AI metadata persisted with the world snapshot. */
  metadata: Record<string, unknown> = {};

  /** Last scene-query result, also POSTed to the dev server for IDE pickup. */
  lastQueryResult: unknown = null;

  /** SENSORIUM: last completed report (also POSTed to /api/sensorium/report). */
  lastSensoriumReport: SensoriumReport | null = null;
  /** @deprecated alias of {@link lastSensoriumReport}. */
  get lastPlaybackReport(): SensoriumReport | null { return this.lastSensoriumReport; }

  /** Named/tagged entity metadata — the IDE's handle for reasoning about the scene. */
  private readonly entityNames = new Map<EntityId, string>();

  /** Active path followers (advanced each frame in update(dt)). */
  private readonly followers: PathFollower[] = [];

  /** Reusable vectors */
  private readonly _engPos = new THREE.Vector3();
  private readonly _worldPos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _v = new THREE.Vector3();

  private _inFlightAsync = 0;
  get inFlightAsync(): number { return this._inFlightAsync; }
  private trackAsync<T>(p: Promise<T>): Promise<T> {
    this._inFlightAsync++;
    return p.finally(() => { this._inFlightAsync--; });
  }

  constructor(deps: AIBridgeDeps) {
    // Build the shared context that all command handlers receive.
    // Using arrow-function members so `this` is bound to the AIBridge instance.
    const self = this;
    const ctx: CmdCtx = {
      // subsystems
      sceneManager: deps.sceneManager,
      worldOrigin: deps.worldOrigin,
      input: deps.input,
      manifest: deps.manifest,
      assets: deps.assets,
      viewport: deps.viewport,
      physicsWorld: deps.physicsWorld,
      cinematic: deps.cinematic,
      cutsceneDirector: deps.cutsceneDirector,
      audio: deps.audio,
      sensorium: deps.sensorium,
      chunkManager: deps.chunkManager,
      effects: deps.effects,
      nav: deps.nav,
      culling: deps.culling,
      vehicles: deps.vehicles,
      lod: deps.lod,
      combat: deps.combat,
      assetImporter: deps.assetImporter,
      terrain: deps.terrain,
      dayNight: deps.dayNight,
      water: deps.water,
      clouds: deps.clouds,
      wind: deps.wind,
      foliage: deps.foliage,
      debugDraw: deps.debugDraw,
      hud: deps.hud,
      replay: deps.replay,
      dialogueSystem: deps.dialogueSystem,
      gameplay: deps.gameplay,
      items: deps.items,
      interaction: deps.interaction,
      spawner: deps.spawner,
      saves: deps.saves,
      bakes: deps.bakes,
      animRegistry: deps.animRegistry,
      animImporter: deps.animImporter,
      findAsm: deps.findAsm,
      getAllAsm: deps.getAllAsm,
      getSelectedEntityId: deps.getSelectedEntityId,
      motionDirector: deps.motionDirector,
      inspectorStudio: deps.inspectorStudio,
      tweenDirector: deps.tweenDirector,
      jointSystem: deps.jointSystem,
      ragdollBuilder: deps.ragdollBuilder,
      getLocomotor: deps.getLocomotor,
      history: deps.history,
      morphSystem: deps.morphSystem,
      animEventBridge: deps.animEventBridge,
      getAimIKSolver: deps.getAimIKSolver,
      setAimIKTarget: deps.setAimIKTarget,
      reverbSystem: deps.reverbSystem,
      timelineSequencer: deps.timelineSequencer,
      volumetricFog: deps.volumetricFog,
      decalSystem: deps.decalSystem,
      meshFracturer: deps.meshFracturer,
      weatherSystem: deps.weatherSystem,
      aiDirector: deps.aiDirector,
      clothSystem: deps.clothSystem,
      createReflectionProbe: deps.createReflectionProbe,
      removeReflectionProbe: deps.removeReflectionProbe,
      markReflectionProbeDirty: deps.markReflectionProbeDirty,
      springBones: deps.springBones,
      activeRagdolls: deps.activeRagdolls,
      footIK: deps.footIK,
      buoyancy: deps.buoyancy,
      chunkDeltas: deps.chunkDeltas,
      hlod: deps.hlod,
      network: deps.network,
      gpuParticles: deps.gpuParticles,
      prefabs: deps.prefabs,
      profiler: deps.profiler,
      selection: deps.selection,
      selectionChanged: deps.selectionChanged,
      gameplayFeatures: deps.gameplayFeatures,

      // injected functions
      spawnVfx: deps.spawnVfx,
      burstVfx: deps.burstVfx,
      captureScreenshot: deps.captureScreenshot,
      setTimeOfDay: deps.setTimeOfDay,
      zoomIn: deps.zoomIn,
      zoomOut: deps.zoomOut,
      zoomReset: deps.zoomReset,
      frameAll: deps.frameAll,
      frameEntity: deps.frameEntity,
      applyCameraPreset: deps.applyCameraPreset,
      cycleCameraPreset: deps.cycleCameraPreset,
      listCameraPresets: deps.listCameraPresets,
      markDynamicLightsDirty: deps.markDynamicLightsDirty,

      // mutable state
      entityNames: this.entityNames,
      followers: this.followers,
      setQueryResult: (val) => { self.lastQueryResult = val; },
      setSensoriumReport: (val) => { self.lastSensoriumReport = val as SensoriumReport | null; },
      trackAsync: <T>(p: Promise<T>) => self.trackAsync(p),
      execute: (cmd) => { self.queue.push(cmd); },
      resolveEntity: (ref) => self.resolveEntity(ref),
      getEntityTags: (id) => self.getEntityTags(id),

      // controls (assigned later via registerViewportControls / registerGridControls)
      _setSnap: undefined,
      _setGrid: undefined,
      _setGizmoMode: undefined,
      _detachViewport: undefined,
      _reattachViewport: undefined,

      // vector pool
      _engPos: this._engPos,
      _worldPos: this._worldPos,
      _quat: this._quat,
      _v: this._v,
    };
    this.ctx = ctx;

    // Register all command handlers by domain.
    registerEntity(this.handlerMap, ctx);
    registerPhysics(this.handlerMap, ctx);
    registerRender(this.handlerMap, ctx);
    registerAudio(this.handlerMap, ctx);
    registerCinematic(this.handlerMap, ctx);
    registerQuery(this.handlerMap, ctx);
    registerSceneIO(this.handlerMap, ctx);
    registerNav(this.handlerMap, ctx);
    registerSystems(this.handlerMap, ctx);
    registerWorld(this.handlerMap, ctx);
    registerSensorium(this.handlerMap, ctx);
    registerEffects(this.handlerMap, ctx);
    registerGameplay(this.handlerMap, ctx);
    registerInventory(this.handlerMap, ctx);
    registerInteraction(this.handlerMap, ctx);
    registerSpawner(this.handlerMap, ctx);
    registerSave(this.handlerMap, ctx);
    registerAnim(this.handlerMap, ctx);
    registerMotion(this.handlerMap, ctx);
    registerInspect(this.handlerMap, ctx);
    registerTween(this.handlerMap, ctx);
    registerHighLevel(this.handlerMap, ctx);
    registerVisualStyle(this.handlerMap, ctx);
    registerBake(this.handlerMap, ctx);
    registerComponent(this.handlerMap, ctx);
    registerInput(this.handlerMap, ctx);
    registerChar(this.handlerMap, ctx);
    registerJoint(this.handlerMap, ctx);
    registerHistory(this.handlerMap, ctx);
    registerAuthoring(this.handlerMap, ctx);
    registerPresentation(this.handlerMap, ctx);
    registerExport(this.handlerMap, ctx);
    registerIntelligence(this.handlerMap, ctx);
    registerRealism(this.handlerMap, ctx);
    registerDirector(this.handlerMap, ctx);
    registerRuntimeIntegrations(this.handlerMap, ctx);
    registerFeature(this.handlerMap, ctx);
    registerMisc(this.handlerMap, ctx);
  }

  registerViewportControls(controls: { detach: () => void; reattach: () => void }): void {
    this.ctx._detachViewport = controls.detach;
    this.ctx._reattachViewport = controls.reattach;
  }

  registerGridControls(controls: {
    setGrid: (config: any) => void;
    setSnap: (enabled?: boolean, translateSnap?: number, rotateSnap?: number) => void;
    setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  }): void {
    this.ctx._setGrid = controls.setGrid;
    this.ctx._setSnap = controls.setSnap;
    this.ctx._setGizmoMode = controls.setGizmoMode;
  }

  /** HELM: number of commands still waiting in the queue (0 = drained). The agent
   *  control plane polls this to know when a submitted batch has been dispatched. */
  get pendingCommandCount(): number {
    return this.queue.length;
  }

  /** Queue a command — never runs it inline. */
  execute(cmd: AICommand): void {
    this.queue.push(cmd);
  }

  /** Convenience: queue many commands at once (used by `run_script` and the IDE). */
  executeAll(cmds: AICommand[]): void {
    for (const c of cmds) this.queue.push(c);
  }

  /** Loop step 4 — drain under a fixed sync budget; async work is dispatched, not awaited. */
  processQueue(): void {
    const start = performance.now();
    while (this.queue.length > 0 && performance.now() - start < AIBridge.COMMAND_BUDGET_MS) {
      this.dispatch(this.queue.shift()!);
    }
  }

  /** Per-frame advance for path followers (called by the Engine loop after processQueue). */
  update(dt: number): void {
    if (this.followers.length === 0) return;
    for (let i = this.followers.length - 1; i >= 0; i--) {
      const f = this.followers[i];
      const rb = this.ctx.sceneManager.getRigidBody(f.entityId);
      if (!rb) {
        this.followers.splice(i, 1);
        continue;
      }
      const len = f.path.length;
      const advance = (f.speed * dt) / Math.max(len, 1e-6);
      f.t += advance;
      if (f.t >= 1) {
        if (f.loop) f.t = f.t - Math.floor(f.t);
        else {
          f.t = 1;
          this.followers.splice(i, 1);
        }
      }
      f.path.sampleUniform(f.t, this._worldPos);
      this.ctx.worldOrigin.toEngineSpaceInto(this._engPos, this._worldPos);
      rb.teleport(this._engPos, rb.mesh.quaternion);
      if (f.lookAlongPath) {
        f.path.tangentUniform(Math.min(f.t + 1e-3, 1), this._v);
        this._quat.setFromUnitVectors(_forward, this._v);
        rb.teleport(rb.mesh.position, this._quat);
      }
    }
  }

  private dispatch(cmd: AICommand): void {
    const handler = this.handlerMap.get(cmd.type);
    if (handler) {
      const result = handler(cmd);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void this.trackAsync(Promise.resolve(result).then((value) => {
          if (value !== undefined) this.lastQueryResult = value;
        })).catch((error) => {
          console.error(`[AIBridge] Async command '${cmd.type}' failed:`, error);
        });
      } else if (result !== undefined) {
        this.lastQueryResult = result;
      }
    } else {
      // Runtime map lookup — TS can't prove exhaustiveness here (unlike a switch), so we
      // log unknown command types rather than asserting `never`.
      console.warn(`[AIBridge] No handler registered for command type: ${(cmd as { type?: string }).type}`);
    }
  }

  /** Resolves a named or tagged reference (e.g. '@player' or '@ayo') to a numeric EntityId. */
  resolveEntity(ref: string): EntityId | undefined {
    if (ref.startsWith('@')) {
      const tagOrName = ref.substring(1);
      for (const [id, name] of this.entityNames.entries()) {
        if (name === tagOrName) return id;
      }
      for (const id of this.ctx.sceneManager.allEntityIds()) {
        if (this.ctx.sceneManager.getTags(id).includes(tagOrName)) return id;
      }
    }
    return undefined;
  }

  getEntityName(id: EntityId): string | undefined {
    return this.entityNames.get(id);
  }
  getEntityTags(id: EntityId): string[] {
    return this.ctx.sceneManager.getTags(id);
  }

  /** HELM: set a name immediately (no queue) — used by checkpoint restore so names are
   *  reapplied deterministically without waiting on the command-drain loop. */
  setEntityName(id: EntityId, name: string): void {
    this.entityNames.set(id, name);
  }
  /** HELM: add a tag immediately (no queue). */
  addEntityTag(id: EntityId, tag: string): void {
    this.ctx.sceneManager.addTag(id, tag);
  }
}

const _forward = new THREE.Vector3(0, 0, -1);
