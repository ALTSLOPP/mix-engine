import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { MIXAMO_CHARACTERS } from '../animation/MixamoPresets';

/** The asset id a rigid body was spawned from, or null for primitives/extrusions. */
export function getAssetId(rb: any): string | null {
  const tag = rb && rb.tag;
  return (tag && tag.source === 'asset') ? tag.assetId : null;
}

/** True when the rigid body is one of the Mixamo preset characters. */
export function isCharacterRb(rb: RigidBodyComponent): boolean {
  const assetId = getAssetId(rb);
  return assetId !== null && MIXAMO_CHARACTERS.some((c) => c.id === assetId);
}

export function getEntityIdForRb(engine: Engine, rb: RigidBodyComponent): number | null {
  return engine.sceneManager.entityOf(rb);
}

/** Frame the currently selected entity: pull the camera back from it and look at it. */
export function focusCameraOnSelected(engine: Engine) {
  const rb = engine.gizmo.attached;
  if (!rb) return;
  const target = rb.mesh.position;
  const cam = engine.viewport.camera;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);

  // Position camera offset from target, looking directly at it
  const offset = new THREE.Vector3().copy(fwd).multiplyScalar(-8);
  offset.y += 3.5; // Look slightly down
  cam.position.copy(target).add(offset);
  cam.lookAt(target);

  // Sync the flycam angles so RMB-look continues smoothly from this framing.
  engine.editorCamera.syncToCamera();
}
