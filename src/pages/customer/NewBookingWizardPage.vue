<script setup lang="ts">
// src/pages/customer/NewBookingWizardPage.vue
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Wrench,
  MapPin,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Camera,
  Bot,
  ShieldCheck,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
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
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhDatePicker,
  FhTimeScrollPicker,
} from '../../components';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { bookingsApi } from '../../api/bookings.api';
import { aiApi, type AiReply } from '../../api/ai.api';
import { mediaApi, ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../../api/media.api';
import { bookingSchedule } from '../../utils/booking-schedule';


const route = useRoute();
const router = useRouter();

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

interface BookingPhotoDraft {
  localId: number;
  previewUrl: string;
  uploadId: string | null;
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
const today = new Date();
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const preferredDate = ref(todayIso);
const preferredTime = ref('EARLIEST');

const formattedScheduleDisplay = computed(() => {
  let dateText = preferredDate.value;
  if (preferredDate.value === 'TODAY' || preferredDate.value === todayIso) {
    dateText = 'Hôm nay';
  } else if (preferredDate.value === 'TOMORROW') {
    dateText = 'Ngày mai';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(preferredDate.value)) {
    const [y, m, d] = preferredDate.value.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    dateText = `${dayNames[dt.getDay()]}, ${pad(d)}/${pad(m)}/${y}`;
  }

  let timeText = preferredTime.value;
  if (preferredTime.value === 'EARLIEST') {
    timeText = 'Sớm nhất (Thợ có mặt ngay)';
  } else if (preferredTime.value === 'MORNING') {
    timeText = 'Buổi sáng (08:00 – 12:00)';
  } else if (preferredTime.value === 'AFTERNOON') {
    timeText = 'Buổi chiều (13:30 – 17:30)';
  } else if (preferredTime.value === 'EVENING') {
    timeText = 'Buổi tối (18:00 – 20:30)';
  } else if (/^\d{1,2}:\d{2}$/.test(preferredTime.value)) {
    const [h, min] = preferredTime.value.split(':').map(Number);
    const endH = h + 2 < 10 ? `0${h + 2}` : `${h + 2}`;
    timeText = `${preferredTime.value} (${preferredTime.value} – ${endH}:${pad(min)})`;
  }

  return `${dateText} • ${timeText}`;
});

// What the assistant actually said. The shape is the AI Service's own, passed
// through by our backend: this page used to read possibleIssues,
// possibleCauses and suggestedPriceMin, none of which the service has ever
// returned, so every call landed in the catch below and showed a diagnosis
// written into this file.
const aiResult = ref<AiReply | null>(null);

/** Null when there is no price, and "từ X" when the ceiling is unknown. */
const aiPriceLabel = computed(() => {
  const price = aiResult.value?.priceEstimate;
  if (!price) return null;
  const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
  if (price.max && price.max > price.min) return `${money(price.min)} – ${money(price.max)}`;
  return `Từ ${money(price.min)}`;
});

/** Safety steps outrank everything else, so they are rendered on their own. */
const aiUrgentActions = computed(() =>
  aiResult.value?.urgency === 'HIGH' ? aiResult.value.suggestedActionsVi ?? [] : [],
);
const aiOrdinaryActions = computed(() =>
  aiResult.value?.urgency === 'HIGH' ? [] : aiResult.value?.suggestedActionsVi ?? [],
);


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

function addSymptom(symptom: string) {
  if (!description.value.trim() || description.value.startsWith('Yêu cầu dịch vụ niêm yết:') || description.value.startsWith('Yêu cầu dịch vụ:')) {
    description.value = symptom;
    userModifiedDescription.value = true;
  } else if (!description.value.includes(symptom)) {
    description.value = `${description.value.trim()}, ${symptom.toLowerCase()}`;
    userModifiedDescription.value = true;
  }
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

onMounted(async () => {
  try {
    const [cats, addrs] = await Promise.all([
      catalogApi.getCategories(true),
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
        if (matchedSvc.pricingMode?.toLowerCase() === 'fixed_price' || (matchedSvc.fixedPrice != null && matchedSvc.fixedPrice > 0)) {
          description.value = `Yêu cầu dịch vụ niêm yết: ${matchedSvc.name}`;
        }
      } else if (services.value.length > 0) {
        selectedServiceId.value = services.value[0].id;
        const first = services.value[0];
        if (first.pricingMode?.toLowerCase() === 'fixed_price' || (first.fixedPrice != null && first.fixedPrice > 0)) {
          description.value = `Yêu cầu dịch vụ niêm yết: ${first.name}`;
        }
      }
    }
    addresses.value = addrs;
    const defAddr = addrs.find((a) => a.isDefault);
    if (defAddr) selectedAddressId.value = defAddr.id;
    else if (addrs.length > 0) selectedAddressId.value = addrs[0].id;

  } catch {
    window.alert('Không thể tải dịch vụ hoặc địa chỉ. Vui lòng tải lại trang.');
  }
});

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
    window.alert('Tối đa 5 ảnh thiết bị.');
    return;
  }
  photoInput.value?.click();
};

const handlePhotoFiles = async (files: File[]) => {
  if (files.length === 0 || uploadingPhoto.value || isPhotoFlowDisposed.value) return;

  const remaining = 5 - uploadedPhotos.value.length;
  if (remaining <= 0) {
    window.alert('Tối đa 5 ảnh thiết bị.');
    return;
  }
  if (files.length > remaining) window.alert('Tối đa 5 ảnh thiết bị.');
  const toUpload = files.slice(0, remaining);

  uploadingPhoto.value = true;
  try {
    for (const file of toUpload) {
      if (isPhotoFlowDisposed.value) return;
      if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type)) {
        window.alert(`Ảnh "${file.name}" không đúng định dạng (chỉ nhận JPG, PNG, WebP).`);
        continue;
      }
      if (file.size > MAX_MEDIA_SIZE_BYTES) {
        window.alert(`Ảnh "${file.name}" vượt quá 10 MB.`);
        continue;
      }
      const photo: BookingPhotoDraft = {
        localId: nextPhotoLocalId++,
        previewUrl: createPhotoPreviewUrl(file),
        uploadId: null,
      };
      uploadedPhotos.value.push(photo);
      try {
        const uploaded = await mediaApi.uploadBookingPhoto(file);
        if (isPhotoFlowDisposed.value) continue;
        const currentPhoto = uploadedPhotos.value.find((item) => item.localId === photo.localId);
        if (currentPhoto) currentPhoto.uploadId = uploaded.uploadId;
      } catch (err) {
        console.error(`[NewBookingWizardPage] Upload booking photo failed for "${file.name}":`, err);
        const photoStillSelected = removePhotoByLocalId(photo.localId);
        if (!isPhotoFlowDisposed.value && photoStillSelected) {
          window.alert(`Không thể tải ảnh "${file.name}" lên. Vui lòng thử lại.`);
        }
      }
    }
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
    window.alert('Vui lòng chọn một dịch vụ cụ thể.');
    return;
  }
  if (!description.value.trim()) {
    if (isFixedPrice.value && selectedService.value) {
      description.value = `Yêu cầu dịch vụ niêm yết: ${selectedService.value.name} (${quantity.value} ${selectedService.value.unit || 'thiết bị'})`;
    } else {
      window.alert('Vui lòng mô tả sơ bộ tình trạng lỗi của thiết bị.');
      return;
    }
  }
  step.value = 2;
};

