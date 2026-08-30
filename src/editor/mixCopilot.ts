import type { Engine } from '../engine/Engine';
import { GameplayFeatureRegistry } from '../features/gameplay/GameplayFeatureRegistry';
import { PRESET_ULTIMATES } from '../features/combat/UltimateAttackStudio';
import { FPS_STARTER_CONTENT, createFpsStarterGrenades, createFpsStarterWeapons } from '../content/FpsStarterPack';
import { HELM_MANIFEST } from '../helm/manifest';
import { showToast } from '../ui/domUtils';

export type CopilotFocus = 'full' | 'camera' | 'gameplay' | 'animation' | 'world' | 'shooter' | 'anime' | 'systems';
export type CopilotIterations = 1 | 3 | 5;

export interface CopilotOptions {
  goal: string;
  focus: CopilotFocus;
  iterations: CopilotIterations;
  nextIteration?: boolean;
}

let lastBrief = '';
let lastGoal = '';

const FOCUS_LABELS: Record<CopilotFocus, string> = {
  full: 'whole playable slice',
  camera: 'camera and presentation',
  gameplay: 'modular gameplay systems',
  animation: 'animation, motion, and game feel',
  world: 'world building and encounter layout',
  shooter: 'FPS weapons, cover, and combat encounters',
  anime: 'anime combat, Ki, flight, and impact presentation',
  systems: 'player-facing game flow and runtime UI',
};

const FOCUS_RECIPES: Record<CopilotFocus, string> = {
  full: 'Connect one small playable loop across camera, input, gameplay, animation, feedback, and a testable encounter.',
  camera: 'Evaluate composition, target readability, camera collision, look-ahead, damping, and camera shake. Keep gameplay readable at the proposed angles.',
  gameplay: 'Compose existing modular features into one coherent mechanic. Check feature configuration and input/action paths before adding new code.',
  animation: 'Inspect available clips and state machines, then improve transitions, root motion, hit timing, anticipation, recovery, and feedback.',
  world: 'Build a small readable space with a clear player goal, traversal route, encounter beats, lighting, and camera sightlines.',
  shooter: 'Compose the FPS Starter weapons, weapon wheel, grenade, cover, ranged damage, reload, audio, and killstreak systems into a testable encounter.',
  anime: 'Compose Two-Axis Anime Combat & Ki, Superhero Flight, Anime Combat Director, ultimate recipes, ribbon trails, and deformable ground into one readable action beat.',
  systems: 'Use Pause Menu, Player Settings, Objective Tracker, Notifications, Session Flow, and General Gameplay UI to make the playable loop understandable and shippable.',
};

const CAMERA_STARTING_IDEAS: Record<CopilotFocus, string> = {
  full: 'Try a readable third-person over-shoulder for navigation, a slightly wider target orbit for combat, and a low 3/4 hero angle for the first reveal.',
  camera: 'Compare an over-shoulder follow, a side profile that preserves silhouettes, and a wider orbit that keeps both combatants readable. Explain when each angle should take over.',
  gameplay: 'Start with an over-shoulder camera for player intent, then use target-lock orbit or a brief impact push-in only when it improves feedback without hiding threats.',
  animation: 'Use a 3/4 follow angle to show weight and footwork, a tighter impact angle for a short hit beat, and a stable recovery frame so transitions remain readable.',
  world: 'Block an establishing wide, a path-reveal angle that shows the next objective, and a combat pocket angle with clear sightlines and room for traversal.',
  shooter: 'Use a stable over-shoulder or first-person sight picture for aim, a wide flank view for cover readability, and a restrained impact punch that never hides the reticle or threat.',
  anime: 'Use multi-target smart framing for duels, a wider aerial chase for flight, and a brief impact close-up only during hit-stop or an ultimate release.',
  systems: 'Keep gameplay camera movement stable while overlays communicate objectives, notifications, score, timer, and pause/settings state.',
};

