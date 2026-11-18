<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronRight, RotateCcw, Search, X } from 'lucide-vue-next';
import { FhSkeleton } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleSearchField } from '../../../components/console/console-ui';
import { roleLabel } from '../../../components/console/console-labels';
import {
  auditActionLabel,
  auditActionLabels,
  auditResourceLabel,
  auditResourceLabels,
} from '../../../components/console/audit-labels';
import { userFacingError } from '../../../utils/user-facing-error';
import { auditLogsApi, type AuditLogRecord } from '../../../api/admin-audit-logs.api';
import { vnDateTimeString } from '../../../utils/vn-time';

const columns: ConsoleColumn[] = [
  { key: 'action', label: 'Thao tác' },
  { key: 'actor', label: 'Người thực hiện', hideBelow: 'lg' },
  { key: 'createdAt', label: 'Thời gian' },
];

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'vi');
const actionOptions = Object.entries(auditActionLabels).map(([value, label]) => ({ value, label })).sort(byLabel);
// One option per label: the legacy plural resource name and test rows stay out of the filter.
const resourceOptions = Object.entries(auditResourceLabels)
  .filter(([value]) => value !== 'service_orders')
  .map(([value, label]) => ({ value, label }))
  .sort(byLabel);

// Same shape the backend accepts: 8-4-4-4-12 hex, seeded accounts included.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_FILTER_DELAY_MS = 400;

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

// A partial id is never sent: the server answers 400 for it.
const actorIncomplete = computed(() => {
  const value = actorUserIdFilter.value.trim();
  return value !== '' && !UUID_SHAPE.test(value);
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

// Plain Vietnamese reasons from the server are kept; codes and English never show.
const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

const loadLogs = async () => {
  if (actorIncomplete.value) return;
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
    error.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => {
  void loadLogs();
});

let actorTimer: ReturnType<typeof setTimeout> | undefined;
const reloadFromFirstPage = () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadLogs();
  }
};

watch([resourceTypeFilter, actionFilter], () => {
  clearTimeout(actorTimer);
  reloadFromFirstPage();
});

// Typing an id used to send one request per key. Wait until typing pauses.
watch(actorUserIdFilter, () => {
  clearTimeout(actorTimer);
  if (actorIncomplete.value) return;
  actorTimer = setTimeout(reloadFromFirstPage, ACTOR_FILTER_DELAY_MS);
});
onBeforeUnmount(() => clearTimeout(actorTimer));

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
    detailError.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
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
  return Number.isNaN(date.getTime()) ? '—' : vnDateTimeString(date);
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

const hasActiveFilters = computed(
  () => actionFilter.value !== '' || resourceTypeFilter.value !== '' || actorUserIdFilter.value.trim() !== '',
);
const resetFilters = () => {
  actionFilter.value = '';
  resourceTypeFilter.value = '';
  actorUserIdFilter.value = '';
};

