import type * as THREE from 'three';

/**
 * Cross-module mutable editor UI state.
 *
 * Only state that is read/written from MORE THAN ONE editor module lives here. State
 * that belongs to a single module (e.g. snap values in uiEvents, the assets-drawer
 * search query in panels, drag-preview meshes in dragAndDrop) stays local to that
 * module. Mutable primitives must be reassigned through this object (not via named
 * imports, which are read-only bindings), so every cross-module flag is a field here.
 */
export const ui = {
  /** Active bottom-drawer tab: 'ai' | 'assets' | 'games' | 'console' | 'tweens'. */
  activeDrawerTab: 'ai' as 'ai' | 'assets' | 'games' | 'console' | 'tweens',
  /** Active preset library tab: 'characters' | 'animations' | 'packs'. */
  activePresetTab: 'characters' as 'characters' | 'animations' | 'packs',
  /** Active inspector tab: 'transform' | 'physics' | 'material' | 'tweens'. */
  activeInspectorTab: 'transform' as 'transform' | 'physics' | 'material' | 'tweens',
  /** The editor grid helper (re-created when the AI bridge changes its size/colour). */
  gridHelper: null as THREE.GridHelper | null,
  gridVisible: true,
  /** Drag-and-drop: the armed asset kind/id. Set at dragstart (in panels or the preset
   *  cards), read at drop-time (dragAndDrop). Browser security gates dataTransfer during
   *  dragover, so the kind MUST be set at dragstart — hence this shared scope. */
  draggedKind: null as string | null,
  draggedAssetId: null as string | null,
  /** Assets-drawer spawn options (written in panels, read in the dragAndDrop drop). */
  randomizeSpawnRotation: true,
  randomizeSpawnScale: false,
};
