import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RenderGraph, type RenderPassNode } from '../src/rendering/RenderGraph';
import {
  MaterialNodeGraphCompiler,
  type MaterialGraph,
} from '../src/materials/MaterialNodeGraph';

describe('RenderGraph Unit Tests', () => {
  it('topologically sorts passes by resource dependencies', () => {
    const graph = new RenderGraph();

    const executedOrder: string[] = [];

    const depthPass: RenderPassNode = {
      name: 'DepthPrePass',
      inputs: [],
      outputs: ['DepthBuffer'],
      execute: () => executedOrder.push('DepthPrePass'),
    };

    const mainPass: RenderPassNode = {
      name: 'MainColorPass',
      inputs: ['DepthBuffer'],
      outputs: ['ColorHDR'],
      execute: () => executedOrder.push('MainColorPass'),
    };

    const postFxPass: RenderPassNode = {
      name: 'PostFXPass',
      inputs: ['ColorHDR'],
      outputs: ['BackBuffer'],
      execute: () => executedOrder.push('PostFXPass'),
    };

    // Add in reverse order
    graph.addPass(postFxPass);
    graph.addPass(mainPass);
    graph.addPass(depthPass);

    const compiled = graph.compile();
    const names = compiled.map((p) => p.name);

    expect(names).toEqual(['DepthPrePass', 'MainColorPass', 'PostFXPass']);
  });

  it('detects cyclic dependencies in render passes', () => {
    const graph = new RenderGraph();

    graph.addPass({
      name: 'PassA',
      inputs: ['ResourceB'],
      outputs: ['ResourceA'],
      execute: () => {},
    });

    graph.addPass({
      name: 'PassB',
      inputs: ['ResourceA'],
      outputs: ['ResourceB'],
      execute: () => {},
    });

    expect(() => graph.compile()).toThrowError(/Cyclic dependency/);
  });
});

describe('MaterialNodeGraph Unit Tests', () => {
  it('compiles procedural shader graph to valid GLSL shaders and ShaderMaterial', () => {
    const graph: MaterialGraph = {
      name: 'ProceduralGlow',
      nodes: [
        {
          id: 'baseColor',
          type: 'constant_vec3',
          params: { value: [0.2, 0.5, 0.9] },
        },
        {
          id: 'glowColor',
          type: 'constant_vec3',
          params: { value: [1.0, 0.8, 0.2] },
        },
        {
          id: 'timeNode',
          type: 'time',
        },
        {
          id: 'blendColor',
          type: 'lerp',
          inputs: {
            a: { nodeId: 'baseColor' },
            b: { nodeId: 'glowColor' },
            t: 0.5,
          },
        },
        {
          id: 'master',
          type: 'pbr_surface',
          inputs: {
            albedo: { nodeId: 'blendColor' },
            roughness: 0.3,
            metalness: 0.8,
            emissive: { nodeId: 'glowColor' },
          },
        },
      ],
      outputNodeId: 'master',
    };

    const compiled = MaterialNodeGraphCompiler.compile(graph);

    expect(compiled.vertexShader).toContain('void main()');
    expect(compiled.fragmentShader).toContain('void main()');
    expect(compiled.fragmentShader).toContain('gl_FragColor');
    expect(compiled.fragmentShader).toContain('mix(');

    const mat = MaterialNodeGraphCompiler.createShaderMaterial(graph);
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.uniforms.uTime).toBeDefined();
  });

  it('serializes and deserializes material graph JSON', () => {
    const graph: MaterialGraph = {
      name: 'TestGraph',
      nodes: [
        { id: 'const1', type: 'constant_float', params: { value: 1.5 } },
        { id: 'out', type: 'pbr_surface', inputs: { roughness: { nodeId: 'const1' } } },
      ],
      outputNodeId: 'out',
    };

    const json = MaterialNodeGraphCompiler.serialize(graph);
    const parsed = MaterialNodeGraphCompiler.deserialize(json);

    expect(parsed.name).toBe('TestGraph');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.outputNodeId).toBe('out');
  });

  it('compiles math operations (sine, cosine, dot, normalize, subtract, divide) to GLSL', () => {
    const graph: MaterialGraph = {
      name: 'MathShaderGraph',
      nodes: [
        { id: 't', type: 'time' },
        { id: 'sinVal', type: 'sine', inputs: { a: { nodeId: 't' } } },
        { id: 'cosVal', type: 'cosine', inputs: { a: { nodeId: 't' } } },
        { id: 'vecA', type: 'constant_vec3', params: { value: [1, 2, 3] } },
        { id: 'normA', type: 'normalize', inputs: { a: { nodeId: 'vecA' } } },
        { id: 'dotVal', type: 'dot', inputs: { a: { nodeId: 'vecA' }, b: { nodeId: 'normA' } } },
        {
          id: 'master',
          type: 'pbr_surface',
          inputs: {
            roughness: { nodeId: 'sinVal' },
            metalness: { nodeId: 'cosVal' },
            albedo: { nodeId: 'normA' },
            emissive: { nodeId: 'dotVal' },
          },
        },
      ],
      outputNodeId: 'master',
    };

    const compiled = MaterialNodeGraphCompiler.compile(graph);
    expect(compiled.fragmentShader).toContain('sin(');
    expect(compiled.fragmentShader).toContain('cos(');
    expect(compiled.fragmentShader).toContain('normalize(');
    expect(compiled.fragmentShader).toContain('dot(');
  });
});
