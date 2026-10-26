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
  Camera,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Play,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton } from '../../components';
import BookingDeviceDetails from '../../components/booking/BookingDeviceDetails.vue';
import BookingStepDock from '../../components/booking/BookingStepDock.vue';
import BookingSummary, { type SummaryDevice } from '../../components/booking/BookingSummary.vue';
import { summarizeVisitDevicePrices, type SummaryPrice } from '../../components/booking/visit-device-pricing';
import { useStepHistory } from '../../components/booking/use-step-history';
import { catalogPriceLabel, deviceFactsText, readableScope } from '../../components/booking/booking-price';
import CompactServiceCard from '../../components/booking/CompactServiceCard.vue';
import ServiceDetailsDialog from '../../components/booking/ServiceDetailsDialog.vue';
import {
  filterCatalogServices,
  fixedPriceValue,
  flattenServiceCatalog,
  isServiceBookable,
  normalizePricingMode,
  type BookingCatalogService,
} from '../../components/booking/booking-service-catalog';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import FailedRepairBookingForm from '../../components/customer/FailedRepairBookingForm.vue';
import { useAuthStore } from '../../stores/auth.store';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import type { BookingDeviceAttributes, CatalogPricingPreview } from '../../api/catalog-pricing.api';
import { useReferenceData } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { bookingsApi } from '../../api/bookings.api';
import { VISIT_DEVICE_LIMIT, visitGroupsApi, type VisitDeviceInput } from '../../api/visit-groups.api';
import { takeAiVisitDraft } from '../../composables/aiVisitDraft';
import type { AiDeviceSuggestion } from '../../api/ai.api';
import { AI_MAX_IMAGES } from '../../api/ai.api';
import { DESCRIBE_BEFORE_SEND, bookingRecap, useAiConversation, useSharedAiConversation } from '../../composables/useAiConversation';
import { looksLikeImage, normalizeForUpload, prepareForAi } from '../../utils/image-for-ai';
import AiConversationThread from '../../components/chat/AiConversationThread.vue';
import { mediaApi, ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../../api/media.api';
import { SLOT_SHORT, isSessionUpcoming, sessionDayLabel, upcomingSessions, type BookingMode, type BookingSlot } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';
import { formatCurrencyVND } from '../../utils/formatters';

const route = useRoute();
const router = useRouter();
// Dedicated failed-repair entry: only authenticated server drafts, never URL-prefilled content.
const isFailedRepairEntry = computed(() => route.query.repairFailure !== undefined);
const failedRepairSources = computed(() => {
  const value = route.query.repairFailure;
  return (typeof value === 'string' ? value.split(',') : []).filter(Boolean);
});
const failedRepairCustomerId = computed(() => isFailedRepairEntry.value ? useAuthStore().user?.id ?? '' : '');
const setBookingLayoutWidth = inject<(wide: boolean) => void>('customer-booking-layout-width', () => {});

/**
 * Two forms on one page. /app/bookings/new: the customer knows what they need
 * and picks the service; no AI anywhere. /app/bookings/ai: the customer only
 * describes the problem, the assistant diagnoses it and chooses the service,
 * and only then can the customer change it.
 */
const isAiFlow = route.meta?.bookingFlow === 'ai';
const step = ref(1);
if (!isFailedRepairEntry.value) useStepHistory(step, router, route);
watch(step, (currentStep, previous) => {
  setBookingLayoutWidth(currentStep === 2 || (!isAiFlow && currentStep === 1));
  // A new step starts at its top, never mid-page under the header (PO 20/10/2026).
  if (previous !== undefined && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
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

/**
 * Several devices in one visit (PO 21/10/2026): the customer finishes one
 * device, taps "Thêm thiết bị khác", and the next one starts with the same
 * address and time. One technician repairs them all and the customer pays
 * once. At most three; at the limit, an explicit support request is available
 * through the existing consultation API (hotline remains server-provided/nullable).
 * Only the form where the customer picks the service, and only while the
 * server has the feature on.
 */
const visitEnabled = ref(false);
const visitGrouping = ref(false);
interface BookingPhotoDraft {
  localId: number;
  previewUrl: string;
  uploadId: string | null;
  /** Saved group photos may be re-edited after their original File is released. */
  file: File | null;
}
interface SavedVisitDevice {
  key: string;
  input: VisitDeviceInput;
  serviceName: string;
  deviceText: string | null;
  price: SummaryPrice;
  photos: BookingPhotoDraft[];
}
interface ActiveDeviceDraft {
  serviceId: string | null;
  hydratedService: ServiceItem | null;
  deepLinkError: string | null;
  description: string;
  userModifiedDescription: boolean;
  deviceAttributes: BookingDeviceAttributes;
  selectedVariantCode: string | null;
  catalogPricingPreview: CatalogPricingPreview | null;
  uploadedPhotos: BookingPhotoDraft[];
  quantity: number;
  pickerOpen: boolean;
  selectedCategoryId: string;
  searchQuery: string;
  servicesExpanded: boolean;
}
const extraDevices = ref<SavedVisitDevice[]>([]);

/**
 * Appliances the assistant suggested booking together (?visit=ai&aiSession=).
 * They are not saved blindly: each is loaded into the device editor in turn,
 * service chosen and the customer's words filled in, and the customer checks
 * it (type of machine, photos) and saves it like any device they add.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const aiVisitSession = (() => {
  if (isAiFlow || route.query.visit !== 'ai') return null;
  const raw = typeof route.query.aiSession === 'string' ? route.query.aiSession : '';
  return SESSION_ID_PATTERN.test(raw) ? raw : null;
})();
const aiVisitDevices = ref<AiDeviceSuggestion[]>(aiVisitSession ? takeAiVisitDraft(aiVisitSession) : []);
const aiVisitQueue = ref<AiDeviceSuggestion[]>([...aiVisitDevices.value]);
const aiVisitCurrent = ref<AiDeviceSuggestion | null>(null);
/** Suggested appliances not yet saved: continuing now would drop them without a word. */
const aiVisitWaiting = computed(() => visitGrouping.value && aiVisitQueue.value.length > 0);
const visitContactLoaded = ref(false);
let aiVisitStarted = false;
const editingSavedDeviceKey = ref<string | null>(null);
const savedDeviceEditorBackup = ref<ActiveDeviceDraft | null>(null);
const recentlyRemovedDevice = ref<{ device: SavedVisitDevice; index: number } | null>(null);
const visitHotline = ref<string | null>(null);
const consultationMessage = ref('');
const consultationSubmitting = ref(false);
const consultationSent = ref(false);
const consultationOpen = ref(false);
const devicePricingRevision = ref(0);
const visitKey = `visit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
let nextVisitDeviceKey = 0;
const currentDeviceUnits = computed(() => {
  if (!selectedServiceId.value) return 0;
  return visitGrouping.value ? 1 : isFixedPrice.value ? quantity.value : 1;
});
const visitDeviceCount = computed(() => extraDevices.value.length
  + (editingSavedDeviceKey.value ? 0 : currentDeviceUnits.value));
const canAddDevice = computed(() => visitDeviceCount.value < VISIT_DEVICE_LIMIT);
// Keep the assistant's queue workflow unchanged; the manual third editor saves
// and advances in one action, without ever creating a fourth draft.
const canSaveThirdAndContinue = computed(() => !isAiFlow && !aiVisitSession && visitGrouping.value
  && extraDevices.value.length === VISIT_DEVICE_LIMIT - 1 && !!selectedServiceId.value && !editingSavedDeviceKey.value);
const canContinueFromStep1 = computed(() => (!!editingSavedDeviceKey.value || canSaveThirdAndContinue.value)
  ? isCatalogV2PreviewReady.value && !loading.value && !uploadingPhoto.value
  : !editingSavedDeviceKey.value && (
  selectedServiceId.value
    ? extraDevices.value.length === 0 && !aiVisitWaiting.value && isCatalogV2PreviewReady.value && visitDeviceCount.value <= VISIT_DEVICE_LIMIT
    : extraDevices.value.length > 0
));
const onlySavedDeviceFallback = computed(() => (
  visitGrouping.value && extraDevices.value.length === 1 && !selectedServiceId.value && !editingSavedDeviceKey.value
));
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
  const savedOwnerExists = extraDevices.value.some((device) => device.photos.some((photo) => photo.previewUrl === previewUrl))
    || recentlyRemovedDevice.value?.device.photos.some((photo) => photo.previewUrl === previewUrl) === true;
  if (savedOwnerExists) return;
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
// Sessions: morning 8-12, afternoon 13-18 or evening 18-23 of one day, Vietnam
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
  if (!chosen) return { error: 'Vui lòng chọn ngày và buổi (sáng, chiều hoặc tối).' };
  if (!isSessionUpcoming(chosen.date, chosen.slot)) {
    return { error: 'Buổi bạn chọn đã hết thời gian nhận đặt lịch. Vui lòng chọn buổi khác.' };
  }
  return { mode: 'scheduled', date: chosen.date, slot: chosen.slot };
}

// ── Service catalog: the one loaded catalog, filtered locally ──────────────
// `GET /categories` returns the nested catalog. Search and the category
// chips filter that loaded set (no server paging is claimed); the selection is
// independent of any filter and of the page the service would be on.
const allServices = computed<BookingCatalogService[]>(() => flattenServiceCatalog(categories.value));

const categoryFilters = computed(() =>
  categories.value.map((cat) => ({ id: cat.id, name: cat.name, count: cat.services?.length ?? 0 })),
);

const matchingServices = computed(() =>
  filterCatalogServices(allServices.value, {
    categoryId: selectedCategoryId.value,
    query: searchQuery.value,
  }),
);
const servicesExpanded = ref(false);
const isDefaultCatalog = computed(() => !selectedCategoryId.value && !searchQuery.value.trim());
const visibleServices = computed(() => isDefaultCatalog.value && !servicesExpanded.value
  ? matchingServices.value.slice(0, 8) : matchingServices.value);
watch([selectedCategoryId, searchQuery], () => { servicesExpanded.value = false; });

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

// ── What the summary card and the review repeat (PO 20/10/2026) ──────────────
/** Services grouped by category while the whole catalog shows; one plain list when filtered. */
const serviceGroups = computed(() => {
  if (selectedCategoryId.value || searchQuery.value.trim()) return [{ name: '', items: visibleServices.value }];
  const groups: Array<{ name: string; items: BookingCatalogService[] }> = [];
  for (const svc of visibleServices.value) {
    const name = svc.categoryName || 'Khác';
    const group = groups.find((g) => g.name === name);
    if (group) group.items.push(svc); else groups.push({ name, items: [svc] });
  }
  return groups;
});

/** "Treo tường · ≤ 1,5 HP": the facts the customer gave, else the confirmed scope. */
const deviceSummaryText = computed(() => {
  const facts = deviceFactsText(deviceAttributes.value);
  if (facts) return facts;
  const scope = catalogPricingConfirmed.value?.scopeVi;
  return scope ? readableScope(scope) : null;
});

const positive = (value: unknown): number | null => (typeof value === 'number' && value > 0 ? value : null);
/** The one price the summary shows: blue only once the server confirmed it. */
const summaryPrice = computed<SummaryPrice>(() => {
  const service = selectedService.value;
  if (!service) return { kind: 'none' };
  const confirmed = catalogPricingConfirmed.value;
  if (confirmed) return { kind: 'firm', amount: confirmed.laborPriceVnd };
  const range = catalogLaborRange.value;
  if (range) return { kind: 'range', min: range.minLaborVnd, max: range.maxLaborVnd };
  if (isFixedPrice.value && selectedFixedPrice.value !== null) return { kind: 'firm', amount: totalFixedAmount.value };
  const summary = service.priceSummary;
  const min = positive(summary?.minLaborVnd);
  const max = positive(summary?.maxLaborVnd);
  if (summary?.kind === 'fixed_range' && min !== null && max !== null) {
    return min < max ? { kind: 'range', min, max } : { kind: 'firm', amount: min };
  }
  if (summary?.kind === 'inspection_reference') return { kind: 'survey', from: min ?? positive(summary.suggestedLaborVnd), to: max };
  return { kind: 'survey', from: null, to: null };
});

const visitSummaryDevices = computed<SummaryDevice[] | undefined>(() => {
  if (!visitGrouping.value || isAiFlow) return undefined;
  const devices: SummaryDevice[] = extraDevices.value.map((device, index) => ({
    label: `Máy ${index + 1}`,
    serviceName: device.serviceName,
    deviceText: device.deviceText,
    price: device.price,
  }));
  if (selectedServiceId.value && selectedService.value && !editingSavedDeviceKey.value) {
    devices.push({
      label: `Máy ${devices.length + 1}`,
      serviceName: selectedService.value.name,
      deviceText: deviceSummaryText.value,
      price: summaryPrice.value,
    });
  }
  return devices.length ? devices : undefined;
});

const visitSummaryPrice = computed<SummaryPrice>(() => visitSummaryDevices.value
  ? summarizeVisitDevicePrices(visitSummaryDevices.value.map((device) => device.price))
  : summaryPrice.value);

/** Presentation only: saved and current machines share one final-review row. */
const reviewDevices = computed(() => {
  const devices = extraDevices.value.map((device) => ({
    key: device.key,
    savedKey: device.key as string | null,
    serviceName: device.serviceName,
    deviceText: device.deviceText,
    description: device.input.description || 'Chưa có mô tả',
    price: device.price,
    photos: device.photos,
  }));
  if (selectedServiceId.value && !editingSavedDeviceKey.value) devices.push({
    key: 'current', savedKey: null,
    serviceName: selectedService.value?.name ?? 'Thiết bị',
    deviceText: deviceSummaryText.value,
    description: description.value.trim() || 'Chưa có mô tả',
    price: summaryPrice.value,
    photos: uploadedPhotos.value,
  });
  return devices;
});

/** A survey job needs a few words; a firm-priced job may go without. */
const descriptionRequired = computed(() => summaryPrice.value.kind !== 'firm');

const scheduleSummaryText = computed(() => (
  bookingMode.value === 'urgent' || selectedSession.value ? formattedScheduleDisplay.value : null
));

function addressLine(address: UserAddress): string {
  return [tidyAddressText(address.line1), address.district, address.province].filter(Boolean).join(', ');
}

const formatMoney = (amount: number) => formatCurrencyVND(amount);

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
  const files = uploadedPhotos.value.flatMap((photo) => photo.file ? [photo.file] : []).slice(0, AI_MAX_IMAGES);
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
    }
  }
}

/** The service list folds into one line once something is chosen (PO 20/10/2026). */
const pickerOpen = ref(false);
/** The note for the technician stays one link until the customer wants it. */
const noteOpen = ref(false);

/** A card click: an explicit customer choice outruns any pending link lookup. */
async function onServiceSelected(id: string) {
  selectServiceById(id);
  pickerOpen.value = false;
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

/** "Bỏ chọn" in the folded line: nothing chosen, so the list comes back. */
function clearAndOpenPicker() {
  clearServiceSelection();
  pickerOpen.value = true;
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
  await nextTick();
  servicesExpanded.value = true;
  await nextTick();
  if (isPageDisposed.value || step.value !== 1) return;
  const selectedRow = finderRef.value?.querySelector<HTMLElement>('[data-testid="booking-service-card"][aria-pressed="true"]');
  const target = selectedRow ?? finderRef.value?.parentElement?.querySelector<HTMLElement>('[data-testid="selected-service-recap"]');
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

async function changeService() {
  pickerOpen.value = true;
  await nextTick();
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
// Only the assistant form keeps the floating dock; the hand-picked form has its summary bar.
const dockHint = computed(() => (
  description.value.trim() ? 'Trợ lý sẽ phân tích mô tả của bạn' : 'Mô tả sự cố để trợ lý phân tích'
));

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
}

function setQuantity(value: number) {
  if (visitGrouping.value) return;
  // Inside a visit every unit is a device, and a visit takes at most three.
  const max = extraDevices.value.length ? VISIT_DEVICE_LIMIT - extraDevices.value.length : 99;
  quantity.value = Math.max(1, Math.min(max, Math.round(value)));
}

function startVisitGrouping() {
  visitGrouping.value = true;
  quantity.value = 1;
}

function copyPhotoDrafts(photos: BookingPhotoDraft[]): BookingPhotoDraft[] {
  return photos.map((photo) => ({ ...photo }));
}

function captureActiveDeviceDraft(): ActiveDeviceDraft {
  return {
    serviceId: selectedServiceId.value,
    hydratedService: hydratedService.value,
    deepLinkError: deepLinkError.value,
    description: description.value,
    userModifiedDescription: userModifiedDescription.value,
    deviceAttributes: { ...deviceAttributes.value },
    selectedVariantCode: selectedVariantCode.value,
    catalogPricingPreview: catalogPricingPreview.value,
    uploadedPhotos: copyPhotoDrafts(uploadedPhotos.value),
    quantity: quantity.value,
    pickerOpen: pickerOpen.value,
    selectedCategoryId: selectedCategoryId.value,
    searchQuery: searchQuery.value,
    servicesExpanded: servicesExpanded.value,
  };
}

function restoreActiveDeviceDraft(draft: ActiveDeviceDraft) {
  selectedServiceId.value = draft.serviceId;
  hydratedService.value = draft.hydratedService;
  deepLinkError.value = draft.deepLinkError;
  description.value = draft.description;
  userModifiedDescription.value = draft.userModifiedDescription;
  deviceAttributes.value = { ...draft.deviceAttributes };
  selectedVariantCode.value = draft.selectedVariantCode;
  catalogPricingPreview.value = draft.catalogPricingPreview;
  uploadedPhotos.value = copyPhotoDrafts(draft.uploadedPhotos);
  quantity.value = draft.quantity;
  pickerOpen.value = draft.pickerOpen;
  selectedCategoryId.value = draft.selectedCategoryId;
  searchQuery.value = draft.searchQuery;
  servicesExpanded.value = draft.servicesExpanded;
  devicePricingRevision.value += 1;
}

function visitDevicePhotoUrls(device: SavedVisitDevice): Set<string> {
  return new Set(device.photos.map((photo) => photo.previewUrl));
}

function photoUploadIdsAreUnique(input: VisitDeviceInput, replacingKey: string | null = null): boolean {
  const currentIds = input.photoUploadIds ?? [];
  if (new Set(currentIds).size !== currentIds.length) return false;
  const savedIds = new Set(extraDevices.value
    .filter((device) => device.key !== replacingKey)
    .flatMap((device) => device.input.photoUploadIds ?? []));
  return currentIds.every((id) => !savedIds.has(id));
}

function editSavedDevice(key: string) {
  if (editingSavedDeviceKey.value) return;
  const device = extraDevices.value.find((item) => item.key === key);
  if (!device || !findServiceById(device.input.serviceId)) {
    toast.warning('Dịch vụ đã lưu không còn trong danh mục. Hãy chọn dịch vụ đang được cung cấp.');
    return;
  }

  savedDeviceEditorBackup.value = captureActiveDeviceDraft();
  step.value = 1;
  editingSavedDeviceKey.value = key;
  selectServiceById(device.input.serviceId, { syncCategoryFilter: true });
  description.value = device.input.description ?? '';
  userModifiedDescription.value = !!device.input.description;
  deviceAttributes.value = { ...(device.input.deviceAttributes ?? {}) };
  selectedVariantCode.value = device.input.selectedVariantCode ?? null;
  catalogPricingPreview.value = null;
  uploadedPhotos.value = copyPhotoDrafts(device.photos);
  quantity.value = 1;
  pickerOpen.value = false;
  devicePricingRevision.value += 1;
}

function cancelSavedDeviceEdit() {
  if (!editingSavedDeviceKey.value) return;
  const device = extraDevices.value.find((item) => item.key === editingSavedDeviceKey.value);
  const originalUrls = device ? visitDevicePhotoUrls(device) : new Set<string>();
  for (const photo of uploadedPhotos.value) {
    if (!originalUrls.has(photo.previewUrl)) revokePhotoPreviewUrl(photo.previewUrl);
  }
  const backup = savedDeviceEditorBackup.value;
  editingSavedDeviceKey.value = null;
  savedDeviceEditorBackup.value = null;
  if (backup) restoreActiveDeviceDraft(backup);
}

function discardRecentlyRemovedDevice() {
  const removed = recentlyRemovedDevice.value;
  recentlyRemovedDevice.value = null;
  if (removed) {
    for (const photo of removed.device.photos) revokePhotoPreviewUrl(photo.previewUrl);
  }
}

function undoRemoveExtraDevice() {
  const removed = recentlyRemovedDevice.value;
  if (!removed) return;
  extraDevices.value.splice(Math.min(removed.index, extraDevices.value.length), 0, removed.device);
  recentlyRemovedDevice.value = null;
}

function restoreOnlySavedDeviceAsSingleBooking() {
  if (extraDevices.value.length !== 1 || selectedServiceId.value || editingSavedDeviceKey.value) return false;
  const [device] = extraDevices.value;
  if (!findServiceById(device.input.serviceId)) return false;
  extraDevices.value = [];
  visitGrouping.value = false;
  selectServiceById(device.input.serviceId, { syncCategoryFilter: true });
  description.value = device.input.description ?? '';
  userModifiedDescription.value = !!device.input.description;
  deviceAttributes.value = { ...(device.input.deviceAttributes ?? {}) };
  selectedVariantCode.value = device.input.selectedVariantCode ?? null;
  catalogPricingPreview.value = null;
  uploadedPhotos.value = copyPhotoDrafts(device.photos);
  quantity.value = 1;
  pickerOpen.value = false;
  devicePricingRevision.value += 1;
  return true;
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
  if (isFailedRepairEntry.value) return;
  applyIncomingDescription();
  void loadCategories();
  void loadAddresses();
  armStepFooterObserver();
  if (!isAiFlow) {
    visitGroupsApi.contact().then((contact) => {
      visitEnabled.value = contact.enabled;
      visitHotline.value = contact.hotline;
    }).catch(() => undefined).finally(() => {
      visitContactLoaded.value = true;
    });
  }
});

/** Once the catalogue and the visit switch are known, the assistant's first appliance goes into the editor. */
watch(
  () => [catalogLoading.value, visitContactLoaded.value] as const,
  ([loadingCatalog, contactLoaded]) => {
    if (aiVisitStarted || loadingCatalog || !contactLoaded || !aiVisitQueue.value.length) return;
    aiVisitStarted = true;
    if (visitEnabled.value) {
      startVisitGrouping();
    } else {
      // Several devices in one visit is switched off: book the first one as usual.
      aiVisitQueue.value = aiVisitQueue.value.slice(0, 1);
      aiVisitDevices.value = aiVisitDevices.value.slice(0, 1);
    }
    loadNextAiDevice();
  },
);

/** The next suggested appliance into the editor; one whose service is gone from the catalogue is skipped. */
function loadNextAiDevice(): AiDeviceSuggestion | null {
  while (aiVisitQueue.value.length) {
    const next = aiVisitQueue.value.shift()!;
    const id = next.service?.serviceId;
    if (!id || !findServiceById(id)) {
      toast.warning(`Dịch vụ cho ${next.nameVi.toLowerCase()} hiện chưa đặt được, anh/chị chọn dịch vụ khác giúp em.`);
      continue;
    }
    selectServiceById(id, { syncCategoryFilter: true });
    pickerOpen.value = false;
    const words = (next.descriptionVi ?? '').trim().slice(0, 1000);
    description.value = words;
    userModifiedDescription.value = !!words;
    aiVisitCurrent.value = next;
    return next;
  }
  aiVisitCurrent.value = null;
  return null;
}

/** The customer books only what is already saved or open; the rest of the suggestion is dropped on purpose. */
function skipRemainingAiDevices() {
  const skipped = new Set(aiVisitQueue.value);
  aiVisitQueue.value = [];
  aiVisitDevices.value = aiVisitDevices.value.filter((device) => !skipped.has(device));
}

/** What the customer calls the device in the editor, when it is the one the assistant suggested. */
const aiDeviceLabel = computed(() => {
  const current = aiVisitCurrent.value;
  return current && current.service?.serviceId === selectedServiceId.value ? current.nameVi : null;
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
      const file = photo.file;
      if (!file) return;
      try {
        const uploaded = await mediaApi.uploadBookingPhoto(file);
        if (isPhotoFlowDisposed.value) return;
        const currentPhoto = uploadedPhotos.value.find((item) => item.localId === photo.localId);
        if (currentPhoto) currentPhoto.uploadId = uploaded.uploadId;
      } catch (err) {
        console.error(`[NewBookingWizardPage] Upload booking photo failed for "${file.name}":`, err);
        const photoStillSelected = removePhotoByLocalId(photo.localId);
        if (!isPhotoFlowDisposed.value && photoStillSelected) {
          toast.error(`Không thể tải ảnh "${file.name}" lên. Vui lòng thử lại.`);
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
  if (!description.value.trim()) {
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
  if (editingSavedDeviceKey.value) {
    addAnotherDevice();
    return;
  }
  if (canSaveThirdAndContinue.value) {
    addAnotherDevice();
    if (extraDevices.value.length === VISIT_DEVICE_LIMIT && !selectedServiceId.value) step.value = 2;
    return;
  }
  if (!selectedServiceId.value && visitGrouping.value && extraDevices.value.length >= 2) {
    step.value = 2;
    return;
  }
  if (onlySavedDeviceFallback.value) restoreOnlySavedDeviceAsSingleBooking();
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
  if (!description.value.trim() && descriptionRequired.value) {
    toast.warning('Vui lòng mô tả sơ bộ tình trạng của thiết bị.');
    document.getElementById('booking-description')?.focus();
    return;
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
/** The device being edited as visit items (one per unit), or null after telling the customer what is missing. */
function currentDeviceInputs(): VisitDeviceInput[] | null {
  if (!visitGrouping.value) {
    toast.warning('Bật đặt nhiều thiết bị trước khi thêm máy vào lượt.');
    return null;
  }
  if (visitDeviceCount.value > VISIT_DEVICE_LIMIT) {
    toast.warning(`Mỗi lượt chỉ nhận tối đa ${VISIT_DEVICE_LIMIT} thiết bị. Bỏ bớt một thiết bị để tiếp tục.`);
    return null;
  }
  if (uploadingPhoto.value) {
    toast.warning('Vui lòng chờ ảnh tải lên hoàn tất.');
    return null;
  }
  const photoUploadIds = uploadedPhotos.value.flatMap((photo) => photo.uploadId ? [photo.uploadId] : []);
  if (photoUploadIds.length !== uploadedPhotos.value.length) {
    toast.warning('Không thể xác nhận ảnh. Vui lòng chọn lại ảnh.');
    return null;
  }
  const service = selectedService.value;
  if (!service || !selectedServiceId.value) {
    toast.warning('Vui lòng chọn một dịch vụ cụ thể.');
    return null;
  }
  if (!isServiceBookable(service)) {
    toast.warning('Dịch vụ đã chọn chưa thể đặt. Vui lòng chọn dịch vụ khác.');
    return null;
  }
  if (!requireCatalogV2Preview()) {
    step.value = 1;
    return null;
  }
  const pricingMode = normalizePricingMode(service.pricingMode);
  if (pricingMode === null || (pricingMode === 'fixed_price' && fixedPriceValue(service) === null)) {
    toast.warning('Dịch vụ này chưa xác định được giá. Vui lòng chọn dịch vụ khác.');
    return null;
  }
  if (!description.value.trim() && descriptionRequired.value) {
    toast.warning('Vui lòng mô tả sơ bộ tình trạng của thiết bị.');
    document.getElementById('booking-description')?.focus();
    return null;
  }
  const input: VisitDeviceInput = {
    serviceId: selectedServiceId.value,
    ...(aiDeviceLabel.value ? { deviceLabel: aiDeviceLabel.value } : {}),
    ...(description.value.trim() ? { description: description.value.trim() } : {}),
    ...(photoUploadIds.length ? { photoUploadIds } : {}),
    ...(Object.keys(deviceAttributes.value).length > 0 ? { deviceAttributes: { ...deviceAttributes.value } } : {}),
    ...(selectedVariantCode.value ? { selectedVariantCode: selectedVariantCode.value } : {}),
  };
  return [input];
}

function priceTextOf(price: SummaryPrice): string {
  if (price.kind === 'firm') return formatMoney(price.amount);
  if (price.kind === 'range') return `${formatMoney(price.min)} – ${formatMoney(price.max)}`;
  if (price.kind === 'survey') return price.from ? `Tham khảo ${formatMoney(price.from)} · thợ báo giá tại nhà` : 'Thợ báo giá tại nhà';
  if (price.kind === 'partial') return `${formatMoney(price.confirmedTotal)} đã xác định · ${price.unresolvedCount} máy cần báo giá`;
  return 'Chưa xác định';
}

/** Keep this device in the visit and start the next one with the same address and time. */
function addAnotherDevice() {
  if (!visitGrouping.value && isFixedPrice.value && quantity.value > 1) {
    toast.warning('Trong lượt sửa, mỗi thiết bị cần có mô tả và ảnh riêng. Hãy giảm số lượng về 1 để thêm thiết bị.');
    step.value = 1;
    return;
  }
  if (!visitGrouping.value) startVisitGrouping();
  const editingKey = editingSavedDeviceKey.value;
  if (!editingKey && extraDevices.value.length >= VISIT_DEVICE_LIMIT) {
    toast.warning(`Mỗi lượt chỉ nhận tối đa ${VISIT_DEVICE_LIMIT} thiết bị.`);
    return;
  }
  const inputs = currentDeviceInputs();
  if (!inputs) return;
  const input = inputs[0];
  if (!photoUploadIdsAreUnique(input, editingKey)) {
    toast.warning('Ảnh của mỗi thiết bị phải riêng biệt. Hãy bỏ ảnh bị trùng rồi lưu lại.');
    return;
  }
  const serviceName = selectedService.value?.name ?? 'Thiết bị';
  const deviceText = deviceSummaryText.value;
  const price = { ...summaryPrice.value } as SummaryPrice;
  const photos = copyPhotoDrafts(uploadedPhotos.value);
  if (editingKey) {
    const index = extraDevices.value.findIndex((device) => device.key === editingKey);
    if (index < 0) {
      cancelSavedDeviceEdit();
      toast.warning('Không tìm thấy thiết bị đã lưu.');
      return;
    }
    const previousPhotos = extraDevices.value[index].photos;
    extraDevices.value.splice(index, 1, { key: editingKey, input, serviceName, deviceText, price, photos });
    const backup = savedDeviceEditorBackup.value;
    editingSavedDeviceKey.value = null;
    savedDeviceEditorBackup.value = null;
    const retainedUrls = new Set(photos.map((photo) => photo.previewUrl));
    for (const photo of previousPhotos) {
      if (!retainedUrls.has(photo.previewUrl)) revokePhotoPreviewUrl(photo.previewUrl);
    }
    if (backup) restoreActiveDeviceDraft(backup);
    toast.success('Đã lưu thay đổi cho thiết bị.');
    return;
  }
  extraDevices.value.push({
    key: `${visitKey}-device-${nextVisitDeviceKey++}`,
    input,
    serviceName,
    deviceText,
    price,
    photos,
  });
  clearServiceSelection();
  description.value = '';
  userModifiedDescription.value = false;
  uploadedPhotos.value = [];
  quantity.value = 1;
  step.value = 1;
  aiVisitCurrent.value = null;
  const nextAi = aiVisitQueue.value.length ? loadNextAiDevice() : null;
  if (nextAi) {
    toast.success(`Đã thêm ${extraDevices.value.length} thiết bị. Kiểm tra tiếp ${nextAi.nameVi.toLowerCase()}.`);
    return;
  }
  toast.success(extraDevices.value.length === VISIT_DEVICE_LIMIT
    ? `Đã lưu đủ ${VISIT_DEVICE_LIMIT} thiết bị.`
    : `Đã thêm ${extraDevices.value.length} thiết bị. Chọn thiết bị tiếp theo.`);
}

function removeExtraDevice(key: string) {
  if (editingSavedDeviceKey.value) return;
  const index = extraDevices.value.findIndex((device) => device.key === key);
  if (index < 0) return;
  discardRecentlyRemovedDevice();
  const [device] = extraDevices.value.splice(index, 1);
  recentlyRemovedDevice.value = { device, index };
}

/** One request for the whole visit; the same key makes a retried submit return the same visit. */
async function submitVisit(current: VisitDeviceInput[]) {
  if (loading.value || submitOutcomeUnknown.value) return;
  if (!visitEnabled.value || !visitGrouping.value || editingSavedDeviceKey.value) {
    toast.warning('Hãy lưu hoặc hủy thay đổi thiết bị trước khi gửi lượt sửa.');
    return;
  }
  const items = [...extraDevices.value.map((device) => device.input), ...current];
  if (items.length < 2 || items.length > VISIT_DEVICE_LIMIT) {
    toast.warning(items.length === 1
      ? 'Một thiết bị sẽ được gửi như yêu cầu đặt lịch thông thường.'
      : `Lượt sửa cần từ 2 đến ${VISIT_DEVICE_LIMIT} thiết bị.`);
    return;
  }
  const allPhotoIds = items.flatMap((item) => item.photoUploadIds ?? []);
  if (new Set(allPhotoIds).size !== allPhotoIds.length) {
    toast.warning('Ảnh của mỗi thiết bị phải riêng biệt. Hãy sửa ảnh trùng trước khi gửi.');
    return;
  }
  const schedule = scheduleForBooking();
  if ('error' in schedule) {
    toast.warning(schedule.error);
    sessions.value = upcomingSessions(14);
    step.value = 2;
    return;
  }
  if (!selectedAddressId.value) {
    toast.warning('Vui lòng thêm địa chỉ trước khi đặt lịch.');
    step.value = 2;
    return;
  }
  loading.value = true;
  try {
    const visit = await visitGroupsApi.create({
      addressId: selectedAddressId.value,
      ...schedule,
      ...(customerNote.value.trim() ? { customerNote: customerNote.value.trim() } : {}),
      urgency,
      idempotencyKey: visitKey,
      // The conversation that suggested the visit; the first device keeps its summary for the technician.
      ...(aiVisitSession && aiVisitDevices.value.length ? { aiSessionId: aiVisitSession } : {}),
      items,
    });
    router.push(`/app/visits/${visit.id}`);
  } catch (error: unknown) {
    if (!(error as { response?: unknown })?.response) {
      submitOutcomeUnknown.value = true;
      toast.warning('Chưa xác nhận được kết quả gửi yêu cầu. Vui lòng kiểm tra Đơn của tôi trước khi gửi lại.');
      return;
    }
    toast.warning(userFacingError(error, 'Không thể gửi yêu cầu. Vui lòng thử lại.'));
  } finally {
    loading.value = false;
  }
}

async function sendVisitConsultation() {
  const message = consultationMessage.value.trim();
  if (!visitEnabled.value || extraDevices.value.length !== VISIT_DEVICE_LIMIT || !message || message.length > 1000) return;
  if (consultationSubmitting.value || consultationSent.value) return;
  consultationSubmitting.value = true;
  try {
    const devices = extraDevices.value.map((device, index) => `Máy ${index + 1}: ${device.serviceName}`.slice(0, 120));
    await visitGroupsApi.consultation({ message, devices });
    consultationSent.value = true;
    toast.success('Đã gửi yêu cầu hỗ trợ. FixHome sẽ liên hệ với bạn.');
  } catch (error: unknown) {
    toast.warning(userFacingError(error, 'Chưa gửi được yêu cầu hỗ trợ. Vui lòng thử lại.'));
  } finally {
    consultationSubmitting.value = false;
  }
}

async function createAndFindTech() {
  if (editingSavedDeviceKey.value) {
    toast.warning('Lưu hoặc hủy thay đổi thiết bị trước khi gửi yêu cầu.');
    step.value = 1;
    return;
  }
  if (onlySavedDeviceFallback.value) {
    if (!restoreOnlySavedDeviceAsSingleBooking()) {
      toast.warning('Dịch vụ của thiết bị đã lưu không còn khả dụng. Hãy chọn lại dịch vụ.');
      step.value = 1;
      return;
    }
  }
  if (extraDevices.value.length) {
    if (!selectedServiceId.value) {
      if (extraDevices.value.length >= 2) await submitVisit([]);
      else toast.warning('Chọn thêm thiết bị thứ hai hoặc dùng thiết bị đã lưu như một yêu cầu thông thường.');
      return;
    }
    const current = currentDeviceInputs();
    if (current) await submitVisit(current);
    return;
  }
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
      // Only the customer's own words; a firm-priced job may go without (PO 21/10/2026).
      description: isAiFlow ? (aiConversation.customerWords() || description.value) : description.value.trim(),
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
  <FailedRepairBookingForm
    v-if="isFailedRepairEntry"
    :source-booking-ids="failedRepairSources"
    :customer-id="failedRepairCustomerId"
    @created="result => router.push(result.kind === 'booking' ? `/app/bookings/${result.id}/candidates` : `/app/visits/${result.id}/candidates`)"
    @later="router.push('/app')"
  />
  <div
    v-else
    class="w-full space-y-5 sm:space-y-6"
    :class="(step === 1 && !isAiFlow) || step === 2 ? (visitSummaryPrice.kind === 'partial' ? 'pb-[calc(12rem_+_env(safe-area-inset-bottom))] lg:pb-24' : 'pb-[calc(8.5rem_+_env(safe-area-inset-bottom))] lg:pb-24') : 'pb-16'"
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
      <!-- Step 1 of the assistant flow: describe the problem; the assistant picks the service. -->
      <div v-if="step === 1 && isAiFlow" key="step-1-ai" class="mx-auto w-full max-w-3xl space-y-5">
        <div class="space-y-3 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-e1)] sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Mô tả sự cố để trợ lý AI phân tích</h2>
            <span class="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
              <ShieldCheck :size="14" class="text-brand-600" />
              <span>Thợ tay nghề chuẩn • Báo giá minh bạch</span>
            </span>
          </div>
          <p class="text-xs leading-relaxed text-ink-500 sm:text-sm">
            Kể tình trạng thiết bị và gửi ảnh nếu có. Trợ lý sẽ phân tích, hỏi thêm nếu cần và chọn dịch vụ phù hợp; bạn không cần tự chọn dịch vụ.
          </p>
        </div>

        <div class="space-y-5">
          <!-- Description, then one private, keyboard-operable dropzone. -->
          <section id="booking-requirements" class="scroll-mt-20 space-y-3 rounded-[var(--radius-lg)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-e1)] sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label for="booking-description" class="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Sparkles :size="15" class="text-brand-600" />
                <span>Mô tả sự cố</span>
              </label>
              <span class="text-[11px] text-ink-500">Trợ lý đọc mô tả để chẩn đoán</span>
            </div>

            <p v-if="!description.trim()" class="text-xs text-warning-700" data-testid="ai-needs-description">
              {{ DESCRIBE_BEFORE_SEND }}
            </p>

            <textarea
              id="booking-description"
              v-model="description"
              rows="3"
              class="w-full rounded-[var(--radius-md)] border border-ink-200 bg-white p-3.5 text-xs leading-relaxed text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none sm:text-sm"
              placeholder="Mô tả hiện tượng hư hỏng (ví dụ: máy lạnh chảy nước ở dàn lạnh trong nhà, quạt kêu to và không mát...)"
              data-testid="booking-description"
              @input="userModifiedDescription = true"
            ></textarea>
          </section>

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

        <!-- Step 1 footer: the real action set. While the dock floats over the
             page this footer is inert, so only one set of actions is ever
             reachable by keyboard or screen reader. -->
        <div
          ref="stepFooterRef"
          :inert="showStepDock ? true : undefined"
          class="flex flex-col gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-end"
          data-testid="booking-step1-footer"
        >
          <FhButton
            variant="primary"
            size="lg"
            class="w-full px-7 shadow-[var(--shadow-e1)] sm:w-auto"
            :disabled="!description.trim()"
            :tabindex="showStepDock ? -1 : undefined"
            data-testid="step1-next"
            @click="startAiStep()"
          >
            Phân tích cùng AI <Sparkles :size="15" class="ml-1.5" />
          </FhButton>
        </div>

        <!-- The floating Previous/Next dock for the scrolled-away state. -->
        <BookingStepDock
          :show="showStepDock"
          next-label="Phân tích cùng AI"
          :next-disabled="!description.trim()"
          :hint="dockHint"
          @next="startAiStep()"
        />
      </div>

      <!-- Step 1, choosing yourself (PO 20/10/2026): one column of decisions, the summary beside it. -->
      <div v-else-if="step === 1" key="step-1" class="booking-layout">
        <div class="min-w-0 space-y-4">
          <section
            v-if="visitEnabled && !isAiFlow && !visitGrouping"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm"
            data-testid="visit-opt-in"
          >
            <span class="font-medium text-ink-800">Có nhiều thiết bị cần sửa?</span>
            <FhButton variant="secondary" size="md" data-testid="visit-opt-in-action" @click="startVisitGrouping">Đặt nhiều thiết bị</FhButton>
          </section>
          <section
            v-if="aiVisitDevices.length >= 2 && visitGrouping"
            class="space-y-1.5 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900 text-pretty"
            data-testid="ai-visit-note"
          >
            <p class="font-semibold">Trợ lý AI gợi ý {{ aiVisitDevices.length }} thiết bị cho lượt này</p>
            <ol class="space-y-0.5">
              <li v-for="(device, index) in aiVisitDevices" :key="`${device.deviceType}-${index}`" :data-testid="`ai-visit-device-${index}`">
                {{ index + 1 }}. {{ device.nameVi }}: {{ device.service?.nameVi }}
                <span v-if="aiVisitCurrent === device" class="font-semibold">(đang kiểm tra)</span>
              </li>
            </ol>
            <p>Kiểm tra loại máy và thêm ảnh nếu có, rồi bấm "Thêm thiết bị này vào lượt" cho từng thiết bị.</p>
            <button
              v-if="aiVisitQueue.length"
              type="button"
              class="min-h-11 font-semibold text-warning-900 underline underline-offset-2"
              data-testid="ai-visit-skip-rest"
              @click="skipRemainingAiDevices"
            >
              Không đặt các thiết bị còn lại
            </button>
          </section>
          <p
            v-else-if="aiVisitDevices.length === 1 && !visitGrouping"
            class="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900 text-pretty"
            data-testid="ai-visit-single-note"
          >
            Hiện chưa đặt được nhiều thiết bị trong một lượt, em điền sẵn thiết bị đầu tiên trợ lý gợi ý.
          </p>
          <p
            v-if="visitEnabled && !isAiFlow && visitGrouping && aiVisitDevices.length < 2"
            class="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700 text-pretty"
            data-testid="visit-grouping-note"
          >
            Mỗi thiết bị có mô tả và ảnh riêng. Số lượng dịch vụ đã chọn được chuyển về 1 thiết bị.
          </p>
          <section
            v-if="extraDevices.length || recentlyRemovedDevice"
            class="space-y-3 rounded-2xl border border-ink-200 bg-white p-4 text-sm sm:p-6"
            data-testid="visit-devices-banner"
          >
            <h2 v-if="extraDevices.length" class="font-semibold text-ink-900">Thiết bị đã lưu ({{ extraDevices.length }})</h2>
            <ol v-if="extraDevices.length" class="divide-y divide-ink-100">
              <li v-for="(device, index) in extraDevices" :key="device.key" class="space-y-2 py-3 first:pt-0 last:pb-0" :data-testid="`visit-device-${index}`">
                <div class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="break-words font-semibold text-ink-900">Máy {{ index + 1 }} · {{ device.serviceName }}</p>
                    <p v-if="device.deviceText" class="mt-1 text-sm text-ink-600">{{ device.deviceText }}</p>
                  </div>
                  <div class="flex shrink-0 justify-end gap-1">
                    <button type="button" class="min-h-11 min-w-11 rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" :aria-label="`Sửa máy ${index + 1}: ${device.serviceName}`" :disabled="!!editingSavedDeviceKey" :data-testid="`visit-device-edit-${index}`" @click="editSavedDevice(device.key)">Sửa</button>
                    <button type="button" class="min-h-11 min-w-11 rounded-lg px-2 font-semibold text-danger-700 hover:bg-danger-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-600" :aria-label="`Bỏ máy ${index + 1}: ${device.serviceName}`" :disabled="!!editingSavedDeviceKey" :data-testid="`visit-device-remove-${index}`" @click="removeExtraDevice(device.key)">Bỏ</button>
                  </div>
                </div>
                <p class="text-sm font-medium text-ink-800">Tiền công<template v-if="device.price.kind === 'range'"> tham khảo</template>: {{ priceTextOf(device.price) }}</p>
                <p class="line-clamp-2 break-words text-ink-700 text-pretty" :data-testid="`visit-device-description-${index}`">{{ device.input.description || 'Chưa có mô tả' }}</p>
                <div v-if="device.photos.length" class="flex flex-wrap items-center gap-2" :aria-label="`Ảnh máy ${index + 1}`">
                  <img v-for="(photo, photoIndex) in device.photos" :key="photo.localId" :src="photo.previewUrl" :alt="`Ảnh ${photoIndex + 1} của máy ${index + 1}`" class="h-12 w-12 rounded-lg border border-ink-200 object-cover" />
                  <span class="text-xs text-ink-600">{{ device.photos.length }} ảnh</span>
                </div>
              </li>
            </ol>
            <div v-if="recentlyRemovedDevice" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2" role="status">
              <span>Đã bỏ một thiết bị.</span>
              <button type="button" class="min-h-11 font-semibold text-brand-700 hover:underline" data-testid="visit-device-undo" @click="undoRemoveExtraDevice">Hoàn tác</button>
            </div>
          </section>

          <section
            v-if="visitEnabled && !isAiFlow && visitGrouping && extraDevices.length === VISIT_DEVICE_LIMIT && !selectedServiceId && !editingSavedDeviceKey"
            class="space-y-3 rounded-2xl border border-ink-200 bg-white p-4 text-sm sm:p-6"
            data-testid="visit-limit-support"
          >
            <div>
              <h2 class="font-semibold text-ink-900">Đã đủ 3/3 thiết bị</h2>
              <p class="mt-1 text-ink-600">Tiếp tục để chọn lịch và địa chỉ chung.</p>
              <p v-if="visitHotline" class="mt-1 text-ink-600">Hotline hỗ trợ: <a class="font-semibold text-brand-700 underline" :href="`tel:${visitHotline}`">{{ visitHotline }}</a></p>
            </div>
            <div v-if="!consultationOpen && !consultationSent" class="flex flex-wrap items-center gap-x-2 text-ink-600">
              <span>Cần sửa thêm máy?</span>
              <FhButton variant="ghost" size="md" data-testid="visit-consultation-open" @click="consultationOpen = true">Liên hệ FixHome hỗ trợ</FhButton>
            </div>
            <div v-if="consultationSent" class="space-y-3" data-testid="visit-consultation">
              <p class="rounded-lg bg-success-50 px-3 py-2 text-success-800" role="status">Đã gửi yêu cầu hỗ trợ.</p>
            </div>
            <div v-else-if="consultationOpen" class="space-y-3" data-testid="visit-consultation">
              <h3 class="font-semibold text-ink-900">Cần sửa thêm thiết bị?</h3>
              <p class="text-ink-600">Gửi lời nhắn để FixHome hỗ trợ sắp xếp.</p>
              <label for="visit-consultation-message" class="block font-medium text-ink-800">Bạn cần FixHome hỗ trợ điều gì?</label>
              <textarea id="visit-consultation-message" v-model="consultationMessage" rows="3" maxlength="1000" class="w-full rounded-xl border border-ink-300 bg-white p-3 text-base focus:border-brand-600 focus:outline-none sm:text-sm" data-testid="visit-consultation-message" />
              <div class="flex flex-wrap items-center justify-between gap-3">
                <span class="text-xs text-ink-500">{{ consultationMessage.trim().length }}/1000 ký tự</span>
                <div class="flex items-center gap-2">
                  <FhButton variant="ghost" size="md" :disabled="consultationSubmitting" data-testid="visit-consultation-close" @click="consultationOpen = false">Đóng</FhButton>
                  <FhButton variant="secondary" size="md" :loading="consultationSubmitting" :disabled="consultationSubmitting || !consultationMessage.trim()" data-testid="visit-consultation-submit" @click="sendVisitConsultation">Gửi yêu cầu hỗ trợ</FhButton>
                </div>
              </div>
            </div>
          </section>
          <section
            v-if="(!selectedService || pickerOpen) && (!visitGrouping || extraDevices.length < VISIT_DEVICE_LIMIT || editingSavedDeviceKey)"
            ref="finderRef"
            class="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6"
            aria-labelledby="booking-finder-title"
          >
            <h2 id="booking-finder-title" class="text-lg font-semibold text-ink-900">Bạn cần sửa gì?</h2>
            <label class="flex h-12 items-center gap-2.5 rounded-xl border border-ink-300 px-3.5 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/20">
              <Search :size="18" class="shrink-0 text-ink-400" aria-hidden="true" />
              <span class="sr-only">Tìm dịch vụ</span>
              <input
                v-model="searchQuery"
                type="text"
                inputmode="search"
                enterkeyhint="search"
                autocomplete="off"
                class="h-full min-w-0 flex-1 bg-transparent text-base text-ink-900 placeholder:text-ink-400 focus:outline-none sm:text-sm"
                placeholder="Tên dịch vụ hoặc thiết bị, ví dụ: máy lạnh chảy nước"
                data-testid="booking-service-search"
              />
              <button v-if="searchQuery" type="button" class="flex h-11 w-11 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="Xóa tìm kiếm" data-testid="booking-service-search-clear" @click="searchQuery = ''">
                <X :size="16" aria-hidden="true" />
              </button>
            </label>

            <div v-if="catalogLoading" class="flex gap-2" aria-busy="true" aria-label="Đang tải nhóm dịch vụ" data-testid="booking-categories-skeleton">
              <FhSkeleton v-for="i in 5" :key="i" width="88px" height="36px" rounded="full" />
            </div>
            <div v-else-if="categories.length > 0" class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar lg:flex-wrap lg:overflow-visible" role="group" aria-label="Nhóm dịch vụ">
              <button
                v-for="cat in [{ id: '', name: 'Tất cả' }, ...categoryFilters]"
                :key="cat.id || 'all'"
                type="button"
                class="h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors"
                :class="selectedCategoryId === cat.id ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-ink-200 bg-white font-medium text-ink-600 hover:border-brand-300'"
                :aria-pressed="selectedCategoryId === cat.id"
                data-testid="booking-category-filter"
                @click="onCategoryFilterChange(cat.id)"
              >{{ cat.name }}</button>
            </div>

            <div v-if="selectedOutsideFilter" class="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-700" data-testid="selected-outside-filter" role="status">
              <span class="py-2">Dịch vụ đã chọn vẫn được giữ.</span>
              <button type="button" class="min-h-11 font-semibold text-brand-700 hover:underline" data-testid="selected-outside-filter-show" @click="revealSelectedService">Xem dịch vụ đã chọn</button>
            </div>

            <div v-if="catalogLoading" class="grid gap-2 sm:grid-cols-2" aria-busy="true" aria-label="Đang tải dịch vụ">
              <FhSkeleton v-for="i in 6" :key="i" height="56px" rounded="lg" />
            </div>
            <div v-else-if="visibleServices.length > 0" id="booking-service-list" class="space-y-5" role="group" aria-label="Danh sách dịch vụ" data-testid="booking-service-list">
              <div v-for="group in serviceGroups" :key="group.name || 'all'" class="space-y-2">
                <h3 v-if="group.name" class="text-xs font-semibold text-ink-500">{{ group.name }}</h3>
                <div class="grid gap-2 sm:grid-cols-2">
                  <CompactServiceCard
                    v-for="svc in group.items"
                    :key="svc.id"
                    :service="svc"
                    :selected="svc.id === selectedServiceId"
                    @select="onServiceSelected"
                    @details="openServiceDetails"
                  />
                </div>
              </div>
            </div>
            <div v-else-if="categories.length > 0" class="space-y-2 rounded-xl border border-dashed border-ink-300 bg-ink-50 p-6 text-center" data-testid="booking-services-empty">
              <p class="text-sm font-semibold text-ink-800">Không tìm thấy dịch vụ phù hợp</p>
              <p class="text-sm text-ink-500">Thử từ khóa khác, hoặc bỏ bộ lọc để xem toàn bộ dịch vụ.</p>
              <button type="button" class="inline-flex min-h-11 items-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50" @click="resetServiceFilters">Xóa bộ lọc</button>
            </div>
            <p v-else-if="!catalogLoadFailed" class="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-sm text-ink-500" data-testid="booking-catalog-empty">
              Hiện chưa có dịch vụ nào khả dụng. Vui lòng thử lại sau.
            </p>
            <button
              v-if="!catalogLoading && isDefaultCatalog && matchingServices.length > 8"
              type="button"
              class="min-h-11 text-sm font-semibold text-brand-700 hover:underline"
              :aria-expanded="servicesExpanded"
              aria-controls="booking-service-list"
              data-testid="booking-services-expand"
              @click="servicesExpanded = !servicesExpanded"
            >{{ servicesExpanded ? 'Thu gọn' : `Xem tất cả ${matchingServices.length} dịch vụ` }}</button>
            <p v-if="!catalogLoading && !catalogLoadFailed && categories.length > 0" class="sr-only" role="status" data-testid="booking-service-result-count">
              Đã hiển thị {{ visibleServices.length }} dịch vụ
            </p>
          </section>

          <!-- Chosen: one line, the list folds away. -->
          <section v-else-if="selectedService" class="rounded-2xl border border-ink-200 bg-white px-5 py-4 sm:px-6" data-testid="selected-service-recap" tabindex="-1" aria-live="polite">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div class="min-w-0 flex-1">
                <p class="text-xs text-ink-500">{{ selectedCategoryName || 'Dịch vụ' }}</p>
                <p class="text-base font-semibold text-ink-900 text-pretty" data-testid="recap-service-name">{{ selectedService.name }}</p>
                <p class="text-sm text-ink-500" data-testid="recap-price">
                  <template v-if="isFixedPrice && selectedFixedPrice !== null"><FhMoney :amount="selectedFixedPrice" /> / {{ selectedService.unit?.trim() || 'thiết bị' }}</template>
                  <template v-else-if="isServiceBookable(selectedService)">{{ catalogPriceLabel(selectedService).text }}</template>
                </p>
              </div>
              <div v-if="isFixedPrice && selectedFixedPrice !== null && !visitGrouping" class="flex items-center gap-1" role="group" aria-label="Số lượng thiết bị">
                <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-200 text-ink-700 disabled:opacity-40" :disabled="quantity <= 1" aria-label="Giảm số lượng" data-testid="booking-quantity-decrease" @click="setQuantity(quantity - 1)"><Minus :size="15" aria-hidden="true" /></button>
                <span class="w-8 text-center font-semibold font-num" data-testid="booking-quantity">{{ quantity }}</span>
                <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-200 text-ink-700 disabled:opacity-40" :disabled="quantity >= 99" aria-label="Tăng số lượng" data-testid="booking-quantity-increase" @click="setQuantity(quantity + 1)"><Plus :size="15" aria-hidden="true" /></button>
              </div>
              <div class="flex items-center">
                <button type="button" class="min-h-11 px-2 text-sm font-semibold text-brand-700 hover:underline" data-testid="recap-change" @click="changeService">Đổi</button>
                <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-50 hover:text-ink-800" aria-label="Bỏ chọn dịch vụ" data-testid="recap-clear" @click="clearAndOpenPicker"><X :size="16" aria-hidden="true" /></button>
              </div>
            </div>
            <p v-if="!isServiceBookable(selectedService)" class="mt-3 text-sm text-danger-700" data-testid="recap-unavailable">Dịch vụ này tạm chưa đặt được, bạn chọn dịch vụ khác nhé.</p>
          </section>

          <div ref="requirementsRef" class="booking-request-configuration space-y-4" tabindex="-1" aria-label="Thông tin yêu cầu" data-testid="booking-request-configuration">
            <BookingDeviceDetails
              v-if="selectedServiceId"
              :key="`${selectedServiceId}:${devicePricingRevision}`"
              :service-id="selectedServiceId"
              :device-attributes="deviceAttributes"
              :selected-variant-code="selectedVariantCode"
              @update:device-attributes="deviceAttributes = $event"
              @update:selected-variant-code="selectedVariantCode = $event"
              @update:preview="catalogPricingPreview = $event"
            />

            <section v-if="selectedServiceId" id="booking-requirements" class="scroll-mt-24 space-y-3 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" aria-label="Tình trạng máy">
              <label for="booking-description" class="flex items-baseline justify-between gap-3">
                <span class="text-base font-semibold text-ink-900">Tình trạng máy <span v-if="descriptionRequired" class="text-danger-600">*</span></span>
                <span v-if="!descriptionRequired" class="text-xs text-ink-500">Không bắt buộc</span>
              </label>
              <textarea
                id="booking-description"
                v-model="description"
                rows="3"
                class="w-full rounded-xl border border-ink-300 bg-white p-3.5 text-base leading-relaxed text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none sm:text-sm"
                placeholder="Ví dụ: máy chảy nước ở dàn lạnh, lâu chưa vệ sinh"
                data-testid="booking-description"
                @input="userModifiedDescription = true"
              ></textarea>
              <div v-if="categorySymptoms.length" class="flex flex-wrap gap-2">
                <button
                  v-for="sym in categorySymptoms"
                  :key="sym"
                  type="button"
                  class="h-11 rounded-full border px-3 text-sm transition-colors"
                  :class="hasSymptom(sym) ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-ink-200 bg-ink-50 text-ink-600 hover:border-brand-300'"
                  :aria-pressed="hasSymptom(sym)"
                  @click="toggleSymptom(sym)"
                >{{ hasSymptom(sym) ? '✓' : '+' }} {{ sym }}</button>
              </div>

              <div class="flex flex-wrap items-center gap-3 pt-2" aria-label="Ảnh hiện trạng">
                <input ref="photoInput" type="file" accept="image/*,.heic,.heif" multiple class="hidden" @change="handlePhotoSelected" />
                <div v-for="(photo, idx) in uploadedPhotos" :key="photo.localId" class="relative h-[72px] w-[72px] overflow-hidden rounded-xl border border-ink-200 bg-ink-100">
                  <img :src="photo.previewUrl" alt="Ảnh thiết bị đã chọn" class="h-full w-full object-cover" />
                  <div v-if="!photo.uploadId" class="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><LoaderCircle class="animate-spin" :size="16" /></div>
                  <button type="button" class="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl bg-black/60 text-white hover:bg-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600" aria-label="Xóa ảnh" @click.stop="removePhoto(idx)"><Trash2 :size="12" /></button>
                </div>
                <div
                  v-if="uploadedPhotos.length < 5"
                  role="button"
                  tabindex="0"
                  class="flex h-[72px] w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-ink-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  :class="[isDraggingPhoto ? 'border-brand-600 bg-brand-50' : 'border-ink-400 bg-white hover:bg-ink-50', uploadingPhoto ? 'pointer-events-none opacity-60' : '']"
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
                  <LoaderCircle v-if="uploadingPhoto" :size="18" class="animate-spin text-brand-600" aria-hidden="true" />
                  <Camera v-else :size="18" aria-hidden="true" />
                  <span>Thêm ảnh</span>
                </div>
                <span v-if="uploadedPhotos.length === 0" class="text-sm text-ink-500">Ảnh giúp thợ chuẩn bị đúng đồ nghề.</span>
                <span v-if="uploadingPhoto" class="sr-only" role="status" aria-live="polite">Đang tải ảnh hiện trạng…</span>
              </div>
            </section>
            <section
              v-if="visitEnabled && !isAiFlow && visitGrouping && selectedServiceId"
              class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm"
              data-testid="visit-current-device"
            >
              <span class="text-ink-700">{{ editingSavedDeviceKey ? 'Bạn đang sửa thiết bị đã lưu.' : 'Thiết bị này sẽ được thêm riêng vào lượt sửa.' }}</span>
              <FhButton
                v-if="editingSavedDeviceKey || canAddDevice || canSaveThirdAndContinue"
                variant="secondary"
                size="md"
                :disabled="loading || uploadingPhoto"
                :data-testid="editingSavedDeviceKey ? 'visit-device-edit-save' : 'visit-add-device-step1'"
                @click="canSaveThirdAndContinue ? goToStep2() : addAnotherDevice()"
              >
                <Plus :size="16" class="mr-1.5" /> {{ editingSavedDeviceKey ? 'Lưu thay đổi' : canSaveThirdAndContinue ? `Lưu máy ${VISIT_DEVICE_LIMIT} và tiếp tục` : 'Thêm thiết bị này vào lượt' }}
              </FhButton>
              <FhButton v-if="editingSavedDeviceKey" variant="ghost" size="md" :disabled="loading || uploadingPhoto" data-testid="visit-device-edit-cancel" @click="cancelSavedDeviceEdit">Hủy sửa</FhButton>
              <span v-else-if="visitDeviceCount > VISIT_DEVICE_LIMIT" class="rounded-lg bg-warning-50 px-3 py-2 text-warning-800" data-testid="visit-device-limit">
                Tối đa {{ VISIT_DEVICE_LIMIT }} thiết bị mỗi lần đặt.
              </span>
            </section>
          </div>
        </div>

        <BookingSummary
          :service-name="visitSummaryDevices?.length ? `${visitSummaryDevices.length} thiết bị` : selectedService?.name ?? (extraDevices.length ? `${extraDevices.length} thiết bị đã lưu` : null)"
          :device-text="deviceSummaryText"
          :price="visitSummaryPrice"
          :devices="visitSummaryDevices"
          :cta-label="visitGrouping && editingSavedDeviceKey ? 'Lưu thay đổi' : canSaveThirdAndContinue ? `Lưu máy ${VISIT_DEVICE_LIMIT} và tiếp tục` : aiVisitWaiting && selectedServiceId ? `Lưu máy ${extraDevices.length + 1} trước khi tiếp tục` : visitGrouping && extraDevices.length && selectedServiceId ? `Lưu máy ${extraDevices.length + 1} trước khi tiếp tục` : visitGrouping && extraDevices.length && !selectedServiceId ? (extraDevices.length === VISIT_DEVICE_LIMIT ? `Tiếp tục với ${VISIT_DEVICE_LIMIT} thiết bị` : `Tiếp tục với ${extraDevices.length} thiết bị đã lưu`) : visitGrouping && selectedServiceId ? `Tiếp tục với ${visitDeviceCount} thiết bị` : 'Tiếp tục'"
          cta-testid="step1-next"
          :cta-disabled="!canContinueFromStep1"
          @next="goToStep2"
        />
      </div>
      <!-- Step 2: address and time, the summary beside it. -->
      <div v-else-if="step === 2" key="step-2" class="booking-layout">
        <div class="min-w-0 space-y-4">
          <section class="space-y-3 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="booking-address-title">
            <div class="flex items-baseline justify-between gap-3">
              <h2 id="booking-address-title" class="text-lg font-semibold text-ink-900">Địa chỉ sửa chữa</h2>
              <span v-if="!addressesLoading && addresses.length > 1" class="text-xs text-ink-500">{{ addresses.length }} địa chỉ đã lưu</span>
            </div>

            <div v-if="addressesLoading" class="space-y-2" aria-busy="true" aria-label="Đang tải địa chỉ">
              <FhSkeleton height="64px" rounded="lg" />
            </div>
            <div v-else-if="addressesLoadFailed" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3.5 text-sm text-danger-700" data-testid="booking-addresses-error">
              <span>Chưa tải được địa chỉ, vui lòng thử lại.</span>
              <FhButton variant="secondary" size="sm" @click="loadAddresses">Thử lại</FhButton>
            </div>
            <div v-else-if="addresses.length > 0" class="space-y-2">
              <div class="flex items-center gap-3 rounded-xl border border-ink-200 px-4 py-3">
                <MapPin :size="18" class="shrink-0 text-ink-400" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    {{ selectedAddress?.label || 'Địa chỉ' }}
                    <span v-if="selectedAddress?.isDefault" class="text-xs font-normal text-ink-500">· Mặc định</span>
                  </p>
                  <p class="truncate text-sm text-ink-600">{{ selectedAddress ? addressLine(selectedAddress) : 'Vui lòng chọn địa chỉ' }}</p>
                </div>
                <button v-if="addresses.length > 1" type="button" class="min-h-11 px-1 text-sm font-semibold text-brand-700 hover:underline" :aria-expanded="isAddressDropdownOpen" @click="toggleAddressDropdown">
                  {{ isAddressDropdownOpen ? 'Đóng' : 'Đổi' }}
                </button>
              </div>
              <div v-if="isAddressDropdownOpen" class="space-y-1.5 rounded-xl border border-ink-200 p-2" role="listbox" aria-label="Sổ địa chỉ">
                <button
                  v-for="addr in addresses"
                  :key="addr.id"
                  type="button"
                  role="option"
                  :aria-selected="selectedAddressId === addr.id"
                  class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
                  :class="selectedAddressId === addr.id ? 'bg-brand-50' : 'hover:bg-ink-50'"
                  @click="selectAddress(addr.id)"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-ink-900">{{ addr.label || 'Địa chỉ' }}<span v-if="addr.isDefault" class="font-normal text-ink-500"> · Mặc định</span></p>
                    <p class="truncate text-sm text-ink-600">{{ addressLine(addr) }}</p>
                  </div>
                  <CheckCircle2 v-if="selectedAddressId === addr.id" :size="16" class="shrink-0 text-brand-600" />
                </button>
                <router-link to="/app/profile" class="flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  <Plus :size="14" /> Thêm địa chỉ mới
                </router-link>
              </div>
            </div>
            <div v-else class="space-y-3 rounded-xl border border-dashed border-ink-300 bg-ink-50 p-6 text-center">
              <p class="text-sm font-semibold text-ink-800">Bạn chưa có địa chỉ nào</p>
              <p class="text-sm text-ink-500">Thêm địa chỉ nhà để thợ tới sửa.</p>
              <router-link to="/app/profile" class="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                <Plus :size="14" /> Thêm địa chỉ mới
              </router-link>
            </div>
          </section>

          <section class="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="booking-time-title">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="booking-time-title" class="text-lg font-semibold text-ink-900">Thời gian</h2>
              <div class="inline-flex rounded-xl bg-ink-100 p-1" role="radiogroup" aria-label="Kiểu đặt lịch">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="bookingMode === 'scheduled'"
                  class="h-9 rounded-lg px-3.5 text-sm"
                  :class="bookingMode === 'scheduled' ? 'bg-white font-semibold text-ink-900 shadow-[var(--shadow-e1)]' : 'font-medium text-ink-600'"
                  data-testid="mode-scheduled"
                  @click="bookingMode = 'scheduled'"
                >Hẹn lịch</button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="bookingMode === 'urgent'"
                  class="h-9 rounded-lg px-3.5 text-sm"
                  :class="bookingMode === 'urgent' ? 'bg-white font-semibold text-ink-900 shadow-[var(--shadow-e1)]' : 'font-medium text-ink-600'"
                  data-testid="mode-urgent"
                  @click="bookingMode = 'urgent'"
                >Tới ngay</button>
              </div>
            </div>
            <BookingSessionPicker v-if="bookingMode === 'scheduled'" v-model="selectedSession" :sessions="sessions" compact />
            <p v-else class="text-sm text-ink-600">Thợ gần bạn đang rảnh sẽ tới trong khoảng 2 giờ.</p>

            <button v-if="!noteOpen && !customerNote" type="button" class="min-h-11 text-sm font-semibold text-brand-700 hover:underline" data-testid="customer-note-open" @click="noteOpen = true">+ Thêm ghi chú cho thợ</button>
            <div v-else class="space-y-1.5">
              <label for="customer-note" class="block text-sm font-medium text-ink-800">Ghi chú cho thợ <span class="font-normal text-ink-500">(không bắt buộc)</span></label>
              <textarea
                id="customer-note"
                v-model="customerNote"
                rows="2"
                maxlength="1000"
                placeholder="Ví dụ: gọi trước khi tới, nhà trong hẻm, gửi xe ở đâu…"
                class="w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2.5 text-base focus:border-brand-600 focus:outline-none sm:text-sm"
                data-testid="customer-note"
              />
            </div>
          </section>
        </div>

        <BookingSummary
          :service-name="visitSummaryDevices?.length ? `${visitSummaryDevices.length} thiết bị` : selectedService?.name ?? (extraDevices.length ? `${extraDevices.length} thiết bị đã lưu` : null)"
          :device-text="deviceSummaryText"
          :schedule-text="scheduleSummaryText"
          :address-text="selectedAddress ? addressLine(selectedAddress) : null"
          :price="visitSummaryPrice"
          :devices="visitSummaryDevices"
          cta-label="Xác nhận đơn"
          cta-testid="step2-next"
          back-label="Quay lại"
          @next="goToNextStepFrom2"
          @back="step = isAiFlow ? 3 : 1"
        />
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

      <!-- Step 4: one last look, then send. -->
      <div v-else-if="step === 4" key="step-4" class="mx-auto w-full max-w-3xl space-y-4">
        <div>
          <h2 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Kiểm tra lần cuối</h2>
          <p class="mt-1 text-sm text-ink-500">Gửi xong, bạn chọn thợ phù hợp ở bước tiếp theo.</p>
        </div>

        <dl v-if="aiSessionId && aiRecap" data-testid="ai-recap" class="space-y-2 rounded-2xl border border-ink-200 bg-white p-5 text-sm">
          <div v-if="aiRecap.device" class="flex gap-4"><dt class="w-28 shrink-0 text-ink-500">Thiết bị</dt><dd class="text-ink-900">{{ aiRecap.device }}</dd></div>
          <div v-if="aiRecap.faults.length" class="flex gap-4"><dt class="w-28 shrink-0 text-ink-500">Có thể là</dt><dd class="text-ink-900">{{ aiRecap.faults.join(', ') }}</dd></div>
          <div v-if="aiRecap.told.length" class="flex gap-4">
            <dt class="w-28 shrink-0 text-ink-500">Bạn đã cho biết</dt>
            <dd class="text-ink-900"><ul class="space-y-0.5" data-testid="ai-recap-told"><li v-for="line in aiRecap.told" :key="line" class="text-pretty">{{ line }}</li></ul></dd>
          </div>
        </dl>
        <p v-if="aiSessionId" data-testid="ai-summary-note" class="rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-900 text-pretty">
          Kỹ thuật viên nhận việc sẽ thấy tóm tắt phần bạn trao đổi với trợ lý AI, nên bạn không cần kể lại từ đầu.
        </p>
        <p v-if="visitGrouping && extraDevices.length === 0 && selectedServiceId" class="rounded-xl border border-ink-200 bg-ink-50 p-3.5 text-sm text-ink-700 text-pretty" data-testid="visit-singleton-note">
          Hiện có 1 thiết bị. Yêu cầu này sẽ được gửi như đặt lịch thông thường, không tạo lượt sửa nhiều thiết bị.
        </p>

        <section
          v-if="visitEnabled && !isAiFlow && extraDevices.length > 0"
          class="space-y-3 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-sm sm:px-6"
          data-testid="visit-devices"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="font-semibold text-ink-900">Thiết bị trong lượt</h3>
            <span class="whitespace-nowrap text-ink-500">{{ visitDeviceCount }}/{{ VISIT_DEVICE_LIMIT }} thiết bị</span>
          </div>
          <ol v-if="reviewDevices.length" class="divide-y divide-ink-100">
            <li v-for="(device, index) in reviewDevices" :key="device.key" class="space-y-2.5 py-4 first:pt-0 last:pb-0" :data-testid="`visit-review-device-${index}`">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-ink-600">Máy {{ index + 1 }}</p>
                  <p class="break-words font-semibold text-ink-900">{{ device.serviceName }}</p>
                  <p v-if="device.deviceText" class="text-ink-600">{{ device.deviceText }}</p>
                </div>
                <div class="flex shrink-0 justify-end gap-1">
                  <button type="button" class="min-h-11 min-w-11 rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" :aria-label="`Sửa máy ${index + 1}: ${device.serviceName}`" :data-testid="device.savedKey ? `visit-device-edit-${index}` : 'visit-current-device-edit'" @click="device.savedKey ? editSavedDevice(device.savedKey) : step = 1">Sửa</button>
                  <button v-if="device.savedKey" type="button" class="min-h-11 min-w-11 rounded-lg px-2 font-semibold text-danger-700 hover:bg-danger-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-600" :aria-label="`Bỏ máy ${index + 1}: ${device.serviceName}`" :data-testid="`visit-device-remove-${index}`" @click="removeExtraDevice(device.savedKey)">Bỏ</button>
                </div>
              </div>
              <p class="break-words whitespace-pre-line text-ink-700 text-pretty">{{ device.description }}</p>
              <p class="text-sm text-ink-800"><span class="font-medium">Tiền công<template v-if="device.price.kind === 'range'"> tham khảo</template>:</span> {{ priceTextOf(device.price) }}</p>
              <div v-if="device.photos.length" class="flex flex-wrap gap-2" :aria-label="`Ảnh máy ${index + 1}`">
                <img v-for="(photo, photoIndex) in device.photos" :key="photo.localId" :src="photo.previewUrl" :alt="`Ảnh ${photoIndex + 1} của máy ${index + 1}`" class="h-12 w-12 rounded-lg border border-ink-200 object-cover" />
              </div>
            </li>
          </ol>
          <div v-if="recentlyRemovedDevice" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2" role="status">
            <span>Đã bỏ một thiết bị.</span>
            <button type="button" class="min-h-11 font-semibold text-brand-700 hover:underline" data-testid="visit-device-undo" @click="undoRemoveExtraDevice">Hoàn tác</button>
          </div>
          <p class="text-xs leading-relaxed text-ink-600 text-pretty">Một kỹ thuật viên, một buổi hẹn. Mỗi máy có báo giá riêng; bạn thanh toán một lần cho các máy sửa được.</p>
          <FhButton v-if="canAddDevice" variant="secondary" size="md" :disabled="loading" data-testid="visit-add-device" @click="selectedServiceId ? addAnotherDevice() : step = 1">
            <Plus :size="16" class="mr-1.5" /> Thêm thiết bị khác
          </FhButton>
          <div v-else class="flex flex-wrap items-center justify-between gap-x-3 border-t border-ink-100 pt-2" data-testid="visit-device-limit">
            <p class="text-ink-700">Đã đủ {{ VISIT_DEVICE_LIMIT }}/{{ VISIT_DEVICE_LIMIT }} thiết bị.</p>
            <FhButton variant="ghost" size="md" :disabled="loading" data-testid="visit-review-consultation" @click="step = 1; consultationOpen = true">Liên hệ FixHome hỗ trợ</FhButton>
          </div>
        </section>

        <section class="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white text-sm" data-testid="booking-review">
          <h3 v-if="extraDevices.length" class="px-4 py-4 font-semibold text-ink-900 sm:px-6">Lịch và địa chỉ chung</h3>
          <div v-if="selectedServiceId && !extraDevices.length" class="flex gap-4 px-5 py-4 sm:px-6">
            <span class="w-24 shrink-0 text-ink-500 sm:w-28">{{ extraDevices.length ? `Máy ${extraDevices.length + 1}` : 'Dịch vụ' }}</span>
            <div class="min-w-0 flex-1">
              <p class="font-medium text-ink-900">{{ selectedService?.name }}<span v-if="isFixedPrice && quantity > 1" class="text-ink-500"> × {{ quantity }}</span></p>
              <p v-if="deviceSummaryText" class="text-ink-500" data-testid="confirm-v2-scope">{{ deviceSummaryText }}</p>
            </div>
            <button type="button" class="min-h-11 min-w-11 self-start rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" :data-testid="extraDevices.length ? 'visit-current-device-edit' : undefined" @click="step = 1">{{ extraDevices.length ? `Sửa máy ${extraDevices.length + 1}` : 'Sửa' }}</button>
          </div>
          <div v-if="selectedServiceId && !extraDevices.length && description.trim()" class="flex gap-4 px-5 py-4 sm:px-6">
            <span class="w-24 shrink-0 text-ink-500 sm:w-28">Tình trạng</span>
            <p class="min-w-0 flex-1 text-ink-900 text-pretty">{{ description.trim() }}</p>
            <button v-if="!isAiFlow" type="button" class="min-h-11 min-w-11 self-start rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" @click="step = 1">Sửa</button>
          </div>
          <div v-if="selectedServiceId && !extraDevices.length && uploadedPhotos.length" class="flex gap-4 px-5 py-4 sm:px-6">
            <span class="w-24 shrink-0 text-ink-500 sm:w-28">Ảnh</span>
            <div class="flex flex-wrap gap-2">
              <img v-for="photo in uploadedPhotos" :key="photo.localId" :src="photo.previewUrl" alt="Ảnh thiết bị" class="h-14 w-14 rounded-lg object-cover" />
            </div>
          </div>
          <div class="booking-review-common flex gap-4 px-4 py-4 sm:px-6">
            <span class="w-24 shrink-0 text-ink-500 sm:w-28">Lịch hẹn</span>
            <p class="min-w-0 flex-1 font-medium text-ink-900">{{ formattedScheduleDisplay }}</p>
            <button type="button" class="min-h-11 min-w-11 self-start rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" @click="step = 2">Sửa</button>
          </div>
          <div class="booking-review-common flex gap-4 px-4 py-4 sm:px-6">
            <span class="w-24 shrink-0 text-ink-500 sm:w-28">Địa chỉ</span>
            <div class="min-w-0 flex-1">
              <p class="font-medium text-ink-900">{{ selectedAddress?.label || 'Địa chỉ' }}</p>
              <p class="break-words text-ink-600">{{ selectedAddress ? addressLine(selectedAddress) : '' }}</p>
            </div>
            <button type="button" class="min-h-11 min-w-11 self-start rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" @click="step = 2">Sửa</button>
          </div>
        </section>

        <section v-if="selectedServiceId && extraDevices.length === 0" class="space-y-2.5 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-sm sm:px-6" data-testid="booking-review-price">
          <div v-if="summaryPrice.kind === 'firm'" class="flex justify-between gap-4" data-testid="confirm-v2-price">
            <span class="text-ink-700">Tiền công</span>
            <span class="font-semibold text-ink-900 font-num"><FhMoney :amount="summaryPrice.amount" /></span>
          </div>
          <div v-else-if="summaryPrice.kind === 'range'" class="flex justify-between gap-4" data-testid="confirm-v2-range">
            <span class="text-ink-700">Tiền công tham khảo</span>
            <span class="font-semibold text-ink-900 font-num"><FhMoney :amount="summaryPrice.min" /> – <FhMoney :amount="summaryPrice.max" /></span>
          </div>
          <div v-else class="flex justify-between gap-4">
            <span class="text-ink-700">Tiền công</span>
            <span class="text-ink-900">{{ summaryPrice.kind === 'survey' && summaryPrice.from ? `Tham khảo ${formatMoney(summaryPrice.from)}` : 'Thợ báo giá tại nhà' }}</span>
          </div>
          <div class="flex justify-between gap-4 text-ink-500">
            <span>Linh kiện, vật tư</span>
            <span class="text-right">Kỹ thuật viên báo giá nếu cần; bạn duyệt trước khi thực hiện</span>
          </div>
          <template v-if="summaryPrice.kind === 'firm'">
            <div class="h-px bg-ink-100"></div>
            <div class="flex items-baseline justify-between gap-4" data-testid="confirm-v2-price-note">
              <span class="font-semibold text-ink-900">Tạm tính</span>
              <span class="text-2xl font-semibold text-brand-700 font-num"><FhMoney :amount="summaryPrice.amount" /></span>
            </div>
          </template>
          <p v-if="summaryPrice.kind === 'firm'" class="text-xs leading-relaxed text-ink-600" data-testid="confirm-fixed-price-scope">
            Tiền công theo phạm vi đã xác nhận; chưa gồm linh kiện FixHome hoặc tiền công phát sinh ngoài phạm vi. Kỹ thuật viên cần gửi báo giá, bạn duyệt trước khi thực hiện.
          </p>
          <p v-else class="text-ink-500" data-testid="confirm-v2-range-note">Thợ kiểm tra tại nhà và gửi báo giá để bạn duyệt trước khi sửa.</p>
        </section>

        <div v-if="chatAttachmentSummary" class="space-y-2 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-sm sm:px-6" data-testid="confirm-attachments">
          <div class="flex items-center justify-between gap-3">
            <span class="text-ink-500">Gửi kèm cho kỹ thuật viên</span>
            <span class="whitespace-nowrap text-right font-semibold text-ink-900">{{ chatAttachmentSummary }}</span>
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
                <p :class="item.state === 'failed' ? 'text-danger-700' : item.state === 'done' ? 'text-success-700' : 'text-ink-500'">{{ chatItemStatus(item) }}</p>
                <div v-if="item.state === 'uploading' || item.state === 'preparing'" class="mt-1 h-1 overflow-hidden rounded-full bg-ink-200">
                  <div class="h-full bg-brand-500 transition-[width] duration-300" :style="{ width: chatPercent(item.state === 'preparing' ? item.video?.progress ?? 0 : item.progress) }"></div>
                </div>
              </div>
              <button v-if="item.state === 'failed'" type="button" class="shrink-0 rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50" data-testid="confirm-attachment-retry" @click="aiConversation.retryUpload(item.id)">Thử lại</button>
              <button type="button" class="shrink-0 rounded-lg px-2 py-1 font-semibold text-danger-700 hover:bg-danger-50" data-testid="confirm-attachment-remove" @click="aiConversation.removeAttachment(item.id)">Bỏ</button>
            </li>
          </ul>
          <p v-if="chatPhotosLeftOut > 0" class="text-xs text-warning-700" data-testid="confirm-photos-left-out">Đã đủ 5 ảnh nên {{ chatPhotosLeftOut }} ảnh gửi trong trò chuyện không kèm theo.</p>
          <p v-if="chatUploads.busy > 0" class="text-xs text-ink-500">Ảnh, video vẫn đang gửi cho thợ. Mạng yếu thì có thể mất vài phút, bạn có thể bấm Bỏ để đặt thợ không kèm.</p>
        </div>

        <section v-if="visitGrouping && extraDevices.length" class="space-y-2 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-sm sm:px-6" data-testid="visit-review-price">
          <div v-if="visitSummaryPrice.kind === 'firm'" class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-semibold text-ink-900">Tổng tiền công đã xác định</span>
            <span class="text-lg font-semibold text-brand-700 font-num"><FhMoney :amount="visitSummaryPrice.amount" /></span>
          </div>
          <div v-else-if="visitSummaryPrice.kind === 'range'" class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-semibold text-ink-900">Tổng tiền công tham khảo</span>
            <span class="font-semibold text-ink-900 font-num"><FhMoney :amount="visitSummaryPrice.min" /> – <FhMoney :amount="visitSummaryPrice.max" /></span>
          </div>
          <div v-else-if="visitSummaryPrice.kind === 'partial'" class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-semibold text-ink-900">Tiền công đã xác định</span>
            <span class="font-semibold text-ink-900 font-num"><FhMoney :amount="visitSummaryPrice.confirmedTotal" /></span>
          </div>
          <div v-else class="flex items-baseline justify-between gap-4">
            <span class="font-semibold text-ink-900">Tiền công</span>
            <span class="text-ink-700">Thợ báo giá tại nhà</span>
          </div>
          <p v-if="visitSummaryPrice.kind === 'partial'" class="text-sm font-medium text-warning-800">+ {{ visitSummaryPrice.unresolvedCount }} máy chờ khảo sát báo giá. Chưa phải tổng {{ reviewDevices.length }} máy.</p>
          <p class="text-xs leading-relaxed text-ink-600">{{ visitSummaryPrice.kind === 'firm' ? 'Tiền công theo phạm vi đã xác nhận; chưa gồm linh kiện FixHome hoặc tiền công phát sinh ngoài phạm vi. Kỹ thuật viên cần gửi báo giá, bạn duyệt trước khi thực hiện.' : 'Chưa gồm linh kiện, vật tư. Kỹ thuật viên gửi báo giá để bạn duyệt trước khi sửa.' }}</p>
        </section>

        <div v-if="submitOutcomeUnknown" role="alert" class="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900" data-testid="booking-submit-unknown">
          <AlertTriangle :size="18" class="mt-0.5 shrink-0 text-warning-600" />
          <p>
            Chưa xác nhận được kết quả gửi yêu cầu. Vì hệ thống có thể đã ghi nhận, FixHome không tự gửi lại.
            Bạn kiểm tra mục <router-link to="/app/orders" class="font-bold underline">Đơn của tôi</router-link> trước; nếu chưa có, tải lại trang rồi đặt lại.
          </p>
        </div>

        <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <FhButton variant="ghost" size="md" @click="step = 2"><ArrowLeft :size="15" class="mr-1.5" /> Quay lại</FhButton>
          <FhButton
            variant="primary"
            size="lg"
            class="w-full px-3 text-sm sm:w-auto sm:px-8 sm:text-base"
            :loading="loading"
            :disabled="loading || submitOutcomeUnknown || chatUploads.busy > 0 || chatUploads.failed > 0 || visitDeviceCount > VISIT_DEVICE_LIMIT || (selectedServiceId ? !isCatalogV2PreviewReady : extraDevices.length < 2)"
            data-testid="booking-submit"
            @click="createAndFindTech"
          >
            <template v-if="chatUploads.busy > 0">Đang gửi ảnh, video cho thợ {{ Math.round(chatUploads.progress * 100) }}%</template>
            <template v-else>{{ visitGrouping && visitDeviceCount >= 2 ? `Tìm kỹ thuật viên · ${visitDeviceCount} thiết bị` : 'Tìm kỹ thuật viên' }}</template>
          </FhButton>
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
.booking-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: start; }
@media (max-width: 639px) {
  .booking-review-common { display: grid; grid-template-columns: minmax(0, 1fr) 44px; column-gap: 12px; row-gap: 4px; }
  .booking-review-common > :first-child { width: auto; }
  .booking-review-common > :nth-child(2) { grid-column: 1; }
  .booking-review-common > button { grid-column: 2; grid-row: 1 / span 2; }
}
@media (min-width: 1024px) {
  .booking-layout { grid-template-columns: minmax(0, 1fr) 22rem; gap: 32px; }
}
.booking-step1-grid--catalog :deep([data-testid="booking-device-details"] label > span) { min-height: 44px; }
@media (min-width: 1100px) {
  .booking-step1-grid--catalog { grid-template-columns: minmax(0, 42fr) minmax(0, 58fr); align-items: start; gap: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .wizard-step-enter-active, .wizard-step-leave-active, .fade-slide-enter-active, .fade-slide-leave-active { transition: none; }
}
</style>
