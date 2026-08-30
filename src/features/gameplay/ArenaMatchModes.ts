import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';

export type MatchMode = 'waves' | 'ffa' | 'tdm' | 'ctf';
export type MatchState = 'lobby' | 'warmup' | 'in_progress' | 'ended';

export type TeamId = 'heaters' | 'rollers' | 'saints';

export interface PlayerScoreEntry {
  entityId: EntityId;
  name: string;
  team: TeamId;
  kills: number;
  deaths: number;
  score: number;
  flagCaptures?: number;
  flagReturns?: number;
  ping?: number;
}

export type FlagStatus = 'base' | 'carried' | 'dropped';

export interface CTFFlagState {
  teamId: TeamId;
  status: FlagStatus;
  basePosition: THREE.Vector3;
  currentPosition: THREE.Vector3;
  carrierId: EntityId | null;
  dropTimeRemaining: number;
}

export interface MatchConfig {
  mode: MatchMode;
  timeLimitSeconds: number;
  killLimit: number;
  captureLimit: number;
  respawnDelaySeconds: number;
  dropReturnDelaySeconds: number;
  friendlyFire: boolean;
  botCount: number;
}

export const DEFAULT_MATCH_CONFIGS: Record<MatchMode, MatchConfig> = {
  waves: {
    mode: 'waves',
    timeLimitSeconds: 600,
    killLimit: 100,
    captureLimit: 0,
    respawnDelaySeconds: 3.0,
    dropReturnDelaySeconds: 30.0,
    friendlyFire: false,
    botCount: 8,
  },
  ffa: {
    mode: 'ffa',
    timeLimitSeconds: 600,
    killLimit: 25,
    captureLimit: 0,
    respawnDelaySeconds: 3.0,
    dropReturnDelaySeconds: 30.0,
    friendlyFire: true,
    botCount: 6,
  },
  tdm: {
    mode: 'tdm',
    timeLimitSeconds: 600,
    killLimit: 50,
    captureLimit: 0,
    respawnDelaySeconds: 3.0,
    dropReturnDelaySeconds: 30.0,
    friendlyFire: false,
    botCount: 8,
  },
  ctf: {
    mode: 'ctf',
    timeLimitSeconds: 900,
    killLimit: 0,
    captureLimit: 3,
    respawnDelaySeconds: 4.0,
    dropReturnDelaySeconds: 25.0,
    friendlyFire: false,
    botCount: 6,
  },
};

export class ArenaMatchController {
  private config: MatchConfig;
  private state: MatchState = 'lobby';
  private matchTimer = 0;
  private readonly scores = new Map<EntityId, PlayerScoreEntry>();
  private readonly teamScores: Record<TeamId, number> = {
    heaters: 0,
    rollers: 0,
    saints: 0,
  };
  private readonly ctfFlags = new Map<TeamId, CTFFlagState>();
  private readonly respawnQueue: Array<{ entityId: EntityId; remaining: number }> = [];

  constructor(private readonly engine: Engine, initialMode: MatchMode = 'ffa') {
    this.config = { ...DEFAULT_MATCH_CONFIGS[initialMode] };
    this.initCTF();
  }

  private initCTF(): void {
    this.ctfFlags.clear();
    const teams: TeamId[] = ['heaters', 'rollers'];
    const bases: Record<TeamId, THREE.Vector3> = {
      heaters: new THREE.Vector3(-25, 0, 0),
      rollers: new THREE.Vector3(25, 0, 0),
      saints: new THREE.Vector3(0, 0, 25),
    };

    for (const t of teams) {
      this.ctfFlags.set(t, {
        teamId: t,
        status: 'base',
        basePosition: bases[t].clone(),
        currentPosition: bases[t].clone(),
        carrierId: null,
        dropTimeRemaining: 0,
      });
    }
  }

  setMode(mode: MatchMode, configPatch?: Partial<MatchConfig>): void {
    this.config = { ...DEFAULT_MATCH_CONFIGS[mode], ...configPatch };
    this.initCTF();
    this.resetMatch();
  }

  getConfig(): Readonly<MatchConfig> {
    return this.config;
  }

  getState(): MatchState {
    return this.state;
  }

  getScores(): PlayerScoreEntry[] {
    return Array.from(this.scores.values()).sort((a, b) => b.score - a.score);
  }

  getTeamScores(): Record<TeamId, number> {
    return { ...this.teamScores };
  }

