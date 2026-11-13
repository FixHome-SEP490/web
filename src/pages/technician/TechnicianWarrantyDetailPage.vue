<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, CalendarClock, Check, ClipboardCheck, CircleCheck, MapPin, MapPinCheck, PackageCheck, User, X } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import TechnicianWarrantyActionModal, {
  type WarrantyActionMode,
} from '../../components/technician/TechnicianWarrantyActionModal.vue';
import WarrantyContactActions from '../../components/technician/WarrantyContactActions.vue';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { partRequestsApi } from '../../api/part-requests.api';
import { getHttpStatus } from '../../api/client';
import { getSupportErrorMessage } from '../console/support-cases.utils';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { checkInClaim } from '../../composables/useWarrantyCheckIn';
import { affectedBy } from '../../lib/query-keys';
import { formatDateTimeVN } from '../../utils/formatters';
import { vnDateString } from '../../utils/vn-time';
import {
  technicianClaimDisplayMeta,
  faultyInspectionLabels,
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
// The replacement is in hand; the faulty part is due back at the warehouse.
const part = computed(() => {
  const request = claim.value?.partRequest;
  return request && ['received', 'completed'].includes(String(request.status).toLowerCase()) ? request : null;
});
const partOverdue = computed(() => !!part.value && !part.value.faultyReturnedAt && !!part.value.faultyReturnDueAt && new Date(part.value.faultyReturnDueAt).getTime() < Date.now());

async function returnFaultyPart() {
  if (!part.value || busy.value) return;
  busy.value = true;
  notice.value = null;
  try {
    await partRequestsApi.returnFaultyPart(part.value.id);
    notice.value = { type: 'success', text: 'Đã ghi nhận bạn nộp linh kiện hỏng về kho.' };
    claim.value = await warrantyClaimsApi.get(claimId.value);
  } catch (reason) {
    notice.value = { type: 'error', text: getSupportErrorMessage(reason, 'Không ghi nhận được. Vui lòng thử lại.') };
  } finally {
    busy.value = false;
  }
}
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
      class="animate-slide-up inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors duration-150 rounded"
      :class="focusRing"
    >
      <ArrowLeft :size="16" aria-hidden="true" /> Bảo hành
    </router-link>

    <Transition name="fh-fade-slide">
      <p
        v-if="notice"
        :role="notice.type === 'success' ? 'status' : 'alert'"
        class="p-3.5 rounded-xl text-sm border"
        :class="notice.type === 'success' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-700'"
      >{{ notice.text }}</p>
    </Transition>

    <div v-if="loading" class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 space-y-3" aria-busy="true" aria-label="Đang tải yêu cầu bảo hành">
      <FhSkeleton width="35%" height="16px" />
      <FhSkeleton width="65%" height="22px" />
      <FhSkeleton width="85%" height="16px" />
    </div>

    <div v-else-if="gone" class="animate-slide-up text-center py-14 px-6 bg-white rounded-2xl border border-ink-200 space-y-3" data-testid="warranty-claim-gone">
      <h2 class="text-base font-semibold text-ink-900">Yêu cầu bảo hành này không còn thuộc về bạn</h2>
      <p class="text-sm text-ink-500">Có thể quản lý dịch vụ đã phân công lại.</p>
      <FhButton variant="secondary" size="sm" @click="router.replace({ name: 'tech-warranty' })">Về danh sách bảo hành</FhButton>
    </div>

    <div v-else-if="error" role="alert" class="animate-slide-up p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="load">Thử lại</FhButton>
    </div>

    <article v-else-if="claim && meta" class="animate-slide-up-delay-1 space-y-5 text-sm" data-testid="warranty-claim-detail">
      <!-- Compact Header Summary Card -->
      <header class="bg-white rounded-2xl border border-ink-200/90 p-5 sm:p-6 shadow-2xs space-y-3">
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <router-link :to="`/tech/jobs/${claim.order.id}`" class="font-num font-semibold text-ink-600 hover:text-brand-700 whitespace-nowrap rounded" :class="focusRing">#{{ claim.order.code }}</router-link>
          <span class="inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap" :class="warrantyClaimToneClasses[meta.tone]">{{ meta.label }}</span>
          <span v-if="claim.submittedAfterExpiry" class="inline-flex items-center h-6 px-2.5 rounded-full bg-ink-100 text-xs font-medium text-ink-700 whitespace-nowrap">Gửi sau hạn bảo hành</span>
          <span class="text-xs text-ink-500 whitespace-nowrap ml-auto">{{ vnDateString(claim.submittedAt) }}</span>
        </div>

        <div class="space-y-1.5">
          <h1 class="font-bold text-xl sm:text-2xl text-ink-900 tracking-tight text-balance">{{ claim.order.serviceName || 'Bảo hành dịch vụ' }}</h1>
          <div class="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-sm text-ink-700">
            <p class="flex items-center gap-1.5 font-medium text-ink-900">
              <User :size="15" class="shrink-0 text-ink-400" aria-hidden="true" />
              <span>{{ claim.order.customerName }}</span>
              <span v-if="claim.order.customerPhone" class="font-num text-ink-500 font-normal whitespace-nowrap">· {{ claim.order.customerPhone }}</span>
            </p>
            <p class="flex items-start gap-1.5 text-ink-600 min-w-0">
              <MapPin :size="15" class="shrink-0 text-ink-400 mt-0.5" aria-hidden="true" />
              <span class="text-pretty">{{ claim.order.addressSummary }}</span>
            </p>
          </div>
        </div>
      </header>

      <!-- 2-Column Workspace -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <!-- Left Main Details -->
        <div class="lg:col-span-2 space-y-5">
          <!-- Customer description & media -->
          <section class="bg-white rounded-2xl border border-ink-200/90 p-5 sm:p-6 shadow-2xs space-y-3.5">
            <h2 class="text-base font-semibold text-ink-900">Khách mô tả sự cố</h2>
            <p class="whitespace-pre-line rounded-xl bg-ink-50/80 border border-ink-200/70 p-4 text-ink-800 leading-relaxed text-pretty">{{ claim.description }}</p>
            <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2.5 pt-1">
              <a v-for="url in claim.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer" class="group rounded-xl overflow-hidden border border-ink-200" :class="focusRing">
                <img :src="url" alt="Ảnh khách hàng gửi kèm" class="w-20 h-20 object-cover transition-transform duration-150 group-hover:scale-105 group-active:scale-95" />
              </a>
            </div>
          </section>

          <!-- Warranty info -->
          <section class="bg-white rounded-2xl border border-ink-200/90 p-5 sm:p-6 shadow-2xs space-y-3">
            <h2 class="text-base font-semibold text-ink-900">Thông tin bảo hành</h2>
            <dl class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-0.5">
                <dt class="text-xs text-ink-500">Dịch vụ</dt>
                <dd class="font-medium text-ink-900">{{ claim.order.serviceName }}</dd>
              </div>
              <div v-if="claim.coverage" class="space-y-0.5">
                <dt class="text-xs text-ink-500">Bảo hành đến</dt>
                <dd class="font-num font-medium text-ink-900">{{ formatDateTimeVN(claim.coverage.expiresAt) }}</dd>
              </div>
              <div v-if="claim.visit?.scheduledAt" class="space-y-0.5">
                <dt class="text-xs text-ink-500">Lịch kiểm tra</dt>
                <dd class="font-num font-semibold text-brand-700">{{ formatDateTimeVN(claim.visit.scheduledAt) }}</dd>
              </div>
              <div v-if="claim.visit?.checkedInAt" class="space-y-0.5">
                <dt class="text-xs text-ink-500">Đã có mặt lúc</dt>
                <dd class="font-num font-medium text-ink-900">{{ formatDateTimeVN(claim.visit.checkedInAt) }}</dd>
              </div>
            </dl>
            <p v-if="claim.submittedAfterExpiry" class="rounded-xl bg-ink-50 border border-ink-200/80 px-3.5 py-2.5 text-xs text-ink-700">
              Gửi sau khi hết hạn bảo hành. Quản lý dịch vụ sẽ quyết định.
            </p>
          </section>

          <!-- Findings & Manager feedback -->
          <section v-if="claim.visit?.proposedResult || claim.resolutionNotes" class="bg-white rounded-2xl border border-ink-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div v-if="claim.visit?.proposedResult" class="space-y-1.5">
              <h2 class="text-base font-semibold text-ink-900">Kết luận bạn đã đề xuất</h2>
              <p class="font-medium text-ink-900">{{ inspectionResultLabels[claim.visit.proposedResult as InspectionResult] }}</p>
              <p v-if="claim.autoApproved" class="text-xs text-ink-500">Hệ thống đã duyệt tự động: bạn sửa lại miễn phí cho khách.</p>
              <p v-if="claim.visit.notCoveredReasonCode" class="text-ink-700">
                Lý do: <span class="font-medium text-ink-900">{{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || claim.visit.notCoveredReasonCode }}</span>
              </p>
              <p v-if="claim.visit.findings" class="text-ink-700 whitespace-pre-line pt-1">{{ claim.visit.findings }}</p>
            </div>

            <div v-if="claim.resolutionNotes" class="space-y-1" :class="{ 'pt-4 border-t border-ink-100': claim.visit?.proposedResult }">
              <h2 class="text-base font-semibold text-ink-900">Phản hồi của quản lý dịch vụ</h2>
              <p class="text-ink-700 leading-relaxed">{{ claim.resolutionNotes }}</p>
            </div>
          </section>
        </div>

        <!-- Right Sticky Action & Contact Column -->
        <aside class="lg:col-span-1 space-y-5 lg:sticky lg:top-20">
          <!-- Primary Workflow Action + Contact -->
          <section class="bg-white rounded-2xl border border-ink-200/90 p-5 shadow-xs space-y-4">
            <div
              v-if="['submitted', 'accepted', 'in_progress', 'inspected', 'awaiting_customer'].includes(claim.status)"
              class="space-y-2.5"
            >
              <h2 class="text-xs font-semibold uppercase tracking-wider text-ink-400">Thao tác tiếp theo</h2>
              <div v-if="claim.status === 'submitted'" class="flex flex-col gap-2">
                <FhButton variant="primary" size="md" block @click="modalMode = 'accept'"><Check :size="16" aria-hidden="true" /> Nhận yêu cầu</FhButton>
                <FhButton variant="secondary" size="md" block @click="modalMode = 'decline'"><X :size="16" aria-hidden="true" /> Không nhận được</FhButton>
              </div>
              <div v-else-if="claim.status === 'accepted'" class="flex flex-col gap-2">
                <FhButton v-if="!checkedIn" variant="primary" size="md" block :loading="busy" :disabled="busy" @click="checkIn"><MapPinCheck :size="16" aria-hidden="true" /> Đã đến nơi</FhButton>
                <FhButton v-if="!checkedIn" variant="secondary" size="md" block :disabled="busy" @click="modalMode = 'reschedule'"><CalendarClock :size="16" aria-hidden="true" /> Đổi lịch kiểm tra</FhButton>
                <FhButton v-else variant="primary" size="md" block @click="modalMode = 'propose'"><ClipboardCheck :size="16" aria-hidden="true" /> Gửi kết luận kiểm tra</FhButton>
              </div>
              <FhButton v-else-if="claim.status === 'in_progress'" variant="primary" size="md" block @click="modalMode = 'complete'"><CircleCheck :size="16" aria-hidden="true" /> Báo đã bảo hành xong</FhButton>
              <p v-else-if="claim.status === 'inspected'" class="rounded-xl bg-ink-50 px-3.5 py-2.5 text-ink-600">Chờ quản lý duyệt kết luận</p>
              <p v-else class="rounded-xl bg-ink-50 px-3.5 py-2.5 text-ink-600">Chờ khách phản hồi</p>
            </div>

            <div class="pt-3 border-t border-ink-100 space-y-2">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-ink-400">Liên hệ khách hàng</h2>
              <WarrantyContactActions :claim="claim" />
            </div>
          </section>

          <!-- Faulty Part Return Card -->
          <section
            v-if="part"
            class="rounded-2xl border p-5 shadow-2xs space-y-3"
            :class="partOverdue && !part.faultyReturnedAt ? 'bg-danger-50/40 border-danger-200' : 'bg-white border-ink-200/90'"
            data-testid="faulty-part-return"
          >
            <h2 class="text-base font-semibold text-ink-900">Nộp linh kiện hỏng về kho</h2>
            <p v-if="part.faultyReturnedAt" class="text-ink-700 leading-relaxed">
              Đã nộp lúc <span class="font-num font-medium text-ink-900">{{ formatDateTimeVN(part.faultyReturnedAt) }}</span>.
              <template v-if="part.faultyInspectionResult">Quản lý dịch vụ đã kiểm tra: {{ faultyInspectionLabels[part.faultyInspectionResult] }}.</template>
              <template v-else>Chờ quản lý dịch vụ kiểm tra.</template>
            </p>
            <template v-else>
              <p :class="partOverdue ? 'text-danger-700 font-medium' : 'text-ink-700'" class="leading-relaxed">
                <template v-if="part.faultyReturnChargedAt">Quá hạn nộp nên giá linh kiện thay thế đã bị trừ vào ví. Nộp về kho và được kiểm tra không do lắp đặt sẽ được hoàn lại.</template>
                <template v-else-if="partOverdue">Đã quá hạn nộp. Giá linh kiện thay thế sẽ bị trừ vào ví.</template>
                <template v-else>Hạn nộp: <span class="font-num font-semibold text-ink-900">{{ part.faultyReturnDueAt ? formatDateTimeVN(part.faultyReturnDueAt) : '' }}</span>. Quá hạn, giá linh kiện thay thế sẽ bị trừ vào ví.</template>
              </p>
              <FhButton variant="secondary" size="md" block :loading="busy" :disabled="busy" @click="returnFaultyPart">
                <PackageCheck :size="16" aria-hidden="true" /> Đã nộp linh kiện hỏng
              </FhButton>
            </template>
          </section>
        </aside>
      </div>
    </article>

    <TechnicianWarrantyActionModal :claim="claim" :mode="modalMode" @close="modalMode = null" @done="onDone" />
  </div>
</template>
