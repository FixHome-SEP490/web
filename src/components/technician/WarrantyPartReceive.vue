<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Check, PackageCheck } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { partRequestsApi, type PartRequest, type WarehouseAllocation } from '../../api/part-requests.api';
import { canTechnicianAcknowledgeWarehousePickup } from '../../utils/warehouse-fulfillment';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{ orderId: string; requestId: string }>();
const emit = defineEmits<{ (e: 'received'): void }>();

const request = ref<PartRequest | null>(null);
const allocation = ref<WarehouseAllocation | null>(null);
const loading = ref(true);
const code = ref('');
const busy = ref(false);
const error = ref('');

// Same rule as the order's parts section: a delivery on its way, or a pickup the warehouse has handed over.
const receivable = computed(() => {
  const row = request.value;
  if (!row) return false;
  if (row.fulfillmentMethod === 'delivery') return row.status === 'delivering';
  if (allocation.value?.mode === 'warehouse') return canTechnicianAcknowledgeWarehousePickup(allocation.value);
  return allocation.value?.mode === 'legacy' && row.status === 'ready';
});

onMounted(async () => {
  try {
    request.value = (await partRequestsApi.getByOrderId(props.orderId)).find((row) => row.id === props.requestId) ?? null;
    if (request.value?.fulfillmentMethod === 'pickup') allocation.value = await partRequestsApi.getWarehouseAllocation(props.requestId);
  } catch {
    request.value = null;
  } finally {
    loading.value = false;
  }
});

async function receive() {
  if (busy.value || !code.value.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    await partRequestsApi.receiveByQr(props.requestId, { qrToken: code.value.trim() });
    code.value = '';
    emit('received');
  } catch (reason) {
    error.value = userFacingError(reason, 'Mã bàn giao không hợp lệ hoặc không khớp.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form v-if="receivable" class="space-y-2" data-testid="warranty-part-receive" @submit.prevent="receive">
    <label for="warranty-part-code" class="block text-xs font-medium text-ink-600">Mã bàn giao do kho hoặc quản lý cung cấp</label>
    <input
      id="warranty-part-code"
      v-model="code"
      type="text"
      maxlength="128"
      autocomplete="off"
      placeholder="Nhập mã bàn giao"
      data-testid="warranty-part-code"
      class="w-full h-11 rounded-lg border border-ink-300 bg-white px-3 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
    />
    <p v-if="error" role="alert" class="text-xs text-danger-700">{{ error }}</p>
    <FhButton type="submit" variant="primary" size="md" block :loading="busy" :disabled="busy || !code.trim()">
      <Check :size="16" aria-hidden="true" /> Xác nhận đã nhận linh kiện
    </FhButton>
  </form>
  <router-link
    v-else-if="!loading"
    :to="{ path: `/tech/jobs/${orderId}`, query: { focus: 'parts' } }"
    class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-ink-50"
    data-testid="warranty-part-pickup-link"
  >
    <PackageCheck :size="16" aria-hidden="true" /> Mở mục linh kiện của đơn
  </router-link>
</template>
