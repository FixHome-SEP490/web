import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, watchEffect } from 'vue';

// The conversation with the assistant is many turns, not one: the assistant
// may ask back, and the customer answers, asks, adds photos or asks for another
// service, all in the same session.
const { analyze, ask, acknowledgements, shrinkForRetry, uploadBookingPhoto, uploadBookingVideo } = vi.hoisted(() => ({
  analyze: vi.fn(),
  ask: vi.fn(),
  acknowledgements: vi.fn(),
  shrinkForRetry: vi.fn(),
  uploadBookingPhoto: vi.fn(),
  uploadBookingVideo: vi.fn(),
}));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask, acknowledgements } };
});
vi.mock('../src/utils/image-for-ai', () => ({
  prepareForAi: vi.fn(async (files: File[]) => ({ images: files.map((f) => ({ dataUrl: `data:${f.name}`, bytes: 1 })) })),
  shrinkForRetry,
}));
vi.mock('../src/api/media.api', () => ({
  mediaApi: {
    uploadBookingPhoto,
    uploadBookingVideo,
  },
}));

import { useAiConversation, composeFromFields, priceLabel, priceBreakdown } from '../src/composables/useAiConversation';
import { mediaApi } from '../src/api/media.api';

const reply = (extra: Record<string, unknown> = {}) => ({
  sessionId: 'sess-1', status: 'ok', aiAvailable: true, messageVi: 'Dạ em xem rồi ạ.',
  suspectedFaults: [], recommendedServices: [], suggestedActionsVi: [], priceEstimate: null, ...extra,
});

