<script setup lang="ts">
// Admin: every review customers left for technicians (PO 09/10/2026), read
// only: stars, comment, who rated whom on which order, the average and the
// spread of stars for the same filter.
import { onMounted, ref } from 'vue';
import { Search, Star } from 'lucide-vue-next';
import { FhButton, FhCard, FhEmptyState, FhSkeleton } from '../../../components';
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
    error.value = userFacingError(err, 'Chưa tải được đánh giá, thử lại sau.');
  } finally {
    loading.value = false;
  }
}

onMounted(() => load(1));
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2"><Star :size="24" class="text-ink-600" /> Đánh giá của khách</h1>
      <p class="text-xs text-ink-500 mt-1">Khách đánh giá thợ sau mỗi đơn hoàn tất. Chỉ để xem.</p>
    </div>

    <form class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="reviews-filters" @submit.prevent="load(1)">
      <input
        v-model="search"
        type="search"
        maxlength="100"
        placeholder="Tên thợ hoặc khách, email, mã đơn, nội dung"
        aria-label="Tìm đánh giá"
        data-testid="reviews-search"
        class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm lg:col-span-2"
      />
      <select v-model="starsFilter" aria-label="Số sao" data-testid="reviews-stars" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm">
        <option value="">Mọi số sao</option>
        <option value="low">Từ 2 sao trở xuống</option>
        <option v-for="n in STAR_KEYS" :key="n" :value="String(n)">{{ n }} sao</option>
      </select>
      <label class="flex items-center gap-2 text-xs text-ink-600">Từ <input v-model="from" type="date" data-testid="reviews-from" class="flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-2 py-1.5 text-sm" /></label>
      <label class="flex items-center gap-2 text-xs text-ink-600">Đến <input v-model="to" type="date" data-testid="reviews-to" class="flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-2 py-1.5 text-sm" /></label>
      <div class="lg:col-span-5">
        <FhButton type="submit" :loading="loading" data-testid="reviews-submit"><Search :size="15" class="mr-1" /> Lọc</FhButton>
      </div>
    </form>
    <p v-if="error" class="text-xs text-danger-700" role="alert">{{ error }}</p>

    <p class="text-sm text-ink-700" data-testid="reviews-summary">
      {{ total }} đánh giá<template v-if="summary.average !== null"> · Trung bình <strong class="text-ink-900">{{ summary.average.toFixed(1) }}/5</strong></template>
      <span class="text-ink-500"><template v-for="n in STAR_KEYS" :key="n"> · {{ n }} sao: {{ summary.stars[n] }}</template></span>
    </p>

    <FhCard>
      <div v-if="loading" class="p-4"><FhSkeleton height="40px" :count="5" /></div>
      <FhEmptyState v-else-if="rows.length === 0" title="Chưa có đánh giá nào" description="Không có đánh giá nào khớp bộ lọc." />
      <template v-else>
        <ul class="divide-y divide-ink-100" data-testid="reviews-rows">
          <li v-for="r in rows" :key="r.id" class="py-3 text-xs" :data-testid="`review-${r.id}`">
            <div class="flex items-start justify-between gap-3">
              <p class="text-sm font-semibold" :class="r.rating <= 2 ? 'text-danger-700' : 'text-ink-900'">{{ r.rating }}/5 sao</p>
              <span class="shrink-0 text-ink-400">{{ vnDateTimeString(r.createdAt) }}</span>
            </div>
            <p v-if="r.comment" class="mt-1 text-sm text-ink-800 break-words">{{ r.comment }}</p>
            <p class="mt-1 text-ink-500 break-all">
              Thợ <span class="text-ink-800">{{ r.technicianName }}</span> · Khách <span class="text-ink-800">{{ r.customerName }}</span>
              <template v-if="r.orderCode"> · <router-link :to="`/console/orders/${r.orderId}`" class="font-mono text-brand-700 hover:underline">{{ r.orderCode }}</router-link></template>
            </p>
          </li>
        </ul>
        <div v-if="totalPages > 1" class="flex items-center justify-between pt-3 text-xs text-ink-500">
          <FhButton variant="secondary" size="sm" :disabled="page <= 1" @click="load(page - 1)">Trước</FhButton>
          <span>Trang {{ page }}/{{ totalPages }}</span>
          <FhButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="load(page + 1)">Sau</FhButton>
        </div>
      </template>
    </FhCard>
  </div>
</template>
