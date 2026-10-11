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
  ChevronRight,
  DollarSign,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  AlertTriangle,
} from 'lucide-vue-next';
import { FhButton, FhPagination, FhSkeleton } from '../../components';
import { useNotificationsStore } from '../../stores/notifications.store';
import { customerNotificationPath, getNotificationCategory, notificationsApi, type NotificationItem } from '../../api/notifications.api';
import { usePagedList } from '../../composables/usePagedList';
import { toast } from 'vue-sonner';
import { vnDateTimeString } from '../../utils/vn-time';

type Category = 'ALL' | 'TECHNICIAN' | 'SERVICE_MANAGER' | 'ADMIN';

const router = useRouter();
const notifStore = useNotificationsStore();

const searchQuery = ref('');
const selectedCategory = ref<Category>('ALL');
const onlyUnread = ref(false);
const PAGE_SIZE = 20;
// Server pages of 20 (?page=2 in the address); the filters below apply to the page shown.
const {
  page,
  items: notifications,
  total,
  loading,
  error,
  load,
} = usePagedList<NotificationItem>({
  pageSize: PAGE_SIZE,
  fetch: async (p, size) => {
    const result = await notificationsApi.getMyNotifications(p, size);
    return { items: result.data, total: result.total, page: p, pageSize: size };
  },
});

const categories: { key: Category; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'TECHNICIAN', label: 'Kỹ thuật viên' },
  { key: 'SERVICE_MANAGER', label: 'Quản lý dịch vụ' },
  { key: 'ADMIN', label: 'FixHome' },
];

const iconFor = {
  dollar: DollarSign,
  check: CheckCircle2,
  x: XCircle,
  truck: Truck,
  package: Package,
  clock: Clock,
  sparkles: Sparkles,
  shield: Shield,
  wrench: Wrench,
  alert: AlertTriangle,
  bell: Bell,
} as const;

onMounted(() => {
  void notifStore.fetchUnreadCount();
});

const hasFilter = computed(() => onlyUnread.value || selectedCategory.value !== 'ALL' || searchQuery.value.trim() !== '');

const filteredNotifications = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  return notifications.value.filter((item) => {
    if (onlyUnread.value && item.isRead) return false;
    if (selectedCategory.value !== 'ALL' && getNotificationCategory(item).category !== selectedCategory.value) return false;
    if (q && !item.title?.toLowerCase().includes(q) && !item.message?.toLowerCase().includes(q)) return false;
    return true;
  });
});

const handleItemClick = async (item: NotificationItem) => {
  if (!item.isRead) {
    await notifStore.markAsRead(item.id);
    item.isRead = true;
    // The bell keeps its own short list; read the count again so both agree.
    void notifStore.fetchUnreadCount();
  }
  const path = customerNotificationPath(item);
  if (path) router.push(path);
};

const handleMarkAllRead = async () => {
  await notifStore.markAllAsRead();
  notifications.value.forEach((n) => {
    n.isRead = true;
  });
  toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
};

const clearFilters = () => {
  onlyUnread.value = false;
  selectedCategory.value = 'ALL';
  searchQuery.value = '';
};

const formatFullDate = (dateStr: string): string => (dateStr ? vnDateTimeString(new Date(dateStr)) : '');
</script>

