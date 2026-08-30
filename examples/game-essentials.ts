/** Small starter scene using the real engine and all five general modules. */
import * as THREE from 'three';
import { Engine } from '../src/engine/Engine';

const engine = await Engine.create(document.querySelector<HTMLElement>('#viewport')!);
const features = engine.gameplayFeatures;
features.disableAllFeatures();
features.applyPreset('essentials');
features.pause.setConfig({ title: 'Crystal Garden', pauseOnFocusLoss: false });
features.settings.setConfig({ storageKey: 'mix-essentials-example', persist: true });
features.settings.initialize();
features.objectives.setConfig({ objectives: [{ id: 'crystals', title: 'Collect five crystals', target: 5 }] });
features.session.setConfig({ title: 'Crystal run', targetScore: 50 });
engine.input.setMode('play');
engine.viewport.camera.position.set(9, 7, 12);
engine.viewport.camera.lookAt(0, 1, 0);

const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x294d40, roughness: 0.85 }));
floor.receiveShadow = true;
engine.viewport.scene.add(floor);
const crystals: THREE.Mesh[] = [];
for (let i = 0; i < 5; i++) {
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.65), new THREE.MeshStandardMaterial({ color: 0xa9edcd, emissive: 0x337c65, emissiveIntensity: 0.6, metalness: 0.25, roughness: 0.2 }));
  crystal.position.set(Math.cos(i / 5 * Math.PI * 2) * 3.5, 1.8, Math.sin(i / 5 * Math.PI * 2) * 3.5);
  crystal.castShadow = true; crystals.push(crystal); engine.viewport.scene.add(crystal);
}
let ticks = 0;
engine.addUpdateHook(dt => { ticks++; crystals.forEach((crystal, i) => { crystal.rotation.y += dt; crystal.position.y = 1.8 + Math.sin(engine.time.elapsed * 1.5 + i) * 0.2; }); });
document.querySelector('#pause')!.addEventListener('click', () => features.pause.toggle());
document.querySelector('#round')!.addEventListener('click', () => features.session.start());
engine.sceneManager.events.on('session_started', () => { features.objectives.reset(); crystals.forEach(c => c.visible = true); });
document.querySelector('#collect')!.addEventListener('click', () => {
  if (features.pause.isPaused) return;
  if (features.session.getState().status !== 'running') features.session.start();
  if (features.objectives.advance('crystals')) { const crystal = crystals.find(c => c.visible); if (crystal) crystal.visible = false; features.session.addScore(10); features.notifications.show('+10 · Crystal collected', 'success'); }
});
const telemetry = document.querySelector('#telemetry')!;
// UI telemetry is deliberately independent from simulation to demonstrate a true pause.
let frame = 0;
const showTelemetry = () => {
  telemetry.textContent = `Simulation ticks: ${ticks} · FOV: ${engine.viewport.camera.fov} · Shadows: ${engine.viewport.renderer.shadowMap.enabled ? 'on' : 'off'}`;
  frame = requestAnimationFrame(showTelemetry);
};
showTelemetry();
features.session.start();
features.notifications.show('Collect crystals, or press Escape to pause.');
window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); engine.dispose(); }, { once: true });
