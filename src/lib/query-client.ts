// The one client-side cache of server data (TanStack Vue Query).
// A page that was opened before shows what it read last time at once and
// reads it again in the background (stale-while-revalidate); the user's own
// actions invalidate what they changed (see `query-keys.ts`), and signing out
// or signing in as someone else empties the cache.
import { QueryClient, type QueryClientConfig } from '@tanstack/vue-query';
import { getHttpStatus } from '../api/client';

/** Data younger than this is shown without asking the server again. */
export const STALE_TIME = 30_000;
/** A page not opened for this long loses its cached data. */
export const GC_TIME = 10 * 60_000;
/** Reference data that rarely changes: service catalog, categories, provinces, banks. */
export const REFERENCE_STALE_TIME = 10 * 60_000;

/** One retry for a network or server error; a 4xx answer will not change by asking again. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
        ...config.defaultOptions?.queries,
      },
      mutations: { retry: false, ...config.defaultOptions?.mutations },
    },
  });
}

export const queryClient = createQueryClient();

/** Drops every cached answer, so the next account never sees the previous one's data. */
export function clearQueryCache(): void {
  void queryClient.cancelQueries();
  queryClient.clear();
}
