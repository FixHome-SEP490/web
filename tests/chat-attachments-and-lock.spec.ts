import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// PO 18/10/2026: photos and videos in the chat, and the chat closes once the order is completed.

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { data: [] } }),
  post: vi.fn().mockResolvedValue({ data: { data: {} } }),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../src/api/client', () => ({
  default: apiClientMock,
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
}));
const socket = vi.hoisted(() => ({
  connected: false, connect: vi.fn(), disconnect: vi.fn(), subscribe: vi.fn(() => () => {}),
  joinConversation: vi.fn(), leaveConversation: vi.fn(), sendTyping: vi.fn(), updateToken: vi.fn(),
}));
vi.mock('../src/services/chat-socket.service', () => ({ default: socket, chatSocketService: socket }));
vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: { to: { type: Object, required: true } },
    setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to), 'data-testid': 'router-link' }, slots.default?.()),
  }),
}));

import ChatThread from '../src/components/chat/ChatThread.vue';
import ChatMessageItem from '../src/components/chat/ChatMessageItem.vue';
import { useChatStore } from '../src/stores/chat.store';
import { useAuthStore } from '../src/stores/auth.store';
import { chatAttachmentProblem, isConversationClosedError, messagingApi } from '../src/api/messaging.api';

const conversation = {
  id: 'conv-1', bookingId: 'booking-1', serviceOrderId: 'order-1', status: 'active',
  serviceName: 'Sửa vòi nước', counterpart: { id: 'tech-2', fullName: 'Thợ Hai', avatarUrl: null, role: 'technician' },
  lastMessageAt: null, lastMessagePreview: null, unreadCount: 0, canSend: true, closedReason: null,
};

function mountThread(overrides: Record<string, unknown> = {}, role = 'customer') {
  const auth = useAuthStore();
  auth.user = { id: role === 'customer' ? 'cust-1' : 'tech-2', role, fullName: 'X', email: 'x@example.test' } as never;
  const store = useChatStore();
  store.conversations = [{ ...conversation, ...overrides }] as never;
  store.messages = { 'conv-1': [] } as never;
  return { store, wrapper: mount(ChatThread, { props: { conversationId: 'conv-1' }, global: { stubs: { ChatMessageItem: true, ChatTypingDots: true } } }) };
}

const file = (name: string, type: string, size: number) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

async function pick(wrapper: ReturnType<typeof mount>, picked: File) {
  const input = wrapper.get('[data-testid="chat-attach-input"]');
  Object.defineProperty(input.element, 'files', { value: [picked], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() }));
});

describe('chat photos and videos', () => {
  it('accepts photos up to 10 MB and videos up to 50 MB, nothing else', () => {
    expect(chatAttachmentProblem(file('a.jpg', 'image/jpeg', 1024))).toBeNull();
    expect(chatAttachmentProblem(file('a.mov', 'video/quicktime', 49 * 1024 * 1024))).toBeNull();
    expect(chatAttachmentProblem(file('a.png', 'image/png', 10 * 1024 * 1024 + 1))).toContain('10 MB');
    expect(chatAttachmentProblem(file('a.mp4', 'video/mp4', 50 * 1024 * 1024 + 1))).toContain('50 MB');
    expect(chatAttachmentProblem(file('a.pdf', 'application/pdf', 10))).toContain('Chỉ gửi được ảnh');
    expect(chatAttachmentProblem(file('a.gif', 'image/gif', 10))).toContain('Chỉ gửi được ảnh');
  });

  it('sends one file as multipart with the caption and the client id', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: { id: 'm1', attachment: { kind: 'video', mimeType: 'video/mp4', sizeBytes: 3 } } } });
    const picked = file('leak.mp4', 'video/mp4', 3);
    const sent = await messagingApi.sendAttachment('conv-1', picked, '  Chỗ rò  ', 'web_1');
    expect(sent.id).toBe('m1');
    const [url, form, config] = apiClientMock.post.mock.calls[0];
    expect(url).toBe('/conversations/conv-1/attachments');
    expect((form as FormData).get('file')).toBe(picked);
    expect((form as FormData).get('content')).toBe('Chỗ rò');
    expect((form as FormData).get('clientMessageId')).toBe('web_1');
    expect(config.timeout).toBeGreaterThanOrEqual(120000);
  });

  it('picks a file from the composer, sends it with what is typed and shows a clear line when it cannot go', async () => {
    const { store, wrapper } = mountThread();
    const send = vi.spyOn(store, 'sendAttachment').mockResolvedValue(undefined);
    await wrapper.get('textarea').setValue('Đây ạ');
    await pick(wrapper, file('a.jpg', 'image/jpeg', 2048));
    expect(send).toHaveBeenCalledWith(expect.any(File), 'Đây ạ');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');

    await pick(wrapper, file('big.mp4', 'video/mp4', 60 * 1024 * 1024));
    expect(send).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid="chat-attach-error"]').text()).toContain('50 MB');

    send.mockRejectedValueOnce(new Error('network'));
    await wrapper.get('textarea').setValue('clip');
    await pick(wrapper, file('ok.mp4', 'video/mp4', 1024));
    expect(wrapper.get('[data-testid="chat-attach-error"]').text()).toBe('Chưa gửi được video, vui lòng thử lại.');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('clip');
    expect(wrapper.text()).not.toMatch(/network|Error|409/);
  });

  it('shows the bubble at once from the local file and swaps in the stored message', async () => {
    const store = useChatStore();
    store.activeConversationId = 'conv-1';
    store.conversations = [conversation] as never;
    let resolve!: (value: unknown) => void;
    apiClientMock.post.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const sending = store.sendAttachment(file('a.png', 'image/png', 10), 'Xem giúp');
    expect(store.messages['conv-1'][0]).toMatchObject({ content: 'Xem giúp', localPreviewUrl: 'blob:local', attachment: { kind: 'image' } });
    resolve({ data: { data: { id: 'm9', conversationId: 'conv-1', senderId: 'cust-1', content: 'Xem giúp', createdAt: '2030-01-01T00:00:00Z', clientMessageId: store.messages['conv-1'][0].clientMessageId, attachment: { kind: 'image', mimeType: 'image/png', sizeBytes: 10 } } } });
    await sending;
    expect(store.messages['conv-1']).toHaveLength(1);
    expect(store.messages['conv-1'][0]).toMatchObject({ id: 'm9', localPreviewUrl: 'blob:local' });
    expect(store.conversations[0].lastMessagePreview).toBe('Xem giúp');
  });

  it('renders a stored photo from the protected proxy and says so plainly when it cannot load', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: new Blob(['img'], { type: 'image/png' }) });
    const message = { id: 'm1', conversationId: 'conv-1', senderId: 'tech-2', content: '', createdAt: '2030-01-01T00:00:00Z', editedAt: null, isDeleted: false, clientMessageId: null, attachment: { kind: 'image', mimeType: 'image/png', sizeBytes: 3 } };
    const item = mount(ChatMessageItem, { props: { message, isMe: false } });
    await flushPromises();
    expect(apiClientMock.get).toHaveBeenCalledWith('/messages/m1/attachment', expect.objectContaining({ responseType: 'blob' }));
    expect(item.get('[data-testid="chat-attachment-image"]').attributes('src')).toBe('blob:local');
    // No empty text bubble under a photo without a caption.
    expect(item.findAll('.whitespace-pre-wrap')).toHaveLength(0);

    apiClientMock.get.mockRejectedValueOnce(new Error('503'));
    const broken = mount(ChatMessageItem, { props: { message: { ...message, id: 'm2', attachment: { kind: 'video', mimeType: 'video/mp4', sizeBytes: 3 } }, isMe: true } });
    await flushPromises();
    expect(broken.text()).toContain('Chưa tải được video');
    expect(broken.text()).not.toContain('503');

    const retracted = mount(ChatMessageItem, { props: { message: { ...message, id: 'm3', isDeleted: true }, isMe: false } });
    expect(retracted.find('[data-testid="chat-attachment"]').exists()).toBe(false);
    expect(retracted.text()).toContain('Tin nhắn đã được gỡ');
  });
});

