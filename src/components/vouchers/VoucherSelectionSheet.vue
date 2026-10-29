<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import {
  BadgePercent,
  Check,
  CircleHelp,
  Clock3,
  Search,
  TicketPercent,
  WifiOff,
  X,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import VoucherStatePanel from './VoucherStatePanel.vue';
import type { VoucherCheckoutPreview } from '../../api/vouchers.api';
import {
  filterCustomerVoucherOffers,
  formatVoucherCountdown,
  formatVoucherDate,
  remainingReservationSeconds,
  voucherDiscountLabel,
  type VoucherKind,
  type VoucherOffer,
} from './voucher-model';

type SheetState = 'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'denied';
type EligibilityTone = 'eligible' | 'ineligible' | 'unknown';

interface VoucherSelectionQuote {
  /** Voucher claim ids the server marked usable for this frozen checkout scope. */
  eligibleVoucherIds: string[];
  /** Human-readable server reason for each ineligible claim id. */
  ineligibleReasons?: Record<string, string>;
}

interface VoucherSelectionReservation {
  voucherId?: string;
  /** Server expiry, never the browser's own guess. */
  expiresAt: string;
  /** Server clock at response time, used for a clock-skew-safe countdown. */
  serverTimeAtResponse: string;
}

const props = withDefaults(defineProps<{
  open: boolean;
  offers?: VoucherOffer[];
  state?: SheetState;
  message?: string;
  selectedId?: string;
  customerId?: string | null;
  serverQuote?: VoucherSelectionQuote | null;
  serverReservation?: VoucherSelectionReservation | null;
  serverPreview?: VoucherCheckoutPreview | null;
  previewLoading?: boolean;
  previewMessage?: string;
  previewMessageIsError?: boolean;
  previewRetryable?: boolean;
  canApply?: boolean;
  applying?: boolean;
  selectionDisabled?: boolean;
  applyError?: string;
  showCodeEntry?: boolean;
  codeEntryEnabled?: boolean;
}>(), {
  offers: () => [],
  state: 'ready',
  message: '',
  selectedId: '',
  customerId: null,
  serverQuote: null,
  serverReservation: null,
  serverPreview: null,
  previewLoading: false,
  previewMessage: '',
  previewMessageIsError: false,
  previewRetryable: false,
  canApply: false,
  applying: false,
  selectionDisabled: false,
  applyError: '',
  showCodeEntry: true,
  codeEntryEnabled: false,
});

const emit = defineEmits<{
  close: [];
  retry: [];
  select: [voucherId: string];
  apply: [];
  retryPreview: [];
  verifyCode: [code: string];
}>();

const idPrefix = useId();
const titleId = `${idPrefix}-voucher-title`;
const descriptionId = `${idPrefix}-voucher-description`;
const panelId = `${idPrefix}-voucher-panel`;
const codeId = `${idPrefix}-voucher-code`;
const codeHelpId = `${idPrefix}-voucher-code-help`;

const panelRef = ref<HTMLElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
const tablistRef = ref<HTMLElement | null>(null);
const activeId = ref(props.selectedId);
const activeKind = ref<VoucherKind>('PERSONAL');
const manualCode = ref('');
const elapsedMs = ref(0);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

let lastFocused: HTMLElement | null = null;
let bodyOverflow: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;

const customerOffers = computed(() => filterCustomerVoucherOffers(props.offers, props.customerId ?? null));
const personalOffers = computed(() => customerOffers.value.filter((offer) => offer.kind === 'PERSONAL'));
const generalOffers = computed(() => customerOffers.value.filter((offer) => offer.kind === 'GENERAL'));
const visibleOffers = computed(() => activeKind.value === 'PERSONAL' ? personalOffers.value : generalOffers.value);
const activeOffer = computed(() => customerOffers.value.find((offer) => offer.id === activeId.value) ?? null);

const tabs: { key: VoucherKind; label: string; ariaLabel: string; icon: typeof BadgePercent }[] = [
  { key: 'PERSONAL', label: 'Cá nhân', ariaLabel: 'Voucher cá nhân', icon: BadgePercent },
  { key: 'GENERAL', label: 'Chung', ariaLabel: 'Voucher chung', icon: Search },
];

const emptyTitle = computed(() => activeKind.value === 'PERSONAL'
  ? 'Chưa có voucher cá nhân'
  : 'Chưa có voucher chung');
const emptyMessage = computed(() => activeKind.value === 'PERSONAL'
  ? 'Voucher được cấp riêng cho tài khoản này sẽ xuất hiện tại đây.'
  : 'Voucher chung đã lưu trong ví sẽ xuất hiện tại đây.');

const activeReservation = computed<VoucherSelectionReservation | null>(() => {
  if (props.serverReservation) return props.serverReservation;
  const offer = activeOffer.value;
  if (!offer?.reservation) return null;
  return { voucherId: offer.id, ...offer.reservation };
});
const remainingSeconds = computed(() => activeReservation.value
  ? remainingReservationSeconds(activeReservation.value, elapsedMs.value)
  : null);
const countdown = computed(() => remainingSeconds.value === null || remainingSeconds.value === 0
  ? ''
  : formatVoucherCountdown(remainingSeconds.value));

function formatServerClock(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

function eligibilityFor(offer: VoucherOffer): {
  tone: EligibilityTone;
  label: string;
  reasons: string[];
} {
  if (props.serverQuote) {
    if (props.serverQuote.eligibleVoucherIds.includes(offer.id)) {
      return { tone: 'eligible', label: 'Đủ điều kiện theo máy chủ', reasons: [] };
    }
    const reason = props.serverQuote.ineligibleReasons?.[offer.id]?.trim();
    return {
      tone: 'ineligible',
      label: 'Chưa đủ điều kiện theo máy chủ',
      reasons: [reason || 'Máy chủ chưa xác nhận voucher này đủ điều kiện cho hóa đơn.'],
    };
  }
  const reasons = offer.eligibility?.reasons?.map((reason) => reason.trim()).filter(Boolean) ?? [];
  if (offer.eligibility?.eligible) {
    return { tone: 'eligible', label: 'Điều kiện ưu đãi đã xác nhận', reasons };
  }
  return {
    tone: 'unknown',
    label: 'Chưa kiểm tra với hóa đơn',
    reasons: reasons.length ? reasons : ['Chưa có báo giá từ máy chủ để kiểm tra điều kiện.'],
  };
}

function eligibilityClasses(tone: EligibilityTone): string {
  if (tone === 'eligible') return 'border-success-200 bg-success-50 text-success-800';
  if (tone === 'ineligible') return 'border-warning-200 bg-warning-50 text-warning-800';
  return 'border-ink-200 bg-ink-50 text-ink-700';
}

function stopCountdown() {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

function syncCountdown() {
  stopCountdown();
  elapsedMs.value = 0;
  const reservation = activeReservation.value;
  if (!props.open || !reservation) return;
  const initial = remainingReservationSeconds(reservation, 0);
  if (initial === null || initial === 0) return;
  startedAt = performance.now();
  timer = setInterval(() => {
    elapsedMs.value = performance.now() - startedAt;
    if (remainingReservationSeconds(reservation, elapsedMs.value) === 0) stopCountdown();
  }, 1000);
}

function focusables(): HTMLElement[] {
  const panel = panelRef.value;
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && !element.hasAttribute('disabled'));
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

function restoreTriggerFocus() {
  const target = lastFocused;
  lastFocused = null;
  if (target?.isConnected) target.focus();
}

function requestClose() {
  emit('close');
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    requestClose();
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

function choose(offer: VoucherOffer) {
  if (props.selectionDisabled) return;
  activeId.value = offer.id;
  emit('select', offer.id);
}

function changeKind(kind: VoucherKind) {
  activeKind.value = kind;
}

function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = tabs.findIndex((tab) => tab.key === activeKind.value);
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? tabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  activeKind.value = tabs[nextIndex].key;
  void nextTick(() => {
    tablistRef.value
      ?.querySelector<HTMLButtonElement>(`[data-voucher-selection-tab="${activeKind.value}"]`)
      ?.focus();
  });
}

function submitCode() {
  const code = manualCode.value.trim();
  if (!props.codeEntryEnabled || !code) return;
  emit('verifyCode', code);
}

watch(() => props.selectedId, (id) => {
  if (id !== activeId.value) activeId.value = id;
});

watch(customerOffers, () => {
  if (activeKind.value === 'PERSONAL' && personalOffers.value.length === 0 && generalOffers.value.length > 0) {
    activeKind.value = 'GENERAL';
  } else if (activeKind.value === 'GENERAL' && generalOffers.value.length === 0 && personalOffers.value.length > 0) {
    activeKind.value = 'PERSONAL';
  }
});

watch([() => props.open, activeReservation], syncCountdown, { deep: true, immediate: true });

watch(
  () => props.open,
  async (open) => {
    if (open) {
      const active = document.activeElement;
      lastFocused = active instanceof HTMLElement && active !== document.body ? active : null;
      const selected = customerOffers.value.find((offer) => offer.id === props.selectedId);
      activeId.value = selected?.id ?? props.selectedId;
      activeKind.value = selected?.kind
        ?? (personalOffers.value.length === 0 && generalOffers.value.length > 0 ? 'GENERAL' : 'PERSONAL');
      lockPageScroll();
      await nextTick();
      closeRef.value?.focus();
      return;
    }
    releasePageScroll();
    restoreTriggerFocus();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopCountdown();
  releasePageScroll();
  restoreTriggerFocus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="voucher-sheet">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        data-testid="voucher-selection-overlay"
        @click.self="requestClose"
      >
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="descriptionId"
          :aria-busy="state === 'loading' || previewLoading || applying"
          class="voucher-sheet-panel flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-ink-200 bg-white shadow-[var(--shadow-e3)] sm:rounded-[var(--radius-lg)]"
          data-testid="voucher-selection-sheet"
          @keydown="onPanelKeydown"
        >
          <div class="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
            <span class="h-1 w-10 rounded-full bg-ink-300"></span>
          </div>

          <header class="flex shrink-0 items-start gap-3 border-b border-ink-100 p-4 sm:p-5">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-brand-100 bg-brand-50 text-brand-700" aria-hidden="true">
              <TicketPercent :size="21" :stroke-width="1.75" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Thanh toán</p>
              <h2 :id="titleId" class="text-lg font-semibold leading-6 text-ink-900 text-pretty">Chọn voucher</h2>
              <p :id="descriptionId" class="mt-1 text-sm leading-5 text-ink-600">Chọn và xem ưu đãi trong ví. Chưa áp dụng giảm giá cho hóa đơn.</p>
            </div>
            <button
              ref="closeRef"
              type="button"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none"
              aria-label="Đóng bảng chọn voucher"
              data-testid="voucher-selection-close"
              @click="requestClose"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>

          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <section
              class="rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 p-3.5 text-warning-900"
              data-testid="voucher-selection-reservation"
            >
              <div class="flex items-start gap-2.5">
                <Clock3 :size="17" class="mt-0.5 shrink-0" aria-hidden="true" />
                <div class="min-w-0">
                  <p
                    :role="countdown ? 'timer' : 'status'"
                    :aria-live="countdown ? 'off' : undefined"
                    aria-atomic="true"
                    class="text-sm font-medium leading-5"
                  >
                    <span v-if="countdown">Giữ chỗ còn <span class="font-num">{{ countdown }}</span></span>
                    <span v-else-if="remainingSeconds === 0">Thời gian giữ chỗ đã hết.</span>
                    <span v-else-if="activeReservation">Thời gian giữ chỗ chưa xác định.</span>
                    <span v-else>Chưa giữ chỗ · thời hạn giữ chỗ tối đa 15 phút sau khi máy chủ xác nhận.</span>
                  </p>
                  <p v-if="activeReservation" class="mt-1 text-xs leading-5 text-warning-800">
                    Máy chủ ghi nhận {{ formatServerClock(activeReservation.serverTimeAtResponse) }}
                    · hết hạn {{ formatServerClock(activeReservation.expiresAt) }}.
                    Đồng hồ này chỉ để hiển thị; máy chủ quyết định thời hạn.
                  </p>
                </div>
              </div>
            </section>

            <VoucherStatePanel v-if="state === 'loading'" state="loading" />

            <section
              v-else-if="state === 'offline'"
              class="flex flex-col items-center rounded-[var(--radius-md)] border border-ink-200 bg-white px-5 py-8 text-center sm:px-8"
              role="alert"
              data-testid="voucher-selection-offline"
            >
              <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] bg-ink-50 text-ink-700" aria-hidden="true">
                <WifiOff :size="22" />
              </span>
              <h3 class="text-base font-semibold text-ink-900">Đang ngoại tuyến</h3>
              <p class="mt-2 max-w-md text-sm leading-6 text-ink-600">Kết nối mạng để xem ưu đãi. Chưa có voucher nào được giữ chỗ hoặc áp dụng.</p>
              <FhButton class="mt-5" variant="secondary" size="md" @click="$emit('retry')">Thử lại</FhButton>
            </section>

            <VoucherStatePanel
              v-else-if="state === 'empty'"
              state="empty"
              title="Chưa có voucher trong ví"
              message="Voucher đã lưu hoặc được cấp riêng sẽ xuất hiện tại đây."
            />
            <VoucherStatePanel
              v-else-if="state === 'error'"
              state="error"
              :message="message"
              @retry="$emit('retry')"
            />
            <VoucherStatePanel
              v-else-if="state === 'denied'"
              state="denied"
              title="Cần đăng nhập để xem voucher"
              message="Đăng nhập bằng tài khoản khách hàng để mở ví ưu đãi của bạn."
            />
            <template v-else>
              <div
                ref="tablistRef"
                role="tablist"
                aria-label="Loại voucher"
                class="flex flex-wrap gap-2 border-b border-ink-200 pb-2"
                @keydown="onTabKeydown"
              >
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  type="button"
                  role="tab"
                  :id="`${idPrefix}-voucher-tab-${tab.key.toLowerCase()}`"
                  :data-voucher-selection-tab="tab.key"
                  :data-testid="`voucher-selection-tab-${tab.key.toLowerCase()}`"
                  :aria-label="`${tab.ariaLabel} (${tab.key === 'PERSONAL' ? personalOffers.length : generalOffers.length})`"
                  :aria-selected="activeKind === tab.key"
                  :aria-controls="panelId"
                  :tabindex="activeKind === tab.key ? 0 : -1"
                  class="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 aria-selected:bg-brand-50 aria-selected:text-brand-800 motion-reduce:transition-none"
                  @click="changeKind(tab.key)"
                >
                  <component :is="tab.icon" :size="17" aria-hidden="true" />
                  {{ tab.label }}
                  <span class="rounded-full border border-current/20 px-1.5 text-xs font-num" aria-hidden="true">
                    {{ tab.key === 'PERSONAL' ? personalOffers.length : generalOffers.length }}
                  </span>
                </button>
              </div>

              <section
                :id="panelId"
                role="tabpanel"
                :aria-labelledby="`${idPrefix}-voucher-tab-${activeKind.toLowerCase()}`"
                tabindex="0"
                class="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <VoucherStatePanel
                  v-if="visibleOffers.length === 0"
                  state="empty"
                  :title="emptyTitle"
                  :message="emptyMessage"
                />
                <ul v-else class="space-y-2.5" aria-label="Voucher có thể chọn">
                  <li v-for="offer in visibleOffers" :key="offer.id">
                    <button
                      type="button"
                      data-testid="voucher-selection-option"
                      :data-voucher-id="offer.id"
                      :aria-pressed="activeId === offer.id"
                      :disabled="selectionDisabled"
                      class="flex min-h-11 w-full items-start gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-white p-3.5 text-left transition-colors hover:border-ink-300 hover:bg-ink-25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 aria-pressed:border-brand-600 aria-pressed:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                      @click="choose(offer)"
                    >
                      <span class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-brand-50 text-brand-700" aria-hidden="true">
                        <TicketPercent :size="19" :stroke-width="1.75" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex flex-wrap items-start justify-between gap-2">
                          <span class="min-w-0">
                            <span class="block text-sm font-semibold leading-5 text-ink-900">{{ offer.title }}</span>
                            <span class="mt-0.5 block text-xs leading-5 text-ink-600">
                              {{ voucherDiscountLabel(offer) }} · Hạn {{ formatVoucherDate(offer.expiresAt) }}
                            </span>
                          </span>
                          <span
                            class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                            :class="eligibilityClasses(eligibilityFor(offer).tone)"
                            data-testid="voucher-selection-eligibility"
                            :data-eligibility="eligibilityFor(offer).tone"
                          >
                            {{ eligibilityFor(offer).label }}
                          </span>
                        </span>
                        <span
                          v-for="reason in eligibilityFor(offer).reasons"
                          :key="reason"
                          class="mt-1.5 block text-xs leading-5"
                          :class="eligibilityFor(offer).tone === 'ineligible' ? 'text-warning-800' : 'text-ink-600'"
                        >
                          · {{ reason }}
                        </span>
                      </span>
                      <span
                        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                        :class="activeId === offer.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 text-transparent'"
                        aria-hidden="true"
                      >
                        <Check :size="14" :stroke-width="2.5" />
                      </span>
                    </button>
                  </li>
                </ul>
              </section>

              <details v-if="showCodeEntry" class="rounded-[var(--radius-md)] border border-ink-200 bg-ink-25 p-3.5">
                <summary class="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] text-sm font-medium text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                  <CircleHelp :size="17" class="text-ink-500" aria-hidden="true" />
                  Có mã ưu đãi khác?
                </summary>
                <div class="mt-3">
                  <label :for="codeId" class="block text-sm font-medium text-ink-900">Mã ưu đãi</label>
                  <p :id="codeHelpId" class="mt-1 text-xs leading-5 text-ink-600">
                    {{ codeEntryEnabled
                      ? 'Mã được gửi tới máy chủ để kiểm tra. Lưu mã không áp dụng giảm giá cho hóa đơn.'
                      : 'Nhập mã sẽ khả dụng khi máy chủ xác nhận. Mã hiện không được gửi đi.' }}
                  </p>
                  <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      :id="codeId"
                      v-model="manualCode"
                      data-testid="voucher-selection-code"
                      aria-label="Mã ưu đãi"
                      :aria-describedby="codeHelpId"
                      autocomplete="off"
                      maxlength="40"
                      placeholder="Nhập mã ưu đãi"
                      class="min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-600"
                      :disabled="!codeEntryEnabled"
                    />
                    <FhButton
                      data-testid="voucher-selection-code-submit"
                      variant="secondary"
                      size="md"
                      :disabled="!codeEntryEnabled || !manualCode.trim()"
                      @click="submitCode"
                    >
                      Kiểm tra
                    </FhButton>
                  </div>
                </div>
              </details>

              <div
                v-if="previewLoading"
                class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 text-sm leading-5 text-ink-700"
                role="status"
                data-testid="voucher-selection-preview-state"
              >Đang tải bản xem trước từ máy chủ…</div>
              <div
                v-else-if="previewMessage"
                class="flex flex-col gap-2 rounded-[var(--radius-sm)] border p-3 text-sm leading-5 sm:flex-row sm:items-center sm:justify-between"
                :class="previewMessageIsError ? 'border-warning-200 bg-warning-50 text-warning-900' : 'border-ink-200 bg-ink-50 text-ink-700'"
                :role="previewMessageIsError ? 'alert' : 'status'"
                data-testid="voucher-selection-preview-state"
              >
                <span>{{ previewMessage }}</span>
                <button
                  v-if="previewRetryable"
                  type="button"
                  class="min-h-11 shrink-0 rounded-[var(--radius-sm)] px-3 font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  data-testid="voucher-selection-preview-retry"
                  @click="emit('retryPreview')"
                >Thử lại</button>
              </div>

              <section
                v-if="serverPreview"
                class="rounded-[var(--radius-md)] border border-brand-200 bg-brand-50 p-3.5"
                data-testid="voucher-selection-preview"
                :data-claim-id="serverPreview.claimId"
                :data-scope-id="serverPreview.scopeId"
              >
                <h3 class="text-sm font-semibold text-ink-900">{{ activeReservation ? 'Voucher đã được giữ chỗ' : 'Bản xem trước do máy chủ cung cấp' }}</h3>
                <dl class="mt-2 space-y-1.5 text-xs leading-5 text-ink-700">
                  <div class="flex justify-between gap-3"><dt>Tổng hóa đơn gốc</dt><dd class="shrink-0 font-num"><FhMoney :amount="serverPreview.originalGrossVnd" /></dd></div>
                  <div class="flex justify-between gap-3"><dt>Cơ sở đủ điều kiện</dt><dd class="shrink-0 font-num"><FhMoney :amount="serverPreview.eligibleBaseVnd" /></dd></div>
                  <div class="flex justify-between gap-3"><dt>Trợ giá FixHome dự kiến</dt><dd class="shrink-0 font-num"><FhMoney :amount="serverPreview.fixHomeDiscountSubsidyVnd" /></dd></div>
                  <div class="flex justify-between gap-3 font-semibold text-ink-900"><dt>Khách hàng dự kiến thanh toán</dt><dd class="shrink-0 font-num"><FhMoney :amount="serverPreview.customerDueVnd" /></dd></div>
                </dl>
                <p v-if="activeReservation" class="mt-2 text-xs leading-5 text-warning-800">
                  Máy chủ đã giữ chỗ voucher. Việc giữ chỗ chưa xác nhận thanh toán; thời hạn do máy chủ quyết định.
                </p>
                <p v-else-if="serverPreview.paymentAvailable" class="mt-2 text-xs leading-5 text-ink-600">
                  Đây chỉ là bản xem trước. Chọn “Áp dụng voucher” để yêu cầu máy chủ giữ chỗ; hóa đơn chưa thay đổi.
                </p>
                <p v-else class="mt-2 text-xs leading-5 text-warning-800">
                  Máy chủ chưa cho phép giữ chỗ. Hóa đơn và tổng tiền hiện tại vẫn được giữ nguyên.
                </p>
              </section>

              <p v-if="applyError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 p-3 text-sm leading-5 text-danger-800" role="alert" data-testid="voucher-selection-apply-error">
                {{ applyError }}
              </p>

              <div v-if="activeOffer" class="rounded-[var(--radius-md)] border border-brand-200 bg-brand-50 p-3.5" data-testid="voucher-selection-selected">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Đang xem</p>
                <p class="mt-1 text-sm font-semibold leading-5 text-ink-900">{{ activeOffer.title }}</p>
                <p class="mt-1 text-xs leading-5 text-ink-700">{{ voucherDiscountLabel(activeOffer) }} · Hạn {{ formatVoucherDate(activeOffer.expiresAt) }}</p>
                <p class="mt-1 text-xs leading-5 text-ink-600">Chưa trừ vào hóa đơn. Số tiền thanh toán do máy chủ quyết định.</p>
              </div>
            </template>
          </div>

          <footer class="flex shrink-0 flex-col gap-2 border-t border-ink-100 bg-ink-25 p-4 sm:flex-row sm:items-center sm:justify-end">
            <FhButton data-testid="voucher-selection-cancel" variant="secondary" size="md" @click="requestClose">
              Huỷ
            </FhButton>
            <FhButton
              data-testid="voucher-selection-apply"
              variant="primary"
              size="md"
              :disabled="!canApply || applying || !!activeReservation"
              :loading="applying"
              @click="emit('apply')"
            >
              {{ applying ? 'Đang giữ chỗ…' : activeReservation ? 'Voucher đã được giữ chỗ' : serverPreview?.paymentAvailable === true ? 'Áp dụng voucher' : 'Máy chủ chưa sẵn sàng' }}
            </FhButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.voucher-sheet-enter-active,
.voucher-sheet-leave-active {
  transition: opacity 0.2s ease-out;
}
.voucher-sheet-enter-from,
.voucher-sheet-leave-to {
  opacity: 0;
}
.voucher-sheet-enter-active .voucher-sheet-panel {
  transition: transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.voucher-sheet-enter-from .voucher-sheet-panel,
.voucher-sheet-leave-to .voucher-sheet-panel {
  transform: translateY(16px);
}
@media (prefers-reduced-motion: reduce) {
  .voucher-sheet-enter-active,
  .voucher-sheet-leave-active,
  .voucher-sheet-enter-active .voucher-sheet-panel {
    transition: none;
  }
  .voucher-sheet-enter-from .voucher-sheet-panel,
  .voucher-sheet-leave-to .voucher-sheet-panel {
    transform: none;
  }
}
</style>
