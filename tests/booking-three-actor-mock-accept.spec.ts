// WEB-ACCEPT synthetic three-actor UI/API contract test.
// Fake HTTP state enforces authorization and sequential #1 -> #2 invitations BY DESIGN; not a PostgreSQL/JWT E2E.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const { mockGet, mockPost, push, route } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPost: vi.fn(), push: vi.fn(), route: { params: { id: 'booking-synthetic' } },
}));
vi.mock('../src/api/client', () => ({
  default: { get: mockGet, post: mockPost },
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
}));
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
type FakeInvitation = { id: string; technicianId: 'tech-a' | 'tech-b'; status: 'pending' | 'standby' | 'accepted' | 'declined' | 'cancelled' | 'expired'; expiresAt: string };

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
      const first = invitations[0];
      if (first?.status === 'pending' && first.expiresAt <= new Date().toISOString()) {
        first.status = 'expired';
        const second = invitations.find(inv => inv.status === 'standby');
        if (second) { second.status = 'pending'; second.expiresAt = new Date(Date.now() + 60000).toISOString(); }
      }
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
      invitations.push(
        { id: 'invite-tech-a', technicianId: 'tech-a', status: 'pending', expiresAt: new Date(Date.now() + 60000).toISOString() },
        { id: 'invite-tech-b', technicianId: 'tech-b', status: 'standby', expiresAt: '' },
      );
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
      if (payload.action === 'DECLINE') {
        invitation.status = 'declined';
        const second = invitations.find(inv => inv.status === 'standby');
        if (second) { second.status = 'pending'; second.expiresAt = new Date(Date.now() + 60000).toISOString(); }
        return envelope({ invitation });
      }
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

async function sendTwoCustomerChoices() {
  const page = mount(BookingCandidatesPage, { global: ui });
  await flushPromises();
  const selections = page.findAll('input[type="checkbox"]');
  expect(selections).toHaveLength(2);
  await selections[0].trigger('change');
  await selections[1].trigger('change');
  const send = page.findAll('button').at(-1);
  expect(send?.exists()).toBe(true);
  await send!.trigger('click');
  await flushPromises();
  page.unmount();
}

describe('WEB-ACCEPT synthetic Customer + two ranked Technicians, fake HTTP only', () => {
  it('only first technician is invited; winner alone opens the one ServiceOrder and private Booking', async () => {
    const fake = scenario();
    await sendTwoCustomerChoices();
    expect(fake.state.invitations.map(i => i.status)).toEqual(['pending', 'standby']);
    expect(fake.state.status).toBe('matching');
    const customerPage = mount(BookingDetailPage, { global: ui });
    await flushPromises();
    expect(customerPage.find('[data-testid="booking-open-service-order"]').exists()).toBe(false);

    fake.setActor('tech-a');
    const technicianA = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    expect(technicianA.text()).toContain('Synthetic District, Synthetic Province');
    expect(technicianA.text()).not.toContain(privateDetail);
    await technicianA.find('button.w-full').trigger('click');
    fake.setActor('tech-b');
    const technicianB = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    expect(technicianB.text()).not.toContain('Synthetic District, Synthetic Province');
    expect(technicianB.text()).not.toContain(privateDetail);
    expect(technicianB.findAll('button').some(button => button.text().includes('Chấp nhận đơn này'))).toBe(false);
    await expect(bookingsApi.respondInvitation('invite-tech-b', 'ACCEPT')).rejects.toThrow('Synthetic 403');

    fake.setActor('tech-a');
    await acceptClick(technicianA);
    expect(fake.state.serviceOrderCount).toBe(1);
    expect(fake.state.winner).toBe('tech-a');
    expect(fake.state.invitations.map(i => i.status)).toEqual(['accepted', 'cancelled']);
    expect(push).toHaveBeenCalledWith({ name: 'tech-job-detail', params: { id: orderId } });
    fake.setActor('tech-b');
    await expect(bookingsApi.getBooking(bookingId)).rejects.toThrow('Synthetic 403');
    await expect(bookingsApi.respondInvitation('invite-tech-b', 'ACCEPT')).rejects.toThrow('Synthetic 403');
    fake.setActor('customer');
    await vi.advanceTimersByTimeAsync(5000); await flushPromises();
    await customerPage.find('[data-testid="booking-open-service-order"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: orderId } });
    technicianA.unmount(); technicianB.unmount(); customerPage.unmount();
  });

  it('after priority #1 declines, only #2 receives invitation and may Accept exactly once', async () => {
    const fake = scenario();
    await sendTwoCustomerChoices();
    fake.setActor('tech-b');
    expect(await bookingsApi.getMyInvitations()).toEqual([]);
    await expect(bookingsApi.respondInvitation('invite-tech-b', 'ACCEPT')).rejects.toThrow('Synthetic 403');
    fake.setActor('tech-a');
    await bookingsApi.respondInvitation('invite-tech-a', 'DECLINE');
    expect(fake.state.invitations.map(i => i.status)).toEqual(['declined', 'pending']);
    fake.setActor('tech-b');
    const page = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    expect(page.text()).toContain('Synthetic District, Synthetic Province');
    await acceptClick(page);
    expect(fake.state.winner).toBe('tech-b');
    expect(fake.state.serviceOrderCount).toBe(1);
    fake.setActor('tech-a');
    await expect(bookingsApi.respondInvitation('invite-tech-a', 'ACCEPT')).rejects.toThrow('Synthetic 403');
    await expect(bookingsApi.getBooking(bookingId)).rejects.toThrow('Synthetic 403');
    page.unmount();
  });

  it('expired first invitation activates #2; cancellation rejects its stale Accept', async () => {
    const fake = scenario();
    await sendTwoCustomerChoices();
    fake.setActor('tech-a');
    const first = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    fake.expire('tech-a');
    await acceptClick(first);
    expect(fake.state.serviceOrderCount).toBe(0);
    first.unmount();
    fake.setActor('tech-b');
    const second = mount(TechnicianInvitationsPage, { global: ui });
    await flushPromises();
    expect(fake.state.invitations.map(i => i.status)).toEqual(['expired', 'pending']);
    fake.setActor('customer');
    const cancelled = await bookingsApi.cancelBooking(bookingId, 'Synthetic cancelled before acceptance');
    expect(cancelled.status).toBe('CANCELLED');
    fake.setActor('tech-b');
    await acceptClick(second);
    expect(fake.state.serviceOrderCount).toBe(0);
    expect(push).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'tech-job-detail' }));
    second.unmount();
  });
});