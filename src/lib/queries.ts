// Cached reads shared by a page and by the link that leads to it: the page uses
// the same key and the same read, so data read ahead on hover of a sidebar link
// is exactly what the page shows when it opens.
import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import { bookingsApi } from '../api/bookings.api';
import { dashboardApi, type OperationalDashboard } from '../api/dashboard.api';
import { isHistoricalOrder, ordersApi, type ServiceOrderItem } from '../api/orders.api';
import { technicianOnboardingApi } from '../api/technician-onboarding.api';
import { technicianProfileApi } from '../api/technician-profile.api';
import { walletApi } from '../api/wallet.api';
import { queryKeys } from './query-keys';

export interface ConsoleDashboardData {
  ops: OperationalDashboard;
  /** Up to five orders in progress. */
  watchOrders: ServiceOrderItem[];
}

export const sharedQueries = {
  /** Technician dashboard: the jobs that are not old orders of a previous technician. */
  technicianActiveJobs: {
    key: queryKeys.orders.technicianActive,
    fetch: async (): Promise<ServiceOrderItem[]> =>
      (await ordersApi.getTechnicianJobs()).filter((item): item is ServiceOrderItem => !isHistoricalOrder(item)),
  },
  technicianInvitations: {
    key: queryKeys.invitations.mine,
    fetch: () => bookingsApi.getMyInvitations(),
  },
  technicianWallet: {
    key: queryKeys.wallet.technician,
    fetch: () => walletApi.getMyWallet(),
  },
  technicianProfile: {
    key: queryKeys.technician.profile,
    fetch: () => technicianProfileApi.getMyProfile(),
  },
  technicianOnboarding: {
    key: queryKeys.technician.onboarding,
    fetch: () => technicianOnboardingApi.getStatus(),
  },
  customerRecentOrders: {
    key: queryKeys.orders.customerRecent,
    fetch: () => ordersApi.getCustomerOrders(),
  },
  consoleDashboard: {
    key: queryKeys.consoleDashboard,
    fetch: async (): Promise<ConsoleDashboardData> => {
      const [ops, orders] = await Promise.all([dashboardApi.getOperational(), ordersApi.getConsoleOrders()]);
      return {
        ops,
        watchOrders: orders.filter((o) => ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'].includes(o.status)).slice(0, 5),
      };
    },
  },
} satisfies Record<string, { key: QueryKey; fetch: () => Promise<unknown> }>;

type SharedQueryName = keyof typeof sharedQueries;

/** The main reads of each page a sidebar link opens. */
const ROUTE_QUERIES: Record<string, readonly SharedQueryName[]> = {
  '/tech': ['technicianActiveJobs', 'technicianInvitations', 'technicianWallet', 'technicianProfile'],
  '/tech/invitations': ['technicianInvitations', 'technicianProfile'],
  '/tech/wallet': ['technicianWallet'],
  '/tech/earnings': ['technicianWallet'],
  '/app': ['customerRecentOrders'],
  '/console': ['consoleDashboard'],
};

/** Reads ahead what the page at `path` shows first (fresh data is not read again). */
export function prefetchRoute(client: QueryClient, path: string): void {
  for (const name of ROUTE_QUERIES[path] ?? []) {
    const { key, fetch } = sharedQueries[name];
    void client.prefetchQuery({ queryKey: key, queryFn: fetch as () => Promise<unknown> });
  }
}
