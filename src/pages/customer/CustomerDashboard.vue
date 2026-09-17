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
  Wrench,
  Bot,
  ShoppingBag,
  Snowflake,
  Droplets,
  Tv,
  Cpu,
  Disc,
  Package,
  Clock,
  MapPin,
  ArrowRight,
  ChevronRight,
  MessageSquare,
  Award,
  Tag,
  Flame,
} from 'lucide-vue-next';
import { FhMoney, FhStatusPill } from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { profileApi, type UserAddress } from '../../api/profile.api';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const searchQuery = ref('');
const orders = ref<ServiceOrderItem[]>([]);
const addresses = ref<UserAddress[]>([]);
const selectedAddress = ref('123 Đường Số 1, Quận 1, TP.HCM');
const loading = ref(true);

// 8 Popular Services matching Mobile
const popularServices = [
  {
    id: 'ac_clean',
    name: 'Vệ sinh\nmáy lạnh',
    icon: Snowflake,
    iconColor: '#0284C7',
    pedestalBg: '#E0F2FE',
    badge: 'HOT',
    query: 'vệ sinh điều hòa',
    price: 180000,
    unit: 'Máy',
    isFixed: true,
  },
  {
    id: 'washer_clean',
    name: 'Vệ sinh\nmáy giặt',
    icon: Disc,
    iconColor: '#7C3AED',
    pedestalBg: '#EDE9FE',
    badge: 'GIÁ TỐT',
    query: 'vệ sinh máy giặt',
    price: 350000,
    unit: 'Máy',
    isFixed: true,
  },
  {
    id: 'dryer_clean',
    name: 'Vệ sinh\nmáy sấy',
    icon: Package,
    iconColor: '#EA580C',
    pedestalBg: '#FFEDD5',
    query: 'vệ sinh máy sấy',
    price: 350000,
    unit: 'Máy',
    isFixed: true,
  },
  {
    id: 'plumbing',
    name: 'Sửa ống\nnước',
    icon: Droplets,
    iconColor: '#0D9488',
    pedestalBg: '#CCFBF1',
    query: 'ống nước',
    isFixed: false,
  },
  {
    id: 'electricity',
    name: 'Lắp đặt hệ\nthống điện',
    icon: Zap,
    iconColor: '#EAB308',
    pedestalBg: '#FEF9C3',
    badge: '24/7',
    query: 'điện',
    isFixed: false,
  },
  {
    id: 'drainage',
    name: 'Thông nghẹt\ncống',
    icon: Wrench,
    iconColor: '#4F46E5',
    pedestalBg: '#E0E7FF',
    query: 'cống',
    isFixed: false,
  },
  {
    id: 'tv_repair',
    name: 'Sửa Tivi\ntại nhà',
    icon: Tv,
    iconColor: '#2563EB',
    pedestalBg: '#DBEAFE',
    query: 'tivi',
    isFixed: false,
  },
  {
    id: 'inspection',
    name: 'Kiểm tra\nthiết bị',
    icon: Cpu,
    iconColor: '#059669',
    pedestalBg: '#D1FAE5',
    query: 'kiểm tra',
    price: 100000,
    unit: 'Lần',
    isFixed: true,
  },
];


