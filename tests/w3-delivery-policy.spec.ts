import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import apiClient from '../src/api/client';
import { w3DeliveryPolicyApi } from '../src/api/w3-delivery-policy.api';
import Page from '../src/pages/console/admin/AdminW3DeliveryPolicyPage.vue';
import router from '../src/router';
import { authGuard } from '../src/router/guards';
import { useAuthStore } from '../src/stores';
import { consoleNavigation } from '../src/components/console/console-navigation';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const parameters = { feeCeilingVnd: 20000, proposalReviewAfterMinutes: 30, courierEvidenceReviewAfterMinutes: 60 };
function draft(revision = 1) {
  const content = { kind: 'W3_DELIVERY_OPERATING_POLICY_V1', policyId: 'w3-delivery-operating-policy', version: revision, parameters: { ...parameters } };
  return { id: revision === 1 ? id : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', state: { mode: 'NON_EXECUTABLE_PREVIEW', financialExecution: 'BLOCKED', status: 'DRAFT', revision,
    policy: { ...content, fingerprint: createHash('sha256').update(JSON.stringify(content)).digest('hex') } }, createdAt: '2026-11-05T00:00:00.000Z' };
}
const inert = { mode: 'NON_EXECUTABLE_PREVIEW', financialExecution: 'BLOCKED', effectivePolicy: null,
  blockers: ['LEGAL_UNVERIFIED', 'ACCOUNTING_UNVERIFIED', 'WAREHOUSE_UNVERIFIED', 'COURIER_UNVERIFIED', 'SHIPPING_APPROVAL_SOURCE_UNVERIFIED', 'FINANCE_CUTOVER_CLOSED'] };
