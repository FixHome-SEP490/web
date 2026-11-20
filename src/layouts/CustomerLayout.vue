<script setup lang="ts">
import { whileOffline } from '../services/live-updates';
import { customerPageKey } from '../utils/booking-form-key';
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat.store';
import { useNotificationsStore } from '../stores/notifications.store';
import { useCallStore } from '../stores/call.store';
import {
  Bell,
  ShieldAlert,
  User,
  MessageSquare,
  Home,
  ClipboardList,
} from 'lucide-vue-next';
import { ChatFloatingWidget, AiAssistantWidget } from '../components';
import CustomerTopHeader from '../components/account/CustomerTopHeader.vue';
import CallOverlay from '../components/chat/CallOverlay.vue';
import { toast } from 'vue-sonner';
import { vnDateString } from '../utils/vn-time';

const router = useRouter();
/** The full chat page fills the screen: no room kept for the floating buttons it does not show. */
const onChatPage = computed(() => router.currentRoute?.value?.name === 'customer-messages');
const authStore = useAuthStore();
const chatStore = useChatStore();
const notifStore = useNotificationsStore();
const callStore = useCallStore();
const bookingStep1Wide = ref(false);
provide('customer-booking-layout-width', (wide: boolean) => {
  bookingStep1Wide.value = wide;
});

// Pages with a fixed action bar at the bottom (route meta actionBar) need the
// floating chat buttons lifted above it.
const hasActionBar = computed(() => router.currentRoute?.value?.meta?.actionBar === true);

let chatPoll: (() => void) | null = null;

// ── Mobile bottom tab sliding indicator ──
const mobileNavRef = ref<HTMLElement | null>(null);
const mobileTabRefs = ref<Record<string, HTMLElement | null>>({});
const mobileIndicatorStyle = ref<Record<string, string>>({ opacity: '0' });

function setMobileTabRef(to: string, el: unknown) {
  if (!el) return;
  const domEl = (typeof el === 'object' && el !== null && '$el' in el)
    ? (el as { $el: HTMLElement }).$el
    : (el as HTMLElement);
  if (domEl && typeof domEl === 'object') {
    mobileTabRefs.value[to] = domEl;
  }
}

function updateMobileIndicator() {
  const currentPath = router.currentRoute.value?.path || '';
  const activeItem = tabItems.find((item) =>
    item.exact ? currentPath === item.to : currentPath.startsWith(item.to)
  );
  if (!activeItem || !mobileNavRef.value) {
    mobileIndicatorStyle.value = { opacity: '0' };
    return;
  }
  const el = mobileTabRefs.value[activeItem.to];
  if (!el || el.offsetWidth === 0) {
    mobileIndicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = el.offsetLeft;
  const width = el.offsetWidth;
  mobileIndicatorStyle.value = {
    transform: `translate3d(${left}px, 0, 0)`,
    width: `${width}px`,
    opacity: '1',
  };
}

onMounted(async () => {
  chatStore.initSocket();
  // Listening for calls is separate from opening the chat widget: a call has to
  // reach the customer wherever they are in the app.
  callStore.initCallSignalling();

  if (authStore.isAuthenticated) {
    void chatStore.fetchConversations?.();
    void notifStore.fetchUnreadCount?.();
  }

  // Unread counts follow the socket (new messages, new notifications, PO 18/10/2026);
  // they are read every 20 s only while it is down, and once when it is back.
  chatPoll = whileOffline(() => {
    if (authStore.isAuthenticated) {
      void chatStore.fetchConversations?.();
      void notifStore.fetchUnreadCount?.();
    }
  }, 20000);

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateMobileIndicator);
  }
  void nextTick(() => {
    updateMobileIndicator();
    setTimeout(updateMobileIndicator, 60);
  });
});

onUnmounted(() => {
  if (chatPoll) {
    chatPoll();
    chatPoll = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateMobileIndicator);
  }
});

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      void chatStore.fetchConversations?.();
      void notifStore.fetchUnreadCount?.();
    }
  }
);

watch(
  () => router.currentRoute.value?.path,
  () => {
    void nextTick(updateMobileIndicator);
  }
);

const isSuspended = computed<boolean>(() => {
  if (authStore.user?.status === 'SUSPENDED') return true;
  if (authStore.user?.bookingSuspendedUntil) {
    return new Date(authStore.user.bookingSuspendedUntil) > new Date();
  }
  return false;
});

const unread = computed(() => (chatStore.totalUnreadCount > 99 ? '99+' : String(chatStore.totalUnreadCount)));
const effectiveNotifCount = computed(() => Math.max(notifStore.unreadCount, notifStore.unreadNotifications.length));
const unreadNotif = computed(() => (effectiveNotifCount.value > 99 ? '99+' : String(effectiveNotifCount.value)));

