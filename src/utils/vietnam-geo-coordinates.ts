// src/utils/vietnam-geo-coordinates.ts

/**
 * Geolocation & Administrative Distance Calculator for Vietnam
 * Calculates accurate geodesic distance (Haversine formula) between technician's home
 * and target districts, enabling smart radius auto-suggestion.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Haversine formula to compute distance between two coordinates in kilometers.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Centroid coordinates of all districts in key provinces & cities.
 * Key format: `${provinceCode}:${districtCode}` or matched by name.
 */
const DISTRICT_CENTROIDS: Record<string, LatLng> = {
  // ── TP. HỒ CHÍ MINH (Province code: 79) ──────────────────────────────────
  '79:760': { lat: 10.7756, lng: 106.7019 }, // Quận 1
  '79:770': { lat: 10.7844, lng: 106.6844 }, // Quận 3
  '79:773': { lat: 10.7578, lng: 106.7012 }, // Quận 4
  '79:774': { lat: 10.7540, lng: 106.6634 }, // Quận 5
  '79:775': { lat: 10.7481, lng: 106.6352 }, // Quận 6
  '79:778': { lat: 10.7340, lng: 106.7218 }, // Quận 7
  '79:776': { lat: 10.7241, lng: 106.6286 }, // Quận 8
  '79:771': { lat: 10.7679, lng: 106.6669 }, // Quận 10
  '79:772': { lat: 10.7629, lng: 106.6503 }, // Quận 11
  '79:761': { lat: 10.8672, lng: 106.6413 }, // Quận 12
  '79:765': { lat: 10.8106, lng: 106.7091 }, // Quận Bình Thạnh
  '79:764': { lat: 10.8388, lng: 106.6653 }, // Quận Gò Vấp
  '79:768': { lat: 10.7992, lng: 106.6803 }, // Quận Phú Nhuận
  '79:766': { lat: 10.8015, lng: 106.6526 }, // Quận Tân Bình
  '79:767': { lat: 10.7900, lng: 106.6280 }, // Quận Tân Phú
  '79:777': { lat: 10.7656, lng: 106.6047 }, // Quận Bình Tân
  '79:769': { lat: 10.8494, lng: 106.7716 }, // Thành phố Thủ Đức
  '79:785': { lat: 10.6874, lng: 106.5939 }, // Huyện Bình Chánh
  '79:784': { lat: 10.8842, lng: 106.5912 }, // Huyện Hóc Môn
  '79:783': { lat: 11.0067, lng: 106.5132 }, // Huyện Củ Chi
  '79:786': { lat: 10.6953, lng: 106.7297 }, // Huyện Nhà Bè
  '79:787': { lat: 10.4114, lng: 106.9546 }, // Huyện Cần Giờ

  // ── THÀNH PHỐ HÀ NỘI (Province code: 1) ──────────────────────────────────
  '1:1': { lat: 21.0341, lng: 105.8244 }, // Quận Ba Đình
  '1:2': { lat: 21.0307, lng: 105.8524 }, // Quận Hoàn Kiếm
  '1:3': { lat: 21.0716, lng: 105.8234 }, // Quận Tây Hồ
  '1:4': { lat: 21.0363, lng: 105.8953 }, // Quận Long Biên
  '1:5': { lat: 21.0313, lng: 105.7925 }, // Quận Cầu Giấy
  '1:6': { lat: 21.0181, lng: 105.8239 }, // Quận Đống Đa
  '1:7': { lat: 21.0056, lng: 105.8576 }, // Quận Hai Bà Trưng
  '1:8': { lat: 20.9754, lng: 105.8643 }, // Quận Hoàng Mai
  '1:9': { lat: 20.9937, lng: 105.8118 }, // Quận Thanh Xuân
  '1:19': { lat: 21.0173, lng: 105.7656 }, // Quận Nam Từ Liêm
  '1:21': { lat: 21.0637, lng: 105.7533 }, // Quận Bắc Từ Liêm
  '1:268': { lat: 20.9721, lng: 105.7772 }, // Quận Hà Đông
  '1:20': { lat: 20.9416, lng: 105.8453 }, // Huyện Thanh Trì
  '1:18': { lat: 21.0261, lng: 105.9450 }, // Huyện Gia Lâm
  '1:17': { lat: 21.1366, lng: 105.8467 }, // Huyện Đông Anh
  '1:16': { lat: 21.2825, lng: 105.8471 }, // Huyện Sóc Sơn
  '1:250': { lat: 21.1717, lng: 105.7144 }, // Huyện Mê Linh
  '1:273': { lat: 21.1118, lng: 105.6702 }, // Huyện Đan Phượng
  '1:274': { lat: 21.0204, lng: 105.7051 }, // Huyện Hoài Đức
  '1:275': { lat: 20.9856, lng: 105.6267 }, // Huyện Quốc Oai
  '1:276': { lat: 21.0223, lng: 105.5414 }, // Huyện Thạch Thất
  '1:277': { lat: 20.8931, lng: 105.6669 }, // Huyện Chương Mỹ
  '1:278': { lat: 20.8719, lng: 105.7678 }, // Huyện Thanh Oai
  '1:279': { lat: 20.8732, lng: 105.8672 }, // Huyện Thường Tín
  '1:280': { lat: 20.7323, lng: 105.8973 }, // Huyện Phú Xuyên
  '1:281': { lat: 20.7416, lng: 105.7915 }, // Huyện Ứng Hòa
  '1:282': { lat: 20.6865, lng: 105.7486 }, // Huyện Mỹ Đức
  '1:269': { lat: 21.1345, lng: 105.5068 }, // Thị xã Sơn Tây
  '1:271': { lat: 21.2464, lng: 105.3533 }, // Huyện Ba Vì
  '1:272': { lat: 21.1091, lng: 105.5392 }, // Huyện Phúc Thọ

  // ── ĐÀ NẴNG (Province code: 48) ──────────────────────────────────────────
  '48:490': { lat: 16.0592, lng: 108.2208 }, // Quận Hải Châu
  '48:491': { lat: 16.0617, lng: 108.1884 }, // Quận Thanh Khê
  '48:492': { lat: 16.0950, lng: 108.2562 }, // Quận Sơn Trà
  '48:493': { lat: 16.0089, lng: 108.2543 }, // Quận Ngũ Hành Sơn
  '48:494': { lat: 16.0887, lng: 108.1432 }, // Quận Liên Chiểu
  '48:495': { lat: 15.9989, lng: 108.1889 }, // Quận Cẩm Lệ
  '48:497': { lat: 15.9897, lng: 108.0673 }, // Huyện Hòa Vang

  // ── BÌNH DƯƠNG (Province code: 74) ───────────────────────────────────────
  '74:718': { lat: 10.9805, lng: 106.6519 }, // TP. Thủ Dầu Một
  '74:721': { lat: 10.9067, lng: 106.7719 }, // TP. Dĩ An
  '74:720': { lat: 10.9256, lng: 106.7028 }, // TP. Thuận An
  '74:723': { lat: 11.0858, lng: 106.7761 }, // TP. Tân Uyên
  '74:722': { lat: 11.1311, lng: 106.6111 }, // TP. Bến Cát
  '74:724': { lat: 11.2722, lng: 106.6028 }, // Huyện Bàu Bàng
  '74:725': { lat: 11.1611, lng: 106.8778 }, // Huyện Bắc Tân Uyên
  '74:719': { lat: 11.2889, lng: 106.3972 }, // Huyện Dầu Tiếng
  '74:726': { lat: 11.3111, lng: 106.8028 }, // Huyện Phú Giáo

  // ── ĐỒNG NAI (Province code: 75) ─────────────────────────────────────────
  '75:731': { lat: 10.9575, lng: 106.8427 }, // TP. Biên Hòa
  '75:732': { lat: 10.9389, lng: 107.2417 }, // TP. Long Khánh
  '75:735': { lat: 10.7889, lng: 106.9583 }, // Huyện Long Thành
  '75:736': { lat: 10.6694, lng: 106.8861 }, // Huyện Nhơn Trạch
  '75:737': { lat: 10.9667, lng: 107.0167 }, // Huyện Trảng Bom
  '75:734': { lat: 11.1667, lng: 106.9167 }, // Huyện Vĩnh Cửu

  // ── HẢI PHÒNG (Province code: 31) ────────────────────────────────────────
  '31:303': { lat: 20.8667, lng: 106.6667 }, // Quận Hồng Bàng
  '31:304': { lat: 20.8500, lng: 106.6833 }, // Quận Ngô Quyền
  '31:305': { lat: 20.8333, lng: 106.6833 }, // Quận Lê Chân
  '31:306': { lat: 20.8333, lng: 106.7167 }, // Quận Hải An
  '31:307': { lat: 20.8000, lng: 106.6333 }, // Quận Kiến An
  '31:311': { lat: 20.9333, lng: 106.6667 }, // Huyện Thủy Nguyên
  '31:312': { lat: 20.8667, lng: 106.6000 }, // Huyện An Dương

  // ── CẦN THƠ (Province code: 92) ──────────────────────────────────────────
  '92:916': { lat: 10.0333, lng: 105.7833 }, // Quận Ninh Kiều
  '92:917': { lat: 10.0667, lng: 105.7333 }, // Quận Bình Thủy
  '92:918': { lat: 10.0000, lng: 105.7833 }, // Quận Cái Răng
  '92:919': { lat: 10.1167, lng: 105.6333 }, // Quận Ô Môn
  '92:923': { lat: 9.9833, lng: 105.6833 }, // Huyện Phong Điền
};

