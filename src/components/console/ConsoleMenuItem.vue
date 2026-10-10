<script setup lang="ts">
withDefaults(defineProps<{ danger?: boolean; disabled?: boolean }>(), { danger: false, disabled: false });
defineEmits<{ (e: 'click', event: MouseEvent): void }>();
</script>

<template>
  <button
    type="button"
    role="menuitem"
    :disabled="disabled"
    class="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
    :class="danger ? 'text-danger-600 hover:bg-danger-50' : 'text-ink-700 hover:bg-ink-50'"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
