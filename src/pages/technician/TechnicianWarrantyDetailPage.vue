<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Check, ClipboardCheck, CircleCheck, MapPin, MapPinCheck, User, X } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import TechnicianWarrantyActionModal, {
  type WarrantyActionMode,
} from '../../components/technician/TechnicianWarrantyActionModal.vue';
import WarrantyContactActions from '../../components/technician/WarrantyContactActions.vue';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { getHttpStatus } from '../../api/client';
import { getSupportErrorMessage } from '../console/support-cases.utils';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { checkInClaim } from '../../composables/useWarrantyCheckIn';
import { affectedBy } from '../../lib/query-keys';
import { formatDateTimeVN } from '../../utils/formatters';
import { vnDateString } from '../../utils/vn-time';
import {
  technicianClaimDisplayMeta,
  inspectionResultLabels,
  notCoveredReasonLabels,
  warrantyClaimToneClasses,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

const route = useRoute();
const router = useRouter();
const cache = useCacheUpdates();

const claim = ref<StaffWarrantyClaim | null>(null);
const loading = ref(true);
const error = ref('');
const gone = ref(false);
const busy = ref(false);
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const modalMode = ref<WarrantyActionMode | null>(null);

const claimId = computed(() => String(route.params.id));
const meta = computed(() => (claim.value ? technicianClaimDisplayMeta(claim.value) : null));
const checkedIn = computed(() => claim.value?.visit?.status === 'checked_in');
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

async function load() {
  loading.value = true;
  error.value = '';
  gone.value = false;
  try {
    claim.value = await warrantyClaimsApi.get(claimId.value);
  } catch (reason) {
    claim.value = null;
    if (getHttpStatus(reason) === 404) gone.value = true;
    else error.value = getSupportErrorMessage(reason, 'Không thể tải yêu cầu bảo hành. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
}

function onDone(updated: StaffWarrantyClaim) {
  const mode = modalMode.value;
  modalMode.value = null;
  cache.markChanged(affectedBy.warrantyChange);
  if (updated.technician === null) {
    // Handed back to the manager: it no longer belongs to this technician.
    void router.replace({ name: 'tech-warranty' });
    return;
  }
  claim.value = updated;
  notice.value = {
    type: 'success',
    text:
      mode === 'propose'
        ? 'Đã gửi kết luận. Quản lý dịch vụ sẽ duyệt trước khi thông báo cho khách hàng.'
        : 'Đã cập nhật yêu cầu bảo hành.',
  };
}

async function checkIn() {
  if (!claim.value || busy.value) return;
  busy.value = true;
  notice.value = null;
  try {
    const updated = await checkInClaim(claim.value);
    cache.markChanged(affectedBy.warrantyChange);
    claim.value = updated;
    notice.value = { type: 'success', text: 'Đã xác nhận bạn có mặt tại nơi kiểm tra.' };
  } catch (reason) {
    notice.value = {
      type: 'error',
      text: getSupportErrorMessage(reason, 'Chưa xác nhận được kết quả. Vui lòng tải lại trước khi thực hiện lại.'),
    };
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="w-full mx-auto space-y-5">
    <router-link
      :to="{ name: 'tech-warranty' }"
      class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 rounded"
      :class="focusRing"
    >
      <ArrowLeft :size="16" aria-hidden="true" /> Bảo hành
    </router-link>

    <p
      v-if="notice"
      :role="notice.type === 'success' ? 'status' : 'alert'"
      class="p-3.5 rounded-xl text-sm border"
      :class="notice.type === 'success' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-700'"
    >{{ notice.text }}</p>

    <div v-if="loading" class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 space-y-3" aria-busy="true" aria-label="Đang tải yêu cầu bảo hành">
      <FhSkeleton width="35%" height="16px" />
      <FhSkeleton width="65%" height="22px" />
      <FhSkeleton width="85%" height="16px" />
    </div>

    <div v-else-if="gone" class="text-center py-14 px-6 bg-white rounded-2xl border border-ink-200 space-y-3" data-testid="warranty-claim-gone">
      <h2 class="text-base font-semibold text-ink-900">Yêu cầu bảo hành này không còn thuộc về bạn</h2>
      <p class="text-sm text-ink-500">Có thể quản lý dịch vụ đã phân công lại.</p>
      <FhButton variant="secondary" size="sm" @click="router.replace({ name: 'tech-warranty' })">Về danh sách bảo hành</FhButton>
    </div>

    <div v-else-if="error" role="alert" class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="load">Thử lại</FhButton>
    </div>

    <article v-else-if="claim && meta" class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100 text-sm" data-testid="warranty-claim-detail">
      <section class="p-5 sm:p-6 space-y-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <router-link :to="`/tech/jobs/${claim.order.id}`" class="font-num text-ink-500 hover:text-brand-700 whitespace-nowrap rounded" :class="focusRing">#{{ claim.order.code }}</router-link>
            <span class="inline-flex items-center h-6 px-2 rounded-[var(--radius-sm)] text-xs font-medium whitespace-nowrap" :class="warrantyClaimToneClasses[meta.tone]">{{ meta.label }}</span>
            <span v-if="claim.submittedAfterExpiry" class="inline-flex items-center h-6 px-2 rounded-[var(--radius-sm)] bg-warning-50 text-xs font-medium text-warning-800 whitespace-nowrap">Gửi sau hạn</span>
            <span class="text-ink-500 whitespace-nowrap">{{ vnDateString(claim.submittedAt) }}</span>
          </div>
          <h1 class="font-semibold text-xl text-ink-900 text-balance">{{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }}</h1>
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
        <WarrantyContactActions :claim="claim" />
      </section>

      <section class="p-5 sm:p-6 space-y-2">
        <h2 class="font-semibold text-ink-900">Thông tin</h2>
        <dl class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div><dt class="text-ink-500">Dịch vụ</dt><dd class="text-ink-900">{{ claim.order.serviceName }}</dd></div>
          <div v-if="claim.coverage"><dt class="text-ink-500">Bảo hành đến</dt><dd class="font-num text-ink-900">{{ formatDateTimeVN(claim.coverage.expiresAt) }}</dd></div>
          <div v-if="claim.visit?.scheduledAt"><dt class="text-ink-500">Lịch kiểm tra</dt><dd class="font-num text-ink-900">{{ formatDateTimeVN(claim.visit.scheduledAt) }}</dd></div>
          <div v-if="claim.visit?.checkedInAt"><dt class="text-ink-500">Đã có mặt lúc</dt><dd class="font-num text-ink-900">{{ formatDateTimeVN(claim.visit.checkedInAt) }}</dd></div>
        </dl>
        <p v-if="claim.submittedAfterExpiry" class="p-3 rounded-xl bg-warning-50 border border-warning-200 text-warning-800">
          Gửi sau khi hết hạn bảo hành. Quản lý dịch vụ sẽ quyết định.
        </p>
      </section>

      <section class="p-5 sm:p-6 space-y-3">
        <h2 class="font-semibold text-ink-900">Khách mô tả</h2>
        <p class="whitespace-pre-line border-l-2 border-ink-200 pl-3 text-ink-800 text-pretty">{{ claim.description }}</p>
        <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2">
          <a v-for="url in claim.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer" class="rounded-[var(--radius-sm)]" :class="focusRing">
            <img :src="url" alt="Ảnh khách hàng gửi kèm" class="w-16 h-16 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
          </a>
        </div>
      </section>

      <section v-if="claim.visit?.proposedResult" class="p-5 sm:p-6 space-y-1">
        <h2 class="font-semibold text-ink-900">Kết luận bạn đã đề xuất</h2>
        <p class="text-ink-800">{{ inspectionResultLabels[claim.visit.proposedResult as InspectionResult] }}</p>
        <p v-if="claim.visit.notCoveredReasonCode" class="text-ink-800">
          Lý do: {{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || claim.visit.notCoveredReasonCode }}
        </p>
        <p class="text-ink-700 whitespace-pre-line">{{ claim.visit.findings }}</p>
      </section>

      <section v-if="claim.resolutionNotes" class="p-5 sm:p-6 space-y-1">
        <h2 class="font-semibold text-ink-900">Phản hồi của quản lý dịch vụ</h2>
        <p class="text-ink-800">{{ claim.resolutionNotes }}</p>
      </section>

      <!-- Next step: bottom right, the main action last -->
      <section
        v-if="['submitted', 'accepted', 'in_progress', 'inspected', 'awaiting_customer'].includes(claim.status)"
        class="p-5 sm:p-6 flex flex-wrap items-center justify-end gap-2.5"
      >
        <template v-if="claim.status === 'submitted'">
          <FhButton variant="secondary" size="md" @click="modalMode = 'decline'"><X :size="16" aria-hidden="true" /> Không nhận được</FhButton>
          <FhButton variant="primary" size="md" @click="modalMode = 'accept'"><Check :size="16" aria-hidden="true" /> Nhận yêu cầu</FhButton>
        </template>
        <template v-else-if="claim.status === 'accepted'">
          <FhButton v-if="!checkedIn" variant="primary" size="md" :loading="busy" :disabled="busy" @click="checkIn"><MapPinCheck :size="16" aria-hidden="true" /> Đã đến nơi</FhButton>
          <FhButton v-else variant="primary" size="md" @click="modalMode = 'propose'"><ClipboardCheck :size="16" aria-hidden="true" /> Gửi kết luận kiểm tra</FhButton>
        </template>
        <FhButton v-else-if="claim.status === 'in_progress'" variant="primary" size="md" @click="modalMode = 'complete'"><CircleCheck :size="16" aria-hidden="true" /> Báo đã bảo hành xong</FhButton>
        <p v-else-if="claim.status === 'inspected'" class="mr-auto text-ink-500">Chờ quản lý duyệt kết luận</p>
        <p v-else class="mr-auto text-ink-500">Chờ khách phản hồi</p>
      </section>
    </article>

    <TechnicianWarrantyActionModal :claim="claim" :mode="modalMode" @close="modalMode = null" @done="onDone" />
  </div>
</template>
