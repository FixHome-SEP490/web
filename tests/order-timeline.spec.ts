import { describe, expect, it } from 'vitest';
import { toTimelineSteps } from '../src/utils/order-timeline';

// flow-2211: "Technician accepted invitation (tự nhận việc)" reached the customer in English.
describe('order timeline notes', () => {
  const at = '2026-11-21T17:57:44.639Z';
  it('turns the auto-accept log line into Vietnamese', () => {
    const [step] = toTimelineSteps([{ status: 'accepted', title: 'Technician accepted invitation (tự nhận việc)', timestamp: at, actor: 'technician' }]);
    expect(step!.note).toBe('Kỹ thuật viên bật tự nhận việc nên đơn được nhận tự động');
    const [replacement] = toTimelineSteps([{ status: 'accepted', title: 'Replacement technician accepted invitation (tự nhận việc)', timestamp: at, actor: 'technician' }]);
    expect(replacement!.note).not.toMatch(/Technician|invitation/);
  });
  it('still hides plain English log lines and keeps Vietnamese reasons', () => {
    expect(toTimelineSteps([{ status: 'accepted', title: 'Technician accepted invitation', timestamp: at }])[0]!.note).toBeUndefined();
    expect(toTimelineSteps([{ status: 'cancelled', title: 'Không còn thợ thay thế', timestamp: at }])[0]!.note).toBe('Không còn thợ thay thế');
  });
});
