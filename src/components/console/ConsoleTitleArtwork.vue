<script setup lang="ts">
// Compact borderless 3D clay emblem displayed at the start of Console page titles.
defineProps<{
  src: string;
}>();
</script>

<template>
  <img
    :src="src"
    alt=""
    aria-hidden="true"
    decoding="async"
    class="h-12 w-12 shrink-0 select-none object-contain drop-shadow-[0_4px_10px_rgba(37,99,235,0.14)] sm:h-14 sm:w-14"
  />
</template>
