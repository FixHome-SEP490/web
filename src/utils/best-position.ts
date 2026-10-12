/**
 * One position for a GPS check-in. Chrome's single `getCurrentPosition` often fails or returns
 * late (PO 11/10/2026), so this watches the position for a short while and keeps the most
 * accurate fix. Any accuracy is accepted here; the server decides (5 km at the time of writing).
 */
export interface BestPosition {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export type PositionErrorKind = 'unsupported' | 'denied' | 'unavailable';

export class PositionUnavailableError extends Error {
  readonly kind: PositionErrorKind;
  constructor(kind: PositionErrorKind) {
    super('Không lấy được vị trí. Hãy cho phép trình duyệt dùng vị trí rồi thử lại.');
    this.name = 'PositionUnavailableError';
    this.kind = kind;
  }
}

export interface BestPositionOptions {
  /** A fix at least this accurate ends the wait at once. */
  goodEnoughMeters?: number;
  /** After this long the best fix so far is used. */
  maxWaitMs?: number;
  geolocation?: Geolocation | null;
}

const PERMISSION_DENIED = 1;

export function getBestPosition(options: BestPositionOptions = {}): Promise<BestPosition> {
  const goodEnough = options.goodEnoughMeters ?? 100;
  const maxWait = options.maxWaitMs ?? 12_000;
  const geo =
    options.geolocation !== undefined
      ? options.geolocation
      : typeof navigator !== 'undefined'
        ? navigator.geolocation ?? null
        : null;

  return new Promise<BestPosition>((resolve, reject) => {
    if (!geo || typeof geo.watchPosition !== 'function') {
      reject(new PositionUnavailableError('unsupported'));
      return;
    }

    let best: BestPosition | null = null;
    let settled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (error?: PositionUnavailableError) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (watchId !== null) geo.clearWatch(watchId);
      if (error) reject(error);
      else if (best) resolve(best);
      else reject(new PositionUnavailableError('unavailable'));
    };

    const consider = (position: GeolocationPosition) => {
      if (settled) return;
      const { latitude, longitude, accuracy } = position.coords;
      // A fix without a real accuracy cannot be judged by the server, so it is skipped.
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || accuracy < 0) return;
      if (!best || accuracy < best.accuracyMeters) best = { lat: latitude, lng: longitude, accuracyMeters: accuracy };
      if (best.accuracyMeters <= goodEnough) finish();
    };

    const onError = (error: GeolocationPositionError) => {
      // A blocked permission will not change while we wait; anything else may still recover.
      if (error?.code === PERMISSION_DENIED) finish(new PositionUnavailableError('denied'));
    };

    timer = setTimeout(() => finish(), maxWait);
    const id = geo.watchPosition(consider, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    watchId = typeof id === 'number' ? id : null;
    // The watch may already have settled synchronously (a test double, or a cached fix).
    if (settled && watchId !== null) geo.clearWatch(watchId);
    if (!settled && typeof geo.getCurrentPosition === 'function') {
      // A quick network fix in parallel: phones indoors can take long for the first GPS fix.
      geo.getCurrentPosition(consider, onError, { enableHighAccuracy: false, maximumAge: 0, timeout: maxWait });
    }
  });
}
