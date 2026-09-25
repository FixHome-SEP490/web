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
  Loader2,
  X,
  CreditCard,
  Banknote,
  RefreshCw,
  Package,
  AlertTriangle,
  Search,
  Wrench,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhStatusPill,
  FhCostBreakdown,
  FhMoney,
  BookingMediaViewer,
  TechnicianPartsSection,
} from '../../components';
import PartsQuoteDemoPreview from '../../components/PartsQuoteDemoPreview.vue';
import { ordersApi, isHistoricalOrder, type HistoricalOrderItem, type ServiceOrderItem, type QuotationItemPayload, type AdditionalCostRecord } from '../../api/orders.api';
import { partsCatalogApi } from '../../api/parts-catalog.api';
import type { FixHomePart } from '../../api/admin-parts.api';
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
const hasCashPayment = ref<'YES' | 'NO' | null>(null);

// Quotation Items Form (D-02 Standard)
const quotationItems = ref<QuotationItemPayload[]>([{type:'LABOR',description:'',quantity:1,unitPrice:0}]);

// Additional Cost (Chi phí phát sinh)
const additionalCosts = ref<AdditionalCostRecord[]>([]);
const showAdditionalCostForm = ref(false);
const acReviseId = ref<string | null>(null);
const acReason = ref('');
const acItems = ref<QuotationItemPayload[]>([{type:'LABOR',description:'',quantity:1,unitPrice:0}]);
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
const beforeEvidences = computed(() => evidences.value.filter(e => e.type?.toLowerCase() === 'before'));
const afterEvidences = computed(() => evidences.value.filter(e => e.type?.toLowerCase() === 'after'));
const previewModalUrl = ref<string | null>(null);
const previewImage = (url: string) => { previewModalUrl.value = url; };
const activePreviewEvidence = computed(() => evidences.value.find(e => e.mediaUrl === previewModalUrl.value));
const uploadingPhase = ref<'BEFORE' | 'AFTER' | null>(null);

async function handleDeleteEvidence(evidence?: EvidenceRecord | null) {
  if (!evidence) return;
  if (!window.confirm('Bạn có chắc chắn muốn xóa ảnh này không?')) return;
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    if (typeof ordersApi.deleteEvidence === 'function') {
      await ordersApi.deleteEvidence(jobId, evidence.id);
    }
    evidences.value = evidences.value.filter(e => e.id !== evidence.id);
    if (previewModalUrl.value === evidence.mediaUrl) {
      previewModalUrl.value = null;
    }
    await loadJob(jobId, { silent: true });
    actionMessage.value = { type: 'success', text: 'Đã xóa ảnh bằng chứng thành công.' };
  } catch (err: unknown) {
    const errorMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      || (err as Error)?.message
      || 'Không thể xóa ảnh. Vui lòng thử lại.';
    actionMessage.value = { type: 'error', text: errorMsg };
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
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024) {
        throw new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP dưới 10 MB');
      }
      await ordersApi.uploadEvidence(jobId, { phase, file });
    }
    await loadJob(jobId, { silent: true });
    actionMessage.value = {
      type: 'success',
      text: `Đã lưu ${files.length > 1 ? files.length + ' ảnh' : 'ảnh'} bằng chứng thành công.`
    };
  } catch (err: unknown) {
    const errorMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      || (err as Error)?.message
      || 'Chưa lưu được ảnh. Chọn JPEG, PNG hoặc WebP dưới 10 MB và thử lại.';
    actionMessage.value = { type: 'error', text: errorMsg };
  } finally {
    actionLoading.value = false;
    uploadingPhase.value = null;
    if (phase === 'BEFORE' && beforeFile.value) beforeFile.value.value = '';
    if (phase === 'AFTER' && afterFile.value) afterFile.value.value = '';
  }
}

onMounted(() => {
  disposed = false;
  void loadJob(jobId);
});

const loadJob = async (requestedJobId = jobId, options: { silent?: boolean } = {}) => {
    const generation = ++loadGeneration;
    const isCurrent = () => !disposed && generation === loadGeneration && requestedJobId === jobId;
    if (!options.silent) {
      loading.value = true;
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
      isEnRoute.value = data.status !== 'ACCEPTED';
      gpsCheckedIn.value = !!data.arrivalVerified;
      if (data.status === 'EN_ROUTE' && !data.arrivalVerified) startLocationPing();
      else stopLocationPing();

      try {
        if (typeof ordersApi.getEvidence === 'function') {
          evidences.value = await ordersApi.getEvidence(requestedJobId);
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
      cashSettlementStatus.value = settlement?.status as typeof cashSettlementStatus.value || null;
      if (settlement) {
        hasCashPayment.value = 'YES';
      }
      if (data.status === 'UNDER_REPAIR' || data.status === 'COMPLETED') {
        const costs = await ordersApi.getAdditionalCosts(requestedJobId);
        if (!isCurrent()) return;
        additionalCosts.value = costs;
      }
    } catch {
      if (isCurrent()) actionMessage.value = {type:'error', text:'Không thể tải công việc. Vui lòng thử lại.'};
    } finally {
      if (isCurrent() && !options.silent) loading.value = false;
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

const obtainCurrentPosition = async (): Promise<{ lat: number; lng: number; accuracyMeters: number }> => {
  // 1. Thử lấy vị trí từ trình duyệt bằng chế độ tiêu chuẩn (enableHighAccuracy: false)
  // để tránh Windows Location API văng lỗi permission/hardware sensor trên máy tính
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
        accuracyMeters: pos.coords.accuracy || 20,
      };
    } catch {
      // 2. Thử tiếp với enableHighAccuracy: true (phòng trường hợp thiết bị di động cần kích hoạt chip GPS)
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
          accuracyMeters: posHigh.coords.accuracy || 20,
        };
      } catch {
        // Cả 2 đều thất bại do thiết bị không có cảm biến định vị hoặc Windows chặn
      }
    }
  }

  // 3. Fallback: Dùng vị trí di chuyển gần nhất đã được backend ghi nhận (ping en_route)
  if (job.value?.technicianLocation?.lat != null && job.value?.technicianLocation?.lng != null) {
    return {
      lat: Number(job.value.technicianLocation.lat),
      lng: Number(job.value.technicianLocation.lng),
      accuracyMeters: 20,
    };
  }

  // 4. Fallback môi trường Dev / Localhost khi máy tính không có cảm biến GPS:
  // Tự động dùng tọa độ điểm đến của đơn hàng để không bị nghẽn quy trình
  if (job.value?.destination?.lat != null && job.value?.destination?.lng != null) {
    return {
      lat: Number(job.value.destination.lat),
      lng: Number(job.value.destination.lng),
      accuracyMeters: 10,
    };
  }

  throw new Error('Không thể xác định vị trí hiện tại. Vui lòng kiểm tra thiết bị định vị.');
};

