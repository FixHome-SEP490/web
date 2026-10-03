<script setup lang="ts">
// src/pages/customer/CustomerDashboard.vue
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import {
  Sparkles,
  Search,
  ShieldCheck,
  Zap,
  Users,
  Bot,
  Snowflake,
  Droplets,
  Cpu,
  Disc,
  Package,
  Clock,
  MapPin,
  ChevronRight,
  MessageSquare,
  Award,
  Tag,
  Gift,
  BadgeCheck,
  Timer,
  BookOpen,
  FileCheck,
  CircleDollarSign,
  CalendarPlus,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhStatusPill } from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { profileApi, type UserAddress } from '../../api/profile.api';
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

// Popular Services – curated list
const popularServices = [
  {
    id: 'ac_clean',
    name: 'Vệ sinh máy lạnh',
    icon: Snowflake,
    badge: 'HOT',
    query: 'vệ sinh điều hòa',
    price: 180000,
    unit: 'Máy',
    isFixed: true,
  },
  {
    id: 'washer_clean',
    name: 'Vệ sinh máy giặt',
    icon: Disc,
    badge: 'GIÁ TỐT',
    query: 'vệ sinh cửa trên',
    price: 350000,
    unit: 'Máy',
    isFixed: true,
  },
  {
    id: 'dryer_clean',
    name: 'Vệ sinh máy sấy',
    icon: Package,
    query: 'vệ sinh máy sấy',
    price: 350000,
    unit: 'Máy',
    isFixed: true,
  },
  {
    id: 'plumbing',
    name: 'Sửa ống nước',
    icon: Droplets,
    query: 'ống nước',
    isFixed: false,
  },
  {
    id: 'electricity',
    name: 'Lắp đặt hệ thống điện',
    icon: Zap,
    badge: '24/7',
    query: 'điện',
    isFixed: false,
  },
  {
    id: 'inspection',
    name: 'Kiểm tra thiết bị',
    icon: Cpu,
    query: 'kiểm tra',
    price: 100000,
    unit: 'Lần',
    isFixed: true,
  },
];


// Quick Category Chips
const quickChips = [
  { id: 'urgent', title: 'Cứu hộ điện nước 24/7', icon: Zap, query: 'điện' },
  { id: 'ac', title: 'Vệ sinh máy lạnh 180K', icon: Snowflake, query: 'vệ sinh điều hòa' },
  { id: 'ai', title: 'AI Chẩn đoán hỏng hóc', icon: Bot, isAi: true },
  { id: 'voucher', title: 'Voucher giảm 50.000đ', icon: Gift },
];

// The two ways to book sit side by side: choose the service yourself, or let
// the assistant diagnose the problem and choose it.
const featureCards = [
  {
    title: 'Đặt thợ',
    text: 'Bạn biết mình cần dịch vụ gì: chọn dịch vụ, địa chỉ và giờ hẹn, kỹ thuật viên gần bạn nhận việc.',
    tags: ['Chủ động chọn dịch vụ'],
    icon: CalendarPlus,
    to: '/app/bookings/new',
  },
  {
    title: 'Chẩn đoán hỏng hóc bằng AI',
    text: 'Chưa rõ lỗi: mô tả hoặc chụp ảnh, trợ lý AI hỏi thêm, chẩn đoán và chọn dịch vụ rồi bạn đặt thợ.',
    tags: ['Chưa rõ lỗi'],
    icon: Bot,
    to: '/app/bookings/ai',
  },
  {
    title: 'Bảng giá tham khảo',
    text: 'Xem bảng giá dịch vụ cố định, vật tư chính hãng & bảo hành dài hạn 12 tháng',
    tags: ['Giá cố định minh bạch'],
    icon: CircleDollarSign,
    to: '/services',
  },
  {
    title: 'Bảo hành điện tử',
    text: 'Xem phiếu bảo hành, yêu cầu bảo hành lại & theo dõi tiến trình xử lý',
    tags: ['Tra cứu nhanh'],
    icon: FileCheck,
    to: '/app/warranties',
  },
];

const promises = [
  { title: 'Thợ xác minh', text: 'Lý lịch 100% rõ ràng, kiểm tra tay nghề định kỳ', icon: ShieldCheck },
  { title: 'Giá minh bạch', text: 'Báo giá trước khi làm, niêm yết theo catalog', icon: Tag },
  { title: 'Bảo hành 30 ngày', text: 'Bảo hành điện tử, giải quyết khiếu nại trong 24h', icon: Award },
];

function formatAddress(addr: UserAddress): string {
  return [addr.line1, addr.ward, addr.district, addr.province].filter(Boolean).join(', ');
}

