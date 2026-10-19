<script setup lang="ts">
// The full picture of one service: scope, price basis, duration and unit.
// Opening this dialog never changes the selection — only the explicit confirm
// button (or the card itself) chooses a service. Keyboard and screen-reader
// users get a real dialog: focus moves inside, Tab stays trapped, Escape and
// the backdrop close it, and focus returns to the `Chi tiết` button that opened
// it. On phones it is a bottom sheet, on wider screens a centred dialog; both
// honour the reduced-motion preference.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { AlertTriangle, Check, Clock, Info, X } from 'lucide-vue-next';
import FhMoney from '../FhMoney.vue';
import { categoryIcon } from './service-icons';
import {
  fixedPriceValue,
  isServiceBookable,
  normalizePricingMode,
  type BookingCatalogService,
} from './booking-service-catalog';
import type { ServiceItem } from '../../api/catalog.api';

const props = withDefaults(
  defineProps<{
    open: boolean;
    service: BookingCatalogService | ServiceItem | null;
    selected?: boolean;
    categoryName?: string | null;
  }>(),
  { selected: false, categoryName: null },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', id: string): void;
}>();

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The dialog keeps the last service it showed, so its content never blanks out while it closes. */
const shown = ref<BookingCatalogService | ServiceItem | null>(null);
watch(
  () => props.service,
  (service) => {
    if (service) shown.value = service;
  },
  { immediate: true },
);

const mode = computed(() => normalizePricingMode(shown.value?.pricingMode));
const price = computed(() => fixedPriceValue(shown.value));
const bookable = computed(() => isServiceBookable(shown.value));
const unit = computed(() => shown.value?.unit?.trim() || 'thiết bị');
const categoryLabel = computed(() => {
  const service = shown.value;
  if (service && 'categoryName' in service && service.categoryName) return service.categoryName;
  return props.categoryName ?? '';
});
const icon = computed(() => categoryIcon({ name: categoryLabel.value }));
const scope = computed(
  () =>
    shown.value?.scopeDescription ||
    shown.value?.description ||
    'Dịch vụ sửa chữa, bảo dưỡng bởi kỹ thuật viên FixHome.',
);

const modeLabel = computed(() => {
  if (mode.value === 'fixed_price') return price.value === null ? 'Chưa có giá niêm yết' : 'Giá niêm yết';
  if (mode.value === 'inspection_required') return 'Khảo sát tận nơi';
  return 'Chưa xác định cách tính giá';
});

const modeHint = computed(() => {
  if (mode.value === 'fixed_price' && price.value !== null) {
    return 'Giá niêm yết trọn gói: thợ hoàn thành dịch vụ đúng mức giá trên, bạn không phát sinh chi phí khảo sát.';
  }
  if (mode.value === 'inspection_required') {
    return 'Thợ tới khảo sát tận nơi rồi báo giá chi tiết trước khi sửa. Bạn đồng ý mới bắt đầu.';
  }
  return 'Dịch vụ này chưa có cách tính giá hợp lệ nên chưa thể đặt. Vui lòng chọn dịch vụ khác.';
});

const panelRef = ref<HTMLElement | null>(null);
const confirmRef = ref<HTMLButtonElement | null>(null);
const titleId = 'booking-service-details-title';

/** Where focus came from, and the body scroll state, so both are restored on close. */
let lastFocused: HTMLElement | null = null;
let bodyOverflow: string | null = null;

function focusables(): HTMLElement[] {
  const panel = panelRef.value;
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function lockPageScroll() {
  if (bodyOverflow !== null) return;
  bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function releasePageScroll() {
  if (bodyOverflow === null) return;
  document.body.style.overflow = bodyOverflow;
  bodyOverflow = null;
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      const active = document.activeElement;
      // `document.body` cannot take focus back, so it is not worth remembering.
      lastFocused = active instanceof HTMLElement && active !== document.body ? active : null;
      lockPageScroll();
      await nextTick();
      const preferred = confirmRef.value && !confirmRef.value.disabled ? confirmRef.value : focusables()[0];
      preferred?.focus();
      return;
    }
    releasePageScroll();
    const target = lastFocused;
    lastFocused = null;
    if (target && target.isConnected) target.focus();
  },
  // A dialog that is already open on its first render still takes focus.
  { immediate: true },
);

function close() {
  emit('close');
}

/** Tab wraps inside the dialog; Escape closes it from anywhere inside the sheet. */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables();
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && !!panelRef.value?.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function confirm() {
  const service = shown.value;
  if (!service) return;
  emit('confirm', service.id);
}

