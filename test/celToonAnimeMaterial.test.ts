import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CelToonMaterial } from '../src/materials/CelToonMaterial';
import { AnimeLightingContext } from '../src/rendering/anime/AnimeLightingContext';
import { AnimeMaterialFamily } from '../src/materials/AnimeMaterialFamily';

describe('CelToonMaterial', () => {
  it('instantiates with backwards-compatible standard parameters', () => {
    const mat = new CelToonMaterial({
      color: 0xff0000,
      roughness: 0.5,
      metalness: 0.1,
    });

    expect(mat.color.getHex()).toBe(0xff0000);
    expect(mat.roughness).toBe(0.5);
    expect(mat.metalness).toBe(0.1);
    expect(mat.uniforms.uSurfaceMode.value).toBe(0); // standard
    expect(mat.uniforms.uShadowThreshold.value).toBe(0.5);
    expect(mat.uniforms.uShadowSoftness.value).toBe(0.05);
  });

  it('supports semantic surface modes', () => {
    const mat = new CelToonMaterial();

    mat.setSurface('face');
    expect(mat.uniforms.uSurfaceMode.value).toBe(2);

    mat.setSurface('hair');
    expect(mat.uniforms.uSurfaceMode.value).toBe(3);

    mat.setSurface('eye');
    expect(mat.uniforms.uSurfaceMode.value).toBe(4);

    mat.setSurface('cloth');
    expect(mat.uniforms.uSurfaceMode.value).toBe(5);

    mat.setSurface('stylized_metal');
    expect(mat.uniforms.uSurfaceMode.value).toBe(6);

    mat.setSurface('skin');
    expect(mat.uniforms.uSurfaceMode.value).toBe(1);
  });

  it('configures Face SDF directional shading parameters', () => {
    const mat = new CelToonMaterial({ surface: 'face' });
    const dummySdf = new THREE.Texture();
    mat.setFaceSdf(dummySdf, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));

    expect(mat.uniforms.uUseFaceSdf.value).toBe(1.0);
    expect(mat.uniforms.tFaceSdf.value).toBe(dummySdf);
    expect(mat.uniforms.uFaceForward.value.z).toBe(1);
    expect(mat.uniforms.uFaceRight.value.x).toBe(1);
  });

  it('configures graphic anime hair highlight band', () => {
    const mat = new CelToonMaterial({
      surface: 'hair',
      hairHighlightStrength: 0.9,
      hairHighlightCenter: 0.45,
      hairHighlightWidth: 0.12,
    });

    expect(mat.uniforms.uHairHighlightStrength.value).toBe(0.9);
    expect(mat.uniforms.uHairHighlightCenter.value).toBe(0.45);
    expect(mat.uniforms.uHairHighlightWidth.value).toBe(0.12);
  });

  it('configures eye catchlights and high readability', () => {
    const mat = new CelToonMaterial({
      surface: 'eye',
      eyeCatchlightStrength: 1.0,
      eyeReadabilityBoost: 0.6,
    });

    expect(mat.uniforms.uEyeCatchlightStrength.value).toBe(1.0);
    expect(mat.uniforms.uEyeReadabilityBoost.value).toBe(0.6);
  });

  it('provides a detailed plain-text description without requiring visual inspection', () => {
    const mat = new CelToonMaterial({
      surface: 'skin',
      color: 0xffdfc4,
      shadowThreshold: 0.45,
      rimIntensity: 0.8,
    });

    const desc = mat.describe();
    expect(desc).toContain('CelToonMaterial');
    expect(desc).toContain('Surface Mode: skin');
    expect(desc).toContain('Base Color');
    expect(desc).toContain('Threshold: 0.45');
    expect(desc).toContain('Intensity: 0.80');
  });
});

describe('AnimeLightingContext', () => {
  it('broadcasts primary directional sun, fill, shadow tint, and rim light to character shaders', () => {
    const ctx = AnimeLightingContext.get();
    const sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
    const sunColor = new THREE.Color('#fff4e0');
    const shadowTint = new THREE.Color('#221a38');

    ctx.setSun(sunDir, sunColor, 2.0);
    ctx.setShadowTint(shadowTint);
    ctx.setRim(new THREE.Color('#88aaff'), 1.2);

    const mat = new CelToonMaterial({ surface: 'cloth' });
    mat.syncWithLightingContext();

    expect(mat.uniforms.uSunDirection.value.x).toBeCloseTo(sunDir.x, 3);
    expect(mat.uniforms.uSunDirection.value.y).toBeCloseTo(sunDir.y, 3);
    expect(mat.uniforms.uSunDirection.value.z).toBeCloseTo(sunDir.z, 3);
    expect(mat.uniforms.uShadowColor.value.r).toBeCloseTo(shadowTint.r, 2);
    expect(mat.uniforms.uRimColor.value.b).toBeCloseTo(new THREE.Color('#88aaff').b, 2);
  });
});

describe('AnimeMaterialFamily', () => {
  it('creates specialized character materials from factory methods', () => {
    const skin = AnimeMaterialFamily.createSkin({ skinColor: '#ffd1b3' });
    expect(skin.uniforms.uSurfaceMode.value).toBe(1);

    const hair = AnimeMaterialFamily.createHair({ hairColor: '#332255', highlightStrength: 0.8 });
    expect(hair.uniforms.uSurfaceMode.value).toBe(3);

    const eye = AnimeMaterialFamily.createEye({ eyeColor: '#2266cc' });
    expect(eye.uniforms.uSurfaceMode.value).toBe(4);

    const metal = AnimeMaterialFamily.createStylizedMetal({ metalColor: '#cccccc' });
    expect(metal.uniforms.uSurfaceMode.value).toBe(6);
  });

  it('traverses character hierarchy and converts materials according to mesh semantics', () => {
    const root = new THREE.Group();
    root.name = 'Hero_Character';

    const head = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: 'Head_Skin' }));
    head.name = 'Head_Mesh';

    const hair = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: 'Hair_Strands' }));
    hair.name = 'Hair_Mesh';

    const eyeLeft = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: 'Eye_L' }));
    eyeLeft.name = 'Eye_L';

    const armor = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: 'Chest_Cloth' }));
    armor.name = 'Cloth_Body';

    root.add(head);
    root.add(hair);
    root.add(eyeLeft);
    root.add(armor);

    const result = AnimeMaterialFamily.applyToCharacter(root, {
      skinColor: '#ffd5c0',
      hairColor: '#441166',
      eyeColor: '#00aaff',
      clothColor: '#222233',
    });

    expect(result.converted).toBe(4);
    expect(head.material).toBeInstanceOf(CelToonMaterial);
    expect((head.material as CelToonMaterial).uniforms.uSurfaceMode.value).toBe(1); // skin
    expect((hair.material as CelToonMaterial).uniforms.uSurfaceMode.value).toBe(3); // hair
    expect((eyeLeft.material as CelToonMaterial).uniforms.uSurfaceMode.value).toBe(4); // eye
    expect((armor.material as CelToonMaterial).uniforms.uSurfaceMode.value).toBe(5); // cloth
  });
});
