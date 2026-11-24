<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  Building2,
  Calendar,
  Clock,
  Info,
  MapPin,
  Phone,
  Settings,
  Users,
  Check,
  AlertCircle,
} from 'lucide-vue-next';
import type { VisitOffice, VisitOfficeInput } from '../../api/admin-office-visits.api';

export interface FormOfficeData {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
  visitDays: number[];
  openTime: string;
  closeTime: string;
  lunchStart: string;
  lunchEnd: string;
  slotMinutes: number;
  slotCapacity: number;
  isActive: boolean;
}

const props = withDefaults(
  defineProps<{
    initialData?: Partial<VisitOffice> | null;
    saving?: boolean;
    serverError?: string;
    submitLabel?: string;
    cancelLabel?: string;
    showFooter?: boolean;
  }>(),
  {
    initialData: null,
    saving: false,
    serverError: '',
    submitLabel: 'Lưu',
    cancelLabel: 'Hủy',
    showFooter: true,
  },
);

const emit = defineEmits<{
  (e: 'submit', payload: VisitOfficeInput): void;
  (e: 'cancel'): void;
  (e: 'dirtyChange', isDirty: boolean): void;
}>();

const DAYS = [
  { value: 1, label: 'T2', full: 'Thứ 2' },
  { value: 2, label: 'T3', full: 'Thứ 3' },
  { value: 3, label: 'T4', full: 'Thứ 4' },
  { value: 4, label: 'T5', full: 'Thứ 5' },
  { value: 5, label: 'T6', full: 'Thứ 6' },
  { value: 6, label: 'T7', full: 'Thứ 7' },
  { value: 7, label: 'CN', full: 'Chủ nhật' },
];

const hhmm = (v?: string | null) => (v ? v.slice(0, 5) : '');

const getDefaultState = (): FormOfficeData => ({
  name: '',
  address: '',
  phone: '',
  latitude: '',
  longitude: '',
  visitDays: [1, 2, 3, 4, 5],
  openTime: '08:00',
  closeTime: '17:00',
  lunchStart: '11:30',
  lunchEnd: '13:30',
  slotMinutes: 30,
  slotCapacity: 2,
  isActive: true,
});

const form = reactive<FormOfficeData>(getDefaultState());
const initialSnapshot = ref<string>('');
const clientError = ref('');

const syncFromInitial = () => {
  if (props.initialData) {
    const o = props.initialData;
    form.name = o.name ?? '';
    form.address = o.address ?? '';
    form.phone = o.phone ?? '';
    form.latitude = o.latitude == null ? '' : String(o.latitude);
    form.longitude = o.longitude == null ? '' : String(o.longitude);
    form.visitDays = Array.isArray(o.visitDays) && o.visitDays.length > 0 ? [...o.visitDays] : [1, 2, 3, 4, 5];
    form.openTime = hhmm(o.openTime) || '08:00';
    form.closeTime = hhmm(o.closeTime) || '17:00';
    form.lunchStart = hhmm(o.lunchStart) || '';
    form.lunchEnd = hhmm(o.lunchEnd) || '';
    form.slotMinutes = typeof o.slotMinutes === 'number' ? o.slotMinutes : 30;
    form.slotCapacity = typeof o.slotCapacity === 'number' ? o.slotCapacity : 2;
    form.isActive = o.isActive !== undefined ? o.isActive : true;
  } else {
    Object.assign(form, getDefaultState());
  }
  initialSnapshot.value = JSON.stringify(form);
  clientError.value = '';
};

watch(() => props.initialData, syncFromInitial, { immediate: true });

const isDirty = computed(() => {
  return initialSnapshot.value !== JSON.stringify(form);
});

watch(isDirty, (dirty) => {
  emit('dirtyChange', dirty);
});

const toggleDay = (dayValue: number) => {
  if (form.visitDays.includes(dayValue)) {
    form.visitDays = form.visitDays.filter((d) => d !== dayValue);
  } else {
    form.visitDays = [...form.visitDays, dayValue].sort((a, b) => a - b);
  }
};

const toMinutes = (timeStr: string): number | null => {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
};

