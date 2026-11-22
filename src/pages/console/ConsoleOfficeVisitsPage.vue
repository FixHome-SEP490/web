<script setup lang="ts">
// Service Manager (và Admin): lịch thợ hẹn lên trụ sở. Ghi nhận thợ đã gặp / vắng, và cho thợ bị khóa đặt lịch đặt lại.
// Duyệt hồ sơ cuối vẫn do Admin ở mục "Duyệt hồ sơ".
import { onMounted, ref, watch } from 'vue';
import { FhButton, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';
import { adminOfficeVisitsApi, type OfficeVisitRow, type OfficeVisitStatus } from '../../api/admin-office-visits.api';

const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Thợ' },
  { key: 'office', label: 'Trụ sở', hideBelow: 'lg' },
  { key: 'time', label: 'Giờ hẹn' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];
const STATUS: Record<OfficeVisitStatus, { pill: string; label: string }> = {
  scheduled: { pill: 'PENDING', label: 'Chờ gặp' },
  attended: { pill: 'COMPLETED', label: 'Đã gặp' },
  missed: { pill: 'CANCELLED', label: 'Vắng' },
  cancelled: { pill: 'CANCELLED', label: 'Đã hủy' },
};

const status = ref<OfficeVisitStatus | ''>('scheduled');
const date = ref('');
const rows = ref<OfficeVisitRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const successMessage = ref('');
const busyId = ref('');
const selected = ref<OfficeVisitRow | null>(null);

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    rows.value = await adminOfficeVisitsApi.listVisits({ status: status.value || undefined, date: date.value || undefined });
  } catch (reason) {
    loadError.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
};

const act = async (id: string, task: () => Promise<unknown>, ok: string, fail: string) => {
  busyId.value = id;
  error.value = '';
  successMessage.value = '';
  try {
    await task();
    successMessage.value = ok;
    selected.value = null;
    await load();
  } catch (reason) {
    error.value = userFacingError(reason, fail);
  } finally {
    busyId.value = '';
  }
};

const attended = (row: OfficeVisitRow) => act(row.id, () => adminOfficeVisitsApi.markAttended(row.id), 'Đã ghi nhận buổi gặp.', 'Chưa ghi nhận được buổi gặp.');
const missed = (row: OfficeVisitRow) => act(row.id, () => adminOfficeVisitsApi.markMissed(row.id), 'Đã ghi nhận thợ vắng buổi hẹn.', 'Chưa ghi nhận được.');
const reset = (row: OfficeVisitRow) =>
  act(row.id, () => adminOfficeVisitsApi.resetMissed(row.technicianId), 'Đã cho phép thợ đặt lại lịch.', 'Chưa cho phép đặt lại được.');

