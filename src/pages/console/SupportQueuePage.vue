<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Eye, LifeBuoy, RefreshCw, Search } from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhEmptyState,
  FhStatusPill,
  FhTable,
  type TableColumn,
} from '../../components';
import {
  supportCasesApi,
  type SupportCaseStatus,
  type SupportCaseSummary,
  type SupportCaseType,
} from '../../api/support-cases.api';
import {
  formatSupportDate,
  getSupportErrorMessage,
  isCashCase,
  supportCaseStatusLabels,
  supportCaseTypeLabels,
} from './support-cases.utils';
import { useRouter } from 'vue-router';

const router = useRouter();
const columns: TableColumn[] = [
  { key: 'type', label: 'Loại case', width: '180px' },
  { key: 'status', label: 'Trạng thái', width: '140px' },
  { key: 'reason', label: 'Lý do' },
  { key: 'references', label: 'Booking / order' },
  { key: 'createdAt', label: 'Tạo lúc', width: '170px' },
  { key: 'actions', label: 'Chi tiết', width: '84px' },
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
  'other',
];
const statuses: SupportCaseStatus[] = ['open', 'in_review', 'resolved', 'rejected'];
const cases = ref<SupportCaseSummary[]>([]);
const searchQuery = ref('');
const caseTypeFilter = ref<SupportCaseType | ''>('');
const statusFilter = ref<SupportCaseStatus | ''>('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const loading = ref(true);
const error = ref('');
let latestRequest = 0;

async function loadCases() {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
  try {
    const response = await supportCasesApi.listCases({
      page: page.value,
      limit: pageSize,
      caseType: caseTypeFilter.value || undefined,
      status: statusFilter.value || undefined,
      search: searchQuery.value.trim() || undefined,
    });
    if (requestId !== latestRequest) return;
    cases.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    cases.value = [];
    total.value = 0;
    error.value = getSupportErrorMessage(reason, 'Không thể tải hàng đợi hỗ trợ từ Backend.');
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
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-900">
          <LifeBuoy class="text-brand-600" :size="24" />
          Hàng đợi hỗ trợ
        </h1>
        <p class="mt-1 text-xs text-ink-500">
          Service Manager rà soát các case ngoại lệ từ Backend và ghi nhận kết quả xử lý có kiểm soát.
        </p>
      </div>
      <span class="w-fit rounded border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
        {{ total }} case
      </span>
    </div>

    <div class="rounded-[var(--radius-sm)] border border-ink-200 bg-white p-3.5 shadow-[var(--shadow-e1)]">
      <form class="flex flex-wrap items-end gap-3" role="search" @submit.prevent="applySearch">
        <div class="relative min-w-[240px] flex-1 sm:max-w-sm">
          <label class="sr-only" for="support-search">Tìm case hỗ trợ</label>
          <input
            id="support-search"
            v-model="searchQuery"
            type="search"
            maxlength="200"
            placeholder="Tìm theo lý do, booking hoặc service order..."
            class="h-10 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 pl-9 pr-3 text-xs text-ink-800 focus:border-brand-600 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
          <Search :size="15" class="absolute left-3 top-3 text-ink-400" />
        </div>

        <label class="flex min-w-[190px] flex-col gap-1 text-[11px] font-semibold text-ink-500">
          Loại case
          <select
            v-model="caseTypeFilter"
            class="h-10 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-xs font-normal text-ink-700 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <option value="">Tất cả loại case</option>
            <option v-for="caseType in caseTypes" :key="caseType" :value="caseType">
              {{ supportCaseTypeLabels[caseType] }}
            </option>
          </select>
        </label>

        <label class="flex min-w-[160px] flex-col gap-1 text-[11px] font-semibold text-ink-500">
          Trạng thái
          <select
            v-model="statusFilter"
            class="h-10 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-xs font-normal text-ink-700 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option v-for="status in statuses" :key="status" :value="status">
              {{ supportCaseStatusLabels[status] }}
            </option>
          </select>
        </label>

        <FhButton type="submit" size="sm">
          <Search :size="14" />
          Tìm kiếm
        </FhButton>
        <FhButton type="button" variant="ghost" size="sm" :disabled="loading" @click="resetFilters">
          <RefreshCw :size="14" />
          Xoá lọc
        </FhButton>
      </form>
    </div>

    <div v-if="error" class="flex items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadCases">Thử lại</button>
    </div>

    <FhCard v-if="loading || cases.length > 0" padding="none">
      <FhTable
        :columns="columns"
        :rows="cases"
        :loading="loading"
        empty-text="Không có case phù hợp với bộ lọc."
      >
        <template #cell-type="{ row }">
          <div class="text-xs font-semibold text-ink-900">{{ supportCaseTypeLabels[row.caseType] }}</div>
          <div class="mt-0.5 font-mono text-[10px] text-ink-400">{{ row.caseType }}</div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" :label="supportCaseStatusLabels[row.status]" />
        </template>
        <template #cell-reason="{ row }">
          <div class="max-w-[360px] text-xs font-medium leading-relaxed text-ink-800 line-clamp-2">{{ row.reason }}</div>
          <div v-if="row.description" class="mt-0.5 max-w-[360px] text-[11px] text-ink-400 line-clamp-1">{{ row.description }}</div>
        </template>
        <template #cell-references="{ row }">
          <div class="space-y-0.5 font-mono text-[11px] text-ink-600">
            <div>Booking: {{ row.bookingId ?? '—' }}</div>
            <div>Order: {{ row.serviceOrderId ?? '—' }}</div>
          </div>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="font-num text-xs text-ink-600">{{ formatSupportDate(row.createdAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button
            class="inline-flex min-h-[36px] items-center justify-center rounded p-2 text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            type="button"
            title="Mở chi tiết"
            :aria-label="`Mở chi tiết ${row.id}`"
            @click="openCase(row)"
          >
            <Eye :size="16" />
          </button>
        </template>
      </FhTable>
    </FhCard>

    <FhCard v-else-if="!error">
      <FhEmptyState
        title="Hàng đợi đang trống"
        description="Không có support case nào phù hợp với bộ lọc hiện tại."
        :icon="LifeBuoy"
        action-text="Xoá bộ lọc"
        @action="resetFilters"
      />
    </FhCard>

    <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-ink-500">
      <span>Trang {{ page }} / {{ totalPages }} · {{ total }} case</span>
      <div class="flex items-center gap-2">
        <button
          class="rounded border border-ink-200 p-2 transition-colors hover:bg-ink-100 disabled:opacity-40"
          type="button"
          aria-label="Trang trước"
          :disabled="page <= 1 || loading"
          @click="page--"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          class="rounded border border-ink-200 p-2 transition-colors hover:bg-ink-100 disabled:opacity-40"
          type="button"
          aria-label="Trang sau"
          :disabled="page >= totalPages || loading"
          @click="page++"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
