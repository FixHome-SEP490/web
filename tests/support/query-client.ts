// Every mounted component gets a fresh query cache per test (installed through
// the global Vue Test Utils config), so no test sees another test's data.
// Retries are off so a failed read shows its error at once, and gcTime 0 drops
// data as soon as nothing uses it. Cache behaviour specs build their own client
// with `createTestQueryClient` and install it with `installQueryClient`.
import { afterEach, beforeEach } from 'vitest';
import { config } from '@vue/test-utils';
import { VueQueryPlugin, notifyManager, type QueryClient, type QueryClientConfig } from '@tanstack/vue-query';
import { createQueryClient } from '../../src/lib/query-client';

// Deliver query updates on the microtask queue: `flushPromises()` then sees them.
notifyManager.setScheduler(queueMicrotask);

export function createTestQueryClient(overrides: QueryClientConfig['defaultOptions'] = {}): QueryClient {
  return createQueryClient({
    defaultOptions: {
      ...overrides,
      queries: { retry: false, gcTime: 0, ...overrides.queries },
    },
  });
}

/** Mount option `global.plugins` entry that installs this client. */
export function withQueryClient(queryClient: QueryClient) {
  return [VueQueryPlugin, { queryClient }] as [typeof VueQueryPlugin, { queryClient: QueryClient }];
}

let current: QueryClient | null = null;

/** Use this client for every mount in the current test instead of the default one. */
export function installQueryClient(queryClient: QueryClient) {
  current?.clear();
  current = queryClient;
  config.global.plugins = [withQueryClient(queryClient)];
}

beforeEach(() => {
  current = createTestQueryClient();
  config.global.plugins = [withQueryClient(current)];
});

afterEach(() => {
  current?.clear();
  current = null;
  config.global.plugins = [];
});
