<script setup lang="ts">
// A day and a session (morning 8-12, afternoon 13-18, Vietnam time) for a
// booking, a reschedule or a rebooking (PO 08/10/2026). PO 18/10/2026: pick the
// day on a calendar first, then the time; both choices carry a tick. Sessions
// the technician cannot take are shown with the reason and cannot be picked,
// unless allowBusy says otherwise.
import { computed, ref, watch } from 'vue';
import { Check } from 'lucide-vue-next';
import { SLOT_SHORT, sessionDayLabel, type BookingSlot, type SessionOption } from '../../utils/booking-session';
import { addDaysToKey, vnDayKey, weekdayOfKey } from '../../utils/vn-time';

const props = withDefaults(defineProps<{
  sessions: SessionOption[];
  modelValue: { date: string; slot: BookingSlot } | null;
  /** Lets a busy session be picked anyway (rebooking: the customer then chooses another technician). */
  allowBusy?: boolean;
  busyHint?: string;
}>(), { allowBusy: false, busyHint: '' });

const emit = defineEmits<{ (e: 'update:modelValue', value: { date: string; slot: BookingSlot }): void }>();

/** Monday first, as Vietnamese calendars are laid out. */
const WEEK_HEADER = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const canPick = (s: SessionOption) => s.available || props.allowBusy;

const sessionsByDate = computed(() => {
  const byDate = new Map<string, SessionOption[]>();
  for (const session of props.sessions) {
    const list = byDate.get(session.date) ?? [];
    list.push(session);
    byDate.set(session.date, list);
  }
  return byDate;
});
const dates = computed(() => [...sessionsByDate.value.keys()].sort());
const isOpen = (date: string) => (sessionsByDate.value.get(date) ?? []).some(canPick);

type Cell = { date: string; day: number; month: number; inRange: boolean; open: boolean; today: boolean };

/** Whole weeks, Monday to Sunday, from the first bookable day to the last. */
const weeks = computed<Cell[][]>(() => {
  if (!dates.value.length) return [];
  const first = dates.value[0];
  const last = dates.value[dates.value.length - 1];
  const today = vnDayKey();
  let cursor = addDaysToKey(first, -((weekdayOfKey(first) + 6) % 7));
  const end = addDaysToKey(last, (7 - weekdayOfKey(last)) % 7);
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  for (let guard = 0; cursor <= end && guard < 70; guard++) {
    const [, m, d] = cursor.split('-').map(Number);
    const inRange = sessionsByDate.value.has(cursor);
    row.push({ date: cursor, day: d, month: m, inRange, open: inRange && isOpen(cursor), today: cursor === today });
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
    cursor = addDaysToKey(cursor, 1);
  }
  if (row.length) rows.push(row);
  return rows;
});

/** "Tháng 10/2026", or "Tháng 10 - 11/2026" when the window crosses a month. */
const monthTitle = computed(() => {
  if (!dates.value.length) return '';
  const [y1, m1] = dates.value[0].split('-').map(Number);
  const [y2, m2] = dates.value[dates.value.length - 1].split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `Tháng ${m1}/${y1}`;
  if (y1 === y2) return `Tháng ${m1} - ${m2}/${y1}`;
  return `Tháng ${m1}/${y1} - ${m2}/${y2}`;
});

const activeDate = ref('');
watch(
  () => [dates.value, props.modelValue?.date] as const,
  () => {
    if (props.modelValue && sessionsByDate.value.has(props.modelValue.date)) {
      activeDate.value = props.modelValue.date;
    } else if (!sessionsByDate.value.has(activeDate.value)) {
      activeDate.value = dates.value.find(isOpen) ?? dates.value[0] ?? '';
    }
  },
  { immediate: true },
);
const activeSessions = computed(() => sessionsByDate.value.get(activeDate.value) ?? []);

function pickDay(cell: Cell) {
  if (!cell.inRange) return;
  activeDate.value = cell.date;
}
const isSelected = (s: SessionOption) => props.modelValue?.date === s.date && props.modelValue?.slot === s.slot;
function pick(s: SessionOption) {
  if (!canPick(s)) return;
  emit('update:modelValue', { date: s.date, slot: s.slot });
}
</script>

