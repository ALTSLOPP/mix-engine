# MIX Tween Director — Architecture & API Guide

## 1. Overview & Architecture

**MIX Tween Director** is a high-performance, deterministic tweening, sequencing, and timeline orchestrator for MIX Engine, designed from the ground up using TypeScript, Three.js, and Rapier physics.

Inspired by the workflow benefits and declarative expressiveness of DOTween Pro for Unity, MIX Tween Director provides an original, IDE-native solution that empowers both human developers and autonomous AI agents (Gemini Code, Codex, Claude Code) to author complex animations, cutscenes, gameplay sequences, UI effects, and material transitions without writing manual update loops.

```
┌─────────────────────────────────────────────────────────────┐
│                    MIX Tween Director                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┼────────────────────────┐
       ▼                       ▼                        ▼
┌──────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ TweenDirector│      │  TweenSequence  │      │  TweenEase &    │
│   Manager    │◄────►│   (Timeline)    │◄────►│  Value Adapters │
└──────┬───────┘      └────────┬────────┘      └─────────────────┘
       │                       │
       ▼                       ▼
┌──────────────┐      ┌─────────────────┐
│  TweenGraph  │      │   TweenHandle   │ (Awaitable Promises)
│  (Conflicts) │      │(awaitComplete..)│
└──────┬───────┘      └─────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│              Three.js Transforms & Rapier Physics           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core API Reference

### Tweening Properties (`engine.tweens.to`)
```ts
// 1. Single property on object
const handle = engine.tweens.to(entity.transform.position, 'y', 5, {
  duration: 1.2,
  ease: 'cubicOut',
});

// 2. Multi-property map with dot-paths
engine.tweens.to(entity, {
  'transform.position.y': 3,
  'material.opacity': 0,
}, {
  duration: 0.8,
  ease: 'quadInOut',
});

// 3. From-To tween
engine.tweens.fromTo(mesh.scale, 'x', 0, 1.5, {
  duration: 0.5,
  ease: 'backOut',
});
```

### Sequencing & Timelines (`engine.tweens.sequence`)
```ts
const seq = engine.tweens.sequence('boss_intro')
  .appendMove(bossMesh, { y: 0, z: 10 }, 2.0, 'cubicOut')
  .joinRotate(bossMesh, { y: Math.PI }, 2.0, 'sineInOut')
  .appendInterval(0.5)
  .appendCallback(() => engine.audio.play('boss_roar'))
  .appendMarker('roar_finished')
  .play();

await seq.getHandle().awaitMarker('roar_finished');
```

### Awaitable Handle (`TweenHandle`)
Every tween and sequence returns an awaitable `TweenHandle`:
```ts
const handle = engine.tweens.move(playerMesh, { x: 10, y: 0, z: 5 }, { duration: 2.0 });

await handle.awaitStart();     // Resolves when tween starts (after delay)
await handle.awaitStep();      // Resolves on next frame step
await handle.awaitLoop();      // Resolves on each loop completion
await handle.awaitMarker('m'); // Resolves when timeline passes marker 'm'
await handle.awaitComplete();  // Resolves on final completion ('completed' | 'cancelled' | 'replaced')
```

---

## 3. Production Recipes

### Recipe 1: Opening a Door
```ts
await engine.tweens.sequence('door_open')
  .appendRotate(doorMesh, { y: Math.PI / 2 }, 0.8, 'cubicOut')
  .appendCallback(() => engine.audio.play('door_slam_stop'))
  .play()
  .getHandle()
  .awaitComplete();
```

### Recipe 2: Moving an Elevator with Kinematic Sync
```ts
const elevatorHandle = engine.tweens.move(elevatorMesh, { y: 15 }, {
  duration: 4.0,
  ease: 'sineInOut',
  physicsPolicy: 'kinematic',
});

await elevatorHandle.awaitComplete();
```

### Recipe 3: Cinematic Camera Cutscene with FOV Blend
```ts
const cutscene = engine.tweens.sequence('intro_cutscene')
  .appendMove(engine.viewport.camera, { x: 0, y: 5, z: 12 }, 3.0, 'easeInOutCubic')
  .join(engine.tweens.to(engine.viewport.camera, 'fov', 45, { duration: 3.0 }))
  .appendMarker('focus_boss')
  .play();

await cutscene.getHandle().awaitMarker('focus_boss');
```

### Recipe 4: UI Menu Transition (Slide & Fade)
```ts
engine.tweens.to(uiPanelElement.style, {
  transform: 'translateX(0px)',
  opacity: '1',
}, {
  duration: 0.4,
  ease: 'backOut',
});
```

### Recipe 5: Material Dissolve / Dissolve Fade
```ts
engine.tweens.material(enemyMaterial, {
  opacity: 0,
  emissiveIntensity: 5.0,
}, {
  duration: 1.5,
  ease: 'expoIn',
});
```

### Recipe 6: Vehicle Light Sequence
```ts
engine.tweens.sequence('vehicle_lights')
  .append(engine.tweens.to(headlight, 'intensity', 3.0, { duration: 0.1 }))
  .appendInterval(0.1)
  .append(engine.tweens.to(headlight, 'intensity', 0.0, { duration: 0.1 }))
  .append(engine.tweens.to(headlight, 'intensity', 5.0, { duration: 0.2 }))
  .play();
```

### Recipe 7: Combat Hit-Stop & Camera Punch
```ts
// 1. Time dilation
engine.effects.setTimeScale(0.1);

// 2. Camera punch oscillation
engine.tweens.punch(engine.viewport.camera, 'position', new THREE.Vector3(0, 0.4, 0), {
  duration: 0.3,
  vibrato: 15,
  elasticity: 1.2,
});

setTimeout(() => engine.effects.setTimeScale(1.0), 80);
```

### Recipe 8: Boss Introduction Effect
```ts
await engine.aiBridge.execute({
  type: 'tween_effect_create',
  effectId: 'boss_spawn_fx',
  steps: [
    { op: 'scale', entityId: 42, to: [1, 1, 1], duration: 0.8, ease: 'backOut' },
    { op: 'material', entityId: 42, property: 'emissiveIntensity', to: 4, duration: 0.4, join: true },
    { op: 'marker', name: 'spawn_done' }
  ]
});
```

### Recipe 9: Day/Night Light Transition
```ts
engine.tweens.to(engine.dayNight, 'hour', 20, {
  duration: 5.0,
  ease: 'sineInOut',
});
```

### Recipe 10: Audio Crossfade
```ts
engine.tweens.sequence('music_crossfade')
  .append(engine.tweens.audio(bgmTrack1, 0.0, { duration: 2.0 }))
  .join(engine.tweens.audio(bgmTrack2, 1.0, { duration: 2.0 }))
  .play();
```
