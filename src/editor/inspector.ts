import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { escapeHtml, showToast } from '../ui/domUtils';
import { inspectorContent } from './dom';
import { ui } from './state';
import { getAssetId, getEntityIdForRb } from './sceneHelpers';
import { updateOutliner } from './outliner';
import { captureState, autoSaveToLocalStorage, duplicateEntity, deleteEntity } from './sceneIO';
import { renderTweenDirectorPanel } from './tweenDirectorPanel';

/**
 * Light-weight in-place refresh of the inspector's transform input values while the
 * gizmo drags — avoids rebuilding innerHTML (and losing focus / reflowing) every frame.
 */
export function refreshInspectorValues(engine: Engine): void {
  if (ui.activeInspectorTab !== 'transform' || !inspectorContent) return;
  const rb = engine.gizmo.attached;
  if (!rb) return;
  const inputs = inspectorContent.querySelectorAll<HTMLInputElement>('.inspect-transform-input');
  if (inputs.length === 0) return; // inspector not on the transform tab / not built
  const pos = rb.mesh.position;
  const rot = rb.mesh.rotation;
  const scale = rb.mesh.scale;
  inputs.forEach((input) => {
    const field = input.getAttribute('data-field');
    const axis = input.getAttribute('data-axis') as 'x' | 'y' | 'z';
    if (document.activeElement === input) return; // don't clobber a value the user is editing
    if (field === 'pos') input.value = pos[axis].toFixed(2);
    else if (field === 'rot') input.value = THREE.MathUtils.radToDeg(rot[axis]).toFixed(0);
    else if (field === 'scale') input.value = scale[axis].toFixed(2);
  });
}

