import * as THREE from 'three';
import { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { SceneManager, BuildContext } from '../ecs/SceneManager';
import { AnimationStateMachine } from '../animation/AnimationStateMachine';
import { BuildingExtruder } from '../tools/BuildingExtruder';
import { buildDojoGroup, DOJO_TAG } from '../scenes/DojoScene';
import { Heightmap } from '../terrain/Heightmap';
import { TerrainField } from '../terrain/TerrainField';
import { SplatMap } from '../terrain/SplatMap';
import { TerrainMaterial } from '../terrain/TerrainMaterial';
import { prepareInstanceMaterial, needsInstanceMaterial, type InstanceMaterialOptions } from '../assets/proceduralWeathering';
import { computeCompoundBoxes } from '../assets/compoundCollider';
import {
  SIZE_CLASSES, classifyAsset, normalizeModel, rebindSkinnedMeshes, describeNormalization,
  type SizeClass, type NormalizeResult,
} from '../assets/ScaleNormalizer';

function renameMixamoBones(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.name.startsWith('mixamorig')) {
      const canonical = obj.name.replace(/^mixamorig\d*:?/, '');
      obj.name = canonical;
    }
  });
}

/** Fallback when an asset id isn't in the manifest (ad-hoc spawns, tests). */
const CHARACTER_HEIGHT_M = SIZE_CLASSES.character.nominal;

/**
 * Resolve an asset's real-world size and scale the checked-out model into it.
 * Returns the governing dimension in metres — for a character, its standing height,
 * which the capsule collider and the feet offset are both derived from.
 */
function normalizeCheckout(
  model: THREE.Object3D,
  assetId: string,
  ctx: BuildContext,
  fallback: SizeClass | null,
  extraScale = 1,
): NormalizeResult | null {
  const entry = ctx.manifest?.get(assetId);
  const sizeClass = entry
    ? classifyAsset({ type: entry.type, tags: entry.tags, sizeClass: entry.sizeClass })
    : fallback;
  const result = normalizeModel(model, sizeClass, { targetSize: entry?.targetSize, extraScale });
  if (result && result.reason !== 'in-band') console.info(describeNormalization(assetId, result));
  return result;
}

function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
}

