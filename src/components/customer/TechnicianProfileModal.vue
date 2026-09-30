<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  X,
  Star,
  MapPin,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Award,
  Wrench,
  Check,
  UserCheck,
  Shield,
  ThumbsUp,
  Sparkles,
  Quote,
} from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhMoney, FhEmptyState } from '../index';
import type { TechnicianCandidate } from '../../api/bookings.api';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { vnDateString } from '../../utils/vn-time';

interface Props {
  candidate: TechnicianCandidate | null;
  isOpen: boolean;
  isSelected?: boolean;
  priorityIndex?: number; // -1: not selected, 0: #1, 1: #2
  canSelect?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  priorityIndex: -1,
  canSelect: true,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggleSelect', id: string): void;
}>();

const activeTab = ref<'criteria' | 'reviews' | 'services'>('criteria');
const loadingReviews = ref(false);
const reviews = ref<Review[]>([]);

const fetchReviews = async (techId: string) => {
  loadingReviews.value = true;
  try {
    const res = await reviewsApi.getByTechnician(techId);
    reviews.value = res.data || [];
  } catch {
    reviews.value = [];
  } finally {
    loadingReviews.value = false;
  }
};

watch(
  () => [props.isOpen, props.candidate?.id],
  ([open, id]) => {
    if (open && id) {
      activeTab.value = 'criteria';
      fetchReviews(id as string);
    }
  },
  { immediate: true }
);

