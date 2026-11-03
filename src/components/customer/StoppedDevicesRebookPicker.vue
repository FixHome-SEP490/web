<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { queryKeys } from '../../lib/query-keys';
import FhButton from '../FhButton.vue';
import { interruptionRebookApi } from '../../api/interruption-rebook.api';

const props = defineProps<{ groupId: string; devices: Array<{ bookingId: string; sequence: number; deviceLabel: string | null }>; disabled: boolean; customerId?: string; revalidation?: number }>();
const router = useRouter();
const cache = useQueryClient();
const cacheKey = () => queryKeys.orders.stoppedRebook(props.customerId, props.groupId, props.devices.map(d => d.bookingId).join(','));
const hasDisplay = ref(false);
const expanded = ref(false);
function remember() {
  if (props.customerId && hasDisplay.value && !error.value) cache.setQueryData(cacheKey(), { ids: [...availableIds.value], selected: [...selected.value] });
}
const selected = ref<string[]>([]);
const availableIds = ref<string[]>([]);
const checking = ref(true);
const error = ref(false);
let generation = 0;

const availableDevices = computed(() => props.devices.filter(device => availableIds.value.includes(device.bookingId)));
const unavailableDevices = computed(() => props.devices.filter(device => !availableIds.value.includes(device.bookingId)));
const valid = computed(() => !props.disabled && !checking.value && !error.value &&
  selected.value.length > 0 && selected.value.length <= 3 && new Set(selected.value).size === selected.value.length &&
  selected.value.every(id => availableIds.value.includes(id)));

async function refresh() {
  const current = ++generation;
  const key = cacheKey();
  checking.value = true;
  error.value = false;
  if (!props.devices.length) { checking.value = false; return; }
  try {
    const ids = await interruptionRebookApi.listAvailableStoppedSources(props.groupId, props.devices.map(device => device.bookingId));
    if (current === generation) {
      hasDisplay.value = true;
      availableIds.value = ids;
      selected.value = selected.value.filter(id => ids.includes(id));
      if (!selected.value.length && ids.length === 1) selected.value = [...ids];
      if (props.customerId) cache.setQueryData(key, { ids: [...ids], selected: [...selected.value] });
    }
  } catch {
    if (current === generation) { error.value = true; hasDisplay.value = false; cache.removeQueries({ queryKey: key, exact: true }); }
  } finally {
    if (current === generation) checking.value = false;
  }
}
watch([() => props.customerId, () => props.groupId, () => props.devices.map(device => device.bookingId).join(','), () => props.revalidation],
  (next, previous) => {
    if (!previous || next.slice(0, 3).some((value, i) => value !== previous[i])) {
      const saved = props.customerId ? cache.getQueryData<{ ids: string[]; selected: string[] }>(cacheKey()) : undefined;
      hasDisplay.value = false;
      selected.value = saved?.selected ?? []; availableIds.value = saved?.ids ?? [];
      hasDisplay.value = !!saved;
    }
    void refresh();
  }, { immediate: true });
watch(selected, remember, { deep: true, flush: 'sync' });
onBeforeUnmount(() => { ++generation; });

function rebook() {
  if (!valid.value) return;
  const sources = availableDevices.value.filter(device => selected.value.includes(device.bookingId)).map(device => device.bookingId);
  if (!sources.length) return;
  void router.push({ path: '/app/bookings/new', query: { interruptionRebook: sources[0], sourceBookingIds: sources.join(',') } });
}
</script>
<template>
  <div class="text-sm text-ink-700" data-testid="stopped-rebook-picker">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span>{{ devices.length }} máy đã dừng</span>
      <FhButton variant="secondary" size="sm" :disabled="!valid" data-testid="stopped-rebook-continue" @click="rebook">Đặt lịch mới<template v-if="selected.length"> · {{ selected.length }} máy</template></FhButton>
    </div>
    <details :open="expanded" class="mt-1" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
      <summary class="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">Chọn máy và xem chi tiết</summary>
      <fieldset :disabled="disabled || checking" class="space-y-2 pb-2">
        <legend class="sr-only">Chọn máy đã dừng để đặt lịch mới</legend>
        <p v-if="checking && !hasDisplay" role="status">Đang xác minh máy còn được đặt lại…</p>
        <p v-if="error" role="alert">Chưa kiểm tra được nguồn đặt lại. Vui lòng thử lại.</p>
        <template v-if="hasDisplay && !error">
          <label v-for="device in availableDevices" :key="device.bookingId" class="flex min-h-11 items-center gap-3">
            <input v-model="selected" type="checkbox" :value="device.bookingId" class="h-4 w-4 accent-brand-600" />
            Máy {{ device.sequence }}{{ device.deviceLabel ? ` · ${device.deviceLabel}` : '' }}
          </label>
          <p v-for="device in unavailableDevices" :key="device.bookingId" class="text-sm text-ink-600" data-testid="rebook-unavailable">Máy {{ device.sequence }} · Không còn nguồn đặt lại hợp lệ. Kiểm tra đơn mới trong tài khoản.</p>
          <p v-if="!availableDevices.length" role="status">Không còn máy đủ điều kiện đặt lại từ lượt này.</p>
        </template>
      </fieldset>
      <p class="text-sm text-ink-600">Chọn thời gian và xác nhận giá mới. Tiền và linh kiện cũ được đối soát riêng.</p>
      <button type="button" class="min-h-11 text-sm font-medium text-brand-700 underline disabled:text-ink-500" :disabled="disabled || checking" data-testid="stopped-rebook-refresh" @click="refresh">{{ error ? 'Thử kiểm tra lại' : 'Kiểm tra lại' }}</button>
    </details>
    <p v-if="error && !expanded" class="text-xs text-danger-700" role="alert">Chưa xác minh được nguồn đặt lại. Mở chi tiết để thử lại.</p>
  </div>
</template>
