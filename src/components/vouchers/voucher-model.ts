import { vouchersApi, type VoucherCampaign, type VoucherClaim, type VoucherPolicy, type GeneralVoucher } from '../../api/vouchers.api';

export type VoucherKind = 'GENERAL' | 'PERSONAL';
export type VoucherDiscountType = 'PERCENT' | 'FIXED';
export type VoucherStatus = 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED' | 'UNKNOWN';
export type VoucherWalletStatus = 'AVAILABLE' | 'RESERVED' | 'USED' | 'EXPIRED' | 'REVOKED';
export type VoucherScope = 'LABOR' | 'PARTS';
export const VOUCHER_CAMPAIGN_SUCCESS_LIMIT = 100;

export interface VoucherOffer {
  id: string;
  campaignActive?: boolean;
  redeemed?: number;
  categoryIds?: string[];
  serviceIds?: string[];
  claimable?: boolean;
  code: string;
  title: string;
  description: string;
  kind: VoucherKind;
  status: VoucherStatus;
  discount: { type: VoucherDiscountType; value: number; capVnd: number | null };
  minSpendVnd: number | null;
  scope: VoucherScope[];
  categoryNames: string[];
  serviceNames: string[];
  startsAt: string;
  expiresAt: string;
  perCustomerLimit: number | null;
  successfulRedemptionLimit: number | null;
  remainingSuccessfulRedemptions: number | null;
  ownerCustomerId?: string | null;
  walletStatus?: VoucherWalletStatus | null;
  eligibility: { eligible: boolean; reasons: string[] };
  reservation?: { expiresAt: string; serverTimeAtResponse: string } | null;
}

export interface VoucherCustomerSnapshot {
  customerId: string;
  vouchers: VoucherOffer[];
}

export interface VoucherAuditEvent {
  id: string;
  action: string;
  actorLabel: string;
  occurredAt: string;
  summary: string;
}

export interface VoucherAdminSnapshot {
  campaigns: VoucherOffer[];
  auditEvents: VoucherAuditEvent[];
}

export interface VoucherAdapter {
  readonly connected: boolean;
  loadCustomerSnapshot(customerId: string): Promise<VoucherCustomerSnapshot>;
  loadAdminSnapshot(): Promise<VoucherAdminSnapshot>;
  claimGeneralVoucher(voucherId: string): Promise<void>;
  validateManualCode(code: string): Promise<VoucherOffer>;
  createCampaign(draft: VoucherCampaignDraft): Promise<void>;
  setCampaignActive(id: string, active: boolean): Promise<VoucherOffer>;
  issuePersonalVoucher(input: { customerId: string; sourceVisitId: string }): Promise<void>;
}

export class VoucherIntegrationUnavailableError extends Error {
  constructor() {
    super(VOUCHER_UNAVAILABLE_MESSAGE);
    this.name = 'VoucherIntegrationUnavailableError';
  }
}

export const VOUCHER_UNAVAILABLE_MESSAGE =
  'Ưu đãi chưa thể sử dụng vì dịch vụ voucher chưa được kết nối.';

function offerPolicy(policy: VoucherPolicy) {
  return {
    discount: { type: policy.discount, value: policy.value, capVnd: policy.capVnd },
    minSpendVnd: policy.minimumVnd, scope: policy.components,
    categoryIds: policy.categoryIds, serviceIds: policy.serviceIds,
    categoryNames: [], serviceNames: [],
  };
}

export function campaignOffer(campaign: VoucherCampaign): VoucherOffer {
  return {
    ...offerPolicy(campaign.policy), id: campaign.id, code: campaign.code,
    title: campaign.name, description: '', kind: campaign.kind,
    campaignActive: campaign.active, status: campaign.active ? 'ACTIVE' : 'PAUSED',
    startsAt: campaign.startsAt, expiresAt: campaign.endsAt,
    redeemed: campaign.redeemed, successfulRedemptionLimit: campaign.quota,
    // Holds are not exposed. quota - redeemed is NOT remaining availability.
    remainingSuccessfulRedemptions: null, perCustomerLimit: campaign.kind === 'GENERAL' ? 1 : null,
    eligibility: { eligible: false, reasons: [] },
  };
}

export function claimOffer(claim: VoucherClaim, customerId: string): VoucherOffer {
  return {
    ...offerPolicy(claim.policySnapshot), id: claim.id, code: claim.campaign.code,
    title: claim.campaign.name, description: '', kind: claim.campaign.kind,
    status: claim.campaign.active ? 'UNKNOWN' : 'PAUSED',
    startsAt: claim.campaign.startsAt, expiresAt: claim.campaign.endsAt,
    ownerCustomerId: customerId, walletStatus: claim.status === 'REDEEMED' ? 'USED' : 'AVAILABLE',
    perCustomerLimit: claim.campaign.kind === 'GENERAL' ? 1 : null,
    successfulRedemptionLimit: null, remainingSuccessfulRedemptions: null,
    eligibility: { eligible: false, reasons: ['Điều kiện sử dụng sẽ được kiểm tra khi áp dụng ưu đãi được hỗ trợ.'] },
  };
}

