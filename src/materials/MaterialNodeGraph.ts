/**
 * MaterialNodeGraph — Declarative node-based shader graph and GLSL compiler.
 *
 * Allows AI agents and authoring tools to construct, serialize, and compile
 * custom procedural PBR materials and visual shaders.
 */

import * as THREE from 'three';

export type MaterialNodeType =
  | 'constant_float'
  | 'constant_vec3'
  | 'constant_vec4'
  | 'uv'
  | 'normal'
  | 'time'
  | 'texture_sample'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'dot'
  | 'normalize'
  | 'sine'
  | 'cosine'
  | 'lerp'
  | 'clamp'
  | 'pbr_surface';

export interface NodeConnection {
  nodeId: string;
  socket?: string;
}

export type InputValue = number | number[] | NodeConnection;

export interface MaterialNode {
  id: string;
  type: MaterialNodeType;
  params?: Record<string, unknown>;
  inputs?: Record<string, InputValue>;
}

export interface MaterialGraph {
  name: string;
  nodes: MaterialNode[];
  outputNodeId: string;
}

export class MaterialNodeGraphCompiler {
  /**
   * Compiles a MaterialGraph into vertex and fragment GLSL shaders with uniforms.
   */
  static compile(graph: MaterialGraph): {
    vertexShader: string;
    fragmentShader: string;
    uniforms: Record<string, THREE.IUniform>;
  } {
    const nodeMap = new Map<string, MaterialNode>();
    const sanitizedIds = new Map<string, string>();
    const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
    for (const n of graph.nodes) {
      if (!n.id || nodeMap.has(n.id)) throw new Error(`Duplicate or empty material node id '${n.id}'.`);
      const safe = sanitizeId(n.id);
      const collision = sanitizedIds.get(safe);
      if (collision) throw new Error(`Material node ids '${collision}' and '${n.id}' compile to the same GLSL identifier.`);
      sanitizedIds.set(safe, n.id);
      nodeMap.set(n.id, n);
    }

    const outputNode = nodeMap.get(graph.outputNodeId);
    if (!outputNode || outputNode.type !== 'pbr_surface') {
      throw new Error(`Invalid material graph: output node '${graph.outputNodeId}' is not a pbr_surface node.`);
    }

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
    };

    const samplerDeclarations: string[] = [];
    const lines: string[] = [];
    const computedNodes = new Set<string>();
    const visiting = new Set<string>();

    const resolveInput = (val: InputValue | undefined, fallback: string): string => {
      if (val === undefined) return fallback;
      if (typeof val === 'number') {
        if (!Number.isFinite(val)) throw new Error('Material graph numeric inputs must be finite.');
        return `float(${val.toFixed(4)})`;
      }
      if (Array.isArray(val)) {
        if (val.length < 2 || val.length > 4 || val.some((n) => !Number.isFinite(n))) {
          throw new Error('Material graph vector inputs must contain 2..4 finite numbers.');
        }
        if (val.length === 3) return `vec3(${val[0].toFixed(4)}, ${val[1].toFixed(4)}, ${val[2].toFixed(4)})`;
        if (val.length === 4) return `vec4(${val[0].toFixed(4)}, ${val[1].toFixed(4)}, ${val[2].toFixed(4)}, ${val[3].toFixed(4)})`;
        return `vec2(${val[0].toFixed(4)}, ${val[1].toFixed(4)})`;
      }
      if (typeof val === 'object' && 'nodeId' in val) {
        emitNode(val.nodeId);
        const swizzle = val.socket?.trim();
        if (swizzle && !/^(r|g|b|a|x|y|z|w|rgb|xyz|xy)$/.test(swizzle)) {
          throw new Error(`Unsupported material socket '${swizzle}' on node '${val.nodeId}'.`);
        }
        return `var_${sanitizeId(val.nodeId)}${swizzle ? `.${swizzle}` : ''}`;
      }
      return fallback;
    };

    const valueType = (val: InputValue | undefined): 'float' | 'vec2' | 'vec3' | 'vec4' | undefined => {
      if (val === undefined) return undefined;
      if (typeof val === 'number') return 'float';
      if (Array.isArray(val)) return `vec${val.length}` as 'vec2' | 'vec3' | 'vec4';
      const socket = val.socket?.trim();
      if (socket && /^(r|g|b|a|x|y|z|w)$/.test(socket)) return 'float';
      if (socket === 'xy') return 'vec2';
      if (socket === 'rgb' || socket === 'xyz') return 'vec3';
      return outputType(nodeMap.get(val.nodeId)?.type ?? 'constant_float');
    };

