import * as THREE from 'three';
import { Engine } from '../engine/Engine';

/**
 * DojoScene.ts — Procedural anime / cell-shaded dojo that Ayo spawns inside on
 * the engine's default landing scene. Built from primitive boxes that all share a
 * 3-step `MeshToonMaterial` gradient map, producing the classic 2-3 tone
 * cel-shaded look out of the box without any custom shader.
 *
 * The dojo is ONE rigidbody entity wrapping a Three.js Group of sub-meshes, so:
 *   - the outliner shows a single "Dojo (Anime)" entry
 *   - the whole set can be selected / moved / scaled from the inspector
 *   - serialize / deserialize round-trips cleanly through the existing
 *     'dojo' blueprint kind (see builders.ts → registerCoreBuilders)
 */

export const DOJO_NAME = 'Dojo (Anime)';
/** Marker tag used to detect an already-spawned dojo (idempotent ensure). */
export const DOJO_TAG = 'dojo-scene';

// ─── Dojo dimensions (all in metres, centred on the world origin) ────────────
const SIZE = 14;            // floor footprint (square)
const HALF = SIZE / 2;      // 7
const WALL_T = 0.28;        // wall thickness
const WALL_H = 2.8;         // wall height (clear of Ayo's head)
const PILLAR_SIZE = 0.45;   // pillar cross-section
const PILLAR_H = WALL_H + 0.4;
const ROOF_OVERHANG = 1.4;  // roof overhang past the walls
const ROOF_H = 0.55;        // roof slab thickness
const TRIM_H = 0.16;        // wall-trim thickness

// ─── Anime / dojo palette ────────────────────────────────────────────────────
const C_FLOOR = 0xb88550;       // warm light wood
const C_FLOOR_DARK = 0x6b4a2a;  // darker planks
const C_PILLAR = 0x3a2210;      // dark wood posts
const C_WALL = 0xefe6d2;        // cream paper
const C_WALL_FRAME = 0x6e4a2a;  // wood frame
const C_ROOF = 0x261a14;        // dark slate
const C_ROOF_RIDGE = 0xa53a2a;  // red ridge
const C_TORII = 0xc8332a;       // torii red
const C_TORII_BLACK = 0x1a120c; // torii base
const C_LANTERN = 0xffd479;     // lantern glow
const C_LANTERN_FRAME = 0x2a1a14;
const C_STRING = 0x111111;
const C_BANNER = 0x2a1a14;

// ─── Cell-shading gradient ──────────────────────────────────────────────────
let _gradientMap: THREE.DataTexture | null = null;
function getGradientMap(): THREE.DataTexture {
  if (_gradientMap) return _gradientMap;
  // 3 hard steps → classic cel-shaded look (shadow / mid / light).
  const data = new Uint8Array([60, 150, 230, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradientMap = tex;
  return tex;
}

interface ToonOpts {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}
function toonMat(color: THREE.ColorRepresentation, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1.0,
  });
}

function makeBox(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  color: THREE.ColorRepresentation,
  name: string,
  opts: ToonOpts = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    toonMat(color, opts),
  );
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── Procedural parts ───────────────────────────────────────────────────────

/** Wooden plank floor + a darker stripe border so it reads as a training mat. */
function buildFloor(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Floor';

  // Main floor slab (slightly inset so the dark border frames it).
  const floor = makeBox(SIZE - 0.4, 0.32, SIZE - 0.4, 0, -0.16, 0, C_FLOOR, 'Floor Planks');
  root.add(floor);

  // A handful of cross-plank stripes (purely visual, give the wood texture).
  for (let i = 0; i < 5; i++) {
    const z = -HALF + 1.4 + i * ((SIZE - 2.8) / 4);
    root.add(makeBox(SIZE - 0.6, 0.005, 0.12, 0, 0.005, z, C_FLOOR_DARK, `Floor Plank Line ${i}`));
  }

  // Dark border frame (under the walls).
  root.add(makeBox(SIZE, 0.18, 0.55, 0, 0.05, -HALF + 0.275, C_FLOOR_DARK, 'Floor Border -Z'));
  root.add(makeBox(SIZE, 0.18, 0.55, 0, 0.05, +HALF - 0.275, C_FLOOR_DARK, 'Floor Border +Z'));
  root.add(makeBox(0.55, 0.18, SIZE, -HALF + 0.275, 0.05, 0, C_FLOOR_DARK, 'Floor Border -X'));
  root.add(makeBox(0.55, 0.18, SIZE, +HALF - 0.275, 0.05, 0, C_FLOOR_DARK, 'Floor Border +X'));
  return root;
}

