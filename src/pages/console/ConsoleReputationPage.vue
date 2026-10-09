<script setup lang="ts">
// Service Manager: customers' and technicians' reputation points (PO
// 08/10/2026). Lowest scores first, why a score moved, and adding or removing
// points with a reason. Raising a score to 70 or more lifts a running ban.
import { computed, onMounted, ref } from 'vue';
import { FhButton, FhConfirmDialog, FhSkeleton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
import { reputationApi, type ReputationEvent, type ReputationRow } from '../../api/reputation.api';
import { vnDateTimeString } from '../../utils/vn-time';
import { extractApiErrorMessage } from '../../utils/input-validation';

const PAGE_SIZE = 20;
const role = ref<'' | 'customer' | 'technician'>('');
const search = ref('');
const page = ref(1);
const totalPages = ref(0);
const total = ref(0);
const rows = ref<ReputationRow[]>([]);
const loading = ref(true);
const loadError = ref('');

const ROLE_LABELS: Record<string, string> = { customer: 'Khách hàng', technician: 'Kỹ thuật viên' };
const KIND_LABELS: Record<string, string> = { violation: 'Trừ điểm', adjustment: 'Điều chỉnh', reset: 'Làm mới định kỳ' };
const columns: ConsoleColumn[] = [
  { key: 'user', label: 'Tài khoản' },
  { key: 'role', label: 'Vai trò', hideBelow: 'xl' },
  { key: 'points', label: 'Điểm', align: 'right' },
  { key: 'ban', label: 'Tạm khoá', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];
const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

/** A running ban for the row's role, or null when there is none. */
function banUntil(row: ReputationRow): string | null {
  const until = row.role === 'customer' ? row.bookingSuspendedUntil : row.workSuspendedUntil;
  return until && new Date(until).getTime() > Date.now() ? until : null;
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await reputationApi.list({
      role: role.value || undefined,
      search: search.value.trim() || undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    });
    rows.value = result.data;
    total.value = result.meta.total;
    totalPages.value = result.meta.totalPages;
  } catch (error) {
    loadError.value = extractApiErrorMessage(error, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  page.value = 1;
  void load();
}

function goTo(next: number) {
  if (next < 1 || (totalPages.value && next > totalPages.value)) return;
  page.value = next;
  void load();
}

// History
const historyFor = ref<ReputationRow | null>(null);
const history = ref<ReputationEvent[]>([]);
const historyLoading = ref(false);
const historyError = ref('');

async function openHistory(row: ReputationRow) {
  historyFor.value = row;
  history.value = [];
  historyError.value = '';
  historyLoading.value = true;
  try {
    history.value = await reputationApi.events(row.id);
  } catch (error) {
    historyError.value = extractApiErrorMessage(error, CONSOLE_LOAD_ERROR);
  } finally {
    historyLoading.value = false;
  }
}

// Adjust
const adjustFor = ref<ReputationRow | null>(null);
const direction = ref<'add' | 'remove'>('add');
const amount = ref('10');
const reason = ref('');
const adjustError = ref('');
const busy = ref(false);

const preview = computed(() => {
  if (!adjustFor.value) return null;
  const value = Number(amount.value);
  if (!Number.isInteger(value) || value <= 0) return null;
  const delta = direction.value === 'add' ? value : -value;
  return Math.max(0, Math.min(100, adjustFor.value.reputationPoints + delta));
});

function openAdjust(row: ReputationRow) {
  adjustFor.value = row;
  direction.value = 'add';
  amount.value = '10';
  reason.value = '';
  adjustError.value = '';
}

async function confirmAdjust() {
  if (!adjustFor.value || busy.value) return;
  const value = Number(amount.value);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    adjustError.value = 'Số điểm là số nguyên từ 1 đến 100.';
    return;
  }
  const why = reason.value.trim();
  if (why.length < 5) {
    adjustError.value = 'Ghi lý do điều chỉnh, tối thiểu 5 ký tự.';
    return;
  }
  busy.value = true;
  adjustError.value = '';
  try {
    const result = await reputationApi.adjust(adjustFor.value.id, direction.value === 'add' ? value : -value, why);
    adjustFor.value.reputationPoints = result.points;
    adjustFor.value = null;
    await load();
  } catch (error) {
    adjustError.value = extractApiErrorMessage(error, 'Chưa điều chỉnh được điểm, thử lại sau.');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Điểm uy tín" :count="loading || loadError ? null : total">
      <template #meta>
        <details class="mt-1 text-sm text-ink-600">
          <summary class="cursor-pointer whitespace-nowrap font-medium text-brand-700 hover:underline">Quy tắc điểm</summary>
          <ul class="mt-2 max-w-2xl list-disc space-y-1 pl-5 text-pretty">
            <li>Bắt đầu 100 điểm, huỷ đơn đã có người nhận trừ 10 điểm.</li>
            <li>Dưới 70 điểm tạm khoá 72 giờ, dưới 40 điểm 7 ngày, từ 20 điểm trở xuống 30 ngày, hết điểm khoá tài khoản.</li>
            <li>Điểm làm mới về 100 mỗi 2 tháng.</li>
          </ul>
        </details>
      </template>
    </ConsolePageHeader>

    <form class="flex flex-wrap items-center gap-2" @submit.prevent="applyFilters">
      <ConsoleSearch v-model="search" :maxlength="100" placeholder="Tìm tên, email, số điện thoại" label="Tìm kiếm" />
      <select v-model="role" :class="consoleField" aria-label="Vai trò" @change="applyFilters">
        <option value="">Tất cả vai trò</option>
        <option value="customer">Khách hàng</option>
        <option value="technician">Kỹ thuật viên</option>
      </select>
      <FhButton type="submit" variant="secondary" size="sm">Tìm</FhButton>
    </form>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="rows"
      :loading="loading"
      empty-text="Không có tài khoản nào khớp bộ lọc."
    >
      <template #cell-user="{ row }">
        <div class="font-medium text-ink-900">{{ row.fullName }}</div>
        <div class="truncate text-xs text-ink-500" :title="row.email">{{ row.email }}<template v-if="row.phoneNumber"> · <span class="whitespace-nowrap font-num">{{ row.phoneNumber }}</span></template></div>
      </template>
      <template #cell-role="{ row }">
        <span class="whitespace-nowrap text-ink-700">{{ ROLE_LABELS[row.role] ?? 'Không rõ' }}</span>
      </template>
      <template #cell-points="{ row }">
        <span class="font-num font-semibold" :class="row.reputationPoints < 70 ? 'text-danger-700' : 'text-ink-900'">{{ row.reputationPoints }}</span>
      </template>
      <template #cell-ban="{ row }">
        <span v-if="row.status === 'locked'" class="whitespace-nowrap text-danger-700">Đã khoá tài khoản</span>
        <span v-else-if="banUntil(row)" class="whitespace-nowrap text-danger-700">Tới {{ vnDateTimeString(banUntil(row)!) }}</span>
        <span v-else class="text-ink-400">Không</span>
      </template>
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="openHistory(row)">Lịch sử</FhButton>
          <ConsoleMoreMenu label="Thao tác khác với tài khoản">
            <ConsoleMenuItem @click="openAdjust(row)">Điều chỉnh</ConsoleMenuItem>
          </ConsoleMoreMenu>
        </div>
      </template>
    </ConsoleTable>
    <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="goTo" />

    <FhConfirmDialog
      :open="!!historyFor"
      :title="`Lịch sử điểm: ${historyFor?.fullName ?? ''}`"
      consequence="Mới nhất trước."
      confirm-text="Đóng"
      cancel-text="Quay lại"
      :danger="false"
      @confirm="historyFor = null"
      @cancel="historyFor = null"
    >
      <FhSkeleton v-if="historyLoading" height="36px" :count="3" />
      <p v-else-if="historyError" class="text-sm text-danger-700">{{ historyError }}</p>
      <p v-else-if="history.length === 0" class="text-sm text-ink-500">Chưa có thay đổi nào.</p>
      <ul v-else class="max-h-72 overflow-y-auto divide-y divide-ink-100" data-testid="reputation-events">
        <li v-for="event in history" :key="event.id" class="flex items-start justify-between gap-3 py-2 text-sm">
          <div class="min-w-0">
            <div class="font-medium text-ink-800">{{ KIND_LABELS[event.kind] ?? 'Thay đổi điểm' }} · <span class="whitespace-nowrap font-num">{{ vnDateTimeString(event.createdAt) }}</span></div>
            <div class="text-ink-500 break-words">{{ [event.reason, event.penalty].filter(Boolean).join(' ') }}</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="font-num font-semibold" :class="event.delta < 0 ? 'text-danger-700' : 'text-ink-700'">{{ signed(event.delta) }}</div>
            <div class="whitespace-nowrap font-num text-xs text-ink-500">còn {{ event.pointsAfter }}</div>
          </div>
        </li>
      </ul>
    </FhConfirmDialog>

    <FhConfirmDialog
      :open="!!adjustFor"
      :title="`Điều chỉnh điểm: ${adjustFor?.fullName ?? ''}`"
      consequence="Nâng lên từ 70 điểm thì gỡ tạm khoá đang có. Lý do được ghi vào lịch sử và gửi cho người dùng."
      confirm-text="Lưu điều chỉnh"
      cancel-text="Huỷ"
      :danger="false"
      :loading="busy"
      @confirm="confirmAdjust"
      @cancel="adjustFor = null"
    >
      <div class="space-y-3 text-sm">
        <div class="flex gap-4">
          <label class="flex items-center gap-1.5"><input v-model="direction" type="radio" value="add" /> Cộng điểm</label>
          <label class="flex items-center gap-1.5"><input v-model="direction" type="radio" value="remove" /> Trừ điểm</label>
        </div>
        <label :class="consoleLabel">
          Số điểm
          <input v-model="amount" type="number" min="1" max="100" step="1" inputmode="numeric" :class="consoleField" data-testid="adjust-amount" />
        </label>
        <label :class="consoleLabel">
          Lý do
          <textarea v-model="reason" rows="3" maxlength="500" :class="consoleTextarea" data-testid="adjust-reason" />
        </label>
        <p v-if="preview !== null" class="text-ink-600">Điểm sau khi điều chỉnh: <strong class="font-num">{{ adjustFor?.reputationPoints }} → {{ preview }}</strong></p>
        <p v-if="adjustError" class="text-danger-700" role="alert">{{ adjustError }}</p>
      </div>
    </FhConfirmDialog>
  </div>
</template>
