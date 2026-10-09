<script setup lang="ts">
// "Cần thay đổi thợ" (PO 08/10/2026): the technician on site reported the job
// is outside their skills. The Service Manager either gives the order to
// another technician (the order goes back to accepted, the reporter loses no
// points) or cancels it without costing anyone points.
import { onMounted, ref } from 'vue';
import { FhButton, FhCard, FhSkeleton } from '..';
import { CONSOLE_LOAD_ERROR, consoleTextarea } from './console-ui';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { supportCasesApi, type SupportCaseDetail } from '../../api/support-cases.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';

const props = defineProps<{ supportCase: SupportCaseDetail }>();
const emit = defineEmits<{ (e: 'done', message: string): void }>();

const candidates = ref<TechnicianCandidate[]>([]);
const loading = ref(true);
const loadError = ref(false);
const chosen = ref('');
const reason = ref('');
const busy = ref(false);
const error = ref('');

const orderId = () => props.supportCase.serviceOrderId || '';
/** A case opened on the order alone carries no booking id; the order knows it. */
async function bookingIdOf(): Promise<string> {
  const direct = props.supportCase.bookingId || props.supportCase.booking?.id;
  if (direct) return direct;
  if (!orderId()) return '';
  return (await ordersApi.getOrder(orderId())).bookingId ?? '';
}

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const bookingId = await bookingIdOf();
    if (!bookingId) throw new Error('Yêu cầu không gắn với đơn nào.');
    const list = await bookingsApi.getCandidates(bookingId);
    candidates.value = list.filter((c) => c.id !== props.supportCase.technicianId);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function checkReason(): string | null {
  const text = reason.value.trim();
  if (text.length < 10) {
    error.value = 'Ghi lý do, tối thiểu 10 ký tự.';
    return null;
  }
  return text;
}

async function replace() {
  if (busy.value) return;
  error.value = '';
  if (!chosen.value) {
    error.value = 'Chọn kỹ thuật viên sẽ nhận đơn.';
    return;
  }
  const text = checkReason();
  if (!text) return;
  busy.value = true;
  try {
    await bookingsApi.replaceTechnicianAfterReport(orderId(), chosen.value, text);
    const name = candidates.value.find((c) => c.id === chosen.value)?.fullName ?? 'kỹ thuật viên mới';
    emit('done', `Đã giao đơn cho ${name}. Thợ trước không bị trừ điểm, khách và hai thợ đã được báo.`);
  } catch (err) {
    error.value = getSupportErrorMessage(err, 'Chưa đổi được thợ.');
  } finally {
    busy.value = false;
  }
}

async function cancelWithoutPoints() {
  if (busy.value) return;
  error.value = '';
  const text = checkReason();
  if (!text) return;
  busy.value = true;
  try {
    // A cancellation by staff costs nobody reputation points.
    await ordersApi.cancelOrder(orderId(), text);
    await supportCasesApi.resolveCase(props.supportCase.id, { finalStatus: 'resolved', resolutionCode: 'order_cancelled_no_fee', reason: text });
    emit('done', 'Đã huỷ đơn, không ai bị trừ điểm. Khách có thể đặt lại với thợ khác.');
  } catch (err) {
    error.value = getSupportErrorMessage(err, 'Chưa huỷ được đơn.');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <FhCard title="Đổi thợ" data-testid="replacement-panel">
    <p class="mb-4 text-sm text-ink-600 text-pretty">Giao đơn cho thợ khác hoặc huỷ đơn. Thợ đã báo không bị trừ điểm.</p>
    <FhSkeleton v-if="loading" height="40px" :count="3" />
    <p v-else-if="loadError" class="text-sm text-ink-700">{{ CONSOLE_LOAD_ERROR }}
      <button type="button" class="ml-1 font-medium text-brand-700 hover:underline" @click="load">Thử lại</button>
    </p>
    <template v-else>
      <p v-if="candidates.length === 0" class="text-sm text-ink-600">Chưa có thợ khác rảnh và phù hợp. Có thể huỷ đơn để khách đặt lại.</p>
      <div v-else class="space-y-2 max-h-80 overflow-y-auto pr-1" role="radiogroup" aria-label="Thợ nhận đơn">
        <label
          v-for="c in candidates"
          :key="c.id"
          class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm cursor-pointer"
          :class="chosen === c.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'"
          :data-testid="`replacement-candidate-${c.id}`"
        >
          <span class="flex items-center gap-2 min-w-0">
            <input v-model="chosen" type="radio" :value="c.id" />
            <span class="font-semibold text-ink-900 truncate">{{ c.fullName }}</span>
          </span>
          <span class="shrink-0 whitespace-nowrap text-xs text-ink-500">
            <template v-if="typeof c.distanceKm === 'number'">{{ c.distanceKm.toFixed(1) }}&nbsp;km</template>
            <template v-if="typeof c.completedOrdersCount === 'number'"> · {{ c.completedOrdersCount }} đơn đã làm</template>
          </span>
        </label>
      </div>
    </template>
    <label class="mt-4 flex flex-col gap-1.5 text-sm font-medium text-ink-700">
      Lý do (gửi kèm thông báo)
      <textarea v-model="reason" rows="2" maxlength="500" placeholder="Tối thiểu 10 ký tự" :class="consoleTextarea" data-testid="replacement-reason" />
    </label>
    <p v-if="error" class="mt-2 text-sm text-danger-700" role="alert">{{ error }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <FhButton size="sm" :loading="busy" :disabled="busy || !candidates.length" data-testid="replacement-assign" @click="replace">Giao cho thợ đã chọn</FhButton>
      <FhButton variant="secondary" size="sm" :disabled="busy" data-testid="replacement-cancel" @click="cancelWithoutPoints">Huỷ đơn, không trừ điểm</FhButton>
    </div>
  </FhCard>
</template>
