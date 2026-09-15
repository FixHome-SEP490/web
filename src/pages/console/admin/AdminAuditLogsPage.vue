<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ScrollText, RefreshCw, Search, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import { FhButton, FhCard, FhTable, type TableColumn } from '../../../components';
import { auditLogsApi, type AuditLogRecord } from '../../../api/admin-audit-logs.api';

const columns: TableColumn[] = [
  { key: 'action', label: 'Hành động / Tài nguyên' },
  { key: 'actor', label: 'Tác nhân', width: '200px' },
  { key: 'resource', label: 'Đối tượng', width: '200px' },
  { key: 'createdAt', label: 'Thời gian', width: '150px' },
  { key: 'detail', label: 'Chi tiết', width: '90px' },
];

const resourceTypeFilter = ref('');
const actorUserIdFilter = ref('');
const actionFilter = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const logs = ref<AuditLogRecord[]>([]);
const loading = ref(true);
const error = ref('');
let latestRequest = 0;

const selected = ref<AuditLogRecord | null>(null);
const detailLoading = ref(false);
const detailError = ref('');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

function getErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason !== null && 'response' in reason) {
    const response = (reason as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  if (reason instanceof Error && reason.message) return reason.message;
  return fallback;
}

const loadLogs = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
  try {
    const response = await auditLogsApi.listLogs({
      page: page.value,
      limit: pageSize,
      resourceType: resourceTypeFilter.value.trim() || undefined,
      actorUserId: actorUserIdFilter.value.trim() || undefined,
      action: actionFilter.value.trim() || undefined,
    });
    if (requestId !== latestRequest) return;
    logs.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    logs.value = [];
    total.value = 0;
    error.value = getErrorMessage(reason, 'Không thể tải nhật ký kiểm toán từ Backend.');
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => {
  void loadLogs();
});

watch([resourceTypeFilter, actorUserIdFilter, actionFilter], () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadLogs();
  }
});

watch(page, (nextPage, previousPage) => {
  if (nextPage !== previousPage) void loadLogs();
});

const openDetail = async (row: AuditLogRecord) => {
  selected.value = row;
  detailError.value = '';
  detailLoading.value = true;
  try {
    selected.value = await auditLogsApi.getLog(row.id);
  } catch (reason) {
    detailError.value = getErrorMessage(reason, 'Không thể tải chi tiết bản ghi kiểm toán.');
  } finally {
    detailLoading.value = false;
  }
};

const closeDetail = () => {
  selected.value = null;
  detailError.value = '';
};

const formatDateTime = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
};

