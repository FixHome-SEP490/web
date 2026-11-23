<script setup lang="ts">
import { computed } from 'vue';
import {
  FileText,
  CirclePlay,
  CheckCircle2,
  CircleX,
  Clock,
  ArrowRight,
  Calendar,
  ChevronRight,
  AlertCircle,
} from 'lucide-vue-next';
import { FhSkeleton, FhStatusPill } from '../../components';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import AdminDashboardIllustration from '../../components/console/AdminDashboardIllustration.vue';
import AdminOrderTrendChart from '../../components/console/AdminOrderTrendChart.vue';
import AdminOrderStatusDonut from '../../components/console/AdminOrderStatusDonut.vue';
import { useAuthStore } from '../../stores/auth';
import { useCachedQuery } from '../../composables/useCachedQuery';
import { sharedQueries } from '../../lib/queries';
import type { ServiceOrderItem } from '../../api/orders.api';
import { vnDateString, vnTimeString } from '../../utils/vn-time';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const authStore = useAuthStore();
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');

// Cached dashboard queries
const dashboardQuery = useCachedQuery(sharedQueries.consoleDashboard);
const loading = dashboardQuery.loading;
const loadError = computed(() => !loading.value && !!dashboardQuery.error.value);
const ops = computed(() => dashboardQuery.data.value?.ops ?? null);

// Orders list (up to 100 for chart, fallback to watchOrders)
const allOrders = computed<ServiceOrderItem[]>(() => {
  return (
    dashboardQuery.data.value?.allOrders ??
    dashboardQuery.data.value?.watchOrders ??
    []
  );
});

// Recent 5-8 orders for the table
const recentOrders = computed<ServiceOrderItem[]>(() => {
  return allOrders.value.slice(0, 6);
});

function loadDashboard() {
  void dashboardQuery.refetch();
}

// Counts
const countOf = (status: string) =>
  Number(ops.value?.ordersByStatus.find((s) => s.status.toLowerCase() === status)?.count ?? 0);

const completedCount = computed(() => countOf('completed'));
const cancelledCount = computed(() => countOf('cancelled'));
const activeCount = computed(() => ops.value?.activeOrders ?? 0);

const totalOrdersCount = computed(() => {
  if (!ops.value) return 0;
  const sumStatuses = ops.value.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0);
  return Math.max(sumStatuses, completedCount.value + activeCount.value + cancelledCount.value);
});

// 4 KPI Cards configuration - fully synchronized with FixHome design tokens & icons
const kpiCards = computed(() => [
  {
    key: 'total',
    label: 'Tổng đơn',
    value: totalOrdersCount.value,
    icon: FileText,
    iconBg: 'bg-brand-50 border-brand-200/80 text-brand-600',
  },
  {
    key: 'active',
    label: 'Đang thực hiện',
    value: activeCount.value,
    icon: CirclePlay,
    iconBg: 'bg-success-50 border-success-200/80 text-success-600',
  },
  {
    key: 'completed',
    label: 'Hoàn thành',
    value: completedCount.value,
    icon: CheckCircle2,
    iconBg: 'bg-violet-50 border-violet-200/80 text-violet-600',
  },
  {
    key: 'cancelled',
    label: 'Đã hủy',
    value: cancelledCount.value,
    icon: CircleX,
    iconBg: 'bg-danger-50 border-danger-200/80 text-danger-600',
  },
]);

// Attention rows for operational management
interface AttentionRow {
  key: string;
  testId?: string;
  label: string;
  count: number;
  to: string | null;
}

const attention = computed<AttentionRow[]>(() => {
  if (!ops.value) return [];
  return [
    { key: 'matching', label: 'Yêu cầu đang chờ thợ nhận', count: ops.value.matchingBookings, to: null },
    {
      key: 'replacements',
      testId: 'ops-replacements',
      label: 'Yêu cầu dừng sửa cần xử lý',
      count: ops.value.openReplacementCases ?? 0,
      to: isServiceManager.value ? '/console/support?caseType=technician_replacement&status=open' : null,
    },
    {
      key: 'cancellations',
      label: 'Huỷ đơn chờ xem xét',
      count: ops.value.pendingCancellations,
      to: isServiceManager.value ? '/console/cancellations' : null,
    },
    {
      key: 'no-departure',
      testId: 'ops-no-departure',
      label: 'Tự huỷ vì thợ không xuất phát, 7 ngày qua',
      count: ops.value.noDepartureCancellations7d ?? 0,
      to: isServiceManager.value ? '/console/cancellations' : null,
    },
  ];
});

const totalAttentionCount = computed(() =>
  attention.value.reduce((sum, item) => sum + item.count, 0),
);

