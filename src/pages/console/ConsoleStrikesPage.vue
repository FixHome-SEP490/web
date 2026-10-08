<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ShieldAlert, CheckCircle2, RotateCcw } from 'lucide-vue-next';
import { FhCard, FhTable, FhButton, FhConfirmDialog, FhSkeleton, FhEmptyState } from '../../components';
import { ordersApi, type StrikeRecord } from '../../api/orders.api';
import { vnDateString } from '../../utils/vn-time';

interface StrikeRow extends StrikeRecord {
  userName: string;
  role: string;
  orderCode: string;
  suspendedUntil?: string | null;
}

/** Role codes shown as words. */
const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  TECHNICIAN: 'Kỹ thuật viên',
  SERVICE_MANAGER: 'Quản lý dịch vụ',
  ADMIN: 'Quản trị viên',
};
const roleLabel = (role: unknown) => ROLE_LABELS[String(role ?? '').toUpperCase()] ?? 'Không rõ';

const loading = ref(true);
const loadError = ref('');
const rows = ref<StrikeRow[]>([]);
const busy = ref(false);

async function loadStrikes() {
  loading.value = true;
  loadError.value = '';
  try {
    // The list carries whose strike, the order and the suspension: Service
    // Managers may not read user records, and one request per row was slow.
    const strikes = await ordersApi.getStrikes();
    rows.value = strikes.map((s) => ({
      ...s,
      userName: s.userName ?? 'Không rõ',
      role: s.userRole ?? '',
      orderCode: s.orderCode ?? '—',
      suspendedUntil: s.userSuspendedUntil ?? null,
    }));
  } catch {
    loadError.value = 'Không thể tải danh sách Strike. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
}

const showWaiveModal = ref(false);
const strikeToWaive = ref<StrikeRow | null>(null);
const waiveReason = ref('');
const waiveError = ref('');

function openWaive(strike: StrikeRow) {
  strikeToWaive.value = strike;
  waiveReason.value = '';
  waiveError.value = '';
  showWaiveModal.value = true;
}

async function confirmWaive() {
  if (!strikeToWaive.value) return;
  // The reason is kept on the strike and in the audit log.
  const reason = waiveReason.value.trim();
  if (reason.length < 5) {
    waiveError.value = 'Ghi lý do miễn vi phạm, tối thiểu 5 ký tự.';
    return;
  }
  busy.value = true;
  try {
    const updated = await ordersApi.waiveStrike(strikeToWaive.value.id, reason);
    Object.assign(strikeToWaive.value, updated);
  } catch {
    window.alert('Không thể miễn trừ Strike. Vui lòng thử lại.');
  } finally {
    busy.value = false;
    showWaiveModal.value = false;
  }
}

onMounted(loadStrikes);
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ShieldAlert class="text-danger-600" :size="24" />
          Giám sát Vi phạm & Đình chỉ Tài khoản (Strikes)
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi các trường hợp vi phạm quy chuẩn huỷ đơn và miễn trừ có kiểm toán.
        </p>
      </div>
    </div>

    <!-- Table -->
    <FhCard>
      <div v-if="loading" class="p-6 space-y-3">
        <FhSkeleton height="40px" :count="3" />
      </div>
      <FhEmptyState
        v-else-if="loadError"
        title="Không tải được danh sách"
        :description="loadError"
        action-text="Thử lại"
        @action="loadStrikes"
      />
      <FhEmptyState
        v-else-if="rows.length === 0"
        title="Chưa có Strike nào"
        description="Danh sách sẽ hiện ở đây khi có tài khoản bị áp Strike vì huỷ đơn."
      />
      <FhTable
        v-else
        :columns="[
          { key: 'user', label: 'Tài khoản vi phạm' },
          { key: 'orderCode', label: 'Đơn liên quan' },
          { key: 'reason', label: 'Lý do áp dụng' },
          { key: 'suspension', label: 'Đình chỉ đặt lịch/nhận việc', width: '180px' },
          { key: 'actions', label: 'Thao tác', width: '140px' },
        ]"
        :rows="rows"
      >
        <template #cell-user="{ row }">
          <div class="font-bold text-xs text-ink-900">{{ row.userName }}</div>
          <span
            class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
            :class="row.role.toUpperCase() === 'TECHNICIAN' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-800'"
          >
            {{ roleLabel(row.role) }}
          </span>
        </template>

        <template #cell-orderCode="{ row }">
          <span class="font-mono text-xs text-ink-700">{{ row.orderCode }}</span>
        </template>

        <template #cell-reason="{ row }">
          <span class="text-xs text-ink-600 line-clamp-2">{{ row.waiveReason || '—' }}</span>
        </template>

        <template #cell-suspension="{ row }">
          <div v-if="String(row.status).toUpperCase() !== 'WAIVED' && row.suspendedUntil" class="text-xs font-semibold text-danger-600 font-num">
            Tới {{ vnDateString(row.suspendedUntil) }}
          </div>
          <span v-else-if="String(row.status).toUpperCase() === 'WAIVED'" class="text-xs font-semibold text-success-600 flex items-center gap-1">
            <CheckCircle2 :size="13" /> Đã gỡ bỏ
          </span>
          <span v-else class="text-xs text-ink-400">Không đình chỉ</span>
        </template>

        <template #cell-actions="{ row }">
          <FhButton
            v-if="String(row.status).toUpperCase() !== 'WAIVED'"
            variant="secondary"
            size="sm"
            @click="openWaive(row)"
          >
            <RotateCcw :size="13" class="mr-1" /> Miễn trừ
          </FhButton>
          <span v-else class="text-xs text-ink-400 font-semibold">Đã miễn trừ</span>
        </template>
      </FhTable>
    </FhCard>

    <!-- Waive Strike Dialog -->
    <FhConfirmDialog
      :open="showWaiveModal"
      title="Miễn trừ Vi phạm (Waive Strike)"
      consequence="Vi phạm này chuyển sang đã miễn và không còn tính vào số vi phạm. Lệnh tạm khoá đang có (nếu có) vẫn giữ đến hết hạn."
      confirm-text="Xác nhận miễn trừ"
      cancel-text="Giữ nguyên"
      :danger="false"
      :loading="busy"
      @confirm="confirmWaive"
      @cancel="showWaiveModal = false"
    >
      <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-700">
        Lý do miễn <span class="font-normal text-ink-400">(lưu vào lịch sử vi phạm)</span>
        <textarea v-model="waiveReason" rows="3" maxlength="500" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm font-normal text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" />
      </label>
      <p v-if="waiveError" class="text-xs text-danger-700" role="alert">{{ waiveError }}</p>
    </FhConfirmDialog>
  </div>
</template>