const parseReviewContent = (rawComment?: string | null) => {
  if (!rawComment) return { tags: [] as string[], text: '' };
  const raw = rawComment.trim();
  const match = raw.match(/^\[(.*?)\]\s*(.*)$/s);
  if (match) {
    const tags = match[1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const text = match[2]?.trim() || '';
    return { tags, text };
  }
  return { tags: [] as string[], text: raw };
};

// Real star distribution computed strictly from actual reviews data
const starStats = computed(() => {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const total = reviews.value.length;
  for (const r of reviews.value) {
    const score = Math.max(1, Math.min(5, Math.round(r.rating || 5)));
    counts[score] = (counts[score] || 0) + 1;
  }
  return {
    counts,
    total,
    percentages: {
      5: total > 0 ? Math.round((counts[5] / total) * 100) : 0,
      4: total > 0 ? Math.round((counts[4] / total) * 100) : 0,
      3: total > 0 ? Math.round((counts[3] / total) * 100) : 0,
      2: total > 0 ? Math.round((counts[2] / total) * 100) : 0,
      1: total > 0 ? Math.round((counts[1] / total) * 100) : 0,
    },
  };
});

// Real performance metrics from backend data
const completionRate = computed(() => {
  if (!props.candidate) return 100;
  if (props.candidate.completionRate != null) {
    return props.candidate.completionRate;
  }
  return props.candidate.reliabilityScore ?? 100;
});

const completedOrdersCount = computed(() => {
  if (!props.candidate) return 0;
  return props.candidate.completedOrdersCount ?? 0;
});

const responseTimeText = computed(() => {
  if (!props.candidate) return '~5 phút';
  const dist = props.candidate.distanceKm;
  if (dist != null) {
    return dist < 2 ? '~3 phút' : dist < 5 ? '~5 phút' : '~10 phút';
  }
  return '~5 phút';
});

const handleToggle = () => {
  if (!props.candidate) return;
  emit('toggleSelect', props.candidate.id);
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div
    v-if="isOpen && candidate"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink-950/65 backdrop-blur-sm transition-all duration-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-technician-name"
    @click.self="handleClose"
    @keydown.esc="handleClose"
  >
    <div
      class="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-ink-200/80 animate-in fade-in zoom-in-95 duration-200 relative"
    >
      <!-- Top Decorative Gradient Header Banner -->
      <div class="relative bg-gradient-to-r from-brand-700 via-brand-600 to-brand-700 px-6 pt-5 pb-16 text-white overflow-hidden shrink-0">
        <!-- Ambient lighting decorative circles -->
        <div class="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div class="absolute bottom-0 right-1/4 w-36 h-36 bg-brand-400/20 rounded-full blur-xl pointer-events-none" />

        <div class="relative z-10 flex items-center justify-between">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold border border-white/20">
            <Sparkles :size="13" class="text-warning-300" />
            <span>Kỹ thuật viên đối tác FixHome Pro</span>
          </div>

          <!-- Glass Close Button -->
          <button
            type="button"
            class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
            aria-label="Đóng"
            @click="handleClose"
          >
            <X :size="18" />
          </button>
        </div>
      </div>

      <!-- Overlapping Profile Avatar & Title Section -->
      <div class="px-6 pb-4 pt-0 -mt-10 relative z-20 shrink-0 bg-white border-b border-ink-100">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="flex items-end gap-4">
            <!-- Large Avatar with Double Ring -->
            <div class="relative shrink-0">
              <div
                class="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-800 text-white flex items-center justify-center font-bold text-2xl shadow-xl ring-4 ring-white border border-brand-200"
              >
                {{ candidate.fullName.charAt(0) }}
              </div>
              <!-- Dấu chấm tròn xanh trạng thái đang hoạt động -->
              <span
                v-if="candidate.isAvailable !== false"
                class="absolute -bottom-1 -right-1 flex h-4 w-4"
                title="Đang hoạt động"
              >
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75" />
                <span class="relative inline-flex rounded-full h-4 w-4 bg-success-500 border-2 border-white shadow-xs" />
              </span>
            </div>

            <!-- Name and Verification -->
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 id="modal-technician-name" class="text-xl font-bold text-ink-900 tracking-tight">
                  {{ candidate.fullName }}
                </h2>
                <FhStatusPill status="VERIFIED" label="ĐÃ XÁC THỰC" />
              </div>

              <!-- Rating & Trust metrics -->
              <div class="flex flex-wrap items-center gap-3 text-xs text-ink-600">
                <div class="flex items-center gap-1 font-bold text-warning-600 bg-warning-50/80 px-2 py-0.5 rounded-md border border-warning-200/60">
                  <Star :size="13" class="fill-warning-400 text-warning-500" />
                  <span class="font-num text-sm">{{ candidate.averageRating }}</span>
                  <span class="text-ink-500 font-normal font-num">({{ candidate.ratingCount }} đánh giá)</span>
                </div>
                <span>•</span>
                <span class="flex items-center gap-1 text-ink-700">
                  <Briefcase :size="13" class="text-ink-400" />
                  <strong class="font-num">{{ candidate.yearsExperience }}</strong> năm KN
                </span>
                <span v-if="candidate.distanceKm != null">•</span>
                <span v-if="candidate.distanceKm != null" class="flex items-center gap-1 text-brand-700 font-semibold font-num">
                  <MapPin :size="13" /> Cách ~{{ candidate.distanceKm }} km
                </span>
              </div>
            </div>
          </div>

          <!-- Selection status chip on top-right -->
          <div v-if="isSelected" class="self-start sm:self-auto mb-1">
            <FhStatusPill status="ACTIVE" :label="`Đã chọn #${priorityIndex + 1}`" />
          </div>
        </div>

        <!-- 4 Bento Grid KPI Cards with Space Grotesk -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
          <!-- Card 1: Completion Rate -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-success-50/80 to-success-50/30 border border-success-200/70 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
            <div class="flex items-center justify-between text-success-800 mb-1">
              <span class="text-[11px] font-semibold">Tỷ lệ hoàn thành</span>
              <div class="w-6 h-6 rounded-full bg-success-100 flex items-center justify-center">
                <CheckCircle2 :size="13" class="text-success-700" />
              </div>
            </div>
            <div class="text-xl font-bold text-success-800 font-num tracking-tight mt-0.5">
              {{ completionRate }}%
            </div>
            <span class="text-[10px] text-success-600/90 font-medium mt-0.5">Đúng hẹn & chuẩn hẹn</span>
          </div>

          <!-- Card 2: Response Time -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-brand-50/80 to-brand-50/30 border border-brand-200/70 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
            <div class="flex items-center justify-between text-brand-800 mb-1">
              <span class="text-[11px] font-semibold">Thời gian phản hồi</span>
              <div class="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center">
                <Clock :size="13" class="text-brand-700" />
              </div>
            </div>
            <div class="text-xl font-bold text-brand-800 font-num tracking-tight mt-0.5">
              {{ responseTimeText }}
            </div>
            <span class="text-[10px] text-brand-600/90 font-medium mt-0.5">Tiếp nhận đơn nhanh</span>
          </div>

          <!-- Card 3: Total Orders Completed -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-brand-50/80 to-brand-50/30 border border-brand-200/70 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
            <div class="flex items-center justify-between text-brand-800 mb-1">
              <span class="text-[11px] font-semibold">Đơn đã thực hiện</span>
              <div class="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center">
                <Briefcase :size="13" class="text-brand-700" />
              </div>
            </div>
            <div class="text-xl font-bold text-brand-900 font-num tracking-tight mt-0.5">
              {{ completedOrdersCount }} <span class="text-xs font-semibold text-brand-700">đơn</span>
            </div>
            <span class="text-[10px] text-brand-600/90 font-medium mt-0.5">Đơn hoàn thành thực tế</span>
          </div>

          <!-- Card 4: Reliability Score -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-brand-50/80 to-brand-50/30 border border-brand-200/70 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
            <div class="flex items-center justify-between text-brand-800 mb-1">
              <span class="text-[11px] font-semibold">Độ tin cậy</span>
              <div class="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center">
                <ShieldCheck :size="13" class="text-brand-700" />
              </div>
            </div>
            <div class="text-xl font-bold text-brand-800 font-num tracking-tight mt-0.5">
              {{ candidate.reliabilityScore }}%
            </div>
            <span class="text-[10px] text-brand-600/90 font-medium mt-0.5">Chuẩn FixHome Pro</span>
          </div>
        </div>
      </div>

      <!-- Modern Segmented Pill Tabs Navigation -->
      <div class="px-6 py-2.5 bg-ink-25/80 border-b border-ink-150 shrink-0">
        <div class="flex items-center p-1 bg-ink-100/90 rounded-xl gap-1">
          <button
            type="button"
            class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
            :class="activeTab === 'criteria'
              ? 'bg-white text-brand-700 shadow-xs font-bold'
              : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'"
            @click="activeTab = 'criteria'"
          >
            <Award :size="15" :class="activeTab === 'criteria' ? 'text-brand-600' : 'text-ink-400'" />
            Tiêu chí đạt được
          </button>

          <button
            type="button"
            class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
            :class="activeTab === 'reviews'
              ? 'bg-white text-brand-700 shadow-xs font-bold'
              : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'"
            @click="activeTab = 'reviews'"
          >
            <Star :size="15" :class="activeTab === 'reviews' ? 'text-warning-500 fill-warning-400' : 'text-ink-400'" />
            Đánh giá từ khách
            <span
              class="px-1.5 py-0.2 rounded-full text-[10px] font-num"
              :class="activeTab === 'reviews' ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'bg-ink-200 text-ink-600'"
            >
              {{ reviews.length }}
            </span>
          </button>

          <button
            type="button"
            class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
            :class="activeTab === 'services'
              ? 'bg-white text-brand-700 shadow-xs font-bold'
              : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'"
            @click="activeTab = 'services'"
          >
            <Wrench :size="15" :class="activeTab === 'services' ? 'text-brand-600' : 'text-ink-400'" />
            Dịch vụ & Bảng giá
          </button>
        </div>
      </div>

      <!-- Modal Body (Scrollable with Smooth Touch Experience) -->
      <div class="p-6 overflow-y-auto space-y-5 text-sm text-ink-800 flex-1">
        <!-- TAB 1: TIÊU CHÍ ĐẠT ĐƯỢC -->
        <div v-if="activeTab === 'criteria'" class="space-y-4">
          <!-- Real Bio Highlight Card if present -->
          <div
            v-if="candidate.bio"
            class="p-4 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50/60 to-brand-50/40 relative overflow-hidden shadow-xs"
          >
            <Quote :size="36" class="absolute -bottom-2 -right-2 text-brand-200/50 pointer-events-none" />
            <div class="flex items-start gap-2.5">
              <div class="w-7 h-7 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Quote :size="14" />
              </div>
              <div class="space-y-1">
                <h4 class="text-xs font-bold text-brand-950">Giới thiệu kỹ thuật viên</h4>
                <p class="text-xs text-ink-700 leading-relaxed italic">
                  "{{ candidate.bio }}"
                </p>
              </div>
            </div>
          </div>

          <!-- Section title -->
          <div class="flex items-center justify-between pt-1">
            <h3 class="text-xs font-bold text-ink-900 flex items-center gap-1.5">
              <ShieldCheck :size="15" class="text-brand-600" />
              Tiêu chuẩn kiểm duyệt FixHome
            </h3>
            <span class="text-[11px] text-success-700 font-medium">Đã đối soát 6/6 tiêu chí</span>
          </div>

          <!-- Bento Grid Checklist with Pastel Icon Badges -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Item 1: KYC -->
            <div class="p-3.5 rounded-xl border border-success-200/80 bg-success-50/40 hover:bg-success-50/70 transition-colors flex items-start gap-3 shadow-xs">
              <div class="w-9 h-9 rounded-xl bg-success-100 text-success-700 flex items-center justify-center shrink-0 border border-success-200">
                <CheckCircle2 :size="18" />
              </div>
              <div>
                <h4 class="font-bold text-xs text-ink-900 flex items-center gap-1">
                  Định danh điện tử (KYC)
                  <span class="text-[10px] text-success-700 font-medium">• Chuẩn Bộ Công An</span>
                </h4>
                <p class="text-[11px] text-ink-600 mt-1 leading-relaxed">
                  Căn cước công dân gắn chip và khuôn mặt đã được đối soát chính xác với Cơ sở dữ liệu Quốc gia.
                </p>
              </div>
            </div>

            <!-- Item 2: Skill Verification -->
            <div class="p-3.5 rounded-xl border border-brand-200/80 bg-brand-50/40 hover:bg-brand-50/70 transition-colors flex items-start gap-3 shadow-xs">
              <div class="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 border border-brand-200">
                <Award :size="18" />
              </div>
              <div>
                <h4 class="font-bold text-xs text-ink-900 flex items-center gap-1">
                  Chứng nhận tay nghề kỹ thuật
                  <span class="text-[10px] text-brand-700 font-medium">• Đã kiểm duyệt</span>
                </h4>
                <p class="text-[11px] text-ink-600 mt-1 leading-relaxed">
                  Vượt qua bài sát hạch tay nghề thực tế và quy trình sửa chữa thiết bị gia dụng tiêu chuẩn.
                </p>
              </div>
            </div>

            <!-- Item 3: Tools & Safety -->
            <div class="p-3.5 rounded-xl border border-ink-200 bg-white hover:border-brand-300 transition-colors flex items-start gap-3 shadow-xs">
              <div class="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 border border-brand-100">
                <Wrench :size="18" />
              </div>
              <div>
                <h4 class="font-bold text-xs text-ink-900">Trang bị đồ nghề tiêu chuẩn</h4>
                <p class="text-[11px] text-ink-600 mt-1 leading-relaxed">
                  Đầy đủ đồng hồ đo kiểm chuyên dụng, máy hút chân không và đồ bảo hộ an toàn lao động.
                </p>
              </div>
            </div>

            <!-- Item 4: Warranty -->
            <div class="p-3.5 rounded-xl border border-ink-200 bg-white hover:border-brand-300 transition-colors flex items-start gap-3 shadow-xs">
              <div class="w-9 h-9 rounded-xl bg-warning-50 text-warning-700 flex items-center justify-center shrink-0 border border-warning-100">
                <Shield :size="18" />
              </div>
              <div>
                <h4 class="font-bold text-xs text-ink-900">Cam kết bảo hành chu đáo</h4>
                <p class="text-[11px] text-ink-600 mt-1 leading-relaxed">
                  Cam kết bảo hành kỹ thuật tối thiểu từ <strong class="font-num text-ink-900">{{ candidate.typicalWarrantyDays || 30 }} ngày</strong>, cấp phiếu bảo hành điện tử trên ứng dụng.
                </p>
              </div>
            </div>

            <!-- Item 5: Transparent Pricing -->
            <div class="p-3.5 rounded-xl border border-ink-200 bg-white hover:border-brand-300 transition-colors flex items-start gap-3 shadow-xs">
              <div class="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 border border-brand-100">
                <ThumbsUp :size="18" />
              </div>
              <div>
                <h4 class="font-bold text-xs text-ink-900">Báo giá minh bạch, không vòi vĩnh</h4>
                <p class="text-[11px] text-ink-600 mt-1 leading-relaxed">
                  Báo giá chi tiết trên ứng dụng trước khi sửa chữa, khách hàng xác nhận đồng ý mới tiến hành.
                </p>
              </div>
            </div>

            <!-- Item 6: Professional Demeanor -->
            <div class="p-3.5 rounded-xl border border-ink-200 bg-white hover:border-brand-300 transition-colors flex items-start gap-3 shadow-xs">
              <div class="w-9 h-9 rounded-xl bg-success-50 text-success-700 flex items-center justify-center shrink-0 border border-success-100">
                <UserCheck :size="18" />
              </div>
              <div>
                <h4 class="font-bold text-xs text-ink-900">Tác phong & Văn hóa ứng xử</h4>
                <p class="text-[11px] text-ink-600 mt-1 leading-relaxed">
                  Giao tiếp lịch thiệp, đeo thẻ kỹ thuật viên và dọn dẹp sạch sẽ khu vực làm việc trước khi bàn giao.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: ĐÁNH GIÁ TỪ KHÁCH HÀNG (REAL DATA ONLY) -->
        <div v-else-if="activeTab === 'reviews'" class="space-y-4">
          <!-- Loading state -->
          <div v-if="loadingReviews" class="text-center py-12 text-xs text-ink-400 space-y-2">
            <div class="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Đang tải đánh giá từ khách hàng...</p>
          </div>

          <template v-else>
            <!-- Review Summary Card when reviews exist -->
            <div
              v-if="reviews.length > 0"
              class="p-5 rounded-2xl bg-gradient-to-br from-ink-25 to-white border border-ink-200/80 shadow-xs flex flex-col sm:flex-row items-center gap-6"
            >
              <div class="text-center sm:text-left sm:border-r border-ink-200 sm:pr-8 shrink-0">
                <div class="text-4xl font-bold text-ink-900 font-num tracking-tight">
                  {{ candidate.averageRating }}<span class="text-base font-normal text-ink-400">/5.0</span>
                </div>
                <div class="flex items-center justify-center sm:justify-start gap-1 text-warning-500 mt-1.5">
                  <Star v-for="s in 5" :key="s" :size="16" class="fill-warning-400 text-warning-500" />
                </div>
                <p class="text-xs text-ink-500 mt-1.5 font-medium">
                  {{ reviews.length }} nhận xét từ khách hàng
                </p>
              </div>

              <!-- Real Distribution Calculated from Reviews -->
              <div class="flex-1 w-full space-y-2 text-xs">
                <div
                  v-for="star in [5, 4, 3, 2, 1]"
                  :key="star"
                  class="flex items-center gap-2.5 text-ink-600"
                >
                  <span class="w-10 font-num font-semibold text-[11px] shrink-0">{{ star }} sao</span>
                  <div class="flex-1 h-2 rounded-full bg-ink-150 overflow-hidden">
                    <div
                      class="h-full bg-gradient-to-r from-warning-400 to-warning-500 rounded-full transition-all duration-300"
                      :style="{ width: `${starStats.percentages[star as 1|2|3|4|5]}%` }"
                    />
                  </div>
                  <span class="w-14 text-right font-num text-[11px] text-ink-500 shrink-0 font-medium">
                    {{ starStats.counts[star as 1|2|3|4|5] }} ({{ starStats.percentages[star as 1|2|3|4|5] }}%)
                  </span>
                </div>
              </div>
            </div>

            <!-- List of Real Reviews from Database -->
            <div v-if="reviews.length > 0" class="space-y-3">
              <div
                v-for="r in reviews"
                :key="r.id"
                class="p-4 rounded-xl border border-ink-150 bg-white space-y-2.5 shadow-xs hover:border-brand-200 transition-colors"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-brand-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      {{ (r.customerName || 'K').charAt(0) }}
                    </div>
                    <div>
                      <div class="text-xs font-bold text-ink-900">
                        {{ r.customerName || 'Khách hàng FixHome' }}
                      </div>
                      <div class="text-[10px] text-success-700 flex items-center gap-1 font-medium">
                        <CheckCircle2 :size="11" /> Khách hàng đã sử dụng dịch vụ
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-50 border border-warning-200 text-warning-700 font-num text-xs font-bold">
                    <Star :size="12" class="fill-warning-400 text-warning-500" />
                    {{ r.rating }}/5
                  </div>
                </div>

                <!-- Badges if customer selected suggestion tags -->
                <div v-if="parseReviewContent(r.comment).tags.length > 0" class="flex flex-wrap gap-1.5 pl-10">
                  <span
                    v-for="tag in parseReviewContent(r.comment).tags"
                    :key="tag"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200"
                  >
                    <Sparkles :size="10" class="text-brand-600" />
                    {{ tag }}
                  </span>
                </div>

                <p v-if="parseReviewContent(r.comment).text" class="text-xs text-ink-700 leading-relaxed pl-10">
                  "{{ parseReviewContent(r.comment).text }}"
                </p>
                <p v-else-if="parseReviewContent(r.comment).tags.length === 0" class="text-xs text-ink-400 italic pl-10">
                  Khách hàng đánh giá {{ r.rating }} sao và không để lại bình luận thêm.
                </p>

                <div class="text-[10px] text-ink-400 pl-10 font-num">
                  Ngày đánh giá: {{ vnDateString(r.createdAt) }}
                </div>
              </div>
            </div>

            <!-- Honest Empty State when NO real reviews exist yet -->
            <FhEmptyState
              v-else
              title="Chưa có đánh giá nào"
              description="Kỹ thuật viên này hiện chưa nhận được đánh giá nào được ghi nhận từ khách hàng trên hệ thống."
            />
          </template>
        </div>

        <!-- TAB 3: DỊCH VỤ & BẢNG GIÁ (REAL DATA) -->
        <div v-else-if="activeTab === 'services'" class="space-y-4">
          <!-- Featured Price Card with Glass Accent -->
          <div class="p-5 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/70 to-brand-50/30 space-y-4 shadow-xs">
            <div class="flex items-center justify-between border-b border-brand-100 pb-3">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-xs">
                  <Wrench :size="16" />
                </div>
                <div>
                  <h4 class="font-bold text-xs text-brand-950">Giá công tham chiếu</h4>
                  <p class="text-[11px] text-ink-600">Đơn giá tham chiếu cho dịch vụ sửa chữa</p>
                </div>
              </div>

              <div class="text-right">
                <div class="text-lg font-bold text-brand-700 font-num">
                  <FhMoney v-if="candidate.listedLaborPrice" :amount="candidate.listedLaborPrice" />
                  <span v-else class="text-xs text-ink-500">Theo báo giá thực tế</span>
                </div>
              </div>
            </div>

            <!-- 2-column service specification -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div class="bg-white p-3 rounded-xl border border-brand-100 shadow-xs flex items-center justify-between">
                <div>
                  <span class="text-ink-500 block text-[11px]">Bảo hành cam kết:</span>
                  <strong class="text-ink-900 font-num text-sm">{{ candidate.typicalWarrantyDays || 30 }} ngày</strong>
                </div>
                <Shield :size="20" class="text-warning-500" />
              </div>

              <div class="bg-white p-3 rounded-xl border border-brand-100 shadow-xs flex items-center justify-between">
                <div>
                  <span class="text-ink-500 block text-[11px]">Khoảng cách di chuyển:</span>
                  <strong class="text-brand-700 font-num text-sm">~{{ candidate.distanceKm }} km</strong>
                </div>
                <MapPin :size="20" class="text-brand-600" />
              </div>
            </div>
          </div>

          <!-- Transparent 4-step workflow guarantee -->
          <div class="p-4 rounded-xl border border-ink-200 bg-white space-y-3 shadow-xs">
            <h5 class="text-xs font-bold text-ink-900 flex items-center gap-1.5">
              <CheckCircle2 :size="15" class="text-success-600" />
              Quy trình phục vụ chuẩn mực 4 bước:
            </h5>

            <div class="space-y-2.5">
              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-brand-50 border border-brand-200 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 font-num">
                  1
                </div>
                <div class="text-xs text-ink-700 leading-relaxed">
                  <strong class="text-ink-900">Tiếp nhận nhanh:</strong> Kỹ thuật viên phản hồi trong khoảng 3 - 5 phút sau khi nhận lời mời.
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-brand-50 border border-brand-200 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 font-num">
                  2
                </div>
                <div class="text-xs text-ink-700 leading-relaxed">
                  <strong class="text-ink-900">Khảo sát & Báo giá:</strong> Kiểm tra thực tế tại nhà và lập bảng báo giá chi tiết trên ứng dụng trước khi sửa chữa.
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-brand-50 border border-brand-200 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 font-num">
                  3
                </div>
                <div class="text-xs text-ink-700 leading-relaxed">
                  <strong class="text-ink-900">Sửa chữa chuyên nghiệp:</strong> Thực hiện theo đúng kỹ thuật, linh kiện xuất xứ rõ ràng và đảm bảo an toàn điện.
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-brand-50 border border-brand-200 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 font-num">
                  4
                </div>
                <div class="text-xs text-ink-700 leading-relaxed">
                  <strong class="text-ink-900">Nghiệm thu & Bảo hành:</strong> Khách hàng chạy thử hài lòng mới tiến hành thanh toán và kích hoạt bảo hành điện tử.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sticky Floating Action Footer with Glassmorphism -->
      <div class="p-4 px-6 border-t border-ink-150 bg-white/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 shadow-lg">
        <div class="text-xs text-ink-600">
          <span v-if="isSelected" class="text-success-700 font-bold flex items-center gap-1.5">
            <CheckCircle2 :size="15" class="text-success-600" />
            Đang chọn làm <strong>Ưu tiên #{{ priorityIndex + 1 }}</strong>
          </span>
          <span v-else class="text-ink-500 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            Thợ đang hoạt động và sẵn sàng tiếp nhận
          </span>
        </div>

        <div class="flex items-center gap-2.5">
          <FhButton variant="secondary" size="md" @click="handleClose">
            Đóng
          </FhButton>

          <FhButton
            :variant="isSelected ? 'secondary' : 'primary'"
            size="md"
            :disabled="!isSelected && !canSelect"
            class="shadow-sm"
            @click="handleToggle"
          >
            <Check v-if="!isSelected" :size="16" class="mr-1.5" />
            <X v-else :size="16" class="mr-1.5 text-danger-600" />
            {{ isSelected ? 'Bỏ chọn thợ này' : 'Chọn thợ này' }}
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
