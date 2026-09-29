import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { WebRtcCallService, CallMediaError } from '../src/services/webrtc-call.service';

/**
 * happy-dom has no WebRTC, so the browser side is stubbed. That is the point:
 * what is being checked here is our own bookkeeping — that candidates arriving
 * too early are not thrown away, and that the microphone is always handed back.
 */

interface FakeTrack {
  kind: string;
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
}

function makeTrack(): FakeTrack {
  return { kind: 'audio', enabled: true, stop: vi.fn() };
}

function makeStream(tracks: FakeTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  } as unknown as MediaStream;
}

class FakePeerConnection {
  static last: FakePeerConnection | null = null;

  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = 'new';

  addedTracks: unknown[] = [];
  addedCandidates: unknown[] = [];
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  closed = false;

  constructor(readonly config: RTCConfiguration) {
    FakePeerConnection.last = this;
  }

  addTrack(track: unknown) {
    this.addedTracks.push(track);
  }
  async createOffer() {
    return { type: 'offer', sdp: 'offer-sdp' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer-sdp' };
  }
  async setLocalDescription(description: unknown) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: unknown) {
    this.remoteDescription = description;
  }
  async addIceCandidate(candidate: unknown) {
    this.addedCandidates.push(candidate);
  }
  close() {
    this.closed = true;
  }
}

const OFFER = { type: 'offer', sdp: 'remote-offer' } as RTCSessionDescriptionInit;
const ANSWER = { type: 'answer', sdp: 'remote-answer' } as RTCSessionDescriptionInit;

