// Service manager review of check-in faces that did not match the registered face (PO 20/11/2026): the list
// opens waiting requests first, the drawer shows the check-in photo beside the registered one, approving needs
// no reason, rejecting needs one of at least 5 characters, and the managers' notices open this page.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), review: vi.fn() }));
vi.mock('../src/api/checkin-face-reviews.api', () => ({ checkinFaceReviewsApi: api }));

import ConsoleCheckinFacesPage from '../src/pages/console/ConsoleCheckinFacesPage.vue';
import router from '../src/router';
import { consoleNavigation } from '../src/components/console/console-navigation';
import { getNotificationCategory, type NotificationItem } from '../src/api/notifications.api';
import { keysChangedBy, queryKeys } from '../src/lib/query-keys';

const stubs = { teleport: true };

const row = {
  id: 'r1',
  status: 'pending',
  similarity: 52.5,
  createdAt: '2026-11-20T09:00:00Z',
  reviewedAt: null,
  reviewNote: null,
  orderId: 'o1',
  orderCode: 'FH-2026-0001',
  technicianId: 't1',
  technicianName: 'Trần Văn Bình',
};
const detail = {
  ...row,
  retakeCount: 1,
  checkinPhotoUrl: 'https://storage.example/checkin.jpg',
  registeredPhotoUrl: 'https://storage.example/registered.jpg',
};

// The drawer and the confirm dialog both have a button with this text: the dialog is the later one.
const lastButton = (w: VueWrapper, text: string) => w.findAll('button').filter((b) => b.text().trim() === text).at(-1)!;

async function mountPage(): Promise<VueWrapper> {
  const w = mount(ConsoleCheckinFacesPage, { global: { stubs, plugins: [router] } });
  await flushPromises();
  return w;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 });
  api.get.mockResolvedValue(detail);
  api.review.mockResolvedValue(undefined);
});

describe('Check-in face review page', () => {
  it('is for service managers and admins, and listed in the manager menu', () => {
    const route = router.resolve('/console/checkin-faces').matched.at(-1);
    expect(route?.meta.roles).toEqual(['SERVICE_MANAGER', 'ADMIN']);
    const items = consoleNavigation('SERVICE_MANAGER').flatMap((group) => group.items);
    expect(items.some((entry) => entry.path === '/console/checkin-faces')).toBe(true);
  });

  it('lists waiting requests first with the technician, order and match', async () => {
    const w = await mountPage();
    expect(api.list).toHaveBeenCalledWith('pending', 1, 20);
    expect(w.text()).toContain('Trần Văn Bình');
    expect(w.text()).toContain('FH-2026-0001');
    expect(w.text()).toContain('52.5%');
    expect(w.text()).toContain('Chờ xác nhận');
  });

  it('reads the list again for another status', async () => {
    const w = await mountPage();
    await w.get('[data-testid="cf-status-filter"]').setValue('rejected');
    await flushPromises();
    expect(api.list).toHaveBeenLastCalledWith('rejected', 1, 20);
  });

  it('shows the check-in photo beside the registered face in the drawer', async () => {
    const w = await mountPage();
    await w.get('[data-testid="cf-open-r1"]').trigger('click');
    await flushPromises();
    const drawer = w.get('[data-testid="checkin-face-drawer"]');
    expect(api.get).toHaveBeenCalledWith('r1');
    expect(drawer.findAll('img').map((img) => img.attributes('src'))).toEqual([
      'https://storage.example/checkin.jpg',
      'https://storage.example/registered.jpg',
    ]);
    expect(drawer.get('[data-testid="cf-similarity"]').text()).toBe('52.5%');
  });

  it('approves without a reason and reads the list again', async () => {
    const w = await mountPage();
    await w.get('[data-testid="cf-open-r1"]').trigger('click');
    await flushPromises();
    const calls = api.list.mock.calls.length;
    await w.get('[data-testid="cf-drawer-approve"]').trigger('click');
    await flushPromises();
    expect(api.review).toHaveBeenCalledWith('r1', { approve: true });
    expect(w.text()).toContain('Đã xác nhận khuôn mặt');
    expect(api.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it('needs a reason of at least 5 characters to reject', async () => {
    const w = await mountPage();
    await w.get('[data-testid="cf-open-r1"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="cf-drawer-reject"]').trigger('click');
    await flushPromises();
    await w.get('#cf-reject-note').setValue('  mờ ');
    await lastButton(w, 'Từ chối ảnh check-in').trigger('click');
    await flushPromises();
    expect(api.review).not.toHaveBeenCalled();
    expect(w.text()).toContain('ít nhất 5 ký tự');
    await w.get('#cf-reject-note').setValue('Khuôn mặt không giống ảnh đăng ký');
    await lastButton(w, 'Từ chối ảnh check-in').trigger('click');
    await flushPromises();
    expect(api.review).toHaveBeenCalledWith('r1', { approve: false, note: 'Khuôn mặt không giống ảnh đăng ký' });
  });
});

describe('Check-in face notices and cache', () => {
  const notice = (type: string): NotificationItem => ({
    id: 'n1', userId: 'u1', type, title: 'Test', message: 'Test', referenceType: 'SERVICE_ORDER', referenceId: 'o1',
    isRead: false, createdAt: '2026-11-20T09:00:00Z',
  });

  it('labels the manager notices as warnings and the answers by outcome', () => {
    for (const type of ['CHECKIN_FACE_FLAGGED', 'CHECKIN_FACE_REVIEW_REQUIRED', 'CHECKIN_FACE_REVIEW_OVERDUE']) {
      expect(getNotificationCategory(notice(type))).toMatchObject({ severity: 'warning', eventLabel: 'Xác nhận khuôn mặt' });
    }
    expect(getNotificationCategory(notice('CHECKIN_FACE_APPROVED'))).toMatchObject({ severity: 'success' });
    expect(getNotificationCategory(notice('CHECKIN_FACE_REJECTED'))).toMatchObject({ severity: 'error' });
  });

  it('refreshes the review list and orders after a decision', () => {
    const keys = keysChangedBy('/api/v1/service-manager/checkin-face-reviews/r1/review');
    expect(keys).toContainEqual(queryKeys.checkinFaceReviews.all);
    expect(keys).toContainEqual(queryKeys.orders.all);
  });
});
