export type TimeOfDayPeriod = 'dawn' | 'day' | 'dusk' | 'night';
export type LivingInstinct = 'idle' | 'graze' | 'patrol' | 'flee' | 'aggro';

export interface EncounterEntry {
  creatureId: string;
  weight: number;
  minLevel: number;
  maxLevel: number;
  period: TimeOfDayPeriod | 'all';
}

export interface DayNightLighting {
  period: TimeOfDayPeriod;
  sunIntensity: number;
  sunColor: string;
  ambientColor: string;
  fogDensity: number;
}

export class DayNightEncounterDirector {
  private currentHour = 12.0; // 12:00 PM noon default
  private timeScale = 0.1; // hours per real second (24h in 240s)
  private readonly encounterTable: EncounterEntry[] = [];

  constructor() {
    this.initDefaultEncounters();
  }

  private initDefaultEncounters(): void {
    this.encounterTable.push(
      { creatureId: 'wild_deer', weight: 40, minLevel: 1, maxLevel: 5, period: 'day' },
      { creatureId: 'meadow_sparrow', weight: 35, minLevel: 1, maxLevel: 3, period: 'day' },
      { creatureId: 'forest_wolf', weight: 25, minLevel: 3, maxLevel: 7, period: 'dusk' },
      { creatureId: 'shadow_stalker', weight: 45, minLevel: 5, maxLevel: 10, period: 'night' },
      { creatureId: 'glowing_wisp', weight: 30, minLevel: 2, maxLevel: 6, period: 'night' },
      { creatureId: 'dawn_rooster', weight: 20, minLevel: 1, maxLevel: 4, period: 'dawn' }
    );
  }

  setTime(hour: number): void {
    this.currentHour = ((hour % 24) + 24) % 24;
  }

  getHour(): number {
    return this.currentHour;
  }

  getPeriod(): TimeOfDayPeriod {
    const h = this.currentHour;
    if (h >= 5 && h < 7) return 'dawn';
    if (h >= 7 && h < 18) return 'day';
    if (h >= 18 && h < 20) return 'dusk';
    return 'night';
  }

  getLighting(): DayNightLighting {
    const period = this.getPeriod();
    switch (period) {
      case 'dawn':
        return {
          period: 'dawn',
          sunIntensity: 0.7,
          sunColor: '#ff9966',
          ambientColor: '#4d334d',
          fogDensity: 0.015,
        };
      case 'day':
        return {
          period: 'day',
          sunIntensity: 1.2,
          sunColor: '#ffffff',
          ambientColor: '#6688aa',
          fogDensity: 0.005,
        };
      case 'dusk':
        return {
          period: 'dusk',
          sunIntensity: 0.6,
          sunColor: '#ff4500',
          ambientColor: '#3a2040',
          fogDensity: 0.018,
        };
      case 'night':
      default:
        return {
          period: 'night',
          sunIntensity: 0.15,
          sunColor: '#2b3a67',
          ambientColor: '#0d1326',
          fogDensity: 0.025,
        };
    }
  }

  getAvailableEncounters(): EncounterEntry[] {
    const currentPeriod = this.getPeriod();
    return this.encounterTable.filter(e => e.period === 'all' || e.period === currentPeriod);
  }

  rollEncounter(): EncounterEntry | null {
    const available = this.getAvailableEncounters();
    if (available.length === 0) return null;

    const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const e of available) {
      roll -= e.weight;
      if (roll <= 0) return e;
    }
    return available[0];
  }

  evaluateInstinct(creatureType: 'herbivore' | 'predator', threatDistance: number): LivingInstinct {
    const isNight = this.getPeriod() === 'night';

    if (threatDistance < 8.0) {
      return creatureType === 'herbivore' ? 'flee' : 'aggro';
    }

    if (creatureType === 'herbivore') {
      if (isNight) return 'idle'; // sleeping / resting at night
      return Math.random() > 0.5 ? 'graze' : 'patrol';
    } else {
      // Predator: more active hunting at dusk/night
      if (isNight || this.getPeriod() === 'dusk') return 'patrol';
      return 'idle';
    }
  }

  update(dt: number): void {
    this.currentHour = (this.currentHour + dt * this.timeScale) % 24;
  }
}
