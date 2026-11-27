<script setup lang="ts">
// Technician check-in faces that did not match the registered face (PO 20/11/2026): the manager compares the
// two photos, then approves, or rejects with a reason so the technician retakes the photo.
import { computed, ref } from 'vue';
import { FhButton, FhConfirmDialog, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import CheckinFaceReviewDrawer from '../../components/console/CheckinFaceReviewDrawer.vue';
import { checkinFaceStatusPill } from '../../components/console/checkin-face-labels';
import { consoleField, consoleTextarea } from '../../components/console/console-ui';
import { checkinFaceReviewsApi, type CheckinFaceReview, type CheckinFaceReviewDetail, type CheckinFaceReviewStatus } from '../../api/checkin-face-reviews.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';

const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'orderCode', label: 'Mã đơn' },
  { key: 'similarity', label: 'Độ khớp' },
  { key: 'createdAt', label: 'Gửi lúc', hideBelow: 'lg' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

const PAGE_SIZE = 20;
const statusFilter = ref<CheckinFaceReviewStatus>('pending');
const cache = useCacheUpdates();

const { page, items, total, loading, error: loadError, load, changingPage, prefetch } = usePagedList<CheckinFaceReview>({
  key: () => queryKeys.checkinFaceReviews.list({ status: statusFilter.value }),
  pageSize: PAGE_SIZE,
  fetch: (p, size) => checkinFaceReviewsApi.list(statusFilter.value, p, size),
});

const openId = ref<string | null>(null);
const busy = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const showReject = ref(false);
const toReject = ref<CheckinFaceReviewDetail | null>(null);
const rejectNote = ref('');
const rejectError = ref('');

const rows = computed(() => items.value.map((r) => ({ ...r, pill: checkinFaceStatusPill(r.status) })));

async function decide(review: CheckinFaceReviewDetail, body: { approve: boolean; note?: string }) {
  busy.value = true;
  message.value = null;
  try {
    await checkinFaceReviewsApi.review(review.id, body);
    openId.value = null;
    showReject.value = false;
    message.value = { type: 'success', text: body.approve ? 'Đã xác nhận khuôn mặt. Kỹ thuật viên có thể tiếp tục.' : 'Đã từ chối. Kỹ thuật viên sẽ chụp lại ảnh khuôn mặt.' };
    await cache.refresh([queryKeys.checkinFaceReviews.all, queryKeys.orders.all]);
  } catch (reason) {
    message.value = { type: 'error', text: userFacingError(reason, 'Chưa xử lý được yêu cầu. Vui lòng thử lại.') };
    showReject.value = false;
  } finally {
    busy.value = false;
  }
}

function askReject(review: CheckinFaceReviewDetail) {
  toReject.value = review;
  rejectNote.value = '';
  rejectError.value = '';
  showReject.value = true;
}

async function confirmReject() {
  const note = rejectNote.value.trim();
  if (note.length < 5) {
    rejectError.value = 'Nhập lý do từ chối (ít nhất 5 ký tự).';
    return;
  }
  if (toReject.value) await decide(toReject.value, { approve: false, note });
}
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader
      class="animate-slide-up"
      title="Xác nhận khuôn mặt check-in"
      artwork-src="/images/ui/console-face-checkin.png"
      :count="loading || loadError ? null : total"
    />

    <div class="animate-slide-up-delay-1 flex flex-wrap items-center gap-2.5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-3 shadow-(--shadow-e1)">
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái yêu cầu" data-testid="cf-status-filter">
        <option value="pending">Chờ xác nhận</option>
        <option value="approved">Đã xác nhận</option>
        <option value="rejected">Đã từ chối</option>
      </select>
    </div>

    <Transition name="fh-fade-slide">
      <p v-if="message" class="rounded-[var(--radius-sm)] border px-4 py-3 text-sm" :class="message.type === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'" :role="message.type === 'error' ? 'alert' : 'status'">{{ message.text }}</p>
    </Transition>

    <div class="animate-slide-up-delay-1 space-y-5">
      <ConsoleLoadError v-if="loadError" @retry="load" />
      <ConsoleTable
        v-else
        :columns="columns"
        :rows="rows"
        :loading="loading"
        class="transition-opacity"
        :class="{ 'opacity-60': changingPage }"
        empty-text="Chưa có khuôn mặt nào cần xác nhận."
      >
        <template #cell-technician="{ row }">
          <span class="whitespace-nowrap font-medium text-ink-900">{{ row.technicianName }}</span>
        </template>
        <template #cell-orderCode="{ row }">
          <span class="whitespace-nowrap font-num text-ink-900">{{ row.orderCode }}</span>
        </template>
        <template #cell-similarity="{ row }">
          <span class="whitespace-nowrap font-num" :class="row.similarity !== null && row.similarity < 60 ? 'font-medium text-danger-700' : 'text-ink-900'">{{ row.similarity === null ? '—' : `${row.similarity}%` }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-700">{{ vnDateTimeString(row.createdAt) }}</span>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.pill.status" :label="row.pill.label" />
        </template>
        <template #cell-actions="{ row }">
          <FhButton variant="secondary" size="sm" :data-testid="`cf-open-${row.id}`" @click="openId = row.id">Xem và xử lý</FhButton>
        </template>
      </ConsoleTable>
      <ConsolePagination v-if="!loadError" v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" @prefetch="prefetch" />
    </div>

    <CheckinFaceReviewDrawer
      :review-id="openId"
      :busy="busy"
      @close="openId = null"
      @approve="(review) => decide(review, { approve: true })"
      @reject="askReject"
    />

    <FhConfirmDialog
      :open="showReject"
      :loading="busy"
      title="Từ chối ảnh check-in"
      consequence="Kỹ thuật viên sẽ nhận lý do và phải chụp lại ảnh khuôn mặt check-in."
      confirm-text="Từ chối ảnh check-in"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="showReject = false"
    >
      <label class="mt-4 block text-sm font-medium text-ink-700" for="cf-reject-note">Lý do từ chối</label>
      <textarea id="cf-reject-note" v-model="rejectNote" rows="3" :class="consoleTextarea" placeholder="Ví dụ: Khuôn mặt không giống ảnh đã đăng ký" />
      <Transition name="fh-fade-slide">
        <p v-if="rejectError" class="mt-1.5 text-sm text-danger-600" role="alert">{{ rejectError }}</p>
      </Transition>
    </FhConfirmDialog>
  </div>
</template>