const actionPillClass = (action: string) => {
  const upper = action.toUpperCase();
  if (upper.includes('LOCK') || upper.includes('REJECT') || upper.includes('CANCEL') || upper.includes('DELETE') || upper.includes('RETIRE')) {
    return 'bg-danger-50 text-danger-700 border-danger-200/70';
  }
  if (upper.includes('APPROVE') || upper.includes('CREATE') || upper.includes('ACTIVATE') || upper.includes('UNLOCK') || upper.includes('VERIFY')) {
    return 'bg-success-50 text-success-700 border-success-200/70';
  }
  return 'bg-brand-50 text-brand-700 border-brand-200/70';
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Nhật ký thao tác" :count="loading || error ? null : total">
      <template #badges>
        <span class="whitespace-nowrap rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600" title="Nhật ký chỉ ghi thêm, không sửa hay xoá được.">Chỉ đọc</span>
      </template>
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadLogs">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="animate-slide-up-delay-1 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-3 shadow-(--shadow-e1) flex flex-wrap items-center gap-2.5">
      <select id="audit-action" v-model="actionFilter" :class="consoleField" aria-label="Lọc theo thao tác">
        <option value="">Mọi thao tác</option>
        <option v-for="opt in actionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <select id="audit-resource-type" v-model="resourceTypeFilter" :class="consoleField" aria-label="Lọc theo đối tượng">
        <option value="">Mọi đối tượng</option>
        <option v-for="opt in resourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <div class="relative w-full min-w-0 sm:w-72">
        <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          id="audit-actor"
          v-model="actorUserIdFilter"
          type="search"
          placeholder="Mã người thực hiện"
          aria-label="Lọc theo mã người thực hiện"
          :class="consoleSearchField"
          :aria-invalid="actorIncomplete"
          :aria-describedby="actorIncomplete ? 'audit-actor-hint' : undefined"
        />
      </div>
      <button
        v-if="hasActiveFilters"
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-3 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        @click="resetFilters"
      >
        <RotateCcw :size="13" aria-hidden="true" />
        Đặt lại
      </button>
      <p v-if="actorIncomplete" id="audit-actor-hint" class="w-full text-xs text-ink-500">
        Nhập đủ mã 36 ký tự để lọc.
      </p>
    </div>

    <div class="animate-slide-up-delay-2 space-y-5">
      <ConsoleLoadError v-if="error" :message="error" @retry="loadLogs" />
      <ConsoleTable
        v-else
        :columns="columns"
        :rows="logs"
        :loading="loading"
        empty-text="Không có bản ghi phù hợp."
      >
        <template #cell-action="{ row }">
          <button
            type="button"
            class="group inline-flex max-w-full items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded cursor-pointer"
            @click="openDetail(row)"
          >
            <span class="min-w-0 space-y-0.5">
              <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors" :class="actionPillClass(row.action)">
                {{ auditActionLabel(row.action) }}
              </span>
              <span class="block text-xs text-ink-500">{{ auditResourceLabel(row.resourceType) }}</span>
            </span>
            <ChevronRight :size="14" class="shrink-0 text-ink-300 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden="true" />
          </button>
        </template>
        <template #cell-actor="{ row }">
          <span class="inline-flex items-center whitespace-nowrap rounded-full border border-ink-200/80 bg-ink-50 px-2.5 py-0.5 text-xs font-medium text-ink-700">
            {{ row.actorUserId ? roleLabel(row.actorRole) : 'Hệ thống' }}
          </span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ formatDateTime(String(row.createdAt)) }}</span>
        </template>
      </ConsoleTable>

      <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
    </div>

    <!-- Detail (read only; snapshots are escaped text) -->
    <Transition name="fh-drawer">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 flex justify-end bg-ink-950/50"
        @click.self="closeDetail"
        @keydown.esc="closeDetail"
      >
        <aside
          class="fh-drawer-panel flex h-full w-full max-w-xl flex-col border-l border-ink-200/80 bg-white shadow-[var(--shadow-e3)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
        >
          <div class="flex items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-4">
            <div class="min-w-0 space-y-0.5">
              <h3 id="audit-detail-title" class="text-lg font-semibold text-ink-900">{{ auditActionLabel(selected.action) }}</h3>
              <p class="whitespace-nowrap font-num text-xs text-ink-500">{{ formatDateTime(selected.createdAt) }}</p>
            </div>
            <button class="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" type="button" aria-label="Đóng chi tiết" @click="closeDetail">
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <div class="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 text-sm">
            <FhSkeleton v-if="detailLoading" height="20px" :count="6" />
            <template v-else>
              <p v-if="detailError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-danger-800" role="alert">{{ detailError }}</p>
              <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/80 bg-ink-50/70 px-4">
                <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Đối tượng</dt><dd class="text-right font-medium text-ink-900">{{ auditResourceLabel(selected.resourceType) }}</dd></div>
                <div class="flex justify-between gap-3 py-2.5"><dt class="shrink-0 text-ink-500">Mã đối tượng</dt><dd class="break-all text-right font-num text-ink-900">{{ selected.resourceId || '—' }}</dd></div>
                <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Vai trò</dt><dd class="text-right font-medium text-ink-900">{{ selected.actorUserId ? roleLabel(selected.actorRole) : 'Hệ thống' }}</dd></div>
                <div class="flex justify-between gap-3 py-2.5"><dt class="shrink-0 text-ink-500">Mã người thực hiện</dt><dd class="break-all text-right font-num text-ink-900">{{ selected.actorUserId || '—' }}</dd></div>
                <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Địa chỉ IP</dt><dd class="text-right font-num text-ink-900">{{ selected.ip || '—' }}</dd></div>
                <div class="flex justify-between gap-3 py-2.5"><dt class="shrink-0 text-ink-500">Trình duyệt</dt><dd class="break-all text-right text-ink-900">{{ selected.userAgent || '—' }}</dd></div>
              </dl>
              <div>
                <div class="mb-1.5 text-xs font-semibold text-ink-600">Dữ liệu trước</div>
                <pre class="whitespace-pre-wrap break-all rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 font-num text-xs text-ink-800">{{ formatSnapshot(selected.before) }}</pre>
              </div>
              <div>
                <div class="mb-1.5 text-xs font-semibold text-ink-600">Dữ liệu sau</div>
                <pre class="whitespace-pre-wrap break-all rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 font-num text-xs text-ink-800">{{ formatSnapshot(selected.after) }}</pre>
              </div>
            </template>
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>
