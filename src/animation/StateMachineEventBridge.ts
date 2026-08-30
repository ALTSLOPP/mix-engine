import type { EventBus } from '../ecs/EventBus';

export interface AnimEventMarker {
  stateName: string;
  normalizedTime: number; // 0..1
  eventName: string;
  payload?: Record<string, unknown>;
}

export class StateMachineEventBridge {
  private readonly events: AnimEventMarker[] = [];
  private readonly lastNormalizedTimes = new Map<string, number>();

  constructor(private readonly eventBus: EventBus) {}

  addMarker(marker: AnimEventMarker): void {
    this.events.push(marker);
  }

  removeMarkersForState(stateName: string): void {
    const remaining = this.events.filter((e) => e.stateName !== stateName);
    this.events.length = 0;
    this.events.push(...remaining);
  }

  processState(entityId: number, stateName: string, currentNormTime: number): void {
    const key = `${entityId}:${stateName}`;
    const lastNormTime = this.lastNormalizedTimes.get(key) ?? 0;

    for (const marker of this.events) {
      if (marker.stateName !== stateName) continue;

      const trigger =
        (lastNormTime <= marker.normalizedTime && currentNormTime >= marker.normalizedTime) ||
        (currentNormTime < lastNormTime && (lastNormTime <= marker.normalizedTime || currentNormTime >= marker.normalizedTime)); // loop wrap

      if (trigger) {
        this.eventBus.emit(marker.eventName, {
          entityId,
          stateName,
          markerTime: marker.normalizedTime,
          ...marker.payload,
        });
      }
    }

    this.lastNormalizedTimes.set(key, currentNormTime);
  }

  clear(): void {
    this.events.length = 0;
    this.lastNormalizedTimes.clear();
  }

  /**
   * Registers default frame-accurate combat animation markers (hitboxes, audio, and cancels)
   * for standard Mixamo and combat animation assets.
   */
  registerDefaultCombatMarkers(): void {
    // 1. Light Combo: Hook Punch
    this.addMarker({ stateName: 'Hook Punch', normalizedTime: 0.25, eventName: 'anim_hitbox_open', payload: { socket: 'RightHand', radius: 0.45, damage: 15, poiseDamage: 20 } });
    this.addMarker({ stateName: 'Hook Punch', normalizedTime: 0.55, eventName: 'anim_hitbox_close' });
    this.addMarker({ stateName: 'Hook Punch', normalizedTime: 0.50, eventName: 'anim_combo_cancel_window' });

    // 2. Light Combo: Uppercut Jab
    this.addMarker({ stateName: 'Uppercut Jab', normalizedTime: 0.20, eventName: 'anim_hitbox_open', payload: { socket: 'RightHand', radius: 0.48, damage: 20, poiseDamage: 25 } });
    this.addMarker({ stateName: 'Uppercut Jab', normalizedTime: 0.55, eventName: 'anim_hitbox_close' });
    this.addMarker({ stateName: 'Uppercut Jab', normalizedTime: 0.48, eventName: 'anim_combo_cancel_window' });

    // 3. Light Combo: Hurricane Kick
    this.addMarker({ stateName: 'Hurricane Kick', normalizedTime: 0.28, eventName: 'anim_hitbox_open', payload: { socket: 'RightFoot', radius: 0.6, damage: 30, poiseDamage: 40, knockbackForce: 8.0 } });
    this.addMarker({ stateName: 'Hurricane Kick', normalizedTime: 0.70, eventName: 'anim_hitbox_close' });
    this.addMarker({ stateName: 'Hurricane Kick', normalizedTime: 0.60, eventName: 'anim_combo_cancel_window' });

    // 4. Finisher: Punch To Elbow Combo
    this.addMarker({ stateName: 'Punch To Elbow Combo', normalizedTime: 0.22, eventName: 'anim_hitbox_open', payload: { socket: 'RightHand', radius: 0.5, damage: 45, poiseDamage: 60, knockbackForce: 12.0 } });
    this.addMarker({ stateName: 'Punch To Elbow Combo', normalizedTime: 0.68, eventName: 'anim_hitbox_close' });

    // 5. Heavy Attack: Great Sword Slash
    this.addMarker({ stateName: 'Great Sword Slash', normalizedTime: 0.28, eventName: 'anim_hitbox_open', payload: { socket: 'RightHand', radius: 0.85, damage: 55, poiseDamage: 75, knockbackForce: 10.0 } });
    this.addMarker({ stateName: 'Great Sword Slash', normalizedTime: 0.65, eventName: 'anim_hitbox_close' });

    // 6. Heavy Launcher: Kicking
    this.addMarker({ stateName: 'Kicking', normalizedTime: 0.30, eventName: 'anim_hitbox_open', payload: { socket: 'RightFoot', radius: 0.65, damage: 60, poiseDamage: 90, knockbackForce: 14.0 } });
    this.addMarker({ stateName: 'Kicking', normalizedTime: 0.70, eventName: 'anim_hitbox_close' });

    // 7. Spells & Abilities
    this.addMarker({ stateName: 'Spell cast with Sword', normalizedTime: 0.35, eventName: 'anim_spell_cast', payload: { vfx: 'fire', slot: 1 } });
    this.addMarker({ stateName: 'Standing 2H Magic Attack 03', normalizedTime: 0.30, eventName: 'anim_spell_cast', payload: { vfx: 'ice', slot: 2 } });
    this.addMarker({ stateName: 'Two Hand Spell Casting', normalizedTime: 0.32, eventName: 'anim_spell_cast', payload: { vfx: 'lightning', slot: 3 } });
    this.addMarker({ stateName: 'Magic Heal', normalizedTime: 0.25, eventName: 'anim_spell_cast', payload: { vfx: 'heal', slot: 4 } });
  }
}
