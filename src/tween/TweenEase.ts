import type { EaseFunction, EaseName, EaseParams } from './types';

const PI = Math.PI;
const HALF_PI = PI / 2;

export class TweenEase {
  private static registry = new Map<string, EaseFunction>();

  // --- Easing Implementations ---

  // Linear
  static linear(t: number): number {
    return t;
  }

  // Sine
  static sineIn(t: number): number {
    return 1 - Math.cos(t * HALF_PI);
  }

  static sineOut(t: number): number {
    return Math.sin(t * HALF_PI);
  }

  static sineInOut(t: number): number {
    return -(Math.cos(PI * t) - 1) / 2;
  }

  // Quad
  static quadIn(t: number): number {
    return t * t;
  }

  static quadOut(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  static quadInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Cubic
  static cubicIn(t: number): number {
    return t * t * t;
  }

  static cubicOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  static cubicInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Quart
  static quartIn(t: number): number {
    return t * t * t * t;
  }

  static quartOut(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  static quartInOut(t: number): number {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  }

  // Quint
  static quintIn(t: number): number {
    return t * t * t * t * t;
  }

  static quintOut(t: number): number {
    return 1 - Math.pow(1 - t, 5);
  }

  static quintInOut(t: number): number {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  // Expo
  static expoIn(t: number): number {
    return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
  }

  static expoOut(t: number): number {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  static expoInOut(t: number): number {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  }

  // Circ
  static circIn(t: number): number {
    return 1 - Math.sqrt(Math.max(0, 1 - Math.pow(t, 2)));
  }

  static circOut(t: number): number {
    return Math.sqrt(Math.max(0, 1 - Math.pow(t - 1, 2)));
  }

  static circInOut(t: number): number {
    return t < 0.5
      ? (1 - Math.sqrt(Math.max(0, 1 - Math.pow(2 * t, 2)))) / 2
      : (Math.sqrt(Math.max(0, 1 - Math.pow(-2 * t + 2, 2))) + 1) / 2;
  }

  // Back (default s = 1.70158)
  static backIn(t: number, s = 1.70158): number {
    return (s + 1) * t * t * t - s * t * t;
  }

  static backOut(t: number, s = 1.70158): number {
    const t1 = t - 1;
    return 1 + (s + 1) * t1 * t1 * t1 + s * t1 * t1;
  }

  static backInOut(t: number, s = 1.70158): number {
    const s2 = s * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((s2 + 1) * 2 * t - s2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((s2 + 1) * (t * 2 - 2) + s2) + 2) / 2;
  }

  // Elastic
  static elasticIn(t: number, amplitude = 1, period = 0.3): number {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const s = (period / (2 * PI)) * Math.asin(1 / Math.max(1, amplitude));
    const t1 = t - 1;
    return -(amplitude * Math.pow(2, 10 * t1) * Math.sin(((t1 - s) * (2 * PI)) / period));
  }

  static elasticOut(t: number, amplitude = 1, period = 0.3): number {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const s = (period / (2 * PI)) * Math.asin(1 / Math.max(1, amplitude));
    return amplitude * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * PI)) / period) + 1;
  }

  static elasticInOut(t: number, amplitude = 1, period = 0.45): number {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const s = (period / (2 * PI)) * Math.asin(1 / Math.max(1, amplitude));
    const t2 = t * 2 - 1;
    if (t2 < 0) {
      return -0.5 * (amplitude * Math.pow(2, 10 * t2) * Math.sin(((t2 - s) * (2 * PI)) / period));
    }
    return amplitude * Math.pow(2, -10 * t2) * Math.sin(((t2 - s) * (2 * PI)) / period) * 0.5 + 1;
  }

  // Bounce
  static bounceOut(t: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      const t1 = t - 1.5 / d1;
      return n1 * t1 * t1 + 0.75;
    } else if (t < 2.5 / d1) {
      const t1 = t - 2.25 / d1;
      return n1 * t1 * t1 + 0.9375;
    } else {
      const t1 = t - 2.625 / d1;
      return n1 * t1 * t1 + 0.984375;
    }
  }

  static bounceIn(t: number): number {
    return 1 - TweenEase.bounceOut(1 - t);
  }

  static bounceInOut(t: number): number {
    return t < 0.5
      ? (1 - TweenEase.bounceOut(1 - 2 * t)) / 2
      : (1 + TweenEase.bounceOut(2 * t - 1)) / 2;
  }

