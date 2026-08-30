import type { RenderResolutionSettings } from '../../rendering/RenderResolution';

export interface PauseMenuConfig {
  enabled: boolean;
  title: string;
  pauseOnFocusLoss: boolean;
  showSettings: boolean;
}

export interface GameSettingsConfig extends RenderResolutionSettings {
  enabled: boolean;
  persist: boolean;
  storageKey: string;
  renderScale: number;
  exposure: number;
  fieldOfView: number;
  shadows: boolean;
  bloom: boolean;
  ambientOcclusion: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mouseSensitivity: number;
  invertY: boolean;
}

export interface ObjectiveDefinition {
  id: string;
  title: string;
  target: number;
  optional?: boolean;
}
export interface ObjectiveState extends ObjectiveDefinition { progress: number; completed: boolean }
export interface ObjectiveTrackerConfig { enabled: boolean; title: string; maxVisible: number; showCompleted: boolean; objectives: ObjectiveDefinition[] }
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';
export interface NotificationsConfig { enabled: boolean; duration: number; maxVisible: number }
export interface GameNotification { id: number; message: string; kind: NotificationKind; remaining: number }
export interface SessionFlowConfig { enabled: boolean; title: string; duration: number; targetScore: number; pauseOnEnd: boolean }
export interface SessionState { status: 'idle' | 'running' | 'won' | 'lost'; score: number; elapsed: number; remaining: number; message: string }

export function finiteRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
