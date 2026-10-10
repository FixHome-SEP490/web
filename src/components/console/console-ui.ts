// Shared class strings for the console's compact toolbars and forms, so every
// list page uses the same control height, border and focus ring.
export const consoleField =
  'h-9 min-w-0 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

export const consoleSearchField = `${consoleField} w-full pl-9`;

export const consoleTextarea =
  'w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

export const consoleLabel = 'flex flex-col gap-1.5 text-sm font-medium text-ink-700';

/** The one sentence every console list shows when its data did not load (PO 10/10/2026). */
export const CONSOLE_LOAD_ERROR = 'Chưa tải được, vui lòng thử lại.';
