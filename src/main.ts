import * as THREE from 'three';
import { Engine } from './engine/Engine';
import { MIXAMO_CHARACTERS } from './animation/MixamoPresets';
import { FREE_ANIMATION_PACKS } from './animation/FreeAnimationPacks';
import { chunkCoordsFromWorld } from './streaming/chunkMath';
import { AnimationPreviewPanel } from './scenes/AnimationPreviewPanel';
import { escapeHtml, showToast, sendHelmResult } from './ui/domUtils';

import { installConsoleCapture } from './editor/consoleCapture';
import {
  container, telemetryChunk, telemetryDrift, telemetryShift, telemetryDt, perfText,
  btnMode, possessionBanner, possessionText,
} from './editor/dom';
import { ui } from './editor/state';
import { isCharacterRb, getEntityIdForRb, getAssetId } from './editor/sceneHelpers';
import {
  captureState, autoSaveToLocalStorage, syncTelemetryWithServer, restoreSceneFromString,
} from './editor/sceneIO';
import { updateOutliner } from './editor/outliner';
import { updateInspector, refreshInspectorValues } from './editor/inspector';
import { drawPerformanceGraph } from './editor/perfGraph';
import { renderPresetsTab, renderDrawerTab } from './editor/panels';
import { setupCinematicHud } from './editor/cinematicHud';
import { setupSensoriumPanel } from './editor/sensoriumPanel';
import { initLayout, detachViewport, reattachViewport } from './editor/layout';
import { setupDragAndDrop } from './editor/dragAndDrop';
import { setupUIEvents } from './editor/uiEvents';
import { installMixFacade } from './editor/mixFacade';
import { setupAnimationPackDrop } from './editor/animationPacksPanel';
import { showProjectHub } from './hub';

