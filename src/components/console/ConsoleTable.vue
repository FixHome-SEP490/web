<script setup lang="ts" generic="TRow extends object">
import ConsoleTableSkeleton from './ConsoleTableSkeleton.vue';

// Plain console table (PO 10/10/2026): clear columns, quiet header, rows that
// highlight on hover. Less important columns drop out on narrower screens
// (`hideBelow`) so the page never scrolls sideways at 1024px.
export interface ConsoleColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const props = withDefaults(defineProps<{
  columns: ConsoleColumn[];
  rows: TRow[];
  rowKey?: (row: TRow, index: number) => string | number;
  /** Optional `data-testid` per row, for scripts that check one record. */
  rowTestId?: (row: TRow) => string;
  loading?: boolean;
  emptyText?: string;
}>(), {
  rowKey: undefined,
  rowTestId: undefined,
  loading: false,
  emptyText: 'Không có dữ liệu.',
});

defineSlots<{
  [name: string]: (props: { row: TRow; index: number }) => unknown;
}>();

const HIDE: Record<NonNullable<ConsoleColumn['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};
const cellClass = (col: ConsoleColumn) => [
  col.hideBelow ? HIDE[col.hideBelow] : '',
  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
];
const keyOf = (row: TRow, index: number) => {
  if (props.rowKey) return props.rowKey(row, index);
  const id = (row as Record<string, unknown>).id;
  return typeof id === 'string' || typeof id === 'number' ? id : index;
};
const valueOf = (row: TRow, key: string) => (row as Record<string, unknown>)[key];
</script>

<template>
  <ConsoleTableSkeleton v-if="loading" :columns="Math.min(columns.length, 5)" />
  <div v-else class="overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-ink-100 bg-ink-25">
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-ink-500 first:pl-5 last:pr-5 xl:px-4"
              :class="cellClass(col)"
              :style="col.width ? { width: col.width } : undefined"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-ink-100">
          <tr v-if="rows.length === 0">
            <td :colspan="columns.length" class="px-5 py-10 text-center text-sm text-ink-500">
              <slot name="empty" :row="({} as TRow)" :index="-1">{{ emptyText }}</slot>
            </td>
          </tr>
          <tr
            v-for="(row, index) in rows"
            v-else
            :key="keyOf(row, index)"
            class="align-top transition-colors hover:bg-ink-25"
            :data-testid="rowTestId ? rowTestId(row) : undefined"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-3 text-ink-800 first:pl-5 last:pr-5 xl:px-4"
              :class="cellClass(col)"
            >
              <slot :name="`cell-${col.key}`" :row="row" :index="index">{{ col.label ? (valueOf(row, col.key) ?? '—') : '' }}</slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
