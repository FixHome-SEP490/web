<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Droplets,
  ExternalLink,
  FileSearch,
  Home,
  Image,
  Info,
  KeyRound,
  Layers,
  MapPin,
  MessageSquare,
  PackageCheck,
  Phone,
  Receipt,
  ShieldCheck,
  Snowflake,
  User,
  UserCheck,
  Wrench,
  Zap,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton } from '../../components';
import FhTimeline, { type TimelineStep } from '../../components/FhTimeline.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import WarrantyDecisionModal, { type WarrantyDecisionMode } from '../../components/console/WarrantyDecisionModal.vue';
import WarrantyPhotoStrip from '../../components/console/WarrantyPhotoStrip.vue';
import { ordersApi, type OrderEvidenceRecord } from '../../api/orders.api';
import { warrantyManagerApi, type WarrantyClaimDetail } from '../../api/warranty-claims.api';
import { useAuthStore } from '../../stores/auth';
import {
  managerClaimDisplayMeta,
  claimOutcomeLabels,
  declineReasonLabels,
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
import { useLiveOrderRefresh } from '../../composables/useLiveOrderRefresh';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const route = useRoute();
const authStore = useAuthStore();
const canDecide = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const claimId = computed(() => String(route.params.id));
const claim = ref<WarrantyClaimDetail | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const orderPhotos = ref<OrderEvidenceRecord[]>([]);
const modalMode = ref<WarrantyDecisionMode | null>(null);
const activeTab = ref<'general' | 'history'>('general');

const meta = computed(() => (claim.value ? managerClaimDisplayMeta(claim.value) : null));
const detail = computed(() => claim.value?.detail ?? null);
const visit = computed(() => claim.value?.visit ?? claim.value?.detail.visits?.[0] ?? null);
const closed = computed(() => !!claim.value && ['resolved', 'rejected'].includes(claim.value.status));

const reasonLabel = (code: string | null | undefined) =>
  code ? notCoveredReasonLabels[code as NotCoveredReason] ?? declineReasonLabels[code as DeclineReason] ?? 'Khác' : '';
const resultLabel = (result: string | null | undefined) => (result ? inspectionResultLabels[result as InspectionResult] ?? 'Khác' : '—');
const date = (value: string | null | undefined) => formatSupportDate(value);
const partSourceLabel = (source: string | null) => (source === 'fixhome' ? 'FixHome' : source === 'technician' ? 'Kỹ thuật viên tự mua' : '');
const safePhotos = (urls: string[] | null | undefined) => (urls ?? []).filter(isSafeEvidenceLink);

const faultyReturnLabel = computed(() => {
  const request = detail.value?.partRequest;
  if (!request) return '';
  if (request.faultyReturnedAt) return `Đã nộp ${date(request.faultyReturnedAt)}`;
  if (!request.faultyReturnDueAt) return 'Chờ kỹ thuật viên nhận linh kiện thay thế';
  const overdue = new Date(request.faultyReturnDueAt).getTime() < Date.now();
  const charged = request.faultyReturnChargedAt ? ', đã trừ ví kỹ thuật viên' : '';
  return `${overdue ? 'Quá hạn' : 'Hạn'} ${date(request.faultyReturnDueAt)}${charged}`;
});

/** The one thing a manager is most likely to do next with this claim. */
const primary = computed<{ mode: WarrantyDecisionMode; label: string } | null>(() => {
  const current = claim.value;
  if (!current || !canDecide.value || closed.value) return null;
  if (current.declineReview === 'pending') return { mode: 'review', label: current.noShowFlaggedAt ? 'Xét không đến' : 'Xét không phản hồi' };
  if (current.status === 'inspected') return { mode: 'approve', label: 'Duyệt kết luận' };
  if (['in_progress', 'awaiting_customer', 'disputed'].includes(current.status) && !closeBlocked.value) return { mode: 'close', label: 'Đóng yêu cầu' };
  return null;
});
// The backend refuses to let the manager who approved a disputed claim close it; another manager has to.
const closeBlocked = computed(() => claim.value?.status === 'disputed' && detail.value?.decision.reviewedBy?.id === authStore.user?.id);
const canReject = computed(() => canDecide.value && ['submitted', 'accepted', 'inspected'].includes(claim.value?.status ?? ''));

const serviceArtwork = computed(() => getServiceArtworkUrl({ name: claim.value?.order.serviceName }));
const artworkError = ref(false);
const serviceIcon = computed(() => {
  const name = (claim.value?.order.serviceName || '').toLowerCase();
  if (/điều hòa|lạnh|máy giặt|tủ lạnh|bình nóng lạnh|máy sấy/i.test(name)) return Snowflake;
  if (/nước|vòi|bơm|siphon|lavabo|ống/i.test(name)) return Droplets;
  if (/điện|công tắc|ổ cắm|đèn|quạt/i.test(name)) return Zap;
  if (/khóa|cửa/i.test(name)) return KeyRound;
  return Wrench;
});
const statusIcon = computed(() => {
  switch (claim.value?.status) {
    case 'resolved': return CheckCircle2;
    case 'rejected': return Ban;
    case 'disputed': return AlertCircle;
    case 'in_progress': return Wrench;
    case 'accepted': return UserCheck;
    default: return Clock;
  }
});

const originalTechName = computed(() => {
  const techs = detail.value?.originalJob.technicians;
  if (techs?.length) return (techs.find((t) => t.isActive) ?? techs[0]).fullName || '—';
  return claim.value?.technician?.fullName || '—';
});


/** Every labour and part line that carries a warranty; the term ends warranty days after the job was completed. */
const warrantyLines = computed(() => {
  const job = detail.value?.originalJob;
  if (!job?.completedAt) return [];
  const done = new Date(job.completedAt).getTime();
  return job.lines
    .filter((line) => line.warrantyDays > 0)
    .map((line) => {
      const until = new Date(done + line.warrantyDays * 86_400_000).toISOString();
      return { id: line.id, name: line.description, type: invoiceLineTypeLabels[line.type] ?? 'Khác', days: line.warrantyDays, until, expired: new Date(until).getTime() < Date.now(), faulty: !!line.faulty };
    });
});

const faultyWarranty = computed(() => warrantyLines.value.filter((line) => line.faulty));

const faultyLines = computed(() => (detail.value?.originalJob.lines ?? []).filter((line) => line.faulty));
const partsValue = computed(() => (detail.value?.partRequest?.items ?? []).reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (item.quantity || 1), 0));
const showRefund = computed(() => claim.value?.outcomeCode === 'unfixed' || (claim.value?.refundAmount ?? 0) > 0);

