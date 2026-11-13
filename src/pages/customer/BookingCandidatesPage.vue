<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Star,
  MapPin,
  Briefcase,
  Send,
  Eye,
  Info,
  Check,
  Plus,
  ShieldCheck,
} from 'lucide-vue-next';
import {
  FhBackLink,
  FhButton,
  FhSkeleton,
  FhStatusPill,
  FhEmptyState,
  TechnicianProfileModal,
} from '../../components';
import { bookingsApi, type TechnicianCandidate, type CandidateEmptyReason } from '../../api/bookings.api';
import { visitGroupsApi } from '../../api/visit-groups.api';
import { hasRating, ratingLabel } from '../../utils/formatters';

const route = useRoute();
// Set by "Đặt lại thợ" when the former technician is not free for the chosen session.
const rebookedChoose = route.query?.rebooked === 'choose';
// Set when the technician of this request could not make it in time (PO 20/10/2026).
const technicianReleased = route.query?.released === '1';
const router = useRouter();
const bookingId = route.params.id as string | undefined;
// The same page chooses a technician for a whole visit of several devices (PO 21/10/2026):
// only technicians who offer every device are listed, and the invitation covers them all.
const isVisit = route.meta?.visit === true;
const backTarget = computed(() => isVisit
  ? { name: 'customer-visit', params: { id: bookingId } }
  : { name: 'booking-detail', params: { id: bookingId } });

const loading = ref(true);
const loadError = ref('');
const sending = ref(false);
const sendError = ref('');
const candidates = ref<TechnicianCandidate[]>([]);
const emptyReason = ref<CandidateEmptyReason | null>(null);
let latestLoadId = 0;

// A visit reads the same reasons as one booking (bug 41); only the words naming it differ.
const requestWord = isVisit ? 'lượt sửa' : 'yêu cầu';
const viewRequestLabel = isVisit ? 'Xem lượt sửa' : 'Xem yêu cầu';
const emptyState = computed(() => {
  switch (emptyReason.value) {
    case 'OUTSIDE_COVERAGE':
      return {
        title: 'Địa chỉ nằm ngoài khu vực phục vụ',
        description: `FixHome chưa có kỹ thuật viên phục vụ tại địa chỉ đã đặt. Bạn có thể đặt lại ${requestWord} này với một địa chỉ khác.`,
        action: 'Đặt lại với địa chỉ khác',
      };
    case 'BOOKING_LOCATION_MISSING':
      return {
        title: 'Chưa xác định được vị trí đặt lịch',
        description: `${isVisit ? 'Lượt sửa' : 'Yêu cầu'} chưa có vị trí chính xác đã xác nhận. Vui lòng kiểm tra lại địa chỉ và đặt lại với vị trí đầy đủ.`,
        action: viewRequestLabel,
      };
    case 'TIME_UNAVAILABLE':
      return {
        title: 'Chưa có thợ rảnh trong giờ hẹn này',
        description: 'Các thợ phù hợp với địa chỉ đều bận hoặc không làm việc trong giờ hẹn đã chọn. Hãy xem lại lịch hẹn.',
        action: 'Xem lịch hẹn',
      };
    default:
      return {
        title: 'Chưa có kỹ thuật viên phù hợp',
        description: isVisit
          ? 'Hiện chưa tìm được thợ nhận sửa được mọi máy trong lượt này. Bạn có thể kiểm tra lại địa chỉ, các máy và thời gian.'
          : 'Hiện chưa tìm được thợ đáp ứng đầy đủ điều kiện của yêu cầu này. Bạn có thể kiểm tra lại địa chỉ, dịch vụ và thời gian.',
        action: viewRequestLabel,
      };
  }
});


// Only a found technician makes the "ready" badge true (bug 41: it showed over the empty list).
const showsReadyBadge = computed(() => !loading.value && !loadError.value && candidates.value.length > 0);
// Nothing to choose, nothing to send: the "Đã chọn 0/2, Gửi lời mời" bar shows only over a list.
const showsActionBar = showsReadyBadge;

