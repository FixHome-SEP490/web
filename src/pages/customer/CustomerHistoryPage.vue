<script setup lang="ts">
// Repair history from the server's read model: the customer's completed and
// cancelled orders, newest first, with what each one cost.
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { History, ChevronRight, Search } from 'lucide-vue-next';
import { FhButton, FhMoney, FhPagination, FhSkeleton, FhStatusPill } from '../../components';
import { ordersApi, type RepairHistoryItem } from '../../api/orders.api';
import { usePagedList } from '../../composables/usePagedList';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQuerySearch } from '../../composables/useQueryState';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString } from '../../utils/vn-time';

type Filter = 'all' | 'completed' | 'cancelled';

const PAGE_SIZE = 20;
const router = useRouter();

// Filter and page stay in the address bar (?filter=cancelled&page=2).
const filter = useQueryChoice<Filter>('filter', ['all', 'completed', 'cancelled'], 'all');
// Server search (order code, service; accents ignored), kept as ?q=.
const { input: searchQuery, search } = useQuerySearch();
const {
  page,
  items,
  total,
  loading,
  error: loadError,
  load,
  reset,
} = usePagedList<RepairHistoryItem>({
  pageSize: PAGE_SIZE,
  fetch: async (p, size) => {
    const result = await ordersApi.getRepairHistory(p, size, filter.value === 'all' ? undefined : filter.value, search.value || undefined);
    return { items: result.data, total: result.total, page: p, pageSize: size };
  },
});
const error = computed(() =>
  loadError.value ? userFacingError(loadError.value, 'Không thể tải lịch sử sửa chữa. Vui lòng thử lại.') : null,
);
watch([filter, search], () => reset());

const tabs: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

const isCancelled = (item: RepairHistoryItem) => String(item.status).toLowerCase() === 'cancelled';
const finishedAt = (item: RepairHistoryItem) => (isCancelled(item) ? item.cancelledAt : item.completedAt);
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5 pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Lịch sử sửa chữa</h1>

    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        :maxlength="SEARCH_MAX_LENGTH"
        placeholder="Tìm theo mã đơn, dịch vụ…"
        aria-label="Tìm trong lịch sử"
        data-testid="history-search"
        class="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-ink-200 text-base sm:text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
      />
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
      <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
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
        {{ search ? 'Không có đơn phù hợp.' : filter === 'cancelled' ? 'Bạn chưa có đơn nào đã hủy.' : 'Bạn chưa có đơn sửa chữa nào hoàn thành.' }}
      </p>
      <p class="text-sm text-ink-500">{{ search ? 'Thử từ khoá khác.' : 'Đơn hoàn thành hoặc đã hủy sẽ hiện ở đây.' }}</p>
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

    <FhPagination
      v-if="!error"
      v-model:page="page"
      :page-size="PAGE_SIZE"
      :total="total"
      :disabled="loading"
    />
  </div>
</template>
