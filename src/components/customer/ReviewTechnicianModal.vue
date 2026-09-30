<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Star,
  X,
  Check,
  CheckCircle2,
  Sparkles,
  UserCheck,
  MessageSquare,
  AlertCircle,
  Loader2,
} from 'lucide-vue-next';
import { FhButton } from '../index';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { userFacingError } from '../../utils/user-facing-error';

interface Props {
  open: boolean;
  orderId: string;
  orderCode?: string;
  technicianName?: string;
  technicianAvatar?: string;
}

const props = withDefaults(defineProps<Props>(), {
  orderCode: '',
  technicianName: 'Kỹ thuật viên FixHome',
  technicianAvatar: '',
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submitted', review: Review): void;
}>();

// Star rating state
const selectedRating = ref<number>(5);
const hoverRating = ref<number>(0);
const activeRating = computed(() => hoverRating.value || selectedRating.value);

// Dynamic suggestion chips per star level
const SUGGESTIONS_MAP: Record<number, string[]> = {
  5: [
    'Xuất sắc 🌟',
    'Rất nhiệt tình & tận tâm',
    'Đúng giờ & chuẩn hẹn',
    'Tay nghề chuyên môn cao',
    'Giá cả minh bạch',
    'Dọn dẹp sạch sẽ',
    'Sẽ tiếp tục ủng hộ',
  ],
  4: [
    'Hài lòng với dịch vụ',
    'Thợ thân thiện lịch sự',
    'Xử lý nhanh nhẹn',
    'Kỹ năng chuyên môn tốt',
    'Chi phí hợp lý',
  ],
  3: [
    'Chất lượng tạm ổn',
    'Cần cải thiện thời gian',
    'Chi phí hơi cao',
    'Đúng hẹn',
    'Cần tư vấn rõ hơn',
  ],
  2: [
    'Đến muộn giờ hẹn',
    'Thao tác chưa cẩn thận',
    'Chưa dọn dẹp sạch sẽ',
    'Phát sinh thêm chi phí',
    'Cần nâng cao tay nghề',
  ],
  1: [
    'Thái độ chưa tốt',
    'Tay nghề kém',
    'Không khắc phục triệt để lỗi',
    'Trễ hẹn quá lâu',
    'Chi phí bất hợp lý',
  ],
};

const currentChips = computed(() => {
  return SUGGESTIONS_MAP[activeRating.value] || SUGGESTIONS_MAP[5];
});

const selectedChips = ref<string[]>([]);
const comment = ref('');
const submitting = ref(false);
const errorMsg = ref('');
const isSuccess = ref(false);

// Reset chips when rating changes
watch(selectedRating, () => {
  selectedChips.value = [];
});

// Reset all form state on modal open
watch(
  () => props.open,
  (val) => {
    if (val) {
      selectedRating.value = 5;
      hoverRating.value = 0;
      selectedChips.value = ['Xuất sắc 🌟', 'Rất nhiệt tình & tận tâm'];
      comment.value = '';
      errorMsg.value = '';
      isSuccess.value = false;
      submitting.value = false;
    }
  },
  { immediate: true }
);

const ratingLabels: Record<number, { text: string; tone: string; emoji: string }> = {
  5: { text: 'Xuất sắc — Rất hài lòng', tone: 'text-warning-600', emoji: '🤩' },
  4: { text: 'Hài lòng — Dịch vụ tốt', tone: 'text-success-600', emoji: '😊' },
  3: { text: 'Bình thường — Tạm ổn', tone: 'text-warning-600', emoji: '😐' },
  2: { text: 'Chưa hài lòng', tone: 'text-warning-600', emoji: '🙁' },
  1: { text: 'Rất không hài lòng', tone: 'text-danger-600', emoji: '😞' },
};

const currentLabel = computed(() => {
  return ratingLabels[activeRating.value] || ratingLabels[5];
});

const toggleChip = (chip: string) => {
  const index = selectedChips.value.indexOf(chip);
  if (index > -1) {
    selectedChips.value.splice(index, 1);
  } else {
    selectedChips.value.push(chip);
  }
};

const handleClose = () => {
  if (submitting.value) return;
  emit('close');
};

const handleSubmit = async () => {
  if (selectedRating.value < 1) {
    errorMsg.value = 'Vui lòng chọn số sao đánh giá.';
    return;
  }

  // Combine chips and comment
  let finalComment = comment.value.trim();
  if (selectedChips.value.length > 0) {
    const chipsPrefix = `[${selectedChips.value.join(', ')}]`;
    finalComment = finalComment ? `${chipsPrefix} ${finalComment}` : chipsPrefix;
  }

  try {
    submitting.value = true;
    errorMsg.value = '';

    const review = await reviewsApi.createReview(props.orderId, {
      rating: selectedRating.value,
      comment: finalComment || undefined,
    });

    isSuccess.value = true;
    setTimeout(() => {
      emit('submitted', review);
      emit('close');
    }, 1800);
  } catch (err: unknown) {
    const message = userFacingError(err, 'Không thể gửi đánh giá. Vui lòng thử lại sau.');
    errorMsg.value = message;
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="review-modal-title"
    @click.self="handleClose"
  >
    <div
      class="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-ink-100 flex flex-col max-h-[92vh]"
      @click.stop
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-ink-100 flex items-center justify-between bg-ink-25">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-warning-50 border border-warning-200 flex items-center justify-center text-warning-500 shadow-xs">
            <Star :size="18" class="fill-warning-400 text-warning-400" />
          </div>
          <div>
            <h2 id="review-modal-title" class="text-base font-bold text-ink-900 leading-tight">
              Đánh giá Kỹ thuật viên
            </h2>
            <p v-if="orderCode" class="text-xs text-ink-500 font-num">
              Đơn hàng: <span class="font-medium text-ink-700">#{{ orderCode }}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          class="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          aria-label="Đóng modal"
          :disabled="submitting"
          @click="handleClose"
        >
          <X :size="20" />
        </button>
      </div>

      <!-- Success Screen -->
      <div v-if="isSuccess" class="p-8 text-center space-y-4 my-auto">
        <div class="w-16 h-16 rounded-full bg-success-50 border border-success-200 text-success-600 flex items-center justify-center mx-auto shadow-sm animate-bounce">
          <CheckCircle2 :size="36" />
        </div>
        <div class="space-y-1">
          <h3 class="text-lg font-bold text-ink-900">Cảm ơn bạn đã gửi đánh giá!</h3>
          <p class="text-sm text-ink-600 max-w-xs mx-auto">
            Đánh giá của bạn đã được ghi nhận và gửi đến Kỹ thuật viên <strong class="text-ink-900">{{ technicianName }}</strong>.
          </p>
        </div>
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning-50 border border-warning-200 text-warning-700 text-xs font-semibold">
          <Sparkles :size="14" class="text-warning-500" />
          Đã cộng điểm uy tín cho kỹ thuật viên
        </div>
      </div>

      <!-- Body / Form -->
      <div v-else class="p-6 space-y-5 overflow-y-auto flex-1">
        <!-- Technician Card Info -->
        <div class="flex items-center gap-3.5 p-3.5 rounded-xl bg-ink-50/70 border border-ink-100">
          <div class="w-12 h-12 rounded-full overflow-hidden bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0 text-brand-600 font-bold text-sm">
            <img
              v-if="technicianAvatar"
              :src="technicianAvatar"
              :alt="technicianName"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ technicianName.slice(0, 2).toUpperCase() }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-bold text-ink-900 truncate">{{ technicianName }}</span>
              <UserCheck :size="15" class="text-success-600 shrink-0" />
            </div>
            <p class="text-xs text-ink-500">Kỹ thuật viên thực hiện đơn sửa chữa</p>
          </div>
        </div>

        <!-- Rating Stars -->
        <div class="text-center space-y-2.5 pt-1">
          <p class="text-xs font-medium text-ink-500">Bạn hài lòng với dịch vụ ở mức nào?</p>

          <div
            class="flex items-center justify-center gap-2 py-1"
            role="radiogroup"
            aria-label="Chọn số sao"
            @mouseleave="hoverRating = 0"
          >
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              class="p-1.5 transition-transform duration-150 hover:scale-125 focus:outline-none focus:scale-125"
              :aria-label="`${star} sao`"
              @mouseenter="hoverRating = star"
              @click="selectedRating = star"
            >
              <Star
                :size="36"
                class="transition-colors duration-150"
                :class="
                  star <= activeRating
                    ? 'text-warning-400 fill-warning-400 drop-shadow-xs'
                    : 'text-ink-200 hover:text-ink-300'
                "
              />
            </button>
          </div>

          <!-- Emotional Label -->
          <div class="h-6 flex items-center justify-center">
            <span class="text-sm font-semibold flex items-center gap-1.5 transition-all" :class="currentLabel.tone">
              <span>{{ currentLabel.emoji }}</span>
              <span>{{ currentLabel.text }}</span>
            </span>
          </div>
        </div>

        <!-- Dynamic Suggestion Chips -->
        <div class="space-y-2 pt-2 border-t border-ink-100">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-ink-700 flex items-center gap-1">
              <Sparkles :size="13" class="text-brand-600" />
              Gợi ý nhận xét nhanh:
            </span>
            <span class="text-[11px] text-ink-400">Chọn nhiều thẻ</span>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="chip in currentChips"
              :key="chip"
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
              :class="
                selectedChips.includes(chip)
                  ? 'bg-brand-50 border-brand-600 text-brand-700 shadow-xs ring-1 ring-brand-500/20'
                  : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300'
              "
              @click="toggleChip(chip)"
            >
              <Check v-if="selectedChips.includes(chip)" :size="12" class="text-brand-600 stroke-[3]" />
              <span>{{ chip }}</span>
            </button>
          </div>
        </div>

        <!-- Detail Comment Textarea -->
        <div class="space-y-1.5 pt-2 border-t border-ink-100">
          <label for="review-comment" class="text-xs font-medium text-ink-700 flex items-center gap-1">
            <MessageSquare :size="13" class="text-ink-500" />
            Nhận xét chi tiết (không bắt buộc):
          </label>
          <textarea
            id="review-comment"
            v-model="comment"
            rows="3"
            maxlength="500"
            placeholder="Chia sẻ thêm cảm nhận của bạn về sự tận tâm, chuyên nghiệp, thời gian và chất lượng dịch vụ..."
            class="w-full p-3 bg-white border border-ink-200 rounded-xl text-xs text-ink-800 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-ink-400"
          ></textarea>
          <div class="flex justify-end text-[11px] text-ink-400">
            {{ comment.length }}/500
          </div>
        </div>

        <!-- Error Message -->
        <div
          v-if="errorMsg"
          class="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-xs flex items-center gap-2"
        >
          <AlertCircle :size="15" class="shrink-0 text-danger-500" />
          <span>{{ errorMsg }}</span>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div v-if="!isSuccess" class="px-6 py-4 border-t border-ink-100 bg-ink-25 flex items-center gap-3">
        <FhButton
          variant="secondary"
          size="md"
          class="flex-1"
          :disabled="submitting"
          @click="handleClose"
        >
          Để sau
        </FhButton>
        <FhButton
          variant="primary"
          size="md"
          class="flex-1 shadow-sm"
          :disabled="submitting || selectedRating < 1"
          @click="handleSubmit"
        >
          <Loader2 v-if="submitting" :size="16" class="animate-spin mr-1.5" />
          <Star v-else :size="15" class="mr-1.5 fill-white text-white" />
          <span>Gửi đánh giá</span>
        </FhButton>
      </div>
    </div>
  </div>
</template>
