<script setup lang="ts">
import { tidyAddressText } from '../../utils/address-text';
import { toast } from 'vue-sonner';
// src/pages/customer/NewBookingWizardPage.vue
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Wrench,
  MapPin,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Camera,
  ShieldCheck,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  Snowflake,
  Droplets,
  Zap,
  Utensils,
  Lock,
  Flame,
  Check,
  Search,
  X,
  Minus,
  RotateCcw,
  ChevronDown,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhSkeleton,
} from '../../components';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { useReferenceData } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { bookingsApi } from '../../api/bookings.api';
import { AI_MAX_IMAGES } from '../../api/ai.api';
import { DESCRIBE_BEFORE_SEND, useAiConversation, useSharedAiConversation } from '../../composables/useAiConversation';
import { looksLikeImage, normalizeForUpload, prepareForAi } from '../../utils/image-for-ai';
import AiConversationThread from '../../components/chat/AiConversationThread.vue';
import { mediaApi, ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../../api/media.api';
import { SLOT_SHORT, sessionDayLabel, upcomingSessions, type BookingMode, type BookingSlot } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';
import { vnKeyAndClockToDate } from '../../utils/vn-time';


const route = useRoute();
const router = useRouter();

/**
 * Two forms on one page. /app/bookings/new: the customer knows what they need
 * and picks the service; no AI anywhere. /app/bookings/ai: the customer only
 * describes the problem, the assistant diagnoses it and chooses the service,
 * and only then can the customer change it.
 */
const isAiFlow = route.meta?.bookingFlow === 'ai';

const step = ref(1);
const loading = ref(false);

// Form State
const categories = ref<ServiceCategory[]>([]);
const selectedCategoryId = ref('');
const services = ref<ServiceItem[]>([]);
const selectedServiceId = ref('');
const description = ref('');
const urgency = ref<'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY'>('NORMAL');
const quantity = ref(1);

// UX Enhancements: Search, Filter, Sync
const searchQuery = ref('');
const serviceFilter = ref<'ALL' | 'FIXED' | 'INSPECTION'>('ALL');
const userModifiedDescription = ref(false);
const isDraggingPhoto = ref(false);

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
const aiSuggestsOtherService = computed(
  () => !!aiSuggested.value?.serviceId && aiSuggested.value.serviceId !== selectedServiceId.value,
);
const aiSuggestedServiceExists = computed(() =>
  categories.value.some((cat) => cat.services?.some((srv) => srv.id === aiSuggested.value?.serviceId)),
);

/** Open the conversation with what the customer already gave: description and photos. */
async function startAiConversation() {
  if (aiConversation.turnCount.value > 0 || aiConversation.isThinking.value) return;
  // The assistant diagnoses from words; photos only go along with them (BRX-064).
  if (!description.value.trim()) return;
  void aiConversation.loadHoldingLines();
  const files = uploadedPhotos.value.map((photo) => photo.file).slice(0, AI_MAX_IMAGES);
  const prepared = files.length ? await prepareForAi(files, 0) : { images: [] };
  await aiConversation.sendTurn(description.value.trim(), prepared.images);
}

/** Start again from the current description and photos, e.g. after editing step 1. */
async function restartAiConversation() {
  aiConversation.startOver();
  await startAiConversation();
}

/** In the AI form the assistant chooses the service: its first pick is applied. */
watch(
  () => aiConversation.pinnedService.value,
  (suggested) => {
    if (!isAiFlow || !suggested?.serviceId || selectedServiceId.value) return;
    if (aiSuggestedServiceExists.value) useSuggestedService();
  },
);

/** After the diagnosis, the customer may still pick another service themselves. */
const allServices = computed(() =>
  categories.value.flatMap((cat) => (cat.services ?? []).map((srv) => ({ ...srv, categoryName: cat.name, categoryId: cat.id }))),
);
function chooseService(id: string) {
  for (const cat of categories.value) {
    if (cat.services?.some((srv) => srv.id === id)) {
      selectedCategoryId.value = cat.id;
      services.value = cat.services ?? [];
      selectedServiceId.value = id;
      return;
    }
  }
}

/** Steps in the order each form walks them; numbers are the step ids below. */
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
  for (const cat of categories.value) {
    if (cat.services?.some((srv) => srv.id === wanted)) {
      selectedCategoryId.value = cat.id;
      services.value = cat.services ?? [];
      selectedServiceId.value = wanted;
      return;
    }
  }
}

const selectedService = computed(() => {
  for (const cat of categories.value) {
    const found = cat.services?.find((s) => s.id === selectedServiceId.value);
    if (found) return found;
  }
  return services.value.find((s) => s.id === selectedServiceId.value);
});

const isFixedPrice = computed(() => {
  const s = selectedService.value;
  if (!s) return route.query.fixed === 'true';
  const mode = s.pricingMode?.toLowerCase();
  return mode === 'fixed_price' || (s.fixedPrice != null && s.fixedPrice > 0) || route.query.fixed === 'true';
});

const totalFixedAmount = computed(() => {
  const price = selectedService.value?.fixedPrice || selectedService.value?.basePrice || 0;
  return price * quantity.value;
});

// Category Icon resolution with smart keywords
function getCategoryIcon(cat?: ServiceCategory | null) {
  if (!cat) return Wrench;
  const key = (cat.iconKey || cat.code || cat.name || '').toLowerCase();
  if (key.includes('lanh') || key.includes('lạnh') || key.includes('điều hòa') || key.includes('refriger')) return Snowflake;
  if (key.includes('nước') || key.includes('nuoc') || key.includes('plumb') || key.includes('lavabo')) return Droplets;
  if (key.includes('điện') || key.includes('dien') || key.includes('electr')) return Zap;
  if (key.includes('bếp') || key.includes('bep') || key.includes('kitchen') || key.includes('nấu')) return Utensils;
  if (key.includes('khóa') || key.includes('khoa') || key.includes('cửa') || key.includes('lock')) return Lock;
  return Wrench;
}

// Current services for selected category
const currentCategoryServices = computed(() => {
  const cat = categories.value.find((c) => c.id === selectedCategoryId.value);
  return cat?.services ?? services.value ?? [];
});

const fixedServicesCount = computed(() => {
  return currentCategoryServices.value.filter((s) => {
    const mode = s.pricingMode?.toLowerCase();
    return mode === 'fixed_price' || (s.fixedPrice != null && s.fixedPrice > 0);
  }).length;
});

const inspectionServicesCount = computed(() => {
  return currentCategoryServices.value.length - fixedServicesCount.value;
});

const filteredServices = computed(() => {
  let list = currentCategoryServices.value;

  if (serviceFilter.value === 'FIXED') {
    list = list.filter((s) => {
      const mode = s.pricingMode?.toLowerCase();
      return mode === 'fixed_price' || (s.fixedPrice != null && s.fixedPrice > 0);
    });
  } else if (serviceFilter.value === 'INSPECTION') {
    list = list.filter((s) => {
      const mode = s.pricingMode?.toLowerCase();
      return mode !== 'fixed_price' && (s.fixedPrice == null || s.fixedPrice === 0);
    });
  }

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.scopeDescription && s.scopeDescription.toLowerCase().includes(q))
    );
  }

  return list;
});

const syncDefaultDescription = () => {
  const svc = selectedService.value;
  if (!svc) return;
  const isFixed = svc.pricingMode?.toLowerCase() === 'fixed_price' || (svc.fixedPrice != null && svc.fixedPrice > 0);
  if (isFixed) {
    description.value = `Yêu cầu dịch vụ niêm yết: ${svc.name}${quantity.value > 1 ? ` (${quantity.value} ${svc.unit || 'thiết bị'})` : ''}`;
  } else {
    description.value = `Yêu cầu dịch vụ: ${svc.name}`;
  }
};

const selectService = (svc: ServiceItem) => {
  selectedServiceId.value = svc.id;
  if (!userModifiedDescription.value) {
    syncDefaultDescription();
  }
};

