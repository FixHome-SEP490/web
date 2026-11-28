<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  FileText,
  CirclePlay,
  CheckCircle2,
  CircleX,
  Search,
  RotateCcw,
  FileSpreadsheet,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  LifeBuoy,
  User,
  Calendar,
} from 'lucide-vue-next';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleStatCard, { type ConsoleStatTone } from '../../components/console/ConsoleStatCard.vue';
import ConsoleTitleArtwork from '../../components/console/ConsoleTitleArtwork.vue';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { dashboardApi, type OperationalDashboard } from '../../api/dashboard.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCachedQuery } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQuerySearch } from '../../composables/useQueryState';
import { vnDateString } from '../../utils/vn-time';
import { pageItems, pageRangeLabel } from '../../utils/pagination';
import { categoryIcon } from '../../components/booking/service-icons';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const PAGE_SIZE = 20;
const serviceOrderStates = ['IN_PROGRESS', 'ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'] as const;
type StatusFilter = 'ALL' | (typeof serviceOrderStates)[number];
const statusOptions: { value: (typeof serviceOrderStates)[number]; label: string }[] = [
  { value: 'IN_PROGRESS', label: 'Đang thực hiện (tất cả)' },
  { value: 'ACCEPTED', label: 'Đã nhận đơn' },
  { value: 'EN_ROUTE', label: 'Đang di chuyển' },
  { value: 'UNDER_REPAIR', label: 'Đang sửa chữa' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];

// Status, search and page live in the address bar; the server filters, searches
// (order code, customer, service; accents ignored) and pages.
const statusFilter = useQueryChoice<StatusFilter>('status', ['ALL', ...serviceOrderStates], 'ALL');
const { input: searchQuery, search } = useQuerySearch();

// Service type filter
const serviceFilter = ref<string>('ALL');
const defaultServices = [
  'Lắp đặt điều hòa',
  'Vệ sinh điều hòa',
  'Sửa chữa điều hòa',
  'Sửa máy giặt',
  'Vệ sinh máy giặt',
  'Sửa tủ lạnh',
  'Vệ sinh tủ lạnh',
  'Sửa bình nóng lạnh',
  'Sửa thiết bị điện',
  'Sửa đường ống nước',
];

// Date range filter presets & custom range
type DateFilterType = 'ALL' | 'TODAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';
const dateFilter = ref<DateFilterType>('ALL');
const customDateFrom = ref<string>('');
const customDateTo = ref<string>('');
const isDatePickerOpen = ref<boolean>(false);
const datePickerRef = ref<HTMLElement | null>(null);

const datePresets: { value: DateFilterType; label: string }[] = [
  { value: 'ALL', label: 'Tất cả thời gian' },
  { value: 'TODAY', label: 'Hôm nay' },
  { value: '7_DAYS', label: '7 ngày qua' },
  { value: '30_DAYS', label: '30 ngày qua' },
  { value: 'THIS_MONTH', label: 'Tháng này' },
  { value: 'LAST_MONTH', label: 'Tháng trước' },
];

const dateRangeLabel = computed(() => {
  if (dateFilter.value === 'ALL') return 'Chọn khoảng thời gian';
  if (dateFilter.value === 'TODAY') return 'Hôm nay';
  if (dateFilter.value === '7_DAYS') return '7 ngày qua';
  if (dateFilter.value === '30_DAYS') return '30 ngày qua';
  if (dateFilter.value === 'THIS_MONTH') return 'Tháng này';
  if (dateFilter.value === 'LAST_MONTH') return 'Tháng trước';
  if (dateFilter.value === 'CUSTOM') {
    if (customDateFrom.value && customDateTo.value) {
      return `${vnDateString(customDateFrom.value)} – ${vnDateString(customDateTo.value)}`;
    }
    if (customDateFrom.value) return `Từ ${vnDateString(customDateFrom.value)}`;
    if (customDateTo.value) return `Đến ${vnDateString(customDateTo.value)}`;
    return 'Tùy chọn ngày';
  }
  return 'Chọn khoảng thời gian';
});

function selectDatePreset(preset: DateFilterType) {
  dateFilter.value = preset;
  if (preset !== 'CUSTOM') {
    isDatePickerOpen.value = false;
  }
}

function applyCustomDate() {
  if (customDateFrom.value || customDateTo.value) {
    dateFilter.value = 'CUSTOM';
  }
  isDatePickerOpen.value = false;
}

function clearDateFilter() {
  dateFilter.value = 'ALL';
  customDateFrom.value = '';
  customDateTo.value = '';
  isDatePickerOpen.value = false;
}

const hasFilters = computed(
  () =>
    Boolean(searchQuery.value.trim()) ||
    statusFilter.value !== 'ALL' ||
    serviceFilter.value !== 'ALL' ||
    dateFilter.value !== 'ALL',
);

const resetFilters = () => {
  searchQuery.value = '';
  statusFilter.value = 'ALL';
  serviceFilter.value = 'ALL';
  dateFilter.value = 'ALL';
  customDateFrom.value = '';
  customDateTo.value = '';
  isDatePickerOpen.value = false;
};

const {
  page,
  items: orders,
  total,
  loading,
  error: loadError,
  load: loadOrders,
  changingPage,
  prefetch,
} = usePagedList<ServiceOrderItem>({
  key: () => queryKeys.orders.console({ status: statusFilter.value, search: search.value }),
  pageSize: PAGE_SIZE,
  fetch: (p, size) =>
    ordersApi.getConsoleOrdersPage(p, size, {
      status: statusFilter.value === 'ALL' || statusFilter.value === 'IN_PROGRESS' ? undefined : statusFilter.value,
      statuses: statusFilter.value === 'IN_PROGRESS' ? ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'] : undefined,
      search: search.value,
    }),
});

// Operational Dashboard query for real 4 KPI counts
const opsQuery = useCachedQuery({
  key: queryKeys.consoleDashboard,
  fetch: async () => {
    try {
      return await dashboardApi.getOperational();
    } catch {
      return null;
    }
  },
});

const ops = computed<OperationalDashboard | null>(() => {
  const data = opsQuery.data.value;
  if (!data) return null;
  const d = data as unknown;
  if (typeof d === 'object' && d !== null && 'ops' in d) {
    return (d as { ops: OperationalDashboard }).ops;
  }
  return data as OperationalDashboard;
});

const countOf = (status: string) =>
  Number(ops.value?.ordersByStatus?.find((s) => s.status.toLowerCase() === status.toLowerCase())?.count ?? 0);

const completedCount = computed(() => countOf('completed'));
const cancelledCount = computed(() => countOf('cancelled'));
const activeCount = computed(() => ops.value?.activeOrders ?? 0);

const totalOrdersCount = computed(() => {
  if (ops.value?.ordersByStatus?.length) {
    const sumStatuses = ops.value.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0);
    return Math.max(sumStatuses, completedCount.value + activeCount.value + cancelledCount.value);
  }
  return total.value ?? 0;
});

