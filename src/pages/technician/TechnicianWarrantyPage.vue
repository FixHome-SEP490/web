<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { FhButton, FhEmptyState, FhSkeleton } from '../../components';
import TechnicianWarrantyActionModal, {
  type WarrantyActionMode,
} from '../../components/technician/TechnicianWarrantyActionModal.vue';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { getSupportErrorMessage } from '../console/support-cases.utils';
import { formatDateTimeVN } from '../../utils/formatters';
import {
  claimDisplayMeta,
  inspectionResultLabels,
  notCoveredReasonLabels,
  warrantyClaimToneClasses,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

const claims = ref<StaffWarrantyClaim[]>([]);
const loading = ref(true);
const loadError = ref('');
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const busyId = ref('');

const modalClaim = ref<StaffWarrantyClaim | null>(null);
const modalMode = ref<WarrantyActionMode | null>(null);

const groups = computed(() => [
  {
    key: 'todo',
    title: 'Cần xử lý',
    items: claims.value.filter((c) => ['submitted', 'accepted', 'in_progress'].includes(c.status)),
  },
  {
    key: 'waiting',
    title: 'Đang chờ phản hồi',
    items: claims.value.filter((c) => ['inspected', 'awaiting_customer', 'disputed'].includes(c.status)),
  },
  {
    key: 'closed',
    title: 'Đã đóng',
    items: claims.value.filter((c) => ['resolved', 'rejected'].includes(c.status)),
  },
]);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    claims.value = await warrantyClaimsApi.listMine();
  } catch (reason) {
    loadError.value = getSupportErrorMessage(reason, 'Không thể tải danh sách bảo hành. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
}

function replace(updated: StaffWarrantyClaim) {
  const index = claims.value.findIndex((c) => c.id === updated.id);
  if (updated.technician === null && index >= 0) {
    // Handed back to the manager: it no longer belongs to this technician.
    claims.value.splice(index, 1);
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

function currentPosition(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve({}),
      { timeout: 5000 },
    );
  });
}

