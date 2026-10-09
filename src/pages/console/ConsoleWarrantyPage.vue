<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-vue-next';
import { FhButton, FhCard, FhEmptyState } from '../../components';
import WarrantyDecisionModal, { type WarrantyDecisionMode } from '../../components/console/WarrantyDecisionModal.vue';
import {
  warrantyManagerApi,
  type StaffWarrantyClaim,
  type TechnicianWarrantyStat,
} from '../../api/warranty-claims.api';
import { useAuthStore } from '../../stores/auth';
import { formatDateTimeVN } from '../../utils/formatters';
import {
  claimDisplayMeta,
  inspectionResultLabels,
  notCoveredReasonLabels,
  warrantyClaimStatusMeta,
  warrantyClaimToneClasses,
  type InspectionResult,
  type NotCoveredReason,
  type WarrantyClaimStatus,
} from '../../utils/warranty-claim';
import { getSupportErrorMessage } from './support-cases.utils';

const authStore = useAuthStore();
const canDecide = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const tab = ref<'queue' | 'rates'>('queue');
const claims = ref<StaffWarrantyClaim[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const page = ref(1);
const limit = 10;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const statusFilter = ref<WarrantyClaimStatus | ''>('');
const unassignedOnly = ref(false);
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
    });
    if (requestId !== latestRequest) return;
    claims.value = result.data;
    total.value = result.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    claims.value = [];
    total.value = 0;
    error.value = getSupportErrorMessage(reason, 'Không thể tải hàng đợi bảo hành. Vui lòng thử lại.');
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
    statsError.value = getSupportErrorMessage(reason, 'Không thể tải tỷ lệ bảo hành. Vui lòng thử lại.');
  } finally {
    statsLoading.value = false;
  }
}

