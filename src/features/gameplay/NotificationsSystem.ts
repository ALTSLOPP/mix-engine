import type { Engine } from '../../engine/Engine';
import { finiteRange, type GameNotification, type NotificationKind, type NotificationsConfig } from './GeneralFeatureTypes';

export class NotificationsSystem {
  private config: NotificationsConfig;
  private entries: GameNotification[] = [];
  private nextId = 1;
  private readonly unsubscribe: () => void;
  constructor(private readonly engine: Engine, config: NotificationsConfig) {
    this.config = { ...config };
    this.unsubscribe = engine.sceneManager.events.on('objective_completed', (payload: any) => {
      if (typeof payload?.title === 'string') this.show(`Completed: ${payload.title}`, 'success');
    });
  }
  getConfig(): Readonly<NotificationsConfig> { return this.config; }
  get items(): GameNotification[] { return this.entries.map(entry => ({ ...entry })); }
  setConfig(config: Partial<NotificationsConfig>): void {
    this.config = { ...this.config, ...config, duration: finiteRange(config.duration, this.config.duration, 0.5, 30), maxVisible: Math.round(finiteRange(config.maxVisible, this.config.maxVisible, 1, 8)) };
    if (!this.config.enabled) this.entries = [];
    this.entries = this.entries.slice(-this.config.maxVisible);
  }
  show(message: string, kind: NotificationKind = 'info', duration = this.config.duration): number | null {
    if (!this.config.enabled || typeof message !== 'string' || !message.trim()) return null;
    if (!['info', 'success', 'warning', 'error'].includes(kind)) kind = 'info';
    const id = this.nextId++;
    this.entries.push({ id, message: message.slice(0, 500), kind, remaining: finiteRange(duration, this.config.duration, 0.5, 30) });
    this.entries = this.entries.slice(-this.config.maxVisible);
    this.engine.sceneManager.events.emit('game_notification', { id, message, kind });
    return id;
  }
  dismiss(id: number): void { this.entries = this.entries.filter(entry => entry.id !== id); }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const entry of this.entries) entry.remaining -= dt;
    this.entries = this.entries.filter(entry => entry.remaining > 0);
  }
  dispose(): void { this.unsubscribe(); this.entries = []; }
}
