import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// Check-in with the face camera, then before/after photos by camera only (PO 11/10/2026).

const { mockGet, mockPost, getBestPosition } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  getBestPosition: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  default: { get: mockGet, post: mockPost, patch: vi.fn().mockResolvedValue({ data: { data: {} } }), delete: vi.fn() },
}));
vi.mock('../src/utils/best-position', () => ({ getBestPosition }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'job-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }),
}));

import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';

/** Stands in for the real camera: one button hands the page a JPEG, like "Dùng ảnh này". */
const CameraStub = defineComponent({
  name: 'CameraCapture',
  props: { mode: { type: String, required: true }, title: { type: String, required: true } },
  emits: ['capture', 'close'],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'camera', 'data-mode': props.mode, 'data-title': props.title }, [
        h('button', { 'data-testid': 'camera-use', onClick: () => emit('capture', new File(['jpeg'], 'shot.jpg', { type: 'image/jpeg' })) }, 'Dùng ảnh này'),
      ]);
  },
});

const stubs = {
  FhButton: { props: ['disabled', 'loading', 'variant'], template: '<button :disabled="disabled"><slot /></button>' },
  FhCard: { template: '<section><slot /></section>' },
  FhStatusPill: { props: ['status'], template: '<span>{{ status }}</span>' },
  FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' },
  BookingMediaViewer: true,
  TechnicianPartsSection: true,
  OrderComplaintPanel: true,
  CameraCapture: CameraStub,
};

const baseOrder = {
  id: 'job-1',
  code: 'SO-1',
  bookingId: 'booking-1',
  serviceName: 'Sửa máy giặt',
  status: 'EN_ROUTE',
  customerName: 'Khách',
  customerPhone: '0900000000',
  addressSummary: 'Quận 1',
  scheduledAt: '2026-10-11T08:00:00Z',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  paymentStatus: 'UNPAID',
  createdAt: '2026-10-10T00:00:00Z',
};

type Evidence = { id: string; type: string; mediaUrl: string };

/** Server state the mocks read and the posts change. */
let server: { order: Record<string, unknown>; evidence: Evidence[]; checkInResult: Record<string, unknown>; failEvidence: boolean };

const posts = (suffix: string) => mockPost.mock.calls.filter(([url]) => String(url).endsWith(suffix));
const evidenceTypesPosted = () => posts('/evidence').map(([, form]) => (form as FormData).get('type'));
const now = (w: ReturnType<typeof mount>) => w.get('[data-testid="job-now"]');
const primary = (w: ReturnType<typeof mount>, label: string) => {
  const button = now(w).findAll('button').find((b) => b.text().trim() === label);
  if (!button) throw new Error(`no primary button "${label}" in: ${now(w).text()}`);
  return button;
};

async function mountPage() {
  const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

async function shoot(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="camera-use"]').trigger('click');
  await flushPromises();
}

beforeEach(() => {
  server = { order: { ...baseOrder, arrivalVerified: false }, evidence: [], checkInResult: { result: 'valid' }, failEvidence: false };
  mockGet.mockReset().mockImplementation(async (path: string) => {
    if (path === '/service-orders/job-1') return { data: { data: server.order } };
    if (path === '/service-orders/job-1/evidence') return { data: { data: server.evidence } };
    if (path === '/service-orders/job-1/cash-settlement') return { data: { data: null } };
    return { data: { data: [] } };
  });
  mockPost.mockReset().mockImplementation(async (path: string, body: unknown) => {
    if (path === '/service-orders/job-1/check-in') {
      if (server.checkInResult.result === 'valid') server.order = { ...server.order, arrivalVerified: true };
      return { data: { data: server.checkInResult } };
    }
    if (path === '/service-orders/job-1/evidence') {
      if (server.failEvidence) throw { response: { status: 500 } };
      const type = String((body as FormData).get('type'));
      server.evidence = [...server.evidence, { id: `e${server.evidence.length + 1}`, type, mediaUrl: `https://img.test/${type}.jpg` }];
      return { data: { data: {} } };
    }
    if (path === '/service-orders/job-1/request-completion') {
      server.order = { ...server.order, completionRequestedAt: '2026-10-11T10:00:00Z' };
      return { data: { data: {} } };
    }
    return { data: { data: {} } };
  });
  getBestPosition.mockReset().mockResolvedValue({ lat: 10.77, lng: 106.7, accuracyMeters: 850 });
});

