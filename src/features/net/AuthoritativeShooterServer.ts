import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import {
  AuthoritativeMatchPolicy,
  type ClientFireIntent,
  type ClientGrenadeIntent,
  type ClientFlagIntent,
} from './AuthoritativeMatchPolicy';
import { ArenaMatchController, type TeamId } from '../gameplay/ArenaMatchModes';
import { gameplayRaycast } from '../gameplay/GameplayRaycast';

export class AuthoritativeShooterServer {
  public readonly policy = new AuthoritativeMatchPolicy();
  public readonly match: ArenaMatchController;
  private serverTime = 0;

  constructor(private readonly engine: Engine) {
    this.match = new ArenaMatchController(engine, 'ffa');
  }

  registerPlayer(peerId: string, entityId: EntityId, name: string, team: TeamId = 'heaters'): void {
    this.policy.registerPeer(peerId, entityId, team);
    this.match.registerPlayer(entityId, name, team);
  }

  unregisterPlayer(peerId: string): void {
    const session = this.policy.getSession(peerId);
    if (session) {
      this.match.unregisterPlayer(session.entityId);
    }
    this.policy.unregisterPeer(peerId);
  }

  update(dt: number): void {
    this.serverTime += dt;
    this.match.update(dt);
  }

  /**
   * Processes client fire intent with authoritative hit detection on the host.
   */
  handleFireIntent(intent: ClientFireIntent, weaponFireRate = 10, weaponDamage = 30, maxRange = 100): boolean {
    const interval = 1.0 / weaponFireRate;
    const validation = this.policy.validateFireIntent(intent, this.serverTime, interval, maxRange);

    if (!validation.valid) {
      this.engine.sceneManager.events.emit('server_intent_rejected', {
        peerId: intent.peerId,
        type: 'fire',
        reason: validation.reason,
      });
      return false;
    }

    // Perform authoritative server-side raycast
    const origin = new THREE.Vector3(...intent.origin);
    const dir = new THREE.Vector3(...intent.direction).normalize();

    const hit = gameplayRaycast(this.engine, origin, dir, maxRange);
    if (hit) {
      const hitBody = this.engine.physicsWorld.rapierBodyFromColliderHandle?.(hit.colliderHandle);
      const allEntities = this.engine.sceneManager.allEntityIds();

      for (const id of allEntities) {
        if (id === intent.shooterEntityId) continue;
        const rb = this.engine.sceneManager.getRigidBody(id);
        if (rb && hitBody && rb.rapierBody === hitBody) {
          const isHeadshot = hit.point.y - rb.mesh.position.y > 1.2;
          const damage = isHeadshot ? weaponDamage * 1.5 : weaponDamage;

          // Apply authoritative damage
          this.engine.combat.applyDamage(intent.shooterEntityId, id, damage);

          const victimHealth = this.engine.combat.getHealth(id);
          const isKilled = victimHealth ? victimHealth.hp <= 0 : false;

          if (isKilled) {
            this.match.recordKill(intent.shooterEntityId, id);
            this.policy.setPeerAlive(intent.peerId, false);
          }

          this.engine.sceneManager.events.emit('server_hit_confirmed', {
            attackerId: intent.shooterEntityId,
            targetId: id,
            damage,
            isHeadshot,
            isKilled,
            hitPoint: hit.point,
          });
          break;
        }
      }
    }

    return true;
  }

  /**
   * Processes client CTF flag action intent.
   */
  handleFlagIntent(intent: ClientFlagIntent): boolean {
    const flag = this.match.getFlagState(intent.flagTeam);
    if (!flag) return false;

    const validation = this.policy.validateFlagIntent(intent, flag.currentPosition);
    if (!validation.valid) {
      this.engine.sceneManager.events.emit('server_intent_rejected', {
        peerId: intent.peerId,
        type: 'flag',
        reason: validation.reason,
      });
      return false;
    }

    if (intent.action === 'pickup') {
      return this.match.pickupFlag(intent.flagTeam, intent.actorEntityId);
    } else if (intent.action === 'drop') {
      const session = this.policy.getSession(intent.peerId);
      if (session) {
        this.match.dropFlag(intent.flagTeam, session.position);
        return true;
      }
    } else if (intent.action === 'capture') {
      return this.match.captureFlag(intent.flagTeam, intent.actorEntityId);
    }

    return false;
  }
}
