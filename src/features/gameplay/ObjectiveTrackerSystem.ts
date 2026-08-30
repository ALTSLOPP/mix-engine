import type { Engine } from '../../engine/Engine';
import { finiteRange, type ObjectiveDefinition, type ObjectiveState, type ObjectiveTrackerConfig } from './GeneralFeatureTypes';

export class ObjectiveTrackerSystem {
  private config: ObjectiveTrackerConfig;
  private readonly objectives = new Map<string, ObjectiveState>();
  constructor(private readonly engine: Engine, config: ObjectiveTrackerConfig) {
    this.config = { ...config, objectives: config.objectives.map(o => ({ ...o })) };
    this.reset();
  }
  getConfig(): Readonly<ObjectiveTrackerConfig> { return this.config; }
  get items(): ObjectiveState[] { return [...this.objectives.values()].map(o => ({ ...o })); }
  setConfig(config: Partial<ObjectiveTrackerConfig>): void {
    this.config = { ...this.config, ...config, objectives: Array.isArray(config.objectives) ? config.objectives.map(o => ({ ...o })) : this.config.objectives, maxVisible: Math.round(finiteRange(config.maxVisible, this.config.maxVisible, 1, 8)) };
    if (Array.isArray(config.objectives)) this.reset();
  }
  add(def: ObjectiveDefinition): boolean {
    if (!this.config.enabled || !def || typeof def.id !== 'string' || !def.id.trim() || typeof def.title !== 'string' || !Number.isFinite(def.target) || def.target <= 0 || this.objectives.has(def.id)) return false;
    this.objectives.set(def.id, { ...def, progress: 0, completed: false });
    this.engine.sceneManager.events.emit('objective_added', { ...def });
    return true;
  }
  advance(id: string, amount = 1): boolean {
    const objective = this.objectives.get(id);
    if (!this.config.enabled || !objective || objective.completed || !Number.isFinite(amount) || amount <= 0) return false;
    objective.progress = Math.min(objective.target, objective.progress + amount);
    objective.completed = objective.progress >= objective.target;
    this.engine.sceneManager.events.emit(objective.completed ? 'objective_completed' : 'objective_progress', { ...objective });
    return true;
  }
  remove(id: string): boolean { return this.objectives.delete(id); }
  reset(): void {
    this.objectives.clear();
    for (const def of this.config.objectives) {
      if (def && typeof def.id === 'string' && def.id.trim() && typeof def.title === 'string' && Number.isFinite(def.target) && def.target > 0) this.objectives.set(def.id, { ...def, progress: 0, completed: false });
    }
  }
}