onMounted(async () => {
  try {
    const [orderList, addrList] = await Promise.all([
      ordersApi.getCustomerOrders().catch(() => []),
      profileApi.getAddresses().catch(() => []),
    ]);
    orders.value = orderList;
    addresses.value = addrList;

    const def = addrList.find((a) => a.isDefault);
    if (def) {
      selectedAddress.value = formatAddress(def);
    } else if (addrList.length > 0) {
      selectedAddress.value = formatAddress(addrList[0]);
    } else {
      selectedAddress.value = '';
    }
  } finally {
    loading.value = false;
  }
});

// Active in-progress order (if any)
const activeOrder = computed(() => {
  return orders.value.find(
    (o) =>
      o.status === 'EN_ROUTE' ||
      o.status === 'UNDER_REPAIR' ||
      o.status === 'ACCEPTED' ||
      o.status === 'IN_PROGRESS',
  );
});

// Recent completed orders
const recentOrders = computed(() => {
  return orders.value.slice(0, 3);
});

// Stats summary
const orderStats = computed(() => {
  const total = orders.value.length;
  const completed = orders.value.filter((o) => o.status === 'COMPLETED').length;
  const inProgress = orders.value.filter((o) =>
    ['EN_ROUTE', 'UNDER_REPAIR', 'ACCEPTED', 'IN_PROGRESS'].includes(o.status),
  ).length;
  return { total, completed, inProgress };
});

const statTiles = computed(() => [
  { label: 'Tổng đơn', value: orderStats.value.total, icon: BookOpen },
  { label: 'Đang xử lý', value: orderStats.value.inProgress, icon: Timer },
  { label: 'Hoàn thành', value: orderStats.value.completed, icon: BadgeCheck },
]);

function handleSearch() {
  const q = searchQuery.value.trim();
  router.push({ path: '/app/bookings/new', query: q ? { q } : {} });
}

function handleChipClick(chip: typeof quickChips[0]) {
  if (chip.isAi) {
    router.push('/app/bookings/ai');
  } else if (chip.query) {
    router.push({ path: '/app/bookings/new', query: { q: chip.query } });
  } else {
    router.push('/app/bookings/new');
  }
}

