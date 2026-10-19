<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Clock, LayoutGrid, Search, X } from 'lucide-vue-next';
import { FhButton, FhEmptyState, FhMoney, FhPagination, FhSkeleton } from '../../components';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { categoryIcon } from '../../components/booking/service-icons';
import { usePagedList } from '../../composables/usePagedList';
import { useQuerySearch, useQueryState } from '../../composables/useQueryState';
import { useReferenceData } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { readPage } from '../../api/paging';
import { getPublicServicePricing } from '../../utils/public-service-pricing';
import { useSmoothScroll } from '../../composables/useSmoothScroll';

const router = useRouter();
const selectedCategoryId = useQueryState('category', (raw) => raw?.trim() ?? '', (value) => value || undefined);
const { input: searchInput, search } = useQuerySearch('q');
const reference = useReferenceData();
const categories = ref<ServiceCategory[]>([]);
const categoriesLoading = ref(true);
const categoriesReady = ref(false);
const categoriesError = ref(false);
const resultsHeading = ref<HTMLElement | null>(null);
const focusResultsAfterPageChange = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);
const suggestionsOpen = ref(false);
const activeSuggestionIndex = ref(-1);
const isComposing = ref(false);

type SearchSuggestion =
  | { key: string; kind: 'query'; label: string; detail: string; query: string }
  | { key: string; kind: 'category'; label: string; detail: string; categoryId: string }
  | { key: string; kind: 'service'; label: string; detail: string; service: ServiceItem };

const motionPreference = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const reduceMotion = ref(motionPreference?.matches ?? false);
if (!reduceMotion.value) useSmoothScroll();
const categoryPointerInside = ref(false);
const categoryFocusInside = ref(false);
const categoryHaloPaused = computed(() => categoryPointerInside.value || categoryFocusInside.value);
const categoryHaloIndex = ref(0);
let categoryHaloTimer: ReturnType<typeof setInterval> | null = null;
const syncMotionPreference = (event: MediaQueryListEvent) => { reduceMotion.value = event.matches; };

// Temporary metadata path: GET /categories also returns nested services.
// Backend should add an opt-in lightweight category summary before public release.
async function loadCategories() {
  categoriesLoading.value = true;
  categoriesError.value = false;
  try {
    categories.value = await reference(
      queryKeys.reference.categories({ activeOnly: true }),
      () => catalogApi.getCategories(true),
    );
  } catch {
    categoriesError.value = true;
  } finally {
    categoriesReady.value = true;
    categoriesLoading.value = false;
  }
}

onMounted(() => {
  void loadCategories();
  motionPreference?.addEventListener('change', syncMotionPreference);
});

watch([categoriesReady, categories, categoriesError, selectedCategoryId], () => {
  if (!categoriesReady.value || categoriesError.value || !selectedCategoryId.value) return;
  if (!categories.value.some((category) => category.id === selectedCategoryId.value)) {
    selectedCategoryId.value = '';
  }
}, { immediate: true });

const {
  page,
  items,
  total,
  loading,
  refreshing,
  changingPage,
  error,
  load,
  prefetch,
} = usePagedList<ServiceItem>({
  key: () => queryKeys.reference.services({
    categoryId: selectedCategoryId.value || undefined,
    search: search.value || undefined,
  }),
  pageSize: 12,
  enabled: () => !categoriesLoading.value,
  fetch: async (requestedPage, pageSize) => {
    const response = await catalogApi.getServices({
      page: requestedPage,
      limit: 12,
      ...(selectedCategoryId.value ? { categoryId: selectedCategoryId.value } : {}),
      ...(search.value ? { search: search.value } : {}),
    });
    return readPage(response, { page: requestedPage, pageSize });
  },
});

const categoryNames = computed(() => new Map(categories.value.map((category) => [category.id, category.name])));
const spotlightCategories = computed(() => categories.value.slice(0, 5));
const categoryHaloTargets = computed(() => [
  ...(!selectedCategoryId.value ? [] : ['all']),
  ...spotlightCategories.value
    .map((category) => category.id)
    .filter((categoryId) => categoryId !== selectedCategoryId.value),
]);
const categoryHaloTarget = computed(() => !reduceMotion.value && categoryHaloTargets.value.length
  ? categoryHaloTargets.value[categoryHaloIndex.value % categoryHaloTargets.value.length]
  : '');
