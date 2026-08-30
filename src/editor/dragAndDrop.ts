import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { container, presetsContentArea } from './dom';
import { ui } from './state';
import { captureState, autoSaveToLocalStorage } from './sceneIO';
import { updateOutliner } from './outliner';

// --- Drag and Drop implementation ------------------------------------------
// The armed asset kind/id live in the shared `ui` state so BOTH the preset-card
// dragstart (here) and the bottom-drawer asset-item dragstart (panels) can arm a
// viewport drop. Browser security gates dataTransfer.getData() during dragover, so the
// kind MUST be set at dragstart time — hence the shared scope.
let previewMesh: THREE.Object3D | null = null;
/** True when the preview checked out a shared GLB from the AssetCache (refcounted). */
let previewUsedAssetCheckout = false;
let previewAssetId: string | null = null;

export function setupDragAndDrop(engine: Engine): void {
  const canvas = container!.querySelector('canvas');
  if (!canvas) return;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Track presets list dragstart
  if (presetsContentArea) {
    presetsContentArea.addEventListener('dragstart', (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('.character-card');
      if (!target) return;

      ui.draggedKind = 'character';
      ui.draggedAssetId = target.getAttribute('data-asset-id');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', ui.draggedAssetId || '');
      }

      createDragPreview(engine);
    });
  }

  // Create holographic ghost preview.
  // For characters we checkout a shared GLB clone (geometry shared with the canonical),
  // so cleanup must NOT dispose that geometry — only the wireframe materials we swap in,
  // and it MUST release the refcount. Procedural placeholders own their geometry.
  function createDragPreview(engine: Engine): void {
    if (!ui.draggedAssetId && !ui.draggedKind) return;
    previewMesh = new THREE.Group();
    previewUsedAssetCheckout = false;
    previewAssetId = null;

    if ((ui.draggedKind === 'character' || ui.draggedKind === 'model') && ui.draggedAssetId) {
      try {
        const model = engine.assetCache.checkout(ui.draggedAssetId);
        previewUsedAssetCheckout = true;
        previewAssetId = ui.draggedAssetId;
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = false;
            // Swap in a unique wireframe material (the shared original stays on the canonical).
            (o as THREE.Mesh).material = new THREE.MeshBasicMaterial({
              color: 0x00f0ff,
              transparent: true,
              opacity: 0.4,
              wireframe: true
            });
          }
        });
        if (ui.draggedKind === 'character') {
          model.position.set(0, -0.9, 0); // Align feet
        } else {
          model.position.set(0, 0, 0);
        }
        previewMesh.add(model);
      } catch (err) {
        console.warn(err);
        // Checkout failed (asset not loaded) — fall back to a capsule placeholder so the
        // drag still gives feedback instead of silently doing nothing.
        const cap = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
          new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.4 })
        );
        cap.position.y = 0.9;
        previewMesh.add(cap);
        previewUsedAssetCheckout = false;
      }
    } else if (ui.draggedKind === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5), new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true }));
      trunk.position.y = 0.75;
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true }));
      leaves.position.y = 1.6;
      previewMesh.add(trunk, leaves);
    } else if (ui.draggedKind === 'rock') {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8), new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true }));
      rock.position.y = 0.5;
      previewMesh.add(rock);
    } else if (ui.draggedKind === 'drone') {
      const drone = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true }));
      drone.position.y = 1.2;
      previewMesh.add(drone);
    }

    previewMesh.visible = false;
    engine.viewport.scene.add(previewMesh);
  }

  const getIntersectionPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    mouse.x = (x / rect.width) * 2 - 1;
    mouse.y = -(y / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, engine.viewport.camera);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, target)) {
      return target;
    }
    return null;
  };

  // Canvas dragover
  canvas.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();

    // Lazily build the preview the first time a drag enters the canvas. For bottom-drawer
    // asset items, draggedKind is set at their dragstart (shared state); for preset cards
    // it's set + preview built immediately. We can't read dataTransfer here (gated), so
    // we rely on the dragstart-time assignment.
    if (ui.draggedKind && !previewMesh) {
      createDragPreview(engine);
    }

    if (!previewMesh) return;
    const hit = getIntersectionPoint(e.clientX, e.clientY);
    if (hit) {
      previewMesh.position.copy(hit);
      previewMesh.visible = true;
    }
  });

  canvas.addEventListener('dragleave', () => {
    if (previewMesh) previewMesh.visible = false;
  });

  canvas.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    const hit = getIntersectionPoint(e.clientX, e.clientY);
    if (!hit) {
      cleanupDragPreview(engine);
      return;
    }

    const spawnPos = hit.clone();

    if (ui.draggedKind === 'character' && ui.draggedAssetId) {
      spawnPos.y += 1.0;
      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'character',
        params: { assetId: ui.draggedAssetId }
      }, {
        rootMotion: true,
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) engine.gizmo.attach(rb);
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    } else if (ui.draggedKind === 'model' && ui.draggedAssetId) {
      const assetId = ui.draggedAssetId;
      let yOffset = 0;
      let randScale = 1.0;
      let randRotY = 0;

      if (ui.randomizeSpawnScale) {
        randScale = 0.75 + Math.random() * 0.5; // 0.75 to 1.25 (±25%)
      }
      if (ui.randomizeSpawnRotation) {
        randRotY = Math.random() * Math.PI * 2;
      }

      try {
        const cachedModel = engine.assetCache.checkout(assetId);
        const box = new THREE.Box3().setFromObject(cachedModel);
        yOffset = -box.min.y * randScale;
      } catch (e) {
        // Fallback
      }
      spawnPos.y += yOffset;

      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'glbInstance',
        params: { assetId, dynamic: false, scale: randScale }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) {
            rb.mesh.name = assetId;

            // Set rotation
            if (ui.randomizeSpawnRotation) {
              rb.mesh.rotation.y = randRotY;
            }

            // Sync to Rapier physics
            rb.teleport(rb.mesh.position, rb.mesh.quaternion);
            rb.syncToPhysics();

            engine.gizmo.attach(rb);
          }
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    } else if (ui.draggedKind === 'tree') {
      // Spawn procedural tree box
      spawnPos.y += 1.25;
      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'box',
        params: { hx: 0.4, hy: 1.25, hz: 0.4, dynamic: false, color: 0x2e7d32 }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) rb.mesh.name = 'Procedural Pine Tree';
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    } else if (ui.draggedKind === 'rock') {
      spawnPos.y += 0.5;
      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'sphere',
        params: { radius: 0.6, dynamic: true, color: 0x4f4f4f }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) rb.mesh.name = 'Boulder Rock';
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    } else if (ui.draggedKind === 'drone') {
      spawnPos.y += 1.2;
      engine.sceneManager.requestSpawn(spawnPos, {
        kind: 'sphere',
        params: { radius: 0.35, dynamic: true, color: 0x7b1fa2 }
      }, {
        onSpawned: (id) => {
          const rb = engine.sceneManager.getRigidBody(id);
          if (rb) rb.mesh.name = 'Hovering Drone';
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        }
      });
    }

    cleanupDragPreview(engine);
  });

  document.addEventListener('dragend', () => {
    cleanupDragPreview(engine);
  });
}