/** The 4 paper-screen walls. The south wall (camera-facing) has a wide entrance. */
function buildWalls(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Walls';

  // North wall — full, with a kanji panel area in the centre (decorative).
  root.add(makeBox(SIZE, WALL_H, WALL_T, 0, WALL_H / 2, -HALF, C_WALL, 'Wall -Z'));

  // South wall — split around a 4 m entrance opening.
  const entranceW = 4.0;
  const sideW = (SIZE - entranceW) / 2;
  root.add(makeBox(sideW, WALL_H, WALL_T, -(SIZE / 2 - sideW / 2), WALL_H / 2, +HALF, C_WALL, 'Wall +Z Left'));
  root.add(makeBox(sideW, WALL_H, WALL_T, +(SIZE / 2 - sideW / 2), WALL_H / 2, +HALF, C_WALL, 'Wall +Z Right'));

  // East / West walls.
  root.add(makeBox(WALL_T, WALL_H, SIZE, +HALF, WALL_H / 2, 0, C_WALL, 'Wall +X'));
  root.add(makeBox(WALL_T, WALL_H, SIZE, -HALF, WALL_H / 2, 0, C_WALL, 'Wall -X'));

  // Dark wooden trim at the top and bottom of every wall (anime paper-screen look).
  const trimY = [WALL_H - TRIM_H / 2, TRIM_H / 2];
  for (const y of trimY) {
    // North
    root.add(makeBox(SIZE, TRIM_H, WALL_T * 1.45, 0, y, -HALF, C_WALL_FRAME, `Wall Trim -Z y=${y.toFixed(2)}`));
    // South (around the opening)
    root.add(makeBox(sideW, TRIM_H, WALL_T * 1.45, -(SIZE / 2 - sideW / 2), y, +HALF, C_WALL_FRAME, `Wall Trim +Z L y=${y.toFixed(2)}`));
    root.add(makeBox(sideW, TRIM_H, WALL_T * 1.45, +(SIZE / 2 - sideW / 2), y, +HALF, C_WALL_FRAME, `Wall Trim +Z R y=${y.toFixed(2)}`));
    // East
    root.add(makeBox(WALL_T * 1.45, TRIM_H, SIZE, +HALF, y, 0, C_WALL_FRAME, `Wall Trim +X y=${y.toFixed(2)}`));
    // West
    root.add(makeBox(WALL_T * 1.45, TRIM_H, SIZE, -HALF, y, 0, C_WALL_FRAME, `Wall Trim -X y=${y.toFixed(2)}`));
  }

  // Vertical wooden stiles on the long walls (every ~3 m) for that shoji look.
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue; // skip the centre to leave a clean panel
    const x = i * (SIZE / 5);
    root.add(makeBox(0.08, WALL_H - TRIM_H * 2.2, 0.04, x, WALL_H / 2, -HALF - 0.02, C_WALL_FRAME, `Wall Stile -Z ${i}`));
    root.add(makeBox(0.08, WALL_H - TRIM_H * 2.2, 0.04, x, WALL_H / 2, +HALF + 0.02, C_WALL_FRAME, `Wall Stile +Z ${i}`));
  }
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const z = i * (SIZE / 5);
    root.add(makeBox(0.04, WALL_H - TRIM_H * 2.2, 0.08, -HALF - 0.02, WALL_H / 2, z, C_WALL_FRAME, `Wall Stile -X ${i}`));
    root.add(makeBox(0.04, WALL_H - TRIM_H * 2.2, 0.08, +HALF + 0.02, WALL_H / 2, z, C_WALL_FRAME, `Wall Stile +X ${i}`));
  }

  return root;
}

