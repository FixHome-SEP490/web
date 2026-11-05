import { warrantyClaimsApi, type StaffWarrantyClaim } from '../api/warranty-claims.api';

/** The technician's position for a check-in; without permission or a fix the server still accepts it. */
function currentPosition(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve({}),
      { timeout: 5000 },
    );
  });
}

export async function checkInClaim(claim: StaffWarrantyClaim): Promise<StaffWarrantyClaim> {
  return warrantyClaimsApi.checkIn(claim.id, await currentPosition());
}
