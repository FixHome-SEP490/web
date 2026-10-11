import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBestPosition, PositionUnavailableError } from '../src/utils/best-position';

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

/** A geolocation double: the test pushes fixes or errors into the running watch. */
function fakeGeolocation() {
  let onFix: Success | null = null;
  let onError: Failure | null = null;
  let quickFix: Success | null = null;
  const geo = {
    watchPosition: vi.fn((success: Success, error?: Failure | null) => {
      onFix = success;
      onError = error ?? null;
      return 7;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn((success: Success) => {
      quickFix = success;
    }),
  };
  const fix = (accuracy: number, lat = 10.77, lng = 106.7) =>
    onFix?.({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition);
  const quick = (accuracy: number) =>
    quickFix?.({ coords: { latitude: 10.5, longitude: 106.5, accuracy } } as GeolocationPosition);
  const fail = (code: number) => onError?.({ code } as GeolocationPositionError);
  return { geo: geo as unknown as Geolocation, raw: geo, fix, quick, fail };
}

describe('getBestPosition (check-in GPS, PO 11/10/2026)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('watches with high accuracy, no cached fix and a 15 s timeout', async () => {
    const g = fakeGeolocation();
    const pending = getBestPosition({ geolocation: g.geo });
    expect(g.raw.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
    g.fix(20);
    await expect(pending).resolves.toEqual({ lat: 10.77, lng: 106.7, accuracyMeters: 20 });
  });

  it('resolves early as soon as a fix is within 100 m and stops watching', async () => {
    const g = fakeGeolocation();
    const pending = getBestPosition({ geolocation: g.geo });
    g.fix(500);
    expect(g.raw.clearWatch).not.toHaveBeenCalled();
    g.fix(100, 10.8, 106.8);
    await expect(pending).resolves.toEqual({ lat: 10.8, lng: 106.8, accuracyMeters: 100 });
    expect(g.raw.clearWatch).toHaveBeenCalledWith(7);
    // Later fixes change nothing.
    g.fix(5);
    expect(g.raw.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('uses the most accurate fix after about 12 s when none is within 100 m, any accuracy allowed', async () => {
    const g = fakeGeolocation();
    let settled = false;
    const pending = getBestPosition({ geolocation: g.geo }).finally(() => { settled = true; });
    g.fix(4200, 1, 1);
    g.fix(900, 2, 2);
    g.fix(2500, 3, 3);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ lat: 2, lng: 2, accuracyMeters: 900 });
    expect(g.raw.clearWatch).toHaveBeenCalledWith(7);
  });

  it('also counts the quick network fix requested in parallel', async () => {
    const g = fakeGeolocation();
    const pending = getBestPosition({ geolocation: g.geo });
    expect(g.raw.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: false, maximumAge: 0 }));
    g.fix(3000);
    g.quick(1500);
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toEqual({ lat: 10.5, lng: 106.5, accuracyMeters: 1500 });
  });

  it('rejects when no fix arrives at all, and still clears the watch', async () => {
    const g = fakeGeolocation();
    const pending = getBestPosition({ geolocation: g.geo });
    const outcome = expect(pending).rejects.toBeInstanceOf(PositionUnavailableError);
    g.fail(2); // POSITION_UNAVAILABLE: may recover, keeps waiting
    await vi.advanceTimersByTimeAsync(12_000);
    await outcome;
    expect(g.raw.clearWatch).toHaveBeenCalledWith(7);
  });

  it('rejects at once when the location permission is blocked', async () => {
    const g = fakeGeolocation();
    const pending = getBestPosition({ geolocation: g.geo });
    g.fail(1);
    await expect(pending).rejects.toMatchObject({ kind: 'denied' });
    expect(g.raw.clearWatch).toHaveBeenCalledWith(7);
  });

  it('skips fixes without a real accuracy', async () => {
    const g = fakeGeolocation();
    const pending = getBestPosition({ geolocation: g.geo });
    const outcome = expect(pending).rejects.toBeInstanceOf(PositionUnavailableError);
    g.fix(Number.NaN);
    await vi.advanceTimersByTimeAsync(12_000);
    await outcome;
  });

  it('rejects when the browser has no geolocation', async () => {
    await expect(getBestPosition({ geolocation: null })).rejects.toMatchObject({ kind: 'unsupported' });
  });
});
