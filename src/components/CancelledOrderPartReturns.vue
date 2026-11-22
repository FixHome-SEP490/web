<script setup lang="ts">
/**
 * BUG DETECTOR 184: once a device of a visit is cancelled the technician no longer
 * holds the order, so the job page shows only a short read-only summary and the
 * part-request list answers 403. The return obligation itself stays readable
 * (custody rows are owned by the technician), so this block shows what is still
 * owed and lets the technician declare the return; the Service Manager then
 * accepts it from the "Hoàn trả linh kiện" queue as for any other order.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { FhButton } from './index';
import { userFacingError } from '../utils/user-facing-error';
import { partCustodyQuantities } from '../utils/part-custody-quantities';
import {
  partRequestsApi,
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  type PartCustodyReturnRecord,
} from '../api/part-requests.api';

const props = defineProps<{ orderId: string }>();

const records = ref<PartCustodyReturnRecord[]>([]);
const loaded = ref(false);
const loadError = ref<string | null>(null);
const submitting = ref<string | null>(null);
const message = ref<string | null>(null);
const keys = new Map<string, string>();

// Only real ledger rows; an onsite-stop placeholder has no item to return.
const rows = computed(() => records.value
  .filter(record => !!record.partRequestItemId && record.outstandingQty > 0)
  .map(record => ({ record, ...partCustodyQuantities(record) })));

async function load() {
  const orderId = props.orderId;
  loadError.value = null;
  try {
    const data = await partRequestsApi.getReturnsByOrderId(orderId);
    if (orderId !== props.orderId) return;
    records.value = Array.isArray(data) ? data : [];
  } catch (err) {
    if (orderId !== props.orderId) return;
    records.value = [];
    if (!isPartReturnsUnavailableError(err)) loadError.value = 'Chưa tải được linh kiện cần trả. Vui lòng thử lại.';
  } finally {
    if (orderId === props.orderId) loaded.value = true;
  }
}

async function declare(record: PartCustodyReturnRecord, quantity: number) {
  if (submitting.value || quantity < 1) return;
  const signature = `${record.partRequestItemId}:${record.version}:${quantity}`;
  let key = keys.get(signature);
  if (!key) { key = createIdempotencyKey('declare'); keys.set(signature, key); }
  submitting.value = record.partRequestItemId;
  message.value = null;
  loadError.value = null;
  try {
    await partRequestsApi.declareReturn(record.partRequestId, record.partRequestItemId, {
      quantity, expectedVersion: record.version, idempotencyKey: key,
    });
    message.value = 'Đã báo trả linh kiện. Quản lý dịch vụ sẽ nhận và xác nhận số lượng thực tế.';
  } catch (err) {
    loadError.value = userFacingError(err, 'Chưa báo trả được linh kiện. Vui lòng thử lại.');
  } finally {
    submitting.value = null;
    await load();
  }
}

watch(() => props.orderId, () => { records.value = []; loaded.value = false; message.value = null; void load(); });
onMounted(load);
</script>

<template>
  <section
    v-if="loaded && (rows.length || loadError)"
    data-testid="cancelled-part-returns"
    class="rounded-xl border border-ink-200 bg-white p-4 space-y-3"
  >
    <div>
      <h2 class="text-sm font-semibold text-ink-900">Linh kiện cần trả lại kho</h2>
      <p class="text-xs text-ink-600">Bạn không còn làm đơn này. Hãy mang linh kiện đã nhận về trả cho quản lý dịch vụ.</p>
    </div>
    <ul class="divide-y divide-ink-100">
      <li
        v-for="row in rows"
        :key="row.record.partRequestItemId"
        class="flex flex-wrap items-center justify-between gap-2 py-2"
        :data-testid="`cancelled-part-return-${row.record.partRequestItemId}`"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium text-ink-800">{{ row.record.partNameSnapshot }}</p>
          <p class="text-xs text-ink-600">
            Còn giữ <span class="font-num">{{ row.record.outstandingQty }}</span>
            <template v-if="row.awaitingManager > 0"> · Đã báo trả <span class="font-num">{{ row.awaitingManager }}</span>, chờ quản lý nhận</template>
          </p>
        </div>
        <FhButton
          v-if="row.remainingToDeclare > 0"
          size="sm"
          :loading="submitting === row.record.partRequestItemId"
          :disabled="!!submitting"
          :data-testid="`cancelled-part-return-declare-${row.record.partRequestItemId}`"
          @click="declare(row.record, row.remainingToDeclare)"
        >Báo đã trả {{ row.remainingToDeclare }}</FhButton>
      </li>
    </ul>
    <p v-if="message" class="text-sm text-ink-700" role="status">{{ message }}</p>
    <p v-if="loadError" class="text-sm text-danger-700" role="alert">{{ loadError }}</p>
  </section>
</template>
