<script setup lang="ts">
// Admin: every review customers left for technicians (PO 09/10/2026), read
// only: stars, comment, who rated whom on which order, the average and the
// spread of stars for the same filter.
import { computed, onMounted, ref } from 'vue';
import { RotateCcw, Search, Star } from 'lucide-vue-next';
import { FhButton } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleSearchField } from '../../../components/console/console-ui';
import { adminReviewsApi, type AdminReviewRow, type AdminReviewSummary } from '../../../api/admin-reviews.api';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateTimeString } from '../../../utils/vn-time';

// '' all, '1'..'5' exactly that many stars, 'low' two stars or fewer.
const starsFilter = ref('');
const search = ref('');
const from = ref('');
const to = ref('');
const rows = ref<AdminReviewRow[]>([]);
const summary = ref<AdminReviewSummary>({ average: null, stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
const total = ref(0);
const page = ref(1);
const totalPages = ref(0);
const loading = ref(true);
const error = ref('');
const STAR_KEYS = [5, 4, 3, 2, 1] as const;
const columns: ConsoleColumn[] = [
  { key: 'rating', label: 'Số sao' },
  { key: 'comment', label: 'Nhận xét' },
  { key: 'people', label: 'Thợ và khách', hideBelow: 'lg' },
  { key: 'order', label: 'Đơn', hideBelow: 'xl' },
  { key: 'createdAt', label: 'Thời gian', hideBelow: 'xl' },
];

async function load(next = 1) {
  if (from.value && to.value && from.value > to.value) {
    error.value = 'Ngày bắt đầu phải trước ngày kết thúc.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await adminReviewsApi.list({
      search: search.value.trim() || undefined,
      rating: /^[1-5]$/.test(starsFilter.value) ? Number(starsFilter.value) : undefined,
      maxRating: starsFilter.value === 'low' ? 2 : undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      page: next,
      pageSize: 20,
    });
    rows.value = result.data;
    summary.value = result.meta.summary;
    total.value = result.meta.total;
    page.value = result.meta.page;
    totalPages.value = result.meta.totalPages;
  } catch (err) {
    error.value = userFacingError(err, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

const hasActiveFilters = computed(
  () => search.value.trim() !== '' || starsFilter.value !== '' || from.value !== '' || to.value !== '',
);

function resetFilters() {
  search.value = '';
  starsFilter.value = '';
  from.value = '';
  to.value = '';
  void load(1);
}

const starSharePct = (star: (typeof STAR_KEYS)[number]) => {
  const sum = STAR_KEYS.reduce((acc, k) => acc + (summary.value.stars[k] ?? 0), 0);
  if (sum <= 0) return 0;
  return Math.round(((summary.value.stars[star] ?? 0) / sum) * 100);
};

onMounted(() => load(1));
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader
      class="animate-slide-up"
      title="Đánh giá của khách"
      artwork-src="/images/ui/console-reviews-stars.png"
    />

    <form class="animate-slide-up-delay-1 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-3 shadow-(--shadow-e1) flex flex-wrap items-center gap-2.5" data-testid="reviews-filters" @submit.prevent="load(1)">
      <div class="relative w-full min-w-0 sm:w-72">
        <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="Tên thợ, khách, mã đơn, nội dung"
          aria-label="Tìm đánh giá"
          data-testid="reviews-search"
          :class="consoleSearchField"
        />
      </div>
      <select v-model="starsFilter" aria-label="Số sao" data-testid="reviews-stars" :class="consoleField">
        <option value="">Mọi số sao</option>
        <option value="low">Từ 2 sao trở xuống</option>
        <option v-for="n in STAR_KEYS" :key="n" :value="String(n)">{{ n }} sao</option>
      </select>
      <label class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <span>Từ</span>
        <input v-model="from" type="date" aria-label="Từ ngày" data-testid="reviews-from" :class="consoleField" />
      </label>
      <label class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <span>Đến</span>
        <input v-model="to" type="date" aria-label="Đến ngày" data-testid="reviews-to" :class="consoleField" />
      </label>
      <FhButton type="submit" variant="secondary" size="sm" :loading="loading" data-testid="reviews-submit">Lọc</FhButton>
      <button
        v-if="hasActiveFilters"
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-3 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        @click="resetFilters"
      >
        <RotateCcw :size="13" aria-hidden="true" />
        Đặt lại
      </button>
    </form>
    <Transition name="fh-fade-slide">
      <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">{{ error }}</p>
    </Transition>

    <dl class="animate-slide-up-delay-2 grid gap-4 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 sm:p-5 text-sm shadow-(--shadow-e1) md:grid-cols-[minmax(0,13.5rem)_1fr]" data-testid="reviews-summary">
      <div class="flex flex-col justify-center gap-1 border-b border-ink-100 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-5">
        <div v-if="summary.average !== null" class="flex items-baseline gap-2">
          <dt class="text-xs font-medium text-ink-500">Trung bình </dt>
          <dd class="inline-flex items-center gap-1 font-num text-2xl font-bold text-ink-900">
            <span>{{ summary.average.toFixed(1) }}/5</span>
            <Star :size="18" class="fill-warning-400 text-warning-500" aria-hidden="true" />
          </dd>
        </div>
        <div>
          <dt class="sr-only">Số đánh giá</dt>
          <dd class="text-ink-600 whitespace-nowrap"><span class="font-num font-semibold text-ink-900">{{ total }}</span> đánh giá</dd>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 xl:gap-x-6 items-center">
        <div v-for="n in STAR_KEYS" :key="n" class="flex items-center gap-2.5 text-xs">
          <span class="w-16 shrink-0 whitespace-nowrap font-medium text-ink-700">
            {{ n }} sao: <span class="font-num font-semibold text-ink-900">{{ summary.stars[n] }}</span>
          </span>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
            <div
              class="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              :class="n <= 2 ? 'bg-danger-400' : 'bg-warning-400'"
              :style="{ width: `${starSharePct(n)}%` }"
            />
          </div>
        </div>
      </div>
    </dl>

    <div class="animate-slide-up-delay-3 space-y-5">
      <ConsoleTable
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :row-test-id="(r) => `review-${r.id}`"
      >
        <template #empty>Chưa có đánh giá nào khớp bộ lọc.</template>
        <template #cell-rating="{ row: r }">
          <p
            class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold font-num"
            :class="r.rating <= 2 ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700'"
          >
            <Star :size="12" :class="r.rating <= 2 ? 'fill-danger-400 text-danger-600' : 'fill-warning-400 text-warning-500'" aria-hidden="true" />
            <span>{{ r.rating }}/5 sao</span>
          </p>
        </template>
        <template #cell-comment="{ row: r }">
          <span v-if="r.comment" class="line-clamp-3 max-w-96 text-ink-800" :title="r.comment">{{ r.comment }}</span>
          <span v-else class="text-ink-400">—</span>
        </template>
        <template #cell-people="{ row: r }">
          <div class="whitespace-nowrap text-ink-800">Thợ {{ r.technicianName }}</div>
          <div class="whitespace-nowrap text-xs text-ink-500">Khách {{ r.customerName }}</div>
        </template>
        <template #cell-order="{ row: r }">
          <router-link v-if="r.orderCode" :to="`/console/orders/${r.orderId}`" class="whitespace-nowrap font-num text-brand-700 hover:underline">{{ r.orderCode }}</router-link>
          <span v-else class="text-ink-400">—</span>
        </template>
        <template #cell-createdAt="{ row: r }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ vnDateTimeString(r.createdAt) }}</span>
        </template>
      </ConsoleTable>

      <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="load" />
    </div>
  </div>
</template>
