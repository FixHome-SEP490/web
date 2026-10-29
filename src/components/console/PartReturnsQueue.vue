<script setup lang="ts">
/**
 * P1 hoàn trả linh kiện (owner lock 19/10/2026): kỹ thuật viên khai trả, quản lý
 * dịch vụ kiểm tra thực tế và bấm "Đã nhận". Nhận thiếu thì phần còn lại vẫn chờ.
 *
 * Chỉ những dòng thợ đã khai trả mà chưa nhận đủ mới có ô nhận, gom theo phiếu
 * linh kiện (BUG DETECTOR 10). Linh kiện thợ còn giữ mà chưa khai trả chỉ hiện
 * để theo dõi, không thành dòng toàn số 0 với nút bấm được.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { AlertTriangle, X } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '..';
import ConsolePagination from './ConsolePagination.vue';
import LegacyManualReviewForm from './LegacyManualReviewForm.vue';
import { consoleField } from './console-ui';
import { useAuthStore } from '../../stores/auth';
import {
  partRequestsApi,
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  type LegacyManualReviewRecord,
  type PartCustodyReturnRecord,
} from '../../api/part-requests.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';
import { partCustodyQuantities } from '../../utils/part-custody-quantities';
import { usePartReturnsRefresh } from '../../composables/usePartReturnsRefresh';

const emit = defineEmits<{ (e: 'count', value: number | null): void }>();

const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));

const returnQueue = ref<PartCustodyReturnRecord[]>([]);
const returnsLoading = ref(true);
const returnsUnavailable = ref(false);
const returnsLoadError = ref(false);
let returnsLoadVersion = 0;
const acceptDrafts = ref<Record<string, number>>({});
const acceptingKey = ref<string | null>(null);
const toastMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const legacyRows = ref<LegacyManualReviewRecord[]>([]);
const legacyLoading = ref(true);
const legacyUnavailable = ref(false);
const legacyLoadError = ref(false);
const legacyPage = ref(1);
const legacyPageSize = 20;
const legacyTotal = ref(0);
const legacyTotalPages = computed(() => Math.max(1, Math.ceil(legacyTotal.value / legacyPageSize)));
let legacyLoadVersion = 0;

const showToast = (type: 'success' | 'error', text: string) => {
  toastMessage.value = { type, text };
  setTimeout(() => {
    if (toastMessage.value?.text === text) toastMessage.value = null;
  }, 4000);
};

const returnKey = (row: PartCustodyReturnRecord) => `${row.partRequestId}:${row.partRequestItemId}`;

/** Khai trả nhưng chưa được nhận thực tế: đây là phần quản lý còn phải xác nhận. */
const pendingDeclaredQty = (row: PartCustodyReturnRecord) => partCustodyQuantities(row).awaitingManager;

/** Số nhận thực tế tối đa: không quá phần đang chờ nhận của dòng này. */
const maxAcceptQty = (row: PartCustodyReturnRecord) => Math.max(0, Math.min(row.outstandingQty, pendingDeclaredQty(row)));

const returnRequestCode = (row: PartCustodyReturnRecord) => `PR-${row.partRequestId.substring(0, 8).toUpperCase()}`;

/** Reference for the counter: name when the Backend has it, otherwise a short code. */
const technicianRef = (row: PartCustodyReturnRecord) => {
  const name = row.technicianId ? (row.technicianName ?? '').trim() : '';
  if (name) return name;
  return row.technicianId ? `KT-${row.technicianId.substring(0, 8).toUpperCase()}` : '—';
};

const legacyRequestCode = (row: LegacyManualReviewRecord) => `PR-${row.partRequestId.substring(0, 8).toUpperCase()}`;
const legacyTechnicianRef = (row: LegacyManualReviewRecord) => `KT-${row.technicianId.substring(0, 8).toUpperCase()}`;

/**
 * Legacy rows have no custody ledger. This read is deliberately separate from
 * the tracked queue: a 403/503 here hides only this group, and any other error
 * leaves the tracked queue usable while offering a retry.
 */
