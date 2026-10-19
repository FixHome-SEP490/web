<script setup lang="ts">
// P012 (owner contract 19/10/2026): the customer-reported device facts the
// server needs to qualify one of the approved Catalog V2 tiers, plus the
// server's own answer for the selected service.
//
// This component never computes money. `GET /services/:id/catalog-v2-pricing`
// is advisory: it reveals the facts the server still misses, the approved
// scopes it can prove, and a grounded NONBINDING min-max when facts are
// incomplete. The booking POST re-resolves everything under transaction
// locks; the wizard only ever submits a variant code the server confirmed
// with FIXED_PRICE, and a fixed price is shown only with its named scope.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { AlertTriangle, Check, LoaderCircle, RefreshCw, Wrench } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import {
  catalogPricingApi,
  isCatalogV2PricingUnavailableError,
  type BookingDeviceAttributes,
  type CatalogPricingPreview,
  type CatalogPricingVariant,
} from '../../api/catalog-pricing.api';

const props = defineProps<{
  serviceId: string;
  deviceAttributes: BookingDeviceAttributes;
  selectedVariantCode: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:deviceAttributes', value: BookingDeviceAttributes): void;
  (e: 'update:selectedVariantCode', value: string | null): void;
  /** Latest server answer, so later steps can only repeat what the server said. */
  (e: 'update:preview', value: CatalogPricingPreview | null): void;
}>();

type LoadState = 'loading' | 'ready' | 'refreshing' | 'failed' | 'unavailable';

const preview = ref<CatalogPricingPreview | null>(null);
const loadState = ref<LoadState>('loading');
/** The code sent with the next GET; only a server confirmation reaches the wizard. */
const requestedVariantCode = ref<string | null>(props.selectedVariantCode);
let requestToken = 0;
let abortController: AbortController | null = null;

const mountingOptions: ReadonlyArray<{ value: 'wall' | 'ceiling'; label: string }> = [
  { value: 'wall', label: 'Treo tường' },
  { value: 'ceiling', label: 'Âm trần cassette' },
];
const horsepowerOptions: ReadonlyArray<{ value: 'up_to_1_5' | '2_to_2_5'; label: string }> = [
  { value: 'up_to_1_5', label: '≤ 1.5 HP' },
  { value: '2_to_2_5', label: '2 – 2.5 HP' },
];
const washerStyleOptions: ReadonlyArray<{ value: 'top' | 'front'; label: string }> = [
  { value: 'top', label: 'Cửa trên' },
  { value: 'front', label: 'Cửa ngang' },
];
const washerCapacityOptions: ReadonlyArray<{ value: 9 | 10; label: string }> = [
  { value: 9, label: '≤ 9 kg' },
  { value: 10, label: 'Trên 9 kg' },
];

const isUnavailable = computed(() => loadState.value === 'unavailable');
const isBusy = computed(() => loadState.value === 'loading' || loadState.value === 'refreshing');
const priceVisible = computed(() => loadState.value !== 'failed');
const missingAttributes = computed(() => new Set(preview.value?.missingAttributes ?? []));
const scopeOptions = computed<CatalogPricingVariant[]>(() => preview.value?.possibleVariants ?? []);
const confirmedVariant = computed(() => preview.value?.status === 'FIXED_PRICE' ? preview.value.selectedVariant : null);
const priceRange = computed(() => preview.value?.priceRange ?? null);

const showMounting = computed(() => missingAttributes.value.has('acMounting') || !!props.deviceAttributes.acMounting);
// A cassette is priced by its own approved scope; HP never decides the mounting.
const showHorsepower = computed(() => (
  missingAttributes.value.has('acHorsepower') || !!props.deviceAttributes.acHorsepower
) && props.deviceAttributes.acMounting !== 'ceiling');
const showWasherStyle = computed(() => missingAttributes.value.has('washerLoadingStyle') || !!props.deviceAttributes.washerLoadingStyle);
const showWasherCapacity = computed(() => missingAttributes.value.has('washerCapacityKg') || typeof props.deviceAttributes.washerCapacityKg === 'number');
const showFacts = computed(() => showMounting.value || showHorsepower.value || showWasherStyle.value || showWasherCapacity.value);
const showScopeOptions = computed(() => scopeOptions.value.length > 0 && (
  missingAttributes.value.has('service-specific-scope-confirmation')
  || (preview.value?.status === 'FIXED_PRICE' && scopeOptions.value.length > 1)
));

/** A server-confirmed variant code is the only one the booking POST may carry. */
function announceVariantCode(code: string | null): void {
  if (props.selectedVariantCode !== code) emit('update:selectedVariantCode', code);
}

