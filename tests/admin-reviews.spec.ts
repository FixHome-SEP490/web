import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

// Admin: customer reviews (PO 09/10/2026), read only, with the average and the spread of stars.
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../src/api/admin-reviews.api', () => ({ adminReviewsApi: { list } }));
import AdminReviewsPage from '../src/pages/console/admin/AdminReviewsPage.vue';

const good = {
  id: 'r1', rating: 5, comment: 'Thợ đúng giờ, làm kỹ', createdAt: '2026-10-09T03:00:00Z', orderId: 'o1', orderCode: 'FH-1',
  technicianId: 't1', technicianName: 'Hoàng Hữu Dũng', technicianEmail: 'tech1@fixhome.vn',
  customerId: 'c1', customerName: 'Khach Hang 1', customerEmail: 'customer1@fixhome.vn',
};
const poor = { ...good, id: 'r2', rating: 1, comment: null, orderCode: null, orderId: null };
const result = (data: unknown[], average: number | null = 3) => ({
  data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1, summary: { average, stars: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 } } },
});
const mountPage = async () => {
  const w = mount(AdminReviewsPage, { global: { stubs: { RouterLink: RouterLinkStub, 'router-link': RouterLinkStub } } });
  await flushPromises();
  return w;
};

describe('Admin reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(result([good, poor]));
  });

  it('shows each review with who rated whom, the order and the summary', async () => {
    const w = await mountPage();
    expect(list).toHaveBeenCalledWith({ search: undefined, rating: undefined, maxRating: undefined, from: undefined, to: undefined, page: 1, pageSize: 20 });
    const summary = w.get('[data-testid="reviews-summary"]').text().replace(/\s+/g, ' ');
    expect(summary).toContain('2 đánh giá');
    expect(summary).toContain('Trung bình 3.0/5');
    expect(summary).toContain('5 sao: 1');
    const first = w.get('[data-testid="review-r1"]').text();
    for (const piece of ['5/5 sao', 'Thợ đúng giờ, làm kỹ', 'Hoàng Hữu Dũng', 'Khach Hang 1', 'FH-1']) expect(first).toContain(piece);
    expect(w.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/console/orders/o1');
    expect(w.get('[data-testid="review-r2"] p').classes()).toContain('text-danger-700');
  });

  it('filters the poor reviews, an exact number of stars and days', async () => {
    const w = await mountPage();
    await w.get('[data-testid="reviews-stars"]').setValue('low');
    await w.get('[data-testid="reviews-search"]').setValue(' dung ');
    await w.get('[data-testid="reviews-filters"]').trigger('submit');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'dung', maxRating: 2, rating: undefined }));
    await w.get('[data-testid="reviews-stars"]').setValue('4');
    await w.get('[data-testid="reviews-from"]').setValue('2026-10-09');
    await w.get('[data-testid="reviews-to"]').setValue('2026-10-01');
    await w.get('[data-testid="reviews-filters"]').trigger('submit');
    expect(w.text()).toContain('Ngày bắt đầu phải trước ngày kết thúc');
    await w.get('[data-testid="reviews-to"]').setValue('2026-10-10');
    await w.get('[data-testid="reviews-filters"]').trigger('submit');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ rating: 4, maxRating: undefined, from: '2026-10-09', to: '2026-10-10' }));
  });

  it('says so when there is no review and hides the average', async () => {
    list.mockResolvedValue(result([], null));
    const w = await mountPage();
    expect(w.text()).toContain('Chưa có đánh giá nào');
    expect(w.get('[data-testid="reviews-summary"]').text()).not.toContain('Trung bình');
  });
});
