<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X, ShieldAlert, AlertTriangle, AlertCircle } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { ordersApi, type CoverageKind, type WarrantyClaimView } from '../../api/orders.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';
import { formatDateVN } from '../../utils/formatters';

export interface ClaimableCoverage {
  id: string;
  itemDescription: string;
  /** The technician's work or a part they fitted. */
  kind?: CoverageKind;
  warrantyDaysSnapshot?: number;
  startsAt?: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED';
  voided?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** "Bảo hành 30 ngày · đến 15/11/2026 · còn 29 ngày", or when it ended. */
function coverageTerm(coverage: ClaimableCoverage): string {
  const until = formatDateVN(coverage.expiresAt);
  if (coverage.status !== 'ACTIVE') return `Hết hạn ${until}`;
  const days = coverage.warrantyDaysSnapshot ? `Bảo hành ${coverage.warrantyDaysSnapshot} ngày · ` : '';
  const left = Math.max(0, Math.ceil((new Date(coverage.expiresAt).getTime() - Date.now()) / DAY_MS));
  return `${days}đến ${until} · còn ${left} ngày`;
}

const props = defineProps<{
  open: boolean;
  orderId: string;
  orderCode: string;
  serviceName: string;
  technicianName: string;
  coverages: ClaimableCoverage[];
  /** Coverages that already have an unresolved claim cannot be claimed again. */
  busyCoverageIds: string[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submitted', claim: WarrantyClaimView): void;
}>();

const MIN_LENGTH = 10;
const evidence = useEvidencePhotos();

const selectedId = ref('');
const description = ref('');
const submitting = ref(false);
const error = ref('');

const selectable = computed(() => props.coverages.filter((c) => !c.voided && !props.busyCoverageIds.includes(c.id)));
const selected = computed(() => props.coverages.find((c) => c.id === selectedId.value) ?? null);

// The customer cannot tell a workmanship fault from a faulty part (the technician decides at inspection):
// one claim for the whole order, filed on the free item that is covered longest.
function bestCoverageId(): string {
  const rank = (c: ClaimableCoverage) => (c.status === 'ACTIVE' ? 1e15 : 0) + (Date.parse(c.expiresAt) || 0);
  return [...selectable.value].sort((a, b) => rank(b) - rank(a))[0]?.id ?? '';
}

/** "Tụ khởi động và 8 hạng mục khác": a long order never turns into a long line. */
const scopeSummary = computed(() => {
  const names = props.coverages.map((c) => c.itemDescription).filter(Boolean);
  if (names.length <= 2) return names.join(' · ');
  return `${names[0]}, ${names[1]} và ${names.length - 2} hạng mục khác`;
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedId.value = bestCoverageId();
    description.value = '';
    evidence.reset();
    error.value = '';
  },
  { immediate: true },
);

function close() {
  if (submitting.value || evidence.uploading.value) return;
  emit('close');
}

async function submit() {
  if (submitting.value || evidence.uploading.value) return;
  const text = description.value.trim();
  if (!selected.value) {
    error.value = 'Đơn này đang có yêu cầu bảo hành chưa xử lý xong.';
    return;
  }
  if (text.length < MIN_LENGTH) {
    error.value = `Vui lòng mô tả sự cố ít nhất ${MIN_LENGTH} ký tự.`;
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const claim = await ordersApi.createWarrantyClaim(props.orderId, {
      warrantyCoverageId: selected.value.id,
      description: text,
      ...(evidence.photos.value.length ? { evidenceRefs: evidence.urls() } : {}),
    });
    emit('submitted', claim);
  } catch (reason) {
    error.value = getSupportErrorMessage(
      reason,
      'Chưa xác nhận được kết quả. Vui lòng kiểm tra trạng thái bảo hành trước khi gửi lại.',
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4 overflow-y-auto"
    @keydown.esc="close"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="warranty-claim-title"
      class="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl my-auto max-h-[92vh] overflow-y-auto transition-all"
    >
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <ShieldAlert :size="22" />
          </div>
          <div>
            <h3 id="warranty-claim-title" class="text-lg font-bold text-ink-900 tracking-tight">
              Yêu cầu bảo hành
            </h3>
            <p class="text-xs text-ink-500 mt-0.5">
              Gửi thông tin sự cố để thợ phụ trách liên hệ khắc phục sớm nhất.
            </p>
          </div>
        </div>
        <button
          type="button"
          class="w-8 h-8 rounded-full bg-ink-100 hover:bg-ink-200 text-ink-500 hover:text-ink-800 flex items-center justify-center transition-colors shrink-0"
          aria-label="Đóng"
          @click="close"
        >
          <X :size="16" />
        </button>
      </div>

      <!-- Order Context Card -->
      <div class="rounded-2xl bg-ink-50/80 border border-ink-100 p-3.5 space-y-2 text-xs">
        <div class="flex items-center justify-between gap-2">
          <span class="text-ink-500">Đơn hàng:</span>
          <span class="font-bold text-ink-900 font-num">#{{ orderCode }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-ink-500">Dịch vụ:</span>
          <span class="font-semibold text-ink-800 text-right truncate max-w-[240px]">{{ serviceName }}</span>
        </div>
        <div class="flex items-center justify-between gap-2 pt-1 border-t border-ink-100/70">
          <span class="text-ink-500">Kỹ thuật viên:</span>
          <span class="font-medium text-ink-800">{{ technicianName }}</span>
        </div>
      </div>

      <!-- One claim for the whole order: the technician decides what failed -->
      <div class="rounded-2xl border border-ink-100 p-3.5 space-y-1 text-xs" data-testid="coverage-scope">
        <div class="flex items-start justify-between gap-3">
          <span class="text-ink-500 shrink-0">Phạm vi:</span>
          <span class="font-semibold text-ink-900 text-right text-pretty">{{ scopeSummary }}</span>
        </div>
        <p v-if="selected" class="text-right text-ink-500 font-num" data-testid="coverage-term">{{ coverageTerm(selected) }}</p>
      </div>

      <!-- Expired coverage note -->
      <div
        v-if="selected && selected.status !== 'ACTIVE'"
        role="status"
        class="p-3 rounded-xl bg-warning-50 border border-warning-200 text-warning-800 text-xs flex items-start gap-2"
      >
        <AlertTriangle :size="16" class="text-warning-600 shrink-0 mt-0.5" />
        <span class="text-pretty">
          Hạng mục này <strong>đã hết hạn bảo hành</strong>. Bạn vẫn có thể gửi yêu cầu, quản lý dịch vụ FixHome sẽ xem xét và phản hồi hướng hỗ trợ.
        </span>
      </div>

      <!-- Problem Description Textarea -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label for="warranty-claim-description" class="text-xs font-semibold text-ink-800">
            Mô tả sự cố bạn gặp phải <span class="text-danger-500">*</span>
          </label>
          <span
            class="text-[11px] font-num"
            :class="description.trim().length < MIN_LENGTH ? 'text-ink-400' : 'text-success-600 font-medium'"
          >
            {{ description.trim().length }}/{{ MIN_LENGTH }} ký tự tối thiểu
          </span>
        </div>
        <textarea
          id="warranty-claim-description"
          v-model="description"
          rows="3"
          maxlength="2000"
          placeholder="Mô tả cụ thể hiện tượng lỗi lặp lại (ví dụ: máy lại bị rò nước ở vị trí cũ, công tắc chập chờn sau 2 ngày dùng...)"
          class="w-full p-3 bg-white border border-ink-200 rounded-xl text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors resize-none"
        ></textarea>
      </div>

      <!-- Evidence Photos Upload -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-ink-800">Ảnh hiện trường sự cố (tối đa {{ evidence.maxPhotos }} ảnh)</span>
          <span class="text-ink-400">Không bắt buộc</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div
            v-for="(photo, index) in evidence.photos.value"
            :key="photo.url"
            class="relative w-16 h-16 rounded-xl overflow-hidden border border-ink-200 group"
          >
            <img :src="photo.url" :alt="photo.name" class="w-full h-full object-cover" />
            <button
              type="button"
              class="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink-900/80 hover:bg-danger-600 text-white flex items-center justify-center transition-colors shadow-xs"
              :aria-label="`Bỏ ảnh ${photo.name}`"
              @click="evidence.remove(index)"
            >
              <X :size="12" />
            </button>
          </div>

          <label
            v-if="evidence.photos.value.length < evidence.maxPhotos"
            class="inline-flex flex-col items-center justify-center w-16 h-16 rounded-xl border border-dashed border-ink-300 hover:border-brand-500 hover:bg-brand-50/30 text-ink-500 hover:text-brand-600 cursor-pointer transition-colors"
            :class="{ 'opacity-60 pointer-events-none': evidence.uploading.value }"
          >
            <Camera :size="18" />
            <span class="text-[10px] mt-1">{{ evidence.uploading.value ? 'Đang tải...' : 'Thêm ảnh' }}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="evidence.pick" />
          </label>
        </div>
      </div>

      <!-- Error message -->
      <div
        v-if="error || evidence.error.value"
        role="alert"
        class="p-3 rounded-xl bg-danger-50 border border-danger-200 text-xs text-danger-700 flex items-center gap-2"
      >
        <AlertCircle :size="16" class="shrink-0" />
        <span class="text-pretty">{{ error || evidence.error.value }}</span>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-3 pt-1">
        <FhButton
          variant="secondary"
          size="md"
          class="flex-1"
          :disabled="submitting || evidence.uploading.value"
          @click="close"
        >
          Hủy bỏ
        </FhButton>
        <FhButton
          variant="primary"
          size="md"
          class="flex-1"
          :loading="submitting"
          :disabled="submitting || evidence.uploading.value || !selectable.length"
          @click="submit"
        >
          Gửi yêu cầu bảo hành
        </FhButton>
      </div>
    </div>
  </div>
</template>
