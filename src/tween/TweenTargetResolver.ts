import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { SceneManager } from '../ecs/SceneManager';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface ResolvedTarget {
  rawTarget: any;
  resolvedProperty: string;
  entityId?: number;
  rb?: RigidBodyComponent;
  canonicalKey: string;
  isPhysicsTarget: boolean;
}

export class TweenTargetResolver {
  private static objectIdMap = new WeakMap<object, number>();
  private static nextObjId = 1;

  static getObjectId(obj: object): number {
    let id = TweenTargetResolver.objectIdMap.get(obj);
    if (id === undefined) {
      id = TweenTargetResolver.nextObjId++;
      TweenTargetResolver.objectIdMap.set(obj, id);
    }
    return id;
  }

  /**
   * Resolve an arbitrary target identifier to a concrete target object and property path.
   */
  static resolve(
    targetInput: any,
    propertyPath: string,
    engine?: Engine,
    sceneManager?: SceneManager,
  ): ResolvedTarget | null {
    if (!targetInput) return null;

    // Validate path security
    const parts = propertyPath.split('.');
    for (const part of parts) {
      if (FORBIDDEN_KEYS.has(part)) {
        throw new Error(`[TweenTargetResolver] Unsafe property segment '${part}' rejected.`);
      }
    }

    const sm = sceneManager ?? engine?.sceneManager;
    let rawTarget: any = targetInput;
    let entityId: number | undefined;
    let rb: RigidBodyComponent | undefined;
    let isPhysicsTarget = false;

    // 1. Target is a numeric entity ID
    if (typeof targetInput === 'number') {
      entityId = targetInput;
      if (sm) {
        rb = sm.getRigidBody(entityId) ?? undefined;
        rawTarget = rb?.mesh ?? sm.getBlueprint(entityId) ?? null;
      }
    }
    // 2. Target is a string reference
    else if (typeof targetInput === 'string') {
      const trimmed = targetInput.trim();
      if (trimmed === '@player' && engine?.player) {
        const pId = engine.player.getPossessedId();
        if (pId !== null && pId !== undefined) {
          entityId = pId;
          rb = sm?.getRigidBody(entityId) ?? undefined;
          rawTarget = rb?.mesh ?? null;
        }
      } else if (trimmed === '@camera' && engine?.viewport) {
        rawTarget = engine.viewport.camera;
      } else if (sm) {
        // Try resolving by name or tag via AI bridge / SceneManager
        const resolvedId = engine?.aiBridge?.resolveEntity(trimmed);
        if (resolvedId !== undefined) {
          entityId = resolvedId;
          rb = sm.getRigidBody(entityId) ?? undefined;
          rawTarget = rb?.mesh ?? sm.getBlueprint(entityId) ?? null;
        }
      }
    }
    // 3. Target is an Object3D or RigidBodyComponent
    else if (typeof targetInput === 'object') {
      if ('rapierBody' in targetInput && 'mesh' in targetInput) {
        // Target is RigidBodyComponent
        rb = targetInput as RigidBodyComponent;
        rawTarget = rb.mesh;
        if (sm) {
          entityId = sm.entityOf(rb) ?? undefined;
        }
      } else if (targetInput instanceof THREE.Object3D) {
        rawTarget = targetInput;
        if (sm) {
          for (const body of sm.rigidBodyList) {
            if (body.mesh === targetInput) {
              rb = body;
              entityId = sm.entityOf(body) ?? undefined;
              break;
            }
          }
        }
      }
    }

    if (!rawTarget) return null;

    // Map common aliases (e.g. 'transform.position.y' -> 'position.y' on THREE.Object3D)
    let finalPath = propertyPath;
    if (rawTarget instanceof THREE.Object3D) {
      if (finalPath.startsWith('transform.')) {
        finalPath = finalPath.slice('transform.'.length);
      }
    }

    // Determine if physics body needs synchronization
    if (rb && (finalPath.startsWith('position') || finalPath.startsWith('rotation') || finalPath.startsWith('quaternion'))) {
      isPhysicsTarget = true;
    }

    const targetPrefix = entityId !== undefined
      ? `entity:${entityId}`
      : typeof rawTarget === 'object'
        ? `obj:${TweenTargetResolver.getObjectId(rawTarget)}`
        : `val:${String(rawTarget)}`;

    const canonicalKey = `${targetPrefix}#${finalPath}`;

    return {
      rawTarget,
      resolvedProperty: finalPath,
      entityId,
      rb,
      canonicalKey,
      isPhysicsTarget,
    };
  }

  /**
   * Suggest close matching property or easing names for typo-tolerance in IDE commands.
   */
  static findSuggestions(input: string, candidates: string[]): string[] {
    if (!input || candidates.length === 0) return [];
    const lowerInput = input.toLowerCase();

    return candidates
      .map((c) => ({ candidate: c, dist: TweenTargetResolver.levenshtein(lowerInput, c.toLowerCase()) }))
      .filter((item) => item.dist <= 3 || item.candidate.toLowerCase().includes(lowerInput))
      .sort((a, b) => a.dist - b.dist)
      .map((item) => item.candidate)
      .slice(0, 3);
  }

  static levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1,     // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
}
