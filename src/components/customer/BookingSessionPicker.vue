<script setup lang="ts">
// A day and a session (morning 8-12, afternoon 13-18, Vietnam time) for a
// booking, a reschedule or a rebooking (PO 08/10/2026): a row of days, then
// the two sessions of the chosen day. Sessions the technician cannot take are
// shown with the reason and cannot be picked, unless allowBusy says otherwise.
import { computed, ref, watch } from 'vue';
import { SLOT_SHORT, type BookingSlot, type SessionOption } from '../../utils/booking-session';
import { weekdayOfKey } from '../../utils/vn-time';

const props = withDefaults(defineProps<{
  sessions: SessionOption[];
  modelValue: { date: string; slot: BookingSlot } | null;
  /** Lets a busy session be picked anyway (rebooking: the customer then chooses another technician). */
  allowBusy?: boolean;
  busyHint?: string;
}>(), { allowBusy: false, busyHint: '' });

const emit = defineEmits<{ (e: 'update:modelValue', value: { date: string; slot: BookingSlot }): void }>();

const SHORT_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const canPick = (s: SessionOption) => s.available || props.allowBusy;

const days = computed(() => {
  const byDate = new Map<string, SessionOption[]>();
  for (const session of props.sessions) {
    const list = byDate.get(session.date) ?? [];
    list.push(session);
    byDate.set(session.date, list);
  }
  return [...byDate.entries()].map(([date, sessions]) => {
    const [, m, d] = date.split('-');
    return { date, sessions, weekday: SHORT_WEEKDAYS[weekdayOfKey(date)], dayMonth: `${d}/${m}`, open: sessions.some(canPick) };
  });
});

const activeDate = ref('');
watch(
  () => [days.value, props.modelValue?.date] as const,
  () => {
    if (props.modelValue && days.value.some((d) => d.date === props.modelValue!.date)) {
      activeDate.value = props.modelValue.date;
    } else if (!days.value.some((d) => d.date === activeDate.value)) {
      activeDate.value = (days.value.find((d) => d.open) ?? days.value[0])?.date ?? '';
    }
  },
  { immediate: true },
);
const activeSessions = computed(() => days.value.find((d) => d.date === activeDate.value)?.sessions ?? []);

const isSelected = (s: SessionOption) => props.modelValue?.date === s.date && props.modelValue?.slot === s.slot;
function pick(s: SessionOption) {
  if (!canPick(s)) return;
  emit('update:modelValue', { date: s.date, slot: s.slot });
}
</script>

<template>
  <div class="space-y-3" data-testid="session-picker">
    <p v-if="days.length === 0" class="text-xs text-ink-500">Không còn buổi nào trong 14 ngày tới.</p>
    <template v-else>
      <div class="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Chọn ngày">
        <button
          v-for="day in days"
          :key="day.date"
          type="button"
          role="tab"
          class="shrink-0 w-14 rounded-xl border py-1.5 text-center transition-colors"
          :class="[
            activeDate === day.date ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
            day.open ? '' : 'opacity-50',
          ]"
          :aria-selected="activeDate === day.date"
          :data-testid="`session-day-${day.date}`"
          @click="activeDate = day.date"
        >
          <span class="block text-xs font-medium">{{ day.weekday }}</span>
          <span class="block text-sm font-bold font-num">{{ day.dayMonth }}</span>
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          v-for="s in activeSessions"
          :key="s.slot"
          type="button"
          class="rounded-xl border px-3 py-2.5 text-left text-sm transition-colors"
          :class="[
            isSelected(s) ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500 text-ink-900' : 'border-ink-200 bg-white text-ink-800',
            canPick(s) ? 'hover:border-ink-300' : 'cursor-not-allowed bg-ink-50 text-ink-400',
          ]"
          :disabled="!canPick(s)"
          :aria-pressed="isSelected(s)"
          :data-testid="`session-${s.date}-${s.slot}`"
          @click="pick(s)"
        >
          <span class="block font-semibold whitespace-nowrap">{{ SLOT_SHORT[s.slot] }}</span>
          <span v-if="!s.available" class="block text-xs" :class="allowBusy ? 'text-warning-700' : 'text-ink-400'">
            {{ s.reason || 'Thợ không nhận buổi này' }}<template v-if="allowBusy && busyHint"> · {{ busyHint }}</template>
          </span>
        </button>
      </div>
    </template>
  </div>
</template>
