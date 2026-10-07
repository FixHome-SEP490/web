import { beforeEach, describe, expect, it, vi } from 'vitest';

// The conversation with the assistant is many turns, not one: the assistant
// may ask back, and the customer answers, asks, adds photos or asks for another
// service, all in the same session.
const { analyze, ask, acknowledgements } = vi.hoisted(() => ({
  analyze: vi.fn(),
  ask: vi.fn(),
  acknowledgements: vi.fn(),
}));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask, acknowledgements } };
});
vi.mock('../src/utils/image-for-ai', () => ({
  prepareForAi: vi.fn(async (files: File[]) => ({ images: files.map((f) => ({ dataUrl: `data:${f.name}`, bytes: 1 })) })),
  shrinkForRetry: vi.fn(async (images: { dataUrl: string }[]) => images.map((i) => `${i.dataUrl}#small`)),
}));

import { useAiConversation, composeFromFields, priceLabel } from '../src/composables/useAiConversation';

const reply = (extra: Record<string, unknown> = {}) => ({
  sessionId: 'sess-1', status: 'ok', aiAvailable: true, messageVi: 'Dạ em xem rồi ạ.',
  suspectedFaults: [], recommendedServices: [], suggestedActionsVi: [], priceEstimate: null, ...extra,
});

describe('useAiConversation', () => {
  beforeEach(() => { analyze.mockReset(); ask.mockReset(); acknowledgements.mockReset().mockResolvedValue({}); });

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

  it('retries once with smaller photos when the first send fails, and never blocks', async () => {
    analyze
      .mockResolvedValueOnce({ status: 'unavailable', aiAvailable: false, sessionId: null, messageVi: 'Trợ lý đang bận' })
      .mockResolvedValueOnce(reply());
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy giặt không vắt', [{ dataUrl: 'data:big', bytes: 9 } as never]);
    expect(analyze).toHaveBeenLastCalledWith(expect.objectContaining({ images: ['data:big#small'] }));
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

  it('keeps the specific service when a later turn only offers the catch-all check-up', async () => {
    analyze.mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'SUA_DIEU_HOA', nameVi: 'Sửa điều hòa không mát', serviceId: 'svc-ac' }] }));
    ask.mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'KIEM_TRA_CHAN_DOAN_THIET_BI', nameVi: 'Kiểm tra/chẩn đoán', serviceId: 'svc-check' }] }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Máy lạnh không mát', []);
    await c.sendTurn('Sửa hết bao nhiêu tiền?', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-ac');
  });

  it('still takes the catch-all when nothing specific was found, and a specific one over it later', async () => {
    analyze
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'KIEM_TRA_CHAN_DOAN_THIET_BI', nameVi: 'Kiểm tra', serviceId: 'svc-check' }] }))
      .mockResolvedValueOnce(reply({ recommendedServices: [{ serviceCode: 'SUA_MAY_GIAT', nameVi: 'Sửa máy giặt', serviceId: 'svc-wm' }] }));
    const c = useAiConversation({ dwellMs: 0 });
    await c.sendTurn('Đồ trong nhà bị hỏng', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-check');
    await c.sendTurn('Máy giặt không vắt', []);
    expect(c.pinnedService.value?.serviceId).toBe('svc-wm');
  });
});