/** Corner + mid-side load-bearing pillars. */
function buildPillars(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Pillars';
  const inset = HALF - PILLAR_SIZE / 2;

  // Corner pillars
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, -inset, PILLAR_H / 2, -inset, C_PILLAR, 'Pillar -X-Z'));
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, +inset, PILLAR_H / 2, -inset, C_PILLAR, 'Pillar +X-Z'));
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, -inset, PILLAR_H / 2, +inset, C_PILLAR, 'Pillar -X+Z'));
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, +inset, PILLAR_H / 2, +inset, C_PILLAR, 'Pillar +X+Z'));
  // Mid-side pillars
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, 0, PILLAR_H / 2, -inset, C_PILLAR, 'Pillar Mid -Z'));
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, 0, PILLAR_H / 2, +inset, C_PILLAR, 'Pillar Mid +Z'));
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, -inset, PILLAR_H / 2, 0, C_PILLAR, 'Pillar Mid -X'));
  root.add(makeBox(PILLAR_SIZE, PILLAR_H, PILLAR_SIZE, +inset, PILLAR_H / 2, 0, C_PILLAR, 'Pillar Mid +X'));

  // Stone pillar bases (lighter band at the bottom of each pillar)
  for (const [x, z] of [
    [-inset, -inset], [+inset, -inset], [-inset, +inset], [+inset, +inset],
    [0, -inset], [0, +inset], [-inset, 0], [+inset, 0],
  ]) {
    root.add(makeBox(PILLAR_SIZE + 0.18, 0.22, PILLAR_SIZE + 0.18, x, 0.11, z, 0x7a7a7a, `Pillar Base ${x.toFixed(1)},${z.toFixed(1)}`));
  }
  return root;
}

/** The roof: a dark slab with overhang + a red ridge cap on top. */
function buildRoof(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Roof';

  const beamH = 0.35;
  const beamY = PILLAR_H - beamH / 2 - 0.05;
  const beamExtent = HALF + ROOF_OVERHANG / 2;
  // Top beams (4 perimeter)
  root.add(makeBox(SIZE + ROOF_OVERHANG, beamH, beamH, 0, beamY, -beamExtent, C_PILLAR, 'Roof Beam -Z'));
  root.add(makeBox(SIZE + ROOF_OVERHANG, beamH, beamH, 0, beamY, +beamExtent, C_PILLAR, 'Roof Beam +Z'));
  root.add(makeBox(beamH, beamH, SIZE + ROOF_OVERHANG, -beamExtent, beamY, 0, C_PILLAR, 'Roof Beam -X'));
  root.add(makeBox(beamH, beamH, SIZE + ROOF_OVERHANG, +beamExtent, beamY, 0, C_PILLAR, 'Roof Beam +X'));

  // Crossbeams (interior, every ~3.5 m on each axis)
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const x = i * (SIZE / 5);
    root.add(makeBox(beamH, beamH, SIZE + ROOF_OVERHANG, x, beamY - beamH, 0, C_PILLAR, `Roof Crossbeam X ${i}`));
    const z = i * (SIZE / 5);
    root.add(makeBox(SIZE + ROOF_OVERHANG, beamH, beamH, 0, beamY - beamH, z, C_PILLAR, `Roof Crossbeam Z ${i}`));
  }

  // Main roof slab (with the eave overhang on all sides)
  const roofY = beamY + beamH / 2 + ROOF_H / 2;
  const roofW = SIZE + ROOF_OVERHANG * 2;
  const roofD = SIZE + ROOF_OVERHANG * 2;
  root.add(makeBox(roofW, ROOF_H, roofD, 0, roofY, 0, C_ROOF, 'Roof Slab'));

  // Red ridge cap running along the long axis (visual focal point)
  root.add(makeBox(roofW, 0.18, 0.45, 0, roofY + ROOF_H / 2 + 0.09, 0, C_ROOF_RIDGE, 'Roof Ridge Cap'));
  // Two decorative red end-caps on the ridge
  root.add(makeBox(0.45, 0.5, 0.5, -(roofW / 2) + 0.225, roofY + ROOF_H / 2 + 0.18, 0, C_ROOF_RIDGE, 'Roof Ridge Cap L'));
  root.add(makeBox(0.45, 0.5, 0.5, +(roofW / 2) - 0.225, roofY + ROOF_H / 2 + 0.18, 0, C_ROOF_RIDGE, 'Roof Ridge Cap R'));

  return root;
}