const rebooking = ref(false);
// Out of area: start a new request for the same service and description, the customer picks
// another address in the form. The current request is left as it is, it can be cancelled there.
const rebookElsewhere = async () => {
  if (!bookingId || rebooking.value) return;
  // A visit holds several devices the form cannot be filled with from a link: the form opens
  // empty and the customer adds the devices again at the new address.
  if (isVisit) {
    await router.push({ name: 'new-booking' });
    return;
  }
  rebooking.value = true;
  const query: Record<string, string> = {};
  try {
    const booking = await bookingsApi.getBooking(bookingId);
    if (booking.serviceId) query.serviceId = booking.serviceId;
    if (booking.description?.trim()) query.desc = booking.description.trim().slice(0, 1000);
  } catch {
    // The form still opens, the customer chooses the service again.
  } finally {
    rebooking.value = false;
  }
  await router.push({ name: 'new-booking', query });
};

const handleEmptyAction = () => {
  if (emptyReason.value === 'OUTSIDE_COVERAGE') void rebookElsewhere();
  else router.push(backTarget.value);
};

const selectedIds = ref<string[]>([]);
const inviteSent = ref(false);

// Technician profile drawer/modal state
const selectedCandidateForModal = ref<TechnicianCandidate | null>(null);
const isProfileModalOpen = ref(false);

const openProfileModal = (tech: TechnicianCandidate) => {
  selectedCandidateForModal.value = tech;
  isProfileModalOpen.value = true;
};

const closeProfileModal = () => {
  isProfileModalOpen.value = false;
  selectedCandidateForModal.value = null;
};

const handleModalToggleSelect = (id: string) => {
  toggleSelect(id);
};

const loadCandidates = async () => {
  const loadId = ++latestLoadId;
  if (!bookingId) {
    loadError.value = 'Không xác định được đơn đặt lịch. Vui lòng tạo lại yêu cầu đặt thợ.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  emptyReason.value = null;
  try {
    const result = isVisit
      ? await visitGroupsApi.candidatesWithDiagnostics(bookingId)
      : await bookingsApi.getCandidatesWithDiagnostics(bookingId);
    if (loadId !== latestLoadId) return;
    candidates.value = result.candidates;
    emptyReason.value = result.candidates.length ? null : result.emptyReason;
    // The customer may choose one or two technicians; selection order is invitation priority.
    selectedIds.value = [];
  } catch {
    if (loadId !== latestLoadId) return;
    candidates.value = [];
    emptyReason.value = null;
    loadError.value = 'Không thể tải danh sách kỹ thuật viên phù hợp. Vui lòng thử lại.';
  } finally {
    if (loadId === latestLoadId) loading.value = false;
  }
};

onMounted(loadCandidates);

const toggleSelect = (id: string) => {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  } else {
    if (selectedIds.value.length >= 2) {
      sendError.value = 'Chỉ được chọn tối đa 2 kỹ thuật viên theo thứ tự ưu tiên.';
      return;
    }
    sendError.value = '';
    selectedIds.value.push(id);
  }
};

const handleCheckboxChange = (event: Event, id: string) => {
  toggleSelect(id);
  // Native checkbox state changes before Vue receives the change event.
  // Restore the DOM to the selection source of truth when a third is rejected.
  if (event.target instanceof HTMLInputElement) {
    event.target.checked = selectedIds.value.includes(id);
  }
};

const handleSendShortlist = async () => {
  if (sending.value || inviteSent.value || !bookingId) return;
  if (selectedIds.value.length < 1 || selectedIds.value.length > 2) {
    sendError.value = 'Vui lòng chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên.';
    return;
  }
  sendError.value = '';
  sending.value = true;
  try {
    if (isVisit) await visitGroupsApi.shortlist(bookingId, selectedIds.value);
    else await bookingsApi.sendShortlist(bookingId, selectedIds.value);
    inviteSent.value = true;
  } catch {
    sendError.value = 'Không thể gửi lời mời. Vui lòng thử lại.';
  } finally {
    sending.value = false;
  }
};

const selectedCount = computed(() => selectedIds.value.length);
const successMessage = computed(() => selectedCount.value === 1
  ? 'Đã gửi lời mời cho kỹ thuật viên đã chọn.'
  : 'Đã gửi lời mời cho thợ ưu tiên số 1. Thợ số 2 sẽ chỉ nhận lời mời nếu thợ số 1 từ chối hoặc hết hạn phản hồi.');

type SortOption = 'recommended' | 'distance' | 'rating';
const sortBy = ref<SortOption>('recommended');

const sortOptions = [
  { key: 'recommended' as const, label: 'Gợi ý tốt nhất' },
  { key: 'distance' as const, label: 'Gần bạn nhất' },
  { key: 'rating' as const, label: 'Đánh giá cao' },
];

