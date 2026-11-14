<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { FhButton, FhSkeleton } from '..';
import { interruptionRebookApi, InterruptionDraftReadError, type InterruptionDraft, type InterruptionRebookInput } from '../../api/interruption-rebook.api';
import BookingSessionPicker from './BookingSessionPicker.vue';
import { isSessionUpcoming, upcomingSessions, type BookingSlot } from '../../utils/booking-session';
import { formatCurrencyVND } from '../../utils/formatters';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{ sourceBookingId: string; customerId: string; sourceBookingIds?: string[] }>();
const emit = defineEmits<{ created: [result: { kind: 'booking' | 'visit'; id: string }]; later: [] }>();
const draft = ref<InterruptionDraft | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const diagnostic = ref('');
const addressId = ref('');
const bookingMode = ref<'scheduled' | 'urgent'>('scheduled');
const session = ref<{ date: string; slot: BookingSlot } | null>(null);
const variantCodes = ref<string[]>([]);
const descriptions = ref<string[]>([]);
const customerNote = ref('');
const accepted = ref(false);
const uncertain = ref(false);
const sessions = ref(upcomingSessions(14));
let generation = 0;
let pending: InterruptionRebookInput | null = null;
const canContinue = computed(() => !!draft.value && !!addressId.value && (bookingMode.value === 'urgent' || !!session.value) && accepted.value
  && draft.value.items.every((item, index) => item.pricing.status !== 'FIXED_PRICE' || !!variantCodes.value[index])
  && descriptions.value.every(text => text.trim().length > 0 && text.length <= 5000)
  && customerNote.value.length <= 1000 && !busy.value);
const cannotBook = computed(() => !draft.value?.addresses.length
  || draft.value.items.some(item => item.pricing.status === 'FIXED_PRICE' && item.pricing.possibleVariants.length === 0));

