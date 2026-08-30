import type { Engine } from '../../engine/Engine';
import { finiteRange, type SessionFlowConfig, type SessionState } from './GeneralFeatureTypes';

export class SessionFlowSystem {
  private config: SessionFlowConfig;
  private state: SessionState = { status: 'idle', score: 0, elapsed: 0, remaining: 0, message: '' };
  constructor(private readonly engine: Engine, config: SessionFlowConfig) { this.config = { ...config }; }
  getConfig(): Readonly<SessionFlowConfig> { return this.config; }
  getState(): Readonly<SessionState> { return { ...this.state }; }
  setConfig(config: Partial<SessionFlowConfig>): void {
    this.config = { ...this.config, ...config, duration: finiteRange(config.duration, this.config.duration, 0, 86400), targetScore: finiteRange(config.targetScore, this.config.targetScore, 0, 1e9) };
    if (!this.config.enabled) this.reset();
  }
  start(): boolean {
    if (!this.config.enabled) return false;
    this.state = { status: 'running', score: 0, elapsed: 0, remaining: this.config.duration, message: '' };
    this.engine.gameplayFeatures?.pause.resume();
    this.engine.sceneManager.events.emit('session_started', this.getState());
    return true;
  }
  addScore(amount: number): boolean {
    if (!this.config.enabled || this.state.status !== 'running' || !Number.isFinite(amount)) return false;
    this.state.score = Math.max(0, Math.min(1e9, this.state.score + amount));
    this.engine.sceneManager.events.emit('session_score', this.getState());
    if (this.config.targetScore > 0 && this.state.score >= this.config.targetScore) this.finish('won');
    return true;
  }
  finish(result: 'won' | 'lost', message = ''): boolean {
    if (!this.config.enabled || this.state.status !== 'running' || !['won', 'lost'].includes(result)) return false;
    this.state.status = result;
    this.state.message = message || (result === 'won' ? 'Objective achieved.' : 'Try again when you’re ready.');
    this.engine.sceneManager.events.emit('session_ended', this.getState());
    if (this.config.pauseOnEnd) this.engine.gameplayFeatures?.pause.pause('session');
    return true;
  }
  reset(): void {
    this.state = { status: 'idle', score: 0, elapsed: 0, remaining: 0, message: '' };
    if (this.engine.gameplayFeatures?.pause.pauseReason === 'session') this.engine.gameplayFeatures.pause.resume();
  }
  update(dt: number): void {
    if (!this.config.enabled || this.state.status !== 'running' || !Number.isFinite(dt) || dt <= 0 || this.engine.gameplayFeatures?.pause.isPaused) return;
    this.state.elapsed += dt;
    this.state.remaining = Math.max(0, this.config.duration - this.state.elapsed);
    if (this.config.duration > 0 && this.state.remaining === 0) this.finish('lost', 'Time is up.');
  }
}
