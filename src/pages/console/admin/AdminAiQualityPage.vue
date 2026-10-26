<script setup lang="ts">
// Admin: how the assistant is doing (PO 16/10/2026). Conversations, how many
// ended in a booking, how many times a customer said the assistant was wrong,
// day by day, and the latest of those with what was said - which is what the
// team turns into new test conversations. Read only. Since 26/10/2026 the
// assistant notices a disagreement in the conversation itself; there is no
// "Đúng ý / Chưa đúng" button, so "đúng ý" is no longer counted here.
import { computed, onMounted, ref } from 'vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../../components/console/console-ui';
import { adminAiQualityApi, type AiQuality, type AiWrongAnswer } from '../../../api/admin-ai-quality.api';
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
  { key: 'markedWrong', label: 'Khách nói trợ lý sai', align: 'right' },
];

const days = ref(7);
const data = ref<AiQuality | null>(null);
const loading = ref(true);
const error = ref('');

const totals = computed(() => data.value?.totals ?? null);
const rows = computed(() => [...(data.value?.perDay ?? [])].reverse().map((d) => ({ ...d, id: d.day })));
const percent = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${String(value).replace('.', ',')}%`);
const dayLabel = (day: string) => day.split('-').reverse().join('/');
const KIND_LABELS: Record<string, string> = { fault: 'Đoán sai bệnh', device: 'Nhận nhầm thiết bị', photo: 'Đọc nhầm ảnh' };
const kindLabel = (w: AiWrongAnswer) => (w.source === 'chat' && w.kind ? KIND_LABELS[w.kind] ?? '' : '');

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

    <dl v-if="totals" class="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-ink-100 text-sm lg:grid-cols-3" data-testid="ai-quality-totals">
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
      <div class="col-span-2 bg-white px-4 py-3 lg:col-span-1">
        <dt class="text-ink-500">Khách nói trợ lý sai</dt>
        <dd class="font-num text-lg font-semibold" :class="totals.markedWrong ? 'text-danger-700' : 'text-ink-900'">{{ totals.markedWrong }}</dd>
        <dd class="text-xs text-ink-500">{{ percent(totals.wrongRate) }} số cuộc trò chuyện</dd>
      </div>
    </dl>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-900">Lần khách nói trợ lý sai</h2>
      <p class="text-xs text-ink-500">Trợ lý tự nhận ra trong cuộc trò chuyện, ví dụ khách nhắn "sai rồi", "không phải bệnh đó", "ảnh 2 là tủ lạnh". 20 lần gần nhất trong khoảng đã chọn, đội AI duyệt rồi dạy thêm cho trợ lý.</p>
      <p v-if="!loading && !data?.recentWrong.length" class="rounded-[var(--radius-md)] border border-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-500" data-testid="ai-quality-wrong-empty">
        Chưa có lần nào khách nói trợ lý sai trong khoảng này.
      </p>
      <ul v-else class="divide-y divide-ink-100 rounded-[var(--radius-md)] border border-ink-200 bg-white" data-testid="ai-quality-wrong">
        <li v-for="(w, index) in data?.recentWrong ?? []" :key="`${w.sessionId}-${index}`" class="space-y-1.5 px-4 py-3 text-sm">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <span class="font-num">{{ vnDateTimeString(w.at) }}</span>
            <span v-if="w.deviceName" class="rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-800">{{ w.deviceName }}</span>
            <span v-if="kindLabel(w)" class="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">{{ kindLabel(w) }}</span>
          </div>
          <p v-if="w.said || w.customerText" class="text-ink-700"><span class="font-medium text-ink-900">Khách kể:</span> {{ w.said || w.customerText }}</p>
          <p v-if="w.rejected?.length" class="text-ink-700"><span class="font-medium text-ink-900">Trợ lý đoán:</span> {{ w.rejected.join(', ') }}</p>
          <p v-else-if="w.reply" class="text-ink-700"><span class="font-medium text-ink-900">Trợ lý trả lời:</span> {{ w.reply }}</p>
          <p v-if="w.note" class="rounded-md bg-warning-50 px-2.5 py-1.5 text-warning-900"><span class="font-medium">Khách nói lại:</span> {{ w.note }}</p>
          <p v-if="w.settledOn?.length" class="text-ink-700"><span class="font-medium text-ink-900">Cuối cuộc trò chuyện:</span> {{ w.settledOn.join(', ') }}</p>
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
