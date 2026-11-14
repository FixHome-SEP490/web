<script setup lang="ts">
import { computed } from 'vue';
import {
  BadgeCheck,
  Check,
  MapPin,
  Maximize2,
  MessageSquare,
  Navigation,
  Phone,
  Star,
} from 'lucide-vue-next';
import { FhButton, MapTilerMap, type MapMarker } from '..';
import type { ServiceOrderItem } from '../../api/orders.api';
import { formatRating } from '../../utils/formatters';
import { vnTimeString } from '../../utils/vn-time';

const props = defineProps<{
  order: ServiceOrderItem;
  markers: MapMarker[];
}>();

const emit = defineEmits<{
  (e: 'expand'): void;
  (e: 'chat'): void;
}>();

const distanceFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

const mapCenter = computed(() => {
  if (props.order.technicianLocation) {
    return { lat: props.order.technicianLocation.lat, lng: props.order.technicianLocation.lng };
  }
  if (props.order.destination) {
    return { lat: props.order.destination.lat, lng: props.order.destination.lng };
  }
  return { lat: 21.0285, lng: 105.8542 };
});

/** Straight-line distance in km when both coordinates exist; never fabricated when missing. */
const straightLineDistanceText = computed<string | null>(() => {
  const dest = props.order.destination;
  const tech = props.order.technicianLocation;
  if (!dest || !tech) return null;
  if (
    !Number.isFinite(dest.lat)
    || !Number.isFinite(dest.lng)
    || !Number.isFinite(tech.lat)
    || !Number.isFinite(tech.lng)
  ) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(dest.lat - tech.lat);
  const dLng = toRad(dest.lng - tech.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(tech.lat)) * Math.cos(toRad(dest.lat)) * Math.sin(dLng / 2) ** 2;
  const km = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (!Number.isFinite(km) || km < 0) return null;
  if (km < 0.1) return 'Dưới 0,1 km';
  return `${distanceFormatter.format(km)} km`;
});

const updatedAtLabel = computed(() => {
  const raw = props.order.technicianLocation?.updatedAt;
  return raw ? vnTimeString(raw) : null;
});

const ratingText = computed(() => formatRating(props.order.technician?.averageRating));

const steps = [
  { label: 'Đã nhận đơn', state: 'done' as const },
  { label: 'Đang di chuyển', state: 'active' as const },
  { label: 'Đến nơi & xác minh', state: 'upcoming' as const },
];
</script>

