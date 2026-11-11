<script setup lang="ts">
// Reputation points on the customer's and the technician's profile (PO
// 08/10/2026): the score, a running ban, when the score goes back to 100 and
// why it moved.
import { computed, onMounted, ref } from 'vue';
import { ShieldCheck, Info } from 'lucide-vue-next';
import { reputationApi, type MyReputation } from '../../api/reputation.api';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

const props = defineProps<{ role: 'customer' | 'technician' }>();

const data = ref<MyReputation | null>(null);
const loading = ref(true);
const failed = ref(false);
const showHistory = ref(false);
const showTooltip = ref(false);

const banWhat = computed(() => (props.role === 'customer' ? 'đặt lịch' : 'nhận đơn'));
const barWidth = computed(() => `${Math.max(0, Math.min(100, data.value?.points ?? 0))}%`);
const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));
const KIND_LABELS: Record<string, string> = { violation: 'Trừ điểm', adjustment: 'Quản lý điều chỉnh', reset: 'Làm mới định kỳ' };

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    data.value = await reputationApi.mine();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="rounded-2xl border border-ink-100 bg-white p-5 space-y-3" data-testid="reputation-card">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <ShieldCheck :size="18" class="text-ink-500" />
        <h3 class="text-sm font-bold text-ink-900">Điểm uy tín</h3>
        
        <!-- Information Tooltip Trigger -->
        <div class="relative inline-flex items-center group">
          <button
            type="button"
            class="text-ink-400 hover:text-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full p-0.5 transition-colors cursor-pointer"
            aria-label="Thông tin quy tắc điểm uy tín"
            :aria-expanded="showTooltip"
            @click="showTooltip = !showTooltip"
            @mouseenter="showTooltip = true"
            @mouseleave="showTooltip = false"
            @focus="showTooltip = true"
            @blur="showTooltip = false"
          >
            <Info :size="15" />
          </button>

          <!-- Tooltip Popup -->
          <div
            role="tooltip"
            class="absolute left-1/2 -translate-x-1/4 top-full mt-2 z-30 w-72 sm:w-80 max-w-[calc(100vw-3rem)] p-3.5 rounded-xl bg-white text-ink-300 text-xs leading-relaxed shadow-xl border border-ink-200 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto"
            :class="[
              showTooltip
                ? 'opacity-100 visible translate-y-0'
                : 'opacity-0 invisible -translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0',
            ]"
          >
            <!-- Invisible bridge for smooth hover over gap -->
            <div class="absolute -top-2 left-0 right-0 h-2" aria-hidden="true" />
            <!-- Caret arrow -->
            <div class="relative z-10 space-y-1.5">
              <p class="font-semibold text-ink-900 flex items-center gap-1.5">
                <Info :size="13" class="text-brand-400 shrink-0" />
                Quy tắc điểm uy tín
              </p>
              <p class="text-ink-600">
                Huỷ đơn khi đã có {{ role === 'customer' ? 'thợ nhận' : 'khách đặt' }} bị trừ 10 điểm. Dưới 70 điểm tạm khoá {{ banWhat }} 72 giờ, dưới 40 điểm 7 ngày, từ 20 điểm trở xuống 30 ngày, hết điểm thì khoá tài khoản.<template v-if="data?.resetsAt"> Điểm được làm mới về 100 vào ngày {{ vnDateString(data.resetsAt) }}.</template>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="loading" class="text-xs text-ink-400">Đang tải điểm uy tín...</p>
    <p v-else-if="failed" class="text-xs text-ink-500">
      Chưa tải được điểm uy tín.
      <button type="button" class="font-semibold text-brand-700 underline" @click="load">Thử lại</button>
    </p>
    <template v-else-if="data">
      <div class="flex items-end gap-1">
        <span class="text-3xl font-bold text-ink-900 font-num" data-testid="reputation-points">{{ data.points }}</span>
        <span class="pb-1 text-sm text-ink-400">/100</span>
      </div>
      <div class="h-2 w-full rounded-full bg-ink-100" aria-hidden="true">
        <div class="h-2 rounded-full bg-blue-500" :style="{ width: barWidth }" />
      </div>

      <p v-if="data.locked" class="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-800" role="alert">
        Tài khoản đã bị khoá vì hết điểm uy tín. Vui lòng liên hệ bộ phận hỗ trợ.
      </p>
      <p v-else-if="data.suspendedUntil" class="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-800" role="alert" data-testid="reputation-ban">
        Bạn tạm thời không thể {{ banWhat }} đến {{ vnDateTimeString(data.suspendedUntil) }}.
      </p>

      <div v-if="data.events.length">
        <button type="button" class="text-xs font-semibold text-brand-700" @click="showHistory = !showHistory">
          {{ showHistory ? 'Ẩn lịch sử điểm' : `Xem lịch sử điểm (${data.events.length})` }}
        </button>
        <ul v-if="showHistory" class="mt-2 divide-y divide-ink-100" data-testid="reputation-history">
          <li v-for="event in data.events" :key="event.id" class="flex items-start justify-between gap-3 py-2 text-xs">
            <div class="min-w-0">
              <div class="font-semibold text-ink-800">{{ KIND_LABELS[event.kind] ?? 'Thay đổi điểm' }} · {{ vnDateTimeString(event.createdAt) }}</div>
              <div class="text-ink-500 break-words">{{ [event.reason, event.penalty].filter(Boolean).join(' ') }}</div>
            </div>
            <span class="shrink-0 font-bold font-num" :class="event.delta < 0 ? 'text-danger-700' : 'text-ink-700'">{{ signed(event.delta) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
