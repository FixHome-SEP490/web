<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Ban, Zap } from 'lucide-vue-next';
import { FhCard, FhTable, FhStatusPill, FhButton, FhSkeleton, FhEmptyState } from '../../components';
import { ordersApi, type CancellationRecord } from '../../api/orders.api';

interface CancellationRow extends CancellationRecord {
  orderCode: string;
  actorName: string;
}

/** Role codes shown as words. */
const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  TECHNICIAN: 'Kỹ thuật viên',
  SERVICE_MANAGER: 'Quản lý dịch vụ',
  ADMIN: 'Quản trị viên',
};
const roleLabel = (role: unknown) => ROLE_LABELS[String(role ?? '').toUpperCase()] ?? 'Không rõ';

const loading = ref(true);
const loadError = ref('');
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
  loadError.value = '';
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
    loadError.value = 'Không thể tải danh sách huỷ đơn. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
}

async function handleGrantBoost(row: CancellationRow) {
  busyId.value = row.id;
  try {
    const updated = await ordersApi.reviewCancellation(row.id, { grantPriorityBoost: true });
    Object.assign(row, updated);
  } catch {
    window.alert('Không thể cấp Priority Boost. Vui lòng thử lại.');
  } finally {
    busyId.value = '';
  }
}

onMounted(loadCancellations);
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Ban class="text-danger-600" :size="24" />
          Huỷ đơn & Priority Boost
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Ai huỷ, huỷ lúc nào, đã trừ bao nhiêu điểm uy tín. Huỷ đơn tự trừ điểm; điều chỉnh điểm ở trang Điểm uy tín. Cấp Priority Boost cho thợ khi khách huỷ sau khi thợ đã đến.
        </p>
      </div>
    </div>

    <FhCard>
      <div v-if="loading" class="p-6 space-y-3">
        <FhSkeleton height="40px" :count="3" />
      </div>
      <FhEmptyState
        v-else-if="loadError"
        title="Không tải được danh sách"
        :description="loadError"
        action-text="Thử lại"
        @action="loadCancellations"
      />
      <FhEmptyState
        v-else-if="rows.length === 0"
        title="Chưa có ca huỷ đơn nào"
        description="Danh sách sẽ hiện ở đây khi có booking/đơn bị huỷ."
      />
      <FhTable
        v-else
        :columns="[
          { key: 'orderCode', label: 'Mã đơn huỷ' },
          { key: 'actor', label: 'Đối tượng huỷ' },
          { key: 'state', label: 'Thời điểm huỷ' },
          { key: 'reason', label: 'Lý do ghi nhận' },
          { key: 'remedy', label: 'Điểm uy tín' },
          { key: 'actions', label: 'Xử lý', width: '140px' },
        ]"
        :rows="rows"
      >
        <template #cell-orderCode="{ row }">
          <span class="font-mono text-xs font-bold text-ink-900">{{ row.orderCode }}</span>
        </template>

        <template #cell-actor="{ row }">
          <div class="font-semibold text-xs text-ink-900">{{ row.actorName }}</div>
          <span
            class="text-[10px] font-bold px-1.5 py-0.5 rounded"
            :class="String(row.actor).toUpperCase() === 'CUSTOMER' ? 'bg-ink-100 text-ink-800' : 'bg-brand-50 text-brand-700'"
          >
            {{ roleLabel(row.actor) }}
          </span>
        </template>

        <template #cell-state="{ row }">
          <FhStatusPill :status="row.stateAtCancel" />
        </template>

        <template #cell-reason="{ row }">
          <span class="block max-w-[220px] whitespace-normal break-words text-xs text-ink-600 italic line-clamp-2">"{{ row.reason }}"</span>
        </template>

        <template #cell-remedy="{ row }">
          <span
            class="text-xs font-semibold whitespace-nowrap"
            :class="typeof row.reputationDelta === 'number' && row.reputationDelta < 0 ? 'text-danger-600' : 'text-ink-500'"
            data-testid="cancellation-points"
          >
            {{ pointsLabel(row) }}
          </span>
        </template>

        <template #cell-actions="{ row }">
          <span v-if="row.reviewedByUserId" class="text-xs text-ink-400 font-semibold">Đã xử lý</span>
          <FhButton
            v-else
            variant="primary"
            size="sm"
            class="whitespace-nowrap"
            :disabled="busyId === row.id"
            @click="handleGrantBoost(row)"
          >
            <Zap :size="13" class="mr-1" /> Cấp Boost
          </FhButton>
        </template>
      </FhTable>
    </FhCard>

  </div>
</template>
