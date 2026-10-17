import * as maplibregl from 'maplibre-gl';
// maplibre-gl 6 finds its worker next to its own file at run time
// (new URL('./maplibre-gl-worker.mjs', import.meta.url)). A production build
// moves maplibre into /assets/<chunk>.js and never emits that worker, so the
// page got index.html back instead of a script: the map showed only its
// background, with no streets or names. Here Vite builds the worker itself,
// together with the shared chunk it imports, and hands back its real URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let applied = false;

/** Point maplibre at the worker the build emitted. Safe to call for every map. */
export function useBundledMaplibreWorker(): void {
  if (applied) return;
  applied = true;
  maplibregl.setWorkerUrl(workerUrl);
}