const formatSnapshot = (value: unknown) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ScrollText class="text-brand-600" :size="24" />
          Nhật ký Kiểm toán (Append-only)
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Dữ liệu chỉ đọc từ <span class="font-mono">GET /admin/audit-logs</span>.
          Nhật ký là append-only — không có thao tác sửa/xoá.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :loading="loading" @click="loadLogs">
        <RefreshCw :size="15" /> Làm mới
      </FhButton>
    </div>

    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadLogs">Thử lại</button>
    </div>

    <div class="flex flex-wrap items-center gap-3 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div class="relative flex-1 min-w-[200px]">
        <label class="sr-only" for="audit-resource-type">Lọc theo loại tài nguyên</label>
        <input
          id="audit-resource-type"
          v-model="resourceTypeFilter"
          type="search"
          maxlength="64"
          placeholder="resourceType (tối đa 64 ký tự)..."
          class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>
      <div class="flex-1 min-w-[200px]">
        <label class="sr-only" for="audit-actor">Lọc theo actorUserId (UUID)</label>
        <input
          id="audit-actor"
          v-model="actorUserIdFilter"
          type="search"
          placeholder="actorUserId (UUID)..."
          class="w-full h-9 px-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
      </div>
      <div class="flex-1 min-w-[200px]">
        <label class="sr-only" for="audit-action">Lọc theo hành động</label>
        <input
          id="audit-action"
          v-model="actionFilter"
          type="search"
          maxlength="128"
          placeholder="action (tối đa 128 ký tự)..."
          class="w-full h-9 px-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
      </div>
    </div>

    <FhCard>
      <FhTable :columns="columns" :rows="logs" :loading="loading" :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có bản ghi kiểm toán phù hợp.'">
        <template #cell-action="{ row }">
          <div class="font-bold text-xs text-ink-900 font-mono">{{ row.action }}</div>
          <div class="text-[11px] text-ink-400 font-mono">{{ row.resourceType }}</div>
        </template>
        <template #cell-actor="{ row }">
          <div class="text-xs text-ink-700 font-mono">{{ row.actorUserId || '— (hệ thống)' }}</div>
          <div class="text-[11px] text-ink-400 font-mono">{{ row.actorRole || '—' }}</div>
        </template>
        <template #cell-resource="{ row }">
          <div class="text-xs text-ink-700 font-mono">{{ row.resourceId || '—' }}</div>
          <div class="text-[11px] text-ink-400 font-mono">{{ row.ip || '—' }}</div>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="text-xs text-ink-500 font-num">{{ formatDateTime(String(row.createdAt)) }}</span>
        </template>
        <template #cell-detail="{ row }">
          <button class="text-xs font-semibold text-brand-700 hover:text-brand-800 underline" type="button" @click="openDetail(row)">
            Xem
          </button>
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

    <!-- Detail modal (read-only, escaped snapshots) -->
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Chi tiết bản ghi kiểm toán"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-xl space-y-4 text-xs">
        <div class="flex items-start justify-between gap-3 border-b border-ink-100 pb-3">
          <div>
            <h3 class="text-base font-bold text-ink-900 font-mono">{{ selected.action }}</h3>
            <p class="text-[11px] text-ink-400 font-mono mt-0.5">{{ selected.id }} · {{ formatDateTime(selected.createdAt) }}</p>
          </div>
          <button class="p-1.5 rounded hover:bg-ink-100 text-ink-500" type="button" aria-label="Đóng chi tiết" @click="closeDetail">
            <X :size="16" />
          </button>
        </div>

        <div v-if="detailLoading" class="text-center py-8 text-ink-400">Đang tải chi tiết từ Backend...</div>
        <div v-else>
          <div v-if="detailError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
            {{ detailError }}
          </div>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><dt class="font-semibold text-ink-500">resourceType</dt><dd class="font-mono text-ink-900">{{ selected.resourceType }}</dd></div>
            <div><dt class="font-semibold text-ink-500">resourceId</dt><dd class="font-mono text-ink-900">{{ selected.resourceId || '—' }}</dd></div>
            <div><dt class="font-semibold text-ink-500">actorUserId</dt><dd class="font-mono text-ink-900">{{ selected.actorUserId || '—' }}</dd></div>
            <div><dt class="font-semibold text-ink-500">actorRole</dt><dd class="font-mono text-ink-900">{{ selected.actorRole || '—' }}</dd></div>
            <div><dt class="font-semibold text-ink-500">ip</dt><dd class="font-mono text-ink-900">{{ selected.ip || '—' }}</dd></div>
            <div><dt class="font-semibold text-ink-500">userAgent</dt><dd class="font-mono text-ink-900 break-all">{{ selected.userAgent || '—' }}</dd></div>
          </dl>
          <div class="space-y-3 pt-1">
            <div>
              <div class="font-semibold text-ink-700 mb-1">before</div>
              <pre class="p-3 rounded bg-ink-50 border border-ink-200 font-mono text-[11px] whitespace-pre-wrap break-all text-ink-800">{{ formatSnapshot(selected.before) }}</pre>
            </div>
            <div>
              <div class="font-semibold text-ink-700 mb-1">after</div>
              <pre class="p-3 rounded bg-ink-50 border border-ink-200 font-mono text-[11px] whitespace-pre-wrap break-all text-ink-800">{{ formatSnapshot(selected.after) }}</pre>
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-2 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="closeDetail">Đóng</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
