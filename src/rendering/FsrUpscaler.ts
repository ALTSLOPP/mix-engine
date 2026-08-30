import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { fsrCopyShader, fsrEasuShader, fsrRcasShader, fsrVertexShader } from './FsrShaders';

/** Final presentation stage, outside the internal-resolution HDR composer. */
export class FsrUpscaler {
  private readonly easu = this.material(fsrEasuShader);
  private readonly rcas = this.material(fsrRcasShader);
  private readonly copy = this.material(fsrCopyShader);
  private readonly quad = new FullScreenQuad(this.copy);
  private intermediate?: THREE.WebGLRenderTarget;
  private width = 1;
  private height = 1;
  enabled = true;
  sharpness = 0.35;

  private material(fragmentShader: string): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: fsrVertexShader, fragmentShader,
      uniforms: { tInput: { value: null }, inputSize: { value: new THREE.Vector2(1, 1) }, sharpness: { value: 0.35 } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.intermediate?.setSize(width, height);
  }

  configure(enabled: boolean, sharpness: number): void {
    this.enabled = enabled;
    this.sharpness = sharpness;
    if (!enabled || sharpness === 0) this.releaseTarget();
  }

  private releaseTarget(): void {
    this.intermediate?.dispose();
    this.intermediate = undefined;
  }

  render(renderer: THREE.WebGLRenderer, input: THREE.WebGLRenderTarget): void {
    const upscale = this.enabled && input.width <= this.width && input.height <= this.height
      && (input.width < this.width || input.height < this.height);
    const sharpen = upscale && this.sharpness > 0;
    const previous = renderer.getRenderTarget();
    try {
      if (sharpen && !this.intermediate) {
        // Only one extra output-size RGBA8 allocation (~5.5 MiB at 1600x900).
        this.intermediate = new THREE.WebGLRenderTarget(this.width, this.height, {
          type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
          colorSpace: THREE.NoColorSpace,
        });
      } else if (!sharpen) this.releaseTarget();
      const first = upscale ? this.easu : this.copy;
      first.uniforms.tInput.value = input.texture;
      first.uniforms.inputSize.value.set(input.width, input.height);
      this.quad.material = first;
      renderer.setRenderTarget(sharpen ? this.intermediate! : null);
      this.quad.render(renderer);
      if (sharpen) {
        this.rcas.uniforms.tInput.value = this.intermediate!.texture;
        this.rcas.uniforms.inputSize.value.set(this.width, this.height);
        this.rcas.uniforms.sharpness.value = this.sharpness;
        this.quad.material = this.rcas;
        renderer.setRenderTarget(null);
        this.quad.render(renderer);
      }
    } finally {
      renderer.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.releaseTarget();
    this.easu.dispose();
    this.rcas.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
