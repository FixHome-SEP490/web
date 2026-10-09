<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhCard from '../FhCard.vue';
import FhStatusPill from '../FhStatusPill.vue';
import FhSkeleton from '../FhSkeleton.vue';
import {
  supportCasesApi,
  type MySupportCase,
  type SupportCaseType,
} from '../../api/support-cases.api';
import { supportCaseStatusLabels, getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';
import { formatDateTimeVN } from '../../utils/formatters';
import {
  ACTIVE_ORDER_STATUSES,
  allowedComplaintTypes,
  complaintTypeLabel,
  type ComplaintRole,
} from '../../utils/order-complaint';

const props = withDefaults(
  defineProps<{
    orderId: string;
    orderStatus: string;
    completedAt?: string | null;
    role?: ComplaintRole;
    /**
     * Inline: shown only once a report exists, without the empty text and footer button;
     * the page opens the form itself through the exposed `openForm` (technician job page).
     */
    inline?: boolean;
  }>(),
  { role: 'customer', completedAt: null, inline: false },
);

const isTechnician = computed(() => props.role === 'technician');
const copy = computed(() =>
  isTechnician.value
    ? {
        title: 'Báo cáo vấn đề về đơn này',
        hint: 'Có vấn đề với khách hàng hoặc đơn này? Báo cho quản lý dịch vụ.',
        closed: 'Đơn này không còn nhận báo cáo vấn đề.',
        open: 'Báo cáo vấn đề',
        formTitle: 'Báo cáo vấn đề',
        sent: 'Đã gửi báo cáo. Quản lý dịch vụ sẽ phản hồi cho bạn sớm nhất.',
        loadError: 'Không thể tải danh sách báo cáo. Vui lòng thử lại.',
      }
    : {
        title: 'Khiếu nại về đơn này',
        hint: 'Có vấn đề với kỹ thuật viên hoặc đơn này? Gửi khiếu nại để FixHome xử lý.',
        closed: 'Đơn này không còn nhận khiếu nại. Nếu còn hạn bảo hành, hãy gửi yêu cầu bảo hành.',
        open: 'Gửi khiếu nại',
        formTitle: 'Gửi khiếu nại',
        sent: 'Đã gửi khiếu nại. Quản lý dịch vụ sẽ phản hồi cho bạn sớm nhất.',
        loadError: 'Không thể tải danh sách khiếu nại. Vui lòng thử lại.',
      },
);

const MIN_REASON_LENGTH = 10;
const evidence = useEvidencePhotos();

const cases = ref<MySupportCase[]>([]);
const loading = ref(true);
const loadError = ref('');
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const showForm = ref(false);
const submitting = ref(false);
const formError = ref('');
const caseType = ref<SupportCaseType | ''>('');
const reason = ref('');
const isUrgent = ref(false);
const typeSelect = ref<HTMLSelectElement | null>(null);

const typeOptions = computed(() =>
  allowedComplaintTypes(props.orderStatus, props.completedAt, new Date(), props.role).map((value) => ({
    value,
    label: complaintTypeLabel(value, props.role),
  })),
);
const canComplain = computed(() => typeOptions.value.length > 0);
const canMarkUrgent = computed(() => ACTIVE_ORDER_STATUSES.includes(props.orderStatus.toUpperCase()));
const isOpenCase = (item: MySupportCase) => item.status === 'open' || item.status === 'in_review';

async function loadCases() {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await supportCasesApi.listMine({ serviceOrderId: props.orderId, limit: 20 });
    cases.value = result.data;
  } catch (reason) {
    loadError.value = getSupportErrorMessage(reason, copy.value.loadError);
  } finally {
    loading.value = false;
  }
}

function openForm() {
  notice.value = null;
  formError.value = '';
  caseType.value = typeOptions.value[0]?.value ?? '';
  reason.value = '';
  isUrgent.value = false;
  evidence.reset();
  showForm.value = true;
  nextTick(() => typeSelect.value?.focus());
}

function closeForm() {
  if (submitting.value || evidence.uploading.value) return;
  showForm.value = false;
}

async function submit() {
  if (submitting.value || evidence.uploading.value) return;
  const trimmed = reason.value.trim();
  if (!caseType.value) {
    formError.value = 'Vui lòng chọn loại vấn đề.';
    return;
  }
  if (trimmed.length < MIN_REASON_LENGTH) {
    formError.value = `Vui lòng mô tả vấn đề ít nhất ${MIN_REASON_LENGTH} ký tự.`;
    return;
  }
  submitting.value = true;
  formError.value = '';
  try {
    await supportCasesApi.createCase({
      caseType: caseType.value,
      reason: trimmed,
      serviceOrderId: props.orderId,
      ...(evidence.photos.value.length ? { evidenceRefs: evidence.urls() } : {}),
      ...(isUrgent.value && canMarkUrgent.value ? { isUrgent: true } : {}),
    });
    showForm.value = false;
    notice.value = { type: 'success', text: copy.value.sent };
    await loadCases();
  } catch (reason) {
    formError.value = getSupportErrorMessage(reason, 'Chưa xác nhận được kết quả. Vui lòng kiểm tra danh sách khiếu nại trước khi gửi lại.');
  } finally {
    submitting.value = false;
  }
}