const validate = (): string => {
  if (!form.name.trim()) return 'Vui lòng nhập tên trụ sở.';
  if (form.name.trim().length > 120) return 'Tên trụ sở tối đa 120 ký tự.';
  if (!form.address.trim()) return 'Vui lòng nhập địa chỉ trụ sở.';
  if (form.address.trim().length > 500) return 'Địa chỉ trụ sở tối đa 500 ký tự.';

  if (form.phone.trim() && form.phone.trim().length > 32) {
    return 'Số điện thoại tối đa 32 ký tự.';
  }

  const latTrim = form.latitude.trim();
  const lngTrim = form.longitude.trim();
  const hasLat = latTrim !== '';
  const hasLng = lngTrim !== '';

  if (hasLat !== hasLng) {
    return 'Vị trí cần cung cấp cả vĩ độ và kinh độ (hoặc để trống cả hai).';
  }

  if (hasLat && hasLng) {
    const lat = Number(latTrim);
    const lng = Number(lngTrim);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return 'Vĩ độ không hợp lệ (giá trị từ -90 đến 90, VD: 10.7769).';
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return 'Kinh độ không hợp lệ (giá trị từ -180 đến 180, VD: 106.7009).';
    }
  }

  if (form.visitDays.length === 0) {
    return 'Vui lòng chọn ít nhất một ngày nhận hồ sơ trong tuần.';
  }

  const openMin = toMinutes(form.openTime);
  const closeMin = toMinutes(form.closeTime);

  if (openMin === null || closeMin === null) {
    return 'Vui lòng chọn giờ mở cửa và giờ đóng cửa hợp lệ.';
  }
  if (openMin >= closeMin) {
    return 'Giờ mở cửa phải trước giờ đóng cửa.';
  }

  const lunchStartTrim = form.lunchStart.trim();
  const lunchEndTrim = form.lunchEnd.trim();
  const hasLunchStart = lunchStartTrim !== '';
  const hasLunchEnd = lunchEndTrim !== '';

  if (hasLunchStart !== hasLunchEnd) {
    return 'Nghỉ trưa cần chọn cả thời gian bắt đầu và kết thúc (hoặc để trống nếu không nghỉ trưa).';
  }

  if (hasLunchStart && hasLunchEnd) {
    const lsMin = toMinutes(lunchStartTrim);
    const leMin = toMinutes(lunchEndTrim);
    if (lsMin === null || leMin === null) {
      return 'Thời gian nghỉ trưa không hợp lệ.';
    }
    if (lsMin >= leMin) {
      return 'Giờ bắt đầu nghỉ trưa phải trước giờ kết thúc nghỉ trưa.';
    }
    if (lsMin < openMin || leMin > closeMin) {
      return 'Thời gian nghỉ trưa phải nằm trong khoảng giờ làm việc (mở cửa - đóng cửa).';
    }
  }

  const slotMin = Number(form.slotMinutes);
  if (!Number.isInteger(slotMin) || slotMin < 10 || slotMin > 240) {
    return 'Độ dài mỗi lượt phải từ 10 đến 240 phút.';
  }

  const capacity = Number(form.slotCapacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
    return 'Số thợ tối đa mỗi lượt phải từ 1 đến 50 người.';
  }

  return '';
};

const handleSubmit = () => {
  clientError.value = '';
  const err = validate();
  if (err) {
    clientError.value = err;
    return;
  }

  const lat = form.latitude.trim() === '' ? null : Number(form.latitude.trim());
  const lng = form.longitude.trim() === '' ? null : Number(form.longitude.trim());
  const hasLunch = form.lunchStart.trim() !== '' && form.lunchEnd.trim() !== '';

  const payload: VisitOfficeInput = {
    name: form.name.trim(),
    address: form.address.trim(),
    phone: form.phone.trim() || null,
    latitude: lat,
    longitude: lng,
    isActive: form.isActive,
    visitDays: [...form.visitDays].sort((a, b) => a - b),
    openTime: form.openTime,
    closeTime: form.closeTime,
    lunchStart: hasLunch ? form.lunchStart : null,
    lunchEnd: hasLunch ? form.lunchEnd : null,
    slotMinutes: Number(form.slotMinutes),
    slotCapacity: Number(form.slotCapacity),
  };

  emit('submit', payload);
};