<template>
  <div class="space-y-4" data-testid="session-picker">
    <p v-if="dates.length === 0" class="text-xs text-ink-500">Không còn buổi nào trong 14 ngày tới.</p>
    <template v-else>
      <section class="space-y-2" aria-labelledby="session-pick-day">
        <div class="flex items-baseline justify-between gap-2">
          <h4 id="session-pick-day" class="text-sm font-semibold text-ink-800">Chọn ngày</h4>
          <span class="text-xs text-ink-500 whitespace-nowrap">{{ monthTitle }}</span>
        </div>
        <div class="rounded-2xl border border-ink-200 bg-white p-2 sm:p-3" data-testid="session-calendar">
          <div class="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-medium text-ink-500" aria-hidden="true">
            <span v-for="name in WEEK_HEADER" :key="name">{{ name }}</span>
          </div>
          <div class="space-y-1" role="grid" aria-label="Lịch đặt thợ">
            <div v-for="(week, w) in weeks" :key="w" class="grid grid-cols-7 gap-1" role="row">
              <template v-for="cell in week" :key="cell.date">
                <button
                  v-if="cell.inRange"
                  type="button"
                  role="gridcell"
                  class="relative flex h-11 flex-col items-center justify-center rounded-xl border text-sm transition-colors"
                  :class="[
                    activeDate === cell.date
                      ? 'border-brand-600 bg-brand-600 text-white font-semibold'
                      : cell.open
                        ? 'border-ink-200 bg-white text-ink-800 hover:border-brand-400'
                        : 'border-ink-100 bg-ink-50 text-ink-400',
                  ]"
                  :aria-selected="activeDate === cell.date"
                  :aria-label="`${sessionDayLabel(cell.date)}${cell.open ? '' : ', đã kín'}`"
                  :data-testid="`session-day-${cell.date}`"
                  @click="pickDay(cell)"
                >
                  <span class="font-num leading-none">{{ cell.day }}</span>
                  <span v-if="cell.today" class="mt-0.5 text-[10px] leading-none" :class="activeDate === cell.date ? 'text-white/90' : 'text-brand-600'">Hôm nay</span>
                  <span
                    v-if="modelValue?.date === cell.date"
                    class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-success-600 text-white ring-2 ring-white"
                    data-testid="session-day-tick"
                  >
                    <Check :size="10" :stroke-width="3" />
                  </span>
                </button>
                <span v-else class="flex h-11 items-center justify-center text-sm text-ink-300 font-num" role="gridcell" aria-disabled="true">{{ cell.day }}</span>
              </template>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-2" aria-labelledby="session-pick-time">
        <div class="flex items-baseline justify-between gap-2">
          <h4 id="session-pick-time" class="text-sm font-semibold text-ink-800">Chọn giờ</h4>
          <span class="text-xs text-ink-500 whitespace-nowrap" data-testid="session-active-day">{{ sessionDayLabel(activeDate) }}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            v-for="s in activeSessions"
            :key="s.slot"
            type="button"
            class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors"
            :class="[
              isSelected(s) ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500 text-ink-900' : 'border-ink-200 bg-white text-ink-800',
              canPick(s) ? 'hover:border-ink-300' : 'cursor-not-allowed bg-ink-50 text-ink-400',
            ]"
            :disabled="!canPick(s)"
            :aria-pressed="isSelected(s)"
            :data-testid="`session-${s.date}-${s.slot}`"
            @click="pick(s)"
          >
            <span class="min-w-0">
              <span class="block font-semibold whitespace-nowrap">{{ SLOT_SHORT[s.slot] }}</span>
              <span v-if="!s.available" class="block text-xs" :class="allowBusy ? 'text-warning-700' : 'text-ink-400'">
                {{ s.reason || 'Thợ không nhận buổi này' }}<template v-if="allowBusy && busyHint"> · {{ busyHint }}</template>
              </span>
            </span>
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
              :class="isSelected(s) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-white'"
              aria-hidden="true"
            >
              <Check v-if="isSelected(s)" :size="12" :stroke-width="3" />
            </span>
          </button>
          <p v-if="!activeSessions.length" class="text-xs text-ink-500">Ngày này không còn buổi trống.</p>
        </div>
      </section>
    </template>
  </div>
</template>
