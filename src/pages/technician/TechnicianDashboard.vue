<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import {
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
  Check,
  AlertCircle,
  ChevronRight,
  User,
} from 'lucide-vue-next';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

import {
  FhButton,
  FhStatusPill,
  FhCountdown,
  FhSkeleton,
} from '../../components';
import type { ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { sessionLabel } from '../../utils/booking-session';
import { availabilityText, type TechnicianAvailability } from '../../utils/availability';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';
import { hasRating, ratingLabel } from '../../utils/formatters';
import { addDaysToKey, vnDayKey, weekdayOfKey } from '../../utils/vn-time';
import { userFacingError } from '../../utils/user-facing-error';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { sharedQueries } from '../../lib/queries';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const cache = useCacheUpdates();
const refreshing = ref(false);

// Each block is cached on its own: a return visit shows the last answer at once
// and reads it again in the background. A block that fails stays empty.
const jobsQuery = useCachedQuery(sharedQueries.technicianActiveJobs);
const loading = jobsQuery.loading;
const jobs = computed<ServiceOrderItem[]>(() => (jobsQuery.error.value ? [] : (jobsQuery.data.value ?? [])));
const jobsError = computed(() =>
  jobsQuery.error.value ? userFacingError(jobsQuery.error.value, 'Không thể tải công việc. Vui lòng thử lại.') : '',
);

const invitationsQuery = useCachedQuery(sharedQueries.technicianInvitations);
const invitations = computed<InvitationItem[]>(() => (invitationsQuery.error.value ? [] : (invitationsQuery.data.value ?? [])));

const walletQuery = useCachedQuery(sharedQueries.technicianWallet);
const wallet = computed(() => (walletQuery.error.value ? null : (walletQuery.data.value ?? null)));

const profileQuery = useCachedQuery(sharedQueries.technicianProfile);
const profile = computed<TechnicianProfileView | null>(() => (profileQuery.error.value ? null : (profileQuery.data.value ?? null)));
const isAvailable = computed<boolean | null>(() => profile.value?.isAvailable ?? null);

const decliningInvitation = ref(false);
const acceptingInvitation = ref(false);

const topInvitation = computed(() => invitations.value[0] ?? null);

/** Drops the invitation from the cached list at once; the server copy is read again. */
const dropInvitation = (id: string) => {
  if (invitationsQuery.data.value) invitationsQuery.setData(invitationsQuery.data.value.filter((i) => i.id !== id));
};

const declineTopInvitation = async () => {
  const inv = topInvitation.value;
  if (!inv) return;
  decliningInvitation.value = true;
  try {
    await bookingsApi.respondInvitation(inv.id, 'DECLINE');
    dropInvitation(inv.id);
    cache.markChanged(affectedBy.invitationResponse);
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
    dropInvitation(inv.id);
    void cache.refresh(affectedBy.invitationResponse);
    if (result?.serviceOrderId) {
      await router.push(`/tech/jobs/${result.serviceOrderId}`);
    } else {
      await router.push('/tech/jobs');
    }
  } catch {
    toast.error('Không thể nhận đơn lúc này. Vui lòng kiểm tra lại danh sách công việc.');
  } finally {
    acceptingInvitation.value = false;
  }
};

// The header switch (layout) turns receiving on and off; here we only say what it means right now,
// because the weekly schedule can also switch receiving on and off.
const availabilityQuery = useCachedQuery({
  key: queryKeys.technician.availability,
  fetch: () => technicianProfileApi.getMyAvailability(),
});
const availability = computed<TechnicianAvailability | null>(() =>
  availabilityQuery.error.value ? null : (availabilityQuery.data.value ?? null),
);
const availabilityView = computed(() => availabilityText(availability.value, isAvailable.value));
/** The one line under the name: "Ngoài giờ làm · Tự nhận việc lại lúc 08:00 T7 10/10". */
const availabilityDetail = computed(() =>
  availability.value && availability.value.state !== 'paused' ? availabilityView.value.detail : '',
);
const onboardingQuery = useCachedQuery(sharedQueries.technicianOnboarding);
const identityVerified = computed(() => {
  const status = onboardingQuery.error.value ? null : onboardingQuery.data.value;
  return !!status && (status.verificationStatus === 'verified' || status.onboardingStatus === 'approved');
});

const handleRefresh = async () => {
  refreshing.value = true;
  await Promise.all(
    [jobsQuery, invitationsQuery, walletQuery, profileQuery, availabilityQuery, onboardingQuery].map((q) => q.refetch()),
  );
  refreshing.value = false;
};

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

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
</script>

<template>
  <div class="space-y-6 pb-6">
    <!-- 1. Who is working and whether jobs reach them right now -->
    <header class="bg-white rounded-2xl border border-ink-200/90 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
      <div class="flex items-center gap-4 min-w-0">
        <div class="relative shrink-0">
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-ink-100 border border-ink-200 text-brand-700 font-bold flex items-center justify-center text-2xl overflow-hidden shadow-2xs">
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
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-[13px] font-medium text-ink-500">{{ currentDateFormatted }}</p>
            <span
              v-if="identityVerified"
              class="inline-flex items-center gap-1 h-5 px-2 rounded-md bg-brand-50 text-brand-700 text-[11px] font-semibold"
            >
              <ShieldCheck :size="13" />
              Đã xác minh
            </span>
          </div>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight truncate">
            {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
          </h1>
          <p
            data-testid="availability-status"
            class="text-sm flex flex-wrap items-center gap-x-2"
            :class="availabilityView.receiving ? 'text-success-700' : 'text-ink-600'"
          >
            <span class="inline-flex items-center gap-1.5 font-bold">
              <span
                class="w-2 h-2 rounded-full"
                :class="availabilityView.receiving ? 'bg-success-600 animate-pulse' : 'bg-ink-400'"
              ></span>
              {{ availabilityView.title }}
            </span>
            <span v-if="availabilityDetail" class="text-ink-500 font-medium whitespace-nowrap">{{ availabilityDetail }}</span>
          </p>
        </div>
      </div>

      <!-- Quick reputation stats & refresh button -->
      <div class="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-ink-100 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 rounded-xl border border-ink-200/70 text-ink-700 font-medium">
            <MapPin :size="14" class="text-ink-400 shrink-0" />
            <span>Bán kính</span>
            <strong class="font-bold text-ink-900 font-num">{{ profile ? `${profile.serviceRadiusKm} km` : '—' }}</strong>
          </div>

          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 rounded-xl border border-ink-200/70 text-ink-700 font-medium">
            <Star :size="14" class="text-warning-500 fill-warning-500 shrink-0" />
            <strong class="font-bold text-ink-900 font-num">{{ profile && hasRating(profile.averageRating, profile.ratingCount) ? ratingLabel(profile.averageRating, profile.ratingCount) : 'Chưa có đánh giá' }}</strong>
            <span class="text-ink-400 text-xs">({{ profile?.ratingCount ?? 0 }})</span>
          </div>

          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 rounded-xl border border-ink-200/70 text-ink-700 font-medium">
            <span>Tin cậy</span>
            <strong class="font-bold font-num">{{ profile?.reliabilityScore != null ? `${profile.reliabilityScore}%` : '—' }}</strong>
          </div>
        </div>

        <FhButton variant="secondary" size="sm" class="h-10 px-3.5 rounded-xl shrink-0" :disabled="refreshing" aria-label="Tải lại" @click="handleRefresh">
          <RefreshCw :size="15" :class="{ 'animate-spin': refreshing }" />
          <span class="hidden sm:inline font-medium">Tải lại</span>
        </FhButton>
      </div>
    </header>

    <!-- 2. A job offer waiting for an answer: the main urgent action when there is one -->
    <section
      v-if="topInvitation"
      class="p-5 sm:p-6 rounded-2xl bg-white border-2 border-brand-500 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5"
      data-testid="dashboard-invitation"
    >
      <div class="min-w-0 flex-1 space-y-2.5">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold">
            <span class="w-2 h-2 rounded-full bg-brand-600 animate-ping"></span>
            Lời mời nhận việc mới
          </span>
          <FhCountdown :expires-at="topInvitation.expiresAt" />
          <span v-if="invitations.length > 1" class="text-xs font-semibold text-ink-600 bg-ink-100 h-6 px-2.5 rounded-lg inline-flex items-center whitespace-nowrap">
            +{{ invitations.length - 1 }} lời mời khác
          </span>
        </div>

        <div>
          <h2 class="text-lg sm:text-xl font-bold text-ink-900 tracking-tight text-balance">
            {{ topInvitation.booking?.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
          </h2>
          <div class="mt-2 flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1.5 text-sm text-ink-700">
            <span class="flex items-start gap-1.5 min-w-0">
              <MapPin :size="16" class="text-brand-600 shrink-0 mt-0.5" />
              <span class="font-medium text-pretty">{{ topInvitation.booking?.addressSummary || 'Khu vực địa phương' }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Clock :size="16" class="text-brand-600 shrink-0" />
              <span class="text-ink-500">Thời gian:</span>
              <strong class="font-bold text-ink-900">{{ sessionLabel({ bookingMode: topInvitation.booking?.bookingMode, slot: topInvitation.booking?.slot, start: topInvitation.booking?.preferredStartAt }) }}</strong>
            </span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:flex items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-ink-100">
        <FhButton
          variant="secondary"
          size="md"
          class="h-11 px-5 rounded-xl font-semibold border-ink-200 hover:bg-ink-100 text-ink-700"
          :loading="decliningInvitation"
          @click="declineTopInvitation"
        >
          Từ chối
        </FhButton>
        <FhButton
          variant="primary"
          size="md"
          class="h-11 px-5 rounded-xl font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
          :loading="acceptingInvitation"
          @click="handleAcceptTopInvitation"
        >
          <Check :size="18" />
          <span>Chấp nhận đơn này</span>
        </FhButton>
      </div>
    </section>

    <!-- 3. Key metrics grid: 3 punchy, field-ready metric cards (grounded, non-AI) -->
    <section
      class="grid grid-cols-1 sm:grid-cols-3 gap-3.5"
      data-testid="dashboard-summary"
    >
      <!-- Card 1: Ví thợ & Ký quỹ -->
      <button
        type="button"
        class="group p-5 bg-white rounded-2xl border border-ink-200/90 shadow-2xs hover:border-ink-300 transition-colors text-left flex flex-col justify-between min-h-[136px] cursor-pointer"
        :class="focusRing"
        @click="router.push('/tech/wallet')"
      >
        <div class="flex items-center justify-between w-full">
          <span class="text-[13px] font-medium text-ink-500">Số dư ví</span>
          <span class="text-xs font-medium text-ink-400 group-hover:text-ink-700 transition-colors inline-flex items-center gap-1">
            Chi tiết
            <span aria-hidden="true">&rarr;</span>
          </span>
        </div>

        <div class="my-auto py-1">
          <FhSkeleton v-if="loading" width="140px" height="32px" />
          <span
            v-else
            class="block text-2xl sm:text-3xl font-bold font-num tracking-tight"
            :class="wallet && wallet.balance < 0 ? 'text-danger-600' : 'text-ink-900'"
          >
            {{ wallet ? money(wallet.balance) : '—' }}
          </span>
        </div>

        <div>
          <div
            v-if="wallet"
            class="flex items-center gap-1.5 text-xs"
            :class="wallet.eligibleForJobs ? 'text-success-700 font-medium' : 'text-danger-700 font-semibold'"
          >
            <CheckCircle2 v-if="wallet.eligibleForJobs" :size="14" class="shrink-0" />
            <AlertCircle v-else :size="14" class="shrink-0" />
            <template v-if="wallet.eligibleForJobs">Đủ điều kiện nhận việc</template>
            <template v-else>Dưới mức ký quỹ <span class="font-num font-bold ml-0.5">{{ money(wallet.minimumBalance) }}</span></template>
          </div>
          <span v-else class="text-xs text-ink-400">Đang tải trạng thái ví…</span>
        </div>
      </button>

      <!-- Card 2: Đơn đang xử lý -->
      <div
        class="p-5 bg-white rounded-2xl border border-ink-200/90 shadow-2xs flex flex-col justify-between min-h-[136px]"
      >
        <div class="flex items-center justify-between w-full">
          <span class="text-[13px] font-medium text-ink-500">Đang làm</span>
          <span
            v-if="activeJobs.length > 0"
            class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-ink-100 text-ink-800 font-num"
          >
            {{ activeJobs.length }} việc
          </span>
        </div>

        <div class="my-auto py-1">
          <FhSkeleton v-if="loading" width="80px" height="32px" />
          <div v-else class="text-2xl sm:text-3xl font-bold text-ink-900 font-num tracking-tight">
            {{ activeJobs.length }} <span class="text-base font-normal text-ink-500 font-sans">đơn</span>
          </div>
        </div>

        <div class="text-xs text-ink-600 flex items-center gap-1.5">
          <template v-if="activeJobs.length > 0">
            <span class="inline-flex items-center gap-1 font-medium text-ink-700">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              {{ enRouteJobs.length }} di chuyển
            </span>
            <span class="text-ink-300">·</span>
            <span class="inline-flex items-center gap-1 font-medium text-ink-700">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              {{ underRepairJobs.length }} đang sửa
            </span>
          </template>
          <template v-else>
            <span class="text-ink-400">Sẵn sàng nhận việc mới</span>
          </template>
        </div>
      </div>

      <!-- Card 3: Hoàn thành tuần này -->
      <button
        type="button"
        class="group p-5 bg-white rounded-2xl border border-ink-200/90 shadow-2xs hover:border-ink-300 transition-colors text-left flex flex-col justify-between min-h-[136px] cursor-pointer"
        :class="focusRing"
        @click="router.push('/tech/earnings')"
      >
        <div class="flex items-center justify-between w-full">
          <span class="text-[13px] font-medium text-ink-500">Hoàn thành tuần này</span>
          <span class="text-xs font-medium text-ink-400 group-hover:text-ink-700 transition-colors inline-flex items-center gap-1">
            Bảng kê
            <span aria-hidden="true">&rarr;</span>
          </span>
        </div>

        <div class="my-auto py-1">
          <FhSkeleton v-if="loading" width="80px" height="32px" />
          <div v-else class="text-2xl sm:text-3xl font-bold text-ink-900 font-num tracking-tight">
            {{ completedCount }} <span class="text-base font-normal text-ink-500 font-sans">đơn</span>
          </div>
        </div>

        <div class="text-xs text-ink-600 truncate">
          Tích lũy: <strong class="font-bold text-ink-900 font-num text-sm ml-0.5">{{ money(totalEarnings) }}</strong>
        </div>
      </button>
    </section>

    <!-- 4. Work in progress, then recent completions -->
    <div class="space-y-6">
      <section class="bg-white rounded-2xl border border-ink-200/90 shadow-xs overflow-hidden">
        <header class="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between gap-3 bg-white">
          <div class="flex items-center gap-2.5">
            <h2 class="text-lg font-bold text-ink-900">Đơn đang xử lý</h2>
            <span
              v-if="activeJobs.length > 0"
              class="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 font-num"
            >
              {{ activeJobs.length }}
            </span>
          </div>
          <router-link
            to="/tech/jobs"
            class="h-9 px-3 rounded-xl text-sm font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
            :class="focusRing"
          >
            <span>Xem tất cả</span>
            <ChevronRight :size="16" />
          </router-link>
        </header>

        <div v-if="loading" class="p-5 sm:p-6 space-y-3" aria-busy="true" aria-label="Đang tải công việc">
          <FhSkeleton width="40%" height="16px" />
          <FhSkeleton width="70%" height="22px" />
          <FhSkeleton width="90%" height="16px" />
          <FhSkeleton width="100%" height="40px" rounded="md" />
        </div>

        <div v-else-if="jobsError" role="alert" class="px-5 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-danger-700 bg-danger-50/50">
          <div class="flex items-center gap-2 min-w-0">
            <AlertCircle :size="18" class="text-danger-600 shrink-0" />
            <span class="font-medium">{{ jobsError }}</span>
          </div>
          <FhButton variant="secondary" size="sm" class="h-9 px-4 rounded-xl border-danger-200 text-danger-700 hover:bg-danger-100" @click="handleRefresh">Thử lại</FhButton>
        </div>

        <ul v-else-if="activeJobs.length > 0" class="divide-y divide-ink-100">
          <li
            v-for="job in activeJobs"
            :key="job.id"
            class="p-5 sm:p-6 hover:bg-ink-25/80 transition-colors"
          >
            <div class="space-y-4">
              <!-- Job Header: Code, Status Pill, Scheduled Time -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex items-center gap-2.5 flex-wrap">
                  <span class="text-sm font-bold text-ink-900 font-num bg-ink-100 px-2.5 py-1 rounded-lg">#{{ job.code || job.id.slice(0, 8) }}</span>
                  <FhStatusPill :status="job.status" />
                </div>
                <div class="inline-flex items-center gap-1.5 text-xs sm:text-sm text-ink-600 bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-100 shrink-0">
                  <Clock :size="15" class="text-ink-400" />
                  <span>Hẹn lúc:</span>
                  <strong class="font-bold text-ink-900 font-num">{{ formatScheduledTime(job.scheduledAt) }}</strong>
                </div>
              </div>

              <!-- Service & Customer Details -->
              <div class="space-y-1.5">
                <h3 class="text-base sm:text-lg font-bold text-ink-900 text-balance hover:text-brand-700 transition-colors cursor-pointer" @click="router.push(`/tech/jobs/${job.id}`)">
                  {{ job.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
                </h3>
                <div class="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-sm">
                  <p class="font-semibold text-ink-800 flex items-center gap-1.5">
                    <User :size="15" class="text-ink-400 shrink-0" />
                    <span>{{ job.customerName || 'Khách hàng FixHome' }}</span>
                    <span v-if="job.customerPhone" class="text-ink-500 font-normal font-num ml-1">({{ job.customerPhone }})</span>
                  </p>
                  <span class="hidden sm:inline text-ink-300">·</span>
                  <p class="text-ink-600 flex items-start gap-1.5 min-w-0">
                    <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
                    <span class="text-pretty truncate" :title="job.addressSummary">{{ job.addressSummary }}</span>
                  </p>
                </div>
              </div>

              <!-- Timeline Progress Tracker -->
              <div class="py-3.5 px-4 bg-ink-25/80 rounded-xl border border-ink-100/90">
                <div class="flex items-center justify-between mb-3 text-xs">
                  <span class="font-medium text-ink-500">Tiến độ thực hiện</span>
                  <span class="font-medium text-ink-700">
                    {{
                      isOneOf(job, ['COMPLETED'])
                        ? 'Hoàn thành'
                        : job.completionRequestedAt
                          ? 'Chờ thanh toán'
                          : isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS'])
                            ? ((job.beforeEvidenceCount ?? 0) > 0 ? 'Đang sửa chữa' : 'Cần chụp hiện trạng')
                            : 'Đang di chuyển'
                    }}
                  </span>
                </div>

                <ol class="relative flex items-start justify-between w-full" aria-label="Tiến độ">
                  <!-- Connecting horizontal background line -->
                  <div class="absolute left-6 right-6 top-3 h-0.5 bg-ink-200 -z-0" aria-hidden="true">
                    <!-- Progress fill -->
                    <div
                      class="h-full bg-brand-600 transition-all duration-300"
                      :style="{
                        width: isOneOf(job, ['COMPLETED'])
                          ? '100%'
                          : job.completionRequestedAt
                            ? '75%'
                            : (job.beforeEvidenceCount ?? 0) > 0
                              ? '50%'
                              : (job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']))
                                ? '25%'
                                : '0%'
                      }"
                    />
                  </div>

                  <!-- Step 1: Đến nơi -->
                  <li class="relative z-10 flex flex-col items-center text-center flex-1">
                    <div
                      class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                      :class="[
                        (job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED']))
                          ? 'bg-success-600 text-white'
                          : isOneOf(job, ['EN_ROUTE'])
                            ? 'bg-white border-2 border-brand-600 text-brand-600 ring-4 ring-brand-100'
                            : 'bg-white border-2 border-ink-200 text-ink-400 font-num'
                      ]"
                    >
                      <Check v-if="job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED'])" :size="13" :stroke-width="3" />
                      <span v-else-if="isOneOf(job, ['EN_ROUTE'])" class="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                      <span v-else class="text-[10px]">1</span>
                    </div>
                    <span
                      class="mt-1.5 px-0.5 text-xs font-medium leading-tight text-balance"
                      :class="[
                        (job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED']))
                          ? 'text-ink-900 font-semibold'
                          : isOneOf(job, ['EN_ROUTE'])
                            ? 'text-brand-700 font-bold'
                            : 'text-ink-400'
                      ]"
                    >
                      Đến nơi
                    </span>
                  </li>

                  <!-- Step 2: Ảnh hiện trạng -->
                  <li class="relative z-10 flex flex-col items-center text-center flex-1">
                    <div
                      class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                      :class="[
                        ((job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED']))
                          ? 'bg-success-600 text-white'
                          : (!((job.beforeEvidenceCount ?? 0) > 0) && (job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS'])))
                            ? 'bg-white border-2 border-brand-600 text-brand-600 ring-4 ring-brand-100'
                            : 'bg-white border-2 border-ink-200 text-ink-400 font-num'
                      ]"
                    >
                      <Check v-if="(job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED'])" :size="13" :stroke-width="3" />
                      <span v-else-if="!((job.beforeEvidenceCount ?? 0) > 0) && (job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']))" class="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                      <span v-else class="text-[10px]">2</span>
                    </div>
                    <span
                      class="mt-1.5 px-0.5 text-xs font-medium leading-tight text-balance"
                      :class="[
                        ((job.beforeEvidenceCount ?? 0) > 0 || isOneOf(job, ['COMPLETED']))
                          ? 'text-ink-900 font-semibold'
                          : (!((job.beforeEvidenceCount ?? 0) > 0) && (job.arrivalVerified || isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS'])))
                            ? 'text-brand-700 font-bold'
                            : 'text-ink-400'
                      ]"
                    >
                      Ảnh hiện trạng
                    </span>
                  </li>

                  <!-- Step 3: Báo giá & sửa -->
                  <li class="relative z-10 flex flex-col items-center text-center flex-1">
                    <div
                      class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                      :class="[
                        (isOneOf(job, ['COMPLETED']) || !!job.completionRequestedAt)
                          ? 'bg-success-600 text-white'
                          : (isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']) && ((job.beforeEvidenceCount ?? 0) > 0))
                            ? 'bg-white border-2 border-brand-600 text-brand-600 ring-4 ring-brand-100'
                            : 'bg-white border-2 border-ink-200 text-ink-400 font-num'
                      ]"
                    >
                      <Check v-if="isOneOf(job, ['COMPLETED']) || !!job.completionRequestedAt" :size="13" :stroke-width="3" />
                      <span v-else-if="isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']) && ((job.beforeEvidenceCount ?? 0) > 0)" class="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                      <span v-else class="text-[10px]">3</span>
                    </div>
                    <span
                      class="mt-1.5 px-0.5 text-xs font-medium leading-tight text-balance"
                      :class="[
                        (isOneOf(job, ['COMPLETED']) || !!job.completionRequestedAt)
                          ? 'text-ink-900 font-semibold'
                          : (isOneOf(job, ['UNDER_REPAIR', 'IN_PROGRESS']) && ((job.beforeEvidenceCount ?? 0) > 0))
                            ? 'text-brand-700 font-bold'
                            : 'text-ink-400'
                      ]"
                    >
                      Báo giá & sửa
                    </span>
                  </li>

                  <!-- Step 4: Thanh toán -->
                  <li class="relative z-10 flex flex-col items-center text-center flex-1">
                    <div
                      class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                      :class="[
                        isOneOf(job, ['COMPLETED'])
                          ? 'bg-success-600 text-white'
                          : (!!job.completionRequestedAt && !isOneOf(job, ['COMPLETED']))
                            ? 'bg-white border-2 border-brand-600 text-brand-600 ring-4 ring-brand-100'
                            : 'bg-white border-2 border-ink-200 text-ink-400 font-num'
                      ]"
                    >
                      <Check v-if="isOneOf(job, ['COMPLETED'])" :size="13" :stroke-width="3" />
                      <span v-else-if="!!job.completionRequestedAt && !isOneOf(job, ['COMPLETED'])" class="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                      <span v-else class="text-[10px]">4</span>
                    </div>
                    <span
                      class="mt-1.5 px-0.5 text-xs font-medium leading-tight text-balance"
                      :class="[
                        isOneOf(job, ['COMPLETED'])
                          ? 'text-ink-900 font-semibold'
                          : (!!job.completionRequestedAt && !isOneOf(job, ['COMPLETED']))
                            ? 'text-brand-700 font-bold'
                            : 'text-ink-400'
                      ]"
                    >
                      Thanh toán
                    </span>
                  </li>
                </ol>
              </div>

              <!-- Quick Field Actions for Technician -->
              <div class="flex flex-wrap items-center gap-2.5 pt-1">
                <a
                  :href="getMapUrl(job.addressSummary)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex-1 sm:flex-none h-14 sm:h-10 px-2 sm:px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 text-xs sm:text-sm font-semibold text-ink-800 inline-flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap transition-colors shadow-2xs"
                  :class="focusRing"
                  @click.stop
                >
                  <Navigation :size="16" class="text-brand-600" />
                  <span>Chỉ đường</span>
                </a>
                <a
                  v-if="job.customerPhone"
                  :href="`tel:${job.customerPhone}`"
                  class="flex-1 sm:flex-none h-14 sm:h-10 px-2 sm:px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 text-xs sm:text-sm font-semibold text-ink-800 inline-flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap transition-colors shadow-2xs"
                  :class="focusRing"
                  @click.stop
                >
                  <Phone :size="16" class="text-success-600" />
                  <span>Gọi điện</span>
                </a>
                <button
                  type="button"
                  class="flex-1 sm:flex-none h-14 sm:h-10 px-2 sm:px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 text-xs sm:text-sm font-semibold text-ink-800 inline-flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap transition-colors shadow-2xs cursor-pointer"
                  :class="focusRing"
                  @click.stop="handleChatWithCustomer(job)"
                >
                  <MessageSquare :size="16" class="text-brand-600" />
                  <span>Nhắn tin</span>
                </button>
                <button
                  type="button"
                  class="w-full sm:w-auto sm:ml-auto h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                  :class="focusRing"
                  @click.stop="router.push(`/tech/jobs/${job.id}`)"
                >
                  <span>Chi tiết đơn</span>
                  <ChevronRight :size="16" />
                </button>
              </div>
            </div>
          </li>
        </ul>

        <div v-else class="px-6 py-12 text-center space-y-3">
          <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto">
            <Briefcase :size="24" />
          </div>
          <h3 class="text-base font-bold text-ink-900">Chưa có việc đang làm</h3>
          <p class="text-sm text-ink-500 max-w-sm mx-auto text-pretty">
            Khi có đơn đặt lịch mới phù hợp với khu vực và chuyên môn của bạn, thông báo và lời mời nhận việc sẽ hiển thị tại đây.
          </p>
        </div>
      </section>

      <!-- Section 5: Recent completed jobs -->
      <section v-if="completedJobs.length > 0" class="bg-white rounded-2xl border border-ink-200/90 shadow-xs overflow-hidden">
        <header class="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between">
          <h2 class="text-lg font-bold text-ink-900">Hoàn thành gần đây</h2>
          <span class="text-xs text-ink-500 font-medium font-num">{{ completedJobs.length }} đơn đã xong</span>
        </header>

        <ul class="divide-y divide-ink-100">
          <li v-for="job in completedJobs.slice(0, 4)" :key="job.id">
            <button
              type="button"
              class="w-full px-5 sm:px-6 py-4 flex items-center gap-4 text-left hover:bg-ink-25/80 transition-colors cursor-pointer"
              :class="focusRing"
              @click="router.push(`/tech/jobs/${job.id}`)"
            >
              <div class="w-10 h-10 rounded-xl bg-success-50 text-success-700 flex items-center justify-center shrink-0">
                <CheckCircle2 :size="20" />
              </div>
              <span class="flex-1 min-w-0 space-y-0.5">
                <span class="flex items-center gap-2">
                  <span class="text-xs font-bold text-ink-600 font-num">#{{ job.code || job.id.slice(0, 8) }}</span>
                  <span class="text-ink-300">·</span>
                  <span class="text-xs text-ink-500">{{ formatScheduledTime(job.completedAt || job.scheduledAt) }}</span>
                </span>
                <span class="block text-sm font-bold text-ink-900 truncate" :title="job.serviceName">{{ job.serviceName }}</span>
                <span class="block text-xs text-ink-500 truncate" :title="job.addressSummary">{{ job.addressSummary }}</span>
              </span>
              <span class="text-right shrink-0 space-y-1">
                <span class="block text-base font-bold text-ink-900 font-num whitespace-nowrap">+{{ money(job.laborTotal || job.grandTotal || 0) }}</span>
                <span
                  class="inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap"
                  :class="isPaid(job) ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'"
                >
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

