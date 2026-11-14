<script setup lang="ts">
import { composeAddressText } from '../../utils/address-text';
// src/pages/customer/CustomerDashboard.vue
// Home of the customer (PO 10/10/2026): one emphasis block (search), each action once.
// "Đặt thợ ngay" and "Chẩn đoán bằng AI" live in the top bar, so the page does not repeat them.
import { ref, computed, watch, type Directive } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
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
  Phone,
  Wrench,
  Droplets,
  Star,
  Wallet,
  TicketPercent,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Clock,
  CheckCircle2,
  RotateCcw,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton, FhStatusPill } from '../../components';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { ordersApi, type OrderWarrantyGroup, type ServiceOrderItem } from '../../api/orders.api';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';
import {
  customerWalletApi,
  customerWalletTypeLabels,
  isIncomingWalletTransaction,
  type CustomerWalletTransaction,
} from '../../api/customer-wallet.api';
import {
  vouchersApi,
  type GeneralVoucher,
  type VoucherClaim,
  type VoucherPolicy,
} from '../../api/vouchers.api';
import { vnClock, vnDateString } from '../../utils/vn-time';
import { formatCurrencyVND, formatRating } from '../../utils/formatters';
import { claimDisplayMeta, isOpenClaim, warrantyClaimToneClasses } from '../../utils/warranty-claim';
import { userFacingError } from '../../utils/user-facing-error';
import { useCachedQuery } from '../../composables/useCachedQuery';
import { REFERENCE_STALE_TIME } from '../../lib/query-client';
import { queryKeys } from '../../lib/query-keys';
import { sharedQueries } from '../../lib/queries';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const searchQuery = ref('');
const selectedAddress = ref('');
const claimingVoucherCode = ref<string | null>(null);
const isSignedIn = computed(() => authStore.isAuthenticated);

// Each block is cached: a return visit shows it at once and reads it again in the background.
const ordersQuery = useCachedQuery(sharedQueries.customerRecentOrders);
const orders = computed<ServiceOrderItem[]>(() => (ordersQuery.error.value ? [] : (ordersQuery.data.value ?? [])));
const loading = ordersQuery.loading;
const ordersFailed = computed(() => !!ordersQuery.error.value);

const addressesQuery = useCachedQuery({ key: queryKeys.addresses, fetch: () => profileApi.getAddresses() });

// Dịch vụ lấy thật từ danh mục của backend; không có thì ẩn khối này.
const servicesQuery = useCachedQuery({
  key: queryKeys.reference.services({ page: 1, limit: 6 }),
  fetch: () => catalogApi.getServices({ page: 1, limit: 6 }),
  staleTime: REFERENCE_STALE_TIME,
});
const popularServices = computed<ServiceItem[]>(() =>
  (servicesQuery.error.value ? [] : (servicesQuery.data.value?.data ?? [])).filter((svc) => svc.isActive !== false),
);
const servicesLoading = servicesQuery.loading;

const walletQuery = useCachedQuery({
  key: queryKeys.wallet.customer({ page: 1, pageSize: 3 }),
  fetch: () => customerWalletApi.summary(1, 3),
  enabled: isSignedIn,
});
const walletSummary = computed(() => (walletQuery.error.value ? undefined : walletQuery.data.value));
const recentWalletTxs = computed<CustomerWalletTransaction[]>(() => (walletSummary.value?.transactions ?? []).slice(0, 2));

const voucherWalletQuery = useCachedQuery({
  key: ['vouchers', 'wallet'],
  fetch: () => vouchersApi.wallet(),
  enabled: isSignedIn,
});
const generalVouchersQuery = useCachedQuery({
  key: ['vouchers', 'general'],
  fetch: () => vouchersApi.general(),
  enabled: isSignedIn,
  staleTime: REFERENCE_STALE_TIME,
});

const availableVouchers = computed<VoucherClaim[]>(() => {
  if (voucherWalletQuery.error.value) return [];
  const now = Date.now();
  return (voucherWalletQuery.data.value ?? []).filter((claim) => {
    const endsAt = Date.parse(claim.campaign.endsAt);
    return claim.status === 'CLAIMED' && claim.campaign.active && (!Number.isFinite(endsAt) || endsAt > now);
  });
});

const claimableGeneralVouchers = computed<GeneralVoucher[]>(() => {
  if (generalVouchersQuery.error.value) return [];
  const claimedCodes = new Set((voucherWalletQuery.data.value ?? []).map((item) => item.campaign.code));
  const now = Date.now();
  return (generalVouchersQuery.data.value ?? []).filter((item) => {
    const endsAt = Date.parse(item.endsAt);
    return !claimedCodes.has(item.code) && (!Number.isFinite(endsAt) || endsAt > now);
  });
});

const vouchersLoading = computed(
  () => voucherWalletQuery.loading.value || (availableVouchers.value.length === 0 && generalVouchersQuery.loading.value),
);
const vouchersFailed = computed(
  () =>
    (!!voucherWalletQuery.error.value || !!generalVouchersQuery.error.value) &&
    availableVouchers.value.length === 0 &&
    claimableGeneralVouchers.value.length === 0,
);

const warrantyOrdersQuery = useCachedQuery({
  key: queryKeys.warranty.customerOrders({ page: 1, pageSize: 5 }),
  fetch: () => ordersApi.getOrderWarrantiesPage(1, 5),
  enabled: isSignedIn,
});
const warrantyGroups = computed<OrderWarrantyGroup[]>(() =>
  warrantyOrdersQuery.error.value ? [] : (warrantyOrdersQuery.data.value?.items ?? []),
);
const activeWarrantyCount = computed(() => warrantyGroups.value.filter((group) => group.hasActiveCoverage).length);
const openWarrantyClaimsCount = computed(() =>
  warrantyGroups.value.filter((group) => group.claims.some((claim) => isOpenClaim(claim.status))).length,
);
const featuredWarranties = computed<OrderWarrantyGroup[]>(() =>
  [...warrantyGroups.value]
    .sort((a, b) => {
      const aOpen = a.claims.some((c) => isOpenClaim(c.status)) ? 2 : a.hasActiveCoverage ? 1 : 0;
      const bOpen = b.claims.some((c) => isOpenClaim(c.status)) ? 2 : b.hasActiveCoverage ? 1 : 0;
      return bOpen - aOpen;
    })
    .slice(0, 2),
);

function isFixedPrice(svc: ServiceItem): boolean {
  return svc.pricingMode?.toLowerCase() === 'fixed_price' && svc.fixedPrice != null && svc.fixedPrice > 0;
}

function formatVoucherBenefit(p: VoucherPolicy): string {
  if (p.discount === 'PERCENT') {
    return p.capVnd ? `Giảm ${p.value}% · tối đa ${formatCurrencyVND(p.capVnd)}` : `Giảm ${p.value}%`;
  }
  return `Giảm ${formatCurrencyVND(p.value)}`;
}

