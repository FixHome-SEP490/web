<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { FileBadge, FileText, Image as ImageIcon, Loader2, RotateCcw, Video, X } from 'lucide-vue-next';
import { FhButton, FhConfirmDialog, FhSkeleton, FhStatusPill } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../../components/console/ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleTextarea } from '../../../components/console/console-ui';
import { reviewStageLabel, skillLevelLabel } from '../../../components/console/console-labels';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateTimeString } from '../../../utils/vn-time';
import { adminVerificationsApi } from '../../../api/admin-verifications.api';
import {
  adminOfficeVisitsApi,
  type ProfileReviewDetail,
  type ProfileReviewRow,
  type ReviewStage,
} from '../../../api/admin-office-visits.api';

// Duyệt hồ sơ cuối: thợ đã được xác nhận danh tính và (sau khi gặp trực tiếp) admin kiểm bằng cấp, xác nhận cấp độ rồi duyệt.
const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'stage', label: 'Giai đoạn' },
  { key: 'visit', label: 'Lịch hẹn', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];

const rows = ref<ProfileReviewRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const successMessage = ref('');
const busy = ref(false);
const searchQuery = ref('');
const stageFilter = ref<'ALL' | ReviewStage>('ALL');

const hasFilters = computed(() => Boolean(searchQuery.value.trim()) || stageFilter.value !== 'ALL');
const resetFilters = () => {
  searchQuery.value = '';
  stageFilter.value = 'ALL';
};

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (stageFilter.value !== 'ALL' && r.stage !== stageFilter.value) return false;
    if (!q) return true;
    return [r.fullName, r.phoneNumber, r.email].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
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

// ---- Chi tiết ----
const detail = ref<ProfileReviewDetail | null>(null);
const detailLoading = ref(false);
const decisions = reactive<Record<string, { level: string; approved: boolean }>>({});
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
};

