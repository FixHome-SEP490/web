<script setup lang="ts">
/**
 * One VisitGroup may contain up to three physical devices, each with its own
 * ServiceOrder. This is navigation only: parts, quotations and evidence still
 * belong to the selected ServiceOrder.
 */
import { computed } from 'vue';
import type { VisitCheckout, VisitDeviceState } from '../../api/visit-groups.api';

const props = defineProps<{
  devices: VisitCheckout['devices'];
  activeOrderId: string;
}>();

const devices = computed(() => [...props.devices].sort((a, b) => a.sequence - b.sequence).slice(0, 3));
const resolved = computed(() => devices.value.filter((device) => device.state !== 'open').length);
const nextOpen = computed(() => {
  const current = devices.value.find((device) => device.serviceOrderId === props.activeOrderId);
  // Keep the currently open machine in focus; suggest another only after its outcome is recorded.
  if (!current || current.state === 'open') return null;
  return devices.value.find((device) => device.state === 'open' && !!device.serviceOrderId && device.serviceOrderId !== props.activeOrderId) ?? null;
});

const stateLabel: Record<VisitDeviceState, string> = {
  open: 'Đang xử lý',
  succeeded: 'Đã sửa xong',
  failed: 'Không sửa được',
  quote_declined: 'Khách không duyệt báo giá',
  cancelled: 'Đã huỷ',
};

function deviceLabel(device: VisitCheckout['devices'][number]) {
  if (device.serviceName && device.deviceLabel) return `${device.serviceName} · ${device.deviceLabel}`;
  return device.serviceName || device.deviceLabel || 'Thiết bị';
}
</script>

<template>
  <nav class="space-y-3" aria-label="Các máy trong lượt sửa" data-testid="tech-visit-navigator">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-semibold text-ink-900">Lượt sửa {{ devices.length }} thiết bị</h2>
      <span class="text-xs text-ink-600" data-testid="tech-visit-progress">
        Kết quả {{ resolved }}/{{ devices.length }} máy
      </span>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <template v-for="device in devices" :key="device.bookingId">
        <div
          v-if="device.serviceOrderId === activeOrderId"
          class="min-w-0 rounded-xl border border-brand-500 bg-brand-50 px-2.5 py-3"
          aria-current="page"
          :data-testid="`tech-visit-device-${device.sequence}`"
        >
          <span class="block text-sm font-semibold text-brand-800">Máy {{ device.sequence }}</span>
          <span class="mt-0.5 block break-words text-xs text-ink-800 line-clamp-2">{{ deviceLabel(device) }}</span>
          <span class="mt-1 block text-xs text-brand-700">{{ stateLabel[device.state] }}</span>
        </div>
        <router-link
          v-else-if="device.serviceOrderId"
          :to="`/tech/jobs/${device.serviceOrderId}`"
          class="min-w-0 rounded-xl border border-ink-200 bg-white px-2.5 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          :aria-label="`Mở máy ${device.sequence}: ${deviceLabel(device)}`"
          :data-testid="`tech-visit-device-${device.sequence}`"
        >
          <span class="block text-sm font-semibold text-ink-900">Máy {{ device.sequence }}</span>
          <span class="mt-0.5 block break-words text-xs text-ink-700 line-clamp-2">{{ deviceLabel(device) }}</span>
          <span class="mt-1 block text-xs text-ink-600">{{ stateLabel[device.state] }}</span>
        </router-link>
        <div
          v-else
          class="min-w-0 rounded-xl border border-ink-200 bg-ink-25 px-2.5 py-3 text-ink-500"
          :data-testid="`tech-visit-device-${device.sequence}`"
        >
          <span class="block text-sm font-semibold">Máy {{ device.sequence }}</span>
          <span class="mt-0.5 block break-words text-xs line-clamp-2">{{ deviceLabel(device) }}</span>
          <span class="mt-1 block text-xs">Chưa có công việc</span>
        </div>
      </template>
    </div>
    <router-link
      v-if="nextOpen"
      class="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-lg"
      :to="`/tech/jobs/${nextOpen.serviceOrderId}`"
      data-testid="tech-visit-next"
    >
      Xử lý tiếp: Máy {{ nextOpen.sequence }}
    </router-link>
    <p class="text-xs text-ink-600">Mỗi máy có báo giá, hình ảnh và yêu cầu linh kiện riêng. Khách thanh toán một lần cho cả lượt.</p>
  </nav>
</template>
