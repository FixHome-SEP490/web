<script setup lang="ts">
import VoucherCheckoutChooser from '../../components/vouchers/VoucherCheckoutChooser.vue';
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Map as MapIcon,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Star,
  Wallet,
  X,
} from 'lucide-vue-next';
import {
  FhButton,
  FhSkeleton,
  FhStatusPill,
  FhMoney,
  FhTimeline,
  FhConfirmDialog,
  MapTilerMap,
  ReviewTechnicianModal,
  type MapMarker,
  type TimelineStep,
} from '../../components';
import { coverageKindLabel, describeCoverage, ordersApi, type ServiceOrderItem, type AdditionalCostRecord, type WarrantyClaimView, type EvidenceType, type WarrantyCoverageRecord } from '../../api/orders.api';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { orderBilling, paymentChannels } from '../../utils/order-billing';
import { partRequestsApi, type PartRequest } from '../../api/part-requests.api';
import { customerWalletApi } from '../../api/customer-wallet.api';
import { fundedCheckoutApi } from '../../api/funded-checkout.api';
import { cashIntentsApi, type CashIntentCapability } from '../../api/cash-intents.api';
import type { FundedReservation } from '../../api/funded-checkout.api';
import type { VoucherCheckoutPreview } from '../../api/vouchers.api';
import { userFacingError } from '../../utils/user-facing-error';
import { pendingPaymentCashNotice } from '../../utils/pending-payment-cash-notice';
import { canDecideOfficialQuotation } from '../../utils/quotation-decision';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { useChatStore } from '../../stores/chat.store';
import OrderComplaintPanel from '../../components/customer/OrderComplaintPanel.vue';
import CustomerStopReplaceRequest from '../../components/customer/CustomerStopReplaceRequest.vue';
import CustomerContinuationPanel from '../../components/customer/CustomerContinuationPanel.vue';
import CustomerCancelledRebookAction from '../../components/customer/CustomerCancelledRebookAction.vue';
import WarrantyClaimCard from '../../components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal, { type ClaimableCoverage } from '../../components/customer/WarrantyClaimModal.vue';
import { isOpenClaim } from '../../utils/warranty-claim';
import { vnDateString, vnDateTimeString, vnTimeString } from '../../utils/vn-time';
import { toTimelineSteps } from '../../utils/order-timeline';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { useQueryClient } from '@tanstack/vue-query';
import { afterRunningRead, onOrderChange, onOrderLocation, onResync, whileOffline } from '../../services/live-updates';
import type { OrderChangeKind } from '../../services/chat-socket.service';
import { formatRating } from '../../utils/formatters';

const route = useRoute();
const showRebook = ref(false);
const router = useRouter();
const chatStore = useChatStore();
const orderId = route.params.id as string;
const cache = useCacheUpdates();
const queryClient = useQueryClient();

const actionLoading = ref(false);
const financialReadReady = ref(false);
const order = ref<ServiceOrderItem | null>(null);
const workStopped = computed(() => order.value?.workStopped === true || order.value?.operationalDisposition === 'STOPPED');
// The technician stepped off before arriving (PO 20/10/2026): the customer picks another one for the same order.
const awaitingTechnician = computed(() => !workStopped.value && !!order.value && !order.value.technician
  && ['ACCEPTED', 'EN_ROUTE'].includes(String(order.value.status).toUpperCase()));
const newTechnicianInvited = computed(() => (bookingDetails.value?.invitations ?? [])
  .some(invitation => ['PENDING', 'STANDBY'].includes(String(invitation.status).toUpperCase())));
const invoice = ref<{ id?: string; [key: string]: unknown } | null>(null);
const fundedVoucher = ref<{ reservation: FundedReservation; preview: VoucherCheckoutPreview } | null>(null);
const voucherClock = ref(Date.now());
const activeFundedVoucher = computed(() => fundedVoucher.value
  && fundedVoucher.value.reservation.scopeId === order.value?.id
  && (Date.parse(fundedVoucher.value.reservation.expiresAt) > voucherClock.value
    || cashSettlement.value?.status === 'pending_confirmation')
  ? fundedVoucher.value : null);
let voucherExpiryTimer: ReturnType<typeof setInterval> | null = null;
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const quotationFeedback = ref<typeof actionMessage.value>(null);
const quotationFeedbackElement = ref<HTMLElement | null>(null);
const quotationCheckId = ref<string | null>(null);
const quotationPending = ref(false);

// Modals
const showCancelModal = ref(false);
const showPaymentModal = ref(false);
const paymentDialog = ref<HTMLElement | null>(null);
let paymentOpener: HTMLElement | null = null;
watch(showPaymentModal, async open => {
  if (open) {
    paymentOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    paymentDialog.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  } else paymentOpener?.focus();
});
const onPaymentKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && !actionLoading.value && !walletPaying.value) showPaymentModal.value = false;
  if (event.key !== 'Tab') return;
  const controls = [...(paymentDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? [])];
  const first = controls[0];
  const last = controls.at(-1);
  if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
};
const showWarrantyClaimModal = ref(false);
const showTrackingModal = ref(false);
// Warranty Coverages & Claims for completed order
type OrderWarrantyRecord = WarrantyCoverageRecord;

const orderWarranties = ref<OrderWarrantyRecord[]>([]);
const warrantyClaims = ref<WarrantyClaimView[]>([]);
const activeWarrantyClaim = computed(
  () => warrantyClaims.value.find((claim) => isOpenClaim(claim.status)) ?? null,
);
const busyCoverageIds = computed(() =>
  warrantyClaims.value.filter((claim) => isOpenClaim(claim.status)).map((claim) => claim.warrantyCoverageId),
);
const claimableCoverages = computed<ClaimableCoverage[]>(() =>
  orderWarranties.value
    .filter((w) => w.status?.toUpperCase() !== 'VOIDED')
    .map((w) => ({
      id: w.id,
      ...describeCoverage(w),
      warrantyDaysSnapshot: w.warrantyDaysSnapshot,
      startsAt: w.startsAt,
      expiresAt: w.expiresAt,
      status:
        new Date(w.expiresAt).getTime() > Date.now() && w.status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'EXPIRED',
    })),
);
const hasClaimableCoverage = computed(() =>
  claimableCoverages.value.some((coverage) => !busyCoverageIds.value.includes(coverage.id)),
);
const claimCoverageLabel = (claim: WarrantyClaimView) =>
  claimableCoverages.value.find((coverage) => coverage.id === claim.warrantyCoverageId)?.itemDescription;

const isOrderWarrantyActive = computed(() => {
  const now = new Date();
  return orderWarranties.value.some(
    (w) => new Date(w.expiresAt).getTime() > now.getTime() && w.status?.toUpperCase() === 'ACTIVE'
  );
});

const maxWarrantyExpiresAt = computed(() => {
  if (orderWarranties.value.length === 0) return '';
  let max = orderWarranties.value[0].expiresAt;
  orderWarranties.value.forEach((w) => {
    if (new Date(w.expiresAt).getTime() > new Date(max).getTime()) {
      max = w.expiresAt;
    }
  });
  return max;
});

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : vnDateString(d);
  } catch {
    return val;
  }
};

const formatFullTimestamp = (val?: string | null) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime())
      ? val
      : vnDateTimeString(d, {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
  } catch {
    return val;
  }
};

// Evidence Photos State (Ảnh trước và sau khi làm + Ghi chú của thợ)
export interface OrderEvidence {
  id: string;
  /** `checkin_face` (the technician's face at check-in) appears only under "Tất cả". */
  type: EvidenceType;
  mediaUrl: string;
  note?: string | null;
  capturedAt?: string | null;
  createdAt?: string;
}

const evidences = ref<OrderEvidence[]>([]);
const bookingDetails = ref<BookingItem | null>(null);
const lightboxEvidence = ref<OrderEvidence | null>(null);
const evidenceFilter = ref<'ALL' | 'BEFORE' | 'AFTER' | 'ADDITIONAL'>('ALL');

const beforeEvidences = computed(() =>
  evidences.value.filter((e) => e.type?.toLowerCase() === 'before')
);
const afterEvidences = computed(() =>
  evidences.value.filter((e) => e.type?.toLowerCase() === 'after')
);
const additionalEvidences = computed(() =>
  evidences.value.filter((e) => e.type?.toLowerCase() === 'additional')
);
const filteredEvidences = computed(() => {
  if (evidenceFilter.value === 'BEFORE') return beforeEvidences.value;
  if (evidenceFilter.value === 'AFTER') return afterEvidences.value;
  if (evidenceFilter.value === 'ADDITIONAL') return additionalEvidences.value;
  return evidences.value;
});

const partRequests = ref<PartRequest[]>([]);
const billing = computed(() => orderBilling(order.value, invoice.value, additionalCosts.value, partRequests.value));
const laborItems = computed(() => billing.value.items.filter(item => item.type.toUpperCase() === 'LABOR'));
const partsItems = computed(() => billing.value.items.filter(item => item.type.toUpperCase() !== 'LABOR'));
const shownLaborTotal = computed(() => billing.value.labor);
const shownPartsTotal = computed(() => billing.value.parts);
const oldFinanceReview = computed(() => workStopped.value || !!order.value?.failedWorkFinance);
const paymentOptions = computed(() => paymentChannels(billing.value.total, oldFinanceReview.value || billing.value.mismatch || !financialReadReady.value || !invoice.value?.id || isPaid.value));
const paymentBlocked = computed(() => paymentOptions.value.length === 0);

const openLightbox = (ev: OrderEvidence) => {
  lightboxEvidence.value = ev;
};
const closeLightbox = () => {
  lightboxEvidence.value = null;
};

const canDecideQuotation = computed(() => !oldFinanceReview.value && canDecideOfficialQuotation(order.value));

// Additional Cost (Chi phí phát sinh)
const additionalCosts = ref<AdditionalCostRecord[]>([]);
const acDecidingId = ref('');
const externalDisclaimerAccepted = ref<Record<string, boolean>>({});
const hasExternalParts = (cost: AdditionalCostRecord) => {
  return cost.items?.some((i) => i.partSource === 'external') ?? false;
};

// Review
const showReviewModal = ref(false);
const existingReview = ref<Review | null>(null);

// Cash Settlement State
const cashSettlement = ref<{
  id: string;
  declaredAmount: number;
  confirmedAmount?: number;
  status: 'pending_confirmation' | 'confirmed' | 'disputed';
  technicianNotes?: string;
} | null>(null);
const cashIntentCapability = ref<CashIntentCapability | null>(null);
const cashCreateCommandId = ref<string | null>(null);
const cashCancelCommandId = ref<string | null>(null);
const cashFirstEnabled = computed(() => cashIntentCapability.value?.cashFirstEnabled === true);
const cashCapabilityKnown = computed(() => cashIntentCapability.value !== null);
const currentCashIntent = computed(() => cashIntentCapability.value?.intent ?? null);

const confirmCashAmount = ref<number | ''>('');
const cashMismatchNote = ref('');

// Render only the timeline entries actually returned by the Backend API.
// No locally invented states or progression — an empty timeline is shown honestly.
// Status labels, times and roles in plain Vietnamese (utils/order-timeline.ts).
const timelineSteps = computed<TimelineStep[]>(() => toTimelineSteps(order.value?.timeline ?? []));

const trackingMarkers = computed<MapMarker[]>(() => {
  if (workStopped.value) return [];
  const markers: MapMarker[] = [];
  if (order.value?.destination) markers.push({ id: 'destination', lat: order.value.destination.lat, lng: order.value.destination.lng, color: '#16a34a' });
  if (order.value?.technicianLocation) markers.push({ id: 'technician', lat: order.value.technicianLocation.lat, lng: order.value.technicianLocation.lng, color: '#2563eb' });
  return markers;
});

