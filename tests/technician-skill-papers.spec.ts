import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { api, catalogApi } = vi.hoisted(() => ({
  api: {
    getMySkillEvidence: vi.fn(),
    getSkillVerification: vi.fn(),
    getMyServices: vi.fn(),
    reuseSkillEvidence: vi.fn(),
    resubmitSkill: vi.fn(),
    deleteSkillEvidenceFromSkill: vi.fn(),
    deleteSkillEvidence: vi.fn(),
    getSkillEvidenceAccess: vi.fn(),
  },
  catalogApi: { getCategories: vi.fn() },
}));
vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi: api }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi }));

import {
  coveredByExisting,
  coveredByExistingCategories,
  groupPapersByStatus,
  paperDetails,
  paperFileProblem,
  paperFormProblem,
  paperStatusOf,
  emptyPaperForm,
} from '../src/components/technician/skill-papers';
import SkillPapersPanel from '../src/components/technician/SkillPapersPanel.vue';
import TechnicianPapersTab from '../src/components/technician/TechnicianPapersTab.vue';
import EvidenceDetailDialog from '../src/components/technician/EvidenceDetailDialog.vue';

const paper = (over: Record<string, unknown> = {}) => ({
  documentId: 'd1', serviceId: 's1', serviceIds: ['s1'], fileName: 'a.pdf', mimeType: 'application/pdf',
  evidenceType: 'vocational_diploma', issuer: null, referenceNumber: 'AB-1', issuedAt: null, expiresAt: null,
  claimedYears: null, status: 'pending', categories: [{ id: 'c1', name: 'Điện' }], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getMySkillEvidence.mockResolvedValue([]);
  api.getMyServices.mockResolvedValue([]);
  api.getSkillVerification.mockResolvedValue({ rejectionReason: 'Mờ' });
  api.getSkillEvidenceAccess.mockResolvedValue('https://x/y.png');
  catalogApi.getCategories.mockResolvedValue([{ id: 'c1', name: 'Điện' }]);
});

