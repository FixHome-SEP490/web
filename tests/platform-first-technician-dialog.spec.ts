import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { post }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
import CannotContinueDialog from '../src/components/technician/CannotContinueDialog.vue';
import { createCannotContinuePort } from '../src/api/platform-continuation.api';
enableAutoUnmount(afterEach);
const orderId = '10000000-0000-4000-8000-000000000001';
const bookingId = '20000000-0000-4000-8000-000000000001';
const incidentId = '30000000-0000-4000-8000-000000000001';
const evidenceId = '40000000-0000-4000-8000-000000000001';
const reason = 'Tôi không đủ kỹ năng xử lý thiết bị này.';
const props = () => ({ orderId, bookingId, visitGroupId: null, allowed: true, parts: [], partsKnown: true, port: createCannotContinuePort() });
const receipt = () => ({ data: { data: { version: 1, incidentId, serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED', serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
  oldObligations: { reviewRequired: true, quotePreserved: true, moneyPreserved: true, partsPreserved: true, physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' },
  customerContinuation: { eligible: true, independentNewBookingAllowed: true, prefilledRebookAvailable: false, requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true, source: { serviceOrderId: orderId, bookingId, incidentId, visitGroupId: null } } } } });
beforeEach(() => { post.mockReset(); });
async function ready(w: ReturnType<typeof mount>) {
  await w.get('textarea').setValue(reason);
  await w.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
}
it('requires explicit STOP confirmation and reason, distinct from objective failure and report-only', async () => {
  const w = mount(CannotContinueDialog, { props: props(), global: { stubs: { Teleport: true } } });
  expect(w.text()).toContain('chưa đồng nghĩa đơn đã hủy');
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  await w.get('textarea').setValue(reason);
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  await w.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
  post.mockResolvedValue(receipt());
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post.mock.calls[0]![0]).toBe(`/service-orders/${orderId}/cannot-continue`);
  expect(w.emitted('recorded')).toHaveLength(1);
  expect(post.mock.calls.some(([p]) => p.endsWith('/cancel') || p.endsWith('/repair-failed'))).toBe(false);
});
it('locks payload and replays the same command after network failure, including reopen', async () => {
  const p = props(); post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(receipt());
  const w = mount(CannotContinueDialog, { props: p, global: { stubs: { Teleport: true } } }); await ready(w);
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(w.get('textarea').attributes('disabled')).toBeDefined();
  expect(w.text()).toContain('cùng nội dung');
  w.unmount();
  const again = mount(CannotContinueDialog, { props: p, global: { stubs: { Teleport: true } } });
  await again.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
  expect(again.emitted('recorded')).toHaveLength(1);
});
it('uploads private ADDITIONAL evidence and sends only its UUID, never a URL', async () => {
  post.mockImplementation(async (path: string) => path.endsWith('/evidence') ? { data: { data: { id: evidenceId } } } : receipt());
  const w = mount(CannotContinueDialog, { props: props(), global: { stubs: { Teleport: true } } });
  const file = new File(['photo'], 'part.png', { type: 'image/png' });
  Object.defineProperty(w.get('input[type=file]').element, 'files', { value: [file], configurable: true });
  await w.get('input[type=file]').trigger('change'); await flushPromises();
  const form = post.mock.calls[0]![1] as FormData;
  expect(post.mock.calls[0]![0]).toBe(`/service-orders/${orderId}/evidence`);
  expect(form.get('type')).toBe('additional'); expect(form.get('file')).toBeInstanceOf(File);
  await ready(w); await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post.mock.calls[1]![1].photoEvidenceIds).toEqual([evidenceId]);
  expect(post.mock.calls[1]![1]).not.toHaveProperty('evidenceRefs');
});
it('prompts actual part declaration with manual physical acceptance and handles unknown ledger honestly', async () => {
  const w = mount(CannotContinueDialog, { props: { ...props(), parts: [{ id: 'part-1', label: 'Bo mạch × 1' }], partsKnown: false }, global: { stubs: { Teleport: true } } });
  expect(w.text()).toContain('Bo mạch');
  expect(w.text()).toContain('kiểm đếm');
  expect(w.text()).toContain('Chưa kiểm tra đủ');
  await w.get('[data-testid="cannot-continue-parts"]').trigger('click');
  expect(w.emitted('parts')).toHaveLength(1); expect(post).not.toHaveBeenCalled();
});
it('cannot submit without an eligible checked-in job; forbidden response does not report success', async () => {
  const w = mount(CannotContinueDialog, { props: { ...props(), allowed: false }, global: { stubs: { Teleport: true } } }); await ready(w);
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined(); expect(post).not.toHaveBeenCalled();
  await w.setProps({ allowed: true }); post.mockRejectedValue({ response: { status: 403 } });
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(w.emitted('recorded')).toBeUndefined();
  expect(w.text()).toContain('Quyền hoặc trạng thái');
});
it('does not emit success or restore old files after unmount while upload/send is pending', async () => {
  let finish!: (r: unknown) => void; post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const w = mount(CannotContinueDialog, { props: props(), global: { stubs: { Teleport: true } } }); await ready(w);
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); w.unmount();
  finish(receipt()); await flushPromises(); expect(w.emitted('recorded')).toBeUndefined();
});
it('traps keyboard focus and returns focus when closed', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const w = mount(CannotContinueDialog, { attachTo: document.body, props: props(), global: { stubs: { Teleport: true } } }); await flushPromises();
  const dialog = w.get('[role=dialog]'); expect(document.activeElement).toBe(dialog.element);
  await dialog.trigger('keydown', { key: 'Escape' }); expect(w.emitted('close')).toHaveLength(1);
  w.unmount(); expect(document.activeElement).toBe(opener); opener.remove();
});
