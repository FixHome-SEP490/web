<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Calendar,
  LifeBuoy,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhCostBreakdown,
  FhMoney,
  FhTimeline,
  type TimelineStep,
} from '../../components';
import { consoleOrderContextApi, type ConsoleOrderContext } from '../../api/console-order-context.api';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');
const orderId = route.params.id as string;

const loading = ref(true);
const loadError = ref('');
const order = ref<ConsoleOrderContext | null>(null);

function getErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason !== null && 'response' in reason) {
    const response = (reason as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  if (reason instanceof Error && reason.message) return reason.message;
  return fallback;
}

const loadOrder = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    // Real API only: validation/network failures surface as an error state.
    // This page never falls back to local or mock order data.
    order.value = await consoleOrderContextApi.getConsoleOrderContext(orderId);
  } catch (reason) {
    order.value = null;
    loadError.value = getErrorMessage(reason, 'Không thể tải chi tiết đơn hàng từ Backend.');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void loadOrder();
});

// Render only the timeline entries actually returned by the Backend API.
// No locally invented states or progression — an empty timeline is shown honestly.
const timelineSteps = computed<TimelineStep[]>(() => {
  const entries = order.value?.timeline ?? [];
  return entries.map((entry, index) => ({
    key: `${entry.status}-${index}`,
    label: entry.title || entry.status,
    timestamp: entry.timestamp,
    actor: entry.actor,
    completed: index < entries.length - 1,
    current: index === entries.length - 1,
  }));
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <button
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors"
        @click="router.push('/console/orders')"
      >
        <ArrowLeft :size="14" /> Quay lại Board đơn
      </button>

      <div class="flex items-center gap-3">
        <FhButton v-if="isServiceManager" variant="secondary" size="sm" @click="router.push('/console/support')">
          <LifeBuoy :size="15" class="mr-1.5" /> Hàng đợi hỗ trợ
        </FhButton>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải chi tiết đơn hàng...
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ loadError }}</span>
      <button class="font-semibold underline" type="button" @click="loadOrder">Thử lại</button>
    </div>

    <div v-else-if="order" class="space-y-6">
      <!-- Order Overview Card (read-only operational context) -->
      <FhCard>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
            <div>
              <div class="text-[11px] text-ink-400 font-mono">CONSOLE DISPATCH RECORD:</div>
              <h1 class="text-xl font-bold font-mono text-ink-900">{{ order.code }}</h1>
            </div>

            <div class="flex items-center gap-3">
              <FhStatusPill :status="order.status" />
              <FhStatusPill
                :status="order.paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING'"
                :label="order.paymentStatus"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div class="space-y-1.5">
              <div class="font-bold text-sm text-ink-900 font-mono">Booking: {{ order.bookingId }}</div>
              <div class="text-ink-500 flex items-center gap-1">
                <Calendar :size="13" />
                <span v-if="order.scheduledAt">Hẹn: {{ new Date(order.scheduledAt).toLocaleString('vi-VN') }}</span>
                <span v-else class="italic">Backend chưa trả về lịch hẹn cho đơn này.</span>
              </div>
            </div>

            <div class="space-y-1.5 sm:text-right">
              <div class="text-ink-500">
                Tạo lúc: {{ order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '—' }}
              </div>
              <div class="text-ink-500">
                Cập nhật: {{ order.updatedAt ? new Date(order.updatedAt).toLocaleString('vi-VN') : '—' }}
              </div>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Timeline History (API-backed only) -->
      <FhCard title="Lịch sử chuyển trạng thái (theo dữ liệu Backend)">
        <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
        <p v-else class="text-xs text-ink-400 italic">
          Backend không trả về mục lịch sử nào cho đơn này.
        </p>
      </FhCard>

      <!-- Cost Audit & Breakdown -->
      <FhCard title="Bóc tách Doanh thu & Chi phí (D-02 Standard)">
        <div class="space-y-4 text-xs">
          <FhCostBreakdown :labor-total="order.laborTotal" :parts-total="order.partsTotal" />

          <div class="grid grid-cols-3 gap-3 p-3.5 rounded bg-ink-50 border border-ink-200 text-center">
            <div>
              <div class="text-ink-400 text-[11px]">Tiền công (Labor):</div>
              <div class="text-sm font-bold font-num text-ink-900">
                <FhMoney :amount="order.laborTotal" />
              </div>
            </div>
            <div>
              <div class="text-ink-400 text-[11px]">Tiền linh kiện (Parts):</div>
              <div class="text-sm font-bold font-num text-ink-900">
                <FhMoney :amount="order.partsTotal" />
              </div>
            </div>
            <div>
              <div class="text-ink-400 text-[11px]">Tổng giá trị đơn:</div>
              <div class="text-sm font-bold font-num text-brand-700">
                <FhMoney :amount="order.grandTotal" />
              </div>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Read-only notice + exception-handling navigation -->
      <FhCard title="Ghi chú vận hành">
        <p class="text-xs text-ink-500 leading-relaxed">
          Trang này là ngữ cảnh vận hành chỉ đọc. Mọi chuyển trạng thái đơn, điều phối kỹ thuật viên
          hay huỷ đơn đều do Backend điều phối theo luồng chuẩn; giao diện này không thực hiện các
          can thiệp đó. Trường hợp ngoại lệ (tranh chấp, sự cố giữa ca, khiếu nại huỷ đơn) được xử lý
          qua Hàng đợi hỗ trợ hoặc mục Huỷ đơn &amp; Khiếu nại theo quy trình Backend đã phê duyệt.
        </p>
        <div v-if="isServiceManager" class="flex flex-wrap gap-2 pt-3">
          <FhButton variant="secondary" size="sm" @click="router.push('/console/support')">
            Mở Hàng đợi hỗ trợ
          </FhButton>
          <FhButton variant="ghost" size="sm" @click="router.push('/console/cancellations')">
            Huỷ đơn &amp; Khiếu nại
          </FhButton>
        </div>
      </FhCard>
    </div>
  </div>
</template>
