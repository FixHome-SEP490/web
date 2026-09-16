<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ClipboardList,
  MapPin,
  Calendar,
  ChevronRight,
  User,
  Plus,
  Wrench,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhCostBreakdown,
  FhMoney,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';

const router = useRouter();

const loading = ref(true);
const orders = ref<ServiceOrderItem[]>([]);
const pendingBookings = ref<BookingItem[]>([]);
const statusFilter = ref<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');

onMounted(async () => {
  try {
    const [list, bks] = await Promise.all([
      ordersApi.getCustomerOrders(),
      bookingsApi.getMyBookings(),
    ]);
    orders.value = list;
    pendingBookings.value = bks.filter(
      (b) => b.status === 'SUBMITTED' || b.status === 'MATCHING' || b.status === 'PENDING',
    );
  } finally {
    loading.value = false;
  }
});

const filteredOrders = computed(() => {
  if (statusFilter.value === 'ALL') return orders.value;
  if (statusFilter.value === 'ACTIVE') {
    return orders.value.filter(
      (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED',
    );
  }
  return orders.value.filter((o) => o.status === statusFilter.value);
});
</script>

<template>
  <div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ClipboardList class="text-brand-600" :size="24" />
          Đơn Sửa chữa của tôi
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi tiến độ di chuyển của thợ, phê duyệt báo giá và xem bảo hành điện tử.
        </p>
      </div>

      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
        <Plus :size="16" class="mr-1.5" /> Đặt thợ mới
      </FhButton>
    </div>

    <!-- Active Bookings Waiting for Technician Accept (Section 4 Flow) -->
    <div
      v-if="pendingBookings.length > 0"
      class="p-4 rounded-[var(--radius-md)] bg-brand-50/80 border border-brand-200 space-y-3 shadow-xs"
    >
      <div class="flex items-center justify-between">
        <div class="font-bold text-xs sm:text-sm text-brand-950 flex items-center gap-2">
          <Wrench :size="16" class="text-brand-600" />
          <span>Yêu cầu đang ghép thợ ({{ pendingBookings.length }})</span>
        </div>
        <span class="text-[11px] text-brand-700 font-medium">Chờ thợ phản hồi lời mời</span>
      </div>

      <div
        v-for="bk in pendingBookings"
        :key="bk.id"
        class="p-3 bg-white rounded border border-brand-100 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div class="space-y-0.5">
          <div class="font-bold text-ink-900">{{ bk.serviceName || 'Dịch vụ sửa chữa' }}</div>
          <div class="text-[11px] text-ink-500 flex items-center gap-1.5">
            <MapPin :size="12" class="text-brand-600" />
            <span>{{ bk.addressSummary || 'Địa chỉ sửa chữa' }}</span>
            <span>• Hẹn: {{ new Date(bk.preferredAt).toLocaleString('vi-VN') }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <FhButton variant="secondary" size="sm" @click="router.push(`/app/bookings/${bk.id}/candidates`)">
            Xem ứng viên thợ
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Status Filter Tabs -->
    <div class="flex items-center gap-2 border-b border-ink-200">
      <button
        v-for="tab in [
          { key: 'ALL', label: 'Tất cả đơn' },
          { key: 'ACTIVE', label: 'Đang thực hiện' },
          { key: 'COMPLETED', label: 'Hoàn thành' },
          { key: 'CANCELLED', label: 'Đã huỷ' },
        ]"
        :key="tab.key"
        type="button"
        class="px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px"
        :class="statusFilter === tab.key ? 'border-brand-600 text-brand-700 font-bold' : 'border-transparent text-ink-500 hover:text-ink-800'"
        @click="statusFilter = (tab.key as any)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Order List -->
    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải danh sách đơn...
    </div>

    <div v-else-if="filteredOrders.length === 0" class="text-center py-16 bg-white rounded-[var(--radius-md)] border border-ink-200 space-y-3">
      <ClipboardList :size="40" class="mx-auto text-ink-300" />
      <h3 class="text-sm font-bold text-ink-800">Không tìm thấy đơn nào</h3>
      <p class="text-xs text-ink-500">Bạn chưa có đơn sửa chữa nào trong mục này.</p>
    </div>

    <div v-else class="space-y-4">
      <FhCard
        v-for="order in filteredOrders"
        :key="order.id"
        class="cursor-pointer hover:border-brand-300 transition-colors"
        @click="router.push(`/app/orders/${order.id}`)"
      >
        <div class="space-y-4">
          <!-- Top Row: Code & Status -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-bold text-ink-900">{{ order.code }}</span>
              <span class="text-ink-400 text-xs">•</span>
              <span class="text-xs text-ink-500 flex items-center gap-1">
                <Calendar :size="13" /> {{ new Date(order.createdAt).toLocaleDateString('vi-VN') }}
              </span>
            </div>

            <FhStatusPill :status="order.status" />
          </div>

          <!-- Middle: Service & Tech -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <h3 class="font-bold text-sm text-ink-900">{{ order.serviceName }}</h3>
              <p class="text-xs text-ink-500 flex items-center gap-1 line-clamp-1">
                <MapPin :size="13" class="shrink-0 text-brand-600" />
                {{ order.addressSummary }}
              </p>
            </div>

            <div v-if="order.technician" class="flex items-center gap-3 sm:justify-end">
              <div class="w-9 h-9 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {{ order.technician.fullName.charAt(0) }}
              </div>
              <div class="text-xs">
                <div class="font-bold text-ink-900">{{ order.technician.fullName }}</div>
                <div class="text-ink-500 text-[11px]">Kỹ thuật viên phụ trách</div>
              </div>
            </div>
            <div v-else class="text-xs text-amber-600 flex items-center gap-1 sm:justify-end font-medium">
              <User :size="14" /> Đang điều phối thợ...
            </div>
          </div>

          <!-- Bottom: D-02 Cost Breakdown Bar & CTA -->
          <div class="pt-3 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex-1 max-w-sm">
              <FhCostBreakdown
                :labor-total="order.laborTotal"
                :parts-total="order.partsTotal"
              />
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <div class="text-right">
                <span class="text-[11px] text-ink-400 block">Tổng tiền:</span>
                <span class="text-sm font-bold font-num text-brand-700">
                  <FhMoney :amount="order.grandTotal" />
                </span>
              </div>

              <FhButton variant="secondary" size="sm">
                Chi tiết <ChevronRight :size="14" class="ml-1" />
              </FhButton>
            </div>
          </div>
        </div>
      </FhCard>
    </div>
  </div>
</template>