const envelope = (data: unknown, statusCode = 200) => ({ data: { success: true, statusCode, message: 'Success', data } });
const current = () => ({ ...inert, draft: draft() });
const sample = { proposalId: 'manual:sample', proposalVersion: 1, shippingFeeVnd: 20000, proposalAgeMinutes: 10, courierEvidenceAgeMinutes: null };
function lifecycleVersion(status: 'DRAFT' | 'ACTIVE' | 'RETIRED' = 'DRAFT', revision = 1) {
  const content = { kind: 'W3_DELIVERY_OPERATING_POLICY_V1', policyId: 'w3-delivery-operating-policy', version: 1, parameters: { ...parameters } };
  const state = { mode: 'NON_EXECUTABLE_PREVIEW', financialExecution: 'BLOCKED', status, revision,
    policy: { ...content, fingerprint: createHash('sha256').update(JSON.stringify(content)).digest('hex') } };
  return { id: revision === 1 ? id : revision === 2 ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', state, ...(status === 'ACTIVE' ? { activationPreviewId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } : {}), createdAt: '2026-11-06T00:00:00.000Z' };
}
const activation = { scope: 'OPERATING_CONFIG_ONLY', previewRequired: true, financialExecution: 'BLOCKED' };
const versionCurrent = (version: ReturnType<typeof lifecycleVersion> | null = lifecycleVersion()) => ({ ...inert, activation, version });
const versionHistory = (versions = [lifecycleVersion('RETIRED', 3), lifecycleVersion('ACTIVE', 2), lifecycleVersion()]) => ({ ...inert, activation, versions });
const persistedPreview = () => {
  const impact = preview() as Record<string, unknown>;
  delete impact.hypotheticalOnly; delete impact.draftId;
  return { ...inert, activation, hypotheticalOnly: true, preview: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', draftId: id, impact: { ...impact, policyStatus: 'DRAFT' } } };
};
function preview() {
  return { ...inert, hypotheticalOnly: true, draftId: id, policyStatus: 'DRAFT', policyRevision: 1,
    proposals: [{ ...sample, policySnapshot: draft().state.policy, customerShippingShare: 14000, technicianShippingShare: 6000, aboveFeeCeiling: false, proposalReviewDue: false, courierEvidenceReviewDue: null }],
    totals: { shippingFeeVnd: 20000, customerShippingShare: 14000, technicianShippingShare: 6000 },
    counts: { proposals: 1, aboveFeeCeiling: 0, proposalReviewDue: 0, courierEvidenceReviewDue: 0 } };
}
beforeEach(() => {
  setActivePinia(createPinia()); vi.stubGlobal('crypto', webcrypto);
  const auth = useAuthStore();
  auth.user = { id: 'admin-a', email: 'admin@example.test', fullName: 'Admin', role: 'ADMIN', status: 'active' };
  auth.token = 'admin-token';
  vi.spyOn(auth, 'hasPermission').mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mountPage() {
  const wrapper = mount(Page, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Đang tải…'));
  await flushPromises();
  return wrapper;
}
function mockLegacyGet(currentValue = current(), historyValue = { ...inert, drafts: [draft()] }) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async path => {
    if (String(path).includes('/versions/')) throw { response: { status: 404 } };
    return path === '/admin/w3-delivery-policy/current' ? envelope(currentValue) as never : envelope(historyValue) as never;
  });
}

describe('W3 Admin policy boundary', () => {
  it('uses the additive lifecycle endpoints, exact payloads, and endpoint-specific HTTP statuses', async () => {
    expect(Object.keys(w3DeliveryPolicyApi).sort()).toEqual(['activate', 'create', 'current', 'history', 'lifecycleCurrent', 'lifecycleHistory', 'preview', 'retire', 'revise', 'reviseLifecycle', 'saveLifecyclePreview', 'startLifecycle']);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: envelope(versionCurrent()).data, status: 200 }).mockResolvedValueOnce({ data: envelope(versionHistory()).data, status: 200 });
    const post = vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: envelope(versionCurrent(), 201).data, status: 201 })
      .mockResolvedValueOnce({ data: envelope(persistedPreview()).data, status: 200 })
      .mockResolvedValueOnce({ data: envelope(versionCurrent(lifecycleVersion('ACTIVE', 2))).data, status: 200 })
      .mockResolvedValueOnce({ data: envelope(versionCurrent(lifecycleVersion('RETIRED', 3))).data, status: 200 });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: envelope(versionCurrent(lifecycleVersion('DRAFT', 2))).data, status: 200 });
    const created = await w3DeliveryPolicyApi.startLifecycle(0, parameters);
    await w3DeliveryPolicyApi.reviseLifecycle(id, 1, parameters);
    await w3DeliveryPolicyApi.lifecycleCurrent();
    await w3DeliveryPolicyApi.lifecycleHistory();
    const receipt = await w3DeliveryPolicyApi.saveLifecyclePreview(lifecycleVersion(), [sample]);
    await w3DeliveryPolicyApi.activate(id, 1, receipt.preview.id);
    await w3DeliveryPolicyApi.retire(id, 2);
    expect(created.state.status).toBe('DRAFT');
    expect(receipt.preview.id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/admin/w3-delivery-policy/versions/current', '/admin/w3-delivery-policy/versions/history',
    ]);
    expect(post.mock.calls).toEqual([
      ['/admin/w3-delivery-policy/versions/drafts', { expectedRevision: 0, parameters }],
      [`/admin/w3-delivery-policy/versions/${id}/preview`, { expectedRevision: 1, samples: [sample] }],
      [`/admin/w3-delivery-policy/versions/${id}/activate`, { expectedRevision: 1, previewId: receipt.preview.id, acknowledged: true }],
      [`/admin/w3-delivery-policy/versions/${id}/retire`, { expectedRevision: 2 }],
    ]);
    expect(patch.mock.calls[0]).toEqual([`/admin/w3-delivery-policy/versions/drafts/${id}`, { expectedRevision: 1, parameters }]);
  });
  it.each(['id', 'draftId', 'revision', 'receipt'])('rejects lifecycle preview with mismatched %s', async field => {
    const value = persistedPreview();
    if (field === 'id') value.preview.id = 'bad';
    if (field === 'draftId') value.preview.draftId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    if (field === 'revision') value.preview.impact.policyRevision = 9;
    if (field === 'receipt') value.preview.impact.effectivePolicy = {};
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: envelope(value).data, status: 200 });
    await expect(w3DeliveryPolicyApi.saveLifecyclePreview(lifecycleVersion(), [sample])).rejects.toThrow();
  });
  it.each(['DRAFT', 'ACTIVE', 'RETIRED'])('rejects invalid or missing activation provenance for %s history', async status => {
    const value = versionHistory([lifecycleVersion(status, 1)]);
    if (status === 'ACTIVE') delete (value.versions[0] as { activationPreviewId?: string }).activationPreviewId;
    if (status !== 'ACTIVE') (value.versions[0] as { activationPreviewId?: string }).activationPreviewId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: envelope(value).data, status: 200 });
    await expect(w3DeliveryPolicyApi.lifecycleHistory()).rejects.toThrow();
  });
  it.each([201, 200])('requires create response status 201, received %s', async status => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: envelope(versionCurrent(), status).data, status });
    if (status === 201) await expect(w3DeliveryPolicyApi.startLifecycle(0, parameters)).resolves.toBeDefined();
    else await expect(w3DeliveryPolicyApi.startLifecycle(0, parameters)).rejects.toThrow();
  });
  it.each([
    { status: 'DRAFT' as const, revision: 2, previewId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    { status: 'ACTIVE' as const, revision: 3, previewId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
  ])('rejects activation response whose status, revision, or receipt provenance differs', async result => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: envelope(versionCurrent(lifecycleVersion(result.status, result.revision))).data, status: 200 });
    await expect(w3DeliveryPolicyApi.activate(id, 1, result.previewId)).rejects.toThrow();
  });
  it.each([403, 409, 503])('preserves lifecycle HTTP %s for a fail-closed page response', async status => {
    const error = { response: { status } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(error);
    await expect(w3DeliveryPolicyApi.lifecycleCurrent()).rejects.toBe(error);
  });
  it.each([{ success: false }, { statusCode: 503 }, { statusCode: '200' }])('rejects conflicting envelope metadata %j', async (metadata) => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { ...envelope(current()).data, ...metadata } });
    await expect(w3DeliveryPolicyApi.current()).rejects.toThrow();
  });
  it.each([true, false])('rejects a known courier review flag %s for unknown evidence age', async (value) => {
    const result = preview();
    Object.assign(result.proposals[0]!, { courierEvidenceReviewDue: value });
    vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(result));
    await expect(w3DeliveryPolicyApi.preview(draft(), [sample])).rejects.toThrow();
  });
  it('denies write without config:update even if submitted programmatically', async () => {
    vi.spyOn(useAuthStore(), 'hasPermission').mockImplementation(permission => permission === 'config:read');
    mockLegacyGet();
    const patch = vi.spyOn(apiClient, 'patch');
    const wrapper = await mountPage();
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit');
    expect(patch).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('reads the canonical envelope and an explicit empty draft without defaults', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(envelope(current())).mockResolvedValueOnce(envelope({ ...inert, draft: null }));
    expect((await w3DeliveryPolicyApi.current()).draft?.state.revision).toBe(1);
    expect((await w3DeliveryPolicyApi.current()).draft).toBeNull();
    expect(get.mock.calls[0]?.[0]).toBe('/admin/w3-delivery-policy/current');
  });
  it.each(['fingerprint', 'status', 'parameters', 'mode', 'effective', 'blockers', 'policyId', 'revision', 'extra'])('rejects unsafe %s instead of opening the form', async (field) => {
    const data = current();
    if (field === 'fingerprint') data.draft.state.policy.fingerprint = 'a'.repeat(64);
    if (field === 'status') data.draft.state.status = 'ACTIVE';
    if (field === 'parameters') data.draft.state.policy.parameters.feeCeilingVnd = -1;
    if (field === 'mode') data.mode = 'EXECUTABLE';
    if (field === 'effective') Object.assign(data, { effectivePolicy: {} });
    if (field === 'blockers') data.blockers = [];
    if (field === 'policyId') data.draft.state.policy.policyId = 'other';
    if (field === 'revision') data.draft.state.revision = 2;
    if (field === 'extra') Object.assign(data.draft.state, { approved: true });
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(data));
    await expect(w3DeliveryPolicyApi.current()).rejects.toThrow();
  });
  it.each([{}, { data: current() }, { data: { data: null } }])('rejects a malformed envelope', async (data) => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(data);
    await expect(w3DeliveryPolicyApi.current()).rejects.toThrow();
  });
  it.each([404, 503])('preserves HTTP %s for unavailable UI', async (status) => {
    const error = { response: { status } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(error);
    await expect(w3DeliveryPolicyApi.current()).rejects.toBe(error);
  });
  it('supports only current/history/create/revise/preview with exact payloads', async () => {
    expect(Object.keys(w3DeliveryPolicyApi).sort()).toEqual(['activate', 'create', 'current', 'history', 'lifecycleCurrent', 'lifecycleHistory', 'preview', 'retire', 'revise', 'reviseLifecycle', 'saveLifecyclePreview', 'startLifecycle']);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(envelope(current())).mockResolvedValueOnce(envelope(preview()));
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue(envelope({ ...inert, draft: draft(2) }));
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...inert, drafts: [draft()] }));
    await w3DeliveryPolicyApi.create(parameters);
    await w3DeliveryPolicyApi.revise(id, 1, parameters);
    const history = await w3DeliveryPolicyApi.history();
    const result = await w3DeliveryPolicyApi.preview(draft(), [sample]);
    expect(post.mock.calls[0]).toEqual(['/admin/w3-delivery-policy/drafts', { expectedRevision: 0, parameters }]);
    expect(patch.mock.calls[0]).toEqual([`/admin/w3-delivery-policy/drafts/${id}`, { expectedRevision: 1, parameters }]);
    expect(get.mock.calls[0]?.[0]).toBe('/admin/w3-delivery-policy/history');
    expect(history.drafts[0]?.state.revision).toBe(1);
    expect(history.blockers).toEqual(inert.blockers);
    expect(post.mock.calls[1]).toEqual(['/admin/w3-delivery-policy/preview', { draftId: id, expectedRevision: 1, samples: [sample] }]);
    expect(result.proposals[0]?.customerShippingShare).toBe(14000);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '20000', null])('rejects invalid parameter %s before transport', async (fee) => {
    const post = vi.spyOn(apiClient, 'post');
    await expect(w3DeliveryPolicyApi.create({ ...parameters, feeCeilingVnd: fee } as never)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it.each([
    { blockers: [] },
    { drafts: [draft(1), draft(2)] },
    { drafts: [draft(), draft()] },
    { drafts: Array.from({ length: 21 }, (_, index) => draft(21 - index)) },
  ])('rejects unsafe history response %j', async (change) => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...inert, drafts: [draft()], ...change }));
    await expect(w3DeliveryPolicyApi.history()).rejects.toThrow();
  });
  it.each(['hypothetical', 'binding', 'snapshot', 'sample', 'share'])('rejects unsafe preview %s', async (field) => {
    const result = preview();
    if (field === 'hypothetical') Object.assign(result, { hypotheticalOnly: false });
    if (field === 'binding') result.policyRevision = 2;
    if (field === 'snapshot') result.proposals[0]!.policySnapshot.fingerprint = '0'.repeat(64);
    if (field === 'sample') result.proposals[0]!.shippingFeeVnd = 100;
    if (field === 'share') result.proposals[0]!.customerShippingShare = -1;
    vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(result));
    await expect(w3DeliveryPolicyApi.preview(draft(), [sample])).rejects.toThrow();
  });
});

