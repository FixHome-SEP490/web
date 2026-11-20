<script setup lang="ts">
import { watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';
import { isAppSurface, isConsoleSurface } from './utils/app-surface';

const route = useRoute();

// Customer/technician screens (`.fh-app`), Console screens (`.fh-console`), and public
// screens (`.fh-public`) all use crisp cool-slate neutrals so teleported overlays stay consistent.
watchEffect(() => {
  const app = isAppSurface(route.path);
  const console = isConsoleSurface(route.path);
  document.documentElement.classList.toggle('fh-app', app);
  document.documentElement.classList.toggle('fh-console', console);
  document.documentElement.classList.toggle('fh-public', !app && !console);
});
</script>

<template>
  <Toaster position="top-center" :close-button="true" close-button-position="top-left" :richColors="true" />
  <router-view />
</template>
