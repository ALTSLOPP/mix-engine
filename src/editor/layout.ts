import type { Engine } from '../engine/Engine';
import { showToast } from '../ui/domUtils';
import { editorContainer, leftSplitter, rightSplitter, bottomSplitter } from './dom';

// --- Splitters and Detached Viewport Orchestration --------------------------
let leftWidth = parseInt(localStorage.getItem('mix_layout_left_width') || '280', 10);
let rightWidth = parseInt(localStorage.getItem('mix_layout_right_width') || '340', 10);
let bottomHeight = parseInt(localStorage.getItem('mix_layout_bottom_height') || '220', 10);
const COMPACT_BREAKPOINT = 1100;
const MIN_CENTER_WIDTH = 420;
const MIN_VIEWPORT_HEIGHT = 240;

type WorkspacePane = 'left' | 'right' | 'bottom';

function clampLayoutSizes(): void {
  const maxSideTotal = Math.max(400, window.innerWidth - MIN_CENTER_WIDTH - 24);
  leftWidth = Math.max(200, Math.min(leftWidth, 500, maxSideTotal - Math.max(220, rightWidth)));
  rightWidth = Math.max(220, Math.min(rightWidth, 600, maxSideTotal - leftWidth));
  bottomHeight = Math.max(100, Math.min(bottomHeight, 500, window.innerHeight - MIN_VIEWPORT_HEIGHT - 58));
}

function initLayoutSizes() {
  clampLayoutSizes();
  if (editorContainer) {
    editorContainer.style.setProperty('--left-width', `${leftWidth}px`);
    editorContainer.style.setProperty('--right-width', `${rightWidth}px`);
    editorContainer.style.setProperty('--bottom-height', `${bottomHeight}px`);
  }
}

function setupSplitter(
  splitter: HTMLElement | null,
  onDrag: (clientX: number, clientY: number) => void,
  onDragEnd?: () => void
) {
  if (!splitter) return;
  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    splitter.classList.add('dragging');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onDrag(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      splitter.classList.remove('dragging');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onDragEnd) onDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });
}

/** Initialize layout sizes + wire the resize splitters. Call once during boot. */
export function initLayout(): void {
  initLayoutSizes();

  const layoutButton = document.getElementById('btn-layout-menu') as HTMLButtonElement | null;
  const layoutMenu = document.getElementById('layout-menu');
  const scrim = document.getElementById('workspace-scrim');
  const paneButtons: Record<WorkspacePane, HTMLButtonElement | null> = {
    left: document.getElementById('layout-toggle-left') as HTMLButtonElement | null,
    right: document.getElementById('layout-toggle-right') as HTMLButtonElement | null,
    bottom: document.getElementById('layout-toggle-bottom') as HTMLButtonElement | null,
  };

  const isCompact = () => window.innerWidth <= COMPACT_BREAKPOINT;
  const closeCompactPanes = () => {
    editorContainer?.classList.remove('compact-left-open', 'compact-right-open', 'compact-bottom-open');
  };
  const paneVisible = (pane: WorkspacePane): boolean => {
    if (!editorContainer) return false;
    return isCompact()
      ? editorContainer.classList.contains(`compact-${pane}-open`)
      : !editorContainer.classList.contains(`${pane}-panel-collapsed`);
  };
  const syncPaneButtons = () => {
    (Object.keys(paneButtons) as WorkspacePane[]).forEach((pane) => {
      paneButtons[pane]?.setAttribute('aria-checked', String(paneVisible(pane)));
    });
  };
  const togglePane = (pane: WorkspacePane) => {
    if (!editorContainer) return;
    if (isCompact()) {
      const openClass = `compact-${pane}-open`;
      const wasOpen = editorContainer.classList.contains(openClass);
      closeCompactPanes();
      if (!wasOpen) editorContainer.classList.add(openClass);
    } else {
      const collapsedClass = `${pane}-panel-collapsed`;
      editorContainer.classList.toggle(collapsedClass);
      localStorage.setItem(`mix_layout_${pane}_collapsed`, String(editorContainer.classList.contains(collapsedClass)));
    }
    syncPaneButtons();
    window.dispatchEvent(new Event('resize'));
  };
  const closeLayoutMenu = () => {
    layoutMenu?.classList.remove('open');
    layoutButton?.setAttribute('aria-expanded', 'false');
  };
  const positionLayoutMenu = () => {
    if (!layoutButton || !layoutMenu) return;
    const rect = layoutButton.getBoundingClientRect();
    const menuWidth = 210;
    layoutMenu.style.top = `${Math.min(window.innerHeight - 150, rect.bottom + 6)}px`;
    layoutMenu.style.left = `${Math.max(6, Math.min(window.innerWidth - menuWidth - 6, rect.right - menuWidth))}px`;
  };

  (Object.keys(paneButtons) as WorkspacePane[]).forEach((pane) => {
    paneButtons[pane]?.addEventListener('click', () => togglePane(pane));
  });
  layoutButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = !layoutMenu?.classList.contains('open');
    closeLayoutMenu();
    if (opening) {
      positionLayoutMenu();
      layoutMenu?.classList.add('open');
      layoutButton.setAttribute('aria-expanded', 'true');
      syncPaneButtons();
    }
  });
  layoutMenu?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', closeLayoutMenu);
  scrim?.addEventListener('click', () => {
    closeCompactPanes();
    syncPaneButtons();
  });

  (['left', 'right', 'bottom'] as WorkspacePane[]).forEach((pane) => {
    if (localStorage.getItem(`mix_layout_${pane}_collapsed`) === 'true') {
      editorContainer?.classList.add(`${pane}-panel-collapsed`);
    }
  });

  let compactMode = isCompact();
  editorContainer?.classList.toggle('workspace-compact', compactMode);
  syncPaneButtons();

  window.addEventListener('resize', () => {
    const nextCompactMode = isCompact();
    if (nextCompactMode !== compactMode) {
      compactMode = nextCompactMode;
      closeCompactPanes();
      closeLayoutMenu();
    }
    editorContainer?.classList.toggle('workspace-compact', compactMode);
    clampLayoutSizes();
    initLayoutSizes();
    syncPaneButtons();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeLayoutMenu();
    if (isCompact()) {
      closeCompactPanes();
      syncPaneButtons();
    }
  });

  setupSplitter(leftSplitter, (x, y) => {
    const maxLeft = Math.max(200, window.innerWidth - rightWidth - MIN_CENTER_WIDTH - 24);
    leftWidth = Math.max(200, Math.min(x - 3, 500, maxLeft));
    editorContainer?.style.setProperty('--left-width', `${leftWidth}px`);
  }, () => {
    localStorage.setItem('mix_layout_left_width', String(leftWidth));
  });

  setupSplitter(rightSplitter, (x, y) => {
    const containerWidth = window.innerWidth;
    const maxRight = Math.max(220, containerWidth - leftWidth - MIN_CENTER_WIDTH - 24);
    rightWidth = Math.max(220, Math.min(containerWidth - x - 3, 600, maxRight));
    editorContainer?.style.setProperty('--right-width', `${rightWidth}px`);
  }, () => {
    localStorage.setItem('mix_layout_right_width', String(rightWidth));
  });

  setupSplitter(bottomSplitter, (x, y) => {
    const containerHeight = window.innerHeight;
    const maxBottom = Math.max(100, containerHeight - MIN_VIEWPORT_HEIGHT - 58);
    bottomHeight = Math.max(100, Math.min(containerHeight - y - 3, 500, maxBottom));
    editorContainer?.style.setProperty('--bottom-height', `${bottomHeight}px`);
  }, () => {
    localStorage.setItem('mix_layout_bottom_height', String(bottomHeight));
  });
}