async function boot(activeProject: string): Promise<Engine> {
  const engine = await Engine.create(container!);

  // If anything past this point throws (e.g. a GLB preload 404), the engine from
  // Engine.create is ALREADY running its rAF loop — we must dispose it so a failed
  // boot doesn't leak a headless rendering loop + WASM world.
  try {
    // --- Preload Character Presets and Locomotion Animations ------
    const essentialAnimations = [
      'anim_Locomotion_idle',
      'anim_Locomotion_Walking',
      'anim_Locomotion_running',
      'anim_Locomotion_jump',
      'anim_Locomotion_Backflip',
      'anim_Attack_Melee_Hook_Punch',
      'anim_Attack_Melee_Mma_Kick',
      'anim_DYING_Dying',
      'anim_Attack_Melee_Great_Sword_Slash',
      'anim_Specials_Two_Hand_Spell_Casting',
    ];

    const customModelIds = [
      'AptMailbox', 'Bench', 'HighwayStreetLights', 'Planter', 'PublicTrashCan',
      'SmallGate', 'StreetLamp2', 'StreetLamp', 'VendingMachine', 'VendingMachine2',
      'WaterFountain', 'AnimeBush', 'RealGrass', 'AnimeTree1', 'AnimeTree3', 'AnimeTree3_Alt',
      'Katana',
      'NeoArcBlade',
      ...Array.from({ length: 91 }, (_, i) => `TrashDebris${i + 1}`)
    ];

    const preloadList = [
      ...MIXAMO_CHARACTERS.map((c) => c.id),
      ...essentialAnimations,
      ...customModelIds,
    ];

    console.log('[MIX Engine] Preloading assets...', preloadList);
    await engine.manifest.preload(preloadList);

    // --- Bundled free animation packs -------------------------------------
    // These are imported through the same Retarget Pro path exposed to IDE
    // agents.  Importing once at boot makes the clips available in the preview
    // library and keeps `mix.applyPack` / `mix.motion` deterministic after reload.
    for (const pack of FREE_ANIMATION_PACKS) {
      const result = await engine.animImporter.importPack({
        packId: pack.id,
        displayName: pack.displayName,
        sourcePath: pack.sourcePath,
        targetRig: 'ayo',
        qualityPreset: 'aaa',
        footLock: true,
        keepRootMotion: true,
      });
      if (!result.ok) {
        console.warn(`[MIX Engine] bundled animation pack '${pack.id}' was not imported: ${result.error ?? 'unknown error'}`);
      } else {
        console.log(`[MIX Engine] Retarget Pro imported ${result.imported} clips from '${pack.displayName}'.`);
      }
    }

    // --- Grid Helper Setup ---
    ui.gridHelper = new THREE.GridHelper(100, 100, 0x00f0ff, 0x22262b);
    ui.gridHelper.position.y = 0.01; // Avoid z-fighting with the ground box
    engine.viewport.scene.add(ui.gridHelper);

    // --- Register AIBridge UI/Viewport/Grid control hooks ---
    engine.aiBridge.registerViewportControls({
      detach: () => detachViewport(engine),
      reattach: () => reattachViewport(engine)
    });

    // --- Initialize UI linkings --------------------------------------------
    setupUIEvents(engine);
    setupDragAndDrop(engine);
    // Animation Packs — folder drop → auto-retarget (the "ARP for MIX" path).
    setupAnimationPackDrop(engine, container!.querySelector('canvas') as HTMLCanvasElement);
    renderPresetsTab();
    renderDrawerTab(engine);
    updateOutliner(engine);
    updateInspector(engine);

    // --- Cinematic HUD + Audio unlock ---------------------------------------
    setupCinematicHud(engine);
    setupSensoriumPanel(engine);
    // Expose a tight `window.mix` facade so the IDE / REPL can drive the engine.
    installMixFacade(engine);

    // Keep controller discovery visible in the editor, including hot-plug and
    // reconnects where the browser assigns a non-zero gamepad index.
    const gamepadStatus = document.getElementById('gamepad-status');
    const gamepadStatusText = document.getElementById('gamepad-status-text');
    const gamepadStatusDot = document.getElementById('gamepad-status-dot');
    const settingsGamepadList = document.getElementById('settings-gamepad-list');
    const renderGamepadStatus = () => {
      const devices = engine.input.gamepad.getStatus().filter((device) => device.connected);
      if (gamepadStatusText) gamepadStatusText.textContent = devices.length === 0
        ? 'NO CONTROLLER'
        : devices.length === 1 ? 'CONTROLLER READY' : `${devices.length} CONTROLLERS`;
      if (gamepadStatus) gamepadStatus.title = devices.length === 0
        ? 'No connected game controllers'
        : devices.map((device) => `#${device.index} ${device.id}`).join('\n');
      if (gamepadStatusDot) {
        gamepadStatusDot.style.background = devices.length > 0 ? 'var(--accent-green)' : '#687277';
        gamepadStatusDot.style.boxShadow = devices.length > 0 ? '0 0 8px var(--accent-green)' : 'none';
      }
      if (settingsGamepadList) {
        settingsGamepadList.innerHTML = devices.length === 0
          ? 'No controller detected'
          : devices.map((device) =>
            `<div style="border:1px solid var(--border-color);padding:7px 8px;border-radius:4px;color:var(--text-primary);">` +
            `<strong>#${device.index} ${escapeHtml(device.id)}</strong><br>` +
            `<span style="color:var(--text-muted);">${device.layout} · ${device.buttons} buttons · ${device.axes} axes${device.haptics ? ' · haptics' : ''}</span></div>`,
          ).join('');
      }
    };
    engine.input.gamepad.on('change', renderGamepadStatus);
    engine.input.gamepad.on('connected', (device) => showToast(`Controller connected: ${device.id}`, 'success'));
    engine.input.gamepad.on('disconnected', (device) => showToast(`Controller disconnected: ${device.id}`, 'info'));
    renderGamepadStatus();

    // Keep the editor UI in sync when HELM / SENSORIUM mutate the scene out-of-band
    // (agent spawns, checkpoint restores, scenario setup). Debounced to one refresh per
    // frame so a big batch doesn't thrash the DOM.
    let sceneChangePending = false;
    window.addEventListener('mix:scene-changed', () => {
      if (sceneChangePending) return;
      sceneChangePending = true;
      requestAnimationFrame(() => {
        sceneChangePending = false;
        updateOutliner(engine);
        updateInspector(engine);
        autoSaveToLocalStorage(engine);
      });
    });

    // Browsers gate AudioContext behind a user gesture; unlock on first interaction.
    const unlockAudio = () => {
      engine.audio.resume();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // --- Main Tick Updates for Telemetry HUD ---------------------------------
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 60;

    engine.addUpdateHook((dt) => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 500) {
        fps = Math.round((frameCount * 1000) / (now - lastTime));
        frameCount = 0;
        lastTime = now;
        syncTelemetryWithServer(engine, fps);
      }

      // Telemetry computations
      const camPos = engine.viewport.camera.position;
      const worldPos = new THREE.Vector3();
      engine.worldOrigin.toWorldSpaceInto(worldPos, camPos);

      // Use the REAL chunk grid math (CHUNK_SIZE = 256, not the old hard-coded 50).
      const { cx, cz } = chunkCoordsFromWorld(worldPos);

      // Update telemetry HUD DOM
      if (telemetryChunk) telemetryChunk.textContent = `[${cx}, ${cz}]`;
      if (telemetryDrift) telemetryDrift.textContent = `${camPos.length().toFixed(1)}m`;
      if (telemetryShift) telemetryShift.textContent = `${engine.worldOrigin.offset.length().toFixed(0)}m`;
      if (telemetryDt) telemetryDt.textContent = `${(dt * 1000).toFixed(1)}ms`;

      // Performance graph & statistics (colour-code FPS: green ≥50, gold 30-49, red <30).
      const drawCalls = engine.viewport.renderer.info.render.calls;
      const triangles = engine.viewport.renderer.info.render.triangles;
      if (perfText) {
        const fpsCol = fps >= 50 ? '#22c55e' : fps >= 30 ? '#ffd479' : '#ef4444';
        perfText.innerHTML = `FPS: <span style="color:${fpsCol};font-weight:bold">${fps}</span> | Draw Calls: ${drawCalls} | Triangles: ${(triangles / 1000).toFixed(1)}k`;
      }

      drawPerformanceGraph(fps);

      // Auto-update Inspector transform VALUES while dragging the gizmo — refresh the
      // existing inputs in place rather than rebuilding innerHTML every frame.
      if (engine.gizmo.dragging) {
        refreshInspectorValues(engine);
      }
    });

    // Track selection changes to update Inspector & Outliner
    let lastAttachedRb: any = null;
    engine.addUpdateHook(() => {
      const activeRb = engine.gizmo.attached;
      if (activeRb !== lastAttachedRb) {
        lastAttachedRb = activeRb;
        updateOutliner(engine);
        updateInspector(engine);
      }
    });

    // --- Mode change management (Play/Editor) -------------------------------
    engine.input.on('modechange', (mode) => {
      // Toggle helper bulbs visibility depending on mode
      engine.sceneManager.rigidBodyList.forEach((rb) => {
        const bulb = rb.mesh.getObjectByName('BulbHelper');
        if (bulb) {
          bulb.visible = mode === 'editor';
        }
      });

      // Toggle Animation Preview Panel visibility depending on mode
      const animPanel = document.getElementById('animation-preview-panel');
      if (animPanel) {
        animPanel.style.display = mode === 'play' ? 'none' : '';
      }

      if (btnMode) {
        btnMode.textContent = mode === 'play' ? 'EDITOR MODE (F5)' : 'PLAY MODE (F5)';
        btnMode.style.background = mode === 'play' ? 'rgba(34, 197, 94, 0.15)' : '';
        btnMode.style.borderColor = mode === 'play' ? 'var(--accent-green)' : '';
        btnMode.style.color = mode === 'play' ? 'var(--accent-green)' : '';
      }

      if (mode === 'play') {
        // SENSORIUM: when a test is driving the engine, the runner has already possessed
        // the target entity (and set the testMode bypass on the input manager) — skip
        // the auto-possess so the test isn't hijacked by spawning ayo.
        if (engine.isTestMode) return;

        let possessRb = engine.gizmo.attached;

        // Auto-possess selected or first character
        if (!possessRb || !isCharacterRb(possessRb)) {
          possessRb = engine.sceneManager.rigidBodyList.find(isCharacterRb) || null;
        }

        if (!possessRb) {
          // Spawn default Ayo character to possess
          const spawnPos = new THREE.Vector3(0, 1.5, 0);
          const entityId = engine.sceneManager.spawnNow(spawnPos, {
            kind: 'character',
            params: { assetId: 'ayo' }
          }, { rootMotion: true });
          possessRb = engine.sceneManager.getRigidBody(entityId);
        }

        if (possessRb) {
          const id = getEntityIdForRb(engine, possessRb);
          engine.player.possess(id);
          engine.gizmo.detach();

          if (possessionBanner && possessionText) {
            const charName = getAssetId(possessRb) || 'Character';
            possessionText.textContent = `POSSESSING ${charName.toUpperCase()}`;
            possessionBanner.classList.add('visible');
          }
        }
      } else {
        if (possessionBanner) possessionBanner.classList.remove('visible');
        engine.player.possess(null);
        updateOutliner(engine);
      }
    });

    // --- Ground Plane Setup & Core Scene Content ------------------------------
    engine.sceneManager.spawnNow(new THREE.Vector3(0, -0.5, 0), {
      kind: 'box',
      params: { hx: 50, hy: 0.5, hz: 50, dynamic: false, color: 0x181a1f },
    });

    // Hook drag end history capture
    engine.gizmo.onDragEnd = () => {
      captureState(engine);
      autoSaveToLocalStorage(engine);
    };

    // Restore the selected project's scene before handing control to the editor.
    const sceneRestore = fetch('/api/scene-state').then(async (res) => {
      if (res.ok) {
        const savedState = await res.text();
        if (savedState && savedState !== '{}') {
          console.log('[MIX Engine] Server scene state found. Restoring scene...');
          restoreSceneFromString(engine, savedState);
        }
      }
    }).catch(() => {});

    const label = document.getElementById('active-game-label');
    if (label) {
      label.textContent = `PROJECT: ${escapeHtml(activeProject)}`;
      label.style.display = 'inline-block';
    }

    // Custom Script Execution Entry Point
    try {
      // Append a timestamp so we always get the latest code if the user/LLM edits the file and refreshes.
      const mod = await import(/* @vite-ignore */ `/games/${activeProject}/scripts/main.js?t=${Date.now()}`);
      if (mod.default && typeof mod.default === 'function') {
        console.log(`[MIX Engine] Executing custom game logic from /games/${activeProject}/scripts/main.js`);
        mod.default(engine);
      }
    } catch (e) {
      // Script doesn't exist or has an error; ignore silently to allow games without custom logic.
    }

    await sceneRestore;

    // Capture the loaded project as the first undo/redo checkpoint.
    captureState(engine);

    // --- Animation Preview Panel (ships with the engine) ----------------------
    // On a clean boot (no autosave) the engine defaults to the Ayo preview scene:
    // a character standing at the origin with the full animation bank preloaded
    // and a floating panel to play each clip. The panel can also be toggled back
    // on at any time via the viewport "Anim Preview" button.
    const animationPreview = new AnimationPreviewPanel(engine);
    // Projects now enter through the hub, so their saved scene remains the landing scene.
    // The animation lab is still available from the viewport toolbar.
    const btnAnimPreview = document.getElementById('btn-anim-preview') as HTMLButtonElement | null;
    btnAnimPreview?.addEventListener('click', () => {
      void animationPreview.activate();
      showToast('Animation Preview ready — Ayo is standing by.', 'info');
    });
    // Expose a console handle so `window.mix.preview()` re-opens the panel
    // (handy for the REPL / agents that want to re-preview after editing).
    (window as any).mix = {
      ...((window as any).mix ?? {}),
      preview: () => animationPreview.activate(),
      animationPreview,
    };

    // Vite HMR WS Bridge for remote CLI control and file-watching
    if (import.meta.hot) {
      import.meta.hot.on('mix:reload-scene', (data: { state: string }) => {
        console.log('[mix-dev-ws] Received scene reload request from disk.');
        restoreSceneFromString(engine, data.state);
      });

      import.meta.hot.on('mix:cli-command', (cmd: any) => {
        console.log('[mix-dev-ws] Received remote CLI command:', cmd);
        engine.aiBridge.execute(cmd);
      });

      // HELM: request/response control plane. The dev server forwards an agent request
      // here, we run it against the live engine, and POST the structured result back
      // keyed by the request id so the server can resolve the agent's held HTTP call.
      import.meta.hot.on('mix:helm-rpc', (req: any) => {
        void engine
          .runHelm(req)
          .then((result) => sendHelmResult(req?.id, result))
          .catch((err) =>
            sendHelmResult(req?.id, {
              id: req?.id, op: req?.op, ok: false, error: String((err as Error)?.message ?? err), durationMs: 0,
            }),
          );
      });
    }

    // Expose engine instance
    (window as any).engine = engine;
    return engine;
  } catch (err) {
    // A failed boot must not leave a headless engine running.
    engine.dispose();
    throw err;
  }
}

