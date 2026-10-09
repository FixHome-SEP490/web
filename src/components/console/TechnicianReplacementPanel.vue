<script setup lang="ts">
// "Cần thay đổi thợ" (PO 08/10/2026): the technician on site reported the job
// is outside their skills. The Service Manager either gives the order to
// another technician (the order goes back to accepted, the reporter loses no
// points) or cancels it without costing anyone points.
import { onMounted, ref } from 'vue';
import { UserCog } from 'lucide-vue-next';
import { FhButton, FhCard } from '..';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { supportCasesApi, type SupportCaseDetail } from '../../api/support-cases.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';

const props = defineProps<{ supportCase: SupportCaseDetail }>();
const emit = defineEmits<{ (e: 'done', message: string): void }>();

const candidates = ref<TechnicianCandidate[]>([]);
const loading = ref(true);
const loadError = ref('');
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
  loadError.value = '';
  try {
    const bookingId = await bookingIdOf();
    if (!bookingId) throw new Error('Yêu cầu không gắn với đơn nào.');
    const list = await bookingsApi.getCandidates(bookingId);
    candidates.value = list.filter((c) => c.id !== props.supportCase.technicianId);
  } catch (err) {
    loadError.value = getSupportErrorMessage(err, 'Chưa tải được danh sách thợ phù hợp.');
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
  <FhCard class="border-warning-200" data-testid="replacement-panel">
    <h2 class="mb-1 text-h2 text-ink-900 flex items-center gap-2"><UserCog :size="18" /> Xử lý yêu cầu đổi thợ</h2>
    <p class="mb-4 text-xs text-ink-500">
      Thợ đã tới nơi và báo việc ngoài khả năng. Giao đơn cho thợ khác (thợ mới tự xuất phát và check-in) hoặc huỷ đơn. Cả hai cách đều không trừ điểm thợ đã báo.
    </p>
    <p v-if="loading" class="text-xs text-ink-400">Đang tải thợ phù hợp...</p>
    <p v-else-if="loadError" class="text-xs text-danger-700">{{ loadError }}
      <button type="button" class="font-semibold underline" @click="load">Thử lại</button>
    </p>
    <template v-else>
      <p v-if="candidates.length === 0" class="text-xs text-ink-500">Chưa có thợ nào khác rảnh và phù hợp cho đơn này. Bạn có thể huỷ đơn để khách đặt lại.</p>
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
          <span class="shrink-0 text-xs text-ink-500">
            <template v-if="typeof c.distanceKm === 'number'">{{ c.distanceKm.toFixed(1) }} km</template>
            <template v-if="typeof c.completedOrdersCount === 'number'"> · {{ c.completedOrdersCount }} đơn đã làm</template>
          </span>
        </label>
      </div>
    </template>
    <label class="mt-4 flex flex-col gap-1.5 text-xs font-semibold text-ink-700">
      Lý do <span class="font-normal text-ink-400">(gửi kèm thông báo, tối thiểu 10 ký tự)</span>
      <textarea v-model="reason" rows="2" maxlength="500" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm font-normal" data-testid="replacement-reason" />
    </label>
    <p v-if="error" class="mt-2 text-xs text-danger-700" role="alert">{{ error }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <FhButton size="sm" :loading="busy" :disabled="busy || !candidates.length" data-testid="replacement-assign" @click="replace">Giao cho thợ đã chọn</FhButton>
      <FhButton variant="secondary" size="sm" :disabled="busy" data-testid="replacement-cancel" @click="cancelWithoutPoints">Huỷ đơn, không trừ điểm</FhButton>
    </div>
  </FhCard>
</template>
