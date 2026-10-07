import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// Two booking forms. The plain one: the customer picks the service, no AI at
// all. The AI one: the customer only describes the problem, the assistant
// diagnoses it and chooses the service, and only then can the customer change
// it and book.
const { createBooking, getCategories, getAddresses, push, route, analyze, ask } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string>, meta: {} as Record<string, unknown> },
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
import { useSharedAiConversation, resetSharedAiConversation } from '../src/composables/useAiConversation';

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
const fix = { serviceCode: 'FIX', nameVi: 'Sửa máy lạnh không mát', serviceId: 'svc-fix' };
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000)); // acknowledgement dwell
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!;

async function openAiForm() {
  route.meta = { bookingFlow: 'ai' };
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

async function describeAndAnalyze(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('textarea').setValue('Máy lạnh kêu lạch cạch, không mát');
  await wrapper.get('[data-testid="step1-next"]').trigger('click');
  await pause();
  await flushPromises();
}

beforeEach(() => {
  createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
  analyze.mockReset();
  ask.mockReset();
  getCategories.mockReset().mockResolvedValue([
    { id: 'cat-ac', name: 'Điện lạnh', services: [
      { id: 'svc-check', name: 'Kiểm tra máy lạnh', pricingMode: 'inspection_required', basePrice: 100000 },
      { id: 'svc-fix', name: 'Sửa máy lạnh không mát', pricingMode: 'inspection_required', basePrice: 200000 },
      { id: 'svc-clean', name: 'Vệ sinh máy lạnh', pricingMode: 'inspection_required', basePrice: 150000 },
    ] },
  ]);
  getAddresses.mockReset().mockResolvedValue([{ id: 'addr', label: 'Nhà', line1: '1 Test', district: 'Q1', province: 'HCM', isDefault: true }]);
  route.query = {};
  route.meta = {};
  resetSharedAiConversation();
  vi.stubGlobal('alert', vi.fn());
});

describe('AI booking form', () => {
  it('asks only for the problem: no service choice before the diagnosis', async () => {
    const wrapper = await openAiForm();
    expect(wrapper.text()).toContain('Mô tả sự cố để trợ lý AI phân tích');
    expect(wrapper.text()).not.toContain('Kiểm tra máy lạnh');
    expect(wrapper.get('[data-testid="booking-stepper"]').text()).toContain('Trò chuyện với AI');
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
  });

  it('keeps every AI send off until there is a written description (BRX-064)', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [fix] }));
    const wrapper = await openAiForm();

    expect(wrapper.get('[data-testid="ai-needs-description"]').text()).toBe('Mô tả vấn đề trước khi gửi cho trợ lý');
    await wrapper.find('textarea').setValue('   \n ');
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="ai-needs-description"]').exists()).toBe(true);

    await describeAndAnalyze(wrapper);
    expect(analyze).toHaveBeenCalledTimes(1);

    // In the conversation, Send stays off while the composer has no words.
    expect(wrapper.get('[data-testid="ai-send"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="ai-input"]').setValue('   ');
    expect(wrapper.get('[data-testid="ai-send"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="ai-send"]').trigger('click');
    await flushPromises();
    expect(analyze).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="ai-input"]').setValue('Máy chạy nhưng không ra hơi lạnh');
    expect(wrapper.get('[data-testid="ai-send"]').attributes('disabled')).toBeUndefined();
  }, 10000);

  it('lets the customer answer what the assistant asks, and takes the service the assistant chooses', async () => {
    analyze
      .mockResolvedValueOnce(reply({ status: 'needs_clarification', clarification: { questionsVi: ['Tiếng kêu ở cục trong hay cục ngoài ạ?'] } }))
      .mockResolvedValueOnce(reply({ suspectedFaults: [{ faultCode: 'F1', nameVi: 'Hỏng mô tơ quạt' }], recommendedServices: [fix] }));
    const wrapper = await openAiForm();
    await describeAndAnalyze(wrapper);

    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ description: 'Máy lạnh kêu lạch cạch, không mát', sessionId: null }));
    expect(wrapper.get('[data-testid="ai-questions"]').text()).toContain('Tiếng kêu ở cục trong hay cục ngoài');
    // no service yet, so the customer cannot go on
    expect(wrapper.get('[data-testid="ai-continue"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="ai-input"]').setValue('Cục trong phòng ạ');
    await wrapper.get('[data-testid="ai-send"]').trigger('click');
    await pause();
    await flushPromises();
    expect(analyze).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Cục trong phòng ạ', sessionId: 'sess-42' }));
    expect(wrapper.get('[data-testid="ai-current-service"]').text()).toContain('Sửa máy lạnh không mát');
    expect(wrapper.get('[data-testid="ai-continue"]').attributes('disabled')).toBeUndefined();
  }, 10000);

  it('books what the assistant chose, with the whole conversation, through address and confirmation', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [fix] }));
    const wrapper = await openAiForm();
    await describeAndAnalyze(wrapper);

    await wrapper.get('[data-testid="ai-continue"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Địa chỉ');
    await wrapper.get('[data-testid="step2-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-summary-note"]').exists()).toBe(true);
    await button(wrapper, 'Tìm kỹ thuật viên').trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 'svc-fix', aiSessionId: 'sess-42', description: 'Máy lạnh kêu lạch cạch, không mát',
    }));
  }, 10000);

  it('lets the customer change the service only after the diagnosis', async () => {
    analyze
      .mockResolvedValueOnce(reply({ recommendedServices: [fix] }))
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'CLEAN', nameVi: 'Vệ sinh máy lạnh', serviceId: 'svc-clean' }] }));
    const wrapper = await openAiForm();
    await describeAndAnalyze(wrapper);

    // the assistant suggests another service in a later turn
    await wrapper.get('[data-testid="ai-input"]').setValue('À máy chỉ bẩn thôi, cần vệ sinh');
    await wrapper.get('[data-testid="ai-send"]').trigger('click');
    await pause();
    await flushPromises();
    await wrapper.get('[data-testid="ai-use-suggested"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-current-service"]').text()).toContain('Vệ sinh máy lạnh');

    // or picks one themselves
    await wrapper.get('[data-testid="ai-manual-service"]').setValue('svc-check');
    expect(wrapper.get('[data-testid="ai-current-service"]').text()).toContain('Kiểm tra máy lạnh');
  }, 10000);

  it('still books when the assistant cannot be reached: the customer picks the service', async () => {
    analyze.mockResolvedValueOnce({ status: 'unavailable', aiAvailable: false, sessionId: null, messageVi: 'Trợ lý đang tạm thời không kết nối được.' });
    const wrapper = await openAiForm();
    await describeAndAnalyze(wrapper);
    expect(wrapper.text()).toContain('Trợ lý đang tạm thời không kết nối được.');
    // The disabled button must not leave the customer guessing what is missing.
    expect(wrapper.get('[data-testid="ai-pick-service-hint"]').text()).toContain('Chọn dịch vụ ở ô bên dưới');
    expect(wrapper.text()).not.toContain('Trợ lý sẽ chọn dịch vụ phù hợp sau khi chẩn đoán');
    await wrapper.get('[data-testid="ai-manual-service"]').setValue('svc-fix');
    expect(wrapper.find('[data-testid="ai-pick-service-hint"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-continue"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="step2-next"]').trigger('click');
    await flushPromises();
    await button(wrapper, 'Tìm kỹ thuật viên').trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'svc-fix' }));
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('aiSessionId');
  }, 10000);

  it('arriving from the floating assistant, goes to address and time, and back shows the same conversation', async () => {
    analyze.mockResolvedValueOnce(reply({ sessionId: 'sess-chat', messageVi: 'Dạ khả năng là hỏng mô tơ quạt ạ.', recommendedServices: [fix] }));
    const assistant = useSharedAiConversation();
    await assistant.sendTurn('Máy lạnh kêu lạch cạch ở cục trong', []);
    expect(analyze).toHaveBeenCalledTimes(1);

    route.query = { serviceId: 'svc-fix', aiSession: 'sess-chat', desc: 'Máy lạnh kêu lạch cạch ở cục trong' };
    const wrapper = await openAiForm();
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(true);
    await button(wrapper, 'Quay lại').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-thread"]').text()).toContain('Dạ khả năng là hỏng mô tơ quạt ạ.');
    expect(analyze).toHaveBeenCalledTimes(1);
  }, 10000);
});

describe('Plain booking form', () => {
  it('never talks to the assistant: service, address and time, confirmation', async () => {
    route.query = { serviceId: 'svc-fix' };
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.get('[data-testid="booking-stepper"]').text()).not.toContain('AI');
    await wrapper.find('textarea').setValue('Máy lạnh không mát');
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="step2-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-thread"]').exists()).toBe(false);
    await button(wrapper, 'Tìm kỹ thuật viên').trigger('click');
    await flushPromises();
    expect(analyze).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'svc-fix', description: 'Máy lạnh không mát' }));
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('aiSessionId');
  });
});
