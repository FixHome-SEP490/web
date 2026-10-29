import { describe, expect, it } from 'vitest';
import { photosByAppliance, setAiVisitDraft, takeAiVisitDraft } from '../src/composables/aiVisitDraft';
import type { AiChatMessage, ChatAttachment } from '../src/composables/useAiConversation';

// PO 29/10/2026: three photos of three appliances in one chat; each machine of
// the visit takes the photos the assistant read as it.
const photo = (index: number, deviceType: string | null) => ({ index, deviceType, nameVi: deviceType });
const done = (id: string, uploadId: string): ChatAttachment => ({ id, kind: 'image', state: 'done', progress: 1, uploadId });

describe('photosByAppliance', () => {
  it('gives the booking form photos of the first message to the appliance each was read as', () => {
    const messages: AiChatMessage[] = [
      { id: 'u1', sender: 'user', text: 'quạt, bếp từ, bếp gas hư', images: ['data:fan', 'data:induction', 'data:gas'] },
      { id: 'a1', sender: 'bot', text: 'Dạ em xem ạ', isAcknowledgement: true },
      { id: 'b1', sender: 'bot', text: '...', reply: { photos: [photo(0, 'electric_fan'), photo(1, 'induction_cooker'), photo(2, 'gas_stove')] } as never },
    ];
    const found = photosByAppliance(messages, [], ['up-fan', 'up-induction', 'up-gas']);
    expect(found.get('electric_fan')).toEqual([{ uploadId: 'up-fan', previewUrl: 'data:fan' }]);
    expect(found.get('induction_cooker')).toEqual([{ uploadId: 'up-induction', previewUrl: 'data:induction' }]);
    expect(found.get('gas_stove')).toEqual([{ uploadId: 'up-gas', previewUrl: 'data:gas' }]);
  });

  it('takes the chat photos by their own upload, and leaves out what was not recognised or not uploaded', () => {
    const messages: AiChatMessage[] = [
      { id: 'u1', sender: 'user', text: 'quạt kêu' },
      { id: 'b1', sender: 'bot', text: '...', reply: {} as never },
      { id: 'u2', sender: 'user', text: 'thêm ảnh', images: ['data:a', 'data:b', 'data:c'], attachmentIds: ['x1', 'x2', 'x3'] },
      { id: 'b2', sender: 'bot', text: '...', reply: { photos: [photo(0, 'electric_fan'), photo(1, null), photo(2, 'gas_stove')] } as never },
    ];
    const attachments: ChatAttachment[] = [
      done('x1', 'up-a'),
      done('x2', 'up-b'),
      { id: 'x3', kind: 'image', state: 'uploading', progress: 0.5 },
    ];
    const found = photosByAppliance(messages, attachments, ['never-used']);
    expect(found.get('electric_fan')).toEqual([{ uploadId: 'up-a', previewUrl: 'data:a' }]);
    expect(found.has('gas_stove')).toBe(false);
    expect([...found.keys()]).toEqual(['electric_fan']);
  });

  it('reads nothing into photos the next message came before any reading of', () => {
    const messages: AiChatMessage[] = [
      { id: 'u1', sender: 'user', text: 'ảnh', images: ['data:a'] },
      { id: 'u2', sender: 'user', text: 'còn bếp nữa' },
      { id: 'b2', sender: 'bot', text: '...', reply: { photos: [photo(0, 'gas_stove')] } as never },
    ];
    expect(photosByAppliance(messages, [], ['up-a']).size).toBe(0);
  });
});

describe('the hand-over to the booking form', () => {
  it('carries each appliance with its photos once, for that conversation only', () => {
    setAiVisitDraft('sess-1', [
      { deviceType: 'electric_fan', nameVi: 'Quạt điện', photos: [{ uploadId: 'up-fan', previewUrl: 'data:fan' }] },
      { deviceType: 'gas_stove', nameVi: 'Bếp gas' },
    ]);
    expect(takeAiVisitDraft('sess-other')).toEqual([]);
    setAiVisitDraft('sess-1', [{ deviceType: 'electric_fan', nameVi: 'Quạt điện', photos: [{ uploadId: 'up-fan', previewUrl: 'data:fan' }] }]);
    expect(takeAiVisitDraft('sess-1')[0].photos).toEqual([{ uploadId: 'up-fan', previewUrl: 'data:fan' }]);
    expect(takeAiVisitDraft('sess-1')).toEqual([]);
  });
});