defineExpose({
  handleSubmit,
  isDirty,
  reset: syncFromInitial,
  form,
});
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <!-- Server or client validation error -->
    <div
      v-if="clientError || serverError"
      class="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800"
      role="alert"
    >
      <AlertCircle :size="16" class="shrink-0 text-rose-600 mt-0.5" />
      <span class="font-medium leading-relaxed">{{ clientError || serverError }}</span>
    </div>

    <!-- 1. THÔNG TIN CƠ BẢN -->
    <section class="space-y-3.5">
      <div class="flex items-center gap-2 border-b border-ink-100 pb-2">
        <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Info :size="15" :stroke-width="2.2" />
        </div>
        <h3 class="text-sm font-bold tracking-tight text-ink-900">Thông tin cơ bản</h3>
      </div>

      <div class="space-y-3">
        <!-- Tên trụ sở -->
        <div>
          <label for="office-name" class="mb-1 block text-xs font-semibold text-ink-700">
            Tên trụ sở <span class="text-rose-500">*</span>
          </label>
          <div class="relative">
            <Building2 :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              id="office-name"
              v-model="form.name"
              type="text"
              maxlength="120"
              placeholder="Nhập tên trụ sở"
              class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              required
            />
          </div>
        </div>

        <!-- Địa chỉ -->
        <div>
          <label for="office-address" class="mb-1 block text-xs font-semibold text-ink-700">
            Địa chỉ <span class="text-rose-500">*</span>
          </label>
          <div class="relative">
            <MapPin :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              id="office-address"
              v-model="form.address"
              type="text"
              maxlength="500"
              placeholder="Nhập địa chỉ chi tiết"
              class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              required
            />
          </div>
        </div>

        <!-- Row: Điện thoại, Vĩ độ, Kinh độ -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <!-- Điện thoại -->
          <div>
            <label for="office-phone" class="mb-1 block text-xs font-semibold text-ink-700">
              Điện thoại
            </label>
            <div class="relative">
              <Phone :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="office-phone"
                v-model="form.phone"
                type="tel"
                maxlength="32"
                placeholder="Nhập số điện thoại"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-8.5 pr-3 font-num text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              />
            </div>
          </div>

          <!-- Vĩ độ -->
          <div>
            <label for="office-lat" class="mb-1 block text-xs font-semibold text-ink-700">
              Vĩ độ
            </label>
            <div class="relative">
              <MapPin :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="office-lat"
                v-model="form.latitude"
                type="text"
                inputmode="decimal"
                placeholder="Ví dụ: 10.7769"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-8.5 pr-3 font-num text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              />
            </div>
          </div>

          <!-- Kinh độ -->
          <div>
            <label for="office-lng" class="mb-1 block text-xs font-semibold text-ink-700">
              Kinh độ
            </label>
            <div class="relative">
              <MapPin :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="office-lng"
                v-model="form.longitude"
                type="text"
                inputmode="decimal"
                placeholder="Ví dụ: 106.7009"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-8.5 pr-3 font-num text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. LỊCH NHẬN HỒ SƠ -->
    <section class="space-y-3.5">
      <div class="flex items-center gap-2 border-b border-ink-100 pb-2">
        <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Calendar :size="15" :stroke-width="2.2" />
        </div>
        <h3 class="text-sm font-bold tracking-tight text-ink-900">Lịch nhận hồ sơ</h3>
      </div>

      <!-- Ngày nhận hồ sơ (T2 - CN) -->
      <div>
        <span class="mb-2 block text-xs font-semibold text-ink-700">
          Ngày nhận hồ sơ <span class="text-rose-500">*</span>
        </span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="day in DAYS"
            :key="day.value"
            type="button"
            :aria-pressed="form.visitDays.includes(day.value)"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all cursor-pointer"
            :class="
              form.visitDays.includes(day.value)
                ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold shadow-xs'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50/60'
            "
            @click="toggleDay(day.value)"
          >
            <Check
              v-if="form.visitDays.includes(day.value)"
              :size="13"
              class="text-brand-600"
              :stroke-width="2.5"
            />
            <span>{{ day.label }}</span>
          </button>
        </div>
      </div>

      <!-- Giờ làm việc & Nghỉ trưa (Định dạng 24h) -->
      <div>
        <span class="mb-2 block text-xs font-semibold text-ink-700">
          Thời gian làm việc (24h) <span class="text-rose-500">*</span>
        </span>
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <!-- Mở cửa -->
          <div>
            <label for="open-time" class="mb-1 block text-2xs font-medium text-ink-500">Mở cửa</label>
            <div class="relative">
              <Clock :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="open-time"
                v-model="form.openTime"
                type="time"
                step="900"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 font-num text-sm text-ink-900 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
                required
              />
            </div>
          </div>

          <!-- Đóng cửa -->
          <div>
            <label for="close-time" class="mb-1 block text-2xs font-medium text-ink-500">Đóng cửa</label>
            <div class="relative">
              <Clock :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="close-time"
                v-model="form.closeTime"
                type="time"
                step="900"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 font-num text-sm text-ink-900 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
                required
              />
            </div>
          </div>

          <!-- Nghỉ trưa từ -->
          <div>
            <label for="lunch-start" class="mb-1 block text-2xs font-medium text-ink-500">Nghỉ trưa từ</label>
            <div class="relative">
              <Clock :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="lunch-start"
                v-model="form.lunchStart"
                type="time"
                step="900"
                placeholder="--:--"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 font-num text-sm text-ink-900 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              />
            </div>
          </div>

          <!-- Đến -->
          <div>
            <label for="lunch-end" class="mb-1 block text-2xs font-medium text-ink-500">đến</label>
            <div class="relative">
              <Clock :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="lunch-end"
                v-model="form.lunchEnd"
                type="time"
                step="900"
                placeholder="--:--"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 font-num text-sm text-ink-900 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              />
            </div>
          </div>
        </div>
        <p class="mt-1 text-2xs text-ink-400">Để trống giờ nghỉ trưa nếu làm việc liên tục cả ngày.</p>
      </div>
    </section>

    <!-- 3. CẤU HÌNH TIẾP NHẬN -->
    <section class="space-y-3.5">
      <div class="flex items-center gap-2 border-b border-ink-100 pb-2">
        <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Settings :size="15" :stroke-width="2.2" />
        </div>
        <h3 class="text-sm font-bold tracking-tight text-ink-900">Cấu hình tiếp nhận</h3>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <!-- Độ dài mỗi lượt (phút) -->
        <div>
          <label for="slot-minutes" class="mb-1 block text-xs font-semibold text-ink-700">
            Độ dài mỗi lượt (phút) <span class="text-rose-500">*</span>
          </label>
          <div class="relative">
            <Clock :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              id="slot-minutes"
              v-model.number="form.slotMinutes"
              type="number"
              min="10"
              max="240"
              step="5"
              class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-8.5 pr-3 font-num text-sm text-ink-900 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              required
            />
          </div>
        </div>

        <!-- Số thợ tối đa mỗi lượt -->
        <div>
          <label for="slot-capacity" class="mb-1 block text-xs font-semibold text-ink-700">
            Số thợ tối đa mỗi lượt <span class="text-rose-500">*</span>
          </label>
          <div class="relative">
            <Users :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              id="slot-capacity"
              v-model.number="form.slotCapacity"
              type="number"
              min="1"
              max="50"
              class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-8.5 pr-3 font-num text-sm text-ink-900 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              required
            />
          </div>
        </div>
      </div>

      <!-- Trạng thái công tắc -->
      <div class="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-25/50 px-4 py-3">
        <div>
          <div class="text-xs font-semibold text-ink-900">Trạng thái tiếp nhận</div>
          <div class="text-2xs text-ink-500">Cho phép kỹ thuật viên đặt lịch hẹn tại trụ sở này</div>
        </div>
        <label class="relative inline-flex cursor-pointer items-center gap-2.5">
          <input
            v-model="form.isActive"
            type="checkbox"
            class="peer sr-only"
          />
          <div
            class="peer relative h-6 w-11 rounded-full bg-ink-200 transition-colors after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/20"
          ></div>
          <span
            class="text-xs font-medium"
            :class="form.isActive ? 'text-brand-700' : 'text-ink-500'"
          >
            {{ form.isActive ? 'Đang nhận hồ sơ' : 'Tạm ngưng nhận' }}
          </span>
        </label>
      </div>
    </section>

    <!-- Optional Default Footer -->
    <div v-if="showFooter" class="flex items-center justify-end gap-2.5 pt-2 border-t border-ink-100">
      <button
        type="button"
        class="inline-flex h-9 items-center justify-center rounded-xl border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
        :disabled="saving"
        @click="emit('cancel')"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="submit"
        class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 cursor-pointer"
        :disabled="saving"
      >
        <span v-if="saving" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
        <span>{{ submitLabel }}</span>
      </button>
    </div>
  </form>
</template>