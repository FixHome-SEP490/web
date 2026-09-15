<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ArrowRight,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatCard,
  FhMoney,
  FhTable,
  FhStatusPill,
} from '../../components';
import { ordersApi } from '../../api/orders.api';

interface DueItem {
  id: string;
  serviceOrderId: string;
  dueAmount: number;
  laborTotalSnapshot: number;
  commissionRateSnapshot: number;
  status: 'PENDING' | 'PAID' | 'pending' | 'paid';
  createdAt: string;
  paidAt?: string;
  serviceOrder?: { code: string };
}

const router = useRouter();
const loading = ref(true);
const payingId = ref<string | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const dues = ref<DueItem[]>([]);
const totalDue = ref<number>(0);

onMounted(async () => {
  await loadDues();
});

const loadDues = async () => {
  try {
    loading.value = true;
    const res = await ordersApi.getCommissionDues();
    dues.value = res.data;
    totalDue.value = res.totalDue;
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải danh sách công nợ',
    };
  } finally {
    loading.value = false;
  }
};

const handlePay = async (due: DueItem) => {
  try {
    payingId.value = due.id;
    actionMessage.value = null;
    await ordersApi.payCommissionDue(due.id, 'VNPAY_SANDBOX');
    actionMessage.value = {
      type: 'success',
      text: 'Thanh toán công nợ thành công! Tài khoản của bạn đã được kích hoạt nhận việc mới.',
    };
    await loadDues();
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Thanh toán thất bại, vui lòng thử lại',
    };
  } finally {
    payingId.value = null;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-16">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <CreditCard class="text-brand-600" :size="24" />
          Công nợ Nền tảng (PlatformDue)
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi và quyết toán phí hoa hồng dịch vụ (10% công thợ) & hoàn tiền linh kiện FixHome sau các đơn thu tiền mặt.
        </p>
      </div>

      <FhButton variant="secondary" size="sm" @click="router.push('/tech/earnings')">
        Báo cáo thu nhập <ArrowRight :size="14" class="ml-1" />
      </FhButton>
    </div>

    <!-- Action Alert -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
      <AlertTriangle v-else :size="16" class="text-danger-600 shrink-0" />
      <span>{{ actionMessage.text }}</span>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <FhStatCard
        title="Nợ cần quyết toán"
        :value="totalDue > 0 ? `${totalDue.toLocaleString('vi-VN')} ₫` : '0 ₫'"
        :subtext="totalDue > 0 ? 'Cần thanh toán để không bị dừng nhận việc' : 'Không có nợ tồn đọng'"
        :variant="totalDue > 0 ? 'danger' : 'success'"
      />
      <FhStatCard
        title="Trạng thái tài khoản"
        :value="totalDue > 0 ? 'Tạm giữ nhận việc' : 'Đang sẵn sàng'"
        :subtext="totalDue > 0 ? 'Đang có nợ quá hạn' : 'Đủ điều kiện nhận việc'"
        :variant="totalDue > 0 ? 'danger' : 'success'"
      />
      <FhStatCard
        title="Tỷ lệ hoa hồng công"
        value="10%"
        subtext="0% trên tiền linh kiện thợ tự mang"
        variant="brand"
      />
    </div>

    <!-- Dues List -->
    <FhCard title="Lịch sử các khoản công nợ PlatformDue">
      <div v-if="loading" class="text-center py-12 text-ink-400 text-xs">
        Đang tải dữ liệu công nợ...
      </div>

      <div v-else-if="dues.length === 0" class="text-center py-12 space-y-2">
        <CheckCircle2 :size="40" class="mx-auto text-success-500" />
        <h3 class="text-sm font-bold text-ink-800">Không có công nợ nào</h3>
        <p class="text-xs text-ink-500">Bạn đã thanh toán đầy đủ tất cả các khoản phí nền tảng.</p>
      </div>

      <FhTable
        v-else
        :columns="[
          { key: 'orderCode', label: 'Mã đơn hàng' },
          { key: 'createdAt', label: 'Ngày tạo' },
          { key: 'laborTotal', label: 'Công thợ', align: 'right' },
          { key: 'dueAmount', label: 'Tiền phải trả', align: 'right' },
          { key: 'status', label: 'Trạng thái', align: 'center' },
          { key: 'action', label: 'Thao tác', align: 'right' },
        ]"
        :rows="dues"
      >
        <template #cell-orderCode="{ row }">
          <span class="font-mono text-xs font-bold text-ink-900">
            {{ row.serviceOrder?.code || row.serviceOrderId }}
          </span>
        </template>

        <template #cell-createdAt="{ row }">
          <span class="text-xs text-ink-500 flex items-center gap-1">
            <Calendar :size="13" /> {{ new Date(row.createdAt).toLocaleDateString('vi-VN') }}
          </span>
        </template>

        <template #cell-laborTotal="{ row }">
          <span class="font-num text-xs text-ink-700">
            <FhMoney :amount="row.laborTotalSnapshot || 0" />
          </span>
        </template>

        <template #cell-dueAmount="{ row }">
          <span class="font-num text-xs font-bold text-danger-700">
            <FhMoney :amount="row.dueAmount" />
          </span>
        </template>

        <template #cell-status="{ row }">
          <FhStatusPill :status="String(row.status).toUpperCase() === 'PAID' ? 'COMPLETED' : 'PENDING'" />
        </template>

        <template #cell-action="{ row }">
          <div class="flex justify-end">
            <FhButton
              v-if="String(row.status).toUpperCase() === 'PENDING'"
              variant="primary"
              size="sm"
              :loading="payingId === row.id"
              @click="handlePay(row)"
            >
              Thanh toán ngay
            </FhButton>
            <span v-else class="text-xs text-success-600 font-semibold flex items-center gap-1">
              <CheckCircle2 :size="14" /> Đã quyết toán
            </span>
          </div>
        </template>
      </FhTable>
    </FhCard>
  </div>
</template>
