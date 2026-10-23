<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  MapPin,
  Calendar,
  ChevronRight,
  Navigation,
  MessageSquare,
  Phone,
  Briefcase,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhPagination,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import { ordersApi, historicalPill, isHistoricalOrder, isReleasedJob, type ServiceOrderItem, type TechnicianOrderItem } from '../../api/orders.api';
import { visitGroupsApi, type VisitGroupPageDevice, type VisitGroupPageItem } from '../../api/visit-groups.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { useQueryChoice, useQueryPage } from '../../composables/useQueryState';
import { useChatStore } from '../../stores/chat.store';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

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
const listView = useQueryChoice<'jobs' | 'visits'>('list', ['jobs', 'visits'], 'jobs');
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
const visitGroupsList = usePagedList<VisitGroupPageItem>({
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

const handleVisitEnRoute = async (group: VisitGroupPageItem) => {
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

const visitLead = (group: VisitGroupPageItem) => [...group.items].sort((a, b) => a.sequence - b.sequence)[0];

function visitItemStatus(item: VisitGroupPageDevice) {
  if (item.outcome === 'failed') return 'Không sửa được';
  if (item.outcome === 'quote_declined') return 'Không đồng ý báo giá';
  if (item.outcome === 'succeeded' || item.orderStatus?.toLowerCase() === 'completed') return 'Hoàn thành';
  if (item.orderStatus?.toLowerCase() === 'cancelled' || item.bookingStatus.toLowerCase() === 'cancelled') return 'Đã hủy';
  if (item.orderStatus?.toLowerCase() === 'under_repair') return 'Đang sửa chữa';
  if (item.orderStatus?.toLowerCase() === 'en_route') return 'Đang di chuyển';
  if (item.orderStatus?.toLowerCase() === 'accepted') return 'Đã nhận đơn';
  if (item.bookingStatus.toLowerCase() === 'closed') return 'Chưa tìm được thợ';
  return 'Đang tìm thợ';
}

function visitGroupStatus(status: VisitGroupPageItem['status']) {
  const labels = {
    submitted: 'Đang chờ xử lý', matching: 'Đang tìm thợ', no_technician: 'Chưa có thợ phù hợp',
    accepted: 'Đã nhận lịch', en_route: 'Đang di chuyển', under_repair: 'Đang sửa chữa',
    completed: 'Hoàn thành', cancelled: 'Đã hủy', failed: 'Có thiết bị chưa sửa',
    quote_declined: 'Có báo giá chưa được nhận', mixed: 'Kết quả nhiều trạng thái',
  } satisfies Record<VisitGroupPageItem['status'], string>;
  return labels[status];
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
const secondaryAction = `h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors ${focusRing}`;
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
  <div class="max-w-4xl mx-auto space-y-5">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Công việc</h1>

    <div class="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Chọn loại danh sách công việc">
      <button
        v-for="choice in [{ key: 'jobs' as const, label: 'Công việc đơn', shortLabel: 'Công việc' }, { key: 'visits' as const, label: 'Lượt sửa nhiều thiết bị', shortLabel: 'Nhiều thiết bị' }]"
        :key="choice.key"
        type="button"
        :aria-pressed="listView === choice.key"
        :aria-label="choice.label"
        :data-testid="`jobs-list-switch-${choice.key}`"
        class="h-11 min-w-[10rem] flex-1 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="listView === choice.key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'"
        @click="listView = choice.key"
      >
        <span class="sm:hidden">{{ choice.shortLabel }}</span><span class="hidden sm:inline">{{ choice.label }}</span>
        <span v-if="choice.key === 'visits' && !loadingVisitGroups" class="ml-1 rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs">{{ visitGroupsTotal }}</span>
      </button>
    </div>

    <template v-if="listView === 'visits'">
      <div v-if="loadingVisitGroups" class="space-y-3 rounded-2xl border border-ink-200 bg-white p-5" aria-busy="true" aria-label="Đang tải lượt sửa nhiều thiết bị">
        <FhSkeleton width="45%" height="18px" />
        <FhSkeleton width="70%" height="14px" />
        <FhSkeleton width="55%" height="14px" />
      </div>
      <div v-else-if="visitGroupsError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        <span>{{ userFacingError(visitGroupsError, 'Không thể tải lượt sửa nhiều thiết bị. Vui lòng thử lại.') }}</span>
        <FhButton variant="secondary" size="sm" class="h-10" :disabled="loadingVisitGroups" @click="retryVisitGroups">Thử lại</FhButton>
      </div>
      <div v-else-if="visitGroupsTotal === 0" data-testid="technician-visit-groups-empty" class="space-y-2 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400"><Briefcase :size="24" /></div>
        <h2 class="font-semibold text-ink-900">Chưa có lượt sửa nhiều thiết bị được phân công</h2>
        <p class="text-sm text-ink-500">Các lượt được giao trọn vẹn cho bạn sẽ hiện ở đây.</p>
      </div>
      <template v-else>
        <ul class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white transition-opacity" :class="{ 'opacity-60': changingVisitGroupsPage }" :aria-busy="changingVisitGroupsPage">
          <li v-for="group in visitGroups" :key="group.id" :data-testid="`technician-visit-group-${group.id}`" class="space-y-3 p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h2 class="font-semibold text-ink-900">Lượt sửa · {{ group.items.length }} thiết bị</h2>
                <p class="mt-1 text-sm text-ink-500">Lịch hẹn <span class="font-num">{{ group.scheduledAt ? vnDateTimeString(group.scheduledAt) : 'Chưa xác định' }}</span></p>
              </div>
              <span class="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700" :aria-label="`Trạng thái lượt sửa: ${visitGroupStatus(group.status)}`">{{ visitGroupStatus(group.status) }}</span>
            </div>
            <ul class="grid gap-2 sm:grid-cols-2" aria-label="Thiết bị trong lượt sửa">
              <li v-for="item in group.items" :key="item.itemId" :data-testid="`technician-visit-device-${group.id}-${item.sequence}`" class="min-w-0 rounded-xl bg-ink-50 px-3 py-2 text-sm">
                <span class="block truncate font-medium text-ink-900">{{ item.deviceLabel || `Thiết bị ${item.sequence}` }}</span>
                <span class="mt-1 block truncate text-xs text-ink-500">{{ item.serviceName || 'Dịch vụ sửa chữa' }} · {{ visitItemStatus(item) }}</span>
              </li>
            </ul>
            <div class="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
              <FhButton
                v-if="visitLead(group)?.orderId && String(visitLead(group)?.orderStatus).toUpperCase() === 'ACCEPTED'"
                variant="primary"
                size="sm"
                class="h-10"
                :loading="actionLoading === visitLead(group)?.orderId"
                @click.stop="handleVisitEnRoute(group)"
              >
                <Navigation :size="16" /> Bắt đầu di chuyển
              </FhButton>
              <router-link
                v-if="visitLead(group)?.orderId"
                :to="`/tech/jobs/${visitLead(group)!.orderId}`"
                :data-testid="`technician-visit-open-${group.id}`"
                class="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
      class="relative bg-ink-100 rounded-full p-1.5 flex items-center gap-1 overflow-x-auto select-none scrollbar-none text-sm font-semibold"
      role="tablist"
      aria-label="Lọc công việc"
    >
      <!-- Sliding active background pill -->
      <div
        class="pointer-events-none absolute top-0 left-0 rounded-full bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
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
        class="relative z-10 h-10 px-4 rounded-full transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
        :class="[
          focusRing,
          activeTab === tab.key ? 'font-bold text-ink-900' : 'font-medium text-ink-600 hover:text-ink-900',
        ]"
        @click="activeTab = tab.key"
      >
        <span>{{ tab.label }}</span>{{ ' ' }}
        <span
          v-if="tab.count != null && (tab.key === 'all' || tab.count > 0)"
          class="min-w-5 h-5 px-1.5 rounded-full text-xs font-num inline-flex items-center justify-center transition-colors"
          :class="activeTab === tab.key ? 'bg-ink-100 text-ink-900' : 'bg-white/80 text-ink-600'"
          :data-testid="`jobs-tab-count-${tab.key}`"
        >
          {{ tab.count }}
        </span>
      </button>
    </div>

    <!-- Loading: rows shaped like the list -->
    <div v-if="loading" class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải công việc">
      <div v-for="i in 3" :key="i" class="p-5 sm:p-6 space-y-3">
        <FhSkeleton width="35%" height="16px" />
        <FhSkeleton width="65%" height="22px" />
        <FhSkeleton width="85%" height="16px" />
        <FhSkeleton width="50%" height="40px" rounded="md" />
      </div>
    </div>

    <div
      v-else-if="error"
      role="alert"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3"
    >
      <span>{{ loadError() }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="loadJobs">Thử lại</FhButton>
    </div>

    <div
      v-else-if="jobs.length === 0"
      class="text-center py-14 px-6 bg-white rounded-2xl border border-ink-200 space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 mx-auto flex items-center justify-center">
        <Briefcase :size="24" />
      </div>
      <h3 class="text-base font-semibold text-ink-900">
        {{ activeTab === 'all' ? 'Chưa có công việc nào' : 'Không có công việc ở mục này' }}
      </h3>
      <p v-if="activeTab === 'all'" class="text-sm text-ink-500">Đơn bạn nhận sẽ hiện ở đây.</p>
    </div>

    <!-- One surface, one row per job -->
    <template v-else>
    <ul
      class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100 overflow-hidden transition-opacity"
      :class="{ 'opacity-60': changingPage }"
      :aria-busy="changingPage"
    >
      <template v-for="row in rows" :key="row.id">
      <!-- Old orders: a short summary only, no customer details -->
      <li
        v-if="row.old"
        data-testid="technician-historical-order"
      >
        <button
          type="button"
          class="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
          :class="focusRing"
          @click="router.push(`/tech/jobs/${row.old.id}`)"
        >
          <span class="flex-1 min-w-0 space-y-1">
            <span class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span class="font-num text-ink-700 whitespace-nowrap">#{{ row.old.code }}</span>
              <FhStatusPill :status="historicalPill(row.old).status" :label="historicalPill(row.old).label" />
              <span class="text-ink-500 whitespace-nowrap">{{ vnDateString(row.old.createdAt) }}</span>
            </span>
            <span class="block text-sm text-ink-500">{{ isReleasedJob(row.old) ? 'Bạn không còn phụ trách đơn này, chỉ xem tóm tắt.' : 'Đơn cũ, chỉ xem tóm tắt.' }}</span>
          </span>
          <ChevronRight :size="18" class="text-ink-400 shrink-0" aria-hidden="true" />
        </button>
      </li>
      <li
        v-else-if="row.job"
        class="p-5 sm:p-6 flex gap-3 hover:bg-ink-25 transition-colors cursor-pointer"
        :data-testid="`technician-job-${row.job.id}`"
        @click="router.push(`/tech/jobs/${row.job.id}`)"
      >
        <div class="flex-1 min-w-0 space-y-3">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span class="font-num text-ink-500 whitespace-nowrap">#{{ row.job.code }}</span>
              <FhStatusPill :status="row.job.status" />
              <span class="inline-flex items-center gap-1 text-ink-600 whitespace-nowrap">
                <Calendar :size="14" class="text-ink-400" />
                {{ vnDateString(row.job.scheduledAt) }}
              </span>
            </div>
            <h3 class="font-semibold text-base sm:text-lg text-ink-900 text-balance">{{ row.job.serviceName }}</h3>
            <p class="text-sm text-ink-900">
              {{ row.job.customerName }}
              <span v-if="row.job.customerPhone" class="ml-1 font-num text-ink-500 whitespace-nowrap">{{ row.job.customerPhone }}</span>
            </p>
            <p class="text-sm text-ink-600 flex items-start gap-1.5">
              <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
              <span class="text-pretty">{{ row.job.addressSummary }}</span>
            </p>
          </div>

          <dl class="grid grid-cols-3 gap-3 max-w-md text-sm">
            <div class="min-w-0">
              <dt class="text-ink-500 whitespace-nowrap">Tiền công</dt>
              <dd class="font-num text-ink-900 whitespace-nowrap"><FhMoney :amount="row.job.laborTotal" /></dd>
            </div>
            <div class="min-w-0">
              <dt class="text-ink-500 whitespace-nowrap">Vật tư</dt>
              <dd class="font-num text-ink-900 whitespace-nowrap"><FhMoney :amount="row.job.partsTotal" /></dd>
            </div>
            <div class="min-w-0">
              <dt class="text-ink-500 whitespace-nowrap">Dự kiến thu</dt>
              <dd class="font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="row.job.grandTotal" /></dd>
            </div>
          </dl>

          <div class="flex flex-wrap items-center gap-2">
            <FhButton
              v-if="String(row.job.status).toUpperCase() === 'ACCEPTED'"
              variant="primary"
              size="sm"
              class="h-10"
              :loading="actionLoading === row.job.id"
              @click.stop="handleEnRoute(row.job)"
            >
              <Navigation :size="16" />
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
              <Navigation :size="16" class="text-ink-500" />
              Chỉ đường
            </a>
            <button
              type="button"
              :class="secondaryAction"
              @click.stop="handleChatWithCustomer(row.job)"
            >
              <MessageSquare :size="16" class="text-ink-500" />
              Nhắn tin
            </button>
            <a
              v-if="row.job.customerPhone"
              :href="`tel:${row.job.customerPhone}`"
              :class="secondaryAction"
              @click.stop
            >
              <Phone :size="16" class="text-ink-500" />
              Gọi điện
            </a>
          </div>
        </div>
        <router-link
          :to="`/tech/jobs/${row.job.id}`"
          class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:bg-ink-100 hover:text-ink-700 hidden sm:flex items-center justify-center shrink-0 self-center"
          :class="focusRing"
          aria-label="Mở chi tiết công việc"
          @click.stop
        >
          <ChevronRight :size="20" aria-hidden="true" />
        </router-link>
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
