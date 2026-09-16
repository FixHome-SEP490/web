import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { bookingsApi } from '../src/api/bookings.api';
import { ordersApi } from '../src/api/orders.api';
import { profileApi } from '../src/api/profile.api';
import { bookingSchedule } from '../src/utils/booking-schedule';

vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
describe('booking/order HTTP contracts (AI excluded)', () => {
  beforeEach(() => vi.resetAllMocks());
  it('sends canonical booking fields, maps urgency and unwraps the persisted ID', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({data:{data:{id:'saved-id',status:'submitted'}}});
    const schedule = bookingSchedule('TOMORROW','MORNING',new Date('2026-09-16T10:00:00+07:00'));
    const dto = {serviceId:'service',addressId:'address',description:'Broken appliance',urgency:'NORMAL' as const,...schedule};
    expect((await bookingsApi.createBooking(dto)).id).toBe('saved-id');
    expect(apiClient.post).toHaveBeenCalledWith('/bookings',{...dto,urgency:'medium'});
  });
  it('does not fabricate a booking, technician, invitation or order on network/HTTP errors', async () => {
    const error = new Error('offline');
    vi.mocked(apiClient.get).mockRejectedValue(error);
    vi.mocked(apiClient.post).mockRejectedValue(error);
    await expect(bookingsApi.createBooking({serviceId:'s',addressId:'a',description:'d',urgency:'HIGH',preferredStartAt:'',preferredEndAt:''})).rejects.toThrow('offline');
    await expect(bookingsApi.getCandidates('b')).rejects.toThrow('offline');
    await expect(bookingsApi.getMyInvitations()).rejects.toThrow('offline');
    await expect(ordersApi.getOrder('unknown')).rejects.toThrow('offline');
    expect(apiClient.get).not.toHaveBeenCalledWith('/service-orders/my');
  });
  it('uses technician user IDs for invitation shortlist and unwraps address data', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({data:{data:[{technicianId:'profile',userId:'user',fullName:'Tech'}]}});
    expect((await bookingsApi.getCandidates('b'))[0].id).toBe('user');
    vi.mocked(apiClient.get).mockResolvedValueOnce({data:{data:[{id:'address'}]}});
    expect(await profileApi.getAddresses()).toEqual([{id:'address'}]);
  });
  it('uses quotation decisions and multipart evidence accepted by Backend', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({data:{data:{}}});
    await ordersApi.approveQuotation('q');
    await ordersApi.rejectQuotation('q');
    await ordersApi.startRepair('o');
    expect(apiClient.post).toHaveBeenCalledWith('/quotations/q/decision',{action:'APPROVE'});
    expect(apiClient.post).toHaveBeenCalledWith('/quotations/q/decision',{action:'REJECT'});
    expect(apiClient.post).toHaveBeenCalledWith('/service-orders/o/start-repair');
    await ordersApi.submitQuotation('o',[{type:'LABOR',description:'Repair',unitPrice:100,quantity:1}]);
    expect(apiClient.post).toHaveBeenCalledWith('/service-orders/o/quotations',{items:[{type:'labor',description:'Repair',unitPrice:100,quantity:1}]});
    const file = new File(['image'],'evidence.png',{type:'image/png'});
    await ordersApi.uploadEvidence('o',{phase:'BEFORE',file});
    const request = vi.mocked(apiClient.post).mock.calls.at(-1)!;
    const form = request[1] as FormData;
    expect(form.get('type')).toBe('before');
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.has('mediaUrl')).toBe(false);
  });
  it('requests completion separately from customer confirmation', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({data:{data:{}}});
    await ordersApi.completeRepair('o');
    await ordersApi.confirmCompletion('o');
    expect(apiClient.post).toHaveBeenCalledWith('/service-orders/o/request-completion',{});
    expect(apiClient.post).toHaveBeenCalledWith('/service-orders/o/confirm-completion',{});
  });
  it('rejects a past appointment and preserves the selected future window', () => {
    const now = new Date(2026,8,16,15);
    expect(() => bookingSchedule('TODAY','MORNING',now)).toThrow();
    const schedule = bookingSchedule('TOMORROW','AFTERNOON',now);
    expect(new Date(schedule.preferredStartAt).getDate()).toBe(17);
    expect(new Date(schedule.preferredStartAt).getHours()).toBe(13);
    expect(new Date(schedule.preferredEndAt).getTime()-new Date(schedule.preferredStartAt).getTime()).toBe(4*3600000);
  });
});
