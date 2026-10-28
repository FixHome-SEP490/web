<script setup lang="ts">
/**
 * One visit of up to three devices (PO 21/10/2026): one technician with every
 * skill takes them all, each device is quoted and repaired on its own, and the
 * customer pays once, after every device has its result, for the devices
 * repaired only. Matching, the one reschedule and cancelling act on the whole
 * visit here; each device's order page shows its own quote and photos.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Banknote, ChevronDown, ChevronRight, Wallet, X } from 'lucide-vue-next';
import { BookingMediaViewer, FhBackLink, FhButton, FhMoney, FhSkeleton } from '../../components';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import VisitOrderDetails from '../../components/customer/VisitOrderDetails.vue';
import FailedRepairIncident from '../../components/customer/FailedRepairIncident.vue';
import CustomerStopReplaceRequest from '../../components/customer/CustomerStopReplaceRequest.vue';
import VoucherCheckoutChooser from '../../components/vouchers/VoucherCheckoutChooser.vue';
import { fundedCheckoutApi } from '../../api/funded-checkout.api';
import type { FundedReservation } from '../../api/funded-checkout.api';
import type { VoucherCheckoutPreview } from '../../api/vouchers.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { useVisitOrderDetails, type VisitOrderDetails as OrderDetails } from '../../composables/useVisitOrderDetails';
import { visitGroupsApi, type Visit, type VisitCheckout, type VisitDeviceState } from '../../api/visit-groups.api';
import { customerWalletApi } from '../../api/customer-wallet.api';
import { sessionLabel, upcomingSessions, type BookingSlot, type SessionOption } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';
import { canDecideOfficialQuotation } from '../../utils/quotation-decision';
import { billingAmount } from '../../utils/order-billing';
import { LIVE_DEBOUNCE_MS, onBookingChange, onOrderChange, onResync } from '../../services/live-updates';
import { chatSocketService } from '../../services/chat-socket.service';

const route = useRoute();
const router = useRouter();
const visitId = computed(() => String(route.params.id));

const visit = ref<Visit | null>(null);
const checkout = ref<VisitCheckout | null>(null);
const loading = ref(true);
const loadError = ref('');
const checkoutError = ref('');
const busy = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const childOrderStatuses = ref<Record<string, ServiceOrderItem['status']>>({});
const quotationOrderIdsBySequence = ref<Record<number, string>>({});
const childOrderStatusLoading = ref(false);
const childOrderStatusUnavailable = ref(false);
const expandedDevices = ref<Record<string, boolean>>({});
const selectedVisitItemId = ref<string | null>(null);
const checkoutLoading = ref(false);
const child = useVisitOrderDetails(() => visitId.value, load);
const { details: orderDetails, fresh: childDetailsFresh, deciding: childDeciding, feedback: childFeedback } = child;
const quotationChecks = ref<Record<string, string>>({});
const approvingOrderId = ref<string | null>(null);
const quotationFeedbackElement = ref<HTMLElement | null>(null);

async function focusQuotationFeedback(groupId: string, orderId: string, opener: Element | null) {
  await nextTick();
  if (!disposed && groupId === visitId.value && orderId === selectedOrderId.value
    && (document.activeElement === opener || document.activeElement === document.body)) quotationFeedbackElement.value?.focus({ preventScroll: true });
}

async function confirmChildQuotation(groupId: string, orderId: string, quotationId: string, allowRetry = false, failure?: unknown) {
  await load();
  if (disposed || groupId !== visitId.value) return;
  const latest = childDetailsFresh.value ? orderDetails.value[orderId]?.order : undefined;
  const quote = latest?.quotation;
  const failureStatus = (failure as { response?: { status?: number } } | undefined)?.response?.status;
  const rejected = failureStatus !== undefined && failureStatus >= 400 && failureStatus < 500 && failureStatus !== 409;
  if (quote?.id === quotationId && String(quote.status).toUpperCase() === 'APPROVED') {
    delete quotationChecks.value[orderId];
    childFeedback.value = { orderId, error: false, text: 'Đã duyệt báo giá của máy này.' };
  } else if (quote && quote.id !== quotationId) {
    delete quotationChecks.value[orderId];
    childFeedback.value = { orderId, error: true, text: 'Báo giá đã thay đổi. Vui lòng xem lại báo giá mới.' };
  } else if (latest && (allowRetry || rejected)) {
    delete quotationChecks.value[orderId];
    childFeedback.value = { orderId, error: true, text: failure ? userFacingError(failure, 'Chưa duyệt được báo giá. Vui lòng thử lại.') : 'Báo giá vẫn đang chờ duyệt. Vui lòng xem lại trước khi thử lại.' };
  } else {
    const reason = failure ? `${userFacingError(failure, 'Chưa duyệt được báo giá.')} ` : '';
    childFeedback.value = { orderId, error: true, text: `${reason}Chưa xác nhận được kết quả. Vui lòng kiểm tra trạng thái trước khi thực hiện lại.` };
  }
}

async function decideChildQuotation(orderId: string, action: 'APPROVE' | 'REJECT') {
  if (childDeciding.value || quotationChecks.value[orderId] || checkoutLoading.value) return;
  if (action === 'REJECT') return child.decide(orderId, action);
  const order = orderDetails.value[orderId]?.order;
  if (!childDetailsFresh.value || !canDecideOfficialQuotation(order) || !order?.quotation?.id) return;
  const groupId = visitId.value;
  const quotationId = order.quotation.id;
  const opener = document.activeElement;
  childDeciding.value = true;
  approvingOrderId.value = orderId;
  quotationChecks.value[orderId] = quotationId;
  childFeedback.value = null;
  let failure: unknown;
  try { await ordersApi.approveQuotation(quotationId); }
  catch (error) { failure = error; }
  try {
    if (!disposed && groupId === visitId.value) await confirmChildQuotation(groupId, orderId, quotationId, false, failure);
  } finally {
    childDeciding.value = false;
    approvingOrderId.value = null;
    await focusQuotationFeedback(groupId, orderId, opener);
  }
}

async function checkChildQuotation() {
  const orderId = selectedOrderId.value;
  const quotationId = orderId && quotationChecks.value[orderId];
  if (!orderId || !quotationId || childDeciding.value) return;
  const groupId = visitId.value;
  const opener = document.activeElement;
  childDeciding.value = true;
  try { await confirmChildQuotation(groupId, orderId, quotationId, true); }
  finally {
    childDeciding.value = false;
    await focusQuotationFeedback(groupId, orderId, opener);
  }
}
let disposed = false;
let runningLoad: Promise<void> | null = null;
let reloadRequested = false;
let childOrderLookupVersion = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const seenCashNotifications = new Set<string>();

function scheduleVisitRefresh() {
  if (disposed || refreshTimer !== null) return;
  checkoutLoading.value = true;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void load();
  }, LIVE_DEBOUNCE_MS);
}

async function loadChildOrderDetails(devices: VisitCheckout['devices'], lookupVersion: number) {
  if (lookupVersion !== childOrderLookupVersion) return;
  const seen = new Set<string>();
  const childOrders: Array<{ serviceOrderId: string; sequence: number; bookingId: string }> = [];
  for (const device of devices) {
    const serviceOrderId = device.serviceOrderId?.trim();
    if (!serviceOrderId || seen.has(serviceOrderId)) continue;
    seen.add(serviceOrderId);
    const item = visit.value?.items.find((candidate) => candidate.booking?.id === device.bookingId);
    if (!item) continue;
    childOrders.push({ serviceOrderId, sequence: item.sequence, bookingId: device.bookingId });
    if (childOrders.length === 3) break;
  }

  if (childOrders.length === 0) {
    child.publish({}, lookupVersion);
    childOrderStatusLoading.value = false;
    return;
  }

  childOrderStatusLoading.value = true;
  const results = await Promise.allSettled(childOrders.map(({ serviceOrderId, bookingId }) => child.read(serviceOrderId, bookingId, lookupVersion)));
  if (lookupVersion !== childOrderLookupVersion) return;

  const nextStatuses: Record<string, ServiceOrderItem['status']> = {};
  const nextQuotationOrderIds: Record<number, string> = {};
  let incompleteRead = false;
  const nextDetails: Record<string, OrderDetails> = {};
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      incompleteRead = true;
      return;
    }
    const childOrder = childOrders[index];
    if (!result.value || result.value.order.id !== childOrder.serviceOrderId) {
      incompleteRead = true;
      return;
    }
    nextDetails[childOrder.serviceOrderId] = result.value;
    nextStatuses[childOrder.serviceOrderId] = result.value.order.status;
    // Same Backend gate as CustomerOrderDetail: EN_ROUTE + an official SENT quotation.
    if (canDecideOfficialQuotation(result.value.order)) {
      nextQuotationOrderIds[childOrder.sequence] = childOrder.serviceOrderId;
    }
  });
  childOrderStatuses.value = nextStatuses;
  quotationOrderIdsBySequence.value = nextQuotationOrderIds;
  childOrderStatusUnavailable.value = incompleteRead;
  childOrderStatusLoading.value = false;
  child.publish(nextDetails, lookupVersion);
}

async function readVisit() {
  const groupId = visitId.value;
  const lookupVersion = child.invalidate();
  childOrderLookupVersion = lookupVersion;
  checkoutLoading.value = true;
  // Keep the rendered progress/quote labels during same-visit reads. Actions
  // remain disabled by fresh/checkoutLoading until the new child reads finish.
  childOrderStatusUnavailable.value = false;
  childOrderStatusLoading.value = false;
  loadError.value = '';
  checkoutError.value = '';
  try {
    const nextVisit = await visitGroupsApi.get(groupId);
    if (disposed || lookupVersion !== childOrderLookupVersion) return;
    if (nextVisit?.id !== groupId) throw new Error('Mismatched visit response');
    visit.value = nextVisit;
    const nextCheckout = await visitGroupsApi.checkout(groupId).catch(() => {
      if (lookupVersion === childOrderLookupVersion) checkoutError.value = 'Chưa tải được thông tin thanh toán. Vui lòng thử lại.';
      return null;
    });
    if (disposed || lookupVersion !== childOrderLookupVersion) return;
    const validCheckout = nextCheckout && nextCheckout.visitGroupId === groupId
      && Array.isArray(nextCheckout.devices) && billingAmount(nextCheckout.total) !== null
      && Number.isSafeInteger(nextCheckout.waiting) && nextCheckout.waiting >= 0
      && typeof nextCheckout.ready === 'boolean' && typeof nextCheckout.paid === 'boolean'
      && (!nextCheckout.pendingCash || billingAmount(nextCheckout.pendingCash.amount) !== null);
    checkout.value = validCheckout ? nextCheckout : null;
    if (!validCheckout) checkoutError.value = 'Chưa tải được thông tin thanh toán. Vui lòng thử lại.';
    if (checkout.value) await loadChildOrderDetails(checkout.value.devices, lookupVersion);
    else {
      child.publish({}, lookupVersion);
      childOrderStatusUnavailable.value = true;
    }
  } catch (err) {
    if (disposed || lookupVersion !== childOrderLookupVersion) return;
    loadError.value = userFacingError(err, 'Không tải được lượt sửa. Vui lòng thử lại.');
    checkout.value = null;
    child.publish({}, lookupVersion);
    childOrderStatusUnavailable.value = true;
  } finally {
    if (!disposed && lookupVersion === childOrderLookupVersion) {
      loading.value = false;
      checkoutLoading.value = reloadRequested || refreshTimer !== null;
    }
  }
}
function load(): Promise<void> {
  if (disposed) return Promise.resolve();
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (runningLoad) {
    reloadRequested = true;
    return runningLoad;
  }
  runningLoad = (async () => {
    do {
      reloadRequested = false;
      await readVisit();
    } while (reloadRequested && !disposed);
  })().finally(() => { runningLoad = null; });
  return runningLoad;
}
onMounted(load);
watch(visitId, () => {
  if (fundedVoucher.value && !checkout.value?.pendingCash) {
    void fundedCheckoutApi.release(fundedVoucher.value.reservation.id).catch(() => undefined);
    clearFundedVoucher();
  }
  seenCashNotifications.clear();
  childOrderLookupVersion = child.clear();
  quotationChecks.value = {};
  approvingOrderId.value = null;
  visit.value = null;
  checkout.value = null;
  childOrderStatuses.value = {};
  quotationOrderIdsBySequence.value = {};
  expandedDevices.value = {};
  selectedVisitItemId.value = null;
  message.value = null;
  cancelOpen.value = false;
  rescheduleOpen.value = false;
  loading.value = true;
  void load();
});

const checkoutOrderIds = computed(() => [...new Set((checkout.value?.devices ?? [])
  .flatMap((device) => device.serviceOrderId?.trim() ? [device.serviceOrderId.trim()] : []))].slice(0, 3));
const visitBookingIds = computed(() => [...new Set((visit.value?.items ?? [])
  .flatMap(item => item.booking?.id?.trim() ? [item.booking.id.trim()] : []))].slice(0, 3));
const stopOrderSubscriptions = new Map<string, () => void>();
const stopBookingSubscriptions = new Map<string, () => void>();
const stopVisitResync = onResync(scheduleVisitRefresh);
// Group cash does not change child orders. This recipient-scoped notification
// only wakes the authorized GET; it never supplies a payment verdict or amount.
const stopVisitEvents = chatSocketService.subscribe({
  onNotificationNew(event) {
    if (event.type?.toUpperCase() !== 'VISIT_CASH_DECLARED'
      || event.referenceType?.toUpperCase() !== 'VISIT_GROUP'
      || event.referenceId !== visitId.value || !event.id?.trim()
      || seenCashNotifications.has(event.id)) return;
    seenCashNotifications.add(event.id);
    if (seenCashNotifications.size > 100) {
      const oldest = seenCashNotifications.values().next().value;
      if (oldest) seenCashNotifications.delete(oldest);
    }
    scheduleVisitRefresh();
  },
});
let focusRefreshAt = -Infinity;
function resyncOnReturn() {
  if (document.visibilityState === 'hidden' || Date.now() - focusRefreshAt < 1000) return;
  focusRefreshAt = Date.now();
  scheduleVisitRefresh();
}
onMounted(() => {
  window.addEventListener('focus', resyncOnReturn);
  window.addEventListener('online', resyncOnReturn);
  document.addEventListener('visibilitychange', resyncOnReturn);
  voucherExpiryTimer = setInterval(() => {
    voucherClock.value = Date.now();
    if (fundedVoucher.value && Date.parse(fundedVoucher.value.reservation.expiresAt) <= voucherClock.value
      && !checkout.value?.pendingCash) {
      clearFundedVoucher();
      message.value = { type: 'error', text: 'Thời gian giữ voucher đã hết. Lượt sửa vẫn thanh toán theo trạng thái từ máy chủ.' };
    }
  }, 1000);
});
watch(checkoutOrderIds, (orderIds) => {
  const groupId = visitId.value;
  for (const [orderId, stop] of stopOrderSubscriptions) {
    if (!orderIds.includes(orderId)) {
      stop();
      stopOrderSubscriptions.delete(orderId);
    }
  }
  for (const orderId of orderIds) {
    if (!stopOrderSubscriptions.has(orderId)) {
      stopOrderSubscriptions.set(orderId, onOrderChange(orderId, () => {
        if (groupId === visitId.value) scheduleVisitRefresh();
      }));
    }
  }
}, { immediate: true });
// Booking IDs are available before acceptance creates any ServiceOrders.
watch(visitBookingIds, (bookingIds) => {
  const groupId = visitId.value;
  for (const [bookingId, stop] of stopBookingSubscriptions) {
    if (!bookingIds.includes(bookingId)) {
      stop();
      stopBookingSubscriptions.delete(bookingId);
    }
  }
  for (const bookingId of bookingIds) {
    if (!stopBookingSubscriptions.has(bookingId)) {
      stopBookingSubscriptions.set(bookingId, onBookingChange(bookingId, () => {
        if (groupId === visitId.value) scheduleVisitRefresh();
      }));
    }
  }
}, { immediate: true });
onUnmounted(() => {
  disposed = true;
  if (voucherExpiryTimer) clearInterval(voucherExpiryTimer);
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  childOrderLookupVersion = child.invalidate();
  for (const stop of stopOrderSubscriptions.values()) stop();
  stopOrderSubscriptions.clear();
  for (const stop of stopBookingSubscriptions.values()) stop();
  stopBookingSubscriptions.clear();
  stopVisitResync();
  stopVisitEvents();
  window.removeEventListener('focus', resyncOnReturn);
  window.removeEventListener('online', resyncOnReturn);
  document.removeEventListener('visibilitychange', resyncOnReturn);
});

const lead = computed(() => visit.value?.items.find((item) => item.booking?.id === visit.value?.leadBookingId)?.booking ?? null);
const cancelled = computed(() => visit.value?.status === 'cancelled');
const failedBookingIds = computed(() => {
  if (checkoutLoading.value || checkoutError.value) return [];
  return (visit.value?.items ?? []).flatMap(item => item.booking?.id
    && checkout.value?.devices.some(device => device.bookingId === item.booking!.id && device.state === 'failed') ? [item.booking.id] : []);
});
const held = computed(() => (checkout.value?.devices ?? []).some((device) => device.serviceOrderId));
const matchingState = computed(() => lead.value?.status ?? 'SUBMITTED');
const canChooseTechnician = computed(() => !checkoutLoading.value && !checkoutError.value && !cancelled.value && !held.value && ['SUBMITTED', 'CLOSED'].includes(matchingState.value));
const rescheduled = computed(() => (visit.value?.items ?? []).some((item) => (item.booking?.rescheduleCount ?? 0) >= 1));
const repairStarted = computed(() => (checkout.value?.devices ?? []).some((device) => device.state !== 'open')
  || childOrderStatusLoading.value
  || childOrderStatusUnavailable.value
  || Object.values(childOrderStatuses.value).some((status) => status === 'UNDER_REPAIR'));
const canReschedule = computed(() => !checkoutLoading.value && !checkoutError.value && !cancelled.value && !rescheduled.value && !repairStarted.value);
const canCancel = computed(() => !checkoutLoading.value && !checkoutError.value && !cancelled.value && !repairStarted.value);
const outcomeProgress = computed(() => {
  if (cancelled.value || !checkout.value) return null;
  const devices = checkout.value.devices;
  return { resolved: devices.filter((device) => device.state !== 'open').length, total: devices.length };
});

const sessionText = computed(() => visit.value ? sessionLabel({ bookingMode: visit.value.bookingMode, slot: visit.value.slot, start: visit.value.preferredStartAt }) : '');
const selectedVisitItem = computed(() => visit.value?.items.find((item) => item.id === selectedVisitItemId.value)
  ?? visit.value?.items[0]
  ?? null);
const selectedOrderId = computed(() => deviceOf(selectedVisitItem.value?.booking?.id)?.serviceOrderId ?? null);
const selectedDetails = computed(() => selectedOrderId.value ? orderDetails.value[selectedOrderId.value] : null);
const sharedTechnician = computed(() => {
  const orders = Object.values(orderDetails.value).map(bundle => bundle.order);
  const technician = orders.find(order => order.technician?.id)?.technician;
  if (!technician || childOrderStatusUnavailable.value || childOrderStatusLoading.value
    || orders.some(order => order.technician?.id && order.technician.id !== technician.id)) return null;
  return technician;
});
const sharedAddress = computed(() => lead.value?.addressSummary?.trim()
  || Object.values(orderDetails.value).find(bundle => bundle.order.addressSummary?.trim())?.order.addressSummary || '');
const technicianProgress = computed(() => {
  if (cancelled.value) return 'Lượt sửa đã kết thúc';
  if (childOrderStatusLoading.value) return 'Đang cập nhật tiến độ';
  const statuses = Object.values(childOrderStatuses.value).map(status => status.toUpperCase());
  if (statuses.includes('UNDER_REPAIR')) return 'Đang sửa chữa';
  if (statuses.includes('EN_ROUTE')) return 'Đang di chuyển';
  if (statuses.includes('ACCEPTED')) return 'Đã nhận lượt sửa';
  if (statuses.length && statuses.every(status => ['COMPLETED', 'CANCELLED'].includes(status))) return 'Đã có kết quả các máy';
  if (held.value) return 'Chờ cập nhật tiến độ';
  if (matchingState.value === 'MATCHED') return 'Đã ghép kỹ thuật viên cho lượt';
  return matchingState.value === 'MATCHING' ? 'Đang chờ thợ nhận' : 'Chưa có kỹ thuật viên nhận lượt';
});
function pendingCosts(item: Visit['items'][number]) {
  const orderId = deviceOf(item.booking?.id)?.serviceOrderId;
  const bundle = orderId ? orderDetails.value[orderId] : null;
  return !!bundle && bundle.costs.some(cost => child.canDecideCost(bundle, cost));
}
async function openQuotation(item: Visit['items'][number]) {
  selectedVisitItemId.value = item.id;
  await nextTick();
  document.querySelector<HTMLElement>('[data-testid="visit-inline-quotation"]')?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  document.querySelector<HTMLButtonElement>('[data-testid="visit-quote-approve"]')?.focus({ preventScroll: true });
}

const STATE_LABEL: Record<VisitDeviceState, string> = {
  succeeded: 'Đã sửa xong',
  failed: 'Không sửa được, không tính tiền sửa',
  quote_declined: 'Bạn không duyệt báo giá, không tính tiền',
  cancelled: 'Đã huỷ',
  open: 'Đang xử lý',
};
function deviceOf(bookingId: string | undefined) {
  return checkout.value?.devices.find((device) => device.bookingId === bookingId) ?? null;
}

type FinalInvoiceLine = { id: string; description: string; quantity: number; unitPrice: number; lineTotal: number };

function invoiceSummaryRow(item: Visit['items'][number]) {
  const unknown = { item, amount: null as number | null, lines: [] as FinalInvoiceLine[],
    fees: [] as Array<{ label: string; amount: number }>, status: 'Chưa đối chiếu được hóa đơn' };
  const devices = checkout.value?.devices ?? [];
  const bookingId = item.booking?.id;
  const matches = devices.filter(device => device.bookingId === bookingId);
  if (!bookingId || matches.length !== 1
    || visit.value?.items.filter(candidate => candidate.booking?.id === bookingId).length !== 1) return unknown;
  const device = matches[0]!;
  if (device.state === 'open') return { ...unknown, status: 'Chờ chốt hóa đơn' };
  if (['failed', 'quote_declined', 'cancelled'].includes(device.state)) {
    return billingAmount(device.amount) === 0 && !device.invoiceId
      ? { ...unknown, amount: 0, status: STATE_LABEL[device.state] } : unknown;
  }
  if (device.state !== 'succeeded' || !device.serviceOrderId || !device.invoiceId
    || devices.filter(candidate => candidate.serviceOrderId === device.serviceOrderId).length !== 1
    || devices.filter(candidate => candidate.invoiceId === device.invoiceId).length !== 1) return unknown;
  const bundle = orderDetails.value[device.serviceOrderId];
  const invoice = bundle?.invoice;
  const amount = billingAmount(invoice?.grandTotal);
  if (!bundle || bundle.invoiceError || !invoice || invoice.id !== device.invoiceId
    || invoice.serviceOrderId !== device.serviceOrderId || bundle.order.bookingId !== bookingId
    || !(bundle.order.completionRequestedAt || bundle.order.status.toUpperCase() === 'COMPLETED')
    || amount === null || amount !== billingAmount(device.amount) || !Array.isArray(invoice.items)) return unknown;

  const lines: FinalInvoiceLine[] = [];
  const lineIds = new Set<string>();
  for (const value of invoice.items as unknown[]) {
    if (!value || typeof value !== 'object') return unknown;
    const line = value as Record<string, unknown>;
    const unitPrice = billingAmount(line.unitPrice);
    const lineTotal = billingAmount(line.lineTotal);
    if (typeof line.id !== 'string' || !line.id.trim() || lineIds.has(line.id) || line.invoiceId !== invoice.id
      || typeof line.description !== 'string' || !line.description.trim()
      || typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || unitPrice === null || lineTotal === null) return unknown;
    lineIds.add(line.id);
    lines.push({ id: line.id, description: line.description, quantity: line.quantity, unitPrice, lineTotal });
  }
  const fees: Array<{ label: string; amount: number }> = [];
  for (const [field, label] of [['shippingFee', 'Phí giao linh kiện'], ['technicianPartWarrantyFeeTotal', 'Phí bảo hành linh kiện']] as const) {
    if (invoice[field] == null) continue;
    const fee = billingAmount(invoice[field]);
    if (fee === null) return unknown;
    if (fee > 0) fees.push({ label, amount: fee });
  }
  if (amount > 0 && !lines.length && !fees.length) return unknown;
  return { item, amount, lines, fees, status: device.paid ? 'Đã thanh toán' : 'Chưa thanh toán' };
}

// Display only: checkout.total is the server's UNPAID gross, not the visit's
// historical invoice gross. Never use this summary to decide payment amounts.
const invoiceSummary = computed(() => {
  const rows = (visit.value?.items ?? []).map(invoiceSummaryRow);
  const confirmed = rows.filter(row => row.amount !== null);
  const gross = confirmed.reduce((total, row) => total + row.amount!, 0);
  return { rows, pending: rows.length - confirmed.length,
    gross: confirmed.length && Number.isSafeInteger(gross) ? gross : null,
    unpaid: checkout.value ? billingAmount(checkout.value.total) : null };
});

function statusText(item: Visit['items'][number]): string {
  const device = deviceOf(item.booking?.id);
  // The child outcome is more specific than the parent visit status. A failed
  // repair closes its order, but it does not mean the customer cancelled it.
  if (device && device.state !== 'open') return STATE_LABEL[device.state];
  if (device?.state === 'open' && quotationOrderId(item)) return 'Chờ bạn duyệt báo giá';
  if (device?.state === 'open' && pendingCosts(item)) return 'Chờ duyệt phát sinh';
  if (cancelled.value) return 'Đã huỷ';
  if (device?.serviceOrderId) return STATE_LABEL[device.state];
  if (matchingState.value === 'MATCHING') return 'Đang chờ thợ nhận';
  if (matchingState.value === 'CLOSED') return 'Chưa có thợ nhận';
  return 'Chưa chọn thợ';
}
function chipStatusText(item: Visit['items'][number]): string {
  const state = deviceOf(item.booking?.id)?.state;
  if (state === 'failed') return 'Không sửa được';
  if (state === 'quote_declined') return 'Đã từ chối báo giá';
  return statusText(item);
}
function hasDeviceDetails(item: Visit['items'][number]): boolean {
  return Boolean(item.booking && (item.booking.description?.trim() || item.booking.media?.length));
}
function isDeviceExpanded(itemId: string): boolean {
  return expandedDevices.value[itemId] === true;
}
function toggleDeviceDetails(itemId: string) {
  expandedDevices.value = { ...expandedDevices.value, [itemId]: !isDeviceExpanded(itemId) };
}
function quotationOrderId(item: Visit['items'][number]): string | null {
  return quotationOrderIdsBySequence.value[item.sequence] ?? null;
}
const priorityQuotation = computed(() => {
  const item = visit.value?.items.find((candidate) => quotationOrderId(candidate));
  if (!item) return null;
  const serviceOrderId = quotationOrderId(item);
  return serviceOrderId ? { item, serviceOrderId } : null;
});

// ── Reschedule, once for the whole visit ──
const rescheduleOpen = ref(false);
const sessions = ref<SessionOption[]>([]);
const chosenSession = ref<{ date: string; slot: BookingSlot } | null>(null);
async function openReschedule() {
  rescheduleOpen.value = true;
  chosenSession.value = null;
  sessions.value = upcomingSessions(14);
  if (held.value && visit.value?.leadBookingId) {
    sessions.value = await visitGroupsApi.availableSessions(visit.value.leadBookingId).catch(() => upcomingSessions(14));
  }
}
async function saveReschedule() {
  if (!chosenSession.value || busy.value) return;
  busy.value = true;
  const groupId = visitId.value;
  try {
    await visitGroupsApi.reschedule(groupId, chosenSession.value);
    if (disposed || groupId !== visitId.value) return;
    rescheduleOpen.value = false;
    message.value = { type: 'success', text: 'Đã đổi lịch hẹn cho cả lượt sửa.' };
    await load();
  } catch (err) {
    if (disposed || groupId !== visitId.value) return;
    message.value = { type: 'error', text: userFacingError(err, 'Chưa đổi được lịch. Vui lòng chọn buổi khác.') };
  } finally {
    busy.value = false;
  }
}

// ── Cancel the whole visit ──
const cancelOpen = ref(false);
async function confirmCancel() {
  if (busy.value) return;
  busy.value = true;
  const groupId = visitId.value;
  try {
    await visitGroupsApi.cancel(groupId, 'Khách huỷ lượt sửa');
    if (disposed || groupId !== visitId.value) return;
    cancelOpen.value = false;
    message.value = { type: 'success', text: 'Đã huỷ lượt sửa.' };
    await load();
  } catch (err) {
    if (disposed || groupId !== visitId.value) return;
    message.value = { type: 'error', text: userFacingError(err, 'Chưa huỷ được lượt sửa.') };
  } finally {
    busy.value = false;
  }
}

// ── One payment for the visit ──
type PayMethod = 'wallet' | 'vnpay' | 'cash';
type CheckoutState = 'waiting' | 'paid' | 'pending_cash' | 'zero_due' | 'wallet_short' | 'vnpay' | 'ready';
const payMethod = ref<PayMethod>('wallet');
const cashInstructionsOpen = ref(false);
const fundedVoucher = ref<{ reservation: FundedReservation; preview: VoucherCheckoutPreview } | null>(null);
const voucherClock = ref(Date.now());
const activeFundedVoucher = computed(() => fundedVoucher.value
  && fundedVoucher.value.reservation.scopeId === visitId.value
  && (Date.parse(fundedVoucher.value.reservation.expiresAt) > voucherClock.value || !!checkout.value?.pendingCash)
  ? fundedVoucher.value : null);
let voucherExpiryTimer: ReturnType<typeof setInterval> | null = null;
const walletBalance = ref<number | null>(null);
const walletError = ref(false);
const voucherDue = computed(() => activeFundedVoucher.value?.preview.customerDueVnd ?? checkout.value?.total ?? 0);
const walletCovers = computed(() => walletBalance.value !== null && checkout.value !== null && walletBalance.value >= voucherDue.value);
const vnpayAllowed = computed(() => voucherDue.value >= 5000);
const payMethods = computed<PayMethod[]>(() => (['wallet', 'vnpay', 'cash'] as PayMethod[]).filter((method) =>
  method !== 'vnpay' || vnpayAllowed.value));
function selectPayMethod(method: PayMethod) {
  payMethod.value = method;
}
function onPayMethodKey(event: KeyboardEvent, method: PayMethod) {
  if (busy.value || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const methods = payMethods.value;
  const direction = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? methods.length - 1
    : (methods.indexOf(method) + direction + methods.length) % methods.length;
  payMethod.value = methods[index];
  const current = event.currentTarget as HTMLButtonElement;
  current.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
}
const checkoutState = computed<CheckoutState>(() => {
  const current = checkout.value;
  if (current?.paid) return 'paid';
  if (!current || current.waiting > 0 || !current.ready) return 'waiting';
  if (current.pendingCash) return 'pending_cash';
  if (current.total <= 0) return 'zero_due';
  if (payMethod.value === 'wallet' && walletBalance.value !== null && !walletCovers.value) return 'wallet_short';
  if (payMethod.value === 'vnpay' && vnpayAllowed.value) return 'vnpay';
  return 'ready';
});
watch(payMethods, (methods) => {
  if (!methods.includes(payMethod.value)) payMethod.value = 'wallet';
});
watch(payMethod, (method) => {
  if (method !== 'cash') cashInstructionsOpen.value = false;
});
watch(checkoutState, (state) => {
  if (state !== 'ready') cashInstructionsOpen.value = false;
});
function openCashInstructions() {
  if (checkoutLoading.value || busy.value || payMethod.value !== 'cash' || checkoutState.value !== 'ready' || !checkout.value) return;
  cashInstructionsOpen.value = true;
  void nextTick(() => document.querySelector<HTMLElement>('[data-testid="visit-cash-instructions"]')?.focus());
}
async function loadWallet() {
  walletError.value = false;
  walletBalance.value = await customerWalletApi.summary(1, 1).then((wallet) => wallet.balance).catch(() => {
    walletError.value = true;
    return null;
  });
}
onMounted(loadWallet);

function clearFundedVoucher() { fundedVoucher.value = null; }
function reservationForAction(): FundedReservation | null | undefined {
  const held = fundedVoucher.value;
  if (!held) return null;
  if (held.reservation.scopeId !== visitId.value || Date.parse(held.reservation.expiresAt) <= Date.now()) {
    clearFundedVoucher();
    message.value = { type: 'error', text: 'Thời gian giữ voucher đã hết hoặc lượt thanh toán đã đổi. Hãy kiểm tra lại số tiền trước khi tiếp tục.' };
    return undefined;
  }
  return held.reservation;
}

async function handleVoucherApplied(value: { reservation: FundedReservation; preview: VoucherCheckoutPreview }) {
  if (value.reservation.scopeId !== visitId.value || value.preview.scopeId !== visitId.value
    || value.reservation.claimId !== value.preview.claimId || value.preview.paymentAvailable !== true) {
    message.value = { type: 'error', text: 'Máy chủ chưa xác nhận voucher cho lượt thanh toán này.' };
    return;
  }
  fundedVoucher.value = value;
  message.value = null;
  if (value.preview.customerDueVnd !== 0) return;
  const held = reservationForAction();
  if (!held) return;
  busy.value = true;
  const groupId = visitId.value;
  try {
    await fundedCheckoutApi.zero({ kind: 'VISIT_GROUP', id: groupId }, held.id);
    if (disposed || groupId !== visitId.value) return;
    clearFundedVoucher();
    message.value = { type: 'success', text: 'Máy chủ đã xác nhận tất toán voucher với số tiền khách hàng cần trả là 0 ₫.' };
    await load();
  } catch (err) {
    if (!disposed && groupId === visitId.value) message.value = { type: 'error', text: userFacingError(err, 'Máy chủ chưa xác nhận được tất toán 0 ₫. Voucher vẫn giữ chỗ đến khi hết hạn; chưa ghi nhận thanh toán.') };
  } finally {
    busy.value = false;
  }
}

async function payWithWallet() {
  if (checkoutLoading.value || busy.value || checkoutState.value === 'waiting' || checkoutState.value === 'paid' || checkoutState.value === 'pending_cash' || checkoutState.value === 'zero_due' || !walletCovers.value) return;
  busy.value = true;
  const groupId = visitId.value;
  const hadFundedVoucher = !!fundedVoucher.value;
  const held = reservationForAction();
  if (hadFundedVoucher && !held) { busy.value = false; return; }
  try {
    const result = held
      ? await fundedCheckoutApi.wallet({ kind: 'VISIT_GROUP', id: groupId }, held.id)
      : await visitGroupsApi.payWithWallet(groupId);
    if (disposed || groupId !== visitId.value) return;
    message.value = { type: 'success', text: `Đã thanh toán ${result.amount.toLocaleString('vi-VN')} ₫ bằng ví.` };
    if (held) clearFundedVoucher();
    await Promise.all([load(), loadWallet()]);
  } catch (err) {
    if (disposed || groupId !== visitId.value) return;
    message.value = { type: 'error', text: userFacingError(err, 'Chưa thanh toán được bằng ví.') };
  } finally {
    busy.value = false;
  }
}
async function payWithVnpay() {
  if (checkoutLoading.value || busy.value || !vnpayAllowed.value || checkoutState.value === 'waiting' || checkoutState.value === 'paid' || checkoutState.value === 'pending_cash' || checkoutState.value === 'zero_due') return;
  busy.value = true;
  const groupId = visitId.value;
  const hadFundedVoucher = !!fundedVoucher.value;
  const held = reservationForAction();
  if (hadFundedVoucher && !held) { busy.value = false; return; }
  try {
    const url = held
      ? await fundedCheckoutApi.vnpay({ kind: 'VISIT_GROUP', id: groupId }, held.id)
      : await visitGroupsApi.vnpayUrl(groupId);
    if (disposed || groupId !== visitId.value) { busy.value = false; return; }
    window.location.href = url;
  } catch (err) {
    if (!disposed && groupId === visitId.value) message.value = { type: 'error', text: userFacingError(err, 'Chưa mở được trang thanh toán VNPay. Vui lòng thử lại.') };
    busy.value = false;
  }
}
async function answerCash(agreed: boolean) {
  if (checkoutLoading.value || busy.value || checkoutState.value !== 'pending_cash') return;
  busy.value = true;
  const groupId = visitId.value;
  const held = fundedVoucher.value?.reservation ?? null;
  if (held && held.scopeId !== groupId) {
    busy.value = false;
    message.value = { type: 'error', text: 'Mã giữ voucher không khớp với lượt này. Chưa gửi xác nhận tiền mặt.' };
    return;
  }
  try {
    if (held) await fundedCheckoutApi.confirmCash({ kind: 'VISIT_GROUP', id: groupId }, held.id, agreed
      ? { agreed: true }
      : { agreed: false, disputeReason: 'Số tiền mặt chưa đúng' });
    else await visitGroupsApi.confirmCash(groupId, agreed, agreed ? undefined : 'Số tiền mặt chưa đúng');
    if (disposed || groupId !== visitId.value) return;
    if (held && agreed) clearFundedVoucher();
    message.value = agreed
      ? { type: 'success', text: 'Đã xác nhận trả tiền mặt.' }
      : { type: 'success', text: 'Đã báo FixHome kiểm tra lại số tiền mặt.' };
    await load();
  } catch (err) {
    if (disposed || groupId !== visitId.value) return;
    message.value = { type: 'error', text: userFacingError(err, agreed ? 'Chưa xác nhận được.' : 'Chưa gửi được yêu cầu kiểm tra tiền mặt. Vui lòng thử lại.') };
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto min-w-0 max-w-3xl space-y-6 pb-16" data-testid="customer-visit">
    <FhBackLink class="min-h-11" label="Đơn của tôi" @click="router.push('/app/orders')" />

    <FhSkeleton v-if="loading" class="h-40 rounded-2xl" />
    <div v-else-if="loadError" role="alert" class="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
      {{ loadError }}
      <FhButton variant="secondary" size="md" class="ml-2" @click="load">Thử lại</FhButton>
    </div>

    <template v-else-if="visit">
      <header class="space-y-4">
        <div class="space-y-1">
          <h1 class="text-2xl leading-8 font-bold tracking-tight text-ink-900 sm:text-[28px] sm:leading-9">Lượt sửa {{ visit.items.length }} thiết bị</h1>
          <p class="text-sm text-ink-600">Một kỹ thuật viên phụ trách cả lượt · Một lịch hẹn · Thanh toán một lần</p>
        </div>
        <div class="divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white px-4 sm:px-6">
          <div class="flex flex-wrap items-center justify-between gap-2 py-4" data-testid="visit-shared-technician">
            <div class="min-w-0 flex-1 basis-48">
              <h2 class="text-sm font-medium text-ink-600">Kỹ thuật viên phụ trách cả lượt</h2>
              <p v-if="sharedTechnician" class="break-words text-base font-semibold text-ink-900">{{ sharedTechnician.fullName }}</p>
              <p class="text-sm text-ink-700" role="status">{{ technicianProgress }}</p>
            </div>
            <a v-if="sharedTechnician?.phoneNumber && /^[+\d\s()-]+$/.test(sharedTechnician.phoneNumber)" :href="`tel:${sharedTechnician.phoneNumber}`" class="inline-flex min-h-11 items-center rounded-xl border border-ink-200 px-3 text-sm font-semibold text-brand-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">Gọi {{ sharedTechnician.phoneNumber }}</a>
          </div>
          <dl class="space-y-3 py-4 text-sm">
            <div class="space-y-1"><dt class="text-ink-600">Lịch hẹn chung</dt><dd class="font-medium text-ink-900">{{ sessionText }}<template v-if="cancelled"> · Đã huỷ</template></dd></div>
            <div v-if="sharedAddress" class="space-y-1"><dt class="text-ink-600">Địa chỉ chung</dt><dd class="break-words font-medium text-ink-900" data-testid="visit-shared-address">{{ sharedAddress }}</dd></div>
          </dl>
        </div>
        <p v-if="outcomeProgress" class="text-sm text-ink-600" data-testid="visit-outcome-progress">
          Kết quả {{ outcomeProgress.resolved }}/{{ outcomeProgress.total }} thiết bị
        </p>
      </header>

      <section v-if="priorityQuotation" class="flex flex-col gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-4 sm:flex-row sm:items-center" data-testid="visit-quotation-priority">
        <div class="min-w-0 flex-1 break-words">
          <p class="text-sm font-semibold text-ink-900">
            Máy {{ priorityQuotation.item.sequence }}<template v-if="priorityQuotation.item.booking?.serviceName">: {{ priorityQuotation.item.booking.serviceName }}</template>
            <template v-if="priorityQuotation.item.deviceLabel"> · {{ priorityQuotation.item.deviceLabel }}</template>
          </p>
          <p class="text-sm text-warning-800">Báo giá đang chờ bạn duyệt</p>
        </div>
        <button
          type="button"
          :disabled="checkoutLoading"
          @click="openQuotation(priorityQuotation.item)"
          :aria-label="`Duyệt báo giá cho máy ${priorityQuotation.item.sequence}${priorityQuotation.item.booking?.serviceName ? `: ${priorityQuotation.item.booking.serviceName}` : ''}`"
          class="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white transition-colors motion-reduce:transition-none duration-120 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:w-auto"
          data-testid="visit-quotation-cta"
        >
          Duyệt báo giá máy {{ priorityQuotation.item.sequence }}
          <ChevronRight :size="18" aria-hidden="true" />
        </button>
      </section>

      <p
        v-if="message"
        :role="message.type === 'error' ? 'alert' : 'status'"
        data-testid="visit-action-message"
        class="rounded-xl border px-3.5 py-2.5 text-sm"
        :class="message.type === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'"
      >{{ message.text }}</p>

      <section class="space-y-3" data-testid="visit-device-list">
        <h2 class="text-base font-semibold text-ink-900">Dịch vụ từng máy</h2>
        <FhButton
          v-if="failedBookingIds.length > 1"
          variant="secondary"
          size="md"
          data-testid="failed-repair-rebook-all"
          @click="router.push({ path: '/app/bookings/new', query: { repairFailure: failedBookingIds.join(',') } })"
        >Đặt lại {{ failedBookingIds.length }} máy không sửa được</FhButton>
        <div class="grid gap-2 sm:grid-cols-3" role="group" aria-label="Chọn thiết bị trong lượt" data-testid="visit-device-selector">
          <button
            v-for="item in visit.items"
            :key="item.id"
            type="button"
            class="visit-device min-h-11 min-w-0 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            :class="selectedVisitItem?.id === item.id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-300'"
            :aria-pressed="selectedVisitItem?.id === item.id"
            :aria-controls="selectedVisitItem?.id === item.id ? `visit-device-panel-${item.sequence}` : undefined"
            :aria-label="`Chọn máy ${item.sequence}${item.booking?.serviceName ? `: ${item.booking.serviceName}` : ''}, ${statusText(item)}`"
            :id="`visit-device-select-${item.sequence}`"
            :data-testid="`visit-device-select-${item.sequence}`"
            @click="selectedVisitItemId = item.id"
          >
            <span class="flex items-center justify-between gap-1 text-sm font-semibold" :class="selectedVisitItem?.id === item.id ? 'text-brand-800' : 'text-ink-900'">
              Máy {{ item.sequence }}
              <span v-if="quotationOrderId(item) || pendingCosts(item)" class="h-2 w-2 shrink-0 rounded-full bg-warning-600" aria-label="Cần duyệt báo giá" />
            </span>
            <span class="mt-1 block break-words text-sm text-ink-700">{{ item.booking?.serviceName || item.deviceLabel || 'Thiết bị' }}</span>
            <span class="mt-1 block break-words text-xs leading-relaxed" :class="quotationOrderId(item) ? 'font-medium text-warning-800' : 'text-ink-600'">{{ chipStatusText(item) }}</span>
          </button>
        </div>

        <div
          v-if="selectedVisitItem"
          :id="`visit-device-panel-${selectedVisitItem.sequence}`"
          class="rounded-2xl border border-ink-200 bg-white p-3.5 sm:p-4"
          role="region"
          :aria-labelledby="`visit-device-select-${selectedVisitItem.sequence}`"
          :data-testid="`visit-device-panel-${selectedVisitItem.sequence}`"
        >
          <div class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 px-1 py-1">
            <div class="min-w-0 flex-[1_1_12rem]">
              <p class="break-words text-sm font-medium text-ink-900 sm:text-base">
                Máy {{ selectedVisitItem.sequence }}<template v-if="selectedVisitItem.booking?.serviceName">: {{ selectedVisitItem.booking.serviceName }}</template>
              </p>
              <p class="break-words text-sm text-ink-600"><template v-if="selectedVisitItem.deviceLabel">{{ selectedVisitItem.deviceLabel }} · </template>{{ statusText(selectedVisitItem) }}</p>
            </div>
            <span v-if="deviceOf(selectedVisitItem.booking?.id)?.state === 'succeeded'" class="whitespace-nowrap text-sm font-semibold text-ink-900 font-num"><FhMoney :amount="deviceOf(selectedVisitItem.booking?.id)!.amount" /></span>
          </div>
          <p v-if="quotationOrderId(selectedVisitItem)" class="mt-2 text-sm font-medium text-warning-800" :data-testid="`visit-device-quotation-status-${selectedVisitItem.sequence}`">
            Báo giá đang chờ bạn duyệt
          </p>
          <div v-if="hasDeviceDetails(selectedVisitItem)" class="mt-2 space-y-2.5">
            <div :id="`visit-device-details-${selectedVisitItem.sequence}`" class="space-y-3">
              <p v-if="selectedVisitItem.booking?.description?.trim()" class="break-words text-pretty text-sm text-ink-700 whitespace-pre-line" :class="isDeviceExpanded(selectedVisitItem.id) ? '' : 'line-clamp-2'" :data-testid="`visit-device-description-${selectedVisitItem.sequence}`">
                {{ selectedVisitItem.booking.description }}
              </p>
              <BookingMediaViewer
                v-if="isDeviceExpanded(selectedVisitItem.id) && selectedVisitItem.booking?.media?.length"
                :booking-id="selectedVisitItem.booking.id"
                :media="selectedVisitItem.booking.media"
                embedded
              />
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span v-if="selectedVisitItem.booking?.media?.length" class="text-xs text-ink-600" :data-testid="`visit-device-media-count-${selectedVisitItem.sequence}`">
                {{ selectedVisitItem.booking.media.length }} ảnh/video
              </span>
              <FhButton
                variant="ghost"
                size="md"
                :aria-expanded="isDeviceExpanded(selectedVisitItem.id)"
                :aria-controls="`visit-device-details-${selectedVisitItem.sequence}`"
                :aria-label="`${isDeviceExpanded(selectedVisitItem.id) ? 'Thu gọn' : 'Xem thêm'} chi tiết máy ${selectedVisitItem.sequence}`"
                class="ml-auto"
                :data-testid="`visit-device-expand-${selectedVisitItem.sequence}`"
                @click="toggleDeviceDetails(selectedVisitItem.id)"
              >{{ isDeviceExpanded(selectedVisitItem.id) ? 'Thu gọn' : 'Xem thêm' }}<ChevronDown :size="16" class="transition-transform motion-reduce:transition-none" :class="{ 'rotate-180': isDeviceExpanded(selectedVisitItem.id) }" aria-hidden="true" /></FhButton>
            </div>
          </div>
          <p v-if="childFeedback && childFeedback.orderId === selectedOrderId" ref="quotationFeedbackElement" tabindex="-1" data-testid="quotation-feedback" :role="childFeedback.error ? 'alert' : 'status'" class="mt-3 text-sm" :class="childFeedback.error ? 'text-danger-700' : 'text-success-700'">{{ childFeedback.text }}</p>
          <p v-if="approvingOrderId && approvingOrderId === selectedOrderId" role="status" class="mt-3 text-sm text-ink-600">Đang duyệt báo giá và kiểm tra trạng thái…</p>
          <FhButton v-if="selectedOrderId && quotationChecks[selectedOrderId] && approvingOrderId !== selectedOrderId" variant="secondary" size="md" :disabled="childDeciding || checkoutLoading" data-testid="quotation-check-status" @click="checkChildQuotation">Kiểm tra trạng thái</FhButton>
          <FailedRepairIncident
            v-if="!checkoutLoading && !checkoutError && selectedVisitItem.booking && deviceOf(selectedVisitItem.booking.id)?.state === 'failed'"
            :key="selectedVisitItem.booking.id"
            :booking-id="selectedVisitItem.booking.id"
            @rebook="bookingId => router.push({ path: '/app/bookings/new', query: { repairFailure: bookingId } })"
            @later="router.push('/app')"
          />
          <VisitOrderDetails
            v-if="selectedDetails"
            :key="selectedDetails.order.id"
            :details="selectedDetails"
            :disabled="!childDetailsFresh || childDeciding || checkoutLoading || !!quotationChecks[selectedDetails.order.id]"
            @quote="decideChildQuotation(selectedDetails.order.id, $event)"
            @cost="(id, action, consent) => selectedDetails && child.decide(selectedDetails.order.id, action, id, consent)"
            @retry="load"
          />
          <CustomerStopReplaceRequest
            v-if="selectedDetails && childDetailsFresh"
            :key="`stop-replace-${selectedDetails.order.id}`"
            :order-id="selectedDetails.order.id"
            :order-status="selectedDetails.order.status"
          />
          <div v-else-if="selectedOrderId" class="mt-4 space-y-2 border-t border-ink-100 pt-4">
            <FhSkeleton v-if="childOrderStatusLoading" class="h-24 rounded-xl" />
            <template v-else><p class="text-sm text-ink-600">Chưa tải được báo giá và chi tiết máy này.</p><FhButton variant="secondary" size="md" @click="load">Thử lại</FhButton></template>
          </div>

        </div>
      </section>

      <section v-if="!cancelled" class="flex flex-wrap gap-2.5">
        <FhButton v-if="canChooseTechnician" variant="primary" size="md" data-testid="visit-choose-technician" @click="router.push(`/app/visits/${visitId}/candidates`)">
          {{ matchingState === 'CLOSED' ? 'Chọn kỹ thuật viên khác cho cả lượt' : `Chọn 1 kỹ thuật viên sửa cả ${visit.items.length} thiết bị` }}
        </FhButton>
        <FhButton v-if="canReschedule" variant="secondary" size="md" data-testid="visit-reschedule" @click="openReschedule">Đổi lịch hẹn</FhButton>
        <FhButton v-else-if="rescheduled && !repairStarted" variant="secondary" size="md" disabled data-testid="visit-reschedule-used">Đã đổi lịch một lần</FhButton>
        <FhButton v-if="canCancel" variant="ghost" size="md" class="text-danger-700" data-testid="visit-cancel" @click="cancelOpen = true">Huỷ lượt sửa</FhButton>
      </section>

      <!-- One payment for the devices repaired, once every device has its result. -->
      <section v-if="invoiceSummary.rows.length" class="rounded-2xl border border-ink-200 bg-white p-4 text-sm sm:p-6" aria-labelledby="visit-invoice-summary-title" :aria-busy="checkoutLoading" data-testid="visit-invoice-summary">
        <h2 id="visit-invoice-summary-title" class="text-base font-semibold text-ink-900">Hóa đơn cả lượt · {{ invoiceSummary.rows.length }} máy</h2>
        <p v-if="checkoutLoading" role="status" class="mt-2 text-ink-600">Đang cập nhật hóa đơn…</p>
        <ul class="mt-3 divide-y divide-ink-100">
          <li v-for="row in invoiceSummary.rows" :key="row.item.id" class="py-3" :data-testid="`visit-invoice-row-${row.item.sequence}`">
            <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div class="min-w-0 flex-1 basis-36">
                <p class="break-words font-medium text-ink-900">Máy {{ row.item.sequence }}<template v-if="row.item.booking?.serviceName"> · {{ row.item.booking.serviceName }}</template></p>
                <p class="mt-0.5 text-xs text-ink-600">{{ row.status }}</p>
              </div>
              <FhMoney v-if="row.amount !== null" :amount="row.amount" class="shrink-0 whitespace-nowrap" data-testid="visit-invoice-amount" />
              <span v-else class="text-ink-600">Chưa xác định</span>
            </div>
            <details v-if="row.lines.length || row.fees.length" class="group mt-1 text-ink-600">
              <summary class="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"><span>Chi tiết hóa đơn máy {{ row.item.sequence }}</span><ChevronDown :size="16" class="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
              <ul class="space-y-2 pb-1">
                <li v-for="line in row.lines" :key="line.id" class="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <span class="min-w-0 flex-1 basis-36 break-words">{{ line.description }}<span class="block text-xs">{{ line.quantity }} × <FhMoney :amount="line.unitPrice" /></span></span>
                  <FhMoney :amount="line.lineTotal" class="shrink-0 whitespace-nowrap" />
                </li>
                <li v-for="fee in row.fees" :key="fee.label" class="flex flex-wrap justify-between gap-2"><span>{{ fee.label }}</span><FhMoney :amount="fee.amount" class="whitespace-nowrap" /></li>
              </ul>
            </details>
          </li>
        </ul>
        <dl class="space-y-3 border-t border-ink-200 pt-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-ink-900">
            <dt>{{ invoiceSummary.pending ? 'Tổng hóa đơn đã chốt' : 'Tổng hóa đơn gốc' }}</dt>
            <dd><FhMoney v-if="invoiceSummary.gross !== null" :amount="invoiceSummary.gross" emphasis data-testid="visit-invoice-gross" /><span v-else class="font-normal text-ink-600">Chưa xác định</span></dd>
          </div>
          <div class="flex flex-wrap items-baseline justify-between gap-2 text-ink-600">
            <dt>Hóa đơn gốc chưa thanh toán</dt>
            <dd><FhMoney v-if="invoiceSummary.unpaid !== null" :amount="invoiceSummary.unpaid" data-testid="visit-invoice-unpaid" /><span v-else>Chưa xác định</span></dd>
          </div>
        </dl>
        <p v-if="invoiceSummary.pending" class="mt-3 text-xs text-ink-600">Còn {{ invoiceSummary.pending }} máy chưa xác định. Chưa phải tổng cả {{ invoiceSummary.rows.length }} máy.</p>
      </section>
      <section v-if="checkoutError" role="alert" class="space-y-2 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800" data-testid="visit-checkout-error">
        <h2 class="font-semibold">Thông tin thanh toán chưa sẵn sàng</h2>
        <p>{{ checkoutError }}</p>
        <FhButton variant="secondary" size="md" data-testid="visit-checkout-retry" @click="load">Thử lại</FhButton>
      </section>
      <section v-if="checkout && held" class="space-y-4 rounded-2xl border border-ink-200 bg-white p-4 text-sm sm:p-6" aria-labelledby="visit-checkout-title" data-testid="visit-checkout" :data-checkout-state="checkoutState" :aria-busy="checkoutLoading">
        <p v-if="checkoutLoading" role="status" class="text-sm text-ink-600">Đang cập nhật thanh toán…</p>
        <div class="flex flex-col gap-2 border-b border-ink-100 pb-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2 id="visit-checkout-title" data-testid="visit-checkout-title" class="text-base font-semibold text-ink-900">Thanh toán</h2>
            <p id="visit-checkout-scope" data-testid="visit-checkout-scope" class="text-xs text-ink-500">Gồm {{ checkout.devices.length }} thiết bị</p>
          </div>
          <span v-if="checkoutState === 'paid'" data-testid="visit-checkout-state" class="font-semibold text-success-700">Đã thanh toán</span>
          <span v-else-if="checkoutState === 'zero_due'" data-testid="visit-checkout-state" class="font-semibold text-ink-700">Không phát sinh khoản cần thanh toán</span>
          <span v-else-if="checkoutState === 'pending_cash'" data-testid="visit-checkout-state" class="font-semibold text-warning-800">Chờ xác nhận tiền mặt</span>
          <span v-else-if="checkoutState === 'waiting'" data-testid="visit-checkout-state" class="font-semibold text-ink-600">Chờ kết quả các thiết bị</span>
          <div v-else class="sm:text-right">
            <span data-testid="visit-checkout-state" class="block text-xs font-medium text-ink-600">{{ checkoutState === 'wallet_short' ? 'Ví chưa đủ' : checkoutState === 'vnpay' ? 'Chọn VNPay' : 'Sẵn sàng thanh toán' }}</span>
            <span v-if="activeFundedVoucher" class="block text-xs text-brand-700">Khách dự kiến trả theo máy chủ: <FhMoney :amount="activeFundedVoucher.preview.customerDueVnd" /></span>
          </div>
        </div>
        <p v-if="checkout.waiting > 0" class="text-ink-600">Còn {{ checkout.waiting }} thiết bị đang xử lý. Bạn thanh toán một lần khi mọi thiết bị đã có kết quả, chỉ cho các máy sửa được.</p>
        <p v-else-if="checkoutState === 'waiting'" class="text-ink-600">Đang cập nhật trạng thái thanh toán của lượt sửa. Bạn chưa cần thanh toán lúc này.</p>

        <template v-else-if="checkoutState === 'zero_due'">
          <p class="text-ink-700" data-testid="visit-zero-due">
            Số tiền còn phải trả là 0 ₫. Bạn không cần thực hiện thanh toán cho lượt này.
          </p>
        </template>
        <template v-else-if="checkoutState === 'pending_cash'">
          <div v-if="checkout.pendingCash" class="space-y-3 text-ink-700" data-testid="visit-cash-pending">
            <p>Thợ báo đã nhận <strong class="font-num"><FhMoney :amount="checkout.pendingCash.amount" /></strong> tiền mặt cho {{ checkout.devices.length }} thiết bị. Bạn xác nhận đúng số tiền đã trả.</p>
            <div class="flex flex-wrap gap-2">
              <FhButton size="md" :loading="busy" :disabled="checkoutLoading" data-testid="visit-cash-confirm" @click="answerCash(true)">Đúng, tôi đã trả</FhButton>
              <FhButton variant="secondary" size="md" :disabled="busy || checkoutLoading" data-testid="visit-cash-dispute" @click="answerCash(false)">Chưa đúng</FhButton>
            </div>
          </div>
        </template>
        <template v-else-if="checkout.ready && !checkout.paid && checkout.total > 0">
            <VoucherCheckoutChooser
              :scope-id="visitId"
              @applied="handleVoucherApplied"
              @released="clearFundedVoucher"
              @expired="clearFundedVoucher"
            />
            <div class="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200" role="radiogroup" aria-label="Cách thanh toán" data-testid="visit-pay-methods">
              <button
                v-for="method in payMethods"
                :key="method"
                type="button"
                role="radio"
                :aria-checked="payMethod === method"
                :tabindex="payMethod === method ? 0 : -1"
                class="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 disabled:opacity-50"
                :class="payMethod === method ? 'bg-brand-50' : 'bg-white hover:bg-ink-50'"
                :data-testid="`visit-pay-method-${method}`"
                :disabled="busy"
                @click="selectPayMethod(method)"
                @keydown="onPayMethodKey($event, method)"
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700" aria-hidden="true">
                  <Wallet v-if="method === 'wallet'" :size="18" />
                  <span v-else-if="method === 'vnpay'" class="text-[10px] font-extrabold leading-none tracking-tight"><span class="text-[#005BAA]">VN</span><span class="text-[#ED1C24]">PAY</span></span>
                  <Banknote v-else :size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-ink-900">{{ method === 'wallet' ? 'Ví FixHome' : method === 'vnpay' ? 'VNPay' : 'Tiền mặt' }}</span>
                  <span v-if="method === 'wallet'" class="block text-xs" :class="walletBalance !== null && !walletCovers ? 'text-warning-800' : 'text-ink-500'">
                    <template v-if="walletError">Chưa tải được số dư</template>
                    <template v-else-if="walletBalance === null">Đang xem số dư…</template>
                    <template v-else>Số dư <span class="font-num"><FhMoney :amount="walletBalance" /></span><template v-if="!walletCovers"> · không đủ</template></template>
                  </span>
                  <span v-else-if="method === 'vnpay'" class="block text-xs text-ink-500">ATM, thẻ quốc tế, QR</span>
                  <span v-else class="block text-xs text-ink-500">Trả trực tiếp cho kỹ thuật viên</span>
                </span>
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2" :class="payMethod === method ? 'border-brand-600' : 'border-ink-300'" aria-hidden="true"><span v-if="payMethod === method" class="h-2.5 w-2.5 rounded-full bg-brand-600"></span></span>
              </button>
            </div>
            <div v-if="payMethod === 'wallet' && walletError" class="text-danger-800" role="alert" data-testid="visit-wallet-error">
              <p>Chưa tải được số dư ví. Thử lại hoặc chọn cách thanh toán khác.</p>
              <FhButton variant="ghost" size="md" data-testid="visit-wallet-retry" @click="loadWallet">Thử lại số dư</FhButton>
            </div>
            <p v-else-if="payMethod === 'wallet' && walletBalance !== null && !walletCovers" class="text-ink-600" data-testid="visit-wallet-short">
              Ví chưa đủ tiền. <router-link to="/app/wallet" class="font-semibold text-brand-700 underline">Nạp thêm vào ví</router-link> hoặc chọn cách khác.
            </p>
            <div v-else-if="payMethod === 'cash'" class="space-y-3 text-ink-700" data-testid="visit-cash-intent-panel">
              <p>Trả tiền trực tiếp cho kỹ thuật viên. Bạn sẽ xác nhận đúng số tiền sau khi kỹ thuật viên khai báo đã nhận.</p>
              <FhButton v-if="!cashInstructionsOpen" variant="secondary" class="w-full" size="lg" :disabled="busy || checkoutLoading" data-testid="visit-cash-intent" @click="openCashInstructions">Tiếp tục với tiền mặt</FhButton>
              <section v-else class="space-y-2 rounded-xl border border-ink-200 bg-ink-50 p-4" role="status" aria-live="polite" aria-labelledby="visit-cash-instructions-title" tabindex="-1" data-testid="visit-cash-instructions">
                <h3 id="visit-cash-instructions-title" class="font-semibold text-ink-900">Hướng dẫn trả tiền mặt</h3>
                <p v-if="activeFundedVoucher">Số tiền khách dự kiến trả theo máy chủ: <strong class="font-num"><FhMoney :amount="activeFundedVoucher.preview.customerDueVnd" /></strong></p>
                <p v-else>Số tiền của cả lượt: <strong class="font-num"><FhMoney :amount="checkout.total" /></strong></p>
                <p>Nút này chỉ mở hướng dẫn. Chưa ghi nhận đã thanh toán và chưa gửi xác nhận tiền mặt lên hệ thống.</p>
                <p>Đưa số tiền trên trực tiếp cho kỹ thuật viên. Kỹ thuật viên khai báo số tiền đã nhận; sau đó bạn xác nhận đúng số tiền hoặc báo chưa đúng.</p>
                <FhButton variant="ghost" size="md" data-testid="visit-cash-instructions-close" @click="cashInstructionsOpen = false">Đóng hướng dẫn</FhButton>
              </section>
            </div>
            <FhButton v-if="payMethod === 'wallet'" class="w-full" size="lg" :disabled="!walletCovers || busy || checkoutLoading" :loading="busy" data-testid="visit-pay-wallet" @click="payWithWallet">Trả bằng ví</FhButton>
            <FhButton v-else-if="payMethod === 'vnpay'" class="w-full" size="lg" :disabled="busy || checkoutLoading" :loading="busy" data-testid="visit-pay-vnpay" @click="payWithVnpay">Thanh toán qua VNPay</FhButton>
        </template>
      </section>
    </template>

    <!-- Reschedule -->
    <div v-if="rescheduleOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="rescheduleOpen = false">
      <div class="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[var(--radius-lg)] bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="visit-reschedule-title">
        <div class="flex items-start justify-between gap-3">
          <h2 id="visit-reschedule-title" class="text-lg font-semibold text-ink-900">Đổi lịch cho cả lượt</h2>
          <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="Đóng" @click="rescheduleOpen = false"><X :size="18" /></button>
        </div>
        <p class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">Mỗi lượt sửa chỉ đổi lịch được một lần, mọi thiết bị đổi cùng nhau.</p>
        <BookingSessionPicker v-model="chosenSession" :sessions="sessions" busy-hint="Thợ đã có lịch buổi này" />
        <FhButton class="w-full" size="lg" :disabled="!chosenSession || busy" :loading="busy" data-testid="visit-reschedule-save" @click="saveReschedule">Lưu lịch mới</FhButton>
      </div>
    </div>

    <!-- Cancel -->
    <div v-if="cancelOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="cancelOpen = false">
      <div class="w-full max-w-md space-y-4 rounded-[var(--radius-lg)] bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="visit-cancel-title">
        <h2 id="visit-cancel-title" class="text-lg font-semibold text-ink-900">Huỷ cả lượt sửa?</h2>
        <p class="text-sm text-ink-600 text-pretty">Mọi thiết bị trong lượt đều huỷ.<template v-if="held"> Thợ đã nhận lượt này nên bạn bị trừ điểm uy tín như huỷ một đơn đã có thợ.</template></p>
        <div class="flex justify-end gap-2.5">
          <FhButton variant="secondary" size="md" :disabled="busy" @click="cancelOpen = false">Không</FhButton>
          <FhButton variant="danger" size="md" :loading="busy" data-testid="visit-cancel-confirm" @click="confirmCancel">Huỷ lượt sửa</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 639px) {
  .visit-device { display: grid; grid-template-columns: 4rem minmax(0, 1fr); column-gap: 12px; }
  .visit-device > :first-child { grid-row: 1 / span 2; align-self: start; white-space: nowrap; }
  .visit-device > :not(:first-child) { grid-column: 2; margin-top: 0; font-size: 14px; line-height: 20px; }
  .visit-device > :last-child { margin-top: 4px; }
}
</style>
