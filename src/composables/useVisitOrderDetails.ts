import { ref } from 'vue';
import { ordersApi, type AdditionalCostRecord, type OrderEvidenceRecord, type ServiceOrderItem } from '../api/orders.api';
import { canDecideOfficialQuotation } from '../utils/quotation-decision';
import { userFacingError } from '../utils/user-facing-error';

export interface VisitOrderDetails {
  order: ServiceOrderItem;
  costs: AdditionalCostRecord[];
  invoice: Record<string, unknown> | null;
  evidence: OrderEvidenceRecord[];
  costsError: boolean;
  invoiceError: boolean;
  evidenceError: boolean;
}

/** Customer-only orchestration; amounts and decisions still come from existing APIs. */
export function useVisitOrderDetails(visitId: () => string, refresh: () => Promise<void>) {
  const details = ref<Record<string, VisitOrderDetails>>({});
  const fresh = ref(false);
  const deciding = ref(false);
  const feedback = ref<{ orderId: string; error: boolean; text: string } | null>(null);
  let revision = 0;

  function invalidate() {
    fresh.value = false;
    return ++revision;
  }
  function clear() {
    details.value = {};
    feedback.value = null;
    return invalidate();
  }

  async function read(orderId: string, bookingId: string, version: number) {
    const groupId = visitId();
    const order = await ordersApi.getOrder(orderId);
    if (!order || order.id !== orderId || (order.bookingId && order.bookingId !== bookingId)
      || (order.visitGroupId && order.visitGroupId !== groupId)) throw new Error('Mismatched visit order');
    const repair = ['UNDER_REPAIR', 'COMPLETED'].includes(order.status.toUpperCase());
    const final = !!order.completionRequestedAt || order.status.toUpperCase() === 'COMPLETED';
    const [costs, invoice, evidence] = await Promise.allSettled([
      repair ? Promise.resolve().then(() => ordersApi.getAdditionalCosts(orderId)) : Promise.resolve([]),
      final ? Promise.resolve().then(() => ordersApi.getInvoice(orderId)) : Promise.resolve(null),
      Promise.resolve().then(() => ordersApi.getEvidence(orderId)),
    ]);
    if (version !== revision) return null;
    return {
      order,
      costs: costs.status === 'fulfilled' && Array.isArray(costs.value)
        ? costs.value.filter(cost => cost.serviceOrderId === orderId) : [],
      invoice: invoice.status === 'fulfilled' ? invoice.value : null,
      evidence: evidence.status === 'fulfilled' && Array.isArray(evidence.value) ? evidence.value : [],
      costsError: costs.status === 'rejected',
      invoiceError: invoice.status === 'rejected',
      evidenceError: evidence.status === 'rejected',
    } satisfies VisitOrderDetails;
  }

  function publish(next: Record<string, VisitOrderDetails>, version: number) {
    if (revision !== version) return;
    details.value = next;
    fresh.value = true;
  }

  function canDecideCost(bundle: VisitOrderDetails, cost: AdditionalCostRecord) {
    return bundle.order.status.toUpperCase() === 'UNDER_REPAIR' && !bundle.order.completionRequestedAt
      && cost.serviceOrderId === bundle.order.id && cost.status === 'PENDING_APPROVAL'
      && (!cost.expiresAt || new Date(cost.expiresAt).getTime() > Date.now());
  }

  async function decide(orderId: string, action: 'APPROVE' | 'REJECT', costId?: string, externalConsent = false) {
    const bundle = details.value[orderId];
    if (deciding.value || !fresh.value || !bundle) return;
    const cost = costId ? bundle.costs.find(candidate => candidate.id === costId) : null;
    if (costId ? !cost || !canDecideCost(bundle, cost)
      || (action === 'APPROVE' && cost.items.some(item => item.partSource === 'external') && !externalConsent)
      : !canDecideOfficialQuotation(bundle.order)) return;
    deciding.value = true;
    const groupId = visitId();
    feedback.value = null;
    try {
      if (cost) await ordersApi.decideAdditionalCost(cost.id, action);
      else if (action === 'APPROVE') await ordersApi.approveQuotation(bundle.order.quotation!.id);
      else await ordersApi.rejectQuotation(bundle.order.quotation!.id, 'Khách từ chối báo giá');
      fresh.value = false;
      if (groupId === visitId()) feedback.value = { orderId, error: false, text: action === 'APPROVE' ? 'Đã duyệt báo giá của máy này.' : 'Đã từ chối báo giá của máy này.' };
    } catch (error) {
      if (groupId === visitId()) feedback.value = { orderId, error: true, text: userFacingError(error, 'Chưa gửi được lựa chọn. Vui lòng kiểm tra lại rồi thử lại.') };
    } finally {
      // A failed/ambiguous write also needs an authoritative read before retry.
      await refresh();
      deciding.value = false;
    }
  }

  return { details, fresh, deciding, feedback, invalidate, clear, read, publish, decide, canDecideCost };
}