describe('W3 Admin UI and actor boundary', () => {
  it('shows lifecycle versions, server receipt, activation acknowledgement, and retirement only for the current actor', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (path === '/admin/w3-delivery-policy/versions/current') return { data: envelope(versionCurrent()).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/versions/history') return { data: envelope(versionHistory()).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/current') return envelope({ ...inert, draft: null }) as never;
      return envelope({ ...inert, drafts: [] }) as never;
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async (path, body) => {
      if (String(path).endsWith('/preview')) {
        const value = persistedPreview();
        value.preview.impact.proposals[0]!.proposalId = (body as { samples: typeof sample[] }).samples[0]!.proposalId;
        return { data: envelope(value).data, status: 200 } as never;
      }
      if (String(path).endsWith('/activate')) return { data: envelope(versionCurrent(lifecycleVersion('ACTIVE', 2))).data, status: 200 } as never;
      return { data: envelope(versionCurrent(lifecycleVersion('RETIRED', 3))).data, status: 200 } as never;
    });
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="lifecycle-history"]').text()).toContain('ACTIVE');
    expect(wrapper.get('[data-testid="lifecycle-history"]').text()).toContain('RETIRED');
    for (const [key, value] of Object.entries(sample)) if (value !== null) await wrapper.get(`#lifecycle-${key}`).setValue(String(value));
    await wrapper.get('[data-testid="lifecycle-preview-form"]').trigger('submit'); await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lifecycle-preview-receipt"]').exists()).toBe(true));
    expect(wrapper.get('[data-testid="lifecycle-preview-receipt"]').text()).toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(wrapper.text()).toContain('ACTIVE chỉ là cấu hình vận hành');
    await wrapper.get('[data-testid="lifecycle-activate-confirm"]').setValue(true);
    await wrapper.get('#lifecycle-proposalId').setValue('manual:changed');
    expect(wrapper.find('[data-testid="lifecycle-preview-receipt"]').exists()).toBe(false);
    await wrapper.get('[data-testid="lifecycle-preview-form"]').trigger('submit'); await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lifecycle-preview-receipt"]').exists()).toBe(true));
    await wrapper.get('[data-testid="lifecycle-activate-confirm"]').setValue(true);
    await wrapper.get('[data-testid="activate-lifecycle"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Tài chính 70/30 vẫn bị khóa');
    expect(wrapper.text()).not.toContain('Finance 70/30 remains blocked');
    wrapper.unmount();
  });
  it.each(['ACTIVE', 'RETIRED'] as const)('prevents legacy create controls when lifecycle head is %s', async status => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (path === '/admin/w3-delivery-policy/versions/current') return { data: envelope(versionCurrent(lifecycleVersion(status, status === 'ACTIVE' ? 2 : 3))).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/versions/history') return { data: envelope(versionHistory()).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/current') return envelope({ ...inert, draft: null }) as never;
      return envelope({ ...inert, drafts: [] }) as never;
    });
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="draft-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="legacy-lifecycle-locked"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="lifecycle-history"]').text()).toContain('ACTIVE');
    expect(wrapper.text()).toContain('Tài chính 70/30 vẫn bị khóa');
    expect(wrapper.text()).not.toContain('Finance 70/30 remains blocked');
    wrapper.unmount();
  });
  it.each([404, 503])('hides lifecycle mutations after lifecycle API %s', async status => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (String(path).includes('/versions/')) throw { response: { status } };
      if (path === '/admin/w3-delivery-policy/current') return envelope(current()) as never;
      return envelope({ ...inert, drafts: [draft()] }) as never;
    });
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="lifecycle-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="draft-form"]').exists()).toBe(status === 404);
    expect(wrapper.text()).toContain('NOT_AVAILABLE');
    wrapper.unmount();
  });
  it('does not offer reactivation after an immutable RETIRED lifecycle version', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (path === '/admin/w3-delivery-policy/versions/current') return { data: envelope(versionCurrent(lifecycleVersion('RETIRED', 3))).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/versions/history') return { data: envelope(versionHistory()).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/current') return envelope({ ...inert, draft: null }) as never;
      return envelope({ ...inert, drafts: [] }) as never;
    });
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="activate-lifecycle"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="retire-lifecycle"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lifecycle-parameters-form"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="lifecycle-parameters-form"]').text()).toContain('Tạo DRAFT lifecycle');
    expect(wrapper.text()).toContain('không thể kích hoạt lại');
    wrapper.unmount();
  });
  it('retires the ACTIVE head by revision CAS and then offers no reactivation', async () => {
    let head = lifecycleVersion('ACTIVE', 2);
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (path === '/admin/w3-delivery-policy/versions/current') return { data: envelope(versionCurrent(head)).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/versions/history') return { data: envelope(versionHistory([head])).data, status: 200 } as never;
      if (path === '/admin/w3-delivery-policy/current') return envelope({ ...inert, draft: null }) as never;
      return envelope({ ...inert, drafts: [] }) as never;
    });
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async path => {
      if (String(path).endsWith('/retire')) {
        head = lifecycleVersion('RETIRED', 3);
        return { data: envelope(versionCurrent(head)).data, status: 200 } as never;
      }
      return { data: envelope(versionCurrent(head)).data, status: 200 } as never;
    });
    const wrapper = await mountPage();
    // Lifecycle data can render after the legacy page resolves under CI concurrency.
    await vi.waitFor(() => expect(wrapper.find('[data-testid="retire-lifecycle"]').exists()).toBe(true));
    await wrapper.get('[data-testid="retire-lifecycle"]').trigger('click'); await flushPromises();
    expect(post).toHaveBeenCalledWith('/admin/w3-delivery-policy/versions/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/retire', { expectedRevision: 2 });
    await vi.waitFor(() => {
      expect(wrapper.get('[aria-labelledby="lifecycle-current-title"]').text()).toContain('RETIRED');
      expect(wrapper.find('[data-testid="activate-lifecycle"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="retire-lifecycle"]').exists()).toBe(false);
    });
    wrapper.unmount();
  });
  it('clears lifecycle versions and ignores late responses after the Admin account changes', async () => {
    const currentResolvers: ((value: unknown) => void)[] = [];
    const historyResolvers: ((value: unknown) => void)[] = [];
    vi.spyOn(apiClient, 'get').mockImplementation(path => {
      if (path === '/admin/w3-delivery-policy/versions/current') return new Promise(resolve => { currentResolvers.push(resolve); });
      if (path === '/admin/w3-delivery-policy/versions/history') return new Promise(resolve => { historyResolvers.push(resolve); });
      if (path === '/admin/w3-delivery-policy/current') return Promise.resolve(envelope({ ...inert, draft: null }) as never);
      return Promise.resolve(envelope({ ...inert, drafts: [] }) as never);
    });
    const wrapper = mount(Page, { global: { stubs: { RouterLink: true } } });
    const auth = useAuthStore();
    await vi.waitFor(() => expect(currentResolvers).toHaveLength(1));
    auth.user = { ...auth.user!, id: 'admin-b' };
    await flushPromises();
    currentResolvers[0]!({ data: envelope(versionCurrent()).data, status: 200 });
    historyResolvers[0]!({ data: envelope(versionHistory()).data, status: 200 });
    await flushPromises();
    expect(wrapper.find('[data-testid="lifecycle-section"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(['CUSTOMER', 'TECHNICIAN', 'SERVICE_MANAGER', 'ADMIN'])('gates navigation and actual guard for %s', async (role) => {
    const route = router.resolve('/console/admin/w3-delivery-policy');
    expect(route.name).toBe('admin-w3-delivery-policy');
    expect(route.meta.roles).toEqual(['ADMIN']);
    const auth = useAuthStore();
    vi.spyOn(auth, 'isAuthenticated', 'get').mockReturnValue(true);
    vi.spyOn(auth, 'hasAnyRole').mockImplementation(roles => roles.includes(role));
    vi.spyOn(auth, 'hasPermission').mockReturnValue(true);
    const next = vi.fn();
    await authGuard(route as never, route as never, next);
    expect(next.mock.calls[0]).toEqual(role === 'ADMIN' ? [] : ['/403']);
    const nav = consoleNavigation(role).flatMap(g => g.items);
    expect(nav.some(i => i.label === 'Cấu hình giao hàng')).toBe(role === 'ADMIN');
  });
  it.each([404, 503])('hides forms for NOT_AVAILABLE %s', async (status) => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({ response: { status } });
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('NOT_AVAILABLE');
    expect(wrapper.find('form').exists()).toBe(false); wrapper.unmount();
  });
  it('shows read-only versioned history and selects the matching snapshot detail', async () => {
    const get = mockLegacyGet(current(), { ...inert, drafts: [draft(2), draft()] });
    const wrapper = await mountPage();
    expect(get.mock.calls.map(([path]) => path).filter(path => !String(path).includes('/versions/'))).toEqual([
      '/admin/w3-delivery-policy/current',
      '/admin/w3-delivery-policy/history',
    ]);
    expect(wrapper.get('[data-testid="history-detail"]').text()).toContain('Lần sửa 2');
    expect(wrapper.get('[data-testid="history-detail"]').text()).toContain('Tài chính bị khóa');
    expect(wrapper.get('[data-testid="history-detail"]').text()).toContain('Pháp lý chưa xác minh');
    expect(wrapper.find('[data-testid="history-detail"] button').exists()).toBe(false);
    await wrapper.get('select[aria-label="Chọn phiên bản bản nháp"]').setValue(id);
    expect(wrapper.get('[data-testid="history-detail"]').text()).toContain('Lần sửa 1');
    wrapper.unmount();
  });
  it.each([404, 503])('reports history HTTP %s safely and keeps current draft controls', async (status) => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (String(path).includes('/versions/')) throw { response: { status: 404 } };
      if (path === '/admin/w3-delivery-policy/current') return envelope(current()) as never;
      throw { response: { status } };
    });
    const wrapper = await mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain('NOT_AVAILABLE');
    expect(wrapper.find('form[data-testid="draft-form"]').exists()).toBe(true);
    expect(wrapper.find('form[data-testid="preview-form"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('clears history and ignores a late response after the signed-in role changes', async () => {
    let resolveHistory!: (value: unknown) => void;
    const get = vi.spyOn(apiClient, 'get').mockImplementation(path => {
      if (String(path).includes('/versions/')) return Promise.reject({ response: { status: 404 } });
      if (path === '/admin/w3-delivery-policy/current') return Promise.resolve(envelope(current()) as never);
      return new Promise(resolve => { resolveHistory = resolve; });
    });
    const wrapper = mount(Page, { global: { stubs: { RouterLink: true } } });
    await vi.waitFor(() => expect(get.mock.calls.filter(([path]) => !String(path).includes('/versions/'))).toHaveLength(2));
    const auth = useAuthStore();
    auth.user = { ...auth.user!, role: 'TECHNICIAN' };
    await flushPromises();
    expect(wrapper.find('[data-testid="history-section"]').exists()).toBe(false);
    resolveHistory(envelope({ ...inert, drafts: [draft()] }));
    await flushPromises();
    expect(wrapper.text()).not.toContain('Lần sửa 1');
    wrapper.unmount();
  });
  it('starts blank, validates and prevents double save or premature success', async () => {
    mockLegacyGet({ ...inert, draft: null }, { ...inert, drafts: [] });
    let resolve!: (value: unknown) => void;
    const post = vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise(r => { resolve = r; }));
    const wrapper = await mountPage();
    expect(wrapper.get('#feeCeilingVnd').element).toHaveProperty('value', '');
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit');
    expect(post).not.toHaveBeenCalled();
    for (const [key, value] of Object.entries(parameters)) await wrapper.get(`#${key}`).setValue(String(value));
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit');
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit');
    expect(post).toHaveBeenCalledTimes(1); expect(wrapper.text()).not.toContain('Đã lưu bản nháp');
    resolve(envelope(current())); await flushPromises();
    await vi.waitFor(() => expect(wrapper.text()).toContain('Đã lưu bản nháp')); wrapper.unmount();
  });
  it('retains input on conflict, blocks another save and reloads explicitly', async () => {
    const get = mockLegacyGet();
    const patch = vi.spyOn(apiClient, 'patch').mockRejectedValue({ response: { status: 409 } });
    const wrapper = await mountPage();
    await wrapper.get('#feeCeilingVnd').setValue('12345');
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit'); await flushPromises();
    expect(wrapper.get('#feeCeilingVnd').element).toHaveProperty('value', '12345');
    expect(wrapper.text()).toContain('tải lại');
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit');
    expect(patch).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="reload"]').trigger('click'); await flushPromises();
    await vi.waitFor(() => expect(get.mock.calls.filter(([path]) => !String(path).includes('/versions/'))).toHaveLength(4));
    wrapper.unmount();
  });
  it('requires manual samples and displays only confirmed hypothetical server results', async () => {
    mockLegacyGet();
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(preview()));
    const wrapper = await mountPage();
    expect(post).not.toHaveBeenCalled();
    for (const [key, value] of Object.entries(sample)) if (value !== null) await wrapper.get(`#${key}`).setValue(String(value));
    await wrapper.get('form[data-testid="preview-form"]').trigger('submit'); await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="preview-result"]').exists()).toBe(true));
    expect(post).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('giả định');
    expect(wrapper.text()).toContain('không phải số tiền được duyệt');
    await wrapper.get('#shippingFeeVnd').setValue('30000');
    expect(wrapper.find('[data-testid="preview-result"]').exists()).toBe(false); wrapper.unmount();
  });
});
