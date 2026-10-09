<script setup lang="ts">
import FhButton from '../FhButton.vue';
import { CONSOLE_LOAD_ERROR } from './console-ui';

// A failed load never shows a code or a technical message (PO 10/10/2026). A page
// may pass a plain Vietnamese reason from the server (already cleaned by
// `userFacingError` with CONSOLE_LOAD_ERROR as the fallback).
withDefaults(defineProps<{ message?: string }>(), { message: '' });
defineEmits<{ (e: 'retry'): void }>();
</script>

<template>
  <div
    role="alert"
    class="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-white px-6 py-10 text-center"
    data-testid="console-load-error"
  >
    <p class="text-sm text-ink-700">{{ message || CONSOLE_LOAD_ERROR }}</p>
    <FhButton variant="secondary" size="sm" @click="$emit('retry')">Thử lại</FhButton>
  </div>
</template>
