import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import FailedRepairBookingForm from '../src/components/customer/FailedRepairBookingForm.vue';
import FailedRepairDialog from '../src/components/technician/FailedRepairDialog.vue';
import { failedRepairKey, blockedFailedRepair, FailedRepairDraftRefreshError, type FailedRepairDraft, type FailedRepairPort } from '../src/api/failed-repair.api';
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), go: vi.fn() }) }));

enableAutoUnmount(afterEach);
const address = { id: 'addr', userId: 'customer', line1: 'Địa chỉ fixture', district: 'Quận thử nghiệm', province: 'Thành phố thử nghiệm', isDefault: true };
const draft = (ids = ['B']): FailedRepairDraft => ({
  id: 'draft', customerId: 'customer', expiresAt: '2099-01-01T00:00:00Z', address,
  customerNote: 'Ghi chú cũ',
  items: ids.map(id => ({ sourceBookingId: id, outcome: 'failed', serviceId: `service-${id}`, serviceName: `Máy ${id}`, active: true, description: `Mô tả ${id}`, model: `Model ${id}`, deviceAttributes: {}, selectedVariantCode: `variant-${id}`, media: [] })),
});
function port(data = draft()): FailedRepairPort {
  return { ...blockedFailedRepair, available: true, readDraft: vi.fn().mockResolvedValue(data), confirm: vi.fn().mockResolvedValue({ kind: data.items.length === 1 ? 'booking' : 'visit', id: 'new' }) };
}
const mountForm = (api = port(), sources = ['B']) => mount(FailedRepairBookingForm, {
  props: { sourceBookingIds: sources, customerId: 'customer' },
  global: { provide: { [failedRepairKey as symbol]: api }, stubs: { BookingSessionPicker: { props: ['modelValue'], emits: ['update:modelValue'], template: '<button data-testid="choose-slot" @click="$emit(\'update:modelValue\', { date: \'2090-01-02\', slot: \'morning\' })">Chọn lịch mới</button>' }, BookingMediaViewer: true } },
});

