<script setup lang="ts">
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';
</script>

<template>
  <Toaster position="top-center" :close-button="true" close-button-position="top-left" :richColors="true" />
  <router-view />
</template>
