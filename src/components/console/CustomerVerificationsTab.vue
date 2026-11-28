<script setup lang="ts">
// Admin: customers' identity checks (PO 14/10/2026), the tab "Khách hàng" of
// the review page. Waiting ones first by default; the server filters, searches
// (name without accents, email, phone, CCCD) and pages.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Calendar,
  Mail,
  Phone,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
} from 'lucide-vue-next';
import FhConfirmDialog from '../FhConfirmDialog.vue';
import ConsoleLoadError from './ConsoleLoadError.vue';
import ConsoleMenuItem from './ConsoleMenuItem.vue';
import ConsoleMoreMenu from './ConsoleMoreMenu.vue';
import CustomerVerificationDrawer from './CustomerVerificationDrawer.vue';
import { CONSOLE_LOAD_ERROR, consoleTextarea } from './console-ui';
import { verificationStatusPill } from './customer-verification-labels';
import { adminCustomerVerificationsApi } from '../../api/admin-customer-verifications.api';
import type { CustomerVerification, CustomerVerificationRecordStatus } from '../../api/customer-verification.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { useQueryChoice, useQueryPage, useQuerySearch } from '../../composables/useQueryState';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { userFacingError } from '../../utils/user-facing-error';
import { useCanDecideReview } from '../../composables/useCanDecideReview';

const canDecide = useCanDecideReview();

type StatusFilter = CustomerVerificationRecordStatus | 'all';
const STATUS_FILTERS: readonly StatusFilter[] = ['pending', 'verified', 'rejected', 'all'];
const PAGE_SIZE = 10;

const props = defineProps<{
  statusFilter?: StatusFilter;
}>();

const emit = defineEmits<{
  (e: 'updated'): void;
  (e: 'update:statusFilter', value: StatusFilter): void;
}>();

const status = useQueryChoice<StatusFilter>('kyc', STATUS_FILTERS, 'pending');

watch(
  () => props.statusFilter,
  (next) => {
    if (next && next !== status.value) status.value = next;
  },
);
watch(
  status,
  (next) => {
    emit('update:statusFilter', next);
  },
  { immediate: true },
);
const { input: searchInput, search } = useQuerySearch('cq');

// Date range filter
type DateFilterType = 'ALL' | 'TODAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH';
const dateFilter = ref<DateFilterType>('ALL');
const isDatePickerOpen = ref(false);
const datePickerRef = ref<HTMLElement | null>(null);

const datePresets: { value: DateFilterType; label: string }[] = [
  { value: 'ALL', label: 'Tất cả thời gian' },
  { value: 'TODAY', label: 'Hôm nay' },
  { value: '7_DAYS', label: '7 ngày qua' },
  { value: '30_DAYS', label: '30 ngày qua' },
  { value: 'THIS_MONTH', label: 'Tháng này' },
];

const dateRangeLabel = computed(() => {
  const found = datePresets.find((p) => p.value === dateFilter.value);
  if (!found || found.value === 'ALL') return 'Chọn khoảng thời gian';
  return found.label;
});

function selectDatePreset(preset: DateFilterType) {
  dateFilter.value = preset;
  isDatePickerOpen.value = false;
}

function onDocClick(event: MouseEvent) {
  if (datePickerRef.value && !datePickerRef.value.contains(event.target as Node)) {
    isDatePickerOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('click', onDocClick);
});

onUnmounted(() => {
  window.removeEventListener('click', onDocClick);
});

const { page, items, total, loading, error, load, changingPage, prefetch } = usePagedList<CustomerVerification>({
  key: () => queryKeys.identity.adminCustomers({ status: status.value, search: search.value }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('cpage'),
  fetch: (p, size) =>
    adminCustomerVerificationsApi.list({
      status: status.value === 'all' ? undefined : status.value,
      search: search.value,
      page: p,
      limit: size,
    }),
});

const loadError = computed(() => (error.value ? userFacingError(error.value, CONSOLE_LOAD_ERROR) : ''));
const cache = useCacheUpdates();

const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const busyId = ref<string | null>(null);
const selected = ref<CustomerVerification | null>(null);

const nameOf = (v: CustomerVerification) => v.customer?.fullName || v.fullName || 'Khách hàng';

function matchesDateFilter(dateStr?: string | null): boolean {
  if (!dateStr || dateFilter.value === 'ALL') return true;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dateFilter.value === 'TODAY') {
    return d >= startOfToday;
  }
  if (dateFilter.value === '7_DAYS') {
    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= sevenDaysAgo;
  }
  if (dateFilter.value === '30_DAYS') {
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    return d >= thirtyDaysAgo;
  }
  if (dateFilter.value === 'THIS_MONTH') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= startOfMonth;
  }
  return true;
}

