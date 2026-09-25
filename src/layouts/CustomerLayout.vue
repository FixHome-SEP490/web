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
} from 'lucide-vue-next';
import { FhButton, ChatFloatingWidget, AiAssistantWidget } from '../components';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import { toast } from 'vue-sonner';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();
const avatarMenuOpen = ref(false);

onMounted(() => {
  chatStore.initSocket();
});

const isSuspended = computed<boolean>(() => {
  if (authStore.user?.status === 'SUSPENDED') return true;
  if (authStore.user?.bookingSuspendedUntil) {
    return new Date(authStore.user.bookingSuspendedUntil) > new Date();
  }
  return false;
});

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
  <div class="min-h-screen flex flex-col bg-ink-50 text-ink-900">
    <!-- Top Navigation Bar per P6.1 -->
    <header class="sticky top-0 z-30 bg-white border-b border-ink-200 shadow-(--shadow-e1)">
      <div class="max-w-280 mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <!-- Brand / Logo -->
        <div class="flex items-center gap-8">
          <router-link to="/app" class="inline-flex items-center gap-2.5 group">
            <img :src="'/logo.png'" alt="FixHome" class="w-9 h-9 object-contain rounded-xl shadow-xs group-hover:scale-105 transition-transform" />
            <span class="text-xl font-extrabold text-ink-900 tracking-tight">Fix<span class="text-brand-600">Home</span></span>
          </router-link>

          <!-- Nav Items -->
          <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-ink-700">
            <router-link
              to="/app"
              class="hover:text-brand-600 transition-colors py-1"
              exact-active-class="text-brand-600 font-semibold border-b-2 border-brand-600"
            >
              Tổng quan
            </router-link>
            <router-link
              to="/app/orders"
              class="hover:text-brand-600 transition-colors py-1"
              active-class="text-brand-600 font-semibold border-b-2 border-brand-600"
            >
              Đơn sửa chữa
            </router-link>
            <router-link
              to="/app/warranties"
              class="hover:text-brand-600 transition-colors py-1"
              active-class="text-brand-600 font-semibold border-b-2 border-brand-600"
            >
              Bảo hành
            </router-link>
            <router-link
              to="/app/history"
              class="hover:text-brand-600 transition-colors py-1"
              active-class="text-brand-600 font-semibold border-b-2 border-brand-600"
            >
              Lịch sử sửa chữa
            </router-link>
            <router-link
              to="/app/messages"
              class="hover:text-brand-600 transition-colors py-1 flex items-center gap-1.5 relative"
              active-class="text-brand-600 font-semibold border-b-2 border-brand-600"
            >
              <MessageSquare :size="16" />
              <span>Tin nhắn</span>
              <span
                v-if="chatStore.totalUnreadCount > 0"
                class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-brand-600 text-white font-num leading-none"
              >
                {{ chatStore.totalUnreadCount }}
              </span>
            </router-link>
          </nav>
        </div>

        <!-- Right Side: Booking CTA + Notifications + Avatar Menu -->
        <div class="flex items-center gap-2.5 sm:gap-4">
          <!-- Create Booking Button -->
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

          <!-- Notification Bell Icon Dropdown -->
          <NotificationBellDropdown />

          <!-- User Avatar Dropdown -->
          <div class="relative">
            <button
              class="flex items-center gap-2 p-1.5 rounded-sm hover:bg-ink-100 transition-colors"
              @click="avatarMenuOpen = !avatarMenuOpen"
            >
              <div class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center text-sm border border-brand-200 overflow-hidden">
                <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
                <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'C' }}</span>
              </div>
              <ChevronDown :size="16" class="text-ink-500" />
            </button>

            <!-- Dropdown Menu -->
            <div
              v-if="avatarMenuOpen"
              class="absolute right-0 mt-2 w-56 bg-white rounded-md border border-ink-200 shadow-(--shadow-e3) py-2 z-50 divide-y divide-ink-100"
              @click="avatarMenuOpen = false"
            >
              <div class="px-4 py-2">
                <p class="text-sm font-semibold text-ink-900 truncate">{{ authStore.user?.fullName }}</p>
                <p class="text-xs text-ink-500 truncate">{{ authStore.user?.email }}</p>
              </div>

              <div class="py-1 text-sm text-ink-700">
                <router-link to="/app/profile" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50">
                  <User :size="16" />
                  Hồ sơ cá nhân
                </router-link>
                <router-link to="/app/profile" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50">
                  <MapPin :size="16" />
                  Sổ địa chỉ
                </router-link>
                <router-link to="/app/notifications" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50">
                  <Bell :size="16" />
                  Thông báo
                </router-link>
              </div>

              <div class="py-1">
                <button
                  class="flex items-center gap-2.5 px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 w-full text-left"
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

    <!-- Suspension Warning Banner per P6.3 -->
    <div
      v-if="isSuspended"
      class="bg-danger-50 border-b border-danger-200 px-4 py-3 text-danger-800 text-sm text-center font-medium flex items-center justify-center gap-2"
    >
      <ShieldAlert :size="18" class="text-danger-600" />
      <span>
        Tài khoản của bạn đang bị giới hạn tạo yêu cầu mới
        <span v-if="authStore.user?.bookingSuspendedUntil">
          đến {{ new Date(authStore.user.bookingSuspendedUntil).toLocaleDateString('vi-VN') }}
        </span>
        do vi phạm quy định huỷ đơn.
      </span>
    </div>

    <!-- Main Content: max-width 1120px per P6.1 -->
    <main class="flex-1 max-w-280 w-full mx-auto px-4 sm:px-6 py-8">
      <router-view />
    </main>

    <!-- Global Floating Chat Widget -->
    <ChatFloatingWidget />
    <AiAssistantWidget />
  </div>
</template>
