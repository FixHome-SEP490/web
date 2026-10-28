<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import FhButton from '../FhButton.vue';
import FhCard from '../FhCard.vue';
import { supportCasesApi, type MySupportCase } from '../../api/support-cases.api';

const props = defineProps<{ orderId: string; orderStatus: string }>();
const cases = ref<MySupportCase[]>([]);
const loading = ref(false);
const loadError = ref('');
const showForm = ref(false);
const reason = ref('');
const submitting = ref(false);
const checking = ref(false);
const submitError = ref('');
const needsStatusCheck = ref(false);
const dialogElement = ref<HTMLElement | null>(null);
const reasonElement = ref<HTMLTextAreaElement | null>(null);
let dialogOpener: HTMLElement | null = null;
let generation = 0;

const isUnderRepair = computed(() => String(props.orderStatus).toUpperCase() === 'UNDER_REPAIR');
const requestCase = computed(() => cases.value.find(item => item.requestIntent === 'stop_or_replace' && item.serviceOrderId === props.orderId) ?? null);
const statusText = computed(() => {
  switch (requestCase.value?.status) {
    case 'open': return 'Đã gửi yêu cầu';
    case 'in_review': return 'Quản lý đang xem xét';
    case 'resolved': return 'Quản lý đã xử lý yêu cầu';
    case 'rejected': return 'Yêu cầu không được chấp nhận';
    default: return '';
  }
});
const activeRequest = computed(() => requestCase.value?.status === 'open' || requestCase.value?.status === 'in_review');
const canSubmit = computed(() => reason.value.trim().length >= 10 && reason.value.trim().length <= 2000 && !submitting.value && !needsStatusCheck.value);

async function loadCases() {
  const currentGeneration = ++generation;
  if (!props.orderId || !isUnderRepair.value) {
    loading.value = false;
    loadError.value = '';
    cases.value = [];
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const result = await supportCasesApi.listMine({ serviceOrderId: props.orderId, limit: 20 });
    if (currentGeneration === generation && props.orderId) cases.value = result.data;
  } catch {
    if (currentGeneration === generation) loadError.value = 'Chưa tải được trạng thái yêu cầu. Vui lòng thử lại.';
  } finally {
    if (currentGeneration === generation) loading.value = false;
  }
}

function openForm() {
  reason.value = '';
  submitError.value = '';
  needsStatusCheck.value = false;
  showForm.value = true;
}

