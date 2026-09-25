// src/stores/notifications.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { notificationsApi, type NotificationItem } from '../api/notifications.api';
import { useAuthStore } from './auth';

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<NotificationItem[]>([]);
  const total = ref(0);
  const unreadCount = ref(0);
  const loading = ref(false);
  const authStore = useAuthStore();

  let pollInterval: ReturnType<typeof setInterval> | null = null;

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

  const startPolling = (intervalMs = 30000) => {
    stopPolling();
    void fetchUnreadCount();
    pollInterval = setInterval(() => {
      if (authStore.isAuthenticated && document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    }, intervalMs);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  return {
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
