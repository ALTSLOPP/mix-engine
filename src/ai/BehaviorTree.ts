import { Blackboard } from './Blackboard';

export type Status = 'SUCCESS' | 'FAILURE' | 'RUNNING';
export type NodeStatus = Status;

export { Blackboard };

export class MapBlackboard extends Blackboard {}

export interface BTJson {
  type: string;
  name?: string;
  children?: BTJson[];
  child?: BTJson;
  params?: Record<string, any>;
  [key: string]: any;
}

/**
 * Base abstract node for behavior tree graph evaluation.
 */
export abstract class BehaviorNode {
  abstract tick(bb: Blackboard, dt: number): NodeStatus;
  reset(): void {}
}

/**
 * ActionNode: Leaf task executing a custom action handler.
 */
export class ActionNode extends BehaviorNode {
  constructor(
    private readonly actionFn: (bb: Blackboard, dt: number) => NodeStatus,
  ) {
    super();
  }

  tick(bb: Blackboard, dt: number): NodeStatus {
    return this.actionFn(bb, dt);
  }
}

/**
 * ConditionNode: Leaf predicate testing a blackboard condition.
 */
export class ConditionNode extends BehaviorNode {
  constructor(
    private readonly conditionFn: (bb: Blackboard) => boolean,
  ) {
    super();
  }

  tick(bb: Blackboard): NodeStatus {
    return this.conditionFn(bb) ? 'SUCCESS' : 'FAILURE';
  }
}

/**
 * SequenceNode (AND): Executes children in sequence.
 * Fails immediately if any child fails. Succeeds when all children succeed.
 */
export class SequenceNode extends BehaviorNode {
  private currentChildIndex = 0;

  constructor(readonly children: BehaviorNode[]) {
    super();
  }

  tick(bb: Blackboard, dt: number): NodeStatus {
    while (this.currentChildIndex < this.children.length) {
      const child = this.children[this.currentChildIndex];
      const status = child.tick(bb, dt);

      if (status === 'RUNNING') {
        return 'RUNNING';
      }

      if (status === 'FAILURE') {
        this.reset();
        return 'FAILURE';
      }

      this.currentChildIndex++;
    }

    this.reset();
    return 'SUCCESS';
  }

