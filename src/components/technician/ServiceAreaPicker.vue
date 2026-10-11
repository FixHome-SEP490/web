<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search, X } from 'lucide-vue-next';
import FhSkeleton from '../FhSkeleton.vue';
import { vietnamProvincesApi, type Province } from '../../api/vietnam-provinces.api';
import type { TechnicianServiceAreaView } from '../../api/technician-profile.api';

/**
 * Districts the technician serves when the app is closed or the booking is
 * scheduled (PO 12/10/2026). The backend decides: an urgent booking uses the
 * GPS sent while the app is open; otherwise the start address + radius is used
 * and, when areas are chosen, the booking's district must be one of them. An
 * empty selection means "radius only".
 *
 * Codes are kept exactly as saved (onboarding and mobile save `String(code)` of
 * provinces.open-api.vn v1); they are only compared as numbers so a saved "01"
 * still matches province 1.
 */
const props = defineProps<{
  modelValue: TechnicianServiceAreaView[];
  /** Province of the start address, used to pick the first province shown. */
  defaultProvinceName?: string;
  /** The saved areas are still loading. */
  loading?: boolean;
  /** The saved areas could not be loaded; editing is hidden so a save cannot wipe them. */
  loadFailed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: TechnicianServiceAreaView[]): void;
  (e: 'retry'): void;
}>();

const HCM_CODE = 79;

const provinces = ref<Province[]>([]);
const loadingProvinces = ref(true);
const provincesFailed = ref(false);
const provinceCode = ref<number | null>(null);
const query = ref('');

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

const stripPrefix = (value: string) =>
  fold(value)
    .replace(/^(thanh pho|tp\.?|tinh)\s+/, '')
    .replace(/\s+/g, ' ');

const sameCode = (a: string | number, b: string | number) => {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x === y : String(a) === String(b);
};

const firstProvince = (list: Province[]): number | null => {
  const wanted = props.defaultProvinceName ? stripPrefix(props.defaultProvinceName) : '';
  if (wanted) {
    const match = list.find((p) => stripPrefix(p.name) === wanted);
    if (match) return match.code;
  }
  const counts = new Map<number, number>();
  for (const area of props.modelValue) {
    const p = list.find((item) => sameCode(item.code, area.provinceCode));
    if (p) counts.set(p.code, (counts.get(p.code) ?? 0) + 1);
  }
  let best: number | null = null;
  let max = 0;
  for (const [code, n] of counts) {
    if (n > max) {
      best = code;
      max = n;
    }
  }
  if (best != null) return best;
  return list.find((p) => p.code === HCM_CODE)?.code ?? list[0]?.code ?? null;
};

const loadProvinces = async () => {
  loadingProvinces.value = true;
  provincesFailed.value = false;
  try {
    const list = await vietnamProvincesApi.getProvincesWithDistricts();
    if (!Array.isArray(list) || list.length === 0) throw new Error('empty');
    provinces.value = list;
    if (provinceCode.value == null) provinceCode.value = firstProvince(list);
  } catch {
    provincesFailed.value = true;
  } finally {
    loadingProvinces.value = false;
  }
};

const retry = () => {
  if (props.loadFailed) emit('retry');
  if (provincesFailed.value) void loadProvinces();
};

onMounted(loadProvinces);

const activeProvince = computed(() => provinces.value.find((p) => p.code === provinceCode.value) ?? null);

const visibleDistricts = computed(() => {
  const all = activeProvince.value?.districts ?? [];
  const q = fold(query.value);
  return q ? all.filter((d) => fold(d.name).includes(q)) : all;
});

const isSelected = (pCode: number, dCode: number) =>
  props.modelValue.some((a) => sameCode(a.provinceCode, pCode) && sameCode(a.districtCode, dCode));

const toggle = (dCode: number) => {
  const pCode = provinceCode.value;
  if (pCode == null) return;
  if (isSelected(pCode, dCode)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((a) => !(sameCode(a.provinceCode, pCode) && sameCode(a.districtCode, dCode))),
    );
  } else {
    emit('update:modelValue', [...props.modelValue, { provinceCode: String(pCode), districtCode: String(dCode) }]);
  }
};

const allVisibleSelected = computed(() => {
  const pCode = provinceCode.value;
  return (
    pCode != null &&
    visibleDistricts.value.length > 0 &&
    visibleDistricts.value.every((d) => isSelected(pCode, d.code))
  );
});

const anyVisibleSelected = computed(() => {
  const pCode = provinceCode.value;
  return pCode != null && visibleDistricts.value.some((d) => isSelected(pCode, d.code));
});

const selectAll = () => {
  const pCode = provinceCode.value;
  if (pCode == null) return;
  const added = visibleDistricts.value
    .filter((d) => !isSelected(pCode, d.code))
    .map((d) => ({ provinceCode: String(pCode), districtCode: String(d.code) }));
  if (added.length) emit('update:modelValue', [...props.modelValue, ...added]);
};

