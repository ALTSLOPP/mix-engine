import type { Engine } from '../engine/Engine';
import { Tween } from './Tween';
import { TweenSequence } from './TweenSequence';
import { TweenTargetResolver } from './TweenTargetResolver';
import type { SerializedSequence, SerializedTweenTrack } from './types';

export class TweenSerializer {
  static readonly CURRENT_VERSION = 1;

  /**
   * Validate a serialized JSON sequence. Returns errors array (empty if valid).
   */
  static validate(json: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!json || typeof json !== 'object') {
      errors.push('Sequence JSON must be an object');
      return { valid: false, errors };
    }

    if (typeof json.id !== 'string' || !json.id.trim()) {
      errors.push("Sequence must contain a non-empty 'id' string");
    }

    if (json.version === undefined) {
      errors.push("Missing 'version' field");
    } else if (typeof json.version !== 'number' || json.version < 1) {
      errors.push("Field 'version' must be a positive integer");
    }

    if (!Array.isArray(json.tracks)) {
      errors.push("Sequence must contain a 'tracks' array");
    } else {
      json.tracks.forEach((track: any, idx: number) => {
        if (!track || typeof track !== 'object') {
          errors.push(`Track[${idx}] must be an object`);
          return;
        }
        if (!track.property || typeof track.property !== 'string') {
          errors.push(`Track[${idx}] missing 'property' string`);
        }
        if (typeof track.start !== 'number' || track.start < 0) {
          errors.push(`Track[${idx}] 'start' must be non-negative number`);
        }
        if (typeof track.duration !== 'number' || track.duration < 0) {
          errors.push(`Track[${idx}] 'duration' must be non-negative number`);
        }
        if (track.to === undefined) {
          errors.push(`Track[${idx}] missing 'to' target value`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Serialize a TweenSequence into diff-friendly JSON format.
   */
  static serialize(sequence: TweenSequence): SerializedSequence {
    const tracks: SerializedTweenTrack[] = [];

    for (const item of sequence.getTrackItems()) {
      if (item.kind === 'tween' && item.tween) {
        const tw = item.tween;
        tracks.push({
          target: {
            entityId: (tw.target as any)?.entityId,
            ref: typeof tw.target === 'string' ? tw.target : undefined,
          },
          property: tw.property,
          from: tw.fromValue,
          to: tw.toValue,
          start: item.startTime,
          duration: tw.duration,
          ease: tw.easeName,
          loops: tw.loops > 1 ? tw.loops : undefined,
          loopType: tw.loops > 1 ? tw.loopType : undefined,
          conflictPolicy: tw.conflictPolicy !== 'replace' ? tw.conflictPolicy : undefined,
          physicsPolicy: tw.physicsPolicy !== 'visual_only' ? tw.physicsPolicy : undefined,
          stringMode: tw.stringMode !== 'typewriter' ? tw.stringMode : undefined,
        });
      }
    }

    return {
      id: sequence.id,
      version: TweenSerializer.CURRENT_VERSION,
      clock: sequence.updateMode,
      loops: sequence.loops > 1 ? sequence.loops : undefined,
      loopType: sequence.loops > 1 ? sequence.loopType : undefined,
      tracks,
    };
  }

  /**
   * Deserialize a JSON sequence definition into an executable runtime TweenSequence.
   */
  static deserialize(
    json: SerializedSequence,
    engine?: Engine,
  ): { sequence: TweenSequence | null; errors: string[] } {
    const validation = TweenSerializer.validate(json);
    if (!validation.valid) {
      return { sequence: null, errors: validation.errors };
    }

    // Apply migrations if version is older
    const migrated = TweenSerializer.migrate(json);

    const seq = new TweenSequence({
      id: migrated.id,
      updateMode: migrated.clock ?? 'normal',
      loops: migrated.loops,
      loopType: migrated.loopType,
      conflictPolicy: migrated.defaults?.conflictPolicy,
    });

    for (const trackDef of migrated.tracks) {
      const targetInput =
        trackDef.target.entityId ??
        trackDef.target.entityName ??
        trackDef.target.ref ??
        trackDef.target.path;

      const resolved = TweenTargetResolver.resolve(
        targetInput,
        trackDef.property,
        engine,
      );

      const targetObj = resolved?.rawTarget ?? {};
      const prop = resolved?.resolvedProperty ?? trackDef.property;

      const tw = new Tween(targetObj, prop, trackDef.to, {
        duration: trackDef.duration,
        ease: trackDef.ease ?? migrated.defaults?.ease ?? 'linear',
        easeParams: trackDef.easeParams,
        loops: trackDef.loops,
        loopType: trackDef.loopType,
        conflictPolicy: trackDef.conflictPolicy ?? migrated.defaults?.conflictPolicy ?? 'replace',
        physicsPolicy: trackDef.physicsPolicy ?? 'visual_only',
        stringMode: trackDef.stringMode as any,
        autoPlay: false,
      });

      if (trackDef.from !== undefined) {
        tw.setFrom(trackDef.from);
      }

      seq.insert(trackDef.start, tw);
    }

    if (migrated.markers) {
      for (const m of migrated.markers) {
        seq.addMarker(m.name, m.time);
      }
    }

    return { sequence: seq, errors: [] };
  }

  /**
   * Migrate older sequence versions up to CURRENT_VERSION.
   */
  static migrate(json: SerializedSequence): SerializedSequence {
    let current = { ...json };

    if (current.version < 1) {
      current.version = 1;
    }

    return current;
  }
}
