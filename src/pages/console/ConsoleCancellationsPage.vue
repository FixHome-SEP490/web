<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { FhStatusPill, FhButton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { orderStatusLabel, roleLabel } from '../../components/console/console-labels';
import { ordersApi, type CancellationRecord } from '../../api/orders.api';

interface CancellationRow extends CancellationRecord {
  orderCode: string;
  actorName: string;
}

const columns: ConsoleColumn[] = [
  { key: 'orderCode', label: 'Mã đơn' },
  { key: 'actor', label: 'Người huỷ' },
  { key: 'state', label: 'Lúc huỷ', hideBelow: 'xl' },
  { key: 'reason', label: 'Lý do', hideBelow: 'lg' },
  { key: 'remedy', label: 'Điểm uy tín' },
  { key: 'actions', label: '', align: 'right' },
];

const loading = ref(true);
const loadError = ref(false);
const boostError = ref('');
const rows = ref<CancellationRow[]>([]);
const busyId = ref('');

/**
 * Cancelling costs reputation points by itself (PO 09/10/2026); the list only
 * shows what it cost. Nothing is deducted for a staff cancellation, or for a
 * technician who checked in and asked for another technician.
 */
function pointsLabel(row: CancellationRow): string {
  const delta = row.reputationDelta;
  return typeof delta === 'number' && delta < 0 ? `Trừ ${-delta} điểm uy tín` : 'Không trừ điểm';
}

async function loadCancellations() {
  loading.value = true;
  loadError.value = false;
  try {
    // The list carries the order code and who cancelled: Service Managers may
    // not read user records, and one request per row was slow besides.
    const list = await ordersApi.getCancellations();
    rows.value = list.map((c) => ({
      ...c,
      orderCode: c.orderCode ?? '—',
      actorName: c.actorName ?? 'Không rõ',
    }));
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function handleGrantBoost(row: CancellationRow) {
  busyId.value = row.id;
  boostError.value = '';
  try {
    const updated = await ordersApi.reviewCancellation(row.id, { grantPriorityBoost: true });
    Object.assign(row, updated);
  } catch {
    boostError.value = 'Chưa cấp được Boost, vui lòng thử lại.';
  } finally {
    busyId.value = '';
  }
}

onMounted(loadCancellations);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Huỷ đơn" :count="loading || loadError ? null : rows.length" />

    <ConsoleLoadError v-if="loadError" @retry="loadCancellations" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="rows"
      :loading="loading"
      empty-text="Chưa có đơn nào bị huỷ."
    >
      <template #cell-orderCode="{ row }">
        <span class="whitespace-nowrap font-num font-medium text-ink-900">{{ row.orderCode }}</span>
      </template>

      <template #cell-actor="{ row }">
        <div class="whitespace-nowrap text-ink-900">{{ row.actorName }}</div>
        <div class="whitespace-nowrap text-xs text-ink-500">{{ roleLabel(row.actor) }}</div>
      </template>

      <template #cell-state="{ row }">
        <FhStatusPill :status="row.stateAtCancel" :label="orderStatusLabel(row.stateAtCancel)" />
      </template>

      <template #cell-reason="{ row }">
        <span class="line-clamp-2 block max-w-64 text-ink-700" :title="row.reason">{{ row.reason }}</span>
      </template>

      <template #cell-remedy="{ row }">
        <span
          class="whitespace-nowrap"
          :class="typeof row.reputationDelta === 'number' && row.reputationDelta < 0 ? 'text-danger-600' : 'text-ink-500'"
          data-testid="cancellation-points"
        >
          {{ pointsLabel(row) }}
        </span>
      </template>

      <template #cell-actions="{ row }">
        <span v-if="row.reviewedByUserId" class="whitespace-nowrap text-ink-500">Đã xử lý</span>
        <FhButton
          v-else
          variant="secondary"
          size="sm"
          :disabled="busyId === row.id"
          @click="handleGrantBoost(row)"
        >
          Cấp Boost
        </FhButton>
      </template>
    </ConsoleTable>
    <p v-if="boostError" class="text-sm text-danger-600" role="alert">{{ boostError }}</p>
  </div>
</template>
