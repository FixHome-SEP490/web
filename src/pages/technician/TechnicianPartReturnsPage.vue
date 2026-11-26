<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-vue-next';
import FhButton from '../../components/FhButton.vue';
import FhSkeleton from '../../components/FhSkeleton.vue';
import FhEmptyState from '../../components/FhEmptyState.vue';
import FhStatusPill from '../../components/FhStatusPill.vue';
import DeclarePartReturnModal from '../../components/technician/DeclarePartReturnModal.vue';
import {
  partRequestsApi,
  partReturnGroup,
  isPartReturnsUnavailableError,
  type MyReturnsPage,
  type PartCustodyReturnRecord,
} from '../../api/part-requests.api';
import { ordersApi, isHistoricalOrder } from '../../api/orders.api';
import { partCustodyQuantities } from '../../utils/part-custody-quantities';
import { vnDateTimeString } from '../../utils/vn-time';
import { categoryIcon } from '../../components/booking/service-icons';
import { usePartReturnsRefresh } from '../../composables/usePartReturnsRefresh';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { onOrderListsChange, onResync } from '../../services/live-updates';

interface OrderReturnGroup {
  id: string; // serviceOrderId
  code: string;
  serviceName: string;
  status: string;
  workStopped?: boolean;
  completedAt?: string | null;
  createdAt?: string | null;
  handedOverAt?: string | null;
  records: PartCustodyReturnRecord[];
  needDeclareQty: number;
  awaitingManagerQty: number;
  completedQty: number;
  /** Units still declarable (a declared line may have more left); drives the declare button. */
  declarableQty: number;
  hasDiscrepancy: boolean;
}

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const hasLoadedOnce = ref(false);
const loadError = ref<string | null>(null);
const isUnavailable = ref(false);

const orderGroups = ref<OrderReturnGroup[]>([]);
const selectedOrderId = ref<string | null>(null);

// Filters and search
const activeTab = ref<'all' | 'need_declare' | 'awaiting_manager' | 'completed'>('all');
const searchQuery = ref('');
const timeFilter = ref<'all' | '7d' | '30d' | '90d'>('all');
const statusFilter = ref<'all' | 'need_declare' | 'awaiting_manager' | 'completed' | 'discrepancy'>('all');

// Modal state
const modalOpen = ref(false);
const modalItemId = ref<string | undefined>(undefined);

const selectedOrder = computed(() =>
  orderGroups.value.find((g) => g.id === selectedOrderId.value) || null,
);

// Counters of the three groups come from the server (BUG DETECTOR 302): the list only holds the
// open tab's lines, so counting it would show 0 for the other tabs.
const serverCounts = ref<MyReturnsPage['counts']>(null);
const localSum = (key: 'needDeclareQty' | 'awaitingManagerQty' | 'completedQty') =>
  orderGroups.value.reduce((sum, g) => sum + g[key], 0);
const totalNeedDeclare = computed(() => serverCounts.value?.need_declare.qty ?? localSum('needDeclareQty'));
const totalAwaitingManager = computed(() => serverCounts.value?.awaiting_manager.qty ?? localSum('awaitingManagerQty'));
const totalCompleted = computed(() => serverCounts.value?.completed.qty ?? localSum('completedQty'));

const countNeedDeclareOrders = computed(() =>
  serverCounts.value?.need_declare.orders ?? orderGroups.value.filter((g) => g.needDeclareQty > 0).length,
);

const countAwaitingOrders = computed(() =>
  serverCounts.value?.awaiting_manager.orders ?? orderGroups.value.filter((g) => g.awaitingManagerQty > 0 && g.needDeclareQty === 0).length,
);

const countCompletedOrders = computed(() =>
  serverCounts.value?.completed.orders ?? orderGroups.value.filter((g) => g.needDeclareQty === 0 && g.awaitingManagerQty === 0 && g.records.length > 0).length,
);

const totalOrdersCount = computed(() => serverCounts.value?.all.orders ?? orderGroups.value.length);

// Filtering logic
const filteredOrderGroups = computed(() => {
  let list = orderGroups.value;

  // The tab is read from the server (status=...), so the loaded list already is that group.

  // Status dropdown filter
  if (statusFilter.value === 'need_declare') {
    list = list.filter((g) => g.needDeclareQty > 0);
  } else if (statusFilter.value === 'awaiting_manager') {
    list = list.filter((g) => g.awaitingManagerQty > 0 && g.needDeclareQty === 0);
  } else if (statusFilter.value === 'completed') {
    list = list.filter((g) => g.needDeclareQty === 0 && g.awaitingManagerQty === 0);
  } else if (statusFilter.value === 'discrepancy') {
    list = list.filter((g) => g.hasDiscrepancy);
  }

  // Time filter
  if (timeFilter.value !== 'all') {
    const days = timeFilter.value === '7d' ? 7 : timeFilter.value === '30d' ? 30 : 90;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    list = list.filter((g) => {
      const d = g.completedAt || g.handedOverAt || g.createdAt;
      return d ? new Date(d).getTime() >= threshold : true;
    });
  }

  // Search query
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((g) => {
      const matchCode = g.code.toLowerCase().includes(q);
      const matchService = (g.serviceName || '').toLowerCase().includes(q);
      const matchPart = g.records.some((r) =>
        r.partNameSnapshot.toLowerCase().includes(q) ||
        r.partRequestItemId.toLowerCase().includes(q),
      );
      return matchCode || matchService || matchPart;
    });
  }

  return list;
});

