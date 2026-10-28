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
  props: { mode: { type: String, required: true }, title: { type: String, required: true }, multiple: { type: Boolean, default: false } },
  emits: ['capture', 'close'],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'camera', 'data-mode': props.mode, 'data-title': props.title, 'data-multiple': String(props.multiple) }, [
        h('button', { 'data-testid': 'camera-use', onClick: () => emit('capture', new File(['jpeg'], 'shot.jpg', { type: 'image/jpeg' })) }, 'Dùng ảnh này'),
        h('button', { 'data-testid': 'camera-use-three', onClick: () => emit('capture', [
          new File(['one'], 'before-1.jpg', { type: 'image/jpeg' }),
          new File(['two'], 'before-2.jpg', { type: 'image/jpeg' }),
          new File(['three'], 'before-3.jpg', { type: 'image/jpeg' }),
        ]) }, 'Dùng ba ảnh'),
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
let server: { order: Record<string, unknown>; evidence: Evidence[]; partRequests: Record<string, unknown>[]; checkInResult: Record<string, unknown>; failEvidence: boolean; failEvidenceFileName: string | null; failPartRequests: boolean; failStartRepair: boolean; beforeUploadFlags: Array<{ name: string; deferAutoStart: FormDataEntryValue | null }> };

const posts = (suffix: string) => mockPost.mock.calls.filter(([url]) => String(url).endsWith(suffix));
const evidenceTypesPosted = () => posts('/evidence').map(([, form]) => (form as FormData).get('type'));
const evidenceFormsPosted = () => posts('/evidence').map(([, form]) => form as FormData);
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
  server = { order: { ...baseOrder, arrivalVerified: false }, evidence: [], partRequests: [], checkInResult: { result: 'valid' }, failEvidence: false, failEvidenceFileName: null, failPartRequests: false, failStartRepair: false, beforeUploadFlags: [] };
  mockGet.mockReset().mockImplementation(async (path: string) => {
    if (path === '/finance/cash-intents/SOLO/job-1') return { data: { success: true, data: { data: null, cashFirstEnabled: false } } };
    if (path === '/service-orders/job-1') return { data: { data: server.order } };
    if (path === '/service-orders/job-1/evidence') return { data: { data: server.evidence } };
    if (path === '/service-orders/job-1/part-requests') {
      if (server.failPartRequests) throw { response: { status: 500 } };
      return { data: { data: server.partRequests } };
    }
    if (path === '/service-orders/job-1/cash-settlement' || path === '/service-orders/job-1/invoice') return { data: { data: null } };
    return { data: { data: [] } };
  });
  mockPost.mockReset().mockImplementation(async (path: string, body: unknown) => {
    if (path === '/service-orders/job-1/check-in') {
      if (server.checkInResult.result === 'valid') server.order = { ...server.order, arrivalVerified: true };
      return { data: { data: server.checkInResult } };
    }
    if (path === '/service-orders/job-1/evidence') {
      const form = body as FormData;
      const type = String(form.get('type'));
      const file = form.get('file') as File;
      if (type === 'before') server.beforeUploadFlags.push({ name: file.name, deferAutoStart: form.get('deferAutoStart') });
      if (server.failEvidence || file.name === server.failEvidenceFileName) throw { response: { status: 500 } };
      server.evidence = [...server.evidence, { id: `e${server.evidence.length + 1}`, type, mediaUrl: `https://img.test/${type}.jpg` }];
      if (type === 'before' && server.order.pricingMode === 'fixed_price' && form.get('deferAutoStart') !== 'true') server.order = { ...server.order, status: 'UNDER_REPAIR' };
      return { data: { data: {} } };
    }
    if (path === '/service-orders/job-1/start-repair') {
      if (server.failStartRepair) throw { response: { status: 409, data: { message: 'Không thể bắt đầu sửa chữa.' } } };
      server.order = { ...server.order, status: 'UNDER_REPAIR' };
      return { data: { data: server.order } };
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
    expect(evidenceFormsPosted()[0].get('deferAutoStart')).toBeNull();
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

  describe('the browser gives no fresh fix at check-in', () => {
    const pingFix = { coords: { latitude: 10.7745, longitude: 106.7019, accuracy: 30 } };
    const withPingGeolocation = () =>
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (ok: (p: unknown) => void) => ok(pingFix), watchPosition: vi.fn(), clearWatch: vi.fn() },
      });
    const dropGeolocation = () => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });

    it('checks in with the en-route ping fix from the last two minutes', async () => {
      withPingGeolocation();
      getBestPosition.mockRejectedValueOnce(new Error('unavailable'));
      const wrapper = await mountPage();
      await primary(wrapper, 'Check-in').trigger('click');
      await shoot(wrapper);
      expect(mockPost).toHaveBeenCalledWith('/service-orders/job-1/check-in', { lat: 10.7745, lng: 106.7019, accuracyMeters: 30 });
      expect(evidenceTypesPosted()).toEqual(['checkin_face']);
      wrapper.unmount();
      dropGeolocation();
    });

    it('a ping fix older than two minutes is not used', async () => {
      withPingGeolocation();
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      const wrapper = await mountPage();
      clock.mockReturnValue(start + 121_000);
      getBestPosition.mockRejectedValueOnce(new Error('unavailable'));
      await primary(wrapper, 'Check-in').trigger('click');
      await shoot(wrapper);
      expect(wrapper.text()).toContain('Không lấy được vị trí. Hãy cho phép trình duyệt dùng vị trí rồi thử lại.');
      expect(posts('/check-in')).toHaveLength(0);
      clock.mockRestore();
      wrapper.unmount();
      dropGeolocation();
    });
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

  it('uploads multiple after photos and waits for an explicit completion action', async () => {
    server.order = { ...baseOrder, status: 'UNDER_REPAIR', arrivalVerified: true, beforeEvidenceCount: 1 };
    server.evidence = [{ id: 'b1', type: 'before', mediaUrl: 'https://img.test/before.jpg' }];
    const wrapper = await mountPage();
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);

    await primary(wrapper, 'Chụp ảnh sau sửa').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('product');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['after']);
    expect(posts('/request-completion')).toHaveLength(0);
    expect(now(wrapper).text()).toContain('Gửi hoàn thành');

    // Another after photo from the photos section also uses the camera.
    await wrapper.get('[data-testid="job-details"] button').trigger('click');
    await wrapper.get('[data-testid="after-evidence-picker"]').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-mode')).toBe('product');
    await shoot(wrapper);
    expect(evidenceTypesPosted()).toEqual(['after', 'after']);
    expect(evidenceFormsPosted().filter(form => form.get('type') === 'after').map(form => form.get('deferAutoStart'))).toEqual([null, null]);
    expect(posts('/request-completion')).toHaveLength(0);

    await primary(wrapper, 'Gửi hoàn thành').trigger('click');
    await flushPromises();
    expect(posts('/request-completion')).toHaveLength(0);
    await wrapper.get('[data-testid="confirm-finalize-repair"]').trigger('click');
    await flushPromises();
    expect(posts('/request-completion')).toHaveLength(1);
    expect(now(wrapper).text()).toContain('Thu tiền');
    wrapper.unmount();
  });

  it('defers fixed-price auto-start until the final BEFORE photo and retries only unsent files', async () => {
    server.order = { ...baseOrder, status: 'EN_ROUTE', pricingMode: 'fixed_price', fixedUnitPrice: 120000, arrivalVerified: true };
    server.evidence = [{ id: 'f1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' }];
    server.failEvidenceFileName = 'before-2.jpg';
    const wrapper = await mountPage();

    await primary(wrapper, 'Chụp ảnh máy').trigger('click');
    expect(wrapper.get('[data-testid="camera"]').attributes('data-multiple')).toBe('true');
    await wrapper.get('[data-testid="camera-use-three"]').trigger('click');
    await flushPromises();
    expect(server.beforeUploadFlags.map(upload => upload.deferAutoStart)).toEqual(['true', 'true']);
    expect(server.order.status).toBe('EN_ROUTE');
    expect(wrapper.get('[data-testid="pending-evidence-upload"]').text()).toContain('Còn 2 ảnh chưa gửi');

    server.failEvidenceFileName = null;
    await wrapper.get('[data-testid="pending-evidence-upload"] button').trigger('click');
    await flushPromises();
    expect(server.beforeUploadFlags).toEqual([
      { name: 'before-1.jpg', deferAutoStart: 'true' },
      { name: 'before-2.jpg', deferAutoStart: 'true' },
      { name: 'before-2.jpg', deferAutoStart: 'true' },
      { name: 'before-3.jpg', deferAutoStart: 'false' },
    ]);
    expect(server.evidence.filter(item => item.type === 'before')).toHaveLength(3);
    expect(server.order.status).toBe('UNDER_REPAIR');
    wrapper.unmount();
  });

  it('offers bounded start-repair recovery only after pending BEFORE photos are discarded', async () => {
    server.order = { ...baseOrder, status: 'EN_ROUTE', pricingMode: 'fixed_price', fixedUnitPrice: 120000, arrivalVerified: true };
    server.evidence = [{ id: 'f1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' }];
    server.failEvidenceFileName = 'before-2.jpg';
    const wrapper = await mountPage();

    await primary(wrapper, 'Chụp ảnh máy').trigger('click');
    await wrapper.get('[data-testid="camera-use-three"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="pending-evidence-upload"]').exists()).toBe(true);
    expect(now(wrapper).text()).not.toContain('Hoàn tất ảnh trước, bắt đầu sửa');

    await wrapper.get('[data-testid="pending-evidence-upload"] button:last-child').trigger('click');
    expect(primary(wrapper, 'Hoàn tất ảnh trước, bắt đầu sửa').exists()).toBe(true);
    await primary(wrapper, 'Hoàn tất ảnh trước, bắt đầu sửa').trigger('click');
    await flushPromises();

    expect(posts('/start-repair')).toHaveLength(1);
    expect(server.order.status).toBe('UNDER_REPAIR');
    expect(now(wrapper).text()).toContain('Đang sửa chữa');
    wrapper.unmount();
  });

  it('shows a start-repair error and refreshes the fixed-price order state', async () => {
    server.order = { ...baseOrder, status: 'EN_ROUTE', pricingMode: 'fixed_price', fixedUnitPrice: 120000, arrivalVerified: true };
    server.evidence = [
      { id: 'f1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' },
      { id: 'b1', type: 'before', mediaUrl: 'https://img.test/before.jpg' },
    ];
    server.failStartRepair = true;
    const wrapper = await mountPage();

    await primary(wrapper, 'Hoàn tất ảnh trước, bắt đầu sửa').trigger('click');
    await flushPromises();

    expect(posts('/start-repair')).toHaveLength(1);
    expect(server.order.status).toBe('EN_ROUTE');
    expect(wrapper.get('[role="alert"]').text()).toContain('Không thể bắt đầu sửa chữa.');
    expect(primary(wrapper, 'Hoàn tất ảnh trước, bắt đầu sửa').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('blocks completion until an approved FixHome quotation request is QR received and usage is recorded', async () => {
    server.order = {
      ...baseOrder,
      status: 'UNDER_REPAIR',
      arrivalVerified: true,
      completionRequestedAt: null,
      quotation: { id: 'quote-1', status: 'ACCEPTED', laborTotal: 0, partsTotal: 50000, items: [{ type: 'PARTS', partSource: 'fixhome', partCatalogId: 'sku-1', description: 'Van xả', quantity: 1, unitPrice: 50000, lineTotal: 50000 }] },
    };
    server.evidence = [{ id: 'a1', type: 'after', mediaUrl: 'https://img.test/after.jpg' }];
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid="completion-blockers"]').text()).toContain('chưa khớp báo giá');
    expect(primary(wrapper, 'Gửi hoàn thành').attributes('disabled')).toBeDefined();
    await primary(wrapper, 'Gửi hoàn thành').trigger('click');
    expect(posts('/request-completion')).toHaveLength(0);
    wrapper.unmount();
  });

  it('approved quote fully fulfilled by PRE_REPAIR, no QUOTATION request => not blocked', async () => {
    server.order = {
      ...baseOrder,
      status: 'UNDER_REPAIR',
      arrivalVerified: true,
      completionRequestedAt: null,
      quotation: { id: 'quote-1', status: 'ACCEPTED', laborTotal: 0, partsTotal: 50000, items: [{ type: 'PARTS', partSource: 'fixhome', partCatalogId: 'sku-1', description: 'Van xả', quantity: 1, unitPrice: 50000, lineTotal: 50000 }] },
    };
    server.evidence = [{ id: 'a1', type: 'after', mediaUrl: 'https://img.test/after.jpg' }];
    server.partRequests = [{ requestType: 'pre_repair', status: 'received', receivedAt: '2026-10-20T10:00:00Z', items: [{ partSource: 'fixhome', partCatalogId: 'sku-1', quantity: 1, usageStatus: 'used' }] }];
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="completion-blockers"]').exists()).toBe(false);
    expect(primary(wrapper, 'Gửi hoàn thành').attributes('disabled')).toBeUndefined();
    await primary(wrapper, 'Gửi hoàn thành').trigger('click');
    await flushPromises();
    expect(posts('/request-completion')).toHaveLength(0);
    await wrapper.get('[data-testid="confirm-finalize-repair"]').trigger('click');
    await flushPromises();
    expect(posts('/request-completion')).toHaveLength(1);
    wrapper.unmount();
  });

  it('fails closed when the parts lifecycle cannot be read before completion', async () => {
    server.order = { ...baseOrder, status: 'UNDER_REPAIR', arrivalVerified: true };
    server.evidence = [{ id: 'a1', type: 'after', mediaUrl: 'https://img.test/after.jpg' }];
    server.failPartRequests = true;
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid="completion-blockers"]').text()).toContain('Chưa tải được trạng thái linh kiện');
    expect(primary(wrapper, 'Gửi hoàn thành').attributes('disabled')).toBeDefined();
    await primary(wrapper, 'Gửi hoàn thành').trigger('click');
    expect(posts('/request-completion')).toHaveLength(0);
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