watch([status, date], load);
onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Lịch hẹn trụ sở" :count="loading || loadError ? null : rows.length" />
    <p class="animate-slide-up-delay-1 text-sm text-ink-600 text-pretty">
      Thợ đã được xác nhận danh tính sẽ đặt lịch lên trụ sở. Ghi nhận thợ đã gặp hoặc vắng; thợ vắng nhiều lần bị khóa đặt lịch và liên hệ bạn, bạn bấm "Cho phép đặt lại" sau khi hỗ trợ. Duyệt hồ sơ cuối do quản trị viên thực hiện.
    </p>

    <div class="animate-slide-up-delay-1 flex flex-wrap gap-3">
      <select v-model="status" :class="consoleField" aria-label="Trạng thái">
        <option value="">Tất cả trạng thái</option>
        <option v-for="(s, key) in STATUS" :key="key" :value="key">{{ s.label }}</option>
      </select>
      <input v-model="date" type="date" :class="consoleField" aria-label="Ngày hẹn" />
    </div>

    <Transition name="fh-fade-slide">
      <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    </Transition>
    <Transition name="fh-fade-slide">
      <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>
    </Transition>

    <div class="animate-slide-up-delay-2">
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
      <ConsoleTable v-else :columns="columns" :rows="rows" :loading="loading" empty-text="Không có lịch hẹn nào.">
        <template #cell-technician="{ row }">
          <div class="font-medium text-ink-900">{{ row.technicianName }}</div>
          <div class="font-num text-xs text-ink-500">{{ row.technicianPhone ?? '' }}</div>
        </template>
        <template #cell-office="{ row }">
          <div class="text-ink-800">{{ row.officeName }}</div>
          <div class="truncate text-xs text-ink-500">{{ row.officeAddress }}</div>
        </template>
        <template #cell-time="{ row }"><span class="font-num text-ink-800">{{ vnDateTimeString(row.scheduledAt) }}</span></template>
        <template #cell-status="{ row }"><FhStatusPill :status="STATUS[row.status].pill" :label="STATUS[row.status].label" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-2">
            <FhButton variant="secondary" size="sm" @click="selected = row">Xem</FhButton>
            <template v-if="row.status === 'scheduled'">
              <FhButton variant="primary" size="sm" :disabled="busyId === row.id" @click="attended(row)">Đã gặp</FhButton>
              <FhButton variant="secondary" size="sm" :disabled="busyId === row.id" @click="missed(row)">Thợ vắng</FhButton>
            </template>
            <FhButton v-else-if="row.status === 'missed'" variant="secondary" size="sm" :disabled="busyId === row.id" @click="reset(row)">Cho phép đặt lại</FhButton>
          </div>
        </template>
      </ConsoleTable>
    </div>

    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="selected"
          class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="office-visit-title"
          @click.self="selected = null"
          @keydown.esc="selected = null"
        >
          <section class="fh-modal-panel w-full max-w-md space-y-4 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-6 shadow-(--shadow-e3)">
            <div class="flex items-start justify-between gap-3">
              <h3 id="office-visit-title" class="text-base font-semibold text-ink-900">Lịch hẹn lên trụ sở</h3>
              <FhStatusPill :status="STATUS[selected.status].pill" :label="STATUS[selected.status].label" />
            </div>
            <dl class="space-y-2 text-sm">
              <div><dt class="text-xs text-ink-500">Kỹ thuật viên</dt><dd class="font-medium text-ink-900">{{ selected.technicianName }}</dd></div>
              <div v-if="selected.technicianPhone"><dt class="text-xs text-ink-500">Số điện thoại</dt><dd class="font-num text-ink-900"><a :href="`tel:${selected.technicianPhone}`" class="underline">{{ selected.technicianPhone }}</a></dd></div>
              <div><dt class="text-xs text-ink-500">Trụ sở</dt><dd class="text-ink-900">{{ selected.officeName }}<span class="block text-xs text-ink-500">{{ selected.officeAddress }}</span></dd></div>
              <div><dt class="text-xs text-ink-500">Giờ hẹn</dt><dd class="font-num text-ink-900">{{ vnDateTimeString(selected.scheduledAt) }}</dd></div>
              <div v-if="selected.note"><dt class="text-xs text-ink-500">Ghi chú</dt><dd class="text-ink-900">{{ selected.note }}</dd></div>
            </dl>
            <div class="flex flex-wrap justify-end gap-2">
              <FhButton variant="secondary" size="sm" @click="selected = null">Đóng</FhButton>
              <template v-if="selected.status === 'scheduled'">
                <FhButton variant="primary" size="sm" :disabled="busyId === selected.id" @click="attended(selected)">Đã gặp</FhButton>
                <FhButton variant="secondary" size="sm" :disabled="busyId === selected.id" @click="missed(selected)">Thợ vắng</FhButton>
              </template>
              <FhButton v-else-if="selected.status === 'missed'" variant="secondary" size="sm" :disabled="busyId === selected.id" @click="reset(selected)">Cho phép đặt lại</FhButton>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
