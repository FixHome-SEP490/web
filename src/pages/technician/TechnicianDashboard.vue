<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  MapPin,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Briefcase,
  Phone,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatCard,
  FhStatusPill,
  FhCountdown,
  FhMoney,
  FhSkeleton,
} from '../../components';
import { techniciansApi, type TechnicianDashboardData } from '../../api/technicians.api';
import { bookingsApi } from '../../api/bookings.api';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const actionLoading = ref(false);
const error = ref<string | null>(null);
const dashboard = ref<TechnicianDashboardData | null>(null);

const loadDashboard = async () => {
  try {
    loading.value = true;
    error.value = null;
    dashboard.value = await techniciansApi.getDashboard();
  } catch (err) {
    error.value = (err as Error)?.message || 'Không thể tải dữ liệu bảng điều khiển kỹ thuật viên.';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadDashboard();
});

const serviceAreasText = computed(() => {
  if (!dashboard.value?.serviceAreas || dashboard.value.serviceAreas.length === 0) {
    return 'Chưa thiết lập khu vực hoạt động (Cần cập nhật để nhận việc)';
  }
  return dashboard.value.serviceAreas
    .map((a) => `${a.districtCode} (${a.provinceCode})`)
    .join(', ');
});

const invitationExpiresAt = computed(() => {
  if (dashboard.value?.latestInvitation?.expiresAt) {
    return new Date(dashboard.value.latestInvitation.expiresAt);
  }
  return new Date(Date.now() + 15 * 60 * 1000);
});

const handleDeclineInvitation = async () => {
  if (!dashboard.value?.latestInvitation?.id) return;
  try {
    actionLoading.value = true;
    await bookingsApi.respondInvitation(dashboard.value.latestInvitation.id, 'DECLINE');
    await loadDashboard();
  } catch (err) {
    alert((err as Error)?.message || 'Không thể từ chối lời mời.');
  } finally {
    actionLoading.value = false;
  }
};
</script>

