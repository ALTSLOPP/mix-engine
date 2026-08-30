import * as THREE from 'three';
import { buildRetargetProReport } from '../animation/RetargetProReport';
import type { Engine } from '../engine/Engine';
import { detachViewport, reattachViewport } from './layout';
import { wireCombat } from '../animation/CombatRigWiring';
import { GamepadDriver } from '../input/GamepadDriver';
import type { ActionDef, Binding, InputActionAsset } from '../input/types';

/**
 * Expose a tight `window.mix` facade so the IDE / REPL can drive the engine without
 * reaching into the full Engine instance. Also publishes `window.THREE`.
 */
export function installMixFacade(engine: Engine): void {
  (window as any).THREE = THREE;
  (window as any).mix = {
    engine,
    // Unity-style action authoring for IDE agents and the browser REPL.
    input: {
      manager: engine.input,
      devices: () => engine.input.gamepad.getStatus(),
      controls: () => GamepadDriver.getControls(),
      actions: () => engine.input.exportActionAsset(),
      define: (action: ActionDef, context?: string) => engine.input.defineAction(action, context),
      bind: (action: string, binding: Binding) => engine.input.contexts.map.bind(action, binding),
      setBindings: (action: string, bindings: Binding[]) => engine.input.setActionBindings(action, bindings),
      unbind: (action: string) => engine.input.clearActionBindings(action),
      remap: (asset: InputActionAsset | ActionDef[] | string, context?: string) => engine.input.importActionAsset(asset, context),
      exportJson: () => JSON.stringify(engine.input.exportActionAsset(), null, 2),
      value: (action: string) => engine.input.getActionValue(action),
      rumble: (pad?: number, options?: import('../input/GamepadDriver').RumbleOptions) => engine.input.gamepad.rumble(pad, options),
      onDeviceChange: (listener: import('../input/GamepadDriver').GamepadDriverListener) => engine.input.gamepad.on('change', listener),
    },
    detachViewport: () => detachViewport(engine),
    reattachViewport: () => reattachViewport(engine),
    addScript: (id: number, code: string) => engine.sceneManager.addScript(id, code),
    removeScript: (id: number) => engine.sceneManager.removeScript(id),
    raycast: (origin: [number,number,number], dir: [number,number,number], maxDist = 1000) => {
      const o = new THREE.Vector3(origin[0], origin[1], origin[2]);
      const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      const engO = new THREE.Vector3();
      engine.worldOrigin.toEngineSpaceInto(engO, o);
      const hit = engine.physicsWorld.raycast(engO, d, maxDist);
      if (!hit) return null;
      const body = engine.physicsWorld.rapierBodyFromColliderHandle(hit.colliderHandle);
      let entityId = null;
      if (body) {
        const rb = engine.sceneManager.rigidBodyList.find(r => r.rapierBody === body);
        if (rb) entityId = engine.sceneManager.entityOf(rb);
      }
      const w = new THREE.Vector3();
      engine.worldOrigin.toWorldSpaceInto(w, hit.point);
      return { point: [w.x, w.y, w.z], entityId, distance: hit.toi };
    },
    // SENSORIUM — the AI's perception layer.
    sensorium: engine.sensorium,
    // HELM — the agent control plane (structured request/response).
    helm: (req: any) => engine.runHelm(req),
    // One-liner an agent uses: mix.test('driving') → drives + records + analyzes.
    test: (profile: any, opts?: any) => engine.testSensorium(profile, opts),
    runSensorium: (script: any) => engine.runSensorium(script),
    abortSensorium: () => engine.abortSensorium(),
    saveBaseline: (name: string) => engine.sensorium.saveBaseline(name),
    runScript: (commands: any) => engine.runScript(commands),
    spawnVfx: (preset: string, x: number, y: number, z: number, opts?: any) =>
      engine.spawnVfx(preset as any, new THREE.Vector3(x, y, z), opts),
    cinematic: engine.cinematic,
    audio: engine.audio,
    vfx: engine.vfx,
    effects: engine.effects,
    shake: (opts?: any) => engine.effects.shake(opts),
    flash: (opts?: any) => engine.effects.flash(opts),
    setTimeScale: (scale: number) => engine.effects.setTimeScale(scale),
    setWeather: (kind: any, opts?: any) => engine.effects.setWeather(kind, opts),
    trail: (opts?: any) => engine.effects.trail(opts),
    decal: (opts: any) => engine.effects.decal(opts),
    hit: (opts?: any) => engine.effects.hit(opts),
    explosion: (opts?: any) => engine.effects.explosion(opts),
    zoomIn: (f?: number) => engine.zoomIn(f),
    zoomOut: (f?: number) => engine.zoomOut(f),
    zoomReset: () => engine.zoomReset(),
    frameAll: (p?: number) => engine.frameAll(p),
    frameEntity: (id: number, p?: number) => engine.frameEntity(id, p),
    cameraPresets: () => engine.listCameraPresets(),
    cameraPreset: (id: string, opts?: { anchorToSelection?: boolean }) => engine.applyCameraPreset(id, opts),
    cameraPresetNext: () => engine.cycleCameraPreset(1),
    cameraPresetPrev: () => engine.cycleCameraPreset(-1),
    playback: engine.sensorium,
    runPlayback: (script: any) => engine.runSensorium(script),
    abortPlayback: () => engine.abortSensorium(),
    prefabs: engine.prefabs,
    textures: engine.textures,
    materials: engine.materials,
    testPrefab: () => {
      engine.prefabs.register({
        name: 'TestTree',
        root: {
          blueprint: { kind: 'box', params: { hx: 0.2, hy: 2.0, hz: 0.2, color: 0x8B4513 } },
          children: [
            { blueprint: { kind: 'box', params: { hx: 1.5, hy: 1.5, hz: 1.5, color: 0x228B22 } }, localPos: [0, 2.5, 0] }
          ]
        }
      });
      engine.prefabs.spawn('TestTree', new THREE.Vector3(0, 0, 0));
    },
    testMaterial: () => {
      engine.materials.register({
        id: 'AnimeBrick',
        type: 'standard',
        texturePreset: { style: 'anime', type: 'brick', repeat: 2 }
      });
      engine.sceneManager.spawnNow(new THREE.Vector3(2, 2, 0), {
        kind: 'box', params: { hx: 1, hy: 1, hz: 1, materialId: 'AnimeBrick' }
      });
    },
    // ─── MIX Animation Retarget Pro — IDE-native animation pipeline ──────────
    // Drop a folder of FBX/GLB from the store, then from the IDE:
    //   await mix.importPack({ packId:'brawler', sourcePath:'/assets/packs/brawler', targetRig:'ayo' })
    //   mix.applyPack('brawler', { target:'all' })
    //   mix.wireCombat({ pack:'brawler', auto:true })
    animPacks: engine.animPacks,
    animImporter: engine.animImporter,
    importPack: (opts: Parameters<import('../animation/AnimationImporter').AnimationImporter['importPack']>[0]) => engine.animImporter.importPack(opts),
    /** One IDE call: import, AAA quality-gate, apply, and combat-wire a store pack. */
    retargetPro: async (opts: Parameters<import('../animation/AnimationImporter').AnimationImporter['importPack']>[0] & { target?: 'all'|number|string|number[]; autoApply?: boolean; autoWireCombat?: boolean; strict?: boolean; prefix?: string }) => {
      const result = await engine.animImporter.importPack({ ...opts, qualityPreset: opts.qualityPreset ?? 'aaa' });
      if (!result.ok || !result.pack || !result.report) return result;
      if (opts.strict && result.report.readiness !== 'ready') return { ...result, ok: false, error: `strict quality gate rejected grade ${result.report.grade}: ${result.report.readiness}` };
      const target = opts.target ?? 'all';
      let applied = 0;
      if (opts.autoApply !== false) applied = (window as unknown as { mix: { applyPack: (id:string,o:unknown)=>number } }).mix.applyPack(opts.packId, { target, prefix: opts.prefix });
      const combat = opts.autoWireCombat === false ? null : (window as unknown as { mix: { wireCombat: (o:unknown)=>unknown } }).mix.wireCombat({ pack: opts.packId, auto: true, targetSelector: target, prefix: opts.prefix });
      return { ...result, workflow: { applied, combat } };
    },
    retargetReport: (packId?: string) => {
      const packs = packId ? [engine.animPacks.get(packId)].filter(Boolean) : engine.animPacks.list();
      return packs.map(p => buildRetargetProReport(p!.def, engine.animPacks.packIssues.get(p!.def.id) ?? []));
    },
    listPacks: () => engine.animPacks.toJSON(),
    applyPack: (packId: string, opts?: { target?: 'all'|number|string|number[]; prefix?: string }) => {
      const reg = engine.animPacks;
      const target = (opts as unknown as { target?: unknown })?.target ?? 'all';
      const prefix = (opts as unknown as { prefix?: string })?.prefix;
      if (target === 'all') return reg.applyToAll(packId, engine.animationStateMachines, { prefix });
      const ids: number[] = typeof target === 'number' ? [target] : Array.isArray(target) ? target as number[] : [];
      if (typeof target === 'string' && (target as string).startsWith('@')) { const id = engine.aiBridge.resolveEntity(target as string); if (id!==undefined) ids.push(id); }
      let n=0; for (const id of ids) { const rb = engine.sceneManager.getRigidBody(id); const asm = rb ? engine.findAnimationStateMachine(rb) : null; if (asm) n+= reg.applyToStateMachine(packId, asm, { prefix }); }
      return n;
    },
    wireCombat: (opts: import('../animation/CombatRigWiring').WireCombatOptions) => {
      return wireCombat(opts, {
        registry: engine.animPacks,
        sceneManager: engine.sceneManager,
        findAsmForEntity: (id:number)=> { const rb=engine.sceneManager.getRigidBody(id); return rb? engine.findAnimationStateMachine(rb):null; },
        allAsm: ()=> engine.animationStateMachines,
        gizmoSelectedId: ()=> { const rb=(engine as unknown as { gizmo:{ attached: import('../physics/RigidBodyComponent').RigidBodyComponent|null }}).gizmo.attached; return rb? engine.sceneManager.entityOf(rb):null; },
      });
    },
    previewAnim: (packId:string, entryId:string, entityId?:number, fade?:number) => {
      const clip = engine.animPacks.getClip(packId, entryId);
      if (!clip) { console.warn(`[mix.previewAnim] clip '${entryId}' not in pack '${packId}'`); return false; }
      let targetId = entityId ?? null; if (targetId===null) { const rb=(engine as unknown as { gizmo:{ attached: import('../physics/RigidBodyComponent').RigidBodyComponent|null }}).gizmo.attached; targetId = rb? engine.sceneManager.entityOf(rb):null; }
      if (targetId===null) { console.warn('[mix.previewAnim] no target entity'); return false; }
      const rb=engine.sceneManager.getRigidBody(targetId); const asm=rb? engine.findAnimationStateMachine(rb):null; if(!asm) return false;
      if (!asm.hasAnimation(entryId)) {
        const loop = engine.animPacks.get(packId)?.def.entries.find(e => e.id === entryId)?.loop ?? true;
        asm.addAnimation(entryId, clip, { loop });
      }
      asm.transition(entryId, fade??0.25); return true;
    },
    // ─── MIX Motion Director (Animancer 8.4-inspired Code-Driven Motion API) ──
    motion: {
      manager: engine.motion,
      play: (entityId: number, clip: string, opts?: import('../motion').PlayOptions) =>
        engine.motion.play(entityId, clip, opts),
      stop: (entityId: number, fade?: number, layer?: string | number) =>
        engine.motion.stop(entityId, fade, layer),
      pause: (entityId: number) => engine.motion.getGraph(entityId)?.pause(),
      resume: (entityId: number) => engine.motion.getGraph(entityId)?.resume(),
      crossfade: (entityId: number, clip: string, fade?: number, layer?: string | number) =>
        engine.motion.play(entityId, clip, { fade: fade ?? 0.25, layer }),
      inspect: (entityId: number) => engine.motion.inspect(entityId),
      getGraph: (entityId: number) => engine.motion.getGraph(entityId),
      setParam: (entityId: number, name: string, value: unknown, damping?: number) =>
        engine.motion.getGraph(entityId)?.parameters.set(name, value as any, damping),
      getParam: (entityId: number, name: string) =>
        engine.motion.getGraph(entityId)?.parameters.get(name),
    },
    // ─── MIX Inspector Studio (Odin 4.0.2.4-inspired Reflection & Validation) ──
    inspector: {
      manager: engine.inspector,
      getTree: (target: any, schema?: import('../inspector').InspectorSchemaDef) =>
        engine.inspector.getTree(target, schema),
      validate: (target: any, opts?: { dryRun?: boolean; autoFix?: boolean }) =>
        import('../inspector').then(m => m.ValidatorRegistry.validateTarget(target, undefined, opts)),
      serialize: (target: any) =>
        import('../inspector').then(m => m.SerializationEngine.serialize(target)),
      deserialize: (json: string) =>
        import('../inspector').then(m => m.SerializationEngine.deserialize(json)),
      diff: (a: any, b: any) =>
        import('../inspector').then(m => m.SerializationEngine.diff(a, b)),
    },
    // ─── MIX Tween Director (DOTween Pro-inspired Sequencing & Tweening API) ──
    tweens: engine.tweens,
    tween: {
      to: (target: any, propOrValues: any, toOrOpts?: any, maybeOpts?: any) =>
        engine.tweens.to(target, propOrValues, toOrOpts, maybeOpts),
      from: (target: any, propOrValues: any, fromOrOpts?: any, maybeOpts?: any) =>
        engine.tweens.from(target, propOrValues, fromOrOpts, maybeOpts),
      fromTo: (target: any, prop: string, from: any, to: any, opts?: any) =>
        engine.tweens.fromTo(target, prop, from, to, opts),
      sequence: (id?: string) => engine.tweens.sequence(id),
      move: (target: any, to: any, opts?: any) => engine.tweens.move(target, to, opts),
      rotate: (target: any, to: any, opts?: any) => engine.tweens.rotate(target, to, opts),
      scale: (target: any, to: any, opts?: any) => engine.tweens.scale(target, to, opts),
      punch: (target: any, prop: string, punchVec: any, opts?: any) => engine.tweens.punch(target, prop, punchVec, opts),
      shake: (target: any, prop: string, strength?: any, opts?: any) => engine.tweens.shake(target, prop, strength, opts),
      inspect: () => engine.tweens.inspect(),
      killAll: () => engine.tweens.killAll(),
      pauseAll: () => engine.tweens.pauseAll(),
      resumeAll: () => engine.tweens.resumeAll(),
    },
  };
}
