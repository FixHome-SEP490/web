import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// A booking that starts from the assistant carries the conversation along, so
// the technician who accepts gets a summary instead of a blank chat.
const { createBooking, getCategories, getAddresses, push, route } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string> },
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg'],
  MAX_MEDIA_SIZE_BYTES: 1024,
  mediaApi: { upload: vi.fn(), uploadBookingPhoto: vi.fn() },
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { createBooking } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';
import ChatMessageItem from '../src/components/chat/ChatMessageItem.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', { ...attrs, type: 'button', disabled: props.disabled || props.loading, onClick: (e: MouseEvent) => emit('click', e) }, slots.default?.());
  },
});
const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const stubs = { FhButton: ActionButton, FhMoney: SlotStub, FhDatePicker: SlotStub, FhTimeScrollPicker: SlotStub, RouterLink: true };

async function bookThroughToConfirm() {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  await wrapper.findAll('button').find((b) => b.text().includes('Tiếp tục'))?.trigger('click');
  // A booking takes a session of a day (PO 08/10/2026): pick the first one offered.
  await wrapper.find('button[data-testid^="session-2"]').trigger('click');
  await wrapper.findAll('button').find((b) => b.text().includes('Xác nhận'))?.trigger('click');
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
  push.mockReset();
  getCategories.mockReset().mockResolvedValue([{
    id: 'cat', name: 'Điện lạnh',
    services: [{ id: 'svc', name: 'Vệ sinh máy lạnh', pricingMode: 'fixed_price', fixedPrice: 200000, basePrice: 200000 }],
  }]);
  getAddresses.mockReset().mockResolvedValue([{ id: 'addr', label: 'Nhà', line1: '1 Test', district: 'Q1', province: 'HCM', isDefault: true }]);
  vi.stubGlobal('alert', vi.fn());
});

describe('Plain booking form', () => {
  it('keeps the plain booking form free of AI: an assistant session in the link is ignored', async () => {
    route.query = { serviceId: 'svc', aiSession: '25a67259319c492bb68fd414778b8ce0', desc: 'Máy lạnh kêu lạch cạch 😣' };
    const wrapper = await bookThroughToConfirm();
    expect(wrapper.find('[data-testid="ai-summary-note"]').exists()).toBe(false);
    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên'))?.trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'svc', description: 'Máy lạnh kêu lạch cạch 😣', mode: 'scheduled' }));
    expect(createBooking.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['morning', 'afternoon']).toContain(createBooking.mock.calls[0][0].slot);
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('preferredStartAt');
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('aiSessionId');
  });

  it.each([
    ['no session', {}],
    ['a malformed session', { aiSession: 'phiên 😀; drop' }],
    ['an over-long session', { aiSession: 'a'.repeat(129) }],
  ])('books normally with %s and shows no summary note', async (_label, query) => {
    route.query = { serviceId: 'svc', ...query };
    const wrapper = await bookThroughToConfirm();
    expect(wrapper.find('[data-testid="ai-summary-note"]').exists()).toBe(false);
    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên'))?.trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('aiSessionId');
  });

  it('caps a very long description carried from the chat', async () => {
    route.query = { serviceId: 'svc', desc: 'x'.repeat(5000) };
    const wrapper = await bookThroughToConfirm();
    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên'))?.trigger('click');
    await flushPromises();
    expect(createBooking.mock.calls[0][0].description).toHaveLength(1000);
  });
});

describe('Automatic message label', () => {
  const base = { id: 'm1', conversationId: 'c1', senderId: 't1', content: 'Chào anh/chị', createdAt: '2026-10-01T03:00:00Z', editedAt: null, isDeleted: false, clientMessageId: null };
  const render = (message: Record<string, unknown>) => mount(ChatMessageItem, { props: { message, isMe: false }, global: { stubs: { teleport: true } } });

  it('labels a message FixHome sent on the technician\'s behalf', () => {
    const wrapper = render({ ...base, isAutomated: true });
    expect(wrapper.get('[data-testid="message-automated"]').text()).toContain('Tin nhắn tự động');
  });

  it('shows no label on typed or retracted messages', () => {
    expect(render(base).find('[data-testid="message-automated"]').exists()).toBe(false);
    expect(render({ ...base, isAutomated: true, isDeleted: true }).find('[data-testid="message-automated"]').exists()).toBe(false);
  });
});