// --- Bootstrap -------------------------------------------------------------
let loadingOverlay: HTMLDivElement | null = null;

function showLoadingOverlay(projectName: string): void {
  loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'mix-loading-overlay';
  loadingOverlay.style.cssText =
    'position:fixed;inset:0;background:#07090b;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:14px;font-family:ui-monospace,monospace;color:#e7ecec;transition:opacity 0.4s ease;';
  loadingOverlay.innerHTML = `
    <div style="width:34px;height:34px;transform:rotate(45deg);border:1px solid #8ee1ef;box-shadow:inset 0 0 18px rgba(142,225,239,.12);position:relative;"><i style="position:absolute;inset:12px;background:#f2a84b;box-shadow:0 0 12px rgba(242,168,75,.6);"></i></div>
    <div style="font-size:15px;color:#f2f3f1;font-weight:600;letter-spacing:3px;margin-top:8px;">MIX ENGINE</div>
    <div style="font-size:10px;color:#7f898d;letter-spacing:1px;">OPENING ${escapeHtml(projectName.toUpperCase())}</div>
    <div style="width:210px;height:2px;background:rgba(255,255,255,0.07);overflow:hidden;margin-top:5px;">
      <div id="mix-loading-bar" style="width:45%;height:100%;background:linear-gradient(90deg,transparent,#8ee1ef,transparent);animation:mixload 1.35s ease-in-out infinite;"></div>
    </div>`;
  document.body.appendChild(loadingOverlay);
  const styleTag = document.createElement('style');
  styleTag.textContent = '@keyframes mixload { 0%{transform:translateX(-120%);} 100%{transform:translateX(340%);} }';
  document.head.appendChild(styleTag);
}

