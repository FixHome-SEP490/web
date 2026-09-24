<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat.store';
import {
  Wrench,
  Inbox,
  Briefcase,
  DollarSign,
  LogOut,
  User,
  ShieldCheck,
  ChevronDown,
  MessageSquare,
  Zap,
} from 'lucide-vue-next';

import { ChatFloatingWidget } from '../components';
import { ordersApi } from '../api/orders.api';
import { bookingsApi } from '../api/bookings.api';

const authStore = useAuthStore();
const chatStore = useChatStore();
const isAvailable = ref(true);
const avatarMenuOpen = ref(false);
const activeJobs = ref<number>(0);
const invitationCount = ref(0);

const refreshInvitationCount = async () => {
  try {
    const invitations = await bookingsApi.getMyInvitations();
    invitationCount.value = invitations.length;
  } catch {
    // ignore
  }
};

let invitationPoll: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  chatStore.initSocket();
  try {
    const jobs = await ordersApi.getTechnicianJobs();
    const active = jobs.filter((j) =>
      ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(j.status).toUpperCase())
    );
    activeJobs.value = active.length;
  } catch {
    // ignore
  }
  await refreshInvitationCount();
  invitationPoll = setInterval(refreshInvitationCount, 30000);
});

onUnmounted(() => {
  if (invitationPoll) clearInterval(invitationPoll);
});

const toggleAvailability = () => {
  isAvailable.value = !isAvailable.value;
};

const handleLogout = async () => {
  await authStore.logout();
  // Full reload (not router.push): wipes every Pinia store's in-memory state
  // (chat socket, cached lists, etc.) so a later login never shows stale
  // data left over from the previous session.
  window.location.href = '/login';
};

