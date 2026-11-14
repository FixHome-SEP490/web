<script setup lang="ts">
// src/components/chat/ChatTypingDots.vue
</script>

<template>
  <div class="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white ring-1 ring-ink-200/80 rounded-2xl rounded-bl-sm shadow-2xs w-fit">
    <span class="fh-typing-dot w-1.5 h-1.5 rounded-full bg-ink-400" style="animation-delay: 0ms"></span>
    <span class="fh-typing-dot w-1.5 h-1.5 rounded-full bg-ink-400" style="animation-delay: 160ms"></span>
    <span class="fh-typing-dot w-1.5 h-1.5 rounded-full bg-ink-400" style="animation-delay: 320ms"></span>
  </div>
</template>

<style scoped>
@keyframes fhTypingWave {
  0%, 60%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-2.5px);
  }
}

.fh-typing-dot {
  animation: fhTypingWave 1.1s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .fh-typing-dot {
    animation: none;
    opacity: 0.65;
  }
}
</style>
