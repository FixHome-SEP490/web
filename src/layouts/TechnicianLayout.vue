<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat.store';
import {
  Wrench,
  Inbox,
  LayoutDashboard,
  Banknote,
  LogOut,
  User,
  ShieldCheck,
  ChevronDown,
  MessageSquare,
  Wallet,
  Loader2,
  ShieldAlert,
  BadgeCheck,
  ChevronRight,
} from 'lucide-vue-next';

import { ChatFloatingWidget } from '../components';
import CallOverlay from '../components/chat/CallOverlay.vue';
import { useCallStore } from '../stores/call.store';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import { ordersApi } from '../api/orders.api';
import { bookingsApi } from '../api/bookings.api';
import { technicianProfileApi } from '../api/technician-profile.api';
import { technicianOnboardingApi } from '../api/technician-onboarding.api';
import { walletApi, type WalletSummary } from '../api/wallet.api';
import { toast } from 'vue-sonner';

const authStore = useAuthStore();
const chatStore = useChatStore();
const callStore = useCallStore();
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

const walletSummary = ref<WalletSummary | null>(null);

const loadWalletSummary = async () => {
  try {
    walletSummary.value = await walletApi.getMyWallet();
  } catch {
    walletSummary.value = null;
  }
};

let invitationPoll: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  chatStore.initSocket();
  // A technician must be reachable by voice from any screen, not only the chat.
  callStore.initCallSignalling();
  try {
    const jobs = await ordersApi.getTechnicianJobs();
    const active = jobs.filter((j) =>
      ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(j.status).toUpperCase())
    );
    activeJobs.value = active.length;
  } catch {
    // ignore
  }
  await Promise.all([refreshInvitationCount(), loadAvailability(), loadOnboardingStatus(), loadWalletSummary()]);
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

const unread = computed(() => (chatStore.totalUnreadCount > 99 ? '99+' : String(chatStore.totalUnreadCount)));

/** Rejected profiles are blocked until fixed (red); pending ones only wait (yellow). */
const onboardingBanner = computed(() => {
  if (!onboardingStatus.value || onboardingStatus.value === 'approved' || verificationStatus.value === 'verified') {
    return null;
  }
  if (onboardingStatus.value === 'rejected') {
    return { tone: 'alert' as const, state: 'Cần bổ sung' };
  }
  return { tone: 'note' as const, state: onboardingStatus.value === 'submitted' ? 'Chờ xét duyệt' : 'Chưa hoàn tất' };
});

type NavItem = { to: string; label: string; icon: typeof Wrench; exact?: boolean; badge?: () => string | null };

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Công việc',
    items: [
      { to: '/tech', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
      {
        to: '/tech/invitations',
        label: 'Lời mời nhận việc',
        icon: Inbox,
        badge: () => (invitationCount.value > 0 ? String(invitationCount.value) : null),
      },
      {
        to: '/tech/jobs',
        label: 'Công việc',
        icon: Wrench,
        badge: () => (activeJobs.value > 0 ? String(activeJobs.value) : null),
      },
      { to: '/tech/warranty', label: 'Bảo hành', icon: ShieldCheck },
    ],
  },
  {
    title: 'Tài chính',
    items: [
      { to: '/tech/earnings', label: 'Thu nhập', icon: Banknote },
      { to: '/tech/wallet', label: 'Ví của tôi', icon: Wallet },
    ],
  },
  {
    title: 'Liên lạc',
    items: [
      {
        to: '/tech/messages',
        label: 'Tin nhắn',
        icon: MessageSquare,
        badge: () => (chatStore.totalUnreadCount > 0 ? unread.value : null),
      },
    ],
  },
  {
    title: 'Tài khoản',
    items: [
      { to: '/tech/profile', label: 'Hồ sơ kỹ thuật viên', icon: User },
      { to: '/tech/kyc', label: 'Xác minh danh tính', icon: BadgeCheck },
    ],
  },
];

