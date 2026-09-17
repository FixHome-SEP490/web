<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { Clock, Zap, AlertCircle } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    selectedDate?: string;
  }>(),
  {
    selectedDate: '',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

// Hours range: 07 to 21
const hours = Array.from({ length: 15 }, (_, i) => {
  const h = i + 7;
  return h < 10 ? `0${h}` : `${h}`;
});

// Minutes options
const minutes = ['00', '15', '30', '45'];

// Mode: 'EARLIEST' or 'CUSTOM'
const mode = ref<'EARLIEST' | 'CUSTOM'>('EARLIEST');

const selectedHour = ref('08');
const selectedMinute = ref('00');

// Column container refs for scrolling
const hourColRef = ref<HTMLElement | null>(null);
const minColRef = ref<HTMLElement | null>(null);

const ITEM_HEIGHT = 40; // 40px per item row

// Helper to determine if selectedDate is today
const isToday = computed(() => {
  if (!props.selectedDate) return true;
  if (props.selectedDate === 'TODAY') return true;
  const now = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return props.selectedDate === todayIso;
});

// Initialize from props
watch(
  () => props.modelValue,
  (val) => {
    if (val === 'EARLIEST') {
      mode.value = 'EARLIEST';
    } else if (/^\d{1,2}:\d{2}$/.test(val)) {
      mode.value = 'CUSTOM';
      const [h, m] = val.split(':');
      selectedHour.value = h.padStart(2, '0');
      // match nearest minute in list
      const nearestMin = minutes.includes(m) ? m : '00';
      selectedMinute.value = nearestMin;
      scrollToSelected();
    } else if (['MORNING', 'AFTERNOON', 'EVENING'].includes(val)) {
      mode.value = 'CUSTOM';
      if (val === 'MORNING') {
        selectedHour.value = '08';
        selectedMinute.value = '30';
      } else if (val === 'AFTERNOON') {
        selectedHour.value = '14';
        selectedMinute.value = '00';
      } else if (val === 'EVENING') {
        selectedHour.value = '18';
        selectedMinute.value = '30';
      }
      scrollToSelected();
    }
  },
  { immediate: true },
);

// Scroll columns to the currently selected values
const scrollToSelected = () => {
  nextTick(() => {
    if (hourColRef.value) {
      const hIdx = hours.indexOf(selectedHour.value);
      if (hIdx >= 0) {
        hourColRef.value.scrollTo({
          top: hIdx * ITEM_HEIGHT,
          behavior: 'smooth',
        });
      }
    }
    if (minColRef.value) {
      const mIdx = minutes.indexOf(selectedMinute.value);
      if (mIdx >= 0) {
        minColRef.value.scrollTo({
          top: mIdx * ITEM_HEIGHT,
          behavior: 'smooth',
        });
      }
    }
  });
};

onMounted(() => {
  if (mode.value === 'CUSTOM') {
    scrollToSelected();
  }
});

// Switch mode
const setMode = (newMode: 'EARLIEST' | 'CUSTOM') => {
  mode.value = newMode;
  if (newMode === 'EARLIEST') {
    emit('update:modelValue', 'EARLIEST');
  } else {
    // If today, check if default selectedHour is in the past
    if (isToday.value) {
      const now = new Date();
      const currentH = now.getHours();
      if (Number(selectedHour.value) <= currentH) {
        const nextValidH = Math.min(Math.max(currentH + 1, 7), 21);
        selectedHour.value = nextValidH < 10 ? `0${nextValidH}` : `${nextValidH}`;
      }
    }
    emitTimeChange();
    scrollToSelected();
  }
};

const emitTimeChange = () => {
  emit('update:modelValue', `${selectedHour.value}:${selectedMinute.value}`);
};

// Select via clicking a number in wheel
const selectHour = (h: string) => {
  selectedHour.value = h;
  emitTimeChange();
  scrollToSelected();
};

const selectMinute = (m: string) => {
  selectedMinute.value = m;
  emitTimeChange();
  scrollToSelected();
};

// Handle wheel scroll event with debounce / snap detection
let hourScrollTimeout: ReturnType<typeof setTimeout> | null = null;
const onHourScroll = () => {
  if (!hourColRef.value) return;
  if (hourScrollTimeout) clearTimeout(hourScrollTimeout);
  hourScrollTimeout = setTimeout(() => {
    if (!hourColRef.value) return;
    const top = hourColRef.value.scrollTop;
    const idx = Math.round(top / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(idx, hours.length - 1));
    const h = hours[clampedIdx];
    if (h && h !== selectedHour.value) {
      selectedHour.value = h;
      emitTimeChange();
    }
  }, 100);
};

let minScrollTimeout: ReturnType<typeof setTimeout> | null = null;
const onMinScroll = () => {
  if (!minColRef.value) return;
  if (minScrollTimeout) clearTimeout(minScrollTimeout);
  minScrollTimeout = setTimeout(() => {
    if (!minColRef.value) return;
    const top = minColRef.value.scrollTop;
    const idx = Math.round(top / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(idx, minutes.length - 1));
    const m = minutes[clampedIdx];
    if (m && m !== selectedMinute.value) {
      selectedMinute.value = m;
      emitTimeChange();
    }
  }, 100);
};

// Quick preset times
const applyPreset = (h: string, m: string) => {
  mode.value = 'CUSTOM';
  selectedHour.value = h;
  selectedMinute.value = m;
  emitTimeChange();
  scrollToSelected();
};

// Check if current selection is in the past for today
const isTimePastForToday = computed(() => {
  if (!isToday.value || mode.value === 'EARLIEST') return false;
  const now = new Date();
  const selectedDate = new Date();
  selectedDate.setHours(Number(selectedHour.value), Number(selectedMinute.value), 0, 0);
  return selectedDate <= now;
});

// Computed arrival window end time
const endTimeDisplay = computed(() => {
  const h = Number(selectedHour.value) + 2;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  return `${hStr}:${selectedMinute.value}`;
});
</script>

<template>
  <div class="bg-white rounded-2xl border border-ink-200 p-3.5 sm:p-4 shadow-xs space-y-3 select-none">
    <!-- Mode Switch Tabs -->
    <div class="grid grid-cols-2 gap-2 p-1 bg-ink-100/80 rounded-xl">
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all"
        :class="
          mode === 'EARLIEST'
            ? 'bg-white text-brand-700 shadow-xs'
            : 'text-ink-600 hover:text-ink-900'
        "
        @click="setMode('EARLIEST')"
      >
        <Zap :size="14" class="text-amber-500 fill-amber-500" />
        <span>Sớm nhất (Có mặt ngay)</span>
      </button>

      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all"
        :class="
          mode === 'CUSTOM'
            ? 'bg-white text-brand-700 shadow-xs'
            : 'text-ink-600 hover:text-ink-900'
        "
        @click="setMode('CUSTOM')"
      >
        <Clock :size="14" class="text-brand-600" />
        <span>Chọn giờ cụ thể</span>
      </button>
    </div>

    <!-- Mode: Earliest Info -->
    <div
      v-if="mode === 'EARLIEST'"
      class="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 space-y-1.5"
    >
      <div class="flex items-center gap-2 font-bold text-xs">
        <Zap :size="15" class="text-amber-600 shrink-0" />
        <span>Điều phối kỹ thuật viên tức thì</span>
      </div>
      <p class="text-[11px] text-amber-800 leading-relaxed">
        Thợ gần nhất trong khu vực sẽ liên hệ xác nhận và di chuyển tới nhà bạn trong vòng <strong>30 – 60 phút</strong>.
      </p>
    </div>

    <!-- Mode: Custom Scroll Wheel Picker -->
    <div v-else class="space-y-3">
      <!-- Quick Preset Shortcuts -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
          :class="
            selectedHour === '08' && selectedMinute === '30'
              ? 'bg-brand-50 border-brand-500 text-brand-700'
              : 'bg-ink-50 border-ink-200 text-ink-600 hover:bg-ink-100'
          "
          @click="applyPreset('08', '30')"
        >
          Sáng: 08:30
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
          :class="
            selectedHour === '11' && selectedMinute === '30'
              ? 'bg-brand-50 border-brand-500 text-brand-700'
              : 'bg-ink-50 border-ink-200 text-ink-600 hover:bg-ink-100'
          "
          @click="applyPreset('11', '30')"
        >
          Trưa: 11:30
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
          :class="
            selectedHour === '14' && selectedMinute === '00'
              ? 'bg-brand-50 border-brand-500 text-brand-700'
              : 'bg-ink-50 border-ink-200 text-ink-600 hover:bg-ink-100'
          "
          @click="applyPreset('14', '00')"
        >
          Chiều: 14:00
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
          :class="
            selectedHour === '18' && selectedMinute === '30'
              ? 'bg-brand-50 border-brand-500 text-brand-700'
              : 'bg-ink-50 border-ink-200 text-ink-600 hover:bg-ink-100'
          "
          @click="applyPreset('18', '30')"
        >
          Tối: 18:30
        </button>
      </div>

      <!-- Column Headers -->
      <div class="grid grid-cols-2 text-center text-[11px] font-bold text-ink-500 uppercase tracking-wider pt-1">
        <span>Giờ</span>
        <span>Phút</span>
      </div>

      <!-- Time Scroll Wheel Container (Drum Roll Style) -->
      <div class="relative bg-ink-50/70 border border-ink-200 rounded-xl overflow-hidden h-[180px]">
        <!-- Top Gradient Fade Overlay -->
        <div
          class="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-ink-50 via-ink-50/85 to-transparent pointer-events-none z-20"
        />

        <!-- Center Highlight Lens / Selection Bar -->
        <div
          class="absolute top-[70px] left-3 right-3 h-10 rounded-xl bg-brand-500/10 border-y-2 border-brand-500/50 pointer-events-none z-10 flex items-center justify-center"
        >
          <span class="text-brand-700 font-extrabold text-base select-none leading-none opacity-40">:</span>
        </div>

        <!-- Bottom Gradient Fade Overlay -->
        <div
          class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-ink-50 via-ink-50/85 to-transparent pointer-events-none z-20"
        />


        <!-- Two Wheel Columns -->
        <div class="grid grid-cols-2 h-full">
          <!-- Column 1: Giờ (Hours) -->
          <div
            ref="hourColRef"
            class="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar py-[70px] text-center"
            @scroll="onHourScroll"
          >
            <div
              v-for="h in hours"
              :key="h"
              class="h-10 flex items-center justify-center snap-center cursor-pointer transition-all text-base select-none"
              :class="
                selectedHour === h
                  ? 'font-extrabold text-brand-800 text-lg scale-110'
                  : 'font-semibold text-ink-400 hover:text-ink-700 text-sm'
              "
              @click="selectHour(h)"
            >
              {{ h }}
            </div>
          </div>

          <!-- Column 2: Phút (Minutes) -->
          <div
            ref="minColRef"
            class="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar py-[70px] text-center border-l border-ink-200/50"
            @scroll="onMinScroll"
          >
            <div
              v-for="m in minutes"
              :key="m"
              class="h-10 flex items-center justify-center snap-center cursor-pointer transition-all text-base select-none"
              :class="
                selectedMinute === m
                  ? 'font-extrabold text-brand-800 text-lg scale-110'
                  : 'font-semibold text-ink-400 hover:text-ink-700 text-sm'
              "
              @click="selectMinute(m)"
            >
              {{ m }}
            </div>
          </div>
        </div>
      </div>

      <!-- Past Warning Note if selected time on Today has already elapsed -->
      <div
        v-if="isTimePastForToday"
        class="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs"
      >
        <AlertCircle :size="15" class="shrink-0 text-rose-600" />
        <span>Giờ bạn chọn đã qua. Vui lòng chọn giờ sau thời điểm hiện tại hoặc chọn ngày khác.</span>
      </div>

      <!-- Selected Time Window Preview -->
      <div class="p-2.5 rounded-xl bg-brand-50/70 border border-brand-200 flex items-center justify-between text-xs">
        <span class="text-brand-900 font-medium">Khung giờ có mặt:</span>
        <span class="font-bold text-brand-800">
          {{ selectedHour }}:{{ selectedMinute }} ({{ selectedHour }}:{{ selectedMinute }} – {{ endTimeDisplay }})
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Hide scrollbar for Chrome, Safari and Opera */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
/* Hide scrollbar for IE, Edge and Firefox */
.no-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
</style>
