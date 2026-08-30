import { defineConfig } from 'vite';
import path from 'node:path';

/**
 * Runtime-only build for packaged games (web/PWA/desktop).
 * Produces a deterministic `dist-runtime/runtime.js` + `dist-runtime/manifest.json`
 * that `GamePackager` copies into the exported `game.pak` / PWA shell.
 * The main `index.html` → `src/main.ts` editor build stays untouched (`vite.config.ts`).
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/runtime/entry.ts'),
      name: 'MixRuntime',
      formats: ['es'],
      fileName: () => 'runtime.js',
    },
    outDir: 'dist-runtime',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
});
