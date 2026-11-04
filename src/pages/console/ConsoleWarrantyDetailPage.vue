<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { CheckCircle2 } from 'lucide-vue-next';
import { FhButton, FhCard, FhMoney, FhSkeleton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import WarrantyDecisionModal, { type WarrantyDecisionMode } from '../../components/console/WarrantyDecisionModal.vue';
import { ordersApi, type OrderEvidenceRecord } from '../../api/orders.api';
import { warrantyManagerApi, type WarrantyClaimDetail } from '../../api/warranty-claims.api';
import { useAuthStore } from '../../stores/auth';
import {
  claimDisplayMeta,
  managerClaimDisplayMeta,
  claimOutcomeLabels,
  coverageStatusLabels,
  declineReasonLabels,
  declineReviewLabels,
  faultyInspectionLabels,
  inspectionResultLabels,
  invoiceLineTypeLabels,
  notCoveredReasonLabels,
  paymentStatusLabels,
  visitStatusLabels,
  warrantyClaimToneClasses,
  type DeclineReason,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';
import { formatSupportDate, getSupportErrorMessage, isSafeEvidenceLink } from './support-cases.utils';

const route = useRoute();
const authStore = useAuthStore();
const canDecide = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const claimId = computed(() => String(route.params.id));
const claim = ref<WarrantyClaimDetail | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const orderPhotos = ref<OrderEvidenceRecord[]>([]);
const technicians = ref<{ id: string; fullName: string }[]>([]);
const modalMode = ref<WarrantyDecisionMode | null>(null);

const meta = computed(() => (claim.value ? managerClaimDisplayMeta(claim.value) : null));
const closed = computed(() => !!claim.value && ['resolved', 'rejected'].includes(claim.value.status));
const detail = computed(() => claim.value?.detail ?? null);

/** The one thing a manager is most likely to do next with this claim. */
const primary = computed<{ mode: WarrantyDecisionMode; label: string } | null>(() => {
  const current = claim.value;
  if (!current || !canDecide.value || closed.value) return null;
  if (current.declineReview === 'pending') return { mode: 'review', label: current.noShowFlaggedAt ? 'Xét không đến' : 'Xét từ chối' };
  if (current.status === 'inspected') return { mode: 'approve', label: 'Duyệt kết luận' };
  if (['submitted', 'accepted'].includes(current.status)) return { mode: 'assign', label: current.technician ? 'Phân công lại' : 'Phân công kỹ thuật viên' };
  if (['in_progress', 'awaiting_customer', 'disputed'].includes(current.status)) return { mode: 'close', label: 'Đóng yêu cầu' };
  return null;
});
const canAssignToo = computed(() => canDecide.value && claim.value?.status === 'inspected');
const canReject = computed(() => canDecide.value && ['submitted', 'accepted', 'inspected'].includes(claim.value?.status ?? ''));

const reasonLabel = (code: string | null | undefined) =>
  code ? notCoveredReasonLabels[code as NotCoveredReason] ?? declineReasonLabels[code as DeclineReason] ?? code : '';
const resultLabel = (result: string | null | undefined) => (result ? inspectionResultLabels[result as InspectionResult] ?? result : '—');
const date = (value: string | null | undefined) => formatSupportDate(value);
const partSourceLabel = (source: string | null) => (source === 'fixhome' ? 'FixHome' : source === 'technician' ? 'Thợ tự mua' : '');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    claim.value = await warrantyManagerApi.getDetail(claimId.value);
    void loadPhotos(claim.value.order.id);
  } catch (reason) {
    claim.value = null;
    error.value = getSupportErrorMessage(reason, 'Không thể tải yêu cầu bảo hành. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
}

async function loadPhotos(orderId: string) {
  try {
    const rows = await ordersApi.getEvidence(orderId);
    if (claim.value?.order.id === orderId) orderPhotos.value = rows.filter((row) => row.type === 'before' || row.type === 'after');
  } catch {
    // The page is complete without the photos of the original job.
  }
}

async function openModal(mode: WarrantyDecisionMode) {
  notice.value = '';
  if (mode === 'assign' && !technicians.value.length) {
    try {
      technicians.value = await warrantyManagerApi.eligibleTechnicians();
    } catch (reason) {
      error.value = getSupportErrorMessage(reason, 'Chưa tải được danh sách kỹ thuật viên, vui lòng thử lại.');
      return;
    }
  }
  modalMode.value = mode;
}

async function onDone() {
  modalMode.value = null;
  notice.value = 'Đã ghi nhận quyết định của bạn.';
  await load();
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 pb-12">
    <div v-if="loading && !claim" class="space-y-4" aria-busy="true">
      <FhSkeleton height="14px" width="140px" />
      <FhSkeleton height="28px" width="320px" />
      <FhSkeleton height="96px" :count="3" rounded="md" />
    </div>

    <template v-else-if="error && !claim">
      <ConsolePageHeader title="Chi tiết bảo hành" back-to="/console/warranty" back-label="Yêu cầu bảo hành" />
      <ConsoleLoadError :message="error" @retry="load" />
    </template>

    <template v-else-if="claim && detail && meta">
      <ConsolePageHeader :title="claim.coverage?.itemDescription || 'Bảo hành dịch vụ'" back-to="/console/warranty" back-label="Yêu cầu bảo hành">
        <template #badges>
          <span class="inline-flex h-[24px] items-center whitespace-nowrap rounded-[var(--radius-sm)] px-2 text-[12px] font-medium" :class="warrantyClaimToneClasses[meta.tone]">{{ meta.label }}</span>
          <span v-if="claim.submittedAfterExpiry" class="whitespace-nowrap rounded bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">Gửi sau khi hết hạn</span>
        </template>
        <template #meta>
          <p class="mt-2 text-sm text-ink-600">
            <router-link :to="`/console/orders/${claim.order.id}`" class="font-num text-brand-700 hover:underline">#{{ claim.order.code }}</router-link>
            · {{ claim.order.serviceName }} · {{ claim.order.customerName }} · Gửi lúc <span class="font-num">{{ date(claim.submittedAt) }}</span>
          </p>
        </template>
        <template #actions>
          <FhButton v-if="primary" size="sm" @click="openModal(primary.mode)">{{ primary.label }}</FhButton>
          <ConsoleMoreMenu v-if="canAssignToo || canReject || detail.decision.escalatedSupportCaseId" label="Thao tác khác với yêu cầu">
            <ConsoleMenuItem v-if="canAssignToo" @click="openModal('assign')">Phân công lại</ConsoleMenuItem>
            <ConsoleMenuItem v-if="detail.decision.escalatedSupportCaseId" @click="$router.push(`/console/support/${detail.decision.escalatedSupportCaseId}`)">Xem hồ sơ phản đối</ConsoleMenuItem>
            <ConsoleMenuItem v-if="canReject" danger @click="openModal('reject')">Từ chối</ConsoleMenuItem>
          </ConsoleMoreMenu>
        </template>
      </ConsolePageHeader>

      <p v-if="!canDecide" class="text-sm text-ink-600" role="status">Chỉ xem. Quản lý dịch vụ thực hiện các quyết định.</p>
      <div v-if="notice" class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
        <CheckCircle2 :size="16" aria-hidden="true" /> {{ notice }}
      </div>
      <div v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</div>
      <div v-if="!claim.detailLoaded" class="rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800" role="status" data-testid="warranty-detail-missing">
        Máy chủ chưa gửi đủ thông tin chi tiết (đơn gốc, lượt kiểm tra, quyết định). Đang hiện phần có sẵn; cập nhật Backend để xem đầy đủ.
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <FhCard title="Yêu cầu của khách">
          <p class="whitespace-pre-line text-sm text-ink-800 text-pretty">{{ claim.description }}</p>
          <div v-if="claim.evidenceRefs?.length" class="mt-3 flex flex-wrap gap-2">
            <a v-for="url in claim.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
              <img :src="url" alt="Ảnh khách hàng gửi kèm" class="h-16 w-16 rounded-[var(--radius-sm)] border border-ink-200 object-cover" />
            </a>
          </div>
          <dl class="mt-4 space-y-2.5 border-t border-ink-100 pt-4 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Khách hàng</dt><dd class="text-right text-ink-900">{{ claim.order.customerName }} <a v-if="claim.order.customerPhone" :href="`tel:${claim.order.customerPhone}`" class="ml-1 whitespace-nowrap font-num text-brand-700 hover:underline">{{ claim.order.customerPhone }}</a></dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Địa chỉ</dt><dd class="text-right text-ink-900">{{ claim.order.addressSummary }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Kỹ thuật viên phụ trách</dt><dd class="text-right text-ink-900">{{ claim.technician?.fullName || '—' }}</dd></div>
          </dl>
        </FhCard>

        <FhCard title="Bảo hành">
          <dl v-if="detail.coverage" class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Hạng mục</dt><dd class="text-right text-ink-900">{{ claim.coverage?.itemDescription }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Thời hạn</dt><dd class="font-num text-ink-900">{{ detail.coverage.warrantyDays }} ngày</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Bắt đầu</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ date(detail.coverage.startsAt) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Hết hạn</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ date(detail.coverage.expiresAt) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Trạng thái</dt><dd class="text-ink-900">{{ coverageStatusLabels[detail.coverage.status] ?? detail.coverage.status }}</dd></div>
          </dl>
          <dl v-else-if="claim.coverage" class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Hạng mục</dt><dd class="text-right text-ink-900">{{ claim.coverage.itemDescription }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Hết hạn</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ date(claim.coverage.expiresAt) }}</dd></div>
          </dl>
          <p v-else class="text-sm text-ink-500">Không tìm thấy hạng mục bảo hành.</p>
          <p v-if="claim.submittedAfterExpiry" class="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">Yêu cầu được gửi sau khi hạng mục hết hạn bảo hành. Bạn quyết định có nhận hay không.</p>
          <div v-if="detail.otherClaims.length" class="mt-4 border-t border-ink-100 pt-4">
            <div class="mb-2 text-sm text-ink-500">Yêu cầu khác của đơn này</div>
            <ul class="space-y-1.5 text-sm">
              <li v-for="other in detail.otherClaims" :key="other.id" class="flex flex-wrap items-center justify-between gap-2">
                <router-link :to="`/console/warranty/${other.id}`" class="text-brand-700 hover:underline">{{ other.itemDescription }}</router-link>
                <span class="text-ink-500">{{ claimDisplayMeta(other).label }} · <span class="font-num">{{ date(other.submittedAt) }}</span></span>
              </li>
            </ul>
          </div>
        </FhCard>
      </div>

      <FhCard v-if="claim.detailLoaded || orderPhotos.length" title="Đơn gốc">
        <dl v-if="claim.detailLoaded" class="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Hoàn tất lúc</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ date(detail.originalJob.completedAt) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Thanh toán</dt><dd class="text-ink-900">{{ paymentStatusLabels[detail.originalJob.paymentStatus] ?? detail.originalJob.paymentStatus }}</dd></div>
          <div class="flex justify-between gap-3 sm:col-span-2">
            <dt class="text-ink-500">Thợ đã làm</dt>
            <dd class="text-right text-ink-900">
              <span v-for="(tech, index) in detail.originalJob.technicians" :key="tech.id + index" class="block">
                {{ tech.fullName || '—' }}<span v-if="tech.isActive" class="ml-1 text-xs text-ink-500">(phụ trách khi hoàn tất)</span>
              </span>
              <span v-if="!detail.originalJob.technicians.length">—</span>
            </dd>
          </div>
        </dl>
        <div v-if="claim.detailLoaded" class="mt-4 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-ink-500">
              <tr><th class="py-2 pr-3 font-medium">Hạng mục</th><th class="py-2 pr-3 font-medium">Nguồn</th><th class="py-2 pr-3 text-right font-medium">SL</th><th class="py-2 pr-3 text-right font-medium">Thành tiền</th><th class="py-2 text-right font-medium">Bảo hành</th></tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr v-for="line in detail.originalJob.lines" :key="line.id" :class="line.covered ? 'bg-brand-50' : ''" :data-testid="`warranty-line-${line.id}`">
                <td class="py-2 pr-3 text-ink-900">
                  {{ line.description }}
                  <span v-if="line.covered" class="ml-1 whitespace-nowrap rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-700">Đang yêu cầu</span>
                  <span class="block text-xs text-ink-500">{{ invoiceLineTypeLabels[line.type] ?? line.type }}</span>
                </td>
                <td class="py-2 pr-3 text-ink-700">{{ partSourceLabel(line.partSource) || '—' }}</td>
                <td class="py-2 pr-3 text-right font-num">{{ line.quantity }}</td>
                <td class="py-2 pr-3 text-right font-num"><FhMoney :amount="line.lineTotal" /></td>
                <td class="py-2 text-right font-num text-ink-700">{{ line.warrantyDays > 0 ? `${line.warrantyDays} ngày` : 'Không' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <dl v-if="claim.detailLoaded" class="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-ink-100 pt-3 text-sm">
          <div class="flex gap-2"><dt class="text-ink-500">Tiền công</dt><dd class="font-num"><FhMoney :amount="detail.originalJob.laborTotal" /></dd></div>
          <div class="flex gap-2"><dt class="text-ink-500">Vật tư</dt><dd class="font-num"><FhMoney :amount="detail.originalJob.partsTotal" /></dd></div>
          <div class="flex gap-2"><dt class="text-ink-500">Tổng</dt><dd class="font-num font-semibold"><FhMoney :amount="detail.originalJob.grandTotal" /></dd></div>
        </dl>
        <div v-if="orderPhotos.length" class="border-ink-100" :class="claim.detailLoaded ? 'mt-4 border-t pt-4' : ''">
          <div class="mb-2 text-sm text-ink-500">Ảnh trước và sau khi sửa</div>
          <div class="flex flex-wrap gap-2">
            <a v-for="item in orderPhotos" :key="item.id" :href="item.mediaUrl" target="_blank" rel="noopener noreferrer">
              <img :src="item.mediaUrl" :alt="item.type === 'before' ? 'Ảnh trước khi sửa' : 'Ảnh sau khi sửa'" class="h-16 w-16 rounded-[var(--radius-sm)] border border-ink-200 object-cover" />
            </a>
          </div>
        </div>
      </FhCard>

      <FhCard v-if="claim.detailLoaded" title="Lượt kiểm tra và sửa lại">
        <p v-if="!detail.visits.length" class="text-sm text-ink-500">Chưa có kỹ thuật viên nhận và hẹn kiểm tra.</p>
        <ol v-else class="space-y-5">
          <li v-for="(visit, index) in detail.visits" :key="visit.id" class="text-sm" :data-testid="`warranty-visit-${visit.id}`">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-semibold text-ink-900">Lượt {{ index + 1 }} · {{ visit.technician?.fullName || '—' }}</span>
              <span class="rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">{{ visitStatusLabels[visit.status] ?? visit.status }}</span>
            </div>
            <dl class="mt-2 grid gap-x-6 gap-y-1 text-ink-700 sm:grid-cols-3">
              <div><dt class="text-xs text-ink-500">Hẹn lúc</dt><dd class="font-num">{{ date(visit.scheduledAt) }}</dd></div>
              <div><dt class="text-xs text-ink-500">Có mặt lúc</dt><dd class="font-num">{{ date(visit.checkedInAt) }}</dd></div>
              <div><dt class="text-xs text-ink-500">Sửa xong lúc</dt><dd class="font-num">{{ date(visit.completedAt) }}</dd></div>
            </dl>
            <div v-if="visit.proposedResult" class="mt-3 rounded-xl bg-ink-50 p-3">
              <p class="font-medium text-ink-900">Đề xuất: {{ resultLabel(visit.proposedResult) }}</p>
              <p v-if="visit.notCoveredReasonCode" class="text-ink-700">Lý do: {{ reasonLabel(visit.notCoveredReasonCode) }}</p>
              <p class="mt-1 whitespace-pre-line text-ink-700 text-pretty">{{ visit.findings }}</p>
              <div v-if="visit.evidenceRefs?.length" class="mt-2 flex flex-wrap gap-2">
                <a v-for="url in visit.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer"><img :src="url" alt="Bằng chứng của kỹ thuật viên" class="h-14 w-14 rounded-[var(--radius-sm)] border border-ink-200 object-cover" /></a>
              </div>
            </div>
            <div v-if="visit.reServiceNotes" class="mt-3 rounded-xl bg-ink-50 p-3">
              <p class="font-medium text-ink-900">Việc đã sửa lại</p>
              <p class="mt-1 whitespace-pre-line text-ink-700 text-pretty">{{ visit.reServiceNotes }}</p>
              <div v-if="visit.reServiceEvidenceRefs?.length" class="mt-2 flex flex-wrap gap-2">
                <a v-for="url in visit.reServiceEvidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer"><img :src="url" alt="Ảnh sau khi sửa lại" class="h-14 w-14 rounded-[var(--radius-sm)] border border-ink-200 object-cover" /></a>
              </div>
            </div>
          </li>
        </ol>
      </FhCard>

      <div v-if="claim.detailLoaded" class="grid gap-6 lg:grid-cols-2">
        <FhCard title="Quyết định">
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Kết luận</dt><dd class="text-right text-ink-900">{{ resultLabel(detail.decision.finalResult) }}</dd></div>
            <div v-if="detail.decision.finalReasonCode" class="flex justify-between gap-3"><dt class="text-ink-500">Lý do</dt><dd class="text-right text-ink-900">{{ reasonLabel(detail.decision.finalReasonCode) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Người duyệt</dt><dd class="text-right text-ink-900">{{ detail.decision.reviewedBy?.fullName || 'Chưa duyệt' }}<span v-if="detail.decision.reviewedAt" class="ml-1 font-num text-ink-500">{{ date(detail.decision.reviewedAt) }}</span></dd></div>
            <div v-if="detail.decision.customerRespondedAt || claim.customerResponse" class="flex justify-between gap-3"><dt class="text-ink-500">Khách phản hồi</dt><dd class="text-right text-ink-900">{{ claim.customerResponse === 'agreed' ? 'Đồng ý' : 'Phản đối' }}<span class="ml-1 font-num text-ink-500">{{ date(detail.decision.customerRespondedAt) }}</span></dd></div>
            <div v-else-if="claim.status === 'awaiting_customer'" class="flex justify-between gap-3"><dt class="text-ink-500">Chờ khách từ</dt><dd class="font-num text-ink-900">{{ date(detail.decision.awaitingSince) }}</dd></div>
            <div v-if="claim.outcomeCode" class="flex justify-between gap-3"><dt class="text-ink-500">Kết cục</dt><dd class="text-right text-ink-900">{{ claimOutcomeLabels[claim.outcomeCode] }}<template v-if="claim.refundAmount"> · <FhMoney :amount="claim.refundAmount" /></template></dd></div>
          </dl>
          <p v-if="detail.decision.smOverrodeProposal" class="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">Quản lý đã đổi kết luận so với đề xuất của kỹ thuật viên.</p>
          <div v-if="claim.resolutionNotes" class="mt-4 border-t border-ink-100 pt-4">
            <div class="text-sm text-ink-500">Đã gửi khách hàng</div>
            <p class="mt-1 text-sm text-ink-900 text-pretty">{{ claim.resolutionNotes }}</p>
          </div>
        </FhCard>

        <FhCard title="Từ chối và vắng mặt">
          <p v-if="!detail.declined && !claim.noShowFlaggedAt" class="text-sm text-ink-500">Chưa có kỹ thuật viên nào từ chối hoặc vắng mặt.</p>
          <dl v-else class="space-y-2.5 text-sm">
            <div v-if="detail.declined" class="flex justify-between gap-3"><dt class="text-ink-500">Kỹ thuật viên</dt><dd class="text-right text-ink-900">{{ detail.declined.by?.fullName || '—' }}</dd></div>
            <div v-if="detail.declined?.reasonCode" class="flex justify-between gap-3"><dt class="text-ink-500">Lý do</dt><dd class="text-right text-ink-900">{{ detail.declined.reasonCode === 'no_response' ? 'Không phản hồi đúng hạn' : detail.declined.reasonCode === 'no_show' ? 'Không đến kiểm tra' : reasonLabel(detail.declined.reasonCode) }}</dd></div>
            <div v-if="detail.declined?.at" class="flex justify-between gap-3"><dt class="text-ink-500">Lúc</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ date(detail.declined.at) }}</dd></div>
            <div v-if="claim.declineReview" class="flex justify-between gap-3"><dt class="text-ink-500">Quản lý xét</dt><dd class="text-right text-ink-900">{{ declineReviewLabels[claim.declineReview] }}</dd></div>
          </dl>
          <p v-if="detail.declined?.note" class="mt-3 text-sm text-ink-700 text-pretty">{{ detail.declined.note }}</p>
        </FhCard>
      </div>

      <FhCard v-if="detail.partRequest" title="Linh kiện bảo hành">
        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Yêu cầu linh kiện</dt><dd class="text-right"><router-link to="/console/part-requests" class="text-brand-700 hover:underline">{{ detail.partRequest.status }}</router-link></dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Kiểm tra linh kiện hỏng</dt><dd class="text-right text-ink-900">{{ detail.partRequest.faultyInspectionResult ? faultyInspectionLabels[detail.partRequest.faultyInspectionResult] : 'Chưa kiểm tra' }}</dd></div>
          <div v-if="detail.partRequest.faultyInspectionResult" class="flex justify-between gap-3"><dt class="text-ink-500">Người trả tiền</dt><dd class="text-ink-900">{{ detail.partRequest.chargeTechnician ? 'Kỹ thuật viên' : 'FixHome' }}</dd></div>
        </dl>
        <p v-if="detail.partRequest.faultyInspectionNote" class="mt-3 text-sm text-ink-700 text-pretty">{{ detail.partRequest.faultyInspectionNote }}</p>
        <div v-if="detail.partRequest.faultyInspectionEvidence?.length" class="mt-3 flex flex-wrap gap-2">
          <template v-for="url in detail.partRequest.faultyInspectionEvidence" :key="url">
            <a v-if="isSafeEvidenceLink(url)" :href="url" target="_blank" rel="noopener noreferrer"><img :src="url" alt="Ảnh linh kiện hỏng" class="h-14 w-14 rounded-[var(--radius-sm)] border border-ink-200 object-cover" /></a>
          </template>
        </div>
        <ul class="mt-4 divide-y divide-ink-100 border-t border-ink-100 text-sm">
          <li v-for="item in detail.partRequest.items" :key="item.id" class="flex justify-between gap-3 py-2">
            <span class="text-ink-900">{{ item.name }} <span class="text-ink-500">× {{ item.quantity }}</span></span>
            <FhMoney :amount="item.unitPrice * item.quantity" />
          </li>
        </ul>
      </FhCard>
    </template>

    <WarrantyDecisionModal v-if="claim" :claim="modalMode ? claim : null" :mode="modalMode" :technicians="technicians" @close="modalMode = null" @done="onDone" />
  </div>
</template>
