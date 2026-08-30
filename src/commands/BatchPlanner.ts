/**
 * BatchPlanner — Dependency planning, DAG cycle detection, and dataflow execution
 * for batch AICommand envelopes with intra-batch output bindings.
 */

import type { AICommand } from '../ai/AIBridge';
import { DataflowResolver } from './DataflowResolver';

export interface BatchCommandEnvelope {
  command: AICommand;
  as?: string;
  id?: string;
}

export type BatchItem = AICommand | BatchCommandEnvelope;

export interface PlannedBatchNode {
  index: number;
  as?: string;
  id?: string;
  command: AICommand;
  dependencies: string[];
}

export interface BatchPlan {
  valid: boolean;
  nodes: PlannedBatchNode[];
  executionOrder: number[];
  bindings: Set<string>;
  errors: string[];
}

export interface PerCommandResult {
  index: number;
  as?: string;
  id?: string;
  command: AICommand;
  resolvedCommand: AICommand;
  ok: boolean;
  created: Array<{ id: number; name?: string; tags?: string[]; kind?: string }>;
  removed: number[];
  data?: unknown;
  warnings?: string[];
  errors?: string[];
}

export interface BatchExecutionResult {
  ok: boolean;
  totalCommands: number;
  executedCount: number;
  created: Array<{ id: number; name?: string; tags?: string[]; kind?: string }>;
  removed: number[];
  commandResults: PerCommandResult[];
  bindings: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
  text: string;
}

export class BatchPlanner {
  /**
   * Parses and normalizes an input batch of commands or envelopes into a structured DAG plan.
   */
  static plan(input: unknown): BatchPlan {
    const items: BatchItem[] = Array.isArray(input) ? input : input === undefined ? [] : [input as BatchItem];
    const errors: string[] = [];
    const nodes: PlannedBatchNode[] = [];
    const bindings = new Set<string>();
    const bindingProducerIndex = new Map<string, number>();

    if (items.length === 0) {
      return {
        valid: false,
        nodes: [],
        executionOrder: [],
        bindings,
        errors: ['At least one command or envelope is required.'],
      };
    }

    // Step 1: Normalize items into nodes and extract binding declarations
    items.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Item at index ${index} must be an object.`);
        return;
      }

      let command: AICommand;
      let as: string | undefined;
      let id: string | undefined;

      if ('command' in item && typeof (item as BatchCommandEnvelope).command === 'object') {
        const env = item as BatchCommandEnvelope;
        command = env.command;
        as = typeof env.as === 'string'
          ? env.as.trim()
          : typeof (env.command as AICommand & { as?: unknown }).as === 'string'
            ? String((env.command as AICommand & { as: string }).as).trim()
            : undefined;
        id = typeof env.id === 'string' ? env.id.trim() : undefined;
      } else {
        command = item as AICommand;
        if ('as' in item && typeof (item as { as?: unknown }).as === 'string') {
          as = (item as { as: string }).as.trim();
        }
      }

      if (as) {
        if (bindings.has(as)) {
          errors.push(`Duplicate binding alias '${as}' defined at index ${index}. Binding names must be unique within a batch.`);
        } else {
          bindings.add(as);
          bindingProducerIndex.set(as, index);
        }
      }

      const dependencies = DataflowResolver.extractRefs(command);
      nodes.push({
        index,
        as,
        id,
        command,
        dependencies,
      });
    });

    // Step 2: Validate dependencies exist in declared bindings
    nodes.forEach((node) => {
      for (const dep of node.dependencies) {
        if (!bindings.has(dep)) {
          errors.push(`Command at index ${node.index} references undeclared binding '${dep}'.`);
        }
      }
    });

    if (errors.length > 0) {
      return {
        valid: false,
        nodes,
        executionOrder: nodes.map((n) => n.index),
        bindings,
        errors,
      };
    }

    // Step 3: Compute execution order via Topological Sort (Kahn's algorithm)
    // Building adjacency: depNode -> dependentNode
    const inDegree = new Array<number>(nodes.length).fill(0);
    const adj = new Map<number, number[]>();
    for (let i = 0; i < nodes.length; i++) adj.set(i, []);

    nodes.forEach((node) => {
      for (const dep of node.dependencies) {
        const prodIdx = bindingProducerIndex.get(dep);
        if (prodIdx === node.index) {
          errors.push(`Command at index ${node.index} cannot reference its own output binding '${dep}'.`);
        } else if (prodIdx !== undefined) {
          adj.get(prodIdx)!.push(node.index);
          inDegree[node.index]++;
        }
      }
    });

    // Queue nodes with in-degree 0 in original authored sequence
    const queue: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (inDegree[i] === 0) queue.push(i);
    }

    const executionOrder: number[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      executionOrder.push(u);
      for (const v of adj.get(u) || []) {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          queue.push(v);
        }
      }
    }

    if (executionOrder.length < nodes.length) {
      errors.push('Circular dependency cycle detected between command output bindings.');
    }

    return {
      valid: errors.length === 0,
      nodes,
      executionOrder,
      bindings,
      errors,
    };
  }

  /**
   * Helper to normalize any input into plain AICommands if no dataflow refs exist.
   */
  static extractPlainCommands(input: unknown): AICommand[] {
    const raw = Array.isArray(input) ? input : input === undefined ? [] : [input];
    return raw.map((item) => {
      if (item && typeof item === 'object' && 'command' in item && typeof (item as BatchCommandEnvelope).command === 'object') {
        return (item as BatchCommandEnvelope).command;
      }
      return item as AICommand;
    });
  }
}
