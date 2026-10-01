<script setup lang="ts">
// Technician profile shown while the customer picks candidates. Everything here
// comes from the candidate record or the technician's published reviews; the
// matching query only returns technicians whose profile and skill for this
// service FixHome has verified, which is what "Đã xác thực" refers to.
import { ref, computed, watch } from 'vue';
import { X, Star, MapPin, Briefcase, ShieldCheck, CheckCircle2, Check, Wrench, ClipboardCheck } from 'lucide-vue-next';
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

const activeTab = ref<'about' | 'reviews'>('about');
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
      activeTab.value = 'about';
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
    return { tags, text: match[2]?.trim() || '' };
  }
  return { tags: [] as string[], text: raw };
};

// Star distribution from the reviews actually loaded.
const starStats = computed(() => {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of reviews.value) {
    const score = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
    counts[score] = (counts[score] || 0) + 1;
  }
  const total = reviews.value.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return { counts, total, pct };
});

const completedOrdersCount = computed(() => props.candidate?.completedOrdersCount ?? null);
const completionRate = computed(() => {
  const rate = props.candidate?.completionRate;
  return rate == null || !completedOrdersCount.value ? null : rate;
});

const handleToggle = () => {
  if (!props.candidate) return;
  emit('toggleSelect', props.candidate.id);
};

const handleClose = () => emit('close');
</script>