/**
 * Tear down the drag preview. CRITICAL: when the preview checked out a shared GLB,
 * its geometry is shared with the canonical AssetCache entry — disposing it would
 * corrupt every live instance of that character. So we only dispose the unique
 * wireframe materials we swapped in, never the shared geometry, and we release the
 * refcount so the canonical can be freed when the last real user releases.
 */
export function cleanupDragPreview(engine: Engine): void {
  if (previewMesh) {
    previewMesh.removeFromParent();
    previewMesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      // Dispose the wireframe materials we swapped in (all preview materials are
      // preview-local MeshBasicMaterials — the shared canonical materials were never
      // replaced on the canonical, only on this clone).
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) (m as THREE.Material | undefined)?.dispose();
      // Only dispose geometry for PROCEDURAL placeholders — asset-checkout geometry is
      // shared by reference with the canonical and must NOT be freed here.
      if (!previewUsedAssetCheckout) mesh.geometry?.dispose();
    });
    previewMesh = null;
  }
  // Release the AssetCache refcount we bumped at checkout.
  if (previewUsedAssetCheckout && previewAssetId) {
    engine.assetCache.release(previewAssetId);
  }
  previewUsedAssetCheckout = false;
  previewAssetId = null;
  ui.draggedAssetId = null;
  ui.draggedKind = null;
}
