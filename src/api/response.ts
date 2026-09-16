/** Existing endpoints include both raw controller results and { data } results. */
export function unwrap<T>(payload: unknown): T {
  let value = payload;
  for (let depth = 0; depth < 2; depth++) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) value = (value as { data: unknown }).data;
    else break;
  }
  return value as T;
}
