// src/utils/service-presentation.ts
//
// Maps service codes, slugs, or Vietnamese names to optimized 3D service artwork
// located in `/images/services/*.png` (shared with `mobile/assets/optimized/services`).

export interface ServiceArtworkSource {
  code?: string | null;
  slug?: string | null;
  name?: string | null;
  categoryName?: string | null;
}

const CODE_TO_FILE: Record<string, string> = {
  // V1 Service Presentation Codes
  LAP_QUAT_DEN: 'svc-lap-quat-den.png',
  SUA_CHAP_DIEN: 'svc-sua-chap-dien.png',
  THAY_O_CAM_DIEN: 'svc-thay-o-cam-dien.png',
  THAY_CONG_TAC_DIEN: 'svc-thay-cong-tac-dien.png',
  LAP_DEN_TRAN_CO_BAN: 'svc-lap-den-tran-co-ban.png',
  LAP_QUAT_TRAN_CO_BAN: 'svc-lap-quat-tran-co-ban.png',
  LAP_QUAT_TREO_TUONG: 'svc-lap-quat-treo-tuong.png',
  THAY_VOI_SEN: 'svc-thay-voi-sen.png',
  THAY_SIPHON_LAVABO: 'svc-thay-siphon-lavabo.png',
  THAY_VOI_NUOC: 'svc-thay-voi-nuoc.png',
  SUA_RO_RI_NUOC: 'svc-sua-ro-ri-nuoc.png',
  SUA_MAY_BOM_NUOC: 'svc-sua-may-bom-nuoc.png',
  LAP_MAY_LOC_NUOC: 'svc-lap-may-loc-nuoc.png',
  THAY_THIET_BI_VE_SINH: 'svc-thay-thiet-bi-ve-sinh.png',
  VE_SINH_DIEU_HOA: 'svc-ve-sinh-dieu-hoa.png',
  VE_SINH_DIEU_HOA_1HP: 'svc-ve-sinh-dieu-hoa-1hp.png',
  VE_SINH_DIEU_HOA_2HP: 'svc-ve-sinh-dieu-hoa-2hp.png',
  VE_SINH_DIEU_HOA_AM_TRAN: 'svc-ve-sinh-dieu-hoa-am-tran.png',
  SUA_DIEU_HOA: 'svc-sua-dieu-hoa.png',
  THAO_DI_DOI_DIEU_HOA: 'svc-thao-di-doi-dieu-hoa.png',
  LAP_DAT_DIEU_HOA: 'svc-lap-dat-dieu-hoa.png',
  VE_SINH_MAY_GIAT_CUA_TREN_LE9: 'svc-ve-sinh-may-giat-cua-tren-le9.png',
  VE_SINH_MAY_GIAT_CUA_TREN_GT9: 'svc-ve-sinh-may-giat-cua-tren-gt9.png',
  VE_SINH_MAY_GIAT_CUA_NGANG_LE9: 'svc-ve-sinh-may-giat-cua-ngang-le9.png',
  VE_SINH_MAY_GIAT_CUA_NGANG_GT9: 'svc-ve-sinh-may-giat-cua-ngang-gt9.png',
  SUA_MAY_GIAT: 'svc-sua-may-giat.png',
  VE_SINH_MAY_SAY: 'svc-ve-sinh-may-say.png',
  SUA_TU_LANH: 'svc-sua-tu-lanh.png',
  VE_SINH_BINH_NONG_LANH: 'svc-ve-sinh-binh-nong-lanh.png',
  SUA_BEP_TU: 'svc-sua-bep-tu.png',
  SUA_MAY_RUA_CHEN: 'svc-sua-may-rua-chen.png',
  SUA_MAY_HUT_MUI: 'svc-sua-may-hut-mui.png',
  LAP_TV_GIA_TREO: 'svc-lap-tv-gia-treo.png',
  KIEM_TRA_CHAN_DOAN_THIET_BI: 'svc-kiem-tra-chan-doan-thiet-bi.png',
  MO_KHOA_KHAN_CAP: 'svc-mo-khoa-khan-cap.png',
  SUA_KHOA_THONG_MINH: 'svc-sua-khoa-thong-minh.png',
  DICH_VU_KHAC: 'svc-dich-vu-khac.png',

  // Catalog V2 Service Codes
  'AC-01': 'svc-sua-dieu-hoa.png',
  'AC-02': 'svc-ve-sinh-dieu-hoa.png',
  'AC-03': 'svc-lap-dat-dieu-hoa.png',
  'AC-04': 'svc-thao-di-doi-dieu-hoa.png',
  'PU-01': 'svc-sua-may-bom-nuoc.png',
  'PU-02': 'svc-lap-dat-may-bom-nuoc.png',
  'WM-01': 'svc-sua-may-giat.png',
  'WM-02': 'svc-ve-sinh-may-giat-cua-tren-le9.png',
  'WM-03': 'svc-ve-sinh-may-say.png',
  'WM-04': 'svc-sua-may-giat.png',
  'WM-05': 'svc-sua-may-giat.png',
  'WH-01': 'svc-ve-sinh-binh-nong-lanh.png',
  'WH-02': 'svc-ve-sinh-binh-nong-lanh.png',
  'KT-01': 'svc-sua-bep-tu.png',
  'KT-02': 'svc-sua-may-hut-mui.png',
  'KT-03': 'svc-sua-may-rua-chen.png',
  'RO-01': 'svc-lap-may-loc-nuoc.png',
  'RO-02': 'svc-lap-may-loc-nuoc.png',
  'RO-03': 'svc-lap-may-loc-nuoc.png',
  'LF-01': 'svc-lap-den-tran-co-ban.png',
  'LF-02': 'svc-lap-quat-tran-co-ban.png',
  'LF-03': 'svc-lap-quat-treo-tuong.png',
  'SA-01': 'svc-thay-thiet-bi-ve-sinh.png',
  'SA-02': 'svc-thay-thiet-bi-ve-sinh.png',
  'SA-03': 'svc-thay-thiet-bi-ve-sinh.png',
  'FR-01': 'svc-sua-tu-lanh.png',
  'PI-01': 'svc-sua-ro-ri-nuoc.png',
  'TV-01': 'svc-lap-tv-gia-treo.png',
  'EL-01': 'svc-sua-chap-dien.png',
  'EL-02': 'svc-thay-cong-tac-dien.png',
  'LK-01': 'svc-mo-khoa-khan-cap.png',
  'LK-02': 'svc-sua-khoa-thong-minh.png',
  'LK-03': 'svc-sua-khoa-thong-minh.png',
};

