<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Star } from 'lucide-vue-next';
import { FhStatusPill, FhButton, FhSkeleton, FhEmptyState, FhMoney } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { consoleTextarea } from '../../components/console/console-ui';
import { bookingStatusLabel } from '../../components/console/console-labels';
import { bookingsApi, type BookingItem, type TechnicianCandidate } from '../../api/bookings.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { useQueryChoice } from '../../composables/useQueryState';
import { vnDateTimeString } from '../../utils/vn-time';
import { hasRating, ratingLabel } from '../../utils/formatters';

// Two views as before: requests that can still get a technician (earliest
// appointment first) and requests whose appointment has passed. Both cover the
// states submitted, matching and closed; the server filters, sorts and pages.
type BoardTab = 'actionable' | 'expired';
const TAB_KEYS: readonly BoardTab[] = ['actionable', 'expired'];
const BOARD_STATES = ['submitted', 'matching', 'closed'];
const PAGE_SIZE = 20;
const activeTab = useQueryChoice<BoardTab>('tab', TAB_KEYS, 'actionable');

const columns: ConsoleColumn[] = [
  { key: 'service', label: 'Dịch vụ' },
  { key: 'time', label: 'Giờ hẹn' },
  { key: 'status', label: 'Trạng thái', hideBelow: 'xl' },
  { key: 'actions', label: '', align: 'right' },
];

const boardFilter = (tab: BoardTab) => ({
  statuses: BOARD_STATES,
  overdue: tab === 'expired',
  sort: 'appointment' as const,
});

const {
  page,
  items: bookings,
  total,
  loading,
  error: loadError,
  load,
  changingPage,
  prefetch,
} = usePagedList<BookingItem>({
  key: () => queryKeys.bookings.board({ tab: activeTab.value }),
  pageSize: PAGE_SIZE,
  fetch: (p, size) => bookingsApi.getStaffBookingsPage(p, size, boardFilter(activeTab.value)),
});

// How many wait in each view: one row per view is enough to read the total.
async function fetchCounts(): Promise<Partial<Record<BoardTab, number>>> {
  const results = await Promise.all(
    TAB_KEYS.map((key) => bookingsApi.getStaffBookingsPage(1, 1, boardFilter(key)).then((r) => r.total).catch(() => null)),
  );
  const next: Partial<Record<BoardTab, number>> = {};
  TAB_KEYS.forEach((key, index) => {
    const value = results[index];
    if (value !== null) next[key] = value;
  });
  return next;
}
const { data: counts, refetch: refetchCounts } = useCachedQuery({
  key: queryKeys.bookings.boardCounts,
  fetch: fetchCounts,
});
const cache = useCacheUpdates();

function loadBookings() {
  void load();
  void refetchCounts();
}

watch(total, (value) => {
  if (!loading.value && !loadError.value) counts.value = { ...counts.value, [activeTab.value]: value };
});

function isExpired(booking: BookingItem): boolean {
  const end = booking.preferredEndAt || booking.preferredAt;
  return !!end && new Date(end).getTime() <= Date.now();
}

const tabs = computed(() => [
  { key: 'actionable' as const, label: 'Cần gán thợ', count: counts.value?.actionable ?? null },
  { key: 'expired' as const, label: 'Đã quá hạn', count: counts.value?.expired ?? null },
]);

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const hours = Math.round(abs / 3600000);
  const label = hours < 1 ? '<1 giờ' : hours < 48 ? `${hours} giờ` : `${Math.round(hours / 24)} ngày`;
  return diffMs >= 0 ? `còn ${label}` : `quá hạn ${label}`;
}

// Assign modal
const showAssignModal = ref(false);
const assignBooking = ref<BookingItem | null>(null);
const candidates = ref<TechnicianCandidate[]>([]);
const candidatesLoading = ref(false);
const candidatesError = ref('');
const assignReason = ref('');
const assigningId = ref('');

async function openAssign(booking: BookingItem) {
  assignBooking.value = booking;
  assignReason.value = '';
  candidates.value = [];
  candidatesError.value = '';
  showAssignModal.value = true;

  if (isExpired(booking)) {
    candidatesError.value = `Giờ hẹn ${vnDateTimeString(booking.preferredEndAt || booking.preferredAt)} đã qua, không gán thợ được nữa. Liên hệ khách để đặt lịch mới.`;
    return;
  }

  candidatesLoading.value = true;
  try {
    candidates.value = await bookingsApi.getCandidates(booking.id);
  } catch {
    candidatesError.value = 'Chưa tải được danh sách thợ, vui lòng thử lại.';
  } finally {
    candidatesLoading.value = false;
  }
}

async function confirmAssign(candidate: TechnicianCandidate) {
  if (!assignBooking.value) return;
  if (!assignReason.value.trim()) {
    candidatesError.value = 'Vui lòng nhập lý do gán thợ thủ công.';
    return;
  }
  assigningId.value = candidate.id;
  try {
    // candidate.id is already normalized to the technician's User id by getCandidates()
    // (candidate.technicianId is the TechnicianProfile's own id — wrong id for this call).
    await bookingsApi.assignTechnicianToBooking(assignBooking.value.id, candidate.id, assignReason.value.trim());
    showAssignModal.value = false;
    // The booking leaves this tab once a technician has it.
    void cache.refresh(affectedBy.bookingChange);
  } catch {
    candidatesError.value = 'Không gán được thợ này. Thợ có thể đã hết điều kiện nhận việc, hãy chọn thợ khác.';
  } finally {
    assigningId.value = '';
  }
}

