import * as THREE from 'three';
import { EventBus } from '../../src/ecs/EventBus';
export function createMockEngine() {
  const events = new EventBus();
  const entities = new Map<number, any>();
  const entityTags = new Map<number, Set<string>>();
  const healths = new Map<number, { hp: number; maxHp: number; faction?: string }>();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0); // camera looks towards -Z

  let possessedPlayerId: number | null = 1;
  let globalTimeScale = 1.0;

  // Add dummy player entity facing +Z
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  playerMesh.position.set(0, 0, 0);
  playerMesh.quaternion.set(0, 0, 0, 1);
  entities.set(1, {
    mesh: playerMesh,
    setNextKinematicTranslation: (p: any) => playerMesh.position.copy(p),
    setNextKinematicRotation: (q: any) => playerMesh.quaternion.copy(q),
  });
  entityTags.set(1, new Set(['player']));
  healths.set(1, { hp: 100, maxHp: 100, faction: 'player' });

  return {
    sceneManager: {
      events,
      allEntityIds: () => Array.from(entities.keys()),
      getRigidBody: (id: number) => entities.get(id),
      hasTag: (id: number, tag: string) => entityTags.get(id)?.has(tag) ?? false,
      addTag: (id: number, tag: string) => {
        if (!entityTags.has(id)) entityTags.set(id, new Set());
        entityTags.get(id)!.add(tag);
      },
      spawnNow: (pos: THREE.Vector3, bp: any) => {
        const id = entities.size + 1;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        mesh.position.copy(pos);
        entities.set(id, {
          mesh,
          setNextKinematicTranslation: (p: any) => mesh.position.copy(p),
          setNextKinematicRotation: (q: any) => mesh.quaternion.copy(q),
        });
        return id;
      },
      requestDestroy: (id: number) => {
        entities.delete(id);
      },
      addScript: () => {},
    },
    player: {
      getPossessedId: () => possessedPlayerId,
    },
    combat: {
      getHealth: (id: number) => healths.get(id),
      addHealth: (id: number, hp: number, faction = 'enemy') => {
        healths.set(id, { hp, maxHp: hp, faction });
      },
      applyDamage: (attacker: number | null, target: number, amount: number) => {
        const h = healths.get(target);
        if (h) {
          h.hp -= amount;
          if (h.hp <= 0) entities.delete(target);
        }
      },
    },
    multiTargetCamera: {
      setTargets: () => {},
      reset: () => {},
    },
    viewport: {
      camera,
      renderer: {
        domElement: { width: 1920, height: 1080 },
      },
    },
    physicsWorld: {
      raycast: (origin: THREE.Vector3, dir: THREE.Vector3) => {
        if (dir.y < -0.9) {
          return { point: new THREE.Vector3(origin.x, 0.8, origin.z), normal: new THREE.Vector3(0, 1, 0) };
        }
        return { point: origin.clone().addScaledVector(dir, 15.0), normal: new THREE.Vector3(0, 0, -1) };
      },
    },
    audio: {
      play: () => {},
    },
    effects: {
      hit: () => {},
      flash: () => {},
      shake: () => {},
    },
    burstVfx: () => {},
    spawnVfx: () => {},
    timeDilation: {
      getGlobalTimeScale: () => globalTimeScale,
      setGlobalTimeScale: (s: number) => { globalTimeScale = s; },
      setEntityTimeScale: () => {},
    },
    debugDraw: {
      drawSphere: () => {},
      drawLine: () => {},
    },
    findAnimationStateMachine: () => createMockAsm(),
    _entities: entities,
    _tags: entityTags,
    _healths: healths,
  } as any;
}

// Mock AnimationStateMachine
export function createMockAsm() {
  let current = 'idle';
  return {
    get currentState() { return current; },
    transition: (state: string) => { current = state; },
  } as any;
}

