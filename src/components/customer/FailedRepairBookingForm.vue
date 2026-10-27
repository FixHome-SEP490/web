<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FhButton, FhMoney, FhSkeleton, BookingMediaViewer } from '..';
import BookingSessionPicker from './BookingSessionPicker.vue';
import { createFailedRepairPort, failedRepairKey, FailedRepairDraftRefreshError, validateFailedRepairDraft, type FailedRepairDraft, type FailedRepairConfirmation } from '../../api/failed-repair.api';
import { isSessionUpcoming, sessionDayLabel, SLOT_SHORT, upcomingSessions, type BookingSlot } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';
import { deviceFactsText } from '../booking/booking-price';
import { useStepHistory } from '../booking/use-step-history';

const props = defineProps<{ sourceBookingIds: string[]; customerId: string }>();
const emit = defineEmits<{ created: [result: { kind: 'booking' | 'visit'; id: string }]; later: [] }>();
const api = inject(failedRepairKey, createFailedRepairPort(() => props.customerId));
const draft = ref<FailedRepairDraft | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const step = ref(2);
const router = useRouter();
const route = useRoute();
// The shared history helper treats a missing step as step 1. This entry starts
// at step 2, so normalize its first history entry before a review is pushed.
if (route.query.step === undefined) void router.replace({ query: { ...route.query, step: '2' } });
useStepHistory(step, router, route);
const heading = ref<HTMLElement | null>(null);
const selectedAddress = ref('');
const selectedSession = ref<{ date: string; slot: BookingSlot } | null>(null);
const sessions = ref(upcomingSessions(14));
const submitted = ref(false);
const uncertain = ref(false);
const refreshRequired = ref(false);
let epoch = 0;
let key = crypto.randomUUID();
let pendingConfirmation: FailedRepairConfirmation | null = null;
const canContinue = computed(() => !!draft.value && !!selectedAddress.value && !!selectedSession.value && !busy.value);

async function load() {
  const request = ++epoch;
  draft.value = null;
  selectedAddress.value = '';
  selectedSession.value = null;
  step.value = 2;
  submitted.value = false;
  uncertain.value = false;
  refreshRequired.value = false;
  pendingConfirmation = null;
  error.value = '';
  loading.value = true;
  busy.value = false;
  try {
    const result = await api.readDraft([...props.sourceBookingIds]);
    if (request !== epoch) return;
    validateFailedRepairDraft(result, props.sourceBookingIds, props.customerId);
    draft.value = result;
    key = crypto.randomUUID();
    selectedAddress.value = result.address.id;
  } catch (err) {
    if (request === epoch) error.value = userFacingError(err, 'Chưa tải được dữ liệu đặt lại. Vui lòng thử lại.');
  } finally {
    if (request === epoch) loading.value = false;
  }
}
watch([() => props.sourceBookingIds.join(','), () => props.customerId], load, { immediate: true });
onBeforeUnmount(() => { epoch++; });

