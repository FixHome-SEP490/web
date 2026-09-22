<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  MapPin,
  Camera,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Phone,
  Plus,
  Trash2,
  Navigation,
  DollarSign,
  AlertCircle,
  MessageSquare,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhCostBreakdown,
  FhMoney,
  BookingMediaViewer,
} from '../../components';
import PartsQuoteDemoPreview from '../../components/PartsQuoteDemoPreview.vue';
import { ordersApi, isHistoricalOrder, type HistoricalOrderItem, type ServiceOrderItem, type QuotationItemPayload, type AdditionalCostRecord } from '../../api/orders.api';
import { bookingsApi, isFullBookingWithMedia, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { mediaApi } from '../../api/media.api';
import { useChatStore } from '../../stores/chat.store';

const showPartsDemo = import.meta.env.DEV;
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
let jobId = String(route.params.id ?? '');
let loadGeneration = 0;
let disposed = false;

const loading = ref(true);
const actionLoading = ref(false);
const job = ref<ServiceOrderItem | null>(null);
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

// Workspace Steps State
const isEnRoute = ref(false);
const gpsCheckedIn = ref(false);
const beforePhotoUploaded = ref(false);
const quotationSubmitted = ref(false);
const afterPhotoUploaded = ref(false);
const isCompleted = ref(false);

// Cash Settlement State
const declaredCashAmount = ref<number>(0);
const technicianCashNotes = ref('');
const cashSettled = ref(false);
const cashSettlementStatus = ref<'pending_confirmation' | 'confirmed' | 'disputed' | null>(null);

// Quotation Items Form (D-02 Standard)
const quotationItems = ref<QuotationItemPayload[]>([{type:'LABOR',description:'',quantity:1,unitPrice:0}]);

// Additional Cost (Chi phí phát sinh)
const additionalCosts = ref<AdditionalCostRecord[]>([]);
const showAdditionalCostForm = ref(false);
const acReviseId = ref<string | null>(null);
const acReason = ref('');
const acItems = ref<QuotationItemPayload[]>([{type:'LABOR',description:'',quantity:1,unitPrice:0}]);
const acEvidenceUrls = ref<string[]>([]);
const acFile = ref<HTMLInputElement | null>(null);
const acUploading = ref(false);
const acSubmitting = ref(false);

const completionRequested = ref(false);
const beforeFile = ref<HTMLInputElement | null>(null);
const afterFile = ref<HTMLInputElement | null>(null);
async function uploadSelectedEvidence(phase: 'BEFORE' | 'AFTER', file?: File) {
  if (!file) return;
  actionLoading.value = true;
  try {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024) throw new Error('Invalid image');
    await ordersApi.uploadEvidence(jobId,{phase,file});
    await loadJob();
    actionMessage.value = {type:'success',text:'Đã lưu ảnh bằng chứng.'};
  } catch { actionMessage.value = {type:'error',text:'Chưa lưu được ảnh. Chọn JPEG, PNG hoặc WebP dưới 10 MB và thử lại.'}; }
  finally { actionLoading.value = false; }
}

onMounted(() => {
  disposed = false;
  void loadJob(jobId);
});