async function loadPreview(
  attributes: BookingDeviceAttributes = props.deviceAttributes,
  variantCode: string | null = requestedVariantCode.value,
): Promise<void> {
  const token = ++requestToken;
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;
  // A fact/scope change invalidates the previous advisory price immediately.
  // Never show an old "Phạm vi đã xác nhận" while the new GET is in flight.
  const hadPreview = preview.value !== null;
  preview.value = null;
  emit('update:preview', null);
  loadState.value = hadPreview ? 'refreshing' : 'loading';
  try {
    const result = await catalogPricingApi.getPreview(props.serviceId, {
      ...attributes,
      ...(variantCode ? { selectedVariantCode: variantCode } : {}),
    }, controller.signal);
    if (token !== requestToken) return;
    preview.value = result;
    loadState.value = 'ready';
    emit('update:preview', result);
    announceVariantCode(result.status === 'FIXED_PRICE' && result.selectedVariant ? result.selectedVariant.variantCode : null);
  } catch (error: unknown) {
    if (token !== requestToken) return;
    if (isCatalogV2PricingUnavailableError(error)) {
      loadState.value = 'unavailable';
      emit('update:preview', null);
      announceVariantCode(null);
      return;
    }
    // A failed preview never degrades into a guessed price or a stale code.
    loadState.value = 'failed';
    emit('update:preview', null);
    announceVariantCode(null);
  }
}

/** Any fact change invalidates a previous scope confirmation. */
function applyFacts(next: BookingDeviceAttributes): void {
  emit('update:deviceAttributes', next);
  requestedVariantCode.value = null;
  announceVariantCode(null);
  emit('update:preview', null);
  void loadPreview(next, null);
}

function setMounting(value: 'wall' | 'ceiling'): void {
  const next: BookingDeviceAttributes = { ...props.deviceAttributes, acMounting: value };
  if (value === 'ceiling') delete next.acHorsepower;
  applyFacts(next);
}

function setHorsepower(value: 'up_to_1_5' | '2_to_2_5'): void {
  applyFacts({ ...props.deviceAttributes, acHorsepower: value });
}

function setWasherStyle(value: 'top' | 'front'): void {
  applyFacts({ ...props.deviceAttributes, washerLoadingStyle: value });
}

function setWasherCapacity(value: 9 | 10): void {
  applyFacts({ ...props.deviceAttributes, washerCapacityKg: value });
}

/** Explicit scope choice: sent to the GET only; the wizard hears it after the server confirms. */
function chooseScope(variantCode: string): void {
  requestedVariantCode.value = variantCode;
  announceVariantCode(null);
  emit('update:preview', null);
  void loadPreview(props.deviceAttributes, variantCode);
}

function retry(): void {
  void loadPreview();
}

watch(() => props.serviceId, () => {
  preview.value = null;
  requestedVariantCode.value = props.selectedVariantCode;
  void loadPreview();
}, { immediate: true });

onBeforeUnmount(() => {
  requestToken += 1;
  abortController?.abort();
});
</script>