const goToNextStepFrom2 = async () => {
  if (!selectedAddressId.value && addresses.value.length > 0) {
    window.alert('Vui lòng chọn địa chỉ sửa chữa.');
    return;
  }
  try {
    const schedule = bookingSchedule(preferredDate.value, preferredTime.value);
    if (preferredTime.value !== 'EARLIEST') {
      const startMs = new Date(schedule.preferredStartAt).getTime();
      if (startMs <= Date.now()) {
        window.alert('Khung giờ bạn chọn đã qua. Vui lòng chọn giờ sau thời điểm hiện tại hoặc chọn ngày khác.');
        return;
      }
    }
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Khung giờ hoặc ngày hẹn không hợp lệ.');
    return;
  }

  // Dịch vụ phổ biến có giá niêm yết: Bỏ qua AI chẩn đoán, đi thẳng tới Bước Xác nhận đơn
  if (isFixedPrice.value) {
    step.value = 4;
    return;
  }

  step.value = 3;


  loading.value = true;
  try {
    // aiApi never rejects: it answers that the assistant is unavailable, which
    // the template shows as such. The old fallback here invented a fault and a
    // price range and presented them as the AI's own - and since it ran on
    // every failure, and every call was failing, that invention was all anyone
    // ever saw. AI failure must not block a booking, and saying so plainly
    // honours that without making anything up.
    aiResult.value = await aiApi.analyze({ description: description.value });
  } finally {
    loading.value = false;
  }
};

