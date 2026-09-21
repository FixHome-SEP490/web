import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { aiApi, looksLikeAQuestion, AI_MAX_IMAGES } from '../src/api/ai.api';

/** A reply copied from the running service, not invented for the test. */
const realReply = {
  sessionId: '3cbaa8d2db114169b06907d7d3e27161',
  status: 'ok',
  aiAvailable: true,
  suspectedFaults: [
    { faultCode: 'WM_BEARING_NOISE', nameVi: 'Mòn bạc đạn lồng giặt', confidence: 0.88 },
  ],
  recommendedServices: [
    {
      serviceCode: 'SUA_MAY_GIAT',
      nameVi: 'Sửa máy giặt rung lắc / không vắt',
      serviceId: 'f19905a8-bbe3-44aa-8b52-a8265deba5b0',
    },
  ],
  priceEstimate: { min: 100000, max: null, currency: 'VND', requiresAssessment: true },
  urgency: 'MEDIUM',
  messageVi: 'Em đã đọc và kiểm tra thông tin anh/chị gửi...',
  disclaimerVi: 'Đây là gợi ý sơ bộ...',
};

const envelope = (data: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyze', () => {
  it('echoes the session id back so the assistant keeps the conversation', async () => {
    apiClientMock.post.mockResolvedValue(envelope(realReply));

    await aiApi.analyze({ description: 'mới vệ sinh tháng trước', sessionId: 'abc123' });

    expect(apiClientMock.post.mock.calls[0][1].sessionId).toBe('abc123');
  });

  it('omits the session id on the first message rather than inventing one', async () => {
    apiClientMock.post.mockResolvedValue(envelope(realReply));

    await aiApi.analyze({ description: 'máy giặt không vắt', sessionId: null });

    expect(apiClientMock.post.mock.calls[0][1].sessionId).toBeUndefined();
  });

  it('never sends a fourth image, which the service rejects', async () => {
    apiClientMock.post.mockResolvedValue(envelope(realReply));

    await aiApi.analyze({ description: '', images: ['a', 'b', 'c', 'd'] });

    expect(apiClientMock.post.mock.calls[0][1].images).toHaveLength(AI_MAX_IMAGES);
  });

  it('unwraps the envelope the backend puts around every reply', async () => {
    apiClientMock.post.mockResolvedValue(envelope(realReply));

    const reply = await aiApi.analyze({ description: 'máy giặt không vắt' });

    expect(reply.sessionId).toBe(realReply.sessionId);
    expect(reply.recommendedServices?.[0].serviceId).toBe(
      'f19905a8-bbe3-44aa-8b52-a8265deba5b0',
    );
  });

  it('answers with words instead of throwing when the network is down', async () => {
    // A page that crashes on a dropped connection is worse than one that says
    // so, and the customer must still be able to book.
    apiClientMock.post.mockRejectedValue(new Error('Network Error'));

    const reply = await aiApi.analyze({ description: 'máy giặt không vắt' });

    expect(reply.status).toBe('unavailable');
    expect(reply.messageVi).toBeTruthy();
    expect(reply.suspectedFaults).toEqual([]);
  });

  it('invents no fault or price when it is offline', async () => {
    apiClientMock.post.mockRejectedValue(new Error('Network Error'));

    const reply = await aiApi.analyze({ description: 'điều hòa không mát' });

    expect(reply.priceEstimate).toBeUndefined();
    expect(reply.recommendedServices).toEqual([]);
  });
});

describe('acknowledgements', () => {
  it('reads the situation groups, which is the shape the service sends', async () => {
    apiClientMock.get.mockResolvedValue(
      envelope({ version: '2026-09-16', situations: { first_photo: ['Dạ em nhận được ảnh rồi ạ...'] } }),
    );

    const situations = await aiApi.acknowledgements();

    expect(situations.first_photo).toEqual(['Dạ em nhận được ảnh rồi ạ...']);
  });

  it('returns an empty map rather than failing the page', async () => {
    apiClientMock.get.mockRejectedValue(new Error('down'));

    await expect(aiApi.acknowledgements()).resolves.toEqual({});
  });
});

describe('looksLikeAQuestion', () => {
  it('routes a price question to the question route', () => {
    expect(looksLikeAQuestion('vệ sinh máy lạnh bao nhiêu tiền')).toBe(true);
    expect(looksLikeAQuestion('bảo hành bao lâu vậy?')).toBe(true);
  });

  it('routes a plain fault report to the diagnosis route', () => {
    expect(looksLikeAQuestion('máy giặt nhà em không vắt')).toBe(false);
    expect(looksLikeAQuestion('điều hòa chảy nước')).toBe(false);
  });

  it('treats a symptom wearing a question mark as a symptom', () => {
    expect(looksLikeAQuestion('máy lạnh không mát phải làm sao?')).toBe(false);
    expect(looksLikeAQuestion('tủ lạnh kêu to có sao không?')).toBe(false);
  });

  it('does not mistake an appliance name for a symptom', () => {
    // `lạnh` and `nóng` live inside máy lạnh, tủ lạnh and bình nóng lạnh.
    // Treating them as symptoms sent every air-conditioner price question
    // down the diagnosis path.
    expect(looksLikeAQuestion('tủ lạnh giá bao nhiêu')).toBe(true);
    expect(looksLikeAQuestion('bình nóng lạnh lắp mất bao lâu')).toBe(true);
  });

  it('says nothing about an empty message', () => {
    expect(looksLikeAQuestion('')).toBe(false);
    expect(looksLikeAQuestion('   ')).toBe(false);
  });
});
