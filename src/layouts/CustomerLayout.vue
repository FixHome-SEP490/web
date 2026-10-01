<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat.store';
import {
  CalendarPlus,
  ShieldAlert,
  MapPin,
  Bell,
  User,
  LogOut,
  ChevronDown,
  MessageSquare,
  Home,
  ClipboardList,
  ShieldCheck,
  History,
} from 'lucide-vue-next';
import { FhButton, ChatFloatingWidget, AiAssistantWidget } from '../components';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import CallOverlay from '../components/chat/CallOverlay.vue';
import { useCallStore } from '../stores/call.store';
import { toast } from 'vue-sonner';
import { vnDateString } from '../utils/vn-time';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();
const callStore = useCallStore();
const avatarMenuOpen = ref(false);

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

/** Top bar on wide screens; the bottom tab bar reuses the first five, like the app. */
const navItems = [
  { to: '/app', label: 'Tổng quan', icon: Home, exact: true },
  { to: '/app/orders', label: 'Đơn sửa chữa', icon: ClipboardList, exact: false },
  { to: '/app/warranties', label: 'Bảo hành', icon: ShieldCheck, exact: false },
  { to: '/app/history', label: 'Lịch sử sửa chữa', icon: History, exact: false },
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
  <div class="min-h-screen flex flex-col bg-ink-50 text-ink-900 [--fh-dock:5.25rem] lg:[--fh-dock:1.25rem]">
    <header class="sticky top-0 z-30 bg-white border-b border-ink-200">
      <div class="max-w-280 mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
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
            @click="router.push('/app/bookings/new')"
          >
            <CalendarPlus :size="16" />
            <span class="hidden sm:inline">Đặt thợ ngay</span>
          </FhButton>

          <NotificationBellDropdown />

          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1.5 p-1 rounded-full hover:bg-ink-100 transition-colors"
              aria-label="Tài khoản"
              :aria-expanded="avatarMenuOpen"
              @click="avatarMenuOpen = !avatarMenuOpen"
            >
              <span class="w-8 h-8 rounded-full bg-brand-50 text-brand-700 font-semibold flex items-center justify-center text-sm border border-brand-100 overflow-hidden">
                <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-full h-full object-cover" />
                <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'K' }}</span>
              </span>
              <ChevronDown :size="16" class="text-ink-400 hidden sm:block" />
            </button>

            <div v-if="avatarMenuOpen" class="fixed inset-0 z-40" @click="avatarMenuOpen = false" />
            <div
              v-if="avatarMenuOpen"
              class="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) py-2 z-50 divide-y divide-ink-100"
              @click="avatarMenuOpen = false"
            >
              <div class="px-4 py-2.5">
                <p class="text-sm font-semibold text-ink-900 truncate">{{ authStore.user?.fullName }}</p>
                <p class="text-xs text-ink-500 truncate">{{ authStore.user?.email }}</p>
              </div>

              <div class="py-1 text-sm text-ink-700">
                <router-link to="/app/profile" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <User :size="16" class="text-ink-500" />
                  Hồ sơ cá nhân
                </router-link>
                <router-link to="/app/profile" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <MapPin :size="16" class="text-ink-500" />
                  Sổ địa chỉ
                </router-link>
                <router-link to="/app/notifications" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <Bell :size="16" class="text-ink-500" />
                  Thông báo
                </router-link>
                <router-link to="/app/warranties" class="flex lg:hidden items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <ShieldCheck :size="16" class="text-ink-500" />
                  Bảo hành
                </router-link>
                <router-link to="/app/history" class="flex lg:hidden items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <History :size="16" class="text-ink-500" />
                  Lịch sử sửa chữa
                </router-link>
              </div>

              <div class="py-1">
                <button
                  type="button"
                  class="flex items-center gap-3 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 w-full text-left"
                  @click="handleLogout"
                >
                  <LogOut :size="16" />
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
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
