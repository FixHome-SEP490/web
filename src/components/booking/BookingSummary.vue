<script setup lang="ts">
// "Yêu cầu của bạn" (PO 20/10/2026): the one place that repeats what was chosen and
// holds the step's only primary action. Wide screens: a card that stays beside the form.
// Phones: a bar fixed to the bottom with the price and the same action.
import { computed } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import type { SummaryPrice } from './visit-device-pricing';

export type { SummaryPrice } from './visit-device-pricing';

export interface SummaryDevice {
  label: string;
  serviceName: string;
  deviceText: string | null;
  price: SummaryPrice;
}

const props = withDefaults(defineProps<{
  serviceName?: string | null;
  deviceText?: string | null;
  scheduleText?: string | null;
  addressText?: string | null;
  price: SummaryPrice;
  devices?: SummaryDevice[];
  ctaLabel: string;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  backLabel?: string | null;
  /** Test id of the primary action, so each step keeps its own. */
  ctaTestid?: string;
}>(), { serviceName: null, deviceText: null, scheduleText: null, addressText: null, devices: undefined, ctaDisabled: false, ctaLoading: false, backLabel: null, ctaTestid: 'booking-summary-next' });

const emit = defineEmits<{ (e: 'next'): void; (e: 'back'): void }>();

const priceNote = computed(() => {
  switch (props.price.kind) {
    case 'firm': return 'Tiền công theo phạm vi đã xác nhận; chưa gồm linh kiện FixHome hoặc tiền công phát sinh.';
    case 'range': return 'Giá tham khảo; kỹ thuật viên xác nhận sau khi khảo sát';
    case 'survey': return 'Kỹ thuật viên báo giá tại nhà, bạn duyệt trước khi sửa';
    case 'partial': return `+ ${props.price.unresolvedCount} máy chờ khảo sát báo giá. Chưa phải tổng ${props.devices?.length ? `${props.devices.length} máy` : 'cả lượt'}.`;
    default: return 'Chọn dịch vụ để xem giá';
  }
});

const mobileCtaLabel = computed(() => props.ctaLabel.replace(/^(Lưu máy \d+) trước khi tiếp tục$/, '$1 để tiếp tục'));

/** The phone bar has one short line above the amount. */
const barNote = computed(() => {
  switch (props.price.kind) {
    case 'firm': return 'Tiền công đã xác định; chưa gồm linh kiện FixHome hoặc tiền công phát sinh';
    case 'range': return 'Giá tham khảo';
    case 'survey': return 'Thợ báo giá tại nhà';
    case 'partial': return 'Tiền công đã xác định';
    default: return 'Chọn dịch vụ để xem giá';
  }
});
</script>

