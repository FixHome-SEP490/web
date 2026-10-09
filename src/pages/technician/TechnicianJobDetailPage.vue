<script setup lang="ts">
import { supportCasesApi } from '../../api/support-cases.api';
import { canDepartNow, sessionLabel } from '../../utils/booking-session';
import { computed, ref, reactive, onMounted, onUnmounted, watch, onBeforeUnmount, nextTick, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  ArrowLeft,
  MapPin,
  Camera,
  CheckCircle2,
  Circle,
  Sparkles,
  Phone,
  Plus,
  Trash2,
  Navigation,
  AlertCircle,
  MessageSquare,
  Loader2,
  X,
  RefreshCw,
  AlertTriangle,
  Search,
  ShieldCheck,
  MoreHorizontal,
  ChevronDown,
  Calendar,
  Star,
  Banknote,
  Smartphone,
  UserRoundX,
  Flag,
  Ban,
  FileText,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhMoney,
  FhSkeleton,
  BookingMediaViewer,
  TechnicianPartsSection,
} from '../../components';
import {
  ordersApi,
  isHistoricalOrder,
  type HistoricalOrderItem,
  type ServiceOrderItem,
  type QuotationItemPayload,
  type AdditionalCostRecord,
} from '../../api/orders.api';
import { partsCatalogApi } from '../../api/parts-catalog.api';
import type { FixHomePart } from '../../api/admin-parts.api';
import { bookingsApi, isFullBookingWithMedia, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { mediaApi } from '../../api/media.api';
import { reviewsApi, type Review } from '../../api/reviews.api';
import { useChatStore } from '../../stores/chat.store';
import OrderComplaintPanel from '../../components/customer/OrderComplaintPanel.vue';
import AiSummaryDialog from '../../components/technician/AiSummaryDialog.vue';
import { userFacingError } from '../../utils/user-facing-error';
import { allowedComplaintTypes } from '../../utils/order-complaint';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
let jobId = String(route.params.id ?? '');
let loadGeneration = 0;
let disposed = false;

const loading = ref(true);
const loadFailed = ref(false);
const actionLoading = ref(false);
const job = ref<ServiceOrderItem | null>(null);
// Re-evaluated every 30 s so the depart button lights up on time without a reload.
const nowTick = ref(Date.now());
const nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 30_000);
onBeforeUnmount(() => clearInterval(nowTimer));
const isFixedPriceOrder = computed(() => String(job.value?.pricingMode ?? '').toLowerCase() === 'fixed_price');
const fixedPriceTotal = computed(() => {
  const unit = job.value?.fixedUnitPrice;
  if (typeof unit !== 'number' || !Number.isFinite(unit)) return null;
  return unit * Math.max(1, Number(job.value?.quantity ?? 1));
});
const historicalJob = ref<HistoricalOrderItem | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const bookingForMedia = ref<(BookingItem & { media: BookingMedia[] }) | null>(null);
const bookingMedia = computed(() => bookingForMedia.value?.media ?? []);
const bookingMediaBookingId = computed(() => bookingForMedia.value?.id ?? '');
/** What the customer wrote when booking; was not shown to the technician before 10/10/2026. */
const bookingDescription = computed(() => bookingForMedia.value?.description?.trim() ?? '');
/** Only bookings made through the AI flow carry it (PO 10/10/2026). */
const aiSummary = computed(() => bookingForMedia.value?.aiSummary ?? null);
const showAiSummary = ref(false);

// Work steps state
const isEnRoute = ref(false);
const gpsCheckedIn = ref(false);
const beforePhotoUploaded = ref(false);
const quotationSubmitted = ref(false);
const afterPhotoUploaded = ref(false);
const isCompleted = ref(false);
const customerReview = ref<Review | null>(null);

