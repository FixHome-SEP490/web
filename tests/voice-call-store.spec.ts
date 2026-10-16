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
const { socketMock, mediaMock, toastMock, tonesMock } = vi.hoisted(() => ({
  socketMock: {
    iceServers: [] as RTCIceServer[],
    subscribe: vi.fn(),
    callInvite: vi.fn(),
    callRinging: vi.fn(),
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
  tonesMock: { prime: vi.fn(), ringback: vi.fn(), ringtone: vi.fn(), failed: vi.fn(), ended: vi.fn(), stop: vi.fn() },
}));

vi.mock('../src/services/call-tones', () => ({ callTones: tonesMock }));

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

      expect(store.status).toBe('ended');
      expect(mediaMock.stop).toHaveBeenCalled();
      expect(store.statusLabel).toBe('Máy bận');
      expect(store.endInfo).toMatchObject({ detail: 'Trần Văn Kỹ đang trong cuộc gọi khác.', canRedial: true, failed: true });
      expect(tonesMock.failed).toHaveBeenCalled();
    });

    it('says at once when the other person has the app closed, instead of ringing into nothing', async () => {
      socketMock.callInvite.mockResolvedValue({ ok: false, reason: 'offline' });
      const store = freshStore();

      await store.startCall('conv1');

      expect(store.status).toBe('ended');
      expect(store.statusLabel).toBe('Không liên lạc được');
      expect(store.endInfo?.detail).toContain('hiện không mở ứng dụng');
      expect(mediaMock.stop).toHaveBeenCalled();
    });

    it('tells a caller who is already on a call that it is their own line', async () => {
      socketMock.callInvite.mockResolvedValue({ ok: false, reason: 'self_busy' });
      const store = freshStore();

      await store.startCall('conv1');

      expect(store.status).toBe('idle');
      expect(toastMock.error).toHaveBeenCalledWith('Bạn đang trong một cuộc gọi khác');
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
      expect(store.status).toBe('ended');
      expect(store.callId).toBeNull();
      expect(store.statusLabel).toBe('Cuộc gọi bị từ chối');
      expect(store.endInfo?.canRedial).toBe(true);
    });

    it('names each reason in Vietnamese, from the caller\'s side', async () => {
      const labels: Record<string, string> = {
        timeout: 'Không trả lời',
        busy: 'Máy bận',
        disconnected: 'Mất kết nối',
        ended: 'Cuộc gọi đã kết thúc',
      };
      for (const [reason, label] of Object.entries(labels)) {
        setActivePinia(createPinia());
        const store = freshStore();
        await store.startCall('conv1');
        signallingHandlers().onCallEnded!({ callId: 'call-1', conversationId: 'conv1', reason: reason as never });
        expect(store.statusLabel).toBe(label);
      }
    });

    it('a call the callee never picked up is a missed call on their screen', () => {
      for (const reason of ['cancelled', 'timeout'] as const) {
        setActivePinia(createPinia());
        const store = freshStore();
        signallingHandlers().onCallIncoming!({ callId: 'call-9', conversationId: 'conv1', fromUserId: 't1' });
        signallingHandlers().onCallEnded!({ callId: 'call-9', conversationId: 'conv1', reason });
        expect(store.statusLabel).toBe('Cuộc gọi nhỡ');
        expect(store.endInfo).toMatchObject({ detail: 'Trần Văn Kỹ đã gọi cho bạn.', canRedial: true });
      }
    });

    it('stops ringing quietly when the call was answered on another device', () => {
      const store = freshStore();
      signallingHandlers().onCallIncoming!({ callId: 'call-9', conversationId: 'conv1', fromUserId: 't1' });

      signallingHandlers().onCallEnded!({ callId: 'call-9', conversationId: 'conv1', reason: 'answered_elsewhere' });

      expect(store.status).toBe('idle');
      expect(tonesMock.stop).toHaveBeenCalled();
      expect(tonesMock.failed).not.toHaveBeenCalled();
    });

    it('stops the call when the socket goes down', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onStatusChange!(false);

      expect(store.status).toBe('ended');
      expect(mediaMock.stop).toHaveBeenCalled();
      expect(store.statusLabel).toBe('Mất kết nối máy chủ');
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
      expect(store.statusLabel).toBe('Đang gọi…');

      signallingHandlers().onCallRinging!({ callId: 'call-1', conversationId: 'conv1' });
      expect(store.statusLabel).toBe('Đang đổ chuông…');

      await signallingHandlers().onCallAccepted!({
        callId: 'call-1',
        conversationId: 'conv1',
      });
      expect(store.statusLabel).toBe('Đang kết nối…');
    });
  });

  describe('a call that sounds and behaves like a phone call', () => {
    it('the caller hears ringback only once the other phone is ringing', async () => {
      const store = freshStore();
      await store.startCall('conv1');
      expect(tonesMock.ringback).not.toHaveBeenCalled();

      signallingHandlers().onCallRinging!({ callId: 'call-1', conversationId: 'conv1' });

      expect(store.status).toBe('ringing');
      expect(tonesMock.ringback).toHaveBeenCalledTimes(1);
    });

    it('ignores a ringing signal for another call', async () => {
      const store = freshStore();
      await store.startCall('conv1');
      signallingHandlers().onCallRinging!({ callId: 'other', conversationId: 'conv1' });
      expect(store.status).toBe('outgoing');
    });

    it('rings on the callee side and tells the caller it rings', () => {
      const store = freshStore();

      signallingHandlers().onCallIncoming!({ callId: 'call-9', conversationId: 'conv1', fromUserId: 't1' });

      expect(store.status).toBe('incoming');
      expect(tonesMock.ringtone).toHaveBeenCalled();
      expect(socketMock.callRinging).toHaveBeenCalledWith('call-9');
    });

    it('stops every tone as soon as the call is picked up', async () => {
      const store = freshStore();
      signallingHandlers().onCallIncoming!({ callId: 'call-9', conversationId: 'conv1', fromUserId: 't1' });
      tonesMock.stop.mockClear();

      await store.acceptCall();

      expect(tonesMock.stop).toHaveBeenCalled();
      expect(store.status).toBe('connecting');
    });

    it('gives up with "Không kết nối được" when the audio never connects', async () => {
      vi.useFakeTimers();
      try {
        const store = freshStore();
        await store.startCall('conv1');
        await signallingHandlers().onCallAccepted!({ callId: 'call-1', conversationId: 'conv1' });
        expect(store.status).toBe('connecting');

        await vi.advanceTimersByTimeAsync(20_000);

        expect(store.status).toBe('ended');
        expect(store.statusLabel).toBe('Không kết nối được');
        expect(socketMock.callEnd).toHaveBeenCalledWith('call-1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows how a finished call went, then closes by itself', async () => {
      vi.useFakeTimers();
      try {
        const store = freshStore();
        await store.startCall('conv1');
        await signallingHandlers().onCallAccepted!({ callId: 'call-1', conversationId: 'conv1' });
        const handlers = mediaMock.open.mock.calls.at(-1)![1] as { onConnectionStateChange: (s: string) => void };
        handlers.onConnectionStateChange('connected');
        await vi.advanceTimersByTimeAsync(65_000);

        await store.hangUp();

        expect(store.status).toBe('ended');
        expect(store.statusLabel).toBe('Cuộc gọi đã kết thúc');
        expect(store.endInfo).toMatchObject({ detail: 'Thời lượng 1:05', canRedial: false, failed: false });
        expect(tonesMock.ended).toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(4000);
        expect(store.status).toBe('idle');
      } finally {
        vi.useRealTimers();
      }
    });

    it('"Gọi lại" calls the same person again from the end screen', async () => {
      socketMock.callInvite.mockResolvedValueOnce({ ok: false, reason: 'busy' });
      const store = freshStore();
      await store.startCall('conv1');
      expect(store.status).toBe('ended');

      await store.redial();

      expect(socketMock.callInvite).toHaveBeenLastCalledWith('conv1');
      expect(store.status).toBe('outgoing');
      expect(store.endInfo).toBeNull();
    });

    it('can take a new incoming call while the end screen is still up', async () => {
      socketMock.callInvite.mockResolvedValueOnce({ ok: false, reason: 'busy' });
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onCallIncoming!({ callId: 'call-9', conversationId: 'conv1', fromUserId: 't1' });

      expect(store.status).toBe('incoming');
    });

    it('a missed call while busy is a quiet heads-up naming who called', async () => {
      const store = freshStore();
      await store.startCall('conv1');

      signallingHandlers().onCallMissed!({ conversationId: 'conv1', fromUserId: 't1', reason: 'busy' });

      expect(store.status).toBe('outgoing');
      expect(toastMock.info).toHaveBeenCalledWith('Trần Văn Kỹ vừa gọi cho bạn lúc bạn đang trong cuộc gọi khác');
    });
  });
});
