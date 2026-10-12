// A cached read for a page (stale-while-revalidate): a return visit shows the
// last answer at once and reads it again in the background when it is older
// than the stale time. `data` is a writable copy of the cached answer, so a
// page can still update what it shows right after an action.
import { computed, ref, toRaw, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { markChanged, refreshAfterChange } from '../lib/query-keys';
import { prefetchRoute } from '../lib/queries';
import { REFERENCE_STALE_TIME } from '../lib/query-client';

export interface CachedQueryOptions<T> {
  key: MaybeRefOrGetter<QueryKey>;
  fetch: () => Promise<T>;
  /** Read only while this is true (default always). */
  enabled?: MaybeRefOrGetter<boolean>;
  /** Override the client's stale time (reference data reads less often). */
  staleTime?: number;
  /**
   * Keep false for a page that spreads the answer over its own state and must
   * apply every fresh answer, even one equal to the last.
   */
  structuralSharing?: boolean;
  /**
   * Keep the previous answer on screen while a new key is read when this
   * returns true for the previous key (another page of the same list).
   */
  keepPreviousWhen?: (previousKey: QueryKey) => boolean;
}

/** Placeholder: the previous answer while a new key loads, when `test` accepts the previous key. */
function keepPreviousIf(test: (previousKey: QueryKey) => boolean) {
  return <D>(previous: D | undefined, previousQuery?: { queryKey: QueryKey }): D | undefined =>
    previousQuery && test(previousQuery.queryKey) ? previous : undefined;
}

export function useCachedQuery<T>(options: CachedQueryOptions<T>) {
  const client = useQueryClient();
  const keepPreviousWhen = options.keepPreviousWhen;
  const query = useQuery({
    queryKey: computed(() => toValue(options.key)),
    queryFn: () => options.fetch(),
    enabled: computed(() => (options.enabled === undefined ? true : toValue(options.enabled))),
    ...(keepPreviousWhen ? { placeholderData: keepPreviousIf(keepPreviousWhen) } : {}),
    ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
    ...(options.structuralSharing !== undefined ? { structuralSharing: options.structuralSharing } : {}),
  });

  const data = ref<T | undefined>(undefined) as Ref<T | undefined>;
  watch(
    () => query.data.value,
    (value) => {
      if (value !== undefined) data.value = toRaw(value) as T;
    },
    { immediate: true },
  );

  /** Nothing to show yet and a read is on its way: the skeleton. */
  const loading = computed(() => query.data.value === undefined && query.isFetching.value);
  /** Data on screen while a newer copy is being read. */
  const refreshing = computed(() => query.data.value !== undefined && query.isFetching.value);
  /** The last read failed and no newer read is running. */
  const error = computed<unknown>(() => (query.isFetching.value ? null : query.error.value));

  /** Reads again now; an answer to an older request is dropped. */
  async function refetch(): Promise<void> {
    await client.cancelQueries({ queryKey: toValue(options.key), exact: true });
    await query.refetch();
  }

  /** Replaces the cached answer (the server's reply to an action), on screen and for the next visit. */
  function setData(value: T) {
    data.value = value;
    client.setQueryData(toValue(options.key), value);
  }

  return { query, data, loading, refreshing, error, refetch, setData };
}

/**
 * Reads rarely changing reference data (catalog, categories, provinces) through
 * the cache: fresh for 10 minutes, so the next form or page that needs it opens
 * with it at once. A failed read is not cached.
 */
export function useReferenceData() {
  const client = useQueryClient();
  return <T>(key: QueryKey, fetch: () => Promise<T>): Promise<T> =>
    client.fetchQuery({ queryKey: key, queryFn: fetch, staleTime: REFERENCE_STALE_TIME });
}

/** For sidebar links: reads ahead what the linked page shows first. */
export function useRoutePrefetch() {
  const client = useQueryClient();
  return (path: string) => prefetchRoute(client, path);
}

/** `refreshAfterChange` and `markChanged` bound to the page's query client. */
export function useCacheUpdates() {
  const client = useQueryClient();
  return {
    /** Re-read what the action changed (on screen now) and drop the rest. */
    refresh: (keys: readonly QueryKey[]) => refreshAfterChange(client, keys),
    /** The page shows the new state already; drop or mark stale the other copies. */
    markChanged: (keys: readonly QueryKey[]) => markChanged(client, keys),
  };
}
