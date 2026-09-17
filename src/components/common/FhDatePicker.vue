<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    minDate?: Date;
  }>(),
  {
    minDate: () => new Date(),
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const now = new Date();
const todayYear = now.getFullYear();
const todayMonth = now.getMonth();
const todayDate = now.getDate();

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const todayIso = `${todayYear}-${pad(todayMonth + 1)}-${pad(todayDate)}`;

// Calculate tomorrow and weekend ISO
const tomorrowDate = new Date(now);
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
const tomorrowIso = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;

const weekendDate = new Date(now);
weekendDate.setDate(weekendDate.getDate() + ((6 - weekendDate.getDay() + 7) % 7 || 7));
const weekendIso = `${weekendDate.getFullYear()}-${pad(weekendDate.getMonth() + 1)}-${pad(weekendDate.getDate())}`;

// Active view month/year
const currentYear = ref(todayYear);
const currentMonth = ref(todayMonth); // 0-indexed (0 = Jan, 8 = Sep)

// Helper to resolve modelValue to ISO date
const resolvedSelectedIso = computed(() => {
  if (props.modelValue === 'TODAY') return todayIso;
  if (props.modelValue === 'TOMORROW') return tomorrowIso;
  if (props.modelValue === 'WEEKEND') return weekendIso;
  return props.modelValue || todayIso;
});

// Sync calendar view to selected date when changed externally
watch(
  () => resolvedSelectedIso.value,
  (iso) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m] = iso.split('-').map(Number);
      currentYear.value = y;
      currentMonth.value = m - 1;
    }
  },
  { immediate: true },
);

const monthNamesVi = [
  'Tháng 01', 'Tháng 02', 'Tháng 03', 'Tháng 04',
  'Tháng 05', 'Tháng 06', 'Tháng 07', 'Tháng 08',
  'Tháng 09', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const dayNamesVi = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const canGoPrevMonth = computed(() => {
  if (currentYear.value > todayYear) return true;
  return currentMonth.value > todayMonth;
});

const prevMonth = () => {
  if (!canGoPrevMonth.value) return;
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
};

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
};

interface CalendarCell {
  dayNumber: number;
  iso: string;
  isCurrentMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const calendarDays = computed(() => {
  const days: CalendarCell[] = [];
  const y = currentYear.value;
  const m = currentMonth.value;

  // Day of week for 1st of month (0 = Sun, 1 = Mon ... 6 = Sat)
  const firstDay = new Date(y, m, 1).getDay();
  // We want Monday as index 0 (T2 = 0 ... CN = 6)
  const offset = (firstDay + 6) % 7;

  // Total days in current month
  const totalDays = new Date(y, m + 1, 0).getDate();

  // Days in previous month for padding
  const prevMonthTotalDays = new Date(y, m, 0).getDate();

  // Previous month cells
  for (let i = offset - 1; i >= 0; i--) {
    const d = prevMonthTotalDays - i;
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const iso = `${prevY}-${pad(prevM + 1)}-${pad(d)}`;
    days.push({
      dayNumber: d,
      iso,
      isCurrentMonth: false,
      isPast: true, // Past or out-of-month is disabled
      isToday: false,
      isSelected: false,
    });
  }

  // Current month cells
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    const cellDate = new Date(y, m, d);
    const todayZero = new Date(todayYear, todayMonth, todayDate);
    const isPast = cellDate < todayZero;
    const isToday = iso === todayIso;
    const isSelected = iso === resolvedSelectedIso.value;

    days.push({
      dayNumber: d,
      iso,
      isCurrentMonth: true,
      isPast,
      isToday,
      isSelected,
    });
  }

  // Next month cells to round up to complete week (multiple of 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextM = m === 11 ? 0 : m + 1;
    const nextY = m === 11 ? y + 1 : y;
    const iso = `${nextY}-${pad(nextM + 1)}-${pad(d)}`;
    days.push({
      dayNumber: d,
      iso,
      isCurrentMonth: false,
      isPast: false,
      isToday: false,
      isSelected: false,
    });
  }

  return days;
});

const selectDate = (iso: string, isPast: boolean, isCurrentMonth: boolean) => {
  if (isPast || !isCurrentMonth) return;
  emit('update:modelValue', iso);
};

