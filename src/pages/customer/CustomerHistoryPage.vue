<script setup lang="ts">
// Repair history from the server's read model: the customer's completed and
// cancelled orders, newest first, with what each one cost.
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { History, ChevronRight, RefreshCw } from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton, FhStatusPill } from '../../components';
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
  <div class="max-w-4xl mx-auto space-y-5 pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Lịch sử sửa chữa</h1>

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

    <div v-if="loading" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải lịch sử sửa chữa">
      <div v-for="i in 4" :key="i" class="px-5 py-4 space-y-2">
        <FhSkeleton width="55%" height="18px" />
        <FhSkeleton width="35%" height="14px" />
      </div>
    </div>

    <div
      v-else-if="!error && items.length === 0"
      data-testid="history-empty"
      class="py-12 px-6 bg-white rounded-2xl border border-ink-200 text-center space-y-2"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-3">
        <History :size="24" />
      </div>
      <p class="text-base font-semibold text-ink-900">
        {{ filter === 'cancelled' ? 'Bạn chưa có đơn nào đã hủy.' : 'Bạn chưa có đơn sửa chữa nào hoàn thành.' }}
      </p>
      <p class="text-sm text-ink-500">Đơn hoàn thành hoặc đã hủy sẽ hiện ở đây.</p>
    </div>

    <ul v-else-if="items.length > 0" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100 overflow-hidden">
      <li
        v-for="item in items"
        :key="item.orderId"
        :data-testid="`history-item-${item.orderId}`"
        role="link"
        tabindex="0"
        class="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:bg-ink-50"
        @click="router.push(`/app/orders/${item.orderId}`)"
        @keydown.enter="router.push(`/app/orders/${item.orderId}`)"
      >
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-base font-semibold text-ink-900 text-pretty">{{ item.serviceName || 'Dịch vụ sửa chữa' }}</h2>
            <FhStatusPill :status="isCancelled(item) ? 'CANCELLED' : 'COMPLETED'" />
          </div>
          <p class="text-sm text-ink-500 truncate">
            <span class="font-num">{{ item.code }}</span>
            · {{ isCancelled(item) ? 'Hủy' : 'Hoàn thành' }} <span class="font-num whitespace-nowrap">{{ finishedAt(item) ? vnDateString(finishedAt(item)!) : '—' }}</span>
            <template v-if="item.technicianName"> · {{ item.technicianName }}</template>
          </p>
          <p v-if="item.addressSummary" class="text-sm text-ink-500 truncate" :title="item.addressSummary">{{ item.addressSummary }}</p>
          <p v-if="!isCancelled(item) || Number(item.grandTotal) > 0" class="text-sm text-ink-600 flex flex-wrap items-baseline gap-x-3 pt-0.5">
            <span class="text-base font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="item.grandTotal" /></span>
            <template v-if="!isCancelled(item)">
              <span class="whitespace-nowrap">Công <FhMoney :amount="item.laborTotal" /></span>
              <span class="whitespace-nowrap">Linh kiện <FhMoney :amount="item.partsTotal" /></span>
            </template>
          </p>
        </div>
        <ChevronRight :size="18" class="text-ink-400 shrink-0" />
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
