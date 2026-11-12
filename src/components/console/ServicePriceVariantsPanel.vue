<script setup lang="ts">
// ADMIN 47 (PO 13/11/2026): the price tiers of a service. Each tier saves on its own; the
// server keeps the tier code, so the admin changes the labour price and whether it is offered.
import { onMounted, ref } from 'vue';
import { FhButton, FhMoney } from '..';
import { consoleField } from './console-ui';
import { priceVariantsApi, type ServicePriceVariant } from '../../api/catalog.api';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{ serviceId: string }>();
const rows = ref<ServicePriceVariant[]>([]);
const drafts = ref<Record<string, { price: string; active: boolean }>>({});
const loading = ref(true);
const loadError = ref('');
const saving = ref('');
const rowMessage = ref<Record<string, { ok: boolean; text: string }>>({});

const attributes = (row: ServicePriceVariant) => Object.entries(row.deviceAttributes)
  .map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || row.variantCode;

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    rows.value = await priceVariantsApi.list(props.serviceId);
    drafts.value = Object.fromEntries(rows.value.map((row) => [row.id, { price: String(row.fixedLaborPriceVnd), active: row.isActive }]));
  } catch (reason) {
    loadError.value = userFacingError(reason, 'Chưa tải được các mức giá.');
  } finally {
    loading.value = false;
  }
}

async function save(row: ServicePriceVariant) {
  if (saving.value) return;
  const draft = drafts.value[row.id];
  const price = draft.price.trim();
  if (!/^\d{1,10}$/.test(price) || Number(price) > 1_000_000_000) {
    rowMessage.value = { ...rowMessage.value, [row.id]: { ok: false, text: 'Giá công là số nguyên từ 0 đến 1.000.000.000 ₫.' } };
    return;
  }
  saving.value = row.id;
  try {
    const saved = await priceVariantsApi.update(props.serviceId, row.id, { fixedLaborPriceVnd: Number(price), isActive: draft.active });
    rows.value = rows.value.map((item) => (item.id === saved.id ? saved : item));
    drafts.value[row.id] = { price: String(saved.fixedLaborPriceVnd), active: saved.isActive };
    rowMessage.value = { ...rowMessage.value, [row.id]: { ok: true, text: 'Đã lưu. Áp dụng cho lịch đặt mới.' } };
  } catch (reason) {
    rowMessage.value = { ...rowMessage.value, [row.id]: { ok: false, text: userFacingError(reason, 'Chưa lưu được mức giá.') } };
  } finally {
    saving.value = '';
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-2 border-t border-ink-100 pt-3" data-testid="price-variants">
    <h4 class="text-sm font-semibold text-ink-900">Mức giá theo thiết bị</h4>
    <p v-if="loading" class="text-sm text-ink-500" role="status">Đang tải…</p>
    <p v-else-if="loadError" class="text-sm text-danger-600" role="alert">{{ loadError }}</p>
    <p v-else-if="!rows.length" class="text-sm text-ink-500">Dịch vụ này không có mức giá theo thiết bị.</p>
    <ul v-else class="max-h-72 space-y-2 overflow-y-auto pr-1">
      <li v-for="row in rows" :key="row.id" class="space-y-1 rounded-lg border border-ink-200 p-2 text-sm" :data-testid="`price-variant-${row.variantCode}`">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="min-w-0 font-medium text-ink-900">{{ attributes(row) }}</span>
          <span class="text-xs text-ink-500">Hiện tại <FhMoney :amount="row.fixedLaborPriceVnd" /></span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input v-model="drafts[row.id].price" inputmode="numeric" :class="consoleField" class="w-36 font-num" :aria-label="`Giá công ${attributes(row)}`" />
          <label class="flex items-center gap-1 text-ink-700"><input v-model="drafts[row.id].active" type="checkbox" /> Đang mở</label>
          <FhButton variant="secondary" size="sm" :loading="saving === row.id" :disabled="!!saving" @click="save(row)">Lưu mức này</FhButton>
        </div>
        <p v-if="rowMessage[row.id]" :class="rowMessage[row.id].ok ? 'text-success-700' : 'text-danger-600'" class="text-xs" :role="rowMessage[row.id].ok ? 'status' : 'alert'">{{ rowMessage[row.id].text }}</p>
      </li>
    </ul>
  </section>
</template>
