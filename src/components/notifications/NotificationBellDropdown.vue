<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bell,
  CheckCheck,
  Wrench,
  Shield,
  Sparkles,
  ExternalLink,
  Clock,
  Inbox,
  DollarSign,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  AlertTriangle,
  ArrowRight,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { useAuthStore } from '../../stores/auth';
import { useNotificationsStore } from '../../stores/notifications.store';
import { resolveCustomerNotificationPath, resolvePartRequestServiceOrderId, getNotificationCategory, type NotificationItem } from '../../api/notifications.api';
import { vnDateString } from '../../utils/vn-time';

const router = useRouter();
const authStore = useAuthStore();
const notifStore = useNotificationsStore();

const isOpen = ref(false);
const activeTab = ref<'all' | 'unread'>('all');
const dropdownRef = ref<HTMLElement | null>(null);
const bellRef = ref<HTMLButtonElement | null>(null);
function closeDropdown() {
  isOpen.value = false;
  bellRef.value?.focus();
}
const viewAllLabel = computed(() => {
  const role = (authStore.userRole || '').toUpperCase();
  return role === 'TECHNICIAN' ? 'Xem công việc' : ['SERVICE_MANAGER', 'ADMIN'].includes(role) ? 'Xem đơn sửa chữa' : 'Xem tất cả thông báo';
});

// Watch for incoming new unread notifications to alert user via toast
let previousUnreadCount = -1;
watch(
  () => notifStore.unreadCount,
  (newCount, oldCount) => {
    if (previousUnreadCount !== -1 && newCount > oldCount && newCount > 0) {
      const newest = notifStore.notifications[0];
      if (newest && !newest.isRead) {
        toast.info(newest.title, {
          description: newest.message,
          action: {
            label: 'Xem ngay',
            onClick: () => handleItemClick(newest),
          },
        });
      }
    }
    previousUnreadCount = newCount;
  }
);

onMounted(() => {
  notifStore.startPolling(20000);
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  notifStore.stopPolling();
  document.removeEventListener('click', handleClickOutside);
});

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

const toggleDropdown = async () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    await notifStore.fetchNotifications(1, 25);
  }
};

const displayedNotifications = computed(() => {
  if (activeTab.value === 'unread') {
    return notifStore.unreadNotifications;
  }
  return notifStore.notifications;
});

const effectiveUnreadCount = computed(() => {
  return Math.max(notifStore.unreadCount, notifStore.unreadNotifications.length);
});

const formatTimeAgo = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return vnDateString(date, { day: '2-digit', month: '2-digit' });
};

const handleItemClick = async (item: NotificationItem) => {
  if (!item.isRead) {
    await notifStore.markAsRead(item.id);
  }
  isOpen.value = false;

  const role = (authStore.userRole || '').toUpperCase();
  const refType = (item.referenceType || '').trim().toUpperCase();
  const itemType = (item.type || '').toUpperCase();

  // A support reference identifies a case, never an order, regardless of the event name.
  // Customers and technicians have no console access; do not fetch private staff context.
  if (refType === 'SUPPORT_CASE') {
    if (role === 'SERVICE_MANAGER' || role === 'ADMIN') {
      router.push(item.referenceId ? `/console/support/${encodeURIComponent(item.referenceId)}` : '/console/support');
    } else {
      router.push(role === 'TECHNICIAN' ? '/tech/jobs' : role === 'CUSTOMER' ? '/app/notifications' : '/403');
    }
    return;
  }

  // 1. TECHNICIAN navigation
  if (role === 'TECHNICIAN') {
    if (itemType === 'PART_REQUEST_READY') {
      const orderId = await resolvePartRequestServiceOrderId(item);
      if (orderId) router.push(`/tech/jobs/${encodeURIComponent(orderId)}`);
      else toast.error('Không mở được máy liên quan. Vui lòng tải lại thông báo và thử lại.');
      return;
    }
    if (refType === 'CONVERSATION' || itemType.includes('CHAT') || item.message?.toLowerCase().includes('tin nhắn')) {
      router.push('/tech/messages');
      return;
    }
    if (refType.includes('BOOKING') || itemType.includes('INVITATION')) {
      router.push('/tech/invitations');
      return;
    }
    if (refType === 'VISIT_GROUP' || refType === 'PART_REQUEST') {
      router.push('/tech/jobs');
      return;
    }
    if (item.referenceId) {
      router.push(`/tech/jobs/${encodeURIComponent(item.referenceId)}`);
      return;
    }
    router.push('/tech/jobs');
    return;
  }

  // 2. SERVICE_MANAGER or ADMIN navigation
  if (role === 'SERVICE_MANAGER' || role === 'ADMIN') {
    if (role === 'SERVICE_MANAGER' && itemType === 'PART_RETURN_DECLARED') {
      router.push('/console/part-returns');
      return;
    }
    if (refType.includes('PART_REQUEST') || itemType.startsWith('PART_REQUEST')) {
      router.push('/console/part-requests');
      return;
    }
    if (role === 'SERVICE_MANAGER' && (itemType.includes('CANCEL') || itemType.includes('DISPUTE'))) {
      router.push('/console/cancellations');
      return;
    }
    if (refType.includes('BOOKING')) {
      router.push('/console/bookings');
      return;
    }
    if (refType === 'VISIT_GROUP' || refType === 'CONVERSATION') {
      router.push('/console/orders');
      return;
    }
    if (item.referenceId) {
      router.push(`/console/orders/${encodeURIComponent(item.referenceId)}`);
      return;
    }
    router.push('/console/orders');
    return;
  }

  // 3. CUSTOMER navigation
  if (role !== 'CUSTOMER') {
    router.push('/403');
    return;
  }
  if (refType === 'CONVERSATION' || itemType.includes('CHAT') || item.message?.toLowerCase().includes('tin nhắn')) {
    router.push('/app/messages');
    return;
  }
  const customerPath = await resolveCustomerNotificationPath(item);
  if (customerPath) {
    router.push(customerPath);
    return;
  }
  if (itemType === 'PART_REQUEST_READY') {
    toast.error('Không mở được thiết bị liên quan. Vui lòng tải lại thông báo và thử lại.');
    return;
  }

  router.push('/app/notifications');
};

