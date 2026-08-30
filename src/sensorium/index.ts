/**
 * SENSORIUM — the AI's perception layer for the MIX Engine.
 *
 * Public barrel. Import everything sensorium from here:
 *   import { SensoriumRunner, buildScenario, type SensoriumReport } from '../sensorium';
 *
 * The legacy `PLAYBACK` surface (PlaybackRunner, PlaybackReport, …) is re-exported
 * as deprecated aliases so older scripts keep compiling.
 */
export * from './types';
export { TelemetryRecorder } from './TelemetryRecorder';
export type { TelemetrySnapshot, TelemetryEvent } from './TelemetryRecorder';
export { AnomalyDetector } from './AnomalyDetector';
export { FeelAnalyzer } from './FeelAnalyzer';
export { buildScenario } from './ScenarioLibrary';
export { VisionReportBuilder } from './VisionReportBuilder';
export { SensoriumRecorder } from './SensoriumRecorder';
export { SensoriumRunner } from './SensoriumRunner';

// ── Back-compat aliases (deprecated) ─────────────────────────────────────────
export { SensoriumRunner as PlaybackRunner } from './SensoriumRunner';
