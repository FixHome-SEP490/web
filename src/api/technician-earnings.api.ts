import apiClient from './client';

/** One completed order in the earnings list. */
export interface EarningsPayout {
  orderId: string;
  orderCode: string;
  /** dd/MM/yyyy in Vietnam time, as the server formats it. */
  date: string;
  completedAt: string | null;
  customer: string | null;
  serviceName: string | null;
  /** Labour before the platform fee. */
  gross: number;
  platformFee: number;
  /** Labour after the platform fee. */
  net: number;
  /** What the customer pays for the whole order. */
  orderValue: number;
  paid: boolean;
  status: string;
}

/** `GET /technicians/me/earnings`: totals for the whole range, payouts for the requested page. */
export interface EarningsSummary {
  from: string | null;
  to: string | null;
  totalCompletedOrders: number;
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  totalOrderValue: number;
  paidOrders: number;
  pendingDueCount: number;
  pendingDueAmount: number;
  rating: number | null;
  ratingCount: number;
  reliability: number | null;
  commissionRatePercent: number | null;
  payouts: EarningsPayout[];
  page: number;
  pageSize: number;
  total: number;
}

export interface EarningsQuery {
  /** yyyy-MM-dd, Vietnam calendar day, inclusive; left out = from the start. */
  from?: string | null;
  /** yyyy-MM-dd, inclusive; left out = up to now. */
  to?: string | null;
  page: number;
  pageSize: number;
}

const money = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const orNull = (value: unknown) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

function normalizePayout(row: Record<string, unknown>): EarningsPayout {
  return {
    orderId: String(row.orderId ?? ''),
    orderCode: String(row.orderCode ?? ''),
    date: String(row.date ?? ''),
    completedAt: text(row.completedAt),
    customer: text(row.customer),
    serviceName: text(row.serviceName),
    gross: money(row.gross),
    platformFee: money(row.platformFee),
    net: money(row.net),
    orderValue: money(row.orderValue),
    paid: row.paid === true,
    status: String(row.status ?? ''),
  };
}

export const technicianEarningsApi = {
  async getMyEarnings(query: EarningsQuery): Promise<EarningsSummary> {
    const params: Record<string, string | number> = { page: query.page, pageSize: query.pageSize };
    if (query.from) params.from = query.from;
    if (query.to) params.to = query.to;
    const res = await apiClient.get<{ data: Record<string, unknown> }>('/technicians/me/earnings', { params });
    const data = res.data?.data ?? {};
    const payouts = Array.isArray(data.payouts) ? (data.payouts as Record<string, unknown>[]).map(normalizePayout) : [];
    const totalCompletedOrders = money(data.totalCompletedOrders);
    return {
      from: text(data.from),
      to: text(data.to),
      totalCompletedOrders,
      totalGross: money(data.totalGross),
      totalCommission: money(data.totalCommission),
      totalNet: money(data.totalNet),
      totalOrderValue: money(data.totalOrderValue),
      paidOrders: money(data.paidOrders),
      pendingDueCount: money(data.pendingDueCount),
      pendingDueAmount: money(data.pendingDueAmount),
      rating: orNull(data.rating),
      ratingCount: money(data.ratingCount),
      reliability: orNull(data.reliability),
      commissionRatePercent: orNull(data.commissionRatePercent),
      payouts,
      page: money(data.page) || query.page,
      pageSize: money(data.pageSize) || query.pageSize,
      // The payouts list is the completed orders of the range.
      total: orNull(data.total) ?? totalCompletedOrders,
    };
  },
};