function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

const KEYWORD_RULES: ReadonlyArray<[RegExp, string]> = [
  [/ve sinh.*dieu hoa.*am tran|ve sinh.*may lanh.*am tran/, 'svc-ve-sinh-dieu-hoa-am-tran.png'],
  [/ve sinh.*dieu hoa.*2|ve sinh.*may lanh.*2/, 'svc-ve-sinh-dieu-hoa-2hp.png'],
  [/ve sinh.*dieu hoa.*1|ve sinh.*may lanh.*1/, 'svc-ve-sinh-dieu-hoa-1hp.png'],
  [/ve sinh.*(dieu hoa|may lanh)/, 'svc-ve-sinh-dieu-hoa.png'],
  [/thao.*(dieu hoa|may lanh)|di doi.*(dieu hoa|may lanh)/, 'svc-thao-di-doi-dieu-hoa.png'],
  [/lap.*(dieu hoa|may lanh)/, 'svc-lap-dat-dieu-hoa.png'],
  [/dieu hoa|may lanh/, 'svc-sua-dieu-hoa.png'],
  [/ve sinh.*may say|bao duong.*may say/, 'svc-ve-sinh-may-say.png'],
  [/ve sinh.*may giat.*ngang.*(tren 9|> ?9|10)/, 'svc-ve-sinh-may-giat-cua-ngang-gt9.png'],
  [/ve sinh.*may giat.*ngang/, 'svc-ve-sinh-may-giat-cua-ngang-le9.png'],
  [/ve sinh.*may giat.*(tren 9|> ?9|10)/, 'svc-ve-sinh-may-giat-cua-tren-gt9.png'],
  [/ve sinh.*may giat/, 'svc-ve-sinh-may-giat-cua-tren-le9.png'],
  [/may giat|may say/, 'svc-sua-may-giat.png'],
  [/tu lanh|tu dong|tu mat/, 'svc-sua-tu-lanh.png'],
  [/binh nong lanh|may nuoc nong/, 'svc-ve-sinh-binh-nong-lanh.png'],
  [/may loc nuoc|loc nuoc/, 'svc-lap-may-loc-nuoc.png'],
  [/lap.*may bom|lap dat.*bom nuoc/, 'svc-lap-dat-may-bom-nuoc.png'],
  [/may bom|bom nuoc/, 'svc-sua-may-bom-nuoc.png'],
  [/bep tu|bep hong ngoai/, 'svc-sua-bep-tu.png'],
  [/hut mui/, 'svc-sua-may-hut-mui.png'],
  [/rua chen|rua bat/, 'svc-sua-may-rua-chen.png'],
  [/siphon|xi phong|lavabo/, 'svc-thay-siphon-lavabo.png'],
  [/voi sen|sen tam/, 'svc-thay-voi-sen.png'],
  [/voi nuoc/, 'svc-thay-voi-nuoc.png'],
  [/ro ri nuoc|ong nuoc|thong tac/, 'svc-sua-ro-ri-nuoc.png'],
  [/thiet bi ve sinh|bon cau/, 'svc-thay-thiet-bi-ve-sinh.png'],
  [/quat tran/, 'svc-lap-quat-tran-co-ban.png'],
  [/quat treo tuong/, 'svc-lap-quat-treo-tuong.png'],
  [/quat den/, 'svc-lap-quat-den.png'],
  [/den tran|bong den|den led/, 'svc-lap-den-tran-co-ban.png'],
  [/o cam/, 'svc-thay-o-cam-dien.png'],
  [/cong tac/, 'svc-thay-cong-tac-dien.png'],
  [/chap dien|mat dien|aptomat|su co dien/, 'svc-sua-chap-dien.png'],
  [/tv|tivi|gia treo/, 'svc-lap-tv-gia-treo.png'],
  [/mo khoa|khan cap/, 'svc-mo-khoa-khan-cap.png'],
  [/khoa thong minh|khoa van tay|khoa dien tu|khoa cua/, 'svc-sua-khoa-thong-minh.png'],
  [/kiem tra|chan doan|khao sat/, 'svc-kiem-tra-chan-doan-thiet-bi.png'],
];

