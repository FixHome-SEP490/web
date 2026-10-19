<script setup lang="ts">
import { tidyAddressText } from '../../utils/address-text';
import { toast } from 'vue-sonner';
// src/pages/customer/NewBookingWizardPage.vue
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  LoaderCircle,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
  Play,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton } from '../../components';
import BookingDeviceDetails from '../../components/booking/BookingDeviceDetails.vue';
import BookingStepDock from '../../components/booking/BookingStepDock.vue';
import CompactServiceCard from '../../components/booking/CompactServiceCard.vue';
import SelectedServiceRecap from '../../components/booking/SelectedServiceRecap.vue';
import ServiceCategoryFilters from '../../components/booking/ServiceCategoryFilters.vue';
import ServiceDetailsDialog from '../../components/booking/ServiceDetailsDialog.vue';
import ServiceSearch from '../../components/booking/ServiceSearch.vue';
import {
  filterCatalogServices,
  fixedPriceValue,
  flattenServiceCatalog,
  isServiceBookable,
  normalizePricingMode,
  type BookingCatalogService,
  type BookingPriceFilter,
} from '../../components/booking/booking-service-catalog';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import type { BookingDeviceAttributes, CatalogPricingPreview } from '../../api/catalog-pricing.api';
import { useReferenceData } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { bookingsApi } from '../../api/bookings.api';
import { AI_MAX_IMAGES } from '../../api/ai.api';
import { DESCRIBE_BEFORE_SEND, bookingRecap, useAiConversation, useSharedAiConversation } from '../../composables/useAiConversation';
import { looksLikeImage, normalizeForUpload, prepareForAi } from '../../utils/image-for-ai';
import AiConversationThread from '../../components/chat/AiConversationThread.vue';
import { mediaApi, ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../../api/media.api';
import { SLOT_SHORT, sessionDayLabel, upcomingSessions, type BookingMode, type BookingSlot } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';
import { vnKeyAndClockToDate } from '../../utils/vn-time';

const route = useRoute();
const router = useRouter();
const setBookingLayoutWidth = inject<(wide: boolean) => void>('customer-booking-layout-width', () => {});

/**
 * Two forms on one page. /app/bookings/new: the customer knows what they need
 * and picks the service; no AI anywhere. /app/bookings/ai: the customer only
 * describes the problem, the assistant diagnoses it and chooses the service,
 * and only then can the customer change it.
 */
const isAiFlow = route.meta?.bookingFlow === 'ai';
const step = ref(1);
watch(step, (currentStep) => {
  setBookingLayoutWidth(!isAiFlow && currentStep === 1);
}, { immediate: true });
const loading = ref(false);
/**
 * The create request could have reached the server (network error, timeout)
 * but no answer came back. The server may have committed, so the client never
 * sends that booking again by itself; the customer checks their orders first.
 */
const submitOutcomeUnknown = ref(false);

// Form state
const categories = ref<ServiceCategory[]>([]);
const selectedCategoryId = ref('');
const searchQuery = ref('');
const priceFilter = ref<BookingPriceFilter>('all');
const selectedServiceId = ref<string | null>(null);
/** A service fetched by id for a deep link, kept even when not inside the loaded pages. */
const hydratedService = ref<ServiceItem | null>(null);
const deepLinkError = ref<string | null>(null);
const deepLinkLoading = ref(false);
/** Bumped on every explicit choice or link change so a stale link reply can never win. */
let linkRequestToken = 0;
let initialLinkPending = true;
let explicitServiceIntent = false;
const description = ref('');
// The urgency slider left the form (PO 18/10/2026): "Tới ngay" in the time step says it.
// The booking keeps the standard level the API defaults to, as the mobile app sends.
const urgency = 'NORMAL' as const;
const quantity = ref(1);
const userModifiedDescription = ref(false);
const isDraggingPhoto = ref(false);

// P012: facts the customer reported for the selected catalog service and the
// variant code the server confirmed. Both are cleared whenever the service
// changes; a variant code is only ever submitted after GET
// /services/:id/catalog-v2-pricing answered FIXED_PRICE for it.
const deviceAttributes = ref<BookingDeviceAttributes>({});
const selectedVariantCode = ref<string | null>(null);
// The latest server answer for the selected service. Later steps (the step-4
// recap) repeat only what the server said: a confirmed tier with its scope, or
// a grounded nonbinding range; never a locally computed price.
const catalogPricingPreview = ref<CatalogPricingPreview | null>(null);
const catalogPricingConfirmed = computed(() => (
  catalogPricingPreview.value?.status === 'FIXED_PRICE' ? catalogPricingPreview.value.selectedVariant : null
));
const catalogLaborRange = computed(() => (
  catalogPricingPreview.value?.status === 'INSPECTION_REQUIRED' ? catalogPricingPreview.value.priceRange : null
));

function resetCatalogV2Pricing() {
  deviceAttributes.value = {};
  selectedVariantCode.value = null;
  catalogPricingPreview.value = null;
}

/** Originals above this are refused; anything under it is shrunk before upload. */
const MAX_ORIGINAL_PHOTO_BYTES = 30 * 1024 * 1024;

interface BookingPhotoDraft {
  localId: number;
  previewUrl: string;
  uploadId: string | null;
  /** Kept so the diagnosis step can show the same photos to the assistant. */
  file: File;
}

const uploadedPhotos = ref<BookingPhotoDraft[]>([]);
const uploadingPhoto = ref(false);
const photoInput = ref<HTMLInputElement | null>(null);
const isPhotoFlowDisposed = ref(false);
const isPageDisposed = ref(false);
const activePhotoPreviewUrls = new Set<string>();
let nextPhotoLocalId = 0;

const createPhotoPreviewUrl = (file: File) => {
  const previewUrl = URL.createObjectURL(file);
  activePhotoPreviewUrls.add(previewUrl);
  return previewUrl;
};

const revokePhotoPreviewUrl = (previewUrl: string) => {
  if (!activePhotoPreviewUrls.delete(previewUrl)) return;
  URL.revokeObjectURL(previewUrl);
};

const removePhotoByLocalId = (localId: number) => {
  const index = uploadedPhotos.value.findIndex((photo) => photo.localId === localId);
  if (index < 0) return false;
  const [photo] = uploadedPhotos.value.splice(index, 1);
  revokePhotoPreviewUrl(photo.previewUrl);
  return true;
};

const addresses = ref<UserAddress[]>([]);
const selectedAddressId = ref('');
const isAddressDropdownOpen = ref(false);
const toggleAddressDropdown = () => {
  isAddressDropdownOpen.value = !isAddressDropdownOpen.value;
};
const selectAddress = (id: string) => {
  selectedAddressId.value = id;
  isAddressDropdownOpen.value = false;
};
const selectedAddress = computed(() => addresses.value.find((a) => a.id === selectedAddressId.value));
// Sessions (PO 08/10/2026): morning 8-12 or afternoon 13-18 of one day, Vietnam
// time, at most one booking per technician per session; or "come now".
const bookingMode = ref<BookingMode>('scheduled');
const selectedSession = ref<{ date: string; slot: BookingSlot } | null>(null);
const customerNote = ref('');
const sessions = ref(upcomingSessions(14));

const formattedScheduleDisplay = computed(() => {
  if (bookingMode.value === 'urgent') return 'Tới ngay (thợ gần bạn nhất đang rảnh)';
  if (!selectedSession.value) return 'Chưa chọn buổi';
  return `${sessionDayLabel(selectedSession.value.date)} • ${SLOT_SHORT[selectedSession.value.slot]}`;
});

/** The chosen schedule as the server takes it, or the reason it cannot be sent yet. */
function scheduleForBooking(): { mode: BookingMode; date?: string; slot?: BookingSlot } | { error: string } {
  if (bookingMode.value === 'urgent') return { mode: 'urgent' };
  const chosen = selectedSession.value;
  if (!chosen) return { error: 'Vui lòng chọn ngày và buổi (sáng hoặc chiều).' };
  const startHour = chosen.slot === 'morning' ? 8 : 13;
  if (vnKeyAndClockToDate(chosen.date, startHour, 0).getTime() <= Date.now()) {
    return { error: 'Buổi bạn chọn đã bắt đầu. Vui lòng chọn buổi khác.' };
  }
  return { mode: 'scheduled', date: chosen.date, slot: chosen.slot };
}

// ── Service catalog: the one loaded catalog, filtered locally ──────────────
// `GET /categories` returns the nested catalog. Search and the price/category
// chips filter that loaded set (no server paging is claimed); the selection is
// independent of any filter and of the page the service would be on.
const allServices = computed<BookingCatalogService[]>(() => flattenServiceCatalog(categories.value));

const categoryFilters = computed(() =>
  categories.value.map((cat) => ({ id: cat.id, name: cat.name, count: cat.services?.length ?? 0 })),
);

const priceFilterCounts = computed(() => {
  let fixed = 0;
  let inspection = 0;
  for (const service of allServices.value) {
    const mode = normalizePricingMode(service.pricingMode);
    if (mode === 'fixed_price') fixed += 1;
    else if (mode === 'inspection_required') inspection += 1;
  }
  return { all: allServices.value.length, fixed, inspection };
});

const visibleServices = computed(() =>
  filterCatalogServices(allServices.value, {
    categoryId: selectedCategoryId.value,
    query: searchQuery.value,
    priceFilter: priceFilter.value,
  }),
);

/**
 * The one loaded service with this id, whether it came from the catalog or was
 * hydrated by a deep link. The selection and the details dialog both look up
 * whatever they show through here, so they can never disagree.
 */
function findServiceById(id: string | null): BookingCatalogService | ServiceItem | null {
  if (!id) return null;
  const loaded = allServices.value.find((service) => service.id === id);
  if (loaded) return loaded;
  if (hydratedService.value?.id === id) return hydratedService.value;
  return null;
}

const selectedService = computed<BookingCatalogService | ServiceItem | null>(() => findServiceById(selectedServiceId.value));

/** V2 service codes are owner-approved catalog codes, distinct from legacy IDs. */
const isCatalogV2Selection = computed(() => /^[A-Z]{2}-\d{2}$/.test(selectedService.value?.code ?? ''));
/** A customer must see a current server-confirmed S or inspection result BEFORE moving on. */
const isCatalogV2PreviewReady = computed(() => {
  if (isAiFlow) return true; // Toàn's separate AI flow submits no self-confirmed V2 tier.
  if (!isCatalogV2Selection.value) return true; // Preserve legacy Booking without a V2 endpoint.
  const service = selectedService.value;
  const preview = catalogPricingPreview.value;
  if (!service || !preview || preview.serviceId !== service.id || preview.serviceCode !== service.code) return false;
  if (preview.status === 'FIXED_PRICE') {
    return preview.bindingReady && !!preview.selectedVariant
      && preview.selectedVariant.variantCode === selectedVariantCode.value;
  }
  return preview.status === 'INSPECTION_REQUIRED'
    && !preview.bindingReady && selectedVariantCode.value === null;
});

function requireCatalogV2Preview(): boolean {
  if (isCatalogV2PreviewReady.value) return true;
  toast.warning('Vui lòng chờ hệ thống xác nhận giá hoặc chọn Thử lại trước khi tiếp tục.');
  return false;
}

/** The category label of whatever service was handed in, wherever it came from. */
function categoryNameOf(service: BookingCatalogService | ServiceItem | null): string | null {
  if (!service) return null;
  if ('categoryName' in service && service.categoryName) return service.categoryName;
  return categories.value.find((cat) => cat.id === service.categoryId)?.name ?? null;
}

const selectedCategoryName = computed(() => categoryNameOf(selectedService.value));

const selectedPriceMode = computed(() => normalizePricingMode(selectedService.value?.pricingMode));
const selectedFixedPrice = computed(() => fixedPriceValue(selectedService.value));
const isFixedPrice = computed(() => selectedPriceMode.value === 'fixed_price');
const totalFixedAmount = computed(() => (selectedFixedPrice.value ?? 0) * quantity.value);

/** The selection lives outside the current filters: keep it, explain it, never drop it. */
const selectedOutsideFilter = computed(() => {
  const service = selectedService.value;
  if (!service || !selectedServiceId.value) return false;
  return !visibleServices.value.some((item) => item.id === service.id);
});

const stepItems = computed(() =>
  isAiFlow
    ? [
        { id: 1, label: 'Mô tả sự cố' },
        { id: 3, label: 'Trò chuyện với AI' },
        { id: 2, label: 'Địa chỉ & Giờ' },
        { id: 4, label: 'Xác nhận' },
      ]
    : [
        { id: 1, label: isFixedPrice.value ? 'Dịch vụ & Số lượng' : 'Dịch vụ & Mô tả' },
        { id: 2, label: 'Địa chỉ & Giờ' },
        { id: 4, label: 'Xác nhận' },
      ],
);
const stepIndex = computed(() => stepItems.value.findIndex((item) => item.id === step.value));

/**
 * The assistant conversation this booking continues, when the customer came
 * from the assistant. Step 3 adds to the same conversation, and the booking
 * sends it so the technician starts with a summary of what was said.
 */
const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const aiSessionFromChat = (() => {
  if (!isAiFlow) return null;
  const raw = typeof route.query.aiSession === 'string' ? route.query.aiSession : '';
  return SESSION_PATTERN.test(raw) ? raw : null;
})();

/**
 * Step 3 is a conversation, not a single answer: the assistant may ask back
 * (its knowledge base works through a checklist), and the customer answers,
 * asks something else, adds photos or asks for another service before going
 * on. AI failure never blocks the booking; the customer can always continue.
 */
// Arriving from the assistant, step 3 continues that very conversation: same
// thread on screen, nothing repeated to the AI. Otherwise it starts its own.
const sharedConversation = useSharedAiConversation();
const continuesAssistant =
  !!aiSessionFromChat &&
  sharedConversation.sessionId.value === aiSessionFromChat &&
  sharedConversation.turnCount.value > 0;
const aiConversation = continuesAssistant ? sharedConversation : useAiConversation({ sessionId: aiSessionFromChat });
const aiSessionId = computed(() => {
  if (!isAiFlow) return null;
  const id = aiConversation.sessionId.value;
  return id && SESSION_PATTERN.test(id) ? id : null;
});
const aiSuggested = computed(() => aiConversation.pinnedService.value);
// The latest reply may only answer a question; the appliance comes from the last one that named it.
const aiRecap = computed(() => {
  if (!aiSessionId.value) return null;
  const last = aiConversation.lastReply.value;
  const device = last?.device ?? [...aiConversation.messages.value].reverse().find((m) => m.reply?.device)?.reply?.device ?? null;
  return bookingRecap(last ? { ...last, device } : null);
});
const aiSuggestsOtherService = computed(
  () => !!aiSuggested.value?.serviceId && aiSuggested.value.serviceId !== selectedServiceId.value,
);
const aiSuggestedServiceExists = computed(() =>
  allServices.value.some((service) => service.id === aiSuggested.value?.serviceId),
);

/** Open the conversation with what the customer already gave: description and photos. */
async function startAiConversation() {
  if (aiConversation.turnCount.value > 0 || aiConversation.isThinking.value) return;
  // The assistant diagnoses from words; photos only go along with them (BRX-064).
  if (!description.value.trim()) return;
  void aiConversation.loadHoldingLines();
  const files = uploadedPhotos.value.map((photo) => photo.file).slice(0, AI_MAX_IMAGES);
  const prepared = files.length ? await prepareForAi(files, 0) : { images: [] };
  // These photos are the form's own and are uploaded with it; only the chat's are kept for the booking.
  await aiConversation.sendTurn(description.value.trim(), prepared.images, { keepImagesForBooking: false });
}

/**
 * PO 18/10/2026: the photos and videos the customer sent in the chat with the
 * assistant go with the booking for the technician (the videos were never
 * shown to the AI). They went up in the background as soon as they were sent;
 * the booking takes those that arrived, and the confirm step says where each
 * one is, with a retry or a way to leave it out, so a weak connection never
 * blocks booking without the customer knowing why.
 */
const chatItems = computed(() => (isAiFlow ? aiConversation.attachments.value : []));
const chatUploads = computed(() =>
  isAiFlow ? aiConversation.uploads.value : { total: 0, done: 0, failed: 0, busy: 0, progress: 1 },
);
/** A booking holds five photos, the form's own first: the chat's beyond that stay out (said on the confirm step). */
const chatPhotoRoom = computed(() => Math.max(0, 5 - uploadedPhotos.value.length));
const chatPhotosLeftOut = computed(() => Math.max(0, chatItems.value.filter((item) => item.kind === 'image').length - chatPhotoRoom.value));
const chatAttachmentSummary = computed(() => {
  const parts: string[] = [];
  const photos = uploadedPhotos.value.length + Math.min(chatPhotoRoom.value, chatItems.value.filter((item) => item.kind === 'image').length);
  const videos = chatItems.value.filter((item) => item.kind === 'video').length;
  if (photos) parts.push(`${photos} ảnh`);
  if (videos) parts.push(`${videos} video`);
  return parts.join(', ');
});

/** A booking holds five photos, the form's own first, and two videos. */
function chatUploadIdsForBooking(): string[] {
  const done = chatItems.value.filter((item) => item.state === 'done' && item.uploadId);
  const images = done.filter((item) => item.kind === 'image').slice(0, chatPhotoRoom.value);
  const videos = done.filter((item) => item.kind === 'video').slice(0, 2);
  return [...images, ...videos].map((item) => item.uploadId as string);
}

/** "Ảnh 2", "Video 1": numbered within their own kind. */
function chatItemLabel(item: (typeof chatItems.value)[number]): string {
  const sameKind = chatItems.value.filter((entry) => entry.kind === item.kind);
  return `${item.kind === 'video' ? 'Video' : 'Ảnh'} ${sameKind.indexOf(item) + 1}`;
}

const chatPercent = (fraction: number) => `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;

/** Where one of the chat's photos or videos is, for the confirm step. */
function chatItemStatus(item: (typeof chatItems.value)[number]): string {
  if (item.state === 'preparing') return `Đang nén ${chatPercent(item.video?.progress ?? 0)}`;
  if (item.state === 'ready') return 'Chờ gửi';
  if (item.state === 'uploading') return item.retrying ? 'Mạng chập chờn, đang gửi lại' : `Đang gửi ${chatPercent(item.progress)}`;
  if (item.state === 'done') return 'Đã gửi';
  return item.error || 'Chưa gửi được';
}

// Anything that failed while the customer was away (signed out, offline) is tried again here.
onMounted(() => {
  if (isAiFlow) aiConversation.retryFailed();
});

/** Start again from the current description and photos, e.g. after editing step 1. */
async function restartAiConversation() {
  aiConversation.startOver();
  await startAiConversation();
}

/**
 * In the AI form the assistant chooses the service: its first pick is applied,
 * but only when the customer has not chosen one. A later or late suggestion is
 * a proposal and never overwrites an explicit customer choice.
 */
watch(
  () => aiConversation.pinnedService.value,
  (suggested) => {
    if (!isAiFlow || !suggested?.serviceId || selectedServiceId.value || explicitServiceIntent || deepLinkLoading.value || deepLinkError.value) return;
    if (aiSuggestedServiceExists.value) selectServiceById(suggested.serviceId, { syncCategoryFilter: true });
  },
);

/** After the diagnosis, the customer may still pick another service themselves. */
function chooseService(id: string) {
  selectServiceById(id, { syncCategoryFilter: true });
}

/** AI form, step 1 -> the conversation. */
function startAiStep() {
  if (!description.value.trim()) {
    toast.warning('Vui lòng mô tả sơ bộ tình trạng thiết bị để trợ lý phân tích.');
    return;
  }
  step.value = 3;
  void startAiConversation();
}

/** AI form, conversation -> address and time, once a service is chosen. */
function leaveAiStep() {
  if (!selectedServiceId.value) {
    toast.warning('Trợ lý chưa chọn được dịch vụ. Anh/chị trả lời thêm hoặc chọn dịch vụ ở bên dưới khung chat.');
    return;
  }
  step.value = 2;
}

/** The assistant suggested another service: book that one instead. */
function useSuggestedService() {
  const wanted = aiSuggested.value?.serviceId;
  if (!wanted) return;
  selectServiceById(wanted, { syncCategoryFilter: true });
}

// ── Selecting the one service ──────────────────────────────────────────────

/**
 * Apply a selection. `syncCategoryFilter` is used for choices that arrive from
 * outside the finder (deep link, AI) so the selected service is visible in
 * context; a card click never moves the filter.
 */
function selectServiceById(id: string, options: { syncCategoryFilter?: boolean; fromLink?: boolean } = {}) {
  if (!options.fromLink) {
    invalidatePendingLink();
    explicitServiceIntent = true;
  }
  const fromCatalog = allServices.value.find((service) => service.id === id);
  const fromLink = hydratedService.value?.id === id ? hydratedService.value : null;
  const service: ServiceItem | null = fromCatalog ?? fromLink;
  if (selectedServiceId.value !== id) resetCatalogV2Pricing();
  selectedServiceId.value = id;
  deepLinkError.value = null;
  if (!service) return;
  if (options.syncCategoryFilter) {
    const categoryId = service.categoryId || '';
    if (categoryId && categories.value.some((cat) => cat.id === categoryId)) {
      selectedCategoryId.value = categoryId;
      searchQuery.value = '';
      priceFilter.value = 'all';
    }
  }
  if (!userModifiedDescription.value) syncDefaultDescription(service);
}

/** A card click: an explicit customer choice outruns any pending link lookup. */
async function onServiceSelected(id: string) {
  selectServiceById(id);
  await nextTick();
  if (!isAiFlow && !isPageDisposed.value && step.value === 1 && selectedServiceId.value === id
    && window.matchMedia('(max-width: 1099px)').matches) {
    scrollToRequirements();
  }
}

function invalidatePendingLink() {
  linkRequestToken += 1;
  initialLinkPending = false;
  deepLinkLoading.value = false;
}

function clearServiceSelection() {
  invalidatePendingLink();
  explicitServiceIntent = true;
  resetCatalogV2Pricing();
  selectedServiceId.value = null;
  hydratedService.value = null;
  deepLinkError.value = null;
  if (!userModifiedDescription.value) description.value = '';
}

async function revealSelectedService() {
  selectedCategoryId.value = '';
  searchQuery.value = '';
  priceFilter.value = 'all';
  await nextTick();
  if (isPageDisposed.value || step.value !== 1) return;
  const selectedRow = finderRef.value?.querySelector<HTMLElement>('[data-testid="booking-service-card"][aria-pressed="true"]');
  const target = selectedRow ?? finderRef.value?.parentElement?.querySelector<HTMLElement>('[data-testid="selected-service-recap"]');
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

function changeService() {
  const search = finderRef.value?.querySelector<HTMLInputElement>('[data-testid="booking-service-search"]');
  search?.focus({ preventScroll: true });
  search?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
}

/** Category chips and the price chips are filters only — never a selection. */
function onCategoryFilterChange(id: string) {
  selectedCategoryId.value = id;
}

// ── Service details dialog ─────────────────────────────────────────────────
// `Chi tiết` on a card opens the full description of that service; opening it
// never changes the selection. Only the dialog's explicit confirm button picks
// the service, exactly like a card click does.
const detailsServiceId = ref<string | null>(null);
const detailsService = computed(() => findServiceById(detailsServiceId.value));
const detailsCategoryName = computed(() => categoryNameOf(detailsService.value));
const isDetailsSelected = computed(() => !!detailsServiceId.value && detailsServiceId.value === selectedServiceId.value);

function openServiceDetails(id: string) {
  detailsServiceId.value = id;
}

function closeServiceDetails() {
  detailsServiceId.value = null;
}

/** An explicit choice from inside the dialog: same path as a card click. */
function chooseServiceFromDetails(id: string) {
  closeServiceDetails();
  onServiceSelected(id);
}

// ── Smart step-1 dock ──────────────────────────────────────────────────────
// While the customer scrolls the finder, the Previous/Next dock floats over the
// page; as soon as the real footer is on screen, the dock leaves and the footer
// becomes the one action set again. Without an observer there is no dock at
// all, and the footer is always there.
const stepFooterRef = ref<HTMLElement | null>(null);
const showStepDock = ref(false);
let stepFooterObserver: IntersectionObserver | null = null;

function armStepFooterObserver() {
  stepFooterObserver?.disconnect();
  stepFooterObserver = null;
  showStepDock.value = false;
  const target = stepFooterRef.value;
  if (!target || typeof IntersectionObserver === 'undefined') return;
  stepFooterObserver = new IntersectionObserver((entries) => {
    const entry = entries.find((item) => item.target === stepFooterRef.value);
    if (!entry) return;
    // Only a footer that is below the viewport calls for the dock: it is the
    // scrolled-away case, never a second action set next to the real one.
    showStepDock.value = entry.intersectionRatio < 1 && entry.boundingClientRect.top > 0;
  }, { threshold: [0, 1] });
  stepFooterObserver.observe(target);
}

watch(stepFooterRef, () => armStepFooterObserver());

// Move focus with the action, only when the customer was already using it.
watch(showStepDock, async (show) => {
  const active = document.activeElement as HTMLElement | null;
  const source = show ? stepFooterRef.value : document.querySelector('[data-testid="booking-step-dock"]');
  if (!active || !source?.contains(active)) return;
  const action = active.dataset.testid?.endsWith('next') ? 'next' : 'back';
  await nextTick();
  if (isPageDisposed.value || step.value !== 1) return;
  const target = show
    ? document.querySelector<HTMLElement>(`[data-testid="booking-step-dock-${action}"]`)
    : stepFooterRef.value?.querySelector<HTMLElement>(`[data-testid="step1-${action}"]`);
  target?.focus({ preventScroll: true });
}, { flush: 'pre' });

watch(step, (next) => {
  if (next === 1) return;
  detailsServiceId.value = null;
  showStepDock.value = false;
});

/** What the dock tells the customer about the decision still ahead. */
const dockHint = computed(() => {
  if (isAiFlow) {
    return description.value.trim() ? 'Trợ lý sẽ phân tích mô tả của bạn' : 'Mô tả sự cố để trợ lý phân tích';
  }
  return selectedService.value?.name ?? 'Chọn một dịch vụ để tiếp tục';
});

// ── Mobile shortcut to the real request form ───────────────────────────────
const requirementsRef = ref<HTMLElement | null>(null);
const finderRef = ref<HTMLElement | null>(null);

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Only an explicit mobile service choice guides the customer to device facts. */
function scrollToRequirements() {
  const target = requirementsRef.value;
  if (!target || typeof target.scrollIntoView !== 'function') return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function resetServiceFilters() {
  selectedCategoryId.value = '';
  searchQuery.value = '';
  priceFilter.value = 'all';
}

function syncDefaultDescription(service: ServiceItem) {
  const unit = service.unit?.trim() || 'thiết bị';
  if (normalizePricingMode(service.pricingMode) === 'fixed_price') {
    description.value = `Yêu cầu dịch vụ niêm yết: ${service.name}${quantity.value > 1 ? ` (${quantity.value} ${unit})` : ''}`;
  } else {
    description.value = `Yêu cầu dịch vụ: ${service.name}`;
  }
}

function setQuantity(value: number) {
  quantity.value = Math.max(1, Math.min(99, Math.round(value)));
  const service = selectedService.value;
  if (service && !userModifiedDescription.value && normalizePricingMode(service.pricingMode) === 'fixed_price') {
    syncDefaultDescription(service);
  }
}

// ── Deep link: ?serviceId= hydrates the exact service, never a fallback ───
const DEEP_LINK_ERROR_MESSAGE = 'Dịch vụ trong liên kết không còn khả dụng. Bạn vui lòng chọn một dịch vụ bên dưới.';

function readServiceIdFromQuery(): string {
  const raw = route.query.serviceId;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * A valid `?serviceId=` selects exactly that service. When the loaded catalog
 * does not contain it, the service is read by id independently of the list.
 * A stale reply (a previous id, or after an explicit choice) is dropped.
 */
async function hydrateServiceFromLink(rawId?: string) {
  const id = (rawId ?? readServiceIdFromQuery()).trim();
  invalidatePendingLink();
  const token = linkRequestToken;
  explicitServiceIntent = false;
  selectedServiceId.value = null;
  hydratedService.value = null;
  deepLinkError.value = null;
  if (!userModifiedDescription.value) description.value = '';
  if (step.value === 2 || step.value === 4) step.value = isAiFlow ? 3 : 1;
  if (!id) return;

  const inCatalog = allServices.value.find((service) => service.id === id);
  if (inCatalog) {
    if (inCatalog.isActive === false) {
      deepLinkError.value = DEEP_LINK_ERROR_MESSAGE;
      return;
    }
    selectServiceById(id, { syncCategoryFilter: true, fromLink: true });
    return;
  }

  deepLinkLoading.value = true;
  try {
    const service = await catalogApi.getService(id);
    if (token !== linkRequestToken || isPageDisposed.value) return;
    if (!service || service.id !== id || service.isActive === false) {
      deepLinkError.value = DEEP_LINK_ERROR_MESSAGE;
      return;
    }
    hydratedService.value = service;
    selectServiceById(id, { syncCategoryFilter: true, fromLink: true });
  } catch {
    if (token !== linkRequestToken || isPageDisposed.value) return;
    hydratedService.value = null;
    deepLinkError.value = DEEP_LINK_ERROR_MESSAGE;
  } finally {
    if (token === linkRequestToken && !isPageDisposed.value) deepLinkLoading.value = false;
  }
}

watch(
  () => route.query.serviceId,
  (next, prev) => {
    const nextId = typeof next === 'string' ? next : '';
    const prevId = typeof prev === 'string' ? prev : '';
    if (nextId === prevId) return;
    void hydrateServiceFromLink(nextId);
  },
  { flush: 'sync' },
);

// ── Catalog and addresses: independent loads with their own retry ─────────
const reference = useReferenceData();
const catalogLoading = ref(true);
const catalogLoadFailed = ref(false);
const addressesLoading = ref(true);
const addressesLoadFailed = ref(false);
const queryFiltersApplied = ref(false);
let catalogRequestId = 0;

/** Optional ?q=/?category= links only fill the filters; they never select a service. */
function applyIncomingQueryFilters(cats: ServiceCategory[]) {
  if (queryFiltersApplied.value) return;
  queryFiltersApplied.value = true;
  const query = typeof route.query.q === 'string' ? route.query.q.trim() : '';
  if (query) searchQuery.value = query;
  const category = typeof route.query.category === 'string' ? route.query.category.trim() : '';
  if (category) {
    const match = cats.find((cat) => cat.id === category || cat.slug === category || cat.code === category);
    if (match) selectedCategoryId.value = match.id;
  }
}

/** What the customer already told the assistant is their description and counts as typed. */
function applyIncomingDescription() {
  const fromChat = typeof route.query.desc === 'string' ? route.query.desc.trim().slice(0, 1000) : '';
  if (fromChat) {
    description.value = fromChat;
    userModifiedDescription.value = true;
  }
}

/** From the floating assistant: diagnosis done, so the customer goes straight to address and time. */
function maybeJumpToSchedule() {
  if (isAiFlow && continuesAssistant && selectedServiceId.value && description.value.trim()) step.value = 2;
}

async function loadCategories() {
  const requestId = ++catalogRequestId;
  const intent = linkRequestToken;
  catalogLoading.value = true;
  catalogLoadFailed.value = false;
  try {
    const cats = await reference(queryKeys.reference.categories({ activeOnly: true }), () => catalogApi.getCategories(true));
    if (isPageDisposed.value || requestId !== catalogRequestId) return;
    categories.value = cats;
    applyIncomingQueryFilters(cats);
    if (initialLinkPending && intent === linkRequestToken) {
      await hydrateServiceFromLink();
      if (requestId === catalogRequestId && !isPageDisposed.value) maybeJumpToSchedule();
    }
  } catch {
    if (!isPageDisposed.value && requestId === catalogRequestId) catalogLoadFailed.value = true;
  } finally {
    if (!isPageDisposed.value && requestId === catalogRequestId) catalogLoading.value = false;
  }
}

async function loadAddresses() {
  addressesLoading.value = true;
  addressesLoadFailed.value = false;
  try {
    const loaded = await profileApi.getAddresses();
    if (isPageDisposed.value) return;
    addresses.value = loaded;
    // Retry keeps the customer's choice when that address still exists.
    if (!loaded.some((address) => address.id === selectedAddressId.value)) {
      const preferred = loaded.find((address) => address.isDefault) ?? loaded[0];
      selectedAddressId.value = preferred?.id ?? '';
    }
  } catch {
    if (!isPageDisposed.value) addressesLoadFailed.value = true;
  } finally {
    if (!isPageDisposed.value) addressesLoading.value = false;
  }
}

onMounted(() => {
  applyIncomingDescription();
  void loadCategories();
  void loadAddresses();
  armStepFooterObserver();
});

onBeforeUnmount(() => {
  setBookingLayoutWidth(false);
  isPageDisposed.value = true;
  isPhotoFlowDisposed.value = true;
  stepFooterObserver?.disconnect();
  stepFooterObserver = null;
  for (const previewUrl of activePhotoPreviewUrls) {
    URL.revokeObjectURL(previewUrl);
  }
  activePhotoPreviewUrls.clear();
  uploadedPhotos.value = [];
});

// ── Photos ─────────────────────────────────────────────────────────────────
const openPhotoPicker = () => {
  if (uploadingPhoto.value) return;
  if (uploadedPhotos.value.length >= 5) {
    toast.warning('Tối đa 5 ảnh thiết bị.');
    return;
  }
  photoInput.value?.click();
};

const handlePhotoFiles = async (files: File[]) => {
  if (files.length === 0 || uploadingPhoto.value || isPhotoFlowDisposed.value) return;

  const remaining = 5 - uploadedPhotos.value.length;
  if (remaining <= 0) {
    toast.warning('Tối đa 5 ảnh thiết bị.');
    return;
  }
  if (files.length > remaining) toast.warning('Tối đa 5 ảnh thiết bị.');
  const toUpload = files.slice(0, remaining);

  uploadingPhoto.value = true;
  try {
    // A phone photo is redrawn as a JPEG of at most 2048 px before it goes up (EXIF rotation applied):
    // a 10 MB original becomes a few hundred KB, so it no longer times out on a weak connection and
    // its type always matches what the server checks. All photos are prepared and sent at once.
    const usable: { original: File; file: File }[] = [];
    for (const original of toUpload) {
      if (!looksLikeImage(original)) {
        toast.warning(`"${original.name}" không phải ảnh. Vui lòng chọn ảnh chụp thiết bị.`);
        continue;
      }
      if (original.size > MAX_ORIGINAL_PHOTO_BYTES) {
        toast.warning(`Ảnh "${original.name}" quá lớn (trên 30 MB).`);
        continue;
      }
      usable.push({ original, file: original });
    }
    const normalized = await Promise.all(usable.map(({ original }) => normalizeForUpload(original)));
    const ready: File[] = [];
    usable.forEach(({ original }, i) => {
      const file = normalized[i]
        // Not readable here (e.g. HEIC outside Safari): send it as it is only if the server takes it.
        ?? (ALLOWED_MEDIA_MIME_TYPES.includes(original.type) && original.size <= MAX_MEDIA_SIZE_BYTES ? original : null);
      if (file) ready.push(file);
      else toast.error(`Chưa đọc được ảnh "${original.name}". Vui lòng chọn ảnh JPG hoặc PNG.`);
    });
    if (isPhotoFlowDisposed.value) return;

    const drafts: BookingPhotoDraft[] = ready.map((file) => ({
      localId: nextPhotoLocalId++,
      previewUrl: createPhotoPreviewUrl(file),
      uploadId: null,
      file,
    }));
    uploadedPhotos.value.push(...drafts);
    await Promise.all(drafts.map(async (photo) => {
      try {
        const uploaded = await mediaApi.uploadBookingPhoto(photo.file);
        if (isPhotoFlowDisposed.value) return;
        const currentPhoto = uploadedPhotos.value.find((item) => item.localId === photo.localId);
        if (currentPhoto) currentPhoto.uploadId = uploaded.uploadId;
      } catch (err) {
        console.error(`[NewBookingWizardPage] Upload booking photo failed for "${photo.file.name}":`, err);
        const photoStillSelected = removePhotoByLocalId(photo.localId);
        if (!isPhotoFlowDisposed.value && photoStillSelected) {
          toast.error(`Không thể tải ảnh "${photo.file.name}" lên. Vui lòng thử lại.`);
        }
      }
    }));
  } finally {
    if (!isPhotoFlowDisposed.value) uploadingPhoto.value = false;
  }
};

const handlePhotoSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  await handlePhotoFiles(files);
};

const onPhotoDrop = async (event: DragEvent) => {
  isDraggingPhoto.value = false;
  if (event.dataTransfer?.files) {
    await handlePhotoFiles(Array.from(event.dataTransfer.files));
  }
};

const removePhoto = (idx: number) => {
  const photo = uploadedPhotos.value[idx];
  if (photo) removePhotoByLocalId(photo.localId);
};

/**
 * Symptom suggestions follow the selected service's category, falling back to
 * the active category filter, then to a generic list. Symptom chips never
 * change the filters or the selection.
 */
const symptomCategoryName = computed(() => {
  const service = selectedService.value;
  if (service) {
    const fromCatalog = 'categoryName' in service ? service.categoryName : '';
    if (fromCatalog) return fromCatalog;
    return categories.value.find((cat) => cat.id === service.categoryId)?.name ?? '';
  }
  return categories.value.find((cat) => cat.id === selectedCategoryId.value)?.name ?? '';
});

const categorySymptoms = computed<string[]>(() => {
  const name = symptomCategoryName.value.toLowerCase();
  if (name.includes('lạnh') || name.includes('điều hòa')) {
    return [
      'Máy không mát / kém lạnh',
      'Chảy nước dàn lạnh',
      'Kêu to / rung lắc mạnh',
      'Mùi hôi ẩm mốc',
      'Không nhận điều khiển',
      'Bám tuyết ống đồng',
    ];
  }
  if (name.includes('nước') || name.includes('điện')) {
    return [
      'Rò rỉ lavabo / bồn rửa',
      'Nghẹt cống / thoát sàn chậm',
      'Mất nước / áp lực nước yếu',
      'Chập điện / nhảy aptomat',
      'Hỏng van vòi xịt / vòi sen',
    ];
  }
  if (name.includes('bếp')) {
    return [
      'Bếp từ báo lỗi không nóng',
      'Hút mùi kêu to / hút yếu',
      'Bếp mất nguồn',
      'Rò điện khi chạm vỏ',
      'Nứt mặt kính / kẹt cảm ứng',
    ];
  }
  if (name.includes('cửa') || name.includes('khóa')) {
    return [
      'Khóa vân tay không nhận',
      'Hết pin / mất nguồn khóa',
      'Kẹt chốt / khó đóng mở',
      'Xệ bản lề / kêu cót két',
      'Cần đổi mã số / thẻ từ',
    ];
  }
  return [
    'Thiết bị không lên nguồn',
    'Phát ra tiếng ồn lạ',
    'Cần bảo dưỡng vệ sinh',
    'Hỏng linh kiện / cần thay mới',
  ];
});

/**
 * Symptoms are written into the description as comma-separated parts. Only the
 * first one keeps its capital letter, so every comparison ignores case;
 * comparing case-sensitively let the later chips be appended again and again.
 */
const descriptionParts = () => description.value.split(',').map((part) => part.trim()).filter(Boolean);
const sameSymptom = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');

function hasSymptom(symptom: string) {
  return descriptionParts().some((part) => sameSymptom(part, symptom));
}

/** A chip toggles: first click adds the symptom, a second click takes it out. */
function toggleSymptom(symptom: string) {
  userModifiedDescription.value = true;
  const isTemplate =
    description.value.startsWith('Yêu cầu dịch vụ niêm yết:') || description.value.startsWith('Yêu cầu dịch vụ:');
  if (!description.value.trim() || isTemplate) {
    description.value = symptom;
    return;
  }
  const parts = descriptionParts();
  if (parts.some((part) => sameSymptom(part, symptom))) {
    const rest = parts.filter((part) => !sameSymptom(part, symptom)).join(', ');
    description.value = rest ? rest.charAt(0).toLocaleUpperCase('vi') + rest.slice(1) : '';
    return;
  }
  description.value = `${description.value.trim().replace(/,\s*$/, '')}, ${symptom.toLocaleLowerCase('vi')}`;
}

// ── Moving through the wizard ──────────────────────────────────────────────
function goToStep2() {
  if (!requireCatalogV2Preview()) return;
  const service = selectedService.value;
  if (!service || !selectedServiceId.value) {
    toast.warning('Vui lòng chọn một dịch vụ cụ thể.');
    return;
  }
  const mode = normalizePricingMode(service.pricingMode);
  if (mode === null) {
    toast.warning('Dịch vụ này chưa xác định được cách tính giá. Vui lòng chọn dịch vụ khác.');
    return;
  }
  if (mode === 'fixed_price' && fixedPriceValue(service) === null) {
    toast.warning('Dịch vụ này chưa có giá niêm yết. Vui lòng chọn dịch vụ khác.');
    return;
  }
  if (!description.value.trim()) {
    if (mode === 'fixed_price') {
      syncDefaultDescription(service);
    } else {
      toast.warning('Vui lòng mô tả sơ bộ tình trạng lỗi của thiết bị.');
      return;
    }
  }
  step.value = 2;
}

async function goToNextStepFrom2() {
  if (!selectedAddressId.value && addresses.value.length > 0) {
    toast.warning('Vui lòng chọn địa chỉ sửa chữa.');
    return;
  }
  sessions.value = upcomingSessions(14);
  const schedule = scheduleForBooking();
  if ('error' in schedule) {
    toast.warning(schedule.error);
    return;
  }
  if (customerNote.value.trim().length > 1000) {
    toast.warning('Ghi chú cho thợ tối đa 1000 ký tự.');
    return;
  }

  step.value = 4;
}

/**
 * The synchronous guard is the first statement: a second click while the first
 * request is in flight can never create a second booking. When no answer came
 * back at all, the outcome is unknown (the server may have committed), so the
 * booking is not posted again and the customer checks their orders first.
 */
async function createAndFindTech() {
  if (loading.value || submitOutcomeUnknown.value) return;
  if (uploadingPhoto.value) {
    toast.warning('Vui lòng chờ ảnh tải lên hoàn tất trước khi đặt lịch.');
    return;
  }
  const photoUploadIds = uploadedPhotos.value.flatMap((photo) => photo.uploadId ? [photo.uploadId] : []);
  if (photoUploadIds.length !== uploadedPhotos.value.length) {
    toast.warning('Không thể xác nhận ảnh. Vui lòng chọn lại ảnh trước khi đặt lịch.');
    return;
  }

  // The session may have started while the customer was reading the summary.
  const schedule = scheduleForBooking();
  if ('error' in schedule) {
    toast.warning(schedule.error);
    sessions.value = upcomingSessions(14);
    step.value = 2;
    return;
  }

  // Photos and videos from the chat went up in the background; booking only waits for, or skips, what has not.
  if (chatUploads.value.busy > 0) {
    toast.warning('Ảnh, video trong cuộc trò chuyện vẫn đang gửi cho thợ. Chờ một chút, hoặc bấm Bỏ ở mục Gửi kèm cho kỹ thuật viên.');
    return;
  }
  if (chatUploads.value.failed > 0) {
    toast.warning('Có ảnh hoặc video chưa gửi được. Bấm Thử lại, hoặc Bỏ để đặt thợ không kèm.');
    return;
  }
  const chatUploadIds = chatUploadIdsForBooking();

  const service = selectedService.value;
  if (!service || !selectedServiceId.value) {
    toast.warning('Vui lòng chọn một dịch vụ cụ thể.');
    return;
  }
  if (!isServiceBookable(service)) {
    toast.warning('Dịch vụ đã chọn chưa thể đặt. Vui lòng chọn dịch vụ khác.');
    return;
  }
  if (!requireCatalogV2Preview()) {
    step.value = 1;
    return;
  }
  if (!selectedAddressId.value) {
    toast.warning('Vui lòng thêm địa chỉ trước khi đặt lịch.');
    return;
  }

  loading.value = true;
  try {
    const booking = await bookingsApi.createBooking({
      serviceId: selectedServiceId.value,
      addressId: selectedAddressId.value,
      description: isAiFlow ? (aiConversation.customerWords() || description.value) : description.value,
      ...schedule,
      ...(customerNote.value.trim() ? { customerNote: customerNote.value.trim() } : {}),
      quantity: isFixedPrice.value ? quantity.value : 1,
      urgency,
      photoUploadIds: [...photoUploadIds, ...chatUploadIds],
      ...(aiSessionId.value ? { aiSessionId: aiSessionId.value } : {}),
      // P012: only customer-reported facts and a server-confirmed variant code
      // ever travel; the booking transaction re-validates both.
      ...(Object.keys(deviceAttributes.value).length > 0 ? { deviceAttributes: { ...deviceAttributes.value } } : {}),
      ...(selectedVariantCode.value ? { selectedVariantCode: selectedVariantCode.value } : {}),
    });
    router.push(`/app/bookings/${booking.id}/candidates`);
  } catch (error: unknown) {
    console.error('[NewBookingWizardPage] createBooking failed:', error);
    const errObj = error as {
      response?: { data?: { error?: { message?: string }; message?: string } };
    } | undefined;

    // No HTTP answer: the request may still have reached the server. Freeze
    // the button instead of blindly POSTing a possible duplicate.
    if (!errObj?.response) {
      submitOutcomeUnknown.value = true;
      toast.warning('Chưa xác nhận được kết quả gửi yêu cầu. Vui lòng kiểm tra Đơn của tôi trước khi gửi lại.');
      return;
    }

    const backendMessage =
      errObj.response.data?.error?.message ||
      errObj.response.data?.message;

    let friendlyMessage = userFacingError(error, 'Không thể tạo yêu cầu đặt thợ. Vui lòng thử lại.');
    if (typeof backendMessage === 'string') {
      if (
        backendMessage.includes('valid future') ||
        backendMessage.includes('khung giờ') ||
        backendMessage.includes('future')
      ) {
        friendlyMessage = 'Khung giờ hẹn đã trôi qua hoặc không hợp lệ. Vui lòng chọn lại thời gian hẹn.';
        step.value = 2;
      } else if (backendMessage.includes('Address and positive integer quantity required')) {
        friendlyMessage = 'Vui lòng kiểm tra lại địa chỉ và số lượng yêu cầu.';
      } else if (backendMessage.includes('suspended')) {
        friendlyMessage = 'Tài khoản của bạn tạm thời bị tạm dừng đặt lịch.';
      }
    }
    toast.warning(friendlyMessage);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="w-full space-y-5 sm:space-y-6"
    :class="step === 1 && !isAiFlow ? 'pb-[calc(8.5rem_+_env(safe-area-inset-bottom))] lg:pb-24' : 'pb-16'"
  >
    <!-- Stepper. On a phone (PO 18/10/2026) four labels do not fit and were cut after the second:
         there it is "Bước 2/4" with the step's name and a progress bar; wider screens show every step. -->
    <div class="bg-white rounded-2xl sm:rounded-full border border-ink-200/90 py-3 sm:py-3.5 px-4 sm:px-8 shadow-[var(--shadow-e1)]" data-testid="booking-stepper">
      <div class="sm:hidden space-y-2" data-testid="booking-stepper-compact">
        <p class="flex items-baseline justify-between gap-3 text-sm">
          <span class="font-semibold text-ink-900 truncate">{{ stepItems[stepIndex]?.label }}</span>
          <span class="shrink-0 text-xs text-ink-500 font-num">Bước {{ stepIndex + 1 }}/{{ stepItems.length }}</span>
        </p>
        <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden" role="progressbar" :aria-valuenow="stepIndex + 1" aria-valuemin="1" :aria-valuemax="stepItems.length">
          <div class="h-full rounded-full bg-brand-600 transition-[width] duration-300" :style="{ width: `${((stepIndex + 1) / stepItems.length) * 100}%` }"></div>
        </div>
      </div>
      <div class="hidden sm:flex items-center justify-center overflow-x-auto no-scrollbar gap-6">
        <template v-for="(item, index) in stepItems" :key="item.id">
          <div
            class="flex shrink-0 items-center gap-2 transition-colors duration-200 sm:gap-2.5"
            :class="stepIndex >= index ? 'font-bold text-brand-600' : 'font-medium text-ink-400'"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold font-num shadow-[var(--shadow-e1)] transition-all duration-300 sm:h-8 sm:w-8 sm:text-sm"
              :class="stepIndex >= index ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'"
            >
              {{ index + 1 }}
            </span>
            <span class="whitespace-nowrap text-xs sm:text-sm">{{ item.label }}</span>
          </div>

          <div
            v-if="index < stepItems.length - 1"
            class="h-[2px] w-8 shrink-0 rounded-full transition-colors duration-300 sm:w-16"
            :class="stepIndex > index ? 'bg-brand-600' : 'bg-ink-200'"
          ></div>
        </template>
      </div>
    </div>

    <!-- Catalog failed: its own retry; addresses are loaded separately below. -->
    <div
      v-if="catalogLoadFailed"
      role="alert"
      class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-danger-200 bg-danger-50 p-3.5 text-sm text-danger-700"
      data-testid="booking-catalog-error"
    >
      <span>Chưa tải được dịch vụ, vui lòng thử lại.</span>
      <FhButton variant="secondary" size="sm" @click="loadCategories">Thử lại</FhButton>
    </div>

    <!-- A deep link that no longer points at a bookable service: guided, never a silent fallback. -->
    <div
      v-if="deepLinkError"
      role="alert"
      class="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-900"
      data-testid="booking-deeplink-error"
    >
      <AlertTriangle :size="17" class="mt-0.5 shrink-0 text-warning-600" />
      <span>{{ deepLinkError }}</span>
    </div>
    <p v-if="deepLinkLoading && !deepLinkError" class="text-xs text-ink-500">Đang tải dịch vụ từ liên kết…</p>

    <!-- Animated step containers -->
    <Transition name="wizard-step" mode="out-in">
      <!-- Step 1: service choice and request details -->
      <div v-if="step === 1" key="step-1" class="space-y-5" :class="isAiFlow ? 'mx-auto w-full max-w-3xl' : ''">
        <div class="space-y-3 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-e1)] sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              {{ isAiFlow ? 'Mô tả sự cố để trợ lý AI phân tích' : 'Chọn dịch vụ sửa chữa' }}
            </h2>
            <span class="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
              <ShieldCheck :size="14" class="text-brand-600" />
              <span>Thợ tay nghề chuẩn • Báo giá minh bạch</span>
            </span>
          </div>
          <p class="text-xs leading-relaxed text-ink-500 sm:text-sm">
            <template v-if="isAiFlow">
              Kể tình trạng thiết bị và gửi ảnh nếu có. Trợ lý sẽ phân tích, hỏi thêm nếu cần và chọn dịch vụ phù hợp; bạn không cần tự chọn dịch vụ.
            </template>
            <template v-else>
              Tìm theo tên hoặc lỗi rồi chọn đúng một dịch vụ chính. Giá hiển thị theo đúng dữ liệu dịch vụ; dịch vụ khảo sát sẽ được thợ báo giá trước khi sửa.
            </template>
          </p>
        </div>

        <div
          class="booking-step1-grid"
          :class="!isAiFlow ? 'booking-step1-grid--catalog' : 'space-y-5'"
        >
          <!-- Search and named categories share one compact service finder. -->
          <div ref="finderRef" class="min-w-0 space-y-4 booking-services-column">
            <template v-if="!isAiFlow">
              <ServiceSearch
                v-if="!catalogLoading && categories.length > 0"
                :query="searchQuery"
                :price-filter="priceFilter"
                :counts="priceFilterCounts"
                @update:query="searchQuery = $event"
                @update:price-filter="priceFilter = $event"
              />

              <ServiceCategoryFilters
                v-if="catalogLoading || categories.length > 0"
                :categories="categoryFilters"
                :model-value="selectedCategoryId"
                :loading="catalogLoading"
                @update:model-value="onCategoryFilterChange"
              />

              <!-- The chosen service stays chosen when a filter hides it -->
              <div
                v-if="selectedOutsideFilter"
                class="flex flex-wrap items-center justify-between gap-x-3 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 px-3 text-xs text-ink-700"
                data-testid="selected-outside-filter"
                role="status"
              >
                <span class="py-2">Dịch vụ đã chọn vẫn được giữ.</span>
                <button type="button" class="min-h-11 rounded-[var(--radius-sm)] font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600" data-testid="selected-outside-filter-show" @click="revealSelectedService">
                  Xem dịch vụ đã chọn
                </button>
              </div>

              <div
                v-if="catalogLoading"
                class="grid grid-cols-1 gap-2"
                aria-busy="true"
                aria-label="Đang tải dịch vụ"
              >
                <div v-for="i in 3" :key="i" class="space-y-3 rounded-[var(--radius-md)] border border-ink-200 bg-white p-3.5">
                  <div class="flex items-center gap-2">
                    <FhSkeleton width="36px" height="36px" rounded="md" />
                    <FhSkeleton width="60%" height="16px" />
                  </div>
                  <FhSkeleton width="85%" height="12px" />
                  <FhSkeleton width="45%" height="12px" />
                </div>
              </div>

              <div v-else-if="visibleServices.length > 0" class="grid grid-cols-1 gap-2" role="group" aria-label="Danh sách dịch vụ" data-testid="booking-service-list">
                <CompactServiceCard
                  v-for="svc in visibleServices"
                  :key="svc.id"
                  :service="svc"
                  :selected="svc.id === selectedServiceId"
                  :show-category="!selectedCategoryId"
                  @select="onServiceSelected"
                  @details="openServiceDetails"
                />
              </div>

              <div
                v-else-if="categories.length > 0"
                class="space-y-2 rounded-[var(--radius-lg)] border border-dashed border-ink-300 bg-ink-50 p-8 text-center"
                data-testid="booking-services-empty"
              >
                <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-400 shadow-[var(--shadow-e1)]">
                  <Search :size="18" />
                </div>
                <p class="text-xs font-bold text-ink-800">Không tìm thấy dịch vụ phù hợp</p>
                <p class="text-[11px] text-ink-500">Thử từ khóa khác, hoặc bỏ bộ lọc để xem toàn bộ dịch vụ.</p>
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-sm)] border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
                  @click="resetServiceFilters"
                >
                  Xóa bộ lọc
                </button>
              </div>

              <p v-else-if="!catalogLoadFailed" class="rounded-[var(--radius-md)] border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-xs text-ink-500" data-testid="booking-catalog-empty">
                Hiện chưa có dịch vụ nào khả dụng. Vui lòng thử lại sau.
              </p>
              <p v-if="!catalogLoading && !catalogLoadFailed && categories.length > 0" class="text-xs text-ink-600" role="status" data-testid="booking-service-result-count">
                Đã hiển thị {{ visibleServices.length }} dịch vụ
              </p>
            </template>
          </div>

          <!-- Request panel: recap, description and private photo dropzone. -->
          <div class="min-w-0 space-y-5 booking-request-column">
            <div v-if="!isAiFlow">
              <SelectedServiceRecap
                :service="selectedService"
                :category-name="selectedCategoryName"
                :quantity="quantity"
                @clear="clearServiceSelection"
                @change="changeService"
                @update:quantity="setQuantity"
              />
            </div>

            <div ref="requirementsRef" class="booking-request-configuration space-y-5" :tabindex="!isAiFlow ? -1 : undefined" :aria-label="!isAiFlow ? 'Thông tin yêu cầu' : undefined" data-testid="booking-request-configuration">
            <!-- P012: device facts and the server's own scope/price preview for
                 the selected service. Remounts (= refetch, no stale facts) on
                 every service change through its key. -->
            <BookingDeviceDetails
              v-if="!isAiFlow && selectedServiceId"
              :key="selectedServiceId"
              :service-id="selectedServiceId"
              :device-attributes="deviceAttributes"
              :selected-variant-code="selectedVariantCode"
              @update:device-attributes="deviceAttributes = $event"
              @update:selected-variant-code="selectedVariantCode = $event"
              @update:preview="catalogPricingPreview = $event"
            />

            <!-- Description & quick symptom chips -->
            <section id="booking-requirements" class="scroll-mt-20 space-y-3 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-e1)] sm:p-6">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label for="booking-description" class="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <Sparkles :size="15" class="text-brand-600" />
                  <span>{{ isAiFlow ? 'Mô tả sự cố' : 'Mô tả tình trạng' }}</span>
                  <span v-if="!isAiFlow && !isFixedPrice" class="font-bold text-danger-600">*</span>
                </label>
                <span
                  v-if="!isAiFlow && isFixedPrice"
                  class="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700"
                >
                  <Zap :size="12" /> Giá niêm yết (không bắt buộc mô tả lỗi)
                </span>
                <span v-else class="text-[11px] text-ink-500">
                  {{ isAiFlow ? 'Trợ lý đọc mô tả để chẩn đoán' : 'Mô tả càng rõ, thợ chuẩn bị linh kiện càng sát' }}
                </span>
              </div>

              <div v-if="!isAiFlow" class="space-y-1.5">
                <div class="flex items-center gap-1 text-[11px] text-ink-500">
                  <Sparkles :size="12" class="text-brand-600" />
                  <span>Gợi ý triệu chứng phổ biến (bấm để thêm nhanh vào mô tả):</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="sym in categorySymptoms"
                    :key="sym"
                    type="button"
                    class="min-h-11 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[11px] font-medium transition-colors active:scale-95 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-brand-600"
                    :class="hasSymptom(sym)
                      ? 'border-brand-300 bg-brand-50 font-bold text-brand-700'
                      : 'border-ink-200 bg-ink-50 text-ink-700 hover:border-brand-200 hover:bg-white'"
                    :aria-pressed="hasSymptom(sym)"
                    @click="toggleSymptom(sym)"
                  >
                    {{ hasSymptom(sym) ? '✓' : '+' }} {{ sym }}
                  </button>
                </div>
              </div>

              <p v-if="isAiFlow && !description.trim()" class="text-xs text-warning-700" data-testid="ai-needs-description">
                {{ DESCRIBE_BEFORE_SEND }}
              </p>

              <textarea
                id="booking-description"
                v-model="description"
                rows="3"
                class="w-full rounded-[var(--radius-md)] border border-ink-200 bg-white p-3.5 leading-relaxed text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none"
                :class="isAiFlow ? 'text-xs sm:text-sm' : 'text-base sm:text-sm'"
                :placeholder="isFixedPrice
                  ? 'Ghi chú thêm cho thợ (ví dụ: vị trí đặt thiết bị, lưu ý lúc tới nhà, tầng lầu...)'
                  : 'Mô tả hiện tượng hư hỏng (ví dụ: máy lạnh chảy nước ở dàn lạnh trong nhà, quạt kêu to và không mát...)'"
                data-testid="booking-description"
                @input="userModifiedDescription = true"
              ></textarea>
            </section>

            <!-- One private, keyboard-operable dropzone; uploaded previews retain individual removal. -->
            <section class="space-y-3" aria-label="Ảnh hiện trạng">
              <input
                ref="photoInput"
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                class="hidden"
                @change="handlePhotoSelected"
              />

              <div
                role="button"
                tabindex="0"
                class="flex min-h-[100px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed px-3 py-3 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
                :class="[
                  isDraggingPhoto
                    ? 'border-brand-600 bg-brand-50 ring-4 ring-brand-500/20'
                    : 'border-brand-300 bg-brand-50/30 hover:bg-brand-50/70',
                  uploadingPhoto ? 'pointer-events-none opacity-60' : '',
                ]"
                :aria-label="uploadingPhoto ? 'Đang tải ảnh hiện trạng' : `Tải ảnh hiện trạng, ${uploadedPhotos.length} trên 5 ảnh đã chọn`"
                :aria-disabled="uploadingPhoto"
                data-testid="booking-photo-picker"
                @click="openPhotoPicker"
                @keydown.enter.prevent="openPhotoPicker"
                @keydown.space.prevent="openPhotoPicker"
                @dragover.prevent="isDraggingPhoto = true"
                @dragleave.prevent="isDraggingPhoto = false"
                @drop.prevent="onPhotoDrop"
              >
                <LoaderCircle v-if="uploadingPhoto" :size="22" class="animate-spin text-brand-600" aria-hidden="true" />
                <Camera v-else :size="22" class="text-brand-600" aria-hidden="true" />
                <span class="text-xs font-medium text-ink-700">Thêm ảnh hoặc kéo thả vào đây</span>
              </div>
              <span v-if="uploadingPhoto" class="sr-only" role="status" aria-live="polite">Đang tải ảnh hiện trạng…</span>

              <div v-if="uploadedPhotos.length > 0" class="mt-3 flex flex-wrap gap-3">
                <div
                  v-for="(photo, idx) in uploadedPhotos"
                  :key="photo.localId"
                  class="group relative h-20 w-20 overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-ink-100 shadow-[var(--shadow-e1)]"
                >
                  <img :src="photo.previewUrl" alt="Ảnh thiết bị đã chọn" class="h-full w-full object-cover" />

                  <div v-if="!photo.uploadId" class="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Sparkles class="animate-spin" :size="16" />
                  </div>

                  <button
                    type="button"
                    class="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-danger-600"
                    aria-label="Xóa ảnh"
                    @click.stop="removePhoto(idx)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
              </div>
            </section>

            </div>
          </div>
        </div>

        <!-- Step 1 footer: the real action set. While the dock floats over the
             page this footer is inert, so only one set of actions is ever
             reachable by keyboard or screen reader. -->
        <div
          ref="stepFooterRef"
          :inert="showStepDock ? true : undefined"
          class="flex flex-col-reverse gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="booking-step1-footer"
        >
          <FhButton
            variant="ghost"
            size="md"
            class="w-full sm:w-auto"
            :tabindex="showStepDock ? -1 : undefined"
            data-testid="step1-back"
            @click="router.back()"
          >
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>

          <div class="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <div v-if="selectedService && !isAiFlow" class="min-w-0 text-left sm:text-right">
              <p class="truncate text-[11px] text-ink-500">
                Đã chọn: <span class="font-bold text-ink-800">{{ selectedService.name }}</span>
              </p>
              <p v-if="isFixedPrice && selectedFixedPrice !== null" class="text-xs font-bold text-brand-700 font-num">
                Tạm tính: <FhMoney :amount="totalFixedAmount" />
              </p>
              <p v-else-if="isFixedPrice" class="text-[11px] font-semibold text-warning-800">Chưa có giá niêm yết</p>
              <p v-else class="text-[11px] font-semibold text-brand-600">Khảo sát &amp; Báo giá tận nơi</p>
            </div>
            <p
              v-if="!isAiFlow && !selectedServiceId"
              class="text-[11px] text-ink-500 sm:max-w-[14rem] sm:text-right"
              data-testid="booking-select-service-hint"
            >
              Chọn một dịch vụ ở danh sách để tiếp tục.
            </p>

            <FhButton
              variant="primary"
              size="lg"
              class="w-full px-7 shadow-[var(--shadow-e1)] sm:w-auto"
              :disabled="isAiFlow ? !description.trim() : !selectedServiceId || !isCatalogV2PreviewReady"
              :tabindex="showStepDock ? -1 : undefined"
              data-testid="step1-next"
              @click="isAiFlow ? startAiStep() : goToStep2()"
            >
              <template v-if="isAiFlow">Phân tích cùng AI <Sparkles :size="15" class="ml-1.5" /></template>
              <template v-else>Tiếp tục: Địa chỉ &amp; Giờ <ArrowRight :size="15" class="ml-1.5" /></template>
            </FhButton>
          </div>
        </div>

        <!-- The floating Previous/Next dock for the scrolled-away state. -->
        <BookingStepDock
          :show="showStepDock"
          :next-label="isAiFlow ? 'Phân tích cùng AI' : 'Tiếp tục'"
          :next-disabled="isAiFlow ? !description.trim() : !selectedServiceId || !isCatalogV2PreviewReady"
          :hint="dockHint"
          @back="router.back()"
          @next="isAiFlow ? startAiStep() : goToStep2()"
        />
      </div>

      <!-- Step 2: address and schedule -->
      <div v-else-if="step === 2" key="step-2" class="mx-auto w-full max-w-3xl space-y-6">
        <div class="space-y-6 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-6 shadow-[var(--shadow-e1)] sm:p-8">
          <div>
            <h2 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              Thông tin lịch hẹn &amp; Địa chỉ
            </h2>
            <p class="mt-1 text-xs text-ink-500">
              Chọn địa chỉ nơi thợ sẽ tới sửa chữa và khung giờ thuận tiện nhất cho bạn.
            </p>
          </div>

          <div class="space-y-5 text-xs sm:text-sm">
            <div>
              <div class="mb-2 flex items-center justify-between">
                <label class="block text-xs font-bold text-ink-800 sm:text-sm">
                  Địa chỉ sửa chữa <span class="font-bold text-danger-600">*</span>
                </label>
                <span v-if="!addressesLoading && addresses.length > 0" class="text-[11px] font-medium text-ink-500">
                  {{ addresses.length }} địa chỉ đã lưu
                </span>
              </div>

              <div v-if="addressesLoading" class="space-y-2.5" aria-busy="true" aria-label="Đang tải địa chỉ">
                <FhSkeleton v-for="i in 2" :key="i" height="64px" rounded="lg" />
              </div>

              <div
                v-else-if="addressesLoadFailed"
                role="alert"
                class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-danger-200 bg-danger-50 p-3.5 text-sm text-danger-700"
                data-testid="booking-addresses-error"
              >
                <span>Chưa tải được địa chỉ, vui lòng thử lại.</span>
                <FhButton variant="secondary" size="sm" @click="loadAddresses">Thử lại</FhButton>
              </div>

              <!-- Custom select box for addresses -->
              <div v-else-if="addresses.length > 0" class="space-y-2">
                <div
                  role="button"
                  tabindex="0"
                  class="flex cursor-pointer select-none items-center justify-between gap-3 rounded-[var(--radius-md)] border bg-white p-4 shadow-[var(--shadow-e1)] transition-colors duration-200"
                  :class="isAddressDropdownOpen
                    ? 'border-brand-600 ring-2 ring-brand-500/20'
                    : 'border-ink-200 hover:border-brand-300 hover:bg-ink-50/40'"
                  @click="toggleAddressDropdown"
                  @keydown.enter.prevent="toggleAddressDropdown"
                  @keydown.space.prevent="toggleAddressDropdown"
                >
                  <div class="flex min-w-0 flex-1 items-start gap-3">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-brand-100 bg-brand-50 text-brand-600">
                      <MapPin :size="18" />
                    </div>
                    <div class="min-w-0 flex-1 space-y-0.5">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-ink-900 sm:text-sm">
                          {{ selectedAddress?.label || 'Địa chỉ tiếp nhận' }}
                        </span>
                        <span v-if="selectedAddress?.isDefault" class="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                          Mặc định
                        </span>
                      </div>
                      <div class="truncate text-xs font-medium text-ink-700">
                        {{ selectedAddress?.line1 ? tidyAddressText(selectedAddress.line1) : 'Vui lòng chọn địa chỉ' }}
                      </div>
                      <div v-if="selectedAddress" class="truncate text-[11px] text-ink-400">
                        {{ selectedAddress.district }}, {{ selectedAddress.province }}
                      </div>
                    </div>
                  </div>

                  <div class="flex shrink-0 items-center gap-2 pl-2">
                    <span class="hidden text-xs font-semibold text-brand-600 sm:inline">
                      {{ isAddressDropdownOpen ? 'Thu gọn' : 'Thay đổi' }}
                    </span>
                    <div
                      class="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-ink-100/80 text-ink-600 transition-transform duration-200"
                      :class="{ 'rotate-180 bg-brand-50 text-brand-600': isAddressDropdownOpen }"
                    >
                      <ChevronDown :size="15" />
                    </div>
                  </div>
                </div>

                <Transition name="fade-slide">
                  <div v-if="isAddressDropdownOpen" class="space-y-1.5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-2.5 shadow-[var(--shadow-e2)]">
                    <div class="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      Chọn địa chỉ trong sổ địa chỉ
                    </div>

                    <div class="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                      <div
                        v-for="addr in addresses"
                        :key="addr.id"
                        role="option"
                        :aria-selected="selectedAddressId === addr.id"
                        class="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] border p-3 transition-colors duration-150"
                        :class="selectedAddressId === addr.id
                          ? 'border-brand-600 bg-brand-50/70 ring-1 ring-brand-500/20'
                          : 'border-ink-100 bg-white hover:border-ink-200 hover:bg-ink-50'"
                        @click="selectAddress(addr.id)"
                      >
                        <div class="flex min-w-0 flex-1 items-start gap-2.5">
                          <div class="shrink-0 pt-0.5">
                            <div
                              class="flex h-4 w-4 items-center justify-center rounded-full border transition-colors"
                              :class="selectedAddressId === addr.id
                                ? 'border-brand-600 bg-brand-600 text-white'
                                : 'border-ink-300 bg-white'"
                            >
                              <div v-if="selectedAddressId === addr.id" class="h-1.5 w-1.5 rounded-full bg-white"></div>
                            </div>
                          </div>

                          <div class="min-w-0 flex-1 space-y-0.5">
                            <div class="flex items-center gap-1.5">
                              <span class="text-xs font-bold text-ink-900">{{ addr.label || 'Địa chỉ' }}</span>
                              <span v-if="addr.isDefault" class="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                                Mặc định
                              </span>
                            </div>
                            <div class="truncate text-xs font-medium text-ink-700">{{ tidyAddressText(addr.line1) }}</div>
                            <div class="truncate text-[11px] text-ink-400">{{ addr.district }}, {{ addr.province }}</div>
                          </div>
                        </div>

                        <CheckCircle2 v-if="selectedAddressId === addr.id" :size="16" class="shrink-0 text-brand-600" />
                      </div>
                    </div>

                    <div class="border-t border-ink-100 pt-1.5">
                      <router-link
                        to="/app/profile"
                        class="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-2 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-50"
                      >
                        <Plus :size="14" /> Thêm địa chỉ mới vào sổ địa chỉ
                      </router-link>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Empty address state -->
              <div v-else class="space-y-3 rounded-[var(--radius-md)] border border-dashed border-ink-300 bg-ink-50/70 p-6 text-center">
                <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-400 shadow-[var(--shadow-e1)]">
                  <MapPin :size="18" />
                </div>
                <div>
                  <p class="text-xs font-bold text-ink-800 sm:text-sm">Bạn chưa có địa chỉ nào được lưu</p>
                  <p class="mt-0.5 text-[11px] text-ink-500">Vui lòng thêm địa chỉ nhà để thợ có thể tới sửa chữa.</p>
                </div>
                <router-link
                  to="/app/profile"
                  class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-[var(--shadow-e1)] transition-colors hover:bg-brand-700"
                >
                  <Plus :size="14" /> Thêm địa chỉ mới
                </router-link>
              </div>
            </div>

            <div class="space-y-3 border-t border-ink-100 pt-4">
              <label class="flex items-center gap-1.5 text-xs font-bold text-ink-800 sm:text-sm">
                <CalendarIcon :size="15" class="text-brand-600" />
                <span>Thời gian thợ tới</span>
              </label>
              <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kiểu đặt lịch">
                <button
                  type="button"
                  class="rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-xs"
                  :class="bookingMode === 'scheduled' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500' : 'border-ink-200 bg-white'"
                  role="radio"
                  :aria-checked="bookingMode === 'scheduled'"
                  data-testid="mode-scheduled"
                  @click="bookingMode = 'scheduled'"
                >
                  <span class="block font-bold text-ink-900">Đặt trước theo buổi</span>
                  <span class="block text-ink-500">Chọn ngày và buổi sáng hoặc chiều</span>
                </button>
                <button
                  type="button"
                  class="rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-xs"
                  :class="bookingMode === 'urgent' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500' : 'border-ink-200 bg-white'"
                  role="radio"
                  :aria-checked="bookingMode === 'urgent'"
                  data-testid="mode-urgent"
                  @click="bookingMode = 'urgent'"
                >
                  <span class="flex items-center gap-1 font-bold text-ink-900"><Clock :size="13" /> Tới ngay</span>
                  <span class="block text-ink-500">Thợ gần bạn đang rảnh tới trong khoảng 2 giờ</span>
                </button>
              </div>
              <BookingSessionPicker v-if="bookingMode === 'scheduled'" v-model="selectedSession" :sessions="sessions" compact />
            </div>

            <div class="space-y-1.5 border-t border-ink-100 pt-4">
              <label for="customer-note" class="block text-xs font-bold text-ink-800 sm:text-sm">
                Ghi chú cho thợ <span class="font-normal text-ink-400">(không bắt buộc)</span>
              </label>
              <textarea
                id="customer-note"
                v-model="customerNote"
                rows="2"
                maxlength="1000"
                placeholder="Ví dụ: gọi trước khi tới, nhà trong hẻm, gửi xe ở đâu..."
                class="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
                data-testid="customer-note"
              />
            </div>
          </div>

          <div class="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <FhButton variant="ghost" size="md" @click="step = isAiFlow ? 3 : 1">
              <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
            </FhButton>
            <FhButton variant="primary" size="md" class="w-full sm:w-auto" data-testid="step2-next" @click="goToNextStepFrom2">
              Tiếp tục: Xác nhận đơn <ArrowRight :size="15" class="ml-1.5" />
            </FhButton>
          </div>
        </div>
      </div>

      <!-- Step 3: conversation with the assistant before booking -->
      <div v-else-if="step === 3" key="step-3" class="mx-auto w-full max-w-3xl space-y-6">
        <div class="space-y-5 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-e1)] sm:p-8">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Trò chuyện với trợ lý AI</h2>
              <p class="mt-1 text-sm text-ink-500 text-pretty">
                Trợ lý có thể hỏi thêm để chẩn đoán sát hơn. Bạn trả lời, hỏi thêm, gửi thêm ảnh hoặc nhờ đổi dịch vụ ngay tại đây, xong rồi mới đặt thợ.
              </p>
            </div>
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 disabled:opacity-40"
              :disabled="aiConversation.isThinking.value || aiConversation.turnCount.value === 0"
              data-testid="ai-restart"
              @click="restartAiConversation"
            >
              <RotateCcw :size="15" />
              <span class="hidden whitespace-nowrap sm:inline">Hỏi lại từ đầu</span>
            </button>
          </div>

          <div class="h-[30rem] max-h-[65dvh] overflow-hidden rounded-[var(--radius-md)] border border-ink-200">
            <AiConversationThread :conversation="aiConversation" placeholder="Trả lời trợ lý hoặc hỏi thêm..." class="h-full">
              <template #pinned>
                <div
                  v-if="aiSuggested && aiSuggestsOtherService && aiSuggestedServiceExists && selectedServiceId && !aiConversation.isThinking.value"
                  class="flex flex-wrap items-center gap-3 border-t border-brand-100 bg-brand-50 px-3.5 py-2.5"
                  data-testid="ai-suggested-service"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-brand-700">Trợ lý gợi ý dịch vụ</p>
                    <p class="text-sm font-semibold text-ink-900">{{ aiSuggested.nameVi }}</p>
                  </div>
                  <button
                    type="button"
                    class="whitespace-nowrap rounded-[var(--radius-sm)] bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                    data-testid="ai-use-suggested"
                    @click="useSuggestedService"
                  >
                    Đổi sang dịch vụ này
                  </button>
                </div>
                <div class="space-y-2 border-t border-ink-100 bg-ink-50 px-3.5 py-2.5 text-sm" data-testid="ai-current-service">
                  <div v-if="selectedService" class="flex min-w-0 items-center gap-2">
                    <span class="whitespace-nowrap text-ink-500">Dịch vụ sẽ đặt:</span>
                    <span class="min-w-0 truncate font-semibold text-ink-900">{{ selectedService.name }}</span>
                  </div>
                  <p v-else-if="aiConversation.turnCount.value > 0 && !aiConversation.isThinking.value" class="text-warning-800" data-testid="ai-pick-service-hint">Chọn dịch vụ ở ô bên dưới để đặt thợ.</p>
                  <p v-else class="text-ink-500">Trợ lý sẽ chọn dịch vụ phù hợp sau khi chẩn đoán.</p>
                  <label
                    v-if="aiConversation.turnCount.value > 0 && !aiConversation.isThinking.value"
                    class="flex items-center gap-2 text-ink-600"
                  >
                    <span class="whitespace-nowrap">Đổi dịch vụ khác:</span>
                    <select
                      class="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-2 text-sm text-ink-900"
                      data-testid="ai-manual-service"
                      :value="selectedServiceId"
                      @change="chooseService(($event.target as HTMLSelectElement).value)"
                    >
                      <option value="" disabled>Chọn dịch vụ</option>
                      <option v-for="srv in allServices" :key="srv.id" :value="srv.id">{{ srv.categoryName }} · {{ srv.name }}</option>
                    </select>
                  </label>
                </div>
              </template>
            </AiConversationThread>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-ink-100 pt-5">
            <FhButton variant="ghost" size="md" @click="step = 1">
              <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
            </FhButton>
            <FhButton variant="primary" size="md" :disabled="aiConversation.isThinking.value || !selectedServiceId" data-testid="ai-continue" @click="leaveAiStep">
              Đặt thợ ngay <ArrowRight :size="15" class="ml-1.5" />
            </FhButton>
          </div>
        </div>
      </div>

      <!-- Step 4: final summary & launch matching -->
      <div v-else-if="step === 4" key="step-4" class="mx-auto w-full max-w-3xl space-y-6">
        <div class="space-y-6 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-6 shadow-[var(--shadow-e1)] sm:p-8">
          <div>
            <h2 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              Xác nhận yêu cầu sửa chữa
            </h2>
            <p class="mt-1 text-xs text-ink-500">
              Kiểm tra lại thông tin trước khi kích hoạt hệ thống ghép thợ FixHome.
            </p>
          </div>

          <div v-if="aiSessionId" class="space-y-3">
            <dl
              v-if="aiRecap"
              data-testid="ai-recap"
              class="space-y-2 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 p-4 text-sm"
            >
              <div v-if="aiRecap.device" class="flex gap-3">
                <dt class="w-28 shrink-0 text-ink-500">Thiết bị</dt>
                <dd class="text-ink-900">{{ aiRecap.device }}</dd>
              </div>
              <div v-if="aiRecap.faults.length" class="flex gap-3">
                <dt class="w-28 shrink-0 text-ink-500">Có thể là</dt>
                <dd class="text-ink-900">{{ aiRecap.faults.join(', ') }}</dd>
              </div>
              <div v-if="aiRecap.told.length" class="flex gap-3">
                <dt class="w-28 shrink-0 text-ink-500">Bạn đã cho biết</dt>
                <dd class="text-ink-900">
                  <ul class="space-y-0.5" data-testid="ai-recap-told">
                    <li v-for="line in aiRecap.told" :key="line" class="text-pretty">{{ line }}</li>
                  </ul>
                </dd>
              </div>
            </dl>
            <p
              data-testid="ai-summary-note"
              class="rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-900 text-pretty"
            >
              Kỹ thuật viên nhận việc sẽ thấy tóm tắt phần bạn trao đổi với trợ lý AI, nên bạn không cần kể lại từ đầu.
            </p>
          </div>

          <div class="space-y-4 text-xs sm:text-sm">
            <div class="space-y-3 divide-y divide-ink-200/60 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 p-5">
              <div class="flex items-center justify-between pb-2">
                <span class="text-ink-500">Dịch vụ yêu cầu:</span>
                <span class="font-bold text-ink-900">{{ selectedService?.name }}</span>
              </div>

              <template v-if="isFixedPrice && selectedFixedPrice !== null">
                <div class="flex items-center justify-between py-2">
                  <span class="text-ink-500">Đơn giá niêm yết:</span>
                  <span class="font-semibold text-ink-800 font-num">
                    <FhMoney :amount="selectedFixedPrice" /> / {{ selectedService?.unit || 'thiết bị' }}
                  </span>
                </div>
                <div class="flex items-center justify-between py-2">
                  <span class="text-ink-500">Số lượng:</span>
                  <span class="font-bold text-ink-900 font-num">{{ quantity }} {{ selectedService?.unit || 'thiết bị' }}</span>
                </div>
                <div class="flex items-center justify-between border-y border-brand-200 bg-brand-50/70 -mx-5 px-5 py-3">
                  <span class="font-bold text-brand-900">Tổng thanh toán niêm yết:</span>
                  <span class="text-base font-bold text-brand-700 font-num">
                    <FhMoney :amount="totalFixedAmount" />
                  </span>
                </div>
              </template>

              <!-- P012: the tier the server confirmed for the reported device
                   facts; the binding snapshot is created by POST /bookings. -->
              <template v-else-if="catalogPricingConfirmed">
                <div class="flex items-center justify-between py-2" data-testid="confirm-v2-scope">
                  <span class="text-ink-500">Phạm vi tiền công:</span>
                  <span class="max-w-xs text-right font-semibold text-ink-900 text-pretty">{{ catalogPricingConfirmed.scopeVi }}</span>
                </div>
                <div class="flex items-center justify-between py-2" data-testid="confirm-v2-price">
                  <span class="text-ink-500">Tiền công theo phạm vi:</span>
                  <span class="font-bold text-brand-700 font-num">
                    <FhMoney :amount="catalogPricingConfirmed.laborPriceVnd" />
                  </span>
                </div>
              </template>
              <template v-else-if="catalogLaborRange">
                <div class="flex items-center justify-between py-2" data-testid="confirm-v2-range">
                  <span class="text-ink-500">Tiền công tham khảo:</span>
                  <span class="font-semibold text-warning-800 font-num">
                    <FhMoney :amount="catalogLaborRange.minLaborVnd" /> – <FhMoney :amount="catalogLaborRange.maxLaborVnd" />
                  </span>
                </div>
              </template>

              <div class="flex items-center justify-between py-2">
                <span class="text-ink-500">Địa chỉ thực hiện:</span>
                <span class="max-w-xs text-right font-semibold text-ink-900">
                  {{ tidyAddressText(addresses.find((a) => a.id === selectedAddressId)?.line1) }}
                </span>
              </div>
              <div class="flex items-center justify-between py-2">
                <span class="text-ink-500">Thời gian hẹn:</span>
                <span class="text-right font-bold text-ink-900">{{ formattedScheduleDisplay }}</span>
              </div>

            </div>

            <div
              v-if="isFixedPrice && selectedFixedPrice !== null"
              class="flex items-start gap-3 rounded-[var(--radius-md)] border border-success-200 bg-success-50 p-4 text-success-900"
            >
              <CheckCircle2 :size="18" class="mt-0.5 shrink-0 text-success-600" />
              <p class="text-xs leading-relaxed">
                <strong>Giá niêm yết trọn gói:</strong> Kỹ thuật viên sẽ có mặt theo đúng giờ hẹn và hoàn thành dịch vụ theo mức giá cố định niêm yết. Quý khách chỉ thanh toán đúng số tiền trên sau khi kỹ thuật viên hoàn thành, không phát sinh chi phí khảo sát.
              </p>
            </div>
            <div
              v-else-if="catalogPricingConfirmed"
              data-testid="confirm-v2-price-note"
              class="flex items-start gap-3 rounded-[var(--radius-md)] border border-success-200 bg-success-50 p-4 text-success-900"
            >
              <CheckCircle2 :size="18" class="mt-0.5 shrink-0 text-success-600" />
              <p class="text-xs leading-relaxed">
                <strong>Tiền công theo phạm vi đã chọn:</strong> Mức tiền công trên do hệ thống ghi nhận theo đúng phạm vi bạn đã chọn, chưa gồm linh kiện và vật tư. Hệ thống chốt đúng phạm vi và mức này khi bạn xác nhận tìm thợ; thợ kiểm tra lại đúng phạm vi tại nhà.
              </p>
            </div>
            <div
              v-else-if="catalogLaborRange"
              data-testid="confirm-v2-range-note"
              class="flex items-start gap-3 rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 p-4 text-warning-900"
            >
              <AlertTriangle :size="18" class="mt-0.5 shrink-0 text-warning-600" />
              <p class="text-xs leading-relaxed">
                <strong>Giá tham khảo — thợ khảo sát và báo giá, khách duyệt.</strong>
                Khoảng tiền công trên chưa gồm linh kiện và vật tư; thợ sẽ kiểm tra tại nhà và gửi báo giá để bạn duyệt trước khi sửa.
              </p>
            </div>
            <div
              v-else
              class="flex items-start gap-3 rounded-[var(--radius-md)] border border-brand-200 bg-brand-50 p-4 text-brand-900"
            >
              <ShieldCheck :size="18" class="mt-0.5 shrink-0 text-brand-600" />
              <p class="text-xs leading-relaxed">
                <strong>Cam kết giá minh bạch:</strong> Thợ FixHome sẽ liên hệ và có mặt tận nơi để khảo sát. Thợ chỉ bắt đầu sửa chữa khi bạn đã đồng ý với báo giá chi tiết.
              </p>
            </div>
            <div v-if="chatAttachmentSummary" class="py-2 border-t border-ink-100 space-y-2" data-testid="confirm-attachments">
              <div class="flex items-center justify-between gap-3">
                <span class="text-ink-500">Gửi kèm cho kỹ thuật viên:</span>
                <span class="font-bold text-ink-900 text-right whitespace-nowrap">{{ chatAttachmentSummary }}</span>
              </div>
              <ul v-if="chatItems.length" class="space-y-1.5">
                <li
                  v-for="item in chatItems"
                  :key="item.id"
                  class="flex items-center gap-3 rounded-xl border px-3 py-2 text-xs"
                  :class="item.state === 'failed' ? 'border-danger-200 bg-danger-50' : 'border-ink-200 bg-ink-50'"
                  :data-testid="item.kind === 'video' ? 'confirm-video' : 'confirm-photo'"
                  :data-state="item.state"
                >
                  <img v-if="item.kind === 'image' && item.dataUrl" :src="item.dataUrl" alt="" class="h-9 w-9 shrink-0 rounded-lg object-cover" />
                  <span v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-white"><Play :size="14" /></span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold text-ink-800">{{ chatItemLabel(item) }}</p>
                    <p :class="item.state === 'failed' ? 'text-danger-700' : item.state === 'done' ? 'text-success-700' : 'text-ink-500'">
                      {{ chatItemStatus(item) }}
                    </p>
                    <div v-if="item.state === 'uploading' || item.state === 'preparing'" class="mt-1 h-1 overflow-hidden rounded-full bg-ink-200">
                      <div class="h-full bg-brand-500 transition-[width] duration-300" :style="{ width: chatPercent(item.state === 'preparing' ? item.video?.progress ?? 0 : item.progress) }"></div>
                    </div>
                  </div>
                  <button
                    v-if="item.state === 'failed'"
                    type="button"
                    class="shrink-0 rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50"
                    data-testid="confirm-attachment-retry"
                    @click="aiConversation.retryUpload(item.id)"
                  >
                    Thử lại
                  </button>
                  <button
                    type="button"
                    class="shrink-0 rounded-lg px-2 py-1 font-semibold text-danger-700 hover:bg-danger-50"
                    data-testid="confirm-attachment-remove"
                    @click="aiConversation.removeAttachment(item.id)"
                  >
                    Bỏ
                  </button>
                </li>
              </ul>
              <p v-if="chatPhotosLeftOut > 0" class="text-xs text-warning-700" data-testid="confirm-photos-left-out">Đã đủ 5 ảnh nên {{ chatPhotosLeftOut }} ảnh gửi trong trò chuyện không kèm theo.</p>
              <p v-if="chatUploads.busy > 0" class="text-xs text-ink-500">Ảnh, video vẫn đang gửi cho thợ. Mạng yếu thì có thể mất vài phút, anh/chị có thể bấm Bỏ để đặt thợ không kèm.</p>
            </div>

            <!-- The request may have reached the server: never send it again blindly -->
            <div
              v-if="submitOutcomeUnknown"
              role="alert"
              class="flex items-start gap-3 rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900"
              data-testid="booking-submit-unknown"
            >
              <AlertTriangle :size="18" class="mt-0.5 shrink-0 text-warning-600" />
              <p>
                Chưa xác nhận được kết quả gửi yêu cầu. Vì hệ thống có thể đã ghi nhận, FixHome không tự gửi lại.
                Bạn kiểm tra mục <router-link to="/app/orders" class="font-bold underline">Đơn của tôi</router-link> trước; nếu chưa có, tải lại trang rồi đặt lại.
              </p>
            </div>
          </div>

          <div class="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <FhButton variant="ghost" size="md" @click="step = 2">
              <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
            </FhButton>

          <FhButton
            variant="primary"
            size="lg"
            class="w-full sm:w-auto"
            :loading="loading"
            :disabled="loading || submitOutcomeUnknown || chatUploads.busy > 0 || chatUploads.failed > 0 || !isCatalogV2PreviewReady"
            data-testid="booking-submit"
            @click="createAndFindTech"
          >
            <template v-if="chatUploads.busy > 0">Đang gửi ảnh, video cho thợ {{ Math.round(chatUploads.progress * 100) }}%</template>
            <template v-else>Tìm kỹ thuật viên ngay <Wrench :size="16" class="ml-1.5" /></template>
          </FhButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Full service description. Teleported, so it is never nested inside the
         card button that opened it; opening it never changes the selection. -->
    <ServiceDetailsDialog
      :open="!!detailsServiceId"
      :service="detailsService"
      :selected="isDetailsSelected"
      :category-name="detailsCategoryName"
      @close="closeServiceDetails"
      @confirm="chooseServiceFromDetails"
    />
  </div>
</template>

<style scoped>
.wizard-step-enter-active,
.wizard-step-leave-active { transition: all 0.22s cubic-bezier(0.25, 1, 0.5, 1); }
.wizard-step-enter-from { opacity: 0; transform: translateY(6px); }
.wizard-step-leave-to { opacity: 0; transform: translateY(-6px); }
.fade-slide-enter-active,
.fade-slide-leave-active { transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1); }
.fade-slide-enter-from,
.fade-slide-leave-to { opacity: 0; transform: translateY(-6px); }
.booking-step1-grid--catalog { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
.booking-request-configuration { scroll-margin-top: 6rem; }
.booking-step1-grid--catalog :deep([data-testid="booking-device-details"] label > span) { min-height: 44px; }
@media (min-width: 1100px) {
  .booking-step1-grid--catalog { grid-template-columns: minmax(0, 42fr) minmax(0, 58fr); align-items: start; gap: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .wizard-step-enter-active, .wizard-step-leave-active, .fade-slide-enter-active, .fade-slide-leave-active { transition: none; }
}
</style>
