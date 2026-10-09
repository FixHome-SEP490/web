<script setup lang="ts">
// Service Manager: customers' and technicians' reputation points (PO
// 08/10/2026). Lowest scores first, why a score moved, and adding or removing
// points with a reason. Raising a score to 70 or more lifts a running ban.
import { computed, onMounted, ref } from 'vue';
import { Gauge } from 'lucide-vue-next';
import { FhButton, FhCard, FhConfirmDialog, FhEmptyState, FhSkeleton, FhTable } from '../../components';
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
    loadError.value = extractApiErrorMessage(error, 'Không tải được danh sách điểm uy tín.');
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
    historyError.value = extractApiErrorMessage(error, 'Không tải được lịch sử điểm.');
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
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
        <Gauge class="text-ink-600" :size="24" />
        Điểm uy tín
      </h1>
      <p class="text-xs text-ink-500 mt-1">
        Khách hàng và kỹ thuật viên bắt đầu 100 điểm, huỷ đơn đã có người nhận bị trừ 10 điểm. Dưới 70 điểm tạm khoá 72 giờ, dưới 40 điểm 7 ngày, từ 20 điểm trở xuống 30 ngày, hết điểm khoá tài khoản. Điểm làm mới về 100 mỗi 2 tháng.
      </p>
    </div>

    <form class="flex flex-col sm:flex-row gap-3" @submit.prevent="applyFilters">
      <select v-model="role" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm" aria-label="Vai trò" @change="applyFilters">
        <option value="">Tất cả</option>
        <option value="customer">Khách hàng</option>
        <option value="technician">Kỹ thuật viên</option>
      </select>
      <input
        v-model="search"
        type="search"
        maxlength="100"
        placeholder="Tìm theo tên, email hoặc số điện thoại"
        class="flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm"
        aria-label="Tìm kiếm"
      />
      <FhButton type="submit" variant="secondary" size="md">Tìm</FhButton>
    </form>

    <FhCard>
      <div v-if="loading" class="p-6 space-y-3">
        <FhSkeleton height="40px" :count="3" />
      </div>
      <FhEmptyState v-else-if="loadError" title="Không tải được danh sách" :description="loadError" action-text="Thử lại" @action="load" />
      <FhEmptyState v-else-if="rows.length === 0" title="Không có tài khoản nào" description="Không có khách hàng hoặc kỹ thuật viên khớp bộ lọc." />
      <template v-else>
        <FhTable
          :columns="[
            { key: 'user', label: 'Tài khoản' },
            { key: 'role', label: 'Vai trò', width: '130px' },
            { key: 'points', label: 'Điểm', width: '90px' },
            { key: 'ban', label: 'Tạm khoá', width: '190px' },
            { key: 'actions', label: 'Thao tác', width: '190px' },
          ]"
          :rows="rows"
        >
          <template #cell-user="{ row }">
            <div class="font-semibold text-xs text-ink-900">{{ row.fullName }}</div>
            <div class="text-[11px] text-ink-500 break-all">{{ row.email }}<template v-if="row.phoneNumber"> · {{ row.phoneNumber }}</template></div>
          </template>
          <template #cell-role="{ row }">
            <span class="text-xs text-ink-700">{{ ROLE_LABELS[row.role] ?? 'Không rõ' }}</span>
          </template>
          <template #cell-points="{ row }">
            <span class="text-sm font-bold font-num" :class="row.reputationPoints < 70 ? 'text-danger-700' : 'text-ink-900'">{{ row.reputationPoints }}</span>
          </template>
          <template #cell-ban="{ row }">
            <span v-if="row.status === 'locked'" class="text-xs font-semibold text-danger-700">Đã khoá tài khoản</span>
            <span v-else-if="banUntil(row)" class="text-xs font-semibold text-danger-700">Tới {{ vnDateTimeString(banUntil(row)!) }}</span>
            <span v-else class="text-xs text-ink-400">Không</span>
          </template>
          <template #cell-actions="{ row }">
            <div class="flex gap-2">
              <FhButton variant="secondary" size="sm" @click="openHistory(row)">Lịch sử</FhButton>
              <FhButton variant="secondary" size="sm" @click="openAdjust(row)">Điều chỉnh</FhButton>
            </div>
          </template>
        </FhTable>
        <div class="flex items-center justify-between px-4 py-3 text-xs text-ink-500">
          <span>{{ total }} tài khoản</span>
          <div class="flex items-center gap-2">
            <FhButton variant="secondary" size="sm" :disabled="page <= 1" @click="goTo(page - 1)">Trước</FhButton>
            <span>Trang {{ page }}/{{ Math.max(1, totalPages) }}</span>
            <FhButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="goTo(page + 1)">Sau</FhButton>
          </div>
        </div>
      </template>
    </FhCard>

    <FhConfirmDialog
      :open="!!historyFor"
      :title="`Lịch sử điểm: ${historyFor?.fullName ?? ''}`"
      consequence="Các lần trừ, điều chỉnh và làm mới điểm, mới nhất trước."
      confirm-text="Đóng"
      cancel-text="Quay lại"
      :danger="false"
      @confirm="historyFor = null"
      @cancel="historyFor = null"
    >
      <p v-if="historyLoading" class="text-xs text-ink-400">Đang tải...</p>
      <p v-else-if="historyError" class="text-xs text-danger-700">{{ historyError }}</p>
      <p v-else-if="history.length === 0" class="text-xs text-ink-500">Chưa có thay đổi nào.</p>
      <ul v-else class="max-h-72 overflow-y-auto divide-y divide-ink-100" data-testid="reputation-events">
        <li v-for="event in history" :key="event.id" class="flex items-start justify-between gap-3 py-2 text-xs">
          <div class="min-w-0">
            <div class="font-semibold text-ink-800">{{ KIND_LABELS[event.kind] ?? 'Thay đổi điểm' }} · {{ vnDateTimeString(event.createdAt) }}</div>
            <div class="text-ink-500 break-words">{{ [event.reason, event.penalty].filter(Boolean).join(' ') }}</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="font-bold font-num" :class="event.delta < 0 ? 'text-danger-700' : 'text-ink-700'">{{ signed(event.delta) }}</div>
            <div class="text-ink-400 font-num">còn {{ event.pointsAfter }}</div>
          </div>
        </li>
      </ul>
    </FhConfirmDialog>

    <FhConfirmDialog
      :open="!!adjustFor"
      :title="`Điều chỉnh điểm: ${adjustFor?.fullName ?? ''}`"
      consequence="Điểm mới quyết định mức tạm khoá. Nâng lên từ 70 điểm thì gỡ tạm khoá đang có. Lý do được ghi vào lịch sử và gửi cho người dùng."
      confirm-text="Lưu điều chỉnh"
      cancel-text="Huỷ"
      :danger="false"
      :loading="busy"
      @confirm="confirmAdjust"
      @cancel="adjustFor = null"
    >
      <div class="space-y-3 text-xs">
        <div class="flex gap-4">
          <label class="flex items-center gap-1.5"><input v-model="direction" type="radio" value="add" /> Cộng điểm</label>
          <label class="flex items-center gap-1.5"><input v-model="direction" type="radio" value="remove" /> Trừ điểm</label>
        </div>
        <label class="flex flex-col gap-1.5 font-semibold text-ink-700">
          Số điểm
          <input v-model="amount" type="number" min="1" max="100" step="1" inputmode="numeric" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm font-normal" data-testid="adjust-amount" />
        </label>
        <label class="flex flex-col gap-1.5 font-semibold text-ink-700">
          Lý do
          <textarea v-model="reason" rows="3" maxlength="500" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm font-normal" data-testid="adjust-reason" />
        </label>
        <p v-if="preview !== null" class="text-ink-600">Điểm sau khi điều chỉnh: <strong class="font-num">{{ adjustFor?.reputationPoints }} → {{ preview }}</strong></p>
        <p v-if="adjustError" class="text-danger-700" role="alert">{{ adjustError }}</p>
      </div>
    </FhConfirmDialog>
  </div>
</template>
