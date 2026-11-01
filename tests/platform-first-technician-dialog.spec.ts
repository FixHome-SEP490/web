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
it.each(['customer_absent', 'customer_unreachable'])('blocks unsupported group reason %s without any POST or success', async code => {
  const w = mount(CannotContinueDialog, { props: { ...props(), unified: true, visitGroupId: 'visit-1' }, global: { stubs: { Teleport: true } } });
  await w.get('[data-testid="report-reason-code"]').setValue(code);
  await ready(w);
  expect(w.text()).toContain('Cần xác minh, chưa hỗ trợ dừng cả lượt');
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click');
  expect(post).not.toHaveBeenCalled();
  expect(w.emitted('recorded')).toBeUndefined();
});
it('uses the same form for support-only without calling a stopping endpoint', async () => {
  const w = mount(CannotContinueDialog, { props: { ...props(), unified: true, supportAllowed: true }, global: { stubs: { Teleport: true } } });
  await w.get('[data-testid="report-mode"]').setValue('support');
  await w.get('textarea').setValue(reason);
  post.mockResolvedValue({ data: { success: true, statusCode: 201, message: 'OK', data: {
    id: incidentId, serviceOrderId: orderId, caseType: 'technician_replacement', status: 'open', reason,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  } } });
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/support/cases/technician-report', expect.objectContaining({ serviceOrderId: orderId, reasonCode: 'skill_gap', reason }));
  expect(w.emitted('supported')).toHaveLength(1);
  expect(w.emitted('recorded')).toBeUndefined();
});
it('only permits selecting supplied devices before any pending command or evidence', async () => {
  const w = mount(CannotContinueDialog, { props: { ...props(), unified: true, devices: [{ id: orderId, label: 'Máy 1' }, { id: 'other-order', label: 'Máy 2' }] }, global: { stubs: { Teleport: true } } });
  await w.get('[data-testid="report-device"]').setValue('other-order');
  expect(w.emitted('device')).toEqual([['other-order']]);
  expect(post).not.toHaveBeenCalled();
});
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
it.each([undefined, 503])('locks payload and replays the same command after uncertain failure %s, including reopen', async status => {
  const p = props(); post.mockRejectedValueOnce(status ? { response: { status } } : new Error('network')).mockResolvedValueOnce(receipt());
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
  expect(w.text()).toContain('không có quyền');
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
});
it('keeps a conflict locked when reopened and never sends a second command', async () => {
  const p = props();
  post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Cần check-in hợp lệ của lần phân công hiện tại tại nhà khách.' } } } });
  const w = mount(CannotContinueDialog, { props: p, global: { stubs: { Teleport: true } } });
  await ready(w);
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(w.text()).toContain('Cần check-in hợp lệ');
  expect(w.text()).toContain('tải lại công việc');
  w.unmount();
  const again = mount(CannotContinueDialog, { props: p, global: { stubs: { Teleport: true } } });
  expect(again.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  await again.get('[data-testid="cannot-continue-submit"]').trigger('click');
  expect(post).toHaveBeenCalledTimes(1);
  expect(again.emitted('recorded')).toBeUndefined();
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

it.each([[409, 'trạng thái'], [403, 'quyền'], [503, 'tạm thời']])('keeps two failed private photos explicit for HTTP %s, permits stop only after removal', async (status, message) => {
  post.mockRejectedValue({ response: { status } });
  const w = mount(CannotContinueDialog, { props: props(), global: { stubs: { Teleport: true } } });
  const files = [1, 2].map(i => new File(['photo'], `photo${i}.png`, { type: 'image/png' }));
  Object.defineProperty(w.get('input[type=file]').element, 'files', { value: files, configurable: true });
  await w.get('input[type=file]').trigger('change'); await flushPromises(); await ready(w);
  expect(post).toHaveBeenCalledTimes(2);
  expect(w.text()).toContain(message);
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  expect(w.emitted('recorded')).toBeUndefined();
  await w.get('button[aria-label="Xóa ảnh 2"]').trigger('click');
  await w.get('button[aria-label="Xóa ảnh 1"]').trigger('click');
  post.mockResolvedValue(receipt());
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post.mock.calls.at(-1)![1].photoEvidenceIds).toEqual([]);
  expect(w.emitted('recorded')).toHaveLength(1);
});

it('retries only the failed image and submits both private evidence IDs', async () => {
  const secondEvidenceId = '40000000-0000-4000-8000-000000000002';
  post.mockResolvedValueOnce({ data: { data: { id: evidenceId } } }).mockRejectedValueOnce({ response: { status: 503 } });
  const w = mount(CannotContinueDialog, { props: props(), global: { stubs: { Teleport: true } } });
  Object.defineProperty(w.get('input[type=file]').element, 'files', { value: [1, 2].map(i => new File(['photo'], `photo${i}.png`, { type: 'image/png' })), configurable: true });
  await w.get('input[type=file]').trigger('change'); await flushPromises(); await ready(w);
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  post.mockResolvedValueOnce({ data: { data: { id: secondEvidenceId } } });
  await w.findAll('button').find(button => button.text() === 'Thử lại ảnh')!.trigger('click'); await flushPromises();
  expect(post).toHaveBeenCalledTimes(3);
  post.mockResolvedValueOnce(receipt());
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post.mock.calls.at(-1)![1].photoEvidenceIds).toEqual([evidenceId, secondEvidenceId]);
  expect(w.emitted('recorded')).toHaveLength(1);
});
