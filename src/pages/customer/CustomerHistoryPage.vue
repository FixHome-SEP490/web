<script setup lang="ts">
// Repair history from the server's read model: the customer's completed and
// cancelled orders, newest first, with what each one cost.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  History,
  ChevronRight,
  RefreshCw,
  Wrench,
  User,
  MapPin,
  Calendar,
  AlertCircle,
  Sparkles,
} from 'lucide-vue-next';
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

// Sliding indicator state
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({ opacity: '0' });

function updateTabIndicator() {
  const el = tabRefs.value[filter.value];
  if (!el || el.offsetWidth === 0) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  indicatorStyle.value = {
    transform: `translate3d(${el.offsetLeft}px, ${el.offsetTop}px, 0)`,
    width: `${el.offsetWidth}px`,
    height: `${el.offsetHeight}px`,
    opacity: '1',
  };
}

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
    void nextTick(updateTabIndicator);
  }
}

watch(filter, () => {
  void nextTick(updateTabIndicator);
  load(1);
});

onMounted(() => {
  load(1);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateTabIndicator);
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
          Theo dõi chi tiết các dịch vụ sửa chữa đã hoàn thành và chi phí thực hiện.
        </p>
      </div>

      <div v-if="!loading && total > 0" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200/60 text-xs font-semibold text-brand-700 self-start sm:self-auto">
        <Sparkles :size="14" class="text-brand-600" />
        <span>Tổng {{ total }} đơn trong lịch sử</span>
      </div>
    </div>

    <!-- Sliding Filter Tabs -->
    <div
      class="relative flex items-center p-1 bg-ink-100/80 backdrop-blur-xs rounded-2xl border border-ink-200/80 text-sm font-medium select-none"
      role="tablist"
      aria-label="Lọc lịch sử sửa chữa"
    >
      <!-- Animated sliding indicator pill -->
      <div
        class="pointer-events-none absolute rounded-xl bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        :style="indicatorStyle"
        aria-hidden="true"
      />

      <button
        v-for="tab in tabs"
        :key="tab.key"
        :ref="(el) => { tabRefs[tab.key] = el as HTMLElement }"
        type="button"
        role="tab"
        :aria-selected="filter === tab.key"
        :data-testid="`history-filter-${tab.key}`"
        class="relative flex-1 h-10 px-3 rounded-xl transition-colors whitespace-nowrap text-center font-medium z-10"
        :class="filter === tab.key ? 'text-brand-700 font-semibold' : 'text-ink-600 hover:text-ink-900'"
        @click="filter = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Error state -->
    <div
      v-if="error"
      role="alert"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3 shadow-xs"
    >
      <div class="flex items-center gap-2 min-w-0">
        <AlertCircle :size="18" class="text-danger-600 shrink-0" />
        <span class="font-medium text-pretty">{{ error }}</span>
      </div>
      <FhButton variant="secondary" size="sm" @click="load(1)">
        Thử lại
      </FhButton>
    </div>

    <!-- Skeleton Loading state -->
    <div
      v-if="loading"
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
      v-else-if="!error && items.length === 0"
      data-testid="history-empty"
      class="py-16 px-6 bg-white rounded-3xl border border-ink-200/90 text-center space-y-3 shadow-xs"
    >
      <div class="w-16 h-16 rounded-2xl bg-ink-100/80 text-ink-400 flex items-center justify-center mx-auto mb-2">
        <History :size="32" />
      </div>
      <p class="text-lg font-semibold text-ink-900">
        {{ filter === 'cancelled' ? 'Bạn chưa có đơn nào đã hủy.' : 'Bạn chưa có đơn sửa chữa nào hoàn thành.' }}
      </p>
      <p class="text-sm text-ink-500 max-w-sm mx-auto">
        Đơn hoàn thành hoặc đã hủy sẽ hiện ở đây.
      </p>
      <div class="pt-2">
        <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
          Đặt thợ ngay
        </FhButton>
      </div>
    </div>

    <!-- History items list -->
    <ul
      v-else-if="items.length > 0"
      class="rounded-3xl bg-white border border-ink-200/90 divide-y divide-ink-100 overflow-hidden shadow-xs"
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
          <div class="flex items-center gap-2 shrink-0">
            <FhStatusPill :status="isCancelled(item) ? 'CANCELLED' : 'COMPLETED'" />
            <ChevronRight :size="18" class="text-ink-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0 hidden sm:block" />
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

    <!-- Load more action -->
    <div v-if="!loading && hasMore" class="flex justify-center pt-2">
      <FhButton variant="secondary" size="md" :loading="loadingMore" data-testid="history-load-more" @click="load(page + 1)">
        <RefreshCw :size="16" />
        Xem thêm
      </FhButton>
    </div>
  </div>
</template>
