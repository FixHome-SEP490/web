<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bell,
  CheckCheck,
  Wrench,
  Shield,
  Sparkles,
  Clock,
  Search,
  Inbox,
  ArrowRight,
} from 'lucide-vue-next';
import { FhButton, FhCard } from '../../components';
import { useNotificationsStore } from '../../stores/notifications.store';
import { getNotificationCategory, type NotificationItem } from '../../api/notifications.api';
import { toast } from 'vue-sonner';

const router = useRouter();
const notifStore = useNotificationsStore();

const searchQuery = ref('');
const selectedCategory = ref<'ALL' | 'TECHNICIAN' | 'SERVICE_MANAGER' | 'ADMIN'>('ALL');
const onlyUnread = ref(false);

onMounted(async () => {
  await notifStore.fetchNotifications(1, 50);
});

const filteredNotifications = computed(() => {
  return notifStore.notifications.filter((item) => {
    // Only unread filter
    if (onlyUnread.value && item.isRead) return false;

    // Category filter
    if (selectedCategory.value !== 'ALL') {
      const cat = getNotificationCategory(item).category;
      if (cat !== selectedCategory.value) return false;
    }

    // Search query filter
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchMsg = item.message?.toLowerCase().includes(q);
      if (!matchTitle && !matchMsg) return false;
    }

    return true;
  });
});

const handleItemClick = async (item: NotificationItem) => {
  if (!item.isRead) {
    await notifStore.markAsRead(item.id);
  }
  if (item.referenceId) {
    const refType = (item.referenceType || '').toUpperCase();
    if (refType.includes('BOOKING')) {
      router.push(`/app/bookings/${item.referenceId}`);
      return;
    }
    router.push(`/app/orders/${item.referenceId}`);
  }
};

const handleMarkAllRead = async () => {
  await notifStore.markAllAsRead();
  toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
};

const formatFullDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
</script>

