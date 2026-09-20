<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { UserPlus, Star, MapPin, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { FhCard, FhStatusPill, FhButton, FhSkeleton, FhEmptyState, FhMoney } from '../../components';
import { bookingsApi, type BookingItem, type TechnicianCandidate } from '../../api/bookings.api';

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
    candidatesError.value = `Khung giờ hẹn của booking này (${new Date(booking.preferredEndAt || booking.preferredAt).toLocaleString('vi-VN')}) đã qua nên không thợ nào còn đủ điều kiện. Không thể gán thợ cho khung giờ đã trôi qua — liên hệ khách để họ đặt lại lịch mới (rebook).`;
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
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
        <UserPlus class="text-brand-600" :size="24" />
        Gán thợ thủ công
      </h1>
      <p class="text-xs text-ink-500 mt-1">
        Booking chưa có thợ nhận việc (hết lượt mời tuần tự hoặc chưa gửi shortlist). SM/Admin có thể gán thợ trực tiếp.
      </p>
    </div>

    <div v-if="loading" class="space-y-3">
      <FhSkeleton height="88px" :count="3" />
    </div>
    <FhEmptyState
      v-else-if="loadError"
      title="Không tải được danh sách"
      :description="loadError"
      action-text="Thử lại"
      @action="loadBookings"
    />
    <FhEmptyState
      v-else-if="bookings.length === 0"
      title="Không có booking nào cần gán thợ"
      description="Mọi booking hiện đều đã được ghép thợ hoặc đang trong hàng đợi mời tuần tự."
    />

    <template v-else>
      <!-- Cần xử lý: khung giờ còn hiệu lực, gán được ngay -->
      <div v-if="actionableBookings.length > 0" class="space-y-3">
        <h2 class="text-xs font-bold text-ink-500 uppercase tracking-wider">
          Cần gán thợ ({{ actionableBookings.length }})
        </h2>
        <FhCard
          v-for="b in actionablePageItems"
          :key="b.id"
          padding="sm"
          class="flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-bold text-sm text-ink-900">{{ b.serviceName }}</h3>
              <FhStatusPill :status="b.status" />
            </div>
            <p class="text-xs text-ink-500 flex items-start gap-1.5">
              <MapPin :size="13" class="shrink-0 mt-0.5 text-brand-600" />
              <span class="break-words">{{ b.addressSummary }}</span>
            </p>
            <p class="text-xs text-ink-500 flex items-center gap-1.5">
              <Clock :size="13" class="shrink-0" />
              <span>{{ new Date(b.preferredAt).toLocaleString('vi-VN') }} · {{ relativeTime(b.preferredAt) }}</span>
            </p>
          </div>
          <FhButton variant="primary" size="sm" class="shrink-0 self-start sm:self-center" @click="openAssign(b)">
            <UserPlus :size="13" class="mr-1" /> Gán thợ
          </FhButton>
        </FhCard>

        <div v-if="actionableTotalPages > 1" class="flex items-center justify-between text-xs text-ink-500 pt-1">
          <span>Trang {{ actionablePage }} / {{ actionableTotalPages }}</span>
          <div class="flex items-center gap-2">
            <button
              class="rounded border border-ink-200 p-2 transition-colors hover:bg-ink-100 disabled:opacity-40"
              type="button"
              aria-label="Trang trước"
              :disabled="actionablePage <= 1"
              @click="actionablePage--"
            >
              <ChevronLeft :size="16" />
            </button>
            <button
              class="rounded border border-ink-200 p-2 transition-colors hover:bg-ink-100 disabled:opacity-40"
              type="button"
              aria-label="Trang sau"
              :disabled="actionablePage >= actionableTotalPages"
              @click="actionablePage++"
            >
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </div>

      <!-- Đã quá hạn: không gán được nữa, cần khách đặt lại lịch -->
      <div v-if="expiredBookings.length > 0" class="space-y-3">
        <h2 class="text-xs font-bold text-ink-400 uppercase tracking-wider">
          Đã quá hạn, chờ khách đặt lại ({{ expiredBookings.length }})
        </h2>
        <FhCard
          v-for="b in expiredPageItems"
          :key="b.id"
          padding="sm"
          class="flex flex-col sm:flex-row sm:items-center gap-3 opacity-60"
        >
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-bold text-sm text-ink-900">{{ b.serviceName }}</h3>
              <FhStatusPill :status="b.status" />
            </div>
            <p class="text-xs text-ink-500 flex items-start gap-1.5">
              <MapPin :size="13" class="shrink-0 mt-0.5" />
              <span class="break-words">{{ b.addressSummary }}</span>
            </p>
            <p class="text-xs text-danger-600 font-semibold flex items-center gap-1.5">
              <AlertTriangle :size="13" class="shrink-0" />
              <span>{{ new Date(b.preferredAt).toLocaleString('vi-VN') }} · {{ relativeTime(b.preferredAt) }}</span>
            </p>
          </div>
        </FhCard>

        <div v-if="expiredTotalPages > 1" class="flex items-center justify-between text-xs text-ink-500 pt-1">
          <span>Trang {{ expiredPage }} / {{ expiredTotalPages }}</span>
          <div class="flex items-center gap-2">
            <button
              class="rounded border border-ink-200 p-2 transition-colors hover:bg-ink-100 disabled:opacity-40"
              type="button"
              aria-label="Trang trước"
              :disabled="expiredPage <= 1"
              @click="expiredPage--"
            >
              <ChevronLeft :size="16" />
            </button>
            <button
              class="rounded border border-ink-200 p-2 transition-colors hover:bg-ink-100 disabled:opacity-40"
              type="button"
              aria-label="Trang sau"
              :disabled="expiredPage >= expiredTotalPages"
              @click="expiredPage++"
            >
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </div>
    </template>

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