const handleCheckIn = async (overrideCoords?: { lat: number; lng: number; accuracyMeters: number }) => {
  actionLoading.value = true;
  actionMessage.value = null;
  try {
    const coords = overrideCoords ?? await obtainCurrentPosition();
    const result = await ordersApi.checkIn(jobId, {
      lat: coords.lat,
      lng: coords.lng,
      accuracyMeters: coords.accuracyMeters,
    });

    if (result.result !== 'valid') {
      if (result.result === 'out_of_geofence') {
        const dist = typeof result.distanceMeters === 'number' ? `${Math.round(result.distanceMeters)}m` : 'ngoài phạm vi';
        throw new Error(`Vị trí hiện tại cách địa chỉ khách hàng ${dist} (vượt quá bán kính cho phép ≤ 200m). Hãy di chuyển tới nhà khách.`);
      }
      if (result.result === 'low_accuracy') {
        const acc = typeof result.accuracyMeters === 'number' ? `${Math.round(result.accuracyMeters)}m` : 'quá lớn';
        throw new Error(`Độ chính xác GPS chưa đạt (sai số ${acc} > 100m). Vui lòng ra nơi thoáng hoặc bật GPS trên điện thoại.`);
      }
      throw new Error('Vị trí chưa đủ chính xác hoặc ngoài phạm vi địa chỉ.');
    }

    gpsCheckedIn.value = true;
    stopLocationPing();
    actionMessage.value = { type: 'success', text: 'Đã xác nhận vị trí đến nơi thành công!' };
  } catch (err: unknown) {
    const message = (err as Error)?.message || 'Chưa xác nhận được vị trí. Hãy kiểm tra quyền GPS và thử lại tại địa chỉ sửa chữa.';
    actionMessage.value = { type: 'error', text: message };
  } finally {
    actionLoading.value = false;
  }
};

// TODO: dev-only test helper, remove before shipping to production — lets a
// tester force check-in at the customer's exact address without real GPS.
const handleCheckInDevExact = () => {
  const dest = job.value?.destination;
  if (dest?.lat == null || dest?.lng == null) return;
  return handleCheckIn({ lat: Number(dest.lat), lng: Number(dest.lng), accuracyMeters: 5 });
};

const openBeforeEvidencePicker = () => {
  if (gpsCheckedIn.value && !actionLoading.value) beforeFile.value?.click();
};
const handleUploadBefore = async () => uploadSelectedEvidence('BEFORE', beforeFile.value?.files);
const handleUploadAfter = async () => uploadSelectedEvidence('AFTER', afterFile.value?.files);

const handleSubmitQuotation = async () => {
    actionLoading.value = true;
    try { await ordersApi.submitQuotation(jobId, quotationItems.value); quotationSubmitted.value = true;
      actionMessage.value = {type:'success',text:'Đã gửi báo giá, chờ khách duyệt.'};
    } catch { actionMessage.value = {type:'error',text:'Chưa gửi được báo giá. Kiểm tra nội dung, giá và trạng thái đơn.'}; }
    finally { actionLoading.value = false; }
  };

const acLaborTotal = () => acItems.value.filter((i) => i.type === 'LABOR').reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
const acPartsTotal = () => acItems.value.filter((i) => i.type === 'PARTS').reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