<template>
  <div
    v-if="isOpen && candidate"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink-950/50"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-technician-name"
    @click.self="handleClose"
    @keydown.esc="handleClose"
  >
    <div class="bg-white rounded-t-2xl sm:rounded-2xl max-w-xl w-full max-h-[92dvh] flex flex-col shadow-(--shadow-e3) overflow-hidden">
      <!-- Header -->
      <div class="px-5 sm:px-6 pt-5 pb-4 border-b border-ink-100 shrink-0">
        <div class="flex items-start gap-4">
          <div class="relative shrink-0">
            <div class="w-16 h-16 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center font-semibold text-2xl">
              {{ candidate.fullName.charAt(0) }}
            </div>
            <span
              v-if="candidate.isAvailable !== false"
              class="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-success-500 border-2 border-white"
              title="Đang hoạt động"
            />
          </div>

          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="modal-technician-name" class="text-xl font-semibold text-ink-900 tracking-tight">
                {{ candidate.fullName }}
              </h2>
              <FhStatusPill status="VERIFIED" label="Đã xác thực" />
              <FhStatusPill v-if="isSelected" status="ACTIVE" :label="`Ưu tiên #${priorityIndex + 1}`" />
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
              <span class="flex items-center gap-1 whitespace-nowrap font-num">
                <Star :size="14" class="fill-warning-400 text-warning-500" />
                <span class="font-semibold text-ink-900">{{ candidate.averageRating }}</span>
                ({{ candidate.ratingCount }} đánh giá)
              </span>
              <span class="flex items-center gap-1 whitespace-nowrap">
                <Briefcase :size="14" class="text-ink-400" />
                {{ candidate.yearsExperience }} năm kinh nghiệm
              </span>
              <span v-if="candidate.distanceKm != null" class="flex items-center gap-1 whitespace-nowrap font-num">
                <MapPin :size="14" class="text-ink-400" />
                Cách khoảng {{ candidate.distanceKm }} km
              </span>
            </div>
          </div>

          <button
            type="button"
            class="w-9 h-9 -mr-1 rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 flex items-center justify-center shrink-0"
            aria-label="Đóng"
            @click="handleClose"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- Figures from the matching record -->
        <dl class="grid grid-cols-3 gap-2 mt-4 text-center">
          <div class="p-3 rounded-xl bg-ink-50">
            <dt class="text-xs text-ink-500">Đơn đã thực hiện</dt>
            <dd class="text-lg font-semibold text-ink-900 font-num">{{ completedOrdersCount ?? '—' }}</dd>
          </div>
          <div class="p-3 rounded-xl bg-ink-50">
            <dt class="text-xs text-ink-500">Tỷ lệ hoàn thành</dt>
            <dd class="text-lg font-semibold text-ink-900 font-num">{{ completionRate != null ? `${completionRate}%` : '—' }}</dd>
          </div>
          <div class="p-3 rounded-xl bg-ink-50">
            <dt class="text-xs text-ink-500">Độ tin cậy</dt>
            <dd class="text-lg font-semibold text-ink-900 font-num">{{ candidate.reliabilityScore }}%</dd>
          </div>
        </dl>
      </div>

      <!-- Tabs -->
      <div class="px-5 sm:px-6 pt-3 shrink-0">
        <div class="grid grid-cols-2 gap-1 p-1 bg-ink-100 rounded-xl text-sm" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'about'"
            class="h-9 rounded-lg font-medium transition-colors whitespace-nowrap"
            :class="activeTab === 'about' ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900'"
            @click="activeTab = 'about'"
          >
            Giới thiệu
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'reviews'"
            class="h-9 rounded-lg font-medium transition-colors whitespace-nowrap"
            :class="activeTab === 'reviews' ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900'"
            @click="activeTab = 'reviews'"
          >
            Đánh giá <span class="font-num text-ink-500">({{ reviews.length }})</span>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="px-5 sm:px-6 py-4 overflow-y-auto space-y-4 text-sm text-ink-800 flex-1">
        <template v-if="activeTab === 'about'">
          <p v-if="candidate.bio" class="text-ink-700 leading-relaxed text-pretty whitespace-pre-line">{{ candidate.bio }}</p>

          <ul class="rounded-xl border border-ink-200 divide-y divide-ink-100">
            <li class="px-4 py-3 flex items-start gap-3">
              <ShieldCheck :size="18" class="text-brand-600 shrink-0 mt-0.5" />
              <span class="text-pretty">Hồ sơ và tay nghề cho dịch vụ này đã được FixHome duyệt.</span>
            </li>
            <li class="px-4 py-3 flex items-center justify-between gap-3">
              <span class="flex items-center gap-3 text-ink-600">
                <Wrench :size="18" class="text-ink-400 shrink-0" />
                Giá công tham khảo
              </span>
              <span class="font-semibold text-ink-900 font-num whitespace-nowrap">
                <FhMoney v-if="candidate.listedLaborPrice" :amount="candidate.listedLaborPrice" />
                <template v-else>Theo báo giá</template>
              </span>
            </li>
            <li v-if="candidate.typicalWarrantyDays" class="px-4 py-3 flex items-center justify-between gap-3">
              <span class="flex items-center gap-3 text-ink-600">
                <ClipboardCheck :size="18" class="text-ink-400 shrink-0" />
                Bảo hành thường áp dụng
              </span>
              <span class="font-semibold text-ink-900 font-num whitespace-nowrap">{{ candidate.typicalWarrantyDays }} ngày</span>
            </li>
          </ul>

          <p class="p-3.5 rounded-xl bg-warning-50 border border-warning-200 text-warning-900 text-pretty">
            Giá công chỉ để tham khảo. Kỹ thuật viên sẽ báo giá cụ thể sau khi kiểm tra thiết bị, và chỉ sửa khi bạn đồng ý.
          </p>
        </template>

        <template v-else>
          <p v-if="loadingReviews" role="status" class="text-center py-10 text-ink-500">Đang tải đánh giá…</p>

          <template v-else-if="reviews.length > 0">
            <div class="flex items-center gap-5 p-4 rounded-xl bg-ink-50">
              <div class="text-center shrink-0">
                <div class="text-3xl font-semibold text-ink-900 font-num">{{ candidate.averageRating }}</div>
                <div class="text-xs text-ink-500 mt-0.5 whitespace-nowrap">{{ reviews.length }} nhận xét</div>
              </div>
              <div class="flex-1 space-y-1.5">
                <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="flex items-center gap-2 text-xs text-ink-600">
                  <span class="w-9 font-num shrink-0 whitespace-nowrap">{{ star }} sao</span>
                  <div class="flex-1 h-1.5 rounded-full bg-ink-200 overflow-hidden">
                    <div class="h-full bg-warning-500 rounded-full" :style="{ width: `${starStats.pct(starStats.counts[star])}%` }" />
                  </div>
                  <span class="w-6 text-right font-num shrink-0">{{ starStats.counts[star] }}</span>
                </div>
              </div>
            </div>

            <ul class="divide-y divide-ink-100">
              <li v-for="r in reviews" :key="r.id" class="py-3.5 space-y-1.5">
                <div class="flex items-center justify-between gap-3">
                  <span class="font-medium text-ink-900">{{ r.customerName || 'Khách hàng FixHome' }}</span>
                  <span class="flex items-center gap-1 font-num text-ink-700 whitespace-nowrap">
                    <Star :size="13" class="fill-warning-400 text-warning-500" />
                    {{ r.rating }}/5
                  </span>
                </div>
                <div v-if="parseReviewContent(r.comment).tags.length > 0" class="flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in parseReviewContent(r.comment).tags"
                    :key="tag"
                    class="px-2.5 py-0.5 rounded-full text-xs bg-ink-100 text-ink-700"
                  >
                    {{ tag }}
                  </span>
                </div>
                <p v-if="parseReviewContent(r.comment).text" class="text-ink-700 leading-relaxed text-pretty">
                  {{ parseReviewContent(r.comment).text }}
                </p>
                <p class="text-xs text-ink-500 font-num">{{ vnDateString(r.createdAt) }}</p>
              </li>
            </ul>
          </template>

          <FhEmptyState
            v-else
            title="Chưa có đánh giá nào"
            description="Kỹ thuật viên này chưa nhận được đánh giá nào từ khách hàng."
          />
        </template>
      </div>

      <!-- Footer -->
      <div class="px-5 sm:px-6 py-3.5 border-t border-ink-100 flex items-center justify-between gap-3 shrink-0 pb-[calc(0.875rem_+_env(safe-area-inset-bottom))] sm:pb-3.5">
        <span v-if="isSelected" class="text-sm text-ink-700 flex items-center gap-1.5">
          <CheckCircle2 :size="16" class="text-brand-600 shrink-0" />
          <span>Đang chọn làm <strong class="font-semibold">ưu tiên #{{ priorityIndex + 1 }}</strong></span>
        </span>
        <span v-else></span>

        <div class="flex items-center gap-2.5">
          <FhButton variant="secondary" size="md" @click="handleClose">Đóng</FhButton>
          <FhButton
            :variant="isSelected ? 'secondary' : 'primary'"
            size="md"
            :disabled="!isSelected && !canSelect"
            @click="handleToggle"
          >
            <Check v-if="!isSelected" :size="16" />
            <X v-else :size="16" />
            {{ isSelected ? 'Bỏ chọn thợ này' : 'Chọn thợ này' }}
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
