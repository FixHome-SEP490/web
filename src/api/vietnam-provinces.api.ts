// src/api/vietnam-provinces.api.ts
import apiClient from './client';

/**
 * Vietnam Administrative Divisions API Client
 * Official source: https://provinces.open-api.vn/
 *
 * Implements:
 * - v1 API: Provinces -> Districts -> Wards (supports depth=1, depth=2, depth=3)
 * - v2 API: 2025 Administrative Divisions (Provinces -> Wards) per openapi.json
 */

export type VietNamDivisionType =
  | 'tỉnh'
  | 'thành phố trung ương'
  | 'quận'
  | 'huyện'
  | 'thị xã'
  | 'thành phố'
  | 'phường'
  | 'xã'
  | 'thị trấn'
  | 'đặc khu';

export interface Ward {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  district_code?: number;
  province_code?: number;
}

export interface District {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  province_code: number;
  wards?: Ward[];
}

export interface Province {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  phone_code: number;
  districts?: District[];
  wards?: Ward[];
}

const V1_BASE_URL = 'https://provinces.open-api.vn/api/v1';
const V2_BASE_URL = 'https://provinces.open-api.vn/api/v2';
const CACHE_KEY_V1_DEPTH2 = 'fixhome_vn_provinces_depth2_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let inMemoryProvincesWithDistricts: Province[] | null = null;

export const vietnamProvincesApi = {
  /**
   * Fetches all 63 provinces of Vietnam along with their districts (depth=2).
   * Fully cached in-memory and in sessionStorage for near-instant rendering.
   */
  async getProvincesWithDistricts(): Promise<Province[]> {
    if (inMemoryProvincesWithDistricts && inMemoryProvincesWithDistricts.length > 0) {
      return inMemoryProvincesWithDistricts;
    }

    // Try reading from sessionStorage
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(CACHE_KEY_V1_DEPTH2);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.timestamp && Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed?.data)) {
            inMemoryProvincesWithDistricts = parsed.data;
            return parsed.data;
          }
        }
      }
    } catch {
      // Ignore cache storage errors
    }

    try {
      const response = await fetch(`${V1_BASE_URL}/?depth=2`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} when fetching provinces`);
      }

      const data: Province[] = await response.json();
      inMemoryProvincesWithDistricts = data;

      // Save to sessionStorage
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(
            CACHE_KEY_V1_DEPTH2,
            JSON.stringify({ timestamp: Date.now(), data }),
          );
        }
      } catch {
        // Storage might be full, safe to ignore
      }

      return data;
    } catch (err) {
      console.warn('Direct fetch from provinces.open-api.vn failed, trying backend proxy:', err);
      try {
        const fallbackRes = await apiClient.get<{ data: Province[] }>('/geo/provinces', {
          params: { depth: 2 },
        });
        if (Array.isArray(fallbackRes.data?.data) && fallbackRes.data.data.length > 0) {
          inMemoryProvincesWithDistricts = fallbackRes.data.data;
          return fallbackRes.data.data;
        }
      } catch (proxyErr) {
        console.warn('Backend proxy fetch for provinces also failed:', proxyErr);
      }

      if (inMemoryProvincesWithDistricts) {
        return inMemoryProvincesWithDistricts;
      }
      throw err;
    }
  },

  /**
   * Fetches list of provinces (default depth=1).
   */
  async getProvinces(depth: 1 | 2 = 1): Promise<Province[]> {
    if (depth === 2) {
      return this.getProvincesWithDistricts();
    }
    const res = await fetch(`${V1_BASE_URL}/p/?depth=${depth}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  /**
   * Fetches a single province by code, optionally with districts (depth=2).
   */
  async getProvince(code: number | string, depth: 1 | 2 = 1): Promise<Province> {
    const res = await fetch(`${V1_BASE_URL}/p/${code}?depth=${depth}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  /**
   * Fetches all districts (depth=1).
   */
  async getDistricts(): Promise<District[]> {
    const res = await fetch(`${V1_BASE_URL}/d/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  /**
   * Fetches a single district by code, optionally with wards (depth=2).
   */
  async getDistrict(code: number | string, depth: 1 | 2 = 1): Promise<District> {
    const res = await fetch(`${V1_BASE_URL}/d/${code}?depth=${depth}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  /**
   * Fetches wards list or single ward by code.
   */
  async getWards(): Promise<Ward[]> {
    const res = await fetch(`${V1_BASE_URL}/w/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async getWard(code: number | string): Promise<Ward> {
    const res = await fetch(`${V1_BASE_URL}/w/${code}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // ──────────────────────────────────────────────────────────────────────────
  // v2 API (2025 Administrative Divisions per openapi.json)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fetches all divisions from v2 API (depth=1 or depth=2).
   */
  async getV2AllDivisions(depth: 1 | 2 = 1): Promise<Province[]> {
    const res = await fetch(`${V2_BASE_URL}/?depth=${depth}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async getV2Provinces(): Promise<Province[]> {
    const res = await fetch(`${V2_BASE_URL}/p/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async getV2Province(code: number | string): Promise<Province> {
    const res = await fetch(`${V2_BASE_URL}/p/${code}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async getV2Wards(): Promise<Ward[]> {
    const res = await fetch(`${V2_BASE_URL}/w/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async getV2Ward(code: number | string): Promise<Ward> {
    const res = await fetch(`${V2_BASE_URL}/w/${code}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};
