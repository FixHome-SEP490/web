<script setup lang="ts">
// Repair history from the server's read model: the customer's completed and
// cancelled orders, newest first, with what each one cost.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  History,
  ChevronRight,
  Search,
  Wrench,
  User,
  MapPin,
  Calendar,
  AlertCircle,
  Sparkles,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhPagination, FhSkeleton, FhStatusPill } from '../../components';
import { ordersApi, type RepairHistoryItem } from '../../api/orders.api';
import { visitGroupsApi, type VisitGroupPageItem, type VisitGroupReadStatus } from '../../api/visit-groups.api';
import { usePagedList } from '../../composables/usePagedList';
import { queryKeys } from '../../lib/query-keys';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQueryPage, useQuerySearch } from '../../composables/useQueryState';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

type Filter = 'all' | 'completed' | 'cancelled';

const PAGE_SIZE = 20;
const router = useRouter();

// Filter and page stay in the address bar (?filter=cancelled&page=2).
const filter = useQueryChoice<Filter>('filter', ['all', 'completed', 'cancelled'], 'all');
const historyList = useQueryChoice<'orders' | 'visits'>('list', ['orders', 'visits'], 'orders');
// Server search (order code, service; accents ignored), kept as ?q=.
const { input: searchQuery, search } = useQuerySearch();
const {
  page,
  items,
  total,
  loading,
  error: loadError,
  load,
  changingPage,
  prefetch,
} = usePagedList<RepairHistoryItem>({
  key: () => queryKeys.orders.history({ filter: filter.value, search: search.value }),
  pageSize: PAGE_SIZE,
  fetch: async (p, size) => {
    const result = await ordersApi.getRepairHistory(p, size, filter.value === 'all' ? undefined : filter.value, search.value || undefined, true);
    return { items: result.data, total: result.total, page: p, pageSize: size };
  },
});
const VISIT_TERMINAL_STATUSES: readonly VisitGroupReadStatus[] = ['completed', 'cancelled', 'failed', 'quote_declined', 'mixed'];

async function readVisitGroupPrefix(status: VisitGroupReadStatus, wanted: number): Promise<{ items: VisitGroupPageItem[]; total: number }> {
  const items: VisitGroupPageItem[] = [];
  let pageNumber = 1;
  let total = 0;
  const pageSize = Math.min(100, Math.max(1, wanted));
  while (pageNumber === 1 || (items.length < wanted && items.length < total)) {
    const result = await visitGroupsApi.minePage(pageNumber, pageSize, { status, q: search.value || undefined });
    if (pageNumber === 1) total = result.total;
    items.push(...result.items);
    if (items.length >= total || result.items.length < pageSize) break;
    pageNumber += 1;
  }
  return { items, total };
}

async function fetchVisitHistoryPage(p: number, size: number) {
  const statuses = filter.value === 'completed'
    ? ['completed' as const]
    : filter.value === 'cancelled'
      ? ['cancelled' as const]
      : VISIT_TERMINAL_STATUSES;
  const wanted = p * size;
  const groups = await Promise.all(statuses.map((status) => readVisitGroupPrefix(status, wanted)));
  const rows = groups.flatMap((group) => group.items).sort((a, b) => {
    const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return byDate || b.id.localeCompare(a.id);
  });
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const start = (p - 1) * size;
  return { items: rows.slice(start, start + size), total, page: p, pageSize: size };
}

