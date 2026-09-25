<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
} from 'lucide-vue-next';
import { useNotificationsStore } from '../../stores/notifications.store';
import { getNotificationCategory, type NotificationItem } from '../../api/notifications.api';

const router = useRouter();
const notifStore = useNotificationsStore();

const isOpen = ref(false);
const activeTab = ref<'all' | 'unread'>('all');
const dropdownRef = ref<HTMLElement | null>(null);

onMounted(() => {
  notifStore.startPolling();
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
    await notifStore.fetchNotifications(1, 20);
  }
};

const displayedNotifications = computed(() => {
  if (activeTab.value === 'unread') {
    return notifStore.unreadNotifications;
  }
  return notifStore.notifications;
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
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const handleItemClick = async (item: NotificationItem) => {
  if (!item.isRead) {
    await notifStore.markAsRead(item.id);
  }
  isOpen.value = false;

  // Determine target navigation based on reference
  if (item.referenceId) {
    const refType = (item.referenceType || '').toUpperCase();
    if (refType.includes('BOOKING')) {
      router.push(`/app/bookings/${item.referenceId}`);
      return;
    }
    // Default to service order detail
    router.push(`/app/orders/${item.referenceId}`);
    return;
  }

  // Check if message mentions chat / tech
  if (item.type?.includes('CHAT') || item.message?.toLowerCase().includes('tin nhắn')) {
    router.push('/app/messages');
    return;
  }

  // Default to notifications center
  router.push('/app/notifications');
};

const handleMarkAllRead = async () => {
  await notifStore.markAllAsRead();
};

const handleViewAll = () => {
  isOpen.value = false;
  router.push('/app/notifications');
};
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Bell Button -->
    <button
      type="button"
      id="customer-notifications-bell-btn"
      class="relative p-2 rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      :class="{ 'bg-ink-100 text-brand-600': isOpen }"
      title="Thông báo"
      @click="toggleDropdown"
    >
      <Bell :size="20" class="transition-transform group-hover:scale-105" />

      <!-- Unread Badge with Ping Animation -->
      <span
        v-if="notifStore.unreadCount > 0"
        class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-extrabold text-white bg-red-600 rounded-full shadow-xs ring-2 ring-white font-num leading-none"
      >
        <span
          class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
        ></span>
        <span class="relative">
          {{ notifStore.unreadCount > 99 ? '99+' : notifStore.unreadCount }}
        </span>
      </span>
    </button>

    <!-- Dropdown Popover -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="transform opacity-0 scale-95 -translate-y-2"
      enter-to-class="transform opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="transform opacity-100 scale-100 translate-y-0"
      leave-to-class="transform opacity-0 scale-95 -translate-y-2"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 mt-2 w-84 sm:w-96 bg-white rounded-2xl border border-ink-200 shadow-2xl z-50 overflow-hidden flex flex-col text-ink-900"
      >
        <!-- Header -->
        <div class="p-3.5 px-4 bg-gradient-to-r from-ink-50 via-white to-brand-50/40 border-b border-ink-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-ink-900">Thông báo</span>
            <span
              v-if="notifStore.unreadCount > 0"
              class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-brand-100 text-brand-700 font-num"
            >
              {{ notifStore.unreadCount }} mới
            </span>
          </div>

          <button
            v-if="notifStore.unreadCount > 0"
            type="button"
            class="text-[11px] font-medium text-ink-500 hover:text-brand-600 transition-colors flex items-center gap-1"
            title="Đánh dấu đã đọc tất cả"
            @click="handleMarkAllRead"
          >
            <CheckCheck :size="14" class="text-brand-600" />
            <span>Đã đọc hết</span>
          </button>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center border-b border-ink-100 bg-ink-50/60 px-3 pt-2 text-xs font-medium">
          <button
            type="button"
            class="pb-2 px-3 transition-colors relative"
            :class="activeTab === 'all' ? 'text-brand-600 font-bold border-b-2 border-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'all'"
          >
            Tất cả ({{ notifStore.notifications.length }})
          </button>
          <button
            type="button"
            class="pb-2 px-3 transition-colors relative"
            :class="activeTab === 'unread' ? 'text-brand-600 font-bold border-b-2 border-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'unread'"
          >
            Chưa đọc ({{ notifStore.unreadCount }})
          </button>
        </div>

        <!-- Notification Items List -->
        <div class="max-h-96 overflow-y-auto divide-y divide-ink-100">
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
            <span class="text-[11px] text-ink-400">Các thông báo từ Thợ, Quản lý và Hệ thống sẽ hiển thị tại đây</span>
          </div>

          <template v-else>
            <div
              v-for="item in displayedNotifications"
              :key="item.id"
              class="p-3.5 px-4 hover:bg-ink-50/80 transition-all cursor-pointer flex gap-3 relative group"
              :class="{ 'bg-brand-50/30': !item.isRead }"
              @click="handleItemClick(item)"
            >
              <!-- Role Icon Avatar -->
              <div class="shrink-0 mt-0.5">
                <div
                  v-if="getNotificationCategory(item).category === 'TECHNICIAN'"
                  class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 shadow-2xs"
                  title="Thông báo từ Kỹ thuật viên"
                >
                  <Wrench :size="15" />
                </div>
                <div
                  v-else-if="getNotificationCategory(item).category === 'SERVICE_MANAGER'"
                  class="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center border border-purple-200 shadow-2xs"
                  title="Thông báo từ Quản lý dịch vụ (SM)"
                >
                  <Shield :size="15" />
                </div>
                <div
                  v-else
                  class="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 shadow-2xs"
                  title="Thông báo từ Quản trị viên FixHome"
                >
                  <Sparkles :size="15" />
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
                    <h4
                      class="text-xs font-bold text-ink-900 truncate"
                      :class="{ 'text-brand-900 font-extrabold': !item.isRead }"
                    >
                      {{ item.title }}
                    </h4>
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

                <div class="flex items-center justify-between text-[11px] text-ink-400 pt-0.5">
                  <span class="flex items-center gap-1">
                    <Clock :size="12" />
                    {{ formatTimeAgo(item.createdAt) }}
                  </span>

                  <span
                    v-if="item.referenceId"
                    class="text-brand-600 font-medium group-hover:underline inline-flex items-center gap-0.5 text-[10px]"
                  >
                    Xem đơn
                    <ExternalLink :size="10" />
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="p-2.5 px-4 bg-ink-50/80 border-t border-ink-100 flex items-center justify-between text-xs">
          <button
            type="button"
            class="text-ink-600 hover:text-brand-600 font-medium transition-colors w-full text-center py-1 hover:underline"
            @click="handleViewAll"
          >
            Xem tất cả thông báo &rarr;
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