/** Red torii gate standing in the south entrance — the classic anime dojo marker. */
function buildTorii(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Torii Gate';

  const z = HALF + 0.8;          // just outside the south wall opening
  const totalH = 4.0;
  const postW = 0.35;
  const span = 3.6;
  const xOff = span / 2;

  // Black plinths
  root.add(makeBox(postW + 0.2, 0.22, postW + 0.2, -xOff, 0.11, z, C_TORII_BLACK, 'Torii Plinth L'));
  root.add(makeBox(postW + 0.2, 0.22, postW + 0.2, +xOff, 0.11, z, C_TORII_BLACK, 'Torii Plinth R'));

  // Two vertical pillars
  root.add(makeBox(postW, totalH, postW, -xOff, 0.22 + totalH / 2, z, C_TORII, 'Torii Post L'));
  root.add(makeBox(postW, totalH, postW, +xOff, 0.22 + totalH / 2, z, C_TORII, 'Torii Post R'));

  // Top kasagi (the overhanging roof beam)
  const kasagiH = 0.45;
  const kasagiY = 0.22 + totalH - kasagiH / 2;
  const kasagiOverhang = 0.7;
  root.add(makeBox(span + kasagiOverhang * 2, kasagiH, 0.55, 0, kasagiY, z, C_TORII, 'Torii Kasagi'));
  // Kasagi decorative top finial
  root.add(makeBox(span + kasagiOverhang * 2 - 0.2, 0.12, 0.7, 0, kasagiY + kasagiH / 2 + 0.06, z, C_TORII_BLACK, 'Torii Kasagi Top'));

  // Lower nuki (cross-beam)
  const nukiH = 0.32;
  const nukiY = kasagiY - 0.95;
  root.add(makeBox(span + 0.3, nukiH, 0.32, 0, nukiY, z, C_TORII, 'Torii Nuki'));
  // Central gakuzuka (the small vertical strut between nuki and kasagi)
  const gakuH = 0.55;
  root.add(makeBox(0.22, gakuH, 0.22, 0, nukiY + nukiH / 2 + gakuH / 2, z, C_TORII, 'Torii Gakuzuka'));
  // A small black plaque on the gakuzuka (the "name plate" of a real torii)
  root.add(makeBox(0.5, 0.28, 0.06, 0, nukiY + nukiH / 2 + gakuH + 0.14, z + 0.13, C_TORII_BLACK, 'Torii Plaque'));

  return root;
}

