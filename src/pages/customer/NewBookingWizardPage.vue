<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Wrench,
  MapPin,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  Info,
  ShieldCheck,
  Camera,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhMoney,
} from '../../components';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { bookingsApi, type DiagnosisResult } from '../../api/bookings.api';
import { mediaApi } from '../../api/media.api';

const route = useRoute();
const router = useRouter();

// 5-step wizard per Section 20
const step = ref(1);
const loading = ref(false);
const error = ref('');

// Step 1: Service selection
const categories = ref<ServiceCategory[]>([]);
const selectedCategoryId = ref('');
const services = ref<ServiceItem[]>([]);
const selectedServiceId = ref('');
const quantity = ref(1);

// Step 2: Description, Urgency & Photos
const description = ref('');
const urgency = ref<'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY'>('NORMAL');
const mediaFiles = ref<Array<{ url: string; mimeType: string; sizeBytes: number; name: string }>>([]);
const uploadingPhotos = ref(false);
const photoUploadError = ref('');

// Step 3: AI Diagnosis
const aiResult = ref<DiagnosisResult | null>(null);
const loadingAi = ref(false);

// Step 4: Address & Schedule
const addresses = ref<UserAddress[]>([]);
const selectedAddressId = ref('');
const preferredDate = ref('');
const preferredEnd = ref('');

// Computed service details
const selectedService = computed(() => {
  for (const cat of categories.value) {
    const found = cat.services?.find((s) => s.id === selectedServiceId.value);
    if (found) return found;
  }
  return services.value.find((s) => s.id === selectedServiceId.value);
});

const isFixedPrice = computed(() => {
  const mode = selectedService.value?.pricingMode;
  return mode === 'FIXED_PRICE' || mode === 'fixed_price';
});

const selectedAddress = computed(() => {
  return addresses.value.find((a) => a.id === selectedAddressId.value);
});

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { message?: string } } }).response;
    if (res?.data?.message) return res.data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};

// Helper for default time slots within working hours (08:00 - 18:00)
const setTimeSlotShortcut = (type: 'TODAY_AFTERNOON' | 'TOMORROW_MORNING' | 'TOMORROW_AFTERNOON') => {
  const now = new Date();
  const formatLocalISO = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  if (type === 'TODAY_AFTERNOON') {
    const start = new Date(now);
    start.setHours(14, 0, 0, 0);
    const end = new Date(now);
    end.setHours(17, 0, 0, 0);
    if (now.getTime() > start.getTime()) {
      start.setTime(now.getTime() + 60 * 60 * 1000); // 1 hour from now
      end.setTime(start.getTime() + 3 * 60 * 60 * 1000);
    }
    preferredDate.value = formatLocalISO(start);
    preferredEnd.value = formatLocalISO(end);
  } else if (type === 'TOMORROW_MORNING') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow);
    start.setHours(8, 30, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(11, 30, 0, 0);
    preferredDate.value = formatLocalISO(start);
    preferredEnd.value = formatLocalISO(end);
  } else if (type === 'TOMORROW_AFTERNOON') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow);
    start.setHours(13, 30, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(16, 30, 0, 0);
    preferredDate.value = formatLocalISO(start);
    preferredEnd.value = formatLocalISO(end);
  }
};

onMounted(async () => {
  try {
    const [cats, addrs] = await Promise.all([
      catalogApi.getCategories(true),
      profileApi.getAddresses(),
    ]);
    categories.value = cats;
    addresses.value = addrs;

    const queryServiceId = route.query.serviceId as string;
    let serviceSelected = false;

    if (queryServiceId && cats.length > 0) {
      for (const cat of cats) {
        const found = cat.services?.find((s) => s.id === queryServiceId);
        if (found) {
          selectedCategoryId.value = cat.id;
          services.value = cat.services ?? [];
          selectedServiceId.value = found.id;
          serviceSelected = true;
          break;
        }
      }
    }

    if (!serviceSelected && cats.length > 0) {
      selectedCategoryId.value = cats[0].id;
      services.value = cats[0].services ?? [];
      if (services.value.length > 0) {
        selectedServiceId.value = services.value[0].id;
      }
    }

    if (route.query.rebookFrom) {
      const previous = await bookingsApi.getBooking(String(route.query.rebookFrom));
      const category = cats.find(cat => cat.services?.some(service => service.id === previous.serviceId));
      if (category) {
        selectedCategoryId.value = category.id;
        services.value = category.services ?? [];
        selectedServiceId.value = previous.serviceId;
        description.value = previous.description;
        quantity.value = previous.quantity ?? 1;
      }
    }

    const defAddr = addrs.find((a) => a.isDefault);
    if (defAddr) selectedAddressId.value = defAddr.id;
    else if (addrs.length > 0) selectedAddressId.value = addrs[0].id;

    // Set default tomorrow morning slot
    setTimeSlotShortcut('TOMORROW_MORNING');
  } catch {
    error.value = 'Không tải được dữ liệu danh mục hoặc danh bạ địa chỉ. Vui lòng thử lại.';
  }
});