defineExpose({ openForm });

onMounted(loadCases);
watch(() => props.orderId, loadCases);
</script>

<template>
  <FhCard v-if="!inline || cases.length > 0 || notice || loadError" :title="inline ? 'Báo cáo đã gửi' : copy.title">
    <div class="space-y-3 text-sm">
      <p
        v-if="notice"
        role="status"
        class="p-3 rounded-[var(--radius-sm)] text-xs border"
        :class="notice.type === 'success' ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'"
      >
        {{ notice.text }}
      </p>

      <div v-if="loading && !inline" aria-busy="true" aria-label="Đang tải"><FhSkeleton height="18px" :count="2" /></div>
      <p v-else-if="loadError" role="alert" class="text-sm text-danger-700">{{ loadError }}</p>
      <p v-else-if="cases.length === 0 && !inline" class="text-sm text-ink-600">
        {{ copy.empty }}
      </p>

      <ul v-else-if="cases.length > 0" class="space-y-2">
        <li
          v-for="item in cases"
          :key="item.id"
          class="p-3 rounded-[var(--radius-sm)] border border-ink-200 bg-white space-y-1.5"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-ink-900">{{ complaintTypeLabel(item.caseType, role) }}</span>
            <FhStatusPill :status="item.status" :label="supportCaseStatusLabels[item.status]" />
            <span v-if="item.isUrgent && isOpenCase(item)" class="text-[11px] font-semibold text-danger-700">
              Cần hỗ trợ ngay
            </span>
          </div>
          <p class="text-xs text-ink-700 whitespace-pre-line">{{ item.reason }}</p>
          <p v-if="isOpenCase(item) && item.respondBy" class="text-xs text-ink-500">
            Quản lý dịch vụ dự kiến phản hồi trước {{ formatDateTimeVN(item.respondBy) }}
          </p>
          <p v-if="item.resolutionReason" class="text-xs text-ink-800 bg-ink-50 p-2 rounded-[var(--radius-sm)]">
            <span class="font-semibold">Kết quả xử lý:</span> {{ item.resolutionReason }}
          </p>
          <p class="text-xs text-ink-500 font-num">Gửi lúc {{ formatDateTimeVN(item.createdAt) }}</p>
        </li>
      </ul>

      <div v-if="!inline" class="flex flex-wrap items-center justify-between gap-3" :class="cases.length > 0 ? 'pt-3 border-t border-ink-100' : ''">
        <span class="text-sm text-ink-600 text-pretty">
          <template v-if="canComplain">{{ copy.hint }}</template>
          <template v-else>{{ copy.closed }}</template>
        </span>
        <FhButton variant="secondary" size="sm" :disabled="!canComplain" @click="openForm">
          {{ copy.open }}
        </FhButton>
      </div>
    </div>
  </FhCard>

  <div
    v-if="showForm"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    @keydown.esc="closeForm"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="complaint-form-title"
      class="bg-white rounded-[var(--radius-lg)] max-w-md w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
    >
      <h3 id="complaint-form-title" class="text-base font-bold text-ink-900">{{ copy.formTitle }}</h3>

      <div class="space-y-1">
        <label for="complaint-type" class="text-xs font-medium text-ink-700">Loại vấn đề</label>
        <select
          id="complaint-type"
          ref="typeSelect"
          v-model="caseType"
          class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
        >
          <option v-for="option in typeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="complaint-reason" class="text-xs font-medium text-ink-700">Mô tả vấn đề</label>
        <textarea
          id="complaint-reason"
          v-model="reason"
          rows="4"
          maxlength="2000"
          placeholder="Mô tả rõ điều đã xảy ra để quản lý dịch vụ xử lý nhanh hơn"
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

      <label v-if="canMarkUrgent" class="flex items-start gap-2 text-xs text-ink-800">
        <input v-model="isUrgent" type="checkbox" class="mt-0.5" />
        <span>Cần quản lý dịch vụ hỗ trợ ngay (đơn đang được thực hiện)</span>
      </label>

      <p v-if="formError || evidence.error.value" role="alert" class="text-xs text-danger-700">{{ formError || evidence.error.value }}</p>

      <div class="flex gap-2 pt-2">
        <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting || evidence.uploading.value" @click="closeForm">
          Đóng
        </FhButton>
        <FhButton
          variant="primary"
          size="sm"
          class="flex-1"
          :loading="submitting"
          :disabled="submitting || evidence.uploading.value"
          @click="submit"
        >
          {{ submitting ? 'Đang gửi yêu cầu…' : copy.open }}
        </FhButton>
      </div>
    </div>
  </div>
</template>
