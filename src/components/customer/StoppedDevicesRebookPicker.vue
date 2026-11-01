<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import FhButton from '../FhButton.vue';
const props = defineProps<{ groupId: string; devices: Array<{ bookingId: string; sequence: number; deviceLabel: string | null }>; disabled: boolean }>();
const router = useRouter();
const selected = ref<string[]>([]);
watch(() => [props.groupId, props.devices.map(d => d.bookingId).join(',')], () => { selected.value = []; });
const valid = computed(() => selected.value.length > 0 && selected.value.length <= 3 && new Set(selected.value).size === selected.value.length
  && selected.value.every(id => props.devices.some(device => device.bookingId === id)));
function rebook() {
  if (props.disabled || !valid.value) return;
  const sources = props.devices.filter(device => selected.value.includes(device.bookingId)).map(device => device.bookingId);
  void router.push({ path: '/app/bookings/new', query: { interruptionRebook: sources[0], sourceBookingIds: sources.join(',') } });
}
</script>
<template>
  <fieldset :disabled="disabled" class="space-y-2" data-testid="stopped-rebook-picker">
    <legend class="font-semibold">Chọn máy đã dừng để đặt lịch mới</legend>
    <label v-for="device in devices" :key="device.bookingId" class="flex min-h-11 items-center gap-3">
      <input v-model="selected" type="checkbox" :value="device.bookingId" class="h-4 w-4 accent-brand-600" />
      Máy {{ device.sequence }}{{ device.deviceLabel ? ` · ${device.deviceLabel}` : '' }}
    </label>
    <p>Chỉ các máy bạn chọn được đưa vào biểu mẫu. Hệ thống kiểm tra quyền và nguồn đặt lại; bạn chọn lịch, địa chỉ và xác nhận giá mới. Không cần chờ đối soát đơn cũ.</p>
    <FhButton variant="secondary" size="md" :disabled="disabled || !valid" data-testid="stopped-rebook-continue" @click="rebook">Tiếp tục với {{ selected.length }} máy đã chọn</FhButton>
  </fieldset>
</template>
