// Custom game logic entry point for GTA project
const npcs = [];
const cops = [];
let npcsSpawned = false;
let vehicleId = null; // Red sports car
let trafficVehicleId = null; // Green traffic car
let activeVehicleId = null; // Currently occupied car
let katanaPickupId = null;
let hasKatana = false;
let katanaEquippedMesh = null;

let bladePickupId = null;
let hasBlade = false;
let bladeEquippedMesh = null;

// Traffic AI states
let trafficDirection = 1;

// Pedestrian AI states
let hanaWanderDir = -1;
let oppWanderDir = 1;

// Wanted Cooldown states
let lastAttackTime = 0;
let cooldownProgressTimer = 0;

// Aura effect mesh reference
let playerAuraMesh = null;
let playerAuraEmitter = null;   // swirling power-up aura column (aura_gold)
let playerChargeStream = null;  // rising energy core at the feet (ki_charge)
let wasCharging = false;        // rising/falling-edge detector for charge SFX

// MIX Animation Retarget Pro proof pack. The importer reads the 40 Unreal FBX
// clips from public/assets/packs/motifect_martial_arts, detects the source rig,
// retargets to Ayo, and applies/wires each character as it enters the scene.
let motifectPackReady = false;
let motifectImportStarted = false;
const motifectWiredEntities = new Set();

const THREE = window.THREE;

/**
 * Spawn a flat, expanding "power-up shockwave" ring at an ENGINE-space position.
 * Self-contained: it animates + disposes itself, so callers fire-and-forget.
 */
