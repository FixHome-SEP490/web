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
//
// Redesign (PO 20/10/2026): one card "Máy của bạn", each question a row of
// 44px choices with "Không rõ"; one compact price line, no coloured box.
// "Không rõ" never travels: the fact is simply left out, as the server expects.
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import { readableScope } from './booking-price';
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
type Fact = 'acMounting' | 'acHorsepower' | 'washerLoadingStyle' | 'washerCapacityKg' | 'washerHasDryer';

const preview = ref<CatalogPricingPreview | null>(null);
const loadState = ref<LoadState>('loading');
/** The code sent with the next GET; only a server confirmation reaches the wizard. */
const requestedVariantCode = ref<string | null>(props.selectedVariantCode);
/** Facts the customer answered "Không rõ": shown as chosen, never sent. */
const unknown = reactive(new Set<Fact>());
let requestToken = 0;
let abortController: AbortController | null = null;

const UNKNOWN = 'unknown' as const;
const mountingOptions = [
  { value: 'wall', label: 'Treo tường' },
  { value: 'ceiling', label: 'Âm trần' },
  { value: 'floor', label: 'Tủ đứng' },
  { value: UNKNOWN, label: 'Không rõ' },
] as const;
const horsepowerOptions = [
  { value: 'up_to_1_5', label: '≤ 1,5 HP', hint: '9.000–12.000 BTU' },
  { value: '2_to_2_5', label: '2 – 2,5 HP', hint: '18.000–24.000 BTU' },
  { value: UNKNOWN, label: 'Không rõ', hint: '' },
] as const;
const washerStyleOptions = [
  { value: 'top', label: 'Cửa trên' },
  { value: 'front', label: 'Cửa ngang' },
  { value: UNKNOWN, label: 'Không rõ' },
] as const;
const washerCapacityOptions = [
  { value: 9, label: '≤ 9 kg' },
  { value: 10, label: 'Trên 9 kg' },
  { value: UNKNOWN, label: 'Không rõ' },
] as const;
const dryerOptions = [
  { value: 'yes', label: 'Có sấy' },
  { value: 'no', label: 'Không' },
] as const;

const isUnavailable = computed(() => loadState.value === 'unavailable');
const isBusy = computed(() => loadState.value === 'loading' || loadState.value === 'refreshing');
const priceVisible = computed(() => loadState.value !== 'failed');
const missingAttributes = computed(() => new Set(preview.value?.missingAttributes ?? []));
const scopeOptions = computed<CatalogPricingVariant[]>(() => preview.value?.possibleVariants ?? []);
const confirmedVariant = computed(() => preview.value?.status === 'FIXED_PRICE' ? preview.value.selectedVariant : null);
const priceRange = computed(() => preview.value?.priceRange ?? null);

const asked = (fact: Fact) => missingAttributes.value.has(fact) || props.deviceAttributes[fact] !== undefined || unknown.has(fact);
const showMounting = computed(() => asked('acMounting'));
// Ceiling cassettes and floor-standing units are priced by type alone; HP only matters on the wall.
const showHorsepower = computed(() => asked('acHorsepower')
  && props.deviceAttributes.acMounting !== 'ceiling' && props.deviceAttributes.acMounting !== 'floor');
const isWasher = computed(() => asked('washerLoadingStyle') || asked('washerCapacityKg') || props.deviceAttributes.washerHasDryer !== undefined);
const showWasherStyle = computed(() => isWasher.value);
// A washer-dryer is always front-loading and has its own price; capacity does not split it.
const showDryer = computed(() => isWasher.value && props.deviceAttributes.washerLoadingStyle !== 'top');
const showWasherCapacity = computed(() => isWasher.value && props.deviceAttributes.washerHasDryer !== true);
const showFacts = computed(() => showMounting.value || showWasherStyle.value);
const showScopeOptions = computed(() => scopeOptions.value.length > 0 && (
  missingAttributes.value.has('service-specific-scope-confirmation')
  || (preview.value?.status === 'FIXED_PRICE' && scopeOptions.value.length > 1)
));
const title = computed(() => showFacts.value ? 'Máy của bạn' : 'Phạm vi công việc');

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

