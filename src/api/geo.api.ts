// src/api/geo.api.ts
import apiClient from './client';
import type { ApiResponse } from './orders.api';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
  ward?: string;
  district?: string;
  province?: string;
}

export interface PlaceLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  ward?: string;
  district?: string;
  province?: string;
}

export const geoApi = {
  /** `near` puts places around that point first (the server defaults to TP Hồ Chí Minh). */
  async autocomplete(input: string, near?: { lat: number; lng: number } | null): Promise<PlaceSuggestion[]> {
    if (!input.trim()) return [];
    const params = near && Number.isFinite(near.lat) && Number.isFinite(near.lng) ? { input, lat: near.lat, lng: near.lng } : { input };
    const res = await apiClient.get<ApiResponse<PlaceSuggestion[]>>('/geo/autocomplete', { params });
    return res.data?.data || [];
  },

  async reverse(lat: number, lng: number): Promise<PlaceLocation> {
    const res = await apiClient.get<ApiResponse<PlaceLocation>>('/geo/reverse', { params: { lat, lng } });
    return res.data.data as PlaceLocation;
  },
};
