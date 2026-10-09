<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat.store';
import {
  CalendarPlus,
  ShieldAlert,
  Bell,
  User,
  MessageSquare,
  Home,
  ClipboardList,
  ShieldCheck,
  Bot,
} from 'lucide-vue-next';
import { FhButton, ChatFloatingWidget, AiAssistantWidget } from '../components';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import AccountMenu from '../components/account/AccountMenu.vue';
import CallOverlay from '../components/chat/CallOverlay.vue';
import { useCallStore } from '../stores/call.store';
import { toast } from 'vue-sonner';
import { vnDateString } from '../utils/vn-time';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();
const callStore = useCallStore();

// Pages with a fixed action bar at the bottom (route meta actionBar) need the
// floating chat buttons lifted above it.
const hasActionBar = computed(() => router.currentRoute?.value?.meta?.actionBar === true);

onMounted(() => {
  chatStore.initSocket();
  // Listening for calls is separate from opening the chat widget: a call has to
  // reach the customer wherever they are in the app.
  callStore.initCallSignalling();
});

const isSuspended = computed<boolean>(() => {
  if (authStore.user?.status === 'SUSPENDED') return true;
  if (authStore.user?.bookingSuspendedUntil) {
    return new Date(authStore.user.bookingSuspendedUntil) > new Date();
  }
  return false;
});

const unread = computed(() => (chatStore.totalUnreadCount > 99 ? '99+' : String(chatStore.totalUnreadCount)));

/**
 * Top bar on wide screens. Repair history lives in the account menu (PO 09/10/2026),
 * so the bar keeps four links.
 */
const navItems = [
  { to: '/app', label: 'Tổng quan', icon: Home, exact: true },
  { to: '/app/orders', label: 'Đơn sửa chữa', icon: ClipboardList, exact: false },
  { to: '/app/warranties', label: 'Bảo hành', icon: ShieldCheck, exact: false },
  { to: '/app/messages', label: 'Tin nhắn', icon: MessageSquare, exact: false },
];

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
    class="min-h-screen flex flex-col bg-ink-50 text-ink-900"
    :class="hasActionBar ? '[--fh-dock:10rem] lg:[--fh-dock:6rem]' : '[--fh-dock:5.25rem] lg:[--fh-dock:1.25rem]'"
  >
    <header class="sticky top-0 z-30 bg-white border-b border-ink-200">
      <!-- A little wider than the page so the links and both booking buttons fit. -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div class="flex items-center gap-6 min-w-0">
          <router-link to="/" class="inline-flex items-center gap-2.5 shrink-0" aria-label="FixHome - Trang chủ">
            <img :src="'/logo.png'" alt="" class="w-9 h-9 object-contain rounded-xl" />
            <span class="text-xl font-bold tracking-tight whitespace-nowrap"><span class="text-brand-600">Fix</span><span class="text-success-600">Home</span></span>
          </router-link>

          <nav class="hidden lg:flex items-center gap-1 text-sm font-medium text-ink-600" aria-label="Điều hướng chính">
            <router-link
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="h-9 px-3 rounded-xl inline-flex items-center gap-2 whitespace-nowrap hover:bg-ink-100 hover:text-ink-900 transition-colors"
              :active-class="item.exact ? '' : 'bg-brand-50 text-brand-700 font-semibold'"
              :exact-active-class="item.exact ? 'bg-brand-50 text-brand-700 font-semibold' : ''"
            >
              <span>{{ item.label }}</span>
              <span
                v-if="item.to === '/app/messages' && chatStore.totalUnreadCount > 0"
                class="min-w-5 h-5 px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-semibold font-num inline-flex items-center justify-center"
              >
                {{ unread }}
              </span>
            </router-link>
          </nav>
        </div>

        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <FhButton
            variant="primary"
            size="sm"
            :disabled="isSuspended"
            :title="isSuspended ? 'Tài khoản đang bị tạm khoá đặt dịch vụ' : 'Tạo yêu cầu sửa chữa mới'"
            aria-label="Đặt thợ ngay"
            @click="router.push('/app/bookings/new')"
          >
            <CalendarPlus :size="16" />
            <span class="hidden sm:inline lg:hidden xl:inline whitespace-nowrap">Đặt thợ ngay</span>
          </FhButton>
          <!-- The AI form sits right beside the plain one. -->
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="isSuspended"
            title="Mô tả sự cố để trợ lý AI chẩn đoán rồi đặt thợ"
            aria-label="Chẩn đoán bằng AI"
            data-testid="header-ai-booking"
            @click="router.push('/app/bookings/ai')"
          >
            <Bot :size="16" />
            <span class="hidden sm:inline lg:hidden xl:inline whitespace-nowrap">Chẩn đoán bằng AI</span>
          </FhButton>

          <NotificationBellDropdown />

          <AccountMenu context="customer-app" @logout="handleLogout" />
        </div>
      </div>
    </header>

    <!-- A real restriction on the account: an alert, so red. -->
    <div v-if="isSuspended" class="bg-danger-50 border-b border-danger-200 px-4 py-3" role="alert">
      <p class="max-w-280 mx-auto flex items-start sm:items-center justify-center gap-2 text-sm font-medium text-danger-700 text-pretty">
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

    <main class="flex-1 max-w-280 w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-28 lg:pb-10">
      <router-view />
    </main>

    <!-- Bottom tabs on narrow screens, the way the mobile app navigates. -->
    <nav
      class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-ink-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Điều hướng chính"
    >
      <div class="grid grid-cols-5">
        <router-link
          v-for="item in tabItems"
          :key="item.to"
          :to="item.to"
          class="relative h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-500 whitespace-nowrap"
          :active-class="item.exact ? '' : 'text-brand-600'"
          :exact-active-class="item.exact ? 'text-brand-600' : ''"
        >
          <component :is="item.icon" :size="22" :stroke-width="1.75" />
          <span>{{ item.label }}</span>
          <span
            v-if="item.to === '/app/messages' && chatStore.totalUnreadCount > 0"
            class="absolute top-2 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-danger-600 text-white text-[10px] font-semibold font-num inline-flex items-center justify-center"
          >
            {{ unread }}
          </span>
        </router-link>
      </div>
    </nav>

    <ChatFloatingWidget />
    <CallOverlay />
    <AiAssistantWidget />
  </div>
</template>