const hasProposal = computed(() => !!visit.value?.proposedResult);
const hasDecision = computed(() => !!detail.value?.decision.reviewedAt || !!claim.value?.autoApproved);
const hasOutcome = computed(() => {
  const c = claim.value;
  const d = detail.value;
  return !!(c?.awaitingPrompt || c?.customerResponse || c?.resolvedAt || visit.value?.reServiceNotes || d?.decision.escalatedSupportCaseId);
});

function waited(since: string | null | undefined): string {
  if (!since) return '';
  const ms = Date.now() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Đã chờ dưới 1 giờ';
  return hours < 48 ? `Đã chờ ${hours} giờ` : `Đã chờ ${Math.floor(hours / 24)} ngày`;
}

/** Who has to act now, said once: the progress list and the history below hold the facts. */
const nextStep = computed<{ title: string; text: string; tone: 'warning' | 'info' | 'success' | 'neutral'; since: string } | null>(() => {
  const c = claim.value;
  if (!c) return null;
  if (c.status === 'resolved') return { title: 'Yêu cầu đã đóng', text: c.resolutionNotes || 'Bảo hành đã hoàn tất.', tone: 'success', since: '' };
  if (c.status === 'rejected') return { title: 'Yêu cầu không được bảo hành', text: c.resolutionNotes || '', tone: 'neutral', since: '' };
  if (c.declineReview === 'pending') {
    return {
      title: c.noShowFlaggedAt ? 'Quản lý dịch vụ cần xét kỹ thuật viên không đến' : 'Quản lý dịch vụ cần xét kỹ thuật viên không phản hồi',
      text: 'Xét lý do để quyết định có tính vào uy tín của kỹ thuật viên hay không.',
      tone: 'warning',
      since: c.noShowFlaggedAt ?? '',
    };
  }
  switch (c.status) {
    case 'submitted':
      return c.technician
        ? { title: 'Chờ kỹ thuật viên nhận yêu cầu', text: `${c.technician.fullName} chưa nhận yêu cầu.`, tone: 'info', since: c.submittedAt }
        : { title: 'Kỹ thuật viên của đơn không còn hoạt động', text: 'Yêu cầu chưa có người xử lý. Có thể từ chối yêu cầu nếu không thể bảo hành.', tone: 'warning', since: c.submittedAt };
    case 'accepted':
      return {
        title: visit.value?.checkedInAt ? 'Chờ kỹ thuật viên gửi kết luận' : 'Chờ kỹ thuật viên đến kiểm tra',
        text: visit.value?.scheduledAt ? `Lịch kiểm tra: ${date(visit.value.scheduledAt)}.` : '',
        tone: 'info',
        since: '',
      };
    case 'inspected':
      return { title: 'Quản lý dịch vụ cần duyệt kết luận', text: 'So sánh đề xuất và ảnh kiểm tra với yêu cầu của khách.', tone: 'warning', since: '' };
    case 'in_progress':
      return { title: 'Kỹ thuật viên đang bảo hành', text: 'Chờ kỹ thuật viên xác nhận hoàn tất.', tone: 'info', since: '' };
    case 'awaiting_customer':
      return c.customerResponse === 'agreed'
        ? { title: 'Khách đã đồng ý, chờ quản lý dịch vụ đóng', text: '', tone: 'warning', since: detail.value?.decision.customerRespondedAt ?? '' }
        : { title: 'Chờ khách hàng phản hồi', text: 'Yêu cầu tự đóng khi khách không phản hồi đúng hạn.', tone: 'info', since: detail.value?.decision.awaitingSince ?? '' };
    case 'disputed':
      return {
        title: 'Khách phản đối, cần quản lý dịch vụ xem xét',
        text: closeBlocked.value ? 'Bạn đã duyệt yêu cầu này nên một quản lý dịch vụ khác phải đóng.' : '',
        tone: 'warning',
        since: detail.value?.decision.customerRespondedAt ?? '',
      };
    default:
      return null;
  }
});

const nextStepClasses = {
  warning: 'border-warning-200 bg-warning-50 text-warning-800',
  info: 'border-info-50 bg-info-50 text-info-600',
  success: 'border-success-200 bg-success-50 text-success-800',
  neutral: 'border-ink-200 bg-ink-50 text-ink-700',
} as const;