function getLatestOpenClaim(group: OrderWarrantyGroup) {
  return group.claims.find((claim) => isOpenClaim(claim.status)) ?? null;
}

// Quick searches under the search box.
const quickChips = [
  { id: 'ac', title: 'Vệ sinh máy lạnh', image: '/images/air-conditioner.png', icon: Snowflake, query: 'vệ sinh điều hòa' },
  { id: 'washing', title: 'Sửa máy giặt', image: '/images/washing-machine.png', icon: Wrench, query: 'sửa máy giặt' },
  { id: 'fridge', title: 'Sửa tủ lạnh', image: '/images/refrigerator.png', icon: Snowflake, query: 'sửa tủ lạnh' },
  { id: 'plumbing', title: 'Sửa rò rỉ', image: '/images/water-pipeline.png', icon: Droplets, query: 'sửa rò rỉ' },
  { id: 'fan', title: 'Sửa quạt điện', icon: Zap, query: 'sửa quạt điện' },
];

const onboardingSteps = [
  { step: 1, title: 'Chọn sự cố & địa chỉ', desc: 'Mô tả thiết bị cần sửa và chọn khung giờ phù hợp.' },
  { step: 2, title: 'Kết nối kỹ thuật viên', desc: 'Theo dõi trạng thái nhận đơn và thời gian đến dự kiến.' },
  { step: 3, title: 'Duyệt giá & nghiệm thu', desc: 'Chỉ sửa khi bạn xác nhận chi phí, lưu bảo hành ngay.' },
];

const promises = [
  { title: 'Kỹ thuật viên đã xác minh hồ sơ', desc: 'Lý lịch rõ ràng, tay nghề được kiểm định', icon: ShieldCheck },
  { title: 'Báo giá trước, bạn duyệt rồi mới sửa', desc: 'Minh bạch chi phí, không phụ phí ẩn', icon: Tag },
  { title: 'Bảo hành ngay trên ứng dụng', desc: 'Theo dõi hạn bảo hành và tạo yêu cầu nhanh chóng', icon: Award },
];

const heroContextLine = computed(() => {
  const shortArea = selectedAddress.value
    ? selectedAddress.value
        .split(',')
        .slice(-2)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(', ')
    : '';
  return shortArea ? `Khu vực: ${shortArea}` : 'Đặt lịch sửa chữa tại nhà';
});

const heroHighlights = [
  'Tìm nhanh theo thiết bị hoặc sự cố cần xử lý',
  'Nhắn tin trực tiếp với kỹ thuật viên phụ trách',
  'Quản lý tiến độ, hóa đơn và bảo hành tại một nơi',
];

const bookingsQuery = useCachedQuery({
  key: queryKeys.bookings.customerList({ dashboard: true }),
  fetch: () => (bookingsApi.getMyBookings ? bookingsApi.getMyBookings() : Promise.resolve([])),
  enabled: isSignedIn,
});
const pendingBooking = computed<BookingItem | undefined>(() => {
  if (bookingsQuery.error.value) return undefined;
  return (bookingsQuery.data.value ?? []).find((b) => b.status === 'SUBMITTED' || b.status === 'MATCHING');
});
const isBookingMatching = computed(() => pendingBooking.value?.status === 'MATCHING');
const pendingBookingStepIndex = computed(() => {
  const status = String(pendingBooking.value?.status ?? '').toUpperCase();
  if (status === 'MATCHED') return 2;
  if (status === 'MATCHING') return 1;
  return 0;
});
const bookingProgressSteps = ['Đã gửi yêu cầu', 'Tìm kỹ thuật viên', 'Đã ghép kỹ thuật viên'];

const heroColClass = computed(() =>
  activeOrder.value || pendingBooking.value ? 'order-2 xl:order-1 xl:col-span-7' : 'xl:col-span-12',
);

const hasTopCompanion = computed(() => Boolean(activeOrder.value || pendingBooking.value));

const recentOrdersGridClass = computed(() => {
  if (recentOrders.value.length <= 1) return 'grid-cols-1';
  if (recentOrders.value.length === 2) return 'grid-cols-1 md:grid-cols-2';
  return 'grid-cols-1 md:grid-cols-3';
});

function formatAddress(addr: UserAddress): string {
  return composeAddressText([addr.line1, addr.ward, addr.district, addr.province]);
}

watch(
  () => addressesQuery.data.value,
  (addrList?: UserAddress[]) => {
    if (!addrList) return;
    const def = addrList.find((a) => a.isDefault) ?? addrList[0];
    selectedAddress.value = def ? formatAddress(def) : '';
  },
  { immediate: true },
);

function load() {
  void ordersQuery.refetch();
  void addressesQuery.refetch();
  void servicesQuery.refetch();
  if (isSignedIn.value) {
    void bookingsQuery.refetch();
    void walletQuery.refetch();
    void voucherWalletQuery.refetch();
    void generalVouchersQuery.refetch();
    void warrantyOrdersQuery.refetch();
  }
}

async function handleClaimVoucher(code: string) {
  if (claimingVoucherCode.value) return;
  claimingVoucherCode.value = code;
  try {
    await vouchersApi.claim(code);
    toast.success(`Đã lưu mã ${code} vào ví ưu đãi.`);
    await Promise.all([voucherWalletQuery.refetch(), generalVouchersQuery.refetch()]);
  } catch (err) {
    toast.error(userFacingError(err, 'Chưa thể lưu mã ưu đãi. Vui lòng thử lại.'));
  } finally {
    claimingVoucherCode.value = null;
  }
}

const IN_PROGRESS = ['EN_ROUTE', 'UNDER_REPAIR', 'ACCEPTED', 'IN_PROGRESS'];

// Active in-progress order (if any)
const activeOrder = computed(() => orders.value.find((o) => IN_PROGRESS.includes(o.status)));

const activeOrderStepIndex = computed(() => {
  const status = String(activeOrder.value?.status ?? '').toUpperCase();
  if (status === 'COMPLETED') return 3;
  if (status === 'UNDER_REPAIR' || status === 'IN_PROGRESS') return 2;
  if (status === 'EN_ROUTE' || status === 'ARRIVED') return 1;
  return 0;
});

const activeOrderProgressSteps = ['Đã nhận đơn', 'Đang di chuyển', 'Đang sửa chữa', 'Hoàn thành'];

const recentOrders = computed(() => orders.value.slice(0, 3));

const statTiles = computed(() => [
  { label: 'Tổng đơn', value: orders.value.length },
  { label: 'Đang xử lý', value: orders.value.filter((o) => IN_PROGRESS.includes(o.status)).length },
  { label: 'Hoàn thành', value: orders.value.filter((o) => o.status === 'COMPLETED').length },
]);