<template>
  <div class="space-y-6 max-w-4xl mx-auto">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shadow-xs">
            <Bell :size="22" />
          </div>
          <div>
            <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
              Trung tâm thông báo
            </h1>
            <p class="text-xs text-ink-500">
              Cập nhật trực tiếp từ Kỹ thuật viên, Quản lý dịch vụ (SM) và Ban Quản Trị FixHome
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 self-end sm:self-center">
        <FhButton
          v-if="notifStore.unreadCount > 0"
          variant="secondary"
          size="sm"
          @click="handleMarkAllRead"
        >
          <CheckCheck :size="16" class="mr-1.5 text-brand-600" />
          Đánh dấu tất cả đã đọc ({{ notifStore.unreadCount }})
        </FhButton>
      </div>
    </div>

    <!-- Filters & Search Bar Card -->
    <FhCard class="shadow-xs">
      <div class="space-y-4">
        <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <!-- Search Input -->
          <div class="relative flex-1">
            <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm kiếm thông báo theo nội dung hoặc mã đơn..."
              class="w-full pl-10 pr-4 py-2 text-xs bg-ink-50 border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600 focus:bg-white transition-colors"
            />
          </div>

          <!-- Unread only toggle -->
          <label class="flex items-center gap-2 text-xs font-semibold text-ink-700 cursor-pointer select-none self-start md:self-center">
            <input
              v-model="onlyUnread"
              type="checkbox"
              class="rounded border-ink-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
            />
            <span>Chỉ hiện thông báo chưa đọc ({{ notifStore.unreadCount }})</span>
          </label>
        </div>

        <!-- Sender Category Tabs -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5"
            :class="selectedCategory === 'ALL' ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'"
            @click="selectedCategory = 'ALL'"
          >
            <span>Tất cả</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full" :class="selectedCategory === 'ALL' ? 'bg-white/20' : 'bg-ink-200'">
              {{ notifStore.notifications.length }}
            </span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5"
            :class="selectedCategory === 'TECHNICIAN' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'"
            @click="selectedCategory = 'TECHNICIAN'"
          >
            <Wrench :size="14" />
            <span>Kỹ thuật viên (Thợ)</span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5"
            :class="selectedCategory === 'SERVICE_MANAGER' ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'"
            @click="selectedCategory = 'SERVICE_MANAGER'"
          >
            <Shield :size="14" />
            <span>Quản lý dịch vụ (SM)</span>
          </button>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5"
            :class="selectedCategory === 'ADMIN' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'"
            @click="selectedCategory = 'ADMIN'"
          >
            <Sparkles :size="14" />
            <span>Quản trị viên (Admin)</span>
          </button>
        </div>
      </div>
    </FhCard>

    <!-- Notifications List -->
    <div v-if="filteredNotifications.length === 0" class="py-12 bg-white rounded-2xl border border-ink-200 p-8 text-center">
      <div class="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center text-ink-400 mx-auto mb-3">
        <Inbox :size="24" />
      </div>
      <h3 class="text-sm font-bold text-ink-900 mb-1">Không tìm thấy thông báo nào</h3>
      <p class="text-xs text-ink-500 max-w-sm mx-auto mb-4">
        {{ onlyUnread ? 'Không có thông báo chưa đọc nào phù hợp với bộ lọc.' : 'Hiện tại bạn chưa có thông báo nào từ hệ thống hoặc kỹ thuật viên.' }}
      </p>
      <FhButton
        v-if="onlyUnread || selectedCategory !== 'ALL' || searchQuery"
        variant="secondary"
        size="sm"
        @click="onlyUnread = false; selectedCategory = 'ALL'; searchQuery = '';"
      >
        Xoá bộ lọc tìm kiếm
      </FhButton>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in filteredNotifications"
        :key="item.id"
        class="p-4 sm:p-5 rounded-2xl bg-white border border-ink-200 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
        :class="{ 'border-l-4 border-l-brand-600 bg-brand-50/20': !item.isRead }"
        @click="handleItemClick(item)"
      >
        <div class="flex items-start gap-3.5 flex-1 min-w-0">
          <!-- Category Avatar -->
          <div class="shrink-0 mt-0.5">
            <div
              v-if="getNotificationCategory(item).category === 'TECHNICIAN'"
              class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 shadow-xs"
            >
              <Wrench :size="18" />
            </div>
            <div
              v-else-if="getNotificationCategory(item).category === 'SERVICE_MANAGER'"
              class="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center border border-purple-200 shadow-xs"
            >
              <Shield :size="18" />
            </div>
            <div
              v-else
              class="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 shadow-xs"
            >
              <Sparkles :size="18" />
            </div>
          </div>

          <!-- Body -->
          <div class="space-y-1.5 flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs"
                :class="getNotificationCategory(item).badgeClass"
              >
                {{ getNotificationCategory(item).label }}
              </span>
              <h3 class="text-sm font-bold text-ink-900 group-hover:text-brand-600 transition-colors">
                {{ item.title }}
              </h3>
              <span
                v-if="!item.isRead"
                class="px-1.5 py-0.2 rounded-full bg-brand-600 text-white text-[9px] font-bold leading-none"
              >
                MỚI
              </span>
            </div>

            <p class="text-xs text-ink-700 leading-relaxed">
              {{ item.message }}
            </p>

            <div class="flex items-center gap-4 text-[11px] text-ink-400 pt-1">
              <span class="flex items-center gap-1 font-mono">
                <Clock :size="12" />
                {{ formatFullDate(item.createdAt) }}
              </span>
              <span v-if="item.referenceId" class="text-brand-600 font-medium">
                Mã tham chiếu: {{ item.referenceId.slice(0, 8) }}...
              </span>
            </div>
          </div>
        </div>

        <!-- Action / Arrow -->
        <div class="shrink-0 self-end sm:self-center flex items-center gap-2">
          <span
            v-if="item.referenceId"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-ink-50 group-hover:bg-brand-50 text-ink-700 group-hover:text-brand-700 text-xs font-semibold border border-ink-200 group-hover:border-brand-300 transition-all shadow-2xs"
          >
            <span>Xem chi tiết</span>
            <ArrowRight :size="14" class="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
