// WEB-ACCEPT synthetic three-actor UI/API contract test.
// Fake HTTP state enforces auth and first-winner rules BY DESIGN; this is NOT a PostgreSQL race/JWT E2E test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const { mockGet, mockPost, push, route } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPost: vi.fn(), push: vi.fn(), route: { params: { id: 'booking-synthetic' } },
}));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: mockPost } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import { bookingsApi } from '../src/api/bookings.api';
import BookingCandidatesPage from '../src/pages/customer/BookingCandidatesPage.vue';
import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';
import TechnicianInvitationsPage from '../src/pages/technician/TechnicianInvitationsPage.vue';

const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { slots, attrs }) { return () => h('button', { ...attrs, disabled: props.disabled || props.loading }, slots.default?.()); },
});
const ui = { stubs: { FhButton: Button, FhCountdown: true, FhDatePicker: true, FhTimeScrollPicker: true, FhConfirmDialog: true, FhMoney: true, FhEmptyState: true, FhStatusPill: true } };
const bookingId = 'booking-synthetic';
const orderId = 'service-order-issued-by-fake-backend';
const privateDetail = 'PRIVATE_HOUSE_NUMBER_AND_DIAGNOSIS';
type Actor = 'customer' | 'tech-a' | 'tech-b';
type FakeInvitation = { id: string; technicianId: 'tech-a' | 'tech-b'; status: 'pending' | 'accepted' | 'cancelled' | 'expired'; expiresAt: string };

function scenario() {
  let actor: Actor = 'customer';
  let status: 'submitted' | 'matching' | 'matched' | 'cancelled' = 'submitted';
  let winner: Actor | null = null;
  let serviceOrderCount = 0;
  const invitations: FakeInvitation[] = [];
  const candidates = (['tech-a', 'tech-b'] as const).map((id, index) => ({
    userId: id, technicianId: `PROFILE_ID_${index}`, fullName: `Synthetic ${id}`,
    averageRating: 4, ratingCount: 5, yearsExperience: 3, reliabilityScore: 85, isAvailable: true,
  }));
  const preview = { id: bookingId, district: 'Synthetic District', province: 'Synthetic Province',
    serviceName: 'Synthetic repair', quantity: 1, urgency: 'medium', preferredStartAt: '2030-01-01T09:00:00Z',
    preferredEndAt: '2030-01-01T10:00:00Z', customerId: privateDetail, description: privateDetail,
    addressTextSnapshot: privateDetail, media: [{ url: privateDetail }], diagnosis: { raw: privateDetail } };
  const booking = () => ({ id: bookingId, customerId: 'customer', serviceId: 'service-synthetic',
    addressId: 'address-synthetic', serviceNameSnapshot: 'Synthetic repair',
    addressTextSnapshot: privateDetail, description: privateDetail,
    preferredStartAt: '2030-01-01T09:00:00Z', preferredEndAt: '2030-01-01T10:00:00Z',
    urgency: 'medium', status, serviceOrderId: winner ? orderId : null, createdAt: '2029-12-31T00:00:00Z' });
  const envelope = (data: unknown) => ({ data: { data } });
  const forbidden = () => new Error('Synthetic 403 forbidden');
  mockGet.mockImplementation(async (path: string) => {
    if (path === `/bookings/${bookingId}/technician-candidates`) {
      if (actor !== 'customer' || status !== 'submitted') throw forbidden();
      return envelope(candidates);
    }
    if (path === `/bookings/${bookingId}`) {
      if (actor !== 'customer' && actor !== winner) throw forbidden();
      return envelope(booking());
    }
    if (path === '/invitations/my') {
      if (actor === 'customer') throw forbidden();
      return envelope(invitations.filter(inv => inv.technicianId === actor && inv.status === 'pending'
        && inv.expiresAt > new Date().toISOString() && status === 'matching').map(inv => ({
          ...inv, bookingId, priorityOrder: 1, invitedAt: '2029-12-31T00:00:00Z', booking: preview,
        })));
    }
    throw new Error(`Unexpected fake GET ${path}`);
  });
  mockPost.mockImplementation(async (path: string, payload: { technicianIds?: string[]; action?: string; reason?: string }) => {
    if (path === `/bookings/${bookingId}/shortlist`) {
      if (actor !== 'customer' || status !== 'submitted') throw forbidden();
      if (payload.technicianIds?.length !== 2 || payload.technicianIds[0] !== 'tech-a' || payload.technicianIds[1] !== 'tech-b') throw forbidden();
      status = 'matching';
      invitations.push(...(['tech-a', 'tech-b'] as const).map(id => ({
        id: `invite-${id}`, technicianId: id, status: 'pending' as const,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      })));
      return envelope(invitations);
    }
    if (path === `/bookings/${bookingId}/cancel`) {
      if (actor !== 'customer' || status !== 'matching' || winner || !payload.reason?.trim()) throw forbidden();
      status = 'cancelled'; invitations.forEach(inv => { inv.status = 'cancelled'; });
      return envelope(booking());
    }
    const match = /^\/invitations\/(invite-tech-[ab])\/respond$/.exec(path);
    if (match) {
      if (actor === 'customer') throw forbidden();
      const invitation = invitations.find(inv => inv.id === match[1] && inv.technicianId === actor);
      if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= new Date().toISOString() || status !== 'matching') throw forbidden();
      if (payload.action === 'ACCEPT') {
        if (winner) throw forbidden();
        winner = actor; status = 'matched'; serviceOrderCount++;
        invitation.status = 'accepted';
        invitations.filter(inv => inv !== invitation).forEach(inv => { inv.status = 'cancelled'; });
        return envelope({ invitation, serviceOrder: { id: orderId, bookingId } });
      }
      if (payload.action === 'DECLINE') { invitation.status = 'cancelled'; return envelope({ invitation }); }
    }
    throw forbidden();
  });
  return {
    setActor: (next: Actor) => { actor = next; },
    get state() { return { status, winner, serviceOrderCount, invitations }; },
    expire: (tech: 'tech-a' | 'tech-b') => { const inv = invitations.find(i => i.technicianId === tech); if (inv) inv.expiresAt = new Date(Date.now() - 1).toISOString(); },
  };
}

