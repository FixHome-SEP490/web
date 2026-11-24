<script setup lang="ts">
import { computed } from 'vue';
import {
  X,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-vue-next';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { FhMoney } from '../../../components';
import type { AdminPaymentRow, PaymentPurpose, PaymentStatus } from '../../../api/admin-payments.api';
import { vnDateTimeString } from '../../../utils/vn-time';

const props = defineProps<{
  open: boolean;
  payment: AdminPaymentRow | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const copied = ref(false);

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Đang chờ',
  verified: 'Đã xác nhận',
  failed: 'Thất bại',
  refunded: 'Đã hoàn',
  cancelled: 'Đã huỷ',
};

const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  invoice: 'Thanh toán hoá đơn',
  commission_due: 'Thợ trả công nợ',
  wallet_top_up: 'Nạp ví',
};

const PROVIDER_LABELS: Record<string, string> = {
  vnpay: 'Cổng VNPay',
  wallet: 'Ví FixHome',
  none: 'Không qua cổng',
};

const ROLE_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  technician: 'Kỹ thuật viên',
  service_manager: 'Quản lý dịch vụ',
  admin: 'Quản trị viên',
};

const FAILURE_LABELS: Record<string, string> = {
  '24': 'Khách huỷ giao dịch',
  '11': 'Hết thời gian chờ thanh toán',
  '51': 'Tài khoản không đủ số dư',
  '65': 'Vượt hạn mức giao dịch trong ngày',
  '75': 'Ngân hàng đang bảo trì',
  ORDER_CANCELLED: 'Đơn đã huỷ trước khi thanh toán xong',
};

const statusBadgeClass = computed(() => {
  if (!props.payment) return '';
  switch (props.payment.status) {
    case 'verified':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-ink-100 text-ink-700 border-ink-200';
  }
});

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  copied.value = true;
  toast.success(`Đã sao chép ${label}`);
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div
        v-if="open && payment"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-xs"
        @click.self="emit('close')"
      >
        <div
          role="dialog"
          aria-modal="true"
          class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ink-100 bg-white p-6 shadow-2xl transition-all"
        >
          <!-- Header -->
          <div class="flex items-start justify-between pb-4 border-b border-ink-100">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-ink-400">Chi tiết đối soát</span>
                <span
                  class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                  :class="statusBadgeClass"
                >
                  {{ STATUS_LABELS[payment.status] ?? 'Chưa rõ' }}
                </span>
              </div>
              <h3 class="text-lg font-bold text-ink-900">
                Giao dịch {{ payment.orderCode ?? payment.id.slice(0, 8).toUpperCase() }}
              </h3>
            </div>
            <button
              type="button"
              class="cursor-pointer rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Đóng"
              @click="emit('close')"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="mt-4 space-y-4 text-sm">
            <!-- Amount Card -->
            <div class="flex items-center justify-between rounded-xl bg-ink-50/80 p-4">
              <span class="text-xs font-medium text-ink-500">Số tiền giao dịch</span>
              <span class="font-num text-xl font-bold text-ink-900">
                <FhMoney :amount="payment.amount" />
              </span>
            </div>

            <!-- Details List -->
            <div class="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white px-4 py-2 text-xs">
              <!-- Mã giao dịch nội bộ -->
              <div class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Mã hệ thống (ID)</span>
                <div class="flex items-center gap-1.5 font-num font-medium text-ink-800">
                  <span class="max-w-[200px] truncate">{{ payment.id }}</span>
                  <button
                    type="button"
                    class="cursor-pointer text-ink-400 hover:text-brand-600"
                    title="Sao chép"
                    @click="copyToClipboard(payment.id, 'mã hệ thống')"
                  >
                    <Check v-if="copied" :size="13" class="text-emerald-600" />
                    <Copy v-else :size="13" />
                  </button>
                </div>
              </div>

              <!-- Loại giao dịch -->
              <div class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Loại giao dịch</span>
                <span class="font-medium text-ink-900">
                  {{ PURPOSE_LABELS[payment.purpose] ?? 'Khác' }}
                </span>
              </div>

              <!-- Đơn hàng liên quan -->
              <div v-if="payment.orderCode" class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Đơn sửa chữa</span>
                <router-link
                  v-if="payment.orderId"
                  :to="`/console/orders/${payment.orderId}`"
                  class="flex items-center gap-1 font-num font-semibold text-brand-600 hover:underline"
                  @click="emit('close')"
                >
                  {{ payment.orderCode }}
                  <ExternalLink :size="12" />
                </router-link>
                <span v-else class="font-num text-ink-800">{{ payment.orderCode }}</span>
              </div>

              <!-- Người trả -->
              <div class="flex items-start justify-between py-2.5">
                <span class="text-ink-500">Người trả</span>
                <div class="text-right">
                  <div class="font-medium text-ink-900">
                    {{ payment.payerName }} ({{ ROLE_LABELS[payment.payerRole] ?? 'Khác' }})
                  </div>
                  <div class="text-[11px] text-ink-400">{{ payment.payerEmail }}</div>
                </div>
              </div>

              <!-- Cổng thanh toán -->
              <div class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Cổng thanh toán</span>
                <span class="font-medium text-ink-800">
                  {{ PROVIDER_LABELS[payment.provider ?? 'none'] ?? payment.provider }}
                </span>
              </div>

              <!-- Mã tham chiếu cổng -->
              <div v-if="payment.providerReference" class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Mã tham chiếu cổng</span>
                <span class="font-num font-medium text-ink-800">{{ payment.providerReference }}</span>
              </div>

              <!-- Thời gian yêu cầu -->
              <div class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Thời gian khởi tạo</span>
                <span class="font-num text-ink-700">{{ vnDateTimeString(payment.requestedAt) }}</span>
              </div>

              <!-- Thời gian xác nhận -->
              <div v-if="payment.verifiedAt" class="flex items-center justify-between py-2.5">
                <span class="text-ink-500">Thời gian xác nhận</span>
                <span class="font-num font-medium text-emerald-700">{{ vnDateTimeString(payment.verifiedAt) }}</span>
              </div>

              <!-- Lỗi (nếu có) -->
              <div v-if="payment.failureCode" class="flex items-start justify-between py-2.5 text-rose-700">
                <span class="flex items-center gap-1 font-medium">
                  <AlertCircle :size="14" />
                  Mã lỗi
                </span>
                <div class="text-right">
                  <span class="font-num font-semibold">{{ payment.failureCode }}</span>
                  <div class="text-[11px]">{{ FAILURE_LABELS[payment.failureCode] ?? 'Cổng thanh toán báo lỗi' }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              class="cursor-pointer rounded-xl bg-ink-100 px-4 py-2 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-200"
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
