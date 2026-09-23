<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCircle2, XCircle } from 'lucide-vue-next';
import { FhButton } from '../../components';

const route = useRoute();
const router = useRouter();

const success = computed(() => route.query.payment === 'success');
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ink-50 p-4">
    <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-8 space-y-4 shadow-xl text-center">
      <CheckCircle2 v-if="success" :size="48" class="text-emerald-600 mx-auto" />
      <XCircle v-else :size="48" class="text-red-600 mx-auto" />
      <h1 class="text-lg font-bold text-ink-900">
        {{ success ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất' }}
      </h1>
      <p class="text-sm text-ink-500">
        {{ success
          ? 'Hóa đơn của bạn đã được ghi nhận thanh toán qua VNPay.'
          : 'Giao dịch VNPay không thành công hoặc đã bị hủy. Bạn có thể thử lại từ trang đơn hàng.' }}
      </p>
      <FhButton variant="primary" size="md" class="w-full" @click="router.push('/app/orders')">
        Xem đơn hàng của tôi
      </FhButton>
    </div>
  </div>
</template>
