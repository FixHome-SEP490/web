<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { FhButton, FhStatusPill } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../../components/console/console-ui';
import { userFacingError } from '../../../utils/user-facing-error';
import { adminOfficeVisitsApi, type VisitOffice } from '../../../api/admin-office-visits.api';

// Trụ sở nơi thợ lên gặp trực tiếp sau khi được xác nhận danh tính. Thợ chọn trụ sở (mặc định gần nhất) và giờ hẹn.
const columns: ConsoleColumn[] = [
  { key: 'name', label: 'Trụ sở' },
  { key: 'hours', label: 'Giờ nhận hồ sơ', hideBelow: 'lg' },
  { key: 'capacity', label: 'Mỗi lượt', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

const DAYS = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' }, { value: 4, label: 'T5' },
  { value: 5, label: 'T6' }, { value: 6, label: 'T7' }, { value: 7, label: 'CN' },
];

const offices = ref<VisitOffice[]>([]);
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const successMessage = ref('');

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    offices.value = await adminOfficeVisitsApi.listOffices();
  } catch (reason) {
    loadError.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
};
onMounted(() => void load());

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : '');
const daysLabel = (days: number[]) => DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ');

const blank = () => ({
  name: '', address: '', phone: '', latitude: '', longitude: '', isActive: true,
  visitDays: [1, 2, 3, 4, 5] as number[], openTime: '08:00', closeTime: '17:00', lunchStart: '11:30', lunchEnd: '13:30',
  slotMinutes: 30, slotCapacity: 2,
});
const form = reactive(blank());
const editing = ref<VisitOffice | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');

const openCreate = () => {
  Object.assign(form, blank());
  editing.value = null;
  formError.value = '';
  showForm.value = true;
};
const openEdit = (office: VisitOffice) => {
  Object.assign(form, {
    name: office.name, address: office.address, phone: office.phone ?? '',
    latitude: office.latitude == null ? '' : String(office.latitude), longitude: office.longitude == null ? '' : String(office.longitude),
    isActive: office.isActive, visitDays: [...office.visitDays], openTime: hhmm(office.openTime), closeTime: hhmm(office.closeTime),
    lunchStart: hhmm(office.lunchStart), lunchEnd: hhmm(office.lunchEnd), slotMinutes: office.slotMinutes, slotCapacity: office.slotCapacity,
  });
  editing.value = office;
  formError.value = '';
  showForm.value = true;
};
const toggleDay = (day: number) => {
  form.visitDays = form.visitDays.includes(day) ? form.visitDays.filter((d) => d !== day) : [...form.visitDays, day].sort();
};

const save = async () => {
  if (saving.value) return;
  if (!form.name.trim() || !form.address.trim()) return void (formError.value = 'Nhập tên và địa chỉ trụ sở.');
  if (form.visitDays.length === 0) return void (formError.value = 'Chọn ít nhất một ngày làm việc.');
  const lat = form.latitude.trim() === '' ? null : Number(form.latitude);
  const lng = form.longitude.trim() === '' ? null : Number(form.longitude);
  if ((lat === null) !== (lng === null) || [lat, lng].some((v) => v !== null && !Number.isFinite(v))) {
    return void (formError.value = 'Vị trí cần cả vĩ độ và kinh độ hợp lệ (để gợi ý trụ sở gần nhất cho thợ).');
  }
  const hasLunch = form.lunchStart.trim() !== '' && form.lunchEnd.trim() !== '';
  const payload = {
    name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim() || null, latitude: lat, longitude: lng,
    isActive: form.isActive, visitDays: form.visitDays, openTime: form.openTime, closeTime: form.closeTime,
    lunchStart: hasLunch ? form.lunchStart : null, lunchEnd: hasLunch ? form.lunchEnd : null,
    slotMinutes: Number(form.slotMinutes), slotCapacity: Number(form.slotCapacity),
  };
  saving.value = true;
  formError.value = '';
  try {
    if (editing.value) await adminOfficeVisitsApi.updateOffice(editing.value.id, payload);
    else await adminOfficeVisitsApi.createOffice(payload);
    successMessage.value = editing.value ? 'Đã lưu trụ sở.' : 'Đã thêm trụ sở.';
    showForm.value = false;
    await load();
  } catch (reason) {
    formError.value = userFacingError(reason, 'Chưa lưu được trụ sở, vui lòng thử lại.');
  } finally {
    saving.value = false;
  }
};

