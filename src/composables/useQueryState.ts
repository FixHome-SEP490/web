import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref, type WritableComputedRef } from 'vue';
import type { LocationQuery, Router } from 'vue-router';

// A value kept in the address bar (`?page=2`, `?tab=completed`) so going back
// from a detail page or refreshing lands on the same page of the same list.
// The router is read from the app (not imported), so a page still works with
// local state when it is mounted without one, as in unit tests.

const pending = new WeakMap<Router, Record<string, string | undefined>>();

function appRouter(): Router | null {
  const router = getCurrentInstance()?.appContext.config.globalProperties.$router as Router | undefined;
  return router && typeof router.replace === 'function' && router.currentRoute ? router : null;
}

function readRaw(query: LocationQuery, key: string): string | undefined {
  const value = query[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** Several keys changed in the same tick go out as one `replace`, so none is lost. */
function writeQuery(router: Router, key: string, value: string | undefined) {
  let changes = pending.get(router);
  if (!changes) {
    changes = {};
    pending.set(router, changes);
    queueMicrotask(() => {
      const batch = pending.get(router);
      pending.delete(router);
      if (!batch) return;
      const query: Record<string, string | (string | null)[] | null> = { ...router.currentRoute.value.query };
      for (const [k, v] of Object.entries(batch)) {
        if (v === undefined) delete query[k];
        else query[k] = v;
      }
      void router.replace({ query }).catch(() => undefined);
    });
  }
  changes[key] = value;
}

export function useQueryState<T>(
  key: string,
  parse: (raw: string | undefined) => T,
  serialize: (value: T) => string | undefined,
): WritableComputedRef<T> {
  const router = appRouter();
  const path = router?.currentRoute.value.path;
  const local = ref(parse(router ? readRaw(router.currentRoute.value.query, key) : undefined));

  if (router) {
    // Back and forward change the address bar; follow it while on this page.
    watch(
      () => router.currentRoute.value,
      (route) => {
        if (route.path !== path) return;
        const next = parse(readRaw(route.query, key));
        if (serialize(next) !== serialize(local.value as T)) local.value = next as typeof local.value;
      },
    );
  }

  return computed({
    get: () => local.value as T,
    set: (value: T) => {
      if (serialize(value) === serialize(local.value as T)) return;
      local.value = value as typeof local.value;
      if (router) writeQuery(router, key, serialize(value));
    },
  });
}

/** 1-based page number; 1 is left out of the address. */
export function useQueryPage(key = 'page'): WritableComputedRef<number> {
  return useQueryState(
    key,
    (raw) => {
      const n = Number(raw);
      return Number.isInteger(n) && n >= 1 ? n : 1;
    },
    (value) => (value > 1 ? String(value) : undefined),
  );
}

/** One of a fixed set of values (a tab or filter); the default is left out of the address. */
export function useQueryChoice<T extends string>(key: string, choices: readonly T[], fallback: T): WritableComputedRef<T> {
  return useQueryState(
    key,
    (raw) => (choices.includes(raw as T) ? (raw as T) : fallback),
    (value) => (value === fallback ? undefined : value),
  );
}

/** Longest search the backend accepts. */
export const SEARCH_MAX_LENGTH = 100;

/**
 * A search box backed by the server: `input` is what the box shows, `search`
 * is the trimmed text kept in the address (`?q=`), set about 300 ms after
 * typing stops so each key press does not send a request.
 */
export function useQuerySearch(key = 'q', delay = 300): { input: Ref<string>; search: WritableComputedRef<string> } {
  const search = useQueryState<string>(
    key,
    (raw) => (raw ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
    (value) => value.trim() || undefined,
  );
  const input = ref(search.value);
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(input, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      search.value = value.trim().slice(0, SEARCH_MAX_LENGTH);
    }, delay);
  });
  // Back and forward bring another search: show it in the box.
  watch(search, (value) => {
    if (value !== input.value.trim()) input.value = value;
  });
  if (getCurrentInstance()) onBeforeUnmount(() => clearTimeout(timer));
  return { input, search };
}
