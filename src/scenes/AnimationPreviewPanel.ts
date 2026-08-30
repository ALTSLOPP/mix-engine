import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import { MIXAMO_CHARACTERS, MIXAMO_ANIMATIONS } from '../animation/MixamoPresets';
import type { AnimationStateMachine } from '../animation/AnimationStateMachine';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { ensureVillage, placeCharacterInSquare } from './VillageScene';

/**
 * AnimationPreviewPanel.ts — Ships-with-the-engine preview scene.
 *
 * On a clean boot (no autosave) the engine defaults to an Ayo character standing
 * at the world origin and this panel docks inside the viewport with a searchable,
 * keyboard-navigable list of every imported Mixamo animation. Click an entry (or
 * press Enter / Space / arrow keys when the list has focus) and Ayo plays that
 * animation; the character's pose/position is reset to the origin between
 * previews so root-motion locomotion clips don't drift the model off-camera.
 *
 * The panel is also reachable at any time from a viewport button — useful when
 * the user has been editing and wants to sanity-check a fresh animation.
 */

// --- Custom events the host (main.ts) fires when the viewport detaches/reattaches.
const EVT_VIEWPORT_DETACHED = 'mix:viewport-detached';
const EVT_VIEWPORT_REATTACHED = 'mix:viewport-reattached';

const PANEL_ID = 'animation-preview-panel';
const PREVIEW_SPAWN_POS = new THREE.Vector3(0, 0.9, 0);
const PREVIEW_SPAWN_ROT = new THREE.Quaternion();
// Camera framing (RELATIVE to the preview character). Tuned for a 3/4 hero shot of Ayo
// standing in the village town square with the buildings / Hokage monument behind him.
const PREVIEW_CAM_OFFSET = new THREE.Vector3(3.2, 2.2, 6.5);
const PREVIEW_CAM_LOOK_OFFSET = new THREE.Vector3(0, 1.1, -1.5);

type SortMode = 'category' | 'name' | 'duration';
type Speed = 0.25 | 0.5 | 1 | 1.5 | 2;

interface PreviewEntry {
  id: string;
  category: string;
  displayName: string;
  path: string;
  /** Set for clips imported into an AnimationPack; those are already in memory. */
  packId?: string;
  /** Cached clip duration in seconds, populated once the GLB has loaded. */
  duration: number | null;
  /** True if a load attempt failed — surfaces in the list as a dimmed row. */
  failed: boolean;
}

