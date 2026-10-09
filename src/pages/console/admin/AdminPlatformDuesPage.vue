<script setup lang="ts">
// Admin, read only: what each completed order owes the platform. Due =
// commission (snapshot) + FixHome parts (snapshot, no commission on parts).
import { computed, onMounted, ref, watch } from 'vue';
import { FhMoney, FhStatusPill } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../../components/console/console-ui';
import { platformDuesApi, type PlatformDueRecord } from '../../../api/admin-platform-dues.api';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateString } from '../../../utils/vn-time';

const columns: ConsoleColumn[] = [
  { key: 'order', label: 'Đơn' },
  { key: 'labor', label: 'Tiền công', align: 'right', hideBelow: 'xl' },
  { key: 'parts', label: 'Linh kiện FixHome', align: 'right', hideBelow: 'xl' },
  { key: 'commission', label: 'Hoa hồng', align: 'right', hideBelow: 'lg' },
  { key: 'due', label: 'Phải nộp', align: 'right' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'settledAt', label: 'Ngày nộp', hideBelow: 'xl' },
];

// Mirrors PlatformDueStatus in the backend.
const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Chưa nộp', tone: 'PENDING' },
  settled: { label: 'Đã nộp', tone: 'COMPLETED' },
  cancelled: { label: 'Đã huỷ', tone: 'CANCELLED' },
};
const statusOf = (value: string) => STATUS[String(value).toLowerCase()] ?? { label: 'Trạng thái chưa xác định', tone: 'CANCELLED' };

const statusFilter = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const dues = ref<PlatformDueRecord[]>([]);
const loading = ref(true);
const error = ref('');
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const loadDues = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
  try {
    const response = await platformDuesApi.listDues({
      page: page.value,
      limit: pageSize,
      status: statusFilter.value || undefined,
    });
    if (requestId !== latestRequest) return;
    dues.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    dues.value = [];
    total.value = 0;
    error.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => {
  void loadDues();
});

watch(statusFilter, () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadDues();
  }
});

watch(page, (nextPage, previousPage) => {
  if (nextPage !== previousPage) void loadDues();
});

/** The snapshot rate is a fraction (0.1 = 10%). */
const ratePercent = (rate: number) => `${(Number(rate) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : vnDateString(date);
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Công nợ nền tảng" :count="loading || error ? null : total">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadDues">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
        <option value="">Tất cả trạng thái</option>
        <option v-for="(item, key) in STATUS" :key="key" :value="key">{{ item.label }}</option>
      </select>
    </div>

    <ConsoleLoadError v-if="error" :message="error" @retry="loadDues" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="dues"
      :loading="loading"
      empty-text="Không có công nợ phù hợp."
    >
      <template #cell-order="{ row }">
        <router-link :to="`/console/orders/${row.serviceOrderId}`" class="whitespace-nowrap text-brand-700 hover:underline">Xem đơn</router-link>
      </template>
      <template #cell-labor="{ row }"><FhMoney :amount="row.laborTotalSnapshot" /></template>
      <template #cell-parts="{ row }"><FhMoney :amount="row.fixHomePartsTotalSnapshot" /></template>
      <template #cell-commission="{ row }">
        <FhMoney :amount="row.commissionAmountSnapshot" />
        <div class="whitespace-nowrap font-num text-xs text-ink-500">{{ ratePercent(row.commissionRateSnapshot) }}</div>
      </template>
      <template #cell-due="{ row }">
        <FhMoney :amount="row.dueAmount" />
      </template>
      <template #cell-status="{ row }">
        <FhStatusPill :status="statusOf(row.status).tone" :label="statusOf(row.status).label" />
      </template>
      <template #cell-settledAt="{ row }">
        <span class="whitespace-nowrap font-num text-ink-600">{{ formatDate(row.settledAt) }}</span>
      </template>
    </ConsoleTable>

    <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
  </div>
</template>
