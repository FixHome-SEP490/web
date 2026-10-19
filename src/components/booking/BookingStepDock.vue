<script setup lang="ts">
// The step-1 action dock: a floating Previous/Next pill that appears while the
// customer scrolls the finder and slides away once the natural footer is on
// screen (the page owns that IntersectionObserver, so only one of the two
// action sets is ever exposed to a keyboard or a screen reader). On phones it
// stays above the bottom tab bar, the chat bubble and the safe area; from `lg`
// it floats centred at the bottom.
import { ArrowLeft, ArrowRight } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    show: boolean;
    nextLabel?: string;
    nextDisabled?: boolean;
    hint?: string;
  }>(),
  { nextLabel: 'Tiếp tục', nextDisabled: false, hint: '' },
);

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'next'): void;
}>();

// v-if keeps the outgoing DOM during the CSS leave animation. Disable that
// DOM synchronously before the page exposes the natural footer again.
function disableLeavingActions(element: Element) {
  element.setAttribute('inert', '');
  element.setAttribute('aria-hidden', 'true');
  element.querySelectorAll('button').forEach((button) => {
    button.tabIndex = -1;
    button.disabled = true;
  });
}
</script>

<template>
  <Transition name="step-dock" @before-leave="disableLeavingActions">
    <div
      v-if="show"
      class="pointer-events-none fixed left-3 right-[5.5rem] bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-30 lg:left-1/2 lg:right-auto lg:bottom-6 lg:-translate-x-1/2"
      data-testid="booking-step-dock"
    >
      <div
        class="pointer-events-auto mx-auto flex w-full max-w-lg items-center gap-2 rounded-full border border-ink-200 bg-white/95 p-1.5 shadow-[var(--shadow-e3)] backdrop-blur-md"
      >
        <button
          type="button"
          class="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
          data-testid="booking-step-dock-back"
          aria-label="Quay lại"
          @click="emit('back')"
        >
          <ArrowLeft :size="15" />
          <span class="hidden sm:inline">Quay lại</span>
        </button>

        <p v-if="hint" class="min-w-0 flex-1 truncate px-1 text-[11px] font-medium text-ink-500" data-testid="booking-step-dock-hint">
          {{ hint }}
        </p>
        <span v-else class="flex-1"></span>

        <button
          type="button"
          class="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
          :disabled="nextDisabled"
          data-testid="booking-step-dock-next"
          @click="emit('next')"
        >
          {{ nextLabel }}
          <ArrowRight :size="15" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.step-dock-enter-active,
.step-dock-leave-active {
  transition: opacity 0.2s ease-out, transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.step-dock-enter-from,
.step-dock-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* Keep the horizontal centring the element relies on at `lg`. */
@media (min-width: 1024px) {
  .step-dock-enter-from,
  .step-dock-leave-to {
    transform: translate(-50%, 12px);
  }
}

/* Honour the customer's reduced-motion preference (P2 spec). */
@media (prefers-reduced-motion: reduce) {
  .step-dock-enter-active,
  .step-dock-leave-active {
    transition: none;
  }
  .step-dock-enter-from,
  .step-dock-leave-to {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) and (min-width: 1024px) {
  .step-dock-enter-from,
  .step-dock-leave-to {
    transform: translateX(-50%);
  }
}
</style>