/**
 * Returns the public image path `/images/services/svc-*.png` for a given service.
 */
export function getServiceArtworkUrl(service?: ServiceArtworkSource | null): string {
  if (!service) return '/images/services/svc-dich-vu-khac.png';

  const rawCode = service.code?.trim().toUpperCase();
  if (rawCode && Object.prototype.hasOwnProperty.call(CODE_TO_FILE, rawCode)) {
    return `/images/services/${CODE_TO_FILE[rawCode]}`;
  }

  const searchTarget = foldText(
    [service.name ?? '', service.slug ?? '', service.code ?? '', service.categoryName ?? ''].join(' '),
  );
  for (const [pattern, file] of KEYWORD_RULES) {
    if (pattern.test(searchTarget)) {
      return `/images/services/${file}`;
    }
  }

  return '/images/services/svc-dich-vu-khac.png';
}

const CATEGORY_CODE_TO_FILE: Record<string, string> = {
  CAT_AC: 'svc-sua-dieu-hoa.png',
  CAT_LAUNDRY: 'svc-sua-may-giat.png',
  CAT_FRIDGE: 'svc-sua-tu-lanh.png',
  CAT_RO: 'svc-lap-may-loc-nuoc.png',
  CAT_HEATER: 'svc-ve-sinh-binh-nong-lanh.png',
  CAT_KITCHEN: 'svc-sua-bep-tu.png',
  CAT_ELECTRIC: 'svc-sua-chap-dien.png',
  CAT_LIGHT_FAN: 'svc-lap-quat-tran-co-ban.png',
  CAT_PIPE: 'svc-sua-ro-ri-nuoc.png',
  CAT_PUMP: 'svc-sua-may-bom-nuoc.png',
  CAT_SANITARY: 'svc-thay-thiet-bi-ve-sinh.png',
  CAT_TV: 'svc-lap-tv-gia-treo.png',
  CAT_LOCK: 'svc-sua-khoa-thong-minh.png',
};

/**
 * Returns the public image path `/images/services/svc-*.png` for a service category.
 */
export function getCategoryArtworkUrl(
  category?: { code?: string | null; name?: string | null; iconKey?: string | null } | null,
): string {
  if (!category) return '/images/services/svc-dich-vu-khac.png';
  const rawCode = category.code?.trim().toUpperCase();
  if (rawCode && Object.prototype.hasOwnProperty.call(CATEGORY_CODE_TO_FILE, rawCode)) {
    return `/images/services/${CATEGORY_CODE_TO_FILE[rawCode]}`;
  }
  return getServiceArtworkUrl({ code: category.code, name: category.name });
}
