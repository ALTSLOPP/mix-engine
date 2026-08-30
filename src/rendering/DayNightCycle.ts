import * as THREE from 'three';

/**
 * DayNightCycle.ts — an animated time-of-day system that makes an open world feel alive: the sun
 * arcs across the sky, its colour warms at dawn/dusk and dims to moonlight at night, and the fog
 * tracks the sky.
 *
 * COST DISCIPLINE: SkyEnvironment.setSunDirection re-renders a sky cube + PMREM-filters it (not
 * cheap), so calling it every frame would tank the frame rate. This class updates the cheap stuff
 * EVERY frame (shadow direction, sun colour/intensity, fog colour) but only RE-BAKES the sky IBL
 * when the sun has moved past `bakeStepDeg`. Pure time→value helpers are exported + Vitest-tested.
 */

/** Sun elevation above the horizon in degrees for a 24h clock hour (matches Engine.setTimeOfDay). */
export function elevationDeg(hour: number): number {
  return Math.sin(((hour - 6) / 12) * Math.PI) * 55;
}

/** 0 at night → 1 in full day, with a smooth dawn/dusk ramp around the horizon. */
export function daylight01(hour: number): number {
  return Math.min(1, Math.max(0, (elevationDeg(hour) + 3) / 12));
}

/** Unit direction FROM the scene TO the sun for a clock hour (same convention as the shadow sun). */
export function sunDirForHour(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg(hour));
  const theta = THREE.MathUtils.degToRad((hour / 24) * 360 - 90);
  return out.setFromSphericalCoords(1, phi, theta).normalize();
}

const SUN_DAY = new THREE.Color(0xfff4e6);   // warm white (matches the default sun colour)
const SUN_DUSK = new THREE.Color(0xff7a30);  // low-sun orange
const SUN_NIGHT = new THREE.Color(0x33406b); // cool moonlight
const FOG_DAY = new THREE.Color(0xaec6e4);
const FOG_DUSK = new THREE.Color(0xd98a5a);
const FOG_NIGHT = new THREE.Color(0x0a1020);

const MOON_INTENSITY = 0.06;
const DAY_INTENSITY = 2.4;

/** How orange the sun is — strongest right at the horizon, gone by ~22° elevation. */
function warmth(hour: number): number {
  return Math.min(1, Math.max(0, 1 - elevationDeg(hour) / 22));
}

/** Sun light colour: white at noon → orange near the horizon → blue moonlight at night. */
export function sunColorForHour(hour: number, out = new THREE.Color()): THREE.Color {
  const day = daylight01(hour);
  out.copy(SUN_DAY).lerp(SUN_DUSK, warmth(hour));
  out.lerp(SUN_NIGHT, 1 - day);
  return out;
}

/** Sun light intensity: a tiny moonlight floor at night up to a bright midday peak. */
export function sunIntensityForHour(hour: number): number {
  return MOON_INTENSITY + (DAY_INTENSITY - MOON_INTENSITY) * daylight01(hour);
}

/** Fog colour: hazy blue by day, warm at dusk, near-black at night. */
export function fogColorForHour(hour: number, out = new THREE.Color()): THREE.Color {
  const day = daylight01(hour);
  out.copy(FOG_DAY).lerp(FOG_DUSK, warmth(hour) * day);
  out.lerp(FOG_NIGHT, 1 - day);
  return out;
}

/** Plumbing the cycle drives. Split so the expensive sky re-bake is separate from cheap per-frame work. */
export interface DayNightDeps {
  /** Cheap: re-point the shadow sun (called every frame). */
  setShadowSunDirection(dir: THREE.Vector3): void;
  /** Expensive: re-render the sky cube + PMREM IBL for a new sun direction (throttled). */
  bakeSky(dir: THREE.Vector3): void;
  setSunColor(color: THREE.Color): void;
  setSunIntensity(intensity: number): void;
  setFogColor(color: THREE.Color): void;
}

export class DayNightCycle {
  enabled = false;
  hour = 12;
  /** Clock hours advanced per real second while enabled. 0.1 ⇒ a full day every 240 s. */
  speed = 0.1;
  /** Re-bake the sky once the sun has swung this many degrees since the last bake. */
  bakeStepDeg = 3;

  private readonly _dir = new THREE.Vector3();
  private readonly _color = new THREE.Color();
  private readonly _fog = new THREE.Color();
  private readonly _lastBakeDir = new THREE.Vector3(0, -1, 0); // forces a bake on the first apply

  constructor(private readonly deps: DayNightDeps) {}

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.applyNow(); // snap the world to the current hour the moment the cycle turns on
  }

  setHour(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
    this.applyNow(); // an explicit time set takes effect immediately, even when not animating
  }

  setSpeed(speed: number): void { this.speed = speed; }

  /** Per-frame: advance the clock (when enabled) and push cheap state; re-bake sky if the sun moved. */
  update(dt: number): void {
    if (!this.enabled) return;
    this.hour = (this.hour + dt * this.speed) % 24;
    if (this.hour < 0) this.hour += 24;
    this.apply(false);
  }

  /** Apply all state for the current hour AND force a sky bake (used on enable / explicit setHour). */
  applyNow(): void { this.apply(true); }

  private apply(forceBake: boolean): void {
    sunDirForHour(this.hour, this._dir);
    this.deps.setShadowSunDirection(this._dir);
    this.deps.setSunColor(sunColorForHour(this.hour, this._color));
    this.deps.setSunIntensity(sunIntensityForHour(this.hour));
    this.deps.setFogColor(fogColorForHour(this.hour, this._fog));

    // Throttle the expensive sky/IBL re-bake to whole-degree-ish steps of sun movement.
    const cosStep = Math.cos(THREE.MathUtils.degToRad(this.bakeStepDeg));
    if (forceBake || this._dir.dot(this._lastBakeDir) < cosStep) {
      this.deps.bakeSky(this._dir);
      this._lastBakeDir.copy(this._dir);
    }
  }

  info(): { enabled: boolean; hour: number; speed: number; daylight: number } {
    return { enabled: this.enabled, hour: this.hour, speed: this.speed, daylight: daylight01(this.hour) };
  }
}
