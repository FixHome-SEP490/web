// src/api/geo.api.ts
import apiClient from './client';
import type { ApiResponse } from './orders.api';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export const geoApi = {
  async autocomplete(input: string): Promise<PlaceSuggestion[]> {
    if (!input.trim()) return [];
    const res = await apiClient.get<ApiResponse<PlaceSuggestion[]>>('/geo/autocomplete', { params: { input } });
    return res.data?.data || [];
  },

  async geocode(placeId: string): Promise<PlaceLocation> {
    const res = await apiClient.get<ApiResponse<PlaceLocation>>('/geo/geocode', { params: { placeId } });
    return res.data.data as PlaceLocation;
  },

  async reverse(lat: number, lng: number): Promise<PlaceLocation> {
    const res = await apiClient.get<ApiResponse<PlaceLocation>>('/geo/reverse', { params: { lat, lng } });
    return res.data.data as PlaceLocation;
  },
};