watch(showForm, async open => {
  if (open) {
    dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    reasonElement.value?.focus();
  } else {
    dialogOpener?.focus();
  }
});

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !submitting.value && !needsStatusCheck.value) {
    showForm.value = false;
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = [...(dialogElement.value?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)') ?? [])];
  const first = controls[0];
  const last = controls.at(-1);
  if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}

async function checkStatus() {
  if (checking.value || submitting.value) return;
  checking.value = true;
  submitError.value = '';
  try {
    await loadCases();
    if (loadError.value) {
      submitError.value = loadError.value;
      needsStatusCheck.value = true;
      return;
    }
    if (requestCase.value) {
      showForm.value = false;
      needsStatusCheck.value = false;
    } else {
      needsStatusCheck.value = false;
      submitError.value = 'Chưa thấy yêu cầu được ghi nhận. Bạn có thể thử gửi lại.';
    }
  } finally {
    checking.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = '';
  try {
    const created = await supportCasesApi.requestStopOrReplace(props.orderId, reason.value.trim());
    cases.value = [created, ...cases.value.filter(item => item.id !== created.id)];
    showForm.value = false;
    needsStatusCheck.value = false;
  } catch {
    submitError.value = 'Chưa xác nhận được kết quả. Hãy kiểm tra trạng thái trước khi gửi lại.';
    needsStatusCheck.value = true;
  } finally {
    submitting.value = false;
  }
}

watch(() => [props.orderId, props.orderStatus] as const, () => {
  showForm.value = false;
  needsStatusCheck.value = false;
  void loadCases();
}, { immediate: true });
</script>

<template>
  <FhCard v-if="isUnderRepair" title="Dừng sửa hoặc đổi thợ" data-testid="stop-replace-card">
    <div class="space-y-3 text-sm">
      <div v-if="loading" role="status" aria-busy="true" data-testid="stop-replace-loading" class="text-ink-600">Đang tải trạng thái yêu cầu…</div>
      <div v-else-if="loadError" class="space-y-2" role="alert">
        <p class="text-danger-700">{{ loadError }}</p>
        <FhButton variant="secondary" size="md" data-testid="stop-replace-load-retry" @click="loadCases">Thử lại</FhButton>
      </div>
      <template v-else-if="requestCase">
        <div class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-warning-800" :data-testid="`stop-replace-status-${requestCase.status}`" role="status" aria-live="polite">
          <p class="font-semibold">{{ statusText }}</p>
          <p v-if="activeRequest" class="mt-1">Đơn chưa bị hủy. Quản lý sẽ xem xét yêu cầu và cập nhật kết quả.</p>
          <p v-else-if="requestCase.resolutionReason" class="mt-1 whitespace-pre-line">{{ requestCase.resolutionReason }}</p>
        </div>
        <FhButton v-if="activeRequest" variant="secondary" size="md" :loading="checking" :disabled="checking" data-testid="stop-replace-refresh" @click="checkStatus">Kiểm tra trạng thái</FhButton>
      </template>
      <template v-else>
        <p class="text-ink-600">Gửi yêu cầu để quản lý xem xét. Đây chưa phải yêu cầu hủy đơn và không bảo đảm đổi thợ ngay.</p>
        <FhButton variant="secondary" size="md" data-testid="stop-replace-open" @click="openForm">Yêu cầu dừng sửa / Đổi thợ</FhButton>
      </template>
    </div>

    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="!submitting && !needsStatusCheck && (showForm = false)">
      <section ref="dialogElement" class="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="stop-replace-title" tabindex="-1" data-testid="stop-replace-dialog" @keydown="onDialogKeydown">
        <div class="flex items-start justify-between gap-3">
          <h2 id="stop-replace-title" class="text-lg font-semibold text-ink-900">Yêu cầu dừng sửa / Đổi thợ</h2>
          <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="Đóng" :disabled="submitting || needsStatusCheck" @click="showForm = false">×</button>
        </div>
        <p class="text-sm text-ink-700">Yêu cầu này sẽ được quản lý xem xét. Đơn chưa bị hủy, việc dừng tại chỗ cần trao đổi với kỹ thuật viên.</p>
        <label for="stop-replace-reason" class="block text-sm font-medium text-ink-800">Lý do</label>
        <textarea id="stop-replace-reason" ref="reasonElement" v-model="reason" data-testid="stop-replace-reason" rows="4" maxlength="2000" class="w-full rounded-xl border border-ink-300 p-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-describedby="stop-replace-reason-hint" />
        <p id="stop-replace-reason-hint" class="text-xs text-ink-500">Từ 10 đến 2.000 ký tự.</p>
        <p v-if="submitError" class="text-sm text-danger-700" role="alert">{{ submitError }}</p>
        <FhButton v-if="needsStatusCheck" variant="secondary" size="md" :loading="checking" :disabled="checking || submitting" data-testid="stop-replace-check-status" @click="checkStatus">Kiểm tra trạng thái</FhButton>
        <div class="flex justify-end gap-2">
          <FhButton variant="ghost" size="md" :disabled="submitting || needsStatusCheck" @click="showForm = false">Để sau</FhButton>
          <FhButton variant="primary" size="md" :disabled="!canSubmit" :loading="submitting" data-testid="stop-replace-submit" @click="submit">Gửi yêu cầu</FhButton>
        </div>
      </section>
    </div>
  </FhCard>
</template>
