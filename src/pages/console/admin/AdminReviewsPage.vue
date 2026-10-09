<script setup lang="ts">
// Admin: every review customers left for technicians (PO 09/10/2026), read
// only: stars, comment, who rated whom on which order, the average and the
// spread of stars for the same filter.
import { onMounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
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

onMounted(() => load(1));
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Đánh giá của khách" />

    <form class="flex flex-wrap items-center gap-2" data-testid="reviews-filters" @submit.prevent="load(1)">
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
      <input v-model="from" type="date" aria-label="Từ ngày" data-testid="reviews-from" :class="consoleField" />
      <input v-model="to" type="date" aria-label="Đến ngày" data-testid="reviews-to" :class="consoleField" />
      <FhButton type="submit" variant="secondary" size="sm" :loading="loading" data-testid="reviews-submit">Lọc</FhButton>
    </form>
    <p v-if="error" class="text-sm text-danger-700" role="alert">{{ error }}</p>

    <dl class="flex flex-wrap divide-x divide-ink-100 rounded-[var(--radius-md)] border border-ink-200 bg-white text-sm" data-testid="reviews-summary">
      <div class="px-4 py-3"><dt class="sr-only">Số đánh giá</dt><dd class="whitespace-nowrap"><span class="font-num font-semibold text-ink-900">{{ total }}</span> đánh giá</dd></div>
      <div v-if="summary.average !== null" class="px-4 py-3">
        <dt class="inline text-ink-500">Trung bình </dt><dd class="inline font-num font-semibold text-ink-900">{{ summary.average.toFixed(1) }}/5</dd>
      </div>
      <div class="px-4 py-3 text-ink-500">
        <template v-for="(n, i) in STAR_KEYS" :key="n"><span v-if="i > 0"> · </span><span class="whitespace-nowrap">{{ n }} sao: <span class="font-num text-ink-800">{{ summary.stars[n] }}</span></span></template>
      </div>
    </dl>

    <ConsoleTable
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :row-test-id="(r) => `review-${r.id}`"
    >
      <template #empty>Chưa có đánh giá nào khớp bộ lọc.</template>
      <template #cell-rating="{ row: r }">
        <p class="whitespace-nowrap font-semibold" :class="r.rating <= 2 ? 'text-danger-700' : 'text-ink-900'">{{ r.rating }}/5 sao</p>
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
</template>
