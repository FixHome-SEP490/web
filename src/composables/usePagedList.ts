import { computed, ref, toRaw, watch, type Ref, type WritableComputedRef } from 'vue';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { pageCount, type PageResult } from '../api/paging';
import { useQueryPage } from './useQueryState';

export interface PagedListOptions<T, R extends PageResult<T> = PageResult<T>> {
  /**
   * Cache key of the list without the page: the resource and every filter
   * (`queryKeys.orders.console({ status, search })`). A change of filter goes
   * back to page 1.
   */
  key: () => QueryKey;
  pageSize: number;
  fetch: (page: number, pageSize: number) => Promise<R>;
  /** The page state; by default `?page=` in the address. */
  page?: WritableComputedRef<number> | Ref<number>;
  /** Read only while this is true (default always). */
  enabled?: () => boolean;
  /** Override the client's stale time. */
  staleTime?: number;
}

const keyText = (key: QueryKey) => JSON.stringify(key);

/**
 * One server-paged list backed by the query cache. Each page of each filter is
 * cached on its own: a return visit shows the rows at once and reads them again
 * in the background; moving to another page keeps the current rows on screen
 * (`refreshing`) until the new page arrives, so only the first visit shows the
 * skeleton (`loading`).
 */
export function usePagedList<T, R extends PageResult<T> = PageResult<T>>(options: PagedListOptions<T, R>) {
  const client = useQueryClient();
  const pageState = options.page ?? useQueryPage();
  const pageSize = options.pageSize;
  const base = computed(() => keyText(options.key()));

  // The page belongs to the filter it was chosen under. When the filter changes,
  // the key already asks for page 1 before the watcher below moves the page
  // state, so no request goes out for the old page number under the new filter.
  const pageBase = ref(base.value);
  const currentPage = computed(() => (pageBase.value === base.value ? pageState.value : 1));
  watch(base, (next) => {
    pageBase.value = next;
    if (pageState.value !== 1) pageState.value = 1;
  });

  const page = computed<number>({
    get: () => currentPage.value,
    set: (value: number) => {
      pageBase.value = base.value;
      pageState.value = value;
    },
  });

  const keyFor = (p: number): QueryKey => [...options.key(), { page: p, pageSize }];

  const query = useQuery({
    queryKey: computed(() => keyFor(currentPage.value)),
    queryFn: ({ queryKey }) => {
      const last = queryKey[queryKey.length - 1] as { page: number };
      return options.fetch(last.page, pageSize);
    },
    // Another page of the same list keeps the rows on screen meanwhile; another
    // filter does not (its rows would be wrong), it shows its cache or the skeleton.
    placeholderData: (previous, previousQuery) =>
      previousQuery && keyText(previousQuery.queryKey.slice(0, -1)) === base.value ? previous : undefined,
    enabled: computed(() => (options.enabled ? options.enabled() : true)),
    ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
  });

  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const result = ref<R | null>(null) as Ref<R | null>;

  // A page past the end (an old link, a list that shrank) moves to the last page.
  const outOfRange = computed(() => {
    const data = query.data.value;
    if (!data || query.isPlaceholderData.value) return false;
    return currentPage.value > pageCount(data.total, pageSize);
  });

  watch(
    () => query.data.value,
    (value) => {
      if (value === undefined) return;
      if (outOfRange.value) {
        page.value = pageCount(value.total, pageSize);
        return;
      }
      const raw = toRaw(value) as R;
      result.value = raw;
      items.value = raw.items;
      total.value = raw.total;
    },
    { immediate: true },
  );

  /** Nothing to show for this list yet: the skeleton. */
  const loading = computed(() => (query.data.value === undefined && query.isFetching.value) || outOfRange.value);
  /** Rows on screen while a newer copy or another page is being read. */
  const refreshing = computed(() => query.data.value !== undefined && query.isFetching.value);
  /** Another page of the list is on its way while the previous rows stay on screen. */
  const changingPage = computed(() => query.isPlaceholderData.value);
  const error = computed<unknown>(() => (query.isFetching.value ? null : query.error.value));

  /** Reads the current page again now; an answer to an older request is dropped. */
  async function load(): Promise<void> {
    await client.cancelQueries({ queryKey: keyFor(currentPage.value), exact: true });
    await query.refetch();
  }

  /** Back to page 1 (reads again when already there). */
  function reset() {
    if (page.value !== 1) page.value = 1;
    else void load();
  }

  /** Reads another page ahead (on hover of its button) so moving there is instant. */
  function prefetch(p: number) {
    if (!Number.isInteger(p) || p < 1 || p === currentPage.value) return;
    if (p > pageCount(total.value, pageSize)) return;
    void client.prefetchQuery({
      queryKey: keyFor(p),
      queryFn: () => options.fetch(p, pageSize),
      ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
    });
  }

  return { page, items, total, result, loading, refreshing, changingPage, error, load, reset, prefetch, pageSize, query };
}
