<script setup lang="ts">
import { watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';
import { isAppSurface, isConsoleSurface } from './utils/app-surface';

const route = useRoute();

// Customer/technician screens (`.fh-app`) and Console screens (`.fh-console`)
// share cool-slate neutrals on <html> so teleported dialogs and tables stay crisp.
watchEffect(() => {
  document.documentElement.classList.toggle('fh-app', isAppSurface(route.path));
  document.documentElement.classList.toggle('fh-console', isConsoleSurface(route.path));
});
</script>

<template>
  <Toaster position="top-center" :close-button="true" close-button-position="top-left" :richColors="true" />
  <router-view />
</template>