// --- Component Inspector render and bindings --------------------------------
export function updateInspector(engine: Engine): void {
  if (!inspectorContent) return;

  const selectedRb = engine.gizmo.attached;
  if (!selectedRb) {
    inspectorContent.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:10px;padding-top:30px;">Select an object in Outliner or Viewport to inspect properties</div>`;
    return;
  }

  const pos = selectedRb.mesh.position;
  const rot = selectedRb.mesh.rotation;
  const scale = selectedRb.mesh.scale;
  const body = selectedRb.rapierBody;
  const isKinematic = body.isKinematic();
  const isFixed = body.isFixed();
  let bodyTypeString = 'dynamic';
  if (isFixed) bodyTypeString = 'fixed';
  else if (isKinematic) bodyTypeString = 'kinematic';

  const actionButtonsHtml = `
    <div class="form-group" style="margin-top:14px; display:flex; gap:6px;">
      <button class="btn-secondary" id="btn-inspect-duplicate" style="flex:1; border-color:var(--accent-purple); color:var(--accent-purple);" title="Duplicate (Ctrl+D)">Duplicate</button>
      <button class="btn-secondary" id="btn-inspect-delete" style="flex:1; border-color:#ef4444; color:#ef4444;" title="Delete (Del)">Delete</button>
    </div>
  `;

  if (ui.activeInspectorTab === 'transform') {
    const sm = engine.sceneManager;
    const entityId = getEntityIdForRb(engine, selectedRb);
    const parentId = entityId !== null ? sm.getParent(entityId) : undefined;

    // Build options for all other entities in the scene
    let parentOptionsHtml = `<option value="">None (Root)</option>`;
    if (entityId !== null) {
      const allIds = sm.allEntityIds();
      for (const id of allIds) {
        if (id === entityId) continue; // Cannot parent to itself!

        // Prevent cyclic parenting
        let isAncestor = false;
        let curr: number | undefined = id;
        while (curr !== undefined) {
          const p: number | undefined = sm.getParent(curr);
          if (p === entityId) {
            isAncestor = true;
            break;
          }
          curr = p;
        }
        if (isAncestor) continue;

        const otherRb = sm.getRigidBody(id);
        const otherBprint = sm.getBlueprint(id);
        if (!otherRb || !otherBprint) continue;

        let otherName = otherRb.mesh.name || `${otherBprint.kind} #${id}`;
        if (otherBprint.kind === 'light') {
          const lightType = String(otherBprint.params.lightType ?? 'point');
          otherName = `${lightType.toUpperCase()} Light #${id}`;
        }
        const isSelected = parentId === id ? 'selected' : '';
        parentOptionsHtml += `<option value="${id}" ${isSelected}>${escapeHtml(otherName)}</option>`;
      }
    }

    inspectorContent.innerHTML = `
      <div class="form-group">
        <label>POSITION (X, Y, Z)</label>
        <div class="form-row">
          <input type="number" class="form-control-input inspect-transform-input" data-field="pos" data-axis="x" value="${pos.x.toFixed(2)}" step="0.1" />
          <input type="number" class="form-control-input inspect-transform-input" data-field="pos" data-axis="y" value="${pos.y.toFixed(2)}" step="0.1" />
          <input type="number" class="form-control-input inspect-transform-input" data-field="pos" data-axis="z" value="${pos.z.toFixed(2)}" step="0.1" />
        </div>
      </div>
      <div class="form-group">
        <label>ROTATION (YAW/PITCH/ROLL)</label>
        <div class="form-row">
          <input type="number" class="form-control-input inspect-transform-input" data-field="rot" data-axis="x" value="${THREE.MathUtils.radToDeg(rot.x).toFixed(0)}" step="5" />
          <input type="number" class="form-control-input inspect-transform-input" data-field="rot" data-axis="y" value="${THREE.MathUtils.radToDeg(rot.y).toFixed(0)}" step="5" />
          <input type="number" class="form-control-input inspect-transform-input" data-field="rot" data-axis="z" value="${THREE.MathUtils.radToDeg(rot.z).toFixed(0)}" step="5" />
        </div>
      </div>
      <div class="form-group">
        <label>SCALE (X, Y, Z)</label>
        <div class="form-row">
          <input type="number" class="form-control-input inspect-transform-input" data-field="scale" data-axis="x" value="${scale.x.toFixed(2)}" step="0.1" />
          <input type="number" class="form-control-input inspect-transform-input" data-field="scale" data-axis="y" value="${scale.y.toFixed(2)}" step="0.1" />
          <input type="number" class="form-control-input inspect-transform-input" data-field="scale" data-axis="z" value="${scale.z.toFixed(2)}" step="0.1" />
        </div>
      </div>
      <div class="form-group">
        <label>PARENT ENTITY</label>
        <select class="form-control-select" id="inspect-parent-entity">
          ${parentOptionsHtml}
        </select>
      </div>
      ${actionButtonsHtml}
    `;

    // Hook inputs
    inspectorContent.querySelectorAll('.inspect-transform-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const field = target.getAttribute('data-field');
        const axis = target.getAttribute('data-axis') as 'x' | 'y' | 'z';
        const val = parseFloat(target.value);

        if (field === 'pos') {
          pos[axis] = val;
          selectedRb.teleport(pos, selectedRb.mesh.quaternion);
        } else if (field === 'rot') {
          const deg = THREE.MathUtils.degToRad(val);
          rot[axis] = deg;
          selectedRb.teleport(pos, new THREE.Quaternion().setFromEuler(rot));
        } else if (field === 'scale') {
          scale[axis] = val;
          // Rebuild the collider to match the new visual scale (box/sphere/extrusion).
          // Rapier colliders are size-immutable, so rescaleCollider removes + recreates.
          selectedRb.rescaleCollider();
          selectedRb.syncToPhysics();
        }
        captureState(engine);
        autoSaveToLocalStorage(engine);
      });
    });

    const selParent = document.getElementById('inspect-parent-entity') as HTMLSelectElement;
    if (selParent) {
      selParent.addEventListener('change', () => {
        if (entityId === null) return;
        const val = selParent.value;
        const newParentId = val ? parseInt(val, 10) : null;
        sm.parentEntity(entityId, newParentId);
        captureState(engine);
        autoSaveToLocalStorage(engine);
        updateOutliner(engine);
      });
    }

  } else if (ui.activeInspectorTab === 'physics') {
    // Physics Tab
    inspectorContent.innerHTML = `
      <div class="form-group">
        <label>BODY TYPE</label>
        <select class="form-control-select" id="inspect-body-type">
          <option value="dynamic" ${bodyTypeString === 'dynamic' ? 'selected' : ''}>Dynamic</option>
          <option value="fixed" ${bodyTypeString === 'fixed' ? 'selected' : ''}>Static</option>
          <option value="kinematic" ${bodyTypeString === 'kinematic' ? 'selected' : ''}>Kinematic</option>
        </select>
      </div>
      <div class="form-group">
        <label>ADDITIONAL MASS (KG) — TOTAL: ${body.mass().toFixed(1)}</label>
        <input type="number" class="form-control-input" id="inspect-mass" value="${selectedRb.additionalMass.toFixed(1)}" step="1" />
      </div>
      <div class="form-group" style="margin-top:14px">
        <button class="btn-secondary" id="btn-inspect-copy-json">Copy Coordinates to IDE</button>
      </div>
      ${actionButtonsHtml}
    `;

    // Hook physics updates
    const selBodyType = document.getElementById('inspect-body-type') as HTMLSelectElement;
    if (selBodyType) {
      selBodyType.addEventListener('change', () => {
        const R = engine.physicsWorld.RAPIER;
        const val = selBodyType.value;
        if (val === 'dynamic') body.setBodyType(R.RigidBodyType.Dynamic, true);
        else if (val === 'fixed') body.setBodyType(R.RigidBodyType.Fixed, true);
        else if (val === 'kinematic') body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
        captureState(engine);
        autoSaveToLocalStorage(engine);
      });
    }

    const inpMass = document.getElementById('inspect-mass') as HTMLInputElement;
    if (inpMass) {
      inpMass.addEventListener('change', () => {
        const val = parseFloat(inpMass.value);
        // Use the component helper so the tracked additionalMass field stays in sync
        // with the body (body.mass() returns collider+additional — not settable directly).
        selectedRb.setAdditionalMass(val);
        captureState(engine);
        autoSaveToLocalStorage(engine);
        updateInspector(engine); // refresh the "TOTAL" readout in the label
      });
    }

    const btnCopyJson = document.getElementById('btn-inspect-copy-json');
    if (btnCopyJson) {
      btnCopyJson.addEventListener('click', () => {
        const data = {
          entityId: getEntityIdForRb(engine, selectedRb),
          assetId: getAssetId(selectedRb),
          position: { x: pos.x, y: pos.y, z: pos.z },
          rotation: { x: rot.x, y: rot.y, z: rot.z },
          bodyType: bodyTypeString,
          additionalMass: selectedRb.additionalMass,
          totalMass: body.mass(),
        };
        navigator.clipboard.writeText(JSON.stringify(data, null, 2))
          .then(() => showToast('Entity data copied to clipboard — paste into your IDE.', 'success'))
          .catch(() => showToast('Failed to copy to clipboard.', 'error'));
      });
    }
  } else if (ui.activeInspectorTab === 'tweens') {
    renderTweenDirectorPanel(engine, inspectorContent);
  } else {
    // Material / Lighting Tab
    const entityId = getEntityIdForRb(engine, selectedRb);
    const blueprint = entityId !== null ? engine.sceneManager.getBlueprint(entityId) : null;

    if (!blueprint) {
      inspectorContent.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:10px;padding-top:30px;">Material properties not editable for this entity type.</div>`;
      return;
    }

    // Typed view over the dynamic blueprint-params bag (it's Record<string, unknown>).
    const p = blueprint.params as {
      lightType?: string; color?: THREE.ColorRepresentation; intensity?: number;
      distance?: number; decay?: number; roughness?: number; metalness?: number;
      emissive?: THREE.ColorRepresentation; emissiveIntensity?: number;
    };

    if (blueprint.kind === 'light') {
      const lightType = p.lightType ?? 'point';
      const colorHex = '#' + new THREE.Color(p.color).getHexString();
      const intensity = p.intensity ?? 15;
      const distance = p.distance ?? 25;
      const decay = p.decay ?? 1.8;

      inspectorContent.innerHTML = `
        <div class="form-group">
          <label>LIGHT TYPE</label>
          <select class="form-control-select" id="inspect-light-type">
            <option value="point" ${lightType === 'point' ? 'selected' : ''}>Point Light</option>
            <option value="spot" ${lightType === 'spot' ? 'selected' : ''}>Spot Light</option>
          </select>
        </div>
        <div class="form-group">
          <label>LIGHT COLOR</label>
          <input type="color" id="inspect-light-color" value="${colorHex}" style="width:100%; height:24px; border:1px solid var(--border-color); border-radius:4px; background:none; padding:0; cursor:pointer;" />
        </div>
        <div class="form-group">
          <label style="display:flex; justify-content:space-between;">
            <span>INTENSITY</span>
            <span id="inspect-light-intensity-val">${intensity}</span>
          </label>
          <input type="range" class="form-control-slider" id="inspect-light-intensity" min="0" max="100" step="1" value="${intensity}" />
        </div>
        <div class="form-group">
          <label style="display:flex; justify-content:space-between;">
            <span>DISTANCE (M)</span>
            <span id="inspect-light-distance-val">${distance}</span>
          </label>
          <input type="range" class="form-control-slider" id="inspect-light-distance" min="1" max="100" step="1" value="${distance}" />
        </div>
        <div class="form-group">
          <label style="display:flex; justify-content:space-between;">
            <span>DECAY</span>
            <span id="inspect-light-decay-val">${decay.toFixed(1)}</span>
          </label>
          <input type="range" class="form-control-slider" id="inspect-light-decay" min="0.5" max="3" step="0.1" value="${decay}" />
        </div>
        ${actionButtonsHtml}
      `;

      // Live bindings for lights
      const selLightType = document.getElementById('inspect-light-type') as HTMLSelectElement;
      if (selLightType) {
        selLightType.addEventListener('change', () => {
          const val = selLightType.value;
          // Find old light child in group
          const oldLight = selectedRb.mesh.children.find(c => (c as any).isLight);
          if (oldLight) {
            oldLight.removeFromParent();
            (oldLight as any).dispose?.();
          }

          let newLight: THREE.Light;
          if (val === 'spot') {
            const spot = new THREE.SpotLight(p.color, p.intensity, p.distance, Math.PI / 3, 0.5, p.decay);
            spot.castShadow = true;
            spot.shadow.mapSize.set(1024, 1024);
            spot.shadow.bias = -0.0002;
            const target = new THREE.Object3D();
            target.position.set(0, -1, 0);
            selectedRb.mesh.add(target);
            spot.target = target;
            newLight = spot;
          } else {
            const point = new THREE.PointLight(p.color, p.intensity, p.distance, p.decay);
            point.castShadow = true;
            point.shadow.mapSize.set(1024, 1024);
            point.shadow.bias = -0.0002;
            newLight = point;
          }
          selectedRb.mesh.add(newLight);
          blueprint.params.lightType = val;
          selectedRb.mesh.name = `${val.toUpperCase()} Light #${entityId}`;
          updateOutliner(engine);
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const inpColor = document.getElementById('inspect-light-color') as HTMLInputElement;
      if (inpColor) {
        inpColor.addEventListener('input', () => {
          const val = inpColor.value;
          const lightObj = selectedRb.mesh.children.find(c => (c as any).isLight) as THREE.Light;
          if (lightObj) lightObj.color.set(val);
          blueprint.params.color = val;
        });
        inpColor.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const sliderIntensity = document.getElementById('inspect-light-intensity') as HTMLInputElement;
      const valIntensity = document.getElementById('inspect-light-intensity-val');
      if (sliderIntensity && valIntensity) {
        sliderIntensity.addEventListener('input', () => {
          const val = parseFloat(sliderIntensity.value);
          valIntensity.textContent = String(val);
          const lightObj = selectedRb.mesh.children.find(c => (c as any).isLight) as THREE.Light;
          if (lightObj) lightObj.intensity = val;
          blueprint.params.intensity = val;
        });
        sliderIntensity.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const sliderDistance = document.getElementById('inspect-light-distance') as HTMLInputElement;
      const valDistance = document.getElementById('inspect-light-distance-val');
      if (sliderDistance && valDistance) {
        sliderDistance.addEventListener('input', () => {
          const val = parseFloat(sliderDistance.value);
          valDistance.textContent = String(val);
          const lightObj = selectedRb.mesh.children.find(c => (c as any).isLight) as THREE.Light;
          if (lightObj) (lightObj as any).distance = val;
          blueprint.params.distance = val;
        });
        sliderDistance.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const sliderDecay = document.getElementById('inspect-light-decay') as HTMLInputElement;
      const valDecay = document.getElementById('inspect-light-decay-val');
      if (sliderDecay && valDecay) {
        sliderDecay.addEventListener('input', () => {
          const val = parseFloat(sliderDecay.value);
          valDecay.textContent = val.toFixed(1);
          const lightObj = selectedRb.mesh.children.find(c => (c as any).isLight) as THREE.Light;
          if (lightObj) (lightObj as any).decay = val;
          blueprint.params.decay = val;
        });
        sliderDecay.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

    } else if (blueprint.kind === 'box' || blueprint.kind === 'sphere' || blueprint.kind === 'extrusion') {
      // Mesh PBR Material Tab
      const colorHex = '#' + new THREE.Color(p.color).getHexString();
      const roughness = p.roughness ?? 0.7;
      const metalness = p.metalness ?? 0.05;
      const emissiveHex = '#' + new THREE.Color(p.emissive ?? 0x000000).getHexString();
      const emissiveIntensity = p.emissiveIntensity ?? 1.0;

      inspectorContent.innerHTML = `
        <div class="form-group">
          <label>BASE COLOR</label>
          <input type="color" id="inspect-mat-color" value="${colorHex}" style="width:100%; height:24px; border:1px solid var(--border-color); border-radius:4px; background:none; padding:0; cursor:pointer;" />
        </div>
        <div class="form-group">
          <label style="display:flex; justify-content:space-between;">
            <span>ROUGHNESS (SHININESS)</span>
            <span id="inspect-mat-roughness-val">${roughness.toFixed(2)}</span>
          </label>
          <input type="range" class="form-control-slider" id="inspect-mat-roughness" min="0" max="1" step="0.05" value="${roughness}" />
        </div>
        <div class="form-group">
          <label style="display:flex; justify-content:space-between;">
            <span>METALNESS</span>
            <span id="inspect-mat-metalness-val">${metalness.toFixed(2)}</span>
          </label>
          <input type="range" class="form-control-slider" id="inspect-mat-metalness" min="0" max="1" step="0.05" value="${metalness}" />
        </div>
        <div class="form-group">
          <label>GLOW (EMISSIVE) COLOR</label>
          <input type="color" id="inspect-mat-emissive" value="${emissiveHex}" style="width:100%; height:24px; border:1px solid var(--border-color); border-radius:4px; background:none; padding:0; cursor:pointer;" />
        </div>
        <div class="form-group">
          <label style="display:flex; justify-content:space-between;">
            <span>GLOW INTENSITY</span>
            <span id="inspect-mat-emissive-intensity-val">${emissiveIntensity.toFixed(1)}</span>
          </label>
          <input type="range" class="form-control-slider" id="inspect-mat-emissive-intensity" min="0" max="10" step="0.2" value="${emissiveIntensity}" />
        </div>
        ${actionButtonsHtml}
      `;

      // Live bindings for mesh material
      const getMeshMaterial = (): THREE.MeshStandardMaterial | null => {
        let mat = (selectedRb.mesh as THREE.Mesh).material;
        if (mat && (mat as any).isMeshStandardMaterial) {
          return mat as THREE.MeshStandardMaterial;
        }
        return null;
      };

      const inpColor = document.getElementById('inspect-mat-color') as HTMLInputElement;
      if (inpColor) {
        inpColor.addEventListener('input', () => {
          const val = inpColor.value;
          const mat = getMeshMaterial();
          if (mat) mat.color.set(val);
          blueprint.params.color = val;
        });
        inpColor.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const sliderRoughness = document.getElementById('inspect-mat-roughness') as HTMLInputElement;
      const valRoughness = document.getElementById('inspect-mat-roughness-val');
      if (sliderRoughness && valRoughness) {
        sliderRoughness.addEventListener('input', () => {
          const val = parseFloat(sliderRoughness.value);
          valRoughness.textContent = val.toFixed(2);
          const mat = getMeshMaterial();
          if (mat) mat.roughness = val;
          blueprint.params.roughness = val;
        });
        sliderRoughness.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const sliderMetalness = document.getElementById('inspect-mat-metalness') as HTMLInputElement;
      const valMetalness = document.getElementById('inspect-mat-metalness-val');
      if (sliderMetalness && valMetalness) {
        sliderMetalness.addEventListener('input', () => {
          const val = parseFloat(sliderMetalness.value);
          valMetalness.textContent = val.toFixed(2);
          const mat = getMeshMaterial();
          if (mat) mat.metalness = val;
          blueprint.params.metalness = val;
        });
        sliderMetalness.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const inpEmissive = document.getElementById('inspect-mat-emissive') as HTMLInputElement;
      if (inpEmissive) {
        inpEmissive.addEventListener('input', () => {
          const val = inpEmissive.value;
          const mat = getMeshMaterial();
          if (mat) mat.emissive.set(val);
          blueprint.params.emissive = val;
        });
        inpEmissive.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }

      const sliderEmissiveInt = document.getElementById('inspect-mat-emissive-intensity') as HTMLInputElement;
      const valEmissiveInt = document.getElementById('inspect-mat-emissive-intensity-val');
      if (sliderEmissiveInt && valEmissiveInt) {
        sliderEmissiveInt.addEventListener('input', () => {
          const val = parseFloat(sliderEmissiveInt.value);
          valEmissiveInt.textContent = val.toFixed(1);
          const mat = getMeshMaterial();
          if (mat) mat.emissiveIntensity = val;
          blueprint.params.emissiveIntensity = val;
        });
        sliderEmissiveInt.addEventListener('change', () => {
          captureState(engine);
          autoSaveToLocalStorage(engine);
        });
      }
    } else {
      inspectorContent.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:10px;padding-top:30px;">Material properties not editable for this entity type.</div>`;
    }
  }

  // Hook duplicate/delete action buttons
  const btnInspectDup = document.getElementById('btn-inspect-duplicate');
  if (btnInspectDup) {
    btnInspectDup.addEventListener('click', () => {
      const id = getEntityIdForRb(engine, selectedRb);
      if (id !== null) duplicateEntity(engine, id);
    });
  }

  const btnInspectDel = document.getElementById('btn-inspect-delete');
  if (btnInspectDel) {
    btnInspectDel.addEventListener('click', () => {
      const id = getEntityIdForRb(engine, selectedRb);
      if (id !== null) deleteEntity(engine, id);
    });
  }

  // ── Animation pack + combat wiring footer (character entities) ─────────
  const entityId2 = getEntityIdForRb(engine, selectedRb);
  const asm2 = entityId2 !== null ? engine.findAnimationStateMachine(selectedRb as unknown as import('../physics/RigidBodyComponent').RigidBodyComponent) : null;
  if (asm2) {
    const reg = (engine as unknown as { animPacks: import('../animation/AnimationPackRegistry').AnimationPackRegistry }).animPacks;
    const packs = reg ? reg.list() : [];
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:10px; border-top:1px solid var(--border-color); padding-top:8px;';
    footer.innerHTML = `
      <div style="font-size:10px; font-weight:bold; color:var(--accent-purple); letter-spacing:0.5px; margin-bottom:4px;">\uD83C\uDFAC ANIMATION PACKS</div>
      <div style="font-size:9px; color:var(--text-muted);">${(asm2 as unknown as { hasAnimation:(s:string)=>boolean }).hasAnimation ? 'states: ' + ((asm2 as unknown as { listAnimations?:()=>string[] }).listAnimations?.().length ?? '—') : ''}</div>
      ${packs.length ? `<div style="display:flex; gap:4px; margin-top:6px; flex-wrap:wrap;">
        ${packs.map((p)=> `<button class="btn-secondary btn-inspect-anim-apply" data-pack="${p.def.id}" style="padding:3px 8px; font-size:9px;">+ ${p.def.displayName}</button>`).join('')}
      </div>` : `<div style="font-size:9px; color:var(--text-muted); margin-top:4px;">No packs — drop a folder onto the viewport or Presets → Packs.</div>`}
      <div style="display:flex; gap:4px; margin-top:8px;">
        <button class="btn-secondary" id="btn-inspect-anim-wire" style="font-size:9px; padding:3px 8px;">Wire combat (auto)</button>
        <button class="btn-secondary" id="btn-inspect-anim-preview" style="font-size:9px; padding:3px 8px;">Preview</button>
      </div>
    `;
    inspectorContent.appendChild(footer);
    footer.querySelectorAll<HTMLButtonElement>('.btn-inspect-anim-apply').forEach((btn) => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack')!;
        if (!entityId2) return;
        const n = reg.applyToStateMachine(packId, asm2, {});
        showToast(n ? `Pack '${packId}' wired — ${n} clips.` : `Pack '${packId}' already wired or empty.`, n ? 'success' : 'info');
        updateInspector(engine);
      });
    });
    const btnWire = footer.querySelector('#btn-inspect-anim-wire');
    if (btnWire) btnWire.addEventListener('click', () => {
      const first = packs[0]?.def.id;
      if (!first || !entityId2) { showToast('No packs to wire', 'info'); return; }
      engine.aiBridge.execute({ type: 'anim_pack_wire_combat', packId: first, auto: true, target: [entityId2] } as unknown as import('../ai/AIBridge').AICommand);
      showToast(`Wiring '${first}' combat (auto) to #${entityId2}`, 'info');
    });
    const btnPreview = footer.querySelector('#btn-inspect-anim-preview');
    if (btnPreview) btnPreview.addEventListener('click', () => {
      const pack = packs[0];
      const entry = pack?.def.entries[0]?.id;
      if (pack && entry) engine.aiBridge.execute({ type: 'anim_pack_preview', packId: pack.def.id, entryId: entry, entityId: entityId2 ?? undefined } as unknown as import('../ai/AIBridge').AICommand);
    });
  }
}
