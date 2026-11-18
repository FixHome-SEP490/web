<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import { FhButton, FhStatusPill } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel } from '../../../components/console/console-ui';
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
    <ConsolePageHeader class="animate-slide-up" title="Trụ sở nhận hồ sơ" :count="loading || loadError ? null : offices.length">
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openCreate">
          <Plus :size="16" aria-hidden="true" /> Thêm trụ sở
        </FhButton>
      </template>
    </ConsolePageHeader>
    <p class="animate-slide-up-delay-1 text-sm text-ink-600 text-pretty">
      Sau khi bạn xác nhận danh tính, thợ chọn một trụ sở (mặc định là nơi gần địa chỉ của thợ nhất) và giờ hẹn để gặp trực tiếp. Số điện thoại hỗ trợ khi thợ vắng nhiều lần đặt ở trang Cấu hình (khóa <span class="font-num">office.support_phone</span>).
    </p>

    <Transition name="fh-fade-slide">
      <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    </Transition>
    <Transition name="fh-fade-slide">
      <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>
    </Transition>

    <div class="animate-slide-up-delay-2">
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
    </div>

    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="showForm"
          class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="office-form-title"
          @click.self="showForm = false"
          @keydown.esc="showForm = false"
        >
          <form class="fh-modal-panel flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-white shadow-(--shadow-e3)" @submit.prevent="save">
            <div class="flex items-center justify-between border-b border-ink-200 bg-ink-25/60 px-6 py-4">
              <h3 id="office-form-title" class="text-base font-semibold text-ink-900">{{ editing ? 'Sửa trụ sở' : 'Thêm trụ sở' }}</h3>
              <button type="button" class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="showForm = false">
                <X :size="18" aria-hidden="true" />
              </button>
            </div>
            <div class="flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
              <label :class="consoleLabel">Tên trụ sở<input v-model="form.name" :class="consoleField" class="w-full" maxlength="120" /></label>
              <label :class="consoleLabel">Địa chỉ<input v-model="form.address" :class="consoleField" class="w-full" maxlength="500" /></label>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label :class="consoleLabel">Điện thoại<input v-model="form.phone" :class="consoleField" class="w-full font-num" maxlength="32" /></label>
                <label :class="consoleLabel">Vĩ độ<input v-model="form.latitude" :class="consoleField" class="w-full font-num" inputmode="decimal" placeholder="10.7769" /></label>
                <label :class="consoleLabel">Kinh độ<input v-model="form.longitude" :class="consoleField" class="w-full font-num" inputmode="decimal" placeholder="106.7009" /></label>
              </div>
              <fieldset>
                <legend class="text-sm font-medium text-ink-700">Ngày nhận hồ sơ</legend>
                <div class="mt-1.5 flex flex-wrap gap-2">
                  <label
                    v-for="day in DAYS"
                    :key="day.value"
                    class="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm transition-colors"
                    :class="form.visitDays.includes(day.value) ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                  >
                    <input type="checkbox" class="h-3.5 w-3.5 accent-brand-600" :checked="form.visitDays.includes(day.value)" @change="toggleDay(day.value)" /> {{ day.label }}
                  </label>
                </div>
              </fieldset>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label :class="consoleLabel">Mở cửa<input v-model="form.openTime" type="time" :class="consoleField" class="w-full font-num" /></label>
                <label :class="consoleLabel">Đóng cửa<input v-model="form.closeTime" type="time" :class="consoleField" class="w-full font-num" /></label>
                <label :class="consoleLabel">Nghỉ trưa từ<input v-model="form.lunchStart" type="time" :class="consoleField" class="w-full font-num" /></label>
                <label :class="consoleLabel">đến<input v-model="form.lunchEnd" type="time" :class="consoleField" class="w-full font-num" /></label>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <label :class="consoleLabel">Độ dài mỗi lượt (phút)<input v-model.number="form.slotMinutes" type="number" min="10" max="240" :class="consoleField" class="w-full font-num" /></label>
                <label :class="consoleLabel">Số thợ tối đa mỗi lượt<input v-model.number="form.slotCapacity" type="number" min="1" max="50" :class="consoleField" class="w-full font-num" /></label>
              </div>
              <label class="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input v-model="form.isActive" type="checkbox" class="h-4 w-4 accent-brand-600" /> Đang nhận hồ sơ
              </label>
              <Transition name="fh-fade-slide">
                <p v-if="formError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">{{ formError }}</p>
              </Transition>
            </div>
            <div class="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-25/60 px-6 py-4">
              <FhButton variant="secondary" size="sm" type="button" @click="showForm = false">Huỷ</FhButton>
              <FhButton variant="primary" size="sm" type="submit" :loading="saving">Lưu</FhButton>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
