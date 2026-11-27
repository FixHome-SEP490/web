<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import { useRoute } from 'vue-router';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Boxes,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Droplets,
  ExternalLink,
  FileSearch,
  FileText,
  Filter,
  Home,
  Image,
  Info,
  KeyRound,
  Layers,
  MapPin,
  MessageSquare,
  PackageCheck,
  Phone,
  PlusCircle,
  Receipt,
  ShieldCheck,
  Snowflake,
  User,
  UserCheck,
  Users,
  Wrench,
  Zap,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton } from '../../components';
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
const technicians = ref<{ id: string; fullName: string }[]>([]);
const modalMode = ref<WarrantyDecisionMode | null>(null);

const activeTab = ref<'general' | 'timeline' | 'logs'>('general');
const activityFilter = ref<'all' | 'status' | 'assignment' | 'inspection' | 'decision'>('all');

const meta = computed(() => (claim.value ? managerClaimDisplayMeta(claim.value) : null));
const faultyReturnLabel = computed(() => {
  const request = claim.value?.detail.partRequest;
  if (!request) return '';
  if (request.faultyReturnedAt) return `Đã nộp ${formatSupportDate(request.faultyReturnedAt)}`;
  if (!request.faultyReturnDueAt) return 'Chờ thợ nhận linh kiện thay thế';
  const overdue = new Date(request.faultyReturnDueAt).getTime() < Date.now();
  const charged = request.faultyReturnChargedAt ? ', đã trừ ví thợ' : '';
  return `${overdue ? 'Quá hạn' : 'Hạn'} ${formatSupportDate(request.faultyReturnDueAt)}${charged}`;
});
const closed = computed(() => !!claim.value && ['resolved', 'rejected'].includes(claim.value.status));
const detail = computed(() => claim.value?.detail ?? null);

/** The one thing a manager is most likely to do next with this claim. */
const primary = computed<{ mode: WarrantyDecisionMode; label: string } | null>(() => {
  const current = claim.value;
  if (!current || !canDecide.value || closed.value) return null;
  if (current.declineReview === 'pending') return { mode: 'review', label: current.noShowFlaggedAt ? 'Xét không đến' : 'Xét từ chối' };
  if (current.status === 'inspected') return { mode: 'approve', label: 'Duyệt kết luận' };
  // The backend refuses to let the manager who approved a disputed claim close it; another manager has to.
  const reviewedByMe = current.status === 'disputed' && detail.value?.decision.reviewedBy?.id === authStore.user?.id;
  if (['in_progress', 'awaiting_customer', 'disputed'].includes(current.status) && !reviewedByMe) return { mode: 'close', label: 'Đóng yêu cầu' };
  return null;
});
const canReject = computed(() => canDecide.value && ['submitted', 'accepted', 'inspected'].includes(claim.value?.status ?? ''));

const reasonLabel = (code: string | null | undefined) =>
  code ? notCoveredReasonLabels[code as NotCoveredReason] ?? declineReasonLabels[code as DeclineReason] ?? code : '';
const resultLabel = (result: string | null | undefined) => (result ? inspectionResultLabels[result as InspectionResult] ?? result : '—');
const date = (value: string | null | undefined) => formatSupportDate(value);
const partSourceLabel = (source: string | null) => (source === 'fixhome' ? 'FixHome' : source === 'technician' ? 'Thợ tự mua' : '');

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
    case 'resolved':
      return CheckCircle2;
    case 'rejected':
      return Ban;
    case 'disputed':
      return AlertCircle;
    case 'in_progress':
      return Wrench;
    case 'accepted':
      return UserCheck;
    case 'inspected':
    case 'awaiting_customer':
    case 'submitted':
    default:
      return Clock;
  }
});

const originalTechName = computed(() => {
  const techs = detail.value?.originalJob.technicians;
  if (techs?.length) {
    const active = techs.find((t) => t.isActive);
    return active?.fullName || techs[0].fullName || '—';
  }
  return claim.value?.technician?.fullName || '—';
});

const warrantyDurationText = computed(() => {
  const days = detail.value?.coverage?.warrantyDays ?? detail.value?.originalJob.laborWarrantyDays;
  return days ? `${days} ngày` : '30 ngày';
});

const remainingDays = computed(() => {
  const expiresAt = detail.value?.coverage?.expiresAt || claim.value?.coverage?.expiresAt;
  if (!expiresAt) return null;
  const expiryTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryTime)) return null;
  return Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24));
});

const totalWarrantyCost = computed(() => {
  let total = 0;
  if (detail.value?.partRequest?.items?.length) {
    total += detail.value.partRequest.items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (item.quantity || 1), 0);
  }
  if (claim.value?.refundAmount) {
    total += Number(claim.value.refundAmount) || 0;
  }
  return total;
});

const getVisitTechName = (v: unknown): string | null => {
  if (v && typeof v === 'object' && 'technician' in v) {
    const t = (v as { technician: { fullName?: string } | null }).technician;
    return t?.fullName || null;
  }
  return null;
};

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

interface TimelineStage {
  id: string;
  title: string;
  time: string;
  actor: string;
  note: string;
  subnote?: string;
  proposal?: string;
  images?: string[];
  status: 'completed' | 'current' | 'pending';
}