function handleServiceClick(service: (typeof popularServices)[0]) {
  router.push({
    path: '/app/bookings/new',
    query: {
      q: service.query,
      popular: 'true',
      ...(service.isFixed ? { fixed: 'true' } : {}),
    },
  });
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
    <!-- 1. Greeting and delivery address -->
    <section class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-2xl border border-ink-200">
      <div class="flex items-center gap-3 min-w-0">
        <div class="relative shrink-0">
          <div class="w-11 h-11 rounded-full bg-brand-50 text-brand-700 font-semibold flex items-center justify-center text-sm border border-brand-100 overflow-hidden">
            <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-full h-full object-cover" />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) || 'K' }}</span>
          </div>
          <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success-500 border-2 border-white" />
        </div>
        <div class="min-w-0">
          <p class="text-sm text-ink-500">Xin chào</p>
          <h2 class="text-base font-semibold text-ink-900 truncate">{{ authStore.user?.fullName || 'Khách hàng' }}</h2>
        </div>
      </div>

      <router-link
        to="/app/profile"
        class="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-ink-50 hover:bg-ink-100 transition-colors text-sm sm:max-w-md min-w-0"
        :title="selectedAddress ? 'Quản lý sổ địa chỉ' : 'Thêm địa chỉ giao hàng'"
      >
        <MapPin :size="18" class="text-brand-600 shrink-0" />
        <span class="min-w-0">
          <span class="block text-xs text-ink-500">Giao đến</span>
          <span v-if="selectedAddress" class="block font-medium text-ink-900 truncate" :title="selectedAddress">{{ selectedAddress }}</span>
          <span v-else class="block font-medium text-brand-600 truncate">Chưa có địa chỉ (Thêm mới)</span>
        </span>
        <ChevronRight :size="16" class="text-ink-400 shrink-0" />
      </router-link>
    </section>

    <!-- 2. The one emphasis block of the page: search what needs fixing -->
    <section class="rounded-2xl bg-linear-to-br from-brand-600 to-brand-500 p-6 sm:p-8 text-white">
      <div class="max-w-2xl space-y-4">
        <p class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white/15 text-sm text-white/90">
          <Sparkles :size="14" />
          Tin tưởng - Nhanh chóng - Hiệu quả
        </p>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">
          Cần sửa gì hôm nay?
          <span class="block text-lg sm:text-xl font-medium text-white/85 mt-1">Thợ giỏi FixHome sẵn sàng tới ngay</span>
        </h1>

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

        <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-white/90">
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap"><Zap :size="15" /> Không mất phí khảo sát</span>
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap"><Users :size="15" /> 100,000+ thợ tay nghề cao</span>
        </div>
      </div>
    </section>

    <!-- 3. Availability line -->
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white border border-ink-200 text-left hover:bg-ink-25 transition-colors"
      @click="router.push('/app/bookings/new')"
    >
      <span class="flex items-center gap-3 min-w-0 text-sm text-ink-700">
        <ShieldCheck :size="20" :stroke-width="1.75" class="text-success-600 shrink-0" />
        <span class="text-pretty"><strong class="font-semibold text-ink-900">128+ thợ FixHome</strong> sẵn sàng có mặt sau 15–30 phút tại khu vực của bạn!</span>
      </span>
      <ChevronRight :size="18" class="text-ink-400 shrink-0" />
    </button>

    <!-- 4. Quick picks -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <button
        v-for="chip in quickChips"
        :key="chip.id"
        type="button"
        class="h-9 px-3.5 rounded-full bg-white border border-ink-200 text-sm text-ink-700 hover:border-brand-300 hover:text-brand-700 transition-colors shrink-0 inline-flex items-center gap-2 whitespace-nowrap"
        @click="handleChipClick(chip)"
      >
        <component :is="chip.icon" :size="16" :stroke-width="1.75" class="text-ink-500" />
        {{ chip.title }}
      </button>
    </div>

    <!-- 5. Ways in: the two ways to book first, side by side -->
    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <button
        v-for="card in featureCards"
        :key="card.title"
        type="button"
        class="text-left p-5 rounded-2xl bg-white border border-ink-200 hover:border-ink-300 transition-colors flex flex-col gap-3"
        @click="router.push(card.to)"
      >
        <span class="flex items-center justify-between gap-3">
          <span class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <component :is="card.icon" :size="22" :stroke-width="1.75" />
          </span>
          <span class="flex flex-wrap justify-end gap-1.5">
            <span
              v-for="tag in card.tags"
              :key="tag"
              class="h-6 px-2 rounded-lg bg-ink-100 text-ink-600 text-xs font-medium inline-flex items-center whitespace-nowrap"
            >
              {{ tag }}
            </span>
          </span>
        </span>
        <span class="block text-lg font-semibold text-ink-900">{{ card.title }}</span>
        <span class="block text-sm text-ink-600 text-pretty">{{ card.text }}</span>
      </button>
    </section>

    <!-- 6. Order in progress -->
    <section v-if="activeOrder" class="p-5 sm:p-6 rounded-2xl bg-white border border-brand-200 shadow-(--shadow-e1) space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-base font-semibold text-ink-900 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-brand-600" />
          Đơn sửa chữa đang diễn ra
        </h3>
        <FhStatusPill :status="activeOrder.status" />
      </div>

      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-ink-50">
        <div class="min-w-0 space-y-1">
          <span class="text-sm text-ink-500 font-num">{{ activeOrder.code }}</span>
          <h4 class="text-base font-semibold text-ink-900">{{ activeOrder.serviceName }}</h4>
          <p class="text-sm text-ink-600 flex items-start gap-1.5">
            <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
            <span class="text-pretty">{{ activeOrder.addressSummary }}</span>
          </p>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center gap-3 lg:border-l lg:border-ink-200 lg:pl-5 shrink-0">
          <div v-if="activeOrder.technician" class="flex items-center gap-2.5 min-w-0">
            <span class="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
              {{ activeOrder.technician.fullName.charAt(0) }}
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-ink-900 truncate">{{ activeOrder.technician.fullName }}</span>
              <span class="block text-xs text-ink-500 whitespace-nowrap">
                <template v-if="formatRating(activeOrder.technician.averageRating)"><span class="text-warning-500">★</span> {{ formatRating(activeOrder.technician.averageRating) }}</template><template v-else>Chưa có đánh giá</template> · Kỹ thuật viên
              </span>
            </span>
          </div>
          <div class="grid grid-cols-2 sm:flex items-center gap-2">
            <FhButton variant="primary" size="sm" @click="handleChatForOrder(activeOrder)">
              <MessageSquare :size="16" />
              Nhắn tin
            </FhButton>
            <FhButton variant="secondary" size="sm" @click="router.push(`/app/orders/${activeOrder.id}`)">
              Xem tiến độ
            </FhButton>
          </div>
        </div>
      </div>
    </section>

    <!-- 7. Order counts -->
    <section v-if="!loading && orders.length > 0" class="grid grid-cols-3 gap-3">
      <div v-for="stat in statTiles" :key="stat.label" class="p-4 rounded-2xl bg-white border border-ink-200">
        <component :is="stat.icon" :size="18" :stroke-width="1.75" class="text-ink-400 mb-2" />
        <div class="text-xl font-semibold text-ink-900 font-num">{{ stat.value }}</div>
        <div class="text-sm text-ink-500 whitespace-nowrap">{{ stat.label }}</div>
      </div>
    </section>

    <!-- 8. Popular services -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-ink-900">Dịch vụ phổ biến</h2>
        <button
          type="button"
          class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap"
          @click="router.push('/services')"
        >
          Xem tất cả <ChevronRight :size="16" />
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          v-for="srv in popularServices"
          :key="srv.id"
          type="button"
          class="p-4 rounded-2xl bg-white border border-ink-200 hover:border-brand-300 transition-colors flex items-center gap-3.5 text-left"
          @click="handleServiceClick(srv)"
        >
          <span class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <component :is="srv.icon" :size="22" :stroke-width="1.75" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="flex items-center gap-2">
              <span class="text-sm font-semibold text-ink-900 truncate">{{ srv.name }}</span>
              <span v-if="srv.badge" class="h-5 px-1.5 rounded-md bg-warning-50 text-warning-800 text-[11px] font-medium inline-flex items-center whitespace-nowrap shrink-0">
                {{ srv.badge }}
              </span>
            </span>
            <span v-if="srv.price" class="block text-sm text-ink-600 font-num whitespace-nowrap">Từ {{ srv.price.toLocaleString('vi-VN') }}&nbsp;₫</span>
            <span v-else class="block text-sm text-ink-500 whitespace-nowrap">Khảo sát tận nơi</span>
          </span>
          <ChevronRight :size="18" class="text-ink-400 shrink-0" />
        </button>
      </div>
    </section>

    <!-- 9. Offer -->
    <section
      class="p-5 sm:p-6 rounded-2xl bg-white border border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-ink-300 transition-colors"
      @click="router.push('/app/bookings/new')"
    >
      <div class="flex gap-4 min-w-0">
        <span class="w-11 h-11 rounded-xl bg-warning-50 text-warning-600 flex items-center justify-center shrink-0">
          <Gift :size="22" :stroke-width="1.75" />
        </span>
        <div class="space-y-1 min-w-0">
          <p class="text-sm font-medium text-warning-700">Đặt thợ ngay</p>
          <h3 class="text-lg font-semibold text-ink-900">Giảm 30% cho đơn sửa chữa đầu tiên</h3>
          <p class="text-sm text-ink-600 text-pretty">Cam kết bảo hành sửa chữa 30 ngày an tâm, hoàn tiền nếu không hài lòng.</p>
        </div>
      </div>
      <FhButton variant="primary" size="md" class="self-start sm:self-center">
        Tham gia ngay
        <ChevronRight :size="16" />
      </FhButton>
    </section>

    <!-- 10. Recent orders -->
    <section v-if="recentOrders.length > 0" class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-ink-900">Lịch sử sửa chữa gần đây</h2>
        <router-link to="/app/orders" class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap">
          Xem tất cả đơn <ChevronRight :size="16" />
        </router-link>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          v-for="order in recentOrders"
          :key="order.id"
          type="button"
          class="text-left p-4 rounded-2xl bg-white border border-ink-200 hover:border-ink-300 transition-colors flex flex-col gap-3"
          @click="router.push(`/app/orders/${order.id}`)"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="text-sm text-ink-500 font-num truncate">{{ order.code }}</span>
            <FhStatusPill :status="order.status" />
          </span>
          <span class="block text-sm font-semibold text-ink-900 line-clamp-2">{{ order.serviceName }}</span>
          <span class="text-sm text-ink-500 flex items-center gap-1.5">
            <Clock :size="14" />
            {{ vnDateString(order.createdAt) }}
          </span>
          <span class="mt-auto pt-3 border-t border-ink-100 flex items-center justify-between text-sm">
            <span class="text-ink-500">Tổng tiền:</span>
            <span class="font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="order.grandTotal" /></span>
          </span>
        </button>
      </div>
    </section>

    <!-- 11. Promises -->
    <section class="grid grid-cols-1 sm:grid-cols-3 rounded-2xl bg-white border border-ink-200 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
      <div v-for="promise in promises" :key="promise.title" class="p-5 flex sm:flex-col items-start gap-3">
        <component :is="promise.icon" :size="22" :stroke-width="1.75" class="text-brand-600 shrink-0" />
        <div>
          <h4 class="text-sm font-semibold text-ink-900">{{ promise.title }}</h4>
          <p class="text-sm text-ink-500 text-pretty">{{ promise.text }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