// Format appointment datetime (e.g. 22/11/2026 14:00)
function formatAppointmentTime(row: ServiceOrderItem): string {
  const time = row.scheduledAt || row.createdAt;
  if (!time) return '—';
  try {
    const d = new Date(time);
    if (Number.isNaN(d.getTime())) return '—';
    return `${vnDateString(d)} ${vnTimeString(d)}`;
  } catch {
    return '—';
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 pb-12 font-sans">
    <!-- Header -->
    <header class="flex flex-col-reverse justify-between gap-4 sm:flex-row sm:items-center">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          Tổng quan
        </h1>
        <p class="text-sm text-ink-500">
          Theo dõi tình hình đơn dịch vụ và công việc cần xử lý
        </p>
      </div>

      <!-- Illustration on top right -->
      <AdminDashboardIllustration class="self-end sm:self-center" />
    </header>

    <!-- Loading Skeleton State -->
    <template v-if="loading && !ops">
      <!-- 4 KPI Skeletons -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="i in 4"
          :key="'kpi-skel-' + i"
          class="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-xs"
        >
          <FhSkeleton width="48px" height="48px" class="rounded-2xl shrink-0" />
          <div class="space-y-2 flex-1">
            <FhSkeleton height="12px" width="60%" />
            <FhSkeleton height="24px" width="40%" />
          </div>
        </div>
      </div>

      <!-- 2 Charts Skeletons -->
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs lg:col-span-7">
          <FhSkeleton height="20px" width="40%" class="mb-4" />
          <FhSkeleton height="180px" width="100%" />
        </div>
        <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs lg:col-span-5">
          <FhSkeleton height="20px" width="40%" class="mb-4" />
          <FhSkeleton height="180px" width="100%" />
        </div>
      </div>

      <!-- Table Skeleton -->
      <div class="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs">
        <FhSkeleton height="20px" width="30%" class="mb-4" />
        <FhSkeleton height="32px" :count="4" class="mt-2" />
      </div>
    </template>

    <!-- Error State -->
    <ConsoleLoadError v-else-if="loadError" class="animate-slide-up" @retry="loadDashboard" />

    <!-- Loaded Dashboard Content -->
    <template v-else-if="ops">
      <!-- B. Bốn thẻ thống kê (4 KPI Cards) -->
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Thống kê tổng quan đơn hàng"
      >
        <div
          v-for="kpi in kpiCards"
          :key="kpi.key"
          class="flex items-center gap-4.5 rounded-2xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) transition-all hover:shadow-(--shadow-e2)"
        >
          <!-- Icon container with system stroke width & tokens -->
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:scale-105"
            :class="kpi.iconBg"
          >
            <component :is="kpi.icon" :size="24" :stroke-width="2" aria-hidden="true" />
          </div>

          <!-- Labels and value -->
          <div class="min-w-0 flex-1">
            <span class="block text-xs font-medium text-ink-500 truncate">
              {{ kpi.label }}
            </span>
            <span class="mt-1 block font-num text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">
              {{ kpi.value }}
            </span>
          </div>
        </div>
      </section>

      <!-- Middle Section: C. Biến động đơn dịch vụ & D. Tình trạng đơn hàng -->
      <section class="grid grid-cols-1 gap-5 lg:grid-cols-12" aria-label="Biểu đồ phân tích đơn hàng">
        <!-- C. Biểu đồ đường biến động đơn dịch vụ (7 cols) -->
        <AdminOrderTrendChart
          :orders="allOrders"
          class="lg:col-span-7"
        />

        <!-- D. Biểu đồ donut tình trạng đơn hàng (5 cols) -->
        <AdminOrderStatusDonut
          :completed="completedCount"
          :active="activeCount"
          :cancelled="cancelledCount"
          class="lg:col-span-5"
        />
      </section>

      <!-- E. Bảng đơn hàng gần đây -->
      <section
        class="overflow-hidden rounded-2xl border border-ink-200/90 bg-white shadow-(--shadow-e1) transition-shadow hover:shadow-(--shadow-e2)"
        aria-label="Đơn hàng gần đây"
      >
        <!-- Card Header -->
        <div class="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div class="flex items-center gap-2">
            <Clock :size="18" :stroke-width="2" class="text-brand-600" aria-hidden="true" />
            <h2 class="text-base font-bold text-ink-900">Đơn hàng gần đây</h2>
          </div>

          <router-link
            to="/console/orders"
            class="group inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            <span>Xem tất cả</span>
            <ArrowRight
              :size="15"
              :stroke-width="2"
              class="transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </router-link>
        </div>

        <!-- Empty state -->
        <div v-if="recentOrders.length === 0" class="px-5 py-12 text-center text-sm text-ink-500">
          Không có đơn hàng gần đây.
        </div>

        <!-- Table Content -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-ink-100 bg-ink-50/70 text-xs font-semibold text-ink-600">
                <th scope="col" class="whitespace-nowrap px-5 py-3">Mã đơn</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3">Dịch vụ</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3">Khách hàng</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3">Kỹ thuật viên</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3">Thời gian hẹn</th>
                <th scope="col" class="whitespace-nowrap px-5 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr
                v-for="row in recentOrders"
                :key="row.id"
                class="transition-colors duration-150 hover:bg-brand-50/25"
              >
                <!-- Mã đơn -->
                <td class="whitespace-nowrap px-5 py-3.5">
                  <router-link
                    :to="`/console/orders/${row.id}`"
                    class="font-num font-semibold text-brand-600 transition-colors hover:text-brand-800 hover:underline"
                  >
                    {{ row.code }}
                  </router-link>
                </td>

                <!-- Dịch vụ -->
                <td class="px-4 py-3.5 text-ink-900 font-medium max-w-[220px]">
                  <div class="flex items-center gap-2.5">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100/80 bg-blue-50/50 p-1 overflow-hidden">
                      <img
                        :src="getServiceArtworkUrl({ name: row.serviceName })"
                        :alt="row.serviceName || 'Dịch vụ sửa chữa'"
                        class="h-full w-full object-contain select-none pointer-events-none"
                        loading="lazy"
                      />
                    </div>
                    <span class="line-clamp-1 truncate" :title="row.serviceName">
                      {{ row.serviceName || 'Dịch vụ sửa chữa' }}
                    </span>
                  </div>
                </td>

                <!-- Khách hàng -->
                <td class="whitespace-nowrap px-4 py-3.5 text-ink-800">
                  {{ row.customerName || '—' }}
                </td>

                <!-- Kỹ thuật viên -->
                <td class="whitespace-nowrap px-4 py-3.5 text-ink-800">
                  {{ row.technician?.fullName || '—' }}
                </td>

                <!-- Thời gian hẹn -->
                <td class="whitespace-nowrap px-4 py-3.5">
                  <div class="flex items-center gap-1.5 text-xs text-ink-700 font-num">
                    <Calendar :size="14" :stroke-width="1.8" class="text-ink-400 shrink-0" aria-hidden="true" />
                    <span>{{ formatAppointmentTime(row) }}</span>
                  </div>
                </td>

                <!-- Trạng thái: Synchronized with FhStatusPill system component -->
                <td class="whitespace-nowrap px-5 py-3.5">
                  <FhStatusPill :status="row.status" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Cần xử lý (Attention Section) - Retained for Service Manager workflows & test compatibility -->
      <section
        class="overflow-hidden rounded-2xl border border-ink-200/90 bg-white shadow-(--shadow-e1)"
        data-testid="ops-attention"
      >
        <div class="flex items-center justify-between border-b border-ink-100 bg-ink-50/70 px-5 py-3.5">
          <div class="flex items-center gap-2">
            <AlertCircle :size="16" :stroke-width="2" class="text-warning-600" aria-hidden="true" />
            <h2 class="text-sm font-bold text-ink-900">Cần xử lý</h2>
          </div>
          <span
            v-if="totalAttentionCount > 0"
            class="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700 border border-warning-200/80 font-num"
          >
            {{ totalAttentionCount }} việc cần xử lý
          </span>
        </div>

        <ul class="divide-y divide-ink-100">
          <li v-for="row in attention" :key="row.key">
            <router-link
              v-if="row.to"
              :to="row.to"
              class="group flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-brand-50/25 focus:outline-none focus-visible:bg-brand-50/25"
              :data-testid="row.testId"
            >
              <span class="min-w-0 flex-1 text-xs sm:text-sm font-medium text-ink-700 group-hover:text-ink-900">
                {{ row.label }}
              </span>
              <span
                class="shrink-0 inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 font-num text-xs font-semibold"
                :class="row.count > 0 ? 'bg-warning-50 text-warning-700 border border-warning-200/80' : 'text-ink-400'"
              >
                {{ row.count }}
              </span>
              <ChevronRight
                :size="15"
                :stroke-width="2"
                class="shrink-0 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600"
                aria-hidden="true"
              />
            </router-link>
            <div v-else class="flex items-center gap-3 px-5 py-3" :data-testid="row.testId">
              <span class="min-w-0 flex-1 text-xs sm:text-sm text-ink-700">
                {{ row.label }}
              </span>
              <span
                class="shrink-0 inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 font-num text-xs font-semibold"
                :class="row.count > 0 ? 'bg-warning-50 text-warning-700 border border-warning-200/80' : 'text-ink-400'"
              >
                {{ row.count }}
              </span>
              <span class="w-4 shrink-0" aria-hidden="true" />
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