async function openModal(claim: StaffWarrantyClaim, mode: WarrantyDecisionMode) {
  notice.value = '';
  if (mode === 'assign' && !technicians.value.length) {
    try {
      technicians.value = await warrantyManagerApi.eligibleTechnicians();
    } catch (reason) {
      error.value = getSupportErrorMessage(reason, 'Không thể tải danh sách kỹ thuật viên.');
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
const meta = (claim: StaffWarrantyClaim) => claimDisplayMeta(claim);
const closed = (claim: StaffWarrantyClaim) => ['resolved', 'rejected'].includes(claim.status);
const statusOptions = Object.entries(warrantyClaimStatusMeta) as [WarrantyClaimStatus, { label: string }][];

watch([statusFilter, unassignedOnly], () => {
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
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-ink-900">Yêu cầu bảo hành</h1>
        <p class="mt-1 text-xs text-ink-500">
          Kỹ thuật viên phụ trách kiểm tra và đề xuất kết luận; kết luận chỉ có hiệu lực sau khi quản lý dịch vụ duyệt.
        </p>
        <p v-if="!canDecide" class="mt-1 text-xs text-warning-800" data-testid="warranty-read-only">
          Bạn đang xem ở chế độ chỉ đọc. Phân công, duyệt, từ chối và đóng yêu cầu do quản lý dịch vụ thực hiện.
        </p>
      </div>
      <div class="flex gap-2" role="tablist" aria-label="Chế độ xem">
        <FhButton :variant="tab === 'queue' ? 'primary' : 'secondary'" size="sm" role="tab" :aria-selected="tab === 'queue'" @click="tab = 'queue'">
          Hàng đợi
        </FhButton>
        <FhButton :variant="tab === 'rates' ? 'primary' : 'secondary'" size="sm" role="tab" :aria-selected="tab === 'rates'" @click="tab = 'rates'">
          Tỷ lệ theo kỹ thuật viên
        </FhButton>
      </div>
    </div>

    <p v-if="notice" role="status" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
      {{ notice }}
    </p>

    <template v-if="tab === 'queue'">
      <div class="flex flex-wrap items-end gap-3 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-3.5">
        <label class="flex min-w-[200px] flex-col gap-1 text-[11px] font-semibold text-ink-500">
          Trạng thái
          <select v-model="statusFilter" class="h-10 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-xs font-normal text-ink-700">
            <option value="">Tất cả trạng thái</option>
            <option v-for="[value, item] in statusOptions" :key="value" :value="value">{{ item.label }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 pb-2 text-xs text-ink-700">
          <input v-model="unassignedOnly" type="checkbox" /> Chưa có kỹ thuật viên
        </label>
        <FhButton variant="ghost" size="sm" :disabled="loading" @click="loadQueue">
          <RefreshCw :size="14" class="mr-1.5" /> Tải lại
        </FhButton>
      </div>

      <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
        {{ error }}
      </p>
      <p v-if="loading" class="text-sm text-ink-500">Đang tải…</p>
      <FhEmptyState
        v-else-if="!claims.length && !error"
        title="Không có yêu cầu bảo hành"
        description="Không có yêu cầu nào phù hợp với bộ lọc hiện tại."
      />

      <div v-else class="space-y-3">
        <FhCard v-for="claim in claims" :key="claim.id">
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <router-link :to="`/console/orders/${claim.order.id}`" class="font-mono text-xs font-bold text-brand-700 hover:text-brand-900">
                {{ claim.order.code }}
              </router-link>
              <span class="font-semibold text-ink-900">{{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }}</span>
              <span
                class="inline-flex h-[24px] items-center rounded-[var(--radius-sm)] px-2 text-[12px] font-medium"
                :class="warrantyClaimToneClasses[meta(claim).tone]"
              >
                {{ meta(claim).label }}
              </span>
              <span v-if="!claim.technician && !closed(claim)" class="rounded bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-700">Chưa có kỹ thuật viên</span>
              <span v-if="claim.submittedAfterExpiry" class="rounded bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700">Gửi sau khi hết hạn</span>
            </div>

            <p class="text-xs text-ink-600">
              {{ claim.order.serviceName }} · Khách hàng: {{ claim.order.customerName }} {{ claim.order.customerPhone }} ·
              Kỹ thuật viên: {{ claim.technician?.fullName || '—' }} · Gửi lúc {{ formatDateTimeVN(claim.submittedAt) }}
            </p>
            <p class="whitespace-pre-line text-ink-800">{{ claim.description }}</p>
            <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2">
              <a v-for="url in claim.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
                <img :src="url" alt="Ảnh khách hàng gửi kèm" class="h-14 w-14 rounded-[var(--radius-sm)] border border-ink-200 object-cover" />
              </a>
            </div>

            <div v-if="claim.visit?.proposedResult" class="space-y-1 rounded-[var(--radius-sm)] bg-ink-50 p-2.5 text-xs">
              <p class="font-semibold text-ink-800">Đề xuất của kỹ thuật viên</p>
              <p>{{ inspectionResultLabels[claim.visit.proposedResult as InspectionResult] }}</p>
              <p v-if="claim.visit.notCoveredReasonCode">
                Lý do: {{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || claim.visit.notCoveredReasonCode }}
              </p>
              <p class="whitespace-pre-line text-ink-700">{{ claim.visit.findings }}</p>
            </div>
            <p v-if="claim.resolutionNotes" class="rounded-[var(--radius-sm)] bg-ink-50 p-2.5 text-xs text-ink-800">
              <span class="font-semibold">Nội dung đã gửi khách hàng:</span> {{ claim.resolutionNotes }}
            </p>

            <div v-if="canDecide && !closed(claim)" class="flex flex-wrap gap-2 border-t border-ink-100 pt-2">
              <FhButton v-if="['submitted', 'accepted', 'inspected'].includes(claim.status)" variant="secondary" size="sm" @click="openModal(claim, 'assign')">
                {{ claim.technician ? 'Phân công lại' : 'Phân công kỹ thuật viên' }}
              </FhButton>
              <FhButton v-if="claim.status === 'inspected'" variant="primary" size="sm" @click="openModal(claim, 'approve')">
                Duyệt kết luận
              </FhButton>
              <FhButton v-if="['submitted', 'accepted', 'inspected'].includes(claim.status)" variant="ghost" size="sm" @click="openModal(claim, 'reject')">
                Từ chối
              </FhButton>
              <FhButton v-if="['in_progress', 'awaiting_customer', 'disputed'].includes(claim.status)" variant="primary" size="sm" @click="openModal(claim, 'close')">
                Đóng yêu cầu
              </FhButton>
            </div>
          </div>
        </FhCard>

        <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-ink-500">
          <span>Trang {{ page }} / {{ totalPages }} · {{ total }} yêu cầu</span>
          <div class="flex items-center gap-2">
            <button class="rounded border border-ink-200 p-2 hover:bg-ink-100 disabled:opacity-40" type="button" aria-label="Trang trước" :disabled="page <= 1 || loading" @click="page--">
              <ChevronLeft :size="16" />
            </button>
            <button class="rounded border border-ink-200 p-2 hover:bg-ink-100 disabled:opacity-40" type="button" aria-label="Trang sau" :disabled="page >= totalPages || loading" @click="page++">
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3 text-xs text-ink-600">
        <label class="flex items-center gap-2">
          Khoảng thời gian
          <select v-model.number="windowDays" class="h-9 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-2 text-xs">
            <option :value="30">30 ngày</option>
            <option :value="90">90 ngày</option>
            <option :value="180">180 ngày</option>
            <option :value="365">365 ngày</option>
          </select>
        </label>
        <span>Tỷ lệ chỉ để tham khảo. Kỹ thuật viên có dưới 10 đơn có bảo hành được đánh dấu "Ít dữ liệu" vì tỷ lệ chưa đáng tin.</span>
      </div>
      <p v-if="statsError" role="alert" class="text-sm text-danger-700">{{ statsError }}</p>
      <p v-if="statsLoading" class="text-sm text-ink-500">Đang tải…</p>
      <FhEmptyState v-else-if="!stats.length && !statsError" title="Chưa có dữ liệu" description="Chưa có đơn có bảo hành hoặc yêu cầu bảo hành trong khoảng thời gian này." />
      <FhCard v-else-if="stats.length" padding="none">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="border-b border-ink-100 bg-ink-50 text-ink-600">
              <tr>
                <th class="p-3">Kỹ thuật viên</th>
                <th class="p-3 text-right">Đơn có bảo hành</th>
                <th class="p-3 text-right">Yêu cầu</th>
                <th class="p-3 text-right">Tỷ lệ bảo hành</th>
                <th class="p-3 text-right">Không bảo hành</th>
                <th class="p-3 text-right">Quản lý đổi kết luận</th>
                <th class="p-3 text-right">Khách phản đối</th>
                <th class="p-3 text-right">Từ chối nhận</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr v-for="row in stats" :key="row.technicianId">
                <td class="p-3 font-medium text-ink-900">
                  {{ row.fullName }}
                  <span v-if="row.lowSample" class="ml-1 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">Ít dữ liệu</span>
                </td>
                <td class="p-3 text-right font-num">{{ row.ordersWithWarranty }}</td>
                <td class="p-3 text-right font-num">{{ row.claims }}</td>
                <td class="p-3 text-right font-num font-semibold">{{ pct(row.claimRate) }}</td>
                <td class="p-3 text-right font-num">{{ pct(row.notCoveredRate) }}</td>
                <td class="p-3 text-right font-num">{{ pct(row.overriddenRate) }}</td>
                <td class="p-3 text-right font-num">{{ pct(row.disputedRate) }}</td>
                <td class="p-3 text-right font-num">{{ pct(row.declineRate) }} ({{ row.declines }})</td>
              </tr>
            </tbody>
          </table>
        </div>
      </FhCard>
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
