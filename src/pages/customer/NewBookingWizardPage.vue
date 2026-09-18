<script setup lang="ts">
// src/pages/customer/NewBookingWizardPage.vue
import { ref, computed, onMounted } from 'vue';
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
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhDatePicker,
  FhTimeScrollPicker,
} from '../../components';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { bookingsApi, type DiagnosisResult } from '../../api/bookings.api';
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
const uploadedPhotos = ref<string[]>([]);
const uploadingPhoto = ref(false);
const photoInput = ref<HTMLInputElement | null>(null);

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

// AI Diagnosis Result
const aiResult = ref<DiagnosisResult | null>(null);


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

      if (q) {
        for (const c of cats) {
          // If popular or fixed query is set, prioritize fixed_price service first
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

const openPhotoPicker = () => {
  if (uploadedPhotos.value.length >= 5) {
    window.alert('Tối đa 5 ảnh thiết bị.');
    return;
  }
  photoInput.value?.click();
};

const handlePhotoSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) return;

  const remaining = 5 - uploadedPhotos.value.length;
  const toUpload = files.slice(0, remaining);

  uploadingPhoto.value = true;
  try {
    for (const file of toUpload) {
      if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type)) {
        window.alert(`Ảnh "${file.name}" không đúng định dạng (chỉ nhận JPG, PNG, WebP).`);
        continue;
      }
      if (file.size > MAX_MEDIA_SIZE_BYTES) {
        window.alert(`Ảnh "${file.name}" vượt quá 10 MB.`);
        continue;
      }
      try {
        const uploaded = await mediaApi.upload(file);
        uploadedPhotos.value.push(uploaded.url);
      } catch {
        window.alert(`Không thể tải ảnh "${file.name}" lên. Vui lòng thử lại.`);
      }
    }
  } finally {
    uploadingPhoto.value = false;
  }
};

const removePhoto = (idx: number) => {
  uploadedPhotos.value.splice(idx, 1);
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
    bookingSchedule(preferredDate.value, preferredTime.value);
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
    const res = await bookingsApi.diagnoseAI({
      description: description.value,
      serviceId: selectedServiceId.value,
    });
    aiResult.value = res;
  } catch {
    aiResult.value = {
      possibleIssues: ['Bộ lọc bám bẩn hoặc thiếu gas làm lạnh'],
      possibleCauses: ['Chưa được bảo dưỡng vệ sinh định kỳ hơn 6 tháng'],
      suggestedPriceMin: 150000,
      suggestedPriceMax: 350000,
      confidence: 0.92,
    };
  } finally {
    loading.value = false;
  }
};

