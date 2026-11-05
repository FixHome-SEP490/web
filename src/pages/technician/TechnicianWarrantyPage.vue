<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Check, ChevronRight, ClipboardCheck, CircleCheck, MapPin, MapPinCheck, RefreshCw, User, X } from 'lucide-vue-next';
import { FhButton, FhEmptyState, FhPagination, FhSkeleton } from '../../components';
import TechnicianWarrantyActionModal, {
  type WarrantyActionMode,
} from '../../components/technician/TechnicianWarrantyActionModal.vue';
import WarrantyContactActions from '../../components/technician/WarrantyContactActions.vue';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { getSupportErrorMessage } from '../console/support-cases.utils';
import { checkInClaim } from '../../composables/useWarrantyCheckIn';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { vnDateString } from '../../utils/vn-time';
import {
  technicianClaimDisplayMeta,
  warrantyClaimToneClasses,
} from '../../utils/warranty-claim';

const PAGE_SIZE = 20;
// Server pages of 20; the groups below sort the claims on the current page.
const {
  page,
  items: claims,
  total,
  loading,
  error,
  load,
  refreshing,
  prefetch,
} = usePagedList<StaffWarrantyClaim>({
  key: () => queryKeys.warranty.technicianClaims({}),
  pageSize: PAGE_SIZE,
  fetch: (p, pageSize) => warrantyClaimsApi.listMine({ page: p, pageSize }),
});
const loadError = computed(() =>
  error.value ? getSupportErrorMessage(error.value, 'Không thể tải danh sách bảo hành. Vui lòng thử lại.') : '',
);
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const busyId = ref('');

const modalClaim = ref<StaffWarrantyClaim | null>(null);
const modalMode = ref<WarrantyActionMode | null>(null);

const groups = computed(() => [
  {
    key: 'todo' as const,
    title: 'Cần xử lý',
    items: claims.value.filter((c) => ['submitted', 'accepted', 'in_progress'].includes(c.status)),
  },
  {
    key: 'waiting' as const,
    title: 'Đang chờ phản hồi',
    items: claims.value.filter((c) => ['inspected', 'awaiting_customer', 'disputed'].includes(c.status)),
  },
  {
    key: 'closed' as const,
    title: 'Đã đóng',
    items: claims.value.filter((c) => ['resolved', 'rejected'].includes(c.status)),
  },
]);

// Same pills as the jobs page: everything, or one group. Groups keep their order inside "all".
const activeTab = ref<'all' | 'todo' | 'waiting' | 'closed'>('all');
const tabs = computed(() => [
  { key: 'all' as const, label: 'Tất cả', count: claims.value.length },
  ...groups.value.map((group) => ({ key: group.key, label: group.title, count: group.items.length })),
]);
const rows = computed(() =>
  groups.value.filter((group) => activeTab.value === 'all' || group.key === activeTab.value).flatMap((group) => group.items),
);

const cache = useCacheUpdates();
const router = useRouter();
const openDetail = (claim: StaffWarrantyClaim) => router.push({ name: 'tech-warranty-detail', params: { id: claim.id } });

function replace(updated: StaffWarrantyClaim) {
  cache.markChanged(affectedBy.warrantyChange);
  const index = claims.value.findIndex((c) => c.id === updated.id);
  if (updated.technician === null && index >= 0) {
    // Handed back to the manager: it no longer belongs to this technician.
    claims.value.splice(index, 1);
    total.value = Math.max(0, total.value - 1);
  } else if (index >= 0) {
    claims.value[index] = updated;
  }
}

function openModal(claim: StaffWarrantyClaim, mode: WarrantyActionMode) {
  notice.value = null;
  modalClaim.value = claim;
  modalMode.value = mode;
}

function onDone(updated: StaffWarrantyClaim) {
  const mode = modalMode.value;
  replace(updated);
  modalClaim.value = null;
  modalMode.value = null;
  notice.value = {
    type: 'success',
    text:
      mode === 'decline'
        ? 'Đã trả yêu cầu về cho quản lý dịch vụ để phân công lại.'
        : mode === 'propose'
          ? 'Đã gửi kết luận. Quản lý dịch vụ sẽ duyệt trước khi thông báo cho khách hàng.'
          : 'Đã cập nhật yêu cầu bảo hành.',
  };
}