</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Gán thợ">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem @click="loadBookings">Làm mới danh sách</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <ConsoleTabs v-model="activeTab" :tabs="tabs" />

    <ConsoleLoadError v-if="loadError" @retry="loadBookings" />

    <template v-else-if="activeTab === 'actionable'">
      <ConsoleTable
        :columns="columns"
        :rows="bookings"
        :loading="loading"
        class="transition-opacity"
        :class="{ 'opacity-60': changingPage }"
        empty-text="Không có yêu cầu nào cần gán thợ."
      >
        <template #cell-service="{ row }">
          <div class="max-w-80 min-w-40">
            <div class="font-medium text-ink-900">{{ row.serviceName }}</div>
            <div class="truncate text-xs text-ink-500" :title="row.addressSummary">{{ row.addressSummary }}</div>
          </div>
        </template>
        <template #cell-time="{ row }">
          <div class="whitespace-nowrap font-num text-ink-900">{{ vnDateTimeString(row.preferredAt) }}</div>
          <div class="whitespace-nowrap text-xs text-ink-500">{{ relativeTime(row.preferredAt) }}</div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" :label="bookingStatusLabel(row.status)" />
        </template>
        <template #cell-actions="{ row }">
          <!-- The time may pass while the list is open: no button once it has. -->
          <span v-if="isExpired(row)" class="whitespace-nowrap text-sm text-ink-500">Chờ khách đặt lại</span>
          <FhButton v-else variant="primary" size="sm" @click="openAssign(row)">Gán thợ</FhButton>
        </template>
      </ConsoleTable>
      <ConsolePagination v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" @prefetch="prefetch" />
    </template>

    <template v-else>
      <ConsoleTable
        :columns="columns"
        :rows="bookings"
        :loading="loading"
        class="transition-opacity"
        :class="{ 'opacity-60': changingPage }"
        empty-text="Không có yêu cầu nào quá hạn."
      >
        <template #cell-service="{ row }">
          <div class="max-w-80 min-w-40">
            <div class="font-medium text-ink-700">{{ row.serviceName }}</div>
            <div class="truncate text-xs text-ink-500" :title="row.addressSummary">{{ row.addressSummary }}</div>
          </div>
        </template>
        <template #cell-time="{ row }">
          <div class="whitespace-nowrap font-num text-ink-500 line-through decoration-ink-300">{{ vnDateTimeString(row.preferredAt) }}</div>
          <div class="whitespace-nowrap text-xs text-danger-600">{{ relativeTime(row.preferredAt) }}</div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" :label="bookingStatusLabel(row.status)" />
        </template>
        <template #cell-actions>
          <span class="whitespace-nowrap text-sm text-ink-500">Chờ khách đặt lại</span>
        </template>
      </ConsoleTable>
      <ConsolePagination v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" @prefetch="prefetch" />
    </template>

    <!-- Assign dialog -->
    <div
      v-if="showAssignModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-title"
      @keydown.esc="showAssignModal = false"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
        <h3 id="assign-title" class="text-base font-semibold text-ink-900">Gán thợ: {{ assignBooking?.serviceName || assignBooking?.description }}</h3>

        <label class="block text-sm font-medium text-ink-700">
          Lý do gán thủ công
          <textarea
            v-model="assignReason"
            rows="2"
            placeholder="Bắt buộc"
            class="mt-1.5"
            :class="consoleTextarea"
          ></textarea>
        </label>

        <p v-if="candidatesError" class="text-sm text-danger-600" role="alert">{{ candidatesError }}</p>

        <div v-if="candidatesLoading" class="space-y-2">
          <FhSkeleton height="56px" :count="3" />
        </div>
        <FhEmptyState
          v-else-if="candidates.length === 0"
          title="Không có thợ phù hợp"
          description="Chưa có kỹ thuật viên phù hợp khu vực, kỹ năng và giờ hẹn."
        />
        <ul v-else class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200">
          <li
            v-for="c in candidates"
            :key="c.id"
            class="flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-ink-900">{{ c.fullName }}</div>
              <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                <span v-if="hasRating(c.averageRating, c.ratingCount)" class="inline-flex items-center gap-0.5 whitespace-nowrap"><Star :size="11" class="fill-amber-400 text-amber-400" /> {{ ratingLabel(c.averageRating, c.ratingCount) }} ({{ c.ratingCount }})</span>
                <span v-else class="whitespace-nowrap">Chưa có đánh giá</span>
                <span v-if="c.distanceKm != null" class="whitespace-nowrap">~{{ c.distanceKm.toFixed(1) }}&nbsp;km</span>
                <span v-if="c.listedLaborPrice" class="whitespace-nowrap"><FhMoney :amount="c.listedLaborPrice" /></span>
              </div>
            </div>
            <FhButton variant="primary" size="sm" :disabled="assigningId === c.id" @click="confirmAssign(c)">
              Chọn thợ này
            </FhButton>
          </li>
        </ul>

        <div class="flex justify-end pt-2">
          <FhButton variant="secondary" size="sm" @click="showAssignModal = false">Đóng</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
