<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bell,
  CheckCheck,
  Clock,
  CheckCircle2,
  Wrench,
  AlertCircle,
  ShieldCheck,
  CreditCard,
  ChevronRight,
} from 'lucide-vue-next';
import { FhButton, FhCard, FhSkeleton } from '../../components';
import { notificationsApi, type NotificationItem } from '../../api/notifications.api';

const router = useRouter();

const loading = ref(true);
const notifications = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const loadNotifications = async () => {
  try {
    loading.value = true;
    actionMessage.value = null;
    const [res, count] = await Promise.all([
      notificationsApi.getNotifications(1, 50),
      notificationsApi.getUnreadCount(),
    ]);
    notifications.value = res.data || [];
    unreadCount.value = count;
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải danh sách thông báo.',
    };
  } finally {
    loading.value = false;
  }
};

const handleMarkAsRead = async (item: NotificationItem) => {
  if (item.isRead) return;
  try {
    await notificationsApi.markAsRead(item.id);
    item.isRead = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch {
    // silently ignore single mark error
  }
};

const handleMarkAllRead = async () => {
  try {
    await notificationsApi.markAllAsRead();
    notifications.value.forEach((n) => (n.isRead = true));
    unreadCount.value = 0;
    actionMessage.value = {
      type: 'success',
      text: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    };
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể đánh dấu đã đọc.',
    };
  }
};

const handleNavigate = (item: NotificationItem) => {
  handleMarkAsRead(item);
  if (item.referenceType === 'SERVICE_ORDER' && item.referenceId) {
    router.push(`/app/orders/${item.referenceId}`);
  } else if (item.referenceType === 'BOOKING' && item.referenceId) {
    router.push(`/app/bookings/${item.referenceId}/candidates`);
  } else if (item.referenceType === 'WARRANTY') {
    router.push('/app/warranties');
  } else {
    router.push('/app/orders');
  }
};

onMounted(() => {
  loadNotifications();
});
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6 pb-16">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Bell class="text-brand-600" :size="24" />
          Thông báo hệ thống
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Cập nhật tiến trình sửa chữa, xác nhận báo giá và thông tin bảo hành thiết bị.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton
          v-if="unreadCount > 0"
          variant="secondary"
          size="sm"
          @click="handleMarkAllRead"
        >
          <CheckCheck :size="14" class="mr-1 text-brand-600" />
          Đọc tất cả ({{ unreadCount }})
        </FhButton>
      </div>
    </div>

    <!-- Alert / Action Banner -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-[var(--radius-sm)] text-xs font-medium flex items-center justify-between transition-all"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <div class="flex items-center gap-2">
        <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
        <AlertCircle v-else :size="16" class="text-danger-600 shrink-0" />
        <span>{{ actionMessage.text }}</span>
      </div>
      <button class="text-ink-400 hover:text-ink-700 ml-2" @click="actionMessage = null">
        &times;
      </button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="space-y-3">
      <FhCard v-for="i in 4" :key="i" class="p-4">
        <div class="flex gap-3 items-center">
          <FhSkeleton width="36px" height="36px" circle />
          <div class="space-y-2 flex-1">
            <FhSkeleton width="60%" height="14px" />
            <FhSkeleton width="90%" height="12px" />
          </div>
        </div>
      </FhCard>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="notifications.length === 0"
      class="text-center py-16 bg-white rounded-[var(--radius-md)] border border-ink-200 space-y-2"
    >
      <Bell :size="40" class="mx-auto text-ink-300" />
      <h3 class="text-sm font-bold text-ink-800">Không có thông báo mới</h3>
      <p class="text-xs text-ink-500">
        Mọi thông báo cập nhật về cuốc đặt thợ và dịch vụ sẽ hiển thị tại đây.
      </p>
    </div>

    <!-- Notifications List -->
    <div v-else class="space-y-2.5">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="p-4 rounded-[var(--radius-md)] border transition-all cursor-pointer flex items-start gap-3.5 group"
        :class="item.isRead ? 'bg-white border-ink-200 hover:border-ink-300' : 'bg-brand-50/40 border-brand-200 hover:border-brand-300 shadow-xs'"
        @click="handleNavigate(item)"
      >
        <!-- Icon -->
        <div
          class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white mt-0.5"
          :class="item.isRead ? 'bg-ink-300 text-ink-700' : 'bg-brand-600 text-white'"
        >
          <Wrench v-if="item.type.includes('ORDER')" :size="16" />
          <ShieldCheck v-else-if="item.type.includes('WARRANTY')" :size="16" />
          <CreditCard v-else-if="item.type.includes('PAYMENT')" :size="16" />
          <Bell v-else :size="16" />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <h4
              class="text-xs font-bold truncate"
              :class="item.isRead ? 'text-ink-800' : 'text-brand-900'"
            >
              {{ item.title }}
            </h4>
            <span class="text-[11px] text-ink-400 shrink-0 flex items-center gap-1 font-mono">
              <Clock :size="12" />
              {{ new Date(item.createdAt).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </div>

          <p class="text-xs text-ink-600 leading-relaxed">
            {{ item.message }}
          </p>
        </div>

        <!-- Action Arrow -->
        <div class="shrink-0 self-center text-ink-300 group-hover:text-brand-600 transition-colors">
          <ChevronRight :size="16" />
        </div>
      </div>
    </div>
  </div>
</template>
