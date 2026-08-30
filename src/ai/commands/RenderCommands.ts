import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('set_time_of_day', (cmd: Extract<AICommand, { type: 'set_time_of_day' }>) => {
    ctx.setTimeOfDay(cmd.hour);
  });

  map.set('day_night_cycle', (cmd: Extract<AICommand, { type: 'day_night_cycle' }>) => {
    if (!ctx.dayNight) { console.warn('[AIBridge] day_night_cycle: unavailable'); return; }
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
