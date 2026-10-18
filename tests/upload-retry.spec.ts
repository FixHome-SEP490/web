import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadCancelledError, isRetryable, uploadWithRetry } from '../src/lib/upload-retry';

// PO 18/10/2026: weak connections. An upload is abandoned only when nothing has
// moved for a while, then sent again with growing pauses, after the browser is
// back online; a refusal from the server is final.
const network = () => Object.assign(new Error('Network Error'), { response: undefined });
const status = (code: number) => ({ response: { status: code } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('isRetryable', () => {
  it('sends again after the network, a stall, a timeout or a busy server, never after a refusal', () => {
    expect(isRetryable(network())).toBe(true);
    for (const code of [408, 429, 500, 502, 503]) expect(isRetryable(status(code))).toBe(true);
    for (const code of [400, 401, 403, 404, 413, 422]) expect(isRetryable(status(code))).toBe(false);
  });
});

describe('uploadWithRetry', () => {
  it('tries again after a network failure with a pause, reporting each new attempt', async () => {
    const send = vi.fn().mockRejectedValueOnce(network()).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const result = uploadWithRetry(send, { onRetry, pausesMs: [2000] });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('gives up after the last attempt with the last error, and at once on a refusal', async () => {
    const send = vi.fn().mockRejectedValue(network());
    const result = uploadWithRetry(send, { attempts: 3, pausesMs: [10, 10] });
    const caught = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await caught).toMatchObject({ message: 'Network Error' });
    expect(send).toHaveBeenCalledTimes(3);

    const refused = vi.fn().mockRejectedValue(status(413));
    await expect(uploadWithRetry(refused, { pausesMs: [10] })).rejects.toEqual(status(413));
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('abandons an attempt where nothing moves for the stall time, but not a slow one that keeps moving', async () => {
    const signals: AbortSignal[] = [];
    const send = vi.fn(({ onProgress, signal }: { onProgress: (n: number) => void; signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise((resolve, reject) => {
        if (signals.length === 1) {
          // Silent: the stall timer cancels it.
          signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { response: undefined })));
        } else {
          // Slow but moving: 50 s in total, never 30 s without progress.
          let sent = 0;
          const tick = setInterval(() => {
            sent += 0.2;
            onProgress(sent);
            if (sent >= 1) { clearInterval(tick); resolve('done'); }
          }, 10_000);
        }
      });
    });
    const progress = vi.fn();
    const result = uploadWithRetry(send, { stallMs: 30_000, pausesMs: [1000], onProgress: progress });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000 + 50_000);
    await expect(result).resolves.toBe('done');
    expect(signals[1].aborted).toBe(false);
    expect(progress).toHaveBeenLastCalledWith(expect.closeTo(1, 5));
  });

  // Review 18/10/2026: after the last byte the server is still storing the file; resending it then wastes everything.
  it('does not treat the wait for the answer after the last byte as a stall', async () => {
    let signal!: AbortSignal;
    let answer!: (value: string) => void;
    const send = vi.fn((attempt: { onProgress: (n: number) => void; signal: AbortSignal }) => {
      signal = attempt.signal;
      attempt.onProgress(1);
      return new Promise<string>((resolve) => { answer = resolve; });
    });
    const result = uploadWithRetry(send, { stallMs: 30_000, responseMs: 120_000 });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(signal.aborted).toBe(false);
    answer('stored');
    await expect(result).resolves.toBe('stored');
    expect(send).toHaveBeenCalledTimes(1);

    // An answer that never comes is still given up on, later.
    const silent = vi.fn((attempt: { onProgress: (n: number) => void; signal: AbortSignal }) => {
      attempt.onProgress(1);
      return new Promise((_resolve, reject) => attempt.signal.addEventListener('abort', () => reject(network())));
    });
    const gaveUp = uploadWithRetry(silent, { stallMs: 30_000, responseMs: 120_000, attempts: 1 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await gaveUp).toMatchObject({ message: 'Network Error' });
  });

  it('waits for the browser to be back online before trying again', async () => {
    let online = false;
    vi.stubGlobal('navigator', { get onLine() { return online; } });
    const send = vi.fn().mockRejectedValueOnce(network()).mockResolvedValueOnce('ok');
    const result = uploadWithRetry(send, { pausesMs: [0] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops for good when the customer removes the file, even during the pause', async () => {
    const controller = new AbortController();
    const send = vi.fn().mockRejectedValue(network());
    const result = uploadWithRetry(send, { signal: controller.signal, pausesMs: [5000] });
    const caught = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    expect(await caught).toBeInstanceOf(UploadCancelledError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(uploadWithRetry(send, { signal: controller.signal })).rejects.toBeInstanceOf(UploadCancelledError);
  });
});