const timelineStages = computed<TimelineStage[]>(() => {
  const c = claim.value;
  const d = detail.value;
  if (!c) return [];

  const stages: TimelineStage[] = [];

  // Stage 1: Tiếp nhận yêu cầu
  stages.push({
    id: 'stage-submitted',
    title: 'Tiếp nhận yêu cầu',
    time: date(c.submittedAt),
    actor: 'Hệ thống',
    note: `Khách hàng gửi yêu cầu bảo hành dịch vụ ${c.order.serviceName || 'sửa chữa'}.`,
    status: 'completed',
  });

  // Stage 2: Xác minh bảo hành
  stages.push({
    id: 'stage-verification',
    title: 'Xác minh bảo hành',
    time: date(c.submittedAt),
    actor: 'Quản lý dịch vụ',
    note: c.submittedAfterExpiry
      ? 'Yêu cầu được gửi sau khi hết hạn bảo hành theo chính sách.'
      : 'Đã xác minh yêu cầu đủ điều kiện bảo hành theo chính sách.',
    status: 'completed',
  });

  // Stage 3: Phân công kỹ thuật viên
  const assigned = !!c.technician;
  const isSubmittedState = c.status === 'submitted';
  stages.push({
    id: 'stage-assignment',
    title: 'Phân công kỹ thuật viên',
    time: assigned ? date(c.visit?.scheduledAt || c.submittedAt) : '—',
    actor: assigned ? (c.technician?.fullName || 'Kỹ thuật viên') : (isSubmittedState ? 'Quản lý dịch vụ' : '—'),
    note: assigned
      ? 'Phân công kỹ thuật viên xử lý bảo hành.'
      : (isSubmittedState ? 'Chờ phân công kỹ thuật viên.' : 'Chưa phân công kỹ thuật viên.'),
    status: assigned || !isSubmittedState ? 'completed' : 'current',
  });

  // Stage 4: Xử lý bảo hành
  const visit = c.visit || d?.visits?.[0];
  const hasVisitResult = !!(visit?.completedAt || visit?.proposedResult || visit?.findings || visit?.reServiceNotes);
  const isVisitActive = ['accepted', 'in_progress'].includes(c.status) && !hasVisitResult;
  const visitImages = [
    ...(visit?.evidenceRefs || []),
    ...(visit?.reServiceEvidenceRefs || []),
  ].filter(isSafeEvidenceLink);

  let visitNote = 'Chưa hoàn tất.';
  let visitProposal = '';
  let visitSubnote = '';
  if (hasVisitResult) {
    visitNote = visit?.reServiceNotes || visit?.findings || 'Đã hoàn thành kiểm tra và sửa chữa.';
    if (visit?.proposedResult) {
      visitProposal = `Đề xuất: ${resultLabel(visit.proposedResult)}`;
    }
    if (visit?.notCoveredReasonCode) {
      visitSubnote = `Lý do: ${reasonLabel(visit.notCoveredReasonCode)}`;
    }
  } else if (isVisitActive) {
    visitNote = 'Kỹ thuật viên đang kiểm tra và sửa chữa tại nhà khách.';
  }

  const visitCompleted = hasVisitResult || ['inspected', 'awaiting_customer', 'disputed', 'resolved', 'rejected'].includes(c.status);
  stages.push({
    id: 'stage-inspection',
    title: 'Xử lý bảo hành',
    time: visit?.completedAt ? date(visit.completedAt) : (visit?.checkedInAt ? date(visit.checkedInAt) : (visit?.scheduledAt ? date(visit.scheduledAt) : '—')),
    actor: c.technician?.fullName || getVisitTechName(visit) || '—',
    note: visitNote,
    proposal: visitProposal,
    subnote: visitSubnote,
    images: visitImages.length ? visitImages : undefined,
    status: visitCompleted ? 'completed' : (isVisitActive ? 'current' : 'pending'),
  });

  // Stage 5: Khách đồng ý, chờ đóng / Phản hồi khách hàng
  const customerAgreed = c.customerResponse === 'agreed';
  const customerDisputed = c.customerResponse === 'disputed';
  const isAwaitingOrInspected = ['inspected', 'awaiting_customer', 'disputed'].includes(c.status);

  let stage5Title = 'Khách đồng ý, chờ đóng';
  let stage5Actor = '—';
  let stage5Note = 'Chưa hoàn tất.';

  if (customerAgreed) {
    stage5Title = 'Khách đồng ý, chờ đóng';
    stage5Actor = 'Khách hàng';
    stage5Note = 'Khách hàng xác nhận kết quả xử lý và đồng ý hoàn tất (Khách phản hồi: Đồng ý).';
  } else if (customerDisputed) {
    stage5Title = 'Khách phản đối, chờ xem xét';
    stage5Actor = 'Khách hàng';
    stage5Note = 'Khách hàng phản đối kết luận bảo hành (Khách phản hồi: Phản đối).';
  } else if (c.status === 'awaiting_customer') {
    stage5Title = 'Chờ khách hàng phản hồi';
    stage5Actor = 'Khách hàng';
    stage5Note = 'Đang chờ khách hàng xác nhận kết quả xử lý.';
  } else if (c.status === 'inspected') {
    stage5Title = 'Chờ duyệt kết luận';
    stage5Actor = d?.decision?.reviewedBy?.fullName || 'Chưa duyệt';
    stage5Note = 'Kỹ thuật viên đã nộp kết luận; chờ Quản lý dịch vụ duyệt.';
  }

  stages.push({
    id: 'stage-customer-response',
    title: stage5Title,
    time: d?.decision?.customerRespondedAt ? date(d.decision.customerRespondedAt) : (d?.decision?.awaitingSince ? date(d.decision.awaitingSince) : (d?.decision?.reviewedAt ? date(d.decision.reviewedAt) : '—')),
    actor: stage5Actor,
    note: stage5Note,
    status: closed.value ? 'completed' : (isAwaitingOrInspected ? 'current' : 'pending'),
  });

  // Stage 6: Đã đóng
  const isResolved = c.status === 'resolved';
  const isRejected = c.status === 'rejected';
  let stage6Title = 'Đã đóng';
  let stage6Note = 'Chưa hoàn tất.';
  let stage6Actor = '—';

  if (isResolved) {
    stage6Title = 'Đã đóng';
    stage6Actor = d?.decision?.reviewedBy?.fullName || 'Quản lý dịch vụ';
    stage6Note = c.resolutionNotes || 'Đã hoàn tất bảo hành và đóng yêu cầu.';
  } else if (isRejected) {
    stage6Title = 'Không được bảo hành';
    stage6Actor = d?.decision?.reviewedBy?.fullName || 'Quản lý dịch vụ';
    stage6Note = `Từ chối bảo hành: ${reasonLabel(d?.decision?.finalReasonCode) || 'Không đủ điều kiện'}`;
  }

  stages.push({
    id: 'stage-closed',
    title: stage6Title,
    time: c.resolvedAt ? date(c.resolvedAt) : '—',
    actor: stage6Actor,
    note: stage6Note,
    status: closed.value ? 'completed' : 'pending',
  });

  return stages;
});

