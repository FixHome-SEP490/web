// src/stores/call.store.ts
import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import { toast } from 'vue-sonner';
import {
  chatSocketService,
  type CallEndReason,
} from '../services/chat-socket.service';
import {
  webRtcCallService,
  CallMediaError,
} from '../services/webrtc-call.service';
import { callTones } from '../services/call-tones';
import { useChatStore } from './chat.store';

/**
 * Where a call is in its life.
 *
 * - outgoing: asked the server to ring; the other phone has not rung yet.
 * - ringing: the other phone is ringing (its app said so); the caller hears ringback.
 * - incoming: this phone is ringing.
 * - connecting: picked up, the audio path is being set up.
 * - connected: talking.
 * - ended: the call is over and the screen says how, for a moment, with
 *   "Gọi lại" where calling again makes sense.
 */
export type CallStatus =
  | 'idle'
  | 'outgoing'
  | 'ringing'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'ended';

/** Who placed the current call, from this side's point of view. */
type CallRole = 'caller' | 'callee';

/** What the end screen shows. */
export interface CallEndInfo {
  title: string;
  detail: string;
  /** Offer "Gọi lại": the call did not happen and trying again may work. */
  canRedial: boolean;
  /** A real failure (busy, refused, no answer) rather than a normal hang-up. */
  failed: boolean;
}

/** How long the end screen stays before it closes by itself. */
const END_SCREEN_MS = 4000;
const END_SCREEN_REDIAL_MS = 7000;
/** Picked up but no audio path after this long: say so instead of hanging. */
const CONNECT_TIMEOUT_MS = 20_000;

/** What to tell the user when the server will not place the call. */
const INVITE_REASON_TEXT: Record<string, string> = {
  forbidden: 'Không thể gọi trong cuộc trò chuyện này',
  invalid: 'Không thể bắt đầu cuộc gọi',
  self_busy: 'Bạn đang trong một cuộc gọi khác',
};