async function checkIn(claim: StaffWarrantyClaim) {
  if (busyId.value) return;
  busyId.value = claim.id;
  notice.value = null;
  try {
    replace(await warrantyClaimsApi.checkIn(claim.id, await currentPosition()));
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

const meta = (claim: StaffWarrantyClaim) => claimDisplayMeta(claim);
const checkedIn = (claim: StaffWarrantyClaim) => claim.visit?.status === 'checked_in';
const hasNextStep = (claim: StaffWarrantyClaim) =>
  ['submitted', 'accepted', 'in_progress', 'inspected', 'awaiting_customer'].includes(claim.status);
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

onMounted(load);
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Bảo hành</h1>
      <FhButton variant="secondary" size="sm" class="h-10" :disabled="loading" aria-label="Tải lại" @click="load">
        <RefreshCw :size="16" :class="{ 'animate-spin': loading }" />
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
      <template v-for="group in groups" :key="group.key">
        <section v-if="group.items.length" class="space-y-2">
          <h2 class="text-base font-semibold text-ink-900">{{ group.title }} ({{ group.items.length }})</h2>

          <ul class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100">
            <li v-for="claim in group.items" :key="claim.id" class="p-5 sm:p-6 space-y-3 text-sm" :data-testid="`warranty-claim-${claim.id}`">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <router-link
                    :to="`/tech/jobs/${claim.order.id}`"
                    class="font-num text-brand-700 hover:text-brand-800 whitespace-nowrap rounded"
                    :class="focusRing"
                  >
                    #{{ claim.order.code }}
                  </router-link>
                  <span
                    class="inline-flex items-center h-6 px-2 rounded-[var(--radius-sm)] text-xs font-medium whitespace-nowrap"
                    :class="warrantyClaimToneClasses[meta(claim).tone]"
                  >
                    {{ meta(claim).label }}
                  </span>
                </div>
                <p class="text-base font-semibold text-ink-900 text-balance">{{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }}</p>
                <p class="text-ink-600">{{ claim.order.serviceName }}</p>
                <p class="text-ink-900">
                  {{ claim.order.customerName }}
                  <a
                    v-if="claim.order.customerPhone"
                    :href="`tel:${claim.order.customerPhone}`"
                    class="ml-1 font-num font-medium text-brand-700 hover:underline whitespace-nowrap"
                  >{{ claim.order.customerPhone }}</a>
                </p>
                <p class="text-ink-600 text-pretty">{{ claim.order.addressSummary }}</p>
              </div>

              <p class="text-ink-800 whitespace-pre-line text-pretty">{{ claim.description }}</p>
              <p v-if="claim.submittedAfterExpiry" class="p-3 rounded-xl bg-warning-50 border border-warning-200 text-warning-800">
                Gửi sau khi hết hạn bảo hành. Quản lý dịch vụ sẽ quyết định.
              </p>
              <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2">
                <a
                  v-for="url in claim.evidenceRefs"
                  :key="url"
                  :href="url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-[var(--radius-sm)]"
                  :class="focusRing"
                >
                  <img :src="url" alt="Ảnh khách hàng gửi kèm" class="w-14 h-14 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
                </a>
              </div>

              <p v-if="claim.visit?.scheduledAt || claim.visit?.checkedInAt" class="flex flex-wrap gap-x-4 gap-y-1 text-ink-600">
                <span v-if="claim.visit?.scheduledAt" class="whitespace-nowrap">Lịch kiểm tra <strong class="font-semibold text-ink-900 font-num">{{ formatDateTimeVN(claim.visit.scheduledAt) }}</strong></span>
                <span v-if="claim.visit?.checkedInAt" class="whitespace-nowrap">Đã có mặt lúc <strong class="font-semibold text-ink-900 font-num">{{ formatDateTimeVN(claim.visit.checkedInAt) }}</strong></span>
              </p>

              <div
                v-if="claim.status === 'inspected' && claim.visit?.proposedResult"
                class="p-3 rounded-xl bg-ink-50 space-y-1"
              >
                <p class="font-semibold text-ink-900">Kết luận bạn đã đề xuất</p>
                <p class="text-ink-800">{{ inspectionResultLabels[claim.visit.proposedResult as InspectionResult] }}</p>
                <p v-if="claim.visit.notCoveredReasonCode" class="text-ink-800">
                  Lý do: {{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || claim.visit.notCoveredReasonCode }}
                </p>
                <p class="text-ink-700 whitespace-pre-line">{{ claim.visit.findings }}</p>
              </div>

              <p v-if="claim.resolutionNotes" class="p-3 rounded-xl bg-ink-50 text-ink-800">
                <span class="font-semibold">Phản hồi của quản lý dịch vụ:</span> {{ claim.resolutionNotes }}
              </p>

              <!-- Next step: always bottom right, the main action last -->
              <div
                v-if="hasNextStep(claim)"
                class="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-ink-100"
              >
                <template v-if="claim.status === 'submitted'">
                  <FhButton variant="secondary" size="md" @click="openModal(claim, 'decline')">Không nhận được</FhButton>
                  <FhButton variant="primary" size="md" @click="openModal(claim, 'accept')">Nhận yêu cầu</FhButton>
                </template>
                <template v-else-if="claim.status === 'accepted'">
                  <FhButton
                    v-if="!checkedIn(claim)"
                    variant="primary"
                    size="md"
                    :loading="busyId === claim.id"
                    :disabled="!!busyId"
                    @click="checkIn(claim)"
                  >
                    Đã đến nơi
                  </FhButton>
                  <FhButton v-else variant="primary" size="md" @click="openModal(claim, 'propose')">Gửi kết luận kiểm tra</FhButton>
                </template>
                <FhButton v-else-if="claim.status === 'in_progress'" variant="primary" size="md" @click="openModal(claim, 'complete')">
                  Báo đã bảo hành xong
                </FhButton>
                <p v-else-if="claim.status === 'inspected'" class="mr-auto text-ink-500">Đang chờ quản lý dịch vụ duyệt kết luận.</p>
                <p v-else-if="claim.status === 'awaiting_customer'" class="mr-auto text-ink-500">Đang chờ khách hàng phản hồi.</p>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>

    <TechnicianWarrantyActionModal
      :claim="modalClaim"
      :mode="modalMode"
      @close="modalClaim = null; modalMode = null"
      @done="onDone"
    />
  </div>
</template>
