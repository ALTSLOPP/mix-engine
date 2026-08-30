import * as THREE from 'three';

export type WorldNodeType = 'town' | 'route' | 'dungeon' | 'boss_arena' | 'poi';

export interface WorldNode {
  id: string;
  name: string;
  type: WorldNodeType;
  position: THREE.Vector3;
  dangerLevel: number;
  biome: 'plains' | 'forest' | 'mountain' | 'coastal' | 'ruins';
  connectedNodeIds: string[];
}

export interface WorldEdge {
  fromNodeId: string;
  toNodeId: string;
  distance: number;
  encounterRate: number;
}

export interface WorldGraph {
  seed: number;
  nodes: WorldNode[];
  edges: WorldEdge[];
}

export class WorldGraphGenerator {
  static generate(seed = 12345, nodeCount = 8): WorldGraph {
    let currentSeed = seed;
    const rand = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };

    const biomes: Array<WorldNode['biome']> = ['plains', 'forest', 'mountain', 'coastal', 'ruins'];
    const nodes: WorldNode[] = [];

    // 1. Starter Town (Center)
    nodes.push({
      id: 'node_town_start',
      name: 'Oakhaven Town',
      type: 'town',
      position: new THREE.Vector3(0, 0, 0),
      dangerLevel: 1,
      biome: 'plains',
      connectedNodeIds: [],
    });

    // 2. Generate radiating nodes
    for (let i = 1; i < nodeCount; i++) {
      const angle = (i / (nodeCount - 1)) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const radius = 60 + rand() * 120;
      const pos = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);

      const isBoss = i === nodeCount - 1;
      const isTown = !isBoss && i % 3 === 0;
      const isDungeon = !isBoss && !isTown && i % 2 === 0;
      const type: WorldNodeType = isBoss ? 'boss_arena' : (isTown ? 'town' : (isDungeon ? 'dungeon' : 'route'));

      const danger = isBoss ? 10 : Math.min(9, Math.floor(1 + (radius / 180) * 8));
      const biome = biomes[Math.floor(rand() * biomes.length)];

      nodes.push({
        id: `node_${i}_${type}`,
        name: `${type.toUpperCase()} Zone ${i}`,
        type,
        position: pos,
        dangerLevel: danger,
        biome,
        connectedNodeIds: [],
      });
    }

    // 3. Connect nodes (Minimum Spanning Tree + local neighbor connections)
    const edges: WorldEdge[] = [];
    const connected = new Set<string>([nodes[0].id]);

    while (connected.size < nodes.length) {
      let bestDist = Infinity;
      let bestPair: [WorldNode, WorldNode] | null = null;

      for (const n1 of nodes) {
        if (!connected.has(n1.id)) continue;
        for (const n2 of nodes) {
          if (connected.has(n2.id)) continue;
          const d = n1.position.distanceTo(n2.position);
          if (d < bestDist) {
            bestDist = d;
            bestPair = [n1, n2];
          }
        }
      }

      if (bestPair) {
        const [a, b] = bestPair;
        connected.add(b.id);
        a.connectedNodeIds.push(b.id);
        b.connectedNodeIds.push(a.id);
        edges.push({
          fromNodeId: a.id,
          toNodeId: b.id,
          distance: bestDist,
          encounterRate: Math.min(0.8, 0.2 + (b.dangerLevel * 0.06)),
        });
      } else {
        break;
      }
    }

    return {
      seed,
      nodes,
      edges,
    };
  }
}
