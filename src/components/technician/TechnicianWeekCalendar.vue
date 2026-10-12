<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import FhSkeleton from '../FhSkeleton.vue';
import { useCachedQuery } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { isHistoricalOrder, ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { addDaysToKey, vnClock } from '../../utils/vn-time';
import {
  blockPosition,
  jobBlocks,
  layoutOverlaps,
  minutesToClock,
  nowLinePosition,
  scheduleDiffers,
  timeOffSegments,
  visibleHourRange,
  weekDays,
  weekRangeLabel,
  weekStartKey,
  workBlocks,
  type JobBlock,
  type SavedScheduleSlot,
  type ScheduleDraftSlot,
  type TimeOffEntry,
} from '../../utils/week-calendar';

/**
 * Week calendar of the schedule tab (PO 12/10/2026): days as columns, hours as
 * rows, Vietnam time. Shows the working hours being edited (live), time off and
 * the booked jobs of the week. On a phone it shows one day at a time with a
 * strip of the seven days above it, so the page never scrolls sideways.
 */
const props = defineProps<{
  /** The editor's weekly hours, index 0 = Sunday (unsaved edits included). */
  schedule: readonly ScheduleDraftSlot[];
  /** What the server holds, to tell the technician the preview is not saved. */
  savedSchedule: readonly SavedScheduleSlot[];
  timeOff: readonly TimeOffEntry[];
  /** Fixed clock for tests; the live clock otherwise. */
  now?: Date;
}>();

/** Height of one hour; a long day (over 16 hours shown) is drawn tighter so it stays easy to scan. */
const hourPx = (hourCount: number) => (hourCount > 16 ? 32 : 40);
const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** Orders that hold an appointment; cancelled ones free the time. */
const CALENDAR_STATES = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED'];

// ---- Clock ----
const liveNow = ref(new Date());
const clock = computed(() => props.now ?? liveNow.value);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (!props.now) timer = setInterval(() => (liveNow.value = new Date()), 60_000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

// ---- Week shown ----
const thisWeek = computed(() => weekStartKey(clock.value));
const weekStart = ref(thisWeek.value);
const days = computed(() => weekDays(weekStart.value, clock.value));
const dayKeys = computed(() => days.value.map((d) => d.key));
const rangeLabel = computed(() => weekRangeLabel(weekStart.value));
const isThisWeek = computed(() => weekStart.value === thisWeek.value);

/** The day a phone shows: today in this week, Monday in another week. */
const selectedDay = ref('');
watch(
  days,
  (list) => {
    if (list.some((d) => d.key === selectedDay.value)) return;
    selectedDay.value = (list.find((d) => d.isToday) ?? list[0]).key;
  },
  { immediate: true },
);

const goWeek = (offset: number) => {
  weekStart.value = offset === 0 ? thisWeek.value : addDaysToKey(weekStart.value, offset * 7);
};

// ---- Jobs ----
const jobsQuery = useCachedQuery({
  key: queryKeys.orders.technicianCalendar,
  fetch: async (): Promise<ServiceOrderItem[]> => {
    const page = await ordersApi.getTechnicianJobsPage(1, 100, { statuses: CALENDAR_STATES });
    return page.items.filter((item): item is ServiceOrderItem => !isHistoricalOrder(item));
  },
});
const jobsLoading = jobsQuery.loading;
const jobsFailed = computed(() => Boolean(jobsQuery.error.value) && !jobsQuery.data.value);
const retryJobs = () => {
  void jobsQuery.refetch();
};

// ---- Blocks ----
const offSegments = computed(() => timeOffSegments(dayKeys.value, props.timeOff));
const work = computed(() => workBlocks(days.value, props.schedule, offSegments.value));
const jobs = computed(() => jobBlocks(dayKeys.value, jobsQuery.data.value ?? []));
const unsaved = computed(() => scheduleDiffers(props.schedule, props.savedSchedule));

const range = computed(() =>
  visibleHourRange([...work.value, ...jobs.value, ...offSegments.value.filter((o) => !o.fullDay)]),
);
const hours = computed(() =>
  Array.from({ length: range.value.endHour - range.value.startHour }, (_, i) => range.value.startHour + i),
);
const hourHeight = computed(() => hourPx(hours.value.length));
const gridHeight = computed(() => `${hours.value.length * hourHeight.value}px`);
const nowLine = computed(() => nowLinePosition(clock.value, dayKeys.value, range.value));

const pos = (startMin: number, endMin: number) => {
  const p = blockPosition(startMin, endMin, range.value);
  return p ? { top: `${p.topPct}%`, height: `${p.heightPct}%` } : null;
};

interface DayView {
  key: string;
  name: string;
  work: { id: string; label: string; cancelled: boolean; style: Record<string, string> }[];
  off: { id: string; label: string; title: string; fullDay: boolean; style: Record<string, string> }[];
  jobs: { block: JobBlock; style: Record<string, string>; ariaLabel: string }[];
}

const dayViews = computed<DayView[]>(() =>
  days.value.map((day) => {
    const name = `${DAY_NAMES[day.weekday]} ${day.dateLabel}`;
    const dayWork = work.value
      .filter((w) => w.dayKey === day.key)
      .flatMap((w) => {
        const style = pos(w.startMin, w.endMin);
        if (!style) return [];
        const hoursText = `${minutesToClock(w.startMin)}–${minutesToClock(w.endMin)}`;
        return [{ id: w.id, label: hoursText, cancelled: w.cancelled, style }];
      });
    const dayOff = offSegments.value
      .filter((o) => o.dayKey === day.key)
      .flatMap((o) => {
        const style = o.fullDay ? { top: '0%', height: '100%' } : pos(o.startMin, o.endMin);
        if (!style) return [];
        const when = o.fullDay ? 'cả ngày' : `${minutesToClock(o.startMin)}–${minutesToClock(o.endMin)}`;
        const label = o.reason ? `Nghỉ · ${o.reason}` : 'Nghỉ';
        return [{ id: o.id, label, title: `${name}: nghỉ ${when}${o.reason ? ` (${o.reason})` : ''}`, fullDay: o.fullDay, style }];
      });
    const dayJobs = layoutOverlaps(jobs.value.filter((j) => j.dayKey === day.key)).flatMap(({ block, lane, lanes }) => {
      const p = pos(block.startMin, block.endMin);
      if (!p) return [];
      const width = 100 / lanes;
      return [
        {
          block,
          style: { ...p, left: `${lane * width}%`, width: `${width}%` },
          ariaLabel: `${block.title}, ${block.timeLabel}, ${name}${block.completed ? ', đã xong' : ''}. Mở chi tiết việc`,
        },
      ];
    });
    return { key: day.key, name, work: dayWork, off: dayOff, jobs: dayJobs };
  }),
);

const jobDays = computed(() => new Set(jobs.value.map((j) => j.dayKey)));
const weekIsEmpty = computed(() => work.value.length === 0 && jobs.value.length === 0 && offSegments.value.length === 0);

const hourLines = computed(
  () => `repeating-linear-gradient(to bottom, var(--color-ink-100) 0 1px, transparent 1px ${hourHeight.value}px)`,
);
const offPattern =
  'repeating-linear-gradient(135deg, var(--color-ink-100) 0 6px, var(--color-ink-50) 6px 12px)';
</script>

<template>
  <section
    data-testid="week-calendar"
    class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-4 sm:p-6 space-y-4 min-w-0"
    aria-labelledby="week-calendar-title"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <h2 id="week-calendar-title" class="text-lg font-semibold text-ink-900 whitespace-nowrap">Lịch tuần</h2>
        <span
          v-if="unsaved"
          data-testid="calendar-unsaved"
          class="inline-flex items-center h-6 px-2 rounded-lg bg-warning-50 border border-warning-200 text-xs font-medium text-warning-800 whitespace-nowrap"
          title="Lịch đang xem theo giờ bạn vừa sửa. Bấm Lưu lịch làm việc để giữ."
        >
          Chưa lưu
        </span>
      </div>
      <div class="flex items-center gap-2" role="group" aria-label="Chọn tuần">
        <button
          type="button"
          class="h-10 px-2.5 inline-flex items-center gap-1 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          aria-label="Tuần trước"
          data-testid="calendar-prev"
          @click="goWeek(-1)"
        >
          <ChevronLeft :size="16" aria-hidden="true" /><span class="hidden sm:inline">Tuần trước</span>
        </button>
        <button
          type="button"
          class="h-10 px-3 rounded-xl border text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          :class="isThisWeek ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
          :aria-pressed="isThisWeek"
          data-testid="calendar-today"
          @click="goWeek(0)"
        >
          Tuần này
        </button>
        <button
          type="button"
          class="h-10 px-2.5 inline-flex items-center gap-1 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          aria-label="Tuần sau"
          data-testid="calendar-next"
          @click="goWeek(1)"
        >
          <span class="hidden sm:inline">Tuần sau</span><ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p class="text-sm font-semibold text-ink-900 font-num whitespace-nowrap" data-testid="calendar-range" aria-live="polite">
        {{ rangeLabel }}
      </p>
      <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600" aria-label="Chú thích">
        <li class="flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-3 h-3 rounded-sm bg-success-50 border border-success-500" aria-hidden="true"></span>Giờ nhận việc
        </li>
        <li class="flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-3 h-3 rounded-sm bg-brand-600" aria-hidden="true"></span>Lịch hẹn
        </li>
        <li class="flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-3 h-3 rounded-sm border border-ink-300" :style="{ backgroundImage: offPattern }" aria-hidden="true"></span>Nghỉ
        </li>
      </ul>
    </div>

    <div
      v-if="jobsLoading"
      class="flex items-center gap-3"
      data-testid="calendar-jobs-loading"
      aria-busy="true"
      aria-label="Đang tải lịch hẹn"
    >
      <FhSkeleton width="40%" height="12px" rounded="full" />
    </div>
    <div
      v-else-if="jobsFailed"
      role="alert"
      data-testid="calendar-jobs-error"
      class="flex flex-wrap items-center justify-between gap-2 text-sm text-danger-700"
    >
      <span class="text-pretty">Chưa tải được lịch hẹn. Giờ nhận việc vẫn hiện bên dưới.</span>
      <button
        type="button"
        class="h-9 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        @click="retryJobs"
      >
        Thử lại
      </button>
    </div>

    <!-- Phone: the seven days of the week, one shown below at a time. -->
    <div class="grid grid-cols-7 gap-1 sm:hidden" role="group" aria-label="Chọn ngày">
      <button
        v-for="d in days"
        :key="d.key"
        type="button"
        class="h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        :class="
          d.key === selectedDay
            ? 'bg-brand-600 text-white'
            : d.isToday
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-700 hover:bg-ink-50'
        "
        :aria-pressed="d.key === selectedDay"
        :aria-label="`${DAY_NAMES[d.weekday]} ${d.dateLabel}${d.isToday ? ', hôm nay' : ''}${jobDays.has(d.key) ? ', có lịch hẹn' : ''}`"
        :data-testid="`calendar-day-chip-${d.key}`"
        @click="selectedDay = d.key"
      >
        <span class="font-medium whitespace-nowrap">{{ d.shortName }}</span>
        <span class="font-num font-semibold whitespace-nowrap">{{ d.dateLabel.slice(0, 2) }}</span>
        <span
          class="w-1 h-1 rounded-full"
          :class="jobDays.has(d.key) ? (d.key === selectedDay ? 'bg-white' : 'bg-brand-600') : 'bg-transparent'"
          aria-hidden="true"
        ></span>
      </button>
    </div>

    <div class="flex min-w-0" data-testid="calendar-grid" :aria-busy="jobsLoading">
      <!-- Hours -->
      <div class="w-12 shrink-0" aria-hidden="true">
        <div class="hidden sm:block h-12"></div>
        <div class="relative" :style="{ height: gridHeight }">
          <span
            v-for="(h, i) in hours"
            :key="h"
            class="absolute right-2 -translate-y-1/2 text-xs text-ink-500 font-num whitespace-nowrap leading-none"
            :style="{ top: `${i * hourHeight}px` }"
          >{{ minutesToClock(h * 60) }}</span>
        </div>
      </div>

      <!-- Days -->
      <div class="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-7 border-l border-ink-200">
        <div
          v-for="(d, i) in dayViews"
          :key="d.key"
          class="min-w-0 border-r border-ink-200"
          :class="days[i].key === selectedDay ? 'block' : 'hidden sm:block'"
          :data-testid="`calendar-day-${d.key}`"
        >
          <div
            class="hidden sm:flex h-12 flex-col items-center justify-center border-b border-ink-200 text-xs"
            :class="days[i].isToday ? 'bg-brand-50' : ''"
          >
            <span class="font-medium whitespace-nowrap" :class="days[i].isToday ? 'text-brand-700' : 'text-ink-500'">{{ days[i].shortName }}</span>
            <span
              class="font-num font-semibold whitespace-nowrap"
              :class="days[i].isToday ? 'text-brand-700' : 'text-ink-900'"
              :aria-current="days[i].isToday ? 'date' : undefined"
            >{{ days[i].dateLabel }}</span>
          </div>

          <div
            class="relative"
            :style="{ height: gridHeight, backgroundImage: hourLines }"
            role="group"
            :aria-label="d.name"
          >
            <div
              v-for="w in d.work"
              :key="w.id"
              data-testid="calendar-block-work"
              :data-cancelled="w.cancelled ? 'true' : 'false'"
              class="absolute inset-x-0.5 rounded-md border-l-2 px-1.5 py-1 overflow-hidden"
              :class="w.cancelled ? 'bg-ink-50 border-ink-300' : 'bg-success-50 border-success-500'"
              :style="w.style"
              :title="`${d.name}: ${w.cancelled ? 'nghỉ, không nhận việc' : 'nhận việc'} ${w.label}`"
            >
              <p
                class="text-xs font-medium font-num whitespace-nowrap truncate"
                :class="w.cancelled ? 'text-ink-400 line-through' : 'text-success-800'"
              >{{ w.label }}</p>
            </div>

            <div
              v-for="o in d.off"
              :key="o.id"
              data-testid="calendar-block-off"
              :data-full-day="o.fullDay ? 'true' : 'false'"
              class="absolute inset-x-0 z-10 px-1.5 py-1 overflow-hidden"
              :style="{ ...o.style, backgroundImage: offPattern }"
              :title="o.title"
            >
              <p class="text-xs font-semibold text-ink-600 truncate">{{ o.label }}</p>
            </div>

            <RouterLink
              v-for="j in d.jobs"
              :key="j.block.id"
              :to="`/tech/jobs/${j.block.jobId}`"
              data-testid="calendar-block-job"
              class="absolute z-20 p-0.5 min-h-6 focus:outline-none group"
              :style="j.style"
              :aria-label="j.ariaLabel"
              :title="`${j.block.title} · ${j.block.timeLabel}${j.block.code ? ` · ${j.block.code}` : ''}`"
            >
              <span
                class="flex h-full flex-col rounded-md px-1.5 py-1 overflow-hidden text-xs group-focus-visible:ring-2 group-focus-visible:ring-brand-600 group-focus-visible:ring-offset-1"
                :class="j.block.completed ? 'bg-brand-100 text-brand-800 hover:bg-brand-200' : 'bg-brand-600 text-white hover:bg-brand-700'"
              >
                <span class="font-semibold truncate">{{ j.block.title }}</span>
                <span class="font-num whitespace-nowrap truncate">{{ j.block.timeLabel }}<template v-if="j.block.completed"> · Đã xong</template></span>
              </span>
            </RouterLink>

            <div
              v-if="nowLine && nowLine.dayKey === d.key"
              data-testid="calendar-now-line"
              class="absolute inset-x-0 z-30 h-0.5 bg-danger-500 pointer-events-none"
              :style="{ top: `${nowLine.topPct}%` }"
              role="img"
              :aria-label="`Bây giờ ${vnClock(clock)}`"
            >
              <span class="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-danger-500" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="weekIsEmpty && !jobsLoading" class="text-sm text-ink-500 text-pretty" data-testid="calendar-empty">
      Tuần đang xem chưa có giờ nhận việc, ngày nghỉ hay lịch hẹn nào.
    </p>
  </section>
</template>