const clearVisible = () => {
  const pCode = provinceCode.value;
  if (pCode == null) return;
  const visible = visibleDistricts.value;
  emit(
    'update:modelValue',
    props.modelValue.filter(
      (a) => !(sameCode(a.provinceCode, pCode) && visible.some((d) => sameCode(a.districtCode, d.code))),
    ),
  );
};

const remove = (area: TechnicianServiceAreaView) => {
  emit(
    'update:modelValue',
    props.modelValue.filter((a) => !(a.provinceCode === area.provinceCode && a.districtCode === area.districtCode)),
  );
};

const shortProvince = (name: string) => name.replace(/^(Thành phố|Tỉnh)\s+/, '');

const multiProvince = computed(() => new Set(props.modelValue.map((a) => String(Number(a.provinceCode)))).size > 1);

const selectedChips = computed(() =>
  props.modelValue.map((area) => {
    const p = provinces.value.find((item) => sameCode(item.code, area.provinceCode));
    const d = p?.districts?.find((item) => sameCode(item.code, area.districtCode));
    const name = d?.name ?? 'Khu vực đã lưu';
    return {
      key: `${area.provinceCode}:${area.districtCode}`,
      area,
      label: multiProvince.value && p ? `${name}, ${shortProvince(p.name)}` : name,
    };
  }),
);

const summary = computed(() =>
  props.modelValue.length === 0
    ? 'Chưa chọn khu vực nào, nhận đơn theo bán kính.'
    : `Đã chọn ${props.modelValue.length} khu vực`,
);

const busy = computed(() => props.loading || loadingProvinces.value);
const failed = computed(() => props.loadFailed || provincesFailed.value);
</script>

<template>
  <div class="space-y-3" data-testid="service-area-picker">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 class="text-base font-semibold text-ink-900">Khu vực nhận đơn khi tắt app</h3>
      <p v-if="!busy && !failed" class="text-sm font-medium text-ink-700" data-testid="area-summary">{{ summary }}</p>
    </div>
    <p class="text-sm text-ink-500">
      Khi bạn mở app, đơn tới ngay tính theo vị trí GPS. Khi tắt app hoặc đơn đặt trước, chỉ nhận đơn ở các khu vực đã chọn trong bán kính.
    </p>

    <div v-if="busy" class="space-y-3" aria-busy="true">
      <FhSkeleton height="44px" rounded="lg" />
      <FhSkeleton height="32px" rounded="full" :count="3" />
    </div>

    <div
      v-else-if="failed"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      role="alert"
    >
      <span>{{ loadFailed ? 'Không tải được khu vực đã chọn.' : 'Không tải được danh sách quận.' }}</span>
      <button
        type="button"
        class="font-semibold text-red-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 rounded"
        @click="retry"
      >
        Thử lại
      </button>
    </div>

    <template v-else>
      <ul v-if="selectedChips.length" class="flex flex-wrap gap-2" aria-label="Khu vực đã chọn">
        <li
          v-for="chip in selectedChips"
          :key="chip.key"
          class="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 pl-3 pr-1 py-1 text-sm text-brand-700"
        >
          <span>{{ chip.label }}</span>
          <button
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            :aria-label="`Bỏ ${chip.label}`"
            @click="remove(chip.area)"
          >
            <X :size="14" />
          </button>
        </li>
      </ul>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="tp-area-province" class="block text-sm font-medium text-ink-700">Tỉnh/thành phố</label>
          <select
            id="tp-area-province"
            v-model.number="provinceCode"
            class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl text-[15px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
            @change="query = ''"
          >
            <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <label for="tp-area-search" class="block text-sm font-medium text-ink-700">Tìm quận/huyện</label>
          <div class="relative">
            <input
              id="tp-area-search"
              v-model="query"
              type="text"
              autocomplete="off"
              placeholder="VD: Gò Vấp"
              class="w-full h-11 pl-10 pr-4 bg-white border border-ink-200 rounded-xl text-[15px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div class="flex items-center gap-4 text-sm">
        <button
          type="button"
          class="font-semibold text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded"
          :disabled="allVisibleSelected || visibleDistricts.length === 0"
          @click="selectAll"
        >
          Chọn tất cả
        </button>
        <button
          type="button"
          class="font-semibold text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded"
          :disabled="!anyVisibleSelected"
          @click="clearVisible"
        >
          Bỏ chọn
        </button>
      </div>

      <div v-if="visibleDistricts.length" class="flex flex-wrap gap-2 max-h-64 overflow-y-auto pr-1" role="group" aria-label="Quận/huyện">
        <button
          v-for="d in visibleDistricts"
          :key="d.code"
          type="button"
          :aria-pressed="isSelected(activeProvince!.code, d.code)"
          class="rounded-full border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          :class="
            isSelected(activeProvince!.code, d.code)
              ? 'bg-brand-50 border-brand-600 text-brand-700 font-semibold'
              : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
          "
          @click="toggle(d.code)"
        >
          {{ d.name }}
        </button>
      </div>
      <p v-else class="text-sm text-ink-500">Không có quận/huyện phù hợp.</p>
    </template>
  </div>
</template>
