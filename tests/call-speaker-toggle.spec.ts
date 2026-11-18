import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';

// PO 18/11/2026: a computer has one speaker, so the web call screen has no
// "Loa to" / "Loa nhỏ" switch and plays the other voice at the normal volume.
// The switch lives on the mobile app only.
const store = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('../src/stores/call.store', () => ({ useCallStore: () => store.current }));

import CallOverlay from '../src/components/chat/CallOverlay.vue';

function callStore(status: string) {
  return reactive({
    status,
    isActive: status !== 'idle',
    isInCall: status === 'connected',
    isMuted: false,
    remoteStream: null,
    peer: { role: 'technician' },
    peerName: 'Thợ Hai',
    peerRoleLabel: 'Kỹ thuật viên',
    statusLabel: 'Đang nói chuyện',
    endInfo: null,
    acceptCall: vi.fn(), declineCall: vi.fn(), dismissEnded: vi.fn(), hangUp: vi.fn(), redial: vi.fn(), toggleMute: vi.fn(),
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('web call screen speaker', () => {
  it('has no loud/quiet switch and keeps the normal volume during a call', async () => {
    store.current = callStore('connected');
    const wrapper = mount(CallOverlay, { attachTo: document.body });
    await flushPromises();
    expect(document.querySelector('[data-testid="call-speaker-toggle"]')).toBeNull();
    expect(document.querySelector('[data-testid="call-speaker-label"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Loa to');
    expect(document.body.textContent).not.toContain('Loa nhỏ');
    expect((document.querySelector('audio') as HTMLAudioElement).volume).toBe(1);
    // Mute and hang up are still there.
    expect(document.querySelector('[aria-label="Tắt micro"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Kết thúc cuộc gọi"]')).not.toBeNull();
    wrapper.unmount();
  });
});
