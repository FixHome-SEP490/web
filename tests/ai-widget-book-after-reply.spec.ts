import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

// "Đặt thợ" belongs to an answer the assistant has finished giving. While a
// follow-up is being worked on the pinned service may be about to change, so
// the card waits until the reply is back.
const { conversation, push } = vi.hoisted(() => ({ conversation: {} as Record<string, unknown>, push: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/app', meta: {} }), useRouter: () => ({ push }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ isAiPanelOpen: true, isWidgetOpen: false, toggleAiPanel: vi.fn() }) }));
vi.mock('../src/composables/useAiConversation', () => ({
  SESSION_IDLE_MINUTES: 60,
  useSharedAiConversation: () => conversation,
}));

import AiAssistantWidget from '../src/components/chat/AiAssistantWidget.vue';
import { takeAiVisitDraft } from '../src/composables/aiVisitDraft';

function setUp(thinking: boolean, devices: unknown[] = []) {
  Object.assign(conversation, {
    turnCount: ref(1),
    pinnedService: ref({ serviceCode: 'AC-01', nameVi: 'Sửa điều hòa', serviceId: 's1' }),
    pinnedDevices: ref(devices),
    sessionId: ref('abc'),
    lastReply: ref(null),
    isThinking: ref(thinking),
    startOver: vi.fn(),
    loadHoldingLines: vi.fn(),
    customerWords: () => 'máy lạnh không mát',
    messages: ref([]),
    attachments: ref([]),
  });
  return mount(AiAssistantWidget, {
    global: { stubs: { AiConversationThread: { template: '<div><slot name="pinned" /></div>' }, transition: false } },
  });
}

describe('Booking button in the assistant', () => {
  it('shows once the reply is back', () => {
    expect(setUp(false).find('[data-testid="ai-book-technician"]').exists()).toBe(true);
  });

  it('hides while the assistant is still answering a follow-up', () => {
    expect(setUp(true).find('[data-testid="ai-book-technician"]').exists()).toBe(false);
  });

  it('comes back when the answer arrives', async () => {
    const wrapper = setUp(true);
    (conversation.isThinking as { value: boolean }).value = false;
    await nextTick();
    expect(wrapper.find('[data-testid="ai-book-technician"]').exists()).toBe(true);
  });

  it('offers manual booking after an unavailable first answer with no pinned service', async () => {
    push.mockClear();
    const wrapper = setUp(false);
    (conversation.pinnedService as { value: unknown }).value = null;
    (conversation.lastReply as { value: unknown }).value = { status: 'unavailable', failureReason: 'service_unavailable' };
    await nextTick();

    const manualButton = wrapper.find('[data-testid="ai-book-manual"]');
    expect(manualButton.exists()).toBe(true);
    await manualButton.trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'new-booking' });
  });

  it('offers manual booking for HTTP 200 unavailable payload without failureReason', async () => {
    const wrapper = setUp(false);
    (conversation.pinnedService as { value: unknown }).value = null;
    (conversation.lastReply as { value: unknown }).value = { status: 'unavailable', aiAvailable: false, recommendedServices: [] };
    await nextTick();
    expect(wrapper.find('[data-testid="ai-book-manual"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps validation and rate-limit feedback separate from unavailable CTA', async () => {
    const wrapper = setUp(false);
    (conversation.pinnedService as { value: unknown }).value = null;
    (conversation.lastReply as { value: unknown }).value = { status: 'unavailable', failureReason: 'validation' };
    await nextTick();
    expect(wrapper.find('[data-testid="ai-book-manual"]').exists()).toBe(false);
    (conversation.lastReply as { value: unknown }).value = { status: 'unavailable', failureReason: 'rate_limited' };
    await nextTick();
    expect(wrapper.find('[data-testid="ai-book-manual"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Booking several appliances from the assistant', () => {
  const devices = [
    { deviceType: 'air_conditioner', nameVi: 'Máy lạnh', isPrimary: true, service: { serviceCode: 'AC-01', nameVi: 'Sửa điều hòa', serviceId: 's1' } },
    { deviceType: 'washing_machine', nameVi: 'Máy giặt', descriptionVi: 'không vắt', service: { serviceCode: 'WM-01', nameVi: 'Sửa máy giặt', serviceId: 's2' } },
  ];

  it('offers one visit for all of them, and still lets the customer book only the first', () => {
    const wrapper = setUp(false, devices);
    expect(wrapper.find('[data-testid="ai-book-visit"]').text()).toContain('Đặt 2 thiết bị');
    // PO 29/10/2026: every appliance with the service it will be booked under.
    expect(wrapper.find('[data-testid="ai-visit-bar"]').text()).toContain('Dịch vụ sẽ đặt cho 2 thiết bị');
    const lines = wrapper.findAll('[data-testid="ai-visit-bar-services"] li').map((li) => li.text());
    expect(lines).toEqual(['Máy lạnh: Sửa điều hòa', 'Máy giặt: Sửa máy giặt']);
    expect(wrapper.find('[data-testid="ai-book-technician"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-book-primary"]').exists()).toBe(true);
  });

  it('hands the appliances to the booking form for this conversation only', async () => {
    push.mockClear();
    const wrapper = setUp(false, devices);
    await wrapper.find('[data-testid="ai-book-visit"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'new-booking', query: { visit: 'ai', aiSession: 'abc' } });
    expect(takeAiVisitDraft('another-session')).toEqual([]);
    setUp(false, devices);
    await wrapper.find('[data-testid="ai-book-visit"]').trigger('click');
    expect(takeAiVisitDraft('abc').map((d) => d.deviceType)).toEqual(['air_conditioner', 'washing_machine']);
    expect(takeAiVisitDraft('abc')).toEqual([]);
  });

  it('waits for the reply before offering the visit', () => {
    expect(setUp(true, devices).find('[data-testid="ai-book-visit"]').exists()).toBe(false);
  });
});
