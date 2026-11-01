import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), sources: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: mocks, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../src/api/interruption-rebook.api', () => ({ interruptionRebookApi: { listAvailableStoppedSources: mocks.sources } }));
import CannotContinueDialog from '../src/components/technician/CannotContinueDialog.vue';
import GroupContactReadiness from '../src/components/technician/GroupContactReadiness.vue';
import StoppedDevicesRebookPicker from '../src/components/customer/StoppedDevicesRebookPicker.vue';
import { createGroupStopPort } from '../src/api/group-stop.api';
import { createCannotContinuePort } from '../src/api/platform-continuation.api';
enableAutoUnmount(afterEach);
const groupId = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000001';
const bookingId = '30000000-0000-4000-8000-000000000001';
const incidentId = '40000000-0000-4000-8000-000000000001';
const second = '50000000-0000-4000-8000-000000000001';
const envelope = (data: unknown) => ({ data: { data } });
const readiness = (ready = false) => ({ ready, contactCount: 2, callsSpaced: true, notificationSent: true,
  nextCallAt: '2026-11-01T00:05:00Z', nextEligibleAt: '2026-11-01T00:10:00Z', serverNow: ready ? '2026-11-01T00:10:00Z' : '2026-11-01T00:09:59Z' });
const props = () => ({ orderId, bookingId, visitGroupId: groupId, allowed: true, parts: [], partsKnown: true,
  unified: true, port: createCannotContinuePort(), groupPort: createGroupStopPort(), customerPhone: '0900000000',
  groupDevices: [{ id: bookingId, label: 'Máy 1', disposition: 'active' as const }, { id: second, label: 'Máy 2', disposition: 'protected' as const }] });
const receipt = (commandId: string) => ({ version: 1, groupId, commandId, stopped: [{ bookingId, orderId, incidentId,
  workStopped: true, assignmentReleased: true, operationalDisposition: 'STOPPED', financialFollowupRequired: true }],
  preserved: [{ bookingId: second, orderId: second, orderStatus: 'completed', outcome: 'succeeded', disposition: 'PRESERVED', financialFollowupRequired: true }],
  oldObligationsPreserved: true, financialFollowupRequired: true, automaticLiabilityApplied: false });
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(envelope(readiness())); mocks.sources.mockResolvedValue([bookingId, second]); });
afterEach(() => vi.useRealTimers());
it.each(['customer_absent', 'customer_unreachable'])('automatically switches %s to group, lists protected machines and only sends one atomic command', async code => {
  const w = mount(CannotContinueDialog, { props: props(), global: { stubs: { Teleport: true } } });
  await w.get('[data-testid="report-mode"]').setValue('support');
  await w.get('[data-testid="report-reason-code"]').setValue(code); await flushPromises();
  expect(w.text()).toContain('Máy 2 · Giữ nguyên kết quả');
  expect(w.text()).not.toContain('Phạm vi: chỉ máy đã chọn');
  expect((w.get('[data-testid="report-mode"]').element as HTMLSelectElement).value).toBe('stop');
  await w.get('textarea').setValue('Khách không có mặt tại địa chỉ hẹn');
  await w.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  mocks.get.mockResolvedValue(envelope(readiness(true)));
  await w.get('[data-testid="contact-refresh"]').trigger('click'); await flushPromises();
  mocks.post.mockImplementation(async (_path, body) => envelope(receipt(body.commandId)));
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post).toHaveBeenCalledWith(`/visit-groups/${groupId}/cannot-continue`, expect.objectContaining({ selectedOrderId: orderId, reasonCode: code }));
  expect(w.emitted('groupRecorded')).toHaveLength(1);
  expect(w.emitted('recorded')).toBeUndefined();
});
it('client countdown reaching zero never enables stop without a new GET readiness', async () => {
  vi.useFakeTimers();
  const w = mount(GroupContactReadiness, { props: { groupId, orderId, phone: '0900000000', port: createGroupStopPort(), disabled: false } });
  await flushPromises();
  await vi.advanceTimersByTimeAsync(1000);
  expect(w.get('[data-testid="group-countdown"]').text()).toContain('0:00');
  expect(w.emitted('readiness')?.at(-1)).toEqual([false]);
  mocks.get.mockRejectedValue(new Error('offline'));
  await w.get('[data-testid="contact-refresh"]').trigger('click'); await flushPromises();
  expect(w.emitted('readiness')?.at(-1)).toEqual([false]);
});
it('keeps group payload locked and reconciles the same command after uncertain ack and dialog reopen', async () => {
  const p = props(); mocks.get.mockResolvedValue(envelope(readiness(true)));
  mocks.post.mockRejectedValueOnce(new Error('uncertain'));
  const w = mount(CannotContinueDialog, { props: p, global: { stubs: { Teleport: true } } });
  await w.get('[data-testid="report-reason-code"]').setValue('customer_absent'); await flushPromises();
  await w.get('textarea').setValue('Khách không có mặt tại địa chỉ hẹn');
  await w.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(w.get('textarea').attributes('disabled')).toBeDefined();
  w.unmount();
  const again = mount(CannotContinueDialog, { props: { ...p, allowed: false }, global: { stubs: { Teleport: true } } });
  mocks.post.mockImplementation(async (_path, body) => envelope(receipt(body.commandId)));
  await again.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
  expect(again.emitted('groupRecorded')).toHaveLength(1);
});
it('sends a durable notice once, and an uncertain contact uses the same ID on reconciliation', async () => {
  mocks.get.mockResolvedValue(envelope({ ...readiness(), notificationSent: false }));
  const port = createGroupStopPort();
  const w = mount(GroupContactReadiness, { props: { groupId, orderId, phone: '0900000000', port, disabled: false } });
  await flushPromises();
  mocks.post.mockRejectedValueOnce(new Error('offline'));
  await w.get('[data-testid="contact-notice"]').trigger('click'); await flushPromises();
  expect(port.pendingContact(groupId, orderId)).toBe('IN_APP_NOTIFICATION');
  mocks.post.mockResolvedValue(envelope({ ...readiness(), evidenceId: incidentId, recordedAt: '2026-11-01T00:01:00Z', callConnectionVerified: false }));
  mocks.get.mockResolvedValue(envelope(readiness()));
  await w.get('[data-testid="contact-reconcile"]').trigger('click'); await flushPromises();
  expect(mocks.post.mock.calls[0]).toEqual(mocks.post.mock.calls[1]);
  expect(w.get('[data-testid="contact-notice"]').attributes('disabled')).toBeDefined();
});
it('only routes selected stopped devices and clears stale selection on group switch', async () => {
  const w = mount(StoppedDevicesRebookPicker, { props: { groupId, disabled: false, devices: [
    { bookingId, sequence: 1, deviceLabel: 'Điều hòa' }, { bookingId: second, sequence: 2, deviceLabel: 'Máy giặt' },
  ] } });
  await flushPromises();
  await w.findAll('input')[1]!.setValue(true);
  await w.get('[data-testid="stopped-rebook-continue"]').trigger('click');
  expect(mocks.push).toHaveBeenLastCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: second, sourceBookingIds: second } });
  await w.findAll('input')[0]!.setValue(true); await w.get('[data-testid="stopped-rebook-continue"]').trigger('click');
  expect(mocks.push).toHaveBeenLastCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: bookingId, sourceBookingIds: `${bookingId},${second}` } });
  await w.setProps({ groupId: second });
  expect(w.get('button').attributes('disabled')).toBeDefined();
});

