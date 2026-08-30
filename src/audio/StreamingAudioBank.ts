import * as THREE from 'three';

export interface StreamTrackOptions {
  volume?: number;
  loop?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export interface StreamTrackState {
  id: string;
  src: string;
  element: HTMLAudioElement | null;
  volume: number;
  targetVolume: number;
  loop: boolean;
  isPlaying: boolean;
  /** Volume units per second while ramping; 0 = snap straight to targetVolume. */
  fadeRate: number;
  /** Stop the element once a fade-out reaches silence. */
  stopAtSilence: boolean;
}

/**
 * StreamingAudioBank.ts — Memory-efficient streaming audio playback for BGM and Ambience.
 * Avoids loading long audio files into memory as Web Audio `AudioBuffer`, utilizing
 * HTML5 Audio streaming buffers.
 */
export class StreamingAudioBank {
  private readonly tracks = new Map<string, StreamTrackState>();
  private activeMusicTrack: string | null = null;
  private masterVolume = 1.0;

  constructor() {}

  /** Play or stream an audio track by ID and URL. */
  play(id: string, src: string, opts: StreamTrackOptions = {}): StreamTrackState {
    const volume = opts.volume ?? 1.0;
    const loop = opts.loop ?? true;

    let track = this.tracks.get(id);
    if (!track) {
      let el: HTMLAudioElement | null = null;
      if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
        try {
          el = new Audio(src);
          el.loop = loop;
          el.volume = THREE.MathUtils.clamp(volume * this.masterVolume, 0, 1);
        } catch {
          el = null;
        }
      }

      track = {
        id,
        src,
        element: el,
        volume,
        targetVolume: volume,
        loop,
        isPlaying: false,
        fadeRate: 0,
        stopAtSilence: false,
      };
      this.tracks.set(id, track);
    } else {
      track.src = src;
      track.targetVolume = volume;
      track.loop = loop;
      if (track.element) {
        // Re-assigning .src restarts the stream from zero; skip it when the caller
        // is just re-triggering the same track.
        if (track.element.src !== src && !track.element.src.endsWith(src)) {
          track.element.src = src;
        }
        track.element.loop = loop;
      }
    }

    track.stopAtSilence = false;
    const fadeIn = opts.fadeInDuration ?? 0;
    if (fadeIn > 0) {
      track.volume = 0;
      track.fadeRate = volume / fadeIn;
    } else {
      track.volume = volume;
      track.fadeRate = 0;
    }
    this.applyElementVolume(track);

    if (track.element) {
      try {
        const playPromise = track.element.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay policy or fetch error handled gracefully
          });
        }
      } catch {
        // Safe fallback
      }
    }
    track.isPlaying = true;
    return track;
  }

  /**
   * Advance all in-flight volume ramps. Call once per frame from the audio update —
   * fades are cooperative, nothing interpolates without this.
   */
  update(dt: number): void {
    if (dt <= 0) return;
    for (const track of this.tracks.values()) {
      if (track.volume === track.targetVolume) continue;

      const diff = track.targetVolume - track.volume;
      const step = track.fadeRate > 0 ? track.fadeRate * dt : Math.abs(diff);
      track.volume = Math.abs(diff) <= step
        ? track.targetVolume
        : track.volume + Math.sign(diff) * step;

      this.applyElementVolume(track);

      if (track.stopAtSilence && track.volume <= 0) {
        this.stop(track.id);
        track.stopAtSilence = false;
      }
    }
  }

  private applyElementVolume(track: StreamTrackState): void {
    if (!track.element) return;
    try {
      track.element.volume = THREE.MathUtils.clamp(track.volume * this.masterVolume, 0, 1);
    } catch {
      // Element detached mid-fade
    }
  }

  /** Stop a streaming track immediately. Use fadeOut() for a ramp. */
  stop(id: string): void {
    const track = this.tracks.get(id);
    if (!track) return;

    if (track.element) {
      try {
        track.element.pause();
        track.element.currentTime = 0;
      } catch {}
    }
    track.isPlaying = false;
  }

  /** Ramp a track down to silence over `duration` seconds, then stop it. */
  fadeOut(id: string, duration = 1.0): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.targetVolume = 0;
    track.fadeRate = duration > 0 ? track.volume / duration : 0;
    track.stopAtSilence = true;
  }

  /**
   * Crossfade between the current music track and a new one. Both ramps are driven
   * by update(dt) — the previous implementation set targetVolume (which nothing
   * read) and hard-stopped the old track on a setTimeout, so it was an audible cut.
   */
  crossfade(newId: string, src: string, duration = 2.0, opts: StreamTrackOptions = {}): void {
    if (this.activeMusicTrack && this.activeMusicTrack !== newId) {
      this.fadeOut(this.activeMusicTrack, duration);
    }

    this.activeMusicTrack = newId;
    this.play(newId, src, {
      ...opts,
      volume: opts.volume ?? 1.0,
      fadeInDuration: opts.fadeInDuration ?? duration,
    });
  }

  /** Fade out the active music stream without affecting ambience/stems. */
  stopMusic(duration = 1.0): void {
    if (!this.activeMusicTrack) return;
    const id = this.activeMusicTrack;
    this.activeMusicTrack = null;
    if (duration > 0) this.fadeOut(id, duration);
    else this.stop(id);
  }

  get currentMusicSrc(): string | null {
    return this.activeMusicTrack
      ? this.tracks.get(this.activeMusicTrack)?.src ?? null
      : null;
  }

  /** Set track volume (0 to 1). */
  setVolume(id: string, volume: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.volume = THREE.MathUtils.clamp(volume, 0, 1);
    track.targetVolume = track.volume;
    track.fadeRate = 0;
    track.stopAtSilence = false;
    this.applyElementVolume(track);
  }

  /** Set global streaming master volume multiplier. */
  setMasterVolume(v: number): void {
    this.masterVolume = THREE.MathUtils.clamp(v, 0, 1);
    for (const track of this.tracks.values()) {
      this.applyElementVolume(track);
    }
  }

  /** Get track state. */
  getTrack(id: string): StreamTrackState | undefined {
    return this.tracks.get(id);
  }

  /** Correct drift among independently streamed stems. HTML media playback cannot be
   * sample-scheduled like AudioBufferSourceNode, so the bank keeps their media clocks
   * phase-locked and only seeks when drift exceeds the audible tolerance. */
  synchronize(ids: string[], toleranceSeconds = 0.025): void {
    const leader = ids.map((id) => this.tracks.get(id)).find((track) => track?.isPlaying && track.element)?.element;
    if (!leader) return;
    for (const id of ids) {
      const element = this.tracks.get(id)?.element;
      if (!element || element === leader) continue;
      if (Math.abs(element.currentTime - leader.currentTime) > toleranceSeconds) {
        try { element.currentTime = leader.currentTime; } catch { /* media not seekable yet */ }
      }
    }
  }

  /** Dispose all active audio streams. */
  dispose(): void {
    for (const track of this.tracks.values()) {
      if (track.element) {
        try {
          track.element.pause();
          track.element.src = '';
        } catch {}
      }
    }
    this.tracks.clear();
    this.activeMusicTrack = null;
  }
}
