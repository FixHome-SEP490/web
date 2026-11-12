<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Bell,
  CalendarCheck,
  CalendarX2,
  Check,
  ClipboardCheck,
  Clock,
  MapPinCheck,
  Package,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-vue-next';
import { getNotificationCategory, type NotificationCategoryMeta, type NotificationItem } from '../../api/notifications.api';

type BadgeTone = 'success' | 'warning' | 'danger';

interface VisualDescriptor {
  icon: Component;
  badge?: BadgeTone;
}

const props = withDefaults(defineProps<{
  item: NotificationItem;
  size?: 'sm' | 'md';
  dimWhenRead?: boolean;
}>(), {
  size: 'md',
  dimWhenRead: false,
});

const categoryMeta = computed(() => getNotificationCategory(props.item));

function badgeFromSeverity(meta: NotificationCategoryMeta): BadgeTone | undefined {
  if (meta.severity === 'success') return 'success';
  if (meta.severity === 'error') return 'danger';
  if (meta.severity === 'warning') return 'warning';
  return undefined;
}

const visual = computed<VisualDescriptor>(() => {
  const meta = categoryMeta.value;
  const type = (props.item.type || '').toUpperCase();
  const title = (props.item.title || '').toLowerCase();

  if (type.includes('QUOTATION') || title.includes('báo giá')) {
    return { icon: ReceiptText, badge: badgeFromSeverity(meta) };
  }
  if (
    type.includes('ADDITIONAL_COST') ||
    type.includes('VISIT_CASH') ||
    type.includes('WALLET') ||
    type.includes('WITHDRAWAL') ||
    title.includes('phí phát sinh') ||
    title.includes('chi phí') ||
    meta.iconName === 'dollar'
  ) {
    return { icon: Banknote, badge: badgeFromSeverity(meta) };
  }
  if (type === 'TECHNICIAN_ARRIVED' || title.includes('đã đến nơi') || title.includes('bắt đầu sửa chữa')) {
    return { icon: MapPinCheck };
  }
  if (type === 'TECHNICIAN_EN_ROUTE' || meta.iconName === 'truck') {
    return { icon: Truck };
  }
  if (type === 'TECHNICIAN_RELEASED' || type === 'BOOKING_MATCHING_EXHAUSTED') {
    return { icon: Users, badge: 'warning' };
  }
  if (type === 'COMPLETION_REQUESTED') {
    return { icon: ClipboardCheck, badge: 'warning' };
  }
  if (type === 'COMPLETION_CONFIRMED' || type === 'ORDER_COMPLETED') {
    return { icon: BadgeCheck };
  }
  if (type === 'PART_REQUEST_READY') {
    return { icon: Package, badge: 'success' };
  }
  if (type === 'PART_RETURN_DECLARED') {
    return { icon: Package, badge: 'warning' };
  }
  if (meta.iconName === 'package') {
    return { icon: Package };
  }
  if (type.startsWith('WARRANTY_') || meta.iconName === 'shield') {
    return { icon: ShieldCheck, badge: meta.severity === 'error' ? 'danger' : meta.severity === 'warning' ? 'warning' : undefined };
  }
  if (type === 'BOOKING_INVITATION') {
    return { icon: CalendarCheck };
  }
  if (type === 'ORDER_DEPARTURE_WARNING' || meta.iconName === 'alert') {
    return { icon: AlertTriangle };
  }
  if (type.includes('CANCEL') || meta.iconName === 'x') {
    return { icon: CalendarX2 };
  }
  if (meta.iconName === 'sparkles') return { icon: Sparkles };
  if (meta.iconName === 'wrench') return { icon: Wrench };
  if (meta.iconName === 'clock') return { icon: Clock };
  if (meta.iconName === 'check') return { icon: BadgeCheck };
  return { icon: Bell };
});

const badgeClasses: Record<BadgeTone, string> = {
  success: 'bg-success-600 text-white',
  warning: 'bg-warning-600 text-white',
  danger: 'bg-danger-600 text-white',
};

const badgeIcon = computed<Component>(() => {
  if (visual.value.badge === 'success') return Check;
  if (visual.value.badge === 'danger') return X;
  return Clock;
});
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center ring-1 ring-inset ring-black/[0.04] transition-opacity"
    :class="[
      size === 'sm' ? 'h-9 w-9 rounded-[11px]' : 'h-11 w-11 rounded-[13px]',
      categoryMeta.iconBgClass,
      categoryMeta.iconColorClass,
      dimWhenRead && item.isRead ? 'opacity-70 saturate-75' : '',
    ]"
    aria-hidden="true"
  >
    <component :is="visual.icon" :size="size === 'sm' ? 17 : 20" :stroke-width="2" />
    <span
      v-if="visual.badge"
      class="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full ring-2 ring-white"
      :class="[
        size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]',
        badgeClasses[visual.badge],
      ]"
    >
      <component :is="badgeIcon" :size="size === 'sm' ? 9 : 10" :stroke-width="3" />
    </span>
  </span>
</template>

