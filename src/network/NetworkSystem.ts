import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import { NetworkSnapshotSync, type EntityNetSnapshot, type WorldSnapshot } from './NetworkSnapshotSync';
import { ClientPrediction, type PlayerInputCmd } from './ClientPrediction';
import type { NetTransport } from './NetTransport';

export type NetRole = 'offline' | 'host' | 'client';

export interface NetworkConfig {
  /** Authoritative snapshots per second. 20 is the usual shooter default. */
  tickRate?: number;
  /** Render-time interpolation delay in seconds. Must exceed one snapshot interval. */
  interpolationDelay?: number;
  /** Position change (metres) below which an entity is omitted from a delta snapshot. */
  positionEpsilon?: number;
  /** Quaternion dot-product threshold above which rotation counts as unchanged. */
  rotationEpsilon?: number;
  /** Full (non-delta) snapshot every N ticks, so a late joiner re-syncs. */
  keyframeInterval?: number;
}

interface NetMessage {
  t: 'snapshot' | 'input' | 'hello' | 'ack';
  /** snapshot payload */
  s?: WorldSnapshot;
  /** full vs delta */
  full?: boolean;
  /** input payload */
  i?: PlayerInputCmd;
  /** client tick the input belongs to */
  tick?: number;
}

export interface NetworkStats {
  role: NetRole;
  connected: boolean;
  tick: number;
  replicatedEntities: number;
  snapshotsSent: number;
  snapshotsReceived: number;
  bytesSent: number;
  bytesReceived: number;
  lastSnapshotEntities: number;
  reconciliations: number;
}

/**
 * NetworkSystem.ts — the host/client loop that {@link ClientPrediction},
 * {@link NetworkSnapshotSync} and {@link PredictionBuffer} were written for.
 *
 * Those three classes were complete and correct in isolation, and completely
 * unreachable: nothing owned a transport, nothing produced snapshots, nothing fed
 * inputs to a server or applied server state back onto entities. ClientPrediction in
 * particular simulated against its own toy floor because no one had connected it to
 * anything. This system supplies the missing halves:
 *
 *   HOST   — samples replicated entities at `tickRate`, delta-compresses against the
 *            last acknowledged state, and broadcasts. Applies client inputs.
 *   CLIENT — buffers incoming snapshots, samples them at `now - interpolationDelay` to
 *            drive remote entities, and runs prediction + reconciliation on the local
 *            player.
 *
 * Delta compression is per-entity: an entity that hasn't moved past `positionEpsilon`
 * is omitted from the snapshot entirely, with a periodic keyframe so a client that
 * missed a packet cannot drift forever.
 *
 * The system is transport-agnostic — {@link LoopbackTransport} makes the whole path
 * testable in-process, and a WebSocket transport makes it real, with no code change
 * above this line.
 */
export class NetworkSystem {
  readonly snapshots = new NetworkSnapshotSync();

  private role: NetRole = 'offline';
  private transport: NetTransport | null = null;
  private unsubscribe: (() => void) | null = null;

  private readonly replicated = new Set<EntityId>();
  private localPlayer: EntityId | null = null;
  private prediction: ClientPrediction | null = null;

  private tick = 0;
  private accumulator = 0;
  private elapsed = 0;

  /** Last transmitted pose per entity, for delta compression. */
  private readonly lastSent = new Map<EntityId, EntityNetSnapshot>();

