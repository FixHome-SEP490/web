<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Phone,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Star,
  Map as MapIcon,
  AlertTriangle,
  X,
  BadgeCheck,
  MoreHorizontal,
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
import { ordersApi, type ServiceOrderItem, type AdditionalCostRecord, type WarrantyClaimView } from '../../api/orders.api';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { customerWalletApi } from '../../api/customer-wallet.api';
import { userFacingError } from '../../utils/user-facing-error';
import { canDecideOfficialQuotation } from '../../utils/quotation-decision';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { useChatStore } from '../../stores/chat.store';
import OrderComplaintPanel from '../../components/customer/OrderComplaintPanel.vue';
import WarrantyClaimCard from '../../components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal, { type ClaimableCoverage } from '../../components/customer/WarrantyClaimModal.vue';
import { isOpenClaim } from '../../utils/warranty-claim';
import { vnDateString, vnDateTimeString, vnTimeString } from '../../utils/vn-time';
import { toTimelineSteps } from '../../utils/order-timeline';
import { formatRating } from '../../utils/formatters';

const route = useRoute();
const showRebook = ref(false);
const router = useRouter();
const chatStore = useChatStore();
const orderId = route.params.id as string;

const loading = ref(true);
const loadFailed = ref(false);
const actionLoading = ref(false);
const order = ref<ServiceOrderItem | null>(null);
const invoice = ref<{ id?: string; [key: string]: unknown } | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Modals
const showCancelModal = ref(false);
const showPaymentModal = ref(false);
const showWarrantyClaimModal = ref(false);
const showTrackingModal = ref(false);
// Warranty Coverages & Claims for completed order
interface OrderWarrantyRecord {
  id: string;
  invoiceItemId?: string | null;
  warrantyDaysSnapshot: number;
  note?: string | null;
  startsAt: string;
  expiresAt: string;
  status: string;
}

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
      itemDescription: w.note || 'Bảo hành dịch vụ',
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
  type: 'before' | 'after' | 'additional';
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

const laborItems = computed(() => {
  return order.value?.quotation?.items?.filter((i) => i.type === 'LABOR') ?? [];
});
const partsItems = computed(() => {
  return order.value?.quotation?.items?.filter((i) => i.type === 'PARTS') ?? [];
});
// Before the invoice exists the order totals are 0 while the quotation lines
// are already listed; show the lines' sum then. Once invoiced, the order totals
// also carry approved additional costs, so they win.
const sumLines = (items: Array<{ lineTotal?: number | null }>) => items.reduce((sum, i) => sum + Number(i.lineTotal ?? 0), 0);
const shownLaborTotal = computed(() => Number(order.value?.laborTotal ?? 0) || sumLines(laborItems.value));
const shownPartsTotal = computed(() => Number(order.value?.partsTotal ?? 0) || sumLines(partsItems.value));

const openLightbox = (ev: OrderEvidence) => {
  lightboxEvidence.value = ev;
};
const closeLightbox = () => {
  lightboxEvidence.value = null;
};

const canDecideQuotation = computed(() => canDecideOfficialQuotation(order.value));

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

const confirmCashAmount = ref<number | ''>('');
const cashMismatchNote = ref('');

// Render only the timeline entries actually returned by the Backend API.
// No locally invented states or progression — an empty timeline is shown honestly.
// Status labels, times and roles in plain Vietnamese (utils/order-timeline.ts).
const timelineSteps = computed<TimelineStep[]>(() => toTimelineSteps(order.value?.timeline ?? []));

const trackingMarkers = computed<MapMarker[]>(() => {
  const markers: MapMarker[] = [];
  if (order.value?.destination) markers.push({ id: 'destination', lat: order.value.destination.lat, lng: order.value.destination.lng, color: '#16a34a' });
  if (order.value?.technicianLocation) markers.push({ id: 'technician', lat: order.value.technicianLocation.lat, lng: order.value.technicianLocation.lng, color: '#2563eb' });
  return markers;
});

let trackingPoll: ReturnType<typeof setInterval> | null = null;
const stopTrackingPoll = () => { if (trackingPoll) { clearInterval(trackingPoll); trackingPoll = null; } };
const startTrackingPoll = () => {
  stopTrackingPoll();
  trackingPoll = setInterval(async () => {
    try {
      const fresh = await ordersApi.getOrder(orderId);
      if (order.value) Object.assign(order.value, fresh);
    } catch {
      // Ignore transient polling errors; next tick retries.
    }
  }, 15000);
};