  getFlagState(teamId: TeamId): CTFFlagState | undefined {
    return this.ctfFlags.get(teamId);
  }

  registerPlayer(entityId: EntityId, name: string, team: TeamId = 'heaters'): void {
    this.scores.set(entityId, {
      entityId,
      name,
      team,
      kills: 0,
      deaths: 0,
      score: 0,
      flagCaptures: 0,
      flagReturns: 0,
    });
  }

  unregisterPlayer(entityId: EntityId): void {
    // Drop flag if holding
    for (const flag of this.ctfFlags.values()) {
      if (flag.carrierId === entityId) {
        this.dropFlag(flag.teamId, flag.currentPosition);
      }
    }
    this.scores.delete(entityId);
  }

  startMatch(): void {
    this.state = 'in_progress';
    this.matchTimer = this.config.timeLimitSeconds;
    this.teamScores.heaters = 0;
    this.teamScores.rollers = 0;
    this.teamScores.saints = 0;
    for (const s of this.scores.values()) {
      s.kills = 0;
      s.deaths = 0;
      s.score = 0;
      s.flagCaptures = 0;
      s.flagReturns = 0;
    }
    this.initCTF();
    this.respawnQueue.length = 0;

    this.engine.sceneManager.events.emit('match_started', {
      mode: this.config.mode,
      timeLimit: this.config.timeLimitSeconds,
    });
  }

  recordKill(killerId: EntityId | null, victimId: EntityId): void {
    if (this.state !== 'in_progress') return;

    const victimScore = this.scores.get(victimId);
    if (victimScore) victimScore.deaths++;

    // Drop flag if victim was holding one
    for (const flag of this.ctfFlags.values()) {
      if (flag.carrierId === victimId) {
        const victimRb = this.engine.sceneManager.getRigidBody(victimId);
        const dropPos = victimRb?.mesh.position.clone() ?? flag.currentPosition;
        this.dropFlag(flag.teamId, dropPos);
      }
    }

    if (killerId !== null && killerId !== victimId) {
      const killerScore = this.scores.get(killerId);
      if (killerScore) {
        killerScore.kills++;
        killerScore.score += 100;
        this.teamScores[killerScore.team] += 1;

        // Check Kill Limits
        if (this.config.mode === 'ffa' && killerScore.kills >= this.config.killLimit) {
          this.endMatch(killerId, killerScore.team);
          return;
        } else if (this.config.mode === 'tdm' && this.teamScores[killerScore.team] >= this.config.killLimit) {
          this.endMatch(killerId, killerScore.team);
          return;
        }
      }
    }

    // Queue respawn
    this.respawnQueue.push({
      entityId: victimId,
      remaining: this.config.respawnDelaySeconds,
    });
  }

  // ── CTF Interactions ──────────────────────────────────────────────────────

  pickupFlag(teamId: TeamId, carrierId: EntityId): boolean {
    if (this.config.mode !== 'ctf' || this.state !== 'in_progress') return false;

    const flag = this.ctfFlags.get(teamId);
    if (!flag) return false;

    const carrierScore = this.scores.get(carrierId);
    if (!carrierScore) return false;

    // Cannot pick up own team's flag unless returning dropped flag
    if (carrierScore.team === teamId) {
      if (flag.status === 'dropped') {
        this.returnFlag(teamId, carrierId);
        return true;
      }
      return false; // already at base
    }

    // Enemy flag pickup
    if (flag.status === 'base' || flag.status === 'dropped') {
      flag.status = 'carried';
      flag.carrierId = carrierId;
      flag.dropTimeRemaining = 0;

      this.engine.sceneManager.events.emit('flag_picked_up', {
        flagTeam: teamId,
        carrierId,
      });
      return true;
    }

    return false;
  }

  dropFlag(teamId: TeamId, dropPosition: THREE.Vector3): void {
    const flag = this.ctfFlags.get(teamId);
    if (!flag || flag.status !== 'carried') return;

    flag.status = 'dropped';
    flag.carrierId = null;
    flag.currentPosition.copy(dropPosition);
    flag.dropTimeRemaining = this.config.dropReturnDelaySeconds;

    this.engine.sceneManager.events.emit('flag_dropped', {
      flagTeam: teamId,
      position: dropPosition,
    });
  }