describe('WebRtcCallService', () => {
  let service: WebRtcCallService;
  let tracks: FakeTrack[];
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new WebRtcCallService();
    tracks = [makeTrack()];
    FakePeerConnection.last = null;

    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    // The real constructors only wrap the plain object; passing it through
    // keeps the assertions readable.
    vi.stubGlobal('RTCSessionDescription', class {
      constructor(init: unknown) {
        Object.assign(this, init);
      }
    });
    vi.stubGlobal('RTCIceCandidate', class {
      constructor(init: unknown) {
        Object.assign(this, init);
      }
    });

    getUserMedia = vi.fn().mockResolvedValue(makeStream(tracks));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the microphone', () => {
    it('asks for audio only, never the camera', async () => {
      await service.acquireMicrophone();

      expect(getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: false }),
      );
    });

    it('reuses the stream it already holds', async () => {
      await service.acquireMicrophone();
      await service.acquireMicrophone();

      expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('names the HTTPS problem when the browser hides mediaDevices', async () => {
      vi.stubGlobal('navigator', {});

      await expect(service.acquireMicrophone()).rejects.toMatchObject({
        kind: 'insecure-context',
      });
    });

    it('tells a refused permission apart from a missing device', async () => {
      getUserMedia.mockRejectedValue(
        Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
      );
      await expect(service.acquireMicrophone()).rejects.toMatchObject({
        kind: 'permission-denied',
      });

      const second = new WebRtcCallService();
      getUserMedia.mockRejectedValue(
        Object.assign(new Error('none'), { name: 'NotFoundError' }),
      );
      await expect(second.acquireMicrophone()).rejects.toMatchObject({
        kind: 'no-microphone',
      });
    });
  });

  describe('opening the connection', () => {
    it('refuses to open before the microphone is ready', () => {
      expect(() => service.open([], {})).toThrow(CallMediaError);
    });

    it('passes the ICE configuration through and publishes the local audio', async () => {
      const iceServers = [{ urls: ['stun:example.test:3478'] }];
      await service.acquireMicrophone();

      service.open(iceServers, {});

      expect(FakePeerConnection.last!.config.iceServers).toEqual(iceServers);
      expect(FakePeerConnection.last!.addedTracks).toHaveLength(1);
    });

    it('works with an empty ICE list, which is the plain Wi-Fi case', async () => {
      await service.acquireMicrophone();

      service.open([], {});

      expect(FakePeerConnection.last!.config.iceServers).toEqual([]);
    });

    it('reports the remote audio and its own candidates', async () => {
      const onRemoteStream = vi.fn();
      const onIceCandidate = vi.fn();
      await service.acquireMicrophone();
      service.open([], { onRemoteStream, onIceCandidate });

      const remote = makeStream([makeTrack()]);
      FakePeerConnection.last!.ontrack!({ streams: [remote] });
      FakePeerConnection.last!.onicecandidate!({
        candidate: { toJSON: () => ({ candidate: 'host' }) },
      });

      expect(onRemoteStream).toHaveBeenCalledWith(remote);
      expect(onIceCandidate).toHaveBeenCalledWith({ candidate: 'host' });
    });

    it('does not forward the end-of-gathering marker as a candidate', async () => {
      const onIceCandidate = vi.fn();
      await service.acquireMicrophone();
      service.open([], { onIceCandidate });

      FakePeerConnection.last!.onicecandidate!({ candidate: null });

      expect(onIceCandidate).not.toHaveBeenCalled();
    });
  });

  describe('the handshake', () => {
    beforeEach(async () => {
      await service.acquireMicrophone();
      service.open([], {});
    });

    it('creates an offer and keeps it as the local description', async () => {
      const offer = await service.createOffer();

      expect(offer).toMatchObject({ type: 'offer' });
      expect(FakePeerConnection.last!.localDescription).toMatchObject({
        type: 'offer',
      });
    });

    it('answers an offer', async () => {
      const answer = await service.acceptOffer(OFFER);

      expect(answer).toMatchObject({ type: 'answer' });
      expect(FakePeerConnection.last!.remoteDescription).toMatchObject({
        sdp: 'remote-offer',
      });
    });

    it('holds candidates that arrive before the remote description', async () => {
      await service.addIceCandidate({ candidate: 'early-1' });
      await service.addIceCandidate({ candidate: 'early-2' });
      expect(FakePeerConnection.last!.addedCandidates).toHaveLength(0);

      await service.acceptAnswer(ANSWER);

      expect(FakePeerConnection.last!.addedCandidates).toHaveLength(2);
    });

    it('applies later candidates immediately', async () => {
      await service.acceptAnswer(ANSWER);

      await service.addIceCandidate({ candidate: 'late' });

      expect(FakePeerConnection.last!.addedCandidates).toHaveLength(1);
    });

    it('survives a candidate the browser rejects', async () => {
      await service.acceptAnswer(ANSWER);
      FakePeerConnection.last!.addIceCandidate = vi
        .fn()
        .mockRejectedValue(new Error('bad candidate'));

      await expect(
        service.addIceCandidate({ candidate: 'broken' }),
      ).resolves.toBeUndefined();
    });

    it('ignores candidates once the call is over', async () => {
      service.stop();

      await expect(
        service.addIceCandidate({ candidate: 'orphan' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('muting and ending', () => {
    beforeEach(async () => {
      await service.acquireMicrophone();
      service.open([], {});
    });

    it('mutes by disabling the track, not by dropping it', () => {
      service.setMuted(true);
      expect(tracks[0].enabled).toBe(false);
      expect(tracks[0].stop).not.toHaveBeenCalled();

      service.setMuted(false);
      expect(tracks[0].enabled).toBe(true);
    });

    it('closes the connection but keeps the microphone on close()', () => {
      service.close();

      expect(FakePeerConnection.last!.closed).toBe(true);
      expect(tracks[0].stop).not.toHaveBeenCalled();
      expect(service.hasActiveConnection).toBe(false);
    });

    it('hands the microphone back on stop(), which turns the indicator off', () => {
      service.stop();

      expect(FakePeerConnection.last!.closed).toBe(true);
      expect(tracks[0].stop).toHaveBeenCalled();
      expect(service.hasActiveConnection).toBe(false);
    });

    it('can be stopped twice without complaining', () => {
      service.stop();
      expect(() => service.stop()).not.toThrow();
    });

    it('refuses to build an offer after the call ended', async () => {
      service.stop();

      await expect(service.createOffer()).rejects.toBeInstanceOf(CallMediaError);
    });
  });
});
