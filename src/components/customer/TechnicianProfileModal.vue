<script setup lang="ts">
// Technician profile shown while the customer picks candidates. Everything here
// comes from the candidate record or the technician's published reviews; the
// matching query only returns technicians whose profile and skill for this
// service FixHome has verified, which is what "Đã xác thực" refers to.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { X, Star, MapPin, Briefcase, ShieldCheck, CheckCircle2, Check, Wrench, ClipboardCheck, Award } from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhMoney, FhEmptyState, FhSkeleton } from '../index';
import type { TechnicianCandidate } from '../../api/bookings.api';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { vnDateString } from '../../utils/vn-time';
import { hasRating, ratingLabel } from '../../utils/formatters';

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

// ── Tab sliding indicator animation (consistent with FixHome design system) ──
const tabListRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({ opacity: '0' });

function updateTabIndicator() {
  const activeEl = tabRefs.value[activeTab.value];
  const container = tabListRef.value;
  if (!activeEl || !container || activeEl.offsetWidth === 0) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = activeEl.offsetLeft;
  const top = activeEl.offsetTop;
  const width = activeEl.offsetWidth;
  const height = activeEl.offsetHeight;

  indicatorStyle.value = {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: width > 0 ? '1' : '0',
  };
}

let resizeObserver: ResizeObserver | null = null;

watch(tabListRef, (el) => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (el && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateTabIndicator();
    });
    resizeObserver.observe(el);
  }
  void nextTick(updateTabIndicator);
});

const fetchReviews = async (techId: string) => {
  loadingReviews.value = true;
  try {
    const res = await reviewsApi.getByTechnician(techId);
    reviews.value = res.data || [];
  } catch {
    reviews.value = [];
  } finally {
    loadingReviews.value = false;
    void nextTick(updateTabIndicator);
  }
};

watch(
  () => [props.isOpen, props.candidate?.id],
  ([open, id]) => {
    if (open && id) {
      activeTab.value = 'about';
      void fetchReviews(id as string);
      void nextTick(() => {
        updateTabIndicator();
        setTimeout(updateTabIndicator, 50);
      });
    }
  },
  { immediate: true },
);

watch(activeTab, () => {
  void nextTick(updateTabIndicator);
});