  override reset(): void {
    this.currentChildIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * SelectorNode (OR / Fallback): Executes children in order until one succeeds.
 * Succeeds immediately when any child succeeds. Fails only when all children fail.
 */
export class SelectorNode extends BehaviorNode {
  private currentChildIndex = 0;

  constructor(readonly children: BehaviorNode[]) {
    super();
  }

  tick(bb: Blackboard, dt: number): NodeStatus {
    while (this.currentChildIndex < this.children.length) {
      const child = this.children[this.currentChildIndex];
      const status = child.tick(bb, dt);

      if (status === 'RUNNING') {
        return 'RUNNING';
      }

      if (status === 'SUCCESS') {
        this.reset();
        return 'SUCCESS';
      }

      this.currentChildIndex++;
    }

    this.reset();
    return 'FAILURE';
  }

  override reset(): void {
    this.currentChildIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * ParallelNode: Executes all children simultaneously each tick.
 */
export class ParallelNode extends BehaviorNode {
  constructor(
    readonly children: BehaviorNode[],
    private readonly successPolicy: 'require_all' | 'require_one' = 'require_all',
  ) {
    super();
  }

  tick(bb: Blackboard, dt: number): NodeStatus {
    let successCount = 0;
    let failureCount = 0;

    for (const child of this.children) {
      const status = child.tick(bb, dt);
      if (status === 'SUCCESS') successCount++;
      if (status === 'FAILURE') failureCount++;
    }

    if (this.successPolicy === 'require_one' && successCount > 0) {
      this.reset();
      return 'SUCCESS';
    }

    if (this.successPolicy === 'require_all' && successCount === this.children.length) {
      this.reset();
      return 'SUCCESS';
    }

    if (failureCount > 0 && this.successPolicy === 'require_all') {
      this.reset();
      return 'FAILURE';
    }

    // Without this, a require_one parallel whose children have all failed reports
    // RUNNING forever and wedges its parent branch.
    if (this.successPolicy === 'require_one' && failureCount === this.children.length) {
      this.reset();
      return 'FAILURE';
    }

    return 'RUNNING';
  }

  override reset(): void {
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * InverterNode (Decorator): Inverts SUCCESS <-> FAILURE. Preserves RUNNING.
 */
export class InverterNode extends BehaviorNode {
  constructor(private readonly child: BehaviorNode) {
    super();
  }

  tick(bb: Blackboard, dt: number): NodeStatus {
    const status = this.child.tick(bb, dt);
    if (status === 'SUCCESS') return 'FAILURE';
    if (status === 'FAILURE') return 'SUCCESS';
    return 'RUNNING';
  }

  override reset(): void {
    this.child.reset();
  }
}

/**
 * CooldownNode (Decorator): Rate limits execution by enforcing a minimum time interval between ticks.
 */
export class CooldownNode extends BehaviorNode {
  private lastExecutedTime = -Infinity;
  private currentTime = 0;

  constructor(
    private readonly child: BehaviorNode,
    private readonly cooldownSeconds: number,
  ) {
    super();
  }

  tick(bb: Blackboard, dt: number): NodeStatus {
    this.currentTime += dt;
    if (this.currentTime - this.lastExecutedTime < this.cooldownSeconds) {
      return 'FAILURE';
    }

    const status = this.child.tick(bb, dt);
    if (status === 'SUCCESS' || status === 'FAILURE') {
      this.lastExecutedTime = this.currentTime;
    }
    return status;
  }

  override reset(): void {
    this.child.reset();
  }
}

/**
 * BehaviorTree: High-level tree container executing from root.
 */
export class BehaviorTree {
  readonly blackboard: Blackboard;
  private root: BehaviorNode | null = null;
  enableTrace = false;

  constructor(root?: BehaviorNode, blackboard?: Blackboard) {
    this.root = root ?? null;
    this.blackboard = blackboard ?? new MapBlackboard();
  }

  setRoot(root: BehaviorNode): void {
    this.root = root;
  }

  tick(dt = 0.016, _host?: any): NodeStatus {
    this.blackboard.update(dt);
    if (!this.root) return 'FAILURE';
    return this.root.tick(this.blackboard, dt);
  }

  reset(): void {
    this.root?.reset();
  }
}

/**
 * Parse a JSON structure into a runnable BehaviorTree instance.
 */
/** A named action a JSON tree can invoke. Registered per-tree via {@link treeFromJson}. */
export type BTActionHandler = (bb: Blackboard, dt: number, params: Record<string, any>) => NodeStatus;

/** Registry of named actions available to JSON-authored trees. */
export type BTActionRegistry = Record<string, BTActionHandler>;

export type BTComparator = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'exists' | 'missing' | 'truthy' | 'falsy';

export interface TreeFromJsonOptions {
  blackboard?: Blackboard;
  /** Named actions `{"type":"action","params":{"action":"shoot"}}` can call. */
  actions?: BTActionRegistry;
  /**
   * Status returned by an `action` node naming a handler that isn't registered.
   * Defaults to 'FAILURE' — a tree that silently succeeds on a missing action is
   * indistinguishable from one that works, which is how unimplemented AI ships.
   */
  onMissingAction?: NodeStatus;
}

/**
 * Evaluate one JSON condition clause against the blackboard.
 * Supports `{key}` (existence), `{key, op, value}`, and `{key, op:'truthy'}`.
 */
export function evaluateBTCondition(bb: Blackboard, params: Record<string, any>): boolean {
  const key = params?.key;
  if (typeof key !== 'string') return true;

  const op: BTComparator = params.op ?? (params.value !== undefined ? '==' : 'exists');
  const actual = bb.get(key);
  const expected = params.value;

  switch (op) {
    case 'exists': return bb.has(key);
    case 'missing': return !bb.has(key);
    case 'truthy': return Boolean(actual);
    case 'falsy': return !actual;
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '<': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case '<=': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case '>': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case '>=': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    default: return false;
  }
}

/**
 * Build a behavior tree from a JSON description.
 *
 * Two things this used to get wrong, both of which made a JSON tree a no-op:
 *  - every `action` node returned SUCCESS unconditionally, so a tree could not
 *    actually *do* anything, and a sequence of "actions" always ran to completion.
 *    Actions now resolve against a registry passed in by the caller.
 *  - `condition` only tested key presence, so it could never compare a value —
 *    "health < 30" was unexpressible. Conditions now take an operator and a value.
 *
 * The legacy `(json, blackboard)` call shape still works.
 */
export function treeFromJson(
  json: BTJson,
  blackboardOrOptions?: Blackboard | TreeFromJsonOptions,
): BehaviorTree {
  const options: TreeFromJsonOptions = blackboardOrOptions instanceof Blackboard
    ? { blackboard: blackboardOrOptions }
    : (blackboardOrOptions ?? {});
  const actions = options.actions ?? {};
  const onMissingAction: NodeStatus = options.onMissingAction ?? 'FAILURE';

  const parseNode = (nodeJson: BTJson): BehaviorNode => {
    const type = nodeJson.type.toLowerCase();
    const children = (nodeJson.children ?? []).map(parseNode);
    const child = nodeJson.child ? parseNode(nodeJson.child) : children[0];
    const params: Record<string, any> = nodeJson.params ?? {};

    switch (type) {
      case 'sequence':
        return new SequenceNode(children);
      case 'selector':
      case 'fallback':
        return new SelectorNode(children);
      case 'parallel':
        return new ParallelNode(children, params.policy ?? 'require_all');
      case 'inverter':
        return new InverterNode(child);
      case 'cooldown':
        return new CooldownNode(child, params.seconds ?? 1.0);
      case 'condition':
        return new ConditionNode((bb) => evaluateBTCondition(bb, params));
      case 'succeeder':
        return new ActionNode(() => 'SUCCESS');
      case 'failer':
        return new ActionNode(() => 'FAILURE');
      case 'action':
      default: {
        const actionName: string | undefined = params.action ?? nodeJson.name;
        const handler = actionName ? actions[actionName] : undefined;
        if (!handler) {
          if (actionName) {
            console.warn(`[BehaviorTree] no handler registered for action '${actionName}' — returning ${onMissingAction}`);
          }
          return new ActionNode(() => onMissingAction);
        }
        return new ActionNode((bb, dt) => handler(bb, dt, params));
      }
    }
  };

  const rootNode = parseNode(json);
  return new BehaviorTree(rootNode, options.blackboard);
}