async function acceptClick(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find(element => element.text().includes('Chấp nhận đơn này'));
  expect(button?.exists()).toBe(true);
  await button!.trigger('click'); await flushPromises();
}

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); push.mockReset(); vi.stubGlobal('alert', vi.fn());
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('WEB-ACCEPT shared synthetic Customer + two-Technician state', () => {
  it('one accepted SO only, loser cannot navigate/read private Booking; customer poll opens same SO', async () => {
    const fake = scenario();
    const candidatePage = mount(BookingCandidatesPage, { global: ui });
    await flushPromises();
    const send = candidatePage.findAll('button').find(b => b.text().includes('Gửi lời mời đồng thời'));
    await send!.trigger('click'); await flushPromises();
    expect(fake.state.invitations).toHaveLength(2);
    expect(fake.state.status).toBe('matching');
    expect(push).not.toHaveBeenCalledWith('/app/orders');
    candidatePage.unmount();

    const customerPage = mount(BookingDetailPage, { global: ui });
    await flushPromises();
    expect(customerPage.find('[data-testid="booking-open-service-order"]').exists()).toBe(false);

    fake.setActor('tech-a');
    const technicianA = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    fake.setActor('tech-b');
    const technicianB = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    for (const page of [technicianA, technicianB]) {
      expect(page.text()).toContain('Synthetic District, Synthetic Province');
      expect(page.text()).not.toContain(privateDetail);
      await page.find('button.w-full').trigger('click');
      expect(page.text()).not.toContain(privateDetail);
      expect(page.find(`a[href="${privateDetail}"]`).exists()).toBe(false);
    }

    fake.setActor('tech-a');
    await acceptClick(technicianA);
    expect(fake.state.serviceOrderCount).toBe(1);
    expect(fake.state.winner).toBe('tech-a');
    expect(push).toHaveBeenCalledWith({ name: 'tech-job-detail', params: { id: orderId } });

    push.mockClear(); fake.setActor('tech-b');
    await acceptClick(technicianB); // stale UI tries old PENDING invitation: fake backend rejects.
    expect(fake.state.serviceOrderCount).toBe(1);
    expect(push).not.toHaveBeenCalled();
    await expect(bookingsApi.getBooking(bookingId)).rejects.toThrow('Synthetic 403');
    expect(vi.mocked(alert)).toHaveBeenCalled();

    fake.setActor('customer');
    await vi.advanceTimersByTimeAsync(5000); await flushPromises();
    const open = customerPage.find('[data-testid="booking-open-service-order"]');
    expect(open.exists()).toBe(true);
    await open.trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: orderId } });
    expect(fake.state.invitations.filter(i => i.status === 'accepted')).toHaveLength(1);
    expect(fake.state.invitations.filter(i => i.status === 'cancelled')).toHaveLength(1);
    technicianA.unmount(); technicianB.unmount(); customerPage.unmount();
  });

  it('expired invitation does not navigate or create an SO; cancelling Booking rejects stale Accept', async () => {
    const fake = scenario();
    const candidates = mount(BookingCandidatesPage, { global: ui }); await flushPromises();
    const send = candidates.findAll('button').find(b => b.text().includes('Gửi lời mời đồng thời'));
    await send!.trigger('click'); await flushPromises(); candidates.unmount();
    fake.setActor('tech-a');
    const page = mount(TechnicianInvitationsPage, { global: ui }); await flushPromises();
    fake.expire('tech-a');
    await acceptClick(page);
    expect(fake.state.serviceOrderCount).toBe(0);
    expect(push).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'tech-job-detail' }));
    page.unmount();

    fake.setActor('tech-b');
    const second = mount(TechnicianInvitationsPage, { global: ui }); await flushPromises();
    fake.setActor('customer');
    const result = await bookingsApi.cancelBooking(bookingId, 'Synthetic cancelled before acceptance');
    expect(result.status).toBe('CANCELLED');
    fake.setActor('tech-b');
    await acceptClick(second); // fake backend rejects stale invitation after cancellation.
    expect(fake.state.serviceOrderCount).toBe(0);
    expect(push).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'tech-job-detail' }));
    second.unmount();
  });
});