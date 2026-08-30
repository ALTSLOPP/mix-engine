import { defineConfig } from 'vitest/config';

// Standalone Vitest config — deliberately does NOT pull in vite.config.ts (whose dev-save
// plugin spins up file-watchers / endpoints we don't want during a test run). Per-file
// environment is selected with a `// @vitest-environment jsdom` docblock where the DOM is
// needed (e.g. ParticleEmitter reads window.devicePixelRatio); everything else runs in node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Windows fork workers occasionally time out during startup across this large
    // suite. Isolated worker threads are faster and completed the whole suite cleanly.
    pool: 'threads',
    testTimeout: 15000, // Rapier WASM init on the physics test needs a little headroom.
  },
});
