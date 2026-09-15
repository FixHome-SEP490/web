<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Receipt, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { FhButton, FhCard, FhTable, FhStatusPill, FhMoney, type TableColumn } from '../../../components';
import { platformDuesApi, type PlatformDueRecord } from '../../../api/admin-platform-dues.api';

const columns: TableColumn[] = [
  { key: 'invoice', label: 'Hoá đơn / Đơn' },
  { key: 'snapshots', label: 'Snapshot công & linh kiện' },
  { key: 'commission', label: 'Hoa hồng (snapshot)' },
  { key: 'due', label: 'Phải nộp Platform', align: 'right', width: '160px' },
  { key: 'status', label: 'Trạng thái', width: '140px' },
  { key: 'settledAt', label: 'Quyết toán', width: '130px' },
];

const statusFilter = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const dues = ref<PlatformDueRecord[]>([]);
const loading = ref(true);
const error = ref('');
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

function getErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason !== null && 'response' in reason) {
    const response = (reason as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  if (reason instanceof Error && reason.message) return reason.message;
  return fallback;
}

const loadDues = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
  try {
    const response = await platformDuesApi.listDues({
      page: page.value,
      limit: pageSize,
      status: statusFilter.value.trim() || undefined,
    });
    if (requestId !== latestRequest) return;
    dues.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    dues.value = [];
    total.value = 0;
    error.value = getErrorMessage(reason, 'Không thể tải công nợ Platform từ Backend.');
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

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Receipt class="text-brand-600" :size="24" />
          Kiểm toán Công nợ Platform
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Dữ liệu chỉ đọc từ <span class="font-mono">GET /finance/platform-dues</span>.
          Công thức hiển thị: phải nộp = hoa hồng (snapshot) + linh kiện FixHome (snapshot, không chịu hoa hồng).
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :loading="loading" @click="loadDues">
        <RefreshCw :size="15" /> Làm mới
      </FhButton>
    </div>

    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadDues">Thử lại</button>
    </div>

    <div class="flex flex-wrap items-center gap-4 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div class="relative flex-1 min-w-[240px] max-w-sm">
        <label class="sr-only" for="platform-due-status">Lọc theo trạng thái</label>
        <input
          id="platform-due-status"
          v-model="statusFilter"
          type="search"
          placeholder="Lọc theo trạng thái Backend (để trống = tất cả)..."
          class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>
      <span class="text-[11px] text-ink-400 italic">Trang kiểm toán chỉ đọc — không có thao tác quyết toán/thanh toán.</span>
    </div>

    <FhCard>
      <FhTable :columns="columns" :rows="dues" :loading="loading" :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có công nợ phù hợp.'">
        <template #cell-invoice="{ row }">
          <div class="text-xs text-ink-700 font-mono">Invoice: {{ row.invoiceId }}</div>
          <div class="text-[11px] text-ink-400 font-mono">Order: {{ row.serviceOrderId }}</div>
          <div class="text-[11px] text-ink-400 font-mono">Due: {{ row.id }}</div>
        </template>
        <template #cell-snapshots="{ row }">
          <div class="text-xs text-ink-700 font-num">Công: <FhMoney :amount="row.laborTotalSnapshot" /></div>
          <div class="text-xs text-ink-700 font-num">Linh kiện FH: <FhMoney :amount="row.fixHomePartsTotalSnapshot" /></div>
        </template>
        <template #cell-commission="{ row }">
          <div class="text-xs text-ink-700 font-num">Tỉ lệ: {{ row.commissionRateSnapshot }}</div>
          <div class="text-xs font-bold text-ink-900 font-num"><FhMoney :amount="row.commissionAmountSnapshot" /></div>
        </template>
        <template #cell-due="{ row }">
          <span class="text-sm font-bold font-num text-brand-700"><FhMoney :amount="row.dueAmount" /></span>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="String(row.status)" :label="String(row.status)" />
        </template>
        <template #cell-settledAt="{ row }">
          <span class="text-xs text-ink-500 font-num">{{ formatDate(row.settledAt) }}</span>
        </template>
      </FhTable>
    </FhCard>

    <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-ink-500">
      <span>Trang {{ page }} / {{ totalPages }} · {{ total }} bản ghi</span>
      <div class="flex items-center gap-2">
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page <= 1 || loading" aria-label="Trang trước" @click="page--">
          <ChevronLeft :size="16" />
        </button>
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page >= totalPages || loading" aria-label="Trang sau" @click="page++">
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