const loadJob = async (requestedJobId = jobId) => {
    const generation = ++loadGeneration;
    const isCurrent = () => !disposed && generation === loadGeneration && requestedJobId === jobId;
    loading.value = true;
    bookingForMedia.value = null;
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
      isEnRoute.value = data.status !== 'ACCEPTED';
      gpsCheckedIn.value = !!data.arrivalVerified;
      if (data.status === 'EN_ROUTE' && !data.arrivalVerified) startLocationPing();
      else stopLocationPing();
      beforePhotoUploaded.value = Number(data.beforeEvidenceCount) > 0;
      afterPhotoUploaded.value = Number(data.afterEvidenceCount) > 0;
      isCompleted.value = data.status === 'COMPLETED';
      completionRequested.value = !!data.completionRequestedAt;
      quotationSubmitted.value = !!data.quotation;
      declaredCashAmount.value = Number(data.grandTotal);

      const bookingId = typeof data.bookingId === 'string' ? data.bookingId.trim() : '';
      if (bookingId) {
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
      cashSettlementStatus.value = settlement?.status as typeof cashSettlementStatus.value || null;
      if (data.status === 'UNDER_REPAIR' || data.status === 'COMPLETED') {
        const costs = await ordersApi.getAdditionalCosts(requestedJobId);
        if (!isCurrent()) return;
        additionalCosts.value = costs;
      }
    } catch {
      if (isCurrent()) actionMessage.value = {type:'error', text:'Không thể tải công việc. Vui lòng thử lại.'};
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };

watch(() => String(route.params.id ?? ''), (nextId, previousId) => {
  if (!nextId || nextId === previousId) return;
  jobId = nextId;
  bookingForMedia.value = null;
  void loadJob(nextId);
});

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
    ...(type === 'PARTS' ? {partSource: 'technician' as const, partWarrantyOption: 'no_warranty' as const} : {}),
  });
};

const removeItem = (idx: number) => {
  quotationItems.value.splice(idx, 1);
};

let locationPing: ReturnType<typeof setInterval> | null = null;
const stopLocationPing = () => { if (locationPing) { clearInterval(locationPing); locationPing = null; } };
const startLocationPing = () => {
  stopLocationPing();
  const ping = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        ordersApi.updateLocation(jobId, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        }).catch(() => { /* transient network error, next ping retries */ });
      },
      () => { /* location unavailable this tick, next ping retries */ },
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
});

const handleEnRoute = async () => {
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    await ordersApi.enRoute(jobId);
    isEnRoute.value = true;
    if (job.value) job.value.status = 'EN_ROUTE';
    startLocationPing();
    actionMessage.value = { type: 'success', text: 'Đã cập nhật: Đang trên đường tới nhà khách!' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể chuyển trạng thái đang di chuyển' };
  } finally {
    actionLoading.value = false;
  }
};

const handleCheckIn = async () => {
    actionLoading.value = true;
    try {
      if (!navigator.geolocation) throw new Error('Thiết bị không hỗ trợ định vị.');
      const position = await new Promise<GeolocationPosition>((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:10000,enableHighAccuracy:true}));
      const result = await ordersApi.checkIn(jobId,{lat:position.coords.latitude,lng:position.coords.longitude,accuracyMeters:position.coords.accuracy});
      if (result.result !== 'valid') throw new Error('Vị trí chưa đủ chính xác hoặc ngoài phạm vi địa chỉ.');
      gpsCheckedIn.value = true;
      stopLocationPing();
      actionMessage.value = {type:'success',text:'Đã xác nhận vị trí đến nơi.'};
    } catch { actionMessage.value = {type:'error',text:'Chưa xác nhận được vị trí. Hãy cấp quyền GPS và thử lại tại địa chỉ sửa chữa.'}; }
    finally { actionLoading.value = false; }
  };

const openBeforeEvidencePicker = () => {
  if (gpsCheckedIn.value && !beforePhotoUploaded.value && !actionLoading.value) beforeFile.value?.click();
};
const handleUploadBefore = async () => uploadSelectedEvidence('BEFORE', beforeFile.value?.files?.[0]);

const handleSubmitQuotation = async () => {
    actionLoading.value = true;
    try { await ordersApi.submitQuotation(jobId, quotationItems.value); quotationSubmitted.value = true;
      actionMessage.value = {type:'success',text:'Đã gửi báo giá, chờ khách duyệt.'};
    } catch { actionMessage.value = {type:'error',text:'Chưa gửi được báo giá. Kiểm tra nội dung, giá và trạng thái đơn.'}; }
    finally { actionLoading.value = false; }
  };