async function review() {
  if (!canContinue.value) return;
  step.value = 4;
  await nextTick();
  heading.value?.focus();
}
async function confirm() {
  if (step.value !== 4 || busy.value || submitted.value || refreshRequired.value || (uncertain.value && !api.retrySafe) || !api.available || !draft.value || !selectedSession.value) return;
  error.value = '';
  try {
    validateFailedRepairDraft(draft.value, props.sourceBookingIds, props.customerId);
    if (!pendingConfirmation && !isSessionUpcoming(selectedSession.value.date, selectedSession.value.slot)) {
      step.value = 2;
      selectedSession.value = null;
      sessions.value = upcomingSessions(14);
      throw new Error('Buổi đã chọn không còn phù hợp. Vui lòng chọn lịch mới.');
    }
  } catch (err) { error.value = userFacingError(err, 'Vui lòng kiểm tra lại dữ liệu đặt lịch.'); return; }
  busy.value = true;
  const request = epoch;
  const kind = draft.value.items.length === 1 ? 'booking' : 'visit';
  pendingConfirmation ??= { draftId: draft.value.id, sourceBookingIds: draft.value.items.map(item => item.sourceBookingId), kind,
    addressId: selectedAddress.value, ...selectedSession.value, idempotencyKey: key };
  try {
    const result = await api.confirm(pendingConfirmation);
    if (request !== epoch) return;
    if (result.kind !== kind || !result.id?.trim()) throw new Error('Invalid confirmation response');
    submitted.value = true;
    emit('created', result);
  } catch (err) {
    if (request !== epoch) return;
    // Only the new endpoint can replay the same immutable key/body safely.
    uncertain.value = true;
    refreshRequired.value = err instanceof FailedRepairDraftRefreshError;
    error.value = userFacingError(err, api.retrySafe
      ? 'Chưa xác nhận được kết quả. Bạn có thể thử lại cùng yêu cầu hoặc kiểm tra Đơn của tôi.'
      : 'Chưa xác nhận được kết quả. Vui lòng kiểm tra Đơn của tôi trước khi đặt lại.');
  } finally { if (request === epoch) busy.value = false; }
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl space-y-5 pb-8" data-testid="failed-repair-booking" :aria-busy="loading || busy">
    <header>
      <p class="text-sm text-ink-600">Đặt lại máy không sửa được</p>
      <h1 ref="heading" tabindex="-1" class="mt-1 text-xl font-semibold text-ink-900 outline-none sm:text-2xl">{{ step === 2 ? '2. Địa chỉ & Giờ' : '4. Xác nhận đặt lịch' }}</h1>
      <p class="mt-2 text-sm text-ink-600">Chọn lịch mới. Bạn sẽ chọn kỹ thuật viên sau khi gửi yêu cầu.</p>
    </header>
    <div v-if="loading" aria-label="Đang tải dữ liệu đặt lại" class="space-y-3"><FhSkeleton class="h-24 rounded-xl" /><FhSkeleton class="h-40 rounded-xl" /></div>
    <p v-if="error" role="alert" class="break-words rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{{ error }}</p>
    <FhButton v-if="!loading && !draft && api.available" variant="secondary" size="md" @click="load">Thử lại</FhButton>
    <FhButton v-if="refreshRequired" variant="secondary" size="md" data-testid="failed-reload-draft" :disabled="busy" @click="load">Tải lại dữ liệu & Giá hiện tại</FhButton>
    <template v-if="draft">
      <section aria-label="Máy đặt lại" class="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white px-4">
        <article v-for="item in draft.items" :key="item.sourceBookingId" class="min-w-0 space-y-2 py-4" data-testid="failed-draft-device">
          <h2 class="break-words font-semibold text-ink-900">{{ item.serviceName }}</h2>
          <p class="break-words whitespace-pre-line text-sm text-ink-700">{{ item.description }}</p>
          <p v-if="item.model" class="break-words text-sm text-ink-600">Model: {{ item.model }}</p>
          <p v-if="item.selectedVariantCode" class="break-words text-sm text-ink-600">Loại dịch vụ: {{ item.selectedVariantCode }}</p>
          <p v-if="item.deviceAttributes.brand" class="text-sm text-ink-600">Hãng: {{ item.deviceAttributes.brand }}</p>
          <p v-if="deviceFactsText(item.deviceAttributes)" class="text-sm text-ink-600">{{ deviceFactsText(item.deviceAttributes) }}</p>
          <p v-if="item.pricing?.status === 'FIXED_PRICE' && item.pricing.selectedVariant" class="text-sm text-ink-700">Tiền công hiện tại: <FhMoney :amount="item.pricing.selectedVariant.laborPriceVnd" /></p>
          <p v-else-if="item.pricing" class="text-sm text-ink-600">Thợ báo giá sau khi kiểm tra tại nhà.</p>
          <BookingMediaViewer v-if="item.media.length" :booking-id="item.sourceBookingId" :media="item.media" embedded />
        </article>
      </section>
      <p v-if="draft.customerNote" class="break-words text-sm text-ink-700">Ghi chú cho thợ: {{ draft.customerNote }}</p>
      <div v-if="step === 2" class="space-y-5 rounded-2xl border border-ink-200 bg-white p-4 sm:p-5">
        <label class="block space-y-2 text-sm font-medium text-ink-900">
          <span>Địa chỉ sửa chữa</span>
          <select v-model="selectedAddress" data-testid="failed-address" class="min-h-11 w-full min-w-0 rounded-xl border border-ink-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-brand-600">
            <option :value="draft.address.id">{{ draft.address.line1 }}, {{ draft.address.district }}, {{ draft.address.province }}</option>
          </select>
        </label>
        <p class="break-words text-sm text-ink-600">{{ draft.address.line1 }}, {{ draft.address.district }}, {{ draft.address.province }}</p>
        <div><h2 class="mb-3 text-sm font-semibold text-ink-900">Chọn ngày và buổi mới</h2><BookingSessionPicker v-model="selectedSession" :sessions="sessions" compact /></div>
        <p v-if="!selectedSession" class="text-sm text-ink-600">Chưa chọn lịch hẹn.</p>
        <FhButton class="w-full" size="lg" data-testid="failed-next" :disabled="!canContinue" @click="review">Xem lại & Xác nhận</FhButton>
      </div>
      <section v-else class="space-y-4 rounded-2xl border border-ink-200 bg-white p-4 sm:p-5">
        <h2 class="font-semibold text-ink-900">{{ draft.items.length }} máy · {{ draft.items.length === 1 ? 'Yêu cầu riêng' : 'Một lượt sửa' }}</h2>
        <p class="break-words text-sm text-ink-700">{{ draft.address.line1 }}, {{ draft.address.district }}, {{ draft.address.province }}</p>
        <p v-if="selectedSession" class="text-sm text-ink-700">{{ sessionDayLabel(selectedSession.date) }} · {{ SLOT_SHORT[selectedSession.slot] }}</p>
        <p class="text-sm text-ink-600">Giá và tình trạng dịch vụ được kiểm tra lại khi gửi yêu cầu.</p>
        <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <FhButton variant="secondary" size="md" :disabled="busy || submitted || uncertain" @click="step = 2">Sửa lịch hẹn</FhButton>
          <FhButton size="lg" data-testid="failed-final-confirm" :loading="busy" :disabled="!api.available || submitted || refreshRequired || (uncertain && !api.retrySafe)" @click="confirm">{{ uncertain && api.retrySafe ? 'Thử lại xác nhận' : 'Gửi yêu cầu đặt lịch' }}</FhButton>
        </div>
      </section>
    </template>
    <FhButton variant="ghost" size="md" :disabled="busy" @click="emit('later')">Để sau</FhButton>
  </section>
</template>
