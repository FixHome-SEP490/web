<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { UserPlus, Star, MapPin, Clock, AlertTriangle, RefreshCw } from 'lucide-vue-next';
import { FhStatusPill, FhButton, FhSkeleton, FhTable, type TableColumn, FhMoney } from '../../components';
import { bookingsApi, type BookingItem, type TechnicianCandidate } from '../../api/bookings.api';
import { vnDateTimeString } from '../../utils/vn-time';

const activeTab = ref<'actionable' | 'expired'>('actionable');

const columns: TableColumn[] = [
  { key: 'service', label: 'Dịch vụ & Địa chỉ' },
  { key: 'time', label: 'Thời gian hẹn', width: '250px' },
  { key: 'status', label: 'Trạng thái', width: '150px' },
  { key: 'actions', label: 'Thao tác', width: '120px', align: 'right' },
];

const loading = ref(true);
const loadError = ref('');
const bookings = ref<BookingItem[]>([]);

async function loadBookings() {
  loading.value = true;
  loadError.value = '';
  try {
    const [submitted, matching, closed] = await Promise.all([
      bookingsApi.getAllForStaff('SUBMITTED'),
      bookingsApi.getAllForStaff('MATCHING'),
      bookingsApi.getAllForStaff('CLOSED'),
    ]);
    // CLOSED includes both invitation-shortlist-exhausted (still assignable if the time
    // window hasn't passed) and backend auto-close on overdue — isExpired() below already
    // buckets by time regardless of status, so this just restores overdue visibility.
    bookings.value = [...submitted, ...matching, ...closed];
  } catch {
    loadError.value = 'Không thể tải danh sách booking chờ ghép thợ. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
}

function isExpired(booking: BookingItem): boolean {
  const end = booking.preferredEndAt || booking.preferredAt;
  return !!end && new Date(end).getTime() <= Date.now();
}

// Đơn còn kịp gán thì lên đầu (giờ hẹn sớm nhất trước — cần xử lý gấp nhất),
// đơn đã quá hạn (không gán được nữa, phải chờ khách đặt lại) dồn xuống cuối.
const actionableBookings = computed(() =>
  bookings.value
    .filter((b) => !isExpired(b))
    .sort((a, b) => new Date(a.preferredAt).getTime() - new Date(b.preferredAt).getTime()),
);
const expiredBookings = computed(() =>
  bookings.value
    .filter(isExpired)
    .sort((a, b) => new Date(b.preferredAt).getTime() - new Date(a.preferredAt).getTime()),
);

// Client-side pagination: the two lists above can grow large as the DB fills up,
// so render a bounded page of cards instead of dumping everything into one long scroll.
const PAGE_SIZE = 10;
const actionablePage = ref(1);
const expiredPage = ref(1);
function paginate<T>(list: T[], page: number) {
  return list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}
const actionableTotalPages = computed(() => Math.max(1, Math.ceil(actionableBookings.value.length / PAGE_SIZE)));
const expiredTotalPages = computed(() => Math.max(1, Math.ceil(expiredBookings.value.length / PAGE_SIZE)));
const actionablePageItems = computed(() => paginate(actionableBookings.value, actionablePage.value));
const expiredPageItems = computed(() => paginate(expiredBookings.value, expiredPage.value));
watch(actionableTotalPages, (tp) => { if (actionablePage.value > tp) actionablePage.value = tp; });
watch(expiredTotalPages, (tp) => { if (expiredPage.value > tp) expiredPage.value = tp; });

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
    candidatesError.value = `Khung giờ hẹn của booking này (${vnDateTimeString(booking.preferredEndAt || booking.preferredAt)}) đã qua nên không thợ nào còn đủ điều kiện. Không thể gán thợ cho khung giờ đã trôi qua — liên hệ khách để họ đặt lại lịch mới (rebook).`;
    return;
  }

  candidatesLoading.value = true;
  try {
    candidates.value = await bookingsApi.getCandidates(booking.id);
  } catch {
    candidatesError.value = 'Không tải được danh sách thợ phù hợp cho booking này.';
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
    bookings.value = bookings.value.filter((b) => b.id !== assignBooking.value?.id);
  } catch {
    candidatesError.value = 'Không thể gán thợ này. Có thể thợ đã hết điều kiện nhận việc, hãy thử lại hoặc chọn thợ khác.';
  } finally {
    assigningId.value = '';
  }
}

