<script setup lang="ts" generic="T extends string">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

// Underline or sliding-pill filter tabs above a list; the count sits next to the label and never wraps.
interface TabItem {
  key: T;
  label: string;
  count?: number | null;
  id?: string;
  ariaLabel?: string;
  ariaControls?: string;
  testId?: string;
  attrs?: Record<string, string | undefined>;
}

const props = withDefaults(defineProps<{
  tabs: TabItem[];
  ariaLabel?: string;
  rovingTabindex?: boolean;
  variant?: 'underline' | 'pill';
}>(), {
  ariaLabel: undefined,
  rovingTabindex: false,
  variant: 'underline',
});
const model = defineModel<T>({ required: true });

const tabListRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({ opacity: '0' });

function updateTabIndicator() {
  if (props.variant !== 'pill') return;
  const activeEl = tabRefs.value[model.value];
  const container = tabListRef.value;
  if (!activeEl || !container) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  const width = activeEl.offsetWidth;
  indicatorStyle.value = {
    transform: `translate3d(${activeEl.offsetLeft}px, ${activeEl.offsetTop}px, 0)`,
    width: `${width}px`,
    height: `${activeEl.offsetHeight}px`,
    opacity: width > 0 ? '1' : '0',
  };
}

function selectTab(key: T) {
  model.value = key;
  if (props.variant === 'pill') {
    const el = tabRefs.value[key];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !props.tabs.length) return;
  event.preventDefault();
  const currentIndex = props.tabs.findIndex((tab) => tab.key === model.value);
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? props.tabs.length - 1
      : (Math.max(0, currentIndex) + (event.key === 'ArrowRight' ? 1 : props.tabs.length - 1)) % props.tabs.length;
  selectTab(props.tabs[nextIndex].key);
  const tablist = event.currentTarget as HTMLElement | null;
  const buttons = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[nextIndex]?.focus();
}

watch([model, () => props.tabs, () => props.variant], () => {
  if (props.variant === 'pill') {
    void nextTick(updateTabIndicator);
  }
}, { deep: true });

let tabResizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (props.variant === 'pill') {
    void nextTick(updateTabIndicator);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateTabIndicator);
    if (tabListRef.value && typeof ResizeObserver !== 'undefined') {
      tabResizeObserver = new ResizeObserver(updateTabIndicator);
      tabResizeObserver.observe(tabListRef.value);
    }
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
  tabResizeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="tabListRef"
    :class="variant === 'pill'
      ? 'relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-ink-100 p-1 select-none scrollbar-none'
      : 'flex gap-6 overflow-x-auto border-b border-ink-200 scrollbar-none'"
    role="tablist"
    :aria-label="ariaLabel"
    @keydown="onKeydown"
  >
    <div
      v-if="variant === 'pill'"
      class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
      :style="indicatorStyle"
      aria-hidden="true"
    />

    <button
      v-for="tab in tabs"
      :key="tab.key"
      :ref="(el) => { tabRefs[tab.key] = el as HTMLElement | null }"
      :id="tab.id"
      type="button"
      role="tab"
      :aria-label="tab.ariaLabel"
      :aria-controls="tab.ariaControls"
      :aria-selected="model === tab.key"
      :tabindex="rovingTabindex ? (model === tab.key ? 0 : -1) : undefined"
      :data-testid="tab.testId"
      v-bind="tab.attrs"
      :class="variant === 'pill'
        ? [
          'relative z-10 flex h-9 shrink-0 min-w-[5.25rem] sm:min-w-[5.75rem] items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          model === tab.key ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900',
        ]
        : [
          '-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          model === tab.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800',
        ]"
      @click="selectTab(tab.key)"
    >
      {{ tab.label }}
      <span
        v-if="tab.count != null"
        class="rounded-full px-2 py-0.5 font-num text-xs font-semibold"
        :class="variant === 'pill' && model === tab.key ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600'"
      >{{ tab.count }}</span>
    </button>
  </div>
</template>
