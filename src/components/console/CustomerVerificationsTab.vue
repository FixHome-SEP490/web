<script setup lang="ts">
// Admin: customers' identity checks (PO 14/10/2026), the tab "Khách hàng" of
// the review page. Waiting ones first by default; the server filters, searches
// (name without accents, email, phone, CCCD) and pages.
import { computed, ref } from 'vue';
import FhButton from '../FhButton.vue';
import FhConfirmDialog from '../FhConfirmDialog.vue';
import FhStatusPill from '../FhStatusPill.vue';
import ConsoleLoadError from './ConsoleLoadError.vue';
import ConsoleMenuItem from './ConsoleMenuItem.vue';
import ConsoleMoreMenu from './ConsoleMoreMenu.vue';
import ConsolePagination from './ConsolePagination.vue';
import ConsoleSearch from './ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from './ConsoleTable.vue';
import CustomerVerificationDrawer from './CustomerVerificationDrawer.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleTextarea } from './console-ui';
import { verificationStatusPill } from './customer-verification-labels';
import { adminCustomerVerificationsApi } from '../../api/admin-customer-verifications.api';
import type { CustomerVerification, CustomerVerificationRecordStatus } from '../../api/customer-verification.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { useQueryChoice, useQueryPage, useQuerySearch } from '../../composables/useQueryState';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString } from '../../utils/vn-time';

type StatusFilter = CustomerVerificationRecordStatus | 'all';
const STATUS_FILTERS: readonly StatusFilter[] = ['pending', 'verified', 'rejected', 'all'];
const PAGE_SIZE = 10;

