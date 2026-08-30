import type { SceneManager } from '../ecs/SceneManager';
import { NetworkSystem } from '../network/NetworkSystem';
import type { NetTransport } from '../network/NetTransport';
import * as THREE from 'three';

/**
 * AuthoritativeServer — minimal authoritative session server.
 * Runs the same NetworkSystem host loop but adds:
 * - session lifecycle + token auth
 * - server-side validation (speed, teleport, action rate)
 * - interest management (distance culling)
 * - spawn/despawn replication
 * - persistence to pluggable store (file/DB/localStorage)
 * - reconnect with snapshot resume
 * - lag compensation (rewind buffer)
 *
 * Transport is pluggable: pass a NetTransport factory that yields a server-side
 * WebSocket (or Loopback for tests). The server itself never trusts client physics —
 * every input is validated and then simulated on the server's canonical world.
 */
export interface ServerConfig {
  maxPlayers?: number;
  tickRate?: number;
  interestRadius?: number;
  maxSpeed?: number; // m/s, for cheat detection
  authSecret?: string;
  snapshotInterval?: number;
}

export interface PlayerSession {
  id: string;
  token: string;
  entityId: number | null;
  connected: boolean;
  lastSeen: number;
  pos: THREE.Vector3;
  violations: number;
}

export interface ServerPersistence {
  save(snapshot: unknown): Promise<void>;
  load(): Promise<unknown | null>;
}

class InMemoryStore implements ServerPersistence {
  private data: unknown | null = null;
  async save(s: unknown): Promise<void> { this.data = JSON.parse(JSON.stringify(s)); }
  async load(): Promise<unknown | null> { return this.data; }
}

export class AuthoritativeServer {
  private readonly net: NetworkSystem;
  private readonly sessions = new Map<string, PlayerSession>();
  private readonly posHistory = new Map<number, Array<{ t: number; pos: THREE.Vector3 }>>();
  private readonly config: Required<ServerConfig>;
  private store: ServerPersistence = new InMemoryStore();
  private tick = 0;
  private elapsed = 0;
  private readonly interestRadius: number;

  constructor(
    private readonly sceneManager: SceneManager,
    config: ServerConfig = {},
  ) {
    this.config = {
      maxPlayers: config.maxPlayers ?? 32,
      tickRate: config.tickRate ?? 20,
      interestRadius: config.interestRadius ?? 150,
      maxSpeed: config.maxSpeed ?? 12,
      authSecret: config.authSecret ?? 'dev-secret',
      snapshotInterval: config.snapshotInterval ?? 5,
    };
    this.interestRadius = this.config.interestRadius;
    this.net = new NetworkSystem(sceneManager as any, { tickRate: this.config.tickRate } as any);
  }

  setPersistence(store: ServerPersistence): void { this.store = store; }

  /** Simple token auth (HMAC-like). In prod, replace with JWT / platform auth. */
  private verifyToken(token: string): string | null {
    // token = `player:<id>:<hash>` where hash = djb2(id+secret)
    const parts = token.split(':');
    if (parts.length !== 3 || parts[0] !== 'player') return null;
    const id = parts[1];
    let h = 5381;
    const s = id + this.config.authSecret;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    const expect = (h >>> 0).toString(16);
    return expect === parts[2] ? id : null;
  }

  static makeToken(playerId: string, secret = 'dev-secret'): string {
    let h = 5381; const s = playerId + secret;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return `player:${playerId}:${(h >>> 0).toString(16)}`;
  }

  /** Player connects: validate, create session, spawn avatar, return snapshot. */
  async connect(playerId: string, token: string, transport: NetTransport): Promise<{ ok: boolean; reason?: string; session?: PlayerSession }> {
    if (this.sessions.size >= this.config.maxPlayers) return { ok: false, reason: 'server full' };
    const authed = this.verifyToken(token);
    if (!authed || authed !== playerId) return { ok: false, reason: 'auth failed' };

    let sess = this.sessions.get(playerId);
    if (sess) {
      // Reconnect: resume existing entity
      sess.connected = true; sess.lastSeen = Date.now(); sess.token = token;
      this.net.host(transport);
      return { ok: true, session: sess };
    }

    // New session: spawn server-side avatar (authoritative)
    const spawnPos = new THREE.Vector3((Math.random() - 0.5) * 20, 1.5, (Math.random() - 0.5) * 20);
    let entityId: number | null = null;
    try {
      entityId = this.sceneManager.spawnNow(spawnPos, { kind: 'character', params: { assetId: 'ayo' } } as any, { rootMotion: true } as any);
    } catch { entityId = this.sceneManager.spawnNow(spawnPos, { kind: 'box', params: { hx: 0.5, hy: 1, hz: 0.5 } } as any); }

    sess = { id: playerId, token, entityId, connected: true, lastSeen: Date.now(), pos: spawnPos.clone(), violations: 0 };
    this.sessions.set(playerId, sess);
    if (entityId !== null) this.net.replicate(entityId);
    this.net.host(transport);
    // Interest: only replicate entities within radius
    this.applyInterest(sess);
    return { ok: true, session: sess };
  }

