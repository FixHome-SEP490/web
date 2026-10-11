<script setup lang="ts">
import { computed, ref } from 'vue';
import { FhStatusPill, FhButton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { orderStatusLabel, roleLabel } from '../../components/console/console-labels';
import { ordersApi, type CancellationRecord } from '../../api/orders.api';
import { usePagedList } from '../../composables/usePagedList';

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

const PAGE_SIZE = 20;
const boostError = ref('');
const busyId = ref('');

// The list carries the order code and who cancelled: Service Managers may
// not read user records, and one request per row was slow besides.
const {
  page,
  items,
  total,
  loading,
  error: loadError,
  load: loadCancellations,
} = usePagedList<CancellationRecord>({
  pageSize: PAGE_SIZE,
  fetch: (p, size) => ordersApi.getCancellationsPage(p, size),
});
const rows = computed<CancellationRow[]>(() =>
  items.value.map((c) => ({
    ...c,
    orderCode: c.orderCode ?? '—',
    actorName: c.actorName ?? 'Không rõ',
  })),
);

/**
 * Cancelling costs reputation points by itself (PO 09/10/2026); the list only
 * shows what it cost. Nothing is deducted for a staff cancellation, or for a
 * technician who checked in and asked for another technician.
 */
function pointsLabel(row: CancellationRow): string {
  const delta = row.reputationDelta;
  return typeof delta === 'number' && delta < 0 ? `Trừ ${-delta} điểm uy tín` : 'Không trừ điểm';
}

async function handleGrantBoost(row: CancellationRow) {
  busyId.value = row.id;
  boostError.value = '';
  try {
    const updated = await ordersApi.reviewCancellation(row.id, { grantPriorityBoost: true });
    const index = items.value.findIndex((item) => item.id === row.id);
    if (index >= 0) items.value[index] = { ...items.value[index], ...updated };
  } catch {
    boostError.value = 'Chưa cấp được Boost, vui lòng thử lại.';
  } finally {
    busyId.value = '';
  }
}
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Huỷ đơn" :count="loading || loadError ? null : total" />

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
    <ConsolePagination v-if="!loadError" v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" />
    <p v-if="boostError" class="text-sm text-danger-600" role="alert">{{ boostError }}</p>
  </div>
</template>