const columns: ConsoleColumn[] = [
  { key: 'customer', label: 'Khách hàng' },
  { key: 'cccd', label: 'Số CCCD', hideBelow: 'md' },
  { key: 'submittedAt', label: 'Ngày gửi', hideBelow: 'lg' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

const status = useQueryChoice<StatusFilter>('kyc', STATUS_FILTERS, 'pending');
const { input: searchInput, search } = useQuerySearch('cq');

const { page, items, total, loading, error, load, changingPage, prefetch } = usePagedList<CustomerVerification>({
  key: () => queryKeys.identity.adminCustomers({ status: status.value, search: search.value }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('cpage'),
  fetch: (p, size) =>
    adminCustomerVerificationsApi.list({
      status: status.value === 'all' ? undefined : status.value,
      search: search.value,
      page: p,
      limit: size,
    }),
});
const loadError = computed(() => (error.value ? userFacingError(error.value, CONSOLE_LOAD_ERROR) : ''));
const cache = useCacheUpdates();

const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const busyId = ref<string | null>(null);
const selected = ref<CustomerVerification | null>(null);

const nameOf = (v: CustomerVerification) => v.customer?.fullName || v.fullName || 'Khách hàng';

async function afterDecision(text: string) {
  message.value = { tone: 'success', text };
  selected.value = null;
  await cache.refresh(affectedBy.identityChange);
}

async function approve(v: CustomerVerification) {
  if (busyId.value) return;
  busyId.value = v.id;
  message.value = null;
  try {
    await adminCustomerVerificationsApi.approve(v.id);
    await afterDecision(`Đã duyệt xác minh danh tính của ${nameOf(v)}.`);
  } catch (err) {
    message.value = { tone: 'error', text: userFacingError(err, 'Chưa duyệt được hồ sơ, vui lòng thử lại.') };
  } finally {
    busyId.value = null;
  }
}

// Reject with a reason the customer reads (5 to 2000 characters).
const rejecting = ref<CustomerVerification | null>(null);
const rejectReason = ref('');
const rejectError = ref('');

function openReject(v: CustomerVerification) {
  rejecting.value = v;
  rejectReason.value = '';
  rejectError.value = '';
}

async function confirmReject() {
  const v = rejecting.value;
  if (!v || busyId.value) return;
  const reason = rejectReason.value.trim();
  if (reason.length < 5) {
    rejectError.value = 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).';
    return;
  }
  if (reason.length > 2000) {
    rejectError.value = 'Lý do từ chối tối đa 2000 ký tự.';
    return;
  }
  busyId.value = v.id;
  message.value = null;
  try {
    await adminCustomerVerificationsApi.reject(v.id, reason);
    rejecting.value = null;
    await afterDecision(`Đã từ chối hồ sơ của ${nameOf(v)}.`);
  } catch (err) {
    rejectError.value = userFacingError(err, 'Chưa từ chối được hồ sơ, vui lòng thử lại.');
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="space-y-5" data-testid="customer-verifications">
    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchInput" placeholder="Tìm tên, email, số điện thoại, CCCD" label="Tìm hồ sơ khách hàng" :maxlength="100" />
      <select v-model="status" :class="consoleField" aria-label="Trạng thái hồ sơ" data-testid="cv-status">
        <option value="pending">Đang chờ duyệt</option>
        <option value="verified">Đã duyệt</option>
        <option value="rejected">Đã từ chối</option>
        <option value="all">Tất cả trạng thái</option>
      </select>
    </div>

    <p
      v-if="message"
      :role="message.tone === 'error' ? 'alert' : 'status'"
      class="rounded-[var(--radius-sm)] border px-4 py-3 text-sm"
      :class="message.tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'"
      data-testid="cv-message"
    >{{ message.text }}</p>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
    <template v-else>
      <ConsoleTable
        :columns="columns"
        :rows="items"
        :loading="loading"
        :row-test-id="(row) => `cv-row-${row.id}`"
        class="transition-opacity"
        :class="{ 'opacity-60': changingPage }"
        empty-text="Không có hồ sơ phù hợp."
      >
        <template #cell-customer="{ row }">
          <button
            type="button"
            class="text-left font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            @click="selected = row"
          >{{ nameOf(row) }}</button>
          <div class="truncate text-xs text-ink-500" :title="row.customer?.email || ''">
            {{ row.customer?.email || 'Chưa có email' }} · <span class="whitespace-nowrap font-num">{{ row.customer?.phoneNumber || '—' }}</span>
          </div>
        </template>
        <template #cell-cccd="{ row }">
          <span class="whitespace-nowrap font-num text-ink-700">{{ row.citizenIdNumber }}</span>
        </template>
        <template #cell-submittedAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ vnDateString(row.submittedAt) }}</span>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="verificationStatusPill(row.status).status" :label="verificationStatusPill(row.status).label" />
        </template>
        <template #cell-actions="{ row }">
          <div v-if="row.status === 'pending'" class="flex items-center justify-end gap-2">
            <FhButton size="sm" :loading="busyId === row.id" :disabled="Boolean(busyId)" data-testid="cv-approve" @click="approve(row)">Duyệt</FhButton>
            <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
              <ConsoleMenuItem danger :disabled="Boolean(busyId)" @click="openReject(row)">Từ chối</ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </template>
      </ConsoleTable>
      <ConsolePagination v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" @prefetch="prefetch" />
    </template>

    <CustomerVerificationDrawer
      :verification="selected"
      :busy="Boolean(selected && busyId === selected.id)"
      @close="selected = null"
      @approve="approve"
      @reject="openReject"
    />

    <FhConfirmDialog
      :open="Boolean(rejecting)"
      :loading="Boolean(rejecting && busyId === rejecting.id)"
      title="Từ chối hồ sơ"
      consequence="Lý do được gửi cho khách hàng để chụp lại ảnh hoặc sửa thông tin."
      confirm-text="Từ chối hồ sơ"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="rejecting = null"
    >
      <label class="mt-4 block text-sm font-medium text-ink-700" for="cv-reject-reason">Lý do từ chối</label>
      <textarea
        id="cv-reject-reason"
        v-model="rejectReason"
        rows="3"
        maxlength="2000"
        class="mt-1.5 resize-none"
        :class="consoleTextarea"
        placeholder="Ví dụ: ảnh mặt sau bị mờ, họ tên không khớp CCCD"
        data-testid="cv-reject-reason"
      ></textarea>
      <p v-if="rejectError" class="mt-1.5 text-sm text-danger-600" role="alert" data-testid="cv-reject-error">{{ rejectError }}</p>
    </FhConfirmDialog>
  </div>
</template>
