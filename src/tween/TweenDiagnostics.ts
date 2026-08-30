import * as THREE from 'three';
import { TweenPool } from './TweenPool';
import type { TweenDirectorManager } from './TweenDirectorManager';
import type { TweenDiagnosticReport } from './types';

export class TweenDiagnostics {
  static generateReport(manager: TweenDirectorManager): TweenDiagnosticReport {
    const warnings: string[] = [];
    const errors: string[] = [];

    const activeTweens = manager.activeTweens;
    const activeSequences = manager.activeSequences;
    const poolStats = TweenPool.getPoolStats();

    if (activeTweens.length > 5000) {
      warnings.push(`High active tween count (${activeTweens.length} tweens). Consider pooling or killing finished tweens.`);
    }

    const tweenInfos = activeTweens.map((tw) => {
      // Validate target
      if (!tw.target) {
        errors.push(`Tween '${tw.id}' has null or destroyed target.`);
      }

      // Check for NaN or non-finite values in current state
      const curr = tw.currentValue;
      if (typeof curr === 'number' && !Number.isFinite(curr)) {
        errors.push(`Tween '${tw.id}' produced non-finite number: ${curr}`);
      } else if (curr instanceof THREE.Vector3) {
        if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y) || !Number.isFinite(curr.z)) {
          errors.push(`Tween '${tw.id}' produced non-finite Vector3: [${curr.x}, ${curr.y}, ${curr.z}]`);
        }
      } else if (curr instanceof THREE.Quaternion) {
        if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y) || !Number.isFinite(curr.z) || !Number.isFinite(curr.w)) {
          errors.push(`Tween '${tw.id}' produced non-finite Quaternion`);
        }
      }

      return {
        id: tw.id,
        targetName: typeof tw.target === 'object' && tw.target?.name ? tw.target.name : 'Target',
        property: tw.property,
        status: tw.status,
        elapsed: tw.elapsed,
        duration: tw.duration,
        progress: tw.progress,
        loopCount: tw.loopCount,
        ease: tw.easeName,
        conflictPolicy: tw.conflictPolicy,
        currentValue: tw.currentValue,
      };
    });

    const sequenceInfos = activeSequences.map((seq) => {
      return {
        id: seq.id,
        status: seq.status,
        elapsed: seq.elapsed,
        duration: seq.duration,
        progress: seq.progress,
        timeScale: seq.timeScale,
        activeTrackCount: seq.getTrackItems().length,
      };
    });

    return {
      activeTweenCount: activeTweens.length,
      activeSequenceCount: activeSequences.length,
      poolUsage: {
        vector3: poolStats.vector3,
        quaternion: poolStats.quaternion,
        euler: poolStats.euler,
        color: poolStats.color,
        tweenNodes: activeTweens.length,
      },
      activeTweens: tweenInfos,
      activeSequences: sequenceInfos,
      warnings,
      errors,
    };
  }
}