watch(() => order.value?.status, (status) => {
  if (status === 'EN_ROUTE' || status === 'en_route') startTrackingPoll();
  else stopTrackingPoll();
});

watch(() => order.value?.arrivalVerified, (verified) => {
  if (verified) showTrackingModal.value = false;
});

onUnmounted(stopTrackingPoll);

onMounted(async () => {
  await loadOrder();
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

/** silent keeps the page on screen while it is read again (after paying from the wallet). */
const loadOrder = async (silent = false) => {
  try {
    if (!silent) loading.value = true;
    loadFailed.value = false;
    const data = await ordersApi.getOrder(orderId);
    order.value = data;


    // Try load invoice
    try {
      invoice.value = await ordersApi.getInvoice(orderId);
    } catch {
      // Ignore
    }

    // Try load cash settlement
    try {
      const settlement = await ordersApi.getCashSettlement(orderId);
      if (settlement) {
        cashSettlement.value = settlement as unknown as {
          id: string;
          declaredAmount: number;
          confirmedAmount?: number;
          status: 'pending_confirmation' | 'confirmed' | 'disputed';
          technicianNotes?: string;
        };
        confirmCashAmount.value = cashSettlement.value.declaredAmount;
      }
    } catch {
      // Ignore
    }

    // Tải bằng chứng ảnh trước & sau khi làm từ thợ
    try {
      evidences.value = await ordersApi.getEvidence(orderId);
    } catch {
      evidences.value = [];
    }

    // Tải thông tin booking gốc để có mô tả chi tiết & chẩn đoán nếu có
    if (data.bookingId) {
      try {
        bookingDetails.value = await bookingsApi.getBooking(data.bookingId);
      } catch {
        // Ignore
      }
    }

    // Try load existing review (chỉ có nghĩa khi đơn đã hoàn tất)
    if (data.status === 'COMPLETED') {
      try {
        existingReview.value = await reviewsApi.getByOrder(orderId);
      } catch {
        // Ignore
      }
    }

    // Chi phí phát sinh chỉ tồn tại khi đơn đang UNDER_REPAIR hoặc đã COMPLETED
    if (data.status === 'UNDER_REPAIR' || data.status === 'COMPLETED') {
      try {
        additionalCosts.value = await ordersApi.getAdditionalCosts(orderId);
      } catch {
        // Ignore
      }
    }

    // Tải thông tin bảo hành & yêu cầu bảo hành nếu đơn COMPLETED
    if (data.status === 'COMPLETED' || (data.status as string) === 'completed') {
      try {
        orderWarranties.value = (await ordersApi.getOrderWarranties(orderId)) as OrderWarrantyRecord[];
      } catch {
        // Ignore
      }
      try {
        warrantyClaims.value = await ordersApi.getOrderWarrantyClaims(orderId);
      } catch {
        // Ignore
      }
    }
  } catch {
    // The page shows a short line and a retry button instead of the server text.
    if (!order.value) loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};

const handleApproveQuotation = async () => {
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    if (!canDecideQuotation.value) throw new Error('Báo giá không còn chờ duyệt. Hãy tải lại đơn hàng.');
    if (!order.value?.quotation?.id) throw new Error('Không có báo giá để duyệt.');
    await ordersApi.approveQuotation(order.value.quotation.id);
    await loadOrder();
    actionMessage.value = { type: 'success', text: 'Đã phê duyệt báo giá! Kỹ thuật viên sẽ tiến hành sửa chữa ngay.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa duyệt được báo giá. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const handleRejectQuotation = async () => {
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
  acDecidingId.value = cost.id;
  try {
    const updated = await ordersApi.decideAdditionalCost(cost.id, action);
    const idx = additionalCosts.value.findIndex((c) => c.id === cost.id);
    if (idx !== -1) additionalCosts.value[idx] = updated;
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
  if (!cashSettlement.value || confirmCashAmount.value === '') return;
  const amount = Number(confirmCashAmount.value);
  const matches = amount === cashSettlement.value.declaredAmount;
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    await ordersApi.confirmCashSettlement(orderId, {
      agreed: matches,
      confirmedAmount: amount,
      disputeReason: matches ? undefined : (cashMismatchNote.value.trim() || 'Số tiền khách xác nhận không khớp với số thợ khai báo'),
    });

    if (matches) {
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
const walletCovers = computed(() => walletBalance.value !== null && !!order.value && walletBalance.value >= Number(order.value.grandTotal ?? 0));

const handlePay = () => {
  showPaymentModal.value = true;
  walletBalance.value = null;
  customerWalletApi.summary(1, 1).then((w) => { walletBalance.value = w.balance; }).catch(() => { walletBalance.value = null; });
};

const payWithWallet = async () => {
  if (!invoice.value?.id || walletPaying.value) return;
  walletPaying.value = true;
  try {
    const result = await customerWalletApi.payInvoice(String(invoice.value.id));
    showPaymentModal.value = false;
    actionMessage.value = { type: 'success', text: `Đã thanh toán ${result.amount.toLocaleString('vi-VN')} ₫ bằng ví. Số dư còn ${result.balance.toLocaleString('vi-VN')} ₫.` };
    await loadOrder(true);
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa thanh toán được bằng ví.') };
  } finally {
    walletPaying.value = false;
  }
};

const confirmPayment = async () => {
  try {
    actionLoading.value = true;
    if (!invoice.value?.id) throw new Error('Chưa có hóa đơn để thanh toán.');
    const paymentUrl = await ordersApi.createVnpayUrl(invoice.value.id);
    window.location.href = paymentUrl;
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa mở được trang thanh toán VNPay. Vui lòng thử lại.') };
    actionLoading.value = false;
  }
};

const confirmCancel = async () => {
  try {
    actionLoading.value = true;
    await ordersApi.cancelOrder(orderId, 'Khách hàng huỷ đơn');
    if (order.value) {
      order.value.status = 'CANCELLED';
    }
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
  showWarrantyClaimModal.value = false;
  actionMessage.value = {
    type: 'success',
    text: 'Đã gửi yêu cầu bảo hành. Kỹ thuật viên phụ trách sẽ liên hệ với bạn sớm.',
  };
};
const onWarrantyClaimUpdated = (claim: WarrantyClaimView) => {
  warrantyClaims.value = warrantyClaims.value.map((existing) => (existing.id === claim.id ? claim : existing));
};

const handleReviewSubmitted = (review: Review) => {
  existingReview.value = review;
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
const isCompleted = computed(() => String(order.value?.status ?? '').toUpperCase() === 'COMPLETED');
const isPaid = computed(() => String(order.value?.paymentStatus ?? '').toUpperCase() === 'PAID');
const canCancel = computed(() => order.value?.status === 'ACCEPTED' || order.value?.status === 'EN_ROUTE');
const canRebook = computed(() => order.value?.status === 'COMPLETED' || order.value?.status === 'CANCELLED');
/** The warranty block shows its own button; the menu only offers the claim when that block is not there. */
const claimInWarrantyBlock = computed(() => isCompleted.value && orderWarranties.value.length > 0 && hasClaimableCoverage.value);
const claimInMenu = computed(() => isCompleted.value && isPaid.value && !claimInWarrantyBlock.value);
const hasMoreMenu = computed(() => canCancel.value || claimInMenu.value);
const reviewPending = computed(() => isCompleted.value && !existingReview.value);
const showPayAfterCompletion = computed(
  () => !!order.value?.completionRequestedAt && !isPaid.value && order.value?.status === 'UNDER_REPAIR',
);
const pendingAdditionalCosts = computed(() => additionalCosts.value.filter((c) => c.status === 'PENDING_APPROVAL'));
const decidedAdditionalCosts = computed(() => additionalCosts.value.filter((c) => c.status !== 'PENDING_APPROVAL'));
/** Nothing quoted yet: one line instead of a list of zeros. */
const notQuotedYet = computed(
  () =>
    !!order.value &&
    !(order.value.quotation?.items?.length) &&
    Number(order.value.grandTotal ?? 0) === 0 &&
    Number(order.value.laborTotal ?? 0) === 0 &&
    Number(order.value.partsTotal ?? 0) === 0 &&
    additionalCosts.value.length === 0,
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
const problemText = computed(() => order.value?.scopeDescription || bookingDetails.value?.description || '');
const evidenceTypeLabel = (type?: string) => {
  const t = type?.toLowerCase();
  if (t === 'before') return 'Trước khi sửa';
  if (t === 'after') return 'Sau khi sửa';
  return 'Phát sinh';
};
const evidenceTypeClass = (type?: string) => {
  const t = type?.toLowerCase();
  if (t === 'before') return 'bg-brand-600';
  if (t === 'after') return 'bg-success-600';
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
          @click="router.push(`/app/bookings/${order!.bookingId}`)"
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
      <!-- 1. Summary: what, where, when, who -->
      <section class="order-0 rounded-2xl bg-white border border-ink-200 shadow-(--shadow-e1) p-5 sm:p-6 space-y-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-xl sm:text-2xl font-bold text-ink-900 text-balance">{{ order.serviceName }}</h1>
            <p class="text-sm text-ink-500 font-num mt-1">{{ order.code }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <FhStatusPill :status="order.status" />
            <FhStatusPill
              v-if="order.status !== 'CANCELLED'"
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
            <dt class="text-ink-500">Mô tả</dt>
            <dd class="text-ink-900 text-pretty">{{ problemText }}</dd>
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
              v-if="(order.status === 'EN_ROUTE' || order.status === 'en_route') && !order.arrivalVerified"
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
            Trả qua ví, VNPay hoặc tiền mặt cho kỹ thuật viên. Chưa hài lòng thì gửi khiếu nại ở cuối trang.
          </p>
        </div>
        <div class="flex items-center gap-4 shrink-0">
          <span class="whitespace-nowrap"><FhMoney :amount="order.grandTotal" emphasis /></span>
          <FhButton v-if="invoice?.id" variant="primary" size="md" :disabled="actionLoading" @click="handlePay">
            Thanh toán ngay
          </FhButton>
        </div>
      </section>

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
            :disabled="actionLoading || confirmCashAmount === ''"
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
      <section class="order-3 rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4">
        <h2 class="text-lg font-semibold text-ink-900">Tiến trình</h2>
        <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
        <p v-else class="text-sm text-ink-500">Chưa có cập nhật.</p>
      </section>

      <!-- 5. Photos from the technician -->
      <section class="order-3 rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold text-ink-900">Ảnh sửa chữa</h2>
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
              class="h-8 px-3 rounded-full text-sm font-medium transition-colors shrink-0 whitespace-nowrap"
              :class="evidenceFilter === tab.key ? 'bg-brand-600 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'"
              @click="evidenceFilter = (tab.key as 'ALL' | 'BEFORE' | 'AFTER' | 'ADDITIONAL')"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <p v-if="filteredEvidences.length === 0" class="text-sm text-ink-500 text-pretty">
          <template v-if="order.status === 'EN_ROUTE' || order.status === 'ACCEPTED'">Kỹ thuật viên sẽ chụp ảnh khi tới nơi.</template>
          <template v-else-if="order.status === 'UNDER_REPAIR'">Kỹ thuật viên sẽ chụp ảnh sau khi sửa xong.</template>
          <template v-else>Chưa có ảnh.</template>
        </p>

        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            v-for="ev in filteredEvidences"
            :key="ev.id"
            type="button"
            class="text-left rounded-xl border border-ink-200 bg-white overflow-hidden hover:border-ink-300 transition-colors flex flex-col"
            :aria-label="`Phóng to ảnh ${evidenceTypeLabel(ev.type).toLowerCase()}`"
            @click="openLightbox(ev)"
          >
            <span class="relative block aspect-4/3 bg-ink-100 overflow-hidden">
              <img :src="ev.mediaUrl" :alt="ev.note || 'Ảnh sửa chữa'" class="w-full h-full object-cover" loading="lazy" />
              <span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap" :class="evidenceTypeClass(ev.type)">
                {{ evidenceTypeLabel(ev.type) }}
              </span>
            </span>
            <span class="block p-2.5 space-y-0.5">
              <span v-if="ev.note?.trim()" class="block text-sm text-ink-800 line-clamp-2">{{ ev.note }}</span>
              <span class="block text-xs text-ink-500 font-num whitespace-nowrap">{{ formatFullTimestamp(ev.capturedAt || ev.createdAt) }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- 6. Costs: one list, lines grouped, one total -->
      <section
        class="rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-5 text-sm"
        :class="canDecideQuotation ? 'order-1' : 'order-3'"
        data-testid="order-costs"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold text-ink-900">{{ canDecideQuotation ? 'Báo giá chờ bạn duyệt' : 'Chi phí' }}</h2>
          <span
            v-if="order.status !== 'CANCELLED' && !notQuotedYet"
            class="font-medium whitespace-nowrap"
            :class="isPaid ? 'text-success-700' : 'text-ink-500'"
          >
            {{ isPaid ? 'Đã thanh toán' : 'Chưa thanh toán' }}
          </span>
        </div>

        <p v-if="notQuotedYet" class="text-ink-600 text-pretty" data-testid="order-not-quoted">
          {{ order.status === 'CANCELLED' ? 'Đơn đã huỷ trước khi có báo giá.' : 'Kỹ thuật viên sẽ báo giá sau khi kiểm tra tại nhà.' }}
        </p>

        <template v-else>
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-3 text-ink-500">
            <h3 class="font-medium">Tiền công</h3>
            <span class="font-num whitespace-nowrap">Tổng công: <FhMoney :amount="shownLaborTotal" /></span>
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
                  {{ order.quantity || 1 }} × <FhMoney :amount="order.laborTotal" />
                  <template v-if="order.laborWarrantyDays"> · Bảo hành {{ order.laborWarrantyDays }}&nbsp;ngày</template>
                </span>
              </span>
              <span class="font-num font-medium text-ink-900 whitespace-nowrap"><FhMoney :amount="order.laborTotal" /></span>
            </li>
          </ul>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between gap-3 text-ink-500">
            <h3 class="font-medium">Linh kiện</h3>
            <span class="font-num whitespace-nowrap">Tổng linh kiện: <FhMoney :amount="shownPartsTotal" /></span>
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

        <div v-if="decidedAdditionalCosts.length > 0" class="space-y-1">
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

        </template>

        <div v-if="!notQuotedYet" class="pt-4 border-t border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-baseline gap-3">
            <span class="text-ink-500">Tổng cộng</span>
            <span class="whitespace-nowrap"><FhMoney :amount="order.grandTotal" emphasis /></span>
          </div>
          <div v-if="canDecideQuotation" class="flex items-center gap-2">
            <FhButton variant="secondary" size="md" :disabled="actionLoading" @click="handleRejectQuotation">
              Từ chối báo giá
            </FhButton>
            <FhButton variant="primary" size="md" :disabled="actionLoading" @click="handleApproveQuotation">
              Duyệt báo giá
            </FhButton>
          </div>
        </div>
      </section>

      <!-- 7. Warranty of this order -->
      <section
        v-if="isCompleted && orderWarranties.length > 0"
        class="order-3 rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4 text-sm"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold text-ink-900">Bảo hành</h2>
          <span
            class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
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

        <ul class="divide-y divide-ink-100">
          <li v-for="w in orderWarranties" :key="w.id" class="py-2.5 flex items-start justify-between gap-3">
            <span class="min-w-0">
              <span class="block font-medium text-ink-900">{{ w.note || 'Bảo hành dịch vụ' }}</span>
              <span class="block text-ink-500 font-num">
                {{ w.warrantyDaysSnapshot > 0 ? `${w.warrantyDaysSnapshot} ngày` : 'Theo chính sách' }} · hết hạn {{ formatDate(w.expiresAt) }}
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
      </section>

      <!-- 8. Complaint about this order (every status) -->
      <div class="order-3">
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
      :service-name="order.serviceName"
      :technician-name="order.technician?.fullName || 'Kỹ thuật viên FixHome'"
      :coverages="claimableCoverages"
      :busy-coverage-ids="busyCoverageIds"
      @close="showWarrantyClaimModal = false"
      @submitted="onWarrantyClaimSubmitted"
    />

    <!-- Tracking Modal -->
    <div
      v-if="showTrackingModal"
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
      <div role="dialog" aria-modal="true" aria-label="Thanh toán đơn" class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-ink-900">Thanh toán đơn</h3>
            <p class="whitespace-nowrap mt-1">
              <FhMoney :amount="order?.grandTotal ?? 0" emphasis />
            </p>
          </div>
          <button
            type="button"
            class="w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100 flex items-center justify-center shrink-0"
            aria-label="Đóng"
            @click="showPaymentModal = false"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="rounded-xl border border-ink-200 p-3 space-y-2.5" data-testid="wallet-pay-option">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium text-ink-800">Ví FixHome</span>
            <span class="text-ink-500 whitespace-nowrap flex items-center gap-1">
              Số dư:
              <strong v-if="walletBalance !== null" class="text-ink-900 font-num"><FhMoney :amount="walletBalance" /></strong>
              <span v-else class="inline-block w-20"><FhSkeleton height="14px" /></span>
            </span>
          </div>
          <FhButton
            variant="primary"
            size="md"
            class="w-full"
            :disabled="!walletCovers || walletPaying || actionLoading"
            :loading="walletPaying"
            data-testid="pay-with-wallet"
            @click="payWithWallet"
          >
            Trả bằng ví
          </FhButton>
          <p v-if="walletBalance !== null && !walletCovers" class="text-sm text-warning-800">
            Số dư không đủ. <router-link to="/app/wallet" class="font-semibold underline">Nạp thêm vào ví</router-link>
          </p>
        </div>

        <FhButton
          variant="secondary"
          size="md"
          class="w-full"
          :disabled="actionLoading || walletPaying"
          @click="confirmPayment"
        >
          Thanh toán qua VNPay
        </FhButton>
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
