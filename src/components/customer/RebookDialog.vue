<script setup lang="ts">
// "Đặt lại thợ" (PO 08/10/2026): a new booking with the same service and
// address from a completed or cancelled one. The customer picks a new day and
// session; the same technician is invited when free, otherwise the customer
// chooses another technician.
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { FhConfirmDialog } from '..';
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
const loading = ref(false);
const busy = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  selected.value = null;
  note.value = '';
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
  <FhConfirmDialog
    :open="open"
    :title="`Đặt lại thợ${serviceName ? ': ' + serviceName : ''}`"
    consequence="Tạo yêu cầu mới cùng dịch vụ và địa chỉ. Thợ cũ rảnh buổi bạn chọn thì lời mời gửi thẳng cho thợ cũ; thợ cũ bận thì bạn chọn thợ khác."
    confirm-text="Đặt lại"
    cancel-text="Quay lại"
    :danger="false"
    :loading="busy"
    @confirm="confirm"
    @cancel="emit('close')"
  >
    <div class="space-y-3 text-xs" data-testid="rebook-dialog">
      <p v-if="loading" class="text-ink-400">Đang tải các buổi...</p>
      <template v-else>
        <p v-if="!hasPreviousTechnician" class="text-ink-500">Yêu cầu cũ chưa có thợ nhận, bạn sẽ chọn thợ sau khi đặt.</p>
        <div class="max-h-72 overflow-y-auto pr-1">
          <BookingSessionPicker v-model="selected" :sessions="sessions" allow-busy busy-hint="chọn thợ khác" />
        </div>
        <label class="flex flex-col gap-1.5 font-semibold text-ink-700">
          Ghi chú cho thợ <span class="font-normal text-ink-400">(không bắt buộc)</span>
          <textarea v-model="note" rows="2" maxlength="1000" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm font-normal" data-testid="rebook-note" />
        </label>
      </template>
      <p v-if="error" class="text-danger-700" role="alert">{{ error }}</p>
    </div>
  </FhConfirmDialog>
</template>
