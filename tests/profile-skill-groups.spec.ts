import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ProfileSkillGroups from '../src/components/console/ProfileSkillGroups.vue';

const skill = (id: string, categoryName: string) => ({
  id, serviceName: `Dịch vụ ${id}`, categoryId: categoryName, categoryName, declaredLevel: 'INTERMEDIATE', level: 'INTERMEDIATE', verificationStatus: 'pending',
});
const skills = [skill('s1', 'Điều hòa'), skill('s2', 'Điều hòa'), skill('s3', 'Tủ lạnh')];
const evidence = [{
  verificationId: 'r1', documentId: 'd1', fileName: 'bhxh.jpg', mimeType: 'image/jpeg', evidenceType: 'social_insurance', evidenceGroup: 'verifiable',
  issuer: 'BHXH', referenceNumber: '123', issuedAt: '2024-03-05', expiresAt: null, claimedYears: 5, skillIds: ['s1', 's2'],
}];
const decisions = () => Object.fromEntries(skills.map((s) => [s.id, { level: 'INTERMEDIATE', approved: true, reason: '' }]));

const mountGroups = (props: object = {}) => mount(ProfileSkillGroups, { props: { skills, evidence, decisions: decisions(), ...props } });

describe('ProfileSkillGroups', () => {
  it('folds skills by category and counts what is confirmed', () => {
    const w = mountGroups();
    expect(w.findAll('[data-testid^="skill-group-toggle-"]').map((b) => b.text())).toEqual([
      expect.stringContaining('Điều hòa'), expect.stringContaining('Tủ lạnh'),
    ]);
    expect(w.text()).toContain('3/3');
    expect(w.text()).toContain('2 dịch vụ được xác nhận');
  });

  it('lists each paper once for all the groups it covers, with the details behind a button', async () => {
    const w = mountGroups();
    expect(w.findAll('[data-testid="profile-papers"] [data-testid="evidence-view"]')).toHaveLength(1);
    expect(w.text()).toContain('Sổ bảo hiểm xã hội · BHXH');
    expect(w.text()).toContain('Áp dụng cho: Điều hòa');
    expect(w.text()).not.toContain('05/03/2024');
    await w.findAll('[data-testid="profile-papers"] button').find((b) => b.text() === 'Chi tiết')!.trigger('click');
    expect(w.text()).toContain('05/03/2024');
    expect(w.text()).toContain('5 năm');
  });

  it('keeps the groups closed, and an open group lists its skills and names its papers without repeating them', async () => {
    const w = mountGroups();
    expect(w.text()).not.toContain('Dịch vụ s1');
    await w.get('[data-testid="skill-group-toggle-Điều hòa"]').trigger('click');
    expect(w.text()).toContain('Dịch vụ s1');
    expect(w.text()).toContain('Giấy tờ:');
    expect(w.text().match(/Giấy tờ thợ nộp/g)).toHaveLength(1);
    expect(w.findAll('dl')).toHaveLength(0);
    await w.get('[data-testid="skill-group-toggle-Tủ lạnh"]').trigger('click');
    expect(w.text()).toContain('Thợ chưa nộp giấy tờ cho nhóm này.');
  });

  it('asks the page to show a paper in its own viewer instead of leaving the page', async () => {
    const w = mountGroups();
    await w.get('[data-testid="evidence-view"]').trigger('click');
    expect(w.emitted('preview')![0]).toEqual([evidence[0]]);
  });

  it('sets the level and the confirmation of a whole group in one step', async () => {
    const w = mountGroups();
    await w.get('[data-testid="skill-group-level-Điều hòa"]').setValue('EXPERT');
    expect(w.emitted('change')!.at(-1)).toEqual([['s1', 's2'], { level: 'EXPERT' }]);
    await w.get('[data-testid="skill-group-approve-Điều hòa"]').setValue(false);
    expect(w.emitted('change')!.at(-1)).toEqual([['s1', 's2'], { approved: false }]);
  });

  it('confirms or clears every skill at once', async () => {
    const w = mountGroups();
    await w.get('[data-testid="skills-approve-all"]').trigger('click');
    expect(w.emitted('change')!.at(-1)).toEqual([['s1', 's2', 's3'], { approved: false }]);
    const none = mountGroups({ decisions: Object.fromEntries(skills.map((s) => [s.id, { level: 'INTERMEDIATE', approved: false }])) });
    await none.get('[data-testid="skills-approve-all"]').trigger('click');
    expect(none.emitted('change')!.at(-1)).toEqual([['s1', 's2', 's3'], { approved: true }]);
  });

  it('is read-only for the admin: no bulk button, controls disabled', () => {
    const w = mountGroups({ readonly: true });
    expect(w.find('[data-testid="skills-approve-all"]').exists()).toBe(false);
    expect(w.get('[data-testid="skill-group-level-Điều hòa"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="skill-group-approve-Điều hòa"]').attributes('disabled')).toBeDefined();
  });

  it('asks for a reason under a skill left unconfirmed, one for the whole group, and marks what is still missing', async () => {
    const off = Object.fromEntries(skills.map((s) => [s.id, { level: 'INTERMEDIATE', approved: s.id !== 's2', reason: '' }]));
    const w = mountGroups({ decisions: off, showReasonErrors: true });
    // the group with a missing reason opens by itself after a failed approval
    expect(w.find('[data-testid="skill-reason-s2"]').exists()).toBe(true);
    expect(w.find('[data-testid="skill-reason-s1"]').exists()).toBe(false);
    expect(w.get('[data-testid="skill-reason-s2"]').attributes('aria-invalid')).toBe('true');
    await w.get('[data-testid="skill-reason-s2"]').setValue('Bằng chưa rõ cấp');
    expect(w.emitted('change')!.at(-1)).toEqual([['s2'], { reason: 'Bằng chưa rõ cấp' }]);
    await w.get('[data-testid="skill-group-reason-Điều hòa"]').setValue('Chưa đủ căn cứ');
    expect(w.emitted('change')!.at(-1)).toEqual([['s2'], { reason: 'Chưa đủ căn cứ' }]);
  });
});
