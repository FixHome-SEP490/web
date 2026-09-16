<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  CalendarPlus,
  ShieldCheck,
  History,
  ArrowRight,
  Clock,
  Wrench,
  AlertCircle,
  Sparkles,
  UserCheck,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhMoney,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref<string | null>(null);
const recentOrders = ref<ServiceOrderItem[]>([]);
const activeBookings = ref<BookingItem[]>([]);

const loadDashboardData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const [orders, bookings] = await Promise.all([
      ordersApi.getCustomerOrders().catch((err) => {
        console.warn('Could not load orders:', err);
        return [] as ServiceOrderItem[];
      }),
      bookingsApi.getMyBookings().catch((err) => {
        console.warn('Could not load bookings:', err);
        return [] as BookingItem[];
      }),
    ]);

    recentOrders.value = orders;
    // Active bookings are SUBMITTED or MATCHING
    activeBookings.value = bookings.filter(
      (b) => b.status === 'SUBMITTED' || b.status === 'MATCHING',
    );
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải dữ liệu bảng điều khiển';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadDashboardData();
});

// Find first in-progress order (ACCEPTED, EN_ROUTE, UNDER_REPAIR)
const activeOrder = computed(() => {
  return recentOrders.value.find((o) =>
    ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'].includes(o.status),
  );
});

// Completed or past orders
const completedOrders = computed(() => {
  return recentOrders.value.slice(0, 5);
});
</script>

