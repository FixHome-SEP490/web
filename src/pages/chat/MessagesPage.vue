<script setup lang="ts">
// src/pages/chat/MessagesPage.vue
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '../../stores/chat.store';
import { useAuthStore } from '../../stores/auth';
import ChatThread from '../../components/chat/ChatThread.vue';
import { FhButton, FhSkeleton } from '../../components';
import {
  MessageSquare,
  Search,
  X,
  Wrench,
  User,
  Phone,
  ShieldCheck,
  Sparkles,
  CalendarPlus,
  Briefcase,
} from 'lucide-vue-next';
import { isSameVnDay, vnDateString, vnTimeString } from '../../utils/vn-time';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const authStore = useAuthStore();

const searchQuery = ref('');
type FilterType = 'all' | 'unread';
const activeFilter = ref<FilterType>('all');

const filterTabs = computed<{ key: FilterType; label: string; count: number | string }[]>(() => [
  {
    key: 'all',
    label: 'Tất cả',
    count: chatStore.conversations.length,
  },
  {
    key: 'unread',
    label: 'Chưa đọc',
    count: chatStore.totalUnreadCount > 0 ? chatStore.totalUnreadCount : '',
  },
]);

// ── Tab sliding indicator animation (matches CustomerOrdersPage) ──
const tabListRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({
  opacity: '0',
});

function updateTabIndicator() {
  const activeEl = tabRefs.value[activeFilter.value];
  const container = tabListRef.value;
  if (!activeEl || !container || activeEl.offsetWidth === 0) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = activeEl.offsetLeft;
  const top = activeEl.offsetTop;
  const width = activeEl.offsetWidth;
  const height = activeEl.offsetHeight;

  indicatorStyle.value = {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: width > 0 ? '1' : '0',
  };
}

function selectFilter(key: FilterType) {
  activeFilter.value = key;
}

// Mobile view detection & active thread visibility
const isMobile = ref(false);
const mobileShowThread = ref(false);

function checkScreenSize() {
  if (typeof window !== 'undefined') {
    isMobile.value = window.innerWidth < 768;
  }
}

const filteredConversations = computed(() => {
  let list = chatStore.conversations;
  if (activeFilter.value === 'unread') {
    list = list.filter((c) => (c.unreadCount || 0) > 0);
  }
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return list;
  return list.filter(
    (c) =>
      c.counterpart?.fullName?.toLowerCase().includes(query) ||
      (c.serviceName && c.serviceName.toLowerCase().includes(query)) ||
      (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(query)),
  );
});

function formatTime(isoString: string | null) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = isSameVnDay(d, now);
    if (isToday) {
      return vnTimeString(d, { hour: '2-digit', minute: '2-digit' });
    }
    return vnDateString(d, { month: 'numeric', day: 'numeric' });
  } catch {
    return '';
  }
}

async function selectConversation(id: string) {
  await chatStore.selectConversation(id);
  if (isMobile.value) {
    mobileShowThread.value = true;
  }
}

function handleBackFromThread() {
  mobileShowThread.value = false;
}

const isTechnician = computed(() => authStore.user?.role?.toUpperCase() === 'TECHNICIAN');

watch(activeFilter, () => {
  void nextTick(updateTabIndicator);
});

watch([() => chatStore.conversations.length, () => chatStore.totalUnreadCount], () => {
  void nextTick(updateTabIndicator);
});

onMounted(async () => {
  checkScreenSize();
  void nextTick(updateTabIndicator);
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => updateTabIndicator());
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', checkScreenSize);
    window.addEventListener('resize', updateTabIndicator);
  }

  await chatStore.fetchConversations();
  void nextTick(updateTabIndicator);
  const queryId = route.query.id as string | undefined;
  const bookingId = route.query.bookingId as string | undefined;

  if (queryId) {
    await chatStore.selectConversation(queryId);
    if (isMobile.value) mobileShowThread.value = true;
  } else if (bookingId) {
    await chatStore.openConversationForBooking(bookingId);
    if (isMobile.value) mobileShowThread.value = true;
  } else if (chatStore.conversations.length > 0 && !chatStore.activeConversationId) {
    if (!isMobile.value) {
      await chatStore.selectConversation(chatStore.conversations[0].id);
    }
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', checkScreenSize);
    window.removeEventListener('resize', updateTabIndicator);
  }
});