describe('useAiConversation', () => {
  beforeEach(() => {
    analyze.mockReset();
    ask.mockReset();
    acknowledgements.mockReset().mockResolvedValue({});
    shrinkForRetry.mockReset().mockImplementation(async (images: { dataUrl: string }[]) => images.map((i) => `${i.dataUrl}#small`));
    uploadBookingPhoto.mockReset().mockResolvedValue({ uploadId: 'uploaded-photo' });
    uploadBookingVideo.mockReset().mockResolvedValue({ uploadId: 'uploaded-video' });
  });

  it('lets the customer answer what the assistant asked back, in the same session', async () => {
    analyze
      .mockResolvedValueOnce(reply({ status: 'needs_clarification', messageVi: '', clarification: { questionsVi: ['Tiếng kêu ở cục trong hay cục ngoài?'] } }))
      .mockResolvedValueOnce(reply({ suspectedFaults: [{ faultCode: 'F1', nameVi: 'Hỏng mô tơ quạt' }], recommendedServices: [{ serviceCode: 'A', nameVi: 'Sửa điều hòa', serviceId: 'svc-ac' }] }));
    const c = useAiConversation({ dwellMs: 0 });

    await c.sendTurn('Máy lạnh kêu lạch cạch', [{ dataUrl: 'data:photo', bytes: 1 } as never]);
    expect(analyze).toHaveBeenLastCalledWith({ description: 'Máy lạnh kêu lạch cạch', images: ['data:photo'], sessionId: null });
    const asked = c.messages.value.at(-1)!;
    expect(asked.text).toBe('Dạ em cần hỏi thêm một chút để chẩn cho đúng ạ.');
    expect(asked.reply?.clarification?.questionsVi).toEqual(['Tiếng kêu ở cục trong hay cục ngoài?']);

    c.input.value = 'Cục trong phòng ạ';
    await c.send();
    expect(analyze).toHaveBeenLastCalledWith({ description: 'Cục trong phòng ạ', images: [], sessionId: 'sess-1' });
    expect(c.turnCount.value).toBe(2);
    expect(c.pinnedService.value?.serviceId).toBe('svc-ac');
    expect(c.customerWords()).toBe('Máy lạnh kêu lạch cạch. Cục trong phòng ạ');
  });

  it('leaves the "sai rồi" out of the description the technician reads (PO 26/10/2026)', async () => {
    analyze
      .mockResolvedValueOnce(reply({ suspectedFaults: [{ faultCode: 'AC_LOW_REFRIGERANT', nameVi: 'Thiếu gas' }] }))
      .mockResolvedValueOnce(reply({ customerDisagreed: { kind: 'fault', rejectedVi: ['Thiếu gas'], restVi: 'máy vẫn mát nhưng chảy nước' } }))
      .mockResolvedValueOnce(reply({ customerDisagreed: { kind: 'fault', rejectedVi: ['Nghẹt ống'], restVi: '' } }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('máy lạnh chạy mà không mát', []);
    await c.sendTurn('sai rồi, máy vẫn mát nhưng chảy nước', []);
    expect(c.customerWords()).toBe('máy lạnh chạy mà không mát. máy vẫn mát nhưng chảy nước');
    await c.sendTurn('nói sai rồi em ơi', []);
    expect(c.customerWords()).toBe('máy lạnh chạy mà không mát. máy vẫn mát nhưng chảy nước');
  });

  it('says what the price range is made of', () => {
    const priced = reply({ priceEstimate: { min: 249000, max: 999000, currency: 'VND', requiresAssessment: true, labourMin: 249000, labourMax: 249000, partsMax: 750000 } });
    expect(priceLabel(priced as never)).toBe('249.000đ – 999.000đ');
    expect(priceBreakdown(priced as never)).toBe('Gồm tiền công dịch vụ 249.000đ, cộng linh kiện nếu phải thay (tới 750.000đ).');
    const cleaning = reply({ priceEstimate: { min: 199000, max: 449000, currency: 'VND', requiresAssessment: false, labourMin: 199000, labourMax: 449000, partsMax: 0 } });
    expect(priceBreakdown(cleaning as never)).toBeNull();
  });

  it('sends questions to the question route and keeps the session', async () => {
    analyze.mockResolvedValueOnce(reply());
    ask.mockResolvedValueOnce(reply({ answerVi: 'Khoảng 300.000đ ạ.', messageVi: undefined }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Tủ lạnh không đông đá', []);
    c.input.value = 'Sửa hết bao nhiêu tiền?';
    await c.send();
    expect(ask).toHaveBeenCalledWith({ question: 'Sửa hết bao nhiêu tiền?', sessionId: 'sess-1' });
    expect(c.messages.value.at(-1)?.text).toBe('Khoảng 300.000đ ạ.');
  });

  it('replaces the suggested service when the customer asks for another', async () => {
    analyze
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'A', nameVi: 'Vệ sinh máy lạnh', serviceId: 'svc-clean' }] }))
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'B', nameVi: 'Sửa máy lạnh', serviceId: 'svc-fix' }] }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy lạnh bẩn', []);
    await c.sendTurn('Không, máy lạnh hỏng hẳn, cần sửa', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-fix');
  });

  it('retries once with smaller photos only for a recoverable image transport failure', async () => {
    analyze
      .mockResolvedValueOnce({ status: 'unavailable', aiAvailable: false, failureReason: 'image_transport', sessionId: null, messageVi: 'Ảnh chưa gửi được' })
      .mockResolvedValueOnce(reply());
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy giặt không vắt', [{ dataUrl: 'data:big', bytes: 9 } as never]);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenLastCalledWith(expect.objectContaining({ images: ['data:big#small'] }));
    expect(c.messages.value.filter((message) => message.isAcknowledgement)).toHaveLength(1);
    expect(c.messages.value.find((message) => message.isAcknowledgement)?.text).toBe('Ảnh chưa gửi được, đang thử gửi bản nhẹ hơn…');
    expect(mediaApi.uploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect(c.isThinking.value).toBe(false);
  });

  it('reactively updates the acknowledgement while the smaller image is being prepared', async () => {
    let finishShrink!: (images: string[]) => void;
    shrinkForRetry.mockReturnValueOnce(new Promise<string[]>((resolve) => { finishShrink = resolve; }));
    analyze.mockResolvedValueOnce({
      status: 'unavailable',
      aiAvailable: undefined,
      failureReason: 'image_transport',
      sessionId: null,
      messageVi: 'Ảnh chưa gửi được',
    }).mockResolvedValueOnce(reply());
    const c = useAiConversation({ dwellMs: 0 });
    const observedTexts: string[] = [];
    const stop = watchEffect(() => {
      const acknowledgement = c.messages.value.find((message) => message.isAcknowledgement);
      if (acknowledgement) observedTexts.push(acknowledgement.text);
    });

    const sending = c.sendTurn('Máy giặt không vắt', [{ dataUrl: 'data:big', bytes: 9 } as never]);
    await vi.waitFor(() => expect(shrinkForRetry).toHaveBeenCalledTimes(1));
    await nextTick();

    expect(observedTexts).toContain('Ảnh chưa gửi được, đang thử gửi bản nhẹ hơn…');
    finishShrink(['data:big#small']);
    await sending;
    stop();
  });

  it('does not retry an ambiguous image timeout or duplicate its booking media upload', async () => {
    analyze.mockResolvedValueOnce({
      status: 'unavailable',
      aiAvailable: false,
      failureReason: 'service_unavailable',
      sessionId: null,
      messageVi: 'Trợ lý đang tạm thời không khả dụng.',
    });
    const c = useAiConversation({ dwellMs: 0 });

    await c.sendTurn('Máy lạnh không mát', [{ dataUrl: 'data:photo', bytes: 1 } as never]);

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(mediaApi.uploadBookingPhoto).toHaveBeenCalledTimes(1);
  });

  it('does not retry photos for an unavailable AI backend and keeps the selected service', async () => {
    analyze.mockResolvedValueOnce({
      status: 'unavailable',
      aiAvailable: false,
      failureReason: 'service_unavailable',
      sessionId: null,
      messageVi: 'Trợ lý đang tạm thời không khả dụng. Bạn có thể chọn dịch vụ thủ công để tiếp tục đặt lịch.',
    });
    const c = useAiConversation({ dwellMs: 0 });
    c.pinnedService.value = { serviceCode: 'AC-01', nameVi: 'Sửa điều hòa', serviceId: 'svc-ac' };

    await c.sendTurn('Máy lạnh không mát', [{ dataUrl: 'data:photo', bytes: 1 } as never], { keepImagesForBooking: false });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(c.pinnedService.value?.serviceId).toBe('svc-ac');
    expect(c.messages.value.at(-1)?.text).toContain('tạm thời không khả dụng');
  });

  it('clears the thinking state when an unexpected AI error escapes', async () => {
    analyze.mockRejectedValueOnce(new Error('unexpected failure'));
    const c = useAiConversation({ dwellMs: 0 });

    await expect(c.sendTurn('Máy giặt không vắt', [])).rejects.toThrow('unexpected failure');

    expect(c.isThinking.value).toBe(false);
  });

  it('ignores empty sends and sends while still thinking', async () => {
    let release!: (value: unknown) => void;
    analyze.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.send();
    expect(analyze).not.toHaveBeenCalled();
    const first = c.sendTurn('lần một', []);
    await c.sendTurn('lần hai', []);
    expect(analyze).toHaveBeenCalledTimes(1);
    release(reply());
    await first;
  });

  it('never sends a photo without a written description (BRX-064)', async () => {
    const c = useAiConversation({ dwellMs: 0 });
    c.pending.value = [{ dataUrl: 'data:photo', bytes: 1 } as never];

    for (const blank of ['', '   ', '\n\t ']) {
      c.input.value = blank;
      expect(c.canSend.value).toBe(false);
      expect(c.needsDescription.value).toBe(true);
      await c.send();
    }
    await c.sendTurn('   ', [{ dataUrl: 'data:photo', bytes: 1 } as never]);
    expect(analyze).not.toHaveBeenCalled();
    expect(c.messages.value).toHaveLength(0);

    analyze.mockResolvedValueOnce(reply());
    c.input.value = 'Máy giặt rung mạnh khi vắt';
    expect(c.canSend.value).toBe(true);
    expect(c.needsDescription.value).toBe(false);
    await c.send();
    expect(analyze).toHaveBeenCalledWith({ description: 'Máy giặt rung mạnh khi vắt', images: ['data:photo'], sessionId: null });
  });

  it('starts over with a fresh session and keeps the greeting', async () => {
    analyze.mockResolvedValueOnce(reply());
    const c = useAiConversation({ greeting: 'Xin chào', sessionId: 'from-chat', dwellMs: 0 });
    expect(c.sessionId.value).toBe('from-chat');
    await c.sendTurn('máy giặt kêu', []);
    c.startOver();
    expect(c.sessionId.value).toBeNull();
    expect(c.messages.value.map((m) => m.text)).toEqual(['Xin chào']);
  });

  it('builds a sentence when the reply has no prose, and labels prices', () => {
    expect(composeFromFields(reply({ suspectedFaults: [{ faultCode: 'X', nameVi: 'Hỏng Bo Mạch' }] }) as never)).toContain('hỏng bo mạch');
    expect(priceLabel(reply({ priceEstimate: { min: 100000, max: 300000 } }) as never)).toBe('100.000đ – 300.000đ');
    expect(priceLabel(reply({ priceEstimate: { min: 100000, max: null } }) as never)).toBe('Từ 100.000đ');
  });
});

