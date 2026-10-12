export type PageItem = number | 'gap';

/**
 * Page buttons to show: the first and last page, the current one and its
 * neighbours, with a gap where pages are skipped. A gap never hides a single
 * page (that page is shown instead), and near either end a few more pages
 * show so the row keeps the same length while paging.
 */
export function pageItems(current: number, count: number): PageItem[] {
  if (count <= 7) return Array.from({ length: Math.max(count, 0) }, (_, i) => i + 1);
  const page = Math.min(Math.max(1, current), count);
  const shown = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 4) [2, 3, 4, 5].forEach((p) => shown.add(p));
  if (page >= count - 3) [count - 4, count - 3, count - 2, count - 1].forEach((p) => shown.add(p));
  const sorted = [...shown].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous === 2) items.push(previous + 1);
    else if (p - previous > 2) items.push('gap');
    items.push(p);
    previous = p;
  }
  return items;
}

/** "21–40 / 57": rows shown on this page out of all of them. */
export function pageRangeLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return '0 / 0';
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  const fmt = (n: number) => n.toLocaleString('vi-VN');
  return `${fmt(from)}–${fmt(to)} / ${fmt(total)}`;
}