onMounted(loadBookings);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
          <UserPlus class="text-brand-600" :size="24" />
          <span>Gán thợ thủ công</span>
        </h1>
        <p class="text-xs sm:text-sm text-ink-500 mt-1">
          Booking chưa có thợ nhận việc (hết lượt mời tuần tự hoặc chưa gửi shortlist). SM/Admin có thể gán thợ trực tiếp.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton variant="secondary" size="sm" @click="loadBookings">
          <RefreshCw :size="14" class="mr-1.5" />
          Làm mới
        </FhButton>
      </div>
    </div>

    <!-- Tab Headers -->
    <div class="flex items-center border-b border-ink-200 gap-6 text-sm font-extrabold">
      <button
        type="button"
        class="pb-3 border-b-2 transition-all flex items-center gap-2"
        :class="[
          activeTab === 'actionable'
            ? 'border-brand-600 text-brand-600'
            : 'border-transparent text-ink-500 hover:text-ink-800'
        ]"
        @click="activeTab = 'actionable'"
      >
        <span>Cần gán thợ</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-num font-bold bg-ink-100 text-ink-700">
          {{ actionableBookings.length }}
        </span>
      </button>

      <button
        type="button"
        class="pb-3 border-b-2 transition-all flex items-center gap-2"
        :class="[
          activeTab === 'expired'
            ? 'border-brand-600 text-brand-600'
            : 'border-transparent text-ink-500 hover:text-ink-800'
        ]"
        @click="activeTab = 'expired'"
      >
        <span>Đã quá hạn</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-num font-bold bg-ink-100 text-ink-700">
          {{ expiredBookings.length }}
        </span>
      </button>
    </div>

    <div
      v-if="loadError"
      class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800 flex items-center gap-2 font-bold"
    >
      <AlertTriangle :size="16" /> {{ loadError }}
    </div>
    <!-- TAB 1: ACTIONABLE -->
    <div v-if="activeTab === 'actionable'" class="space-y-4">
      <FhTable
        :columns="columns"
        :rows="actionablePageItems"
        :loading="loading"
        empty-text="Mọi booking hiện đều đã được ghép thợ hoặc đang trong hàng đợi mời tuần tự."
      >
        <template #cell-service="{ row }">
          <div class="font-extrabold text-sm text-ink-900">{{ row.serviceName }}</div>
          <div class="text-[11px] text-ink-500 flex items-start gap-1 mt-1">
            <MapPin :size="12" class="shrink-0 mt-0.5 text-brand-500" />
            <span class="line-clamp-2">{{ row.addressSummary }}</span>
          </div>
        </template>
        <template #cell-time="{ row }">
          <div class="text-xs font-bold text-ink-900 flex items-center gap-1.5">
            <Clock :size="13" class="text-brand-600 shrink-0" />
            <span>{{ vnDateTimeString(row.preferredAt) }}</span>
          </div>
          <div class="text-[11px] text-brand-600 font-semibold mt-0.5 ml-5">
            {{ relativeTime(row.preferredAt) }}
          </div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" />
        </template>
        <template #cell-actions="{ row }">
          <FhButton variant="primary" size="sm" @click="openAssign(row)">
            <UserPlus :size="13" class="mr-1" /> Gán thợ
          </FhButton>
        </template>
      </FhTable>

      <div v-if="actionableTotalPages > 1" class="flex items-center justify-between text-xs text-ink-500 pt-1">
        <span>Trang {{ actionablePage }} / {{ actionableTotalPages }}</span>
        <div class="flex items-center gap-2">
          <FhButton variant="secondary" size="sm" :disabled="actionablePage <= 1" @click="actionablePage--">Trước</FhButton>
          <FhButton variant="secondary" size="sm" :disabled="actionablePage >= actionableTotalPages" @click="actionablePage++">Sau</FhButton>
        </div>
      </div>
    </div>

    <!-- TAB 2: EXPIRED -->
    <div v-if="activeTab === 'expired'" class="space-y-4 opacity-75 hover:opacity-100 transition-opacity">
      <FhTable
        :columns="columns"
        :rows="expiredPageItems"
        :loading="loading"
        empty-text="Không có booking nào quá hạn."
      >
        <template #cell-service="{ row }">
          <div class="font-extrabold text-sm text-ink-900">{{ row.serviceName }}</div>
          <div class="text-[11px] text-ink-500 flex items-start gap-1 mt-1">
            <MapPin :size="12" class="shrink-0 mt-0.5 text-ink-400" />
            <span class="line-clamp-2">{{ row.addressSummary }}</span>
          </div>
        </template>
        <template #cell-time="{ row }">
          <div class="text-xs font-bold text-ink-600 flex items-center gap-1.5 line-through decoration-ink-300">
            <Clock :size="13" class="shrink-0" />
            <span>{{ vnDateTimeString(row.preferredAt) }}</span>
          </div>
          <div class="text-[11px] text-rose-600 font-bold mt-0.5 flex items-center gap-1">
            <AlertTriangle :size="11" />
            {{ relativeTime(row.preferredAt) }}
          </div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" />
        </template>
        <template #cell-actions>
          <span class="text-[10px] text-ink-400 font-semibold italic">Chờ khách đặt lại</span>
        </template>
      </FhTable>

      <div v-if="expiredTotalPages > 1" class="flex items-center justify-between text-xs text-ink-500 pt-1">
        <span>Trang {{ expiredPage }} / {{ expiredTotalPages }}</span>
        <div class="flex items-center gap-2">
          <FhButton variant="secondary" size="sm" :disabled="expiredPage <= 1" @click="expiredPage--">Trước</FhButton>
          <FhButton variant="secondary" size="sm" :disabled="expiredPage >= expiredTotalPages" @click="expiredPage++">Sau</FhButton>
        </div>
      </div>
    </div>

    <!-- Assign Modal -->
    <div
      v-if="showAssignModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
        <h3 class="text-base font-bold text-ink-900">Gán thợ cho: {{ assignBooking?.serviceName || assignBooking?.description }}</h3>

        <textarea
          v-model="assignReason"
          rows="2"
          placeholder="Lý do gán thợ thủ công (bắt buộc, phục vụ audit log)..."
          class="w-full p-2.5 bg-white border border-ink-200 rounded text-xs"
        ></textarea>

        <p v-if="candidatesError" class="text-xs text-danger-600 font-semibold">{{ candidatesError }}</p>

        <div v-if="candidatesLoading" class="space-y-2">
          <FhSkeleton height="56px" :count="3" />
        </div>
        <FhEmptyState
          v-else-if="candidates.length === 0"
          title="Không có thợ nào đủ điều kiện"
          description="Không tìm thấy kỹ thuật viên phù hợp khu vực/kỹ năng/khung giờ cho booking này."
        />
        <div v-else class="space-y-2">
          <div
            v-for="c in candidates"
            :key="c.id"
            class="p-3 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 flex items-center justify-between gap-3"
          >
            <div>
              <div class="text-xs font-bold text-ink-900">{{ c.fullName }}</div>
              <div class="flex items-center gap-2 text-[11px] text-ink-500 mt-0.5">
                <span class="flex items-center gap-0.5"><Star :size="11" class="fill-amber-400 text-amber-400" /> {{ c.averageRating.toFixed(1) }} ({{ c.ratingCount }})</span>
                <span v-if="c.distanceKm != null">~{{ c.distanceKm.toFixed(1) }} km</span>
                <span v-if="c.listedLaborPrice"><FhMoney :amount="c.listedLaborPrice" /></span>
              </div>
            </div>
            <FhButton variant="primary" size="sm" :disabled="assigningId === c.id" @click="confirmAssign(c)">
              Chọn thợ này
            </FhButton>
          </div>
        </div>

        <div class="flex justify-end pt-2 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showAssignModal = false">Đóng</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
