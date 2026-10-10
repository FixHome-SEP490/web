<script setup lang="ts">
// src/pages/customer/CustomerDashboard.vue
// Home of the customer (PO 10/10/2026): one emphasis block (search), each action once.
// "Đặt thợ ngay" and "Chẩn đoán bằng AI" live in the top bar, so the page does not repeat them.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import {
  Search,
  ShieldCheck,
  Zap,
  Snowflake,
  MapPin,
  ChevronRight,
  MessageSquare,
  Award,
  Tag,
  Wrench,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton, FhStatusPill } from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';
import { vnDateString } from '../../utils/vn-time';
import { formatRating } from '../../utils/formatters';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const searchQuery = ref('');
const orders = ref<ServiceOrderItem[]>([]);
const addresses = ref<UserAddress[]>([]);
const selectedAddress = ref('');
const loading = ref(true);
const ordersFailed = ref(false);

// Dịch vụ lấy thật từ danh mục của backend; không có thì ẩn khối này.
const popularServices = ref<ServiceItem[]>([]);

function isFixedPrice(svc: ServiceItem): boolean {
  return svc.pricingMode?.toLowerCase() === 'fixed_price' && svc.fixedPrice != null && svc.fixedPrice > 0;
}

// Quick searches under the search box.
const quickChips = [
  { id: 'urgent', title: 'Sửa điện nước', icon: Zap, query: 'điện' },
  { id: 'ac', title: 'Vệ sinh máy lạnh', icon: Snowflake, query: 'vệ sinh điều hòa' },
];

const promises = [
  { title: 'Kỹ thuật viên đã xác minh hồ sơ', icon: ShieldCheck },
  { title: 'Báo giá trước, bạn duyệt rồi mới sửa', icon: Tag },
  { title: 'Bảo hành ngay trên ứng dụng', icon: Award },
];

function formatAddress(addr: UserAddress): string {
  return [addr.line1, addr.ward, addr.district, addr.province].filter(Boolean).join(', ');
}

