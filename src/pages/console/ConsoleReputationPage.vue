<script setup lang="ts">
// Service Manager: customers' and technicians' reputation points (PO
// 08/10/2026). Lowest scores first, why a score moved, and adding or removing
// points with a reason. Raising a score to 70 or more lifts a running ban.
import { computed, onMounted, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { toast } from 'vue-sonner';
import {
  BadgeCheck,
  ChevronDown,
  History,
  Info,
  Lock,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  User,
  Users,
  Wrench,
} from 'lucide-vue-next';
import { FhButton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleStatCard, { type ConsoleStatTone } from '../../components/console/ConsoleStatCard.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import ReputationHistoryDrawer from '../../components/console/ReputationHistoryDrawer.vue';
import ReputationAdjustModal from '../../components/console/ReputationAdjustModal.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from '../../components/console/console-ui';
import { reputationApi, type ReputationEvent, type ReputationRow, type ReputationSummary } from '../../api/reputation.api';
import { useAuthStore } from '../../stores/auth';
import { activeBanUntil, REPUTATION_SUSPEND_THRESHOLD, reputationTierOf } from '../../utils/reputation-rules';
import { vnDateTimeString } from '../../utils/vn-time';
import { extractApiErrorMessage } from '../../utils/input-validation';

const PAGE_SIZE = 20;
const role = ref<'' | 'customer' | 'technician'>('');
const search = ref('');
const page = ref(1);
const totalPages = ref(0);
const total = ref(0);
const systemTotal = ref<number | null>(null);
const summary = ref<ReputationSummary | null>(null);
const rows = ref<ReputationRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const showRules = ref(false);

const canAdjust = computed(() => {
  if (!getActivePinia()) return true;
  const auth = useAuthStore();
  if (!auth.user) return true;
  return auth.hasPermission('strike:waive');
});

const ROLE_LABELS: Record<ReputationRow['role'], string> = {
  customer: 'Khách hàng',
  technician: 'Kỹ thuật viên',
};

const columns: ConsoleColumn[] = [
  { key: 'user', label: 'Tài khoản' },
  { key: 'role', label: 'Vai trò', hideBelow: 'md' },
  { key: 'points', label: 'Điểm uy tín', align: 'right' },
  { key: 'level', label: 'Mức độ', hideBelow: 'lg' },
  { key: 'ban', label: 'Tạm khoá', hideBelow: 'lg' },
  { key: 'actions', label: 'Thao tác', align: 'right' },
];

let activeListRequest = 0;

async function load() {
  const requestId = ++activeListRequest;
  loading.value = true;
  loadError.value = '';
  try {
    const trimmedSearch = search.value.trim();
    const isUnfiltered = !role.value && !trimmedSearch;
    const result = await reputationApi.list({
      role: role.value || undefined,
      search: trimmedSearch || undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    });
    if (requestId !== activeListRequest) return;
    rows.value = result.data;
    total.value = result.meta.total;
    totalPages.value = result.meta.totalPages;
    if (result.summary) {
      summary.value = result.summary;
      systemTotal.value = result.summary.totalAccounts;
    } else if (isUnfiltered) {
      systemTotal.value = result.meta.total;
    }
  } catch (error) {
    if (requestId !== activeListRequest) return;
    loadError.value = extractApiErrorMessage(error, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === activeListRequest) {
      loading.value = false;
    }
  }
}

function applyFilters() {
  page.value = 1;
  void load();
}

function goTo(next: number) {
  if (next < 1 || (totalPages.value && next > totalPages.value)) return;
  page.value = next;
  void load();
}

const hasFilters = computed(() => Boolean(search.value.trim() || role.value));
function resetFilters() {
  search.value = '';
  role.value = '';
  applyFilters();
}

// Right-side History Drawer (independent loading + race-condition protection)
const historyFor = ref<ReputationRow | null>(null);
const history = ref<ReputationEvent[]>([]);
const historyLoading = ref(false);
const historyError = ref('');
let activeHistoryRequest = 0;

async function openHistory(row: ReputationRow) {
  const requestId = ++activeHistoryRequest;
  historyFor.value = row;
  history.value = [];
  historyError.value = '';
  historyLoading.value = true;
  try {
    const items = await reputationApi.events(row.id);
    if (requestId !== activeHistoryRequest || historyFor.value?.id !== row.id) return;
    history.value = items;
  } catch (error) {
    if (requestId !== activeHistoryRequest || historyFor.value?.id !== row.id) return;
    historyError.value = extractApiErrorMessage(error, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === activeHistoryRequest) {
      historyLoading.value = false;
    }
  }
}

function closeHistory() {
  activeHistoryRequest++;
  historyFor.value = null;
  history.value = [];
  historyError.value = '';
  historyLoading.value = false;
}

// Adjust Modal
const adjustFor = ref<ReputationRow | null>(null);
const adjustSubmitError = ref('');
const busy = ref(false);

function openAdjust(row: ReputationRow) {
  if (!canAdjust.value) return;
  adjustFor.value = row;
  adjustSubmitError.value = '';
}

function closeAdjust() {
  if (busy.value) return;
  adjustFor.value = null;
  adjustSubmitError.value = '';
}

async function submitAdjust(payload: { delta: number; reason: string }) {
  const target = adjustFor.value;
  if (!target || busy.value || !canAdjust.value) return;
  busy.value = true;
  adjustSubmitError.value = '';
  try {
    const result = await reputationApi.adjust(target.id, payload.delta, payload.reason);
    target.reputationPoints = result.points;
    adjustFor.value = null;
    toast.success(`Đã cập nhật điểm uy tín cho ${target.fullName} (${result.points}/100).`);
    await load();
    if (historyFor.value?.id === target.id) {
      const refreshed = rows.value.find((r) => r.id === target.id) ?? {
        ...historyFor.value,
        reputationPoints: result.points,
      };
      void openHistory(refreshed);
    }
  } catch (error) {
    adjustSubmitError.value = extractApiErrorMessage(error, 'Chưa điều chỉnh được điểm, thử lại sau.');
  } finally {
    busy.value = false;
  }
}

const statCards = computed<{ key: string; label: string; value: string | number; note: string | null; icon: typeof Users; tone: ConsoleStatTone }[]>(() => {
  const totalDisplay = summary.value?.totalAccounts ?? systemTotal.value;
  return [
    {
      key: 'total',
      label: 'Tổng tài khoản',
      value: loadError.value && totalDisplay === null ? '—' : (totalDisplay ?? '—'),
      note: null,
      icon: Users,
      tone: 'neutral',
    },
    {
      key: 'low',
      label: 'Điểm thấp (< 70)',
      value: summary.value ? summary.value.lowScoreCount : '—',
      note: summary.value ? null : 'Chưa có API thống kê',
      icon: TriangleAlert,
      tone: 'danger',
    },
    {
      key: 'suspended',
      label: 'Tạm khoá',
      value: summary.value ? summary.value.suspendedCount : '—',
      note: summary.value ? null : 'Chưa có API thống kê',
      icon: Lock,
      tone: 'warning',
    },
    {
      key: 'average',
      label: 'Điểm trung bình',
      value: summary.value ? summary.value.averagePoints : '—',
      note: summary.value ? null : 'Chưa có API thống kê',
      icon: BadgeCheck,
      tone: 'success',
    },
  ];
});

function tierBadgeClass(tone: 'success' | 'warning' | 'danger'): string {
  if (tone === 'success') return 'bg-success-50 text-success-700';
  if (tone === 'warning') return 'bg-warning-50 text-warning-700';
  return 'bg-danger-50 text-danger-700';
}

function tierIcon(tone: 'success' | 'warning' | 'danger', key: string) {
  if (key === 'locked') return Lock;
  if (tone === 'success') return BadgeCheck;
  return TriangleAlert;
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <!-- Header & Rules Toggle -->
    <ConsolePageHeader
      class="animate-slide-up"
      title="Điểm uy tín"
      :count="loading || loadError ? null : (systemTotal ?? total)"
    >
      <template #meta>
        <div class="mt-1.5">
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            :aria-expanded="showRules"
            @click="showRules = !showRules"
          >
            <Info :size="15" aria-hidden="true" />
            <span>Quy tắc điểm</span>
            <ChevronDown
              :size="14"
              class="transition-transform duration-150"
              :class="{ 'rotate-180': showRules }"
              aria-hidden="true"
            />
          </button>

          <Transition name="fh-fade-slide">
            <div
              v-if="showRules"
              class="mt-2.5 max-w-3xl rounded-[var(--radius-md)] border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs leading-relaxed text-ink-700"
            >
              <ul class="list-disc space-y-1 pl-4 text-pretty">
                <li>Khởi đầu <strong class="font-num font-semibold text-ink-900">100</strong> điểm; huỷ đơn đã có người nhận trừ <strong class="font-num font-semibold text-ink-900">10</strong> điểm (vi phạm nghĩa vụ bảo hành trừ theo cấu hình hệ thống).</li>
                <li>Dưới <strong class="font-num font-semibold text-ink-900">70</strong> điểm tạm khoá <strong class="font-num font-semibold text-ink-900">72</strong> giờ; dưới <strong class="font-num font-semibold text-ink-900">40</strong> điểm tạm khoá <strong class="font-num font-semibold text-ink-900">7</strong> ngày; từ <strong class="font-num font-semibold text-ink-900">20</strong> điểm trở xuống tạm khoá <strong class="font-num font-semibold text-ink-900">30</strong> ngày; <strong class="font-num font-semibold text-ink-900">0</strong> điểm khoá tài khoản.</li>
                <li>Nâng điểm lên từ <strong class="font-num font-semibold text-ink-900">70</strong> điểm trở lên sẽ gỡ tạm khoá đang có; điểm được làm mới về <strong class="font-num font-semibold text-ink-900">100</strong> mỗi <strong class="font-num font-semibold text-ink-900">2</strong> tháng (không áp dụng với tài khoản đã khoá).</li>
              </ul>
            </div>
          </Transition>
        </div>
      </template>
    </ConsolePageHeader>

    <!-- 4 Compact Summary Cards -->
    <section class="animate-slide-up-delay-1 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Thống kê điểm uy tín">
      <ConsoleStatCard
        v-for="card in statCards"
        :key="card.key"
        :featured="card.key === 'total'"
        :loading="loading && !loadError && (card.key === 'total' ? summary === null && systemTotal === null : summary === null)"
        :label="card.label"
        :value="card.value"
        :sublabel="card.note ?? undefined"
        :icon="card.icon"
        :tone="card.tone"
        :title="card.note ?? undefined"
      />
    </section>

    <!-- Single-row Unboxed Search & Filter Bar -->
    <form class="animate-slide-up-delay-1 flex flex-wrap items-center gap-2.5" @submit.prevent="applyFilters">
      <ConsoleSearch
        v-model="search"
        :maxlength="100"
        placeholder="Tìm tên, email, số điện thoại"
        label="Tìm kiếm"
        class="sm:w-80 lg:w-96"
      />
      <select v-model="role" :class="consoleField" class="w-full sm:w-44" aria-label="Vai trò" @change="applyFilters">
        <option value="">Tất cả vai trò</option>
        <option value="customer">Khách hàng</option>
        <option value="technician">Kỹ thuật viên</option>
      </select>
      <FhButton type="submit" variant="primary" size="sm">
        <Search :size="15" aria-hidden="true" />
        Tìm
      </FhButton>
      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
        @click="resetFilters"
      >
        <RotateCcw :size="14" aria-hidden="true" />
        Đặt lại
      </button>
    </form>

    <!-- Accounts Table & Pagination -->
    <div class="animate-slide-up-delay-2 space-y-4">
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
      <ConsoleTable
        v-else
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :row-class="(row) => (historyFor?.id === row.id ? 'bg-brand-50/70' : undefined)"
        empty-text="Không có tài khoản nào khớp bộ lọc."
      >
        <template #cell-user="{ row }">
          <div class="font-medium text-ink-900">{{ row.fullName }}</div>
          <div class="truncate text-xs text-ink-500" :title="row.email">
            {{ row.email }}<template v-if="row.phoneNumber"> · <span class="whitespace-nowrap font-num">{{ row.phoneNumber }}</span></template>
          </div>
        </template>

        <template #cell-role="{ row }">
          <span
            class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium"
            :class="row.role === 'technician' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700'"
          >
            <component :is="row.role === 'technician' ? Wrench : User" :size="12" aria-hidden="true" />
            <span>{{ ROLE_LABELS[row.role] ?? 'Không rõ' }}</span>
          </span>
        </template>

        <template #cell-points="{ row }">
          <span
            class="font-num font-semibold"
            :class="row.reputationPoints < REPUTATION_SUSPEND_THRESHOLD ? 'text-danger-700' : 'text-ink-900'"
          >
            {{ row.reputationPoints }}
          </span>
        </template>

        <template #cell-level="{ row }">
          <span
            class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium"
            :class="tierBadgeClass(reputationTierOf(row).tone)"
          >
            <component
              :is="tierIcon(reputationTierOf(row).tone, reputationTierOf(row).key)"
              :size="12"
              aria-hidden="true"
            />
            <span>{{ reputationTierOf(row).label }}</span>
          </span>
        </template>

        <template #cell-ban="{ row }">
          <span v-if="row.status === 'locked'" class="inline-flex items-center gap-1 whitespace-nowrap font-medium text-danger-700">
            <Lock :size="13" aria-hidden="true" />
            Đã khoá tài khoản
          </span>
          <span v-else-if="activeBanUntil(row)" class="whitespace-nowrap font-medium text-danger-700">
            Tới <span class="font-num">{{ vnDateTimeString(activeBanUntil(row)!) }}</span>
          </span>
          <span v-else class="text-ink-400">Không</span>
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-2">
            <FhButton variant="secondary" size="sm" @click="openHistory(row)">
              <History :size="14" aria-hidden="true" />
              Lịch sử
            </FhButton>
            <ConsoleMoreMenu v-if="canAdjust" label="Thao tác khác với tài khoản">
              <ConsoleMenuItem @click="openAdjust(row)">
                <SlidersHorizontal :size="14" aria-hidden="true" />
                Điều chỉnh
              </ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </template>
      </ConsoleTable>

      <ConsolePagination
        :page="page"
        :total-pages="totalPages"
        :total="total"
        :page-size="PAGE_SIZE"
        :disabled="loading"
        @update:page="goTo"
      />
    </div>

    <!-- Right-side Quick-View History Drawer -->
    <ReputationHistoryDrawer
      :account="historyFor"
      :events="history"
      :loading="historyLoading"
      :error="historyError"
      :can-adjust="canAdjust"
      @close="closeHistory"
      @retry="historyFor && openHistory(historyFor)"
      @adjust="openAdjust"
    />

    <!-- Adjust Reputation Modal -->
    <ReputationAdjustModal
      :account="adjustFor"
      :busy="busy"
      :submit-error="adjustSubmitError"
      @close="closeAdjust"
      @submit="submitAdjust"
    />
  </div>
</template>
