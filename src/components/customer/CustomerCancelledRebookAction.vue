<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import FhButton from '../FhButton.vue';
import { readRepairFailureSources } from '../../api/failed-repair.api';
import { supportCasesApi } from '../../api/support-cases.api';
import { repairFailureWizardLocation } from '../../utils/customer-rebook-routing';

type Kind = 'repair-failure' | 'interrupted' | 'ordinary' | null;
const props = defineProps<{ bookingId: string; orderId: string; status: string }>();
const emit = defineEmits<{ legacy: [] }>();
const router = useRouter();
const kind = ref<Kind>(null);
const sourceIds = ref<string[]>([]);
const loading = ref(false);
const failed = ref(false);
const retryToken = ref(0);
let generation = 0;

async function classify() {
  const request = ++generation;
  kind.value = null;
  sourceIds.value = [];
  failed.value = false;
  if (!props.bookingId || !props.orderId || String(props.status).toUpperCase() !== 'CANCELLED') {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const repairSources = await readRepairFailureSources(props.bookingId);
    if (request !== generation) return;
    if (repairSources) {
      sourceIds.value = repairSources;
      kind.value = 'repair-failure';
      return;
    }
    const result = await supportCasesApi.listMine({ serviceOrderId: props.orderId, status: 'resolved', limit: 50 });
    if (request !== generation) return;
    const interruptionResults = result.data.filter(item => item.resolutionCode === 'interrupted_for_rebook');
    const interrupted = interruptionResults.some(item =>
      (item.bookingId === props.bookingId || (item.bookingId === null && item.caseType === 'technician_replacement'))
      && item.serviceOrderId === props.orderId
      && ['mid_job_interruption', 'technician_replacement'].includes(item.caseType)
      && item.status === 'resolved' && item.resolutionCode === 'interrupted_for_rebook');
    if (interruptionResults.length && !interrupted) throw new Error('Mismatched interruption source case.');
    kind.value = interrupted ? 'interrupted' : 'ordinary';
  } catch {
    if (request === generation) failed.value = true;
  } finally {
    if (request === generation) loading.value = false;
  }
}

function open() {
  if (loading.value || failed.value) return;
  if (kind.value === 'repair-failure') void router.push(repairFailureWizardLocation(sourceIds.value));
  else if (kind.value === 'interrupted') void router.push({ path: '/app/bookings/new', query: { interruptionRebook: props.bookingId } });
  else if (kind.value === 'ordinary') emit('legacy');
}

watch(() => [props.bookingId, props.orderId, props.status, retryToken.value], classify);
onMounted(classify);
</script>

<template>
  <div v-if="String(status).toUpperCase() === 'CANCELLED'" class="flex items-center gap-2" data-testid="cancelled-rebook-action">
    <FhButton v-if="loading" variant="secondary" size="sm" loading disabled data-testid="cancelled-rebook-classifying">Đang kiểm tra đặt lại…</FhButton>
    <FhButton v-else-if="kind === 'repair-failure'" variant="secondary" size="sm" data-testid="cancelled-rebook-repair-failure" @click="open">Đặt lại</FhButton>
    <FhButton v-else-if="kind === 'interrupted'" variant="secondary" size="sm" data-testid="cancelled-rebook-interrupted" @click="open">Đặt lịch mới</FhButton>
    <FhButton v-else-if="kind === 'ordinary'" variant="secondary" size="sm" data-testid="cancelled-rebook-legacy" @click="open">Đặt lại thợ</FhButton>
    <div v-else-if="failed" class="flex items-center gap-2 text-xs text-danger-700" role="alert" data-testid="cancelled-rebook-error">
      <span>Chưa xác định được cách đặt lại đơn này.</span>
      <button type="button" class="font-semibold underline" data-testid="cancelled-rebook-retry" @click="retryToken++">Thử lại</button>
    </div>
  </div>
</template>
