// One way to read a page of a list from the backend, whatever the endpoint
// calls its page size (`pageSize` or `limit`) or where it puts the total.

export interface PageResult<T> {
  items: T[];
  /** Rows across every page for the same filter. */
  total: number;
  page: number;
  pageSize: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

/**
 * Reads `{ data: [...], meta: { total, page, pageSize | limit } }`, the shape
 * every paged list returns. A body without a total is read as "this page is
 * all there is up to here", never as a made-up larger number.
 */
export function readPage<T, R = unknown>(
  body: unknown,
  requested: { page: number; pageSize: number },
  map?: (row: R) => T,
): PageResult<T> {
  const record = isRecord(body) ? body : {};
  const rows: unknown[] = Array.isArray(record.data) ? record.data : Array.isArray(body) ? body : [];
  const meta = isRecord(record.meta) ? record.meta : record;
  const items = map ? rows.map((row) => map(row as R)) : (rows as T[]);
  const page = toCount(meta.page) || requested.page;
  const pageSize = toCount(meta.pageSize) || toCount(meta.limit) || requested.pageSize;
  const total = toCount(meta.total) ?? toCount(record.total) ?? (page - 1) * pageSize + items.length;
  return { items, total, page, pageSize };
}

/** Pages needed for `total` rows; at least one so "page 1 of 1" stays true for an empty list. */
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Client-side page of a list that is already loaded (small admin tables only). */
export function slicePage<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const last = pageCount(rows.length, pageSize);
  const current = Math.min(Math.max(1, page), last);
  return {
    items: rows.slice((current - 1) * pageSize, current * pageSize),
    total: rows.length,
    page: current,
    pageSize,
  };
}

/** Filters the paged lists share: one state, several states in one request, a text search. */
export interface ListFilter {
  status?: string | null;
  /** Several states in one request (`statuses=a,b`); the total covers them all. */
  statuses?: readonly string[] | null;
  /** Server search; accents and case are ignored by the backend. */
  search?: string | null;
  /** Opt-in server filter for legacy lists that also have a parent VisitGroup list. */
  excludeVisitGroups?: boolean;
}

/** `status`/`statuses` in lower case as the backend enums are, `search` trimmed; empty values left out. */
export function filterParams(filter: ListFilter = {}): Record<string, string> {
  const params: Record<string, string> = {};
  const states = (filter.statuses ?? []).map((s) => s.toLowerCase()).filter(Boolean);
  if (states.length > 1) params.statuses = states.join(',');
  else if (states.length === 1) params.status = states[0];
  else if (filter.status) params.status = filter.status.toLowerCase();
  const search = filter.search?.trim();
  if (search) params.search = search;
  if (filter.excludeVisitGroups) params.excludeVisitGroups = 'true';
  return params;
}