const onCategorySelect = (catId: string) => {
  selectedCategoryId.value = catId;
  const cat = categories.value.find((c) => c.id === catId);
  services.value = cat?.services ?? [];
  if (services.value.length > 0) {
    selectedServiceId.value = services.value[0].id;
  } else {
    selectedServiceId.value = '';
  }
};

// Navigation Steps Validation
const goToStep2 = () => {
  if (!selectedServiceId.value) {
    window.alert('Vui lòng chọn một dịch vụ cụ thể.');
    return;
  }
  step.value = 2;
};

// Photo Upload Handler (1-5 photos, <= 10MB)
const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  photoUploadError.value = '';
  if (mediaFiles.value.length + files.length > 5) {
    photoUploadError.value = 'Bạn chỉ có thể tải lên tối đa 5 hình ảnh minh họa.';
    return;
  }

  uploadingPhotos.value = true;
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        photoUploadError.value = `Ảnh "${file.name}" vượt quá kích thước tối đa 10 MB.`;
        continue;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        photoUploadError.value = `Ảnh "${file.name}" không đúng định dạng JPEG, PNG hoặc WebP.`;
        continue;
      }

      const uploaded = await mediaApi.upload(file);
      mediaFiles.value.push({
        url: uploaded.url,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        name: file.name,
      });
    }
  } catch (err: unknown) {
    photoUploadError.value = getErrorMessage(err, 'Tải ảnh lên máy chủ không thành công. Vui lòng thử lại.');
  } finally {
    uploadingPhotos.value = false;
    target.value = '';
  }
};

const removePhoto = (index: number) => {
  mediaFiles.value.splice(index, 1);
};

// Trigger AI Diagnosis from Step 2
const triggerAiDiagnosis = async () => {
  if (!description.value.trim() || description.value.trim().length < 6) {
    window.alert('Vui lòng nhập mô tả sơ bộ tình trạng lỗi của thiết bị (tối thiểu 6 ký tự).');
    return;
  }

  step.value = 3;
  loadingAi.value = true;
  error.value = '';

  try {
    const res = await bookingsApi.diagnoseAI({
      description: description.value,
      serviceId: selectedServiceId.value,
      images: mediaFiles.value.map((m) => m.url),
      categoryHint: categories.value.find((c) => c.id === selectedCategoryId.value)?.name,
    });
    aiResult.value = res;
  } catch {
    aiResult.value = null;
    error.value = 'Hệ thống AI hiện chưa khả dụng. Bạn vẫn có thể tiếp tục hoàn tất đặt lịch sửa chữa bình thường.';
  } finally {
    loadingAi.value = false;
  }
};

const skipAiToStep4 = () => {
  if (!description.value.trim() || description.value.trim().length < 6) {
    window.alert('Vui lòng nhập mô tả tình trạng lỗi của thiết bị trước khi tiếp tục.');
    return;
  }
  step.value = 4;
};

// Step 3 Actions: Switch to suggested service
const adoptSuggestedService = () => {
  if (!aiResult.value?.suggestedServiceId) return;
  const targetId = aiResult.value.suggestedServiceId;
  for (const cat of categories.value) {
    const found = cat.services?.find((s) => s.id === targetId);
    if (found) {
      selectedCategoryId.value = cat.id;
      services.value = cat.services ?? [];
      selectedServiceId.value = found.id;
      break;
    }
  }
};

const goToStep5 = () => {
  if (!selectedAddressId.value) {
    window.alert('Vui lòng chọn địa chỉ sửa chữa.');
    return;
  }
  if (!preferredDate.value || !preferredEnd.value) {
    window.alert('Vui lòng chọn khung giờ hẹn sửa chữa.');
    return;
  }
  const start = new Date(preferredDate.value);
  const end = new Date(preferredEnd.value);
  if (start <= new Date() || end <= start) {
    window.alert('Khung giờ bắt đầu phải trong tương lai và kết thúc sau thời gian bắt đầu.');
    return;
  }
  step.value = 5;
};

