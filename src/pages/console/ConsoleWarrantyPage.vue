<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { FhButton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../components/console/console-ui';
import WarrantyDecisionModal, { type WarrantyDecisionMode } from '../../components/console/WarrantyDecisionModal.vue';
import {
  warrantyManagerApi,
  type StaffWarrantyClaim,
  type TechnicianWarrantyStat,
} from '../../api/warranty-claims.api';
import { useAuthStore } from '../../stores/auth';
import { formatDateTimeVN } from '../../utils/formatters';
import {
  managerClaimDisplayMeta,
  warrantyClaimStatusMeta,
  warrantyClaimToneClasses,
  type WarrantyClaimStatus,
} from '../../utils/warranty-claim';
import { getSupportErrorMessage } from './support-cases.utils';

const authStore = useAuthStore();
const canDecide = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const tab = ref<'queue' | 'rates'>('queue');
const claims = ref<StaffWarrantyClaim[]>([]);
const loading = ref(true);
const error = ref('');
const actionError = ref('');
const notice = ref('');
const page = ref(1);
const limit = 10;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const statusFilter = ref<WarrantyClaimStatus | ''>('');
const unassignedOnly = ref(false);
const reviewOnly = ref(false);
const technicians = ref<{ id: string; fullName: string }[]>([]);

const modalClaim = ref<StaffWarrantyClaim | null>(null);
const modalMode = ref<WarrantyDecisionMode | null>(null);

const stats = ref<TechnicianWarrantyStat[]>([]);
const statsLoading = ref(false);
const statsError = ref('');
const windowDays = ref(90);

let latestRequest = 0;

async function loadQueue() {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
  try {
    const result = await warrantyManagerApi.listQueue({
      page: page.value,
      limit,
      status: statusFilter.value || undefined,
      unassigned: unassignedOnly.value || undefined,
      declineReview: reviewOnly.value ? 'pending' : undefined,
    });
    if (requestId !== latestRequest) return;
    claims.value = result.data;
    total.value = result.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    claims.value = [];
    total.value = 0;
    error.value = getSupportErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  statsError.value = '';
  try {
    stats.value = await warrantyManagerApi.technicianStats(windowDays.value);
  } catch (reason) {
    statsError.value = getSupportErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    statsLoading.value = false;
  }
}

async function openModal(claim: StaffWarrantyClaim, mode: WarrantyDecisionMode) {
  notice.value = '';
  actionError.value = '';
  if (mode === 'assign' && !technicians.value.length) {
    try {
      technicians.value = await warrantyManagerApi.eligibleTechnicians();
    } catch (reason) {
      actionError.value = getSupportErrorMessage(reason, 'Chưa tải được danh sách kỹ thuật viên, vui lòng thử lại.');
      return;
    }
  }
  modalClaim.value = claim;
  modalMode.value = mode;
}

function onDone(updated: StaffWarrantyClaim) {
  const index = claims.value.findIndex((c) => c.id === updated.id);
  if (index >= 0) claims.value[index] = updated;
  modalClaim.value = null;
  modalMode.value = null;
  notice.value = 'Đã ghi nhận quyết định của bạn.';
  void loadQueue();
}

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const meta = (claim: StaffWarrantyClaim) => managerClaimDisplayMeta(claim);
const closed = (claim: StaffWarrantyClaim) => ['resolved', 'rejected'].includes(claim.status);
const tabs = [
  { key: 'queue' as const, label: 'Hàng đợi' },
  { key: 'rates' as const, label: 'Tỷ lệ theo kỹ thuật viên' },
];
const queueColumns: ConsoleColumn[] = [
  { key: 'item', label: 'Hạng mục' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'technician', label: 'Kỹ thuật viên', hideBelow: 'xl' },
  { key: 'customer', label: 'Khách hàng', hideBelow: 'xl' },
  { key: 'submittedAt', label: 'Gửi lúc', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];
const rateColumns: ConsoleColumn[] = [
  { key: 'fullName', label: 'Kỹ thuật viên' },
  { key: 'ordersWithWarranty', label: 'Đơn có bảo hành', align: 'right', hideBelow: 'xl' },
  { key: 'claims', label: 'Yêu cầu', align: 'right' },
  { key: 'claimRate', label: 'Tỷ lệ bảo hành', align: 'right' },
  { key: 'notCoveredRate', label: 'Không bảo hành', align: 'right', hideBelow: 'lg' },
  { key: 'overriddenRate', label: 'Quản lý đổi kết luận', align: 'right', hideBelow: 'xl' },
  { key: 'disputedRate', label: 'Khách phản đối', align: 'right', hideBelow: 'xl' },
  { key: 'declineRate', label: 'Từ chối nhận', align: 'right', hideBelow: 'lg' },
];
const statusOptions = Object.entries(warrantyClaimStatusMeta) as [WarrantyClaimStatus, { label: string }][];

watch([statusFilter, unassignedOnly, reviewOnly], () => {
  if (page.value !== 1) page.value = 1;
  else void loadQueue();
});
watch(page, () => void loadQueue());
watch(tab, (next) => {
  if (next === 'rates' && !stats.value.length && !statsLoading.value) void loadStats();
});
watch(windowDays, () => void loadStats());
onMounted(() => void loadQueue());
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Yêu cầu bảo hành" :count="tab === 'queue' && !loading && !error ? total : null">
      <template #badges>
        <span
          v-if="!canDecide"
          class="whitespace-nowrap rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600"
          title="Phân công, duyệt, từ chối và đóng yêu cầu do quản lý dịch vụ thực hiện."
          data-testid="warranty-read-only"
        >Chế độ chỉ đọc</span>
      </template>
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading || statsLoading" @click="tab === 'queue' ? loadQueue() : loadStats()">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <ConsoleTabs v-model="tab" :tabs="tabs" />

    <p v-if="notice" role="status" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
      {{ notice }}
    </p>
    <p v-if="actionError" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
      {{ actionError }}
    </p>

    <template v-if="tab === 'queue'">
      <div class="flex flex-wrap items-center gap-3">
        <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option v-for="[value, item] in statusOptions" :key="value" :value="value">{{ item.label }}</option>
        </select>
        <label class="flex items-center gap-2 whitespace-nowrap text-sm text-ink-700">
          <input v-model="unassignedOnly" type="checkbox" class="h-4 w-4" /> Chưa có kỹ thuật viên
        </label>
        <label class="flex items-center gap-2 whitespace-nowrap text-sm text-ink-700">
          <input v-model="reviewOnly" type="checkbox" class="h-4 w-4" /> Chờ xét từ chối hoặc không đến
        </label>
      </div>

      <ConsoleLoadError v-if="error" :message="error" @retry="loadQueue" />
      <ConsoleTable
        v-else
        :columns="queueColumns"
        :rows="claims"
        :loading="loading"
        empty-text="Không có yêu cầu bảo hành."
      >
        <template #cell-item="{ row }">
          <router-link
            :to="`/console/warranty/${row.id}`"
            class="text-left font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >{{ row.coverage?.itemDescription || 'Bảo hành dịch vụ' }}</router-link>
          <div class="whitespace-nowrap font-num text-xs text-ink-500">#{{ row.order.code }}</div>
        </template>
        <template #cell-status="{ row }">
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              class="inline-flex h-[24px] items-center whitespace-nowrap rounded-[var(--radius-sm)] px-2 text-[12px] font-medium"
              :class="warrantyClaimToneClasses[meta(row).tone]"
            >{{ meta(row).label }}</span>
            <span v-if="row.submittedAfterExpiry" class="whitespace-nowrap text-xs font-medium text-warning-700">Gửi sau hạn</span>
          </div>
        </template>
        <template #cell-technician="{ row }">
          <span class="whitespace-nowrap">{{ row.technician?.fullName || '—' }}</span>
        </template>
        <template #cell-customer="{ row }">
          <span class="whitespace-nowrap">{{ row.order.customerName }}</span>
        </template>
        <template #cell-submittedAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ formatDateTimeVN(row.submittedAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div v-if="canDecide && !closed(row)" class="flex items-center justify-end gap-2">
            <FhButton
              v-if="row.declineReview === 'pending'"
              variant="primary"
              size="sm"
              @click="openModal(row, 'review')"
            >Xét {{ row.noShowFlaggedAt ? 'không đến' : 'từ chối' }}</FhButton>
            <FhButton
              v-else-if="row.status === 'inspected'"
              variant="primary"
              size="sm"
              @click="openModal(row, 'approve')"
            >Duyệt kết luận</FhButton>
            <FhButton
              v-else-if="['submitted', 'accepted'].includes(row.status)"
              variant="secondary"
              size="sm"
              @click="openModal(row, 'assign')"
            >{{ row.technician ? 'Phân công lại' : 'Phân công kỹ thuật viên' }}</FhButton>
            <FhButton
              v-else-if="['in_progress', 'awaiting_customer', 'disputed'].includes(row.status)"
              variant="primary"
              size="sm"
              @click="openModal(row, 'close')"
            >Đóng yêu cầu</FhButton>
          </div>
        </template>
      </ConsoleTable>
      <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
    </template>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <select v-model.number="windowDays" :class="consoleField" aria-label="Khoảng thời gian">
          <option :value="30">30 ngày</option>
          <option :value="90">90 ngày</option>
          <option :value="180">180 ngày</option>
          <option :value="365">365 ngày</option>
        </select>
        <span class="text-sm text-ink-500" title="Kỹ thuật viên có dưới 10 đơn có bảo hành được đánh dấu Ít dữ liệu.">Dưới 10 đơn: ít dữ liệu, chỉ để tham khảo.</span>
      </div>
      <ConsoleLoadError v-if="statsError" :message="statsError" @retry="loadStats" />
      <ConsoleTable
        v-else
        :columns="rateColumns"
        :rows="stats"
        :row-key="(row) => row.technicianId"
        :loading="statsLoading"
        empty-text="Chưa có dữ liệu trong khoảng thời gian này."
      >
        <template #cell-fullName="{ row }">
          <span class="whitespace-nowrap font-medium text-ink-900">{{ row.fullName }}</span>
          <span v-if="row.lowSample" class="ml-1.5 whitespace-nowrap rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">Ít dữ liệu</span>
        </template>
        <template #cell-ordersWithWarranty="{ row }"><span class="font-num">{{ row.ordersWithWarranty }}</span></template>
        <template #cell-claims="{ row }"><span class="font-num">{{ row.claims }}</span></template>
        <template #cell-claimRate="{ row }"><span class="font-num font-semibold">{{ pct(row.claimRate) }}</span></template>
        <template #cell-notCoveredRate="{ row }"><span class="font-num">{{ pct(row.notCoveredRate) }}</span></template>
        <template #cell-overriddenRate="{ row }"><span class="font-num">{{ pct(row.overriddenRate) }}</span></template>
        <template #cell-disputedRate="{ row }"><span class="font-num">{{ pct(row.disputedRate) }}</span></template>
        <template #cell-declineRate="{ row }"><span class="whitespace-nowrap font-num">{{ pct(row.declineRate) }} ({{ row.declines }})</span></template>
      </ConsoleTable>
    </template>

    <WarrantyDecisionModal
      :claim="modalClaim"
      :mode="modalMode"
      :technicians="technicians"
      @close="modalClaim = null; modalMode = null"
      @done="onDone"
    />
  </div>
</template>
