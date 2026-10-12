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
  X,
  UserCheck,
  Building2,
} from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import { useNotificationsStore } from '../../stores/notifications.store';
import { customerNotificationPath, getNotificationCategory, type NotificationItem } from '../../api/notifications.api';
import { toast } from 'vue-sonner';
import { vnDateTimeString } from '../../utils/vn-time';

type Category = 'ALL' | 'TECHNICIAN' | 'SERVICE_MANAGER' | 'ADMIN';

const router = useRouter();
const notifStore = useNotificationsStore();

const searchQuery = ref('');
const selectedCategory = ref<Category>('ALL');
const onlyUnread = ref(false);
/** Until the first read finishes the page shows rows shaped like notifications, not "no notifications". */
const firstLoad = ref(true);

const categories: { key: Category; label: string; icon: unknown }[] = [
  { key: 'ALL', label: 'Tất cả', icon: Bell },
  { key: 'TECHNICIAN', label: 'Kỹ thuật viên', icon: UserCheck },
  { key: 'SERVICE_MANAGER', label: 'Quản lý dịch vụ', icon: Building2 },
  { key: 'ADMIN', label: 'FixHome', icon: Sparkles },
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

onMounted(async () => {
  try {
    await notifStore.fetchNotifications(1, 50);
  } finally {
    firstLoad.value = false;
  }
});

const hasFilter = computed(() => onlyUnread.value || selectedCategory.value !== 'ALL' || searchQuery.value.trim() !== '');

const filteredNotifications = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  return notifStore.notifications.filter((item) => {
    if (onlyUnread.value && item.isRead) return false;
    if (selectedCategory.value !== 'ALL' && getNotificationCategory(item).category !== selectedCategory.value) return false;
    if (q && !item.title?.toLowerCase().includes(q) && !item.message?.toLowerCase().includes(q)) return false;
    return true;
  });
});

const handleItemClick = async (item: NotificationItem) => {
  if (!item.isRead) {
    await notifStore.markAsRead(item.id);
  }
  const path = customerNotificationPath(item);
  if (path) router.push(path);
};