/** One list, built from facts the server returned: a step without data stays pending. */
const progress = computed(() => {
  const c = claim.value;
  const d = detail.value;
  if (!c || !d) return [];
  const v = visit.value;
  const flags = [
    true,
    !!v,
    !!v?.proposedResult,
    hasDecision.value,
    !!v?.completedAt,
    !!d.decision.customerRespondedAt || (closed.value && !!c.customerResponse),
    closed.value,
  ];
  const labels = ['Gửi yêu cầu', 'Kỹ thuật viên nhận', 'Kiểm tra', 'Duyệt kết luận', 'Bảo hành', 'Khách xác nhận', c.status === 'rejected' ? 'Không bảo hành' : 'Đóng'];
  const currentIndex = closed.value ? -1 : flags.findIndex((done) => !done);
  return labels.map((label, index) => ({ label, done: flags[index], current: index === currentIndex }));
});

/** The history: only moments the server has recorded, in the order they happen. */
const historySteps = computed<TimelineStep[]>(() => {
  const c = claim.value;
  const d = detail.value;
  if (!c || !d) return [];
  const v = visit.value;
  const steps: TimelineStep[] = [
    { key: 'submitted', label: 'Khách hàng gửi yêu cầu', timestamp: date(c.submittedAt), actor: c.order.customerName, note: c.submittedAfterExpiry ? 'Gửi sau khi hết hạn bảo hành.' : undefined, completed: true },
  ];
  if (d.declined) {
    steps.push({ key: 'declined', label: 'Kỹ thuật viên không nhận yêu cầu', timestamp: d.declined.at ? date(d.declined.at) : undefined, actor: d.declined.by?.fullName, note: d.declined.note || reasonLabel(d.declined.reasonCode) || undefined, completed: true });
  }
  if (v?.scheduledAt) {
    steps.push({ key: 'scheduled', label: 'Kỹ thuật viên nhận và hẹn kiểm tra', timestamp: date(v.scheduledAt), actor: c.technician?.fullName, completed: true });
  }
  if (v?.checkedInAt) {
    steps.push({ key: 'checked-in', label: 'Kỹ thuật viên đã có mặt', timestamp: date(v.checkedInAt), actor: c.technician?.fullName, completed: true });
  }
  if (c.noShowFlaggedAt) {
    steps.push({ key: 'no-show', label: 'Ghi nhận kỹ thuật viên không đến', timestamp: date(c.noShowFlaggedAt), note: c.declineReview ? 'Quản lý dịch vụ xét lý do.' : undefined, completed: true });
  }
  if (v?.proposedResult) {
    steps.push({ key: 'proposal', label: 'Kỹ thuật viên đề xuất kết luận', actor: c.technician?.fullName, note: [resultLabel(v.proposedResult), v.notCoveredReasonCode ? reasonLabel(v.notCoveredReasonCode) : ''].filter(Boolean).join(' · '), completed: true });
  }
  if (d.decision.reviewedAt || c.autoApproved) {
    steps.push({
      key: 'decision',
      label: c.autoApproved ? 'Hệ thống tự duyệt kết luận' : 'Quản lý dịch vụ duyệt kết luận',
      timestamp: d.decision.reviewedAt ? date(d.decision.reviewedAt) : undefined,
      actor: d.decision.reviewedBy?.fullName,
      note: [resultLabel(d.decision.finalResult), d.decision.smOverrodeProposal ? 'Đã đổi kết luận so với đề xuất' : ''].filter(Boolean).join(' · '),
      completed: true,
    });
  }
  if (v?.completedAt) {
    steps.push({ key: 'completed', label: 'Kỹ thuật viên hoàn tất bảo hành', timestamp: date(v.completedAt), actor: c.technician?.fullName, note: v.reServiceNotes || undefined, completed: true });
  }
  if (d.decision.customerRespondedAt) {
    steps.push({ key: 'customer', label: c.customerResponse === 'agreed' ? 'Khách hàng đồng ý kết quả' : 'Khách hàng phản đối kết quả', timestamp: date(d.decision.customerRespondedAt), actor: c.order.customerName, completed: true });
  }
  if (c.resolvedAt) {
    steps.push({
      key: 'closed',
      label: c.status === 'resolved' ? 'Đóng yêu cầu' : 'Không được bảo hành',
      timestamp: date(c.resolvedAt),
      actor: d.decision.reviewedBy?.fullName,
      note: c.resolutionNotes || (c.outcomeCode ? claimOutcomeLabels[c.outcomeCode] : undefined),
      completed: true,
    });
  } else if (nextStep.value) {
    steps.push({ key: 'next', label: nextStep.value.title, current: true });
  }
  return steps;
});

// The technician or customer moved the claim on: read it again in place, no skeleton.
useLiveOrderRefresh(['warranty', 'part'], async () => {
  if (!claim.value || loading.value) return;
  try {
    claim.value = await warrantyManagerApi.getDetail(claimId.value);
  } catch {
    // A failed background read keeps what is on screen; the next change or reload reads again.
  }
}, () => claim.value?.order.id);

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