const displayItems = computed(() => {
  if (dateFilter.value === 'ALL') return items.value;
  return items.value.filter((v) => matchesDateFilter(v.submittedAt));
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const visiblePages = computed(() => {
  const totalP = totalPages.value;
  const curr = page.value;
  if (totalP <= 7) {
    return Array.from({ length: totalP }, (_, i) => i + 1);
  }
  if (curr <= 4) {
    return [1, 2, 3, 4, 5, 'gap', totalP];
  }
  if (curr >= totalP - 3) {
    return [1, 'gap', totalP - 4, totalP - 3, totalP - 2, totalP - 1, totalP];
  }
  return [1, 'gap', curr - 1, curr, curr + 1, 'gap', totalP];
});

const paginationSummary = computed(() => {
  if (total.value === 0) return 'Hiển thị 0 trên 0';
  const start = (page.value - 1) * PAGE_SIZE + 1;
  const end = Math.min(page.value * PAGE_SIZE, total.value);
  return `Hiển thị ${start}–${end} trên ${total.value}`;
});

async function afterDecision(text: string) {
  message.value = { tone: 'success', text };
  selected.value = null;
  await cache.refresh(affectedBy.identityChange);
  emit('updated');
}

async function approve(v: CustomerVerification) {
  if (busyId.value) return;
  busyId.value = v.id;
  message.value = null;
  try {
    await adminCustomerVerificationsApi.approve(v.id);
    await afterDecision(`Đã duyệt xác minh danh tính của ${nameOf(v)}.`);
  } catch (err) {
    message.value = { tone: 'error', text: userFacingError(err, 'Chưa duyệt được hồ sơ, vui lòng thử lại.') };
  } finally {
    busyId.value = null;
  }
}

// Reject with a reason the customer reads (5 to 2000 characters).
const rejecting = ref<CustomerVerification | null>(null);
const rejectReason = ref('');
const rejectError = ref('');

function openReject(v: CustomerVerification) {
  rejecting.value = v;
  rejectReason.value = '';
  rejectError.value = '';
}

async function confirmReject() {
  const v = rejecting.value;
  if (!v || busyId.value) return;
  const reason = rejectReason.value.trim();
  if (reason.length < 5) {
    rejectError.value = 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).';
    return;
  }
  if (reason.length > 2000) {
    rejectError.value = 'Lý do từ chối tối đa 2000 ký tự.';
    return;
  }
  busyId.value = v.id;
  message.value = null;
  try {
    await adminCustomerVerificationsApi.reject(v.id, reason);
    rejecting.value = null;
    await afterDecision(`Đã từ chối hồ sơ của ${nameOf(v)}.`);
  } catch (err) {
    rejectError.value = userFacingError(err, 'Chưa từ chối được hồ sơ, vui lòng thử lại.');
  } finally {
    busyId.value = null;
  }
}

const hasFilters = computed(() => Boolean(searchInput.value?.trim()) || status.value !== 'pending' || dateFilter.value !== 'ALL');
const resetFilters = () => {
  searchInput.value = '';
  status.value = 'pending';
  dateFilter.value = 'ALL';
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getInitials(name?: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0].toUpperCase() === 'QA') return 'QA';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
</script>

<template>
  <div class="space-y-4 sm:space-y-5" data-testid="customer-verifications">
    <!-- Filter Bar -->
    <div class="animate-slide-up-delay-2 relative z-20 flex flex-wrap items-center gap-3">
      <!-- 1. Search input -->
      <div class="relative flex-1 min-w-[240px] max-w-md">
        <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          v-model="searchInput"
          type="search"
          placeholder="Tìm tên, email, số điện thoại, CCCD"
          maxlength="100"
          class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 text-sm text-ink-800 placeholder:text-ink-400 shadow-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Tìm hồ sơ khách hàng"
        />
      </div>

      <!-- 2. Status dropdown -->
      <div class="relative min-w-[170px]">
        <select
          v-model="status"
          class="h-10 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-4 pr-9 text-sm text-ink-700 shadow-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
          aria-label="Trạng thái hồ sơ"
          data-testid="cv-status"
        >
          <option value="pending">Đang chờ duyệt</option>
          <option value="verified">Đã duyệt</option>
          <option value="rejected">Đã từ chối</option>
          <option value="all">Tất cả trạng thái</option>
        </select>
        <ChevronDown :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      </div>

      <!-- 3. Date range picker -->
      <div ref="datePickerRef" class="relative">
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-700 shadow-xs transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
          :class="{ 'border-brand-500 text-brand-700 bg-brand-50/20': dateFilter !== 'ALL' }"
          aria-label="Chọn khoảng thời gian"
          @click.stop="isDatePickerOpen = !isDatePickerOpen"
        >
          <Calendar :size="15" class="text-ink-400 shrink-0" aria-hidden="true" />
          <span class="max-w-[160px] truncate">{{ dateRangeLabel }}</span>
          <ChevronDown
            :size="14"
            class="text-ink-400 transition-transform duration-200 shrink-0"
            :class="{ 'rotate-180': isDatePickerOpen }"
            aria-hidden="true"
          />
        </button>

        <!-- Date picker popover -->
        <div
          v-if="isDatePickerOpen"
          class="absolute left-0 top-full z-40 mt-1.5 w-60 rounded-xl border border-ink-200 bg-white p-2 shadow-lg"
          @click.stop
        >
          <div class="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-400">Khoảng thời gian</div>
          <div class="space-y-1">
            <button
              v-for="preset in datePresets"
              :key="preset.value"
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
              :class="dateFilter === preset.value ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-700 hover:bg-ink-50'"
              @click="selectDatePreset(preset.value)"
            >
              <span>{{ preset.label }}</span>
              <Check v-if="dateFilter === preset.value" :size="14" class="text-brand-600" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- Reset filters -->
      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        @click="resetFilters"
      >
        <RotateCcw :size="14" aria-hidden="true" />
        <span>Đặt lại</span>
      </button>
    </div>

    <!-- Alert status messages -->
    <Transition name="fh-fade-slide">
      <p
        v-if="message"
        :role="message.tone === 'error' ? 'alert' : 'status'"
        class="rounded-xl border px-4 py-3 text-sm"
        :class="message.tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'"
        data-testid="cv-message"
      >{{ message.text }}</p>
    </Transition>

    <!-- Table Section -->
    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <div class="animate-slide-up-delay-3 relative z-10 overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-xs transition-opacity" :class="{ 'opacity-60': changingPage }">
        <div class="overflow-x-auto overscroll-x-contain">
          <table class="w-full text-left text-sm border-collapse">
            <thead>
              <tr class="border-b border-ink-200/80 bg-ink-50/70">
                <th scope="col" class="whitespace-nowrap py-3.5 pl-6 pr-4 text-xs font-semibold text-ink-600">
                  <div class="flex items-center gap-1.5">
                    <Users :size="15" class="text-ink-400" aria-hidden="true" />
                    <span>Khách hàng</span>
                  </div>
                </th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                  <div class="flex items-center gap-1.5">
                    <Mail :size="15" class="text-ink-400" aria-hidden="true" />
                    <span>Email</span>
                  </div>
                </th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                  <div class="flex items-center gap-1.5">
                    <Phone :size="15" class="text-ink-400" aria-hidden="true" />
                    <span>SĐT</span>
                  </div>
                </th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                  <div class="flex items-center gap-1.5">
                    <Calendar :size="15" class="text-ink-400" aria-hidden="true" />
                    <span>Ngày gửi</span>
                  </div>
                </th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                  <div class="flex items-center gap-1.5">
                    <Layers :size="15" class="text-ink-400" aria-hidden="true" />
                    <span>Trạng thái</span>
                  </div>
                </th>
                <th scope="col" class="whitespace-nowrap py-3.5 pl-4 pr-6 text-right text-xs font-semibold text-ink-600">
                  <span>Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <!-- Loading skeleton -->
              <template v-if="loading">
                <tr v-for="i in 5" :key="`skel-${i}`" class="animate-pulse">
                  <td class="py-3.5 pl-6 pr-4">
                    <div class="flex items-center gap-3">
                      <div class="h-8 w-8 rounded-full bg-ink-200 shrink-0"></div>
                      <div class="h-4 w-32 rounded bg-ink-200"></div>
                    </div>
                  </td>
                  <td class="px-4 py-3.5"><div class="h-4 w-40 rounded bg-ink-200"></div></td>
                  <td class="px-4 py-3.5"><div class="h-4 w-24 rounded bg-ink-200"></div></td>
                  <td class="px-4 py-3.5"><div class="h-4 w-20 rounded bg-ink-200"></div></td>
                  <td class="px-4 py-3.5"><div class="h-6 w-32 rounded-full bg-ink-200"></div></td>
                  <td class="py-3.5 pl-4 pr-6 text-right"><div class="ml-auto h-7 w-20 rounded bg-ink-200"></div></td>
                </tr>
              </template>

              <!-- Empty state -->
              <tr v-else-if="displayItems.length === 0">
                <td colspan="6" class="py-12 text-center text-sm text-ink-500">
                  <div class="flex flex-col items-center justify-center gap-2">
                    <Users :size="32" class="text-ink-300" aria-hidden="true" />
                    <p class="font-medium text-ink-600">Không có hồ sơ phù hợp.</p>
                    <p class="text-xs text-ink-400">Hãy thử thay đổi điều kiện tìm kiếm hoặc bộ lọc.</p>
                  </div>
                </td>
              </tr>

              <!-- Data rows -->
              <tr
                v-for="(row, index) in displayItems"
                v-else
                :key="row.id || index"
                class="cursor-pointer transition-colors duration-150"
                :class="row.status === 'pending' ? 'bg-amber-50/60 hover:bg-amber-100/50' : 'bg-white hover:bg-slate-50/80'"
                :data-testid="`cv-row-${row.id}`"
                @click="selected = row"
              >
                <!-- 1. Khách hàng (Avatar + Name + subtle CCCD) -->
                <td class="py-3.5 pl-6 pr-4">
                  <div class="flex items-center gap-3">
                    <img
                      v-if="row.customer?.avatarUrl"
                      :src="row.customer.avatarUrl"
                      :alt="nameOf(row)"
                      class="h-8 w-8 rounded-full object-cover shrink-0 border border-ink-100"
                    />
                    <div
                      v-else
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-brand-700 select-none font-num"
                    >
                      {{ getInitials(nameOf(row)) }}
                    </div>

                    <div class="min-w-0">
                      <button
                        type="button"
                        class="cursor-pointer text-left font-semibold text-brand-700 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 truncate block text-sm"
                        @click.stop="selected = row"
                      >
                        {{ nameOf(row) }}
                      </button>
                      <span v-if="row.citizenIdNumber" class="text-2xs text-ink-400 font-num block truncate">
                        {{ row.citizenIdNumber }}
                      </span>
                    </div>
                  </div>
                </td>

                <!-- 2. Email -->
                <td class="px-4 py-3.5 text-xs text-ink-600">
                  <div class="flex items-center gap-1.5">
                    <Mail :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
                    <span class="truncate max-w-[220px]" :title="row.customer?.email || ''">
                      {{ row.customer?.email || 'Chưa có email' }}
                    </span>
                  </div>
                </td>

                <!-- 3. SĐT -->
                <td class="px-4 py-3.5 text-xs">
                  <div v-if="row.customer?.phoneNumber" class="flex items-center gap-1.5 text-ink-700 font-num">
                    <Phone :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
                    <span class="whitespace-nowrap">{{ row.customer.phoneNumber }}</span>
                  </div>
                  <span v-else class="text-ink-400 font-num">—</span>
                </td>

                <!-- 4. Ngày gửi -->
                <td class="px-4 py-3.5 text-xs text-ink-600 font-num">
                  <div class="flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
                    <span>{{ formatDate(row.submittedAt) }}</span>
                  </div>
                </td>

                <!-- 5. Trạng thái -->
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span
                    v-if="row.status === 'verified'"
                    class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                  >
                    <CheckCircle2 :size="13" class="text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>{{ verificationStatusPill(row.status).label }}</span>
                  </span>

                  <span
                    v-else-if="row.status === 'rejected'"
                    class="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"
                  >
                    <XCircle :size="13" class="text-rose-600 shrink-0" aria-hidden="true" />
                    <span>{{ verificationStatusPill(row.status).label }}</span>
                  </span>

                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                  >
                    <Clock :size="13" class="text-amber-600 shrink-0" aria-hidden="true" />
                    <span>{{ verificationStatusPill(row.status).label }}</span>
                  </span>
                </td>

                <!-- 6. Thao tác -->
                <td class="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                  <div class="flex items-center justify-end gap-2" @click.stop>
                    <template v-if="canDecide && row.status === 'pending'">
                      <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 cursor-pointer"
                        :disabled="Boolean(busyId)"
                        data-testid="cv-approve"
                        @click="approve(row)"
                      >
                        Xác nhận
                      </button>
                      <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
                        <ConsoleMenuItem danger :disabled="Boolean(busyId)" @click="openReject(row)">Từ chối</ConsoleMenuItem>
                        <ConsoleMenuItem @click="selected = row">Xem chi tiết</ConsoleMenuItem>
                      </ConsoleMoreMenu>
                    </template>
                    <template v-else>
                      <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
                        <ConsoleMenuItem @click="selected = row">Xem chi tiết</ConsoleMenuItem>
                      </ConsoleMoreMenu>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modern Pagination Bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs sm:text-sm text-ink-600">
        <span class="font-num text-ink-500">{{ paginationSummary }}</span>

        <div class="flex items-center gap-1 sm:gap-2">
          <!-- Prev page -->
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            :disabled="page <= 1 || loading"
            aria-label="Trang trước"
            @click="page > 1 && (page--)"
          >
            <ChevronLeft :size="16" aria-hidden="true" />
          </button>

          <!-- Numbered pages -->
          <template v-for="(p, idx) in visiblePages" :key="p === 'gap' ? `gap-${idx}` : p">
            <span v-if="p === 'gap'" class="px-1 text-ink-400">…</span>
            <button
              v-else
              type="button"
              class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-num text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              :class="p === page ? 'bg-blue-600 text-white font-semibold shadow-xs' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
              :disabled="loading"
              @click="page = Number(p); prefetch(Number(p))"
            >
              {{ p }}
            </button>
          </template>

          <!-- Next page -->
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            :disabled="page >= totalPages || loading"
            aria-label="Trang sau"
            @click="page < totalPages && (page++); prefetch(page)"
          >
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
    </template>

    <!-- Detail Drawer -->
    <CustomerVerificationDrawer
      :verification="selected"
      :busy="Boolean(selected && busyId === selected.id)"
      @close="selected = null"
      @approve="approve"
      @reject="openReject"
    />

    <!-- Reject Confirm Dialog -->
    <FhConfirmDialog
      :open="Boolean(rejecting)"
      :loading="Boolean(rejecting && busyId === rejecting.id)"
      title="Từ chối hồ sơ"
      consequence="Lý do được gửi cho khách hàng để chụp lại ảnh hoặc sửa thông tin."
      confirm-text="Từ chối hồ sơ"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="rejecting = null"
    >
      <label class="mt-4 block text-sm font-medium text-ink-700" for="cv-reject-reason">Lý do từ chối</label>
      <textarea
        id="cv-reject-reason"
        v-model="rejectReason"
        rows="3"
        maxlength="2000"
        class="mt-1.5 resize-none"
        :class="consoleTextarea"
        placeholder="Ví dụ: ảnh mặt sau bị mờ, họ tên không khớp CCCD"
        data-testid="cv-reject-reason"
      ></textarea>
      <p v-if="rejectError" class="mt-1.5 text-sm text-danger-600" role="alert" data-testid="cv-reject-error">{{ rejectError }}</p>
    </FhConfirmDialog>
  </div>
</template>
