<script setup lang="ts">
// Admin: how the assistant is doing (PO 16/10/2026). Conversations, how many a
// customer marked wrong, how many ended in a booking, day by day, and the
// latest answers marked wrong with what the customer had said - which is what
// the team turns into new test conversations. Read only.
import { computed, onMounted, ref } from 'vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../../components/console/console-ui';
import { adminAiQualityApi, type AiQuality } from '../../../api/admin-ai-quality.api';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateTimeString } from '../../../utils/vn-time';

const PERIODS = [
  { days: 7, label: '7 ngày qua' },
  { days: 30, label: '30 ngày qua' },
  { days: 90, label: '90 ngày qua' },
];
const columns: ConsoleColumn[] = [
  { key: 'day', label: 'Ngày' },
  { key: 'sessions', label: 'Cuộc trò chuyện', align: 'right' },
  { key: 'bookings', label: 'Đặt thợ từ trợ lý', align: 'right' },
  { key: 'markedWrong', label: 'Khách báo chưa đúng', align: 'right' },
];

const days = ref(7);
const data = ref<AiQuality | null>(null);
const loading = ref(true);
const error = ref('');

const totals = computed(() => data.value?.totals ?? null);
const rows = computed(() => [...(data.value?.perDay ?? [])].reverse().map((d) => ({ ...d, id: d.day })));
const percent = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${String(value).replace('.', ',')}%`);
const dayLabel = (day: string) => day.split('-').reverse().join('/');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await adminAiQualityApi.get(days.value);
  } catch (err) {
    error.value = userFacingError(err, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Chất lượng trợ lý AI" />

    <div class="flex flex-wrap items-center gap-2">
      <select v-model.number="days" aria-label="Khoảng thời gian" data-testid="ai-quality-period" :class="consoleField" @change="load">
        <option v-for="p in PERIODS" :key="p.days" :value="p.days">{{ p.label }}</option>
      </select>
    </div>
    <p v-if="error" class="text-sm text-danger-700" role="alert">{{ error }}</p>

    <dl v-if="totals" class="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-ink-100 text-sm lg:grid-cols-4" data-testid="ai-quality-totals">
      <div class="bg-white px-4 py-3">
        <dt class="text-ink-500">Cuộc trò chuyện</dt>
        <dd class="font-num text-lg font-semibold text-ink-900">{{ totals.sessions }}</dd>
        <dd class="text-xs text-ink-500">{{ totals.turns }} lượt nhắn, {{ totals.signedIn }} của khách đã đăng nhập</dd>
      </div>
      <div class="bg-white px-4 py-3">
        <dt class="text-ink-500">Đặt thợ từ trợ lý</dt>
        <dd class="font-num text-lg font-semibold text-ink-900">{{ totals.bookings }}</dd>
        <dd class="text-xs text-ink-500">{{ percent(totals.bookingRate) }} số cuộc trò chuyện</dd>
      </div>
      <div class="bg-white px-4 py-3">
        <dt class="text-ink-500">Khách báo chưa đúng</dt>
        <dd class="font-num text-lg font-semibold" :class="totals.markedWrong ? 'text-danger-700' : 'text-ink-900'">{{ totals.markedWrong }}</dd>
        <dd class="text-xs text-ink-500">{{ percent(totals.wrongRate) }} số cuộc trò chuyện</dd>
      </div>
      <div class="bg-white px-4 py-3">
        <dt class="text-ink-500">Khách báo đúng ý</dt>
        <dd class="font-num text-lg font-semibold text-ink-900">{{ totals.markedRight }}</dd>
        <dd class="text-xs text-ink-500">cuộc trò chuyện</dd>
      </div>
    </dl>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-900">Câu trả lời bị khách báo chưa đúng</h2>
      <p class="text-xs text-ink-500">20 câu gần nhất trong khoảng đã chọn. Đội AI dùng các câu này để bổ sung bộ kiểm thử.</p>
      <p v-if="!loading && !data?.recentWrong.length" class="rounded-[var(--radius-md)] border border-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-500" data-testid="ai-quality-wrong-empty">
        Chưa có câu trả lời nào bị báo chưa đúng trong khoảng này.
      </p>
      <ul v-else class="divide-y divide-ink-100 rounded-[var(--radius-md)] border border-ink-200 bg-white" data-testid="ai-quality-wrong">
        <li v-for="(w, index) in data?.recentWrong ?? []" :key="`${w.sessionId}-${index}`" class="space-y-1.5 px-4 py-3 text-sm">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <span class="font-num">{{ vnDateTimeString(w.at) }}</span>
            <span v-if="w.deviceName" class="rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-800">{{ w.deviceName }}</span>
          </div>
          <p v-if="w.customerText" class="text-ink-700"><span class="font-medium text-ink-900">Khách kể:</span> {{ w.customerText }}</p>
          <p v-if="w.reply" class="text-ink-700"><span class="font-medium text-ink-900">Trợ lý trả lời:</span> {{ w.reply }}</p>
          <p v-if="w.note" class="rounded-md bg-warning-50 px-2.5 py-1.5 text-warning-900"><span class="font-medium">Khách góp ý:</span> {{ w.note }}</p>
        </li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-900">Theo ngày</h2>
      <ConsoleTable :columns="columns" :rows="rows" :loading="loading" :row-test-id="(r) => `ai-day-${r.day}`" empty-text="Chưa có dữ liệu.">
        <template #empty>Chưa có dữ liệu.</template>
        <template #cell-day="{ row: r }"><span class="whitespace-nowrap font-num text-ink-900">{{ dayLabel(r.day) }}</span></template>
        <template #cell-sessions="{ row: r }"><span class="font-num">{{ r.sessions }}</span></template>
        <template #cell-bookings="{ row: r }"><span class="font-num">{{ r.bookings }}</span></template>
        <template #cell-markedWrong="{ row: r }"><span class="font-num" :class="r.markedWrong ? 'text-danger-700' : ''">{{ r.markedWrong }}</span></template>
      </ConsoleTable>
    </section>
  </div>
</template>