const hasFilters = computed(() => Boolean(selectedCategoryId.value || search.value));
const busy = computed(() => categoriesLoading.value || loading.value || refreshing.value || changingPage.value);
const searchSuggestions = computed<SearchSuggestion[]>(() => {
  if (!suggestionsOpen.value) return [];

  const term = searchInput.value.trim().slice(0, 100);
  if (!term) {
    return spotlightCategories.value.map((category) => ({
      key: `category-${category.id}`,
      kind: 'category',
      label: category.name,
      detail: 'Danh mục dịch vụ',
      categoryId: category.id,
    }));
  }

  const foldedTerm = normalizeSuggestion(term);
  const categoryMatches = categories.value
    .filter((category) => normalizeSuggestion(category.name).includes(foldedTerm))
    .slice(0, 3)
    .map((category) => ({
      key: `category-${category.id}`,
      kind: 'category' as const,
      label: category.name,
      detail: 'Lọc theo danh mục',
      categoryId: category.id,
    }));
  const serviceMatches = !busy.value && !error.value && term === search.value
    ? items.value.slice(0, 3).map((service) => ({
      key: `service-${service.id}`,
      kind: 'service' as const,
      label: service.name,
      detail: categoryName(service) || 'Dịch vụ trong kết quả',
      service,
    }))
    : [];

  return [
    { key: 'query', kind: 'query' as const, label: `Tìm “${term}” trong dịch vụ`, detail: 'Tất cả dịch vụ', query: term },
    ...categoryMatches,
    ...serviceMatches,
  ].slice(0, 6);
});
const activeSuggestionId = computed(() => activeSuggestionIndex.value >= 0 && searchSuggestions.value[activeSuggestionIndex.value]
  ? `service-suggestion-${activeSuggestionIndex.value}`
  : undefined);
watch(searchInput, () => { activeSuggestionIndex.value = -1; });
const pageAnnouncement = computed(() => {
  if (loading.value || categoriesLoading.value) return 'Đang tải dịch vụ.';
  if (changingPage.value) return `Đang tải trang ${page.value}.`;
  if (total.value === 0) return 'Không có kết quả dịch vụ.';
  const first = (page.value - 1) * 12 + 1;
  const last = Math.min(page.value * 12, total.value);
  return `Đang hiển thị ${first} đến ${last} trong ${total.value} dịch vụ.`;
});

function syncCategoryHaloTimer() {
  if (categoryHaloTimer) {
    clearInterval(categoryHaloTimer);
    categoryHaloTimer = null;
  }
  if (reduceMotion.value || categoryHaloPaused.value || categoryHaloTargets.value.length < 2) return;
  categoryHaloTimer = setInterval(() => {
    categoryHaloIndex.value = (categoryHaloIndex.value + 1) % categoryHaloTargets.value.length;
  }, 1250);
}

watch([reduceMotion, categoryHaloPaused, categoryHaloTargets], syncCategoryHaloTimer, { immediate: true });

function pauseCategoryHaloForFocus() {
  categoryFocusInside.value = true;
}

function releaseCategoryHaloFocus(event: FocusEvent) {
  const group = event.currentTarget as HTMLElement;
  const nextTarget = event.relatedTarget as Node | null;
  if (nextTarget && group.contains(nextTarget)) return;
  categoryFocusInside.value = false;
}

function selectCategory(id: string) {
  replaceFilters(id, searchInput.value);
}

function clearSearch() {
  searchInput.value = '';
  search.value = '';
  suggestionsOpen.value = true;
  activeSuggestionIndex.value = -1;
  focusSearch();
}

function clearFilters() {
  searchInput.value = '';
  suggestionsOpen.value = false;
  replaceFilters('', '');
}

function replaceFilters(categoryId: string, query: string) {
  const trimmedQuery = query.trim().slice(0, 100);
  void router.replace({
    path: '/services',
    query: {
      ...(categoryId ? { category: categoryId } : {}),
      ...(trimmedQuery ? { q: trimmedQuery } : {}),
    },
  });
}

function normalizeSuggestion(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi-VN');
}

function openSuggestions() {
  suggestionsOpen.value = true;
  activeSuggestionIndex.value = -1;
}

function handleSearchInput(event: Event) {
  if ((event as InputEvent).isComposing || isComposing.value) return;
  openSuggestions();
}

function closeSuggestions() {
  suggestionsOpen.value = false;
  activeSuggestionIndex.value = -1;
}

function focusSearch() {
  void nextTick(() => searchInputRef.value?.focus({ preventScroll: true }));
}

function chooseSuggestion(index: number) {
  const suggestion = searchSuggestions.value[index];
  if (!suggestion) return;

  closeSuggestions();
  if (suggestion.kind === 'query') {
    search.value = suggestion.query;
    focusSearch();
  } else if (suggestion.kind === 'category') {
    replaceFilters(suggestion.categoryId, searchInput.value);
    focusSearch();
  } else {
    void router.push(detailTarget(suggestion.service));
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.isComposing || isComposing.value) return;

  if (event.key === 'Escape') {
    if (suggestionsOpen.value) event.preventDefault();
    closeSuggestions();
    return;
  }
  if (event.key === 'Tab') {
    closeSuggestions();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!searchSuggestions.value.length) {
      suggestionsOpen.value = true;
      return;
    }
    event.preventDefault();
    suggestionsOpen.value = true;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const start = activeSuggestionIndex.value < 0
      ? (direction > 0 ? -1 : 0)
      : activeSuggestionIndex.value;
    activeSuggestionIndex.value = (start + direction + searchSuggestions.value.length) % searchSuggestions.value.length;
    return;
  }
  if (event.key === 'Enter') {
    if (activeSuggestionIndex.value >= 0) {
      event.preventDefault();
      chooseSuggestion(activeSuggestionIndex.value);
    } else if (searchInput.value.trim()) {
      event.preventDefault();
      search.value = searchInput.value.trim().slice(0, 100);
      closeSuggestions();
    }
  }
}

