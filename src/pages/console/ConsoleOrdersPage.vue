<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { KanbanSquare, Eye } from 'lucide-vue-next';
import {
  FhTable,
  FhStatusPill,
  FhCostBreakdown,
  FhMoney,
  FhSkeleton,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';

const router = useRouter();

const loading = ref(true);
const orders = ref<ServiceOrderItem[]>([]);
const searchQuery = ref('');
const statusFilter = ref('ALL');
const serviceOrderStates = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'] as const;

const isCanonicalServiceOrderState = (status: string) =>
  serviceOrderStates.includes(status.toUpperCase() as (typeof serviceOrderStates)[number]);

onMounted(async () => {
  try {
    const list = await ordersApi.getConsoleOrders();
    orders.value = list;
  } finally {
    loading.value = false;
  }
});

const isSkeleton = (row: unknown): boolean => !!(row as Record<string, unknown>)._isSkeleton;

const filteredOrders = computed<(ServiceOrderItem & { _isSkeleton?: boolean })[]>(() => {
  if (loading.value) {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: `skeleton-${i}`,
      _isSkeleton: true,
      code: '',
      serviceName: '',
      addressSummary: '',
      customerName: '',
      customerPhone: '',
      technician: null,
      laborTotal: 0,
      partsTotal: 0,
      grandTotal: 0,
      status: 'ACCEPTED',
      createdAt: '',
    } as unknown as ServiceOrderItem & { _isSkeleton: boolean }));
  }

  return orders.value.filter((o) => {
    if (!isCanonicalServiceOrderState(String(o.status))) return false;
    const matchStatus = statusFilter.value === 'ALL' || o.status.toUpperCase() === statusFilter.value;
    const matchSearch =
      !searchQuery.value ||
      o.code.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      o.serviceName.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchStatus && matchSearch;
  });
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <KanbanSquare class="text-brand-600" :size="24" />
          Board đơn sửa chữa & hỗ trợ ngoại lệ
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Giám sát ServiceOrder theo lifecycle chuẩn và chuyển các trường hợp bất thường sang hỗ trợ.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-ink-600">Tổng số đơn:</span>
        <span class="text-xs font-bold font-num px-2.5 py-1 rounded bg-brand-50 text-brand-700 border border-brand-200">
          {{ filteredOrders.length }} đơn
        </span>
      </div>
    </div>

    <!-- Table -->
    <FhTable
      :columns="[
        { key: 'code', label: 'Mã đơn', width: '130px' },
        { key: 'service', label: 'Dịch vụ & Địa chỉ' },
        { key: 'customer', label: 'Khách hàng', width: '150px' },
        { key: 'technician', label: 'Thợ phụ trách', width: '150px' },
        { key: 'costs', label: 'Phân tách Công / Phụ tùng' },
        { key: 'status', label: 'Trạng thái', width: '130px' },
        { key: 'actions', label: 'Chi tiết', width: '90px', align: 'right' },
      ]"
      :rows="filteredOrders"
      :loading="loading"
      searchable
      v-model:searchQuery="searchQuery"
      search-placeholder="Tìm theo mã đơn, khách hàng hoặc dịch vụ..."
      :empty-text="'Không tìm thấy đơn nào phù hợp.'"
    >
      <template #toolbar>
        <div class="flex items-center gap-2">
          <span class="text-xs text-ink-500">Trạng thái:</span>
          <select
            v-model="statusFilter"
            class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700 focus:outline-none focus:border-brand-600"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACCEPTED">Đã nhận đơn (ACCEPTED)</option>
            <option value="EN_ROUTE">Đang di chuyển (EN_ROUTE)</option>
            <option value="UNDER_REPAIR">Đang sửa chữa (UNDER_REPAIR)</option>
            <option value="COMPLETED">Hoàn tất (COMPLETED)</option>
            <option value="CANCELLED">Đã huỷ (CANCELLED)</option>
          </select>
        </div>
      </template>

      <template #cell-code="{ row }">
        <div v-if="isSkeleton(row)">
          <FhSkeleton width="100px" height="16px" class="mb-1" />
          <FhSkeleton width="60px" height="12px" />
        </div>
        <div v-else>
          <span class="font-mono text-xs font-bold text-ink-900">{{ row.code }}</span>
          <div class="text-[10px] text-ink-400 font-num">{{ new Date(row.createdAt).toLocaleDateString('vi-VN') }}</div>
        </div>
      </template>

      <template #cell-service="{ row }">
        <div v-if="isSkeleton(row)">
          <FhSkeleton width="160px" height="16px" class="mb-1" />
          <FhSkeleton width="120px" height="12px" />
        </div>
        <div v-else class="max-w-[260px] whitespace-normal">
          <div class="font-semibold text-xs text-ink-900 leading-tight">{{ row.serviceName }}</div>
          <div class="text-[11px] text-ink-400 mt-0.5 leading-relaxed">{{ row.addressSummary }}</div>
        </div>
      </template>

      <template #cell-customer="{ row }">
        <div v-if="isSkeleton(row)">
          <FhSkeleton width="120px" height="16px" class="mb-1" />
          <FhSkeleton width="90px" height="12px" />
        </div>
        <div v-else>
          <div class="text-xs font-medium text-ink-900">{{ row.customerName }}</div>
          <div class="text-[10px] text-ink-500 font-mono">{{ row.customerPhone }}</div>
        </div>
      </template>

      <template #cell-technician="{ row }">
        <div v-if="isSkeleton(row)">
          <FhSkeleton width="130px" height="16px" class="mb-1" />
          <FhSkeleton width="40px" height="12px" />
        </div>
        <div v-else>
          <div v-if="row.technician" class="text-xs font-medium text-ink-900">
            {{ row.technician.fullName }}
            <span class="text-[10px] text-amber-600 block">★ {{ row.technician.averageRating }}</span>
          </div>
          <span v-else class="text-[11px] text-amber-600 font-semibold">Chưa gán thợ</span>
        </div>
      </template>

      <template #cell-costs="{ row }">
        <div v-if="isSkeleton(row)" class="w-56">
          <FhSkeleton width="100%" height="24px" class="mb-1 rounded" />
          <FhSkeleton width="60px" height="16px" class="ml-auto" />
        </div>
        <div v-else class="max-w-[260px] min-w-[220px]">
          <FhCostBreakdown :labor-total="row.laborTotal" :parts-total="row.partsTotal" />
          <div class="text-right text-[11px] font-bold text-brand-700 font-num mt-1">
            <FhMoney :amount="row.grandTotal" />
          </div>
        </div>
      </template>

      <template #cell-status="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="100px" height="24px" class="rounded-full" />
        <FhStatusPill v-else :status="row.status" />
      </template>

      <template #cell-actions="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="32px" height="32px" class="rounded-[var(--radius-sm)]" />
        <button
          v-else
          class="p-1.5 text-ink-500 hover:text-brand-600 rounded hover:bg-ink-100 transition-colors"
          title="Xem chi tiết"
          @click="router.push(`/console/orders/${row.id}`)"
        >
          <Eye :size="16" />
        </button>
      </template>
    </FhTable>
  </div>
</template>
