// Every cache key in one place. The first element is the resource; anything
// after it narrows the data (a filter, a page, an id). Invalidating a key
// prefix reaches every query under it, so `['orders']` covers every order list
// and order detail of every role.
import type { QueryClient, QueryKey } from '@tanstack/vue-query';

/** A filter object inside a key; key order does not matter to the cache. */
type Filter = Record<string, unknown>;

export const queryKeys = {
  /** Service orders of every role: lists, counts, details, repair history, cancellations. */
  orders: {
    all: ['orders'] as const,
    technicianJobs: (filter: Filter) => ['orders', 'technician-jobs', filter] as const,
    technicianJobCounts: ['orders', 'technician-job-counts'] as const,
    technicianActive: ['orders', 'technician-active'] as const,
    technicianDetail: (id: string) => ['orders', 'technician-detail', id] as const,
    /** Jobs with an appointment, for the week calendar of the schedule tab. */
    technicianCalendar: ['orders', 'technician-calendar'] as const,
    customerList: (filter: Filter) => ['orders', 'customer-list', filter] as const,
    customerRecent: ['orders', 'customer-recent'] as const,
    customerDetail: (id: string) => ['orders', 'customer-detail', id] as const,
    history: (filter: Filter) => ['orders', 'history', filter] as const,
    console: (filter: Filter) => ['orders', 'console', filter] as const,
    cancellations: ['orders', 'cancellations'] as const,
  },
  /** Booking requests before a technician takes them. */
  bookings: {
    all: ['bookings'] as const,
    customerList: (filter: Filter) => ['bookings', 'customer-list', filter] as const,
    board: (filter: Filter) => ['bookings', 'board', filter] as const,
    boardCounts: ['bookings', 'board-counts'] as const,
  },
  /** Invitations waiting for the technician. */
  invitations: {
    all: ['invitations'] as const,
    mine: ['invitations', 'mine'] as const,
  },
  /** Wallets and their history, technician and customer. */
  wallet: {
    all: ['wallet'] as const,
    technician: ['wallet', 'technician', 'summary'] as const,
    technicianTransactions: (filter: Filter) => ['wallet', 'technician', 'transactions', filter] as const,
    technicianWithdrawals: (filter: Filter) => ['wallet', 'technician', 'withdrawals', filter] as const,
    technicianBankAccount: ['wallet', 'technician', 'bank-account'] as const,
    customer: (filter: Filter) => ['wallet', 'customer', filter] as const,
    /** Which withdrawal step the customer is at (identity, bank account, open payout). */
    customerWithdrawalInfo: ['wallet', 'customer-withdrawal', 'info'] as const,
    customerWithdrawals: (filter: Filter) => ['wallet', 'customer-withdrawal', 'list', filter] as const,
  },
  /** Identity verification: the customer's own status and the admin review lists. */
  identity: {
    all: ['identity'] as const,
    customer: ['identity', 'customer'] as const,
    adminCustomers: (filter: Filter) => ['identity', 'admin-customers', filter] as const,
  },
  /** Technician earnings per period. */
  earnings: {
    all: ['earnings'] as const,
    period: (filter: Filter) => ['earnings', filter] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (filter: Filter) => ['notifications', 'list', filter] as const,
  },
  /** The signed-in technician's own profile, availability and verification. */
  technician: {
    all: ['technician'] as const,
    profile: ['technician', 'profile'] as const,
    availability: ['technician', 'availability'] as const,
    onboarding: ['technician', 'onboarding'] as const,
  },
  /** Warranty: the customer's covered orders and the technician's claims. */
  warranty: {
    all: ['warranty'] as const,
    customerOrders: (filter: Filter) => ['warranty', 'customer-orders', filter] as const,
    technicianClaims: (filter: Filter) => ['warranty', 'technician-claims', filter] as const,
  },
  /** The signed-in user's saved addresses. */
  addresses: ['addresses'] as const,
  /** Console overview (operational counts and orders to watch). */
  consoleDashboard: ['console-dashboard'] as const,
  /** Rarely changing data; read with `REFERENCE_STALE_TIME`. */
  reference: {
    all: ['reference'] as const,
    /** The full `GET /services` answer (`data` and `meta`) for these parameters. */
    services: (filter: Filter) => ['reference', 'services', filter] as const,
    categories: (filter: Filter) => ['reference', 'categories', filter] as const,
    /** Provinces with their districts. */
    provinces: ['reference', 'provinces'] as const,
    banks: ['reference', 'banks'] as const,
    /** Banks a customer withdrawal can go to (read through the customer's own endpoint). */
    customerBanks: ['reference', 'customer-banks'] as const,
  },
} as const;

/**
 * What each kind of user action can change. Money and order status must never
 * show what they were before the user's own action, so these groups are wide.
 */