describe('technician check-in with the face camera', () => {
  it('shows "Check-in" with no file input; it opens the face camera, not a picker', async () => {
    const wrapper = await mountPage();
    expect(now(wrapper).text()).toContain('Đang đến nhà khách');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="camera"]').exists()).toBe(false);

    await primary(wrapper, 'Check-in').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('face');
    expect(getBestPosition).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('a valid check-in sends the real GPS fix, then stores the face as checkin_face and moves on', async () => {
    const wrapper = await mountPage();
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);

    expect(wrapper.find('[data-testid="camera"]').exists()).toBe(false);
    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-1/check-in', { lat: 10.77, lng: 106.7, accuracyMeters: 850 });
    expect(evidenceTypesPosted()).toEqual(['checkin_face']);
    const order = mockPost.mock.calls.map(([url]) => String(url));
    expect(order.indexOf('/service-orders/job-1/check-in')).toBeLessThan(order.indexOf('/service-orders/job-1/evidence'));
    expect(now(wrapper).text()).toContain('Chụp ảnh máy trước khi sửa');
    expect(wrapper.text()).toContain('Đã check-in.');

    // Step 2 lists the check-in and the face photo.
    await wrapper.get('[data-testid="steps-toggle"]').trigger('click');
    await wrapper.get('[data-testid="step-row-2"]').trigger('click');
    const detail = wrapper.get('[data-testid="step-detail-2"]');
    expect(detail.text()).toContain('Đã check-in đúng địa chỉ.');
    expect(detail.get('[data-testid="checkin-face-photos"] img').attributes('src')).toBe('https://img.test/checkin_face.jpg');
    wrapper.unmount();
  });

  it('out of the geofence: the distance in km, and no face photo stored', async () => {
    server.checkInResult = { result: 'out_of_geofence', distanceMeters: 6340 };
    const wrapper = await mountPage();
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);

    expect(wrapper.text()).toContain('Bạn đang cách địa chỉ khách khoảng 6,3 km. Hãy đến đúng địa chỉ rồi check-in lại.');
    expect(posts('/evidence')).toHaveLength(0);
    expect(now(wrapper).text()).toContain('Đang đến nhà khách');
    expect(primary(wrapper, 'Check-in').exists()).toBe(true);
    wrapper.unmount();
  });

  it('out of the geofence without a distance: the same advice without a number', async () => {
    server.checkInResult = { result: 'out_of_geofence' };
    const wrapper = await mountPage();
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);
    expect(wrapper.text()).toContain('Bạn đang ở xa địa chỉ khách. Hãy đến đúng địa chỉ rồi check-in lại.');
    expect(wrapper.text()).not.toMatch(/\d km/);
    wrapper.unmount();
  });

  it('low accuracy and a failed check-in give one plain line each', async () => {
    server.checkInResult = { result: 'low_accuracy' };
    const wrapper = await mountPage();
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);
    expect(wrapper.text()).toContain('Định vị chưa đủ chính xác. Bật GPS/Wi-Fi rồi thử lại.');

    server.checkInResult = { result: 'failed' };
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);
    expect(wrapper.text()).toContain('Chưa check-in được. Vui lòng thử lại.');
    expect(posts('/evidence')).toHaveLength(0);
    wrapper.unmount();
  });

  it('no GPS position: asks to allow location, and does not call check-in', async () => {
    getBestPosition.mockRejectedValueOnce(new Error('denied'));
    const wrapper = await mountPage();
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);
    expect(wrapper.text()).toContain('Không lấy được vị trí. Hãy cho phép trình duyệt dùng vị trí rồi thử lại.');
    expect(posts('/check-in')).toHaveLength(0);
    expect(posts('/evidence')).toHaveLength(0);
    wrapper.unmount();
  });

  it('valid check-in but the face upload fails: the next action takes the face again', async () => {
    server.failEvidence = true;
    const wrapper = await mountPage();
    await primary(wrapper, 'Check-in').trigger('click');
    await shoot(wrapper);

    expect(posts('/check-in')).toHaveLength(1);
    expect(wrapper.text()).toContain('Đã check-in nhưng chưa lưu được ảnh khuôn mặt.');
    expect(now(wrapper).text()).toContain('Chụp khuôn mặt check-in');

    server.failEvidence = false;
    await primary(wrapper, 'Chụp khuôn mặt check-in').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('face');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['checkin_face', 'checkin_face']);
    expect(posts('/check-in')).toHaveLength(1);
    expect(now(wrapper).text()).toContain('Chụp ảnh máy trước khi sửa');
    wrapper.unmount();
  });
});