function buildEntries(engine?: Engine): PreviewEntry[] {
  const entries: PreviewEntry[] = [];
  const seen = new Set<string>();
  for (const [category, list] of Object.entries(MIXAMO_ANIMATIONS)) {
    for (const anim of list) {
      const cleanCat = category.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanId = anim.id.replace(/[^a-zA-Z0-9]/g, '_');
      const id = `anim_${cleanCat}_${cleanId}`;
      if (seen.has(id)) continue; // dedupe like Engine.registerPresets
      seen.add(id);
      entries.push({ id, category, displayName: anim.id, path: anim.path, duration: null, failed: false });
    }
  }

  // Imported packs get their own category instead of being mixed into the
  // built-in Mixamo folders. Clips are already retargeted and cached, so the
  // preview can play them immediately without another asset fetch.
  for (const pack of engine?.animPacks.list() ?? []) {
    for (const meta of pack.def.entries) {
      const id = `pack:${pack.def.id}/${meta.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        id,
        category: pack.def.displayName,
        displayName: meta.displayName,
        path: id,
        packId: pack.def.id,
        duration: meta.duration || null,
        failed: !pack.clips.has(meta.id),
      });
    }
  }
  return entries;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return '–';
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

function findAsmForRb(engine: Engine, rb: RigidBodyComponent | null): AnimationStateMachine | null {
  if (!rb) return null;
  return engine.findAnimationStateMachine(rb);
}

function isCharacterRb(rb: RigidBodyComponent | null, assetId: string): boolean {
  if (!rb) return false;
  const tag = (rb as unknown as { tag?: { source: string; assetId?: string } }).tag;
  return !!tag && tag.source === 'asset' && tag.assetId === assetId;
}

function findCharacterRb(engine: Engine, assetId: string): RigidBodyComponent | null {
  for (const rb of engine.sceneManager.rigidBodyList) {
    if (isCharacterRb(rb, assetId)) return rb;
  }
  return null;
}

export class AnimationPreviewPanel {
  private readonly engine: Engine;
  private entries: PreviewEntry[] = [];
  /** Currently visible / flat-ordered list (after filter + sort). */
  private visible: PreviewEntry[] = [];
  /** Index into `entries` of the animation currently being played (-1 = none). */
  private activeEntryIdx = -1;
  /** Index into `visible` of the keyboard-focused row (-1 = none). */
  private selectedVisibleIdx = -1;

  /** Where the preview character stands + is reset to between clips. Starts at the origin
   *  but is moved to the village town square once the map has loaded (see activate()). */
  private readonly spawnPos = PREVIEW_SPAWN_POS.clone();

  // Settings
  private characterId: string = 'ayo';
  private sortMode: SortMode = 'category';
  private loop: boolean = true;
  private paused: boolean = false;
  private speed: Speed = 1;
  private filterText: string = '';
  private collapsed: boolean = false;
  /** When true, the camera follows the preview character's mesh each frame. */
  private cameraFollow: boolean = false;

  // DOM
  private panelEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private searchEl: HTMLInputElement | null = null;
  private currentNameEl: HTMLElement | null = null;
  private currentCatEl: HTMLElement | null = null;
  private positionEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private progressTimeEl: HTMLElement | null = null;
  private progressDurEl: HTMLElement | null = null;
  private speedLabelEl: HTMLElement | null = null;
  private characterLabelEl: HTMLElement | null = null;

  // Watchers
  private selectionWatcherHook: (() => void) | null = null;
  private progressTickHook: (() => void) | null = null;
  private cameraFollowHook: (() => void) | null = null;
  private detachHandler: (() => void) | null = null;
  private reattachHandler: (() => void) | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    this.rebuildEntries();
    window.addEventListener('mix:animation-packs-changed', this.onPacksChanged);
  }

  /** Ensure the preview character is in the scene, the camera is framed, and the
   *  panel is shown. Idempotent — safe to call repeatedly (e.g. from a toolbar
   *  button or REPL). */
  async activate(): Promise<void> {
    // Preview panel must drive the asm directly, so make sure the play-mode
    // PlayerController isn't going to clobber it on the next frame.
    if (this.engine.input.mode !== 'editor') {
      this.engine.input.setMode('editor');
    }
    const rb0 = await this.ensurePreviewCharacter();
    // Build (or reuse) the Naruto village map so Ayo is standing in the town square
    // instead of an empty grey world / the old dojo on the default landing scene.
    await ensureVillage(this.engine);
    // Re-acquire the character: a concurrent scene-state restore can replace it during the
    // village's (slow) load, leaving rb0 pointing at a disposed body.
    const rb = findCharacterRb(this.engine, this.characterId) ?? rb0;
    this.engine.gizmo.attach(rb);
    // Scale-correct Ayo to human height and drop him onto the town-square ground, then
    // remember that spot so resets between clips keep him in the square (not at the origin).
    const square = placeCharacterInSquare(this.engine, rb);
    if (square) this.spawnPos.copy(square);
    this.frameCameraOnPreview();
    this.buildPanel();
    this.installWatchers();
    if (this.activeEntryIdx < 0) this.selectVisible(0);
    this.refreshActiveHighlight();
  }

  /** Tear down panel + all watchers. */
  dispose(): void {
    window.removeEventListener('keydown', this.onGlobalKey);
    window.removeEventListener('mix:animation-packs-changed', this.onPacksChanged);
    this.detachHandler && window.removeEventListener(EVT_VIEWPORT_DETACHED, this.detachHandler);
    this.reattachHandler && window.removeEventListener(EVT_VIEWPORT_REATTACHED, this.reattachHandler);
    this.selectionWatcherHook?.();
    this.progressTickHook?.();
    this.cameraFollowHook?.();
    this.panelEl?.remove();
    this.panelEl = null;
  }

  /** Rebuild the list when an IDE import registers/replaces a pack. */
  private readonly onPacksChanged = (): void => {
    const activeId = this.activeEntryIdx >= 0 ? this.entries[this.activeEntryIdx]?.id : null;
    this.rebuildEntries();
    if (activeId) this.activeEntryIdx = this.entries.findIndex(e => e.id === activeId);
    this.visible = this.sortedEntries();
    if (this.listEl) this.renderList();
    this.setStatus(`${this.entries.length} animations available — click any to preview.`);
  };

  private rebuildEntries(): void {
    this.entries = buildEntries(this.engine);
    this.visible = this.sortedEntries();
  }

  // --- Character / camera -------------------------------------------------

  /** Make sure a preview character with the currently-selected assetId exists. */
  async ensurePreviewCharacter(): Promise<RigidBodyComponent> {
    // Guarantee the character GLB is cached (and pinned) before the builder's synchronous
    // checkout — boot's bulk preload can race/drop a single asset, which is what left Ayo
    // "not loaded" and invisible.
    await this.engine.manifest.preload([this.characterId]);

    let rb = findCharacterRb(this.engine, this.characterId);
    if (rb) {
      // Already in the scene — park it at the current spawn point (square once loaded).
      rb.teleport(this.spawnPos, PREVIEW_SPAWN_ROT);
      this.engine.gizmo.attach(rb);
      return rb;
    }
    // Wipe any other character in the scene so we don't end up previewing on a
    // duplicate ghost alongside the user's edits. NEVER wipe the village map (also an
    // asset-sourced body) — it's the scene backdrop, not a stray character.
    for (const other of [...this.engine.sceneManager.rigidBodyList]) {
      if (other.mesh?.userData?.['village-scene']) continue;
      const tag = (other as unknown as { tag?: { source: string } }).tag;
      if (tag?.source === 'asset') {
        const id = this.engine.sceneManager.entityOf(other);
        if (id != null) this.engine.sceneManager.requestDestroy(id);
      }
    }
    this.engine.sceneManager.flushDeferredOperations();

    const id = this.engine.sceneManager.spawnNow(
      this.spawnPos,
      { kind: 'character', params: { assetId: this.characterId } },
      {
        rootMotion: true,
        onSpawned: (newId) => {
          const newRb = this.engine.sceneManager.getRigidBody(newId);
          if (newRb) {
            newRb.mesh.name = `${this.characterId.toUpperCase()} (Preview)`;
            this.engine.gizmo.attach(newRb);
          }
        },
      },
    );
    rb = this.engine.sceneManager.getRigidBody(id) ?? null;
    if (!rb) throw new Error('[AnimationPreview] failed to spawn preview character');
    rb.mesh.name = `${this.characterId.toUpperCase()} (Preview)`;
    this.engine.gizmo.attach(rb);
    return rb;
  }

  /** Position the editor camera at a flattering three-quarter preview angle, relative to
   *  wherever the preview character is standing (the village town square). */
  frameCameraOnPreview(): void {
    const cam = this.engine.viewport.camera;
    cam.position.copy(this.spawnPos).add(PREVIEW_CAM_OFFSET);
    cam.lookAt(this.spawnPos.x + PREVIEW_CAM_LOOK_OFFSET.x, this.spawnPos.y + PREVIEW_CAM_LOOK_OFFSET.y, this.spawnPos.z + PREVIEW_CAM_LOOK_OFFSET.z);
    this.engine.editorCamera.syncToCamera();
  }

  // --- Watchers -----------------------------------------------------------

  private installWatchers(): void {
    // Detach any prior watchers (idempotency on repeated activate() calls).
    this.selectionWatcherHook?.();
    this.progressTickHook?.();
    this.cameraFollowHook?.();
    this.detachHandler && window.removeEventListener(EVT_VIEWPORT_DETACHED, this.detachHandler);
    this.reattachHandler && window.removeEventListener(EVT_VIEWPORT_REATTACHED, this.reattachHandler);

    // 1. Highlight the row when Ayo becomes the gizmo's selected entity.
    let lastRb: RigidBodyComponent | null = null;
    this.selectionWatcherHook = this.engine.addUpdateHook(() => {
      const cur = this.engine.gizmo.attached;
      if (cur === lastRb) return;
      lastRb = cur;
      if (cur && isCharacterRb(cur, this.characterId)) this.refreshActiveHighlight();
    });

    // 2. Tick the progress bar from the mixer's action.time every frame.
    this.progressTickHook = this.engine.addUpdateHook(() => this.updateProgress());

    // 3. Viewport detach/reattach visibility.
    this.detachHandler = () => this.setVisible(false);
    this.reattachHandler = () => this.setVisible(true);
    window.addEventListener(EVT_VIEWPORT_DETACHED, this.detachHandler);
    window.addEventListener(EVT_VIEWPORT_REATTACHED, this.reattachHandler);
  }

  // --- DOM ----------------------------------------------------------------

  private buildPanel(): void {
    if (this.panelEl) {
      this.renderList();
      this.syncControls();
      return;
    }
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="apv-header">
        <div class="apv-title">
          <span class="apv-title-icon">▶</span>
          <span>Animation Preview</span>
        </div>
        <div class="apv-header-actions">
          <button class="apv-icon-btn" id="apv-refresh" title="Re-spawn character & re-frame camera (R)">↺</button>
          <button class="apv-icon-btn" id="apv-collapse" title="Collapse (C)">−</button>
        </div>
      </div>
      <div class="apv-body">
        <div class="apv-current">
          <div class="apv-current-label">NOW PLAYING</div>
          <div class="apv-current-name" id="apv-current-name">—</div>
          <div class="apv-current-cat" id="apv-current-cat">Pick from the list</div>
          <div class="apv-progress" id="apv-progress">
            <div class="apv-progress-bar" id="apv-progress-bar"></div>
            <div class="apv-progress-times">
              <span id="apv-progress-time">0.0s</span>
              <span id="apv-progress-dur">0.0s</span>
            </div>
          </div>
        </div>

        <div class="apv-controls">
          <button class="apv-ctrl-btn" id="apv-prev" title="Previous (← / P)">◀</button>
          <button class="apv-ctrl-btn apv-playpause" id="apv-playpause" title="Pause / Resume">⏸</button>
          <button class="apv-ctrl-btn" id="apv-stop" title="Reset pose & play idle">⏹</button>
          <button class="apv-ctrl-btn" id="apv-next" title="Next (→ / N)">▶</button>
          <button class="apv-ctrl-btn apv-toggle${this.loop ? ' on' : ''}" id="apv-loop" title="Loop on/off">⟳</button>
          <button class="apv-ctrl-btn apv-toggle${this.cameraFollow ? ' on' : ''}" id="apv-follow" title="Camera follow on/off">⤿</button>
        </div>

        <div class="apv-speed">
          <span class="apv-speed-label">SPEED</span>
          <div class="apv-speed-buttons" id="apv-speed-buttons">
            ${([0.25, 0.5, 1, 1.5, 2] as Speed[]).map((s) =>
              `<button class="apv-speed-btn${s === this.speed ? ' on' : ''}" data-speed="${s}">${s}×</button>`).join('')}
          </div>
        </div>

        <div class="apv-row">
          <div class="apv-field">
            <label>CHARACTER</label>
            <select id="apv-character">
              ${MIXAMO_CHARACTERS.map((c) =>
                `<option value="${c.id}"${c.id === this.characterId ? ' selected' : ''}>${c.id.toUpperCase()}</option>`).join('')}
            </select>
          </div>
          <div class="apv-field">
            <label>SORT</label>
            <select id="apv-sort">
              <option value="category"${this.sortMode === 'category' ? ' selected' : ''}>Category</option>
              <option value="name"${this.sortMode === 'name' ? ' selected' : ''}>Name (A–Z)</option>
              <option value="duration"${this.sortMode === 'duration' ? ' selected' : ''}>Duration</option>
            </select>
          </div>
        </div>

        <div class="apv-search-wrap">
          <input type="text" placeholder="Filter animations ( / )" id="apv-search" />
        </div>
        <div class="apv-status" id="apv-status">Loading 0 / ${this.entries.length}…</div>
        <div class="apv-list" id="apv-list"></div>
        <div class="apv-footer">
          <span>
            <kbd>↑</kbd><kbd>↓</kbd> nav · <kbd>Enter</kbd> play ·
            <kbd>←</kbd><kbd>→</kbd> step · <kbd>/</kbd> search ·
            <kbd>Space</kbd> pause · <kbd>C</kbd> collapse · <kbd>R</kbd> refresh
          </span>
        </div>
      </div>
    `;
    const viewportWrapper = document.getElementById('viewport-wrapper');
    if (viewportWrapper) {
      viewportWrapper.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    this.panelEl = panel;
    this.listEl = panel.querySelector('#apv-list');
    this.searchEl = panel.querySelector('#apv-search') as HTMLInputElement | null;
    this.currentNameEl = panel.querySelector('#apv-current-name');
    this.currentCatEl = panel.querySelector('#apv-current-cat');
    this.positionEl = panel.querySelector('#apv-current-cat'); // reused below for "X / Y"
    this.statusEl = panel.querySelector('#apv-status');
    this.progressBarEl = panel.querySelector('#apv-progress-bar');
    this.progressTimeEl = panel.querySelector('#apv-progress-time');
    this.progressDurEl = panel.querySelector('#apv-progress-dur');
    this.speedLabelEl = panel.querySelector('.apv-speed-label');
    this.characterLabelEl = panel.querySelector('.apv-field label');

    this.wireEvents();
    this.renderList();
    this.updateProgress();
    this.preloadAll();
  }

  private wireEvents(): void {
    if (!this.panelEl) return;

    const $ = (sel: string) => this.panelEl!.querySelector(sel) as HTMLElement | null;

    $('#apv-collapse')?.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    $('#apv-refresh')?.addEventListener('click', () => this.refreshPreview());

    $('#apv-prev')?.addEventListener('click', () => this.step(-1));
    $('#apv-next')?.addEventListener('click', () => this.step(+1));
    $('#apv-stop')?.addEventListener('click', () => this.resetToIdle());
    $('#apv-playpause')?.addEventListener('click', () => this.togglePause());
    $('#apv-loop')?.addEventListener('click', () => this.toggleLoop());
    $('#apv-follow')?.addEventListener('click', () => this.toggleCameraFollow());

    const playPauseBtn = $('#apv-playpause');
    if (playPauseBtn) playPauseBtn.textContent = this.paused ? '▶' : '⏸';

    this.searchEl?.addEventListener('input', () => {
      this.filterText = (this.searchEl?.value ?? '').trim().toLowerCase();
      this.renderList();
      // If the active row was filtered out, drop the keyboard selection to the top.
      if (this.selectedVisibleIdx >= this.visible.length) this.selectedVisibleIdx = this.visible.length - 1;
      if (this.selectedVisibleIdx < 0 && this.visible.length > 0) this.selectedVisibleIdx = 0;
      this.refreshActiveHighlight();
    });

    this.searchEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.selectedVisibleIdx >= 0) this.playVisible(this.selectedVisibleIdx);
      } else if (e.key === 'Escape') {
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectVisible(this.selectedVisibleIdx + 1, true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectVisible(this.selectedVisibleIdx - 1, true);
      }
    });

    const sortSel = $('#apv-sort') as HTMLSelectElement | null;
    sortSel?.addEventListener('change', () => {
      this.sortMode = (sortSel.value as SortMode) || 'category';
      this.renderList();
      this.refreshActiveHighlight();
    });

    const charSel = $('#apv-character') as HTMLSelectElement | null;
    charSel?.addEventListener('change', () => {
      this.characterId = charSel.value || 'ayo';
      this.activeEntryIdx = -1;
      void this.activate();
    });

    this.panelEl.querySelectorAll<HTMLButtonElement>('.apv-speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = parseFloat(btn.dataset.speed ?? '1');
        if (s === 0.25 || s === 0.5 || s === 1 || s === 1.5 || s === 2) {
          this.setSpeed(s as Speed);
        }
      });
    });

    // Click delegation: one listener handles every entry.
    this.listEl?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.apv-item') as HTMLElement | null;
      if (!target) return;
      const idx = Number(target.getAttribute('data-flat-idx'));
      if (Number.isFinite(idx)) this.playVisible(idx);
    });

    window.addEventListener('keydown', this.onGlobalKey);
  }

  // --- Global keyboard ----------------------------------------------------

  private readonly onGlobalKey = (e: KeyboardEvent): void => {
    if (this.engine.input.mode === 'play') return;
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      const isField = tag === 'INPUT' || tag === 'TEXTAREA' || (target as HTMLElement).isContentEditable;
      if (isField && target.id === 'apv-search') return;
      if (isField) return;
    }

    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.searchEl?.focus();
      this.searchEl?.select();
      return;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyJ') {
      e.preventDefault();
      this.selectVisible(this.selectedVisibleIdx + 1, true);
    } else if (e.code === 'ArrowUp' || e.code === 'KeyK') {
      e.preventDefault();
      this.selectVisible(this.selectedVisibleIdx - 1, true);
    } else if (e.key === 'Enter') {
      if (this.selectedVisibleIdx >= 0) {
        e.preventDefault();
        this.playVisible(this.selectedVisibleIdx);
      }
    } else if (e.code === 'ArrowRight' || e.code === 'KeyN') {
      e.preventDefault();
      this.step(+1);
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyP') {
      e.preventDefault();
      this.step(-1);
    } else if (e.code === 'Space') {
      // Space toggles pause — but DON'T clobber the engine's 'jump' in play mode;
      // this whole panel is editor-mode only.
      e.preventDefault();
      this.togglePause();
    } else if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.setCollapsed(!this.collapsed);
    } else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.refreshPreview();
    } else if (e.code === 'KeyL' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.toggleLoop();
    } else if (e.code === 'Escape') {
      // Clear the search input / blur whatever is focused, don't leave the search stuck open.
      if (document.activeElement && (document.activeElement as HTMLElement).id === 'apv-search') {
        (document.activeElement as HTMLElement).blur();
      }
    }
  };

  // --- List rendering -----------------------------------------------------

  private sortedEntries(): PreviewEntry[] {
    const list = this.entries.slice();
    if (this.sortMode === 'name') {
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (this.sortMode === 'duration') {
      // Unknown durations sink to the bottom; otherwise shortest first (snappier preview).
      list.sort((a, b) => {
        if (a.duration == null && b.duration == null) return 0;
        if (a.duration == null) return 1;
        if (b.duration == null) return -1;
        return a.duration - b.duration;
      });
    } else {
      // 'category' is the default order (matches MIXAMO_ANIMATIONS' insertion order).
    }
    return list;
  }

  private renderList(): void {
    if (!this.listEl) return;
    const filter = this.filterText;
    const sorted = this.sortedEntries();

    const groups = new Map<string, PreviewEntry[]>();
    for (const entry of sorted) {
      if (filter) {
        const hay = `${entry.category} ${entry.displayName} ${entry.id}`.toLowerCase();
        if (!hay.includes(filter)) continue;
      }
      let arr = groups.get(entry.category);
      if (!arr) { arr = []; groups.set(entry.category, arr); }
      arr.push(entry);
    }

    this.visible = [];
    let html = '';
    for (const [cat, list] of groups) {
      html += `<div class="apv-category"><div class="apv-cat-title">${escapeHtml(cat)}</div>`;
      for (const entry of list) {
        const flatIdx = this.visible.length;
        this.visible.push(entry);
        const failed = entry.failed ? ' apv-failed' : '';
        const dur = entry.duration != null ? fmtDuration(entry.duration) : '…';
        const failedTitle = entry.failed ? ' title="Failed to load this clip"' : '';
        html += `<button class="apv-item${failed}" data-flat-idx="${flatIdx}" data-anim-id="${escapeHtml(entry.id)}"${failedTitle}>
          <span class="apv-item-name">${escapeHtml(entry.displayName)}</span>
          <span class="apv-item-dur">${dur}</span>
          <span class="apv-item-play">▶</span>
        </button>`;
      }
      html += `</div>`;
    }
    this.listEl.innerHTML = html ||
      `<div class="apv-empty">No animations match "${escapeHtml(filter)}"</div>`;
  }

  private refreshActiveHighlight(): void {
    if (!this.listEl) return;
    const activeEntry = this.activeEntryIdx >= 0 ? this.entries[this.activeEntryIdx] : null;
    const items = this.listEl.querySelectorAll<HTMLElement>('.apv-item');
    items.forEach((el) => {
      const flatIdx = Number(el.getAttribute('data-flat-idx'));
      const visibleEntry = this.visible[flatIdx];
      const isActive = !!visibleEntry && !!activeEntry && visibleEntry.id === activeEntry.id;
      const isSelected = flatIdx === this.selectedVisibleIdx;
      el.classList.toggle('apv-active', isActive);
      el.classList.toggle('apv-selected', isSelected);
    });
    const sel = this.listEl.querySelector<HTMLElement>('.apv-item.apv-selected');
    sel?.scrollIntoView({ block: 'nearest' });
  }

  private updateProgress(): void {
    if (!this.progressBarEl || !this.progressTimeEl || !this.progressDurEl) return;
    const rb = findCharacterRb(this.engine, this.characterId);
    const asm = findAsmForRb(this.engine, rb);
    const entry = asm ? (asm as unknown as { current: { name: string; action: THREE.AnimationAction } | null }).current : null;
    if (!entry) {
      this.progressBarEl.style.width = '0%';
      this.progressTimeEl.textContent = '0.0s';
      this.progressDurEl.textContent = '0.0s';
      return;
    }
    const action = entry.action;
    const clip = action.getClip();
    const dur = clip.duration;
    // Account for speed/timeScale; if action.paused, time is frozen.
    const t = (action.time ?? 0);
    const ratio = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
    this.progressBarEl.style.width = `${(ratio * 100).toFixed(1)}%`;
    this.progressTimeEl.textContent = `${t.toFixed(1)}s`;
    this.progressDurEl.textContent = `${dur.toFixed(1)}s`;
  }

  // --- Selection / navigation --------------------------------------------

  private selectVisible(idx: number, autoplay = false): void {
    if (this.visible.length === 0) {
      this.selectedVisibleIdx = -1;
      this.refreshActiveHighlight();
      return;
    }
    const clamped = Math.max(0, Math.min(idx, this.visible.length - 1));
    this.selectedVisibleIdx = clamped;
    this.refreshActiveHighlight();
    if (autoplay) this.playVisible(clamped);
  }

  private step(delta: number): void {
    if (this.visible.length === 0) return;
    if (this.selectedVisibleIdx < 0) this.selectVisible(0);
    else this.selectVisible(this.selectedVisibleIdx + delta, true);
  }

  // --- Playback -----------------------------------------------------------

  /** The play-mode PlayerController re-drives `asm.transition` every frame, which
   *  would clobber any preview clip we just queued. Force editor mode before any
   *  playback action so the preview always wins. */
  private ensureEditorMode(): void {
    if (this.engine.input.mode !== 'editor') {
      this.engine.input.setMode('editor');
    }
  }

  private setActive(entryIdx: number | null): void {
    this.activeEntryIdx = entryIdx == null ? -1 : entryIdx;
    const entry = entryIdx != null ? this.entries[entryIdx] : null;
    if (this.currentNameEl) this.currentNameEl.textContent = entry?.displayName ?? '—';
    if (this.currentCatEl) this.currentCatEl.textContent = entry
      ? `${entry.category} · ${fmtDuration(entry.duration)}`
      : 'Pick from the list';
    this.panelEl?.classList.toggle('apv-playing', !!entry);
    this.refreshActiveHighlight();
  }

  /** Reset Ayo to the origin pose and transition the state machine onto this clip. */
  async playVisible(visibleIdx: number): Promise<void> {
    const entry = this.visible[visibleIdx];
    if (!entry) return;
    this.selectedVisibleIdx = visibleIdx;
    await this.play(entry);
  }

  async play(entry: PreviewEntry): Promise<void> {
    this.ensureEditorMode();
    const rb = await this.ensurePreviewCharacter();
    this.engine.gizmo.attach(rb);
    rb.teleport(this.spawnPos, PREVIEW_SPAWN_ROT);

    const asm = findAsmForRb(this.engine, rb);
    if (!asm) {
      this.setStatus('No animation state machine on this character.');
      return;
    }

    this.setStatus(`Loading ${entry.displayName}…`);
    try {
      let clip: THREE.AnimationClip | undefined;
      let loop = this.loop;
      if (entry.packId) {
        // Pack clips are already retargeted and held by AnimationPackRegistry.
        clip = this.engine.animPacks.getClip(entry.packId, entry.id.slice(`pack:${entry.packId}/`.length));
        const meta = this.engine.animPacks.get(entry.packId)?.def.entries.find(e => e.id === entry.id.slice(`pack:${entry.packId}/`.length));
        loop = meta?.loop ?? this.loop;
      } else {
        if (!this.engine.assetCache.has(entry.id)) {
          await this.engine.manifest.preload([entry.id]);
        }
        clip = this.engine.assetCache.getAnimations(entry.id)[0];
      }
      if (!clip) {
        entry.failed = true;
        this.renderList();
        this.setStatus(`No animation clip in ${entry.path}`);
        return;
      }
      entry.failed = false;
      entry.duration = clip.duration;
      this.renderList();
      this.refreshActiveHighlight();

      // Add to the asm on first use.
      if (!(asm as unknown as { anims: Map<string, unknown> }).anims.has(entry.id)) {
        asm.addAnimation(entry.id, clip, { loop });
      }
      const animMap = (asm as unknown as { anims: Map<string, { action: THREE.AnimationAction }> }).anims;
      const animEntry = animMap.get(entry.id);
      if (!animEntry) {
        this.setStatus(`State machine could not load ${entry.displayName}`);
        return;
      }
      const action = animEntry.action;

      // Re-clicking the same animation: the asm.transition() short-circuits on
      // `next === this.current`, so we manually reset the action to its first frame.
      const currentEntry = (asm as unknown as { current: { name: string } | null }).current;
      const isReplay = currentEntry?.name === entry.id;
      if (isReplay) {
        action.reset();
        action.play();
        if ('resampleBaseline' in asm) {
          (asm as any).resampleBaseline();
        }
      } else {
        asm.transition(entry.id, 0.15);
      }
      // Apply the current loop / speed / paused settings so toggles feel live.
      this.applyActionSettings(action);

      this.paused = false;
      this.syncControls();

      this.setActive(this.entries.findIndex((e) => e.id === entry.id));
      this.setStatus(`Playing ${entry.displayName} (${entry.category})`);
    } catch (err) {
      console.error('[AnimationPreview] play failed:', err);
      entry.failed = true;
      this.renderList();
      this.setStatus(`Failed to load ${entry.displayName}`);
    }
  }

  private applyActionSettings(action: THREE.AnimationAction): void {
    action.setLoop(this.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.timeScale = this.paused ? 0 : this.speed;
    if (!this.loop) action.clampWhenFinished = true;
  }

  private syncControls(): void {
    if (!this.panelEl) return;
    const playPauseBtn = this.panelEl.querySelector('#apv-playpause');
    if (playPauseBtn) playPauseBtn.textContent = this.paused ? '▶' : '⏸';
    const loopBtn = this.panelEl.querySelector('#apv-loop');
    loopBtn?.classList.toggle('on', this.loop);
    const followBtn = this.panelEl.querySelector('#apv-follow');
    followBtn?.classList.toggle('on', this.cameraFollow);
    this.panelEl.querySelectorAll<HTMLButtonElement>('.apv-speed-btn').forEach((btn) => {
      const s = parseFloat(btn.dataset.speed ?? '1');
      btn.classList.toggle('on', s === this.speed);
    });
  }

  private togglePause(): void {
    this.ensureEditorMode();
    const rb = findCharacterRb(this.engine, this.characterId);
    const asm = findAsmForRb(this.engine, rb);
    const current = asm ? (asm as unknown as { current: { action: THREE.AnimationAction } | null }).current : null;
    if (!current) return;
    this.paused = !this.paused;
    this.applyActionSettings(current.action);
    this.syncControls();
    this.setStatus(this.paused ? 'Paused' : 'Playing');
  }

  private toggleLoop(): void {
    this.ensureEditorMode();
    this.loop = !this.loop;
    const rb = findCharacterRb(this.engine, this.characterId);
    const asm = findAsmForRb(this.engine, rb);
    const current = asm ? (asm as unknown as { current: { action: THREE.AnimationAction } | null }).current : null;
    if (current) this.applyActionSettings(current.action);
    this.syncControls();
    this.setStatus(this.loop ? 'Loop on' : 'Loop off (one-shot)');
  }

  private setSpeed(s: Speed): void {
    this.ensureEditorMode();
    this.speed = s;
    const rb = findCharacterRb(this.engine, this.characterId);
    const asm = findAsmForRb(this.engine, rb);
    const current = asm ? (asm as unknown as { current: { action: THREE.AnimationAction } | null }).current : null;
    if (current) this.applyActionSettings(current.action);
    this.syncControls();
    this.setStatus(`Speed: ${s}×`);
  }

  private toggleCameraFollow(): void {
    this.cameraFollow = !this.cameraFollow;
    // Install / remove the per-frame follow hook to keep the closure cheap.
    if (this.cameraFollowHook) { this.cameraFollowHook(); this.cameraFollowHook = null; }
    if (this.cameraFollow) {
      this.cameraFollowHook = this.engine.addUpdateHook(() => {
        const rb = findCharacterRb(this.engine, this.characterId);
        if (!rb) return;
        const cam = this.engine.viewport.camera;
        // Camera follows the character at the same offset, but doesn't snap — gentle lerp.
        const target = new THREE.Vector3().copy(rb.mesh.position).add(new THREE.Vector3(0, 1.1, 0));
        const desiredCamPos = new THREE.Vector3().copy(target).add(PREVIEW_CAM_OFFSET);
        cam.position.lerp(desiredCamPos, 0.15);
        cam.lookAt(target);
      });
    }
    this.syncControls();
    this.setStatus(this.cameraFollow ? 'Camera following preview character' : 'Camera follow off');
  }

  private async resetToIdle(): Promise<void> {
    const idleId = `anim_Locomotion_${this.entries.length > 0 ? 'idle' : 'idle'}`;
    const idleEntry = this.entries.find((e) => e.id === 'anim_Locomotion_idle');
    if (!idleEntry) {
      this.setStatus('No idle animation available to reset to.');
      return;
    }
    await this.play(idleEntry);
  }

  private async refreshPreview(): Promise<void> {
    this.activeEntryIdx = -1;
    await this.activate();
    this.setStatus('Preview re-initialised.');
  }

  // --- Visibility / collapse ---------------------------------------------

  private setVisible(visible: boolean): void {
    if (!this.panelEl) return;
    this.panelEl.style.display = visible ? '' : 'none';
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.panelEl?.classList.toggle('apv-collapsed', collapsed);
    const btn = this.panelEl?.querySelector('#apv-collapse');
    if (btn) btn.textContent = collapsed ? '+' : '−';
    btn?.setAttribute('title', collapsed ? 'Expand (C)' : 'Collapse (C)');
  }

  // --- Preload ------------------------------------------------------------

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  /** Background-preload all entries so clicking them is instant. Reports progress. */
  private async preloadAll(): Promise<void> {
    const total = this.entries.length;
    let done = 0;
    const tick = () => { done += 1; this.setStatus(`Preloading ${done} / ${total}…`); };
    await Promise.all(this.entries.map(async (entry) => {
      try {
        if (entry.packId) {
          const clip = this.engine.animPacks.getClip(entry.packId, entry.id.slice(`pack:${entry.packId}/`.length));
          if (clip) {
            entry.duration = clip.duration;
            entry.failed = false;
          }
          return;
        }
        if (!this.engine.assetCache.has(entry.id)) {
          await this.engine.manifest.preload([entry.id]);
        }
        const clips = this.engine.assetCache.getAnimations(entry.id);
        if (clips.length > 0) {
          entry.duration = clips[0].duration;
        } else {
          entry.failed = true;
        }
      } catch {
        entry.failed = true;
      } finally {
        tick();
      }
    }));
    this.renderList();
    this.refreshActiveHighlight();
    this.setStatus(
      `${total} animations loaded — click any to preview, ↑/↓ to navigate.`,
    );
  }
}
