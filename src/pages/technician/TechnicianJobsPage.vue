<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  ChevronRight,
  Navigation,
  MessageSquare,
  Phone,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhPagination,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import { ordersApi, historicalPill, isHistoricalOrder, isReleasedJob, type HistoricalOrderItem, type ServiceOrderItem, type TechnicianOrderItem } from '../../api/orders.api';
import { visitGroupsApi, type VisitGroupAssignedPageItem, type VisitGroupPageDevice } from '../../api/visit-groups.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { useQueryChoice, useQueryPage } from '../../composables/useQueryState';
import { useChatStore } from '../../stores/chat.store';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';
import { isArrivedWaiting, isVisitArrived, VISIT_DEVICE_ARRIVED_LABEL, VISIT_GROUP_ARRIVED_LABEL } from '../../utils/visit-arrival';

const router = useRouter();
const chatStore = useChatStore();

// The tabs as before; each is asked of the server in one request (`statuses=`), 20 per page.
type JobTab = 'all' | 'pending' | 'in_progress' | 'completed';
const TAB_KEYS: readonly JobTab[] = ['all', 'pending', 'in_progress', 'completed'];
const TAB_STATES: Record<JobTab, string[]> = {
  all: [],
  pending: ['accepted', 'en_route'],
  in_progress: ['under_repair'],
  completed: ['completed'],
};
const PAGE_SIZE = 20;

const activeTab = useQueryChoice<JobTab>('tab', TAB_KEYS, 'all');
const listView = useQueryChoice<'jobs' | 'visits' | 'history'>('list', ['jobs', 'visits', 'history'], 'jobs');
const actionLoading = ref<string | null>(null);
const cache = useCacheUpdates();

