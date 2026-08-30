export type SilhouetteChannel = 'alpha' | 'luminance' | 'red' | 'green' | 'blue';

export interface HdrAuraProfile {
  bodyColor: string;
  detailColor: string;
  accentColor: string;
  hdrIntensity: number; // e.g. 1.0 - 4.0
  edgeGlowIntensity: number;
  distortionStrength: number;
  animationSpeed: number;
}

export interface ParticleEmissionProfile {
  emissionRate: number;
  particleSize: number;
  initialSpeed: number;
  lifetimeSeconds: number;
  trailLength: number;
  gravityModifier: number;
}

export interface ImageAttackProfile {
  id: string;
  name: string;
  channel: SilhouetteChannel;
  aura: HdrAuraProfile;
  particles: ParticleEmissionProfile;
}

export const DEFAULT_ATTACK_PROFILES: Record<string, ImageAttackProfile> = {
  radiant_burst: {
    id: 'radiant_burst',
    name: 'Radiant Burst',
    channel: 'alpha',
    aura: {
      bodyColor: '#ffd700',
      detailColor: '#ffffff',
      accentColor: '#ff8c00',
      hdrIntensity: 2.8,
      edgeGlowIntensity: 1.8,
      distortionStrength: 0.15,
      animationSpeed: 1.5,
    },
    particles: {
      emissionRate: 40,
      particleSize: 0.25,
      initialSpeed: 4.0,
      lifetimeSeconds: 0.8,
      trailLength: 0.5,
      gravityModifier: -0.2,
    },
  },
  shadow_vortex: {
    id: 'shadow_vortex',
    name: 'Shadow Vortex',
    channel: 'luminance',
    aura: {
      bodyColor: '#4b0082',
      detailColor: '#9400d3',
      accentColor: '#1a0033',
      hdrIntensity: 2.2,
      edgeGlowIntensity: 2.0,
      distortionStrength: 0.35,
      animationSpeed: 2.0,
    },
    particles: {
      emissionRate: 60,
      particleSize: 0.35,
      initialSpeed: 3.0,
      lifetimeSeconds: 1.2,
      trailLength: 0.8,
      gravityModifier: 0.0,
    },
  },
  flame_surge: {
    id: 'flame_surge',
    name: 'Flame Surge',
    channel: 'red',
    aura: {
      bodyColor: '#ff3300',
      detailColor: '#ffff00',
      accentColor: '#ff0055',
      hdrIntensity: 3.2,
      edgeGlowIntensity: 2.2,
      distortionStrength: 0.25,
      animationSpeed: 2.5,
    },
    particles: {
      emissionRate: 50,
      particleSize: 0.3,
      initialSpeed: 5.0,
      lifetimeSeconds: 0.6,
      trailLength: 0.6,
      gravityModifier: -0.8,
    },
  },
};