function openModal(mode: WarrantyDecisionMode) {
  notice.value = '';
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
  <div class="w-full space-y-6 pb-12">
    <div v-if="loading && !claim" class="space-y-4" aria-busy="true">
      <FhSkeleton height="14px" width="140px" />
      <FhSkeleton height="28px" width="320px" />
      <FhSkeleton height="96px" :count="3" rounded="md" />
    </div>

    <template v-else-if="error && !claim">
      <nav class="mb-2 flex items-center gap-1.5 text-xs text-ink-500">
        <router-link to="/console/warranty" class="inline-flex items-center gap-1 transition-colors hover:text-brand-700">
          <Home :size="13" class="text-ink-400" />
          <span>Bảo hành</span>
        </router-link>
        <ChevronRight :size="12" class="text-ink-300" />
        <span class="font-medium text-ink-700">Chi tiết yêu cầu bảo hành</span>
      </nav>
      <ConsoleLoadError :message="error" @retry="load" />
    </template>

    <template v-else-if="claim && detail && meta">
      <nav class="flex items-center gap-1.5 text-xs text-ink-500" aria-label="Breadcrumb">
        <router-link to="/console/warranty" class="inline-flex items-center gap-1 transition-colors hover:text-brand-700">
          <Home :size="13" class="text-ink-400" />
          <span>Bảo hành</span>
        </router-link>
        <ChevronRight :size="12" class="text-ink-300" />
        <span class="font-medium text-ink-700">Chi tiết yêu cầu bảo hành</span>
      </nav>

      <div class="animate-slide-up rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-100/80 bg-blue-50/60 p-1 shadow-2xs sm:h-14 sm:w-14">
              <img
                v-if="!artworkError"
                :src="serviceArtwork"
                :alt="claim.order.serviceName"
                class="pointer-events-none h-full w-full select-none object-contain drop-shadow-xs"
                loading="lazy"
                @error="artworkError = true"
              />
              <component :is="serviceIcon" v-else :size="24" class="text-blue-600" aria-hidden="true" />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2.5">
                <h1 class="truncate text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
                  {{ claim.order.serviceName || 'Yêu cầu bảo hành' }}
                </h1>
                <span class="inline-flex items-center rounded-md bg-ink-100 px-2.5 py-0.5 font-num text-xs font-semibold text-ink-700">
                  #{{ claim.order.code || claim.id.slice(0, 8) }}
                </span>
                <span
                  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-semibold"
                  :class="warrantyClaimToneClasses[meta.tone]"
                >
                  <component :is="statusIcon" :size="13" />
                  {{ meta.label }}
                </span>
                <span
                  v-if="claim.submittedAfterExpiry"
                  class="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warning-200/80 bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-700"
                >
                  <AlertTriangle :size="12" />
                  Gửi sau khi hết hạn
                </span>
                <span
                  v-if="claim.autoApproved"
                  class="inline-flex items-center whitespace-nowrap rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600"
                >
                  Tự động duyệt
                </span>
              </div>
              <p class="mt-1.5 text-xs text-ink-500 sm:text-sm">
                Khách gửi lúc <span class="font-num">{{ date(claim.submittedAt) }}</span>
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <FhButton v-if="primary" size="sm" @click="openModal(primary.mode)">{{ primary.label }}</FhButton>
            <ConsoleMoreMenu
              v-if="canReject || detail.decision.escalatedSupportCaseId"
              :show-label="true"
              button-label="Thao tác"
              label="Thao tác với yêu cầu"
            >
              <ConsoleMenuItem v-if="detail.decision.escalatedSupportCaseId" @click="$router.push(`/console/support/${detail.decision.escalatedSupportCaseId}`)">
                <FileSearch :size="15" />
                Xem hồ sơ phản đối
              </ConsoleMenuItem>
              <ConsoleMenuItem v-if="canReject" danger @click="openModal('reject')">
                <Ban :size="15" />
                Từ chối
              </ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </div>

        <p v-if="!canDecide" class="mt-3 text-xs text-ink-500" role="status">
          Chỉ xem. Quản lý dịch vụ thực hiện các quyết định.
        </p>

        <Transition name="fh-fade-slide">
          <div v-if="notice" class="mt-4 flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
            <CheckCircle2 :size="16" aria-hidden="true" /> {{ notice }}
          </div>
        </Transition>
        <Transition name="fh-fade-slide">
          <div v-if="error" class="mt-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
            {{ error }}
          </div>
        </Transition>
        <Transition name="fh-fade-slide">
          <div v-if="!claim.detailLoaded" class="mt-4 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700" role="status" data-testid="warranty-detail-missing">
            Chưa tải được đủ thông tin chi tiết (đơn gốc, lượt kiểm tra, quyết định). Đang hiện phần có sẵn, vui lòng tải lại trang để thử lại.
          </div>
        </Transition>

        <section v-if="nextStep" class="mt-5 rounded-xl border px-4 py-3" :class="nextStepClasses[nextStep.tone]" aria-label="Bước tiếp theo" data-testid="warranty-next-step">
          <div class="text-xs font-semibold uppercase tracking-wide opacity-80">Bước tiếp theo</div>
          <div class="mt-0.5 text-sm font-semibold">{{ nextStep.title }}</div>
          <p v-if="nextStep.text" class="mt-0.5 text-sm text-pretty">{{ nextStep.text }}</p>
          <p v-if="waited(nextStep.since)" class="mt-1 text-xs opacity-80">{{ waited(nextStep.since) }}</p>
        </section>

        <ol class="scrollbar-none mt-5 flex overflow-x-auto pb-1" aria-label="Tiến trình yêu cầu">
          <li
            v-for="(step, index) in progress"
            :key="step.label"
            class="relative flex min-w-[88px] flex-1 flex-col items-center gap-1.5 text-center"
            :aria-current="step.current ? 'step' : undefined"
          >
            <span
              v-if="index > 0"
              class="absolute right-1/2 top-3 h-0.5 w-full"
              :class="step.done || step.current ? 'bg-success-600' : 'bg-ink-200'"
              aria-hidden="true"
            />
            <span
              class="relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full font-num text-xs font-semibold"
              :class="step.done ? 'bg-success-600 text-white' : step.current ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'border border-ink-200 bg-white text-ink-400'"
            >
              <Check v-if="step.done" :size="13" :stroke-width="3" aria-hidden="true" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="text-xs leading-4" :class="step.current ? 'font-semibold text-brand-700' : step.done ? 'text-ink-800' : 'text-ink-400'">{{ step.label }}</span>
          </li>
        </ol>

        <div class="mt-5 border-b border-ink-200">
          <div class="scrollbar-none flex gap-8 overflow-x-auto" role="tablist" aria-label="Phân loại thông tin">
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'general'"
              class="-mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="activeTab === 'general' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'"
              @click="activeTab = 'general'"
            >
              <Info :size="16" />
              <span>Thông tin chung</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'history'"
              class="-mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="activeTab === 'history' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'"
              @click="activeTab = 'history'"
            >
              <Clock :size="16" />
              <span>Lịch sử</span>
            </button>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'general'" class="animate-slide-up-delay-1 space-y-6">
        <!-- Yêu cầu của khách: so sánh với đề xuất ngay bên cạnh -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6">
            <div class="mb-4 flex items-center gap-2.5">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><MessageSquare :size="15" /></div>
              <h2 class="text-sm font-bold text-ink-900">Nội dung yêu cầu</h2>
            </div>
            <p class="whitespace-pre-line text-sm leading-relaxed text-ink-800 text-pretty">{{ claim.description }}</p>
            <div class="mt-4"><WarrantyPhotoStrip :urls="claim.evidenceRefs" label="Ảnh khách gửi" /></div>
            <dl class="mt-4 space-y-3 border-t border-ink-100 pt-4 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Khách hàng</dt>
                <dd class="text-right font-medium text-ink-900">{{ claim.order.customerName }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Điện thoại</dt>
                <dd class="flex items-center gap-2 text-right">
                  <span class="font-num font-medium text-ink-900">{{ claim.order.customerPhone }}</span>
                  <a
                    v-if="claim.order.customerPhone"
                    :href="`tel:${claim.order.customerPhone}`"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                    aria-label="Gọi cho khách hàng"
                  >
                    <Phone :size="14" />
                  </a>
                </dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="shrink-0 text-ink-500">Địa chỉ</dt>
                <dd class="flex items-start justify-end gap-1.5 text-right text-ink-900 text-pretty">
                  <MapPin :size="14" class="mt-0.5 shrink-0 text-ink-400" />
                  <span>{{ claim.order.addressSummary }}</span>
                </dd>
              </div>
            </dl>
          </div>

          <div class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6" data-testid="warranty-technician-card">
            <div class="mb-4 flex items-center gap-2.5">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><UserCheck :size="15" /></div>
              <h2 class="text-sm font-bold text-ink-900">Kỹ thuật viên bảo hành</h2>
            </div>
            <p v-if="!claim.technician" class="text-sm text-ink-600">Chưa có kỹ thuật viên phụ trách.</p>
            <dl v-else class="space-y-3 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Kỹ thuật viên</dt>
                <dd class="font-medium text-ink-900">{{ claim.technician.fullName }}</dd>
              </div>
              <div v-if="visit?.status" class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Lượt kiểm tra</dt>
                <dd class="font-medium text-ink-900">{{ visitStatusLabels[visit.status] ?? 'Khác' }}</dd>
              </div>
              <div v-if="visit?.scheduledAt" class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Lịch kiểm tra</dt>
                <dd class="font-num font-medium text-ink-900">{{ date(visit.scheduledAt) }}</dd>
              </div>
              <div v-if="visit?.checkedInAt" class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Có mặt lúc</dt>
                <dd class="font-num font-medium text-ink-900">{{ date(visit.checkedInAt) }}</dd>
              </div>
              <div v-if="visit?.completedAt" class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Hoàn tất lúc</dt>
                <dd class="font-num font-medium text-ink-900">{{ date(visit.completedAt) }}</dd>
              </div>
            </dl>
            <p v-if="claim.noShowFlaggedAt" class="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-800">
              <AlertTriangle :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />
              Ghi nhận không đến lúc {{ date(claim.noShowFlaggedAt) }}.
            </p>
            <p v-if="detail.declined" class="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">
              {{ detail.declined.by?.fullName || 'Kỹ thuật viên' }} không nhận yêu cầu: {{ detail.declined.note || reasonLabel(detail.declined.reasonCode) }}.
            </p>
          </div>
        </div>

        <div v-if="hasProposal" class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6" data-testid="warranty-proposal-card">
          <div class="mb-4 flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><FileSearch :size="15" /></div>
            <h2 class="text-sm font-bold text-ink-900">Đề xuất của kỹ thuật viên</h2>
          </div>
          <div class="grid gap-x-8 gap-y-4 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div class="space-y-4">
              <div>
                <div class="text-xs font-medium text-ink-500">Kết luận đề xuất</div>
                <div class="mt-1 font-semibold text-ink-900">{{ resultLabel(visit?.proposedResult) }}</div>
              </div>
              <div v-if="visit?.notCoveredReasonCode">
                <div class="text-xs font-medium text-ink-500">Lý do</div>
                <div class="mt-1 text-ink-900">{{ reasonLabel(visit.notCoveredReasonCode) }}</div>
              </div>
              <div v-if="faultyLines.length">
                <div class="text-xs font-medium text-ink-500">Linh kiện bị báo hỏng</div>
                <ul class="mt-1.5 flex flex-wrap gap-2">
                  <li v-for="line in faultyLines" :key="line.id" class="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1 text-ink-900">
                    {{ line.description }}
                    <span class="font-num text-xs text-ink-500">× {{ line.faultyQuantity ?? line.quantity }}<template v-if="line.faultyQuantity && line.faultyQuantity !== line.quantity">/{{ line.quantity }}</template></span>
                  </li>
                </ul>
              </div>
            </div>
            <div class="space-y-4">
              <div v-if="visit?.findings">
                <div class="text-xs font-medium text-ink-500">Nhận xét của kỹ thuật viên</div>
                <p class="mt-1 whitespace-pre-line rounded-lg bg-ink-50 px-3 py-2 text-ink-800 text-pretty">{{ visit.findings }}</p>
              </div>
              <div v-if="safePhotos(visit?.evidenceRefs).length">
                <div class="mb-1.5 text-xs font-medium text-ink-500">Ảnh kiểm tra</div>
                <WarrantyPhotoStrip :urls="visit?.evidenceRefs" label="Ảnh kiểm tra" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="hasDecision" class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6" data-testid="warranty-decision-card">
          <div class="mb-4 flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><ShieldCheck :size="15" /></div>
            <h2 class="text-sm font-bold text-ink-900">Quyết định của quản lý dịch vụ</h2>
          </div>
          <dl class="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs font-medium text-ink-500">Kết luận cuối</dt>
              <dd class="mt-1 font-medium text-ink-900">{{ resultLabel(detail.decision.finalResult) }}</dd>
            </div>
            <div v-if="detail.decision.finalReasonCode">
              <dt class="text-xs font-medium text-ink-500">Lý do</dt>
              <dd class="mt-1 text-ink-900">{{ reasonLabel(detail.decision.finalReasonCode) }}</dd>
            </div>
            <div v-if="detail.decision.reviewedBy">
              <dt class="text-xs font-medium text-ink-500">Người duyệt</dt>
              <dd class="mt-1 text-ink-900">{{ detail.decision.reviewedBy.fullName }}<span v-if="detail.decision.reviewedAt" class="font-num text-ink-500"> · {{ date(detail.decision.reviewedAt) }}</span></dd>
            </div>
            <div v-if="claim.autoApproved" class="text-ink-600 sm:col-span-2">Hệ thống tự duyệt vì lỗi tay nghề, không có linh kiện.</div>
          </dl>
          <p v-if="detail.decision.smOverrodeProposal" class="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
            Quản lý dịch vụ đã đổi kết luận so với đề xuất của kỹ thuật viên.
          </p>
          <p v-if="claim.resolutionNotes" class="mt-3 whitespace-pre-line rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800 text-pretty">
            <span class="block text-xs text-ink-500">Ghi chú gửi khách</span>
            {{ claim.resolutionNotes }}
          </p>
        </div>

        <div v-if="hasOutcome" class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6" data-testid="warranty-outcome-card">
          <div class="mb-4 flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><CheckCircle2 :size="15" /></div>
            <h2 class="text-sm font-bold text-ink-900">Kết quả và phản hồi của khách</h2>
          </div>
          <dl class="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
            <div v-if="claim.awaitingPrompt">
              <dt class="text-xs font-medium text-ink-500">Khách được hỏi xác nhận</dt>
              <dd class="mt-1 text-ink-900">{{ claim.awaitingPrompt === 'completion' ? 'Kết quả sau khi bảo hành' : 'Kết luận không bảo hành' }}</dd>
            </div>
            <div v-if="claim.customerResponse">
              <dt class="text-xs font-medium text-ink-500">Phản hồi của khách</dt>
              <dd class="mt-1 text-ink-900">
                {{ claim.customerResponse === 'agreed' ? 'Đồng ý' : 'Phản đối' }}
                <span v-if="detail.decision.customerRespondedAt" class="font-num text-ink-500"> · {{ date(detail.decision.customerRespondedAt) }}</span>
              </dd>
            </div>
            <div v-if="claim.outcomeCode">
              <dt class="text-xs font-medium text-ink-500">Kết cục</dt>
              <dd class="mt-1 font-medium text-ink-900">{{ claimOutcomeLabels[claim.outcomeCode] ?? 'Khác' }}</dd>
            </div>
            <div v-if="showRefund">
              <dt class="text-xs font-medium text-ink-500">Đã hoàn cho khách</dt>
              <dd class="mt-1 font-num font-medium text-ink-900"><FhMoney :amount="claim.refundAmount ?? 0" /></dd>
            </div>
            <div v-if="claim.resolvedAt">
              <dt class="text-xs font-medium text-ink-500">Đóng lúc</dt>
              <dd class="mt-1 font-num text-ink-900">{{ date(claim.resolvedAt) }}</dd>
            </div>
          </dl>
          <div v-if="visit?.reServiceNotes || safePhotos(visit?.reServiceEvidenceRefs).length" class="mt-4 border-t border-ink-100 pt-4">
            <div class="text-xs font-semibold text-ink-500">Kỹ thuật viên đã báo bảo hành xong</div>
            <p v-if="visit?.reServiceNotes" class="mt-1 whitespace-pre-line text-sm text-ink-800 text-pretty">{{ visit.reServiceNotes }}</p>
            <div class="mt-2"><WarrantyPhotoStrip :urls="visit?.reServiceEvidenceRefs" label="Ảnh sau bảo hành" /></div>
          </div>
          <router-link
            v-if="detail.decision.escalatedSupportCaseId"
            :to="`/console/support/${detail.decision.escalatedSupportCaseId}`"
            class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            <FileSearch :size="14" aria-hidden="true" /> Xem hồ sơ phản đối
          </router-link>
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6">
            <div class="mb-4 flex items-center gap-2.5">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><ShieldCheck :size="15" /></div>
              <h2 class="text-sm font-bold text-ink-900">Thông tin bảo hành</h2>
            </div>
            <div class="text-sm" data-testid="warranty-claimed-part">
              <div class="text-xs font-medium text-ink-500">Linh kiện kỹ thuật viên báo hỏng</div>
              <ul v-if="faultyWarranty.length" class="mt-1.5 space-y-1.5">
                <li v-for="line in faultyWarranty" :key="line.id" class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-medium text-ink-900">{{ line.name }}</span>
                  <span class="font-num text-ink-600">{{ line.days }} ngày · đến {{ date(line.until) }}<span :class="line.expired ? 'text-danger-700' : 'text-success-700'"> · {{ line.expired ? 'Hết hạn' : 'Còn hạn' }}</span></span>
                </li>
              </ul>
              <p v-else class="mt-1 text-ink-600">Chưa xác định, kỹ thuật viên sẽ kiểm tra rồi báo lại.</p>
            </div>
            <div v-if="warrantyLines.length" class="mt-4 border-t border-ink-100 pt-3" data-testid="warranty-lines">
              <div class="mb-1.5 text-xs font-semibold text-ink-500">Bảo hành của đơn này</div>
              <ul class="space-y-1.5 text-xs">
                <li v-for="line in warrantyLines" :key="line.id" class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-ink-900">
                    <span class="text-ink-500">{{ line.type }} · </span>{{ line.name }}
                    <span v-if="line.faulty" class="ml-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">Báo hỏng</span>
                  </span>
                  <span class="font-num text-ink-600">{{ line.days }} ngày · đến {{ date(line.until) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div v-if="detail.partRequest" class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6" data-testid="warranty-part-card">
            <div class="mb-4 flex items-center gap-2.5">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Boxes :size="15" /></div>
              <h2 class="text-sm font-bold text-ink-900">Linh kiện bảo hành</h2>
            </div>
            <div class="space-y-2 text-sm text-ink-600">
              <div class="flex justify-between gap-2">
                <span class="text-ink-500">Kiểm tra linh kiện hỏng</span>
                <span class="text-right font-medium text-ink-900">
                  {{ detail.partRequest.faultyInspectionResult ? faultyInspectionLabels[detail.partRequest.faultyInspectionResult] : 'Chưa kiểm tra' }}
                </span>
              </div>
              <div class="flex justify-between gap-2" data-testid="faulty-return-state">
                <span class="inline-flex items-center gap-1 text-ink-500"><PackageCheck :size="13" /> Kỹ thuật viên nộp linh kiện hỏng</span>
                <span class="text-right font-medium text-ink-900">{{ faultyReturnLabel }}</span>
              </div>
              <div v-if="detail.partRequest.faultyInspectionResult" class="flex justify-between gap-2">
                <span class="text-ink-500">Người trả tiền</span>
                <span class="font-medium text-ink-900">{{ detail.partRequest.chargeTechnician ? 'Kỹ thuật viên' : 'FixHome' }}</span>
              </div>
              <p v-if="detail.partRequest.faultyInspectionNote" class="text-ink-700 text-pretty">{{ detail.partRequest.faultyInspectionNote }}</p>
              <ul v-if="detail.partRequest.items.length" class="divide-y divide-ink-100 border-t border-ink-100 pt-2">
                <li v-for="item in detail.partRequest.items" :key="item.id" class="flex justify-between py-1">
                  <span>{{ item.name }} <span class="font-num text-ink-500">× {{ item.quantity }}</span></span>
                  <span class="font-num"><FhMoney :amount="item.unitPrice * item.quantity" /></span>
                </li>
              </ul>
              <div v-if="detail.partRequest.items.length" class="flex justify-between border-t border-ink-100 pt-2 font-semibold text-ink-900">
                <span>Giá trị linh kiện thay thế</span>
                <span class="font-num"><FhMoney :amount="partsValue" /></span>
              </div>
              <div class="grid gap-3 pt-2 sm:grid-cols-2">
                <div v-if="safePhotos(detail.partRequest.faultyInspectionEvidence).length">
                  <div class="mb-1 text-xs text-ink-500">Ảnh kiểm tra linh kiện hỏng</div>
                  <WarrantyPhotoStrip :urls="detail.partRequest.faultyInspectionEvidence" label="Ảnh kiểm tra linh kiện hỏng" />
                </div>
                <div v-if="safePhotos(detail.partRequest.faultyReturnEvidence).length">
                  <div class="mb-1 text-xs text-ink-500">Ảnh nộp linh kiện hỏng</div>
                  <WarrantyPhotoStrip :urls="detail.partRequest.faultyReturnEvidence" label="Ảnh nộp linh kiện hỏng" />
                </div>
              </div>
              <p v-if="detail.partRequest.faultyReturnNote" class="text-ink-700 text-pretty">{{ detail.partRequest.faultyReturnNote }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6">
          <div class="mb-4 flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Wrench :size="15" /></div>
            <h2 class="text-sm font-bold text-ink-900">Đơn sửa chữa gốc</h2>
          </div>
          <div class="grid grid-cols-1 gap-4 border-b border-ink-100 pb-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Mã đơn</span>
              <router-link :to="`/console/orders/${claim.order.id}`" class="inline-flex items-center gap-1 font-num font-semibold text-brand-700 hover:underline">
                #{{ claim.order.code }}
                <ExternalLink :size="13" aria-hidden="true" />
              </router-link>
            </div>
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Kỹ thuật viên làm đơn</span>
              <span class="inline-flex items-center gap-1 font-medium text-ink-900"><User :size="13" class="text-ink-400" aria-hidden="true" />{{ originalTechName }}</span>
            </div>
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Dịch vụ</span>
              <span class="truncate font-medium text-ink-900">{{ claim.order.serviceName }}</span>
            </div>
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Ngày hoàn thành</span>
              <span class="font-num font-medium text-ink-900">{{ date(detail.originalJob.completedAt) }}</span>
            </div>
          </div>

          <details v-if="claim.detailLoaded || orderPhotos.length" class="group mt-4 pt-1" open>
            <summary class="flex cursor-pointer select-none items-center justify-between py-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
              <span class="inline-flex items-center gap-1.5">
                <Receipt :size="13" aria-hidden="true" />
                Hạng mục sửa chữa và ảnh đơn gốc (thanh toán: {{ paymentStatusLabels[detail.originalJob.paymentStatus] ?? 'Khác' }})
              </span>
              <ChevronDown :size="14" class="text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div v-if="detail.originalJob.lines.length" class="mt-3 overflow-hidden rounded-lg border border-ink-200/80">
              <div class="overflow-x-auto overscroll-x-contain">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-ink-200/80 bg-ink-50/90 font-semibold text-ink-600">
                      <th scope="col" class="px-3 py-2">Hạng mục</th>
                      <th scope="col" class="px-3 py-2">Nguồn</th>
                      <th scope="col" class="px-3 py-2 text-right">SL</th>
                      <th scope="col" class="px-3 py-2 text-right">Thành tiền</th>
                      <th scope="col" class="px-3 py-2 text-right">Bảo hành</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-ink-100">
                    <tr
                      v-for="line in detail.originalJob.lines"
                      :key="line.id"
                      :class="line.faulty ? 'bg-brand-50/60' : 'hover:bg-brand-50/25'"
                      :data-testid="`warranty-line-${line.id}`"
                    >
                      <td class="px-3 py-2 text-ink-900">
                        {{ line.description }}
                        <span v-if="line.faulty" class="ml-1 whitespace-nowrap rounded-full bg-brand-100 px-1.5 py-0.5 font-num text-[11px] font-medium text-brand-700">
                          Kỹ thuật viên báo hỏng{{ line.faultyQuantity && line.faultyQuantity !== line.quantity ? ` ${line.faultyQuantity}/${line.quantity}` : '' }}
                        </span>
                        <span class="block text-[11px] text-ink-500">{{ invoiceLineTypeLabels[line.type] ?? 'Khác' }}</span>
                      </td>
                      <td class="px-3 py-2 text-ink-700">{{ partSourceLabel(line.partSource) || '—' }}</td>
                      <td class="px-3 py-2 text-right font-num">{{ line.quantity }}</td>
                      <td class="px-3 py-2 text-right font-num"><FhMoney :amount="line.lineTotal" /></td>
                      <td class="px-3 py-2 text-right font-num text-ink-700">{{ line.warrantyDays > 0 ? `${line.warrantyDays} ngày` : 'Không' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <dl v-if="claim.detailLoaded" class="mt-2.5 flex flex-wrap justify-end gap-x-5 gap-y-1 text-xs">
              <div class="flex gap-1.5"><dt class="text-ink-500">Tiền công:</dt><dd class="font-num"><FhMoney :amount="detail.originalJob.laborTotal" /></dd></div>
              <div class="flex gap-1.5"><dt class="text-ink-500">Vật tư:</dt><dd class="font-num"><FhMoney :amount="detail.originalJob.partsTotal" /></dd></div>
              <div class="flex gap-1.5"><dt class="font-semibold text-ink-500">Tổng:</dt><dd class="font-num font-semibold"><FhMoney :amount="detail.originalJob.grandTotal" /></dd></div>
            </dl>
            <div v-if="orderPhotos.length" class="mt-3 border-t border-ink-100 pt-2.5">
              <div class="mb-1.5 flex items-center gap-1.5 text-xs text-ink-500"><Image :size="13" aria-hidden="true" /> Ảnh trước và sau khi sửa</div>
              <div class="flex flex-wrap gap-2">
                <a v-for="item in orderPhotos" :key="item.id" :href="item.mediaUrl" target="_blank" rel="noopener noreferrer">
                  <img :src="item.mediaUrl" :alt="item.type === 'before' ? 'Ảnh trước khi sửa' : 'Ảnh sau khi sửa'" loading="lazy" class="h-14 w-14 rounded-md border border-ink-200 object-cover" />
                </a>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div v-show="activeTab === 'history'" class="rounded-xl border border-ink-100 bg-white p-5 shadow-xs sm:p-6">
        <div class="mb-6 flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Layers :size="15" /></div>
          <h2 class="text-sm font-bold text-ink-900">Lịch sử xử lý</h2>
        </div>
        <FhTimeline :steps="historySteps" />
      </div>
    </template>

    <WarrantyDecisionModal
      v-if="claim"
      :claim="modalMode ? claim : null"
      :mode="modalMode"
      @close="modalMode = null"
      @done="onDone"
    />
  </div>
</template>
