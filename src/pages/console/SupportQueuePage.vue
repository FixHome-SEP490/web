<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { FhButton, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { consoleField } from '../../components/console/console-ui';
import {
  supportCasesApi,
  type SupportCaseStatus,
  type SupportCaseSummary,
  type SupportCaseType,
} from '../../api/support-cases.api';
import {
  formatSupportDate,
  isCashCase,
  isResponseOverdue,
  supportCaseStatusLabels,
  supportCaseTypeLabels,
} from './support-cases.utils';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const columns: ConsoleColumn[] = [
  { key: 'type', label: 'Loại' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'reason', label: 'Lý do', hideBelow: 'lg' },
  { key: 'references', label: 'Đơn', hideBelow: 'xl' },
  { key: 'createdAt', label: 'Tạo lúc', hideBelow: 'xl' },
];

const caseTypes: SupportCaseType[] = [
  'matching_exhausted',
  'arrival_abnormal',
  'cash_non_response',
  'cash_mismatch',
  'cancellation_review',
  'parts_dispute',
  'warranty_dispute',
  'mid_job_interruption',
  'property_damage',
  'quality',
  'pricing_dispute',
  'conduct',
  'other',
  'technician_replacement',
];
const statuses: SupportCaseStatus[] = ['open', 'in_review', 'resolved', 'rejected'];
const cases = ref<SupportCaseSummary[]>([]);
const searchQuery = ref('');
// A link may open the queue already filtered, e.g. the overview's "Cần thay đổi thợ" count.
const queryValue = <T extends string>(value: unknown, allowed: readonly T[]): T | '' =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : '';
const caseTypeFilter = ref<SupportCaseType | ''>(queryValue(route?.query?.caseType, caseTypes));
const statusFilter = ref<SupportCaseStatus | ''>(queryValue(route?.query?.status, statuses));
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const loading = ref(true);
const error = ref(false);
let latestRequest = 0;

async function loadCases() {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = false;
  try {
    const response = await supportCasesApi.listCases({
      page: page.value,
      limit: pageSize,
      caseType: caseTypeFilter.value || undefined,
      status: statusFilter.value || undefined,
      search: searchQuery.value.trim() || undefined,
      sort: 'priority',
    });
    if (requestId !== latestRequest) return;
    cases.value = response.data;
    total.value = response.meta.total;
  } catch {
    if (requestId !== latestRequest) return;
    cases.value = [];
    total.value = 0;
    error.value = true;
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

function applySearch() {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadCases();
  }
}

const hasFilters = computed(() => !!(searchQuery.value.trim() || caseTypeFilter.value || statusFilter.value));

function resetFilters() {
  searchQuery.value = '';
  caseTypeFilter.value = '';
  statusFilter.value = '';
  page.value = 1;
}

function openCase(item: SupportCaseSummary) {
  const path = isCashCase(item.caseType)
    ? `/console/support/cash/${encodeURIComponent(item.id)}`
    : `/console/support/${encodeURIComponent(item.id)}`;
  void router.push(path);
}

onMounted(() => {
  void loadCases();
});

watch([caseTypeFilter, statusFilter], () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadCases();
  }
});

watch(page, (nextPage, previousPage) => {
  if (nextPage !== previousPage) void loadCases();
});
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Yêu cầu hỗ trợ" :count="loading || error ? null : total" />

    <form class="flex flex-wrap items-center gap-2" role="search" @submit.prevent="applySearch">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm theo lý do, mã yêu cầu" label="Tìm yêu cầu hỗ trợ" />
      <select v-model="caseTypeFilter" :class="consoleField" aria-label="Loại yêu cầu">
        <option value="">Tất cả loại</option>
        <option v-for="caseType in caseTypes" :key="caseType" :value="caseType">
          {{ supportCaseTypeLabels[caseType] }}
        </option>
      </select>
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
        <option value="">Tất cả trạng thái</option>
        <option v-for="status in statuses" :key="status" :value="status">
          {{ supportCaseStatusLabels[status] }}
        </option>
      </select>
      <FhButton type="submit" variant="secondary" size="sm">Tìm</FhButton>
      <button
        v-if="hasFilters"
        type="button"
        class="h-9 whitespace-nowrap rounded-[var(--radius-sm)] px-2 text-sm font-medium text-ink-600 hover:text-ink-900"
        :disabled="loading"
        @click="resetFilters"
      >
        Xoá lọc
      </button>
    </form>

    <ConsoleLoadError v-if="error" @retry="loadCases" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="cases"
      :loading="loading"
      empty-text="Không có yêu cầu nào phù hợp."
    >
      <template #cell-type="{ row }">
        <button
          type="button"
          class="text-left font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-label="`Mở chi tiết ${supportCaseTypeLabels[row.caseType]}`"
          @click="openCase(row)"
        >
          {{ supportCaseTypeLabels[row.caseType] }}
        </button>
      </template>
      <template #cell-status="{ row }">
        <div class="flex flex-wrap gap-1">
          <FhStatusPill :status="row.status" :label="supportCaseStatusLabels[row.status]" />
          <span v-if="row.isUrgent && (row.status === 'open' || row.status === 'in_review')" class="whitespace-nowrap rounded bg-danger-50 px-1.5 py-0.5 text-xs font-medium text-danger-700">Cần xử lý ngay</span>
          <span v-if="isResponseOverdue(row.status, row.respondBy)" class="whitespace-nowrap rounded bg-warning-50 px-1.5 py-0.5 text-xs font-medium text-warning-700">Quá hạn phản hồi</span>
          <span v-if="row.holdCompletion" class="whitespace-nowrap rounded bg-info-50 px-1.5 py-0.5 text-xs font-medium text-info-600">Đang giữ đơn</span>
        </div>
      </template>
      <template #cell-reason="{ row }">
        <div class="line-clamp-2 max-w-96 text-ink-800" :title="row.description || row.reason">{{ row.reason }}</div>
      </template>
      <template #cell-references="{ row }">
        <router-link
          v-if="row.serviceOrderId"
          :to="`/console/orders/${row.serviceOrderId}`"
          class="whitespace-nowrap text-brand-700 hover:underline"
        >Xem đơn</router-link>
        <span v-else-if="row.bookingId" class="whitespace-nowrap text-ink-600">Chưa có đơn</span>
        <span v-else class="text-ink-400">—</span>
      </template>
      <template #cell-createdAt="{ row }">
        <span class="whitespace-nowrap font-num text-ink-600">{{ formatSupportDate(row.createdAt) }}</span>
      </template>
    </ConsoleTable>

    <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
  </div>
</template>
