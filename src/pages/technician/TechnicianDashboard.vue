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
  Star,
  Briefcase,
  MessageSquare,
  Phone,
  RefreshCw,
  Navigation,
  Sparkles,
  Check,
  Radio,
  AlertCircle,
  ChevronRight,
  Camera,
} from 'lucide-vue-next';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

import {
  FhButton,
  FhStatusPill,
  FhCountdown,
  FhSkeleton,
} from '../../components';
import { ordersApi, isHistoricalOrder, type ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { sessionLabel } from '../../utils/booking-session';
import { availabilityText, type TechnicianAvailability } from '../../utils/availability';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';
import { technicianOnboardingApi } from '../../api/technician-onboarding.api';
import { hasRating, ratingLabel } from '../../utils/formatters';
import { addDaysToKey, vnDayKey, weekdayOfKey } from '../../utils/vn-time';
import { walletApi, type WalletSummary } from '../../api/wallet.api';
import { userFacingError } from '../../utils/user-facing-error';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const loading = ref(true);
const refreshing = ref(false);
const jobsError = ref('');
const jobs = ref<ServiceOrderItem[]>([]);
const isAvailable = ref<boolean | null>(null);
const profile = ref<TechnicianProfileView | null>(null);
const invitations = ref<InvitationItem[]>([]);
const wallet = ref<WalletSummary | null>(null);
const decliningInvitation = ref(false);
const acceptingInvitation = ref(false);

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
  } catch (err) {
    toast.error(userFacingError(err, 'Chưa thể từ chối lời mời. Vui lòng thử lại.'));
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

// The header switch (layout) turns receiving on and off; here we only say what it means right now,
// because the weekly schedule can also switch receiving on and off.
const availability = ref<TechnicianAvailability | null>(null);
const availabilityView = computed(() => availabilityText(availability.value, isAvailable.value));
/** The one line under the name: "Ngoài giờ làm · Tự nhận việc lại lúc 08:00 T7 10/10". */
const availabilityDetail = computed(() =>
  availability.value && availability.value.state !== 'paused' ? availabilityView.value.detail : '',
);
const loadAvailability = async () => {
  try {
    availability.value = await technicianProfileApi.getMyAvailability();
  } catch {
    availability.value = null;
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
  jobsError.value = '';
  const verificationRequest = loadVerification();
  void loadAvailability();
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
  } catch (err) {
    jobs.value = [];
    jobsError.value = userFacingError(err, 'Không thể tải công việc. Vui lòng thử lại.');
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

const isPaid = (job: ServiceOrderItem) => String(job.paymentStatus).toUpperCase() === 'PAID';

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
const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;

const isOneOf = (job: ServiceOrderItem, statuses: string[]) => statuses.includes(String(job.status).toUpperCase());

/** Done steps are green, the current one blue, the rest neutral. */
const stepClass = (done: boolean | undefined, current: boolean) =>
  done ? 'text-success-700' : current ? 'text-brand-700 font-medium' : 'text-ink-500';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
</script>

<template>
  <div class="space-y-6 pb-4">
    <!-- 1. Who is working and whether jobs reach them right now (the switch itself lives in the header) -->
    <header class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-4 min-w-0">
        <div class="relative shrink-0">
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-50 border border-brand-100 text-brand-700 font-semibold flex items-center justify-center text-2xl overflow-hidden">
            <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-full h-full object-cover" />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) || 'T' }}</span>
          </div>
          <span
            data-testid="technician-receive-status"
            class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
            :class="availabilityView.receiving ? 'bg-success-500' : 'bg-ink-400'"
            :title="availabilityView.title"
          />
        </div>

        <div class="min-w-0 space-y-1">
          <p class="text-sm text-ink-500 first-letter:uppercase">{{ currentDateFormatted }}</p>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight text-balance">
            {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
          </h1>
          <p
            data-testid="availability-status"
            class="text-sm flex flex-wrap items-center gap-x-2"
            :class="availabilityView.receiving ? 'text-success-700' : 'text-ink-600'"
          >
            <span class="font-semibold whitespace-nowrap">{{ availabilityView.title }}</span>
            <span v-if="availabilityDetail" class="text-ink-600 whitespace-nowrap">{{ availabilityDetail }}</span>
          </p>
        </div>
      </div>

      <FhButton variant="secondary" size="sm" class="h-10" :disabled="refreshing" aria-label="Tải lại" @click="handleRefresh">
        <RefreshCw :size="16" :class="{ 'animate-spin': refreshing }" />
        <span class="hidden sm:inline">Tải lại</span>
      </FhButton>
    </header>

    <!-- Reputation in one quiet row -->
    <div class="flex items-center gap-x-5 gap-y-2 flex-wrap text-sm text-ink-600 -mt-2">
      <span
        v-if="identityVerified"
        class="inline-flex items-center gap-1 h-6 px-2 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium whitespace-nowrap"
      >
        <ShieldCheck :size="14" />
        Đã xác minh danh tính
      </span>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
        <MapPin :size="15" class="text-ink-400" />
        Bán kính <strong class="font-semibold text-ink-900 font-num">{{ profile ? `${profile.serviceRadiusKm} km` : '—' }}</strong>
      </span>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Star :size="15" class="text-warning-500 fill-warning-500" />
        <strong class="font-semibold text-ink-900 font-num">{{ profile && hasRating(profile.averageRating, profile.ratingCount) ? ratingLabel(profile.averageRating, profile.ratingCount) : 'Chưa có đánh giá' }}</strong>
        <span class="text-ink-400">({{ profile?.ratingCount ?? 0 }})</span>
      </span>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Sparkles :size="15" class="text-ink-400" />
        Độ tin cậy <strong class="font-semibold text-success-700 font-num">{{ profile?.reliabilityScore != null ? `${profile.reliabilityScore}%` : '—' }}</strong>
      </span>
    </div>

    <!-- 2. A job offer waiting for an answer: the main action of the screen when there is one -->
    <section
      v-if="topInvitation"
      class="p-5 sm:p-6 rounded-2xl bg-white border border-brand-200 shadow-(--shadow-e1) flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      data-testid="dashboard-invitation"
    >
      <button
        type="button"
        class="min-w-0 flex-1 text-left space-y-1.5 rounded-xl"
        :class="focusRing"
        @click="router.push('/tech/invitations')"
      >
        <span class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-brand-700 whitespace-nowrap">Lời mời nhận việc mới</span>
          <FhCountdown :expires-at="topInvitation.expiresAt" />
          <span v-if="invitations.length > 1" class="text-xs font-medium text-ink-600 bg-ink-100 h-6 px-2 rounded-lg inline-flex items-center whitespace-nowrap">
            +{{ invitations.length - 1 }} lời mời khác
          </span>
        </span>
        <span class="block text-lg font-semibold text-ink-900 text-balance">
          {{ topInvitation.booking?.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
        </span>
        <span class="flex flex-col sm:flex-row sm:items-center gap-x-5 gap-y-1 text-sm text-ink-600">
          <span class="flex items-start gap-1.5 min-w-0">
            <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
            <span class="text-pretty">{{ topInvitation.booking?.addressSummary || 'Khu vực địa phương' }}</span>
          </span>
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Clock :size="15" class="text-ink-400" />
            <strong class="font-semibold text-ink-900">{{ sessionLabel({ bookingMode: topInvitation.booking?.bookingMode, slot: topInvitation.booking?.slot, start: topInvitation.booking?.preferredStartAt }) }}</strong>
          </span>
        </span>
      </button>

      <div class="grid grid-cols-2 lg:flex items-center gap-2.5 shrink-0">
        <FhButton variant="secondary" size="md" :loading="decliningInvitation" @click="declineTopInvitation">
          Từ chối
        </FhButton>
        <FhButton variant="primary" size="md" :loading="acceptingInvitation" @click="handleAcceptTopInvitation">
          <Check :size="16" />
          Chấp nhận đơn này
        </FhButton>
      </div>
    </section>

    <!-- 3. Three numbers in one strip -->
    <section
      class="bg-white rounded-2xl border border-ink-200 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-100 overflow-hidden"
      data-testid="dashboard-summary"
    >
      <button
        type="button"
        class="p-4 sm:p-5 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
        :class="focusRing"
        @click="router.push('/tech/wallet')"
      >
        <span class="flex-1 min-w-0 space-y-1">
          <span class="block text-sm text-ink-500">Số dư ví</span>
          <FhSkeleton v-if="loading" width="140px" height="28px" />
          <span
            v-else
            class="block text-2xl font-semibold font-num whitespace-nowrap"
            :class="wallet && wallet.balance < 0 ? 'text-danger-600' : 'text-ink-900'"
          >
            {{ wallet ? money(wallet.balance) : '—' }}
          </span>
          <span v-if="wallet" class="text-sm flex items-center gap-1.5 whitespace-nowrap" :class="wallet.eligibleForJobs ? 'text-success-700' : 'text-danger-600'">
            <CheckCircle2 v-if="wallet.eligibleForJobs" :size="15" class="shrink-0" />
            <AlertCircle v-else :size="15" class="shrink-0" />
            <template v-if="wallet.eligibleForJobs">Đủ điều kiện nhận việc</template>
            <template v-else>Dưới mức ký quỹ <span class="font-num">{{ money(wallet.minimumBalance) }}</span></template>
          </span>
        </span>
        <ChevronRight :size="18" class="text-ink-400 shrink-0" />
      </button>

      <div class="p-4 sm:p-5 space-y-1">
        <span class="block text-sm text-ink-500">Đang làm</span>
        <FhSkeleton v-if="loading" width="80px" height="28px" />
        <span v-else class="block text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          {{ activeJobs.length }} <span class="text-base font-medium text-ink-500 font-sans">đơn</span>
        </span>
        <span class="block text-sm text-ink-600 whitespace-nowrap">
          {{ enRouteJobs.length }} đang di chuyển · {{ underRepairJobs.length }} đang sửa
        </span>
      </div>

      <button
        type="button"
        class="p-4 sm:p-5 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
        :class="focusRing"
        @click="router.push('/tech/earnings')"
      >
        <span class="flex-1 min-w-0 space-y-1">
          <span class="block text-sm text-ink-500">Hoàn thành tuần này</span>
          <FhSkeleton v-if="loading" width="80px" height="28px" />
          <span v-else class="block text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
            {{ completedCount }} <span class="text-base font-medium text-ink-500 font-sans">đơn</span>
          </span>
          <span class="block text-sm text-ink-600 whitespace-nowrap">
            Tích lũy <strong class="font-semibold text-ink-800 font-num">{{ money(totalEarnings) }}</strong>
          </span>
        </span>
        <ChevronRight :size="18" class="text-ink-400 shrink-0" />
      </button>
    </section>

    <!-- 4. Work in progress, then recent completions -->
    <div class="space-y-6">
      <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
        <header class="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold text-ink-900">Đơn đang xử lý</h2>
          <router-link
            to="/tech/jobs"
            class="h-10 -mr-2 px-2 rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap"
            :class="focusRing"
          >
            Xem tất cả
            <ChevronRight :size="16" />
          </router-link>
        </header>

        <div v-if="loading" class="p-5 sm:p-6 space-y-3" aria-busy="true" aria-label="Đang tải công việc">
          <FhSkeleton width="40%" height="16px" />
          <FhSkeleton width="70%" height="22px" />
          <FhSkeleton width="90%" height="16px" />
          <FhSkeleton width="100%" height="40px" rounded="md" />
        </div>

        <div v-else-if="jobsError" role="alert" class="px-5 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-danger-700">
          <span>{{ jobsError }}</span>
          <FhButton variant="secondary" size="sm" class="h-10" @click="handleRefresh">Thử lại</FhButton>
        </div>

        <ul v-else-if="activeJobs.length > 0" class="divide-y divide-ink-100">
          <li
            v-for="job in activeJobs"
            :key="job.id"
            class="p-5 sm:p-6 flex gap-3 hover:bg-ink-25 transition-colors cursor-pointer"
            @click="router.push(`/tech/jobs/${job.id}`)"
          >
            <div class="flex-1 min-w-0 space-y-3">
              <div class="space-y-1">
                <div class="flex items-center gap-x-2.5 gap-y-1 flex-wrap text-sm">
                  <span class="text-ink-500 font-num whitespace-nowrap">#{{ job.code || job.id.slice(0, 8) }}</span>
                  <FhStatusPill :status="job.status" />
                  <span class="inline-flex items-center gap-1.5 text-ink-600 whitespace-nowrap">
                    <Clock :size="15" class="text-ink-400" />
                    <strong class="font-semibold text-ink-900 font-num">{{ formatScheduledTime(job.scheduledAt) }}</strong>
                  </span>
                </div>
                <h3 class="text-base sm:text-lg font-semibold text-ink-900 text-balance">{{ job.serviceName || 'Dịch vụ sửa chữa tại nhà' }}</h3>
                <p class="text-sm text-ink-900">
                  {{ job.customerName || 'Khách hàng FixHome' }}
                  <span v-if="job.customerPhone" class="ml-1 text-ink-500 font-num whitespace-nowrap">{{ job.customerPhone }}</span>
                </p>
                <p class="text-sm text-ink-600 flex items-start gap-1.5">
                  <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
                  <span class="text-pretty">{{ job.addressSummary }}</span>
                </p>
              </div>

              <!-- The four steps of a visit -->
              <ol class="flex flex-wrap gap-x-4 gap-y-1.5 text-sm" aria-label="Tiến độ">
                <li
                  class="inline-flex items-center gap-1.5 whitespace-nowrap"
                  :class="stepClass(job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED']), isOneOf(job, ['EN_ROUTE']))"
                >
                  <CheckCircle2 v-if="job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED'])" :size="16" class="shrink-0" />
                  <Radio v-else :size="16" class="shrink-0" />
                  Đến nơi
                </li>
                <li
                  class="inline-flex items-center gap-1.5 whitespace-nowrap"
                  :class="stepClass((job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED']), isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']))"
                >
                  <CheckCircle2 v-if="(job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED'])" :size="16" class="shrink-0" />
                  <Camera v-else :size="16" class="shrink-0" />
                  Ảnh hiện trạng
                </li>
                <li
                  class="inline-flex items-center gap-1.5 whitespace-nowrap"
                  :class="stepClass(isOneOf(job, ['COMPLETED']), isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']))"
                >
                  <CheckCircle2 v-if="isOneOf(job, ['COMPLETED'])" :size="16" class="shrink-0" />
                  <Wrench v-else :size="16" class="shrink-0" />
                  Báo giá và sửa
                </li>
                <li
                  class="inline-flex items-center gap-1.5 whitespace-nowrap"
                  :class="stepClass(isOneOf(job, ['COMPLETED']), !!job.completionRequestedAt)"
                >
                  <CheckCircle2 v-if="isOneOf(job, ['COMPLETED'])" :size="16" class="shrink-0" />
                  <Clock v-else :size="16" class="shrink-0" />
                  Thanh toán
                </li>
              </ol>

              <div class="flex flex-wrap items-center gap-2">
                <a
                  :href="getMapUrl(job.addressSummary)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                  :class="focusRing"
                  @click.stop
                >
                  <Navigation :size="16" class="text-ink-500" />
                  Chỉ đường
                </a>
                <button
                  type="button"
                  class="h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                  :class="focusRing"
                  @click.stop="handleChatWithCustomer(job)"
                >
                  <MessageSquare :size="16" class="text-ink-500" />
                  Nhắn tin
                </button>
                <a
                  v-if="job.customerPhone"
                  :href="`tel:${job.customerPhone}`"
                  class="h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                  :class="focusRing"
                  @click.stop
                >
                  <Phone :size="16" class="text-ink-500" />
                  Gọi điện
                </a>
              </div>
            </div>
            <router-link
              :to="`/tech/jobs/${job.id}`"
              class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:bg-ink-100 hover:text-ink-700 hidden sm:flex items-center justify-center shrink-0 self-center"
              :class="focusRing"
              aria-label="Mở chi tiết công việc"
              @click.stop
            >
              <ChevronRight :size="20" aria-hidden="true" />
            </router-link>
          </li>
        </ul>

        <div v-else class="px-6 py-12 text-center space-y-3">
          <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto">
            <Briefcase :size="24" />
          </div>
          <h3 class="text-base font-semibold text-ink-900">Chưa có việc đang làm</h3>
          <p class="text-sm text-ink-500">Lời mời mới sẽ hiện ở đầu trang này.</p>
        </div>
      </section>

      <section v-if="completedJobs.length > 0" class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
        <header class="px-5 sm:px-6 py-4 border-b border-ink-100">
          <h2 class="text-lg font-semibold text-ink-900">Hoàn thành gần đây</h2>
        </header>

        <ul class="divide-y divide-ink-100">
          <li v-for="job in completedJobs.slice(0, 4)" :key="job.id">
            <button
              type="button"
              class="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
              :class="focusRing"
              @click="router.push(`/tech/jobs/${job.id}`)"
            >
              <span class="flex-1 min-w-0 space-y-0.5">
                <span class="block text-sm text-ink-500 font-num truncate">#{{ job.code || job.id.slice(0, 8) }}</span>
                <span class="block text-sm font-semibold text-ink-900 truncate" :title="job.serviceName">{{ job.serviceName }}</span>
                <span class="block text-sm text-ink-500 truncate" :title="job.addressSummary">{{ job.addressSummary }}</span>
              </span>
              <span class="text-right shrink-0 space-y-0.5">
                <span class="block text-base font-semibold text-ink-900 font-num whitespace-nowrap">+{{ money(job.laborTotal || job.grandTotal || 0) }}</span>
                <span class="block text-sm whitespace-nowrap" :class="isPaid(job) ? 'text-success-700' : 'text-warning-700'">
                  {{ isPaid(job) ? 'Đã thanh toán' : 'Chưa thanh toán' }}
                </span>
              </span>
              <ChevronRight :size="18" class="text-ink-400 shrink-0" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