<template>
  <div class="space-y-8">
    <!-- Welcome Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 sm:p-8 rounded-[var(--radius-md)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div class="space-y-1">
        <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
          Xin chào, {{ authStore.user?.fullName || 'Quý khách' }}!
        </h1>
        <p class="text-sm text-ink-500">
          Quản lý lịch sửa chữa thiết bị và các dịch vụ bảo hành gia đình của bạn.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <FhButton
          variant="secondary"
          size="md"
          @click="router.push('/app/bookings/new')"
        >
          <Sparkles :size="16" class="text-amber-500 mr-1.5" />
          Chẩn đoán AI
        </FhButton>
        <FhButton
          variant="primary"
          size="md"
          @click="router.push('/app/bookings/new')"
        >
          <CalendarPlus :size="18" class="mr-1.5" />
          Đặt dịch vụ
        </FhButton>
      </div>
    </div>

    <!-- Active Order Banner if any -->
    <div
      v-if="activeOrder"
      class="bg-gradient-to-r from-brand-900 to-brand-800 text-white p-6 rounded-[var(--radius-md)] shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6"
    >
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded bg-brand-700/80 text-[11px] font-bold uppercase tracking-wider text-brand-100">
            Đơn đang thực hiện
          </span>
          <span class="text-xs text-brand-200 font-num font-semibold">{{ activeOrder.code }}</span>
        </div>
        <h3 class="text-xl font-bold text-white">
          {{ activeOrder.serviceName }}
        </h3>
        <div class="flex flex-wrap items-center gap-4 text-xs text-brand-200">
          <span v-if="activeOrder.technician" class="flex items-center gap-1.5">
            <UserCheck :size="15" class="text-emerald-400" />
            Thợ: <strong class="text-white">{{ activeOrder.technician.fullName }}</strong>
          </span>
          <span class="flex items-center gap-1.5">
            <Clock :size="15" class="text-amber-300" />
            {{ activeOrder.scheduledAt || 'Đang cập nhật' }}
          </span>
          <span v-if="activeOrder.addressSummary" class="text-brand-300">
            {{ activeOrder.addressSummary }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <FhButton
          variant="secondary"
          size="md"
          class="bg-white text-brand-900 hover:bg-ink-100 border-none font-bold"
          @click="router.push(`/app/orders/${activeOrder.id}`)"
        >
          Xem tiến độ & Chi tiết
          <ArrowRight :size="16" class="ml-1" />
        </FhButton>
      </div>
    </div>

    <!-- Active Bookings awaiting match -->
    <div
      v-else-if="activeBookings.length > 0"
      class="bg-amber-50 border border-amber-200 rounded-[var(--radius-md)] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
      <div class="flex items-start gap-3">
        <div class="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
          <Clock :size="20" />
        </div>
        <div>
          <h4 class="text-sm font-bold text-amber-900">
            Yêu cầu sửa chữa đang chờ ghép thợ
          </h4>
          <p class="text-xs text-amber-700 mt-0.5">
            {{ activeBookings[0].serviceName || activeBookings[0].description }}
          </p>
        </div>
      </div>
      <FhButton
        variant="primary"
        size="sm"
        @click="router.push(`/app/bookings/${activeBookings[0].id}/candidates`)"
      >
        Xem danh sách thợ
      </FhButton>
    </div>

    <!-- Quick Services / Action Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <FhCard clickable class="space-y-3" @click="router.push('/app/bookings/new')">
        <div class="w-10 h-10 rounded-[var(--radius-sm)] bg-brand-50 text-brand-600 flex items-center justify-center">
          <CalendarPlus :size="20" />
        </div>
        <h3 class="text-base font-semibold text-ink-900">Đặt dịch vụ sửa chữa</h3>
        <p class="text-xs text-ink-500 leading-relaxed">
          Mô tả lỗi hoặc chụp ảnh để nhận chẩn đoán AI và báo giá ước tính.
        </p>
      </FhCard>

      <FhCard clickable class="space-y-3" @click="router.push('/app/warranties')">
        <div class="w-10 h-10 rounded-[var(--radius-sm)] bg-success-50 text-success-600 flex items-center justify-center">
          <ShieldCheck :size="20" />
        </div>
        <h3 class="text-base font-semibold text-ink-900">Bảo hành điện tử</h3>
        <p class="text-xs text-ink-500 leading-relaxed">
          Xem thời hạn và điều kiện bảo hành linh kiện FixHome và đảm bảo ngoài.
        </p>
      </FhCard>

      <FhCard clickable class="space-y-3" @click="router.push('/app/history')">
        <div class="w-10 h-10 rounded-[var(--radius-sm)] bg-info-50 text-info-600 flex items-center justify-center">
          <History :size="20" />
        </div>
        <h3 class="text-base font-semibold text-ink-900">Lịch sử sửa chữa</h3>
        <p class="text-xs text-ink-500 leading-relaxed">
          Tra cứu toàn bộ lịch sử sửa chữa, vật tư thay thế và biên lai đã thanh toán.
        </p>
      </FhCard>
    </div>

    <!-- Recent Orders List -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-ink-900">Đơn sửa chữa gần đây</h2>
        <router-link
          v-if="completedOrders.length > 0"
          to="/app/orders"
          class="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
        >
          Xem tất cả <ArrowRight :size="14" />
        </router-link>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 2" :key="i" class="p-6 bg-white rounded-lg border border-ink-200 animate-pulse space-y-3">
          <div class="h-4 bg-ink-200 rounded w-1/4" />
          <div class="h-5 bg-ink-200 rounded w-1/2" />
          <div class="h-3 bg-ink-100 rounded w-1/3" />
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-6 bg-rose-50 border border-rose-200 rounded-lg text-center space-y-3">
        <AlertCircle :size="32" class="text-rose-500 mx-auto" />
        <p class="text-sm font-medium text-rose-800">{{ error }}</p>
        <FhButton variant="secondary" size="sm" @click="loadDashboardData">
          Thử lại
        </FhButton>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="completedOrders.length === 0"
        class="p-8 bg-white border border-ink-200 rounded-[var(--radius-md)] text-center space-y-3"
      >
        <div class="w-12 h-12 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto">
          <Wrench :size="24" />
        </div>
        <h3 class="text-base font-bold text-ink-900">Bạn chưa có đơn sửa chữa nào</h3>
        <p class="text-xs text-ink-500 max-w-sm mx-auto">
          Khi có thiết bị gặp trục trặc, hãy tạo yêu cầu mới để thợ chuyên nghiệp của FixHome kiểm tra tại nhà.
        </p>
        <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
          <CalendarPlus :size="16" class="mr-1" /> Tạo yêu cầu đầu tiên
        </FhButton>
      </div>

      <!-- Real Data List -->
      <div v-else class="space-y-3">
        <FhCard
          v-for="order in completedOrders"
          :key="order.id"
          clickable
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          @click="router.push(`/app/orders/${order.id}`)"
        >
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-num font-bold text-ink-500">{{ order.code }}</span>
              <FhStatusPill :status="order.status" />
            </div>
            <h4 class="text-base font-semibold text-ink-900">{{ order.serviceName }}</h4>
            <div class="text-xs text-ink-500 flex items-center gap-3">
              <span v-if="order.technician">
                Thợ: <strong class="text-ink-700">{{ order.technician.fullName }}</strong>
              </span>
              <span v-else class="text-ink-400">Đang điều phối thợ</span>
              <span>•</span>
              <span class="flex items-center gap-1">
                <Clock :size="12" /> {{ order.scheduledAt || 'Chưa định lịch' }}
              </span>
            </div>
          </div>

          <div class="text-right sm:border-l sm:border-ink-100 sm:pl-6 flex sm:flex-col justify-between items-center sm:items-end">
            <span class="text-xs text-ink-500">Chi phí:</span>
            <FhMoney :amount="order.grandTotal || order.laborTotal || 0" emphasis />
          </div>
        </FhCard>
      </div>
    </div>
  </div>
</template>
