<script setup lang="ts">
import { ref } from 'vue';
import { ArrowRight, Clock, FileEdit, Trash2 } from 'lucide-vue-next';
import { FhButton, FhConfirmDialog } from '../index';
import type { BookingDraft } from '../../api/booking-drafts.api';
import { describeBookingDraft, formatDraftExpiry } from '../../utils/booking-draft-summary';

withDefaults(
  defineProps<{
    draft: BookingDraft;
    loading?: boolean;
    resumeLabel?: string;
    testId?: string;
    resumeTestId?: string;
    discardTestId?: string;
  }>(),
  {
    loading: false,
    resumeLabel: 'Tiếp tục đặt',
    testId: 'saved-booking-draft-card',
    resumeTestId: 'saved-draft-resume',
    discardTestId: 'saved-draft-discard',
  },
);

const emit = defineEmits<{
  (e: 'resume'): void;
  (e: 'discard'): void;
}>();

const confirmOpen = ref(false);

function handleConfirmDiscard() {
  confirmOpen.value = false;
  emit('discard');
}
</script>

<template>
  <section
    class="rounded-2xl border border-brand-200/80 bg-gradient-to-r from-brand-50/45 via-white to-white p-4 sm:px-5 sm:py-4 shadow-2xs"
    :data-testid="testId"
    aria-label="Bản nháp đặt lịch đã lưu"
  >
    <div class="flex flex-col md:flex-row md:items-center gap-3.5 md:gap-5">
      <div class="flex items-start gap-3 min-w-0">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100/90 text-brand-600">
          <FileEdit :size="18" :stroke-width="1.8" aria-hidden="true" />
        </div>
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm sm:text-[15px] font-semibold text-ink-900">Đơn đặt lịch chưa hoàn tất</h2>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              <span class="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
              Đang lưu nháp
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-600">
            <span class="font-medium text-ink-800">{{ describeBookingDraft(draft) }}</span>
            <span aria-hidden="true" class="text-ink-300">·</span>
            <span class="inline-flex items-center gap-1 font-num text-ink-500">
              <Clock :size="13" class="text-ink-400 shrink-0" aria-hidden="true" />
              <span>Hết hạn {{ formatDraftExpiry(draft.expiresAt) }}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 shrink-0 md:pl-5 md:border-l md:border-ink-200/75">
        <FhButton
          variant="primary"
          size="sm"
          :loading="loading"
          :disabled="loading"
          :data-testid="resumeTestId"
          @click="emit('resume')"
        >
          <span>{{ resumeLabel }}</span>
          <ArrowRight :size="14" aria-hidden="true" />
        </FhButton>
        <FhButton
          variant="secondary"
          size="sm"
          class="text-ink-600 hover:border-danger-200 hover:bg-danger-50/70 hover:text-danger-700"
          :disabled="loading"
          :data-testid="discardTestId"
          @click="confirmOpen = true"
        >
          <Trash2 :size="14" aria-hidden="true" />
          <span>Huỷ bản nháp</span>
        </FhButton>
      </div>
    </div>

    <FhConfirmDialog
      :open="confirmOpen"
      :loading="loading"
      :danger="true"
      title="Huỷ bản nháp đặt lịch?"
      consequence="Thông tin đã lưu trong bản nháp sẽ bị xoá và không thể khôi phục."
      confirm-text="Huỷ bản nháp"
      cancel-text="Giữ lại"
      @confirm="handleConfirmDiscard"
      @cancel="confirmOpen = false"
    />
  </section>
</template>