describe('skill-papers logic', () => {
  it('checks files and forms', () => {
    expect(paperFileProblem({ type: 'text/plain', size: 1 })).toMatch(/JPG/);
    expect(paperFileProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(paperFileProblem({ type: 'image/png', size: 5 })).toBeNull();
    expect(paperFormProblem(emptyPaperForm())).toMatch(/Chọn loại/);
    const f = { ...emptyPaperForm(), evidenceType: 'vocational_diploma' as const, issuedAt: '2020-02-01', expiresAt: '2020-01-01' };
    expect(paperFormProblem(f, '2026-01-01')).toMatch(/hết hạn/);
  });

  it('keeps only fields that fit the type', () => {
    const f = { ...emptyPaperForm(), evidenceType: 'work_photos' as const, issuer: 'x', claimedYears: '3' };
    expect(paperDetails(f)).toEqual({ evidenceType: 'work_photos', claimedYears: 3 });
  });

  it('spots a paper already held with the same type and number', () => {
    const sent = [paper()] as never;
    expect(coveredByExisting(sent, { evidenceType: 'vocational_diploma', referenceNumber: ' ab-1 ' }, ['s1'])).toBe(true);
    expect(coveredByExisting(sent, { evidenceType: 'vocational_diploma', referenceNumber: 'AB-1' }, ['s1', 's2'])).toBe(false);
    expect(coveredByExisting(sent, { evidenceType: 'vocational_diploma' }, ['s1'])).toBe(false);
    expect(coveredByExistingCategories(sent, { evidenceType: 'vocational_diploma', referenceNumber: 'ab-1' }, ['c1'])).toBe(true);
  });

  it('groups by status with what needs action first and falls back to editable', () => {
    const items = [paper({ documentId: 'a', status: 'approved' }), paper({ documentId: 'b', status: 'rejected' })] as never;
    expect(groupPapersByStatus(items).map((g) => g.status)).toEqual(['rejected', 'approved']);
    expect(paperStatusOf({ editable: false } as never)).toBe('approved');
    expect(paperStatusOf({} as never)).toBe('pending');
  });
});

describe('EvidenceDetailDialog', () => {
  it('does not show the previous paper photo after switching paper', async () => {
    api.getSkillEvidenceAccess.mockResolvedValueOnce('https://x/one.png').mockRejectedValueOnce(new Error('x'));
    const w = mount(EvidenceDetailDialog, {
      props: { open: true, title: 'T', photo: { serviceId: 's', documentId: 'one', mimeType: 'image/png' }, facts: [] },
      global: { stubs: { teleport: true } },
    });
    await flushPromises();
    expect(w.find('[data-testid="evidence-detail-photo"]').exists()).toBe(true);
    await w.setProps({ photo: { serviceId: 's', documentId: 'two', mimeType: 'image/png' } });
    await flushPromises();
    expect(w.find('[data-testid="evidence-detail-photo"]').exists()).toBe(false);
  });

  it('hides delete unless allowed and shows the rejection reason', () => {
    const w = mount(EvidenceDetailDialog, {
      props: { open: true, title: 'T', facts: [], status: { label: 'Bị từ chối', tone: 'danger', lock: '' }, reason: 'Mờ', canDelete: false },
      global: { stubs: { teleport: true } },
    });
    expect(w.find('[data-testid="evidence-detail-delete"]').exists()).toBe(false);
    expect(w.find('[data-testid="evidence-detail-reason"]').text()).toContain('Mờ');
  });
});

describe('SkillPapersPanel', () => {
  it('reuses papers the technician already uploaded', async () => {
    api.getMySkillEvidence.mockResolvedValue([paper({ documentId: 'x', serviceIds: ['s2'], serviceId: 's2' })]);
    api.reuseSkillEvidence.mockResolvedValue({ attached: 1, skipped: 0 });
    const w = mount(SkillPapersPanel, { props: { serviceId: 's1', status: 'pending' }, global: { stubs: { teleport: true } } });
    await flushPromises();
    await w.find('[data-testid="skill-papers-add"]').trigger('click');
    await w.find('[data-testid="skill-papers-choice-x"]').setValue(true);
    await w.find('[data-testid="skill-papers-choose-add"]').trigger('click');
    await flushPromises();
    expect(api.reuseSkillEvidence).toHaveBeenCalledWith('s1', ['x']);
    expect(w.emitted('changed')).toBeTruthy();
  });

  it('shows the reason and resubmits a rejected skill, but offers no add on a verified one', async () => {
    api.resubmitSkill.mockResolvedValue(undefined);
    const w = mount(SkillPapersPanel, { props: { serviceId: 's1', status: 'rejected' }, global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(w.find('[data-testid="skill-papers-reason"]').text()).toContain('Mờ');
    await w.find('[data-testid="skill-papers-resubmit"]').trigger('click');
    await flushPromises();
    expect(api.resubmitSkill).toHaveBeenCalledWith('s1');

    const v = mount(SkillPapersPanel, { props: { serviceId: 's1', status: 'verified' }, global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(v.find('[data-testid="skill-papers-add"]').exists()).toBe(false);
  });

  it('removes a paper from this skill only', async () => {
    api.getMySkillEvidence.mockResolvedValue([paper()]);
    api.deleteSkillEvidenceFromSkill.mockResolvedValue(undefined);
    const w = mount(SkillPapersPanel, { props: { serviceId: 's1', status: 'pending' }, global: { stubs: { teleport: true } } });
    await flushPromises();
    await w.find('[data-testid="skill-paper-d1"]').trigger('click');
    await w.find('[data-testid="evidence-detail-delete"]').trigger('click');
    await flushPromises();
    expect(api.deleteSkillEvidenceFromSkill).toHaveBeenCalledWith('s1', 'd1');
  });
});

describe('TechnicianPapersTab', () => {
  it('groups papers, deletes from every skill and resubmits rejected skills', async () => {
    api.getMySkillEvidence.mockResolvedValue([paper({ status: 'rejected' })]);
    api.getMyServices.mockResolvedValue([{ serviceId: 's1', isActive: true, verificationStatus: 'rejected' }]);
    api.deleteSkillEvidence.mockResolvedValue(undefined);
    api.resubmitSkill.mockResolvedValue(undefined);
    const w = mount(TechnicianPapersTab, { global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(w.find('[data-testid="papers-group-rejected"]').exists()).toBe(true);
    await w.find('[data-testid="papers-resubmit"]').trigger('click');
    await flushPromises();
    expect(api.resubmitSkill).toHaveBeenCalledWith('s1');
    await w.find('[data-testid="paper-d1"]').trigger('click');
    await w.find('[data-testid="evidence-detail-delete"]').trigger('click');
    await flushPromises();
    expect(api.deleteSkillEvidence).toHaveBeenCalledWith('d1');
  });
});
