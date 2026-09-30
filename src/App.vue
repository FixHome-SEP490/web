<script setup lang="ts">
import { watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';
import { isAppSurface } from './utils/app-surface';

const route = useRoute();

// Customer and technician screens share the mobile app's look (theme.css,
// `.fh-app`). On <html> rather than a layout div so teleported dialogs and
// toasts get it too.
watchEffect(() => {
  document.documentElement.classList.toggle('fh-app', isAppSurface(route.path));
});
</script>

<template>
  <Toaster position="top-center" :close-button="true" close-button-position="top-left" :richColors="true" />
  <router-view />
</template>
