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
  ChevronRight,
  Calendar,
  MessageSquare,
} from 'lucide-vue-next';

import {
  FhButton,
  FhStatusPill,
  FhCountdown,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const loading = ref(true);
const jobs = ref<ServiceOrderItem[]>([]);
const isAvailable = ref(true);
const invitationExpires = new Date(Date.now() + 12 * 60 * 1000);

onMounted(async () => {
  try {
    const list = await ordersApi.getTechnicianJobs();
    jobs.value = list;
  } catch {
    jobs.value = [];
  } finally {
    loading.value = false;
  }
});

const completedJobs = computed(() => {
  return jobs.value.filter((j) => String(j.status).toUpperCase() === 'COMPLETED');
});

const activeJobs = computed(() => {
  return jobs.value.filter((j) =>
    ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(j.status).toUpperCase())
  );
});

// Currently active job to work on
const currentActiveJob = computed(() => {
  return activeJobs.value[0] || null;
});

const totalEarnings = computed(() => {
  return completedJobs.value.reduce((sum, j) => sum + (j.laborTotal || j.grandTotal || 0), 0);
});

// Target calculation: 20 jobs weekly target matching Mobile
const completedCount = computed(() => completedJobs.value.length);
const targetPercentage = computed(() => Math.min(Math.round((completedCount.value / 20) * 100), 100));

const handleChatWithCustomer = async (order: ServiceOrderItem) => {
  const bookingId = order.bookingId || order.id;
  await chatStore.openConversationForBooking(bookingId);
  chatStore.toggleWidget(true);
};
</script>