it('does not offer a stopped source that was already rebooked, and retains another eligible machine', async () => {
  mocks.sources.mockResolvedValue([bookingId]);
  const w = mount(StoppedDevicesRebookPicker, { props: { groupId, disabled: false, devices: [
    { bookingId, sequence: 1, deviceLabel: 'Điều hòa' }, { bookingId: second, sequence: 2, deviceLabel: 'Máy giặt' },
  ] } });
  await flushPromises();
  expect(mocks.sources).toHaveBeenCalledWith(groupId, [bookingId, second]);
  expect(w.findAll('input[type="checkbox"]')).toHaveLength(1);
  expect(w.get('[data-testid="rebook-unavailable"]').text()).toContain('Máy 2');
  await w.get('input[type="checkbox"]').setValue(true);
  await w.get('[data-testid="stopped-rebook-continue"]').trigger('click');
  expect(mocks.push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: bookingId, sourceBookingIds: bookingId } });
});
it('fails closed on source verification errors and ignores stale source results on a visit switch', async () => {
  let resolveFirst!: (ids: string[]) => void;
  mocks.sources.mockReturnValueOnce(new Promise<string[]>(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce([second]);
  const w = mount(StoppedDevicesRebookPicker, { props: { groupId, disabled: false, devices: [{ bookingId, sequence: 1, deviceLabel: null }] } });
  await w.setProps({ groupId: second, devices: [{ bookingId: second, sequence: 1, deviceLabel: null }] });
  resolveFirst([bookingId]); await flushPromises();
  expect(w.findAll('input[type="checkbox"]')).toHaveLength(1);
  expect((w.get('input[type="checkbox"]').element as HTMLInputElement).value).toBe(second);
  mocks.sources.mockRejectedValue(new Error('offline'));
  await w.get('[data-testid="stopped-rebook-refresh"]').trigger('click'); await flushPromises();
  expect(w.findAll('input[type="checkbox"]')).toHaveLength(0);
  expect(w.get('[role="alert"]').text()).toContain('Chưa kiểm tra');
  expect(w.get('[data-testid="stopped-rebook-continue"]').attributes('disabled')).toBeDefined();
});

it('keeps the selected stopped subset through same-visit refresh and parent loading state', async () => {
  const devices = [{ bookingId, sequence: 1, deviceLabel: 'Synthetic device' }, { bookingId: second, sequence: 2, deviceLabel: null }];
  const w = mount(StoppedDevicesRebookPicker, { props: { groupId, disabled: false, devices } });
  await flushPromises();
  await w.findAll('input')[1]!.setValue(true);
  mocks.sources.mockClear();
  await w.setProps({ disabled: true }); await w.setProps({ disabled: false, devices: [...devices] });
  expect(mocks.sources).not.toHaveBeenCalled();
  await w.get('[data-testid="stopped-rebook-refresh"]').trigger('click'); await flushPromises();
  expect((w.findAll('input')[1]!.element as HTMLInputElement).checked).toBe(true);
  await w.get('[data-testid="stopped-rebook-continue"]').trigger('click');
  expect(mocks.push).toHaveBeenLastCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: second, sourceBookingIds: second } });
});
