<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Ban, Zap, ShieldAlert } from 'lucide-vue-next';
import { FhCard, FhTable, FhStatusPill, FhButton, FhSkeleton, FhEmptyState } from '../../components';
import { ordersApi, type CancellationRecord } from '../../api/orders.api';
import { adminUsersApi } from '../../api/admin-users.api';

interface CancellationRow extends CancellationRecord {
  orderCode: string;
  actorName: string;
}

const loading = ref(true);
const loadError = ref('');
const rows = ref<CancellationRow[]>([]);
const busyId = ref('');

async function loadCancellations() {
  loading.value = true;
  loadError.value = '';
  try {
    const list = await ordersApi.getCancellations();
    rows.value = await Promise.all(
      list.map(async (c) => {
        const [order, actorUser] = await Promise.all([
          ordersApi.getOrder(c.serviceOrderId).catch(() => null),
          adminUsersApi.getUser(c.actorUserId).catch(() => null),
        ]);
        return {
          ...c,
          orderCode: order?.code ?? c.serviceOrderId,
          actorName: actorUser?.fullName ?? c.actorUserId,
        };
      }),
    );
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

async function handleWaiveStrike(row: CancellationRow) {
  const reason = window.prompt('Lý do miễn Strike:');
  if (!reason) return;
  busyId.value = row.id;
  try {
    const updated = await ordersApi.reviewCancellation(row.id, { waiveStrike: true, waiveReason: reason });
    Object.assign(row, updated);
  } catch {
    window.alert('Không thể miễn Strike. Vui lòng thử lại.');
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
          Quản lý Huỷ đơn, Strike & Priority Boost
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi nguồn gốc huỷ đơn (Customer / Technician), miễn Strike oan và cấp Priority Boost cho thợ khi khách huỷ sau arrival.
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
          { key: 'remedy', label: 'Biện pháp chế tài' },
          { key: 'actions', label: 'Xử lý', width: '200px' },
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
            {{ String(row.actor).toUpperCase() }}
          </span>
        </template>

        <template #cell-state="{ row }">
          <FhStatusPill :status="row.stateAtCancel" />
        </template>

        <template #cell-reason="{ row }">
          <span class="text-xs text-ink-600 italic line-clamp-2">"{{ row.reason }}"</span>
        </template>

        <template #cell-remedy="{ row }">
          <div class="space-y-1">
            <div v-if="row.strikeApplied" class="flex items-center gap-1 text-[11px] font-semibold text-danger-600">
              <ShieldAlert :size="12" /> +1 Strike vi phạm
            </div>
            <span v-if="!row.reviewedByUserId" class="text-[10px] text-warning-600 font-semibold">
              Chờ SM xử lý
            </span>
            <span v-else class="text-[10px] text-success-600 font-semibold">Đã xử lý</span>
          </div>
        </template>

        <template #cell-actions="{ row }">
          <span v-if="row.reviewedByUserId" class="text-xs text-ink-400 font-semibold">Đã xử lý</span>
          <div v-else class="flex items-center gap-2">
            <FhButton
              variant="primary"
              size="sm"
              :disabled="busyId === row.id"
              @click="handleGrantBoost(row)"
            >
              <Zap :size="13" class="mr-1" /> Cấp Boost
            </FhButton>
            <FhButton
              v-if="row.strikeApplied"
              variant="ghost"
              size="sm"
              :disabled="busyId === row.id"
              @click="handleWaiveStrike(row)"
            >
              Miễn Strike
            </FhButton>
          </div>
        </template>
      </FhTable>
    </FhCard>
  </div>
</template>
