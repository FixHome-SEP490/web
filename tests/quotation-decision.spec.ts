import { describe, expect, it } from 'vitest';
import { canDecideOfficialQuotation } from '../src/utils/quotation-decision';

describe('Customer official quotation decision gate', () => {
  it.each(['SENT', 'sent'])('allows a live %s quote while en route', status => {
    expect(canDecideOfficialQuotation({ status: 'EN_ROUTE', quotation: { status } })).toBe(true);
  });
  it.each(['DRAFT', 'APPROVED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'pending', ''])(
    'does not allow another decision on a %s quotation', status => {
      expect(canDecideOfficialQuotation({ status: 'EN_ROUTE', quotation: { status } })).toBe(false);
    },
  );
  it.each(['ACCEPTED', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'])(
    'does not allow decisions when order is %s', status => {
      expect(canDecideOfficialQuotation({ status, quotation: { status: 'SENT' } })).toBe(false);
    },
  );
  it('rejects absent order/quotation', () => {
    expect(canDecideOfficialQuotation(null)).toBe(false);
    expect(canDecideOfficialQuotation({ status: 'EN_ROUTE' })).toBe(false);
  });
});