async function checkIn(claim: StaffWarrantyClaim) {
  if (busyId.value) return;
  busyId.value = claim.id;
  notice.value = null;
  try {
    replace(await checkInClaim(claim));
    notice.value = { type: 'success', text: 'Đã xác nhận bạn có mặt tại nơi kiểm tra.' };
  } catch (reason) {
    notice.value = {
      type: 'error',
      text: getSupportErrorMessage(reason, 'Chưa xác nhận được kết quả. Vui lòng tải lại danh sách trước khi thực hiện lại.'),
    };
  } finally {
    busyId.value = '';
  }
}

const meta = (claim: StaffWarrantyClaim) => technicianClaimDisplayMeta(claim);
const checkedIn = (claim: StaffWarrantyClaim) => claim.visit?.status === 'checked_in';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Bảo hành</h1>
      <FhButton variant="secondary" size="sm" class="h-10" :disabled="loading" aria-label="Tải lại" @click="load">
        <RefreshCw :size="16" :class="{ 'animate-spin': loading || refreshing }" />
        <span class="hidden sm:inline">Tải lại</span>
      </FhButton>
    </div>

    <p
      v-if="notice"
      :role="notice.type === 'success' ? 'status' : 'alert'"
      class="p-3.5 rounded-xl text-sm border"
      :class="notice.type === 'success' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-700'"
    >
      {{ notice.text }}
    </p>

    <div v-if="loading" class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải yêu cầu bảo hành">
      <div v-for="i in 2" :key="i" class="p-5 sm:p-6 space-y-3">
        <FhSkeleton width="40%" height="16px" />
        <FhSkeleton width="70%" height="20px" />
        <FhSkeleton width="90%" height="16px" />
        <div class="flex justify-end"><FhSkeleton width="120px" height="40px" rounded="md" /></div>
      </div>
    </div>

    <div
      v-else-if="loadError"
      role="alert"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3"
    >
      <span>{{ loadError }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="load">Thử lại</FhButton>
    </div>

    <FhEmptyState
      v-else-if="claims.length === 0"
      title="Chưa có yêu cầu bảo hành"
      description="Yêu cầu bảo hành cho việc bạn đã làm sẽ hiện ở đây."
    />

    <template v-else>
      <!-- Filter pills, same look as the jobs page -->
      <div class="bg-ink-100 rounded-full p-1.5 flex items-center gap-1 overflow-x-auto select-none text-sm font-semibold" role="tablist" aria-label="Lọc yêu cầu bảo hành">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          :data-testid="`warranty-tab-${tab.key}`"
          class="h-10 px-4 rounded-full transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
          :class="[focusRing, activeTab === tab.key ? 'bg-white shadow-xs font-bold text-ink-900' : 'font-medium text-ink-600 hover:text-ink-900']"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.key === 'all' || tab.count > 0"
            class="min-w-5 h-5 px-1.5 rounded-full text-xs font-num inline-flex items-center justify-center"
            :class="activeTab === tab.key ? 'bg-ink-100 text-ink-900' : 'bg-white/80 text-ink-600'"
          >{{ tab.count }}</span>
        </button>
      </div>

      <p v-if="!rows.length" class="text-center py-10 px-6 bg-white rounded-2xl border border-ink-200 text-sm text-ink-500">
        Không có yêu cầu bảo hành ở mục này.
      </p>

      <!-- One surface, one row per claim -->
      <ul v-else class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100 overflow-hidden">
        <li
          v-for="claim in rows"
          :key="claim.id"
          class="p-5 sm:p-6 hover:bg-ink-25 transition-colors cursor-pointer text-sm"
          :data-testid="`warranty-claim-${claim.id}`"
          @click="openDetail(claim)"
        >
          <div class="flex gap-3">
            <div class="flex-1 min-w-0 space-y-3">
              <div class="space-y-1.5">
                <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span class="font-num text-ink-500 whitespace-nowrap">#{{ claim.order.code }}</span>
                  <span
                    class="inline-flex items-center h-6 px-2 rounded-[var(--radius-sm)] text-xs font-medium whitespace-nowrap"
                    :class="warrantyClaimToneClasses[meta(claim).tone]"
                  >{{ meta(claim).label }}</span>
                  <span v-if="claim.submittedAfterExpiry" class="inline-flex items-center h-6 px-2 rounded-[var(--radius-sm)] bg-warning-50 text-xs font-medium text-warning-800 whitespace-nowrap">Gửi sau hạn</span>
                  <span class="text-ink-500 whitespace-nowrap">{{ vnDateString(claim.submittedAt) }}</span>
                </div>
                <h3 class="font-semibold text-base sm:text-lg text-ink-900 text-balance">{{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }}</h3>
                <p class="flex items-start gap-1.5 text-ink-900">
                  <User :size="14" class="h-5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <span>
                    {{ claim.order.customerName }}
                    <span v-if="claim.order.customerPhone" class="ml-1 font-num text-ink-500 whitespace-nowrap">{{ claim.order.customerPhone }}</span>
                  </span>
                </p>
                <p class="flex items-start gap-1.5 text-ink-600">
                  <MapPin :size="14" class="h-5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <span class="text-pretty">{{ claim.order.addressSummary }}</span>
                </p>
              </div>
              <!-- What the customer reported, set apart from the address above -->
              <div class="border-l-2 border-ink-200 pl-3">
                <p class="text-xs font-medium text-ink-500">Khách mô tả</p>
                <p class="mt-0.5 line-clamp-2 text-ink-800 text-pretty">{{ claim.description }}</p>
              </div>
            </div>
            <button
              type="button"
              class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:bg-ink-100 hover:text-ink-700 flex items-center justify-center shrink-0 self-center"
              :class="focusRing"
              :aria-label="`Xem chi tiết bảo hành đơn ${claim.order.code}`"
              @click.stop="openDetail(claim)"
            >
              <ChevronRight :size="20" aria-hidden="true" />
            </button>
          </div>

          <!-- One action row: the next step on the left, ways to reach the customer on the right -->
          <div class="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-ink-100 pt-4">
            <div class="flex flex-wrap items-center gap-2">
              <template v-if="claim.status === 'submitted'">
                <FhButton variant="primary" size="sm" class="h-10" @click.stop="openModal(claim, 'accept')"><Check :size="16" aria-hidden="true" /> Nhận yêu cầu</FhButton>
                <FhButton variant="secondary" size="sm" class="h-10" @click.stop="openModal(claim, 'decline')"><X :size="16" aria-hidden="true" /> Không nhận được</FhButton>
              </template>
              <template v-else-if="claim.status === 'accepted'">
                <FhButton
                  v-if="!checkedIn(claim)"
                  variant="primary"
                  size="sm"
                  class="h-10"
                  :loading="busyId === claim.id"
                  :disabled="!!busyId"
                  @click.stop="checkIn(claim)"
                ><MapPinCheck :size="16" aria-hidden="true" /> Đã đến nơi</FhButton>
                <FhButton v-else variant="primary" size="sm" class="h-10" @click.stop="openModal(claim, 'propose')"><ClipboardCheck :size="16" aria-hidden="true" /> Gửi kết luận kiểm tra</FhButton>
              </template>
              <FhButton v-else-if="claim.status === 'in_progress'" variant="primary" size="sm" class="h-10" @click.stop="openModal(claim, 'complete')">
                <CircleCheck :size="16" aria-hidden="true" /> Báo đã bảo hành xong
              </FhButton>
              <p v-else-if="claim.status === 'inspected'" class="text-ink-500">Chờ quản lý duyệt kết luận</p>
              <p v-else-if="claim.status === 'awaiting_customer'" class="text-ink-500">Chờ khách phản hồi</p>
            </div>
            <WarrantyContactActions :claim="claim" class="ml-auto" />
          </div>
        </li>
      </ul>
      <FhPagination v-model:page="page" :page-size="PAGE_SIZE" :total="total" :disabled="loading" @prefetch="prefetch" />
    </template>

    <TechnicianWarrantyActionModal
      :claim="modalClaim"
      :mode="modalMode"
      @close="modalClaim = null; modalMode = null"
      @done="onDone"
    />
  </div>
</template>
