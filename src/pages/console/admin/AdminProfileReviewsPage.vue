<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { FileText } from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhConfirmDialog } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
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

const attendedVisit = computed(() => detail.value?.visits.find((v) => v.status === 'attended') ?? null);
const scheduledVisit = computed(() => detail.value?.visits.find((v) => v.status === 'scheduled') ?? null);
const canApprove = computed(() => Boolean(attendedVisit.value) && Object.values(decisions).some((d) => d.approved));

const openDetail = async (technicianId: string) => {
  detailLoading.value = true;
  error.value = '';
  try {
    const data = await adminOfficeVisitsApi.getReview(technicianId);
    for (const key of Object.keys(decisions)) delete decisions[key];
    for (const skill of data.skills) decisions[skill.id] = { level: skill.level, approved: true };
    detail.value = data;
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

const markAttended = () =>
  scheduledVisit.value && act(() => adminOfficeVisitsApi.markAttended(scheduledVisit.value!.id), 'Đã ghi nhận buổi gặp.', 'Chưa ghi nhận được buổi gặp.');
const markMissed = () =>
  scheduledVisit.value && act(() => adminOfficeVisitsApi.markMissed(scheduledVisit.value!.id), 'Đã ghi nhận thợ vắng buổi hẹn.', 'Chưa ghi nhận được.');
const resetMissed = () =>
  detail.value && act(() => adminOfficeVisitsApi.resetMissed(detail.value!.technicianId), 'Đã cho phép thợ đặt lại lịch.', 'Chưa cho phép đặt lại được.');

const approve = async () => {
  if (!detail.value || !canApprove.value) return;
  const technicianId = detail.value.technicianId;
  const skills = detail.value.skills.map((s) => ({ skillId: s.id, level: decisions[s.id].level, approved: decisions[s.id].approved }));
  await act(
    async () => {
      await adminOfficeVisitsApi.approveReview(technicianId, skills);
      detail.value = null;
    },
    'Đã duyệt hồ sơ. Thợ có thể nạp ví và nhận việc.',
    'Chưa duyệt được hồ sơ, vui lòng thử lại.',
  );
};

const openDocument = async (document: { id: string }) => {
  if (!detail.value?.verificationId) return;
  try {
    window.open(await adminVerificationsApi.getDocumentAccess(detail.value.verificationId, document.id), '_blank', 'noopener,noreferrer');
  } catch {
    error.value = 'Chưa mở được tài liệu, vui lòng thử lại.';
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
      detail.value = null;
    },
    'Đã từ chối hồ sơ và thông báo cho thợ.',
    'Chưa từ chối được hồ sơ, vui lòng thử lại.',
  );
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Duyệt hồ sơ" :count="loading || loadError ? null : rows.length">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="load">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>
    <p class="text-sm text-ink-600 text-pretty">
      Thợ đã được xác nhận danh tính sẽ đặt lịch lên trụ sở. Sau khi gặp trực tiếp và kiểm bản công chứng bằng cấp, bạn xác nhận cấp độ từng kỹ năng rồi duyệt hồ sơ.
    </p>

    <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
    <ConsoleTable v-else :columns="columns" :rows="rows" :loading="loading" empty-text="Chưa có hồ sơ nào đang chờ.">
      <template #cell-technician="{ row }">
        <button type="button" class="font-medium text-brand-700 hover:underline" @click="openDetail(row.technicianId)">{{ row.fullName || 'Kỹ thuật viên' }}</button>
        <div class="truncate text-xs text-ink-500">{{ row.phoneNumber || row.email }}</div>
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
        <div v-if="row.missedVisits" class="text-xs text-danger-700">Đã vắng {{ row.missedVisits }} lần</div>
      </template>
      <template #cell-actions="{ row }">
        <FhButton variant="secondary" size="sm" :loading="detailLoading" @click="openDetail(row.technicianId)">Xem hồ sơ</FhButton>
      </template>
    </ConsoleTable>

    <div
      v-if="detail"
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-review-title"
      @keydown.esc="detail = null"
    >
      <div class="my-8 w-full max-w-3xl space-y-5 rounded-md bg-white p-6 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 id="profile-review-title" class="text-lg font-semibold text-ink-900">Duyệt hồ sơ: {{ detail.technician.fullName }}</h3>
            <p class="text-sm text-ink-500">{{ detail.technician.phoneNumber || detail.technician.email }}</p>
          </div>
          <FhStatusPill :status="stageTone(detail.stage)" :label="reviewStageLabel(detail.stage)" />
        </div>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-ink-800">Buổi gặp tại trụ sở</h4>
          <p v-if="scheduledVisit" class="text-sm text-ink-700">
            {{ scheduledVisit.officeName }}, <span class="font-num">{{ formatTime(scheduledVisit.scheduledAt) }}</span>
          </p>
          <p v-else-if="attendedVisit" class="text-sm text-success-700">Đã gặp trực tiếp ({{ attendedVisit.officeName }}, {{ formatTime(attendedVisit.scheduledAt) }}).</p>
          <p v-else class="text-sm text-ink-500">Thợ chưa đặt lịch.</p>
          <div class="flex flex-wrap gap-2">
            <FhButton v-if="scheduledVisit" variant="primary" size="sm" :disabled="busy" @click="markAttended">Đã gặp</FhButton>
            <FhButton v-if="scheduledVisit" variant="secondary" size="sm" :disabled="busy" @click="markMissed">Thợ vắng</FhButton>
            <FhButton v-if="detail.stage === 'visit_blocked'" variant="secondary" size="sm" :disabled="busy" @click="resetMissed">Cho phép đặt lại</FhButton>
          </div>
        </section>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-ink-800">Kỹ năng và cấp độ</h4>
          <p class="text-xs text-ink-500">Xác nhận cấp độ dựa trên bản công chứng bằng cấp. Bỏ chọn "Xác nhận" nếu chưa đủ căn cứ.</p>
          <ul class="divide-y divide-ink-100 rounded-sm border border-ink-200">
            <li v-for="skill in detail.skills" :key="skill.id" class="flex flex-wrap items-center gap-3 px-3 py-2">
              <div class="min-w-0 flex-1">
                <div class="font-medium text-ink-900">{{ skill.serviceName }}</div>
                <div class="text-xs text-ink-500">Tự khai: {{ skillLevelLabel(skill.declaredLevel) }}</div>
              </div>
              <select v-model="decisions[skill.id].level" :class="consoleField" :aria-label="`Cấp độ xác nhận cho ${skill.serviceName}`">
                <option v-for="level in LEVELS" :key="level" :value="level">{{ skillLevelLabel(level) }}</option>
              </select>
              <label class="flex items-center gap-1.5 text-sm text-ink-700">
                <input v-model="decisions[skill.id].approved" type="checkbox" /> Xác nhận
              </label>
            </li>
            <li v-if="detail.skills.length === 0" class="px-3 py-2 text-sm text-ink-400">Thợ chưa chọn kỹ năng.</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-ink-800">Giấy tờ đã nộp</h4>
          <ul class="space-y-1">
            <li v-for="document in detail.documents" :key="document.id">
              <button type="button" class="flex items-center gap-1 text-sm text-brand-700 hover:underline" @click="openDocument(document)">
                <FileText :size="13" aria-hidden="true" /> {{ document.fileName }}
              </button>
            </li>
            <li v-if="detail.documents.length === 0" class="text-sm text-ink-400">Chưa có tài liệu.</li>
          </ul>
        </section>

        <section class="space-y-1 text-sm text-ink-700">
          <h4 class="text-sm font-semibold text-ink-800">Hồ sơ nghề</h4>
          <p>Kinh nghiệm: {{ detail.profile.yearsExperience }} năm. Bán kính phục vụ: {{ detail.profile.serviceRadiusKm }} km.</p>
          <p>Địa chỉ: {{ detail.profile.fullAddress || 'Chưa cập nhật' }}</p>
          <p class="text-pretty">Giới thiệu: {{ detail.profile.bio || 'Chưa cập nhật' }}</p>
          <p v-if="detail.profile.rejectionReason" class="text-danger-700">Lý do từ chối trước đó: {{ detail.profile.rejectionReason }}</p>
        </section>

        <div class="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
          <FhButton variant="secondary" size="sm" @click="detail = null">Đóng</FhButton>
          <FhButton variant="secondary" size="sm" :disabled="busy" @click="showReject = true; rejectReason = ''; rejectError = ''">Từ chối</FhButton>
          <FhButton variant="primary" size="sm" :loading="busy" :disabled="!canApprove" @click="approve">Duyệt hồ sơ</FhButton>
        </div>
        <p v-if="!attendedVisit" class="text-right text-xs text-ink-500">Chỉ duyệt hồ sơ sau khi đã gặp trực tiếp tại trụ sở.</p>
      </div>
    </div>

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
      <textarea id="profile-reject-reason" v-model="rejectReason" rows="3" class="mt-1.5" :class="consoleTextarea" placeholder="Ví dụ: bản công chứng bằng cấp không rõ"></textarea>
      <p v-if="rejectError" class="mt-1 text-sm text-danger-600" role="alert">{{ rejectError }}</p>
    </FhConfirmDialog>
  </div>
</template>