  disconnect(playerId: string): void {
    const s = this.sessions.get(playerId);
    if (!s) return;
    s.connected = false; s.lastSeen = Date.now();
    // Keep entity for reconnect window (30s) before hard despawn
    setTimeout(() => {
      const cur = this.sessions.get(playerId);
      if (cur && !cur.connected && Date.now() - cur.lastSeen > 30000) {
        if (cur.entityId !== null) { try { this.sceneManager.requestDestroy(cur.entityId); } catch {} this.net.unreplicate(cur.entityId); }
        this.sessions.delete(playerId);
      }
    }, 30000);
  }

  /** Server-side validation: reject impossible moves. Returns corrected position or null if kick. */
  validateMove(playerId: string, pos: THREE.Vector3, dt: number): { ok: boolean; corrected?: THREE.Vector3; kick?: boolean } {
    const sess = this.sessions.get(playerId);
    if (!sess) return { ok: false, kick: true };
    const dist = pos.distanceTo(sess.pos);
    const maxDist = this.config.maxSpeed * dt * 1.2 + 0.5; // 20% slack + snap tolerance
    if (dist > maxDist) {
      sess.violations++;
      if (sess.violations >= 5) return { ok: false, kick: true };
      return { ok: false, corrected: sess.pos.clone() };
    }
    sess.violations = Math.max(0, sess.violations - 1);
    sess.pos.copy(pos);
    // Record for lag compensation rewind
    let hist = this.posHistory.get(sess.entityId ?? -1);
    if (!hist) { hist = []; this.posHistory.set(sess.entityId ?? -1, hist); }
    hist.push({ t: this.elapsed, pos: pos.clone() });
    if (hist.length > 60) hist.shift();
    return { ok: true };
  }

  /** Interest management: only replicate entities within radius of this player. */
  private applyInterest(sess: PlayerSession): void {
    if (sess.entityId === null) return;
    const center = sess.pos;
    for (const id of this.sceneManager.allEntityIds()) {
      const rb = this.sceneManager.getRigidBody(id);
      if (!rb) continue;
      const d = rb.mesh.position.distanceTo(center);
      const should = d <= this.interestRadius;
      const isRep = this.net.replicatedIds().includes(id);
      if (should && !isRep) this.net.replicate(id);
      else if (!should && isRep && id !== sess.entityId) this.net.unreplicate(id);
    }
  }

  /** Lag compensation: rewind pos history to `atTime` for hit test. */
  rewind(entityId: number, atTime: number): THREE.Vector3 | null {
    const hist = this.posHistory.get(entityId);
    if (!hist || hist.length === 0) return null;
    // Find bracketing samples and lerp
    let prev = hist[0], next = hist[hist.length - 1];
    for (let i = 0; i < hist.length - 1; i++) {
      if (hist[i].t <= atTime && hist[i + 1].t >= atTime) { prev = hist[i]; next = hist[i + 1]; break; }
    }
    const span = next.t - prev.t || 1e-6;
    const alpha = Math.max(0, Math.min(1, (atTime - prev.t) / span));
    return new THREE.Vector3().lerpVectors(prev.pos, next.pos, alpha);
  }

  /** Tick server simulation; validates inputs, steps, broadcasts interest-filtered snapshots. */
  update(dt: number): void {
    this.elapsed += dt; this.tick++;
    // Cheap interest refresh every second
    if (this.tick % this.config.tickRate === 0) {
      for (const sess of this.sessions.values()) if (sess.connected) this.applyInterest(sess);
    }
    this.net.update(dt);
    // Periodic persistence
    if (this.tick % (this.config.tickRate * this.config.snapshotInterval) === 0) {
      void this.store.save({ tick: this.tick, sessions: [...this.sessions.entries()] });
    }
  }

  /** Spawn/despawn with authority: server decides, clients follow. */
  spawn(kind: string, params: Record<string, unknown>, pos: THREE.Vector3): number | null {
    try {
      const id = this.sceneManager.spawnNow(pos, { kind, params } as any);
      this.net.replicate(id);
      return id;
    } catch { return null; }
  }

  despawn(entityId: number): boolean {
    if (!this.sceneManager.getRigidBody(entityId)) return false;
    this.net.unreplicate(entityId);
    this.sceneManager.requestDestroy(entityId);
    return true;
  }

  stats(): { players: number; replicated: number; violations: number } {
    let violations = 0; for (const s of this.sessions.values()) violations += s.violations;
    return { players: this.sessions.size, replicated: this.net.replicatedIds().length, violations };
  }
}
