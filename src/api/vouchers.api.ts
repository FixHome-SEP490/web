import apiClient from './client';

export type VoucherKind = 'GENERAL' | 'PERSONAL';
export interface VoucherPolicy {
  discount: 'PERCENT' | 'FIXED';
  value: number;
  capVnd: number | null;
  minimumVnd: number;
  categoryIds: string[];
  serviceIds: string[];
  components: ['LABOR', 'PARTS'];
}
export type VoucherCampaignLifecycle = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';
export interface VoucherCampaign {
  id: string;
  code: string;
  name: string;
  kind: VoucherKind;
  policy: VoucherPolicy;
  startsAt: string;
  endsAt: string;
  active: boolean;
  quota: number;
  redeemed: number;
  status?: VoucherCampaignLifecycle;
  version?: number;
  publishedAt?: string | null;
}
export interface VoucherClaim {
  id: string;
  campaignId: string;
  status: 'CLAIMED' | 'REDEEMED';
  redeemedAt: string | null;
  policySnapshot: VoucherPolicy;
  campaign: Pick<VoucherCampaign, 'code' | 'name' | 'kind' | 'startsAt' | 'endsAt' | 'active'>;
}
export interface GeneralVoucher {
  id: string;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  policy: VoucherPolicy;
}
export interface CreateVoucherCampaign {
  code: string;
  name: string;
  kind: VoucherKind;
  discount: VoucherPolicy['discount'];
  value: number;
  capVnd: number | null;
  minimumVnd: number;
  categoryIds: string[];
  serviceIds: string[];
  startsAt: string;
  endsAt: string;
  quota: number;
}
export type VoucherCampaignEdit = CreateVoucherCampaign & { version: number; commandId: string };
export type VoucherCampaignTransition = { version: number; commandId: string; status: 'PUBLISHED' | 'PAUSED' | 'ARCHIVED' };
export interface VoucherCheckoutPreview {
  scopeId: string;
  claimId: string;
  previewOnly: true;
  paymentAvailable: boolean;
  reason?: string | null;
  originalGrossVnd: number;
  eligibleBaseVnd: number;
  fixHomeDiscountSubsidyVnd: number;
  customerDueVnd: number;
  reasonCodes: string[];
}

function invalid(): never { throw new Error('Thông tin ưu đãi chưa đầy đủ. Vui lòng thử lại.'); }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= 2147483647;
}
function vndAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}
function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function policy(value: unknown): value is VoucherPolicy {
  return record(value) && ['PERCENT', 'FIXED'].includes(String(value.discount))
    && integer(value.value, 1) && (value.discount !== 'PERCENT' || value.value <= 100)
    && (value.capVnd === null || integer(value.capVnd, 1)) && integer(value.minimumVnd)
    && strings(value.categoryIds) && strings(value.serviceIds)
    && Array.isArray(value.components) && value.components.length === 2
    && value.components[0] === 'LABOR' && value.components[1] === 'PARTS';
}
function campaignInfo(value: unknown): value is VoucherClaim['campaign'] {
  return record(value) && typeof value.code === 'string' && typeof value.name === 'string'
    && ['GENERAL', 'PERSONAL'].includes(String(value.kind)) && typeof value.active === 'boolean'
    && date(value.startsAt) && date(value.endsAt);
}
function campaign(value: unknown): value is VoucherCampaign {
  return record(value) && typeof value.id === 'string' && policy(value.policy)
    && integer(value.quota, 1) && integer(value.redeemed) && value.redeemed <= value.quota
    && (value.status === undefined || ['DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED'].includes(String(value.status)))
    && (value.version === undefined || integer(value.version, 1))
    && (value.publishedAt === undefined || value.publishedAt === null || date(value.publishedAt))
    && campaignInfo(value);
}
function general(value: unknown): value is GeneralVoucher {
  return record(value) && typeof value.id === 'string' && typeof value.code === 'string'
    && typeof value.name === 'string' && date(value.startsAt) && date(value.endsAt) && policy(value.policy);
}
function claim(value: unknown): value is VoucherClaim {
  return record(value) && typeof value.id === 'string' && typeof value.campaignId === 'string'
    && ['CLAIMED', 'REDEEMED'].includes(String(value.status))
    && (value.status === 'CLAIMED' ? value.redeemedAt === null : date(value.redeemedAt))
    && policy(value.policySnapshot) && campaignInfo(value.campaign);
}
function unwrap<T>(payload: unknown, valid: (value: unknown) => value is T): T {
  if (!record(payload) || payload.success !== true || !valid(payload.data)) invalid();
  return payload.data;
}
function list<T>(valid: (value: unknown) => value is T) {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(valid);
}
function checkoutPreview(value: unknown): value is VoucherCheckoutPreview {
  const publicFields = [
    'scopeId', 'claimId', 'previewOnly', 'paymentAvailable', 'reason', 'originalGrossVnd',
    'eligibleBaseVnd', 'fixHomeDiscountSubsidyVnd', 'customerDueVnd', 'reasonCodes',
  ];
  const requiredFields = publicFields.filter((field) => field !== 'reason');
  return record(value) && Object.keys(value).every((field) => publicFields.includes(field))
    && requiredFields.every((field) => Object.hasOwn(value, field))
    && typeof value.scopeId === 'string' && typeof value.claimId === 'string'
    && value.previewOnly === true && typeof value.paymentAvailable === 'boolean'
    && (value.reason === undefined || value.reason === null || typeof value.reason === 'string')
    && vndAmount(value.originalGrossVnd) && vndAmount(value.eligibleBaseVnd)
    && vndAmount(value.fixHomeDiscountSubsidyVnd) && vndAmount(value.customerDueVnd)
    && strings(value.reasonCodes);
}