<template>
  <section
    v-if="!isUnavailable"
    class="space-y-4 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-e1)] sm:p-6"
    data-testid="booking-device-details"
    aria-labelledby="booking-device-details-title"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="booking-device-details-title" class="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
        <Wrench :size="15" class="text-brand-600" aria-hidden="true" />
        Thông tin thiết bị &amp; phạm vi tiền công
      </h2>
      <span
        v-if="isBusy"
        class="inline-flex items-center gap-1.5 text-[11px] text-ink-500"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle :size="12" class="animate-spin text-brand-600" aria-hidden="true" /> Đang kiểm tra phạm vi giá…
      </span>
    </div>

    <div v-if="showFacts" class="space-y-3">
      <p class="text-[11px] leading-relaxed text-ink-500">
        Trả lời vài thông tin để hệ thống đối chiếu đúng phạm vi đã được duyệt cho thiết bị của bạn.
      </p>

      <fieldset v-if="showMounting" class="space-y-1.5" data-testid="device-fact-ac-mounting">
        <legend class="text-[11px] font-semibold text-ink-700">Cách lắp đặt dàn lạnh</legend>
        <div class="flex flex-wrap gap-1.5">
          <label v-for="option in mountingOptions" :key="option.value" class="cursor-pointer">
            <input
              type="radio"
              class="peer sr-only"
              name="booking-ac-mounting"
              :value="option.value"
              :checked="deviceAttributes.acMounting === option.value"
              :disabled="isBusy"
              @change="setMounting(option.value)"
            />
            <span
              class="inline-flex items-center rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-200 peer-checked:border-brand-300 peer-checked:bg-brand-50 peer-checked:font-bold peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60"
            >
              {{ option.label }}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset v-if="showHorsepower" class="space-y-1.5" data-testid="device-fact-ac-horsepower">
        <legend class="text-[11px] font-semibold text-ink-700">Công suất máy lạnh</legend>
        <div class="flex flex-wrap gap-1.5">
          <label v-for="option in horsepowerOptions" :key="option.value" class="cursor-pointer">
            <input
              type="radio"
              class="peer sr-only"
              name="booking-ac-horsepower"
              :value="option.value"
              :checked="deviceAttributes.acHorsepower === option.value"
              :disabled="isBusy"
              @change="setHorsepower(option.value)"
            />
            <span
              class="inline-flex items-center rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-200 peer-checked:border-brand-300 peer-checked:bg-brand-50 peer-checked:font-bold peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60"
            >
              {{ option.label }}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset v-if="showWasherStyle" class="space-y-1.5" data-testid="device-fact-washer-style">
        <legend class="text-[11px] font-semibold text-ink-700">Kiểu cửa máy giặt</legend>
        <div class="flex flex-wrap gap-1.5">
          <label v-for="option in washerStyleOptions" :key="option.value" class="cursor-pointer">
            <input
              type="radio"
              class="peer sr-only"
              name="booking-washer-style"
              :value="option.value"
              :checked="deviceAttributes.washerLoadingStyle === option.value"
              :disabled="isBusy"
              @change="setWasherStyle(option.value)"
            />
            <span
              class="inline-flex items-center rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-200 peer-checked:border-brand-300 peer-checked:bg-brand-50 peer-checked:font-bold peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60"
            >
              {{ option.label }}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset v-if="showWasherCapacity" class="space-y-1.5" data-testid="device-fact-washer-capacity">
        <legend class="text-[11px] font-semibold text-ink-700">Khối lượng giặt mỗi lần</legend>
        <div class="flex flex-wrap gap-1.5">
          <label v-for="option in washerCapacityOptions" :key="option.value" class="cursor-pointer">
            <input
              type="radio"
              class="peer sr-only"
              name="booking-washer-capacity"
              :value="option.value"
              :checked="deviceAttributes.washerCapacityKg === option.value"
              :disabled="isBusy"
              @change="setWasherCapacity(option.value)"
            />
            <span
              class="inline-flex items-center rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-200 peer-checked:border-brand-300 peer-checked:bg-brand-50 peer-checked:font-bold peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60"
            >
              {{ option.label }}
            </span>
          </label>
        </div>
      </fieldset>
    </div>

    <fieldset v-if="showScopeOptions" class="space-y-1.5" data-testid="device-scope-options">
      <legend class="text-[11px] font-semibold text-ink-700">Chọn đúng phạm vi công việc</legend>
      <div class="space-y-2">
        <label
          v-for="option in scopeOptions"
          :key="option.variantCode"
          class="block cursor-pointer"
          :data-testid="`device-scope-option-${option.variantCode}`"
        >
          <input
            type="radio"
            class="peer sr-only"
            name="booking-scope-option"
            :value="option.variantCode"
            :checked="requestedVariantCode === option.variantCode"
            :disabled="isBusy"
            @change="chooseScope(option.variantCode)"
          />
          <span
            class="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-white px-3 py-2.5 transition-colors hover:border-brand-200 peer-checked:border-brand-300 peer-checked:bg-brand-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60"
          >
            <span class="min-w-0 text-xs font-semibold text-ink-900 text-pretty">{{ option.scopeVi }}</span>
            <span class="shrink-0 text-sm font-bold text-brand-700 font-num"><FhMoney :amount="option.laborPriceVnd" /></span>
          </span>
        </label>
      </div>
    </fieldset>

    <div
      v-if="priceVisible && confirmedVariant"
      class="rounded-[var(--radius-md)] border border-brand-200 bg-brand-50/60 p-3.5"
      data-testid="pricing-confirmed"
    >
      <p class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
        <Check :size="13" aria-hidden="true" /> Phạm vi đã xác nhận
      </p>
      <p class="mt-1 text-xs font-semibold text-ink-900 text-pretty" data-testid="pricing-confirmed-scope">
        {{ confirmedVariant.scopeVi }}
      </p>
      <p class="mt-1.5 text-sm font-bold text-brand-700 font-num">
        <FhMoney :amount="confirmedVariant.laborPriceVnd" />
        <span class="text-[11px] font-normal text-ink-500"> tiền công</span>
      </p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-600">Tiền công theo phạm vi đã chọn, chưa gồm linh kiện và vật tư.</p>
    </div>

    <div
      v-else-if="priceVisible && priceRange"
      class="rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 p-3.5"
      data-testid="pricing-reference-range"
    >
      <p class="text-xs font-semibold text-warning-900">Giá tham khảo — thợ khảo sát và báo giá, khách duyệt</p>
      <p class="mt-1 text-sm font-bold text-warning-900 font-num">
        <FhMoney :amount="priceRange.minLaborVnd" /> – <FhMoney :amount="priceRange.maxLaborVnd" />
      </p>
    </div>

    <div
      v-else-if="priceVisible && preview"
      class="rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 p-3.5"
      data-testid="pricing-inspection"
    >
      <p class="text-xs font-semibold text-ink-800">Cần khảo sát để báo giá</p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-500">Thợ sẽ kiểm tra tại nhà và gửi báo giá để bạn duyệt trước khi sửa.</p>
    </div>

    <div
      v-if="loadState === 'failed'"
      role="alert"
      class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700"
      data-testid="pricing-load-error"
    >
      <span class="inline-flex items-center gap-1.5">
        <AlertTriangle :size="14" class="shrink-0" aria-hidden="true" /> Chưa tải được thông tin giá của dịch vụ.
      </span>
      <FhButton variant="secondary" size="sm" data-testid="pricing-retry" @click="retry">
        <RefreshCw :size="13" class="mr-1" /> Thử lại
      </FhButton>
    </div>
  </section>
</template>
