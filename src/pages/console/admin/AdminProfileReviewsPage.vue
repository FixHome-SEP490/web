<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplets,
  FileBadge,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Phone,
  Plug,
  RotateCcw,
  Search,
  ShieldAlert,
  Snowflake,
  Tv,
  Video,
  Wrench,
  X,
  XCircle,
} from 'lucide-vue-next';
import { FhButton, FhConfirmDialog, FhSkeleton, FhStatusPill } from '../../../components';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import { CONSOLE_LOAD_ERROR, consoleTextarea } from '../../../components/console/console-ui';
import { reviewStageLabel } from '../../../components/console/console-labels';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateTimeString } from '../../../utils/vn-time';
import { adminVerificationsApi } from '../../../api/admin-verifications.api';
import { adminSkillVerificationsApi } from '../../../api/admin-skill-verifications.api';
import {
  adminOfficeVisitsApi,
  type ProfileReviewDetail,
  type ProfileReviewEvidence,
  type ProfileReviewRow,
  type ReviewStage,
} from '../../../api/admin-office-visits.api';
import ProfileSkillGroups from '../../../components/console/ProfileSkillGroups.vue';
import { useCanDecideReview } from '../../../composables/useCanDecideReview';

const router = useRouter();
const canDecide = useCanDecideReview();

// Duyệt hồ sơ cuối: thợ đã được xác nhận danh tính và (sau khi gặp trực tiếp) admin kiểm bằng cấp, xác nhận cấp độ rồi duyệt.
const rows = ref<ProfileReviewRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const successMessage = ref('');
const busy = ref(false);

// Stats cards counters computed across all actual data rows
const stats = computed(() => {
  let waitingBooking = 0;
  let booked = 0;
  let waitingSkillApproval = 0;

  for (const r of rows.value) {
    if (r.stage === 'profile_review' || r.visit?.status === 'attended') {
      waitingSkillApproval++;
    } else if (r.stage === 'visit_scheduled' || r.visit?.status === 'scheduled') {
      booked++;
    } else {
      waitingBooking++;
    }
  }

  return {
    waitingBooking,
    booked,
    waitingSkillApproval,
  };
});

// Search and filters
const searchQuery = ref('');
const stageFilter = ref<'ALL' | ReviewStage>('ALL');
const appointmentFilter = ref<'ALL' | 'HAS_VISIT' | 'NO_VISIT'>('ALL');
const activeCardFilter = ref<'ALL' | 'WAITING_BOOKING' | 'BOOKED' | 'WAITING_SKILL'>('ALL');

const hasFilters = computed(
  () =>
    Boolean(searchQuery.value.trim()) ||
    stageFilter.value !== 'ALL' ||
    appointmentFilter.value !== 'ALL' ||
    activeCardFilter.value !== 'ALL',
);

const resetFilters = () => {
  searchQuery.value = '';
  stageFilter.value = 'ALL';
  appointmentFilter.value = 'ALL';
  activeCardFilter.value = 'ALL';
  page.value = 1;
};

const filterByCard = (type: 'WAITING_BOOKING' | 'BOOKED' | 'WAITING_SKILL') => {
  if (activeCardFilter.value === type) {
    activeCardFilter.value = 'ALL';
    stageFilter.value = 'ALL';
    appointmentFilter.value = 'ALL';
  } else {
    activeCardFilter.value = type;
    if (type === 'WAITING_BOOKING') {
      stageFilter.value = 'ALL';
      appointmentFilter.value = 'NO_VISIT';
    } else if (type === 'BOOKED') {
      stageFilter.value = 'ALL';
      appointmentFilter.value = 'HAS_VISIT';
    } else if (type === 'WAITING_SKILL') {
      stageFilter.value = 'profile_review';
      appointmentFilter.value = 'ALL';
    }
  }
  page.value = 1;
};

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    // Card active filter
    if (activeCardFilter.value === 'WAITING_BOOKING') {
      const isWaiting = r.stage === 'visit_required' || (!r.visit && r.stage !== 'profile_review' && r.stage !== 'visit_scheduled');
      if (!isWaiting) return false;
    } else if (activeCardFilter.value === 'BOOKED') {
      const isBooked = r.stage === 'visit_scheduled' || Boolean(r.visit && r.visit.status === 'scheduled');
      if (!isBooked) return false;
    } else if (activeCardFilter.value === 'WAITING_SKILL') {
      const isWaitingSkill = r.stage === 'profile_review' || Boolean(r.visit && r.visit.status === 'attended');
      if (!isWaitingSkill) return false;
    }

    // Dropdown Stage filter
    if (stageFilter.value !== 'ALL' && r.stage !== stageFilter.value) return false;

    // Dropdown Appointment filter
    if (appointmentFilter.value === 'HAS_VISIT' && !r.visit) return false;
    if (appointmentFilter.value === 'NO_VISIT' && r.visit) return false;

    // Search query
    if (!q) return true;
    return [r.fullName, r.phoneNumber, r.email, r.visit?.officeName].some((v) =>
      String(v ?? '').toLowerCase().includes(q),
    );
  });
});

// Pagination
const page = ref(1);
const pageSize = ref(10);
const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)));
const paginatedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

watch([searchQuery, stageFilter, appointmentFilter], () => {
  if (activeCardFilter.value !== 'ALL') {
    activeCardFilter.value = 'ALL';
  }
  page.value = 1;
});

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    rows.value = await adminOfficeVisitsApi.listReviews();
  } catch (reason) {
    rows.value = [];
    loadError.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
};
onMounted(() => void load());

const stageTone = (stage: ReviewStage | null) =>
  stage === 'profile_review' ? 'PENDING_APPROVAL' : stage === 'visit_blocked' || stage === 'profile_rejected' ? 'REJECTED' : 'PENDING';

const formatTime = (value: string | null | undefined) => (value ? vnDateTimeString(new Date(value)) : '—');

const formatAppointmentDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes}, ${day}/${month}/${year}`;
};

const getInitials = (name?: string | null): string => {
  if (!name) return 'KT';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0].toUpperCase() === 'QA') return 'QA';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getSkillIcon = (name: string) => {
  const s = name.toLowerCase();
  if (s.includes('lạnh') || s.includes('điều hòa') || s.includes('tủ lạnh')) return Snowflake;
  if (s.includes('nước') || s.includes('ống') || s.includes('bồn')) return Droplets;
  if (s.includes('thiết bị') || s.includes('gia dụng') || s.includes('bếp') || s.includes('lò')) return Tv;
  if (s.includes('điện') || s.includes('dây')) return Plug;
  return Wrench;
};

const getPrimarySkill = (row: ProfileReviewRow) => {
  const explicit = (row as unknown as { primarySkill?: string }).primarySkill ||
    (row as unknown as { skills?: Array<{ serviceName?: string }> }).skills?.[0]?.serviceName;
  if (explicit) {
    return { name: explicit, icon: getSkillIcon(explicit) };
  }
  return { name: 'Hồ sơ kỹ thuật', icon: Wrench };
};

const getStageDotTone = (stage: ReviewStage | null) => {
  if (stage === 'visit_scheduled' || stage === 'approved') return 'bg-emerald-500';
  if (stage === 'profile_review') return 'bg-blue-500';
  if (stage === 'profile_rejected' || stage === 'visit_blocked' || stage === 'identity_rejected') return 'bg-rose-500';
  return 'bg-amber-500';
};

const getProfileStatusBadge = (row: ProfileReviewRow) => {
  if (row.stage === 'profile_review' || row.visit?.status === 'attended') {
    return {
      label: 'Chờ duyệt kỹ năng',
      tone: 'blue' as const,
      icon: Award,
    };
  }
  if (row.stage === 'visit_scheduled' || row.visit?.status === 'scheduled') {
    return {
      label: 'Đã xác nhận lịch',
      tone: 'emerald' as const,
      icon: CheckCircle2,
    };
  }
  if (row.stage === 'profile_rejected') {
    return {
      label: 'Hồ sơ bị từ chối',
      tone: 'rose' as const,
      icon: XCircle,
    };
  }
  if (row.stage === 'visit_blocked') {
    return {
      label: 'Bị khóa đặt lịch',
      tone: 'rose' as const,
      icon: AlertTriangle,
    };
  }
  if (row.stage === 'approved') {
    return {
      label: 'Đã duyệt',
      tone: 'emerald' as const,
      icon: CheckCircle2,
    };
  }
  return {
    label: 'Chờ đặt lịch',
    tone: 'amber' as const,
    icon: ShieldAlert,
  };
};

const statusBadgeClasses = (tone: 'amber' | 'blue' | 'emerald' | 'rose') => {
  switch (tone) {
    case 'blue':
      return 'border border-blue-200 bg-blue-50 text-blue-700';
    case 'emerald':
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'rose':
      return 'border border-rose-200 bg-rose-50 text-rose-700';
    case 'amber':
    default:
      return 'border border-amber-200 bg-amber-50 text-amber-700';
  }
};

const goToOfficeVisits = () => {
  void router?.push('/console/office-visits');
};

const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    successMessage.value = `Đã sao chép ${label}.`;
    setTimeout(() => {
      if (successMessage.value.includes(label)) successMessage.value = '';
    }, 3000);
  } catch {
    error.value = `Không thể sao chép ${label}.`;
  }
};

// ---- Chi tiết hồ sơ & Sửa lỗi Loading riêng theo từng dòng ----
const detail = ref<ProfileReviewDetail | null>(null);
const loadingProfileId = ref<string | null>(null);
let latestDetailRequestId = 0;

const decisions = reactive<Record<string, { level: string; approved: boolean; reason: string }>>({});
const showReasonErrors = ref(false);
const changeDecisions = (ids: string[], patch: Partial<{ level: string; approved: boolean; reason: string }>) => {
  for (const id of ids) if (decisions[id]) Object.assign(decisions[id], patch);
};
const documentUrls = ref<Record<string, string>>({});
const isLoadingUrls = ref(false);

const attendedVisit = computed(() => detail.value?.visits.find((v) => v.status === 'attended') ?? null);
const scheduledVisit = computed(() => detail.value?.visits.find((v) => v.status === 'scheduled') ?? null);

const detailDocuments = computed(() => detail.value?.documents ?? []);
const frontIdDoc = computed(() => detailDocuments.value.find((d) => d.documentType.toLowerCase() === 'citizen_id_front'));
const backIdDoc = computed(() => detailDocuments.value.find((d) => d.documentType.toLowerCase() === 'citizen_id_back'));
const facePhotoDoc = computed(() => detailDocuments.value.find((d) => d.documentType.toLowerCase() === 'face_photo'));
const faceVideoDoc = computed(() => detailDocuments.value.find((d) => d.documentType.toLowerCase() === 'face_video'));
const otherDocuments = computed(() =>
  detailDocuments.value.filter(
    (d) => !['citizen_id_front', 'citizen_id_back', 'face_photo', 'face_video'].includes(d.documentType.toLowerCase()),
  ),
);

const loadDocumentUrls = async (target: ProfileReviewDetail) => {
  documentUrls.value = {};
  if (!target.verificationId || target.documents.length === 0) {
    isLoadingUrls.value = false;
    return;
  }
  const verificationId = target.verificationId;
  const technicianId = target.technicianId;
  isLoadingUrls.value = true;
  try {
    const entries = await Promise.all(
      target.documents.map(async (doc) => {
        try {
          const url = await adminVerificationsApi.getDocumentAccess(verificationId, doc.id);
          return [doc.id, url] as const;
        } catch {
          return null;
        }
      }),
    );
    if (detail.value?.technicianId !== technicianId) return;
    const nextUrls: Record<string, string> = {};
    for (const entry of entries) {
      if (entry) nextUrls[entry[0]] = entry[1];
    }
    documentUrls.value = nextUrls;
  } finally {
    if (detail.value?.technicianId === technicianId) {
      isLoadingUrls.value = false;
    }
  }
};

const closeDetail = () => {
  detail.value = null;
  documentUrls.value = {};
  isLoadingUrls.value = false;
  loadingProfileId.value = null;
};

const openDetail = async (technicianId: string) => {
  // Ngăn chặn duplicate call khi click liên tục
  if (loadingProfileId.value === technicianId) return;

  const currentRequestId = ++latestDetailRequestId;
  loadingProfileId.value = technicianId;
  error.value = '';

  try {
    const data = await adminOfficeVisitsApi.getReview(technicianId);
    // Nếu người dùng đã chuyển sang hồ sơ khác thì không ghi đè dữ liệu cũ
    if (currentRequestId !== latestDetailRequestId) return;

    for (const key of Object.keys(decisions)) delete decisions[key];
    showReasonErrors.value = false;
    for (const skill of data.skills) decisions[skill.id] = { level: skill.level, approved: true, reason: '' };
    detail.value = data;
    void loadDocumentUrls(data);
  } catch (reason) {
    if (currentRequestId === latestDetailRequestId) {
      error.value = userFacingError(reason, 'Chưa mở được hồ sơ, vui lòng thử lại.');
    }
  } finally {
    if (currentRequestId === latestDetailRequestId) {
      loadingProfileId.value = null;
    }
  }
};

const refreshDetail = async () => {
  if (detail.value) await openDetail(detail.value.technicianId);
  await load();
};

const act = async (task: () => Promise<unknown>, success: string, fallback: string) => {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    await task();
    successMessage.value = success;
    await refreshDetail();
  } catch (reason) {
    error.value = userFacingError(reason, fallback);
  } finally {
    busy.value = false;
  }
};

const reopen = () =>
  detail.value && act(() => adminOfficeVisitsApi.reopenReview(detail.value!.technicianId), 'Đã mở lại hồ sơ, thợ đặt lịch gặp lại.', 'Chưa mở lại được hồ sơ.');

const approve = async () => {
  if (!detail.value || busy.value) return;
  const technicianId = detail.value.technicianId;
  const skills = detail.value.skills.map((s) => ({
    skillId: s.id,
    level: decisions[s.id].level,
    approved: decisions[s.id].approved,
    reason: decisions[s.id].approved ? undefined : decisions[s.id].reason.trim(),
  }));
  if (skills.some((s) => !s.approved && (s.reason?.length ?? 0) < 5)) {
    showReasonErrors.value = true;
    error.value = 'Ghi lý do (ít nhất 5 ký tự) cho mỗi kỹ năng chưa xác nhận.';
    return;
  }
  error.value = '';
  await act(
    async () => {
      await adminOfficeVisitsApi.approveReview(technicianId, skills);
      closeDetail();
    },
    'Đã duyệt hồ sơ. Thợ có thể nạp ví và nhận việc.',
    'Chưa duyệt được hồ sơ, vui lòng thử lại.',
  );
};

const showPreviewModal = ref(false);
const previewUrl = ref('');
const previewTitle = ref('');
const previewKind = ref<'image' | 'video' | 'file'>('image');
const previewLoading = ref(false);

const detectDocKind = (doc: { documentType?: string; fileName?: string }): 'image' | 'video' | 'file' => {
  const type = String(doc.documentType ?? '').toLowerCase();
  const name = String(doc.fileName ?? '').toLowerCase();
  if (type === 'face_video' || /\.(mp4|webm|mov)(\?|$)/.test(name)) return 'video';
  if (
    ['citizen_id_front', 'citizen_id_back', 'face_photo'].includes(type) ||
    /\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(name)
  ) {
    return 'image';
  }
  return 'file';
};

const openDocument = async (title: string, doc: { id: string; documentType?: string; fileName?: string }) => {
  if (!detail.value?.verificationId) return;
  previewTitle.value = title;
  previewKind.value = detectDocKind(doc);
  previewUrl.value = documentUrls.value[doc.id] ?? '';
  showPreviewModal.value = true;
  if (previewUrl.value) return;

  previewLoading.value = true;
  try {
    const url = await adminVerificationsApi.getDocumentAccess(detail.value.verificationId, doc.id);
    documentUrls.value[doc.id] = url;
    previewUrl.value = url;
  } catch {
    showPreviewModal.value = false;
    error.value = 'Chưa mở được tài liệu, vui lòng thử lại.';
  } finally {
    previewLoading.value = false;
  }
};

const previewEvidence = async (item: ProfileReviewEvidence) => {
  previewTitle.value = item.fileName;
  previewKind.value = item.mimeType.startsWith('image/') ? 'image' : 'file';
  previewUrl.value = '';
  showPreviewModal.value = true;
  previewLoading.value = true;
  try {
    previewUrl.value = (await adminSkillVerificationsApi.getDocumentAccess(item.verificationId, item.documentId)).signedUrl;
  } catch {
    showPreviewModal.value = false;
    error.value = 'Chưa mở được tài liệu, vui lòng thử lại.';
  } finally {
    previewLoading.value = false;
  }
};

// ---- Từ chối ----
const showReject = ref(false);
const rejectReason = ref('');
const rejectError = ref('');
const confirmReject = async () => {
  if (!detail.value) return;
  if (rejectReason.value.trim().length < 5) {
    rejectError.value = 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).';
    return;
  }
  const technicianId = detail.value.technicianId;
  const reason = rejectReason.value.trim();
  showReject.value = false;
  await act(
    async () => {
      await adminOfficeVisitsApi.rejectReview(technicianId, reason);
      closeDetail();
    },
    'Đã từ chối hồ sơ và thông báo cho thợ.',
    'Chưa từ chối được hồ sơ, vui lòng thử lại.',
  );
};
</script>

<template>
  <div class="space-y-5">
    <!-- Header: Tiêu đề và mô tả nghiệp vụ chuẩn FixHome -->
    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Duyệt hồ sơ</h1>
        <p class="mt-1 text-sm text-ink-600 text-pretty">
          Xác nhận thông tin kỹ thuật viên, đặt lịch lên trụ sở để kiểm tra và duyệt cấp độ kỹ năng.
        </p>
      </div>
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="load">Làm mới danh sách</ConsoleMenuItem>
          <ConsoleMenuItem @click="goToOfficeVisits">Lịch hẹn trụ sở</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </div>
    </div>

    <!-- 3 Thẻ thống kê: nhỏ gọn, màu nhẹ nhàng, phản ánh số liệu thực tế -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <!-- Thẻ 1: Chờ đặt lịch -->
      <button
        type="button"
        class="flex cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 text-left transition-all hover:border-amber-300 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        :class="activeCardFilter === 'WAITING_BOOKING' ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-400/20 shadow-xs' : 'border-ink-100 shadow-2xs'"
        title="Nhấn để lọc hồ sơ chờ đặt lịch"
        @click="filterByCard('WAITING_BOOKING')"
      >
        <div class="flex items-center gap-3.5">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Calendar :size="20" :stroke-width="2" aria-hidden="true" />
          </div>
          <div>
            <div class="text-xs font-medium text-ink-500">Chờ đặt lịch</div>
            <div class="text-xs text-ink-400">Chưa xếp lịch trụ sở</div>
          </div>
        </div>
        <div class="font-num text-2xl font-bold text-amber-600">
          <span v-if="loading" class="inline-block h-6 w-8 animate-pulse rounded bg-amber-100/70"></span>
          <span v-else>{{ stats.waitingBooking }}</span>
        </div>
      </button>

      <!-- Thẻ 2: Đã đặt lịch -->
      <button
        type="button"
        class="flex cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 text-left transition-all hover:border-emerald-300 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        :class="activeCardFilter === 'BOOKED' ? 'border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-400/20 shadow-xs' : 'border-ink-100 shadow-2xs'"
        title="Nhấn để lọc hồ sơ đã đặt lịch"
        @click="filterByCard('BOOKED')"
      >
        <div class="flex items-center gap-3.5">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Calendar :size="20" :stroke-width="2" aria-hidden="true" />
          </div>
          <div>
            <div class="text-xs font-medium text-ink-500">Đã đặt lịch</div>
            <div class="text-xs text-ink-400">Có lịch hẹn trụ sở</div>
          </div>
        </div>
        <div class="font-num text-2xl font-bold text-emerald-600">
          <span v-if="loading" class="inline-block h-6 w-8 animate-pulse rounded bg-emerald-100/70"></span>
          <span v-else>{{ stats.booked }}</span>
        </div>
      </button>

      <!-- Thẻ 3: Chờ duyệt kỹ năng -->
      <button
        type="button"
        class="flex cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        :class="activeCardFilter === 'WAITING_SKILL' ? 'border-blue-400 bg-blue-50/40 ring-2 ring-blue-400/20 shadow-xs' : 'border-ink-100 shadow-2xs'"
        title="Nhấn để lọc hồ sơ chờ duyệt kỹ năng"
        @click="filterByCard('WAITING_SKILL')"
      >
        <div class="flex items-center gap-3.5">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Award :size="20" :stroke-width="2" aria-hidden="true" />
          </div>
          <div>
            <div class="text-xs font-medium text-ink-500">Chờ duyệt kỹ năng</div>
            <div class="text-xs text-ink-400">Đã có mặt tại trụ sở</div>
          </div>
        </div>
        <div class="font-num text-2xl font-bold text-blue-600">
          <span v-if="loading" class="inline-block h-6 w-8 animate-pulse rounded bg-blue-100/70"></span>
          <span v-else>{{ stats.waitingSkillApproval }}</span>
        </div>
      </button>
    </div>

    <!-- Thanh tìm kiếm và bộ lọc: cùng 1 hàng, cân đối, bố trí hiện đại -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-2xs">
      <div class="flex flex-1 flex-wrap items-center gap-2.5">
        <!-- Ô tìm kiếm -->
        <div class="relative min-w-[260px] flex-1 max-w-md">
          <Search class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" :size="16" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Tìm tên, email hoặc SĐT kỹ thuật viên"
            aria-label="Tìm kiếm hồ sơ"
            class="h-10 w-full rounded-xl border border-ink-200/90 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <!-- Bộ lọc giai đoạn -->
        <div class="relative">
          <select
            v-model="stageFilter"
            aria-label="Bộ lọc giai đoạn"
            class="h-10 appearance-none rounded-xl border border-ink-200/90 bg-white pl-3.5 pr-8 text-xs sm:text-sm font-medium text-ink-700 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer"
          >
            <option value="ALL">Giai đoạn: Tất cả</option>
            <option value="visit_required">Chờ thợ đặt lịch</option>
            <option value="visit_scheduled">Đã đặt lịch lên trụ sở</option>
            <option value="profile_review">Đã có mặt, chờ duyệt hồ sơ</option>
            <option value="profile_rejected">Hồ sơ bị từ chối</option>
            <option value="visit_blocked">Bị khóa đặt lịch</option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" :size="14" aria-hidden="true" />
        </div>

        <!-- Bộ lọc lịch hẹn -->
        <div class="relative">
          <select
            v-model="appointmentFilter"
            aria-label="Bộ lọc lịch hẹn"
            class="h-10 appearance-none rounded-xl border border-ink-200/90 bg-white pl-3.5 pr-8 text-xs sm:text-sm font-medium text-ink-700 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer"
          >
            <option value="ALL">Lịch hẹn: Tất cả</option>
            <option value="NO_VISIT">Chưa đặt lịch</option>
            <option value="HAS_VISIT">Đã đặt lịch</option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" :size="14" aria-hidden="true" />
        </div>

        <!-- Nút đặt lại bộ lọc -->
        <button
          v-if="hasFilters"
          type="button"
          class="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-200 bg-ink-50/80 px-3 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          @click="resetFilters"
        >
          <RotateCcw :size="14" aria-hidden="true" />
          <span>Đặt lại</span>
        </button>
      </div>

      <!-- Nút Sắp lịch sang Lịch hẹn trụ sở -->
      <button
        type="button"
        class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
        @click="goToOfficeVisits"
      >
        <Calendar :size="16" aria-hidden="true" />
        <span>Sắp lịch</span>
        <ChevronDown :size="14" class="opacity-80" aria-hidden="true" />
      </button>
    </div>

    <!-- Thông báo lỗi hoặc thành công -->
    <Transition name="fh-fade-slide">
      <p v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
        {{ error }}
      </p>
    </Transition>
    <Transition name="fh-fade-slide">
      <p v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
        {{ successMessage }}
      </p>
    </Transition>

    <!-- Danh sách hồ sơ -->
    <div>
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />

      <div v-else class="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xs">
        <div class="overflow-x-auto overscroll-x-contain">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-ink-100 bg-ink-25/50">
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">Kỹ thuật viên</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600 hidden md:table-cell">Kỹ năng / Chuyên môn chính</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">Giai đoạn</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600 hidden lg:table-cell">Lịch hẹn</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">Trạng thái hồ sơ</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold text-ink-600">Thao tác</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-ink-100">
              <!-- Loading Skeleton -->
              <template v-if="loading">
                <tr v-for="n in 5" :key="`skeleton-${n}`" class="animate-pulse">
                  <td class="px-4 py-3.5">
                    <div class="flex items-center gap-3">
                      <div class="h-10 w-10 rounded-full bg-ink-100"></div>
                      <div class="space-y-1.5">
                        <div class="h-4 w-28 rounded bg-ink-100"></div>
                        <div class="h-3 w-36 rounded bg-ink-100"></div>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3.5 hidden md:table-cell"><div class="h-6 w-36 rounded-lg bg-ink-100"></div></td>
                  <td class="px-4 py-3.5"><div class="h-4 w-24 rounded bg-ink-100"></div></td>
                  <td class="px-4 py-3.5 hidden lg:table-cell"><div class="h-4 w-28 rounded bg-ink-100"></div></td>
                  <td class="px-4 py-3.5"><div class="h-6 w-28 rounded-lg bg-ink-100"></div></td>
                  <td class="px-4 py-3.5 text-right"><div class="inline-block h-8 w-20 rounded-lg bg-ink-100"></div></td>
                </tr>
              </template>

              <!-- Empty State -->
              <tr v-else-if="filteredRows.length === 0">
                <td colspan="6" class="px-4 py-12 text-center text-sm text-ink-500">
                  <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
                    <Search :size="22" aria-hidden="true" />
                  </div>
                  <p class="mt-2.5 font-medium text-ink-700">Không tìm thấy hồ sơ nào</p>
                  <p class="text-xs text-ink-400">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                  <button
                    v-if="hasFilters"
                    type="button"
                    class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-ink-50"
                    @click="resetFilters"
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </td>
              </tr>

              <!-- Data Rows -->
              <tr
                v-else
                v-for="row in paginatedRows"
                :key="row.technicianId"
                class="group cursor-pointer transition-[background-color] duration-150 hover:bg-brand-50/35"
                :class="detail?.technicianId === row.technicianId ? 'border-l-4 border-l-brand-600 bg-brand-50/20' : ''"
                @click="openDetail(row.technicianId)"
              >
                <!-- Kỹ thuật viên (Avatar + Tên + Email/SĐT) -->
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-3">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink-100 bg-brand-50 text-xs font-bold text-brand-700 font-num">
                      <img
                        v-if="(row as unknown as { avatarUrl?: string }).avatarUrl"
                        :src="(row as unknown as { avatarUrl?: string }).avatarUrl"
                        :alt="row.fullName"
                        class="h-full w-full object-cover"
                      />
                      <span v-else>{{ getInitials(row.fullName) }}</span>
                    </div>

                    <div class="min-w-0">
                      <button
                        type="button"
                        class="cursor-pointer text-left font-semibold text-ink-900 transition-colors group-hover:text-brand-600 hover:text-brand-600 truncate block"
                        @click.stop="openDetail(row.technicianId)"
                      >
                        {{ row.fullName || 'Kỹ thuật viên' }}
                      </button>
                      <div class="flex items-center gap-1.5 text-xs text-ink-500 font-num truncate mt-0.5">
                        <Mail :size="12" class="shrink-0 text-ink-400" aria-hidden="true" />
                        <span class="truncate">{{ row.email || '—' }}</span>
                      </div>
                      <div v-if="row.phoneNumber" class="flex items-center gap-1.5 text-xs text-ink-400 font-num truncate mt-0.5">
                        <Phone :size="11" class="shrink-0 text-ink-400" aria-hidden="true" />
                        <span>{{ row.phoneNumber }}</span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Kỹ năng / Chuyên môn chính -->
                <td class="px-4 py-3.5 hidden md:table-cell">
                  <div class="inline-flex items-center gap-1.5 rounded-lg border border-ink-200/80 bg-ink-50/60 px-2.5 py-1 text-xs font-medium text-ink-700">
                    <component :is="getPrimarySkill(row).icon" :size="14" class="shrink-0 text-ink-500" aria-hidden="true" />
                    <span>{{ getPrimarySkill(row).name }}</span>
                  </div>
                </td>

                <!-- Giai đoạn (Dot indicator + Text) -->
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-2 text-xs">
                    <span class="h-2 w-2 shrink-0 rounded-full" :class="getStageDotTone(row.stage)"></span>
                    <span :class="row.stage ? 'text-ink-700 font-medium' : 'text-amber-700 font-medium'">
                      {{ reviewStageLabel(row.stage) }}
                    </span>
                  </div>
                </td>

                <!-- Lịch hẹn -->
                <td class="px-4 py-3.5 hidden lg:table-cell">
                  <template v-if="row.visit">
                    <div class="flex items-center gap-1.5 text-xs text-ink-800 font-num font-medium">
                      <Calendar :size="13" class="shrink-0 text-ink-400" aria-hidden="true" />
                      <span>{{ formatAppointmentDate(row.visit.scheduledAt) }}</span>
                    </div>
                    <div v-if="row.visit.officeName" class="text-[11px] text-ink-500 mt-0.5 truncate max-w-[180px]">
                      {{ row.visit.officeName }}
                    </div>
                    <div v-if="row.missedVisits" class="text-[11px] font-semibold text-rose-600 font-num mt-0.5">
                      Đã vắng {{ row.missedVisits }} lần
                    </div>
                  </template>
                  <span v-else class="text-xs text-ink-400">Chưa đặt lịch</span>
                </td>

                <!-- Trạng thái hồ sơ -->
                <td class="px-4 py-3.5">
                  <div
                    class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
                    :class="statusBadgeClasses(getProfileStatusBadge(row).tone)"
                  >
                    <component :is="getProfileStatusBadge(row).icon" :size="13" class="shrink-0" aria-hidden="true" />
                    <span>{{ getProfileStatusBadge(row).label }}</span>
                  </div>
                </td>

                <!-- Thao tác (Xem hồ sơ + Menu) -->
                <td class="px-4 py-3.5 text-right">
                  <div class="flex items-center justify-end gap-1.5" @click.stop>
                    <button
                      type="button"
                      class="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 shadow-2xs transition-all hover:border-brand-300 hover:bg-ink-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="loadingProfileId === row.technicianId"
                      @click.stop="openDetail(row.technicianId)"
                    >
                      <Loader2 v-if="loadingProfileId === row.technicianId" :size="13" class="animate-spin text-brand-600" aria-hidden="true" />
                      <span>Xem hồ sơ</span>
                    </button>

                    <ConsoleMoreMenu>
                      <ConsoleMenuItem @click="openDetail(row.technicianId)">Xem chi tiết hồ sơ</ConsoleMenuItem>
                      <ConsoleMenuItem @click="goToOfficeVisits">Xem lịch hẹn trụ sở</ConsoleMenuItem>
                      <ConsoleMenuItem v-if="row.email" @click="copyToClipboard(row.email, 'email')">Sao chép email</ConsoleMenuItem>
                      <ConsoleMenuItem v-if="row.phoneNumber" @click="copyToClipboard(row.phoneNumber, 'số điện thoại')">Sao chép SĐT</ConsoleMenuItem>
                    </ConsoleMoreMenu>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <div v-if="filteredRows.length > 0" class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white px-4 py-3.5 text-xs text-ink-600">
          <div class="font-num">
            Hiển thị <span class="font-semibold text-ink-900">{{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, filteredRows.length) }}</span> trên <span class="font-semibold text-ink-900">{{ filteredRows.length }}</span> hồ sơ
          </div>

          <div v-if="totalPages > 1" class="flex items-center gap-1">
            <!-- Nút Trước -->
            <button
              type="button"
              class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="page <= 1"
              aria-label="Trang trước"
              @click="page = Math.max(1, page - 1)"
            >
              <ChevronLeft :size="15" aria-hidden="true" />
            </button>

            <!-- Các nút trang -->
            <button
              v-for="p in totalPages"
              :key="`page-${p}`"
              type="button"
              class="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg px-2 text-xs font-medium font-num transition-colors"
              :class="p === page ? 'bg-brand-600 font-semibold text-white shadow-2xs' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
              @click="page = p"
            >
              {{ p }}
            </button>

            <!-- Nút Sau -->
            <button
              type="button"
              class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="page >= totalPages"
              aria-label="Trang sau"
              @click="page = Math.min(totalPages, page + 1)"
            >
              <ChevronRight :size="15" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Drawer Chi tiết hồ sơ (Giữ nguyên toàn bộ logic nghiệp vụ) -->
    <Teleport to="body">
      <Transition name="fh-drawer">
        <div
          v-if="detail"
          class="fixed inset-0 z-50 flex justify-end bg-ink-950/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-review-title"
          @click.self="closeDetail"
          @keydown.esc="closeDetail"
        >
          <section class="fh-drawer-panel relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-ink-200 bg-white shadow-(--shadow-e3)">
            <header class="flex shrink-0 items-start justify-between gap-3 border-b border-ink-200 bg-ink-25/60 px-6 py-4">
              <div class="min-w-0">
                <h3 id="profile-review-title" class="text-base font-semibold text-ink-900">Duyệt hồ sơ: {{ detail.technician.fullName }}</h3>
                <p class="truncate font-num text-sm text-ink-500">{{ detail.technician.phoneNumber || detail.technician.email }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <FhStatusPill :status="stageTone(detail.stage)" :label="reviewStageLabel(detail.stage)" />
                <button
                  type="button"
                  class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Đóng"
                  @click="closeDetail"
                >
                  <X :size="18" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div class="flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
              <Transition name="fh-fade-slide">
                <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">{{ error }}</p>
              </Transition>
              <section class="space-y-2 rounded-[var(--radius-md)] border border-ink-200 bg-ink-25/50 p-4">
                <h4 class="text-sm font-semibold text-ink-900">Buổi gặp tại trụ sở</h4>
                <p v-if="scheduledVisit" class="text-sm text-ink-700">
                  {{ scheduledVisit.officeName }}, <span class="font-num">{{ formatTime(scheduledVisit.scheduledAt) }}</span>
                </p>
                <p v-else-if="attendedVisit" class="text-sm font-medium text-success-700">Đã có mặt tại trụ sở ({{ attendedVisit.officeName }}, <span class="font-num">{{ formatTime(attendedVisit.scheduledAt) }}</span>).</p>
                <p v-else class="text-sm text-ink-500">Thợ chưa đặt lịch.</p>
                <p v-if="!attendedVisit" class="text-xs text-ink-500">Quản lý dịch vụ ghi nhận buổi gặp (có mặt, vắng, cho đặt lại) ở mục "Lịch hẹn trụ sở".</p>
              </section>

              <section class="space-y-2">
                <h4 class="text-sm font-semibold text-ink-900">Kỹ năng và cấp độ</h4>
                <p class="text-xs text-ink-500">Mở từng nhóm để xem giấy tờ thợ nộp, chọn cấp độ và xác nhận cho cả nhóm. Bỏ chọn "Xác nhận" nếu chưa đủ căn cứ.</p>
                <ProfileSkillGroups
                  :skills="detail.skills"
                  :evidence="detail.evidence ?? []"
                  :decisions="decisions"
                  :readonly="!canDecide"
                  :show-reason-errors="showReasonErrors"
                  @change="changeDecisions"
                  @preview="previewEvidence"
                />
              </section>

              <section class="space-y-3">
                <h4 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <FileBadge class="text-brand-600" :size="17" aria-hidden="true" />
                  Giấy tờ xác minh
                </h4>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <!-- Mặt trước -->
                  <div class="space-y-1.5">
                    <p class="text-center text-xs font-medium text-ink-600">CCCD mặt trước</p>
                    <button
                      type="button"
                      class="group relative flex aspect-[1.6/1] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default"
                      :disabled="!frontIdDoc?.id"
                      title="Nhấn để xem lớn"
                      @click="frontIdDoc ? openDocument('CCCD mặt trước', frontIdDoc) : null"
                    >
                      <template v-if="frontIdDoc?.id">
                        <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                          <Loader2 class="animate-spin text-brand-500" :size="22" aria-hidden="true" />
                        </div>
                        <img
                          v-else-if="documentUrls[frontIdDoc.id]"
                          :src="documentUrls[frontIdDoc.id]"
                          alt="CCCD mặt trước"
                          class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div v-else class="flex flex-col items-center gap-1.5">
                          <ImageIcon class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" aria-hidden="true" />
                          <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                        </div>
                      </template>
                      <span v-else class="text-xs font-medium text-ink-400">Chưa tải lên</span>
                    </button>
                  </div>

                  <!-- Mặt sau -->
                  <div class="space-y-1.5">
                    <p class="text-center text-xs font-medium text-ink-600">CCCD mặt sau</p>
                    <button
                      type="button"
                      class="group relative flex aspect-[1.6/1] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default"
                      :disabled="!backIdDoc?.id"
                      title="Nhấn để xem lớn"
                      @click="backIdDoc ? openDocument('CCCD mặt sau', backIdDoc) : null"
                    >
                      <template v-if="backIdDoc?.id">
                        <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                          <Loader2 class="animate-spin text-brand-500" :size="22" aria-hidden="true" />
                        </div>
                        <img
                          v-else-if="documentUrls[backIdDoc.id]"
                          :src="documentUrls[backIdDoc.id]"
                          alt="CCCD mặt sau"
                          class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div v-else class="flex flex-col items-center gap-1.5">
                          <ImageIcon class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" aria-hidden="true" />
                          <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                        </div>
                      </template>
                      <span v-else class="text-xs font-medium text-ink-400">Chưa tải lên</span>
                    </button>
                  </div>

                  <!-- Chân dung / Video -->
                  <div class="space-y-1.5">
                    <p class="text-center text-xs font-medium text-ink-600">Khuôn mặt</p>
                    <button
                      type="button"
                      class="group relative flex aspect-[1.6/1] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default"
                      :disabled="!facePhotoDoc?.id && !faceVideoDoc?.id"
                      title="Nhấn để xem lớn"
                      @click="(facePhotoDoc || faceVideoDoc) ? openDocument('Xác minh khuôn mặt', (facePhotoDoc || faceVideoDoc)!) : null"
                    >
                      <template v-if="facePhotoDoc?.id || faceVideoDoc?.id">
                        <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                          <Loader2 class="animate-spin text-brand-500" :size="22" aria-hidden="true" />
                        </div>
                        <template v-else-if="facePhotoDoc?.id && documentUrls[facePhotoDoc.id]">
                          <img
                            :src="documentUrls[facePhotoDoc.id]"
                            alt="Xác minh khuôn mặt"
                            class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </template>
                        <template v-else-if="faceVideoDoc?.id && documentUrls[faceVideoDoc.id]">
                          <div class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[calc(var(--radius-sm)-2px)] bg-ink-950 transition-transform duration-200 group-hover:scale-105">
                            <Video class="absolute z-10 text-white opacity-80" :size="28" aria-hidden="true" />
                            <video :src="documentUrls[faceVideoDoc.id]" class="h-full w-full object-cover opacity-50"></video>
                          </div>
                        </template>
                        <div v-else class="flex flex-col items-center gap-1.5">
                          <Video v-if="faceVideoDoc" class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" aria-hidden="true" />
                          <ImageIcon v-else class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" aria-hidden="true" />
                          <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                        </div>
                      </template>
                      <span v-else class="text-xs font-medium text-ink-400">Chưa tải lên</span>
                    </button>
                  </div>
                </div>

                <div v-if="otherDocuments.length > 0" class="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <button
                    v-for="document in otherDocuments"
                    :key="document.id"
                    type="button"
                    class="group flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    @click="openDocument(document.fileName, document)"
                  >
                    <div class="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[calc(var(--radius-sm)-2px)] border border-ink-200 bg-white">
                      <Loader2 v-if="isLoadingUrls" class="animate-spin text-brand-500" :size="16" aria-hidden="true" />
                      <img
                        v-else-if="detectDocKind(document) === 'image' && documentUrls[document.id]"
                        :src="documentUrls[document.id]"
                        :alt="document.fileName"
                        class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <FileText v-else class="text-brand-600" :size="18" aria-hidden="true" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-xs font-medium text-ink-900">{{ document.fileName }}</div>
                      <div class="text-xs text-brand-700">Nhấn để xem lớn</div>
                    </div>
                  </button>
                </div>

                <p v-if="detail.faceMatchScore != null" class="text-xs text-ink-600">
                  Độ khớp ảnh CCCD và chân dung tham khảo: <strong class="font-num text-ink-900">{{ detail.faceMatchScore }}%</strong>.
                </p>
              </section>

              <section class="space-y-1.5 rounded-[var(--radius-md)] border border-ink-200 bg-ink-25/50 p-4 text-sm text-ink-700">
                <h4 class="text-sm font-semibold text-ink-900">Hồ sơ nghề</h4>
                <p>Kinh nghiệm: <span class="font-num font-medium text-ink-900">{{ detail.profile.yearsExperience }}</span> năm. Bán kính phục vụ: <span class="font-num font-medium text-ink-900">{{ detail.profile.serviceRadiusKm }}</span> km.</p>
                <p>Địa chỉ: {{ detail.profile.fullAddress || 'Chưa cập nhật' }}</p>
                <p class="text-pretty">Giới thiệu: {{ detail.profile.bio || 'Chưa cập nhật' }}</p>
                <p v-if="detail.profile.rejectionReason" class="text-danger-700">Lý do từ chối trước đó: {{ detail.profile.rejectionReason }}</p>
              </section>
            </div>

            <footer class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-ink-200 bg-ink-25/60 px-6 py-4">
              <p v-if="detail.stage !== 'profile_review'" class="text-xs text-ink-500">Chỉ duyệt hồ sơ sau khi đã gặp trực tiếp tại trụ sở.</p>
              <span v-else />
              <div class="flex flex-wrap justify-end gap-2">
                <FhButton variant="secondary" size="sm" @click="closeDetail">Đóng</FhButton>
                <FhButton v-if="canDecide && detail.stage === 'profile_rejected'" variant="secondary" size="sm" :disabled="busy" @click="reopen">Mở lại hồ sơ</FhButton>
                <FhButton v-if="canDecide && detail.stage !== 'profile_rejected' && detail.stage !== 'approved'" variant="secondary" size="sm" :disabled="busy" @click="showReject = true; rejectReason = ''; rejectError = ''">Từ chối</FhButton>
                <FhButton v-if="canDecide && detail.stage === 'profile_review'" variant="primary" size="sm" :loading="busy" :disabled="busy" @click="approve">Duyệt hồ sơ</FhButton>
              </div>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- Document preview modal -->
    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="showPreviewModal"
          class="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/60 p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-doc-preview-title"
          @click.self="showPreviewModal = false"
          @keydown.esc="showPreviewModal = false"
        >
          <div class="fh-modal-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-white shadow-(--shadow-e3)">
            <div class="flex items-center justify-between gap-3 border-b border-ink-200 bg-ink-25/60 px-6 py-4">
              <h3 id="profile-doc-preview-title" class="truncate text-base font-semibold text-ink-900">{{ previewTitle }}</h3>
              <button
                type="button"
                class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                aria-label="Đóng"
                @click="showPreviewModal = false"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </div>
            <div class="relative flex min-h-[360px] flex-1 items-center justify-center overflow-auto overscroll-contain bg-ink-100 p-4 sm:p-6">
              <FhSkeleton v-if="previewLoading" width="320px" height="420px" rounded="md" />
              <template v-else-if="previewUrl">
                <video
                  v-if="previewKind === 'video'"
                  :src="previewUrl"
                  controls
                  autoplay
                  class="max-h-[min(72dvh,680px)] max-w-full rounded-[var(--radius-md)] bg-black shadow-(--shadow-e2)"
                ></video>
                <img
                  v-else-if="previewKind === 'image'"
                  :src="previewUrl"
                  class="max-h-[min(72dvh,680px)] max-w-full rounded-[var(--radius-md)] border border-ink-200 bg-white object-contain shadow-(--shadow-e2)"
                  :alt="previewTitle"
                />
                <iframe
                  v-else
                  :src="previewUrl"
                  :title="previewTitle"
                  class="h-[min(72dvh,680px)] w-full rounded-[var(--radius-md)] border border-ink-200 bg-white shadow-(--shadow-e2)"
                ></iframe>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Dialog từ chối hồ sơ -->
    <FhConfirmDialog
      :open="showReject"
      :loading="busy"
      title="Từ chối hồ sơ"
      consequence="Thợ sẽ nhận thông báo kèm lý do và có thể chỉnh sửa rồi gửi lại."
      confirm-text="Từ chối"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="showReject = false"
    >
      <label class="block text-sm font-medium text-ink-700" for="profile-reject-reason">Lý do từ chối</label>
      <textarea id="profile-reject-reason" v-model="rejectReason" maxlength="2000" rows="3" class="mt-1.5" :class="consoleTextarea" placeholder="Ví dụ: bản công chứng bằng cấp không rõ"></textarea>
      <Transition name="fh-fade-slide">
        <p v-if="rejectError" class="mt-1 text-sm text-danger-600" role="alert">{{ rejectError }}</p>
      </Transition>
    </FhConfirmDialog>
  </div>
</template>