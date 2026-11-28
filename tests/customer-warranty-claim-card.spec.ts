import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import WarrantyClaimCard from '../src/components/customer/WarrantyClaimCard.vue';
import type { WarrantyClaimView } from '../src/api/orders.api';

const claim = (overrides: Partial<WarrantyClaimView> = {}): WarrantyClaimView => ({
  id: 'c1', serviceOrderId: 'o1', warrantyCoverageId: 'cov1', status: 'resolved', description: 'Vẫn bị như cũ', evidenceRefs: null,
  submittedAfterExpiry: false, customerResponse: null, awaitingPrompt: null, resolutionNotes: null,
  submittedAt: '2026-11-22T00:07:00.000Z', resolvedAt: '2026-11-22T03:00:00.000Z', technician: { id: 't1', fullName: 'Kỹ thuật viên A' }, ...overrides,
});
const inspection = {
  result: 'covered_part', reasonCode: null, findings: 'Van xả bị hỏng', evidenceRefs: ['https://cdn.test/a.jpg'],
  reServiceNotes: 'Đã thay van mới', reServiceEvidenceRefs: ['https://cdn.test/b.jpg'], checkedInAt: null, completedAt: null,
};

describe('customer warranty claim card', () => {
  it('shows what the technician found and did once the claim is decided', () => {
    const wrapper = mount(WarrantyClaimCard, { props: { claim: claim({ inspection, outcomeCode: 'fixed' }) } });
    const text = wrapper.get('[data-testid="claim-inspection"]').text();
    for (const expected of ['Kết quả kiểm tra', 'Được bảo hành: lỗi do linh kiện đã thay', 'Van xả bị hỏng', 'Đã thay van mới', 'Đã khắc phục']) expect(text).toContain(expected);
    expect(wrapper.find('img[alt="Ảnh kiểm tra"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Ảnh sau xử lý"]').exists()).toBe(true);
  });

  it('gives the reason and the refund when the item could not be fixed or is not covered', () => {
    const unfixed = mount(WarrantyClaimCard, { props: { claim: claim({ inspection, outcomeCode: 'unfixed', refundAmount: 250000 }) } });
    expect(unfixed.get('[data-testid="claim-inspection"]').text()).toMatch(/Đã hoàn .*250\.000/);
    const rejected = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'rejected', inspection: { ...inspection, result: 'not_covered', reasonCode: 'customer_misuse', reServiceNotes: null, reServiceEvidenceRefs: null }, outcomeCode: 'rejected' }) } });
    expect(rejected.get('[data-testid="claim-inspection"]').text()).toContain('Không được bảo hành');
    expect(rejected.get('[data-testid="claim-inspection"]').text()).toContain('Lý do');
  });

  it('shows no result block while the claim has none', () => {
    expect(mount(WarrantyClaimCard, { props: { claim: claim({ status: 'inspected', resolvedAt: null }) } }).find('[data-testid="claim-inspection"]').exists()).toBe(false);
  });

  it('puts what the customer has to do first, and the inspection time while the technician is coming', () => {
    const waiting = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'awaiting_customer', awaitingPrompt: 'conclusion', resolvedAt: null }) } });
    expect(waiting.get('[data-testid="warranty-next-step"]').text()).toContain('Cần bạn phản hồi kết luận');
    const coming = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'accepted', resolvedAt: null, inspectionScheduledAt: '2026-10-01T03:00:00.000Z' }) } });
    expect(coming.get('[data-testid="warranty-next-step"]').text()).toContain('Lịch kiểm tra');
  });
});