interface ActivityLogItem {
  id: string;
  category: 'status' | 'assignment' | 'inspection' | 'decision';
  title: string;
  description: string;
  time: string;
  rawTime: number;
  actor: string;
  icon: Component;
  iconBg: string;
  iconColor: string;
  dotColor: string;
  actorBadgeClass: string;
}

const activityLogs = computed<ActivityLogItem[]>(() => {
  const c = claim.value;
  const d = detail.value;
  if (!c) return [];

  const items: ActivityLogItem[] = [];
  const baseTime = new Date(c.submittedAt).getTime() || Date.now();

  // 1. Creation: Tiếp nhận yêu cầu
  items.push({
    id: 'act-submit',
    category: 'status',
    title: 'Tiếp nhận yêu cầu',
    description: `Khách hàng gửi yêu cầu bảo hành dịch vụ ${c.order.serviceName || 'sửa chữa'}.`,
    time: date(c.submittedAt),
    rawTime: baseTime,
    actor: 'Hệ thống',
    icon: PlusCircle,
    iconBg: 'bg-slate-100 text-slate-600',
    iconColor: 'text-slate-600',
    dotColor: 'bg-slate-400',
    actorBadgeClass: 'bg-slate-100 text-slate-700',
  });

  // 2. Xác minh bảo hành
  items.push({
    id: 'act-verify',
    category: 'decision',
    title: 'Xác minh bảo hành',
    description: c.submittedAfterExpiry
      ? 'Ghi nhận yêu cầu gửi sau khi hết hạn bảo hành theo chính sách.'
      : 'Đã xác minh yêu cầu đủ điều kiện bảo hành theo chính sách.',
    time: date(c.submittedAt),
    rawTime: baseTime + 1000,
    actor: 'Quản lý dịch vụ',
    icon: ShieldCheck,
    iconBg: 'bg-sky-50 text-sky-600',
    iconColor: 'text-sky-600',
    dotColor: 'bg-sky-500',
    actorBadgeClass: 'bg-sky-50 text-sky-700',
  });

  // 3. Phân công kỹ thuật viên
  if (c.technician) {
    const assignTime = c.visit?.scheduledAt ? new Date(c.visit.scheduledAt).getTime() : baseTime + 2000;
    items.push({
      id: 'act-assign',
      category: 'assignment',
      title: 'Phân công kỹ thuật viên',
      description: `Phân công "${c.technician.fullName}" xử lý yêu cầu bảo hành.`,
      time: date(c.visit?.scheduledAt || c.submittedAt),
      rawTime: assignTime,
      actor: 'Quản lý dịch vụ',
      icon: Users,
      iconBg: 'bg-purple-50 text-purple-600',
      iconColor: 'text-purple-600',
      dotColor: 'bg-purple-500',
      actorBadgeClass: 'bg-purple-50 text-purple-700',
    });
  }

  // 4. Thợ từ chối
  if (d?.declined) {
    const decTime = d.declined.at ? new Date(d.declined.at).getTime() : baseTime + 2500;
    items.push({
      id: 'act-declined',
      category: 'assignment',
      title: 'Kỹ thuật viên từ chối',
      description: `${d.declined.by?.fullName || 'Kỹ thuật viên'} từ chối nhận việc: ${d.declined.note || reasonLabel(d.declined.reasonCode)}. Quản lý xét: ${c.declineReview ? (declineReviewLabels[c.declineReview] ?? c.declineReview) : 'Chờ quản lý xét'}.`,
      time: date(d.declined.at),
      rawTime: decTime,
      actor: d.declined.by?.fullName || 'Kỹ thuật viên',
      icon: AlertCircle,
      iconBg: 'bg-rose-50 text-rose-600',
      iconColor: 'text-rose-600',
      dotColor: 'bg-rose-500',
      actorBadgeClass: 'bg-rose-50 text-rose-700',
    });
  }

  // 5. Kết quả kiểm tra / xử lý bảo hành
  const visit = c.visit || d?.visits?.[0];
  if (visit && (visit.completedAt || visit.findings || visit.proposedResult || visit.reServiceNotes)) {
    const vTime = visit.completedAt ? new Date(visit.completedAt).getTime() : (visit.checkedInAt ? new Date(visit.checkedInAt).getTime() : baseTime + 3000);
    const resultDesc = visit.reServiceNotes || visit.findings || 'Kỹ thuật viên xác nhận đã hoàn thành kiểm tra và sửa chữa.';
    items.push({
      id: 'act-inspection',
      category: 'inspection',
      title: 'Cập nhật kết quả xử lý',
      description: resultDesc,
      time: date(visit.completedAt || visit.checkedInAt || visit.scheduledAt),
      rawTime: vTime,
      actor: c.technician?.fullName || getVisitTechName(visit) || 'Kỹ thuật viên',
      icon: Wrench,
      iconBg: 'bg-blue-50 text-blue-600',
      iconColor: 'text-blue-600',
      dotColor: 'bg-blue-500',
      actorBadgeClass: 'bg-blue-50 text-blue-700',
    });
  }

  // 6. Quản lý duyệt kết luận
  if (d?.decision?.reviewedAt) {
    const revTime = new Date(d.decision.reviewedAt).getTime();
    items.push({
      id: 'act-review',
      category: 'decision',
      title: 'Duyệt kết luận bảo hành',
      description: `Quản lý ${d.decision.reviewedBy?.fullName || ''} duyệt: ${resultLabel(d.decision.finalResult)}${d.decision.smOverrodeProposal ? ' (Quản lý đã đổi kết luận so với đề xuất)' : ''}.`,
      time: date(d.decision.reviewedAt),
      rawTime: revTime,
      actor: d.decision.reviewedBy?.fullName || 'Quản lý dịch vụ',
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600',
      iconColor: 'text-emerald-600',
      dotColor: 'bg-emerald-500',
      actorBadgeClass: 'bg-emerald-50 text-emerald-700',
    });
  }

  // 7. Khách hàng phản hồi
  if (c.customerResponse || d?.decision?.customerRespondedAt) {
    const respTime = d?.decision?.customerRespondedAt ? new Date(d.decision.customerRespondedAt).getTime() : baseTime + 4000;
    items.push({
      id: 'act-cust-response',
      category: 'status',
      title: 'Khách hàng phản hồi',
      description: c.customerResponse === 'agreed'
        ? 'Khách hàng xác nhận kết quả xử lý và đồng ý hoàn tất (Đồng ý).'
        : 'Khách hàng phản đối kết luận bảo hành (Phản đối).',
      time: date(d?.decision?.customerRespondedAt),
      rawTime: respTime,
      actor: 'Khách hàng',
      icon: User,
      iconBg: 'bg-sky-50 text-sky-600',
      iconColor: 'text-sky-600',
      dotColor: 'bg-sky-500',
      actorBadgeClass: 'bg-sky-50 text-sky-700',
    });
  }

  // 8. Cập nhật trạng thái
  if (c.status !== 'submitted') {
    const stTime = c.resolvedAt ? new Date(c.resolvedAt).getTime() : (d?.decision?.customerRespondedAt ? new Date(d.decision.customerRespondedAt).getTime() + 100 : baseTime + 5000);
    const prevStatusLabel = c.customerResponse === 'agreed' ? 'Xử lý bảo hành' : 'Đã gửi yêu cầu';
    items.push({
      id: 'act-status-update',
      category: 'status',
      title: 'Cập nhật trạng thái',
      description: `Thay đổi trạng thái từ "${prevStatusLabel}" sang "${meta.value?.label || c.status}".`,
      time: date(d?.decision?.customerRespondedAt || d?.decision?.reviewedAt || c.resolvedAt || c.submittedAt),
      rawTime: stTime,
      actor: c.customerResponse === 'agreed' ? 'Khách hàng' : (d?.decision?.reviewedBy?.fullName || 'Quản lý dịch vụ'),
      icon: Check,
      iconBg: 'bg-emerald-50 text-emerald-600',
      iconColor: 'text-emerald-600',
      dotColor: 'bg-emerald-500',
      actorBadgeClass: 'bg-emerald-50 text-emerald-700',
    });
  }

  // 9. Đóng đơn
  if (c.resolvedAt) {
    const resTime = new Date(c.resolvedAt).getTime();
    items.push({
      id: 'act-close',
      category: 'decision',
      title: 'Đóng yêu cầu bảo hành',
      description: c.resolutionNotes || (c.status === 'resolved' ? ('Hoàn tất bảo hành' + (c.outcomeCode ? ': ' + claimOutcomeLabels[c.outcomeCode] : '') + ' và đóng yêu cầu.') : 'Từ chối bảo hành và đóng yêu cầu.'),
      time: date(c.resolvedAt),
      rawTime: resTime,
      actor: d?.decision?.reviewedBy?.fullName || 'Quản lý dịch vụ',
      icon: Check,
      iconBg: 'bg-emerald-50 text-emerald-600',
      iconColor: 'text-emerald-600',
      dotColor: 'bg-emerald-500',
      actorBadgeClass: 'bg-emerald-50 text-emerald-700',
    });
  }

  return items.sort((a, b) => b.rawTime - a.rawTime);
});