  // Smoothstep & Smootherstep
  static smoothstep(t: number): number {
    const clamped = Math.min(Math.max(t, 0), 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  static smootherstep(t: number): number {
    const clamped = Math.min(Math.max(t, 0), 1);
    return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
  }

  // Cubic Bézier Solver
  static cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFunction {
    return (t: number): number => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;

      // Newton-Raphson iteration to solve for curve parameter u given x=t
      let u = t;
      for (let i = 0; i < 8; i++) {
        const u2 = u * u;
        const u3 = u2 * u;
        const oneMinusU = 1 - u;
        const oneMinusU2 = oneMinusU * oneMinusU;

        // B(u)_x = 3*(1-u)^2*u*x1 + 3*(1-u)*u^2*x2 + u^3
        const currentX = 3 * oneMinusU2 * u * x1 + 3 * oneMinusU * u2 * x2 + u3;
        const dx = 3 * oneMinusU2 * x1 + 6 * oneMinusU * u * (x2 - x1) + 3 * u2 * (1 - x2);

        if (Math.abs(dx) < 1e-6) break;
        const err = currentX - t;
        u -= err / dx;
        u = Math.min(Math.max(u, 0), 1);
        if (Math.abs(err) < 1e-6) break;
      }

      // Evaluate y at parameter u
      const u2 = u * u;
      const u3 = u2 * u;
      const oneMinusU = 1 - u;
      const oneMinusU2 = oneMinusU * oneMinusU;
      return 3 * oneMinusU2 * u * y1 + 3 * oneMinusU * u2 * y2 + u3;
    };
  }

  // Keyframe / Animation Curve Easing
  static createKeyframeEase(keyframes: Array<{ t: number; v: number }>): EaseFunction {
    if (!keyframes || keyframes.length === 0) return TweenEase.linear;
    const sorted = [...keyframes].sort((a, b) => a.t - b.t);

    return (t: number): number => {
      if (t <= sorted[0].t) return sorted[0].v;
      if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v;

      for (let i = 0; i < sorted.length - 1; i++) {
        const k0 = sorted[i];
        const k1 = sorted[i + 1];
        if (t >= k0.t && t <= k1.t) {
          const segDuration = k1.t - k0.t;
          if (segDuration === 0) return k0.v;
          const localT = (t - k0.t) / segDuration;
          return k0.v + (k1.v - k0.v) * localT;
        }
      }
      return sorted[sorted.length - 1].v;
    };
  }

  // --- Registration & Resolution ---

  static register(name: string, fn: EaseFunction): void {
    TweenEase.registry.set(name.toLowerCase(), fn);
  }

  static get(ease: EaseName | EaseFunction | string = 'linear', params?: EaseParams): EaseFunction {
    if (typeof ease === 'function') {
      return ease;
    }

    if (params?.bezier) {
      const [x1, y1, x2, y2] = params.bezier;
      return TweenEase.cubicBezier(x1, y1, x2, y2);
    }

    const key = ease.toLowerCase();

    // Check custom registry first
    const custom = TweenEase.registry.get(key);
    if (custom) return custom;

    // Check built-in functions
    switch (key) {
      case 'linear': return TweenEase.linear;
      case 'sinein': return TweenEase.sineIn;
      case 'sineout': return TweenEase.sineOut;
      case 'sineinout': return TweenEase.sineInOut;
      case 'quadin': return TweenEase.quadIn;
      case 'quadout': return TweenEase.quadOut;
      case 'quadinout': return TweenEase.quadInOut;
      case 'cubicin': return TweenEase.cubicIn;
      case 'cubicout': return TweenEase.cubicOut;
      case 'cubicinout': return TweenEase.cubicInOut;
      case 'quartin': return TweenEase.quartIn;
      case 'quartout': return TweenEase.quartOut;
      case 'quartinout': return TweenEase.quartInOut;
      case 'quintin': return TweenEase.quintIn;
      case 'quintout': return TweenEase.quintOut;
      case 'quintinout': return TweenEase.quintInOut;
      case 'expoin': return TweenEase.expoIn;
      case 'expoout': return TweenEase.expoOut;
      case 'expoinout': return TweenEase.expoInOut;
      case 'circin': return TweenEase.circIn;
      case 'circout': return TweenEase.circOut;
      case 'circinout': return TweenEase.circInOut;
      case 'backin':
        return params?.overshoot !== undefined
          ? (t) => TweenEase.backIn(t, params.overshoot)
          : TweenEase.backIn;
      case 'backout':
        return params?.overshoot !== undefined
          ? (t) => TweenEase.backOut(t, params.overshoot)
          : TweenEase.backOut;
      case 'backinout':
        return params?.overshoot !== undefined
          ? (t) => TweenEase.backInOut(t, params.overshoot)
          : TweenEase.backInOut;
      case 'elasticin':
        return (t) => TweenEase.elasticIn(t, params?.amplitude, params?.period);
      case 'elasticout':
        return (t) => TweenEase.elasticOut(t, params?.amplitude, params?.period);
      case 'elasticinout':
        return (t) => TweenEase.elasticInOut(t, params?.amplitude, params?.period);
      case 'bouncein': return TweenEase.bounceIn;
      case 'bounceout': return TweenEase.bounceOut;
      case 'bounceinout': return TweenEase.bounceInOut;
      case 'smoothstep': return TweenEase.smoothstep;
      case 'smootherstep': return TweenEase.smootherstep;
      default:
        return TweenEase.linear;
    }
  }

  static allNames(): EaseName[] {
    return [
      'linear',
      'sineIn',
      'sineOut',
      'sineInOut',
      'quadIn',
      'quadOut',
      'quadInOut',
      'cubicIn',
      'cubicOut',
      'cubicInOut',
      'quartIn',
      'quartOut',
      'quartInOut',
      'quintIn',
      'quintOut',
      'quintInOut',
      'expoIn',
      'expoOut',
      'expoInOut',
      'circIn',
      'circOut',
      'circInOut',
      'backIn',
      'backOut',
      'backInOut',
      'elasticIn',
      'elasticOut',
      'elasticInOut',
      'bounceIn',
      'bounceOut',
      'bounceInOut',
      'smoothstep',
      'smootherstep',
    ];
  }
}
