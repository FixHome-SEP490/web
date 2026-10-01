<script setup lang="ts">
// Repair history from the server's read model: the customer's completed and
// cancelled orders, newest first, with what each one cost.
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { History, MapPin, Wrench, ChevronRight, RefreshCw } from 'lucide-vue-next';
import { FhButton, FhCostBreakdown, FhMoney, FhStatusPill } from '../../components';
import { ordersApi, type RepairHistoryItem } from '../../api/orders.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString } from '../../utils/vn-time';

type Filter = 'all' | 'completed' | 'cancelled';

const PAGE_SIZE = 20;
const router = useRouter();

const filter = ref<Filter>('all');
const items = ref<RepairHistoryItem[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const tabs: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

const hasMore = computed(() => items.value.length < total.value);

const isCancelled = (item: RepairHistoryItem) => String(item.status).toLowerCase() === 'cancelled';
const finishedAt = (item: RepairHistoryItem) => (isCancelled(item) ? item.cancelledAt : item.completedAt);

async function load(nextPage = 1) {
  if (nextPage === 1) loading.value = true;
  else loadingMore.value = true;
  error.value = null;
  try {
    const result = await ordersApi.getRepairHistory(
      nextPage,
      PAGE_SIZE,
      filter.value === 'all' ? undefined : filter.value,
    );
    items.value = nextPage === 1 ? result.data : [...items.value, ...result.data];
    total.value = result.total;
    page.value = nextPage;
  } catch (err) {
    error.value = userFacingError(err, 'Không thể tải lịch sử sửa chữa. Vui lòng thử lại.');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

watch(filter, () => load(1));
onMounted(() => load(1));
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
        <History class="text-brand-600" :size="24" />
        Lịch sử sửa chữa
      </h1>
      <p class="text-sm text-ink-500 mt-1 text-pretty">
        Các đơn sửa chữa đã hoàn thành hoặc đã hủy của bạn, kèm chi phí từng đơn.
      </p>
    </div>

    <div class="grid grid-cols-3 gap-1 p-1 bg-white rounded-2xl border border-ink-200 text-sm font-medium" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="filter === tab.key"
        :data-testid="`history-filter-${tab.key}`"
        class="h-10 px-2 rounded-xl transition-colors whitespace-nowrap"
        :class="filter === tab.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-50'"
        @click="filter = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" @click="load(1)">Thử lại</FhButton>
    </div>

    <p v-if="loading" role="status" class="py-16 text-center text-sm text-ink-500">Đang tải lịch sử sửa chữa…</p>

    <div
      v-else-if="!error && items.length === 0"
      data-testid="history-empty"
      class="py-14 px-6 bg-white rounded-2xl border border-ink-200 text-center space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto">
        <History :size="24" />
      </div>
      <p class="text-base font-semibold text-ink-900">
        {{ filter === 'cancelled' ? 'Bạn chưa có đơn nào đã hủy.' : 'Bạn chưa có đơn sửa chữa nào hoàn thành.' }}
      </p>
      <p class="text-sm text-ink-500">Đơn sửa chữa sẽ xuất hiện ở đây khi hoàn thành hoặc bị hủy.</p>
      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">Đặt lịch sửa chữa</FhButton>
    </div>

    <ul v-else class="space-y-4">
      <li v-for="item in items" :key="item.orderId">
        <article
          class="p-5 rounded-2xl bg-white border border-ink-200 hover:border-ink-300 transition-colors cursor-pointer space-y-4"
          :data-testid="`history-item-${item.orderId}`"
          @click="router.push(`/app/orders/${item.orderId}`)"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink-100">
            <span class="flex items-center gap-3 text-sm">
              <span class="font-num text-ink-600 whitespace-nowrap">{{ item.code }}</span>
              <span class="text-ink-500 whitespace-nowrap">
                {{ isCancelled(item) ? 'Hủy' : 'Hoàn thành' }} {{ finishedAt(item) ? vnDateString(finishedAt(item)!) : '—' }}
              </span>
            </span>
            <FhStatusPill :status="isCancelled(item) ? 'CANCELLED' : 'COMPLETED'" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5 min-w-0">
              <h3 class="text-base font-semibold text-ink-900">{{ item.serviceName || 'Dịch vụ sửa chữa' }}</h3>
              <p v-if="item.addressSummary" class="text-sm text-ink-600 flex items-start gap-1.5">
                <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
                <span class="text-pretty">{{ item.addressSummary }}</span>
              </p>
              <p v-if="item.technicianName" class="text-sm text-ink-600 flex items-center gap-1.5">
                <Wrench :size="15" class="text-ink-400 shrink-0" />
                Kỹ thuật viên: <span class="font-medium text-ink-900">{{ item.technicianName }}</span>
              </p>
            </div>
            <FhCostBreakdown v-if="!isCancelled(item)" :labor-total="item.laborTotal" :parts-total="item.partsTotal" />
          </div>

          <div class="pt-3 border-t border-ink-100 flex items-center justify-between gap-3">
            <span class="text-sm text-ink-500">
              Tổng thanh toán:
              <span class="ml-1 text-base font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="item.grandTotal" /></span>
            </span>
            <span class="text-sm font-medium text-brand-600 inline-flex items-center gap-1 whitespace-nowrap">
              Xem chi tiết <ChevronRight :size="16" />
            </span>
          </div>
        </article>
      </li>
    </ul>

    <div v-if="!loading && hasMore" class="flex justify-center">
      <FhButton variant="secondary" size="sm" :loading="loadingMore" data-testid="history-load-more" @click="load(page + 1)">
        <RefreshCw :size="16" />
        Xem thêm
      </FhButton>
    </div>
  </div>
</template>