export const affectedBy = {
  /** Any step of a service order: status, quotation, costs, evidence, payment, cash, cancellation. */
  orderChange: [
    queryKeys.orders.all,
    queryKeys.bookings.all,
    queryKeys.wallet.all,
    queryKeys.earnings.all,
    queryKeys.warranty.all,
    queryKeys.consoleDashboard,
  ],
  /** Accepting or declining an invitation creates an order or frees the booking. */
  invitationResponse: [
    queryKeys.invitations.all,
    queryKeys.orders.all,
    queryKeys.bookings.all,
    queryKeys.consoleDashboard,
  ],
  /** Creating, cancelling or assigning a booking. */
  bookingChange: [
    queryKeys.bookings.all,
    queryKeys.orders.all,
    queryKeys.invitations.all,
    queryKeys.consoleDashboard,
  ],
  /** Top-ups, withdrawals, wallet payments, bank account. */
  walletChange: [queryKeys.wallet.all, queryKeys.earnings.all],
  /** Submitting or reviewing an identity check: it decides whether the customer can withdraw. */
  identityChange: [queryKeys.identity.all, queryKeys.wallet.all],
  /** Profile, availability or auto-accept settings of the technician. */
  technicianSettings: [queryKeys.technician.all, queryKeys.invitations.all],
  /** Saved addresses of the user. */
  addressChange: [queryKeys.addresses],
  notificationsRead: [queryKeys.notifications.all],
  warrantyChange: [queryKeys.warranty.all, queryKeys.orders.all],
} satisfies Record<string, readonly QueryKey[]>;

/** Mutations that change no cached data (sign-in, chat, uploads before a save, AI, public tracking). */
const NO_CACHED_EFFECT = /^\/(auth|messages|conversations|media|ai|service-orders\/public)(\/|$)/;

/** Which cached data a successful write to `url` may have changed. */
const WRITE_EFFECTS: ReadonlyArray<readonly [RegExp, readonly QueryKey[]]> = [
  [/^\/(technician\/wallet|customer\/wallet|invoices)(\/|$)/, [...affectedBy.walletChange, ...affectedBy.orderChange]],
  [/^\/(customer\/verification|admin\/customer-verifications)(\/|$)/, affectedBy.identityChange],
  [/^\/(invitations)(\/|$)/, affectedBy.invitationResponse],
  [/^\/bookings(\/|$)/, affectedBy.bookingChange],
  [/^\/warranty-claims(\/|$)/, affectedBy.warrantyChange],
  [/^\/notifications(\/|$)/, affectedBy.notificationsRead],
  [/^\/technicians\/me(\/|$)/, affectedBy.technicianSettings],
  [/^\/me(\/|$)/, affectedBy.addressChange],
  [/^\/admin\/(categories|services)(\/|$)/, [queryKeys.reference.all]],
  [
    /^\/(service-orders|quotations|additional-costs|cancellations|part-requests|support|reputation)(\/|$)/,
    affectedBy.orderChange,
  ],
];

/** Everything that belongs to the signed-in user (not reference data). */
const ALL_USER_DATA: readonly QueryKey[] = [
  queryKeys.orders.all,
  queryKeys.bookings.all,
  queryKeys.invitations.all,
  queryKeys.wallet.all,
  queryKeys.earnings.all,
  queryKeys.notifications.all,
  queryKeys.technician.all,
  queryKeys.warranty.all,
  queryKeys.addresses,
  queryKeys.consoleDashboard,
  queryKeys.identity.all,
];

/**
 * The cached data a successful write may have changed. A write this table does
 * not know is treated as changing everything of the user: a slower next visit
 * is better than a stale order status or balance.
 */
export function keysChangedBy(url: string): readonly QueryKey[] {
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1/, '').split('?')[0] ?? '';
  if (NO_CACHED_EFFECT.test(path)) return [];
  const effects = WRITE_EFFECTS.filter(([pattern]) => pattern.test(path)).flatMap(([, keys]) => keys);
  return effects.length > 0 ? effects : ALL_USER_DATA;
}

/**
 * After the user's own action: data no page shows right now is dropped (so it
 * is read fresh, never shown stale, on the next visit) and data on screen is
 * read again. Resolves when the data on screen is fresh.
 */
export async function refreshAfterChange(client: QueryClient, keys: readonly QueryKey[]): Promise<void> {
  for (const queryKey of keys) client.removeQueries({ queryKey, type: 'inactive' });
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey, refetchType: 'active' })));
}

/**
 * After an action whose answer the page already shows (it updated its rows
 * from the server's reply): other copies are dropped or marked stale, the one
 * on screen is not read again.
 */
export function markChanged(client: QueryClient, keys: readonly QueryKey[]): void {
  for (const queryKey of keys) {
    client.removeQueries({ queryKey, type: 'inactive' });
    void client.invalidateQueries({ queryKey, refetchType: 'none' });
  }
}