watch(
  () => route.query.id,
  (newId) => {
    if (newId && typeof newId === 'string') {
      void chatStore.selectConversation(newId);
      if (isMobile.value) mobileShowThread.value = true;
    }
  },
);
</script>

<template>
  <div class="h-[calc(100vh-5.5rem)] min-h-[580px]">
    <!-- Main Messenger Interface Surface -->
    <div class="h-full rounded-3xl bg-white border border-ink-200/90 shadow-(--shadow-e1) overflow-hidden flex flex-col md:flex-row">
      <!-- Left Panel: Conversation List -->
      <aside
        class="w-full md:w-80 lg:w-96 bg-ink-25/50 border-r border-ink-200/80 flex flex-col shrink-0 h-full transition-all"
        :class="isMobile && mobileShowThread ? 'hidden' : 'flex'"
      >
        <!-- Header with Title, Realtime Status & Search/Filter Controls -->
        <div class="p-3.5 sm:p-4 border-b border-ink-200/80 bg-white space-y-3 shrink-0">
          <!-- Title & FhStatusPill Realtime Indicator -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <h1 class="text-base sm:text-lg font-bold text-ink-900 tracking-tight flex items-center gap-2 truncate">
                <MessageSquare :size="20" class="text-brand-600 shrink-0" />
                <span>Tin nhắn</span>
              </h1>
              <span
                v-if="chatStore.totalUnreadCount > 0"
                class="px-2 py-0.5 text-xs font-bold rounded-full bg-brand-600 text-white font-num leading-none shrink-0"
              >
                {{ chatStore.totalUnreadCount }} mới
              </span>
            </div>
          </div>

          <!-- Search input -->
          <div class="relative">
            <Search :size="15" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Tìm theo tên người, dịch vụ..."
              class="w-full h-10 pl-9 pr-8 bg-ink-50/80 border border-ink-200 rounded-xl text-xs sm:text-sm placeholder:text-ink-400 text-ink-900 focus:outline-none focus:border-brand-600 focus:bg-white focus:ring-1 focus:ring-brand-600 transition-all"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 p-0.5 rounded-md"
              aria-label="Xóa tìm kiếm"
              @click="searchQuery = ''"
            >
              <X :size="14" />
            </button>
          </div>

          <!-- Sliding Filter Tabs  -->
          <div
            ref="tabListRef"
            class="relative flex w-full items-center gap-1 rounded-xl bg-ink-100 p-1 select-none"
            role="tablist"
            aria-label="Lọc cuộc hội thoại"
          >
            <!-- Sliding active background pill -->
            <div
              class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
              :style="indicatorStyle"
              aria-hidden="true"
            />

            <button
              v-for="tab in filterTabs"
              :key="tab.key"
              :ref="(el) => { tabRefs[tab.key] = el as HTMLElement }"
              type="button"
              role="tab"
              :aria-selected="activeFilter === tab.key"
              class="relative z-10 flex h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs sm:text-sm font-medium transition-colors"
              :class="activeFilter === tab.key ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
              @click="selectFilter(tab.key)"
            >
              <span>{{ tab.label }}</span>
              <span
                v-if="tab.count !== '' && tab.count !== undefined"
                class="inline-flex items-center rounded-full px-1.5 py-0.2 font-num text-xs transition-colors"
                :class="activeFilter === tab.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-ink-200/60 text-ink-600'"
              >
                {{ tab.count }}
              </span>
            </button>
          </div>
        </div>

        <!-- Conversations Scrollable Feed -->
        <div class="flex-1 overflow-y-auto divide-y divide-ink-100/70 p-2 space-y-1">
          <!-- Skeleton Loading State -->
          <div
            v-if="chatStore.loadingConversations && chatStore.conversations.length === 0"
            class="space-y-2 p-2"
            data-testid="conversations-skeleton"
            aria-busy="true"
            aria-label="Đang tải danh sách hội thoại"
          >
            <div v-for="i in 5" :key="i" class="p-3 rounded-2xl bg-white border border-ink-100 flex items-start gap-3">
              <FhSkeleton width="44px" height="44px" rounded="full" class="shrink-0" />
              <div class="flex-1 space-y-2 min-w-0">
                <div class="flex justify-between items-center">
                  <FhSkeleton width="50%" height="15px" />
                  <FhSkeleton width="35px" height="12px" />
                </div>
                <FhSkeleton width="35%" height="12px" />
                <FhSkeleton width="85%" height="13px" />
              </div>
            </div>
          </div>

          <!-- Empty: Completely no conversations -->
          <div
            v-else-if="chatStore.conversations.length === 0"
            class="h-full flex flex-col items-center justify-center text-center p-6 space-y-3"
          >
            <div class="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-100/80">
              <MessageSquare :size="28" />
            </div>
            <div class="space-y-1">
              <h2 class="text-sm font-bold text-ink-900">Chưa có cuộc trò chuyện nào</h2>
              <p class="text-xs text-ink-500 max-w-[240px] text-pretty">
                Các cuộc trao đổi với đối tác sửa chữa sẽ hiển thị tại đây khi có đơn dịch vụ.
              </p>
            </div>
            <div class="pt-1">
              <FhButton
                v-if="!isTechnician"
                variant="primary"
                size="sm"
                @click="router.push('/app/bookings/new')"
              >
                <CalendarPlus :size="14" />
                <span>Đặt thợ ngay</span>
              </FhButton>
              <FhButton
                v-else
                variant="secondary"
                size="sm"
                @click="router.push('/tech/jobs')"
              >
                <Briefcase :size="14" />
                <span>Xem công việc</span>
              </FhButton>
            </div>
          </div>

          <!-- Empty: Search / filter yielded 0 results -->
          <div
            v-else-if="filteredConversations.length === 0"
            class="py-12 px-4 text-center space-y-2"
          >
            <div class="w-10 h-10 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-1">
              <Search :size="18" />
            </div>
            <h3 class="text-sm font-semibold text-ink-800">Không tìm thấy hội thoại</h3>
            <p class="text-xs text-ink-500 max-w-[200px] mx-auto text-pretty">
              Không có kết quả phù hợp với từ khóa hoặc bộ lọc hiện tại.
            </p>
            <div class="pt-1">
              <button
                type="button"
                class="text-xs font-semibold text-brand-600 hover:text-brand-700 underline"
                @click="searchQuery = ''; activeFilter = 'all'"
              >
                Đặt lại bộ lọc
              </button>
            </div>
          </div>

          <!-- Conversation Item Card -->
          <button
            v-for="conv in filteredConversations"
            :key="conv.id"
            type="button"
            class="w-full p-3 rounded-2xl flex items-start gap-3 text-left transition-all relative border"
            :class="[
              chatStore.activeConversationId === conv.id
                ? 'bg-white border-brand-300 shadow-xs ring-1 ring-brand-200'
                : 'bg-white/60 hover:bg-white border-transparent hover:border-ink-200/80'
            ]"
            @click="selectConversation(conv.id)"
          >
            <!-- Avatar with Role Badge & Online Dot -->
            <div class="relative shrink-0">
              <div class="w-11 h-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-brand-200/90 shadow-2xs">
                <img
                  v-if="conv.counterpart?.avatarUrl"
                  :src="conv.counterpart.avatarUrl"
                  :alt="conv.counterpart.fullName"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ conv.counterpart?.fullName?.charAt(0) || 'U' }}</span>
              </div>

              <!-- Role icon badge at avatar corner -->
              <span
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 border-white shadow-2xs"
                :class="conv.counterpart?.role?.toUpperCase() === 'TECHNICIAN' ? 'bg-brand-600 text-white' : 'bg-ink-600 text-white'"
                :title="conv.counterpart?.role?.toUpperCase() === 'TECHNICIAN' ? 'Kỹ thuật viên' : 'Khách hàng'"
              >
                <Wrench v-if="conv.counterpart?.role?.toUpperCase() === 'TECHNICIAN'" :size="9" />
                <User v-else :size="9" />
              </span>
            </div>

            <!-- Conversation Details -->
            <div class="flex-1 min-w-0">
              <!-- Name & Time -->
              <div class="flex items-center justify-between gap-1">
                <h3
                  class="text-xs sm:text-sm font-bold truncate"
                  :class="chatStore.activeConversationId === conv.id ? 'text-brand-900' : 'text-ink-900'"
                >
                  {{ conv.counterpart?.fullName || 'Người dùng' }}
                </h3>
                <span class="text-[11px] text-ink-400 font-num shrink-0">
                  {{ formatTime(conv.lastMessageAt) }}
                </span>
              </div>

              <!-- Service chip / label -->
              <div v-if="conv.serviceName" class="mt-0.5 truncate">
                <span class="inline-block text-[11px] font-medium text-brand-600 truncate max-w-full">
                  {{ conv.serviceName }}
                </span>
              </div>

              <!-- Last Message Preview & Unread Pill -->
              <div class="flex items-center justify-between gap-2 mt-1">
                <p
                  class="text-xs truncate flex-1"
                  :class="conv.unreadCount > 0 ? 'font-semibold text-ink-900' : 'text-ink-500'"
                >
                  {{ conv.lastMessagePreview || 'Bắt đầu cuộc trò chuyện' }}
                </p>

                <!-- Unread Badge -->
                <span
                  v-if="conv.unreadCount > 0"
                  class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-brand-600 text-white font-num leading-none shrink-0 shadow-2xs"
                >
                  {{ conv.unreadCount }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <!-- Right Panel: Chat Thread or Empty Placeholder -->
      <main
        class="flex-1 flex flex-col bg-white overflow-hidden h-full"
        :class="isMobile && !mobileShowThread ? 'hidden' : 'flex'"
      >
        <ChatThread
          v-if="chatStore.activeConversationId"
          :conversation-id="chatStore.activeConversationId"
          :show-back-button="isMobile"
          full-height
          @back="handleBackFromThread"
        />

        <!-- Empty selection state (desktop only) -->
        <div
          v-else
          class="h-full flex flex-col items-center justify-center p-8 text-center bg-ink-25/40"
        >
          <div class="w-16 h-16 rounded-3xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center mb-4 shadow-xs">
            <MessageSquare :size="32" />
          </div>
          <h2 class="text-base sm:text-lg font-bold text-ink-900 tracking-tight">Chọn cuộc trò chuyện</h2>
          <p class="text-xs sm:text-sm text-ink-500 mt-1.5 max-w-sm text-pretty">
            Chọn một cuộc hội thoại từ danh sách bên trái để trao đổi chi tiết và kết nối trực tiếp với kỹ thuật viên.
          </p>
          <div class="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-ink-600">
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-ink-200 shadow-2xs">
              <ShieldCheck :size="14" class="text-brand-600" />
              <span>Bảo mật trực tiếp</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-ink-200 shadow-2xs">
              <Phone :size="14" class="text-brand-600" />
              <span>Gọi thoại tức thì</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-ink-200 shadow-2xs">
              <Sparkles :size="14" class="text-brand-600" />
              <span>Đồng bộ thời gian thực</span>
            </span>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
