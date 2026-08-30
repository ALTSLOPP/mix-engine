import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorCamera } from './EditorCamera';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface TransformCommitRecord {
  rb: RigidBodyComponent;
  oldPosition: THREE.Vector3;
  oldQuaternion: THREE.Quaternion;
  oldScale: THREE.Vector3;
  newPosition: THREE.Vector3;
  newQuaternion: THREE.Quaternion;
  newScale: THREE.Vector3;
}

/** Anything the gizmo pauses/resumes during a drag (e.g. an AnimationStateMachine). */
export interface Pausable {
  pause(): void;
  resume(): void;
}

/**
 * TransformGizmo.ts — thin, version-pinned wrapper over three's TransformControls.
 *
 * PLAN CORRECTION: TransformControls is NOT `THREE.TransformControls` in r0.170 — it is
 * a separate ESM module and is not itself an Object3D, so the visual helper is added via
 * `getHelper()`.
 *
 * Implements the transform-authority protocol, origin-shift-during-drag, and a blur
 * force-end so the gizmo never hijacks the mouse after an alt-tab.
 */
export class TransformGizmo {
  private control: TransformControls;
  private camera: THREE.Camera;
  private scene: THREE.Scene;
  private currentMode: GizmoMode = 'translate';
  private translationSnap: number | null = null;
  private rotationSnap: number | null = null;
  private scaleSnap: number | null = null;
  private currentWindow: Window = window;
  private currentDocument: Document = document;

  private currentRb: RigidBodyComponent | null = null;
  private currentAnim: Pausable | null = null;

  private readonly onBlur = () => this.forceEndDrag();
  private readonly onVisibility = () => {
    if (this.currentDocument.visibilityState === 'hidden') this.forceEndDrag();
  };

  private readonly onDraggingChanged = (e: any) => {
    const dragging = e.value;
    this.editorCamera.enabled = !dragging;
    if (dragging) this.beginDrag();
    else this.endDrag();
  };

