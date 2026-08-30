/**
 * Cached editor DOM element references.
 *
 * Queried once at module load (this is an ES module loaded after the HTML, so the
 * document is already parsed — same timing the old top-of-main.ts cache relied on).
 * Every editor module imports the specific elements it needs from here, so the DOM
 * lookups live in exactly one place.
 */
export const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

export const btnMode = document.getElementById('btn-mode') as HTMLButtonElement;
export const outlinerContent = document.getElementById('outliner-content');
export const outlinerSearch = document.getElementById('outliner-search') as HTMLInputElement;

export const btnSpawnBox = document.getElementById('btn-spawn-box');
export const btnSpawnSphere = document.getElementById('btn-spawn-sphere');
export const btnClearScene = document.getElementById('btn-clear-scene');

export const telemetryChunk = document.getElementById('telemetry-chunk');
export const telemetryDrift = document.getElementById('telemetry-drift');
export const telemetryShift = document.getElementById('telemetry-shift');
export const telemetryDt = document.getElementById('telemetry-dt');
export const perfText = document.getElementById('perf-text');
export const perfCanvas = document.getElementById('perf-canvas') as HTMLCanvasElement;

export const btnPausePhysics = document.getElementById('btn-pause-physics') as HTMLButtonElement;
export const todSlider = document.getElementById('tod-slider') as HTMLInputElement;
export const todVal = document.getElementById('tod-val');

export const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement | null;
export const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement | null;
export const btnSaveScene = document.getElementById('btn-save-scene') as HTMLButtonElement | null;
export const btnLoadScene = document.getElementById('btn-load-scene') as HTMLButtonElement | null;

export const btnExportJson = document.getElementById('btn-export-json');
export const btnImportJson = document.getElementById('btn-import-json');
export const btnImportJsonFile = document.getElementById('btn-import-json-file') as HTMLInputElement | null;
export const btnDuplicateEntityMenu = document.getElementById('btn-duplicate-entity');
export const btnDeleteEntityMenu = document.getElementById('btn-delete-entity');
export const btnGenTerrainLlm = document.getElementById('btn-gen-terrain-llm');
export const btnCycleTod = document.getElementById('btn-cycle-tod');
export const btnLlmGuide = document.getElementById('btn-llm-guide');
export const btnApiRef = document.getElementById('btn-api-ref');

export const btnToggleSnap = document.getElementById('btn-toggle-snap') as HTMLButtonElement | null;
export const selSnapTranslate = document.getElementById('sel-snap-translate') as HTMLSelectElement | null;
export const selSnapRotate = document.getElementById('sel-snap-rotate') as HTMLSelectElement | null;

export const fogSlider = document.getElementById('fog-slider') as HTMLInputElement | null;
export const fogVal = document.getElementById('fog-val');
export const fogColor = document.getElementById('fog-color') as HTMLInputElement | null;
export const ambientSlider = document.getElementById('ambient-slider') as HTMLInputElement | null;
export const ambientVal = document.getElementById('ambient-val');

export const leftSplitter = document.getElementById('left-splitter');
export const rightSplitter = document.getElementById('right-splitter');
export const bottomSplitter = document.getElementById('bottom-splitter');
export const editorContainer = document.getElementById('editor-container');
export const btnDetachViewport = document.getElementById('btn-detach-viewport') as HTMLButtonElement | null;
export const btnReattachViewport = document.getElementById('btn-reattach-viewport') as HTMLButtonElement | null;
export const btnSpawnLight = document.getElementById('btn-spawn-light') as HTMLButtonElement | null;
export const tabInspMaterial = document.getElementById('tab-insp-material') as HTMLButtonElement | null;

export const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement | null;
export const settingsModal = document.getElementById('settings-modal');
export const btnCloseSettings = document.getElementById('btn-close-settings');
export const btnCancelSettings = document.getElementById('btn-cancel-settings');
export const btnSaveSettings = document.getElementById('btn-save-settings');
export const settingsBlenderPath = document.getElementById('settings-blender-path') as HTMLInputElement | null;

export const btnGizmoTranslate = document.getElementById('btn-gizmo-translate');
export const btnGizmoRotate = document.getElementById('btn-gizmo-rotate');
export const btnGizmoScale = document.getElementById('btn-gizmo-scale');

