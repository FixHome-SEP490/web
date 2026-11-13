<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  CheckCheck,
  Search,
  ChevronRight,
  X,
} from 'lucide-vue-next';
import { FhButton, FhEmptyState, FhPagination, FhSkeleton, ConsoleTabs } from '../../components';
import NotificationSemanticIcon from '../../components/notifications/NotificationSemanticIcon.vue';
import { useNotificationsStore } from '../../stores/notifications.store';
import { resolveCustomerNotificationPath, getNotificationCategory, notificationsApi, type NotificationItem } from '../../api/notifications.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { toast } from 'vue-sonner';
import { vnDateTimeString, vnDayGroup, vnRelativeTime, type VnDayGroup } from '../../utils/vn-time';

type Category = 'ALL' | 'TECHNICIAN' | 'SERVICE_MANAGER' | 'ADMIN';

const router = useRouter();
const notifStore = useNotificationsStore();
const cache = useCacheUpdates();

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
  changingPage,
  prefetch,
} = usePagedList<NotificationItem>({
  key: () => queryKeys.notifications.list({}),
  pageSize: PAGE_SIZE,
  fetch: async (p, size) => {
    const result = await notificationsApi.getMyNotifications(p, size);
    return { items: result.data, total: result.total, page: p, pageSize: size };
  },
});

const categories: { key: Category; label: string; testId: string }[] = [
  { key: 'ALL', label: 'Tất cả', testId: 'notifications-filter-ALL' },
  { key: 'TECHNICIAN', label: 'Kỹ thuật viên', testId: 'notifications-filter-TECHNICIAN' },
  { key: 'SERVICE_MANAGER', label: 'Quản lý dịch vụ', testId: 'notifications-filter-SERVICE_MANAGER' },
  { key: 'ADMIN', label: 'FixHome', testId: 'notifications-filter-ADMIN' },
];

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

const DAY_GROUP_ORDER: VnDayGroup[] = ['Hôm nay', 'Hôm qua', 'Trước đó'];

const groupedNotifications = computed(() => {
  const buckets = new Map<VnDayGroup, NotificationItem[]>();
  for (const item of filteredNotifications.value) {
    const label = vnDayGroup(item.createdAt);
    const list = buckets.get(label);
    if (list) list.push(item);
    else buckets.set(label, [item]);
  }
  return DAY_GROUP_ORDER
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, items: buckets.get(label)! }));
});

const handleItemClick = async (item: NotificationItem) => {
  if (!item.isRead) {
    await notifStore.markAsRead(item.id);
    item.isRead = true;
    cache.markChanged(affectedBy.notificationsRead);
    // The bell keeps its own short list; read the count again so both agree.
    void notifStore.fetchUnreadCount();
  }
  const path = await resolveCustomerNotificationPath(item);
  if (path) router.push(path);
  else if ((item.type || '').toUpperCase() === 'PART_REQUEST_READY') {
    toast.error('Không mở được thiết bị liên quan. Vui lòng tải lại thông báo và thử lại.');
  }
};

