<script setup lang="ts">
// Compact 3D clay emblem badge displayed at the start of Console page titles.
defineProps<{
  src: string;
}>();
</script>

<template>
  <div
    class="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-2xl border border-brand-100/90 bg-gradient-to-br from-brand-50/90 via-white to-brand-100/55 p-1.5 shadow-2xs sm:h-12 sm:w-12"
    aria-hidden="true"
  >
    <img
      :src="src"
      alt=""
      decoding="async"
      class="h-full w-full object-contain drop-shadow-[0_2px_4px_rgba(37,99,235,0.12)]"
    />
  </div>
</template>
