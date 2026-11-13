import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

enableAutoUnmount(afterEach);
const { http } = vi.hoisted(() => ({ http: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/api/client', () => ({ default: http }));
import { isPartsSourceUnavailable, missingPartsText, needsSourcingCheck, readPartsSourcing } from '../src/utils/parts-sourcing';
import { useQuotationPartsSourcing } from '../src/composables/useQuotationPartsSourcing';
import QuotationPartsSourcingNote from '../src/components/QuotationPartsSourcingNote.vue';

const part = { type: 'PARTS', partSource: 'fixhome' };
const labor = { type: 'LABOR', partSource: null };
const unavailable = { quotationId: 'q1', quotationStatus: 'sent', status: 'unavailable', missing: [{ partCatalogId: 'p1', name: 'Tụ quạt', quantity: 2 }] };

describe('F3 parts sourcing (CUSTOMER 72, TECH 66)', () => {
  afterEach(() => { http.get.mockReset(); });

  it('asks only about a pending quote with a FixHome part', () => {
    expect(needsSourcingCheck({ id: 'q1', status: 'sent', items: [labor, part] })).toBe(true);
    expect(needsSourcingCheck({ id: 'q1', status: 'SENT', items: [part] })).toBe(true);
    expect(needsSourcingCheck({ id: 'q1', status: 'sent', items: [labor] })).toBe(false);
    expect(needsSourcingCheck({ id: 'q1', status: 'approved', items: [part] })).toBe(false);
    expect(needsSourcingCheck({ id: null, status: 'sent', items: [part] })).toBe(false);
    expect(needsSourcingCheck(null)).toBe(false);
  });

  it('reads only the PARTS_SOURCE_UNAVAILABLE refusal as one', () => {
    expect(isPartsSourceUnavailable({ response: { status: 409, data: { error: { code: 'PARTS_SOURCE_UNAVAILABLE' } } } })).toBe(true);
    expect(isPartsSourceUnavailable({ response: { status: 409, data: { error: { code: 'CONFLICT' } } } })).toBe(false);
    expect(isPartsSourceUnavailable({ response: { status: 500, data: { error: { code: 'PARTS_SOURCE_UNAVAILABLE' } } } })).toBe(false);
    expect(isPartsSourceUnavailable(new Error('offline'))).toBe(false);
    expect(isPartsSourceUnavailable(null)).toBe(false);
  });

  it('keeps only well-formed answers', () => {
    expect(readPartsSourcing(unavailable)).toEqual(unavailable);
    expect(readPartsSourcing({ status: 'weird' })).toBeNull();
    expect(readPartsSourcing(null)).toBeNull();
    expect(readPartsSourcing({ status: 'unavailable', missing: [{ name: '🔧'.repeat(2000), quantity: '3', partCatalogId: 'p' }, null] })!.missing)
      .toEqual([{ partCatalogId: 'p', name: '🔧'.repeat(2000), quantity: 3 }]);
    expect(missingPartsText(unavailable.missing)).toBe('Tụ quạt × 2');
  });

  it.each(['customer', 'technician'] as const)('tells the %s which parts are missing and lets them check again', async audience => {
    const wrapper = mount(QuotationPartsSourcingNote, { props: { sourcing: readPartsSourcing(unavailable), audience } });
    expect(wrapper.text()).toContain('Linh kiện chưa có nguồn cấp');
    expect(wrapper.text()).toContain('Tụ quạt × 2');
    expect(wrapper.text()).toContain(audience === 'customer' ? 'chưa duyệt được' : 'Gửi lại báo giá khác');
    await wrapper.get('[data-testid="parts-sourcing-recheck"]').trigger('click');
    expect(wrapper.emitted('recheck')).toHaveLength(1);
  });

  it.each(['none', 'covered', 'available'])('shows nothing when sourcing is %s', status => {
    const wrapper = mount(QuotationPartsSourcingNote, { props: { sourcing: readPartsSourcing({ ...unavailable, status, missing: [] }), audience: 'customer' as const } });
    expect(wrapper.find('[data-testid="parts-sourcing-note"]').exists()).toBe(false);
  });

  it('never lets a late answer for an older quote overwrite the current one, and skips quotes without parts', async () => {
    const quote = ref<{ id: string; status: string; items: Array<{ type: string; partSource: string | null }> }>({ id: 'old', status: 'sent', items: [part] });
    let release!: (value: unknown) => void;
    http.get.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValueOnce({ data: { data: { ...unavailable, quotationId: 'new', status: 'available', missing: [] } } });
    let state!: ReturnType<typeof useQuotationPartsSourcing>;
    mount(defineComponent({ setup() { state = useQuotationPartsSourcing(() => quote.value); return () => h('div'); } }));
    quote.value = { id: 'new', status: 'sent', items: [part] };
    await flushPromises();
    release({ data: { data: unavailable } });
    await flushPromises();
    expect(state.sourcing.value).toMatchObject({ quotationId: 'new', status: 'available' });
    expect(http.get).toHaveBeenCalledWith('/quotations/new/parts-sourcing');
    quote.value = { id: 'labor', status: 'sent', items: [labor] };
    await flushPromises();
    expect(state.sourcing.value).toBeNull();
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('shows nothing when the read fails; the approval still decides', async () => {
    http.get.mockRejectedValueOnce(new Error('offline'));
    let state!: ReturnType<typeof useQuotationPartsSourcing>;
    mount(defineComponent({ setup() { state = useQuotationPartsSourcing(() => ({ id: 'q', status: 'sent', items: [part] })); return () => h('div'); } }));
    await flushPromises();
    expect(state.sourcing.value).toBeNull();
    expect(state.checking.value).toBe(false);
  });
});