function finishComposition(event: CompositionEvent) {
  isComposing.value = false;
  searchInput.value = (event.target as HTMLInputElement).value;
  openSuggestions();
}

function detailTarget(service: ServiceItem) {
  return { name: 'service-detail', params: { slug: service.slug || service.id } };
}

function bookService(service: ServiceItem) {
  if (!service.isActive) return;
  void router.push({ path: '/app/bookings/new', query: { serviceId: service.id } });
}

function categoryName(service: ServiceItem): string {
  return service.category?.name ?? categoryNames.value.get(service.categoryId) ?? '';
}

function categoryFor(service: ServiceItem): ServiceCategory | undefined {
  return service.category ?? categories.value.find((category) => category.id === service.categoryId);
}

function pricing(service: ServiceItem) {
  return getPublicServicePricing(service);
}

function fixedAmount(service: ServiceItem): number {
  const result = pricing(service);
  return result.kind === 'fixed' ? result.amount : 0;
}

function referenceRange(service: ServiceItem) {
  const result = pricing(service);
  return result.kind === 'inspection' ? result.referenceRange : undefined;
}

function setPage(nextPage: number) {
  focusResultsAfterPageChange.value = true;
  page.value = nextPage;
}

watch(page, async () => {
  if (!focusResultsAfterPageChange.value) return;
  focusResultsAfterPageChange.value = false;
  await nextTick();
  resultsHeading.value?.focus({ preventScroll: true });
});

onBeforeUnmount(() => {
  focusResultsAfterPageChange.value = false;
  motionPreference?.removeEventListener('change', syncMotionPreference);
  if (categoryHaloTimer) clearInterval(categoryHaloTimer);
});
</script>

