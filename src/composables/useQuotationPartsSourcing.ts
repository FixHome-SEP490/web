import { ref, watch } from 'vue';
import { ordersApi } from '../api/orders.api';
import { needsSourcingCheck, type PartsSourcing } from '../utils/parts-sourcing';

type QuoteLike = Parameters<typeof needsSourcingCheck>[0];

/**
 * F3 (CUSTOMER 72, TECH 66): one small read per pending quote with FixHome parts, again when the
 * quote changes or the person asks to check the warehouses again. A late answer for an older
 * quote never overwrites the current one. A failed read shows nothing: the approval still decides.
 */
export function useQuotationPartsSourcing(quote: () => QuoteLike) {
  const sourcing = ref<PartsSourcing | null>(null);
  const checking = ref(false);
  let ticket = 0;

  async function refresh(): Promise<void> {
    const current = quote();
    const mine = ++ticket;
    if (!needsSourcingCheck(current)) { sourcing.value = null; checking.value = false; return; }
    checking.value = true;
    try {
      const answer = await ordersApi.getQuotationPartsSourcing(current!.id!);
      if (mine === ticket) sourcing.value = answer;
    } catch {
      if (mine === ticket) sourcing.value = null;
    } finally {
      if (mine === ticket) checking.value = false;
    }
  }

  watch(() => { const current = quote(); return `${current?.id ?? ''}:${String(current?.status ?? '').toUpperCase()}`; },
    () => { void refresh(); }, { immediate: true });

  return { sourcing, checking, refresh };
}