// 4 KPI Cards configuration - clean interactive filters synced with statusFilter
const kpiCards = computed<{ key: 'total' | 'active' | 'completed' | 'cancelled'; label: string; value: number; icon: typeof FileText; tone: ConsoleStatTone }[]>(() => [
  {
    key: 'total',
    label: 'Tổng đơn',
    value: totalOrdersCount.value,
    icon: FileText,
    tone: 'neutral',
  },
  {
    key: 'active',
    label: 'Đang thực hiện',
    value: activeCount.value,
    icon: CirclePlay,
    tone: 'brand',
  },
  {
    key: 'completed',
    label: 'Hoàn thành',
    value: completedCount.value,
    icon: CheckCircle2,
    tone: 'success',
  },
  {
    key: 'cancelled',
    label: 'Đã hủy',
    value: cancelledCount.value,
    icon: CircleX,
    tone: 'danger',
  },
]);

const isKpiActive = (key: 'total' | 'active' | 'completed' | 'cancelled') => {
  if (key === 'total') return statusFilter.value === 'ALL';
  if (key === 'active') return ['IN_PROGRESS', 'ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'].includes(statusFilter.value);
  if (key === 'completed') return statusFilter.value === 'COMPLETED';
  return statusFilter.value === 'CANCELLED';
};

const selectKpiStatus = (key: 'total' | 'active' | 'completed' | 'cancelled') => {
  if (key === 'total') {
    statusFilter.value = 'ALL';
    return;
  }
  const target: StatusFilter = key === 'active' ? 'IN_PROGRESS' : key === 'completed' ? 'COMPLETED' : 'CANCELLED';
  statusFilter.value = isKpiActive(key) ? 'ALL' : target;
};