/**
 * Province centroid coordinates for fallback calculation.
 */
const PROVINCE_CENTROIDS: Record<number, LatLng> = {
  1: { lat: 21.0285, lng: 105.8542 }, // Hà Nội
  79: { lat: 10.7769, lng: 106.7009 }, // TP. Hồ Chí Minh
  48: { lat: 16.0544, lng: 108.2022 }, // Đà Nẵng
  31: { lat: 20.8449, lng: 106.6881 }, // Hải Phòng
  92: { lat: 10.0452, lng: 105.7469 }, // Cần Thơ
  74: { lat: 11.1667, lng: 106.6667 }, // Bình Dương
  75: { lat: 11.0000, lng: 107.1667 }, // Đồng Nai
  77: { lat: 10.5000, lng: 107.1667 }, // Bà Rịa - Vũng Tàu
  80: { lat: 10.5333, lng: 106.4000 }, // Long An
  82: { lat: 10.3667, lng: 106.3667 }, // Tiền Giang
  83: { lat: 10.2333, lng: 106.3833 }, // Bến Tre
  84: { lat: 9.9333, lng: 106.3333 }, // Trà Vinh
  86: { lat: 10.2500, lng: 105.9667 }, // Vĩnh Long
  87: { lat: 10.4500, lng: 105.6333 }, // Đồng Tháp
  89: { lat: 10.5000, lng: 105.1667 }, // An Giang
  91: { lat: 10.0167, lng: 105.0833 }, // Kiên Giang
  93: { lat: 9.7833, lng: 105.4667 }, // Hậu Giang
  94: { lat: 9.6000, lng: 105.9667 }, // Sóc Trăng
  95: { lat: 9.2833, lng: 105.7167 }, // Bạc Liêu
  96: { lat: 9.1833, lng: 105.1500 }, // Cà Mau
};

