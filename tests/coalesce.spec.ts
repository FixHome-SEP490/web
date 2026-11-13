import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesce } from '../src/utils/coalesce';

/** The layout and the socket ask for the same list when a page opens: one request, never a stale answer. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('coalesce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('serves calls made together with one request', async () => {
    const answer = deferred<number>();
    const run = vi.fn(() => answer.promise);
    const read = coalesce(run);
    const first = read();
    const second = read();
    expect(run).toHaveBeenCalledTimes(1);
    answer.resolve(7);
    await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
  });

  it('gives a call made while the request is running one fresh request after it, shared by later calls', async () => {
    const answers = [deferred<number>(), deferred<number>()];
    let n = 0;
    const run = vi.fn(() => answers[n++].promise);
    const read = coalesce(run);
    const first = read();
    vi.advanceTimersByTime(1);
    const late = read();
    const later = read();
    expect(run).toHaveBeenCalledTimes(1);
    answers[0].resolve(1);
    await expect(first).resolves.toBe(1);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    answers[1].resolve(2);
    await expect(Promise.all([late, later])).resolves.toEqual([2, 2]);
  });

  it('a failed request fails its callers and the next call asks again', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(5);
    const read = coalesce(run);
    await expect(read()).rejects.toThrow('down');
    vi.advanceTimersByTime(1);
    await expect(read()).resolves.toBe(5);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a late call after a failed request still gets its own fresh request', async () => {
    const answers = [deferred<number>(), deferred<number>()];
    let n = 0;
    const run = vi.fn(() => answers[n++].promise);
    const read = coalesce(run);
    const first = read();
    vi.advanceTimersByTime(1);
    const late = read();
    answers[0].reject(new Error('down'));
    await expect(first).rejects.toThrow('down');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    answers[1].resolve(9);
    await expect(late).resolves.toBe(9);
  });
});