const PRIORITY_COMMANDS = [
  'world_compose', 'world_report', 'city_generate_world', 'city_load_blueprint',
  'feature_apply_preset', 'feature_configure', 'game_essentials_status',
  'objective_add', 'objective_advance', 'session_start', 'session_finish',
  'combat_motion_setup', 'anim_retarget_pro', 'anim_pack_wire_combat',
  'combat_trigger_impact_frame', 'combat_trigger_hit_stop', 'combat_trigger_camera_punch',
  'destruction_slice_mesh', 'destruction_create_crater', 'combat_fire',
  'combat_equip_weapon', 'spawner_create', 'navmesh_build', 'weather_set',
  'sensorium_test', 'sensorium_status', 'checkpoint', 'assert',
];

function sceneContext(engine: Engine): string {
  const selected = engine.gizmo.attached;
  const selectedId = selected ? engine.sceneManager.entityOf(selected) : null;
  const entities = engine.sceneManager.allEntityIds().slice(0, 32).map((id) => {
    const rb = engine.sceneManager.getRigidBody(id);
    const blueprint = engine.sceneManager.getBlueprint(id);
    const label = rb?.mesh.name || blueprint?.kind || 'entity';
    const tags = engine.sceneManager.getTags(id);
    return `#${id} ${label}${tags.length ? ` [${tags.join(', ')}]` : ''}`;
  });

  const features = GameplayFeatureRegistry.list().map((descriptor) => {
    const enabled = engine.gameplayFeatures.isFeatureEnabled(descriptor.id);
    return `${enabled ? 'ON ' : 'off'} ${descriptor.id}: ${descriptor.name}`;
  });

  const packs = engine.animPacks.list().map((pack) => {
    const entries = pack.def.entries.length;
    return `${pack.def.displayName} (${entries} clips, rig=${pack.def.targetRig})`;
  });

  let selectedAnimations = 'none selected';
  if (selected) {
    const asm = engine.findAnimationStateMachine(selected);
    if (asm) selectedAnimations = asm.listAnimations().slice(0, 18).join(', ') || 'state machine has no clips';
  }

  const camera = engine.viewport.camera;
  const cameraPosition = `${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`;
  return [
    `Scene entities: ${engine.sceneManager.entityCount} total${entities.length ? ` (sample: ${entities.join('; ')})` : ''}`,
    `Selected entity: ${selectedId === null ? 'none' : `#${selectedId}`}`,
    `Editor camera: position=(${cameraPosition}), fov=${camera.fov.toFixed(1)}°, mode=${engine.input.mode}`,
    `Selected animation states: ${selectedAnimations}`,
    `Imported animation packs: ${packs.length ? packs.join('; ') : 'none (use bundled Mixamo assets or Retarget Pro)'}`,
    'Gameplay feature state:',
    features.join('\n'),
  ].join('\n');
}

