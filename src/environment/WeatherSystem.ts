import * as THREE from 'three';
import type { EventBus } from '../ecs/EventBus';

export type WeatherType = 'clear' | 'rain' | 'storm' | 'snow' | 'foggy';

export interface WeatherStateParams {
  rainIntensity: number; // 0..1
  snowIntensity: number; // 0..1
  cloudCover: number; // 0..1
  windSpeed: number; // m/s
  fogDensity: number;
}

const WEATHER_PRESETS: Record<WeatherType, WeatherStateParams> = {
  clear: { rainIntensity: 0, snowIntensity: 0, cloudCover: 0.1, windSpeed: 2.0, fogDensity: 0.005 },
  rain: { rainIntensity: 0.7, snowIntensity: 0, cloudCover: 0.8, windSpeed: 8.0, fogDensity: 0.02 },
  storm: { rainIntensity: 1.0, snowIntensity: 0, cloudCover: 1.0, windSpeed: 18.0, fogDensity: 0.035 },
  snow: { rainIntensity: 0, snowIntensity: 0.8, cloudCover: 0.9, windSpeed: 4.0, fogDensity: 0.025 },
  foggy: { rainIntensity: 0.1, snowIntensity: 0, cloudCover: 0.6, windSpeed: 1.0, fogDensity: 0.08 },
};

export class WeatherSystem {
  currentWeather: WeatherType = 'clear';
  targetWeather: WeatherType = 'clear';

  rainIntensity = 0;
  snowIntensity = 0;
  cloudCover = 0.1;
  windSpeed = 2.0;
  fogDensity = 0.005;

  wetness = 0; // Surface wetness 0..1

  private startParams: WeatherStateParams = { ...WEATHER_PRESETS.clear };
  private transitionDuration = 5.0;
  private transitionTime = 5.0;
  private lightningTimer = 0;
  private nextLightningAt: number;

  constructor(
    private readonly eventBus?: EventBus,
    private readonly random: () => number = Math.random,
  ) {
    this.nextLightningAt = this.sampleLightningInterval();
  }

  setWeather(type: WeatherType, transitionDuration = 5.0): void {
    this.targetWeather = type;
    this.startParams = {
      rainIntensity: this.rainIntensity,
      snowIntensity: this.snowIntensity,
      cloudCover: this.cloudCover,
      windSpeed: this.windSpeed,
      fogDensity: this.fogDensity,
    };
    this.transitionDuration = Math.max(transitionDuration, 0.1);
    this.transitionTime = 0;
  }

  update(dt: number): void {
    // 1. Weather transition interpolation
    if (this.transitionTime < this.transitionDuration) {
      this.transitionTime += dt;
      const alpha = THREE.MathUtils.clamp(this.transitionTime / this.transitionDuration, 0, 1);
      const target = WEATHER_PRESETS[this.targetWeather];

      this.rainIntensity = THREE.MathUtils.lerp(this.startParams.rainIntensity, target.rainIntensity, alpha);
      this.snowIntensity = THREE.MathUtils.lerp(this.startParams.snowIntensity, target.snowIntensity, alpha);
      this.cloudCover = THREE.MathUtils.lerp(this.startParams.cloudCover, target.cloudCover, alpha);
      this.windSpeed = THREE.MathUtils.lerp(this.startParams.windSpeed, target.windSpeed, alpha);
      this.fogDensity = THREE.MathUtils.lerp(this.startParams.fogDensity, target.fogDensity, alpha);

      if (alpha >= 1.0) {
        this.currentWeather = this.targetWeather;
      }
    }

    // 2. Wetness accumulation and drying
    if (this.rainIntensity > 0.2) {
      this.wetness = Math.min(this.wetness + dt * 0.1 * this.rainIntensity, 1.0);
    } else {
      this.wetness = Math.max(this.wetness - dt * 0.02, 0.0);
    }

    // 3. Storm lightning simulation
    if (this.currentWeather === 'storm') {
      this.lightningTimer += dt;
      if (this.lightningTimer >= this.nextLightningAt) {
        this.lightningTimer -= this.nextLightningAt;
        this.nextLightningAt = this.sampleLightningInterval();
        this.eventBus?.emit('weather_lightning', {
          intensity: 1.0 + this.random() * 2.0,
          duration: 0.15,
        });
      }
    } else {
      this.lightningTimer = 0;
    }
  }

  private sampleLightningInterval(): number {
    return 8.0 + this.random() * 6.0;
  }
}
