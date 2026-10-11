<script setup lang="ts">
import { watch } from 'vue';
import { FhStatusPill, FhMoney } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { consoleField } from '../../components/console/console-ui';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { usePagedList } from '../../composables/usePagedList';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQuerySearch } from '../../composables/useQueryState';
import { vnDateString } from '../../utils/vn-time';
import { formatCurrencyVND, hasRating, ratingLabel } from '../../utils/formatters';

const PAGE_SIZE = 20;
const serviceOrderStates = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'] as const;
type StatusFilter = 'ALL' | (typeof serviceOrderStates)[number];
const statusOptions: { value: (typeof serviceOrderStates)[number]; label: string }[] = [
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

const {
  page,
  items: orders,
  total,
  loading,
  error: loadError,
  load: loadOrders,
  reset,
} = usePagedList<ServiceOrderItem>({
  pageSize: PAGE_SIZE,
  fetch: (p, size) =>
    ordersApi.getConsoleOrdersPage(p, size, {
      status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
      search: search.value,
    }),
});

watch([statusFilter, search], () => reset());

const columns: ConsoleColumn[] = [
  { key: 'code', label: 'Mã đơn' },
  { key: 'service', label: 'Dịch vụ' },
  { key: 'people', label: 'Khách và kỹ thuật viên', hideBelow: 'xl' },
  { key: 'total', label: 'Tổng tiền', align: 'right' },
  { key: 'status', label: 'Trạng thái' },
];
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Đơn sửa chữa" :count="loading || loadError ? null : total" />

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm mã đơn, khách hàng, dịch vụ" label="Tìm đơn sửa chữa" :maxlength="SEARCH_MAX_LENGTH" />
      <select v-model="statusFilter" :class="consoleField" aria-label="Lọc theo trạng thái">
        <option value="ALL">Tất cả trạng thái</option>
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <ConsoleLoadError v-if="loadError" @retry="loadOrders" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="orders"
      :loading="loading"
      empty-text="Không có đơn nào phù hợp."
    >
      <template #cell-code="{ row }">
        <router-link :to="`/console/orders/${row.id}`" class="whitespace-nowrap font-num font-medium text-brand-700 hover:underline">
          {{ row.code }}
        </router-link>
        <div class="whitespace-nowrap font-num text-xs text-ink-500">{{ vnDateString(row.createdAt) }}</div>
      </template>

      <template #cell-service="{ row }">
        <div class="min-w-40 max-w-72">
          <div class="font-medium text-ink-900">{{ row.serviceName }}</div>
          <div class="line-clamp-1 text-xs text-ink-500" :title="row.addressSummary">{{ row.addressSummary }}</div>
        </div>
      </template>

      <template #cell-people="{ row }">
        <div class="whitespace-nowrap text-ink-900">{{ row.customerName }} <span class="font-num text-xs text-ink-500">{{ row.customerPhone }}</span></div>
        <div v-if="row.technician" class="whitespace-nowrap text-xs text-ink-600">
          {{ row.technician.fullName }}
          <span class="text-ink-500"><template v-if="hasRating(row.technician.averageRating)">★ {{ ratingLabel(row.technician.averageRating) }}</template><template v-else>· Chưa có đánh giá</template></span>
        </div>
        <div v-else class="whitespace-nowrap text-xs text-warning-700">Chưa gán thợ</div>
      </template>

      <template #cell-total="{ row }">
        <FhMoney :amount="row.grandTotal" />
        <div class="hidden whitespace-nowrap text-xs text-ink-500 xl:block">Công <span class="font-num">{{ formatCurrencyVND(row.laborTotal) }}</span></div>
        <div class="hidden whitespace-nowrap text-xs text-ink-500 xl:block">Linh kiện <span class="font-num">{{ formatCurrencyVND(row.partsTotal) }}</span></div>
      </template>

      <template #cell-status="{ row }">
        <FhStatusPill :status="row.status" class="whitespace-nowrap" />
      </template>
    </ConsoleTable>
    <ConsolePagination v-if="!loadError" v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" />
  </div>
</template>