const handleMarkAllRead = async () => {
  await notifStore.markAllAsRead();
  toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
};

const handleViewAll = () => {
  isOpen.value = false;
  const role = (authStore.userRole || '').toUpperCase();
  if (role === 'TECHNICIAN') {
    router.push('/tech/jobs');
  } else if (role === 'SERVICE_MANAGER' || role === 'ADMIN') {
    router.push('/console/orders');
  } else {
    router.push('/app/notifications');
  }
};
</script>

<template>
  <div ref="dropdownRef" class="relative inline-block text-left" @keydown.esc.stop.prevent="closeDropdown">
    <!-- Bell Button -->
    <button
      type="button"
      id="fixhome-global-bell-btn"
      ref="bellRef"
      class="relative flex h-11 w-11 items-center justify-center rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      :class="{ 'bg-ink-100 text-brand-600': isOpen }"
      title="Thông báo hệ thống"
      :aria-label="effectiveUnreadCount ? `Thông báo, ${effectiveUnreadCount} chưa đọc` : 'Thông báo'"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? 'fixhome-notifications-panel' : undefined"
      @click="toggleDropdown"
    >
      <Bell :size="20" class="transition-transform group-hover:scale-105" />

      <!-- Unread Badge with Ping Animation -->
      <span
        v-if="effectiveUnreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1.5 flex items-center justify-center text-[10px] font-bold text-white bg-danger-600 rounded-full shadow-xs ring-2 ring-white font-num leading-none"
      >
        <span class="relative">
          {{ effectiveUnreadCount > 99 ? '99+' : effectiveUnreadCount }}
        </span>
      </span>
    </button>

    <!-- Dropdown Popover -->
    <Transition
      enter-active-class="transition ease-out duration-200 motion-reduce:transition-none"
      enter-from-class="transform opacity-0 scale-95 -translate-y-2"
      enter-to-class="transform opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-150 motion-reduce:transition-none"
      leave-from-class="transform opacity-100 scale-100 translate-y-0"
      leave-to-class="transform opacity-0 scale-95 -translate-y-2"
    >
      <div
        v-if="isOpen"
        id="fixhome-notifications-panel"
        role="region"
        aria-label="Thông báo"
        class="fixed inset-x-4 top-16 z-50 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white text-ink-900 shadow-(--shadow-e3) sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96"
      >
        <!-- Header -->
        <div class="p-3.5 px-4 bg-white border-b border-ink-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-ink-900">Thông báo</span>
            <span
              v-if="effectiveUnreadCount > 0"
              class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-brand-100 text-brand-700 font-num"
            >
              {{ effectiveUnreadCount }} mới
            </span>
          </div>

          <button
            v-if="effectiveUnreadCount > 0"
            type="button"
            class="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            title="Đánh dấu đã đọc tất cả"
            @click="handleMarkAllRead"
          >
            <CheckCheck :size="14" class="text-brand-600" />
            <span>Đánh dấu tất cả đã đọc</span>
          </button>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center border-b border-ink-100 bg-ink-50/60 px-3 pt-2 text-xs font-medium">
          <button
            type="button"
            class="relative min-h-11 rounded-t-lg px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
            :aria-pressed="activeTab === 'all'"
            :class="activeTab === 'all' ? 'text-brand-600 font-bold border-b-2 border-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'all'"
          >
            Tất cả ({{ notifStore.total || notifStore.notifications.length }})
          </button>
          <button
            type="button"
            class="relative min-h-11 rounded-t-lg px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
            :aria-pressed="activeTab === 'unread'"
            :class="activeTab === 'unread' ? 'text-brand-600 font-bold border-b-2 border-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'unread'"
          >
            Chưa đọc ({{ effectiveUnreadCount }})
          </button>
        </div>

        <!-- Notification Items List -->
        <div class="min-h-0 max-h-96 overflow-y-auto divide-y divide-ink-100">
          <div v-if="notifStore.loading && notifStore.notifications.length === 0" class="py-12 text-center text-xs text-ink-400">
            <div class="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Đang tải thông báo...
          </div>

          <div
            v-else-if="displayedNotifications.length === 0"
            class="py-12 px-4 text-center text-ink-400 flex flex-col items-center justify-center gap-2"
          >
            <div class="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center text-ink-400">
              <Inbox :size="20" />
            </div>
            <p class="text-xs font-medium text-ink-500">
              {{ activeTab === 'unread' ? 'Không có thông báo chưa đọc nào' : 'Bạn chưa có thông báo nào' }}
            </p>
            <span class="text-[11px] text-ink-400">Các thông báo về tiến độ, phí phát sinh và hệ thống sẽ hiển thị tại đây</span>
          </div>

          <template v-else>
            <button
              v-for="item in displayedNotifications"
              :key="item.id"
              type="button"
              class="group relative flex min-h-11 w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
              :class="{ 'bg-brand-50/25': !item.isRead }"
              @click="handleItemClick(item)"
            >
              <!-- Dynamic Icon Avatar Based on Notification Category / Severity -->
              <div class="shrink-0 mt-0.5">
                <div
                  class="w-8 h-8 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105"
                  :class="[getNotificationCategory(item).iconBgClass, getNotificationCategory(item).iconColorClass]"
                >
                  <DollarSign v-if="getNotificationCategory(item).iconName === 'dollar'" :size="15" />
                  <CheckCircle2 v-else-if="getNotificationCategory(item).iconName === 'check'" :size="15" />
                  <XCircle v-else-if="getNotificationCategory(item).iconName === 'x'" :size="15" />
                  <Truck v-else-if="getNotificationCategory(item).iconName === 'truck'" :size="15" />
                  <Package v-else-if="getNotificationCategory(item).iconName === 'package'" :size="15" />
                  <Clock v-else-if="getNotificationCategory(item).iconName === 'clock'" :size="15" />
                  <Sparkles v-else-if="getNotificationCategory(item).iconName === 'sparkles'" :size="15" />
                  <Shield v-else-if="getNotificationCategory(item).iconName === 'shield'" :size="15" />
                  <Wrench v-else-if="getNotificationCategory(item).iconName === 'wrench'" :size="15" />
                  <AlertTriangle v-else-if="getNotificationCategory(item).iconName === 'alert'" :size="15" />
                  <Bell v-else :size="15" />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span
                      class="text-[10px] font-bold px-1.5 py-0.2 rounded-full border shadow-2xs"
                      :class="getNotificationCategory(item).badgeClass"
                    >
                      {{ getNotificationCategory(item).label }}
                    </span>
                    <span
                      class="break-words text-sm font-semibold text-ink-900"
                      :class="{ 'text-brand-900 font-bold': !item.isRead }"
                    >
                      {{ item.title }}
                    </span>
                  </div>

                  <!-- Unread Dot -->
                  <span
                    v-if="!item.isRead"
                    class="w-2 h-2 rounded-full bg-brand-600 shrink-0"
                    title="Chưa đọc"
                  ></span>
                </div>

                <p class="text-xs text-ink-600 leading-relaxed line-clamp-2">
                  {{ item.message }}
                </p>

                <div class="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-ink-600">
                  <span class="flex items-center gap-1">
                    <Clock :size="12" />
                    {{ formatTimeAgo(item.createdAt) }}
                  </span>

                  <span
                    v-if="item.referenceId"
                    class="inline-flex items-center gap-1 font-medium text-brand-700 group-hover:underline"
                  >
                    {{ item.type?.toUpperCase() === 'PART_RETURN_DECLARED' ? 'Mở trang hoàn trả' : item.type?.toUpperCase() === 'PART_REQUEST_READY' ? 'Xem máy và linh kiện' : 'Xem chi tiết' }}
                    <ExternalLink :size="10" />
                  </span>
                </div>
              </div>
            </button>
          </template>
        </div>

        <!-- Footer -->
        <div class="p-2.5 px-4 bg-ink-50/80 border-t border-ink-100 flex items-center justify-between text-xs">
          <button
            type="button"
            class="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-center font-medium text-ink-600 transition-colors hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            @click="handleViewAll"
          >
            <span>{{ viewAllLabel }}</span>
            <ArrowRight :size="12" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
