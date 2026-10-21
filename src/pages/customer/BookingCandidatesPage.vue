<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Star,
  MapPin,
  Briefcase,
  CheckCircle2,
  Send,
  Eye,
} from 'lucide-vue-next';
import {
  FhBackLink,
  FhButton,
  FhSkeleton,
  FhStatusPill,
  FhEmptyState,
  FhMoney,
  TechnicianProfileModal,
} from '../../components';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';
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
  if (!bookingId) {
    loadError.value = 'Không xác định được đơn đặt lịch. Vui lòng tạo lại yêu cầu đặt thợ.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const list = isVisit ? await visitGroupsApi.candidates(bookingId) : await bookingsApi.getCandidates(bookingId);
    candidates.value = list;
    // The customer may choose one or two technicians; selection order is invitation priority.
    selectedIds.value = [];
  } catch {
    candidates.value = [];
    loadError.value = 'Không thể tải danh sách kỹ thuật viên phù hợp. Vui lòng thử lại.';
  } finally {
    loading.value = false;
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
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-28">
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
    <div class="space-y-3">
      <!-- The request already exists: back opens it, never the emptied form (PO 21/10/2026). -->
      <FhBackLink :label="isVisit ? 'Lượt sửa của bạn' : 'Yêu cầu của bạn'" @click="router.push(backTarget)" />

      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight text-balance">Kỹ thuật viên gần bạn</h1>
          <p class="text-sm text-ink-500 mt-1">
            Được FixHome xác thực tay nghề, lý lịch và đang trống lịch trong buổi bạn chọn
          </p>
        </div>
        <div class="hidden sm:flex items-center gap-2 text-xs font-medium text-ink-500 bg-ink-50 px-3 py-1.5 rounded-full border border-ink-200/60 shrink-0">
          <span class="w-2 h-2 rounded-full bg-success-500 animate-pulse"></span>
          Đang có thợ sẵn sàng nhận đơn
        </div>
      </div>
    </div>

    <!-- Customer-ranked invitations policy callout -->
    <div class="p-4 rounded-2xl bg-gradient-to-r from-brand-50/60 to-warning-50/50 border border-brand-200/70 text-ink-800 text-sm shadow-xs">
      <div class="flex items-start gap-3">
        <div class="w-7 h-7 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 text-xs font-bold">
          TIP
        </div>
        <div class="leading-relaxed text-pretty space-y-1">
          <p class="font-semibold text-ink-900">Chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên</p>
          <p class="text-xs sm:text-sm text-ink-600">
            • <strong>Chọn 1 người:</strong> Chọn 1 người thì người đó được mời ngay.<br />
            • <strong>Chọn 2 người:</strong> Người số 1 nhận lời mời trước; người số 2 là dự phòng và chỉ được mời khi người số 1 từ chối hoặc hết hạn phản hồi.
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
      class="rounded-3xl bg-white border border-ink-200/90 divide-y divide-ink-100 shadow-xs"
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
      class="bg-white rounded-3xl border border-ink-200 p-8 flex flex-col items-center text-center gap-3 shadow-xs"
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
      title="Chưa có kỹ thuật viên nhận được giờ hẹn này"
      description="Kỹ thuật viên chỉ nhận đơn trong ca làm và khi còn trống lịch. Hãy đổi sang buổi khác rồi tìm lại."
      action-text="Đổi giờ hẹn"
      @action="router.push(backTarget)"
    />

    <!-- Candidates Cards -->
    <div v-else class="space-y-3.5">
      <div
        v-for="tech in candidates"
        :key="tech.id"
        role="button"
        tabindex="0"
        :aria-pressed="selectedIds.includes(tech.id)"
        class="group relative p-4 sm:p-5 rounded-2xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 cursor-pointer select-none"
        :class="selectedIds.includes(tech.id)
          ? 'border-brand-600 bg-brand-50/20 ring-2 ring-brand-500/25 shadow-sm'
          : 'border-ink-200 hover:border-ink-300 hover:shadow-xs'"
        @click="toggleSelect(tech.id)"
        @keydown.enter.prevent="toggleSelect(tech.id)"
        @keydown.space.prevent="toggleSelect(tech.id)"
      >
        <!-- Selection Priority Flag (Top Right on Mobile) -->
        <div
          v-if="selectedIds.includes(tech.id)"
          class="sm:hidden self-start px-2.5 py-0.5 rounded-full text-xs font-bold text-brand-700 bg-brand-100 border border-brand-200"
        >
          #{{ selectedIds.indexOf(tech.id) + 1 }} {{ selectedIds.indexOf(tech.id) === 0 ? 'Ưu tiên chính' : 'Dự phòng' }}
        </div>

        <div class="flex items-start sm:items-center gap-4 min-w-0 flex-1">
          <!-- Checkbox -->
          <div class="pt-1 sm:pt-0 shrink-0">
            <input
              type="checkbox"
              :checked="selectedIds.includes(tech.id)"
              :aria-label="`Chọn ${tech.fullName}`"
              data-testid="select-technician-btn"
              class="w-5 h-5 rounded-md text-brand-600 border-ink-300 focus:ring-brand-500 cursor-pointer"
              @click.stop
              @change="handleCheckboxChange($event, tech.id)"
            />
          </div>

          <!-- Avatar with Priority Number and Online Dot -->
          <div class="w-13 h-13 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 border border-brand-200/60 flex items-center justify-center font-bold text-lg shrink-0 relative shadow-2xs">
            {{ tech.fullName.charAt(0) }}
            <span
              v-if="selectedIds.includes(tech.id)"
              class="absolute -top-1.5 -right-1.5 w-6 h-6 bg-brand-600 text-white text-xs font-bold font-num rounded-full flex items-center justify-center border-2 border-white shadow-xs transition-transform transform scale-100"
            >
              #{{ selectedIds.indexOf(tech.id) + 1 }}
            </span>
            <span
              v-if="tech.isAvailable !== false"
              class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-success-500 border-2 border-white shadow-2xs"
              title="Đang sẵn sàng nhận đơn"
            />
          </div>

          <!-- Details & Meta -->
          <div class="space-y-1.5 min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-base text-ink-900 group-hover:text-brand-700 transition-colors">
                {{ tech.fullName }}
              </h3>
              <FhStatusPill status="COMPLETED" label="Đã xác thực" />
              <span
                v-if="selectedIds.includes(tech.id)"
                class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-brand-700 bg-brand-100/80 border border-brand-200"
              >
                #{{ selectedIds.indexOf(tech.id) + 1 }} {{ selectedIds.indexOf(tech.id) === 0 ? 'Ưu tiên chính' : 'Dự phòng' }}
              </span>
            </div>

            <!-- Stats Row -->
            <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs sm:text-sm text-ink-600">
              <span class="flex items-center gap-1 whitespace-nowrap font-num font-medium text-ink-900">
                <template v-if="hasRating(tech.averageRating, tech.ratingCount)">
                  <Star :size="14" class="text-amber-500 fill-amber-400 shrink-0" />
                  <span>{{ ratingLabel(tech.averageRating, tech.ratingCount) }}</span>
                  <span class="text-ink-400 font-normal">({{ tech.ratingCount }})</span>
                </template>
                <template v-else>
                  <span class="text-ink-400 font-normal">Chưa có đánh giá</span>
                </template>
              </span>

              <span v-if="tech.reliabilityScore != null" class="whitespace-nowrap flex items-center gap-1 text-ink-700">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Độ tin cậy <span class="font-num font-semibold text-ink-900">{{ tech.reliabilityScore }}%</span>
              </span>

              <span class="flex items-center gap-1.5 whitespace-nowrap text-ink-600">
                <Briefcase :size="13" class="text-ink-400 shrink-0" />
                <span>{{ tech.yearsExperience }} năm kinh nghiệm</span>
              </span>

              <span v-if="tech.distanceKm != null" class="flex items-center gap-1 whitespace-nowrap font-num text-ink-600">
                <MapPin :size="13" class="text-ink-400 shrink-0" />
                <span>Cách {{ tech.distanceKm }} km</span>
              </span>
            </div>

            <!-- Pricing & Warranty Row -->
            <div v-if="tech.listedLaborPrice" class="text-xs sm:text-sm text-ink-600 pt-0.5 flex flex-wrap items-center gap-2">
              <span>Giá công tham khảo:</span>
              <span class="font-num font-bold text-ink-900 bg-ink-100/70 px-2 py-0.5 rounded-md">
                <FhMoney :amount="tech.listedLaborPrice" />
              </span>
              <span v-if="tech.typicalWarrantyDays" class="text-ink-500 inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">
                Bảo hành {{ tech.typicalWarrantyDays }} ngày
              </span>
            </div>
          </div>
        </div>

        <!-- Action Button -->
        <div class="flex items-center justify-end sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-ink-100">
          <FhButton
            variant="secondary"
            size="sm"
            data-testid="view-profile-btn"
            class="w-full sm:w-auto shadow-2xs group-hover:border-ink-400"
            @click.stop="openProfileModal(tech)"
          >
            <Eye :size="14" class="text-ink-500" />
            <span>Xem hồ sơ</span>
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Technician Profile Modal -->
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

    <!-- Success Feedback Modal with Smooth Transitions -->
    <div
      v-if="inviteSent"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div class="bg-white rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
        <div class="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-200/60 shadow-xs">
          <CheckCircle2 :size="36" />
        </div>
        <div class="space-y-2">
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

    <!-- Floating Sticky Action Bar -->
    <div class="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] lg:bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-ink-200/80 py-3.5 shadow-(--shadow-e2)">
      <div class="max-w-4xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6">
        <div class="flex items-center gap-2.5">
          <div class="flex items-center gap-1.5">
            <span
              class="w-3 h-3 rounded-full transition-colors"
              :class="selectedCount >= 1 ? 'bg-brand-600 ring-2 ring-brand-200' : 'bg-ink-200'"
            ></span>
            <span
              class="w-3 h-3 rounded-full transition-colors"
              :class="selectedCount >= 2 ? 'bg-brand-600 ring-2 ring-brand-200' : 'bg-ink-200'"
            ></span>
          </div>
          <div class="text-sm text-ink-600 whitespace-nowrap">
            Đã chọn: <strong class="text-ink-900 font-num font-bold">{{ selectedCount }}</strong>/2
          </div>
        </div>

        <FhButton
          variant="primary"
          size="md"
          :disabled="selectedCount < 1"
          :loading="sending"
          class="px-6 shadow-xs"
          @click="handleSendShortlist"
        >
          <Send :size="15" /> Gửi lời mời
        </FhButton>
      </div>
    </div>
  </div>
</template>
