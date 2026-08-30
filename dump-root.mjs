// Check the FBXLoader root group transform + target group transform for hidden
// axis/scale corrections my name-based parent walk might be dropping.
import fs from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

globalThis.self = globalThis;
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const ROOT = path.resolve('.');

function dumpTop(root, label) {
  console.log(`\n=== ${label} ===`);
  // root itself
  console.log('root:', root.name || '(unnamed)', 'q=', root.quaternion.toArray().map(n=>+n.toFixed(4)), 's=', root.scale.toArray().map(n=>+n.toFixed(4)), 'p=', root.position.toArray().map(n=>+n.toFixed(2)));
  for (const c of root.children) {
    console.log('  child:', c.name || '(unnamed)', 'q=', c.quaternion.toArray().map(n=>+n.toFixed(4)), 's=', c.scale.toArray().map(n=>+n.toFixed(4)), 'p=', c.position.toArray().map(n=>+n.toFixed(2)));
  }
}

const gltf = new GLTFLoader();
const ayo = await gltf.parseAsync(ab(fs.readFileSync(path.join(ROOT, 'public/assets/mixamo/characters/ayo.glb'))), '');
dumpTop(ayo.scene, 'ayo glTF');

const fbx = new FBXLoader().parse(ab(fs.readFileSync(path.join(ROOT, 'public/assets/packs/motifect_martial_arts/muay_thai_combination.fbx'))), '');
dumpTop(fbx, 'motifect FBX');

// Also: world quaternion of the source Hips node (the animated root).
fbx.updateMatrixWorld(true);
const hips = fbx.getObjectByName('Hips');
if (hips) {
  const wq = new (await import('three')).Quaternion();
  hips.getWorldQuaternion(wq);
  console.log('\nsource Hips world quaternion:', wq.toArray().map(n=>+n.toFixed(4)));
}
ayo.scene.updateMatrixWorld(true);
const tHips = ayo.scene.getObjectByName('mixamorigHips');
if (tHips) {
  const wq = new (await import('three')).Quaternion();
  tHips.getWorldQuaternion(wq);
  console.log('target mixamorigHips world quaternion:', wq.toArray().map(n=>+n.toFixed(4)));
}
