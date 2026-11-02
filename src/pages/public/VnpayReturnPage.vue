<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCircle2, Clock3, XCircle } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import { ordersApi } from '../../api/orders.api';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isTechnician = authStore.user?.role === 'TECHNICIAN';

// Return query values are untrusted. They can start a server check, but only
// the order's paymentStatus can confirm a successful invoice payment.
const vnpayOk = computed(() => route.query.payment === 'success');
const orderId = computed(() => typeof route.query.orderId === 'string' ? route.query.orderId.trim() : '');

type Phase = 'checking' | 'paid' | 'pending' | 'failed';
const phase = ref<Phase>('failed');

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollDeadline = 0;
let pollGeneration = 0;

const pollOrder = async (id: string, generation: number) => {
  try {
    const order = await ordersApi.getOrder(id);
    if (generation !== pollGeneration) return;
    if (order.paymentStatus === 'PAID') {
      phase.value = 'paid';
      return;
    }
  } catch {
    if (generation !== pollGeneration) return;
    // Keep polling; the order may not be readable yet right after redirect.
  }
  const remaining = pollDeadline - Date.now();
  if (remaining > 0) {
    pollTimer = setTimeout(() => void pollOrder(id, generation), Math.min(2000, remaining));
  } else {
    phase.value = 'pending';
  }
};

watch([() => route.query.payment, () => route.query.orderId], () => {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollGeneration += 1;

  if (!vnpayOk.value) {
    phase.value = 'failed';
    return;
  }

  const id = orderId.value;
  if (!id) {
    phase.value = 'pending';
    return;
  }

  phase.value = 'checking';
  pollDeadline = Date.now() + 15000;
  void pollOrder(id, pollGeneration);
}, { immediate: true, flush: 'sync' });

let redirectCountdownTimer: ReturnType<typeof setInterval> | null = null;
const countdown = ref(3);

const clearRedirectCountdown = () => {
  if (redirectCountdownTimer) clearInterval(redirectCountdownTimer);
  redirectCountdownTimer = null;
};

const navigateToReview = () => {
  clearRedirectCountdown();
  if (phase.value !== 'paid') return;
  if (orderId.value && !isTechnician) {
    router.push(`/app/orders/${orderId.value}?autoReview=true`);
  } else {
    router.push(isTechnician ? '/tech/wallet' : '/app/orders');
  }
};

watch([phase, orderId], ([newPhase, id]) => {
  clearRedirectCountdown();
  if (newPhase === 'paid' && id && !isTechnician) {
    countdown.value = 3;
    redirectCountdownTimer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) {
        navigateToReview();
      }
    }, 1000);
  }
}, { flush: 'sync' });

onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
  pollGeneration += 1;
  clearRedirectCountdown();
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ink-50 p-4">
    <div class="bg-white rounded-2xl max-w-sm w-full p-8 space-y-5 shadow-xl text-center border border-ink-100">
      <div v-if="phase === 'checking'" class="mx-auto w-12" aria-hidden="true"><FhSkeleton width="48px" height="48px" rounded="full" /></div>
      <CheckCircle2 v-else-if="phase === 'paid'" :size="48" class="text-emerald-600 mx-auto" />
      <Clock3 v-else-if="phase === 'pending'" :size="48" class="text-amber-500 mx-auto" />
      <XCircle v-else :size="48" class="text-rose-600 mx-auto" />

      <div class="space-y-1">
        <h1 class="text-xl font-bold text-ink-900">
          {{
            phase === 'checking' ? 'Đang xác nhận thanh toán...'
            : phase === 'paid' ? 'Thanh toán thành công!'
            : phase === 'pending' ? 'Chưa xác nhận được kết quả thanh toán'
            : 'Thanh toán chưa hoàn tất'
          }}
        </h1>
        <div v-if="phase === 'checking'" class="space-y-2 pt-1" aria-busy="true" aria-label="Đang xác nhận thanh toán" data-testid="vnpay-checking">
          <span class="block mx-auto w-4/5"><FhSkeleton height="12px" /></span>
          <span class="block mx-auto w-3/5"><FhSkeleton height="12px" /></span>
        </div>
        <p v-else class="text-xs text-ink-500">
          {{
            phase === 'paid' && orderId && !isTechnician
              ? `Hóa đơn đã được thanh toán thành công. Tự động chuyển tới trang đánh giá dịch vụ sau ${countdown}s...`
            : phase === 'paid'
              ? 'Hóa đơn của bạn đã được ghi nhận thanh toán qua VNPay.'
            : phase === 'pending' ? 'Vui lòng kiểm tra trạng thái đơn hàng trước khi thanh toán lại.'
            : 'Giao dịch VNPay không thành công hoặc đã bị hủy. Bạn có thể thử lại từ trang đơn hàng.'
          }}
        </p>
      </div>

      <div v-if="phase === 'paid' && orderId && !isTechnician" class="space-y-2 pt-2">
        <FhButton
          variant="primary"
          size="md"
          class="w-full shadow-sm"
          @click="navigateToReview"
        >
          Đánh giá kỹ thuật viên ngay
        </FhButton>
        <FhButton
          variant="secondary"
          size="sm"
          class="w-full"
          @click="router.push('/app/orders')"
        >
          Về danh sách đơn
        </FhButton>
      </div>

      <div v-else-if="phase === 'checking'" class="pt-2" aria-hidden="true">
        <FhSkeleton height="40px" rounded="md" />
      </div>

      <div v-else class="pt-2">
        <FhButton
          variant="primary"
          size="md"
          class="w-full"
          @click="router.push(isTechnician ? '/tech/wallet' : '/app/orders')"
        >
          {{ isTechnician ? 'Xem ví kỹ thuật viên' : 'Xem đơn hàng của tôi' }}
        </FhButton>
      </div>
    </div>
  </div>
</template>
