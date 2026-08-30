import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MultiLayerNavMesh } from '../src/ai/MultiLayerNavMesh';

describe('MultiLayerNavMesh 3D Multi-Span Navigation', () => {
  it('stores multiple vertical elevation spans and queries them correctly', () => {
    const nav = new MultiLayerNavMesh({
      center: new THREE.Vector3(0, 0, 0),
      size: 20,
      cellSize: 1.0,
      agentRadius: 0.4,
      agentHeight: 1.8,
    });

    const cell = nav.cellAt(2.5, 2.5);
    expect(cell).not.toBeNull();
    const { ix, iz } = cell!;

    // Add 3 vertical floors: ground floor, bridge walkway, rooftop
    nav.addSpan(ix, iz, {
      floorY: 0.0,
      ceilingY: 3.5,
      walkable: true,
      normalY: 1.0,
    });

    nav.addSpan(ix, iz, {
      floorY: 4.0,
      ceilingY: 7.5,
      walkable: true,
      normalY: 1.0,
    });

    nav.addSpan(ix, iz, {
      floorY: 8.0,
      ceilingY: 100.0,
      walkable: true,
      normalY: 1.0,
    });

    const spans = nav.spansAt(2.5, 2.5);
    expect(spans.length).toBe(3);
    expect(spans[0].floorY).toBe(0.0);
    expect(spans[1].floorY).toBe(4.0);
    expect(spans[2].floorY).toBe(8.0);

    // Test nearest span resolution for an agent standing on the bridge (Y = 4.1)
    const bridgeSpan = nav.nearestWalkableSpan(2.5, 4.1, 2.5, 2.0);
    expect(bridgeSpan).not.toBeNull();
    expect(bridgeSpan?.floorY).toBe(4.0);

    // Test nearest span resolution for an agent standing on the ground (Y = 0.2)
    const groundSpan = nav.nearestWalkableSpan(2.5, 0.2, 2.5, 2.0);
    expect(groundSpan).not.toBeNull();
    expect(groundSpan?.floorY).toBe(0.0);

    // Default heightAt returns the top floor
    expect(nav.heightAt(2.5, 2.5)).toBe(8.0);
    expect(nav.isWalkableAt(2.5, 2.5)).toBe(true);
  });
});