// Quick Category Chips
const quickChips = [
  { id: 'urgent', title: '⚡ Cứu hộ điện nước 24/7', query: 'điện' },
  { id: 'ac', title: '❄️ Vệ sinh máy lạnh 150K', query: 'máy lạnh' },
  { id: 'ai', title: '🤖 AI Chẩn đoán hỏng hóc', isAi: true },
  { id: 'drain', title: '🚿 Thông cống không đục phá', query: 'cống' },
  { id: 'voucher', title: '🎁 Voucher giảm 50.000đ' },
];

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
      selectedAddress.value = `${def.line1}, ${def.ward}, ${def.district}, ${def.province}`;
    } else if (addrList.length > 0) {
      const a = addrList[0];
      selectedAddress.value = `${a.line1}, ${a.ward}, ${a.district}, ${a.province}`;
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

function handleSearch() {
  const q = searchQuery.value.trim();
  router.push({ path: '/app/bookings/new', query: q ? { q } : {} });
}

function handleChipClick(chip: typeof quickChips[0]) {
  if (chip.isAi) {
    router.push({ path: '/app/bookings/new', query: { ai: 'true' } });
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
  <div class="space-y-6 max-w-5xl mx-auto pb-12">
    <!-- 1. Address Bar & Greeting -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-3.5 rounded-2xl border border-ink-200 shadow-xs">
      <div class="flex items-center gap-3">
        <div class="relative">
          <div class="w-11 h-11 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-sm border border-brand-200 overflow-hidden shadow-xs">
            <img
              v-if="authStore.user?.avatarUrl"
              :src="authStore.user.avatarUrl"
              alt="Avatar"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) || 'C' }}</span>
          </div>
          <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success-600 border-2 border-white"></span>
        </div>

        <div>
          <div class="text-xs text-ink-500 flex items-center gap-1 font-medium">
            <span>Xin chào</span>
            <span class="text-sm">👋</span>
          </div>
          <h2 class="text-base font-bold text-ink-900 leading-tight">
            {{ authStore.user?.fullName || 'Khách hàng' }}
          </h2>
        </div>
      </div>

      <!-- Address Selector -->
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-ink-50 border border-ink-200 text-xs max-w-md">
        <MapPin :size="16" class="text-danger-600 shrink-0" />
        <div class="min-w-0">
          <span class="text-[10px] text-ink-400 block leading-none font-medium">Giao đến</span>
          <span class="font-semibold text-ink-800 truncate block mt-0.5" :title="selectedAddress">
            {{ selectedAddress }}
          </span>
        </div>
      </div>
    </div>

    <!-- 2. Hero Search Banner (Royal Blue Gradient - FixHome Mobile Signature) -->
    <div class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 p-6 sm:p-8 text-white shadow-md">
      <!-- Translucent Glassmorphism Decorative Circles -->
      <div class="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>
      <div class="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-blue-900/20 blur-xl pointer-events-none"></div>

      <div class="relative z-10 max-w-2xl space-y-4">
        <!-- Slogan -->
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-blue-100 border border-white/20 shadow-xs">
          <span>Tin tưởng - Nhanh chóng - Hiệu quả</span>
          <Sparkles :size="14" class="text-amber-300 fill-amber-300" />
        </div>

        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
          Cần sửa gì hôm nay? <br class="hidden sm:inline" />
          <span class="text-blue-100 font-semibold">Thợ giỏi FixHome sẵn sàng tới ngay</span>
        </h1>

        <!-- Pill Search Bar -->
        <form class="flex items-center gap-2 max-w-xl" @submit.prevent="handleSearch">
          <div class="flex-1 relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Điện, nước, máy lạnh, thông cống, tivi..."
              class="w-full pl-4 pr-12 py-3.5 rounded-2xl bg-white text-ink-900 placeholder:text-ink-400 text-sm font-medium shadow-lg outline-none focus:ring-4 focus:ring-white/30 transition-all"
            />
            <button
              type="submit"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center transition-colors shadow-sm"
              title="Tìm kiếm dịch vụ"
            >
              <Search :size="18" />
            </button>
          </div>
        </form>

        <!-- Sub Stats -->
        <div class="flex flex-wrap items-center gap-4 pt-1 text-xs text-blue-100 font-medium">
          <div class="flex items-center gap-1.5">
            <Zap :size="14" class="text-amber-300 fill-amber-300" />
            <span>Không mất phí khảo sát</span>
          </div>
          <span class="opacity-40">•</span>
          <div class="flex items-center gap-1.5">
            <Users :size="14" class="text-blue-200" />
            <span>100,000+ thợ tay nghề cao</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Status Announcement Pill -->
    <div
      class="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs shadow-xs cursor-pointer hover:bg-emerald-100/70 transition-colors"
      @click="router.push('/app/bookings/new')"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <ShieldCheck :size="16" />
        </div>
        <p class="truncate">
          <strong class="font-bold">128+ thợ FixHome</strong> sẵn sàng có mặt sau 15–30 phút tại khu vực của bạn!
        </p>
      </div>
      <ChevronRight :size="16" class="text-emerald-700 shrink-0" />
    </div>

    <!-- 4. Quick Category Chips (Horizontal Scroll) -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-medium">
      <button
        v-for="chip in quickChips"
        :key="chip.id"
        type="button"
        class="px-3.5 py-2 rounded-full bg-white border border-ink-200 text-ink-800 hover:border-brand-500 hover:text-brand-600 hover:bg-brand-50/50 transition-all shrink-0 shadow-xs flex items-center gap-1.5 active:scale-95"
        @click="handleChipClick(chip)"
      >
        <span>{{ chip.title }}</span>
      </button>
    </div>

    <!-- 5. 3 Hero Feature Cards (Đặt thợ, AI Soi lỗi, Vật tư Mall) -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Card 1: Đặt thợ -->
      <div
        class="relative p-5 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        @click="router.push('/app/bookings/new')"
      >
        <div>
          <span class="inline-block px-2.5 py-0.5 rounded-full bg-[#0284C7] text-white text-[11px] font-bold mb-3 shadow-xs">
            Thợ giỏi gần bạn
          </span>
          <h3 class="text-xl font-extrabold text-[#0369A1] tracking-tight">Đặt thợ</h3>
          <p class="text-xs text-[#0284C7] font-medium mt-0.5">Có mặt chỉ sau 15 phút</p>
        </div>
        <div class="flex justify-end mt-4">
          <div class="w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-sm text-[#0284C7] flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
            <Wrench :size="24" />
          </div>
        </div>
      </div>

      <!-- Card 2: AI Soi lỗi -->
      <div
        class="relative p-5 rounded-2xl bg-[#F3E8FF] border border-[#E9D5FF] hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        @click="router.push({ path: '/app/bookings/new', query: { ai: 'true' } })"
      >
        <div>
          <span class="inline-block px-2.5 py-0.5 rounded-full bg-[#7C3AED] text-white text-[11px] font-bold mb-3 shadow-xs">
            AI 30 giây
          </span>
          <h3 class="text-xl font-extrabold text-[#6D28D9] tracking-tight">AI Soi lỗi</h3>
          <p class="text-xs text-[#7C3AED] font-medium mt-0.5">Bắt bệnh & báo giá ngay</p>
        </div>
        <div class="flex justify-end mt-4">
          <div class="w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-sm text-[#7C3AED] flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
            <Bot :size="24" />
          </div>
        </div>
      </div>

      <!-- Card 3: Vật tư Mall -->
      <div
        class="relative p-5 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        @click="router.push('/services')"
      >
        <div>
          <span class="inline-block px-2.5 py-0.5 rounded-full bg-[#D97706] text-white text-[11px] font-bold mb-3 shadow-xs">
            Chính hãng
          </span>
          <h3 class="text-xl font-extrabold text-[#B45309] tracking-tight">Vật tư Mall</h3>
          <p class="text-xs text-[#D97706] font-medium mt-0.5">Bảo hành dài hạn 12 tháng</p>
        </div>
        <div class="flex justify-end mt-4">
          <div class="w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-sm text-[#D97706] flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
            <ShoppingBag :size="24" />
          </div>
        </div>
      </div>
    </div>

    <!-- 6. Active Order Tracker (if any order is in progress) -->
    <div
      v-if="activeOrder"
      class="p-5 rounded-2xl bg-white border-2 border-brand-200 shadow-md space-y-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-brand-600"></span>
          </span>
          <h3 class="text-sm font-bold text-ink-900">Đơn sửa chữa đang diễn ra</h3>
        </div>
        <FhStatusPill :status="activeOrder.status" />
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-ink-25 border border-ink-100">
        <div class="space-y-1">
          <span class="font-mono text-xs font-bold text-ink-500">{{ activeOrder.code }}</span>
          <h4 class="text-base font-bold text-ink-900">{{ activeOrder.serviceName }}</h4>
          <p class="text-xs text-ink-500 flex items-center gap-1.5">
            <MapPin :size="13" class="text-brand-600 shrink-0" />
            {{ activeOrder.addressSummary }}
          </p>
        </div>

        <!-- Tech Info & Quick Actions -->
        <div class="flex items-center gap-3 sm:border-l sm:border-ink-200 sm:pl-6">
          <div v-if="activeOrder.technician" class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {{ activeOrder.technician.fullName.charAt(0) }}
            </div>
            <div>
              <div class="font-bold text-xs text-ink-900">{{ activeOrder.technician.fullName }}</div>
              <div class="text-[11px] text-ink-500">★ {{ activeOrder.technician.averageRating || '5.0' }} • Kỹ thuật viên</div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors flex items-center gap-1.5 shadow-xs"
              @click="handleChatForOrder(activeOrder)"
            >
              <MessageSquare :size="14" />
              <span>Nhắn tin</span>
            </button>
            <button
              type="button"
              class="px-3 py-2 rounded-xl bg-white border border-ink-200 text-ink-700 text-xs font-semibold hover:bg-ink-50 transition-colors"
              @click="router.push(`/app/orders/${activeOrder.id}`)"
            >
              Xem tiến độ
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 7. Popular Services Grid (8 Dịch vụ bục 3D Isometric chuẩn Mobile) -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles :size="18" class="text-brand-600" />
          <h2 class="text-lg font-bold text-ink-900">Dịch vụ phổ biến</h2>
        </div>
        <button
          type="button"
          class="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
          @click="router.push('/services')"
        >
          Xem tất cả <ChevronRight :size="14" />
        </button>
      </div>

      <!-- Grid 4 cột trên desktop, 2 cột trên mobile -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <button
          v-for="srv in popularServices"
          :key="srv.id"
          type="button"
          class="p-4 rounded-2xl bg-white border border-ink-200 hover:border-brand-400 hover:shadow-md transition-all flex flex-col items-center text-center group active:scale-95"
          @click="handleServiceClick(srv)"
        >
          <!-- 3D Isometric Pedestal Effect -->
          <div class="relative mb-3">
            <div
              class="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xs transition-transform group-hover:scale-105"
              :style="{ backgroundColor: srv.pedestalBg }"
            >
              <component :is="srv.icon" :size="28" :style="{ color: srv.iconColor }" />
            </div>
            <!-- Hot Badge -->
            <span
              v-if="srv.badge"
              class="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full bg-danger-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs"
            >
              {{ srv.badge }}
            </span>
          </div>

          <span class="text-xs font-bold text-ink-800 group-hover:text-brand-600 whitespace-pre-line leading-tight">
            {{ srv.name }}
          </span>
          <span
            v-if="srv.price"
            class="mt-1.5 text-[10px] font-extrabold text-brand-700 bg-brand-50 border border-brand-200/80 px-2 py-0.5 rounded-full font-num"
          >
            Từ {{ srv.price.toLocaleString('vi-VN') }}đ
          </span>
          <span
            v-else
            class="mt-1.5 text-[10px] font-medium text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded-full"
          >
            Khảo sát tận nơi
          </span>
        </button>

      </div>
    </div>

    <!-- 8. Promotional Campaign Banner (Dark Slate to Royal Blue) -->
    <div
      class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-blue-900 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md cursor-pointer hover:shadow-lg transition-all"
      @click="router.push('/app/bookings/new')"
    >
      <div class="space-y-2 text-center sm:text-left">
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[10px] font-bold uppercase tracking-wider">
          <Flame :size="12" class="text-amber-400" />
          ĐẶT THỢ NGAY
        </span>
        <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight">
          Giảm 30% cho đơn sửa chữa đầu tiên
        </h3>
        <p class="text-xs sm:text-sm text-slate-300">
          Cam kết bảo hành sửa chữa 30 ngày an tâm, hoàn tiền nếu không hài lòng.
        </p>
      </div>

      <button
        type="button"
        class="px-5 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-blue-50 text-xs font-bold shrink-0 transition-colors shadow-sm flex items-center gap-1.5"
      >
        <span>Tham gia ngay</span>
        <ArrowRight :size="14" />
      </button>
    </div>

    <!-- 9. Recent Orders History (3 đơn gần nhất) -->
    <div v-if="recentOrders.length > 0" class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-bold text-ink-900">Lịch sử sửa chữa gần đây</h2>
        <router-link
          to="/app/orders"
          class="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
        >
          Xem tất cả đơn <ChevronRight :size="14" />
        </router-link>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div
          v-for="order in recentOrders"
          :key="order.id"
          class="p-4 rounded-2xl bg-white border border-ink-200 hover:border-brand-300 hover:shadow-xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
          @click="router.push(`/app/orders/${order.id}`)"
        >
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-1">
              <span class="font-mono text-xs font-bold text-ink-500">{{ order.code }}</span>
              <FhStatusPill :status="order.status" />
            </div>
            <h4 class="text-sm font-bold text-ink-900 line-clamp-1">{{ order.serviceName }}</h4>
            <p class="text-xs text-ink-500 flex items-center gap-1.5">
              <Clock :size="12" />
              <span>{{ new Date(order.createdAt).toLocaleDateString('vi-VN') }}</span>
            </p>
          </div>

          <div class="pt-2 border-t border-ink-100 flex items-center justify-between text-xs">
            <span class="text-ink-400 font-medium">Tổng tiền:</span>
            <span class="font-bold text-brand-700">
              <FhMoney :amount="order.grandTotal" />
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 10. FixHome Trust Section (3 Cam kết vàng) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 rounded-2xl bg-white border border-ink-200 shadow-xs divide-y sm:divide-y-0 sm:divide-x divide-ink-100 text-center">
      <div class="pt-3 sm:pt-0 sm:px-4 space-y-1">
        <div class="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-2">
          <ShieldCheck :size="20" />
        </div>
        <h4 class="text-xs font-bold text-ink-900">Thợ xác minh</h4>
        <p class="text-[11px] text-ink-500">Lý lịch 100% rõ ràng, kiểm tra tay nghề định kỳ</p>
      </div>

      <div class="pt-3 sm:pt-0 sm:px-4 space-y-1">
        <div class="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-2">
          <Tag :size="20" />
        </div>
        <h4 class="text-xs font-bold text-ink-900">Giá minh bạch</h4>
        <p class="text-[11px] text-ink-500">Báo giá trước khi làm, niêm yết theo catalog</p>
      </div>

      <div class="pt-3 sm:pt-0 sm:px-4 space-y-1">
        <div class="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-2">
          <Award :size="20" />
        </div>
        <h4 class="text-xs font-bold text-ink-900">Bảo hành 30 ngày</h4>
        <p class="text-[11px] text-ink-500">Bảo hành điện tử, giải quyết khiếu nại trong 24h</p>
      </div>
    </div>
  </div>
</template>
