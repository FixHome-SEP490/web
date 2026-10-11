import { onMounted, ref, watch, type Ref, type WritableComputedRef } from 'vue';
import { pageCount, type PageResult } from '../api/paging';
import { useQueryPage } from './useQueryState';

export interface PagedListOptions<T> {
  pageSize: number;
  fetch: (page: number, pageSize: number) => Promise<PageResult<T>>;
  /** The page state; by default `?page=` in the address. */
  page?: WritableComputedRef<number> | Ref<number>;
  /** Load when the page mounts (default true). */
  immediate?: boolean;
}

/**
 * One server-paged list: the rows of the current page, the total, and a load
 * that ignores answers to requests made before the latest one.
 */
export function usePagedList<T>(options: PagedListOptions<T>) {
  const page = options.page ?? useQueryPage();
  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(true);
  const error = ref<unknown>(null);
  let latest = 0;

  async function load() {
    const id = ++latest;
    loading.value = true;
    error.value = null;
    try {
      const result = await options.fetch(page.value, options.pageSize);
      if (id !== latest) return;
      const last = pageCount(result.total, options.pageSize);
      if (page.value > last) {
        // An old link or a list that shrank: show the last page that exists.
        page.value = last;
        return;
      }
      items.value = result.items;
      total.value = result.total;
    } catch (err) {
      if (id === latest) error.value = err;
    } finally {
      if (id === latest) loading.value = false;
    }
  }

  /** After a filter changes: back to page 1 and load once. */
  function reset() {
    if (page.value !== 1) page.value = 1;
    else void load();
  }

  watch(() => page.value, () => void load());
  if (options.immediate !== false) onMounted(() => void load());

  return { page, items, total, loading, error, load, reset, pageSize: options.pageSize };
}
