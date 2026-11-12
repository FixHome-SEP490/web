import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// ADMIN 47 price tiers and TECH 42 private note (PO 13/11/2026).
const m = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock('../src/api/catalog.api', () => ({ priceVariantsApi: { list: m.list, update: m.update } }));
vi.mock('../src/api/client', () => ({ default: { get: m.get, put: m.put } }));
import ServicePriceVariantsPanel from '../src/components/console/ServicePriceVariantsPanel.vue';
import TechnicianPrivateNote from '../src/components/technician/TechnicianPrivateNote.vue';

const tier = { id: 'v1', serviceId: 's1', variantCode: 'AC-9K', deviceAttributes: { btu: 9000 }, fixedLaborPriceVnd: 450000,
  includedScope: 'Lắp đặt', excludedScope: null, isActive: true, updatedAt: '2026-11-13T00:00:00Z' };

describe('ADMIN 47 price tiers', () => {
  beforeEach(() => { vi.clearAllMocks(); m.list.mockResolvedValue([tier]); });
  it('saves one tier with a numeric price and refuses a bad price before calling the server', async () => {
    m.update.mockResolvedValue({ ...tier, fixedLaborPriceVnd: 500000, isActive: false });
    const w = mount(ServicePriceVariantsPanel, { props: { serviceId: 's1' } });
    await flushPromises();
    const input = w.get('input[inputmode="numeric"]');
    await input.setValue('-5');
    await w.get('button').trigger('click');
    expect(m.update).not.toHaveBeenCalled();
    expect(w.text()).toContain('số nguyên');
    await input.setValue('500000');
    await w.get('input[type="checkbox"]').setValue(false);
    await w.get('button').trigger('click');
    await flushPromises();
    expect(m.update).toHaveBeenCalledWith('s1', 'v1', { fixedLaborPriceVnd: 500000, isActive: false });
    expect(w.text()).toContain('Đã lưu');
  });
});

describe('TECH 42 private note', () => {
  beforeEach(() => { vi.clearAllMocks(); m.get.mockResolvedValue({ data: { data: { note: 'Khách dặn gọi trước' } } }); });
  it('reads the saved note and saves the trimmed text once', async () => {
    m.put.mockResolvedValue({ data: { data: { note: 'Mang thang dài' } } });
    const w = mount(TechnicianPrivateNote, { props: { orderId: 'o1' } });
    await flushPromises();
    expect(m.get).toHaveBeenCalledWith('/service-orders/o1/my-note');
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('Khách dặn gọi trước');
    await w.get('textarea').setValue('  Mang thang dài  ');
    const btn = w.get('button');
    await Promise.all([btn.trigger('click'), btn.trigger('click')]);
    await flushPromises();
    expect(m.put).toHaveBeenCalledTimes(1);
    expect(m.put).toHaveBeenCalledWith('/service-orders/o1/my-note', { note: 'Mang thang dài' });
    expect(w.text()).toContain('Đã lưu ghi chú');
  });
});
