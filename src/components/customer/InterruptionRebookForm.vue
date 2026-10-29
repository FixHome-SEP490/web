<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FhButton, FhSkeleton } from '..';
import { interruptionRebookApi, type InterruptionDraft, type InterruptionRebookInput } from '../../api/interruption-rebook.api';
import BookingSessionPicker from './BookingSessionPicker.vue';
import { isSessionUpcoming, upcomingSessions, type BookingSlot } from '../../utils/booking-session';
import { formatCurrencyVND } from '../../utils/formatters';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{ sourceBookingId: string; customerId: string }>();
const emit = defineEmits<{ created: [result: { kind: 'booking' | 'visit'; id: string }]; later: [] }>();
const draft = ref<InterruptionDraft | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const addressId = ref('');
const session = ref<{ date: string; slot: BookingSlot } | null>(null);
const variantCodes = ref<string[]>([]);
const descriptions = ref<string[]>([]);
const customerNote = ref('');
const accepted = ref(false);
const uncertain = ref(false);
const sessions = ref(upcomingSessions(14));
let generation = 0;
let pending: InterruptionRebookInput | null = null;
const canContinue = computed(() => !!draft.value && !!addressId.value && !!session.value && accepted.value
  && draft.value.items.every((item, index) => item.pricing.status !== 'FIXED_PRICE' || !!variantCodes.value[index])
  && descriptions.value.every(text => text.trim().length > 0 && text.length <= 5000)
  && customerNote.value.length <= 1000 && !busy.value);
const cannotBook = computed(() => !draft.value?.addresses.length
  || draft.value.items.some(item => item.pricing.status === 'FIXED_PRICE' && item.pricing.possibleVariants.length === 0));

async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  uncertain.value = false;
  pending = null;
  draft.value = null;
  try {
    const result = await interruptionRebookApi.readDraft(props.sourceBookingId, props.customerId);
    if (current !== generation) return;
    draft.value = result;
    addressId.value = result.addressId || result.addresses.find(item => item.isDefault)?.id || result.addresses[0]?.id || '';
    session.value = null;
    variantCodes.value = result.items.map(() => '');
    descriptions.value = result.items.map(item => item.description);
    customerNote.value = '';
    accepted.value = false;
  } catch (reason) {
    if (current === generation) error.value = userFacingError(reason, 'Chưa tải được hồ sơ đặt lịch mới. Vui lòng thử lại.');
  } finally {
    if (current === generation) loading.value = false;
  }
}

function payload(): InterruptionRebookInput | null {
  if (!draft.value || !session.value || !addressId.value || !accepted.value) return null;
  return {
    idempotencyKey: globalThis.crypto?.randomUUID?.() ?? '',
    addressId: addressId.value, date: session.value.date, slot: session.value.slot,
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
    if (!session.value || !isSessionUpcoming(session.value.date, session.value.slot)) {
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
    uncertain.value = true;
    error.value = userFacingError(reason, 'Chưa xác nhận được kết quả. Có thể thử lại đúng yêu cầu hiện tại; không tạo yêu cầu mới.');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => { generation++; });
</script>

<template>
  <section class="mx-auto w-full max-w-3xl space-y-5 pb-8" data-testid="interruption-rebook-form" :aria-busy="loading || busy">
    <header>
      <p class="text-sm text-ink-600">Đơn sửa trước vẫn được lưu trong hồ sơ</p>
      <h1 class="mt-1 text-xl font-semibold text-ink-900 sm:text-2xl">Đặt lịch mới</h1>
      <p class="mt-2 text-sm text-ink-600">Chọn lại lịch, địa chỉ và phạm vi dịch vụ. Giá sẽ được Backend xác nhận theo danh mục hiện tại.</p>
      <p v-if="draft?.sourceKind === 'onsite'" class="mt-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">Đơn cũ chưa bị hủy. Báo giá, thanh toán, ưu đãi và nghĩa vụ linh kiện của đơn cũ vẫn được giữ để đối soát riêng.</p>
    </header>
    <div v-if="loading" class="space-y-3"><FhSkeleton class="h-24 rounded-xl" /><FhSkeleton class="h-40 rounded-xl" /></div>
    <p v-if="error" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{{ error }}</p>
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
      <label class="block space-y-1 text-sm font-medium text-ink-800">
        <span>Địa chỉ sửa chữa</span>
        <select v-model="addressId" class="min-h-11 w-full rounded-xl border border-ink-300 bg-white px-3" :disabled="busy || uncertain" data-testid="interruption-address">
          <option value="">Chọn địa chỉ</option>
          <option v-for="address in draft.addresses" :key="address.id" :value="address.id">{{ address.label || address.line1 }} · {{ address.district }}, {{ address.province }}</option>
        </select>
      </label>
      <div class="space-y-2"><h2 class="text-sm font-semibold text-ink-900">Chọn ngày và buổi mới</h2><BookingSessionPicker v-model="session" :sessions="sessions" compact /></div>
      <label class="block space-y-1 text-sm font-medium text-ink-800"><span>Ghi chú mới cho thợ (không bắt buộc)</span><textarea v-model="customerNote" rows="2" maxlength="1000" class="w-full rounded-xl border border-ink-300 p-3" :disabled="busy || uncertain" data-testid="interruption-customer-note" /></label>
      <label class="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">
        <input v-model="accepted" type="checkbox" class="mt-0.5" :disabled="busy || uncertain" data-testid="interruption-reprice-consent" />
        <span>Tôi xác nhận đây là yêu cầu đặt lịch mới, với lịch và phạm vi/giá hiện tại đã chọn. Backend sẽ kiểm tra lại giá trước khi tạo đơn.</span>
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