const updateQuantity = (delta: number) => {
  quantity.value = Math.max(1, Math.min(99, quantity.value + delta));
  if (!userModifiedDescription.value && isFixedPrice.value) {
    syncDefaultDescription();
  }
};

const categorySymptoms = computed<string[]>(() => {
  const cat = categories.value.find((c) => c.id === selectedCategoryId.value);
  const name = (cat?.name || '').toLowerCase();
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

const urgencyList = [
  {
    key: 'LOW',
    label: 'Bình thường',
    hint: 'Trong 24–48h',
    badge: 'Tiết kiệm',
    icon: ShieldCheck,
  },
  {
    key: 'NORMAL',
    label: 'Tiêu chuẩn',
    hint: 'Trong ngày',
    badge: 'Phổ biến',
    icon: Clock,
  },
  {
    key: 'HIGH',
    label: 'Khẩn cấp',
    hint: 'Trong 1–2h',
    badge: 'Ưu tiên',
    icon: Zap,
  },
  {
    key: 'EMERGENCY',
    label: 'Cực khẩn',
    hint: 'Dưới 30 phút',
    badge: 'Hỏa tốc',
    icon: Flame,
  },
] as const;

/** Track colour per level, from calm to alarming. */
const URGENCY_COLORS: Record<(typeof urgencyList)[number]['key'], string> = {
  LOW: '#16a34a',
  NORMAL: '#2563eb',
  HIGH: '#f59e0b',
  EMERGENCY: '#dc2626',
};

/** Continuous slider position: follows pointer continuously when dragging, snaps on release. */
const sliderValue = ref<number>(Math.max(0, urgencyList.findIndex((lvl) => lvl.key === urgency.value)));
const isDraggingSlider = ref(false);
const urgencyTrackRef = ref<HTMLElement | null>(null);

watch(
  () => urgency.value,
  (val) => {
    const idx = urgencyList.findIndex((lvl) => lvl.key === val);
    if (idx >= 0 && !isDraggingSlider.value && Math.round(sliderValue.value) !== idx) {
      sliderValue.value = idx;
    }
  },
);

const activeUrgencyIndex = computed(() => {
  return Math.min(urgencyList.length - 1, Math.max(0, Math.round(sliderValue.value)));
});
const currentUrgency = computed(() => urgencyList[activeUrgencyIndex.value]);
const urgencyColor = computed(() => URGENCY_COLORS[currentUrgency.value.key]);
const urgencyFillPercent = computed(() => {
  return Math.min(100, Math.max(0, (sliderValue.value / (urgencyList.length - 1)) * 100));
});

function setUrgencyIndex(idx: number) {
  isDraggingSlider.value = false;
  const clamped = Math.min(urgencyList.length - 1, Math.max(0, idx));
  sliderValue.value = clamped;
  urgency.value = urgencyList[clamped].key;
}

function updateSliderFromClientX(clientX: number) {
  const track = urgencyTrackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  sliderValue.value = ratio * (urgencyList.length - 1);
  urgency.value = urgencyList[activeUrgencyIndex.value].key;
}

function onSliderTrackPointerDown(event: PointerEvent) {
  const track = urgencyTrackRef.value;
  if (track && 'setPointerCapture' in track) {
    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }
  isDraggingSlider.value = true;
  updateSliderFromClientX(event.clientX);
}

function onSliderTrackPointerMove(event: PointerEvent) {
  if (!isDraggingSlider.value) return;
  updateSliderFromClientX(event.clientX);
}

function onSliderTrackPointerUp(event: PointerEvent) {
  if (!isDraggingSlider.value) return;
  const track = urgencyTrackRef.value;
  if (track && 'releasePointerCapture' in track && track.hasPointerCapture(event.pointerId)) {
    try {
      track.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }
  isDraggingSlider.value = false;
  setUrgencyIndex(Math.round(sliderValue.value));
}

function onSliderNativeInput(event: Event) {
  const val = Number((event.target as HTMLInputElement).value);
  if (!Number.isNaN(val)) {
    sliderValue.value = val;
    urgency.value = urgencyList[activeUrgencyIndex.value].key;
  }
}

function onSliderNativeChange() {
  setUrgencyIndex(Math.round(sliderValue.value));
}

function onSliderKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault();
    setUrgencyIndex(Math.min(urgencyList.length - 1, activeUrgencyIndex.value + 1));
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault();
    setUrgencyIndex(Math.max(0, activeUrgencyIndex.value - 1));
  } else if (e.key === 'Home') {
    e.preventDefault();
    setUrgencyIndex(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    setUrgencyIndex(urgencyList.length - 1);
  }
}

// Services and saved addresses: skeletons until they arrive, a retry line if they do not.
// The catalog is reference data, cached for the next form.
const reference = useReferenceData();
const catalogLoading = ref(true);
const catalogLoadFailed = ref(false);

async function loadCatalog() {
  catalogLoading.value = true;
  catalogLoadFailed.value = false;
  try {
    const [cats, addrs] = await Promise.all([
      reference(queryKeys.reference.categories({ activeOnly: true }), () => catalogApi.getCategories(true)),
      profileApi.getAddresses(),
    ]);
    categories.value = cats;
    if (cats.length > 0) {
      // If query param matches category or service
      const q = route.query.q ? String(route.query.q).toLowerCase() : '';
      let matchedCat = cats[0];
      let matchedSvc: ServiceItem | undefined;

      const wantedId = route.query.serviceId ? String(route.query.serviceId) : '';
      if (wantedId) {
        for (const c of cats) {
          const s = c.services?.find((srv) => srv.id === wantedId);
          if (s) {
            matchedCat = c;
            matchedSvc = s;
            break;
          }
        }
      }

      if (!matchedSvc && q) {
        for (const c of cats) {
          const sFixed = c.services?.find((srv) =>
            srv.name.toLowerCase().includes(q) &&
            (srv.pricingMode?.toLowerCase() === 'fixed_price' || (srv.fixedPrice != null && srv.fixedPrice > 0))
          );
          if (sFixed) {
            matchedCat = c;
            matchedSvc = sFixed;
            break;
          }
          const s = c.services?.find((srv) => srv.name.toLowerCase().includes(q));
          if (s) {
            matchedCat = c;
            matchedSvc = s;
            break;
          }
        }
      }

      selectedCategoryId.value = matchedCat.id;
      services.value = matchedCat.services ?? [];
      if (matchedSvc) {
        selectedServiceId.value = matchedSvc.id;
        if (!isAiFlow && matchedSvc.pricingMode?.toLowerCase() === 'fixed_price' || (matchedSvc.fixedPrice != null && matchedSvc.fixedPrice > 0)) {
          description.value = `Yêu cầu dịch vụ niêm yết: ${matchedSvc.name}`;
        }
      } else if (!isAiFlow && services.value.length > 0) {
        selectedServiceId.value = services.value[0].id;
        const first = services.value[0];
        if (first.pricingMode?.toLowerCase() === 'fixed_price' || (first.fixedPrice != null && first.fixedPrice > 0)) {
          description.value = `Yêu cầu dịch vụ niêm yết: ${first.name}`;
        }
      }
    }
    // What the customer already told the assistant is their description; it
    // counts as typed by them, so picking another service does not replace it.
    const fromChat = typeof route.query.desc === 'string' ? route.query.desc.trim().slice(0, 1000) : '';
    if (fromChat) {
      description.value = fromChat;
      userModifiedDescription.value = true;
    }
    addresses.value = addrs;
    const defAddr = addrs.find((a) => a.isDefault);
    if (defAddr) selectedAddressId.value = defAddr.id;
    else if (addrs.length > 0) selectedAddressId.value = addrs[0].id;
    // From the floating assistant: diagnosis done and service chosen, so the
    // customer goes straight to address and time (back shows the conversation).
    if (isAiFlow && continuesAssistant && selectedServiceId.value && description.value.trim()) step.value = 2;

  } catch {
    catalogLoadFailed.value = true;
  } finally {
    catalogLoading.value = false;
  }
}

onMounted(loadCatalog);

onBeforeUnmount(() => {
  isPhotoFlowDisposed.value = true;
  for (const previewUrl of activePhotoPreviewUrls) {
    URL.revokeObjectURL(previewUrl);
  }
  activePhotoPreviewUrls.clear();
  uploadedPhotos.value = [];
});

const onCategorySelect = (catId: string) => {
  selectedCategoryId.value = catId;
  searchQuery.value = '';
  serviceFilter.value = 'ALL';
  const cat = categories.value.find((c) => c.id === catId);
  services.value = cat?.services ?? [];
  if (services.value.length > 0) {
    selectedServiceId.value = services.value[0].id;
    if (!userModifiedDescription.value) {
      syncDefaultDescription();
    }
  } else {
    selectedServiceId.value = '';
  }
};

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


const goToStep2 = () => {
  if (!selectedServiceId.value) {
    toast.warning('Vui lòng chọn một dịch vụ cụ thể.');
    return;
  }
  if (!description.value.trim()) {
    if (isFixedPrice.value && selectedService.value) {
      description.value = `Yêu cầu dịch vụ niêm yết: ${selectedService.value.name} (${quantity.value} ${selectedService.value.unit || 'thiết bị'})`;
    } else {
      toast.warning('Vui lòng mô tả sơ bộ tình trạng lỗi của thiết bị.');
      return;
    }
  }
  step.value = 2;
};

const goToNextStepFrom2 = async () => {
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
};

const createAndFindTech = async () => {
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

  loading.value = true;
  try {
    if (!selectedAddressId.value) throw new Error('Vui lòng thêm địa chỉ trước khi đặt lịch.');
    const booking = await bookingsApi.createBooking({
      serviceId: selectedServiceId.value,
      addressId: selectedAddressId.value,
      description: isAiFlow ? (aiConversation.customerWords() || description.value) : description.value,
      ...schedule,
      ...(customerNote.value.trim() ? { customerNote: customerNote.value.trim() } : {}),
      quantity: isFixedPrice.value ? quantity.value : 1,
      urgency: urgency.value,
      photoUploadIds,
      ...(aiSessionId.value ? { aiSessionId: aiSessionId.value } : {}),
    });
    router.push(`/app/bookings/${booking.id}/candidates`);
  } catch (error: unknown) {
    console.error('[NewBookingWizardPage] createBooking failed:', error);
    const errObj = error as { response?: { data?: { error?: { message?: string }; message?: string } } } | undefined;
    const backendMessage =
      errObj?.response?.data?.error?.message ||
      errObj?.response?.data?.message;

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
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6 pb-16">
    <!-- Stepper: Pill shaped, centered, matching user image design -->
    <div class="bg-white rounded-full border border-ink-200/90 py-3 sm:py-3.5 px-4 sm:px-8 shadow-xs" data-testid="booking-stepper">
      <div class="flex items-center justify-between sm:justify-center overflow-x-auto no-scrollbar gap-2 sm:gap-6">
        <template v-for="(item, index) in stepItems" :key="item.id">
          <!-- Step pill item -->
          <div
            class="flex items-center gap-2 sm:gap-2.5 shrink-0 transition-colors duration-200"
            :class="stepIndex >= index ? 'text-brand-600 font-bold' : 'text-ink-400 font-medium'"
          >
            <span
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-num font-bold transition-all duration-300 shadow-2xs"
              :class="stepIndex >= index ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'"
            >
              {{ index + 1 }}
            </span>
            <span class="text-xs sm:text-sm whitespace-nowrap">{{ item.label }}</span>
          </div>

          <!-- Connector bar between steps -->
          <div
            v-if="index < stepItems.length - 1"
            class="w-8 sm:w-16 h-[2px] rounded-full shrink-0 transition-colors duration-300"
            :class="stepIndex > index ? 'bg-brand-600' : 'bg-ink-200'"
          ></div>
        </template>
      </div>
    </div>

    <!-- Animated Step Containers -->
    <Transition name="wizard-step" mode="out-in">
      <!-- Step 1: Service & Issue Description -->
      <div v-if="step === 1" key="step-1" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-7">
        <!-- Title & Subtitle + Trust banner -->
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">
              {{ isAiFlow ? 'Mô tả sự cố để trợ lý AI phân tích' : 'Nhà mình đang gặp vấn đề gì?' }}
            </h2>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
              <ShieldCheck :size="14" class="text-brand-600" />
              <span>Thợ tay nghề chuẩn • Báo giá minh bạch</span>
            </span>
          </div>
          <p class="text-xs sm:text-sm text-ink-500 leading-relaxed">
            <template v-if="isAiFlow">
              Kể tình trạng thiết bị và gửi ảnh nếu có. Trợ lý sẽ phân tích, hỏi thêm nếu cần và chọn dịch vụ phù hợp; bạn không cần tự chọn dịch vụ.
            </template>
            <template v-else>
              Chọn nhóm thiết bị, dịch vụ cần xử lý và mô tả tình trạng để FixHome điều phối đúng kỹ thuật viên chuyên trách mang đủ trang thiết bị.
            </template>
          </p>
        </div>

        <div
          v-if="catalogLoadFailed"
          role="alert"
          class="p-3.5 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3"
          data-testid="booking-catalog-error"
        >
          <span>Chưa tải được dịch vụ và địa chỉ, vui lòng thử lại.</span>
          <FhButton variant="secondary" size="sm" @click="loadCatalog">Thử lại</FhButton>
        </div>

        <div class="space-y-7 text-xs sm:text-sm">
          <!-- Choosing the service is the plain form's job; the AI form leaves it to the assistant. -->
          <template v-if="!isAiFlow">
          <!-- 1. Categories Pills with Icons & Count -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="font-bold text-ink-900 text-xs sm:text-sm flex items-center gap-1.5">
                <span>1. Chọn nhóm thiết bị / dịch vụ</span>
                <span class="text-danger-600 font-bold">*</span>
              </label>
              <span class="text-[11px] text-ink-500">{{ categories.length }} nhóm khả dụng</span>
            </div>

            <div
              v-if="catalogLoading"
              class="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              aria-busy="true"
              aria-label="Đang tải nhóm dịch vụ"
              data-testid="booking-categories-skeleton"
            >
              <FhSkeleton v-for="i in 4" :key="i" height="88px" rounded="lg" />
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 active:scale-95 flex flex-col justify-between gap-2 relative overflow-hidden"
                :class="selectedCategoryId === cat.id
                  ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/20 ring-2 ring-brand-500/20'
                  : 'border-ink-200 bg-ink-50/60 hover:bg-white hover:border-brand-300 text-ink-800 hover:shadow-xs'"
                @click="onCategorySelect(cat.id)"
              >
                <div class="flex items-center justify-between w-full">
                  <div
                    class="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                    :class="selectedCategoryId === cat.id ? 'bg-white/20 text-white' : 'bg-white text-brand-600 shadow-xs border border-ink-100 group-hover:text-brand-700'"
                  >
                    <component :is="getCategoryIcon(cat)" :size="17" />
                  </div>
                  <span
                    class="text-xs font-bold px-2 py-0.5 rounded-full"
                    :class="selectedCategoryId === cat.id ? 'bg-white/20 text-white' : 'bg-ink-200/70 text-ink-600'"
                  >
                    {{ cat.services?.length || 0 }} dịch vụ
                  </span>
                </div>
                <div>
                  <div class="font-bold text-xs sm:text-[13px] leading-snug line-clamp-1">
                    {{ cat.name }}
                  </div>
                  <div
                    class="text-xs mt-0.5 line-clamp-1"
                    :class="selectedCategoryId === cat.id ? 'text-brand-100' : 'text-ink-500'"
                  >
                    {{ cat.description || 'Sửa chữa & bảo dưỡng' }}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- 2. Specific Services Explorer (The Core Focus!) -->
          <div class="space-y-3 pt-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label class="font-bold text-ink-900 text-xs sm:text-sm flex items-center gap-1.5">
                <span>2. Dịch vụ cụ thể trong nhóm</span>
                <span class="text-danger-600 font-bold">*</span>
                <span class="text-[11px] font-normal text-ink-500">
                  ({{ filteredServices.length }} / {{ currentCategoryServices.length }} dịch vụ)
                </span>
              </label>

              <!-- Filter mode pills -->
              <div class="flex items-center gap-1.5 bg-ink-100/80 p-1 rounded-xl self-start sm:self-auto text-[11px]">
                <button
                  type="button"
                  class="whitespace-nowrap px-2.5 py-1 rounded-lg font-semibold transition-all"
                  :class="serviceFilter === 'ALL' ? 'bg-white text-ink-900 shadow-xs font-bold' : 'text-ink-600 hover:text-ink-900'"
                  @click="serviceFilter = 'ALL'"
                >
                  Tất cả ({{ currentCategoryServices.length }})
                </button>
                <button
                  v-if="fixedServicesCount > 0"
                  type="button"
                  class="px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1"
                  :class="serviceFilter === 'FIXED' ? 'bg-white text-brand-700 shadow-xs font-bold' : 'text-ink-600 hover:text-ink-900'"
                  @click="serviceFilter = 'FIXED'"
                >
                  <Zap :size="14" /><span>Giá niêm yết</span>
                  <span class="text-xs opacity-80">({{ fixedServicesCount }})</span>
                </button>
                <button
                  v-if="inspectionServicesCount > 0"
                  type="button"
                  class="px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1"
                  :class="serviceFilter === 'INSPECTION' ? 'bg-white text-ink-900 shadow-xs font-bold' : 'text-ink-600 hover:text-ink-900'"
                  @click="serviceFilter = 'INSPECTION'"
                >
                  <Search :size="14" /><span>Khảo sát</span>
                  <span class="text-xs opacity-80">({{ inspectionServicesCount }})</span>
                </button>
              </div>
            </div>

            <!-- Search input bar -->
            <div class="relative">
              <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Tìm dịch vụ theo tên, lỗi hoặc từ khóa (ví dụ: siphon, lavabo, máy lạnh, vệ sinh...)"
                class="w-full h-11 pl-10 pr-9 bg-ink-50/80 border border-ink-200 rounded-xl text-xs sm:text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:bg-white transition-all"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 p-0.5"
                @click="searchQuery = ''"
              >
                <X :size="15" />
              </button>
            </div>

            <!-- Service Cards Grid -->
            <div v-if="catalogLoading" class="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true" aria-label="Đang tải dịch vụ">
              <div v-for="i in 4" :key="i" class="p-4 rounded-2xl border border-ink-200 bg-white space-y-3">
                <FhSkeleton width="45%" height="14px" />
                <FhSkeleton width="80%" height="16px" />
                <FhSkeleton width="35%" height="14px" />
              </div>
            </div>
            <div v-else-if="filteredServices.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
              <div
                v-for="svc in filteredServices"
                :key="svc.id"
                class="group p-4 rounded-2xl border cursor-pointer transition-all duration-200 relative flex flex-col justify-between gap-3 text-left"
                :class="selectedServiceId === svc.id
                  ? 'border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-xs'
                  : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-ink-50/40 shadow-xs'"
                @click="selectService(svc)"
              >
                <!-- Card Header: Mode badge + duration + radio -->
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span
                      v-if="svc.pricingMode?.toLowerCase() === 'fixed_price' || (svc.fixedPrice != null && svc.fixedPrice > 0)"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-success-50 text-success-700 border border-success-200"
                    >
                      <Zap :size="12" /> Giá niêm yết
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-ink-100 text-ink-700 border border-ink-200"
                    >
                      <Search :size="12" /> Khảo sát tận nơi
                    </span>
                    <span class="text-[11px] text-ink-500 inline-flex items-center gap-1 font-medium">
                      <Clock :size="12" class="text-ink-400" />
                      ~{{ svc.estimatedMinutes }} phút
                    </span>
                  </div>

                  <!-- Radio circle indicator -->
                  <div
                    class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
                    :class="selectedServiceId === svc.id ? 'bg-brand-600 text-white shadow-xs' : 'border-2 border-ink-300 bg-white group-hover:border-brand-400'"
                  >
                    <Check v-if="selectedServiceId === svc.id" :size="12" stroke-width="3" />
                  </div>
                </div>

                <!-- Card Body: Name & Scope -->
                <div class="space-y-1">
                  <div class="font-bold text-xs sm:text-[14px] text-ink-900 group-hover:text-brand-600 transition-colors leading-snug">
                    {{ svc.name }}
                  </div>
                  <div class="text-[11px] text-ink-500 line-clamp-2 leading-relaxed">
                    {{ svc.scopeDescription || svc.description || 'Dịch vụ sửa chữa, bảo dưỡng chuyên nghiệp bởi kỹ thuật viên FixHome.' }}
                  </div>
                </div>

                <!-- Card Footer: Price Display -->
                <div class="pt-2 border-t border-ink-100 flex items-center justify-between">
                  <div v-if="svc.pricingMode?.toLowerCase() === 'fixed_price' || (svc.fixedPrice != null && svc.fixedPrice > 0)" class="flex items-baseline gap-1">
                    <span class="text-xs font-bold text-brand-700 font-num">
                      <FhMoney :amount="svc.fixedPrice || svc.basePrice || 0" />
                    </span>
                    <span class="text-[11px] text-ink-500 font-normal">
                      / {{ svc.unit || 'thiết bị' }}
                    </span>
                  </div>
                  <div v-else class="text-[11px] font-semibold text-ink-600 bg-ink-100/80 px-2 py-0.5 rounded-lg">
                    Báo giá trước khi sửa
                  </div>

                  <span
                    v-if="selectedServiceId === svc.id"
                    class="text-[11px] font-bold text-brand-600 flex items-center gap-1"
                  >
                    Đã chọn
                  </span>
                  <span
                    v-else
                    class="text-[11px] font-medium text-ink-400 group-hover:text-brand-600"
                  >
                    Chọn dịch vụ
                  </span>
                </div>
              </div>
            </div>

            <!-- Empty Search State -->
            <div
              v-else
              class="p-8 rounded-2xl bg-ink-50 border border-dashed border-ink-300 text-center space-y-2"
            >
              <div class="w-10 h-10 rounded-full bg-white text-ink-400 flex items-center justify-center mx-auto shadow-xs">
                <Search :size="18" />
              </div>
              <p class="text-xs font-bold text-ink-800">Không tìm thấy dịch vụ phù hợp</p>
              <p class="text-[11px] text-ink-500">
                Thử tìm với từ khóa khác hoặc chuyển sang nhóm thiết bị khác.
              </p>
              <button
                type="button"
                class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-brand-600 bg-white border border-brand-200 rounded-xl hover:bg-brand-50"
                @click="searchQuery = ''; serviceFilter = 'ALL'"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            </div>
          </div>

          <!-- 3. Fixed Price Package Detail & Quantity Configurator -->
          <div
            v-if="isFixedPrice"
            class="p-5 rounded-2xl bg-brand-50 border border-brand-200 space-y-4"
          >
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-600 text-white">
                    Gói trọn gói chuẩn
                  </span>
                  <span class="font-bold text-xs sm:text-sm text-brand-950">
                    {{ selectedService?.name }}
                  </span>
                </div>
                <p class="text-[11px] text-brand-800">
                  Đã bao gồm toàn bộ tiền công kỹ thuật viên chuẩn quy trình FixHome.
                </p>
              </div>

              <div class="text-right">
                <div class="text-[11px] text-ink-500">Đơn giá niêm yết</div>
                <div class="text-sm sm:text-base font-bold text-brand-700 font-num">
                  <FhMoney :amount="selectedService?.fixedPrice || selectedService?.basePrice || 0" />
                  <span class="text-xs text-ink-500 font-normal"> / {{ selectedService?.unit || 'thiết bị' }}</span>
                </div>
              </div>
            </div>

            <!-- Quantity Counter with tactile stepper -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-brand-200/80 gap-3">
              <div>
                <label class="font-bold text-ink-800 text-xs">Số lượng thiết bị cần làm:</label>
                <div class="text-[11px] text-ink-500">
                  Tăng số lượng nếu nhà mình cần xử lý nhiều thiết bị cùng lúc.
                </div>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex items-center bg-white border border-ink-200 rounded-xl p-1 shadow-xs">
                  <button
                    type="button"
                    class="w-8 h-8 rounded-lg font-bold flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink-100 active:scale-95 text-ink-800"
                    :disabled="quantity <= 1"
                    @click="updateQuantity(-1)"
                  >
                    <Minus :size="14" />
                  </button>
                  <span class="w-10 text-center font-bold font-num text-sm text-ink-900">{{ quantity }}</span>
                  <button
                    type="button"
                    class="w-8 h-8 rounded-lg font-bold flex items-center justify-center transition-all hover:bg-ink-100 active:scale-95 text-ink-800"
                    @click="updateQuantity(1)"
                  >
                    <Plus :size="14" />
                  </button>
                </div>

                <div class="text-right pl-2">
                  <div class="text-xs text-ink-500 font-medium">Tổng tiền trọn gói:</div>
                  <div class="font-bold text-base text-brand-700 font-num">
                    <FhMoney :amount="totalFixedAmount" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Transparency Reassurance -->
            <div class="pt-2 border-t border-brand-200/60 flex items-center gap-2 text-[11px] text-brand-900 font-medium">
              <CheckCircle2 :size="15" class="text-success-600 shrink-0" />
              <span>Chỉ thanh toán khi kỹ thuật viên hoàn thành và gửi ảnh sau sửa. Không phát sinh phụ phí ẩn.</span>
            </div>
          </div>

          </template>

          <!-- 4. Photo Upload Area (Drag & Drop + Dotted Box) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
                <Camera :size="15" class="text-brand-600" />
                <span>{{ isAiFlow ? 1 : 3 }}. Ảnh hiện trạng thiết bị (khuyên dùng)</span>
              </label>
              <span class="text-[11px] text-ink-500 font-medium">
                {{ uploadedPhotos.length }}/5 ảnh
              </span>
            </div>

            <input
              ref="photoInput"
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              class="hidden"
              @change="handlePhotoSelected"
            />

            <div
              class="p-6 rounded-2xl border-2 border-dashed transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center space-y-2"
              :class="[
                isDraggingPhoto
                  ? 'border-brand-600 bg-brand-50 ring-4 ring-brand-500/20'
                  : 'border-brand-300 bg-brand-50/30 hover:bg-brand-50/70',
                uploadingPhoto ? 'opacity-60 pointer-events-none' : ''
              ]"
              @click="openPhotoPicker"
              @dragover.prevent="isDraggingPhoto = true"
              @dragleave.prevent="isDraggingPhoto = false"
              @drop.prevent="onPhotoDrop"
            >
              <div class="w-12 h-12 rounded-2xl bg-white text-brand-600 flex items-center justify-center shadow-xs border border-brand-100">
                <Camera :size="22" />
              </div>
              <div>
                <p class="text-xs sm:text-sm font-bold text-brand-700">
                  {{ uploadingPhoto ? 'Đang tải ảnh lên...' : 'Bấm để chọn ảnh hoặc kéo thả vào đây' }}
                </p>
                <p class="text-[11px] text-ink-500 mt-0.5">
                  Chụp toàn cảnh thiết bị hoặc vị trí đang gặp sự cố (Tối đa 5 ảnh · JPG, PNG, WebP · Dưới 10 MB)
                </p>
              </div>
            </div>

            <!-- Image previews -->
            <div v-if="uploadedPhotos.length > 0" class="flex flex-wrap gap-3 mt-3">
              <div
                v-for="(photo, idx) in uploadedPhotos"
                :key="photo.localId"
                class="relative w-20 h-20 rounded-2xl overflow-hidden border border-ink-200 shadow-xs group bg-ink-100"
              >
                <img :src="photo.previewUrl" alt="Ảnh thiết bị đã chọn" class="w-full h-full object-cover" />

                <!-- Uploading spinner overlay -->
                <div
                  v-if="!photo.uploadId"
                  class="absolute inset-0 bg-black/40 flex items-center justify-center text-white"
                >
                  <Sparkles class="animate-spin" :size="16" />
                </div>

                <button
                  type="button"
                  class="absolute top-1.5 right-1.5 p-1 bg-black/60 text-white rounded-full hover:bg-danger-600 transition-colors shadow-xs"
                  @click.stop="removePhoto(idx)"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </div>

          <!-- 5. Issue Description & Symptom Suggestion Chips -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between flex-wrap gap-1">
              <label class="font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
                <span>{{ isAiFlow ? 2 : 4 }}. Mô tả chi tiết yêu cầu</span>
                <span v-if="!isFixedPrice" class="text-danger-600 font-bold">*</span>
              </label>
              <span v-if="isFixedPrice" class="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                <Zap :size="12" class="inline -mt-0.5" /> Giá niêm yết (Không bắt buộc mô tả lỗi)
              </span>
              <span v-else class="text-[11px] text-ink-500">
                Mô tả chi tiết để thợ chuẩn bị linh kiện sát nhất
              </span>
            </div>

            <!-- Quick symptom chips for faster input -->
            <div v-if="!isAiFlow" class="space-y-1.5">
              <div class="text-[11px] text-ink-500 flex items-center gap-1">
                <Sparkles :size="12" class="text-brand-600" />
                <span>Gợi ý triệu chứng phổ biến (bấm để thêm nhanh vào mô tả):</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="sym in categorySymptoms"
                  :key="sym"
                  type="button"
                  class="px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all active:scale-95 border"
                  :class="hasSymptom(sym)
                    ? 'bg-brand-50 text-brand-700 border-brand-300 font-bold'
                    : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-white hover:border-brand-200'"
                  :aria-pressed="hasSymptom(sym)"
                  @click="toggleSymptom(sym)"
                >
                  {{ hasSymptom(sym) ? '✓' : '+' }} {{ sym }}
                </button>
              </div>
            </div>

            <textarea
              v-model="description"
              rows="3"
              class="w-full p-3.5 bg-ink-50/80 border border-ink-200 rounded-2xl text-xs sm:text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:bg-white transition-all leading-relaxed"
              :placeholder="isFixedPrice
                ? 'Ghi chú thêm cho thợ (ví dụ: Vị trí đặt thiết bị, lưu ý lúc tới nhà, tầng lầu...)'
                : 'Mô tả hiện tượng hư hỏng (ví dụ: Máy lạnh chảy nước ở dàn lạnh trong nhà, quạt kêu to rè rè và không mát...)'"
              @input="userModifiedDescription = true"
            ></textarea>
          </div>

          <!-- 6. Urgency Level Selector -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
                <span>{{ isAiFlow ? 3 : 5 }}. Mức độ khẩn cấp</span>
              </label>
              <span class="text-[11px] text-ink-500">Chọn mức độ mong muốn thợ có mặt</span>
            </div>

            <div
              class="p-4 rounded-2xl border transition-all duration-350 ease-out space-y-4 shadow-2xs"
              :style="{
                borderColor: `${urgencyColor}40`,
                backgroundColor: `${urgencyColor}0a`
              }"
              data-testid="urgency-slider"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div
                    class="w-9 h-9 rounded-xl flex items-center justify-center bg-white border shadow-xs shrink-0 transition-all duration-350 ease-out"
                    :style="{
                      color: urgencyColor,
                      borderColor: `${urgencyColor}30`,
                      boxShadow: `0 2px 8px ${urgencyColor}20`
                    }"
                  >
                    <Transition name="urgency-icon" mode="out-in">
                      <component :is="currentUrgency.icon" :key="currentUrgency.key" :size="18" />
                    </Transition>
                  </div>
                  <div class="min-w-0 overflow-hidden">
                    <Transition name="urgency-text" mode="out-in">
                      <div :key="currentUrgency.key">
                        <div class="text-xs sm:text-[13px] font-bold text-ink-900 truncate">
                          {{ currentUrgency.label }}
                        </div>
                        <div class="text-[11px] text-ink-500 truncate">
                          Thợ có mặt {{ currentUrgency.hint.toLowerCase() }}
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <Transition name="urgency-badge" mode="out-in">
                  <span
                    :key="currentUrgency.key"
                    class="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white transition-all duration-350 shadow-2xs shrink-0"
                    :style="{
                      backgroundColor: urgencyColor,
                      boxShadow: `0 2px 6px ${urgencyColor}40`
                    }"
                  >
                    {{ currentUrgency.badge }}
                  </span>
                </Transition>
              </div>

              <!-- Smooth Custom Track with Realtime Dragging & Spring Snap -->
              <div
                ref="urgencyTrackRef"
                class="relative py-3 flex items-center select-none group cursor-pointer touch-none"
                data-testid="urgency-slider-track"
                @pointerdown="onSliderTrackPointerDown"
                @pointermove="onSliderTrackPointerMove"
                @pointerup="onSliderTrackPointerUp"
                @pointercancel="onSliderTrackPointerUp"
              >
                <!-- Track Base -->
                <div class="w-full h-2 rounded-full bg-ink-200/80 overflow-hidden relative pointer-events-none">
                  <!-- Continuous Fill Bar -->
                  <div
                    class="h-full rounded-full"
                    :class="isDraggingSlider ? '' : 'transition-all duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]'"
                    :style="{
                      width: `${urgencyFillPercent}%`,
                      backgroundColor: urgencyColor
                    }"
                  ></div>
                </div>

                <!-- Step notch dots -->
                <div class="absolute inset-x-0 flex justify-between px-0.5 pointer-events-none">
                  <span
                    v-for="(lvl, i) in urgencyList"
                    :key="lvl.key"
                    class="w-2.5 h-2.5 rounded-full transition-all duration-300 ease-out"
                    :class="i <= activeUrgencyIndex ? 'bg-white shadow-2xs scale-100 ring-2 ring-white/60' : 'bg-ink-300/80 scale-90'"
                    :style="i <= activeUrgencyIndex ? { backgroundColor: '#ffffff' } : {}"
                  ></span>
                </div>

                <!-- Floating Thumb Knob follows cursor directly when dragging, springs on snap -->
                <div
                  class="urgency-thumb-knob absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-[3px] pointer-events-none flex items-center justify-center shadow-md"
                  :class="[
                    isDraggingSlider ? 'scale-110' : 'transition-all duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:scale-110 active:scale-95'
                  ]"
                  :style="{
                    left: `${urgencyFillPercent}%`,
                    borderColor: urgencyColor,
                    boxShadow: `0 3px 10px ${urgencyColor}4d`,
                  }"
                >
                  <div
                    class="w-1.5 h-1.5 rounded-full transition-colors duration-300"
                    :style="{ backgroundColor: urgencyColor }"
                  ></div>
                </div>

                <!-- Native Range Input (Accessible, Keyboard Focus, Testable) -->
                <input
                  id="urgency-range"
                  type="range"
                  min="0"
                  :max="urgencyList.length - 1"
                  step="0.001"
                  :value="sliderValue"
                  class="sr-only"
                  aria-label="Mức độ khẩn cấp"
                  :aria-valuetext="`${currentUrgency.label} – ${currentUrgency.hint}`"
                  @keydown="onSliderKeyDown"
                  @input="onSliderNativeInput"
                  @change="onSliderNativeChange"
                />
              </div>

              <!-- Step labels below with active state & subtle elevation -->
              <div class="grid grid-cols-4 gap-1 text-[11px] select-none -mt-1 pt-0.5">
                <button
                  v-for="(lvl, i) in urgencyList"
                  :key="lvl.key"
                  type="button"
                  class="py-1 px-1 rounded-lg text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center relative hover:bg-white/60"
                  :class="activeUrgencyIndex === i ? 'font-bold' : 'text-ink-500 hover:text-ink-800'"
                  :style="activeUrgencyIndex === i ? { color: urgencyColor } : {}"
                  @click="setUrgencyIndex(i)"
                >
                  <span class="block transition-transform duration-300 truncate w-full" :class="activeUrgencyIndex === i ? '-translate-y-0.5' : ''">
                    {{ lvl.label }}
                  </span>
                  <span
                    class="w-1.5 h-1.5 rounded-full mt-1 transition-all duration-300"
                    :style="{
                      backgroundColor: activeUrgencyIndex === i ? urgencyColor : 'transparent',
                      transform: activeUrgencyIndex === i ? 'scale(1)' : 'scale(0)'
                    }"
                  ></span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 1 Footer Action Bar -->
        <p
          v-if="isAiFlow && !description.trim()"
          class="text-xs text-warning-700 sm:text-right"
          data-testid="ai-needs-description"
        >
          {{ DESCRIBE_BEFORE_SEND }}
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="router.back()" class="w-full sm:w-auto">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>

          <div class="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
            <!-- Selected summary on desktop -->
            <div v-if="selectedService && !isAiFlow" class="text-right hidden sm:block">
              <div class="text-[11px] text-ink-500">Đã chọn: <span class="font-bold text-ink-800">{{ selectedService.name }}</span></div>
              <div v-if="isFixedPrice" class="text-xs font-bold text-brand-700 font-num">
                Tổng: <FhMoney :amount="totalFixedAmount" />
              </div>
              <div v-else class="text-[11px] font-semibold text-brand-600">Khảo sát & Báo giá tận nơi</div>
            </div>

            <FhButton
              variant="primary"
              size="lg"
              class="w-full sm:w-auto px-7 shadow-xs"
              :disabled="isAiFlow ? !description.trim() : !selectedServiceId"
              data-testid="step1-next"
              @click="isAiFlow ? startAiStep() : goToStep2()"
            >
              <template v-if="isAiFlow">Phân tích cùng AI <Sparkles :size="15" class="ml-1.5" /></template>
              <template v-else>Tiếp tục: Địa chỉ & Giờ <ArrowRight :size="15" class="ml-1.5" /></template>
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: Address & Schedule -->
    <div v-else-if="step === 2" key="step-2" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">
            Thông tin lịch hẹn & Địa chỉ
          </h2>
          <p class="text-xs text-ink-500 mt-1">
            Chọn địa chỉ nơi thợ sẽ tới sửa chữa và khung giờ thuận tiện nhất cho bạn.
          </p>
        </div>

        <div class="space-y-5 text-xs sm:text-sm">
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block font-bold text-ink-800 text-xs sm:text-sm">
                Địa chỉ sửa chữa <span class="text-danger-600 font-bold">*</span>
              </label>
              <span v-if="!catalogLoading && addresses.length > 0" class="text-[11px] text-ink-500 font-medium">
                {{ addresses.length }} địa chỉ đã lưu
              </span>
            </div>

            <div v-if="catalogLoading" class="space-y-2.5" aria-busy="true" aria-label="Đang tải địa chỉ">
              <FhSkeleton v-for="i in 2" :key="i" height="64px" rounded="lg" />
            </div>

            <!-- Custom Select Box for Addresses -->
            <div v-else-if="addresses.length > 0" class="space-y-2">
              <!-- Selected Address Display (Select Trigger) -->
              <div
                role="button"
                tabindex="0"
                class="p-4 rounded-2xl border bg-white transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 shadow-xs select-none"
                :class="isAddressDropdownOpen
                  ? 'border-brand-600 ring-2 ring-brand-500/20'
                  : 'border-ink-200 hover:border-brand-300 hover:bg-ink-50/40'"
                @click="toggleAddressDropdown"
                @keydown.enter.prevent="toggleAddressDropdown"
                @keydown.space.prevent="toggleAddressDropdown"
              >
                <div class="flex items-start gap-3 min-w-0 flex-1">
                  <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100 shadow-2xs">
                    <MapPin :size="18" />
                  </div>
                  <div class="space-y-0.5 min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-xs sm:text-sm text-ink-900">
                        {{ selectedAddress?.label || 'Địa chỉ tiếp nhận' }}
                      </span>
                      <span
                        v-if="selectedAddress?.isDefault"
                        class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200"
                      >
                        Mặc định
                      </span>
                    </div>
                    <div class="text-xs text-ink-700 font-medium truncate">
                      {{ selectedAddress?.line1 ? tidyAddressText(selectedAddress.line1) : 'Vui lòng chọn địa chỉ' }}
                    </div>
                    <div v-if="selectedAddress" class="text-[11px] text-ink-400 truncate">
                      {{ selectedAddress.district }}, {{ selectedAddress.province }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0 pl-2">
                  <span class="text-xs font-semibold text-brand-600 hidden sm:inline">
                    {{ isAddressDropdownOpen ? 'Thu gọn' : 'Thay đổi' }}
                  </span>
                  <div
                    class="w-7 h-7 rounded-lg bg-ink-100/80 flex items-center justify-center text-ink-600 transition-transform duration-200"
                    :class="{ 'rotate-180 bg-brand-50 text-brand-600': isAddressDropdownOpen }"
                  >
                    <ChevronDown :size="15" />
                  </div>
                </div>
              </div>

              <!-- Dropdown Options Menu -->
              <Transition name="fade-slide">
                <div
                  v-if="isAddressDropdownOpen"
                  class="rounded-2xl border border-ink-200 bg-white p-2.5 shadow-md space-y-1.5"
                >
                  <div class="px-2 py-1 text-[11px] font-bold text-ink-400 uppercase tracking-wider">
                    Chọn địa chỉ trong sổ địa chỉ
                  </div>

                  <div class="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    <div
                      v-for="addr in addresses"
                      :key="addr.id"
                      role="option"
                      :aria-selected="selectedAddressId === addr.id"
                      class="p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all duration-150"
                      :class="selectedAddressId === addr.id
                        ? 'border-brand-600 bg-brand-50/70 ring-1 ring-brand-500/20'
                        : 'border-ink-100 bg-white hover:bg-ink-50 hover:border-ink-200'"
                      @click="selectAddress(addr.id)"
                    >
                      <div class="flex items-start gap-2.5 min-w-0 flex-1">
                        <!-- Custom Radio Dot -->
                        <div class="pt-0.5 shrink-0">
                          <div
                            class="w-4 h-4 rounded-full border flex items-center justify-center transition-colors"
                            :class="selectedAddressId === addr.id
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : 'border-ink-300 bg-white'"
                          >
                            <div v-if="selectedAddressId === addr.id" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                          </div>
                        </div>

                        <div class="space-y-0.5 min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="font-bold text-xs text-ink-900">
                              {{ addr.label || 'Địa chỉ' }}
                            </span>
                            <span
                              v-if="addr.isDefault"
                              class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-brand-50 text-brand-700"
                            >
                              Mặc định
                            </span>
                          </div>
                          <div class="text-xs text-ink-700 font-medium truncate">{{ tidyAddressText(addr.line1) }}</div>
                          <div class="text-[11px] text-ink-400 truncate">{{ addr.district }}, {{ addr.province }}</div>
                        </div>
                      </div>

                      <CheckCircle2 v-if="selectedAddressId === addr.id" :size="16" class="text-brand-600 shrink-0" />
                    </div>
                  </div>

                  <!-- Add new address action link -->
                  <div class="pt-1.5 border-t border-ink-100">
                    <router-link
                      to="/app/profile"
                      class="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-brand-600 hover:bg-brand-50 transition-colors"
                    >
                      <Plus :size="14" /> Thêm địa chỉ mới vào sổ địa chỉ
                    </router-link>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Empty address state -->
            <div
              v-else
              class="p-6 rounded-2xl border border-dashed border-ink-300 bg-ink-50/70 text-center space-y-3"
            >
              <div class="w-10 h-10 rounded-full bg-white text-ink-400 flex items-center justify-center mx-auto shadow-xs border border-ink-100">
                <MapPin :size="18" />
              </div>
              <div>
                <p class="text-xs sm:text-sm font-bold text-ink-800">Bạn chưa có địa chỉ nào được lưu</p>
                <p class="text-[11px] text-ink-500 mt-0.5">Vui lòng thêm địa chỉ nhà để thợ có thể tới sửa chữa.</p>
              </div>
              <router-link
                to="/app/profile"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors shadow-xs"
              >
                <Plus :size="14" /> Thêm địa chỉ mới
              </router-link>
            </div>
          </div>

          <div class="space-y-3 pt-4 border-t border-ink-100">
            <label class="block font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
              <CalendarIcon :size="15" class="text-brand-600" />
              <span>Thời gian thợ tới</span>
            </label>
            <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kiểu đặt lịch">
              <button
                type="button"
                class="rounded-xl border px-3 py-2.5 text-left text-xs"
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
                class="rounded-xl border px-3 py-2.5 text-left text-xs"
                :class="bookingMode === 'urgent' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500' : 'border-ink-200 bg-white'"
                role="radio"
                :aria-checked="bookingMode === 'urgent'"
                data-testid="mode-urgent"
                @click="bookingMode = 'urgent'"
              >
                <span class="block font-bold text-ink-900 flex items-center gap-1"><Clock :size="13" /> Tới ngay</span>
                <span class="block text-ink-500">Thợ gần bạn đang rảnh tới trong khoảng 2 giờ</span>
              </button>
            </div>
            <BookingSessionPicker v-if="bookingMode === 'scheduled'" v-model="selectedSession" :sessions="sessions" />
          </div>

          <div class="space-y-1.5 pt-4 border-t border-ink-100">
            <label for="customer-note" class="block font-bold text-ink-800 text-xs sm:text-sm">
              Ghi chú cho thợ <span class="font-normal text-ink-400">(không bắt buộc)</span>
            </label>
            <textarea
              id="customer-note"
              v-model="customerNote"
              rows="2"
              maxlength="1000"
              placeholder="Ví dụ: gọi trước khi tới, nhà trong hẻm, gửi xe ở đâu..."
              class="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              data-testid="customer-note"
            />
          </div>

        </div>

        <div class="flex items-center justify-between pt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = isAiFlow ? 3 : 1">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton variant="primary" size="md" data-testid="step2-next" @click="goToNextStepFrom2">
            Tiếp tục: Xác nhận đơn <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>

        </div>
      </div>
    </div>

    <!-- Step 3: conversation with the assistant before booking -->
    <div v-else-if="step === 3" key="step-3" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-5 sm:p-8 shadow-xs space-y-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">Trò chuyện với trợ lý AI</h2>
            <p class="text-sm text-ink-500 mt-1 text-pretty">
              Trợ lý có thể hỏi thêm để chẩn đoán sát hơn. Bạn trả lời, hỏi thêm, gửi thêm ảnh hoặc nhờ đổi dịch vụ ngay tại đây, xong rồi mới đặt thợ.
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-ink-600 hover:bg-ink-50 disabled:opacity-40"
            :disabled="aiConversation.isThinking.value || aiConversation.turnCount.value === 0"
            data-testid="ai-restart"
            @click="restartAiConversation"
          >
            <RotateCcw :size="15" />
            <span class="hidden sm:inline whitespace-nowrap">Hỏi lại từ đầu</span>
          </button>
        </div>

        <div class="h-[30rem] max-h-[65dvh] rounded-2xl border border-ink-200 overflow-hidden">
          <AiConversationThread :conversation="aiConversation" placeholder="Trả lời trợ lý hoặc hỏi thêm..." class="h-full">
            <template #pinned>
              <div
                v-if="aiSuggested && aiSuggestsOtherService && aiSuggestedServiceExists && selectedServiceId"
                class="flex flex-wrap items-center gap-3 px-3.5 py-2.5 bg-brand-50 border-t border-brand-100"
                data-testid="ai-suggested-service"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold text-brand-700">Trợ lý gợi ý dịch vụ</p>
                  <p class="text-sm font-semibold text-ink-900">{{ aiSuggested.nameVi }}</p>
                </div>
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 whitespace-nowrap"
                  data-testid="ai-use-suggested"
                  @click="useSuggestedService"
                >
                  Đổi sang dịch vụ này
                </button>
              </div>
              <div class="px-3.5 py-2.5 bg-ink-50 border-t border-ink-100 text-sm space-y-2" data-testid="ai-current-service">
                <div v-if="selectedService" class="flex items-center gap-2 min-w-0">
                  <span class="text-ink-500 whitespace-nowrap">Dịch vụ sẽ đặt:</span>
                  <span class="font-semibold text-ink-900 min-w-0 truncate">{{ selectedService.name }}</span>
                </div>
                <p v-else-if="aiConversation.turnCount.value > 0 && !aiConversation.isThinking.value" class="text-warning-800" data-testid="ai-pick-service-hint">Chọn dịch vụ ở ô bên dưới để đặt thợ.</p>
                <p v-else class="text-ink-500">Trợ lý sẽ chọn dịch vụ phù hợp sau khi chẩn đoán.</p>
                <label
                  v-if="aiConversation.turnCount.value > 0 && !aiConversation.isThinking.value"
                  class="flex items-center gap-2 text-ink-600"
                >
                  <span class="whitespace-nowrap">Đổi dịch vụ khác:</span>
                  <select
                    class="min-w-0 flex-1 h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm text-ink-900"
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

        <div class="flex items-center justify-between gap-3 pt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 1">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton variant="primary" size="md" :disabled="aiConversation.isThinking.value || !selectedServiceId" data-testid="ai-continue" @click="leaveAiStep">
            Đặt thợ ngay <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Step 4: Final Summary & Launch Matching -->
    <div v-else-if="step === 4" key="step-4" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">
            Xác nhận yêu cầu sửa chữa
          </h2>
          <p class="text-xs text-ink-500 mt-1">
            Kiểm tra lại thông tin trước khi kích hoạt hệ thống ghép thợ FixHome.
          </p>
        </div>

        <p
          v-if="aiSessionId"
          data-testid="ai-summary-note"
          class="p-3.5 rounded-2xl bg-warning-50 border border-warning-200 text-sm text-warning-900 text-pretty"
        >
          Kỹ thuật viên nhận việc sẽ thấy tóm tắt phần bạn trao đổi với trợ lý AI, nên bạn không cần kể lại từ đầu.
        </p>

        <div class="space-y-4 text-xs sm:text-sm">
          <div class="p-5 rounded-2xl bg-ink-50 border border-ink-200 space-y-3 divide-y divide-ink-200/60">
            <div class="flex items-center justify-between pb-2">
              <span class="text-ink-500">Dịch vụ yêu cầu:</span>
              <span class="font-bold text-ink-900">{{ services.find((s) => s.id === selectedServiceId)?.name }}</span>
            </div>

            <!-- Fixed Price Breakdown -->
            <template v-if="isFixedPrice">
              <div class="flex items-center justify-between py-2">
                <span class="text-ink-500">Đơn giá niêm yết:</span>
                <span class="font-semibold text-ink-800 font-num">
                  <FhMoney :amount="selectedService?.fixedPrice || selectedService?.basePrice || 0" /> / {{ selectedService?.unit || 'thiết bị' }}
                </span>
              </div>
              <div class="flex items-center justify-between py-2">
                <span class="text-ink-500">Số lượng:</span>
                <span class="font-bold text-ink-900 font-num">{{ quantity }} {{ selectedService?.unit || 'thiết bị' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 bg-brand-50/70 -mx-5 px-5 py-3 border-y border-brand-200">
                <span class="font-bold text-brand-950">Tổng thanh toán niêm yết:</span>
                <span class="font-bold text-brand-700 text-base font-num">
                  <FhMoney :amount="totalFixedAmount" />
                </span>
              </div>
            </template>

            <div class="flex items-center justify-between py-2">
              <span class="text-ink-500">Địa chỉ thực hiện:</span>
              <span class="font-semibold text-ink-900 text-right max-w-xs">
                {{ tidyAddressText(addresses.find((a) => a.id === selectedAddressId)?.line1) }}
              </span>
            </div>
            <div class="flex items-center justify-between py-2">
              <span class="text-ink-500">Thời gian hẹn:</span>
              <span class="font-bold text-ink-900 text-right">{{ formattedScheduleDisplay }}</span>
            </div>

            <div class="flex items-center justify-between pt-2">
              <span class="text-ink-500">Mức độ khẩn cấp:</span>
              <span class="font-bold" :style="{ color: urgencyColor }">{{ currentUrgency.label }} · {{ currentUrgency.hint }}</span>
            </div>
          </div>

          <!-- Trust guarantee -->
          <div
            v-if="isFixedPrice"
            class="p-4 rounded-2xl bg-success-50 border border-success-200 text-success-900 flex items-start gap-3"
          >
            <CheckCircle2 :size="18" class="text-success-600 shrink-0 mt-0.5" />
            <p class="text-xs leading-relaxed">
              <strong>Giá niêm yết trọn gói:</strong> Kỹ thuật viên sẽ có mặt theo đúng giờ hẹn và hoàn thành dịch vụ theo mức giá cố định niêm yết. Quý khách chỉ thanh toán đúng số tiền trên sau khi kỹ thuật viên hoàn thành, không phát sinh chi phí khảo sát.
            </p>
          </div>
          <div
            v-else
            class="p-4 rounded-2xl bg-brand-50 border border-brand-200 text-brand-900 flex items-start gap-3"
          >
            <ShieldCheck :size="18" class="text-brand-600 shrink-0 mt-0.5" />
            <p class="text-xs leading-relaxed">
              <strong>Cam kết giá minh bạch:</strong> Thợ FixHome sẽ liên hệ và có mặt tận nơi để khảo sát. Thợ chỉ bắt đầu sửa chữa khi bạn đã đồng ý với báo giá chi tiết.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between pt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 2">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>

          <FhButton
            variant="primary"
            size="lg"
            :loading="loading"
            @click="createAndFindTech"
          >
            Tìm kỹ thuật viên ngay <Wrench :size="16" class="ml-1.5" />
          </FhButton>
        </div>
      </div>
    </div>
  </Transition>
</div>
</template>

<style scoped>
.wizard-step-enter-active,
.wizard-step-leave-active {
  transition: all 0.22s cubic-bezier(0.25, 1, 0.5, 1);
}
.wizard-step-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.wizard-step-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Urgency slider transitions & animations */
.urgency-icon-enter-active,
.urgency-icon-leave-active {
  transition: all 0.22s cubic-bezier(0.25, 1, 0.5, 1);
}
.urgency-icon-enter-from {
  opacity: 0;
  transform: scale(0.6) rotate(-20deg);
}
.urgency-icon-leave-to {
  opacity: 0;
  transform: scale(0.6) rotate(20deg);
}

.urgency-text-enter-active,
.urgency-text-leave-active {
  transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.urgency-text-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.urgency-text-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.urgency-badge-enter-active,
.urgency-badge-leave-active {
  transition: all 0.22s cubic-bezier(0.25, 1, 0.5, 1);
}
.urgency-badge-enter-from {
  opacity: 0;
  transform: scale(0.8);
}
.urgency-badge-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.urgency-thumb-knob {
  will-change: left, transform;
}
</style>
