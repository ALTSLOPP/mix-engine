import type { Engine } from '../../engine/Engine';
import { setGameplaySlowMotion } from './GameplaySlowMotion';
import type { WeaponSlotDef, WeaponWheelConfig, WeaponWheelState } from './types';

export class WeaponLoadoutSystem {
  private config: WeaponWheelConfig;
  private readonly state: WeaponWheelState = {
    activeSlot: 1,
    isOpen: false,
    switching: false,
    switchProgress: 0,
  };


  constructor(private readonly engine: Engine, initialConfig: WeaponWheelConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<WeaponWheelConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.closeWheel(); this.state.switching = false; }
    else if (this.state.isOpen) setGameplaySlowMotion(this.engine.timeDilation, this, this.config.slowTimeDuringWheel ? this.config.timeScale : null);
  }

  getConfig(): Readonly<WeaponWheelConfig> {
    return this.config;
  }

  getState(): Readonly<WeaponWheelState> {
    return this.state;
  }

  get activeWeapon(): WeaponSlotDef | undefined {
    return this.config.slots.find((s) => s.slot === this.state.activeSlot);
  }

  get isOpen(): boolean {
    return this.state.isOpen;
  }

  openWheel(): void {
    if (!this.config.enabled || this.state.isOpen) return;
    this.state.isOpen = true;

    if (this.config.slowTimeDuringWheel) {
      setGameplaySlowMotion(this.engine.timeDilation, this, this.config.timeScale);
    }

    this.engine.sceneManager.events.emit('weapon_wheel_opened', {});
  }

  closeWheel(): void {
    if (!this.state.isOpen) return;
    this.state.isOpen = false;

    setGameplaySlowMotion(this.engine.timeDilation, this, null);

    this.engine.sceneManager.events.emit('weapon_wheel_closed', { activeSlot: this.state.activeSlot });
  }

  selectSlot(slot: number): boolean {
    if (!this.config.enabled) return false;
    const weapon = this.config.slots.find((s) => s.slot === slot);
    if (!weapon) return false;

    if (this.state.activeSlot === slot && this.engine.gameplayFeatures?.ranged.weapon?.id === weapon.id) return true;

    this.state.activeSlot = slot;
    this.state.switching = true;
    this.state.switchProgress = 0;

    // Equip into RangedShooterSystem if present
    const ranged = this.engine.gameplayFeatures?.ranged;
    if (ranged && ['rifle', 'pistol', 'shotgun', 'sniper'].includes(weapon.category)) {
      const registered = ranged.getConfig().weapons.find(def => def.id === weapon.id);
      ranged.equipWeapon(registered ?? {
        id: weapon.id,
        name: weapon.name,
        type: (weapon.category === 'rifle' || weapon.category === 'pistol' || weapon.category === 'shotgun' || weapon.category === 'sniper') ? weapon.category : 'pistol',
        damage: weapon.damage,
        range: weapon.range,
        fireRate: weapon.fireRate,
        magazineSize: weapon.magazineCapacity,
        reloadDuration: weapon.reloadTime,
        spread: 0.03,
        muzzleVfx: 'muzzle_flash',
        impactVfx: 'sparks',
        audioFire: '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav',
        audioReload: '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav',
        modelAssetId: weapon.modelAssetId,
      });
    }

    // Imported weapons retain their own sounds/model; no unrelated melee SFX on switching.
    this.engine.sceneManager.events.emit('weapon_switched', { slot, weapon });
    return true;
  }

  nextSlot(): void {
    const slots = this.config.slots.map((s) => s.slot).sort((a, b) => a - b);
    if (slots.length <= 1) return;
    const currentIdx = slots.indexOf(this.state.activeSlot);
    const nextIdx = (currentIdx + 1) % slots.length;
    this.selectSlot(slots[nextIdx]);
  }

  prevSlot(): void {
    const slots = this.config.slots.map((s) => s.slot).sort((a, b) => a - b);
    if (slots.length <= 1) return;
    const currentIdx = slots.indexOf(this.state.activeSlot);
    const prevIdx = (currentIdx - 1 + slots.length) % slots.length;
    this.selectSlot(slots[prevIdx]);
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.state.switching) {
      this.state.switchProgress += dt / Math.max(0.01, this.config.switchTime);
      if (this.state.switchProgress >= 1.0) {
        this.state.switching = false;
        this.state.switchProgress = 1.0;
      }
    }
  }
}
