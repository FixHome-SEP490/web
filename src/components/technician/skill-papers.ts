// Logic thuần của giấy tờ kỹ năng phía thợ (cùng luật bản mobile `skill-evidence.ts`): trạng thái, kiểm form, báo trùng.
import {
  SKILL_EVIDENCE_TYPE_LABEL,
  SKILL_EVIDENCE_REVIEW_LABEL,
} from '../../api/admin-skill-verifications.api';
import type {
  SentEvidenceStatus,
  SentSkillEvidence,
  SkillEvidenceDetailsInput,
  SkillEvidenceType,
} from '../../api/technician-profile.api';

export const PAPER_MAX_BYTES = 10 * 1024 * 1024;
export const PAPER_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const PAPER_MIME = new Set(PAPER_ACCEPT.split(','));

export const PAPER_TYPES = Object.keys(SKILL_EVIDENCE_TYPE_LABEL) as SkillEvidenceType[];
export const paperTypeLabel = (type: SkillEvidenceType | null, fallback = 'Giấy tờ') =>
  (type ? SKILL_EVIDENCE_TYPE_LABEL[type] : null) ?? fallback;
export const paperReviewLabel = (status: string) => SKILL_EVIDENCE_REVIEW_LABEL[status] ?? status;

export type PaperField = 'issuer' | 'referenceNumber' | 'issuedAt' | 'expiresAt' | 'claimedYears';

/** Chi tiết nào hợp với loại giấy tờ: giấy cấp có nơi cấp, số hiệu và ngày; xác nhận có người xác nhận và số năm. */
export function paperFields(type: SkillEvidenceType | null): PaperField[] {
  switch (type) {
    case 'national_skill_certificate':
    case 'vocational_diploma':
    case 'electrical_safety_card':
    case 'manufacturer_training':
      return ['issuer', 'referenceNumber', 'issuedAt', 'expiresAt'];
    case 'employer_confirmation':
    case 'social_insurance':
      return ['issuer', 'issuedAt', 'claimedYears'];
    case null:
      return [];
    default:
      return ['claimedYears'];
  }
}

export interface PaperForm {
  evidenceType: SkillEvidenceType | null;
  issuer: string;
  referenceNumber: string;
  /** `YYYY-MM-DD` (ô chọn ngày của trình duyệt). */
  issuedAt: string;
  expiresAt: string;
  claimedYears: string;
}

export const emptyPaperForm = (): PaperForm => ({
  evidenceType: null, issuer: '', referenceNumber: '', issuedAt: '', expiresAt: '', claimedYears: '',
});

/** Lý do tệp không gửi được, hoặc null. */
export function paperFileProblem(file: { type: string; size: number }): string | null {
  if (!PAPER_MIME.has(file.type)) return 'Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF.';
  if (file.size > PAPER_MAX_BYTES) return 'Tệp quá lớn. Tối đa 10 MB.';
  return null;
}

const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Lý do đầu tiên form chưa gửi được, hoặc null. Backend kiểm lại các luật quan trọng. */
export function paperFormProblem(form: PaperForm, today: string = todayVn()): string | null {
  if (!form.evidenceType) return 'Chọn loại giấy tờ.';
  const fields = paperFields(form.evidenceType);
  const issued = fields.includes('issuedAt') ? form.issuedAt : '';
  const expires = fields.includes('expiresAt') ? form.expiresAt : '';
  if (issued && issued > today) return 'Ngày cấp không được sau hôm nay.';
  if (issued && expires && expires < issued) return 'Ngày hết hạn không được trước ngày cấp.';
  if (expires && expires < today) return 'Giấy tờ đã hết hạn.';
  if (fields.includes('claimedYears') && form.claimedYears.trim()) {
    const years = Number(form.claimedYears);
    if (!Number.isInteger(years) || years < 0 || years > 60) return 'Số năm kinh nghiệm từ 0 đến 60.';
  }
  return null;
}

/** Form thành chi tiết gửi lên; chỉ giữ ô hợp với loại đã chọn. */
export function paperDetails(form: PaperForm): SkillEvidenceDetailsInput | null {
  if (!form.evidenceType) return null;
  const fields = paperFields(form.evidenceType);
  const out: SkillEvidenceDetailsInput = { evidenceType: form.evidenceType };
  if (fields.includes('issuer') && form.issuer.trim()) out.issuer = form.issuer.trim();
  if (fields.includes('referenceNumber') && form.referenceNumber.trim()) out.referenceNumber = form.referenceNumber.trim();
  if (fields.includes('issuedAt') && form.issuedAt) out.issuedAt = form.issuedAt;
  if (fields.includes('expiresAt') && form.expiresAt) out.expiresAt = form.expiresAt;
  if (fields.includes('claimedYears') && form.claimedYears.trim()) out.claimedYears = Number(form.claimedYears);
  return out;
}

