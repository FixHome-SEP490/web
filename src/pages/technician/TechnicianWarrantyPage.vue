<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { FhButton, FhCard, FhEmptyState } from '../../components';
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

onMounted(load);
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-ink-900">Bảo hành</h1>
        <p class="text-xs text-ink-500 mt-1">
          Các yêu cầu bảo hành cho công việc và linh kiện bạn đã thực hiện. Kết luận của bạn được quản lý dịch vụ duyệt trước khi gửi khách hàng.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :disabled="loading" @click="load">
        <RefreshCw :size="14" class="mr-1.5" /> Tải lại
      </FhButton>
    </div>

    <p
      v-if="notice"
      role="status"
      class="p-3 rounded-[var(--radius-sm)] text-xs border"
      :class="notice.type === 'success' ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'"
    >
      {{ notice.text }}
    </p>

    <p v-if="loading" class="text-sm text-ink-500">Đang tải…</p>
    <p v-else-if="loadError" role="alert" class="text-sm text-danger-700">{{ loadError }}</p>
    <FhEmptyState
      v-else-if="claims.length === 0"
      title="Chưa có yêu cầu bảo hành"
      description="Khi khách hàng gửi yêu cầu bảo hành cho công việc của bạn, yêu cầu sẽ hiện ở đây."
    />

    <template v-else>
      <section v-for="group in groups" :key="group.key" class="space-y-3">
        <template v-if="group.items.length">
          <h2 class="text-sm font-semibold text-ink-700">{{ group.title }} ({{ group.items.length }})</h2>

          <FhCard v-for="claim in group.items" :key="claim.id">
            <div class="space-y-3 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <router-link
                  :to="`/tech/jobs/${claim.order.id}`"
                  class="font-mono text-xs font-bold text-brand-700 hover:text-brand-900"
                >
                  {{ claim.order.code }}
                </router-link>
                <span class="font-semibold text-ink-900">{{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }}</span>
                <span
                  class="inline-flex items-center h-[24px] px-2 rounded-[var(--radius-sm)] text-[12px] font-medium"
                  :class="warrantyClaimToneClasses[meta(claim).tone]"
                >
                  {{ meta(claim).label }}
                </span>
              </div>

              <p class="text-xs text-ink-600">
                {{ claim.order.serviceName }} · {{ claim.order.addressSummary }}
              </p>
              <p class="text-xs text-ink-600">
                Khách hàng: {{ claim.order.customerName }}
                <a v-if="claim.order.customerPhone" :href="`tel:${claim.order.customerPhone}`" class="text-brand-700 font-medium ml-1">
                  {{ claim.order.customerPhone }}
                </a>
              </p>

              <p class="text-ink-800 whitespace-pre-line">{{ claim.description }}</p>
              <p v-if="claim.submittedAfterExpiry" class="text-xs text-warning-700">
                Yêu cầu được gửi sau khi hạng mục hết hạn bảo hành, quản lý dịch vụ sẽ quyết định.
              </p>
              <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2">
                <a v-for="url in claim.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
                  <img :src="url" alt="Ảnh khách hàng gửi kèm" class="w-14 h-14 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
                </a>
              </div>

              <p v-if="claim.visit?.scheduledAt" class="text-xs text-ink-600">
                Lịch kiểm tra: {{ formatDateTimeVN(claim.visit.scheduledAt) }}
              </p>
              <p v-if="claim.visit?.checkedInAt" class="text-xs text-ink-600">
                Đã có mặt lúc {{ formatDateTimeVN(claim.visit.checkedInAt) }}
              </p>

              <div
                v-if="claim.status === 'inspected' && claim.visit?.proposedResult"
                class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 text-xs space-y-1"
              >
                <p class="font-semibold text-ink-800">Kết luận bạn đã đề xuất</p>
                <p>{{ inspectionResultLabels[claim.visit.proposedResult as InspectionResult] }}</p>
                <p v-if="claim.visit.notCoveredReasonCode">
                  Lý do: {{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || claim.visit.notCoveredReasonCode }}
                </p>
                <p class="whitespace-pre-line">{{ claim.visit.findings }}</p>
              </div>

              <p v-if="claim.resolutionNotes" class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 text-xs text-ink-800">
                <span class="font-semibold">Phản hồi của quản lý dịch vụ:</span> {{ claim.resolutionNotes }}
              </p>

              <div class="flex flex-wrap gap-2 pt-2 border-t border-ink-100">
                <template v-if="claim.status === 'submitted'">
                  <FhButton variant="primary" size="sm" @click="openModal(claim, 'accept')">Nhận yêu cầu</FhButton>
                  <FhButton variant="ghost" size="sm" @click="openModal(claim, 'decline')">Không nhận được</FhButton>
                </template>
                <template v-else-if="claim.status === 'accepted'">
                  <FhButton
                    v-if="!checkedIn(claim)"
                    variant="primary"
                    size="sm"
                    :loading="busyId === claim.id"
                    :disabled="!!busyId"
                    @click="checkIn(claim)"
                  >
                    Đã đến nơi
                  </FhButton>
                  <FhButton v-else variant="primary" size="sm" @click="openModal(claim, 'propose')">Gửi kết luận kiểm tra</FhButton>
                </template>
                <FhButton v-else-if="claim.status === 'in_progress'" variant="primary" size="sm" @click="openModal(claim, 'complete')">
                  Báo đã bảo hành xong
                </FhButton>
                <p v-else-if="claim.status === 'inspected'" class="text-xs text-ink-500">Đang chờ quản lý dịch vụ duyệt kết luận.</p>
                <p v-else-if="claim.status === 'awaiting_customer'" class="text-xs text-ink-500">Đang chờ khách hàng phản hồi.</p>
              </div>
            </div>
          </FhCard>
        </template>
      </section>
    </template>

    <TechnicianWarrantyActionModal
      :claim="modalClaim"
      :mode="modalMode"
      @close="modalClaim = null; modalMode = null"
      @done="onDone"
    />
  </div>
</template>
