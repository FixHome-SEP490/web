import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * Identity check page (PO 10/10/2026): a status the technician can read at a
 * glance, failures in plain Vietnamese with "Thử lại", never library text.
 */

const { technicianVerificationApi } = vi.hoisted(() => ({
  technicianVerificationApi: {
    getMyVerification: vi.fn(),
    requestUploadUrl: vi.fn(),
    uploadToSignedUrl: vi.fn(),
    submit: vi.fn(),
    withdraw: vi.fn(),
  },
}));

vi.mock('../src/api/technician-verification.api', () => ({ technicianVerificationApi }));

import TechnicianKycPage from '../src/pages/technician/TechnicianKycPage.vue';

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant', 'size', 'block'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  FhCard: { props: ['title'], template: '<section><h2 v-if="title">{{ title }}</h2><slot /></section>' },
  FhConfirmDialog: true,
  FhSkeleton: { template: '<div data-testid="skeleton" />' },
};

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(TechnicianKycPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

describe('Xác minh danh tính: trạng thái dễ đọc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    technicianVerificationApi.getMyVerification.mockReset();
  });

  it('loads behind a skeleton', async () => {
    technicianVerificationApi.getMyVerification.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(TechnicianKycPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="skeleton"]').length).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain('Đang tải trạng thái xác minh');
  });

  it('a failed load offers "Thử lại" and recovers', async () => {
    technicianVerificationApi.getMyVerification
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ status: 'VERIFIED', rejectionReason: null, fptDecision: null, documents: [] });
    const wrapper = await mountPage();

    expect(wrapper.text()).not.toContain('Network Error');
    expect(wrapper.text()).toContain('Không thể tải trạng thái xác minh. Vui lòng thử lại.');
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Thử lại');
    expect(retry).toBeTruthy();

    await retry!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Đã xác minh danh tính');
  });

  it('a pending request lists what was sent in words, not file names', async () => {
    technicianVerificationApi.getMyVerification.mockResolvedValue({
      status: 'PENDING',
      rejectionReason: null,
      fptDecision: 'pass',
      documents: [
        { documentType: 'citizen_id_front', fileName: 'front.jpg' },
        { documentType: 'citizen_id_back', fileName: 'back.jpg' },
        { documentType: 'face_video', fileName: 'face.webm' },
      ],
    });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Hồ sơ đang chờ duyệt');
    expect(wrapper.text()).toContain('Đã nộp: CCCD mặt trước, CCCD mặt sau, Video khuôn mặt');
    expect(wrapper.text()).not.toContain('front.jpg');
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Nộp lại')).toHaveLength(1);
  });

  it('a rejected request shows the reason above the form, once', async () => {
    technicianVerificationApi.getMyVerification.mockResolvedValue({
      status: 'REJECTED',
      rejectionReason: 'Ảnh mặt sau bị mờ.',
      fptDecision: null,
      documents: [],
    });
    const wrapper = await mountPage();
    const text = wrapper.text();

    expect(text.split('Ảnh mặt sau bị mờ.').length - 1).toBe(1);
    expect(text).toContain('Nộp hồ sơ xác minh');
  });
});