<template>
  <!-- Wide screens -->
  <aside class="hidden min-w-0 lg:block lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto rounded-2xl border border-ink-200 bg-white p-6" aria-label="Yêu cầu của bạn" data-testid="booking-summary">
    <h2 class="text-base font-semibold text-ink-900">Yêu cầu của bạn <span v-if="devices?.length" class="font-normal text-ink-600">· {{ devices.length }} thiết bị</span></h2>
    <dl class="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
      <dt class="text-ink-500">Dịch vụ</dt>
      <dd class="min-w-0 break-words font-medium text-ink-900" :class="!serviceName && 'font-normal text-ink-400'" data-testid="booking-summary-service">{{ devices?.length ? `${devices.length} thiết bị` : serviceName || 'Chưa chọn' }}</dd>
      <template v-if="deviceText && !devices?.length">
        <dt class="text-ink-500">Thiết bị</dt>
        <dd class="font-medium text-ink-900" data-testid="booking-summary-device">{{ deviceText }}</dd>
      </template>
      <template v-if="addressText">
        <dt class="text-ink-500">Địa chỉ</dt>
        <dd class="break-words text-ink-900">{{ addressText }}</dd>
      </template>
      <dt class="text-ink-500">Lịch hẹn</dt>
      <dd class="min-w-0 break-words" :class="scheduleText ? 'font-medium text-ink-900' : 'text-ink-400'" data-testid="booking-summary-schedule">{{ scheduleText || 'Chọn ở bước sau' }}</dd>
    </dl>
    <section v-if="devices?.length" class="mt-4 border-t border-ink-100 pt-3" aria-label="Dịch vụ từng thiết bị" data-testid="booking-summary-devices">
      <ol class="space-y-3">
        <li v-for="device in devices" :key="device.label" class="min-w-0 text-sm">
          <div class="space-y-1">
            <div class="min-w-0">
              <p class="break-words font-medium text-ink-900">{{ device.label }} · {{ device.serviceName }}</p>
              <p v-if="device.deviceText" class="break-words text-sm text-ink-600">{{ device.deviceText }}</p>
            </div>
            <span v-if="device.price.kind === 'firm'" class="shrink-0 font-semibold text-ink-900 font-num"><FhMoney :amount="device.price.amount" /></span>
            <span v-else-if="device.price.kind === 'range'" class="block text-sm text-ink-700">Tham khảo <span class="font-num"><FhMoney :amount="device.price.min" /> – <FhMoney :amount="device.price.max" /></span></span>
            <span v-else-if="device.price.kind === 'survey'" class="block text-sm text-ink-700"><template v-if="device.price.from">Tham khảo <FhMoney :amount="device.price.from" /> · </template>Khảo sát, báo giá</span>
            <span v-else class="shrink-0 text-xs text-ink-500">Chưa xác định</span>
          </div>
        </li>
      </ol>
    </section>
    <div class="my-5 h-px bg-ink-100"></div>
    <div class="flex flex-wrap items-baseline justify-between gap-2" data-testid="booking-summary-price">
      <span class="text-sm text-ink-600">{{ price.kind === 'partial' ? 'Tiền công đã xác định' : price.kind === 'range' ? 'Tiền công tham khảo' : 'Tiền công' }}</span>
      <span v-if="price.kind === 'firm'" class="text-xl font-semibold text-ink-900 font-num"><FhMoney :amount="price.amount" /></span>
      <span v-else-if="price.kind === 'range'" class="text-base font-semibold text-ink-800 font-num"><FhMoney :amount="price.min" /> – <FhMoney :amount="price.max" /></span>
      <span v-else-if="price.kind === 'survey' && price.from" class="text-base font-semibold text-ink-800 font-num">Tham khảo <FhMoney :amount="price.from" /></span>
      <span v-else-if="price.kind === 'partial' && price.confirmedTotal > 0" class="text-base font-semibold text-ink-800 font-num"><FhMoney :amount="price.confirmedTotal" /></span>
      <span v-else-if="price.kind === 'survey'" class="text-sm text-ink-700">Khảo sát</span>
      <span v-else-if="price.kind === 'partial'" class="text-sm text-ink-700">Chờ báo giá</span>
      <span v-else class="text-sm text-ink-400">—</span>
    </div>
    <p class="mt-2 text-sm leading-relaxed text-ink-600">{{ priceNote }}</p>
    <p v-if="price.kind === 'firm'" class="mt-1 text-xs leading-relaxed text-ink-500">Kỹ thuật viên gửi báo giá phần phát sinh; bạn duyệt trước khi thực hiện.</p>
    <FhButton class="mt-5 w-full" size="lg" :disabled="ctaDisabled" :loading="ctaLoading" :data-testid="ctaTestid" @click="emit('next')">{{ ctaLabel }}</FhButton>
    <FhButton v-if="backLabel" variant="ghost" size="md" class="mt-2 w-full" data-testid="booking-summary-back" @click="emit('back')">
      <ArrowLeft :size="15" class="mr-1.5" aria-hidden="true" /> {{ backLabel }}
    </FhButton>
  </aside>

  <!-- Phones and tablets: right above the bottom tab bar; the route's actionBar meta lifts the chat button over it. -->
  <div class="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-30 border-t border-ink-200 bg-white px-4 py-3 shadow-(--shadow-e2) lg:hidden" data-testid="booking-summary-bar">
    <div class="mx-auto max-w-3xl space-y-2">
      <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-ink-600" data-testid="booking-summary-bar-price">
        <span>{{ devices?.length ? `${devices.length} thiết bị · ${barNote}` : barNote }}</span>
        <span v-if="price.kind === 'firm'" class="font-num text-lg font-semibold text-ink-900"><FhMoney :amount="price.amount" /></span>
        <span v-else-if="price.kind === 'range'" class="font-num text-sm font-semibold text-ink-900"><FhMoney :amount="price.min" /> – <FhMoney :amount="price.max" /></span>
        <span v-else-if="price.kind === 'partial'" class="text-ink-700"><template v-if="price.confirmedTotal > 0"><FhMoney :amount="price.confirmedTotal" /></template></span>
        <span v-else-if="price.kind === 'survey' && price.from" class="font-num text-sm text-ink-900">Tham khảo <FhMoney :amount="price.from" /></span>
      </div>
      <p v-if="price.kind === 'firm'" class="text-xs leading-relaxed text-ink-600">Kỹ thuật viên gửi báo giá phần phát sinh; bạn duyệt trước khi thực hiện.</p>
      <p v-else-if="price.kind === 'partial'" class="text-xs leading-relaxed text-ink-700">{{ priceNote }}</p>
      <div class="flex items-center gap-2">
        <button v-if="backLabel" type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" :aria-label="backLabel" @click="emit('back')">
          <ArrowLeft :size="18" aria-hidden="true" />
        </button>
        <FhButton size="lg" class="min-w-0 flex-1 px-3 text-sm sm:text-base" :aria-label="ctaLabel" :disabled="ctaDisabled" :loading="ctaLoading" :data-testid="`${ctaTestid}-bar`" @click="emit('next')">{{ mobileCtaLabel }}</FhButton>
      </div>
    </div>
  </div>
</template>
