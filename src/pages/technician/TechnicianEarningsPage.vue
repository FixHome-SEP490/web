<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { DollarSign, CheckCircle2, TrendingUp, Star, Calendar, AlertTriangle } from 'lucide-vue-next';
import { FhCard, FhStatCard, FhMoney, FhTable, FhButton, FhSkeleton } from '../../components';
import { techniciansApi, type TechnicianEarningsData } from '../../api/technicians.api';

const router = useRouter();
const loading = ref(true);
const error = ref<string | null>(null);
const earnings = ref<TechnicianEarningsData | null>(null);

const loadEarnings = async () => {
  try {
    loading.value = true;
    error.value = null;
    earnings.value = await techniciansApi.getEarnings();
  } catch (err) {
    error.value = (err as Error)?.message || 'Không thể tải báo cáo thu nhập.';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadEarnings();
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <DollarSign class="text-brand-600" :size="24" />
          Thu nhập & Báo cáo Quyết toán
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi doanh thu công thợ, khấu trừ hoa hồng nền tảng (10%) và lịch sử các đơn hàng đã hoàn tất.
        </p>
      </div>

      <div class="flex gap-2">
        <FhButton variant="secondary" size="md" @click="router.push('/tech/platform-dues')">
          Xem công nợ nền tảng
        </FhButton>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-if="error"
      class="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700 text-xs flex items-center justify-between"
    >
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" @click="loadEarnings">Thử lại</FhButton>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FhSkeleton height="90px" v-for="i in 4" :key="i" />
      </div>
      <FhSkeleton height="200px" />
    </div>

    <template v-else-if="earnings">
      <!-- Pending Dues Warning Alert -->
      <div
        v-if="earnings.pendingDueCount > 0"
        class="p-4 bg-warning-50 border border-warning-200 rounded-lg flex items-center justify-between gap-4 text-warning-800 text-xs"
      >
        <div class="flex items-center gap-2">
          <AlertTriangle :size="18" class="text-warning-600 shrink-0" />
          <span>
            Bạn đang có <strong>{{ earnings.pendingDueCount }}</strong> khoản công nợ hoa hồng FixHome cần thanh toán (Tổng: <strong><FhMoney :amount="earnings.pendingDueAmount" /></strong>). Vui lòng thanh toán để duy trì tài khoản nhận việc liên tục.
          </span>
        </div>
        <FhButton variant="primary" size="sm" @click="router.push('/tech/platform-dues')">
          Thanh toán ngay
        </FhButton>
      </div>

      <!-- Stat Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FhStatCard
          title="Thực nhận tổng cộng"
          :value="`${earnings.totalNet.toLocaleString('vi-VN')} ₫`"
          subtext="Doanh thu công thợ thực nhận"
          variant="brand"
          :icon="TrendingUp"
        />
        <FhStatCard
          title="Đơn hoàn tất"
          :value="`${earnings.totalCompletedOrders} đơn`"
          subtext="Các đơn sửa chữa thành công"
          :icon="CheckCircle2"
        />
        <FhStatCard
          title="Đánh giá trung bình"
          :value="`${earnings.rating.toFixed(2)} ★`"
          :subtext="`Từ ${earnings.ratingCount} lượt đánh giá`"
          :icon="Star"
        />
        <FhStatCard
          title="Tỷ lệ hoa hồng FixHome"
          :value="`${earnings.commissionRatePercent}%`"
          subtext="Theo chính sách nền tảng"
          :icon="DollarSign"
        />
      </div>

      <!-- Payout History Table -->
      <FhCard title="Lịch sử các đơn hàng hoàn tất">
        <div v-if="earnings.payouts.length === 0" class="py-12 text-center text-xs text-ink-500">
          Chưa có đơn hàng nào hoàn tất để hiển thị quyết toán.
        </div>

        <FhTable
          v-else
          :columns="[
            { key: 'orderCode', label: 'Mã đơn' },
            { key: 'date', label: 'Ngày thực hiện' },
            { key: 'customer', label: 'Khách hàng' },
            { key: 'gross', label: 'Tổng công thợ', align: 'right' },
            { key: 'platformFee', label: 'Phí nền tảng (10%)', align: 'right' },
            { key: 'net', label: 'Thực nhận', align: 'right' },
          ]"
          :rows="earnings.payouts"
        >
          <template #cell-orderCode="{ row }">
            <router-link
              :to="`/tech/jobs/${row.orderId}`"
              class="font-mono text-xs font-bold text-brand-600 hover:text-brand-700"
            >
              {{ row.orderCode }}
            </router-link>
          </template>

          <template #cell-date="{ row }">
            <span class="text-xs text-ink-500 flex items-center gap-1">
              <Calendar :size="13" /> {{ row.date }}
            </span>
          </template>

          <template #cell-customer="{ row }">
            <span class="text-xs font-medium text-ink-800">{{ row.customer }}</span>
          </template>

          <template #cell-gross="{ row }">
            <span class="font-num text-xs text-ink-600">
              <FhMoney :amount="row.gross" />
            </span>
          </template>

          <template #cell-platformFee="{ row }">
            <span class="font-num text-xs text-danger-600">
              -<FhMoney :amount="row.platformFee" />
            </span>
          </template>

          <template #cell-net="{ row }">
            <span class="font-num text-xs font-bold text-success-600">
              +<FhMoney :amount="row.net" />
            </span>
          </template>
        </FhTable>
      </FhCard>
    </template>
  </div>
</template>