// PO 18/10/2026: the technician's position arrives live over the socket and
// moves the marker directly; the order is read every 15 s only while the socket
// is down.
let trackingPoll: (() => void) | null = null;
let trackingGeneration = 0;
const stopTrackingPoll = () => { ++trackingGeneration; trackingPoll?.(); trackingPoll = null; };
const startTrackingPoll = () => {
  stopTrackingPoll();
  if (workStopped.value) return;
  const request = trackingGeneration;
  trackingPoll = whileOffline(async () => {
    try {
      const fresh = await ordersApi.getOrder(orderId);
      if (order.value && !workStopped.value && request === trackingGeneration) Object.assign(order.value, fresh);
    } catch {
      // Ignore transient polling errors; next tick retries.
    }
  }, 15000);
};
const stopLiveLocation = onOrderLocation(orderId, (event) => {
  if (!order.value || workStopped.value) return;
  order.value.technicianLocation = { ...(order.value.technicianLocation ?? {}), lat: event.lat, lng: event.lng, updatedAt: event.updatedAt } as typeof order.value.technicianLocation;
});

watch(() => [order.value?.status, workStopped.value] as const, ([status, stopped]) => {
  if (!stopped && (status === 'EN_ROUTE' || status === 'en_route')) startTrackingPoll();
  else {
    stopTrackingPoll();
    showTrackingModal.value = false;
    if (stopped && order.value) order.value.technicianLocation = null;
  }
});

watch(() => order.value?.arrivalVerified, (verified) => {
  if (verified) showTrackingModal.value = false;
});

onUnmounted(() => {
  stopTrackingPoll();
  stopLiveLocation();
});

// Everything the order page reads, in one cached answer. Each part that cannot be
// read is left as it was (undefined), as before the cache.
type CashSettlementView = NonNullable<typeof cashSettlement.value>;
interface CustomerOrderBundle {
  order: ServiceOrderItem;
  invoice?: { id?: string; [key: string]: unknown } | null;
  settlement?: CashSettlementView;
  cashIntent: CashIntentCapability | null;
  evidences: OrderEvidence[];
  booking?: BookingItem | null;
  review?: Review | null;
  costs?: AdditionalCostRecord[];
  parts?: PartRequest[];
  warranties?: OrderWarrantyRecord[];
  claims?: WarrantyClaimView[];
  financialReadReady: boolean;
}

/** Undefined when the read fails: the page keeps what it showed. */
const optional = async <T,>(read: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await read();
  } catch {
    return undefined;
  }
};

/**
 * Reads the order page. With `kinds` (a live update, PO 18/10/2026) only the
 * parts that change touched are read again and the rest is kept, so a photo the
 * technician adds does not read the invoice, the booking and the warranties
 * again; a status change, or no kinds, reads everything.
 */
async function fetchOrderBundle(kinds?: OrderChangeKind[]): Promise<CustomerOrderBundle> {
  const previous = kinds ? queryClient.getQueryData<CustomerOrderBundle>(queryKeys.orders.customerDetail(orderId)) : undefined;
  const all = !previous || !kinds || kinds.some((kind) => kind === 'status' || kind === 'order' || kind === 'assignment');
  const touched = (...names: OrderChangeKind[]) => all || names.some((name) => kinds!.includes(name));
  const data = await ordersApi.getOrder(orderId);
  const completed = data.status === 'COMPLETED' || (data.status as string) === 'completed';
  const invoice = touched('invoice', 'cash', 'quotation', 'additional_cost', 'part') ? await optional(() => ordersApi.getInvoice(orderId)) : previous?.invoice;
  const settlement = touched('cash', 'invoice') ? await optional(() => ordersApi.getCashSettlement(orderId)) : previous?.settlement;
  const cashIntent = previous?.cashIntent ?? null;
  if (touched('cash', 'invoice')) void refreshCashIntent(data.id);
  // Before and after photos from the technician.
  let evidences: OrderEvidence[] = previous?.evidences ?? [];
  if (touched('evidence', 'arrival')) {
    try {
      evidences = await ordersApi.getEvidence(orderId);
    } catch {
      evidences = [];
    }
  }
  // The original booking, for the description and the diagnosis: it does not change once the order exists,
  // except its invitations while the order waits for a new technician.
  const bookingId = data.bookingId;
  const waitingForTechnician = ['ACCEPTED', 'EN_ROUTE'].includes(String(data.status).toUpperCase()) && !data.technician;
  const booking = previous?.booking && !waitingForTechnician
    ? previous.booking
    : (bookingId ? await optional(() => bookingsApi.getBooking(bookingId)) : undefined);
  const review = data.status === 'COMPLETED' ? (all || previous?.review === undefined ? await optional(() => reviewsApi.getByOrder(orderId)) : previous.review) : undefined;
  // Additional costs exist only once the repair started.
  const costs =
    data.status === 'UNDER_REPAIR' || data.status === 'COMPLETED'
      ? touched('additional_cost', 'part') ? await optional(() => ordersApi.getAdditionalCosts(orderId)) : previous?.costs
      : undefined;
  const warranties = completed
    ? touched('warranty') ? await optional(async () => (await ordersApi.getOrderWarranties(orderId)) as OrderWarrantyRecord[]) : previous?.warranties
    : undefined;
  const claims = completed ? (touched('warranty') ? await optional(() => ordersApi.getOrderWarrantyClaims(orderId)) : previous?.claims) : undefined;
  const parts = touched('part', 'invoice', 'quotation', 'additional_cost') ? await optional(() => partRequestsApi.getByOrderId(orderId)) : previous?.parts;
  return {
    order: data,
    invoice,
    settlement: settlement ? (settlement as unknown as CashSettlementView) : undefined,
    cashIntent,
    evidences,
    booking,
    review,
    costs,
    parts,
    financialReadReady: invoice !== undefined && parts !== undefined && (!['UNDER_REPAIR', 'COMPLETED'].includes(data.status) || costs !== undefined),
    warranties,
    claims,
  };
}

const orderQuery = useCachedQuery({
  key: queryKeys.orders.customerDetail(orderId),
  fetch: () => fetchOrderBundle(),
  // Status and money change from the other side too: the cached copy shows at
  // once, and every visit reads it again.
  staleTime: 0,
  structuralSharing: false,
});

function applyOrderBundle(bundle: CustomerOrderBundle) {
  order.value = bundle.order.workStopped === true || bundle.order.operationalDisposition === 'STOPPED'
    ? { ...bundle.order, technicianLocation: null } : bundle.order;
  financialReadReady.value = bundle.financialReadReady;
  if (bundle.invoice !== undefined) invoice.value = bundle.invoice;
  if (bundle.settlement) {
    cashSettlement.value = bundle.settlement;
    confirmCashAmount.value = bundle.settlement.declaredAmount;
  }
  if (bundle.cashIntent) cashIntentCapability.value = bundle.cashIntent;
  evidences.value = bundle.evidences;
  if (bundle.booking) bookingDetails.value = bundle.booking;
  if (bundle.review !== undefined) existingReview.value = bundle.review;
  if (bundle.costs) additionalCosts.value = bundle.costs;
  if (bundle.parts) partRequests.value = bundle.parts;
  if (bundle.warranties) orderWarranties.value = bundle.warranties;
  if (bundle.claims) warrantyClaims.value = bundle.claims;
}

let mounted = false;
onUnmounted(() => {
  mounted = false;
});

/**
 * PO 18/10/2026: what the technician or the manager does shows here as it
 * happens. Each change reads only what it touched; changes that arrive while a
 * read is running are merged and read right after it.
 */
let liveReading: Promise<void> | null = null;
let liveQueued: OrderChangeKind[] | undefined | null = null;
async function liveRefresh(kinds: OrderChangeKind[] | undefined) {
  if (liveReading) {
    liveQueued = liveQueued === null ? kinds : liveQueued && kinds ? [...new Set([...liveQueued, ...kinds])] : undefined;
    return liveReading;
  }
  liveReading = (async () => {
    try {
      await afterRunningRead(queryClient, queryKeys.orders.customerDetail(orderId));
      const bundle = await fetchOrderBundle(kinds);
      if (mounted) queryClient.setQueryData(queryKeys.orders.customerDetail(orderId), bundle);
    } catch {
      // The next change, or the next visit, reads it again.
    }
  })();
  await liveReading;
  liveReading = null;
  if (liveQueued !== null) {
    const next = liveQueued;
    liveQueued = null;
    await liveRefresh(next);
  }
}
const stopLiveOrder = onOrderChange(orderId, (event) => void liveRefresh(event.kinds));
const stopResync = onResync(() => void liveRefresh(undefined));
onUnmounted(() => {
  stopLiveOrder();
  stopResync();
});
watch(
  () => [orderQuery.query.data.value, orderQuery.query.dataUpdatedAt.value] as const,
  ([bundle]) => {
    if (mounted && bundle) applyOrderBundle(bundle);
  },
);

/** Skeleton only when nothing of this order is known yet. */
const loading = computed(() => orderQuery.query.data.value === undefined && orderQuery.loading.value);
// The page shows a short line and a retry button instead of the server text.
const loadFailed = computed(() => !!orderQuery.error.value && !order.value);

/**
 * Reads the order again (`silent` keeps the page on screen, which it always does
 * now that the order is cached). Order lists, wallets and earnings that the
 * action may have changed are refreshed or dropped too.
 */
const loadOrder = async (silent = false) => {
  if (silent || order.value) await cache.refresh(affectedBy.orderChange);
  else await orderQuery.refetch();
};

onMounted(async () => {
  mounted = true;
  const cached = orderQuery.query.data.value;
  if (cached) applyOrderBundle(cached);
  await orderQuery.query.suspense();
  const fresh = orderQuery.query.data.value;
  if (fresh && mounted) applyOrderBundle(fresh);
  if (!mounted) return;
  if (route.query.claimWarranty === 'true' || route.query.claimWarranty === '1') {
    showWarrantyClaimModal.value = true;
  }
  if (
    (route.query.autoReview === 'true' || route.query.review === 'true') &&
    (order.value?.status === 'COMPLETED' || (order.value?.status as string) === 'completed') &&
    !existingReview.value
  ) {
    showReviewModal.value = true;
  }
});
onMounted(() => {
  voucherExpiryTimer = setInterval(() => {
    voucherClock.value = Date.now();
    if (fundedVoucher.value && Date.parse(fundedVoucher.value.reservation.expiresAt) <= voucherClock.value
      && cashSettlement.value?.status !== 'pending_confirmation') {
      clearFundedVoucher();
      actionMessage.value = { type: 'error', text: 'Thời gian giữ voucher đã hết. Hóa đơn vẫn thanh toán theo tổng gốc từ máy chủ.' };
    }
  }, 1000);
});
onUnmounted(() => { if (voucherExpiryTimer) clearInterval(voucherExpiryTimer); });

