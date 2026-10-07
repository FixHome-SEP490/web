<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Star,
  MapPin,
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  Send,
  Users,
  ArrowLeft,
  Eye,
  Check,
} from 'lucide-vue-next';
import {
  FhButton,
  FhStatusPill,
  FhEmptyState,
  FhMoney,
  TechnicianProfileModal,
} from '../../components';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';
import { hasRating, ratingLabel } from '../../utils/formatters';

const route = useRoute();
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
    <!-- Header -->
    <div class="space-y-4">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900 transition-colors"
        @click="router.back()"
      >
        <ArrowLeft :size="16" /> Quay lại
      </button>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
            <Users class="text-brand-600" :size="24" />
            Kỹ thuật viên phù hợp gần bạn
          </h1>
          <p class="text-sm text-ink-500 mt-1 text-pretty">
            Các kỹ thuật viên làm đúng dịch vụ bạn cần, còn trống lịch và ở gần địa chỉ của bạn.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm text-ink-600">Đã chọn:</span>
          <span class="text-sm font-semibold font-num whitespace-nowrap px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            {{ selectedCount }} / 2 thợ
          </span>
        </div>
      </div>
    </div>

    <!-- Customer-ranked invitations: only the first technician is notified initially. -->
    <div class="p-3.5 rounded-2xl bg-warning-50 border border-warning-200 text-warning-900 flex items-start gap-2.5 text-sm">
      <ShieldCheck :size="16" class="text-warning-700 shrink-0 mt-0.5" />
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
    <div v-if="loading" role="status" class="text-center py-16 text-sm text-ink-500">
      Đang tải danh sách kỹ thuật viên…
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ loadError }}</span>
      <button v-if="bookingId" class="font-semibold underline" type="button" @click="loadCandidates">Thử lại</button>
    </div>

    <FhEmptyState
      v-else-if="candidates.length === 0"
      title="Chưa có kỹ thuật viên nhận được giờ hẹn này"
      description="Kỹ thuật viên chỉ nhận đơn trong ca làm việc của mình và khi còn trống lịch. Thường là do giờ hẹn rơi vào tối muộn hoặc ban đêm; bạn hãy đổi sang giờ khác rồi tìm lại."
      action-text="Đổi giờ hẹn"
      @action="router.push(`/app/bookings/${bookingId}`)"
    />

    <div v-else class="space-y-3.5">
      <div
        v-for="tech in candidates"
        :key="tech.id"
        role="button"
        tabindex="0"
        :aria-pressed="selectedIds.includes(tech.id)"
        class="group p-4 sm:p-5 rounded-2xl border bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors cursor-pointer select-none"
        :class="selectedIds.includes(tech.id) ? 'border-brand-600 bg-brand-50/30 ring-2 ring-brand-500/20' : 'border-ink-200 hover:border-ink-300'"
        @click="toggleSelect(tech.id)"
        @keydown.enter.prevent="toggleSelect(tech.id)"
        @keydown.space.prevent="toggleSelect(tech.id)"
      >
        <div class="flex items-center gap-4 min-w-0">
          <input
            type="checkbox"
            :checked="selectedIds.includes(tech.id)"
            class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
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

        <div class="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-ink-100">
          <div class="text-right hidden sm:block mr-1">
            <div class="text-xs text-ink-500 whitespace-nowrap">Độ tin cậy</div>
            <div class="text-sm font-semibold text-ink-900 font-num">{{ tech.reliabilityScore != null ? `${tech.reliabilityScore}%` : '—' }}</div>
          </div>

          <!-- Nút Xem thông tin thợ -->
          <FhButton
            variant="secondary"
            size="sm"
            data-testid="view-profile-btn"
            @click.stop="openProfileModal(tech)"
          >
            <Eye :size="14" class="text-ink-500" /> Xem hồ sơ
          </FhButton>

          <!-- Nút Chọn thợ -->
          <FhButton
            :variant="selectedIds.includes(tech.id) ? 'primary' : 'secondary'"
            size="sm"
            data-testid="select-technician-btn"
            @click.stop="toggleSelect(tech.id)"
          >
            <Check v-if="selectedIds.includes(tech.id)" :size="14" class="mr-1" />
            {{ selectedIds.includes(tech.id) ? `Ưu tiên #${selectedIds.indexOf(tech.id) + 1}` : 'Chọn thợ' }}
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
        <div class="text-sm text-ink-600">
          Đã chọn <strong class="text-ink-900 font-num">{{ selectedCount }}</strong>/2 kỹ thuật viên
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