/** Bottom tabs below lg, the same five the mobile app shows first. */
const tabItems: NavItem[] = [
  { to: '/tech', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
  { to: '/tech/jobs', label: 'Công việc', icon: Wrench, badge: () => (activeJobs.value > 0 ? '' : null) },
  { to: '/tech/invitations', label: 'Thư mời', icon: Inbox, badge: () => (invitationCount.value > 0 ? '' : null) },
  { to: '/tech/earnings', label: 'Thu nhập', icon: Banknote },
  { to: '/tech/profile', label: 'Hồ sơ', icon: User },
];
</script>

<template>
  <!-- --fh-dock lifts floating buttons above the bottom tab bar on narrow screens. -->
  <div class="min-h-screen bg-ink-50 text-ink-900 [--fh-dock:5.25rem] lg:[--fh-dock:1.25rem]">
    <!-- Sidebar, wide screens -->
    <aside class="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col bg-white border-r border-ink-200">
      <router-link to="/" class="h-16 px-5 flex items-center gap-2.5 border-b border-ink-100 shrink-0" aria-label="FixHome - Trang chủ">
        <img src="/logo.png" alt="" class="w-9 h-9 object-contain rounded-xl" />
        <span class="flex flex-col leading-tight">
          <span class="text-lg font-bold tracking-tight whitespace-nowrap"><span class="text-brand-600">Fix</span><span class="text-success-600">Home</span></span>
          <span class="text-xs text-ink-500 whitespace-nowrap">Kỹ thuật viên</span>
        </span>
      </router-link>

      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Điều hướng chính">
        <div v-for="group in navGroups" :key="group.title">
          <p class="px-3 mb-1.5 text-xs font-medium text-ink-400">{{ group.title }}</p>
          <div class="space-y-0.5">
            <router-link
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="h-10 px-3 rounded-xl flex items-center gap-3 text-sm font-medium text-ink-600 whitespace-nowrap hover:bg-ink-50 hover:text-ink-900 transition-colors"
              :active-class="item.exact ? '' : 'bg-brand-50 text-brand-700 font-semibold'"
              :exact-active-class="item.exact ? 'bg-brand-50 text-brand-700 font-semibold' : ''"
            >
              <component :is="item.icon" :size="18" :stroke-width="1.75" class="shrink-0" />
              <span class="flex-1 truncate">{{ item.label }}</span>
              <span
                v-if="item.badge && item.badge()"
                class="min-w-5 h-5 px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-semibold font-num inline-flex items-center justify-center"
              >
                {{ item.badge() }}
              </span>
            </router-link>
          </div>
        </div>
      </nav>

      <div class="p-3 border-t border-ink-100 shrink-0">
        <button
          type="button"
          class="w-full h-10 px-3 rounded-xl flex items-center gap-3 text-sm font-medium text-danger-600 hover:bg-danger-50 transition-colors whitespace-nowrap"
          @click="handleLogout"
        >
          <LogOut :size="18" :stroke-width="1.75" />
          Đăng xuất
        </button>
      </div>
    </aside>

    <div class="lg:pl-64 min-h-screen flex flex-col">
      <header class="sticky top-0 z-20 bg-white border-b border-ink-200">
        <div class="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <!-- Logo only when the sidebar is hidden -->
          <router-link to="/" class="lg:hidden inline-flex items-center gap-2 shrink-0" aria-label="FixHome - Trang chủ">
            <img src="/logo.png" alt="" class="w-8 h-8 object-contain rounded-lg" />
            <span class="text-lg font-bold tracking-tight whitespace-nowrap hidden sm:inline"><span class="text-brand-600">Fix</span><span class="text-success-600">Home</span></span>
          </router-link>
          <div class="hidden lg:block" />

          <div class="flex items-center gap-2 sm:gap-3 shrink-0">
            <!-- Messages live in the sidebar on wide screens -->
            <router-link
              to="/tech/messages"
              class="lg:hidden relative w-10 h-10 rounded-xl text-ink-600 hover:bg-ink-100 flex items-center justify-center transition-colors"
              aria-label="Tin nhắn với khách hàng"
              active-class="bg-brand-50 text-brand-700"
            >
              <MessageSquare :size="20" :stroke-width="1.75" />
              <span
                v-if="chatStore.totalUnreadCount > 0"
                class="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-danger-600 text-white text-[10px] font-semibold font-num inline-flex items-center justify-center"
              >
                {{ unread }}
              </span>
            </router-link>

            <NotificationBellDropdown />

            <button
              type="button"
              class="h-9 px-3 rounded-full border flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors"
              :class="
                isAvailable
                  ? 'bg-success-50 border-success-200 text-success-700 hover:bg-success-100'
                  : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'
              "
              :disabled="togglingAvailability"
              :title="isAvailable ? 'Đang sẵn sàng nhận đơn mới (Nhấn để tạm nghỉ)' : 'Đang tạm nghỉ (Nhấn để nhận việc)'"
              @click="toggleAvailability"
            >
              <Loader2 v-if="togglingAvailability" :size="14" class="animate-spin" />
              <span v-else class="w-2 h-2 rounded-full" :class="isAvailable ? 'bg-success-500' : 'bg-ink-400'" />
              <span class="hidden min-[360px]:inline">{{ isAvailable ? 'Đang nhận việc' : 'Tạm nghỉ' }}</span>
            </button>

            <div class="relative">
              <button
                type="button"
                class="flex items-center gap-2 p-1 sm:pr-2 rounded-full hover:bg-ink-100 transition-colors"
                aria-label="Tài khoản"
                :aria-expanded="avatarMenuOpen"
                @click="avatarMenuOpen = !avatarMenuOpen"
              >
                <span class="w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-100 font-semibold flex items-center justify-center text-sm overflow-hidden shrink-0">
                  <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-full h-full object-cover" />
                  <span v-else>{{ userInitial }}</span>
                </span>
                <span class="hidden xl:inline text-sm font-medium text-ink-800 max-w-32 truncate">{{ userShortName }}</span>
                <ChevronDown :size="16" class="text-ink-400 hidden sm:block" />
              </button>

              <div v-if="avatarMenuOpen" class="fixed inset-0 z-40" @click="avatarMenuOpen = false" />

              <div
                v-if="avatarMenuOpen"
                class="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) py-2 z-50 divide-y divide-ink-100 text-sm"
                @click="avatarMenuOpen = false"
              >
                <div class="px-4 py-2.5">
                  <p class="font-semibold text-ink-900 truncate">{{ authStore.user?.fullName || 'Kỹ thuật viên' }}</p>
                  <p class="text-xs text-ink-500">Kỹ thuật viên FixHome</p>
                </div>

                <div class="py-1 text-ink-700">
                  <router-link to="/tech/wallet" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <Wallet :size="16" class="text-ink-500" />
                    Ví & Rút tiền
                  </router-link>
                  <router-link to="/tech/profile" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <User :size="16" class="text-ink-500" />
                    Hồ sơ & Kỹ năng
                  </router-link>
                  <router-link to="/tech/kyc" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <BadgeCheck :size="16" class="text-ink-500" />
                    Xác minh danh tính
                  </router-link>
                  <router-link to="/tech/warranty" class="flex lg:hidden items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <ShieldCheck :size="16" class="text-ink-500" />
                    Bảo hành
                  </router-link>
                  <router-link to="/tech/messages" class="flex lg:hidden items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <MessageSquare :size="16" class="text-ink-500" />
                    Tin nhắn
                  </router-link>
                </div>

                <div class="py-1">
                  <button
                    type="button"
                    class="flex items-center gap-3 px-4 py-2.5 text-danger-600 hover:bg-danger-50 w-full text-left"
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

      <!-- Profile not approved yet: waiting is a note (yellow), rejected is an alert (red). -->
      <div
        v-if="onboardingBanner"
        class="border-b px-4 sm:px-6 lg:px-8 py-3"
        :class="onboardingBanner.tone === 'alert' ? 'bg-danger-50 border-danger-200' : 'bg-warning-50 border-warning-200'"
        :role="onboardingBanner.tone === 'alert' ? 'alert' : 'status'"
      >
        <div class="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <p
            class="flex items-start gap-2.5 text-pretty"
            :class="onboardingBanner.tone === 'alert' ? 'text-danger-700' : 'text-warning-800'"
          >
            <ShieldAlert :size="18" class="shrink-0 mt-0.5" :class="onboardingBanner.tone === 'alert' ? 'text-danger-600' : 'text-warning-600'" />
            <span>
              Hồ sơ kỹ thuật viên của bạn đang ở trạng thái
              <strong class="font-semibold whitespace-nowrap">{{ onboardingBanner.state }}</strong>.
              Vui lòng hoàn tất thông tin, CCCD và kỹ năng để nhận đơn sửa chữa.
            </span>
          </p>
          <router-link
            to="/tech/onboarding"
            class="shrink-0 h-9 px-4 inline-flex items-center gap-1 rounded-xl bg-white border text-sm font-semibold whitespace-nowrap transition-colors"
            :class="onboardingBanner.tone === 'alert' ? 'border-danger-200 text-danger-700 hover:bg-danger-100' : 'border-warning-200 text-warning-800 hover:bg-warning-100'"
          >
            Hoàn tất hồ sơ
            <ChevronRight :size="16" />
          </router-link>
        </div>
      </div>

      <main class="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-28 lg:pb-10">
        <router-view />
      </main>
    </div>

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
            v-if="item.badge && item.badge() !== null"
            class="absolute top-2.5 left-1/2 ml-2.5 w-2 h-2 rounded-full bg-brand-600 ring-2 ring-white"
          />
        </router-link>
      </div>
    </div>

    <!-- Deposit required banner when approved but wallet balance is below minimum -->
    <div
      v-else-if="(onboardingStatus === 'approved' || verificationStatus === 'verified') && walletSummary && !walletSummary.eligibleForJobs"
      class="bg-gradient-to-r from-blue-600 via-indigo-600 to-brand-700 text-white px-4 py-3 shadow-xs"
    >
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2.5">
          <Wallet :size="18" class="shrink-0 text-blue-200" />
          <span>
            Hồ sơ thợ đã được duyệt! Số dư ví hiện tại là <strong>{{ Number(walletSummary.balance).toLocaleString('vi-VN') }} ₫</strong>.
            Vui lòng nạp tối thiểu <strong>{{ Number(walletSummary.minimumBalance).toLocaleString('vi-VN') }} ₫</strong> vào ví ký quỹ để đủ điều kiện tiếp nhận đơn sửa chữa mới.
          </span>
        </div>
        <router-link
          to="/tech/wallet"
          class="shrink-0 px-3.5 py-1.5 bg-white text-blue-900 font-bold rounded-xl hover:bg-blue-50 transition-colors shadow-2xs whitespace-nowrap flex items-center gap-1.5"
        >
          <span>Nạp tiền vào ví ngay</span>
          <span>→</span>
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

    <ChatFloatingWidget />
    <CallOverlay />
  </div>
</template>
