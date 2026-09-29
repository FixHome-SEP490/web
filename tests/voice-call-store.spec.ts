import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ChatSocketHandlers } from '../src/services/chat-socket.service';

/**
 * The call store is the state machine the user actually sees: ringing, talking,
 * hung up. These tests care about two things — that the microphone is never
 * left running, and that an event meant for a different call is ignored.
 */

// vi.mock factories are hoisted above every other statement, so the doubles
// they close over have to be hoisted too.
const { socketMock, mediaMock, toastMock } = vi.hoisted(() => ({
  socketMock: {
    iceServers: [] as RTCIceServer[],
    subscribe: vi.fn(),
    callInvite: vi.fn(),
    callAccept: vi.fn(),
    callReject: vi.fn(),
    callCancel: vi.fn(),
    callEnd: vi.fn(),
    sendOffer: vi.fn(),
    sendAnswer: vi.fn(),
    sendIceCandidate: vi.fn(),
  },
  mediaMock: {
    acquireMicrophone: vi.fn(),
    open: vi.fn(),
    createOffer: vi.fn(),
    acceptOffer: vi.fn(),
    acceptAnswer: vi.fn(),
    addIceCandidate: vi.fn(),
    setMuted: vi.fn(),
    stop: vi.fn(),
  },
  toastMock: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/services/chat-socket.service', () => ({
  chatSocketService: socketMock,
}));

vi.mock('../src/services/webrtc-call.service', () => ({
  webRtcCallService: mediaMock,
  CallMediaError: class CallMediaError extends Error {
    constructor(
      public kind: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    conversations: [
      {
        id: 'conv1',
        counterpart: { id: 't1', fullName: 'Trần Văn Kỹ', role: 'TECHNICIAN', avatarUrl: null },
      },
    ],
  }),
}));

vi.mock('vue-sonner', () => ({ toast: toastMock }));

import { useCallStore } from '../src/stores/call.store';
import { CallMediaError } from '../src/services/webrtc-call.service';

/** The handler bundle the store hands to the socket on init. */
function signallingHandlers(): ChatSocketHandlers {
  return socketMock.subscribe.mock.calls.at(-1)![0] as ChatSocketHandlers;
}

function freshStore() {
  const store = useCallStore();
  store.initCallSignalling();
  return store;
}

