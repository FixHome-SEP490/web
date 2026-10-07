<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import {
  Wrench,
  Clock,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  Star,
  Briefcase,
  Calendar,
  MessageSquare,
  Phone,
  RefreshCw,
  Navigation,
  Package,
  Sparkles,
  Check,
  Radio,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Inbox,
  Camera,
  Loader2,
  Info,
} from 'lucide-vue-next';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

import {
  FhButton,
  FhStatusPill,
  FhCountdown,
} from '../../components';
import { ordersApi, isHistoricalOrder, type ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';
import { technicianOnboardingApi } from '../../api/technician-onboarding.api';
import { hasRating, ratingLabel } from '../../utils/formatters';
import { addDaysToKey, vnDayKey, weekdayOfKey } from '../../utils/vn-time';
import { walletApi, type WalletSummary } from '../../api/wallet.api';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const loading = ref(true);
const refreshing = ref(false);
const jobs = ref<ServiceOrderItem[]>([]);
const isAvailable = ref<boolean | null>(null);
const profile = ref<TechnicianProfileView | null>(null);
const invitations = ref<InvitationItem[]>([]);
const wallet = ref<WalletSummary | null>(null);
const decliningInvitation = ref(false);
const acceptingInvitation = ref(false);
const togglingAvailability = ref(false);

const topInvitation = computed(() => invitations.value[0] ?? null);

const loadWallet = async () => {
  try {
    wallet.value = await walletApi.getMyWallet();
  } catch {
    wallet.value = null;
  }
};

const loadInvitations = async () => {
  try {
    invitations.value = await bookingsApi.getMyInvitations();
  } catch {
    invitations.value = [];
  }
};

const declineTopInvitation = async () => {
  const inv = topInvitation.value;
  if (!inv) return;
  decliningInvitation.value = true;
  try {
    await bookingsApi.respondInvitation(inv.id, 'DECLINE');
    invitations.value = invitations.value.filter((i) => i.id !== inv.id);
  } catch {
    // ignore, banner will refresh on next mount/poll
  } finally {
    decliningInvitation.value = false;
  }
};

const handleAcceptTopInvitation = async () => {
  const inv = topInvitation.value;
  if (!inv) return;
  acceptingInvitation.value = true;
  try {
    const result = await bookingsApi.respondInvitation(inv.id, 'ACCEPT');
    invitations.value = invitations.value.filter((i) => i.id !== inv.id);
    if (result?.serviceOrderId) {
      await router.push(`/tech/jobs/${result.serviceOrderId}`);
    } else {
      await router.push('/tech/jobs');
    }
  } catch {
    alert('Không thể nhận đơn lúc này. Vui lòng kiểm tra lại danh sách công việc.');
  } finally {
    acceptingInvitation.value = false;
  }
};

const toggleAvailability = async () => {
  if (isAvailable.value === null || togglingAvailability.value) return;
  if (!isAvailable.value && wallet.value && !wallet.value.eligibleForJobs) {
    toast.error('Chưa đủ điều kiện nhận việc', {
      description: `Số dư ví hiện tại (${wallet.value.balance.toLocaleString('vi-VN')} ₫) chưa đạt mức ký quỹ tối thiểu (${wallet.value.minimumBalance.toLocaleString('vi-VN')} ₫). Vui lòng nạp tiền vào ví trước khi bật trạng thái nhận việc.`,
      action: {
        label: 'Nạp tiền ngay',
        onClick: () => router.push('/tech/wallet'),
      },
    });
    return;
  }
  togglingAvailability.value = true;
  const newStatus = !isAvailable.value;
  try {
    if (technicianProfileApi.updateMyProfile) {
      await technicianProfileApi.updateMyProfile({ isAvailable: newStatus });
    }
    isAvailable.value = newStatus;
  } catch {
    // If update fails, revert
  } finally {
    togglingAvailability.value = false;
  }
};

const identityVerified = ref(false);

const loadVerification = async () => {
  try {
    const status = await technicianOnboardingApi.getStatus();
    identityVerified.value = status.verificationStatus === 'verified' || status.onboardingStatus === 'approved';
  } catch {
    identityVerified.value = false;
  }
};

const loadData = async () => {
  const verificationRequest = loadVerification();
  const profileRequest = technicianProfileApi.getMyProfile()
    .then((p) => {
      profile.value = p;
      isAvailable.value = p.isAvailable;
    })
    .catch(() => {
      profile.value = null;
      isAvailable.value = null;
    });

  try {
    const list = await ordersApi.getTechnicianJobs();
    jobs.value = list.filter((item): item is ServiceOrderItem => !isHistoricalOrder(item));
  } catch {
    jobs.value = [];
  } finally {
    loading.value = false;
  }

  await loadInvitations();
  await loadWallet();
  await profileRequest;
  await verificationRequest;
};

const handleRefresh = async () => {
  refreshing.value = true;
  await loadData();
  refreshing.value = false;
};

onMounted(async () => {
  await loadData();
});

const completedJobs = computed(() => {
  return jobs.value.filter((j) => String(j.status).toUpperCase() === 'COMPLETED');
});

const activeJobs = computed(() => {
  return jobs.value.filter((j) =>
    ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(j.status).toUpperCase())
  );
});

