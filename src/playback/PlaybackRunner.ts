/**
 * DEPRECATED — the PlaybackRunner is now the SensoriumRunner
 * (`src/sensorium/SensoriumRunner.ts`). This shim aliases the old name so existing
 * imports keep working. Import { SensoriumRunner } from '../sensorium' in new code.
 */
export { SensoriumRunner, SensoriumRunner as PlaybackRunner } from '../sensorium/SensoriumRunner';
