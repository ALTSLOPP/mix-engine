import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { CrimeReport, CrimeType, WantedCrimeConfig, WantedState } from './types';

export const DEFAULT_WANTED_CONFIG: WantedCrimeConfig = {
  enabled: true,
  maxWantedLevel: 5,
  cooldownAfterCrimeSec: 12.0,
  decayWindowFootSec: 20.0,
  decayWindowVehicleSec: 35.0,
  crimeThresholds: {
    shooting_in_public: 20,
    vehicle_theft: 40,
    assault: 45,
    hit_and_run: 60,
    resisting_arrest: 80,
    homicide: 100,
  },
};

export class WantedCrimeSystem {
  private config: WantedCrimeConfig;
  private wantedLevel = 0;
  private heat = 0;
  private timeSinceLastCrimeSec = 9999;
  private decayProgressSec = 0;
  private policePursuitActive = false;
  private readonly recentCrimes: CrimeReport[] = [];
  private readonly unsubs: (() => void)[] = [];

  constructor(private readonly engine: Engine, initialConfig: WantedCrimeConfig = DEFAULT_WANTED_CONFIG) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    const u1 = events.on('civilian_killed', (e: any) => {
      if (e?.killerEntityId === (this.engine.player?.getPossessedId?.() ?? 1)) {
        this.reportCrime('homicide', e.position ?? new THREE.Vector3());
      }
    });

    const u2 = events.on('civilian_ejected', (e: any) => {
      this.reportCrime('vehicle_theft', e.position ?? new THREE.Vector3());
    });

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
  }

  setConfig(config: Partial<WantedCrimeConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.clear();
    }
  }

  getConfig(): Readonly<WantedCrimeConfig> {
    return this.config;
  }

  getWantedLevel(): number {
    return this.wantedLevel;
  }

  getHeat(): number {
    return this.heat;
  }

  isPursuitActive(): boolean {
    return this.policePursuitActive;
  }

  setPursuitActive(active: boolean): void {
    if (this.policePursuitActive !== active) {
      this.policePursuitActive = active;
      this.engine.sceneManager?.events?.emit(
        active ? 'police_pursuit_started' : 'police_pursuit_lost',
        { wantedLevel: this.wantedLevel }
      );
    }
  }

  reportCrime(type: CrimeType, position: THREE.Vector3 = new THREE.Vector3()): void {
    if (!this.config.enabled) return;

    const crimeHeat = this.config.crimeThresholds[type] ?? 30;
    this.heat += crimeHeat;
    this.timeSinceLastCrimeSec = 0;
    this.decayProgressSec = 0;

    const report: CrimeReport = {
      type,
      position: position.clone(),
      severity: crimeHeat,
      timestamp: Date.now(),
    };
    this.recentCrimes.push(report);
    if (this.recentCrimes.length > 20) this.recentCrimes.shift();

    // Compute Wanted Level based on accumulated heat
    const previousWanted = this.wantedLevel;
    const newWanted = Math.min(
      this.config.maxWantedLevel,
      Math.max(1, Math.floor(this.heat / 80) + 1)
    );

    if (newWanted !== previousWanted) {
      this.wantedLevel = newWanted;
      this.engine.sceneManager?.events?.emit('wanted_level_changed', {
        previousLevel: previousWanted,
        wantedLevel: this.wantedLevel,
        heat: this.heat,
      });
    }

    this.engine.sceneManager?.events?.emit('crime_committed', {
      crime: report,
      wantedLevel: this.wantedLevel,
    });
  }

  setWantedLevel(level: number): void {
    const clamped = Math.max(0, Math.min(this.config.maxWantedLevel, level));
    const previous = this.wantedLevel;
    this.wantedLevel = clamped;
    this.heat = clamped * 80;
    this.timeSinceLastCrimeSec = 0;
    this.decayProgressSec = 0;

    if (clamped !== previous) {
      this.engine.sceneManager?.events?.emit('wanted_level_changed', {
        previousLevel: previous,
        wantedLevel: this.wantedLevel,
        heat: this.heat,
      });
    }
  }

  update(dt: number, isDrivingVehicle = false): void {
    if (!this.config.enabled || this.wantedLevel <= 0) {
      return;
    }

    this.timeSinceLastCrimeSec += dt;

    // Cooldown check: decay is only active if no crime recently committed and no active pursuit
    const isCooled = this.timeSinceLastCrimeSec >= this.config.cooldownAfterCrimeSec;
    const canDecay = !this.policePursuitActive && isCooled;

    if (!canDecay) {
      this.decayProgressSec = 0;
      return;
    }

    const windowSec = isDrivingVehicle
      ? this.config.decayWindowVehicleSec
      : this.config.decayWindowFootSec;

    this.decayProgressSec += dt;

    if (this.decayProgressSec >= windowSec) {
      this.decayProgressSec = 0;
      const previous = this.wantedLevel;
      this.wantedLevel = Math.max(0, this.wantedLevel - 1);
      this.heat = this.wantedLevel * 80;

      this.engine.sceneManager?.events?.emit('wanted_level_changed', {
        previousLevel: previous,
        wantedLevel: this.wantedLevel,
        heat: this.heat,
        decayed: true,
      });
    }
  }

  getState(): WantedState {
    return {
      wantedLevel: this.wantedLevel,
      heat: this.heat,
      timeSinceLastCrimeSec: this.timeSinceLastCrimeSec,
      decayProgressSec: this.decayProgressSec,
      policePursuitActive: this.policePursuitActive,
    };
  }

  clear(): void {
    this.wantedLevel = 0;
    this.heat = 0;
    this.timeSinceLastCrimeSec = 9999;
    this.decayProgressSec = 0;
    this.policePursuitActive = false;
    this.recentCrimes.length = 0;
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.clear();
  }

  toJSON(): Record<string, unknown> {
    return {
      wantedLevel: this.wantedLevel,
      heat: this.heat,
      timeSinceLastCrimeSec: this.timeSinceLastCrimeSec,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.wantedLevel === 'number') this.wantedLevel = data.wantedLevel;
    if (typeof data.heat === 'number') this.heat = data.heat;
    if (typeof data.timeSinceLastCrimeSec === 'number') this.timeSinceLastCrimeSec = data.timeSinceLastCrimeSec;
  }
}
