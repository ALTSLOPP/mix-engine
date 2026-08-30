import type { FeatureDescriptor } from './types';
import type { GameSettingsConfig, NotificationsConfig, ObjectiveTrackerConfig, PauseMenuConfig, SessionFlowConfig } from './GeneralFeatureTypes';

const enabled = { key: 'enabled', label: 'Feature enabled', type: 'boolean' as const, default: true };
export const generalFeatureDescriptors: FeatureDescriptor<any>[] = [
  {
    id: 'pause_menu', name: 'Pause Menu', category: 'general', icon: '⏸',
    description: 'Escape to pause simulation, release the cursor, and open an accessible resume/settings menu. Optional pause when the page is hidden.',
    tags: ['pause', 'menu', 'escape', 'essentials'],
    defaultConfig: { enabled: true, title: 'Your game', pauseOnFocusLoss: true, showSettings: true } satisfies PauseMenuConfig,
    properties: [enabled, { key: 'title', label: 'Game title', type: 'string', default: 'Your game' }, { key: 'pauseOnFocusLoss', label: 'Pause when page is hidden', type: 'boolean', default: true }, { key: 'showSettings', label: 'Show settings pages', type: 'boolean', default: true }],
  },
  {
    id: 'game_settings', name: 'Player Settings', category: 'general', icon: '⚙',
    description: 'Live graphics, resolution scale, camera FOV, audio bus levels, mouse sensitivity and invert-Y settings. Optional browser-local preference persistence.',
    tags: ['settings', 'graphics', 'visual', 'audio', 'controls'],
    defaultConfig: { enabled: true, persist: true, storageKey: 'mix-player-settings', renderScale: 1, exposure: 0.6, fieldOfView: 58, shadows: true, bloom: true, ambientOcclusion: true, masterVolume: 1, musicVolume: 1, sfxVolume: 1, mouseSensitivity: 0.0025, invertY: false } satisfies GameSettingsConfig,
    properties: [enabled, { key: 'persist', label: 'Remember player preferences', type: 'boolean', default: true }, { key: 'storageKey', label: 'Preference storage namespace', type: 'string', default: 'mix-player-settings' }, { key: 'renderScale', label: 'Resolution scale', type: 'number', min: 0.5, max: 1.5, step: 0.05, default: 1 }, { key: 'fieldOfView', label: 'Field of view', type: 'number', min: 45, max: 100, step: 1, default: 58 }, { key: 'exposure', label: 'Exposure', type: 'number', min: 0.2, max: 2, step: 0.05, default: 0.6 }, { key: 'shadows', label: 'Dynamic shadows', type: 'boolean', default: true }, { key: 'bloom', label: 'Bloom', type: 'boolean', default: true }, { key: 'ambientOcclusion', label: 'Ambient occlusion', type: 'boolean', default: true }],
  },
  {
    id: 'objective_tracker', name: 'Objective Tracker', category: 'general', icon: '◎',
    description: 'Reusable named objectives with progress, optional goals, completion events, and an in-game HUD plus pause-menu checklist.',
    tags: ['objectives', 'tasks', 'progress', 'hud'],
    defaultConfig: { enabled: true, title: 'Objectives', maxVisible: 3, showCompleted: false, objectives: [] } satisfies ObjectiveTrackerConfig,
    properties: [enabled, { key: 'title', label: 'Panel title', type: 'string', default: 'Objectives' }, { key: 'maxVisible', label: 'Visible HUD objectives', type: 'number', min: 1, max: 8, step: 1, default: 3 }, { key: 'showCompleted', label: 'Keep completed objectives in HUD', type: 'boolean', default: false }],
  },
  {
    id: 'game_notifications', name: 'Game Notifications', category: 'general', icon: '◈',
    description: 'Bounded, dismissible in-game notifications for pickups, tutorials, errors and objective completions. UI timers continue while paused.',
    tags: ['notifications', 'toast', 'tutorial', 'feedback'],
    defaultConfig: { enabled: true, duration: 4, maxVisible: 3 } satisfies NotificationsConfig,
    properties: [enabled, { key: 'duration', label: 'Notification duration', type: 'number', min: 0.5, max: 30, step: 0.5, default: 4 }, { key: 'maxVisible', label: 'Maximum visible messages', type: 'number', min: 1, max: 8, step: 1, default: 3 }],
  },
  {
    id: 'session_flow', name: 'Score, Timer & Results', category: 'general', icon: '⚑',
    description: 'Start/reset a round, track score and elapsed time, configure a target score or time limit, and present win/lose results. Scene resets remain game-authored.',
    tags: ['score', 'timer', 'victory', 'results', 'round'],
    defaultConfig: { enabled: true, title: 'Round', duration: 0, targetScore: 0, pauseOnEnd: true } satisfies SessionFlowConfig,
    properties: [enabled, { key: 'title', label: 'Round title', type: 'string', default: 'Round' }, { key: 'duration', label: 'Time limit (0 = unlimited)', type: 'number', min: 0, max: 86400, step: 1, default: 0 }, { key: 'targetScore', label: 'Winning score (0 = manual)', type: 'number', min: 0, max: 1000000000, step: 1, default: 0 }, { key: 'pauseOnEnd', label: 'Pause on results', type: 'boolean', default: true }],
  },
];
