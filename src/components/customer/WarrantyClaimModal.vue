<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { ordersApi, type WarrantyClaimView } from '../../api/orders.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';
import { formatDateVN } from '../../utils/formatters';

export interface ClaimableCoverage {
  id: string;
  itemDescription: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED';
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

const selectable = computed(() => props.coverages.filter((c) => !props.busyCoverageIds.includes(c.id)));
const selected = computed(() => props.coverages.find((c) => c.id === selectedId.value) ?? null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedId.value = selectable.value.find((c) => c.status === 'ACTIVE')?.id ?? selectable.value[0]?.id ?? '';
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
    error.value = 'Vui lòng chọn hạng mục cần bảo hành.';
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4"
    @keydown.esc="close"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="warranty-claim-title"
      class="bg-white rounded-[var(--radius-lg)] max-w-md w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between">
        <h3 id="warranty-claim-title" class="text-base font-bold text-ink-900">Yêu cầu bảo hành</h3>
        <button type="button" class="p-1 rounded-full hover:bg-ink-100" aria-label="Đóng" @click="close">
          <X :size="18" />
        </button>
      </div>

      <p class="text-xs text-ink-600">
        Đơn <span class="font-mono font-bold text-brand-700">{{ orderCode }}</span> · {{ serviceName }} ·
        Kỹ thuật viên phụ trách: {{ technicianName }}
      </p>

      <fieldset class="space-y-1.5">
        <legend class="text-xs font-medium text-ink-700 mb-1">Hạng mục cần bảo hành</legend>
        <label
          v-for="coverage in coverages"
          :key="coverage.id"
          class="flex items-start gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs"
          :class="[
            busyCoverageIds.includes(coverage.id) ? 'opacity-60 border-ink-200' : 'border-ink-300 cursor-pointer',
            selectedId === coverage.id ? 'border-brand-600 bg-brand-50' : '',
          ]"
        >
          <input
            v-model="selectedId"
            type="radio"
            name="warranty-coverage"
            class="mt-0.5"
            :value="coverage.id"
            :disabled="busyCoverageIds.includes(coverage.id)"
          />
          <span class="flex-1">
            <span class="block font-medium text-ink-900">{{ coverage.itemDescription }}</span>
            <span class="block text-ink-500">
              Hạn bảo hành: {{ formatDateVN(coverage.expiresAt) }} ·
              {{ coverage.status === 'ACTIVE' ? 'Còn hạn' : 'Đã hết hạn' }}
              <template v-if="busyCoverageIds.includes(coverage.id)"> · Đang có yêu cầu chưa xử lý xong</template>
            </span>
          </span>
        </label>
      </fieldset>

      <p
        v-if="selected && selected.status !== 'ACTIVE'"
        role="status"
        class="p-2.5 rounded-[var(--radius-sm)] bg-warning-50 text-warning-700 text-xs"
      >
        Hạng mục này đã hết hạn bảo hành. Bạn vẫn có thể gửi yêu cầu, quản lý dịch vụ sẽ xem xét và phản hồi.
      </p>

      <div class="space-y-1">
        <label for="warranty-claim-description" class="text-xs font-medium text-ink-700">Mô tả sự cố</label>
        <textarea
          id="warranty-claim-description"
          v-model="description"
          rows="4"
          maxlength="2000"
          placeholder="Mô tả hiện tượng lỗi xuất hiện lại sau khi sửa"
          class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
        ></textarea>
      </div>

      <div class="space-y-2">
        <span class="text-xs font-medium text-ink-700">Ảnh đính kèm (không bắt buộc, tối đa {{ evidence.maxPhotos }} ảnh)</span>
        <div v-if="evidence.photos.value.length" class="flex flex-wrap gap-2">
          <div v-for="(photo, index) in evidence.photos.value" :key="photo.url" class="relative">
            <img :src="photo.url" :alt="photo.name" class="w-16 h-16 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
            <button
              type="button"
              class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-ink-300 flex items-center justify-center"
              :aria-label="`Bỏ ảnh ${photo.name}`"
              @click="evidence.remove(index)"
            >
              <X :size="12" />
            </button>
          </div>
        </div>
        <label
          class="inline-flex items-center gap-1.5 h-[36px] px-3 text-sm rounded-[var(--radius-sm)] border border-ink-300 cursor-pointer hover:bg-ink-50"
          :class="{ 'opacity-60 pointer-events-none': evidence.uploading.value || evidence.photos.value.length >= evidence.maxPhotos }"
        >
          <Camera :size="14" />
          {{ evidence.uploading.value ? 'Đang tải ảnh…' : 'Thêm ảnh' }}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="evidence.pick" />
        </label>
      </div>

      <p v-if="error || evidence.error.value" role="alert" class="text-xs text-danger-700">{{ error || evidence.error.value }}</p>

      <div class="flex gap-2 pt-2">
        <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting || evidence.uploading.value" @click="close">
          Đóng
        </FhButton>
        <FhButton
          variant="primary"
          size="sm"
          class="flex-1"
          :loading="submitting"
          :disabled="submitting || evidence.uploading.value || !selectable.length"
          @click="submit"
        >
          {{ submitting ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu bảo hành' }}
        </FhButton>
      </div>
    </div>
  </div>
</template>
