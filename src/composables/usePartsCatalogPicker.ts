import { computed, onScopeDispose, ref } from 'vue';
import { partsCatalogApi } from '../api/parts-catalog.api';
import type { FixHomePart } from '../api/admin-parts.api';

/** Server search and paging shared by the request and quotation pickers. */
export function usePartsCatalogPicker() {
  const items = ref<FixHomePart[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref(false);
  const query = ref('');
  const category = ref('ALL');
  const partsMap = ref(new Map<string, FixHomePart>());
  let page = 0;
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryAppend = false;

  async function load(append = false) {
    clearTimeout(timer);
    const current = ++version;
    const requestedPage = append ? page + 1 : 1;
    const search = query.value.trim() || (category.value === 'ALL' ? '' : category.value);
    retryAppend = append;
    loading.value = true;
    error.value = false;
    if (!append) { items.value = []; total.value = 0; }
    try {
      const result = await partsCatalogApi.getCatalog({ page: requestedPage, limit: 50, ...(search ? { search } : {}) });
      if (current !== version) return;
      items.value = append ? [...items.value, ...result.data] : result.data;
      total.value = result.meta?.total ?? result.data.length;
      page = requestedPage;
      for (const part of result.data) partsMap.value.set(part.id, part);
    } catch {
      if (current === version) error.value = true;
    } finally {
      if (current === version) loading.value = false;
    }
  }

  function searchSoon() {
    clearTimeout(timer);
    ++version; // Ignore an older response even during the debounce window.
    items.value = [];
    total.value = 0;
    loading.value = true;
    error.value = false;
    timer = setTimeout(() => void load(), 250);
  }
  function clear() { query.value = ''; category.value = 'ALL'; void load(); }
  function selectCategory(value: string) { category.value = value; void load(); }
  onScopeDispose(() => { clearTimeout(timer); ++version; });
  return {
    items, total, loading, error, query, category, partsMap,
    hasMore: computed(() => items.value.length < total.value),
    load, searchSoon, clear, selectCategory,
    loadMore: () => { if (!loading.value) void load(true); },
    retry: () => void load(retryAppend),
  };
}