const visitHistory = usePagedList<VisitGroupPageItem>({
  key: () => queryKeys.visitGroups.customerList({ history: true, filter: filter.value, search: search.value }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('visitHistoryPage'),
  fetch: fetchVisitHistoryPage,
});
const {
  page: visitHistoryPage,
  items: visitGroups,
  total: visitGroupsTotal,
  loading: loadingVisitGroups,
  error: visitGroupsFailure,
  load: retryVisitGroups,
  changingPage: changingVisitGroupsPage,
  prefetch: prefetchVisitGroups,
} = visitHistory;
const error = computed(() =>
  loadError.value ? userFacingError(loadError.value, 'Không thể tải lịch sử sửa chữa. Vui lòng thử lại.') : null,
);
const visitGroupsError = computed(() =>
  visitGroupsFailure.value ? userFacingError(visitGroupsFailure.value, 'Không thể tải lịch sử lượt sửa. Vui lòng thử lại.') : null,
);
const currentTotal = computed(() => historyList.value === 'visits' ? visitGroupsTotal.value : total.value);
const currentLoading = computed(() => historyList.value === 'visits' ? loadingVisitGroups.value : loading.value);

const tabs = computed<{ key: Filter; label: string; count: number }[]>(() => [
  { key: 'all', label: 'Tất cả', count: total.value },
  {
    key: 'completed',
    label: 'Hoàn thành',
    count: items.value.filter((i) => !isCancelled(i)).length,
  },
  {
    key: 'cancelled',
    label: 'Đã hủy',
    count: items.value.filter((i) => isCancelled(i)).length,
  },
]);

// Sliding indicator state
const tabListRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({ opacity: '0' });

function updateTabIndicator() {
  const el = tabRefs.value[filter.value];
  const container = tabListRef.value;
  if (!el || !container || el.offsetWidth === 0) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = el.offsetLeft;
  const top = el.offsetTop;
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  indicatorStyle.value = {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: width > 0 ? '1' : '0',
  };
}

const isCancelled = (item: RepairHistoryItem) => String(item.status).toLowerCase() === 'cancelled';
const finishedAt = (item: RepairHistoryItem) => (isCancelled(item) ? item.cancelledAt : item.completedAt);
const groupStatusLabel = (status: VisitGroupPageItem['status']) => ({
  submitted: 'Đang chờ xử lý', matching: 'Đang tìm thợ', no_technician: 'Chưa có thợ phù hợp',
  completed: 'Hoàn thành', cancelled: 'Đã hủy', failed: 'Có thiết bị chưa sửa',
  quote_declined: 'Có báo giá chưa được nhận', mixed: 'Kết quả nhiều trạng thái',
  accepted: 'Đã nhận lịch', en_route: 'Đang di chuyển', under_repair: 'Đang sửa chữa',
}[status]);
const groupItemStatus = (item: VisitGroupPageItem['items'][number]) => {
  if (item.outcome === 'failed') return 'Không sửa được';
  if (item.outcome === 'quote_declined') return 'Không đồng ý báo giá';
  if (item.outcome === 'succeeded' || item.orderStatus?.toLowerCase() === 'completed') return 'Hoàn thành';
  if (item.orderStatus?.toLowerCase() === 'cancelled' || item.bookingStatus.toLowerCase() === 'cancelled') return 'Đã hủy';
  return 'Đã kết thúc';
};
watch(filter, () => {
  void nextTick(updateTabIndicator);
});

onMounted(() => {
  void nextTick(updateTabIndicator);
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => updateTabIndicator());
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateTabIndicator);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-16">
    <!-- Header banner -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight flex items-center gap-2.5">
          <History :size="28" class="text-brand-600 shrink-0" />
          <span>Lịch sử sửa chữa</span>
        </h1>
      <p class="text-sm text-ink-500 mt-1">
        {{ historyList === 'visits' ? 'Xem các lượt nhiều thiết bị đã kết thúc và trạng thái từng thiết bị.' : 'Theo dõi chi tiết các dịch vụ sửa chữa đã hoàn thành và chi phí thực hiện.' }}
      </p>
      </div>

      <div v-if="!currentLoading && currentTotal > 0" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200/60 text-xs font-semibold text-brand-700 self-start sm:self-auto">
        <Sparkles :size="14" class="text-brand-600" />
        <span>Tổng {{ currentTotal }} {{ historyList === 'visits' ? 'lượt sửa' : 'đơn' }} trong lịch sử</span>
      </div>
    </div>

    <div class="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Chọn loại lịch sử">
      <button
        v-for="choice in [{ key: 'orders' as const, label: 'Đơn sửa chữa', shortLabel: 'Đơn sửa' }, { key: 'visits' as const, label: 'Lượt sửa nhiều thiết bị', shortLabel: 'Nhiều thiết bị' }]"
        :key="choice.key"
        type="button"
        :aria-pressed="historyList === choice.key"
        :aria-label="choice.label"
        :data-testid="`history-list-switch-${choice.key}`"
        class="h-11 min-w-[9.5rem] flex-1 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="historyList === choice.key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'"
        @click="historyList = choice.key"
      ><span class="sm:hidden">{{ choice.shortLabel }}</span><span class="hidden sm:inline">{{ choice.label }}</span></button>
    </div>

    <!-- Search input -->
    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        :maxlength="SEARCH_MAX_LENGTH"
        placeholder="Tìm theo mã đơn, dịch vụ, thiết bị…"
        aria-label="Tìm trong lịch sử"
        data-testid="history-search"
        class="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-ink-200 text-base sm:text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
      />
    </div>

    <!-- Interactive animated sliding tab bar -->
    <div
      ref="tabListRef"
      class="relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 select-none scrollbar-none"
      role="tablist"
      aria-label="Lọc lịch sử sửa chữa"
    >
      <!-- Sliding active indicator pill -->
      <div
        class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        :style="indicatorStyle"
        aria-hidden="true"
      />

      <button
        v-for="t in tabs"
        :key="t.key"
        :ref="(el) => { tabRefs[t.key] = el as HTMLElement }"
        type="button"
        role="tab"
        :aria-selected="filter === t.key"
        :data-testid="`history-filter-${t.key}`"
        class="relative z-10 flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-medium transition-colors"
        :class="filter === t.key ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
        @click="filter = t.key"
      >
        <span>{{ t.label }}</span>
        <span
          class="inline-flex items-center rounded-full px-1.5 py-0.2 font-num text-xs transition-colors"
          :class="filter === t.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-ink-200/60 text-ink-600'"
        >
          <span v-if="historyList === 'orders'">{{ t.count }}</span>
        </span>
      </button>
    </div>

    <!-- Error state -->
    <div
      v-if="historyList === 'orders' && error"
      role="alert"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3 shadow-xs"
    >
      <div class="flex items-center gap-2 min-w-0">
        <AlertCircle :size="18" class="text-danger-600 shrink-0" />
        <span class="font-medium text-pretty">{{ error }}</span>
      </div>
      <FhButton variant="secondary" size="sm" @click="load">
        Thử lại
      </FhButton>
    </div>

    <!-- Skeleton Loading state -->
    <div
      v-if="historyList === 'orders' && loading"
      class="rounded-2xl bg-white border border-ink-200/90 divide-y divide-ink-100 overflow-hidden shadow-xs"
      aria-busy="true"
      aria-label="Đang tải lịch sử sửa chữa"
    >
      <div v-for="i in 4" :key="i" class="p-5 sm:p-6 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 w-3/4">
            <FhSkeleton width="40px" height="40px" rounded="lg" />
            <div class="space-y-1.5 flex-1">
              <FhSkeleton width="60%" height="18px" />
              <FhSkeleton width="40%" height="14px" />
            </div>
          </div>
          <FhSkeleton width="80px" height="24px" rounded="full" />
        </div>
        <div class="pt-2 flex justify-between items-center border-t border-ink-50">
          <FhSkeleton width="45%" height="14px" />
          <FhSkeleton width="100px" height="20px" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="historyList === 'orders' && !error && items.length === 0"
      data-testid="history-empty"
      class="py-16 px-6 bg-white rounded-3xl border border-ink-200/90 text-center space-y-3 shadow-xs"
    >
      <div class="w-16 h-16 rounded-2xl bg-ink-100/80 text-ink-400 flex items-center justify-center mx-auto mb-2">
        <History :size="32" />
      </div>
      <p class="text-lg font-semibold text-ink-900">
        {{ search ? 'Không có đơn phù hợp.' : filter === 'cancelled' ? 'Bạn chưa có đơn nào đã hủy.' : 'Bạn chưa có đơn sửa chữa nào hoàn thành.' }}
      </p>
      <p class="text-sm text-ink-500 max-w-sm mx-auto">
        {{ search ? 'Thử từ khoá khác.' : 'Đơn hoàn thành hoặc đã hủy sẽ hiện ở đây.' }}
      </p>
      <div v-if="!search" class="pt-2">
        <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
          Đặt thợ ngay
        </FhButton>
      </div>
    </div>

    <!-- History items list -->
    <ul
      v-else-if="historyList === 'orders' && items.length > 0"
      class="rounded-3xl bg-white border border-ink-200/90 divide-y divide-ink-100 overflow-hidden shadow-xs transition-opacity"
      :class="{ 'opacity-60': changingPage }"
      :aria-busy="changingPage"
    >
      <li
        v-for="item in items"
        :key="item.orderId"
        :data-testid="`history-item-${item.orderId}`"
        role="link"
        tabindex="0"
        class="group p-5 sm:p-6 cursor-pointer hover:bg-brand-50/20 transition-all focus-visible:outline-none focus-visible:bg-brand-50/30"
        @click="router.push(`/app/orders/${item.orderId}`)"
        @keydown.enter="router.push(`/app/orders/${item.orderId}`)"
      >
        <div class="flex items-start justify-between gap-4">
          <!-- Left info -->
          <div class="flex items-start gap-3.5 min-w-0 flex-1">
            <div
              class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105"
              :class="isCancelled(item) ? 'bg-ink-100 text-ink-500 border-ink-200' : 'bg-brand-50 text-brand-600 border-brand-100'"
            >
              <Wrench :size="20" />
            </div>

            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold text-ink-900 group-hover:text-brand-600 transition-colors text-pretty">
                  {{ item.serviceName || 'Dịch vụ sửa chữa' }}
                </h2>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-ink-100 text-ink-600 font-num">
                  {{ item.code }}
                </span>
              </div>

              <!-- Metadata lines -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 pt-0.5">
                <span class="inline-flex items-center gap-1 font-num">
                  <Calendar :size="13" class="text-ink-400" />
                  <span>{{ isCancelled(item) ? 'Hủy ngày' : 'Hoàn thành' }} {{ finishedAt(item) ? vnDateString(finishedAt(item)!) : '—' }}</span>
                </span>
                <span v-if="item.technicianName" class="inline-flex items-center gap-1 text-ink-700 font-medium">
                  <User :size="13" class="text-ink-400" />
                  <span>{{ item.technicianName }}</span>
                </span>
              </div>

              <p
                v-if="item.addressSummary"
                class="text-xs text-ink-500 truncate flex items-center gap-1 pt-0.5"
                :title="item.addressSummary"
              >
                <MapPin :size="13" class="text-ink-400 shrink-0" />
                <span class="truncate">{{ item.addressSummary }}</span>
              </p>
            </div>
          </div>

          <!-- Status pill & arrow -->
          <div class="flex items-start gap-2 shrink-0 pt-0.5">
            <FhStatusPill
              :status="item.status"
              :label="isCancelled(item) ? 'Đã hủy' : 'Hoàn thành'"
            />
            <ChevronRight :size="18" class="text-ink-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5 hidden sm:block" />
          </div>
        </div>

        <!-- Pricing details row -->
        <div
          v-if="!isCancelled(item) || Number(item.grandTotal) > 0"
          class="mt-4 pt-3.5 border-t border-ink-100/80 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-500">
            <template v-if="!isCancelled(item)">
              <span class="whitespace-nowrap">
                Tiền công: <span class="font-semibold text-ink-800 font-num"><FhMoney :amount="item.laborTotal" /></span>
              </span>
              <span class="whitespace-nowrap">
                Linh kiện: <span class="font-semibold text-ink-800 font-num"><FhMoney :amount="item.partsTotal" /></span>
              </span>
            </template>
          </div>

          <div class="flex items-baseline gap-1.5 ml-auto">
            <span class="text-ink-500 text-xs">Tổng chi phí:</span>
            <span class="text-base font-bold text-brand-700 font-num whitespace-nowrap">
              <FhMoney :amount="item.grandTotal" />
            </span>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="historyList === 'visits' && visitGroupsError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
      <span>{{ visitGroupsError }}</span>
      <FhButton variant="secondary" size="sm" @click="retryVisitGroups">Thử lại</FhButton>
    </div>
    <div v-if="historyList === 'visits' && loadingVisitGroups" class="rounded-2xl border border-ink-200 bg-white p-5" aria-busy="true" aria-label="Đang tải lịch sử lượt sửa">
      <div v-for="i in 3" :key="i" class="space-y-2 border-b border-ink-100 py-3 last:border-0">
        <FhSkeleton width="50%" height="18px" />
        <FhSkeleton width="75%" height="14px" />
      </div>
    </div>
    <div v-else-if="historyList === 'visits' && !visitGroupsError && visitGroups.length === 0" data-testid="history-visit-empty" class="space-y-2 rounded-3xl border border-ink-200 bg-white px-6 py-12 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400"><History :size="24" /></div>
      <h2 class="font-semibold text-ink-900">Chưa có lượt sửa nhiều thiết bị đã kết thúc</h2>
      <p class="text-sm text-ink-500">Các lượt đã hoàn thành, hủy hoặc có thiết bị chưa sửa sẽ hiện ở đây.</p>
    </div>
    <ul v-else-if="historyList === 'visits' && visitGroups.length > 0" data-testid="history-visit-groups" class="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white transition-opacity" :class="{ 'opacity-60': changingVisitGroupsPage }" :aria-busy="changingVisitGroupsPage">
      <li v-for="group in visitGroups" :key="group.id" :data-testid="`history-visit-group-${group.id}`" class="space-y-3 p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold text-ink-900">Lượt sửa · {{ group.items.length }} thiết bị</h2>
            <p class="mt-1 text-xs font-num text-ink-500">Tạo ngày {{ vnDateString(group.createdAt) }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{{ groupStatusLabel(group.status) }}</span>
        </div>
        <p class="text-sm text-ink-600">Lịch hẹn <span class="font-num">{{ group.scheduledAt ? vnDateTimeString(group.scheduledAt) : 'Chưa xác định' }}</span></p>
        <ul class="grid gap-2 sm:grid-cols-2" aria-label="Đơn trong lượt sửa đã kết thúc">
          <li v-for="item in group.items" :key="item.itemId" :data-testid="`history-visit-child-${group.id}-${item.sequence}`" class="min-w-0 rounded-xl bg-ink-50 px-3 py-2">
            <router-link v-if="item.orderId" :to="`/app/orders/${item.orderId}`" class="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <span class="block truncate text-sm font-semibold text-brand-700">{{ item.deviceLabel || `Thiết bị ${item.sequence}` }}</span>
              <span class="mt-1 block truncate text-xs text-ink-600">{{ item.serviceName || 'Dịch vụ sửa chữa' }} · {{ groupItemStatus(item) }}</span>
              <span class="mt-1 block font-num text-xs text-ink-500">{{ item.orderCode || 'Mở chi tiết đơn' }}</span>
            </router-link>
            <div v-else>
              <span class="block truncate text-sm font-semibold text-ink-800">{{ item.deviceLabel || `Thiết bị ${item.sequence}` }}</span>
              <span class="mt-1 block truncate text-xs text-ink-600">{{ item.serviceName || 'Dịch vụ sửa chữa' }} · {{ groupItemStatus(item) }}</span>
            </div>
          </li>
        </ul>
      </li>
    </ul>

    <FhPagination
      v-if="historyList === 'orders' && !error"
      v-model:page="page"
      :page-size="PAGE_SIZE"
      :total="total"
      :disabled="loading"
      @prefetch="prefetch"
    />
    <FhPagination
      v-if="historyList === 'visits' && !visitGroupsError"
      v-model:page="visitHistoryPage"
      :page-size="PAGE_SIZE"
      :total="visitGroupsTotal"
      :disabled="loadingVisitGroups"
      @prefetch="prefetchVisitGroups"
    />
  </div>
</template>
