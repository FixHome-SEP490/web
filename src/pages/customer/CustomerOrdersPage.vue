<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ClipboardList,
  MapPin,
  Calendar,
  ChevronRight,
  User,
  Plus,
  Search,
  MessageSquare,
  Star,
  Receipt,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCostBreakdown,
  FhMoney,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { useChatStore } from '../../stores/chat.store';

const router = useRouter();
const chatStore = useChatStore();

const loading = ref(true);
const orders = ref<ServiceOrderItem[]>([]);
const pendingBookings = ref<BookingItem[]>([]);
const activeTab = ref<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('ALL');
const searchQuery = ref('');

const pendingLabel = (status: BookingItem['status']) =>
  status === 'MATCHING' ? 'Đang chờ thợ xác nhận' : 'Đang tìm thợ phù hợp';

onMounted(async () => {
  try {
    const [orderList, bookingList] = await Promise.all([
      ordersApi.getCustomerOrders(),
      bookingsApi.getMyBookings(),
    ]);
    orders.value = orderList;
    const orderedBookingIds = new Set(orderList.map((o) => o.bookingId));
    pendingBookings.value = bookingList.filter(
      (b) => ['SUBMITTED', 'MATCHING'].includes(b.status) && !orderedBookingIds.has(b.id),
    );
  } finally {
    loading.value = false;
  }
});