// Load all returns data
const loadData = async (preferredOrderId?: string, options: { silent?: boolean } = {}) => {
  const isBackground = Boolean(options.silent && hasLoadedOnce.value);
  if (!isBackground) {
    loading.value = true;
    loadError.value = null;
    isUnavailable.value = false;
  }

  try {
    // 1. The lines of the open tab, with every group's counters (BUG DETECTOR 302)
    let mineRecords: PartCustodyReturnRecord[] = [];
    const tab = activeTab.value;
    try {
      const page = await partRequestsApi.getMyReturnsPage(tab);
      if (tab !== activeTab.value) return; // the tab changed meanwhile; its own load answers
      mineRecords = page.records;
      serverCounts.value = page.counts;
    } catch (err) {
      if (isPartReturnsUnavailableError(err)) {
        isUnavailable.value = true;
        hasLoadedOnce.value = true;
        loading.value = false;
        return;
      }
      throw err;
    }

    // 2. Identify all relevant order IDs
    const targetOrderIds = new Set<string>();
    mineRecords.forEach((r) => {
      if (r.orderId) targetOrderIds.add(r.orderId);
    });

    const routeOrderId = (route.query.orderId as string) || preferredOrderId;
    if (routeOrderId) {
      targetOrderIds.add(routeOrderId);
    }

    // 3. Order metadata per order; the lines are the tab's own. Only an order asked by the
    //    route and absent from this tab reads its ledger separately.
    const orderIdList = Array.from(targetOrderIds);
    const groups: OrderReturnGroup[] = [];

    const orderResults = await Promise.allSettled(
      orderIdList.map(async (orderId) => {
        const listed = mineRecords.filter((r) => r.orderId === orderId);
        const [returns, orderData] = await Promise.all([
          listed.length ? Promise.resolve(listed) : partRequestsApi.getReturnsByOrderId(orderId).catch(() => []),
          ordersApi.getTechnicianOrder(orderId).catch(() => null),
        ]);

        return { orderId, returns, orderData };
      }),
    );
    if (tab !== activeTab.value) return;

    for (const res of orderResults) {
      if (res.status === 'fulfilled') {
        const { orderId, returns, orderData } = res.value;
        const records = returns;
        if (!records.length) continue;

        let needDeclareQty = 0;
        let awaitingManagerQty = 0;
        let completedQty = 0;
        let declarableQty = 0;
        let hasDiscrepancy = false;
        let oldestHandover: string | null = null;

        for (const r of records) {
          const group = partReturnGroup(r);
          if (group === 'need_declare') needDeclareQty += r.outstandingQty;
          else if (group === 'awaiting_manager') awaitingManagerQty += r.outstandingQty;
          else if (group === 'completed') completedQty += r.issuedQty;
          declarableQty += partCustodyQuantities(r).remainingToDeclare;
          if (r.discrepancies && r.discrepancies.length > 0) {
            hasDiscrepancy = true;
          }
          if (r.handedOverAt && (!oldestHandover || new Date(r.handedOverAt) < new Date(oldestHandover))) {
            oldestHandover = r.handedOverAt;
          }
        }

        const isHistorical = orderData ? isHistoricalOrder(orderData) : false;
        const code = orderData?.code || `FH-${orderId.substring(0, 8).toUpperCase()}`;
        const serviceName = (!isHistorical && orderData && 'serviceName' in orderData)
          ? (orderData.serviceName || '')
          : '';

        groups.push({
          id: orderId,
          code,
          serviceName,
          status: orderData?.status || 'COMPLETED',
          workStopped: orderData?.workStopped,
          completedAt: orderData?.completedAt,
          createdAt: orderData?.createdAt ? String(orderData.createdAt) : null,
          handedOverAt: oldestHandover,
          records,
          needDeclareQty,
          awaitingManagerQty,
          completedQty,
          declarableQty,
          hasDiscrepancy,
        });
      }
    }

    // Sort order groups: needs declaration/discrepancy first, then awaiting, then completed
    groups.sort((a, b) => {
      const aPriority = a.hasDiscrepancy ? 4 : a.needDeclareQty > 0 ? 3 : a.awaitingManagerQty > 0 ? 2 : 1;
      const bPriority = b.hasDiscrepancy ? 4 : b.needDeclareQty > 0 ? 3 : b.awaitingManagerQty > 0 ? 2 : 1;
      if (aPriority !== bPriority) return bPriority - aPriority;
      const aTime = a.completedAt || a.handedOverAt || a.createdAt || '';
      const bTime = b.completedAt || b.handedOverAt || b.createdAt || '';
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    orderGroups.value = groups;
    loadError.value = null;
    isUnavailable.value = false;
    hasLoadedOnce.value = true;

    // Pick selected order
    if (routeOrderId && groups.some((g) => g.id === routeOrderId)) {
      selectedOrderId.value = routeOrderId;
    } else if (!selectedOrderId.value || !groups.some((g) => g.id === selectedOrderId.value)) {
      selectedOrderId.value = groups[0]?.id || null;
    }
  } catch {
    if (!isBackground) {
      loadError.value = 'Không thể tải danh sách linh kiện cần trả. Vui lòng thử lại.';
    }
  } finally {
    loading.value = false;
  }
};

// Faulty parts of warranty claims: not in the custody ledger above, so listed here too. Handing one in is done on the claim.
const faultyClaims = ref<StaffWarrantyClaim[]>([]);
const loadFaulty = async () => {
  try {
    const page = await warrantyClaimsApi.listMine({ page: 1, pageSize: 100 });
    faultyClaims.value = page.items
      .filter((c) => c.partRequest && ['received', 'completed'].includes(String(c.partRequest.status).toLowerCase()) && !c.partRequest.faultyReturnedAt)
      .sort((a, b) => (a.partRequest?.faultyReturnDueAt ?? '9').localeCompare(b.partRequest?.faultyReturnDueAt ?? '9'));
  } catch {
    // The ledger above still works; the next change or visit reads again.
  }
};
const faultyOverdue = (claim: StaffWarrantyClaim) => {
  const due = claim.partRequest?.faultyReturnDueAt;
  return !!claim.partRequest?.faultyReturnChargedAt || (!!due && new Date(due).getTime() < Date.now());
};
const stopFaultyLive = onOrderListsChange(() => void loadFaulty());
const stopFaultyResync = onResync(() => void loadFaulty());
onBeforeUnmount(() => {
  stopFaultyLive();
  stopFaultyResync();
});

onMounted(() => {
  void loadData();
  void loadFaulty();
});

// Each tab is its own server group: switching reads that group.
watch(activeTab, () => void loadData(selectedOrderId.value ?? undefined));

// Auto-refresh on notifications or window focus without flashing loading skeletons
usePartReturnsRefresh(() => loadData(selectedOrderId.value ?? undefined, { silent: true }));

// Watch query param change
watch(
  () => route.query.orderId,
  (newOrderId) => {
    if (typeof newOrderId === 'string' && newOrderId) {
      if (orderGroups.value.some((g) => g.id === newOrderId)) {
        selectedOrderId.value = newOrderId;
      } else {
        void loadData(newOrderId);
      }
    }
  },
);

const selectOrder = (order: OrderReturnGroup) => {
  selectedOrderId.value = order.id;
};

const openDeclareModal = (itemId?: string) => {
  modalItemId.value = itemId;
  modalOpen.value = true;
};

const onModalSuccess = () => {
  void loadData(selectedOrderId.value ?? undefined, { silent: true });
};

const viewJobDetail = (orderId: string) => {
  router.push(`/tech/jobs/${encodeURIComponent(orderId)}`);
};

const getPartStatusBadge = (record: PartCustodyReturnRecord) => {
  const group = partReturnGroup(record);
  if (group === null) return { label: 'Sai lệch', tone: 'danger' as const };
  if (group === 'need_declare') return { label: 'Cần khai trả', tone: 'warning' as const };
  if (group === 'awaiting_manager') return { label: 'Chờ xác nhận', tone: 'info' as const };
  return { label: 'Đã hoàn tất', tone: 'success' as const };
};

/** Small hint on a line to declare: the job has not recorded how many were used yet. */
const usageMissing = (record: PartCustodyReturnRecord) =>
  record.usageRecorded === false && partReturnGroup(record) === 'need_declare';

const getOrderStatusBadge = (order: OrderReturnGroup) => {
  if (order.hasDiscrepancy) {
    return { label: 'Có sai lệch', tone: 'danger' as const };
  }
  if (order.needDeclareQty > 0) {
    return { label: 'Cần khai trả', tone: 'warning' as const };
  }
  if (order.awaitingManagerQty > 0) {
    return { label: 'Chờ xác nhận', tone: 'info' as const };
  }
  return { label: 'Đã hoàn tất', tone: 'success' as const };
};

const formatOrderTime = (order: OrderReturnGroup) => {
  const ts = order.completedAt || order.handedOverAt || order.createdAt;
  if (!ts) return '';
  const dateStr = vnDateTimeString(ts);
  if (order.completedAt) return `Hoàn thành lúc: ${dateStr}`;
  if (order.handedOverAt) return `Nhận linh kiện: ${dateStr}`;
  return `Ngày tạo: ${dateStr}`;
};
</script>

<template>
  <div class="w-full mx-auto space-y-6" data-testid="technician-part-returns-shell">
    <!-- Top Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Linh kiện cần trả</h1>
        <div class="flex items-center gap-2 mt-1 text-sm text-ink-600">
          <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span>Theo dõi linh kiện FixHome đã nhận và nghĩa vụ hoàn trả</span>
        </div>
      </div>
    </div>

    <!-- Faulty parts of warranty claims still to hand in -->
    <section
      v-if="faultyClaims.length"
      class="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 space-y-3"
      data-testid="faulty-warranty-returns"
    >
      <div class="flex items-center gap-2">
        <AlertTriangle :size="18" class="text-amber-600 shrink-0" />
        <h2 class="text-base font-semibold text-ink-900">Linh kiện hỏng cần nộp (bảo hành)</h2>
        <span class="font-num text-sm font-bold text-amber-900">{{ faultyClaims.length }}</span>
      </div>
      <ul class="divide-y divide-amber-200/70 rounded-xl border border-amber-200 bg-white">
        <li v-for="claim in faultyClaims" :key="claim.id">
          <router-link
            :to="{ name: 'tech-warranty-detail', params: { id: claim.id } }"
            class="flex flex-wrap items-center justify-between gap-2 p-3.5 hover:bg-amber-50/60"
            :data-testid="`faulty-return-${claim.id}`"
          >
            <span class="min-w-0">
              <span class="font-semibold text-ink-900">#{{ claim.order.code }}</span>
              <span class="text-ink-600"> · {{ claim.order.serviceName }}</span>
            </span>
            <span class="text-sm" :class="faultyOverdue(claim) ? 'font-medium text-danger-700' : 'text-ink-700'">
              <template v-if="claim.partRequest?.faultyReturnChargedAt">Quá hạn, đã bị trừ ví</template>
              <template v-else-if="faultyOverdue(claim)">Đã quá hạn nộp</template>
              <template v-else-if="claim.partRequest?.faultyReturnDueAt">Hạn nộp {{ vnDateTimeString(claim.partRequest.faultyReturnDueAt) }}</template>
              <template v-else>Chưa có hạn nộp</template>
            </span>
          </router-link>
        </li>
      </ul>
    </section>

    <!-- Unavailable Feature State -->
    <div
      v-if="isUnavailable"
      class="rounded-2xl border border-ink-200 bg-white p-8 text-center space-y-4 shadow-sm"
      data-testid="part-returns-unavailable"
    >
      <div class="w-14 h-14 mx-auto rounded-2xl bg-ink-100 flex items-center justify-center text-ink-600">
        <PackageCheck :size="28" />
      </div>
      <div class="space-y-1">
        <h2 class="text-lg font-bold text-ink-900">Tính năng hoàn trả linh kiện chưa được kích hoạt</h2>
        <p class="text-sm text-ink-600 max-w-md mx-auto">
          Hệ thống theo dõi hoàn trả linh kiện FixHome hiện chưa khả dụng trên tài khoản hoặc môi trường này. Vui lòng liên hệ Quản lý Dịch vụ nếu bạn cần hỗ trợ.
        </p>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="loadError"
      class="rounded-2xl border border-danger-200 bg-danger-50/70 p-6 text-center space-y-3"
      role="alert"
      data-testid="part-returns-error"
    >
      <AlertTriangle :size="28" class="text-danger-600 mx-auto" />
      <p class="text-sm font-medium text-danger-800">{{ loadError }}</p>
      <FhButton variant="secondary" size="md" @click="loadData(selectedOrderId ?? undefined)">
        <RefreshCw :size="16" class="mr-1.5" /> Thử lại
      </FhButton>
    </div>

    <!-- Main Content when Available -->
    <div v-else class="space-y-6">
      <!-- 3 Stat Cards Row -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="stat-cards-row">
        <!-- Card 1: Cần khai trả -->
        <button
          type="button"
          class="flex items-center justify-between p-5 bg-white rounded-2xl border transition-all text-left group shadow-xs hover:shadow-md cursor-pointer"
          :class="activeTab === 'need_declare' ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20' : 'border-ink-200 hover:border-ink-300'"
          data-testid="stat-card-need-declare"
          @click="activeTab = activeTab === 'need_declare' ? 'all' : 'need_declare'"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shrink-0 group-hover:scale-105 transition-transform">
              <Package :size="24" :stroke-width="1.8" />
            </div>
            <div>
              <span class="text-xs font-semibold text-ink-500 block">Cần khai trả</span>
              <div class="text-2xl font-bold font-num text-ink-900 mt-0.5">
                <span v-if="loading"><FhSkeleton class="h-7 w-20" /></span>
                <span v-else>{{ totalNeedDeclare }} linh kiện</span>
              </div>
            </div>
          </div>
          <ChevronRight :size="20" class="text-ink-400 group-hover:text-ink-700 transition-colors shrink-0" />
        </button>

        <!-- Card 2: Chờ quản lý xác nhận -->
        <button
          type="button"
          class="flex items-center justify-between p-5 bg-white rounded-2xl border transition-all text-left group shadow-xs hover:shadow-md cursor-pointer"
          :class="activeTab === 'awaiting_manager' ? 'border-blue-400 ring-2 ring-blue-400/20 bg-blue-50/20' : 'border-ink-200 hover:border-ink-300'"
          data-testid="stat-card-awaiting"
          @click="activeTab = activeTab === 'awaiting_manager' ? 'all' : 'awaiting_manager'"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-105 transition-transform">
              <Clock :size="24" :stroke-width="1.8" />
            </div>
            <div>
              <span class="text-xs font-semibold text-ink-500 block">Chờ quản lý xác nhận</span>
              <div class="text-2xl font-bold font-num text-ink-900 mt-0.5">
                <span v-if="loading"><FhSkeleton class="h-7 w-20" /></span>
                <span v-else>{{ totalAwaitingManager }} linh kiện</span>
              </div>
            </div>
          </div>
          <ChevronRight :size="20" class="text-ink-400 group-hover:text-ink-700 transition-colors shrink-0" />
        </button>

        <!-- Card 3: Đã hoàn tất -->
        <button
          type="button"
          class="flex items-center justify-between p-5 bg-white rounded-2xl border transition-all text-left group shadow-xs"
          :class="[
            countCompletedOrders > 0 ? 'hover:shadow-md cursor-pointer' : 'cursor-default',
            activeTab === 'completed'
              ? 'border-emerald-400 ring-2 ring-emerald-400/20 bg-emerald-50/20'
              : countCompletedOrders > 0
                ? 'border-ink-200 hover:border-ink-300'
                : 'border-ink-200',
          ]"
          :aria-disabled="countCompletedOrders === 0"
          data-testid="stat-card-completed"
          @click="countCompletedOrders > 0 && (activeTab = activeTab === 'completed' ? 'all' : 'completed')"
        >
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shrink-0 transition-transform" :class="{ 'group-hover:scale-105': countCompletedOrders > 0 }">
              <CheckCircle2 :size="24" :stroke-width="1.8" />
            </div>
            <div class="min-w-0">
              <span class="text-xs font-semibold text-ink-500 block">Đã hoàn tất</span>
              <div class="text-2xl font-bold font-num text-ink-900 mt-0.5">
                <span v-if="loading"><FhSkeleton class="h-7 w-20" /></span>
                <span v-else>{{ totalCompleted }} linh kiện</span>
              </div>
              <span
                v-if="!loading && countCompletedOrders === 0 && totalCompleted > 0"
                class="block text-[11px] font-medium text-emerald-700 mt-0.5"
              >
                Đã tất toán ở các đơn trước
              </span>
            </div>
          </div>
          <ChevronRight
            v-if="countCompletedOrders > 0"
            :size="20"
            class="text-ink-400 group-hover:text-ink-700 transition-colors shrink-0"
          />
        </button>
      </div>

      <!-- Filter Tabs & Search Controls Row -->
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-ink-200 shadow-2xs">
        <!-- Tabs on left -->
        <div class="flex flex-wrap items-center gap-1.5" role="tablist">
          <button
            type="button"
            class="h-9 px-3.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            :class="activeTab === 'all'
              ? 'bg-brand-600 text-white font-semibold shadow-xs'
              : 'bg-ink-50 text-ink-700 hover:bg-ink-100'"
            @click="activeTab = 'all'"
          >
            <span>Tất cả</span>
            <span class="font-num font-bold">{{ totalOrdersCount }}</span>
          </button>

          <button
            type="button"
            class="h-9 px-3.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            :class="activeTab === 'need_declare'
              ? 'bg-amber-600 text-white font-semibold shadow-xs'
              : 'bg-ink-50 text-ink-700 hover:bg-ink-100'"
            @click="activeTab = 'need_declare'"
          >
            <span>Cần khai trả</span>
            <span class="font-num font-bold">{{ countNeedDeclareOrders }}</span>
          </button>

          <button
            type="button"
            class="h-9 px-3.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            :class="activeTab === 'awaiting_manager'
              ? 'bg-blue-600 text-white font-semibold shadow-xs'
              : 'bg-ink-50 text-ink-700 hover:bg-ink-100'"
            @click="activeTab = 'awaiting_manager'"
          >
            <span>Chờ xác nhận</span>
            <span class="font-num font-bold">{{ countAwaitingOrders }}</span>
          </button>

          <button
            type="button"
            class="h-9 px-3.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            :class="activeTab === 'completed'
              ? 'bg-emerald-600 text-white font-semibold shadow-xs'
              : 'bg-ink-50 text-ink-700 hover:bg-ink-100'"
            @click="activeTab = 'completed'"
          >
            <span>Đã hoàn tất</span>
            <span class="font-num font-bold">{{ countCompletedOrders }}</span>
          </button>
        </div>

        <!-- Controls on right: Search + Time + Status -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Search box -->
          <div class="relative flex-1 sm:w-60 min-w-44">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm theo mã công việc, linh kiện..."
              class="h-9 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              data-testid="search-input"
            />
          </div>

          <!-- Time select -->
          <div class="relative">
            <select
              v-model="timeFilter"
              class="h-9 rounded-xl border border-ink-200 bg-white pl-3 pr-8 text-xs font-medium text-ink-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 appearance-none cursor-pointer"
              aria-label="Lọc thời gian"
            >
              <option value="all">Tất cả thời gian</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="90d">90 ngày qua</option>
            </select>
            <Calendar :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          </div>

          <!-- Status select -->
          <div class="relative">
            <select
              v-model="statusFilter"
              class="h-9 rounded-xl border border-ink-200 bg-white pl-3 pr-8 text-xs font-medium text-ink-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 appearance-none cursor-pointer"
              aria-label="Lọc trạng thái"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="need_declare">Cần khai trả</option>
              <option value="awaiting_manager">Chờ xác nhận</option>
              <option value="completed">Đã hoàn tất</option>
              <option value="discrepancy">Có sai lệch / đối soát</option>
            </select>
            <SlidersHorizontal :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <!-- Master-Detail 2-Column Section -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Left Column: Job Cards List (cols 5) -->
        <div class="lg:col-span-5 space-y-3" data-testid="job-list-column">
          <!-- Loading skeleton -->
          <div v-if="loading" class="space-y-3" aria-busy="true">
            <div v-for="i in 4" :key="i" class="p-4 rounded-2xl border border-ink-200 bg-white space-y-3 shadow-2xs">
              <div class="flex items-center justify-between">
                <FhSkeleton class="h-5 w-36" />
                <FhSkeleton class="h-5 w-20 rounded-full" />
              </div>
              <FhSkeleton class="h-4 w-48" />
              <FhSkeleton class="h-3 w-32" />
            </div>
          </div>

          <!-- Empty state when no orders match or all obligations settled -->
          <div
            v-else-if="filteredOrderGroups.length === 0"
            class="p-8 bg-white rounded-2xl border border-ink-200 text-center shadow-2xs"
            data-testid="job-list-empty"
          >
            <div v-if="orderGroups.length === 0 && totalCompleted > 0" class="space-y-2.5">
              <div class="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
                <CheckCircle2 :size="24" />
              </div>
              <h3 class="text-sm font-bold text-ink-900">Không còn công việc cần trả linh kiện</h3>
              <p class="text-xs text-ink-500 max-w-xs mx-auto leading-relaxed">
                Tất cả <span class="font-num font-semibold text-ink-700">{{ totalCompleted }} linh kiện</span> FixHome bạn đã nhận đều đã hoàn tất đối soát và bàn giao xong.
              </p>
            </div>
            <FhEmptyState
              v-else
              title="Không tìm thấy công việc phù hợp"
              description="Hiện không có công việc nào cần trả linh kiện theo tiêu chí tìm kiếm hoặc bộ lọc hiện tại."
            />
          </div>

          <!-- Job cards -->
          <div
            v-for="order in filteredOrderGroups"
            :key="order.id"
            role="button"
            tabindex="0"
            class="p-4 rounded-2xl border transition-all text-left group shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            :class="selectedOrderId === order.id
              ? 'border-brand-500 bg-brand-50/30 ring-2 ring-brand-500/20'
              : 'border-ink-200 bg-white hover:border-ink-300 hover:shadow-sm'"
            :data-testid="`job-card-${order.id}`"
            @click="selectOrder(order)"
            @keydown.enter.prevent="selectOrder(order)"
            @keydown.space.prevent="selectOrder(order)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <!-- Device / Service Category Icon -->
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                  :class="selectedOrderId === order.id
                    ? 'bg-brand-100/70 border-brand-200 text-brand-700'
                    : 'bg-ink-50 border-ink-100 text-ink-600 group-hover:text-brand-600'"
                >
                  <component
                    :is="categoryIcon({ name: order.serviceName })"
                    :size="20"
                    :stroke-width="1.8"
                  />
                </div>

                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-ink-900 font-num tracking-tight truncate">
                      {{ order.code }}
                    </span>
                  </div>
                  <p class="text-xs text-ink-600 truncate mt-0.5">
                    {{ order.serviceName || 'Chi tiết công việc' }}
                  </p>
                </div>
              </div>

              <!-- Status pill on top right -->
              <div class="shrink-0 flex items-center gap-1.5">
                <span
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                  :class="{
                    'bg-danger-50 text-danger-700 border border-danger-200': getOrderStatusBadge(order).tone === 'danger',
                    'bg-amber-50 text-amber-700 border border-amber-200': getOrderStatusBadge(order).tone === 'warning',
                    'bg-blue-50 text-blue-700 border border-blue-200': getOrderStatusBadge(order).tone === 'info',
                    'bg-emerald-50 text-emerald-700 border border-emerald-200': getOrderStatusBadge(order).tone === 'success',
                  }"
                >
                  <Package v-if="getOrderStatusBadge(order).tone === 'warning'" :size="12" />
                  <Clock v-else-if="getOrderStatusBadge(order).tone === 'info'" :size="12" />
                  <CheckCircle2 v-else-if="getOrderStatusBadge(order).tone === 'success'" :size="12" />
                  <AlertTriangle v-else :size="12" />
                  <span>{{ getOrderStatusBadge(order).label }}</span>
                </span>
                <ChevronRight :size="16" class="text-ink-400 group-hover:text-ink-700 transition-colors" />
              </div>
            </div>

            <!-- Footer row on card -->
            <div class="mt-3 pt-2.5 border-t border-ink-100/80 flex items-center justify-between text-xs text-ink-500">
              <span class="truncate">{{ formatOrderTime(order) }}</span>
              <span v-if="order.needDeclareQty > 0" class="font-semibold text-amber-700 whitespace-nowrap ml-2">
                Còn trả: {{ order.needDeclareQty }}
              </span>
              <span v-else-if="order.awaitingManagerQty > 0" class="font-semibold text-blue-700 whitespace-nowrap ml-2">
                Chờ nhận: {{ order.awaitingManagerQty }}
              </span>
              <span v-else class="font-semibold text-emerald-700 whitespace-nowrap ml-2">
                Đã xong
              </span>
            </div>
          </div>
        </div>

        <!-- Right Column: Selected Job Detail & Parts Table (cols 7) -->
        <div class="lg:col-span-7" data-testid="job-detail-column">
          <!-- When no job selected -->
          <div
            v-if="!selectedOrder"
            class="p-10 sm:p-12 bg-white rounded-2xl border border-ink-200 text-center shadow-2xs space-y-3"
          >
            <template v-if="orderGroups.length === 0 && totalCompleted > 0">
              <div class="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 mx-auto flex items-center justify-center text-emerald-600">
                <PackageCheck :size="28" />
              </div>
              <h3 class="text-base font-bold text-ink-900">Đã hoàn tất đối soát toàn bộ</h3>
              <p class="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
                Bảng này chỉ liệt kê các công việc đang còn nghĩa vụ khai trả hoặc chờ quản lý xác nhận. Toàn bộ <span class="font-num font-semibold text-ink-700">{{ totalCompleted }} linh kiện</span> từ các công việc trước đã được tất toán xong.
              </p>
              <div class="pt-1">
                <FhButton variant="secondary" size="sm" @click="router.push('/tech/jobs')">
                  Xem danh sách công việc
                </FhButton>
              </div>
            </template>
            <template v-else>
              <div class="w-16 h-16 rounded-2xl bg-ink-50 mx-auto flex items-center justify-center text-ink-400">
                <Package :size="32" />
              </div>
              <h3 class="text-base font-bold text-ink-800">Chọn một công việc để xem chi tiết</h3>
              <p class="text-xs text-ink-500 max-w-sm mx-auto">
                Bấm vào danh sách công việc bên trái để xem nghĩa vụ hoàn trả linh kiện và gửi khai trả về kho.
              </p>
            </template>
          </div>

          <!-- Selected Job Card Container -->
          <div
            v-else
            class="bg-white rounded-2xl border border-ink-200 p-6 shadow-sm space-y-6"
            data-testid="selected-job-panel"
          >
            <!-- Job Header -->
            <div class="flex items-start justify-between gap-4 border-b border-ink-100 pb-5">
              <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-brand-600 shrink-0">
                  <component
                    :is="categoryIcon({ name: selectedOrder.serviceName })"
                    :size="28"
                    :stroke-width="1.8"
                  />
                </div>
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-xl font-bold font-num text-ink-900 tracking-tight" data-testid="selected-order-code">
                      {{ selectedOrder.code }}
                    </h2>
                    <FhStatusPill
                      :status="selectedOrder.workStopped ? 'CANCELLED' : selectedOrder.status"
                      :label="selectedOrder.workStopped ? 'Đã dừng công việc' : undefined"
                    />
                  </div>
                  <p class="text-sm text-ink-600 mt-0.5 font-medium">
                    {{ selectedOrder.serviceName || 'Chi tiết công việc' }}
                  </p>
                  <p class="text-xs text-ink-400 mt-1">
                    {{ formatOrderTime(selectedOrder) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Discrepancy warning alert if any -->
            <div
              v-if="selectedOrder.hasDiscrepancy"
              class="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50/80 p-4 text-xs text-danger-900"
              role="alert"
              data-testid="discrepancy-alert"
            >
              <AlertTriangle :size="18" class="text-danger-600 shrink-0 mt-0.5" />
              <div class="space-y-1">
                <p class="font-bold">Linh kiện có biên bản sai lệch / đối soát</p>
                <p class="leading-relaxed">
                  Quản lý Dịch vụ đã ghi nhận số lượng thực tế kiểm đếm có sự khác biệt so với số lượng bạn đã khai trả. Vui lòng liên hệ với Quản lý Dịch vụ hoặc đối soát tại quầy.
                </p>
              </div>
            </div>

            <!-- Parts Table Section -->
            <div class="space-y-3">
              <h3 class="text-base font-bold text-ink-900">Danh sách linh kiện đã nhận</h3>

              <div class="overflow-x-auto rounded-xl border border-ink-200">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-ink-200 bg-ink-50/70 text-ink-600 font-semibold uppercase tracking-wider">
                      <th class="py-3 px-4">Linh kiện</th>
                      <th class="py-3 px-3 text-center">Đã nhận</th>
                      <th class="py-3 px-3 text-center">Đã dùng</th>
                      <th class="py-3 px-3 text-center">Còn phải trả</th>
                      <th class="py-3 px-4 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-ink-100">
                    <tr
                      v-for="record in selectedOrder.records"
                      :key="record.partRequestItemId"
                      class="hover:bg-ink-50/40 transition-colors"
                      :data-testid="`part-row-${record.partRequestItemId}`"
                    >
                      <!-- Linh kiện column -->
                      <td class="py-3.5 px-4">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-lg bg-ink-100 border border-ink-200 flex items-center justify-center text-ink-600 shrink-0">
                            <Package :size="18" />
                          </div>
                          <div>
                            <span class="font-bold text-ink-900 block text-xs sm:text-sm">
                              {{ record.partNameSnapshot }}
                            </span>
                            <span class="text-[11px] text-ink-500 font-num">
                              Mã: {{ record.partRequestItemId.substring(0, 8).toUpperCase() }}
                            </span>
                            <span
                              v-if="usageMissing(record)"
                              class="ml-1.5 text-[11px] text-amber-700"
                              :data-testid="`usage-missing-${record.partRequestItemId}`"
                            >Chưa ghi dùng</span>
                          </div>
                        </div>
                      </td>

                      <!-- Đã nhận -->
                      <td class="py-3.5 px-3 text-center font-num text-ink-700">
                        {{ record.issuedQty }} cái
                      </td>

                      <!-- Đã dùng -->
                      <td class="py-3.5 px-3 text-center font-num text-ink-700">
                        {{ record.usedQty }} cái
                      </td>

                      <!-- Còn phải trả -->
                      <td class="py-3.5 px-3 text-center font-num font-bold text-ink-900 text-sm">
                        {{ record.outstandingQty }} cái
                      </td>

                      <!-- Trạng thái -->
                      <td class="py-3.5 px-4 text-right">
                        <span
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                          :class="{
                            'bg-danger-50 text-danger-700 border border-danger-200': getPartStatusBadge(record).tone === 'danger',
                            'bg-amber-50 text-amber-700 border border-amber-200': getPartStatusBadge(record).tone === 'warning',
                            'bg-blue-50 text-blue-700 border border-blue-200': getPartStatusBadge(record).tone === 'info',
                            'bg-emerald-50 text-emerald-700 border border-emerald-200': getPartStatusBadge(record).tone === 'success',
                          }"
                        >
                          <Package v-if="getPartStatusBadge(record).tone === 'warning'" :size="12" />
                          <Clock v-else-if="getPartStatusBadge(record).tone === 'info'" :size="12" />
                          <CheckCircle2 v-else-if="getPartStatusBadge(record).tone === 'success'" :size="12" />
                          <AlertTriangle v-else :size="12" />
                          <span>{{ getPartStatusBadge(record).label }}</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Action Buttons Footer -->
            <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-ink-100">
              <!-- View Job Detail -->
              <FhButton
                variant="secondary"
                size="md"
                data-testid="view-job-detail-btn"
                @click="viewJobDetail(selectedOrder.id)"
              >
                <ExternalLink :size="16" class="mr-1.5" />
                Xem chi tiết công việc
              </FhButton>

              <!-- Declare Return Button -->
              <FhButton
                variant="primary"
                size="md"
                :disabled="selectedOrder.declarableQty === 0"
                data-testid="open-declare-return-btn"
                @click="openDeclareModal()"
              >
                <PackageCheck :size="16" class="mr-1.5" />
                Khai trả linh kiện
              </FhButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Declare Part Return Modal -->
    <DeclarePartReturnModal
      v-if="selectedOrder"
      :open="modalOpen"
      :order-id="selectedOrder.id"
      :items="selectedOrder.records"
      :initial-item-id="modalItemId"
      @close="modalOpen = false"
      @success="onModalSuccess"
    />
  </div>
</template>
