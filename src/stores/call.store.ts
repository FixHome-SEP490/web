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
import { useChatStore } from './chat.store';

/**
 * Where a call is in its life.
 *
 * "connecting" is the gap between the other side picking up and the audio
 * actually flowing. It is short on a local network but it is not nothing, and
 * showing "Đã kết nối" during it would be a lie the user can hear.
 */
export type CallStatus =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'connected';

/** What to tell the user when a call stops. */
const END_REASON_TEXT: Record<CallEndReason, string> = {
  rejected: 'Cuộc gọi bị từ chối',
  cancelled: 'Người gọi đã huỷ',
  ended: 'Cuộc gọi đã kết thúc',
  timeout: 'Không có người bắt máy',
  disconnected: 'Mất kết nối với đối phương',
  busy: 'Đối phương đang bận',
};

/** What to tell the user when the server will not place the call. */
const INVITE_REASON_TEXT: Record<string, string> = {
  busy: 'Đối phương đang có cuộc gọi khác',
  forbidden: 'Không thể gọi trong cuộc trò chuyện này',
  invalid: 'Không thể bắt đầu cuộc gọi',
};

export const useCallStore = defineStore('call', () => {
  const status = ref<CallStatus>('idle');
  const callId = ref<string | null>(null);
  const conversationId = ref<string | null>(null);
  const isMuted = ref(false);
  const durationSeconds = ref(0);
  /** Not deeply reactive: a MediaStream is a handle, not a value to diff. */
  const remoteStream = shallowRef<MediaStream | null>(null);

  let isInitialized = false;
  let durationTimer: ReturnType<typeof setInterval> | null = null;

  const isActive = computed(() => status.value !== 'idle');
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
    const role = peer.value?.role?.toUpperCase();
    if (role === 'TECHNICIAN') return 'Kỹ thuật viên';
    if (role === 'CUSTOMER') return 'Khách hàng';
    return '';
  });

  const durationLabel = computed(() => {
    const total = durationSeconds.value;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  });

  const statusLabel = computed(() => {
    switch (status.value) {
      case 'outgoing':
        return 'Đang gọi...';
      case 'incoming':
        return 'Cuộc gọi đến';
      case 'connecting':
        return 'Đang kết nối...';
      case 'connected':
        return durationLabel.value;
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

    chatSocketService.subscribe({
      onCallIncoming(event) {
        // The server allows only one live call per person, so anything arriving
        // while busy is a stale event rather than a second caller.
        if (status.value !== 'idle') return;
        callId.value = event.callId;
        conversationId.value = event.conversationId;
        status.value = 'incoming';
      },

      async onCallAccepted(event) {
        if (event.callId !== callId.value) return;
        status.value = 'connecting';
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
        // A call that was never answered does not deserve a toast on the side
        // that hung up, but every other ending is worth a word.
        toast.info(END_REASON_TEXT[event.reason] ?? 'Cuộc gọi đã kết thúc');
        reset();
      },

      onStatusChange(connected) {
        // Losing the socket means losing signalling; the media would follow.
        if (!connected && isActive.value) {
          toast.error('Mất kết nối máy chủ, cuộc gọi đã dừng');
          reset();
        }
      },
    });
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
          status.value = 'connected';
          startTimer();
        } else if (state === 'failed') {
          failCall('Không kết nối được. Hãy kiểm tra hai máy có chung mạng không.');
        }
      },
    });
  }

  // ----------------------------------------------------------------- actions

  /** Place a call in the conversation currently on screen. */
  async function startCall(targetConversationId: string): Promise<void> {
    if (status.value !== 'idle') return;

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
    status.value = 'outgoing';

    const result = await chatSocketService.callInvite(targetConversationId);
    if (!result.ok || !result.callId) {
      toast.error(
        INVITE_REASON_TEXT[result.reason ?? 'invalid'] ??
          'Không thể bắt đầu cuộc gọi',
      );
      reset();
      return;
    }
    callId.value = result.callId;
  }

  /** Pick up. The peer connection is ready before the server is told. */
  async function acceptCall(): Promise<void> {
    if (status.value !== 'incoming' || !callId.value) return;

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
    const result = await chatSocketService.callAccept(callId.value);
    if (!result.ok) {
      toast.error('Cuộc gọi không còn hiệu lực');
      reset();
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
    const wasRinging = status.value === 'outgoing';
    reset();
    if (!id) return;
    await (wasRinging
      ? chatSocketService.callCancel(id)
      : chatSocketService.callEnd(id));
  }

  function toggleMute(): void {
    isMuted.value = !isMuted.value;
    webRtcCallService.setMuted(isMuted.value);
  }

  // ------------------------------------------------------------------ teardown

  function failCall(message: string): void {
    toast.error(message);
    const id = callId.value;
    reset();
    if (id) void chatSocketService.callEnd(id);
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

  /** Back to idle, microphone released. Every exit path goes through here. */
  function reset(): void {
    stopTimer();
    webRtcCallService.stop();
    status.value = 'idle';
    callId.value = null;
    conversationId.value = null;
    isMuted.value = false;
    durationSeconds.value = 0;
    remoteStream.value = null;
  }

  return {
    status,
    callId,
    conversationId,
    isMuted,
    durationSeconds,
    remoteStream,
    isActive,
    isInCall,
    peer,
    peerName,
    peerRoleLabel,
    durationLabel,
    statusLabel,
    initCallSignalling,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
    toggleMute,
  };
});