const getStatusBadge = (status: string) => {
  const s = String(status).toUpperCase();
  switch (s) {
    case 'EN_ROUTE':
      return { label: 'Đang di chuyển', bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', dot: 'bg-[#D97706]' };
    case 'UNDER_REPAIR':
    case 'IN_PROGRESS':
      return { label: 'Đang sửa chữa', bg: 'bg-[#DBEAFE]', text: 'text-[#2563EB]', dot: 'bg-[#2563EB]' };
    case 'ACCEPTED':
      return { label: 'Đã nhận đơn', bg: 'bg-[#E0E7FF]', text: 'text-[#4F46E5]', dot: 'bg-[#4F46E5]' };
    case 'COMPLETED':
      return { label: 'Hoàn thành', bg: 'bg-[#DCFCE7]', text: 'text-[#16A34A]', dot: 'bg-[#16A34A]' };
    case 'CANCELLED':
      return { label: 'Đã hủy', bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]', dot: 'bg-[#DC2626]' };
    default:
      return { label: s, bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400' };
  }
};

const filteredOrders = computed(() => {
  let list = orders.value;

  if (activeTab.value === 'IN_PROGRESS') {
    list = list.filter((o) =>
      ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(o.status).toUpperCase()),
    );
  } else if (activeTab.value === 'COMPLETED') {
    list = list.filter((o) => String(o.status).toUpperCase() === 'COMPLETED');
  } else if (activeTab.value === 'CANCELLED') {
    list = list.filter((o) => String(o.status).toUpperCase() === 'CANCELLED');
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((o) => {
      const codeMatch = o.code?.toLowerCase().includes(q);
      const srvMatch = o.serviceName?.toLowerCase().includes(q);
      const techMatch = o.technician?.fullName?.toLowerCase().includes(q);
      return codeMatch || srvMatch || techMatch;
    });
  }

  return list;
});

const visiblePending = computed(() => {
  if (!['ALL', 'IN_PROGRESS'].includes(activeTab.value)) return [];
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return pendingBookings.value;
  return pendingBookings.value.filter((b) => b.serviceName?.toLowerCase().includes(q));
});

async function handleChat(order: ServiceOrderItem, event: Event) {
  event.stopPropagation();
  const bookingId = (order as unknown as { bookingId?: string }).bookingId || order.id;
  const conv = await chatStore.openConversationForBooking(bookingId);
  if (!conv) {
    const found = chatStore.conversations.find((c) => c.counterpart.id === order.technician?.id);
    if (found) {
      await chatStore.selectConversation(found.id);
      chatStore.toggleWidget(true);
    } else {
      chatStore.toggleWidget(true);
    }
  }
}
</script>

<template>
  <div class="space-y-6 max-w-4xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ClipboardList class="text-brand-600" :size="24" />
          Đơn Sửa chữa của tôi
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi tiến độ di chuyển, phê duyệt báo giá và trao đổi trực tiếp với thợ.
        </p>
      </div>

      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
        <Plus :size="16" class="mr-1" /> Đặt thợ mới
      </FhButton>
    </div>

    <!-- Search Input (Style Mobile) -->
    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Tìm theo mã đơn, dịch vụ, thợ..."
        class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all shadow-xs"
      />
    </div>

    <!-- Segment Tabs (Style Mobile) -->
    <div class="flex items-center gap-1.5 p-1 bg-ink-100/70 rounded-xl border border-ink-200 text-xs font-semibold">
      <button
        v-for="tab in [
          { key: 'ALL', label: `Tất cả (${orders.length + pendingBookings.length})` },
          { key: 'IN_PROGRESS', label: 'Đang xử lý' },
          { key: 'COMPLETED', label: 'Hoàn tất' },
          { key: 'CANCELLED', label: 'Đã huỷ' },
        ]"
        :key="tab.key"
        type="button"
        class="flex-1 py-2 rounded-lg transition-all text-center"
        :class="activeTab === tab.key ? 'bg-white text-brand-700 shadow-xs font-bold' : 'text-ink-600 hover:text-ink-900'"
        @click="activeTab = (tab.key as any)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16 text-ink-400 space-y-2">
      <div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin mx-auto"></div>
      <p class="text-xs">Đang tải danh sách đơn dịch vụ...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredOrders.length === 0 && visiblePending.length === 0"
      class="text-center py-16 bg-white rounded-2xl border border-ink-200 space-y-3 p-8"
    >
      <div class="w-14 h-14 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-2">
        <Receipt :size="28" />
      </div>
      <h3 class="text-sm font-bold text-ink-800">Chưa có đơn dịch vụ nào</h3>
      <p class="text-xs text-ink-500 max-w-sm mx-auto">
        {{ searchQuery ? 'Không tìm thấy đơn nào phù hợp với từ khóa.' : 'Đặt lịch ngay để thợ FixHome kiểm tra tại nhà bạn sau 15–30 phút.' }}
      </p>
      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
        Đặt thợ ngay
      </FhButton>
    </div>

    <!-- Orders Feed -->
    <div v-else class="space-y-4">
      <!-- Pending bookings: no technician has accepted yet, so there is no ServiceOrder -->
      <div
        v-for="booking in visiblePending"
        :key="booking.id"
        class="p-5 rounded-2xl bg-white border border-dashed border-amber-300 space-y-3 cursor-pointer hover:border-amber-400 transition-all"
        @click="router.push(`/app/bookings/${booking.id}`)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs text-ink-500 flex items-center gap-1 font-medium">
            <Calendar :size="13" />
            <span>{{ new Date(booking.createdAt).toLocaleDateString('vi-VN') }}</span>
          </span>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>{{ pendingLabel(booking.status) }}</span>
          </div>
        </div>
        <h3 class="font-bold text-sm text-ink-900">{{ booking.serviceName }}</h3>
        <p class="text-xs text-ink-500 flex items-center gap-1.5 line-clamp-1">
          <MapPin :size="13" class="shrink-0 text-brand-600" />
          <span>{{ booking.addressSummary }}</span>
        </p>
      </div>

      <div
        v-for="order in filteredOrders"
        :key="order.id"
        class="p-5 rounded-2xl bg-white border border-ink-200 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer space-y-4"
        @click="router.push(`/app/orders/${order.id}`)"
      >
        <!-- Card Top: Code, Date & Mobile-like Pastel Status Badge -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-extrabold text-ink-900 bg-ink-100 px-2 py-0.5 rounded-md">
              {{ order.code }}
            </span>
            <span class="text-ink-400 text-xs">•</span>
            <span class="text-xs text-ink-500 flex items-center gap-1 font-medium">
              <Calendar :size="13" />
              <span>{{ new Date(order.createdAt).toLocaleDateString('vi-VN') }}</span>
            </span>
          </div>

          <!-- Pastel Badge matching Mobile getStatusBadge -->
          <div
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            :class="[getStatusBadge(order.status).bg, getStatusBadge(order.status).text]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="getStatusBadge(order.status).dot"></span>
            <span>{{ getStatusBadge(order.status).label }}</span>
          </div>
        </div>

        <!-- Card Middle: Service & Tech Info -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div class="space-y-1">
            <h3 class="font-bold text-sm text-ink-900 hover:text-brand-600 transition-colors">
              {{ order.serviceName }}
            </h3>
            <p class="text-xs text-ink-500 flex items-center gap-1.5 line-clamp-1">
              <MapPin :size="13" class="shrink-0 text-brand-600" />
              <span>{{ order.addressSummary }}</span>
            </p>
          </div>

          <!-- Technician Mini Card -->
          <div v-if="order.technician" class="flex items-center justify-between sm:justify-end gap-3 p-2 rounded-xl bg-ink-50 border border-ink-100">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {{ order.technician.fullName.charAt(0) }}
              </div>
              <div class="text-xs">
                <div class="font-bold text-ink-900">{{ order.technician.fullName }}</div>
                <div class="text-[11px] text-amber-600 flex items-center gap-0.5 font-semibold">
                  <Star :size="11" class="fill-amber-500 text-amber-500" />
                  <span>{{ order.technician.averageRating || '5.0' }}</span>
                  <span class="text-ink-400 font-normal ml-0.5">• Thợ chính</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors flex items-center gap-1 shadow-xs"
              @click="(e) => handleChat(order, e)"
              title="Nhắn tin với thợ"
            >
              <MessageSquare :size="13" />
              <span class="hidden sm:inline">Nhắn tin</span>
            </button>
          </div>

          <div v-else class="text-xs text-amber-700 flex items-center gap-1.5 sm:justify-end font-semibold bg-amber-50 p-2.5 rounded-xl border border-amber-200">
            <User :size="14" />
            <span>Đang tự động điều phối thợ phù hợp...</span>
          </div>
        </div>

        <!-- Card Bottom: Cost Breakdown & Action CTA -->
        <div class="pt-3 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex-1 max-w-sm">
            <FhCostBreakdown
              :labor-total="order.laborTotal"
              :parts-total="order.partsTotal"
            />
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <div class="text-right">
              <span class="text-[10px] text-ink-400 uppercase tracking-wider block font-bold">Tổng chi phí:</span>
              <span class="text-base font-extrabold font-num text-brand-700">
                <FhMoney :amount="order.grandTotal" />
              </span>
            </div>

            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-ink-100 hover:bg-brand-50 hover:text-brand-700 text-ink-700 text-xs font-bold transition-all flex items-center gap-1"
            >
              <span>Xem chi tiết</span>
              <ChevronRight :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
