// src/services/webrtc-call.service.ts

/**
 * The audio half of a voice call: the microphone, the peer connection, and the
 * three handshake messages that get the two browsers talking directly.
 *
 * Nothing in here knows about the server. Signalling messages are handed in and
 * handed back out, so this class can be reasoned about — and tested — without a
 * socket. What it does own is the one piece of state that must not leak between
 * calls: the microphone track. Every path out of a call runs through stop().
 */

export interface CallMediaHandlers {
  /** The other person's audio, ready to be attached to an <audio> element. */
  onRemoteStream?: (stream: MediaStream) => void;
  /** A local ICE candidate that must be sent to the other side. */
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

/** Errors worth telling the user apart, because the fix differs for each. */
export type CallMediaErrorKind =
  | 'insecure-context'
  | 'permission-denied'
  | 'no-microphone'
  | 'unknown';

export class CallMediaError extends Error {
  constructor(
    readonly kind: CallMediaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CallMediaError';
  }
}

export class WebRtcCallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private handlers: CallMediaHandlers = {};
  /**
   * Candidates can arrive before the remote description is in place, and
   * addIceCandidate throws if it does. Holding them costs nothing and losing
   * them can cost the whole connection.
   */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  get hasActiveConnection(): boolean {
    return this.pc !== null;
  }

  /**
   * Ask for the microphone before anything else happens, so a refusal shows up
   * as "we could not start the call" rather than as a call that rings and then
   * carries no sound.
   */
  async acquireMicrophone(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;

    // On an http:// origin other than localhost the browser does not expose
    // mediaDevices at all, which is the single most likely reason a call fails
    // on a second machine over the LAN.
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CallMediaError(
        'insecure-context',
        'Trình duyệt chỉ cho phép dùng micro khi trang chạy qua HTTPS hoặc localhost. Hãy mở ứng dụng bằng địa chỉ HTTPS.',
      );
    }

    try {
      // Video is never requested: this is a voice call, and asking for the
      // camera would put a recording indicator on screen for no reason.
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      return this.localStream;
    } catch (error) {
      throw new CallMediaError(
        this.classify(error),
        this.messageFor(this.classify(error)),
      );
    }
  }

  private classify(error: unknown): CallMediaErrorKind {
    const name = (error as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'permission-denied';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'no-microphone';
    }
    return 'unknown';
  }

  private messageFor(kind: CallMediaErrorKind): string {
    switch (kind) {
      case 'permission-denied':
        return 'Bạn chưa cho phép trang này dùng micro. Hãy bật quyền micro trong trình duyệt rồi gọi lại.';
      case 'no-microphone':
        return 'Không tìm thấy micro nào trên thiết bị này.';
      default:
        return 'Không mở được micro. Hãy kiểm tra thiết bị âm thanh rồi thử lại.';
    }
  }

  /**
   * Build the peer connection. The microphone must already be open, so that a
   * device problem is reported before the other person's phone starts ringing.
   */
  open(iceServers: RTCIceServer[], handlers: CallMediaHandlers): void {
    if (!this.localStream) {
      throw new CallMediaError(
        'unknown',
        'Chưa mở được micro nên không thể bắt đầu cuộc gọi.',
      );
    }
    this.close();
    this.handlers = handlers;

    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) this.handlers.onRemoteStream?.(stream);
    };

    pc.onicecandidate = (event) => {
      // A null candidate marks the end of gathering; there is nothing to send.
      if (event.candidate) {
        this.handlers.onIceCandidate?.(event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      this.handlers.onConnectionStateChange?.(pc.connectionState);
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const pc = this.require();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }

  /** The callee's side: take the offer, reply with an answer. */
  async acceptOffer(
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    const pc = this.require();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.drainPendingCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  /** The caller's side: the answer completes the handshake. */
  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.require();
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.drainPendingCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // A candidate the browser cannot use is not fatal: the connection
      // succeeds as long as one pair of candidates works.
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    this.remoteDescriptionSet = true;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      await this.addIceCandidate(candidate);
    }
  }

  /** Muting stops sending audio without tearing the connection down. */
  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  /**
   * Release everything. Stopping the tracks is what turns off the browser's
   * recording indicator, so skipping it would leave the microphone visibly
   * live after the call ended.
   */
  close(): void {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
    this.handlers = {};
  }

  /** Close the connection and hand the microphone back to the system. */
  stop(): void {
    this.close();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }

  private require(): RTCPeerConnection {
    if (!this.pc) {
      throw new CallMediaError('unknown', 'Cuộc gọi đã kết thúc.');
    }
    return this.pc;
  }
}

export const webRtcCallService = new WebRtcCallService();