const loadLegacyReview = async () => {
  const version = ++legacyLoadVersion;
  if (!canOperate.value) {
    legacyRows.value = [];
    legacyTotal.value = 0;
    legacyLoading.value = false;
    legacyUnavailable.value = true;
    legacyLoadError.value = false;
    return;
  }
  legacyLoading.value = true;
  legacyLoadError.value = false;
  legacyUnavailable.value = false;
  try {
    const result = await partRequestsApi.getLegacyManualReview({ page: legacyPage.value, pageSize: legacyPageSize });
    if (version !== legacyLoadVersion) return;
    legacyRows.value = result.data;
    legacyTotal.value = result.total;
    if (result.page > legacyTotalPages.value) {
      legacyPage.value = legacyTotalPages.value;
      void loadLegacyReview();
      return;
    }
  } catch (err: unknown) {
    if (version !== legacyLoadVersion) return;
    legacyRows.value = [];
    legacyTotal.value = 0;
    if (isPartReturnsUnavailableError(err)) legacyUnavailable.value = true;
    else legacyLoadError.value = true;
  } finally {
    if (version === legacyLoadVersion) legacyLoading.value = false;
  }
};

const changeLegacyPage = (next: number) => {
  const last = legacyTotalPages.value;
  legacyPage.value = Math.min(Math.max(1, next), last);
  void loadLegacyReview();
};

/** Lines the manager has to receive, and parts still held without a return declared; one card per part request. */
const awaiting = computed(() => returnQueue.value.filter((row) => maxAcceptQty(row) > 0));
const undeclared = computed(() => returnQueue.value.filter((row) => maxAcceptQty(row) === 0 && row.outstandingQty > 0));
function byRequest(rows: PartCustodyReturnRecord[]) {
  const grouped = new Map<string, PartCustodyReturnRecord[]>();
  for (const row of rows) grouped.set(row.partRequestId, [...(grouped.get(row.partRequestId) ?? []), row]);
  return [...grouped.entries()].map(([id, list]) => ({ id, first: list[0], rows: list }));
}
const groups = computed(() => byRequest(awaiting.value));
const heldGroups = computed(() => byRequest(undeclared.value));

const loadReturns = async () => {
  const version = ++returnsLoadVersion;
  returnsLoading.value = true;
  returnsUnavailable.value = false;
  returnsLoadError.value = false;
  emit('count', null);
  try {
    const rows = await partRequestsApi.getPendingReturns();
    if (version !== returnsLoadVersion) return;
    const drafts: Record<string, number> = {};
    for (const row of rows) {
      const key = returnKey(row);
      const previous = returnQueue.value.find(candidate => returnKey(candidate) === key);
      const draft = acceptDrafts.value[key];
      drafts[key] = previous?.version === row.version && Number.isInteger(draft) && draft >= 1 && draft <= maxAcceptQty(row) ? draft : maxAcceptQty(row);
    }
    returnQueue.value = rows;
    acceptDrafts.value = drafts;
    emit('count', awaiting.value.length);
  } catch (err: unknown) {
    if (version !== returnsLoadVersion) return;
    returnQueue.value = [];
    acceptDrafts.value = {};
    // Cờ tính năng đang tắt hoặc không có quyền: ẩn mục hoàn trả, không chặn trang.
    if (isPartReturnsUnavailableError(err)) returnsUnavailable.value = true;
    else returnsLoadError.value = true;
    emit('count', null);
  } finally {
    if (version === returnsLoadVersion) returnsLoading.value = false;
  }
};

