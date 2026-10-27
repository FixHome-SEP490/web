<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';
import { FhButton, FhSkeleton } from '..';
import { blockedFailedRepair, failedRepairKey, type FailedRepairIncident } from '../../api/failed-repair.api';
import { REPAIR_FAILURE_REASONS } from '../../api/visit-groups.api';
import { formatDateTimeVN } from '../../utils/formatters';

const props = defineProps<{ bookingId: string }>();
const emit = defineEmits<{ rebook: [bookingId: string]; later: [] }>();
const api = inject(failedRepairKey, blockedFailedRepair);
const incident = ref<FailedRepairIncident | null>(null);
const loading = ref(false);
const error = ref('');
const supportLabels = { open: 'Đã tiếp nhận', in_progress: 'Đang xử lý', resolved: 'Đã giải quyết', closed: 'Đã đóng' };
let epoch = 0;
async function load() {
  const request = ++epoch;
  incident.value = null;
  loading.value = false;
  error.value = '';
  if (!api.available) { error.value = 'Chi tiết lý do và hỗ trợ hiện chưa sẵn sàng.'; return; }
  loading.value = true;
  try {
    const result = await api.readIncident(props.bookingId);
    if (request !== epoch) return;
    if (result.bookingId !== props.bookingId || !REPAIR_FAILURE_REASONS.some(reason => reason.code === result.reason)) throw new Error('Invalid incident');
    incident.value = result;
  } catch { if (request === epoch) error.value = 'Chưa tải được lý do không sửa được. Vui lòng thử lại.'; }
  finally { if (request === epoch) loading.value = false; }
}
watch(() => props.bookingId, load, { immediate: true });
onBeforeUnmount(() => { epoch++; });
</script>

<template>
  <section class="mt-3 space-y-3 border-t border-ink-100 pt-4" aria-label="Kết quả không sửa được" data-testid="failed-repair-incident">
    <h3 class="text-sm font-semibold text-danger-700">Máy này không sửa được</h3>
    <FhSkeleton v-if="loading" aria-label="Đang tải lý do" class="h-16 rounded-xl" />
    <template v-if="incident">
      <p class="text-sm text-ink-800">{{ REPAIR_FAILURE_REASONS.find(reason => reason.code === incident?.reason)?.label }}</p>
      <p v-if="incident.note" class="break-words whitespace-pre-line text-sm text-ink-700">{{ incident.note }}</p>
      <p v-if="incident.reportedAt" class="text-xs text-ink-600">Ghi nhận: {{ formatDateTimeVN(incident.reportedAt) }}</p>
      <p v-if="incident.supportStatus && supportLabels[incident.supportStatus]" class="break-words text-sm text-ink-700">Hỗ trợ: {{ supportLabels[incident.supportStatus] }}</p>
    </template>
    <div v-if="error" role="status" class="text-sm text-ink-600"><p>{{ error }}</p><FhButton v-if="api.available" variant="ghost" size="md" @click="load">Thử lại</FhButton></div>
    <p class="text-sm text-ink-600">Lịch sử lượt sửa và kết quả từng máy được giữ lại.</p>
    <div class="flex flex-col gap-2 sm:flex-row"><FhButton size="md" data-testid="failed-repair-rebook" @click="emit('rebook', bookingId)">Đặt lại máy này</FhButton><FhButton variant="ghost" size="md" @click="emit('later')">Để sau</FhButton></div>
  </section>
</template>
