import {
  type SkillEvidenceDetails,
  SKILL_EVIDENCE_GROUP_LABEL,
  SKILL_EVIDENCE_REVIEW_LABEL,
  SKILL_EVIDENCE_TYPE_LABEL,
} from '../../api/admin-skill-verifications.api';

// The backend stores these two as `YYYY-MM-DD`; reformat the text instead of building a Date (no timezone shift).
export const formatDay = (value: string | null) => (value ? value.slice(0, 10).split('-').reverse().join('/') : null);

/** Label and value of every detail the technician filled in; empty rows are left out. */
export const evidenceRows = (doc: SkillEvidenceDetails): [string, string][] =>
  (
    [
      ['Loại giấy tờ', doc.evidenceType ? (SKILL_EVIDENCE_TYPE_LABEL[doc.evidenceType] ?? doc.evidenceType) : null],
      ['Độ tin cậy', doc.evidenceGroup ? (SKILL_EVIDENCE_GROUP_LABEL[doc.evidenceGroup] ?? doc.evidenceGroup) : null],
      ['Cơ quan cấp / xác nhận', doc.issuer],
      ['Số hiệu', doc.referenceNumber],
      ['Ngày cấp', formatDay(doc.issuedAt)],
      ['Ngày hết hạn', formatDay(doc.expiresAt)],
      ['Số năm kinh nghiệm', doc.claimedYears == null ? null : `${doc.claimedYears} năm`],
      ['Kết quả xem xét', doc.reviewStatus ? (SKILL_EVIDENCE_REVIEW_LABEL[doc.reviewStatus] ?? doc.reviewStatus) : null],
      ['Ghi chú xem xét', doc.reviewNote ?? null],
    ] as [string, string | null][]
  ).filter((row): row is [string, string] => !!row[1]);
