<script setup lang="ts">
// What the customer told the assistant before booking, for the technician on the job (PO 10/10/2026):
// their words and photos, then what the AI made of it. Separate from the technician-customer chat.
import { computed } from 'vue';
import { Sparkles, X } from 'lucide-vue-next';
import FhMoney from '../FhMoney.vue';
import BookingMediaViewer from '../BookingMediaViewer.vue';
import type { AiBookingSummary, BookingMedia } from '../../api/bookings.api';

const props = defineProps<{
  open: boolean;
  summary: AiBookingSummary;
  description?: string | null;
  bookingId: string;
  media: BookingMedia[];
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const customerWords = computed(() => (props.summary.customerText || props.description || '').trim());
const faults = computed(() => (props.summary.suspectedFaults ?? []).filter(Boolean));
const actions = computed(() => (props.summary.suggestedActions ?? []).filter(Boolean));
const hasPrice = computed(() => props.summary.priceMin != null || props.summary.priceMax != null);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink-900/50"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-summary-title"
      class="bg-white rounded-t-[20px] sm:rounded-[20px] shadow-(--shadow-e3) w-full sm:max-w-lg p-5 sm:p-6 space-y-5 max-h-[90dvh] overflow-y-auto overscroll-contain"
      data-testid="ai-summary-dialog"
    >
      <div class="flex items-start justify-between gap-3">
        <h3 id="ai-summary-title" class="text-lg font-bold text-ink-900 inline-flex items-center gap-2">
          <Sparkles :size="18" class="text-brand-600 shrink-0" /> Tóm tắt vấn đề từ AI
        </h3>
        <button type="button" class="shrink-0 -m-1 p-2 rounded-lg text-ink-400 hover:text-ink-700" aria-label="Đóng" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>

      <section class="space-y-2">
        <h4 class="text-sm font-semibold text-ink-900">Khách mô tả</h4>
        <p v-if="customerWords" class="text-sm text-ink-800 whitespace-pre-line text-pretty" data-testid="ai-summary-customer">{{ customerWords }}</p>
        <BookingMediaViewer v-if="media.length" :booking-id="bookingId" :media="media" />
      </section>

      <section class="space-y-3 pt-4 border-t border-ink-100" data-testid="ai-summary-ai">
        <h4 class="text-sm font-semibold text-ink-900">AI nhận định</h4>
        <dl class="space-y-2 text-sm">
          <div v-if="summary.deviceName" class="flex gap-3">
            <dt class="w-24 shrink-0 text-ink-500">Thiết bị</dt>
            <dd class="text-ink-900">{{ summary.deviceName }}</dd>
          </div>
          <div v-if="faults.length" class="flex gap-3">
            <dt class="w-24 shrink-0 text-ink-500">Có thể là</dt>
            <dd class="text-ink-900"><ul class="space-y-0.5"><li v-for="f in faults" :key="f">{{ f }}</li></ul></dd>
          </div>
          <div v-if="actions.length" class="flex gap-3">
            <dt class="w-24 shrink-0 text-ink-500">Đã khuyên khách</dt>
            <dd class="text-ink-900"><ul class="space-y-0.5"><li v-for="a in actions" :key="a">{{ a }}</li></ul></dd>
          </div>
          <div v-if="hasPrice" class="flex gap-3">
            <dt class="w-24 shrink-0 text-ink-500">Giá tham khảo</dt>
            <dd class="text-ink-900 font-num whitespace-nowrap">
              <template v-if="summary.priceMin != null"><FhMoney :amount="summary.priceMin" /></template>
              <template v-if="summary.priceMin != null && summary.priceMax != null"> - </template>
              <template v-if="summary.priceMax != null"><FhMoney :amount="summary.priceMax" /></template>
            </dd>
          </div>
          <div v-if="summary.recommendedServiceName" class="flex gap-3">
            <dt class="w-24 shrink-0 text-ink-500">Dịch vụ gợi ý</dt>
            <dd class="text-ink-900">{{ summary.recommendedServiceName }}</dd>
          </div>
        </dl>
        <p v-if="summary.conclusion" class="text-sm text-ink-700 text-pretty" data-testid="ai-summary-conclusion">{{ summary.conclusion }}</p>
        <p class="text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-xl px-3 py-2">
          Đây là gợi ý sơ bộ, bạn kiểm tra tận nơi rồi mới kết luận.
        </p>
      </section>
    </div>
  </div>
</template>
