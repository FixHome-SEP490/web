<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  MessageSquare,
  Star,
  CreditCard,
  Map as MapIcon,
  AlertTriangle,
  Truck,
  Clock,
  Camera,
  Maximize2,
  X,
  Wrench,
  Package,
  Info,
  Sparkles,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhCostBreakdown,
  FhMoney,
  FhTimeline,
  FhConfirmDialog,
  MapTilerMap,
  type MapMarker,
  type TimelineStep,
} from '../../components';
import { ordersApi, type ServiceOrderItem, type AdditionalCostRecord } from '../../api/orders.api';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { canDecideOfficialQuotation } from '../../utils/quotation-decision';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { useChatStore } from '../../stores/chat.store';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const orderId = route.params.id as string;

const loading = ref(true);
const actionLoading = ref(false);
const order = ref<ServiceOrderItem | null>(null);
const invoice = ref<{ id?: string; [key: string]: unknown } | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Modals
const showCancelModal = ref(false);
const showPaymentModal = ref(false);
const showWarrantyClaimModal = ref(false);
const showTrackingModal = ref(false);
const warrantyClaimDescription = ref('');
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
const activeWarrantyClaim = ref<{
  id: string;
  description: string;
  status: string;
  submittedAt?: string;
} | null>(null);

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
    return isNaN(d.getTime()) ? val : d.toLocaleDateString('vi-VN');
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
      : d.toLocaleString('vi-VN', {
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
const approvedAdditionalCosts = computed(() => {
  return additionalCosts.value.filter((c) => c.status === 'APPROVED');
});

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
const reviewRating = ref(0);
const reviewComment = ref('');
const reviewSubmitting = ref(false);

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
const timelineSteps = computed<TimelineStep[]>(() => {
  const entries = order.value?.timeline ?? [];
  return entries.map((entry, index) => ({
    key: `${entry.status}-${index}`,
    label: entry.title || entry.status,
    timestamp: entry.timestamp,
    actor: entry.actor,
    completed: index < entries.length - 1,
    current: index === entries.length - 1,
  }));
});

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
});

const loadOrder = async () => {
  try {
    loading.value = true;
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
        const claims = await ordersApi.getOrderWarrantyClaims(orderId);
        activeWarrantyClaim.value =
          claims.find((c) =>
            ['SUBMITTED', 'ACCEPTED', 'IN_PROGRESS', 'submitted', 'accepted', 'in_progress'].includes(c.status)
          ) || null;
      } catch {
        // Ignore
      }
    }
  } catch {
    actionMessage.value = { type: 'error', text: 'Không thể tải đơn hàng. Vui lòng thử lại.' };
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
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể duyệt báo giá.' };
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
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể từ chối báo giá.' };
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
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể xử lý chi phí phát sinh.' };
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
    } else {
      cashSettlement.value.status = 'disputed';
      actionMessage.value = {
        type: 'success',
        text: 'Số tiền bạn nhập không khớp với thợ khai báo — đã gửi FixHome đối soát.',
      };
    }
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể xử lý xác nhận tiền mặt.' };
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

const handlePay = () => {
  showPaymentModal.value = true;
};

const confirmPayment = async () => {
  try {
    actionLoading.value = true;
    if (!invoice.value?.id) throw new Error('Chưa có hóa đơn để thanh toán.');
    const paymentUrl = await ordersApi.createVnpayUrl(invoice.value.id);
    window.location.href = paymentUrl;
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể khởi tạo thanh toán VNPay.' };
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
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể huỷ đơn.' };
  } finally {
    actionLoading.value = false;
  }
};