async function confirmQuotationApproval(quotationId: string, allowRetry = false, failure?: unknown) {
  let latest: ServiceOrderItem | undefined;
  try {
    // A pre-decision read (including realtime) cannot confirm this write.
    await liveReading;
    await queryClient.cancelQueries({ queryKey: queryKeys.orders.customerDetail(orderId), exact: true });
    const result = await orderQuery.query.refetch({ throwOnError: true });
    if (result.data?.order.id === orderId) latest = result.data.order;
    cache.markChanged(affectedBy.orderChange);
  } catch { /* Keep the last rendered data, but never use it as confirmation. */ }
  if (!mounted) return;
  const quote = latest?.quotation;
  const failureStatus = (failure as { response?: { status?: number } } | undefined)?.response?.status;
  const rejected = failureStatus !== undefined && failureStatus >= 400 && failureStatus < 500 && failureStatus !== 409;
  if (quote?.id === quotationId && String(quote.status).toUpperCase() === 'APPROVED') {
    quotationCheckId.value = null;
    quotationFeedback.value = { type: 'success', text: 'Đã duyệt báo giá.' };
  } else if (quote && quote.id !== quotationId) {
    quotationCheckId.value = null;
    quotationFeedback.value = { type: 'error', text: 'Báo giá đã thay đổi. Vui lòng xem lại báo giá mới.' };
  } else if (latest && (allowRetry || rejected)) {
    quotationCheckId.value = null;
    quotationFeedback.value = { type: 'error', text: failure ? userFacingError(failure, 'Chưa duyệt được báo giá. Vui lòng thử lại.') : 'Báo giá vẫn đang chờ duyệt. Vui lòng xem lại trước khi thử lại.' };
  } else {
    const reason = failure ? `${userFacingError(failure, 'Chưa duyệt được báo giá.')} ` : '';
    quotationFeedback.value = { type: 'error', text: `${reason}Chưa xác nhận được kết quả. Vui lòng kiểm tra trạng thái trước khi thực hiện lại.` };
  }
}

const handleApproveQuotation = async () => {
  if (actionLoading.value || quotationCheckId.value || !canDecideQuotation.value || !order.value?.quotation?.id) return;
  const quotationId = order.value.quotation.id;
  const opener = document.activeElement;
  actionLoading.value = true;
  quotationPending.value = true;
  quotationCheckId.value = quotationId;
  quotationFeedback.value = null;
  actionMessage.value = null;
  let failure: unknown;
  try {
    await ordersApi.approveQuotation(quotationId);
  } catch (error) {
    failure = error;
  }
  try {
    await confirmQuotationApproval(quotationId, false, failure);
  } finally {
    actionLoading.value = false;
    quotationPending.value = false;
    await nextTick();
    if (mounted && (document.activeElement === opener || document.activeElement === document.body)) {
      quotationFeedbackElement.value?.focus({ preventScroll: true });
    }
  }
};

async function checkQuotationApproval() {
  if (actionLoading.value || !quotationCheckId.value) return;
  const opener = document.activeElement;
  actionLoading.value = true;
  try { await confirmQuotationApproval(quotationCheckId.value, true); }
  finally {
    actionLoading.value = false;
    await nextTick();
    if (mounted && (document.activeElement === opener || document.activeElement === document.body)) quotationFeedbackElement.value?.focus({ preventScroll: true });
  }
}

const handleRejectQuotation = async () => {
  if (actionLoading.value || quotationCheckId.value) return;
  quotationFeedback.value = null;
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    if (!canDecideQuotation.value) throw new Error('Báo giá không còn chờ duyệt. Hãy tải lại đơn hàng.');
    if (!order.value?.quotation?.id) throw new Error('Không có báo giá để từ chối.');
    await ordersApi.rejectQuotation(order.value.quotation.id, 'Khách từ chối báo giá');
    await loadOrder();
    actionMessage.value = { type: 'success', text: 'Đã từ chối báo giá của kỹ thuật viên.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa từ chối được báo giá. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const handleDecideAdditionalCost = async (cost: AdditionalCostRecord, action: 'APPROVE' | 'REJECT') => {
  if (oldFinanceReview.value || acDecidingId.value) return;
  acDecidingId.value = cost.id;
  try {
    const updated = await ordersApi.decideAdditionalCost(cost.id, action);
    const idx = additionalCosts.value.findIndex((c) => c.id === cost.id);
    if (idx !== -1) additionalCosts.value[idx] = updated;
    // Totals change with the decision: read the order again in the background.
    void cache.refresh(affectedBy.orderChange);
    actionMessage.value = {
      type: 'success',
      text: action === 'APPROVE' ? 'Đã đồng ý chi phí phát sinh. Thợ sẽ tiếp tục xử lý phần việc mới.' : 'Đã từ chối chi phí phát sinh.',
    };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa gửi được lựa chọn. Vui lòng thử lại.') };
  } finally {
    acDecidingId.value = '';
  }
};

const handleConfirmCashPayment = async () => {
  if (!cashSettlement.value || confirmCashAmount.value === '' || paymentBlocked.value || actionLoading.value) return;
  const amount = Number(confirmCashAmount.value);
  const matches = amount === cashSettlement.value.declaredAmount;
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    const held = fundedVoucher.value?.reservation ?? null;
    if (held && held.scopeId !== order.value?.id) {
      actionMessage.value = { type: 'error', text: 'Mã giữ voucher không khớp với đơn này. Chưa gửi xác nhận tiền mặt.' };
      return;
    }
    if (held && invoice.value?.id) {
      await fundedCheckoutApi.confirmCash({ kind: 'SOLO', serviceOrderId: orderId }, held.id, matches
        ? { agreed: true }
        : { agreed: false, disputeReason: cashMismatchNote.value.trim() || 'Số tiền khách xác nhận không khớp với số thợ khai báo' });
    } else {
      await ordersApi.confirmCashSettlement(orderId, {
        agreed: matches,
        confirmedAmount: amount,
        disputeReason: matches ? undefined : (cashMismatchNote.value.trim() || 'Số tiền khách xác nhận không khớp với số thợ khai báo'),
      });
    }

    if (matches) {
      if (held) clearFundedVoucher();
      await loadOrder();
      actionMessage.value = {
        type: 'success',
        text: 'Đã xác nhận thanh toán tiền mặt. Trạng thái đơn đã được cập nhật.',
      };
      if (!existingReview.value) {
        showReviewModal.value = true;
      }
    } else {
      cashSettlement.value.status = 'disputed';
      void cache.refresh(affectedBy.orderChange);
      actionMessage.value = {
        type: 'success',
        text: 'Số tiền bạn nhập không khớp với thợ khai báo — đã gửi FixHome đối soát.',
      };
    }
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa xác nhận được tiền mặt. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const handleChatWithTech = async () => {
  if (!order.value) return;
  const bookingId = (order.value as unknown as { bookingId?: string }).bookingId || orderId;
  const conv = await chatStore.openConversationForBooking(bookingId);
  if (!conv) {
    const found = chatStore.conversations.find(
      (c) => c.counterpart.id === order.value?.technician?.id,
    );
    if (found) {
      await chatStore.selectConversation(found.id);
      chatStore.toggleWidget(true);
    } else {
      chatStore.toggleWidget(true);
    }
  }
};

// Paying from the customer wallet (PO 08/10/2026): the balance is read when the payment opens.
const walletBalance = ref<number | null>(null);
const walletPaying = ref(false);
const walletCovers = computed(() => walletBalance.value !== null && !!order.value && paymentOptions.value.includes('wallet')
  && walletBalance.value >= (activeFundedVoucher.value?.preview.customerDueVnd ?? billing.value.total ?? Infinity));

function clearFundedVoucher() { fundedVoucher.value = null; }
function reservationForAction(): FundedReservation | null | undefined {
  const held = fundedVoucher.value;
  if (!held) return null;
  if (held.reservation.scopeId !== order.value?.id || Date.parse(held.reservation.expiresAt) <= Date.now()) {
    clearFundedVoucher();
    actionMessage.value = { type: 'error', text: 'Thời gian giữ voucher đã hết hoặc lượt thanh toán đã đổi. Hãy xem lại tổng tiền trước khi tiếp tục.' };
    return undefined;
  }
  return held.reservation;
}

async function handleVoucherApplied(value: { reservation: FundedReservation; preview: VoucherCheckoutPreview }) {
  if (value.reservation.scopeId !== order.value?.id || value.preview.scopeId !== order.value?.id
    || value.reservation.claimId !== value.preview.claimId || value.preview.paymentAvailable !== true) {
    actionMessage.value = { type: 'error', text: 'Máy chủ chưa xác nhận voucher cho hóa đơn này.' };
    return;
  }
  fundedVoucher.value = value;
  actionMessage.value = null;
  if (value.preview.customerDueVnd !== 0) return;
  const held = reservationForAction();
  if (!held || !invoice.value?.id || !order.value?.id) return;
  actionLoading.value = true;
  try {
    await fundedCheckoutApi.zero({ kind: 'SOLO', serviceOrderId: String(order.value.id), invoiceId: String(invoice.value.id) }, held.id);
    clearFundedVoucher();
    showPaymentModal.value = false;
    await loadOrder(true);
    actionMessage.value = { type: 'success', text: 'Máy chủ đã xác nhận tất toán voucher với số tiền khách hàng cần trả là 0 ₫.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Máy chủ chưa xác nhận được tất toán 0 ₫. Voucher vẫn giữ chỗ đến khi hết hạn; chưa ghi nhận thanh toán.') };
  } finally {
    actionLoading.value = false;
  }
}

// The ways to pay, as one list with one action (PO 21/10/2026). The wallet comes
// first; when its balance turns out short and the customer has not picked yet,
// the next way is chosen for them.
type PayMethod = 'wallet' | 'vnpay' | 'cash';
const PAY_ORDER: PayMethod[] = ['wallet', 'vnpay', 'cash'];
const payMethods = computed<PayMethod[]>(() => PAY_ORDER.filter((method) => paymentOptions.value.includes(method)
  && (method !== 'cash' || cashCapabilityKnown.value)
  && (method !== 'vnpay' || (activeFundedVoucher.value?.preview.customerDueVnd ?? billing.value.total ?? 0) >= 5000)));
const payMethod = ref<PayMethod | null>(null);
let payMethodPicked = false;
function choosePayMethod(method: PayMethod) {
  payMethod.value = method;
  payMethodPicked = true;
}
watch(walletBalance, () => {
  if (walletCovers.value || payMethodPicked || payMethod.value !== 'wallet' || walletBalance.value === null) return;
  payMethod.value = payMethods.value.find((method) => method !== 'wallet') ?? 'wallet';
});

const handlePay = () => {
  if (paymentBlocked.value || actionLoading.value) return;
  showPaymentModal.value = true;
  walletBalance.value = null;
  payMethodPicked = false;
  payMethod.value = payMethods.value[0] ?? null;
  if (paymentOptions.value.includes('wallet')) customerWalletApi.summary(1, 1).then((w) => { walletBalance.value = w.balance; }).catch(() => { walletBalance.value = null; });
};

function confirmCashIntent() {
  if (cashFirstEnabled.value) {
    void createCashIntent();
    return;
  }
  showPaymentModal.value = false;
}

function newCashCommandId(): string {
  return globalThis.crypto.randomUUID();
}

async function refreshCashIntent(serviceOrderId = order.value?.id ?? orderId) {
  try {
    cashIntentCapability.value = await cashIntentsApi.get('SOLO', serviceOrderId);
  } catch {
    // Keep the last server-attested state if the follow-up read is unavailable.
  }
}

async function createCashIntent() {
  if (oldFinanceReview.value || !cashFirstEnabled.value || !order.value || actionLoading.value || walletPaying.value
    || currentCashIntent.value?.status === 'pending' || currentCashIntent.value?.status === 'received') return;
  const held = reservationForAction();
  if (fundedVoucher.value && !held) return;
  cashCreateCommandId.value ??= newCashCommandId();
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    const intent = await cashIntentsApi.create('SOLO', order.value.id, {
      commandId: cashCreateCommandId.value,
      ...(held ? { voucherReservationId: held.id } : {}),
    });
    cashIntentCapability.value = { cashFirstEnabled: true, intent };
    cashCreateCommandId.value = null;
  } catch (error) {
    await refreshCashIntent();
    actionMessage.value = { type: 'error', text: pendingPaymentCashNotice(error)
      ?? userFacingError(error, 'Chưa tạo được yêu cầu tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') };
  } finally {
    actionLoading.value = false;
  }
}

