import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';

// PO 18/10/2026: a button switches the call between "Loa to" and "Loa nhỏ".
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

describe('call speaker switch', () => {
  it('starts loud and switches the other voice between loud and quiet', async () => {
    store.current = callStore('connected');
    const wrapper = mount(CallOverlay, { attachTo: document.body });
    await flushPromises();
    const audio = document.querySelector('audio') as HTMLAudioElement;
    const toggle = () => document.querySelector('[data-testid="call-speaker-toggle"]') as HTMLButtonElement;
    const label = () => document.querySelector('[data-testid="call-speaker-label"]')?.textContent?.trim();

    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(label()).toBe('Loa to');
    toggle().click();
    await flushPromises();
    expect(audio.volume).toBeCloseTo(0.35);
    expect(label()).toBe('Loa nhỏ');
    expect(toggle().getAttribute('aria-label')).toContain('loa nhỏ');
    toggle().click();
    await flushPromises();
    expect(audio.volume).toBe(1);
    expect(label()).toBe('Loa to');
    wrapper.unmount();
  });

  it('comes back loud for the next call', async () => {
    const s = callStore('connected');
    store.current = s;
    const wrapper = mount(CallOverlay, { attachTo: document.body });
    (document.querySelector('[data-testid="call-speaker-toggle"]') as HTMLButtonElement).click();
    await flushPromises();
    s.status = 'idle';
    s.isActive = false;
    await flushPromises();
    s.status = 'outgoing';
    s.isActive = true;
    await flushPromises();
    expect(document.querySelector('[data-testid="call-speaker-label"]')?.textContent?.trim()).toBe('Loa to');
    expect((document.querySelector('audio') as HTMLAudioElement).volume).toBe(1);
    wrapper.unmount();
  });

  it('is not offered on an incoming call before it is answered', async () => {
    store.current = callStore('incoming');
    const wrapper = mount(CallOverlay, { attachTo: document.body });
    await flushPromises();
    expect(document.querySelector('[data-testid="call-speaker-toggle"]')).toBeNull();
    wrapper.unmount();
  });
});