<template>
  <section
    data-testid="live-arrival-card"
    aria-label="Theo dõi kỹ thuật viên đang di chuyển"
    class="rounded-2xl bg-white border border-brand-200/90 shadow-(--shadow-e1) overflow-hidden animate-slide-up-delay-1"
  >
    <!-- Live status strip + honest GPS telemetry -->
    <div class="bg-brand-50/75 border-b border-brand-100 px-4 py-3.5 sm:px-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span class="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-600" />
          </span>
          <h2 class="text-sm sm:text-base font-semibold text-ink-900 text-pretty">
            Kỹ thuật viên đang trên đường đến nhà bạn
          </h2>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            v-if="straightLineDistanceText"
            title="Khoảng cách đường chim bay theo vị trí GPS gần nhất"
            class="inline-flex items-center gap-1 rounded-full bg-white border border-brand-200/80 px-2.5 py-1 font-semibold font-num text-brand-700"
            data-testid="arrival-distance-badge"
          >
            <Navigation :size="12" :stroke-width="2" aria-hidden="true" />
            Cách khoảng {{ straightLineDistanceText }}
          </span>
          <span
            v-if="updatedAtLabel"
            class="inline-flex items-center rounded-full bg-white border border-ink-200/80 px-2.5 py-1 font-num text-ink-600"
            data-testid="arrival-updated-badge"
          >
            Cập nhật {{ updatedAtLabel }}
          </span>
          <span
            v-else
            class="inline-flex items-center rounded-full bg-white border border-ink-200/80 px-2.5 py-1 text-ink-500"
          >
            Đang chờ tín hiệu GPS
          </span>
        </div>
      </div>

      <!-- Compact 3-stage Grab-style trip stepper -->
      <ol class="grid grid-cols-3 gap-2">
        <li v-for="item in steps" :key="item.label" class="space-y-1">
          <span
            class="block h-1.5 rounded-full transition-colors duration-200"
            :class="
              item.state === 'done'
                ? 'bg-success-500'
                : item.state === 'active'
                  ? 'bg-brand-600'
                  : 'bg-ink-200/80'
            "
          />
          <span
            class="inline-flex items-center gap-1 text-[11px] truncate max-w-full"
            :class="
              item.state === 'active'
                ? 'font-semibold text-brand-700'
                : item.state === 'done'
                  ? 'font-medium text-ink-700'
                  : 'text-ink-500'
            "
          >
            <Check v-if="item.state === 'done'" :size="11" :stroke-width="2.5" class="text-success-600 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ item.label }}</span>
          </span>
        </li>
      </ol>
    </div>

    <!-- Inline live map -->
    <div class="relative p-3 sm:p-4 pb-0">
      <div class="relative">
        <MapTilerMap
          :center="mapCenter"
          :markers="markers"
          height-class="h-52 sm:h-64"
        />

        <!-- Legend pill -->
        <div
          class="pointer-events-none absolute left-3 bottom-3 z-10 inline-flex flex-wrap items-center gap-3 rounded-full bg-white/95 backdrop-blur-xs border border-ink-200/80 px-3 py-1 text-[11px] font-medium text-ink-700 shadow-xs"
        >
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-brand-100" aria-hidden="true" />
            Kỹ thuật viên
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-success-600 ring-2 ring-success-100" aria-hidden="true" />
            Điểm đến
          </span>
        </div>

        <!-- Expand button to full modal map -->
        <button
          type="button"
          class="absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-xs border border-ink-200/90 px-3 text-xs font-semibold text-ink-700 shadow-xs hover:border-brand-300 hover:text-brand-600 active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,color,transform] duration-150 ease-out cursor-pointer"
          aria-label="Xem vị trí kỹ thuật viên"
          data-testid="arrival-expand-map"
          @click="emit('expand')"
        >
          <Maximize2 :size="13" aria-hidden="true" />
          <span>Mở rộng</span>
        </button>
      </div>
    </div>

    <!-- Bottom pinned technician & destination strip -->
    <div class="p-4 sm:p-5 space-y-3">
      <div class="flex items-start gap-2 text-xs sm:text-sm text-ink-600 rounded-xl bg-ink-50/80 px-3 py-2">
        <MapPin :size="15" :stroke-width="1.8" class="text-success-600 shrink-0 mt-0.5" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-pretty">
          <span class="font-medium text-ink-800">Điểm đến:</span> {{ order.addressSummary }}
        </p>
      </div>

      <div
        v-if="order.technician"
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-full overflow-hidden bg-brand-600 text-white flex items-center justify-center font-semibold text-base shrink-0">
            <img
              v-if="order.technician.avatarUrl"
              :src="order.technician.avatarUrl"
              :alt="order.technician.fullName"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ order.technician.fullName.charAt(0) }}</span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-ink-900 text-sm truncate">{{ order.technician.fullName }}</span>
              <span class="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-success-50 text-success-700 text-xs font-medium whitespace-nowrap shrink-0">
                <BadgeCheck :size="12" aria-hidden="true" /> Đã xác minh
              </span>
            </div>
            <div class="text-xs sm:text-sm text-ink-600 flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
              <span>Kỹ thuật viên</span>
              <span aria-hidden="true" class="text-ink-300">·</span>
              <template v-if="ratingText">
                <Star :size="13" class="text-warning-500 fill-warning-500 shrink-0" aria-hidden="true" />
                <span class="font-medium text-ink-900 font-num">{{ ratingText }}</span>
              </template>
              <span v-else>Chưa có đánh giá</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <a
            v-if="order.technician.phoneNumber"
            :href="`tel:${order.technician.phoneNumber}`"
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-xl bg-white border border-ink-200 text-ink-800 hover:border-brand-300 hover:bg-brand-50/50 active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,background-color,transform] duration-150 text-xs font-semibold font-num whitespace-nowrap"
            title="Gọi kỹ thuật viên"
            aria-label="Gọi kỹ thuật viên"
          >
            <Phone :size="15" class="text-brand-600 shrink-0" aria-hidden="true" />
            <span>Gọi điện</span>
          </a>
          <FhButton variant="primary" size="sm" class="min-h-11" @click="emit('chat')">
            <MessageSquare :size="15" aria-hidden="true" />
            Nhắn tin
          </FhButton>
        </div>
      </div>
    </div>
  </section>
</template>
