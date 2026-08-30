export type ElementalMotionType = 'flame' | 'flow' | 'electric' | 'vortex' | 'shards';
export type ElementType = 'fire' | 'water' | 'electric' | 'earth' | 'wind' | 'light' | 'dark';

export interface ElementalVfxDefinition {
  element: ElementType;
  motion: ElementalMotionType;
  primaryColor: string;
  secondaryColor: string;
  particleCount: number;
  particleSize: number;
  speed: number;
  lifetime: number;
  trailEnabled: boolean;
  impactFlashColor: string;
  soundCue?: string;
}

export const ELEMENTAL_VFX_PRESETS: Record<ElementType, ElementalVfxDefinition> = {
  fire: {
    element: 'fire',
    motion: 'flame',
    primaryColor: '#ff4500',
    secondaryColor: '#ffd700',
    particleCount: 35,
    particleSize: 0.35,
    speed: 6.0,
    lifetime: 0.7,
    trailEnabled: true,
    impactFlashColor: '#ff2200',
    soundCue: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
  },
  water: {
    element: 'water',
    motion: 'flow',
    primaryColor: '#00bfff',
    secondaryColor: '#e0ffff',
    particleCount: 40,
    particleSize: 0.25,
    speed: 5.5,
    lifetime: 0.9,
    trailEnabled: true,
    impactFlashColor: '#0088ff',
  },
  electric: {
    element: 'electric',
    motion: 'electric',
    primaryColor: '#ffff00',
    secondaryColor: '#00ffff',
    particleCount: 50,
    particleSize: 0.18,
    speed: 12.0,
    lifetime: 0.4,
    trailEnabled: true,
    impactFlashColor: '#ffffff',
  },
  earth: {
    element: 'earth',
    motion: 'shards',
    primaryColor: '#8b4513',
    secondaryColor: '#deb887',
    particleCount: 25,
    particleSize: 0.45,
    speed: 4.5,
    lifetime: 1.0,
    trailEnabled: false,
    impactFlashColor: '#d2b48c',
  },
  wind: {
    element: 'wind',
    motion: 'vortex',
    primaryColor: '#98fb98',
    secondaryColor: '#f0fff0',
    particleCount: 45,
    particleSize: 0.2,
    speed: 7.5,
    lifetime: 0.8,
    trailEnabled: true,
    impactFlashColor: '#b0e0e6',
  },
  light: {
    element: 'light',
    motion: 'flame',
    primaryColor: '#fff8dc',
    secondaryColor: '#ffd700',
    particleCount: 30,
    particleSize: 0.3,
    speed: 8.0,
    lifetime: 0.6,
    trailEnabled: true,
    impactFlashColor: '#ffffff',
  },
  dark: {
    element: 'dark',
    motion: 'vortex',
    primaryColor: '#483d8b',
    secondaryColor: '#8a2be2',
    particleCount: 40,
    particleSize: 0.35,
    speed: 5.0,
    lifetime: 1.1,
    trailEnabled: true,
    impactFlashColor: '#2f0f4f',
  },
};