const sortedCandidates = computed(() => {
  const list = [...candidates.value];
  if (sortBy.value === 'distance') {
    return list.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }
  if (sortBy.value === 'rating') {
    return list.sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
  }
  return list;
});

const selectedTechs = computed(() => {
  return selectedIds.value
    .map((id) => candidates.value.find((c) => c.id === id))
    .filter((c): c is TechnicianCandidate => c != null);
});
</script>

<template>
  <div class="w-full space-y-5 pb-16">
    <!-- Rebook notice when former tech is busy -->
    <div
      v-if="rebookedChoose"
      role="status"
      data-testid="rebook-choose-notice"
      class="rounded-2xl border border-warning-200 bg-warning-50/80 p-4 text-sm text-warning-800 flex items-start gap-3 shadow-xs animate-in fade-in duration-200"
    >
      <div class="w-8 h-8 rounded-full bg-warning-100 text-warning-700 flex items-center justify-center shrink-0 font-bold text-sm">!</div>
      <div class="flex-1 text-pretty leading-relaxed">
        <strong>Thợ cũ không rảnh buổi bạn chọn.</strong> Vui lòng chọn kỹ thuật viên khác bên dưới cho yêu cầu mới này.
      </div>
    </div>

    <div
      v-if="technicianReleased"
      role="status"
      data-testid="released-choose-notice"
      class="rounded-2xl border border-brand-200 bg-white p-4 text-sm text-ink-700"
    >
      <strong class="text-ink-900">Thợ trước không kịp tới buổi hẹn.</strong> Bạn chọn thợ khác, giá và lịch hẹn giữ nguyên.
    </div>

    <!-- Top Navigation & Header -->
    <div class="space-y-3 animate-slide-up">
      <!-- The request already exists: back opens it, never the emptied form (PO 21/10/2026). -->
      <FhBackLink :label="isVisit ? 'Lượt sửa của bạn' : 'Yêu cầu của bạn'" @click="router.push(backTarget)" />

      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight text-balance">Kỹ thuật viên gần bạn</h1>
          <p class="text-sm text-ink-500 mt-1">
            Được FixHome xác thực tay nghề, lý lịch và đang trống lịch trong buổi bạn chọn
          </p>
        </div>
        <div
          v-if="showsReadyBadge"
          data-testid="candidates-ready-badge"
          class="hidden sm:flex items-center gap-2 text-xs font-medium text-ink-500 bg-ink-50 px-3 py-1.5 rounded-full border border-ink-200/60 shrink-0"
        >
          <span class="w-2 h-2 rounded-full bg-success-500 animate-pulse"></span>
          Đang có thợ sẵn sàng nhận đơn
        </div>
      </div>
    </div>

    <!-- Customer-ranked invitations policy callout -->
    <div class="rounded-2xl border border-ink-200/80 bg-ink-50/70 p-4 text-ink-700 text-xs sm:text-sm shadow-2xs animate-slide-up-delay-1">
      <div class="flex items-start gap-3.5">
        <div class="w-8 h-8 rounded-xl bg-white border border-ink-200/90 text-brand-600 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
          <Info :size="16" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <h2 class="font-semibold text-ink-900 text-sm">Chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên</h2>
          <p class="text-xs text-ink-600 leading-relaxed text-pretty">
            • <strong class="font-medium text-ink-800">Chọn 1 người:</strong> Chọn 1 người thì người đó được mời ngay.<br class="hidden sm:inline" />
            • <strong class="font-medium text-ink-800">Chọn 2 người:</strong> Người số 1 nhận lời mời trước; người số 2 là dự phòng và chỉ được mời khi người số 1 từ chối hoặc hết hạn phản hồi.
          </p>
        </div>
      </div>
    </div>

    <!-- Send/select error banner -->
    <div
      v-if="sendError"
      role="alert"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-danger-800 text-sm font-medium flex items-center gap-3 animate-in fade-in"
    >
      <div class="w-2 h-2 rounded-full bg-danger-500 shrink-0"></div>
      {{ sendError }}
    </div>

    <!-- Candidate List Loading State -->
    <div
      v-if="loading"
      role="status"
      aria-label="Đang tải danh sách kỹ thuật viên"
      class="rounded-3xl bg-white border border-ink-200/90 divide-y divide-ink-100 shadow-xs animate-slide-up-delay-2"
    >
      <div v-for="i in 3" :key="i" class="p-5 sm:p-6 flex items-center gap-4">
        <span class="w-14 shrink-0"><FhSkeleton height="56px" rounded="full" /></span>
        <span class="flex-1 space-y-2.5">
          <FhSkeleton width="35%" height="20px" />
          <FhSkeleton width="65%" height="16px" />
          <FhSkeleton width="45%" height="14px" />
        </span>
      </div>
    </div>

    <!-- Candidate List Load Error -->
    <div
      v-else-if="loadError"
      class="bg-white rounded-3xl border border-ink-200 p-8 flex flex-col items-center text-center gap-3 shadow-xs animate-slide-up-delay-2"
      role="alert"
    >
      <div class="w-12 h-12 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center">
        <MapPin :size="22" />
      </div>
      <p class="text-sm font-medium text-ink-700 max-w-md">{{ loadError }}</p>
      <FhButton v-if="bookingId" variant="secondary" size="sm" @click="loadCandidates">Thử lại</FhButton>
    </div>

    <!-- Candidate List Empty State -->
    <FhEmptyState
      v-else-if="candidates.length === 0"
      class="animate-slide-up-delay-2"
      illustration="/images/ui/booking-technician-match.png"
      :title="emptyState.title"
      :description="emptyState.description"
      :action-text="emptyState.action"
      data-testid="candidates-empty"
      @action="handleEmptyAction"
    >
      <template v-if="emptyReason === 'OUTSIDE_COVERAGE'" #extra>
        <FhButton variant="ghost" size="sm" class="mt-2" :disabled="rebooking" @click="router.push(backTarget)">{{ viewRequestLabel }}</FhButton>
      </template>
    </FhEmptyState>

    <!-- Candidates Section -->
    <div v-else class="space-y-3 animate-slide-up-delay-2">
      <!-- Filter / Sort Toolbar (Only when multiple candidates) -->
      <div v-if="candidates.length > 1" class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        <span class="text-xs font-semibold text-ink-500 uppercase tracking-wider">
          {{ candidates.length }} kỹ thuật viên phù hợp
        </span>
        <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="group" aria-label="Sắp xếp danh sách">
          <button
            v-for="sort in sortOptions"
            :key="sort.key"
            type="button"
            class="h-8 px-3 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap active:scale-95 cursor-pointer"
            :class="sortBy === sort.key ? 'bg-ink-900 text-white shadow-2xs font-semibold' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300'"
            @click="sortBy = sort.key"
          >
            {{ sort.label }}
          </button>
        </div>
      </div>

      <!-- Candidate Cards (Compact height, direct profile trigger on name/avatar) -->
      <div
        v-for="tech in sortedCandidates"
        :key="tech.id"
        role="button"
        tabindex="0"
        :aria-pressed="selectedIds.includes(tech.id)"
        class="group relative p-3.5 sm:p-4 rounded-2xl border bg-white flex flex-col gap-2.5 transition-all duration-150 cursor-pointer select-none active:scale-[0.99]"
        :class="selectedIds.includes(tech.id)
          ? 'border-brand-600 bg-brand-50/20 ring-2 ring-brand-500/20 shadow-xs'
          : 'border-ink-200/90 hover:border-brand-300 hover:shadow-2xs'"
        @click="toggleSelect(tech.id)"
        @keydown.enter.prevent="toggleSelect(tech.id)"
        @keydown.space.prevent="toggleSelect(tech.id)"
      >
        <!-- Top Row: Checkbox, Profile Trigger (Avatar + Name), and Selection Pill -->
        <div class="flex items-center justify-between gap-3 min-w-0">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <!-- Native Checkbox for accessibility and unit test contracts -->
            <div class="shrink-0" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.includes(tech.id)"
                :aria-label="`Chọn ${tech.fullName}`"
                data-testid="select-technician-btn"
                class="w-5 h-5 rounded-md border-ink-300 text-brand-600 focus:ring-brand-500 cursor-pointer transition-colors"
                @change="handleCheckboxChange($event, tech.id)"
              />
            </div>

            <!-- Profile Trigger: Click Avatar or Name to open Profile Modal -->
            <button
              type="button"
              data-testid="view-profile-btn"
              class="group/profile text-left flex items-center gap-3 min-w-0 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl transition-all"
              title="Nhấn để xem hồ sơ kỹ thuật viên"
              :aria-label="`Xem hồ sơ kỹ thuật viên ${tech.fullName}`"
              @click.stop="openProfileModal(tech)"
            >
              <!-- Avatar with Online Dot and Selection Priority Badge -->
              <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-100/70 to-brand-50 text-brand-700 border border-brand-200/70 flex items-center justify-center font-bold text-base shrink-0 relative shadow-2xs group-hover/profile:border-brand-400 group-hover/profile:scale-105 transition-all">
                <img
                  v-if="tech.avatarUrl"
                  :src="tech.avatarUrl"
                  :alt="tech.fullName"
                  class="w-full h-full object-cover rounded-xl"
                />
                <span v-else>{{ tech.fullName.charAt(0) }}</span>
                <Transition name="fh-pop">
                  <span
                    v-if="selectedIds.includes(tech.id)"
                    class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brand-600 text-white text-[11px] font-bold font-num rounded-full flex items-center justify-center border-2 border-white shadow-xs"
                  >
                    #{{ selectedIds.indexOf(tech.id) + 1 }}
                  </span>
                </Transition>
                <span
                  v-if="tech.isAvailable !== false"
                  class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success-500 border-2 border-white shadow-2xs"
                  title="Đang sẵn sàng nhận đơn"
                />
              </div>

              <!-- Name & Ratings -->
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1.5">
                  <h3 class="font-bold text-sm sm:text-base text-ink-900 group-hover/profile:text-brand-700 group-hover/profile:underline transition-colors truncate">
                    {{ tech.fullName }}
                  </h3>
                  <Eye :size="13" class="text-ink-400 group-hover/profile:text-brand-600 shrink-0 opacity-60 group-hover/profile:opacity-100 transition-opacity" />
                  <FhStatusPill status="COMPLETED" label="Đã xác thực" />
                </div>

                <!-- Rating & Distance line -->
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-600 mt-0.5">
                  <span class="flex items-center gap-1 whitespace-nowrap font-num font-medium text-ink-900">
                    <template v-if="hasRating(tech.averageRating, tech.ratingCount)">
                      <Star :size="12" class="text-warning-500 fill-warning-400 shrink-0" />
                      <span class="font-bold">{{ ratingLabel(tech.averageRating, tech.ratingCount) }}</span>
                      <span class="text-ink-400 font-normal">({{ tech.ratingCount }})</span>
                    </template>
                    <template v-else>
                      <span class="text-ink-400 font-normal">Chưa có đánh giá</span>
                    </template>
                  </span>

                  <template v-if="tech.distanceKm != null">
                    <span class="text-ink-300" aria-hidden="true">·</span>
                    <span class="flex items-center gap-1 whitespace-nowrap font-num text-ink-600">
                      <MapPin :size="11" class="text-ink-400 shrink-0" />
                      <span>Cách {{ tech.distanceKm }} km</span>
                    </span>
                  </template>
                </div>
              </div>
            </button>
          </div>

          <!-- Selection Badge / Indicator (Right Side) -->
          <div class="shrink-0 pointer-events-none">
            <span
              v-if="selectedIds.includes(tech.id)"
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-num shadow-2xs transition-all duration-200"
              :class="selectedIds.indexOf(tech.id) === 0 ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-800 border border-brand-200'"
            >
              <Check :size="13" class="stroke-[3]" />
              <span>#{{ selectedIds.indexOf(tech.id) + 1 }} {{ selectedIds.indexOf(tech.id) === 0 ? 'Ưu tiên chính' : 'Dự phòng' }}</span>
            </span>
            <span
              v-else
              class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-ink-500 bg-ink-100/70 group-hover:bg-brand-50 group-hover:text-brand-700 transition-colors"
            >
              <Plus :size="12" /> Chọn thợ
            </span>
          </div>
        </div>

        <!-- Trust Highlights Row (Aligned neatly with content) -->
        <div class="flex flex-wrap items-center gap-1.5 pl-8 sm:pl-16 text-[11px] sm:text-xs">
          <span v-if="tech.reliabilityScore != null" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-ink-50 text-ink-700 border border-ink-100 font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-success-500"></span>
            Độ tin cậy <span class="font-num font-bold text-ink-900">{{ tech.reliabilityScore }}%</span>
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-ink-50 text-ink-700 border border-ink-100 font-medium">
            <Briefcase :size="11" class="text-ink-400 shrink-0" />
            <span>{{ tech.yearsExperience }} năm kinh nghiệm</span>
          </span>
          <span v-if="tech.typicalWarrantyDays" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-success-50 text-success-800 border border-success-200/70 font-medium">
            <ShieldCheck :size="11" class="text-success-600 shrink-0" />
            <span>Bảo hành {{ tech.typicalWarrantyDays }} ngày</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Technician Profile Modal -->
    <Transition name="fh-modal">
      <TechnicianProfileModal
        v-if="isProfileModalOpen && selectedCandidateForModal"
        :is-open="isProfileModalOpen"
        :candidate="selectedCandidateForModal"
        :is-selected="selectedCandidateForModal ? selectedIds.includes(selectedCandidateForModal.id) : false"
        :priority-index="selectedCandidateForModal ? selectedIds.indexOf(selectedCandidateForModal.id) : -1"
        :can-select="selectedIds.length < 2 || (selectedCandidateForModal ? selectedIds.includes(selectedCandidateForModal.id) : false)"
        @close="closeProfileModal"
        @toggle-select="handleModalToggleSelect"
      />
    </Transition>

    <!-- Success Feedback Modal with Smooth Transitions -->
    <Transition name="fh-modal">
      <div
        v-if="inviteSent"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4"
      >
        <div class="fh-modal-panel bg-white rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center space-y-4 shadow-2xl">
          <div class="mx-auto max-w-[130px] flex items-center justify-center">
            <img
              :src="'/images/ui/booking-confirmed.png'"
              alt="Thành công"
              class="w-full h-auto max-h-32 object-contain drop-shadow-md select-none pointer-events-none"
              loading="lazy"
            />
          </div>
          <div class="space-y-1.5">
            <h3 class="text-xl font-bold text-ink-900 tracking-tight">Đã gửi lời mời thành công</h3>
            <p class="text-xs sm:text-sm text-ink-600 leading-relaxed text-pretty">
              {{ successMessage }}
            </p>
          </div>
          <FhButton
            data-testid="view-matching-booking"
            variant="primary"
            size="md"
            class="w-full justify-center shadow-xs"
            @click="router.push(backTarget)"
          >
            Xem trạng thái yêu cầu
          </FhButton>
        </div>
      </div>
    </Transition>

    <!-- Floating Sticky Action Bar -->
    <Transition name="fh-dock">
      <div
        v-if="showsActionBar"
        data-testid="candidates-action-bar"
        class="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] lg:bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-ink-200/80 py-3.5 shadow-(--shadow-e2)"
      >
        <div class="max-w-4xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6">
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                class="w-3 h-3 rounded-full transition-all duration-200"
                :class="selectedCount >= 1 ? 'bg-brand-600 ring-2 ring-brand-200 scale-110' : 'bg-ink-200'"
              ></span>
              <span
                class="w-3 h-3 rounded-full transition-all duration-200"
                :class="selectedCount >= 2 ? 'bg-brand-600 ring-2 ring-brand-200 scale-110' : 'bg-ink-200'"
              ></span>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-ink-900 whitespace-nowrap">
                Đã chọn: <strong class="font-num text-brand-700 font-bold">{{ selectedCount }}</strong>/2
              </div>
              <div class="text-xs text-ink-500 truncate hidden sm:block">
                <template v-if="selectedCount === 0">Chọn ít nhất 1 thợ chính để gửi lời mời</template>
                <template v-else-if="selectedCount === 1">Thợ chính: <span class="font-medium text-ink-800">{{ selectedTechs[0]?.fullName }}</span> · Có thể chọn thêm 1 thợ dự phòng</template>
                <template v-else>Thợ #1: <span class="font-medium text-ink-800">{{ selectedTechs[0]?.fullName }}</span> · Thợ #2: <span class="font-medium text-ink-800">{{ selectedTechs[1]?.fullName }}</span></template>
              </div>
            </div>
          </div>

          <FhButton
            variant="primary"
            size="md"
            :disabled="selectedCount < 1"
            :loading="sending"
            class="px-6 shadow-xs shrink-0"
            @click="handleSendShortlist"
          >
            <Send :size="15" /> Gửi lời mời
          </FhButton>
        </div>
      </div>
    </Transition>
  </div>
</template>
