import defaultMatrixJson from './defaultCollisionMatrix.json';

export interface CollisionLayerDef {
  name: string;
  id: number; // 0..15
  collidesWith: string[];
}

export interface CollisionConfig {
  layers: CollisionLayerDef[];
}

/**
 * 16-bit declarative collision matrix for Rapier physics interaction groups.
 * Encodes memberships (upper 16 bits) and filter mask (lower 16 bits) into a 32-bit integer:
 *   interactionGroup = (memberships << 16) | filter
 */
export class CollisionMatrix {
  private readonly layers = new Map<string, CollisionLayerDef>();
  private readonly idToName = new Map<number, string>();
  private readonly compiledMasks = new Map<string, number>();

  constructor(config?: CollisionConfig) {
    if (config) {
      this.loadConfig(config);
    } else {
      this.loadConfig(defaultMatrixJson as CollisionConfig);
    }
  }

  /**
   * Load and recompile layer configuration.
   */
  loadConfig(config: CollisionConfig): void {
    this.layers.clear();
    this.idToName.clear();
    for (const layer of config.layers) {
      if (layer.id < 0 || layer.id > 15) {
        throw new Error(`Collision layer '${layer.name}' ID ${layer.id} must be in range 0..15`);
      }
      this.layers.set(layer.name, { ...layer });
      this.idToName.set(layer.id, layer.name);
    }
    this.recompile();
  }

  /**
   * Define or update a collision layer.
   */
  defineLayer(name: string, id: number, collidesWith: string[]): void {
    if (id < 0 || id > 15) {
      throw new Error(`Collision layer '${name}' ID ${id} must be in range 0..15`);
    }
    this.layers.set(name, { name, id, collidesWith: [...collidesWith] });
    this.idToName.set(id, name);
    this.recompile();
  }

  /**
   * Toggle collision between two layers.
   */
  setCollision(layerA: string, layerB: string, enable: boolean): void {
    const a = this.layers.get(layerA);
    const b = this.layers.get(layerB);
    if (!a || !b) {
      throw new Error(`Unknown layer(s): '${layerA}' or '${layerB}'`);
    }

    const updateLayer = (target: CollisionLayerDef, otherName: string) => {
      const idx = target.collidesWith.indexOf(otherName);
      if (enable && idx === -1) {
        target.collidesWith.push(otherName);
      } else if (!enable && idx !== -1) {
        target.collidesWith.splice(idx, 1);
      }
    };

    updateLayer(a, layerB);
    updateLayer(b, layerA);
    this.recompile();
  }

  /**
   * Recompile all 32-bit Rapier interaction group masks.
   */
  private recompile(): void {
    this.compiledMasks.clear();
    for (const [name, def] of this.layers.entries()) {
      const membership = (1 << def.id) & 0xffff;
      let filter = 0;
      for (const otherName of def.collidesWith) {
        const otherDef = this.layers.get(otherName);
        if (otherDef) {
          filter |= 1 << otherDef.id;
        }
      }
      filter &= 0xffff;
      const mask = ((membership << 16) | filter) >>> 0;
      this.compiledMasks.set(name, mask);
    }
  }

  /**
   * Get 32-bit Rapier interaction group for a layer name.
   */
  layerMask(layerName: string): number {
    const mask = this.compiledMasks.get(layerName);
    if (mask !== undefined) return mask;
    // Fallback: all-collide mask
    return 0xffffffff >>> 0;
  }

  /**
   * Get 16-bit layer bit for a layer name.
   */
  layerBit(layerName: string): number {
    const def = this.layers.get(layerName);
    return def ? 1 << def.id : 0;
  }

  /**
   * Get combined 16-bit filter bitmask for a list of layer names.
   */
  filterMask(layerNames: string[]): number {
    let mask = 0;
    for (const name of layerNames) {
      const def = this.layers.get(name);
      if (def) mask |= 1 << def.id;
    }
    return mask & 0xffff;
  }

  /**
   * Get layer ID by name.
   */
  getLayerId(layerName: string): number | undefined {
    return this.layers.get(layerName)?.id;
  }

  /**
   * Check if two layers are configured to collide.
   */
  canCollide(layerA: string, layerB: string): boolean {
    const a = this.layers.get(layerA);
    const b = this.layers.get(layerB);
    if (!a || !b) return false;
    return a.collidesWith.includes(layerB) && b.collidesWith.includes(layerA);
  }

  /**
   * Export current matrix configuration.
   */
  getConfig(): CollisionConfig {
    return {
      layers: Array.from(this.layers.values()).map(l => ({
        name: l.name,
        id: l.id,
        collidesWith: [...l.collidesWith],
      })),
    };
  }
}
