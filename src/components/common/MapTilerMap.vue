<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  draggable?: boolean;
}

const props = withDefaults(defineProps<{
  center: { lat: number; lng: number };
  markers?: MapMarker[];
  zoom?: number;
  clickToMove?: string; // marker id that a map click repositions
  heightClass?: string;
}>(), {
  markers: () => [],
  zoom: 15,
  clickToMove: undefined,
  heightClass: 'h-72',
});

const emit = defineEmits<{
  'marker-move': [id: string, lat: number, lng: number];
}>();

const mapsKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const containerRef = ref<HTMLDivElement | null>(null);
const mapError = ref(false);
let map: maplibregl.Map | null = null;
const markerInstances = new Map<string, maplibregl.Marker>();

function syncMarkers(list: MapMarker[]) {
  if (!map) return;
  const seen = new Set<string>();
  for (const m of list) {
    seen.add(m.id);
    let instance = markerInstances.get(m.id);
    if (!instance) {
      instance = new maplibregl.Marker({ color: m.color || '#2563eb', draggable: !!m.draggable })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      if (m.draggable) {
        instance.on('dragend', () => {
          const pos = instance!.getLngLat();
          emit('marker-move', m.id, pos.lat, pos.lng);
        });
      }
      markerInstances.set(m.id, instance);
    } else {
      instance.setLngLat([m.lng, m.lat]);
    }
  }
  for (const [id, instance] of markerInstances) {
    if (!seen.has(id)) {
      instance.remove();
      markerInstances.delete(id);
    }
  }
}

function flyTo(lat: number, lng: number) {
  map?.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16) });
}

defineExpose({ flyTo });

onMounted(() => {
  if (!mapsKey || !containerRef.value) {
    mapError.value = true;
    return;
  }
  try {
    map = new maplibregl.Map({
      container: containerRef.value,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapsKey}`,
      center: [props.center.lng, props.center.lat],
      zoom: props.zoom,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => syncMarkers(props.markers));
    if (props.clickToMove) {
      map.on('click', (e: maplibregl.MapMouseEvent) => {
        if (!props.clickToMove) return;
        emit('marker-move', props.clickToMove, e.lngLat.lat, e.lngLat.lng);
      });
    }
  } catch {
    mapError.value = true;
  }
});

watch(() => props.markers, (list) => syncMarkers(list), { deep: true });
watch(() => props.center, (c) => { if (map) map.setCenter([c.lng, c.lat]); });

onBeforeUnmount(() => {
  markerInstances.clear();
  map?.remove();
  map = null;
});
</script>

<template>
  <div class="relative w-full rounded-2xl overflow-hidden border border-ink-200 bg-ink-50" :class="heightClass">
    <div v-if="mapError" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4 text-ink-400">
      <span class="text-sm font-medium">Chưa cấu hình bản đồ</span>
      <span class="text-xs">Thiếu VITE_MAPTILER_KEY trong biến môi trường.</span>
    </div>
    <div v-else ref="containerRef" class="absolute inset-0" />
  </div>
</template>
