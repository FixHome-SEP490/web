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
const envelope = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'Success', data } });
const current = () => ({ ...inert, draft: draft() });
const sample = { proposalId: 'manual:sample', proposalVersion: 1, shippingFeeVnd: 20000, proposalAgeMinutes: 10, courierEvidenceAgeMinutes: null };
function preview() {
  return { ...inert, hypotheticalOnly: true, draftId: id, policyStatus: 'DRAFT', policyRevision: 1,
    proposals: [{ ...sample, policySnapshot: draft().state.policy, customerShippingShare: 14000, technicianShippingShare: 6000, aboveFeeCeiling: false, proposalReviewDue: false, courierEvidenceReviewDue: null }],
    totals: { shippingFeeVnd: 20000, customerShippingShare: 14000, technicianShippingShare: 6000 },
    counts: { proposals: 1, aboveFeeCeiling: 0, proposalReviewDue: 0, courierEvidenceReviewDue: 0 } };
}
beforeEach(() => { setActivePinia(createPinia()); vi.stubGlobal('crypto', webcrypto); vi.spyOn(useAuthStore(), 'hasPermission').mockReturnValue(true); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mountPage() {
  const wrapper = mount(Page, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Đang tải…'));
  await flushPromises();
  return wrapper;
}

describe('W3 Admin policy boundary', () => {
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
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(current()));
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
    expect(Object.keys(w3DeliveryPolicyApi).sort()).toEqual(['create', 'current', 'history', 'preview', 'revise']);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(envelope(current())).mockResolvedValueOnce(envelope(preview()));
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue(envelope({ ...inert, draft: draft(2) }));
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...inert, drafts: [draft()] }));
    await w3DeliveryPolicyApi.create(parameters);
    await w3DeliveryPolicyApi.revise(id, 1, parameters);
    await w3DeliveryPolicyApi.history();
    const result = await w3DeliveryPolicyApi.preview(draft(), [sample]);
    expect(post.mock.calls[0]).toEqual(['/admin/w3-delivery-policy/drafts', { expectedRevision: 0, parameters }]);
    expect(patch.mock.calls[0]).toEqual([`/admin/w3-delivery-policy/drafts/${id}`, { expectedRevision: 1, parameters }]);
    expect(get.mock.calls[0]?.[0]).toBe('/admin/w3-delivery-policy/history');
    expect(post.mock.calls[1]).toEqual(['/admin/w3-delivery-policy/preview', { draftId: id, expectedRevision: 1, samples: [sample] }]);
    expect(result.proposals[0]?.customerShippingShare).toBe(14000);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '20000', null])('rejects invalid parameter %s before transport', async (fee) => {
    const post = vi.spyOn(apiClient, 'post');
    await expect(w3DeliveryPolicyApi.create({ ...parameters, feeCeilingVnd: fee } as never)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
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
  it('starts blank, validates and prevents double save or premature success', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...inert, draft: null }));
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
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(current()));
    const patch = vi.spyOn(apiClient, 'patch').mockRejectedValue({ response: { status: 409 } });
    const wrapper = await mountPage();
    await wrapper.get('#feeCeilingVnd').setValue('12345');
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit'); await flushPromises();
    expect(wrapper.get('#feeCeilingVnd').element).toHaveProperty('value', '12345');
    expect(wrapper.text()).toContain('tải lại');
    await wrapper.get('form[data-testid="draft-form"]').trigger('submit');
    expect(patch).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="reload"]').trigger('click'); await flushPromises();
    expect(get).toHaveBeenCalledTimes(2); wrapper.unmount();
  });
  it('requires manual samples and displays only confirmed hypothetical server results', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(current()));
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