const handleAcceptReturn = async (row: PartCustodyReturnRecord) => {
  if (!canOperate.value || acceptingKey.value) return;
  const key = returnKey(row);
  const maxQty = maxAcceptQty(row);
  const quantity = Number(acceptDrafts.value[key]);
  if (maxQty < 1) return;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    showToast('error', `Số lượng nhận thực tế phải là số nguyên từ 1 đến ${maxQty}.`);
    return;
  }
  acceptingKey.value = key;
  try {
    await partRequestsApi.acceptReturn(row.partRequestId, row.partRequestItemId, {
      quantity,
      expectedVersion: row.version,
      idempotencyKey: createIdempotencyKey('accept'),
    });
    showToast(
      'success',
      quantity < pendingDeclaredQty(row)
        ? 'Đã ghi nhận số lượng nhận thực tế. Phần còn lại vẫn chờ nhận.'
        : 'Đã ghi nhận số linh kiện đã nhận.',
    );
    await loadReturns();
  } catch (err: unknown) {
    showToast('error', userFacingError(err, 'Chưa ghi nhận được linh kiện hoàn trả, vui lòng thử lại.'));
    // Dòng đã bị người khác cập nhật: đọc lại để lấy đúng số và phiên bản.
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (status === 409) await loadReturns();
  } finally {
    acceptingKey.value = null;
  }
};

onMounted(() => {
  void loadReturns();
  void loadLegacyReview();
});
usePartReturnsRefresh(loadReturns);
onUnmounted(() => {
  ++returnsLoadVersion;
  ++legacyLoadVersion;
});
defineExpose({ reload: loadReturns, reloadLegacy: loadLegacyReview });
</script>

