import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { EntityId } from '../SceneManager';
import type { DamageEvent } from '../CombatSystem';

/**
 * Standard modular health component exposed to Inspector Studio, HELM, and SENSORIUM.
 */
export class HealthModularComponent extends Component {
  static override readonly type = 'health';

  @expose({ type: 'number', min: 0, max: 1000, doc: 'Current hit points', default: 100 })
  hp = 100;

  @expose({ type: 'number', min: 1, max: 1000, doc: 'Maximum hit points', default: 100 })
  maxHp = 100;

  @expose({ type: 'number', min: 0, max: 10, doc: 'Damage intake multiplier', default: 1 })
  damageMultiplier = 1;

  @expose({ type: 'string', doc: 'Faction identifier for friendly fire avoidance', default: 'neutral' })
  faction = 'neutral';

  onDeath?: (e: EntityId) => void;
  onDamage?: (e: DamageEvent) => void;

  takeDamage(amount: number, event?: DamageEvent): void {
    const effective = amount * this.damageMultiplier;
    this.hp = Math.max(0, this.hp - effective);
    if (event && this.onDamage) {
      this.onDamage(event);
    }
    if (this.hp <= 0 && this.onDeath) {
      this.onDeath(this.entity);
    }
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
