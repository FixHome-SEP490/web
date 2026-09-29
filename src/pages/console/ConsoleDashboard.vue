<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  KanbanSquare,
  AlertTriangle,
  ArrowRight,
  Activity,
  Users,
  XCircle,
  Box,
  ShieldAlert
} from 'lucide-vue-next';
import {
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
  <div class="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-10">
    <!-- Top Hero Command Bar -->
    <div class="bg-white border border-ink-200/80 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden">
      <!-- Subtle Decorative Blobs -->
      <div class="absolute -right-16 -top-16 w-64 h-64 bg-brand-100/60 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -left-16 -bottom-16 w-64 h-64 bg-amber-50 rounded-full blur-3xl pointer-events-none" />
      
      <div class="relative z-10 space-y-2">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 text-xs font-bold text-brand-700 border border-brand-200/60 shadow-xs">
          <ShieldAlert :size="14" />
          <span>Console Vận Hành</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-black text-ink-900 tracking-tight">
          Bảng điều khiển <span class="text-brand-600">FixHome</span>
        </h1>
        <p class="text-sm text-ink-500 max-w-lg font-medium">
          Giám sát trực tiếp các trạng thái ServiceOrder và xử lý ngoại lệ trong thời gian thực.
        </p>
      </div>
      
      <div class="relative z-10 shrink-0">
        <button 
          class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow-md shadow-brand-500/20 transition-all flex items-center gap-2 group focus:outline-none focus:ring-4 focus:ring-brand-500/20"
          @click="router.push('/console/orders')"
        >
          <KanbanSquare :size="18" class="group-hover:scale-110 transition-transform" />
          <span>Xem Kanban Board</span>
        </button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <div v-for="i in 4" :key="i" class="bg-white rounded-3xl border border-ink-200 p-5 min-h-[140px] flex flex-col justify-end">
        <FhSkeleton height="12px" width="60%" />
        <FhSkeleton height="28px" width="40%" />
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="loadError" class="p-8 bg-white rounded-3xl border border-dashed border-ink-300">
      <FhEmptyState
        title="Không tải được bảng điều khiển"
        :description="loadError"
        action-text="Thử lại"
        @action="loadDashboard"
      />
    </div>

    <template v-else-if="ops">
      <!-- Operational Pipeline Bar -->
      <div class="bg-white rounded-3xl border border-ink-200/90 shadow-xs p-6 sm:p-8 relative overflow-hidden">
        <div class="flex flex-col sm:flex-row items-center justify-between relative z-10">
          
          <!-- Shared Connecting Line (Desktop) -->
          <div class="hidden sm:block absolute top-[28px] left-[10%] right-[10%] h-[3px] bg-ink-100 rounded-full -z-10"></div>
          
          <!-- Step 1: Tổng đơn -->
          <div class="flex-1 flex flex-col items-center text-center group cursor-default w-full sm:w-auto">
            <div class="w-14 h-14 rounded-2xl bg-white text-purple-600 flex items-center justify-center shadow-sm border border-purple-200 mb-4 group-hover:-translate-y-1 group-hover:shadow-md group-hover:border-purple-300 transition-all">
              <Box :size="24" />
            </div>
            <div class="text-3xl font-black text-ink-900 font-num tracking-tight">{{ ops.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0) }}</div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-ink-500 mt-1">Tổng đơn hệ thống</div>
          </div>
          
          <!-- Connector -->
          <div class="hidden sm:flex items-center justify-center text-ink-300 shrink-0 px-2">
            <ArrowRight :size="20" />
          </div>
          
          <!-- Step 2: Chờ ghép thợ -->
          <div class="flex-1 flex flex-col items-center text-center group cursor-default w-full sm:w-auto mt-8 sm:mt-0 border-t border-ink-100 sm:border-0 pt-8 sm:pt-0">
            <div class="w-14 h-14 rounded-2xl bg-white text-amber-500 flex items-center justify-center shadow-sm border border-amber-200 mb-4 group-hover:-translate-y-1 group-hover:shadow-md group-hover:border-amber-300 transition-all relative">
              <div v-if="ops.matchingBookings > 0" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-ping"></div>
              <div v-if="ops.matchingBookings > 0" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
              <Users :size="24" />
            </div>
            <div class="text-3xl font-black font-num tracking-tight" :class="ops.matchingBookings > 0 ? 'text-amber-600' : 'text-ink-900'">{{ ops.matchingBookings }}</div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-ink-500 mt-1">Chờ ghép thợ</div>
          </div>

          <!-- Connector -->
          <div class="hidden sm:flex items-center justify-center text-ink-300 shrink-0 px-2">
            <ArrowRight :size="20" />
          </div>
          
          <!-- Step 3: Đơn đang hoạt động -->
          <div class="flex-1 flex flex-col items-center text-center group cursor-default w-full sm:w-auto mt-8 sm:mt-0 border-t border-ink-100 sm:border-0 pt-8 sm:pt-0">
            <div class="w-14 h-14 rounded-2xl bg-white text-blue-500 flex items-center justify-center shadow-sm border border-blue-200 mb-4 group-hover:-translate-y-1 group-hover:shadow-md group-hover:border-blue-300 transition-all">
              <Activity :size="24" />
            </div>
            <div class="text-3xl font-black text-ink-900 font-num tracking-tight">{{ ops.activeOrders }}</div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-ink-500 mt-1">Đơn đang hoạt động</div>
          </div>

          <!-- Connector -->
          <div class="hidden sm:flex items-center justify-center text-ink-300 shrink-0 px-2">
            <ArrowRight :size="20" />
          </div>
          
          <!-- Step 4: Huỷ chờ đối soát -->
          <div class="flex-1 flex flex-col items-center text-center group cursor-default w-full sm:w-auto mt-8 sm:mt-0 border-t border-ink-100 sm:border-0 pt-8 sm:pt-0">
            <div class="w-14 h-14 rounded-2xl bg-white text-rose-500 flex items-center justify-center shadow-sm border border-rose-200 mb-4 group-hover:-translate-y-1 group-hover:shadow-md group-hover:border-rose-300 transition-all relative">
              <div v-if="ops.pendingCancellations > 0" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
              <XCircle :size="24" />
            </div>
            <div class="text-3xl font-black font-num tracking-tight" :class="ops.pendingCancellations > 0 ? 'text-rose-600' : 'text-ink-900'">{{ ops.pendingCancellations }}</div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-ink-500 mt-1">Huỷ chờ đối soát</div>
          </div>
        </div>
      </div>

      <!-- Alert / Escalation Notice -->
      <div v-if="ops.matchingBookings > 0" class="relative overflow-hidden bg-gradient-to-r from-amber-50 to-white border border-amber-300 border-l-4 border-l-amber-500 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-start gap-4 z-10">
          <div class="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-inner animate-pulse">
            <AlertTriangle :size="24" />
          </div>
          <div class="space-y-1 mt-0.5">
            <h4 class="text-base font-bold text-amber-900">Cảnh báo vận hành khẩn cấp</h4>
            <p class="text-sm text-amber-800">Có <strong class="font-bold">{{ ops.matchingBookings }} Booking</strong> đang chờ ghép thợ. Service Manager cần kiểm tra và gán thợ thủ công ngay lập tức.</p>
          </div>
        </div>
        <button 
          class="shrink-0 px-5 py-2.5 rounded-xl bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 font-bold text-sm shadow-sm transition-colors z-10"
          @click="router.push('/console/bookings')"
        >
          Gán thợ ngay
        </button>
      </div>

      <!-- Active Orders Management Table -->
      <div class="bg-white rounded-3xl border border-ink-200/90 shadow-xs overflow-hidden flex flex-col">
        <div class="p-5 sm:p-6 border-b border-ink-100 flex items-center justify-between bg-ink-50/50">
          <h2 class="text-base sm:text-lg font-black text-ink-900 tracking-tight">
            Đơn hàng cần giám sát
          </h2>
          <router-link to="/console/orders" class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
            <span>Mở toàn bộ danh sách</span>
            <ArrowRight :size="14" />
          </router-link>
        </div>

        <div class="p-0">
          <FhEmptyState
            v-if="watchOrders.length === 0"
            title="Không có đơn nào đang hoạt động"
            description="Hiện chưa có đơn hàng nào ở trạng thái cần giám sát."
          />
          <FhTable v-else :columns="columns" :rows="watchOrders" class="w-full">
            <template #cell-code="{ row }">
              <span class="font-mono text-xs font-bold text-ink-700 bg-ink-100 px-2 py-0.5 rounded-md">{{ row.code }}</span>
            </template>
            <template #cell-customer="{ row }">
              <span class="text-sm font-medium text-ink-900">{{ row.customerName }}</span>
            </template>
            <template #cell-technician="{ row }">
              <span class="text-sm text-ink-500">{{ row.technician?.fullName || '—' }}</span>
            </template>
            <template #cell-service="{ row }">
              <span class="text-sm text-ink-900">{{ row.serviceName }}</span>
            </template>
            <template #cell-status="{ row }">
              <FhStatusPill :status="String(row.status)" />
            </template>
            <template #cell-action="{ row }">
              <button 
                class="px-3 py-1.5 rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900 text-xs font-bold transition-colors" 
                @click="router.push(`/console/orders/${row.id}`)"
              >
                Chi tiết
              </button>
            </template>
          </FhTable>
        </div>
      </div>
    </template>
  </div>
</template>
