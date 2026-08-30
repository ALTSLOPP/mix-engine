import * as THREE from 'three';
import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';
import { ParticleEmitter, type VfxPresetName } from '../../vfx/ParticleEmitter';

export type ParticlePresetType = 'fire' | 'smoke' | 'sparks' | 'dust' | 'explosion';

/**
 * ParticleEmitter component for attaching procedural particle VFX to an entity.
 */
export class ParticleEmitterComponent extends Component {
  static override readonly type = 'particleEmitter';

  @expose({
    type: 'enum',
    options: ['fire', 'smoke', 'sparks', 'dust', 'explosion'],
    doc: 'VFX Particle preset configuration',
    default: 'fire',
  })
  preset: ParticlePresetType = 'fire';

  @expose({ type: 'number', min: 1, max: 1000, doc: 'Emission rate (particles per second)', default: 25 })
  rate = 25;

  @expose({ type: 'number', min: 10, max: 2000, doc: 'Maximum concurrent particle capacity', default: 200 })
  maxParticles = 200;

  @expose({ type: 'bool', doc: 'Automatically begin emission on start', default: true })
  autoStart = true;

  @expose({ type: 'string', doc: 'Primary particle color tint hex', default: '#ff7700' })
  color = '#ff7700';

  @expose({ type: 'number', min: 0.05, max: 5.0, step: 0.05, doc: 'Base particle size (metres)', default: 0.2 })
  size = 0.2;

  @expose({ type: 'number', min: 0.1, max: 10.0, step: 0.1, doc: 'Particle lifetime duration (seconds)', default: 1.5 })
  lifetime = 1.5;

  private emitter: ParticleEmitter | null = null;
  private appliedSignature = '';

  override onAwake(): void {
    this.rebuildEmitter();
  }

  override onEnable(): void {
    if (this.emitter) {
      this.emitter.points.visible = true;
    }
  }

  override onDisable(): void {
    if (this.emitter) {
      this.emitter.points.visible = false;
    }
  }

  override onDestroy(): void {
    if (this.emitter) {
      this.emitter.dispose();
      this.emitter = null;
    }
  }

  override onUpdate(dt: number): void {
    const signature = `${this.preset}|${this.rate}|${this.maxParticles}|${this.autoStart}|${this.color}|${this.size}|${this.lifetime}`;
    if (signature !== this.appliedSignature) this.rebuildEmitter();
    if (!this.emitter) return;

    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (rb && rb.mesh) {
      this.emitter.points.position.copy(rb.mesh.position);
    }
    this.emitter.update(dt);
  }

  private rebuildEmitter(): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!rb || !rb.mesh) return;

    if (this.emitter) {
      this.emitter.dispose();
      this.emitter = null;
    }

    const scene = (rb.mesh.parent as THREE.Scene) || (window as any).engine?.viewport?.scene;
    if (!scene) return;

    const spawnPos = rb.mesh.position.clone();
    this.emitter = new ParticleEmitter(scene, spawnPos, {
      preset: this.preset as VfxPresetName,
      maxParticles: this.maxParticles,
      loop: this.autoStart,
      rate: this.rate,
      color: this.color,
      size: this.size,
      lifetime: this.lifetime,
    });

    this.appliedSignature = `${this.preset}|${this.rate}|${this.maxParticles}|${this.autoStart}|${this.color}|${this.size}|${this.lifetime}`;

    this.emitter.points.visible = this.enabled;
  }
}
