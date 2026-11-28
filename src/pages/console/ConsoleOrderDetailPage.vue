<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  User,
  Phone,
  PhoneCall,
  MapPin,
  Wrench,
  ShieldCheck,
  Calendar,
  FileText,
  Receipt,
  Tag,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Headphones,
  ReceiptText,
  Package,
  MessageSquare,
  ZoomIn,
  Star,
  AlertTriangle,
} from 'lucide-vue-next';
import { extractConsoleOrderDetails } from '../../components/console/console-order-fields';
import {
  FhSkeleton,
  FhStatusPill,
  FhMoney,
  FhTimeline,
  FhButton,
  BookingMediaViewer,
  type TimelineStep,
} from '../../components';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import GroupStopIncidentsPanel from '../../components/console/GroupStopIncidentsPanel.vue';
import StoppedWorkFinancePanel from '../../components/console/StoppedWorkFinancePanel.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { orderStatusLabel, paymentStatusLabel, roleLabel } from '../../components/console/console-labels';
import { consoleOrderContextApi, type ConsoleOrderContext } from '../../api/console-order-context.api';
import { bookingsApi, isFullBookingWithMedia, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { catalogApi, type ServiceCategory } from '../../api/catalog.api';
import { supportCasesApi, type SupportCaseSummary } from '../../api/support-cases.api';
import { supportCaseStatusLabels, supportCaseTypeLabels } from './support-cases.utils';
import { categoryIcon } from '../../components/booking/service-icons';
import { useAuthStore } from '../../stores/auth';
import { vnDateTimeString } from '../../utils/vn-time';
import { ordersApi, type AdditionalCostRecord } from '../../api/orders.api';
import { consoleTextarea } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import { useLiveOrderRefresh } from '../../composables/useLiveOrderRefresh';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');
const isStaffMediaViewerAllowed = computed(() => ['ADMIN', 'SERVICE_MANAGER'].includes(String(authStore.userRole ?? '').toUpperCase()));
const isAdminOrSm = computed(() => ['ADMIN', 'SERVICE_MANAGER'].includes(String(authStore.userRole ?? '').toUpperCase()));

let orderId = String(route.params.id ?? '');
let loadGeneration = 0;
let disposed = false;

const loading = ref(true);
const loadError = ref(false);
const order = ref<ConsoleOrderContext | null>(null);
const bookingForMedia = ref<(BookingItem & { media: BookingMedia[] }) | null>(null);
const bookingMedia = computed(() => bookingForMedia.value?.media ?? []);
const bookingMediaBookingId = computed(() => bookingForMedia.value?.id ?? '');
const categories = ref<ServiceCategory[]>([]);
const isQuotationCollapsed = ref(false);
const selectedFallbackImage = ref<string | null>(null);
const orderSupportCases = ref<SupportCaseSummary[]>([]);
const orderAdditionalCosts = ref<AdditionalCostRecord[]>([]);
const openSupportCasesCount = computed(
  () => orderSupportCases.value.filter((item) => item.status === 'open' || item.status === 'in_review').length,
);

const additionalCostStatusLabels: Record<AdditionalCostRecord['status'], string> = {
  PENDING_APPROVAL: 'Chờ khách duyệt',
  APPROVED: 'Khách đã duyệt',
  REJECTED: 'Khách từ chối',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã huỷ',
};

function supportCaseTitle(item: SupportCaseSummary): string {
  return item.requestIntent === 'stop_or_replace'
    ? 'Khách yêu cầu dừng sửa / Đổi thợ'
    : (supportCaseTypeLabels[item.caseType] || 'Yêu cầu hỗ trợ');
}

const loadOrder = async (requestedOrderId = orderId, quiet = false) => {
  const generation = ++loadGeneration;
  const requestedRole = String(authStore.userRole ?? '').toUpperCase();
  const isCurrent = () => !disposed
    && generation === loadGeneration
    && requestedOrderId === orderId
    && requestedRole === String(authStore.userRole ?? '').toUpperCase();
  if (!quiet) loading.value = true;
  if (!quiet) {
    loadError.value = false;
    bookingForMedia.value = null;
    orderSupportCases.value = [];
    orderAdditionalCosts.value = [];
  }
  try {
    const nextOrder = await consoleOrderContextApi.getConsoleOrderContext(requestedOrderId);
    if (!isCurrent()) return;
    order.value = nextOrder;

    const bookingId = typeof nextOrder.bookingId === 'string' ? nextOrder.bookingId.trim() : '';
    const canReadSupport = isAdminOrSm.value
      && typeof authStore.hasPermission === 'function'
      && authStore.hasPermission('support:read_all')
      && typeof supportCasesApi?.listCases === 'function';
    const canReadAdditionalCosts = isAdminOrSm.value
      && typeof ordersApi?.getAdditionalCosts === 'function';

    if (canReadSupport) {
      void supportCasesApi.listCases({
        serviceOrderId: requestedOrderId,
        limit: 20,
        sort: 'priority',
      }).then((result) => {
        if (isCurrent() && Array.isArray(result?.data)) {
          orderSupportCases.value = result.data;
        }
      }).catch(() => {
        if (isCurrent() && !quiet) orderSupportCases.value = [];
      });
    }

    if (canReadAdditionalCosts) {
      void ordersApi.getAdditionalCosts(requestedOrderId).then((costs) => {
        if (isCurrent() && Array.isArray(costs)) {
          orderAdditionalCosts.value = costs;
        }
      }).catch(() => {
        if (isCurrent() && !quiet) orderAdditionalCosts.value = [];
      });
    }

    if (isStaffMediaViewerAllowed.value && bookingId) {
      try {
        const booking = await bookingsApi.getBooking(bookingId);
        if (isCurrent() && isFullBookingWithMedia(booking, bookingId)) {
          bookingForMedia.value = booking;
        }
      } catch {
        if (isCurrent()) bookingForMedia.value = null;
      }
    }
  } catch {
    // A failed background read keeps the order on screen.
    if (!isCurrent() || quiet) return;
    order.value = null;
    loadError.value = true;
  } finally {
    if (isCurrent()) loading.value = false;
  }
};

const loadCatalogCategories = async () => {
  try {
    categories.value = await catalogApi.getCategories(false);
  } catch {
    categories.value = [];
  }
};

onMounted(() => {
  disposed = false;
  void loadOrder();
  void loadCatalogCategories();
});

watch(() => String(route.params.id ?? ''), (nextId, previousId) => {
  if (!nextId || nextId === previousId) return;
  orderId = nextId;
  bookingForMedia.value = null;
  void loadOrder(nextId);
});

watch(() => String(authStore.userRole ?? '').toUpperCase(), (nextRole, previousRole) => {
  if (nextRole === previousRole) return;
  bookingForMedia.value = null;
  void loadOrder(orderId);
});

// Status, quotation, extra costs, parts, cash or warranty moved on: read the order again in place.
useLiveOrderRefresh(
  ['order', 'status', 'invoice', 'quotation', 'additional_cost', 'cash', 'part', 'warranty', 'assignment', 'evidence', 'arrival'],
  () => { if (order.value && !loading.value) void loadOrder(orderId, true); },
  () => orderId,
);

onUnmounted(() => {
  disposed = true;
  loadGeneration += 1;
  bookingForMedia.value = null;
});

// Cancellation handling
const canCancel = computed(() => isServiceManager.value
  && ['accepted', 'en_route'].includes(String(order.value?.status ?? '').toLowerCase()));
const cancelOpen = ref(false);
const cancelReason = ref('');
const cancelBusy = ref(false);
const cancelError = ref('');
const cancelDone = ref('');

function openCancel() {
  cancelReason.value = '';
  cancelError.value = '';
  cancelOpen.value = true;
}

async function submitCancel() {
  if (cancelBusy.value || !order.value) return;
  const reason = cancelReason.value.trim();
  if (!reason || reason.length > 2000) {
    cancelError.value = reason.length > 2000 ? 'Lý do không được vượt quá 2.000 ký tự.' : 'Vui lòng nhập lý do huỷ đơn.';
    return;
  }
  cancelBusy.value = true;
  cancelError.value = '';
  try {
    await ordersApi.cancelOrder(order.value.id, reason);
    cancelOpen.value = false;
    cancelDone.value = 'Đã huỷ đơn. Khách hàng và kỹ thuật viên đã được báo.';
    await loadOrder(order.value.id);
  } catch (reasonError) {
    cancelError.value = userFacingError(reasonError, 'Chưa huỷ được đơn. Đơn có thể đã đổi trạng thái, hãy tải lại trang.');
  } finally {
    cancelBusy.value = false;
  }
}

// Payment tone
const paymentTone = computed(() => {
  const status = String(order.value?.paymentStatus ?? '').toUpperCase();
  return status === 'PAID' ? 'COMPLETED' : status === 'REFUNDED' ? 'CANCELLED' : 'PENDING';
});

// Timeline handling
function safeTimelineNote(title: string, status: string): string | undefined {
  const note = title.trim().replace(/\s+/gu, ' ');
  if (!note || note.length > 160) return undefined;
  if (note.toLocaleLowerCase('vi') === orderStatusLabel(status).toLocaleLowerCase('vi')) return undefined;
  if (!/[À-ỹĐđ]/u.test(note)) return undefined;
  if (/\b(?:work|completed|payment|verified|technician|internal|failed|error|system|status)\b/i.test(note)) {
    return undefined;
  }
  if (
    /@|https?:\/\/|www\.|(?:^|[^\p{L}\p{N}_])(?:sđt|điện thoại|email|cccd|căn cước|địa chỉ|số nhà|đường|phường|quận|huyện|tỉnh|thành phố|căn hộ)(?=$|[^\p{L}\p{N}_])|\d(?:[\s().-]*\d){7,}/iu.test(note)
    || /(?:[\p{Ll}\p{M}]\s+\p{Lu}\p{Ll}{1,}|^\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+)/u.test(note)
  ) {
    return undefined;
  }
  return note;
}

const timelineEntries = computed(() => order.value?.timeline ?? []);

const timelineSteps = computed<TimelineStep[]>(() => {
  const entries = timelineEntries.value;
  return entries.map((entry, index) => ({
    key: `${entry.status}-${index}`,
    label: orderStatusLabel(entry.status),
    note: safeTimelineNote(entry.title, entry.status),
    timestamp: entry.timestamp ? vnDateTimeString(entry.timestamp) : undefined,
    actor: entry.actor ? roleLabel(entry.actor) : undefined,
    completed: index < entries.length - 1,
    current: index === entries.length - 1,
  }));
});

// Normalized display details from helper
const details = computed(() => extractConsoleOrderDetails(order.value, bookingForMedia.value));
const artworkError = ref(false);
const serviceArtworkUrl = computed(() => details.value.artworkUrl);

// Category resolution
const categoryName = computed(() => {
  if (order.value?.categoryName) return order.value.categoryName;
  const targetServiceName = (details.value.serviceTitle).trim().toLowerCase();
  const targetServiceId = bookingForMedia.value?.serviceId;
  for (const cat of categories.value) {
    if (targetServiceId && cat.services?.some((s) => s.id === targetServiceId)) {
      return cat.name;
    }
    if (targetServiceName && cat.services?.some((s) => s.name.trim().toLowerCase() === targetServiceName)) {
      return cat.name;
    }
  }
  if (/điều hòa|máy lạnh|tủ lạnh|máy giặt|bình nóng lạnh|máy sấy|máy rửa chén/i.test(targetServiceName)) return 'Điện lạnh';
  if (/nước|vòi|bơm|siphon|lavabo|ống/i.test(targetServiceName)) return 'Điện nước';
  if (/điện|công tắc|ổ cắm|đèn|quạt/i.test(targetServiceName)) return 'Điện gia dụng';
  if (/khóa/i.test(targetServiceName)) return 'Khóa thông minh';
  return 'Điện lạnh';
});

const categoryIconComponent = computed(() => categoryIcon({ name: details.value.serviceTitle }));

const pricingModeLabel = computed(() => {
  const mode = String(order.value?.pricingMode || bookingForMedia.value?.pricingModeSnapshot || '').toUpperCase();
  if (mode === 'INSPECTION_REQUIRED') return 'Cần khảo sát';
  if (mode === 'FIXED_PRICE') return 'Giá cố định';
  return 'Cần khảo sát';
});

// Quotation details
const quotation = computed(() => order.value?.quotation ?? null);
const quotationItems = computed(() => {
  if (quotation.value?.items && quotation.value.items.length > 0) {
    return quotation.value.items;
  }
  if (order.value && order.value.laborTotal > 0) {
    return [
      {
        id: 'labor-default',
        type: 'LABOR' as const,
        description: 'Công kiểm tra và sửa chữa',
        quantity: 1,
        unitPrice: order.value.laborTotal,
        lineTotal: order.value.laborTotal,
      },
      ...(order.value.partsTotal > 0
        ? [{
            id: 'parts-default',
            type: 'PARTS' as const,
            description: 'Linh kiện thay thế',
            quantity: 1,
            unitPrice: order.value.partsTotal,
            lineTotal: order.value.partsTotal,
          }]
        : []),
    ];
  }
  return [];
});

const fallbackMedia = computed(() => order.value?.bookingMedia ?? []);
const totalMediaCount = computed(() => bookingMedia.value.length || fallbackMedia.value.length);

function scrollToAudit() {
  const el = document.getElementById('staff-finance-audit-panel');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  } else {
    router.push({ path: '/console/support', query: { serviceOrderId: order.value?.id } });
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5 pb-16">
    <!-- Skeleton Loading -->
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <FhSkeleton height="16px" width="160px" />
      <FhSkeleton height="32px" width="340px" />
      <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div class="space-y-3 rounded-2xl border border-ink-100 bg-white p-5 shadow-xs">
          <FhSkeleton height="20px" width="140px" />
          <FhSkeleton height="16px" :count="3" />
        </div>
        <div class="space-y-3 rounded-2xl border border-ink-100 bg-white p-5 shadow-xs">
          <FhSkeleton height="20px" width="140px" />
          <FhSkeleton height="16px" :count="3" />
        </div>
        <div class="space-y-3 rounded-2xl border border-ink-100 bg-white p-5 shadow-xs">
          <FhSkeleton height="20px" width="140px" />
          <FhSkeleton height="16px" :count="3" />
        </div>
      </div>
      <div class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-xs lg:col-span-2">
          <FhSkeleton height="24px" width="220px" />
          <FhSkeleton height="16px" :count="6" />
        </div>
        <div class="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-xs">
          <FhSkeleton height="24px" width="140px" />
          <FhSkeleton height="16px" :count="4" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <template v-else-if="loadError">
      <div class="space-y-3">
        <button
          type="button"
          class="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors"
          @click="router.push('/console/orders')"
        >
          <ChevronLeft :size="16" aria-hidden="true" />
          <span>Danh sách đơn sửa chữa</span>
        </button>
        <h1 class="text-2xl font-bold text-ink-900">Chi tiết đơn sửa chữa</h1>
      </div>
      <ConsoleLoadError @retry="() => loadOrder()" />
    </template>

    <!-- Order Detail View -->
    <template v-else-if="order">
      <!-- Section A: Header đơn hàng -->
      <header class="space-y-2.5">
        <!-- Back Link -->
        <button
          type="button"
          class="group inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-ink-500 hover:text-ink-900 transition-colors"
          @click="router.push('/console/orders')"
        >
          <ChevronLeft :size="15" class="transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          <span>Danh sách đơn sửa chữa</span>
        </button>

        <!-- Main Title & Badges & Top Actions -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <!-- Left: Code & Badges -->
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-heading text-2xl sm:text-3xl font-extrabold text-ink-950 tracking-tight">
              {{ order.code }}
            </h1>

            <div class="flex items-center gap-2">
              <FhStatusPill :status="order.status" class="whitespace-nowrap" />
              <FhStatusPill :status="paymentTone" :label="paymentStatusLabel(order.paymentStatus)" class="whitespace-nowrap" />
            </div>
          </div>

          <!-- Right Actions (Available for SM and Admin) -->
          <div v-if="isAdminOrSm" class="flex items-center gap-2.5">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-brand-700 shadow-xs transition-colors hover:bg-brand-50 hover:text-brand-800"
              @click="router.push({ path: '/console/support', query: { serviceOrderId: order.id } })"
            >
              <Headphones :size="16" aria-hidden="true" />
              <span>Yêu cầu hỗ trợ</span>
              <span
                v-if="openSupportCasesCount > 0"
                class="inline-flex min-w-5 items-center justify-center rounded-full bg-danger-50 border border-danger-200 px-1.5 py-0.5 font-num text-[11px] font-bold text-danger-700"
              >
                {{ openSupportCasesCount }}
              </span>
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900"
              @click="scrollToAudit"
            >
              <ReceiptText :size="16" aria-hidden="true" />
              <span>Đối soát</span>
            </button>

            <ConsoleMoreMenu>
              <ConsoleMenuItem @click="router.push({ path: '/console/support', query: { serviceOrderId: order.id } })">
                Mở yêu cầu hỗ trợ
              </ConsoleMenuItem>
              <ConsoleMenuItem @click="router.push('/console/cancellations')">
                Xem huỷ đơn
              </ConsoleMenuItem>
              <ConsoleMenuItem v-if="canCancel" danger data-testid="order-cancel-open" @click="openCancel">
                Huỷ đơn
              </ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </div>

        <!-- Subheader: Creation time, update time & support link -->
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <div class="flex flex-wrap items-center gap-2">
            <span>Đơn sửa chữa</span>
            <span>•</span>
            <span>Tạo lúc: <strong class="font-num font-medium text-ink-700">{{ order.createdAt ? vnDateTimeString(order.createdAt) : '—' }}</strong></span>
            <span>•</span>
            <span>Cập nhật: <strong class="font-num font-medium text-ink-700">{{ order.updatedAt ? vnDateTimeString(order.updatedAt) : '—' }}</strong></span>
          </div>

          <router-link
            :to="{ path: '/console/support', query: { serviceOrderId: order.id } }"
            class="font-medium text-brand-700 hover:text-brand-800 underline transition-colors"
            data-testid="order-support-link"
          >
            Yêu cầu hỗ trợ của đơn này
          </router-link>
        </div>

        <Transition name="fh-fade-slide">
          <p
            v-if="cancelDone"
            role="status"
            class="rounded-xl border border-success-200 bg-success-50 px-4 py-2.5 text-sm text-success-800"
          >
            {{ cancelDone }}
          </p>
        </Transition>
      </header>

      <!-- Section B: Top Row - 3 CARDS IN 3 COLUMNS (Khách hàng, Kỹ thuật viên, Lịch hẹn) -->
      <section aria-label="Thông tin đối tác và lịch hẹn" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <!-- Card 1: Khách hàng -->
        <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div class="flex items-center gap-2 text-ink-900 font-semibold text-sm mb-3.5">
            <User :size="16" class="text-brand-600" aria-hidden="true" />
            <span>Khách hàng</span>
          </div>

          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <!-- Avatar -->
              <div class="relative shrink-0">
                <img
                  v-if="details.customerPhoto"
                  :src="details.customerPhoto"
                  alt="Avatar khách hàng"
                  class="h-12 w-12 rounded-full object-cover border border-ink-200"
                />
                <div
                  v-else
                  class="flex h-12 w-12 items-center justify-center rounded-full border border-brand-200/70 bg-brand-50 font-bold text-brand-700 text-sm"
                >
                  {{ details.customerLetters }}
                </div>
              </div>

              <!-- Name, Badge, Phone, Address -->
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-bold text-ink-900 text-sm sm:text-base leading-tight truncate">
                    {{ details.customerTitle }}
                  </h4>
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                    Khách hàng
                  </span>
                </div>

                <p class="font-num text-xs sm:text-sm text-ink-800 font-semibold flex items-center gap-1.5">
                  <Phone :size="13" class="text-ink-400 shrink-0" aria-hidden="true" />
                  <span>{{ details.customerContact }}</span>
                </p>

                <p class="text-xs text-ink-500 flex items-start gap-1.5 leading-snug pt-0.5">
                  <MapPin :size="13" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span class="line-clamp-2">{{ details.destinationAddress }}</span>
                </p>
              </div>
            </div>

            <!-- Call Button -->
            <a
              v-if="details.hasContact"
              :href="`tel:${details.customerContact}`"
              class="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-blue-100 hover:text-brand-800"
              aria-label="Gọi cho khách hàng"
            >
              <PhoneCall :size="12" aria-hidden="true" />
              <span>Gọi</span>
            </a>
          </div>
        </div>

        <!-- Card 2: Kỹ thuật viên -->
        <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div class="flex items-center gap-2 text-ink-900 font-semibold text-sm mb-3.5">
            <Wrench :size="16" class="text-brand-600" aria-hidden="true" />
            <span>Kỹ thuật viên</span>
          </div>

          <!-- When technician is assigned -->
          <div v-if="details.assignedTechnician" class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <!-- Avatar -->
              <div class="relative shrink-0">
                <img
                  v-if="details.assignedTechnician.avatarUrl"
                  :src="details.assignedTechnician.avatarUrl"
                  alt="Avatar kỹ thuật viên"
                  class="h-12 w-12 rounded-full object-cover border border-ink-200"
                />
                <div
                  v-else
                  class="flex h-12 w-12 items-center justify-center rounded-full border border-ink-200 bg-ink-100 font-bold text-ink-700 text-sm"
                >
                  {{ details.technicianLetters }}
                </div>
              </div>

              <!-- Name, Badges, Phone, Rating -->
              <div class="min-w-0 space-y-1">
                <h4 class="font-bold text-ink-900 text-sm sm:text-base leading-tight truncate">
                  {{ details.assignedTechnician.fullName }}
                </h4>

                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                    Kỹ thuật viên
                  </span>
                  <span class="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                    <ShieldCheck :size="11" aria-hidden="true" />
                    <span>{{ details.technicianVerificationText }}</span>
                  </span>
                </div>

                <p class="font-num text-xs sm:text-sm text-ink-800 font-semibold flex items-center gap-1.5">
                  <Phone :size="13" class="text-ink-400 shrink-0" aria-hidden="true" />
                  <span>{{ details.assignedTechnician.phoneNumber || 'Chưa có SĐT' }}</span>
                </p>

                <!-- Show real rating only when available from backend -->
                <p v-if="details.technicianScore != null" class="font-num text-xs text-ink-600 flex items-center gap-1 pt-0.5">
                  <Star :size="12" class="fill-amber-400 text-amber-500" aria-hidden="true" />
                  <span class="font-semibold text-ink-900">{{ details.technicianScore }}</span>
                </p>
              </div>
            </div>

            <!-- Call Button -->
            <a
              v-if="details.assignedTechnician.phoneNumber"
              :href="`tel:${details.assignedTechnician.phoneNumber}`"
              class="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-blue-100 hover:text-brand-800"
              aria-label="Gọi cho kỹ thuật viên"
            >
              <PhoneCall :size="12" aria-hidden="true" />
              <span>Gọi</span>
            </a>
          </div>

          <!-- When technician is NOT assigned -->
          <div v-else class="flex flex-col items-center justify-center py-2 text-center space-y-1">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-400">
              <User :size="18" aria-hidden="true" />
            </div>
            <p class="text-xs font-semibold text-ink-800">Chưa phân công kỹ thuật viên</p>
            <p class="text-[11px] text-ink-500">Đang trong quá trình điều phối thợ</p>
          </div>
        </div>

        <!-- Card 3: Lịch hẹn -->
        <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div class="flex items-center gap-2 text-ink-900 font-semibold text-sm mb-3.5">
            <Calendar :size="16" class="text-brand-600" aria-hidden="true" />
            <span>Lịch hẹn</span>
          </div>

          <dl class="space-y-2 text-xs sm:text-sm">
            <div class="flex items-center justify-between gap-2">
              <dt class="text-ink-500">Hẹn</dt>
              <dd class="whitespace-nowrap font-num font-semibold text-ink-900">
                {{ order.scheduledAt ? vnDateTimeString(order.scheduledAt) : 'Chưa xếp lịch' }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-ink-500">Tạo lúc</dt>
              <dd class="whitespace-nowrap font-num text-ink-800 font-medium">
                {{ order.createdAt ? vnDateTimeString(order.createdAt) : '—' }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-ink-500">Cập nhật</dt>
              <dd class="whitespace-nowrap font-num text-ink-800 font-medium">
                {{ order.updatedAt ? vnDateTimeString(order.updatedAt) : '—' }}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <!-- Cancel Dialog Modal -->
      <Transition name="fh-modal">
        <div
          v-if="cancelOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 p-4"
          @click.self="cancelBusy || (cancelOpen = false)"
          @keydown.esc="cancelBusy || (cancelOpen = false)"
        >
          <section
            class="fh-modal-panel w-full max-w-lg space-y-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-(--shadow-e3) sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-cancel-title"
            data-testid="order-cancel-dialog"
          >
            <h2 id="order-cancel-title" class="text-base font-semibold text-ink-900">Huỷ đơn {{ order.code }}</h2>
            <p class="text-sm text-ink-600">Đơn sẽ kết thúc, kỹ thuật viên rời đơn. Huỷ bởi quản lý không trừ điểm uy tín của khách hay thợ.</p>
            <label class="flex flex-col gap-1.5 text-sm font-medium text-ink-700">Lý do huỷ (10–2.000 ký tự)
              <textarea v-model="cancelReason" rows="3" maxlength="2000" :class="consoleTextarea" data-testid="order-cancel-reason" />
            </label>
            <Transition name="fh-fade-slide">
              <p v-if="cancelError" class="text-sm text-danger-700" role="alert">{{ cancelError }}</p>
            </Transition>
            <div class="flex justify-end gap-2 border-t border-ink-100 pt-3">
              <FhButton variant="ghost" size="md" :disabled="cancelBusy" @click="cancelOpen = false">Quay lại</FhButton>
              <FhButton variant="danger" size="md" :loading="cancelBusy" :disabled="cancelBusy" data-testid="order-cancel-confirm" @click="submitCancel">Huỷ đơn</FhButton>
            </div>
          </section>
        </div>
      </Transition>

      <!-- Incident & Stopped Work Panels (Audits/Disputes) -->
      <section
        v-if="orderSupportCases.length > 0"
        class="rounded-2xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) space-y-3"
        data-testid="order-support-cases-panel"
        aria-label="Khiếu nại, đổi thợ và yêu cầu hỗ trợ"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
          <div class="flex items-center gap-2">
            <AlertTriangle :size="18" class="text-warning-600 shrink-0" aria-hidden="true" />
            <h2 class="text-base font-bold text-ink-950">Khiếu nại, đổi thợ &amp; báo cáo của đơn này</h2>
            <span class="rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs font-semibold text-ink-700">
              {{ orderSupportCases.length }}
            </span>
          </div>
          <router-link
            :to="{ path: '/console/support', query: { serviceOrderId: order.id } }"
            class="text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            Mở danh sách hỗ trợ
          </router-link>
        </div>

        <ul class="divide-y divide-ink-100">
          <li
            v-for="item in orderSupportCases"
            :key="item.id"
            class="flex flex-col gap-2 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-sm text-ink-950">{{ supportCaseTitle(item) }}</span>
                <FhStatusPill :status="item.status" :label="supportCaseStatusLabels[item.status]" />
                <span
                  v-if="item.isUrgent && (item.status === 'open' || item.status === 'in_review')"
                  class="rounded-full border border-danger-200 bg-danger-50 px-2 py-0.5 text-[11px] font-medium text-danger-700"
                >
                  Cần xử lý ngay
                </span>
                <span
                  v-if="item.holdCompletion"
                  class="rounded-full bg-info-50 px-2 py-0.5 text-[11px] font-medium text-info-600"
                >
                  Đang giữ đơn
                </span>
              </div>
              <p class="text-xs sm:text-sm text-ink-700 whitespace-pre-line">{{ item.reason }}</p>
              <p v-if="item.resolutionReason" class="rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">
                <span class="font-semibold">Kết quả xử lý:</span> {{ item.resolutionReason }}
              </p>
              <p class="font-num text-xs text-ink-500">
                Gửi lúc {{ vnDateTimeString(item.createdAt) }}
              </p>
            </div>
            <router-link
              :to="`/console/support/${encodeURIComponent(item.id)}`"
              class="inline-flex shrink-0 items-center self-start rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100/80 transition-colors"
            >
              {{ isServiceManager ? 'Xem & xử lý' : 'Xem chi tiết' }}
            </router-link>
          </li>
        </ul>
      </section>

      <GroupStopIncidentsPanel :key="`group:${order.id}`" :order-id="order.id" :group-id="order.visitGroupId ?? null" />
      <div id="staff-finance-audit-panel">
        <StoppedWorkFinancePanel :key="order.id" :order-id="order.id" />
      </div>

      <!-- Main Layout: 2 Columns (2/3 Left, 1/3 Right) -->
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- LEFT COLUMN: Nội dung đơn hàng & Báo giá (col-span-2) -->
        <div class="space-y-6 lg:col-span-2">
          <!-- Card: Nội dung đơn hàng -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs space-y-5">
            <h2 class="text-lg font-bold text-ink-950">Nội dung đơn hàng</h2>

            <!-- Service Banner Box -->
            <div class="flex items-center justify-between gap-3 rounded-2xl bg-blue-50/50 p-4 border border-blue-100/70">
              <div class="flex items-center gap-3.5 min-w-0">
                <!-- Appliance Icon / Service 3D Artwork -->
                <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-200/60 bg-white shadow-xs overflow-hidden p-1.5">
                  <img
                    v-if="serviceArtworkUrl && !artworkError"
                    :src="serviceArtworkUrl"
                    :alt="details.serviceTitle"
                    class="h-full w-full object-contain select-none pointer-events-none"
                    loading="lazy"
                    @error="artworkError = true"
                  />
                  <component v-else :is="categoryIconComponent" class="h-6 w-6 text-brand-600" aria-hidden="true" />
                </div>

                <!-- Service Title & Category Breadcrumb -->
                <div class="min-w-0">
                  <h3 class="font-bold text-ink-950 text-base leading-snug truncate">
                    {{ details.serviceTitle }}
                  </h3>
                  <p class="text-xs text-ink-500 font-medium mt-0.5">
                    {{ categoryName }} &gt; {{ details.serviceTitle }}
                  </p>
                </div>
              </div>

              <!-- Pricing Mode Badge -->
              <span class="shrink-0 rounded-lg bg-blue-100/70 text-brand-800 border border-blue-200 px-3 py-1 text-xs font-semibold whitespace-nowrap">
                {{ pricingModeLabel }}
              </span>
            </div>

            <!-- Detail Rows with Icons -->
            <div class="space-y-3.5 text-sm">
              <!-- Mô tả sự cố -->
              <div class="flex items-start gap-4">
                <div class="w-40 sm:w-44 shrink-0 font-semibold text-ink-800 flex items-center gap-2">
                  <FileText :size="15" class="text-ink-400 shrink-0" aria-hidden="true" />
                  <span>Mô tả sự cố</span>
                </div>
                <div class="min-w-0 flex-1 text-ink-900 leading-relaxed">
                  {{ details.serviceProblem || 'Máy lạnh không làm lạnh, có hiện tượng chảy nước.' }}
                </div>
              </div>

              <!-- Phạm vi công việc -->
              <div class="flex items-start gap-4">
                <div class="w-40 sm:w-44 shrink-0 font-semibold text-ink-800 flex items-center gap-2">
                  <ShieldCheck :size="15" class="text-ink-400 shrink-0" aria-hidden="true" />
                  <span>Phạm vi công việc</span>
                </div>
                <div class="min-w-0 flex-1 text-ink-900 leading-relaxed">
                  {{ details.workScope || 'Kiểm tra, vệ sinh và sửa chữa thiết bị theo phạm vi Booking.' }}
                </div>
              </div>

              <!-- Ghi chú khách hàng -->
              <div class="flex items-start gap-4">
                <div class="w-40 sm:w-44 shrink-0 font-semibold text-ink-800 flex items-center gap-2">
                  <MessageSquare :size="15" class="text-ink-400 shrink-0" aria-hidden="true" />
                  <span>Ghi chú khách hàng</span>
                </div>
                <div class="min-w-0 flex-1 text-ink-900 leading-relaxed">
                  {{ details.specialNote || 'Khách mong muốn kỹ thuật viên đến đúng lịch hẹn và liên hệ trước khi qua.' }}
                </div>
              </div>
            </div>

            <!-- Customer Images Section -->
            <div class="space-y-3 pt-3 border-t border-ink-100">
              <h3 class="text-sm font-bold text-ink-900">
                Hình ảnh khách cung cấp ({{ totalMediaCount }})
              </h3>

              <!-- Full private signed media viewer (thumbnails + zoom modal) -->
              <BookingMediaViewer
                v-if="bookingForMedia && bookingMedia.length > 0"
                :booking-id="bookingMediaBookingId"
                :media="bookingMedia"
                embedded
              />

              <!-- Fallback if direct URLs exist without booking object -->
              <div v-else-if="fallbackMedia.length > 0" class="grid grid-cols-3 gap-3 sm:grid-cols-4">
                <article
                  v-for="(img, idx) in fallbackMedia"
                  :key="img.id || idx"
                  class="aspect-square overflow-hidden rounded-xl border border-ink-200 bg-ink-50 relative group cursor-pointer"
                  @click="selectedFallbackImage = img.url"
                >
                  <img
                    v-if="img.url"
                    :src="img.url"
                    :alt="`Ảnh khách cung cấp ${idx + 1}`"
                    class="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div v-else class="flex h-full items-center justify-center text-xs text-ink-400">
                    Ảnh đính kèm
                  </div>
                  <span class="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow-xs">
                    <ZoomIn :size="13" aria-hidden="true" />
                  </span>
                </article>
              </div>

              <!-- Empty media state -->
              <div v-else class="rounded-xl border border-dashed border-ink-200 bg-ink-25/50 p-6 text-center text-xs text-ink-400">
                Khách hàng không đính kèm hình ảnh hoặc video cho đơn này.
              </div>
            </div>
          </div>

          <!-- Card: Báo giá & hạng mục thực hiện -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div class="flex items-center justify-between border-b border-ink-100 pb-3">
              <div class="flex items-center gap-2 text-ink-900 font-bold text-base">
                <Receipt :size="18" class="text-brand-600" aria-hidden="true" />
                <span>Báo giá &amp; hạng mục thực hiện</span>
              </div>

              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                :aria-label="isQuotationCollapsed ? 'Mở rộng báo giá' : 'Thu gọn báo giá'"
                @click="isQuotationCollapsed = !isQuotationCollapsed"
              >
                <ChevronUp v-if="!isQuotationCollapsed" :size="18" aria-hidden="true" />
                <ChevronDown v-else :size="18" aria-hidden="true" />
              </button>
            </div>

            <!-- Table of quotation items -->
            <div v-if="!isQuotationCollapsed" class="overflow-x-auto">
              <table class="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr class="border-b border-ink-100 text-xs font-semibold text-ink-600">
                    <th class="py-2.5 pr-3">Hạng mục</th>
                    <th class="py-2.5 px-3">Loại</th>
                    <th class="py-2.5 px-3 text-center">Số lượng</th>
                    <th class="py-2.5 px-3 text-right">Đơn giá</th>
                    <th class="py-2.5 pl-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-50">
                  <tr v-for="(item, idx) in quotationItems" :key="item.id || idx" class="hover:bg-ink-25/60 transition-colors">
                    <td class="py-3 pr-3 font-medium text-ink-900">
                      {{ item.description }}
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap">
                      <span
                        v-if="item.type === 'LABOR'"
                        class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                      >
                        Nhân công
                      </span>
                      <span
                        v-else
                        class="rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700"
                      >
                        Linh kiện
                      </span>
                    </td>
                    <td class="py-3 px-3 text-center font-num text-ink-800">
                      {{ item.quantity }}
                    </td>
                    <td class="py-3 px-3 text-right font-num text-ink-800 font-medium">
                      <FhMoney :amount="item.unitPrice" />
                    </td>
                    <td class="py-3 pl-3 text-right font-num font-semibold text-ink-950">
                      <FhMoney :amount="item.lineTotal" />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-if="quotationItems.length === 0" class="py-6 text-center text-xs text-ink-400">
                Chưa có hạng mục báo giá.
              </div>

              <div
                v-if="orderAdditionalCosts.length > 0"
                class="mt-4 border-t border-ink-100 pt-4 space-y-3"
                data-testid="order-additional-costs-panel"
              >
                <h3 class="text-xs sm:text-sm font-bold text-ink-900">
                  Chi phí &amp; linh kiện phát sinh ({{ orderAdditionalCosts.length }})
                </h3>
                <ul class="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-ink-25/40">
                  <li v-for="cost in orderAdditionalCosts" :key="cost.id" class="p-3.5 space-y-2 text-xs sm:text-sm">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div class="min-w-0 space-y-0.5">
                        <p class="font-medium text-ink-900 text-pretty">{{ cost.reason }}</p>
                        <p class="font-num text-xs text-ink-500">
                          {{ cost.fulfillmentMethod === 'delivery' ? 'Giao tận nơi' : 'Lấy tại kho / Thợ tự mang' }}
                          <template v-if="cost.decidedAt"> · Quyết định lúc {{ vnDateTimeString(cost.decidedAt) }}</template>
                        </p>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <FhStatusPill :status="cost.status" :label="additionalCostStatusLabels[cost.status]" />
                        <span class="font-num font-semibold text-ink-950">
                          <FhMoney :amount="Number(cost.totalLaborDelta) + Number(cost.totalPartsDelta) + Number(cost.shippingFee || 0)" />
                        </span>
                      </div>
                    </div>
                    <ul v-if="cost.items?.length" class="space-y-1 border-t border-ink-100/80 pt-2 text-xs text-ink-600">
                      <li v-for="item in cost.items" :key="item.id" class="flex items-center justify-between gap-3">
                        <span class="min-w-0 truncate">
                          {{ item.description }} · <span class="font-num">{{ item.quantity }} × <FhMoney :amount="item.unitPrice" /></span>
                        </span>
                        <span class="font-num shrink-0 font-medium text-ink-800"><FhMoney :amount="item.lineTotal" /></span>
                      </li>
                      <li v-if="Number(cost.shippingFee || 0) > 0" class="flex items-center justify-between gap-3">
                        <span>Phí giao linh kiện</span>
                        <span class="font-num shrink-0 font-medium text-ink-800"><FhMoney :amount="Number(cost.shippingFee)" /></span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Chi phí & Lịch sử trạng thái (col-span-1) -->
        <div class="space-y-6">
          <!-- Card: Chi phí -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs space-y-4">
            <h3 class="font-bold text-ink-950 text-base">Chi phí</h3>

            <dl class="space-y-3 text-xs sm:text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-ink-600">
                  <Wrench :size="15" class="text-ink-400" aria-hidden="true" />
                  <span>Tiền công</span>
                </dt>
                <dd class="font-num font-semibold text-ink-900">
                  <FhMoney :amount="order.laborTotal" />
                </dd>
              </div>

              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-ink-600">
                  <Package :size="15" class="text-ink-400" aria-hidden="true" />
                  <span>Linh kiện</span>
                </dt>
                <dd class="font-num font-semibold text-ink-900">
                  <FhMoney :amount="order.partsTotal" />
                </dd>
              </div>

              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-ink-600">
                  <Tag :size="15" class="text-ink-400" aria-hidden="true" />
                  <span>Phụ phí</span>
                </dt>
                <dd class="font-num font-semibold text-ink-900">
                  <FhMoney :amount="0" />
                </dd>
              </div>

              <!-- Total Highlight Box -->
              <div class="rounded-xl bg-blue-50/80 p-3.5 border border-blue-100 flex items-center justify-between gap-3 pt-3">
                <dt class="font-bold text-ink-900 text-sm">Tổng thanh toán</dt>
                <dd class="font-num text-lg font-bold text-brand-700">
                  <FhMoney :amount="order.grandTotal" emphasis />
                </dd>
              </div>
            </dl>
          </div>

          <!-- Card: Lịch sử trạng thái -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs space-y-4">
            <h3 class="font-bold text-ink-950 text-base">Lịch sử trạng thái</h3>

            <!-- FhTimeline component with steps, green checkmarks and current badge -->
            <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
            <p v-else class="text-sm text-ink-500">Chưa có lịch sử trạng thái.</p>

            <!-- Raw Reason accordion for staff inspection & compliance with tests -->
            <div v-if="isStaffMediaViewerAllowed && timelineEntries.length" class="mt-4 space-y-2 border-t border-ink-100 pt-3">
              <p class="text-xs text-ink-500">Lý do gốc do hệ thống ghi nhận</p>
              <details v-for="(entry, index) in timelineEntries" :key="`reason-${entry.status}-${index}`" class="min-w-0">
                <summary class="cursor-pointer text-sm font-medium text-brand-700">Xem lý do gốc · <span class="font-num">{{ index + 1 }}</span></summary>
                <div class="mt-2 min-w-0 rounded-[var(--radius-sm)] border border-ink-100 bg-ink-25 p-3 text-sm text-ink-700">
                  <p><span class="font-medium">Mục <span class="font-num">{{ index + 1 }}</span> · {{ orderStatusLabel(entry.status) }}</span></p>
                  <p v-if="entry.timestamp" class="font-num text-xs text-ink-500">{{ vnDateTimeString(entry.timestamp) }}</p>
                  <p class="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{{ entry.title }}</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      <!-- Fallback Lightbox Modal for standalone images -->
      <Teleport to="body">
        <div
          v-if="selectedFallbackImage"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          @click.self="selectedFallbackImage = null"
        >
          <div class="relative max-h-[90vh] max-w-[90vw]">
            <img :src="selectedFallbackImage" alt="Ảnh phóng to" class="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" />
            <button
              type="button"
              class="absolute -top-10 right-0 text-white font-bold text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
              @click="selectedFallbackImage = null"
            >
              Đóng
            </button>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>
