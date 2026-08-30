import type { MotionGraph } from './MotionGraph';
import type { MotionHandle } from './MotionHandle';

export interface FSMTransitionRule {
  targetState: string;
  condition?: (params: Record<string, unknown>) => boolean;
  priority?: number;
  fadeDuration?: number;
  cooldown?: number; // min seconds between firing this transition
  lastFiredTime?: number;
  exitTime?: number; // min normalized time before transition can trigger
}

export interface FSMStateDef {
  name: string;
  clipName: string;
  layer?: string | number;
  loop?: boolean;
  speed?: number;
  transitions: FSMTransitionRule[];
  onEnter?: () => void;
  onExit?: () => void;
}

export interface FSMConfig {
  initialState: string;
  states: Record<string, FSMStateDef>;
}

/**
 * MotionFSM — Data-driven finite state machine over MotionGraph.
 */
export class MotionFSM {
  readonly graph: MotionGraph;
  private states = new Map<string, FSMStateDef>();
  private currentStateName: string | null = null;
  private currentHandle: MotionHandle | null = null;
  private timeInState = 0;
  private history: string[] = [];

  constructor(graph: MotionGraph, config?: FSMConfig) {
    this.graph = graph;
    if (config) {
      this.loadConfig(config);
    }
  }

  loadConfig(config: FSMConfig): void {
    this.states.clear();
    for (const [name, def] of Object.entries(config.states)) {
      this.states.set(name, {
        ...def,
        name,
        transitions: (def.transitions || []).map((t) => ({ ...t, lastFiredTime: -999 })),
      });
    }
    if (config.initialState && this.states.has(config.initialState)) {
      this.transitionTo(config.initialState, 0.1);
    }
  }

  addState(def: FSMStateDef): this {
    this.states.set(def.name, {
      ...def,
      transitions: (def.transitions || []).map((t) => ({ ...t, lastFiredTime: -999 })),
    });
    return this;
  }

  get currentState(): string | null {
    return this.currentStateName;
  }

  transitionTo(stateName: string, fade = 0.2): boolean {
    const nextDef = this.states.get(stateName);
    if (!nextDef) {
      console.warn(`[MotionFSM] Unknown state '${stateName}'`);
      return false;
    }

    if (this.currentStateName && this.states.has(this.currentStateName)) {
      this.states.get(this.currentStateName)!.onExit?.();
    }

    this.currentStateName = stateName;
    this.timeInState = 0;
    this.history.push(stateName);
    if (this.history.length > 20) this.history.shift();

    this.currentHandle = this.graph.play(nextDef.clipName, {
      layer: nextDef.layer ?? 0,
      fade,
      loop: nextDef.loop ?? true,
      speed: nextDef.speed ?? 1.0,
    });

    nextDef.onEnter?.();
    return true;
  }

  update(dt: number): void {
    if (!this.currentStateName) return;

    this.timeInState += dt;
    const curDef = this.states.get(this.currentStateName);
    if (!curDef) return;

    const params = this.graph.parameters.toJSON();
    const nt = this.currentHandle?.normalizedTime ?? 0;
    const now = performance.now() / 1000;

    // Check transitions sorted by priority descending
    const sortedTransitions = [...curDef.transitions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const rule of sortedTransitions) {
      // Cooldown guard
      if (rule.cooldown && now - (rule.lastFiredTime ?? 0) < rule.cooldown) {
        continue;
      }

      // Exit time guard
      if (rule.exitTime !== undefined && nt < rule.exitTime) {
        continue;
      }

      // Condition guard
      if (rule.condition && !rule.condition(params)) {
        continue;
      }

      // Trigger transition
      rule.lastFiredTime = now;
      this.transitionTo(rule.targetState, rule.fadeDuration ?? 0.2);
      break;
    }
  }

  getHistory(): string[] {
    return [...this.history];
  }
}