export function generalOffer(campaign: GeneralVoucher): VoucherOffer {
  return {
    ...offerPolicy(campaign.policy), id: campaign.id, code: campaign.code, title: campaign.name,
    description: '', kind: 'GENERAL', status: 'UNKNOWN', claimable: true,
    startsAt: campaign.startsAt, expiresAt: campaign.endsAt, perCustomerLimit: 1,
    successfulRedemptionLimit: null, remainingSuccessfulRedemptions: null,
    eligibility: { eligible: false, reasons: [] },
  };
}

export const voucherAdapter: VoucherAdapter = {
  connected: true,
  async loadCustomerSnapshot(customerId) {
    return { customerId, vouchers: (await vouchersApi.wallet()).map(claim => claimOffer(claim, customerId)) };
  },
  async loadAdminSnapshot() {
    return { campaigns: (await vouchersApi.campaigns()).map(campaignOffer), auditEvents: [] };
  },
  async claimGeneralVoucher(code) { await vouchersApi.claim(code); },
  async validateManualCode(code) {
    // This is CLAIM, not a read-only validation or a financial APPLY.
    return claimOffer(await vouchersApi.claim(code), '');
  },
  async createCampaign(draft) {
    const errors = validateVoucherCampaignDraft(draft);
    if (errors.length) throw new Error(errors[0]);
    await vouchersApi.create({
      code: draft.code.trim().toUpperCase(), name: draft.title.trim(), kind: draft.kind ?? 'GENERAL',
      discount: draft.discountType, value: draft.discountValue, capVnd: draft.capVnd,
      minimumVnd: draft.minSpendVnd ?? 0, categoryIds: draft.categoryIds ?? [], serviceIds: draft.serviceIds ?? [],
      startsAt: `${draft.startsOn}${draft.startsOn.includes('T') ? ':00' : 'T00:00:00'}+07:00`, endsAt: `${draft.endsOn}${draft.endsOn.includes('T') ? ':00' : 'T23:59:59'}+07:00`,
      quota: draft.successfulRedemptionLimit,
    });
  },
  async setCampaignActive(id, active) { return campaignOffer(await vouchersApi.setActive(id, active)); },
  async issuePersonalVoucher() { throw new VoucherIntegrationUnavailableError(); },
};

export function canShowPersonalVoucher(offer: VoucherOffer, customerId: string | null): boolean {
  return offer.kind !== 'PERSONAL' || Boolean(customerId && offer.ownerCustomerId === customerId);
}

export function canShowCustomerWalletVoucher(offer: VoucherOffer, customerId: string | null): boolean {
  return Boolean(
    customerId
    && offer.ownerCustomerId === customerId
    && offer.walletStatus != null
    && canShowPersonalVoucher(offer, customerId),
  );
}

export function filterCustomerVoucherOffers(offers: VoucherOffer[], customerId: string | null): VoucherOffer[] {
  if (!customerId) return [];
  return offers.filter((offer) => {
    if (offer.kind === 'GENERAL' && offer.walletStatus == null) return true;
    return offer.kind === 'PERSONAL'
      ? canShowPersonalVoucher(offer, customerId)
      : offer.ownerCustomerId === customerId;
  });
}

export function getVoucherClaimGate(
  offer: VoucherOffer,
  context: { connected: boolean; customerId: string | null },
): { enabled: boolean; reason: string | null } {
  if (!context.connected) return { enabled: false, reason: VOUCHER_UNAVAILABLE_MESSAGE };
  if (!context.customerId) return { enabled: false, reason: 'Đăng nhập để lưu ưu đãi vào ví.' };
  if (offer.kind !== 'GENERAL') return { enabled: false, reason: 'Ưu đãi cá nhân chỉ dành cho tài khoản được cấp.' };
  if (offer.walletStatus === 'AVAILABLE') return { enabled: false, reason: 'Ưu đãi này đã được lưu trong ví.' };
  if (offer.walletStatus === 'RESERVED') return { enabled: false, reason: 'Ưu đãi đang được giữ chỗ cho một hóa đơn.' };
  if (offer.walletStatus === 'USED' || offer.walletStatus === 'EXPIRED' || offer.walletStatus === 'REVOKED') {
    return { enabled: false, reason: 'Ưu đãi này không còn lượt sử dụng.' };
  }
  // General discovery is filtered by the server. CLAIM saves to wallet without
  // checking financial eligibility or consuming successful-payment quota.
  if (offer.claimable === true) return { enabled: true, reason: null };
  if (offer.status !== 'ACTIVE') return { enabled: false, reason: 'Ưu đãi hiện không còn hoạt động.' };
  if (!offer.eligibility.eligible) {
    return { enabled: false, reason: offer.eligibility.reasons[0] || 'Ưu đãi chưa đủ điều kiện sử dụng.' };
  }
  if (offer.remainingSuccessfulRedemptions === null) {
    return { enabled: false, reason: 'Chưa xác nhận được số lượt ưu đãi còn lại.' };
  }
  if (offer.remainingSuccessfulRedemptions <= 0) {
    return { enabled: false, reason: 'Ưu đãi đã hết lượt.' };
  }
  return { enabled: true, reason: null };
}