/** One answer: a value is sent; "Không rõ" removes the fact and only marks it answered. */
function answer<K extends Fact>(fact: K, value: BookingDeviceAttributes[K] | typeof UNKNOWN, drop: Fact[] = []): void {
  const next: BookingDeviceAttributes = { ...props.deviceAttributes };
  for (const other of drop) { delete next[other]; unknown.delete(other); }
  if (value === UNKNOWN) {
    delete next[fact];
    unknown.add(fact);
  } else {
    next[fact] = value as BookingDeviceAttributes[K];
    unknown.delete(fact);
  }
  applyFacts(next);
}

const setMounting = (value: (typeof mountingOptions)[number]['value']) =>
  answer('acMounting', value, value === 'ceiling' || value === 'floor' ? ['acHorsepower'] : []);
const setHorsepower = (value: (typeof horsepowerOptions)[number]['value']) => answer('acHorsepower', value);
const setWasherStyle = (value: (typeof washerStyleOptions)[number]['value']) =>
  answer('washerLoadingStyle', value, value === 'top' ? ['washerHasDryer'] : []);
const setWasherCapacity = (value: (typeof washerCapacityOptions)[number]['value']) => answer('washerCapacityKg', value);
const setDryer = (value: (typeof dryerOptions)[number]['value']) =>
  answer('washerHasDryer', value === 'yes', value === 'yes' ? ['washerCapacityKg'] : []);

const isChosen = (fact: Fact, value: unknown) =>
  value === UNKNOWN ? unknown.has(fact) && props.deviceAttributes[fact] === undefined : props.deviceAttributes[fact] === value;

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
  unknown.clear();
  requestedVariantCode.value = props.selectedVariantCode;
  void loadPreview();
}, { immediate: true });

onBeforeUnmount(() => {
  requestToken += 1;
  abortController?.abort();
});

const choice = 'flex min-h-11 items-center justify-center rounded-[10px] border border-ink-300 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:font-semibold peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60';
</script>

