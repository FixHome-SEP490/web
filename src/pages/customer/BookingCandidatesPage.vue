<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Star,
  MapPin,
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  Send,
  Users,
  Eye,
  X,
  Award,
} from 'lucide-vue-next';
import {
  FhButton,
  FhStatusPill,
  FhMoney,
} from '../../components';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';

const route = useRoute();
const router = useRouter();
const bookingId = route.params.id as string;

const loading = ref(true);
const sending = ref(false);
const candidates = ref<TechnicianCandidate[]>([]);
const selectedIds = ref<string[]>([]);
const inviteSent = ref(false);
const viewedTech = ref<TechnicianCandidate | null>(null);

const matchingMessage = ref('');
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const refreshMatching = async () => {
  if (disposed) return;
  try {
    const booking = await bookingsApi.getBooking(bookingId);
    inviteSent.value = booking.status === 'MATCHING';
    if (booking.status === 'MATCHED' && booking.serviceOrderId) {
      await router.replace('/app/orders/' + booking.serviceOrderId);
      return;
    }
    matchingMessage.value = booking.status === 'MATCHING' ? 'Đang chờ thợ xác nhận. Lời mời được gửi lần lượt.' : booking.status === 'CLOSED' ? 'Chưa có thợ nhận việc. Bạn có thể chọn lại danh sách hoặc đổi lịch.' : booking.status === 'CANCELLED' ? 'Yêu cầu đã hủy.' : '';
  } catch {
    matchingMessage.value = 'Chưa tải được trạng thái. Hệ thống sẽ thử lại.';
  } finally {
    if (!disposed) pollTimer = setTimeout(refreshMatching, 10000);
  }
};
onUnmounted(() => { disposed = true; if (pollTimer) clearTimeout(pollTimer); });
onMounted(async () => {
  try {
    const list = await bookingsApi.getCandidates(bookingId);
    candidates.value = list;
    await refreshMatching();
    // Preselect top 3 by default
    selectedIds.value = list.slice(0, 3).map((c) => c.id);
  } catch {
    matchingMessage.value = 'Không tải được danh sách thợ. Vui lòng tải lại trang.';
  } finally {
    loading.value = false;
  }
});

const toggleSelect = (id: string) => {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  } else {
    if (selectedIds.value.length >= 5) {
      alert('Theo quy định FixHome, bạn chỉ có thể chọn tối đa 5 kỹ thuật viên cho 1 lần ghép thợ.');
      return;
    }
    selectedIds.value.push(id);
  }
};

const handleSendShortlist = async () => {
  if (selectedIds.value.length === 0) {
    alert('Vui lòng chọn ít nhất 1 kỹ thuật viên.');
    return;
  }
  sending.value = true;
  try {
    await bookingsApi.sendShortlist(bookingId, selectedIds.value);
    inviteSent.value = true;
    matchingMessage.value = 'Đang chờ thợ xác nhận. Lời mời được gửi lần lượt.';
  } catch {
    alert('Không thể gửi lời mời. Vui lòng thử lại.');
  } finally {
    sending.value = false;
  }
};

const openTechProfile = (tech: TechnicianCandidate) => {
  viewedTech.value = tech;
};

const closeTechProfile = () => {
  viewedTech.value = null;
};

