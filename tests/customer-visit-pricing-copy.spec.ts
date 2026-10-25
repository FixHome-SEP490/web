import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BookingSummary from '../src/components/booking/BookingSummary.vue';
import { summarizeVisitDevicePrices } from '../src/components/booking/visit-device-pricing';

describe('partial visit labor is never the whole visit price', () => {
  it.each([
    [[{ kind: 'firm', amount: 449000 }, { kind: 'survey', from: null, to: null }, { kind: 'survey', from: null, to: null }], 449000, 2],
    [[{ kind: 'firm', amount: 199000 }, { kind: 'firm', amount: 250000 }, { kind: 'survey', from: 50000, to: null }], 449000, 1],
  ] as const)('explains the unresolved machines on desktop and mobile: %j', (prices, amount, unresolved) => {
    const price = summarizeVisitDevicePrices(prices);
    expect(price).toEqual({ kind: 'partial', confirmedTotal: amount, unresolvedCount: unresolved });
    const w = mount(BookingSummary, { props: { price, ctaLabel: 'Tiếp tục', devices: prices.map((p, i) => ({ label: `Máy ${i + 1}`, serviceName: 'Dịch vụ', deviceText: null, price: p })) } });
    for (const id of ['booking-summary', 'booking-summary-bar']) {
      const text = w.get(`[data-testid="${id}"]`).text();
      expect(text).toContain(`${unresolved} máy chờ khảo sát báo giá`);
      expect(text).toContain('Chưa phải tổng 3 máy');
      expect(text).not.toContain('tối thiểu');
    }
  });
});
