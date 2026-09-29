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
  Wallet,
  Loader2,
  ShieldAlert,
} from 'lucide-vue-next';

import { ChatFloatingWidget } from '../components';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import { ordersApi } from '../api/orders.api';
import { bookingsApi } from '../api/bookings.api';
import { technicianProfileApi } from '../api/technician-profile.api';
import { technicianOnboardingApi } from '../api/technician-onboarding.api';
import { toast } from 'vue-sonner';

const authStore = useAuthStore();
const chatStore = useChatStore();
const isAvailable = ref(true);
const togglingAvailability = ref(false);
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

const loadAvailability = async () => {
  try {
    const profile = await technicianProfileApi.getMyProfile();
    if (profile && typeof profile.isAvailable === 'boolean') {
      isAvailable.value = profile.isAvailable;
    }
  } catch {
    // fallback to current
  }
};

const onboardingStatus = ref<string | null>(null);
const verificationStatus = ref<string | null>(null);

const loadOnboardingStatus = async () => {
  try {
    const res = await technicianOnboardingApi.getStatus();
    onboardingStatus.value = res.onboardingStatus;
    verificationStatus.value = res.verificationStatus || null;
  } catch {
    onboardingStatus.value = null;
    verificationStatus.value = null;
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
  await Promise.all([refreshInvitationCount(), loadAvailability(), loadOnboardingStatus()]);
  invitationPoll = setInterval(refreshInvitationCount, 30000);
});

onUnmounted(() => {
  if (invitationPoll) clearInterval(invitationPoll);
});

const toggleAvailability = async () => {
  if (togglingAvailability.value) return;
  togglingAvailability.value = true;
  const next = !isAvailable.value;
  try {
    await technicianProfileApi.updateMyProfile({ isAvailable: next });
    isAvailable.value = next;
    toast.success(next ? 'Đã bật trạng thái nhận việc' : 'Đã chuyển sang trạng thái tạm nghỉ');
  } catch {
    toast.error('Không thể cập nhật trạng thái nhận việc');
  } finally {
    togglingAvailability.value = false;
  }
};

const handleLogout = async () => {
  await authStore.logout();
  window.location.href = '/login';
};

const userInitial = computed(() => {
  return authStore.user?.fullName?.charAt(0)?.toUpperCase() || 'T';
});

