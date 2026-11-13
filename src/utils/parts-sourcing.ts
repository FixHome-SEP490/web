/**
 * F3 (CUSTOMER 72, TECH 66): whether the FixHome parts of a quote waiting for the customer can be
 * supplied. The backend answers; the approval itself re-checks and refuses with
 * PARTS_SOURCE_UNAVAILABLE, so this is only what the screens show and when they ask.
 */
export type PartsSourcingStatus = 'none' | 'covered' | 'available' | 'unavailable';
export interface MissingPart { partCatalogId: string; name: string; quantity: number }
export interface PartsSourcing { quotationId: string; quotationStatus: string; status: PartsSourcingStatus; missing: MissingPart[] }

type QuoteLike = { id?: string | null; status?: string | null; items?: Array<{ type?: string | null; partSource?: string | null }> | null } | null | undefined;

/** Only a quote still waiting for the customer with a FixHome part is worth asking about. */
export function needsSourcingCheck(quote: QuoteLike): boolean {
  if (!quote?.id || String(quote.status ?? '').toUpperCase() !== 'SENT') return false;
  return (quote.items ?? []).some(item => String(item.type ?? '').toUpperCase() !== 'LABOR' && item.partSource === 'fixhome');
}

/** The approval was refused because no warehouse holds the parts (HTTP 409, code PARTS_SOURCE_UNAVAILABLE). */
export function isPartsSourceUnavailable(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: { code?: unknown }; code?: unknown } } } | null)?.response;
  return response?.status === 409 && (response.data?.error?.code ?? response.data?.code) === 'PARTS_SOURCE_UNAVAILABLE';
}

export function readPartsSourcing(raw: unknown): PartsSourcing | null {
  const value = raw as Partial<PartsSourcing> | null;
  if (!value || typeof value !== 'object' || !['none', 'covered', 'available', 'unavailable'].includes(String(value.status))) return null;
  const missing = Array.isArray(value.missing) ? value.missing.filter(item => item && typeof item.name === 'string')
    .map(item => ({ partCatalogId: String(item.partCatalogId), name: item.name, quantity: Number(item.quantity) || 0 })) : [];
  return { quotationId: String(value.quotationId ?? ''), quotationStatus: String(value.quotationStatus ?? ''),
    status: value.status as PartsSourcingStatus, missing };
}

/** "Tụ quạt × 2, Bo mạch × 1" for the note. */
export function missingPartsText(missing: MissingPart[]): string {
  return missing.map(item => `${item.name} × ${item.quantity}`).join(', ');
}
