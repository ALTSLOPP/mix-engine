import * as THREE from 'three';
import type { Engine } from './Engine';
import type { EntityBlueprint, EntityId } from '../ecs/SceneManager';

export interface PrefabNode {
  id?: string;
  blueprint?: EntityBlueprint;
  prefab?: string;
  variant?: string;
  localPos?: [number, number, number];
  localQuat?: [number, number, number, number];
  children?: PrefabNode[];
}

export interface PrefabNodeOverride {
  blueprint?: Partial<EntityBlueprint> & { params?: Record<string, unknown> };
  localPos?: [number, number, number];
  localQuat?: [number, number, number, number];
  enabled?: boolean;
}

export interface PrefabVariant { overrides: Record<string, PrefabNodeOverride>; }
export interface Prefab { name: string; root: PrefabNode; variants?: Record<string, PrefabVariant>; }
export interface PrefabInstance {
  rootEntity: EntityId;
  entityIds: EntityId[];
  prefabName: string;
  variant?: string;
  linked: boolean;
}

/** Nested/variant prefab registry with explicit instance tracking and unpacking. */
export class PrefabManager {
  private readonly prefabs = new Map<string, Prefab>();
  private readonly instances = new Map<EntityId, PrefabInstance>();

  constructor(private readonly engine: Engine) {}

  register(prefab: Prefab): void {
    if (!prefab.name || !prefab.root) throw new Error('Prefab requires a name and root node');
    this.prefabs.set(prefab.name, structuredClone(prefab));
  }

  getPrefab(name: string): Prefab | undefined { return this.prefabs.get(name); }
  listPrefabs(): string[] { return [...this.prefabs.keys()].sort(); }

  async loadFromUrl(url: string): Promise<Prefab> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PrefabManager: failed to fetch ${url} (status: ${res.status})`);
    const prefab = (await res.json()) as Prefab;
    this.register(prefab);
    return prefab;
  }

  spawn(prefabName: string, worldPos: THREE.Vector3, worldQuat = new THREE.Quaternion(), variant?: string): EntityId | null {
    const prefab = this.prefabs.get(prefabName);
    if (!prefab) return null;
    const entityIds: EntityId[] = [];
    const root = this.spawnNode(prefab, prefab.root, worldPos, worldQuat, undefined, entityIds, variant, new Set([prefabName]));
    if (root === null) return null;
    this.instances.set(root, { rootEntity: root, entityIds, prefabName, variant, linked: true });
    return root;
  }

  getInstance(rootEntity: EntityId): PrefabInstance | undefined { return this.instances.get(rootEntity); }
  listInstances(): PrefabInstance[] { return [...this.instances.values()].map((item) => ({ ...item, entityIds: [...item.entityIds] })); }

  /** Break the prefab link while leaving every spawned entity intact and editable. */
  unpack(rootEntity: EntityId): PrefabInstance | null {
    const instance = this.instances.get(rootEntity);
    if (!instance) return null;
    instance.linked = false;
    this.instances.delete(rootEntity);
    return { ...instance, entityIds: [...instance.entityIds] };
  }

  destroyInstance(rootEntity: EntityId): boolean {
    if (!this.instances.has(rootEntity)) return false;
    this.engine.sceneManager.requestDestroy(rootEntity, 'cascade');
    this.instances.delete(rootEntity);
    return true;
  }

  private spawnNode(
    owner: Prefab,
    source: PrefabNode,
    worldPos: THREE.Vector3,
    worldQuat: THREE.Quaternion,
    parent: EntityId | undefined,
    entityIds: EntityId[],
    variantName: string | undefined,
    stack: Set<string>,
  ): EntityId | null {
    let node = this.applyOverride(source, owner.variants?.[variantName ?? '']?.overrides[source.id ?? '']);
    if (!node) return null;

    if (node.prefab) {
      const nestedName = node.prefab;
      if (stack.has(nestedName)) throw new Error(`Prefab cycle detected: ${[...stack, nestedName].join(' -> ')}`);
      const nested = this.prefabs.get(nestedName);
      if (!nested) throw new Error(`Nested prefab '${nestedName}' is not registered`);
      const nestedRoot = this.applyOverride(nested.root, nested.variants?.[node.variant ?? '']?.overrides[nested.root.id ?? '']);
      if (!nestedRoot) return null;
      node = {
        ...nestedRoot,
        id: node.id ?? nestedRoot.id,
        localPos: node.localPos ?? nestedRoot.localPos,
        localQuat: node.localQuat ?? nestedRoot.localQuat,
        children: [...(nestedRoot.children ?? []), ...(node.children ?? [])],
      };
      owner = nested;
      variantName = source.variant;
      stack = new Set(stack).add(nestedName);
    }

    if (!node.blueprint) throw new Error(`Prefab node '${node.id ?? '<unnamed>'}' has neither blueprint nor prefab`);
    const id = this.engine.sceneManager.spawnNow(worldPos, node.blueprint, { parent, quat: worldQuat });
    entityIds.push(id);

    for (const rawChild of node.children ?? []) {
      const child = this.applyOverride(rawChild, owner.variants?.[variantName ?? '']?.overrides[rawChild.id ?? '']);
      if (!child) continue;
      const localPos = new THREE.Vector3(...(child.localPos ?? [0, 0, 0]));
      const localQuat = new THREE.Quaternion(...(child.localQuat ?? [0, 0, 0, 1]));
      const childWorldPos = localPos.applyQuaternion(worldQuat).add(worldPos);
      const childWorldQuat = worldQuat.clone().multiply(localQuat);
      this.spawnNode(owner, child, childWorldPos, childWorldQuat, id, entityIds, variantName, stack);
    }
    return id;
  }

  private applyOverride(node: PrefabNode, override?: PrefabNodeOverride): PrefabNode | null {
    if (override?.enabled === false) return null;
    if (!override) return structuredClone(node);
    const blueprint = node.blueprint
      ? { ...node.blueprint, ...override.blueprint, params: { ...node.blueprint.params, ...(override.blueprint?.params ?? {}) } } as EntityBlueprint
      : undefined;
    return { ...structuredClone(node), ...override, blueprint };
  }
}