export const btnTerrainRaise = document.getElementById('btn-terrain-raise') as HTMLButtonElement | null;
export const btnTerrainLower = document.getElementById('btn-terrain-lower') as HTMLButtonElement | null;
export const btnTerrainSmooth = document.getElementById('btn-terrain-smooth') as HTMLButtonElement | null;
export const btnTerrainFlatten = document.getElementById('btn-terrain-flatten') as HTMLButtonElement | null;
export const btnTerrainTerrace = document.getElementById('btn-terrain-terrace') as HTMLButtonElement | null;
export const btnTerrainRamp = document.getElementById('btn-terrain-ramp') as HTMLButtonElement | null;
export const btnTerrainNoise = document.getElementById('btn-terrain-noise') as HTMLButtonElement | null;
export const btnTerrainErode = document.getElementById('btn-terrain-erode') as HTMLButtonElement | null;
export const btnTerrainPaint = document.getElementById('btn-terrain-paint') as HTMLButtonElement | null;
export const terrainBrushSettings = document.getElementById('terrain-brush-settings') as HTMLElement | null;
export const terrainRadius = document.getElementById('terrain-radius') as HTMLInputElement | null;
export const terrainStrength = document.getElementById('terrain-strength') as HTMLInputElement | null;
export const terrainHardness = document.getElementById('terrain-hardness') as HTMLInputElement | null;
export const terrainTerraceStep = document.getElementById('terrain-terrace-step') as HTMLInputElement | null;
export const terrainErodeKind = document.getElementById('terrain-erode-kind') as HTMLSelectElement | null;
export const terrainPaintLayer = document.getElementById('terrain-paint-layer') as HTMLSelectElement | null;

export const btnTerrainSpline = document.getElementById('btn-terrain-spline') as HTMLButtonElement | null;
export const terrainSplineSettings = document.getElementById('terrain-spline-settings') as HTMLElement | null;
export const btnTerrainSplineApply = document.getElementById('btn-terrain-spline-apply') as HTMLButtonElement | null;
export const btnTerrainSplineClear = document.getElementById('btn-terrain-spline-clear') as HTMLButtonElement | null;
export const terrainSplineWidth = document.getElementById('terrain-spline-width') as HTMLInputElement | null;

export const btnToggleGrid = document.getElementById('btn-toggle-grid') as HTMLButtonElement;
export const btnViewPossess = document.getElementById('btn-view-possess');
export const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement | null;
export const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement | null;
export const btnZoomReset = document.getElementById('btn-zoom-reset') as HTMLButtonElement | null;
export const btnZoomFrame = document.getElementById('btn-zoom-frame') as HTMLButtonElement | null;
export const btnTogglePostFx = document.getElementById('btn-toggle-postfx') as HTMLButtonElement | null;
export const cameraPresetSelect = document.getElementById('camera-preset-select') as HTMLSelectElement | null;

export const extruderDepth = document.getElementById('extruder-depth') as HTMLInputElement;
export const extruderUv = document.getElementById('extruder-uv') as HTMLInputElement;
export const btnExtrude = document.getElementById('btn-extrude');
export const svgDropZone = document.getElementById('svg-drop-zone');

export const tabChars = document.getElementById('tab-chars');
export const tabAnims = document.getElementById('tab-anims');
export const presetsContentArea = document.getElementById('presets-content-area');

export const tabInspTransform = document.getElementById('tab-insp-transform');
export const tabInspPhysics = document.getElementById('tab-insp-physics');
export const tabInspTweens = document.getElementById('tab-insp-tweens');
export const inspectorContent = document.getElementById('inspector-content');

export const tabDrawerAi = document.getElementById('tab-drawer-ai');
export const tabDrawerAssets = document.getElementById('tab-drawer-assets');
export const tabDrawerGames = document.getElementById('tab-drawer-games');
export const tabDrawerConsole = document.getElementById('tab-drawer-console');
export const tabDrawerTweens = document.getElementById('tab-drawer-tweens');
export const bottomDrawerContent = document.getElementById('bottom-drawer-content');

export const possessionBanner = document.getElementById('possession-banner');
export const possessionText = document.getElementById('possession-text');
export const btnFeatureHub = document.getElementById('btn-feature-hub') as HTMLButtonElement | null;
export const btnMixCopilot = document.getElementById('btn-mix-copilot') as HTMLButtonElement | null;
export const featureHubModalContainer = document.getElementById('feature-hub-modal-container');
