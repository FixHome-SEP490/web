// tests/vietnam-geo-coordinates.spec.ts
import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceKm,
  getDistrictCoordinates,
  getDistrictDistanceKm,
  evaluateDistrictsByRadius,
} from '../src/utils/vietnam-geo-coordinates';

describe('vietnam-geo-coordinates', () => {
  it('calculates accurate Haversine distance between two points', () => {
    // Distance between District 1 (10.7756, 106.7019) and District 3 (10.7844, 106.6844) ~ 2.1 km
    const dist = calculateHaversineDistanceKm(10.7756, 106.7019, 10.7844, 106.6844);
    expect(dist).toBeGreaterThan(1.5);
    expect(dist).toBeLessThan(3.0);
  });

  it('retrieves district coordinates for known major city districts', () => {
    const q1 = getDistrictCoordinates(79, 760); // District 1, TP.HCM
    expect(q1).not.toBeNull();
    expect(q1?.lat).toBeCloseTo(10.7756, 2);
    expect(q1?.lng).toBeCloseTo(106.7019, 2);

    const badinh = getDistrictCoordinates(1, 1); // Ba Dinh, Ha Noi
    expect(badinh).not.toBeNull();
    expect(badinh?.lat).toBeCloseTo(21.0341, 2);
  });

  it('calculates estimated distance from technician home to district', () => {
    const homeOrigin = { lat: 10.7756, lng: 106.7019 }; // Q1
    const distToQ3 = getDistrictDistanceKm(homeOrigin, 79, 770); // Q3
    expect(distToQ3).not.toBeNull();
    expect(distToQ3!).toBeLessThan(5);

    const distToCuChi = getDistrictDistanceKm(homeOrigin, 79, 783); // Cu Chi
    expect(distToCuChi).not.toBeNull();
    expect(distToCuChi!).toBeGreaterThan(25);
  });

  it('evaluates districts by service radius correctly', () => {
    const homeOrigin = { lat: 10.7756, lng: 106.7019 }; // Q1
    const sampleDistricts = [
      { code: 770, name: 'Quận 3' },
      { code: 783, name: 'Huyện Củ Chi' },
    ];

    const evaluated = evaluateDistrictsByRadius(homeOrigin, 79, sampleDistricts, 15);
    expect(evaluated).toHaveLength(2);

    const q3 = evaluated.find((d) => d.code === 770);
    expect(q3?.isWithinRadius).toBe(true);

    const cuchi = evaluated.find((d) => d.code === 783);
    expect(cuchi?.isWithinRadius).toBe(false);
  });
});
