import * as THREE from 'three';

export interface HlodClusterItem {
  position: THREE.Vector3;
  scale?: THREE.Vector3;
}

export interface HlodConfig {
  nearDistance?: number;  // Distance at which full mesh switches to HLOD impostor (e.g. 150m)
  farDistance?: number;   // Distance at which impostor is culled (e.g. 1500m)
  impostorSize?: THREE.Vector2; // Default billboard width & height in metres
  type?: 'cross_quad' | 'single_quad';
  /** Baked atlas from {@link HlodImpostorGenerator.renderImpostorAtlas}. Without one the
   *  cluster is untextured geometry — a batcher, not an impostor. */
  atlas?: ImpostorAtlas;
}

/** A baked multi-view impostor atlas: N camera angles laid out in a square tile grid. */
export interface ImpostorAtlas {
  texture: THREE.Texture;
  /** Number of baked views. */
  views: number;
  /** Tiles per row/column in the atlas (`Math.ceil(Math.sqrt(views))`). */
  tilesPerRow: number;
  /** Pixel size of one tile. */
  tileSize: number;
  /** Height of the source object the views were baked from, in metres. */
  sourceHeight: number;
  /** Width of the source object the views were baked from, in metres. */
  sourceWidth: number;
  dispose(): void;
}

export interface ImpostorBakeOptions {
  /** Horizontal camera angles to bake. 8 is the vegetation default; 16 for hero props. */
  views?: number;
  /** Pixel size of each atlas tile. */
  tileSize?: number;
  /** Camera pitch in degrees (negative looks down at the object). */
  pitchDeg?: number;
  /** Extra padding around the object's bounds, as a fraction. */
  padding?: number;
}

export interface HlodClusterResult {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  boundingRadius: number;
  nearDistance: number;
  farDistance: number;
}

/**
 * HlodImpostorGenerator.ts — Generates clustered billboard impostor meshes for distant open-world props and foliage.
 * Drastically cuts draw calls and vertex overhead at large view distances.
 */
export class HlodImpostorGenerator {
  /**
   * Bake an object into a multi-view impostor atlas by actually rendering it.
   *
   * This is the step that was missing: `generateCluster` produced billboards with a
   * plain MeshStandardMaterial and no map, so distant props rendered as untextured
   * grey cards. Here we orbit an orthographic camera around the prototype, render each
   * view into one tile of a render target, and hand back a texture the cluster's UVs
   * index into.
   *
   * Renders with a transparent clear so `alphaTest` cuts the silhouette cleanly.
   */
  static renderImpostorAtlas(
    renderer: THREE.WebGLRenderer,
    source: THREE.Object3D,
    options: ImpostorBakeOptions = {},
  ): ImpostorAtlas {
    const views = Math.max(1, Math.floor(options.views ?? 8));
    const tileSize = Math.max(16, Math.floor(options.tileSize ?? 256));
    const pitch = THREE.MathUtils.degToRad(options.pitchDeg ?? -10);
    const padding = options.padding ?? 1.05;
    const tilesPerRow = Math.ceil(Math.sqrt(views));

    // Bake in an isolated scene so the live scene's fog/overrides can't bleed in.
    const bakeScene = new THREE.Scene();
    const proxy = source.clone(true);
    proxy.position.set(0, 0, 0);
    proxy.rotation.set(0, 0, 0);
    proxy.updateMatrixWorld(true);
    bakeScene.add(proxy);
    // Flat, angle-independent lighting: a baked billboard must not carry a hard
    // shadow terminator that stays put while the real sun moves.
    bakeScene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(1, 2, 1);
    bakeScene.add(fill);

    const box = new THREE.Box3().setFromObject(proxy);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sourceHeight = Math.max(1e-3, size.y);
    const sourceWidth = Math.max(1e-3, Math.max(size.x, size.z));
    const halfH = (sourceHeight * padding) / 2;
    const halfW = (sourceWidth * padding) / 2;
    const radius = Math.max(halfW, halfH) * 4 + 1;

    const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, radius * 4);

    const target = new THREE.WebGLRenderTarget(tileSize * tilesPerRow, tileSize * tilesPerRow, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;

    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevClearAlpha = renderer.getClearAlpha();
    const prevScissorTest = renderer.getScissorTest();

    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);

