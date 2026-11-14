<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { useChatStore } from '../../stores/chat.store';
import {
  Clock,
  MapPin,
  CheckCircle2,
  MessageSquare,
  Phone,
  RefreshCw,
  Navigation,
  Check,
  AlertCircle,
  ChevronRight,
  User,
  Wallet,
  TrendingUp,
  Star,
} from 'lucide-vue-next';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

import {
  FhButton,
  FhStatusPill,
  FhCountdown,
  FhSkeleton,
} from '../../components';
import type { ServiceOrderItem } from '../../api/orders.api';
import { technicianEarningsApi, type EarningsSummary } from '../../api/technician-earnings.api';
import { periodContaining } from '../../utils/earnings-period';
import { hasRating, ratingLabel } from '../../utils/formatters';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { sessionLabel } from '../../utils/booking-session';
import TechnicianJobStepper from '../../components/technician/TechnicianJobStepper.vue';
import { availabilityText, type TechnicianAvailability } from '../../utils/availability';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';
import { userFacingError } from '../../utils/user-facing-error';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { sharedQueries } from '../../lib/queries';

const router = useRouter();
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

const earningsRange = ref<'day' | 'week'>('week');
const earningsPeriod = computed(() => periodContaining(earningsRange.value));
const earningsQuery = useCachedQuery<EarningsSummary>({
  key: () => queryKeys.earnings.period({ from: earningsPeriod.value.from ?? null, to: earningsPeriod.value.to ?? null }),
  fetch: () => technicianEarningsApi.getMyEarnings({
    from: earningsPeriod.value.from,
    to: earningsPeriod.value.to,
    page: 1,
    pageSize: 1,
  }),
});
const earningsSummary = computed<EarningsSummary | null>(() =>
  earningsQuery.error.value ? null : (earningsQuery.data.value ?? null),
);

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
const handleRefresh = async () => {
  refreshing.value = true;
  await Promise.all(
    [jobsQuery, invitationsQuery, walletQuery, profileQuery, availabilityQuery, earningsQuery].map((q) => q.refetch()),
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

const nextStep = (job: ServiceOrderItem) => {
  if (job.completionRequestedAt) return 'Đã gửi yêu cầu hoàn thành. Xem chi tiết để theo dõi xác nhận và thanh toán.';
  if (['UNDER_REPAIR', 'IN_PROGRESS'].includes(String(job.status).toUpperCase())) {
    return (job.beforeEvidenceCount ?? 0) > 0 ? 'Tiếp tục báo giá và sửa chữa trong chi tiết đơn.' : 'Chụp ảnh hiện trạng trước khi tiếp tục sửa chữa.';
  }
  return String(job.status).toUpperCase() === 'EN_ROUTE' ? 'Đang di chuyển. Mở chi tiết đơn khi đến nơi.' : 'Đã nhận đơn. Kiểm tra lịch hẹn và bắt đầu di chuyển.';
};

const dashboardStepNumber = (job: ServiceOrderItem): 1 | 2 | 3 | 4 | 5 => {
  const s = String(job.status).toUpperCase();
  if (s === 'COMPLETED' || job.completionRequestedAt) return 5;
  if (['UNDER_REPAIR', 'IN_PROGRESS'].includes(s)) return 4;
  if (s === 'EN_ROUTE' && job.arrivalVerified && (job.beforeEvidenceCount ?? 0) > 0) return 3;
  if (s === 'EN_ROUTE') return 2;
  return 1;
};

const dashboardStepsForJob = (job: ServiceOrderItem) => {
  const current = dashboardStepNumber(job);
  const allDone = String(job.status).toUpperCase() === 'COMPLETED';
  return ['Xuất phát', 'Check-in, ảnh', 'Báo giá', 'Sửa xong, ảnh', 'Thu tiền'].map((label, idx) => {
    const n = idx + 1;
    const done = allDone || n < current;
    return {
      n,
      label,
      state: done ? ('done' as const) : n === current ? ('current' as const) : ('todo' as const),
    };
  });
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
</script>

<template>
  <div class="w-full mx-auto space-y-5">
    <header class="animate-slide-up bg-white rounded-2xl border border-ink-200/90 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="min-w-0 space-y-1.5">
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">Tổng quan</h1>
          <span class="text-xs sm:text-sm font-medium text-ink-500">· {{ currentDateFormatted }}</span>
        </div>
        <p data-testid="availability-status" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
          <span data-testid="technician-receive-status" class="h-2.5 w-2.5 rounded-full shrink-0" :class="availabilityView.receiving ? 'bg-success-600 animate-pulse' : 'bg-ink-400'" :title="availabilityView.title" />
          <span class="font-semibold" :class="availabilityView.receiving ? 'text-success-700' : 'text-ink-700'">{{ availabilityView.title }}</span>
          <span v-if="availabilityDetail" class="text-ink-500">{{ availabilityDetail }}</span>
        </p>
      </div>

      <div class="flex items-center justify-between md:justify-end gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-ink-100 flex-wrap">
        <div v-if="profile" class="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 rounded-xl border border-ink-200/70 text-ink-700 font-medium">
            <MapPin :size="14" class="text-ink-400 shrink-0" />
            <span>Bán kính</span>
            <strong class="font-bold text-ink-900 font-num">{{ profile.serviceRadiusKm }} km</strong>
          </div>
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 rounded-xl border border-ink-200/70 text-ink-700 font-medium">
            <Star :size="14" class="text-warning-500 fill-warning-500 shrink-0" />
            <strong class="font-bold text-ink-900 font-num">{{ hasRating(profile.averageRating, profile.ratingCount) ? ratingLabel(profile.averageRating, profile.ratingCount) : 'Chưa có đánh giá' }}</strong>
            <span v-if="profile.ratingCount" class="text-ink-400 text-xs">({{ profile.ratingCount }})</span>
          </div>
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 rounded-xl border border-ink-200/70 text-ink-700 font-medium">
            <span>Tin cậy</span>
            <strong class="font-bold font-num text-ink-900">{{ profile.reliabilityScore != null ? profile.reliabilityScore + '%' : '—' }}</strong>
          </div>
        </div>
        <button
        type="button"
        class="shrink-0 w-10 h-10 rounded-xl text-ink-500 hover:text-ink-800 hover:bg-ink-100 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50"
        aria-label="Làm mới"
        title="Làm mới"
        :disabled="refreshing"
        @click="handleRefresh"
      >
        <RefreshCw :size="18" :class="refreshing ? 'animate-spin' : ''" />
      </button>
      </div>
    </header>

    <!-- 2. A job offer waiting for an answer: the main urgent action when there is one -->
    <Transition name="fh-fade-slide">
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
            class="h-11 px-5 rounded-xl font-bold bg-brand-600 hover:bg-brand-700 text-white "
            :loading="acceptingInvitation"
            @click="handleAcceptTopInvitation"
          >
            <Check :size="18" />
            <span>Chấp nhận đơn này</span>
          </FhButton>
        </div>
      </section>
    </Transition>


    <!-- 2-Card Summary: Thu nhập & Số dư ví -->
    <section data-testid="dashboard-summary" aria-label="Thu nhập và ví" class="animate-slide-up-delay-1 grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Card 1: Thu nhập -->
      <div class="group relative overflow-hidden rounded-2xl bg-white border border-ink-200/90 p-5 sm:p-6 shadow-2xs hover:border-ink-300 hover:shadow-xs transition-[border-color,box-shadow] duration-150 flex flex-col justify-between gap-5">
        <TrendingUp
          :size="136"
          :stroke-width="1.2"
          class="pointer-events-none select-none absolute -right-4 -bottom-6 text-ink-900/[0.045] transition-transform duration-300 ease-out group-hover:scale-105 group-hover:-translate-x-1"
          aria-hidden="true"
        />

        <div class="relative z-10 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-ink-900">Thu nhập</h2>
            <p class="text-xs text-ink-500">Thực nhận sau phí</p>
          </div>

          <div class="inline-flex items-center rounded-xl bg-ink-100/90 p-0.5 text-xs font-medium" role="group" aria-label="Khoảng thu nhập">
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg transition-[background-color,color,box-shadow] duration-150 cursor-pointer"
              :class="earningsRange === 'day' ? 'bg-white text-ink-900 font-semibold shadow-2xs' : 'text-ink-600 hover:text-ink-900'"
              :aria-pressed="earningsRange === 'day'"
              @click="earningsRange = 'day'"
            >
              Hôm nay
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg transition-[background-color,color,box-shadow] duration-150 cursor-pointer"
              :class="earningsRange === 'week' ? 'bg-white text-ink-900 font-semibold shadow-2xs' : 'text-ink-600 hover:text-ink-900'"
              :aria-pressed="earningsRange === 'week'"
              @click="earningsRange = 'week'"
            >
              Tuần này
            </button>
          </div>
        </div>

        <div class="relative z-10">
          <FhSkeleton v-if="earningsQuery.loading.value" width="160px" height="36px" />
          <p v-else class="text-3xl sm:text-[34px] leading-none font-bold font-num tracking-tight text-ink-900">
            {{ earningsSummary ? money(earningsSummary.totalNet) : '—' }}
          </p>
        </div>

        <div class="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-ink-100 text-xs sm:text-sm">
          <div v-if="earningsSummary" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-600">
            <span><strong class="font-num font-semibold text-ink-900">{{ earningsSummary.totalCompletedOrders }}</strong> đơn xong</span>
            <span class="text-ink-300">·</span>
            <span>Tiền công <strong class="font-num font-semibold text-ink-800 whitespace-nowrap">{{ money(earningsSummary.totalGross) }}</strong></span>
          </div>
          <span v-else class="text-ink-500 text-xs sm:text-sm">Theo dõi tiền công và trạng thái thanh toán.</span>
          <router-link to="/tech/earnings" class="group/link inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 whitespace-nowrap rounded" :class="focusRing">
            <span>Chi tiết</span>
            <ChevronRight :size="15" class="transition-transform duration-150 group-hover/link:translate-x-0.5" />
          </router-link>
        </div>
      </div>

      <!-- Card 2: Số dư ví -->
      <div class="group relative overflow-hidden rounded-2xl bg-white border border-ink-200/90 p-5 sm:p-6 shadow-2xs hover:border-ink-300 hover:shadow-xs transition-[border-color,box-shadow] duration-150 flex flex-col justify-between gap-5">
        <Wallet
          :size="132"
          :stroke-width="1.2"
          class="pointer-events-none select-none absolute -right-4 -bottom-6 text-ink-900/[0.045] transition-transform duration-300 ease-out group-hover:scale-105 group-hover:-translate-x-1"
          aria-hidden="true"
        />

        <div class="relative z-10 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-ink-900">Số dư ví</h2>
            <p class="text-xs text-ink-500">Ký quỹ nhận việc</p>
          </div>

          <router-link to="/tech/wallet" class="group/link inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800 whitespace-nowrap rounded" :class="focusRing">
            <span>Quản lý ví</span>
            <ChevronRight :size="15" class="transition-transform duration-150 group-hover/link:translate-x-0.5" />
          </router-link>
        </div>

        <div class="relative z-10">
          <FhSkeleton v-if="walletQuery.loading.value" width="140px" height="36px" />
          <p v-else class="text-3xl sm:text-[34px] leading-none font-bold font-num tracking-tight" :class="wallet && wallet.balance < 0 ? 'text-danger-700' : 'text-ink-900'">
            {{ wallet ? money(wallet.balance) : '—' }}
          </p>
        </div>

        <div class="relative z-10 pt-3 border-t border-ink-100 text-xs sm:text-sm">
          <p v-if="wallet" class="inline-flex items-center gap-1.5 font-medium" :class="wallet.eligibleForJobs ? 'text-success-700' : 'text-danger-700 font-semibold'">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="wallet.eligibleForJobs ? 'bg-success-600' : 'bg-danger-600'" aria-hidden="true" />
            <template v-if="wallet.eligibleForJobs">Đủ điều kiện nhận việc</template>
            <template v-else>Dưới mức ký quỹ <span class="font-num font-bold whitespace-nowrap">{{ money(wallet.minimumBalance) }}</span></template>
          </p>
          <p v-else-if="walletQuery.error.value" class="text-danger-700">Không thể tải số dư ví. Vui lòng tải lại.</p>
          <span v-else class="text-ink-400">Đang tải trạng thái ví…</span>
        </div>
      </div>
    </section>

    <!-- 4. Work in progress, then recent completions -->
    <div class="animate-slide-up-delay-2 space-y-6">
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
                <div class="inline-flex items-center gap-1.5 text-xs sm:text-sm text-ink-600 shrink-0">
                  <Clock :size="15" class="text-brand-600" />
                  <span>Hẹn lúc:</span>
                  <strong class="font-bold text-ink-900 font-num">{{ formatScheduledTime(job.scheduledAt) }}</strong>
                </div>
              </div>

              <!-- Service & Customer Details -->
              <div class="space-y-1.5">
                <h3 class="text-base sm:text-lg font-semibold text-ink-900 text-balance">
                  <router-link :to="`/tech/jobs/${job.id}`" :class="focusRing" class="rounded hover:text-brand-700">
                  {{ job.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
                  </router-link>
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
                    <span class="text-pretty break-words" :title="job.addressSummary">{{ job.addressSummary }}</span>
                  </p>
                </div>
              </div>

              <!-- 5-step connected node progress tracker + next instruction -->
              <div class="pt-3 border-t border-ink-100/80 space-y-2">
                <TechnicianJobStepper :steps="dashboardStepsForJob(job)" compact />
                <p class="text-sm text-ink-600">{{ nextStep(job) }}</p>
              </div>

              <!-- Quick Field Actions for Technician -->
              <div class="flex flex-wrap items-center gap-2.5 pt-1">
                <a
                  :href="getMapUrl(job.addressSummary)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex-1 sm:flex-none h-11 px-2 sm:px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 text-xs sm:text-sm font-semibold text-ink-800 active:scale-[0.98] inline-flex flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap transition-[background-color,transform] duration-150 "
                  :class="focusRing"
                  @click.stop
                >
                  <Navigation :size="16" class="text-brand-600" />
                  <span>Chỉ đường</span>
                </a>
                <a
                  v-if="job.customerPhone"
                  :href="`tel:${job.customerPhone}`"
                  class="flex-1 sm:flex-none h-11 px-2 sm:px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 text-xs sm:text-sm font-semibold text-ink-800 active:scale-[0.98] inline-flex flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap transition-[background-color,transform] duration-150 "
                  :class="focusRing"
                  @click.stop
                >
                  <Phone :size="16" class="text-success-600" />
                  <span>Gọi điện</span>
                </a>
                <button
                  type="button"
                  class="flex-1 sm:flex-none h-11 px-2 sm:px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 text-xs sm:text-sm font-semibold text-ink-800 active:scale-[0.98] inline-flex flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap transition-[background-color,transform] duration-150 cursor-pointer"
                  :class="focusRing"
                  @click.stop="handleChatWithCustomer(job)"
                >
                  <MessageSquare :size="16" class="text-brand-600" />
                  <span>Nhắn tin</span>
                </button>
                <button
                  type="button"
                  class="w-full sm:w-auto sm:ml-auto h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 active:scale-[0.98] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-[background-color,transform] duration-150 shadow-xs cursor-pointer"
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
          <div class="mx-auto mb-2 max-w-[140px] flex items-center justify-center">
            <img
              :src="'/images/ui/role-choice-technician.png'"
              alt=""
              class="w-full h-auto max-h-32 object-contain drop-select-none pointer-events-none"
              loading="lazy"
            />
          </div>
          <h3 class="text-base font-bold text-ink-900">Chưa có việc đang làm</h3>
          <p class="text-sm text-ink-500 max-w-sm mx-auto text-pretty">
            Khi có đơn đặt lịch mới phù hợp với khu vực và chuyên môn của bạn, thông báo và lời mời nhận việc sẽ hiển thị tại đây.
          </p>
        </div>
      </section>


      

      <!-- Recent completed jobs -->
      <section v-if="completedJobs.length > 0" class="bg-white rounded-2xl border border-ink-200/90 shadow-xs overflow-hidden">
        <header class="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <h2 class="text-lg font-bold text-ink-900">Hoàn thành gần đây</h2>
            <span class="text-xs text-ink-500 font-medium font-num">{{ completedJobs.length }} đơn đã xong</span>
          </div>
          <router-link
            to="/tech/jobs"
            class="h-9 px-3 rounded-xl text-sm font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
            :class="focusRing"
          >
            <span>Xem lịch sử</span>
            <ChevronRight :size="16" />
          </router-link>
        </header>

        <ul class="divide-y divide-ink-100">
          <li v-for="(job, idx) in completedJobs.slice(0, 4)" :key="job.id" class="animate-slide-up" :style="{ animationDelay: `${idx * 35}ms` }">
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