    const typedInput = (
      val: InputValue | undefined,
      fallback: string,
      target: 'float' | 'vec2' | 'vec3',
    ): string => {
      const expr = resolveInput(val, fallback);
      const source = valueType(val) ?? target;
      if (source === target) return expr;
      if (target === 'float') return `(${expr}).x`;
      if (target === 'vec2') {
        if (source === 'float') return `vec2(${expr})`;
        return `(${expr}).xy`;
      }
      if (source === 'float') return `vec3(${expr})`;
      if (source === 'vec2') return `vec3(${expr}, 0.0)`;
      return `(${expr}).rgb`;
    };

    const emitNode = (nodeId: string): void => {
      if (computedNodes.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error(`Cyclic dependency detected in MaterialNodeGraph at node '${nodeId}'.`);
      }
      const node = nodeMap.get(nodeId);
      if (!node) throw new Error(`Material graph references missing node '${nodeId}'.`);

      visiting.add(nodeId);
      const varName = `var_${sanitizeId(node.id)}`;

      switch (node.type) {
        case 'constant_float': {
          const v = Number(node.params?.value ?? 0);
          if (!Number.isFinite(v)) throw new Error(`Node '${node.id}' contains a non-finite constant.`);
          lines.push(`  float ${varName} = float(${v.toFixed(4)});`);
          break;
        }
        case 'constant_vec3': {
          const arr = finiteVector(node.params?.value, 3, node.id, [1, 1, 1]);
          lines.push(`  vec3 ${varName} = vec3(${arr[0].toFixed(4)}, ${arr[1].toFixed(4)}, ${arr[2].toFixed(4)});`);
          break;
        }
        case 'constant_vec4': {
          const arr = finiteVector(node.params?.value, 4, node.id, [1, 1, 1, 1]);
          lines.push(`  vec4 ${varName} = vec4(${arr[0].toFixed(4)}, ${arr[1].toFixed(4)}, ${arr[2].toFixed(4)}, ${arr[3].toFixed(4)});`);
          break;
        }
        case 'uv': {
          lines.push(`  vec2 ${varName} = vUv;`);
          break;
        }
        case 'normal': {
          lines.push(`  vec3 ${varName} = normalize(vNormal);`);
          break;
        }
        case 'time': {
          lines.push(`  float ${varName} = uTime;`);
          break;
        }
        case 'texture_sample': {
          const uniformName = `uTex_${sanitizeId(node.id)}`;
          if (!uniforms[uniformName]) {
            uniforms[uniformName] = { value: node.params?.texture ?? null };
            samplerDeclarations.push(`uniform sampler2D ${uniformName};`);
          }
          const uvCoord = typedInput(node.inputs?.uv, 'vUv', 'vec2');
          lines.push(`  vec4 ${varName} = texture2D(${uniformName}, ${uvCoord});`);
          break;
        }
        case 'add': {
          const a = typedInput(node.inputs?.a, 'vec3(0.0)', 'vec3');
          const b = typedInput(node.inputs?.b, 'vec3(0.0)', 'vec3');
          lines.push(`  vec3 ${varName} = ${a} + ${b};`);
          break;
        }
        case 'subtract': {
          const a = typedInput(node.inputs?.a, 'vec3(0.0)', 'vec3');
          const b = typedInput(node.inputs?.b, 'vec3(0.0)', 'vec3');
          lines.push(`  vec3 ${varName} = ${a} - ${b};`);
          break;
        }
        case 'multiply': {
          const a = typedInput(node.inputs?.a, 'vec3(1.0)', 'vec3');
          const b = typedInput(node.inputs?.b, 'vec3(1.0)', 'vec3');
          lines.push(`  vec3 ${varName} = ${a} * ${b};`);
          break;
        }
        case 'divide': {
          const a = typedInput(node.inputs?.a, 'vec3(1.0)', 'vec3');
          const b = typedInput(node.inputs?.b, 'vec3(1.0)', 'vec3');
          lines.push(`  vec3 ${varName} = ${a} / max(${b}, vec3(0.0001));`);
          break;
        }
        case 'dot': {
          const a = typedInput(node.inputs?.a, 'vec3(0.0)', 'vec3');
          const b = typedInput(node.inputs?.b, 'vec3(0.0)', 'vec3');
          lines.push(`  float ${varName} = dot(${a}, ${b});`);
          break;
        }
        case 'normalize': {
          const a = typedInput(node.inputs?.a, 'vec3(0.0, 1.0, 0.0)', 'vec3');
          lines.push(`  vec3 ${varName} = normalize(${a});`);
          break;
        }
        case 'sine': {
          const a = typedInput(node.inputs?.a, '0.0', 'float');
          lines.push(`  float ${varName} = sin(${a});`);
          break;
        }
        case 'cosine': {
          const a = typedInput(node.inputs?.a, '0.0', 'float');
          lines.push(`  float ${varName} = cos(${a});`);
          break;
        }
        case 'lerp': {
          const a = typedInput(node.inputs?.a, 'vec3(0.0)', 'vec3');
          const b = typedInput(node.inputs?.b, 'vec3(1.0)', 'vec3');
          const t = typedInput(node.inputs?.t, '0.5', 'float');
          lines.push(`  vec3 ${varName} = mix(${a}, ${b}, ${t});`);
          break;
        }
        case 'clamp': {
          const val = typedInput(node.inputs?.val, 'vec3(0.0)', 'vec3');
          const min = typedInput(node.inputs?.min, 'vec3(0.0)', 'vec3');
          const max = typedInput(node.inputs?.max, 'vec3(1.0)', 'vec3');
          lines.push(`  vec3 ${varName} = clamp(${val}, ${min}, ${max});`);
          break;
        }
      }

      visiting.delete(nodeId);
      computedNodes.add(nodeId);
    };