<template>
  <div class="space-y-8">
    <!-- Welcome Header -->
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 sm:p-8 rounded-[var(--radius-md)] border border-ink-200 shadow-[var(--shadow-e1)]"
    >
      <div class="space-y-1">
        <div class="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded">
          <ShieldCheck :size="14" />
          Kỹ thuật viên FixHome
        </div>
        <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
          Chào buổi làm việc, {{ authStore.user?.fullName || 'Kỹ thuật viên' }}!
        </h1>
        <p class="text-sm text-ink-500">
          Khu vực nhận việc: {{ serviceAreasText }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <FhButton variant="secondary" size="md" @click="router.push('/tech/schedule')">
          Lịch làm việc
        </FhButton>
        <FhButton variant="secondary" size="md" @click="router.push('/tech/platform-dues')">
          Công nợ nền tảng
        </FhButton>
      </div>
    </div>

    <!-- Error state -->
    <div
      v-if="error"
      class="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700 text-xs flex items-center justify-between"
    >
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" @click="loadDashboard">Thử lại</FhButton>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <FhSkeleton height="100px" v-for="i in 4" :key="i" />
      </div>
      <FhSkeleton height="160px" />
    </div>

    <template v-else-if="dashboard">
      <!-- Real Stat Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <FhStatCard
          title="Việc đang thực hiện"
          :value="dashboard.activeOrdersCount"
          subtext="Đơn đang hoạt động"
          :delta="dashboard.activeOrdersCount > 0 ? dashboard.activeOrdersCount : 0"
          delta-label="đơn cần xử lý"
        />
        <FhStatCard
          title="Thu nhập ước tính tháng này"
          :value="dashboard.monthlyEarnings ? `${dashboard.monthlyEarnings.toLocaleString('vi-VN')} ₫` : '0 ₫'"
          subtext="Sau khi trừ 10% phí nền tảng"
        />
        <FhStatCard
          title="Đánh giá trung bình"
          :value="`${dashboard.rating.toFixed(2)} ★`"
          :subtext="dashboard.ratingCount > 0 ? `Từ ${dashboard.ratingCount} lượt đánh giá` : 'Chưa có lượt đánh giá'"
        />
        <FhStatCard
          title="Điểm uy tín (Reliability)"
          :value="`${dashboard.reliabilityScore} / 100`"
          subtext="Chỉ số độ tin cậy FixHome"
        />
      </div>

      <!-- Urgent Invitation Banner (Only if real pending invitation exists) -->
      <div
        v-if="dashboard.latestInvitation"
        class="p-5 rounded-[var(--radius-md)] bg-warning-50/70 border border-warning-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div class="space-y-1 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold uppercase tracking-wider text-warning-700">Lời mời nhận việc mới</span>
            <FhCountdown :expires-at="invitationExpiresAt" />
          </div>
          <h3 class="text-base font-bold text-ink-900">
            {{ dashboard.latestInvitation.serviceTitle }} · {{ dashboard.latestInvitation.address }}
          </h3>
          <p class="text-xs text-ink-600">
            Giá tham khảo gói:
            <strong><FhMoney :amount="dashboard.latestInvitation.estimatedTotal || 0" /></strong>
          </p>
        </div>

        <div class="flex items-center gap-3 w-full sm:w-auto">
          <FhButton
            variant="secondary"
            size="sm"
            class="flex-1 sm:flex-none"
            :disabled="actionLoading"
            @click="handleDeclineInvitation"
          >
            Từ chối
          </FhButton>
          <FhButton
            variant="primary"
            size="sm"
            class="flex-1 sm:flex-none"
            @click="router.push('/tech/invitations')"
          >
            Xem & Nhận đơn ({{ dashboard.pendingInvitations }})
          </FhButton>
        </div>
      </div>

      <!-- Active Job Workspace Section -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-ink-900">Công việc đang thực hiện</h2>
          <router-link
            to="/tech/jobs"
            class="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            Xem tất cả đơn <ArrowRight :size="14" />
          </router-link>
        </div>

        <FhCard v-if="dashboard.activeJob" class="space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-100 pb-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-ink-500">{{ dashboard.activeJob.orderCode }}</span>
                <FhStatusPill :status="dashboard.activeJob.status" />
              </div>
              <h3 class="text-lg font-bold text-ink-900">
                {{ dashboard.activeJob.serviceTitle }}
              </h3>
              <p class="text-xs text-ink-500 flex items-center gap-2">
                <MapPin :size="13" /> {{ dashboard.activeJob.address }}
                <span v-if="dashboard.activeJob.customerName" class="ml-2 flex items-center gap-1 text-ink-700 font-medium">
                  · Khách: {{ dashboard.activeJob.customerName }}
                  <span v-if="dashboard.activeJob.customerPhone" class="flex items-center gap-0.5 text-brand-600">
                    <Phone :size="12" /> {{ dashboard.activeJob.customerPhone }}
                  </span>
                </span>
              </p>
            </div>

            <FhButton
              variant="primary"
              size="md"
              @click="router.push(`/tech/jobs/${dashboard.activeJob.id}`)"
            >
              Mở không gian thực thi
            </FhButton>
          </div>

          <!-- Quick status indicator -->
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-medium">
            <div
              class="p-3 rounded-[var(--radius-sm)] border flex items-center gap-2"
              :class="dashboard.activeJob.status !== 'ACCEPTED' ? 'bg-success-50 text-success-700 border-success-200' : 'bg-brand-50 text-brand-700 border-brand-200 font-bold'"
            >
              <CheckCircle2 :size="16" />
              <span>1. Di chuyển & Check-in</span>
            </div>
            <div
              class="p-3 rounded-[var(--radius-sm)] border flex items-center gap-2"
              :class="dashboard.activeJob.status === 'UNDER_REPAIR' || dashboard.activeJob.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border-success-200' : 'bg-ink-50 text-ink-400 border-ink-200'"
            >
              <CheckCircle2 :size="16" />
              <span>2. Ảnh BEFORE hiện trường</span>
            </div>
            <div
              class="p-3 rounded-[var(--radius-sm)] border flex items-center gap-2"
              :class="dashboard.activeJob.status === 'UNDER_REPAIR' ? 'bg-brand-50 text-brand-700 border-brand-200 font-bold' : (dashboard.activeJob.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border-success-200' : 'bg-ink-50 text-ink-400 border-ink-200')"
            >
              <Briefcase :size="16" />
              <span>3. Tiến hành sửa chữa</span>
            </div>
            <div
              class="p-3 rounded-[var(--radius-sm)] border flex items-center gap-2"
              :class="dashboard.activeJob.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border-success-200' : 'bg-ink-50 text-ink-400 border-ink-200'"
            >
              <span>4. Ảnh AFTER & Nghiệm thu</span>
            </div>
          </div>
        </FhCard>

        <!-- Empty active job state -->
        <div
          v-else
          class="p-8 bg-white rounded-[var(--radius-md)] border border-ink-200 text-center space-y-3"
        >
          <div class="inline-flex p-3 rounded-full bg-ink-50 text-ink-400">
            <AlertCircle :size="28" />
          </div>
          <h4 class="text-sm font-bold text-ink-900">Hiện chưa có công việc nào đang thực hiện</h4>
          <p class="text-xs text-ink-500 max-w-md mx-auto">
            Bạn có thể kiểm tra danh sách lời mời nhận việc mới hoặc xem lịch làm việc để sẵn sàng phục vụ khách hàng.
          </p>
          <div class="pt-2">
            <FhButton variant="primary" size="sm" @click="router.push('/tech/invitations')">
              Xem lời mời nhận việc ({{ dashboard.pendingInvitations }})
            </FhButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