/** Three hanging paper lanterns strung across the back of the dojo. */
function buildLanterns(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Lanterns';

  const lanternMat = toonMat(C_LANTERN, { emissive: C_LANTERN, emissiveIntensity: 1.6 });
  const frameMat = toonMat(C_LANTERN_FRAME);
  const stringMat = toonMat(C_STRING);

  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 3.4;
    const g = new THREE.Group();
    g.name = `Lantern ${i}`;

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.75), lanternMat);
    body.castShadow = true; body.receiveShadow = true;
    body.name = 'Lantern Body';
    g.add(body);

    // Top + bottom caps
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.95), frameMat);
    cap.position.y = 0.5; cap.castShadow = true; cap.receiveShadow = true;
    g.add(cap);
    const capB = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.95), frameMat);
    capB.position.y = -0.5; capB.castShadow = true; capB.receiveShadow = true;
    g.add(capB);

    // Hanging string
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), stringMat);
    str.position.y = 0.95;
    g.add(str);

    // Tassel
    const tassel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), stringMat);
    tassel.position.y = -0.7;
    g.add(tassel);

    // Hang from just under the north-wall top trim.
    g.position.set(x, WALL_H - 0.4, -HALF + 0.55);
    root.add(g);
  }
  return root;
}

/** Two vertical banners on the back wall with a stylised 円 ("maru") symbol. */
function buildBackdrop(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Dojo Backdrop';

  // Two dark banners flanking the centre
  const bannerH = WALL_H - 0.4;
  for (const x of [-3.2, +3.2]) {
    const banner = makeBox(0.06, bannerH, 0.9, x, bannerH / 2 + 0.1, -HALF - 0.1, C_BANNER, `Banner x=${x}`);
    root.add(banner);
    // A simple 円 ("en") disc on each banner — a flat dark ring on a light circle
    // is a lot to build procedurally, so we use a slightly-raised light square
    // (a stylised mon) — still reads as a kanji in the anime silhouette.
    root.add(makeBox(0.5, 0.5, 0.02, x, bannerH / 2 + 0.4, -HALF - 0.18, 0xefe6d2, `Banner Mon x=${x}`));
    // Cross-stroke on the mon, gives the 円 silhouette in a 3-tone toon shading.
    root.add(makeBox(0.5, 0.08, 0.025, x, bannerH / 2 + 0.4, -HALF - 0.19, C_BANNER, `Banner Stroke H x=${x}`));
    root.add(makeBox(0.08, 0.5, 0.025, x, bannerH / 2 + 0.4, -HALF - 0.19, C_BANNER, `Banner Stroke V x=${x}`));
  }
  return root;
}

/**
 * Build the full dojo as a single Three.js Group of cell-shaded sub-meshes.
 * The group is intended to become the mesh of a single RigidBodyComponent
 * (see the 'dojo' builder in builders.ts).
 */
export function buildDojoGroup(): THREE.Group {
  const root = new THREE.Group();
  root.name = DOJO_NAME;
  // Marker for the idempotent ensure (also survives `Object3D.clone`).
  root.userData[DOJO_TAG] = true;
  root.userData['engine-name'] = DOJO_NAME;
  root.userData['dojo-version'] = 1;

  root.add(buildFloor());
  root.add(buildWalls());
  root.add(buildPillars());
  root.add(buildRoof());
  root.add(buildTorii());
  root.add(buildLanterns());
  root.add(buildBackdrop());

  return root;
}

// ─── Idempotency helpers ───────────────────────────────────────────────────

/**
 * True if a dojo group is already in the scene (works across fresh boots and
 * after deserialize, because the dojo builder always names its root `${DOJO_NAME}`).
 */
export function isDojoPresent(engine: Engine): boolean {
  for (const rb of engine.sceneManager.rigidBodyList) {
    if (rb.mesh?.name === DOJO_NAME) return true;
    if (rb.mesh?.userData?.[DOJO_TAG]) return true;
  }
  return false;
}

/**
 * Idempotently make sure the dojo exists in the scene. Returns true if it was
 * actually built this call, false if it was already there.
 *
 * Safe to call from AnimationPreviewPanel.activate() — repeated calls are no-ops
 * so the autosave → restore → activate cycle never ends up with two dojos.
 */
export function ensureDojo(engine: Engine): boolean {
  if (isDojoPresent(engine)) return false;
  engine.sceneManager.spawnNow(
    new THREE.Vector3(0, 0, 0),
    { kind: 'dojo', params: {} },
    { rootMotion: false },
  );
  return true;
}
