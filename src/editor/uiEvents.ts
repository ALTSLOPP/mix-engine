import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { showToast } from '../ui/domUtils';
import { TerrainBrushTool } from '../terrain/TerrainBrushTool';
import { TerrainPaintTool } from '../terrain/TerrainPaintTool';
import { TerrainSplineTool } from '../terrain/TerrainSplineTool';
import { ui } from './state';
// Imported as a namespace and destructured into local consts inside setupUIEvents:
// TypeScript preserves null-narrowing of *local* consts inside event-handler closures
// (the `if (el) { el.addEventListener(...) }` pattern), but not of imported bindings.
import * as dom from './dom';
import {
  performUndo, performRedo, serializeSceneState, deserializeSceneState,
  captureState, autoSaveToLocalStorage, clearAllEntities, duplicateEntity, deleteEntity,
} from './sceneIO';
import { updateOutliner } from './outliner';
import { updateInspector } from './inspector';
import { getEntityIdForRb, focusCameraOnSelected } from './sceneHelpers';
import { detachViewport, reattachViewport, isViewportSoloed } from './layout';
import { renderPresetsTab, renderDrawerTab } from './panels';
import { renderFeatureHubModal, hookFeatureHubEvents } from './featureHubPanel';

// Default building footprint SVG (used by the extruder when no SVG was uploaded).
const DEFAULT_SVG = `<svg width="10" height="10">
  <path d="M 0 0 L 8 0 L 8 2 L 10 2 L 10 8 L 8 8 L 8 10 L 0 10 L 0 8 L -2 8 L -2 2 L 0 2 Z" />
</svg>`;

