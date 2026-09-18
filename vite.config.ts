import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  optimizeDeps: {
    // maplibre-gl ships its own web worker bundle; Vite's dep pre-bundling
    // rewrites the worker's self-referencing URL and breaks it (404 on the
    // worker script -> vector tiles never load, only the base style paints).
    // Serving it straight from node_modules keeps that URL intact.
    exclude: ['maplibre-gl'],
  },
})