<template>
  <section
    v-if="!isUnavailable && (showFacts || showScopeOptions || loadState === 'failed')"
    class="space-y-5 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6"
    data-testid="booking-device-details"
    aria-labelledby="booking-device-details-title"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="booking-device-details-title" class="text-base font-semibold text-ink-900">{{ title }}</h2>
      <span v-if="isBusy" class="inline-flex items-center gap-1.5 text-xs text-ink-500" role="status" aria-live="polite">
        <LoaderCircle :size="13" class="animate-spin text-brand-600" aria-hidden="true" /> Đang tính giá…
      </span>
    </div>

    <fieldset v-if="showMounting" class="space-y-2" data-testid="device-fact-ac-mounting">
      <legend class="text-sm font-medium text-ink-800">Loại máy</legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="option in mountingOptions" :key="option.value" class="cursor-pointer">
          <input type="radio" class="peer sr-only" name="booking-ac-mounting" :value="option.value"
            :checked="isChosen('acMounting', option.value)" :disabled="isBusy" @change="setMounting(option.value)" />
          <span :class="choice">{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="showHorsepower" class="space-y-2" data-testid="device-fact-ac-horsepower">
      <legend class="flex w-full flex-wrap justify-between gap-x-4 text-sm font-medium text-ink-800">
        <span>Công suất</span><span class="font-normal text-ink-500">Xem tem bên hông dàn lạnh</span>
      </legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="option in horsepowerOptions" :key="option.value" class="cursor-pointer">
          <input type="radio" class="peer sr-only" name="booking-ac-horsepower" :value="option.value"
            :checked="isChosen('acHorsepower', option.value)" :disabled="isBusy" @change="setHorsepower(option.value)" />
          <span :class="choice">{{ option.label }}<span v-if="option.hint" class="ml-1.5 font-normal text-ink-500">· {{ option.hint }}</span></span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="showWasherStyle" class="space-y-2" data-testid="device-fact-washer-style">
      <legend class="text-sm font-medium text-ink-800">Kiểu cửa</legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="option in washerStyleOptions" :key="option.value" class="cursor-pointer">
          <input type="radio" class="peer sr-only" name="booking-washer-style" :value="option.value"
            :checked="isChosen('washerLoadingStyle', option.value)" :disabled="isBusy" @change="setWasherStyle(option.value)" />
          <span :class="choice">{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="showDryer" class="space-y-2" data-testid="device-fact-washer-dryer">
      <legend class="text-sm font-medium text-ink-800">Máy có chức năng sấy?</legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="option in dryerOptions" :key="option.value" class="cursor-pointer">
          <input type="radio" class="peer sr-only" name="booking-washer-dryer" :value="option.value"
            :checked="deviceAttributes.washerHasDryer === (option.value === 'yes')" :disabled="isBusy" @change="setDryer(option.value)" />
          <span :class="choice">{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="showWasherCapacity" class="space-y-2" data-testid="device-fact-washer-capacity">
      <legend class="flex w-full flex-wrap justify-between gap-x-4 text-sm font-medium text-ink-800">
        <span>Khối lượng giặt</span><span class="font-normal text-ink-500">Ghi trên tem máy</span>
      </legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="option in washerCapacityOptions" :key="option.value" class="cursor-pointer">
          <input type="radio" class="peer sr-only" name="booking-washer-capacity" :value="option.value"
            :checked="isChosen('washerCapacityKg', option.value)" :disabled="isBusy" @change="setWasherCapacity(option.value)" />
          <span :class="choice">{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="showScopeOptions" class="space-y-2" data-testid="device-scope-options">
      <legend class="text-sm font-medium text-ink-800">Chọn đúng việc cần làm</legend>
      <div class="space-y-2">
        <label v-for="option in scopeOptions" :key="option.variantCode" class="block cursor-pointer" :data-testid="`device-scope-option-${option.variantCode}`">
          <input type="radio" class="peer sr-only" name="booking-scope-option" :value="option.variantCode"
            :checked="requestedVariantCode === option.variantCode" :disabled="isBusy" @change="chooseScope(option.variantCode)" />
          <span class="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-ink-300 bg-white px-4 py-2.5 transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-disabled:opacity-60">
            <span class="min-w-0 text-sm font-medium text-ink-900 text-pretty">{{ option.scopeVi }}</span>
            <span class="shrink-0 text-sm font-semibold text-ink-900 font-num"><FhMoney :amount="option.laborPriceVnd" /></span>
          </span>
        </label>
      </div>
    </fieldset>

    <!-- One price line; the summary repeats it. Blue only for a price the server confirmed. -->
    <div v-if="priceVisible && confirmedVariant" class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-ink-100 pt-4" data-testid="pricing-confirmed">
      <span class="text-sm text-ink-600" data-testid="pricing-confirmed-scope">{{ readableScope(confirmedVariant.scopeVi) }}</span>
      <span class="text-right">
        <span class="text-lg font-semibold text-brand-700 font-num"><FhMoney :amount="confirmedVariant.laborPriceVnd" /></span>
        <span class="block text-xs text-ink-500">Tiền công, chưa gồm linh kiện</span>
      </span>
    </div>
    <div v-else-if="priceVisible && priceRange" class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-ink-100 pt-4" data-testid="pricing-reference-range">
      <span class="text-sm text-ink-600">Giá tham khảo, trả lời thêm để ra giá đúng</span>
      <span class="text-base font-semibold text-ink-800 font-num"><FhMoney :amount="priceRange.minLaborVnd" /> – <FhMoney :amount="priceRange.maxLaborVnd" /></span>
    </div>
    <div v-else-if="priceVisible && preview" class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-ink-100 pt-4" data-testid="pricing-inspection">
      <span class="text-sm text-ink-600">Cần khảo sát để báo giá</span>
      <span class="text-sm text-ink-500">Thợ báo giá tại nhà, bạn duyệt trước khi sửa</span>
    </div>

    <div v-if="loadState === 'failed'" role="alert" class="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700" data-testid="pricing-load-error">
      <span class="inline-flex items-center gap-1.5"><AlertTriangle :size="15" class="shrink-0" aria-hidden="true" /> Chưa tải được giá của dịch vụ.</span>
      <FhButton variant="secondary" size="sm" data-testid="pricing-retry" @click="retry"><RefreshCw :size="13" class="mr-1" /> Thử lại</FhButton>
    </div>
  </section>
</template>