describe('useAiConversation service suggestion', () => {
  beforeEach(() => { analyze.mockReset(); ask.mockReset(); acknowledgements.mockReset().mockResolvedValue({}); });

  it('keeps the specific service when a later turn only offers the catch-all', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'AC-01', nameVi: 'Sửa điều hòa', serviceId: 'svc-ac' }] }));
    ask.mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'DICH_VU_KHAC', nameVi: 'Khác', serviceId: 'svc-other' }] }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy lạnh không mát', []);
    await c.sendTurn('Sửa hết bao nhiêu tiền?', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-ac');
  });

  it('still takes the catch-all when nothing specific was found, and a specific one over it later', async () => {
    analyze
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'DICH_VU_KHAC', nameVi: 'Khác', serviceId: 'svc-other' }] }))
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'WM-01', nameVi: 'Sửa máy giặt', serviceId: 'svc-wm' }] }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Đồ trong nhà bị hỏng', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-other');
    await c.sendTurn('Máy giặt không vắt', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-wm');
  });
});

describe('useAiConversation several appliances', () => {
  beforeEach(() => { analyze.mockReset(); ask.mockReset(); acknowledgements.mockReset().mockResolvedValue({}); });

  const service = (code: string, id: string | null, deviceType: string) => ({ serviceCode: code, nameVi: code, serviceId: id, deviceType });
  const devices = [
    { deviceType: 'washing_machine', nameVi: 'Máy giặt', isPrimary: true, imageIndex: 0, service: service('WM-01', 'svc-wm', 'washing_machine') },
    { deviceType: 'refrigerator', nameVi: 'Tủ lạnh', imageIndex: 1, descriptionVi: 'không lạnh', service: service('FR-01', 'svc-fr', 'refrigerator') },
    { deviceType: 'microwave_oven', nameVi: 'Lò vi sóng', imageIndex: 2, service: null, noteVi: 'Hiện FixHome chưa mở dịch vụ sửa lò vi sóng' },
  ];

  it('pins every appliance that can be booked, and only those', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [devices[0].service, devices[1].service], devices }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy giặt không vắt', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-wm');
    expect(c.pinnedDevices.value.map((d) => d.deviceType)).toEqual(['washing_machine', 'refrigerator']);
  });

  it('keeps the list over a plain question, drops it when the conversation is about one appliance again', async () => {
    analyze
      .mockResolvedValueOnce(reply({ recommendedServices: [devices[0].service], devices }))
      .mockResolvedValueOnce(reply({ recommendedServices: [service('FR-01', 'svc-fr', 'refrigerator')], devices: [] }));
    ask.mockResolvedValueOnce(reply({ answerVi: 'Bảo hành 30 ngày ạ.' }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy giặt không vắt', []);
    await c.sendTurn('Bảo hành bao lâu?', []);
    expect(c.pinnedDevices.value).toHaveLength(2);
    await c.sendTurn('À không phải máy giặt, là tủ lạnh', []);
    expect(c.pinnedDevices.value).toEqual([]);
  });

  it('never pins a single bookable appliance as a visit, and forgets the list on start over', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [devices[0].service], devices: [devices[0], devices[2]] }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy giặt không vắt', []);
    expect(c.pinnedDevices.value).toEqual([]);
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [devices[0].service], devices }));
    await c.sendTurn('Máy giặt không vắt, tủ lạnh không lạnh', []);
    expect(c.pinnedDevices.value).toHaveLength(2);
    c.startOver();
    expect(c.pinnedDevices.value).toEqual([]);
  });
});