async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  diagnostic.value = '';
  uncertain.value = false;
  pending = null;
  draft.value = null;
  try {
    const result = await interruptionRebookApi.readDraft(props.sourceBookingId, props.customerId, props.sourceBookingIds ?? [props.sourceBookingId]);
    if (current !== generation) return;
    draft.value = result;
    addressId.value = result.addresses.find(address => address.id === result.addressId)?.id || result.addresses.find(item => item.isDefault)?.id || result.addresses[0]?.id || '';
    bookingMode.value = 'scheduled';
    session.value = null;
    variantCodes.value = result.items.map(() => '');
    descriptions.value = result.items.map(item => item.description);
    customerNote.value = '';
    accepted.value = false;
  } catch (reason) {
    if (current === generation) {
      error.value = userFacingError(reason, 'Chưa tải được hồ sơ đặt lịch mới. Vui lòng thử lại.');
      diagnostic.value = reason instanceof InterruptionDraftReadError ? reason.diagnostic : '';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

function payload(): InterruptionRebookInput | null {
  if (!draft.value || (bookingMode.value === 'scheduled' && !session.value) || !addressId.value || !accepted.value) return null;
  return {
    idempotencyKey: globalThis.crypto?.randomUUID?.() ?? '',
    addressId: addressId.value, mode: bookingMode.value,
    ...(bookingMode.value === 'scheduled' && session.value ? { date: session.value.date, slot: session.value.slot } : {}),
    ...(customerNote.value.trim() ? { customerNote: customerNote.value.trim() } : {}),
    items: draft.value.items.map((item, index) => ({
      sourceBookingId: item.sourceBookingId, sourceCaseId: item.sourceCaseId,
      ...(variantCodes.value[index] ? { selectedVariantCode: variantCodes.value[index] } : {}),
      description: descriptions.value[index]!.trim(),
      ...(Object.keys(item.deviceAttributes).length ? { deviceAttributes: item.deviceAttributes } : {}),
    })),
  };
}

async function confirm() {
  if (busy.value || !draft.value || !canContinue.value) return;
  if (!pending) {
    if (bookingMode.value === 'scheduled' && (!session.value || !isSessionUpcoming(session.value.date, session.value.slot))) {
      error.value = 'Buổi đã chọn không còn phù hợp. Vui lòng chọn lịch mới.';
      session.value = null;
      sessions.value = upcomingSessions(14);
      return;
    }
    pending = payload();
    if (!pending?.idempotencyKey) { pending = null; error.value = 'Không thể tạo mã an toàn cho yêu cầu. Vui lòng tải lại.'; return; }
  }
  busy.value = true;
  error.value = '';
  const requestGeneration = generation;
  try {
    const result = await interruptionRebookApi.confirm(props.sourceBookingId, props.customerId, pending);
    if (generation !== requestGeneration) return;
    emit('created', result);
  } catch (reason) {
    if (generation !== requestGeneration) return;
    uncertain.value = true;
    error.value = userFacingError(reason, 'Chưa xác nhận được kết quả. Có thể thử lại đúng yêu cầu hiện tại; không tạo yêu cầu mới.');
  } finally {
    if (generation === requestGeneration) busy.value = false;
  }
}

watch(() => [props.sourceBookingId, props.customerId, props.sourceBookingIds?.join(',')], () => { busy.value = false; void load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>

<template>
  <section class="w-full space-y-5 pb-8" data-testid="interruption-rebook-form" :aria-busy="loading || busy">
    <header>
      <p class="text-sm text-ink-600">Đơn sửa trước vẫn được lưu trong hồ sơ</p>
      <h1 class="mt-1 text-xl font-semibold text-ink-900 sm:text-2xl">Đặt lịch mới</h1>
      <p class="mt-2 text-sm text-ink-600">Chọn lại lịch, địa chỉ và phạm vi dịch vụ. Giá sẽ được hệ thống xác nhận theo danh mục hiện tại.</p>
      <p v-if="draft?.sourceKind === 'onsite'" class="mt-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">Đơn cũ chưa bị hủy. Báo giá, thanh toán, ưu đãi và nghĩa vụ linh kiện của đơn cũ vẫn được giữ để đối soát riêng.</p>
    </header>
    <div v-if="loading" class="space-y-3"><FhSkeleton class="h-24 rounded-xl" /><FhSkeleton class="h-40 rounded-xl" /></div>
    <p v-if="error" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{{ error }}</p>
    <p v-if="diagnostic" class="text-xs text-ink-600" data-testid="interruption-read-diagnostic">Mã hỗ trợ: {{ diagnostic }}</p>
    <FhButton v-if="!loading && !draft" variant="secondary" size="md" data-testid="interruption-rebook-retry-load" @click="load">Thử tải lại</FhButton>
    <template v-if="draft">
      <p v-if="draft.addressText" class="text-sm text-ink-600">Địa chỉ lần trước: {{ draft.addressText }}</p>
      <section class="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white px-4" aria-label="Thiết bị đặt lịch mới">
        <article v-for="(item, index) in draft.items" :key="item.sourceBookingId" class="space-y-3 py-4" data-testid="interruption-device">
          <h2 class="font-semibold text-ink-900">{{ item.serviceName }}<template v-if="draft.items.length > 1"> · Thiết bị {{ index + 1 }}</template></h2>
          <label class="block space-y-1 text-sm font-medium text-ink-800">
            <span>Mô tả nhu cầu cho lần sửa mới</span>
            <textarea v-model="descriptions[index]" rows="3" maxlength="5000" class="w-full rounded-xl border border-ink-300 p-3" :disabled="busy || uncertain" :data-testid="'interruption-description-' + index" />
          </label>
          <label v-if="item.pricing.status === 'FIXED_PRICE'" class="block space-y-1 text-sm font-medium text-ink-800">
            <span>Chọn phạm vi và giá hiện tại</span>
            <select v-model="variantCodes[index]" class="min-h-11 w-full rounded-xl border border-ink-300 bg-white px-3" :disabled="busy || uncertain" :data-testid="'interruption-variant-' + index">
              <option value="">Chọn phạm vi dịch vụ</option>
              <option v-for="variant in item.pricing.possibleVariants" :key="variant.variantCode" :value="variant.variantCode">{{ variant.scopeVi }} · {{ formatCurrencyVND(variant.laborPriceVnd) }}</option>
            </select>
          </label>
          <p v-else class="text-sm text-ink-600">Dịch vụ cần kiểm tra tại nhà; thợ sẽ báo giá theo tình trạng thực tế.</p>
        </article>
      </section>
      <fieldset class="space-y-3 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" :disabled="busy || uncertain" data-testid="interruption-address">
        <legend class="text-lg font-semibold text-ink-900">Địa chỉ sửa chữa</legend>
        <p v-if="draft.items.length > 1" class="text-sm text-ink-600">Một địa chỉ cho cả lượt sửa.</p>
        <label v-for="address in draft.addresses" :key="address.id" class="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4" :class="addressId === address.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'">
          <input v-model="addressId" type="radio" name="interruption-address" :value="address.id" class="mt-1 accent-brand-600" />
          <span class="min-w-0"><span class="block text-sm font-semibold text-ink-900">{{ address.label || 'Địa chỉ' }}{{ address.isDefault ? ' · Mặc định' : '' }}</span><span class="block break-words text-sm text-ink-600">{{ [address.line1, address.district, address.province].filter(Boolean).join(', ') }}</span></span>
        </label>
        <router-link to="/app/profile" class="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline">Quản lý địa chỉ</router-link>
      </fieldset>
      <fieldset class="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" :disabled="busy || uncertain">
        <legend class="text-lg font-semibold text-ink-900">Thời gian</legend>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Kiểu đặt lịch">
          <button v-for="mode in (['scheduled', 'urgent'] as const)" :key="mode" type="button" :aria-pressed="bookingMode === mode" :data-testid="'mode-' + mode" class="min-h-11 rounded-xl border px-4 text-sm focus-visible:outline-2 focus-visible:outline-brand-600" :class="bookingMode === mode ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-ink-200 text-ink-700'" @click="bookingMode = mode">{{ mode === 'scheduled' ? 'Hẹn lịch' : 'Tới ngay' }}</button>
        </div>
        <BookingSessionPicker v-if="bookingMode === 'scheduled'" v-model="session" :sessions="sessions" compact />
        <p v-else class="text-sm text-ink-600">Tìm kỹ thuật viên đang rảnh gần bạn theo điều kiện hiện tại.</p>
      </fieldset>
      <label class="block space-y-1 text-sm font-medium text-ink-800"><span>Ghi chú mới cho thợ (không bắt buộc)</span><textarea v-model="customerNote" rows="2" maxlength="1000" class="w-full rounded-xl border border-ink-300 p-3" :disabled="busy || uncertain" data-testid="interruption-customer-note" /></label>
      <label class="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">
        <input v-model="accepted" type="checkbox" class="mt-0.5" :disabled="busy || uncertain" data-testid="interruption-reprice-consent" />
        <span>Tôi xác nhận đây là yêu cầu đặt lịch mới, với lịch và phạm vi/giá hiện tại đã chọn. Hệ thống sẽ kiểm tra lại giá trước khi tạo đơn.</span>
      </label>
      <p v-if="cannotBook" role="alert" class="text-sm text-danger-700">Cần có địa chỉ của bạn và lựa chọn dịch vụ hiện tại để tiếp tục. Hãy cập nhật địa chỉ hoặc thử tải hồ sơ lại.</p>
      <div class="flex flex-wrap justify-end gap-2">
        <FhButton variant="ghost" size="md" :disabled="busy || uncertain" @click="emit('later')">Để sau</FhButton>
        <FhButton v-if="uncertain" variant="secondary" size="md" :loading="busy" :disabled="busy" data-testid="interruption-rebook-retry-confirm" @click="confirm">Thử lại đúng yêu cầu</FhButton>
        <FhButton v-else size="lg" :loading="busy" :disabled="!canContinue || cannotBook" data-testid="interruption-rebook-confirm" @click="confirm">Xác nhận đặt lịch mới</FhButton>
      </div>
    </template>
  </section>
</template>