    // Emit master PBR output
    const pbrInput = (name: string, fallback: string, scalar: boolean): string => {
      const input = outputNode.inputs?.[name];
      const expr = resolveInput(input, fallback);
      if (!input || typeof input === 'number' || Array.isArray(input)) return expr;
      const source = nodeMap.get(input.nodeId)!;
      const type = outputType(source.type);
      if (scalar && type !== 'float') return `(${expr}).x`;
      if (!scalar && type === 'float') return `vec3(${expr})`;
      if (!scalar && type === 'vec4') return `(${expr}).rgb`;
      if (!scalar && type === 'vec2') return `vec3(${expr}, 0.0)`;
      return expr;
    };
    const albedoExpr = pbrInput('albedo', 'vec3(0.8, 0.8, 0.8)', false);
    const roughnessExpr = pbrInput('roughness', '0.5', true);
    const metalnessExpr = pbrInput('metalness', '0.0', true);
    const emissiveExpr = pbrInput('emissive', 'vec3(0.0)', false);

    const vertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = viewPos.xyz;
  gl_Position = projectionMatrix * viewPos;
}
`;

    const fragmentShader = `
uniform float uTime;
${samplerDeclarations.join('\n')}
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
${lines.join('\n')}
  vec3 albedo = ${albedoExpr};
  vec3 emissive = ${emissiveExpr};
  float roughness = clamp(${roughnessExpr}, 0.04, 1.0);
  float metalness = clamp(${metalnessExpr}, 0.0, 1.0);

  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vViewPosition);
  vec3 L = normalize(mat3(viewMatrix) * vec3(0.5, 1.0, 0.3));
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.001);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  // Fresnel Schlick
  vec3 F0 = mix(vec3(0.04), albedo, metalness);
  vec3 F = F0 + (1.0 - F0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);

  // GGX Normal Distribution
  float a = roughness * roughness;
  float a2 = a * a;
  float denom = (NdotH * NdotH * (a2 - 1.0) + 1.0);
  float D = a2 / (3.14159265 * denom * denom);

  // Geometric Shadowing
  float k = pow(roughness + 1.0, 2.0) / 8.0;
  float G = (NdotV / (NdotV * (1.0 - k) + k)) * (NdotL / (NdotL * (1.0 - k) + k));

  // Specular & Diffuse components
  vec3 specular = (D * F * G) / max(4.0 * NdotV * NdotL, 0.001);
  vec3 kD = (vec3(1.0) - F) * (1.0 - metalness);
  vec3 diffuse = kD * albedo / 3.14159265;

  vec3 ambient = vec3(0.05) * albedo;
  vec3 lighting = (diffuse + specular) * NdotL * vec3(1.0);
  vec3 finalColor = ambient + lighting + emissive;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

    return {
      vertexShader: vertexShader.trim(),
      fragmentShader: fragmentShader.trim(),
      uniforms,
    };
  }

  /**
   * Compiles graph directly into a THREE.ShaderMaterial.
   */
  static createShaderMaterial(graph: MaterialGraph): THREE.ShaderMaterial {
    const compiled = this.compile(graph);
    return new THREE.ShaderMaterial({
      vertexShader: compiled.vertexShader,
      fragmentShader: compiled.fragmentShader,
      uniforms: compiled.uniforms,
    });
  }

  /**
   * Serializes MaterialGraph to formatted JSON.
   */
  static serialize(graph: MaterialGraph): string {
    return JSON.stringify(graph, null, 2);
  }

  /**
   * Parses MaterialGraph from JSON string.
   */
  static deserialize(jsonStr: string): MaterialGraph {
    return JSON.parse(jsonStr) as MaterialGraph;
  }
}

function finiteVector(value: unknown, length: number, nodeId: string, fallback: number[]): number[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== length || value.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error(`Node '${nodeId}' requires exactly ${length} finite numeric values.`);
  }
  return value;
}

function outputType(type: MaterialNodeType): 'float' | 'vec2' | 'vec3' | 'vec4' {
  if (type === 'constant_float' || type === 'time' || type === 'dot' || type === 'sine' || type === 'cosine') return 'float';
  if (type === 'uv') return 'vec2';
  if (type === 'constant_vec4' || type === 'texture_sample') return 'vec4';
  return 'vec3';
}