const parsedCustomerReview = computed(() => {
  if (!customerReview.value?.comment) {
    return { tags: [] as string[], text: '' };
  }
  const raw = customerReview.value.comment.trim();
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

// Cash settlement state
const declaredCashAmount = ref<number>(0);
const technicianCashNotes = ref('');
const cashSettled = ref(false);
const cashSettlementStatus = ref<'pending_confirmation' | 'confirmed' | 'disputed' | null>(null);
const hasCashPayment = ref<'YES' | 'NO' | null>(null);

// Quotation items form
const quotationItems = ref<QuotationItemPayload[]>([{ type: 'LABOR', description: '', quantity: 1, unitPrice: 0 }]);
const editingQuotation = ref(false);

// Additional cost (chi phí phát sinh)
const additionalCosts = ref<AdditionalCostRecord[]>([]);
const showAdditionalCostForm = ref(false);
const acReviseId = ref<string | null>(null);
const acReason = ref('');
const acItems = ref<QuotationItemPayload[]>([{ type: 'LABOR', description: '', quantity: 1, unitPrice: 0 }]);
const acEvidenceUrls = ref<string[]>([]);
const acFulfillmentMethod = ref<'pickup' | 'delivery'>('pickup');
const acShippingFee = ref<number>(0);
const acFile = ref<HTMLInputElement | null>(null);
const acUploading = ref(false);
const acSubmitting = ref(false);

const completionRequested = ref(false);
const beforeFile = ref<HTMLInputElement | null>(null);
const afterFile = ref<HTMLInputElement | null>(null);

export interface EvidenceRecord {
  id: string;
  type: 'before' | 'after' | 'additional';
  mediaUrl: string;
  createdAt?: string;
}
const evidences = ref<EvidenceRecord[]>([]);
const beforeEvidences = computed(() => (Array.isArray(evidences.value) ? evidences.value : []).filter((e) => e.type?.toLowerCase() === 'before'));
const afterEvidences = computed(() => (Array.isArray(evidences.value) ? evidences.value : []).filter((e) => e.type?.toLowerCase() === 'after'));
const previewModalUrl = ref<string | null>(null);
const previewImage = (url: string) => {
  previewModalUrl.value = url;
};
const activePreviewEvidence = computed(() => evidences.value.find((e) => e.mediaUrl === previewModalUrl.value));
const uploadingPhase = ref<'BEFORE' | 'AFTER' | null>(null);

// Rare actions live in one "Thêm" menu instead of separate cards.
const moreOpen = ref(false);
const complaintPanel = ref<{ openForm: () => void } | null>(null);
const sections = reactive({ photos: false, parts: false, extra: false });
const partsSummary = ref<{ count: number; needsAction: boolean }>({ count: 0, needsAction: false });
const onPartsSummary = (value: { count: number; needsAction: boolean }) => {
  partsSummary.value = value;
  if (value.needsAction) sections.parts = true;
};

// Cancel the order (the technician's "Huỷ đơn"; same cancel API and reasons as before).
const showWithdrawModal = ref(false);
const withdrawReason = ref('Sự cố phương tiện giao thông trên đường (hỏng xe, va chạm)');
const customWithdrawReason = ref('');
const withdrawing = ref(false);
const withdrawError = ref('');

const WITHDRAW_REASONS = [
  'Sự cố phương tiện giao thông trên đường (hỏng xe, va chạm)',
  'Sự cố sức khỏe hoặc gia đình đột xuất',
  'Kẹt xe nghiêm trọng không thể đến kịp giờ hẹn',
  'Không liên lạc được với khách hàng sau nhiều lần gọi',
  'Khách hàng hẹn lại thời gian khác ngoài giờ làm việc',
  'Lý do khác (tự nhập)',
];

const canWithdraw = computed(() => {
  if (!job.value) return false;
  const s = String(job.value.status).toUpperCase();
  return s === 'ACCEPTED' || (s === 'EN_ROUTE' && !gpsCheckedIn.value);
});

const openWithdraw = () => {
  moreOpen.value = false;
  withdrawError.value = '';
  showWithdrawModal.value = true;
};

const handleWithdrawOrder = async () => {
  const reason =
    withdrawReason.value === 'Lý do khác (tự nhập)'
      ? customWithdrawReason.value.trim()
      : withdrawReason.value;

  if (!reason) {
    withdrawError.value = 'Vui lòng ghi lý do huỷ đơn.';
    return;
  }

  withdrawing.value = true;
  actionLoading.value = true;
  withdrawError.value = '';
  try {
    await ordersApi.cancelOrder(jobId, reason);
    showWithdrawModal.value = false;
    toast.success('Đã huỷ đơn.');
    await router.push('/tech/jobs');
  } catch (err: unknown) {
    withdrawError.value = userFacingError(err, 'Chưa huỷ được đơn. Vui lòng thử lại.');
  } finally {
    withdrawing.value = false;
    actionLoading.value = false;
  }
};

// Google Maps navigation URL
const googleMapsUrl = computed(() => {
  if (job.value?.destination?.lat != null && job.value?.destination?.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${job.value.destination.lat},${job.value.destination.lng}`;
  }
  if (job.value?.addressSummary) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.value.addressSummary)}`;
  }
  return null;
});

const statusUpper = computed(() => String(job.value?.status ?? '').toUpperCase());
const isCancelled = computed(() => statusUpper.value === 'CANCELLED');
const isPaid = computed(() => String(job.value?.paymentStatus ?? '').toUpperCase() === 'PAID');
const hasBeforePhoto = computed(() => beforePhotoUploaded.value || beforeEvidences.value.length > 0);
const hasAfterPhoto = computed(() => afterPhotoUploaded.value || afterEvidences.value.length > 0);
const quotationRejected = computed(() => String(job.value?.quotation?.status ?? '').toLowerCase() === 'rejected');
const isRepairing = computed(() => statusUpper.value === 'UNDER_REPAIR' || statusUpper.value === 'IN_PROGRESS');

// Five steps; the page shows the current one and lists all of them only on "Xem thêm".
const currentStepNumber = computed<1 | 2 | 3 | 4 | 5>(() => {
  if (!job.value) return 1;
  const s = statusUpper.value;
  if (s === 'COMPLETED' || completionRequested.value || isCompleted.value) return 5;
  if (isRepairing.value) return 4;
  if (s === 'EN_ROUTE' && gpsCheckedIn.value && hasBeforePhoto.value) return 3;
  if (s === 'EN_ROUTE') return 2;
  return 1; // ACCEPTED
});

const steps = computed(() =>
  [
    'Xuất phát',
    'Đến nơi, chụp ảnh máy',
    isFixedPriceOrder.value ? 'Chuyển sang sửa chữa' : 'Báo giá cho khách',
    'Sửa xong, chụp ảnh',
    'Thu tiền',
  ].map((label, index) => {
    const n = index + 1;
    const done = isCompleted.value || n < currentStepNumber.value;
    return { n, label, state: done ? ('done' as const) : n === currentStepNumber.value ? ('current' as const) : ('todo' as const) };
  }),
);
const stepsExpanded = ref(false);
/** Each step opens to what happened in it (PO 10/10/2026). */
const openStep = ref<number | null>(null);
const toggleStep = (n: number) => { openStep.value = openStep.value === n ? null : n; };
/** When the order entered a status, from its history. */
const reachedAt = (status: string) =>
  job.value?.timeline?.find((t) => String(t.status).toLowerCase() === status)?.timestamp ?? null;
const QUOTATION_STATUS: Record<string, string> = {
  draft: 'Nháp', pending: 'Chờ khách duyệt', sent: 'Chờ khách duyệt', approved: 'Khách đã duyệt', accepted: 'Khách đã duyệt', rejected: 'Khách từ chối',
};

/** Show the quotation form while there is none, it was refused, or the technician reopens it. */
const showQuotationForm = computed(
  () => currentStepNumber.value === 3 && !isFixedPriceOrder.value && (!quotationSubmitted.value || quotationRejected.value || editingQuotation.value),
);
/** The payment step asks how the customer pays until a cash declaration exists. */
const showPaymentChoice = computed(
  () => completionRequested.value && !isCompleted.value && !isPaid.value && !cashSettled.value,
);

interface PrimaryAction {
  label: string;
  run: () => unknown;
  icon: Component;
  disabled?: boolean;
  loading?: boolean;
}
interface NowStep {
  title: string;
  hint?: string;
  action?: PrimaryAction;
}

/** What the technician has to do now: one line and at most one primary button. */
const nowStep = computed<NowStep | null>(() => {
  if (!job.value) return null;
  const s = statusUpper.value;

  if (s === 'CANCELLED') return { title: 'Đơn đã huỷ' };

  if (s === 'COMPLETED' || isCompleted.value) {
    return { title: 'Đơn đã hoàn thành', hint: 'Tiền công đã được ghi nhận vào ví của bạn.' };
  }

  // No customer acceptance (PO 09/10/2026): once completed with the after photo, only the payment is left.
  if (completionRequested.value) {
    if (isPaid.value) {
      return {
        title: 'Khách đã thanh toán',
        hint: 'Đơn sẽ sớm chuyển sang hoàn thành.',
        action: { label: 'Làm mới', run: refreshJobStatus, icon: RefreshCw, loading: refreshingStatus.value },
      };
    }
    if (cashSettled.value) {
      return {
        title: cashSettlementStatus.value === 'confirmed' ? 'Khách đã xác nhận tiền mặt' : 'Chờ khách xác nhận tiền mặt',
        action: { label: 'Kiểm tra lại', run: refreshJobStatus, icon: RefreshCw, loading: refreshingStatus.value },
      };
    }
    if (hasCashPayment.value === 'YES') {
      return {
        title: 'Thu tiền',
        hint: 'Nhập số tiền mặt đã thu, khách sẽ xác nhận trong ứng dụng.',
        action: {
          label: 'Khai báo đã thu tiền mặt',
          run: handleDeclareCash,
          icon: Banknote,
          disabled: actionLoading.value,
          loading: actionLoading.value,
        },
      };
    }
    if (hasCashPayment.value === 'NO') {
      return {
        title: 'Thu tiền',
        hint: 'Nhắc khách thanh toán trong ứng dụng FixHome.',
        action: { label: 'Kiểm tra thanh toán', run: refreshJobStatus, icon: RefreshCw, loading: refreshingStatus.value },
      };
    }
    return { title: 'Thu tiền', hint: 'Khách trả bằng cách nào?' };
  }

  if (isRepairing.value) {
    if (!hasAfterPhoto.value) {
      return {
        title: 'Đang sửa chữa',
        hint: 'Sửa xong, chụp ảnh máy để hoàn thành.',
        action: {
          label: uploadingPhase.value === 'AFTER' ? 'Đang tải ảnh…' : 'Hoàn thành (chụp ảnh sau sửa)',
          run: () => afterFile.value?.click(),
          icon: Camera,
          disabled: actionLoading.value,
          loading: uploadingPhase.value === 'AFTER',
        },
      };
    }
    return {
      title: 'Sẵn sàng hoàn thành',
      hint: 'Đã có ảnh sau sửa.',
      action: {
        label: 'Hoàn thành',
        run: handleCompleteOrder,
        icon: ShieldCheck,
        disabled: actionLoading.value,
        loading: actionLoading.value,
      },
    };
  }

  if (s === 'EN_ROUTE' && gpsCheckedIn.value) {
    if (!hasBeforePhoto.value) {
      return {
        title: 'Chụp ảnh máy trước khi sửa',
        hint: 'Cần ít nhất 1 ảnh.',
        action: {
          label: uploadingPhase.value === 'BEFORE' ? 'Đang tải ảnh…' : 'Chụp ảnh máy',
          run: openBeforeEvidencePicker,
          icon: Camera,
          disabled: actionLoading.value,
          loading: uploadingPhase.value === 'BEFORE',
        },
      };
    }
    if (isFixedPriceOrder.value) {
      return {
        title: 'Chờ chuyển sang sửa chữa',
        hint: 'Giá cố định, không cần báo giá.',
        action: {
          label: 'Tải lại trạng thái',
          run: () => loadJob(jobId, { silent: true }),
          icon: RefreshCw,
          disabled: actionLoading.value,
          loading: actionLoading.value,
        },
      };
    }
    if (showQuotationForm.value) {
      return {
        title: quotationRejected.value ? 'Khách chưa đồng ý báo giá' : 'Gửi báo giá cho khách',
        hint: quotationRejected.value ? 'Sửa lại rồi gửi lần nữa.' : undefined,
        action: {
          label: 'Gửi báo giá cho khách duyệt',
          run: handleSubmitQuotation,
          icon: FileText,
          disabled: !beforePhotoUploaded.value || actionLoading.value,
          loading: actionLoading.value,
        },
      };
    }
    return {
      title: 'Chờ khách duyệt báo giá',
      hint: 'Khách duyệt xong, đơn tự chuyển sang sửa chữa.',
      action: {
        label: 'Kiểm tra khách đã duyệt chưa',
        run: () => loadJob(jobId, { silent: true }),
        icon: RefreshCw,
        disabled: actionLoading.value,
        loading: actionLoading.value,
      },
    };
  }

  if (s === 'EN_ROUTE') {
    return {
      title: 'Đang đến nhà khách',
      hint: 'Tới nơi thì check-in và chụp ảnh máy.',
      action: {
        label: 'Check-in và chụp ảnh sản phẩm',
        run: () => beforeFile.value?.click(),
        icon: MapPin,
        disabled: actionLoading.value,
        loading: actionLoading.value,
      },
    };
  }

  // ACCEPTED
  const departOpen = canDepartNow(job.value.departAvailableAt, nowTick.value);
  return {
    title: 'Xuất phát đến nhà khách',
    hint: departOpen ? undefined : `Được xuất phát từ ${vnDateTimeString(job.value.departAvailableAt!)}.`,
    action: {
      label: 'Bắt đầu di chuyển',
      run: handleEnRoute,
      icon: Navigation,
      disabled: actionLoading.value || !departOpen,
      loading: actionLoading.value,
    },
  };
});

const canReport = computed(
  () =>
    !!job.value &&
    allowedComplaintTypes(String(job.value.status), job.value.completedAt ?? null, new Date(), 'technician').length > 0,
);

const openReport = () => {
  moreOpen.value = false;
  complaintPanel.value?.openForm();
};

async function handleDeleteEvidence(evidence?: EvidenceRecord | null) {
  if (!evidence) return;
  if (!window.confirm('Xoá ảnh này?')) return;
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    if (typeof ordersApi.deleteEvidence === 'function') {
      await ordersApi.deleteEvidence(jobId, evidence.id);
    }
    evidences.value = evidences.value.filter((e) => e.id !== evidence.id);
    if (previewModalUrl.value === evidence.mediaUrl) {
      previewModalUrl.value = null;
    }
    await loadJob(jobId, { silent: true });
    actionMessage.value = { type: 'success', text: 'Đã xoá ảnh.' };
  } catch (err: unknown) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa xoá được ảnh. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
}

async function uploadSelectedEvidence(phase: 'BEFORE' | 'AFTER', fileList?: FileList | File[] | null) {
  if (!fileList) return;
  const files = Array.from(fileList);
  if (files.length === 0) return;
  actionLoading.value = true;
  uploadingPhase.value = phase;
  actionMessage.value = null;
  try {
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP dưới 10 MB.');
      }
      await ordersApi.uploadEvidence(jobId, { phase, file });
    }
    await loadJob(jobId, { silent: true });
    actionMessage.value = { type: 'success', text: files.length > 1 ? `Đã lưu ${files.length} ảnh.` : 'Đã lưu ảnh.' };
  } catch (err: unknown) {
    actionMessage.value = {
      type: 'error',
      text: userFacingError(err, 'Chưa lưu được ảnh. Chọn ảnh JPEG, PNG hoặc WebP dưới 10 MB rồi thử lại.'),
    };
  } finally {
    actionLoading.value = false;
    uploadingPhase.value = null;
    if (phase === 'BEFORE' && beforeFile.value) beforeFile.value.value = '';
    if (phase === 'AFTER' && afterFile.value) afterFile.value.value = '';
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (previewModalUrl.value) previewModalUrl.value = null;
  else if (moreOpen.value) moreOpen.value = false;
  else if (showWithdrawModal.value && !withdrawing.value) showWithdrawModal.value = false;
  else if (replacementOpen.value && !replacementSending.value) replacementOpen.value = false;
};

onMounted(() => {
  disposed = false;
  window.addEventListener('keydown', handleKeyDown);
  void loadJob(jobId);
});

const loadJob = async (requestedJobId = jobId, options: { silent?: boolean } = {}) => {
  const generation = ++loadGeneration;
  const isCurrent = () => !disposed && generation === loadGeneration && requestedJobId === jobId;
  if (!options.silent) {
    loading.value = true;
    loadFailed.value = false;
    bookingForMedia.value = null;
  }
  try {
    const data = await ordersApi.getTechnicianOrder(requestedJobId);
    if (!isCurrent()) return;
    if (isHistoricalOrder(data)) {
      historicalJob.value = data;
      job.value = null;
      stopLocationPing();
      return; // No private data or workspace API calls for old technicians.
    }
    historicalJob.value = null;
    job.value = data;
    loadFailed.value = false;
    isEnRoute.value = data.status !== 'ACCEPTED';
    gpsCheckedIn.value = !!data.arrivalVerified;
    if (data.status === 'EN_ROUTE' && !data.arrivalVerified) startLocationPing();
    else stopLocationPing();

    try {
      if (typeof ordersApi.getEvidence === 'function') {
        const evList = await ordersApi.getEvidence(requestedJobId);
        evidences.value = Array.isArray(evList) ? evList : [];
      }
    } catch {
      evidences.value = [];
    }

    beforePhotoUploaded.value = beforeEvidences.value.length > 0 || Number(data.beforeEvidenceCount) > 0;
    afterPhotoUploaded.value = afterEvidences.value.length > 0 || Number(data.afterEvidenceCount) > 0;
    isCompleted.value = data.status === 'COMPLETED';
    completionRequested.value = !!data.completionRequestedAt;
    quotationSubmitted.value = !!data.quotation;
    declaredCashAmount.value = Number(data.grandTotal);

    const bookingId = typeof data.bookingId === 'string' ? data.bookingId.trim() : '';
    if (bookingId && (!options.silent || !bookingForMedia.value)) {
      try {
        const booking = await bookingsApi.getBooking(bookingId);
        if (isCurrent() && isFullBookingWithMedia(booking, bookingId)) {
          bookingForMedia.value = booking;
        }
      } catch {
        if (isCurrent()) bookingForMedia.value = null;
      }
    }
    if (!isCurrent()) return;

    const settlement = await ordersApi.getCashSettlement(requestedJobId);
    if (!isCurrent()) return;
    cashSettled.value = !!settlement;
    cashSettlementStatus.value = (settlement?.status as typeof cashSettlementStatus.value) || null;
    if (settlement) {
      hasCashPayment.value = 'YES';
    }
    if (data.status === 'UNDER_REPAIR' || data.status === 'COMPLETED') {
      const costs = await ordersApi.getAdditionalCosts(requestedJobId);
      if (!isCurrent()) return;
      additionalCosts.value = costs;
    }

    if (data.status === 'COMPLETED') {
      try {
        const rev = await reviewsApi.getByOrder(requestedJobId);
        if (isCurrent()) customerReview.value = rev;
      } catch {
        if (isCurrent()) customerReview.value = null;
      }
    }
  } catch {
    if (!isCurrent()) return;
    if (job.value || historicalJob.value) {
      actionMessage.value = { type: 'error', text: 'Chưa cập nhật được công việc. Vui lòng thử lại.' };
    } else {
      loadFailed.value = true;
    }
  } finally {
    if (isCurrent() && !options.silent) loading.value = false;
  }
};