// --- Wire UI clicks, buttons, extruder -------------------------------------
export function setupUIEvents(engine: Engine): void {
  // Destructure the cached DOM elements into local consts so their null-narrowing
  // survives into the event-handler closures below (see the import note above).
  const {
    btnMode, btnUndo, btnRedo, btnSaveScene, btnLoadScene,
    btnToggleSnap, selSnapTranslate, selSnapRotate,
    fogSlider, fogVal, fogColor, ambientSlider, ambientVal,
    btnPausePhysics, todSlider, todVal,
    btnSpawnBox, btnSpawnSphere, btnSpawnLight, btnClearScene,
    btnGizmoTranslate, btnGizmoRotate, btnGizmoScale,
    btnTerrainRaise, btnTerrainLower, btnTerrainSmooth, btnTerrainFlatten, btnTerrainTerrace,
    btnTerrainRamp, btnTerrainNoise, btnTerrainErode, btnTerrainPaint,
    terrainBrushSettings, terrainRadius, terrainStrength, terrainHardness, terrainTerraceStep,
    terrainErodeKind, terrainPaintLayer,
    btnTerrainSpline, terrainSplineSettings, btnTerrainSplineApply, btnTerrainSplineClear, terrainSplineWidth,
    btnToggleGrid, btnZoomIn, btnZoomOut, btnZoomReset, btnZoomFrame, btnTogglePostFx, btnViewPossess,
    outlinerContent, outlinerSearch,
    tabInspTransform, tabInspPhysics, tabInspMaterial, tabInspTweens,
    tabChars, tabAnims, presetsContentArea,
    tabDrawerAi, tabDrawerAssets, tabDrawerGames, tabDrawerConsole, tabDrawerTweens,
    svgDropZone, extruderDepth, extruderUv, btnExtrude,
    btnDetachViewport, btnReattachViewport,
    btnExportJson, btnImportJson, btnImportJsonFile, btnDuplicateEntityMenu, btnDeleteEntityMenu,
    btnGenTerrainLlm, btnCycleTod, btnLlmGuide, btnApiRef,
    btnSettings, settingsModal, btnCloseSettings, btnCancelSettings, btnSaveSettings, settingsBlenderPath,
    btnFeatureHub, btnMixCopilot, featureHubModalContainer,
  } = dom;

  // Snap + SVG-extrude state (used only by this module's handlers).
  let snapEnabled = false;
  let snapTranslateValue = 0.5;
  let snapRotateValue = 15;
  let uploadedSvgText: string | null = null;

  // Mode click
  if (btnMode) {
    btnMode.addEventListener('click', () => {
      engine.input.setMode(engine.input.mode === 'editor' ? 'play' : 'editor');
    });
  }

  // Undo / Redo buttons
  if (btnUndo) {
    btnUndo.addEventListener('click', () => performUndo(engine));
  }
  if (btnRedo) {
    btnRedo.addEventListener('click', () => performRedo(engine));
  }

  // Save / Load Scene buttons
  if (btnSaveScene) {
    btnSaveScene.addEventListener('click', () => {
      const state = serializeSceneState(engine);
      const blob = new Blob([state], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mix_engine_scene_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (btnLoadScene) {
    btnLoadScene.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          deserializeSceneState(engine, content);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }

  // Snapping logic
  const updateSnapping = () => {
    if (btnToggleSnap) {
      btnToggleSnap.textContent = snapEnabled ? 'Snap: ON' : 'Snap: OFF';
      btnToggleSnap.classList.toggle('active', snapEnabled);
    }
    if (selSnapTranslate) selSnapTranslate.style.display = snapEnabled ? 'inline-block' : 'none';
    if (selSnapRotate) selSnapRotate.style.display = snapEnabled ? 'inline-block' : 'none';

    engine.gizmo.setTranslationSnap(snapEnabled ? snapTranslateValue : null);
    engine.gizmo.setRotationSnap(snapEnabled ? THREE.MathUtils.degToRad(snapRotateValue) : null);
    engine.gizmo.setScaleSnap(snapEnabled ? 0.1 : null);
  };

  if (btnToggleSnap) {
    btnToggleSnap.addEventListener('click', () => {
      snapEnabled = !snapEnabled;
      updateSnapping();
    });
  }

  if (selSnapTranslate) {
    selSnapTranslate.addEventListener('change', () => {
      snapTranslateValue = parseFloat(selSnapTranslate.value);
      updateSnapping();
    });
  }

  if (selSnapRotate) {
    selSnapRotate.addEventListener('change', () => {
      snapRotateValue = parseFloat(selSnapRotate.value);
      updateSnapping();
    });
  }

  // Fog & Ambient light intensity sliders.
  // Visual updates happen on `input` (live); the expensive serialize + autosave runs on
  // `change` (release) so dragging a slider doesn't serialize the whole scene per pixel.
  const applyFog = (density: number) => {
    const colorHex = fogColor ? fogColor.value : '#06080a';
    if (density > 0) {
      if (engine.viewport.scene.fog) {
        (engine.viewport.scene.fog as THREE.FogExp2).density = density;
        (engine.viewport.scene.fog as THREE.FogExp2).color.set(colorHex);
      } else {
        engine.viewport.scene.fog = new THREE.FogExp2(colorHex, density);
      }
      engine.viewport.renderer.setClearColor(colorHex);
    } else {
      engine.viewport.scene.fog = null;
    }
  };

  if (fogSlider && fogVal) {
    fogSlider.addEventListener('input', () => {
      const density = parseFloat(fogSlider.value);
      fogVal.textContent = density.toFixed(3);
      applyFog(density);
    });
    fogSlider.addEventListener('change', () => { autoSaveToLocalStorage(engine); });
  }

  if (fogColor) {
    fogColor.addEventListener('input', () => {
      const colorHex = fogColor.value;
      if (engine.viewport.scene.fog) {
        (engine.viewport.scene.fog as THREE.FogExp2).color.set(colorHex);
      }
      engine.viewport.renderer.setClearColor(colorHex);
    });
    fogColor.addEventListener('change', () => { autoSaveToLocalStorage(engine); });
  }

  if (ambientSlider && ambientVal) {
    ambientSlider.addEventListener('input', () => {
      const intensity = parseFloat(ambientSlider.value);
      ambientVal.textContent = intensity.toFixed(2);
      engine.viewport.scene.traverse((obj) => {
        if ((obj as THREE.HemisphereLight).isHemisphereLight) {
          (obj as THREE.HemisphereLight).intensity = intensity;
        }
      });
    });
    ambientSlider.addEventListener('change', () => { autoSaveToLocalStorage(engine); });
  }

  // Physics play/pause toggle
  if (btnPausePhysics) {
    btnPausePhysics.addEventListener('click', () => {
      engine.physicsPaused = !engine.physicsPaused;
      btnPausePhysics.textContent = engine.physicsPaused ? 'RESUME PHYSICS' : 'PAUSE PHYSICS';
      btnPausePhysics.style.background = engine.physicsPaused ? 'rgba(239, 68, 68, 0.15)' : 'rgba(192, 132, 252, 0.1)';
      btnPausePhysics.style.borderColor = engine.physicsPaused ? '#ef4444' : 'var(--accent-purple)';
      btnPausePhysics.style.color = engine.physicsPaused ? '#ef4444' : 'var(--accent-purple)';
    });
  }

  // Time of Day (TOD) slider. Shadow direction follows `input` live (cheap); the sky
  // cube + PMREM IBL is re-baked on `change` (release) since it's a heavier operation.
  const applyTodToShadow = (hour: number) => {
    // 6h Sunrise, 12h Noon, 18h Sunset, 24h Midnight.
    const phi = THREE.MathUtils.degToRad(90 - Math.sin((hour - 6) / 12 * Math.PI) * 55);
    const theta = THREE.MathUtils.degToRad((hour / 24) * 360 - 90);
    const shadow = engine.viewport.shadow as unknown as { sunDir?: THREE.Vector3 };
    if (shadow && shadow.sunDir) {
      shadow.sunDir.setFromSphericalCoords(1, phi, theta).normalize();
    }
  };

  if (todSlider && todVal) {
    todSlider.addEventListener('input', () => {
      const hour = parseFloat(todSlider.value);
      const min = Math.round((hour % 1) * 60);
      const hStr = Math.floor(hour).toString().padStart(2, '0');
      const mStr = min.toString().padStart(2, '0');
      todVal.textContent = `${hStr}:${mStr}`;
      applyTodToShadow(hour);
    });
    // Re-bake the sky + image-based lighting when the slider is released so the
    // background and PBR reflections match the new sun position.
    todSlider.addEventListener('change', () => {
      const hour = parseFloat(todSlider.value);
      const phi = THREE.MathUtils.degToRad(90 - Math.sin((hour - 6) / 12 * Math.PI) * 55);
      const theta = THREE.MathUtils.degToRad((hour / 24) * 360 - 90);
      const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();
      engine.viewport.skyEnv.setSunDirection(dir, engine.viewport.scene);
      autoSaveToLocalStorage(engine);
    });
  }

  // Primitive Spawners (+ Box, + Sphere, Clear All)
  if (btnSpawnBox) {
    btnSpawnBox.addEventListener('click', () => {
      const fwd = new THREE.Vector3();
      const spawnPos = new THREE.Vector3();
      engine.viewport.camera.getWorldDirection(fwd);
      engine.worldOrigin.toWorldSpaceInto(spawnPos, engine.viewport.camera.position).addScaledVector(fwd, 4);
      spawnPos.y += 0.5;

      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'box',
        params: { hx: 0.5, hy: 0.5, hz: 0.5, dynamic: true, color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5).getHex() }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) {
            rb.mesh.name = `Box Object #${id}`;
            engine.gizmo.attach(rb);
          }
          updateOutliner(engine);
          updateInspector(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    });
  }

  if (btnSpawnSphere) {
    btnSpawnSphere.addEventListener('click', () => {
      const fwd = new THREE.Vector3();
      const spawnPos = new THREE.Vector3();
      engine.viewport.camera.getWorldDirection(fwd);
      engine.worldOrigin.toWorldSpaceInto(spawnPos, engine.viewport.camera.position).addScaledVector(fwd, 4);
      spawnPos.y += 0.5;

      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'sphere',
        params: { radius: 0.5, dynamic: true, color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5).getHex() }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) {
            rb.mesh.name = `Sphere Object #${id}`;
            engine.gizmo.attach(rb);
          }
          updateOutliner(engine);
          updateInspector(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    });
  }

  if (btnSpawnLight) {
    btnSpawnLight.addEventListener('click', () => {
      const fwd = new THREE.Vector3();
      const spawnPos = new THREE.Vector3();
      engine.viewport.camera.getWorldDirection(fwd);
      engine.worldOrigin.toWorldSpaceInto(spawnPos, engine.viewport.camera.position).addScaledVector(fwd, 4);
      spawnPos.y += 1.5;

      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'light',
        params: { lightType: 'point', color: 0xffd479, intensity: 15, distance: 25, decay: 1.8 }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) {
            rb.mesh.name = `Point Light #${id}`;
            engine.gizmo.attach(rb);
          }
          updateOutliner(engine);
          updateInspector(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    });
  }

  if (btnClearScene) {
    btnClearScene.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all spawned objects?')) {
        clearAllEntities(engine);
        updateOutliner(engine);
        updateInspector(engine);
        captureState(engine);
        autoSaveToLocalStorage(engine);
      }
    });
  }

  // Gizmo Mode selectors
  if (btnGizmoTranslate) {
    btnGizmoTranslate.addEventListener('click', () => {
      engine.gizmo.setMode('translate');
      setActiveGizmoBtn(btnGizmoTranslate);
    });
  }
  if (btnGizmoRotate) {
    btnGizmoRotate.addEventListener('click', () => {
      engine.gizmo.setMode('rotate');
      setActiveGizmoBtn(btnGizmoRotate);
    });
  }
  if (btnGizmoScale) {
    btnGizmoScale.addEventListener('click', () => {
      engine.gizmo.setMode('scale');
      setActiveGizmoBtn(btnGizmoScale);
    });
  }

  // Terrain Brush tools
  const brushTool = new TerrainBrushTool(engine);
  const paintTool = new TerrainPaintTool(engine);
  const splineTool = new TerrainSplineTool(engine);

  function setActiveTerrainBtn(activeBtn: HTMLElement) {
    [btnGizmoTranslate, btnGizmoRotate, btnGizmoScale, btnTerrainRaise, btnTerrainLower, btnTerrainSmooth, btnTerrainFlatten, btnTerrainTerrace, btnTerrainRamp, btnTerrainNoise, btnTerrainErode, btnTerrainPaint, btnTerrainSpline].forEach((btn) => {
      btn?.classList.remove('active');
    });
    activeBtn.classList.add('active');

    const isBrush = activeBtn !== btnTerrainSpline;
    if (terrainBrushSettings) terrainBrushSettings.style.display = isBrush ? 'flex' : 'none';
    if (terrainPaintLayer) terrainPaintLayer.style.display = activeBtn === btnTerrainPaint ? 'inline-block' : 'none';
    if (terrainSplineSettings) terrainSplineSettings.style.display = activeBtn === btnTerrainSpline ? 'flex' : 'none';
  }

  if (btnTerrainRaise) {
    btnTerrainRaise.addEventListener('click', () => {
      brushTool.brushOp = 'raise';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainRaise);
    });
  }
  if (btnTerrainLower) {
    btnTerrainLower.addEventListener('click', () => {
      brushTool.brushOp = 'lower';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainLower);
    });
  }
  if (btnTerrainSmooth) {
    btnTerrainSmooth.addEventListener('click', () => {
      brushTool.brushOp = 'smooth';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainSmooth);
    });
  }
  if (btnTerrainFlatten) {
    btnTerrainFlatten.addEventListener('click', () => {
      brushTool.brushOp = 'flatten';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainFlatten);
    });
  }
  if (btnTerrainTerrace) {
    btnTerrainTerrace.addEventListener('click', () => {
      brushTool.brushOp = 'terrace';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainTerrace);
    });
  }
  if (btnTerrainRamp) {
    btnTerrainRamp.addEventListener('click', () => {
      brushTool.brushOp = 'ramp';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainRamp);
    });
  }
  if (btnTerrainNoise) {
    btnTerrainNoise.addEventListener('click', () => {
      brushTool.brushOp = 'noise';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainNoise);
    });
  }
  if (btnTerrainErode) {
    btnTerrainErode.addEventListener('click', () => {
      brushTool.brushOp = 'erode';
      engine.tools.setActive(brushTool);
      setActiveTerrainBtn(btnTerrainErode);
    });
  }
  if (btnTerrainPaint) {
    btnTerrainPaint.addEventListener('click', () => {
      engine.tools.setActive(paintTool);
      setActiveTerrainBtn(btnTerrainPaint);
    });
  }
  if (btnTerrainSpline) {
    btnTerrainSpline.addEventListener('click', () => {
      engine.tools.setActive(splineTool);
      setActiveTerrainBtn(btnTerrainSpline);
    });
  }

  if (btnTerrainSplineApply) {
    btnTerrainSplineApply.addEventListener('click', () => {
      splineTool.apply();
    });
  }
  if (btnTerrainSplineClear) {
    btnTerrainSplineClear.addEventListener('click', () => {
      splineTool.clear();
    });
  }
  if (terrainSplineWidth) {
    terrainSplineWidth.addEventListener('input', () => {
      splineTool.radius = parseFloat(terrainSplineWidth.value);
    });
  }

  if (terrainRadius) {
    terrainRadius.addEventListener('input', () => {
      brushTool.settings.radius = parseFloat(terrainRadius.value);
      paintTool.settings.radius = brushTool.settings.radius;
    });
  }
  if (terrainStrength) {
    terrainStrength.addEventListener('input', () => {
      brushTool.settings.strength = parseFloat(terrainStrength.value);
      paintTool.settings.strength = brushTool.settings.strength;
    });
  }
  if (terrainHardness) {
    terrainHardness.addEventListener('input', () => {
      brushTool.settings.hardness = parseFloat(terrainHardness.value);
      paintTool.settings.hardness = brushTool.settings.hardness;
      splineTool.hardness = brushTool.settings.hardness;
    });
  }
  if (terrainTerraceStep) {
    terrainTerraceStep.addEventListener('input', () => {
      brushTool.settings.terraceStep = parseFloat(terrainTerraceStep.value);
    });
  }
  if (terrainErodeKind) {
    terrainErodeKind.addEventListener('change', () => {
      brushTool.settings.erodeKind = terrainErodeKind.value as any;
    });
  }
  if (terrainPaintLayer) {
    terrainPaintLayer.addEventListener('change', () => {
      paintTool.layer = parseInt(terrainPaintLayer.value, 10);
    });
  }

  if (btnToggleGrid) {
    btnToggleGrid.addEventListener('click', () => {
      ui.gridVisible = !ui.gridVisible;
      if (ui.gridHelper) ui.gridHelper.visible = ui.gridVisible;
      btnToggleGrid.textContent = ui.gridVisible ? 'Grid: ON' : 'Grid: OFF';
      btnToggleGrid.classList.toggle('active', ui.gridVisible);
    });
  }

  // ── Viewport zoom controls ────────────────────────────────────────────
  // The buttons call into `engine.zoomIn / zoomOut / zoomReset / frameAll` —
  // the same methods exposed on `engine.effects` and the AI bridge, so an IDE
  // prompt like "zoom in, then frame all" works the same way the toolbar does.
  btnZoomIn?.addEventListener('click', () => {
    engine.zoomIn();
    showToast('Zoomed in', 'info');
  });
  btnZoomOut?.addEventListener('click', () => {
    engine.zoomOut();
    showToast('Zoomed out', 'info');
  });
  btnZoomReset?.addEventListener('click', () => {
    engine.zoomReset();
    showToast('Camera reset to default view', 'info');
  });
  btnZoomFrame?.addEventListener('click', () => {
    engine.frameAll();
    const n = engine.sceneManager.rigidBodyList.length;
    showToast(n > 0 ? `Framed ${n} entities` : 'Nothing to frame', n > 0 ? 'success' : 'warn');
  });
  // Camera presets dropdown
  const cameraPresetSelect = dom.cameraPresetSelect as HTMLSelectElement | null;
  cameraPresetSelect?.addEventListener('change', () => {
    const id = cameraPresetSelect.value;
    if (!id) return;
    const ok = engine.applyCameraPreset(id);
    if (ok) {
      showToast(`Camera: ${engine.getCameraPreset(id)?.name ?? id}`, 'success');
    } else {
      showToast(`Unknown preset: ${id}`, 'warn');
    }
    // Reset dropdown to placeholder so same preset can be re-applied after manual camera move
    cameraPresetSelect.value = '';
  });
  // Sync dropdown highlight to current preset when cycled via keyboard / AI
  const syncPresetDropdown = () => {
    if (!cameraPresetSelect) return;
    // Keep placeholder unless we want to show active preset — placeholder is cleaner.
  };
  // Expose so Engine can nudge toast externally if needed
  (window as any).__mixPresetToast = (id: string) => showToast(`Camera: ${engine.getCameraPreset(id)?.name ?? id}`, 'success');
  // FX toggle: enables the post-FX chain (outline + vignette + film grain)
  // for an instant anime / cinematic look. Press again to disable.
  let postFxOn = false;
  btnTogglePostFx?.addEventListener('click', () => {
    postFxOn = !postFxOn;
    const p = engine.viewport.pipeline as any;
    if (p.outlinePass) p.outlinePass.enabled = postFxOn;
    if (p.vignettePass) p.vignettePass.enabled = postFxOn;
    if (p.filmGrainPass) p.filmGrainPass.enabled = postFxOn;
    if (p.chromaticAberrationPass) p.chromaticAberrationPass.enabled = postFxOn;
    if (p.colorGradePass) p.colorGradePass.enabled = postFxOn;
    btnTogglePostFx.classList.toggle('on', postFxOn);
    btnTogglePostFx.textContent = postFxOn ? 'FX: ON' : 'FX';
    if (postFxOn) {
      // Default-tweak the chain for a tasteful look out of the box.
      if (p.vignettePass) p.vignettePass.uniforms.intensity.value = 0.5;
      if (p.filmGrainPass) p.filmGrainPass.uniforms.amount.value = 0.05;
      if (p.outlinePass) {
        p.outlinePass.uniforms.thickness.value = 1.0;
        p.outlinePass.uniforms.depthThreshold.value = 0.02;
        p.outlinePass.uniforms.strength.value = 1.0;
      }
    }
    showToast(postFxOn ? 'Post-FX enabled' : 'Post-FX disabled', 'info');
  });

  engine.aiBridge.registerGridControls({
    setGrid: (config) => {
      if (config.visible !== undefined) {
        ui.gridVisible = config.visible;
        if (ui.gridHelper) ui.gridHelper.visible = ui.gridVisible;
        if (btnToggleGrid) {
          btnToggleGrid.textContent = ui.gridVisible ? 'Grid: ON' : 'Grid: OFF';
          btnToggleGrid.classList.toggle('active', ui.gridVisible);
        }
      }
      if (config.size !== undefined || config.divisions !== undefined || config.colorCenterLine !== undefined || config.colorGrid !== undefined) {
        const size = config.size ?? (ui.gridHelper ? (ui.gridHelper.geometry as any).parameters?.size ?? 100 : 100);
        const divisions = config.divisions ?? (ui.gridHelper ? (ui.gridHelper.geometry as any).parameters?.divisions ?? 100 : 100);

        let cCenter = 0x00f0ff;
        let cGrid = 0x22262b;
        if (config.colorCenterLine !== undefined) cCenter = new THREE.Color(config.colorCenterLine).getHex();
        if (config.colorGrid !== undefined) cGrid = new THREE.Color(config.colorGrid).getHex();

        if (ui.gridHelper) {
          engine.viewport.scene.remove(ui.gridHelper);
          ui.gridHelper.geometry.dispose();
          if (Array.isArray(ui.gridHelper.material)) ui.gridHelper.material.forEach((m: any) => m.dispose());
          else ui.gridHelper.material.dispose();
        }

        ui.gridHelper = new THREE.GridHelper(size, divisions, cCenter, cGrid);
        ui.gridHelper.position.y = 0.01;
        ui.gridHelper.visible = ui.gridVisible;
        engine.viewport.scene.add(ui.gridHelper);
      }
    },
    setSnap: (enabled, trans, rot) => {
      if (enabled !== undefined) snapEnabled = enabled;
      if (trans !== undefined) snapTranslateValue = trans;
      if (rot !== undefined) snapRotateValue = rot;
      updateSnapping();

      if (selSnapTranslate) selSnapTranslate.value = String(snapTranslateValue);
      if (selSnapRotate) selSnapRotate.value = String(snapRotateValue);
    },
    setGizmoMode: (mode) => {
      engine.gizmo.setMode(mode);
      if (mode === 'translate' && btnGizmoTranslate) setActiveGizmoBtn(btnGizmoTranslate);
      if (mode === 'rotate' && btnGizmoRotate) setActiveGizmoBtn(btnGizmoRotate);
      if (mode === 'scale' && btnGizmoScale) setActiveGizmoBtn(btnGizmoScale);
    }
  });

  function setActiveGizmoBtn(activeBtn: HTMLElement) {
    [btnGizmoTranslate, btnGizmoRotate, btnGizmoScale, btnTerrainRaise, btnTerrainLower, btnTerrainSmooth, btnTerrainFlatten, btnTerrainTerrace, btnTerrainRamp, btnTerrainNoise, btnTerrainErode].forEach((btn) => {
      btn?.classList.remove('active');
    });
    activeBtn.classList.add('active');
    if (terrainBrushSettings) terrainBrushSettings.style.display = 'none';
  }

  // Viewport keyboard hotkeys sync
  engine.addUpdateHook(() => {
    if (engine.input.mode === 'editor') {
      const mode = engine.gizmo.mode;
      if (mode === 'translate' && btnGizmoTranslate && !btnGizmoTranslate.classList.contains('active')) {
        setActiveGizmoBtn(btnGizmoTranslate);
      } else if (mode === 'rotate' && btnGizmoRotate && !btnGizmoRotate.classList.contains('active')) {
        setActiveGizmoBtn(btnGizmoRotate);
      } else if (mode === 'scale' && btnGizmoScale && !btnGizmoScale.classList.contains('active')) {
        setActiveGizmoBtn(btnGizmoScale);
      }
    }
  });

  // Global hotkeys (Focus Camera, Undo, Redo, Duplicate, Delete)
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      return;
    }

    if (engine.input.mode === 'editor') {
      if (e.code === 'KeyF') {
        e.preventDefault();
        focusCameraOnSelected(engine);
      }

      // Viewport zoom hotkeys (work anywhere in the editor — match the toolbar):
      //   +  / = → zoom in
      //   -  / _ → zoom out
      //   0      → reset camera
      //   Shift+F → frame all entities
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          engine.zoomIn();
        } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          engine.zoomOut();
        } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          engine.zoomReset();
        } else if (e.code === 'KeyF' && e.shiftKey) {
          e.preventDefault();
          engine.frameAll();
        }
      }

      // Ctrl + Z (Undo)
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (engine.tools.active?.id === 'terrain-brush') {
          engine.terrain.history.undo();
          try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch {}
        } else {
          performUndo(engine);
        }
      }

      // Ctrl + Y (Redo)
      if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (engine.tools.active?.id === 'terrain-brush') {
          engine.terrain.history.redo();
          try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch {}
        } else {
          performRedo(engine);
        }
      }

      // Ctrl + D (Duplicate)
      if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey)) {
        const activeRb = engine.gizmo.attached;
        if (activeRb) {
          const id = getEntityIdForRb(engine, activeRb);
          if (id !== null) {
            e.preventDefault();
            duplicateEntity(engine, id);
          }
        }
      }

      // Delete or Backspace
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const activeRb = engine.gizmo.attached;
        if (activeRb) {
          const id = getEntityIdForRb(engine, activeRb);
          if (id !== null) {
            e.preventDefault();
            deleteEntity(engine, id);
          }
        }
      }
    }
  });

  // Double-click on outliner content to focus camera
  if (outlinerContent) {
    outlinerContent.addEventListener('dblclick', (e) => {
      const node = (e.target as HTMLElement).closest('.tree-node');
      if (!node) return;
      focusCameraOnSelected(engine);
    });
  }

  // Possess selected button click
  if (btnViewPossess) {
    btnViewPossess.addEventListener('click', () => {
      const activeRb = engine.gizmo.attached;
      if (activeRb) {
        engine.input.setMode('play');
      } else {
        showToast('Select a character in Editor first, then click Possess.', 'warn');
      }
    });
  }

  // Search Outliner list
  if (outlinerSearch) {
    outlinerSearch.addEventListener('input', () => updateOutliner(engine));
  }

  // Inspector tabs
  if (tabInspTransform) {
    tabInspTransform.addEventListener('click', () => {
      tabInspTransform.classList.add('active');
      tabInspPhysics?.classList.remove('active');
      tabInspMaterial?.classList.remove('active');
      tabInspTweens?.classList.remove('active');
      ui.activeInspectorTab = 'transform';
      updateInspector(engine);
    });
  }
  if (tabInspPhysics) {
    tabInspPhysics.addEventListener('click', () => {
      tabInspPhysics.classList.add('active');
      tabInspTransform?.classList.remove('active');
      tabInspMaterial?.classList.remove('active');
      tabInspTweens?.classList.remove('active');
      ui.activeInspectorTab = 'physics';
      updateInspector(engine);
    });
  }
  if (tabInspMaterial) {
    tabInspMaterial.addEventListener('click', () => {
      tabInspMaterial.classList.add('active');
      tabInspTransform?.classList.remove('active');
      tabInspPhysics?.classList.remove('active');
      tabInspTweens?.classList.remove('active');
      ui.activeInspectorTab = 'material';
      updateInspector(engine);
    });
  }
  if (tabInspTweens) {
    tabInspTweens.addEventListener('click', () => {
      tabInspTweens.classList.add('active');
      tabInspTransform?.classList.remove('active');
      tabInspPhysics?.classList.remove('active');
      tabInspMaterial?.classList.remove('active');
      ui.activeInspectorTab = 'tweens';
      updateInspector(engine);
    });
  }

  // Preset tabs (+ Packs — the Retarget Pro studio)
  const tabPacks = document.getElementById('tab-packs') as HTMLButtonElement | null;
  const activatePresetTab = (which: 'characters' | 'animations' | 'packs') => {
    tabChars?.classList.toggle('active', which === 'characters');
    tabAnims?.classList.toggle('active', which === 'animations');
    tabPacks?.classList.toggle('active', which === 'packs');
    ui.activePresetTab = which;
    renderPresetsTab(engine);
  };
  if (tabChars) tabChars.addEventListener('click', () => activatePresetTab('characters'));
  if (tabAnims) tabAnims.addEventListener('click', () => activatePresetTab('animations'));
  if (tabPacks) tabPacks.addEventListener('click', () => activatePresetTab('packs'));

  // Allow packs panel to request a live refresh (after scan / import / delete)
  (window as any).mixRefreshPresets = () => renderPresetsTab(engine);
  window.addEventListener('mix:refresh-presets', () => renderPresetsTab(engine));

  // Animations play triggers
  if (presetsContentArea) {
    presetsContentArea.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('.anim-btn');
      if (!btn) return;
      const animId = btn.getAttribute('data-anim-id');
      if (!animId) return;

      const selectedRb = engine.gizmo.attached;
      if (!selectedRb) {
        showToast('Select a spawned character in the Outliner / Viewport first to preview animations.', 'warn');
        return;
      }

      // Find state machine
      const asm = engine.findAnimationStateMachine(selectedRb);
      if (!asm) {
        showToast('Selected object is not a valid preset character.', 'warn');
        return;
      }

      try {
        await engine.manifest.preload([animId]);
        const clips = engine.assetCache.getAnimations(animId);
        if (clips.length > 0) {
          if (!asm.hasAnimation(animId)) {
            asm.addAnimation(animId, clips[0]);
          }
          const currentEntry = (asm as unknown as { current: { name: string } | null }).current;
          if (currentEntry && currentEntry.name === animId) {
            const action = (asm as unknown as { anims: Map<string, { action: any }> }).anims.get(animId)?.action;
            if (action) {
              action.reset().play();
              if ('resampleBaseline' in asm) {
                (asm as any).resampleBaseline();
              }
            }
          } else {
            asm.transition(animId, 0.25);
          }
        }
      } catch (err) {
        console.error('[MIX Engine] Preview failed:', err);
      }
    });
  }

  // Bottom drawer tabs
  if (btnMixCopilot) {
    btnMixCopilot.addEventListener('click', () => {
      // Reuse the existing AI drawer so the Copilot stays alongside the live HELM console.
      tabDrawerAi?.click();
      const workspace = document.getElementById('editor-container');
      const compact = workspace?.classList.contains('workspace-compact') === true;
      const hidden = compact
        ? !workspace?.classList.contains('compact-bottom-open')
        : workspace?.classList.contains('bottom-panel-collapsed') === true;
      if (hidden) document.getElementById('layout-toggle-bottom')?.click();
      document.getElementById('mix-copilot-goal')?.scrollIntoView({ block: 'nearest' });
    });
  }
  if (tabDrawerAi) {
    tabDrawerAi.addEventListener('click', () => {
      tabDrawerAi.classList.add('active');
      tabDrawerAssets?.classList.remove('active');
      tabDrawerGames?.classList.remove('active');
      tabDrawerConsole?.classList.remove('active');
      tabDrawerTweens?.classList.remove('active');
      ui.activeDrawerTab = 'ai';
      renderDrawerTab(engine);
    });
  }
  if (tabDrawerAssets) {
    tabDrawerAssets.addEventListener('click', () => {
      tabDrawerAssets.classList.add('active');
      tabDrawerAi?.classList.remove('active');
      tabDrawerGames?.classList.remove('active');
      tabDrawerConsole?.classList.remove('active');
      tabDrawerTweens?.classList.remove('active');
      ui.activeDrawerTab = 'assets';
      renderDrawerTab(engine);
    });
  }
  if (tabDrawerGames) {
    tabDrawerGames.addEventListener('click', () => {
      tabDrawerGames.classList.add('active');
      tabDrawerAi?.classList.remove('active');
      tabDrawerAssets?.classList.remove('active');
      tabDrawerConsole?.classList.remove('active');
      tabDrawerTweens?.classList.remove('active');
      ui.activeDrawerTab = 'games';
      renderDrawerTab(engine);
    });
  }
  if (tabDrawerConsole) {
    tabDrawerConsole.addEventListener('click', () => {
      tabDrawerConsole.classList.add('active');
      tabDrawerAi?.classList.remove('active');
      tabDrawerAssets?.classList.remove('active');
      tabDrawerGames?.classList.remove('active');
      tabDrawerTweens?.classList.remove('active');
      ui.activeDrawerTab = 'console';
      renderDrawerTab(engine);
    });
  }
  if (tabDrawerTweens) {
    tabDrawerTweens.addEventListener('click', () => {
      tabDrawerTweens.classList.add('active');
      tabDrawerAi?.classList.remove('active');
      tabDrawerAssets?.classList.remove('active');
      tabDrawerGames?.classList.remove('active');
      tabDrawerConsole?.classList.remove('active');
      ui.activeDrawerTab = 'tweens';
      renderDrawerTab(engine);
    });
  }

  // SVG Uploader Extruder Setup
  if (svgDropZone) {
    // Hidden file input
    const fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = '.svg';
    fileInp.style.display = 'none';
    document.body.appendChild(fileInp);

    svgDropZone.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', () => {
      const file = fileInp.files?.[0];
      if (file) handleSvgFile(file);
    });

    // Drag-over upload
    svgDropZone.addEventListener('dragover', (e) => e.preventDefault());
    svgDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) handleSvgFile(file);
    });
  }

  function handleSvgFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedSvgText = e.target?.result as string;
      if (svgDropZone) {
        svgDropZone.querySelector('span:last-child')!.textContent = `Loaded: ${file.name}`;
        svgDropZone.style.borderColor = 'var(--accent-green)';
        svgDropZone.style.color = 'var(--accent-green)';
      }
    };
    reader.readAsText(file);
  }

  // Extrude button click
  if (btnExtrude) {
    btnExtrude.addEventListener('click', () => {
      const depthVal = parseFloat(extruderDepth ? extruderDepth.value : '10');
      const uvVal = parseFloat(extruderUv ? extruderUv.value : '1');
      const svgText = uploadedSvgText || DEFAULT_SVG;

      // Spawn in front of the camera
      const fwd = new THREE.Vector3();
      const spawnPos = new THREE.Vector3();
      const cam = engine.viewport.camera;
      cam.getWorldDirection(fwd);
      engine.worldOrigin.toWorldSpaceInto(spawnPos, cam.position).addScaledVector(fwd, 6);
      spawnPos.y = depthVal / 2; // Center physics box

      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'extrusion',
        params: {
          svgText,
          depth: depthVal,
          uvScale: uvVal,
          color: new THREE.Color().setHSL(Math.random(), 0.15, 0.45).getHex()
        }
      }, {
        onSpawned: () => {
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    });
  }

  // Hook detach/reattach viewport buttons
  if (btnDetachViewport) {
    btnDetachViewport.addEventListener('click', () => {
      detachViewport(engine);
    });
  }
  if (btnReattachViewport) {
    btnReattachViewport.addEventListener('click', () => {
      reattachViewport(engine);
    });
  }

  // --- New LLM IDE Menu Bar Actions ---
  if (btnExportJson) {
    btnExportJson.addEventListener('click', () => {
      const state = serializeSceneState(engine);
      const blob = new Blob([state], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scene_export.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Scene exported to JSON.', 'success');
    });
  }
  if (btnImportJson && btnImportJsonFile) {
    btnImportJson.addEventListener('click', () => {
      btnImportJsonFile.click();
    });
    btnImportJsonFile.addEventListener('change', () => {
      const file = btnImportJsonFile.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const stateStr = e.target?.result as string;
          deserializeSceneState(engine, stateStr);
          captureState(engine);
          autoSaveToLocalStorage(engine);
          showToast('Scene imported successfully.', 'success');
        } catch (err) {
          showToast('Failed to import JSON scene.', 'error');
        }
      };
      reader.readAsText(file);
      btnImportJsonFile.value = ''; // clear
    });
  }
  if (btnDuplicateEntityMenu) {
    btnDuplicateEntityMenu.addEventListener('click', () => {
      const rb = engine.gizmo.attached;
      if (rb) {
        const id = getEntityIdForRb(engine, rb);
        if (id !== null) duplicateEntity(engine, id);
      } else {
        showToast('Select an entity to duplicate first.', 'warn');
      }
    });
  }
  if (btnDeleteEntityMenu) {
    btnDeleteEntityMenu.addEventListener('click', () => {
      const rb = engine.gizmo.attached;
      if (rb) {
        const id = getEntityIdForRb(engine, rb);
        if (id !== null) deleteEntity(engine, id);
      } else {
        showToast('Select an entity to delete first.', 'warn');
      }
    });
  }
  if (btnGenTerrainLlm) {
    btnGenTerrainLlm.addEventListener('click', () => {
      if (tabDrawerAi) tabDrawerAi.click(); // Open AI console
      const inp = document.getElementById('ai-prompt-input') as HTMLInputElement;
      if (inp) {
        inp.value = 'generate a hilly terrain using procedural noise';
        inp.focus();
        showToast('Press Enter in the AI terminal to execute.', 'info');
      }
    });
  }
  if (btnCycleTod) {
    btnCycleTod.addEventListener('click', () => {
      if (todSlider) {
        let val = parseFloat(todSlider.value) + 6;
        if (val > 24) val -= 24;
        todSlider.value = String(val);
        todSlider.dispatchEvent(new Event('input'));
        showToast(`Time of day set to ${val}:00`, 'info');
      }
    });
  }
  if (btnLlmGuide) {
    btnLlmGuide.addEventListener('click', () => {
      showToast('Opening LLM Prompting Guide...', 'info');
      // Simulated link opening
      window.open('https://example.com/llm-prompt-guide', '_blank');
    });
  }
  if (btnApiRef) {
    btnApiRef.addEventListener('click', () => {
      showToast('Opening MIX Engine API Reference...', 'info');
      window.open('https://example.com/mix-api-reference', '_blank');
    });
  }


  // Feature Hub Modal
  if (btnFeatureHub && featureHubModalContainer) {
    btnFeatureHub.addEventListener('click', () => {
      featureHubModalContainer.style.display = 'block';
      featureHubModalContainer.innerHTML = renderFeatureHubModal(engine);
      hookFeatureHubEvents(engine, featureHubModalContainer);
    });
  }

  // Settings Modal Logic
  if (btnSettings && settingsModal) {
    btnSettings.addEventListener('click', () => {
      // Fetch Blender path from API and populate input
      fetch('/api/blender-path')
        .then(res => res.json())
        .then(data => {
          if (settingsBlenderPath) {
            settingsBlenderPath.value = data.blenderPath || localStorage.getItem('mix_blender_path') || '';
          }
        })
        .catch(err => {
          console.warn('[settings] failed to fetch from backend, fallback to localStorage', err);
          if (settingsBlenderPath) {
            settingsBlenderPath.value = localStorage.getItem('mix_blender_path') || '';
          }
        });
      settingsModal.classList.add('visible');
    });
  }

  const closeSettings = () => {
    if (settingsModal) {
      settingsModal.classList.remove('visible');
    }
  };

  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
  if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettings);

  if (btnSaveSettings && settingsBlenderPath) {
    btnSaveSettings.addEventListener('click', () => {
      const bPath = settingsBlenderPath.value.trim();

      // Save locally first
      if (bPath) {
        localStorage.setItem('mix_blender_path', bPath);
      } else {
        localStorage.removeItem('mix_blender_path');
      }

      // Save to backend
      fetch('/api/blender-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blenderPath: bPath })
      })
      .then(res => res.json())
      .then(data => {
        showToast('Settings saved successfully.', 'success');
        closeSettings();
      })
      .catch(err => {
        console.error('[settings] failed to save to backend', err);
        showToast('Saved locally, but server sync failed.', 'warn');
        closeSettings();
      });
    });
  }

  // Pre-fetch blender path on startup to sync local storage
  fetch('/api/blender-path')
    .then(res => res.json())
    .then(data => {
      if (data.blenderPath) {
        localStorage.setItem('mix_blender_path', data.blenderPath);
      } else {
        localStorage.removeItem('mix_blender_path');
      }
    })
    .catch(() => {});

  // Esc returns from the maximized viewport to the editor layout (but let the OS
  // fullscreen exit win first if we're in real fullscreen).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isViewportSoloed() && !document.fullscreenElement) {
      e.preventDefault();
      reattachViewport(engine);
    }
  });
}