async function cancelCashIntent() {
  const intent = currentCashIntent.value;
  if (!cashFirstEnabled.value || intent?.status !== 'pending' || actionLoading.value) return;
  cashCancelCommandId.value ??= newCashCommandId();
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    const updated = await cashIntentsApi.cancel('SOLO', intent.scopeId, {
      intentId: intent.id,
      commandId: cashCancelCommandId.value,
    });
    cashIntentCapability.value = { cashFirstEnabled: true, intent: updated };
    cashCancelCommandId.value = null;
  } catch (error) {
    await refreshCashIntent();
    actionMessage.value = { type: 'error', text: userFacingError(error, 'Chưa huỷ được yêu cầu tiền mặt. Hãy kiểm tra trạng thái trước khi thử lại.') };
  } finally {
    actionLoading.value = false;
  }
}

const payWithWallet = async () => {
  if (!invoice.value?.id || walletPaying.value || actionLoading.value || !walletCovers.value || !paymentOptions.value.includes('wallet')) return;
  const hadFundedVoucher = !!fundedVoucher.value;
  const held = reservationForAction();
  if (hadFundedVoucher && !held) return;
  walletPaying.value = true;
  try {
    const result = held
      ? await fundedCheckoutApi.wallet({ kind: 'SOLO', serviceOrderId: String(order.value?.id), invoiceId: String(invoice.value.id) }, held.id)
      : await customerWalletApi.payInvoice(String(invoice.value.id));
    showPaymentModal.value = false;
    actionMessage.value = { type: 'success', text: `Đã thanh toán ${result.amount.toLocaleString('vi-VN')} ₫ bằng ví. Số dư còn ${result.balance.toLocaleString('vi-VN')} ₫.` };
    if (held) clearFundedVoucher();
    await loadOrder(true);
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa thanh toán được bằng ví.') };
  } finally {
    walletPaying.value = false;
  }
};

const confirmPayment = async () => {
  if (actionLoading.value || walletPaying.value || !paymentOptions.value.includes('vnpay')) return;
  const hadFundedVoucher = !!fundedVoucher.value;
  const held = reservationForAction();
  if (hadFundedVoucher && !held) return;
  try {
    actionLoading.value = true;
    if (!invoice.value?.id) throw new Error('Chưa có hóa đơn để thanh toán.');
    const paymentUrl = held
      ? await fundedCheckoutApi.vnpay({ kind: 'SOLO', serviceOrderId: String(order.value?.id), invoiceId: String(invoice.value.id) }, held.id)
      : await ordersApi.createVnpayUrl(invoice.value.id);
    window.location.href = paymentUrl;
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa mở được trang thanh toán VNPay. Vui lòng thử lại.') };
    actionLoading.value = false;
  }
};

const completeNoCharge = async () => {
  if (!invoice.value?.id || actionLoading.value || walletPaying.value || !paymentOptions.value.includes('no-charge')) return;
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    await ordersApi.completeNoCharge(invoice.value.id);
    showPaymentModal.value = false;
    await loadOrder(true);
    actionMessage.value = { type: 'success', text: 'Đã hoàn tất miễn phí. Trạng thái đơn đã được cập nhật.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa hoàn tất được hóa đơn miễn phí. Vui lòng kiểm tra lại trạng thái đơn.') };
    void loadOrder(true);
  } finally {
    actionLoading.value = false;
  }
};