// Dynamic list of service options for the filter dropdown
const serviceOptions = computed(() => {
  const set = new Set<string>(defaultServices);
  for (const o of orders.value) {
    if (o.serviceName) set.add(o.serviceName);
  }
  return Array.from(set);
});

// Displayed orders filtered by service & date if specified
const displayedOrders = computed(() => {
  let list = orders.value;

  // Filter by service
  if (serviceFilter.value !== 'ALL') {
    const s = serviceFilter.value.toLowerCase().trim();
    list = list.filter((o) => (o.serviceName || '').toLowerCase().includes(s));
  }

  // Filter by date range
  if (dateFilter.value !== 'ALL') {
    const now = new Date();
    list = list.filter((o) => {
      if (!o.createdAt) return false;
      const created = new Date(o.createdAt);
      if (Number.isNaN(created.getTime())) return false;

      if (dateFilter.value === 'TODAY') {
        return (
          created.getDate() === now.getDate() &&
          created.getMonth() === now.getMonth() &&
          created.getFullYear() === now.getFullYear()
        );
      }
      if (dateFilter.value === '7_DAYS') {
        const diffDays = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);
        return diffDays >= 0 && diffDays <= 7;
      }
      if (dateFilter.value === '30_DAYS') {
        const diffDays = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);
        return diffDays >= 0 && diffDays <= 30;
      }
      if (dateFilter.value === 'THIS_MONTH') {
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      }
      if (dateFilter.value === 'LAST_MONTH') {
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return created.getMonth() === lastMonth && created.getFullYear() === year;
      }
      if (dateFilter.value === 'CUSTOM') {
        if (customDateFrom.value) {
          const from = new Date(customDateFrom.value + 'T00:00:00');
          if (created < from) return false;
        }
        if (customDateTo.value) {
          const to = new Date(customDateTo.value + 'T23:59:59.999');
          if (created > to) return false;
        }
        return true;
      }
      return true;
    });
  }

  return list;
});

// Pagination calculations
const totalPagesCount = computed(() => Math.ceil((total.value ?? 0) / PAGE_SIZE));
const paginationItems = computed(() => pageItems(page.value, totalPagesCount.value));
const paginationRange = computed(() => {
  if (!total.value || total.value <= 0) return '0';
  const from = Math.min((page.value - 1) * PAGE_SIZE + 1, total.value);
  const to = Math.min(page.value * PAGE_SIZE, total.value);
  return `${from} – ${to}`;
});

function goToPage(target: number) {
  if (loading.value || target < 1 || target > totalPagesCount.value || target === page.value) return;
  page.value = target;
}

// Helpers for table data display
function getCustomerInitial(name?: string | null): string {
  if (!name) return 'K';
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : 'K';
}

function formatPhone(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

function formatTechInfo(tech?: { id?: string; fullName?: string; phoneNumber?: string }) {
  if (!tech || !tech.fullName) return null;
  const match = tech.fullName.match(/^(.*?)\s*\((KTV-?[^)]+)\)$/i);
  if (match) {
    const rawCode = match[2].toUpperCase();
    const numPart = rawCode.replace(/\D/g, '');
    const code = numPart ? `KTV-${numPart.padStart(3, '0')}` : rawCode;
    return {
      name: match[1].trim(),
      code,
    };
  }
  const parenMatch = tech.fullName.match(/^(.*?)\s*\(([^)]+)\)$/i);
  let name = tech.fullName;
  let codeSeed = '';
  if (parenMatch) {
    name = parenMatch[1].trim();
    const digitsInParen = parenMatch[2].replace(/\D/g, '');
    if (digitsInParen) {
      codeSeed = digitsInParen;
    }
  }
  const rawDigits = codeSeed || (tech.id || '').replace(/\D/g, '');
  const trimmed = rawDigits.replace(/^0+/, '') || rawDigits;
  const numPart = trimmed.length > 4 ? trimmed.slice(-4) : trimmed;
  const code = numPart
    ? `KTV-${numPart.padStart(3, '0')}`
    : tech.id
      ? `KTV-${tech.id.slice(0, 3).toUpperCase()}`
      : 'KTV';
  return {
    name,
    code,
  };
}

