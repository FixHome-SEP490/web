<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  KanbanSquare,
  AlertTriangle,
  ArrowRight,
} from 'lucide-vue-next';
import {
  FhButton,
  FhStatCard,
  FhStatusPill,
  FhTable,
  FhSkeleton,
  FhEmptyState,
  type TableColumn,
} from '../../components';
import { dashboardApi, type OperationalDashboard } from '../../api/dashboard.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';

const router = useRouter();

const columns: TableColumn[] = [
  { key: 'code', label: 'Mã đơn', width: '130px' },
  { key: 'customer', label: 'Khách hàng' },
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'service', label: 'Dịch vụ' },
  { key: 'status', label: 'Trạng thái', width: '150px' },
  { key: 'action', label: 'Thao tác', align: 'right', width: '100px' },
];

const loading = ref(true);
const loadError = ref('');
const ops = ref<OperationalDashboard | null>(null);
const watchOrders = ref<ServiceOrderItem[]>([]);

function flat(value: number): number[] {
  return [value, value];
}

async function loadDashboard() {
  loading.value = true;
  loadError.value = '';
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
    loadError.value = 'Không thể tải dữ liệu bảng điều khiển. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-[var(--radius-md)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight">
          Bảng điều khiển vận hành FixHome
        </h1>
        <p class="text-sm text-ink-500">
          Giám sát 5 trạng thái ServiceOrder chuẩn và xử lý các trường hợp ngoại lệ trong ngày.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <FhButton variant="primary" size="md" @click="router.push('/console/orders')">
          <KanbanSquare :size="16" />
          Xem Kanban Board
        </FhButton>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div v-for="i in 4" :key="i" class="p-5 bg-white rounded-[var(--radius-md)] border border-ink-200 space-y-3">
        <FhSkeleton height="12px" width="60%" />
        <FhSkeleton height="28px" width="40%" />
      </div>
    </div>

    <!-- Error state -->
    <FhEmptyState
      v-else-if="loadError"
      title="Không tải được bảng điều khiển"
      :description="loadError"
      action-text="Thử lại"
      @action="loadDashboard"
    />

    <template v-else-if="ops">
      <!-- 4 Stats Cards — số liệu thời điểm hiện tại từ /dashboard/operations, chưa có dữ liệu lịch sử để tính xu hướng -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <FhStatCard
          title="Đơn đang hoạt động"
          :value="ops.activeOrders"
          :delta="0"
          delta-label="số liệu hiện tại"
          :sparkline-data="flat(ops.activeOrders)"
        />
        <FhStatCard
          title="Booking chờ ghép thợ"
          :value="ops.matchingBookings"
          :delta="0"
          delta-label="số liệu hiện tại"
          :sparkline-data="flat(ops.matchingBookings)"
        />
        <FhStatCard
          title="Huỷ đơn chờ đối soát"
          :value="ops.pendingCancellations"
          :delta="0"
          delta-label="cần SM xử lý"
          :sparkline-data="flat(ops.pendingCancellations)"
        />
        <FhStatCard
          title="Tổng đơn hệ thống"
          :value="ops.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0)"
          :delta="0"
          delta-label="tất cả trạng thái"
          :sparkline-data="flat(ops.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0))"
        />
      </div>

      <!-- Alert / Escalation Notice -->
      <div v-if="ops.matchingBookings > 0" class="p-4 rounded-[var(--radius-md)] bg-warning-50 border border-warning-200 flex items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <AlertTriangle :size="20" class="text-warning-600 shrink-0 mt-0.5" />
          <div class="space-y-0.5 text-xs text-warning-900">
            <p class="font-bold">Cảnh báo vận hành:</p>
            <p>Có {{ ops.matchingBookings }} Booking đang chờ ghép thợ. Service Manager cần kiểm tra và gán thợ thủ công nếu đã hết lượt mời tuần tự.</p>
          </div>
        </div>
        <FhButton variant="secondary" size="sm" class="shrink-0" @click="router.push('/console/bookings')">
          Gán thợ ngay
        </FhButton>
      </div>

      <!-- Active Orders Management Table -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-ink-900">Đơn hàng cần giám sát</h2>
          <router-link to="/console/orders" class="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
            Mở toàn bộ danh sách <ArrowRight :size="14" />
          </router-link>
        </div>

        <FhEmptyState
          v-if="watchOrders.length === 0"
          title="Không có đơn nào đang hoạt động"
          description="Hiện chưa có đơn hàng nào ở trạng thái cần giám sát."
        />
        <FhTable v-else :columns="columns" :rows="watchOrders">
          <template #cell(code)="{ value }">
            <span class="font-num font-bold text-ink-800">{{ value }}</span>
          </template>
          <template #cell(customer)="{ row }">
            {{ row.customerName }}
          </template>
          <template #cell(technician)="{ row }">
            {{ row.technician?.fullName || '—' }}
          </template>
          <template #cell(service)="{ row }">
            {{ row.serviceName }}
          </template>
          <template #cell(status)="{ value }">
            <FhStatusPill :status="String(value)" />
          </template>
          <template #cell(action)="{ row }">
            <FhButton variant="ghost" size="sm" @click="router.push(`/console/orders/${row.id}`)">
              Chi tiết
            </FhButton>
          </template>
        </FhTable>
      </div>
    </template>
  </div>
</template>