const enRouteJobs = computed(() => {
  return jobs.value.filter((j) => String(j.status).toUpperCase() === 'EN_ROUTE');
});

const underRepairJobs = computed(() => {
  return jobs.value.filter((j) =>
    ['UNDER_REPAIR', 'IN_PROGRESS'].includes(String(j.status).toUpperCase())
  );
});

const totalEarnings = computed(() => {
  return completedJobs.value.reduce((sum, j) => sum + (j.laborTotal || j.grandTotal || 0), 0);
});

const completedCount = computed(() => {
  const today = vnDayKey();
  const monday = addDaysToKey(today, -((weekdayOfKey(today) + 6) % 7));
  return completedJobs.value.filter((job) => job.completedAt && vnDayKey(job.completedAt) >= monday).length;
});

const handleChatWithCustomer = async (order: ServiceOrderItem) => {
  const bookingId = order.bookingId || order.id;
  await chatStore.openConversationForBooking(bookingId);
  chatStore.toggleWidget(true);
};

const getMapUrl = (address: string) => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

const formatScheduledTime = (dateStr?: string) => {
  if (!dateStr) return 'Linh hoạt';
  try {
    return vnDateTimeString(dateStr, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return dateStr;
  }
};

const currentDateFormatted = computed(() =>
  vnDateString(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
);

/** 1.250.000 ₫, with a non-breaking space so the unit never wraps away. */
const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')}\u00A0₫`;

const isOneOf = (job: ServiceOrderItem, statuses: string[]) => statuses.includes(String(job.status).toUpperCase());

/** Done steps are green, the current one blue, the rest neutral. */
const stepClass = (done: boolean | undefined, current: boolean) =>
  done ? 'bg-success-50 text-success-700' : current ? 'bg-brand-50 text-brand-700 font-medium' : 'bg-ink-50 text-ink-500';

const shortcuts = [
  { title: 'Vật tư & Linh kiện thay thế', hint: 'Báo giá và yêu cầu cấp phụ tùng sửa chữa', icon: Package, to: '/tech/jobs' },
  { title: 'Lịch ca trực & Xin nghỉ phép', hint: 'Cài đặt giờ nhận việc và ngày bận', icon: Calendar, to: '/tech/profile' },
  { title: 'Kỹ năng & Đơn giá nhân công', hint: 'Cập nhật dịch vụ nhận sửa & giá niêm yết', icon: Wrench, to: '/tech/profile' },
  { title: 'Ví thu nhập & Rút tiền', hint: 'Xem bảng kê chi tiết và lịch sử chuyển khoản', icon: Wallet, to: '/tech/earnings' },
];
</script>

<template>
  <div class="space-y-6 pb-4">
    <!-- 1. Who is working and whether they take new jobs -->
    <section class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
      <div class="flex items-center gap-4 min-w-0">
        <div class="relative shrink-0">
          <div class="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 text-brand-700 font-semibold flex items-center justify-center text-2xl overflow-hidden">
            <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-full h-full object-cover" />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) || 'T' }}</span>
          </div>
          <!-- Unit test required badge: data-testid="technician-receive-status" -->
          <span
            data-testid="technician-receive-status"
            class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
            :class="isAvailable === true ? 'bg-success-500' : 'bg-ink-400'"
            :title="isAvailable === null ? 'Chưa xác định trạng thái nhận đơn' : isAvailable ? 'Đang nhận đơn mới' : 'Tạm ngưng nhận đơn mới'"
          />
        </div>

        <div class="min-w-0 space-y-1.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm text-ink-500 first-letter:uppercase">{{ currentDateFormatted }}</span>
            <span
              v-if="identityVerified"
              class="inline-flex items-center gap-1 h-6 px-2 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium whitespace-nowrap"
            >
              <ShieldCheck :size="14" />
              Đã xác minh danh tính
            </span>
          </div>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">
            {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
          </h1>
          <div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-ink-600">
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <MapPin :size="15" class="text-ink-400" />
              Bán kính: <strong class="font-semibold text-ink-900 font-num">{{ profile ? `${profile.serviceRadiusKm}\u00A0km` : '—' }}</strong>
            </span>
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Star :size="15" class="text-warning-500 fill-warning-500" />
              Đánh giá: <strong class="font-semibold text-ink-900 font-num">{{ profile && hasRating(profile.averageRating, profile.ratingCount) ? `${ratingLabel(profile.averageRating, profile.ratingCount)}\u00A0★` : 'Chưa có đánh giá' }}</strong>
              <span class="text-ink-400">({{ profile?.ratingCount ?? 0 }})</span>
            </span>
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Sparkles :size="15" class="text-ink-400" />
              Độ tin cậy: <strong class="font-semibold text-success-700 font-num">{{ profile?.reliabilityScore != null ? `${profile.reliabilityScore}%` : '—' }}</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Phones: status and refresh on one row, the two actions side by side below. -->
      <div class="grid grid-cols-[1fr_auto] gap-2.5 sm:flex sm:flex-wrap sm:items-center shrink-0">
        <button
          type="button"
          class="h-11 pl-3 pr-4 rounded-xl border flex items-center gap-2.5 text-left whitespace-nowrap transition-colors"
          :class="
            isAvailable === true
              ? 'bg-success-50 border-success-200 text-success-800 hover:bg-success-100'
              : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
          "
          :disabled="togglingAvailability || isAvailable === null"
          @click="toggleAvailability"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="isAvailable === true ? 'bg-success-500' : 'bg-ink-400'" />
          <span class="flex flex-col leading-tight">
            <span class="text-xs text-ink-500">Trạng thái ca</span>
            <span class="text-sm font-semibold">{{ isAvailable === true ? 'Đang nhận việc' : isAvailable === false ? 'Tạm nghỉ nhận đơn' : 'Đang tải…' }}</span>
          </span>
          <Loader2 v-if="togglingAvailability" :size="16" class="animate-spin" />
        </button>

        <button
          type="button"
          class="w-11 h-11 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-ink-600 flex items-center justify-center transition-colors"
          title="Làm mới dữ liệu"
          aria-label="Làm mới dữ liệu"
          :disabled="refreshing"
          @click="handleRefresh"
        >
          <RefreshCw :size="18" :class="{ 'animate-spin': refreshing }" />
        </button>

        <div class="col-span-2 grid grid-cols-2 gap-2.5 sm:contents">
          <FhButton variant="secondary" size="md" class="w-full sm:w-auto" @click="router.push('/tech/jobs')">
            <Wrench :size="16" /> Việc của tôi
          </FhButton>
          <FhButton variant="primary" size="md" class="w-full sm:w-auto" @click="router.push('/tech/invitations')">
            <Inbox :size="16" /> <span class="sm:hidden">Thư mời</span><span class="hidden sm:inline">Thư mời nhận đơn</span>
            <span
              v-if="invitations.length > 0"
              class="min-w-5 h-5 px-1.5 rounded-full bg-white text-brand-700 text-xs font-semibold font-num inline-flex items-center justify-center"
            >
              {{ invitations.length }}
            </span>
          </FhButton>
        </div>
      </div>
    </section>

    <!-- Below the deposit floor the technician gets no new jobs: an alert, so red. -->
    <div
      v-if="wallet && !wallet.eligibleForJobs"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
      role="alert"
      @click="router.push('/tech/wallet')"
    >
      <p class="flex items-start gap-3 text-sm text-danger-700 text-pretty">
        <AlertTriangle :size="20" class="text-danger-600 shrink-0 mt-0.5" />
        <span>
          <strong class="font-semibold">
            Số dư ví hiện tại ({{ money(wallet.balance) }}) đang thấp hơn mức ký quỹ tối thiểu ({{ money(wallet.minimumBalance) }}).
          </strong>
          Tài khoản tạm dừng nhận lời mời việc mới cho đến khi nạp thêm tiền.
        </span>
      </p>
      <router-link
        to="/tech/wallet"
        class="shrink-0 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
        @click.stop
      >
        Nạp tiền ngay
        <ChevronRight :size="16" />
      </router-link>
    </div>

    <!-- 2. A job offer waiting for an answer -->
    <section
      v-if="topInvitation"
      class="p-5 sm:p-6 rounded-2xl bg-white border border-brand-200 shadow-(--shadow-e1) flex flex-col lg:flex-row lg:items-center justify-between gap-5 cursor-pointer hover:border-brand-300 transition-colors"
      @click="router.push('/tech/invitations')"
    >
      <div class="flex gap-4 min-w-0">
        <div class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          <Inbox :size="22" />
        </div>
        <div class="min-w-0 space-y-1.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold text-brand-700 whitespace-nowrap">Có thư mời nhận đơn mới!</span>
            <FhCountdown :expires-at="topInvitation.expiresAt" />
            <span v-if="invitations.length > 1" class="text-xs font-medium text-ink-600 bg-ink-100 h-6 px-2 rounded-lg inline-flex items-center whitespace-nowrap">
              + {{ invitations.length - 1 }} lời mời khác
            </span>
          </div>
          <h3 class="text-lg font-semibold text-ink-900">
            {{ topInvitation.booking?.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
          </h3>
          <div class="flex flex-col sm:flex-row sm:items-center gap-x-5 gap-y-1 text-sm text-ink-600">
            <span class="flex items-start gap-1.5 min-w-0">
              <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
              <span class="text-pretty">{{ topInvitation.booking?.addressSummary || 'Khu vực địa phương' }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Clock :size="15" class="text-ink-400" />
              Lịch hẹn: <strong class="font-semibold text-ink-900 font-num">{{ formatScheduledTime(topInvitation.booking?.preferredStartAt || topInvitation.booking?.preferredEndAt || undefined) }}</strong>
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2.5 shrink-0">
        <FhButton variant="secondary" size="md" class="flex-1 lg:flex-none whitespace-nowrap" :loading="decliningInvitation" @click.stop="declineTopInvitation">
          Từ chối
        </FhButton>
        <FhButton variant="primary" size="md" class="flex-1 lg:flex-none whitespace-nowrap" :loading="acceptingInvitation" @click.stop="handleAcceptTopInvitation">
          <Check :size="16" />
          Nhận việc ngay
        </FhButton>
      </div>
    </section>

    <!-- 3. The four numbers a technician checks first -->
    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <button type="button" class="text-left bg-white rounded-2xl border border-ink-200 p-5 flex flex-col gap-3 hover:border-ink-300 transition-colors" @click="router.push('/tech/wallet')">
        <span class="flex items-center justify-between text-sm text-ink-500">
          Ví tài khoản
          <Wallet :size="18" class="text-ink-400" />
        </span>
        <span class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap" :class="{ 'text-danger-600': wallet && wallet.balance < 0 }">
          {{ wallet ? money(wallet.balance) : '—' }}
        </span>
        <span v-if="wallet" class="text-sm flex items-center gap-1.5" :class="wallet?.eligibleForJobs ? 'text-success-700' : 'text-danger-600'">
          <CheckCircle2 v-if="wallet?.eligibleForJobs" :size="15" />
          <AlertCircle v-else :size="15" />
          {{ wallet?.eligibleForJobs ? 'Đủ điều kiện nhận việc' : 'Dưới mức ký quỹ' }}
        </span>
        <span class="text-sm text-ink-500">
          Tích lũy hoàn tất: <strong class="font-semibold text-ink-800 font-num whitespace-nowrap">{{ money(totalEarnings) }}</strong>
        </span>
        <span class="mt-auto pt-3 border-t border-ink-100 text-sm font-medium text-brand-600 flex items-center justify-between">
          Vào ví & Nạp / Rút
          <ChevronRight :size="16" />
        </span>
      </button>

      <button type="button" class="text-left bg-white rounded-2xl border border-ink-200 p-5 flex flex-col gap-3 hover:border-ink-300 transition-colors" @click="router.push('/tech/jobs')">
        <span class="flex items-center justify-between text-sm text-ink-500">
          Công việc đang làm
          <Wrench :size="18" class="text-ink-400" />
        </span>
        <span class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          {{ activeJobs.length }} <span class="text-base font-medium text-ink-500 font-sans">đơn</span>
        </span>
        <span class="text-sm text-ink-600">
          {{ enRouteJobs.length }} đang di chuyển · {{ underRepairJobs.length }} đang sửa
        </span>
        <span class="mt-auto pt-3 border-t border-ink-100 text-sm font-medium text-brand-600 flex items-center justify-between">
          Mở danh sách việc
          <ChevronRight :size="16" />
        </span>
      </button>

      <button type="button" class="text-left bg-white rounded-2xl border border-ink-200 p-5 flex flex-col gap-3 hover:border-ink-300 transition-colors" @click="router.push('/tech/earnings')">
        <span class="flex items-center justify-between text-sm text-ink-500">
          Hoàn thành tuần này
          <CheckCircle2 :size="18" class="text-ink-400" />
        </span>
        <span class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          {{ completedCount }} <span class="text-base font-medium text-ink-500 font-sans">đơn</span>
        </span>
        <span class="text-sm text-ink-600">Tính từ thứ Hai tuần này</span>
        <span class="mt-auto pt-3 border-t border-ink-100 text-sm font-medium text-brand-600 flex items-center justify-between">
          Xem thu nhập
          <ChevronRight :size="16" />
        </span>
      </button>

      <button type="button" class="text-left bg-white rounded-2xl border border-ink-200 p-5 flex flex-col gap-3 hover:border-ink-300 transition-colors" @click="router.push('/tech/profile')">
        <span class="flex items-center justify-between text-sm text-ink-500">
          Chỉ số uy tín
          <Star :size="18" class="text-ink-400" />
        </span>
        <span class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          <template v-if="profile && hasRating(profile.averageRating, profile.ratingCount)">
            {{ ratingLabel(profile.averageRating, profile.ratingCount) }}&nbsp;<span class="text-warning-500">★</span>
          </template>
          <span v-else class="text-lg font-medium text-ink-500 font-sans">Chưa có đánh giá</span>
        </span>
        <span class="text-sm text-ink-600">Độ tin cậy: <strong class="font-semibold text-ink-900 font-num">{{ profile?.reliabilityScore != null ? `${profile.reliabilityScore}/100` : '—' }}</strong></span>
        <span class="mt-auto pt-3 border-t border-ink-100 text-sm font-medium text-brand-600 flex items-center justify-between">
          Xem hồ sơ & kỹ năng
          <ChevronRight :size="16" />
        </span>
      </button>
    </section>

    <!-- 4. Work in progress, with the side panel on very wide screens -->
    <div class="grid grid-cols-1 2xl:grid-cols-12 gap-6 items-start">
      <div class="2xl:col-span-8 space-y-6">
        <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
          <header class="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-ink-900 flex items-center gap-2">
              Đơn đang xử lý
              <span class="min-w-6 h-6 px-2 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold font-num inline-flex items-center justify-center">
                {{ activeJobs.length }}
              </span>
            </h2>
            <router-link to="/tech/jobs" class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap">
              Xem tất cả công việc
              <ChevronRight :size="16" />
            </router-link>
          </header>

          <div v-if="activeJobs.length > 0" class="divide-y divide-ink-100">
            <article
              v-for="job in activeJobs"
              :key="job.id"
              class="p-5 sm:p-6 space-y-4 hover:bg-ink-25 transition-colors cursor-pointer"
              @click="router.push(`/tech/jobs/${job.id}`)"
            >
              <div class="space-y-1.5">
                <div class="flex items-center gap-2.5 flex-wrap text-sm">
                  <span class="text-ink-500 font-num whitespace-nowrap">#{{ job.code || job.id.slice(0, 8) }}</span>
                  <FhStatusPill :status="job.status" />
                  <span class="inline-flex items-center gap-1.5 text-ink-600 whitespace-nowrap">
                    <Clock :size="15" class="text-ink-400" />
                    Hẹn lúc: <strong class="font-semibold text-ink-900 font-num">{{ formatScheduledTime(job.scheduledAt) }}</strong>
                  </span>
                </div>
                <h3 class="text-base sm:text-lg font-semibold text-ink-900">
                  {{ job.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
                </h3>
              </div>

              <div class="p-4 bg-ink-50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                <div class="space-y-1 min-w-0">
                  <p class="text-ink-900">
                    <span class="text-ink-500">Khách hàng: </span>
                    <span class="font-medium">{{ job.customerName || 'Khách hàng FixHome' }}</span>
                    <span v-if="job.customerPhone" class="ml-1.5 text-ink-500 font-num whitespace-nowrap">({{ job.customerPhone }})</span>
                  </p>
                  <p class="text-ink-600 flex items-start gap-1.5">
                    <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
                    <span class="text-pretty">{{ job.addressSummary }}</span>
                  </p>
                </div>
                <a
                  :href="getMapUrl(job.addressSummary)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white border border-ink-200 text-sm font-medium text-brand-600 hover:bg-brand-50 whitespace-nowrap transition-colors"
                  @click.stop
                >
                  <Navigation :size="15" />
                  Chỉ đường Google Maps
                  <ExternalLink :size="13" class="text-ink-400" />
                </a>
              </div>

              <!-- The four steps of a visit -->
              <ol class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                <li
                  class="h-10 px-3 rounded-lg flex items-center gap-2 whitespace-nowrap"
                  :class="stepClass(job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED']), isOneOf(job, ['EN_ROUTE']))"
                >
                  <CheckCircle2 v-if="job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED'])" :size="16" class="shrink-0" />
                  <Radio v-else :size="16" class="shrink-0" />
                  <span class="truncate">1. Đến nơi & GPS</span>
                </li>
                <li
                  class="h-10 px-3 rounded-lg flex items-center gap-2 whitespace-nowrap"
                  :class="stepClass((job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED']), isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']))"
                >
                  <CheckCircle2 v-if="(job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED'])" :size="16" class="shrink-0" />
                  <Camera v-else :size="16" class="shrink-0" />
                  <span class="truncate">2. Ảnh hiện trạng</span>
                </li>
                <li
                  class="h-10 px-3 rounded-lg flex items-center gap-2 whitespace-nowrap"
                  :class="stepClass(isOneOf(job, ['COMPLETED']), isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']))"
                >
                  <CheckCircle2 v-if="isOneOf(job, ['COMPLETED'])" :size="16" class="shrink-0" />
                  <Wrench v-else :size="16" class="shrink-0" />
                  <span class="truncate">3. Báo giá & Sửa</span>
                </li>
                <li
                  class="h-10 px-3 rounded-lg flex items-center gap-2 whitespace-nowrap"
                  :class="stepClass(job.customerConfirmed || isOneOf(job, ['COMPLETED']), false)"
                >
                  <CheckCircle2 v-if="job.customerConfirmed || isOneOf(job, ['COMPLETED'])" :size="16" class="shrink-0" />
                  <Clock v-else :size="16" class="shrink-0" />
                  <span class="truncate">4. Nghiệm thu</span>
                </li>
              </ol>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  class="h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                  title="Nhắn tin với khách hàng"
                  @click.stop="handleChatWithCustomer(job)"
                >
                  <MessageSquare :size="16" class="text-ink-500" />
                  Nhắn tin
                </button>
                <a
                  v-if="job.customerPhone"
                  :href="`tel:${job.customerPhone}`"
                  class="h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                  title="Gọi cho khách hàng"
                  @click.stop
                >
                  <Phone :size="16" class="text-ink-500" />
                  Gọi điện
                </a>
                <FhButton variant="primary" size="md" class="whitespace-nowrap" @click.stop="router.push(`/tech/jobs/${job.id}`)">
                  Mở công việc
                  <ChevronRight :size="16" />
                </FhButton>
              </div>
            </article>
          </div>

          <div v-else class="px-6 py-12 text-center space-y-4">
            <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto">
              <Briefcase :size="24" />
            </div>
            <div class="space-y-1 max-w-md mx-auto">
              <h3 class="text-base font-semibold text-ink-900">Hiện không có công việc nào đang dang dở</h3>
              <p class="text-sm text-ink-500">
                Trạng thái nhận việc của bạn đang hoạt động. Hệ thống sẽ tự động ghép và gửi lời mời khi có đơn mới trong khu vực.
              </p>
            </div>
            <FhButton variant="primary" size="md" class="whitespace-nowrap" @click="router.push('/tech/invitations')">
              <Inbox :size="16" /> Kiểm tra hộp thư mời nhận việc
            </FhButton>
          </div>
        </section>

        <section v-if="completedJobs.length > 0" class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
          <header class="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-ink-900">Công việc đã hoàn thành gần đây</h2>
            <router-link to="/tech/jobs" class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap">
              Xem tất cả lịch sử
              <ChevronRight :size="16" />
            </router-link>
          </header>

          <div class="divide-y divide-ink-100">
            <div
              v-for="job in completedJobs.slice(0, 4)"
              :key="job.id"
              class="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-ink-25 transition-colors cursor-pointer"
              @click="router.push(`/tech/jobs/${job.id}`)"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-ink-500 font-num whitespace-nowrap">#{{ job.code || job.id.slice(0, 8) }}</span>
                  <span class="h-6 px-2 rounded-lg bg-success-50 text-success-700 text-xs font-medium inline-flex items-center whitespace-nowrap">Hoàn thành</span>
                </div>
                <h4 class="text-sm font-semibold text-ink-900">{{ job.serviceName }}</h4>
                <p class="text-sm text-ink-500 text-pretty">{{ job.addressSummary }}</p>
              </div>

              <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                <div class="text-right">
                  <div class="text-base font-semibold text-ink-900 font-num whitespace-nowrap">+{{ money(job.laborTotal || job.grandTotal || 0) }}</div>
                  <span class="text-xs text-success-700">Đã thanh toán</span>
                </div>
                <FhButton variant="secondary" size="sm" class="whitespace-nowrap" @click.stop="router.push(`/tech/jobs/${job.id}`)">
                  Biên bản
                </FhButton>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="2xl:col-span-4 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-6">
        <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
          <h3 class="px-5 sm:px-6 pt-5 pb-2 text-base font-semibold text-ink-900">Lối tắt</h3>
          <div class="divide-y divide-ink-100">
            <button
              v-for="item in shortcuts"
              :key="item.title"
              type="button"
              class="w-full px-5 sm:px-6 py-3.5 flex items-center gap-4 text-left hover:bg-ink-25 transition-colors"
              @click="router.push(item.to)"
            >
              <component :is="item.icon" :size="20" :stroke-width="1.75" class="text-ink-500 shrink-0" />
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-semibold text-ink-900">{{ item.title }}</span>
                <span class="block text-sm text-ink-500 truncate">{{ item.hint }}</span>
              </span>
              <ChevronRight :size="18" class="text-ink-400 shrink-0" />
            </button>
          </div>
        </section>

        <section class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 space-y-4">
          <h4 class="text-sm font-semibold text-ink-900">Lưu ý khi làm việc</h4>
          <!-- A note, not a warning: yellow. -->
          <p class="p-3.5 rounded-xl bg-warning-50 border border-warning-200 text-sm text-warning-800 flex items-start gap-2 text-pretty">
            <Info :size="16" class="text-warning-600 shrink-0 mt-0.5" />
            <span>Lưu ý: Luôn chụp đầy đủ <strong class="font-semibold">ảnh hiện trạng trước và sau khi sửa</strong> để đảm bảo quyền lợi khi đối soát.</span>
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