<template>
  <div class="public-services">
    <section class="services-hero" aria-labelledby="services-title">
      <div class="services-hero__copy">
        <p class="services-eyebrow">Dịch vụ sửa chữa tại nhà</p>
        <h1 id="services-title">Tìm đúng dịch vụ sửa chữa.</h1>
        <p class="services-hero__lead">
          Tra cứu phạm vi và mức giá trước khi chọn lịch.
        </p>
      </div>

      <div
        class="services-search-stage"
        :class="{
          'services-search-stage--active': suggestionsOpen,
          'search-spotlight--reduced-motion': reduceMotion,
          'category-halo-paused': categoryHaloPaused,
        }"
        data-testid="search-spotlight"
      >
        <div
          class="category-cloud"
          role="group"
          aria-label="Gợi ý danh mục dịch vụ"
          data-testid="spotlight-categories"
          @mouseenter="categoryPointerInside = true"
          @mouseleave="categoryPointerInside = false"
          @focusin="pauseCategoryHaloForFocus"
          @focusout="releaseCategoryHaloFocus"
          @keydown="pauseCategoryHaloForFocus"
        >
          <button
            type="button"
            class="category-suggestion"
            :class="{
              'category-suggestion--selected': !selectedCategoryId,
              'category-suggestion--halo': categoryHaloTarget === 'all',
            }"
            :aria-pressed="!selectedCategoryId"
            data-testid="category-all"
            @mouseenter="categoryPointerInside = true"
            @mouseleave="categoryPointerInside = false"
            @click="selectCategory('')"
          >
            <LayoutGrid :size="15" :stroke-width="1.8" aria-hidden="true" />
            <span>Tất cả dịch vụ</span>
          </button>
          <button
            v-for="category in spotlightCategories"
            :key="category.id"
            type="button"
            class="category-suggestion"
            :class="{
              'category-suggestion--selected': selectedCategoryId === category.id,
              'category-suggestion--halo': categoryHaloTarget === category.id,
            }"
            :aria-pressed="selectedCategoryId === category.id"
            :data-testid="`category-${category.id}`"
            @mouseenter="categoryPointerInside = true"
            @mouseleave="categoryPointerInside = false"
            @click="selectCategory(category.id)"
          >
            <component :is="categoryIcon(category)" :size="15" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ category.name }}</span>
          </button>
        </div>

        <div class="services-search-panel">
          <label for="service-search">Tìm kiếm dịch vụ</label>
          <div class="services-search-field">
            <Search :size="21" :stroke-width="1.8" aria-hidden="true" />
            <input
              id="service-search"
              ref="searchInputRef"
              v-model="searchInput"
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-controls="service-suggestions"
              :aria-expanded="suggestionsOpen"
              :aria-activedescendant="activeSuggestionId"
              maxlength="100"
              autocomplete="off"
              placeholder="Ví dụ: vệ sinh máy lạnh, rò rỉ nước"
              @focus="openSuggestions"
              @input="handleSearchInput"
              @blur="closeSuggestions"
              @keydown="handleSearchKeydown"
              @compositionstart="isComposing = true"
              @compositionend="finishComposition"
            />
            <button
              v-if="searchInput"
              type="button"
              class="search-clear"
              aria-label="Xóa nội dung tìm kiếm"
              @mousedown.prevent
              @click="clearSearch"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>
          <p>Giá niêm yết hoặc báo giá sau khảo sát được ghi rõ ở từng dịch vụ.</p>

          <Transition name="search-suggestions">
            <div
              v-if="suggestionsOpen && searchSuggestions.length"
              id="service-suggestions"
              class="search-suggestions"
              role="listbox"
              aria-label="Gợi ý tìm dịch vụ"
              data-testid="service-suggestions"
            >
              <button
                v-for="(suggestion, index) in searchSuggestions"
                :id="`service-suggestion-${index}`"
                :key="suggestion.key"
                type="button"
                class="search-suggestion"
                role="option"
                :aria-selected="activeSuggestionIndex === index"
                @mousedown.prevent
                @click="chooseSuggestion(index)"
              >
                <span class="search-suggestion__copy">
                  <strong>{{ suggestion.label }}</strong>
                  <small>{{ suggestion.detail }}</small>
                </span>
                <ArrowRight :size="16" aria-hidden="true" />
              </button>
            </div>
          </Transition>
          <p v-if="suggestionsOpen && categoriesLoading" class="search-suggestion-status" role="status">
            Đang tải danh mục…
          </p>
        </div>
      </div>

      <div v-if="categoriesError" class="category-error" role="status">
        <p>Danh mục chưa tải được. Bạn vẫn có thể tìm trong toàn bộ dịch vụ.</p>
        <button type="button" @click="loadCategories">Thử tải lại</button>
      </div>
    </section>

    <section class="services-results" aria-labelledby="results-heading" :aria-busy="busy">
      <p class="sr-only" role="status" aria-live="polite">{{ pageAnnouncement }}</p>
      <div class="results-heading-row">
        <div>
          <p class="section-kicker">Danh mục FixHome</p>
          <h2 id="results-heading" ref="resultsHeading" tabindex="-1">Tất cả dịch vụ</h2>
          <p class="results-description">
            {{ hasFilters ? 'Kết quả theo bộ lọc bạn đã chọn.' : 'Xem phạm vi và mức giá của từng dịch vụ.' }}
          </p>
        </div>
        <div class="results-count" aria-live="polite">
          <strong>{{ new Intl.NumberFormat('vi-VN').format(total) }}</strong>
          <span>dịch vụ</span>
        </div>
      </div>

      <div v-if="loading || categoriesLoading" class="service-grid service-grid--loading" aria-label="Đang tải dịch vụ">
        <article v-for="index in 8" :key="index" class="service-card service-card--skeleton" aria-hidden="true">
          <div class="skeleton-topline"><FhSkeleton width="48px" height="48px" rounded="md" /><FhSkeleton width="94px" height="26px" rounded="full" /></div>
          <FhSkeleton width="42%" height="13px" />
          <FhSkeleton width="84%" height="25px" />
          <FhSkeleton height="16px" :count="2" />
          <div class="skeleton-bottomline"><FhSkeleton width="118px" height="30px" /><FhSkeleton width="112px" height="44px" rounded="md" /></div>
        </article>
      </div>

      <FhEmptyState
        v-else-if="error"
        title="Không thể tải danh sách dịch vụ"
        description="Vui lòng kiểm tra kết nối rồi thử lại."
        action-text="Thử lại"
        @action="load"
      />

      <FhEmptyState
        v-else-if="total === 0"
        :title="hasFilters ? 'Chưa tìm thấy dịch vụ phù hợp' : 'Chưa có dịch vụ nào'"
        :description="hasFilters ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem thêm dịch vụ.' : 'Danh mục dịch vụ đang được cập nhật.'"
        :icon="Search"
      >
        <template v-if="hasFilters" #extra>
          <button type="button" class="clear-filters" @click="clearFilters">Xóa bộ lọc</button>
        </template>
      </FhEmptyState>

      <template v-else>
        <div class="service-grid" :class="{ 'service-grid--busy': changingPage || refreshing }">
          <article
            v-for="(service, index) in items"
            :key="service.id"
            class="service-card"
            :style="{ animationDelay: `${Math.min(index, 7) * 24}ms` }"
          >
            <div class="service-card__top">
              <div class="service-mark" aria-hidden="true">
                <component :is="categoryIcon(categoryFor(service))" :size="20" :stroke-width="1.75" />
              </div>
              <span v-if="categoryName(service)" class="service-category">{{ categoryName(service) }}</span>
            </div>

            <div class="service-card__mode" :class="`service-card__mode--${pricing(service).kind}`">
              <span class="mode-dot" aria-hidden="true"></span>
              {{ pricing(service).kind === 'fixed' ? 'Giá cố định' : pricing(service).kind === 'inspection' ? 'Báo giá sau khảo sát' : 'Chưa xác định giá' }}
            </div>

            <h3 class="service-card__title">
              <RouterLink :to="detailTarget(service)">{{ service.name }}</RouterLink>
            </h3>
            <p v-if="service.scopeDescription || service.description" class="service-card__description">
              {{ service.scopeDescription || service.description }}
            </p>

            <div v-if="service.estimatedMinutes > 0" class="service-duration">
              <Clock :size="15" :stroke-width="1.8" aria-hidden="true" />
              <span>Thời lượng dự kiến</span>
              <strong>~{{ service.estimatedMinutes }} phút</strong>
            </div>

            <div class="service-price">
              <template v-if="pricing(service).kind === 'fixed'">
                <span class="service-price__label">Giá niêm yết</span>
                <strong><FhMoney :amount="fixedAmount(service)" /> <small v-if="service.unit">/ {{ service.unit }}</small></strong>
              </template>
              <template v-else-if="pricing(service).kind === 'inspection'">
                <span class="service-price__label">Giá được báo sau khi kiểm tra</span>
                <strong>Báo giá sau khảo sát</strong>
                <span v-if="referenceRange(service)" class="service-price__range">
                  Khoảng tham khảo:
                  <FhMoney :amount="referenceRange(service)!.min" /> –
                  <FhMoney :amount="referenceRange(service)!.max" />
                </span>
              </template>
              <template v-else>
                <span class="service-price__label">Giá dịch vụ</span>
                <strong class="service-price__unknown">Thông tin giá đang được cập nhật</strong>
              </template>
            </div>

            <div class="service-card__actions">
              <RouterLink class="service-details-link" :to="detailTarget(service)">
                Chi tiết <ArrowRight :size="15" aria-hidden="true" />
              </RouterLink>
              <FhButton
                variant="primary"
                size="md"
                :disabled="!service.isActive"
                :data-testid="`service-booking-${service.id}`"
                @click="bookService(service)"
              >
                Chọn dịch vụ
              </FhButton>
            </div>
          </article>
        </div>

        <div class="service-pagination__viewport">
          <FhPagination
            class="service-pagination"
            :page="page"
            :page-size="12"
            :total="total"
            :disabled="changingPage"
            @update:page="setPage"
            @prefetch="prefetch"
          />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.public-services {
  --service-ease: cubic-bezier(0.22, 1, 0.36, 1);
  width: min(100% - 48px, 1240px);
  margin: 0 auto;
  padding: 42px 0 96px;
  color: var(--color-ink-900);
}

