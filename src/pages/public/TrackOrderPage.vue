<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { Search } from 'lucide-vue-next';

import {
  FhButton,
  FhStatusPill,
  FhTimeline,
  MapTilerMap,
  type MapMarker,
  type TimelineStep,
} from '../../components';
import { ordersApi, type PublicTrackResult } from '../../api/orders.api';

const orderCode = ref('');
const phone = ref('');
const searched = ref(false);
const loading = ref(false);
const errorMessage = ref('');

useSmoothScroll();

const foundOrder = ref<PublicTrackResult | null>(null);

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: 'Đơn đã được nhận',
  EN_ROUTE: 'Kỹ thuật viên đang di chuyển',
  UNDER_REPAIR: 'Đang tiến hành sửa chữa',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã huỷ',
};

const timelineSteps = computed<TimelineStep[]>(() => {
  const entries = foundOrder.value?.timeline ?? [];
  return entries.map((entry, index) => ({
    key: `${entry.status}-${index}`,
    label: STATUS_LABEL[entry.status.toUpperCase()] || entry.status,
    timestamp: new Date(entry.timestamp).toLocaleString('vi-VN'),
    completed: index < entries.length - 1,
    current: index === entries.length - 1,
  }));
});

const showMap = computed(() =>
  (foundOrder.value?.status === 'EN_ROUTE' || foundOrder.value?.status === 'UNDER_REPAIR')
  && !!foundOrder.value?.technicianLocation,
);

const trackingMarkers = computed<MapMarker[]>(() => {
  const markers: MapMarker[] = [];
  if (foundOrder.value?.destination) markers.push({ id: 'destination', lat: foundOrder.value.destination.lat, lng: foundOrder.value.destination.lng, color: '#16a34a' });
  if (foundOrder.value?.technicianLocation) markers.push({ id: 'technician', lat: foundOrder.value.technicianLocation.lat, lng: foundOrder.value.technicianLocation.lng, color: '#2563eb' });
  return markers;
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
const startPoll = () => {
  stopPoll();
  pollTimer = setInterval(async () => {
    try {
      const fresh = await ordersApi.trackOrder(orderCode.value.trim(), phone.value.trim());
      foundOrder.value = fresh;
      if (fresh.status !== 'EN_ROUTE' && fresh.status !== 'UNDER_REPAIR') stopPoll();
    } catch {
      // Ignore transient polling errors; next tick retries.
    }
  }, 15000);
};

onBeforeUnmount(stopPoll);

const handleTrack = async () => {
  if (!orderCode.value.trim() || !phone.value.trim()) return;
  loading.value = true;
  errorMessage.value = '';
  stopPoll();

  try {
    foundOrder.value = await ordersApi.trackOrder(orderCode.value.trim(), phone.value.trim());
    searched.value = true;
    if (foundOrder.value.status === 'EN_ROUTE' || foundOrder.value.status === 'UNDER_REPAIR') startPoll();
  } catch {
    foundOrder.value = null;
    searched.value = true;
    errorMessage.value = 'Không tìm thấy đơn hàng phù hợp với mã đơn và số điện thoại đã nhập.';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 py-24 space-y-12">
    <div class="text-center space-y-4 max-w-2xl mx-auto">
      <div class="w-16 h-16 bg-slate-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm">
        <Search :size="28" />
      </div>
      <h1 class="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
        Tra cứu tiến độ <br class="hidden sm:block"/>đơn sửa chữa
      </h1>
      <p class="text-slate-500 text-lg font-medium pt-2">
        Nhập mã đơn hàng và số điện thoại đã đăng ký để kiểm tra trạng thái thực tế của kỹ thuật viên.
      </p>
    </div>

    <!-- Search Form Box -->
    <div class="bg-white border border-slate-200 rounded-4xl p-8 md:p-12 shadow-xl shadow-slate-200/50 relative z-10 max-w-3xl mx-auto">
      <form class="space-y-6" @submit.prevent="handleTrack">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="block text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Mã đơn hàng
            </label>
            <input
              v-model="orderCode"
              type="text"
              required
              placeholder="Ví dụ: FH-8821"
              class="w-full h-14 px-5 text-sm bg-slate-50 border border-slate-200 rounded-2xl uppercase font-num focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 shadow-sm transition-all text-slate-900"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Số điện thoại
            </label>
            <input
              v-model="phone"
              type="tel"
              required
              placeholder="Ví dụ: 0901234567"
              class="w-full h-14 px-5 text-sm bg-slate-50 border border-slate-200 rounded-2xl font-num focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 shadow-sm transition-all text-slate-900"
            />
          </div>
        </div>

        <div class="pt-4">
          <FhButton type="submit" variant="primary" size="lg" block class="rounded-full shadow-lg shadow-brand-500/25 h-14 text-base" :loading="loading">
            <Search :size="18" class="mr-2" />
            Tra cứu thông tin
          </FhButton>
        </div>
      </form>
    </div>

    <!-- Results Display -->
    <div v-if="searched" class="space-y-6 pt-4 max-w-3xl mx-auto">
      <div v-if="errorMessage" class="bg-white border border-slate-200 rounded-4xl p-8 text-center text-sm font-medium text-slate-500">
        {{ errorMessage }}
      </div>

      <div v-else-if="foundOrder" class="bg-white border border-slate-200 rounded-4xl p-8 md:p-10 shadow-xl shadow-slate-200/50 space-y-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">{{ foundOrder.code }}</span>
            <h3 class="text-xl font-bold text-slate-900 mb-2">{{ foundOrder.serviceName }}</h3>
            <p v-if="foundOrder.technician" class="text-sm font-medium text-slate-500">
              Thợ phụ trách: {{ foundOrder.technician.fullName }} ({{ foundOrder.technician.phoneNumber }})
            </p>
          </div>
          <FhStatusPill :status="foundOrder.status" />
        </div>

        <!-- Live map -->
        <div v-if="showMap" class="space-y-2">
          <h4 class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Vị trí kỹ thuật viên</h4>
          <MapTilerMap
            :center="foundOrder.technicianLocation ? { lat: foundOrder.technicianLocation.lat, lng: foundOrder.technicianLocation.lng } : (foundOrder.destination || { lat: 21.0285, lng: 105.8542 })"
            :markers="trackingMarkers"
            height-class="h-72"
          />
        </div>

        <!-- Timeline -->
        <div>
          <h4 class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">Tiến trình thực hiện</h4>
          <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
          <p v-else class="text-xs text-slate-400 italic">Chưa có cập nhật tiến trình cho đơn này.</p>
        </div>
      </div>
    </div>
  </div>
</template>
