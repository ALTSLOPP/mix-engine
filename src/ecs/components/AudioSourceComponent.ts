import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export type AudioBusType = 'master' | 'sfx' | 'bgm' | 'voice' | 'ui';

/**
 * AudioSource component allowing an entity to emit spatial or 2D sounds.
 */
export class AudioSourceComponent extends Component {
  static override readonly type = 'audioSource';

  @expose({ type: 'string', doc: 'Audio asset URL or path under public/audio/', default: '' })
  src = '';

  @expose({ type: 'number', min: 0, max: 1, step: 0.05, doc: 'Audio playback volume', default: 1.0 })
  volume = 1.0;

  @expose({ type: 'bool', doc: 'Loop playback continuously', default: false })
  loop = false;

  @expose({ type: 'bool', doc: 'Enable 3D spatial positional audio', default: true })
  spatial = true;

  @expose({ type: 'number', min: 0.1, max: 100, doc: 'Reference distance for spatial attenuation (metres)', default: 1.0 })
  refDistance = 1.0;

  @expose({ type: 'number', min: 1, max: 1000, doc: 'Maximum audible distance (metres)', default: 50.0 })
  maxDistance = 50.0;

  @expose({
    type: 'enum',
    options: ['sfx', 'bgm', 'voice', 'ui', 'master'],
    doc: 'Target audio mixer bus',
    default: 'sfx',
  })
  bus: AudioBusType = 'sfx';

  @expose({ type: 'bool', doc: 'Automatically play on start', default: false })
  autoPlay = false;

  private isPlaying = false;

  override onStart(): void {
    if (this.autoPlay && this.src) {
      this.play();
    }
  }

  override onDisable(): void {
    if (this.isPlaying) {
      this.stop();
    }
  }

  override onDestroy(): void {
    this.stop();
  }

  play(): void {
    if (!this.src) return;
    const audio = this.ctx.audio ?? (typeof window !== 'undefined' ? (window as any).engine?.audio : undefined);
    if (!audio) return;

    // AudioManager exposes attachToEntity/play/stop — there is no attachSound,
    // playSound or stopAttached, so this threw a TypeError on every autoPlay source.
    if (this.spatial) {
      void audio.attachToEntity(this.entity, this.src, {
        volume: this.volume,
        loop: this.loop,
        refDistance: this.refDistance,
        maxDistance: this.maxDistance,
        bus: this.bus,
      });
    } else {
      void audio.play(this.src, {
        volume: this.volume,
        loop: this.loop,
        bus: this.bus,
      });
    }
    this.isPlaying = true;
  }

  stop(): void {
    const audio = this.ctx.audio ?? (typeof window !== 'undefined' ? (window as any).engine?.audio : undefined);
    if (audio && this.spatial) audio.stop({ entityId: this.entity });
    this.isPlaying = false;
  }
}