function canReorder(order: ServiceOrderItem): boolean {
  const status = String(order.status ?? '').toUpperCase();
  return status === 'COMPLETED' || status === 'CANCELLED';
}

function handleReorder(order: ServiceOrderItem) {
  router.push({ path: '/app/bookings/new', query: order.serviceName ? { q: order.serviceName } : {} });
}

type ScrollUpBinding = { delay?: number } | number | undefined;

const scrollUpCleanups = new WeakMap<HTMLElement, () => void>();

// Scroll-triggered upward reveal (`transform` + `opacity` only; content stays visible by default).
const vScrollUp: Directive<HTMLElement, ScrollUpBinding> = {
  mounted(el, binding) {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rawDelay = typeof binding.value === 'number' ? binding.value : binding.value?.delay ?? 0;
    const delayMs = prefersReducedMotion ? 0 : Math.max(0, Math.min(rawDelay, 220));

    el.classList.add('fh-scroll-up');

    let rafId = 0;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | null = null;

    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (finishTimer) clearTimeout(finishTimer);
      observer?.disconnect();
      observer = null;
    };
    scrollUpCleanups.set(el, cleanup);

    const finish = () => {
      el.dataset.scrollUp = 'done';
      el.style.removeProperty('transition-delay');
    };

    const reveal = () => {
      el.style.transitionDelay = delayMs > 0 ? `${delayMs}ms` : '0ms';
      rafId = window.requestAnimationFrame(() => {
        el.dataset.scrollUp = 'visible';
        finishTimer = setTimeout(finish, 360 + delayMs);
      });
    };

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const isAlreadyInView = rect.top <= viewportHeight * 0.94;

    el.dataset.scrollUp = 'hidden';

    if (prefersReducedMotion || isAlreadyInView) {
      reveal();
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const currentVh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (entry.isIntersecting || entry.boundingClientRect.top < currentVh) {
          observer?.disconnect();
          observer = null;
          reveal();
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -24px 0px' },
    );
    observer.observe(el);
  },
  unmounted(el) {
    scrollUpCleanups.get(el)?.();
    scrollUpCleanups.delete(el);
  },
};

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
  <div class="w-full space-y-5 pb-12">
    <!-- Greeting, quick account context and service address -->
    <section class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight min-w-0 text-balance">
        Xin chào, {{ authStore.user?.fullName || 'bạn' }}
      </h1>

      <div class="flex flex-wrap items-center gap-2 lg:justify-end min-w-0">
        <router-link
          to="/app/wallet"
          class="inline-flex items-center gap-2 h-11 px-3.5 rounded-[var(--radius-md)] bg-white border border-ink-200/90 hover:border-brand-300 hover:bg-ink-50 active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,background-color,transform] duration-150 ease-out text-xs sm:text-sm whitespace-nowrap shrink-0"
        >
          <Wallet :size="16" :stroke-width="1.75" class="text-brand-600 shrink-0" />
          <span class="text-ink-600">Ví</span>
          <FhMoney v-if="walletSummary" :amount="walletSummary.balance" class="font-semibold text-ink-900 font-num" />
          <span v-else class="font-medium text-ink-500">—</span>
        </router-link>

        <router-link
          to="/app/vouchers"
          class="inline-flex items-center gap-2 h-11 px-3.5 rounded-[var(--radius-md)] bg-white border border-ink-200/90 hover:border-brand-300 hover:bg-ink-50 active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,background-color,transform] duration-150 ease-out text-xs sm:text-sm whitespace-nowrap shrink-0"
        >
          <TicketPercent :size="16" :stroke-width="1.75" class="text-brand-600 shrink-0" />
          <span class="font-medium text-ink-900 font-num">
            {{ availableVouchers.length > 0 ? `${availableVouchers.length} ưu đãi` : 'Ưu đãi' }}
          </span>
        </router-link>

        <router-link
          to="/app/profile"
          class="flex items-center gap-2 h-11 ps-3.5 pe-3 rounded-[var(--radius-md)] border active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,background-color,transform] duration-150 ease-out text-xs sm:text-sm sm:max-w-xs lg:max-w-sm min-w-0 group"
          :class="
            selectedAddress
              ? 'bg-white border-ink-200/90 hover:border-brand-300 hover:bg-ink-50'
              : 'bg-brand-50/75 border-brand-300/90 hover:border-brand-400 hover:bg-brand-50'
          "
          :title="selectedAddress || 'Thêm địa chỉ để đặt lịch nhanh'"
          data-testid="dashboard-address"
        >
          <MapPin :size="16" :stroke-width="1.75" class="text-brand-600 shrink-0" />
          <span v-if="selectedAddress" class="min-w-0 truncate font-medium text-ink-900">{{ selectedAddress }}</span>
          <span v-else class="min-w-0 truncate font-semibold text-brand-700">Thêm địa chỉ</span>
          <ChevronRight
            :size="15"
            :stroke-width="1.75"
            class="text-ink-500 group-hover:text-brand-600 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-[color,transform] duration-150 ease-out shrink-0"
          />
        </router-link>
      </div>
    </section>

    <!-- Top workspace: hero search (+ active order or matching booking beside it when present) -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
      <!-- Active order or matching booking (top-first on mobile, paired in top-right on desktop) -->
      <Transition name="fh-fade-slide" mode="out-in">
        <section
          v-if="activeOrder"
          class="order-1 xl:order-2 xl:col-span-5 rounded-[var(--radius-lg)] bg-white border border-brand-200/90 p-5 flex flex-col justify-between gap-4 hover:border-brand-300 transition-[border-color] duration-150 ease-out"
          data-testid="dashboard-active-order"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-ink-100">
              <div class="flex items-center gap-2.5 min-w-0 flex-wrap">
                <span class="relative flex h-2.5 w-2.5 shrink-0">
                  <span class="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-600" />
                </span>
                <h2 class="text-sm font-semibold text-ink-900">
                  {{ String(activeOrder.status).toUpperCase() === 'EN_ROUTE' ? 'Kỹ thuật viên đang đến' : 'Đơn đang thực hiện' }}
                </h2>
                <span class="text-xs text-ink-500 font-num">#{{ activeOrder.code }}</span>
                <span
                  v-if="activeOrder.bookingMode === 'urgent'"
                  class="px-2 py-0.5 rounded-[var(--radius-sm)] bg-warning-50 text-warning-700 text-[11px] font-semibold whitespace-nowrap"
                >
                  Đặt lịch gấp
                </span>
              </div>
              <FhStatusPill :status="activeOrder.status" />
            </div>

            <div class="min-w-0 space-y-2">
              <p class="text-base font-semibold text-ink-900 text-pretty">{{ activeOrder.serviceName }}</p>

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-ink-600">
                <span v-if="activeOrder.scheduledAt" class="inline-flex items-center gap-1.5 font-num whitespace-nowrap">
                  <Calendar :size="14" :stroke-width="1.75" class="text-brand-600 shrink-0" />
                  {{ vnClock(activeOrder.scheduledAt) }} · {{ vnDateString(activeOrder.scheduledAt) }}
                </span>
                <span class="inline-flex items-center gap-1.5 min-w-0">
                  <MapPin :size="14" :stroke-width="1.75" class="text-ink-500 shrink-0" />
                  <span class="truncate" :title="activeOrder.addressSummary">{{ activeOrder.addressSummary }}</span>
                </span>
              </div>

              <div
                v-if="activeOrder.technician"
                class="pt-2 flex items-center justify-between gap-2.5 min-w-0"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-9 h-9 rounded-full overflow-hidden bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0">
                    <img
                      v-if="activeOrder.technician.avatarUrl"
                      :src="activeOrder.technician.avatarUrl"
                      :alt="activeOrder.technician.fullName"
                      class="w-full h-full object-cover"
                    />
                    <span v-else>{{ activeOrder.technician.fullName.charAt(0) }}</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs sm:text-sm font-medium text-ink-900 truncate">{{ activeOrder.technician.fullName }}</p>
                    <p class="text-xs text-ink-600 inline-flex items-center gap-1">
                      <template v-if="formatRating(activeOrder.technician.averageRating)">
                        <Star :size="13" :stroke-width="1.75" class="text-warning-500 fill-warning-500 shrink-0" aria-hidden="true" />
                        <span class="font-num font-medium">{{ formatRating(activeOrder.technician.averageRating) }}</span>
                      </template>
                      <template v-else>Chưa có đánh giá</template>
                    </p>
                  </div>
                </div>

                <a
                  v-if="activeOrder.technician.phoneNumber"
                  :href="`tel:${activeOrder.technician.phoneNumber}`"
                  class="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200/90 hover:border-brand-300 hover:bg-brand-50/60 active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,background-color,transform] duration-150 ease-out text-xs font-medium font-num text-ink-800 whitespace-nowrap shrink-0"
                  :title="`Gọi ${activeOrder.technician.phoneNumber}`"
                >
                  <Phone :size="14" :stroke-width="1.75" class="text-brand-600 shrink-0" />
                  <span>{{ activeOrder.technician.phoneNumber }}</span>
                </a>
              </div>
            </div>

            <!-- Compact progress stepper -->
            <ol class="grid grid-cols-4 gap-1.5 pt-2">
              <li v-for="(label, idx) in activeOrderProgressSteps" :key="label" class="space-y-1">
                <span
                  class="block h-1.5 rounded-full transition-colors duration-200"
                  :class="idx <= activeOrderStepIndex ? 'bg-brand-600' : 'bg-ink-100'"
                />
                <span
                  class="block text-[11px] truncate"
                  :class="idx <= activeOrderStepIndex ? 'font-semibold text-brand-700' : 'text-ink-600'"
                  :title="label"
                >
                  {{ label }}
                </span>
              </li>
            </ol>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-ink-100">
            <FhButton v-if="activeOrder.technician" variant="secondary" size="sm" @click="handleChatForOrder(activeOrder)">
              <MessageSquare :size="15" :stroke-width="1.75" />
              Nhắn tin
            </FhButton>
            <FhButton variant="primary" size="sm" class="pe-2.5" @click="router.push(`/app/orders/${activeOrder.id}`)">
              {{ String(activeOrder.status).toUpperCase() === 'EN_ROUTE' ? 'Theo dõi vị trí' : 'Xem tiến độ' }}
              <ChevronRight :size="15" :stroke-width="1.75" />
            </FhButton>
          </div>
        </section>

        <section
          v-else-if="pendingBooking"
          class="order-1 xl:order-2 xl:col-span-5 rounded-[var(--radius-lg)] bg-white border border-brand-200/90 p-5 flex flex-col justify-between gap-4 hover:border-brand-300 transition-[border-color] duration-150 ease-out"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-ink-100">
              <div class="flex items-center gap-2.5 min-w-0">
                <span v-if="isBookingMatching" class="relative flex h-2.5 w-2.5 shrink-0">
                  <span class="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-warning-400 opacity-75" />
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning-500" />
                </span>
                <Clock v-else :size="16" :stroke-width="1.75" class="text-brand-600 shrink-0" />
                <h2 class="text-sm font-semibold text-ink-900">Yêu cầu đặt lịch</h2>
              </div>
              <FhStatusPill :status="pendingBooking.status" domain="booking" />
            </div>

            <div class="space-y-2 min-w-0">
              <p class="text-base font-semibold text-ink-900 text-pretty">
                {{ pendingBooking.serviceName || 'Yêu cầu sửa chữa tại nhà' }}
              </p>
              <p v-if="pendingBooking.preferredAt" class="text-xs sm:text-sm text-ink-600 flex items-center gap-1.5 font-num">
                <Calendar :size="14" :stroke-width="1.75" class="text-brand-600 shrink-0" />
                <span>Lịch mong muốn: {{ vnClock(pendingBooking.preferredAt) }} · {{ vnDateString(pendingBooking.preferredAt) }}</span>
              </p>
              <p v-if="pendingBooking.addressSummary" class="text-xs sm:text-sm text-ink-600 flex items-start gap-1.5 min-w-0">
                <MapPin :size="14" :stroke-width="1.75" class="text-ink-500 shrink-0 mt-0.5" />
                <span class="truncate" :title="pendingBooking.addressSummary">{{ pendingBooking.addressSummary }}</span>
              </p>
              <p class="text-xs text-ink-600">
                Hệ thống đang kết nối kỹ thuật viên phù hợp theo lịch bạn đã chọn.
              </p>
            </div>

            <ol class="grid grid-cols-3 gap-1.5 pt-2">
              <li v-for="(label, idx) in bookingProgressSteps" :key="label" class="space-y-1">
                <span
                  class="block h-1.5 rounded-full transition-colors duration-200"
                  :class="idx <= pendingBookingStepIndex ? 'bg-brand-600' : 'bg-ink-100'"
                />
                <span
                  class="block text-[11px] truncate"
                  :class="idx <= pendingBookingStepIndex ? 'font-semibold text-brand-700' : 'text-ink-600'"
                  :title="label"
                >
                  {{ label }}
                </span>
              </li>
            </ol>
          </div>

          <div class="flex items-center justify-end gap-2 pt-3 border-t border-ink-100">
            <FhButton variant="primary" size="sm" class="pe-2.5" @click="router.push(`/app/bookings/${pendingBooking.id}`)">
              Xem yêu cầu
              <ChevronRight :size="15" :stroke-width="1.75" />
            </FhButton>
          </div>
        </section>
      </Transition>

      <!-- The one emphasis block of the page: search what needs fixing (solid brand-600 per PO 30/09/2026) -->
      <section
        :class="heroColClass"
        class="relative overflow-hidden rounded-[var(--radius-lg)] bg-brand-600 p-6 sm:p-7 text-white flex items-center"
      >
        <div
          class="w-full grid grid-cols-1 items-center gap-6"
          :class="hasTopCompanion ? 'md:grid-cols-[minmax(0,1fr)_auto]' : 'lg:grid-cols-12 lg:gap-8'"
        >
          <div class="min-w-0 space-y-4" :class="hasTopCompanion ? '' : 'lg:col-span-7 xl:col-span-6'">
            <div class="space-y-1.5">
              <p class="text-xs sm:text-sm font-medium text-white/90 flex items-center gap-1.5 min-w-0">
                <MapPin :size="14" :stroke-width="1.75" class="shrink-0 text-white/90" />
                <span class="truncate">{{ heroContextLine }}</span>
              </p>
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-balance">Cần sửa gì hôm nay?</h2>
            </div>

            <form class="w-full" role="search" @submit.prevent="handleSearch">
              <label for="dashboard-search" class="sr-only">Tìm dịch vụ sửa chữa</label>
              <div class="relative">
                <input
                  id="dashboard-search"
                  v-model="searchQuery"
                  type="text"
                  placeholder="Điện, nước, máy lạnh, thông cống, tivi…"
                  class="w-full h-13 pl-4 pr-14 rounded-[var(--radius-md)] bg-white text-ink-900 placeholder:text-ink-500 text-base outline-none focus-visible:ring-4 focus-visible:ring-white/40 shadow-xs"
                />
                <button
                  type="submit"
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-[var(--radius-sm)] bg-brand-600 hover:bg-brand-700 active:bg-brand-800 active:scale-[0.96] motion-reduce:active:scale-100 text-white flex items-center justify-center transition-[background-color,transform] duration-150 ease-out cursor-pointer"
                  title="Tìm kiếm dịch vụ"
                  aria-label="Tìm kiếm dịch vụ"
                >
                  <Search :size="18" :stroke-width="1.75" />
                </button>
              </div>
            </form>

            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="chip in quickChips"
                :key="chip.id"
                type="button"
                class="min-h-10 py-1.5 ps-3 pe-3.5 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 active:scale-[0.96] motion-reduce:active:scale-100 text-xs sm:text-sm text-white transition-[background-color,transform] duration-150 ease-out shrink-0 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                @click="handleChipClick(chip)"
              >
                <img
                  v-if="chip.image"
                  :src="chip.image"
                  alt=""
                  class="w-5 h-5 object-contain brightness-110 select-none pointer-events-none"
                  aria-hidden="true"
                />
                <component v-else :is="chip.icon" :size="15" :stroke-width="1.75" />
                {{ chip.title }}
              </button>
            </div>
          </div>

          <!-- Borderless highlights + full-size illustration when Hero spans 12 cols -->
          <div
            v-if="!hasTopCompanion"
            class="hidden md:flex lg:col-span-5 xl:col-span-6 items-center justify-end xl:justify-between gap-6"
          >
            <div class="hidden xl:block min-w-0 flex-1 space-y-2.5 pl-4">
              <p class="text-sm sm:text-base font-semibold text-white">Đặt lịch nhanh tại FixHome</p>
              <ul class="space-y-2">
                <li
                  v-for="item in heroHighlights"
                  :key="item"
                  class="flex items-start gap-2 text-xs sm:text-sm text-white/95"
                >
                  <CheckCircle2 :size="15" :stroke-width="1.75" class="text-white/90 shrink-0 mt-0.5" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>

            <div class="shrink-0 flex items-center justify-center w-48 lg:w-56 xl:w-64">
              <img
                :src="'/images/dashboard-hero.png'"
                alt="Dịch vụ sửa chữa tại nhà FixHome"
                class="w-full h-auto max-h-56 object-contain drop-shadow-md select-none pointer-events-none"
                loading="lazy"
              />
            </div>
          </div>

          <!-- Illustration when Hero sits beside activeOrder/pendingBooking -->
          <div v-else class="hidden md:flex shrink-0 items-center justify-center w-44 lg:w-52">
            <img
              :src="'/images/dashboard-hero.png'"
              alt="Dịch vụ sửa chữa tại nhà FixHome"
              class="w-full h-auto max-h-52 object-contain drop-shadow-md select-none pointer-events-none"
              loading="lazy"
            />
          </div>
        </div>
      </section>
    </div>

    <!-- Recent orders back in its original position directly below Hero -->
    <section
      v-if="loading"
      class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 space-y-4"
      aria-busy="true"
      aria-label="Đang tải đơn"
    >
      <FhSkeleton width="35%" height="22px" />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FhSkeleton height="84px" />
        <FhSkeleton height="84px" />
        <FhSkeleton height="84px" />
      </div>
    </section>

    <section
      v-else-if="ordersFailed"
      class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 flex flex-wrap items-center justify-between gap-3"
      data-testid="dashboard-orders-error"
    >
      <p class="text-sm text-ink-700">Chưa tải được đơn của bạn, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
    </section>

    <section
      v-else-if="orders.length > 0"
      v-scroll-up
      class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 overflow-hidden"
    >
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-ink-100">
        <div class="flex flex-wrap items-center gap-3 min-w-0">
          <h2 class="text-lg font-semibold text-ink-900">Đơn gần đây</h2>
          <dl class="flex flex-wrap items-center gap-2">
            <div
              v-for="stat in statTiles"
              :key="stat.label"
              class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              :class="
                stat.label === 'Đang xử lý' && stat.value > 0
                  ? 'bg-brand-50 border-brand-200/80 text-brand-700'
                  : 'bg-ink-50 border-ink-100 text-ink-600'
              "
            >
              <dt class="whitespace-nowrap">{{ stat.label }}</dt>
              <dd
                class="font-semibold font-num"
                :class="stat.label === 'Đang xử lý' && stat.value > 0 ? 'text-brand-800' : 'text-ink-900'"
              >
                {{ stat.value }}
              </dd>
            </div>
          </dl>
        </div>
        <router-link
          to="/app/orders"
          class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap pe-0.5 group"
        >
          Xem tất cả
          <ChevronRight
            :size="16"
            :stroke-width="1.75"
            class="group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-transform duration-150 ease-out"
          />
        </router-link>
      </div>

      <ul class="grid gap-3 p-4 sm:p-5" :class="recentOrdersGridClass">
        <li v-for="order in recentOrders" :key="order.id">
          <article
            class="h-full rounded-[var(--radius-md)] border border-ink-200/80 bg-white hover:bg-ink-50/50 hover:border-brand-200 transition-[background-color,border-color] duration-150 ease-out p-4 flex flex-col justify-between gap-3"
          >
            <router-link :to="`/app/orders/${order.id}`" class="flex items-start gap-3.5 min-w-0 group">
              <div
                class="w-14 h-14 rounded-[10px] bg-brand-50/70 border border-brand-100/80 flex items-center justify-center shrink-0 p-1.5 overflow-hidden"
              >
                <img
                  :src="getServiceArtworkUrl({ name: order.serviceName })"
                  :alt="order.serviceName"
                  class="w-full h-full object-contain select-none pointer-events-none group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform duration-150 ease-out"
                  loading="lazy"
                />
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-start justify-between gap-2.5">
                  <span
                    class="block text-sm sm:text-[15px] font-semibold text-ink-900 group-hover:text-brand-600 transition-colors duration-150 truncate"
                    :title="order.serviceName"
                  >
                    {{ order.serviceName }}
                  </span>
                  <FhStatusPill :status="order.status" class="shrink-0" />
                </div>

                <span class="block text-xs text-ink-500 font-num whitespace-nowrap truncate">
                  {{ order.code }}
                </span>

                <span class="flex items-center gap-1.5 text-xs text-ink-500 font-num whitespace-nowrap">
                  <Clock :size="13" :stroke-width="1.75" class="text-ink-400 shrink-0" />
                  <span>{{ vnDateString(order.createdAt) }}</span>
                </span>
              </div>
            </router-link>

            <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-ink-100/80 text-xs">
              <span v-if="Number(order.grandTotal) > 0" class="text-sm font-bold text-brand-600 font-num whitespace-nowrap">
                <FhMoney :amount="order.grandTotal" />
              </span>
              <span v-else class="text-ink-500 whitespace-nowrap">Chưa phát sinh chi phí</span>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="canReorder(order)"
                  type="button"
                  class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-ink-200/90 hover:border-brand-300 hover:text-brand-700 active:scale-[0.96] motion-reduce:active:scale-100 transition-[border-color,color,transform] duration-150 ease-out font-medium text-ink-700 whitespace-nowrap cursor-pointer"
                  @click="handleReorder(order)"
                >
                  <RotateCcw :size="12" :stroke-width="1.75" />
                  Đặt lại
                </button>
                <router-link
                  :to="`/app/orders/${order.id}`"
                  class="inline-flex items-center gap-0.5 font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap group"
                >
                  Chi tiết
                  <ChevronRight
                    :size="15"
                    :stroke-width="1.75"
                    class="text-brand-600 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-transform duration-150 ease-out shrink-0"
                  />
                </router-link>
              </div>
            </div>
          </article>
        </li>
      </ul>
    </section>

    <section
      v-else-if="orders.length === 0"
      v-scroll-up
      class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)_auto] items-center gap-5"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div class="w-16 h-16 shrink-0 flex items-center justify-center">
          <img
            :src="'/images/ui/home-hero-repair-family.png'"
            alt="Sửa chữa tại nhà FixHome"
            class="w-full h-full object-contain drop-shadow-sm select-none pointer-events-none"
            loading="lazy"
          />
        </div>
        <div class="space-y-1 min-w-0">
          <h2 class="text-base sm:text-lg font-bold text-ink-900 text-balance">Bắt đầu sửa chữa trong 3 bước</h2>
          <p class="text-xs sm:text-sm text-ink-600 leading-relaxed text-pretty">
            Quy trình gọn nhẹ từ lúc chọn sự cố đến khi nghiệm thu và bảo hành.
          </p>
        </div>
      </div>

      <ol class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <li
          v-for="item in onboardingSteps"
          :key="item.step"
          class="rounded-[var(--radius-md)] bg-ink-50/75 border border-ink-100/90 p-3 flex items-start gap-2.5"
        >
          <span class="w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold font-num flex items-center justify-center shrink-0 mt-0.5">
            {{ item.step }}
          </span>
          <div class="min-w-0">
            <p class="text-xs sm:text-sm font-semibold text-ink-900">{{ item.title }}</p>
            <p class="text-xs text-ink-600 mt-0.5 leading-relaxed">{{ item.desc }}</p>
          </div>
        </li>
      </ol>

      <div class="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-stretch gap-2 shrink-0">
        <FhButton
          variant="primary"
          size="md"
          class="pe-3"
          @click="router.push('/app/bookings/new')"
        >
          Đặt lịch sửa chữa
          <ChevronRight :size="16" :stroke-width="1.75" />
        </FhButton>
        <router-link to="/services" class="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center justify-center gap-1 whitespace-nowrap px-2 py-1">
          Xem bảng giá tham khảo <ChevronRight :size="14" :stroke-width="1.75" />
        </router-link>
      </div>
    </section>

    <!-- Services from the catalogue: 3-column grid across full width -->
    <section
      v-if="servicesLoading"
      class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 space-y-4"
      aria-busy="true"
      aria-label="Đang tải dịch vụ"
    >
      <FhSkeleton width="30%" height="22px" />
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <FhSkeleton height="44px" :count="3" />
        <FhSkeleton height="44px" :count="3" />
        <FhSkeleton height="44px" :count="3" class="hidden lg:block" />
      </div>
    </section>

    <section
      v-else-if="popularServices.length > 0"
      v-scroll-up
      class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 space-y-3"
    >
      <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-ink-100">
        <h2 class="text-lg font-semibold text-ink-900">Dịch vụ</h2>
        <router-link to="/services" class="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap pe-0.5 group">
          Bảng giá
          <ChevronRight
            :size="16"
            :stroke-width="1.75"
            class="group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-transform duration-150 ease-out"
          />
        </router-link>
      </div>

      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <li v-for="(srv, idx) in popularServices" :key="srv.id" v-scroll-up="idx * 35">
          <button
            type="button"
            class="w-full p-2.5 rounded-[var(--radius-md)] border border-ink-100/90 bg-white hover:border-brand-200 hover:bg-ink-50/75 active:scale-[0.98] active:bg-ink-100/70 motion-reduce:active:scale-100 transition-[border-color,background-color,transform] duration-150 ease-out flex items-center justify-between gap-3 text-left cursor-pointer group"
            @click="handleServiceClick(srv)"
          >
            <span class="flex h-13 w-13 shrink-0 items-center justify-center transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100">
              <img
                :src="getServiceArtworkUrl(srv)"
                alt=""
                loading="lazy"
                class="h-full w-full object-contain drop-shadow-2xs select-none pointer-events-none"
                aria-hidden="true"
              />
            </span>
            <div class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-ink-900 group-hover:text-brand-600 transition-colors duration-150 truncate" :title="srv.name">
                {{ srv.name }}
              </span>
              <span v-if="isFixedPrice(srv)" class="block text-xs font-medium text-brand-600 font-num whitespace-nowrap mt-0.5">
                <FhMoney :amount="srv.fixedPrice ?? 0" /><template v-if="srv.unit"> / {{ srv.unit }}</template>
              </span>
              <span v-else class="block text-xs text-ink-600 whitespace-nowrap mt-0.5">
                Báo giá sau khi kiểm tra
              </span>
            </div>
            <ChevronRight
              :size="16"
              :stroke-width="1.75"
              class="text-ink-500 group-hover:text-brand-600 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-[color,transform] duration-150 ease-out shrink-0"
            />
          </button>
        </li>
      </ul>
    </section>

    <!-- Secondary utility bento: vouchers, warranties & wallet -->
    <section class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch" aria-label="Tiện ích tài khoản">
      <!-- 1. Vouchers -->
      <article v-scroll-up="0" class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 flex flex-col justify-between gap-4">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-ink-100">
            <div class="flex items-center gap-2 min-w-0">
              <TicketPercent :size="18" :stroke-width="1.75" class="text-brand-600 shrink-0" />
              <h2 class="text-base font-semibold text-ink-900 truncate">Ưu đãi của bạn</h2>
            </div>
            <router-link to="/app/vouchers" class="text-xs sm:text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 whitespace-nowrap group">
              Xem tất cả
              <ChevronRight :size="15" :stroke-width="1.75" class="group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-transform duration-150 ease-out" />
            </router-link>
          </div>

          <div v-if="vouchersLoading" class="space-y-2.5" aria-busy="true" aria-label="Đang tải ưu đãi">
            <FhSkeleton height="54px" :count="2" />
          </div>

          <div v-else-if="vouchersFailed" class="space-y-2.5 py-2">
            <p class="text-xs sm:text-sm text-ink-600">Chưa tải được danh sách ưu đãi.</p>
            <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
          </div>

          <ul v-else-if="availableVouchers.length > 0" class="space-y-2">
            <li
              v-for="claim in availableVouchers.slice(0, 2)"
              :key="claim.id"
              class="rounded-[var(--radius-md)] bg-ink-50/75 border border-ink-100/90 px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="px-2 py-0.5 rounded-[var(--radius-sm)] bg-brand-50 text-brand-700 text-[11px] font-bold font-num shrink-0">
                    {{ claim.campaign.code }}
                  </span>
                  <span class="text-xs sm:text-sm font-semibold text-ink-900 truncate">{{ claim.campaign.name }}</span>
                </div>
                <p class="text-xs text-ink-600 mt-1 truncate">
                  {{ formatVoucherBenefit(claim.policySnapshot) }} · HSD {{ vnDateString(claim.campaign.endsAt) }}
                </p>
              </div>
              <div class="border-l border-dashed border-ink-200 pl-3 shrink-0">
                <router-link
                  to="/app/bookings/new"
                  class="inline-flex items-center justify-center h-8 px-2.5 rounded-[var(--radius-sm)] text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 active:scale-[0.96] motion-reduce:active:scale-100 transition-[background-color,color,transform] duration-150 ease-out whitespace-nowrap"
                >
                  Dùng ngay
                </router-link>
              </div>
            </li>
          </ul>

          <ul v-else-if="claimableGeneralVouchers.length > 0" class="space-y-2">
            <li
              v-for="offer in claimableGeneralVouchers.slice(0, 2)"
              :key="offer.id"
              class="rounded-[var(--radius-md)] bg-ink-50/75 border border-ink-100/90 px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="px-2 py-0.5 rounded-[var(--radius-sm)] bg-brand-50 text-brand-700 text-[11px] font-bold font-num shrink-0">
                    {{ offer.code }}
                  </span>
                  <span class="text-xs sm:text-sm font-semibold text-ink-900 truncate">{{ offer.name }}</span>
                </div>
                <p class="text-xs text-ink-600 mt-1 truncate">
                  {{ formatVoucherBenefit(offer.policy) }} · HSD {{ vnDateString(offer.endsAt) }}
                </p>
              </div>
              <div class="border-l border-dashed border-ink-200 pl-3 shrink-0">
                <FhButton
                  variant="secondary"
                  size="sm"
                  :disabled="claimingVoucherCode === offer.code"
                  @click="handleClaimVoucher(offer.code)"
                >
                  {{ claimingVoucherCode === offer.code ? 'Đang lưu…' : 'Lưu mã' }}
                </FhButton>
              </div>
            </li>
          </ul>

          <p v-else class="text-xs sm:text-sm text-ink-600 py-2">
            Chưa có mã ưu đãi khả dụng. Kiểm tra thêm tại mục Ưu đãi để không bỏ lỡ khuyến mãi mới.
          </p>
        </div>

        <div class="pt-2.5 border-t border-ink-100 flex items-center justify-between text-xs text-ink-600">
          <span>Có trong ví: <strong class="text-ink-900 font-num">{{ availableVouchers.length }}</strong> mã</span>
          <router-link to="/app/vouchers" class="font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap">
            Nhập mã ưu đãi
          </router-link>
        </div>
      </article>

      <!-- 2. Warranties & after-sales -->
      <article v-scroll-up="70" class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 flex flex-col justify-between gap-4">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-ink-100">
            <div class="flex items-center gap-2 min-w-0">
              <ShieldCheck :size="18" :stroke-width="1.75" class="text-brand-600 shrink-0" />
              <h2 class="text-base font-semibold text-ink-900 truncate">Bảo hành & Hậu mãi</h2>
            </div>
            <router-link to="/app/warranties" class="text-xs sm:text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 whitespace-nowrap group">
              Chi tiết
              <ChevronRight :size="15" :stroke-width="1.75" class="group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-transform duration-150 ease-out" />
            </router-link>
          </div>

          <div v-if="warrantyOrdersQuery.loading.value" class="space-y-2.5" aria-busy="true" aria-label="Đang tải bảo hành">
            <FhSkeleton height="44px" />
            <FhSkeleton height="44px" />
          </div>

          <div v-else-if="warrantyOrdersQuery.error.value" class="space-y-2.5 py-2">
            <p class="text-xs sm:text-sm text-ink-600">Chưa tải được thông tin bảo hành.</p>
            <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
          </div>

          <template v-else-if="featuredWarranties.length > 0">
            <div class="grid grid-cols-2 gap-2.5">
              <div class="rounded-xl bg-ink-50/75 border border-ink-100/80 px-3 py-2 text-center">
                <p class="text-xs text-ink-500 whitespace-nowrap">Đơn còn hạn</p>
                <p class="text-base sm:text-lg font-semibold text-ink-900 font-num mt-0.5">{{ activeWarrantyCount }}</p>
              </div>
              <div class="rounded-xl bg-ink-50/75 border border-ink-100/80 px-3 py-2 text-center">
                <p class="text-xs text-ink-500 whitespace-nowrap">Yêu cầu đang mở</p>
                <p class="text-base sm:text-lg font-semibold text-ink-900 font-num mt-0.5">{{ openWarrantyClaimsCount }}</p>
              </div>
            </div>

            <ul class="space-y-2">
              <li
                v-for="group in featuredWarranties"
                :key="group.orderId"
                class="rounded-[var(--radius-md)] bg-ink-50/75 border border-ink-100/90 px-3 py-2 flex items-center justify-between gap-2.5"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-xs sm:text-sm font-semibold text-ink-900 truncate">{{ group.serviceName }}</p>
                  <p class="text-xs text-ink-600 font-num truncate mt-0.5">
                    {{ group.orderCode }} · Hạn {{ vnDateString(group.maxExpiresAt) }}
                  </p>
                </div>
                <span
                  v-if="getLatestOpenClaim(group)"
                  class="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0"
                  :class="warrantyClaimToneClasses[claimDisplayMeta(getLatestOpenClaim(group)!).tone]"
                >
                  {{ claimDisplayMeta(getLatestOpenClaim(group)!).label }}
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0"
                  :class="group.hasActiveCoverage ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-600'"
                >
                  {{ group.hasActiveCoverage ? 'Còn bảo hành' : 'Hết hạn' }}
                </span>
              </li>
            </ul>
          </template>

          <p v-else class="text-xs sm:text-sm text-ink-600 py-2">
            Các đơn sửa chữa hoàn thành có thời hạn bảo hành sẽ hiển thị tại đây để bạn tiện theo dõi.
          </p>
        </div>

        <div class="pt-2.5 border-t border-ink-100 flex items-center justify-between text-xs text-ink-600">
          <span>{{ featuredWarranties.length > 0 ? 'Yêu cầu hỗ trợ khi phát sinh sự cố' : 'Quản lý phiếu bảo hành' }}</span>
          <router-link to="/app/warranties" class="font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap">
            Xem bảo hành
          </router-link>
        </div>
      </article>

      <!-- 3. Customer wallet -->
      <article v-scroll-up="140" class="rounded-[var(--radius-lg)] bg-white border border-ink-200/90 p-5 md:col-span-2 xl:col-span-1 flex flex-col justify-between gap-4">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-ink-100">
            <div class="flex items-center gap-2 min-w-0">
              <Wallet :size="18" :stroke-width="1.75" class="text-brand-600 shrink-0" />
              <h2 class="text-base font-semibold text-ink-900 truncate">Ví FixHome</h2>
            </div>
            <router-link to="/app/wallet" class="text-xs sm:text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 whitespace-nowrap group">
              Quản lý ví
              <ChevronRight :size="15" :stroke-width="1.75" class="group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 transition-transform duration-150 ease-out" />
            </router-link>
          </div>

          <div v-if="walletQuery.loading.value" class="space-y-2.5" aria-busy="true" aria-label="Đang tải ví">
            <FhSkeleton width="55%" height="28px" />
            <FhSkeleton height="40px" :count="2" />
          </div>

          <div v-else-if="walletQuery.error.value" class="space-y-2.5 py-2">
            <p class="text-xs sm:text-sm text-ink-600">Chưa tải được thông tin ví.</p>
            <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
          </div>

          <div
            v-else-if="walletSummary"
            class="space-y-3 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 xl:block xl:space-y-3"
          >
            <div class="rounded-[var(--radius-md)] bg-ink-50/75 border border-ink-100/90 px-3.5 py-3 flex items-center justify-between gap-3">
              <span class="text-xs sm:text-sm text-ink-600">Số dư khả dụng</span>
              <span class="text-lg sm:text-xl font-bold text-ink-900 font-num">
                <FhMoney :amount="walletSummary.balance" />
              </span>
            </div>

            <ul v-if="recentWalletTxs.length > 0" class="space-y-2">
              <li
                v-for="tx in recentWalletTxs"
                :key="tx.id"
                class="flex items-center justify-between gap-3 px-1 py-1 text-xs sm:text-sm"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span
                    class="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    :class="isIncomingWalletTransaction(tx) ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-600'"
                  >
                    <ArrowDownLeft v-if="isIncomingWalletTransaction(tx)" :size="13" :stroke-width="1.75" />
                    <ArrowUpRight v-else :size="13" :stroke-width="1.75" />
                  </span>
                  <div class="min-w-0">
                    <p class="font-medium text-ink-900 truncate">{{ customerWalletTypeLabels[tx.type] }}</p>
                    <p class="text-xs text-ink-600 font-num">{{ vnDateString(tx.createdAt) }}</p>
                  </div>
                </div>
                <span
                  class="font-semibold font-num whitespace-nowrap shrink-0"
                  :class="isIncomingWalletTransaction(tx) ? 'text-success-700' : 'text-ink-900'"
                >
                  {{ isIncomingWalletTransaction(tx) ? '+' : '-' }}<FhMoney :amount="tx.amount" />
                </span>
              </li>
            </ul>

            <p v-else class="text-xs sm:text-sm text-ink-600 py-1">
              Chưa có giao dịch ví gần đây. Tiền hoàn và thanh toán đơn sẽ ghi nhận tại đây.
            </p>
          </div>

          <p v-else class="text-xs sm:text-sm text-ink-600 py-2">
            Theo dõi số dư, tiền hoàn từ đơn hủy và lịch sử giao dịch ngay trong Ví FixHome.
          </p>
        </div>

        <div class="pt-2.5 border-t border-ink-100 flex items-center justify-between text-xs text-ink-600">
          <span>Thanh toán nhanh & nhận hoàn tiền</span>
          <router-link to="/app/wallet" class="font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap">
            Mở ví
          </router-link>
        </div>
      </article>
    </section>

    <!-- What FixHome promises, calmed strip -->
    <section v-scroll-up class="rounded-[var(--radius-lg)] bg-ink-25 border border-ink-200/80 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-ink-100">
      <div v-for="promise in promises" :key="promise.title" class="p-3.5 sm:px-5 sm:py-4 flex items-start gap-3">
        <div class="w-8 h-8 rounded-[var(--radius-sm)] bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
          <component :is="promise.icon" :size="18" :stroke-width="1.75" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-ink-900">{{ promise.title }}</p>
          <p class="text-xs text-ink-600 mt-0.5">{{ promise.desc }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Progressive scroll-up reveal: defaults remain visible when JS/IntersectionObserver is unavailable. */
.fh-scroll-up[data-scroll-up='hidden'] {
  opacity: 0;
  transform: translate3d(0, 14px, 0);
  will-change: opacity, transform;
}

.fh-scroll-up[data-scroll-up='visible'] {
  opacity: 1;
  transform: translate3d(0, 0, 0);
  transition-property: opacity, transform;
  transition-duration: 320ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.fh-scroll-up[data-scroll-up='done'] {
  opacity: 1;
  transform: none;
  will-change: auto;
}

@media (prefers-reduced-motion: reduce) {
  .fh-scroll-up[data-scroll-up='hidden'],
  .fh-scroll-up[data-scroll-up='visible'] {
    transform: none !important;
    transition-property: opacity;
    transition-duration: 180ms;
    transition-timing-function: ease-out;
  }
}
</style>
