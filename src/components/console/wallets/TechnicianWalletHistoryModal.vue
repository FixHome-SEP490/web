<script setup lang="ts">
import { computed } from 'vue';
import {
  X,
  Wallet,
  ArrowUp,
  ArrowDown,
} from 'lucide-vue-next';
import { FhSkeleton } from '../../../components';
import type { WalletTransaction } from '../../../api/wallet.api';
import { formatCurrencyVND, formatDateTimeVN, formatWalletTxType } from '../../../utils/formatters';
import { CONSOLE_LOAD_ERROR } from '../console-ui';

interface Props {
  open: boolean;
  technician: {
    id: string;
    name: string;
    balance: number;
    accountNumber?: string | null;
  } | null;
  transactions: WalletTransaction[];
  loading?: boolean;
  error?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: false,
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Map transaction details to clear Vietnamese user-friendly format
function txDetails(tx: WalletTransaction) {
  const meta = formatWalletTxType(tx.type, tx);
  const isCredit = meta.isCredit;

  let title = meta.label;
  if (tx.type === 'ONLINE_EARNING') {
    title = 'Thu nhập ròng (Đơn online)';
  } else if (tx.type === 'PLATFORM_FEE') {
    title = 'Khấu trừ phí nền tảng (Đơn offline)';
  } else if (tx.type === 'ADJUSTMENT') {
    title = isCredit ? 'Điều chỉnh thu Admin' : 'Điều chỉnh khấu trừ Admin';
  } else if (tx.type === 'WITHDRAW') {
    title = 'Rút tiền về ngân hàng';
  } else if (tx.type === 'TOP_UP') {
    title = 'Nạp tiền vào ví';
  } else if (tx.type === 'WITHDRAW_REFUND') {
    title = 'Hoàn tiền rút không thành công';
  }

  // Subtext description
  let desc = tx.description || '';
  if (tx.referenceId) {
    const code = tx.referenceId.startsWith('#') ? tx.referenceId : `#${tx.referenceId}`;
    desc = desc ? `${desc} (${code})` : `Mã liên quan: ${code}`;
  }

  // Status tag
  let statusBadge = { label: 'Thành công', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (!isCredit) {
    statusBadge = { label: 'Đã trừ', class: 'bg-rose-50 text-rose-700 border-rose-200' };
  }

  return {
    title,
    desc,
    isCredit,
    statusBadge,
  };
}

const totalCount = computed(() => props.transactions.length);
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div
        v-if="open && technician"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/45 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <div
          class="relative flex w-full max-w-[680px] max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white p-6 shadow-2xl transition-all"
        >
          <!-- Header (Fixed) -->
          <div class="flex items-start justify-between gap-3 border-b border-ink-100/80 pb-4">
            <div class="flex items-center gap-3.5">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100/80 text-blue-600 shadow-2xs">
                <Wallet :size="22" :stroke-width="2" aria-hidden="true" />
              </div>
              <div>
                <h3 id="tx-modal-title" class="text-base font-bold text-ink-900">
                  Lịch sử ví: {{ technician.name }}
                </h3>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                  <span>Số dư hiện tại: <strong class="font-num text-ink-900 font-semibold">{{ formatCurrencyVND(technician.balance) }}</strong></span>
                  <span v-if="technician.accountNumber" class="text-ink-400">· Số TK: <span class="font-num">{{ technician.accountNumber }}</span></span>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="cursor-pointer rounded-xl p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Đóng"
              @click="emit('close')"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <!-- Body: List of Transactions (Scrollable, no heavy cards) -->
          <div class="flex-1 overflow-y-auto overscroll-contain py-2 pr-1">
            <!-- Loading -->
            <div v-if="loading" class="space-y-3 py-4">
              <FhSkeleton height="54px" :count="5" />
            </div>

            <!-- Error -->
            <p v-else-if="error" class="py-12 text-center text-sm text-danger-700">
              {{ CONSOLE_LOAD_ERROR }}
            </p>

            <!-- Empty -->
            <div v-else-if="transactions.length === 0" class="py-12 text-center text-sm text-ink-500">
              <p class="font-medium text-ink-700">Chưa có giao dịch nào.</p>
              <p class="mt-1 text-xs text-ink-400">Kỹ thuật viên chưa phát sinh biến động số dư trong ví.</p>
            </div>

            <!-- Transaction Items -->
            <ul v-else class="divide-y divide-ink-100/80">
              <li
                v-for="tx in transactions"
                :key="tx.id"
                class="flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-ink-50/50 rounded-xl px-2"
              >
                <!-- Left: Direction Icon + Name & Date/Description -->
                <div class="flex min-w-0 items-center gap-3">
                  <!-- Circular Direction Icon -->
                  <div
                    v-if="txDetails(tx).isCredit"
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600"
                    aria-hidden="true"
                  >
                    <ArrowUp :size="16" :stroke-width="2.5" />
                  </div>
                  <div
                    v-else
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-600"
                    aria-hidden="true"
                  >
                    <ArrowDown :size="16" :stroke-width="2.5" />
                  </div>

                  <!-- Text information -->
                  <div class="min-w-0">
                    <div class="truncate text-xs font-bold text-ink-900 sm:text-sm">
                      {{ txDetails(tx).title }}
                    </div>
                    <div class="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-500">
                      <span class="font-num text-ink-600">{{ formatDateTimeVN(tx.createdAt) }}</span>
                      <span v-if="txDetails(tx).desc" class="text-ink-400">· {{ txDetails(tx).desc }}</span>
                    </div>
                    <div class="mt-0.5 text-[11px] text-ink-400">
                      Số dư sau: <span class="font-num font-medium text-ink-600">{{ formatCurrencyVND(tx.balanceAfter) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Right: Amount + Status Tag -->
                <div class="flex shrink-0 flex-col items-end gap-1 text-right">
                  <div
                    class="font-num text-xs font-bold sm:text-sm"
                    :class="txDetails(tx).isCredit ? 'text-emerald-600' : 'text-rose-600'"
                  >
                    {{ txDetails(tx).isCredit ? '+' : '-' }}{{ formatCurrencyVND(tx.amount) }}
                  </div>
                  <span
                    class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    :class="txDetails(tx).statusBadge.class"
                  >
                    {{ txDetails(tx).statusBadge.label }}
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <!-- Footer (Fixed) -->
          <div class="flex items-center justify-between border-t border-ink-100/80 pt-3.5">
            <div class="flex items-center gap-1.5 text-xs text-ink-500">
              <span class="flex h-2 w-2 rounded-full bg-blue-500" />
              <span>Tổng số giao dịch: <strong class="font-num text-ink-800 font-semibold">{{ totalCount }}</strong></span>
            </div>

            <button
              type="button"
              class="cursor-pointer rounded-xl border border-ink-200 bg-white px-5 py-2 text-xs font-semibold text-ink-700 shadow-2xs transition-colors hover:bg-ink-50 active:bg-ink-100"
              @click="emit('close')"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