// JWT, refresh and safe transport errors remain owned by the shared Axios client.
export const vouchersApi = {
  async general(): Promise<GeneralVoucher[]> {
    return unwrap((await apiClient.get<unknown>('/vouchers/general')).data, list(general));
  },
  async wallet(): Promise<VoucherClaim[]> {
    return unwrap((await apiClient.get<unknown>('/vouchers/wallet')).data, list(claim));
  },
  async checkoutPreview(claimId: string, scopeId: string): Promise<VoucherCheckoutPreview> {
    if (!claimId || !scopeId) invalid();
    const result = unwrap((await apiClient.get<unknown>(`/vouchers/checkout-preview/${encodeURIComponent(claimId)}/${encodeURIComponent(scopeId)}`)).data, checkoutPreview);
    if (result.claimId !== claimId || result.scopeId !== scopeId) invalid();
    return result;
  },
  async claim(code: string): Promise<VoucherClaim> {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(normalized)) throw new Error('Mã ưu đãi cần 3–40 ký tự chữ, số, dấu gạch ngang hoặc gạch dưới.');
    return unwrap((await apiClient.post<unknown>('/vouchers/claim', { code: normalized })).data, claim);
  },
  async campaigns(): Promise<VoucherCampaign[]> {
    return unwrap((await apiClient.get<unknown>('/vouchers/campaigns')).data, list(campaign));
  },
  async create(input: CreateVoucherCampaign & { commandId?: string }): Promise<VoucherCampaign> {
    // Explicit DTO allowlist: UI flags, counters and financial values are never sent.
    const { code, name, kind, discount, value, capVnd, minimumVnd, categoryIds, serviceIds, startsAt, endsAt, quota, commandId } = input;
    return unwrap((await apiClient.post<unknown>('/vouchers/campaigns', {
      code, name, kind, discount, value, capVnd, minimumVnd, categoryIds, serviceIds, startsAt, endsAt, quota,
      ...(commandId ? { commandId } : {}),
    })).data, campaign);
  },
  async updateCampaign(id: string, input: VoucherCampaignEdit): Promise<VoucherCampaign> {
    const { code, name, kind, discount, value, capVnd, minimumVnd, categoryIds, serviceIds, startsAt, endsAt, quota, version, commandId } = input;
    const updated = unwrap((await apiClient.patch<unknown>(`/vouchers/campaigns/${encodeURIComponent(id)}`, {
      code, name, kind, discount, value, capVnd, minimumVnd, categoryIds, serviceIds, startsAt, endsAt, quota, version, commandId,
    })).data, campaign);
    if (updated.id !== id || updated.status !== 'DRAFT') invalid();
    return updated;
  },
  async transitionCampaign(id: string, input: VoucherCampaignTransition): Promise<VoucherCampaign> {
    const updated = unwrap((await apiClient.patch<unknown>(`/vouchers/campaigns/${encodeURIComponent(id)}/lifecycle`, input)).data, campaign);
    if (updated.id !== id) invalid();
    return updated;
  },
  async setActive(id: string, active: boolean): Promise<VoucherCampaign> {
    const result = unwrap((await apiClient.patch<unknown>(`/vouchers/campaigns/${encodeURIComponent(id)}/status`, { active })).data, campaign);
    if (result.id !== id || result.active !== active) invalid();
    return result;
  },
  async grant(campaignId: string, input: { customerId: string; grantId: string }): Promise<VoucherClaim> {
    const result = unwrap((await apiClient.post<unknown>(`/vouchers/campaigns/${encodeURIComponent(campaignId)}/grants`, {
      customerId: input.customerId, grantId: input.grantId,
    })).data, claim);
    if (result.campaignId !== campaignId || result.campaign.kind !== 'PERSONAL') invalid();
    return result;
  },
};