describe('failed-only rebooking fixture boundary (no production endpoints)', () => {
  it('opens step 2 with B only, preselects its address and requires a fresh slot; no create on read', async () => {
    const api = port();
    const w = mountForm(api);
    await flushPromises();
    expect(w.text()).toContain('2. Địa chỉ & Giờ');
    expect(w.text()).toContain('Máy B');
    expect(w.text()).not.toContain('Máy A');
    expect(w.text()).not.toContain('Máy C');
    expect((w.get('[data-testid="failed-address"]').element as HTMLSelectElement).value).toBe('addr');
    expect(w.get('[data-testid="failed-next"]').attributes('disabled')).toBeDefined();
    expect(api.confirm).not.toHaveBeenCalled();
    await w.get('[data-testid="choose-slot"]').trigger('click');
    await w.get('[data-testid="failed-next"]').trigger('click');
    expect(api.confirm).not.toHaveBeenCalled();
    await w.get('[data-testid="failed-final-confirm"]').trigger('click');
    await flushPromises();
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'booking', sourceBookingIds: ['B'], addressId: 'addr', date: '2090-01-02', slot: 'morning' }));
    const payload = vi.mocked(api.confirm).mock.calls[0][0];
    expect(payload).not.toHaveProperty('technicianId');
    expect(payload).not.toHaveProperty('price');
  });

  it.each([['A'], ['B', 'C'], ['A', 'B', 'C']])('submits exactly the failed source set %j once on final confirmation', async (...ids) => {
    const api = port(draft(ids));
    const w = mountForm(api, ids);
    await flushPromises();
    await w.get('[data-testid="choose-slot"]').trigger('click');
    await w.get('[data-testid="failed-next"]').trigger('click');
    await w.get('[data-testid="failed-final-confirm"]').trigger('click');
    await w.get('[data-testid="failed-final-confirm"]').trigger('click');
    await flushPromises();
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: ids.length === 1 ? 'booking' : 'visit', sourceBookingIds: ids }));
  });

  it.each(['owner', 'retired', 'source', 'expired', 'succeeded'])('blocks an invalid %s draft', async problem => {
    const data = draft();
    if (problem === 'owner') data.customerId = 'someone-else';
    if (problem === 'retired') data.items[0]!.active = false;
    if (problem === 'source') data.items[0]!.sourceBookingId = 'C';
    if (problem === 'expired') data.expiresAt = '2020-01-01T00:00:00Z';
    if (problem === 'succeeded') Object.assign(data.items[0]!, { outcome: 'succeeded' });
    const api = port(data);
    const w = mountForm(api);
    await flushPromises();
    expect(w.find('[data-testid="failed-next"]').exists()).toBe(false);
    expect(w.get('[role="alert"]').text()).toBeTruthy();
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it('fails closed without a frozen backend adapter', async () => {
    const w = mountForm(blockedFailedRepair);
    await flushPromises();
    expect(w.text()).toContain('chưa sẵn sàng');
    expect(w.find('[data-testid="failed-next"]').exists()).toBe(false);
  });
  it('shows denied drafts without enabling confirmation', async () => {
    const api = { ...port(), readDraft: vi.fn().mockRejectedValue({ response: { status: 403 } }) };
    const w = mountForm(api);
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('không có quyền');
    expect(w.find('[data-testid="failed-next"]').exists()).toBe(false);
    expect(api.confirm).not.toHaveBeenCalled();
  });
  it('ignores a late draft after changing the failed child', async () => {
    let resolve!: (value: FailedRepairDraft) => void;
    const api = { ...port(), readDraft: vi.fn().mockReturnValueOnce(new Promise<FailedRepairDraft>(r => { resolve = r; })).mockResolvedValueOnce(draft(['C'])) };
    const w = mountForm(api);
    await w.setProps({ sourceBookingIds: ['C'] });
    await flushPromises();
    resolve(draft(['B']));
    await flushPromises();
    expect(w.text()).toContain('Máy C');
    expect(w.text()).not.toContain('Máy B');
  });
  it('preserves the selected slot and review when the same source IDs are rerendered', async () => {
    const api = port();
    const w = mountForm(api);
    await flushPromises();
    await w.get('[data-testid="choose-slot"]').trigger('click');
    await w.get('[data-testid="failed-next"]').trigger('click');
    await w.setProps({ sourceBookingIds: ['B'] });
    await flushPromises();
    expect(w.find('[data-testid="failed-final-confirm"]').exists()).toBe(true);
    expect(api.readDraft).toHaveBeenCalledTimes(1);
  });
  it('keeps an ambiguous confirmation locked to prevent duplicate bookings', async () => {
    const api = { ...port(), confirm: vi.fn().mockRejectedValue(new Error('timeout')) };
    const w = mountForm(api);
    await flushPromises();
    await w.get('[data-testid="choose-slot"]').trigger('click');
    await w.get('[data-testid="failed-next"]').trigger('click');
    await w.get('[data-testid="failed-final-confirm"]').trigger('click');
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('kiểm tra Đơn của tôi');
    expect(w.get('[data-testid="failed-final-confirm"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="failed-final-confirm"]').trigger('click');
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });
  it('retries the persistent-idempotency endpoint with the same immutable confirmation and key', async () => {
    const api = { ...port(), retrySafe: true, confirm: vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ kind: 'booking', id: 'new' }) };
    const w = mountForm(api); await flushPromises();
    await w.get('[data-testid="choose-slot"]').trigger('click');
    await w.get('[data-testid="failed-next"]').trigger('click');
    await w.get('[data-testid="failed-final-confirm"]').trigger('click'); await flushPromises();
    expect(w.get('[data-testid="failed-final-confirm"]').text()).toBe('Thử lại xác nhận');
    expect(w.findAll('button').find(button => button.text() === 'Sửa lịch hẹn')!.attributes('disabled')).toBeDefined();
    await w.get('[data-testid="failed-final-confirm"]').trigger('click'); await flushPromises();
    expect(api.confirm).toHaveBeenCalledTimes(2);
    expect(api.confirm.mock.calls[0]![0]).toEqual(api.confirm.mock.calls[1]![0]);
    expect(w.emitted('created')).toEqual([[{ kind: 'booking', id: 'new' }]]);
  });
  it('generates a different key only after explicitly loading a new draft and choosing a new slot', async () => {
    const api = { ...port(), retrySafe: true, confirm: vi.fn().mockRejectedValueOnce(new FailedRepairDraftRefreshError('Giá đã đổi, vui lòng tải lại dữ liệu.')).mockResolvedValue({ kind: 'booking', id: 'new' }) };
    const w = mountForm(api); await flushPromises();
    await w.get('[data-testid="choose-slot"]').trigger('click'); await w.get('[data-testid="failed-next"]').trigger('click');
    await w.get('[data-testid="failed-final-confirm"]').trigger('click'); await flushPromises();
    expect(w.get('[data-testid="failed-final-confirm"]').attributes('disabled')).toBeDefined();
    const firstKey = api.confirm.mock.calls[0]![0].idempotencyKey;
    await w.get('[data-testid="failed-reload-draft"]').trigger('click'); await flushPromises();
    expect(w.get('[data-testid="failed-next"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="choose-slot"]').trigger('click'); await w.get('[data-testid="failed-next"]').trigger('click');
    await w.get('[data-testid="failed-final-confirm"]').trigger('click'); await flushPromises();
    expect(api.confirm.mock.calls[1]![0].idempotencyKey).not.toBe(firstKey);
  });
});

