<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-vue-next';
import { FhButton } from '../../components';
import { ordersApi } from '../../api/orders.api';

const route = useRoute();
const router = useRouter();

// VNPay's own response code (signature-verified server-side) tells us whether
// the bank accepted the charge, but paymentStatus only flips once the async
// IPN webhook lands — poll the order for a few seconds so we never show
// "success" while the order still reads UNPAID.
const vnpayOk = route.query.payment === 'success';
const orderId = typeof route.query.orderId === 'string' ? route.query.orderId : '';

type Phase = 'checking' | 'paid' | 'pending' | 'failed';
const phase = ref<Phase>(vnpayOk && orderId ? 'checking' : vnpayOk ? 'paid' : 'failed');

let pollTimer: ReturnType<typeof setTimeout> | null = null;
const pollDeadline = Date.now() + 15000;

const pollOrder = async () => {
  try {
    const order = await ordersApi.getOrder(orderId);
    if (order.paymentStatus === 'PAID') {
      phase.value = 'paid';
      return;
    }
  } catch {
    // Keep polling; the order may not be readable yet right after redirect.
  }
  if (Date.now() < pollDeadline) {
    pollTimer = setTimeout(pollOrder, 2000);
  } else {
    phase.value = 'pending';
  }
};

onMounted(() => {
  if (phase.value === 'checking') pollOrder();
});
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ink-50 p-4">
    <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-8 space-y-4 shadow-xl text-center">
      <Loader2 v-if="phase === 'checking'" :size="48" class="text-brand-600 mx-auto animate-spin" />
      <CheckCircle2 v-else-if="phase === 'paid'" :size="48" class="text-emerald-600 mx-auto" />
      <CheckCircle2 v-else-if="phase === 'pending'" :size="48" class="text-amber-500 mx-auto" />
      <XCircle v-else :size="48" class="text-red-600 mx-auto" />

      <h1 class="text-lg font-bold text-ink-900">
        {{
          phase === 'checking' ? 'Đang xác nhận thanh toán...'
          : phase === 'paid' ? 'Thanh toán thành công'
          : phase === 'pending' ? 'VNPay đã ghi nhận, đang chờ xác nhận'
          : 'Thanh toán chưa hoàn tất'
        }}
      </h1>
      <p class="text-sm text-ink-500">
        {{
          phase === 'checking' ? 'Vui lòng đợi trong giây lát, hệ thống đang đối soát với VNPay.'
          : phase === 'paid' ? 'Hóa đơn của bạn đã được ghi nhận thanh toán qua VNPay.'
          : phase === 'pending' ? 'Giao dịch đã được VNPay chấp nhận nhưng hệ thống chưa cập nhật kịp. Vui lòng kiểm tra lại đơn hàng sau ít phút.'
          : 'Giao dịch VNPay không thành công hoặc đã bị hủy. Bạn có thể thử lại từ trang đơn hàng.'
        }}
      </p>
      <FhButton variant="primary" size="md" class="w-full" :disabled="phase === 'checking'" @click="router.push('/app/orders')">
        Xem đơn hàng của tôi
      </FhButton>
    </div>
  </div>
</template>
