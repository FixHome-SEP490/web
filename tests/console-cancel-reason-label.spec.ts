import { describe, expect, it } from 'vitest';
import { cancelReasonLabel } from '../src/components/console/console-labels';

describe('cancelReasonLabel', () => {
  it('shows the server-written English reason in Vietnamese', () => {
    expect(cancelReasonLabel('Official quotation rejected; no agreement')).toBe('Khách từ chối báo giá, không thống nhất được giá');
  });
  it('keeps a reason a person typed', () => {
    expect(cancelReasonLabel(' Khách hủy lượt sửa ')).toBe('Khách hủy lượt sửa');
    expect(cancelReasonLabel(null)).toBe('');
  });
});