onBeforeUnmount(releasePageScroll);
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-sheet">
      <div
        v-if="open && shown"
        class="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        data-testid="booking-service-details-overlay"
        @click.self="close"
      >
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          class="fh-dialog-panel max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-lg)] border border-ink-200 bg-white shadow-[var(--shadow-e3)] sm:rounded-[var(--radius-lg)]"
          data-testid="booking-service-details-dialog"
          @keydown="onPanelKeydown"
        >
          <!-- Grab handle: the sheet reads as draggable on phones. -->
          <div class="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
            <span class="h-1 w-10 rounded-full bg-ink-300"></span>
          </div>

          <div class="flex items-start gap-3 border-b border-ink-100 p-5">
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-ink-100 bg-ink-50 text-brand-600"
            >
              <component :is="icon" :size="19" />
            </span>
            <div class="min-w-0 flex-1">
              <p v-if="categoryLabel" class="text-[11px] font-medium text-ink-500">{{ categoryLabel }}</p>
              <h2 :id="titleId" class="text-base font-bold leading-snug text-ink-900 text-pretty">
                {{ shown.name }}
              </h2>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 motion-reduce:transition-none"
              aria-label="Đóng chi tiết dịch vụ"
              data-testid="booking-service-details-close"
              @click="close"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="space-y-4 p-5 text-xs sm:text-sm">
            <div class="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 p-3.5">
              <span
                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                :class="mode === 'fixed_price' && price !== null
                  ? 'border-brand-200 bg-white text-brand-700'
                  : mode === 'inspection_required'
                    ? 'border-ink-200 bg-white text-ink-700'
                    : 'border-warning-200 bg-warning-50 text-warning-800'"
              >
                <Info :size="12" /> {{ modeLabel }}
              </span>
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-500">
                <Clock :size="12" class="text-ink-400" /> Thời lượng dự kiến ~{{ shown.estimatedMinutes }} phút
              </span>
              <span v-if="mode === 'fixed_price' && price !== null" class="ml-auto text-[15px] font-bold font-num text-brand-700">
                <FhMoney :amount="price" />
                <span class="text-[11px] font-normal text-ink-500"> / {{ unit }}</span>
              </span>
            </div>

            <div class="space-y-1.5">
              <p class="text-[11px] font-bold uppercase tracking-wider text-ink-400">Phạm vi công việc</p>
              <p class="leading-relaxed text-ink-700 text-pretty" data-testid="booking-service-details-scope">
                {{ scope }}
              </p>
            </div>

            <p class="leading-relaxed text-ink-500">{{ modeHint }}</p>

            <div
              v-if="!bookable"
              class="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-danger-200 bg-danger-50 p-3.5 text-danger-700"
              data-testid="booking-service-details-unavailable"
            >
              <AlertTriangle :size="15" class="mt-0.5 shrink-0" />
              <p>Dịch vụ này chưa thể đặt. Vui lòng chọn một dịch vụ khác trong danh sách.</p>
            </div>
          </div>

          <div class="flex flex-col-reverse gap-2 border-t border-ink-100 bg-ink-25 p-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              class="inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
              data-testid="booking-service-details-dismiss"
              @click="close"
            >
              Đóng
            </button>
            <button
              ref="confirmRef"
              type="button"
              class="inline-flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
              :disabled="selected"
              data-testid="booking-service-details-confirm"
              @click="confirm"
            >
              <Check :size="15" />
              {{ selected ? 'Đang chọn dịch vụ này' : 'Chọn dịch vụ này' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fh-sheet-enter-active,
.fh-sheet-leave-active {
  transition: opacity 0.2s ease-out;
}
.fh-sheet-enter-from,
.fh-sheet-leave-to {
  opacity: 0;
}

.fh-sheet-enter-active .fh-dialog-panel {
  transition: transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.fh-sheet-enter-from .fh-dialog-panel,
.fh-sheet-leave-to .fh-dialog-panel {
  transform: translateY(16px);
}

/* Honour the customer's reduced-motion preference (P2 spec). */
@media (prefers-reduced-motion: reduce) {
  .fh-sheet-enter-active,
  .fh-sheet-leave-active,
  .fh-sheet-enter-active .fh-dialog-panel {
    transition: none;
  }
  .fh-sheet-enter-from .fh-dialog-panel,
  .fh-sheet-leave-to .fh-dialog-panel {
    transform: none;
  }
}
</style>
