<script setup lang="ts">
/**
 * One VisitGroup may contain up to three physical devices, each with its own
 * ServiceOrder. This is navigation only: parts, quotations and evidence still
 * belong to the selected ServiceOrder.
 */
import { computed } from 'vue';
import { PackageCheck } from 'lucide-vue-next';
import type { VisitCheckout } from '../../api/visit-groups.api';
import type { TechnicianVisitDeviceStatus } from '../../utils/technician-visit-device-status';
import { projectTechnicianVisitDeviceStatus } from '../../utils/technician-visit-device-status';

const props = withDefaults(defineProps<{
  devices: VisitCheckout['devices'];
  activeOrderId: string;
  statusByOrderId?: Record<string, TechnicianVisitDeviceStatus>;
  pendingReadyPartRequest?: { orderId: string; sequence: number } | null;
}>(), {
  statusByOrderId: () => ({}),
  pendingReadyPartRequest: null,
});
const emit = defineEmits<{ openParts: [orderId: string] }>();

const devices = computed(() => [...props.devices].sort((a, b) => a.sequence - b.sequence).slice(0, 3));
const resolved = computed(() => devices.value.filter((device) => device.state !== 'open').length);
const nextOpen = computed(() => {
  const current = devices.value.find((device) => device.serviceOrderId === props.activeOrderId);
  // Keep the currently open machine in focus; suggest another only after its outcome is recorded.
  if (!current || current.state === 'open') return null;
  return devices.value.find((device) => device.state === 'open' && !!device.serviceOrderId && device.serviceOrderId !== props.activeOrderId) ?? null;
});

function deviceLabel(device: VisitCheckout['devices'][number]) {
  if (device.serviceName && device.deviceLabel) return `${device.serviceName} · ${device.deviceLabel}`;
  return device.serviceName || device.deviceLabel || 'Thiết bị';
}

function statusFor(device: VisitCheckout['devices'][number]): TechnicianVisitDeviceStatus {
  return device.serviceOrderId
    ? props.statusByOrderId[device.serviceOrderId] ?? projectTechnicianVisitDeviceStatus(device.state, null, null)
    : projectTechnicianVisitDeviceStatus(device.state, null, null);
}

function toneClass(tone: TechnicianVisitDeviceStatus['tone']) {
  if (tone === 'attention') return 'text-warning-800';
  if (tone === 'progress') return 'text-brand-700';
  if (tone === 'success') return 'text-success-700';
  if (tone === 'danger') return 'text-danger-700';
  return 'text-ink-600';
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
          class="min-w-0 rounded-xl border border-brand-600 bg-brand-50 px-2.5 py-3"
          aria-current="page"
          :data-testid="`tech-visit-device-${device.sequence}`"
        >
          <span class="flex items-center justify-between gap-1 text-sm font-semibold text-brand-800">Máy {{ device.sequence }}<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" /></span>
          <span class="mt-1 block truncate text-xs text-ink-800" :title="deviceLabel(device)">{{ deviceLabel(device) }}</span>
          <span class="mt-1 block text-xs font-medium" :class="toneClass(statusFor(device).tone)" :data-testid="`tech-visit-action-status-${device.sequence}`">{{ statusFor(device).label }}</span>
          <span v-if="statusFor(device).custodyLabel" class="mt-2 block text-xs leading-relaxed text-warning-800" :data-testid="`tech-visit-custody-status-${device.sequence}`">{{ statusFor(device).custodyLabel }}</span>
        </div>
        <router-link
          v-else-if="device.serviceOrderId"
          :to="`/tech/jobs/${device.serviceOrderId}`"
          class="min-w-0 rounded-xl border border-ink-200 bg-white px-2.5 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          :aria-label="`Mở máy ${device.sequence}: ${deviceLabel(device)}, ${statusFor(device).label}${statusFor(device).custodyLabel ? `, ${statusFor(device).custodyLabel}` : ''}`"
          :data-testid="`tech-visit-device-${device.sequence}`"
        >
          <span class="flex items-center justify-between gap-1 text-sm font-semibold text-ink-900">Máy {{ device.sequence }}<span v-if="statusFor(device).tone === 'attention' || statusFor(device).custodyLabel" class="h-2 w-2 shrink-0 rounded-full bg-warning-600" aria-hidden="true" /></span>
          <span class="mt-1 block truncate text-xs text-ink-700" :title="deviceLabel(device)">{{ deviceLabel(device) }}</span>
          <span class="mt-1 block text-xs font-medium" :class="toneClass(statusFor(device).tone)" :data-testid="`tech-visit-action-status-${device.sequence}`">{{ statusFor(device).label }}</span>
          <span v-if="statusFor(device).custodyLabel" class="mt-2 block text-xs leading-relaxed text-warning-800" :data-testid="`tech-visit-custody-status-${device.sequence}`">{{ statusFor(device).custodyLabel }}</span>
        </router-link>
        <div
          v-else
          class="min-w-0 rounded-xl border border-ink-200 bg-ink-25 px-2.5 py-3 text-ink-500"
          :data-testid="`tech-visit-device-${device.sequence}`"
        >
          <span class="block text-sm font-semibold">Máy {{ device.sequence }}</span>
          <span class="mt-1 block truncate text-xs" :title="deviceLabel(device)">{{ deviceLabel(device) }}</span>
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
    <div v-if="pendingReadyPartRequest" class="flex flex-wrap items-center justify-between gap-x-3 rounded-xl bg-warning-50 px-3 py-2 text-sm text-warning-900" role="status" aria-live="polite" data-testid="tech-visit-ready-parts-alert">
      <p class="flex min-w-0 flex-[1_1_12rem] items-center gap-2"><PackageCheck :size="20" class="shrink-0" aria-hidden="true" /><span>Máy {{ pendingReadyPartRequest.sequence }} có linh kiện sẵn sàng nhận.</span></p>
      <button type="button" class="min-h-11 rounded-lg px-2 font-semibold text-warning-900 underline underline-offset-4 hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-700" :aria-label="`Mở máy ${pendingReadyPartRequest.sequence} và khu vực linh kiện`" data-testid="tech-visit-ready-parts-action" @click="emit('openParts', pendingReadyPartRequest.orderId)">
        Xem linh kiện máy {{ pendingReadyPartRequest.sequence }}
      </button>
    </div>
    <p class="text-xs text-ink-600">Chọn máy để xem báo giá, ảnh và linh kiện riêng.</p>
  </nav>
</template>
