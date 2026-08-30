/**
 * RenderGraph — Directed Acyclic Graph (DAG) render pipeline coordinator.
 *
 * Manages virtual render targets, pass dependencies, topological execution,
 * and transient resource pooling.
 */

import * as THREE from 'three';

export interface RenderResourceDesc {
  name: string;
  type: 'color' | 'depth' | 'stencil';
  format?: number;
  width?: number;
  height?: number;
  scale?: number; // Viewport scale multiplier (e.g. 0.5 for half-res bloom)
}

export interface RenderPassContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  resources: Map<string, THREE.WebGLRenderTarget | null>;
  viewportWidth: number;
  viewportHeight: number;
}

export interface RenderPassNode {
  name: string;
  inputs: string[]; // Resource names this pass reads
  outputs: string[]; // Resource names this pass writes
  enabled?: boolean;
  execute: (ctx: RenderPassContext) => void;
}

export class RenderGraph {
  private readonly passes = new Map<string, RenderPassNode>();
  private readonly resourceDescs = new Map<string, RenderResourceDesc>();
  private readonly resourcePool = new Map<string, THREE.WebGLRenderTarget>();

  /**
   * Registers a virtual render target resource descriptor.
   */
  declareResource(desc: RenderResourceDesc): this {
    this.resourceDescs.set(desc.name, desc);
    return this;
  }

  /**
   * Adds a render pass node to the graph.
   */
  addPass(pass: RenderPassNode): this {
    if (this.passes.has(pass.name)) throw new Error(`RenderGraph pass '${pass.name}' is already registered.`);
    this.passes.set(pass.name, pass);
    return this;
  }

  /**
   * Computes topological execution order of passes based on resource dependencies.
   */
  compile(): RenderPassNode[] {
    const passList = Array.from(this.passes.values()).filter((p) => p.enabled !== false);
    const passByName = new Map<string, RenderPassNode>();
    for (const p of passList) passByName.set(p.name, p);

    // Map resource name to writer pass
    const resourceWriter = new Map<string, string>();
    for (const p of passList) {
      for (const out of p.outputs) {
        if (resourceWriter.has(out)) {
          throw new Error(`RenderGraph resource '${out}' has multiple writers ('${resourceWriter.get(out)}' and '${p.name}').`);
        }
        resourceWriter.set(out, p.name);
      }
    }
    for (const p of passList) {
      for (const input of p.inputs) {
        if (input !== 'backbuffer' && input !== 'screen' && !resourceWriter.has(input) && !this.resourceDescs.has(input)) {
          throw new Error(`RenderGraph pass '${p.name}' reads undeclared resource '${input}'.`);
        }
      }
    }

    // Build dependency graph (pass -> Set of passes it depends on)
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();

    for (const p of passList) {
      inDegree.set(p.name, 0);
      dependents.set(p.name, new Set());
    }

    for (const p of passList) {
      for (const inputRes of p.inputs) {
        const writerName = resourceWriter.get(inputRes);
        if (writerName && writerName !== p.name) {
          const set = dependents.get(writerName)!;
          if (!set.has(p.name)) {
            set.add(p.name);
            inDegree.set(p.name, (inDegree.get(p.name) ?? 0) + 1);
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(name);
    }

    const ordered: RenderPassNode[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      ordered.push(passByName.get(curr)!);

      for (const next of dependents.get(curr)!) {
        const remaining = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, remaining);
        if (remaining === 0) {
          queue.push(next);
        }
      }
    }

    if (ordered.length < passList.length) {
      throw new Error('Cyclic dependency detected in RenderGraph passes.');
    }

    return ordered;
  }

  /**
   * Returns a pooled render target by resource name.
   */
  getResource(name: string): THREE.WebGLRenderTarget | undefined {
    return this.resourcePool.get(name);
  }

  /**
   * Executes the compiled render graph.
   */
  execute(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): void {
    const ordered = this.compile();
    const runtimeResources = new Map<string, THREE.WebGLRenderTarget | null>();

    // Pass outputs are virtual resources even when the caller omitted an explicit
    // descriptor. Infer a conservative descriptor so execute() never hands a pass
    // an absent resource after compile() accepted the graph.
    for (const pass of ordered) {
      for (const output of pass.outputs) {
        if (output === 'backbuffer' || output === 'screen' || this.resourceDescs.has(output)) continue;
        const lower = output.toLowerCase();
        this.resourceDescs.set(output, {
          name: output,
          type: lower.includes('depth') ? 'depth' : lower.includes('stencil') ? 'stencil' : 'color',
        });
      }
    }

    // Allocate / reuse pooled render targets for all declared resources
    for (const [name, desc] of this.resourceDescs.entries()) {
      const targetW = desc.width ?? Math.max(1, Math.floor(width * (desc.scale ?? 1)));
      const targetH = desc.height ?? Math.max(1, Math.floor(height * (desc.scale ?? 1)));

      let target = this.resourcePool.get(name);
      if (!target || target.width !== targetW || target.height !== targetH) {
        if (target) target.dispose();
        target = new THREE.WebGLRenderTarget(targetW, targetH, {
          format: desc.format ?? THREE.RGBAFormat,
          depthBuffer: desc.type === 'depth' || desc.type === 'color' || desc.type === 'stencil',
          stencilBuffer: desc.type === 'stencil',
        });
        if (desc.type === 'depth') {
          target.depthTexture = new THREE.DepthTexture(targetW, targetH, THREE.UnsignedIntType);
          target.depthTexture.format = THREE.DepthFormat;
        }
        this.resourcePool.set(name, target);
      }
      runtimeResources.set(name, target);
    }

    runtimeResources.set('backbuffer', null);
    runtimeResources.set('screen', null);

    const ctx: RenderPassContext = {
      renderer,
      scene,
      camera,
      resources: runtimeResources,
      viewportWidth: width,
      viewportHeight: height,
    };

    for (const pass of ordered) {
      pass.execute(ctx);
    }
  }

  /**
   * Disposes pooled render targets.
   */
  dispose(): void {
    for (const target of this.resourcePool.values()) {
      target.dispose();
    }
    this.resourcePool.clear();
  }

  /**
   * Clears all registered passes and resources.
   */
  clear(): void {
    this.passes.clear();
    this.resourceDescs.clear();
    this.dispose();
  }
}
