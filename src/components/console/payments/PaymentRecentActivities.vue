<script setup lang="ts">
import { computed } from 'vue';
import { Check, Clock, X } from 'lucide-vue-next';
import type { AdminPaymentRow, PaymentStatus } from '../../../api/admin-payments.api';
import { vnRelativeTime } from '../../../utils/vn-time';

const props = withDefaults(
  defineProps<{
    payments: AdminPaymentRow[];
    loading?: boolean;
  }>(),
  {
    payments: () => [],
    loading: false,
  },
);

const emit = defineEmits<{
  (e: 'viewAll'): void;
  (e: 'select', payment: AdminPaymentRow): void;
}>();

const recentList = computed(() => props.payments.slice(0, 5));

function activityTitle(status: PaymentStatus): string {
  switch (status) {
    case 'verified':
      return 'Thanh toán thành công';
    case 'pending':
      return 'Giao dịch đang chờ';
    case 'failed':
      return 'Giao dịch thất bại';
    case 'refunded':
      return 'Hoàn tiền thành công';
    case 'cancelled':
      return 'Giao dịch đã huỷ';
    default:
      return 'Giao dịch phát sinh';
  }
}

function displayCode(r: AdminPaymentRow): string {
  if (r.orderCode) return r.orderCode;
  if (r.providerReference) return `REF-${r.providerReference}`;
  return `FD-${r.id.slice(0, 8).toUpperCase()}`;
}
</script>

<template>
  <div class="flex h-full flex-col justify-between rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
    <!-- Header -->
    <div class="flex items-center justify-between pb-3">
      <h3 class="text-sm font-bold text-ink-900">Hoạt động gần đây</h3>
      <button
        type="button"
        class="cursor-pointer text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
        @click="emit('viewAll')"
      >
        Xem tất cả
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && recentList.length === 0" class="flex flex-1 items-center justify-center py-6 text-xs text-ink-500">
      Chưa có hoạt động giao dịch nào.
    </div>

    <!-- Activities List -->
    <div v-else class="flex flex-1 flex-col justify-around gap-2.5">
      <div
        v-for="item in recentList"
        :key="item.id"
        class="group flex cursor-pointer items-center justify-between gap-3 rounded-lg p-1.5 transition-colors hover:bg-ink-50/70"
        @click="emit('select', item)"
      >
        <!-- Icon & Title + Code -->
        <div class="flex min-w-0 items-center gap-2.5">
          <!-- Status icon circle -->
          <div
            v-if="item.status === 'verified'"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600"
            aria-hidden="true"
          >
            <Check :size="14" :stroke-width="2.5" />
          </div>
          <div
            v-else-if="item.status === 'pending'"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-600"
            aria-hidden="true"
          >
            <Clock :size="14" :stroke-width="2.5" />
          </div>
          <div
            v-else
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-600"
            aria-hidden="true"
          >
            <X :size="14" :stroke-width="2.5" />
          </div>

          <!-- Text -->
          <div class="min-w-0">
            <div class="truncate text-xs font-medium text-ink-900 group-hover:text-brand-600">
              {{ activityTitle(item.status) }}
            </div>
            <div class="truncate font-num text-[11px] text-ink-400">
              {{ displayCode(item) }}
            </div>
          </div>
        </div>

        <!-- Relative Time -->
        <span class="shrink-0 text-right font-num text-[11px] text-ink-400 whitespace-nowrap">
          {{ vnRelativeTime(item.requestedAt) }}
        </span>
      </div>
    </div>
  </div>
</template>