const handleMarkAllRead = async () => {
  await notifStore.markAllAsRead();
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
  <div class="space-y-6 max-w-4xl mx-auto pb-16">
    <!-- Header banner -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight flex items-center gap-2.5">
          <Bell :size="28" class="text-brand-600 shrink-0" />
          <span>Thông báo</span>
        </h1>
        <p class="text-sm text-ink-500 mt-1">
          Cập nhật tiến độ đơn hàng, phản hồi từ kỹ thuật viên và thông báo từ hệ thống.
        </p>
      </div>

      <FhButton
        v-if="notifStore.unreadCount > 0"
        variant="secondary"
        size="sm"
        data-testid="notifications-mark-all"
        class="self-start sm:self-auto shrink-0"
        @click="handleMarkAllRead"
      >
        <CheckCheck :size="16" class="text-brand-600" />
        Đánh dấu đã đọc tất cả
      </FhButton>
    </div>

    <!-- Search & Filters Surface -->
    <div class="bg-white rounded-3xl border border-ink-200/90 p-4 sm:p-5 space-y-4 shadow-xs">
      <!-- Search input -->
      <div class="relative">
        <Search :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          v-model="searchQuery"
          type="search"
          aria-label="Tìm thông báo"
          placeholder="Tìm theo nội dung thông báo..."
          class="w-full h-11.5 pl-10.5 pr-10 text-sm bg-ink-50/70 border border-ink-200/90 rounded-2xl focus:outline-none focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-500/15 transition-all text-ink-900 placeholder:text-ink-400"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
          title="Xóa tìm kiếm"
          @click="searchQuery = ''"
        >
          <X :size="16" />
        </button>
      </div>

      <!-- Categories & Unread filter row -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <!-- Category pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs sm:text-sm">
          <button
            v-for="cat in categories"
            :key="cat.key"
            type="button"
            :data-testid="`notifications-filter-${cat.key}`"
            class="h-9 px-3.5 rounded-xl font-medium transition-all shrink-0 whitespace-nowrap flex items-center gap-1.5 cursor-pointer select-none"
            :class="selectedCategory === cat.key
              ? 'bg-brand-600 text-white shadow-2xs font-semibold'
              : 'bg-ink-100/70 text-ink-600 hover:bg-ink-100 hover:text-ink-900'"
            @click="selectedCategory = cat.key"
          >
            <component :is="cat.icon" :size="15" />
            <span>{{ cat.label }}</span>
          </button>
        </div>

        <!-- Only unread toggle -->
        <label
          class="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-ink-700 cursor-pointer select-none shrink-0 self-start sm:self-auto px-3 py-1.5 rounded-xl border transition-colors"
          :class="onlyUnread ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold' : 'bg-white border-ink-200/90 hover:bg-ink-50'"
        >
          <input
            v-model="onlyUnread"
            type="checkbox"
            class="rounded border-ink-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
          />
          <span>Chưa đọc ({{ notifStore.unreadCount }})</span>
        </label>
      </div>
    </div>

    <!-- Skeleton Loading -->
    <div
      v-if="firstLoad && notifStore.notifications.length === 0"
      class="bg-white rounded-3xl border border-ink-200/90 divide-y divide-ink-100 overflow-hidden shadow-xs"
      aria-busy="true"
      aria-label="Đang tải thông báo"
    >
      <div v-for="i in 4" :key="i" class="p-5 flex items-start gap-4">
        <FhSkeleton width="44px" height="44px" rounded="lg" class="shrink-0" />
        <div class="flex-1 space-y-2">
          <div class="flex justify-between items-center">
            <FhSkeleton width="45%" height="18px" />
            <FhSkeleton width="70px" height="14px" />
          </div>
          <FhSkeleton width="85%" height="14px" />
          <FhSkeleton width="30%" height="12px" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredNotifications.length === 0"
      data-testid="notifications-empty"
      class="py-16 px-6 bg-white rounded-3xl border border-ink-200/90 text-center space-y-3 shadow-xs"
    >
      <div class="w-16 h-16 rounded-2xl bg-ink-100/80 flex items-center justify-center text-ink-400 mx-auto mb-2">
        <Inbox :size="32" />
      </div>
      <p class="text-lg font-semibold text-ink-900">
        {{ hasFilter ? 'Không có thông báo nào phù hợp.' : 'Bạn chưa có thông báo nào.' }}
      </p>
      <p class="text-sm text-ink-500 max-w-sm mx-auto">
        {{ hasFilter ? 'Hãy thử thay đổi từ khóa hoặc bộ lọc danh mục để tìm thông báo.' : 'Các thông báo mới về đơn sửa chữa và tài khoản sẽ hiển thị ở đây.' }}
      </p>
      <div v-if="hasFilter" class="pt-2">
        <FhButton variant="secondary" size="sm" @click="clearFilters">Xóa bộ lọc</FhButton>
      </div>
    </div>

    <!-- Notifications List -->
    <ul v-else class="bg-white rounded-3xl border border-ink-200/90 divide-y divide-ink-100 overflow-hidden shadow-xs">
      <li v-for="item in filteredNotifications" :key="item.id">
        <button
          type="button"
          class="w-full p-4 sm:p-5 flex items-start gap-4 text-left hover:bg-brand-50/20 transition-all cursor-pointer group"
          :class="{ 'bg-brand-50/40': !item.isRead }"
          :data-testid="`notification-${item.id}`"
          @click="handleItemClick(item)"
        >
          <!-- Category Icon -->
          <span
            class="w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            :class="[getNotificationCategory(item).iconBgClass, getNotificationCategory(item).iconColorClass]"
          >
            <component :is="iconFor[getNotificationCategory(item).iconName] ?? Bell" :size="20" />
          </span>

          <!-- Main Content -->
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex items-start justify-between gap-3">
              <span
                class="text-sm text-ink-900 group-hover:text-brand-600 transition-colors"
                :class="item.isRead ? 'font-medium' : 'font-bold text-brand-900'"
              >
                {{ item.title }}
              </span>
              <span
                v-if="!item.isRead"
                class="w-2.5 h-2.5 mt-1 rounded-full bg-brand-600 shrink-0 shadow-2xs"
                aria-label="Chưa đọc"
              />
            </div>

            <p class="text-sm text-ink-600 leading-relaxed text-pretty">
              {{ item.message }}
            </p>

            <div class="flex items-center gap-2 text-xs text-ink-400 pt-1">
              <span class="font-medium text-ink-600 px-2 py-0.5 rounded-md bg-ink-100/70">
                {{ getNotificationCategory(item).label }}
              </span>
              <span aria-hidden="true">·</span>
              <span class="font-num whitespace-nowrap flex items-center gap-1">
                <Clock :size="12" class="text-ink-400" />
                {{ formatFullDate(item.createdAt) }}
              </span>
            </div>
          </div>

          <!-- Navigation Arrow -->
          <ChevronRight
            v-if="item.referenceId"
            :size="18"
            class="text-ink-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0 self-center hidden sm:block"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
