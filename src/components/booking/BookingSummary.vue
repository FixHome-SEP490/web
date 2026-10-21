<script setup lang="ts">
// "Yêu cầu của bạn" (PO 20/10/2026): the one place that repeats what was chosen and
// holds the step's only primary action. Wide screens: a card that stays beside the form.
// Phones: a bar fixed to the bottom with the price and the same action.
import { computed } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';

export type SummaryPrice =
  | { kind: 'none' }
  /** A price the server confirmed (or a legacy fixed price): the only blue amount. */
  | { kind: 'firm'; amount: number }
  /** Approved tiers, the device facts still decide which one. */
  | { kind: 'range'; min: number; max: number }
  /** A technician quotes on site; `from` is a nonbinding reference. */
  | { kind: 'survey'; from: number | null; to: number | null };

const props = withDefaults(defineProps<{
  serviceName?: string | null;
  deviceText?: string | null;
  scheduleText?: string | null;
  addressText?: string | null;
  price: SummaryPrice;
  ctaLabel: string;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  backLabel?: string | null;
  /** Test id of the primary action, so each step keeps its own. */
  ctaTestid?: string;
}>(), { serviceName: null, deviceText: null, scheduleText: null, addressText: null, ctaDisabled: false, ctaLoading: false, backLabel: null, ctaTestid: 'booking-summary-next' });

const emit = defineEmits<{ (e: 'next'): void; (e: 'back'): void }>();

const priceNote = computed(() => {
  switch (props.price.kind) {
    case 'firm': return 'Tiền công, chưa gồm linh kiện';
    case 'range': return 'Chọn loại máy để ra giá đúng';
    case 'survey': return 'Thợ báo giá tại nhà, bạn duyệt trước khi sửa';
    default: return 'Chọn dịch vụ để xem giá';
  }
});

/** The phone bar has one short line above the amount. */
const barNote = computed(() => {
  switch (props.price.kind) {
    case 'firm': return 'Tiền công';
    case 'range': return 'Giá tham khảo';
    case 'survey': return 'Thợ báo giá tại nhà';
    default: return 'Chọn dịch vụ để xem giá';
  }
});
</script>

<template>
  <!-- Wide screens -->
  <aside class="hidden lg:block lg:sticky lg:top-24 rounded-2xl border border-ink-200 bg-white p-6" aria-label="Yêu cầu của bạn" data-testid="booking-summary">
    <h2 class="text-base font-semibold text-ink-900">Yêu cầu của bạn</h2>
    <dl class="mt-4 grid grid-cols-[6rem_minmax(0,1fr)] gap-y-3 text-sm">
      <dt class="text-ink-500">Dịch vụ</dt>
      <dd class="font-medium text-ink-900" :class="!serviceName && 'font-normal text-ink-400'" data-testid="booking-summary-service">{{ serviceName || 'Chưa chọn' }}</dd>
      <template v-if="deviceText">
        <dt class="text-ink-500">Thiết bị</dt>
        <dd class="font-medium text-ink-900" data-testid="booking-summary-device">{{ deviceText }}</dd>
      </template>
      <template v-if="addressText">
        <dt class="text-ink-500">Địa chỉ</dt>
        <dd class="text-ink-900 line-clamp-2">{{ addressText }}</dd>
      </template>
      <dt class="text-ink-500">Lịch hẹn</dt>
      <dd :class="scheduleText ? 'font-medium text-ink-900' : 'text-ink-400'" data-testid="booking-summary-schedule">{{ scheduleText || 'Chọn ở bước sau' }}</dd>
    </dl>
    <div class="my-5 h-px bg-ink-100"></div>
    <div class="flex items-baseline justify-between gap-3" data-testid="booking-summary-price">
      <span class="text-sm text-ink-500">Tiền công</span>
      <span v-if="price.kind === 'firm'" class="text-2xl font-semibold text-brand-700 font-num"><FhMoney :amount="price.amount" /></span>
      <span v-else-if="price.kind === 'range'" class="text-base font-semibold text-ink-800 font-num"><FhMoney :amount="price.min" /> – <FhMoney :amount="price.max" /></span>
      <span v-else-if="price.kind === 'survey' && price.from" class="text-base font-semibold text-ink-800 font-num">Tham khảo <FhMoney :amount="price.from" /></span>
      <span v-else-if="price.kind === 'survey'" class="text-sm text-ink-700">Khảo sát</span>
      <span v-else class="text-sm text-ink-400">—</span>
    </div>
    <p class="mt-1 text-right text-xs text-ink-500">{{ priceNote }}</p>
    <FhButton class="mt-5 w-full" size="lg" :disabled="ctaDisabled" :loading="ctaLoading" :data-testid="ctaTestid" @click="emit('next')">{{ ctaLabel }}</FhButton>
    <FhButton v-if="backLabel" variant="ghost" size="md" class="mt-2 w-full" data-testid="booking-summary-back" @click="emit('back')">
      <ArrowLeft :size="15" class="mr-1.5" aria-hidden="true" /> {{ backLabel }}
    </FhButton>
  </aside>

  <!-- Phones and tablets: right above the bottom tab bar; the route's actionBar meta lifts the chat button over it. -->
  <div class="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-30 border-t border-ink-200 bg-white px-4 py-3 shadow-(--shadow-e2) lg:hidden" data-testid="booking-summary-bar">
    <div class="mx-auto flex max-w-3xl items-center gap-3">
      <button v-if="backLabel" type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-200 text-ink-700" :aria-label="backLabel" @click="emit('back')">
        <ArrowLeft :size="18" aria-hidden="true" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs text-ink-500">{{ barNote }}</p>
        <p class="truncate font-num">
          <span v-if="price.kind === 'firm'" class="text-lg font-semibold text-brand-700"><FhMoney :amount="price.amount" /></span>
          <span v-else-if="price.kind === 'range'" class="text-sm font-semibold text-ink-800"><FhMoney :amount="price.min" /> – <FhMoney :amount="price.max" /></span>
          <span v-else-if="price.kind === 'survey' && price.from" class="text-sm font-semibold text-ink-800">Tham khảo <FhMoney :amount="price.from" /></span>
          <span v-else class="text-sm text-ink-700">{{ serviceName || 'Chưa chọn dịch vụ' }}</span>
        </p>
      </div>
      <FhButton size="lg" class="shrink-0" :disabled="ctaDisabled" :loading="ctaLoading" :data-testid="`${ctaTestid}-bar`" @click="emit('next')">{{ ctaLabel }}</FhButton>
    </div>
  </div>
</template>