function spawnGroundRing(engine, enginePos, colorHex) {
  const geo = new THREE.RingGeometry(0.55, 0.85, 56);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2; // lay it flat on the ground
  ring.position.copy(enginePos);
  ring.frustumCulled = false;
  engine.viewport.scene.add(ring);

  const start = performance.now();
  const DURATION = 650; // ms
  function tick() {
    const t = (performance.now() - start) / DURATION;
    if (t >= 1 || !ring.parent) {
      ring.removeFromParent();
      geo.dispose();
      mat.dispose();
      return;
    }
    const s = 1 + t * 7;        // expand outward
    ring.scale.set(s, s, s);
    mat.opacity = 0.9 * (1 - t); // fade out
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Attach a layered "energy swing" ribbon trail to a swinging object (sword/limb):
 * a wide soft GLOW ribbon + a thin bright CORE ribbon riding the same point read
 * as a glowing anime arc. Auto-stops after `ttlMs`. Returns the two trails.
 */
function spawnEnergySwing(engine, target, localOffset, glowColor, coreColor, lifetime, width, ttlMs) {
  const glow = engine.effects.trail({ color: glowColor, lifetime, width, segments: 20, additive: true });
  const core = engine.effects.trail({ color: coreColor, lifetime: lifetime * 0.85, width: width * 0.38, segments: 20, additive: true });
  glow.attachToObject(target, localOffset);
  core.attachToObject(target, localOffset);
  setTimeout(() => {
    engine.effects.stopTrail(glow);
    engine.effects.stopTrail(core);
  }, ttlMs);
  return [glow, core];
}

export default function initGame(engine) {
  console.log("Welcome to GTA! Initializing custom gameplay logic...");

  // One project-level import proves the same path an IDE agent uses. It is
  // intentionally async and non-blocking so the game can finish booting while
  // FBX files are parsed in the browser.
  if (!motifectImportStarted) {
    motifectImportStarted = true;
    engine.animImporter.importPack({
      packId: 'motifect_martial_arts',
      displayName: 'Motifect Martial Arts',
      sourcePath: '/assets/packs/motifect_martial_arts',
      targetRig: 'ayo',
      keepRootMotion: true,
    }).then((result) => {
      if (!result.ok) {
        console.warn('[Motifect] import failed:', result.error, result.warnings);
        return;
      }
      motifectPackReady = true;
      console.log(`[Motifect] imported ${result.imported} FBX combat clips; auto-wiring characters.`);
      wireMotifectCharacters(engine);
    }).catch((error) => {
      console.error('[Motifect] import threw:', error);
    });
  }

  // Characters are spawned by the GTA game loop after initGame runs, so this
  // hook catches both the initial player/NPCs and any later respawns.
  engine.addUpdateHook(() => wireMotifectCharacters(engine));

  // Preload additional custom animations for cutscenes
  const customCutsceneAnims = [
    'anim_Specials_Magic_Spell_Casting',
    'anim_Specials_Magic_Heal',
    'anim_Attack_Melee_Punch_To_Elbow_Combo',
    'anim_Attack_Melee_Hurricane_Kick',
    'anim_Specials_Casting_Spell',
    'anim_Attack_Melee_Uppercut_Jab',
  ];
  engine.manifest.preload(customCutsceneAnims).catch(console.error);

  // --- Theatrical Intro Cutscene ---
  const triggerTheatricalCutscene = () => {
    const pId = engine.player.getPossessedId() || storedPlayerId;
    if (!pId) return;

    // Register animations on Ayo (Player) dynamically
    const pRb = engine.sceneManager.getRigidBody(pId);
    if (pRb) {
      const pAsm = engine.findAnimationStateMachine(pRb);
      if (pAsm) {
        const hurricaneClips = engine.assetCache.getAnimations('anim_Attack_Melee_Hurricane_Kick');
        if (hurricaneClips.length > 0) pAsm.addAnimation('hurricane_kick', hurricaneClips[0]);

        const spellClips = engine.assetCache.getAnimations('anim_Specials_Casting_Spell');
        if (spellClips.length > 0) pAsm.addAnimation('spell_cast', spellClips[0]);
      }
    }

    const hanaNpc = npcs.find(n => n.name === 'Hana');
    const oppNpc = npcs.find(n => n.name === 'Opp');
    const rayneNpc = npcs.find(n => n.name === 'Rayne');

    const hId = hanaNpc ? hanaNpc.id : null;
    const oId = oppNpc ? oppNpc.id : null;
    const rId = rayneNpc ? rayneNpc.id : null;

    const seq = {
      title: "🤖 MIX AI SYSTEM SHIELD",
      duration: 18.0,
      letterbox: true,
      cameraSequence: {
        shots: [
          // 0s - 4.5s: Establishing crane shot looking at Rayne and the street
          {
            duration: 4.5,
            kind: 'crane',
            path: [[-15, 12, -30], [-5, 8, -25], [0, 4.5, -20]],
            craneHeightDelta: -4.0,
            lookAt: [0, 1.5, -45],
            fovStart: 70,
            fovEnd: 45,
            ease: 'easeInOut'
          },
          // 4.5s - 8.5s: Orbit Ayo close-up
          {
            duration: 4.0,
            kind: 'orbit',
            orbitTargetEntity: pId,
            orbitRadius: 4.5,
            orbitHeight: 1.2,
            orbitAngleStart: 0,
            orbitAngleEnd: Math.PI / 2,
            lookAtEntity: pId,
            ease: 'easeOut'
          },
          // 8.5s - 12.5s: Dolly focusing on Rayne
          {
            duration: 4.0,
            kind: 'dolly',
            path: [[0, 2.5, -35], [2, 1.8, -40], [0, 1.2, -42]],
            lookAtEntity: rId,
            fovStart: 45,
            fovEnd: 30,
            ease: 'easeInOut'
          },
          // 12.5s - 15.5s: Close-up static orbit on Rayne's charging spell
          {
            duration: 3.0,
            kind: 'orbit',
            orbitTargetEntity: rId,
            orbitRadius: 3.0,
            orbitHeight: 1.0,
            orbitAngleStart: Math.PI / 4,
            orbitAngleEnd: Math.PI / 2 + Math.PI / 4,
            lookAtEntity: rId,
            ease: 'linear'
          },
          // 15.5s - 18s: Orbit Ayo charging aura
          {
            duration: 2.5,
            kind: 'orbit',
            orbitTargetEntity: pId,
            orbitRadius: 3.5,
            orbitHeight: 0.8,
            orbitAngleStart: -Math.PI / 4,
            orbitAngleEnd: 0,
            lookAtEntity: pId,
            ease: 'easeOut'
          }
        ]
      },
      events: [
        // 0.0s: System sub and postFX setup
        {
          time: 0.0,
          command: {
            type: 'cutscene_subtitle',
            text: "MIX Engine: Initializing AI Bridge & Systems...",
            speaker: "SYSTEM",
            duration: 3.0
          }
        },
        {
          time: 0.1,
          command: {
            type: 'set_weather_preset',
            kind: 'haze',
            intensity: 0.5
          }
        },
        {
          time: 0.2,
          command: {
            type: 'set_time_of_day',
            hour: 18.0
          }
        },
        {
          time: 0.3,
          command: {
            type: 'set_post_fx',
            bloom: true,
            bloomStrength: 0.6,
            vignette: true,
            vignetteIntensity: 0.5,
            filmGrain: true,
            filmGrainAmount: 0.05
          }
        },
        // 1.0s: Music track starts
        {
          time: 1.0,
          command: {
            type: 'play_sound',
            src: 'assets/audio/main menu music/Crystal Pause.wav',
            volume: 0.8,
            loop: true
          }
        },
        // 1.5s: AI NavMesh build trigger! Shows walkable debug areas!
        {
          time: 1.5,
          command: {
            type: 'navmesh_build',
            centerX: 0,
            centerZ: 0,
            size: 120,
            cellSize: 0.25
          }
        },
        {
          time: 1.6,
          command: {
            type: 'nav_debug',
            enabled: true
          }
        },
        // 3.0s: NPCs moving along path routes (AI Steering pathfinding)
        {
          time: 3.0,
          command: {
            type: 'cutscene_subtitle',
            text: "[SYSTEM] NavMesh compiled. Directing autonomous pathfinders to coordinates...",
            speaker: "SYSTEM",
            duration: 3.5
          }
        },
        {
          time: 3.5,
          command: {
            type: 'follow_path',
            entityId: hId,
            points: [[11, 0.2, -20], [6, 0.2, -15], [3, 0.2, -25]],
            speed: 3.2,
            lookAlongPath: true
          }
        },
        {
          time: 3.5,
          command: {
            type: 'follow_path',
            entityId: oId,
            points: [[-11, 0.2, 20], [-6, 0.2, 10], [-3, 0.2, 15]],
            speed: 3.2,
            lookAlongPath: true
          }
        },
        {
          time: 3.6,
          command: {
            type: 'play_animation',
            entityId: hId,
            state: 'walk'
          }
        },
        {
          time: 3.6,
          command: {
            type: 'play_animation',
            entityId: oId,
            state: 'walk'
          }
        },
        // 5.0s: Ayo speaks
        {
          time: 5.0,
          command: {
            type: 'cutscene_subtitle',
            text: "Ayo: Opp... Hana... What is happening to the neighborhood grid?",
            speaker: "Ayo",
            duration: 2.2
          }
        },
        {
          time: 5.1,
          command: {
            type: 'play_animation',
            entityId: pId,
            state: 'idle'
          }
        },
        // 5.3s: Opp and Hana perform attack animations!
        {
          time: 5.3,
          command: {
            type: 'play_animation',
            entityId: oId,
            state: 'mma_kick'
          }
        },
        {
          time: 5.3,
          command: {
            type: 'play_animation',
            entityId: hId,
            state: 'uppercut'
          }
        },
        // 5.4s: Ayo performs backflip to dodge them!
        {
          time: 5.4,
          command: {
            type: 'play_animation',
            entityId: pId,
            state: 'backflip'
          }
        },
        {
          time: 6.4,
          command: {
            type: 'play_animation',
            entityId: hId,
            state: 'idle'
          }
        },
        {
          time: 6.4,
          command: {
            type: 'play_animation',
            entityId: oId,
            state: 'idle'
          }
        },
        {
          time: 6.5,
          command: {
            type: 'play_animation',
            entityId: pId,
            state: 'idle'
          }
        },
        // 7.2s: Rayne confront
        {
          time: 7.2,
          command: {
            type: 'cutscene_subtitle',
            text: "Rayne: The engine's AI has taken command, Ayo. The world compiles around us!",
            speaker: "Rayne",
            duration: 3.5
          }
        },
        {
          time: 7.5,
          command: {
            type: 'play_animation',
            entityId: rId,
            state: 'magic_cast'
          }
        },
        {
          time: 7.6,
          command: {
            type: 'set_weather_preset',
            kind: 'rain',
            intensity: 0.8
          }
        },
        {
          time: 7.7,
          command: {
            type: 'set_post_fx',
            godRays: true,
            godRaysStrength: 0.5,
            dof: true,
            dofAutoFocus: true
          }
        },
        // 8.5s: Spawning VFX on Rayne
        {
          time: 8.5,
          command: {
            type: 'spawn_vfx',
            preset: 'ki_charge',
            x: 0,
            y: 0.2,
            z: -45,
            loop: true
          }
        },
        // 11.0s: Rayne cast punch combo / flash / shake
        {
          time: 11.0,
          command: {
            type: 'cutscene_subtitle',
            text: "Rayne: Witness the final compiler optimization!",
            speaker: "Rayne",
            duration: 2.5
          }
        },
        {
          time: 11.2,
          command: {
            type: 'play_animation',
            entityId: rId,
            state: 'punch_combo'
          }
        },
        {
          time: 11.3,
          command: {
            type: 'play_sound',
            src: 'assets/audio/CHARGING/DROIDSOUNDINGONE.wav',
            volume: 1.0
          }
        },
        // 12.0s: Flash, shake, time jump, black night preset
        {
          time: 12.0,
          command: {
            type: 'screen_flash',
            color: '#ffffff',
            intensity: 1.0,
            duration: 0.6
          }
        },
        {
          time: 12.1,
          command: {
            type: 'camera_shake',
            trauma: 0.8,
            duration: 1.2
          }
        },
        {
          time: 12.2,
          command: {
            type: 'burst_vfx',
            preset: 'ki_blast',
            x: 0,
            y: 1.0,
            z: -45,
            count: 15
          }
        },
        {
          time: 12.3,
          command: {
            type: 'set_time_of_day',
            hour: 22.0
          }
        },
        {
          time: 12.4,
          command: {
            type: 'set_sky_environment',
            elevationDeg: 0,
            azimuthDeg: 0,
            fogColor: '#0b0e14',
            fogDensity: 0.035
          }
        },
        // 13.5s: Ayo challenges back
        {
          time: 13.5,
          command: {
            type: 'cutscene_subtitle',
            text: "Ayo: I won't let you overwrite this scene, Rayne! Let's settle this!",
            speaker: "Ayo",
            duration: 2.8
          }
        },
        {
          time: 13.8,
          command: {
            type: 'play_animation',
            entityId: pId,
            state: 'spell_cast'
          }
        },
        {
          time: 13.9,
          command: {
            type: 'spawn_vfx',
            preset: 'ki_charge',
            x: 0,
            y: 0.2,
            z: 0,
            loop: true
          }
        },
        {
          time: 14.0,
          command: {
            type: 'play_sound',
            src: 'assets/audio/CHARGING/chargig eff (Synth).mp3',
            volume: 1.0
          }
        },
        // 15.0s: Ayo power hurricane kick flash
        {
          time: 15.0,
          command: {
            type: 'play_animation',
            entityId: pId,
            state: 'hurricane_kick'
          }
        },
        {
          time: 15.5,
          command: {
            type: 'screen_flash',
            color: '#00f0ff',
            intensity: 0.9,
            duration: 0.5
          }
        },
        {
          time: 15.6,
          command: {
            type: 'camera_shake',
            trauma: 0.7,
            duration: 1.0
          }
        },
        {
          time: 15.7,
          command: {
            type: 'burst_vfx',
            preset: 'ki_blast',
            x: 0,
            y: 1.0,
            z: 0,
            count: 12
          }
        },
        // 16.5s: Final message and cleanups
        {
          time: 16.5,
          command: {
            type: 'cutscene_subtitle',
            text: "[SYSTEM] AI Bridge sync complete. Restoring camera control.",
            speaker: "SYSTEM",
            duration: 2.5
          }
        },
        {
          time: 17.5,
          command: {
            type: 'nav_debug',
            enabled: false
          }
        },
        {
          time: 17.6,
          command: {
            type: 'stop_music',
            fadeOut: 1.5
          }
        }
      ]
    };

    engine.aiBridge.execute({
      type: 'cutscene_play',
      sequence: seq
    });

    setTimeout(() => {
      engine.player.possess(pId);
    }, 18500);
  };

  const onPlayIntro = () => triggerTheatricalCutscene();
  const onSkipIntro = () => {
    const possessedId = engine.player.getPossessedId() || storedPlayerId;
    if (possessedId) engine.player.possess(possessedId);
  };

  const unsubPlay = engine.sceneManager.events.on('gta:play_intro', onPlayIntro);
  const unsubSkip = engine.sceneManager.events.on('gta:skip_intro', onSkipIntro);

  // --- 1. HUD & Game Over Screen Setup ---
  const viewportOverlayRoot = document.getElementById('viewport-wrapper') || document.body;
  let hudContainer = document.getElementById('gta-hud-container');
  if (!hudContainer) {
    hudContainer = document.createElement('div');
    hudContainer.id = 'gta-hud-container';
    hudContainer.style.cssText = `
      position: absolute;
      top: 24px;
      right: 24px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      text-align: right;
      z-index: 120;
      pointer-events: none;
      filter: drop-shadow(2px 2px 0px #000);
    `;
    viewportOverlayRoot.appendChild(hudContainer);
  }

  let healthArmorContainer = document.getElementById('gta-health-armor-container');
  if (!healthArmorContainer) {
    healthArmorContainer = document.createElement('div');
    healthArmorContainer.id = 'gta-health-armor-container';
    healthArmorContainer.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 24px;
      width: 220px;
      background: rgba(6, 8, 10, 0.85);
      border: 1.5px solid rgba(255, 255, 255, 0.1);
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      z-index: 120;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      pointer-events: none;
    `;
    viewportOverlayRoot.appendChild(healthArmorContainer);
  }

  let gameOverOverlay = document.getElementById('gta-game-over-overlay');
  if (!gameOverOverlay) {
    gameOverOverlay = document.createElement('div');
    gameOverOverlay.id = 'gta-game-over-overlay';
    gameOverOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 140;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: bold;
      pointer-events: none;
      transition: background 1.5s ease-out;
    `;
    viewportOverlayRoot.appendChild(gameOverOverlay);
  }

  let interactionOverlay = document.getElementById('gta-interaction-prompt');
  if (!interactionOverlay) {
    interactionOverlay = document.createElement('div');
    interactionOverlay.id = 'gta-interaction-prompt';
    interactionOverlay.style.cssText = `
      position: absolute;
      bottom: 18%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(6, 8, 10, 0.85);
      backdrop-filter: blur(10px);
      border: 2px solid #00f0ff;
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
      color: #fff;
      padding: 12px 24px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      border-radius: 8px;
      display: none;
      pointer-events: none;
      z-index: 130;
      text-align: center;
      letter-spacing: 1px;
    `;
    viewportOverlayRoot.appendChild(interactionOverlay);
  }

  // ─── Settings defaults + localStorage persistence ──────────────────────
  const SETTINGS_KEY = 'gta_settings';
  const DEFAULTS = {
    sens:1, invertY:false, camDist:5,
    exposure:0.6, bloom:true, bloomStr:0.6, godRays:false, dof:false,
    outline:false, vignette:false, ca:false, grain:false,
    speed:1, masterVol:1, musicVol:0.5, sfxVol:1,
  };
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch(e) { /* corrupt — fall through to defaults */ }
    return { ...DEFAULTS };
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch(e) {}
  }

  // ─── Apply a settings blob to the engine (used on init + reset) ────────
  function applySettingsToEngine(engine, s) {
    if (engine.player) {
      engine.player.mouseSensitivity = s.sens * 0.0025;
      engine.player.invertY = s.invertY;
      engine.player.cameraDistance = s.camDist;
      engine.player.speedMultiplier = s.speed;
    }
    if (engine.viewport?.renderer) {
      engine.viewport.renderer.toneMappingExposure = s.exposure;
    }
    const p = engine.viewport?.pipeline;
    if (p?.bloomPass) { p.bloomPass.enabled = s.bloom; p.bloomPass.strength = s.bloomStr; }
    if (p?.godRaysPass) p.godRaysPass.enabled = s.godRays;
    if (p?.dofPass) p.dofPass.enabled = s.dof;
    if (p?.outlinePass) p.outlinePass.enabled = s.outline;
    if (p?.vignettePass) p.vignettePass.enabled = s.vignette;
    if (p?.chromaticAberrationPass) p.chromaticAberrationPass.enabled = s.ca;
    if (p?.filmGrainPass) p.filmGrainPass.enabled = s.grain;
    if (engine.audio) {
      engine.audio.setMasterVolume(s.masterVol);
      engine.audio.setBusVolume('music', s.musicVol);
      engine.audio.setBusVolume('sfx', s.sfxVol);
    }
  }

  // ─── In-Game Settings Panel ────────────────────────────────────────────
  let settingsOverlay;
  let settingsOpen = false;
  let settingsState = loadSettings();

  // Apply saved settings to the engine on boot
  applySettingsToEngine(engine, settingsState);

  {
    const s = document.createElement('div');
    s.id = 'gta-settings-overlay';
    s.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(4,5,7,0.88);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;z-index:10000;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';
    s.innerHTML = `
      <div style="background:#0d1115;border:1px solid rgba(255,255,255,0.06);border-radius:8px;width:560px;max-width:92%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 20px rgba(0,240,255,0.08);transition:border-color 0.2s;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:10px;">
          <span style="font-size:13px;font-weight:bold;color:#cdd6e0;letter-spacing:1px;">▲ SETTINGS</span>
          <span style="font-size:10px;color:#6e7d8d;">ESC to close</span>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:12px;">
          <button class="gta-stab" data-tab="controls">CONTROLS</button>
          <button class="gta-stab" data-tab="audio">AUDIO</button>
          <button class="gta-stab" data-tab="visuals">VISUALS</button>
          <button class="gta-stab" data-tab="game">GAME</button>
        </div>
        <div class="gta-spanels" style="min-height:220px;">
          <!-- ── Controls ── -->
          <div class="gta-spanel" data-panel="controls">
            <div style="margin-bottom:10px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">Mouse Sensitivity <span class="gta-val" id="lbl-sens">${settingsState.sens.toFixed(2)}</span></label>
              <input type="range" class="gta-sldr" id="sld-sens" min="0.25" max="3" step="0.05" value="${settingsState.sens}">
            </div>
            <div class="gta-togrow">
              <span style="color:#8b98a8;">Invert Y</span>
              <button class="gta-tog" id="tog-inv" data-on="${settingsState.invertY}">${settingsState.invertY?'ON':'OFF'}</button>
            </div>
            <div style="margin-bottom:10px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">Camera Distance <span class="gta-val" id="lbl-camd">${settingsState.camDist.toFixed(1)}</span></label>
              <input type="range" class="gta-sldr" id="sld-camd" min="2" max="15" step="0.5" value="${settingsState.camDist}">
            </div>
          </div>
          <!-- ── Audio ── -->
          <div class="gta-spanel" data-panel="audio" style="display:none;">
            <div style="margin-bottom:10px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">Master Volume <span class="gta-val" id="lbl-mvol">${Math.round(settingsState.masterVol*100)}%</span></label>
              <input type="range" class="gta-sldr" id="sld-mvol" min="0" max="1" step="0.05" value="${settingsState.masterVol}">
            </div>
            <div style="margin-bottom:10px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">Music Volume <span class="gta-val" id="lbl-musvol">${Math.round(settingsState.musicVol*100)}%</span></label>
              <input type="range" class="gta-sldr" id="sld-musvol" min="0" max="1" step="0.05" value="${settingsState.musicVol}">
            </div>
            <div style="margin-bottom:10px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">SFX Volume <span class="gta-val" id="lbl-sfxvol">${Math.round(settingsState.sfxVol*100)}%</span></label>
              <input type="range" class="gta-sldr" id="sld-sfxvol" min="0" max="1" step="0.05" value="${settingsState.sfxVol}">
            </div>
          </div>
          <!-- ── Visuals ── -->
          <div class="gta-spanel" data-panel="visuals" style="display:none;">
            <div style="margin-bottom:8px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">Exposure <span class="gta-val" id="lbl-exp">${settingsState.exposure.toFixed(2)}</span></label>
              <input type="range" class="gta-sldr" id="sld-exp" min="0.2" max="2" step="0.05" value="${settingsState.exposure}">
            </div>
            <div class="gta-togrow">
              <span>Bloom</span>
              <button class="gta-tog" id="tog-bloom" data-on="${settingsState.bloom}">${settingsState.bloom?'ON':'OFF'}</button>
              <span style="margin-left:auto;color:#6e7d8d;font-size:10px;">Strength <span class="gta-val" id="lbl-bstr">${settingsState.bloomStr.toFixed(2)}</span></span>
              <input type="range" class="gta-sldr" id="sld-bstr" min="0" max="2" step="0.05" value="${settingsState.bloomStr}" style="width:80px;">
            </div>
            <div class="gta-togrow">
              <span>God Rays</span><button class="gta-tog" id="tog-gr" data-on="${settingsState.godRays}">${settingsState.godRays?'ON':'OFF'}</button>
              <span style="margin-left:20px;">Dof</span><button class="gta-tog" id="tog-dof" data-on="${settingsState.dof}">${settingsState.dof?'ON':'OFF'}</button>
            </div>
            <div class="gta-togrow">
              <span>Outline</span><button class="gta-tog" id="tog-ol" data-on="${settingsState.outline}">${settingsState.outline?'ON':'OFF'}</button>
              <span style="margin-left:20px;">Vignette</span><button class="gta-tog" id="tog-vig" data-on="${settingsState.vignette}">${settingsState.vignette?'ON':'OFF'}</button>
            </div>
            <div class="gta-togrow" style="border-bottom:none;">
              <span>Chromatic Aberr.</span><button class="gta-tog" id="tog-ca" data-on="${settingsState.ca}">${settingsState.ca?'ON':'OFF'}</button>
              <span style="margin-left:20px;">Film Grain</span><button class="gta-tog" id="tog-grain" data-on="${settingsState.grain}">${settingsState.grain?'ON':'OFF'}</button>
            </div>
          </div>
          <!-- ── Game ── -->
          <div class="gta-spanel" data-panel="game" style="display:none;">
            <div style="margin-bottom:10px;font-size:11px;">
              <label style="display:block;color:#8b98a8;margin-bottom:4px;">Speed Multiplier <span class="gta-val" id="lbl-spd">${settingsState.speed.toFixed(1)}</span></label>
              <input type="range" class="gta-sldr" id="sld-spd" min="0.25" max="5" step="0.1" value="${settingsState.speed}">
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;margin-top:14px;">
          <button id="btn-reset" style="background:transparent;border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:10px;transition:background 0.15s;">RESET DEFAULTS</button>
          <div style="display:flex;gap:8px;">
            <button id="btn-close" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#8b98a8;padding:6px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;transition:all 0.15s;">CLOSE</button>
            <button id="btn-resume" style="background:rgba(0,240,255,0.1);border:1px solid rgba(0,240,255,0.3);color:#00f0ff;padding:6px 18px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:bold;transition:all 0.15s;">RESUME</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(s);
    settingsOverlay = s;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────
  function setToggle(el, on) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.dataset.on = String(on);
    el.textContent = on ? 'ON' : 'OFF';
    el.style.borderColor = on ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)';
    el.style.background = on ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)';
    el.style.color = on ? '#22c55e' : '#6e7d8d';
  }

  // ─── Event wiring ──────────────────────────────────────────────────────
  function onSettingChange() {
    const s = settingsState;
    // Controls
    engine.player.mouseSensitivity = s.sens * 0.0025;
    engine.player.invertY = s.invertY;
    engine.player.cameraDistance = s.camDist;
    engine.player.speedMultiplier = s.speed;
    // Visuals
    if (engine.viewport?.renderer) engine.viewport.renderer.toneMappingExposure = s.exposure;
    const p = engine.viewport?.pipeline;
    if (p?.bloomPass) { p.bloomPass.enabled = s.bloom; p.bloomPass.strength = s.bloomStr; }
    if (p?.godRaysPass) p.godRaysPass.enabled = s.godRays;
    if (p?.dofPass) p.dofPass.enabled = s.dof;
    if (p?.outlinePass) p.outlinePass.enabled = s.outline;
    if (p?.vignettePass) p.vignettePass.enabled = s.vignette;
    if (p?.chromaticAberrationPass) p.chromaticAberrationPass.enabled = s.ca;
    if (p?.filmGrainPass) p.filmGrainPass.enabled = s.grain;
    // Audio
    if (engine.audio) {
      engine.audio.setMasterVolume(s.masterVol);
      engine.audio.setBusVolume('music', s.musicVol);
      engine.audio.setBusVolume('sfx', s.sfxVol);
    }
    saveSettings(s);
  }

  function readSlider(id) { return parseFloat(document.getElementById(id).value); }
  function setLabel(id, v, fmt) { const e = document.getElementById(id); if(e) e.textContent = typeof fmt==='function'?fmt(v):v.toFixed(fmt); }

  // --- Controls ---
  document.getElementById('sld-sens').addEventListener('input', function() {
    settingsState.sens = parseFloat(this.value);
    setLabel('lbl-sens', settingsState.sens, 2);
    onSettingChange();
  });
  document.getElementById('tog-inv').addEventListener('click', function() {
    settingsState.invertY = this.dataset.on !== 'true';
    setToggle(this, settingsState.invertY);
    onSettingChange();
  });
  document.getElementById('sld-camd').addEventListener('input', function() {
    settingsState.camDist = parseFloat(this.value);
    setLabel('lbl-camd', settingsState.camDist, 1);
    onSettingChange();
  });
  // --- Audio ---
  document.getElementById('sld-mvol').addEventListener('input', function() {
    settingsState.masterVol = parseFloat(this.value);
    setLabel('lbl-mvol', Math.round(settingsState.masterVol * 100), v=>v+'%');
    onSettingChange();
  });
  document.getElementById('sld-musvol').addEventListener('input', function() {
    settingsState.musicVol = parseFloat(this.value);
    setLabel('lbl-musvol', Math.round(settingsState.musicVol * 100), v=>v+'%');
    onSettingChange();
  });
  document.getElementById('sld-sfxvol').addEventListener('input', function() {
    settingsState.sfxVol = parseFloat(this.value);
    setLabel('lbl-sfxvol', Math.round(settingsState.sfxVol * 100), v=>v+'%');
    onSettingChange();
  });
  // --- Visuals ---
  document.getElementById('sld-exp').addEventListener('input', function() {
    settingsState.exposure = parseFloat(this.value);
    setLabel('lbl-exp', settingsState.exposure, 2);
    onSettingChange();
  });
  document.getElementById('tog-bloom').addEventListener('click', function() {
    settingsState.bloom = this.dataset.on !== 'true';
    setToggle(this, settingsState.bloom);
    onSettingChange();
  });
  document.getElementById('sld-bstr').addEventListener('input', function() {
    settingsState.bloomStr = parseFloat(this.value);
    setLabel('lbl-bstr', settingsState.bloomStr, 2);
    onSettingChange();
  });
  ['tog-gr','tog-dof','tog-ol','tog-vig','tog-ca','tog-grain'].forEach(id => {
    const key = { 'tog-gr':'godRays','tog-dof':'dof','tog-ol':'outline','tog-vig':'vignette','tog-ca':'ca','tog-grain':'grain' }[id];
    document.getElementById(id).addEventListener('click', function() {
      settingsState[key] = this.dataset.on !== 'true';
      setToggle(this, settingsState[key]);
      onSettingChange();
    });
  });
  // --- Game ---
  document.getElementById('sld-spd').addEventListener('input', function() {
    settingsState.speed = parseFloat(this.value);
    setLabel('lbl-spd', settingsState.speed, 1);
    onSettingChange();
  });

  // ─── Tab switching ─────────────────────────────────────────────────────
  document.querySelectorAll('.gta-stab').forEach(btn => {
    btn.addEventListener('click', function() {
      const tab = this.dataset.tab;
      document.querySelectorAll('.gta-stab').forEach(b => {
        b.style.background = 'rgba(255,255,255,0.02)';
        b.style.borderColor = 'rgba(255,255,255,0.06)';
        b.style.color = '#6e7d8d';
      });
      this.style.background = 'rgba(0,240,255,0.07)';
      this.style.borderColor = 'rgba(0,240,255,0.2)';
      this.style.color = '#00f0ff';
      document.querySelectorAll('.gta-spanel').forEach(p => p.style.display = 'none');
      const panel = document.querySelector('.gta-spanel[data-panel="'+tab+'"]');
      if (panel) panel.style.display = '';
    });
  });

  // ─── Close / open / toggle ─────────────────────────────────────────────
  function closeSettings() {
    if (!settingsOpen) return;
    settingsOpen = false;
    settingsOverlay.style.display = 'none';
    engine.time.setTimeScale(1);
    engine.input.resetInput();            // clear any held keys from menu interaction
    const c = document.querySelector('canvas');
    if (c) c.requestPointerLock();
  }
  function openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    syncSettingsUI();
    settingsOverlay.style.display = 'flex';
    engine.time.setTimeScale(0);
    engine.input.resetInput();            // clear held keys so they don't buffer
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function toggleSettings() {
    if (settingsOpen) { closeSettings(); } else { openSettings(); }
  }

  // ─── Sync UI from engine state (when menu opens) ───────────────────────
  function syncSettingsUI() {
    // Re-read settingsState from engine (accounts for e.g. AIBridge changes)
    const p = engine.viewport?.pipeline;
    if (engine.player) {
      settingsState.sens    = engine.player.mouseSensitivity / 0.0025;
      settingsState.invertY = engine.player.invertY;
      settingsState.camDist = engine.player.cameraDistance;
      settingsState.speed   = engine.player.speedMultiplier;
    }
    settingsState.exposure  = engine.viewport?.renderer?.toneMappingExposure ?? 0.6;
    settingsState.bloom     = p?.bloomPass?.enabled !== false;
    settingsState.bloomStr  = p?.bloomPass?.strength ?? 0.6;
    settingsState.godRays   = !!p?.godRaysPass?.enabled;
    settingsState.dof       = !!p?.dofPass?.enabled;
    settingsState.outline   = !!p?.outlinePass?.enabled;
    settingsState.vignette  = !!p?.vignettePass?.enabled;
    settingsState.ca        = !!p?.chromaticAberrationPass?.enabled;
    settingsState.grain     = !!p?.filmGrainPass?.enabled;
    if (engine.audio) {
      settingsState.masterVol = engine.audio.getMasterVolume();
      settingsState.musicVol  = engine.audio.getBusVolume('music');
      settingsState.sfxVol    = engine.audio.getBusVolume('sfx');
    }
    // Push state back into DOM
    document.getElementById('sld-sens').value    = settingsState.sens;
    setLabel('lbl-sens', settingsState.sens, 2);
    setToggle('tog-inv', settingsState.invertY);
    document.getElementById('sld-camd').value    = settingsState.camDist;
    setLabel('lbl-camd', settingsState.camDist, 1);
    document.getElementById('sld-exp').value     = settingsState.exposure;
    setLabel('lbl-exp', settingsState.exposure, 2);
    setToggle('tog-bloom', settingsState.bloom);
    document.getElementById('sld-bstr').value     = settingsState.bloomStr;
    setLabel('lbl-bstr', settingsState.bloomStr, 2);
    setToggle('tog-gr', settingsState.godRays);
    setToggle('tog-dof', settingsState.dof);
    setToggle('tog-ol', settingsState.outline);
    setToggle('tog-vig', settingsState.vignette);
    setToggle('tog-ca', settingsState.ca);
    setToggle('tog-grain', settingsState.grain);
    document.getElementById('sld-spd').value      = settingsState.speed;
    setLabel('lbl-spd', settingsState.speed, 1);
    document.getElementById('sld-mvol').value   = settingsState.masterVol;
    setLabel('lbl-mvol', Math.round(settingsState.masterVol*100), v=>v+'%');
    document.getElementById('sld-musvol').value = settingsState.musicVol;
    setLabel('lbl-musvol', Math.round(settingsState.musicVol*100), v=>v+'%');
    document.getElementById('sld-sfxvol').value = settingsState.sfxVol;
    setLabel('lbl-sfxvol', Math.round(settingsState.sfxVol*100), v=>v+'%');
    saveSettings(settingsState);
  }

  // ─── Close buttons + Reset ─────────────────────────────────────────────
  document.getElementById('btn-close').addEventListener('click', closeSettings);
  document.getElementById('btn-resume').addEventListener('click', closeSettings);
  document.getElementById('btn-reset').addEventListener('click', function() {
    settingsState = { ...DEFAULTS };
    applySettingsToEngine(engine, settingsState);
    syncSettingsUI();
    saveSettings(settingsState);
  });

  // ─── Direct keydown listener for Escape (more reliable than InputManager
  //      frame-cycle — no frame of delay, works while pointer is locked). ──
  const escapeHandler = (e) => {
    if (e.code === 'Escape' && engine.input.mode === 'play' && !inDialogue) {
      // Always swallow Escape in play mode so the engine's solo-viewport handler
      // and editor-mode handlers don't fight with the pause menu.
      e.preventDefault();
      e.stopPropagation();
      if (settingsOpen) closeSettings();
      else openSettings();
    }
  };
  window.addEventListener('keydown', escapeHandler, true);   // capture phase so we
                                                              // intercept before editor

  // ─── Stylesheet ────────────────────────────────────────────────────────
  {
    const sheet = document.createElement('style');
    sheet.textContent = `
      /* Range slider */
      .gta-sldr { -webkit-appearance:none; appearance:none; height:4px; border-radius:2px; background:rgba(255,255,255,0.08); outline:none; cursor:pointer; }
      .gta-sldr::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:14px; border-radius:50%; background:#00f0ff; cursor:pointer; border:2px solid #0d1115; transition:box-shadow 0.15s; }
      .gta-sldr::-webkit-slider-thumb:hover { box-shadow:0 0 8px rgba(0,240,255,0.5); }
      .gta-sldr::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:#00f0ff; cursor:pointer; border:2px solid #0d1115; }
      /* Tab buttons */
      .gta-stab { flex:1; padding:6px 0; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px; letter-spacing:1px; transition:all 0.15s; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); color:#6e7d8d; }
      .gta-stab:hover { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.12); color:#8b98a8; }
      /* Toggle row */
      .gta-togrow { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.04); font-size:11px; color:#8b98a8; }
      /* Toggle button */
      .gta-tog { width:58px; padding:4px 0; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px; transition:all 0.15s; }
      .gta-tog:hover { filter:brightness(1.3); }
      /* Value label */
      .gta-val { color:#cdd6e0; }
      /* Footer buttons */
      #btn-resume:hover { background:rgba(0,240,255,0.2); box-shadow:0 0 10px rgba(0,240,255,0.15); }
      #btn-close:hover { background:rgba(255,255,255,0.08); color:#cdd6e0; }
      #btn-reset:hover { background:rgba(239,68,68,0.08); }
    `;
    document.head.appendChild(sheet);
  }

  // --- 2. State Variables ---
  let playerHealth = 100;
  let playerArmor = 50;
  let playerCash = 1337;
  let wantedLevel = 0;
  let isDead = false;
  let isBusted = false;
  
  let activeNpc = null;
  let inDialogue = false;
  let isDriving = false;
  let exitCooldown = 0;
  let attackCooldown = 0;
  let copSpawnCooldown = 0;
  let playerAttackCooldown = 0;
  let storedPlayerId = null;

  // Cleanup on HMR/reload
  if (window.__gta_cleanup) {
    window.__gta_cleanup();
  }

  // --- 3. HUD Renderer ---
  function updateHud() {
    if (!hudContainer || !healthArmorContainer) return;

    // Format Money e.g. $00001337
    const cashStr = '$' + String(playerCash).padStart(8, '0');

    // Wanted Level Stars with flashing support during cooldown escape
    let starsStr = '';
    const isFlashing = wantedLevel > 0 && ((Date.now() - lastAttackTime) / 1000 > 8.0) && (Math.floor(Date.now() / 450) % 2 === 0);
    if (!isFlashing) {
      for (let i = 0; i < wantedLevel; i++) {
        starsStr += '⭐ ';
      }
    }

    hudContainer.innerHTML = `
      <div style="color: #2ecc71; font-size: 36px; font-weight: 900; text-shadow: 2px 2px 0px #000; letter-spacing: 1px;">${cashStr}</div>
      <div style="font-size: 24px; margin-top: 6px; height: 30px;">${starsStr}</div>
    `;

    // Health/Armor Bars
    healthArmorContainer.innerHTML = `
      <div style="color: #95a5a6; font-size: 9px; font-weight: bold; margin-bottom: 4px; letter-spacing: 1px;">HEALTH</div>
      <div style="width: 100%; height: 10px; background: rgba(231, 76, 60, 0.2); border: 1px solid rgba(231, 76, 60, 0.4); border-radius: 4px; overflow: hidden; margin-bottom: 10px;">
        <div style="width: ${Math.max(0, playerHealth)}%; height: 100%; background: #e74c3c; transition: width 0.1s;"></div>
      </div>
      <div style="color: #95a5a6; font-size: 9px; font-weight: bold; margin-bottom: 4px; letter-spacing: 1px;">ARMOR</div>
      <div style="width: 100%; height: 10px; background: rgba(52, 152, 219, 0.2); border: 1px solid rgba(52, 152, 219, 0.4); border-radius: 4px; overflow: hidden;">
        <div style="width: ${Math.max(0, playerArmor)}%; height: 100%; background: #3498db; transition: width 0.1s;"></div>
      </div>
    `;
  }

  // Initial HUD Draw
  updateHud();
  const syncHudVisibility = (mode) => {
    const visible = mode === 'play';
    hudContainer.style.display = visible ? '' : 'none';
    healthArmorContainer.style.display = visible ? '' : 'none';
    if (!visible) interactionOverlay.style.display = 'none';
  };
  const unsubModeHud = engine.input.on('modechange', syncHudVisibility);
  syncHudVisibility(engine.input.mode);

  // --- 4. Game Over Handling (Wasted / Busted) ---
  function triggerWasted() {
    if (isDead || isBusted) return;
    isDead = true;
    engine.player.possess(null);

    // Play Ayo die animation
    const playerRb = engine.sceneManager.getRigidBody(storedPlayerId);
    if (playerRb) {
      const asm = engine.findAnimationStateMachine(playerRb);
      if (asm) asm.transition('die', 0.1);
    }

    // Apply grayscale + blur to the viewport wrapper
    const viewportEl = document.getElementById('viewport-wrapper');
    if (viewportEl) {
      viewportEl.style.transition = 'filter 1.5s ease-out';
      viewportEl.style.filter = 'grayscale(100%) blur(4px)';
    }

    // Show Wasted screen
    gameOverOverlay.style.background = 'rgba(6, 8, 10, 0.7)';
    gameOverOverlay.innerHTML = `<div id="wasted-txt" style="color: #e74c3c; font-size: 80px; text-shadow: 4px 4px 0px #000; letter-spacing: 12px; transform: scale(0.85); transition: transform 3.5s ease-out; font-style: italic; font-weight: 900;">WASTED</div>`;
    gameOverOverlay.style.display = 'flex';

    setTimeout(() => {
      const txt = document.getElementById('wasted-txt');
      if (txt) txt.style.transform = 'scale(1.1)';
    }, 50);

    setTimeout(respawnPlayer, 4000);
  }

  function triggerBusted() {
    if (isDead || isBusted) return;
    isBusted = true;
    engine.player.possess(null);

    // Apply grayscale + blur to viewport
    const viewportEl = document.getElementById('viewport-wrapper');
    if (viewportEl) {
      viewportEl.style.transition = 'filter 1.5s ease-out';
      viewportEl.style.filter = 'grayscale(60%) blur(4px)';
    }

    // Show Busted screen
    gameOverOverlay.style.background = 'rgba(6, 8, 10, 0.7)';
    gameOverOverlay.innerHTML = `<div id="busted-txt" style="color: #3498db; font-size: 80px; text-shadow: 4px 4px 0px #000; letter-spacing: 12px; transform: scale(0.85); transition: transform 3.5s ease-out; font-style: italic; font-weight: 900;">BUSTED</div>`;
    gameOverOverlay.style.display = 'flex';

    setTimeout(() => {
      const txt = document.getElementById('busted-txt');
      if (txt) txt.style.transform = 'scale(1.1)';
    }, 50);

    setTimeout(respawnPlayer, 4000);
  }

  function respawnPlayer() {
    gameOverOverlay.style.display = 'none';
    const viewportEl = document.getElementById('viewport-wrapper');
    if (viewportEl) viewportEl.style.filter = '';

    playerHealth = 100;
    playerArmor = 50;
    playerCash = Math.max(0, playerCash - 400); // Deduct medical/bail fee
    wantedLevel = 0;
    isDead = false;
    isBusted = false;
    isDriving = false;
    activeVehicleId = null;

    // Respawn Ayo at center
    const playerRb = engine.sceneManager.getRigidBody(storedPlayerId);
    if (playerRb) {
      playerRb.mesh.visible = true;
      playerRb.teleport(new THREE.Vector3(0, 1.5, 0));
      engine.player.possess(storedPlayerId);

      // Reset weapons & aura
      hasKatana = false;
      hasBlade = false;
      playerRb.mesh.userData.hasKatana = false;
      playerRb.mesh.userData.hasBlade = false;
      playerRb.mesh.userData.isCharging = false;

      if (playerAuraMesh) {
        playerAuraMesh.removeFromParent();
        playerAuraMesh = null;
      }

      if (playerAuraEmitter) {
        playerAuraEmitter.dispose();
        playerAuraEmitter = null;
      }
      if (playerChargeStream) {
        playerChargeStream.dispose();
        playerChargeStream = null;
      }
      wasCharging = false;

      const hand = playerRb.mesh.getObjectByName('RightHand') || playerRb.mesh.getObjectByName('mixamorigRightHand');
      if (hand) {
        const oldSword = hand.getObjectByName('equipped_katana');
        if (oldSword) hand.remove(oldSword);
        const oldBlade = hand.getObjectByName('equipped_blade');
        if (oldBlade) hand.remove(oldBlade);
      }

      const asm = engine.findAnimationStateMachine(playerRb);
      if (asm) asm.transition('idle', 0.1);
    }

    // Respawn Katana pickup
    if (!katanaPickupId) {
      katanaPickupId = engine.sceneManager.spawnNow(new THREE.Vector3(-11, 0.6, -10), {
        kind: 'glbInstance',
        params: { assetId: 'Katana', dynamic: false, scale: 1.5 }
      });
    }

    // Respawn Energy Blade pickup
    if (!bladePickupId) {
      bladePickupId = engine.sceneManager.spawnNow(new THREE.Vector3(11, 0.6, 10), {
        kind: 'glbInstance',
        params: { assetId: 'NeoArcBlade', dynamic: false, scale: 2.0 }
      });
    }

    // Clean up Cops
    cleanupCops();
    cooldownProgressTimer = 0;

    // Reset Civil NPC aggro and health
    for (const npc of npcs) {
      npc.health = npc.maxHealth;
      npc.isHostile = false;
      const npcRb = engine.sceneManager.getRigidBody(npc.id);
      if (npcRb) {
        const asm = engine.findAnimationStateMachine(npcRb);
        if (asm) asm.transition('idle', 0.1);
        npcRb.mesh.visible = true;
      }
    }

    updateHud();
  }

  function cleanupCops() {
    for (const cop of cops) {
      engine.sceneManager.requestDestroy(cop.id);
    }
    engine.sceneManager.flushDeferredOperations();
    cops.length = 0;
  }

  // --- 5. Main Game Proximity, Attack, and AI Update Loop ---
  const hook = engine.addUpdateHook((dt) => {
    // Only run in PLAY Mode
    if (engine.input.mode !== 'play') {
      interactionOverlay.style.display = 'none';
      return;
    }

    // Capture/track player ID
    const possessedId = isDriving ? storedPlayerId : engine.player.getPossessedId();
    if (!possessedId) return;
    storedPlayerId = possessedId;

    // Trigger theatrical cutscene via key press [P]
    if (engine.input.isKeyPressed('KeyP')) {
      triggerTheatricalCutscene();
    }

    const playerRb = engine.sceneManager.getRigidBody(possessedId);
    if (!playerRb) return;
    const playerPos = playerRb.mesh.position;

    // Spawn initial assets
    if (!npcsSpawned) {
      npcsSpawned = true;
      
      engine.aiBridge.execute({ type: 'set_entity_name', entityId: possessedId, name: 'ayo' });

      // Spawn Hana
      const hanaId = engine.sceneManager.spawnNow(new THREE.Vector3(11, 0.2, -20), {
        kind: 'character',
        params: { assetId: 'hana' }
      });
      engine.aiBridge.execute({ type: 'set_entity_name', entityId: hanaId, name: 'hana' });

      // Spawn Opp
      const oppId = engine.sceneManager.spawnNow(new THREE.Vector3(-11, 0.2, 20), {
        kind: 'character',
        params: { assetId: 'opp' }
      });
      engine.aiBridge.execute({ type: 'set_entity_name', entityId: oppId, name: 'opp' });

      // Spawn Rayne (Boss)
      const rayneId = engine.sceneManager.spawnNow(new THREE.Vector3(0, 0.2, -45), {
        kind: 'character',
        params: { assetId: 'RAYNEFBX' }
      });
      engine.aiBridge.execute({ type: 'set_entity_name', entityId: rayneId, name: 'rayne' });

      npcs.length = 0;
      npcs.push({ id: hanaId, name: 'Hana', health: 100, isHostile: false, maxHealth: 100 });
      npcs.push({ id: oppId, name: 'Opp', health: 100, isHostile: false, maxHealth: 100 });
      npcs.push({ id: rayneId, name: 'Rayne', health: 200, isHostile: false, maxHealth: 200 }); // Boss health

      // Spawn Red Sports Car (Player's default)
      vehicleId = engine.sceneManager.spawnNow(new THREE.Vector3(0, 1.2, -10), {
        kind: 'box',
        params: { hx: 1.5, hy: 0.5, hz: 2.5, dynamic: true, color: 0xff3333 }
      });

      engine.aiBridge.execute({
        type: 'add_vehicle',
        entityId: vehicleId,
        wheels: [
          { attach: [-1.1, -0.5, 1.5], radius: 0.4, driven: true, steered: true },
          { attach: [1.1, -0.5, 1.5], radius: 0.4, driven: true, steered: true },
          { attach: [-1.1, -0.5, -1.5], radius: 0.4, driven: true, steered: false },
          { attach: [1.1, -0.5, -1.5], radius: 0.4, driven: true, steered: false }
        ]
      });

      // Spawn Green Traffic Car
      trafficVehicleId = engine.sceneManager.spawnNow(new THREE.Vector3(0, 1.2, 30), {
        kind: 'box',
        params: { hx: 1.5, hy: 0.5, hz: 2.5, dynamic: true, color: 0x27ae60 }
      });

      engine.aiBridge.execute({
        type: 'add_vehicle',
        entityId: trafficVehicleId,
        wheels: [
          { attach: [-1.1, -0.5, 1.5], radius: 0.4, driven: true, steered: true },
          { attach: [1.1, -0.5, 1.5], radius: 0.4, driven: true, steered: true },
          { attach: [-1.1, -0.5, -1.5], radius: 0.4, driven: true, steered: false },
          { attach: [1.1, -0.5, -1.5], radius: 0.4, driven: true, steered: false }
        ]
      });

      // Spawn Katana pickup
      katanaPickupId = engine.sceneManager.spawnNow(new THREE.Vector3(-11, 0.6, -10), {
        kind: 'glbInstance',
        params: { assetId: 'Katana', dynamic: false, scale: 1.5 }
      });

      // Spawn Energy Blade pickup
      bladePickupId = engine.sceneManager.spawnNow(new THREE.Vector3(11, 0.6, 10), {
        kind: 'glbInstance',
        params: { assetId: 'NeoArcBlade', dynamic: false, scale: 2.0 }
      });
      
      console.log("[GTA] Spawns completed: Hana, Opp, Rayne, Vehicles, Katana, and Energy Blade loaded.");

      // Helper to register custom animations on NPCs
      const registerNpcAnim = (npcId, stateName, animAssetId) => {
        const rb = engine.sceneManager.getRigidBody(npcId);
        if (rb) {
          const asm = engine.findAnimationStateMachine(rb);
          if (asm) {
            const clips = engine.assetCache.getAnimations(animAssetId);
            if (clips.length > 0) {
              asm.addAnimation(stateName, clips[0]);
            }
          }
        }
      };

      // Register custom animations for Hana, Opp, and Rayne
      registerNpcAnim(hanaId, 'uppercut', 'anim_Attack_Melee_Uppercut_Jab');
      registerNpcAnim(oppId, 'mma_kick', 'anim_Attack_Melee_Mma_Kick');
      registerNpcAnim(rayneId, 'magic_cast', 'anim_Specials_Magic_Spell_Casting');
      registerNpcAnim(rayneId, 'magic_heal', 'anim_Specials_Magic_Heal');
      registerNpcAnim(rayneId, 'punch_combo', 'anim_Attack_Melee_Punch_To_Elbow_Combo');

      // --- Trigger startup dialogue for Intro Cutscene ---
      setTimeout(() => {
        engine.aiBridge.execute({
          type: 'dialogue_show',
          speaker: 'MIX SYSTEM',
          text: 'Welcome to GTA! Would you like to view the theatrical intro cutscene demonstrating the MIX Engine\'s AI and cinematic capabilities?',
          pauseGame: true,
          choices: [
            {
              text: '🎥 Play Theatrical Intro',
              command: { type: 'emit_event', event: 'gta:play_intro' }
            },
            {
              text: '🎮 Skip and Play Game',
              command: { type: 'emit_event', event: 'gta:skip_intro' }
            }
          ]
        });
      }, 1000);
    }

    if (isDead || isBusted) return;

    // --- 1. AURA EFFECT & ENERGY CHARGING (hold [C]) ---
    // Weapon tier picks the aura colour: gold (fists), cyan (katana), violet (energy blade).
    const isCharging = playerRb.mesh.userData.isCharging;
    const auraPreset = hasBlade ? 'aura_red' : (hasKatana ? 'aura_blue' : 'aura_gold');
    const auraColor = hasBlade ? 0xc084fc : (hasKatana ? 0x00f0ff : 0xffd24a);

    if (isCharging) {
      // Recover health and armor while powering up.
      if (playerHealth < 100 || playerArmor < 100) {
        playerHealth = Math.min(100, playerHealth + dt * 12);
        playerArmor = Math.min(100, playerArmor + dt * 18);
        updateHud();
      }

      // Rising edge: the dramatic "power-up" punch — shockwave ring, flash, shake, pop.
      if (!wasCharging) {
        const feet = new THREE.Vector3(playerPos.x, playerPos.y - 0.85, playerPos.z);
        spawnGroundRing(engine, feet, auraColor);
        engine.effects.flash({ color: '#' + auraColor.toString(16).padStart(6, '0'), intensity: 0.35, duration: 0.25, mode: 'pulse' });
        engine.effects.shake({ trauma: 0.5, duration: 0.4, translation: 0.12, rotation: 0.02 });
        const popPos = new THREE.Vector3();
        engine.worldOrigin.toWorldSpaceInto(popPos, new THREE.Vector3(playerPos.x, playerPos.y + 0.4, playerPos.z));
        engine.vfx.burst('ki_blast', popPos, 15);
      }

      // Pulsating, swirling aura sphere (anime "energy_cracks" shell).
      if (!playerAuraMesh) {
        const auraGeo = new THREE.SphereGeometry(1.2, 32, 32);
        const auraMat = new THREE.MeshBasicMaterial({
          color: auraColor,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        playerAuraMesh = new THREE.Mesh(auraGeo, auraMat);
        playerAuraMesh.name = 'player_aura';
        playerAuraMesh.frustumCulled = false;
        playerRb.mesh.add(playerAuraMesh);

        // Apply the anime "energy cracks" texture preset to the shell once loaded.
        engine.textures.load('anime', 'energy_cracks').then((texture) => {
          if (playerAuraMesh) {
            playerAuraMesh.material.map = texture;
            playerAuraMesh.material.needsUpdate = true;
          }
        }).catch(console.error);
      } else {
        playerAuraMesh.material.color.setHex(auraColor); // re-tint if weapon changed mid-charge
      }

      // Swirling aura column (particles).
      if (!playerAuraEmitter) {
        const wp = new THREE.Vector3();
        engine.worldOrigin.toWorldSpaceInto(wp, playerPos);
        playerAuraEmitter = engine.vfx.spawn(auraPreset, wp, { loop: true });
      }
      // Rising energy core that streams up out of the ground at the feet.
      if (!playerChargeStream) {
        const wp = new THREE.Vector3();
        engine.worldOrigin.toWorldSpaceInto(wp, new THREE.Vector3(playerPos.x, playerPos.y - 0.8, playerPos.z));
        playerChargeStream = engine.vfx.spawn('ki_charge', wp, { loop: true });
      }

      // Animate the shell: scroll the cracks texture + pulse the scale.
      if (playerAuraMesh) {
        const mat = playerAuraMesh.material;
        if (mat.map) {
          mat.map.offset.y -= dt * 1.8;
          mat.map.offset.x += dt * 0.4;
        }
        const scaleVal = 1.0 + Math.sin(performance.now() * 0.015) * 0.08;
        playerAuraMesh.scale.set(scaleVal, scaleVal + 0.2, scaleVal);
      }

      // Keep the particle systems glued to the player (engine space).
      if (playerAuraEmitter) {
        playerAuraEmitter.points.position.copy(playerPos);
        playerAuraEmitter.points.position.y += 0.2;
      }
      if (playerChargeStream) {
        playerChargeStream.points.position.copy(playerPos);
        playerChargeStream.points.position.y -= 0.8;
      }

      // Crackling sparks + a low rumble so the charge keeps building.
      if (Math.random() < 0.25) {
        const sparkPos = new THREE.Vector3(
          playerPos.x + (Math.random() - 0.5) * 1.8,
          playerPos.y + Math.random() * 2.0,
          playerPos.z + (Math.random() - 0.5) * 1.8
        );
        const sparkWorldPos = new THREE.Vector3();
        engine.worldOrigin.toWorldSpaceInto(sparkWorldPos, sparkPos);
        engine.vfx.burst('electric', sparkWorldPos, 5);
      }
      if (Math.random() < 0.08) {
        engine.effects.shake({ trauma: 0.14, duration: 0.2, translation: 0.04, rotation: 0.006 });
      }
    } else {
      // Falling edge: release pop so letting go of charge feels like a discharge.
      if (wasCharging) {
        const popPos = new THREE.Vector3();
        engine.worldOrigin.toWorldSpaceInto(popPos, new THREE.Vector3(playerPos.x, playerPos.y + 0.4, playerPos.z));
        engine.vfx.burst('spark_glint', popPos, 18);
      }
      if (playerAuraMesh) {
        playerAuraMesh.removeFromParent();
        playerAuraMesh.material.dispose();
        playerAuraMesh = null;
      }
      if (playerAuraEmitter) {
        playerAuraEmitter.loop = false; // smooth fade-out (engine reaps it when empty)
        playerAuraEmitter = null;
      }
      if (playerChargeStream) {
        playerChargeStream.loop = false;
        playerChargeStream = null;
      }
    }
    wasCharging = isCharging;

    // --- 2. WANTED LEVEL ESCAPE COOLDOWN ---
    if (wantedLevel > 0) {
      const timeSinceAttack = (Date.now() - lastAttackTime) / 1000;
      let copNearby = false;
      for (const cop of cops) {
        const copRb = engine.sceneManager.getRigidBody(cop.id);
        if (copRb) {
          if (playerPos.distanceTo(copRb.mesh.position) < 12) {
            copNearby = true;
            break;
          }
        }
      }

      if (timeSinceAttack > 8.0 && !copNearby) {
        cooldownProgressTimer += dt;
        if (cooldownProgressTimer >= 4.0) {
          wantedLevel--;
          cooldownProgressTimer = 0;
          updateHud();
          if (wantedLevel === 0) {
            cleanupCops();
          }
        }
      } else {
        cooldownProgressTimer = 0;
      }
    }

    // --- 3. PEDESTRIAN SIDEWALK WANDERING AI ---
    for (const npc of npcs) {
      if (npc.health <= 0 || npc.isHostile) continue;

      const npcRb = engine.sceneManager.getRigidBody(npc.id);
      if (!npcRb) continue;

      const npcPos = npcRb.mesh.position;
      const asm = engine.findAnimationStateMachine(npcRb);

      if (npc.name === 'Hana') {
        let nextZ = npcPos.z + hanaWanderDir * 2.0 * dt;
        if (nextZ < -60) {
          hanaWanderDir = 1;
          nextZ = -60;
        } else if (nextZ > -20) {
          hanaWanderDir = -1;
          nextZ = -20;
        }
        
        const nextPos = new THREE.Vector3(11, npcPos.y, nextZ);
        const rayOrigin = new THREE.Vector3(nextPos.x, nextPos.y + 1.0, nextPos.z);
        const hit = engine.physicsWorld.raycastExcludeBody(rayOrigin, new THREE.Vector3(0, -1, 0), npcRb.rapierBody, 5.0);
        if (hit) {
          nextPos.y = (rayOrigin.y - hit.toi) + 0.9;
        }
        npcRb.setNextKinematicTranslation(nextPos);

        const dirVec = new THREE.Vector3(0, 0, hanaWanderDir).normalize();
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), dirVec, new THREE.Vector3(0, 1, 0))
        );
        npcRb.mesh.quaternion.slerp(targetQuat, 0.15);
        npcRb.mesh.quaternion.normalize();
        npcRb.setNextKinematicRotation(npcRb.mesh.quaternion);

        if (asm) asm.transition('walk', 0.2);
      } else if (npc.name === 'Opp') {
        let nextZ = npcPos.z + oppWanderDir * 2.0 * dt;
        if (nextZ > 60) {
          oppWanderDir = -1;
          nextZ = 60;
        } else if (nextZ < 20) {
          oppWanderDir = 1;
          nextZ = 20;
        }

        const nextPos = new THREE.Vector3(-11, npcPos.y, nextZ);
        const rayOrigin = new THREE.Vector3(nextPos.x, nextPos.y + 1.0, nextPos.z);
        const hit = engine.physicsWorld.raycastExcludeBody(rayOrigin, new THREE.Vector3(0, -1, 0), npcRb.rapierBody, 5.0);
        if (hit) {
          nextPos.y = (rayOrigin.y - hit.toi) + 0.9;
        }
        npcRb.setNextKinematicTranslation(nextPos);

        const dirVec = new THREE.Vector3(0, 0, oppWanderDir).normalize();
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), dirVec, new THREE.Vector3(0, 1, 0))
        );
        npcRb.mesh.quaternion.slerp(targetQuat, 0.15);
        npcRb.mesh.quaternion.normalize();
        npcRb.setNextKinematicRotation(npcRb.mesh.quaternion);

        if (asm) asm.transition('walk', 0.2);
      }
    }

    // --- 4. AUTONOMOUS TRAFFIC CAR AI ---
    if (trafficVehicleId && activeVehicleId !== trafficVehicleId) {
      const carRb = engine.sceneManager.getRigidBody(trafficVehicleId);
      if (carRb) {
        const carPos = carRb.mesh.position;
        let throttle = 0.45 * trafficDirection;
        let steer = 0;

        if (carPos.z > 120 && trafficDirection === 1) {
          trafficDirection = -1;
        } else if (carPos.z < -120 && trafficDirection === -1) {
          trafficDirection = 1;
        }

        const targetX = -3.0;
        if (carPos.x > targetX + 1.0) steer = -0.2;
        else if (carPos.x < targetX - 1.0) steer = 0.2;

        engine.aiBridge.execute({
          type: 'set_vehicle_input',
          entityId: trafficVehicleId,
          throttle,
          steer,
          brake: 0,
          handbrake: 0
        });
      }
    }

    // --- 5. KATANA PICKUP DETECTION & EQUIPPING ---
    if (katanaPickupId) {
      const katanaRb = engine.sceneManager.getRigidBody(katanaPickupId);
      if (katanaRb) {
        katanaRb.mesh.rotation.y += dt * 1.5;
        if (!hasKatana && !hasBlade) {
          const distToKatana = playerPos.distanceTo(katanaRb.mesh.position);
          if (distToKatana < 2.0) {
            hasKatana = true;
            playerRb.mesh.userData.hasKatana = true;

            const asm = engine.findAnimationStateMachine(playerRb);
            if (asm) {
              const clips = engine.assetCache.getAnimations('anim_Attack_Melee_Great_Sword_Slash');
              if (clips.length > 0) {
                asm.addAnimation('great_sword_slash', clips[0]);
              }
            }

            const hand = playerRb.mesh.getObjectByName('RightHand') || playerRb.mesh.getObjectByName('mixamorigRightHand');
            if (hand) {
              const swordGroup = engine.assetCache.checkout('Katana');
              katanaEquippedMesh = swordGroup.clone();
              katanaEquippedMesh.name = 'equipped_katana';
              katanaEquippedMesh.position.set(0, 0.05, 0.05);
              katanaEquippedMesh.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
              katanaEquippedMesh.scale.setScalar(0.7);
              hand.add(katanaEquippedMesh);
            }

            engine.sceneManager.requestDestroy(katanaPickupId);
            engine.sceneManager.flushDeferredOperations();
            katanaPickupId = null;

            engine.aiBridge.execute({
              type: 'hit_feedback',
              x: playerPos.x,
              y: playerPos.y + 0.8,
              z: playerPos.z,
              color: 0x00f0ff,
              intensity: 3.0,
              vfx: 'sparks'
            });

            interactionOverlay.innerHTML = `<span style="color:#00f0ff;font-weight:bold;font-size:14px;">KATANA ACQUIRED!</span><br><span style="color:#ffd479;font-size:11px;">LEFT CLICK TO SLASH</span>`;
            interactionOverlay.style.display = 'block';
            setTimeout(() => {
              interactionOverlay.style.display = 'none';
            }, 3000);
          }
        }
      }
    }

    // --- 6. ENERGY BLADE PICKUP DETECTION & EQUIPPING ---
    if (bladePickupId) {
      const bladeRb = engine.sceneManager.getRigidBody(bladePickupId);
      if (bladeRb) {
        bladeRb.mesh.rotation.y += dt * 1.5;
        if (!hasBlade) {
          const distToBlade = playerPos.distanceTo(bladeRb.mesh.position);
          if (distToBlade < 2.0) {
            hasBlade = true;
            hasKatana = false;
            playerRb.mesh.userData.hasBlade = true;
            playerRb.mesh.userData.hasKatana = false;

            const asm = engine.findAnimationStateMachine(playerRb);
            if (asm) {
              const clips = engine.assetCache.getAnimations('anim_Attack_Melee_Great_Sword_Slash');
              if (clips.length > 0) {
                asm.addAnimation('great_sword_slash', clips[0]);
              }
            }

            const hand = playerRb.mesh.getObjectByName('RightHand') || playerRb.mesh.getObjectByName('mixamorigRightHand');
            if (hand) {
              const oldKatana = hand.getObjectByName('equipped_katana');
              if (oldKatana) hand.remove(oldKatana);
              const oldBlade = hand.getObjectByName('equipped_blade');
              if (oldBlade) hand.remove(oldBlade);

              const bladeGroup = engine.assetCache.checkout('NeoArcBlade');
              bladeEquippedMesh = bladeGroup.clone();
              bladeEquippedMesh.name = 'equipped_blade';
              bladeEquippedMesh.position.set(0, 0.05, 0.05);
              bladeEquippedMesh.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
              bladeEquippedMesh.scale.setScalar(0.7);
              hand.add(bladeEquippedMesh);
            }

            engine.sceneManager.requestDestroy(bladePickupId);
            engine.sceneManager.flushDeferredOperations();
            bladePickupId = null;

            engine.aiBridge.execute({
              type: 'hit_feedback',
              x: playerPos.x,
              y: playerPos.y + 0.8,
              z: playerPos.z,
              color: 0x00f0ff,
              intensity: 3.5,
              vfx: 'sparks'
            });

            interactionOverlay.innerHTML = `<span style="color:#c084fc;font-weight:bold;font-size:14px;">ENERGY BLADE ACQUIRED!</span><br><span style="color:#ffd479;font-size:11px;">LEFT CLICK TO POWER SLICE (100 DMG)</span>`;
            interactionOverlay.style.display = 'block';
            setTimeout(() => {
              interactionOverlay.style.display = 'none';
            }, 3000);
          }
        }
      }
    }

    // --- PLAYER ATTACK LOGIC ---
    if (playerAttackCooldown > 0) playerAttackCooldown -= dt;

    if (!isDriving && playerAttackCooldown <= 0 && engine.input.isMouseButtonDown(0)) {
      playerAttackCooldown = 0.6; // Cooldown
      lastAttackTime = Date.now(); // reset wanted escape timer

      const isPunch = Math.random() > 0.5;

      // Spawn weapon trail or limb trail (now real camera-facing ribbon arcs).
      const activeWeapon = hasBlade ? 'blade' : (hasKatana ? 'katana' : 'limbs');
      if (activeWeapon === 'blade' || activeWeapon === 'katana') {
        const swordMesh = playerRb.mesh.getObjectByName('equipped_blade') || playerRb.mesh.getObjectByName('equipped_katana');
        if (swordMesh) {
          if (hasBlade) {
            // Energy blade: violet glow + white-hot core arc.
            spawnEnergySwing(engine, swordMesh, new THREE.Vector3(0, 0, 1.3), 0xc084fc, 0xffffff, 0.26, 0.55, 850);
          } else {
            // Katana: cyan steel-energy glow + white core arc.
            spawnEnergySwing(engine, swordMesh, new THREE.Vector3(0, 0, 1.1), 0x00f0ff, 0xeaffff, 0.24, 0.45, 850);
          }
        }
      } else {
        // Limb ki arc (fist / kick) + ki burst at the limb.
        const limbName = isPunch ? 'RightHand' : 'RightFoot';
        const limb = playerRb.mesh.getObjectByName(limbName) || playerRb.mesh.getObjectByName('mixamorig' + limbName);
        if (limb) {
          const glowColor = isPunch ? 0xffa500 : 0xff3a55; // gold fist / red kick
          spawnEnergySwing(engine, limb, new THREE.Vector3(0, 0, 0), glowColor, 0xffffff, 0.18, 0.34, 650);

          // Ki energy burst off the striking limb.
          const limbPos = new THREE.Vector3();
          limb.getWorldPosition(limbPos);
          const limbWorldPos = new THREE.Vector3();
          engine.worldOrigin.toWorldSpaceInto(limbWorldPos, limbPos);
          engine.vfx.burst('ki_blast', limbWorldPos, 12);
        }
      }

      // Look for nearby targets in range (2.5 meters)
      for (const npc of npcs) {
        if (npc.health <= 0) continue;

        const npcRb = engine.sceneManager.getRigidBody(npc.id);
        if (!npcRb) continue;

        const npcPos = npcRb.mesh.position;
        const dist = playerPos.distanceTo(npcPos);

        if (dist < 2.5) {
          // Deal damage
          const dmg = hasBlade ? 100 : (hasKatana ? 50 : 25);
          npc.health -= dmg;
          npc.isHostile = true; // Aggro civilian
          lastAttackTime = Date.now(); // reset cooldown on hit
          
          // Convert hit position to world space
          const hitWorldPos = new THREE.Vector3();
          engine.worldOrigin.toWorldSpaceInto(hitWorldPos, new THREE.Vector3(npcPos.x, npcPos.y + 1.0, npcPos.z));

          if (hasBlade) {
            // Mega explosion combo!
            engine.effects.explosion({ position: hitWorldPos, color: 0xc084fc });
            engine.effects.flash({ color: '#c084fc', intensity: 0.45, duration: 0.20 });
          } else if (hasKatana) {
            // Katana slash combo!
            engine.effects.hit({
              position: hitWorldPos,
              color: 0x00f0ff,
              intensity: 0.8,
              vfx: 'spark_glint'
            });
            engine.effects.flash({ color: '#00f0ff', intensity: 0.2, duration: 0.15 });
          } else {
            // Normal punch/kick hit combo!
            engine.effects.hit({
              position: hitWorldPos,
              color: isPunch ? 0xffa500 : 0xff0044,
              intensity: 0.5,
              vfx: 'sparks'
            });
          }

          // Add Wanted Level (capped at 3)
          if (wantedLevel < 3) {
            wantedLevel++;
            updateHud();
          }

          console.log(`[GTA] Ayo hit ${npc.name}! NPC Health: ${npc.health}. Wanted Level: ${wantedLevel}`);

          // Check if NPC is KO'ed
          if (npc.health <= 0) {
            npc.isHostile = false;
            playerCash += hasBlade ? 500 : 250; // Extra cash reward for high tier kills!
            updateHud();
            
            // Play death animation
            const asm = engine.findAnimationStateMachine(npcRb);
            if (asm) asm.transition('die', 0.15);

            // Hide body after 4 seconds
            setTimeout(() => {
              npcRb.mesh.visible = false;
            }, 4000);
          }
          break;
        }
      }
    }

    // --- CAR DRIVING & INTERACTION LOGIC ---
    if (isDriving) {
      if (exitCooldown > 0) exitCooldown -= dt;

      const carRb = engine.sceneManager.getRigidBody(activeVehicleId);
      if (carRb) {
        const carPos = carRb.mesh.position;

        let throttle = 0;
        let steer = 0;
        let brake = 0;
        let handbrake = 0;

        if (engine.input.isKeyDown('KeyW')) throttle = 1.0;
        if (engine.input.isKeyDown('KeyS')) throttle = -0.5;
        if (engine.input.isKeyDown('KeyA')) steer = 0.5;
        if (engine.input.isKeyDown('KeyD')) steer = -0.5;
        if (engine.input.isKeyDown('Space')) handbrake = 1.0;

        engine.aiBridge.execute({
          type: 'set_vehicle_input',
          entityId: activeVehicleId,
          throttle,
          steer,
          brake,
          handbrake
        });

        // Vehicle follow camera
        const backDir = new THREE.Vector3(0, 0, 1).applyQuaternion(carRb.mesh.quaternion);
        const targetCamPos = carPos.clone().addScaledVector(backDir, 10);
        targetCamPos.y += 4.5;

        engine.viewport.camera.position.lerp(targetCamPos, 0.1);
        engine.viewport.camera.lookAt(carPos);

        // Exit Vehicle
        if (engine.input.isKeyPressed('KeyF') && exitCooldown <= 0) {
          isDriving = false;
          engine.aiBridge.execute({
            type: 'set_vehicle_input',
            entityId: activeVehicleId,
            throttle: 0,
            steer: 0,
            brake: 1.0
          });

          playerRb.mesh.visible = true;
          playerRb.teleport(new THREE.Vector3(carPos.x + 2.5, carPos.y + 0.5, carPos.z));
          engine.player.possess(storedPlayerId);
          activeVehicleId = null;
        }
      }
      return;
    }

    // --- WANTED LEVEL & POLICE SPAWNER ---
    if (wantedLevel > 0) {
      if (copSpawnCooldown > 0) {
        copSpawnCooldown -= dt;
      } else if (cops.length < wantedLevel) {
        copSpawnCooldown = 3.0; // Wait 3s between cop spawns

        // Spawn cop offset from player
        const spawnPos = playerPos.clone();
        spawnPos.x += (Math.random() - 0.5) * 45;
        spawnPos.z += (Math.random() - 0.5) * 45;

        // Ensure not spawned directly on top of player
        const toPlayer = spawnPos.clone().sub(playerPos);
        if (toPlayer.length() < 18) {
          toPlayer.normalize().multiplyScalar(22);
          spawnPos.copy(playerPos).add(toPlayer);
        }

        const copId = engine.sceneManager.spawnNow(spawnPos, {
          kind: 'character',
          params: { assetId: cops.length % 2 === 0 ? 'opp' : 'RAYNEFBX' }
        });
        engine.aiBridge.execute({ type: 'set_entity_name', entityId: copId, name: `cop_${copId}` });
        cops.push({ id: copId });
        console.log(`[GTA] Spawning cop chaser (Total: ${cops.length})`);
      }
    }

    // --- COPS AI LOGIC (CHASE & ARREST) ---
    for (const cop of cops) {
      const copRb = engine.sceneManager.getRigidBody(cop.id);
      if (!copRb) continue;

      const copPos = copRb.mesh.position;
      const toPlayer = playerPos.clone().sub(copPos);
      const dist = toPlayer.length();

      if (dist < 1.8) {
        // Player caught! Busted!
        triggerBusted();
        return;
      }

      // Run towards player
      toPlayer.y = 0;
      toPlayer.normalize();

      // Rotate cop to face player
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toPlayer, new THREE.Vector3(0, 1, 0))
      );
      copRb.mesh.quaternion.slerp(targetQuat, 0.15);
      copRb.mesh.quaternion.normalize();
      copRb.setNextKinematicRotation(copRb.mesh.quaternion);

      // Translate cop forward
      const nextPos = copPos.clone().addScaledVector(toPlayer, 4.2 * dt);
      
      // Snapping Y
      const rayOrigin = new THREE.Vector3(nextPos.x, nextPos.y + 1.0, nextPos.z);
      const hit = engine.physicsWorld.raycastExcludeBody(
        rayOrigin,
        new THREE.Vector3(0, -1, 0),
        copRb.rapierBody,
        5.0
      );
      if (hit) {
        nextPos.y = (rayOrigin.y - hit.toi) + 0.9;
      }

      copRb.setNextKinematicTranslation(nextPos);

      // Animate cop
      const asm = engine.findAnimationStateMachine(copRb);
      if (asm) asm.transition('run', 0.2);
    }

    // --- NPC HOSTILITY & CIVILIAN RETALIATION ---
    if (attackCooldown > 0) attackCooldown -= dt;

    for (const npc of npcs) {
      if (!npc.isHostile || npc.health <= 0) continue;

      const npcRb = engine.sceneManager.getRigidBody(npc.id);
      if (!npcRb) continue;

      const npcPos = npcRb.mesh.position;
      const toPlayer = playerPos.clone().sub(npcPos);
      const dist = toPlayer.length();

      toPlayer.y = 0;
      toPlayer.normalize();

      // Rotate NPC to face player
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toPlayer, new THREE.Vector3(0, 1, 0))
      );
      npcRb.mesh.quaternion.slerp(targetQuat, 0.15);
      npcRb.mesh.quaternion.normalize();
      npcRb.setNextKinematicRotation(npcRb.mesh.quaternion);

      const asm = engine.findAnimationStateMachine(npcRb);

      if (dist > 1.8) {
        // Run towards player
        const nextPos = npcPos.clone().addScaledVector(toPlayer, 3.8 * dt);
        
        // Snapping Y
        const rayOrigin = new THREE.Vector3(nextPos.x, nextPos.y + 1.0, nextPos.z);
        const hit = engine.physicsWorld.raycastExcludeBody(
          rayOrigin,
          new THREE.Vector3(0, -1, 0),
          npcRb.rapierBody,
          5.0
        );
        if (hit) {
          nextPos.y = (rayOrigin.y - hit.toi) + 0.9;
        }

        npcRb.setNextKinematicTranslation(nextPos);
        if (asm) asm.transition('run', 0.2);
      } else {
        // In range, hit player!
        if (attackCooldown <= 0) {
          attackCooldown = 1.4; // 1.4s attack rate

          if (asm) asm.transition(Math.random() > 0.5 ? 'punch' : 'kick', 0.15);

          // Calculate damage
          const baseDmg = npc.name === 'Rayne' ? 20 : 12; // Rayne Boss hits harder
          let dealtDmg = baseDmg;

          if (playerArmor > 0) {
            const armorAbsorb = Math.round(baseDmg * 0.7);
            playerArmor = Math.max(0, playerArmor - armorAbsorb);
            dealtDmg = baseDmg - armorAbsorb;
          }
          playerHealth = Math.max(0, playerHealth - dealtDmg);
          updateHud();

          // Hit feedback VFX on player
          engine.aiBridge.execute({
            type: 'hit_feedback',
            x: playerPos.x,
            y: playerPos.y + 1.0,
            z: playerPos.z,
            color: 0xe74c3c,
            intensity: 1.8,
            vfx: 'sparks'
          });

          console.log(`[GTA] Ayo hit by ${npc.name}! Player Health: ${playerHealth}, Armor: ${playerArmor}`);

          if (playerHealth <= 0) {
            triggerWasted();
            return;
          }
        } else {
          if (asm) asm.transition('idle', 0.2);
        }
      }
    }

    // --- WALK / VEHICLE INTERACT DETECTION UI ---
    let nearestCarId = null;
    let minCarDist = 3.5;

    const redCarRb = engine.sceneManager.getRigidBody(vehicleId);
    if (redCarRb) {
      const dist = playerPos.distanceTo(redCarRb.mesh.position);
      if (dist < minCarDist) {
        minCarDist = dist;
        nearestCarId = vehicleId;
      }
    }

    const greenCarRb = engine.sceneManager.getRigidBody(trafficVehicleId);
    if (greenCarRb) {
      const dist = playerPos.distanceTo(greenCarRb.mesh.position);
      if (dist < minCarDist) {
        minCarDist = dist;
        nearestCarId = trafficVehicleId;
      }
    }

    if (nearestCarId) {
      const isGreen = nearestCarId === trafficVehicleId;
      interactionOverlay.innerHTML = `${isGreen ? 'NEAR TRAFFIC CAR' : 'NEAR VEHICLE'}<br><span style="color:#ffd479;font-size:11px;font-weight:bold;">PRESS [F] TO ${isGreen ? 'HIJACK' : 'DRIVE'}</span>`;
      interactionOverlay.style.display = 'block';

      if (engine.input.isKeyPressed('KeyF')) {
        isDriving = true;
        activeVehicleId = nearestCarId;
        exitCooldown = 0.5;
        engine.player.possess(null);
        playerRb.mesh.visible = false;
        playerRb.teleport(new THREE.Vector3(playerPos.x, -50, playerPos.z));
        interactionOverlay.style.display = 'none';

        engine.aiBridge.execute({
          type: 'set_vehicle_input',
          entityId: activeVehicleId,
          throttle: 0,
          steer: 0,
          brake: 1.0
        });
        return;
      }
    } else {
      let nearestNpc = null;
      let minDistance = 3.5;

      for (const npc of npcs) {
        if (npc.health <= 0) continue;
        const npcRb = engine.sceneManager.getRigidBody(npc.id);
        if (!npcRb) continue;
        const npcPos = npcRb.mesh.position;
        const dist = playerPos.distanceTo(npcPos);
        if (dist < minDistance) {
          minDistance = dist;
          nearestNpc = npc;
        }
      }

      if (nearestNpc && !inDialogue) {
        activeNpc = nearestNpc;
        interactionOverlay.innerHTML = `NEAR <span style="color:#00f0ff;font-weight:bold;">${activeNpc.name.toUpperCase()}</span><br><span style="color:#ffd479;font-size:11px;font-weight:bold;">PRESS [E] TO TALK</span>`;
        interactionOverlay.style.display = 'block';

        if (engine.input.isKeyPressed('KeyE')) {
          inDialogue = true;
          interactionOverlay.style.display = 'none';
          triggerDialogue(engine, activeNpc, () => {
            inDialogue = false;
          });
        }
      } else {
        activeNpc = null;
        if (!inDialogue) {
          interactionOverlay.style.display = 'none';
        }
      }
    }
  });

  // --- 6. Branching Dialogue Handler ---
  function triggerDialogue(engine, npc, onClosed) {
    let dialogueText = "";
    let choices = [];

    if (npc.name === 'Hana') {
      dialogueText = "Hey Ayo! Looking to start some trouble in my neighborhood, or are you just passing through?";
      choices = [
        {
          text: "Let's fight!",
          command: {
            type: "cutscene_play",
            sequence: {
              duration: 6.0,
              letterbox: true,
              events: [
                { "time": 0.0, "command": { "type": "cutscene_subtitle", "text": "Let's see what you've got, Hana!", "speaker": "Ayo", "duration": 1.5 } },
                { "time": 1.5, "command": { "type": "play_animation", "state": "punch" }, "resolveTarget": "@ayo" },
                { "time": 1.8, "command": { "type": "play_animation", "state": "kick" }, "resolveTarget": "@hana" },
                { "time": 2.8, "command": { "type": "cutscene_subtitle", "text": "Not bad! My turn!", "speaker": "Hana", "duration": 1.5 } },
                { "time": 3.8, "command": { "type": "play_animation", "state": "kick" }, "resolveTarget": "@hana" },
                { "time": 4.0, "command": { "type": "play_animation", "state": "die" }, "resolveTarget": "@ayo" }
              ]
            }
          }
        },
        {
          text: "🎥 Watch Theatrical Cutscene",
          command: { type: "emit_event", event: "gta:play_intro" }
        }
      ];
    } else if (npc.name === 'Opp') {
      dialogueText = "You stepped onto the wrong turf, Ayo. Get lost.";
      choices = [
        {
          text: "Try me!",
          command: {
            type: "cutscene_play",
            sequence: {
              duration: 5.5,
              letterbox: true,
              events: [
                { "time": 0.0, "command": { "type": "cutscene_subtitle", "text": "You talk too much, Opp!", "speaker": "Ayo", "duration": 1.5 } },
                { "time": 1.5, "command": { "type": "play_animation", "state": "kick" }, "resolveTarget": "@ayo" },
                { "time": 1.7, "command": { "type": "play_animation", "state": "die" }, "resolveTarget": "@opp" },
                { "time": 2.7, "command": { "type": "cutscene_subtitle", "text": "Stay down, Opp.", "speaker": "Ayo", "duration": 1.5 } }
              ]
            }
          }
        },
        {
          text: "🎥 Watch Theatrical Cutscene",
          command: { type: "emit_event", event: "gta:play_intro" }
        }
      ];
    } else if (npc.name === 'Rayne') {
      dialogueText = "Ayo... it ends here tonight.";
      choices = [
        {
          text: "Let's finish it!",
          command: {
            type: "cutscene_play",
            sequence: {
              duration: 7.5,
              letterbox: true,
              events: [
                { "time": 0.0, "command": { "type": "cutscene_subtitle", "text": "Rayne! It's time to settle the score!", "speaker": "Ayo", "duration": 2.0 } },
                { "time": 3.0, "command": { "type": "play_animation", "state": "punch" }, "resolveTarget": "@rayne" },
                { "time": 4.7, "command": { "type": "play_animation", "state": "die" }, "resolveTarget": "@rayne" }
              ]
            }
          }
        },
        {
          text: "🎥 Watch Theatrical Cutscene",
          command: { type: "emit_event", event: "gta:play_intro" }
        }
      ];
    }

    // Set dialogue close callback
    if (engine.aiBridge && engine.aiBridge.dialogueSystem) {
      const originalOnHide = engine.aiBridge.dialogueSystem.onHide;
      engine.aiBridge.dialogueSystem.onHide = () => {
        if (originalOnHide) originalOnHide();
        onClosed();
        engine.aiBridge.dialogueSystem.onHide = originalOnHide;
      };
    } else {
      setTimeout(onClosed, 500);
    }

    // Render dialogue
    engine.aiBridge.execute({
      type: 'dialogue_show',
      speaker: npc.name,
      text: dialogueText,
      pauseGame: true,
      choices: choices
    });
  }

  // --- 7. Script Teardown Hook ---
  window.__gta_cleanup = () => {
    hook(); // Remove update hook
    window.removeEventListener('keydown', escapeHandler, true);
    unsubPlay();
    unsubSkip();
    unsubModeHud();
    engine.time.setTimeScale(1);              // restore normal time if paused
    if (settingsOpen) closeSettings();        // close menu + re-acquire pointer lock
    
    // Remove DOM elements
    if (hudContainer && hudContainer.parentNode) hudContainer.parentNode.removeChild(hudContainer);
    if (healthArmorContainer && healthArmorContainer.parentNode) healthArmorContainer.parentNode.removeChild(healthArmorContainer);
    if (gameOverOverlay && gameOverOverlay.parentNode) gameOverOverlay.parentNode.removeChild(gameOverOverlay);
    if (interactionOverlay && interactionOverlay.parentNode) interactionOverlay.parentNode.removeChild(interactionOverlay);
    if (settingsOverlay && settingsOverlay.parentNode) settingsOverlay.parentNode.removeChild(settingsOverlay);

    // Reset viewport filters
    const viewportEl = document.getElementById('viewport-wrapper');
    if (viewportEl) viewportEl.style.filter = '';

    // Destroy Cops
    cleanupCops();

    // Destroy Civilians & Car
    for (const npc of npcs) {
      engine.sceneManager.requestDestroy(npc.id);
    }
    if (vehicleId) {
      engine.aiBridge.execute({ type: 'remove_vehicle', entityId: vehicleId });
      engine.sceneManager.requestDestroy(vehicleId);
    }
    if (trafficVehicleId) {
      engine.aiBridge.execute({ type: 'remove_vehicle', entityId: trafficVehicleId });
      engine.sceneManager.requestDestroy(trafficVehicleId);
    }
    if (katanaPickupId) {
      engine.sceneManager.requestDestroy(katanaPickupId);
    }
    if (bladePickupId) {
      engine.sceneManager.requestDestroy(bladePickupId);
    }
    engine.sceneManager.flushDeferredOperations();

    hasKatana = false;
    hasBlade = false;
    katanaPickupId = null;
    bladePickupId = null;
    katanaEquippedMesh = null;
    bladeEquippedMesh = null;
    activeVehicleId = null;
    if (playerAuraMesh) {
      playerAuraMesh.removeFromParent();
      playerAuraMesh = null;
    }
    if (playerAuraEmitter) {
      playerAuraEmitter.dispose();
      playerAuraEmitter = null;
    }
    if (playerChargeStream) {
      playerChargeStream.dispose();
      playerChargeStream = null;
    }
    wasCharging = false;
    npcsSpawned = false;
    npcs.length = 0;
  };
}

function wireMotifectCharacters(engine) {
  if (!motifectPackReady) return;
  for (const id of engine.sceneManager.allEntityIds()) {
    if (motifectWiredEntities.has(id)) continue;
    const blueprint = engine.sceneManager.getBlueprint(id);
    if (blueprint?.kind !== 'character') continue;
    const rb = engine.sceneManager.getRigidBody(id);
    if (!rb) continue;
    const asm = engine.findAnimationStateMachine(rb);
    if (!asm) continue;

    const applied = engine.animPacks.applyToStateMachine('motifect_martial_arts', asm, {
      prefix: 'martial',
    });
    // The command is queued through the same AIBridge surface exposed to IDEs.
    engine.aiBridge.execute({
      type: 'anim_pack_wire_combat',
      packId: 'motifect_martial_arts',
      auto: true,
      target: [id],
      prefix: 'martial',
    });
    motifectWiredEntities.add(id);
    console.log(`[Motifect] character ${id}: applied ${applied} clips; combat wiring queued.`);
  }
}
