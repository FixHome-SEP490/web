<script setup lang="ts">
// "Đặt lại thợ" (PO 08/10/2026): a new booking with the same service and
// address from a completed or cancelled one. The customer picks a new day and
// session; the same technician is invited when free, otherwise the customer
// chooses another technician.
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { X } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '..';
import BookingSessionPicker from './BookingSessionPicker.vue';
import { bookingsApi } from '../../api/bookings.api';
import { userFacingError } from '../../utils/user-facing-error';
import type { BookingSlot, SessionOption } from '../../utils/booking-session';

const props = defineProps<{ open: boolean; bookingId: string; serviceName?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const router = useRouter();

const sessions = ref<SessionOption[]>([]);
const hasPreviousTechnician = ref(false);
const selected = ref<{ date: string; slot: BookingSlot } | null>(null);
const note = ref('');
/** The note stays one link until the customer wants it (PO 20/10/2026). */
const noteOpen = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  selected.value = null;
  note.value = '';
  noteOpen.value = false;
  try {
    const result = await bookingsApi.availableSessions(props.bookingId, true);
    sessions.value = result.sessions;
    hasPreviousTechnician.value = !!result.technicianId;
  } catch (err) {
    error.value = userFacingError(err, 'Chưa tải được các buổi, thử lại sau.');
  } finally {
    loading.value = false;
  }
}

watch(() => [props.open, props.bookingId], ([open]) => { if (open) void load(); }, { immediate: true });

async function confirm() {
  if (busy.value) return;
  if (!selected.value) {
    error.value = 'Vui lòng chọn ngày và buổi.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const result = await bookingsApi.rebook(props.bookingId, {
      ...selected.value,
      ...(note.value.trim() ? { customerNote: note.value.trim() } : {}),
    });
    emit('close');
    if (result.previousTechnicianInvited) {
      router.push({ path: `/app/bookings/${result.booking.id}`, query: { rebooked: 'invited' } });
    } else {
      router.push({ path: `/app/bookings/${result.booking.id}/candidates`, query: { rebooked: 'choose' } });
    }
  } catch (err) {
    error.value = userFacingError(err, 'Chưa đặt lại được, thử lại sau.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Not a destructive confirmation, so no warning box (PO 20/10/2026): a neutral sheet
       with the days, the sessions and one action, like the app on the phone. -->
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/60 sm:items-center sm:p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebook-title"
        class="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-(--shadow-e3) sm:rounded-2xl sm:p-6"
        data-testid="rebook-dialog"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="rebook-title" class="text-lg font-semibold text-ink-900">Đặt lại thợ</h2>
            <p v-if="serviceName" class="truncate text-sm text-ink-500">{{ serviceName }}</p>
          </div>
          <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-50 hover:text-ink-800" aria-label="Đóng" @click="emit('close')">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <div v-if="loading" aria-busy="true" aria-label="Đang tải các buổi" class="space-y-2">
          <FhSkeleton height="52px" rounded="lg" />
          <FhSkeleton height="84px" rounded="lg" />
        </div>
        <template v-else>
          <p class="text-sm text-ink-600">
            {{ hasPreviousTechnician ? 'Thợ cũ rảnh buổi bạn chọn sẽ nhận lời mời trước.' : 'Bạn chọn thợ ngay sau khi đặt.' }}
          </p>
          <BookingSessionPicker v-model="selected" :sessions="sessions" compact allow-busy busy-hint="chọn thợ khác" />

          <button v-if="!noteOpen && !note" type="button" class="min-h-11 text-sm font-semibold text-brand-700 hover:underline" data-testid="rebook-note-open" @click="noteOpen = true">+ Thêm ghi chú cho thợ</button>
          <label v-else class="block space-y-1.5 text-sm font-medium text-ink-800">
            <span>Ghi chú cho thợ <span class="font-normal text-ink-500">(không bắt buộc)</span></span>
            <textarea v-model="note" rows="2" maxlength="1000" class="w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2.5 text-base font-normal focus:border-brand-600 focus:outline-none sm:text-sm" data-testid="rebook-note" />
          </label>
        </template>

        <p v-if="error" class="text-sm text-danger-700" role="alert">{{ error }}</p>

        <div class="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
          <FhButton variant="secondary" size="md" :disabled="busy" @click="emit('close')">Quay lại</FhButton>
          <FhButton variant="primary" size="md" :loading="busy" :disabled="loading" @click="confirm">Đặt lại</FhButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
