import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

/** Selects an entity as the spatial-audio listener instead of the render camera. */
export class AudioListenerComponent extends Component {
  static override readonly type = 'audioListener';

  @expose({ type: 'bool', doc: 'Make this entity the active audio listener', default: true })
  primary = true;

  override onAwake(): void { this.apply(); }
  override onEnable(): void { this.apply(); }
  override onUpdate(): void { this.apply(); }

  override onDisable(): void {
    if (this.primary) this.ctx.audio?.setListenerObject(null);
  }

  override onDestroy(): void { this.onDisable(); }

  private apply(): void {
    if (!this.enabled || !this.primary || !this.ctx.audio) return;
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (rb) this.ctx.audio.setListenerObject(rb.mesh);
  }
}
