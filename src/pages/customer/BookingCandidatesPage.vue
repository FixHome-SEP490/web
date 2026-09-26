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
} from 'lucide-vue-next';
import {
  FhButton,
  FhStatusPill,
  FhEmptyState,
  FhMoney,
} from '../../components';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';

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
  <div class="max-w-4xl mx-auto space-y-6 pb-20">
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
            Kỹ thuật viên Phù hợp gần bạn
          </h1>
          <p class="text-xs text-ink-500 mt-1">
            Hệ thống đã lọc danh sách thợ có tay nghề phù hợp, đang rảnh lịch và ở cự ly gần nhất.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-ink-600">Shortlist:</span>
          <span class="text-xs font-bold font-num px-2.5 py-1 rounded bg-brand-50 text-brand-700 border border-brand-200">
            {{ selectedCount }} / 2 thợ
          </span>
        </div>
      </div>
    </div>

    <!-- Customer-ranked invitations: only the first technician is notified initially. -->
    <div class="p-3.5 rounded-[var(--radius-sm)] bg-brand-50/70 border border-brand-200 text-brand-900 flex items-start gap-2.5 text-xs">
      <ShieldCheck :size="16" class="text-brand-600 shrink-0 mt-0.5" />
      <div class="leading-relaxed">
        <strong>Chọn 1 hoặc 2 thợ theo thứ tự ưu tiên:</strong> Nếu chọn 1 người, hệ thống mời người đó ngay. Nếu chọn 2 người, thợ số 1 được mời trước và thợ số 2 ở trạng thái dự phòng.
      </div>
    </div>

    <!-- Send/select error banner -->
    <div
      v-if="sendError"
      class="p-3.5 rounded-[var(--radius-sm)] bg-danger-50 border border-danger-200 text-danger-800 text-xs font-medium"
    >
      {{ sendError }}
    </div>

    <!-- Candidate List -->
    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải danh sách thợ phù hợp...
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ loadError }}</span>
      <button v-if="bookingId" class="font-semibold underline" type="button" @click="loadCandidates">Thử lại</button>
    </div>

    <FhEmptyState
      v-else-if="candidates.length === 0"
      title="Chưa tìm thấy kỹ thuật viên phù hợp"
      description="Hiện chưa có thợ nào đang rảnh lịch và đúng khu vực cho yêu cầu này. Bạn có thể thử lại sau ít phút."
      action-text="Tải lại danh sách"
      @action="loadCandidates"
    />

    <div v-else class="space-y-3.5">
      <div
        v-for="tech in candidates"
        :key="tech.id"
        class="p-4 sm:p-5 rounded-[var(--radius-md)] border bg-white shadow-[var(--shadow-e1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
        :class="selectedIds.includes(tech.id) ? 'border-brand-600 ring-2 ring-brand-500/20' : 'border-ink-200 hover:border-ink-300'"
      >
        <div class="flex items-center gap-4">
          <input
            type="checkbox"
            :checked="selectedIds.includes(tech.id)"
            class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
            @change="handleCheckboxChange($event, tech.id)"
          />

          <div class="w-12 h-12 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-sm relative">
            {{ tech.fullName.charAt(0) }}
            <span
              v-if="selectedIds.includes(tech.id)"
              class="absolute -top-1 -right-1 w-5 h-5 bg-brand-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white"
            >
              #{{ selectedIds.indexOf(tech.id) + 1 }}
            </span>
          </div>

          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-sm text-ink-900">{{ tech.fullName }}</h3>
              <FhStatusPill status="COMPLETED" label="ĐÃ XÁC THỰC" />
            </div>

            <div class="flex flex-wrap items-center gap-3 text-xs text-ink-500">
              <span class="flex items-center gap-1 font-semibold text-amber-600">
                <Star :size="13" class="fill-amber-400" /> {{ tech.averageRating }} ({{ tech.ratingCount }})
              </span>
              <span>•</span>
              <span class="flex items-center gap-1">
                <Briefcase :size="13" class="text-ink-400" /> {{ tech.yearsExperience }} năm KN
              </span>
              <span v-if="tech.distanceKm != null">•</span>
              <span v-if="tech.distanceKm != null" class="flex items-center gap-1 text-brand-700 font-semibold font-num">
                <MapPin :size="13" /> Cách ~{{ tech.distanceKm }} km
              </span>
            </div>

            <div v-if="tech.listedLaborPrice" class="text-[11px] text-brand-800 font-medium pt-0.5">
              Giá công tham chiếu: <strong class="font-num font-bold text-brand-900"><FhMoney :amount="tech.listedLaborPrice" /></strong>
              <span v-if="tech.typicalWarrantyDays" class="text-ink-500 text-[10px] ml-1.5">
                (BH cam kết {{ tech.typicalWarrantyDays }} ngày)
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 w-full sm:w-auto justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-ink-100">
          <div class="text-right hidden sm:block">
            <div class="text-[11px] text-ink-400">Độ tin cậy:</div>
            <div class="text-xs font-bold text-success-600 font-num">{{ tech.reliabilityScore }}%</div>
          </div>

          <FhButton
            :variant="selectedIds.includes(tech.id) ? 'primary' : 'secondary'"
            size="sm"
            @click="toggleSelect(tech.id)"
          >
            {{ selectedIds.includes(tech.id) ? `Ưu tiên #${selectedIds.indexOf(tech.id) + 1}` : 'Chọn thợ' }}
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Success Feedback Modal -->
    <div
      v-if="inviteSent"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
        <CheckCircle2 :size="48" class="text-success-600 mx-auto" />
        <h3 class="text-lg font-bold text-ink-900">Đã gửi lời mời thành công!</h3>
        <p class="text-xs text-ink-600 leading-relaxed">
          {{ successMessage }}
        </p>
        <FhButton data-testid="view-matching-booking" variant="primary" size="md"
          @click="router.push({ name: 'booking-detail', params: { id: bookingId } })">
          Xem trạng thái yêu cầu
        </FhButton>
      </div>
    </div>

    <!-- Floating Sticky Action Bar -->
    <div class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-ink-200 p-3.5 shadow-lg">
      <div class="max-w-4xl mx-auto flex items-center justify-between gap-4 px-4">
        <div class="text-xs text-ink-600">
          Đã chọn <strong class="text-brand-700 font-num text-sm">{{ selectedCount }}</strong> kỹ thuật viên (chọn 1 hoặc 2)
        </div>

        <FhButton
          variant="primary"
          size="md"
          :disabled="selectedCount < 1"
          :loading="sending"
          @click="handleSendShortlist"
        >
          <Send :size="15" class="mr-1.5" /> Mời {{ selectedCount }} kỹ thuật viên
        </FhButton>
      </div>
    </div>
  </div>
</template>