const tabItems = [
  { to: '/app', label: 'Trang chủ', icon: Home, exact: true },
  { to: '/app/orders', label: 'Đơn của tôi', icon: ClipboardList, exact: false },
  { to: '/app/messages', label: 'Tin nhắn', icon: MessageSquare, exact: false },
  { to: '/app/notifications', label: 'Thông báo', icon: Bell, exact: false },
  { to: '/app/profile', label: 'Tài khoản', icon: User, exact: false },
];

const handleLogout = async () => {
  await authStore.logout();
  toast('Đã đăng xuất');
  // Full reload (not router.push): wipes every Pinia store's in-memory state
  // (chat socket, cached lists, etc.) so a later login never shows stale
  // data left over from the previous session.
  window.location.href = '/login';
};
</script>

<template>
  <!-- The bottom tab bar is 64px below lg; --fh-dock lifts floating buttons above it. -->
  <div
    class="min-h-screen flex flex-col bg-transparent text-ink-900"
    :class="hasActionBar ? '[--fh-dock:10rem] sm:[--fh-dock:5.25rem] lg:[--fh-dock:1.25rem]' : '[--fh-dock:5.25rem] lg:[--fh-dock:1.25rem]'"
  >
    <CustomerTopHeader :is-suspended="isSuspended" @logout="handleLogout" />

    <!-- A real restriction on the account: an alert, so red. -->
    <div v-if="isSuspended" class="bg-danger-50 border-b border-danger-200 px-4 py-3" role="alert">
      <p class="w-full flex items-start sm:items-center justify-center gap-2 text-sm font-medium text-danger-700 text-pretty">
        <ShieldAlert :size="18" class="shrink-0 text-danger-600" />
        <span>
          Tài khoản của bạn đang bị giới hạn tạo yêu cầu mới
          <span v-if="authStore.user?.bookingSuspendedUntil" class="whitespace-nowrap">
            đến {{ vnDateString(authStore.user.bookingSuspendedUntil) }}
          </span>
          do vi phạm quy định huỷ đơn.
        </span>
      </p>
    </div>

    <main
      class="flex-1 w-full px-4 sm:px-6 lg:px-8"
      :class="[onChatPage ? 'pt-4 sm:pt-6 pb-4' : 'pt-6 sm:pt-8 pb-44 sm:pb-48 lg:pb-10', { 'customer-main--booking-wide': bookingStep1Wide }]"
      data-testid="customer-layout-main"
    >
      <router-view v-slot="{ Component, route: current }">
        <component :is="Component" :key="customerPageKey(current)" />
      </router-view>
    </main>

    <!-- Bottom tabs on narrow screens, the way the mobile app navigates. -->
    <nav
      class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-ink-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Điều hướng chính"
      data-fh-bottom-dock
    >
      <div ref="mobileNavRef" class="relative grid grid-cols-5 h-16">
        <!-- Sliding active indicator bar for mobile -->
        <div
          class="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-brand-600 rounded-t-sm transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          :style="mobileIndicatorStyle"
          aria-hidden="true"
        />

        <router-link
          v-for="item in tabItems"
          :key="item.to"
          :ref="(el) => setMobileTabRef(item.to, el)"
          :to="item.to"
          class="relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-500 hover:text-ink-800 transition-colors select-none"
          :active-class="item.exact ? '' : 'text-brand-600 font-semibold'"
          :exact-active-class="item.exact ? 'text-brand-600 font-semibold' : ''"
        >
          <div class="relative flex items-center justify-center">
            <component :is="item.icon" :size="21" :stroke-width="1.8" />
            <!-- Chat unread badge -->
            <span
              v-if="item.to === '/app/messages' && chatStore.totalUnreadCount > 0"
              class="absolute -top-1.5 -right-2.5 min-w-4.5 h-4.5 px-1 rounded-full bg-danger-600 text-white text-[10px] font-bold font-num flex items-center justify-center ring-2 ring-white shadow-2xs leading-none"
            >
              {{ unread }}
            </span>
            <!-- Notifications unread badge -->
            <span
              v-if="item.to === '/app/notifications' && effectiveNotifCount > 0"
              class="absolute -top-1.5 -right-2.5 min-w-4.5 h-4.5 px-1 rounded-full bg-danger-600 text-white text-[10px] font-bold font-num flex items-center justify-center ring-2 ring-white shadow-2xs leading-none"
            >
              {{ unreadNotif }}
            </span>
          </div>
          <span class="leading-none text-[10.5px] tracking-tight">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <ChatFloatingWidget />
    <CallOverlay />
    <AiAssistantWidget />
  </div>
</template>
