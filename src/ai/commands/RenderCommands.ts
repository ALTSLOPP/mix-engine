import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import { VisualStyleRegistry } from '../../rendering/profiles/VisualStyleRegistry';
import { PerformanceTargetRegistry } from '../../rendering/profiles/PerformanceTargetRegistry';
import { AnimeMaterialFamily } from '../../materials/AnimeMaterialFamily';
import { CelToonMaterial } from '../../materials/CelToonMaterial';
import { AssetAnalyzer } from '../../assets/derived/AssetAnalyzer';
import { OptimizationPlanner } from '../../assets/derived/OptimizationPlanner';
import { DerivedVariantCache } from '../../assets/derived/DerivedVariantCache';
import { DerivedAssetPipeline } from '../../assets/derived/DerivedAssetPipeline';
import { AnimationOptimizer } from '../../assets/derived/AnimationOptimizer';
import { PerformanceExplainer, type SceneRenderStats } from '../../rendering/PerformanceExplainer';
import { TextRenderDescriber } from '../../rendering/TextRenderDescriber';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('set_time_of_day', (cmd: Extract<AICommand, { type: 'set_time_of_day' }>) => {
    ctx.setTimeOfDay(cmd.hour);
  });

  map.set('day_night_cycle', (cmd: Extract<AICommand, { type: 'day_night_cycle' }>) => {
    if (!ctx.dayNight) {
      ctx.setQueryResult({ ok: false, error: 'day_night_cycle: unavailable' });
      return;
    }
    if (cmd.speed !== undefined) ctx.dayNight.setSpeed(cmd.speed);
    if (cmd.hour !== undefined) ctx.dayNight.setHour(cmd.hour);
    if (cmd.enabled !== undefined) ctx.dayNight.setEnabled(cmd.enabled);
    ctx.setQueryResult(ctx.dayNight.info());
  });

  map.set('set_weather', (cmd: Extract<AICommand, { type: 'set_weather' }>) => {
    setWeather(cmd, ctx);
  });

  map.set('add_light', (cmd: Extract<AICommand, { type: 'add_light' }>) => {
    addLight(cmd, ctx);
  });

  map.set('set_exposure', (cmd: Extract<AICommand, { type: 'set_exposure' }>) => {
    ctx.viewport.renderer.toneMappingExposure = cmd.value;
  });

  map.set('set_post_fx', (cmd: Extract<AICommand, { type: 'set_post_fx' }>) => {
    setPostFx(cmd, ctx);
  });

  map.set('set_tone', (cmd: Extract<AICommand, { type: 'set_tone' }>) => {
    if (ctx.viewport && ctx.viewport.renderer) {
      ctx.viewport.renderer.toneMappingExposure = cmd.exposure;
    }
  });

  map.set('set_sky_environment', (cmd: Extract<AICommand, { type: 'set_sky_environment' }>) => {
    setSkyEnvironment(cmd, ctx);
  });

  map.set('set_environment', (cmd: Extract<AICommand, { type: 'set_environment' }>) => {
    setEnvironment(cmd, ctx);
  });

  map.set('set_shadow_strategy', (cmd: Extract<AICommand, { type: 'set_shadow_strategy' }>) => {
    ctx.viewport.setShadowStrategy(cmd.strategy);
    ctx.setQueryResult({ strategy: cmd.strategy });
  });

  // --- Visual Style Commands ---
  map.set('render_style_list', () => {
    ctx.setQueryResult({ ok: true, styles: VisualStyleRegistry.list() });
  });

  map.set('render_style_get', (cmd: any) => {
    if (!cmd.styleId || !VisualStyleRegistry.has(cmd.styleId)) {
      ctx.setQueryResult({
        ok: false,
        code: 'UNKNOWN_VISUAL_STYLE',
        requested: cmd.styleId,
        suggestions: VisualStyleRegistry.getSuggestions(cmd.styleId || ''),
      });
      return;
    }
    const style = VisualStyleRegistry.require(cmd.styleId);
    ctx.setQueryResult({ ok: true, style });
  });

  map.set('render_style_apply', (cmd: any) => {
    if (!cmd.styleId || !VisualStyleRegistry.has(cmd.styleId)) {
      ctx.setQueryResult({
        ok: false,
        code: 'UNKNOWN_VISUAL_STYLE',
        requested: cmd.styleId,
        suggestions: VisualStyleRegistry.getSuggestions(cmd.styleId || ''),
      });
      return;
    }
    ctx.viewport.applyVisualStyle(cmd.styleId);
    const style = VisualStyleRegistry.require(cmd.styleId);
    ctx.setQueryResult({ ok: true, appliedStyle: style.id, colorTransform: style.colorTransform });
  });

  map.set('render_style_describe', (cmd: any) => {
    if (!cmd.styleId || !VisualStyleRegistry.has(cmd.styleId)) {
      ctx.setQueryResult({
        ok: false,
        code: 'UNKNOWN_VISUAL_STYLE',
        requested: cmd.styleId,
        suggestions: VisualStyleRegistry.getSuggestions(cmd.styleId || ''),
      });
      return;
    }
    const desc = VisualStyleRegistry.describe(cmd.styleId);
    ctx.setQueryResult({ ok: true, description: desc });
  });

  // --- Performance Target Commands ---
  map.set('render_target_list', () => {
    ctx.setQueryResult({ ok: true, targets: PerformanceTargetRegistry.list() });
  });

  map.set('render_target_get', (cmd: any) => {
    if (!cmd.targetId || !PerformanceTargetRegistry.has(cmd.targetId)) {
      ctx.setQueryResult({
        ok: false,
        code: 'UNKNOWN_PERFORMANCE_TARGET',
        requested: cmd.targetId,
        suggestions: PerformanceTargetRegistry.getSuggestions(cmd.targetId || ''),
      });
      return;
    }
    const target = PerformanceTargetRegistry.require(cmd.targetId);
    ctx.setQueryResult({ ok: true, target });
  });

  map.set('render_target_apply', (cmd: any) => {
    if (!cmd.targetId || !PerformanceTargetRegistry.has(cmd.targetId)) {
      ctx.setQueryResult({
        ok: false,
        code: 'UNKNOWN_PERFORMANCE_TARGET',
        requested: cmd.targetId,
        suggestions: PerformanceTargetRegistry.getSuggestions(cmd.targetId || ''),
      });
      return;
    }
    ctx.viewport.applyPerformanceTarget(cmd.targetId, ctx.qualityScaler);
    const target = PerformanceTargetRegistry.require(cmd.targetId);
    const res = ctx.viewport.getRenderResolution();
    ctx.setQueryResult({
      ok: true,
      requestedTarget: cmd.targetId,
      activeTarget: target.id,
      targetFps: target.targetFps,
      internalResolution: [res.internalWidth, res.internalHeight],
      outputResolution: [res.outputWidth, res.outputHeight],
      fsrEnabled: target.fsrEnabled,
      fsrSharpness: target.fsrSharpness,
    });
  });

  map.set('render_target_describe', (cmd: any) => {
    if (!cmd.targetId || !PerformanceTargetRegistry.has(cmd.targetId)) {
      ctx.setQueryResult({
        ok: false,
        code: 'UNKNOWN_PERFORMANCE_TARGET',
        requested: cmd.targetId,
        suggestions: PerformanceTargetRegistry.getSuggestions(cmd.targetId || ''),
      });
      return;
    }
    const desc = PerformanceTargetRegistry.describe(cmd.targetId);
    ctx.setQueryResult({ ok: true, description: desc });
  });

  // --- Render Status & Capabilities ---
  map.set('render_resolution_status', () => {
    const res = ctx.viewport.getRenderResolution();
    const settings = ctx.viewport.getResolutionSettings();
    ctx.setQueryResult({
      ok: true,
      internalWidth: res.internalWidth,
      internalHeight: res.internalHeight,
      outputWidth: res.outputWidth,
      outputHeight: res.outputHeight,
      fsrEnabled: settings.fsrEnabled,
      fsrSharpness: settings.fsrSharpness,
      renderScale: settings.renderScale,
    });
  });

  map.set('render_capabilities', () => {
    const caps = ctx.viewport.renderer.capabilities;
    ctx.setQueryResult({
      ok: true,
      webgl2: caps.isWebGL2,
      maxTextureSize: caps.maxTextureSize,
      maxCubemapSize: caps.maxCubemapSize,
      maxAttributes: caps.maxAttributes,
      maxVertexUniforms: caps.maxVertexUniforms,
      fsr1: true,
      meshoptDecode: true,
      ktx2Decode: false,
      assetCooking: {
        meshOptimization: true,
        textureTranscode: true,
        animationLod: true,
      },
    });
  });

  // --- Budget Report & Explanation ---
  map.set('render_budget_report', (cmd: any) => {
    const frame = ctx.viewport.pipeline?.getLastFrameMetrics?.() ?? null;
    if (!frame) {
      ctx.setQueryResult({ ok: false, error: 'No completed render frame is available yet.' });
      return;
    }
    const latestFrame = ctx.profiler?.latest();
    const measuredFps = ctx.qualityScaler?.fps ?? (latestFrame && latestFrame.frameMs > 0 ? 1000 / latestFrame.frameMs : undefined) ?? cmd.fps ?? cmd.targetFps ?? 60;
    const res = ctx.viewport.getRenderResolution();
    const settings = ctx.viewport.getResolutionSettings();
    const stats: SceneRenderStats = {
      fps: measuredFps,
      frameTimeMs: 1000 / measuredFps,
      internalWidth: res.internalWidth,
      internalHeight: res.internalHeight,
      outputWidth: res.outputWidth,
      outputHeight: res.outputHeight,
      fsrEnabled: settings.fsrEnabled,
      rcasSharpness: settings.fsrSharpness,
      drawCalls: frame.drawCalls,
      submittedTriangles: frame.triangles,
      visibleTriangles: frame.triangles,
      totalGeometries: frame.geometries,
      totalTextures: frame.textures,
      shadowCasters: ctx.viewport.getActiveShadowCastersCount?.() ?? (ctx.viewport.shadow as any)?.cascades?.length ?? 1,
    };
    const explanation = PerformanceExplainer.explain(stats, cmd.targetFps ?? 60);
    ctx.setQueryResult({ ok: true, report: explanation, formatted: PerformanceExplainer.formatReport(explanation) });
  });

  map.set('render_explain', (cmd: any) => {
    const frame = ctx.viewport.pipeline?.getLastFrameMetrics?.() ?? null;
    if (!frame) {
      ctx.setQueryResult({ ok: false, error: 'No completed render frame is available yet.' });
      return;
    }
    const latestFrame = ctx.profiler?.latest();
    const measuredFps = ctx.qualityScaler?.fps ?? (latestFrame && latestFrame.frameMs > 0 ? 1000 / latestFrame.frameMs : undefined) ?? cmd.fps ?? cmd.targetFps ?? 60;
    const res = ctx.viewport.getRenderResolution();
    const settings = ctx.viewport.getResolutionSettings();
    const stats: SceneRenderStats = {
      fps: measuredFps,
      frameTimeMs: 1000 / measuredFps,
      internalWidth: res.internalWidth,
      internalHeight: res.internalHeight,
      outputWidth: res.outputWidth,
      outputHeight: res.outputHeight,
      fsrEnabled: settings.fsrEnabled,
      rcasSharpness: settings.fsrSharpness,
      drawCalls: frame.drawCalls,
      submittedTriangles: frame.triangles,
      visibleTriangles: frame.triangles,
      totalGeometries: frame.geometries,
      totalTextures: frame.textures,
      shadowCasters: ctx.viewport.getActiveShadowCastersCount?.() ?? (ctx.viewport.shadow as any)?.cascades?.length ?? 1,
    };
    const explanation = PerformanceExplainer.explain(stats, cmd.targetFps ?? 60);
    ctx.setQueryResult({ ok: true, explanation: PerformanceExplainer.formatReport(explanation) });
  });

  // --- Anime Material Commands ---
  map.set('anime_material_apply', (cmd: any) => {
    const rb = ctx.sceneManager.getComponent<any>(cmd.entityId, 'rigidBody');
    const obj = rb?.mesh;
    if (!obj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${cmd.entityId} not found or has no mesh object.` });
      return;
    }
    const res = AnimeMaterialFamily.applyToCharacter(obj, {
      skinColor: cmd.skinColor,
      hairColor: cmd.hairColor,
      eyeColor: cmd.eyeColor,
      clothColor: cmd.clothColor,
      hairHighlightStrength: cmd.hairHighlightStrength,
      rimIntensity: cmd.rimIntensity,
      shadowTint: cmd.shadowTint,
      faceSdfMode: cmd.faceSdfMode,
      lightingContext: ctx.viewport.animeLighting,
    });
    if (res.converted === 0) {
      ctx.setQueryResult({ ok: false, error: `No convertible meshes found on entity ${cmd.entityId}.` });
      return;
    }
    ctx.setQueryResult({ ok: true, entityId: cmd.entityId, materialsConverted: res.converted });
  });

  map.set('anime_material_revert', (cmd: any) => {
    const rb = ctx.sceneManager.getComponent<any>(cmd.entityId, 'rigidBody');
    const obj = rb?.mesh;
    if (!obj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${cmd.entityId} not found or has no mesh object.` });
      return;
    }
    const res = AnimeMaterialFamily.revertCharacter(obj);
    ctx.setQueryResult({ ok: true, entityId: cmd.entityId, materialsReverted: res.reverted });
  });

  map.set('anime_material_configure', (cmd: any) => {
    const rb = ctx.sceneManager.getComponent<any>(cmd.entityId, 'rigidBody');
    const obj = rb?.mesh;
    if (!obj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${cmd.entityId} not found or has no mesh object.` });
      return;
    }
    let configured = 0;
    obj.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m instanceof CelToonMaterial) {
            if (cmd.surface) m.setSurface(cmd.surface);
            if (cmd.shadowThreshold !== undefined) m.uniforms.uShadowThreshold.value = cmd.shadowThreshold;
            if (cmd.shadowSoftness !== undefined) m.uniforms.uShadowSoftness.value = cmd.shadowSoftness;
            if (cmd.shadowColor !== undefined) m.setLightingOverrides({ shadowColor: cmd.shadowColor });
            if (cmd.rimIntensity !== undefined) m.setLightingOverrides({ rimIntensity: cmd.rimIntensity });
            if (cmd.hairHighlightStrength !== undefined) m.uniforms.uHairHighlightStrength.value = cmd.hairHighlightStrength;
            if (cmd.metalness !== undefined) m.metalness = cmd.metalness;
            configured++;
          }
        }
      }
    });
    if (configured === 0) {
      ctx.setQueryResult({ ok: false, error: `No CelToonMaterials found on entity ${cmd.entityId}.` });
      return;
    }
    ctx.setQueryResult({ ok: true, entityId: cmd.entityId, configuredMaterials: configured });
  });

  map.set('anime_material_describe', (cmd: any) => {
    const rb = ctx.sceneManager.getComponent<any>(cmd.entityId, 'rigidBody');
    const obj = rb?.mesh;
    if (!obj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${cmd.entityId} not found or has no mesh object.` });
      return;
    }
    const descriptions: string[] = [];
    obj.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m instanceof CelToonMaterial) {
            descriptions.push(`[Mesh: ${mesh.name || 'unnamed'}]\n${m.describe()}`);
          }
        }
      }
    });
    ctx.setQueryResult({ ok: true, descriptions });
  });

  // --- Asset Optimization Commands ---
  map.set('asset_analyze', (cmd: any) => {
    let obj: THREE.Object3D | undefined = undefined;
    let checkedOut = false;
    if (cmd.entityId !== undefined) {
      const entityId = typeof cmd.entityId === 'string' && ctx.resolveEntity ? ctx.resolveEntity(cmd.entityId) : cmd.entityId;
      const rb = ctx.sceneManager.getComponent<any>(entityId, 'rigidBody');
      obj = rb?.mesh;
    } else if (cmd.assetId && ctx.assetCache?.has(cmd.assetId)) {
      obj = ctx.assetCache.checkout(cmd.assetId);
      checkedOut = true;
    }
    if (!obj) {
      ctx.setQueryResult({ ok: false, error: `Asset '${cmd.assetId ?? cmd.entityId}' could not be located in scene or asset cache.` });
      return;
    }
    try {
      const report = AssetAnalyzer.analyzeAsset({
        assetId: cmd.assetId ?? `entity_${cmd.entityId}`,
        object: obj,
      });
      ctx.setQueryResult({ ok: true, report, description: TextRenderDescriber.describeAsset(report) });
    } finally {
      if (checkedOut && cmd.assetId) ctx.assetCache?.release(cmd.assetId);
    }
  });

  map.set('asset_optimize_plan', (cmd: any) => {
    let obj: THREE.Object3D | undefined = undefined;
    let checkedOut = false;
    if (cmd.entityId !== undefined) {
      const entityId = typeof cmd.entityId === 'string' && ctx.resolveEntity ? ctx.resolveEntity(cmd.entityId) : cmd.entityId;
      const rb = ctx.sceneManager.getComponent<any>(entityId, 'rigidBody');
      obj = rb?.mesh;
    } else if (cmd.assetId && ctx.assetCache?.has(cmd.assetId)) {
      obj = ctx.assetCache.checkout(cmd.assetId);
      checkedOut = true;
    }
    try {
      const meshMetrics = obj ? AssetAnalyzer.analyzeMesh(obj, cmd.assetId ?? `entity_${cmd.entityId}`) : undefined;
      const plan = OptimizationPlanner.planMeshOptimization({
        assetId: cmd.assetId ?? `entity_${cmd.entityId}`,
        category: cmd.category,
        importance: cmd.importance,
        overrides: cmd.overrides,
        targetProfile: cmd.targetProfile ?? 'ps3_plus_500',
        meshMetrics,
      });
      ctx.setQueryResult({ ok: true, plan, description: TextRenderDescriber.describeOptimizationPlan(plan) });
    } finally {
      if (checkedOut && cmd.assetId) ctx.assetCache?.release(cmd.assetId);
    }
  });

  map.set('asset_optimize', (cmd: any) => {
    let obj: THREE.Object3D | undefined = undefined;
    let checkedOut = false;
    if (cmd.entityId !== undefined) {
      const entityId = typeof cmd.entityId === 'string' && ctx.resolveEntity ? ctx.resolveEntity(cmd.entityId) : cmd.entityId;
      const rb = ctx.sceneManager.getComponent<any>(entityId, 'rigidBody');
      obj = rb?.mesh;
    } else if (cmd.assetId && ctx.assetCache?.has(cmd.assetId)) {
      obj = ctx.assetCache.checkout(cmd.assetId);
      checkedOut = true;
    }
    if (!obj) {
      ctx.setQueryResult({ ok: false, error: `Asset '${cmd.assetId ?? cmd.entityId}' could not be located in scene or asset cache.` });
      return;
    }
    try {
      const pipeline = DerivedAssetPipeline.get();
      const result = pipeline.process(cmd.assetId ?? `entity_${cmd.entityId}`, obj, cmd.targetProfile ?? 'ps3_plus_500', {
        category: cmd.category,
        importance: cmd.importance,
        overrides: cmd.overrides,
      });
      ctx.setQueryResult({ ok: result.ok, result, formatted: TextRenderDescriber.describeOptimizationPlan(result.plan) });
    } finally {
      if (checkedOut && cmd.assetId) ctx.assetCache?.release(cmd.assetId);
    }
  });

  map.set('asset_variant_list', () => {
    const cache = DerivedVariantCache.get();
    ctx.setQueryResult({
      ok: true,
      variants: cache.listKeys(),
      totalSizeBytes: cache.getTotalSizeBytes(),
    });
  });

  map.set('asset_variant_get', (cmd: any) => {
    const pipeline = DerivedAssetPipeline.get();
    const pinned = pipeline.resolver.getPinnedVariant(cmd.assetId);
    const variants = pipeline.cache.listKeys().filter(k => k.includes(cmd.assetId));
    ctx.setQueryResult({ ok: true, assetId: cmd.assetId, pinnedVariant: pinned ?? null, availableVariants: variants });
  });

  map.set('asset_variant_pin', (cmd: any) => {
    const pipeline = DerivedAssetPipeline.get();
    pipeline.resolver.pinVariant(cmd.assetId, cmd.variantKey);
    ctx.setQueryResult({ ok: true, assetId: cmd.assetId, pinnedVariant: cmd.variantKey });
  });

  map.set('asset_variant_unpin', (cmd: any) => {
    const pipeline = DerivedAssetPipeline.get();
    pipeline.resolver.unpinVariant(cmd.assetId);
    ctx.setQueryResult({ ok: true, assetId: cmd.assetId, unpinned: true });
  });

  map.set('animation_optimize', (cmd: any) => {
    let clips: THREE.AnimationClip[] = [];
    if (cmd.assetId && ctx.assetCache?.has(cmd.assetId)) {
      clips = ctx.assetCache.getAnimations(cmd.assetId);
    }
    if (clips.length === 0) {
      ctx.setQueryResult({ ok: false, error: `No animation clips found for asset '${cmd.assetId}'.` });
      return;
    }
    const optimized = clips.map(c => AnimationOptimizer.optimizeClip(c, {
      quaternionToleranceRad: cmd.tolerance ?? 0.002,
      pruneConstantTracks: cmd.pruneConstant ?? true,
      preserveRootMotion: cmd.preserveRootMotion ?? true,
    }));
    ctx.setQueryResult({ ok: true, assetId: cmd.assetId, optimizedClips: optimized.length });
  });
}