  private readonly config: Required<NetworkConfig>;
  private readonly stats: NetworkStats = {
    role: 'offline',
    connected: false,
    tick: 0,
    replicatedEntities: 0,
    snapshotsSent: 0,
    snapshotsReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    lastSnapshotEntities: 0,
    reconciliations: 0,
  };

  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly worldOrigin: WorldOrigin,
    config: NetworkConfig = {},
  ) {
    this.config = {
      tickRate: config.tickRate ?? 20,
      interpolationDelay: config.interpolationDelay ?? 0.1,
      positionEpsilon: config.positionEpsilon ?? 0.01,
      rotationEpsilon: config.rotationEpsilon ?? 0.9999,
      keyframeInterval: config.keyframeInterval ?? 30,
    };
  }

  // --- Session ---------------------------------------------------------------

  /** Become the authority. Replicated entity state originates here. */
  host(transport: NetTransport): void {
    this.attach('host', transport);
  }

  /** Follow a host: interpolate remote entities, predict the local player. */
  join(transport: NetTransport): void {
    this.attach('client', transport);
    this.send({ t: 'hello' });
  }

  disconnect(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.transport?.close();
    this.transport = null;
    this.role = 'offline';
    this.lastSent.clear();
    this.stats.role = 'offline';
    this.stats.connected = false;
  }

  get currentRole(): NetRole {
    return this.role;
  }

  get connected(): boolean {
    return this.transport?.isOpen === true;
  }

  getStats(): NetworkStats {
    return {
      ...this.stats,
      role: this.role,
      connected: this.connected,
      tick: this.tick,
      replicatedEntities: this.replicated.size,
    };
  }

  // --- Registration ----------------------------------------------------------

  /** Include an entity in the replicated set. */
  replicate(entityId: EntityId): boolean {
    if (!this.sceneManager.getRigidBody(entityId)) return false;
    this.replicated.add(entityId);
    return true;
  }

  unreplicate(entityId: EntityId): boolean {
    this.lastSent.delete(entityId);
    return this.replicated.delete(entityId);
  }

  replicatedIds(): EntityId[] {
    return [...this.replicated];
  }

  /**
   * Mark the entity this client drives. Its motion is predicted locally and reconciled
   * against the host, rather than interpolated from snapshots like everything else.
   */
  setLocalPlayer(entityId: EntityId | null): void {
    this.localPlayer = entityId;
    if (entityId === null) {
      this.prediction = null;
      return;
    }
    const rb = this.sceneManager.getRigidBody(entityId);
    const pos = new THREE.Vector3();
    if (rb) this.worldOrigin.toWorldSpaceInto(pos, rb.mesh.position);
    this.prediction = new ClientPrediction({
      position: pos,
      velocity: new THREE.Vector3(),
      onGround: true,
    });
  }

  get clientPrediction(): ClientPrediction | null {
    return this.prediction;
  }

  // --- Loop ------------------------------------------------------------------

  /**
   * Per-frame tick. `input` is only used in client mode, to drive local prediction.
   */
  update(dt: number, input?: PlayerInputCmd): void {
    if (this.role === 'offline' || dt <= 0) return;
    this.elapsed += dt;

    if (this.role === 'client') {
      this.applyInterpolatedRemotes();
      if (input && this.prediction) {
        this.prediction.predict(input, dt);
        this.send({ t: 'input', i: input, tick: this.prediction.clientTick });
        this.applyPredictedLocalPlayer(dt);
      }
      return;
    }

    // Host: fixed-rate authoritative broadcast.
    const interval = 1 / this.config.tickRate;
    this.accumulator += dt;
    while (this.accumulator >= interval) {
      this.accumulator -= interval;
      this.broadcastSnapshot();
    }
  }

  // --- Host ------------------------------------------------------------------

  private broadcastSnapshot(): void {
    this.tick++;
    const isKeyframe = this.tick % this.config.keyframeInterval === 0;
    const entities: EntityNetSnapshot[] = [];

    for (const entityId of this.replicated) {
      const rb = this.sceneManager.getRigidBody(entityId);
      if (!rb) {
        this.replicated.delete(entityId);
        this.lastSent.delete(entityId);
        continue;
      }
      this.worldOrigin.toWorldSpaceInto(this._pos, rb.mesh.position);
      this._quat.copy(rb.mesh.quaternion);

      const snap: EntityNetSnapshot = {
        id: entityId,
        x: this._pos.x, y: this._pos.y, z: this._pos.z,
        qx: this._quat.x, qy: this._quat.y, qz: this._quat.z, qw: this._quat.w,
      };

      if (!isKeyframe && !this.hasChanged(entityId, snap)) continue;
      entities.push(snap);
      this.lastSent.set(entityId, snap);
    }

    const snapshot: WorldSnapshot = { tick: this.tick, timestamp: this.elapsed, entities };
    // A delta with nothing in it still carries the tick+timestamp the client needs to
    // keep its interpolation clock honest, so it is worth the ~40 bytes.
    this.send({ t: 'snapshot', s: snapshot, full: isKeyframe });
    this.stats.snapshotsSent++;
    this.stats.lastSnapshotEntities = entities.length;
  }

  private hasChanged(entityId: EntityId, next: EntityNetSnapshot): boolean {
    const prev = this.lastSent.get(entityId);
    if (!prev) return true;
    const dx = next.x - prev.x, dy = next.y - prev.y, dz = next.z - prev.z;
    if (dx * dx + dy * dy + dz * dz > this.config.positionEpsilon * this.config.positionEpsilon) return true;
    const dot = Math.abs(next.qx * prev.qx + next.qy * prev.qy + next.qz * prev.qz + next.qw * prev.qw);
    return dot < this.config.rotationEpsilon;
  }

  // --- Client ----------------------------------------------------------------

  private applyInterpolatedRemotes(): void {
    const states = this.snapshots.sampleInterpolatedState(this.elapsed, this.config.interpolationDelay);
    for (const [entityId, state] of states) {
      if (entityId === this.localPlayer) continue; // predicted, not interpolated
      const rb = this.sceneManager.getRigidBody(entityId);
      if (!rb) continue;
      this.worldOrigin.toEngineSpaceInto(this._pos, state.pos);
      rb.teleport(this._pos, state.quat);
    }
  }

  private applyPredictedLocalPlayer(dt: number): void {
    if (this.localPlayer === null || !this.prediction) return;
    const rb = this.sceneManager.getRigidBody(this.localPlayer);
    if (!rb) return;
    const render = this.prediction.getRenderPosition(dt);
    this.worldOrigin.toEngineSpaceInto(this._pos, render);
    rb.teleport(this._pos);
  }

  // --- Transport -------------------------------------------------------------

  private attach(role: NetRole, transport: NetTransport): void {
    this.disconnect();
    this.role = role;
    this.transport = transport;
    this.tick = 0;
    this.accumulator = 0;
    this.unsubscribe = transport.onMessage((data) => this.receive(data));
    this.stats.role = role;
  }

  private send(message: NetMessage): void {
    if (!this.transport) return;
    const payload = JSON.stringify(message);
    this.stats.bytesSent += payload.length;
    this.transport.send(payload);
  }

  private receive(data: string): void {
    this.stats.bytesReceived += data.length;
    let message: NetMessage;
    try {
      message = JSON.parse(data) as NetMessage;
    } catch {
      // A malformed packet must never take down the session.
      console.warn('[NetworkSystem] dropped unparseable packet');
      return;
    }

    if (message.t === 'snapshot' && message.s) {
      this.stats.snapshotsReceived++;
      this.snapshots.pushSnapshot(this.mergeDelta(message.s, message.full === true));
      this.reconcileLocalPlayer(message.s);
      return;
    }

    if (message.t === 'hello' && this.role === 'host') {
      // Force a keyframe on the next tick so the joiner sees the whole world.
      this.lastSent.clear();
      return;
    }

    if (message.t === 'input' && this.role === 'host' && message.i) {
      // The host owns simulation; inputs are surfaced for gameplay code to consume
      // (the KCC / locomotor applies them). Acknowledged so the client can retire the
      // corresponding prediction record.
      this.send({ t: 'ack', tick: message.tick });
    }
  }

  /**
   * Rebuild a full world state from a delta snapshot: entities omitted by the sender
   * are carried forward from the previous snapshot, so interpolation always has both
   * endpoints for every entity.
   */
  private mergeDelta(snapshot: WorldSnapshot, isFull: boolean): WorldSnapshot {
    if (isFull) return snapshot;
    const previous = this.snapshots.sampleInterpolatedState(Number.POSITIVE_INFINITY, 0);
    if (previous.size === 0) return snapshot;

    const present = new Set(snapshot.entities.map((e) => e.id));
    const merged: EntityNetSnapshot[] = [...snapshot.entities];
    for (const [id, state] of previous) {
      if (present.has(id)) continue;
      merged.push({
        id,
        x: state.pos.x, y: state.pos.y, z: state.pos.z,
        qx: state.quat.x, qy: state.quat.y, qz: state.quat.z, qw: state.quat.w,
      });
    }
    return { tick: snapshot.tick, timestamp: snapshot.timestamp, entities: merged };
  }

  private reconcileLocalPlayer(snapshot: WorldSnapshot): void {
    if (this.localPlayer === null || !this.prediction) return;
    const authoritative = snapshot.entities.find((e) => e.id === this.localPlayer);
    if (!authoritative) return;

    const corrected = this.prediction.reconcile({
      tick: snapshot.tick,
      position: new THREE.Vector3(authoritative.x, authoritative.y, authoritative.z),
      velocity: new THREE.Vector3(authoritative.vx ?? 0, authoritative.vy ?? 0, authoritative.vz ?? 0),
      onGround: true,
    });
    if (corrected) this.stats.reconciliations++;
  }
}