watch(
  () => String(route.params.id ?? ''),
  (nextId, previousId) => {
    if (!nextId || nextId === previousId) return;
    jobId = nextId;
    bookingForMedia.value = null;
    void loadJob(nextId);
  },
);

const handleChatWithCustomer = async () => {
  if (!job.value) return;
  const bookingId = (job.value as unknown as { bookingId?: string }).bookingId || jobId;
  const conv = await chatStore.openConversationForBooking(bookingId);
  if (!conv) {
    const found = chatStore.conversations.find(
      (c) => c.bookingId === bookingId || c.serviceOrderId === jobId,
    );
    if (found) {
      await chatStore.selectConversation(found.id);
      chatStore.toggleWidget(true);
    } else {
      chatStore.toggleWidget(true);
    }
  }
};

const laborTotal = () =>
  quotationItems.value
    .filter((i) => i.type === 'LABOR')
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

const partsTotal = () =>
  quotationItems.value
    .filter((i) => i.type === 'PARTS')
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

const addItem = (type: 'LABOR' | 'PARTS') => {
  quotationItems.value.push({
    type,
    description: type === 'LABOR' ? 'Hạng mục công kỹ thuật' : 'Tên linh kiện thay thế',
    quantity: 1,
    unitPrice: 0,
    ...(type === 'PARTS' ? { partSource: 'technician' as const, partWarrantyOption: 'no_warranty' as const } : {}),
  });
};

const removeItem = (idx: number) => {
  quotationItems.value.splice(idx, 1);
};

let locationPing: ReturnType<typeof setInterval> | null = null;
const stopLocationPing = () => {
  if (locationPing) {
    clearInterval(locationPing);
    locationPing = null;
  }
};
const startLocationPing = () => {
  stopLocationPing();
  const ping = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        ordersApi
          .updateLocation(jobId, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          })
          .catch(() => {
            /* transient network error, next ping retries */
          });
      },
      () => {
        /* location unavailable this tick, next ping retries */
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };
  ping();
  locationPing = setInterval(ping, 20000);
};

onUnmounted(() => {
  disposed = true;
  loadGeneration += 1;
  bookingForMedia.value = null;
  stopLocationPing();
  window.removeEventListener('keydown', handleKeyDown);
});

const handleEnRoute = async () => {
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    await ordersApi.enRoute(jobId);
    isEnRoute.value = true;
    if (job.value) job.value.status = 'EN_ROUTE';
    startLocationPing();
    actionMessage.value = { type: 'success', text: 'Đã báo khách là bạn đang đến.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa bắt đầu di chuyển được. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const obtainCurrentPosition = async (): Promise<{ lat: number; lng: number; accuracyMeters: number }> => {
  // 1. Standard accuracy first, then high accuracy.
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 4000,
          enableHighAccuracy: false,
          maximumAge: 60000,
        });
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
      };
    } catch {
      try {
        const posHigh = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 4000,
            enableHighAccuracy: true,
            maximumAge: 30000,
          });
        });
        return {
          lat: posHigh.coords.latitude,
          lng: posHigh.coords.longitude,
          accuracyMeters: posHigh.coords.accuracy,
        };
      } catch {
        // No location sensor, or the permission is blocked.
      }
    }
  }

  // Check-in uses only the device's real GPS position at the moment of the tap;
  // never an old position or the customer's address.
  throw new Error('Không lấy được vị trí. Bật định vị rồi thử lại.');
};

const handleCheckIn = async () => {
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    const coords = await obtainCurrentPosition();
    const result = await ordersApi.checkIn(jobId, {
      lat: coords.lat,
      lng: coords.lng,
      accuracyMeters: coords.accuracyMeters,
    });

    if (result.result !== 'valid') {
      if (result.result === 'out_of_geofence') {
        const dist = typeof result.distanceMeters === 'number' ? `${Math.round(result.distanceMeters)} m` : 'xa';
        throw new Error(`Bạn đang cách nhà khách ${dist}. Tới gần hơn rồi thử lại.`);
      }
      if (result.result === 'low_accuracy') {
        throw new Error('Định vị chưa đủ chính xác. Ra chỗ thoáng hoặc bật GPS rồi thử lại.');
      }
      throw new Error('Chưa xác nhận được vị trí. Tới đúng địa chỉ rồi thử lại.');
    }

    gpsCheckedIn.value = true;
    stopLocationPing();
    actionMessage.value = { type: 'success', text: 'Đã xác nhận đến nơi.' };
  } catch (err: unknown) {
    actionMessage.value = {
      type: 'error',
      text: userFacingError(err, 'Chưa xác nhận được vị trí. Kiểm tra quyền định vị rồi thử lại tại địa chỉ sửa chữa.'),
    };
  } finally {
    actionLoading.value = false;
  }
};

const openBeforeEvidencePicker = () => {
  if (gpsCheckedIn.value && !actionLoading.value) beforeFile.value?.click();
};
// Check-in needs a product photo (PO 08/10/2026): the picker opens first, then the
// GPS check-in runs, then the photo is stored.
const handleUploadBefore = async () => {
  const files = beforeFile.value?.files;
  if (!files || files.length === 0) return;
  if (!gpsCheckedIn.value) {
    await handleCheckIn();
    if (!gpsCheckedIn.value) {
      if (beforeFile.value) beforeFile.value.value = '';
      return;
    }
  }
  await uploadSelectedEvidence('BEFORE', files);
};
// "Hoàn thành": the after photo, then the completion request.
const handleUploadAfter = async () => {
  const hadAfter = afterEvidences.value.length > 0;
  await uploadSelectedEvidence('AFTER', afterFile.value?.files);
  if (!hadAfter && afterEvidences.value.length > 0 && !completionRequested.value) await handleCompleteOrder();
};

const handleSubmitQuotation = async () => {
  actionLoading.value = true;
  try {
    await ordersApi.submitQuotation(jobId, quotationItems.value);
    quotationSubmitted.value = true;
    editingQuotation.value = false;
    actionMessage.value = { type: 'success', text: 'Đã gửi báo giá, chờ khách duyệt.' };
    await loadJob(jobId, { silent: true });
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa gửi được báo giá. Kiểm tra nội dung và giá rồi thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const acLaborTotal = () =>
  acItems.value.filter((i) => i.type === 'LABOR').reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
const acPartsTotal = () =>
  acItems.value.filter((i) => i.type === 'PARTS').reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

// FixHome parts catalog picker for additional costs
const showAcPartPicker = ref(false);
const acPartSearchQuery = ref('');
const acPartActiveCategory = ref('ALL');
const isAcPartSearching = ref(false);
const acCatalogParts = ref<FixHomePart[]>([]);
const acPartSearchResults = ref<FixHomePart[]>([]);
const acPartsMap = ref<Map<string, FixHomePart>>(new Map());
const acTargetItemIndex = ref<number | null>(null);

const AC_CATEGORY_TABS = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Điều hòa', value: 'Điều hòa' },
  { label: 'Máy giặt', value: 'Máy giặt' },
  { label: 'Tủ lạnh', value: 'Tủ lạnh' },
  { label: 'Bình nóng lạnh', value: 'Bình nóng lạnh' },
  { label: 'Quạt, thiết bị khác', value: 'Quạt' },
];

const formatAcWarrantyBadge = (days?: number | null): string => {
  if (days && days > 0) {
    if (days >= 360) return `BH ${Math.round(days / 365)} năm`;
    if (days >= 30) return `BH ${Math.round(days / 30)} tháng`;
    return `BH ${days} ngày`;
  }
  return 'BH chính hãng';
};

const loadAcCatalog = async () => {
  if (acCatalogParts.value.length > 0) return;
  try {
    const res = await partsCatalogApi.getCatalog({ limit: 100 });
    acCatalogParts.value = res.data;
    acPartSearchResults.value = res.data;
    for (const p of res.data) {
      acPartsMap.value.set(p.id, p);
    }
  } catch {
    // The picker shows its empty state; typing searches again.
  }
};

let acSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const onAcPartSearchInput = () => {
  if (acSearchDebounceTimer) clearTimeout(acSearchDebounceTimer);
  acSearchDebounceTimer = setTimeout(() => {
    void executeAcPartSearch();
  }, 250);
};

const selectAcCategory = (catVal: string) => {
  acPartActiveCategory.value = catVal;
  void executeAcPartSearch();
};

const clearAcSearch = () => {
  acPartSearchQuery.value = '';
  acPartActiveCategory.value = 'ALL';
  acPartSearchResults.value = acCatalogParts.value;
};

const executeAcPartSearch = async () => {
  const query = acPartSearchQuery.value.trim();
  const cat = acPartActiveCategory.value !== 'ALL' ? acPartActiveCategory.value : '';
  const effective = query || cat;

  if (!effective) {
    acPartSearchResults.value = acCatalogParts.value;
    return;
  }

  try {
    isAcPartSearching.value = true;
    const res = await partsCatalogApi.getCatalog({ search: effective, limit: 50 });
    acPartSearchResults.value = res.data;
    for (const p of res.data) {
      acPartsMap.value.set(p.id, p);
    }
  } catch {
    acPartSearchResults.value = acCatalogParts.value.filter(
      (p) =>
        p.name.toLowerCase().includes(effective.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(effective.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(effective.toLowerCase())),
    );
  } finally {
    isAcPartSearching.value = false;
  }
};

const openAcPartPicker = (replaceIndex: number | null = null) => {
  acTargetItemIndex.value = replaceIndex;
  showAcPartPicker.value = true;
  acPartSearchQuery.value = '';
  acPartActiveCategory.value = 'ALL';
  void loadAcCatalog();
};

const selectPartForAc = (part: FixHomePart) => {
  acPartsMap.value.set(part.id, part);
  const newItem: QuotationItemPayload = {
    type: 'PARTS',
    partSource: 'fixhome',
    partCatalogId: part.id,
    partNameSnapshot: part.name,
    description: part.name,
    quantity: 1,
    unitPrice: part.sellingPrice,
    warrantyDays: part.warrantyDays ?? undefined,
    warrantyPolicy: part.warrantyPolicy ?? undefined,
    partSku: part.sku ?? undefined,
  };

  if (acItems.value.length === 1 && !acItems.value[0].description.trim() && acItems.value[0].unitPrice === 0) {
    acItems.value = [newItem];
  } else if (acTargetItemIndex.value !== null && acItems.value[acTargetItemIndex.value]) {
    acItems.value[acTargetItemIndex.value] = {
      ...acItems.value[acTargetItemIndex.value],
      ...newItem,
      quantity: acItems.value[acTargetItemIndex.value].quantity || 1,
    };
  } else {
    acItems.value.push(newItem);
  }

  showAcPartPicker.value = false;
  acTargetItemIndex.value = null;
};

const addAcItem = (type: 'LABOR' | 'PARTS', partSource: 'fixhome' | 'technician' | 'external' = 'technician') => {
  if (type === 'PARTS' && partSource === 'fixhome') {
    openAcPartPicker(null);
    return;
  }
  acItems.value.push({
    type,
    description:
      type === 'LABOR'
        ? 'Hạng mục công phát sinh'
        : partSource === 'external'
          ? 'Linh kiện mua ngoài'
          : 'Tên linh kiện phát sinh',
    quantity: 1,
    unitPrice: 0,
    partSource: type === 'PARTS' ? partSource : undefined,
  });
};
const removeAcItem = (idx: number) => acItems.value.splice(idx, 1);

function openAdditionalCostForm(revise?: AdditionalCostRecord) {
  acReviseId.value = revise?.id ?? null;
  acReason.value = revise?.reason ?? '';
  acFulfillmentMethod.value = revise?.fulfillmentMethod || 'pickup';
  acShippingFee.value = revise?.shippingFee || 0;
  acItems.value = revise
    ? revise.items.map((i) => ({
        type: i.type === 'LABOR' ? 'LABOR' : 'PARTS',
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        partSource: i.partSource || undefined,
        partCatalogId: i.partCatalogId || undefined,
        partNameSnapshot: i.partNameSnapshot || undefined,
        warrantyDays: (i as unknown as { warrantyDays?: number }).warrantyDays || undefined,
      }))
    : [{ type: 'LABOR', description: '', quantity: 1, unitPrice: 0 }];
  acEvidenceUrls.value = revise?.evidenceUrls ? [...revise.evidenceUrls] : [];
  showAdditionalCostForm.value = true;
  sections.extra = true;
  void loadAcCatalog();
}

async function handleUploadAcEvidence(file?: File) {
  if (!file) return;
  acUploading.value = true;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
      throw new Error('Invalid image');
    const media = await mediaApi.upload(file);
    acEvidenceUrls.value.push(media.url);
  } catch {
    actionMessage.value = { type: 'error', text: 'Chưa tải được ảnh. Chọn ảnh JPEG, PNG hoặc WebP dưới 10 MB.' };
  } finally {
    acUploading.value = false;
  }
}

async function handleSubmitAdditionalCost() {
  if (!acReason.value.trim()) {
    actionMessage.value = { type: 'error', text: 'Vui lòng ghi lý do phát sinh.' };
    return;
  }

  const validItems = acItems.value.filter((i) => {
    const hasDesc = !!i.description?.trim();
    const hasPart = i.type === 'PARTS' && !!i.partCatalogId;
    return hasDesc || hasPart;
  });

  if (validItems.length === 0) {
    actionMessage.value = { type: 'error', text: 'Thêm ít nhất 1 hạng mục phát sinh.' };
    return;
  }

  const hasEmptyDesc = validItems.some((i) => !i.description?.trim());
  if (hasEmptyDesc) {
    actionMessage.value = { type: 'error', text: 'Ghi mô tả cho mọi hạng mục phát sinh.' };
    return;
  }

  acSubmitting.value = true;
  try {
    const hasFixHomeParts = validItems.some((i) => i.type === 'PARTS' && i.partSource === 'fixhome');
    const shipping =
      hasFixHomeParts && acFulfillmentMethod.value === 'delivery' ? Number(acShippingFee.value || 0) : 0;
    const body = {
      reason: acReason.value.trim(),
      items: validItems,
      evidenceUrls: acEvidenceUrls.value.length > 0 ? acEvidenceUrls.value : undefined,
      fulfillmentMethod: hasFixHomeParts ? acFulfillmentMethod.value : undefined,
      shippingFee: shipping,
    };
    const saved = acReviseId.value
      ? await ordersApi.reviseAdditionalCost(acReviseId.value, body)
      : await ordersApi.createAdditionalCost(jobId, body);
    additionalCosts.value = [saved, ...additionalCosts.value.filter((c) => c.id !== acReviseId.value)];
    showAdditionalCostForm.value = false;
    actionMessage.value = { type: 'success', text: 'Đã gửi chi phí phát sinh, chờ khách duyệt.' };
  } catch (err: unknown) {
    actionMessage.value = {
      type: 'error',
      text: userFacingError(err, 'Chưa gửi được chi phí phát sinh. Vui lòng thử lại.'),
    };
  } finally {
    acSubmitting.value = false;
  }
}

const AC_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Chờ khách duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  EXPIRED: 'Hết hạn chờ duyệt',
  CANCELLED: 'Đã huỷ',
};

