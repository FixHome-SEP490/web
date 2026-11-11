<script setup lang="ts">
import type { Component } from 'vue';
import { Inbox } from 'lucide-vue-next';
import FhButton from './FhButton.vue';

interface Props {
  title: string;
  description: string;
  actionText?: string;
  icon?: Component;
  illustration?: string;
}

withDefaults(defineProps<Props>(), {
  actionText: '',
  icon: () => Inbox,
  illustration: '',
});

const emit = defineEmits<{
  (e: 'action'): void;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center p-8 sm:p-12 max-w-md mx-auto">
    <!-- 3D Illustration or Icon in brand tile -->
    <div v-if="illustration" class="mb-5 max-w-[150px] sm:max-w-[180px] flex items-center justify-center">
      <img
        :src="illustration"
        alt=""
        class="w-full h-auto max-h-40 object-contain drop-shadow-sm select-none pointer-events-none"
        loading="lazy"
      />
    </div>
    <div v-else class="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 mb-4 border border-brand-100">
      <component :is="icon" :size="32" :stroke-width="1.75" />
    </div>

    <!-- Title -->
    <h3 class="text-h2 text-ink-900 font-semibold mb-1">
      {{ title }}
    </h3>

    <!-- Description -->
    <p class="text-sm text-ink-600 mb-6 leading-relaxed">
      {{ description }}
    </p>

    <!-- CTA Button -->
    <FhButton
      v-if="actionText"
      variant="primary"
      size="md"
      @click="emit('action')"
    >
      {{ actionText }}
    </FhButton>
    <slot name="extra" />
  </div>
</template>