  returnFlag(teamId: TeamId, returnedById?: EntityId): void {
    const flag = this.ctfFlags.get(teamId);
    if (!flag) return;

    flag.status = 'base';
    flag.carrierId = null;
    flag.currentPosition.copy(flag.basePosition);
    flag.dropTimeRemaining = 0;

    if (returnedById) {
      const score = this.scores.get(returnedById);
      if (score) {
        score.flagReturns = (score.flagReturns ?? 0) + 1;
        score.score += 50;
      }
    }

    this.engine.sceneManager.events.emit('flag_returned', {
      flagTeam: teamId,
      returnedById,
    });
  }

  captureFlag(capturedTeamId: TeamId, carrierId: EntityId): boolean {
    if (this.config.mode !== 'ctf' || this.state !== 'in_progress') return false;

    const flag = this.ctfFlags.get(capturedTeamId);
    if (!flag || flag.carrierId !== carrierId) return false;

    const carrierScore = this.scores.get(carrierId);
    if (!carrierScore) return false;

    // Check if capturing team's own flag is at base
    const ownFlag = this.ctfFlags.get(carrierScore.team);
    if (ownFlag && ownFlag.status !== 'base') {
      return false; // own flag must be home to capture
    }

    // Capture success
    this.returnFlag(capturedTeamId);
    carrierScore.flagCaptures = (carrierScore.flagCaptures ?? 0) + 1;
    carrierScore.score += 300;
    this.teamScores[carrierScore.team] += 1;

    this.engine.sceneManager.events.emit('flag_captured', {
      capturingTeam: carrierScore.team,
      capturedTeam: capturedTeamId,
      carrierId,
      teamScore: this.teamScores[carrierScore.team],
    });

    if (this.teamScores[carrierScore.team] >= this.config.captureLimit) {
      this.endMatch(carrierId, carrierScore.team);
    }
    return true;
  }

  private endMatch(winnerId: EntityId | null, winningTeam: TeamId): void {
    this.state = 'ended';
    this.engine.sceneManager.events.emit('match_ended', {
      winnerId,
      winningTeam,
      scores: this.getScores(),
      teamScores: this.getTeamScores(),
    });
  }

  resetMatch(): void {
    this.state = 'lobby';
    this.matchTimer = 0;
    this.respawnQueue.length = 0;
    this.initCTF();
  }

  update(dt: number): void {
    if (this.state !== 'in_progress') return;

    // Match Timer
    if (this.config.timeLimitSeconds > 0) {
      this.matchTimer -= dt;
      if (this.matchTimer <= 0) {
        // Determine winner
        let highestTeam: TeamId = 'heaters';
        let highestScore = -1;
        for (const [t, sc] of Object.entries(this.teamScores) as Array<[TeamId, number]>) {
          if (sc > highestScore) {
            highestScore = sc;
            highestTeam = t;
          }
        }
        this.endMatch(null, highestTeam);
        return;
      }
    }

    // CTF Dropped Flag Auto-Return Timers & Carrier tracking
    for (const flag of this.ctfFlags.values()) {
      if (flag.status === 'carried' && flag.carrierId !== null) {
        const carrierRb = this.engine.sceneManager.getRigidBody(flag.carrierId);
        if (carrierRb) {
          flag.currentPosition.copy(carrierRb.mesh.position);

          // Check if carrier reached home base for capture
          const carrierScore = this.scores.get(flag.carrierId);
          if (carrierScore) {
            const homeFlag = this.ctfFlags.get(carrierScore.team);
            if (homeFlag && homeFlag.status === 'base') {
              const distToHome = flag.currentPosition.distanceTo(homeFlag.basePosition);
              if (distToHome <= 2.5) {
                this.captureFlag(flag.teamId, flag.carrierId);
              }
            }
          }
        } else {
          this.dropFlag(flag.teamId, flag.currentPosition);
        }
      } else if (flag.status === 'dropped') {
        flag.dropTimeRemaining -= dt;
        if (flag.dropTimeRemaining <= 0) {
          this.returnFlag(flag.teamId);
        }
      }
    }

    // Respawn processing
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const entry = this.respawnQueue[i];
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        this.respawnQueue.splice(i, 1);
        this.engine.sceneManager.events.emit('player_respawned', {
          entityId: entry.entityId,
        });
      }
    }
  }

  dispose(): void {
    this.resetMatch();
    this.scores.clear();
  }
}