const filteredActivities = computed(() => {
  if (activityFilter.value === 'all') return activityLogs.value;
  return activityLogs.value.filter((item) => item.category === activityFilter.value);
});

onMounted(load);
</script>

<template>
  <div class="w-full space-y-6 pb-12">
    <!-- Skeleton loader -->
    <div v-if="loading && !claim" class="space-y-4" aria-busy="true">
      <FhSkeleton height="14px" width="140px" />
      <FhSkeleton height="28px" width="320px" />
      <FhSkeleton height="96px" :count="3" rounded="md" />
    </div>

    <!-- Error state -->
    <template v-else-if="error && !claim">
      <nav class="flex items-center gap-1.5 text-xs text-ink-500 mb-2">
        <router-link to="/console/warranty" class="inline-flex items-center gap-1 hover:text-brand-700 transition-colors">
          <Home :size="13" class="text-ink-400" />
          <span>Bảo hành</span>
        </router-link>
        <ChevronRight :size="12" class="text-ink-300" />
        <span class="text-ink-700 font-medium">Chi tiết đơn bảo hành</span>
      </nav>
      <ConsoleLoadError :message="error" @retry="load" />
    </template>

    <!-- Main content -->
    <template v-else-if="claim && detail && meta">
      <!-- Breadcrumb navigation matching sample image -->
      <nav class="flex items-center gap-1.5 text-xs text-ink-500" aria-label="Breadcrumb">
        <router-link to="/console/warranty" class="inline-flex items-center gap-1 hover:text-brand-700 transition-colors">
          <Home :size="13" class="text-ink-400" />
          <span>Bảo hành</span>
        </router-link>
        <ChevronRight :size="12" class="text-ink-300" />
        <span class="text-ink-700 font-medium">Chi tiết đơn bảo hành</span>
      </nav>

      <!-- Main Header Card -->
      <div class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <!-- Left: Service Icon + Title + Meta -->
          <div class="flex items-start gap-4 min-w-0">
            <div class="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50/60 border border-blue-100/80 overflow-hidden p-1 shadow-2xs">
              <img
                v-if="!artworkError"
                :src="serviceArtwork"
                :alt="claim.order.serviceName"
                class="h-full w-full object-contain select-none pointer-events-none drop-shadow-xs"
                loading="lazy"
                @error="artworkError = true"
              />
              <component
                v-else
                :is="serviceIcon"
                :size="24"
                class="text-blue-600"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2.5">
                <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-ink-900 truncate">
                  {{ claim.order.serviceName || 'Bảo hành dịch vụ' }}
                </h1>
                <span class="inline-flex items-center rounded-md bg-ink-100 px-2.5 py-0.5 font-num text-xs font-semibold text-ink-700">
                  #{{ claim.order.code || claim.id.slice(0, 8) }}
                </span>
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold whitespace-nowrap"
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
              </div>
              <p class="mt-1.5 text-xs sm:text-sm text-ink-500">
                Yêu cầu bảo hành cho dịch vụ {{ claim.order.serviceName || 'dịch vụ' }} · Tạo lúc <span class="font-num">{{ date(claim.submittedAt) }}</span>
              </p>
            </div>
          </div>

          <!-- Right: Action button & more menu -->
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

        <!-- Notification alerts -->
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
            Máy chủ chưa gửi đủ thông tin chi tiết (đơn gốc, lượt kiểm tra, quyết định). Đang hiện phần có sẵn; cập nhật Backend để xem đầy đủ.
          </div>
        </Transition>

        <!-- 3 Tabs Navigation -->
        <div class="mt-6 border-b border-ink-200">
          <div class="flex gap-8 overflow-x-auto scrollbar-none" role="tablist" aria-label="Phân loại thông tin">
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
              :aria-selected="activeTab === 'timeline'"
              class="-mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="activeTab === 'timeline' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'"
              @click="activeTab = 'timeline'"
            >
              <Clock :size="16" />
              <span>Lịch sử xử lý</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'logs'"
              class="-mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="activeTab === 'logs' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'"
              @click="activeTab = 'logs'"
            >
              <FileText :size="16" />
              <span>Nhật ký</span>
            </button>
          </div>
        </div>
      </div>

      <!-- TAB 1: THÔNG TIN CHUNG (Image 1) -->
      <div v-show="activeTab === 'general'" class="space-y-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- Card 1: Thông tin khách hàng -->
          <div class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
            <div class="mb-4 flex items-center gap-2.5">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <User :size="15" />
              </div>
              <h2 class="text-sm font-bold text-ink-900">Thông tin khách hàng</h2>
            </div>
            <dl class="space-y-3.5 text-sm">
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
                    class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                    title="Gọi điện thoại"
                  >
                    <Phone :size="12" />
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

          <!-- Card 2: Thông tin bảo hành -->
          <div class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
            <div class="mb-4 flex items-center gap-2.5">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ShieldCheck :size="15" />
              </div>
              <h2 class="text-sm font-bold text-ink-900">Thông tin bảo hành</h2>
            </div>
            <dl class="space-y-3.5 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Thời hạn bảo hành</dt>
                <dd class="font-num font-medium text-ink-900">{{ warrantyDurationText }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-ink-500">Còn hiệu lực</dt>
                <dd>
                  <span
                    v-if="remainingDays !== null && remainingDays > 0"
                    class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
                  >
                    <Check :size="13" /> Còn {{ remainingDays }} ngày
                  </span>
                  <span
                    v-else-if="detail.coverage?.status === 'active'"
                    class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
                  >
                    <Check :size="13" /> Còn hiệu lực
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
                  >
                    <AlertCircle :size="13" /> Hết hạn
                  </span>
                </dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="shrink-0 text-ink-500">Phạm vi bảo hành</dt>
                <dd class="text-right text-ink-900 text-pretty">
                  {{ claim.coverage?.itemDescription || 'Sửa chữa miễn phí (không bao gồm thay thế linh kiện)' }}
                </dd>
              </div>
              <div v-if="detail.coverage" class="flex items-center justify-between gap-3 text-xs">
                <dt class="text-ink-500">Trạng thái bảo hành</dt>
                <dd class="font-medium text-ink-700">{{ coverageStatusLabels[detail.coverage.status] ?? detail.coverage.status }}</dd>
              </div>
            </dl>
            <div v-if="detail.otherClaims.length" class="mt-4 border-t border-ink-100 pt-3">
              <div class="mb-1.5 text-xs font-semibold text-ink-500">Yêu cầu khác của đơn này</div>
              <ul class="space-y-1 text-xs">
                <li v-for="other in detail.otherClaims" :key="other.id" class="flex flex-wrap items-center justify-between gap-2">
                  <router-link :to="`/console/warranty/${other.id}`" class="font-medium text-brand-700 hover:underline">
                    Yêu cầu bảo hành
                  </router-link>
                  <span class="text-ink-500">{{ claimDisplayMeta(other).label }} · <span class="font-num">{{ date(other.submittedAt) }}</span></span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Card 3: Đơn sửa chữa liên quan (Gộp cả thông tin đơn, chi phí bảo hành, hạng mục sửa chữa & ảnh) -->
        <div class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
          <div class="mb-4 flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Wrench :size="15" />
            </div>
            <h2 class="text-sm font-bold text-ink-900">Đơn sửa chữa liên quan</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm pb-4 border-b border-ink-100">
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Mã đơn</span>
              <router-link :to="`/console/orders/${claim.order.id}`" class="inline-flex items-center gap-1 font-num font-semibold text-brand-700 hover:underline">
                #{{ claim.order.code }}
                <ExternalLink :size="13" />
              </router-link>
            </div>
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Kỹ thuật viên</span>
              <span class="inline-flex items-center gap-1 font-medium text-ink-900">
                <User :size="13" class="text-ink-400" />
                {{ originalTechName }}
              </span>
            </div>
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Dịch vụ</span>
              <span class="inline-flex items-center gap-1.5 font-medium text-ink-900 truncate">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50/60 p-0.5 overflow-hidden">
                  <img
                    :src="serviceArtwork"
                    :alt="claim.order.serviceName"
                    class="h-full w-full object-contain"
                    loading="lazy"
                  />
                </span>
                <span class="truncate">{{ claim.order.serviceName }}</span>
              </span>
            </div>
            <div class="flex items-center justify-between sm:justify-start sm:gap-4">
              <span class="text-ink-500">Ngày hoàn thành</span>
              <span class="font-num font-medium text-ink-900">{{ date(detail.originalJob.completedAt) }}</span>
            </div>
          </div>

          <!-- Bảng tổng chi phí bảo hành (nếu có) được gộp vào đây -->
          <div class="mt-4 rounded-xl bg-slate-50/80 border border-slate-100 p-4">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-sm font-medium text-ink-600">
                <CreditCard :size="15" class="text-ink-400" />
                Tổng chi phí bảo hành (nếu có)
              </span>
              <span class="font-num text-lg font-bold text-ink-900">
                <FhMoney :amount="totalWarrantyCost" />
              </span>
            </div>

            <!-- Part Request details if present -->
            <div v-if="detail.partRequest" class="mt-3 border-t border-ink-100 pt-2.5 text-xs text-ink-600 space-y-2">
              <div class="flex justify-between gap-2">
                <span class="text-ink-500">Kiểm tra linh kiện hỏng:</span>
                <span class="font-medium text-ink-900">
                  {{ detail.partRequest.faultyInspectionResult ? faultyInspectionLabels[detail.partRequest.faultyInspectionResult] : 'Chưa kiểm tra' }}
                </span>
              </div>
              <div class="flex justify-between gap-2" data-testid="faulty-return-state">
                <span class="inline-flex items-center gap-1 text-ink-500">
                  <PackageCheck :size="13" />
                  Thợ nộp linh kiện hỏng:
                </span>
                <span class="font-medium text-ink-900">{{ faultyReturnLabel }}</span>
              </div>
              <div v-if="detail.partRequest.faultyInspectionResult" class="flex justify-between gap-2">
                <span class="text-ink-500">Người trả tiền:</span>
                <span class="font-medium text-ink-900">{{ detail.partRequest.chargeTechnician ? 'Kỹ thuật viên' : 'FixHome' }}</span>
              </div>
              <p v-if="detail.partRequest.faultyInspectionNote" class="text-ink-700 text-pretty">
                {{ detail.partRequest.faultyInspectionNote }}
              </p>
              <ul v-if="detail.partRequest.items.length" class="divide-y divide-ink-100 border-t border-ink-100 pt-2">
                <li v-for="item in detail.partRequest.items" :key="item.id" class="flex justify-between py-1">
                  <span class="inline-flex items-center gap-1">
                    <Boxes :size="12" class="text-ink-400" />
                    {{ item.name }} <span class="font-num text-ink-500">× {{ item.quantity }}</span>
                  </span>
                  <span class="font-num"><FhMoney :amount="item.unitPrice * item.quantity" /></span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Hạng mục sửa chữa & ảnh đơn gốc -->
          <details v-if="claim.detailLoaded || orderPhotos.length" class="group mt-4 border-t border-ink-100 pt-3" open>
            <summary class="flex cursor-pointer select-none items-center justify-between py-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
              <span class="inline-flex items-center gap-1.5">
                <Receipt :size="13" />
                Hạng mục sửa chữa & ảnh đơn gốc (thanh toán: {{ paymentStatusLabels[detail.originalJob.paymentStatus] ?? detail.originalJob.paymentStatus }})
              </span>
              <ChevronDown :size="14" class="text-ink-400 transition-transform group-open:rotate-180" />
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
                          Thợ báo hỏng{{ line.faultyQuantity && line.faultyQuantity !== line.quantity ? ` ${line.faultyQuantity}/${line.quantity}` : "" }}
                        </span>
                        <span class="block text-[11px] text-ink-500">{{ invoiceLineTypeLabels[line.type] ?? line.type }}</span>
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
              <div class="flex gap-1.5"><dt class="text-ink-500 font-semibold">Tổng:</dt><dd class="font-num font-semibold"><FhMoney :amount="detail.originalJob.grandTotal" /></dd></div>
            </dl>
            <div v-if="orderPhotos.length" class="mt-3 border-t border-ink-100 pt-2.5">
              <div class="mb-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                <Image :size="13" />
                Ảnh trước và sau khi sửa
              </div>
              <div class="flex flex-wrap gap-2">
                <a v-for="item in orderPhotos" :key="item.id" :href="item.mediaUrl" target="_blank" rel="noopener noreferrer">
                  <img :src="item.mediaUrl" :alt="item.type === 'before' ? 'Ảnh trước khi sửa' : 'Ảnh sau khi sửa'" class="h-14 w-14 rounded-md border border-ink-200 object-cover" />
                </a>
              </div>
            </div>
          </details>
        </div>

        <!-- Card 5: Nội dung yêu cầu (Full Width) -->
        <div class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
          <div class="mb-4 flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <MessageSquare :size="15" />
            </div>
            <h2 class="text-sm font-bold text-ink-900">Nội dung yêu cầu</h2>
          </div>
          <p class="whitespace-pre-line text-sm leading-relaxed text-ink-800 text-pretty">
            {{ claim.description }}
          </p>
          <div v-if="claim.evidenceRefs?.length" class="mt-4 flex flex-wrap gap-3">
            <a
              v-for="url in claim.evidenceRefs"
              :key="url"
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              class="group relative overflow-hidden rounded-xl border border-ink-200 shadow-2xs transition-shadow hover:shadow-xs"
            >
              <img :src="url" alt="Ảnh yêu cầu bảo hành" class="h-20 w-24 object-cover transition-transform group-hover:scale-105" />
            </a>
          </div>
        </div>
      </div>

      <!-- TAB 2: LỊCH SỬ XỬ LÝ (Image 2) -->
      <div v-show="activeTab === 'timeline'" class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
        <div class="mb-6 flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Layers :size="15" />
          </div>
          <h2 class="text-sm font-bold text-ink-900">Lịch sử xử lý</h2>
        </div>

        <div class="space-y-6">
          <div
            v-for="(stage, index) in timelineStages"
            :key="stage.id"
            class="relative pl-8 pb-6 last:pb-0"
          >
            <!-- Vertical connecting line -->
            <div
              v-if="index < timelineStages.length - 1"
              class="absolute left-3.5 top-6 -bottom-1 w-0.5"
              :class="stage.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-200'"
              aria-hidden="true"
            />

            <!-- Timeline node icon -->
            <div
              class="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              :class="[
                stage.status === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : stage.status === 'current'
                    ? 'border-2 border-brand-600 bg-white ring-4 ring-brand-100 text-brand-600'
                    : 'border-2 border-slate-300 bg-white text-slate-300'
              ]"
            >
              <Check v-if="stage.status === 'completed'" :size="14" stroke-width="3" />
              <span v-else-if="stage.status === 'current'" class="h-2 w-2 rounded-full bg-brand-600" />
            </div>

            <!-- Content Row (3 columns layout matching Image 2) -->
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-start">
              <!-- Column 1: Step title & timestamp (md:col-span-3) -->
              <div class="md:col-span-3">
                <div
                  class="text-sm font-semibold"
                  :class="stage.status === 'current' ? 'text-brand-700 font-bold' : stage.status === 'completed' ? 'text-ink-900' : 'text-ink-500'"
                >
                  {{ stage.title }}
                </div>
                <div class="mt-0.5 font-num text-xs text-ink-500">
                  {{ stage.time }}
                </div>
              </div>

              <!-- Column 2: Performer with User icon (md:col-span-3) -->
              <div class="md:col-span-3 flex items-center gap-1.5 text-xs text-ink-700">
                <User :size="13" class="shrink-0 text-ink-400" />
                <span class="truncate">{{ stage.actor }}</span>
              </div>

              <!-- Column 3: Result / Notes description box (md:col-span-6) -->
              <div class="md:col-span-6">
                <div
                  class="rounded-xl p-3.5 text-xs sm:text-sm leading-relaxed"
                  :class="[
                    stage.status === 'current'
                      ? 'border border-brand-200/70 bg-brand-50/60 font-medium text-brand-900 shadow-2xs'
                      : stage.status === 'completed'
                        ? 'border border-slate-100 bg-slate-50/80 text-ink-800'
                        : 'border border-dashed border-slate-200 bg-slate-50/40 text-ink-400'
                  ]"
                >
                  <p class="whitespace-pre-line text-pretty">{{ stage.note }}</p>
                  <p v-if="stage.proposal" class="mt-1 font-medium text-ink-900">{{ stage.proposal }}</p>
                  <p v-if="stage.subnote" class="mt-0.5 text-xs text-ink-600">{{ stage.subnote }}</p>
                  <!-- Attached evidence images if available -->
                  <div v-if="stage.images?.length" class="mt-3 flex flex-wrap gap-2">
                    <a
                      v-for="img in stage.images"
                      :key="img"
                      :href="img"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group overflow-hidden rounded-lg border border-ink-200 transition-opacity hover:opacity-90"
                    >
                      <img :src="img" alt="Bằng chứng xử lý bảo hành" class="h-14 w-16 object-cover" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Additional visits if multiple, ensuring compatibility -->
        <div v-if="detail.visits.length > 1" class="mt-6 border-t border-ink-100 pt-4">
          <div class="mb-3 text-xs font-semibold text-ink-500">Các lượt kiểm tra khác</div>
          <div class="space-y-3">
            <div
              v-for="(visit, idx) in detail.visits.slice(1)"
              :key="visit.id"
              :data-testid="`warranty-visit-${visit.id}`"
              class="rounded-lg border border-ink-100 bg-slate-50 p-3 text-xs"
            >
              <div class="flex items-center justify-between font-semibold text-ink-900">
                <span>Lượt {{ idx + 2 }} · {{ visit.technician?.fullName || '—' }}</span>
                <span class="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                  {{ visitStatusLabels[visit.status] ?? visit.status }}
                </span>
              </div>
              <p v-if="visit.findings" class="mt-1 text-ink-700">{{ visit.findings }}</p>
            </div>
          </div>
        </div>

        <!-- Manager overrides notice -->
        <div v-if="detail.decision.smOverrodeProposal" class="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
          Quản lý đã đổi kết luận so với đề xuất của kỹ thuật viên.
        </div>
      </div>

      <!-- TAB 3: NHẬT KÝ (Image 3) -->
      <div v-show="activeTab === 'logs'" class="rounded-xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <!-- Left: Icon + Title + Subtitle -->
          <div class="flex items-start gap-3">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText :size="16" />
            </div>
            <div>
              <h2 class="text-sm font-bold text-ink-900">Nhật ký hoạt động</h2>
              <p class="text-xs text-ink-500">Ghi lại toàn bộ thao tác và thay đổi liên quan đến yêu cầu bảo hành.</p>
            </div>
          </div>

          <!-- Right: Activity filter dropdown -->
          <div class="relative">
            <select
              v-model="activityFilter"
              class="appearance-none inline-flex h-9 pl-8 pr-8 items-center rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              aria-label="Lọc nhật ký hoạt động"
            >
              <option value="all">Tất cả hoạt động</option>
              <option value="status">Trạng thái</option>
              <option value="assignment">Phân công</option>
              <option value="inspection">Kiểm tra & xử lý</option>
              <option value="decision">Quyết định</option>
            </select>
            <Filter :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        <!-- Activity Log List (Image 3 layout) -->
        <div class="space-y-4">
          <div
            v-for="(item, index) in filteredActivities"
            :key="item.id"
            class="relative pl-6 pb-4 last:pb-0"
          >
            <!-- Vertical connecting line -->
            <div
              v-if="index < filteredActivities.length - 1"
              class="absolute left-2.5 top-5 -bottom-2 w-px bg-slate-200"
              aria-hidden="true"
            />
            <!-- Dot -->
            <div
              class="absolute left-1.5 top-3.5 h-2 w-2 rounded-full border border-white"
              :class="item.dotColor"
            />

            <!-- Item card -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-2xs transition-colors hover:border-slate-200">
              <div class="flex items-start gap-3 min-w-0">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="item.iconBg">
                  <component :is="item.icon" :size="16" :class="item.iconColor" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-ink-900">{{ item.title }}</div>
                  <div class="mt-0.5 text-xs text-ink-600 line-clamp-2 text-pretty">{{ item.description }}</div>
                </div>
              </div>

              <!-- Time & Actor -->
              <div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
                <div class="flex items-center gap-1 font-num text-xs text-ink-500 whitespace-nowrap">
                  <Calendar :size="13" class="text-ink-400" />
                  <span>{{ item.time }}</span>
                </div>
                <div class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" :class="item.actorBadgeClass">
                  <User :size="12" />
                  <span>{{ item.actor }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="!filteredActivities.length" class="py-8 text-center text-sm text-ink-500">
            Không có hoạt động nào phù hợp với bộ lọc.
          </div>
        </div>
      </div>
    </template>

    <!-- Modal for decision (Assign, Approve, Close, Review Decline, Reject) -->
    <WarrantyDecisionModal
      v-if="claim"
      :claim="modalMode ? claim : null"
      :mode="modalMode"
      :technicians="technicians"
      @close="modalMode = null"
      @done="onDone"
    />
  </div>
</template>