const acLaborTotal = () => acItems.value.filter((i) => i.type === 'LABOR').reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
const acPartsTotal = () => acItems.value.filter((i) => i.type === 'PARTS').reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
const addAcItem = (type: 'LABOR' | 'PARTS') => {
  acItems.value.push({ type, description: type === 'LABOR' ? 'Hạng mục công phát sinh' : 'Tên linh kiện phát sinh', quantity: 1, unitPrice: 0 });
};
const removeAcItem = (idx: number) => acItems.value.splice(idx, 1);

function openAdditionalCostForm(revise?: AdditionalCostRecord) {
  acReviseId.value = revise?.id ?? null;
  acReason.value = revise?.reason ?? '';
  acItems.value = revise
    ? revise.items.map((i) => ({ type: i.type === 'LABOR' ? 'LABOR' : 'PARTS', description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }))
    : [{ type: 'LABOR', description: '', quantity: 1, unitPrice: 0 }];
  acEvidenceUrls.value = revise?.evidenceUrls ? [...revise.evidenceUrls] : [];
  showAdditionalCostForm.value = true;
}

async function handleUploadAcEvidence(file?: File) {
  if (!file) return;
  acUploading.value = true;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Invalid image');
    const media = await mediaApi.upload(file);
    acEvidenceUrls.value.push(media.url);
  } catch {
    actionMessage.value = { type: 'error', text: 'Chưa tải được ảnh bằng chứng. Chọn JPEG/PNG/WebP dưới 10 MB.' };
  } finally {
    acUploading.value = false;
  }
}

