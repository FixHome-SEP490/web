<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Star,
  MapPin,
  Briefcase,
  CheckCircle2,
  Send,
  ArrowLeft,
  Eye,
} from 'lucide-vue-next';
import {
  FhButton,
  FhSkeleton,
  FhStatusPill,
  FhEmptyState,
  FhMoney,
  TechnicianProfileModal,
} from '../../components';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';
import { hasRating, ratingLabel } from '../../utils/formatters';

const route = useRoute();
// Set by "Đặt lại thợ" when the former technician is not free for the chosen session.
const rebookedChoose = route.query?.rebooked === 'choose';
const router = useRouter();
const bookingId = route.params.id as string | undefined;

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
    const list = await bookingsApi.getCandidates(bookingId);
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
    await bookingsApi.sendShortlist(bookingId, selectedIds.value);
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
  <div class="max-w-4xl mx-auto space-y-6 pb-24">
    <p v-if="rebookedChoose" role="status" data-testid="rebook-choose-notice" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
      Thợ cũ không rảnh buổi bạn chọn. Vui lòng chọn thợ khác cho yêu cầu mới.
    </p>
    <!-- Header -->
    <div class="space-y-4">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900 transition-colors"
        @click="router.back()"
      >
        <ArrowLeft :size="16" /> Quay lại
      </button>

      <h1 class="text-2xl font-bold text-ink-900 tracking-tight text-balance">Kỹ thuật viên gần bạn</h1>
    </div>

    <!-- Customer-ranked invitations: only the first technician is notified initially. -->
    <div class="p-3.5 rounded-2xl bg-warning-50 border border-warning-200 text-warning-900 text-sm">
      <div class="leading-relaxed text-pretty">
        <strong class="font-semibold">Chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên.</strong> Chọn 1 người thì người đó được mời ngay. Chọn 2 người thì người số 1 được mời trước, người số 2 là dự phòng và chỉ được mời khi người số 1 từ chối hoặc hết hạn phản hồi.
      </div>
    </div>

    <!-- Send/select error banner -->
    <div
      v-if="sendError"
      role="alert"
      class="p-3.5 rounded-2xl bg-danger-50 border border-danger-200 text-danger-800 text-sm font-medium"
    >
      {{ sendError }}
    </div>

    <!-- Candidate List -->
    <div v-if="loading" role="status" aria-label="Đang tải danh sách kỹ thuật viên" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100">
      <div v-for="i in 3" :key="i" class="p-5 flex items-center gap-4">
        <span class="w-12 shrink-0"><FhSkeleton height="48px" rounded="full" /></span>
        <span class="flex-1 space-y-2">
          <FhSkeleton width="40%" height="18px" />
          <FhSkeleton width="70%" height="14px" />
        </span>
      </div>
    </div>

    <div
      v-else-if="loadError"
      class="bg-white rounded-2xl border border-ink-200 p-6 flex flex-col items-center text-center gap-3"
      role="alert"
    >
      <p class="text-sm text-ink-700">{{ loadError }}</p>
      <FhButton v-if="bookingId" variant="secondary" size="sm" @click="loadCandidates">Thử lại</FhButton>
    </div>

    <FhEmptyState
      v-else-if="candidates.length === 0"
      title="Chưa có kỹ thuật viên nhận được giờ hẹn này"
      description="Kỹ thuật viên chỉ nhận đơn trong ca làm và khi còn trống lịch. Hãy đổi sang buổi khác rồi tìm lại."
      action-text="Đổi giờ hẹn"
      @action="router.push(`/app/bookings/${bookingId}`)"
    />

    <div v-else class="space-y-3">
      <div
        v-for="tech in candidates"
        :key="tech.id"
        role="button"
        tabindex="0"
        :aria-pressed="selectedIds.includes(tech.id)"
        class="group p-4 sm:p-5 rounded-2xl border bg-white flex items-center justify-between gap-4 transition-colors cursor-pointer select-none"
        :class="selectedIds.includes(tech.id) ? 'border-brand-600 bg-brand-50/30 ring-2 ring-brand-500/20' : 'border-ink-200 hover:border-ink-300'"
        @click="toggleSelect(tech.id)"
        @keydown.enter.prevent="toggleSelect(tech.id)"
        @keydown.space.prevent="toggleSelect(tech.id)"
      >
        <div class="flex items-center gap-4 min-w-0">
          <input
            type="checkbox"
            :checked="selectedIds.includes(tech.id)"
            :aria-label="`Chọn ${tech.fullName}`"
            data-testid="select-technician-btn"
            class="w-5 h-5 rounded text-brand-600 focus:ring-brand-500 cursor-pointer shrink-0"
            @click.stop
            @change="handleCheckboxChange($event, tech.id)"
          />

          <div class="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-semibold text-base shrink-0 relative">
            {{ tech.fullName.charAt(0) }}
            <span
              v-if="selectedIds.includes(tech.id)"
              class="absolute -top-1 -right-1 w-5 h-5 bg-brand-600 text-white text-xs font-semibold rounded-full flex items-center justify-center border-2 border-white"
            >
              #{{ selectedIds.indexOf(tech.id) + 1 }}
            </span>
            <span
              v-if="tech.isAvailable !== false"
              class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-success-500 border-2 border-white"
              title="Đang hoạt động"
            />
          </div>

          <div class="space-y-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-base text-ink-900">{{ tech.fullName }}</h3>
              <FhStatusPill status="COMPLETED" label="Đã xác thực" />
            </div>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
              <span v-if="tech.reliabilityScore != null" class="whitespace-nowrap">Độ tin cậy <span class="font-num font-medium text-ink-900">{{ tech.reliabilityScore }}%</span></span>
              <span class="flex items-center gap-1 whitespace-nowrap font-num">
                <template v-if="hasRating(tech.averageRating, tech.ratingCount)">
                  <Star :size="14" class="text-warning-500 fill-warning-400" /> {{ ratingLabel(tech.averageRating, tech.ratingCount) }} ({{ tech.ratingCount }})
                </template>
                <template v-else>Chưa có đánh giá</template>
              </span>
              <span class="flex items-center gap-1 whitespace-nowrap">
                <Briefcase :size="14" class="text-ink-400" /> {{ tech.yearsExperience }} năm kinh nghiệm
              </span>
              <span v-if="tech.distanceKm != null" class="flex items-center gap-1 whitespace-nowrap font-num">
                <MapPin :size="14" class="text-ink-400" /> Cách khoảng {{ tech.distanceKm }} km
              </span>
            </div>

            <div v-if="tech.listedLaborPrice" class="text-sm text-ink-600 pt-0.5">
              Giá công tham khảo: <strong class="font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="tech.listedLaborPrice" /></strong>
              <span v-if="tech.typicalWarrantyDays" class="text-ink-500 whitespace-nowrap">
                · bảo hành {{ tech.typicalWarrantyDays }} ngày
              </span>
            </div>
          </div>
        </div>

        <FhButton
          variant="secondary"
          size="sm"
          data-testid="view-profile-btn"
          class="self-start sm:self-center"
          @click.stop="openProfileModal(tech)"
        >
          <Eye :size="14" class="text-ink-500" /> <span class="hidden sm:inline">Xem hồ sơ</span><span class="sm:hidden">Hồ sơ</span>
        </FhButton>
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

    <!-- Success Feedback Modal -->
    <div
      v-if="inviteSent"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-(--shadow-e3)">
        <CheckCircle2 :size="44" class="text-success-600 mx-auto" />
        <h3 class="text-lg font-semibold text-ink-900">Đã gửi lời mời</h3>
        <p class="text-sm text-ink-600 leading-relaxed text-pretty">
          {{ successMessage }}
        </p>
        <FhButton data-testid="view-matching-booking" variant="primary" size="md"
          @click="router.push({ name: 'booking-detail', params: { id: bookingId } })">
          Xem trạng thái yêu cầu
        </FhButton>
      </div>
    </div>

    <!-- Floating Sticky Action Bar -->
    <div class="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] lg:bottom-0 inset-x-0 z-30 bg-white border-t border-ink-200 py-3">
      <div class="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4">
        <div class="text-sm text-ink-600 whitespace-nowrap">
          Đã chọn: <strong class="text-ink-900 font-num">{{ selectedCount }}</strong>/2
        </div>

        <FhButton
          variant="primary"
          size="md"
          :disabled="selectedCount < 1"
          :loading="sending"
          @click="handleSendShortlist"
        >
          <Send :size="15" /> Gửi lời mời
        </FhButton>
      </div>
    </div>
  </div>
</template>