.services-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 13px;
  padding: 22px 0 46px;
  text-align: center;
}

.services-hero__copy { width: min(100%, 800px); }
.services-eyebrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-brand-700);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  margin: 0 0 14px;
}
.services-hero h1 {
  max-width: 780px;
  margin: 0 auto;
  font-size: clamp(36px, 4.25vw, 56px);
  line-height: 1.12;
  letter-spacing: -0.04em;
  font-weight: 700;
  text-wrap: balance;
}
.services-hero__lead {
  max-width: 54ch;
  margin: 13px auto 0;
  color: var(--color-ink-600);
  font-size: 15px;
  line-height: 1.6;
  text-wrap: pretty;
}

.services-search-stage {
  position: relative;
  isolation: isolate;
  display: grid;
  width: min(100%, 1120px);
  grid-template-columns: minmax(0, 1fr) minmax(0, 720px) minmax(0, 1fr);
  grid-template-rows: 48px 136px 48px;
  align-items: center;
  column-gap: 12px;
  row-gap: 4px;
  margin: 1px auto 0;
}
.services-search-stage--active { z-index: 4; }

.category-cloud { display: contents; }
.category-suggestion {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-height: 44px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: visible;
  padding: 0 12px;
  border: 1px solid var(--color-ink-200);
  border-radius: 999px;
  background: var(--color-ink-25);
  box-shadow: 0 8px 24px rgb(22 63 132 / 7%);
  color: var(--color-ink-700);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
  animation: category-float 7s ease-in-out infinite;
  transition: border-color 220ms var(--service-ease), background-color 220ms var(--service-ease), color 220ms var(--service-ease), box-shadow 220ms var(--service-ease);
}
.category-suggestion::after {
  position: absolute;
  z-index: 0;
  inset: -4px;
  border: 1px solid rgb(59 130 246 / 35%);
  border-radius: inherit;
  box-shadow: 0 0 0 3px rgb(37 99 235 / 9%), 0 7px 20px rgb(37 99 235 / 13%);
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 420ms ease;
}
.category-suggestion > * { position: relative; z-index: 1; }
.category-suggestion svg { flex: 0 0 auto; color: var(--color-brand-700); }
.category-suggestion span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.category-suggestion:nth-child(1) { grid-column: 1; grid-row: 1; justify-self: start; margin-left: 7px; animation-delay: -1.2s; animation-duration: 6.5s; }
.category-suggestion:nth-child(2) { grid-column: 1; grid-row: 2; justify-self: end; margin-right: 2px; animation-delay: -3.5s; animation-duration: 7.4s; }
.category-suggestion:nth-child(3) { grid-column: 1; grid-row: 3; justify-self: start; margin-left: 31px; animation-delay: -5.2s; animation-duration: 7.8s; }
.category-suggestion:nth-child(4) { grid-column: 3; grid-row: 1; justify-self: end; margin-right: 14px; animation-delay: -2.3s; animation-duration: 6.9s; }
.category-suggestion:nth-child(5) { grid-column: 3; grid-row: 2; justify-self: start; margin-left: 11px; animation-delay: -4.4s; animation-duration: 7.2s; }
.category-suggestion:nth-child(6) { grid-column: 3; grid-row: 3; justify-self: end; margin-right: 29px; animation-delay: -6.1s; animation-duration: 7.7s; }
.category-suggestion--halo:not(.category-suggestion--selected)::after { opacity: 1; }
.category-halo-paused .category-suggestion { animation-play-state: paused; }
.category-halo-paused .category-suggestion::after { transition-duration: 220ms; }
.category-suggestion:hover {
  border-color: var(--color-brand-300);
  background: var(--color-brand-50);
  color: var(--color-brand-800);
}
.category-suggestion--selected {
  border-color: var(--color-brand-600);
  background: var(--color-brand-50);
  color: var(--color-brand-800);
  box-shadow: 0 0 0 1px rgb(39 99 204 / 12%), 0 8px 24px rgb(22 63 132 / 9%);
}
.services-search-panel {
  position: relative;
  z-index: 2;
  grid-column: 2;
  grid-row: 2;
  justify-self: center;
  width: min(100%, 760px);
  padding: 0;
}
.services-search-panel label {
  display: block;
  margin: 0 0 10px 2px;
  color: var(--color-ink-700);
  font-size: 13px;
  font-weight: 600;
}
.services-search-field {
  display: flex;
  min-height: 70px;
  align-items: center;
  gap: 14px;
  padding: 0 20px;
  border: 1px solid var(--color-brand-200);
  border-radius: 20px;
  background: var(--color-ink-25);
  color: var(--color-brand-700);
  box-shadow: 0 16px 48px rgb(37 99 235 / 9%), 0 2px 6px rgb(27 54 96 / 4%);
  transition: transform 240ms var(--service-ease), border-color 220ms var(--service-ease), box-shadow 240ms var(--service-ease);
}
.services-search-field:focus-within {
  border-color: var(--color-brand-600);
  box-shadow: 0 0 0 4px var(--color-brand-100), 0 20px 56px rgb(37 99 235 / 15%);
  transform: scale(1.012);
}
.services-search-field input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-ink-900);
  font: inherit;
  font-size: 17px;
}
.services-search-field input::placeholder { color: var(--color-ink-600); opacity: 1; }
.services-search-field input:focus-visible { outline: 0; }
.services-search-panel > p {
  margin: 10px 2px 0;
  color: var(--color-ink-600);
  font-size: 12px;
  line-height: 1.5;
}
.search-suggestions {
  position: absolute;
  z-index: 5;
  top: calc(100% + 9px);
  right: 0;
  left: 0;
  max-height: min(286px, 42vh);
  overflow-y: auto;
  padding: 7px;
  border: 1px solid var(--color-ink-200);
  border-radius: 18px;
  background: var(--color-ink-25);
  box-shadow: var(--shadow-e2);
}
.search-suggestion {
  display: flex;
  width: 100%;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 13px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--color-ink-900);
  text-align: left;
  cursor: pointer;
  transition: background-color 180ms var(--service-ease), color 180ms var(--service-ease);
}
.search-suggestion__copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.search-suggestion strong { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.search-suggestion small { color: var(--color-ink-600); font-size: 11px; }
.search-suggestion > svg { flex: 0 0 auto; color: var(--color-brand-700); }
.search-suggestion:hover, .search-suggestion[aria-selected="true"] { background: var(--color-brand-50); color: var(--color-brand-800); }
.search-suggestion-status { padding: 11px 3px 0; color: var(--color-ink-600); font-size: 12px; }
.search-suggestions-enter-active, .search-suggestions-leave-active { transition: opacity 200ms var(--service-ease), transform 200ms var(--service-ease); }
.search-suggestions-enter-from, .search-suggestions-leave-to { opacity: 0; transform: translateY(-6px) scale(0.99); }
.search-spotlight--reduced-motion .services-search-field,
.search-spotlight--reduced-motion .category-suggestion,
.search-spotlight--reduced-motion .search-suggestion,
.search-spotlight--reduced-motion .search-suggestions-enter-active,
.search-spotlight--reduced-motion .search-suggestions-leave-active { transition: none; }
.search-spotlight--reduced-motion .services-search-field:focus-within,
.search-spotlight--reduced-motion.services-search-stage--active .category-suggestion { transform: none; }
.search-clear {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink-600);
  cursor: pointer;
}
.search-clear:hover { background: var(--color-ink-100); color: var(--color-ink-900); }

