import * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { MotionGraph } from './MotionGraph';
import { MotionHandle } from './MotionHandle';
import type { MotionGraphInspection, PlayOptions } from './types';

/**
 * MotionDirectorManager — Central engine manager for all MotionGraph instances.
 */
export class MotionDirectorManager {
  private graphsByEntity = new Map<number, MotionGraph>();
  private graphsByRb = new Map<RigidBodyComponent, MotionGraph>();
  private allGraphs = new Set<MotionGraph>();

  createGraph(
    root: THREE.Object3D,
    options: {
      rb?: RigidBodyComponent;
      entityId?: number;
    } = {},
  ): MotionGraph {
    const graph = new MotionGraph(root, options);
    this.allGraphs.add(graph);

    if (options.entityId !== undefined) {
      this.graphsByEntity.set(options.entityId, graph);
    }
    if (options.rb) {
      this.graphsByRb.set(options.rb, graph);
    }

    return graph;
  }

  getGraph(entityIdOrRb: number | RigidBodyComponent): MotionGraph | null {
    if (typeof entityIdOrRb === 'number') {
      return this.graphsByEntity.get(entityIdOrRb) ?? null;
    }
    return this.graphsByRb.get(entityIdOrRb) ?? null;
  }

  getOrCreateGraph(
    entityId: number,
    rb: RigidBodyComponent,
    root: THREE.Object3D,
  ): MotionGraph {
    let graph = this.getGraph(entityId);
    if (!graph) {
      graph = this.createGraph(root, { rb, entityId });
    }
    return graph;
  }

  play(
    entityIdOrRb: number | RigidBodyComponent,
    clipNameOrClip: string | THREE.AnimationClip,
    options: PlayOptions = {},
  ): MotionHandle | null {
    const graph = this.getGraph(entityIdOrRb);
    if (!graph) {
      console.warn(`[MotionDirectorManager] No MotionGraph found for target`);
      return null;
    }
    return graph.play(clipNameOrClip, options);
  }

  stop(entityIdOrRb: number | RigidBodyComponent, fade = 0.2, layer?: string | number): void {
    const graph = this.getGraph(entityIdOrRb);
    if (graph) {
      graph.stop(fade, layer);
    }
  }

  inspect(entityIdOrRb: number | RigidBodyComponent): MotionGraphInspection | null {
    const graph = this.getGraph(entityIdOrRb);
    return graph ? graph.inspect() : null;
  }

  update(dt: number): void {
    for (const graph of this.allGraphs) {
      graph.update(dt);
    }
  }

  removeGraph(entityIdOrRb: number | RigidBodyComponent): boolean {
    const graph = this.getGraph(entityIdOrRb);
    if (!graph) return false;

    graph.dispose();
    this.allGraphs.delete(graph);
    if (graph.entityId !== undefined) {
      this.graphsByEntity.delete(graph.entityId);
    }
    if (graph.rb) {
      this.graphsByRb.delete(graph.rb);
    }
    return true;
  }

  dispose(): void {
    for (const g of this.allGraphs) {
      g.dispose();
    }
    this.allGraphs.clear();
    this.graphsByEntity.clear();
    this.graphsByRb.clear();
  }

  get liveGraphs(): ReadonlySet<MotionGraph> {
    return this.allGraphs;
  }
}
