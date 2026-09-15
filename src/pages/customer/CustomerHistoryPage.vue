<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  History,
  Calendar,
  Wrench,
  Star,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
} from 'lucide-vue-next';
import { FhCard, FhMoney, FhCostBreakdown, FhButton } from '../../components';
import { ordersApi, type RepairHistoryItem } from '../../api/orders.api';

const router = useRouter();

const loading = ref(true);
const actionLoading = ref(false);
const currentPage = ref(1);
const pageSize = ref(5);
const totalItems = ref(0);
type HistoryRow = RepairHistoryItem & { id: string; orderCode: string; date: string; device: string; service: string; technicianRating?: number; customerReview?: string };
const historyList = ref<HistoryRow[]>([]);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const loadHistory = async () => {
  loading.value = true;
  try {
    const response = await ordersApi.getRepairHistory(currentPage.value, pageSize.value);
    historyList.value = response.data.map(item => ({ ...item, id: item.orderId, orderCode: item.code, date: new Date(item.completedAt || item.cancelledAt || '').toLocaleDateString('vi-VN'), device: '', service: item.serviceName || 'Dịch vụ sửa chữa' }));
    totalItems.value = response.total;
  } catch { message.value = { type: 'error', text: 'Không tải được lịch sử. Vui lòng thử lại.' }; }
  finally { loading.value = false; }
};

onMounted(() => {
  loadHistory();
});

const handleRebook = (item: HistoryRow) => router.push({ path: '/app/bookings/new', query: { rebookFrom: item.bookingId } });

const goToDetail = (orderId: string) => {
  if (orderId) {
    router.push(`/app/orders/${orderId}`);
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-16">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <History class="text-brand-600" :size="24" />
          Lịch sử sửa chữa
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Hồ sơ theo dõi sức khỏe thiết bị gia đình, lưu trữ lịch sử sửa chữa, đánh giá thợ và đặt lại nhanh chóng.
        </p>
      </div>

      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
        + Đặt lịch mới
      </FhButton>
    </div>

    <!-- Alert message -->
    <div
      v-if="message"
      class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2"
      :class="message.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <span>{{ message.text }}</span>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải hồ sơ sửa chữa ngôi nhà...
    </div>

    <div v-else class="space-y-4">
      <FhCard
        v-for="item in historyList"
        :key="item.id"
        class="space-y-4 cursor-pointer hover:border-brand-300 transition-colors"
        @click="goToDetail(item.orderId)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-bold text-ink-900">{{ item.orderCode }}</span>
            <span class="text-ink-400 text-xs">•</span>
            <span class="text-xs text-ink-500 flex items-center gap-1">
              <Calendar :size="13" /> {{ item.date }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-success-600 flex items-center gap-1">
              <CheckCircle2 :size="14" /> Đã nghiệm thu & bảo hành
            </span>

            <button
              class="text-xs font-semibold text-brand-600 hover:text-brand-800 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-brand-50 transition-colors"
              @click.stop="goToDetail(item.orderId)"
            >
              Xem chi tiết <ExternalLink :size="12" />
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="space-y-1.5">
            <div class="text-[11px] text-ink-400 uppercase font-semibold">Thiết bị & Dịch vụ:</div>
            <div class="font-bold text-sm text-ink-900">{{ item.device }}</div>
            <div class="text-ink-600 font-medium">{{ item.service }}</div>
          </div>

          <div class="space-y-1.5 sm:text-right">
            <div class="text-[11px] text-ink-400 uppercase font-semibold">Kỹ thuật viên thực hiện:</div>
            <div class="font-semibold text-ink-900 flex items-center gap-1.5 sm:justify-end">
              <Wrench :size="13" class="text-brand-600" /> {{ item.technicianName }}
            </div>
            <div class="flex items-center gap-1 sm:justify-end text-amber-500 font-bold">
              <Star v-for="i in Math.max(1, Math.min(5, item.technicianRating || 5))" :key="i" :size="12" class="fill-amber-400" />
            </div>
          </div>
        </div>

        <!-- Customer Review Snippet -->
        <div v-if="item.customerReview" class="p-3 rounded bg-ink-50 border border-ink-200 text-xs text-ink-700 italic">
          "{{ item.customerReview }}"
        </div>

        <!-- Cost Breakdown & Action CTAs -->
        <div class="pt-3 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex-1 max-w-sm">
            <FhCostBreakdown :labor-total="item.laborTotal" :parts-total="item.partsTotal" />
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <div class="text-right">
              <span class="text-[11px] text-ink-400 block">Đã thanh toán:</span>
              <span class="text-sm font-bold font-num text-brand-700">
                <FhMoney :amount="item.grandTotal" />
              </span>
            </div>

            <FhButton
              variant="secondary"
              size="sm"
              :disabled="actionLoading"
              @click.stop="handleRebook(item)"
            >
              <RotateCcw :size="13" class="mr-1.5 text-brand-600" /> Đặt lại dịch vụ này
            </FhButton>

            <FhButton
              variant="primary"
              size="sm"
              @click.stop="goToDetail(item.orderId)"
            >
              Chi tiết đơn <ChevronRight :size="14" class="ml-1" />
            </FhButton>
          </div>
        </div>
      </FhCard>

      <!-- Pagination Controls -->
      <div v-if="totalItems > pageSize" class="flex items-center justify-between pt-4 border-t border-ink-200 text-xs">
        <span class="text-ink-500">
          Hiển thị trang {{ currentPage }} (Tổng {{ totalItems }} đơn hoàn tất)
        </span>
        <div class="flex gap-2">
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="currentPage <= 1"
            @click="currentPage--; loadHistory()"
          >
            <ChevronLeft :size="14" class="mr-1" /> Trước
          </FhButton>
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="currentPage * pageSize >= totalItems"
            @click="currentPage++; loadHistory()"
          >
            Sau <ChevronRight :size="14" class="ml-1" />
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