async function load() {
  loading.value = true;
  ordersFailed.value = false;
  try {
    const [orderList, addrList, serviceList] = await Promise.all([
      ordersApi.getCustomerOrders().catch(() => {
        ordersFailed.value = true;
        return [] as ServiceOrderItem[];
      }),
      profileApi.getAddresses().catch(() => []),
      catalogApi.getServices({ page: 1, limit: 6 }).then((res) => res.data).catch(() => []),
    ]);
    orders.value = orderList;
    addresses.value = addrList;
    popularServices.value = serviceList.filter((svc) => svc.isActive !== false);

    const def = addrList.find((a) => a.isDefault) ?? addrList[0];
    selectedAddress.value = def ? formatAddress(def) : '';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const IN_PROGRESS = ['EN_ROUTE', 'UNDER_REPAIR', 'ACCEPTED', 'IN_PROGRESS'];

// Active in-progress order (if any)
const activeOrder = computed(() => orders.value.find((o) => IN_PROGRESS.includes(o.status)));

const recentOrders = computed(() => orders.value.slice(0, 3));

const statTiles = computed(() => [
  { label: 'Tổng đơn', value: orders.value.length },
  { label: 'Đang xử lý', value: orders.value.filter((o) => IN_PROGRESS.includes(o.status)).length },
  { label: 'Hoàn thành', value: orders.value.filter((o) => o.status === 'COMPLETED').length },
]);

function handleSearch() {
  const q = searchQuery.value.trim();
  router.push({ path: '/app/bookings/new', query: q ? { q } : {} });
}

function handleChipClick(chip: (typeof quickChips)[0]) {
  router.push({ path: '/app/bookings/new', query: { q: chip.query } });
}

function handleServiceClick(service: ServiceItem) {
  router.push({ path: '/app/bookings/new', query: { serviceId: service.id } });
}

async function handleChatForOrder(order: ServiceOrderItem) {
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
  <div class="space-y-6 pb-4">
    <!-- Greeting and the address the technician comes to -->
    <section class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-ink-900 min-w-0 text-balance">
        Xin chào, {{ authStore.user?.fullName || 'bạn' }}
      </h1>
      <router-link
        to="/app/profile"
        class="flex items-center gap-2 h-10 px-3 rounded-xl bg-white border border-ink-200 hover:bg-ink-50 transition-colors text-sm sm:max-w-md min-w-0"
        :title="selectedAddress || 'Thêm địa chỉ'"
        data-testid="dashboard-address"
      >
        <MapPin :size="16" class="text-brand-600 shrink-0" />
        <span v-if="selectedAddress" class="min-w-0 truncate font-medium text-ink-900">{{ selectedAddress }}</span>
        <span v-else class="min-w-0 truncate font-medium text-brand-600">Thêm địa chỉ</span>
        <ChevronRight :size="16" class="text-ink-400 shrink-0" />
      </router-link>
    </section>

    <!-- The one emphasis block of the page: search what needs fixing -->
    <section class="rounded-2xl bg-linear-to-br from-brand-600 to-brand-500 p-6 sm:p-8 text-white">
      <div class="max-w-2xl space-y-4">
        <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-balance">Cần sửa gì hôm nay?</h2>

        <form class="max-w-xl" role="search" @submit.prevent="handleSearch">
          <label for="dashboard-search" class="sr-only">Tìm dịch vụ sửa chữa</label>
          <div class="relative">
            <input
              id="dashboard-search"
              v-model="searchQuery"
              type="text"
              placeholder="Điện, nước, máy lạnh, thông cống, tivi…"
              class="w-full h-13 pl-4 pr-14 rounded-xl bg-white text-ink-900 placeholder:text-ink-400 text-base outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            />
            <button
              type="submit"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center transition-colors"
              title="Tìm kiếm dịch vụ"
              aria-label="Tìm kiếm dịch vụ"
            >
              <Search :size="18" />
            </button>
          </div>
        </form>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="chip in quickChips"
            :key="chip.id"
            type="button"
            class="h-9 px-3.5 rounded-full bg-white/15 hover:bg-white/25 text-sm text-white transition-colors shrink-0 inline-flex items-center gap-2 whitespace-nowrap"
            @click="handleChipClick(chip)"
          >
            <component :is="chip.icon" :size="16" :stroke-width="1.75" />
            {{ chip.title }}
          </button>
        </div>
      </div>
    </section>

    <!-- Order in progress -->
    <section
      v-if="activeOrder"
      class="rounded-2xl bg-white border border-ink-200 shadow-(--shadow-e1) p-5 space-y-4"
      data-testid="dashboard-active-order"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-ink-900">Đơn đang làm</h2>
        <FhStatusPill :status="activeOrder.status" />
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="min-w-0 space-y-1">
          <p class="text-base font-semibold text-ink-900 text-pretty">{{ activeOrder.serviceName }}</p>
          <p class="text-sm text-ink-600 flex items-start gap-1.5 min-w-0">
            <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
            <span class="truncate" :title="activeOrder.addressSummary">{{ activeOrder.addressSummary }}</span>
          </p>
          <p v-if="activeOrder.technician" class="text-sm text-ink-600 flex items-center gap-1.5 min-w-0">
            <span class="truncate">{{ activeOrder.technician.fullName }}</span>
            <span class="shrink-0 whitespace-nowrap text-ink-500">
              <template v-if="formatRating(activeOrder.technician.averageRating)">· <span class="text-warning-500">★</span>&nbsp;{{ formatRating(activeOrder.technician.averageRating) }}</template>
              <template v-else>· Chưa có đánh giá</template>
            </span>
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <FhButton v-if="activeOrder.technician" variant="secondary" size="sm" @click="handleChatForOrder(activeOrder)">
            <MessageSquare :size="16" />
            Nhắn tin
          </FhButton>
          <FhButton variant="secondary" size="sm" @click="router.push(`/app/orders/${activeOrder.id}`)">
            Xem tiến độ
          </FhButton>
        </div>
      </div>
    </section>

    <!-- Orders: counts and the latest three, one surface -->
    <section v-if="loading" class="rounded-2xl bg-white border border-ink-200 p-5 space-y-4" aria-busy="true" aria-label="Đang tải đơn">
      <FhSkeleton width="40%" height="22px" />
      <div class="grid grid-cols-3 gap-4">
        <FhSkeleton height="48px" />
        <FhSkeleton height="48px" />
        <FhSkeleton height="48px" />
      </div>
      <FhSkeleton height="44px" :count="3" />
    </section>

    <section
      v-else-if="ordersFailed"
      class="rounded-2xl bg-white border border-ink-200 p-5 flex flex-wrap items-center justify-between gap-3"
      data-testid="dashboard-orders-error"
    >
      <p class="text-sm text-ink-700">Chưa tải được đơn của bạn, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
    </section>

    <section v-else-if="orders.length > 0" class="rounded-2xl bg-white border border-ink-200 overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 class="text-lg font-semibold text-ink-900">Đơn gần đây</h2>
        <router-link to="/app/orders" class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap">
          Xem tất cả <ChevronRight :size="16" />
        </router-link>
      </div>

      <dl class="grid grid-cols-3 border-y border-ink-100 divide-x divide-ink-100">
        <div v-for="stat in statTiles" :key="stat.label" class="px-5 py-3">
          <dt class="text-sm text-ink-500 whitespace-nowrap">{{ stat.label }}</dt>
          <dd class="text-xl font-semibold text-ink-900 font-num">{{ stat.value }}</dd>
        </div>
      </dl>

      <ul class="divide-y divide-ink-100">
        <li v-for="order in recentOrders" :key="order.id">
          <router-link :to="`/app/orders/${order.id}`" class="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50 transition-colors">
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-ink-900 truncate">{{ order.serviceName }}</span>
              <span class="block text-sm text-ink-500 font-num whitespace-nowrap truncate">{{ order.code }} · {{ vnDateString(order.createdAt) }}</span>
            </span>
            <span class="shrink-0 flex flex-col items-end gap-1">
              <FhStatusPill :status="order.status" />
              <span v-if="Number(order.grandTotal) > 0" class="text-sm font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="order.grandTotal" /></span>
            </span>
            <ChevronRight :size="18" class="text-ink-400 shrink-0" />
          </router-link>
        </li>
      </ul>
    </section>

    <!-- Services from the catalogue -->
    <section v-if="loading" class="rounded-2xl bg-white border border-ink-200 p-5 space-y-4" aria-busy="true" aria-label="Đang tải dịch vụ">
      <FhSkeleton width="30%" height="22px" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FhSkeleton height="44px" :count="3" />
        <FhSkeleton height="44px" :count="3" />
      </div>
    </section>

    <section v-else-if="popularServices.length > 0" class="rounded-2xl bg-white border border-ink-200 overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-ink-100">
        <h2 class="text-lg font-semibold text-ink-900">Dịch vụ</h2>
        <router-link to="/services" class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap">
          Bảng giá <ChevronRight :size="16" />
        </router-link>
      </div>

      <ul class="grid grid-cols-1 sm:grid-cols-2 -mb-px">
        <li v-for="srv in popularServices" :key="srv.id" class="border-b border-ink-100 sm:odd:border-r">
          <button
            type="button"
            class="w-full px-5 py-3.5 hover:bg-ink-50 transition-colors flex items-center gap-3 text-left"
            @click="handleServiceClick(srv)"
          >
            <Wrench :size="20" :stroke-width="1.75" class="text-ink-500 shrink-0" />
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-semibold text-ink-900 truncate" :title="srv.name">{{ srv.name }}</span>
              <span v-if="isFixedPrice(srv)" class="block text-sm text-ink-600 font-num whitespace-nowrap"><FhMoney :amount="srv.fixedPrice ?? 0" /><template v-if="srv.unit"> / {{ srv.unit }}</template></span>
              <span v-else class="block text-sm text-ink-500 whitespace-nowrap">Báo giá sau khi kiểm tra</span>
            </span>
            <ChevronRight :size="18" class="text-ink-400 shrink-0" />
          </button>
        </li>
      </ul>
    </section>

    <!-- What FixHome promises, one line each -->
    <section class="rounded-2xl bg-white border border-ink-200 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
      <div v-for="promise in promises" :key="promise.title" class="px-5 py-4 flex items-center gap-3">
        <component :is="promise.icon" :size="20" :stroke-width="1.75" class="text-brand-600 shrink-0" />
        <span class="text-sm font-medium text-ink-800 text-pretty">{{ promise.title }}</span>
      </div>
    </section>
  </div>
</template>
