<script setup lang="ts">
/**
 * One visit of up to five devices (PO 21/10/2026): one technician with every
 * skill takes them all, each device is quoted and repaired on its own, and the
 * customer pays once, after every device has its result, for the devices
 * repaired only. Matching, the one reschedule and cancelling act on the whole
 * visit here; each device's order page shows its own quote and photos.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { queryKeys } from '../../lib/query-keys';
import { useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { useAuthStore } from '../../stores/auth';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  Info,
  MapPin,
  Package,
  Phone,
  Receipt,
  Trash2,
  User,
  UserCheck,
  Wallet,
  X,
} from 'lucide-vue-next';
import { getServiceArtworkUrl } from '../../utils/service-presentation';
import { BookingMediaViewer, FhBackLink, FhButton, FhMoney, FhSkeleton } from '../../components';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import VisitOrderDetails from '../../components/customer/VisitOrderDetails.vue';
import FailedRepairIncident from '../../components/customer/FailedRepairIncident.vue';
import CustomerStopReplaceRequest from '../../components/customer/CustomerStopReplaceRequest.vue';
import StoppedDevicesRebookPicker from '../../components/customer/StoppedDevicesRebookPicker.vue';
import CustomerContinuationPanel from '../../components/customer/CustomerContinuationPanel.vue';
import VoucherCheckoutChooser from '../../components/vouchers/VoucherCheckoutChooser.vue';
import { fundedCheckoutApi } from '../../api/funded-checkout.api';
import type { FundedReservation, FundedTerminalReceipt } from '../../api/funded-checkout.api';
import type { VoucherCheckoutPreview } from '../../api/vouchers.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { useVisitOrderDetails, type VisitOrderDetails as OrderDetails } from '../../composables/useVisitOrderDetails';
import { VISIT_DEVICE_LIMIT, visitGroupsApi, type Visit, type VisitCheckout, type VisitDeviceState } from '../../api/visit-groups.api';
import { cashIntentsApi, type CashIntentCapability } from '../../api/cash-intents.api';
import { customerWalletApi } from '../../api/customer-wallet.api';
import { sessionLabel, upcomingSessions, type BookingSlot, type SessionOption } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';
import { canDecideOfficialQuotation } from '../../utils/quotation-decision';
import { billingAmount } from '../../utils/order-billing';
import { LIVE_DEBOUNCE_MS, onBookingChange, onOrderChange, onResync } from '../../services/live-updates';
import { chatSocketService } from '../../services/chat-socket.service';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const queryClient = useQueryClient();
const rebookVerificationVersion = ref(0);
const visitId = computed(() => String(route.params.id));

const visit = ref<Visit | null>(null);
const checkout = ref<VisitCheckout | null>(null);
const cashIntentCapability = ref<CashIntentCapability | null>(null);
const cashCreateCommandId = ref<string | null>(null);
const cashCancelCommandId = ref<string | null>(null);
const cashFirstEnabled = computed(() => cashIntentCapability.value?.cashFirstEnabled === true);
const cashIntent = computed(() => cashIntentCapability.value?.intent ?? null);
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
const hasCompletedInitialRead = ref(false);
const child = useVisitOrderDetails(() => visitId.value, load, isStoppedOrder);
const { details: orderDetails, fresh: childDetailsFresh, deciding: childDeciding, feedback: childFeedback } = child;
const quotationChecks = ref<Record<string, string>>({});
const approvingOrderId = ref<string | null>(null);
const quotationFeedbackElement = ref<HTMLElement | null>(null);

function isStoppedOrder(orderId: string) {
  const order = orderDetails.value[orderId]?.order;
  return order?.workStopped === true || order?.operationalDisposition === 'STOPPED'
    || checkout.value?.devices.some(device => device.serviceOrderId === orderId && device.state === 'interrupted') === true;
}

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
  if (isStoppedOrder(orderId) || childDeciding.value || quotationChecks.value[orderId] || checkoutLoading.value) return;
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
    if (childOrders.length === VISIT_DEVICE_LIMIT) break;
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
    if (!isStoppedOrder(childOrder.serviceOrderId) && canDecideOfficialQuotation(result.value.order)) {
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
    if (validCheckout) { checkout.value = nextCheckout; rebookVerificationVersion.value++; }
    void refreshCashIntent(groupId);
    if (!validCheckout) checkoutError.value = 'Chưa tải được thông tin thanh toán. Vui lòng thử lại.';
    if (disposed || lookupVersion !== childOrderLookupVersion || groupId !== visitId.value) return;
    if (validCheckout && checkout.value) await loadChildOrderDetails(checkout.value.devices, lookupVersion);
    else {
      childOrderStatusUnavailable.value = true;
    }
  } catch (err) {
    if (disposed || lookupVersion !== childOrderLookupVersion) return;
    loadError.value = userFacingError(err, 'Không tải được lượt sửa. Vui lòng thử lại.');
    childOrderStatusUnavailable.value = true;
  } finally {
    if (!disposed && lookupVersion === childOrderLookupVersion) {
      loading.value = false;
      checkoutLoading.value = reloadRequested || refreshTimer !== null;
      if (visit.value && checkout.value && !childOrderStatusLoading.value) {
        hasCompletedInitialRead.value = true;
      }
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
  // Route changes are not permission to release a hold with an uncertain payment.
  clearFundedVoucher();
  seenCashNotifications.clear();
  cashIntentCapability.value = null;
  cashCreateCommandId.value = null;
  cashCancelCommandId.value = null;
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
  hasCompletedInitialRead.value = false;
  loading.value = true;
  void load();
});

const checkoutOrderIds = computed(() => [...new Set((checkout.value?.devices ?? [])
  .flatMap((device) => device.serviceOrderId?.trim() ? [device.serviceOrderId.trim()] : []))].slice(0, VISIT_DEVICE_LIMIT));
const visitBookingIds = computed(() => [...new Set((visit.value?.items ?? [])
  .flatMap(item => item.booking?.id?.trim() ? [item.booking.id.trim()] : []))].slice(0, VISIT_DEVICE_LIMIT));
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
const interruptedDevices = computed(() => checkout.value?.devices.filter(device => device.state === 'interrupted' && !device.rebooked) ?? []);
const rebookedDevices = computed(() => checkout.value?.devices.filter(device => device.rebookedTo) ?? []);
const financialFollowupRequired = computed(() => checkout.value?.financialFollowupRequired === true
  || checkout.value?.devices.some(device => device.financialFollowupRequired === true) === true);
const failedBookingIds = computed(() => {
  if (checkoutError.value) return [];
  return (visit.value?.items ?? []).flatMap(item => item.booking?.id
    && checkout.value?.devices.some(device => device.bookingId === item.booking!.id && device.state === 'failed' && !device.rebooked) ? [item.booking.id] : []);
});
const held = computed(() => (checkout.value?.devices ?? []).some((device) => device.serviceOrderId));
const matchingState = computed(() => lead.value?.status ?? 'SUBMITTED');
const actionVisibilityPending = computed(() => !hasCompletedInitialRead.value && checkoutLoading.value);
const canChooseTechnician = computed(() => !actionVisibilityPending.value && !checkoutError.value && !cancelled.value && !held.value && ['SUBMITTED', 'CLOSED'].includes(matchingState.value));
const rescheduled = computed(() => (visit.value?.items ?? []).some((item) => (item.booking?.rescheduleCount ?? 0) >= 1));
const repairStarted = computed(() => (checkout.value?.devices ?? []).some((device) => device.state !== 'open')
  || childOrderStatusLoading.value
  || childOrderStatusUnavailable.value
  || Object.values(childOrderStatuses.value).some((status) => status === 'UNDER_REPAIR'));
const canReschedule = computed(() => !actionVisibilityPending.value && !checkoutError.value && !cancelled.value && !rescheduled.value && !repairStarted.value);
const canCancel = computed(() => !actionVisibilityPending.value && !checkoutError.value && !cancelled.value && !repairStarted.value);
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
  if (checkout.value?.devices.length && checkout.value.devices.every(device => device.state !== 'open')) return 'Đã có kết quả các máy';
  const statuses = Object.entries(childOrderStatuses.value)
    .filter(([id]) => !checkout.value?.devices.some(device => device.serviceOrderId === id && device.state === 'interrupted'))
    .map(([, status]) => status.toUpperCase());
  if (statuses.includes('UNDER_REPAIR')) return 'Đang sửa chữa';
  // One check-in covers the visit, the other devices stay EN_ROUTE until their repair starts (bug 17).
  if (statuses.includes('EN_ROUTE') && Object.values(orderDetails.value).some(bundle => bundle.order.arrivalVerified)) return 'Kỹ thuật viên đã đến';
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
  interrupted: 'Đã dừng sửa',
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
  if (device.state === 'interrupted') return { ...unknown, status: 'Đã dừng sửa · Tiền cũ cần đối soát' };
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
    // The invoice endpoint does not repeat invoiceId on each line; only a line naming another invoice is refused.
    if (typeof line.id !== 'string' || !line.id.trim() || lineIds.has(line.id)
      || (line.invoiceId !== undefined && line.invoiceId !== invoice.id)
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
    toast.success('Đã đổi lịch hẹn cho cả lượt sửa.');
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
    toast.success('Đã huỷ lượt sửa.');
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
const voucherTerminal = ref<FundedTerminalReceipt | null>(null);
const voucherReconciliationLoading = ref(false);
// The chooser caches evidence BEFORE POST. Keep collection blocked across modal remounts.
type ParentVoucherAttempt = {
  attemptId: string; offer: { id: string; ownerCustomerId: string };
  preview: VoucherCheckoutPreview; reservation: FundedReservation | null; terminal?: FundedTerminalReceipt; requestPending?: boolean;
};
const voucherCacheVersion = ref(0);
const stopVoucherCache = queryClient.getQueryCache().subscribe(event => {
  if (event.query.queryKey[0] === queryKeys.voucherAttempts.all[0]) voucherCacheVersion.value++;
});
onUnmounted(stopVoucherCache);
const savedVoucherAttempt = computed(() => {
  void voucherCacheVersion.value;
  const owner = auth.user?.id;
  return owner ? queryClient.getQueryData<ParentVoucherAttempt>(queryKeys.voucherAttempts.scope(owner, visitId.value)) : undefined;
});
const savedFundedVoucher = computed(() => {
  const saved = savedVoucherAttempt.value;
  const held = saved?.reservation;
  return saved && !saved.terminal && held?.state === 'RESERVED'
    && saved.offer.ownerCustomerId === auth.user?.id && held.scopeId === visitId.value
    && held.claimId === saved.offer.id && held.attemptId === saved.attemptId
    && saved.preview.scopeId === held.scopeId && saved.preview.claimId === held.claimId
    && saved.preview.paymentAvailable === true ? { reservation: held, preview: saved.preview } : null;
});
const voucherAttemptPending = computed(() => !!savedVoucherAttempt.value
  && !savedVoucherAttempt.value.terminal
  && (savedVoucherAttempt.value.requestPending === true || !savedFundedVoucher.value));
const voucherContextChanged = ref(false);
const voucherCollectionBlocked = computed(() => voucherAttemptPending.value || voucherContextChanged.value);
watch(() => auth.user?.id, () => {
  fundedVoucher.value = null;
  voucherTerminal.value = null;
  // A mounted invoice belongs to its original session. Re-enter the page to
  // obtain a backend-authoritative checkout for the new account.
  voucherContextChanged.value = true;
}, { flush: 'sync' });
watch(savedVoucherAttempt, (saved, previous) => {
  // Infinite retention: removal comes from an authoritative unused terminal or logout.
  if (!saved && previous) fundedVoucher.value = null;
}, { flush: 'sync' });
const voucherReconciliationRequired = computed(() => (voucherTerminal.value ?? savedVoucherAttempt.value?.terminal)?.scopeId === visitId.value
  && ['REDEEMED', 'REFUNDED'].includes((voucherTerminal.value ?? savedVoucherAttempt.value?.terminal)?.state ?? ''));
const activeFundedVoucher = computed(() => savedFundedVoucher.value ?? (!savedVoucherAttempt.value && fundedVoucher.value
  && fundedVoucher.value.reservation.scopeId === visitId.value
  ? fundedVoucher.value : null));
const walletBalance = ref<number | null>(null);
const walletError = ref(false);
const voucherDue = computed(() => activeFundedVoucher.value?.preview.customerDueVnd ?? checkout.value?.total ?? 0);
const walletCovers = computed(() => walletBalance.value !== null && checkout.value !== null && walletBalance.value >= voucherDue.value);
const vnpayAllowed = computed(() => voucherDue.value >= 5000);
const payMethods = computed<PayMethod[]>(() => (['wallet', 'vnpay', 'cash'] as PayMethod[]).filter((method) =>
  (method !== 'cash' || cashIntentCapability.value !== null)
  && (method !== 'vnpay' || vnpayAllowed.value)));
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
  if (financialFollowupRequired.value || checkoutError.value || loadError.value) return 'waiting';
  if (current?.paid) return 'paid';
  if (voucherReconciliationRequired.value) return 'waiting';
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
  if (voucherCollectionBlocked.value) return;
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
  const held = activeFundedVoucher.value;
  if (!held) return null;
  if (held.reservation.scopeId !== visitId.value) {
    clearFundedVoucher();
    message.value = { type: 'error', text: 'Lượt thanh toán đã đổi. Hãy kiểm tra lại số tiền trước khi tiếp tục.' };
    return undefined;
  }
  return held.reservation;
}

function newCashCommandId(): string { return globalThis.crypto.randomUUID(); }

async function refreshCashIntent(groupId: string) {
  try {
    const capability = await cashIntentsApi.get('VISIT_GROUP', groupId);
    if (!disposed && groupId === visitId.value) cashIntentCapability.value = capability;
  } catch {
    // Keep the last server-attested state; an unreadable capability never enables a legacy fallback.
  }
}

async function createCashIntent() {
  if (voucherCollectionBlocked.value) return;
  if (voucherReconciliationRequired.value || checkoutError.value || loadError.value || activeFundedVoucher.value?.preview.customerDueVnd === 0) return;
  const groupId = visitId.value;
  if (financialFollowupRequired.value || !cashFirstEnabled.value || !checkout.value?.ready || checkout.value.paid || checkout.value.pendingCash
    || busy.value || checkoutLoading.value || cashIntent.value?.status === 'pending' || cashIntent.value?.status === 'received') return;
  const held = reservationForAction();
  if (activeFundedVoucher.value && !held) return;
  cashCreateCommandId.value ??= newCashCommandId();
  busy.value = true;
  message.value = null;
  try {
    const intent = await cashIntentsApi.create('VISIT_GROUP', groupId, {
      commandId: cashCreateCommandId.value,
      ...(held ? { voucherReservationId: held.id } : {}),
    });
    if (disposed || groupId !== visitId.value) return;
    cashIntentCapability.value = { cashFirstEnabled: true, intent };
    cashCreateCommandId.value = null;
  } catch (error) {
    await refreshCashIntent(groupId);
    if (!disposed && groupId === visitId.value) message.value = { type: 'error', text: userFacingError(error, 'Chưa tạo được yêu cầu tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') };
  } finally {
    busy.value = false;
  }
}

async function cancelCashIntent() {
  if (voucherCollectionBlocked.value) return;
  const groupId = visitId.value;
  const intent = cashIntent.value;
  if (!cashFirstEnabled.value || intent?.status !== 'pending' || busy.value) return;
  cashCancelCommandId.value ??= newCashCommandId();
  busy.value = true;
  message.value = null;
  try {
    const updated = await cashIntentsApi.cancel('VISIT_GROUP', groupId, {
      intentId: intent.id,
      commandId: cashCancelCommandId.value,
    });
    if (disposed || groupId !== visitId.value) return;
    cashIntentCapability.value = { cashFirstEnabled: true, intent: updated };
    cashCancelCommandId.value = null;
  } catch (error) {
    await refreshCashIntent(groupId);
    if (!disposed && groupId === visitId.value) message.value = { type: 'error', text: userFacingError(error, 'Chưa huỷ được yêu cầu tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') };
  } finally {
    busy.value = false;
  }
}

async function handleVoucherTerminal(receipt: FundedTerminalReceipt) {
  if (!['EXPIRED', 'RELEASED', 'REDEEMED', 'REFUNDED'].includes(receipt.state)) return;
  if (disposed || receipt.scopeId !== visitId.value) return;
  const held = fundedVoucher.value?.reservation;
  if (held && (held.id !== receipt.id || held.claimId !== receipt.claimId || held.attemptId !== receipt.attemptId)) return;
  if (receipt.state === 'EXPIRED' || receipt.state === 'RELEASED') { clearFundedVoucher(); return; }
  voucherTerminal.value = receipt;
  clearFundedVoucher();
  if (voucherReconciliationLoading.value) return;
  voucherReconciliationLoading.value = true;
  try { await load(); }
  finally { voucherReconciliationLoading.value = false; }
  // Only the fresh checkout may report paid; an unpaid/failed read keeps collection blocked.
}

async function handleVoucherApplied(value: { reservation: FundedReservation; preview: VoucherCheckoutPreview }) {
  if (financialFollowupRequired.value || checkoutLoading.value || checkoutError.value || loadError.value) return;
  if (value.reservation.scopeId !== visitId.value || value.preview.scopeId !== visitId.value
    || value.reservation.claimId !== value.preview.claimId || value.preview.paymentAvailable !== true) {
    message.value = { type: 'error', text: 'Máy chủ chưa xác nhận voucher cho lượt thanh toán này.' };
    return;
  }
  fundedVoucher.value = value;
  message.value = null;
}

async function confirmZeroCheckout() {
  if (voucherCollectionBlocked.value) return;
  if (voucherReconciliationRequired.value || busy.value || checkoutLoading.value || checkoutError.value || loadError.value || financialFollowupRequired.value
    || !checkout.value?.ready || checkout.value.paid || checkout.value.pendingCash
    || activeFundedVoucher.value?.preview.customerDueVnd !== 0) return;
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
  if (voucherCollectionBlocked.value) return;
  if (voucherReconciliationRequired.value || checkoutError.value || loadError.value || activeFundedVoucher.value?.preview.customerDueVnd === 0) return;
  if (checkoutLoading.value || busy.value || checkoutState.value === 'waiting' || checkoutState.value === 'paid' || checkoutState.value === 'pending_cash' || checkoutState.value === 'zero_due' || !walletCovers.value) return;
  busy.value = true;
  const groupId = visitId.value;
  const hadFundedVoucher = !!activeFundedVoucher.value;
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
  if (voucherCollectionBlocked.value) return;
  if (voucherReconciliationRequired.value || checkoutError.value || loadError.value || activeFundedVoucher.value?.preview.customerDueVnd === 0) return;
  if (checkoutLoading.value || busy.value || !vnpayAllowed.value || checkoutState.value === 'waiting' || checkoutState.value === 'paid' || checkoutState.value === 'pending_cash' || checkoutState.value === 'zero_due') return;
  busy.value = true;
  const groupId = visitId.value;
  const hadFundedVoucher = !!activeFundedVoucher.value;
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
const cashDisputeReason = ref('');
async function answerCash(agreed: boolean) {
  if (voucherCollectionBlocked.value) return;
  if (voucherReconciliationRequired.value || checkoutError.value || loadError.value || activeFundedVoucher.value?.preview.customerDueVnd === 0) return;
  if (checkoutLoading.value || busy.value || checkoutState.value !== 'pending_cash') return;
  busy.value = true;
  const groupId = visitId.value;
  const held = activeFundedVoucher.value?.reservation ?? null;
  if (held && held.scopeId !== groupId) {
    busy.value = false;
    message.value = { type: 'error', text: 'Mã giữ voucher không khớp với lượt này. Chưa gửi xác nhận tiền mặt.' };
    return;
  }
  const disputeText = cashDisputeReason.value.trim() || 'Số tiền mặt chưa đúng';
  try {
    if (held) await fundedCheckoutApi.confirmCash({ kind: 'VISIT_GROUP', id: groupId }, held.id, agreed
      ? { agreed: true }
      : { agreed: false, disputeReason: disputeText });
    else await visitGroupsApi.confirmCash(groupId, agreed, agreed ? undefined : disputeText);
    if (disposed || groupId !== visitId.value) return;
    if (held && agreed) clearFundedVoucher();
    cashDisputeReason.value = '';
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
  <div class="w-full max-w-6xl mx-auto space-y-5 pb-12" data-testid="customer-visit">
    <FhBackLink class="min-h-11 animate-slide-up" label="Đơn của tôi" @click="router.push('/app/orders')" />

    <div
      v-if="loading"
      class="space-y-5 animate-slide-up-delay-1"
      role="status"
      aria-busy="true"
      aria-label="Đang tải lượt sửa nhiều thiết bị"
    >
      <!-- Summary Header Card Skeleton -->
      <div class="rounded-2xl border border-ink-200/85 bg-white p-5 sm:p-6 shadow-2xs space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1 space-y-2">
            <FhSkeleton width="45%" height="28px" />
            <FhSkeleton width="70%" height="14px" />
          </div>
          <div class="w-36 shrink-0">
            <FhSkeleton width="100%" height="28px" rounded="full" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
          <div v-for="i in 3" :key="i" class="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5 flex items-start gap-3">
            <FhSkeleton width="40px" height="40px" rounded="full" class="shrink-0" />
            <div class="min-w-0 flex-1 space-y-2">
              <FhSkeleton width="60%" height="12px" />
              <FhSkeleton width="85%" height="16px" />
              <FhSkeleton width="50%" height="12px" />
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 pt-3 border-t border-ink-100/70">
          <FhSkeleton width="180px" height="42px" rounded="md" />
          <FhSkeleton width="120px" height="42px" rounded="md" />
          <FhSkeleton width="120px" height="42px" rounded="md" />
          <FhSkeleton width="220px" height="36px" rounded="md" />
        </div>
      </div>

      <!-- 2-Column Workspace Skeleton -->
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)] lg:items-start">
        <div class="min-w-0 space-y-3">
          <FhSkeleton width="136px" height="20px" />
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div
              v-for="i in 3"
              :key="i"
              class="rounded-xl border border-ink-200/85 bg-white p-3 space-y-2"
              :class="{ 'hidden sm:block': i === 3 }"
            >
              <FhSkeleton width="48px" height="12px" />
              <FhSkeleton width="85%" height="16px" />
              <FhSkeleton width="60%" height="12px" />
            </div>
          </div>
          <div class="rounded-2xl border border-ink-200/85 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
            <div class="rounded-xl bg-ink-50/75 px-3.5 py-3 flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1 space-y-1.5">
                <FhSkeleton width="60%" height="18px" />
                <FhSkeleton width="40%" height="14px" />
              </div>
              <div class="w-20 shrink-0">
                <FhSkeleton width="100%" height="18px" />
              </div>
            </div>
            <FhSkeleton width="92%" height="14px" />
            <FhSkeleton width="72%" height="14px" />
            <div class="flex justify-end pt-1">
              <div class="w-24">
                <FhSkeleton width="100%" height="34px" rounded="md" />
              </div>
            </div>
          </div>
        </div>

        <div class="min-w-0 space-y-4">
          <div class="rounded-2xl border border-ink-200/85 bg-white p-4 sm:p-5 shadow-2xs space-y-3.5">
            <FhSkeleton width="58%" height="20px" />
            <div class="divide-y divide-ink-100">
              <div v-for="i in 2" :key="i" class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div class="min-w-0 flex-1 space-y-1.5">
                  <FhSkeleton width="70%" height="15px" />
                  <FhSkeleton width="42%" height="12px" />
                </div>
                <div class="w-16 shrink-0">
                  <FhSkeleton width="100%" height="15px" />
                </div>
              </div>
            </div>
            <div class="rounded-xl bg-ink-50/85 p-3.5 space-y-2.5">
              <div class="flex items-center justify-between gap-3">
                <div class="w-32"><FhSkeleton width="100%" height="16px" /></div>
                <div class="w-20"><FhSkeleton width="100%" height="18px" /></div>
              </div>
              <div class="flex items-center justify-between gap-3">
                <div class="w-36"><FhSkeleton width="100%" height="14px" /></div>
                <div class="w-16"><FhSkeleton width="100%" height="14px" /></div>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-ink-200/85 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
            <div class="space-y-1.5">
              <FhSkeleton width="35%" height="20px" />
              <FhSkeleton width="48%" height="12px" />
            </div>
            <div class="divide-y divide-ink-100 rounded-xl border border-ink-200/80 overflow-hidden">
              <div v-for="i in 2" :key="i" class="flex items-center gap-3 px-3.5 py-3">
                <div class="w-9 shrink-0"><FhSkeleton width="36px" height="36px" rounded="md" /></div>
                <div class="min-w-0 flex-1 space-y-1.5">
                  <FhSkeleton width="40%" height="15px" />
                  <FhSkeleton width="58%" height="12px" />
                </div>
                <div class="w-5 shrink-0"><FhSkeleton width="20px" height="20px" rounded="full" /></div>
              </div>
            </div>
            <FhSkeleton width="100%" height="44px" rounded="md" />
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="loadError && !visit" role="alert" class="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800 animate-slide-up-delay-1">
      {{ loadError }}
      <FhButton variant="secondary" size="md" class="ml-2" @click="load">Thử lại</FhButton>
    </div>

    <template v-else-if="visit">
      <div v-if="loadError" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{{ loadError }} Hiện dữ liệu đã đọc trước đó; thao tác cần xác minh lại. <FhButton variant="secondary" size="md" @click="load">Thử lại</FhButton></div>

      <!-- Unified Visit Summary Header Card -->
      <header class="overflow-hidden rounded-2xl border border-ink-200/85 bg-white shadow-2xs animate-slide-up-delay-1">
        <div class="relative overflow-hidden border-b border-ink-100/80 bg-gradient-to-r from-white via-white to-brand-50/85 px-5 py-4 sm:px-6 sm:py-5">
          <div
            class="pointer-events-none select-none absolute inset-y-0 right-0 w-24 sm:w-36 flex items-center justify-center overflow-hidden opacity-35 sm:opacity-95"
            aria-hidden="true"
          >
            <img
              :src="'/images/ui/booking-multi-visit.png'"
              alt=""
              data-testid="visit-header-ambient-artwork"
              class="h-20 w-24 sm:h-24 sm:w-28 object-contain object-center p-1"
              loading="lazy"
            />
          </div>
          <div class="relative z-10 flex flex-wrap items-start justify-between gap-3 pr-20 sm:pr-32">
            <div class="space-y-1 min-w-0">
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-ink-900">Lượt sửa {{ visit.items.length }} thiết bị</h1>
              <p class="text-xs sm:text-sm text-ink-500">Một kỹ thuật viên phụ trách cả lượt · Một lịch hẹn · Thanh toán một lần</p>
            </div>
            <span
              v-if="outcomeProgress"
              class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 font-num whitespace-nowrap shrink-0"
              data-testid="visit-outcome-progress"
            >
              Kết quả {{ outcomeProgress.resolved }}/{{ outcomeProgress.total }} thiết bị
            </span>
          </div>
        </div>

        <div class="p-5 sm:p-6 space-y-4 bg-white">
          <!-- 3 Hộp thông tin tổng quan -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <!-- Box 1: Kỹ thuật viên -->
            <div class="rounded-xl border border-ink-100 bg-ink-50/70 p-3.5 flex items-start gap-3 transition-colors hover:bg-ink-50" data-testid="visit-shared-technician">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-50/50" aria-hidden="true">
                <User :size="20" />
              </div>
              <div class="min-w-0 flex-1 space-y-0.5">
                <span class="block text-xs font-medium text-ink-500">Kỹ thuật viên phụ trách cả lượt</span>
                <p v-if="sharedTechnician" class="truncate text-sm sm:text-base font-semibold text-ink-900">
                  {{ sharedTechnician.fullName }}
                </p>
                <p class="text-xs sm:text-sm" :class="sharedTechnician ? 'text-ink-600' : 'font-medium text-ink-700'" role="status">
                  {{ technicianProgress }}
                </p>
                <div v-if="sharedTechnician?.phoneNumber && /^[+\d\s()-]+$/.test(sharedTechnician.phoneNumber)" class="pt-1">
                  <a
                    :href="`tel:${sharedTechnician.phoneNumber}`"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-brand-50 hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    <Phone :size="12" />
                    Gọi {{ sharedTechnician.phoneNumber }}
                  </a>
                </div>
              </div>
            </div>

            <!-- Box 2: Lịch hẹn chung -->
            <div class="rounded-xl border border-ink-100 bg-ink-50/70 p-3.5 flex items-start gap-3 transition-colors hover:bg-ink-50">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-50/50" aria-hidden="true">
                <Calendar :size="20" />
              </div>
              <div class="min-w-0 flex-1 space-y-0.5">
                <span class="block text-xs font-medium text-ink-500">Lịch hẹn chung</span>
                <p class="text-sm sm:text-base font-semibold text-ink-900">
                  {{ sessionText }}
                  <span v-if="cancelled" class="text-xs font-medium text-danger-600"> · Đã huỷ</span>
                </p>
                <p class="text-xs text-ink-500">Áp dụng cho mọi thiết bị trong lượt</p>
              </div>
            </div>

            <!-- Box 3: Địa chỉ chung -->
            <div class="rounded-xl border border-ink-100 bg-ink-50/70 p-3.5 flex items-start gap-3 transition-colors hover:bg-ink-50">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-50/50" aria-hidden="true">
                <MapPin :size="20" />
              </div>
              <div class="min-w-0 flex-1 space-y-0.5">
                <span class="block text-xs font-medium text-ink-500">Địa chỉ chung</span>
                <p v-if="sharedAddress" class="text-sm sm:text-base font-medium text-ink-900 line-clamp-2" data-testid="visit-shared-address">
                  {{ sharedAddress }}
                </p>
                <p v-else class="text-xs text-ink-500">Chưa có thông tin địa chỉ</p>
              </div>
            </div>
          </div>

          <!-- Hàng nút thao tác (Action Bar) -->
          <div v-if="!cancelled && (canChooseTechnician || canReschedule || (rescheduled && !repairStarted) || canCancel)" class="flex flex-wrap items-center gap-3 pt-3 border-t border-ink-100/70">
            <!-- Nút 1: Chọn kỹ thuật viên (Primary Blue) -->
            <FhButton
              v-if="canChooseTechnician"
              variant="primary"
              size="md"
              :disabled="checkoutLoading"
              data-testid="visit-choose-technician"
              @click="router.push(`/app/visits/${visitId}/candidates`)"
            >
              <UserCheck :size="18" aria-hidden="true" />
              <span>{{ matchingState === 'CLOSED' ? 'Chọn kỹ thuật viên khác cho cả lượt' : `Chọn 1 kỹ thuật viên sửa cả ${visit.items.length} thiết bị` }}</span>
            </FhButton>

            <!-- Nút 2: Đổi lịch hẹn (Secondary) -->
            <FhButton
              v-if="canReschedule"
              variant="secondary"
              size="md"
              :disabled="checkoutLoading"
              data-testid="visit-reschedule"
              @click="openReschedule"
            >
              <Calendar :size="17" class="text-ink-500" aria-hidden="true" />
              <span>Đổi lịch hẹn</span>
            </FhButton>
            <FhButton
              v-else-if="rescheduled && !repairStarted"
              variant="secondary"
              size="md"
              disabled
              data-testid="visit-reschedule-used"
            >
              <Calendar :size="17" class="text-ink-400" aria-hidden="true" />
              <span>Đã đổi lịch một lần</span>
            </FhButton>

            <!-- Nút 3: Hủy lượt sửa (Danger Red) -->
            <FhButton
              v-if="canCancel"
              variant="danger"
              size="md"
              :disabled="checkoutLoading"
              data-testid="visit-cancel"
              @click="cancelOpen = true"
            >
              <Trash2 :size="17" aria-hidden="true" />
              <span>Hủy lượt sửa</span>
            </FhButton>

            <!-- Cảnh báo cạnh nút hủy -->
            <div
              v-if="canCancel"
              class="inline-flex items-center gap-2 rounded-xl border border-danger-200/80 bg-danger-50 px-3.5 py-2 text-xs sm:text-sm text-danger-800"
            >
              <AlertTriangle :size="15" class="text-danger-600 shrink-0" aria-hidden="true" />
              <span>{{ held ? `Hủy lượt sửa sẽ ảnh hưởng cả ${visit.items.length} thiết bị và trừ điểm uy tín.` : `Hủy lượt sửa sẽ dừng tìm thợ cho cả ${visit.items.length} thiết bị.` }}</span>
            </div>
          </div>
        </div>
      </header>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)] lg:items-start">
        <!-- Left column: Priority quote + Device Selector + Selected Device Details -->
        <div class="min-w-0 space-y-4 lg:col-start-1">
          <section v-if="priorityQuotation" class="flex flex-col gap-3 rounded-2xl border border-warning-200 bg-warning-50/80 p-4 sm:flex-row sm:items-center shadow-2xs" data-testid="visit-quotation-priority">
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
              class="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white transition-colors motion-reduce:transition-none duration-120 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:w-auto cursor-pointer"
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

          <section class="space-y-3 animate-slide-up-delay-2" data-testid="visit-device-list">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-base sm:text-lg font-bold text-ink-900 flex items-center gap-2">
                <Package :size="20" class="text-brand-600" aria-hidden="true" />
                <span>Dịch vụ từng máy</span>
              </h2>
              <span class="text-xs text-ink-500 sm:hidden">Vuốt hoặc chọn máy</span>
            </div>
            <div v-if="interruptedDevices.length" class="rounded-xl bg-ink-50/80 p-3 text-sm text-ink-700" data-testid="visit-interrupted">
              <StoppedDevicesRebookPicker :group-id="visitId" :customer-id="auth.user?.id" :revalidation="rebookVerificationVersion" :devices="interruptedDevices" :disabled="checkoutLoading || !!checkoutError || !!loadError" />
            </div>
            <FhButton
              v-for="device in rebookedDevices"
              :key="device.bookingId"
              variant="secondary"
              :data-testid="`visit-rebooked-${device.sequence}`"
              @click="router.push(device.rebookedTo!.visitGroupId ? `/app/visits/${device.rebookedTo!.visitGroupId}` : `/app/bookings/${device.rebookedTo!.bookingId}/candidates`)"
            >
              Máy {{ device.sequence }}: đã đặt lịch mới · Xem
            </FhButton>
            <FhButton
              v-if="failedBookingIds.length > 1"
              variant="secondary"
              size="md"
              data-testid="failed-repair-rebook-all"
              @click="router.push({ path: '/app/bookings/new', query: { repairFailure: failedBookingIds.join(',') } })"
            >Đặt lại {{ failedBookingIds.length }} máy không sửa được</FhButton>

            <!-- Sleek Device Selector: horizontal cards with service artwork -->
            <div class="flex gap-3 overflow-x-auto pb-1 scrollbar-none sm:grid sm:grid-cols-2 md:grid-cols-3 sm:overflow-visible sm:pb-0" role="group" aria-label="Chọn thiết bị trong lượt" data-testid="visit-device-selector">
              <button
                v-for="item in visit.items"
                :key="item.id"
                type="button"
                class="visit-device flex min-h-[4.5rem] min-w-[12rem] sm:min-w-0 shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 cursor-pointer"
                :class="selectedVisitItem?.id === item.id ? 'border-2 border-brand-600 bg-brand-50/50 shadow-xs ring-2 ring-brand-500/20' : 'border border-ink-200/90 bg-white hover:border-brand-300 hover:bg-ink-50/40'"
                :aria-pressed="selectedVisitItem?.id === item.id"
                :aria-controls="selectedVisitItem?.id === item.id ? `visit-device-panel-${item.sequence}` : undefined"
                :aria-label="`Chọn máy ${item.sequence}${item.booking?.serviceName ? `: ${item.booking.serviceName}` : ''}, ${statusText(item)}`"
                :id="`visit-device-select-${item.sequence}`"
                :data-testid="`visit-device-select-${item.sequence}`"
                @click="selectedVisitItemId = item.id"
              >
                <!-- Icon thiết bị -->
                <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink-100 bg-white p-1.5 shadow-2xs overflow-hidden" aria-hidden="true">
                  <img
                    :src="getServiceArtworkUrl({ name: item.booking?.serviceName || item.deviceLabel })"
                    alt=""
                    class="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div class="min-w-0 flex-1 space-y-0.5">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-[11px] font-bold uppercase tracking-wider font-num" :class="selectedVisitItem?.id === item.id ? 'text-brand-700' : 'text-ink-400'">
                      Máy {{ item.sequence }}
                    </span>
                    <span v-if="quotationOrderId(item) || pendingCosts(item)" class="inline-flex items-center rounded-full bg-warning-100 px-1.5 py-0.5 text-[10px] font-semibold text-warning-800" aria-label="Cần duyệt báo giá">
                      Cần duyệt
                    </span>
                  </div>
                  <span class="block truncate text-sm font-bold text-ink-900">{{ item.booking?.serviceName || item.deviceLabel || 'Thiết bị' }}</span>
                  <span class="block truncate text-xs" :class="quotationOrderId(item) ? 'font-semibold text-warning-700' : 'text-ink-500'">{{ chipStatusText(item) }}</span>
                </div>
              </button>
            </div>

            <!-- Thẻ chi tiết thiết bị đang chọn -->
            <div
              v-if="selectedVisitItem"
              :id="`visit-device-panel-${selectedVisitItem.sequence}`"
              class="rounded-2xl border border-ink-200/85 bg-white p-4 sm:p-5 shadow-2xs space-y-4"
              role="region"
              :aria-labelledby="`visit-device-select-${selectedVisitItem.sequence}`"
              :data-testid="`visit-device-panel-${selectedVisitItem.sequence}`"
            >
              <div class="flex items-center gap-3.5 rounded-xl bg-ink-50/75 p-3.5 sm:p-4">
                <div class="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-white p-2 shadow-2xs overflow-hidden">
                  <img
                    :src="getServiceArtworkUrl({ name: selectedVisitItem.booking?.serviceName || selectedVisitItem.deviceLabel })"
                    alt=""
                    class="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="break-words text-base sm:text-lg font-bold text-ink-900">
                      Máy {{ selectedVisitItem.sequence }}<template v-if="selectedVisitItem.booking?.serviceName">: {{ selectedVisitItem.booking.serviceName }}</template>
                    </p>
                    <span v-if="deviceOf(selectedVisitItem.booking?.id)?.state === 'succeeded'" class="whitespace-nowrap text-sm sm:text-base font-bold text-brand-700 font-num">
                      <FhMoney :amount="deviceOf(selectedVisitItem.booking?.id)!.amount" />
                    </span>
                  </div>
                  <p class="mt-0.5 break-words text-xs sm:text-sm text-ink-600">
                    <template v-if="selectedVisitItem.deviceLabel">{{ selectedVisitItem.deviceLabel }} · </template>{{ statusText(selectedVisitItem) }}
                  </p>
                </div>
              </div>

              <p v-if="quotationOrderId(selectedVisitItem)" class="text-sm font-semibold text-warning-800 flex items-center gap-1.5" :data-testid="`visit-device-quotation-status-${selectedVisitItem.sequence}`">
                <AlertCircle :size="16" class="text-warning-600 shrink-0" aria-hidden="true" />
                <span>Báo giá đang chờ bạn duyệt</span>
              </p>

              <!-- Lỗi / Vấn đề -->
              <div v-if="hasDeviceDetails(selectedVisitItem)" class="space-y-2 rounded-xl border border-ink-100 bg-ink-50/40 p-3.5 sm:p-4">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold uppercase tracking-wider text-ink-400">Lỗi / Vấn đề</span>
                  <span v-if="selectedVisitItem.booking?.media?.length" class="text-xs text-ink-500 font-medium" :data-testid="`visit-device-media-count-${selectedVisitItem.sequence}`">
                    {{ selectedVisitItem.booking.media.length }} ảnh/video
                  </span>
                </div>
                <div :id="`visit-device-details-${selectedVisitItem.sequence}`" class="space-y-3">
                  <p v-if="selectedVisitItem.booking?.description?.trim()" class="break-words text-pretty text-sm text-ink-800 whitespace-pre-line" :class="isDeviceExpanded(selectedVisitItem.id) ? '' : 'line-clamp-2'" :data-testid="`visit-device-description-${selectedVisitItem.sequence}`">
                    {{ selectedVisitItem.booking.description }}
                  </p>
                  <BookingMediaViewer
                    v-if="isDeviceExpanded(selectedVisitItem.id) && selectedVisitItem.booking?.media?.length"
                    :booking-id="selectedVisitItem.booking.id"
                    :media="selectedVisitItem.booking.media"
                    embedded
                  />
                </div>
                <div class="flex justify-end pt-1">
                  <button
                    type="button"
                    :aria-expanded="isDeviceExpanded(selectedVisitItem.id)"
                    :aria-controls="`visit-device-details-${selectedVisitItem.sequence}`"
                    :aria-label="`${isDeviceExpanded(selectedVisitItem.id) ? 'Thu gọn' : 'Xem thêm'} chi tiết máy ${selectedVisitItem.sequence}`"
                    class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-md py-1 px-2 cursor-pointer transition-colors"
                    :data-testid="`visit-device-expand-${selectedVisitItem.sequence}`"
                    @click="toggleDeviceDetails(selectedVisitItem.id)"
                  >
                    <span>{{ isDeviceExpanded(selectedVisitItem.id) ? 'Thu gọn' : 'Xem thêm' }}</span>
                    <ChevronDown :size="15" class="transition-transform motion-reduce:transition-none" :class="{ 'rotate-180': isDeviceExpanded(selectedVisitItem.id) }" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <p v-if="childFeedback && childFeedback.orderId === selectedOrderId" ref="quotationFeedbackElement" tabindex="-1" data-testid="quotation-feedback" :role="childFeedback.error ? 'alert' : 'status'" class="text-sm" :class="childFeedback.error ? 'text-danger-700' : 'text-success-700'">{{ childFeedback.text }}</p>
              <p v-if="approvingOrderId && approvingOrderId === selectedOrderId" role="status" class="text-sm text-ink-600">Đang duyệt báo giá và kiểm tra trạng thái…</p>
              <FhButton v-if="selectedOrderId && quotationChecks[selectedOrderId] && approvingOrderId !== selectedOrderId" variant="secondary" size="md" :disabled="childDeciding || checkoutLoading" data-testid="quotation-check-status" @click="checkChildQuotation">Kiểm tra trạng thái</FhButton>
              <FailedRepairIncident
                v-if="!checkoutError && selectedVisitItem.booking && deviceOf(selectedVisitItem.booking.id)?.state === 'failed'"
                :key="selectedVisitItem.booking.id"
                :booking-id="selectedVisitItem.booking.id"
                @rebook="bookingId => router.push({ path: '/app/bookings/new', query: { repairFailure: bookingId } })"
                @later="router.push('/app')"
              />
              <VisitOrderDetails
                v-if="selectedDetails"
                :key="selectedDetails.order.id"
                :details="selectedDetails"
                :stopped="isStoppedOrder(selectedDetails.order.id)"
                :disabled="isStoppedOrder(selectedDetails.order.id) || !childDetailsFresh || childDeciding || checkoutLoading || !!quotationChecks[selectedDetails.order.id]"
                @quote="decideChildQuotation(selectedDetails.order.id, $event)"
                @cost="(id, action, consent) => selectedDetails && child.decide(selectedDetails.order.id, action, id, consent)"
                @retry="load"
              />
              <CustomerStopReplaceRequest
                v-if="selectedDetails && !isStoppedOrder(selectedDetails.order.id)"
                :key="`stop-replace-${selectedDetails.order.id}`"
                :order-id="selectedDetails.order.id"
                :order-status="selectedDetails.order.status"
              />
              <div v-if="selectedOrderId && !selectedDetails" class="space-y-2 border-t border-ink-100 pt-3">
                <FhSkeleton v-if="childOrderStatusLoading" class="h-24 rounded-xl" />
                <template v-else><p class="text-sm text-ink-600">Chưa tải được báo giá và chi tiết máy này.</p><FhButton variant="secondary" size="md" @click="load">Thử lại</FhButton></template>
              </div>

              <CustomerContinuationPanel
                v-if="selectedDetails && !isStoppedOrder(selectedDetails.order.id) && ['EN_ROUTE', 'UNDER_REPAIR'].includes(selectedDetails.order.status)"
                :key="`continuation-${selectedDetails.order.id}`"
                :order-id="selectedDetails.order.id"
                :booking-id="selectedVisitItem.booking?.id ?? null"
                :visit-group-id="visitId"
                :order-status="selectedDetails.order.status"
              />
            </div>
          </section>
        </div>

        <!-- Right column: Unified Sticky Invoice Summary + Checkout Panel (DOM order kept: visit-invoice-summary precedes visit-checkout) -->
        <aside class="min-w-0 space-y-4 lg:col-start-2 lg:sticky lg:top-20">
          <section v-if="invoiceSummary.rows.length" class="overflow-hidden rounded-2xl border border-ink-200/85 bg-white text-sm shadow-2xs" aria-labelledby="visit-invoice-summary-title" :aria-busy="checkoutLoading" data-testid="visit-invoice-summary">
            <div class="relative overflow-hidden border-b border-ink-100/80 bg-gradient-to-r from-white via-white to-brand-50/85 px-4 py-3.5 sm:px-5 sm:py-4">
              <div
                class="pointer-events-none select-none absolute inset-y-0 right-0 w-20 sm:w-28 flex items-center justify-center overflow-hidden opacity-45 sm:opacity-95"
                aria-hidden="true"
              >
                <img
                  :src="'/images/ui/card-quote-checklist.png'"
                  alt=""
                  data-testid="visit-invoice-ambient-artwork"
                  class="h-16 w-16 sm:h-20 sm:w-20 object-contain object-center p-1"
                  loading="lazy"
                />
              </div>
              <div class="relative z-10 pr-20 sm:pr-28">
                <div class="flex items-center gap-2">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600" aria-hidden="true">
                    <Receipt :size="18" />
                  </div>
                  <div>
                    <h2 id="visit-invoice-summary-title" class="text-base font-bold text-ink-900">Hóa đơn cả lượt · {{ invoiceSummary.rows.length }} máy</h2>
                    <p class="text-xs text-ink-500">Chi phí từng thiết bị và tổng cộng<span v-if="checkoutLoading" role="status" class="ml-1.5 font-medium">· Đang cập nhật hóa đơn…</span></p>
                  </div>
                </div>
              </div>
            </div>
            <div class="p-4 sm:p-5 space-y-3.5 bg-white">
            <ul class="divide-y divide-ink-100">
              <li v-for="row in invoiceSummary.rows" :key="row.item.id" class="py-2.5 first:pt-0 last:pb-0" :data-testid="`visit-invoice-row-${row.item.sequence}`">
                <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div class="min-w-0 flex-1 basis-36">
                    <p class="break-words font-semibold text-ink-900 text-sm">Máy {{ row.item.sequence }}<template v-if="row.item.booking?.serviceName"> · {{ row.item.booking.serviceName }}</template></p>
                    <p class="mt-0.5 text-xs text-ink-500">{{ row.status }}</p>
                  </div>
                  <FhMoney v-if="row.amount !== null" :amount="row.amount" class="shrink-0 whitespace-nowrap font-semibold" data-testid="visit-invoice-amount" />
                  <span v-else class="text-ink-500 font-medium text-sm">Chưa xác định</span>
                </div>
                <details v-if="row.lines.length || row.fees.length" class="group mt-1.5 text-ink-600">
                  <summary class="flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-lg text-xs font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"><span>Chi tiết hóa đơn máy {{ row.item.sequence }}</span><ChevronDown :size="15" class="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
                  <ul class="mt-1 space-y-1.5 rounded-xl bg-ink-50/80 p-2.5 text-xs">
                    <li v-for="line in row.lines" :key="line.id" class="flex flex-wrap justify-between gap-x-3 gap-y-1">
                      <span class="min-w-0 flex-1 basis-36 break-words">{{ line.description }}<span class="block text-ink-500">{{ line.quantity }} × <FhMoney :amount="line.unitPrice" /></span></span>
                      <FhMoney :amount="line.lineTotal" class="shrink-0 whitespace-nowrap font-num" />
                    </li>
                    <li v-for="fee in row.fees" :key="fee.label" class="flex flex-wrap justify-between gap-2"><span>{{ fee.label }}</span><FhMoney :amount="fee.amount" class="whitespace-nowrap font-num" /></li>
                  </ul>
                </details>
              </li>
            </ul>
            <dl class="rounded-xl bg-ink-50/85 border border-ink-100 p-3.5 space-y-2">
              <div class="flex flex-wrap items-baseline justify-between gap-2 font-bold text-ink-900">
                <dt>{{ invoiceSummary.pending ? 'Tổng hóa đơn đã chốt' : 'Tổng hóa đơn gốc' }}</dt>
                <dd><FhMoney v-if="invoiceSummary.gross !== null" :amount="invoiceSummary.gross" emphasis data-testid="visit-invoice-gross" /><span v-else class="font-normal text-ink-600">Chưa xác định</span></dd>
              </div>
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs sm:text-sm text-ink-600">
                <dt>Hóa đơn gốc chưa thanh toán</dt>
                <dd><FhMoney v-if="invoiceSummary.unpaid !== null" :amount="invoiceSummary.unpaid" data-testid="visit-invoice-unpaid" /><span v-else class="font-num font-medium text-ink-800">0 ₫</span></dd>
              </div>
            </dl>
            <p v-if="invoiceSummary.pending" class="flex items-center gap-1.5 text-xs text-ink-500">
              <Info :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
              <span>Còn {{ invoiceSummary.pending }} máy chưa xác định. Chưa phải tổng cả {{ invoiceSummary.rows.length }} máy.</span>
            </p>
            </div>
          </section>

          <p v-if="voucherContextChanged" role="alert" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">Phiên đăng nhập đã thay đổi. Hãy mở lại trang để kiểm tra hóa đơn từ máy chủ trước khi thanh toán.</p>
          <p v-if="voucherAttemptPending" role="alert" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900" data-testid="voucher-reservation-pending">Kết quả giữ voucher chưa rõ. Hãy mở voucher và kiểm tra lại yêu cầu cũ trước khi thanh toán; chưa thể trả bằng ví, VNPay hoặc tiền mặt.</p>
          <section v-if="voucherReconciliationRequired && !checkout?.paid" role="alert" class="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900" data-testid="voucher-terminal-reconciliation">
            Ưu đãi đã được sử dụng hoặc hoàn lại. Cần đối chiếu thanh toán từ máy chủ; chưa thể thu thêm.
            <FhButton variant="secondary" size="sm" class="mt-2" :disabled="voucherReconciliationLoading" @click="(voucherTerminal ?? savedVoucherAttempt?.terminal) && handleVoucherTerminal((voucherTerminal ?? savedVoucherAttempt?.terminal)!)">Kiểm tra thanh toán</FhButton>
          </section>
          <section v-if="checkoutError" role="alert" class="space-y-2 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800" data-testid="visit-checkout-error">
            <h2 class="font-semibold">Thông tin thanh toán chưa sẵn sàng</h2>
            <p>{{ checkoutError }}</p>
            <FhButton variant="secondary" size="md" data-testid="visit-checkout-retry" @click="load">Thử lại</FhButton>
          </section>

          <section v-if="checkout && held" class="space-y-4 rounded-2xl border border-ink-200/85 bg-white p-4 text-sm sm:p-5 shadow-2xs" aria-labelledby="visit-checkout-title" data-testid="visit-checkout" :data-checkout-state="checkoutState" :aria-busy="checkoutLoading">
            <p v-if="financialFollowupRequired" role="status" data-testid="visit-financial-followup" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-warning-800">Có máy đã dừng sửa và chứng từ cũ cần đối soát. Số tiền phải trả hoặc hoàn tiền: Chưa xác định. Chưa thực hiện thanh toán mới cho lượt này; việc đặt lại chỉ mở khi đã xác minh đủ điều kiện.</p>
            <div class="flex flex-col gap-2 pb-2 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h2 id="visit-checkout-title" data-testid="visit-checkout-title" class="text-base font-semibold text-ink-900">Thanh toán</h2>
                <p id="visit-checkout-scope" data-testid="visit-checkout-scope" class="text-xs text-ink-500">Gồm {{ checkout.devices.length }} thiết bị<span v-if="checkoutLoading" role="status" class="ml-1.5 font-medium text-ink-500">· Đang cập nhật…</span></p>
              </div>
              <span v-if="checkoutState === 'paid'" data-testid="visit-checkout-state" class="font-semibold text-success-700">Đã thanh toán</span>
              <span v-else-if="checkoutState === 'zero_due'" data-testid="visit-checkout-state" class="font-semibold text-ink-700">Không phát sinh khoản cần thanh toán</span>
              <span v-else-if="checkoutState === 'pending_cash'" data-testid="visit-checkout-state" class="font-semibold text-warning-800">Chờ xác nhận tiền mặt</span>
              <span v-else-if="checkoutState === 'waiting'" data-testid="visit-checkout-state" class="font-semibold text-ink-600">Chờ kết quả các thiết bị</span>
              <div v-else class="sm:text-right">
                <span data-testid="visit-checkout-state" class="block text-xs font-medium text-ink-600">{{ voucherAttemptPending ? 'Chờ xác minh voucher' : checkoutState === 'wallet_short' ? 'Ví chưa đủ' : checkoutState === 'vnpay' ? 'Chọn VNPay' : 'Sẵn sàng thanh toán' }}</span>
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
                <label class="block text-xs">
                  <span class="mb-1 block font-medium text-ink-600">Ghi chú nếu số tiền chưa đúng (tuỳ chọn)</span>
                  <input
                    v-model="cashDisputeReason"
                    type="text"
                    maxlength="2000"
                    placeholder="Ví dụ: Tôi chỉ trả 200.000 ₫ tiền mặt"
                    data-testid="visit-cash-dispute-reason"
                    class="w-full h-10 px-3 bg-white border border-ink-200 rounded-xl text-sm text-ink-900 focus:outline-none focus:border-brand-600"
                  />
                </label>
                <div class="flex flex-wrap gap-2">
                  <FhButton size="md" :loading="busy" :disabled="voucherCollectionBlocked || busy || checkoutLoading" data-testid="visit-cash-confirm" @click="answerCash(true)">Đúng, tôi đã trả</FhButton>
                  <FhButton variant="secondary" size="md" :disabled="voucherCollectionBlocked || busy || checkoutLoading" data-testid="visit-cash-dispute" @click="answerCash(false)">Chưa đúng</FhButton>
                </div>
              </div>
            </template>
            <section v-else-if="checkoutState !== 'paid' && cashFirstEnabled && cashIntent?.status === 'pending'" class="space-y-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-warning-900" aria-labelledby="visit-cash-intent-pending-title" data-testid="visit-cash-intent-pending">
              <div>
                <h3 id="visit-cash-intent-pending-title" class="font-semibold text-balance">Chờ kỹ thuật viên xác nhận tiền mặt</h3>
                <p class="mt-1 text-sm text-warning-800">Gồm {{ checkout.devices.length }} thiết bị</p>
              </div>
              <dl class="rounded-lg bg-white/70 p-3">
                <dt class="text-xs text-warning-800">Số tiền cần trả</dt>
                <dd class="mt-0.5"><FhMoney :amount="cashIntent.customerDueVnd" emphasis /></dd>
              </dl>
              <p>Yêu cầu chưa phải thanh toán hoàn tất. Bạn có thể huỷ khi kỹ thuật viên chưa xác nhận đã nhận tiền.</p>
              <FhButton variant="secondary" size="md" class="w-full sm:w-auto" :disabled="busy" :loading="busy" data-testid="visit-cash-intent-cancel" @click="cancelCashIntent">Hủy yêu cầu tiền mặt</FhButton>
            </section>
            <section v-else-if="checkoutState !== 'paid' && cashFirstEnabled && cashIntent?.status === 'received'" class="space-y-2 rounded-xl border border-ink-200 bg-ink-50 p-4 text-ink-800" data-testid="visit-cash-intent-received">
              <h3 class="font-semibold text-balance">Kỹ thuật viên đã báo nhận tiền mặt</h3>
              <p class="text-sm text-ink-600">Gồm {{ checkout.devices.length }} thiết bị</p>
              <p>Máy chủ ghi nhận số tiền <strong class="font-num"><FhMoney :amount="cashIntent.customerDueVnd" /></strong>. Đang chờ trạng thái lượt được cập nhật; chưa hiển thị là đã thanh toán.</p>
            </section>
            <template v-else-if="checkout.ready && !checkout.paid && checkout.total > 0 && !voucherReconciliationRequired">
                <p v-if="cashFirstEnabled && cashIntent?.status === 'cancelled'" class="rounded-xl border border-ink-200 bg-ink-50 p-3 text-ink-700" data-testid="visit-cash-intent-cancelled">Yêu cầu tiền mặt cho {{ checkout.devices.length }} thiết bị đã được huỷ. Bạn có thể chọn cách thanh toán khác.</p>
                <VoucherCheckoutChooser
                  :scope-id="visitId"
                  @applied="handleVoucherApplied"
                  @terminal="handleVoucherTerminal"
                  @released="clearFundedVoucher"
                  @expired="clearFundedVoucher"
                />
                <FhButton v-if="activeFundedVoucher?.preview.customerDueVnd === 0" class="w-full" size="lg" :disabled="voucherCollectionBlocked || busy || checkoutLoading" :loading="busy" data-testid="visit-confirm-zero" @click="confirmZeroCheckout">Xác nhận tất toán 0 ₫</FhButton>
                <template v-else>
                <div class="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200/90" role="radiogroup" aria-label="Cách thanh toán" data-testid="visit-pay-methods">
                  <button
                    v-for="method in payMethods"
                    :key="method"
                    type="button"
                    role="radio"
                    :aria-checked="payMethod === method"
                    :tabindex="payMethod === method ? 0 : -1"
                    class="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 disabled:opacity-50 cursor-pointer"
                    :class="payMethod === method ? 'bg-brand-50/80' : 'bg-white hover:bg-ink-50'"
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
                  <p v-if="cashFirstEnabled">Gửi yêu cầu để máy chủ chốt số tiền hiện tại cho cả lượt {{ checkout.devices.length }} thiết bị. Kỹ thuật viên chỉ xác nhận đã nhận sau khi yêu cầu được tạo.</p>
                  <p v-else>Trả tiền trực tiếp cho kỹ thuật viên. Bạn sẽ xác nhận đúng số tiền sau khi kỹ thuật viên khai báo đã nhận.</p>
                  <FhButton v-if="cashFirstEnabled" variant="secondary" class="w-full" size="lg" :disabled="voucherCollectionBlocked || busy || checkoutLoading" :loading="busy" data-testid="visit-cash-intent" @click="createCashIntent">Yêu cầu trả tiền mặt</FhButton>
                  <FhButton v-else-if="!cashInstructionsOpen" variant="secondary" class="w-full" size="lg" :disabled="voucherCollectionBlocked || busy || checkoutLoading" data-testid="visit-cash-intent" @click="openCashInstructions">Tiếp tục với tiền mặt</FhButton>
                  <section v-else class="space-y-2 rounded-xl border border-ink-200 bg-ink-50 p-4" role="status" aria-live="polite" aria-labelledby="visit-cash-instructions-title" tabindex="-1" data-testid="visit-cash-instructions">
                    <h3 id="visit-cash-instructions-title" class="font-semibold text-ink-900">Hướng dẫn trả tiền mặt</h3>
                    <p v-if="activeFundedVoucher">Số tiền khách dự kiến trả theo máy chủ: <strong class="font-num"><FhMoney :amount="activeFundedVoucher.preview.customerDueVnd" /></strong></p>
                    <p v-else>Số tiền của cả lượt: <strong class="font-num"><FhMoney :amount="checkout.total" /></strong></p>
                    <p>Nút này chỉ mở hướng dẫn. Chưa ghi nhận đã thanh toán và chưa gửi xác nhận tiền mặt lên hệ thống.</p>
                    <p>Đưa số tiền trên trực tiếp cho kỹ thuật viên. Kỹ thuật viên khai báo số tiền đã nhận; sau đó bạn xác nhận đúng số tiền hoặc báo chưa đúng.</p>
                    <FhButton variant="ghost" size="md" data-testid="visit-cash-instructions-close" @click="cashInstructionsOpen = false">Đóng hướng dẫn</FhButton>
                  </section>
                </div>
                <FhButton v-if="payMethod === 'wallet'" class="w-full" size="lg" :disabled="voucherCollectionBlocked || !walletCovers || busy || checkoutLoading" :loading="busy" data-testid="visit-pay-wallet" @click="payWithWallet">Trả bằng ví</FhButton>
                <FhButton v-else-if="payMethod === 'vnpay'" class="w-full" size="lg" :disabled="voucherCollectionBlocked || busy || checkoutLoading" :loading="busy" data-testid="visit-pay-vnpay" @click="payWithVnpay">Thanh toán qua VNPay</FhButton>
                </template>
            </template>
          </section>
        </aside>
      </div>
    </template>

    <!-- Reschedule Modal -->
    <Transition name="fh-modal">
      <div v-if="rescheduleOpen" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/50 backdrop-blur-xs p-0 sm:p-4" @click.self="rescheduleOpen = false">
        <div class="fh-modal-panel fh-modal-panel--sheet max-h-[90vh] w-full sm:max-w-xl space-y-4 overflow-y-auto overscroll-contain rounded-t-[24px] sm:rounded-2xl bg-white p-5 sm:p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="visit-reschedule-title">
          <div class="flex items-start justify-between gap-3">
            <h2 id="visit-reschedule-title" class="text-lg font-bold text-ink-900">Đổi lịch cho cả lượt</h2>
            <button type="button" class="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="Đóng" @click="rescheduleOpen = false"><X :size="18" /></button>
          </div>
          <p class="rounded-xl border border-warning-200 bg-warning-50 px-3.5 py-2.5 text-sm text-warning-800">Mỗi lượt sửa chỉ đổi lịch được một lần, mọi thiết bị đổi cùng nhau.</p>
          <BookingSessionPicker v-model="chosenSession" :sessions="sessions" busy-hint="Thợ đã có lịch buổi này" />
          <FhButton class="w-full" size="lg" :disabled="!chosenSession || busy" :loading="busy" data-testid="visit-reschedule-save" @click="saveReschedule">Lưu lịch mới</FhButton>
        </div>
      </div>
    </Transition>

    <!-- Cancel Confirmation Modal (Professional UI according to UX/UI specification) -->
    <Transition name="fh-modal">
      <div v-if="cancelOpen" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/50 backdrop-blur-xs p-0 sm:p-4" @click.self="cancelOpen = false">
        <div class="fh-modal-panel fh-modal-panel--sheet max-h-[90vh] w-full sm:max-w-xl space-y-5 overflow-y-auto overscroll-contain rounded-t-[24px] sm:rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="visit-cancel-title">
          <div class="flex items-start gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-600 ring-8 ring-danger-50" aria-hidden="true">
              <AlertTriangle :size="24" />
            </div>
            <div class="min-w-0 flex-1">
              <h2 id="visit-cancel-title" class="text-lg sm:text-xl font-bold text-ink-900">
                Xác nhận hủy cả lượt sửa?
              </h2>
              <p class="mt-1 text-sm text-ink-600">
                Lượt sửa này gồm <strong class="font-semibold text-ink-900">{{ visit?.items.length }} thiết bị</strong>. Hành động này sẽ áp dụng cho toàn bộ các thiết bị trong lượt.
              </p>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              aria-label="Đóng"
              @click="cancelOpen = false"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Thông tin hậu quả -->
          <div class="space-y-2.5 rounded-xl border p-4 text-sm" :class="held ? 'border-danger-200 bg-danger-50/70 text-danger-900' : 'border-amber-200 bg-amber-50/70 text-amber-900'">
            <div class="flex items-center gap-2 font-semibold">
              <AlertCircle :size="17" class="shrink-0" :class="held ? 'text-danger-600' : 'text-amber-600'" />
              <span>Lưu ý quan trọng khi hủy:</span>
            </div>
            <ul class="list-disc list-inside space-y-1.5 text-xs sm:text-sm pl-1 opacity-90 leading-relaxed">
              <li>Mọi thiết bị trong lượt sửa đều sẽ bị hủy cùng lúc.</li>
              <li v-if="held">
                <strong>Trừ điểm uy tín:</strong> Kỹ thuật viên đã nhận lịch cho lượt này. Việc hủy từ phía bạn sẽ bị trừ điểm uy tín tài khoản theo quy định của FixHome.
              </li>
              <li v-else>
                Hệ thống sẽ dừng tìm kiếm kỹ thuật viên cho cả {{ visit?.items.length }} thiết bị trong lượt.
              </li>
              <li>Dữ liệu lượt sửa không bị xóa cứng, bạn có thể xem lại trong lịch sử đơn.</li>
            </ul>
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
            <FhButton variant="secondary" size="md" :disabled="busy" @click="cancelOpen = false">
              Giữ lượt sửa
            </FhButton>
            <FhButton variant="danger" size="md" :loading="busy" data-testid="visit-cancel-confirm" @click="confirmCancel">
              <Trash2 v-if="!busy" :size="17" class="mr-1.5" aria-hidden="true" />
              Xác nhận hủy
            </FhButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@media (max-width: 639px) {
  .visit-device {
    min-width: 13rem;
  }
}
</style>