// "Cần thay đổi thợ" (PO 08/10/2026): after check-in, when the job is outside the
// technician's skills, the Service Manager gets a case to send someone else.
const replacementOpen = ref(false);
const replacementReason = ref('');
const replacementSending = ref(false);
const replacementSent = ref(false);
const replacementError = ref('');
const canAskReplacement = computed(() => gpsCheckedIn.value && ['EN_ROUTE', 'UNDER_REPAIR'].includes(statusUpper.value) && !completionRequested.value);
const openReplacement = () => {
  moreOpen.value = false;
  replacementError.value = '';
  replacementOpen.value = true;
};
const sendReplacement = async () => {
  const reason = replacementReason.value.trim();
  if (reason.length < 10) {
    replacementError.value = 'Ghi rõ vì sao cần đổi thợ, tối thiểu 10 ký tự.';
    return;
  }
  replacementSending.value = true;
  replacementError.value = '';
  try {
    await supportCasesApi.createCase({ caseType: 'technician_replacement', reason, serviceOrderId: jobId, isUrgent: true });
    replacementSent.value = true;
    replacementOpen.value = false;
  } catch (err) {
    replacementError.value = userFacingError(err, 'Chưa gửi được. Vui lòng thử lại.');
  } finally {
    replacementSending.value = false;
  }
};

const handleCompleteOrder = async () => {
  actionLoading.value = true;
  try {
    await ordersApi.completeRepair(jobId, { completionNote: 'Hoàn tất công việc' });
    await loadJob(jobId, { silent: true });
    actionMessage.value = { type: 'success', text: 'Đã hoàn thành. Chờ khách thanh toán.' };
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: userFacingError(err, 'Chưa hoàn thành được. Kiểm tra ảnh sau sửa và chi phí đang chờ duyệt.'),
    };
  } finally {
    actionLoading.value = false;
  }
};

const handleDeclareCash = async () => {
  if (!declaredCashAmount.value || declaredCashAmount.value <= 0) {
    actionMessage.value = { type: 'error', text: 'Vui lòng nhập số tiền mặt đã thu.' };
    return;
  }
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    const res = await ordersApi.declareCashSettlement(jobId, {
      declaredAmount: declaredCashAmount.value,
      technicianNotes: technicianCashNotes.value,
    });
    cashSettled.value = true;
    hasCashPayment.value = 'YES';
    cashSettlementStatus.value = String(res.status || 'pending_confirmation') as
      | 'pending_confirmation'
      | 'confirmed'
      | 'disputed';
    actionMessage.value = { type: 'success', text: 'Đã khai báo tiền mặt, chờ khách xác nhận.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: userFacingError(err, 'Chưa khai báo được tiền mặt. Vui lòng thử lại.') };
  } finally {
    actionLoading.value = false;
  }
};

const refreshingStatus = ref(false);
const refreshJobStatus = async () => {
  moreOpen.value = false;
  refreshingStatus.value = true;
  try {
    await loadJob(jobId, { silent: true });
    if (isCompleted.value || job.value?.status === 'COMPLETED') {
      actionMessage.value = { type: 'success', text: 'Đơn đã hoàn thành.' };
    } else if (isPaid.value) {
      actionMessage.value = { type: 'success', text: 'Khách đã thanh toán.' };
    } else {
      actionMessage.value = { type: 'success', text: 'Đã cập nhật.' };
    }
  } catch {
    actionMessage.value = { type: 'error', text: 'Chưa cập nhật được. Vui lòng thử lại.' };
  } finally {
    refreshingStatus.value = false;
  }
};