describe('call store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    socketMock.iceServers = [];
    mediaMock.acquireMicrophone.mockResolvedValue(new (class {})() as MediaStream);
    mediaMock.createOffer.mockResolvedValue({ type: 'offer', sdp: 'v=0' });
    mediaMock.acceptOffer.mockResolvedValue({ type: 'answer', sdp: 'v=0' });
    socketMock.callInvite.mockResolvedValue({ ok: true, callId: 'call-1' });
    socketMock.callAccept.mockResolvedValue({ ok: true });
    socketMock.callReject.mockResolvedValue({ ok: true });
    socketMock.callCancel.mockResolvedValue({ ok: true });
    socketMock.callEnd.mockResolvedValue({ ok: true });
  });

  describe('placing a call', () => {
    it('opens the microphone before anybody is rung', async () => {
      const store = freshStore();

      await store.startCall('conv1');

      expect(mediaMock.acquireMicrophone).toHaveBeenCalled();
      expect(socketMock.callInvite).toHaveBeenCalledWith('conv1');
      expect(
        mediaMock.acquireMicrophone.mock.invocationCallOrder[0],
      ).toBeLessThan(socketMock.callInvite.mock.invocationCallOrder[0]);
      expect(store.status).toBe('outgoing');
      expect(store.callId).toBe('call-1');
    });

    it('never rings anyone when the microphone is refused', async () => {
      mediaMock.acquireMicrophone.mockRejectedValue(
        new CallMediaError('permission-denied', 'Bạn chưa cho phép trang này dùng micro.'),
      );
      const store = freshStore();

      await store.startCall('conv1');

      expect(socketMock.callInvite).not.toHaveBeenCalled();
      expect(store.status).toBe('idle');
      expect(toastMock.error).toHaveBeenCalledWith(
        'Bạn chưa cho phép trang này dùng micro.',
      );
    });

    it('explains a busy line and releases the microphone again', async () => {
      socketMock.callInvite.mockResolvedValue({ ok: false, reason: 'busy' });
      const store = freshStore();

      await store.startCall('conv1');

      expect(store.status).toBe('idle');
      expect(mediaMock.stop).toHaveBeenCalled();
      expect(toastMock.error).toHaveBeenCalledWith(
        'Đối phương đang có cuộc gọi khác',
      );
    });

    it('explains a conversation that can no longer be called', async () => {
      socketMock.callInvite.mockResolvedValue({ ok: false, reason: 'forbidden' });
      const store = freshStore();

      await store.startCall('conv1');

      expect(toastMock.error).toHaveBeenCalledWith(
        'Không thể gọi trong cuộc trò chuyện này',
      );
      expect(store.status).toBe('idle');
    });

    it('refuses to start a second call while one is running', async () => {
      const store = freshStore();
      await store.startCall('conv1');
      socketMock.callInvite.mockClear();

      await store.startCall('conv1');

      expect(socketMock.callInvite).not.toHaveBeenCalled();
    });
  });

  describe('the handshake', () => {
    it('creates the offer once the other side picks up', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      await signallingHandlers().onCallAccepted!({
        callId: 'call-1',
        conversationId: 'conv1',
      });

      expect(mediaMock.open).toHaveBeenCalled();
      expect(socketMock.sendOffer).toHaveBeenCalledWith('call-1', {
        type: 'offer',
        sdp: 'v=0',
      });
      expect(store.status).toBe('connecting');
    });

    it('answers an offer addressed to the current call', async () => {
      const store = freshStore();
      signallingHandlers().onCallIncoming!({
        callId: 'call-9',
        conversationId: 'conv1',
        fromUserId: 'c1',
      });
      await store.acceptCall();

      await signallingHandlers().onCallOffer!({
        callId: 'call-9',
        data: { type: 'offer', sdp: 'v=0' },
      });

      expect(socketMock.sendAnswer).toHaveBeenCalledWith('call-9', {
        type: 'answer',
        sdp: 'v=0',
      });
    });

    it('ignores signalling that belongs to a different call', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      await signallingHandlers().onCallAnswer!({
        callId: 'someone-elses-call',
        data: { type: 'answer', sdp: 'v=0' },
      });
      await signallingHandlers().onCallIce!({
        callId: 'someone-elses-call',
        data: { candidate: 'a' },
      });

      expect(mediaMock.acceptAnswer).not.toHaveBeenCalled();
      expect(mediaMock.addIceCandidate).not.toHaveBeenCalled();
    });

    it('ignores an incoming call while already busy', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onCallIncoming!({
        callId: 'call-2',
        conversationId: 'conv1',
        fromUserId: 'x9',
      });

      expect(store.callId).toBe('call-1');
      expect(store.status).toBe('outgoing');
    });
  });

  describe('answering', () => {
    it('has the connection ready before telling the server it picked up', async () => {
      const store = freshStore();
      signallingHandlers().onCallIncoming!({
        callId: 'call-9',
        conversationId: 'conv1',
        fromUserId: 'c1',
      });
      expect(store.status).toBe('incoming');

      await store.acceptCall();

      expect(
        mediaMock.open.mock.invocationCallOrder[0],
      ).toBeLessThan(socketMock.callAccept.mock.invocationCallOrder[0]);
      expect(store.status).toBe('connecting');
    });

    it('declines instead of picking up when the microphone fails', async () => {
      mediaMock.acquireMicrophone.mockRejectedValue(
        new CallMediaError('no-microphone', 'Không tìm thấy micro nào trên thiết bị này.'),
      );
      const store = freshStore();
      signallingHandlers().onCallIncoming!({
        callId: 'call-9',
        conversationId: 'conv1',
        fromUserId: 'c1',
      });

      await store.acceptCall();

      expect(socketMock.callAccept).not.toHaveBeenCalled();
      expect(socketMock.callReject).toHaveBeenCalledWith('call-9');
      expect(store.status).toBe('idle');
    });
  });

  describe('hanging up', () => {
    it('cancels a call that is still ringing', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      await store.hangUp();

      expect(socketMock.callCancel).toHaveBeenCalledWith('call-1');
      expect(socketMock.callEnd).not.toHaveBeenCalled();
      expect(store.status).toBe('idle');
    });

    it('ends a call that has been answered', async () => {
      const store = freshStore();
      await store.startCall('conv1');
      await signallingHandlers().onCallAccepted!({
        callId: 'call-1',
        conversationId: 'conv1',
      });

      await store.hangUp();

      expect(socketMock.callEnd).toHaveBeenCalledWith('call-1');
      expect(socketMock.callCancel).not.toHaveBeenCalled();
    });

    it('releases the microphone on every ending', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onCallEnded!({
        callId: 'call-1',
        conversationId: 'conv1',
        reason: 'rejected',
      });

      expect(mediaMock.stop).toHaveBeenCalled();
      expect(store.status).toBe('idle');
      expect(store.callId).toBeNull();
      expect(toastMock.info).toHaveBeenCalledWith('Cuộc gọi bị từ chối');
    });

    it('names each reason in Vietnamese', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onCallEnded!({
        callId: 'call-1',
        conversationId: 'conv1',
        reason: 'timeout',
      });

      expect(toastMock.info).toHaveBeenCalledWith('Không có người bắt máy');
    });

    it('stops the call when the socket goes down', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onStatusChange!(false);

      expect(store.status).toBe('idle');
      expect(mediaMock.stop).toHaveBeenCalled();
      expect(toastMock.error).toHaveBeenCalledWith(
        'Mất kết nối máy chủ, cuộc gọi đã dừng',
      );
    });

    it('leaves an idle session alone when the socket goes down', () => {
      freshStore();

      signallingHandlers().onStatusChange!(false);

      expect(toastMock.error).not.toHaveBeenCalled();
    });
  });

  describe('during the call', () => {
    it('mutes and unmutes the microphone without dropping the call', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      store.toggleMute();
      expect(store.isMuted).toBe(true);
      expect(mediaMock.setMuted).toHaveBeenLastCalledWith(true);

      store.toggleMute();
      expect(store.isMuted).toBe(false);
      expect(mediaMock.setMuted).toHaveBeenLastCalledWith(false);
      expect(store.status).toBe('outgoing');
    });

    it('shows the counterpart from the conversation the call belongs to', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      expect(store.peerName).toBe('Trần Văn Kỹ');
      expect(store.peerRoleLabel).toBe('Kỹ thuật viên');
    });

    it('labels each stage in Vietnamese', async () => {
      const store = freshStore();
      expect(store.statusLabel).toBe('');

      await store.startCall('conv1');
      expect(store.statusLabel).toBe('Đang gọi...');

      await signallingHandlers().onCallAccepted!({
        callId: 'call-1',
        conversationId: 'conv1',
      });
      expect(store.statusLabel).toBe('Đang kết nối...');
    });
  });
});
