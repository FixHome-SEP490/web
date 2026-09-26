<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import {
  Wrench,
  Clock,
  MapPin,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Wallet,
  Star,
  Trophy,
  Briefcase,
  Calendar,
  MessageSquare,
  Phone,
  RefreshCw,
  Navigation,
  Package,
  Headphones,
  Award,
  Sparkles,
  Check,
  Radio,
  ExternalLink,
} from 'lucide-vue-next';

import {
  FhButton,
  FhStatusPill,
  FhCountdown,
} from '../../components';
import { ordersApi, isHistoricalOrder, type ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const loading = ref(true);
const refreshing = ref(false);
const jobs = ref<ServiceOrderItem[]>([]);
const isAvailable = ref<boolean | null>(null);
const profile = ref<TechnicianProfileView | null>(null);
const invitations = ref<InvitationItem[]>([]);
const decliningInvitation = ref(false);
const acceptingInvitation = ref(false);
const togglingAvailability = ref(false);

const topInvitation = computed(() => invitations.value[0] ?? null);

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

const loadData = async () => {
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
  await profileRequest;
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

const completedCount = computed(() => completedJobs.value.length);
const targetPercentage = computed(() => Math.min(Math.round((completedCount.value / 20) * 100), 100));

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
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
};

const currentDateFormatted = computed(() => {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
});
</script>

<template>
  <div class="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-10">
    <!-- 1. Top Hero Command Bar (Modern Desktop Header) -->
    <div class="bg-white rounded-3xl border border-ink-200/90 p-5 sm:p-6 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative overflow-hidden">
      <!-- Background subtle decorative accent -->
      <div class="absolute -right-16 -top-16 w-56 h-56 bg-brand-50/50 rounded-full blur-2xl pointer-events-none" />

      <!-- Left: Avatar, Bio, Status and Service Badges -->
      <div class="flex items-start sm:items-center gap-4 sm:gap-5 relative z-10">
        <!-- Avatar with online badge -->
        <div class="relative shrink-0">
          <div class="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-br from-brand-50 to-blue-50 border-2 border-brand-200 text-brand-700 font-extrabold flex items-center justify-center text-2xl overflow-hidden shadow-sm">
            <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) || 'T' }}</span>
          </div>

          <!-- Unit test required badge: data-testid="technician-receive-status" -->
          <span
            data-testid="technician-receive-status"
            class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white transition-colors shadow-xs"
            :class="isAvailable === true ? 'bg-emerald-500' : 'bg-ink-400'"
            :title="isAvailable === null ? 'Chưa xác định trạng thái nhận đơn' : isAvailable ? 'Đang nhận đơn mới' : 'Tạm ngưng nhận đơn mới'"
          />
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-ink-500 capitalize">{{ currentDateFormatted }}</span>
            <span class="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 border border-brand-200/80 px-2.5 py-0.5 rounded-full shadow-2xs">
              <ShieldCheck :size="13" class="text-brand-600" />
              Đã xác thực KYC
            </span>
            <span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full shadow-2xs">
              <Award :size="13" class="text-amber-600" />
              Thợ Chuyên Nghiệp
            </span>
          </div>

          <div class="flex items-center gap-3">
            <h1 class="text-2xl sm:text-3xl font-black text-ink-900 tracking-tight">
              {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
            </h1>
          </div>

          <!-- Quick Service Scope & Availability Toggle -->
          <div class="flex items-center gap-3 sm:gap-4 flex-wrap text-xs text-ink-600 pt-0.5">
            <span class="flex items-center gap-1 text-ink-600 font-medium">
              <MapPin :size="14" class="text-brand-600 shrink-0" />
              Bán kính: <strong class="text-ink-800 font-bold font-num">{{ profile?.serviceRadiusKm ?? 10 }} km</strong>
            </span>
            <span class="text-ink-300">•</span>
            <span class="flex items-center gap-1 text-ink-600 font-medium">
              <Star :size="14" class="text-amber-500 fill-amber-500 shrink-0" />
              Đánh giá: <strong class="text-ink-800 font-bold font-num">{{ profile?.averageRating ? profile.averageRating.toFixed(1) : '5.0' }}★</strong>
              <span class="text-ink-400">({{ profile?.ratingCount ?? 0 }})</span>
            </span>
            <span class="text-ink-300">•</span>
            <span class="flex items-center gap-1 text-ink-600 font-medium">
              <Sparkles :size="14" class="text-emerald-600 shrink-0" />
              Độ tin cậy: <strong class="text-emerald-700 font-bold font-num">{{ profile?.reliabilityScore ?? 100 }}%</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Right: Shift Status Switch & Control Actions -->
      <div class="flex flex-wrap sm:flex-nowrap items-center gap-3 relative z-10 border-t xl:border-t-0 pt-4 xl:pt-0 border-ink-100">
        <!-- Interactive Online / Offline Toggle Switch -->
        <button
          type="button"
          class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border transition-all duration-200 text-xs font-bold shadow-2xs hover:shadow-xs active:scale-98"
          :class="
            isAvailable === true
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-800 hover:bg-emerald-100/80'
              : isAvailable === false
                ? 'bg-ink-100/90 border-ink-300 text-ink-700 hover:bg-ink-200/80'
                : 'bg-ink-50 border-ink-200 text-ink-500'
          "
          :disabled="togglingAvailability || isAvailable === null"
          @click="toggleAvailability"
        >
          <span
            class="w-2.5 h-2.5 rounded-full transition-colors"
            :class="isAvailable === true ? 'bg-emerald-500 animate-pulse' : 'bg-ink-400'"
          />
          <span class="flex flex-col text-left">
            <span class="text-[10px] uppercase tracking-wider font-extrabold text-ink-400">Trạng thái ca</span>
            <span>{{ isAvailable === true ? 'Đang nhận việc' : isAvailable === false ? 'Tạm nghỉ nhận đơn' : 'Đang tải...' }}</span>
          </span>
          <span
            v-if="togglingAvailability"
            class="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin ml-1"
          />
        </button>

        <!-- Refresh Button -->
        <button
          type="button"
          class="w-10 h-10 rounded-2xl border border-ink-200/90 bg-white hover:bg-ink-50 text-ink-600 flex items-center justify-center transition-colors shadow-2xs"
          title="Làm mới dữ liệu"
          :disabled="refreshing"
          @click="handleRefresh"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': refreshing }" />
        </button>

        <!-- Quick Navigation CTAs -->
        <FhButton variant="secondary" size="md" @click="router.push('/tech/jobs')">
          <Wrench :size="15" class="mr-1.5" /> Việc của tôi
        </FhButton>
        <FhButton
          variant="primary"
          size="md"
          class="relative"
          @click="router.push('/tech/invitations')"
        >
          <Zap :size="15" class="mr-1.5" /> Thư mời nhận đơn
          <span
            v-if="invitations.length > 0"
            class="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-400 text-amber-950 text-[10px] font-extrabold font-num leading-none"
          >
            {{ invitations.length }}
          </span>
        </FhButton>
      </div>
    </div>

    <!-- 2. High Priority Alert: Urgent Invitation Card (If available) -->
    <div
      v-if="topInvitation"
      class="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-50/70 to-white border-2 border-amber-300 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden"
    >
      <div class="space-y-1.5 max-w-2xl">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-black uppercase tracking-wider shadow-xs">
            <Zap :size="13" class="fill-white" />
            Có thư mời nhận đơn mới!
          </span>
          <FhCountdown :expires-at="topInvitation.expiresAt" />
          <span v-if="invitations.length > 1" class="text-xs font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-lg">
            + {{ invitations.length - 1 }} lời mời khác
          </span>
        </div>

        <h3 class="text-lg sm:text-xl font-black text-ink-900 pt-0.5">
          {{ topInvitation.booking?.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
        </h3>

        <div class="flex items-center gap-4 flex-wrap text-xs text-ink-600">
          <p class="flex items-center gap-1.5 font-medium">
            <MapPin :size="14" class="text-brand-600 shrink-0" />
            {{ topInvitation.booking?.addressSummary || 'Khu vực địa phương' }}
          </p>
          <span class="text-ink-300">•</span>
          <p class="flex items-center gap-1.5 font-medium">
            <Clock :size="14" class="text-brand-600 shrink-0" />
            Lịch hẹn: <strong>{{ formatScheduledTime(topInvitation.booking?.preferredStartAt || topInvitation.booking?.preferredEndAt || undefined) }}</strong>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 w-full md:w-auto shrink-0">
        <FhButton
          variant="secondary"
          size="md"
          class="flex-1 md:flex-none border-amber-300 hover:bg-amber-100/50"
          :loading="decliningInvitation"
          @click="declineTopInvitation"
        >
          Từ chối
        </FhButton>
        <FhButton
          variant="primary"
          size="md"
          class="flex-1 md:flex-none bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
          :loading="acceptingInvitation"
          @click="handleAcceptTopInvitation"
        >
          <Check :size="16" class="mr-1.5" />
          Nhận việc ngay
        </FhButton>
      </div>
    </div>

    <!-- 3. Key Performance Indicators (Bento Grid 4 Cards) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <!-- 1. Thu nhập khả dụng -->
      <div class="bg-white rounded-3xl border border-ink-200/90 p-5 shadow-xs hover:border-brand-300 transition-all flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-ink-500">Thu nhập tích lũy</span>
          <div class="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 shadow-2xs">
            <Wallet :size="18" />
          </div>
        </div>
        <div>
          <div class="text-2xl sm:text-3xl font-black text-ink-900 font-num tracking-tight">
            {{ totalEarnings.toLocaleString('vi-VN') }} <span class="text-sm font-bold text-ink-500 font-sans">đ</span>
          </div>
          <p class="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <CheckCircle2 :size="13" /> Thực nhận 85% doanh thu
          </p>
        </div>
        <router-link
          to="/tech/earnings"
          class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 pt-2 border-t border-ink-100"
        >
          <span>Xem chi tiết thu nhập</span>
          <ArrowRight :size="13" />
        </router-link>
      </div>

      <!-- 2. Việc đang xử lý -->
      <div class="bg-white rounded-3xl border border-ink-200/90 p-5 shadow-xs hover:border-brand-300 transition-all flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-ink-500">Công việc đang làm</span>
          <div class="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/60 shadow-2xs">
            <Wrench :size="18" />
          </div>
        </div>
        <div>
          <div class="text-2xl sm:text-3xl font-black text-ink-900 font-num tracking-tight">
            {{ activeJobs.length }} <span class="text-sm font-bold text-ink-500 font-sans">đơn</span>
          </div>
          <p class="text-xs text-blue-600 font-semibold mt-1">
            {{ enRouteJobs.length }} đang di chuyển • {{ underRepairJobs.length }} đang sửa
          </p>
        </div>
        <router-link
          to="/tech/jobs"
          class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 pt-2 border-t border-ink-100"
        >
          <span>Mở danh sách việc</span>
          <ArrowRight :size="13" />
        </router-link>
      </div>

      <!-- 3. Tiến độ hoàn thành -->
      <div class="bg-white rounded-3xl border border-ink-200/90 p-5 shadow-xs hover:border-brand-300 transition-all flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-ink-500">Mục tiêu tuần</span>
          <div class="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-2xs">
            <CheckCircle2 :size="18" />
          </div>
        </div>
        <div class="space-y-2">
          <div class="flex items-baseline justify-between">
            <div class="text-2xl sm:text-3xl font-black text-ink-900 font-num tracking-tight">
              {{ completedCount }} <span class="text-xs font-bold text-ink-500 font-sans">/ 20 đơn</span>
            </div>
            <span class="text-xs font-black text-purple-700 font-num">{{ targetPercentage }}%</span>
          </div>
          <div class="w-full h-2 bg-ink-100 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-purple-500 to-brand-600 rounded-full transition-all duration-500"
              :style="{ width: `${targetPercentage}%` }"
            />
          </div>
        </div>
        <p class="text-xs text-ink-500 font-medium pt-2 border-t border-ink-100">
          Còn <strong class="text-ink-800">{{ Math.max(0, 20 - completedCount) }}</strong> đơn để đạt thưởng tuần
        </p>
      </div>

      <!-- 4. Đánh giá & Uy tín -->
      <div class="bg-white rounded-3xl border border-ink-200/90 p-5 shadow-xs hover:border-brand-300 transition-all flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-ink-500">Chỉ số uy tín</span>
          <div class="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/60 shadow-2xs">
            <Star :size="18" />
          </div>
        </div>
        <div>
          <div class="text-2xl sm:text-3xl font-black text-ink-900 font-num tracking-tight">
            {{ profile?.averageRating ? profile.averageRating.toFixed(2) : '4.95' }} <span class="text-base font-bold text-amber-500 font-sans">★</span>
          </div>
          <p class="text-xs text-amber-700 font-semibold mt-1">
            Độ tin cậy: {{ profile?.reliabilityScore ?? 100 }}/100
          </p>
        </div>
        <router-link
          to="/tech/profile"
          class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 pt-2 border-t border-ink-100"
        >
          <span>Xem hồ sơ & kỹ năng</span>
          <ArrowRight :size="13" />
        </router-link>
      </div>
    </div>

    <!-- 4. Main Desktop Split Layout (8 Cols Workbench + 4 Cols Utilities) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-7 items-start">
      <!-- Left/Main Workspace (8 cols) -->
      <div class="lg:col-span-8 space-y-6">
        <!-- A. Active Orders Workbench -->
        <div class="bg-white rounded-3xl border border-ink-200/90 shadow-xs overflow-hidden">
          <div class="p-5 sm:p-6 border-b border-ink-100 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h2 class="text-base sm:text-lg font-black text-ink-900 tracking-tight">
                Không gian làm việc các đơn đang xử lý
              </h2>
              <span class="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-extrabold font-num">
                {{ activeJobs.length }}
              </span>
            </div>

            <router-link
              to="/tech/jobs"
              class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
            >
              <span>Xem tất cả công việc</span>
              <ArrowRight :size="14" />
            </router-link>
          </div>

          <!-- If there is at least one active job -->
          <div v-if="activeJobs.length > 0" class="divide-y divide-ink-100">
            <div
              v-for="job in activeJobs"
              :key="job.id"
              class="p-5 sm:p-6 space-y-4 hover:bg-ink-50/40 transition-colors"
            >
              <!-- Order Header & Status -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex items-center gap-2.5 flex-wrap">
                    <span class="font-mono text-xs font-extrabold text-ink-700 bg-ink-100 px-2 py-0.5 rounded-md">
                      #{{ job.code || job.id.slice(0, 8) }}
                    </span>
                    <FhStatusPill :status="job.status" />
                    <span class="text-xs text-ink-500 font-medium flex items-center gap-1">
                      <Clock :size="13" class="text-ink-400" />
                      Hẹn lúc: <strong class="text-ink-700">{{ formatScheduledTime(job.scheduledAt) }}</strong>
                    </span>
                  </div>

                  <h3 class="text-base sm:text-lg font-black text-ink-900 pt-0.5">
                    {{ job.serviceName || 'Dịch vụ sửa chữa tại nhà' }}
                  </h3>
                </div>

                <!-- Action Button Cluster -->
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="px-3 py-2 rounded-xl bg-ink-100 hover:bg-ink-200 text-ink-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    title="Nhắn tin với khách hàng"
                    @click="handleChatWithCustomer(job)"
                  >
                    <MessageSquare :size="15" class="text-brand-600" />
                    <span class="hidden sm:inline">Nhắn tin</span>
                  </button>

                  <a
                    v-if="job.customerPhone"
                    :href="`tel:${job.customerPhone}`"
                    class="px-3 py-2 rounded-xl bg-ink-100 hover:bg-ink-200 text-ink-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    title="Gọi cho khách hàng"
                  >
                    <Phone :size="14" class="text-emerald-600" />
                    <span class="hidden sm:inline">Gọi điện</span>
                  </a>

                  <FhButton
                    variant="primary"
                    size="md"
                    @click="router.push(`/tech/jobs/${job.id}`)"
                  >
                    Mở Workspace <ArrowRight :size="14" class="ml-1" />
                  </FhButton>
                </div>
              </div>

              <!-- Customer info and Address with Map direction -->
              <div class="p-3.5 bg-ink-50/70 rounded-2xl border border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div class="space-y-0.5">
                  <p class="font-bold text-ink-800">
                    Khách hàng: <span class="font-normal text-ink-600">{{ job.customerName || 'Khách hàng FixHome' }}</span>
                    <span v-if="job.customerPhone" class="ml-2 font-mono text-ink-500 font-normal">({{ job.customerPhone }})</span>
                  </p>
                  <p class="text-ink-600 flex items-center gap-1.5 font-medium">
                    <MapPin :size="13" class="text-brand-600 shrink-0" />
                    {{ job.addressSummary }}
                  </p>
                </div>

                <a
                  :href="getMapUrl(job.addressSummary)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 bg-white px-3 py-1.5 rounded-xl border border-ink-200/80 shadow-2xs hover:shadow-xs transition-all shrink-0"
                >
                  <Navigation :size="13" class="text-brand-600" />
                  Chỉ đường Google Maps
                  <ExternalLink :size="12" class="text-ink-400" />
                </a>
              </div>

              <!-- Live 4-Step Operational Progress Bar -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
                <!-- Step 1: Di chuyển & Đến nơi -->
                <div
                  class="p-2.5 rounded-xl border flex items-center gap-2"
                  :class="
                    job.arrivalVerified || ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED'].includes(String(job.status).toUpperCase())
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : String(job.status).toUpperCase() === 'EN_ROUTE'
                        ? 'bg-blue-50 text-blue-800 border-blue-200 animate-pulse'
                        : 'bg-ink-50 text-ink-500 border-ink-200'
                  "
                >
                  <CheckCircle2
                    v-if="job.arrivalVerified || ['UNDER_REPAIR', 'IN_PROGRESS', 'COMPLETED'].includes(String(job.status).toUpperCase())"
                    :size="15"
                    class="text-emerald-600 shrink-0"
                  />
                  <Radio v-else :size="15" class="text-blue-600 shrink-0" />
                  <span class="truncate">1. Đến nơi & GPS</span>
                </div>

                <!-- Step 2: Ảnh Before -->
                <div
                  class="p-2.5 rounded-xl border flex items-center gap-2"
                  :class="
                    (job.beforeEvidenceCount ?? 0) > 0 || ['COMPLETED'].includes(String(job.status).toUpperCase())
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : ['UNDER_REPAIR', 'IN_PROGRESS'].includes(String(job.status).toUpperCase())
                        ? 'bg-brand-50 text-brand-800 border-brand-200 font-bold'
                        : 'bg-ink-50 text-ink-500 border-ink-200'
                  "
                >
                  <CheckCircle2
                    v-if="(job.beforeEvidenceCount ?? 0) > 0 || ['COMPLETED'].includes(String(job.status).toUpperCase())"
                    :size="15"
                    class="text-emerald-600 shrink-0"
                  />
                  <Clock v-else :size="15" class="text-ink-400 shrink-0" />
                  <span class="truncate">2. Ảnh hiện trạng</span>
                </div>

                <!-- Step 3: Báo giá & Sửa chữa -->
                <div
                  class="p-2.5 rounded-xl border flex items-center gap-2"
                  :class="
                    ['COMPLETED'].includes(String(job.status).toUpperCase())
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : ['UNDER_REPAIR', 'IN_PROGRESS'].includes(String(job.status).toUpperCase())
                        ? 'bg-brand-50 text-brand-800 border-brand-200 font-bold'
                        : 'bg-ink-50 text-ink-500 border-ink-200'
                  "
                >
                  <CheckCircle2
                    v-if="['COMPLETED'].includes(String(job.status).toUpperCase())"
                    :size="15"
                    class="text-emerald-600 shrink-0"
                  />
                  <Wrench v-else :size="15" class="text-brand-600 shrink-0" />
                  <span class="truncate">3. Báo giá & Sửa</span>
                </div>

                <!-- Step 4: Nghiệm thu -->
                <div
                  class="p-2.5 rounded-xl border flex items-center gap-2"
                  :class="
                    job.customerConfirmed || String(job.status).toUpperCase() === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-ink-50 text-ink-500 border-ink-200'
                  "
                >
                  <CheckCircle2
                    v-if="job.customerConfirmed || String(job.status).toUpperCase() === 'COMPLETED'"
                    :size="15"
                    class="text-emerald-600 shrink-0"
                  />
                  <Clock v-else :size="15" class="text-ink-400 shrink-0" />
                  <span class="truncate">4. Nghiệm thu</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State when no active jobs -->
          <div v-else class="p-8 sm:p-12 text-center space-y-4">
            <div class="w-16 h-16 rounded-3xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto shadow-2xs">
              <Briefcase :size="28" />
            </div>
            <div class="space-y-1 max-w-md mx-auto">
              <h3 class="text-base sm:text-lg font-bold text-ink-900">
                Hiện không có công việc nào đang dang dở
              </h3>
              <p class="text-xs sm:text-sm text-ink-500 leading-relaxed">
                Trạng thái nhận việc của bạn đang hoạt động. Hệ thống sẽ tự động ghép và gửi lời mời khi có đơn mới trong khu vực.
              </p>
            </div>
            <div class="pt-2">
              <FhButton variant="primary" size="md" @click="router.push('/tech/invitations')">
                <Zap :size="15" class="mr-1.5" /> Kiểm tra hộp thư mời nhận việc
              </FhButton>
            </div>
          </div>
        </div>

        <!-- B. Recent Completed Jobs Activity Log -->
        <div v-if="completedJobs.length > 0" class="bg-white rounded-3xl border border-ink-200/90 shadow-xs p-5 sm:p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-ink-900 flex items-center gap-2">
              <CheckCircle2 :size="18" class="text-emerald-600" />
              Công việc đã hoàn thành gần đây
            </h2>
            <router-link to="/tech/jobs" class="text-xs font-bold text-brand-600 hover:text-brand-700">
              Xem tất cả lịch sử
            </router-link>
          </div>

          <div class="divide-y divide-ink-100 border border-ink-100 rounded-2xl overflow-hidden">
            <div
              v-for="job in completedJobs.slice(0, 4)"
              :key="job.id"
              class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-ink-50/50 transition-colors"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xs font-bold text-ink-700">#{{ job.code || job.id.slice(0, 8) }}</span>
                  <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-extrabold">
                    Hoàn tất
                  </span>
                </div>
                <h4 class="text-sm font-bold text-ink-900">{{ job.serviceName }}</h4>
                <p class="text-xs text-ink-500">{{ job.addressSummary }}</p>
              </div>

              <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                <div class="text-right">
                  <div class="text-sm font-black text-ink-900 font-num">
                    +{{ (job.laborTotal || job.grandTotal || 0).toLocaleString('vi-VN') }} đ
                  </div>
                  <span class="text-[10px] text-emerald-600 font-bold">Đã thanh toán</span>
                </div>

                <FhButton variant="secondary" size="sm" @click="router.push(`/tech/jobs/${job.id}`)">
                  Biên bản
                </FhButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right/Side Utilities & Support (4 cols) -->
      <div class="lg:col-span-4 space-y-6">
        <!-- 1. Weekly Milestone & Tier Card -->
        <div class="p-6 rounded-3xl bg-gradient-to-br from-brand-900 via-indigo-950 to-ink-900 text-white shadow-md space-y-5 relative overflow-hidden">
          <div class="absolute -right-8 -bottom-8 w-40 h-40 bg-brand-500/10 rounded-full blur-xl pointer-events-none" />

          <div class="flex items-center justify-between">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-xs">
              <Trophy :size="13" class="text-amber-300" />
              ĐUA TOP KTV FIXHOME
            </div>
            <span class="text-xs font-bold text-indigo-200">Cấp bậc: Vàng</span>
          </div>

          <div class="space-y-2">
            <h3 class="text-lg font-black tracking-tight text-white">
              Chỉ tiêu hoàn thành tuần
            </h3>
            <p class="text-xs text-indigo-100/80 leading-relaxed">
              Hoàn thành 20 đơn/tuần với đánh giá trên 4.8★ để nâng hạn mức nhận việc ưu tiên và nhận voucher thưởng định kỳ.
            </p>
          </div>

          <!-- Progress Bar -->
          <div class="space-y-2 bg-white/5 p-3.5 rounded-2xl border border-white/10">
            <div class="flex items-center justify-between text-xs font-bold">
              <span class="text-indigo-200">Tiến độ tuần</span>
              <span class="text-amber-300 font-num">{{ completedCount }}/20 đơn ({{ targetPercentage }}%)</span>
            </div>
            <div class="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-500"
                :style="{ width: `${targetPercentage}%` }"
              />
            </div>
          </div>

          <button
            type="button"
            class="w-full py-2.5 px-4 rounded-xl bg-white text-ink-900 hover:bg-brand-50 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-98"
            @click="router.push('/tech/jobs')"
          >
            <span>Nhận đơn việc mới</span>
            <ArrowRight :size="14" />
          </button>
        </div>

        <!-- 2. Technician Action Hub (Quick Shortcuts) -->
        <div class="bg-white rounded-3xl border border-ink-200/90 shadow-xs p-5 sm:p-6 space-y-4">
          <h3 class="text-sm font-bold text-ink-900 uppercase tracking-wider text-ink-500">
            Lối tắt nghiệp vụ
          </h3>

          <div class="space-y-2.5">
            <!-- Yêu cầu vật tư / linh kiện -->
            <button
              type="button"
              class="w-full p-3.5 rounded-2xl border border-ink-200/80 hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left flex items-center gap-3.5 group"
              @click="router.push('/tech/jobs')"
            >
              <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                <Package :size="18" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-ink-900 group-hover:text-brand-600 transition-colors">
                  Vật tư & Linh kiện thay thế
                </h4>
                <p class="text-[11px] text-ink-500 truncate">Báo giá và yêu cầu cấp phụ tùng sửa chữa</p>
              </div>
              <ArrowRight :size="14" class="text-ink-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
            </button>

            <!-- Lịch làm việc & Xin nghỉ -->
            <button
              type="button"
              class="w-full p-3.5 rounded-2xl border border-ink-200/80 hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left flex items-center gap-3.5 group"
              @click="router.push('/tech/profile')"
            >
              <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                <Calendar :size="18" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-ink-900 group-hover:text-purple-600 transition-colors">
                  Lịch ca trực & Xin nghỉ phép
                </h4>
                <p class="text-[11px] text-ink-500 truncate">Cài đặt giờ nhận việc và ngày bận</p>
              </div>
              <ArrowRight :size="14" class="text-ink-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
            </button>

            <!-- Cài đặt kỹ năng & Giá nhân công -->
            <button
              type="button"
              class="w-full p-3.5 rounded-2xl border border-ink-200/80 hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left flex items-center gap-3.5 group"
              @click="router.push('/tech/profile')"
            >
              <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                <Wrench :size="18" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-ink-900 group-hover:text-blue-600 transition-colors">
                  Kỹ năng & Đơn giá nhân công
                </h4>
                <p class="text-[11px] text-ink-500 truncate">Cập nhật dịch vụ nhận sửa & giá niêm yết</p>
              </div>
              <ArrowRight :size="14" class="text-ink-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
            </button>

            <!-- Thu nhập & Rút tiền -->
            <button
              type="button"
              class="w-full p-3.5 rounded-2xl border border-ink-200/80 hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left flex items-center gap-3.5 group"
              @click="router.push('/tech/earnings')"
            >
              <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                <Wallet :size="18" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-ink-900 group-hover:text-emerald-600 transition-colors">
                  Ví thu nhập & Rút tiền
                </h4>
                <p class="text-[11px] text-ink-500 truncate">Xem bảng kê chi tiết và lịch sử chuyển khoản</p>
              </div>
              <ArrowRight :size="14" class="text-ink-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        </div>

        <!-- 3. Technician Support Desk & Safety Hotline -->
        <div class="p-5 rounded-3xl bg-amber-50/60 border border-amber-200/80 space-y-3.5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-800 flex items-center justify-center">
              <Headphones :size="16" />
            </div>
            <div>
              <h4 class="text-xs font-bold text-ink-900">Hỗ trợ Kỹ thuật viên 24/7</h4>
              <p class="text-[11px] text-amber-800">Khi gặp tranh chấp hoặc sự cố an toàn</p>
            </div>
          </div>

          <div class="p-3 bg-white rounded-2xl border border-amber-200/60 flex items-center justify-between text-xs">
            <div>
              <span class="text-[10px] text-ink-500 uppercase tracking-wider font-bold block">Tổng đài đối tác</span>
              <a href="tel:1900888666" class="font-extrabold text-brand-700 font-num text-sm hover:underline">
                1900 888 666
              </a>
            </div>
            <a
              href="tel:1900888666"
              class="px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold transition-colors"
            >
              Gọi ngay
            </a>
          </div>

          <p class="text-[11px] text-ink-500 leading-relaxed">
            * Lưu ý: Luôn chụp đầy đủ <strong>ảnh hiện trạng trước và sau khi sửa</strong> để đảm bảo quyền lợi khi đối soát.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