<template>
  <div class="space-y-6 sm:space-y-7 max-w-5xl mx-auto">
    <!-- 1. Hero Greeting & Verified Profile Card -->
    <div class="bg-white rounded-3xl border border-ink-200/80 p-5 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
      <div class="flex items-center gap-4">
        <!-- Avatar with online badge -->
        <div class="relative">
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-50 border-2 border-brand-200 text-brand-700 font-extrabold flex items-center justify-center text-xl overflow-hidden shadow-xs">
            <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) || 'T' }}</span>
          </div>
          <span
            class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white transition-colors"
            :class="isAvailable ? 'bg-emerald-500' : 'bg-ink-400'"
            title="Trạng thái nhận việc"
          />
        </div>

        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-ink-500 font-medium">Xin chào 👋</span>
            <span class="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 border border-brand-200/60 px-2 py-0.5 rounded-full">
              <ShieldCheck :size="13" class="text-brand-600" />
              Đã duyệt KYC
            </span>
          </div>
          <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
            {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
          </h1>
          <p class="text-xs text-ink-500 flex items-center gap-1">
            <MapPin :size="13" class="text-brand-600 shrink-0" />
            Khu vực hoạt động: Toàn thành phố (Đã liên kết định vị)
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <FhButton variant="secondary" size="md" @click="router.push('/tech/jobs')">
          <Wrench :size="15" class="mr-1.5" /> Việc của tôi
        </FhButton>
        <FhButton variant="primary" size="md" @click="router.push('/tech/invitations')">
          <Zap :size="15" class="mr-1.5" /> Thư mời nhận đơn
        </FhButton>
      </div>
    </div>

    <!-- 2. Overview Row (4 Mobile-style Linear Gradient Cards) -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Briefcase :size="18" class="text-brand-600" />
        <h2 class="text-base font-bold text-ink-900">Tổng quan tuần này</h2>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <!-- Thu nhập (Sky Gradient) -->
        <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-sky-100 via-sky-50 to-white border border-sky-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-sky-800">Thu nhập</span>
            <div class="w-8 h-8 rounded-xl bg-sky-200/70 text-sky-700 flex items-center justify-center shadow-xs">
              <Wallet :size="16" />
            </div>
          </div>
          <div>
            <div class="text-lg sm:text-2xl font-extrabold text-sky-950 font-num">
              {{ totalEarnings.toLocaleString('vi-VN') }} <span class="text-xs font-bold text-sky-700 font-sans">đ</span>
            </div>
            <p class="text-[11px] text-sky-600 font-medium mt-0.5">Thực nhận 85%</p>
          </div>
        </div>

        <!-- Hoàn thành (Amber Gradient) -->
        <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-white border border-amber-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-800">Hoàn thành</span>
            <div class="w-8 h-8 rounded-xl bg-amber-200/70 text-amber-700 flex items-center justify-center shadow-xs">
              <CheckCircle2 :size="16" />
            </div>
          </div>
          <div>
            <div class="text-lg sm:text-2xl font-extrabold text-amber-950 font-num">
              {{ completedCount }} <span class="text-xs font-bold text-amber-700 font-sans">đơn</span>
            </div>
            <p class="text-[11px] text-amber-600 font-medium mt-0.5">Tỷ lệ xong 98%</p>
          </div>
        </div>

        <!-- Đơn đang chờ (Violet Gradient) -->
        <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-violet-100 via-violet-50 to-white border border-violet-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-violet-800">Cần xử lý</span>
            <div class="w-8 h-8 rounded-xl bg-violet-200/70 text-violet-700 flex items-center justify-center shadow-xs">
              <Zap :size="16" />
            </div>
          </div>
          <div>
            <div class="text-lg sm:text-2xl font-extrabold text-violet-950 font-num">
              {{ activeJobs.length }} <span class="text-xs font-bold text-violet-700 font-sans">đơn</span>
            </div>
            <p class="text-[11px] text-violet-600 font-medium mt-0.5">Đang di chuyển / sửa</p>
          </div>
        </div>

        <!-- Đánh giá (Emerald Gradient) -->
        <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-100 via-emerald-50 to-white border border-emerald-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-800">Đánh giá</span>
            <div class="w-8 h-8 rounded-xl bg-emerald-200/70 text-emerald-700 flex items-center justify-center shadow-xs">
              <Star :size="16" />
            </div>
          </div>
          <div>
            <div class="text-lg sm:text-2xl font-extrabold text-emerald-950 font-num">
              4.92 <span class="text-xs font-bold text-emerald-700 font-sans">★</span>
            </div>
            <p class="text-[11px] text-emerald-600 font-medium mt-0.5">Độ uy tín: 100/100</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Mục tiêu tuần (Matching Mobile ProgressBar) -->
    <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-3">
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 font-bold text-ink-800">
          <div class="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <Calendar :size="15" />
          </div>
          <span>Mục tiêu tuần</span>
        </div>
        <span class="font-bold text-brand-700 font-num">{{ completedCount }}/20 đơn ({{ targetPercentage }}%)</span>
      </div>

      <div class="w-full h-2.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-brand-600 to-blue-500 rounded-full transition-all duration-500"
          :style="{ width: `${targetPercentage}%` }"
        />
      </div>
    </div>

    <!-- 4. Quick Shortcut CTA to Jobs (Matching Mobile) -->
    <div
      class="p-4 sm:p-5 rounded-2xl bg-white border border-ink-200/80 hover:border-brand-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
      @click="router.push('/tech/jobs')"
    >
      <div class="flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
          <Briefcase :size="22" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-ink-900 group-hover:text-brand-600 transition-colors">
            Quản lý công việc
          </h3>
          <p class="text-xs text-ink-500 mt-0.5">
            {{ activeJobs.length > 0 ? `Có ${activeJobs.length} đơn đang cần bạn xử lý` : 'Xem danh sách việc nhận và lịch sử thi công' }}
          </p>
        </div>
      </div>
      <div class="w-8 h-8 rounded-full bg-ink-50 flex items-center justify-center text-ink-400 group-hover:bg-brand-600 group-hover:text-white transition-all">
        <ChevronRight :size="18" />
      </div>
    </div>

    <!-- 5. Urgent Invitation Banner (If new invitations pending) -->
    <div class="p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-50 to-white border border-amber-300/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-xs">
            <Zap :size="12" class="fill-white" />
            Lời mời nhận việc mới
          </span>
          <FhCountdown :expires-at="invitationExpires" />
        </div>
        <h3 class="text-sm sm:text-base font-bold text-ink-900">
          Vệ sinh điều hòa Daikin Inverter · 142 Nguyễn Thị Minh Khai, Q.3 (Cách 1.8 km)
        </h3>
        <p class="text-xs text-ink-600">
          Hẹn lúc: Hôm nay · Thu nhập dự kiến: 180.000 ₫ – 220.000 ₫
        </p>
      </div>

      <div class="flex items-center gap-2.5 w-full sm:w-auto">
        <FhButton variant="secondary" size="sm" class="flex-1 sm:flex-none">
          Từ chối
        </FhButton>
        <FhButton variant="primary" size="sm" class="flex-1 sm:flex-none" @click="router.push('/tech/invitations')">
          Xem & Nhận đơn
        </FhButton>
      </div>
    </div>

    <!-- 6. Active Job Workspace Card (If active order present) -->
    <div v-if="currentActiveJob" class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-bold text-ink-900 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Công việc đang thực hiện
        </h2>
        <router-link to="/tech/jobs" class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
          Xem tất cả đơn <ArrowRight :size="14" />
        </router-link>
      </div>

      <div class="bg-white rounded-3xl border border-ink-200/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-100 pb-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-bold text-ink-700">#{{ currentActiveJob.code || currentActiveJob.id.slice(0, 8) }}</span>
              <FhStatusPill :status="currentActiveJob.status" />
            </div>
            <h3 class="text-base sm:text-lg font-extrabold text-ink-900">
              {{ currentActiveJob.serviceName || 'Dịch vụ sửa chữa' }}
            </h3>
            <p class="text-xs text-ink-600 flex items-center gap-1.5">
              <MapPin :size="14" class="text-brand-600 shrink-0" />
              {{ currentActiveJob.addressSummary }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3.5 py-2 rounded-xl bg-ink-100 hover:bg-ink-200 text-ink-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
              @click="handleChatWithCustomer(currentActiveJob)"
            >
              <MessageSquare :size="15" class="text-brand-600" />
              <span>Nhắn tin</span>
            </button>
            <FhButton variant="primary" size="md" @click="router.push(`/tech/jobs/${currentActiveJob.id}`)">
              Mở Workspace <ArrowRight :size="14" class="ml-1" />
            </FhButton>
          </div>
        </div>

        <!-- 4 Sequential Stages Checklist -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium">
          <div class="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 :size="16" class="text-emerald-600 shrink-0" />
            <span>1. Đến nơi & GPS</span>
          </div>
          <div class="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 :size="16" class="text-emerald-600 shrink-0" />
            <span>2. Ảnh Before</span>
          </div>
          <div class="p-3 bg-brand-50 text-brand-800 rounded-xl border border-brand-200 flex items-center gap-2 font-bold">
            <Clock :size="16" class="text-brand-600 shrink-0" />
            <span>3. Báo giá sửa</span>
          </div>
          <div class="p-3 bg-ink-50 text-ink-400 rounded-xl border border-ink-200 flex items-center gap-2">
            <span>4. Nghiệm thu</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 7. Bottom Promotional Banner "Đua Top KTV FixHome" (Matching Mobile) -->
    <div class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-brand-700 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
      <div class="space-y-2 text-center sm:text-left">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-xs">
          <Trophy :size="13" class="text-amber-300" />
          ĐUA TOP KTV FIXHOME
        </div>
        <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight">
          Hoàn thành xuất sắc nhiệm vụ nhận thưởng quý
        </h3>
        <p class="text-xs sm:text-sm text-blue-100 max-w-xl leading-relaxed">
          Đạt mốc 20 đơn/tuần với đánh giá trên 4.8★ để nâng hạn mức nhận việc ưu tiên và nhận voucher thưởng định kỳ.
        </p>
      </div>

      <button
        type="button"
        class="px-5 py-2.5 rounded-xl bg-white text-brand-700 hover:bg-blue-50 text-xs font-bold shrink-0 transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
        @click="router.push('/tech/jobs')"
      >
        <span>Nhận việc ngay</span>
        <ChevronRight :size="15" />
      </button>
    </div>
  </div>
</template>