onMounted(() => {
  void nextTick(updateTabIndicator);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateTabIndicator);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
});

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
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink-950/60 backdrop-blur-xs transition-opacity duration-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-technician-name"
    @click.self="handleClose"
    @keydown.esc="handleClose"
  >
    <div
      class="bg-white rounded-t-3xl sm:rounded-3xl max-w-xl w-full max-h-[92dvh] flex flex-col shadow-(--shadow-e3) border border-ink-200/90 overflow-hidden transform transition-all duration-200 ease-out animate-in fade-in zoom-in-95 sm:zoom-in-95"
    >
      <!-- Header Hero Card -->
      <div class="px-5 sm:px-6 pt-5 pb-4 border-b border-ink-100 bg-gradient-to-b from-brand-50/40 via-white to-white shrink-0">
        <div class="flex items-start gap-4">
          <div class="relative shrink-0">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 text-brand-700 flex items-center justify-center font-bold text-2xl border border-brand-200/80 shadow-2xs">
              {{ candidate.fullName.charAt(0) }}
            </div>
            <span
              v-if="candidate.isAvailable !== false"
              class="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-success-500 border-2 border-white ring-1 ring-success-200"
              title="Đang hoạt động"
            />
          </div>

          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="modal-technician-name" class="text-xl font-bold text-ink-900 tracking-tight">
                {{ candidate.fullName }}
              </h2>
              <FhStatusPill status="VERIFIED" label="Đã xác thực" />
              <FhStatusPill v-if="isSelected" status="ACTIVE" :label="`Ưu tiên #${priorityIndex + 1}`" />
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-ink-600">
              <span class="flex items-center gap-1 whitespace-nowrap font-num">
                <template v-if="hasRating(candidate.averageRating, candidate.ratingCount)">
                  <Star :size="14" class="fill-warning-400 text-warning-500" />
                  <span class="font-bold text-ink-900">{{ ratingLabel(candidate.averageRating, candidate.ratingCount) }}</span>
                  <span class="text-ink-500">({{ candidate.ratingCount }} đánh giá)</span>
                </template>
                <template v-else>Chưa có đánh giá</template>
              </span>
              <span class="flex items-center gap-1 whitespace-nowrap">
                <Briefcase :size="14" class="text-ink-400" />
                {{ candidate.yearsExperience }} năm kinh nghiệm
              </span>
              <span v-if="candidate.distanceKm != null" class="flex items-center gap-1 whitespace-nowrap font-num text-brand-700 font-medium">
                <MapPin :size="14" class="text-brand-600" />
                Cách khoảng {{ candidate.distanceKm }} km
              </span>
            </div>
          </div>

          <button
            type="button"
            class="w-9 h-9 -mr-1 rounded-xl text-ink-400 hover:text-ink-900 hover:bg-ink-100 flex items-center justify-center shrink-0 transition-colors"
            aria-label="Đóng"
            @click="handleClose"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- Key Metrics Cards -->
        <dl class="grid grid-cols-3 gap-2.5 mt-4 text-center select-none">
          <div class="p-3 rounded-2xl bg-ink-50/70 border border-ink-100/80 transition-all hover:bg-white hover:shadow-2xs">
            <dt class="text-[11px] sm:text-xs text-ink-500 font-medium">Đơn đã thực hiện</dt>
            <dd class="text-base sm:text-lg font-bold text-ink-900 font-num mt-0.5">{{ completedOrdersCount ?? '—' }}</dd>
          </div>
          <div class="p-3 rounded-2xl bg-ink-50/70 border border-ink-100/80 transition-all hover:bg-white hover:shadow-2xs">
            <dt class="text-[11px] sm:text-xs text-ink-500 font-medium">Tỷ lệ hoàn thành</dt>
            <dd class="text-base sm:text-lg font-bold text-ink-900 font-num mt-0.5">{{ completionRate != null ? `${completionRate}%` : '—' }}</dd>
          </div>
          <div class="p-3 rounded-2xl bg-ink-50/70 border border-ink-100/80 transition-all hover:bg-white hover:shadow-2xs">
            <dt class="text-[11px] sm:text-xs text-ink-500 font-medium">Độ tin cậy</dt>
            <dd class="text-base sm:text-lg font-bold text-ink-900 font-num mt-0.5">{{ candidate.reliabilityScore != null ? `${candidate.reliabilityScore}%` : '—' }}</dd>
          </div>
        </dl>
      </div>

      <!-- Animated Sliding Tabs Bar -->
      <div class="px-5 sm:px-6 pt-3.5 shrink-0">
        <div
          ref="tabListRef"
          class="relative flex w-full items-center gap-1 p-1 bg-ink-100 rounded-xl text-xs sm:text-sm select-none"
          role="tablist"
          aria-label="Hồ sơ thợ"
        >
          <!-- Sliding active indicator pill -->
          <div
            class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
            :style="indicatorStyle"
            aria-hidden="true"
          />

          <button
            type="button"
            role="tab"
            :ref="(el) => { tabRefs['about'] = el as HTMLElement }"
            :aria-selected="activeTab === 'about'"
            class="relative z-10 flex-1 h-9 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
            :class="activeTab === 'about' ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
            @click="activeTab = 'about'"
          >
            <span>Giới thiệu</span>
          </button>
          <button
            type="button"
            role="tab"
            :ref="(el) => { tabRefs['reviews'] = el as HTMLElement }"
            :aria-selected="activeTab === 'reviews'"
            class="relative z-10 flex-1 h-9 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
            :class="activeTab === 'reviews' ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
            @click="activeTab = 'reviews'"
          >
            <span>Đánh giá</span>
            <span
              class="inline-flex items-center rounded-full px-1.5 py-0.2 font-num text-xs transition-colors"
              :class="activeTab === 'reviews' ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-ink-200/60 text-ink-600'"
            >
              {{ reviews.length }}
            </span>
          </button>
        </div>
      </div>

      <!-- Body Content -->
      <div class="px-5 sm:px-6 py-4 overflow-y-auto space-y-4 text-xs sm:text-sm text-ink-800 flex-1">
        <template v-if="activeTab === 'about'">
          <p v-if="candidate.bio" class="text-ink-700 leading-relaxed text-pretty whitespace-pre-line bg-ink-50/50 p-3.5 rounded-2xl border border-ink-100">
            {{ candidate.bio }}
          </p>

          <ul class="rounded-2xl border border-ink-200/90 divide-y divide-ink-100 bg-white overflow-hidden shadow-2xs">
            <li class="px-4 py-3 flex items-start gap-3 bg-brand-50/20">
              <ShieldCheck :size="18" class="text-brand-600 shrink-0 mt-0.5" />
              <span class="text-pretty text-ink-800 font-medium">Hồ sơ và tay nghề cho dịch vụ này đã được FixHome duyệt.</span>
            </li>
            <li class="px-4 py-3 flex items-center justify-between gap-3">
              <span class="flex items-center gap-2.5 text-ink-600">
                <Wrench :size="16" class="text-ink-400 shrink-0" />
                <span>Giá công tham khảo</span>
              </span>
              <span class="font-bold text-ink-900 font-num whitespace-nowrap">
                <FhMoney v-if="candidate.listedLaborPrice" :amount="candidate.listedLaborPrice" />
                <template v-else>Theo báo giá</template>
              </span>
            </li>
            <li v-if="candidate.typicalWarrantyDays" class="px-4 py-3 flex items-center justify-between gap-3">
              <span class="flex items-center gap-2.5 text-ink-600">
                <ClipboardCheck :size="16" class="text-ink-400 shrink-0" />
                <span>Bảo hành thường áp dụng</span>
              </span>
              <span class="font-bold text-ink-900 font-num whitespace-nowrap px-2 py-0.5 rounded-lg bg-brand-50 text-brand-700 text-xs">
                {{ candidate.typicalWarrantyDays }} ngày
              </span>
            </li>
          </ul>

          <div class="p-3.5 rounded-2xl bg-warning-50 border border-warning-200 text-warning-900 text-pretty flex items-start gap-2.5">
            <Award :size="18" class="text-warning-600 shrink-0 mt-0.5" />
            <span class="text-xs sm:text-sm leading-relaxed">
              Giá công chỉ để tham khảo. Kỹ thuật viên sẽ báo giá cụ thể sau khi kiểm tra thiết bị, và chỉ sửa khi bạn đồng ý.
            </span>
          </div>
        </template>

        <template v-else>
          <div v-if="loadingReviews" role="status" aria-label="Đang tải đánh giá" class="space-y-3 py-2">
            <FhSkeleton height="64px" rounded="md" />
            <FhSkeleton height="16px" :count="3" />
          </div>

          <template v-else-if="reviews.length > 0">
            <div class="flex items-center gap-5 p-4 rounded-2xl bg-ink-50/80 border border-ink-100">
              <div class="text-center shrink-0 px-2">
                <div class="text-3xl sm:text-4xl font-bold text-ink-900 font-num tracking-tight">
                  {{ ratingLabel(candidate.averageRating, candidate.ratingCount) }}
                </div>
                <div class="flex items-center justify-center gap-0.5 my-1 text-warning-400">
                  <Star v-for="i in 5" :key="i" :size="13" class="fill-warning-400 text-warning-500" />
                </div>
                <div class="text-xs text-ink-500 whitespace-nowrap">{{ reviews.length }} nhận xét</div>
              </div>
              <div class="flex-1 space-y-1.5 pl-2 border-l border-ink-200/70">
                <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="flex items-center gap-2 text-xs text-ink-600">
                  <span class="w-9 font-num shrink-0 whitespace-nowrap">{{ star }} sao</span>
                  <div class="flex-1 h-2 rounded-full bg-ink-200/80 overflow-hidden">
                    <div class="h-full bg-warning-400 rounded-full transition-all duration-300" :style="{ width: `${starStats.pct(starStats.counts[star])}%` }" />
                  </div>
                  <span class="w-6 text-right font-num text-ink-500 shrink-0">{{ starStats.counts[star] }}</span>
                </div>
              </div>
            </div>

            <ul class="divide-y divide-ink-100/80">
              <li v-for="r in reviews" :key="r.id" class="py-3.5 space-y-1.5">
                <div class="flex items-center justify-between gap-3">
                  <span class="font-semibold text-ink-900">{{ r.customerName || 'Khách hàng FixHome' }}</span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-50 border border-warning-200 text-warning-800 font-num text-xs font-semibold whitespace-nowrap">
                    <Star :size="12" class="fill-warning-400 text-warning-500" />
                    {{ r.rating }}/5
                  </span>
                </div>
                <div v-if="parseReviewContent(r.comment).tags.length > 0" class="flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in parseReviewContent(r.comment).tags"
                    :key="tag"
                    class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100"
                  >
                    {{ tag }}
                  </span>
                </div>
                <p v-if="parseReviewContent(r.comment).text" class="text-ink-700 leading-relaxed text-pretty">
                  {{ parseReviewContent(r.comment).text }}
                </p>
                <p class="text-xs text-ink-400 font-num">{{ vnDateString(r.createdAt) }}</p>
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

      <!-- Footer Action Area -->
      <div class="px-5 sm:px-6 py-3.5 border-t border-ink-100 bg-white flex items-center justify-between gap-3 shrink-0 pb-[calc(0.875rem_+_env(safe-area-inset-bottom))] sm:pb-3.5">
        <span v-if="isSelected" class="text-xs sm:text-sm text-ink-700 flex items-center gap-1.5 min-w-0">
          <CheckCircle2 :size="16" class="text-brand-600 shrink-0" />
          <span class="truncate">Đang chọn làm <strong class="font-semibold text-brand-700">ưu tiên #{{ priorityIndex + 1 }}</strong></span>
        </span>
        <span v-else></span>

        <div class="flex items-center gap-2.5 shrink-0">
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

