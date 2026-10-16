import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      // The map worker is built by Vite for the app (src/utils/maplibre-worker.ts);
      // tests get a plain URL instead of bundling a worker.
      {
        find: /^maplibre-gl\/dist\/maplibre-gl-worker\.mjs\?worker&url$/,
        replacement: fileURLToPath(new URL('./tests/support/maplibre-worker-url.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/support/query-client.ts', 'tests/support/reduced-motion.ts'],
  },
});
