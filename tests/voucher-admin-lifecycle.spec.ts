import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { vouchersApi, type VoucherCampaign } from '../src/api/vouchers.api';
import { campaignOffer } from '../src/components/vouchers/voucher-model';
import ConsoleVoucherWorkspace from '../src/components/vouchers/ConsoleVoucherWorkspace.vue';

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
const policy = {
  discount: 'FIXED' as const, value: 10000, capVnd: 10000, minimumVnd: 1,
  categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] as ['LABOR', 'PARTS'],
};
const fixture: VoucherCampaign = {
  id: '35acbd0e-e3c0-4f57-a691-1836b32b64a9',
  code: 'BANMOI', name: 'Khách hàng mới', kind: 'GENERAL',
  active: false, status: 'DRAFT', version: 1, publishedAt: null,
  startsAt: '2026-10-26T09:00:00+07:00', endsAt: '2026-11-26T23:59:59+07:00',
  policy, quota: 100, redeemed: 0,
};
const envelope = (value: unknown) => ({ data: { success: true, data: value } });
const commandId = '87643cba-0a32-40fe-93a7-05df2ab83315';

beforeEach(() => vi.resetAllMocks());

describe('admin voucher draft lifecycle contract', () => {
  it('accepts DRAFT metadata and never counts stored claims as successful uses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope([fixture]));
    const rows = await vouchersApi.campaigns();
    expect(rows).toHaveLength(1);
    const offer = campaignOffer(rows[0]);
    expect(offer).toMatchObject({
      campaignLifecycle: 'DRAFT', campaignVersion: 1,
      successfulRedemptionLimit: 100, redeemed: 0, campaignActive: false,
    });
  });

  it('sends only approved draft terms plus version/command and publishes via lifecycle API', async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(envelope({ ...fixture, version: 2 }))
      .mockResolvedValueOnce(envelope({ ...fixture, status: 'PUBLISHED', active: true, version: 3 }));
    const terms = {
      code: 'BANMOI', name: 'Khách hàng mới', kind: 'GENERAL' as const,
      discount: 'FIXED' as const, value: 10000, capVnd: 10000, minimumVnd: 1,
      categoryIds: [], serviceIds: [], startsAt: fixture.startsAt, endsAt: fixture.endsAt, quota: 100,
      version: 1, commandId,
    };
    await vouchersApi.updateCampaign(fixture.id, terms);
    expect(apiClient.patch).toHaveBeenNthCalledWith(1, `/vouchers/campaigns/${fixture.id}`, terms);
    await vouchersApi.transitionCampaign(fixture.id, { status: 'PUBLISHED', version: 2, commandId });
    expect(apiClient.patch).toHaveBeenNthCalledWith(2, `/vouchers/campaigns/${fixture.id}/lifecycle`, {
      status: 'PUBLISHED', version: 2, commandId,
    });
    expect(vi.mocked(apiClient.patch).mock.calls.map((c) => c[1])).not.toContainEqual(
      expect.objectContaining({ redeemed: expect.any(Number) }),
    );
  });

  it('renders draft editing/publishing and never offers editing after publication', async () => {
    const props = { state: 'ready' as const, connected: true, canManage: true, campaigns: [campaignOffer(fixture)] };
    const w = mount(ConsoleVoucherWorkspace, {
      props, global: { stubs: { VoucherGrantForm: true, VoucherStatePanel: true } },
    });
    await w.get('button').trigger('focus');
    expect(w.text()).toContain('Bản nháp');
    const edit = w.findAll('button').find((b) => b.text() === 'Sửa bản nháp');
    expect(edit?.exists()).toBe(true);
    await edit!.trigger('click');
    await w.get('#voucher-campaign-title').setValue('Khách hàng mới 2');
    await w.get('#voucher-create-form').trigger('submit');
    await flushPromises();
    const event = w.emitted('updateDraftCampaign')?.[0];
    expect(event?.[0]).toBe(fixture.id);
    expect(event?.[1]).toEqual(expect.objectContaining({ title: 'Khách hàng mới 2', successfulRedemptionLimit: 100 }));
    await w.findAll('button').find((b) => b.text() === 'Phát hành')!.trigger('click');
    expect(w.emitted('transitionCampaign')?.[0]).toEqual([fixture.id, 'PUBLISHED']);

    await w.setProps({ campaigns: [campaignOffer({ ...fixture, active: true, status: 'PUBLISHED', version: 2 })] });
    expect(w.findAll('button').some((b) => b.text() === 'Sửa bản nháp')).toBe(false);
    expect(w.findAll('button').some((b) => b.text() === 'Lưu trữ')).toBe(true);
    w.unmount();
  });

  it('does not provide archive or publish actions for an already archived campaign', () => {
    const w = mount(ConsoleVoucherWorkspace, {
      props: { state: 'ready', canManage: true, connected: true, campaigns: [
        campaignOffer({ ...fixture, active: false, status: 'ARCHIVED', version: 8 }),
      ] }, global: { stubs: { VoucherGrantForm: true, VoucherStatePanel: true } },
    });
    expect(w.text()).toContain('Đã lưu trữ');
    expect(w.findAll('button').some((b) => b.text() === 'Phát hành' || b.text() === 'Lưu trữ')).toBe(false);
    w.unmount();
  });
});
