<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { FhSkeleton, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import { dashboardApi, type OperationalDashboard } from '../../api/dashboard.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
// Support and cancellations are the service manager's pages; the admin sees the counts only.
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const loading = ref(true);
const loadError = ref(false);
const ops = ref<OperationalDashboard | null>(null);
const watchOrders = ref<ServiceOrderItem[]>([]);

async function loadDashboard() {
  loading.value = true;
  loadError.value = false;
  try {
    const [opsData, orders] = await Promise.all([
      dashboardApi.getOperational(),
      ordersApi.getConsoleOrders(),
    ]);
    ops.value = opsData;
    watchOrders.value = orders
      .filter((o) => ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'].includes(o.status))
      .slice(0, 5);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

const countOf = (status: string) =>
  Number(ops.value?.ordersByStatus.find((s) => s.status.toLowerCase() === status)?.count ?? 0);

const kpis = computed(() => {
  if (!ops.value) return [];
  return [
    { key: 'total', label: 'Tổng đơn', value: ops.value.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0) },
    { key: 'active', label: 'Đang thực hiện', value: ops.value.activeOrders },
    { key: 'completed', label: 'Hoàn thành', value: countOf('completed') },
    { key: 'cancelled', label: 'Đã huỷ', value: countOf('cancelled') },
  ];
});

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
    { key: 'matching', label: 'Yêu cầu chờ ghép thợ', count: ops.value.matchingBookings, to: '/console/bookings' },
    {
      key: 'replacements',
      testId: 'ops-replacements',
      label: 'Cần thay đổi thợ',
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

onMounted(loadDashboard);
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 pb-10">
    <ConsolePageHeader title="Tổng quan" />

    <!-- Loading: same shape as the KPI row and the two lists -->
    <template v-if="loading">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="i in 4" :key="i" class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
          <FhSkeleton height="12px" width="50%" />
          <FhSkeleton height="24px" width="30%" class="mt-3" />
        </div>
      </div>
      <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
        <FhSkeleton height="14px" width="20%" />
        <FhSkeleton height="16px" :count="4" class="mt-4" />
      </div>
    </template>

    <ConsoleLoadError v-else-if="loadError" @retry="loadDashboard" />

    <template v-else-if="ops">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Số đơn">
        <div
          v-for="kpi in kpis"
          :key="kpi.key"
          class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4"
        >
          <div class="whitespace-nowrap text-sm text-ink-500">{{ kpi.label }}</div>
          <div class="mt-1 font-num text-2xl font-semibold text-ink-900">{{ kpi.value }}</div>
        </div>
      </section>

      <section class="overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white" data-testid="ops-attention">
        <h2 class="border-b border-ink-100 px-5 py-3.5 text-base font-semibold text-ink-900">Cần xử lý</h2>
        <ul class="divide-y divide-ink-100">
          <li v-for="row in attention" :key="row.key">
            <router-link
              v-if="row.to"
              :to="row.to"
              class="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50 focus:outline-none focus-visible:bg-ink-50"
              :data-testid="row.testId"
            >
              <span class="min-w-0 flex-1 text-sm text-ink-800">{{ row.label }}</span>
              <span
                class="shrink-0 font-num text-base font-semibold"
                :class="row.count > 0 ? 'text-warning-700' : 'text-ink-400'"
              >{{ row.count }}</span>
              <ChevronRight :size="16" class="shrink-0 text-ink-400" aria-hidden="true" />
            </router-link>
            <div v-else class="flex items-center gap-3 px-5 py-3.5" :data-testid="row.testId">
              <span class="min-w-0 flex-1 text-sm text-ink-800">{{ row.label }}</span>
              <span
                class="shrink-0 font-num text-base font-semibold"
                :class="row.count > 0 ? 'text-warning-700' : 'text-ink-400'"
              >{{ row.count }}</span>
              <span class="w-4 shrink-0" aria-hidden="true" />
            </div>
          </li>
        </ul>
      </section>

      <section class="overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white">
        <div class="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <h2 class="text-base font-semibold text-ink-900">Đơn đang thực hiện</h2>
          <router-link to="/console/orders" class="whitespace-nowrap text-sm font-medium text-brand-600 hover:text-brand-700">
            Xem tất cả
          </router-link>
        </div>
        <p v-if="watchOrders.length === 0" class="px-5 py-8 text-center text-sm text-ink-500">
          Không có đơn nào đang thực hiện.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-ink-500">
              <tr class="border-b border-ink-100">
                <th class="px-5 py-2.5 font-medium">Mã đơn</th>
                <th class="px-5 py-2.5 font-medium">Dịch vụ</th>
                <th class="hidden px-5 py-2.5 font-medium xl:table-cell">Khách hàng</th>
                <th class="hidden px-5 py-2.5 font-medium xl:table-cell">Kỹ thuật viên</th>
                <th class="px-5 py-2.5 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr v-for="row in watchOrders" :key="row.id" class="hover:bg-ink-50">
                <td class="whitespace-nowrap px-5 py-3">
                  <router-link :to="`/console/orders/${row.id}`" class="font-num font-medium text-brand-700 hover:underline">{{ row.code }}</router-link>
                </td>
                <td class="px-5 py-3 text-ink-900"><span class="line-clamp-1" :title="row.serviceName">{{ row.serviceName }}</span></td>
                <td class="hidden whitespace-nowrap px-5 py-3 text-ink-700 xl:table-cell">{{ row.customerName }}</td>
                <td class="hidden whitespace-nowrap px-5 py-3 text-ink-700 xl:table-cell">{{ row.technician?.fullName || '—' }}</td>
                <td class="whitespace-nowrap px-5 py-3"><FhStatusPill :status="String(row.status)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