const openDetail = async (technicianId: string) => {
  detailLoading.value = true;
  error.value = '';
  try {
    const data = await adminOfficeVisitsApi.getReview(technicianId);
    for (const key of Object.keys(decisions)) delete decisions[key];
    for (const skill of data.skills) decisions[skill.id] = { level: skill.level, approved: true };
    detail.value = data;
    void loadDocumentUrls(data);
  } catch (reason) {
    error.value = userFacingError(reason, 'Chưa mở được hồ sơ, vui lòng thử lại.');
  } finally {
    detailLoading.value = false;
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
  const skills = detail.value.skills.map((s) => ({ skillId: s.id, level: decisions[s.id].level, approved: decisions[s.id].approved }));
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
    <ConsolePageHeader class="animate-slide-up" title="Duyệt hồ sơ" :count="loading || loadError ? null : filteredRows.length">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="load">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>
    <p class="animate-slide-up-delay-1 text-sm text-ink-600 text-pretty">
      Thợ đã được xác nhận danh tính sẽ đặt lịch lên trụ sở. Sau khi gặp trực tiếp và kiểm bản công chứng bằng cấp, bạn xác nhận cấp độ từng kỹ năng rồi duyệt hồ sơ.
    </p>

    <div class="animate-slide-up-delay-1 flex flex-wrap items-center gap-2.5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-3 shadow-(--shadow-e1)">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm tên, SĐT, email thợ" label="Tìm hồ sơ kỹ thuật viên" />
      <select v-model="stageFilter" :class="consoleField" aria-label="Giai đoạn">
        <option value="ALL">Mọi giai đoạn</option>
        <option value="visit_required">Chờ thợ đặt lịch</option>
        <option value="visit_scheduled">Đã đặt lịch lên trụ sở</option>
        <option value="profile_review">Đã gặp, chờ duyệt hồ sơ</option>
        <option value="profile_rejected">Hồ sơ bị từ chối</option>
        <option value="visit_blocked">Bị khóa đặt lịch</option>
      </select>
      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
        @click="resetFilters"
      >
        <RotateCcw :size="14" aria-hidden="true" />
        Đặt lại
      </button>
    </div>

    <Transition name="fh-fade-slide">
      <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    </Transition>
    <Transition name="fh-fade-slide">
      <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>
    </Transition>

    <div class="animate-slide-up-delay-2">
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
      <ConsoleTable v-else :columns="columns" :rows="filteredRows" :loading="loading" empty-text="Chưa có hồ sơ nào đang chờ.">
        <template #cell-technician="{ row }">
          <button type="button" class="cursor-pointer font-medium text-brand-700 hover:underline" @click="openDetail(row.technicianId)">{{ row.fullName || 'Kỹ thuật viên' }}</button>
          <div class="truncate font-num text-xs text-ink-500">{{ row.phoneNumber || row.email }}</div>
        </template>
        <template #cell-stage="{ row }">
          <FhStatusPill :status="stageTone(row.stage)" :label="reviewStageLabel(row.stage)" />
        </template>
        <template #cell-visit="{ row }">
          <template v-if="row.visit">
            <div class="text-ink-800">{{ row.visit.officeName }}</div>
            <div class="font-num text-xs text-ink-500">{{ formatTime(row.visit.scheduledAt) }}</div>
          </template>
          <span v-else class="text-ink-400">Chưa đặt lịch</span>
          <div v-if="row.missedVisits" class="font-num text-xs text-danger-700">Đã vắng {{ row.missedVisits }} lần</div>
        </template>
        <template #cell-actions="{ row }">
          <FhButton variant="secondary" size="sm" :loading="detailLoading" @click="openDetail(row.technicianId)">Xem hồ sơ</FhButton>
        </template>
      </ConsoleTable>
    </div>

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
                <p v-else-if="attendedVisit" class="text-sm font-medium text-success-700">Đã gặp trực tiếp ({{ attendedVisit.officeName }}, <span class="font-num">{{ formatTime(attendedVisit.scheduledAt) }}</span>).</p>
                <p v-else class="text-sm text-ink-500">Thợ chưa đặt lịch.</p>
                <p v-if="!attendedVisit" class="text-xs text-ink-500">Quản lý dịch vụ ghi nhận buổi gặp (đã gặp, vắng, cho đặt lại) ở mục "Lịch hẹn trụ sở".</p>
              </section>

              <section class="space-y-2">
                <h4 class="text-sm font-semibold text-ink-900">Kỹ năng và cấp độ</h4>
                <p class="text-xs text-ink-500">Xác nhận cấp độ dựa trên bản công chứng bằng cấp. Bỏ chọn "Xác nhận" nếu chưa đủ căn cứ.</p>
                <ul class="max-h-80 divide-y divide-ink-100 overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-ink-200 bg-white">
                  <li v-for="skill in detail.skills" :key="skill.id" class="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div class="min-w-0 flex-1">
                      <div class="font-medium text-ink-900">{{ skill.serviceName }}</div>
                      <div class="text-xs text-ink-500">Tự khai: {{ skillLevelLabel(skill.declaredLevel) }}</div>
                    </div>
                    <select v-model="decisions[skill.id].level" :class="consoleField" :aria-label="`Cấp độ xác nhận cho ${skill.serviceName}`">
                      <option v-for="level in LEVELS" :key="level" :value="level">{{ skillLevelLabel(level) }}</option>
                    </select>
                    <label class="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700">
                      <input v-model="decisions[skill.id].approved" type="checkbox" class="h-4 w-4 accent-brand-600" /> Xác nhận
                    </label>
                  </li>
                  <li v-if="detail.skills.length === 0" class="px-4 py-3 text-sm text-ink-400">Thợ chưa chọn kỹ năng.</li>
                </ul>
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
                <FhButton v-if="detail.stage === 'profile_rejected'" variant="secondary" size="sm" :disabled="busy" @click="reopen">Mở lại hồ sơ</FhButton>
                <FhButton v-if="detail.stage !== 'profile_rejected' && detail.stage !== 'approved'" variant="secondary" size="sm" :disabled="busy" @click="showReject = true; rejectReason = ''; rejectError = ''">Từ chối</FhButton>
                <FhButton v-if="detail.stage === 'profile_review'" variant="primary" size="sm" :loading="busy" :disabled="busy" @click="approve">Duyệt hồ sơ</FhButton>
              </div>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- Document preview -->
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