const normalizedNumber = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Giấy tờ đã nộp đã phủ đủ các kỹ năng này với cùng loại và cùng số hiệu: nộp thêm bản nữa là thừa (backend cũng chặn). */
export function coveredByExisting(
  sent: SentSkillEvidence[],
  details: Pick<SkillEvidenceDetailsInput, 'evidenceType' | 'referenceNumber'>,
  serviceIds: string[],
): boolean {
  const number = normalizedNumber(details.referenceNumber);
  if (!number || serviceIds.length === 0) return false;
  return sent.some(
    (p) =>
      p.evidenceType === details.evidenceType &&
      normalizedNumber(p.referenceNumber) === number &&
      serviceIds.every((id) => p.serviceIds?.includes(id)),
  );
}

/** Cùng kiểm tra theo nhóm dịch vụ (trang Giấy tờ, bước 3). */
export function coveredByExistingCategories(
  sent: SentSkillEvidence[],
  details: Pick<SkillEvidenceDetailsInput, 'evidenceType' | 'referenceNumber'>,
  categoryIds: string[],
): boolean {
  const number = normalizedNumber(details.referenceNumber);
  if (!number || categoryIds.length === 0) return false;
  return sent.some(
    (p) =>
      p.evidenceType === details.evidenceType &&
      normalizedNumber(p.referenceNumber) === number &&
      categoryIds.every((id) => p.categories.some((c) => c.id === id)),
  );
}

export interface PaperStatusView {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
  /** Giải thích khóa, rỗng khi còn xóa được. */
  lock: string;
}

export const PAPER_STATUS: Record<SentEvidenceStatus, PaperStatusView> = {
  rejected: { label: 'Kỹ năng bị từ chối', tone: 'danger', lock: '' },
  pending: { label: 'Chờ duyệt', tone: 'warning', lock: '' },
  in_review: { label: 'Đang xét duyệt', tone: 'info', lock: 'Hồ sơ đang được xét duyệt nên chưa xóa được giấy tờ.' },
  approved: { label: 'Đã dùng để duyệt', tone: 'success', lock: 'Giấy tờ đã dùng để duyệt kỹ năng nên không xóa được nữa.' },
};

/** Thứ tự nhóm: cái cần xử lý lên đầu. */
export const PAPER_STATUS_ORDER: SentEvidenceStatus[] = ['rejected', 'pending', 'in_review', 'approved'];
export const PAPER_GROUP_TITLE: Record<SentEvidenceStatus, string> = {
  rejected: 'Cần xử lý',
  pending: 'Chờ duyệt',
  in_review: 'Đang xét duyệt',
  approved: 'Đã dùng để duyệt',
};

/** Backend cũ không trả `status`: `editable` quyết định. */
export const paperStatusOf = (item: Pick<SentSkillEvidence, 'status' | 'editable'>): SentEvidenceStatus =>
  item.status ?? (item.editable === false ? 'approved' : 'pending');

export const groupPapersByStatus = (items: SentSkillEvidence[]) =>
  PAPER_STATUS_ORDER.map((status) => ({ status, items: items.filter((i) => paperStatusOf(i) === status) })).filter((g) => g.items.length > 0);

const dayText = (value: string | null) => (value ? value.slice(0, 10).split('-').reverse().join('/') : null);

/** Thông tin thợ đã khai cho một giấy tờ, bỏ ô trống (dùng trong hộp thoại chi tiết). */
export const paperFacts = (p: SentSkillEvidence): { label: string; value: string }[] =>
  (
    [
      ['Loại giấy tờ', p.evidenceType ? paperTypeLabel(p.evidenceType) : null],
      ['Cơ quan cấp / xác nhận', p.issuer],
      ['Số hiệu', p.referenceNumber],
      ['Ngày cấp', dayText(p.issuedAt)],
      ['Ngày hết hạn', dayText(p.expiresAt)],
      ['Số năm kinh nghiệm', p.claimedYears == null ? null : `${p.claimedYears} năm`],
      ['Tệp', p.fileName],
    ] as [string, string | null][]
  )
    .filter((row): row is [string, string] => !!row[1])
    .map(([label, value]) => ({ label, value }));