function setWeather(cmd: Extract<AICommand, { type: 'set_weather' }>, ctx: CmdCtx): void {
  const scene = ctx.viewport.scene;
  if (cmd.fogDensity !== undefined) {
    if (cmd.fogDensity > 0) {
      if (scene.fog) (scene.fog as THREE.FogExp2).density = cmd.fogDensity;
      else scene.fog = new THREE.FogExp2(cmd.fogColor ?? '#06080a', cmd.fogDensity);
    } else {
      scene.fog = null;
    }
  }
  if (cmd.fogColor !== undefined) {
    if (scene.fog) (scene.fog as THREE.FogExp2).color.set(cmd.fogColor);
    ctx.viewport.renderer.setClearColor(cmd.fogColor);
  }
  if (cmd.ambient !== undefined) {
    scene.traverse((o) => {
      if ((o as THREE.HemisphereLight).isHemisphereLight) {
        (o as THREE.HemisphereLight).intensity = cmd.ambient!;
      }
    });
  }
}

function addLight(cmd: Extract<AICommand, { type: 'add_light' }>, ctx: CmdCtx): void {
  const scene = ctx.viewport.scene;
  const color = (cmd.color ?? 0xffffff) as THREE.ColorRepresentation;
  const intensity = cmd.intensity ?? 1;
  let light: THREE.Light;
  let target: THREE.Object3D | null = null;
  let area: THREE.RectAreaLight | null = null;
  if (cmd.kind === 'point') {
    const p = new THREE.PointLight(color, intensity, cmd.distance ?? 30, cmd.decay ?? 2);
    if (cmd.castShadow) { p.castShadow = true; p.shadow.mapSize.set(1024, 1024); }
    light = p;
  } else if (cmd.kind === 'spot') {
    const s = new THREE.SpotLight(color, intensity, cmd.distance ?? 40, cmd.angle ?? Math.PI / 5, cmd.penumbra ?? 0.4, cmd.decay ?? 1.5);
    if (cmd.castShadow) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); }
    if (cmd.cookie) {
      new THREE.TextureLoader().load(cmd.cookie, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        s.map = tex;
      });
    }
    target = s.target;
    light = s;
  } else if (cmd.kind === 'area') {
    const a = new THREE.RectAreaLight(color, intensity, cmd.width ?? 2, cmd.height ?? 1);
    area = a;
    light = a;
  } else {
    const d = new THREE.DirectionalLight(color, intensity);
    if (cmd.castShadow) { d.castShadow = true; d.shadow.mapSize.set(2048, 2048); }
    target = d.target;
    light = d;
  }
  ctx.worldOrigin.toEngineSpaceInto(ctx._engPos, new THREE.Vector3(cmd.position[0], cmd.position[1], cmd.position[2]));
  const cam = ctx.viewport.camera;
  light.position.copy(ctx._engPos);
  (light as THREE.Light).userData.followOffset = ctx._engPos.clone().sub(cam.position);
  (light as THREE.Light).userData.followCamera = true;
  (light as THREE.Light).userData.excludeFromOriginShift = true;
  const aimEng = cmd.target
    ? ctx.worldOrigin.toEngineSpaceInto(new THREE.Vector3(), new THREE.Vector3(cmd.target[0], cmd.target[1], cmd.target[2]))
    : null;
  if (area) {
    if (aimEng) area.lookAt(aimEng);
    else area.lookAt(ctx._engPos.x, ctx._engPos.y - 1, ctx._engPos.z);
  } else if (target) {
    if (aimEng) {
      target.position.copy(aimEng);
    } else {
      target.position.copy(cam.position);
      (light as THREE.Light).userData.targetFollowsCamera = true;
    }
    target.userData.excludeFromOriginShift = true;
    scene.add(target);
  }
  scene.add(light);
  ctx.markDynamicLightsDirty?.();
}

