<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
// Two server-paged lists (PO 12/10/2026): booking requests that no technician
// has taken yet, and repair orders. Each has its own numbered pager; the tab
// and both pages stay in the address bar (?tab=COMPLETED&page=2).
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  MapPin,
  ChevronRight,
  Search,
  MessageSquare,
  Receipt,
  AlertCircle,
  RefreshCw,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhPagination,
  FhSkeleton,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import type { PageResult } from '../../api/paging';
import { usePagedList } from '../../composables/usePagedList';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQueryPage, useQuerySearch } from '../../composables/useQueryState';
import { useChatStore } from '../../stores/chat.store';
import { vnDateString } from '../../utils/vn-time';
import { formatRating } from '../../utils/formatters';

const PAGE_SIZE = 10;

const router = useRouter();
const chatStore = useChatStore();

type Tab = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
const TAB_KEYS: readonly Tab[] = ['ALL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const activeTab = useQueryChoice<Tab>('tab', TAB_KEYS, 'ALL');

// "Đặt lại thợ" from a completed or cancelled order, or a booking cancelled before any technician accepted.
const rebookFor = ref<{ bookingId: string; serviceName?: string } | null>(null);
const canRebookOrder = (order: ServiceOrderItem) => ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase());
// Searches on the server (order code, service; accents ignored), kept as ?q=.
const { input: searchQuery, search } = useQuerySearch();

const emptyPage = <T,>(page: number, pageSize: number): Promise<PageResult<T>> =>
  Promise.resolve({ items: [], total: 0, page, pageSize });

// Each tab is one or more server states, asked for in one request (`statuses=`).
const ORDER_STATES: Record<Tab, string[]> = {
  ALL: [],
  IN_PROGRESS: ['accepted', 'en_route', 'under_repair'],
  COMPLETED: ['completed'],
  CANCELLED: ['cancelled'],
};
// A matched booking already shows as its order, so it is never listed twice.
const BOOKING_STATES: Record<Tab, string[]> = {
  ALL: ['submitted', 'matching', 'closed', 'cancelled'],
  IN_PROGRESS: ['submitted', 'matching'],
  COMPLETED: [],
  CANCELLED: ['cancelled'],
};

const ordersList = usePagedList<ServiceOrderItem>({
  pageSize: PAGE_SIZE,
  fetch: (page, size) =>
    ordersApi.getMyOrdersPage(page, size, { statuses: ORDER_STATES[activeTab.value], search: search.value }),
});
const bookingsList = usePagedList<BookingItem>({
  pageSize: PAGE_SIZE,
  page: useQueryPage('requestsPage'),
  fetch: (page, size) => {
    const states = BOOKING_STATES[activeTab.value];
    if (states.length === 0) return emptyPage<BookingItem>(page, size);
    return bookingsApi.getMyBookingsPage(page, size, { statuses: states, search: search.value });
  },
});

const {
  page: ordersPage,
  items: orders,
  total: ordersTotal,
  loading: loadingOrders,
  error: ordersFailure,
  load: retryOrders,
} = ordersList;
const {
  page: bookingsPage,
  items: bookings,
  total: bookingsTotal,
  loading: loadingBookings,
  error: bookingsFailure,
  load: retryBookings,
} = bookingsList;

watch([activeTab, search], () => {
  ordersList.reset();
  bookingsList.reset();
});

// Short lines only; the server's wording never reaches the customer.
const ordersError = computed(() => (ordersFailure.value ? 'Chưa tải được đơn sửa chữa, vui lòng thử lại.' : null));
const bookingsError = computed(() => (bookingsFailure.value ? 'Chưa tải được yêu cầu đặt lịch, vui lòng thử lại.' : null));