const setActive = async (office: VisitOffice, isActive: boolean) => {
  error.value = '';
  try {
    await adminOfficeVisitsApi.updateOffice(office.id, { isActive });
    await load();
  } catch (reason) {
    error.value = userFacingError(reason, 'Chưa đổi được trạng thái trụ sở.');
  }
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Trụ sở nhận hồ sơ" :count="loading || loadError ? null : offices.length">
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openCreate">Thêm trụ sở</FhButton>
      </template>
    </ConsolePageHeader>
    <p class="text-sm text-ink-600 text-pretty">
      Sau khi bạn xác nhận danh tính, thợ chọn một trụ sở (mặc định là nơi gần địa chỉ của thợ nhất) và giờ hẹn để gặp trực tiếp. Số điện thoại hỗ trợ khi thợ vắng nhiều lần đặt ở trang Cấu hình (khóa <span class="font-num">office.support_phone</span>).
    </p>

    <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
    <ConsoleTable v-else :columns="columns" :rows="offices" :loading="loading" empty-text="Chưa có trụ sở nào. Thợ chưa thể đặt lịch cho tới khi bạn thêm trụ sở.">
      <template #cell-name="{ row }">
        <div class="font-medium text-ink-900">{{ row.name }}</div>
        <div class="truncate text-xs text-ink-500">{{ row.address }}</div>
      </template>
      <template #cell-hours="{ row }">
        <div class="font-num text-ink-800">{{ hhmm(row.openTime) }}–{{ hhmm(row.closeTime) }}<span v-if="row.lunchStart">, nghỉ {{ hhmm(row.lunchStart) }}–{{ hhmm(row.lunchEnd) }}</span></div>
        <div class="text-xs text-ink-500">{{ daysLabel(row.visitDays) }}</div>
      </template>
      <template #cell-capacity="{ row }"><span class="font-num text-ink-700">{{ row.slotMinutes }} phút, {{ row.slotCapacity }} thợ</span></template>
      <template #cell-status="{ row }"><FhStatusPill :status="row.isActive ? 'ACTIVE' : 'SUSPENDED'" :label="row.isActive ? 'Đang nhận' : 'Tạm ngưng'" /></template>
      <template #cell-actions="{ row }">
        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="openEdit(row)">Sửa</FhButton>
          <FhButton variant="secondary" size="sm" @click="setActive(row, !row.isActive)">{{ row.isActive ? 'Tạm ngưng' : 'Bật lại' }}</FhButton>
        </div>
      </template>
    </ConsoleTable>

    <div v-if="showForm" class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="office-form-title" @keydown.esc="showForm = false">
      <form class="my-8 w-full max-w-xl space-y-4 rounded-md bg-white p-6 shadow-xl" @submit.prevent="save">
        <h3 id="office-form-title" class="text-lg font-semibold text-ink-900">{{ editing ? 'Sửa trụ sở' : 'Thêm trụ sở' }}</h3>
        <label class="block text-sm font-medium text-ink-700">Tên trụ sở<input v-model="form.name" :class="consoleField" class="mt-1 w-full" maxlength="120" /></label>
        <label class="block text-sm font-medium text-ink-700">Địa chỉ<input v-model="form.address" :class="consoleField" class="mt-1 w-full" maxlength="500" /></label>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label class="block text-sm font-medium text-ink-700">Điện thoại<input v-model="form.phone" :class="consoleField" class="mt-1 w-full" maxlength="32" /></label>
          <label class="block text-sm font-medium text-ink-700">Vĩ độ<input v-model="form.latitude" :class="consoleField" class="mt-1 w-full font-num" inputmode="decimal" placeholder="10.7769" /></label>
          <label class="block text-sm font-medium text-ink-700">Kinh độ<input v-model="form.longitude" :class="consoleField" class="mt-1 w-full font-num" inputmode="decimal" placeholder="106.7009" /></label>
        </div>
        <fieldset>
          <legend class="text-sm font-medium text-ink-700">Ngày nhận hồ sơ</legend>
          <div class="mt-1 flex flex-wrap gap-2">
            <label v-for="day in DAYS" :key="day.value" class="flex items-center gap-1 text-sm text-ink-700"><input type="checkbox" :checked="form.visitDays.includes(day.value)" @change="toggleDay(day.value)" /> {{ day.label }}</label>
          </div>
        </fieldset>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label class="block text-sm font-medium text-ink-700">Mở cửa<input v-model="form.openTime" type="time" :class="consoleField" class="mt-1 w-full" /></label>
          <label class="block text-sm font-medium text-ink-700">Đóng cửa<input v-model="form.closeTime" type="time" :class="consoleField" class="mt-1 w-full" /></label>
          <label class="block text-sm font-medium text-ink-700">Nghỉ trưa từ<input v-model="form.lunchStart" type="time" :class="consoleField" class="mt-1 w-full" /></label>
          <label class="block text-sm font-medium text-ink-700">đến<input v-model="form.lunchEnd" type="time" :class="consoleField" class="mt-1 w-full" /></label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm font-medium text-ink-700">Độ dài mỗi lượt (phút)<input v-model.number="form.slotMinutes" type="number" min="10" max="240" :class="consoleField" class="mt-1 w-full font-num" /></label>
          <label class="block text-sm font-medium text-ink-700">Số thợ tối đa mỗi lượt<input v-model.number="form.slotCapacity" type="number" min="1" max="50" :class="consoleField" class="mt-1 w-full font-num" /></label>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-700"><input v-model="form.isActive" type="checkbox" /> Đang nhận hồ sơ</label>
        <p v-if="formError" class="text-sm text-danger-600" role="alert">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" type="button" @click="showForm = false">Huỷ</FhButton>
          <FhButton variant="primary" size="sm" type="submit" :loading="saving">Lưu</FhButton>
        </div>
      </form>
    </div>
  </div>
</template>