function bool(params: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

function resolveMaterial(ctx: BuildContext, params: Record<string, unknown>): THREE.Material {
  if (typeof params.materialId === 'string' && ctx.getMaterial) {
    const mat = ctx.getMaterial(params.materialId);
    if (mat) return mat;
  }
  
  const color = (params.color as THREE.ColorRepresentation) ?? 0x6fa8dc;
  const roughness = num(params, 'roughness', 0.7);
  const metalness = num(params, 'metalness', 0.05);
  const emissive = (params.emissive as THREE.ColorRepresentation) ?? 0x000000;
  const emissiveIntensity = num(params, 'emissiveIntensity', 1.0);
  
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function makeBodyDesc(ctx: BuildContext, dynamic: boolean, enginePos: THREE.Vector3, ccd = false) {
  const R = ctx.physicsWorld.RAPIER;
  const desc = dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed();
  if (ccd && dynamic) desc.setCcdEnabled(true);
  return desc.setTranslation(enginePos.x, enginePos.y, enginePos.z);
}

/** Register the procedural + asset-instance builders used by the demo, chunks and AI. */
export function registerCoreBuilders(sceneManager: SceneManager): void {
  // --- box: full extents = (hx,hy,hz) half-extents ---
  sceneManager.registerBuilder('box', (enginePos, params, ctx) => {
    const hx = num(params, 'hx', 0.5);
    const hy = num(params, 'hy', 0.5);
    const hz = num(params, 'hz', 0.5);
    const dynamic = bool(params, 'dynamic', true);
    const ccd = bool(params, 'ccd', false);
    const collisionLayer = params.collisionLayer as string | undefined;
    const color = (params.color as THREE.ColorRepresentation) ?? 0x6fa8dc;
    const roughness = num(params, 'roughness', 0.7);
    const metalness = num(params, 'metalness', 0.05);
    const emissive = (params.emissive as THREE.ColorRepresentation) ?? 0x000000;
    const isSensor = bool(params, 'sensor', false);

    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, dynamic, enginePos, ccd));
    const collider = ctx.physicsWorld.createBoxCollider(body, hx, hy, hz, true, isSensor, collisionLayer);

    const material = resolveMaterial(ctx, params);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      material,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(enginePos);

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
    // Rapier colliders are size-immutable; to support inspector scale edits we rebuild
    // the collider from the (scaled) half-extents on demand.
    rb.colliderRebuilder = () => {
      ctx.physicsWorld.removeCollider(collider);
      const s = mesh.scale;
      ctx.physicsWorld.createBoxCollider(
        body,
        Math.max(hx * s.x, 0.01),
        Math.max(hy * s.y, 0.01),
        Math.max(hz * s.z, 0.01),
        true,
        isSensor,
        collisionLayer,
      );
    };
    return rb;
  });

  // --- sphere ---
  sceneManager.registerBuilder('sphere', (enginePos, params, ctx) => {
    const r = num(params, 'radius', 0.5);
    const dynamic = bool(params, 'dynamic', true);
    const ccd = bool(params, 'ccd', false);
    const collisionLayer = params.collisionLayer as string | undefined;
    const isSensor = bool(params, 'sensor', false);

    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, dynamic, enginePos, ccd));
    const collider = ctx.physicsWorld.createSphereCollider(body, r, true, isSensor, collisionLayer);

    const material = resolveMaterial(ctx, params);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16),
      material,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(enginePos);

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
    rb.colliderRebuilder = () => {
      ctx.physicsWorld.removeCollider(collider);
      const s = mesh.scale;
      // Uniform-ish scale: use the max component as the dominant radius.
      const newR = Math.max(r * Math.max(s.x, s.y, s.z), 0.01);
      ctx.physicsWorld.createSphereCollider(body, newR, true, isSensor);
    };
    return rb;
  });

  // --- glbInstance: a resource-sharing clone with a bounding-box collider ---
  sceneManager.registerBuilder('glbInstance', (enginePos, params, ctx) => {
    const assetId = String(params.assetId);
    const group = ctx.assetCache.checkout(assetId);
    const dynamic = bool(params, 'dynamic', true);
    const scale = num(params, 'scale', 1);

    group.position.copy(enginePos);
    // Normalise into the asset's size band, then apply the author's scale on top, so
    // params.scale stays a relative multiplier rather than an absolute unit fudge.
    if (!normalizeCheckout(group, assetId, ctx, null, scale) && scale !== 1) {
      group.scale.setScalar(scale);
    }

    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, dynamic, enginePos));
    let collider = ctx.physicsWorld.createBoxCollider(
      body,
      Math.max(size.x / 2, 0.05),
      Math.max(size.y / 2, 0.05),
      Math.max(size.z / 2, 0.05),
      true,
    );

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, group, { source: 'asset', assetId }, ctx.assetCache);
    rb.colliderRebuilder = () => {
      ctx.physicsWorld.removeCollider(collider);
      const currentSize = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      collider = ctx.physicsWorld.createBoxCollider(
        body,
        Math.max(currentSize.x / 2, 0.05),
        Math.max(currentSize.y / 2, 0.05),
        Math.max(currentSize.z / 2, 0.05),
        true,
      );
    };

    // Tag {source:'asset'} so dispose() releases the refcount instead of freeing shared GPU memory.
    return rb;
  });

  // --- semanticInstance: glbInstance + per-instance material dressing + compound collider ---
  // The spawn target of the SemanticAssetRegistry. Clones the shared canonical's materials
  // PER INSTANCE before tinting/weathering (so a 'rusty red car' doesn't rust every other
  // car sharing that material), then fits a COMPOUND box collider to the model's meshes
  // instead of one loose bounding box. Params: assetId, dynamic?, scale?, compound?,
  // tint?, metalness?, roughness?, rust?, dirt?.
  sceneManager.registerBuilder('semanticInstance', (enginePos, params, ctx) => {
    const assetId = String(params.assetId);
    const group = ctx.assetCache.checkout(assetId);
    const dynamic = bool(params, 'dynamic', true);
    const scale = num(params, 'scale', 1);
    const compound = bool(params, 'compound', true);

    group.position.copy(enginePos);
    if (!normalizeCheckout(group, assetId, ctx, null, scale) && scale !== 1) group.scale.setScalar(scale);

    // Per-instance material overrides (tint / metalness / roughness / procedural rust+dirt).
    const matOpts: InstanceMaterialOptions = {
      tint: typeof params.tint === 'number' ? params.tint : undefined,
      metalness: typeof params.metalness === 'number' ? params.metalness : undefined,
      roughness: typeof params.roughness === 'number' ? params.roughness : undefined,
      rust: typeof params.rust === 'number' ? params.rust : undefined,
      dirt: typeof params.dirt === 'number' ? params.dirt : undefined,
    };
    const ownedMaterials: THREE.Material[] = [];
    if (needsInstanceMaterial(matOpts)) {
      // Clone each unique shared material ONCE, then swap the clone onto every mesh using it.
      const cloneCache = new Map<THREE.Material, THREE.Material>();
      const swap = (orig: THREE.Material): THREE.Material => {
        let c = cloneCache.get(orig);
        if (!c) {
          const prepared = prepareInstanceMaterial(orig, matOpts);
          c = prepared ?? orig; // non-PBR material → leave the shared one untouched
          cloneCache.set(orig, c);
          if (prepared) ownedMaterials.push(prepared);
        }
        return c;
      };
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(swap);
        else mesh.material = swap(mesh.material);
      });
    }

    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, dynamic, enginePos));
    let colliders: ReturnType<typeof ctx.physicsWorld.createBoxCollider>[] = [];
    const buildColliders = (): void => {
      colliders = [];
      if (compound) {
        for (const b of computeCompoundBoxes(group)) {
          colliders.push(ctx.physicsWorld.createBoxColliderAt(body, b.half.x, b.half.y, b.half.z, b.center, true));
        }
      } else {
        const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
        colliders.push(ctx.physicsWorld.createBoxCollider(
          body, Math.max(size.x / 2, 0.05), Math.max(size.y / 2, 0.05), Math.max(size.z / 2, 0.05), true,
        ));
      }
    };
    buildColliders();

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, group, { source: 'asset', assetId }, ctx.assetCache);
    // Inspector scale edits rebuild the whole compound from the (re-scaled) meshes.
    rb.colliderRebuilder = () => {
      for (const c of colliders) ctx.physicsWorld.removeCollider(c);
      buildColliders();
    };
    rb.onDispose = () => { for (const m of ownedMaterials) m.dispose(); };
    return rb;
  });

  // --- mapModel: a large STATIC level/map GLB (fixed body, optional scale) ---
  // Like glbInstance but FIXED (a map never falls) and collider-optional. Defaults to no
  // collider: the preview character is kinematic and placed explicitly, so the map is a
  // visual backdrop. Pass params.collider = 'box' for a coarse bounding-box collider.
  sceneManager.registerBuilder('mapModel', (enginePos, params, ctx) => {
    const assetId = String(params.assetId);
    const scale = num(params, 'scale', 1);
    const group = ctx.assetCache.checkout(assetId);
    group.position.copy(enginePos);
    if (scale !== 1) group.scale.setScalar(scale);
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, false, enginePos)); // fixed
    if (String(params.collider ?? 'none') === 'box') {
      const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      ctx.physicsWorld.createBoxCollider(
        body,
        Math.max(size.x / 2, 0.05),
        Math.max(size.y / 2, 0.05),
        Math.max(size.z / 2, 0.05),
        false,
      );
    } else if (String(params.collider) === 'trimesh') {
      const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) {
          const geom = mesh.geometry.clone();
          geom.applyMatrix4(mesh.matrixWorld);
          geom.applyMatrix4(groupInverse);
          const pos = geom.attributes.position;
          const vertices = new Float32Array(pos.array);
          let indices: Uint32Array;
          if (geom.index) {
            indices = new Uint32Array(geom.index.array);
          } else {
            indices = new Uint32Array(pos.count);
            for (let i = 0; i < pos.count; i++) indices[i] = i;
          }
          // The vertices are now in the group's local space, so the collider will align perfectly
          // with the group positioned at enginePos on the rigid body.
          ctx.physicsWorld.createTrimeshCollider(body, vertices, indices, false);
        }
      });
    }

    // {source:'asset'} → dispose releases the cache refcount (shared GPU resources kept).
    return new RigidBodyComponent(ctx.physicsWorld, body, group, { source: 'asset', assetId }, ctx.assetCache);
  });

  // --- extrusion: SVGLoader procedural building extruder ---
  sceneManager.registerBuilder('extrusion', (enginePos, params, ctx) => {
    const svgText = String(params.svgText);
    const depth = num(params, 'depth', 10);
    const uvScale = num(params, 'uvScale', 1);
    const color = (params.color as THREE.ColorRepresentation) ?? 0xb0b4bb;
    const roughness = num(params, 'roughness', 0.7);
    const metalness = num(params, 'metalness', 0.05);
    const emissive = (params.emissive as THREE.ColorRepresentation) ?? 0x000000;
    const emissiveIntensity = num(params, 'emissiveIntensity', 1.0);

    const mesh = BuildingExtruder.fromSVG(svgText, { depth, uvScale, color });
    if (mesh.material && (mesh.material as any).isMeshStandardMaterial) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.roughness = roughness;
      mat.metalness = metalness;
      mat.emissive.set(emissive);
      mat.emissiveIntensity = emissiveIntensity;
    }
    mesh.position.copy(enginePos);

    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, false, enginePos)); // fixed by default
    const collider = ctx.physicsWorld.createBoxCollider(
      body,
      Math.max(size.x / 2, 0.05),
      Math.max(size.y / 2, 0.05),
      Math.max(size.z / 2, 0.05),
      true,
    );

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
    rb.colliderRebuilder = () => {
      ctx.physicsWorld.removeCollider(collider);
      const s = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
      ctx.physicsWorld.createBoxCollider(
        body,
        Math.max(s.x / 2, 0.05),
        Math.max(s.y / 2, 0.05),
        Math.max(s.z / 2, 0.05),
        true,
      );
    };
    return rb;
  });

  // --- character: Mixamo preset with capsule collider & animation state machine ---
  sceneManager.registerBuilder('character', (enginePos, params, ctx) => {
    const assetId = String(params.assetId ?? 'ayo');

    // 1. Create container and checked out model Group
    const container = new THREE.Group();
    container.position.copy(enginePos);

    const model = ctx.assetCache.checkout(assetId);
    renameMixamoBones(model);
    // Scale into the character size band. The Mixamo GLBs export at ~1/160 scale
    // (11mm tall) and would otherwise render as an invisible speck at the origin.
    const norm = normalizeCheckout(model, assetId, ctx, 'character');
    const height = norm && norm.resolved > 1e-6 ? norm.resolved : CHARACTER_HEIGHT_M;
    model.position.set(0, -height / 2, 0); // align feet to bottom of the capsule
    container.add(model);
    rebindSkinnedMeshes(model); // re-bind at the scaled rest pose or the skinned mesh collapses

    container.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    // 2. Physics Body: capsule sized from the character's ACTUAL height, so a 5'6"
    //    and a 6'2" character don't share one collider. The 0.164 ratio reproduces
    //    the previous hand-tuned (halfHeight 0.6, radius 0.3) capsule at 6 ft.
    const capsuleRadius = height * 0.164;
    const capsuleHalf = Math.max(height / 2 - capsuleRadius, 0.05);
    const R = ctx.physicsWorld.RAPIER;
    const bodyDesc = R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(enginePos.x, enginePos.y, enginePos.z)
      .setAdditionalMass(80);

    const body = ctx.physicsWorld.createRigidBody(bodyDesc);
    ctx.physicsWorld.createCapsuleCollider(body, capsuleHalf, capsuleRadius, true);

    const rbComponent = new RigidBodyComponent(
      ctx.physicsWorld,
      body,
      container,
      { source: 'asset', assetId },
      ctx.assetCache,
    );
    // Mirror the descriptor's additional mass onto the component so the inspector /
    // serializer can read + restore it exactly (body.mass() returns the combined total).
    rbComponent.additionalMass = 80;

    // 3. Animation State Machine
    const asm = new AnimationStateMachine(rbComponent, model);

    // Pack-driven persistence (optional): if params.animPacks is set, the IDE wiring
    // intends this character to start with those packs. Hydration is deferred to the
    // AnimationSystem layer (engine.anim) so we only keep lightweight bookkeeping here.
    const animPacks: string[] = Array.isArray(params.animPacks) ? params.animPacks as string[] : [];
    const combatMap: Record<string, string> = (params.combatMap as Record<string, string>) ?? {};
    void animPacks;

    const ANIM_MAPPING: Record<string, string> = {
      idle: 'anim_Locomotion_idle',
      walk: 'anim_Locomotion_Walking',
      run: 'anim_Locomotion_running',
      jump: 'anim_Locomotion_jump',
      backflip: 'anim_Locomotion_Backflip',
      punch: 'anim_Attack_Melee_Hook_Punch',
      kick: 'anim_Attack_Melee_Mma_Kick',
      die: 'anim_DYING_Dying',
      charge: 'anim_Specials_Two_Hand_Spell_Casting',
    };

    for (const [stateName, animAssetId] of Object.entries(ANIM_MAPPING)) {
      const clips = ctx.assetCache.getAnimations(animAssetId);
      if (clips.length > 0) {
        asm.addAnimation(stateName, clips[0]);
      } else {
        console.warn(`[character builder] No animation clip found for state ${stateName} (${animAssetId})`);
      }
    }

    // Apply combat trigger bindings from the pack metadata (or explicit combatMap override)
    for (const [trig, state] of Object.entries(combatMap)) asm.bindTrigger(trig, state);
    // Also auto-bind the classic locomotion/combat triggers to their base states so PlayerController/combat
    // works even when no pack is present.
    if (!combatMap['lightAttack']) asm.bindTrigger('lightAttack', 'punch');
    if (!combatMap['heavyAttack']) asm.bindTrigger('heavyAttack', 'kick');
    if (!combatMap['die']) asm.bindTrigger('die', 'die');
    if (!combatMap['idle']) asm.bindTrigger('idle', 'idle');

    // (No eager hydration here — engine.anim / IDE panels wire packs via
    //  assignToCharacter / wireCombat after spawn, which also persists animPacks into
    //  the blueprint. Keeping hydration out of the builder avoids a circular dep on the
    //  Engine singleton during construction.)

    // Set initial animation
    asm.transition('idle', 0);

    // Register machine to the engine loop
    ctx.addAnimationStateMachine?.(asm);

    // Setup custom cleanup logic
    rbComponent.onDispose = () => {
      ctx.removeAnimationStateMachine?.(asm);
      asm.dispose();
    };

    return rbComponent;
  });

  // --- light: Point / Spot / Area light with a visual helper ---
  // lightType 'point' | 'spot' | 'area'. Spotlights accept a `cookie` texture URL
  // (a projected gobo — window blinds, foliage, logos). Area lights are soft
  // rectangular emitters (studio panels, glowing signs) sized by width/height.
  sceneManager.registerBuilder('light', (enginePos, params, ctx) => {
    const lightType = String(params.lightType ?? 'point');
    const color = (params.color as THREE.ColorRepresentation) ?? 0xffd479;
    const intensity = num(params, 'intensity', 15);
    const distance = num(params, 'distance', 25);
    const decay = num(params, 'decay', 1.8);
    const angle = num(params, 'angle', Math.PI / 3);

    const group = new THREE.Group();
    group.position.copy(enginePos);

    // Disposables collected so onDispose can free everything we own.
    const disposables: Array<{ dispose: () => void }> = [];

    // Create the actual light source + a matching editor helper.
    let light: THREE.Light;
    if (lightType === 'area') {
      // Soft rectangular emitter — no shadows (three RectAreaLight can't cast), but
      // physically-soft fill. Faces straight down by default (ceiling panel).
      const width = num(params, 'width', 2);
      const height = num(params, 'height', 1);
      const area = new THREE.RectAreaLight(color, intensity, width, height);
      area.rotation.x = -Math.PI / 2; // local -Z (emit dir) → world -Y (down)
      group.add(area);

      // Flat glowing panel helper so the source is visible/selectable in-editor.
      const panelGeom = new THREE.PlaneGeometry(width, height);
      const panelMat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 1.5,
        side: THREE.DoubleSide, roughness: 0.4, metalness: 0,
      });
      const panel = new THREE.Mesh(panelGeom, panelMat);
      panel.name = 'AreaPanelHelper';
      panel.rotation.x = -Math.PI / 2;
      group.add(panel);
      disposables.push(panelGeom, panelMat);
      light = area;
    } else {
      // Bulb helper: small glowing sphere (point/spot).
      const bulbGeom = new THREE.SphereGeometry(0.12, 12, 8);
      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0xffd479, emissive: 0xffd479, emissiveIntensity: 2.0,
        roughness: 0.1, metalness: 0.9,
      });
      const bulb = new THREE.Mesh(bulbGeom, bulbMat);
      bulb.name = 'BulbHelper';
      group.add(bulb);
      disposables.push(bulbGeom, bulbMat);

      if (lightType === 'spot') {
        const penumbra = num(params, 'penumbra', 0.5);
        const spot = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0002;
        group.add(spot);

        const target = new THREE.Object3D();
        target.position.set(0, -1, 0); // point down
        group.add(target);
        spot.target = target;

        // Optional projected cookie / gobo texture (window blinds, foliage, logo).
        const cookie = typeof params.cookie === 'string' ? params.cookie : undefined;
        if (cookie) {
          new THREE.TextureLoader().load(cookie, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            spot.map = tex;
            disposables.push(tex);
          });
        }
        light = spot;
      } else {
        const point = new THREE.PointLight(color, intensity, distance, decay);
        point.castShadow = true;
        point.shadow.mapSize.set(1024, 1024);
        point.shadow.bias = -0.0002;
        group.add(point);
        light = point;
      }
    }

    const R = ctx.physicsWorld.RAPIER;
    const bodyDesc = R.RigidBodyDesc.fixed()
      .setTranslation(enginePos.x, enginePos.y, enginePos.z);
    const body = ctx.physicsWorld.createRigidBody(bodyDesc);
    ctx.physicsWorld.createBoxCollider(body, 0.15, 0.15, 0.15, true, true);

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, group, { source: 'owned' });
    rb.onDispose = () => {
      light.dispose();
      for (const d of disposables) d.dispose();
    };

    return rb;
  });

  // --- dojo: procedural anime / cell-shaded dojo (single Group rigidbody) ---
  // The dojo is many sub-meshes inside one Three.js Group so the outliner shows
  // a single "Dojo (Anime)" entity that the user can select / move / scale as a
  // whole. The collider is a single box fitted to the dojo's overall bounding
  // box — fine because Ayo is kinematic and never interacts with it physically.
  sceneManager.registerBuilder('dojo', (enginePos, params, ctx) => {
    const group = buildDojoGroup();
    group.position.copy(enginePos);
    // Re-stamp the marker after the copy so it's present on the actual mesh.
    group.userData[DOJO_TAG] = true;

    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, false, enginePos));
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    const collider = ctx.physicsWorld.createBoxCollider(
      body,
      Math.max(size.x / 2, 0.05),
      Math.max(size.y / 2, 0.05),
      Math.max(size.z / 2, 0.05),
      true,
    );

    const rb = new RigidBodyComponent(ctx.physicsWorld, body, group, { source: 'owned' });
    rb.colliderRebuilder = () => {
      ctx.physicsWorld.removeCollider(collider);
      const s = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      ctx.physicsWorld.createBoxCollider(
        body,
        Math.max(s.x / 2, 0.05),
        Math.max(s.y / 2, 0.05),
        Math.max(s.z / 2, 0.05),
        true,
      );
    };
    // Own every sub-mesh's GPU resources; release them on dispose so reloads
    // don't leak material/texture slots.
    rb.onDispose = () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
    };
    return rb;
  });

  // --- terrain: heightmap-based sculptable mesh ---
  sceneManager.registerBuilder('terrain', (enginePos, params, ctx) => {
    const res  = num(params, 'resolution', 257);
    const size = num(params, 'size', 256);
    const splatRes = num(params, 'splatResolution', res - 1);
    const hm = new Heightmap(res, size);                 // flat; heights re-applied later if loading
    const splatMap = new SplatMap(splatRes);
    const material = new TerrainMaterial({ splatMap });
    material.side = THREE.DoubleSide;                     // chunk skirts hide LOD seams robustly
    // The terrain root is a GROUP; TerrainChunkGrid adds the chunked-LOD render meshes as children.
    const root = new THREE.Group();
    root.position.copy(enginePos);

    const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, false, enginePos)); // FIXED
    const rb = new RigidBodyComponent(ctx.physicsWorld, body, root, { source: 'owned' });
    // The TerrainField is the source of truth; attach it so TerrainSystem + deserialize can find it
    // even when the entity was spawned directly via SceneManager.spawnNow (e.g. on scene load).
    // It builds the chunked render meshes + its own (flat) HEIGHTFIELD collider — the same code
    // path every later rebuild uses, so the collider kind is consistent from spawn onward.
    const field = new TerrainField(ctx.physicsWorld, rb, hm, splatMap, material, null, {
      lodDistances: params.lodDistances as number[] | undefined,
      maxChunkCells: params.chunkCells as number | undefined,
    });
    field.rebuildCollider();
    root.userData.terrain = field;
    rb.onDispose = () => field.dispose();
    return rb;
  });
}