export function remainingReservationSeconds(
  reservation: { expiresAt: string; serverTimeAtResponse: string },
  elapsedMs: number,
): number | null {
  const expiresAt = Date.parse(reservation.expiresAt);
  const serverTime = Date.parse(reservation.serverTimeAtResponse);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(serverTime) || !Number.isFinite(elapsedMs)) return null;
  const remainingMs = expiresAt - (serverTime + Math.max(0, elapsedMs));
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function formatVoucherCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatVoucherAmount(amount: number | null): string {
  if (amount === null || !Number.isSafeInteger(amount) || amount < 0) return 'Chưa xác định';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount)} ₫`;
}

export function formatVoucherDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export function voucherDiscountLabel(offer: VoucherOffer): string {
  if (!Number.isSafeInteger(offer.discount.value) || offer.discount.value <= 0) return 'Mức ưu đãi chưa xác định';
  return offer.discount.type === 'PERCENT'
    ? `Giảm ${offer.discount.value}%`
    : `Giảm ${formatVoucherAmount(offer.discount.value)}`;
}

export interface VoucherCampaignDraft {
  kind?: VoucherKind;
  categoryIds?: string[];
  serviceIds?: string[];
  title: string;
  code: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  capVnd: number | null;
  minSpendVnd: number | null;
  startsOn: string;
  endsOn: string;
  successfulRedemptionLimit: number;
  perCustomerLimit: number;
  scope: VoucherScope[];
}

export function validateVoucherCampaignDraft(draft: VoucherCampaignDraft): string[] {
  const errors: string[] = [];
  if (draft.title.trim().length < 1 || draft.title.trim().length > 120) errors.push('Tên chiến dịch cần từ 1 đến 120 ký tự.');
  if (!/^[A-Z0-9_-]{3,40}$/.test(draft.code.trim().toUpperCase())) errors.push('Mã ưu đãi cần từ 3 đến 40 ký tự chữ hoặc số.');
  if (!Number.isSafeInteger(draft.discountValue) || draft.discountValue <= 0 || draft.discountValue > 2147483647) errors.push('Mức ưu đãi phải lớn hơn 0.');
  if (draft.discountType === 'PERCENT' && draft.discountValue > 100) errors.push('Mức phần trăm không thể lớn hơn 100%.');
  if (draft.capVnd !== null && (!Number.isSafeInteger(draft.capVnd) || draft.capVnd <= 0 || draft.capVnd > 2147483647)) errors.push('Mức giảm tối đa phải là số tiền nguyên lớn hơn 0.');
  if (draft.minSpendVnd !== null && (!Number.isSafeInteger(draft.minSpendVnd) || draft.minSpendVnd < 0 || draft.minSpendVnd > 2147483647)) errors.push('Giá trị đơn tối thiểu không hợp lệ.');
  if (!draft.startsOn || !draft.endsOn || draft.endsOn <= draft.startsOn && draft.startsOn.includes('T') || !Number.isFinite(Date.parse(draft.startsOn)) || !Number.isFinite(Date.parse(draft.endsOn)) || draft.endsOn < draft.startsOn) errors.push('Thời gian kết thúc phải sau thời gian bắt đầu.');
  if (!Number.isSafeInteger(draft.successfulRedemptionLimit) || draft.successfulRedemptionLimit < 1 || draft.successfulRedemptionLimit > 2147483647) {
    errors.push('Hạn mức chiến dịch phải là số nguyên dương không quá 2.147.483.647.');
  }
  if (!Number.isSafeInteger(draft.perCustomerLimit) || draft.perCustomerLimit !== 1) errors.push('Ưu đãi chung chỉ được sử dụng một lần cho mỗi khách.');
  if (!draft.scope.includes('LABOR') || !draft.scope.includes('PARTS')) {
    errors.push('Voucher phải áp dụng cho cả tiền công và linh kiện.');
  }
  return errors;
}

export const voucherStatusLabels: Record<VoucherStatus, string> = {
  UNKNOWN: 'Chưa kiểm tra điều kiện',
  SCHEDULED: 'Sắp diễn ra',
  ACTIVE: 'Đang bật',
  PAUSED: 'Tạm dừng',
  EXPIRED: 'Đã hết hạn',
  EXHAUSTED: 'Hết lượt',
  REVOKED: 'Đã thu hồi',
};
