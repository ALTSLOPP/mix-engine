import * as THREE from 'three';
import { gameplayRaycast } from './GameplayRaycast';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { CoverPeekingConfig, CoverState } from './types';

export interface CoverNode {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  type: 'low' | 'high';
  reservedBy: EntityId | null;
}

export class CoverPeekingSystem {
  private config: CoverPeekingConfig;
  private readonly state: CoverState = {
    inCover: false,
    coverType: 'none',
    coverNormal: new THREE.Vector3(0, 0, 1),
    leanDirection: 'none',
    isPeeking: false,
  };

  private readonly coverNodes = new Map<string, CoverNode>();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _playerForward = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: CoverPeekingConfig) {
    this.config = { ...initialConfig };
  }

  registerCoverNode(node: CoverNode): void {
    this.coverNodes.set(node.id, { ...node, position: node.position.clone(), normal: node.normal.clone() });
  }

  unregisterCoverNode(id: string): void {
    this.coverNodes.delete(id);
  }

  clearCoverNodes(): void {
    this.coverNodes.clear();
  }

  getCoverNodes(): readonly CoverNode[] {
    return Array.from(this.coverNodes.values());
  }

  reserveCover(nodeId: string, entityId: EntityId): boolean {
    const node = this.coverNodes.get(nodeId);
    if (!node) return false;
    if (node.reservedBy !== null && node.reservedBy !== entityId) return false;
    node.reservedBy = entityId;
    return true;
  }

  releaseCover(nodeIdOrEntityId: string | EntityId): void {
    if (typeof nodeIdOrEntityId === 'string') {
      const node = this.coverNodes.get(nodeIdOrEntityId);
      if (node) node.reservedBy = null;
    } else {
      for (const node of this.coverNodes.values()) {
        if (node.reservedBy === nodeIdOrEntityId) {
          node.reservedBy = null;
        }
      }
    }
  }

  findBestCover(fromPos: THREE.Vector3, threatPos: THREE.Vector3, entityId?: EntityId): CoverNode | null {
    if (this.coverNodes.size === 0) return null;

    let best: CoverNode | null = null;
    let bestScore = -Infinity;

    for (const node of this.coverNodes.values()) {
      // Occupancy check
      if (node.reservedBy !== null && node.reservedBy !== entityId) {
        continue; // occupied by another actor
      }

      const distFromMe = fromPos.distanceTo(node.position);
      if (distFromMe > 35) continue; // too far

      // Vector from cover to threat
      const toThreat = threatPos.clone().sub(node.position);
      const threatDist = toThreat.length();
      if (threatDist < 1e-4) continue;
      toThreat.normalize();

      // Dot product: cover normal should face roughly towards threat
      const alignment = node.normal.dot(toThreat);
      if (alignment < 0.1) continue; // not protecting from threat

      // Score: alignment bonus minus distance penalty
      let score = alignment * 25.0 - distFromMe * 1.2;

      if (node.type === 'high') score += 5.0; // high cover bonus

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    return best;
  }

  setConfig(config: Partial<CoverPeekingConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.exitCover();
      for (const node of this.coverNodes.values()) node.reservedBy = null;
    }
  }

  getConfig(): Readonly<CoverPeekingConfig> {
    return this.config;
  }

  getState(): Readonly<CoverState> {
    return this.state;
  }

  get inCover(): boolean {
    return this.state.inCover;
  }

  get coverType(): 'low' | 'high' | 'none' {
    return this.state.coverType;
  }

  get isPeeking(): boolean {
    return this.state.isPeeking;
  }

  toggleCover(): boolean {
    if (!this.config.enabled) return false;

    if (this.state.inCover) {
      this.exitCover();
      return false;
    }

    return this.tryEnterCover();
  }

  tryEnterCover(): boolean {
    if (!this.config.enabled) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    const playerPos = playerRb.mesh.position;
    this._playerForward.set(0, 0, 1).applyQuaternion(playerRb.mesh.quaternion).normalize();

    // 1. Raycast at low height (chest/waist level ~0.9m)
    this._rayOrigin.copy(playerPos).add(new THREE.Vector3(0, 0.9, 0));
    const lowHit = gameplayRaycast(this.engine, this._rayOrigin, this._playerForward, this.config.snapDistance);

    if (!lowHit) return false;

    // 2. Raycast at high height (head level ~1.9m)
    this._rayOrigin.copy(playerPos).add(new THREE.Vector3(0, 1.9, 0));
    const highHit = gameplayRaycast(this.engine, this._rayOrigin, this._playerForward, this.config.snapDistance + 0.2);

    this.state.inCover = true;
    this.state.coverType = highHit ? 'high' : 'low';
    this.state.coverNormal.copy(lowHit.normal);

    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.5, loop: false });
    this.engine.sceneManager.events.emit('cover_entered', {
      type: this.state.coverType,
      normal: this.state.coverNormal,
    });
    return true;
  }

  exitCover(): void {
    if (!this.state.inCover) return;
    this.state.inCover = false;
    this.state.coverType = 'none';
    this.state.leanDirection = 'none';
    this.state.isPeeking = false;

    this.engine.sceneManager.events.emit('cover_exited', {});
  }

  setLean(direction: 'left' | 'right' | 'none'): void {
    if (!this.state.inCover) return;
    this.state.leanDirection = direction;
    this.state.isPeeking = direction !== 'none';

    this.engine.sceneManager.events.emit('cover_peeking', {
      direction,
      isPeeking: this.state.isPeeking,
    });
  }

  update(_dt: number): void {
    if (!this.config.enabled || !this.state.inCover) return;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) {
      this.exitCover();
      return;
    }

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) {
      this.exitCover();
      return;
    }
  }
}