<template>
  <div class="space-y-5 max-w-3xl mx-auto">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Thông báo</h1>
      <FhButton
        v-if="notifStore.unreadCount > 0"
        variant="secondary"
        size="sm"
        data-testid="notifications-mark-all"
        @click="handleMarkAllRead"
      >
        <CheckCheck :size="16" />
        Đánh dấu đã đọc tất cả
      </FhButton>
    </div>

    <div class="space-y-3">
      <div class="relative">
        <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          v-model="searchQuery"
          type="search"
          aria-label="Tìm thông báo"
          placeholder="Tìm theo nội dung thông báo"
          class="w-full h-11 pl-10 pr-4 text-sm bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600 transition-colors"
        />
      </div>

      <div class="flex items-center gap-2 overflow-x-auto pb-1 text-sm">
        <button
          v-for="cat in categories"
          :key="cat.key"
          type="button"
          :data-testid="`notifications-filter-${cat.key}`"
          class="h-9 px-3.5 rounded-full font-medium transition-colors shrink-0 whitespace-nowrap border"
          :class="selectedCategory === cat.key ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'"
          @click="selectedCategory = cat.key"
        >
          {{ cat.label }}
        </button>
        <label class="ml-auto pl-2 flex items-center gap-2 text-sm text-ink-600 cursor-pointer select-none shrink-0 whitespace-nowrap">
          <input
            v-model="onlyUnread"
            type="checkbox"
            class="rounded border-ink-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
          />
          Chưa đọc ({{ notifStore.unreadCount }})
        </label>
      </div>
    </div>

    <ul
      v-if="loading"
      class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100"
      aria-busy="true"
      aria-label="Đang tải thông báo"
    >
      <li v-for="i in 4" :key="i" class="px-5 py-4 flex items-start gap-3.5">
        <span class="w-10 shrink-0"><FhSkeleton height="40px" rounded="md" /></span>
        <span class="flex-1 space-y-2">
          <FhSkeleton width="50%" height="16px" />
          <FhSkeleton width="85%" height="14px" />
        </span>
      </li>
    </ul>

    <div
      v-else-if="error"
      role="alert"
      class="p-6 bg-white rounded-2xl border border-ink-200 flex flex-col items-center text-center gap-3"
      data-testid="notifications-load-error"
    >
      <p class="text-sm text-ink-700">Chưa tải được thông báo, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
    </div>

    <div
      v-else-if="filteredNotifications.length === 0"
      data-testid="notifications-empty"
      class="py-14 px-6 bg-white rounded-2xl border border-ink-200 text-center space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center text-ink-400 mx-auto">
        <Inbox :size="24" />
      </div>
      <p class="text-base font-semibold text-ink-900">
        {{ hasFilter ? (total > PAGE_SIZE ? 'Trang này không có thông báo phù hợp.' : 'Không có thông báo nào phù hợp.') : 'Bạn chưa có thông báo nào.' }}
      </p>
      <FhButton v-if="hasFilter" variant="secondary" size="sm" @click="clearFilters">Xóa bộ lọc</FhButton>
    </div>

    <ul v-else class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100 overflow-hidden">
      <li v-for="item in filteredNotifications" :key="item.id">
        <button
          type="button"
          class="w-full px-4 sm:px-5 py-4 flex items-start gap-3.5 text-left hover:bg-ink-25 transition-colors"
          :class="{ 'bg-brand-50/40': !item.isRead }"
          :data-testid="`notification-${item.id}`"
          @click="handleItemClick(item)"
        >
          <span
            class="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
            :class="[getNotificationCategory(item).iconBgClass, getNotificationCategory(item).iconColorClass]"
          >
            <component :is="iconFor[getNotificationCategory(item).iconName] ?? Bell" :size="18" />
          </span>

          <span class="flex-1 min-w-0 space-y-1">
            <span class="flex items-start justify-between gap-3">
              <span class="text-sm text-ink-900" :class="item.isRead ? 'font-medium' : 'font-semibold'">{{ item.title }}</span>
              <span v-if="!item.isRead" class="w-2 h-2 mt-1.5 rounded-full bg-brand-600 shrink-0" aria-label="Chưa đọc"></span>
            </span>
            <span class="block text-sm text-ink-600 leading-relaxed text-pretty">{{ item.message }}</span>
            <span class="flex items-center gap-2 text-xs text-ink-500 pt-0.5">
              <span class="whitespace-nowrap">{{ getNotificationCategory(item).label }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-num whitespace-nowrap">{{ formatFullDate(item.createdAt) }}</span>
            </span>
          </span>

          <ChevronRight v-if="item.referenceId" :size="18" class="text-ink-400 shrink-0 self-center" />
        </button>
      </li>
    </ul>

    <FhPagination
      v-if="!loading && !error"
      v-model:page="page"
      :page-size="PAGE_SIZE"
      :total="total"
    />
  </div>
</template>