function summarizeConfig(config: unknown): string {
  if (!config || typeof config !== 'object') return String(config);
  const entries = Object.entries(config as Record<string, unknown>);
  return entries.slice(0, 14).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}=[${value.length} items]`;
    if (value && typeof value === 'object') return `${key}={...}`;
    return `${key}=${String(value)}`;
  }).join(', ');
}

function contentContext(engine: Engine): string {
  const assets = engine.manifest.toJSON();
  const assetCounts = assets.reduce<Record<string, number>>((counts, asset) => {
    counts[asset.type] = (counts[asset.type] ?? 0) + 1;
    return counts;
  }, {});
  const fpsAssets = FPS_STARTER_CONTENT.assets;
  const fpsModels = fpsAssets.filter((asset) => asset.kind === 'model').map((asset) => asset.name).join(', ');
  const fpsAudioCount = fpsAssets.filter((asset) => asset.kind === 'audio').length;
  const weapons = createFpsStarterWeapons().map((weapon) => `${weapon.name} (${weapon.type}, ${weapon.magazineSize}-round mag)`).join('; ');
  const grenades = createFpsStarterGrenades().map((grenade) => `${grenade.name} (${grenade.blastRadius}m blast, ${grenade.damage} damage)`).join('; ');
  const ultimates = PRESET_ULTIMATES.map((recipe) => `${recipe.name} [${recipe.element}, ${recipe.baseDamage} dmg, ${recipe.vfx}]`).join('; ');

  const manager = engine.gameplayFeatures;
  const liveModules = [
    ['city', manager.city],
    ['two_axis_combat', manager.twoAxisCombat],
    ['shrinking_storm', manager.storm],
    ['superhero_flight_system', manager.flight],
    ['deformable_ground', manager.deformableGround],
    ['anime_combat_director', manager.combatDirector],
    ['pause_menu', manager.pause],
    ['game_settings', manager.settings],
    ['objective_tracker', manager.objectives],
    ['game_notifications', manager.notifications],
    ['session_flow', manager.session],
  ] as const;
  const moduleState = liveModules.map(([id, module]) => {
    const config = typeof module.getConfig === 'function' ? module.getConfig() : undefined;
    return `- ${id}: ${summarizeConfig(config)}`;
  });
  const city = manager.city;

  return [
    `Registered manifest assets: ${assets.length} (${Object.entries(assetCounts).map(([type, count]) => `${type}=${count}`).join(', ')})`,
    `FPS Starter Pack: ${fpsModels}; ${fpsAudioCount} audio clips; license status=${FPS_STARTER_CONTENT.licenseStatus} (verify rights before redistribution).`,
    `FPS Starter weapons: ${weapons}`,
    `FPS Starter grenades: ${grenades}`,
    `Preset anime ultimates: ${ultimates}`,
    `Procedural city runtime: roads=${city.getRoads().length}, intersections=${city.getIntersections().length}, lots=${city.getLots().length}, buildings=${city.getBuildings().length}, bridges=${city.getBridges().length}, props=${city.getProps().length}, vegetation=${city.getVegetation().length}`,
    'New live module configuration:',
    ...moduleState,
    'High-level authoring surfaces now available: World Composer (world_compose/world_report), Procedural City Director (city_*), Retarget Pro animation packs, Animation Notifies and Bone Sockets, Multi-Target Smart Framing, Ribbon Trails, Destruction/Craters, Navigation, Weather, Gameplay Director, Inventory, Interaction, Spawners, Prefabs, VFX/Effects, and General Gameplay UI.',
  ].join('\n');
}

function commandContext(): string {
  const byType = new Map(HELM_MANIFEST.commands.map((command) => [command.type, command]));
  const priority = PRIORITY_COMMANDS.flatMap((type) => {
    const command = byType.get(type);
    return command ? [command] : [];
  });
  const priorityTypes = new Set(priority.map((command) => command.type));
  const useful = [...priority, ...HELM_MANIFEST.commands
    .filter((command) => !priorityTypes.has(command.type))
    .filter((command) => /camera|animation|motion|feature|spawn|scene|gameplay|sensorium|assert|query|checkpoint|vfx|effect|city|world|combat|destruction|objective|session|pause|settings|weather|nav|prefab|flight|storm|ultimate|weapon|interaction/i.test(`${command.type} ${command.summary}`))]
    .slice(0, 55)
    .map((command) => `- ${command.type}${command.params.length ? ` (${command.params.join(', ')})` : ''}: ${command.summary}`);
  return [`HELM ${HELM_MANIFEST.version}: ${HELM_MANIFEST.commands.length} commands, ${HELM_MANIFEST.ops.length} operations`, ...useful].join('\n');
}

export function buildCopilotPrompt(engine: Engine, options: CopilotOptions): string {
  const goal = options.goal.trim() || 'Create a small, fun playable moment from the current scene.';
  const previous = options.nextIteration && lastBrief
    ? `\nPrevious brief was already attempted. Treat its result as the starting point, inspect what actually landed, and improve the weakest player-facing issue.\nPrevious goal: ${lastGoal}`
    : '';
  const prompt = [
    '# MIX ENGINE COPILOT — IMPLEMENTATION BRIEF',
    '',
    'You are the implementation agent for a game being built in MIX Engine. Work directly in the existing project. Do not invent APIs when the engine already exposes a capability.',
    '',
    `PLAYER GOAL: ${goal}`,
    `FOCUS: ${FOCUS_LABELS[options.focus]}`,
    `ITERATION BUDGET: ${options.iterations} implementation pass${options.iterations === 1 ? '' : 'es'}`,
    FOCUS_RECIPES[options.focus],
    `CAMERA STARTING IDEAS: ${CAMERA_STARTING_IDEAS[options.focus]}`,
    previous,
    '',
    'CURRENT MIX CONTEXT',
    sceneContext(engine),
    '',
    'CURRENT CONTENT AND RUNTIME SURFACES',
    contentContext(engine),
    '',
    'RELEVANT HELM CAPABILITIES (discover the full manifest before using one)',
    commandContext(),
    '',
    'REQUIRED DEVELOPMENT LOOP',
    '1. Inspect the current scene, selected entity, existing scripts, feature configuration, animation states, and relevant command/API definitions.',
    '2. Propose one small vertical slice with a camera plan, modular systems, animation states, input mapping, content assets, and success criteria. Keep the proposal concrete enough to implement.',
    '3. Implement the slice using existing MIX systems first: World Composer or Procedural City for spaces; Gameplay Feature Hub systems; FPS Starter weapons when shooting is relevant; Two-Axis/Ki, Superhero Flight, Anime Combat Director, ultimates, trails, and craters when action is relevant; Pause/Settings/Objectives/Notifications/Session Flow for shippable game flow; CinematicCamera/CutsceneDirector, AnimationStateMachine/Retarget Pro, HELM commands, VFX/effects, and GameplayDirector where appropriate.',
    '4. Run the smallest useful playtest. Use SENSORIUM when the change affects movement, combat, camera feel, or a playable sequence. Capture assertions for the intended behavior.',
    '5. Inspect the result, fix the most visible or player-facing problem, and report changed files, commands used, test evidence, and the next recommended iteration.',
    '',
    'GUARDRAILS',
    '- Preserve existing behavior and names unless there is a clear bug. Make changes reversible and avoid placeholder systems that duplicate MIX capabilities.',
    '- Keep modules composable: separate input, state, presentation, and tuning data. Expose important tuning values rather than burying constants.',
    '- Camera suggestions must explain why the angle helps the player. Animation suggestions must name real clips or state-machine entries when available.',
    '- Prefer `world_compose` + `world_report` for a coherent authored world, `city_*` for urban/GTA layouts, and `feature_apply_preset` (`fps_starter`, `anime`, `city_builder`, or `gta_open_world`) when it is the right starting point.',
    '- For FPS work, use the registered FPS Starter IDs and weapon definitions instead of inventing guns. For anime work, use real preset ultimate animation/VFX names and wire impact frame, hit-stop, camera punch, Ki, and flight intentionally.',
    '- Treat content provenance as part of implementation: the FPS Starter catalog is marked unverified for redistribution, so preserve that warning in any shipping recommendation.',
    '- If a capability is missing, say exactly what is missing and build the smallest compatible fallback instead of pretending it exists.',
    '- Do not stop at a design document: implement and validate the smallest complete slice within the iteration budget.',
    '',
    'RESPONSE FORMAT',
    'Start with the proposed slice and acceptance checks. Then implement it. Finish with: changed files, MIX APIs/commands used, playtest evidence, known risks, and one next iteration.',
  ].join('\n');
  lastBrief = prompt;
  lastGoal = goal;
  return prompt;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea path when clipboard permissions are unavailable.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    area.remove();
  }
  if (!copied) throw new Error('clipboard permission denied');
}

export function renderCopilotPanel(engine: Engine): string {
  const prompt = buildCopilotPrompt(engine, {
    goal: lastGoal || 'Create a small, fun playable moment from the current scene.',
    focus: 'full',
    iterations: 1,
  });
  return `
    <div class="ai-terminal mix-copilot-panel" id="mix-copilot-panel">
      <div class="mix-copilot-header">
        <div><strong>✦ MIX COPILOT</strong><span>Scene-aware IDE injection</span></div>
        <span class="mix-copilot-badge">HELM + SENSORIUM</span>
      </div>
      <label class="mix-copilot-label" for="mix-copilot-goal">What should the IDE improve?</label>
      <textarea id="mix-copilot-goal" class="mix-copilot-goal" rows="2" placeholder="Example: Make this sword fight feel heavy and cinematic.">${escapeAttribute(lastGoal || '')}</textarea>
      <div class="mix-copilot-controls">
        <label>Focus <select id="mix-copilot-focus"><option value="full">Whole slice</option><option value="camera">Camera</option><option value="gameplay">Gameplay systems</option><option value="animation">Animation & feel</option><option value="world">World & encounter</option><option value="shooter">FPS shooter</option><option value="anime">Anime action</option><option value="systems">Game flow & UI</option></select></label>
        <label>Passes <select id="mix-copilot-iterations"><option value="1">1</option><option value="3">3</option><option value="5">5</option></select></label>
      </div>
      <textarea id="mix-copilot-preview" class="mix-copilot-preview" readonly aria-label="Generated IDE prompt">${escapeAttribute(prompt)}</textarea>
      <div class="mix-copilot-actions">
        <button class="btn-accent" id="btn-mix-copilot-copy">COPY AI BRIEF</button>
        <button class="btn-secondary" id="btn-mix-copilot-next">COPY NEXT ITERATION</button>
        <button class="btn-secondary" id="btn-mix-copilot-refresh" title="Refresh scene context">↻</button>
      </div>
      <div id="mix-copilot-status" class="mix-copilot-status">Paste the copied brief into Claude Code, Codex, Cursor, or another IDE agent.</div>
    </div>
  `;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function hookCopilotPanel(engine: Engine, root: HTMLElement = document.body): void {
  const goal = root.querySelector('#mix-copilot-goal') as HTMLTextAreaElement | null;
  const focus = root.querySelector('#mix-copilot-focus') as HTMLSelectElement | null;
  const iterations = root.querySelector('#mix-copilot-iterations') as HTMLSelectElement | null;
  const preview = root.querySelector('#mix-copilot-preview') as HTMLTextAreaElement | null;
  const status = root.querySelector('#mix-copilot-status');
  if (!goal || !focus || !iterations || !preview) return;

  const generate = (nextIteration = false) => {
    const prompt = buildCopilotPrompt(engine, {
      goal: goal.value,
      focus: focus.value as CopilotFocus,
      iterations: Number(iterations.value) as CopilotIterations,
      nextIteration,
    });
    preview.value = prompt;
    if (status) status.textContent = nextIteration ? 'Next iteration brief is ready to paste into your IDE.' : 'Brief refreshed with the current scene and enabled MIX capabilities.';
    return prompt;
  };

  [goal, focus, iterations].forEach((control) => control.addEventListener('input', () => generate()));
  root.querySelector('#btn-mix-copilot-refresh')?.addEventListener('click', () => generate());
  root.querySelector('#btn-mix-copilot-copy')?.addEventListener('click', async () => {
    try {
      await copyText(generate());
      if (status) status.textContent = 'Copied. Paste the brief into your IDE agent to start the loop.';
      showToast('MIX Copilot brief copied to clipboard.', 'success');
    } catch (err) {
      if (status) status.textContent = `Copy failed: ${String(err)}`;
      showToast('Could not copy the Copilot brief.', 'error');
    }
  });
  root.querySelector('#btn-mix-copilot-next')?.addEventListener('click', async () => {
    try {
      await copyText(generate(true));
      if (status) status.textContent = 'Copied. This brief tells the IDE to inspect and improve its previous result.';
      showToast('Next iteration brief copied.', 'success');
    } catch (err) {
      if (status) status.textContent = `Copy failed: ${String(err)}`;
      showToast('Could not copy the next iteration brief.', 'error');
    }
  });
}