function formatCurrencyClean(amount: number | null | undefined): string {
  if (amount == null) return '0 đ';
  const num = Math.round(Number(amount));
  return `${num.toLocaleString('vi-VN')} đ`;
}

// Service artwork image error fallback tracking
const artworkErrors = ref<Record<string, boolean>>({});
function onArtworkError(id: string) {
  artworkErrors.value[id] = true;
}

// Action dropdown menu state
const activeMenuId = ref<string | null>(null);
function toggleMenu(id: string) {
  activeMenuId.value = activeMenuId.value === id ? null : id;
}

function closeMenus(e?: MouseEvent) {
  if (e && datePickerRef.value && datePickerRef.value.contains(e.target as Node)) {
    // Click was inside date picker popover
  } else {
    isDatePickerOpen.value = false;
  }
  activeMenuId.value = null;
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', closeMenus);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', closeMenus);
  }
});

function getDetailedStatus(row: ServiceOrderItem): { orderStatus: string; paymentStatus: string; note: string } {
  let orderStatus = '';
  let note = '';
  if (row.workStopped === true && row.operationalDisposition === 'STOPPED') {
    orderStatus = 'Đã dừng sửa – cần đối soát';
    note = 'Đã dừng công việc tại hiện trường, chờ đối soát xử lý';
  } else {
    const s = String(row.status).toUpperCase();
    switch (s) {
      case 'COMPLETED':
        orderStatus = 'Hoàn thành';
        break;
      case 'CANCELLED':
        orderStatus = 'Đã hủy';
        break;
      case 'UNDER_REPAIR':
        orderStatus = 'Đang sửa chữa';
        break;
      case 'EN_ROUTE':
        orderStatus = 'Đang di chuyển';
        break;
      case 'ACCEPTED':
        orderStatus = 'Đã nhận đơn';
        break;
      default:
        orderStatus = row.status || '—';
    }
  }

  const p = String(row.paymentStatus || '').toUpperCase();
  let paymentStatus = 'Chưa thanh toán';
  if (p === 'PAID') paymentStatus = 'Đã thanh toán';
  else if (p === 'REFUNDED') paymentStatus = 'Đã hoàn tiền';

  return { orderStatus, paymentStatus, note };
}