// ── Viewport "solo" (maximized) mode ──────────────────────────────────────
// "Detach" used to window.open() a second OS window that re-rendered the same
// THREE.js scene. That can't work in the desktop shell: Tauri/WebView2 gives every
// window its own JS + WebGL context, so a popped-out window shares neither the live
// scene nor the renderer — you'd get an empty (or dead) viewport. Worse, tearing the
// second Viewport down on re-attach disposed the SHARED scene's sky/environment and
// lighting, which corrupted the editor viewport too (the "neither viewport works"
// bug). Instead we maximize the single, existing viewport to fill the whole window.
// One renderer, one context — identical behaviour in the browser and the desktop app.
let viewportSoloed = false;
let soloBarEl: HTMLElement | null = null;

/** True while the viewport is maximized (solo) over the editor chrome. */
export function isViewportSoloed(): boolean {
  return viewportSoloed;
}

function markViewportResizeDirty(engine: Engine): void {
  // The canvas container just changed size — force a renderer/camera re-fit next frame.
  (engine.viewport as unknown as { resizeDirty: boolean }).resizeDirty = true;
}

function ensureSoloBar(engine: Engine): HTMLElement {
  if (soloBarEl) return soloBarEl;
  const bar = document.createElement('div');
  bar.id = 'viewport-solo-bar';
  bar.innerHTML =
    '<button class="overlay-btn" id="btn-solo-fullscreen" title="Toggle OS fullscreen">⛶ FULLSCREEN</button>' +
    '<button class="overlay-btn" id="btn-solo-reattach" title="Return to the editor layout">⤢ RE-ATTACH</button>';
  document.body.appendChild(bar);
  bar.querySelector('#btn-solo-reattach')?.addEventListener('click', () => reattachViewport(engine));
  bar.querySelector('#btn-solo-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
  soloBarEl = bar;
  return bar;
}

export function detachViewport(engine: Engine): void {
  if (viewportSoloed) return;
  viewportSoloed = true;

  // Maximize the existing viewport to fill the window. The body class repositions
  // #viewport-wrapper to a fixed, full-window overlay above the editor chrome.
  document.body.classList.add('mix-viewport-solo');
  ensureSoloBar(engine).style.display = 'flex';
  markViewportResizeDirty(engine);

  showToast('Viewport maximized. Click RE-ATTACH (or press Esc) to return to the editor.', 'success');
}

export function reattachViewport(engine: Engine): void {
  if (!viewportSoloed) return;
  viewportSoloed = false;

  document.body.classList.remove('mix-viewport-solo');
  if (soloBarEl) soloBarEl.style.display = 'none';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  markViewportResizeDirty(engine);

  showToast('Viewport re-attached to the editor.', 'info');
}