const userInitial = computed(() => {
  return authStore.user?.fullName?.charAt(0)?.toUpperCase() || 'T';
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-ink-50/50 text-ink-900 pb-16 md:pb-0">
    <!-- Top Navigation Bar (Modern Mobile-harmonized Style) -->
    <header class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-ink-200/80 shadow-xs">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <!-- Left: Logo + Tech Tagline -->
        <div class="flex items-center gap-6 lg:gap-8">
          <router-link to="/tech" class="inline-flex items-center gap-2.5 group">
            <img :src="'/logo.png'" alt="FixHome" class="w-10 h-10 object-contain rounded-xl shadow-xs group-hover:scale-105 transition-transform" />
            <div>
              <div class="text-lg sm:text-xl font-extrabold text-ink-900 tracking-tight leading-none">
                Fix<span class="text-brand-600">Home</span>
              </div>
              <span class="block text-[9px] font-extrabold text-brand-700 tracking-widest uppercase mt-0.5">
                Kỹ thuật viên
              </span>
            </div>
          </router-link>

          <!-- Desktop Nav Links -->
          <nav class="hidden md:flex items-center gap-1 lg:gap-2 text-xs font-bold text-ink-600">
            <router-link
              to="/tech"
              class="px-3 py-2 rounded-xl hover:bg-ink-100 hover:text-ink-900 transition-all flex items-center gap-1.5"
              active-class="bg-brand-50 text-brand-700 font-extrabold"
              exact-active-class="bg-brand-50 text-brand-700 font-extrabold"
            >
              <Briefcase :size="15" />
              Tổng quan
            </router-link>

            <router-link
              to="/tech/jobs"
              class="px-3 py-2 rounded-xl hover:bg-ink-100 hover:text-ink-900 transition-all flex items-center gap-1.5 relative"
              active-class="bg-brand-50 text-brand-700 font-extrabold"
            >
              <Wrench :size="15" />
              <span>Đơn nhận việc</span>
              <span
                v-if="activeJobs > 0"
                class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-brand-600 text-white font-num leading-none"
              >
                {{ activeJobs }}
              </span>
            </router-link>

            <router-link
              to="/tech/invitations"
              class="px-3 py-2 rounded-xl hover:bg-ink-100 hover:text-ink-900 transition-all flex items-center gap-1.5 relative"
              active-class="bg-brand-50 text-brand-700 font-extrabold"
            >
              <Inbox :size="15" />
              <span>Hộp thư mời</span>
              <span
                v-if="invitationCount > 0"
                class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-500 text-white font-num leading-none"
              >
                {{ invitationCount }}
              </span>
            </router-link>

            <router-link
              to="/tech/earnings"
              class="px-3 py-2 rounded-xl hover:bg-ink-100 hover:text-ink-900 transition-all flex items-center gap-1.5"
              active-class="bg-brand-50 text-brand-700 font-extrabold"
            >
              <DollarSign :size="15" />
              Thu nhập
            </router-link>

            <router-link
              to="/tech/messages"
              class="px-3 py-2 rounded-xl hover:bg-ink-100 hover:text-ink-900 transition-all flex items-center gap-1.5 relative"
              active-class="bg-brand-50 text-brand-700 font-extrabold"
            >
              <MessageSquare :size="15" />
              <span>Tin nhắn</span>
              <span
                v-if="chatStore.totalUnreadCount > 0"
                class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-600 text-white font-num leading-none"
              >
                {{ chatStore.totalUnreadCount > 9 ? '9+' : chatStore.totalUnreadCount }}
              </span>
            </router-link>
          </nav>
        </div>

        <!-- Right: Active badge + Availability Switch + User Avatar -->
        <div class="flex items-center gap-3">
          <!-- Active Jobs Badge (Mobile Header Match) -->
          <router-link
            v-if="activeJobs > 0"
            to="/tech/jobs"
            class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-600 text-white text-xs font-bold shadow-xs hover:bg-brand-700 active:scale-95 transition-all"
          >
            <Zap :size="13" class="fill-white" />
            <span>{{ activeJobs }} đơn chờ</span>
          </router-link>

          <!-- Chat icon shortcut with badge -->
          <router-link
            to="/tech/messages"
            class="relative w-9 h-9 rounded-xl bg-ink-100/80 hover:bg-ink-200 text-ink-700 flex items-center justify-center transition-colors"
            title="Trò chuyện với khách hàng"
          >
            <MessageSquare :size="18" />
            <span
              v-if="chatStore.totalUnreadCount > 0"
              class="absolute -top-1 -right-1 px-1.5 min-w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white leading-none"
            >
              {{ chatStore.totalUnreadCount > 9 ? '9+' : chatStore.totalUnreadCount }}
            </span>
          </router-link>

          <!-- Availability Switch (Online / Offline Toggle) -->
          <button
            type="button"
            class="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold"
            :class="
              isAvailable
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-ink-100 border-ink-200 text-ink-600'
            "
            @click="toggleAvailability"
          >
            <span
              class="w-2 h-2 rounded-full transition-colors"
              :class="isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-ink-400'"
            />
            <span class="hidden sm:inline">{{ isAvailable ? 'Đang nhận việc' : 'Tạm nghỉ' }}</span>
          </button>

          <!-- Avatar Dropdown Menu -->
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1.5 p-1 rounded-2xl hover:bg-ink-100 transition-colors"
              @click="avatarMenuOpen = !avatarMenuOpen"
            >
              <div class="w-9 h-9 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center text-xs shadow-xs overflow-hidden">
                <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
                <span v-else>{{ userInitial }}</span>
              </div>
              <ChevronDown :size="15" class="text-ink-400 hidden sm:block" />
            </button>

            <!-- Dropdown Menu -->
            <div
              v-if="avatarMenuOpen"
              class="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-ink-200 shadow-lg py-2 z-50 divide-y divide-ink-100 text-xs"
              @click="avatarMenuOpen = false"
            >
              <div class="px-4 py-3">
                <p class="font-bold text-ink-900 truncate">{{ authStore.user?.fullName || 'Kỹ thuật viên' }}</p>
                <p class="text-[11px] text-ink-500 font-medium">Kỹ thuật viên FixHome</p>
              </div>

              <div class="py-1 text-ink-700 font-semibold">
                <router-link to="/tech/profile" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 hover:text-brand-600">
                  <User :size="15" />
                  Hồ sơ thợ & Kỹ năng
                </router-link>
                <router-link to="/tech/kyc" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 hover:text-brand-600">
                  <ShieldCheck :size="15" />
                  Xác minh danh tính (KYC)
                </router-link>
              </div>

              <div class="py-1">
                <button
                  type="button"
                  class="flex items-center gap-2.5 px-4 py-2 text-rose-600 hover:bg-rose-50 w-full text-left font-bold"
                  @click="handleLogout"
                >
                  <LogOut :size="15" />
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <router-view />
    </main>

    <!-- Mobile Bottom Navigation Bar (Matching Mobile App Experience) -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-ink-200 flex items-center justify-around py-2 px-1 shadow-lg">
      <router-link
        to="/tech"
        class="flex flex-col items-center gap-0.5 text-[10px] font-bold text-ink-500 py-1 px-2.5 rounded-xl transition-all"
        active-class="text-brand-600"
        exact-active-class="text-brand-600"
      >
        <Briefcase :size="18" />
        <span>Tổng quan</span>
      </router-link>

      <router-link
        to="/tech/jobs"
        class="flex flex-col items-center gap-0.5 text-[10px] font-bold text-ink-500 py-1 px-2.5 rounded-xl transition-all relative"
        active-class="text-brand-600"
      >
        <Wrench :size="18" />
        <span>Công việc</span>
        <span
          v-if="activeJobs > 0"
          class="absolute top-0 right-2 w-2 h-2 rounded-full bg-brand-600"
        />
      </router-link>

      <router-link
        to="/tech/invitations"
        class="flex flex-col items-center gap-0.5 text-[10px] font-bold text-ink-500 py-1 px-2.5 rounded-xl transition-all relative"
        active-class="text-brand-600"
      >
        <Inbox :size="18" />
        <span>Thư mời</span>
        <span
          v-if="invitationCount > 0"
          class="absolute top-0 right-2 w-2 h-2 rounded-full bg-amber-500"
        />
      </router-link>

      <router-link
        to="/tech/earnings"
        class="flex flex-col items-center gap-0.5 text-[10px] font-bold text-ink-500 py-1 px-2.5 rounded-xl transition-all"
        active-class="text-brand-600"
      >
        <DollarSign :size="18" />
        <span>Thu nhập</span>
      </router-link>

      <router-link
        to="/tech/profile"
        class="flex flex-col items-center gap-0.5 text-[10px] font-bold text-ink-500 py-1 px-2.5 rounded-xl transition-all"
        active-class="text-brand-600"
      >
        <User :size="18" />
        <span>Hồ sơ</span>
      </router-link>
    </nav>

    <!-- Global Floating Chat Widget -->
    <ChatFloatingWidget />
  </div>
</template>