// Client-side Excel/CSV Export with clean layout, proper headers, and UTF-8 BOM
function exportToCsv() {
  const exportItems = displayedOrders.value.length > 0 ? displayedOrders.value : orders.value;
  if (!exportItems || exportItems.length === 0) return;

  const now = new Date();
  const exportTimeStr = `${vnDateString(now)} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

  // Summary counts
  const totalAmount = exportItems.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const totalLabor = exportItems.reduce((sum, o) => sum + (o.laborTotal || 0), 0);
  const totalParts = exportItems.reduce((sum, o) => sum + (o.partsTotal || 0), 0);

  // Status & filter summary text
  const currentStatusLabel = statusOptions.find((opt) => opt.value === statusFilter.value)?.label || 'Tất cả trạng thái';
  const currentServiceLabel = serviceFilter.value === 'ALL' ? 'Tất cả dịch vụ' : serviceFilter.value;
  const currentTimeLabel = dateRangeLabel.value;

  const reportMetadata = [
    ['HỆ THỐNG QUẢN LÝ DỊCH VỤ SỬA CHỮA FIXHOME - BÁO CÁO DANH SÁCH ĐƠN SỬA CHỮA'],
    [`Thời gian xuất: ${exportTimeStr}`, `Người xuất: Quản trị viên FixHome`, `Tổng số đơn: ${exportItems.length}`],
    [`Bộ lọc: Trạng thái: ${currentStatusLabel}`, `Dịch vụ: ${currentServiceLabel}`, `Khoảng thời gian: ${currentTimeLabel}`],
    [], // Blank separator row
  ];

  const headers = [
    'STT',
    'Mã đơn hàng',
    'Ngày tạo',
    'Tên dịch vụ',
    'Địa chỉ khách hàng',
    'Tên khách hàng',
    'Số điện thoại',
    'Kỹ thuật viên',
    'Mã KTV',
    'Tiền công (VNĐ)',
    'Tiền linh kiện (VNĐ)',
    'Tổng tiền (VNĐ)',
    'Trạng thái đơn hàng',
    'Trạng thái thanh toán',
    'Ghi chú nghiệp vụ',
  ];

  const rows = exportItems.map((o, index) => {
    const tech = formatTechInfo(o.technician);
    const { orderStatus, paymentStatus, note } = getDetailedStatus(o);
    const phone = o.customerPhone ? `="${formatPhone(o.customerPhone)}"` : '""';
    return [
      index + 1,
      `="${o.code}"`,
      `"${vnDateString(o.createdAt)}"`,
      `"${(o.serviceName || '').replace(/"/g, '""')}"`,
      `"${(o.addressSummary || '').replace(/"/g, '""')}"`,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      phone,
      `"${(tech?.name || 'Chưa phân công').replace(/"/g, '""')}"`,
      `"${tech?.code || '—'}"`,
      o.laborTotal ?? 0,
      o.partsTotal ?? 0,
      o.grandTotal ?? 0,
      `"${orderStatus}"`,
      `"${paymentStatus}"`,
      `"${note}"`,
    ];
  });

  const summaryRow = [
    '"TỔNG CỘNG"',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    totalLabor,
    totalParts,
    totalAmount,
    `"Tổng ${exportItems.length} đơn"`,
    '""',
    '""',
  ];

  const allLines = [
    ...reportMetadata.map((line) => line.map((cell) => `"${cell}"`).join(',')),
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((r) => r.join(',')),
    summaryRow.join(','),
  ];

  const csvContent = '\uFEFF' + allLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `FixHome-DonSuaChua-${now.toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="space-y-6 pb-12 font-sans">
    <!-- A. Header -->
    <header class="animate-slide-up flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
      <div class="flex items-center gap-3.5">
        <ConsoleTitleArtwork src="/images/ui/console-orders.png" />
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              Đơn sửa chữa
            </h1>
            <span
              v-if="!loading && !loadError && totalOrdersCount != null"
              class="inline-flex items-center justify-center rounded-full bg-slate-100 px-2.5 py-0.5 font-num text-xs font-semibold text-slate-700"
            >
              {{ totalOrdersCount }}
            </span>
          </div>
          <p class="mt-0.5 text-sm text-ink-500">
            Quản lý và theo dõi các đơn sửa chữa trên hệ thống
          </p>
        </div>
      </div>
    </header>

    <!-- B. Bốn thẻ thống kê (4 KPI Cards) -->
    <section class="animate-slide-up-delay-1 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Thống kê đơn sửa chữa">
      <ConsoleStatCard
        v-for="kpi in kpiCards"
        :key="kpi.key"
        interactive
        :active="isKpiActive(kpi.key)"
        :loading="opsQuery.loading.value && !ops"
        :label="kpi.label"
        :value="kpi.value"
        :icon="kpi.icon"
        :tone="kpi.tone"
        @click="selectKpiStatus(kpi.key)"
      />
    </section>

    <!-- C. Thanh tìm kiếm và bộ lọc (Search and Filter bar) -->
    <section class="animate-slide-up-delay-2 relative z-20 flex flex-wrap items-center gap-3">
      <!-- 1. Search input -->
      <div class="relative min-w-[260px] flex-1 max-w-sm">
        <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Tìm mã đơn, khách hàng, dịch vụ"
          aria-label="Tìm đơn sửa chữa"
          :maxlength="SEARCH_MAX_LENGTH"
          class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <!-- 2. Status dropdown -->
      <div class="relative min-w-[155px]">
        <select
          v-model="statusFilter"
          class="h-10 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-3.5 pr-8 text-sm text-ink-700 transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Lọc theo trạng thái"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <ChevronDown :size="15" class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      </div>

      <!-- 3. Service dropdown -->
      <div class="relative min-w-[160px]">
        <select
          v-model="serviceFilter"
          class="h-10 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-3.5 pr-8 text-sm text-ink-700 transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          :class="{ 'border-brand-500 text-brand-700 bg-brand-50/20': serviceFilter !== 'ALL' }"
          aria-label="Lọc theo loại dịch vụ"
        >
          <option value="ALL">Tất cả dịch vụ</option>
          <option v-for="srv in serviceOptions" :key="srv" :value="srv">
            {{ srv }}
          </option>
        </select>
        <ChevronDown :size="15" class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      </div>

      <!-- 4. Date range filter picker -->
      <div ref="datePickerRef" class="relative">
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-700 transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          :class="{ 'border-brand-500 text-brand-700 bg-brand-50/20': dateFilter !== 'ALL' }"
          aria-label="Chọn khoảng thời gian"
          @click.stop="isDatePickerOpen = !isDatePickerOpen"
        >
          <Calendar :size="15" class="text-ink-400" aria-hidden="true" />
          <span class="max-w-[160px] truncate">{{ dateRangeLabel }}</span>
          <ChevronDown
            :size="14"
            class="text-ink-400 transition-transform duration-200"
            :class="{ 'rotate-180': isDatePickerOpen }"
            aria-hidden="true"
          />
        </button>

        <!-- Date picker popover dropdown -->
        <div
          v-if="isDatePickerOpen"
          class="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-2xl border border-ink-200/90 bg-white p-3.5 shadow-xl"
          @click.stop
        >
          <div class="mb-2 px-1 text-xs font-semibold text-ink-500">Khoảng thời gian nhanh</div>
          <div class="mb-3 grid grid-cols-2 gap-1.5">
            <button
              v-for="preset in datePresets"
              :key="preset.value"
              type="button"
              class="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors"
              :class="dateFilter === preset.value ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-700 hover:bg-ink-50'"
              @click="selectDatePreset(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>

          <div class="border-t border-ink-100 pt-3">
            <div class="mb-2 px-1 text-xs font-semibold text-ink-500">Tùy chọn ngày</div>
            <div class="space-y-2">
              <div>
                <label class="mb-1 block text-[11px] font-medium text-ink-500">Từ ngày</label>
                <input
                  v-model="customDateFrom"
                  type="date"
                  class="h-8 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-xs text-ink-800 transition-colors focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1 block text-[11px] font-medium text-ink-500">Đến ngày</label>
                <input
                  v-model="customDateTo"
                  type="date"
                  class="h-8 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-xs text-ink-800 transition-colors focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div class="flex items-center justify-between pt-1">
                <button
                  type="button"
                  class="rounded-lg px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800"
                  @click="clearDateFilter"
                >
                  Xóa lọc
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                  @click="applyCustomDate"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Reset button -->
      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
        @click="resetFilters"
      >
        <RotateCcw :size="14" aria-hidden="true" />
        Đặt lại
      </button>

      <!-- 5. Export button -->
      <button
        type="button"
        class="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/50 px-3.5 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
        title="Xuất dữ liệu đơn sửa chữa ra file Excel (CSV chuẩn UTF-8)"
        @click="exportToCsv"
      >
        <FileSpreadsheet :size="16" class="text-brand-600" aria-hidden="true" />
        Xuất dữ liệu
      </button>
    </section>

    <!-- Error State -->
    <ConsoleLoadError v-if="loadError" class="animate-slide-up" @retry="loadOrders" />

    <!-- D. Bảng danh sách đơn (Table) -->
    <div
      v-else
      class="animate-slide-up-delay-3 relative z-10 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-xs transition-opacity duration-150"
      :class="{ 'opacity-60': changingPage }"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-ink-100/90 bg-slate-50/70">
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-ink-500 first:pl-5">
                Mã đơn
              </th>
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-ink-500">
                Dịch vụ
              </th>
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-ink-500">
                Khách hàng
              </th>
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-ink-500">
                Kỹ thuật viên
              </th>
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-ink-500">
                Tổng tiền
              </th>
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-ink-500">
                Trạng thái
              </th>
              <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-right text-xs font-semibold text-ink-500 last:pr-5">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-ink-100/80">
            <!-- Loading Skeleton Rows -->
            <template v-if="loading && orders.length === 0">
              <tr v-for="i in 5" :key="'skel-' + i">
                <td colspan="7" class="px-5 py-4">
                  <div class="flex items-center gap-4">
                    <div class="h-4 w-28 animate-pulse rounded bg-ink-100"></div>
                    <div class="h-4 w-40 animate-pulse rounded bg-ink-100"></div>
                    <div class="h-4 w-32 animate-pulse rounded bg-ink-100"></div>
                    <div class="h-4 w-24 animate-pulse rounded bg-ink-100"></div>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty Rows State -->
            <tr v-else-if="displayedOrders.length === 0">
              <td colspan="7" class="px-5 py-12 text-center text-sm text-ink-500">
                Không có đơn nào phù hợp.
              </td>
            </tr>

            <!-- Data Rows -->
            <tr
              v-for="row in displayedOrders"
              v-else
              :key="row.id"
              class="align-middle transition-colors duration-150 hover:bg-slate-50/70"
            >
              <!-- 1. Mã đơn -->
              <td class="whitespace-nowrap px-3.5 py-3.5 first:pl-5">
                <router-link
                  :to="`/console/orders/${row.id}`"
                  class="block font-num text-sm font-semibold text-brand-600 transition-colors hover:underline"
                >
                  {{ row.code }}
                </router-link>
                <div class="mt-0.5 font-num text-xs text-ink-400">
                  {{ vnDateString(row.createdAt) }}
                </div>
              </td>

              <!-- 2. Dịch vụ (Đồng bộ icon/artwork sửa thiết bị chuẩn của khách hàng) -->
              <td class="px-3.5 py-3.5">
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-100/80 bg-blue-50/50 p-1"
                  >
                    <img
                      v-if="!artworkErrors[row.id]"
                      :src="getServiceArtworkUrl({ name: row.serviceName })"
                      :alt="row.serviceName"
                      class="h-full w-full object-contain select-none pointer-events-none"
                      loading="lazy"
                      @error="onArtworkError(row.id)"
                    />
                    <component
                      v-else
                      :is="categoryIcon({ name: row.serviceName })"
                      :size="18"
                      class="text-brand-600"
                      aria-hidden="true"
                    />
                  </div>
                  <div class="min-w-0 max-w-[170px] lg:max-w-[200px] xl:max-w-[240px]">
                    <div class="truncate text-sm font-medium text-ink-900" :title="row.serviceName">
                      {{ row.serviceName }}
                    </div>
                    <div class="mt-0.5 truncate text-xs text-ink-400" :title="row.addressSummary">
                      {{ row.addressSummary }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- 3. Khách hàng -->
              <td class="whitespace-nowrap px-3.5 py-3.5">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {{ getCustomerInitial(row.customerName) }}
                  </div>
                  <div class="min-w-0 max-w-[110px] lg:max-w-[130px]">
                    <div class="truncate text-sm font-medium text-ink-900" :title="row.customerName">
                      {{ row.customerName }}
                    </div>
                    <div class="mt-0.5 font-num text-xs text-ink-400">
                      {{ formatPhone(row.customerPhone) }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- 4. Kỹ thuật viên -->
              <td class="whitespace-nowrap px-3.5 py-3.5">
                <div v-if="row.technician" class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                    <img
                      v-if="row.technician.avatarUrl"
                      :src="row.technician.avatarUrl"
                      :alt="row.technician.fullName"
                      class="h-full w-full object-cover"
                    />
                    <User v-else :size="15" class="text-slate-500" aria-hidden="true" />
                  </div>
                  <div class="min-w-0 max-w-[130px] lg:max-w-[150px]">
                    <div class="truncate text-sm font-medium text-ink-900" :title="formatTechInfo(row.technician)?.name">
                      {{ formatTechInfo(row.technician)?.name }}
                    </div>
                    <div class="mt-0.5 truncate font-num text-xs text-ink-400" :title="formatTechInfo(row.technician)?.code">
                      {{ formatTechInfo(row.technician)?.code }}
                    </div>
                  </div>
                </div>
                <div v-else class="pl-1 text-sm font-medium text-ink-400" aria-label="Chưa phân công" title="Chưa phân công">
                  —
                </div>
              </td>

              <!-- 5. Tổng tiền -->
              <td class="whitespace-nowrap px-3.5 py-3.5 font-num text-sm font-semibold text-ink-900">
                {{ formatCurrencyClean(row.grandTotal) }}
              </td>

              <!-- 6. Trạng thái -->
              <td class="whitespace-nowrap px-3.5 py-3.5">
                <span
                  v-if="row.workStopped === true && row.operationalDisposition === 'STOPPED'"
                  class="inline-flex items-center gap-1.5 rounded-full border border-amber-200/60 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                  data-testid="console-order-stopped"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
                  Đã dừng sửa – cần đối soát
                </span>
                <span
                  v-else-if="row.status === 'COMPLETED' || row.status === 'completed'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
                  Hoàn thành
                </span>
                <span
                  v-else-if="row.status === 'CANCELLED' || row.status === 'cancelled'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true"></span>
                  Đã hủy
                </span>
                <span
                  v-else-if="row.status === 'UNDER_REPAIR' || row.status === 'under_repair'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true"></span>
                  Đang sửa chữa
                </span>
                <span
                  v-else-if="row.status === 'EN_ROUTE' || row.status === 'en_route'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true"></span>
                  Đang di chuyển
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true"></span>
                  Đã nhận đơn
                </span>
              </td>

              <!-- 7. Thao tác -->
              <td class="whitespace-nowrap px-3.5 py-3.5 text-right last:pr-5">
                <div class="flex items-center justify-end gap-1">
                  <!-- View detail action -->
                  <router-link
                    :to="`/console/orders/${row.id}`"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900"
                    title="Xem chi tiết"
                    aria-label="Xem chi tiết"
                  >
                    <Eye :size="16" aria-hidden="true" />
                  </router-link>

                  <!-- More menu action -->
                  <div class="relative">
                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900"
                      title="Thao tác khác"
                      aria-label="Thao tác khác"
                      @click.stop="toggleMenu(row.id)"
                    >
                      <MoreHorizontal :size="16" aria-hidden="true" />
                    </button>

                    <!-- Dropdown popover -->
                    <div
                      v-if="activeMenuId === row.id"
                      class="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-ink-200/90 bg-white py-1.5 shadow-lg"
                    >
                      <router-link
                        :to="`/console/orders/${row.id}`"
                        class="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
                        @click="activeMenuId = null"
                      >
                        <Eye :size="14" class="text-ink-400" aria-hidden="true" />
                        Xem chi tiết đơn
                      </router-link>
                      <router-link
                        :to="{ path: '/console/support', query: { serviceOrderId: row.id } }"
                        class="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
                        @click="activeMenuId = null"
                      >
                        <LifeBuoy :size="14" class="text-ink-400" aria-hidden="true" />
                        Yêu cầu hỗ trợ của đơn
                      </router-link>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- E. Phân trang (Pagination) -->
    <div
      v-if="!loadError && total != null && total > 0"
      class="flex flex-wrap items-center justify-between gap-4 pt-2 text-sm text-ink-600"
    >
      <!-- Summary label on left -->
      <div class="text-sm text-ink-500">
        Hiển thị <span class="font-num font-medium text-ink-700">{{ paginationRange }}</span> trong <span class="font-num font-medium text-ink-700">{{ total }}</span> đơn
        <span class="sr-only" data-testid="pagination-summary">{{ pageRangeLabel(page, PAGE_SIZE, total ?? 0) }}</span>
      </div>

      <!-- Pager buttons on right -->
      <nav
        v-if="totalPagesCount > 1"
        class="flex items-center gap-1.5"
        aria-label="Phân trang"
        data-testid="pagination"
      >
        <!-- Previous Page -->
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang trước"
          :disabled="loading || page <= 1"
          data-testid="pagination-prev"
          @click="goToPage(page - 1)"
          @pointerenter="prefetch(page - 1)"
        >
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>

        <!-- Page numbers -->
        <template v-for="(item, idx) in paginationItems" :key="item === 'gap' ? `gap-${idx}` : item">
          <span v-if="item === 'gap'" class="px-1 text-ink-400" aria-hidden="true">…</span>
          <button
            v-else
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg font-num text-xs font-medium transition-colors"
            :class="item === page ? 'bg-brand-600 text-white shadow-xs' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
            :aria-label="`Trang ${item}`"
            :aria-current="item === page ? 'page' : undefined"
            :disabled="loading && item !== page"
            :data-testid="`pagination-page-${item}`"
            @click="goToPage(item)"
            @pointerenter="prefetch(item)"
          >
            {{ item }}
          </button>
        </template>

        <!-- Next Page -->
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang sau"
          :disabled="loading || page >= totalPagesCount"
          data-testid="pagination-next"
          @click="goToPage(page + 1)"
          @pointerenter="prefetch(page + 1)"
        >
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </nav>
    </div>
  </div>
</template>