describe('chat closed after the order is completed', () => {
  it('tells the customer why and offers the warranty claim that opens it again', () => {
    const { wrapper } = mountThread({ canSend: false, closedReason: 'order_completed' });
    const banner = wrapper.get('[data-testid="chat-closed-completed"]');
    expect(banner.text()).toContain('Đơn đã hoàn tất nên cuộc trò chuyện đã khoá');
    expect(banner.text()).toContain('gửi yêu cầu bảo hành');
    const link = wrapper.get('[data-testid="chat-claim-warranty"]');
    expect(JSON.parse(link.attributes('data-to')!)).toEqual({ name: 'customer-order-detail', params: { id: 'order-1' }, query: { claimWarranty: 'true' } });
    expect(wrapper.find('[data-testid="chat-attach"]').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).toContain('Cuộc trò chuyện đã khoá vì đơn đã hoàn tất');
  });

  it('tells the technician it opens again with a claim, without a claim button', () => {
    const { wrapper } = mountThread({ canSend: false, closedReason: 'order_completed' }, 'technician');
    expect(wrapper.get('[data-testid="chat-closed-completed"]').text()).toContain('Khi khách gửi yêu cầu bảo hành');
    expect(wrapper.find('[data-testid="chat-claim-warranty"]').exists()).toBe(false);
  });

  it('keeps the old read-only line for a thread that lost the matching round', () => {
    const { wrapper } = mountThread({ canSend: false, status: 'read_only', closedReason: null });
    expect(wrapper.find('[data-testid="chat-closed-completed"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('chế độ chỉ đọc');
    expect(wrapper.text()).toContain('Khung trò chuyện đã đóng');
  });

  it('reloads the thread when the server refuses a send because the order completed meanwhile', async () => {
    const store = useChatStore();
    store.activeConversationId = 'conv-1';
    store.conversations = [conversation] as never;
    const closed = Object.assign(new Error('Request failed'), { response: { status: 409, data: { error: { code: 'CONVERSATION_CLOSED' } } } });
    expect(isConversationClosedError(closed)).toBe(true);
    expect(isConversationClosedError({ response: { status: 409, data: { error: { code: 'CONFLICT' } } } })).toBe(false);
    apiClientMock.post.mockRejectedValueOnce(closed);
    apiClientMock.get.mockResolvedValueOnce({ data: { data: { ...conversation, canSend: false, closedReason: 'order_completed' } } });
    await expect(store.sendMessage('Còn bảo hành không?')).rejects.toBe(closed);
    await flushPromises();
    expect(apiClientMock.get).toHaveBeenCalledWith('/conversations/conv-1');
    expect(store.conversations[0]).toMatchObject({ canSend: false, closedReason: 'order_completed' });
    expect(store.messages['conv-1']).toEqual([]);
  });
});