async function handleSubmitAdditionalCost() {
  if (!acReason.value.trim()) {
    actionMessage.value = { type: 'error', text: 'Vui lòng mô tả lý do phát sinh.' };
    return;
  }
  acSubmitting.value = true;
  try {
    const body = { reason: acReason.value.trim(), items: acItems.value, evidenceUrls: acEvidenceUrls.value };
    const saved = acReviseId.value
      ? await ordersApi.reviseAdditionalCost(acReviseId.value, body)
      : await ordersApi.createAdditionalCost(jobId, body);
    additionalCosts.value = [saved, ...additionalCosts.value.filter((c) => c.id !== acReviseId.value)];
    showAdditionalCostForm.value = false;
    actionMessage.value = { type: 'success', text: 'Đã gửi yêu cầu chi phí phát sinh, chờ khách duyệt.' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể gửi yêu cầu chi phí phát sinh.' };
  } finally {
    acSubmitting.value = false;
  }
}

const handleStartRepair = async () => {
  try {
    actionLoading.value = true;
    actionMessage.value = null;
    await ordersApi.startRepair(jobId);
    if (job.value) job.value.status = 'UNDER_REPAIR';
    actionMessage.value = { type: 'success', text: 'Bắt đầu sửa chữa! Trạng thái: UNDER_REPAIR' };
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Chưa thể bắt đầu sửa chữa.' };
  } finally {
    actionLoading.value = false;
  }
};

const handleUploadAfter = async () => uploadSelectedEvidence('AFTER', afterFile.value?.files?.[0]);

const handleCompleteOrder = async () => {
    actionLoading.value = true;
    try {
      await ordersApi.completeRepair(jobId,{completionNote:'Hoàn tất công việc, đề nghị nghiệm thu'});
      await loadJob();
      actionMessage.value = {type:'success',text:'Đã yêu cầu nghiệm thu. Chờ khách xác nhận dịch vụ và thanh toán.'};
    } catch { actionMessage.value = {type:'error',text:'Chưa thể yêu cầu nghiệm thu. Kiểm tra ảnh sau sửa và chi phí chờ duyệt.'}; }
    finally { actionLoading.value = false; }
  };

const handleDeclareCash = async () => {
  if (!declaredCashAmount.value || declaredCashAmount.value <= 0) {
    actionMessage.value = { type: 'error', text: 'Vui lòng nhập số tiền mặt đã thu từ khách!' };
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
    cashSettlementStatus.value = String(res.status || 'pending_confirmation') as
      | 'pending_confirmation'
      | 'confirmed'
      | 'disputed';
    actionMessage.value = {
      type: 'success',
      text: 'Đã gửi khai báo thu tiền mặt! Chờ khách hàng bấm xác nhận trên ứng dụng.',
    };
  } catch (err) {
    actionMessage.value = { type: 'error', text: (err as Error)?.message || 'Không thể khai báo thu tiền mặt.' };
  } finally {
    actionLoading.value = false;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-16">
    <input ref="beforeFile" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleUploadBefore" />
    <input ref="afterFile" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleUploadAfter" />
    <!-- Top Navigation -->
    <div class="flex items-center justify-between">
      <button
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors"
        @click="router.push('/tech/jobs')"
      >
        <ArrowLeft :size="14" /> Quay lại danh sách việc
      </button>

      <FhStatusPill v-if="job" :status="job.status" />
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
      Đang tải dữ liệu công việc...
    </div>

    <div v-else-if="historicalJob" data-testid="technician-historical-detail"
      class="rounded-2xl border border-ink-200 bg-white p-5 space-y-3">
      <h1 class="text-base font-bold text-ink-900">Lịch sử công việc: {{ historicalJob.code }}</h1>
      <p class="text-sm text-ink-700">Trạng thái: {{ historicalJob.status }}</p>
      <p class="text-xs text-ink-600">Ngày ghi nhận: {{ new Date(historicalJob.createdAt).toLocaleDateString('vi-VN') }}</p>
      <p class="text-xs text-ink-500">Bạn không còn được giao đơn này. Thông tin riêng tư của khách và các thao tác thực hiện công việc không còn khả dụng.</p>
    </div>

    <div v-else-if="job" class="space-y-6">
      <!-- Order Info Banner -->
      <FhCard>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
            <div>
              <p class="text-[11px] font-mono text-ink-400">MÃ ĐƠN HÀNG: {{ job.code }}</p>
              <h1 class="text-base font-bold text-ink-900 mt-0.5">{{ job.customerName }}</h1>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-xs"
                @click="handleChatWithCustomer"
              >
                <MessageSquare :size="13" /> Nhắn tin cho khách
              </button>
              <a
                v-if="job.customerPhone"
                :href="'tel:' + job.customerPhone"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100 transition-colors"
              >
                <Phone :size="13" /> {{ job.customerPhone }}
              </a>
            </div>
          </div>

          <div class="space-y-1 text-xs sm:text-sm">
            <h2 class="font-bold text-ink-900">{{ job.serviceName }}</h2>
            <p class="text-xs text-ink-600 flex items-center gap-1.5">
              <MapPin :size="14" class="text-brand-600 shrink-0" />
              {{ job.addressSummary }}
            </p>
          </div>
        </div>
      </FhCard>

      <BookingMediaViewer
        v-if="bookingForMedia && bookingMedia.length > 0"
        :booking-id="bookingMediaBookingId"
        :media="bookingMedia"
      />

      <!-- Workspace Workflow Stepper -->
      <div class="space-y-5">
        <h3 class="text-base font-bold text-ink-900">Quy trình Thực thi Tiêu chuẩn (Spec v1.2)</h3>

        <!-- Phase 0: En Route -->
        <FhCard title="1. Khởi hành đến nhà khách (En Route)">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
            <p class="text-ink-600 max-w-md">
              Cập nhật trạng thái khi bắt đầu di chuyển để khách hàng theo dõi thời gian dự kiến tới nơi.
            </p>

            <FhButton
              :variant="isEnRoute ? 'secondary' : 'primary'"
              size="sm"
              :disabled="isEnRoute || actionLoading"
              @click="handleEnRoute"
            >
              <CheckCircle2 v-if="isEnRoute" :size="15" class="mr-1.5 text-success-600" />
              <Navigation v-else :size="15" class="mr-1.5" />
              {{ isEnRoute ? 'Đang trên đường di chuyển' : 'Bấm Bắt đầu di chuyển' }}
            </FhButton>
          </div>
        </FhCard>

        <!-- Phase 1: GPS Check-In -->
        <FhCard title="2. Xác nhận có mặt tại hiện trường (GPS Geofence Check-in)">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
            <p class="text-ink-600 max-w-md">
              Bắt buộc check-in GPS trong bán kính ≤ 200m từ địa chỉ khách để mở khoá chụp ảnh hiện trạng và lập báo giá.
            </p>

            <FhButton
              :variant="gpsCheckedIn ? 'secondary' : 'primary'"
              size="sm"
              :disabled="gpsCheckedIn || !isEnRoute || actionLoading"
              @click="handleCheckIn"
            >
              <CheckCircle2 v-if="gpsCheckedIn" :size="15" class="mr-1.5 text-success-600" />
              <MapPin v-else :size="15" class="mr-1.5" />
              {{ gpsCheckedIn ? 'Đã check-in thành công' : 'Bấm Check-in GPS' }}
            </FhButton>
          </div>
        </FhCard>

        <!-- Phase 2: Evidence BEFORE -->
        <FhCard title="3. Bằng chứng hiện trạng lỗi (Evidence Gating BEFORE)">
          <div class="space-y-3 text-xs">
            <p class="text-ink-600">
              Quy chuẩn bắt buộc: Phải có ít nhất 1 ảnh BEFORE trước khi lập báo giá nhằm tránh tranh chấp.
            </p>

            <div class="flex items-center gap-4">
              <div
                class="w-24 h-24 rounded-[var(--radius-sm)] border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                :class="beforePhotoUploaded ? 'border-success-500 bg-success-50/50 text-success-700' : (!gpsCheckedIn ? 'border-ink-200 text-ink-300 cursor-not-allowed' : 'border-ink-300 hover:border-brand-500 text-ink-500')"
                data-testid="before-evidence-picker"
                role="button"
                :tabindex="gpsCheckedIn && !beforePhotoUploaded && !actionLoading ? 0 : -1"
                :aria-disabled="!gpsCheckedIn || beforePhotoUploaded || actionLoading"
                @click="openBeforeEvidencePicker"
                @keydown.enter.prevent="openBeforeEvidencePicker"
                @keydown.space.prevent="openBeforeEvidencePicker"
              >
                <Camera :size="22" />
                <span class="text-[10px] font-semibold">{{ beforePhotoUploaded ? 'Đã tải ảnh' : 'Chụp ảnh' }}</span>
              </div>

              <div v-if="beforePhotoUploaded" class="text-xs text-success-700 flex items-center gap-1 font-semibold">
                <CheckCircle2 :size="16" /> Đã xác thực ảnh hiện trạng BEFORE
              </div>
            </div>
          </div>
        </FhCard>

        <!-- Phase 3: Quotation Submission (D-02 Standard) -->
        <FhCard :title="isFixedPriceOrder ? '4. Giá cố định theo Booking' : '4. Lập báo giá phân tách Công & Phụ tùng (D-02 Standard)'">
          <div v-if="isFixedPriceOrder" data-testid="fixed-price-order-summary" class="space-y-3 text-sm">
            <p class="font-semibold text-brand-800">Dịch vụ có giá cố định theo Booking đã đặt; không lập báo giá kiểm tra hiện trường lần nữa.</p>
            <p v-if="job?.scopeDescription" class="text-ink-700">Phạm vi đã đặt: {{ job.scopeDescription }}</p>
            <div v-if="fixedPriceTotal != null" data-testid="fixed-price-breakdown" class="rounded-lg bg-ink-50 border border-ink-200 p-3 space-y-1">
              <p>Đơn giá đã lưu: <FhMoney :amount="job?.fixedUnitPrice ?? 0" /></p>
              <p>Số lượng đã đặt: {{ job?.quantity ?? 1 }}</p>
              <p class="font-semibold">Giá công theo Booking: <FhMoney :amount="fixedPriceTotal" /></p>
              <p class="text-ink-500 text-xs">Không bao gồm chi phí phát sinh được duyệt riêng (nếu có).</p>
            </div>
            <p v-else role="status" class="text-danger-700">Chưa có giá cố định đã lưu trong đơn; cần kiểm tra dữ liệu Booking trước khi bắt đầu sửa.</p>
            <FhButton
              data-testid="fixed-price-start-repair"
              variant="primary"
              size="sm"
              :disabled="actionLoading || !gpsCheckedIn || !beforePhotoUploaded || job?.status !== 'EN_ROUTE' || fixedPriceTotal == null"
              @click="handleStartRepair"
            >
              Bắt đầu sửa chữa (UNDER_REPAIR)
            </FhButton>
          </div>
          <div v-else class="space-y-4 text-xs">
            <PartsQuoteDemoPreview v-if="showPartsDemo" />
            <FhCostBreakdown :labor-total="laborTotal()" :parts-total="partsTotal()" />

            <div class="space-y-2">
              <div class="flex items-center justify-between font-semibold text-ink-700">
                <span>Hạng mục chi phí:</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="text-[11px] text-brand-600 font-bold hover:underline flex items-center gap-1"
                    @click="addItem('LABOR')"
                  >
                    <Plus :size="13" /> Thêm công thợ
                  </button>
                  <button
                    type="button"
                    class="text-[11px] text-ink-700 font-bold hover:underline flex items-center gap-1"
                    @click="addItem('PARTS')"
                  >
                    <Plus :size="13" /> Thêm linh kiện
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="(item, idx) in quotationItems"
                  :key="idx"
                  class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 flex items-center gap-2"
                >
                  <span
                    class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                    :class="item.type === 'LABOR' ? 'bg-brand-100 text-brand-800' : 'bg-ink-200 text-ink-800'"
                  >
                    {{ item.type === 'LABOR' ? 'Công' : 'Linh kiện' }}
                  </span>

                  <input
                    v-model="item.description"
                    type="text"
                    class="flex-1 h-8 px-2 bg-white border border-ink-200 rounded text-xs"
                  />

                  <input
                    v-model.number="item.unitPrice"
                    type="number"
                    step="10000"
                    class="w-24 h-8 px-2 bg-white border border-ink-200 rounded text-xs font-num font-bold text-right"
                  />

                  <button
                    class="p-1 text-ink-400 hover:text-danger-500 rounded"
                    @click="removeItem(idx)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-ink-100 flex items-center justify-between">
              <div class="text-xs">
                <span class="text-ink-400">Tổng báo giá: </span>
                <span class="font-bold text-brand-700 font-num text-sm">
                  <FhMoney :amount="laborTotal() + partsTotal()" />
                </span>
              </div>

              <div class="flex gap-2">
                <FhButton
                  variant="secondary"
                  size="sm"
                  :disabled="actionLoading"
                  @click="handleStartRepair"
                >
                  Bắt đầu sửa chữa (UNDER_REPAIR)
                </FhButton>
                <FhButton
                  variant="primary"
                  size="sm"
                  :disabled="!beforePhotoUploaded || actionLoading"
                  @click="handleSubmitQuotation"
                >
                  <FileText :size="14" class="mr-1.5" /> Gửi báo giá cho khách duyệt
                </FhButton>
              </div>
            </div>
          </div>
        </FhCard>

        <!-- Chi phí phát sinh (Additional Cost) -->
        <FhCard v-if="job && job.status === 'UNDER_REPAIR'" title="Chi phí phát sinh ngoài phạm vi ban đầu">
          <div class="space-y-3 text-xs">
            <div v-for="cost in additionalCosts" :key="cost.id" class="p-3 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 space-y-2">
              <div class="flex items-center justify-between">
                <FhStatusPill
                  :status="cost.status"
                  :label="{PENDING_APPROVAL:'Chờ khách duyệt',APPROVED:'Đã duyệt',REJECTED:'Bị từ chối',EXPIRED:'Hết hạn chờ duyệt',CANCELLED:'Đã huỷ'}[cost.status]"
                />
                <span class="font-num font-bold text-ink-800"><FhMoney :amount="Number(cost.totalLaborDelta) + Number(cost.totalPartsDelta)" /></span>
              </div>
              <p class="text-ink-600 italic">"{{ cost.reason }}"</p>
              <FhButton
                v-if="['REJECTED','EXPIRED'].includes(cost.status)"
                variant="ghost"
                size="sm"
                @click="openAdditionalCostForm(cost)"
              >
                Sửa lại & gửi lần nữa
              </FhButton>
            </div>

            <FhButton
              v-if="!showAdditionalCostForm"
              variant="secondary"
              size="sm"
              @click="openAdditionalCostForm()"
            >
              <Plus :size="13" class="mr-1" /> Tạo yêu cầu chi phí phát sinh
            </FhButton>

            <div v-if="showAdditionalCostForm" class="space-y-3 pt-2 border-t border-ink-100">
              <textarea
                v-model="acReason"
                rows="2"
                placeholder="Mô tả sự cố phát sinh ngoài phạm vi ban đầu..."
                class="w-full p-2.5 bg-white border border-ink-200 rounded text-xs"
              ></textarea>

              <div class="flex items-center justify-between font-semibold text-ink-700">
                <span>Hạng mục chi phí phát sinh:</span>
                <div class="flex gap-2">
                  <button type="button" class="text-[11px] text-brand-600 font-bold hover:underline flex items-center gap-1" @click="addAcItem('LABOR')">
                    <Plus :size="13" /> Thêm công thợ
                  </button>
                  <button type="button" class="text-[11px] text-ink-700 font-bold hover:underline flex items-center gap-1" @click="addAcItem('PARTS')">
                    <Plus :size="13" /> Thêm linh kiện
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <div v-for="(item, idx) in acItems" :key="idx" class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 flex items-center gap-2">
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" :class="item.type === 'LABOR' ? 'bg-brand-100 text-brand-800' : 'bg-ink-200 text-ink-800'">
                    {{ item.type === 'LABOR' ? 'Công' : 'Linh kiện' }}
                  </span>
                  <input v-model="item.description" type="text" class="flex-1 h-8 px-2 bg-white border border-ink-200 rounded text-xs" />
                  <input v-model.number="item.unitPrice" type="number" step="10000" class="w-24 h-8 px-2 bg-white border border-ink-200 rounded text-xs font-num font-bold text-right" />
                  <button class="p-1 text-ink-400 hover:text-danger-500 rounded" @click="removeAcItem(idx)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <img v-for="url in acEvidenceUrls" :key="url" :src="url" class="w-14 h-14 rounded object-cover border border-ink-200" />
                  <div
                    class="w-14 h-14 rounded border-2 border-dashed border-ink-300 hover:border-brand-500 flex items-center justify-center cursor-pointer text-ink-400"
                    @click="acFile?.click()"
                  >
                    <Camera :size="18" />
                  </div>
                  <input ref="acFile" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleUploadAcEvidence(($event.target as HTMLInputElement).files?.[0])" />
                </div>
                <span class="text-[11px] text-ink-400">Ảnh bằng chứng sự cố phát sinh (không bắt buộc)</span>
              </div>

              <div class="pt-2 border-t border-ink-100 flex items-center justify-between">
                <span class="font-bold text-brand-700 font-num text-sm"><FhMoney :amount="acLaborTotal() + acPartsTotal()" /></span>
                <div class="flex gap-2">
                  <FhButton variant="ghost" size="sm" @click="showAdditionalCostForm = false">Huỷ</FhButton>
                  <FhButton variant="primary" size="sm" :disabled="acSubmitting || acUploading" @click="handleSubmitAdditionalCost">
                    Gửi yêu cầu
                  </FhButton>
                </div>
              </div>
            </div>
          </div>
        </FhCard>

        <!-- Phase 4: Evidence AFTER & Complete Repair -->
        <FhCard title="5. Ảnh hoàn tất AFTER & Kích hoạt bảo hành điện tử">
          <div class="space-y-4 text-xs">
            <div class="flex items-center gap-4">
              <div
                class="w-24 h-24 rounded-[var(--radius-sm)] border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                :class="afterPhotoUploaded ? 'border-success-500 bg-success-50/50 text-success-700' : 'border-ink-300 hover:border-brand-500 text-ink-500'"
                @click="afterFile?.click()"
              >
                <Camera :size="22" />
                <span class="text-[10px] font-semibold">{{ afterPhotoUploaded ? 'Đã có ảnh' : 'Chụp ảnh sau sửa' }}</span>
              </div>

              <div class="flex-1 space-y-2">
                <p class="text-ink-600">Bảo hành theo báo giá đã duyệt. Linh kiện tự cung cấp ở biểu mẫu này không kèm bảo hành.</p>
              </div>
            </div>

            <div class="pt-4 border-t border-ink-100 flex justify-end">
              <FhButton
                variant="primary"
                size="md"
                :disabled="completionRequested || isCompleted || actionLoading"
                @click="handleCompleteOrder"
              >
                <ShieldCheck :size="16" class="mr-1.5" />
                {{ isCompleted ? 'Đơn hàng đã hoàn tất' : completionRequested ? 'Đã yêu cầu nghiệm thu' : 'Yêu cầu khách nghiệm thu' }}
              </FhButton>
            </div>
          </div>
        </FhCard>

        <!-- Phase 5: Cash Dual Confirmation (Spec v1.2) -->
        <FhCard title="6. Khai báo thu tiền mặt (Dual-Confirmation)">
          <div class="space-y-4 text-xs">
            <p class="text-ink-600">
              Quy tắc Spec v1.2: Khi thu tiền mặt trực tiếp từ khách, thợ phải khai báo chính xác số tiền đã nhận. Khách hàng sẽ bấm xác nhận trên điện thoại để hoàn tất thanh toán và sinh công nợ hoa hồng 10% tiền công.
            </p>

            <div v-if="cashSettled" class="p-3 bg-brand-50 rounded-lg border border-brand-200 space-y-1">
              <div class="flex items-center gap-2 font-semibold text-brand-900">
                <CheckCircle2 :size="16" class="text-brand-600" />
                <span>Trạng thái đối soát: {{ cashSettlementStatus === 'confirmed' ? 'Khách đã xác nhận (PAID)' : 'Đang chờ khách duyệt số tiền' }}</span>
              </div>
              <p class="text-brand-700 text-[11px]">
                Số tiền khai báo: <strong><FhMoney :amount="declaredCashAmount" /></strong>
              </p>
            </div>

            <div v-else class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">Số tiền mặt thực thu (VNĐ):</label>
                  <input
                    v-model.number="declaredCashAmount"
                    type="number"
                    step="10000"
                    placeholder="VD: 300000"
                    class="w-full h-9 px-3 bg-white border border-ink-200 rounded text-xs font-num font-bold text-ink-900"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">Ghi chú / Mã biên lai:</label>
                  <input
                    v-model="technicianCashNotes"
                    type="text"
                    placeholder="VD: Đã nhận đủ tiền mặt từ khách"
                    class="w-full h-9 px-3 bg-white border border-ink-200 rounded text-xs"
                  />
                </div>
              </div>

              <div class="flex justify-end pt-2">
                <FhButton
                  variant="primary"
                  size="sm"
                  :disabled="!completionRequested || actionLoading"
                  @click="handleDeclareCash"
                >
                  <DollarSign :size="14" class="mr-1" />
                  Khai báo đã thu tiền mặt
                </FhButton>
              </div>
            </div>
          </div>
        </FhCard>
      </div>
    </div>
  </div>
</template>
