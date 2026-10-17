import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A socket the server turned away (expired token after a restart or a sleep)
 * must come back on its own with a fresh token; otherwise the page silently
 * stops receiving calls and messages until it is reloaded.
 */

const { fakeSocket, ioMock, apiGet } = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const fakeSocket = {
    connected: false,
    listeners,
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, fn);
      return fakeSocket;
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    fire(event: string, ...args: unknown[]) {
      listeners.get(event)?.(...args);
    },
  };
  return { fakeSocket, ioMock: vi.fn(() => fakeSocket), apiGet: vi.fn(async () => ({ data: {} })) };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('../src/api/client', () => ({ default: { get: apiGet } }));

import { chatSocketService } from '../src/services/chat-socket.service';

type AuthCallback = (cb: (data: { token: string }) => void) => void;

describe('chat socket keeps itself connected', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('access_token', 'old-token');
    localStorage.setItem('refresh_token', 'refresh');
    fakeSocket.connected = false;
    fakeSocket.connect.mockClear();
    apiGet.mockClear();
    chatSocketService.disconnect();
    void chatSocketService.connect('old-token');
  });

  afterEach(() => {
    chatSocketService.disconnect();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('presents the newest stored token on every reconnect, not the one it started with', () => {
    const options = ioMock.mock.calls.at(-1)![1] as { auth: AuthCallback };
    localStorage.setItem('access_token', 'fresh-token');
    let sent = '';
    options.auth((data) => {
      sent = data.token;
    });
    expect(sent).toBe('fresh-token');
  });

  it('refreshes the session and reconnects after the server turns it away', async () => {
    fakeSocket.fire('connect:error', { message: 'Unauthorized' });
    await vi.advanceTimersByTimeAsync(600);

    expect(apiGet).toHaveBeenCalledWith('/me');
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('also comes back when the server hangs up on it', async () => {
    fakeSocket.fire('disconnect', 'io server disconnect');
    await vi.advanceTimersByTimeAsync(600);
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('leaves an ordinary network drop to Socket.IO\'s own retry', async () => {
    fakeSocket.fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiGet).not.toHaveBeenCalled();
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('gives up after a few tries instead of hammering the server', async () => {
    for (let i = 0; i < 8; i++) {
      fakeSocket.fire('connect:error', { message: 'Unauthorized' });
      await vi.advanceTimersByTimeAsync(25_000);
    }
    expect(fakeSocket.connect).toHaveBeenCalledTimes(5);
  });

  it('does not try once the user is signed out', async () => {
    localStorage.removeItem('refresh_token');
    fakeSocket.fire('connect:error', { message: 'Unauthorized' });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('reconnects when the browser comes back online', () => {
    window.dispatchEvent(new Event('online'));
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });
});