export const useCallStore = defineStore('call', () => {
  const status = ref<CallStatus>('idle');
  const callId = ref<string | null>(null);
  const conversationId = ref<string | null>(null);
  const role = ref<CallRole | null>(null);
  const isMuted = ref(false);
  const durationSeconds = ref(0);
  const endInfo = ref<CallEndInfo | null>(null);
  /** Not deeply reactive: a MediaStream is a handle, not a value to diff. */
  const remoteStream = shallowRef<MediaStream | null>(null);

  let isInitialized = false;
  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;

  /** The call screen is up (a call, or the moment after one). */
  const isActive = computed(() => status.value !== 'idle');
  /** A call is in progress: no second call can start or be received. */
  const isBusy = computed(() => status.value !== 'idle' && status.value !== 'ended');
  const isInCall = computed(
    () => status.value === 'connecting' || status.value === 'connected',
  );

  /**
   * The name on the call screen comes from the conversation the call belongs
   * to, so it always matches the thread the user was looking at.
   */
  const peer = computed(() => {
    if (!conversationId.value) return null;
    const chatStore = useChatStore();
    const conversation = chatStore.conversations.find(
      (c) => c.id === conversationId.value,
    );
    return conversation?.counterpart ?? null;
  });

  const peerName = computed(() => peer.value?.fullName || 'Người dùng');

  const peerRoleLabel = computed(() => {
    const r = peer.value?.role?.toUpperCase();
    if (r === 'TECHNICIAN') return 'Kỹ thuật viên';
    if (r === 'CUSTOMER') return 'Khách hàng';
    return '';
  });

  const formatDuration = (total: number) =>
    `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

  const durationLabel = computed(() => formatDuration(durationSeconds.value));

  const statusLabel = computed(() => {
    switch (status.value) {
      case 'outgoing':
        return 'Đang gọi…';
      case 'ringing':
        return 'Đang đổ chuông…';
      case 'incoming':
        return 'Cuộc gọi thoại đến';
      case 'connecting':
        return 'Đang kết nối…';
      case 'connected':
        return durationLabel.value;
      case 'ended':
        return endInfo.value?.title ?? '';
      default:
        return '';
    }
  });

  // ------------------------------------------------------------------ wiring

  /**
   * Subscribed once, for the whole session. Call events arrive on the personal
   * room, so an incoming call reaches the user even with no thread open, which
   * is the only way a call is any use.
   */
  function initCallSignalling(): void {
    if (isInitialized) return;
    isInitialized = true;
    callTones.prime();

    chatSocketService.subscribe({
      onCallIncoming(event) {
        // The server allows only one live call per person, so anything arriving
        // while busy is a stale event rather than a second caller.
        if (isBusy.value) return;
        clearEndScreen();
        callId.value = event.callId;
        conversationId.value = event.conversationId;
        role.value = 'callee';
        status.value = 'incoming';
        callTones.ringtone();
        // Tell the caller it is ringing here: they hear ringback from now on.
        chatSocketService.callRinging(event.callId);
      },

      onCallRinging(event) {
        if (event.callId !== callId.value || status.value !== 'outgoing') return;
        status.value = 'ringing';
        callTones.ringback();
      },

      async onCallAccepted(event) {
        if (event.callId !== callId.value) return;
        callTones.stop();
        status.value = 'connecting';
        startConnectTimeout();
        try {
          openPeerConnection();
          chatSocketService.sendOffer(event.callId, await webRtcCallService.createOffer());
        } catch {
          failCall('Không thiết lập được cuộc gọi');
        }
      },

      async onCallOffer(event) {
        if (event.callId !== callId.value) return;
        try {
          const answer = await webRtcCallService.acceptOffer(event.data);
          chatSocketService.sendAnswer(event.callId, answer);
        } catch {
          failCall('Không thiết lập được cuộc gọi');
        }
      },

      async onCallAnswer(event) {
        if (event.callId !== callId.value) return;
        try {
          await webRtcCallService.acceptAnswer(event.data);
        } catch {
          failCall('Không thiết lập được cuộc gọi');
        }
      },

      async onCallIce(event) {
        if (event.callId !== callId.value) return;
        await webRtcCallService.addIceCandidate(event.data);
      },

      onCallEnded(event) {
        if (event.callId !== callId.value) return;
        endedByServer(event.reason);
      },

      onCallMissed(event) {
        // Someone tried while this line was busy: a quiet heads-up, not an interruption.
        const chatStore = useChatStore();
        const from = chatStore.conversations.find((c) => c.id === event.conversationId)?.counterpart?.fullName;
        toast.info(`${from || 'Một người'} vừa gọi cho bạn lúc bạn đang trong cuộc gọi khác`);
      },

      onStatusChange(connected) {
        // Losing the socket means losing signalling; the media would follow.
        if (!connected && isBusy.value) {
          showEnd({ title: 'Mất kết nối máy chủ', detail: 'Cuộc gọi đã dừng. Kiểm tra mạng rồi gọi lại.', canRedial: true, failed: true });
        }
      },
    });
  }

  /** The server says the call is over; what that means depends on which side we are. */
  function endedByServer(reason: CallEndReason): void {
    const caller = role.value === 'caller';
    const talked = durationSeconds.value;
    switch (reason) {
      case 'answered_elsewhere':
        // Picked up on another of this person's devices: just stop ringing here.
        reset();
        return;
      case 'rejected':
        if (!caller) return reset();
        return showEnd({ title: 'Cuộc gọi bị từ chối', detail: `${peerName.value} đang bận, hãy nhắn tin hoặc gọi lại sau.`, canRedial: true, failed: true });
      case 'cancelled':
        if (caller) return reset();
        return showEnd({ title: 'Cuộc gọi nhỡ', detail: `${peerName.value} đã gọi cho bạn.`, canRedial: true, failed: true });
      case 'timeout':
        return caller
          ? showEnd({ title: 'Không trả lời', detail: `${peerName.value} chưa nghe máy.`, canRedial: true, failed: true })
          : showEnd({ title: 'Cuộc gọi nhỡ', detail: `${peerName.value} đã gọi cho bạn.`, canRedial: true, failed: true });
      case 'busy':
        return showEnd({ title: 'Máy bận', detail: `${peerName.value} đang trong cuộc gọi khác.`, canRedial: true, failed: true });
      case 'disconnected':
        return showEnd({ title: 'Mất kết nối', detail: `Không còn kết nối với ${peerName.value}.`, canRedial: true, failed: true });
      case 'ended':
      default:
        return showEnd({ title: 'Cuộc gọi đã kết thúc', detail: talked ? `Thời lượng ${formatDuration(talked)}` : '', canRedial: false, failed: false });
    }
  }

  function openPeerConnection(): void {
    webRtcCallService.open(chatSocketService.iceServers, {
      onRemoteStream(stream) {
        remoteStream.value = stream;
      },
      onIceCandidate(candidate) {
        if (callId.value) {
          chatSocketService.sendIceCandidate(callId.value, candidate);
        }
      },
      onConnectionStateChange(state) {
        if (state === 'connected') {
          clearConnectTimeout();
          status.value = 'connected';
          startTimer();
        } else if (state === 'failed') {
          failCall('Không kết nối được');
        }
      },
    });
  }

  // ----------------------------------------------------------------- actions

  /** Place a call in a conversation. */
  async function startCall(targetConversationId: string): Promise<void> {
    if (isBusy.value) return;
    clearEndScreen();

    // The microphone is opened first on purpose: if it is going to fail, it
    // should fail before the other person's screen lights up.
    try {
      await webRtcCallService.acquireMicrophone();
    } catch (error) {
      toast.error(
        error instanceof CallMediaError
          ? error.message
          : 'Không mở được micro',
      );
      return;
    }

    conversationId.value = targetConversationId;
    role.value = 'caller';
    status.value = 'outgoing';

    const result = await chatSocketService.callInvite(targetConversationId);
    if (!result.ok || !result.callId) {
      if (result.reason === 'offline') {
        return showEnd({ title: 'Không liên lạc được', detail: `${peerName.value} hiện không mở ứng dụng. Họ sẽ thấy cuộc gọi nhỡ của bạn.`, canRedial: true, failed: true });
      }
      if (result.reason === 'busy') {
        return showEnd({ title: 'Máy bận', detail: `${peerName.value} đang trong cuộc gọi khác.`, canRedial: true, failed: true });
      }
      toast.error(INVITE_REASON_TEXT[result.reason ?? 'invalid'] ?? 'Không thể bắt đầu cuộc gọi');
      reset();
      return;
    }
    callId.value = result.callId;
  }

  /** Call the same person again from the end screen. */
  async function redial(): Promise<void> {
    const target = conversationId.value;
    if (status.value !== 'ended' || !target) return;
    await startCall(target);
  }

  /** Pick up. The peer connection is ready before the server is told. */
  async function acceptCall(): Promise<void> {
    if (status.value !== 'incoming' || !callId.value) return;
    callTones.stop();

    try {
      await webRtcCallService.acquireMicrophone();
      openPeerConnection();
    } catch (error) {
      toast.error(
        error instanceof CallMediaError ? error.message : 'Không mở được micro',
      );
      await declineCall();
      return;
    }

    status.value = 'connecting';
    startConnectTimeout();
    const result = await chatSocketService.callAccept(callId.value);
    if (!result.ok) {
      showEnd({ title: 'Cuộc gọi không còn hiệu lực', detail: 'Người gọi đã dừng trước khi bạn nghe máy.', canRedial: true, failed: true });
    }
  }

  async function declineCall(): Promise<void> {
    const id = callId.value;
    reset();
    if (id) await chatSocketService.callReject(id);
  }

  /**
   * One button for the user, two meanings for the server: cancelling a call
   * that is still ringing is not the same as ending one in progress.
   */
  async function hangUp(): Promise<void> {
    const id = callId.value;
    const wasRinging = status.value === 'outgoing' || status.value === 'ringing';
    const talked = durationSeconds.value;
    if (wasRinging) reset();
    else showEnd({ title: 'Cuộc gọi đã kết thúc', detail: talked ? `Thời lượng ${formatDuration(talked)}` : '', canRedial: false, failed: false });
    if (!id) return;
    await (wasRinging
      ? chatSocketService.callCancel(id)
      : chatSocketService.callEnd(id));
  }

  function toggleMute(): void {
    isMuted.value = !isMuted.value;
    webRtcCallService.setMuted(isMuted.value);
  }

  /** Close the end screen now. */
  function dismissEnded(): void {
    if (status.value === 'ended') reset();
  }

  // ------------------------------------------------------------------ teardown

  function failCall(title: string): void {
    const id = callId.value;
    showEnd({ title, detail: 'Mạng của một trong hai bên đang chặn cuộc gọi. Hãy thử lại hoặc nhắn tin.', canRedial: true, failed: true });
    if (id) void chatSocketService.callEnd(id);
  }

  /** Stop the call and show how it ended; the screen closes by itself. */
  function showEnd(info: CallEndInfo): void {
    stopMedia();
    callId.value = null;
    endInfo.value = info;
    status.value = 'ended';
    if (info.failed) callTones.failed();
    else callTones.ended();
    if (endTimer) clearTimeout(endTimer);
    endTimer = setTimeout(reset, info.canRedial ? END_SCREEN_REDIAL_MS : END_SCREEN_MS);
  }

  function clearEndScreen(): void {
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
    endInfo.value = null;
    if (status.value === 'ended') status.value = 'idle';
  }

  function startConnectTimeout(): void {
    clearConnectTimeout();
    connectTimer = setTimeout(() => {
      if (status.value === 'connecting') failCall('Không kết nối được');
    }, CONNECT_TIMEOUT_MS);
  }

  function clearConnectTimeout(): void {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
  }

  function startTimer(): void {
    stopTimer();
    durationSeconds.value = 0;
    durationTimer = setInterval(() => {
      durationSeconds.value += 1;
    }, 1000);
  }

  function stopTimer(): void {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  }

  /** Microphone, audio, tones and timers off. */
  function stopMedia(): void {
    stopTimer();
    clearConnectTimeout();
    callTones.stop();
    webRtcCallService.stop();
    isMuted.value = false;
    remoteStream.value = null;
  }

  /** Back to idle, microphone released. Every exit path ends here. */
  function reset(): void {
    stopMedia();
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
    status.value = 'idle';
    callId.value = null;
    conversationId.value = null;
    role.value = null;
    endInfo.value = null;
    durationSeconds.value = 0;
  }

  return {
    status,
    callId,
    conversationId,
    role,
    isMuted,
    durationSeconds,
    remoteStream,
    endInfo,
    isActive,
    isBusy,
    isInCall,
    peer,
    peerName,
    peerRoleLabel,
    durationLabel,
    statusLabel,
    initCallSignalling,
    startCall,
    redial,
    acceptCall,
    declineCall,
    hangUp,
    dismissEnded,
    toggleMute,
  };
});
