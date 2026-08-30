import { VirtualPak, type PakFileItem } from './VirtualPak';
import { AssetCooker } from './AssetCooker';
import type { CookReport } from './AssetCooker';

export interface GamePackageManifest {
  version: string;
  gameTitle: string;
  entryScene: string;
  scenes: Record<string, unknown>;
  visualStyle?: string;
  inputActions?: unknown[];
  gameplayRules?: unknown[];
  assets: string[];
  created: number;
}

export interface PackageOptions {
  title?: string;
  entryScene?: string;
  scenes?: Record<string, unknown>;
  visualStyle?: string;
  inputActions?: unknown[];
  gameplayRules?: unknown[];
  referencedAssets?: string[];
  encryptPak?: boolean;
}

/**
 * GamePackager.ts — Compiles scenes, manifests, and assets into standalone distribution builds.
 */
export class GamePackager {
  static createBundle(options: PackageOptions): GamePackageManifest {
    const assets = Array.from(new Set(options.referencedAssets ?? []));

    return {
      version: '1.0.0',
      gameTitle: options.title ?? 'MIX Engine Game',
      entryScene: options.entryScene ?? 'main',
      scenes: options.scenes ?? {},
      visualStyle: options.visualStyle ?? 'default',
      inputActions: options.inputActions ?? [],
      gameplayRules: options.gameplayRules ?? [],
      assets,
      created: Date.now(),
    };
  }

  /**
   * Build a single binary .pak archive bundling the manifest and all associated assets.
   */
  static buildBinaryPak(
    options: PackageOptions,
    rawAssetFiles: PakFileItem[] = [],
  ): { manifest: GamePackageManifest; pakBytes: Uint8Array; cookReport: CookReport } {
    const manifest = this.createBundle(options);
    const encoder = new TextEncoder();

    const cooker = new AssetCooker();
    // Asset tree shaking: when the manifest declares references, package only those
    // files. Normalize leading './' and '/' so scene-authored URLs match archive paths.
    const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
    const referenced = new Set(manifest.assets.map(normalize));
    const selectedFiles = referenced.size > 0
      ? rawAssetFiles.filter((file) => referenced.has(normalize(file.path)))
      : rawAssetFiles;
    const { cookedFiles, report: cookReport } = cooker.cookAll(selectedFiles);

    const pakFiles: PakFileItem[] = [
      {
        path: 'manifest.json',
        data: encoder.encode(JSON.stringify(manifest, null, 2)),
      },
      ...cookedFiles,
    ];

    const pakBytes = VirtualPak.pack(pakFiles, options.encryptPak ?? false);

    return {
      manifest,
      pakBytes,
      cookReport,
    };
  }

  /**
   * Generates a self-contained HTML shell for web standalone distribution.
   */
  /** Escape a value destined for HTML text content / attribute context. */
  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static generateWebStandaloneHtml(rawTitle: string): string {
    // A game title carrying `</title><script>` used to land in the shipped shell
    // verbatim, so an AI- or user-supplied name became script in the build output.
    const title = this.escapeHtml(rawTitle);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
    #canvas-container { width: 100%; height: 100%; position: absolute; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <script type="module" src="./runtime.js"></script>
</body>
</html>`;
  }

  /** Emit the complete text portion of an installable/offline PWA build. Binary
   * assets and runtime.js are supplied by the bundler alongside these files. */
  static generatePwaFiles(rawTitle: string): Array<{ path: string; data: Uint8Array }> {
    const encoder = new TextEncoder();
    const title = rawTitle.trim() || 'MIX Engine Game';
    const manifest = {
      name: title,
      short_name: title.slice(0, 24),
      start_url: './',
      display: 'fullscreen',
      background_color: '#000000',
      theme_color: '#000000',
      icons: [
        { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    };
    const serviceWorker = `const CACHE='mix-game-v1';
const CORE=['./','./index.html','./runtime.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}))));`;
    const registration = `if ('serviceWorker' in navigator) addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js'));`;
    const html = this.generateWebStandaloneHtml(title).replace(
      '</head>',
      '  <link rel="manifest" href="./manifest.webmanifest">\n</head>',
    ).replace('</body>', '  <script type="module" src="./register-sw.js"></script>\n</body>');
    return [
      { path: 'index.html', data: encoder.encode(html) },
      { path: 'manifest.webmanifest', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
      { path: 'service-worker.js', data: encoder.encode(serviceWorker) },
      { path: 'register-sw.js', data: encoder.encode(registration) },
    ];
  }

  static validateBundle(manifest: GamePackageManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest.gameTitle) errors.push('Missing game title');
    if (!manifest.entryScene) errors.push('Missing entry scene');
    if (!manifest.scenes || typeof manifest.scenes !== 'object') {
      errors.push('Invalid scenes object');
    } else if (manifest.entryScene && !(manifest.entryScene in manifest.scenes)) {
      errors.push(`Entry scene '${manifest.entryScene}' not found in scenes bundle`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