// Step 5: Final Submission -> redirects to Candidate Shortlisting
const createAndFindTech = async () => {
  if (loading.value) return;
  const start = new Date(preferredDate.value);
  const end = new Date(preferredEnd.value);

  loading.value = true;
  error.value = '';
  try {
    const payload = {
      serviceId: selectedServiceId.value,
      addressId: selectedAddressId.value,
      description: description.value,
      preferredStartAt: start.toISOString(),
      preferredEndAt: end.toISOString(),
      quantity: isFixedPrice.value ? quantity.value : 1,
      urgency: urgency.value,
      mediaUrls: mediaFiles.value.map((m) => m.url),
      aiDiagnosisId: aiResult.value?.id,
    };
    const booking = await bookingsApi.createBooking(payload);
    router.push(`/app/bookings/${booking.id}/candidates`);
  } catch (err: unknown) {
    error.value = getErrorMessage(err, 'Không thể tạo yêu cầu đặt thợ. Vui lòng kiểm tra lại thông tin.');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6 pb-12">
    <!-- Top Alert Notification -->
    <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 p-3.5 text-xs sm:text-sm text-amber-900 flex items-start gap-2">
      <AlertTriangle :size="16" class="text-amber-600 shrink-0 mt-0.5" />
      <span>{{ error }}</span>
    </p>

    <!-- 5-Step Stepper Navigation Header per Section 20 -->
    <div class="bg-white rounded-[var(--radius-md)] border border-ink-200 p-4 shadow-[var(--shadow-e1)]">
      <div class="flex items-center justify-between text-xs font-semibold">
        <div class="flex items-center gap-1.5 sm:gap-2" :class="step >= 1 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 1 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'">1</span>
          <span class="hidden sm:inline">Dịch vụ</span>
        </div>
        <div class="w-6 sm:w-10 h-0.5" :class="step >= 2 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-1.5 sm:gap-2" :class="step >= 2 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 2 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'">2</span>
          <span class="hidden sm:inline">Mô tả & Ảnh</span>
        </div>
        <div class="w-6 sm:w-10 h-0.5" :class="step >= 3 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-1.5 sm:gap-2" :class="step >= 3 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 3 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'">3</span>
          <span class="hidden sm:inline">AI Chẩn đoán</span>
        </div>
        <div class="w-6 sm:w-10 h-0.5" :class="step >= 4 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-1.5 sm:gap-2" :class="step >= 4 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 4 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'">4</span>
          <span class="hidden sm:inline">Địa chỉ & Giờ</span>
        </div>
        <div class="w-6 sm:w-10 h-0.5" :class="step >= 5 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-1.5 sm:gap-2" :class="step >= 5 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 5 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'">5</span>
          <span class="hidden sm:inline">Xác nhận</span>
        </div>
      </div>
    </div>

    <!-- STEP 1: Chọn Service (Fixed Price vs Inspection Required) -->
    <div v-if="step === 1" class="space-y-6">
      <FhCard title="Bước 1: Chọn nhóm dịch vụ & gói sửa chữa">
        <div class="space-y-5 text-xs sm:text-sm">
          <!-- Categories Selection -->
          <div>
            <label class="block font-semibold text-ink-700 mb-2">Danh mục dịch vụ</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="px-3.5 py-2 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors"
                :class="selectedCategoryId === cat.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-ink-50 text-ink-700 border border-ink-200 hover:bg-ink-100'"
                @click="onCategorySelect(cat.id)"
              >
                {{ cat.name }}
              </button>
            </div>
          </div>

          <!-- Specific Service Dropdown -->
          <div>
            <label class="block font-semibold text-ink-700 mb-1.5">Dịch vụ chi tiết *</label>
            <select
              v-model="selectedServiceId"
              class="w-full h-11 px-3 bg-white border border-ink-200 rounded-[var(--radius-sm)] text-xs sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600"
            >
              <option v-for="svc in services" :key="svc.id" :value="svc.id">
                {{ svc.name }} (~{{ svc.estimatedMinutes }} phút)
              </option>
            </select>
          </div>

          <!-- FIXED_PRICE Mode Box per Section 6.1 -->
          <div v-if="isFixedPrice" class="p-4 rounded-[var(--radius-sm)] bg-emerald-50 border border-emerald-200 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-600 text-white">
                  Giá cố định
                </span>
                <span class="font-bold text-xs sm:text-sm text-emerald-950">
                  {{ selectedService?.name }}
                </span>
              </div>
              <div class="text-xs sm:text-sm font-bold text-emerald-700 font-num">
                <FhMoney :amount="selectedService?.fixedPrice ?? 0" /> / {{ selectedService?.unit || 'lần' }}
              </div>
            </div>

            <p v-if="selectedService?.scopeDescription" class="text-xs text-ink-600">
              <strong>Phạm vi trọn gói:</strong> {{ selectedService.scopeDescription }}
            </p>

            <div class="flex items-center justify-between pt-2.5 border-t border-emerald-200 text-xs">
              <label class="font-semibold text-ink-800">Số lượng ({{ selectedService?.unit || 'lần' }}):</label>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="w-8 h-8 rounded border border-ink-300 bg-white font-bold flex items-center justify-center hover:bg-ink-100 transition-colors"
                  @click="quantity = Math.max(1, quantity - 1)"
                >
                  -
                </button>
                <span class="font-bold font-num text-sm text-ink-900 min-w-4 text-center">{{ quantity }}</span>
                <button
                  type="button"
                  class="w-8 h-8 rounded border border-ink-300 bg-white font-bold flex items-center justify-center hover:bg-ink-100 transition-colors"
                  @click="quantity++"
                >
                  +
                </button>
                <div class="ml-3 font-bold text-emerald-800 font-num text-sm">
                  = <FhMoney :amount="(selectedService?.fixedPrice ?? 0) * quantity" />
                </div>
              </div>
            </div>
          </div>

          <!-- INSPECTION_REQUIRED Mode Box per Section 6.2 -->
          <div v-else class="p-4 rounded-[var(--radius-sm)] bg-sky-50 border border-sky-200 space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-sky-600 text-white">
                Cần khảo sát
              </span>
              <span class="font-bold text-xs sm:text-sm text-sky-950">
                Khảo sát & Báo giá tại nhà
              </span>
            </div>
            <p class="text-xs text-sky-900 leading-relaxed">
              Kỹ thuật viên cần kiểm tra thực tế trước khi đưa báo giá chính thức. Trí tuệ nhân tạo FixHome sẽ đưa ra khoảng giá dự trù tham khảo sau khi bạn tải ảnh và mô tả hư hỏng.
            </p>
          </div>
        </div>

        <div class="flex justify-end pt-5 mt-5 border-t border-ink-100">
          <FhButton variant="primary" size="md" @click="goToStep2">
            Tiếp tục <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>
        </div>
      </FhCard>
    </div>

    <!-- STEP 2: Mô tả + Upload 1-5 Ảnh per Section 7 & 20 -->
    <div v-if="step === 2" class="space-y-6">
      <FhCard title="Bước 2: Mô tả sự cố & Tải ảnh minh họa">
        <div class="space-y-5 text-xs sm:text-sm">
          <!-- Selected Service Indicator -->
          <div class="flex items-center gap-2 p-2.5 bg-ink-50 rounded border border-ink-200 text-xs">
            <Wrench :size="14" class="text-brand-600" />
            <span class="text-ink-600">Dịch vụ:</span>
            <span class="font-bold text-ink-900">{{ selectedService?.name }}</span>
            <span class="ml-auto text-[11px] px-2 py-0.5 rounded font-semibold" :class="isFixedPrice ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'">
              {{ isFixedPrice ? 'Giá cố định' : 'Cần khảo sát' }}
            </span>
          </div>

          <!-- Problem Description Textarea -->
          <div>
            <label class="block font-semibold text-ink-700 mb-1.5">Mô tả hiện tượng hư hỏng *</label>
            <textarea
              v-model="description"
              rows="4"
              class="w-full p-3.5 bg-white border border-ink-200 rounded-[var(--radius-sm)] text-xs sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600 leading-relaxed"
              placeholder="Ví dụ: Máy giặt rung lắc dữ dội khi vắt, phát ra tiếng kêu két két lớn và nước xả chậm..."
            ></textarea>
            <p class="text-[11px] text-ink-400 mt-1">Càng mô tả chi tiết, AI và kỹ thuật viên càng chẩn đoán chính xác nguyên nhân.</p>
          </div>

          <!-- Urgency Selector -->
          <div>
            <label class="block font-semibold text-ink-700 mb-2">Mức độ khẩn cấp</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                v-for="lvl in [
                  { key: 'LOW', label: 'Bình thường', hint: 'Trong 24-48h' },
                  { key: 'NORMAL', label: 'Tiêu chuẩn', hint: 'Trong ngày' },
                  { key: 'HIGH', label: 'Khẩn cấp', hint: 'Trong 1-2h' },
                  { key: 'EMERGENCY', label: 'Cực khẩn cấp', hint: 'Dưới 30 phút' },
                ]"
                :key="lvl.key"
                type="button"
                class="p-2.5 rounded-[var(--radius-sm)] border text-left transition-colors"
                :class="urgency === lvl.key ? 'border-brand-600 bg-brand-50/80 text-brand-900 ring-1 ring-brand-600' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                @click="urgency = (lvl.key as any)"
              >
                <div class="font-bold text-xs">{{ lvl.label }}</div>
                <div class="text-[10px] text-ink-400 mt-0.5">{{ lvl.hint }}</div>
              </button>
            </div>
          </div>

          <!-- Image Uploader Section (1-5 images) per Section 7 & 20 -->
          <div class="space-y-3 pt-2">
            <div class="flex items-center justify-between">
              <label class="font-semibold text-ink-700 flex items-center gap-1.5">
                <Camera :size="15" class="text-brand-600" /> Hình ảnh hiện trường (1 – 5 ảnh)
              </label>
              <span class="text-xs text-ink-500 font-num">{{ mediaFiles.length }} / 5 ảnh</span>
            </div>

            <!-- Upload drop area -->
            <label
              v-if="mediaFiles.length < 5"
              class="border-2 border-dashed border-ink-200 rounded-[var(--radius-md)] p-5 text-center cursor-pointer block hover:border-brand-500 hover:bg-brand-50/30 transition-colors"
            >
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                :disabled="uploadingPhotos"
                @change="handleFileUpload"
              />
              <div class="flex flex-col items-center justify-center gap-2">
                <div class="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                  <Upload :size="18" />
                </div>
                <div class="text-xs font-semibold text-ink-800">
                  <span v-if="uploadingPhotos" class="text-brand-600">Đang tải ảnh lên máy chủ...</span>
                  <span v-else>Nhấn để chọn ảnh từ máy hoặc kéo thả vào đây</span>
                </div>
                <p class="text-[11px] text-ink-400">Định dạng JPG, PNG, WebP (Tối đa 10 MB mỗi ảnh)</p>
              </div>
            </label>

            <!-- Upload Error Notification -->
            <p v-if="photoUploadError" class="text-xs text-rose-600 font-medium">
              {{ photoUploadError }}
            </p>

            <!-- Uploaded Photos Preview Grid -->
            <div v-if="mediaFiles.length > 0" class="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              <div
                v-for="(photo, idx) in mediaFiles"
                :key="photo.url"
                class="relative group rounded border border-ink-200 overflow-hidden bg-ink-50 aspect-square flex items-center justify-center"
              >
                <img :src="photo.url" :alt="photo.name" class="w-full h-full object-cover" />
                <button
                  type="button"
                  class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                  title="Xóa ảnh"
                  @click.stop="removePhoto(idx)"
                >
                  <X :size="13" />
                </button>
                <span class="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded font-num">
                  #{{ idx + 1 }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation Buttons for Step 2 -->
        <div class="flex items-center justify-between pt-5 mt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 1">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>

          <div class="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              class="text-xs font-semibold text-ink-500 hover:text-ink-800 underline px-2 py-1"
              @click="skipAiToStep4"
            >
              Bỏ qua AI & Đi tiếp
            </button>
            <FhButton variant="primary" size="md" :loading="loadingAi" @click="triggerAiDiagnosis">
              Phân tích bằng AI <Sparkles :size="15" class="ml-1.5" />
            </FhButton>
          </div>
        </div>
      </FhCard>
    </div>

    <!-- STEP 3: AI Diagnosis per Section 7 & 20 -->
    <div v-if="step === 3" class="space-y-6">
      <FhCard title="Bước 3: Kết quả phân tích & Chẩn đoán sơ bộ bằng AI">
        <!-- Loading spinner while AI analyzes -->
        <div v-if="loadingAi" class="text-center py-12 space-y-3">
          <Sparkles class="animate-spin text-brand-600 mx-auto" :size="36" />
          <div class="font-bold text-ink-900 text-sm">FixHome AI đang phân tích dữ liệu và hình ảnh...</div>
          <p class="text-xs text-ink-500 max-w-md mx-auto">
            Hệ thống đang đối chiếu mô tả và hình ảnh hư hỏng với kho dữ liệu hàng chục ngàn sự cố dân dụng.
          </p>
        </div>

        <!-- AI Diagnosis Result Display per Section 7 -->
        <div v-else-if="aiResult" class="space-y-5 text-xs sm:text-sm">
          <!-- Mandatory Advisory Disclaimer Banner per Section 7 & 20 -->
          <div class="p-3.5 rounded-[var(--radius-sm)] bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5">
            <Info :size="18" class="text-amber-600 shrink-0 mt-0.5" />
            <div class="text-xs leading-relaxed font-medium">
              {{ aiResult.disclaimer || 'Kết quả AI chỉ mang tính tham khảo. Kỹ thuật viên sẽ kiểm tra thực tế trước khi báo giá.' }}
            </div>
          </div>

          <!-- Top Overview Card -->
          <div class="p-4 rounded-[var(--radius-sm)] bg-brand-50 border border-brand-200 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center">
                  <Sparkles :size="15" />
                </span>
                <div>
                  <div class="font-bold text-xs sm:text-sm text-brand-950">Chẩn đoán thông minh FixHome Advisor</div>
                  <div class="text-[11px] text-brand-700">Độ tin cậy ước tính: {{ Math.round((aiResult.confidence || 0.85) * 100) }}%</div>
                </div>
              </div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-200 text-brand-800">
                Model: Gemini 1.5 Flash
              </span>
            </div>

            <!-- Estimated Price Range -->
            <div class="pt-3 border-t border-brand-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="font-semibold text-brand-900 text-xs">Khoảng giá dự trù tham khảo:</span>
                <p class="text-[11px] text-ink-500">Chưa bao gồm vật tư hoặc phát sinh ngoài phạm vi khảo sát</p>
              </div>
              <div class="text-base sm:text-lg font-bold font-num text-brand-700">
                <FhMoney :amount="aiResult.estimatedCostMin || aiResult.suggestedPriceMin || 150000" /> –
                <FhMoney :amount="aiResult.estimatedCostMax || aiResult.suggestedPriceMax || 450000" />
              </div>
            </div>
          </div>

          <!-- Grid: Possible Problems & Causes -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="p-3.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 space-y-2">
              <div class="font-bold text-ink-900 text-xs flex items-center gap-1.5">
                <AlertTriangle :size="14" class="text-amber-500" /> Sự cố tiềm ẩn phát hiện
              </div>
              <ul class="list-disc list-inside space-y-1 text-xs text-ink-700">
                <li v-for="(prob, idx) in (aiResult.possibleProblems || aiResult.possibleIssues || [])" :key="idx">
                  {{ typeof prob === 'string' ? prob : (prob as any).name }}
                </li>
              </ul>
            </div>

            <div class="p-3.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 space-y-2">
              <div class="font-bold text-ink-900 text-xs flex items-center gap-1.5">
                <Info :size="14" class="text-sky-500" /> Nguyên nhân cốt lõi
              </div>
              <ul class="list-disc list-inside space-y-1 text-xs text-ink-700">
                <li v-for="(cause, idx) in (aiResult.possibleCauses || [])" :key="idx">
                  {{ typeof cause === 'string' ? cause : (cause as any).description }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Suggested Service switch option if different -->
          <div
            v-if="aiResult.suggestedServiceName && aiResult.suggestedServiceId && aiResult.suggestedServiceId !== selectedServiceId"
            class="p-3.5 rounded-[var(--radius-sm)] bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3"
          >
            <div>
              <div class="text-xs font-bold text-emerald-950">AI gợi ý dịch vụ phù hợp hơn:</div>
              <div class="text-xs text-emerald-800 font-semibold">{{ aiResult.suggestedServiceName }}</div>
            </div>
            <button
              type="button"
              class="px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shrink-0"
              @click="adoptSuggestedService"
            >
              Đổi sang dịch vụ này
            </button>
          </div>

          <!-- Initial Troubleshooting Suggestions -->
          <div v-if="aiResult.troubleshooting && aiResult.troubleshooting.length > 0" class="p-3.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 space-y-2">
            <div class="font-bold text-ink-900 text-xs flex items-center gap-1.5">
              <ShieldCheck :size="14" class="text-emerald-600" /> Xử lý an toàn ban đầu (Troubleshooting)
            </div>
            <ul class="list-disc list-inside space-y-1 text-xs text-ink-700">
              <li v-for="(tip, idx) in aiResult.troubleshooting" :key="idx">
                {{ tip }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Fallback if AI was unavailable -->
        <div v-else class="text-center py-8 space-y-3">
          <AlertTriangle :size="32" class="text-amber-500 mx-auto" />
          <div class="font-bold text-ink-900 text-sm">Chẩn đoán tự động tạm thời gián đoạn</div>
          <p class="text-xs text-ink-500 max-w-md mx-auto">
            Kỹ thuật viên FixHome sẽ trực tiếp kiểm tra thiết bị tại nhà bạn và báo giá chuẩn xác. Bạn có thể tiếp tục chọn địa chỉ và lịch hẹn.
          </p>
        </div>

        <!-- Navigation Buttons for Step 3 -->
        <div class="flex items-center justify-between pt-5 mt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 2">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton variant="primary" size="md" @click="step = 4">
            Tiếp tục đặt lịch <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>
        </div>
      </FhCard>
    </div>

    <!-- STEP 4: Địa chỉ & Thời gian per Section 20 -->
    <div v-if="step === 4" class="space-y-6">
      <FhCard title="Bước 4: Địa chỉ & Khung giờ hẹn sửa chữa">
        <div class="space-y-5 text-xs sm:text-sm">
          <!-- Address Selection -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="font-semibold text-ink-700">Chọn địa chỉ sửa chữa *</label>
              <router-link to="/app/profile" class="text-xs text-brand-600 font-semibold hover:underline">
                + Thêm địa chỉ mới
              </router-link>
            </div>

            <div v-if="addresses.length === 0" class="p-4 rounded border border-dashed border-ink-200 text-center space-y-2">
              <p class="text-xs text-ink-500">Bạn chưa lưu địa chỉ nào trong danh bạ.</p>
              <router-link to="/app/profile">
                <FhButton variant="secondary" size="sm">+ Thêm địa chỉ sửa chữa</FhButton>
              </router-link>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="addr in addresses"
                :key="addr.id"
                class="p-3.5 rounded-[var(--radius-sm)] border cursor-pointer flex items-center justify-between transition-colors"
                :class="selectedAddressId === addr.id ? 'border-brand-600 bg-brand-50/70 ring-1 ring-brand-600' : 'border-ink-200 bg-white hover:bg-ink-50'"
                @click="selectedAddressId = addr.id"
              >
                <div class="space-y-1">
                  <div class="font-bold text-xs text-ink-900 flex items-center gap-1.5">
                    <MapPin :size="14" class="text-brand-600" />
                    {{ addr.label || 'Địa chỉ' }}
                    <span v-if="addr.isDefault" class="text-[10px] bg-brand-100 text-brand-800 px-1.5 py-0.2 rounded">
                      Mặc định
                    </span>
                  </div>
                  <div class="text-xs text-ink-700">{{ addr.line1 }}</div>
                  <div class="text-[11px] text-ink-500">{{ addr.district }}, {{ addr.province }}</div>
                </div>
                <CheckCircle2 v-if="selectedAddressId === addr.id" :size="18" class="text-brand-600 shrink-0" />
              </div>
            </div>
          </div>

          <!-- Time Window Shortcuts -->
          <div class="pt-3 border-t border-ink-100 space-y-2">
            <label class="block font-semibold text-ink-700">Khung giờ gợi ý (Làm việc: 08:00 – 18:00)</label>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded border text-xs font-semibold hover:border-brand-600 hover:text-brand-700 transition-colors"
                @click="setTimeSlotShortcut('TODAY_AFTERNOON')"
              >
                Hôm nay: Ca chiều (14:00 - 17:00)
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded border text-xs font-semibold hover:border-brand-600 hover:text-brand-700 transition-colors"
                @click="setTimeSlotShortcut('TOMORROW_MORNING')"
              >
                Sáng mai: 08:30 - 11:30
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded border text-xs font-semibold hover:border-brand-600 hover:text-brand-700 transition-colors"
                @click="setTimeSlotShortcut('TOMORROW_AFTERNOON')"
              >
                Chiều mai: 13:30 - 16:30
              </button>
            </div>
          </div>

          <!-- Datetime picker inputs -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Bắt đầu khung giờ *</label>
              <input
                v-model="preferredDate"
                type="datetime-local"
                class="w-full h-10 px-3 border border-ink-200 rounded-[var(--radius-sm)] text-xs sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600"
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Kết thúc khung giờ *</label>
              <input
                v-model="preferredEnd"
                type="datetime-local"
                class="w-full h-10 px-3 border border-ink-200 rounded-[var(--radius-sm)] text-xs sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600"
              />
            </div>
          </div>
        </div>

        <!-- Navigation Buttons for Step 4 -->
        <div class="flex items-center justify-between pt-5 mt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 3">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton variant="primary" size="md" @click="goToStep5">
            Xem lại đơn <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>
        </div>
      </FhCard>
    </div>

    <!-- STEP 5: Review & Submit per Section 20 -->
    <div v-if="step === 5" class="space-y-6">
      <FhCard title="Bước 5: Xác nhận thông tin & Khởi tạo Booking">
        <div class="space-y-5 text-xs sm:text-sm">
          <!-- Summary Review Details -->
          <div class="p-4 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200 space-y-3.5">
            <!-- Service Info -->
            <div class="flex items-center justify-between pb-3 border-b border-ink-200">
              <span class="text-ink-500">Dịch vụ đã chọn:</span>
              <div class="text-right">
                <span class="font-bold text-ink-900 text-sm">{{ selectedService?.name }}</span>
                <div class="text-[11px] font-semibold" :class="isFixedPrice ? 'text-emerald-700' : 'text-sky-700'">
                  {{ isFixedPrice ? 'Gói trọn gói chuẩn' : 'Cần thợ khảo sát trực tiếp' }}
                </div>
              </div>
            </div>

            <!-- Price Breakdown -->
            <div class="flex items-center justify-between pb-3 border-b border-ink-200">
              <span class="text-ink-500">Chi phí dự kiến:</span>
              <div v-if="isFixedPrice" class="text-right">
                <span class="font-bold text-emerald-700 font-num text-sm">
                  <FhMoney :amount="(selectedService?.fixedPrice ?? 0) * quantity" />
                </span>
                <div class="text-[11px] text-ink-400">
                  <FhMoney :amount="selectedService?.fixedPrice ?? 0" /> × {{ quantity }} {{ selectedService?.unit || 'lần' }}
                </div>
              </div>
              <div v-else class="text-right">
                <span class="font-bold text-brand-700 font-num text-sm">
                  <FhMoney :amount="aiResult?.estimatedCostMin || 150000" /> –
                  <FhMoney :amount="aiResult?.estimatedCostMax || 450000" />
                </span>
                <div class="text-[11px] text-ink-400">Dự trù AI (Báo giá chính thức sau khảo sát)</div>
              </div>
            </div>

            <!-- Problem Description -->
            <div class="pb-3 border-b border-ink-200">
              <span class="text-ink-500 block mb-1">Mô tả sự cố:</span>
              <p class="font-medium text-ink-900 leading-relaxed bg-white p-2.5 rounded border border-ink-200 text-xs">
                {{ description }}
              </p>
            </div>

            <!-- Uploaded Photos Thumbnails -->
            <div v-if="mediaFiles.length > 0" class="pb-3 border-b border-ink-200">
              <span class="text-ink-500 block mb-1.5">Ảnh hiện trường ({{ mediaFiles.length }} ảnh):</span>
              <div class="flex flex-wrap gap-2">
                <img
                  v-for="img in mediaFiles"
                  :key="img.url"
                  :src="img.url"
                  alt="Ảnh hư hỏng"
                  class="w-14 h-14 object-cover rounded border border-ink-200"
                />
              </div>
            </div>

            <!-- Address Summary -->
            <div class="flex items-start justify-between pb-3 border-b border-ink-200">
              <span class="text-ink-500 shrink-0">Địa chỉ thực hiện:</span>
              <div class="text-right font-medium text-ink-900 max-w-sm">
                <div>{{ selectedAddress?.line1 }}</div>
                <div class="text-[11px] text-ink-500">{{ selectedAddress?.district }}, {{ selectedAddress?.province }}</div>
              </div>
            </div>

            <!-- Time Window Summary -->
            <div class="flex items-center justify-between pb-3 border-b border-ink-200">
              <span class="text-ink-500">Khung giờ hẹn:</span>
              <div class="text-right font-bold text-ink-900">
                {{ preferredDate ? new Date(preferredDate).toLocaleString('vi-VN') : '' }}
                <span class="text-ink-400 font-normal">đến</span>
                {{ preferredEnd ? new Date(preferredEnd).toLocaleTimeString('vi-VN') : '' }}
              </div>
            </div>

            <!-- Urgency Level -->
            <div class="flex items-center justify-between">
              <span class="text-ink-500">Mức độ khẩn cấp:</span>
              <span class="font-bold text-brand-700">{{ urgency }}</span>
            </div>
          </div>

          <!-- Explanatory notice about candidate shortlisting per Section 8 & 20 -->
          <div class="p-3.5 rounded-[var(--radius-sm)] bg-sky-50 border border-sky-200 text-sky-950 flex items-start gap-2.5">
            <Info :size="16" class="text-sky-600 shrink-0 mt-0.5" />
            <p class="text-xs leading-relaxed">
              Sau khi tạo Booking, hệ thống sẽ lọc danh sách Kỹ thuật viên đạt chuẩn tay nghề và khu vực gần bạn nhất. Bạn có thể xem hồ sơ, xếp hạng tin cậy và chọn tối đa 5 thợ để gửi lời mời tuần tự.
            </p>
          </div>
        </div>

        <!-- Submit & Navigation CTA -->
        <div class="flex items-center justify-between pt-5 mt-5 border-t border-ink-100">
          <FhButton variant="ghost" size="md" @click="step = 4">
            <ArrowLeft :size="15" class="mr-1.5" /> Quay lại
          </FhButton>
          <FhButton
            variant="primary"
            size="lg"
            :loading="loading"
            @click="createAndFindTech"
          >
            Tạo Booking & Chọn thợ <Wrench :size="16" class="ml-1.5" />
          </FhButton>
        </div>
      </FhCard>
    </div>
  </div>
</template>