<template>
  <div class="space-y-4">
    <section
      v-if="!returnsUnavailable"
      data-testid="part-returns-queue"
      class="rounded-[var(--radius-md)] border border-ink-200 bg-white"
      aria-label="Linh kiện chờ nhận hoàn trả"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-ink-900">Chờ nhận linh kiện hoàn trả</h2>
          <span v-if="!returnsLoading && !returnsLoadError" class="font-num text-sm text-ink-500" data-testid="part-returns-count">{{ awaiting.length }}</span>
        </div>
        <FhButton variant="ghost" size="md" :disabled="returnsLoading" @click="loadReturns">Làm mới</FhButton>
      </header>

      <div
        v-if="toastMessage"
        class="mx-5 mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm"
        :class="toastMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-800 border-danger-200'"
        :role="toastMessage.type === 'success' ? 'status' : 'alert'"
      >
        <span>{{ toastMessage.text }}</span>
        <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="Đóng thông báo" @click="toastMessage = null">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <div v-if="returnsLoading" class="space-y-2 px-5 py-4" aria-busy="true" aria-label="Đang tải linh kiện chờ nhận">
        <FhSkeleton height="14px" width="30%" />
        <FhSkeleton height="40px" rounded="md" />
        <FhSkeleton height="40px" rounded="md" />
      </div>

      <div v-else-if="returnsLoadError" role="alert" class="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm text-ink-600">
        <span>Chưa tải được danh sách chờ nhận.</span>
        <FhButton variant="secondary" size="md" @click="loadReturns">Thử lại</FhButton>
      </div>

      <p v-else-if="groups.length === 0" class="px-5 py-4 text-sm text-ink-500">
        Không có linh kiện nào đang chờ xác nhận hoàn trả.
        <span class="mt-1 block text-xs text-ink-500">Hàng chờ này chỉ gồm các dòng có sổ custody; trống không có nghĩa là mọi linh kiện đã được trả đủ.</span>
      </p>

      <ul v-else class="divide-y divide-ink-100">
        <li v-for="group in groups" :key="group.id" class="space-y-3 px-5 py-4" data-testid="part-return-group">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span class="font-num font-semibold text-ink-700">{{ returnRequestCode(group.first) }}</span>
            <router-link v-if="group.first.orderId" :to="`/console/orders/${group.first.orderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
            <span>Kỹ thuật viên: <span class="font-num">{{ technicianRef(group.first) }}</span></span>
          </div>
          <div v-for="row in group.rows" :key="returnKey(row)" class="space-y-3 border-t border-ink-100 pt-3">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div class="min-w-0 break-words text-sm font-semibold text-ink-900">{{ row.partNameSnapshot }}</div>
              <span class="rounded-md bg-warning-50 px-2 py-1 text-sm font-medium text-warning-800" :data-testid="`part-return-pending-${row.partRequestItemId}`">Chờ nhận {{ pendingDeclaredQty(row) }}</span>
            </div>
            <dl class="flex flex-wrap gap-x-3 gap-y-2 text-sm text-ink-600" :aria-label="`Số lượng ${row.partNameSnapshot}`">
              <div class="inline-flex items-baseline gap-1"><dt>Cấp{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ row.issuedQty }}<span aria-hidden="true" class="ml-3 font-sans font-normal text-ink-600">{{ ' · ' }}</span></dd></div>
              <div class="inline-flex items-baseline gap-1"><dt>Dùng{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ row.usedQty }}<span aria-hidden="true" class="ml-3 font-sans font-normal text-ink-600">{{ ' · ' }}</span></dd></div>
              <div class="inline-flex items-baseline gap-1"><dt>Khai trả{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ row.declaredQty }}<span aria-hidden="true" class="ml-3 font-sans font-normal text-ink-600">{{ ' · ' }}</span></dd></div>
              <div class="inline-flex items-baseline gap-1"><dt>Đã nhận{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ row.managerAcceptedQty }}</dd></div>
            </dl>
            <div v-if="canOperate" class="flex flex-wrap items-end gap-2">
              <div>
                <label :for="`accept-qty-${returnKey(row)}`" class="mb-1 block text-xs font-medium text-ink-700">Số lượng nhận thực tế</label>
                <input
                  :id="`accept-qty-${returnKey(row)}`"
                  v-model.number="acceptDrafts[returnKey(row)]"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :max="maxAcceptQty(row)"
                  :aria-describedby="`accept-hint-${returnKey(row)}`"
                  :class="consoleField"
                  class="min-h-11 w-24"
                />
              </div>
              <span :id="`accept-hint-${returnKey(row)}`" class="min-w-0 flex-1 pb-3 text-sm text-ink-600">Nhận thực tế tối đa {{ maxAcceptQty(row) }}</span>
              <FhButton
                data-testid="accept-return"
                variant="primary"
                size="md"
                class="w-full sm:ml-auto sm:w-auto"
                :aria-label="`Xác nhận đã nhận ${row.partNameSnapshot}`"
                :loading="acceptingKey === returnKey(row)"
                :disabled="!!acceptingKey || returnsLoading || maxAcceptQty(row) < 1"
                @click="handleAcceptReturn(row)"
              >Xác nhận đã nhận</FhButton>
            </div>
            <p v-else class="text-xs text-ink-500">Chỉ quản lý dịch vụ xác nhận được số linh kiện đã nhận.</p>
          </div>
        </li>
      </ul>

      <details v-if="!returnsLoading && !returnsLoadError && heldGroups.length" class="border-t border-ink-100 px-5 py-3 text-sm" data-testid="part-returns-held">
        <summary class="cursor-pointer rounded-lg font-medium text-ink-700 min-h-11 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">Thợ đang giữ, chưa khai trả ({{ undeclared.length }})</summary>
        <ul class="mt-2 space-y-2">
          <li v-for="group in heldGroups" :key="group.id" class="space-y-1">
            <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
              <span class="font-num font-semibold text-ink-700">{{ returnRequestCode(group.first) }}</span>
              <router-link v-if="group.first.orderId" :to="`/console/orders/${group.first.orderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
              <span>Kỹ thuật viên: <span class="font-num">{{ technicianRef(group.first) }}</span></span>
            </div>
            <p v-for="row in group.rows" :key="returnKey(row)" class="flex flex-wrap justify-between gap-x-3 gap-y-1 text-ink-700">
              <span class="min-w-0 break-words">{{ row.partNameSnapshot }}</span>
              <span class="text-sm text-ink-600">Cấp {{ row.issuedQty }} · Dùng {{ row.usedQty }} · Còn giữ {{ row.outstandingQty }}</span>
            </p>
          </li>
        </ul>
      </details>

    </section>

    <section
      v-if="canOperate && !legacyUnavailable"
      data-testid="legacy-part-returns"
      role="region"
      class="rounded-[var(--radius-md)] border border-warning-200 bg-white"
      aria-labelledby="legacy-part-returns-title"
    >
      <header class="flex flex-wrap items-start justify-between gap-2 border-b border-warning-200/70 px-5 py-3">
        <div class="min-w-0">
          <h2 id="legacy-part-returns-title" class="text-base font-semibold text-ink-900">Linh kiện lịch sử cần xác minh</h2>
          <p class="mt-0.5 text-xs text-ink-600">Các dòng FixHome đã bàn giao trước khi bật sổ custody; không có sổ để đối chiếu.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span v-if="!legacyLoading && !legacyLoadError" class="font-num text-sm text-ink-500" data-testid="legacy-part-returns-count">{{ legacyTotal }}</span>
          <FhButton variant="ghost" size="md" :disabled="legacyLoading" @click="loadLegacyReview">Làm mới</FhButton>
        </div>
      </header>

      <div role="note" class="mx-5 mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-800" data-testid="legacy-part-returns-alert">
        <AlertTriangle :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Chưa có chứng từ custody – quản lý dịch vụ (SM) xác minh thủ công. Không hiển thị số đã nhận, còn lại hoặc khai trả cho các dòng này.</span>
      </div>

      <div v-if="legacyLoading" class="space-y-2 px-5 py-4" aria-busy="true" aria-label="Đang tải linh kiện lịch sử cần xác minh">
        <FhSkeleton height="14px" width="30%" />
        <FhSkeleton height="40px" rounded="md" />
        <FhSkeleton height="40px" rounded="md" />
      </div>

      <div v-else-if="legacyLoadError" role="alert" class="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm text-ink-600" data-testid="legacy-part-returns-error">
        <span>Chưa tải được linh kiện lịch sử cần xác minh.</span>
        <FhButton variant="secondary" size="md" @click="loadLegacyReview">Thử lại</FhButton>
      </div>

      <p v-else-if="legacyRows.length === 0" class="px-5 py-4 text-sm text-ink-500" data-testid="legacy-part-returns-empty">
        Không có linh kiện lịch sử nào cần xác minh.
      </p>

      <template v-else>
        <ul class="divide-y divide-warning-200/70">
          <li v-for="row in legacyRows" :key="row.partRequestItemId" class="space-y-2 px-5 py-4" data-testid="legacy-part-return">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div class="min-w-0 break-words text-sm font-semibold text-ink-900">{{ row.partNameSnapshot }}</div>
              <span class="rounded-md border border-warning-300 bg-white px-2 py-1 text-xs font-medium text-warning-800" data-testid="legacy-receipt-state">Chưa xác định (UNKNOWN)</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
              <span class="font-num font-semibold text-ink-700">{{ legacyRequestCode(row) }}</span>
              <router-link :to="`/console/orders/${row.orderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
              <span>Kỹ thuật viên: <span class="font-num">{{ legacyTechnicianRef(row) }}</span></span>
              <span>Bàn giao: <span class="font-num">{{ vnDateTimeString(row.handedOverAt) }}</span></span>
            </div>
            <dl class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
              <div class="inline-flex items-baseline gap-1">
                <dt>Số lượng đã cấp theo lịch sử</dt>
                <dd class="font-num font-semibold text-ink-900" data-testid="legacy-issued-qty">{{ row.issuedQty }}</dd>
              </div>
            </dl>
            <LegacyManualReviewForm :row="row" @saved="loadLegacyReview" @refresh="loadLegacyReview" />
          </li>
        </ul>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-warning-200/70 px-5 py-3">
          <p class="text-xs text-ink-600">
            Trang {{ legacyPage }}/{{ legacyTotalPages }} · {{ legacyTotal }} dòng linh kiện lịch sử
            <span v-if="legacyTotal > legacyPage * legacyPageSize" class="block">Còn {{ legacyTotal - legacyPage * legacyPageSize }} dòng ở trang sau.</span>
          </p>
          <ConsolePagination
            :page="legacyPage"
            :total="legacyTotal"
            :page-size="legacyPageSize"
            :disabled="legacyLoading"
            @update:page="changeLegacyPage"
          />
        </div>
      </template>
    </section>
  </div>
</template>