const handleMarkAllRead = async () => {
  await notifStore.markAllAsRead();
  notifications.value.forEach((n) => {
    n.isRead = true;
  });
  cache.markChanged(affectedBy.notificationsRead);
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
  <div class="w-full space-y-5 pb-16">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 animate-slide-up">
      <div>
        <h1 class="text-2xl sm:text-[28px] font-bold text-ink-900 tracking-tight">
          Thông báo
        </h1>
        <p class="text-sm text-ink-500 mt-1">
          Cập nhật tiến độ đơn hàng, phản hồi từ kỹ thuật viên và thông báo từ hệ thống.
        </p>
      </div>

      <FhButton
        v-if="notifStore.unreadCount > 0"
        variant="secondary"
        size="md"
        data-testid="notifications-mark-all"
        class="self-start sm:self-auto shrink-0"
        @click="handleMarkAllRead"
      >
        <CheckCheck :size="16" class="text-brand-600" />
        Đánh dấu đã đọc tất cả
      </FhButton>
    </div>

    <!-- Search & Filters -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 animate-slide-up-delay-1">
      <ConsoleTabs
        v-model="selectedCategory"
        variant="pill"
        class="self-start lg:self-auto"
        :tabs="categories"
        aria-label="Lọc theo nguồn thông báo"
      />

      <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
        <div class="relative flex-1 sm:w-64 lg:w-72">
          <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="search"
            aria-label="Tìm thông báo"
            placeholder="Tìm theo nội dung thông báo..."
            class="w-full h-10 pl-9.5 pr-9 text-sm bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors text-ink-900 placeholder:text-ink-400"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-0 top-1/2 flex h-10 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-ink-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Xóa tìm kiếm"
            @click="searchQuery = ''"
          >
            <X :size="15" />
          </button>
        </div>

        <label
          class="inline-flex h-10 items-center gap-2 text-xs sm:text-sm font-medium cursor-pointer select-none shrink-0 self-start sm:self-auto px-3.5 rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-1"
          :class="onlyUnread ? 'bg-brand-50 border-brand-200 text-brand-700 font-semibold' : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'"
        >
          <input
            v-model="onlyUnread"
            type="checkbox"
            class="sr-only"
          />
          <span
            class="h-2 w-2 rounded-full transition-colors"
            :class="onlyUnread ? 'bg-brand-600' : 'bg-ink-300'"
            aria-hidden="true"
          />
          <span>Chưa đọc</span>
          <span
            class="px-1.5 py-0.5 rounded-full text-[11px] font-num leading-none"
            :class="onlyUnread ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600'"
          >
            {{ notifStore.unreadCount }}
          </span>
        </label>
      </div>
    </div>

    <!-- Skeleton Loading -->
    <ul
      v-if="loading"
      class="bg-white rounded-[var(--radius-md)] border border-ink-200 divide-y divide-ink-100 overflow-hidden animate-slide-up-delay-2"
      aria-busy="true"
      aria-label="Đang tải thông báo"
    >
      <li v-for="i in 4" :key="i" class="px-4 py-4 sm:px-5 flex items-start gap-3.5 sm:gap-4">
        <FhSkeleton width="44px" height="44px" rounded="lg" class="shrink-0" />
        <div class="flex-1 space-y-2 pt-0.5">
          <div class="flex justify-between items-center gap-3">
            <FhSkeleton width="45%" height="16px" />
            <FhSkeleton width="72px" height="14px" />
          </div>
          <FhSkeleton width="88%" height="14px" />
          <FhSkeleton width="28%" height="12px" />
        </div>
      </li>
    </ul>

    <!-- Error State -->
    <div
      v-else-if="error"
      role="alert"
      class="p-6 bg-white rounded-[var(--radius-md)] border border-ink-200 flex flex-col items-center text-center gap-3 animate-slide-up-delay-2"
      data-testid="notifications-load-error"
    >
      <p class="text-sm text-ink-700">Chưa tải được thông báo, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="md" @click="load">Thử lại</FhButton>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredNotifications.length === 0"
      data-testid="notifications-empty"
      class="bg-white rounded-[var(--radius-md)] border border-ink-200 animate-slide-up-delay-2"
    >
      <FhEmptyState
        :title="hasFilter ? (total > PAGE_SIZE ? 'Trang này không có thông báo phù hợp.' : 'Không có thông báo nào phù hợp.') : 'Bạn chưa có thông báo nào.'"
        :description="hasFilter ? 'Hãy thử thay đổi từ khóa hoặc bộ lọc danh mục để tìm thông báo.' : 'Các thông báo mới về đơn sửa chữa và tài khoản sẽ hiển thị ở đây.'"
        :action-text="hasFilter ? 'Xóa bộ lọc' : ''"
        illustration="/images/ui/empty-state-search-service.png"
        @action="clearFilters"
      />
    </div>

    <!-- Grouped Notifications Feed -->
    <div
      v-else
      class="space-y-4 transition-opacity animate-slide-up-delay-2"
      :class="{ 'opacity-60': changingPage }"
      :aria-busy="changingPage"
    >
      <section v-for="group in groupedNotifications" :key="group.label" class="space-y-2">
        <h2 class="px-1 text-xs font-semibold text-ink-500">
          {{ group.label }}
        </h2>

        <ul class="bg-white rounded-[var(--radius-md)] border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          <li v-for="item in group.items" :key="item.id">
            <button
              type="button"
              class="group flex min-h-11 w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:gap-4 sm:px-5 sm:py-4"
              :class="item.isRead ? 'bg-white hover:bg-ink-50/80' : 'bg-brand-50/35 hover:bg-brand-50/60'"
              :data-testid="`notification-${item.id}`"
              @click="handleItemClick(item)"
            >
              <NotificationSemanticIcon :item="item" size="md" dim-when-read class="mt-0.5" />

              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-3">
                  <span
                    class="break-words text-sm leading-snug group-hover:text-brand-700 transition-colors"
                    :class="item.isRead ? 'font-medium text-ink-700' : 'font-semibold text-ink-950'"
                  >
                    {{ item.title }}
                  </span>

                  <div class="flex items-center gap-2 shrink-0 pt-0.5">
                    <time
                      :datetime="item.createdAt"
                      :title="formatFullDate(item.createdAt)"
                      class="text-xs font-num whitespace-nowrap"
                      :class="item.isRead ? 'text-ink-400' : 'font-medium text-brand-700'"
                    >
                      {{ vnRelativeTime(item.createdAt) }}
                    </time>
                    <span
                      v-if="!item.isRead"
                      class="w-2 h-2 rounded-full bg-brand-600 shrink-0"
                      aria-label="Chưa đọc"
                    />
                  </div>
                </div>

                <p
                  class="mt-1 break-words text-[13px] sm:text-sm leading-relaxed text-pretty"
                  :class="item.isRead ? 'text-ink-500' : 'text-ink-700'"
                >
                  {{ item.message }}
                </p>

                <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span class="text-ink-400 font-medium">
                    {{ getNotificationCategory(item).label }}
                  </span>

                  <span
                    v-if="item.referenceId"
                    class="inline-flex items-center gap-0.5 font-semibold text-brand-600 group-hover:text-brand-700 transition-colors"
                  >
                    <span>{{ item.type?.toUpperCase() === 'PART_REQUEST_READY' ? 'Xem máy và linh kiện' : 'Xem chi tiết' }}</span>
                    <ChevronRight :size="14" class="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <FhPagination
      v-if="!loading && !error"
      v-model:page="page"
      :page-size="PAGE_SIZE"
      :total="total"
      class="animate-slide-up-delay-2"
      @prefetch="prefetch"
    />
  </div>
</template>