const selectQuick = (type: 'TODAY' | 'TOMORROW' | 'WEEKEND') => {
  if (type === 'TODAY') emit('update:modelValue', todayIso);
  else if (type === 'TOMORROW') emit('update:modelValue', tomorrowIso);
  else if (type === 'WEEKEND') emit('update:modelValue', weekendIso);
};

// Formatted display in Vietnamese
const selectedFormatted = computed(() => {
  const iso = resolvedSelectedIso.value;
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const daysOfWeek = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const dayName = daysOfWeek[dateObj.getDay()];
  const isToday = iso === todayIso;
  const isTomorrow = iso === tomorrowIso;

  let suffix = '';
  if (isToday) suffix = ' (Hôm nay)';
  else if (isTomorrow) suffix = ' (Ngày mai)';

  return `${dayName}, ${pad(d)}/${pad(m)}/${y}${suffix}`;
});
</script>

<template>
  <div class="bg-white rounded-2xl border border-ink-200 p-3.5 sm:p-4 shadow-xs space-y-3 select-none">
    <!-- Quick Select Chips -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        :class="resolvedSelectedIso === todayIso ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'"
        @click="selectQuick('TODAY')"
      >
        Hôm nay
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        :class="resolvedSelectedIso === tomorrowIso ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'"
        @click="selectQuick('TOMORROW')"
      >
        Ngày mai
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        :class="resolvedSelectedIso === weekendIso ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'"
        @click="selectQuick('WEEKEND')"
      >
        Cuối tuần này
      </button>
    </div>

    <!-- Calendar Month Navigation -->
    <div class="flex items-center justify-between px-1 pt-1">
      <div class="font-bold text-ink-900 text-sm flex items-center gap-1.5">
        <CalendarIcon :size="16" class="text-brand-600" />
        <span>{{ monthNamesVi[currentMonth] }}, {{ currentYear }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          :disabled="!canGoPrevMonth"
          class="w-7 h-7 flex items-center justify-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Tháng trước"
          @click="prevMonth"
        >
          <ChevronLeft :size="15" />
        </button>
        <button
          type="button"
          class="w-7 h-7 flex items-center justify-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-100 transition-colors"
          title="Tháng sau"
          @click="nextMonth"
        >
          <ChevronRight :size="15" />
        </button>
      </div>
    </div>

    <!-- Days of Week Header -->
    <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-ink-400 py-1">
      <div v-for="d in dayNamesVi" :key="d" :class="d === 'CN' ? 'text-rose-500' : ''">
        {{ d }}
      </div>
    </div>

    <!-- Calendar Days Grid -->
    <div class="grid grid-cols-7 gap-1">
      <button
        v-for="(cell, idx) in calendarDays"
        :key="idx"
        type="button"
        :disabled="cell.isPast || !cell.isCurrentMonth"
        class="h-8 sm:h-9 flex flex-col items-center justify-center rounded-xl text-xs font-semibold relative transition-all"
        :class="[
          !cell.isCurrentMonth ? 'opacity-20 cursor-default pointer-events-none' : '',
          cell.isPast && cell.isCurrentMonth ? 'text-ink-300 cursor-not-allowed line-through decoration-ink-300/60' : '',
          cell.isSelected
            ? 'bg-brand-600 text-white shadow-xs font-bold ring-2 ring-brand-300 scale-105 z-10'
            : !cell.isPast && cell.isCurrentMonth
              ? 'text-ink-800 hover:bg-brand-50 hover:text-brand-700 active:scale-95'
              : '',
        ]"
        @click="selectDate(cell.iso, cell.isPast, cell.isCurrentMonth)"
      >
        <span>{{ cell.dayNumber }}</span>
        <!-- Small dot indicator for Today when not selected -->
        <span
          v-if="cell.isToday && !cell.isSelected"
          class="w-1 h-1 rounded-full bg-brand-600 absolute bottom-1"
        />
      </button>
    </div>

    <!-- Selected Date Feedback Badge -->
    <div class="p-2.5 rounded-xl bg-brand-50/70 border border-brand-200 flex items-center justify-between text-xs">
      <span class="text-brand-900 font-medium">Lịch đã chọn:</span>
      <span class="font-bold text-brand-800">{{ selectedFormatted }}</span>
    </div>
  </div>
</template>
