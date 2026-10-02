import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// Step 3 of the booking form is a conversation with the assistant: it opens
// with the customer's description and photos, the customer can answer what
// the assistant asks back or switch service, and only then goes on to book.
const { createBooking, getCategories, getAddresses, push, route, analyze, ask } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string> },
  analyze: vi.fn(),
  ask: vi.fn(),
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { upload: vi.fn(), uploadBookingPhoto: vi.fn(async () => ({ uploadId: 'upload-1' })) },
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { createBooking } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask, acknowledgements: vi.fn(async () => ({})) } };
});
vi.mock('../src/utils/image-for-ai', () => ({
  prepareForAi: vi.fn(async (files: File[]) => ({ images: files.map((f) => ({ dataUrl: `data:${f.name}`, bytes: 1 })) })),
  shrinkForRetry: vi.fn(async () => []),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', { ...attrs, type: 'button', disabled: props.disabled || props.loading, onClick: (e: MouseEvent) => emit('click', e) }, slots.default?.());
  },
});
const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const stubs = { FhButton: ActionButton, FhMoney: SlotStub, FhDatePicker: SlotStub, FhTimeScrollPicker: SlotStub, RouterLink: true };

const reply = (extra: Record<string, unknown> = {}) => ({
  sessionId: 'sess-42', status: 'ok', aiAvailable: true, messageVi: 'Dạ em xem rồi ạ.',
  suspectedFaults: [], recommendedServices: [], suggestedActionsVi: [], priceEstimate: null, ...extra,
});

async function openAiStep() {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  const textarea = wrapper.find('textarea');
  await textarea.setValue('Máy lạnh kêu lạch cạch, không mát');
  await wrapper.findAll('button').find((b) => b.text().includes('Tiếp tục'))!.trigger('click');
  await flushPromises();
  await wrapper.findAll('button').find((b) => b.text().includes('Phân tích sự cố cùng AI'))!.trigger('click');
  await new Promise((resolve) => setTimeout(resolve, 1000)); // acknowledgement pause
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
  analyze.mockReset();
  ask.mockReset();
  getCategories.mockReset().mockResolvedValue([
    { id: 'cat-ac', name: 'Điện lạnh', services: [
      { id: 'svc-check', name: 'Kiểm tra máy lạnh', pricingMode: 'inspection_required', basePrice: 100000 },
      { id: 'svc-fix', name: 'Sửa máy lạnh không mát', pricingMode: 'inspection_required', basePrice: 200000 },
    ] },
  ]);
  getAddresses.mockReset().mockResolvedValue([{ id: 'addr', label: 'Nhà', line1: '1 Test', district: 'Q1', province: 'HCM', isDefault: true }]);
  route.query = { serviceId: 'svc-check' };
  vi.stubGlobal('alert', vi.fn());
});

describe('Booking form, step 3: talking with the assistant', () => {
  it('opens with the description, shows the assistant\'s questions and lets the customer answer them', async () => {
    analyze
      .mockResolvedValueOnce(reply({ status: 'needs_clarification', clarification: { questionsVi: ['Tiếng kêu ở cục trong hay cục ngoài ạ?'] } }))
      .mockResolvedValueOnce(reply({ suspectedFaults: [{ faultCode: 'F1', nameVi: 'Hỏng mô tơ quạt dàn lạnh' }] }));
    const wrapper = await openAiStep();

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ description: 'Máy lạnh kêu lạch cạch, không mát', sessionId: null }));
    expect(wrapper.get('[data-testid="ai-questions"]').text()).toContain('Tiếng kêu ở cục trong hay cục ngoài');
    expect(wrapper.text()).not.toContain('Mở trợ lý ở góc màn hình');

    await wrapper.get('[data-testid="ai-input"]').setValue('Cục trong phòng ạ');
    await wrapper.get('[data-testid="ai-send"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await flushPromises();
    expect(analyze).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Cục trong phòng ạ', sessionId: 'sess-42' }));
    expect(wrapper.text()).toContain('Hỏng mô tơ quạt dàn lạnh');
  }, 10000);

  it('switches to the service the assistant suggests, then books with the conversation', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'FIX', nameVi: 'Sửa máy lạnh không mát', serviceId: 'svc-fix' }] }));
    const wrapper = await openAiStep();

    await wrapper.get('[data-testid="ai-use-suggested"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-use-suggested"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-current-service"]').text()).toContain('Sửa máy lạnh không mát');

    await wrapper.get('[data-testid="ai-continue"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-summary-note"]').exists()).toBe(true);
    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên'))!.trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'svc-fix', aiSessionId: 'sess-42' }));
  }, 10000);

  it('lets the customer book normally when the assistant cannot be reached', async () => {
    analyze.mockResolvedValueOnce({ status: 'unavailable', aiAvailable: false, sessionId: null, messageVi: 'Trợ lý đang tạm thời không kết nối được.' });
    const wrapper = await openAiStep();
    expect(wrapper.text()).toContain('Trợ lý đang tạm thời không kết nối được.');
    await wrapper.get('[data-testid="ai-continue"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên'))!.trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('aiSessionId');
  }, 10000);
});