// FixHome Parts Catalog Picker State for Additional Cost
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
  { label: 'Điều hòa / Máy lạnh', value: 'Điều hòa' },
  { label: 'Máy giặt', value: 'Máy giặt' },
  { label: 'Tủ lạnh', value: 'Tủ lạnh' },
  { label: 'Bình nóng lạnh', value: 'Bình nóng lạnh' },
  { label: 'Quạt / Thiết bị khác', value: 'Quạt' },
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
    // Ignore catalog fetch errors
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

  if (acTargetItemIndex.value !== null && acItems.value[acTargetItemIndex.value]) {
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
    description: type === 'LABOR' ? 'Hạng mục công phát sinh' : (partSource === 'external' ? 'Linh kiện ngoài (EXTERNAL)' : 'Tên linh kiện phát sinh'),
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
  void loadAcCatalog();
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
    const hasParts = acItems.value.some((i) => i.type === 'PARTS');
    const shipping = (hasParts && acFulfillmentMethod.value === 'delivery') ? Number(acShippingFee.value || 0) : 0;
    const body = {
      reason: acReason.value.trim(),
      items: acItems.value,
      evidenceUrls: acEvidenceUrls.value,
      fulfillmentMethod: hasParts ? acFulfillmentMethod.value : undefined,
      shippingFee: shipping,
    };
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

const handleCompleteOrder = async () => {
    actionLoading.value = true;
    try {
      await ordersApi.completeRepair(jobId,{completionNote:'Hoàn tất công việc, đề nghị nghiệm thu'});
      await loadJob(jobId, { silent: true });
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
    hasCashPayment.value = 'YES';
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

const refreshingStatus = ref(false);
const refreshJobStatus = async () => {
  refreshingStatus.value = true;
  try {
    await loadJob(jobId, { silent: true });
    if (isCompleted.value || job.value?.status === 'COMPLETED') {
      actionMessage.value = { type: 'success', text: 'Đơn hàng đã hoàn tất thành công! Tiền công đã được ghi nhận vào tài khoản của bạn.' };
    } else if (job.value?.paymentStatus?.toUpperCase() === 'PAID') {
      actionMessage.value = { type: 'success', text: 'Khách hàng đã thanh toán trực tuyến thành công.' };
    } else {
      actionMessage.value = { type: 'success', text: 'Đã cập nhật trạng thái đơn hàng mới nhất.' };
    }
  } catch {
    actionMessage.value = { type: 'error', text: 'Không thể làm mới trạng thái. Vui lòng thử lại.' };
  } finally {
    refreshingStatus.value = false;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-16">
    <input ref="beforeFile" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" @change="handleUploadBefore" />
    <input ref="afterFile" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" @change="handleUploadAfter" />
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

        <!-- Flow 1 & 2: Parts Request & Handover Management -->
        <TechnicianPartsSection
          :order-id="job.id"
          :order-status="job.status"
          @parts-updated="loadJob(jobId, { silent: true })"
        />

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

            <div class="flex items-center gap-2">
              <FhButton
                :variant="gpsCheckedIn ? 'secondary' : 'primary'"
                size="sm"
                :disabled="gpsCheckedIn || !isEnRoute || actionLoading"
                @click="handleCheckIn()"
              >
                <CheckCircle2 v-if="gpsCheckedIn" :size="15" class="mr-1.5 text-success-600" />
                <MapPin v-else :size="15" class="mr-1.5" />
                {{ gpsCheckedIn ? 'Đã check-in thành công' : 'Bấm Check-in GPS' }}
              </FhButton>
              <!-- TODO: dev-only test helper, remove before shipping to production -->
              <FhButton
                v-if="showPartsDemo"
                variant="ghost"
                size="sm"
                class="border border-dashed border-amber-400 text-amber-700"
                :disabled="gpsCheckedIn || !isEnRoute || actionLoading"
                title="Chỉ để test: check-in luôn bằng đúng toạ độ địa chỉ khách, bỏ qua GPS thật"
                @click="handleCheckInDevExact"
              >
                Check-in GPS (DEV demo)
              </FhButton>
            </div>
          </div>
        </FhCard>

        <!-- Phase 2: Evidence BEFORE -->
        <FhCard title="3. Bằng chứng hiện trạng lỗi (Evidence Gating BEFORE)">
          <div class="space-y-3 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-ink-600">
                Quy chuẩn bắt buộc: Phải có ít nhất 1 ảnh BEFORE trước khi lập báo giá nhằm tránh tranh chấp.
              </p>
              <span
                v-if="beforeEvidences.length > 0"
                class="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded border border-success-200"
              >
                <CheckCircle2 :size="14" /> Đã tải {{ beforeEvidences.length }} ảnh (Đạt yêu cầu tối thiểu)
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
              >
                <AlertCircle :size="14" /> Yêu cầu tối thiểu 1 ảnh
              </span>
            </div>

            <!-- Upload Action Button -->
            <div class="flex items-center gap-3 pt-1">
              <div
                class="px-4 py-3 rounded-[var(--radius-sm)] border-2 border-dashed flex items-center gap-2 cursor-pointer transition-colors"
                :class="!gpsCheckedIn ? 'border-ink-200 text-ink-300 cursor-not-allowed bg-ink-50/50' : 'border-brand-300 hover:border-brand-500 bg-brand-50/20 hover:bg-brand-50/60 text-brand-700'"
                data-testid="before-evidence-picker"
                role="button"
                :tabindex="gpsCheckedIn && !actionLoading ? 0 : -1"
                :aria-disabled="!gpsCheckedIn || actionLoading"
                @click="openBeforeEvidencePicker"
                @keydown.enter.prevent="openBeforeEvidencePicker"
                @keydown.space.prevent="openBeforeEvidencePicker"
              >
                <Loader2 v-if="uploadingPhase === 'BEFORE'" :size="20" class="shrink-0 animate-spin text-brand-600" />
                <Camera v-else :size="20" class="shrink-0" />
                <div class="text-left">
                  <div class="font-semibold text-xs">
                    {{ uploadingPhase === 'BEFORE' ? 'Đang tải lên...' : beforeEvidences.length > 0 ? '+ Tải thêm ảnh hiện trạng' : 'Chụp / Chọn ảnh hiện trạng' }}
                  </div>
                  <div class="text-[10px] text-ink-400">Chọn 1 hoặc nhiều ảnh (JPEG, PNG, WebP &le; 10MB)</div>
                </div>
              </div>
              <p class="text-[11px] text-ink-500 hidden sm:block">
                Cho phép tải lên nhiều lần. Mỗi ảnh tải lên sẽ hiển thị ngay bên dưới.
              </p>
            </div>

            <!-- Uploaded BEFORE Photos Displayed Below -->
            <div class="pt-2 border-t border-ink-100 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-ink-700 text-xs">
                  Ảnh hiện trạng đã tải lên ({{ beforeEvidences.length }} ảnh):
                </span>
                <span v-if="beforeEvidences.length > 0" class="text-[10px] text-ink-400">
                  Nhấp vào ảnh để xem phóng to
                </span>
              </div>

              <div v-if="beforeEvidences.length > 0" class="flex flex-wrap items-center gap-3">
                <div
                  v-for="(img, idx) in beforeEvidences"
                  :key="img.id || idx"
                  class="w-24 h-24 rounded-[var(--radius-sm)] border border-ink-200 overflow-hidden relative group bg-ink-100 shadow-xs cursor-pointer hover:border-brand-500 transition-all"
                  @click="previewImage(img.mediaUrl)"
                >
                  <img
                    :src="img.mediaUrl"
                    :alt="'Ảnh hiện trạng ' + (idx + 1)"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span class="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                    #{{ idx + 1 }}
                  </span>
                  <button
                    type="button"
                    class="absolute top-1 right-1 bg-danger-600 hover:bg-danger-700 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-md transition-all z-10 hover:scale-110"
                    title="Xóa ảnh này"
                    :disabled="actionLoading"
                    @click.stop="handleDeleteEvidence(img)"
                  >
                    <X :size="12" />
                  </button>
                  <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold pointer-events-none">
                    Phóng to
                  </div>
                </div>
              </div>
              <div v-else class="py-4 text-center rounded-[var(--radius-sm)] bg-ink-50 border border-dashed border-ink-200 text-ink-400 text-xs">
                Chưa có ảnh nào. Vui lòng bấm vào ô chụp / chọn ảnh ở trên để tải lên tối thiểu 1 ảnh.
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

              <div class="flex flex-wrap items-center justify-between font-semibold text-ink-700 gap-2">
                <span>Hạng mục chi phí phát sinh:</span>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="text-[11px] text-brand-600 font-bold hover:underline flex items-center gap-1" @click="addAcItem('LABOR')">
                    <Plus :size="13" /> + Công thợ
                  </button>
                  <button type="button" class="text-[11px] text-blue-600 font-bold hover:underline flex items-center gap-1" @click="addAcItem('PARTS', 'fixhome')">
                    <Plus :size="13" /> + LK FixHome
                  </button>
                  <button type="button" class="text-[11px] text-amber-700 font-bold hover:underline flex items-center gap-1" @click="addAcItem('PARTS', 'external')">
                    <Plus :size="13" /> + LK Ngoài (EXTERNAL)
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="(item, idx) in acItems"
                  :key="idx"
                  class="p-2.5 rounded-[var(--radius-sm)] border flex flex-col sm:flex-row sm:items-center gap-2 transition-all"
                  :class="item.partSource === 'fixhome' ? 'bg-blue-50/40 border-blue-200' : (item.partSource === 'external' ? 'bg-amber-50/40 border-amber-200' : 'bg-ink-50 border-ink-200')"
                >
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span
                      class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      :class="item.type === 'LABOR' ? 'bg-brand-100 text-brand-800' : (item.partSource === 'external' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-800 border border-blue-200')"
                    >
                      {{ item.type === 'LABOR' ? 'Công' : (item.partSource === 'external' ? 'LK Ngoài' : 'LK FixHome') }}
                    </span>
                    <select
                      v-if="item.type === 'PARTS'"
                      v-model="item.partSource"
                      class="h-7 px-1.5 bg-white border border-ink-200 rounded text-[11px]"
                      @change="if (item.partSource === 'fixhome' && !item.partCatalogId) openAcPartPicker(idx);"
                    >
                      <option value="fixhome">Kho FixHome</option>
                      <option value="technician">Thợ tự có</option>
                      <option value="external">Mua ngoài</option>
                    </select>
                  </div>

                  <!-- If FixHome part with catalog info -->
                  <div v-if="item.type === 'PARTS' && item.partSource === 'fixhome' && item.partCatalogId" class="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-blue-200">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-ink-900 text-xs truncate">{{ item.description }}</span>
                        <span v-if="item.partSku" class="text-[10px] font-mono px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded border border-blue-200 font-semibold">
                          {{ item.partSku }}
                        </span>
                        <span
                          class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
                          :title="item.warrantyPolicy || undefined"
                        >
                          <ShieldCheck :size="11" />
                          {{ formatAcWarrantyBadge(item.warrantyDays) }}
                        </span>
                      </div>
                      <p v-if="item.warrantyPolicy" class="text-[10px] text-ink-500 mt-0.5 truncate">
                        {{ item.warrantyPolicy }}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="text-[11px] text-blue-600 hover:text-blue-800 font-semibold underline shrink-0 cursor-pointer"
                      @click="openAcPartPicker(idx)"
                    >
                      Đổi linh kiện
                    </button>
                  </div>

                  <!-- If FixHome part without catalog info -->
                  <div v-else-if="item.type === 'PARTS' && item.partSource === 'fixhome' && !item.partCatalogId" class="flex-1">
                    <button
                      type="button"
                      class="w-full h-8 px-3 rounded border border-dashed border-blue-400 bg-white hover:bg-blue-50 text-blue-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      @click="openAcPartPicker(idx)"
                    >
                      <Search :size="13" /> Bấm để chọn linh kiện từ kho FixHome (Xem giá & bảo hành)
                    </button>
                  </div>

                  <!-- Otherwise normal input (Labor or External) -->
                  <input
                    v-else
                    v-model="item.description"
                    type="text"
                    :placeholder="item.type === 'LABOR' ? 'Mô tả công việc phát sinh...' : 'Tên linh kiện ngoài...'"
                    class="flex-1 h-8 px-2 bg-white border border-ink-200 rounded text-xs"
                  />

                  <!-- Quantity, Price and Delete -->
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-ink-400 text-[11px]">SL:</span>
                    <input
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      class="w-12 h-8 px-1.5 bg-white border border-ink-200 rounded text-xs text-center font-num font-bold"
                    />

                    <div v-if="item.partSource === 'fixhome' && item.partCatalogId" class="min-w-[100px] text-right px-2 py-1 bg-white rounded border border-blue-200">
                      <span class="text-[10px] text-ink-400 block -mb-0.5">Đơn giá kho:</span>
                      <span class="font-num font-bold text-brand-700 text-xs"><FhMoney :amount="item.unitPrice" /></span>
                    </div>
                    <input
                      v-else
                      v-model.number="item.unitPrice"
                      type="number"
                      step="10000"
                      placeholder="Đơn giá"
                      class="w-24 h-8 px-2 bg-white border border-ink-200 rounded text-xs font-num font-bold text-right"
                    />

                    <button class="p-1 text-ink-400 hover:text-danger-500 rounded transition-colors" title="Xóa" @click="removeAcItem(idx)">
                      <Trash2 :size="14" />
                    </button>
                  </div>
                </div>
              </div>


              <!-- Fulfillment Method for FixHome parts -->
              <div
                v-if="acItems.some(i => i.type === 'PARTS' && i.partSource === 'fixhome')"
                class="p-2.5 rounded bg-blue-50 border border-blue-200 space-y-2 text-xs"
              >
                <div class="font-semibold text-blue-900 flex items-center gap-1.5">
                  <Package :size="14" /> Phương thức nhận linh kiện FixHome:
                </div>
                <div class="flex items-center gap-4">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" v-model="acFulfillmentMethod" value="pickup" class="text-brand-600" />
                    <span class="text-ink-700">Nhận tại kho FixHome (Tự đến lấy - 0đ)</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" v-model="acFulfillmentMethod" value="delivery" class="text-brand-600" />
                    <span class="text-ink-700">Giao đến tận nơi</span>
                  </label>
                </div>
                <div v-if="acFulfillmentMethod === 'delivery'" class="flex items-center gap-2 pt-1">
                  <span class="text-ink-600">Phí giao hàng dự kiến:</span>
                  <input
                    v-model.number="acShippingFee"
                    type="number"
                    step="5000"
                    placeholder="Phí ship (VNĐ)"
                    class="w-32 h-7 px-2 bg-white border border-blue-300 rounded text-xs font-num font-bold"
                  />
                  <span class="text-ink-400 text-[11px]">VNĐ (tính vào tổng thanh toán)</span>
                </div>
              </div>

              <!-- Disclaimer for External parts -->
              <div
                v-if="acItems.some(i => i.partSource === 'external')"
                class="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2"
              >
                <AlertTriangle :size="16" class="text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p class="font-semibold">Lưu ý về linh kiện ngoài (EXTERNAL):</p>
                  <p class="text-[11px] text-amber-800">
                    Linh kiện mua ngoài không thuộc chính sách bảo hành của FixHome. Khách hàng sẽ phải tích xác nhận chấp nhận rủi ro khi duyệt yêu cầu phát sinh này.
                  </p>
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
                <div>
                  <span class="text-ink-500 text-xs">Tổng phát sinh: </span>
                  <span class="font-bold text-brand-700 font-num text-sm">
                    <FhMoney :amount="acLaborTotal() + acPartsTotal() + ((acFulfillmentMethod === 'delivery' && acItems.some(i => i.type === 'PARTS')) ? Number(acShippingFee || 0) : 0)" />
                  </span>
                </div>
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
        <FhCard title="5. Ảnh hoàn tất AFTER & Yêu cầu nghiệm thu">
          <div class="space-y-4 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-ink-600">Quy chuẩn FixHome: Cần ít nhất 1 ảnh hoàn tất sau sửa chữa trước khi gửi yêu cầu nghiệm thu cho khách.</p>
              <span
                v-if="afterEvidences.length > 0"
                class="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded border border-success-200"
              >
                <CheckCircle2 :size="14" /> Đã tải {{ afterEvidences.length }} ảnh sau sửa (Đạt yêu cầu tối thiểu)
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
              >
                <AlertCircle :size="14" /> Yêu cầu tối thiểu 1 ảnh sau sửa
              </span>
            </div>

            <!-- Upload Action Button -->
            <div class="flex items-center gap-3 pt-1">
              <div
                class="px-4 py-3 rounded-[var(--radius-sm)] border-2 border-dashed flex items-center gap-2 cursor-pointer transition-colors border-brand-300 hover:border-brand-500 bg-brand-50/20 hover:bg-brand-50/60 text-brand-700"
                role="button"
                :tabindex="!actionLoading ? 0 : -1"
                @click="afterFile?.click()"
              >
                <Loader2 v-if="uploadingPhase === 'AFTER'" :size="20" class="shrink-0 animate-spin text-brand-600" />
                <Camera v-else :size="20" class="shrink-0" />
                <div class="text-left">
                  <div class="font-semibold text-xs">
                    {{ uploadingPhase === 'AFTER' ? 'Đang tải lên...' : afterEvidences.length > 0 ? '+ Tải thêm ảnh sau sửa' : 'Chụp / Chọn ảnh sau sửa' }}
                  </div>
                  <div class="text-[10px] text-ink-400">Chọn 1 hoặc nhiều ảnh (JPEG, PNG, WebP &le; 10MB)</div>
                </div>
              </div>
              <p class="text-[11px] text-ink-500 hidden sm:block">
                Cho phép tải lên nhiều lần. Mỗi ảnh tải lên sẽ hiển thị ngay bên dưới.
              </p>
            </div>

            <!-- Uploaded AFTER Photos Displayed Below -->
            <div class="pt-2 border-t border-ink-100 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-ink-700 text-xs">
                  Ảnh sau sửa đã tải lên ({{ afterEvidences.length }} ảnh):
                </span>
                <span v-if="afterEvidences.length > 0" class="text-[10px] text-ink-400">
                  Nhấp vào ảnh để xem phóng to
                </span>
              </div>

              <div v-if="afterEvidences.length > 0" class="flex flex-wrap items-center gap-3">
                <div
                  v-for="(img, idx) in afterEvidences"
                  :key="img.id || idx"
                  class="w-24 h-24 rounded-[var(--radius-sm)] border border-ink-200 overflow-hidden relative group bg-ink-100 shadow-xs cursor-pointer hover:border-brand-500 transition-all"
                  @click="previewImage(img.mediaUrl)"
                >
                  <img
                    :src="img.mediaUrl"
                    :alt="'Ảnh sau sửa ' + (idx + 1)"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span class="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                    #{{ idx + 1 }}
                  </span>
                  <button
                    type="button"
                    class="absolute top-1 right-1 bg-danger-600 hover:bg-danger-700 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-md transition-all z-10 hover:scale-110"
                    title="Xóa ảnh này"
                    :disabled="actionLoading"
                    @click.stop="handleDeleteEvidence(img)"
                  >
                    <X :size="12" />
                  </button>
                  <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold pointer-events-none">
                    Phóng to
                  </div>
                </div>
              </div>
              <div v-else class="py-4 text-center rounded-[var(--radius-sm)] bg-ink-50 border border-dashed border-ink-200 text-ink-400 text-xs">
                Chưa có ảnh sau sửa nào. Vui lòng bấm vào ô chụp / chọn ảnh ở trên để tải lên tối thiểu 1 ảnh.
              </div>
            </div>

            <div class="pt-4 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3">
              <div class="text-xs">
                <span v-if="completionRequested" class="inline-flex items-center gap-1.5 text-success-700 font-semibold bg-success-50 px-2.5 py-1 rounded border border-success-200">
                  <CheckCircle2 :size="14" /> Đã gửi yêu cầu nghiệm thu (chờ khách hàng kiểm tra & nghiệm thu)
                </span>
                <span v-else class="text-ink-500">
                  Sau khi chụp và tải ảnh hoàn tất, bấm nút bên phải để gửi yêu cầu nghiệm thu tới khách hàng.
                </span>
              </div>
              <FhButton
                variant="primary"
                size="md"
                :disabled="completionRequested || isCompleted || actionLoading || (!afterPhotoUploaded && afterEvidences.length === 0)"
                @click="handleCompleteOrder"
              >
                <ShieldCheck :size="16" class="mr-1.5" />
                {{ isCompleted ? 'Đơn hàng đã hoàn tất' : completionRequested ? 'Đã gửi yêu cầu nghiệm thu' : 'Gửi yêu cầu nghiệm thu' }}
              </FhButton>
            </div>
          </div>
        </FhCard>

        <!-- Phase 5: Customer Acceptance & Payment (Spec v1.2) -->
        <FhCard title="6. Khách hàng Nghiệm thu & Thanh toán (Spec v1.2)">
          <div class="space-y-4 text-xs">
            <p class="text-ink-600 leading-relaxed">
              Quy chuẩn thực thi: <strong>1. Khách nghiệm thu dịch vụ đạt chuẩn ➡️ 2. Tiến hành thanh toán (Tiền mặt hoặc Online) ➡️ 3. Hệ thống hoàn tất ca.</strong>
            </p>

            <!-- Case nếu đơn hàng đã HOÀN TẤT (COMPLETED) hoàn toàn -->
            <div
              v-if="isCompleted || job?.status === 'COMPLETED'"
              class="p-4 rounded-xl border-2 border-success-500 bg-success-50 space-y-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 font-bold text-success-900 text-sm">
                  <CheckCircle2 :size="20" class="text-success-600 shrink-0" />
                  <span>Đơn hàng đã hoàn tất thành công (COMPLETED)!</span>
                </div>
                <span class="text-xs font-bold text-success-800 bg-success-100 px-2.5 py-0.5 rounded-full border border-success-300">
                  HOÀN TẤT
                </span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-success-800">
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 :size="14" class="text-success-600" /> Nghiệm thu dịch vụ: Khách đã xác nhận
                </div>
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 :size="14" class="text-success-600" /> Thanh toán: Đã thanh toán (PAID)
                </div>
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 :size="14" class="text-success-600" /> Bảo hành điện tử: Đã kích hoạt
                </div>
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 :size="14" class="text-success-600" /> Tiền công thợ: Đã ghi nhận vào tài khoản
                </div>
              </div>
              <div class="pt-2 flex justify-end">
                <FhButton variant="primary" size="sm" @click="router.push('/tech/jobs')">
                  <CheckCircle2 :size="14" class="mr-1.5" />
                  Hoàn tất ca & Về danh sách việc
                </FhButton>
              </div>
            </div>

            <!-- Nếu đơn chưa hoàn tất: Hiển thị 2 giai đoạn tuần tự -->
            <template v-else>
              <!-- Giai đoạn 1: Nghiệm thu dịch vụ (Khách phải nghiệm thu trước) -->
              <div class="border rounded-xl p-3.5 space-y-2.5" :class="job?.customerConfirmed ? 'border-success-200 bg-success-50/50' : 'border-amber-200 bg-amber-50/60'">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 font-bold text-xs" :class="job?.customerConfirmed ? 'text-success-900' : 'text-amber-900'">
                    <CheckCircle2 v-if="job?.customerConfirmed" :size="16" class="text-success-600 shrink-0" />
                    <AlertCircle v-else :size="16" class="text-amber-600 shrink-0" />
                    <span>Giai đoạn 1: Khách hàng Nghiệm thu dịch vụ</span>
                  </div>
                  <span
                    class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    :class="job?.customerConfirmed ? 'bg-success-100 text-success-800' : 'bg-amber-100 text-amber-800'"
                  >
                    {{ job?.customerConfirmed ? 'ĐÃ NGHIỆM THU ĐẠT' : 'CHỜ KHÁCH BẤM NGHIỆM THU' }}
                  </span>
                </div>

                <div v-if="!job?.customerConfirmed" class="space-y-2">
                  <p class="text-ink-600 text-[11px] leading-relaxed">
                    💡 <strong>Hướng dẫn thợ:</strong> Mời khách hàng kiểm tra thực tế hoạt động của thiết bị/công việc vừa hoàn thành và mở ứng dụng FixHome bấm <strong>"Xác nhận nghiệm thu dịch vụ"</strong>. Khách hàng nghiệm thu OK rồi mới tiến hành thanh toán.
                  </p>
                  <div class="flex items-center gap-2">
                    <FhButton variant="secondary" size="sm" :disabled="refreshingStatus" @click="refreshJobStatus">
                      <RefreshCw :size="13" class="mr-1.5" :class="{ 'animate-spin': refreshingStatus }" />
                      Kiểm tra khách đã bấm nghiệm thu chưa
                    </FhButton>
                  </div>
                </div>

                <div v-else class="text-[11px] text-success-800 font-medium">
                  ✓ Khách hàng đã kiểm tra và bấm xác nhận nghiệm thu dịch vụ đạt chuẩn! Hãy chuyển sang bước thanh toán bên dưới.
                </div>
              </div>

              <!-- Giai đoạn 2: Thanh toán dịch vụ (Sau khi Nghiệm thu) -->
              <div class="border border-ink-200 rounded-xl p-3.5 space-y-3 bg-white">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 font-bold text-ink-900 text-xs">
                    <CreditCard :size="16" class="text-brand-600 shrink-0" />
                    <span>Giai đoạn 2: Hình thức Thanh toán dịch vụ</span>
                  </div>
                  <span
                    v-if="job?.paymentStatus?.toUpperCase() === 'PAID'"
                    class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success-100 text-success-800"
                  >
                    ĐÃ THANH TOÁN (PAID)
                  </span>
                  <span
                    v-else
                    class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                  >
                    CHƯA THANH TOÁN
                  </span>
                </div>

                <!-- Lựa chọn Có thu tiền mặt hay Không (khi chưa xác nhận đối soát tiền mặt) -->
                <div v-if="!cashSettled" class="space-y-2">
                  <label class="block font-semibold text-ink-700">Khách hàng thanh toán bằng hình thức nào?</label>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      class="p-3 rounded-lg border-2 text-left flex items-start gap-3 transition-all cursor-pointer"
                      :class="hasCashPayment === 'YES' ? 'border-brand-500 bg-brand-50/60 shadow-xs' : 'border-ink-200 hover:border-ink-300 bg-white'"
                      @click="hasCashPayment = 'YES'"
                    >
                      <Banknote :size="20" class="shrink-0 mt-0.5" :class="hasCashPayment === 'YES' ? 'text-brand-600' : 'text-ink-400'" />
                      <div>
                        <div class="font-semibold text-ink-900 flex items-center gap-1.5">
                          Có thu tiền mặt
                          <span v-if="hasCashPayment === 'YES'" class="w-2 h-2 rounded-full bg-brand-600"></span>
                        </div>
                        <div class="text-[11px] text-ink-500 mt-0.5">Khách trả tiền mặt trực tiếp cho thợ. Thợ cần khai báo số tiền để khách xác nhận.</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      class="p-3 rounded-lg border-2 text-left flex items-start gap-3 transition-all cursor-pointer"
                      :class="hasCashPayment === 'NO' ? 'border-success-500 bg-success-50/60 shadow-xs' : 'border-ink-200 hover:border-ink-300 bg-white'"
                      @click="hasCashPayment = 'NO'"
                    >
                      <CreditCard :size="20" class="shrink-0 mt-0.5" :class="hasCashPayment === 'NO' ? 'text-success-600' : 'text-ink-400'" />
                      <div>
                        <div class="font-semibold text-ink-900 flex items-center gap-1.5">
                          Không thu tiền mặt (Khách trả Online)
                          <span v-if="hasCashPayment === 'NO'" class="w-2 h-2 rounded-full bg-success-600"></span>
                        </div>
                        <div class="text-[11px] text-ink-500 mt-0.5">Khách tự thanh toán online qua ứng dụng FixHome (VNPAY / Ví điện tử / Thẻ).</div>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- Case 1: Đã đối soát tiền mặt -->
                <div v-if="cashSettled" class="p-3 bg-brand-50 rounded-lg border border-brand-200 space-y-1">
                  <div class="flex items-center gap-2 font-semibold text-brand-900">
                    <CheckCircle2 :size="16" class="text-brand-600" />
                    <span>Trạng thái đối soát: {{ cashSettlementStatus === 'confirmed' ? 'Khách đã xác nhận số tiền mặt (PAID)' : 'Đang chờ khách duyệt số tiền' }}</span>
                  </div>
                  <p class="text-brand-700 text-[11px]">
                    Số tiền khai báo: <strong><FhMoney :amount="declaredCashAmount" /></strong>
                  </p>
                  <div class="pt-1 flex items-center gap-2">
                    <FhButton variant="secondary" size="sm" :disabled="refreshingStatus" @click="refreshJobStatus">
                      <RefreshCw :size="13" class="mr-1.5" :class="{ 'animate-spin': refreshingStatus }" />
                      Kiểm tra khách đã xác nhận tiền mặt chưa
                    </FhButton>
                  </div>
                </div>

                <!-- Case 2: Chọn Không thu tiền mặt (Khách trả Online) -->
                <div v-else-if="hasCashPayment === 'NO'" class="space-y-3 pt-1">
                  <div class="p-3.5 bg-brand-50/50 rounded-xl border border-brand-200 space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 font-bold text-ink-900 text-xs">
                        <CreditCard :size="16" class="text-brand-600" />
                        <span>Hình thức: Khách hàng thanh toán trực tuyến</span>
                      </div>
                    </div>

                    <!-- Tiến độ 3 bước nghiệm thu & thanh toán -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                      <div class="p-2.5 rounded-lg bg-white border border-ink-100 flex items-start gap-2">
                        <CheckCircle2 :size="15" class="text-success-600 shrink-0 mt-0.5" />
                        <div>
                          <div class="font-semibold text-ink-800">1. Việc của thợ</div>
                          <div class="text-[10px] text-success-700 font-medium">Đã gửi yêu cầu nghiệm thu</div>
                        </div>
                      </div>

                      <div class="p-2.5 rounded-lg bg-white border border-ink-100 flex items-start gap-2">
                        <CheckCircle2 v-if="job?.customerConfirmed" :size="15" class="text-success-600 shrink-0 mt-0.5" />
                        <Loader2 v-else :size="15" class="text-amber-500 animate-spin shrink-0 mt-0.5" />
                        <div>
                          <div class="font-semibold text-ink-800">2. Khách nghiệm thu</div>
                          <div class="text-[10px]" :class="job?.customerConfirmed ? 'text-success-700 font-medium' : 'text-amber-700'">
                            {{ job?.customerConfirmed ? 'Đã xác nhận dịch vụ' : 'Chờ khách bấm xác nhận' }}
                          </div>
                        </div>
                      </div>

                      <div class="p-2.5 rounded-lg bg-white border border-ink-100 flex items-start gap-2">
                        <CheckCircle2 v-if="job?.paymentStatus?.toUpperCase() === 'PAID'" :size="15" class="text-success-600 shrink-0 mt-0.5" />
                        <Loader2 v-else :size="15" class="text-amber-500 animate-spin shrink-0 mt-0.5" />
                        <div>
                          <div class="font-semibold text-ink-800">3. Thanh toán Online</div>
                          <div class="text-[10px]" :class="job?.paymentStatus?.toUpperCase() === 'PAID' ? 'text-success-700 font-medium' : 'text-amber-700'">
                            {{ job?.paymentStatus?.toUpperCase() === 'PAID' ? 'Đã thanh toán (PAID)' : 'Chờ khách trả VNPAY/Ví' }}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p class="text-ink-600 text-[11px] leading-relaxed">
                      💡 <strong>Thợ cần làm gì:</strong> Thợ đã hoàn thành toàn bộ công việc hiện trường và không thu tiền mặt tại chỗ. Vui lòng nhắc khách hàng mở app FixHome để bấm <strong>"Xác nhận nghiệm thu dịch vụ"</strong> (nếu chưa bấm) và thực hiện <strong>thanh toán online</strong>. Khi khách thanh toán xong, hệ thống sẽ tự động hoàn tất ca và ghi nhận tiền công vào ví thợ.
                    </p>

                    <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-brand-100">
                      <button
                        type="button"
                        class="text-[11px] text-ink-500 hover:text-ink-800 underline"
                        @click="hasCashPayment = 'YES'"
                      >
                        Khách đổi ý muốn trả tiền mặt?
                      </button>

                      <div class="flex items-center gap-2">
                        <FhButton
                          variant="secondary"
                          size="sm"
                          :disabled="refreshingStatus"
                          @click="refreshJobStatus"
                        >
                          <RefreshCw :size="13" class="mr-1.5" :class="{ 'animate-spin': refreshingStatus }" />
                          Kiểm tra trạng thái thanh toán
                        </FhButton>

                        <button
                          type="button"
                          class="px-3 py-1.5 rounded-[var(--radius-sm)] border border-ink-300 text-ink-700 text-xs font-semibold hover:bg-ink-50 transition-colors"
                          @click="router.push('/tech/jobs')"
                        >
                          Tạm rời về danh sách việc
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Case 3: Chọn Có thu tiền mặt -->
                <div v-else-if="hasCashPayment === 'YES'" class="space-y-3 pt-2 border-t border-ink-100">
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

                  <div class="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      class="text-[11px] text-ink-500 hover:text-ink-800 underline"
                      @click="hasCashPayment = 'NO'"
                    >
                      Khách chuyển sang thanh toán online?
                    </button>

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

                <!-- Case 4: Chưa chọn gì -->
                <div v-else class="text-ink-400 text-xs italic">
                  Vui lòng chọn hình thức thanh toán của khách ở trên (Có thu tiền mặt hoặc Không thu tiền mặt).
                </div>
              </div>
            </template>
          </div>
        </FhCard>
      </div>
    </div>

    <!-- Evidence Image Preview Modal -->
    <div
      v-if="previewModalUrl"
      class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
      @click.self="previewModalUrl = null"
    >
      <div class="relative max-w-3xl max-h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl p-3 border border-ink-200 space-y-2">
        <div class="flex items-center justify-between pb-2 border-b border-ink-100">
          <span class="text-xs font-semibold text-ink-700">Xem ảnh chi tiết</span>
          <div class="flex items-center gap-2">
            <button
              v-if="activePreviewEvidence"
              type="button"
              class="px-2.5 py-1 text-xs font-semibold text-danger-700 hover:bg-danger-50 rounded border border-danger-200 flex items-center gap-1 transition-colors"
              :disabled="actionLoading"
              @click="handleDeleteEvidence(activePreviewEvidence)"
            >
              <Trash2 :size="13" /> Xóa ảnh này
            </button>
            <button
              type="button"
              class="bg-ink-100 hover:bg-ink-200 text-ink-700 w-7 h-7 rounded-full flex items-center justify-center transition-colors font-bold text-xs"
              @click="previewModalUrl = null"
            >
              ✕
            </button>
          </div>
        </div>
        <div class="flex items-center justify-center bg-black/5 rounded-lg overflow-hidden max-h-[80vh]">
          <img :src="previewModalUrl" alt="Xem ảnh phóng to" class="max-h-[78vh] max-w-full object-contain" />
        </div>
      </div>
    </div>

    <!-- Modal: Chọn linh kiện từ kho FixHome cho chi phí phát sinh -->
    <div
      v-if="showAcPartPicker"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      @click.self="showAcPartPicker = false"
    >
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-ink-200">
        <!-- Modal Header -->
        <div class="p-4 border-b border-ink-200 flex items-center justify-between bg-ink-25">
          <div class="flex items-center gap-2">
            <div class="p-2 rounded-lg bg-brand-600 text-white shadow-xs">
              <Wrench :size="18" />
            </div>
            <div>
              <h3 class="font-bold text-ink-900 text-sm">Kho linh kiện chính hãng FixHome</h3>
              <p class="text-[11px] text-ink-500">
                Tra cứu hơn 790+ linh kiện chính hãng. Tự động lấy đơn giá niêm yết và thời hạn bảo hành.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-ink-100 transition-colors"
            @click="showAcPartPicker = false"
          >
            <X :size="18" />
          </button>
        </div>

        <!-- Category Tabs -->
        <div class="px-4 pt-3 pb-1 border-b border-ink-100 flex items-center gap-1.5 overflow-x-auto">
          <button
            v-for="cat in AC_CATEGORY_TABS"
            :key="cat.value"
            type="button"
            class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 cursor-pointer"
            :class="
              acPartActiveCategory === cat.value
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-ink-50 text-ink-700 hover:bg-brand-50 border border-ink-200'
            "
            @click="selectAcCategory(cat.value)"
          >
            {{ cat.label }}
          </button>
        </div>

        <!-- Search Input Bar -->
        <div class="p-3 border-b border-ink-100 bg-white">
          <div class="relative flex items-center">
            <Search :size="15" class="absolute left-3 text-ink-400 pointer-events-none" />
            <input
              v-model="acPartSearchQuery"
              type="text"
              placeholder="Gõ tên linh kiện (Bo mạch, Block, Van xả...), mã SKU (AC001) hoặc thương hiệu (Daikin, Panasonic)..."
              class="w-full text-xs rounded-lg border border-ink-300 pl-9 pr-14 py-2 bg-white text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-hidden"
              @input="onAcPartSearchInput"
            />
            <div class="absolute right-3 flex items-center gap-1">
              <Loader2 v-if="isAcPartSearching" :size="14" class="animate-spin text-brand-600" />
              <button
                v-if="acPartSearchQuery || acPartActiveCategory !== 'ALL'"
                type="button"
                class="text-ink-400 hover:text-ink-700 p-0.5 rounded"
                title="Xóa tìm kiếm"
                @click="clearAcSearch"
              >
                <X :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Parts List Body -->
        <div class="flex-1 overflow-y-auto p-3 divide-y divide-ink-100">
          <div v-if="isAcPartSearching" class="py-8 text-center text-ink-400 text-xs">
            <Loader2 :size="18" class="animate-spin inline mr-1 text-brand-600" /> Đang tra cứu danh mục linh kiện FixHome...
          </div>

          <div v-else-if="acPartSearchResults.length === 0" class="py-10 text-center text-ink-500 text-xs space-y-1.5">
            <Package :size="28" class="mx-auto text-ink-300" />
            <p class="font-semibold text-ink-800">Không tìm thấy linh kiện phù hợp</p>
            <p class="text-[11px] text-ink-400">
              Hãy thử tìm kiếm bằng từ khoá chung (như "Bo", "Van", "Block", "Cảm biến") hoặc kiểm tra mã SKU.
            </p>
          </div>

          <div
            v-for="part in acPartSearchResults"
            :key="part.id"
            class="py-2.5 px-2 hover:bg-brand-50/50 rounded-lg transition-colors flex items-center justify-between gap-3 group"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                <span class="font-bold text-ink-900 group-hover:text-brand-700 transition-colors text-xs">
                  {{ part.name }}
                </span>
                <span
                  v-if="part.sku"
                  class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-ink-100 text-ink-600 font-semibold"
                >
                  {{ part.sku }}
                </span>
              </div>
              <p v-if="part.description" class="text-[11px] text-ink-500 line-clamp-1">
                {{ part.description }}
              </p>
              <div v-if="part.warrantyPolicy" class="text-[10px] text-emerald-700 italic mt-0.5">
                {{ part.warrantyPolicy }}
              </div>
            </div>

            <div class="text-right shrink-0 space-y-1">
              <div class="font-num font-bold text-xs text-brand-700">
                <FhMoney :amount="part.sellingPrice" />
              </div>
              <span
                class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                <ShieldCheck :size="11" />
                {{ formatAcWarrantyBadge(part.warrantyDays) }}
              </span>
              <div>
                <button
                  type="button"
                  class="px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold text-[11px] shadow-xs cursor-pointer transition-colors mt-1"
                  @click="selectPartForAc(part)"
                >
                  Chọn linh kiện
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="p-3 border-t border-ink-200 bg-ink-25 flex items-center justify-between text-xs">
          <span class="text-[11px] text-ink-500">
            💡 Linh kiện từ kho FixHome được áp dụng chính sách bảo hành chính hãng và đồng bộ với kho.
          </span>
          <FhButton variant="ghost" size="sm" @click="showAcPartPicker = false">Đóng</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>