const userShortName = computed(() => {
  const parts = authStore.user?.fullName?.trim().split(/\s+/) || [];
  return parts.length > 0 ? parts[parts.length - 1] : 'Thợ';
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-ink-50/50 text-ink-900 pb-16 md:pb-0">
    <!-- Top Navigation Bar (Sleek SaaS Standard) -->
    <header class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-ink-200/80 shadow-xs">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <!-- Left: Logo + Desktop Navigation -->
        <div class="flex items-center gap-6 lg:gap-8 min-w-0">
          <!-- Logo & Brand Tagline -->
          <router-link to="/" class="inline-flex items-center gap-2.5 shrink-0 group">
            <img
              src="/logo.png"
              alt="FixHome"
              class="w-9 h-9 object-contain rounded-xl shadow-xs group-hover:scale-105 transition-transform"
            />
            <div class="flex flex-col">
              <div class="text-lg font-extrabold tracking-tight leading-none">
                <span class="text-brand-600">Fix</span><span class="text-emerald-600">Home</span>
              </div>
              <span class="inline-block text-[9px] font-extrabold text-brand-700 tracking-wider uppercase mt-0.5">
                Kỹ thuật viên
              </span>
            </div>
          </router-link>

          <!-- Desktop Navigation Links (Primary Work Hub) -->
          <nav class="hidden md:flex items-center gap-1 lg:gap-1.5 text-xs lg:text-[13px] font-semibold text-ink-600">
            <router-link
              to="/tech"
              class="px-3 py-2 rounded-xl hover:bg-ink-100/80 hover:text-ink-900 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border border-transparent"
              active-class="bg-brand-50 text-brand-700 font-bold border-brand-200/60 shadow-2xs"
              exact-active-class="bg-brand-50 text-brand-700 font-bold border-brand-200/60 shadow-2xs"
            >
              <Briefcase :size="16" />
              <span>Tổng quan</span>
            </router-link>

            <router-link
              to="/tech/jobs"
              class="px-3 py-2 rounded-xl hover:bg-ink-100/80 hover:text-ink-900 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border border-transparent"
              active-class="bg-brand-50 text-brand-700 font-bold border-brand-200/60 shadow-2xs"
            >
              <Wrench :size="16" />
              <span>Đơn nhận việc</span>
              <span
                v-if="activeJobs > 0"
                class="px-1.5 py-0.5 min-w-4 text-[10px] font-bold rounded-full bg-brand-600 text-white font-num leading-none text-center shadow-xs"
              >
                {{ activeJobs }}
              </span>
            </router-link>

            <router-link
              to="/tech/invitations"
              class="px-3 py-2 rounded-xl hover:bg-ink-100/80 hover:text-ink-900 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border border-transparent"
              active-class="bg-brand-50 text-brand-700 font-bold border-brand-200/60 shadow-2xs"
            >
              <Inbox :size="16" />
              <span>Hộp thư mời</span>
              <span
                v-if="invitationCount > 0"
                class="px-1.5 py-0.5 min-w-4 text-[10px] font-bold rounded-full bg-amber-500 text-white font-num leading-none text-center shadow-xs"
              >
                {{ invitationCount }}
              </span>
            </router-link>

            <router-link
              to="/tech/earnings"
              class="px-3 py-2 rounded-xl hover:bg-ink-100/80 hover:text-ink-900 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border border-transparent"
              active-class="bg-brand-50 text-brand-700 font-bold border-brand-200/60 shadow-2xs"
            >
              <DollarSign :size="16" />
              <span>Thu nhập</span>
            </router-link>

            <router-link
              to="/tech/wallet"
              class="px-3 py-2 rounded-xl hover:bg-ink-100/80 hover:text-ink-900 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border border-transparent"
              active-class="bg-brand-50 text-brand-700 font-bold border-brand-200/60 shadow-2xs"
            >
              <Wallet :size="16" />
              <span>Ví thợ</span>
            </router-link>
          </nav>
        </div>

        <!-- Right: Utility Cluster (Chat, Notifications, Availability & Profile) -->
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <!-- Chat shortcut with unread badge -->
          <router-link
            to="/tech/messages"
            class="relative w-9 h-9 rounded-xl bg-ink-100/70 hover:bg-ink-200/80 text-ink-700 hover:text-brand-600 flex items-center justify-center transition-colors border border-ink-200/50"
            title="Trò chuyện với khách hàng"
            active-class="bg-brand-50 text-brand-600 border-brand-200"
          >
            <MessageSquare :size="18" />
            <span
              v-if="chatStore.totalUnreadCount > 0"
              class="absolute -top-1 -right-1 px-1.5 min-w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white leading-none font-num shadow-xs"
            >
              {{ chatStore.totalUnreadCount > 9 ? '9+' : chatStore.totalUnreadCount }}
            </span>
          </router-link>

          <!-- Notification Bell Dropdown -->
          <NotificationBellDropdown />

          <!-- Availability Switch (Online / Offline Toggle) -->
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-xs font-semibold whitespace-nowrap shadow-2xs"
            :class="
              isAvailable
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80'
                : 'bg-ink-100 border-ink-200 text-ink-600 hover:bg-ink-200/70'
            "
            :disabled="togglingAvailability"
            @click="toggleAvailability"
            :title="isAvailable ? 'Đang sẵn sàng nhận đơn mới (Nhấn để tạm nghỉ)' : 'Đang tạm nghỉ (Nhấn để nhận việc)'"
          >
            <Loader2 v-if="togglingAvailability" :size="10" class="animate-spin text-ink-500" />
            <span
              v-else
              class="w-2 h-2 rounded-full transition-all"
              :class="isAvailable ? 'bg-emerald-500 animate-pulse ring-2 ring-emerald-300/50' : 'bg-ink-400'"
            />
            <span class="hidden sm:inline">{{ isAvailable ? 'Đang nhận việc' : 'Tạm nghỉ' }}</span>
          </button>

          <!-- Avatar Dropdown Menu -->
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-2 p-1 pl-1 sm:pr-2.5 rounded-full hover:bg-ink-100 transition-colors border border-transparent hover:border-ink-200"
              @click="avatarMenuOpen = !avatarMenuOpen"
            >
              <div class="relative w-8 h-8 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-xs shadow-xs overflow-hidden shrink-0">
                <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
                <span v-else>{{ userInitial }}</span>
              </div>
              <span class="hidden lg:inline text-xs font-bold text-ink-800 max-w-[100px] truncate">
                {{ userShortName }}
              </span>
              <ChevronDown :size="14" class="text-ink-400 hidden sm:block" />
            </button>

            <!-- Backdrop to close dropdown -->
            <div
              v-if="avatarMenuOpen"
              class="fixed inset-0 z-40"
              @click="avatarMenuOpen = false"
            />

            <!-- Dropdown Menu -->
            <div
              v-if="avatarMenuOpen"
              class="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-ink-200 shadow-xl py-2 z-50 divide-y divide-ink-100 text-xs"
              @click="avatarMenuOpen = false"
            >
              <div class="px-4 py-3">
                <p class="font-bold text-ink-900 truncate">{{ authStore.user?.fullName || 'Kỹ thuật viên' }}</p>
                <p class="text-[11px] text-ink-500 font-medium">Kỹ thuật viên FixHome</p>
              </div>

              <div class="py-1 text-ink-700 font-semibold">
                <router-link to="/tech/wallet" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 hover:text-brand-600 transition-colors">
                  <Wallet :size="15" />
                  Ví thợ & Rút tiền
                </router-link>
                <router-link to="/tech/profile" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 hover:text-brand-600 transition-colors">
                  <User :size="15" />
                  Hồ sơ thợ & Kỹ năng
                </router-link>
                <router-link to="/tech/kyc" class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 hover:text-brand-600 transition-colors">
                  <ShieldCheck :size="15" />
                  Xác minh danh tính (KYC)
                </router-link>
              </div>

              <div class="py-1">
                <button
                  type="button"
                  class="flex items-center gap-2.5 px-4 py-2 text-rose-600 hover:bg-rose-50 w-full text-left font-bold transition-colors"
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

    <!-- Onboarding status banner if not approved -->
    <div
      v-if="onboardingStatus && onboardingStatus !== 'approved' && verificationStatus !== 'verified'"
      class="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white px-4 py-3 shadow-xs"
    >
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2.5">
          <ShieldAlert :size="18" class="shrink-0 text-amber-100" />
          <span>
            Hồ sơ thợ của bạn đang ở trạng thái
            <strong class="uppercase font-black tracking-wide text-amber-100">
              {{
                onboardingStatus === 'submitted'
                  ? 'Chờ xét duyệt'
                  : onboardingStatus === 'rejected'
                  ? 'Cần bổ sung'
                  : 'Chưa hoàn tất'
              }}
            </strong>.
            Vui lòng hoàn tất xác thực thông tin, CCCD và kỹ năng để nhận đơn sửa chữa.
          </span>
        </div>
        <router-link
          to="/tech/onboarding"
          class="shrink-0 px-3.5 py-1.5 bg-white text-amber-950 font-bold rounded-xl hover:bg-amber-50 transition-colors shadow-2xs whitespace-nowrap"
        >
          Hoàn tất hồ sơ thợ →
        </router-link>
      </div>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
          class="absolute top-0 right-2 w-2 h-2 rounded-full bg-brand-600 ring-2 ring-white"
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
          class="absolute top-0 right-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white"
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