function setPostFx(cmd: Extract<AICommand, { type: 'set_post_fx' }>, ctx: CmdCtx): void {
  const p = ctx.viewport.pipeline;
  if (!p) return;

  if (cmd.bloom !== undefined && p.bloomPass) p.bloomPass.enabled = cmd.bloom;
  if (cmd.bloomStrength !== undefined && p.bloomPass) p.bloomPass.strength = cmd.bloomStrength;
  if (cmd.bloomRadius !== undefined && p.bloomPass) p.bloomPass.radius = cmd.bloomRadius;
  if (cmd.bloomThreshold !== undefined && p.bloomPass) p.bloomPass.threshold = cmd.bloomThreshold;

  if (cmd.outline !== undefined && p.outlinePass) p.outlinePass.enabled = cmd.outline;
  if (cmd.outlineThickness !== undefined && p.outlinePass) p.outlinePass.uniforms.thickness.value = cmd.outlineThickness;

  if (cmd.vignette !== undefined && p.vignettePass) p.vignettePass.enabled = cmd.vignette;
  if (cmd.vignetteIntensity !== undefined && p.vignettePass) p.vignettePass.uniforms.intensity.value = cmd.vignetteIntensity;

  if (cmd.colorGrade !== undefined && p.colorGradePass) p.colorGradePass.enabled = cmd.colorGrade;
  if (cmd.saturation !== undefined && p.colorGradePass) p.colorGradePass.uniforms.saturation.value = cmd.saturation;
  if (cmd.contrast !== undefined && p.colorGradePass) p.colorGradePass.uniforms.contrast.value = cmd.contrast;
  if (cmd.brightness !== undefined && p.colorGradePass) p.colorGradePass.uniforms.brightness.value = cmd.brightness;
  if (cmd.hueShift !== undefined && p.colorGradePass) p.colorGradePass.uniforms.hueShift.value = cmd.hueShift;

  if (cmd.chromaticAberration !== undefined && p.chromaticAberrationPass) p.chromaticAberrationPass.enabled = cmd.chromaticAberration;

  if (cmd.filmGrain !== undefined && p.filmGrainPass) p.filmGrainPass.enabled = cmd.filmGrain;
  if (cmd.filmGrainAmount !== undefined && p.filmGrainPass) p.filmGrainPass.uniforms.amount.value = cmd.filmGrainAmount;

  if (cmd.godRays !== undefined && p.godRaysPass) p.godRaysPass.enabled = cmd.godRays;
  if (cmd.godRaysStrength !== undefined && p.godRaysPass) p.godRaysPass.uniforms.strength.value = cmd.godRaysStrength;
  if (cmd.godRaysDensity !== undefined && p.godRaysPass) p.godRaysPass.uniforms.density.value = cmd.godRaysDensity;
  if (cmd.godRaysDecay !== undefined && p.godRaysPass) p.godRaysPass.uniforms.decay.value = cmd.godRaysDecay;
  if (cmd.godRaysWeight !== undefined && p.godRaysPass) p.godRaysPass.uniforms.weight.value = cmd.godRaysWeight;
  if (cmd.godRaysExposure !== undefined && p.godRaysPass) p.godRaysPass.uniforms.exposure.value = cmd.godRaysExposure;
  if (cmd.godRaysThreshold !== undefined && p.godRaysPass) p.godRaysPass.uniforms.threshold.value = cmd.godRaysThreshold;
  if (cmd.godRaysColor !== undefined && p.godRaysPass) p.godRaysPass.uniforms.tint.value.set(cmd.godRaysColor as THREE.ColorRepresentation);

  if (cmd.dof !== undefined && p.dofPass) p.dofPass.enabled = cmd.dof;
  if (cmd.dofFocusDistance !== undefined && p.dofPass) p.dofPass.uniforms.focusDistance.value = cmd.dofFocusDistance;
  if (cmd.dofFocusRange !== undefined && p.dofPass) p.dofPass.uniforms.focusRange.value = cmd.dofFocusRange;
  if (cmd.dofBokehScale !== undefined && p.dofPass) p.dofPass.uniforms.bokehScale.value = cmd.dofBokehScale;
  if (cmd.dofAutoFocus !== undefined && p.dofPass) p.dofPass.uniforms.autoFocus.value = cmd.dofAutoFocus ? 1 : 0;

  if (cmd.ssr !== undefined && p.ssrPass) p.ssrPass.enabled = cmd.ssr;
  if (cmd.ssrIntensity !== undefined && p.ssrPass) p.ssrPass.uniforms.intensity.value = cmd.ssrIntensity;
  if (cmd.ssrMaxDistance !== undefined && p.ssrPass) p.ssrPass.uniforms.maxDistance.value = cmd.ssrMaxDistance;
  if (cmd.ssrThickness !== undefined && p.ssrPass) p.ssrPass.uniforms.thickness.value = cmd.ssrThickness;
  if (cmd.ssrFresnel !== undefined && p.ssrPass) p.ssrPass.uniforms.fresnelPower.value = cmd.ssrFresnel;

  if (cmd.volumetricFog !== undefined && p.volumetricFogPass) p.volumetricFogPass.enabled = cmd.volumetricFog;
  if (cmd.fogDensity !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.density.value = cmd.fogDensity;
  if (cmd.fogColor !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.fogColor.value.set(cmd.fogColor as THREE.ColorRepresentation);
  if (cmd.fogColorSun !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.sunColor.value.set(cmd.fogColorSun as THREE.ColorRepresentation);
  if (cmd.fogHeight !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.fogBaseHeight.value = cmd.fogHeight;
  if (cmd.fogHeightFalloff !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.heightFalloff.value = cmd.fogHeightFalloff;
  if (cmd.fogScattering !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.scattering.value = cmd.fogScattering;
  if (cmd.fogAnisotropy !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.anisotropy.value = cmd.fogAnisotropy;
  if (cmd.fogMaxDistance !== undefined && p.volumetricFogPass) p.volumetricFogPass.uniforms.maxDistance.value = cmd.fogMaxDistance;

  if (cmd.motionBlur !== undefined && p.motionBlurPass) p.motionBlurPass.enabled = cmd.motionBlur;
  if (cmd.motionBlurIntensity !== undefined && p.motionBlurPass) p.motionBlurPass.uniforms.intensity.value = cmd.motionBlurIntensity;
  if (cmd.motionBlurMax !== undefined && p.motionBlurPass) p.motionBlurPass.uniforms.maxVelocity.value = cmd.motionBlurMax;

  if (cmd.contactShadows !== undefined && p.contactShadowsPass) p.contactShadowsPass.enabled = cmd.contactShadows;
  if (cmd.contactShadowIntensity !== undefined && p.contactShadowsPass) p.contactShadowsPass.uniforms.intensity.value = cmd.contactShadowIntensity;
  if (cmd.contactShadowDistance !== undefined && p.contactShadowsPass) p.contactShadowsPass.uniforms.maxDistance.value = cmd.contactShadowDistance;

  if (cmd.autoExposure !== undefined && p.autoExposurePass) p.autoExposurePass.enabled = cmd.autoExposure;
  if (cmd.exposureKey !== undefined && p.autoExposurePass) p.autoExposurePass.uniforms.key.value = cmd.exposureKey;
  if (cmd.exposureMin !== undefined && p.autoExposurePass) p.autoExposurePass.uniforms.minExposure.value = cmd.exposureMin;
  if (cmd.exposureMax !== undefined && p.autoExposurePass) p.autoExposurePass.uniforms.maxExposure.value = cmd.exposureMax;
  if (cmd.exposureSpeed !== undefined && p.autoExposurePass) p.autoExposurePass.uniforms.speed.value = cmd.exposureSpeed;

  if (cmd.taa !== undefined) p.setTemporalAA(cmd.taa);
  if (cmd.taaFeedback !== undefined && p.taaPass) p.taaPass.uniforms.feedback.value = cmd.taaFeedback;
}

function setSkyEnvironment(cmd: Extract<AICommand, { type: 'set_sky_environment' }>, ctx: CmdCtx): void {
  const sky = ctx.viewport?.skyEnv;
  if (!sky) return;

  if (cmd.elevationDeg !== undefined || cmd.azimuthDeg !== undefined) {
    const elev = cmd.elevationDeg !== undefined ? cmd.elevationDeg : 26;
    const azim = cmd.azimuthDeg !== undefined ? cmd.azimuthDeg : 150;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    sky.setSunDirection(dir, ctx.viewport.scene);
  }

  if (cmd.fogDensity !== undefined) {
    sky.setFogDensity(cmd.fogDensity, ctx.viewport.scene);
  }
  if (cmd.fogColor !== undefined) {
    sky.setFogColor(cmd.fogColor, ctx.viewport.scene);
  }
}

function setEnvironment(cmd: Extract<AICommand, { type: 'set_environment' }>, ctx: CmdCtx): void {
  const vp = ctx.viewport;
  if (!vp) return;
  if (cmd.sky) {
    vp.useProceduralSky();
  } else if (cmd.hdri) {
    void ctx.trackAsync(
      vp.setEnvironmentHDRI(cmd.hdri, {
        background: cmd.background,
        intensity: cmd.environmentIntensity,
        blurriness: cmd.backgroundBlurriness,
      }).catch((err) => console.warn('[AIBridge] set_environment: HDRI load failed:', err)),
    );
  }
  vp.setEnvironmentParams({
    environmentIntensity: cmd.environmentIntensity,
    backgroundIntensity: cmd.backgroundIntensity,
    backgroundBlurriness: cmd.backgroundBlurriness,
  });
}