function hideLoadingOverlay(): void {
  const overlay = loadingOverlay;
  if (!overlay) return;
  loadingOverlay = null;
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 420);
}

let resolveEngine!: (engine: Engine) => void;
let rejectEngine!: (reason?: unknown) => void;
const enginePromise = new Promise<Engine>((resolve, reject) => {
  resolveEngine = resolve;
  rejectEngine = reject;
});

async function launchEditor(projectName: string): Promise<void> {
  showLoadingOverlay(projectName);
  // The heavyweight editor, renderer, physics, and asset preload stay dormant while
  // the hub is open. Initialize them only after the user chooses a project.
  installConsoleCapture();
  initLayout();
  document.getElementById('btn-hub')?.addEventListener('click', () => window.location.reload());
  try {
    const engine = await boot(projectName);
    resolveEngine(engine);
  } catch (error) {
    rejectEngine(error);
  }
}

showProjectHub({ version: '0.2.0', onLaunch: launchEditor });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (ui.gridHelper) {
      ui.gridHelper.geometry?.dispose();
      (ui.gridHelper.material as THREE.Material | THREE.Material[]) &&
        (Array.isArray(ui.gridHelper.material)
          ? ui.gridHelper.material.forEach((m) => m.dispose())
          : (ui.gridHelper.material as THREE.Material).dispose());
      ui.gridHelper = null;
    }
    void enginePromise.then((engine) => engine.dispose());
  });
}

enginePromise.then(() => hideLoadingOverlay());

enginePromise.catch((err: unknown) => {
  console.error('[MIX Engine] failed to start:', err);
  hideLoadingOverlay();
  // Surface the failure in the viewport (there is no #hud element) + a toast.
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff8080;font-family:monospace;font-size:13px;padding:24px;text-align:center;">Engine failed to start:<br/>${escapeHtml(String(err))}</div>`;
  }
  showToast('Engine failed to start — see console for details.', 'error');
});

export { enginePromise };
