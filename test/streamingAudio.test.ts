import { describe, it, expect, beforeEach } from 'vitest';
import { StreamingAudioBank } from '../src/audio/StreamingAudioBank';
import { InteractiveMusicDirector } from '../src/audio/InteractiveMusicDirector';

describe('StreamingAudioBank & InteractiveMusicDirector', () => {
  let bank: StreamingAudioBank;
  let director: InteractiveMusicDirector;

  beforeEach(() => {
    bank = new StreamingAudioBank();
    director = new InteractiveMusicDirector(bank);
  });

  it('plays, manages, and stops streaming audio tracks', () => {
    const track = bank.play('bgm_explore', 'audio/bgm_explore.mp3', {
      volume: 0.8,
      loop: true,
    });

    expect(track).toBeDefined();
    expect(track.id).toBe('bgm_explore');
    expect(track.volume).toBe(0.8);
    expect(track.isPlaying).toBe(true);

    bank.setVolume('bgm_explore', 0.5);
    expect(bank.getTrack('bgm_explore')?.volume).toBe(0.5);

    bank.stop('bgm_explore');
    expect(bank.getTrack('bgm_explore')?.isPlaying).toBe(false);
  });

  it('adjusts stem layers dynamically according to intensity levels in InteractiveMusicDirector', () => {
    director.playTheme({
      id: 'combat_theme',
      stems: [
        { name: 'base', src: 'audio/base.mp3', minIntensity: 0.0, maxIntensity: 1.0, baseVolume: 1.0 },
        { name: 'percussion', src: 'audio/drums.mp3', minIntensity: 0.3, maxIntensity: 0.8, baseVolume: 0.9 },
        { name: 'lead_brass', src: 'audio/brass.mp3', minIntensity: 0.7, maxIntensity: 1.0, baseVolume: 1.0 },
      ],
    });

    // At 0 intensity (calm) -> base is audible, percussion and brass are silent
    director.setIntensity(0.0);
    expect(bank.getTrack('stem_combat_theme_base')?.volume).toBe(1.0);
    expect(bank.getTrack('stem_combat_theme_percussion')?.volume).toBe(0);
    expect(bank.getTrack('stem_combat_theme_lead_brass')?.volume).toBe(0);

    // At 0.5 intensity (medium) -> percussion is partially active, brass is silent
    director.setIntensity(0.5);
    expect(bank.getTrack('stem_combat_theme_percussion')?.volume).toBeGreaterThan(0);
    expect(bank.getTrack('stem_combat_theme_lead_brass')?.volume).toBe(0);

    // At 1.0 intensity (maximum combat) -> all stems fully active
    director.setIntensity(1.0);
    expect(bank.getTrack('stem_combat_theme_base')?.volume).toBe(1.0);
    expect(bank.getTrack('stem_combat_theme_percussion')?.volume).toBeCloseTo(0.9);
    expect(bank.getTrack('stem_combat_theme_lead_brass')?.volume).toBeCloseTo(1.0);

    director.stopTheme();
    expect(bank.getTrack('stem_combat_theme_base')?.isPlaying).toBe(false);
  });

  it('uses bpm to quantize intensity transitions to a beat boundary', () => {
    director.playTheme({
      id: 'quantized', bpm: 120, quantize: 'beat',
      stems: [
        { name: 'base', src: 'base.ogg' },
        { name: 'drums', src: 'drums.ogg', minIntensity: 0.5 },
      ],
    });
    director.setIntensity(1);
    expect(bank.getTrack('stem_quantized_drums')?.volume).toBe(0);
    director.update(0.49);
    expect(bank.getTrack('stem_quantized_drums')?.volume).toBe(0);
    director.update(0.02);
    expect(bank.getTrack('stem_quantized_drums')?.volume).toBe(1);
  });
});