describe('job photos only through the camera', () => {
  it('checked in without a face photo: "Chụp khuôn mặt check-in" before anything else', async () => {
    server.order = { ...baseOrder, arrivalVerified: true };
    const wrapper = await mountPage();
    expect(now(wrapper).text()).toContain('Chụp khuôn mặt check-in');
    expect(now(wrapper).text()).not.toContain('Chụp ảnh máy');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('"Chụp ảnh máy" opens the product camera and uploads a before photo', async () => {
    server.order = { ...baseOrder, arrivalVerified: true };
    server.evidence = [{ id: 'f1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' }];
    const wrapper = await mountPage();
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);

    await primary(wrapper, 'Chụp ảnh máy').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('product');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['before']);
    expect(posts('/check-in')).toHaveLength(0);
    expect(wrapper.text()).toContain('Đã lưu ảnh.');
    wrapper.unmount();
  });

  it('more before photos come from the camera too', async () => {
    server.order = { ...baseOrder, arrivalVerified: true };
    server.evidence = [
      { id: 'f1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' },
      { id: 'b1', type: 'before', mediaUrl: 'https://img.test/before.jpg' },
    ];
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="before-evidence-picker"]').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('product');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['before']);
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('"Hoàn thành (chụp ảnh sau sửa)" takes the after photo by camera, then asks for completion', async () => {
    server.order = { ...baseOrder, status: 'UNDER_REPAIR', arrivalVerified: true, beforeEvidenceCount: 1 };
    server.evidence = [{ id: 'b1', type: 'before', mediaUrl: 'https://img.test/before.jpg' }];
    const wrapper = await mountPage();
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);

    await primary(wrapper, 'Hoàn thành (chụp ảnh sau sửa)').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('product');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['after']);
    expect(posts('/request-completion')).toHaveLength(1);
    expect(now(wrapper).text()).toContain('Thu tiền');

    // Another after photo from the photos section also uses the camera.
    await wrapper.get('[data-testid="after-evidence-picker"]').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('product');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['after', 'after']);
    expect(posts('/request-completion')).toHaveLength(1);
    wrapper.unmount();
  });

  it('closing the camera stores nothing', async () => {
    server.order = { ...baseOrder, arrivalVerified: true };
    server.evidence = [{ id: 'f1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' }];
    const wrapper = await mountPage();
    await primary(wrapper, 'Chụp ảnh máy').trigger('click');
    wrapper.findComponent({ name: 'CameraCapture' }).vm.$emit('close');
    await flushPromises();
    expect(wrapper.find('[data-testid="camera"]').exists()).toBe(false);
    expect(posts('/evidence')).toHaveLength(0);
    wrapper.unmount();
  });
});
