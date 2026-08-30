export interface IRParams {
  duration?: number; // seconds (default 2.0)
  decay?: number; // decay rate (default 2.0)
  preDelay?: number; // seconds before reflections begin (default 0.02)
  diffusion?: number; // reflection density (default 0.8)
  sampleRate?: number; // default 44100
}

export class IRGenerator {
  /**
   * Generates a stereo algorithmic impulse response AudioBuffer for Web Audio ConvolverNode.
   */
  static generate(ctx: BaseAudioContext, params: IRParams = {}): AudioBuffer {
    const duration = params.duration ?? 2.0;
    const decay = params.decay ?? 2.0;
    const preDelay = params.preDelay ?? 0.02;
    const diffusion = params.diffusion ?? 0.8;
    const sampleRate = params.sampleRate ?? ctx.sampleRate ?? 44100;

    const length = Math.floor(sampleRate * duration);
    const preDelaySamples = Math.floor(sampleRate * preDelay);
    const buffer = ctx.createBuffer(2, length, sampleRate);

    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      const t = (i - preDelaySamples) / (length - preDelaySamples);
      const envelope = Math.exp(-t * decay);

      // Noise burst with diffusion filter
      const whiteL = (Math.random() * 2 - 1) * envelope;
      const whiteR = (Math.random() * 2 - 1) * envelope;

      // Cross-feed diffusion
      left[i] = whiteL * diffusion + whiteR * (1 - diffusion);
      right[i] = whiteR * diffusion + whiteL * (1 - diffusion);
    }

    return buffer;
  }
}
