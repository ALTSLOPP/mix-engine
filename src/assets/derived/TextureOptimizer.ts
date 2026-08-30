/**
 * TextureOptimizer.ts — Non-destructive texture optimization and semantic color-space tagging.
 */

import * as THREE from 'three';

export interface TextureOptimizeOptions {
  maxDimension?: number; // e.g. 1024 or 512
  generateMipmaps?: boolean;
  semanticHint?: string; // 'baseColor' | 'normal' | 'roughness' | 'metallic' | 'faceSdf' | 'emissive'
}

export class TextureOptimizer {
  /**
   * Determine exact color space based on texture name and semantic usage.
   * NEVER apply sRGB transformations to data/normal/SDF maps!
   */
  static classifyColorSpace(nameOrSemantic: string): THREE.ColorSpace {
    const s = nameOrSemantic.toLowerCase();
    if (
      s.includes('normal') ||
      s.includes('norm') ||
      s.includes('roughness') ||
      s.includes('rough') ||
      s.includes('metallic') ||
      s.includes('metal') ||
      s.includes('ao') ||
      s.includes('occlusion') ||
      s.includes('mask') ||
      s.includes('sdf') ||
      s.includes('depth') ||
      s.includes('height')
    ) {
      return THREE.NoColorSpace; // Linear data
    }
    return THREE.SRGBColorSpace; // Color data (baseColor, diffuse, emissive)
  }

  /**
   * Computes power-of-two capped dimensions maintaining aspect ratio.
   */
  static downscaleDimensions(width: number, height: number, maxDimension = 1024): { width: number; height: number } {
    if (![width, height, maxDimension].every(n => Number.isFinite(n) && n > 0)) {
      throw new Error('Texture dimensions must be finite and positive.');
    }
    maxDimension = Math.max(1, Math.floor(maxDimension));
    if (width <= maxDimension && height <= maxDimension) {
      return { width, height };
    }
    const aspect = width / height;
    if (width >= height) {
      const w = maxDimension;
      const h = Math.max(1, Math.round(maxDimension / aspect));
      return { width: w, height: h };
    } else {
      const h = maxDimension;
      const w = Math.max(1, Math.round(maxDimension * aspect));
      return { width: w, height: h };
    }
  }

  /**
   * Clone and optimize texture configuration without altering source texture.
   */
  static optimizeTexture(sourceTexture: THREE.Texture, opts: TextureOptimizeOptions = {}): THREE.Texture {
    const clone = sourceTexture.clone();
    const maxDim = opts.maxDimension ?? 1024;
    const name = opts.semanticHint ?? sourceTexture.name ?? '';

    clone.colorSpace = this.classifyColorSpace(name);
    clone.generateMipmaps = opts.generateMipmaps ?? true;
    clone.minFilter = clone.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    clone.magFilter = THREE.LinearFilter;

    // A clone shares Texture.source. Replace it before assigning derived pixels.
    const img = sourceTexture.image as { width?: number; height?: number } | undefined;
    if (img && img.width && img.height) {
      const scaled = this.downscaleDimensions(img.width, img.height, maxDim);
      clone.userData.requestedResolution = scaled;
      if (scaled.width !== img.width || scaled.height !== img.height) {
        const resized = this.resizeImage(sourceTexture, scaled.width, scaled.height);
        if (resized) {
          clone.source = new THREE.Source(resized);
          clone.mipmaps = [];
        } else {
          clone.userData.optimizationSkipped = 'Texture pixels cannot be resampled in this environment or format';
        }
      }
      clone.userData.derivedResolution = { width: clone.image.width, height: clone.image.height };
    }

    clone.needsUpdate = true;
    return clone;
  }

  private static resizeImage(texture: THREE.Texture, width: number, height: number): unknown {
    const special = texture as THREE.Texture & { isCompressedTexture?: boolean; isDepthTexture?: boolean; isCubeTexture?: boolean; isVideoTexture?: boolean };
    if (special.isCompressedTexture || special.isDepthTexture || special.isCubeTexture || special.isVideoTexture || texture.isRenderTargetTexture) return null;
    if ((texture as THREE.DataTexture).isDataTexture) {
      const source = texture.image as { data: THREE.TypedArray; width: number; height: number };
      const channels = texture.format === THREE.RGBAFormat ? 4 : texture.format === THREE.RGFormat ? 2 : texture.format === THREE.RedFormat ? 1 : 0;
      if (!channels || !source.data || source.data.length !== source.width * source.height * channels) return null;
      const ArrayType = source.data.constructor as { new(length: number): THREE.TypedArray };
      const data = new ArrayType(width * height * channels);
      // Pixel-center nearest sampling also preserves packed half-float and integer data encodings.
      for (let y = 0; y < height; y++) {
        const sy = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / height));
        for (let x = 0; x < width; x++) {
          const sx = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / width));
          const from = (sy * source.width + sx) * channels;
          data.set(source.data.subarray(from, from + channels), (y * width + x) * channels);
        }
      }
      return { data, width, height };
    }
    try {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
        : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (!canvas) return null;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!context) return null;
      context.drawImage(texture.image, 0, 0, width, height);
      return canvas;
    } catch {
      return null; // Preserve the source and report actual dimensions; never claim fictitious savings.
    }
  }
}