    for (let i = 0; i < views; i++) {
      const azimuth = (i / views) * Math.PI * 2;
      camera.position.set(
        center.x + Math.sin(azimuth) * Math.cos(pitch) * radius,
        center.y + Math.sin(pitch) * radius * -1,
        center.z + Math.cos(azimuth) * Math.cos(pitch) * radius,
      );
      camera.lookAt(center);
      camera.updateProjectionMatrix();

      const col = i % tilesPerRow;
      const row = Math.floor(i / tilesPerRow);
      const x = col * tileSize;
      // Render targets are bottom-up; row 0 must land at the TOP of the atlas so the
      // UV mapping below (which counts rows downward) addresses the right tile.
      const y = (tilesPerRow - 1 - row) * tileSize;
      renderer.setViewport(x, y, tileSize, tileSize);
      renderer.setScissor(x, y, tileSize, tileSize);
      renderer.render(bakeScene, camera);
    }

    renderer.setScissorTest(prevScissorTest);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevClearAlpha);
    const drawSize = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, drawSize.x, drawSize.y);
    renderer.setScissor(0, 0, drawSize.x, drawSize.y);

    bakeScene.clear();

    return {
      texture: target.texture,
      views,
      tilesPerRow,
      tileSize,
      sourceHeight,
      sourceWidth,
      dispose: () => target.dispose(),
    };
  }

  /** UV rect `[u0, v0, u1, v1]` of one atlas tile. */
  static tileUv(atlas: ImpostorAtlas, viewIndex: number): [number, number, number, number] {
    const i = ((viewIndex % atlas.views) + atlas.views) % atlas.views;
    const col = i % atlas.tilesPerRow;
    const row = Math.floor(i / atlas.tilesPerRow);
    const step = 1 / atlas.tilesPerRow;
    const u0 = col * step;
    // Row 0 is the top of the atlas (see the bake loop), and three.js UV v runs upward.
    const v1 = 1 - row * step;
    return [u0, v1 - step, u0 + step, v1];
  }

  /**
   * Generates a two-plane cross-quad geometry centered at origin (perpendicular XZ planes).
   */
  static createCrossQuadGeometry(width = 2.0, height = 3.0): THREE.BufferGeometry {
    const hw = width / 2;

    // 8 vertices for 2 perpendicular quads (Quad 1 on XY, Quad 2 on ZY)
    const positions = new Float32Array([
      // Quad 1: along X-axis
      -hw, 0, 0,
       hw, 0, 0,
       hw, height, 0,
      -hw, height, 0,

      // Quad 2: along Z-axis
      0, 0, -hw,
      0, 0,  hw,
      0, height,  hw,
      0, height, -hw,
    ]);

    const uvs = new Float32Array([
      // Quad 1 UVs
      0, 0,
      1, 0,
      1, 1,
      0, 1,

      // Quad 2 UVs
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);

    const normals = new Float32Array([
      // Quad 1 normals (Z forward)
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      // Quad 2 normals (X right)
      1, 0, 0,
      1, 0, 0,
      1, 0, 0,
      1, 0, 0,
    ]);

    const indices = new Uint16Array([
      // Quad 1 (double sided)
      0, 1, 2, 0, 2, 3,
      2, 1, 0, 3, 2, 0,

      // Quad 2 (double sided)
      4, 5, 6, 4, 6, 7,
      6, 5, 4, 7, 6, 4,
    ]);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    return geom;
  }

  /**
   * Batch multiple clustered prop instances into a single consolidated impostor mesh geometry.
   */
  static generateCluster(
    items: HlodClusterItem[],
    config: HlodConfig = {},
  ): HlodClusterResult {
    if (items.length === 0) {
      throw new Error('Cannot create HLOD cluster from empty item list');
    }

    const atlas = config.atlas;
    // When an atlas is supplied, default the card size to the silhouette that was
    // actually baked — a 2×3 default under a 12m tree renders a shrunken sprite.
    const width = config.impostorSize?.x ?? atlas?.sourceWidth ?? 2.0;
    const height = config.impostorSize?.y ?? atlas?.sourceHeight ?? 3.0;
    // Cross-quad: one plane shows the front view, the perpendicular plane a view a
    // quarter turn round, so the pair reads as volume instead of a mirrored cutout.
    const uvFront: [number, number, number, number] = atlas
      ? HlodImpostorGenerator.tileUv(atlas, 0)
      : [0, 0, 1, 1];
    const uvSide: [number, number, number, number] = atlas
      ? HlodImpostorGenerator.tileUv(atlas, Math.round(atlas.views / 4))
      : [0, 0, 1, 1];
    const nearDistance = config.nearDistance ?? 150.0;
    const farDistance = config.farDistance ?? 1200.0;

    const baseGeom = this.createCrossQuadGeometry(width, height);
    const basePos = baseGeom.getAttribute('position') as THREE.BufferAttribute;
    const baseUv = baseGeom.getAttribute('uv') as THREE.BufferAttribute;
    const baseNormal = baseGeom.getAttribute('normal') as THREE.BufferAttribute;
    const baseIdx = baseGeom.getIndex()!;

    const vertsPerInstance = basePos.count;
    const indicesPerInstance = baseIdx.count;
    const numItems = items.length;

    const combinedPos = new Float32Array(vertsPerInstance * numItems * 3);
    const combinedUv = new Float32Array(vertsPerInstance * numItems * 2);
    const combinedNormal = new Float32Array(vertsPerInstance * numItems * 3);
    const combinedIdx = new Uint32Array(indicesPerInstance * numItems);

    const center = new THREE.Vector3(0, 0, 0);
    for (const item of items) {
      center.add(item.position);
    }
    center.divideScalar(numItems);

    let maxRadiusSq = 0;

    for (let i = 0; i < numItems; i++) {
      const item = items[i];
      const scaleX = item.scale?.x ?? 1.0;
      const scaleY = item.scale?.y ?? 1.0;
      const scaleZ = item.scale?.z ?? 1.0;

      const vOffset = i * vertsPerInstance;
      const iOffset = i * indicesPerInstance;

      // Copy and transform vertex positions
      for (let v = 0; v < vertsPerInstance; v++) {
        const vx = basePos.getX(v) * scaleX + item.position.x;
        const vy = basePos.getY(v) * scaleY + item.position.y;
        const vz = basePos.getZ(v) * scaleZ + item.position.z;

        const pIdx = (vOffset + v) * 3;
        combinedPos[pIdx] = vx;
        combinedPos[pIdx + 1] = vy;
        combinedPos[pIdx + 2] = vz;

        const uIdx = (vOffset + v) * 2;
        // Verts 0..3 are the X-aligned quad, 4..7 the Z-aligned one.
        const rect = v < 4 ? uvFront : uvSide;
        combinedUv[uIdx] = rect[0] + baseUv.getX(v) * (rect[2] - rect[0]);
        combinedUv[uIdx + 1] = rect[1] + baseUv.getY(v) * (rect[3] - rect[1]);

        combinedNormal[pIdx] = baseNormal.getX(v);
        combinedNormal[pIdx + 1] = baseNormal.getY(v);
        combinedNormal[pIdx + 2] = baseNormal.getZ(v);

        const distSq = (vx - center.x) ** 2 + (vy - center.y) ** 2 + (vz - center.z) ** 2;
        if (distSq > maxRadiusSq) {
          maxRadiusSq = distSq;
        }
      }

      // Copy indices with vertex offset
      for (let idx = 0; idx < indicesPerInstance; idx++) {
        combinedIdx[iOffset + idx] = baseIdx.getX(idx) + vOffset;
      }
    }

    const clusterGeom = new THREE.BufferGeometry();
    clusterGeom.setAttribute('position', new THREE.BufferAttribute(combinedPos, 3));
    clusterGeom.setAttribute('uv', new THREE.BufferAttribute(combinedUv, 2));
    clusterGeom.setAttribute('normal', new THREE.BufferAttribute(combinedNormal, 3));
    clusterGeom.setIndex(new THREE.BufferAttribute(combinedIdx, 1));
    // clone(): THREE.Sphere keeps the vector by reference, so sharing `center` with
    // the returned result meant a caller nudging result.center silently moved the
    // culling sphere with it.
    clusterGeom.boundingSphere = new THREE.Sphere(center.clone(), Math.sqrt(maxRadiusSq));

    const material = new THREE.MeshStandardMaterial({
      map: atlas?.texture ?? null,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
    });

    const mesh = new THREE.Mesh(clusterGeom, material);

    return {
      mesh,
      center,
      boundingRadius: Math.sqrt(maxRadiusSq),
      nearDistance,
      farDistance,
    };
  }
}