/**
 * Gets approximate centroid coordinates for a given district.
 */
export function getDistrictCoordinates(
  provinceCode: number | string,
  districtCode: number | string,
): LatLng | null {
  const key = `${provinceCode}:${districtCode}`;
  if (DISTRICT_CENTROIDS[key]) {
    return DISTRICT_CENTROIDS[key];
  }
  const pCode = Number(provinceCode);
  if (PROVINCE_CENTROIDS[pCode]) {
    return PROVINCE_CENTROIDS[pCode];
  }
  return null;
}

/**
 * Calculates estimated distance in km from an origin coordinate to a district.
 * Returns null if origin coordinates are unavailable.
 */
export function getDistrictDistanceKm(
  origin: LatLng | null | undefined,
  provinceCode: number | string,
  districtCode: number | string,
): number | null {
  if (!origin || typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
    return null;
  }
  const dest = getDistrictCoordinates(provinceCode, districtCode);
  if (!dest) return null;

  return calculateHaversineDistanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
}

/**
 * Filters and returns all districts that fall within the given radius (in km).
 * Results are sorted by distance ascending (nearest first).
 */
export interface DistrictWithDistance {
  code: number;
  name: string;
  distanceKm: number | null;
  isWithinRadius: boolean;
}

export function evaluateDistrictsByRadius(
  origin: LatLng | null | undefined,
  provinceCode: number | string,
  districts: { code: number; name: string }[],
  radiusKm: number,
): DistrictWithDistance[] {
  return districts.map((d) => {
    const dist = getDistrictDistanceKm(origin, provinceCode, d.code);
    const isWithinRadius = dist !== null ? dist <= radiusKm : true;
    return {
      code: d.code,
      name: d.name,
      distanceKm: dist,
      isWithinRadius,
    };
  });
}
