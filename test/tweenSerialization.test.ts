import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Tween } from '../src/tween/Tween';
import { TweenSequence } from '../src/tween/TweenSequence';
import { TweenSerializer } from '../src/tween/TweenSerializer';
import type { SerializedSequence } from '../src/tween/types';

describe('TweenSerialization — JSON Declarative Assets & Migrations', () => {
  it('serializes a sequence into clean diff-friendly JSON without callbacks', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const seq = new TweenSequence({ id: 'door_sequence' });

    seq.append(new Tween(mesh, 'position.y', 5, { duration: 1.0, ease: 'cubicOut' }))
       .appendCallback(() => { /* do not serialize */ });

    const json = TweenSerializer.serialize(seq);
    expect(json.id).toBe('door_sequence');
    expect(json.version).toBe(1);
    expect(json.tracks.length).toBe(1);
    expect(json.tracks[0].property).toBe('position.y');
    expect(json.tracks[0].to).toBe(5);
    expect(json.tracks[0].duration).toBe(1.0);
  });

  it('validates schema requirements accurately', () => {
    const validJson: SerializedSequence = {
      id: 'valid_seq',
      version: 1,
      tracks: [
        {
          target: { entityId: 10 },
          property: 'position.y',
          to: 10,
          start: 0,
          duration: 2.0,
        },
      ],
    };

    const validResult = TweenSerializer.validate(validJson);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors.length).toBe(0);

    const invalidJson: any = {
      id: '',
      tracks: [{ duration: -1 }],
    };

    const invalidResult = TweenSerializer.validate(invalidJson);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it('deserializes declarative JSON into an executable sequence', () => {
    const json: SerializedSequence = {
      id: 'cutscene',
      version: 1,
      tracks: [
        {
          target: { ref: 'light' },
          property: 'intensity',
          to: 5.0,
          start: 0,
          duration: 1.0,
          ease: 'linear',
        },
      ],
      markers: [{ name: 'light_on', time: 1.0 }],
    };

    const result = TweenSerializer.deserialize(json);
    expect(result.errors.length).toBe(0);
    expect(result.sequence).not.toBeNull();
    expect(result.sequence?.id).toBe('cutscene');
    expect(result.sequence?.duration).toBe(1.0);
  });
});