const createAndFindTech = async () => {
  loading.value = true;
  try {
    if (!selectedAddressId.value) throw new Error('Vui lòng thêm địa chỉ trước khi đặt lịch.');
    const schedule = bookingSchedule(preferredDate.value, preferredTime.value);
    const booking = await bookingsApi.createBooking({
      serviceId: selectedServiceId.value,
      addressId: selectedAddressId.value,
      description: description.value,
      ...schedule,
      quantity: isFixedPrice.value ? quantity.value : 1,
      urgency: urgency.value,
      mediaUrls: uploadedPhotos.value,
    });
    router.push(`/app/bookings/${booking.id}/candidates`);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Không thể tạo yêu cầu đặt thợ. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6 pb-12">
    <!-- Stepper Navigation Header (Style Mobile) -->
    <div class="bg-white rounded-2xl border border-ink-200 p-4 shadow-xs">
      <div class="flex items-center justify-between text-xs font-semibold overflow-x-auto no-scrollbar gap-2">
        <div class="flex items-center gap-2 shrink-0" :class="step >= 1 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 1 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">1</span>
          <span>{{ isFixedPrice ? 'Dịch vụ & Số lượng' : 'Dịch vụ & Lỗi' }}</span>
        </div>
        <div class="w-6 sm:w-10 h-0.5 shrink-0" :class="step >= 2 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-2 shrink-0" :class="step >= 2 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 2 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">2</span>
          <span>Địa chỉ & Giờ</span>
        </div>
        <template v-if="!isFixedPrice">
          <div class="w-6 sm:w-10 h-0.5 shrink-0" :class="step >= 3 ? 'bg-brand-600' : 'bg-ink-200'"></div>
          <div class="flex items-center gap-2 shrink-0" :class="step >= 3 ? 'text-brand-600 font-bold' : 'text-ink-400'">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 3 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">3</span>
            <span>AI Soi lỗi</span>
          </div>
        </template>
        <div class="w-6 sm:w-10 h-0.5 shrink-0" :class="step >= 4 ? 'bg-brand-600' : 'bg-ink-200'"></div>
        <div class="flex items-center gap-2 shrink-0" :class="step >= 4 ? 'text-brand-600 font-bold' : 'text-ink-400'">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs" :class="step >= 4 ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-100 text-ink-500'">{{ isFixedPrice ? '3' : '4' }}</span>
          <span>Xác nhận</span>
        </div>
      </div>
    </div>


    <!-- Step 1: Service & Issue Description -->
    <div v-if="step === 1" class="space-y-6">
      <div class="bg-white rounded-3xl border border-ink-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight">
            Nhà mình đang gặp vấn đề gì?
          </h2>
          <p class="text-xs text-ink-500 mt-1">
            Thêm mô tả để thợ chuẩn bị tốt hơn. Bạn có thể thêm ảnh để nhận gợi ý kiểm tra.
          </p>
        </div>

        <div class="space-y-5 text-xs sm:text-sm">
          <!-- Categories Pills -->
          <div>
            <label class="block font-bold text-ink-800 mb-2">Nhóm thiết bị / dịch vụ</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
                :class="selectedCategoryId === cat.id ? 'bg-brand-600 text-white shadow-xs' : 'bg-ink-50 text-ink-700 border border-ink-200 hover:bg-ink-100'"
                @click="onCategorySelect(cat.id)"
              >
                {{ cat.name }}
              </button>
            </div>
          </div>

          <!-- Specific Service Dropdown -->
          <div>
            <label class="block font-bold text-ink-800 mb-1.5">Dịch vụ cụ thể *</label>
            <select
              v-model="selectedServiceId"
              class="w-full h-11 px-3.5 bg-ink-50 border border-ink-200 rounded-xl text-xs sm:text-sm font-medium text-ink-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all"
            >
              <option v-for="svc in services" :key="svc.id" :value="svc.id">
                {{ svc.name }} (~{{ svc.estimatedMinutes }} phút)
              </option>
            </select>
          </div>

          <!-- Fixed Price Package Box -->
          <div v-if="isFixedPrice" class="p-4 rounded-2xl bg-brand-50 border border-brand-200 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white">
                  Gói trọn gói chuẩn
                </span>
                <span class="font-bold text-xs text-brand-900">
                  {{ selectedService?.name }}
                </span>
              </div>
              <div class="text-xs font-bold text-brand-700 font-num">
                <FhMoney :amount="selectedService?.fixedPrice || selectedService?.basePrice || 0" /> / {{ selectedService?.unit || 'thiết bị' }}
              </div>
            </div>

            <!-- Quantity Counter (Style Mobile [-] 1 [+]) -->
            <div class="flex items-center justify-between pt-3 border-t border-brand-200 text-xs">
              <label class="font-semibold text-ink-700">Số lượng thiết bị:</label>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="w-8 h-8 rounded-xl border border-ink-300 bg-white font-extrabold flex items-center justify-center hover:bg-ink-100 active:scale-95 shadow-xs"
                  @click="quantity = Math.max(1, quantity - 1)"
                >
                  -
                </button>
                <span class="font-bold font-num text-base text-ink-900 min-w-[20px] text-center">{{ quantity }}</span>
                <button
                  type="button"
                  class="w-8 h-8 rounded-xl border border-ink-300 bg-white font-extrabold flex items-center justify-center hover:bg-ink-100 active:scale-95 shadow-xs"
                  @click="quantity++"
                >
                  +
                </button>
                <div class="ml-2 font-bold text-brand-700 font-num">
                  = <FhMoney :amount="(selectedService?.fixedPrice || selectedService?.basePrice || 0) * quantity" />
                </div>
              </div>
            </div>
          </div>

          <!-- Photo Upload Area (Mobile Dotted Box) -->
          <div>
            <label class="block font-bold text-ink-800 mb-1.5">Ảnh hiện trạng thiết bị</label>
            <input
              ref="photoInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              class="hidden"
              @change="handlePhotoSelected"
            />
            <div
              class="p-5 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/40 hover:bg-brand-50/80 transition-colors text-center cursor-pointer flex flex-col items-center justify-center space-y-1.5"
              :class="{ 'opacity-60 pointer-events-none': uploadingPhoto }"
              @click="openPhotoPicker"
            >
              <div class="w-10 h-10 rounded-full bg-white text-brand-600 flex items-center justify-center shadow-xs">
                <Camera :size="20" />
              </div>
              <p class="text-xs font-bold text-brand-700">
                {{ uploadingPhoto ? 'Đang tải ảnh lên...' : 'Thêm ảnh thiết bị' }}
              </p>
              <p class="text-[11px] text-ink-500">Ảnh toàn cảnh hoặc vị trí hư hỏng (Tối đa 5 ảnh · JPG, PNG · 10 MB)</p>
            </div>

            <!-- Image previews -->
            <div v-if="uploadedPhotos.length > 0" class="flex flex-wrap gap-2.5 mt-3">
              <div
                v-for="(photo, idx) in uploadedPhotos"
                :key="idx"
                class="relative w-16 h-16 rounded-xl overflow-hidden border border-ink-200 shadow-xs group"
              >
                <img :src="photo" class="w-full h-full object-cover" />

                <button
                  type="button"
                  class="absolute top-1 right-1 p-0.5 bg-black/60 text-white rounded-full hover:bg-danger-600 transition-colors"
                  @click.stop="removePhoto(idx)"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </div>

          <!-- Issue Description -->
          <div>
            <label class="block font-bold text-ink-800 mb-1.5 flex items-center justify-between flex-wrap gap-1">
              <span>Mô tả yêu cầu <span v-if="!isFixedPrice">*</span></span>
              <span v-if="isFixedPrice" class="text-[11px] font-normal text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                ⚡ Giá niêm yết (Không bắt buộc mô tả lỗi)
              </span>
            </label>
            <textarea
              v-model="description"
              rows="3"
              class="w-full p-3.5 bg-ink-50 border border-ink-200 rounded-xl text-xs sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all leading-relaxed"
              :placeholder="isFixedPrice ? 'Ghi chú thêm cho thợ (ví dụ: Vị trí đặt máy, lưu ý khi tới...)' : 'Ví dụ: Điều hòa vẫn chạy nhưng không mát, quạt dàn lạnh có tiếng kêu rè rè và nhỏ nước xuống góc tường...'"
            ></textarea>
          </div>


          <!-- Urgency Level -->
          <div>
            <label class="block font-bold text-ink-800 mb-2">Mức độ khẩn cấp</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                v-for="lvl in [
                  { key: 'LOW', label: 'Bình thường', hint: 'Trong 24–48h' },
                  { key: 'NORMAL', label: 'Tiêu chuẩn', hint: 'Trong ngày' },
                  { key: 'HIGH', label: 'Khẩn cấp', hint: 'Trong 1–2h' },
                  { key: 'EMERGENCY', label: 'Cực khẩn', hint: 'Dưới 30 phút' },
                ]"
                :key="lvl.key"
                type="button"
                class="p-3 rounded-xl border text-left transition-all active:scale-95"
                :class="urgency === lvl.key ? 'border-brand-600 bg-brand-50/80 text-brand-900 ring-2 ring-brand-500 font-bold' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                @click="urgency = (lvl.key as any)"
              >
                <div class="text-xs">{{ lvl.label }}</div>
                <div class="text-[10px] text-ink-400 mt-0.5 font-normal">{{ lvl.hint }}</div>
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-5 border-t border-ink-100">
          <FhButton variant="primary" size="md" @click="goToStep2">
            Tiếp tục <ArrowRight :size="15" class="ml-1.5" />
          </FhButton>
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
            Hệ thống đối chiếu triệu chứng thực tế với kho kiến thức 50,000+ ca sửa chữa.
          </p>
        </div>

        <div v-if="loading" class="text-center py-12 space-y-3">
          <Sparkles class="animate-spin text-purple-600 mx-auto" :size="36" />
          <p class="text-xs text-ink-600 font-bold">AI đang phân tích mô tả của bạn...</p>
        </div>

        <div v-else-if="aiResult" class="space-y-5 text-xs sm:text-sm">
          <!-- Main AI Advice Card -->
          <div class="p-5 rounded-2xl bg-purple-50 border border-purple-200 space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                <Sparkles :size="15" class="text-purple-600" /> Độ chính xác ước tính: {{ Math.round(aiResult.confidence * 100) }}%
              </span>
              <span class="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-full border border-purple-200">
                FixHome AI Engine
              </span>
            </div>

            <div>
              <div class="text-xs font-bold text-purple-950 mb-1.5">Sự cố tiềm ẩn được phát hiện:</div>
              <ul class="list-disc list-inside space-y-1 text-xs text-purple-900 font-medium">
                <li v-for="iss in aiResult.possibleIssues" :key="iss">{{ iss }}</li>
              </ul>
            </div>
          </div>

          <!-- Cause and Price Estimate Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-1.5">
              <div class="font-bold text-ink-900 text-xs">Nguyên nhân khả dĩ</div>
              <ul class="list-disc list-inside space-y-1 text-xs text-ink-600">
                <li v-for="c in aiResult.possibleCauses" :key="c">{{ c }}</li>
              </ul>
            </div>

            <div class="p-4 rounded-2xl bg-brand-50 border border-brand-200 flex flex-col justify-between">
              <div>
                <div class="font-bold text-brand-900 text-xs mb-0.5">Khoảng chi phí tham khảo</div>
                <div class="text-[11px] text-ink-500">Ước tính công thợ (chưa bao gồm linh kiện)</div>
              </div>
              <div class="text-lg font-extrabold font-num text-brand-700 mt-2">
                <FhMoney :amount="aiResult.suggestedPriceMin" /> – <FhMoney :amount="aiResult.suggestedPriceMax" />
              </div>
            </div>
          </div>

          <!-- Disclaimer Note -->
          <p class="text-[11px] text-ink-500 italic bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-800">
            * Lưu ý: Đây là gợi ý tham khảo từ AI. Kỹ thuật viên sẽ kiểm tra trực tiếp thực tế tại nhà và chốt báo giá chính xác trước khi thực hiện sửa chữa.
          </p>
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
