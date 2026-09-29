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
  Box
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
  <div class="dashboard-container">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="header-content">
        <h1 class="header-title">
          <span class="gradient-text">Bảng điều khiển vận hành</span> FixHome
        </h1>
        <p class="header-subtitle">
          Giám sát trực tiếp các trạng thái ServiceOrder và xử lý ngoại lệ trong thời gian thực.
        </p>
      </div>
      <div class="header-actions">
        <button class="premium-btn primary-btn" @click="router.push('/console/orders')">
          <KanbanSquare :size="18" class="btn-icon" />
          <span>Xem Kanban Board</span>
        </button>
      </div>
    </header>

    <!-- Loading skeleton -->
    <div v-if="loading" class="stats-grid">
      <div v-for="i in 4" :key="i" class="stat-card skeleton-card">
        <FhSkeleton height="12px" width="60%" />
        <FhSkeleton height="28px" width="40%" class="mt-3" />
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="loadError" class="error-container">
      <FhEmptyState
        title="Không tải được bảng điều khiển"
        :description="loadError"
        action-text="Thử lại"
        @action="loadDashboard"
      />
    </div>

    <template v-else-if="ops">
      <!-- 4 Stats Cards with Premium UI -->
      <div class="stats-grid">
        <div class="premium-stat-card card-blue">
          <div class="stat-icon-wrapper">
            <Activity :size="24" class="stat-icon" />
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Đơn đang hoạt động</h3>
            <div class="stat-value">{{ ops.activeOrders }}</div>
            <div class="stat-label">số liệu hiện tại</div>
          </div>
          <div class="stat-glow"></div>
        </div>

        <div class="premium-stat-card card-orange">
          <div class="stat-icon-wrapper">
            <Users :size="24" class="stat-icon" />
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Booking chờ ghép thợ</h3>
            <div class="stat-value">{{ ops.matchingBookings }}</div>
            <div class="stat-label">số liệu hiện tại</div>
          </div>
          <div class="stat-glow"></div>
        </div>

        <div class="premium-stat-card card-red">
          <div class="stat-icon-wrapper">
            <XCircle :size="24" class="stat-icon" />
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Huỷ đơn chờ đối soát</h3>
            <div class="stat-value">{{ ops.pendingCancellations }}</div>
            <div class="stat-label">cần SM xử lý</div>
          </div>
          <div class="stat-glow"></div>
        </div>

        <div class="premium-stat-card card-purple">
          <div class="stat-icon-wrapper">
            <Box :size="24" class="stat-icon" />
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Tổng đơn hệ thống</h3>
            <div class="stat-value">{{ ops.ordersByStatus.reduce((sum, s) => sum + Number(s.count), 0) }}</div>
            <div class="stat-label">tất cả trạng thái</div>
          </div>
          <div class="stat-glow"></div>
        </div>
      </div>

      <!-- Alert / Escalation Notice -->
      <div v-if="ops.matchingBookings > 0" class="premium-alert">
        <div class="alert-glow"></div>
        <div class="alert-content">
          <div class="alert-icon-wrapper pulse-animation">
            <AlertTriangle :size="22" class="alert-icon" />
          </div>
          <div class="alert-text">
            <h4 class="alert-title">Cảnh báo vận hành khẩn cấp</h4>
            <p class="alert-desc">Có <strong>{{ ops.matchingBookings }} Booking</strong> đang chờ ghép thợ. Service Manager cần kiểm tra và gán thợ thủ công ngay lập tức.</p>
          </div>
        </div>
        <button class="premium-btn secondary-btn" @click="router.push('/console/bookings')">
          Gán thợ ngay
        </button>
      </div>

      <!-- Active Orders Management Table -->
      <div class="table-section">
        <div class="section-header">
          <h2 class="section-title">Đơn hàng cần giám sát</h2>
          <router-link to="/console/orders" class="view-all-link">
            <span>Mở toàn bộ danh sách</span>
            <ArrowRight :size="16" class="link-icon" />
          </router-link>
        </div>

        <div class="table-container">
          <FhEmptyState
            v-if="watchOrders.length === 0"
            title="Không có đơn nào đang hoạt động"
            description="Hiện chưa có đơn hàng nào ở trạng thái cần giám sát."
          />
          <FhTable v-else :columns="columns" :rows="watchOrders" class="premium-table">
            <template #cell(code)="{ value }">
              <span class="order-code">{{ value }}</span>
            </template>
            <template #cell(customer)="{ row }">
              <span class="cell-text font-medium">{{ row.customerName }}</span>
            </template>
            <template #cell(technician)="{ row }">
              <span class="cell-text text-muted">{{ row.technician?.fullName || '—' }}</span>
            </template>
            <template #cell(service)="{ row }">
              <span class="cell-text">{{ row.serviceName }}</span>
            </template>
            <template #cell(status)="{ value }">
              <FhStatusPill :status="String(value)" />
            </template>
            <template #cell(action)="{ row }">
              <button class="action-btn" @click="router.push(`/console/orders/${row.id}`)">
                Chi tiết
              </button>
            </template>
          </FhTable>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Base Container */
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 1rem 0;
  font-family: 'Inter', 'Outfit', 'Roboto', sans-serif;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Header Section */
.dashboard-header {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;
  border-radius: 1.25rem;
  background: linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(252,253,255,0.7) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 1);
  position: relative;
  overflow: hidden;
}