const confirmCancel = async () => {
  if (!canCancel.value || actionLoading.value) return;
  try {
    actionLoading.value = true;
    await ordersApi.cancelOrder(orderId, 'Khách hàng huỷ đơn');
    if (order.value) {
      order.value.status = 'CANCELLED';
    }
    void cache.refresh(affectedBy.orderChange);
    showCancelModal.value = false;
    actionMessage.value = { type: 'success', text: 'Đã gửi yêu cầu huỷ đơn thành công.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa huỷ được đơn. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const handleCloseReviewModal = () => {
  showReviewModal.value = false;
  if (route.query.autoReview || route.query.review) {
    const nextQuery = { ...route.query };
    delete nextQuery.autoReview;
    delete nextQuery.review;
    router.replace({ query: nextQuery });
  }
};

const onWarrantyClaimSubmitted = (claim: WarrantyClaimView) => {
  warrantyClaims.value = [claim, ...warrantyClaims.value];
  void cache.refresh(affectedBy.warrantyChange);
  showWarrantyClaimModal.value = false;
  actionMessage.value = {
    type: 'success',
    text: 'Đã gửi yêu cầu bảo hành. Kỹ thuật viên phụ trách sẽ liên hệ với bạn sớm.',
  };
};
const onWarrantyClaimUpdated = (claim: WarrantyClaimView) => {
  warrantyClaims.value = warrantyClaims.value.map((existing) => (existing.id === claim.id ? claim : existing));
  void cache.refresh(affectedBy.warrantyChange);
};

const handleReviewSubmitted = (review: Review) => {
  existingReview.value = review;
  void cache.refresh(affectedBy.orderChange);
  showReviewModal.value = false;
  if (route.query.autoReview || route.query.review) {
    const nextQuery = { ...route.query };
    delete nextQuery.autoReview;
    delete nextQuery.review;
    router.replace({ query: nextQuery });
  }
  actionMessage.value = {
    type: 'success',
    text: 'Cảm ơn bạn đã đánh giá kỹ thuật viên! Đánh giá đã được ghi nhận thành công.',
  };
};

// Actions at the top of the page (PO 10/10/2026): one visible secondary action for the
// state of the order, rare and destructive ones in the "⋯" menu.
const moreOpen = ref(false);

// ── Collapsible section states (YouTube description style) ──
const isCostsExpanded = ref(true);
const isPhotosExpanded = ref(true);
const isTimelineExpanded = ref(true);
const isWarrantyExpanded = ref(true);

const isCompleted = computed(() => String(order.value?.status ?? '').toUpperCase() === 'COMPLETED');
const isPaid = computed(() => String(order.value?.paymentStatus ?? '').toUpperCase() === 'PAID');
// A device of a visit is cancelled and paid with the whole visit (PO 21/10/2026).
const visitGroupId = computed(() => order.value?.visitGroupId ?? null);
const canCancel = computed(() => !oldFinanceReview.value && !visitGroupId.value && (order.value?.status === 'ACCEPTED' || order.value?.status === 'EN_ROUTE'));
const canRebook = computed(() => isCompleted.value);
/** The warranty block shows its own button; the menu only offers the claim when that block is not there. */
const claimInWarrantyBlock = computed(() => isCompleted.value && orderWarranties.value.length > 0 && hasClaimableCoverage.value);
const claimInMenu = computed(() => isCompleted.value && isPaid.value && !claimInWarrantyBlock.value);
const hasMoreMenu = computed(() => canCancel.value || claimInMenu.value);
const reviewPending = computed(() => isCompleted.value && !existingReview.value);
const showPayAfterCompletion = computed(
  () => !oldFinanceReview.value && !!order.value?.completionRequestedAt && !isPaid.value && order.value?.status === 'UNDER_REPAIR',
);
const pendingAdditionalCosts = computed(() => oldFinanceReview.value ? [] : additionalCosts.value.filter((c) => c.status === 'PENDING_APPROVAL'));
const decidedAdditionalCosts = computed(() => additionalCosts.value.filter((c) => c.status !== 'PENDING_APPROVAL'));
/** Nothing quoted yet: one line instead of a list of zeros. */
const notQuotedYet = computed(
  () =>
    !!order.value &&
    !(order.value.quotation?.items?.length) &&
    Number(order.value.grandTotal ?? 0) === 0 &&
    Number(order.value.laborTotal ?? 0) === 0 &&
    Number(order.value.partsTotal ?? 0) === 0 &&
    additionalCosts.value.length === 0 && !invoice.value,
);
const additionalCostTotal = (cost: AdditionalCostRecord) =>
  Number(cost.totalLaborDelta) + Number(cost.totalPartsDelta) + Number(cost.shippingFee || 0);
const additionalCostLabels: Record<AdditionalCostRecord['status'], string> = {
  PENDING_APPROVAL: 'Chờ bạn duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  EXPIRED: 'Hết hạn chờ duyệt',
  CANCELLED: 'Đã huỷ',
};
/** What the customer described when booking, shown once in the summary. */
// PO 18/10/2026: what the customer said is wrong, and what the service covers, are two different things.
const problemText = computed(() => order.value?.bookingDescription || bookingDetails.value?.description || '');
const scopeText = computed(() => order.value?.scopeDescription || '');
const evidenceTypeLabel = (type?: string) => {
  const t = type?.toLowerCase();
  if (t === 'before') return 'Trước khi sửa';
  if (t === 'after') return 'Sau khi sửa';
  if (t === 'checkin_face') return 'Check-in';
  return 'Phát sinh';
};
const evidenceTypeClass = (type?: string) => {
  const t = type?.toLowerCase();
  if (t === 'before') return 'bg-brand-600';
  if (t === 'after') return 'bg-success-600';
  if (t === 'checkin_face') return 'bg-ink-700';
  return 'bg-warning-600';
};
const openMenuAction = (action: () => void) => {
  moreOpen.value = false;
  action();
};

const parsedReview = computed(() => {
  if (!existingReview.value?.comment) {
    return { tags: [] as string[], text: '' };
  }
  const raw = existingReview.value.comment.trim();
  const match = raw.match(/^\[(.*?)\]\s*(.*)$/s);
  if (match) {
    const tags = match[1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const text = match[2]?.trim() || '';
    return { tags, text };
  }
  return { tags: [] as string[], text: raw };
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <router-link
      v-if="visitGroupId"
      :to="`/app/visits/${visitGroupId}`"
      class="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm hover:bg-ink-25"
      data-testid="order-visit-link"
    >
      <span class="text-ink-700">Thiết bị này thuộc một lượt sửa nhiều máy. Đổi lịch, huỷ và thanh toán làm chung cho cả lượt.</span>
      <span class="whitespace-nowrap font-semibold text-brand-700">Xem lượt sửa</span>
    </router-link>
    <!-- Back, one visible action for this state, rare ones in the "⋯" menu -->
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="whitespace-nowrap inline-flex items-center gap-1.5 h-9 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
        @click="router.push('/app/orders')"
      >
        <ArrowLeft :size="16" /> Đơn của tôi
      </button>

      <div v-if="order" class="flex items-center gap-2">
        <FhButton
          v-if="order.status === 'ACCEPTED'"
          variant="secondary"
          size="sm"
          @click="router.push(visitGroupId ? `/app/visits/${visitGroupId}` : `/app/bookings/${order!.bookingId}`)"
        >
          Đổi lịch hẹn
        </FhButton>
        <FhButton
          v-if="canRebook"
          variant="secondary"
          size="sm"
          data-testid="order-rebook"
          @click="showRebook = true"
        >
          Đặt lại thợ
        </FhButton>
        <CustomerCancelledRebookAction v-if="String(order.status).toUpperCase() === 'CANCELLED'" :booking-id="order.bookingId" :order-id="order.id" :status="order.status" @legacy="showRebook = true" />

        <div v-if="hasMoreMenu" class="relative">
          <button
            type="button"
            class="w-9 h-9 rounded-xl bg-white border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors flex items-center justify-center"
            aria-label="Thao tác khác"
            :aria-expanded="moreOpen"
            data-testid="order-more"
            @click="moreOpen = !moreOpen"
          >
            <MoreHorizontal :size="18" />
          </button>
          <div v-if="moreOpen" class="fixed inset-0 z-40" @click="moreOpen = false" />
          <div
            v-if="moreOpen"
            role="menu"
            class="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) py-1.5 z-50 text-sm"
            @keydown.esc="moreOpen = false"
          >
            <button
              v-if="claimInMenu"
              type="button"
              role="menuitem"
              class="w-full text-left px-4 py-2.5 text-ink-700 hover:bg-ink-50 whitespace-nowrap"
              @click="openMenuAction(() => (showWarrantyClaimModal = true))"
            >
              Yêu cầu bảo hành
            </button>
            <button
              v-if="canCancel"
              type="button"
              role="menuitem"
              class="w-full text-left px-4 py-2.5 text-danger-600 hover:bg-danger-50 whitespace-nowrap"
              data-testid="order-cancel"
              @click="openMenuAction(() => (showCancelModal = true))"
            >
              Huỷ đơn
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Result of the last action -->
    <div
      v-if="actionMessage"
      role="status"
      class="p-3.5 rounded-xl text-sm flex items-center gap-2"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
      <AlertCircle v-else :size="16" class="text-danger-600 shrink-0" />
      <span class="text-pretty">{{ actionMessage.text }}</span>
    </div>

    <!-- Loading: the shape of the page -->
    <div v-if="loading" class="space-y-6" aria-busy="true" aria-label="Đang tải đơn">
      <section class="rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4">
        <FhSkeleton width="55%" height="26px" />
        <FhSkeleton width="30%" height="16px" />
        <FhSkeleton height="16px" :count="2" />
        <FhSkeleton height="56px" rounded="md" />
      </section>
      <section class="rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-3">
        <FhSkeleton width="25%" height="20px" />
        <FhSkeleton height="18px" :count="4" />
      </section>
    </div>

    <!-- Could not load -->
    <section
      v-else-if="loadFailed"
      class="rounded-2xl bg-white border border-ink-200 p-6 flex flex-col items-center text-center gap-3"
      data-testid="order-load-error"
    >
      <p class="text-sm text-ink-700">Chưa tải được đơn, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="sm" @click="loadOrder()">Thử lại</FhButton>
    </section>

    <div v-else-if="order" class="flex flex-col gap-6">
      <section
        v-if="awaitingTechnician"
        role="status"
        data-testid="order-awaiting-technician"
        class="rounded-2xl bg-white border border-brand-200 p-4 sm:p-5 flex flex-wrap items-center gap-3"
      >
        <div class="min-w-0 flex-[1_1_18rem]">
          <p class="font-semibold text-ink-900">{{ newTechnicianInvited ? 'Đang chờ thợ mới nhận đơn' : 'Thợ không kịp tới buổi hẹn' }}</p>
          <p class="text-sm text-ink-600 mt-1">{{ newTechnicianInvited ? 'Bạn đã mời thợ khác, giá và lịch hẹn giữ nguyên.' : 'Bạn chọn thợ khác, giá và lịch hẹn giữ nguyên.' }}</p>
        </div>
        <FhButton
          v-if="!newTechnicianInvited"
          data-testid="order-choose-another-technician"
          @click="router.push(`/app/bookings/${order.bookingId}/candidates?released=1`)"
        >Chọn thợ khác</FhButton>
      </section>
      <!-- 1. Summary: what, where, when, who -->
      <section class="order-0 rounded-2xl bg-white border border-ink-200 shadow-(--shadow-e1) p-5 sm:p-6 space-y-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-xl sm:text-2xl font-bold text-ink-900 text-balance">{{ order.serviceName }}</h1>
            <p class="text-sm text-ink-500 font-num mt-1">{{ order.code }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <FhStatusPill :status="workStopped ? 'CANCELLED' : order.status" :label="workStopped ? 'Đã dừng công việc' : undefined" />
            <FhStatusPill
              v-if="!oldFinanceReview && order.status !== 'CANCELLED'"
              :status="isPaid ? 'COMPLETED' : 'PENDING'"
              :label="isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'"
            />
          </div>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-ink-500">Lịch hẹn</dt>
          <dd class="font-medium text-ink-900 font-num whitespace-nowrap">{{ vnDateTimeString(order.scheduledAt) }}</dd>
          <dt class="text-ink-500">Địa chỉ</dt>
          <dd class="text-ink-900 text-pretty">{{ order.addressSummary }}</dd>
          <template v-if="problemText">
            <dt class="text-ink-500">Sự cố bạn mô tả</dt>
            <dd class="text-ink-900 text-pretty whitespace-pre-line" data-testid="order-problem">{{ problemText }}</dd>
          </template>
          <template v-if="scopeText">
            <dt class="text-ink-500">Dịch vụ gồm</dt>
            <dd class="text-ink-600 text-pretty" data-testid="order-scope">{{ scopeText }}</dd>
          </template>
          <template v-if="bookingDetails?.diagnosis?.possibleIssues?.length">
            <dt class="text-ink-500">Chẩn đoán gợi ý</dt>
            <dd class="text-ink-900 text-pretty">{{ bookingDetails.diagnosis.possibleIssues.join(', ') }}</dd>
          </template>
        </dl>

        <div
          v-if="order.technician"
          class="pt-4 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold text-base shrink-0">
              {{ order.technician.fullName.charAt(0) }}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-semibold text-ink-900 text-sm truncate">{{ order.technician.fullName }}</span>
                <span class="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-success-50 text-success-700 text-xs font-medium whitespace-nowrap shrink-0">
                  <BadgeCheck :size="12" /> Đã xác minh
                </span>
              </div>
              <div class="text-sm text-ink-600 whitespace-nowrap mt-0.5">
                <template v-if="formatRating(order.technician.averageRating)">
                  <span class="text-warning-500">★</span>&nbsp;<span class="font-medium text-ink-900">{{ formatRating(order.technician.averageRating) }}</span>
                </template>
                <span v-else>Chưa có đánh giá</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="!workStopped && (order.status === 'EN_ROUTE' || order.status === 'en_route') && !order.arrivalVerified"
              type="button"
              class="w-9 h-9 rounded-xl bg-white border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors flex items-center justify-center"
              title="Xem vị trí kỹ thuật viên"
              aria-label="Xem vị trí kỹ thuật viên"
              @click="showTrackingModal = true"
            >
              <MapIcon :size="16" />
            </button>
            <a
              v-if="order.technician.phoneNumber"
              :href="`tel:${order.technician.phoneNumber}`"
              class="w-9 h-9 rounded-xl bg-white border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors flex items-center justify-center"
              title="Gọi kỹ thuật viên"
              aria-label="Gọi kỹ thuật viên"
            >
              <Phone :size="16" />
            </a>
            <FhButton variant="secondary" size="sm" @click="handleChatWithTech">
              <MessageSquare :size="16" />
              Nhắn tin
            </FhButton>
          </div>
        </div>
      </section>

      <!-- 2. What needs the customer now -->
      <!-- No customer acceptance (PO 09/10/2026): once the technician completed with photos, the customer pays. -->
      <section
        v-if="showPayAfterCompletion"
        data-testid="pay-after-completion"
        class="order-1 rounded-2xl bg-white border border-success-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div class="min-w-0 space-y-1">
          <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
            <CheckCircle2 :size="20" class="text-success-600 shrink-0" />
            <span>Kỹ thuật viên đã hoàn thành, mời bạn thanh toán</span>
          </h2>
          <p class="text-sm text-ink-600 text-pretty">
            {{ billing.mismatch ? 'Thông tin hóa đơn cần được FixHome đối chiếu trước khi thanh toán.' : billing.total === 0 ? 'Hóa đơn không phát sinh phí. Vui lòng xác nhận hoàn tất.' : billing.total !== null && billing.total < 5000 ? 'Trả bằng ví hoặc tiền mặt cho kỹ thuật viên.' : 'Trả qua ví, VNPay hoặc tiền mặt cho kỹ thuật viên.' }} Chưa hài lòng thì gửi khiếu nại ở cuối trang.
          </p>
        </div>
        <div class="flex items-center gap-4 shrink-0">
          <span class="whitespace-nowrap"><FhMoney v-if="(billing.total) !== null" :amount="billing.total" emphasis /><span v-else>Chưa xác định</span></span>
          <FhButton v-if="visitGroupId" variant="primary" size="md" data-testid="pay-with-visit" @click="router.push(`/app/visits/${visitGroupId}`)">
            Thanh toán cả lượt
          </FhButton>
          <FhButton v-else-if="invoice?.id" variant="primary" size="md" :disabled="actionLoading || paymentBlocked" @click="handlePay">
            Thanh toán ngay
          </FhButton>
        </div>
      </section>

      <p v-if="billing.mismatch" data-testid="billing-mismatch" role="alert" class="order-1 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        Hóa đơn chưa khớp với báo giá đã duyệt. Thanh toán đang bị khóa; vui lòng liên hệ FixHome để đối chiếu linh kiện đã dùng hoặc hoàn trả.
      </p>

      <p v-if="invoice && !financialReadReady" role="alert" class="order-1 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        Chưa tải đủ thông tin đối chiếu thanh toán. <button type="button" class="font-semibold underline" @click="loadOrder(true)">Thử lại</button>
      </p>
      <!-- Cash: the customer confirms what they paid -->
      <section
        v-if="cashSettlement && cashSettlement.status === 'pending_confirmation'"
        class="order-1 rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4"
        data-testid="cash-confirmation"
      >
        <div class="space-y-1">
          <h2 class="text-base font-semibold text-ink-900">Xác nhận tiền mặt</h2>
          <p class="text-sm text-ink-600 text-pretty">
            Kỹ thuật viên báo đã thu
            <strong class="text-ink-900 font-num whitespace-nowrap"><FhMoney :amount="cashSettlement.declaredAmount" /></strong>.
            <template v-if="cashSettlement.technicianNotes"> Ghi chú: {{ cashSettlement.technicianNotes }}</template>
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="block text-sm">
            <span class="block font-medium text-ink-700 mb-1">Số tiền bạn đã trả (₫)</span>
            <input
              v-model.number="confirmCashAmount"
              type="number" min="0" step="1000" inputmode="numeric"
              class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600 font-num"
            />
          </label>
          <label
            v-if="confirmCashAmount !== '' && Number(confirmCashAmount) !== cashSettlement.declaredAmount"
            class="block text-sm"
          >
            <span class="block font-medium text-ink-700 mb-1">Vì sao số tiền khác?</span>
            <textarea
              v-model="cashMismatchNote"
              rows="2"
              placeholder="Ví dụ: kỹ thuật viên báo 300.000 ₫ nhưng tôi chỉ đưa 250.000 ₫"
              class="w-full p-2.5 bg-white border border-ink-200 rounded-xl"
            ></textarea>
          </label>
        </div>

        <div class="flex justify-end">
          <FhButton
            variant="primary"
            size="md"
            :disabled="actionLoading || paymentBlocked || confirmCashAmount === ''"
            @click="handleConfirmCashPayment"
          >
            Xác nhận số tiền &amp; thanh toán
          </FhButton>
        </div>
      </section>

      <!-- Additional costs waiting for the customer -->
      <section
        v-if="pendingAdditionalCosts.length > 0"
        class="order-1 rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4"
        data-testid="pending-additional-costs"
      >
        <h2 class="text-base font-semibold text-ink-900">Chi phí phát sinh chờ bạn duyệt</h2>
        <div v-for="cost in pendingAdditionalCosts" :key="cost.id" class="space-y-3 pt-4 first-of-type:pt-0 border-t first-of-type:border-t-0 border-ink-100">
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm text-ink-700 text-pretty">{{ cost.reason }}</p>
            <span class="font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="additionalCostTotal(cost)" /></span>
          </div>
          <div v-if="cost.evidenceUrls?.length" class="flex gap-2">
            <img v-for="url in cost.evidenceUrls" :key="url" :src="url" alt="Ảnh phát sinh" class="w-14 h-14 rounded-lg object-cover border border-ink-200" />
          </div>
          <ul class="text-sm divide-y divide-ink-100">
            <li v-for="item in cost.items" :key="item.id" class="flex items-center justify-between gap-3 py-2">
              <span class="min-w-0 text-ink-700">
                {{ item.description }}
                <span class="text-ink-500 font-num whitespace-nowrap">· {{ item.quantity }} × <FhMoney :amount="item.unitPrice" /></span>
                <span v-if="item.partSource === 'external'" class="ml-1 text-xs font-medium text-warning-800 whitespace-nowrap">Linh kiện ngoài</span>
                <span v-else-if="item.partSource === 'fixhome'" class="ml-1 text-xs font-medium text-brand-700 whitespace-nowrap">Linh kiện FixHome</span>
              </span>
              <span class="font-num text-ink-900 whitespace-nowrap"><FhMoney :amount="item.lineTotal" /></span>
            </li>
            <li v-if="Number(cost.shippingFee) > 0" class="flex items-center justify-between gap-3 py-2">
              <span class="text-ink-700">Phí giao linh kiện</span>
              <span class="font-num text-ink-900 whitespace-nowrap"><FhMoney :amount="cost.shippingFee" /></span>
            </li>
          </ul>

          <div
            v-if="hasExternalParts(cost)"
            class="p-3 rounded-xl bg-warning-50 border border-warning-200 text-warning-800 text-sm space-y-2"
          >
            <p class="flex items-start gap-2 text-pretty">
              <AlertTriangle :size="16" class="text-warning-600 shrink-0 mt-0.5" />
              <span>Có linh kiện mua ngoài, không do FixHome cung cấp và không được FixHome bảo hành.</span>
            </p>
            <label class="flex items-start gap-2 cursor-pointer select-none">
              <input
                v-model="externalDisclaimerAccepted[cost.id]"
                type="checkbox"
                class="mt-0.5 h-4 w-4 text-brand-600 rounded border-warning-400"
              />
              <span class="font-medium">Tôi đã hiểu và đồng ý dùng linh kiện ngoài.</span>
            </label>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <FhButton
              variant="secondary"
              size="sm"
              :disabled="acDecidingId === cost.id"
              @click="handleDecideAdditionalCost(cost, 'REJECT')"
            >
              Từ chối
            </FhButton>
            <FhButton
              variant="primary"
              size="sm"
              :disabled="acDecidingId === cost.id || (hasExternalParts(cost) && !externalDisclaimerAccepted[cost.id])"
              :title="hasExternalParts(cost) && !externalDisclaimerAccepted[cost.id] ? 'Đánh dấu ô đồng ý trước' : ''"
              @click="handleDecideAdditionalCost(cost, 'APPROVE')"
            >
              Đồng ý chi phí
            </FhButton>
          </div>
        </div>
      </section>

      <!-- 3. Review -->
      <section
        v-if="reviewPending"
        class="order-2 rounded-2xl bg-white border border-ink-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        data-testid="review-prompt"
      >
        <p class="text-base font-semibold text-ink-900 flex items-center gap-2">
          <Star :size="20" class="text-warning-500 fill-warning-400 shrink-0" />
          Bạn thấy kỹ thuật viên làm thế nào?
        </p>
        <FhButton variant="primary" size="md" class="self-start sm:self-center" @click="showReviewModal = true">
          Đánh giá kỹ thuật viên
        </FhButton>
      </section>

      <section
        v-else-if="isCompleted && existingReview"
        class="order-2 rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-3 text-sm"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-ink-900">Đánh giá của bạn</h2>
          <span v-if="existingReview.createdAt" class="text-ink-500 font-num whitespace-nowrap">{{ formatFullTimestamp(existingReview.createdAt) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-0.5" :aria-label="`${existingReview.rating} trên 5 sao`">
            <Star
              v-for="s in 5"
              :key="s"
              :size="18"
              :class="s <= existingReview.rating ? 'text-warning-400 fill-warning-400' : 'text-ink-200'"
            />
          </span>
          <span class="font-semibold text-ink-900 font-num">{{ existingReview.rating }}/5</span>
        </div>
        <div v-if="parsedReview.tags.length > 0" class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in parsedReview.tags"
            :key="tag"
            class="inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium bg-ink-100 text-ink-700 whitespace-nowrap"
          >
            {{ tag }}
          </span>
        </div>
        <p v-if="parsedReview.text" class="text-ink-800 text-pretty">{{ parsedReview.text }}</p>
      </section>

      <!-- 4. Progress -->
      <section class="order-3 rounded-2xl bg-white border border-ink-200 overflow-hidden shadow-xs">
        <button
          type="button"
          class="w-full flex items-center justify-between p-5 sm:p-6 text-left transition-colors hover:bg-ink-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isTimelineExpanded"
          @click="isTimelineExpanded = !isTimelineExpanded"
        >
          <div class="flex items-center gap-2.5">
            <h2 class="text-base sm:text-lg font-semibold text-ink-900">Tiến trình</h2>
            <span v-if="timelineSteps.length > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-ink-100 text-ink-600 font-num">
              {{ timelineSteps.length }} mốc
            </span>
          </div>
          <div class="flex items-center gap-2 text-xs font-medium text-ink-500">
            <span class="hidden sm:inline">{{ isTimelineExpanded ? 'Thu gọn' : 'Xem chi tiết' }}</span>
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-transform duration-300 ease-out"
              :class="{ 'rotate-180': isTimelineExpanded }"
            >
              <ChevronDown :size="18" />
            </div>
          </div>
        </button>
        <div
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="isTimelineExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="min-h-0 overflow-hidden px-5 pb-5 sm:px-6 sm:pb-6 pt-0 border-t border-ink-100/60">
            <div class="pt-4">
              <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
              <p v-else class="text-sm text-ink-500">Chưa có cập nhật.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. Photos from the technician -->
      <section class="order-3 rounded-2xl bg-white border border-ink-200 overflow-hidden shadow-xs">
        <div class="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            class="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
            :aria-expanded="isPhotosExpanded"
            @click="isPhotosExpanded = !isPhotosExpanded"
          >
            <h2 class="text-base sm:text-lg font-semibold text-ink-900">Ảnh sửa chữa</h2>
            <span v-if="evidences.length > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-ink-100 text-ink-600 font-num">
              {{ evidences.length }}
            </span>
            <div
              class="flex h-6 w-6 items-center justify-center rounded-lg text-ink-400 transition-transform duration-300 ease-out"
              :class="{ 'rotate-180': isPhotosExpanded }"
            >
              <ChevronDown :size="16" />
            </div>
          </button>

          <div v-if="evidences.length > 0" class="flex items-center gap-1.5 overflow-x-auto" role="tablist" aria-label="Lọc ảnh">
            <button
              v-for="tab in [
                { key: 'ALL', label: `Tất cả (${evidences.length})`, show: true },
                { key: 'BEFORE', label: `Trước (${beforeEvidences.length})`, show: true },
                { key: 'AFTER', label: `Sau (${afterEvidences.length})`, show: true },
                { key: 'ADDITIONAL', label: `Phát sinh (${additionalEvidences.length})`, show: additionalEvidences.length > 0 },
              ].filter((t) => t.show)"
              :key="tab.key"
              type="button"
              role="tab"
              :aria-selected="evidenceFilter === tab.key"
              class="h-8 px-3 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap"
              :class="evidenceFilter === tab.key ? 'bg-brand-600 text-white shadow-xs' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'"
              @click="evidenceFilter = (tab.key as 'ALL' | 'BEFORE' | 'AFTER' | 'ADDITIONAL')"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="isPhotosExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="min-h-0 overflow-hidden px-5 pb-5 sm:px-6 sm:pb-6 pt-0 border-t border-ink-100/60">
            <div class="pt-4">
              <p v-if="filteredEvidences.length === 0" class="text-sm text-ink-500 text-pretty">
                <template v-if="workStopped">Công việc đã dừng. Ảnh cũ được giữ để đối chiếu.</template>
                <template v-else-if="order.status === 'EN_ROUTE' || order.status === 'ACCEPTED'">Kỹ thuật viên sẽ chụp ảnh khi tới nơi.</template>
                <template v-else-if="order.status === 'UNDER_REPAIR'">Kỹ thuật viên sẽ chụp ảnh sau khi sửa xong.</template>
                <template v-else>Chưa có ảnh.</template>
              </p>

              <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <button
                  v-for="ev in filteredEvidences"
                  :key="ev.id"
                  type="button"
                  class="text-left rounded-xl border border-ink-200 bg-white overflow-hidden hover:border-ink-300 hover:shadow-xs transition-all flex flex-col group"
                  :aria-label="`Phóng to ảnh ${evidenceTypeLabel(ev.type).toLowerCase()}`"
                  @click="openLightbox(ev)"
                >
                  <span class="relative block aspect-4/3 bg-ink-100 overflow-hidden">
                    <img :src="ev.mediaUrl" :alt="ev.note || 'Ảnh sửa chữa'" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    <span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap shadow-xs" :class="evidenceTypeClass(ev.type)">
                      {{ evidenceTypeLabel(ev.type) }}
                    </span>
                  </span>
                  <span class="block p-2.5 space-y-0.5">
                    <span v-if="ev.note?.trim()" class="block text-sm text-ink-800 line-clamp-2">{{ ev.note }}</span>
                    <span class="block text-xs text-ink-500 font-num whitespace-nowrap">{{ formatFullTimestamp(ev.capturedAt || ev.createdAt) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 6. Costs: one list, lines grouped, one total -->
      <section
        class="rounded-2xl bg-white border border-ink-200 overflow-hidden shadow-xs text-sm"
        :class="canDecideQuotation ? 'order-1 ring-1 ring-brand-200' : 'order-3'"
        data-testid="order-costs"
      >
        <button
          type="button"
          class="w-full flex items-center justify-between p-5 sm:p-6 text-left transition-colors hover:bg-ink-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isCostsExpanded"
          @click="isCostsExpanded = !isCostsExpanded"
        >
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="text-base sm:text-lg font-semibold text-ink-900">{{ oldFinanceReview ? 'Báo giá cũ chỉ để xem lịch sử' : canDecideQuotation ? 'Báo giá chờ bạn duyệt' : billing.final ? 'Hóa đơn cuối cùng' : 'Tạm tính theo báo giá đã duyệt' }}</h2>
            <span
              v-if="!oldFinanceReview && order.status !== 'CANCELLED' && !notQuotedYet"
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
              :class="isPaid ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-800'"
            >
              {{ isPaid ? 'Đã thanh toán' : 'Chưa thanh toán' }}
            </span>
          </div>
          <div class="flex items-center gap-2 text-xs font-medium text-ink-500">
            <span v-if="!oldFinanceReview && !notQuotedYet" class="text-sm font-semibold text-ink-900 font-num hidden sm:inline">
              <FhMoney v-if="(billing.total) !== null" :amount="billing.total" /><span v-else>Chưa xác định</span>
            </span>
            <span class="hidden sm:inline">{{ isCostsExpanded ? 'Thu gọn' : 'Xem chi tiết' }}</span>
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-transform duration-300 ease-out"
              :class="{ 'rotate-180': isCostsExpanded }"
            >
              <ChevronDown :size="18" />
            </div>
          </div>
        </button>

        <div
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="isCostsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="min-h-0 overflow-hidden px-5 pb-5 sm:px-6 sm:pb-6 pt-0 border-t border-ink-100/60">
            <div class="pt-4 space-y-5">
              <div v-if="oldFinanceReview" data-testid="stopped-work-finance" class="space-y-2 text-ink-700"><p>Báo giá cũ chỉ để xem lịch sử, không phải yêu cầu thanh toán cho công việc đã dừng.</p><p>Số tiền phải trả: Chưa xác định. Hoàn tiền: Chưa xác định.</p><p>FixHome đang đối soát nghĩa vụ cũ. Đặt lịch mới độc lập với việc đối soát và nhận linh kiện cũ.</p></div>
              <p v-else-if="notQuotedYet" class="text-ink-600 text-pretty" data-testid="order-not-quoted">
                {{ order.status === 'CANCELLED' ? 'Đơn đã huỷ trước khi có báo giá.' : 'Kỹ thuật viên sẽ báo giá sau khi kiểm tra tại nhà.' }}
              </p>

              <template v-else>
                <div class="space-y-1">
                  <div class="flex items-center justify-between gap-3 text-ink-500">
                    <h3 class="font-medium">Tiền công</h3>
                    <span class="font-num whitespace-nowrap">Tổng công: <FhMoney v-if="(shownLaborTotal) !== null" :amount="shownLaborTotal" /><span v-else>Chưa xác định</span></span>
                  </div>
                  <ul class="divide-y divide-ink-100">
                    <template v-if="laborItems.length > 0">
                      <li v-for="item in laborItems" :key="item.description" class="flex items-start justify-between gap-3 py-2.5">
                        <span class="min-w-0 text-ink-900">
                          {{ item.description }}
                          <span class="block text-ink-500 font-num whitespace-nowrap">
                            {{ item.quantity }} × <FhMoney :amount="item.unitPrice" />
                            <template v-if="item.warrantyDays"> · Bảo hành {{ item.warrantyDays }}&nbsp;ngày</template>
                          </span>
                        </span>
                        <span class="font-num font-medium text-ink-900 whitespace-nowrap"><FhMoney :amount="item.lineTotal" /></span>
                      </li>
                    </template>
                    <li v-else class="flex items-start justify-between gap-3 py-2.5">
                      <span class="min-w-0 text-ink-900">
                        {{ order.serviceName }}
                        <span class="block text-ink-500 font-num whitespace-nowrap">
                          {{ order.quantity || 1 }} × <FhMoney v-if="(shownLaborTotal) !== null" :amount="shownLaborTotal" /><span v-else>Chưa xác định</span>
                          <template v-if="order.laborWarrantyDays"> · Bảo hành {{ order.laborWarrantyDays }}&nbsp;ngày</template>
                        </span>
                      </span>
                      <span class="font-num font-medium text-ink-900 whitespace-nowrap"><FhMoney v-if="(shownLaborTotal) !== null" :amount="shownLaborTotal" /><span v-else>Chưa xác định</span></span>
                    </li>
                  </ul>
                </div>

                <div class="space-y-1">
                  <div class="flex items-center justify-between gap-3 text-ink-500">
                    <h3 class="font-medium">Linh kiện</h3>
                    <span class="font-num whitespace-nowrap">Tổng linh kiện: <FhMoney v-if="(shownPartsTotal) !== null" :amount="shownPartsTotal" /><span v-else>Chưa xác định</span></span>
                  </div>
                  <ul v-if="partsItems.length > 0" class="divide-y divide-ink-100">
                    <li v-for="item in partsItems" :key="item.description" class="flex items-start justify-between gap-3 py-2.5">
                      <span class="min-w-0 text-ink-900">
                        {{ item.description }}
                        <span class="block text-ink-500 font-num whitespace-nowrap">
                          {{ item.quantity }} × <FhMoney :amount="item.unitPrice" />
                          <template v-if="item.warrantyDays"> · Bảo hành {{ item.warrantyDays }}&nbsp;ngày</template>
                        </span>
                      </span>
                      <span class="font-num font-medium text-ink-900 whitespace-nowrap"><FhMoney :amount="item.lineTotal" /></span>
                    </li>
                  </ul>
                  <p v-else class="py-2.5 text-ink-500">Không thay linh kiện.</p>
                </div>

                <div v-if="!billing.final && decidedAdditionalCosts.length > 0" class="space-y-1">
                  <h3 class="font-medium text-ink-500">Phát sinh</h3>
                  <ul class="divide-y divide-ink-100">
                    <li v-for="cost in decidedAdditionalCosts" :key="cost.id" class="py-2.5 space-y-1.5">
                      <div class="flex items-start justify-between gap-3">
                        <span class="min-w-0 text-ink-900 text-pretty">{{ cost.reason }}</span>
                        <span class="flex items-center gap-2 shrink-0">
                          <FhStatusPill :status="cost.status" :label="additionalCostLabels[cost.status]" />
                          <span class="font-num font-medium text-ink-900 whitespace-nowrap"><FhMoney :amount="additionalCostTotal(cost)" /></span>
                        </span>
                      </div>
                      <ul class="text-ink-500 space-y-0.5">
                        <li v-for="item in cost.items" :key="item.id" class="flex items-center justify-between gap-3">
                          <span class="min-w-0">
                            {{ item.description }} <span class="font-num whitespace-nowrap">· {{ item.quantity }} × <FhMoney :amount="item.unitPrice" /></span>
                            <span v-if="item.partSource === 'external'" class="whitespace-nowrap"> · Linh kiện ngoài</span>
                            <span v-else-if="item.partSource === 'fixhome'" class="whitespace-nowrap"> · Linh kiện FixHome</span>
                          </span>
                          <span class="font-num whitespace-nowrap"><FhMoney :amount="item.lineTotal" /></span>
                        </li>
                        <li v-if="Number(cost.shippingFee) > 0" class="flex items-center justify-between gap-3">
                          <span>Phí giao linh kiện</span>
                          <span class="font-num whitespace-nowrap"><FhMoney :amount="cost.shippingFee" /></span>
                        </li>
                      </ul>
                      <img
                        v-for="url in cost.evidenceUrls ?? []"
                        :key="url"
                        :src="url"
                        alt="Ảnh phát sinh"
                        class="inline-block w-12 h-12 mr-2 rounded-lg object-cover border border-ink-200"
                      />
                    </li>
                  </ul>
                </div>

                <div class="pt-4 border-t border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div class="flex items-baseline gap-3">
                    <span class="text-ink-500">Tổng cộng</span>
                    <span class="whitespace-nowrap"><FhMoney v-if="(billing.total) !== null" :amount="billing.total" emphasis /><span v-else>Chưa xác định</span></span>
                  </div>
                  <div v-if="canDecideQuotation" class="flex items-center gap-2">
                    <FhButton variant="secondary" size="md" :disabled="actionLoading || !!quotationCheckId" @click="handleRejectQuotation">
                      Từ chối báo giá
                    </FhButton>
                    <FhButton variant="primary" size="md" :disabled="actionLoading || !!quotationCheckId" :loading="quotationPending" @click="handleApproveQuotation">
                      Duyệt báo giá
                    </FhButton>
                  </div>
                </div>
                <p v-if="quotationFeedback" ref="quotationFeedbackElement" tabindex="-1" data-testid="quotation-feedback" :role="quotationFeedback.type === 'error' ? 'alert' : 'status'" class="text-sm" :class="quotationFeedback.type === 'error' ? 'text-danger-700' : 'text-success-700'">{{ quotationFeedback.text }}</p>
                <p v-if="quotationPending" role="status" class="text-sm text-ink-600">Đang duyệt báo giá và kiểm tra trạng thái…</p>
                <FhButton v-if="quotationCheckId && !quotationPending" variant="secondary" size="md" :disabled="actionLoading" data-testid="quotation-check-status" @click="checkQuotationApproval">Kiểm tra trạng thái</FhButton>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- 7. Warranty of this order -->
      <section
        v-if="isCompleted && orderWarranties.length > 0"
        class="order-3 rounded-2xl bg-white border border-ink-200 overflow-hidden shadow-xs text-sm"
      >
        <button
          type="button"
          class="w-full flex items-center justify-between p-5 sm:p-6 text-left transition-colors hover:bg-ink-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isWarrantyExpanded"
          @click="isWarrantyExpanded = !isWarrantyExpanded"
        >
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="text-base sm:text-lg font-semibold text-ink-900">Bảo hành</h2>
            <span
              class="px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
              :class="
                activeWarrantyClaim
                  ? 'bg-warning-50 text-warning-800 border border-warning-200'
                  : isOrderWarrantyActive
                  ? 'bg-success-50 text-success-700 border border-success-200'
                  : 'bg-ink-100 text-ink-600 border border-ink-200'
              "
            >
              {{ activeWarrantyClaim ? 'Đang xử lý bảo hành' : isOrderWarrantyActive ? 'Còn hiệu lực' : 'Đã hết hạn' }}
            </span>
          </div>
          <div class="flex items-center gap-2 text-xs font-medium text-ink-500">
            <span class="hidden sm:inline">{{ isWarrantyExpanded ? 'Thu gọn' : 'Xem chi tiết' }}</span>
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-transform duration-300 ease-out"
              :class="{ 'rotate-180': isWarrantyExpanded }"
            >
              <ChevronDown :size="18" />
            </div>
          </div>
        </button>

        <div
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="isWarrantyExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="min-h-0 overflow-hidden px-5 pb-5 sm:px-6 sm:pb-6 pt-0 border-t border-ink-100/60">
            <div class="pt-4 space-y-4">
              <ul class="divide-y divide-ink-100">
                <li v-for="w in orderWarranties" :key="w.id" class="py-2.5 flex items-start justify-between gap-3">
                  <span class="min-w-0">
                    <span class="block font-medium text-ink-900">
                      <span v-if="coverageKindLabel(describeCoverage(w).kind)" class="font-normal text-ink-500">{{ coverageKindLabel(describeCoverage(w).kind) }} · </span>{{ describeCoverage(w).itemDescription }}
                    </span>
                    <span class="block text-ink-500 font-num">
                      {{ (w.warrantyDaysSnapshot ?? 0) > 0 ? `${w.warrantyDaysSnapshot} ngày` : 'Theo chính sách' }} · hết hạn {{ formatDate(w.expiresAt) }}
                    </span>
                  </span>
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0"
                    :class="new Date(w.expiresAt) > new Date() ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-600'"
                  >
                    {{ new Date(w.expiresAt) > new Date() ? 'Còn hạn' : 'Hết hạn' }}
                  </span>
                </li>
              </ul>
              <p class="flex items-center justify-between gap-3">
                <span class="text-ink-500">Hết hạn muộn nhất</span>
                <span class="font-semibold text-ink-900 font-num whitespace-nowrap">{{ formatDate(maxWarrantyExpiresAt) }}</span>
              </p>

              <div v-if="warrantyClaims.length" class="space-y-2">
                <WarrantyClaimCard
                  v-for="claim in warrantyClaims"
                  :key="claim.id"
                  :claim="claim"
                  :coverage-label="claimCoverageLabel(claim)"
                  @updated="onWarrantyClaimUpdated"
                />
              </div>

              <div v-if="hasClaimableCoverage" class="flex justify-end pt-1">
                <FhButton :variant="reviewPending ? 'secondary' : 'primary'" size="sm" @click="showWarrantyClaimModal = true">
                  Yêu cầu bảo hành
                </FhButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 8. Complaint about this order (every status) -->
      <div class="order-3">
        <CustomerContinuationPanel
          v-if="order.status === 'EN_ROUTE' || order.status === 'UNDER_REPAIR'"
          :key="`${order.id}:${order.visitGroupId ?? ''}`"
          :order-id="order.id"
          :booking-id="order.bookingId"
          :visit-group-id="order.visitGroupId ?? null"
          :order-status="order.status"
          class="mb-3"
        />
        <CustomerStopReplaceRequest v-if="!workStopped" :order-id="order.id" :order-status="order.status" />
        <OrderComplaintPanel
          :order-id="orderId"
          :order-status="order.status"
          :completed-at="order.completedAt"
        />
      </div>
    </div>

    <!-- Confirm Cancel Modal -->
    <FhConfirmDialog
      :open="showCancelModal"
      title="Huỷ đơn sửa chữa?"
      consequence="Kỹ thuật viên đã nhận đơn này. Huỷ lúc này có thể bị trừ điểm uy tín của bạn."
      confirm-text="Huỷ đơn sửa chữa"
      cancel-text="Giữ lại đơn"
      :loading="actionLoading"
      @confirm="confirmCancel"
      @cancel="showCancelModal = false"
    />

    <!-- Review Modal Component -->
    <ReviewTechnicianModal
      :open="showReviewModal"
      :order-id="orderId"
      :order-code="order?.code"
      :technician-name="order?.technician?.fullName || 'Kỹ thuật viên FixHome'"
      @close="handleCloseReviewModal"
      @submitted="handleReviewSubmitted"
    />

    <!-- Warranty Claim Modal -->
    <WarrantyClaimModal
      v-if="order"
      :open="showWarrantyClaimModal"
      :order-id="orderId"
      :order-code="order.code"
      :service-name="order.serviceName || ''"
      :technician-name="order.technician?.fullName || 'Kỹ thuật viên FixHome'"
      :coverages="claimableCoverages"
      :busy-coverage-ids="busyCoverageIds"
      @close="showWarrantyClaimModal = false"
      @submitted="onWarrantyClaimSubmitted"
    />

    <!-- Tracking Modal -->
    <div
      v-if="showTrackingModal && !workStopped"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
      @keydown.esc="showTrackingModal = false"
    >
      <div role="dialog" aria-modal="true" aria-label="Vị trí kỹ thuật viên" class="bg-white rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-4 shadow-xl">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-base font-semibold text-ink-900">Vị trí kỹ thuật viên</h3>
          <span v-if="order?.technicianLocation?.updatedAt" class="text-sm text-ink-500 whitespace-nowrap">
            Cập nhật {{ vnTimeString(order.technicianLocation.updatedAt) }}
          </span>
        </div>
        <MapTilerMap
          :center="order?.technicianLocation ? { lat: order.technicianLocation.lat, lng: order.technicianLocation.lng } : (order?.destination || { lat: 21.0285, lng: 105.8542 })"
          :markers="trackingMarkers"
          height-class="h-72"
        />
        <FhButton variant="secondary" size="md" class="w-full" @click="showTrackingModal = false">Đóng</FhButton>
      </div>
    </div>

    <!-- Payment Modal -->
    <div
      v-if="showPaymentModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div ref="paymentDialog" role="dialog" aria-modal="true" aria-label="Thanh toán đơn" @keydown="onPaymentKeydown" class="bg-white rounded-[var(--radius-md)] max-w-sm w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-ink-900">Thanh toán đơn</h3>
            <p class="whitespace-nowrap mt-1">
              <FhMoney v-if="(billing.total) !== null" :amount="billing.total" emphasis /><span v-else>Chưa xác định</span>
            </p>
          </div>
          <button
            type="button"
            class="w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100 flex items-center justify-center shrink-0"
            aria-label="Đóng"
            :disabled="actionLoading || walletPaying"
            @click="showPaymentModal = false"
          >
            <X :size="18" />
          </button>
        </div>

        <p v-if="paymentBlocked" role="alert" class="text-sm text-danger-700">Thông tin hóa đơn chưa sẵn sàng hoặc chưa khớp. Vui lòng kiểm tra lại trước khi thanh toán.</p>
        <FhButton v-if="paymentOptions.includes('no-charge')" data-testid="complete-no-charge" class="w-full" :disabled="actionLoading" :loading="actionLoading" @click="completeNoCharge">Hoàn tất miễn phí</FhButton>

        <section v-if="!isPaid && cashFirstEnabled && currentCashIntent?.status === 'pending'" class="space-y-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900" aria-labelledby="cash-intent-pending-title" data-testid="cash-intent-pending">
          <h4 id="cash-intent-pending-title" class="font-semibold text-balance">Chờ kỹ thuật viên xác nhận tiền mặt</h4>
          <dl class="border-y border-warning-200 py-3">
            <dt class="text-warning-800">Số tiền cần trả</dt>
            <dd class="mt-1"><FhMoney :amount="currentCashIntent.customerDueVnd" emphasis /></dd>
          </dl>
          <p>Yêu cầu chưa phải thanh toán hoàn tất. Bạn có thể huỷ khi kỹ thuật viên chưa xác nhận đã nhận tiền.</p>
          <FhButton variant="secondary" size="md" class="w-full" :disabled="actionLoading" :loading="actionLoading" data-testid="cash-intent-cancel" @click="cancelCashIntent">Hủy yêu cầu tiền mặt</FhButton>
        </section>
        <section v-else-if="!isPaid && cashFirstEnabled && currentCashIntent?.status === 'received'" class="space-y-2 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-800" data-testid="cash-intent-received">
          <h4 class="font-semibold text-balance">Kỹ thuật viên đã báo nhận tiền mặt</h4>
          <p>Máy chủ ghi nhận số tiền <strong class="font-num"><FhMoney :amount="currentCashIntent.customerDueVnd" /></strong>. Đang chờ trạng thái hóa đơn được cập nhật; chưa hiển thị là đã thanh toán.</p>
        </section>
        <p v-else-if="cashFirstEnabled && currentCashIntent?.status === 'cancelled'" class="rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700" data-testid="cash-intent-cancelled">Yêu cầu tiền mặt đã được huỷ. Bạn có thể chọn cách thanh toán khác.</p>

        <!-- One list of the ways to pay, one action under it (PO 21/10/2026). -->
        <template v-if="payMethods.length && !(cashFirstEnabled && ['pending', 'received'].includes(currentCashIntent?.status ?? ''))">
          <VoucherCheckoutChooser
            :key="invoice?.id"
            :scope-id="order?.id ?? null"
            @applied="handleVoucherApplied"
            @released="clearFundedVoucher"
            @expired="clearFundedVoucher"
          />
          <div class="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200" role="radiogroup" aria-label="Cách thanh toán" data-testid="pay-methods">
            <button
              v-for="method in payMethods"
              :key="method"
              type="button"
              role="radio"
              :aria-checked="payMethod === method"
              class="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors"
              :class="payMethod === method ? 'bg-brand-50' : 'bg-white hover:bg-ink-50'"
              :data-testid="`pay-method-${method}`"
              :disabled="actionLoading || walletPaying"
              @click="choosePayMethod(method)"
            >
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700" aria-hidden="true">
                <Wallet v-if="method === 'wallet'" :size="18" />
                <span v-else-if="method === 'vnpay'" class="text-[10px] font-extrabold leading-none tracking-tight"><span class="text-[#005BAA]">VN</span><span class="text-[#ED1C24]">PAY</span></span>
                <Banknote v-else :size="18" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-ink-900">{{ method === 'wallet' ? 'Ví FixHome' : method === 'vnpay' ? 'VNPay' : 'Tiền mặt' }}</span>
                <span v-if="method === 'wallet'" class="block text-xs" :class="walletBalance !== null && !walletCovers ? 'text-warning-800' : 'text-ink-500'" data-testid="wallet-balance">
                  <template v-if="walletBalance === null">Đang xem số dư…</template>
                  <template v-else>Số dư <span class="font-num"><FhMoney :amount="walletBalance" /></span><template v-if="!walletCovers"> · không đủ</template></template>
                </span>
                <span v-else-if="method === 'vnpay'" class="block text-xs text-ink-500">ATM, thẻ quốc tế, QR</span>
                <span v-else class="block text-xs text-ink-500">Trả trực tiếp cho kỹ thuật viên</span>
              </span>
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                :class="payMethod === method ? 'border-brand-600' : 'border-ink-300'"
                aria-hidden="true"
              ><span v-if="payMethod === method" class="h-2.5 w-2.5 rounded-full bg-brand-600"></span></span>
            </button>
          </div>

          <p v-if="payMethod === 'wallet' && walletBalance !== null && !walletCovers" class="text-sm text-ink-600">
            Ví chưa đủ tiền. <router-link to="/app/wallet" class="font-semibold text-brand-700 underline">Nạp thêm vào ví</router-link> hoặc chọn cách khác.
          </p>
          <p v-else-if="payMethod === 'cash'" class="text-sm text-ink-600" data-testid="pay-cash-note">
            <template v-if="cashFirstEnabled">Gửi yêu cầu tiền mặt để máy chủ chốt số tiền hiện tại; kỹ thuật viên chỉ có thể xác nhận đã nhận sau khi yêu cầu được tạo.</template>
            <template v-else>Đưa tiền cho kỹ thuật viên. Thợ khai báo số tiền, bạn xác nhận lại ngay tại đơn này.</template>
          </p>
          <FhButton
            v-if="payMethod === 'wallet'"
            class="w-full"
            size="lg"
            :disabled="!walletCovers || walletPaying || actionLoading"
            :loading="walletPaying"
            data-testid="pay-with-wallet"
            @click="payWithWallet"
          >Trả bằng ví</FhButton>
          <FhButton
            v-else-if="payMethod === 'vnpay'"
            class="w-full"
            size="lg"
            :disabled="actionLoading || walletPaying"
            :loading="actionLoading"
            data-testid="pay-with-vnpay"
            @click="confirmPayment"
          >Thanh toán qua VNPay</FhButton>
          <FhButton
            v-else-if="payMethod === 'cash'"
            class="w-full"
            size="lg"
            :disabled="actionLoading || walletPaying"
            :loading="actionLoading"
            data-testid="pay-cash-ok"
            @click="confirmCashIntent"
          >{{ cashFirstEnabled ? 'Yêu cầu trả tiền mặt' : 'Đã hiểu' }}</FhButton>
        </template>
      </div>
    </div>

    <!-- Lightbox for repair photos -->
    <div
      v-if="lightboxEvidence"
      class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      @click="closeLightbox"
      @keydown.esc="closeLightbox"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="evidenceTypeLabel(lightboxEvidence.type)"
        class="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        @click.stop
      >
        <div class="p-3.5 px-5 bg-ink-900 text-white flex items-center justify-between gap-3">
          <span class="text-sm font-medium">{{ evidenceTypeLabel(lightboxEvidence.type) }}</span>
          <button
            type="button"
            class="p-1.5 rounded-lg text-ink-400 hover:text-white hover:bg-ink-800 transition-colors"
            aria-label="Đóng"
            @click="closeLightbox"
          >
            <X :size="20" />
          </button>
        </div>

        <div class="flex-1 overflow-auto bg-ink-950 flex items-center justify-center p-4 min-h-72 max-h-[65vh]">
          <img
            :src="lightboxEvidence.mediaUrl"
            :alt="lightboxEvidence.note || 'Ảnh sửa chữa'"
            class="max-w-full max-h-[60vh] object-contain rounded-lg"
          />
        </div>

        <div class="p-4 px-5 bg-white border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
          <p v-if="lightboxEvidence.note?.trim()" class="text-ink-800 text-pretty">{{ lightboxEvidence.note }}</p>
          <span class="shrink-0 text-ink-500 font-num whitespace-nowrap sm:ml-auto">
            {{ formatFullTimestamp(lightboxEvidence.capturedAt || lightboxEvidence.createdAt) }}
          </span>
        </div>
      </div>
    </div>
    <RebookDialog
      v-if="order && showRebook"
      :open="showRebook"
      :booking-id="order.bookingId"
      :service-name="order.serviceName"
      @close="showRebook = false"
    />
  </div>
</template>
