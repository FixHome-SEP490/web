<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import FhButton from '../FhButton.vue';
import { interruptionRebookApi } from '../../api/interruption-rebook.api';

const props = defineProps<{ groupId: string; devices: Array<{ bookingId: string; sequence: number; deviceLabel: string | null }>; disabled: boolean }>();
const router = useRouter();
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
  checking.value = true;
  error.value = false;
  if (!props.devices.length) { checking.value = false; return; }
  try {
    const ids = await interruptionRebookApi.listAvailableStoppedSources(props.groupId, props.devices.map(device => device.bookingId));
    if (current === generation) {
      availableIds.value = ids;
      selected.value = selected.value.filter(id => ids.includes(id));
      if (!selected.value.length && ids.length === 1) selected.value = [...ids];
    }
  } catch {
    if (current === generation) error.value = true;
  } finally {
    if (current === generation) checking.value = false;
  }
}
watch([() => props.groupId, () => props.devices.map(device => device.bookingId).join(',')],
  (next, previous) => {
    if (!previous || next[0] !== previous[0]) { selected.value = []; availableIds.value = []; }
    void refresh();
  }, { immediate: true });
onBeforeUnmount(() => { ++generation; });

function rebook() {
  if (!valid.value) return;
  const sources = availableDevices.value.filter(device => selected.value.includes(device.bookingId)).map(device => device.bookingId);
  if (!sources.length) return;
  void router.push({ path: '/app/bookings/new', query: { interruptionRebook: sources[0], sourceBookingIds: sources.join(',') } });
}
</script>
<template>
  <fieldset :disabled="disabled || checking" class="space-y-2" data-testid="stopped-rebook-picker">
    <legend class="font-semibold">Chọn máy đã dừng để đặt lịch mới</legend>
    <p v-if="checking" role="status">Đang xác minh máy còn được đặt lại…</p>
    <p v-if="error" role="alert">Chưa kiểm tra được nguồn đặt lại. Không thể chọn máy khi chưa xác minh.</p>
    <template v-if="!checking && !error">
      <label v-for="device in availableDevices" :key="device.bookingId" class="flex min-h-11 items-center gap-3">
        <input v-model="selected" type="checkbox" :value="device.bookingId" class="h-4 w-4 accent-brand-600" />
        Máy {{ device.sequence }}{{ device.deviceLabel ? ` · ${device.deviceLabel}` : '' }}
      </label>
      <p v-for="device in unavailableDevices" :key="device.bookingId" class="text-sm text-ink-600" data-testid="rebook-unavailable">
        Máy {{ device.sequence }}{{ device.deviceLabel ? ` · ${device.deviceLabel}` : '' }} · Không còn nguồn đặt lại hợp lệ. Kiểm tra đơn mới trong tài khoản.
      </p>
      <p v-if="!availableDevices.length" role="status">Không còn máy đủ điều kiện đặt lại từ lượt này.</p>
    </template>
    <p>Chọn lịch và xác nhận giá mới cho máy đã chọn.</p>
    <div class="flex flex-wrap gap-2">
      <FhButton variant="secondary" size="md" :disabled="disabled || checking" data-testid="stopped-rebook-refresh" @click="refresh">{{ error ? 'Thử kiểm tra lại' : 'Kiểm tra lại' }}</FhButton>
      <FhButton variant="primary" size="md" :disabled="!valid" data-testid="stopped-rebook-continue" @click="rebook">Đặt lịch mới cho {{ selected.length }} máy đã chọn</FhButton>
    </div>
  </fieldset>
</template>