@media (min-width: 640px) {
  .dashboard-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.dashboard-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
}

.header-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 0.5rem;
  letter-spacing: -0.025em;
}

.gradient-text {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-subtitle {
  font-size: 0.95rem;
  color: #64748b;
  line-height: 1.5;
}

/* Premium Buttons */
.premium-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  position: relative;
  overflow: hidden;
}

.premium-btn.primary-btn {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.premium-btn.primary-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.premium-btn.primary-btn:active {
  transform: translateY(0);
}

.premium-btn.secondary-btn {
  background: white;
  color: #ea580c;
  border: 1px solid #fed7aa;
  box-shadow: 0 2px 8px rgba(234, 88, 12, 0.1);
}

.premium-btn.secondary-btn:hover {
  background: #fff7ed;
  border-color: #f97316;
  transform: translateY(-1px);
}

.btn-icon {
  transition: transform 0.3s ease;
}

.premium-btn:hover .btn-icon {
  transform: scale(1.1);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.5rem;
}

@media (min-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Premium Stat Cards */
.premium-stat-card {
  position: relative;
  background: white;
  border-radius: 1.25rem;
  padding: 1.5rem;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  z-index: 1;
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 140px;
  background: white;
  border-radius: 1.25rem;
  padding: 1.5rem;
  border: 1px solid rgba(226, 232, 240, 0.8);
}

.premium-stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 35px -10px rgba(0, 0, 0, 0.1);
  border-color: rgba(226, 232, 240, 1);
}

.stat-glow {
  position: absolute;
  top: -50%;
  right: -50%;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, var(--glow-color) 0%, rgba(255,255,255,0) 70%);
  opacity: 0.15;
  border-radius: 50%;
  transition: all 0.6s ease;
  z-index: -1;
}

.premium-stat-card:hover .stat-glow {
  transform: scale(1.5);
  opacity: 0.25;
}

.stat-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  background: var(--icon-bg);
  color: var(--icon-color);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 4px 10px var(--icon-shadow);
}

.card-blue {
  --glow-color: #3b82f6;
  --icon-bg: linear-gradient(135deg, #eff6ff, #dbeafe);
  --icon-color: #2563eb;
  --icon-shadow: rgba(37, 99, 235, 0.15);
}

.card-orange {
  --glow-color: #f97316;
  --icon-bg: linear-gradient(135deg, #fff7ed, #ffedd5);
  --icon-color: #ea580c;
  --icon-shadow: rgba(234, 88, 12, 0.15);
}

.card-red {
  --glow-color: #ef4444;
  --icon-bg: linear-gradient(135deg, #fef2f2, #fee2e2);
  --icon-color: #dc2626;
  --icon-shadow: rgba(220, 38, 38, 0.15);
}

.card-purple {
  --glow-color: #8b5cf6;
  --icon-bg: linear-gradient(135deg, #f5f3ff, #ede9fe);
  --icon-color: #7c3aed;
  --icon-shadow: rgba(124, 58, 237, 0.15);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
  margin: 0;
}

.stat-value {
  font-size: 2.25rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  letter-spacing: -0.05em;
}

.stat-label {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
}

.mt-3 { margin-top: 0.75rem; }

/* Alert Section */
.premium-alert {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(to right, #fff7ed, #fff);
  border: 1px solid #fdba74;
  border-left: 4px solid #ea580c;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(234, 88, 12, 0.05);
}

@media (min-width: 640px) {
  .premium-alert {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.alert-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(234, 88, 12, 0.05) 0%, transparent 100%);
  pointer-events: none;
}

.alert-content {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  z-index: 1;
}

.alert-icon-wrapper {
  background: #ffedd5;
  color: #ea580c;
  padding: 0.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pulse-animation {
  animation: pulseWarning 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
}

@keyframes pulseWarning {
  0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
  50% { opacity: 0.8; transform: scale(1.05); box-shadow: 0 0 0 10px rgba(234, 88, 12, 0); }
}

.alert-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.alert-title {
  font-weight: 700;
  color: #9a3412;
  margin: 0;
  font-size: 1rem;
}

.alert-desc {
  font-size: 0.875rem;
  color: #c2410c;
  margin: 0;
  line-height: 1.5;
}

/* Table Section */
.table-section {
  background: white;
  border-radius: 1.25rem;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  background: rgba(248, 250, 252, 0.5);
}

.section-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.view-all-link {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #3b82f6;
  text-decoration: none;
  transition: all 0.2s ease;
}

.view-all-link:hover {
  color: #2563eb;
}

.view-all-link:hover .link-icon {
  transform: translateX(4px);
}

.link-icon {
  transition: transform 0.2s ease;
}

.table-container {
  padding: 0;
}

/* Custom Table Styles override */
.premium-table {
  width: 100%;
}

.order-code {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-weight: 700;
  color: #334155;
  background: #f1f5f9;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
}

.font-medium { font-weight: 500; }
.text-muted { color: #64748b; }
.cell-text {
  font-size: 0.9rem;
  color: #334155;
}

.action-btn {
  background: transparent;
  border: 1px solid #e2e8f0;
  color: #475569;
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}

.error-container {
  padding: 2rem;
  background: white;
  border-radius: 1.25rem;
  border: 1px dashed #cbd5e1;
}
</style>