  private readonly onObjectChange = () => {
    if (this.control.dragging && this.currentRb) this.currentRb.syncToPhysics();
  };

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    private readonly editorCamera: EditorCamera,
    scene: THREE.Scene,
  ) {
    this.camera = camera;
    this.scene = scene;

    this.control = new TransformControls(camera, domElement);
    this.control.setMode('translate');
    const helper = this.control.getHelper();
    // The helper re-derives its transform from the attached object each frame, so it must
    // be excluded from the floating-origin static shift (it is a root-level Scene child).
    helper.userData.excludeFromOriginShift = true;
    scene.add(helper);

    this.control.addEventListener('dragging-changed', this.onDraggingChanged);
    this.control.addEventListener('objectChange', this.onObjectChange);

    this.currentWindow.addEventListener('blur', this.onBlur);
    this.currentDocument.addEventListener('visibilitychange', this.onVisibility);
  }

  updateDomElement(newDomElement: HTMLElement, newWindow: Window): void {
    this.control.detach();
    this.control.getHelper().removeFromParent();
    // Remove our per-control listeners BEFORE dispose() so the old TransformControls
    // wrapper doesn't keep a back-reference to our handler closures (and through
    // them, to the entire gizmo context). Three's dispose() doesn't auto-remove
    // listeners from the event dispatcher.
    this.control.removeEventListener('dragging-changed', this.onDraggingChanged);
    this.control.removeEventListener('objectChange', this.onObjectChange);
    this.control.dispose();

    this.currentWindow.removeEventListener('blur', this.onBlur);
    this.currentDocument.removeEventListener('visibilitychange', this.onVisibility);

    this.currentWindow = newWindow;
    this.currentDocument = newWindow.document;

    this.control = new TransformControls(this.camera, newDomElement);
    this.control.setMode(this.currentMode);
    this.control.translationSnap = this.translationSnap;
    this.control.rotationSnap = this.rotationSnap;
    this.control.scaleSnap = this.scaleSnap;

    const helper = this.control.getHelper();
    helper.userData.excludeFromOriginShift = true;
    this.scene.add(helper);

    this.control.addEventListener('dragging-changed', this.onDraggingChanged);
    this.control.addEventListener('objectChange', this.onObjectChange);

    this.currentWindow.addEventListener('blur', this.onBlur);
    this.currentDocument.addEventListener('visibilitychange', this.onVisibility);

    if (this.currentRb) {
      this.control.attach(this.currentRb.mesh);
    }
  }

  get dragging(): boolean {
    return this.control.dragging;
  }

  /** The rigid body the gizmo is currently attached to (selected entity), or null. */
  get attached(): RigidBodyComponent | null {
    return this.currentRb;
  }

  get mode(): GizmoMode {
    return this.currentMode;
  }

  setMode(mode: GizmoMode): void {
    this.currentMode = mode;
    this.control.setMode(mode);
  }

  setTranslationSnap(snap: number | null): void {
    this.translationSnap = snap;
    this.control.translationSnap = snap;
  }

  setRotationSnap(snap: number | null): void {
    this.rotationSnap = snap;
    this.control.rotationSnap = snap;
  }

  setScaleSnap(snap: number | null): void {
    this.scaleSnap = snap;
    this.control.scaleSnap = snap;
  }

  /** Attach to an entity. `anim` (optional) is paused for the duration of a drag. */
  attach(rb: RigidBodyComponent, anim: Pausable | null = null): void {
    this.currentRb = rb;
    this.currentAnim = anim;
    this.control.attach(rb.mesh);
  }

  detach(): void {
    if (this.control.dragging) this.forceEndDrag();
    this.control.detach();
    this.currentRb = null;
    this.currentAnim = null;
  }

  public onDragEnd: (() => void) | null = null;
  public onTransformCommitted: ((record: TransformCommitRecord) => void) | null = null;

  private readonly dragStartPos = new THREE.Vector3();
  private readonly dragStartQuat = new THREE.Quaternion();
  private readonly dragStartScale = new THREE.Vector3();

  // --- Authority protocol --------------------------------------------------
  private beginDrag(): void {
    const rb = this.currentRb;
    if (!rb) return;
    this.dragStartPos.copy(rb.mesh.position);
    this.dragStartQuat.copy(rb.mesh.quaternion);
    this.dragStartScale.copy(rb.mesh.scale);
    rb.transformAuthority = 'gizmo';
    rb.setKinematicOverride(true);
    this.currentAnim?.pause();
  }

  private endDrag(): void {
    const rb = this.currentRb;
    if (!rb) return;
    rb.setKinematicOverride(false);
    rb.resetInterpolationBuffers();
    rb.transformAuthority = 'physics';
    this.currentAnim?.resume();
    this.onDragEnd?.();

    const posChanged = !this.dragStartPos.equals(rb.mesh.position);
    const quatChanged = !this.dragStartQuat.equals(rb.mesh.quaternion);
    const scaleChanged = !this.dragStartScale.equals(rb.mesh.scale);

    if (posChanged || quatChanged || scaleChanged) {
      this.onTransformCommitted?.({
        rb,
        oldPosition: this.dragStartPos.clone(),
        oldQuaternion: this.dragStartQuat.clone(),
        oldScale: this.dragStartScale.clone(),
        newPosition: rb.mesh.position.clone(),
        newQuaternion: rb.mesh.quaternion.clone(),
        newScale: rb.mesh.scale.clone(),
      });
    }
  }

  /**
   * applyOriginShift — subtract `offset` from the controls' cached world-space drag
   * references so an in-progress drag rigidly translates with the world. Touches
   * TransformControls internals; deliberately defensive against field renames.
   */
  applyOriginShift(offset: THREE.Vector3): void {
    if (!this.control.dragging) return;
    const c = this.control as unknown as Record<string, unknown>;
    for (const key of ['_positionStart', '_worldPositionStart', 'pointStart', 'pointEnd', 'worldPosition']) {
      const v = c[key] as THREE.Vector3 | undefined;
      if (v && typeof (v as THREE.Vector3).sub === 'function') v.sub(offset);
    }
    // Translate the drag plane: n·(p-offset)+c' = 0 → constant += n·offset.
    const plane = c['_plane'] as THREE.Plane | undefined;
    if (plane && plane.normal) plane.constant += plane.normal.dot(offset);

    // Re-drive the body from the (already origin-shifted) mesh.
    this.currentRb?.syncToPhysics();
  }

  /** Force-end a drag on focus loss so the gizmo can't keep the mouse captured. */
  forceEndDrag(): void {
    if (!this.control.dragging) return;
    const c = this.control as unknown as { dragging: boolean; axis: string | null };
    c.dragging = false;
    c.axis = null;
    this.editorCamera.enabled = true;
    this.endDrag();
  }

  dispose(): void {
    this.currentWindow.removeEventListener('blur', this.onBlur);
    this.currentDocument.removeEventListener('visibilitychange', this.onVisibility);
    this.control.detach();
    this.control.getHelper().removeFromParent();
    this.control.dispose();
  }
}