.results-heading-row {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
}
.section-kicker { margin: 0 0 7px; font-size: 11px; text-transform: uppercase; }
.results-heading-row h2 {
  margin: 0;
  color: var(--color-ink-900);
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: -0.025em;
  font-weight: 600;
}
.category-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 15px;
  border-radius: var(--radius-sm);
  background: var(--color-warning-50);
  color: var(--color-warning-800);
  font-size: 13px;
}
.category-error p { margin: 0; }
.category-error button, .clear-filters {
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--color-brand-700);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.services-results { border-top: 1px solid var(--color-ink-200); padding-top: 33px; }
.results-heading-row { align-items: end; margin-bottom: 22px; }
.results-heading-row h2 { font-size: 26px; }
.results-heading-row h2:focus { outline: 2px solid var(--color-brand-600); outline-offset: 5px; border-radius: 3px; }
.results-description { margin: 8px 0 0; color: var(--color-ink-600); font-size: 13px; }
.results-count { display: flex; align-items: baseline; gap: 6px; padding-bottom: 4px; color: var(--color-ink-600); font-size: 13px; white-space: nowrap; }
.results-count strong { color: var(--color-ink-900); font-family: var(--font-num); font-size: 16px; font-variant-numeric: tabular-nums; }

.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  align-items: stretch;
  gap: 17px;
  transition: opacity 180ms var(--service-ease);
}
.service-grid--busy { opacity: 0.68; }
.service-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 21px;
  border: 1px solid var(--color-ink-200);
  border-radius: var(--radius-lg);
  background: var(--color-ink-25);
  box-shadow: var(--shadow-e1);
  animation: service-card-enter 260ms var(--service-ease) both;
  transition: border-color 180ms var(--service-ease), box-shadow 180ms var(--service-ease), transform 180ms var(--service-ease);
}
.service-card:hover { border-color: var(--color-ink-300); box-shadow: var(--shadow-e2); transform: translateY(-2px); }
.service-card__top { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 17px; }
.service-mark {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--color-brand-100);
  border-radius: 15px;
  background: var(--color-brand-50);
  color: var(--color-brand-700);
}
.service-category { max-width: 65%; color: var(--color-ink-600); font-size: 11px; font-weight: 500; text-align: right; }
.service-card__mode {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  margin-bottom: 8px;
  color: var(--color-ink-700);
  font-size: 11px;
  font-weight: 600;
}
.mode-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-ink-500); }
.service-card__mode--fixed { color: var(--color-brand-800); }
.service-card__mode--fixed .mode-dot { background: var(--color-brand-600); }
.service-card__mode--inspection { color: var(--color-warning-800); }
.service-card__mode--inspection .mode-dot { background: var(--color-warning-600); }
.service-card__title { margin: 0; font-size: 17px; line-height: 1.38; letter-spacing: -0.018em; font-weight: 600; text-wrap: balance; }
.service-card__title a { color: var(--color-ink-900); text-decoration: none; }
.service-card__title a:hover { color: var(--color-brand-700); text-decoration: underline; text-underline-offset: 3px; }
.service-card__description { display: -webkit-box; min-height: 42px; overflow: hidden; margin: 9px 0 0; color: var(--color-ink-600); font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.service-duration { display: flex; align-items: center; gap: 7px; margin-top: 15px; color: var(--color-ink-600); font-size: 11px; }
.service-duration svg { color: var(--color-ink-500); }
.service-duration strong { margin-left: auto; color: var(--color-ink-700); font-weight: 600; white-space: nowrap; }
.service-price { display: flex; min-height: 73px; flex-direction: column; justify-content: center; gap: 5px; margin-top: auto; padding: 17px 0 14px; border-bottom: 1px solid var(--color-ink-200); }
.service-price__label { color: var(--color-ink-600); font-size: 11px; }
.service-price > strong { display: flex; align-items: baseline; gap: 4px; color: var(--color-ink-900); font-size: 15px; line-height: 1.4; font-weight: 600; }
.service-price > strong small { color: var(--color-ink-600); font-size: 11px; font-weight: 500; white-space: nowrap; }
.service-price__range { color: var(--color-ink-700); font-size: 12px; }
.service-price__unknown { font-size: 12px !important; }
.service-card__actions { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 9px; padding-top: 13px; }
.service-details-link { display: inline-flex; min-height: 44px; align-items: center; gap: 5px; color: var(--color-brand-700); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.service-details-link svg { transition: transform 180ms var(--service-ease); }
.service-details-link:hover svg { transform: translateX(3px); }
.service-card__actions :deep(button) { min-height: 44px; padding-inline: 13px; font-size: 12px; }

.service-pagination__viewport { margin-top: 28px; }
.service-pagination__viewport :deep(button) { min-width: 44px; min-height: 44px; }
.service-pagination__viewport :deep(nav) { align-items: center; }
.service-pagination__viewport :deep([data-testid="pagination-summary"]) { color: var(--color-ink-700); }
.service-grid--loading .service-card { min-height: 274px; gap: 16px; animation: none; }
.skeleton-topline, .skeleton-bottomline { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.skeleton-bottomline { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--color-ink-200); }

@keyframes service-card-enter {
  from { opacity: 0; transform: translateY(9px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes category-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.public-services :is(a, button, input):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 3px;
}
.public-services .services-search-field input:focus-visible { outline: 0; outline-offset: 0; }

@media (max-width: 1160px) {
  .services-search-stage {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: auto auto auto;
    column-gap: 10px;
    row-gap: 10px;
  }
  .category-suggestion { justify-self: center !important; margin: 0 !important; }
  .category-suggestion:nth-child(1) { grid-column: 1; grid-row: 2; }
  .category-suggestion:nth-child(2) { grid-column: 2; grid-row: 2; }
  .category-suggestion:nth-child(3) { grid-column: 3; grid-row: 2; }
  .category-suggestion:nth-child(4) { grid-column: 1; grid-row: 3; }
  .category-suggestion:nth-child(5) { grid-column: 2; grid-row: 3; }
  .category-suggestion:nth-child(6) { grid-column: 3; grid-row: 3; }
  .services-search-panel { grid-column: 1 / -1; grid-row: 1; width: min(100%, 760px); }
  .services-search-stage--active .search-suggestions { z-index: 5; }
}

@media (max-width: 900px) {
  .public-services { width: min(100% - 40px, 1120px); padding-top: 43px; }
  .services-hero { align-items: center; gap: 24px; padding-bottom: 36px; }
  .services-hero h1 { max-width: 700px; font-size: clamp(36px, 6.5vw, 52px); }
}

@media (max-width: 560px) {
  .public-services { width: calc(100% - 32px); padding: 30px 0 72px; }
  .services-hero { gap: 22px; padding-top: 4px; padding-bottom: 29px; }
  .services-eyebrow { margin-bottom: 13px; }
  .services-hero h1 { font-size: clamp(34px, 9vw, 42px); line-height: 1.1; }
  .services-hero__lead { margin-top: 14px; font-size: 14px; }
  .services-hero__note { margin-top: 17px; font-size: 12px; }
  .services-search-panel { width: 100%; }
  .services-search-panel label { margin-bottom: 8px; }
  .services-search-field { min-height: 52px; gap: 9px; padding-inline: 12px; }
  .services-search-field input { font-size: 13px; }
  .services-search-panel > p { margin-top: 8px; font-size: 11px; }
  .services-search-stage { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 8px; row-gap: 8px; }
  .category-suggestion { min-height: 40px; gap: 6px; padding-inline: 8px; font-size: 11px; }
  .category-suggestion:nth-child(1) { grid-column: 1; grid-row: 2; }
  .category-suggestion:nth-child(2) { grid-column: 2; grid-row: 2; }
  .category-suggestion:nth-child(3) { grid-column: 1; grid-row: 3; }
  .category-suggestion:nth-child(4) { grid-column: 2; grid-row: 3; }
  .category-suggestion:nth-child(5) { grid-column: 1; grid-row: 4; }
  .category-suggestion:nth-child(6) { grid-column: 2; grid-row: 4; }
  .search-suggestions { top: calc(100% + 7px); max-height: 38vh; padding: 5px; border-radius: 15px; }
  .search-suggestion { min-height: 50px; padding-inline: 10px; }
  .results-heading-row h2 { font-size: 21px; }
  .category-error { align-items: flex-start; flex-direction: column; gap: 5px; }
  .services-results { padding-top: 25px; }
  .results-heading-row { align-items: flex-start; margin-bottom: 17px; }
  .results-count { padding-top: 20px; font-size: 12px; }
  .service-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .service-card { padding: 18px; }
  .service-card__title { font-size: 16px; }
  .service-card__description { min-height: 0; }
  .service-pagination__viewport { margin-top: 22px; }
  .service-grid--loading .service-card { min-height: 248px; }
}

@media (prefers-reduced-motion: reduce) {
  .category-suggestion { animation: none !important; }
  .category-suggestion::after { transition: none !important; }
  .public-services *, .public-services *::before, .public-services *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
