import { beforeEach, describe, expect, it, vi } from 'vitest';

// PO 12/10/2026: typing a place must find it near the user, not in another province.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get } }));
import { geoApi } from '../src/api/geo.api';

describe('geoApi.autocomplete', () => {
  beforeEach(() => get.mockReset().mockResolvedValue({ data: { data: [{ placeId: 'osm:W1', description: 'Nhà Văn Hóa Sinh Viên', lat: 10.88, lng: 106.78 }] } }));

  it('sends the point to search around when there is one', async () => {
    const res = await geoApi.autocomplete('nhà văn hóa sinh viên', { lat: 10.7745, lng: 106.701 });
    expect(get).toHaveBeenCalledWith('/geo/autocomplete', { params: { input: 'nhà văn hóa sinh viên', lat: 10.7745, lng: 106.701 } });
    expect(res[0].description).toBe('Nhà Văn Hóa Sinh Viên');
  });

  it('leaves the point to the server when there is none or it is not a number', async () => {
    await geoApi.autocomplete('quận 1');
    await geoApi.autocomplete('quận 1', { lat: Number.NaN, lng: 106.7 });
    expect(get.mock.calls.map(([, opts]) => opts)).toEqual([{ params: { input: 'quận 1' } }, { params: { input: 'quận 1' } }]);
  });

  it('asks nothing for an empty input', async () => {
    expect(await geoApi.autocomplete('   ')).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
});