const toggleMore = async () => {
  moreOpen.value = !moreOpen.value;
  if (moreOpen.value) {
    await nextTick();
    document.querySelector<HTMLElement>('[data-more-menu] [role="menuitem"]')?.focus();
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-4 sm:space-y-5" :class="job && nowStep?.action ? 'pb-24 sm:pb-0' : ''">
    <input
      ref="beforeFile"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      class="hidden"
      @change="handleUploadBefore"
    />
    <input
      ref="afterFile"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      class="hidden"
      @change="handleUploadAfter"
    />

    <a
      href="/tech/jobs"
      class="inline-flex items-center gap-1.5 h-10 -ml-1 px-1 rounded-lg text-sm font-medium text-ink-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 whitespace-nowrap"
      @click.prevent="router.push('/tech/jobs')"
    >
      <ArrowLeft :size="16" /> Công việc
    </a>

    <!-- Loading: the shape of the page that is coming -->
    <div v-if="loading" class="space-y-4" aria-busy="true" aria-label="Đang tải công việc">
      <FhSkeleton height="28px" width="55%" />
      <FhSkeleton height="18px" width="35%" />
      <div class="bg-white rounded-md border border-ink-200 p-5 sm:p-6 space-y-3">
        <FhSkeleton height="22px" width="60%" />
        <FhSkeleton height="16px" width="80%" />
        <FhSkeleton height="44px" width="200px" rounded="md" />
      </div>
      <div class="bg-white rounded-md border border-ink-200 p-5 sm:p-6 space-y-3">
        <FhSkeleton height="18px" width="40%" />
        <FhSkeleton height="16px" :count="3" />
      </div>
    </div>

    <!-- Historical read-only detail: the technician no longer holds this order -->
    <div
      v-else-if="historicalJob"
      data-testid="technician-historical-detail"
      class="rounded-md border border-ink-200 bg-white p-5 sm:p-6 space-y-3 shadow-(--shadow-e1)"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-lg font-bold text-ink-900">Công việc <span class="font-num whitespace-nowrap">{{ historicalJob.code }}</span></h1>
        <FhStatusPill :status="historicalJob.status" />
      </div>
      <p class="text-sm text-ink-600">Ngày ghi nhận: <span class="font-num whitespace-nowrap">{{ vnDateString(historicalJob.createdAt) }}</span></p>
      <p class="text-sm text-ink-600">Bạn không còn phụ trách đơn này nên không xem được thông tin của khách.</p>
    </div>

    <!-- Could not load at all: one friendly line and a retry -->
    <div v-else-if="loadFailed && !job" class="rounded-md border border-ink-200 bg-white p-6 text-center space-y-3" role="alert">
      <p class="text-sm text-ink-700">Chưa tải được công việc. Vui lòng thử lại.</p>
      <FhButton variant="secondary" @click="loadJob(jobId)">Thử lại</FhButton>
    </div>

    <template v-else-if="job">
      <!-- 1. Header: title, code, status, one overflow menu -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900 text-balance">Chi tiết công việc</h1>
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <span class="text-sm text-ink-500 font-num whitespace-nowrap">{{ job.code }}</span>
            <FhStatusPill :status="job.status" />
          </div>
        </div>

        <div class="relative shrink-0" data-more-menu>
          <button
            type="button"
            class="h-10 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 inline-flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-haspopup="menu"
            :aria-expanded="moreOpen"
            data-testid="job-more-button"
            @click="toggleMore"
          >
            <MoreHorizontal :size="18" />
            Thêm
          </button>
          <div v-if="moreOpen" class="fixed inset-0 z-40" @click="moreOpen = false" />
          <div
            v-if="moreOpen"
            role="menu"
            class="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) py-1.5 z-50 text-sm"
          >
            <button type="button" role="menuitem" class="w-full h-11 px-4 flex items-center gap-3 text-ink-700 hover:bg-ink-50 text-left" @click="refreshJobStatus">
              <RefreshCw :size="16" class="text-ink-500" :class="{ 'animate-spin': refreshingStatus }" />
              Làm mới
            </button>
            <button
              v-if="canAskReplacement && !replacementSent"
              type="button"
              role="menuitem"
              class="w-full h-11 px-4 flex items-center gap-3 text-ink-700 hover:bg-ink-50 text-left"
              @click="openReplacement"
            >
              <UserRoundX :size="16" class="text-ink-500" />
              Cần thay đổi thợ
            </button>
            <button
              v-if="canReport"
              type="button"
              role="menuitem"
              class="w-full h-11 px-4 flex items-center gap-3 text-ink-700 hover:bg-ink-50 text-left"
              @click="openReport"
            >
              <Flag :size="16" class="text-ink-500" />
              Báo cáo vấn đề
            </button>
            <template v-if="canWithdraw">
              <div class="my-1.5 border-t border-ink-100" />
              <button
                type="button"
                role="menuitem"
                class="w-full h-11 px-4 flex items-center gap-3 text-danger-600 hover:bg-danger-50 text-left"
                @click="openWithdraw"
              >
                <Ban :size="16" />
                Huỷ đơn
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Result of the last action -->
      <div
        v-if="actionMessage"
        class="px-4 py-3 rounded-xl text-sm flex items-start gap-2 border"
        :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-700 border-danger-200'"
        :role="actionMessage.type === 'success' ? 'status' : 'alert'"
      >
        <CheckCircle2 v-if="actionMessage.type === 'success'" :size="18" class="text-success-600 shrink-0 mt-px" />
        <AlertCircle v-else :size="18" class="text-danger-600 shrink-0 mt-px" />
        <span class="flex-1 min-w-0 text-pretty">{{ actionMessage.text }}</span>
        <button type="button" class="shrink-0 -m-1 p-1 rounded-lg text-ink-400 hover:text-ink-700" aria-label="Đóng thông báo" @click="actionMessage = null">
          <X :size="16" />
        </button>
      </div>

      <!-- 2. What to do now: one line, one primary button, the steps behind "Xem thêm" -->
      <FhCard v-if="nowStep" data-testid="job-now">
        <h2 class="text-lg font-semibold text-ink-900 text-balance">{{ nowStep.title }}</h2>
        <p v-if="nowStep.hint" class="mt-1 text-sm text-ink-600 text-pretty">{{ nowStep.hint }}</p>
        <p v-if="replacementSent" class="mt-3 text-sm text-success-700" role="status">
          Đã báo quản lý dịch vụ để đổi thợ. Quản lý sẽ liên hệ bạn.
        </p>

        <!-- Quotation form (inspection jobs, after check-in with a photo) -->
        <div v-if="showQuotationForm" class="mt-4 space-y-3" data-testid="quotation-form">
          <div
            v-for="(item, idx) in quotationItems"
            :key="idx"
            class="flex flex-wrap sm:flex-nowrap items-center gap-2"
          >
            <span class="shrink-0 w-20 text-xs font-medium text-ink-500 whitespace-nowrap">{{ item.type === 'LABOR' ? 'Tiền công' : 'Linh kiện' }}</span>
            <input
              v-model="item.description"
              type="text"
              placeholder="Mô tả công việc hoặc tên linh kiện..."
              :aria-label="item.type === 'LABOR' ? 'Mô tả công việc' : 'Tên linh kiện'"
              class="flex-1 min-w-0 h-10 px-3 bg-white border border-ink-200 rounded-xl text-sm"
            />
            <input
              v-model.number="item.unitPrice"
              type="number"
              step="10000"
              inputmode="numeric"
              placeholder="Đơn giá"
              aria-label="Đơn giá"
              class="w-32 h-10 px-3 bg-white border border-ink-200 rounded-xl text-sm font-num text-right"
            />
            <button
              type="button"
              class="shrink-0 w-10 h-10 rounded-xl text-ink-400 hover:text-danger-600 hover:bg-danger-50 inline-flex items-center justify-center"
              aria-label="Xoá dòng này"
              @click="removeItem(idx)"
            >
              <Trash2 :size="16" />
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="h-10 px-3 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 whitespace-nowrap" @click="addItem('LABOR')">
              <Plus :size="16" /> Thêm công thợ
            </button>
            <button type="button" class="h-10 px-3 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 whitespace-nowrap" @click="addItem('PARTS')">
              <Plus :size="16" /> Thêm linh kiện
            </button>
          </div>
          <dl class="pt-3 border-t border-ink-100 space-y-1 text-sm">
            <div class="flex justify-between gap-3 text-ink-600"><dt>Tiền công</dt><dd class="font-num whitespace-nowrap"><FhMoney :amount="laborTotal()" /></dd></div>
            <div class="flex justify-between gap-3 text-ink-600"><dt>Linh kiện</dt><dd class="font-num whitespace-nowrap"><FhMoney :amount="partsTotal()" /></dd></div>
            <div class="flex justify-between gap-3 font-semibold text-ink-900"><dt>Tổng báo giá</dt><dd class="font-num whitespace-nowrap"><FhMoney :amount="laborTotal() + partsTotal()" /></dd></div>
          </dl>
        </div>
        <button
          v-else-if="currentStepNumber === 3 && !isFixedPriceOrder && quotationSubmitted && !quotationRejected"
          type="button"
          class="mt-2 h-10 -ml-1 px-1 text-sm font-medium text-brand-700 hover:underline whitespace-nowrap"
          @click="editingQuotation = true"
        >
          Gửi lại báo giá khác
        </button>

        <!-- Payment: how the customer pays, then the cash amount -->
        <div v-if="showPaymentChoice" class="mt-4 space-y-3" data-testid="payment-choice">
          <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Khách trả bằng cách nào">
            <button
              type="button"
              role="radio"
              :aria-checked="hasCashPayment === 'YES'"
              class="h-11 px-3 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
              :class="hasCashPayment === 'YES' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
              @click="hasCashPayment = 'YES'"
            >
              <Banknote :size="16" /> Có thu tiền mặt
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="hasCashPayment === 'NO'"
              class="h-11 px-3 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
              :class="hasCashPayment === 'NO' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
              @click="hasCashPayment = 'NO'"
            >
              <Smartphone :size="16" /> Khách trả online
            </button>
          </div>
          <div v-if="hasCashPayment === 'YES'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-sm">
              <span class="block mb-1 font-medium text-ink-700">Số tiền đã thu (₫)</span>
              <input
                v-model.number="declaredCashAmount"
                type="number"
                step="10000"
                inputmode="numeric"
                placeholder="VD: 300000"
                class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl text-sm font-num text-ink-900"
              />
            </label>
            <label class="block text-sm">
              <span class="block mb-1 font-medium text-ink-700">Ghi chú</span>
              <input
                v-model="technicianCashNotes"
                type="text"
                placeholder="VD: Đã nhận đủ tiền mặt từ khách"
                class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl text-sm"
              />
            </label>
          </div>
        </div>
        <p v-if="cashSettled && !isCompleted" class="mt-2 text-sm text-ink-600">
          Đã khai báo <span class="font-num whitespace-nowrap"><FhMoney :amount="declaredCashAmount" /></span>.
        </p>

        <!-- Completed: the customer's review, if any -->
        <div v-if="isCompleted" class="mt-4 pt-4 border-t border-ink-100 space-y-2 text-sm" data-testid="customer-review">
          <template v-if="customerReview">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-0.5" :aria-label="`${customerReview.rating} trên 5 sao`">
                <Star
                  v-for="s in 5"
                  :key="s"
                  :size="16"
                  :class="s <= customerReview.rating ? 'text-warning-400 fill-warning-400' : 'text-ink-200'"
                />
              </span>
              <span class="font-num font-semibold text-ink-900 whitespace-nowrap">{{ customerReview.rating }}/5</span>
              <span v-if="customerReview.createdAt" class="text-ink-500 font-num whitespace-nowrap">{{ vnDateTimeString(customerReview.createdAt) }}</span>
            </div>
            <div v-if="parsedCustomerReview.tags.length > 0" class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in parsedCustomerReview.tags"
                :key="tag"
                class="px-2.5 py-1 rounded-full text-xs font-medium bg-ink-100 text-ink-700 whitespace-nowrap"
              >
                {{ tag }}
              </span>
            </div>
            <p v-if="parsedCustomerReview.text" class="text-ink-800 text-pretty">“{{ parsedCustomerReview.text }}”</p>
          </template>
          <p v-else class="text-ink-500">Khách chưa đánh giá.</p>
        </div>

        <div v-if="nowStep.action" class="hidden sm:flex mt-5">
          <FhButton
            variant="primary"
            :disabled="nowStep.action.disabled"
            :loading="nowStep.action.loading"
            @click="nowStep.action.run"
          >
            <component :is="nowStep.action.icon" v-if="!nowStep.action.loading" :size="16" />
            {{ nowStep.action.label }}
          </FhButton>
        </div>

        <div v-if="!isCancelled" class="mt-5 pt-3 border-t border-ink-100">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-ink-500 whitespace-nowrap">
              {{ isCompleted ? 'Đã xong 5/5 bước' : `Bước ${currentStepNumber}/5` }}
            </span>
            <button
              type="button"
              class="h-10 px-2 -mr-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1 whitespace-nowrap"
              :aria-expanded="stepsExpanded"
              aria-controls="job-steps"
              data-testid="steps-toggle"
              @click="stepsExpanded = !stepsExpanded"
            >
              {{ stepsExpanded ? 'Thu gọn' : 'Xem thêm' }}
              <ChevronDown :size="16" class="transition-transform" :class="{ 'rotate-180': stepsExpanded }" />
            </button>
          </div>
          <ol v-if="stepsExpanded" id="job-steps" class="mt-2 space-y-1" data-testid="job-steps">
            <li v-for="step in steps" :key="step.n" class="text-sm">
              <button
                type="button"
                class="w-full flex items-center gap-3 py-1.5 text-left rounded-lg disabled:cursor-default"
                :disabled="step.state === 'todo'"
                :aria-expanded="openStep === step.n"
                :data-testid="`step-row-${step.n}`"
                @click="toggleStep(step.n)"
              >
                <CheckCircle2 v-if="step.state === 'done'" :size="18" class="shrink-0 text-success-600" />
                <span v-else-if="step.state === 'current'" class="shrink-0 w-[18px] h-[18px] rounded-full border-[5px] border-brand-600" />
                <Circle v-else :size="18" class="shrink-0 text-ink-300" />
                <span
                  class="flex-1 min-w-0"
                  :class="step.state === 'current' ? 'font-semibold text-ink-900' : step.state === 'done' ? 'text-ink-600' : 'text-ink-500'"
                >
                  {{ step.label }}
                </span>
                <span v-if="step.state === 'current'" class="shrink-0 text-xs font-medium text-brand-700 whitespace-nowrap">Đang làm</span>
                <ChevronDown v-if="step.state !== 'todo'" :size="16" class="shrink-0 text-ink-400 transition-transform" :class="{ 'rotate-180': openStep === step.n }" />
              </button>
              <div v-if="openStep === step.n" class="ml-[30px] mb-2 space-y-2 text-ink-700" :data-testid="`step-detail-${step.n}`">
                <template v-if="step.n === 1">
                  <p>{{ reachedAt('en_route') ? `Xuất phát lúc ${vnDateTimeString(reachedAt('en_route')!)}` : 'Chưa xuất phát.' }}</p>
                </template>
                <template v-else-if="step.n === 2">
                  <p>{{ gpsCheckedIn ? 'Đã check-in đúng địa chỉ.' : 'Chưa check-in.' }}</p>
                  <div v-if="beforeEvidences.length" class="flex flex-wrap gap-2">
                    <button v-for="e in beforeEvidences" :key="e.id" type="button" class="w-16 h-16 rounded-lg overflow-hidden border border-ink-200" aria-label="Xem ảnh trước khi sửa" @click="previewImage(e.mediaUrl)">
                      <img :src="e.mediaUrl" alt="" class="w-full h-full object-cover" loading="lazy" />
                    </button>
                  </div>
                </template>
                <template v-else-if="step.n === 3">
                  <template v-if="isFixedPriceOrder">
                    <p>Giá cố định <span class="font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="fixedPriceTotal ?? 0" /></span>, không cần báo giá.</p>
                    <p v-if="reachedAt('under_repair')">Chuyển sang sửa lúc {{ vnDateTimeString(reachedAt('under_repair')!) }}</p>
                  </template>
                  <template v-else-if="job.quotation">
                    <p>{{ QUOTATION_STATUS[String(job.quotation.status).toLowerCase()] ?? 'Đã gửi báo giá' }}</p>
                    <ul class="space-y-0.5">
                      <li v-for="(item, i) in job.quotation.items" :key="i" class="flex justify-between gap-3">
                        <span class="min-w-0">{{ item.description }}<template v-if="item.quantity > 1"> × {{ item.quantity }}</template></span>
                        <span class="font-num whitespace-nowrap"><FhMoney :amount="item.lineTotal" /></span>
                      </li>
                    </ul>
                    <p class="flex justify-between gap-3 font-semibold text-ink-900"><span>Tổng</span><span class="font-num whitespace-nowrap"><FhMoney :amount="Number(job.quotation.laborTotal) + Number(job.quotation.partsTotal)" /></span></p>
                  </template>
                  <p v-else>Chưa gửi báo giá.</p>
                </template>
                <template v-else-if="step.n === 4">
                  <p>{{ job.completionRequestedAt ? `Hoàn thành lúc ${vnDateTimeString(job.completionRequestedAt)}` : 'Chưa hoàn thành.' }}</p>
                  <div v-if="afterEvidences.length" class="flex flex-wrap gap-2">
                    <button v-for="e in afterEvidences" :key="e.id" type="button" class="w-16 h-16 rounded-lg overflow-hidden border border-ink-200" aria-label="Xem ảnh sau khi sửa" @click="previewImage(e.mediaUrl)">
                      <img :src="e.mediaUrl" alt="" class="w-full h-full object-cover" loading="lazy" />
                    </button>
                  </div>
                </template>
                <template v-else>
                  <p class="flex justify-between gap-3"><span>Tổng tiền</span><span class="font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="job.grandTotal ?? 0" /></span></p>
                  <p>
                    {{ isPaid || isCompleted ? 'Khách đã thanh toán.' : cashSettlementStatus === 'pending_confirmation' ? 'Đã khai tiền mặt, chờ khách xác nhận.' : cashSettlementStatus === 'disputed' ? 'Khách chưa đồng ý số tiền mặt, quản lý đang xử lý.' : 'Chờ khách thanh toán.' }}
                  </p>
                </template>
              </div>
            </li>
          </ol>
        </div>
      </FhCard>

      <!-- 3. Customer and job: secondary actions appear once, here -->
      <FhCard data-testid="job-summary">
        <div class="space-y-3">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p class="text-base font-semibold text-ink-900">{{ job.customerName }}</p>
            <span v-if="job.customerPhone" class="text-sm text-ink-500 font-num whitespace-nowrap">{{ job.customerPhone }}</span>
          </div>
          <ul class="space-y-2 text-sm text-ink-700">
            <li class="flex items-start gap-2.5">
              <FileText :size="16" class="shrink-0 mt-0.5 text-ink-400" />
              <span class="min-w-0 font-medium text-ink-900">{{ job.serviceName }}</span>
            </li>
            <li class="flex items-start gap-2.5">
              <Calendar :size="16" class="shrink-0 mt-0.5 text-ink-400" />
              <span class="min-w-0">{{ sessionLabel({ bookingMode: job.bookingMode, slot: job.slot, start: job.scheduledAt }) }}</span>
            </li>
            <li class="flex items-start gap-2.5">
              <MapPin :size="16" class="shrink-0 mt-0.5 text-ink-400" />
              <span class="min-w-0 text-pretty">{{ job.addressSummary }}</span>
            </li>
          </ul>
          <p v-if="bookingDescription" class="text-sm text-ink-700 whitespace-pre-line text-pretty" data-testid="booking-description">
            <span class="text-ink-500">Khách mô tả:</span> {{ bookingDescription }}
          </p>
          <button
            v-if="aiSummary"
            type="button"
            class="h-10 px-3.5 rounded-xl border border-brand-200 bg-brand-50 text-sm font-medium text-brand-700 hover:bg-brand-100 inline-flex items-center gap-2 whitespace-nowrap"
            data-testid="ai-summary-button"
            @click="showAiSummary = true"
          >
            <Sparkles :size="16" class="shrink-0" /> Xem tóm tắt vấn đề từ AI
          </button>
          <p
            v-if="job.customerNote"
            class="text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-xl px-3 py-2 text-pretty"
            data-testid="customer-note"
          >
            Ghi chú của khách: {{ job.customerNote }}
          </p>
          <div class="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 pt-1">
            <a
              v-if="job.customerPhone"
              :href="'tel:' + job.customerPhone"
              class="h-10 min-w-0 px-1.5 sm:px-3.5 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Phone :size="16" class="shrink-0 text-ink-500 hidden min-[380px]:block" /> Gọi
            </a>
            <button
              type="button"
              class="h-10 min-w-0 px-1.5 sm:px-3.5 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              @click="handleChatWithCustomer"
            >
              <MessageSquare :size="16" class="shrink-0 text-ink-500 hidden min-[380px]:block" /> Nhắn tin
            </button>
            <a
              v-if="googleMapsUrl"
              :href="googleMapsUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="h-10 min-w-0 px-1.5 sm:px-3.5 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Navigation :size="16" class="shrink-0 text-ink-500 hidden min-[380px]:block" /> Chỉ đường
            </a>
          </div>

          <!-- Fixed price saved with the booking: no quotation for these jobs -->
          <div v-if="isFixedPriceOrder" data-testid="fixed-price-order-summary" class="pt-3 border-t border-ink-100 space-y-1.5 text-sm">
            <div v-if="fixedPriceTotal != null" data-testid="fixed-price-breakdown" class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span class="text-ink-600">Giá cố định</span>
              <span class="font-num font-semibold text-ink-900 whitespace-nowrap">
                <FhMoney :amount="fixedPriceTotal" />
                <span v-if="Number(job.quantity ?? 1) > 1" class="font-normal text-ink-500"> (<FhMoney :amount="job.fixedUnitPrice ?? 0" /> × {{ job.quantity }})</span>
              </span>
            </div>
            <p v-else role="status" class="text-danger-700">Chưa có giá cố định đã lưu. Báo quản lý dịch vụ trước khi sửa.</p>
            <p v-if="job.scopeDescription" class="text-ink-600 text-pretty">{{ job.scopeDescription }}</p>
            <p v-if="currentStepNumber <= 3 && !completionRequested" class="text-ink-500" data-testid="fixed-price-auto-start">
              Check-in có ảnh xong, đơn tự chuyển sang sửa chữa.
            </p>
          </div>

          <!-- What the customer sent with the booking -->
          <div v-if="bookingForMedia && bookingMedia.length > 0" class="pt-3 border-t border-ink-100 space-y-2">
            <p class="text-sm font-medium text-ink-700">Ảnh khách gửi</p>
            <BookingMediaViewer :booking-id="bookingMediaBookingId" :media="bookingMedia" />
          </div>
        </div>
      </FhCard>

      <!-- 4. Details needed only sometimes: one surface, collapsed rows -->
      <FhCard v-if="!isCancelled" padding="none" data-testid="job-details">
        <div class="divide-y divide-ink-100">
          <!-- Photos -->
          <section>
            <button
              type="button"
              class="w-full h-14 px-5 sm:px-6 flex items-center justify-between gap-3 text-left hover:bg-ink-25"
              :aria-expanded="sections.photos"
              aria-controls="job-photos"
              @click="sections.photos = !sections.photos"
            >
              <span class="text-base font-semibold text-ink-900">Ảnh hiện trường</span>
              <span class="flex items-center gap-2 text-sm text-ink-500 whitespace-nowrap">
                {{ beforeEvidences.length + afterEvidences.length }} ảnh
                <ChevronDown :size="18" class="transition-transform" :class="{ 'rotate-180': sections.photos }" />
              </span>
            </button>
            <div v-show="sections.photos" id="job-photos" class="px-5 sm:px-6 pb-5 space-y-4">
              <div class="space-y-2">
                <p class="text-sm font-medium text-ink-700">Trước khi sửa</p>
                <div class="flex flex-wrap gap-2.5">
                  <div
                    v-for="(img, idx) in beforeEvidences"
                    :key="img.id || idx"
                    class="relative w-20 h-20 rounded-xl overflow-hidden border border-ink-200 bg-ink-100"
                  >
                    <button type="button" class="w-full h-full" :aria-label="`Xem ảnh trước sửa ${idx + 1}`" @click="previewImage(img.mediaUrl)">
                      <img :src="img.mediaUrl" :alt="`Ảnh trước sửa ${idx + 1}`" class="w-full h-full object-cover" />
                    </button>
                    <button
                      v-if="!isCompleted"
                      type="button"
                      class="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/95 border border-ink-200 text-ink-600 hover:text-danger-600 flex items-center justify-center"
                      aria-label="Xoá ảnh này"
                      :disabled="actionLoading"
                      @click="handleDeleteEvidence(img)"
                    >
                      <X :size="12" />
                    </button>
                  </div>
                  <div
                    v-if="!isCompleted"
                    class="w-20 h-20 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors"
                    :class="!gpsCheckedIn || actionLoading ? 'border-ink-200 text-ink-400 bg-ink-25 cursor-not-allowed' : 'border-ink-300 text-ink-600 hover:border-brand-500 hover:text-brand-700 cursor-pointer'"
                    data-testid="before-evidence-picker"
                    role="button"
                    :aria-label="gpsCheckedIn ? 'Thêm ảnh trước khi sửa' : 'Check-in xong mới thêm được ảnh'"
                    :tabindex="gpsCheckedIn && !actionLoading ? 0 : -1"
                    :aria-disabled="!gpsCheckedIn || actionLoading"
                    @click="openBeforeEvidencePicker"
                    @keydown.enter.prevent="openBeforeEvidencePicker"
                    @keydown.space.prevent="openBeforeEvidencePicker"
                  >
                    <Loader2 v-if="uploadingPhase === 'BEFORE'" :size="18" class="animate-spin" />
                    <Camera v-else :size="18" />
                    Thêm
                  </div>
                </div>
              </div>
              <div v-if="currentStepNumber >= 4 || afterEvidences.length > 0" class="space-y-2">
                <p class="text-sm font-medium text-ink-700">Sau khi sửa</p>
                <div class="flex flex-wrap gap-2.5">
                  <div
                    v-for="(img, idx) in afterEvidences"
                    :key="img.id || idx"
                    class="relative w-20 h-20 rounded-xl overflow-hidden border border-ink-200 bg-ink-100"
                  >
                    <button type="button" class="w-full h-full" :aria-label="`Xem ảnh sau sửa ${idx + 1}`" @click="previewImage(img.mediaUrl)">
                      <img :src="img.mediaUrl" :alt="`Ảnh sau sửa ${idx + 1}`" class="w-full h-full object-cover" />
                    </button>
                    <button
                      v-if="!isCompleted"
                      type="button"
                      class="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/95 border border-ink-200 text-ink-600 hover:text-danger-600 flex items-center justify-center"
                      aria-label="Xoá ảnh này"
                      :disabled="actionLoading"
                      @click="handleDeleteEvidence(img)"
                    >
                      <X :size="12" />
                    </button>
                  </div>
                  <button
                    v-if="!isCompleted"
                    type="button"
                    class="w-20 h-20 rounded-xl border border-dashed border-ink-300 text-ink-600 hover:border-brand-500 hover:text-brand-700 flex flex-col items-center justify-center gap-1 text-xs font-medium disabled:opacity-50"
                    aria-label="Thêm ảnh sau khi sửa"
                    :disabled="actionLoading"
                    @click="afterFile?.click()"
                  >
                    <Loader2 v-if="uploadingPhase === 'AFTER'" :size="18" class="animate-spin" />
                    <Camera v-else :size="18" />
                    Thêm
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Parts -->
          <section>
            <button
              type="button"
              class="w-full h-14 px-5 sm:px-6 flex items-center justify-between gap-3 text-left hover:bg-ink-25"
              :aria-expanded="sections.parts"
              aria-controls="job-parts"
              @click="sections.parts = !sections.parts"
            >
              <span class="text-base font-semibold text-ink-900">Linh kiện</span>
              <span class="flex items-center gap-2 text-sm text-ink-500 whitespace-nowrap">
                <span v-if="partsSummary.needsAction" class="px-2 py-0.5 rounded-full bg-warning-50 text-warning-800 text-xs font-medium">Cần xử lý</span>
                <template v-else-if="partsSummary.count > 0">{{ partsSummary.count }} yêu cầu</template>
                <ChevronDown :size="18" class="transition-transform" :class="{ 'rotate-180': sections.parts }" />
              </span>
            </button>
            <div v-show="sections.parts" id="job-parts" class="px-5 sm:px-6 pb-5">
              <TechnicianPartsSection
                :order-id="job.id"
                :order-status="job.status"
                @parts-updated="loadJob(jobId, { silent: true })"
                @summary="onPartsSummary"
              />
            </div>
          </section>

          <!-- Additional costs: only once the repair has started -->
          <section v-if="isRepairing || isCompleted">
            <button
              type="button"
              class="w-full h-14 px-5 sm:px-6 flex items-center justify-between gap-3 text-left hover:bg-ink-25"
              :aria-expanded="sections.extra"
              aria-controls="job-extra-costs"
              @click="sections.extra = !sections.extra"
            >
              <span class="text-base font-semibold text-ink-900">Chi phí phát sinh</span>
              <span class="flex items-center gap-2 text-sm text-ink-500 whitespace-nowrap">
                <template v-if="additionalCosts.length > 0">{{ additionalCosts.length }} yêu cầu</template>
                <ChevronDown :size="18" class="transition-transform" :class="{ 'rotate-180': sections.extra }" />
              </span>
            </button>
            <div v-show="sections.extra" id="job-extra-costs" class="px-5 sm:px-6 pb-5 space-y-3 text-sm">
              <ul v-if="additionalCosts.length > 0" class="divide-y divide-ink-100">
                <li v-for="cost in additionalCosts" :key="cost.id" class="py-3 first:pt-0 space-y-1">
                  <div class="flex items-center justify-between gap-3">
                    <FhStatusPill :status="cost.status" :label="AC_STATUS_LABELS[cost.status]" />
                    <span class="font-num font-semibold text-ink-900 whitespace-nowrap">
                      <FhMoney :amount="Number(cost.totalLaborDelta) + Number(cost.totalPartsDelta)" />
                    </span>
                  </div>
                  <p class="text-ink-600 text-pretty">{{ cost.reason }}</p>
                  <button
                    v-if="['REJECTED', 'EXPIRED'].includes(cost.status) && isRepairing"
                    type="button"
                    class="h-10 -ml-1 px-1 text-sm font-medium text-brand-700 hover:underline whitespace-nowrap"
                    @click="openAdditionalCostForm(cost)"
                  >
                    Sửa và gửi lại
                  </button>
                </li>
              </ul>
              <p v-else-if="!showAdditionalCostForm" class="text-ink-500">Chưa có chi phí phát sinh.</p>

              <FhButton
                v-if="!showAdditionalCostForm && isRepairing"
                variant="secondary"
                size="sm"
                @click="openAdditionalCostForm()"
              >
                <Plus :size="14" /> Tạo chi phí phát sinh
              </FhButton>

              <!-- Additional cost form -->
              <div v-if="showAdditionalCostForm" class="space-y-3 pt-3 border-t border-ink-100">
                <label class="block">
                  <span class="block mb-1 font-medium text-ink-700">Lý do phát sinh</span>
                  <textarea
                    v-model="acReason"
                    rows="2"
                    placeholder="Ví dụ: hỏng thêm quạt dàn nóng"
                    class="w-full p-3 bg-white border border-ink-200 rounded-xl text-sm"
                  ></textarea>
                </label>

                <div class="space-y-2">
                  <div
                    v-for="(item, idx) in acItems"
                    :key="idx"
                    class="flex flex-wrap sm:flex-nowrap items-center gap-2"
                  >
                    <select
                      v-if="item.type === 'PARTS'"
                      v-model="item.partSource"
                      aria-label="Nguồn linh kiện"
                      class="shrink-0 w-32 h-10 px-2 bg-white border border-ink-200 rounded-xl text-sm"
                      @change="if (item.partSource === 'fixhome' && !item.partCatalogId) openAcPartPicker(idx);"
                    >
                      <option value="fixhome">Kho FixHome</option>
                      <option value="technician">Thợ tự có</option>
                      <option value="external">Mua ngoài</option>
                    </select>
                    <span v-else class="shrink-0 w-32 text-xs font-medium text-ink-500 whitespace-nowrap">Tiền công</span>

                    <!-- FixHome part picked from the catalog -->
                    <div
                      v-if="item.type === 'PARTS' && item.partSource === 'fixhome' && item.partCatalogId"
                      class="flex-1 min-w-0 flex items-center justify-between gap-2"
                    >
                      <span class="min-w-0 truncate font-medium text-ink-900" :title="item.warrantyPolicy || item.description">{{ item.description }}</span>
                      <span class="shrink-0 inline-flex items-center gap-1 text-xs text-success-700 whitespace-nowrap">
                        <ShieldCheck :size="12" /> {{ formatAcWarrantyBadge(item.warrantyDays) }}
                      </span>
                      <button type="button" class="shrink-0 h-10 px-2 text-sm font-medium text-brand-700 hover:underline whitespace-nowrap" @click="openAcPartPicker(idx)">
                        Đổi
                      </button>
                    </div>
                    <button
                      v-else-if="item.type === 'PARTS' && item.partSource === 'fixhome' && !item.partCatalogId"
                      type="button"
                      class="flex-1 min-w-0 h-10 px-3 rounded-xl border border-dashed border-ink-300 text-ink-700 hover:border-brand-500 hover:text-brand-700 text-sm font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      @click="openAcPartPicker(idx)"
                    >
                      <Search :size="14" /> Chọn linh kiện FixHome
                    </button>
                    <input
                      v-else
                      v-model="item.description"
                      type="text"
                      :placeholder="item.type === 'LABOR' ? 'Mô tả công việc phát sinh' : 'Tên linh kiện'"
                      :aria-label="item.type === 'LABOR' ? 'Mô tả công việc phát sinh' : 'Tên linh kiện'"
                      class="flex-1 min-w-0 h-10 px-3 bg-white border border-ink-200 rounded-xl text-sm"
                    />

                    <input
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      inputmode="numeric"
                      aria-label="Số lượng"
                      class="shrink-0 w-14 h-10 px-2 bg-white border border-ink-200 rounded-xl text-sm text-center font-num"
                    />
                    <span
                      v-if="item.partSource === 'fixhome' && item.partCatalogId"
                      class="shrink-0 w-28 text-right font-num text-ink-900 whitespace-nowrap"
                    >
                      <FhMoney :amount="item.unitPrice" />
                    </span>
                    <input
                      v-else
                      v-model.number="item.unitPrice"
                      type="number"
                      step="10000"
                      inputmode="numeric"
                      placeholder="Đơn giá"
                      aria-label="Đơn giá"
                      class="shrink-0 w-28 h-10 px-3 bg-white border border-ink-200 rounded-xl text-sm font-num text-right"
                    />
                    <button
                      type="button"
                      class="shrink-0 w-10 h-10 rounded-xl text-ink-400 hover:text-danger-600 hover:bg-danger-50 inline-flex items-center justify-center"
                      aria-label="Xoá dòng này"
                      @click="removeAcItem(idx)"
                    >
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button type="button" class="h-10 px-3 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 whitespace-nowrap" @click="addAcItem('LABOR')">
                    <Plus :size="16" /> Tiền công
                  </button>
                  <button type="button" class="h-10 px-3 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 whitespace-nowrap" @click="addAcItem('PARTS', 'fixhome')">
                    <Plus :size="16" /> Linh kiện FixHome
                  </button>
                  <button type="button" class="h-10 px-3 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 whitespace-nowrap" @click="addAcItem('PARTS', 'external')">
                    <Plus :size="16" /> Linh kiện mua ngoài
                  </button>
                </div>

                <!-- How FixHome parts reach the technician -->
                <div v-if="acItems.some((i) => i.type === 'PARTS' && i.partSource === 'fixhome')" class="space-y-2">
                  <p class="font-medium text-ink-700">Nhận linh kiện FixHome</p>
                  <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <label class="inline-flex items-center gap-2 min-h-10 cursor-pointer">
                      <input v-model="acFulfillmentMethod" type="radio" value="pickup" />
                      <span class="text-ink-700">Tự lấy tại kho</span>
                    </label>
                    <label class="inline-flex items-center gap-2 min-h-10 cursor-pointer">
                      <input v-model="acFulfillmentMethod" type="radio" value="delivery" />
                      <span class="text-ink-700">Giao tới nơi</span>
                    </label>
                    <label v-if="acFulfillmentMethod === 'delivery'" class="inline-flex items-center gap-2">
                      <span class="text-ink-600 whitespace-nowrap">Phí giao (₫)</span>
                      <input
                        v-model.number="acShippingFee"
                        type="number"
                        step="5000"
                        inputmode="numeric"
                        class="w-28 h-10 px-3 bg-white border border-ink-200 rounded-xl text-sm font-num"
                      />
                    </label>
                  </div>
                </div>

                <p
                  v-if="acItems.some((i) => i.partSource === 'external')"
                  class="px-3 py-2 rounded-xl bg-warning-50 border border-warning-200 text-warning-800 flex items-start gap-2"
                >
                  <AlertTriangle :size="16" class="text-warning-600 mt-0.5 shrink-0" />
                  <span class="text-pretty">Linh kiện mua ngoài không được FixHome bảo hành. Khách phải đồng ý điều này khi duyệt.</span>
                </p>

                <div class="space-y-1.5">
                  <p class="font-medium text-ink-700">Ảnh (không bắt buộc)</p>
                  <div class="flex items-center gap-2 flex-wrap">
                    <img v-for="url in acEvidenceUrls" :key="url" :src="url" alt="Ảnh chi phí phát sinh" class="w-14 h-14 rounded-xl object-cover border border-ink-200" />
                    <button
                      type="button"
                      class="w-14 h-14 rounded-xl border border-dashed border-ink-300 hover:border-brand-500 flex items-center justify-center text-ink-500"
                      aria-label="Thêm ảnh chi phí phát sinh"
                      :disabled="acUploading"
                      @click="acFile?.click()"
                    >
                      <Loader2 v-if="acUploading" :size="18" class="animate-spin" />
                      <Camera v-else :size="18" />
                    </button>
                    <input
                      ref="acFile"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      class="hidden"
                      @change="handleUploadAcEvidence(($event.target as HTMLInputElement).files?.[0])"
                    />
                  </div>
                </div>

                <div class="pt-3 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3">
                  <p class="text-ink-600 whitespace-nowrap">
                    Tổng phát sinh:
                    <span class="font-num font-semibold text-ink-900">
                      <FhMoney
                        :amount="
                          acLaborTotal() +
                          acPartsTotal() +
                          (acFulfillmentMethod === 'delivery' && acItems.some((i) => i.type === 'PARTS')
                            ? Number(acShippingFee || 0)
                            : 0)
                        "
                      />
                    </span>
                  </p>
                  <div class="flex gap-2">
                    <FhButton variant="ghost" size="sm" @click="showAdditionalCostForm = false">Huỷ</FhButton>
                    <FhButton
                      variant="primary"
                      size="sm"
                      :disabled="acSubmitting || acUploading"
                      :loading="acSubmitting"
                      @click="handleSubmitAdditionalCost"
                    >
                      Gửi cho khách duyệt
                    </FhButton>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </FhCard>

      <!-- Reports already sent; the form opens from the "Thêm" menu -->
      <OrderComplaintPanel
        ref="complaintPanel"
        :order-id="job.id"
        :order-status="job.status"
        :completed-at="job.completedAt"
        role="technician"
        inline
      />
    </template>

    <!-- Phones: the one primary action sits above the tab bar, always in reach -->
    <div
      v-if="job && nowStep?.action && !historicalJob && !loading"
      class="sm:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 bg-white border-t border-ink-200 px-4 py-3"
      data-testid="job-action-bar"
    >
      <FhButton
        variant="primary"
        block
        :disabled="nowStep.action.disabled"
        :loading="nowStep.action.loading"
        @click="nowStep.action.run"
      >
        <component :is="nowStep.action.icon" v-if="!nowStep.action.loading" :size="16" />
        {{ nowStep.action.label }}
      </FhButton>
    </div>

    <AiSummaryDialog
      v-if="aiSummary"
      :open="showAiSummary"
      :summary="aiSummary"
      :description="bookingDescription"
      :booking-id="bookingMediaBookingId"
      :media="bookingMedia"
      @close="showAiSummary = false"
    />

    <!-- Dialog: cancel the order -->
    <div
      v-if="showWithdrawModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink-900/50"
      @click.self="!withdrawing && (showWithdrawModal = false)"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        class="bg-white rounded-t-[20px] sm:rounded-[20px] shadow-(--shadow-e3) w-full sm:max-w-md p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain"
        data-testid="cancel-order-dialog"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 id="cancel-order-title" class="text-lg font-bold text-ink-900">Huỷ đơn sửa chữa?</h3>
            <p class="mt-1 text-sm text-danger-700">Huỷ đơn sẽ bị trừ điểm uy tín.</p>
          </div>
          <button type="button" class="shrink-0 -m-1 p-2 rounded-lg text-ink-400 hover:text-ink-700" aria-label="Đóng" :disabled="withdrawing" @click="showWithdrawModal = false">
            <X :size="18" />
          </button>
        </div>

        <fieldset class="space-y-1.5 text-sm">
          <legend class="mb-2 font-medium text-ink-800">Lý do</legend>
          <label
            v-for="r in WITHDRAW_REASONS"
            :key="r"
            class="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer"
            :class="withdrawReason === r ? 'border-brand-600 bg-brand-50 text-ink-900' : 'border-ink-200 bg-white text-ink-700'"
          >
            <input v-model="withdrawReason" type="radio" :value="r" class="mt-0.5" />
            <span>{{ r }}</span>
          </label>
          <textarea
            v-if="withdrawReason === 'Lý do khác (tự nhập)'"
            v-model="customWithdrawReason"
            rows="2"
            aria-label="Lý do khác"
            placeholder="Ghi lý do"
            class="mt-1 w-full p-3 bg-white border border-ink-200 rounded-xl text-sm"
          ></textarea>
        </fieldset>

        <p v-if="withdrawError" role="alert" class="text-sm text-danger-700">{{ withdrawError }}</p>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <FhButton variant="secondary" :disabled="withdrawing" @click="showWithdrawModal = false">Giữ lại đơn</FhButton>
          <FhButton variant="danger" :loading="withdrawing" :disabled="withdrawing" @click="handleWithdrawOrder">Huỷ đơn sửa chữa</FhButton>
        </div>
      </div>
    </div>

    <!-- Dialog: ask the manager for another technician -->
    <div
      v-if="replacementOpen"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink-900/50"
      @click.self="!replacementSending && (replacementOpen = false)"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="replacement-title"
        class="bg-white rounded-t-[20px] sm:rounded-[20px] shadow-(--shadow-e3) w-full sm:max-w-md p-5 sm:p-6 space-y-4"
        data-testid="replacement-card"
      >
        <div>
          <h3 id="replacement-title" class="text-lg font-bold text-ink-900">Cần thay đổi thợ</h3>
          <p class="mt-1 text-sm text-ink-600">Việc nằm ngoài kỹ năng của bạn? Quản lý sẽ xem xét, không tự trừ điểm.</p>
        </div>
        <textarea
          v-model="replacementReason"
          rows="3"
          maxlength="1000"
          aria-label="Lý do cần thay đổi thợ"
          class="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
          placeholder="Ví dụ: máy công nghiệp, cần thợ điện lạnh công nghiệp"
        />
        <p v-if="replacementError" class="text-sm text-danger-700" role="alert">{{ replacementError }}</p>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <FhButton variant="secondary" :disabled="replacementSending" @click="replacementOpen = false">Đóng</FhButton>
          <FhButton :loading="replacementSending" @click="sendReplacement">Gửi cho quản lý</FhButton>
        </div>
      </div>
    </div>

    <!-- Photo preview -->
    <div
      v-if="previewModalUrl"
      class="fixed inset-0 z-50 bg-ink-900/85 flex items-center justify-center p-4"
      @click.self="previewModalUrl = null"
    >
      <div role="dialog" aria-modal="true" aria-label="Xem ảnh" class="relative max-w-3xl w-full bg-white rounded-[20px] overflow-hidden p-3 space-y-3">
        <div class="flex items-center justify-end gap-2">
          <FhButton
            v-if="activePreviewEvidence && !isCompleted"
            variant="ghost"
            size="sm"
            :disabled="actionLoading"
            @click="handleDeleteEvidence(activePreviewEvidence)"
          >
            <Trash2 :size="14" /> Xoá ảnh
          </FhButton>
          <button
            type="button"
            class="w-10 h-10 rounded-full bg-ink-100 hover:bg-ink-200 text-ink-700 flex items-center justify-center"
            aria-label="Đóng"
            @click="previewModalUrl = null"
          >
            <X :size="18" />
          </button>
        </div>
        <div class="flex items-center justify-center bg-ink-50 rounded-xl overflow-hidden max-h-[78vh]">
          <img :src="previewModalUrl" alt="Ảnh phóng to" class="max-h-[76vh] max-w-full object-contain" />
        </div>
      </div>
    </div>

    <!-- Picker: a FixHome part for an additional cost -->
    <div
      v-if="showAcPartPicker"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink-900/50"
      @click.self="showAcPartPicker = false"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="part-picker-title" class="bg-white rounded-t-[20px] sm:rounded-[20px] shadow-(--shadow-e3) w-full sm:max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
          <h3 id="part-picker-title" class="text-lg font-bold text-ink-900">Chọn linh kiện FixHome</h3>
          <button type="button" class="w-10 h-10 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center" aria-label="Đóng" @click="showAcPartPicker = false">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 pt-3 space-y-3">
          <div class="relative">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              v-model="acPartSearchQuery"
              type="text"
              placeholder="Tên linh kiện, mã hoặc hãng"
              aria-label="Tìm linh kiện"
              class="w-full h-11 pl-9 pr-10 bg-white border border-ink-200 rounded-xl text-sm"
              @input="onAcPartSearchInput"
            />
            <button
              v-if="acPartSearchQuery"
              type="button"
              class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg text-ink-400 hover:text-ink-700 flex items-center justify-center"
              aria-label="Xoá tìm kiếm"
              @click="clearAcSearch"
            >
              <X :size="14" />
            </button>
          </div>
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3">
            <button
              v-for="cat in AC_CATEGORY_TABS"
              :key="cat.value"
              type="button"
              class="h-9 px-3 rounded-full text-sm font-medium shrink-0 whitespace-nowrap border"
              :class="acPartActiveCategory === cat.value ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'"
              @click="selectAcCategory(cat.value)"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto border-t border-ink-100">
          <div v-if="isAcPartSearching" class="p-5 space-y-3" aria-busy="true" aria-label="Đang tìm linh kiện">
            <FhSkeleton height="48px" rounded="md" :count="3" />
          </div>
          <p v-else-if="acPartSearchResults.length === 0" class="p-8 text-center text-sm text-ink-500">
            Không tìm thấy linh kiện phù hợp.
          </p>
          <ul v-else class="divide-y divide-ink-100">
            <li v-for="part in acPartSearchResults" :key="part.id">
              <button
                type="button"
                class="w-full px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-ink-25"
                @click="selectPartForAc(part)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-medium text-ink-900 truncate">{{ part.name }}</span>
                  <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                    <span v-if="part.sku" class="font-num whitespace-nowrap">{{ part.sku }}</span>
                    <span class="inline-flex items-center gap-1 text-success-700 whitespace-nowrap"><ShieldCheck :size="12" /> {{ formatAcWarrantyBadge(part.warrantyDays) }}</span>
                  </span>
                </span>
                <span class="shrink-0 font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="part.sellingPrice" /></span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
