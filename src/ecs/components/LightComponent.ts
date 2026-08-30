import * as THREE from 'three';
import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export type LightType = 'point' | 'directional' | 'spot' | 'area';

/**
 * Standard Light component for illuminating the scene from an entity.
 */
export class LightComponent extends Component {
  static override readonly type = 'light';

  @expose({
    type: 'enum',
    options: ['point', 'directional', 'spot', 'area'],
    doc: 'Type of light source',
    default: 'point',
  })
  lightType: LightType = 'point';

  @expose({ type: 'string', doc: 'Light color hex or CSS color', default: '#ffffff' })
  color = '#ffffff';

  @expose({ type: 'number', min: 0, max: 100, doc: 'Light luminous intensity', default: 2.0 })
  intensity = 2.0;

  @expose({ type: 'number', min: 0, max: 500, doc: 'Maximum range of the light (0 = infinite)', default: 10 })
  distance = 10;

  @expose({ type: 'number', min: 0, max: 5, doc: 'Light attenuation decay rate', default: 2 })
  decay = 2;

  @expose({ type: 'bool', doc: 'Whether the light casts real-time shadows', default: false })
  castShadow = false;

  @expose({ type: 'number', min: -0.01, max: 0.01, step: 0.0001, doc: 'Shadow camera bias', default: -0.0005 })
  shadowBias = -0.0005;

  @expose({ type: 'number', min: 1, max: 179, doc: 'Spot cone angle in degrees', default: 45 })
  spotAngle = 45;

  @expose({ type: 'number', min: 0, max: 1, step: 0.05, doc: 'Spot cone edge softness', default: 0.5 })
  penumbra = 0.5;

  @expose({ type: 'number', min: 0.01, max: 100, doc: 'Rectangular area-light width', default: 2 })
  areaWidth = 2;

  @expose({ type: 'number', min: 0.01, max: 100, doc: 'Rectangular area-light height', default: 2 })
  areaHeight = 2;

  @expose({ type: 'number', min: 0, max: 31, doc: 'Three.js light layer index', default: 0 })
  layer = 0;

  private lightObject: THREE.Light | null = null;
  private builtLightType: LightType | null = null;
  private appliedColor: string | null = null;

  override onAwake(): void {
    this.rebuildLight();
  }

  override onEnable(): void {
    if (this.lightObject) {
      this.lightObject.visible = true;
    }
  }

  override onDisable(): void {
    if (this.lightObject) {
      this.lightObject.visible = false;
    }
  }

  override onDestroy(): void {
    if (this.lightObject && this.lightObject.parent) {
      this.lightObject.parent.remove(this.lightObject);
      if ('dispose' in this.lightObject && typeof (this.lightObject as any).dispose === 'function') {
        (this.lightObject as any).dispose();
      }
    }
    this.lightObject = null;
  }

  override onUpdate(_dt: number): void {
    if (!this.lightObject) {
      this.rebuildLight();
      return;
    }

    // Switching lightType in the inspector must swap the THREE.Light instance —
    // previously a point light stayed a point light no matter what the field said.
    if (this.builtLightType !== this.lightType) {
      this.rebuildLight();
      return;
    }

    // Only re-parse the colour when it actually changes: THREE.Color.set(string)
    // runs a full CSS colour parse, and this ran per light, per frame.
    if (this.appliedColor !== this.color) {
      this.lightObject.color.set(this.color);
      this.appliedColor = this.color;
    }
    this.lightObject.intensity = this.intensity;
    this.lightObject.castShadow = this.castShadow;
    this.lightObject.layers.set(Math.max(0, Math.min(31, Math.floor(this.layer))));

    if (this.lightObject instanceof THREE.PointLight || this.lightObject instanceof THREE.SpotLight) {
      this.lightObject.distance = this.distance;
      this.lightObject.decay = this.decay;
    }
    if (this.lightObject instanceof THREE.SpotLight) {
      this.lightObject.angle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(this.spotAngle, 1, 179));
      this.lightObject.penumbra = THREE.MathUtils.clamp(this.penumbra, 0, 1);
    }
    if (this.lightObject instanceof THREE.RectAreaLight) {
      this.lightObject.width = Math.max(0.01, this.areaWidth);
      this.lightObject.height = Math.max(0.01, this.areaHeight);
    }

    if (this.castShadow && this.lightObject.shadow) {
      this.lightObject.shadow.bias = this.shadowBias;
    }
  }

  private rebuildLight(): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!rb || !rb.mesh) return;

    if (this.lightObject && this.lightObject.parent) {
      this.lightObject.parent.remove(this.lightObject);
    }

    const threeColor = new THREE.Color(this.color);
    switch (this.lightType) {
      case 'directional': {
        const dirLight = new THREE.DirectionalLight(threeColor, this.intensity);
        dirLight.castShadow = this.castShadow;
        this.lightObject = dirLight;
        break;
      }
      case 'spot': {
        const spotLight = new THREE.SpotLight(threeColor, this.intensity, this.distance, THREE.MathUtils.degToRad(this.spotAngle), this.penumbra, this.decay);
        spotLight.castShadow = this.castShadow;
        this.lightObject = spotLight;
        break;
      }
      case 'area': {
        this.lightObject = new THREE.RectAreaLight(threeColor, this.intensity, this.areaWidth, this.areaHeight);
        break;
      }
      case 'point':
      default: {
        const pointLight = new THREE.PointLight(threeColor, this.intensity, this.distance, this.decay);
        pointLight.castShadow = this.castShadow;
        this.lightObject = pointLight;
        break;
      }
    }

    this.builtLightType = this.lightType;
    this.appliedColor = this.color;
    this.lightObject.visible = this.enabled;
    this.lightObject.layers.set(Math.max(0, Math.min(31, Math.floor(this.layer))));
    rb.mesh.add(this.lightObject);
  }
}