describe('technician incident form', () => {
  const render = (api: FailedRepairPort = { ...port(), report: vi.fn().mockResolvedValue(undefined) }) => mount(FailedRepairDialog, {
    props: { orderId: 'order-B', parts: [{ id: 'part-B', label: 'Linh kiện B' }], partsReady: true },
    global: { provide: { [failedRepairKey as symbol]: api }, stubs: { Teleport: true } },
  });
  it('requires explicit reason and child-specific part disposition, with no defaults', async () => {
    const api = { ...port(), report: vi.fn().mockResolvedValue(undefined) };
    const w = render(api);
    expect(w.findAll('input:checked')).toHaveLength(0);
    expect(w.get('[data-testid="repair-failed-confirm"]').attributes('disabled')).toBeDefined();
    await w.get('input[value="no_part"]').setValue(true);
    await w.get('select').setValue('returned');
    await w.get('[data-testid="repair-failed-confirm"]').trigger('click');
    await flushPromises();
    expect(api.report).toHaveBeenCalledWith('order-B', { reason: 'no_part', photoEvidenceIds: [], parts: [{ partRequestId: 'part-B', outcome: 'returned' }] });
    expect(w.text()).toContain('chưa xác nhận kho đã nhận');
  });
  it('restores keyboard focus to the camera button after closing the camera', async () => {
    const w = mount(FailedRepairDialog, {
      attachTo: document.body,
      props: { orderId: 'order-B', parts: [], partsReady: true },
      global: {
        provide: { [failedRepairKey as symbol]: { ...port(), evidenceAvailable: true } },
        stubs: { Teleport: true, CameraCapture: { emits: ['close'], template: '<button data-testid="camera-close" @click="$emit(\'close\')">Đóng camera</button>' } },
      },
    });
    await flushPromises();
    const cameraButton = w.findAll('button').find(button => button.text() === 'Chụp ảnh')!;
    await cameraButton.trigger('click');
    w.get('[data-testid="camera-close"]').element.focus();
    await w.get('[data-testid="camera-close"]').trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(w.findAll('button').find(button => button.text() === 'Chụp ảnh')!.element);
    expect(w.find('[data-testid="camera-close"]').exists()).toBe(false);
    expect(w.emitted('close')).toBeUndefined();
  });
  it('does not enable real reporting while the backend is blocked', async () => {
    const w = render(blockedFailedRepair);
    await w.get('input[value="no_part"]').setValue(true);
    await w.get('select').setValue('installed');
    expect(w.get('[data-testid="repair-failed-confirm"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('chưa sẵn sàng');
  });
  it('uploads 3 private photos, removes one, and sends only retained IDs', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let next = 0;
    const api = { ...port(), evidenceAvailable: true, uploadEvidence: vi.fn(async () => ({ evidenceId: `private-${++next}` })), report: vi.fn().mockResolvedValue(undefined) };
    const w = render(api);
    const files = Array.from({ length: 3 }, (_, i) => new File(['image'], `${i}.jpg`, { type: 'image/jpeg' }));
    const input = w.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { configurable: true, value: files });
    await input.trigger('change');
    await flushPromises();
    expect(w.findAll('img')).toHaveLength(3);
    expect(api.uploadEvidence).toHaveBeenCalledTimes(3);
    await w.get('[aria-label="Xóa ảnh 2"]').trigger('click');
    await w.get('input[value="other"]').setValue(true);
    await w.get('select').setValue('installed');
    await w.get('textarea').setValue('Ghi chú tùy chọn');
    await w.get('[data-testid="repair-failed-confirm"]').trigger('click');
    await flushPromises();
    expect(api.report).toHaveBeenCalledWith('order-B', expect.objectContaining({ note: 'Ghi chú tùy chọn', photoEvidenceIds: ['private-1', 'private-3'] }));
  });
  it('rejects 4 photos without uploading any', async () => {
    const api = { ...port(), evidenceAvailable: true, uploadEvidence: vi.fn() };
    const w = render(api);
    const input = w.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: Array.from({ length: 4 }, () => new File(['x'], 'a.jpg', { type: 'image/jpeg' })) });
    await input.trigger('change');
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Tối đa 3 ảnh');
    expect(api.uploadEvidence).not.toHaveBeenCalled();
  });
  it('keeps a failed photo blocking submission until retry succeeds', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    const api = { ...port(), evidenceAvailable: true, uploadEvidence: vi.fn().mockRejectedValueOnce(new Error('expired')).mockResolvedValue({ evidenceId: 'renewed' }) };
    const w = render(api);
    const input = w.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] });
    await input.trigger('change');
    await flushPromises();
    await w.get('input[value="no_part"]').setValue(true);
    await w.get('select').setValue('returned');
    expect(w.get('[data-testid="repair-failed-confirm"]').attributes('disabled')).toBeDefined();
    await w.findAll('button').find(button => button.text() === 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="repair-failed-confirm"]').attributes('disabled')).toBeUndefined();
  });
});
