import * as THREE from 'three';
import type { EntityId } from '../../ecs/SceneManager';
import type { TeamId } from '../gameplay/ArenaMatchModes';

export interface ClientFireIntent {
  sequence: number;
  peerId: string;
  shooterEntityId: EntityId;
  weaponId: string;
  origin: [number, number, number];
  direction: [number, number, number];
  clientTimestamp: number;
}

export interface ClientGrenadeIntent {
  sequence: number;
  peerId: string;
  throwerEntityId: EntityId;
  grenadeId: string;
  origin: [number, number, number];
  direction: [number, number, number];
}

export interface ClientFlagIntent {
  sequence: number;
  peerId: string;
  actorEntityId: EntityId;
  action: 'pickup' | 'drop' | 'capture';
  flagTeam: TeamId;
}

export interface PeerSessionState {
  peerId: string;
  entityId: EntityId;
  team: TeamId;
  lastSequence: number;
  lastFireTime: number;
  lastGrenadeTime: number;
  currentWeaponId: string;
  ammo: number;
  carriedGrenades: number;
  position: THREE.Vector3;
  isAlive: boolean;
}

export class AuthoritativeMatchPolicy {
  private readonly sessions = new Map<string, PeerSessionState>();
  private readonly entityToPeer = new Map<EntityId, string>();

  registerPeer(peerId: string, entityId: EntityId, team: TeamId, weaponId = 'fps_ak47'): void {
    const session: PeerSessionState = {
      peerId,
      entityId,
      team,
      lastSequence: 0,
      lastFireTime: -Infinity,
      lastGrenadeTime: -Infinity,
      currentWeaponId: weaponId,
      ammo: 30,
      carriedGrenades: 3,
      position: new THREE.Vector3(0, 0, 0),
      isAlive: true,
    };
    this.sessions.set(peerId, session);
    this.entityToPeer.set(entityId, peerId);
  }

  unregisterPeer(peerId: string): void {
    const s = this.sessions.get(peerId);
    if (s) {
      this.entityToPeer.delete(s.entityId);
      this.sessions.delete(peerId);
    }
  }

  getSession(peerId: string): PeerSessionState | undefined {
    return this.sessions.get(peerId);
  }

  updatePeerPosition(peerId: string, pos: THREE.Vector3): void {
    const s = this.sessions.get(peerId);
    if (s) s.position.copy(pos);
  }

  setPeerAlive(peerId: string, alive: boolean): void {
    const s = this.sessions.get(peerId);
    if (s) s.isAlive = alive;
  }

  /**
   * Validates client fire intent against ownership, sequence, alive state, cooldown, and position plausibility.
   */
  validateFireIntent(
    intent: ClientFireIntent,
    serverTime: number,
    weaponFireInterval: number,
    maxRange = 100.0
  ): { valid: boolean; reason?: string } {
    const session = this.sessions.get(intent.peerId);
    if (!session) return { valid: false, reason: 'unregistered_peer' };

    // 1. Ownership validation: peer must own the declared entity
    if (session.entityId !== intent.shooterEntityId) {
      return { valid: false, reason: 'spoofed_entity_id' };
    }

    // 2. Sequence ordering / replay attack protection
    if (intent.sequence <= session.lastSequence) {
      return { valid: false, reason: 'replayed_or_duplicate_sequence' };
    }

    // 3. Living state check
    if (!session.isAlive) {
      return { valid: false, reason: 'actor_is_dead' };
    }

    // 4. Rate-limiting / Fire interval check (with 15% packet jitter tolerance)
    const minInterval = weaponFireInterval * 0.85;
    if (serverTime - session.lastFireTime < minInterval) {
      return { valid: false, reason: 'fire_rate_exceeded' };
    }

    // 5. Ammo check
    if (session.ammo <= 0) {
      return { valid: false, reason: 'out_of_ammo' };
    }

    // 6. Origin plausibility check (cannot fire from a location far away from verified body position)
    const originVec = new THREE.Vector3(...intent.origin);
    const distToVerifiedPos = originVec.distanceTo(session.position);
    if (distToVerifiedPos > 3.0) {
      return { valid: false, reason: 'implausible_origin_teleport' };
    }

    // 7. Direction normalization check
    const dirVec = new THREE.Vector3(...intent.direction);
    if (dirVec.lengthSq() < 1e-4) {
      return { valid: false, reason: 'invalid_direction' };
    }

    // Passed all validation checks! Update server session state
    session.lastSequence = intent.sequence;
    session.lastFireTime = serverTime;
    session.ammo--;

    return { valid: true };
  }

  /**
   * Validates client grenade throw intent.
   */
  validateGrenadeIntent(
    intent: ClientGrenadeIntent,
    serverTime: number,
    cooldown = 1.0
  ): { valid: boolean; reason?: string } {
    const session = this.sessions.get(intent.peerId);
    if (!session) return { valid: false, reason: 'unregistered_peer' };

    if (session.entityId !== intent.throwerEntityId) {
      return { valid: false, reason: 'spoofed_entity_id' };
    }

    if (intent.sequence <= session.lastSequence) {
      return { valid: false, reason: 'duplicate_sequence' };
    }

    if (!session.isAlive) {
      return { valid: false, reason: 'actor_is_dead' };
    }

    if (session.carriedGrenades <= 0) {
      return { valid: false, reason: 'no_grenades_remaining' };
    }

    if (serverTime - session.lastGrenadeTime < cooldown * 0.9) {
      return { valid: false, reason: 'grenade_cooldown_active' };
    }

    session.lastSequence = intent.sequence;
    session.lastGrenadeTime = serverTime;
    session.carriedGrenades--;

    return { valid: true };
  }

  /**
   * Validates client CTF flag action intent.
   */
  validateFlagIntent(
    intent: ClientFlagIntent,
    flagPosition: THREE.Vector3,
    maxInteractDist = 4.0
  ): { valid: boolean; reason?: string } {
    const session = this.sessions.get(intent.peerId);
    if (!session) return { valid: false, reason: 'unregistered_peer' };

    if (session.entityId !== intent.actorEntityId) {
      return { valid: false, reason: 'spoofed_entity_id' };
    }

    if (!session.isAlive) {
      return { valid: false, reason: 'actor_is_dead' };
    }

    const distToFlag = session.position.distanceTo(flagPosition);
    if (distToFlag > maxInteractDist) {
      return { valid: false, reason: 'out_of_interaction_range' };
    }

    return { valid: true };
  }

  validateReloadIntent(
    peerId: string,
    sequence: number,
    magazineCapacity = 30
  ): { valid: boolean; reason?: string } {
    const session = this.sessions.get(peerId);
    if (!session) return { valid: false, reason: 'unregistered_peer' };
    if (!session.isAlive) return { valid: false, reason: 'actor_is_dead' };
    if (sequence <= session.lastSequence) return { valid: false, reason: 'duplicate_sequence' };

    session.lastSequence = sequence;
    session.ammo = magazineCapacity;
    return { valid: true };
  }

  replenishGrenades(peerId: string, count = 3): void {
    const session = this.sessions.get(peerId);
    if (session) {
      session.carriedGrenades = Math.min(3, session.carriedGrenades + count);
    }
  }
}
