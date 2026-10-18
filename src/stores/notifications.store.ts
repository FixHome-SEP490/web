// src/stores/notifications.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { notificationsApi, type NotificationItem } from '../api/notifications.api';
import { useAuthStore } from './auth';
import { chatSocketService, type NotificationNewEvent } from '../services/chat-socket.service';
import { whileOffline } from '../services/live-updates';

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<NotificationItem[]>([]);
  const total = ref(0);
  const unreadCount = ref(0);
  const loading = ref(false);
  const authStore = useAuthStore();

  let stopFollowing: (() => void) | null = null;

  const unreadNotifications = computed(() => {
    return notifications.value.filter((n) => !n.isRead);
  });

  const hasUnread = computed(() => unreadCount.value > 0);

  const fetchUnreadCount = async () => {
    if (!authStore.isAuthenticated) return;
    try {
      const count = await notificationsApi.getUnreadCount();
      unreadCount.value = count;
    } catch {
      // Non-blocking
    }
  };

  const fetchNotifications = async (page = 1, limit = 20) => {
    if (!authStore.isAuthenticated) return;
    try {
      loading.value = true;
      const res = await notificationsApi.getMyNotifications(page, limit);
      notifications.value = res.data;
      total.value = res.total;
      await fetchUnreadCount();
      if (unreadNotifications.value.length > unreadCount.value) {
        unreadCount.value = unreadNotifications.value.length;
      }
    } catch {
      // Non-blocking
    } finally {
      loading.value = false;
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const updated = await notificationsApi.markAsRead(id);
      const target = notifications.value.find((n) => n.id === id);
      if (target && !target.isRead) {
        target.isRead = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
      return updated;
    } catch {
      // Non-blocking fallback
      const target = notifications.value.find((n) => n.id === id);
      if (target) target.isRead = true;
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      notifications.value.forEach((n) => {
        n.isRead = true;
      });
      unreadCount.value = 0;
    } catch {
      // Non-blocking
    }
  };

  /** A notification pushed by the server (PO 18/10/2026): shown at once, counted once. */
  const receive = (event: NotificationNewEvent) => {
    if (notifications.value.some((n) => n.id === event.id)) return;
    notifications.value = [{ ...event, userId: authStore.user?.id ?? '' }, ...notifications.value];
    total.value += 1;
    if (!event.isRead) unreadCount.value += 1;
  };

  /**
   * Follows new notifications live; the count is polled (every `intervalMs`,
   * while the tab is visible) only while the socket is down, and read once when
   * it is back. Kept under its old name for the callers.
   */
  const startPolling = (intervalMs = 30000) => {
    stopPolling();
    void fetchUnreadCount();
    const stopOffline = whileOffline(() => {
      if (authStore.isAuthenticated && document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    }, intervalMs);
    const unsubscribe = chatSocketService.subscribe({ onNotificationNew: receive });
    stopFollowing = () => {
      stopOffline();
      unsubscribe();
    };
  };

  const stopPolling = () => {
    stopFollowing?.();
    stopFollowing = null;
  };

  return {
    receive,
    notifications,
    total,
    unreadCount,
    loading,
    unreadNotifications,
    hasUnread,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    startPolling,
    stopPolling,
  };
});
