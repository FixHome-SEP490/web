import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiSummaryDialog from '../src/components/technician/AiSummaryDialog.vue';
import { bookingRecap } from '../src/composables/useAiConversation';
import type { AiReply } from '../src/api/ai.api';

const reply: AiReply = {
  sessionId: 's1',
  status: 'ok',
  device: { code: 'AC', nameVi: 'Máy lạnh' } as AiReply['device'],
  suspectedFaults: [
    { code: 'GAS', nameVi: 'Thiếu gas, xì gas' },
    { code: 'CAP', nameVi: 'Hỏng tụ máy nén' },
    { code: 'FAN', nameVi: 'Hỏng quạt dàn nóng' },
  ] as AiReply['suspectedFaults'],
  notesVi: [
    'Khách đã vệ sinh rồi, đã loại bẩn lưới lọc và dàn lạnh.',
    'Khách cho biết không phải do để nhiệt độ cao (cài đặt sai chế độ).',
    'Khách bác khả năng hỏng remote.',
    'Khách nghi thiếu gas, xì gas.',
    'Khách có tả dấu hiệu nguy hiểm (khói, khét, chập, giật hoặc mùi gas).',
  ],
};

describe('bookingRecap', () => {
  it('turns the notes for the technician into what the customer told, in their own voice', () => {
    expect(bookingRecap(reply)).toEqual({
      device: 'Máy lạnh',
      faults: ['Thiếu gas, xì gas', 'Hỏng tụ máy nén'],
      told: [
        'Đã vệ sinh rồi, đã loại bẩn lưới lọc và dàn lạnh.',
        'Không phải do để nhiệt độ cao (cài đặt sai chế độ).',
        'Không phải hỏng remote.',
        'Bạn nghi thiếu gas, xì gas.',
      ],
    });
  });

  it('shows nothing until the assistant has named something', () => {
    expect(bookingRecap(null)).toBeNull();
    expect(bookingRecap({ sessionId: null, status: 'unavailable' })).toBeNull();
    expect(bookingRecap({ sessionId: 's', status: 'ok', notesVi: ['', '  '] })).toBeNull();
  });

  it('keeps a recap with notes only', () => {
    expect(bookingRecap({ sessionId: 's', status: 'ok', notesVi: ['Khách đã thay pin remote rồi, đã loại hết pin remote.'] })).toEqual({
      device: null,
      faults: [],
      told: ['Đã thay pin remote rồi, đã loại hết pin remote.'],
    });
  });
});

describe('AI summary for the technician', () => {
  it('lists what the customer already tried', () => {
    const wrapper = mount(AiSummaryDialog, {
      props: {
        open: true,
        bookingId: 'b1',
        media: [],
        summary: { deviceName: 'Máy lạnh', notes: ['Khách đã vệ sinh rồi, đã loại bẩn lưới lọc và dàn lạnh.'] },
      },
    });
    expect(wrapper.get('[data-testid="ai-summary-notes"]').text()).toContain('Khách đã vệ sinh rồi');
    wrapper.unmount();
  });

  it('shows no notes row for an older summary', () => {
    const wrapper = mount(AiSummaryDialog, { props: { open: true, bookingId: 'b1', media: [], summary: { deviceName: 'Máy lạnh' } } });
    expect(wrapper.find('[data-testid="ai-summary-notes"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