const createAndFindTech = async () => {
  if (uploadingPhoto.value) {
    window.alert('Vui lòng chờ ảnh tải lên hoàn tất trước khi đặt lịch.');
    return;
  }
  const photoUploadIds = uploadedPhotos.value.flatMap((photo) => photo.uploadId ? [photo.uploadId] : []);
  if (photoUploadIds.length !== uploadedPhotos.value.length) {
    window.alert('Không thể xác nhận ảnh. Vui lòng chọn lại ảnh trước khi đặt lịch.');
    return;
  }

  // Pre-validate schedule before API call to prevent 422 if time expired while on confirmation screen
  let schedule;
  try {
    schedule = bookingSchedule(preferredDate.value, preferredTime.value);
    if (new Date(schedule.preferredStartAt).getTime() <= Date.now()) {
      window.alert('Khung giờ hẹn đã trôi qua trong lúc bạn xem lại thông tin. Vui lòng chọn lại thời gian hẹn.');
      step.value = 2;
      return;
    }
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Khung giờ hoặc ngày hẹn không hợp lệ. Vui lòng chọn lại.');
    step.value = 2;
    return;
  }

  loading.value = true;
  try {
    if (!selectedAddressId.value) throw new Error('Vui lòng thêm địa chỉ trước khi đặt lịch.');
    const booking = await bookingsApi.createBooking({
      serviceId: selectedServiceId.value,
      addressId: selectedAddressId.value,
      description: description.value,
      ...schedule,
      quantity: isFixedPrice.value ? quantity.value : 1,
      urgency: urgency.value,
      photoUploadIds,
    });
    router.push(`/app/bookings/${booking.id}/candidates`);
  } catch (error: unknown) {
    console.error('[NewBookingWizardPage] createBooking failed:', error);
    const errObj = error as { response?: { data?: { error?: { message?: string }; message?: string } } } | undefined;
    const backendMessage =
      errObj?.response?.data?.error?.message ||
      errObj?.response?.data?.message;

    let friendlyMessage = 'Không thể tạo yêu cầu đặt thợ. Vui lòng thử lại.';
    if (backendMessage) {
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
      } else {
        friendlyMessage = backendMessage;
      }
    } else if (error instanceof Error && !error.message.includes('status code')) {
      friendlyMessage = error.message;
    }
    window.alert(friendlyMessage);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6 pb-12">
    <!-- Stepper Navigation Header (Style Mobile & Web) -->
    <div class="bg-white rounded-2xl border border-ink-200/90 p-4 shadow-xs">
      <div class="flex items-center justify-between text-xs font-semibold overflow-x-auto no-scrollbar gap-2">
        <div class="flex items-center gap-2 shrink-0" :class="step >= 1 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-num font-bold" :class="step >= 1 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">1</span>
          <span>{{ isFixedPrice ? 'Dịch vụ & Số lượng' : 'Dịch vụ & Lỗi' }}</span>
        </div>
        <div class="w-6 sm:w-10 h-0.5 shrink-0 transition-colors" :class="step >= 2 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-2 shrink-0" :class="step >= 2 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-num font-bold" :class="step >= 2 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">2</span>
          <span>Địa chỉ & Giờ</span>
        </div>
        <template v-if="!isFixedPrice">
          <div class="w-6 sm:w-10 h-0.5 shrink-0 transition-colors" :class="step >= 3 ? 'bg-brand-600' : 'bg-ink-200'"></div>
          <div class="flex items-center gap-2 shrink-0" :class="step >= 3 ? 'text-brand-600 font-bold' : 'text-ink-400'">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-num font-bold" :class="step >= 3 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">3</span>
            <span>AI Soi lỗi</span>
          </div>
        </template>
        <div class="w-6 sm:w-10 h-0.5 shrink-0 transition-colors" :class="step >= 4 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-2 shrink-0" :class="step >= 4 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-num font-bold" :class="step >= 4 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">{{ isFixedPrice ? '3' : '4' }}</span>
          <span>Xác nhận</span>
        </div>
      </div>
    </div>


    <!-- Step 1: Service & Issue Description -->
    <div v-if="step === 1" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-7">
        <!-- Title & Subtitle + Trust banner -->
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
              Nhà mình đang gặp vấn đề gì?
            </h2>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
              <ShieldCheck :size="14" class="text-brand-600" />
              <span>Thợ tay nghề chuẩn • Báo giá minh bạch</span>
            </span>
          </div>
          <p class="text-xs sm:text-sm text-ink-500 leading-relaxed">
            Chọn nhóm thiết bị, dịch vụ cần xử lý và mô tả tình trạng để FixHome điều phối đúng kỹ thuật viên chuyên trách mang đủ trang thiết bị.
          </p>
        </div>

        <div class="space-y-7 text-xs sm:text-sm">
          <!-- 1. Categories Pills with Icons & Count -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="font-bold text-ink-900 text-xs sm:text-sm flex items-center gap-1.5">
                <span>1. Chọn nhóm thiết bị / dịch vụ</span>
                <span class="text-danger-600 font-bold">*</span>
              </label>
              <span class="text-[11px] text-ink-500">{{ categories.length }} nhóm khả dụng</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full"
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
                    class="text-[10px] mt-0.5 line-clamp-1"
                    :class="selectedCategoryId === cat.id ? 'text-blue-100' : 'text-ink-500'"
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
                  class="px-2.5 py-1 rounded-lg font-semibold transition-all"
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
                  <span>⚡ Giá niêm yết</span>
                  <span class="text-[10px] opacity-80">({{ fixedServicesCount }})</span>
                </button>
                <button
                  v-if="inspectionServicesCount > 0"
                  type="button"
                  class="px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1"
                  :class="serviceFilter === 'INSPECTION' ? 'bg-white text-ink-900 shadow-xs font-bold' : 'text-ink-600 hover:text-ink-900'"
                  @click="serviceFilter = 'INSPECTION'"
                >
                  <span>🔍 Khảo sát</span>
                  <span class="text-[10px] opacity-80">({{ inspectionServicesCount }})</span>
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
            <div v-if="filteredServices.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
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
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      ⚡ Giá niêm yết
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-700 border border-ink-200"
                    >
                      🔍 Khảo sát tận nơi
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
            class="p-5 rounded-2xl bg-gradient-to-br from-brand-50/80 to-blue-50/40 border border-brand-200 space-y-4"
          >
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white">
                    Gói trọn gói chuẩn
                  </span>
                  <span class="font-extrabold text-xs sm:text-sm text-brand-950">
                    {{ selectedService?.name }}
                  </span>
                </div>
                <p class="text-[11px] text-brand-800">
                  Đã bao gồm toàn bộ tiền công kỹ thuật viên chuẩn quy trình FixHome.
                </p>
              </div>

              <div class="text-right">
                <div class="text-[11px] text-ink-500">Đơn giá niêm yết</div>
                <div class="text-sm sm:text-base font-extrabold text-brand-700 font-num">
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
                  <span class="w-10 text-center font-extrabold font-num text-sm text-ink-900">{{ quantity }}</span>
                  <button
                    type="button"
                    class="w-8 h-8 rounded-lg font-bold flex items-center justify-center transition-all hover:bg-ink-100 active:scale-95 text-ink-800"
                    @click="updateQuantity(1)"
                  >
                    <Plus :size="14" />
                  </button>
                </div>

                <div class="text-right pl-2">
                  <div class="text-[10px] text-ink-500 font-medium">Tổng tiền trọn gói:</div>
                  <div class="font-extrabold text-base text-brand-700 font-num">
                    <FhMoney :amount="totalFixedAmount" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Transparency Reassurance -->
            <div class="pt-2 border-t border-brand-200/60 flex items-center gap-2 text-[11px] text-brand-900 font-medium">
              <CheckCircle2 :size="15" class="text-emerald-600 shrink-0" />
              <span>Chỉ thanh toán khi kỹ thuật viên hoàn thành và bạn nghiệm thu hài lòng. Không phát sinh phụ phí ẩn.</span>
            </div>
          </div>

          <!-- 4. Photo Upload Area (Drag & Drop + Dotted Box) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
                <Camera :size="15" class="text-brand-600" />
                <span>3. Ảnh hiện trạng thiết bị (khuyên dùng)</span>
              </label>
              <span class="text-[11px] text-ink-500 font-medium">
                {{ uploadedPhotos.length }}/5 ảnh
              </span>
            </div>

            <input
              ref="photoInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
                <span>4. Mô tả chi tiết yêu cầu</span>
                <span v-if="!isFixedPrice" class="text-danger-600 font-bold">*</span>
              </label>
              <span v-if="isFixedPrice" class="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                ⚡ Giá niêm yết (Không bắt buộc mô tả lỗi)
              </span>
              <span v-else class="text-[11px] text-ink-500">
                Mô tả chi tiết để thợ chuẩn bị linh kiện sát nhất
              </span>
            </div>

            <!-- Quick symptom chips for faster input -->
            <div class="space-y-1.5">
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
                  :class="description.includes(sym)
                    ? 'bg-brand-50 text-brand-700 border-brand-300 font-bold'
                    : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-white hover:border-brand-200'"
                  @click="addSymptom(sym)"
                >
                  + {{ sym }}
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
                <span>5. Mức độ khẩn cấp</span>
              </label>
              <span class="text-[11px] text-ink-500">Chọn mức độ mong muốn thợ có mặt</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                v-for="lvl in urgencyList"
                :key="lvl.key"
                type="button"
                class="p-3.5 rounded-2xl border text-left transition-all active:scale-95 flex flex-col justify-between gap-2"
                :class="urgency === lvl.key
                  ? 'border-brand-600 bg-brand-50/80 text-brand-900 ring-2 ring-brand-500 font-bold shadow-xs'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                @click="urgency = (lvl.key as any)"
              >
                <div class="flex items-center justify-between w-full">
                  <component
                    :is="lvl.icon"
                    :size="16"
                    :class="urgency === lvl.key ? 'text-brand-600' : 'text-ink-400'"
                  />
                  <span
                    class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    :class="urgency === lvl.key ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'"
                  >
                    {{ lvl.badge }}
                  </span>
                </div>
                <div>
                  <div class="text-xs sm:text-[13px] font-bold">{{ lvl.label }}</div>
                  <div class="text-[10px] text-ink-500 mt-0.5 font-normal">{{ lvl.hint }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Step 1 Footer Action Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="router.back()" class="w-full sm:w-auto">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>

          <div class="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
            <!-- Selected summary on desktop -->
            <div v-if="selectedService" class="text-right hidden sm:block">
              <div class="text-[11px] text-ink-500">Đã chọn: <span class="font-bold text-ink-800">{{ selectedService.name }}</span></div>
              <div v-if="isFixedPrice" class="text-xs font-extrabold text-brand-700 font-num">
                Tổng: <FhMoney :amount="totalFixedAmount" />
              </div>
              <div v-else class="text-[11px] font-semibold text-brand-600">Khảo sát & Báo giá tận nơi</div>
            </div>

            <FhButton
              variant="primary"
              size="lg"
              class="w-full sm:w-auto px-7 shadow-xs"
              :disabled="!selectedServiceId"
              @click="goToStep2"
            >
              Tiếp tục: Địa chỉ & Giờ <ArrowRight :size="15" class="ml-1.5" />
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: Address & Schedule -->
    <div v-if="step === 2" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
            Thông tin lịch hẹn & Địa chỉ
          </h2>
          <p class="text-xs text-ink-500 mt-1">
            Chọn địa chỉ nơi thợ sẽ tới sửa chữa và khung giờ thuận tiện nhất cho bạn.
          </p>
        </div>

        <div class="space-y-5 text-xs sm:text-sm">
          <div>
            <label class="block font-bold text-ink-800 mb-2">Địa chỉ sửa chữa</label>
            <div class="space-y-2.5">
              <div
                v-for="addr in addresses"
                :key="addr.id"
                class="p-4 rounded-2xl border cursor-pointer flex items-center justify-between transition-all"
                :class="selectedAddressId === addr.id ? 'border-brand-600 bg-brand-50/70 ring-2 ring-brand-500' : 'border-ink-200 bg-white hover:bg-ink-50'"
                @click="selectedAddressId = addr.id"
              >
                <div class="space-y-0.5">
                  <div class="font-bold text-xs text-ink-900 flex items-center gap-1.5">
                    <MapPin :size="15" class="text-brand-600" />
                    {{ addr.label || 'Địa chỉ' }}
                  </div>
                  <div class="text-xs text-ink-700 font-medium">{{ addr.line1 }}</div>
                  <div class="text-[11px] text-ink-400">{{ addr.district }}, {{ addr.province }}</div>
                </div>
                <CheckCircle2 v-if="selectedAddressId === addr.id" :size="20" class="text-brand-600 shrink-0" />
              </div>

              <router-link to="/app/profile" class="inline-flex items-center gap-1 text-xs text-brand-600 font-bold pt-1 hover:underline">
                <Plus :size="14" /> Thêm địa chỉ mới vào sổ địa chỉ
              </router-link>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-4 border-t border-ink-100">
            <div class="space-y-1.5">
              <label class="block font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
                <CalendarIcon :size="15" class="text-brand-600" />
                <span>Ngày hẹn dịch vụ</span>
              </label>
              <FhDatePicker v-model="preferredDate" />
            </div>

            <div class="space-y-1.5">
              <label class="block font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
                <Clock :size="15" class="text-brand-600" />
                <span>Khung giờ mong muốn</span>
              </label>
              <FhTimeScrollPicker
                v-model="preferredTime"
                :selected-date="preferredDate"
              />
            </div>
          </div>

        </div>

        <div class="flex items-center justify-between pt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 1">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton variant="primary" size="md" @click="goToNextStepFrom2">
            <template v-if="isFixedPrice">
              Tiếp tục: Xác nhận đơn <ArrowRight :size="15" class="ml-1.5" />
            </template>
            <template v-else>
              Phân tích sự cố cùng AI <Sparkles :size="15" class="ml-1.5" />
            </template>
          </FhButton>

        </div>
      </div>
    </div>

    <!-- Step 3: AI Diagnosis Result (Style Mobile) -->
    <div v-if="step === 3" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold mb-2">
            <Bot :size="14" />
            <span>AI Chẩn đoán FixHome</span>
          </div>
          <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
            Gợi ý phán đoán sự cố từ AI
          </h2>
          <p class="text-xs text-ink-500 mt-1">
            <!-- The number here used to be "50,000+ ca sửa chữa", which is not
                 a number anyone measured. The corpus is 166 documents, 3,319
                 passages and 134 fault codes, and saying so is both true and
                 more convincing than a round figure nobody can source. -->
            Đối chiếu triệu chứng với kho tri thức nghề của FixHome — 134 mã hư
            hỏng trên 22 thiết bị gia dụng.
          </p>
        </div>

        <div v-if="loading" class="text-center py-12 space-y-3">
          <Sparkles class="animate-spin text-purple-600 mx-auto" :size="36" />
          <p class="text-xs text-ink-600 font-bold">AI đang phân tích mô tả của bạn...</p>
        </div>

        <div v-else-if="aiResult" class="space-y-5 text-xs sm:text-sm">
          <!-- The assistant could not be reached. Said plainly, with nothing
               invented, and the booking carries on regardless. -->
          <div
            v-if="aiResult.status === 'unavailable'"
            class="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900"
          >
            <p class="font-bold text-xs mb-1">Trợ lý đang tạm thời không kết nối được</p>
            <p class="text-xs leading-relaxed">
              Anh/chị vẫn đặt thợ bình thường được. Thợ FixHome sẽ kiểm tra trực tiếp
              và báo giá trước khi sửa.
            </p>
          </div>

          <template v-else>
            <!-- Safety first, literally. A warning read after a list of faults
                 is a warning nobody acted on. -->
            <div
              v-if="aiUrgentActions.length"
              class="p-5 rounded-2xl bg-danger-50 border border-danger-200 space-y-2"
            >
              <div class="flex items-center gap-1.5 font-extrabold text-danger-700 text-xs">
                <AlertTriangle :size="15" /> Anh/chị làm ngay giúp em
              </div>
              <p
                v-for="(action, index) in aiUrgentActions"
                :key="index"
                class="text-xs text-danger-900 leading-relaxed"
              >
                {{ index + 1 }}. {{ action }}
              </p>
            </div>

            <div class="p-5 rounded-2xl bg-purple-50 border border-purple-200 space-y-3">
              <div class="flex items-center justify-between">
                <span class="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                  <Sparkles :size="15" class="text-purple-600" />
                  <template v-if="aiResult.device">{{ aiResult.device.nameVi }}</template>
                  <template v-else>Gợi ý sơ bộ</template>
                </span>
                <span
                  v-if="aiResult.confidence"
                  class="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-full border border-purple-200"
                >
                  Mức tin cậy {{ Math.round(aiResult.confidence * 100) }}%
                </span>
              </div>

              <p v-if="aiResult.messageVi" class="text-xs text-purple-950 leading-relaxed">
                {{ aiResult.messageVi }}
              </p>

              <div v-if="aiResult.suspectedFaults?.length">
                <div class="text-xs font-bold text-purple-950 mb-1.5">Có thể là:</div>
                <ul class="list-disc list-inside space-y-1 text-xs text-purple-900 font-medium">
                  <li v-for="fault in aiResult.suspectedFaults" :key="fault.faultCode">
                    {{ fault.nameVi }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                v-if="aiOrdinaryActions.length"
                class="p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-1.5"
              >
                <div class="font-bold text-ink-900 text-xs">Anh/chị có thể làm trước</div>
                <ul class="list-disc list-inside space-y-1 text-xs text-ink-600">
                  <li v-for="(action, index) in aiOrdinaryActions" :key="index">{{ action }}</li>
                </ul>
              </div>

              <div
                v-if="aiPriceLabel"
                class="p-4 rounded-2xl bg-brand-50 border border-brand-200 flex flex-col justify-between"
              >
                <div>
                  <div class="font-bold text-brand-900 text-xs mb-0.5">Chi phí tham khảo</div>
                  <div class="text-[11px] text-ink-500">
                    <template v-if="aiResult.priceEstimate?.requiresAssessment">
                      Thợ xem tận nơi rồi mới báo giá chính xác
                    </template>
                    <template v-else>Ước tính công thợ, chưa gồm linh kiện</template>
                  </div>
                </div>
                <div class="text-lg font-extrabold font-num text-brand-700 mt-2">
                  {{ aiPriceLabel }}
                </div>
              </div>
            </div>

            <div v-if="aiResult.clarification?.questionsVi?.length" class="p-4 rounded-2xl bg-ink-50 border border-ink-200">
              <div class="font-bold text-ink-900 text-xs mb-1.5">Trợ lý cần hỏi thêm</div>
              <p
                v-for="(question, index) in aiResult.clarification.questionsVi"
                :key="index"
                class="text-xs text-ink-600 leading-relaxed"
              >
                {{ question }}
              </p>
              <p class="text-[11px] text-ink-500 mt-2">
                Mở trợ lý ở góc màn hình để trả lời và nhận chẩn đoán sát hơn.
              </p>
            </div>

            <p
              v-if="aiResult.disclaimerVi"
              class="text-[11px] text-ink-500 italic bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-800"
            >
              {{ aiResult.disclaimerVi }}
            </p>
          </template>
        </div>

        <div class="flex items-center justify-between pt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 2">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton variant="primary" size="md" @click="step = 4">
            Xác nhận đặt đơn <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Step 4: Final Summary & Launch Matching -->
    <div v-if="step === 4" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
            Xác nhận yêu cầu sửa chữa
          </h2>
          <p class="text-xs text-ink-500 mt-1">
            Kiểm tra lại thông tin trước khi kích hoạt hệ thống ghép thợ FixHome.
          </p>
        </div>

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
                <span class="font-extrabold text-brand-700 text-base font-num">
                  <FhMoney :amount="totalFixedAmount" />
                </span>
              </div>
            </template>

            <div class="flex items-center justify-between py-2">
              <span class="text-ink-500">Địa chỉ thực hiện:</span>
              <span class="font-semibold text-ink-900 text-right max-w-xs">
                {{ addresses.find((a) => a.id === selectedAddressId)?.line1 }}
              </span>
            </div>
            <div class="flex items-center justify-between py-2">
              <span class="text-ink-500">Thời gian hẹn:</span>
              <span class="font-bold text-ink-900 text-right">{{ formattedScheduleDisplay }}</span>
            </div>

            <div class="flex items-center justify-between pt-2">
              <span class="text-ink-500">Mức độ khẩn cấp:</span>
              <span class="font-bold text-brand-700 uppercase">{{ urgency }}</span>
            </div>
          </div>

          <!-- Trust guarantee -->
          <div
            v-if="isFixedPrice"
            class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3"
          >
            <CheckCircle2 :size="18" class="text-emerald-600 shrink-0 mt-0.5" />
            <p class="text-xs leading-relaxed">
              <strong>Giá niêm yết trọn gói:</strong> Kỹ thuật viên sẽ có mặt theo đúng giờ hẹn và hoàn thành dịch vụ theo mức giá cố định niêm yết. Quý khách chỉ thanh toán đúng số tiền trên sau khi nghiệm thu hài lòng, không phát sinh chi phí khảo sát.
            </p>
          </div>
          <div
            v-else
            class="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-3"
          >
            <ShieldCheck :size="18" class="text-brand-600 shrink-0 mt-0.5" />
            <p class="text-xs leading-relaxed">
              <strong>Cam kết giá minh bạch:</strong> Thợ FixHome sẽ liên hệ và có mặt tận nơi để khảo sát. Thợ chỉ bắt đầu sửa chữa khi bạn đã đồng ý với báo giá chi tiết.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between pt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = isFixedPrice ? 2 : 3">
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
  </div>
</template>