const handleSubmitReview = async () => {
  if (reviewRating.value < 1) {
    actionMessage.value = { type: 'error', text: 'Vui lòng chọn số sao đánh giá.' };
    return;
  }
  try {
    reviewSubmitting.value = true;
    existingReview.value = await reviewsApi.createReview(orderId, {
      rating: reviewRating.value,
      comment: reviewComment.value.trim() || undefined,
    });
    showReviewModal.value = false;
    actionMessage.value = { type: 'success', text: 'Cảm ơn bạn đã đánh giá kỹ thuật viên!' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể gửi đánh giá.' };
  } finally {
    reviewSubmitting.value = false;
  }
};

const handleCreateWarrantyClaim = async () => {
  if (!warrantyClaimDescription.value.trim()) {
    actionMessage.value = { type: 'error', text: 'Vui lòng mô tả vấn đề cần bảo hành!' };
    return;
  }
  try {
    actionLoading.value = true;
    await ordersApi.createWarrantyClaim(orderId, warrantyClaimDescription.value);
    activeWarrantyClaim.value = {
      id: 'new',
      description: warrantyClaimDescription.value.trim(),
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
    };
    showWarrantyClaimModal.value = false;
    warrantyClaimDescription.value = '';
    actionMessage.value = {
      type: 'success',
      text: 'Đã gửi yêu cầu bảo hành điện tử thành công! Kỹ thuật viên sẽ liên hệ lại.',
    };
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể gửi yêu cầu bảo hành.' };
  } finally {
    actionLoading.value = false;
  }
};
const confirmWork = async () => {
  actionLoading.value = true;
  try {
    await ordersApi.confirmCompletion(orderId);
    await loadOrder();
    actionMessage.value = { type: 'success', text: 'Đã xác nhận nghiệm thu. Đơn hoàn tất khi thanh toán được xác nhận.' };
  } catch {
    actionMessage.value = { type: 'error', text: 'Chưa thể xác nhận nghiệm thu. Vui lòng thử lại.' };
  } finally { actionLoading.value = false; }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <!-- Breadcrumb & Back Button -->
    <div class="flex items-center justify-between">
      <button
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors"
        @click="router.push('/app/orders')"
      >
        <ArrowLeft :size="14" /> Quay lại danh sách đơn
      </button>

      <div class="flex items-center gap-2">
        <FhButton
          v-if="order && order.status === 'COMPLETED' && !existingReview"
          variant="secondary"
          size="sm"
          @click="showReviewModal = true"
        >
          <Star :size="14" class="mr-1 text-amber-500" />
          Đánh giá thợ
        </FhButton>
        <span
          v-else-if="order && order.status === 'COMPLETED' && existingReview"
          class="inline-flex items-center gap-1 text-xs font-semibold text-ink-600"
        >
          <Star :size="14" class="text-amber-400 fill-amber-400" /> Bạn đã đánh giá {{ existingReview.rating }}/5
        </span>

        <FhButton
          v-if="order && order.status === 'COMPLETED' && order.paymentStatus === 'PAID'"
          variant="secondary"
          size="sm"
          @click="showWarrantyClaimModal = true"
        >
          <ShieldCheck :size="14" class="mr-1 text-brand-600" />
          Yêu cầu bảo hành
        </FhButton>

        <FhButton
          v-if="order && order.status === 'ACCEPTED'"
          variant="secondary"
          size="sm"
          @click="router.push(`/app/bookings/${order!.bookingId}`)"
        >
          Đổi lịch / thông tin
        </FhButton>

        <FhButton
          v-if="order && order.status !== 'COMPLETED' && order.status !== 'CANCELLED'"
          variant="danger"
          size="sm"
          @click="showCancelModal = true"
        >
          Huỷ đơn
        </FhButton>
      </div>
    </div>

    <!-- Alert / Action Banner -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
      <AlertCircle v-else :size="16" class="text-danger-600 shrink-0" />
      <span>{{ actionMessage.text }}</span>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải chi tiết đơn hàng...
    </div>

    <div v-else-if="order" class="space-y-6">
      <!-- Order Header Card -->
      <FhCard>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
            <div>
              <div class="text-[11px] text-ink-400 font-mono">MÃ ĐƠN HÀNG:</div>
              <h1 class="text-xl font-bold font-mono text-ink-900">{{ order.code }}</h1>
            </div>

            <div class="flex items-center gap-3">
              <FhStatusPill :status="order.status" />
              <FhStatusPill
                :status="order.paymentStatus === 'PAID' || order.paymentStatus === 'paid' ? 'COMPLETED' : 'PENDING'"
                :label="order.paymentStatus === 'PAID' || order.paymentStatus === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div class="space-y-2">
              <div class="font-bold text-sm text-ink-900">{{ order.serviceName }}</div>
              <div class="text-ink-600 flex items-center gap-1.5">
                <MapPin :size="14" class="text-brand-600 shrink-0" />
                {{ order.addressSummary }}
              </div>
              <div class="text-ink-500 flex items-center gap-1.5">
                <Calendar :size="14" />
                Hẹn lúc: {{ new Date(order.scheduledAt).toLocaleString('vi-VN') }}
              </div>
            </div>

            <!-- Technician Box (Style Mobile) -->
            <div v-if="order.technician" class="p-4 rounded-2xl bg-brand-50/60 border border-brand-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-brand-700 text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-xs border-2 border-white">
                  {{ order.technician.fullName.charAt(0) }}
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <div class="font-bold text-ink-900 text-sm">{{ order.technician.fullName }}</div>
                    <span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      ✓ Đã xác minh
                    </span>
                  </div>
                  <div class="text-xs text-amber-600 flex items-center gap-1 font-semibold mt-0.5">
                    <span>★ {{ order.technician.averageRating || '5.0' }}</span>
                    <span class="text-ink-400 font-normal">• Kỹ thuật viên chính</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 self-end sm:self-center">
                <button
                  v-if="(order.status === 'EN_ROUTE' || order.status === 'en_route') && !order.arrivalVerified"
                  type="button"
                  class="p-2 rounded-xl bg-white border border-ink-200 text-brand-700 hover:bg-brand-50 transition-colors shadow-xs"
                  title="Xem vị trí thợ trên bản đồ"
                  @click="showTrackingModal = true"
                >
                  <MapIcon :size="16" />
                </button>
                <button
                  type="button"
                  class="px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors flex items-center gap-1.5 shadow-xs"
                  @click="handleChatWithTech"
                >
                  <MessageSquare :size="14" />
                  <span>Nhắn tin</span>
                </button>
                <a
                  v-if="order.technician.phoneNumber"
                  :href="`tel:${order.technician.phoneNumber}`"
                  class="p-2 rounded-xl bg-white border border-ink-200 text-brand-700 hover:bg-brand-50 transition-colors shadow-xs"
                  title="Gọi thợ"
                >
                  <Phone :size="16" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Step 1: Khách hàng Nghiệm thu dịch vụ (Khi thợ đã gửi yêu cầu nghiệm thu) -->
      <FhCard
        v-if="order?.completionRequestedAt && !order.customerConfirmed && order.status === 'UNDER_REPAIR'"
        class="border-2 border-brand-500 bg-brand-50/50 shadow-sm"
      >
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-brand-900 font-bold text-sm">
              <ShieldCheck :size="20" class="text-brand-600 shrink-0" />
              <span>Kỹ thuật viên đã hoàn thành công việc & Đề nghị Nghiệm thu</span>
            </div>
            <span class="text-[11px] font-semibold text-brand-700 bg-brand-100 px-2.5 py-0.5 rounded-full">
              Bước 1: Nghiệm thu
            </span>
          </div>

          <p class="text-xs text-ink-700 leading-relaxed">
            Kỹ thuật viên đã xử lý xong và tải ảnh bằng chứng hoàn tất. Vui lòng trực tiếp kiểm tra vận hành của thiết bị / hiện trường. Khi bạn đã hài lòng với chất lượng công việc, hãy bấm <strong>"Xác nhận nghiệm thu dịch vụ"</strong> để chuyển sang bước thanh toán.
          </p>

          <div class="pt-1 flex items-center justify-end">
            <FhButton
              variant="primary"
              size="md"
              :disabled="actionLoading"
              @click="confirmWork"
            >
              <CheckCircle2 :size="16" class="mr-1.5" />
              Xác nhận nghiệm thu dịch vụ (Nghiệm thu OK)
            </FhButton>
          </div>
        </div>
      </FhCard>

      <!-- Step 2: Khách hàng Thanh toán sau khi đã nghiệm thu -->
      <FhCard
        v-if="order?.customerConfirmed && (order.paymentStatus === 'UNPAID' || order.paymentStatus === 'unpaid') && order.status === 'UNDER_REPAIR'"
        class="border-2 border-success-500 bg-success-50/50 shadow-sm"
      >
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-success-900 font-bold text-sm">
              <CheckCircle2 :size="20" class="text-success-600 shrink-0" />
              <span>Nghiệm thu dịch vụ ĐÃ ĐẠT! Vui lòng tiến hành thanh toán</span>
            </div>
            <span class="text-[11px] font-semibold text-success-700 bg-success-100 px-2.5 py-0.5 rounded-full">
              Bước 2: Thanh toán
            </span>
          </div>

          <p class="text-xs text-ink-700 leading-relaxed">
            Bạn đã xác nhận nghiệm thu dịch vụ thành công. Tổng số tiền cần thanh toán là <strong class="text-ink-900 font-num"><FhMoney :amount="order.grandTotal" /></strong>. Bạn có thể thanh toán trực tuyến qua VNPAY / Ví điện tử hoặc trả tiền mặt trực tiếp cho thợ.
          </p>

          <div class="pt-1 flex items-center justify-end gap-3">
            <FhButton
              v-if="invoice?.id"
              variant="primary"
              size="md"
              :disabled="actionLoading"
              @click="handlePay"
            >
              <CreditCard :size="16" class="mr-1.5" />
              Thanh toán Online ngay (<FhMoney :amount="order.grandTotal" />)
            </FhButton>
          </div>
        </div>
      </FhCard>

      <!-- Spec v1.2: Cash Dual-Confirmation Alert Card -->
      <FhCard
        v-if="cashSettlement && cashSettlement.status === 'pending_confirmation'"
        class="border-2 border-brand-500 bg-brand-50/40"
      >
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-brand-900 font-bold text-sm">
            <DollarSign :size="18" class="text-brand-600" />
            <span>Xác nhận Thanh toán Tiền mặt (Dual-Confirmation)</span>
          </div>

          <p class="text-xs text-ink-700">
            Kỹ thuật viên đã khai báo đã thu số tiền mặt là:
            <strong class="text-brand-800 text-sm font-num"><FhMoney :amount="cashSettlement.declaredAmount" /></strong>
            {{ cashSettlement.technicianNotes ? `(Ghi chú: ${cashSettlement.technicianNotes})` : '' }}
          </p>

          <div>
            <label class="block font-semibold text-ink-700 mb-1 text-xs">Số tiền bạn đã thực trả (VNĐ)</label>
            <input
              v-model.number="confirmCashAmount"
              type="number" min="0" step="1000"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num"
            />
          </div>

          <div v-if="confirmCashAmount !== '' && Number(confirmCashAmount) !== cashSettlement.declaredAmount">
            <label class="block font-semibold text-ink-700 mb-1 text-xs">Ghi chú (vì số tiền không khớp)</label>
            <textarea
              v-model="cashMismatchNote"
              rows="2"
              placeholder="Ví dụ: thợ báo 300k nhưng thực tế tôi chỉ đưa 250k"
              class="w-full p-2.5 bg-white border border-ink-200 rounded text-xs"
            ></textarea>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <FhButton
              variant="primary"
              size="sm"
              :disabled="actionLoading || confirmCashAmount === ''"
              @click="handleConfirmCashPayment"
            >
              <CheckCircle2 :size="14" class="mr-1.5" />
              Xác nhận số tiền &amp; thanh toán
            </FhButton>
          </div>
        </div>
      </FhCard>

      <!-- Status Timeline (FhTimeline) -->
      <FhCard title="Tiến trình thực hiện (theo dữ liệu Backend)">
        <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
        <p v-else class="text-xs text-ink-400 italic">
          Backend không trả về mục lịch sử nào cho đơn này.
        </p>
      </FhCard>

      <!-- Visual Repair Evidence (Ảnh trước và sau khi làm + Ghi chú của thợ) -->
      <FhCard>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
              <Camera :size="18" class="text-brand-600" />
              <span class="font-bold text-sm text-ink-900">Bằng chứng hình ảnh thi công (Trước &amp; Sau khi sửa chữa)</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                {{ evidences.length }} ảnh hiện trường
              </span>
            </div>
          </div>
        </template>

        <div class="space-y-4 text-xs">
          <!-- Filter Tabs -->
          <div class="flex items-center gap-2 border-b border-ink-100 pb-2 overflow-x-auto">
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0"
              :class="evidenceFilter === 'ALL' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'"
              @click="evidenceFilter = 'ALL'"
            >
              Tất cả ảnh ({{ evidences.length }})
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 flex items-center gap-1"
              :class="evidenceFilter === 'BEFORE' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'"
              @click="evidenceFilter = 'BEFORE'"
            >
              <span>Trước khi làm</span>
              <span class="text-[10px] px-1 py-0.2 rounded-full" :class="evidenceFilter === 'BEFORE' ? 'bg-white/20' : 'bg-blue-200'">{{ beforeEvidences.length }}</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 flex items-center gap-1"
              :class="evidenceFilter === 'AFTER' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'"
              @click="evidenceFilter = 'AFTER'"
            >
              <span>Sau khi hoàn thành</span>
              <span class="text-[10px] px-1 py-0.2 rounded-full" :class="evidenceFilter === 'AFTER' ? 'bg-white/20' : 'bg-emerald-200'">{{ afterEvidences.length }}</span>
            </button>
            <button
              v-if="additionalEvidences.length > 0"
              type="button"
              class="px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 flex items-center gap-1"
              :class="evidenceFilter === 'ADDITIONAL' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'"
              @click="evidenceFilter = 'ADDITIONAL'"
            >
              <span>Phát sinh</span>
              <span class="text-[10px] px-1 py-0.2 rounded-full" :class="evidenceFilter === 'ADDITIONAL' ? 'bg-white/20' : 'bg-amber-200'">{{ additionalEvidences.length }}</span>
            </button>
          </div>

          <!-- Empty State -->
          <div v-if="filteredEvidences.length === 0" class="py-8 text-center bg-ink-50 rounded-xl p-4 text-ink-500">
            <Camera :size="28" class="text-ink-300 mx-auto mb-2" />
            <p class="font-semibold text-ink-700">
              <template v-if="evidenceFilter === 'BEFORE'">Chưa có ảnh trước khi sửa chữa</template>
              <template v-else-if="evidenceFilter === 'AFTER'">Chưa có ảnh sau khi hoàn thành</template>
              <template v-else>Chưa có ảnh bằng chứng nào được tải lên</template>
            </p>
            <p class="text-[11px] text-ink-400 mt-1 max-w-md mx-auto">
              <template v-if="order.status === 'EN_ROUTE' || order.status === 'ACCEPTED'">
                Kỹ thuật viên sẽ chụp và tải ảnh hiện trường ban đầu ngay khi có mặt tại địa chỉ của bạn.
              </template>
              <template v-else-if="order.status === 'UNDER_REPAIR'">
                Kỹ thuật viên đang trong quá trình xử lý và sẽ chụp ảnh nghiệm thu hoàn tất khi xong việc.
              </template>
              <template v-else>
                Đơn hàng không có ảnh lưu trữ cho giai đoạn này.
              </template>
            </p>
          </div>

          <!-- Grid View -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="ev in filteredEvidences"
              :key="ev.id"
              class="rounded-xl border border-ink-200 bg-white overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col group cursor-pointer"
              @click="openLightbox(ev)"
            >
              <!-- Image Container -->
              <div class="relative aspect-4/3 bg-ink-100 overflow-hidden">
                <img
                  :src="ev.mediaUrl"
                  :alt="ev.note || 'Ảnh bằng chứng'"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />

                <!-- Phase Badge -->
                <div class="absolute top-2.5 left-2.5">
                  <span
                    v-if="ev.type?.toLowerCase() === 'before'"
                    class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-600 text-white shadow-xs"
                  >
                    Trước khi làm
                  </span>
                  <span
                    v-else-if="ev.type?.toLowerCase() === 'after'"
                    class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-600 text-white shadow-xs"
                  >
                    Sau khi sửa
                  </span>
                  <span
                    v-else
                    class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-600 text-white shadow-xs"
                  >
                    Phát sinh
                  </span>
                </div>

                <!-- Hover Zoom Overlay -->
                <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 font-semibold text-xs backdrop-blur-xs">
                  <Maximize2 :size="16" />
                  <span>Bấm để phóng to</span>
                </div>
              </div>

              <!-- Note & Metadata -->
              <div class="p-3 flex-1 flex flex-col justify-between space-y-2 bg-white">
                <!-- Technician Note -->
                <div>
                  <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-0.5 flex items-center gap-1">
                    <MessageSquare :size="11" />
                    <span>Ghi chú của thợ:</span>
                  </div>
                  <p v-if="ev.note?.trim()" class="text-xs text-ink-800 italic bg-ink-50 p-2 rounded-lg border border-ink-100">
                    "{{ ev.note }}"
                  </p>
                  <p v-else class="text-xs text-ink-400 italic">
                    (Không có ghi chú thêm)
                  </p>
                </div>

                <!-- Timestamp -->
                <div class="flex items-center justify-between text-[11px] text-ink-400 pt-1 border-t border-ink-100">
                  <span class="flex items-center gap-1">
                    <Clock :size="12" />
                    {{ formatFullTimestamp(ev.capturedAt || ev.createdAt) }}
                  </span>
                  <span class="text-brand-600 font-medium group-hover:underline">Phóng to</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Comprehensive Repair Breakdown (Liệt kê đơn sửa những gì) -->
      <FhCard>
        <template #header>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
              <Wrench :size="18" class="text-brand-600" />
              <span class="font-bold text-sm text-ink-900">Chi tiết các hạng mục sửa chữa &amp; Linh kiện thay thế</span>
            </div>
            <span class="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
              Minh bạch 100%
            </span>
          </div>
        </template>

        <div class="space-y-5 text-xs">
          <!-- 1. General Problem & Initial Diagnosis -->
          <div class="p-3.5 rounded-xl bg-ink-50 border border-ink-200 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-xs text-ink-900 flex items-center gap-1.5">
                <Info :size="14" class="text-brand-600" />
                Vấn đề &amp; Hiện trạng thiết bị ban đầu:
              </span>
              <span class="text-[11px] font-semibold text-ink-500 font-mono">Dịch vụ: {{ order.serviceName }}</span>
            </div>
            <p class="text-ink-700 leading-relaxed bg-white p-2.5 rounded-lg border border-ink-100">
              {{ order.scopeDescription || bookingDetails?.description || 'Kiểm tra, chẩn đoán sự cố và tiến hành khắc phục kỹ thuật tại nhà.' }}
            </p>
            <div v-if="bookingDetails?.diagnosis?.possibleIssues?.length" class="flex items-center gap-1.5 flex-wrap pt-1">
              <span class="text-[10px] font-semibold text-ink-400">Chẩn đoán gợi ý:</span>
              <span
                v-for="issue in bookingDetails.diagnosis.possibleIssues"
                :key="issue"
                class="px-2 py-0.5 rounded-md bg-white border border-ink-200 text-ink-700 text-[10px] font-medium"
              >
                {{ issue }}
              </span>
            </div>
          </div>

          <!-- 2. Labor Breakdown Table (Tiền công thợ thực hiện) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-xs text-ink-900 flex items-center gap-1.5">
                <Wrench :size="14" class="text-brand-600" />
                1. Công việc kỹ thuật &amp; Tiền công (Labor):
              </h4>
              <span class="font-bold font-num text-brand-700">
                Tổng công: <FhMoney :amount="order.laborTotal" />
              </span>
            </div>

            <div class="border border-ink-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <table class="w-full text-left">
                <thead class="bg-ink-50 text-ink-500 font-semibold border-b border-ink-200 text-[11px]">
                  <tr>
                    <th class="p-2.5">Hạng mục công việc kỹ thuật</th>
                    <th class="p-2.5 text-center">SL</th>
                    <th class="p-2.5 text-right">Đơn giá</th>
                    <th class="p-2.5 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  <template v-if="laborItems.length > 0">
                    <tr v-for="item in laborItems" :key="item.description" class="hover:bg-ink-50/50">
                      <td class="p-2.5 font-medium text-ink-900">
                        {{ item.description }}
                      </td>
                      <td class="p-2.5 text-center font-num">{{ item.quantity }}</td>
                      <td class="p-2.5 text-right font-num text-ink-600"><FhMoney :amount="item.unitPrice" /></td>
                      <td class="p-2.5 text-right font-num font-bold text-ink-900"><FhMoney :amount="item.lineTotal" /></td>
                    </tr>
                  </template>
                  <tr v-else>
                    <td class="p-2.5 font-medium text-ink-900">
                      {{ order.serviceName }} (Gói kỹ thuật trọn gói)
                    </td>
                    <td class="p-2.5 text-center font-num">{{ order.quantity || 1 }}</td>
                    <td class="p-2.5 text-right font-num text-ink-600"><FhMoney :amount="order.laborTotal" /></td>
                    <td class="p-2.5 text-right font-num font-bold text-ink-900"><FhMoney :amount="order.laborTotal" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 3. Replaced Parts & Equipment Breakdown Table (Linh kiện phụ tùng thay thế) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-xs text-ink-900 flex items-center gap-1.5">
                <Package :size="14" class="text-brand-600" />
                2. Linh kiện &amp; Phụ tùng thay thế (Parts &amp; Equipment):
              </h4>
              <span class="font-bold font-num text-brand-700">
                Tổng phụ tùng: <FhMoney :amount="order.partsTotal" />
              </span>
            </div>

            <div class="border border-ink-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <table class="w-full text-left">
                <thead class="bg-ink-50 text-ink-500 font-semibold border-b border-ink-200 text-[11px]">
                  <tr>
                    <th class="p-2.5">Tên linh kiện / Phụ tùng</th>
                    <th class="p-2.5 text-center">Bảo hành</th>
                    <th class="p-2.5 text-center">SL</th>
                    <th class="p-2.5 text-right">Đơn giá</th>
                    <th class="p-2.5 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  <template v-if="partsItems.length > 0">
                    <tr v-for="item in partsItems" :key="item.description" class="hover:bg-ink-50/50">
                      <td class="p-2.5 font-medium text-ink-900">
                        {{ item.description }}
                      </td>
                      <td class="p-2.5 text-center">
                        <span v-if="item.warrantyDays" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-50 text-success-700 border border-success-200">
                          <ShieldCheck :size="11" /> {{ item.warrantyDays }} ngày
                        </span>
                        <span v-else class="text-ink-400 text-[10px]">Theo tiêu chuẩn</span>
                      </td>
                      <td class="p-2.5 text-center font-num">{{ item.quantity }}</td>
                      <td class="p-2.5 text-right font-num text-ink-600"><FhMoney :amount="item.unitPrice" /></td>
                      <td class="p-2.5 text-right font-num font-bold text-ink-900"><FhMoney :amount="item.lineTotal" /></td>
                    </tr>
                  </template>
                  <tr v-else>
                    <td colspan="5" class="p-3 text-center text-ink-400 italic">
                      Đơn hàng này không sử dụng hoặc không phát sinh linh kiện thay thế mới.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4. Approved Additional Costs (if any) -->
          <div v-if="approvedAdditionalCosts.length > 0" class="space-y-2">
            <h4 class="font-bold text-xs text-ink-900 flex items-center gap-1.5">
              <Sparkles :size="14" class="text-amber-600" />
              3. Hạng mục phát sinh đã được bạn đồng ý (Approved Additions):
            </h4>
            <div class="border border-amber-200 rounded-xl bg-amber-50/40 p-3 space-y-2">
              <div v-for="cost in approvedAdditionalCosts" :key="cost.id" class="text-xs">
                <div class="flex items-center justify-between font-medium">
                  <span class="text-ink-800">Lý do phát sinh: "{{ cost.reason }}"</span>
                  <span class="font-bold font-num text-amber-900">
                    +<FhMoney :amount="Number(cost.totalLaborDelta) + Number(cost.totalPartsDelta) + Number(cost.shippingFee || 0)" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Grand Summary Box -->
          <div class="p-4 rounded-xl bg-gradient-to-r from-ink-900 to-ink-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div class="space-y-1">
              <div class="text-[11px] text-ink-300 uppercase tracking-wider font-semibold">TỔNG KẾT THANH TOÁN ĐƠN SỬA CHỮA:</div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-black font-num text-white">
                  <FhMoney :amount="order.grandTotal" />
                </span>
                <span class="text-xs text-ink-300">
                  (Công: <FhMoney :amount="order.laborTotal" /> + Linh kiện: <FhMoney :amount="order.partsTotal" />)
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 self-start sm:self-center">
              <div class="text-right">
                <div class="text-[10px] text-ink-300">Trạng thái thanh toán:</div>
                <div class="text-xs font-bold" :class="order.paymentStatus === 'PAID' || order.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-amber-300'">
                  {{ order.paymentStatus === 'PAID' || order.paymentStatus === 'paid' ? '✓ ĐÃ THANH TOÁN' : '⏳ CHƯA THANH TOÁN' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Quotation & D-02 Cost Breakdown Card -->
      <FhCard title="Báo giá chi tiết & Linh kiện thay thế (D-02 Standard)">
        <template #action>
          <span class="text-xs font-semibold text-brand-700">Tách riêng Công & Phụ tùng</span>
        </template>

        <div class="space-y-4 text-xs">
          <!-- Ratio Bar -->
          <FhCostBreakdown
            :labor-total="order.laborTotal"
            :parts-total="order.partsTotal"
          />

          <!-- Items Table -->
          <div class="border border-ink-200 rounded-[var(--radius-sm)] overflow-hidden">
            <table class="w-full text-left">
              <thead class="bg-ink-50 text-ink-500 font-semibold border-b border-ink-200 text-[11px]">
                <tr>
                  <th class="p-2.5">Khoản mục</th>
                  <th class="p-2.5">Loại</th>
                  <th class="p-2.5 text-center">SL</th>
                  <th class="p-2.5 text-right">Đơn giá</th>
                  <th class="p-2.5 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <tr
                  v-for="item in order.quotation?.items ?? []"
                  :key="item.description"
                  class="hover:bg-ink-50/50"
                >
                  <td class="p-2.5 font-medium text-ink-900">
                    {{ item.description }}
                    <span v-if="item.warrantyDays" class="block text-[10px] text-success-600 font-semibold">
                      ✓ Bảo hành {{ item.warrantyDays }} ngày
                    </span>
                  </td>
                  <td class="p-2.5">
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      :class="item.type === 'LABOR' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700'"
                    >
                      {{ item.type === 'LABOR' ? 'Tiền công' : 'Linh kiện' }}
                    </span>
                  </td>
                  <td class="p-2.5 text-center font-num">{{ item.quantity }}</td>
                  <td class="p-2.5 text-right font-num text-ink-600">
                    <FhMoney :amount="item.unitPrice" />
                  </td>
                  <td class="p-2.5 text-right font-num font-bold text-ink-900">
                    <FhMoney :amount="item.lineTotal" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Total Footer -->
          <div class="flex items-center justify-between pt-3 border-t border-ink-100">
            <div>
              <span class="text-xs text-ink-500">Tổng chi phí thanh toán:</span>
              <div class="text-xl font-bold font-num text-brand-700">
                <FhMoney :amount="order.grandTotal" />
              </div>
            </div>

            <div class="flex items-center gap-3">
              <template v-if="canDecideQuotation">
                <FhButton
                  variant="secondary"
                  size="md"
                  :disabled="actionLoading"
                  @click="handleRejectQuotation"
                >
                  Từ chối
                </FhButton>
                <FhButton
                  variant="primary"
                  size="md"
                  :disabled="actionLoading"
                  @click="handleApproveQuotation"
                >
                  <CheckCircle2 :size="16" class="mr-1.5" /> Duyệt báo giá này
                </FhButton>
              </template>

              <span
                v-else-if="invoice?.id && (order.paymentStatus === 'UNPAID' || order.paymentStatus === 'unpaid') && !order.customerConfirmed"
                class="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 font-medium"
              >
                Cần xác nhận nghiệm thu trước khi thanh toán
              </span>
              <span
                v-else-if="invoice?.id && (order.paymentStatus === 'UNPAID' || order.paymentStatus === 'unpaid') && order.customerConfirmed"
                class="text-xs text-success-700 bg-success-50 px-2.5 py-1 rounded border border-success-200 font-medium"
              >
                Xem nút "Thanh toán Online" ở bước Thanh toán bên trên
              </span>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Chi phí phát sinh (Additional Cost) -->
      <FhCard v-if="additionalCosts.length > 0" title="Chi phí phát sinh ngoài phạm vi ban đầu">
        <div class="space-y-3 text-xs">
          <div v-for="cost in additionalCosts" :key="cost.id" class="p-3 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 space-y-2.5">
            <div class="flex items-center justify-between">
              <FhStatusPill
                :status="cost.status"
                :label="{PENDING_APPROVAL:'Chờ bạn duyệt',APPROVED:'Đã duyệt',REJECTED:'Đã từ chối',EXPIRED:'Hết hạn chờ duyệt',CANCELLED:'Đã huỷ'}[cost.status]"
              />
              <span class="font-num font-bold text-ink-900 text-sm">
                <FhMoney :amount="Number(cost.totalLaborDelta) + Number(cost.totalPartsDelta) + Number(cost.shippingFee || 0)" />
              </span>
            </div>
            <p class="text-ink-600 italic">"{{ cost.reason }}"</p>
            <div v-if="cost.evidenceUrls?.length" class="flex gap-2">
              <img v-for="url in cost.evidenceUrls" :key="url" :src="url" class="w-14 h-14 rounded object-cover border border-ink-200" />
            </div>

            <!-- Items breakdown -->
            <ul class="text-ink-600 space-y-1 bg-white p-2 rounded border border-ink-200">
              <li v-for="item in cost.items" :key="item.id" class="flex items-center justify-between text-xs py-0.5">
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="item.partSource === 'external'"
                    class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 uppercase"
                  >
                    LK Ngoài
                  </span>
                  <span
                    v-else-if="item.partSource === 'fixhome'"
                    class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 uppercase"
                  >
                    LK FixHome
                  </span>
                  <span>{{ item.description }} ({{ item.quantity }} x <FhMoney :amount="item.unitPrice" />)</span>
                </div>
                <span class="font-num font-semibold text-ink-800"><FhMoney :amount="item.lineTotal" /></span>
              </li>

              <!-- Shipping fee if any -->
              <li v-if="Number(cost.shippingFee) > 0" class="flex items-center justify-between text-xs pt-1 border-t border-ink-100 text-purple-700 font-medium">
                <span class="flex items-center gap-1">
                  <Truck :size="12" /> Phí giao linh kiện tận nơi:
                </span>
                <span class="font-num font-bold"><FhMoney :amount="cost.shippingFee" /></span>
              </li>
            </ul>

            <!-- External Parts Warning & Checkbox (Flow 2 requirement) -->
            <div
              v-if="hasExternalParts(cost)"
              class="p-2.5 rounded bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1.5"
            >
              <div class="flex items-start gap-1.5 font-bold text-amber-900">
                <AlertTriangle :size="15" class="text-amber-600 shrink-0 mt-0.5" />
                <span>Lưu ý về linh kiện ngoài (EXTERNAL):</span>
              </div>
              <p class="text-[11px] text-amber-800 leading-relaxed">
                Yêu cầu này có chứa linh kiện mua ngoài. <strong>Linh kiện này không được cung cấp bởi FixHome và không thuộc chính sách bảo hành của FixHome</strong>.
              </p>
              <label
                v-if="cost.status === 'PENDING_APPROVAL'"
                class="flex items-start gap-2 pt-1 cursor-pointer select-none border-t border-amber-200/80 mt-1"
              >
                <input
                  type="checkbox"
                  v-model="externalDisclaimerAccepted[cost.id]"
                  class="mt-0.5 h-3.5 w-3.5 text-brand-600 rounded border-amber-400 focus:ring-amber-500"
                />
                <span class="text-[11px] font-medium text-amber-950">
                  Tôi đã hiểu và chấp nhận rủi ro đối với linh kiện ngoài không có bảo hành từ FixHome.
                </span>
              </label>
            </div>

            <!-- Decision buttons -->
            <div v-if="cost.status === 'PENDING_APPROVAL'" class="flex items-center gap-2 pt-1">
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
                :title="hasExternalParts(cost) && !externalDisclaimerAccepted[cost.id] ? 'Vui lòng tích vào ô xác nhận trước khi đồng ý' : ''"
                @click="handleDecideAdditionalCost(cost, 'APPROVE')"
              >
                <CheckCircle2 :size="14" class="mr-1" /> Đồng ý chi phí phát sinh
              </FhButton>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Bảo hành Điện tử của Đơn hàng (Spec v1.2 / Warranty) -->
      <FhCard v-if="order.status === 'COMPLETED' && orderWarranties.length > 0">
        <template #title>
          <div class="flex items-center gap-2">
            <ShieldCheck class="text-emerald-600" :size="20" />
            <span>Bảo hành Điện tử của Đơn hàng</span>
          </div>
        </template>
        <template #action>
          <span
            class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
            :class="
              activeWarrantyClaim
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : isOrderWarrantyActive
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-gray-100 text-gray-600 border border-gray-300'
            "
          >
            {{
              activeWarrantyClaim
                ? 'ĐANG XỬ LÝ BẢO HÀNH'
                : isOrderWarrantyActive
                ? 'BẢO HÀNH CÒN HIỆU LỰC'
                : 'BẢO HÀNH ĐÃ HẾT HẠN'
            }}
          </span>
        </template>

        <div class="space-y-4 text-xs">
          <!-- Summary banner -->
          <div class="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-bold text-emerald-950 flex items-center gap-1.5">
                <ShieldCheck :size="15" class="text-emerald-600 shrink-0" />
                Chính sách bảo hành điện tử chính hãng FixHome
              </p>
              <p class="text-[11px] text-emerald-800 mt-0.5">
                100% miễn phí công thợ khi bảo hành sự cố tái phát trong thời hạn bảo hành.
              </p>
            </div>
            <div class="text-right">
              <span class="text-[11px] text-ink-500 block">Hạn bảo hành tối đa:</span>
              <span class="font-bold text-emerald-900 font-num text-sm">
                {{ formatDate(maxWarrantyExpiresAt) }}
              </span>
            </div>
          </div>

          <!-- Items Table -->
          <div class="border border-ink-200 rounded-lg overflow-hidden bg-white">
            <table class="w-full text-left text-xs">
              <thead class="bg-ink-50 text-ink-600 font-semibold border-b border-ink-100">
                <tr>
                  <th class="p-2.5">Hạng mục bảo hành</th>
                  <th class="p-2.5 text-center">Thời hạn</th>
                  <th class="p-2.5 text-center">Ngày hết hạn</th>
                  <th class="p-2.5 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <tr v-for="w in orderWarranties" :key="w.id" class="hover:bg-ink-50/50">
                  <td class="p-2.5 font-medium text-ink-900">
                    {{ w.note || 'Bảo hành dịch vụ' }}
                  </td>
                  <td class="p-2.5 text-center text-ink-600 font-num">
                    {{ w.warrantyDaysSnapshot > 0 ? `${w.warrantyDaysSnapshot} ngày` : 'Theo chính sách' }}
                  </td>
                  <td class="p-2.5 text-center font-num text-ink-700">
                    {{ formatDate(w.expiresAt) }}
                  </td>
                  <td class="p-2.5 text-right">
                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      :class="new Date(w.expiresAt) > new Date() ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'"
                    >
                      {{ new Date(w.expiresAt) > new Date() ? 'Còn hiệu lực' : 'Đã hết hạn' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Active Claim State -->
          <div
            v-if="activeWarrantyClaim"
            class="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-1"
          >
            <div class="flex items-center gap-1.5 font-bold">
              <Clock :size="15" class="text-amber-600" />
              <span>Đang có yêu cầu bảo hành đang được tiếp nhận &amp; xử lý</span>
            </div>
            <p class="text-[11px] text-amber-800">
              Mô tả sự cố: "{{ activeWarrantyClaim.description }}"
            </p>
            <p class="text-[10px] text-ink-500 font-num">
              Thời gian gửi: {{ formatDate(activeWarrantyClaim.submittedAt) }}
            </p>
          </div>

          <!-- Action Button -->
          <div v-else-if="isOrderWarrantyActive" class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ink-100">
            <span class="text-ink-500 text-[11px]">
              Nếu thiết bị gặp sự cố hoặc hoạt động bất thường, bạn có thể yêu cầu kỹ thuật viên đến kiểm tra lại miễn phí.
            </span>
            <FhButton
              variant="primary"
              size="sm"
              @click="showWarrantyClaimModal = true"
            >
              <ShieldCheck :size="14" class="mr-1.5" />
              Yêu cầu hỗ trợ bảo hành
            </FhButton>
          </div>
        </div>
      </FhCard>
    </div>

    <!-- Confirm Cancel Modal -->
    <FhConfirmDialog
      :open="showCancelModal"
      title="Huỷ đơn sửa chữa"
      consequence="Việc huỷ đơn khi thợ đã di chuyển có thể làm phát sinh phí bù trừ cho thợ theo quy định."
      confirm-text="Xác nhận huỷ"
      cancel-text="Quay lại"
      @confirm="confirmCancel"
      @cancel="showCancelModal = false"
    />

    <!-- Review Modal -->
    <div
      v-if="showReviewModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-6 space-y-4 shadow-xl">
        <h3 class="text-base font-bold text-ink-900">Đánh giá kỹ thuật viên</h3>
        <p class="text-xs text-ink-500">Bạn hài lòng với chất lượng dịch vụ ở mức nào?</p>

        <div class="flex items-center justify-center gap-1.5 py-2">
          <button
            v-for="star in 5"
            :key="star"
            type="button"
            class="p-1"
            @click="reviewRating = star"
          >
            <Star
              :size="28"
              :class="star <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-ink-200'"
            />
          </button>
        </div>

        <textarea
          v-model="reviewComment"
          rows="3"
          placeholder="Nhận xét thêm (không bắt buộc)..."
          class="w-full p-2.5 bg-white border border-ink-200 rounded text-xs"
        ></textarea>

        <div class="flex gap-2 pt-2">
          <FhButton variant="ghost" size="sm" class="flex-1" @click="showReviewModal = false">
            Đóng
          </FhButton>
          <FhButton
            variant="primary"
            size="sm"
            class="flex-1"
            :disabled="reviewSubmitting"
            @click="handleSubmitReview"
          >
            Gửi đánh giá
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Warranty Claim Modal -->
    <div
      v-if="showWarrantyClaimModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-6 space-y-4 shadow-xl">
        <h3 class="text-base font-bold text-ink-900">Yêu cầu Bảo hành Điện tử</h3>
        <p class="text-xs text-ink-500">
          Mô tả hiện tượng lỗi tái phát hoặc sự cố thiết bị:
        </p>
        <textarea
          v-model="warrantyClaimDescription"
          rows="3"
          placeholder="Mô tả sự cố cần bảo hành..."
          class="w-full p-2.5 bg-white border border-ink-200 rounded text-xs"
        ></textarea>

        <div class="flex gap-2 pt-2">
          <FhButton variant="ghost" size="sm" class="flex-1" @click="showWarrantyClaimModal = false">
            Đóng
          </FhButton>
          <FhButton
            variant="primary"
            size="sm"
            class="flex-1"
            :disabled="actionLoading"
            @click="handleCreateWarrantyClaim"
          >
            Gửi yêu cầu
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Tracking Modal -->
    <div
      v-if="showTrackingModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-ink-900 flex items-center gap-1.5">
            <MapPin :size="16" class="text-brand-600" /> Vị trí kỹ thuật viên
          </h3>
          <span v-if="order?.technicianLocation" class="text-[11px] text-ink-400">
            Cập nhật lúc {{ order.technicianLocation.updatedAt ? new Date(order.technicianLocation.updatedAt).toLocaleTimeString('vi-VN') : '--' }}
          </span>
        </div>
        <MapTilerMap
          :center="order?.technicianLocation ? { lat: order.technicianLocation.lat, lng: order.technicianLocation.lng } : (order?.destination || { lat: 21.0285, lng: 105.8542 })"
          :markers="trackingMarkers"
          height-class="h-72"
        />
        <FhButton variant="ghost" size="sm" class="w-full" @click="showTrackingModal = false">Đóng</FhButton>
      </div>
    </div>

    <!-- Payment Modal -->
    <div
      v-if="showPaymentModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div class="text-center space-y-2">
          <ShieldCheck :size="40" class="text-brand-600 mx-auto" />
          <h3 class="text-lg font-bold text-ink-900">Thanh toán Đơn hàng</h3>
          <p class="text-xs text-ink-500">
            Cổng thanh toán điện tử FixHome (VNPay / Thẻ ngân hàng).
          </p>
        </div>

        <div class="p-3 rounded bg-ink-50 text-center">
          <div class="text-xs text-ink-400">Số tiền cần thanh toán:</div>
          <div class="text-2xl font-bold font-num text-brand-700">
            <FhMoney :amount="order?.grandTotal ?? 0" />
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <FhButton variant="ghost" size="md" class="flex-1" @click="showPaymentModal = false">
            Đóng
          </FhButton>
          <FhButton
            variant="primary"
            size="md"
            class="flex-1"
            :disabled="actionLoading"
            @click="confirmPayment"
          >
            Xác nhận thanh toán
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Lightbox Zoom Modal for Evidence Photos -->
    <div
      v-if="lightboxEvidence"
      class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      @click="closeLightbox"
    >
      <div
        class="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="p-3.5 px-5 bg-ink-900 text-white flex items-center justify-between border-b border-ink-800">
          <div class="flex items-center gap-2.5">
            <span
              v-if="lightboxEvidence.type?.toLowerCase() === 'before'"
              class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-blue-600 text-white shadow-xs"
            >
              Ảnh trước khi làm (BEFORE)
            </span>
            <span
              v-else-if="lightboxEvidence.type?.toLowerCase() === 'after'"
              class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-600 text-white shadow-xs"
            >
              Ảnh sau khi hoàn thành (AFTER)
            </span>
            <span
              v-else
              class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-amber-600 text-white shadow-xs"
            >
              Ảnh chi tiết phát sinh
            </span>
          </div>

          <button
            type="button"
            class="p-1.5 rounded-lg text-ink-400 hover:text-white hover:bg-ink-800 transition-colors"
            @click="closeLightbox"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- High-res Image -->
        <div class="flex-1 overflow-auto bg-ink-950 flex items-center justify-center p-4 min-h-72 max-h-[65vh]">
          <img
            :src="lightboxEvidence.mediaUrl"
            :alt="lightboxEvidence.note || 'Bằng chứng sửa chữa'"
            class="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
          />
        </div>

        <!-- Modal Footer with Note & Time -->
        <div class="p-4 px-5 bg-white border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div class="space-y-1 flex-1">
            <span class="font-bold text-ink-900 block flex items-center gap-1.5">
              <MessageSquare :size="14" class="text-brand-600" />
              Ghi chú của Kỹ thuật viên:
            </span>
            <p v-if="lightboxEvidence.note?.trim()" class="text-ink-700 bg-ink-50 p-2.5 rounded-xl border border-ink-200">
              {{ lightboxEvidence.note }}
            </p>
            <p v-else class="text-ink-400 italic">
              (Không có ghi chú thêm cho ảnh này)
            </p>
          </div>

          <div class="shrink-0 text-right text-ink-500 font-mono text-[11px] self-end sm:self-center">
            {{ formatFullTimestamp(lightboxEvidence.capturedAt || lightboxEvidence.createdAt) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