const selectedCount = computed(() => selectedIds.value.length);
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-24">
    <!-- Header -->
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
          {{ selectedCount }} / 5 thợ
        </span>
      </div>
    </div>

    <!-- Rule Banner (Spec v1.2 Sequential Dispatch ≤5) -->
    <div class="p-3.5 rounded-[var(--radius-sm)] bg-brand-50/70 border border-brand-200 text-brand-900 flex items-start gap-2.5 text-xs">
      <ShieldCheck :size="16" class="text-brand-600 shrink-0 mt-0.5" />
      <div class="leading-relaxed">
        <strong>Cơ chế gửi lời mời tuần tự (Sequential Dispatch Spec v1.2/v1.4):</strong> Hệ thống gửi lời mời lần lượt theo thứ tự ưu tiên của bạn. Thợ có 30 phút để xác nhận. Nếu từ chối hoặc hết giờ, hệ thống sẽ tự động chuyển sang thợ tiếp theo.
      </div>
    </div>

    <p v-if="matchingMessage" role="status" class="p-3 rounded border border-brand-200 text-sm">{{ matchingMessage }}</p>
    <!-- Candidate List -->
    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải danh sách thợ phù hợp...
    </div>

    <div v-else class="space-y-3.5">
      <div
        v-for="tech in candidates"
        :key="tech.id"
        class="p-4 sm:p-5 rounded-[var(--radius-md)] border bg-white shadow-[var(--shadow-e1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all cursor-pointer hover:border-brand-400"
        :class="selectedIds.includes(tech.id) ? 'border-brand-600 ring-2 ring-brand-500/20' : 'border-ink-200 hover:border-ink-300'"
        @click="openTechProfile(tech)"
      >
        <div class="flex items-center gap-4">
          <input
            type="checkbox"
            :checked="selectedIds.includes(tech.id)"
            class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer shrink-0"
            @click.stop
            @change="toggleSelect(tech.id)"
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
              <h3 class="font-bold text-sm text-ink-900 hover:text-brand-600 transition-colors">
                {{ tech.fullName }}
              </h3>
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

        <div class="flex items-center gap-2 w-full sm:w-auto justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-ink-100 shrink-0">
          <button
            type="button"
            class="text-xs font-semibold text-ink-600 hover:text-brand-700 px-2.5 py-1.5 rounded hover:bg-ink-100 flex items-center gap-1"
            @click.stop="openTechProfile(tech)"
          >
            <Eye :size="14" /> Xem hồ sơ
          </button>

          <FhButton
            :variant="selectedIds.includes(tech.id) ? 'primary' : 'secondary'"
            size="sm"
            @click.stop="toggleSelect(tech.id)"
          >
            {{ selectedIds.includes(tech.id) ? `Ưu tiên #${selectedIds.indexOf(tech.id) + 1}` : 'Chọn thợ' }}
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Technician Profile Modal -->
    <div
      v-if="viewedTech"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
      @click.self="closeTechProfile"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
        <div class="flex items-start justify-between border-b border-ink-100 pb-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-lg">
              {{ viewedTech.fullName.charAt(0) }}
            </div>
            <div>
              <h3 class="font-bold text-base text-ink-900">{{ viewedTech.fullName }}</h3>
              <div class="flex items-center gap-1.5 text-xs text-amber-600 font-semibold mt-0.5">
                <Star :size="13" class="fill-amber-400" /> {{ viewedTech.averageRating }} / 5.0 ({{ viewedTech.ratingCount }} đánh giá)
              </div>
            </div>
          </div>
          <button class="text-ink-400 hover:text-ink-600 p-1" @click="closeTechProfile">
            <X :size="20" />
          </button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div class="p-3 bg-brand-50 rounded-lg border border-brand-100">
              <span class="text-brand-600 block text-[11px]">Kinh nghiệm:</span>
              <span class="font-bold text-brand-900 text-sm flex items-center gap-1 mt-0.5">
                <Award :size="14" /> {{ viewedTech.yearsExperience }} năm làm nghề
              </span>
            </div>
            <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <span class="text-emerald-600 block text-[11px]">Điểm tin cậy:</span>
              <span class="font-bold text-emerald-900 text-sm flex items-center gap-1 mt-0.5">
                <ShieldCheck :size="14" /> {{ viewedTech.reliabilityScore ? viewedTech.reliabilityScore + '%' : 'Đang cập nhật' }}
              </span>
            </div>
          </div>

          <div v-if="viewedTech.distanceKm != null" class="p-3 bg-ink-50 rounded border border-ink-200 space-y-1">
            <span class="text-ink-500 font-medium">Khoảng cách:</span>
            <div class="text-ink-900 font-semibold flex items-center gap-2">
              <MapPin :size="14" class="text-brand-600" />
              Cách bạn ~{{ viewedTech.distanceKm }} km
            </div>
          </div>

          <div v-if="viewedTech.listedLaborPrice" class="p-3 bg-ink-50 rounded border border-ink-200 space-y-1">
            <span class="text-ink-500 font-medium">Đơn giá công tham chiếu:</span>
            <div class="text-base font-bold font-num text-brand-700">
              <FhMoney :amount="viewedTech.listedLaborPrice" />
            </div>
            <span v-if="viewedTech.typicalWarrantyDays" class="text-[10px] text-ink-400 block">
              * Cam kết bảo hành kỹ thuật tiêu chuẩn {{ viewedTech.typicalWarrantyDays }} ngày.
            </span>
          </div>

          <div class="text-[11px] text-ink-600 bg-success-50/70 p-2.5 rounded border border-success-200 flex items-center gap-2 text-success-800">
            <CheckCircle2 :size="16" class="shrink-0" />
            <span>Kỹ thuật viên đã được FixHome kiểm tra hồ sơ tư pháp, bằng nghề và phỏng vấn trực tiếp.</span>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-ink-100">
          <FhButton variant="secondary" size="sm" @click="closeTechProfile">
            Đóng
          </FhButton>
          <FhButton
            :variant="selectedIds.includes(viewedTech.id) ? 'secondary' : 'primary'"
            size="sm"
            @click="toggleSelect(viewedTech.id); closeTechProfile()"
          >
            {{ selectedIds.includes(viewedTech.id) ? 'Bỏ chọn thợ này' : 'Chọn thợ vào danh sách' }}
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Floating Sticky Action Bar -->
    <div class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-ink-200 p-3.5 shadow-lg">
      <div class="max-w-4xl mx-auto flex items-center justify-between gap-4 px-4">
        <div class="text-xs text-ink-600">
          Đã chọn <strong class="text-brand-700 font-num text-sm">{{ selectedCount }}</strong> kỹ thuật viên (Tối đa 5)
        </div>

        <FhButton
          variant="primary"
          size="md"
          :disabled="selectedCount === 0 || inviteSent"
          :loading="sending"
          @click="handleSendShortlist"
        >
          <Send :size="15" class="mr-1.5" /> Gửi danh sách ưu tiên
        </FhButton>
      </div>
    </div>
  </div>
</template>