const {
  page,
  items: jobs,
  total,
  loading,
  error,
  load,
  changingPage,
  prefetch,
} = usePagedList<TechnicianOrderItem>({
  key: () => queryKeys.orders.technicianJobs({ tab: activeTab.value }),
  pageSize: PAGE_SIZE,
  fetch: (p, size) => ordersApi.getTechnicianJobsPage(p, size, { statuses: TAB_STATES[activeTab.value], excludeVisitGroups: true }),
});
const visitGroupsList = usePagedList<VisitGroupAssignedPageItem>({
  key: () => queryKeys.visitGroups.technicianList({ tab: 'all' }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('visitsPage'),
  fetch: (p, size) => visitGroupsApi.assignedPage(p, size, { tab: 'all' }),
});
const {
  page: visitGroupsPage,
  items: visitGroups,
  total: visitGroupsTotal,
  loading: loadingVisitGroups,
  error: visitGroupsError,
  load: retryVisitGroups,
  changingPage: changingVisitGroupsPage,
  prefetch: prefetchVisitGroups,
} = visitGroupsList;

const historyList = usePagedList<HistoricalOrderItem>({
  key: () => queryKeys.orders.technicianJobs({ history: 'withdrawn' }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('historyPage'),
  enabled: () => listView.value === 'history',
  fetch: (p, size) => ordersApi.getTechnicianHistoryPage(p, size),
});
const { page: historyPage, items: history, total: historyTotal, loading: historyLoading,
  error: historyError, load: retryHistory, prefetch: prefetchHistory } = historyList;

// How many jobs each tab holds: one row per tab is enough to read its total.
async function fetchCounts(): Promise<Partial<Record<JobTab, number>>> {
  const totals = await Promise.all(
    TAB_KEYS.map((key) =>
      ordersApi.getTechnicianJobsPage(1, 1, { statuses: TAB_STATES[key], excludeVisitGroups: true }).then((r) => r.total).catch(() => null),
    ),
  );
  const next: Partial<Record<JobTab, number>> = {};
  TAB_KEYS.forEach((key, index) => {
    const value = totals[index];
    if (value !== null) next[key] = value;
  });
  return next;
}
const { data: counts, refetch: refetchCounts } = useCachedQuery({
  key: queryKeys.orders.technicianJobCounts,
  fetch: fetchCounts,
});
async function loadJobs() {
  await Promise.all([load(), refetchCounts()]);
}

watch(total, (value) => {
  if (!loading.value && !error.value) counts.value = { ...counts.value, [activeTab.value]: value };
});

const rows = computed(() =>
  jobs.value.map((entry) =>
    isHistoricalOrder(entry)
      ? { id: entry.id, old: entry, job: null }
      : { id: entry.id, old: null, job: entry },
  ),
);

const loadError = () => userFacingError(error.value, 'Không thể tải danh sách công việc. Vui lòng thử lại.');

const tabs = computed(() => [
  { key: 'all' as const, label: 'Tất cả', count: counts.value?.all ?? null },
  { key: 'pending' as const, label: 'Cần di chuyển', count: counts.value?.pending ?? null },
  { key: 'in_progress' as const, label: 'Đang sửa chữa', count: counts.value?.in_progress ?? null },
  { key: 'completed' as const, label: 'Hoàn thành', count: counts.value?.completed ?? null },
]);

// Quick action: start moving to customer's home
const handleEnRoute = async (job: ServiceOrderItem) => {
  actionLoading.value = job.id;
  try {
    await ordersApi.enRoute(job.id);
    toast.success('Đã cập nhật: bạn đang trên đường tới nhà khách hàng.');
    await cache.refresh(affectedBy.orderChange);
  } catch (err: unknown) {
    toast.error(userFacingError(err, 'Không thể cập nhật trạng thái di chuyển. Vui lòng thử lại.'));
  } finally {
    actionLoading.value = null;
  }
};

const handleVisitEnRoute = async (group: VisitGroupAssignedPageItem) => {
  const lead = visitLead(group);
  if (!lead?.orderId || String(lead.orderStatus).toUpperCase() !== 'ACCEPTED' || actionLoading.value) return;
  actionLoading.value = lead.orderId;
  try {
    await ordersApi.enRoute(lead.orderId);
    toast.success('Đã cập nhật: bạn đang trên đường tới nhà khách hàng.');
    await cache.refresh(affectedBy.orderChange);
  } catch (err: unknown) {
    toast.error(userFacingError(err, 'Không thể cập nhật trạng thái di chuyển. Vui lòng thử lại.'));
  } finally {
    actionLoading.value = null;
  }
};

const visitLead = (group: VisitGroupAssignedPageItem) => [...group.items].sort((a, b) => a.sequence - b.sequence)[0];

function visitItemStatus(item: VisitGroupPageDevice) {
  if (item.outcome === 'failed') return 'Không sửa được';
  if (item.outcome === 'quote_declined') return 'Không đồng ý báo giá';
  if (item.outcome === 'succeeded' || item.orderStatus?.toLowerCase() === 'completed') return 'Hoàn thành';
  if (item.orderStatus?.toLowerCase() === 'cancelled' || item.bookingStatus.toLowerCase() === 'cancelled') return 'Đã hủy';
  if (item.orderStatus?.toLowerCase() === 'under_repair') return 'Đang sửa chữa';
  if (isArrivedWaiting(item)) return VISIT_DEVICE_ARRIVED_LABEL;
  if (item.orderStatus?.toLowerCase() === 'en_route') return 'Đang di chuyển';
  if (item.orderStatus?.toLowerCase() === 'accepted') return 'Đã nhận đơn';
  if (item.bookingStatus.toLowerCase() === 'closed') return 'Chưa tìm được thợ';
  return 'Đang tìm thợ';
}

function visitGroupStatus(group: VisitGroupAssignedPageItem) {
  if (isVisitArrived(group)) return VISIT_GROUP_ARRIVED_LABEL;
  const labels = {
    submitted: 'Đang chờ xử lý', matching: 'Đang tìm thợ', no_technician: 'Chưa có thợ phù hợp',
    accepted: 'Đã nhận lịch', en_route: 'Đang di chuyển', under_repair: 'Đang sửa chữa',
    completed: 'Hoàn thành', cancelled: 'Đã hủy', failed: 'Có thiết bị chưa sửa',
    quote_declined: 'Có báo giá chưa được nhận', mixed: 'Kết quả nhiều trạng thái',
  } satisfies Record<VisitGroupAssignedPageItem['status'], string>;
  return labels[group.status];
}

const handleChatWithCustomer = async (job: ServiceOrderItem) => {
  const bookingId = job.bookingId || job.id;
  await chatStore.openConversationForBooking(bookingId);
  chatStore.toggleWidget(true);
};

const getGoogleMapsUrl = (job: ServiceOrderItem) => {
  if (job.destination?.lat != null && job.destination?.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${job.destination.lat},${job.destination.lng}`;
  }
  if (job.addressSummary) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.addressSummary)}`;
  }
  return null;
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
const secondaryAction = `h-9 px-3 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 active:scale-[0.98] text-[13px] font-medium text-ink-700 inline-flex items-center gap-1.5 whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ${focusRing}`;
// ── Sliding Active Background Pill ──
const jobTabListRef = ref<HTMLElement | null>(null);
const jobTabRefs = ref<Record<string, HTMLElement | null>>({});
const jobIndicatorStyle = ref<Record<string, string>>({
  opacity: '0',
});

function updateJobIndicator() {
  const activeEl = jobTabRefs.value[activeTab.value];
  const container = jobTabListRef.value;
  if (!activeEl || !container) {
    jobIndicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = activeEl.offsetLeft;
  const top = activeEl.offsetTop;
  const width = activeEl.offsetWidth;
  const height = activeEl.offsetHeight;

  jobIndicatorStyle.value = {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: '1',
  };
}

let jobTabResizeObserver: ResizeObserver | null = null;

watch(activeTab, () => {
  void nextTick(updateJobIndicator);
});
watch(listView, () => {
  void nextTick(updateJobIndicator);
});

watch(
  counts,
  () => {
    void nextTick(updateJobIndicator);
  },
  { deep: true },
);

onMounted(() => {
  void nextTick(() => {
    updateJobIndicator();
    setTimeout(updateJobIndicator, 60);
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateJobIndicator);
    if (jobTabListRef.value && typeof ResizeObserver !== 'undefined') {
      jobTabResizeObserver = new ResizeObserver(() => {
        updateJobIndicator();
      });
      jobTabResizeObserver.observe(jobTabListRef.value);
    }
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateJobIndicator);
  }
  jobTabResizeObserver?.disconnect();
});
</script>

<template>
  <div class="w-full mx-auto space-y-4 sm:space-y-5">
    <div class="animate-slide-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Công việc</h1>
      <div
        class="inline-flex max-w-full items-center gap-1 overflow-x-auto scrollbar-none rounded-xl border border-ink-200/80 bg-ink-100/80 p-1"
        role="group"
        aria-label="Chọn loại danh sách công việc"
      >
        <button
          v-for="choice in [
            { key: 'jobs' as const, label: 'Công việc đơn', shortLabel: 'Đơn lẻ' },
            { key: 'visits' as const, label: 'Lượt sửa nhiều thiết bị', shortLabel: 'Nhiều máy' },
            { key: 'history' as const, label: 'Lịch sử · Đã rút, hủy', shortLabel: 'Lịch sử' },
          ]"
          :key="choice.key"
          type="button"
          :aria-pressed="listView === choice.key"
          :aria-label="choice.label"
          :data-testid="`jobs-list-switch-${choice.key}`"
          class="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer flex-1 sm:flex-initial"
          :class="listView === choice.key ? 'bg-white text-brand-700 shadow-2xs' : 'text-ink-600 hover:text-ink-900'"
          @click="listView = choice.key"
        >
          <span class="sm:hidden">{{ choice.shortLabel }}</span>
          <span class="hidden sm:inline">{{ choice.label }}</span>
          <span
            v-if="choice.key === 'visits' && !loadingVisitGroups && visitGroupsTotal > 0"
            class="rounded-full px-1.5 py-0.5 font-num text-[11px] leading-none"
            :class="listView === 'visits' ? 'bg-brand-50 text-brand-700' : 'bg-white/80 text-ink-600'"
          >
            {{ visitGroupsTotal }}
          </span>
        </button>
      </div>
    </div>

    <section v-if="listView === 'history'" class="animate-slide-up space-y-3" aria-label="Lịch sử đã rời công việc" data-testid="technician-withdrawn-history">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold text-ink-900">Đã rút, hủy</h2>
        <p class="text-xs text-ink-500">Tóm tắt đơn không còn phụ trách</p>
      </div>
      <div v-if="historyLoading" class="space-y-2.5" aria-busy="true">
        <div v-for="i in 3" :key="i" class="rounded-2xl border border-ink-200 bg-white p-4">
          <FhSkeleton width="55%" height="18px" />
        </div>
      </div>
      <div v-else-if="historyError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        <span>{{ userFacingError(historyError, 'Chưa tải được lịch sử công việc.') }}</span>
        <FhButton variant="secondary" size="sm" @click="retryHistory">Thử lại</FhButton>
      </div>
      <p v-else-if="!history.length" class="rounded-2xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500">Chưa có công việc đã rời.</p>
      <ul v-else class="space-y-2.5">
        <li
          v-for="(entry, idx) in history"
          :key="entry.id"
          class="animate-slide-up flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200/80 bg-white px-4 py-3.5 shadow-2xs"
          :style="{ animationDelay: `${Math.min(idx, 6) * 30}ms` }"
          data-testid="technician-withdrawn-order"
        >
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="font-num text-sm font-semibold text-ink-800">#{{ entry.code }}</span>
            <FhStatusPill :status="historicalPill(entry).status" :label="historicalPill(entry).label" />
          </div>
          <span class="font-num text-xs text-ink-500">{{ vnDateString(entry.createdAt) }}</span>
        </li>
      </ul>
      <FhPagination v-model:page="historyPage" :page-size="PAGE_SIZE" :total="historyTotal" :disabled="historyLoading" @prefetch="prefetchHistory" />
    </section>

    <template v-else-if="listView === 'visits'">
      <div v-if="loadingVisitGroups" class="space-y-3" aria-busy="true" aria-label="Đang tải lượt sửa nhiều thiết bị">
        <div v-for="i in 2" :key="i" class="space-y-3 rounded-2xl border border-ink-200 bg-white p-5">
          <FhSkeleton width="45%" height="18px" />
          <FhSkeleton width="70%" height="14px" />
          <div class="grid gap-2 sm:grid-cols-2">
            <FhSkeleton width="100%" height="52px" rounded="md" />
            <FhSkeleton width="100%" height="52px" rounded="md" />
          </div>
        </div>
      </div>
      <div v-else-if="visitGroupsError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        <span>{{ userFacingError(visitGroupsError, 'Không thể tải lượt sửa nhiều thiết bị. Vui lòng thử lại.') }}</span>
        <FhButton variant="secondary" size="sm" class="h-10" :disabled="loadingVisitGroups" @click="retryVisitGroups">Thử lại</FhButton>
      </div>
      <div v-else-if="visitGroupsTotal === 0" data-testid="technician-visit-groups-empty" class="animate-slide-up space-y-3 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center shadow-2xs">
        <div class="mx-auto mb-2 max-w-[140px] flex items-center justify-center">
          <img
            :src="'/images/home-appliance-repair.png'"
            alt=""
            class="w-full h-auto max-h-32 object-contain drop-shadow-sm select-none pointer-events-none"
            loading="lazy"
          />
        </div>
        <h2 class="font-semibold text-ink-900">Chưa có lượt sửa nhiều thiết bị được phân công</h2>
        <p class="text-sm text-ink-500">Các lượt được giao trọn vẹn cho bạn sẽ hiện ở đây.</p>
      </div>
      <template v-else>
        <ul class="space-y-3 transition-opacity" :class="{ 'opacity-60': changingVisitGroupsPage }" :aria-busy="changingVisitGroupsPage">
          <li
            v-for="(group, idx) in visitGroups"
            :key="group.id"
            :data-testid="`technician-visit-group-${group.id}`"
            class="animate-slide-up space-y-3.5 rounded-2xl border border-ink-200/90 bg-white p-4 sm:p-5 shadow-2xs transition-[border-color,box-shadow] duration-200 hover:border-brand-300/80 hover:shadow-sm"
            :style="{ animationDelay: `${Math.min(idx, 6) * 35}ms` }"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
                    :aria-label="`Trạng thái lượt sửa: ${visitGroupStatus(group)}`"
                  >
                    {{ visitGroupStatus(group) }}
                  </span>
                  <span class="text-xs font-num text-ink-500">
                    Lịch hẹn <span class="font-medium text-ink-700">{{ group.scheduledAt ? vnDateTimeString(group.scheduledAt) : 'Chưa xác định' }}</span>
                  </span>
                </div>
                <h2 class="text-base font-semibold text-ink-900">Lượt sửa · {{ group.items.length }} thiết bị</h2>
                <p v-if="group.assignedAddressSummary?.trim()" class="break-words text-sm text-ink-600" data-testid="technician-visit-address">
                  <span class="text-ink-400">Địa chỉ:</span> {{ group.assignedAddressSummary }}
                </p>
              </div>
            </div>

            <ul class="grid gap-2 sm:grid-cols-2" aria-label="Thiết bị trong lượt sửa">
              <li
                v-for="item in group.items"
                :key="item.itemId"
                :data-testid="`technician-visit-device-${group.id}-${item.sequence}`"
                class="min-w-0 rounded-xl border border-ink-200/60 bg-ink-50/75 px-3 py-2 text-sm"
              >
                <span class="block break-words font-medium text-ink-900">{{ item.deviceLabel || `Thiết bị ${item.sequence}` }}</span>
                <span class="mt-0.5 block break-words text-xs text-ink-500">{{ item.serviceName || 'Dịch vụ sửa chữa' }} · {{ visitItemStatus(item) }}</span>
              </li>
            </ul>

            <div class="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
              <FhButton
                v-if="visitLead(group)?.orderId && String(visitLead(group)?.orderStatus).toUpperCase() === 'ACCEPTED'"
                variant="primary"
                size="sm"
                class="min-h-11"
                :loading="actionLoading === visitLead(group)?.orderId"
                @click.stop="handleVisitEnRoute(group)"
              >
                <Navigation :size="15" /> Bắt đầu di chuyển
              </FhButton>
              <router-link
                v-if="visitLead(group)?.orderId"
                :to="`/tech/jobs/${visitLead(group)!.orderId}`"
                :data-testid="`technician-visit-open-${group.id}`"
                class="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Mở công việc <ChevronRight :size="16" aria-hidden="true" />
              </router-link>
            </div>
          </li>
        </ul>
        <FhPagination v-model:page="visitGroupsPage" :page-size="PAGE_SIZE" :total="visitGroupsTotal" :disabled="loadingVisitGroups" @prefetch="prefetchVisitGroups" />
      </template>
    </template>

    <template v-else>
      <!-- Filter tabs with sliding active pill -->
      <div
        ref="jobTabListRef"
        class="relative flex items-center gap-1 overflow-x-auto rounded-full border border-ink-200/60 bg-ink-100/80 p-1 select-none scrollbar-none text-sm font-semibold"
        role="tablist"
        aria-label="Lọc công việc"
      >
        <div
          class="pointer-events-none absolute top-0 left-0 rounded-full bg-white shadow-xs transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          :style="jobIndicatorStyle"
          aria-hidden="true"
        />

        <button
          v-for="tab in tabs"
          :key="tab.key"
          :ref="(el) => { jobTabRefs[tab.key] = el as HTMLElement }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="relative z-10 flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors cursor-pointer"
          :class="[
            focusRing,
            activeTab === tab.key ? 'font-bold text-ink-900' : 'font-medium text-ink-600 hover:text-ink-900',
          ]"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.label }}</span>{{ ' ' }}
          <span
            v-if="tab.count != null && (tab.key === 'all' || tab.count > 0)"
            class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-num text-xs transition-colors"
            :class="activeTab === tab.key ? 'bg-brand-50 text-brand-700' : 'bg-white/80 text-ink-600'"
            :data-testid="`jobs-tab-count-${tab.key}`"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Loading: card skeletons -->
      <div v-if="loading" class="space-y-3" aria-busy="true" aria-label="Đang tải công việc">
        <div v-for="i in 3" :key="i" class="space-y-3 rounded-2xl border border-ink-200 bg-white p-4 sm:p-5">
          <div class="flex items-center justify-between gap-4">
            <FhSkeleton width="42%" height="18px" />
            <FhSkeleton width="22%" height="22px" />
          </div>
          <FhSkeleton width="62%" height="20px" />
          <FhSkeleton width="100%" height="52px" rounded="md" />
        </div>
      </div>

      <div
        v-else-if="error"
        role="alert"
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700"
      >
        <span>{{ loadError() }}</span>
        <FhButton variant="secondary" size="sm" class="h-10" @click="loadJobs">Thử lại</FhButton>
      </div>

      <div
        v-else-if="jobs.length === 0"
        class="animate-slide-up space-y-3 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center shadow-2xs"
      >
        <div class="mx-auto mb-2 max-w-[140px] flex items-center justify-center">
          <img
            :src="'/images/ui/role-choice-technician.png'"
            alt=""
            class="w-full h-auto max-h-32 object-contain drop-shadow-sm select-none pointer-events-none"
            loading="lazy"
          />
        </div>
        <h3 class="text-base font-semibold text-ink-900">
          {{ activeTab === 'all' ? 'Chưa có công việc nào' : 'Không có công việc ở mục này' }}
        </h3>
        <p v-if="activeTab === 'all'" class="text-sm text-ink-500">Đơn sửa chữa bạn nhận sẽ hiện ở đây.</p>
      </div>

      <template v-else>
        <ul
          class="space-y-3 transition-opacity"
          :class="{ 'opacity-60': changingPage }"
          :aria-busy="changingPage"
        >
          <template v-for="(row, idx) in rows" :key="row.id">
            <!-- Old / withdrawn orders: compact muted summary -->
            <li
              v-if="row.old"
              class="animate-slide-up rounded-2xl border border-ink-200/80 bg-white shadow-2xs transition-colors hover:border-ink-300"
              :style="{ animationDelay: `${Math.min(idx, 6) * 35}ms` }"
              data-testid="technician-historical-order"
            >
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left sm:px-5"
                :class="focusRing"
                @click="router.push(`/tech/jobs/${row.old.id}`)"
              >
                <span class="min-w-0 flex-1 space-y-1">
                  <span class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                    <span class="font-num font-semibold text-ink-700 whitespace-nowrap">#{{ row.old.code }}</span>
                    <FhStatusPill :status="historicalPill(row.old).status" :label="historicalPill(row.old).label" />
                    <span class="font-num text-xs text-ink-500 whitespace-nowrap">{{ vnDateString(row.old.createdAt) }}</span>
                  </span>
                  <span class="block text-sm text-ink-500">{{ isReleasedJob(row.old) ? 'Bạn không còn phụ trách đơn này, chỉ xem tóm tắt.' : 'Đơn cũ, chỉ xem tóm tắt.' }}</span>
                </span>
                <ChevronRight :size="18" class="shrink-0 text-ink-400" aria-hidden="true" />
              </button>
            </li>

            <!-- Active & completed job card: scannable 3-zone hierarchy -->
            <li
              v-else-if="row.job"
              class="animate-slide-up group cursor-pointer rounded-2xl border border-ink-200/90 bg-white p-4 shadow-2xs transition-[border-color,box-shadow,background-color] duration-200 hover:border-brand-300 hover:shadow-sm sm:p-5"
              :style="{ animationDelay: `${Math.min(idx, 6) * 35}ms` }"
              :data-testid="`technician-job-${row.job.id}`"
              @click="router.push(`/tech/jobs/${row.job.id}`)"
            >
              <!-- Zone 1: Status + Schedule + Focal Total -->
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <FhStatusPill :status="row.job.status" />
                  <span class="font-num text-xs font-medium text-ink-500 whitespace-nowrap">#{{ row.job.code }}</span>
                  <span class="text-ink-300" aria-hidden="true">·</span>
                  <span class="text-xs text-ink-600 whitespace-nowrap">
                    <span class="text-ink-400">Ngày hẹn</span>
                    {{ vnDateString(row.job.scheduledAt) }}
                  </span>
                </div>

                <div class="text-left sm:text-right shrink-0">
                  <div class="font-num text-base font-bold text-ink-900 sm:text-[17px] whitespace-nowrap">
                    <FhMoney :amount="row.job.grandTotal" />
                  </div>
                  <div class="font-num text-[11px] text-ink-500 whitespace-nowrap">
                    Công <FhMoney :amount="row.job.laborTotal" /> · Vật tư <FhMoney :amount="row.job.partsTotal" />
                  </div>
                </div>
              </div>

              <!-- Zone 2: Service + Customer & Address inset -->
              <div class="mt-2.5 space-y-2">
                <h3 class="text-base font-semibold text-ink-900 transition-colors group-hover:text-brand-700 sm:text-[17px] text-balance leading-snug">
                  {{ row.job.serviceName }}
                </h3>
                <div class="space-y-1 rounded-xl bg-ink-50/75 px-3 py-2 text-sm">
                  <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-900">
                    <span class="font-medium">{{ row.job.customerName }}</span>
                    <span v-if="row.job.customerPhone" class="font-num text-xs text-ink-500 whitespace-nowrap">{{ row.job.customerPhone }}</span>
                  </p>
                  <p class="text-xs sm:text-sm text-ink-600 text-pretty">
                    <span class="text-ink-400">Địa chỉ:</span>
                    {{ row.job.addressSummary }}
                  </p>
                </div>
              </div>

              <!-- Zone 3: Quick field actions + subtle detail cue -->
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
                <div class="flex flex-wrap items-center gap-2">
                  <FhButton
                    v-if="String(row.job.status).toUpperCase() === 'ACCEPTED'"
                    variant="primary"
                    size="sm"
                    class="h-9"
                    :loading="actionLoading === row.job.id"
                    @click.stop="handleEnRoute(row.job)"
                  >
                    <Navigation :size="15" />
                    Bắt đầu di chuyển
                  </FhButton>
                  <a
                    v-if="getGoogleMapsUrl(row.job)"
                    :href="getGoogleMapsUrl(row.job)!"
                    target="_blank"
                    rel="noopener noreferrer"
                    :class="secondaryAction"
                    @click.stop
                  >
                    <Navigation :size="14" class="text-ink-500" />
                    Chỉ đường
                  </a>
                  <button
                    type="button"
                    :class="secondaryAction"
                    @click.stop="handleChatWithCustomer(row.job)"
                  >
                    <MessageSquare :size="14" class="text-ink-500" />
                    Nhắn tin
                  </button>
                  <a
                    v-if="row.job.customerPhone"
                    :href="`tel:${row.job.customerPhone}`"
                    :class="secondaryAction"
                    @click.stop
                  >
                    <Phone :size="14" class="text-ink-500" />
                    Gọi điện
                  </a>
                </div>

                <router-link
                  :to="`/tech/jobs/${row.job.id}`"
                  class="hidden sm:inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-400 transition-colors group-hover:text-brand-600"
                  :class="focusRing"
                  aria-label="Mở chi tiết công việc"
                  @click.stop
                >
                  <span>Chi tiết</span>
                  <ChevronRight :size="16" aria-hidden="true" />
                </router-link>
              </div>
            </li>
          </template>
        </ul>

        <FhPagination
          v-model:page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          :disabled="loading"
          @prefetch="prefetch"
        />
      </template>
    </template>
  </div>
</template>
