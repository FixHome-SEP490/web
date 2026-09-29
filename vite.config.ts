import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loaded with an empty prefix so a plain DEV_HTTPS is visible here. It is
  // deliberately not named VITE_*: it configures the dev server, it is not
  // baked into the bundle, and nothing in the app reads it.
  const env = loadEnv(mode, process.cwd(), '')

  // Voice calls need the microphone, and browsers only hand it over on a
  // secure origin. That covers localhost already, so ordinary development is
  // unaffected and this stays off by default. It is needed for the one case
  // localhost cannot cover: a second machine opening the app over the LAN by
  // IP address, where http:// makes getUserMedia disappear entirely.
  // Set DEV_HTTPS=true in .env, then accept the self-signed certificate
  // warning on each machine.
  const useHttps = env.DEV_HTTPS === 'true'

  return {
    plugins: [
      vue(),
      tailwindcss(),
      ...(useHttps ? [basicSsl()] : []),
    ],
    server: useHttps
      ? // Listening on every interface is what makes the LAN address exist at
        // all; without it the certificate would have nothing to protect.
        { host: true }
      : {},
    optimizeDeps: {
      // maplibre-gl ships its own web worker bundle; Vite's dep pre-bundling
      // rewrites the worker's self-referencing URL and breaks it (404 on the
      // worker script -> vector tiles never load, only the base style paints).
      // Serving it straight from node_modules keeps that URL intact.
      exclude: ['maplibre-gl'],
    },
  }
})
