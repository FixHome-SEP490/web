<script setup lang="ts">
import { computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { FhSkeleton, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import { useAuthStore } from '../../stores/auth';
import { useCachedQuery } from '../../composables/useCachedQuery';
import { sharedQueries } from '../../lib/queries';

const authStore = useAuthStore();
// Support and cancellations are the service manager's pages; the admin sees the counts only.
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');

// Counts and the orders to watch, cached together: a return visit shows them at
// once and reads them again in the background.
const dashboardQuery = useCachedQuery(sharedQueries.consoleDashboard);
const loading = dashboardQuery.loading;
const loadError = computed(() => !!dashboardQuery.error.value);
const ops = computed(() => dashboardQuery.data.value?.ops ?? null);
const watchOrders = computed(() => dashboardQuery.data.value?.watchOrders ?? []);

function loadDashboard() {
  void dashboardQuery.refetch();
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

</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 pb-10">
    <ConsolePageHeader class="animate-slide-up" title="Tổng quan" />

    <!-- Loading: same shape as the KPI row and the two lists -->
    <template v-if="loading">
      <div class="animate-slide-up-delay-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="i in 4" :key="i" class="rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1)">
          <FhSkeleton height="12px" width="50%" />
          <FhSkeleton height="24px" width="30%" class="mt-3" />
        </div>
      </div>
      <div class="animate-slide-up-delay-2 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1)">
        <FhSkeleton height="14px" width="20%" />
        <FhSkeleton height="16px" :count="4" class="mt-4" />
      </div>
    </template>

    <ConsoleLoadError v-else-if="loadError" class="animate-slide-up-delay-1" @retry="loadDashboard" />

    <template v-else-if="ops">
      <section class="animate-slide-up-delay-1 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Số đơn">
        <div
          v-for="kpi in kpis"
          :key="kpi.key"
          class="rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1)"
        >
          <div class="whitespace-nowrap text-xs font-medium text-ink-500">{{ kpi.label }}</div>
          <div class="mt-1.5 font-num text-2xl font-bold tracking-tight text-ink-900">{{ kpi.value }}</div>
        </div>
      </section>

      <section class="animate-slide-up-delay-2 overflow-hidden rounded-[var(--radius-md)] border border-ink-200/90 bg-white shadow-(--shadow-e1)" data-testid="ops-attention">
        <h2 class="border-b border-ink-100 bg-ink-50/70 px-5 py-3.5 text-base font-semibold text-ink-900">Cần xử lý</h2>
        <ul class="divide-y divide-ink-100">
          <li v-for="row in attention" :key="row.key">
            <router-link
              v-if="row.to"
              :to="row.to"
              class="group flex items-center gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-brand-50/35 focus:outline-none focus-visible:bg-brand-50/35"
              :data-testid="row.testId"
            >
              <span class="min-w-0 flex-1 text-sm font-medium text-ink-800 group-hover:text-ink-900">{{ row.label }}</span>
              <span
                class="shrink-0 inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 font-num text-sm font-semibold"
                :class="row.count > 0 ? 'bg-warning-50 text-warning-700 border border-warning-200/80' : 'text-ink-400'"
              >{{ row.count }}</span>
              <ChevronRight :size="16" class="shrink-0 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden="true" />
            </router-link>
            <div v-else class="flex items-center gap-3 px-5 py-3.5" :data-testid="row.testId">
              <span class="min-w-0 flex-1 text-sm text-ink-800">{{ row.label }}</span>
              <span
                class="shrink-0 inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 font-num text-sm font-semibold"
                :class="row.count > 0 ? 'bg-warning-50 text-warning-700 border border-warning-200/80' : 'text-ink-400'"
              >{{ row.count }}</span>
              <span class="w-4 shrink-0" aria-hidden="true" />
            </div>
          </li>
        </ul>
      </section>

      <section class="animate-slide-up-delay-3 overflow-hidden rounded-[var(--radius-md)] border border-ink-200/90 bg-white shadow-(--shadow-e1)">
        <div class="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-3.5">
          <h2 class="text-base font-semibold text-ink-900">Đơn đang thực hiện</h2>
          <router-link to="/console/orders" class="whitespace-nowrap text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline">
            Xem tất cả
          </router-link>
        </div>
        <p v-if="watchOrders.length === 0" class="px-5 py-10 text-center text-sm text-ink-500">
          Không có đơn nào đang thực hiện.
        </p>
        <div v-else class="overflow-x-auto overscroll-x-contain">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-ink-200/80 bg-ink-50/90 text-xs font-semibold text-ink-600">
                <th scope="col" class="whitespace-nowrap px-5 py-3">Mã đơn</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3">Dịch vụ</th>
                <th scope="col" class="hidden whitespace-nowrap px-4 py-3 xl:table-cell">Khách hàng</th>
                <th scope="col" class="hidden whitespace-nowrap px-4 py-3 xl:table-cell">Kỹ thuật viên</th>
                <th scope="col" class="whitespace-nowrap px-5 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr v-for="row in watchOrders" :key="row.id" class="transition-[background-color] duration-150 hover:bg-brand-50/35">
                <td class="whitespace-nowrap px-5 py-3">
                  <router-link :to="`/console/orders/${row.id}`" class="font-num font-semibold text-brand-700 hover:underline">{{ row.code }}</router-link>
                </td>
                <td class="px-4 py-3 text-ink-900"><span class="line-clamp-1" :title="row.serviceName">{{ row.serviceName }}</span></td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-ink-700 xl:table-cell">{{ row.customerName }}</td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-ink-700 xl:table-cell">{{ row.technician?.fullName || '—' }}</td>
                <td class="whitespace-nowrap px-5 py-3"><FhStatusPill :status="String(row.status)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