// ── Computed ──
// Show verified records as soon as either source completes.
const loading = computed(() => loadingOrders.value && loadingBookings.value);
const hasError = computed(() => !!(ordersError.value || bookingsError.value));
const allCount = computed(() =>
  activeTab.value === 'ALL' && !loadingOrders.value && !loadingBookings.value && !hasError.value
    ? ordersTotal.value + bookingsTotal.value
    : null,
);

const isOverdue = (booking: BookingItem) =>
  !!booking.preferredEndAt && new Date(booking.preferredEndAt) < new Date();

const pendingLabel = (booking: BookingItem) => {
  if (booking.status === 'CANCELLED') return 'Đã huỷ trước khi có thợ';
  if (isOverdue(booking)) return 'Quá hạn, đang chờ hỗ trợ';
  if (booking.status === 'MATCHING') return 'Đang chờ thợ xác nhận';
  if (booking.status === 'CLOSED') return 'Chưa tìm được thợ, chờ hỗ trợ';
  return 'Đang tìm thợ phù hợp';
};

// ── Filtering ──

const getStatusBadge = (status: string) => {
  const s = String(status).toUpperCase();
  switch (s) {
    case 'EN_ROUTE':
      return { label: 'Đang di chuyển', bg: 'bg-warning-50', text: 'text-warning-800', dot: 'bg-warning-500' };
    case 'UNDER_REPAIR':
    case 'IN_PROGRESS':
      return { label: 'Đang sửa chữa', bg: 'bg-brand-50', text: 'text-brand-700', dot: 'bg-brand-600' };
    case 'ACCEPTED':
      return { label: 'Đã nhận đơn', bg: 'bg-brand-50', text: 'text-brand-700', dot: 'bg-brand-600' };
    case 'COMPLETED':
      return { label: 'Hoàn thành', bg: 'bg-success-50', text: 'text-success-700', dot: 'bg-success-500' };
    case 'CANCELLED':
      return { label: 'Đã hủy', bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400' };
    default:
      return { label: 'Trạng thái chưa xác định', bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400' };
  }
};

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
  <div class="space-y-5 max-w-4xl mx-auto pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Đơn của tôi</h1>

    <!-- Search -->
    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        :maxlength="SEARCH_MAX_LENGTH"
        placeholder="Tìm theo mã đơn, dịch vụ…"
        aria-label="Tìm đơn"
        class="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-ink-200 text-base sm:text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
      />
    </div>

    <!-- Segment tabs -->
    <div class="grid grid-cols-4 gap-1 p-1 bg-white rounded-2xl border border-ink-200 text-sm font-medium" role="tablist">
      <button
        v-for="tab in [
          { key: 'ALL', label: allCount === null ? 'Tất cả' : `Tất cả (${allCount})` },
          { key: 'IN_PROGRESS', label: 'Đang xử lý' },
          { key: 'COMPLETED', label: 'Hoàn tất' },
          { key: 'CANCELLED', label: 'Đã huỷ' },
        ]"
        :key="tab.key"
        :data-testid="`history-tab-${tab.key}`"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="h-10 px-2 rounded-xl transition-colors text-center whitespace-nowrap"
        :class="activeTab === tab.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-50'"
        @click="activeTab = (tab.key as Tab)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Partial-failure banners (one per source, with retry) -->
    <div v-if="!loading && hasError" class="space-y-2">
      <div
        v-if="ordersError"
        data-testid="orders-error-banner"
        class="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <AlertCircle :size="16" class="shrink-0" />
          {{ ordersError }}
        </span>
        <button
          type="button"
          class="flex items-center gap-1 font-semibold hover:underline shrink-0 whitespace-nowrap"
          data-testid="retry-orders"
          :disabled="loadingOrders"
          @click="retryOrders"
        >
          <RefreshCw :size="14" /> Thử lại
        </button>
      </div>
      <div
        v-if="bookingsError"
        data-testid="bookings-error-banner"
        class="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <AlertCircle :size="16" class="shrink-0" />
          {{ bookingsError }}
        </span>
        <button
          type="button"
          class="flex items-center gap-1 font-semibold hover:underline shrink-0 whitespace-nowrap"
          data-testid="retry-bookings"
          :disabled="loadingBookings"
          @click="retryBookings"
        >
          <RefreshCw :size="14" /> Thử lại
        </button>
      </div>
    </div>

    <!-- Loading: rows like the list -->
    <div v-if="loading" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải đơn">
      <div v-for="i in 4" :key="i" class="px-5 py-4 space-y-2">
        <FhSkeleton width="55%" height="18px" />
        <FhSkeleton width="35%" height="14px" />
      </div>
    </div>

    <!-- Empty (only when no error AND no data) -->
    <div
      v-else-if="!hasError && !loadingOrders && !loadingBookings && ordersTotal === 0 && bookingsTotal === 0"
      data-testid="history-empty-state"
      class="text-center bg-white rounded-2xl border border-ink-200 px-6 py-12 space-y-2"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-3">
        <Receipt :size="24" />
      </div>
      <h2 class="text-base font-semibold text-ink-900">
        {{ search ? 'Không có đơn phù hợp' : activeTab === 'ALL' ? 'Bạn chưa có đơn sửa chữa' : 'Không có đơn ở mục này' }}
      </h2>
      <p class="text-sm text-ink-500 max-w-sm mx-auto text-pretty">
        {{ search ? 'Thử từ khoá khác.' : activeTab === 'ALL' ? 'Đặt thợ để kỹ thuật viên FixHome tới kiểm tra tại nhà bạn.' : 'Chọn mục khác để xem đơn của bạn.' }}
      </p>
    </div>

    <div v-else class="space-y-5">
      <!-- Bookings with no technician yet, so no service order -->
      <section v-if="loadingBookings || bookingsTotal > 0" class="space-y-2" data-testid="requests-section">
        <h2 class="text-sm font-medium text-ink-500">Yêu cầu đặt lịch</h2>
        <div v-if="loadingBookings" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải yêu cầu">
          <div v-for="i in 2" :key="i" class="px-5 py-4 space-y-2">
            <FhSkeleton width="50%" height="18px" />
            <FhSkeleton width="30%" height="14px" />
          </div>
        </div>
        <ul v-else class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          <li
            v-for="booking in bookings"
            :key="booking.id"
            :data-testid="`booking-card-${booking.id}`"
            role="link"
            tabindex="0"
            class="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:bg-ink-50"
            @click="router.push(`/app/bookings/${booking.id}`)"
            @keydown.enter="router.push(`/app/bookings/${booking.id}`)"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                <h3 class="font-semibold text-ink-900 text-pretty">{{ booking.serviceName }}</h3>
                <span
                  class="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                  :class="booking.status === 'CANCELLED' ? 'bg-ink-100 text-ink-600' : isOverdue(booking) ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-800'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="booking.status === 'CANCELLED' ? 'bg-ink-400' : isOverdue(booking) ? 'bg-danger-500' : 'bg-warning-500'"></span>
                  {{ pendingLabel(booking) }}
                </span>
              </div>
              <p class="text-sm text-ink-500 flex items-center gap-1.5 min-w-0">
                <span class="font-num whitespace-nowrap">{{ vnDateString(booking.createdAt) }}</span>
                <span aria-hidden="true">·</span>
                <MapPin :size="14" class="shrink-0 text-ink-400" />
                <span class="truncate" :title="booking.addressSummary">{{ booking.addressSummary }}</span>
              </p>
              <div v-if="booking.status === 'CANCELLED'" class="flex justify-end pt-1">
                <FhButton variant="secondary" size="sm" :data-testid="`rebook-booking-${booking.id}`" @click.stop="rebookFor = { bookingId: booking.id, serviceName: booking.serviceName }">Đặt lại</FhButton>
              </div>
            </div>
            <ChevronRight :size="18" class="text-ink-400 shrink-0" />
          </li>
        </ul>

        <FhPagination
          v-model:page="bookingsPage"
          :page-size="PAGE_SIZE"
          :total="bookingsTotal"
          :disabled="loadingBookings"
        />
      </section>

      <!-- Service orders -->
      <section v-if="loadingOrders || ordersTotal > 0" class="space-y-2" data-testid="orders-section">
        <h2 class="text-sm font-medium text-ink-500">Đơn sửa chữa</h2>
        <div v-if="loadingOrders" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải đơn">
          <div v-for="i in 3" :key="i" class="px-5 py-4 space-y-2">
            <FhSkeleton width="55%" height="18px" />
            <FhSkeleton width="35%" height="14px" />
          </div>
        </div>
        <ul v-else class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          <li
            v-for="order in orders"
            :key="order.id"
            :data-testid="`order-card-${order.id}`"
            role="link"
            tabindex="0"
            class="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:bg-ink-50"
            @click="router.push(`/app/orders/${order.id}`)"
            @keydown.enter="router.push(`/app/orders/${order.id}`)"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                <h3 class="font-semibold text-ink-900 text-pretty">{{ order.serviceName }}</h3>
                <span
                  class="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                  :class="[getStatusBadge(order.status).bg, getStatusBadge(order.status).text]"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getStatusBadge(order.status).dot"></span>
                  {{ getStatusBadge(order.status).label }}
                </span>
              </div>
              <p class="text-sm text-ink-500 font-num truncate">{{ order.code }} · {{ vnDateString(order.createdAt) }}</p>
              <p class="text-sm text-ink-600 flex items-center gap-1.5 min-w-0">
                <template v-if="order.technician">
                  <span class="truncate">{{ order.technician.fullName }}</span>
                  <span class="shrink-0 whitespace-nowrap text-ink-500">
                    <template v-if="formatRating(order.technician.averageRating)">· <span class="text-warning-500">★</span>&nbsp;{{ formatRating(order.technician.averageRating) }}</template>
                    <template v-else>· Chưa có đánh giá</template>
                  </span>
                </template>
                <span v-else class="text-ink-500">Đang tìm kỹ thuật viên phù hợp…</span>
              </p>
              <div
                v-if="Number(order.grandTotal) > 0 || order.technician || canRebookOrder(order)"
                class="flex items-center justify-between gap-3 pt-1"
              >
                <span class="text-base font-semibold font-num text-ink-900 whitespace-nowrap">
                  <FhMoney v-if="Number(order.grandTotal) > 0" :amount="order.grandTotal" />
                </span>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    v-if="order.technician"
                    type="button"
                    class="h-9 px-3 rounded-xl bg-white border border-ink-200 text-ink-700 text-sm font-medium hover:bg-ink-100 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    aria-label="Nhắn tin với kỹ thuật viên"
                    @click="(e) => handleChat(order, e)"
                  >
                    <MessageSquare :size="16" class="text-ink-500" />
                    <span>Nhắn tin</span>
                  </button>
                  <FhButton
                    v-if="canRebookOrder(order)"
                    variant="secondary"
                    size="sm"
                    :data-testid="`rebook-order-${order.id}`"
                    @click.stop="rebookFor = { bookingId: order.bookingId, serviceName: order.serviceName }"
                  >
                    Đặt lại thợ
                  </FhButton>
                </div>
              </div>
            </div>
            <ChevronRight :size="18" class="text-ink-400 shrink-0" />
          </li>
        </ul>

        <FhPagination
          v-model:page="ordersPage"
          :page-size="PAGE_SIZE"
          :total="ordersTotal"
          :disabled="loadingOrders"
        />
      </section>
    </div>
    <RebookDialog
      v-if="rebookFor"
      :open="!!rebookFor"
      :booking-id="rebookFor.bookingId"
      :service-name="rebookFor.serviceName"
      @close="rebookFor = null"
    />
  </div>
</template>
