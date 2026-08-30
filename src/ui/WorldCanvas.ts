import * as THREE from 'three';

export type BillboardMode = 'none' | 'camera' | 'yaw_only';

export interface WorldCanvasConfig {
  width?: number; // meters in 3D world (default 1.0)
  height?: number; // meters in 3D world (default 1.0)
  resolution?: [number, number]; // pixel resolution (default [512, 512])
  billboard?: BillboardMode;
  doubleSided?: boolean;
}

export class WorldCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
  readonly width: number;
  readonly height: number;
  billboard: BillboardMode;

  private readonly _camPos = new THREE.Vector3();
  private readonly _worldPos = new THREE.Vector3();

  constructor(config: WorldCanvasConfig = {}) {
    this.width = config.width ?? 1.0;
    this.height = config.height ?? 1.0;
    this.billboard = config.billboard ?? 'none';

    const res = config.resolution ?? [512, 512];
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = res[0];
      this.canvas.height = res[1];
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to obtain 2D canvas context for WorldCanvas');
      this.ctx = ctx;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.canvas = {
        width: res[0],
        height: res[1],
        getContext: () => null,
      } as unknown as HTMLCanvasElement;
      this.ctx = {
        font: '',
        textAlign: 'center',
        textBaseline: 'middle',
        fillStyle: '',
        measureText: () => ({ width: 100 }),
        fillText: () => {},
        fillRect: () => {},
        clearRect: () => {},
      } as unknown as CanvasRenderingContext2D;
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const geo = new THREE.PlaneGeometry(this.width, this.height);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: config.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
  }

  draw(renderFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void): void {
    renderFn(this.ctx, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  drawText(
    text: string,
    x: number,
    y: number,
    options: {
      color?: string;
      font?: string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      background?: string;
      padding?: number;
    } = {},
  ): void {
    this.ctx.font = options.font ?? 'bold 32px sans-serif';
    this.ctx.textAlign = options.align ?? 'center';
    this.ctx.textBaseline = options.baseline ?? 'middle';

    if (options.background) {
      const metrics = this.ctx.measureText(text);
      const pad = options.padding ?? 8;
      const textWidth = metrics.width;
      const textHeight = 36;
      let bgX = x;
      if (this.ctx.textAlign === 'center') bgX = x - textWidth / 2;
      else if (this.ctx.textAlign === 'right') bgX = x - textWidth;
      const bgY = y - textHeight / 2;
      this.ctx.fillStyle = options.background;
      this.ctx.fillRect(bgX - pad, bgY - pad, textWidth + pad * 2, textHeight + pad * 2);
    }

    this.ctx.fillStyle = options.color ?? '#ffffff';
    this.ctx.fillText(text, x, y);
    this.texture.needsUpdate = true;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  private static readonly _yAxis = new THREE.Vector3(0, 1, 0);

  update(camera: THREE.Camera): void {
    if (this.billboard === 'none') return;

    if (this.billboard === 'camera') {
      this.mesh.quaternion.copy(camera.quaternion);
    } else if (this.billboard === 'yaw_only') {
      camera.getWorldPosition(this._camPos);
      this.mesh.getWorldPosition(this._worldPos);
      const angle = Math.atan2(this._camPos.x - this._worldPos.x, this._camPos.z - this._worldPos.z);
      this.mesh.quaternion.setFromAxisAngle(WorldCanvas._yAxis, angle);
    }
  }

  dispose(): void {
    this.texture.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}
