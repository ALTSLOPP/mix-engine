/**
 * AssetDatabase — Central registry for project asset indexing, GUID resolution,
 * and forward/reverse dependency tracking.
 */

import { SidecarMetadata, type AssetSidecarMeta, type AssetType } from './SidecarMetadata';

export interface AssetEntry {
  guid: string;
  path: string;
  meta: AssetSidecarMeta;
}

export class AssetDatabase {
  private readonly guidToEntry = new Map<string, AssetEntry>();
  private readonly pathToGuid = new Map<string, string>();
  private readonly dependentsMap = new Map<string, Set<string>>(); // targetGuid -> Set of callerGuids

  /**
   * Registers or updates an asset in the database.
   */
  registerAsset(filePath: string, meta?: AssetSidecarMeta): AssetEntry {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const existingGuid = this.pathToGuid.get(normalizedPath);
    const assignedMeta = meta ?? (existingGuid ? this.guidToEntry.get(existingGuid)?.meta : undefined) ?? SidecarMetadata.createDefault(normalizedPath);

    // If path was already registered to a different GUID, clean old entry
    if (existingGuid && existingGuid !== assignedMeta.guid) {
      this.guidToEntry.delete(existingGuid);
    }

    // If this GUID was already registered at a different path, clean up old pathToGuid mapping
    const existingEntryForGuid = this.guidToEntry.get(assignedMeta.guid);
    if (existingEntryForGuid && existingEntryForGuid.path !== normalizedPath) {
      this.pathToGuid.delete(existingEntryForGuid.path);
    }

    const entry: AssetEntry = {
      guid: assignedMeta.guid,
      path: normalizedPath,
      meta: assignedMeta,
    };

    this.guidToEntry.set(assignedMeta.guid, entry);
    this.pathToGuid.set(normalizedPath, assignedMeta.guid);

    this.rebuildDependencyGraph();
    return entry;
  }

  /**
   * Look up asset by persistent GUID.
   */
  getAssetByGuid(guid: string): AssetEntry | undefined {
    return this.guidToEntry.get(guid);
  }

  /**
   * Look up asset by project path.
   */
  getAssetByPath(filePath: string): AssetEntry | undefined {
    const normalized = filePath.replace(/\\/g, '/');
    const guid = this.pathToGuid.get(normalized);
    return guid ? this.guidToEntry.get(guid) : undefined;
  }

  /**
   * Move / rename an asset while preserving its persistent GUID and sidecar metadata.
   */
  moveAsset(oldPath: string, newPath: string): boolean {
    const normOld = oldPath.replace(/\\/g, '/');
    const normNew = newPath.replace(/\\/g, '/');
    const guid = this.pathToGuid.get(normOld);
    if (!guid) return false;
    const destinationGuid = this.pathToGuid.get(normNew);
    if (destinationGuid && destinationGuid !== guid) return false;

    const entry = this.guidToEntry.get(guid);
    if (!entry) return false;

    this.pathToGuid.delete(normOld);
    entry.path = normNew;
    this.pathToGuid.set(normNew, guid);
    return true;
  }

  /**
   * Remove an asset from the database.
   */
  deleteAsset(guidOrPath: string): boolean {
    const entry = this.guidToEntry.get(guidOrPath) ?? this.getAssetByPath(guidOrPath);
    if (!entry) return false;

    this.guidToEntry.delete(entry.guid);
    this.pathToGuid.delete(entry.path);
    this.rebuildDependencyGraph();
    return true;
  }

  /**
   * Returns all asset GUIDs that the given asset depends on.
   */
  getDependencies(guid: string): string[] {
    const entry = this.guidToEntry.get(guid);
    return entry?.meta.dependencies ? [...entry.meta.dependencies] : [];
  }

  /**
   * Returns all asset GUIDs that depend on the given asset (reverse lookup).
   */
  getDependents(guid: string): string[] {
    const callers = this.dependentsMap.get(guid);
    return callers ? Array.from(callers) : [];
  }

  /**
   * Returns all indexed assets.
   */
  allAssets(): AssetEntry[] {
    return Array.from(this.guidToEntry.values());
  }

  /**
   * Rebuilds the reverse dependency index.
   */
  private rebuildDependencyGraph(): void {
    this.dependentsMap.clear();
    for (const [callerGuid, entry] of this.guidToEntry.entries()) {
      for (const depGuid of entry.meta.dependencies ?? []) {
        let set = this.dependentsMap.get(depGuid);
        if (!set) {
          set = new Set();
          this.dependentsMap.set(depGuid, set);
        }
        set.add(callerGuid);
      }
    }
  }

  /**
   * Detects circular dependency cycles across the asset graph.
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (curr: string, pathAcc: string[]) => {
      visited.add(curr);
      recStack.add(curr);
      pathAcc.push(curr);

      for (const dep of this.getDependencies(curr)) {
        if (!visited.has(dep)) {
          dfs(dep, pathAcc);
        } else if (recStack.has(dep)) {
          const cycleStart = pathAcc.indexOf(dep);
          cycles.push(pathAcc.slice(cycleStart).concat(dep));
        }
      }

      pathAcc.pop();
      recStack.delete(curr);
    };

    for (const guid of this.guidToEntry.keys()) {
      if (!visited.has(guid)) {
        dfs(guid, []);
      }
    }

    return cycles;
  }
}
