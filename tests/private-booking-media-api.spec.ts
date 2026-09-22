import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { bookingsApi, isFullBookingWithMedia, type BookingMedia, type BookingItem } from '../src/api/bookings.api';
import { mediaApi } from '../src/api/media.api';

vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe('private Booking media API contract', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uploads a Booking photo through the authenticated API and returns only safe metadata', async () => {
    const file = new File(['private photo'], 'unit.jpg', { type: 'image/jpeg' });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: { uploadId: 'opaque-upload-id', mimeType: 'image/jpeg', sizeBytes: file.size, url: 'https://public.invalid/photo.jpg' } },
    });

    await expect(mediaApi.uploadBookingPhoto(file)).resolves.toEqual({
      uploadId: 'opaque-upload-id',
      mimeType: 'image/jpeg',
      sizeBytes: file.size,
    });

    const [path, body, config] = vi.mocked(apiClient.post).mock.calls[0];
    expect(path).toBe('/media/booking-photo-upload');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(apiClient.post).not.toHaveBeenCalledWith('/media/upload', expect.anything(), expect.anything());
  });

  it('keeps the existing public upload endpoint available to unrelated evidence flows', async () => {
    const file = new File(['evidence'], 'evidence.jpg', { type: 'image/jpeg' });
    const legacyResponse = { url: 'https://public.invalid/evidence.jpg', mimeType: file.type, sizeBytes: file.size, filename: file.name };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: legacyResponse } });

    await expect(mediaApi.upload(file)).resolves.toEqual(legacyResponse);
    expect(vi.mocked(apiClient.post).mock.calls[0][0]).toBe('/media/upload');
  });

  it('extends the authenticated Booking matching group and returns authoritative metadata', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          bookingId: 'booking-id',
          invitationGroupId: 'opaque-group-id',
          expiresAt: '2030-10-15T05:00:00.000Z',
          extendedInvitationCount: 3,
        },
      },
    });

    await expect(bookingsApi.extendMatching('booking-id')).resolves.toEqual({
      bookingId: 'booking-id',
      invitationGroupId: 'opaque-group-id',
      expiresAt: '2030-10-15T05:00:00.000Z',
      extendedInvitationCount: 3,
    });
    expect(apiClient.post).toHaveBeenCalledWith('/bookings/booking-id/matching/extend');
  });

  it.each([
    { bookingId: 'booking-id', invitationGroupId: 'opaque-group-id', expiresAt: '', extendedInvitationCount: 3 },
    { bookingId: 'booking-id', invitationGroupId: 'opaque-group-id', expiresAt: '2030-10-15T05:00:00.000Z', extendedInvitationCount: 0 },
  ])('rejects an incomplete matching extension response', async (data) => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data } });

    await expect(bookingsApi.extendMatching('booking-id')).rejects.toThrow('invalid matching extension response');
  });

  it.each([
    { mimeType: 'image/jpeg', sizeBytes: 13 },
    { uploadId: 'opaque-upload-id', mimeType: 'image/jpeg', sizeBytes: -1 },
    { uploadId: 'opaque-upload-id', mimeType: '', sizeBytes: 13 },
  ])('rejects incomplete private upload metadata', async (metadata) => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: metadata } });

    await expect(mediaApi.uploadBookingPhoto(new File(['photo'], 'unit.jpg', { type: 'image/jpeg' })))
      .rejects.toThrow('invalid private Booking photo metadata');
  });

  it('submits photoUploadIds and preserves private media without mapping null URLs into legacy image URLs', async () => {
    const dto = {
      serviceId: 'service-id',
      addressId: 'address-id',
      description: 'Appliance repair',
      preferredStartAt: '2026-09-23T08:00:00.000Z',
      preferredEndAt: '2026-09-23T10:00:00.000Z',
      urgency: 'NORMAL' as const,
      photoUploadIds: ['opaque-upload-id'],
    };
    const privateMedia = {
      id: 'private-media-id',
      url: null,
      isPrivate: true,
      legacyInsecure: false,
      mimeType: 'image/jpeg',
      sizeBytes: 13,
    };
    const legacyMedia = {
      id: 'legacy-media-id',
      url: 'https://public.invalid/legacy.jpg',
      isPrivate: false,
      legacyInsecure: true,
      mimeType: 'image/png',
      sizeBytes: 21,
    };
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          id: 'booking-id',
          status: 'submitted',
          media: [privateMedia, legacyMedia],
        },
      },
    });

    const booking = await bookingsApi.createBooking(dto);

    expect(apiClient.post).toHaveBeenCalledWith('/bookings', { ...dto, urgency: 'medium' });
    expect(booking.media).toEqual([privateMedia, legacyMedia]);
    expect(booking.mediaUrls).toEqual(['https://public.invalid/legacy.jpg']);
    expect(booking.mediaUrls).not.toContain(null);
  });

  it('preserves null size metadata on a legacy public media row without changing URL mapping', async () => {
    const privateMedia: BookingMedia = {
      id: 'private-media-id',
      url: null,
      isPrivate: true,
      legacyInsecure: false,
      mimeType: 'image/jpeg',
      sizeBytes: 13,
    };
    const legacyMedia: BookingMedia = {
      id: 'legacy-media-id',
      url: 'https://public.invalid/legacy.jpg',
      isPrivate: false,
      legacyInsecure: true,
      mimeType: 'image/png',
      sizeBytes: null,
    };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: 'booking-id', status: 'submitted', media: [privateMedia, legacyMedia] } },
    });

    const booking = await bookingsApi.getBooking('booking-id');

    expect(booking.media).toEqual([privateMedia, legacyMedia]);
    expect(booking.media?.[1]).toMatchObject({ sizeBytes: null, isPrivate: false, legacyInsecure: true });
    expect(booking.mediaUrls).toEqual(['https://public.invalid/legacy.jpg']);
    expect(booking.mediaUrls).not.toContain(null);
  });

  it('accepts complete media metadata with legacy null size and rejects invitation previews', () => {
    const complete = {
      id: 'booking-id',
      media: [{
        id: 'legacy-media-id',
        url: 'https://public.invalid/legacy.jpg',
        isPrivate: false,
        legacyInsecure: true,
        mimeType: 'image/png',
        sizeBytes: null,
      }],
    } as BookingItem;

    expect(isFullBookingWithMedia(complete, 'booking-id')).toBe(true);
    expect(isFullBookingWithMedia({ ...complete, media: undefined }, 'booking-id')).toBe(false);
    expect(isFullBookingWithMedia({ ...complete, id: 'different-booking' }, 'booking-id')).toBe(false);
  });

  it('keeps internal invitation-group markers out of the normalized Booking contract', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          id: 'booking-id',
          status: 'matching',
          invitations: [{
            id: 'invitation-id',
            bookingId: 'booking-id',
            groupId: 'internal-group-marker',
            priorityOrder: 1,
            status: 'pending',
            invitedAt: '2030-10-15T04:00:00.000Z',
            expiresAt: '2030-10-15T05:00:00.000Z',
          }],
        },
      },
    });

    const booking = await bookingsApi.getBooking('booking-id');
    expect(booking.invitations?.[0]).toEqual({
      id: 'invitation-id',
      bookingId: 'booking-id',
      priorityOrder: 1,
      status: 'PENDING',
      invitedAt: '2030-10-15T04:00:00.000Z',
      expiresAt: '2030-10-15T05:00:00.000Z',
    });
    expect(booking.invitations?.[0]).not.toHaveProperty('groupId');
  });

  it('downloads private Booking media as an authenticated binary response without URL credentials', async () => {
    const blob = new Blob(['private image bytes'], { type: 'image/jpeg' });
    vi.mocked(apiClient.get).mockResolvedValue({ data: blob });

    await expect(mediaApi.getBookingMediaContent('booking-id', 'private-media-id')).resolves.toBe(blob);

    const [path, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(path).toBe('/bookings/booking-id/media/private-media-id/content');
    expect(config).toEqual({ responseType: 'blob' });
    expect(path).not.toContain('access_token');
    expect(path).not.toContain('token');
    expect(config).not.toHaveProperty('params');
    expect(config).not.toHaveProperty('headers.Authorization');
  });

  it('rejects a non-binary private media response before it can become a preview', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { message: 'forbidden' } });

    await expect(mediaApi.getBookingMediaContent('booking-id', 'private-media-id'))
      .rejects.toThrow('invalid private Booking media response');
  });
});
