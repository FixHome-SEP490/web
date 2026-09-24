<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  MapPin,
  CheckCircle2,
  Calendar,
  Clock,
  Phone,
  Mail,
  Camera,
  Star,
  ShieldCheck,
  Pencil,
  Check,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next';
import {
  FhCard,
  FhMoney,
  FhButton,
  FhConfirmDialog,
  MapTilerMap,
  type MapMarker,
} from '../../components';
import { useAuthStore } from '../../stores/auth';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import {
  technicianProfileApi,
  type TechnicianProfileView,
  type TechnicianServiceOfferingView,
  type TechnicianTimeOffView,
} from '../../api/technician-profile.api';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';

const authStore = useAuthStore();

const fullName = ref('');
const phoneNumber = ref('');
const bio = ref('');
const yearsExperience = ref(0);
const isSaving = ref(false);
const saveSuccess = ref(false);
const showEditProfileModal = ref(false);

const avatarUrl = ref('');
const showAvatarModal = ref(false);
const newAvatarUrl = ref('');

const loading = ref(true);
const loadError = ref('');
const technicianProfile = ref<TechnicianProfileView | null>(null);
const togglingAvailability = ref(false);

const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// ---- Lịch làm việc ----
const showScheduleModal = ref(false);
const savingSchedule = ref(false);
const scheduleDraft = ref(
  Array.from({ length: 7 }, () => ({ enabled: false, startTime: '08:00', endTime: '17:00' })),
);

const openScheduleModal = () => {
  const byDay = new Map(uniqueSchedule.value.map((s) => [s.dayOfWeek, s]));
  scheduleDraft.value = Array.from({ length: 7 }, (_, day) => {
    const existing = byDay.get(day);
    return existing
      ? { enabled: true, startTime: existing.startTime, endTime: existing.endTime }
      : { enabled: false, startTime: '08:00', endTime: '17:00' };
  });
  showScheduleModal.value = true;
};

const handleSaveSchedule = async () => {
  savingSchedule.value = true;
  try {
    const schedules = scheduleDraft.value
      .map((slot, dayOfWeek) => ({ ...slot, dayOfWeek }))
      .filter((slot) => slot.enabled)
      .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
    await technicianProfileApi.updateMySchedule(schedules);
    await loadProfile();
    showScheduleModal.value = false;
  } catch {
    alert('Không thể cập nhật lịch làm việc. Vui lòng thử lại.');
  } finally {
    savingSchedule.value = false;
  }
};

// ---- Ngày nghỉ ----
const showTimeOffModal = ref(false);
const timeOffList = ref<TechnicianTimeOffView[]>([]);
const loadingTimeOff = ref(false);
const savingTimeOff = ref(false);
const newTimeOff = ref({ startDate: '', endDate: '', reason: '' });
const confirmDeleteTimeOff = ref<TechnicianTimeOffView | null>(null);
const deletingTimeOff = ref(false);

const openTimeOffModal = async () => {
  showTimeOffModal.value = true;
  newTimeOff.value = { startDate: '', endDate: '', reason: '' };
  loadingTimeOff.value = true;
  try {
    timeOffList.value = await technicianProfileApi.getMyTimeOff();
  } catch {
    timeOffList.value = [];
  } finally {
    loadingTimeOff.value = false;
  }
};

const handleAddTimeOff = async () => {
  if (!newTimeOff.value.startDate || !newTimeOff.value.endDate) return;
  savingTimeOff.value = true;
  try {
    await technicianProfileApi.createTimeOff({
      startAt: `${newTimeOff.value.startDate}T00:00:00`,
      endAt: `${newTimeOff.value.endDate}T23:59:59`,
      reason: newTimeOff.value.reason.trim() || undefined,
    });
    newTimeOff.value = { startDate: '', endDate: '', reason: '' };
    timeOffList.value = await technicianProfileApi.getMyTimeOff();
  } catch {
    alert('Không thể thêm ngày nghỉ. Vui lòng kiểm tra lại khoảng ngày.');
  } finally {
    savingTimeOff.value = false;
  }
};

const handleDeleteTimeOff = async () => {
  if (!confirmDeleteTimeOff.value) return;
  deletingTimeOff.value = true;
  try {
    await technicianProfileApi.deleteTimeOff(confirmDeleteTimeOff.value.id);
    timeOffList.value = timeOffList.value.filter((t) => t.id !== confirmDeleteTimeOff.value?.id);
    confirmDeleteTimeOff.value = null;
  } catch {
    alert('Không thể xoá ngày nghỉ. Vui lòng thử lại.');
  } finally {
    deletingTimeOff.value = false;
  }
};

// ---- Kỹ năng / dịch vụ nhận làm ----
const showSkillsModal = ref(false);
const loadingSkills = ref(false);
const catalogServices = ref<ServiceItem[]>([]);
const myOfferings = ref<Map<string, TechnicianServiceOfferingView>>(new Map());
const skillDrafts = ref<
  Record<string, { enabled: boolean; listedLaborPrice: string; typicalWarrantyDays: string; level: string }>
>({});
const savingSkillId = ref<string | null>(null);

const openSkillsModal = async () => {
  showSkillsModal.value = true;
  loadingSkills.value = true;
  try {
    const [services, offerings] = await Promise.all([
      catalogApi.getServices({ limit: 100 }),
      technicianProfileApi.getMyServices(),
    ]);
    catalogServices.value = services.data;
    myOfferings.value = new Map(offerings.map((o) => [o.serviceId, o]));
    const drafts: typeof skillDrafts.value = {};
    for (const service of services.data) {
      const offering = myOfferings.value.get(service.id);
      drafts[service.id] = {
        enabled: offering?.isActive ?? false,
        listedLaborPrice: offering?.listedLaborPrice != null ? String(offering.listedLaborPrice) : '',
        typicalWarrantyDays:
          offering?.typicalWarrantyDays != null ? String(offering.typicalWarrantyDays) : '30',
        level: offering?.level ?? 'INTERMEDIATE',
      };
    }
    skillDrafts.value = drafts;
  } catch {
    catalogServices.value = [];
  } finally {
    loadingSkills.value = false;
  }
};

// Evidence (tín chỉ ngoài) technician can attach while a skill sits pending.
const evidenceUploadingId = ref<string | null>(null);
const rejectionReasons = ref<Record<string, string | null>>({});

const handleUploadEvidence = async (serviceId: string, event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  evidenceUploadingId.value = serviceId;
  try {
    const { storageObjectPath, uploadUrl } = await technicianProfileApi.requestSkillEvidenceUploadUrl(
      serviceId,
      file.type,
    );
    await technicianProfileApi.uploadSkillEvidenceFile(uploadUrl, file.type, file);
    await technicianProfileApi.attachSkillEvidence(serviceId, {
      storageObjectPath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch {
    alert('Không thể gửi tín chỉ. Vui lòng thử lại.');
  } finally {
    evidenceUploadingId.value = null;
  }
};

const showRejectionReason = async (serviceId: string) => {
  if (rejectionReasons.value[serviceId] !== undefined) return;
  const verification = await technicianProfileApi.getSkillVerification(serviceId).catch(() => null);
  rejectionReasons.value[serviceId] = verification?.rejectionReason ?? null;
};

const handleSaveSkill = async (service: ServiceItem) => {
  const draft = skillDrafts.value[service.id];
  if (!draft) return;
  savingSkillId.value = service.id;
  try {
    const isFixedPrice = String(service.pricingMode).toLowerCase() === 'fixed_price';
    const offering = await technicianProfileApi.setSkillPricing(service.id, {
      isActive: draft.enabled,
      level: draft.level.trim() || 'INTERMEDIATE',
      typicalWarrantyDays: draft.typicalWarrantyDays ? Number(draft.typicalWarrantyDays) : null,
      listedLaborPrice: isFixedPrice
        ? null
        : draft.listedLaborPrice
          ? Number(draft.listedLaborPrice)
          : null,
    });
    myOfferings.value.set(service.id, offering);
    await loadProfile();
  } catch {
    alert('Không thể lưu kỹ năng này. Vui lòng kiểm tra lại giá trị nhập.');
  } finally {
    savingSkillId.value = null;
  }
};

// ---- Vị trí & bán kính hoạt động ----
const technicianAddress = ref<UserAddress | null>(null);
const showLocationModal = ref(false);
const savingLocation = ref(false);
const locationLine1 = ref('');
const locationWard = ref('');
const locationDistrict = ref('');
const locationProvince = ref('');
const locationLat = ref<number | ''>('');
const locationLng = ref<number | ''>('');
const locationRadiusKm = ref(10);
const mapCenter = ref({ lat: 21.0285, lng: 105.8542 }); // Hanoi, used until a location is picked
const mapRef = ref<InstanceType<typeof MapTilerMap> | null>(null);
const locationMarkers = ref<MapMarker[]>([]);
const locationSuggestions = ref<PlaceSuggestion[]>([]);
const searchingLocation = ref(false);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let reverseDebounce: ReturnType<typeof setTimeout> | null = null;

const applyPlace = (lat: number, lng: number, place?: { formattedAddress?: string; description?: string; ward?: string; district?: string; province?: string }) => {
  locationLat.value = lat;
  locationLng.value = lng;
  locationMarkers.value = [{ id: 'picker', lat, lng, draggable: true, color: '#dc2626' }];
  if (place) {
    locationLine1.value = place.formattedAddress || place.description || locationLine1.value;
    locationWard.value = place.ward || '';
    locationDistrict.value = place.district || locationDistrict.value;
    locationProvince.value = place.province || locationProvince.value;
  }
};

const onLocationMarkerMove = (_id: string, lat: number, lng: number) => {
  locationLat.value = lat;
  locationLng.value = lng;
  locationMarkers.value = [{ id: 'picker', lat, lng, draggable: true, color: '#dc2626' }];
  if (reverseDebounce) clearTimeout(reverseDebounce);
  reverseDebounce = setTimeout(async () => {
    try {
      const place = await geoApi.reverse(lat, lng);
      applyPlace(lat, lng, place);
    } catch {
      // Keep the pin where the user dropped it even if reverse lookup fails.
    }
  }, 500);
};

const onLocationSearchInput = () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  const query = locationLine1.value.trim();
  if (query.length < 3) { locationSuggestions.value = []; return; }
  searchDebounce = setTimeout(async () => {
    searchingLocation.value = true;
    try {
      locationSuggestions.value = await geoApi.autocomplete(query);
    } catch {
      locationSuggestions.value = [];
    } finally {
      searchingLocation.value = false;
    }
  }, 350);
};

const selectLocationSuggestion = (suggestion: PlaceSuggestion) => {
  locationSuggestions.value = [];
  mapCenter.value = { lat: suggestion.lat, lng: suggestion.lng };
  applyPlace(suggestion.lat, suggestion.lng, suggestion);
  mapRef.value?.flyTo(suggestion.lat, suggestion.lng);
};

const openLocationModal = () => {
  const addr = technicianAddress.value;
  locationLine1.value = addr?.line1 ?? '';
  locationWard.value = addr?.ward ?? '';
  locationDistrict.value = addr?.district ?? '';
  locationProvince.value = addr?.province ?? '';
  locationLat.value = addr?.lat ?? '';
  locationLng.value = addr?.lng ?? '';
  locationRadiusKm.value = technicianProfile.value?.serviceRadiusKm ?? 10;
  locationMarkers.value = addr?.lat != null && addr?.lng != null
    ? [{ id: 'picker', lat: Number(addr.lat), lng: Number(addr.lng), draggable: true, color: '#dc2626' }]
    : [];
  mapCenter.value = addr?.lat != null && addr?.lng != null
    ? { lat: Number(addr.lat), lng: Number(addr.lng) }
    : { lat: 21.0285, lng: 105.8542 };
  locationSuggestions.value = [];
  showLocationModal.value = true;
};

const handleSaveLocation = async () => {
  if (!locationLine1.value.trim() || locationLat.value === '' || locationLng.value === '') {
    alert('Vui lòng tìm hoặc chọn vị trí trên bản đồ trước khi lưu.');
    return;
  }
  savingLocation.value = true;
  try {
    const addressDto = {
      line1: locationLine1.value.trim(),
      ward: locationWard.value || undefined,
      district: locationDistrict.value || locationWard.value || locationProvince.value,
      province: locationProvince.value,
      lat: Number(locationLat.value),
      lng: Number(locationLng.value),
      isDefault: true,
    };
    await (technicianAddress.value
      ? profileApi.updateAddress(technicianAddress.value.id, addressDto)
      : profileApi.createAddress(addressDto));
    await technicianProfileApi.updateMyProfile({ serviceRadiusKm: locationRadiusKm.value });
    await loadProfile();
    showLocationModal.value = false;
  } catch {
    alert('Không thể lưu vị trí. Vui lòng thử lại.');
  } finally {
    savingLocation.value = false;
  }
};

// Seed schedule rows have duplicates for the same day; keep one per dayOfWeek.
const uniqueSchedule = computed(() => {
  const seen = new Map<number, { dayOfWeek: number; startTime: string; endTime: string }>();
  for (const s of technicianProfile.value?.schedules ?? []) {
    if (!seen.has(s.dayOfWeek)) seen.set(s.dayOfWeek, s);
  }
  return [...seen.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
});

const loadProfile = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const [profile, addresses] = await Promise.all([
      technicianProfileApi.getMyProfile(),
      profileApi.getAddresses().catch(() => []),
    ]);
    technicianProfile.value = profile;
    technicianAddress.value = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  } catch {
    loadError.value = 'Không thể tải hồ sơ. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  avatarUrl.value = authStore.user?.avatarUrl ?? '';
  await loadProfile();
});

const toggleAvailability = async () => {
  if (!technicianProfile.value || togglingAvailability.value) return;
  const next = !technicianProfile.value.isAvailable;
  togglingAvailability.value = true;
  try {
    technicianProfile.value = await technicianProfileApi.updateMyProfile({ isAvailable: next });
  } catch {
    alert('Không thể cập nhật trạng thái nhận việc. Vui lòng thử lại.');
  } finally {
    togglingAvailability.value = false;
  }
};

const openEditProfileModal = () => {
  fullName.value = authStore.user?.fullName || '';
  phoneNumber.value = authStore.user?.phoneNumber || '';
  bio.value = technicianProfile.value?.bio || '';
  yearsExperience.value = technicianProfile.value?.yearsExperience || 0;
  showEditProfileModal.value = true;
  saveSuccess.value = false;
};

const handleSaveProfile = async () => {
  isSaving.value = true;
  saveSuccess.value = false;
  try {
    const [updatedUser, updatedProfile] = await Promise.all([
      profileApi.updateMe({
        fullName: fullName.value.trim(),
        phoneNumber: phoneNumber.value.trim() || undefined,
      }),
      technicianProfileApi.updateMyProfile({
        bio: bio.value.trim(),
        yearsExperience: yearsExperience.value,
      }),
    ]);
    technicianProfile.value = updatedProfile;
    if (authStore.user && authStore.token) {
      authStore.setAuth(authStore.token, {
        ...authStore.user,
        ...updatedUser,
        role: authStore.user.role,
      });
    }
    saveSuccess.value = true;
    await authStore.fetchProfile();
    setTimeout(() => {
      saveSuccess.value = false;
      showEditProfileModal.value = false;
    }, 1500);
  } catch {
    alert('Không thể cập nhật hồ sơ. Vui lòng thử lại.');
  } finally {
    isSaving.value = false;
  }
};

const openAvatarModal = () => {
  newAvatarUrl.value = avatarUrl.value;
  showAvatarModal.value = true;
};

const handleSaveAvatar = async () => {
  try {
    const updated = await profileApi.updateMe({
      avatarUrl: newAvatarUrl.value.trim() || undefined,
    });
    if (authStore.user && authStore.token) {
      authStore.setAuth(authStore.token, {
        ...authStore.user,
        ...updated,
        role: authStore.user.role,
      });
      avatarUrl.value = newAvatarUrl.value.trim();
    }
    await authStore.fetchProfile();
    if (authStore.user) {
      avatarUrl.value = authStore.user.avatarUrl ?? '';
    }
    showAvatarModal.value = false;
  } catch {
    alert('Không thể cập nhật ảnh đại diện. Vui lòng thử lại.');
  }
};
</script>

<template>
  <div class="max-w-6xl mx-auto pb-10">
    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải hồ sơ...
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ loadError }}</span>
      <button class="font-semibold underline" type="button" @click="loadProfile">Thử lại</button>
    </div>

    <template v-else-if="technicianProfile">
    <!-- Profile Header (Facebook Style) -->
    <div class="bg-white shadow-(--shadow-e1) rounded-b-lg px-6 pt-10 pb-2 mb-6">
      <div class="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6 border-b border-ink-200 pb-6">
        <!-- Avatar & Name -->
        <div class="flex flex-col sm:flex-row items-center gap-6">
          <!-- Avatar with Camera Button -->
          <div class="relative w-32 h-32 -mt-5 shrink-0">
            <div class="w-full h-full rounded-full border-4 border-white shadow-md bg-brand-100 text-brand-700 font-bold text-5xl overflow-hidden flex items-center justify-center">
               <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" />
               <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'T' }}</span>
            </div>
            
            <button 
              @click="openAvatarModal"
              class="absolute bottom-1 right-1 w-9 h-9 bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
              title="Đổi ảnh đại diện"
            >
              <Camera :size="18" />
            </button>
          </div>
          
          <!-- Name -->
          <div class="text-center sm:text-left mt-2 sm:mt-0">
            <h1 class="text-3xl font-bold text-ink-900 tracking-tight flex items-center gap-2 justify-center sm:justify-start">
              {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
              <CheckCircle2 :size="24" class="text-brand-600" />
            </h1>
            <p class="text-sm text-ink-500 font-medium mt-1">
              {{ technicianProfile.yearsExperience }} năm kinh nghiệm • Độ tin cậy: {{ technicianProfile.reliabilityScore }}%
            </p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col items-center sm:items-end gap-2">
          <span class="text-xs font-semibold text-ink-500">Trạng thái nhận việc:</span>
          <button
            class="px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-60"
            :class="technicianProfile.isAvailable ? 'bg-success-50 text-success-700 border border-success-200' : 'bg-ink-100 text-ink-600'"
            :disabled="togglingAvailability"
            @click="toggleAvailability"
          >
            <span class="w-2.5 h-2.5 rounded-full" :class="technicianProfile.isAvailable ? 'bg-success-500' : 'bg-ink-400'"></span>
            {{ technicianProfile.isAvailable ? 'Đang sẵn sàng' : 'Tạm dừng nhận việc' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Main Content (2 Columns) -->
    <div class="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 px-4 sm:px-0">
      
      <!-- Left Column (Giới thiệu / Readonly List) -->
      <div class="space-y-6">
        <div class="bg-white shadow-(--shadow-e1) rounded-md p-5 border border-ink-100">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-ink-900">Giới thiệu</h2>
            <button 
              @click="openEditProfileModal"
              class="p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 rounded-full transition-all duration-300 hover:rotate-12"
              title="Chỉnh sửa thông tin"
            >
              <Pencil :size="18" />
            </button>
          </div>
          
          <div class="space-y-4 text-sm">
            <p class="text-ink-700 leading-relaxed mb-4">
              {{ technicianProfile.bio }}
            </p>

            <div class="flex items-center gap-3 text-ink-800 font-medium">
              <Star :size="20" class="text-amber-500 shrink-0 fill-amber-500" />
              <span>{{ technicianProfile.averageRating }} ({{ technicianProfile.ratingCount }} đánh giá)</span>
            </div>

            <div class="flex items-center gap-3 text-ink-800 font-medium">
              <ShieldCheck :size="20" class="text-success-600 shrink-0" />
              <span class="text-success-700">Đã xác thực lý lịch</span>
            </div>

            <div class="flex items-center gap-3 text-ink-800 font-medium">
              <Phone :size="20" class="text-ink-400 shrink-0" />
              <span>{{ authStore.user?.phoneNumber || 'Chưa cập nhật SĐT' }}</span>
            </div>

            <div class="flex items-center gap-3 text-ink-800 font-medium">
              <Mail :size="20" class="text-ink-400 shrink-0" />
              <span class="break-all">{{ authStore.user?.email }}</span>
            </div>
          </div>
        </div>

        <!-- Khung giờ nhận việc tiêu chuẩn có thể cho sang trái vì ngắn gọn -->
        <FhCard title="Khung giờ nhận việc">
          <template #action>
            <button
              @click="openScheduleModal"
              class="p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 rounded-full transition-colors"
              title="Chỉnh sửa lịch làm việc"
            >
              <Pencil :size="16" />
            </button>
          </template>
          <div v-if="uniqueSchedule.length === 0" class="text-xs text-ink-500">Chưa cấu hình lịch làm việc.</div>
          <div v-else class="space-y-3 text-xs">
            <div
              v-for="slot in uniqueSchedule"
              :key="slot.dayOfWeek"
              class="flex flex-col gap-1 pb-3 border-b border-ink-100 last:border-0"
            >
              <span class="font-semibold text-ink-700 flex items-center gap-1.5">
                <Calendar :size="14" class="text-brand-600" /> {{ DAY_NAMES[slot.dayOfWeek] }}
              </span>
              <span class="font-num font-bold text-brand-700 flex items-center gap-1.5 ml-5">
                <Clock :size="13" /> {{ slot.startTime }} – {{ slot.endTime }}
              </span>
            </div>
          </div>
        </FhCard>

        <FhCard title="Ngày nghỉ">
          <template #action>
            <button
              @click="openTimeOffModal"
              class="p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 rounded-full transition-colors"
              title="Quản lý ngày nghỉ"
            >
              <Pencil :size="16" />
            </button>
          </template>
          <p class="text-xs text-ink-500">Đăng ký các khoảng ngày bạn không nhận việc.</p>
        </FhCard>
      </div>

      <!-- Right Column (Cards - Skills & Areas) -->
      <div class="space-y-6">
        
        <!-- Verified Skills -->
        <FhCard title="Kỹ năng chuyên môn đã duyệt">
          <template #action>
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-ink-400 font-mono">{{ technicianProfile.skills.length }} dịch vụ</span>
              <button
                @click="openSkillsModal"
                class="p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 rounded-full transition-colors"
                title="Chỉnh sửa kỹ năng"
              >
                <Pencil :size="16" />
              </button>
            </div>
          </template>

          <div class="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            <div
              v-for="skill in technicianProfile.skills"
              :key="skill.serviceName"
              class="p-4 rounded-sm bg-white border border-ink-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-brand-400 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
            >
              <div class="flex items-center gap-2.5">
                <CheckCircle2 :size="18" class="text-brand-600 shrink-0" />
                <span class="text-sm font-semibold text-ink-800">{{ skill.serviceName }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="skill.pricingMode === 'fixed_price'" class="text-xs font-num text-brand-700 font-bold">
                  <FhMoney :amount="skill.fixedPrice ?? 0" />
                </span>
                <span v-else-if="skill.listedLaborPrice" class="text-xs font-num text-brand-700 font-bold">
                  <FhMoney :amount="skill.listedLaborPrice" />
                </span>
                <span class="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-ink-100 text-ink-700 border border-ink-200">
                  {{ skill.level }}
                </span>
              </div>
            </div>
          </div>
        </FhCard>

        <!-- Vị trí & bán kính hoạt động -->
        <FhCard title="Vị trí & bán kính hoạt động">
          <template #action>
            <button
              @click="openLocationModal"
              class="p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 rounded-full transition-colors cursor-pointer"
              title="Chỉnh sửa vị trí"
            >
              <Pencil :size="16" />
            </button>
          </template>

          <div v-if="!technicianAddress" class="text-center py-8 text-ink-500 text-sm">
            <MapPin :size="24" class="mx-auto text-ink-400 mb-2" />
            <p>Chưa cập nhật vị trí — khách sẽ không thấy bạn khi quét thợ gần đó.</p>
            <button
              @click="openLocationModal"
              class="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline cursor-pointer"
            >
              + Cập nhật vị trí ngay
            </button>
          </div>

          <div v-else class="p-3 rounded-md bg-white border border-ink-200/80 space-y-1.5">
            <div class="flex items-center gap-2.5">
              <MapPin :size="16" class="text-brand-600 shrink-0" />
              <span class="text-sm font-medium text-ink-800">{{ technicianAddress.line1 }}</span>
            </div>
            <p class="text-xs text-ink-500 pl-6">{{ [technicianAddress.ward, technicianAddress.district, technicianAddress.province].filter(Boolean).join(', ') }}</p>
            <p class="text-xs text-ink-700 font-semibold pl-6">Bán kính hoạt động: {{ technicianProfile.serviceRadiusKm }} km</p>
          </div>
        </FhCard>

      </div>

    </div>
    </template>

    <!-- Edit Profile Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showEditProfileModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      >
        <div class="bg-white rounded-md max-w-sm w-full p-6 shadow-xl space-y-5">
          <h3 class="text-lg font-bold text-ink-900">
            Chỉnh sửa thông tin
          </h3>

          <div class="space-y-4 text-sm">
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Họ và tên</label>
              <input v-model="fullName" type="text" class="w-full h-10 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600" />
            </div>
            
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Số điện thoại</label>
              <input v-model="phoneNumber" type="text" class="w-full h-10 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num" placeholder="0912345678" />
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Giới thiệu bản thân</label>
              <textarea v-model="bio" rows="3" class="w-full p-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 leading-relaxed"></textarea>
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Số năm kinh nghiệm</label>
              <input v-model.number="yearsExperience" type="number" min="0" max="80" class="w-full h-10 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num" />
            </div>

            <div v-if="saveSuccess" class="bg-success-50 text-success-700 text-xs px-3 py-2 rounded border border-success-200 flex items-center gap-1.5">
              <Check :size="14" /> Cập nhật thành công!
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
            <FhButton variant="ghost" size="sm" @click="showEditProfileModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton variant="primary" size="sm" :loading="isSaving" @click="handleSaveProfile">
              Lưu thay đổi
            </FhButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Edit Avatar Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showAvatarModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      >
      <div class="bg-white rounded-md max-w-sm w-full p-6 shadow-xl space-y-5">
        <h3 class="text-lg font-bold text-ink-900">
          Cập nhật Ảnh đại diện
        </h3>

        <div class="space-y-4 text-sm">
          <div>
            <label class="block font-semibold text-ink-700 mb-1.5">Đường dẫn ảnh (URL)</label>
            <input v-model="newAvatarUrl" type="text" class="w-full h-10 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600" placeholder="https://..." />
            <p class="text-xs text-ink-500 mt-1.5">Dán đường dẫn ảnh hợp lệ (jpg, png) vào đây để cập nhật avatar của bạn.</p>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showAvatarModal = false">
            Huỷ bỏ
          </FhButton>
          <FhButton variant="primary" size="sm" @click="handleSaveAvatar">
            Lưu ảnh
          </FhButton>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Schedule Modal -->
    <div
      v-if="showScheduleModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-md max-w-md w-full p-6 shadow-xl space-y-5">
        <h3 class="text-lg font-bold text-ink-900">Lịch làm việc theo tuần</h3>
        <div class="space-y-2.5 text-sm max-h-[60vh] overflow-y-auto pr-1">
          <div
            v-for="(slot, day) in scheduleDraft"
            :key="day"
            class="flex items-center gap-3 pb-2.5 border-b border-ink-100 last:border-0"
          >
            <label class="flex items-center gap-2 w-28 shrink-0 font-medium text-ink-700">
              <input type="checkbox" v-model="slot.enabled" />
              {{ DAY_NAMES[day] }}
            </label>
            <input
              type="time"
              v-model="slot.startTime"
              :disabled="!slot.enabled"
              class="h-9 px-2 border border-ink-200 rounded-sm disabled:opacity-40 font-num"
            />
            <span class="text-ink-400">–</span>
            <input
              type="time"
              v-model="slot.endTime"
              :disabled="!slot.enabled"
              class="h-9 px-2 border border-ink-200 rounded-sm disabled:opacity-40 font-num"
            />
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showScheduleModal = false">Huỷ bỏ</FhButton>
          <FhButton variant="primary" size="sm" :loading="savingSchedule" @click="handleSaveSchedule">
            Lưu lịch làm việc
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Time Off Modal -->
    <div
      v-if="showTimeOffModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-md max-w-md w-full p-6 shadow-xl space-y-5">
        <h3 class="text-lg font-bold text-ink-900">Ngày nghỉ</h3>

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label class="block font-semibold text-ink-700 mb-1.5">Từ ngày</label>
            <input type="date" v-model="newTimeOff.startDate" class="w-full h-10 px-3 border border-ink-200 rounded-sm font-num" />
          </div>
          <div>
            <label class="block font-semibold text-ink-700 mb-1.5">Đến ngày</label>
            <input type="date" v-model="newTimeOff.endDate" class="w-full h-10 px-3 border border-ink-200 rounded-sm font-num" />
          </div>
          <div class="col-span-2">
            <label class="block font-semibold text-ink-700 mb-1.5">Lý do (không bắt buộc)</label>
            <input type="text" v-model="newTimeOff.reason" class="w-full h-10 px-3 border border-ink-200 rounded-sm" placeholder="Về quê, khám bệnh..." />
          </div>
        </div>
        <FhButton
          variant="secondary"
          size="sm"
          block
          :loading="savingTimeOff"
          :disabled="!newTimeOff.startDate || !newTimeOff.endDate"
          @click="handleAddTimeOff"
        >
          <Plus :size="16" /> Thêm ngày nghỉ
        </FhButton>

        <div class="space-y-2 text-sm max-h-[30vh] overflow-y-auto border-t border-ink-100 pt-3">
          <div v-if="loadingTimeOff" class="text-xs text-ink-500">Đang tải...</div>
          <div v-else-if="timeOffList.length === 0" class="text-xs text-ink-500">Chưa có ngày nghỉ nào.</div>
          <div
            v-for="t in timeOffList"
            :key="t.id"
            class="flex items-center justify-between gap-2 p-2.5 rounded-sm bg-ink-25 border border-ink-100"
          >
            <div>
              <p class="font-medium text-ink-800 font-num">
                {{ new Date(t.startAt).toLocaleDateString('vi-VN') }} – {{ new Date(t.endAt).toLocaleDateString('vi-VN') }}
              </p>
              <p v-if="t.reason" class="text-xs text-ink-500">{{ t.reason }}</p>
            </div>
            <button class="p-1.5 text-danger-600 hover:bg-danger-50 rounded-full" @click="confirmDeleteTimeOff = t">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>

        <div class="flex justify-end pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showTimeOffModal = false">Đóng</FhButton>
        </div>
      </div>
    </div>

    <FhConfirmDialog
      :open="!!confirmDeleteTimeOff"
      title="Xoá ngày nghỉ"
      consequence="Bạn có thể được xếp việc trở lại trong khoảng ngày này sau khi xoá."
      :loading="deletingTimeOff"
      @confirm="handleDeleteTimeOff"
      @cancel="confirmDeleteTimeOff = null"
    />

    <!-- Skills Modal -->
    <div
      v-if="showSkillsModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-md max-w-lg w-full p-6 shadow-xl space-y-4">
        <h3 class="text-lg font-bold text-ink-900">Kỹ năng &amp; dịch vụ nhận làm</h3>
        <div v-if="loadingSkills" class="text-sm text-ink-500 py-6 text-center">Đang tải danh sách dịch vụ...</div>
        <div v-else class="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div
            v-for="service in catalogServices"
            :key="service.id"
            class="p-3 rounded-sm border border-ink-200/80 space-y-2.5"
          >
            <label class="flex items-center justify-between gap-2 font-semibold text-ink-800 text-sm">
              <span class="flex items-center gap-2">
                <input type="checkbox" v-model="skillDrafts[service.id].enabled" />
                {{ service.name }}
              </span>
              <FhButton
                size="sm"
                variant="secondary"
                :loading="savingSkillId === service.id"
                @click="handleSaveSkill(service)"
              >
                Lưu
              </FhButton>
            </label>
            <div v-if="skillDrafts[service.id].enabled" class="grid grid-cols-3 gap-2 text-xs pl-6">
              <div>
                <label class="block text-ink-500 mb-1">Giá công (VNĐ)</label>
                <input
                  type="number"
                  min="0"
                  v-model="skillDrafts[service.id].listedLaborPrice"
                  :disabled="String(service.pricingMode).toLowerCase() === 'fixed_price'"
                  class="w-full h-8 px-2 border border-ink-200 rounded-sm font-num disabled:opacity-40"
                  placeholder="Giá cố định"
                />
              </div>
              <div>
                <label class="block text-ink-500 mb-1">Bảo hành (ngày)</label>
                <input type="number" min="0" v-model="skillDrafts[service.id].typicalWarrantyDays" class="w-full h-8 px-2 border border-ink-200 rounded-sm font-num" />
              </div>
              <div>
                <label class="block text-ink-500 mb-1">Trình độ</label>
                <select v-model="skillDrafts[service.id].level" class="w-full h-8 px-1 border border-ink-200 rounded-sm">
                  <option value="BEGINNER">BEGINNER</option>
                  <option value="INTERMEDIATE">INTERMEDIATE</option>
                  <option value="ADVANCED">ADVANCED</option>
                  <option value="EXPERT">EXPERT</option>
                </select>
              </div>
            </div>

            <!-- Verification status: self-declared here only opens a review request -->
            <div v-if="myOfferings.get(service.id)" class="pl-6 text-xs space-y-1.5">
              <div class="flex items-center gap-2">
                <span
                  class="px-1.5 py-0.5 rounded font-mono uppercase font-bold"
                  :class="{
                    'bg-warning-50 text-warning-700': myOfferings.get(service.id)?.verificationStatus === 'pending',
                    'bg-success-50 text-success-700': myOfferings.get(service.id)?.verificationStatus === 'verified',
                    'bg-danger-50 text-danger-700': myOfferings.get(service.id)?.verificationStatus === 'rejected',
                  }"
                >
                  {{
                    { pending: 'Chờ FixHome duyệt', verified: 'Đã cấp chứng chỉ', rejected: 'Bị từ chối' }[
                      myOfferings.get(service.id)?.verificationStatus ?? 'pending'
                    ]
                  }}
                </span>
                <button
                  v-if="myOfferings.get(service.id)?.verificationStatus === 'rejected'"
                  class="text-danger-600 underline"
                  type="button"
                  @click="showRejectionReason(service.id)"
                >
                  Xem lý do
                </button>
              </div>
              <p v-if="rejectionReasons[service.id]" class="text-danger-700">
                {{ rejectionReasons[service.id] }}
              </p>
              <label
                v-if="myOfferings.get(service.id)?.verificationStatus !== 'verified'"
                class="inline-flex items-center gap-1.5 text-brand-700 cursor-pointer hover:underline"
              >
                <span v-if="evidenceUploadingId === service.id">Đang gửi...</span>
                <span v-else>Đính kèm tín chỉ của bạn (nếu có)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  class="hidden"
                  :disabled="evidenceUploadingId === service.id"
                  @change="handleUploadEvidence(service.id, $event)"
                />
              </label>
            </div>
          </div>
        </div>
        <p class="text-xs text-ink-500 border-t border-ink-100 pt-3">
          Bật kỹ năng mới sẽ tạo yêu cầu duyệt — bạn cần hẹn review trực tiếp với FixHome trước khi kỹ năng được cấp chứng chỉ và đưa vào nhận việc.
        </p>
        <div class="flex justify-end pt-1">
          <FhButton variant="ghost" size="sm" @click="showSkillsModal = false">Đóng</FhButton>
        </div>
      </div>
    </div>

    <!-- Location & Radius Modal -->
    <Teleport to="body">
      <div
        v-if="showLocationModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink-950/60 backdrop-blur-xs transition-opacity duration-200"
        @click.self="showLocationModal = false"
      >
        <div class="bg-white rounded-md max-w-md w-full shadow-xl flex flex-col max-h-[92vh]">
          <div class="flex items-center justify-between px-6 pt-6 shrink-0">
            <h3 class="text-lg font-bold text-ink-900">Vị trí &amp; bán kính hoạt động</h3>
            <button
              type="button"
              aria-label="Đóng"
              class="p-1.5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
              @click="showLocationModal = false"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="space-y-4 text-xs px-6 py-5 overflow-y-auto flex-1 min-h-0">
            <div class="space-y-2">
              <label class="block font-semibold text-ink-700 mb-1">Địa chỉ nhà/cửa hàng (số nhà, tên đường...) *</label>
              <div class="relative">
                <input
                  v-model="locationLine1"
                  type="text"
                  placeholder="Tìm địa chỉ, ví dụ: Số 25 Ngõ 12 Đội Cấn"
                  class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
                  @input="onLocationSearchInput"
                />
                <ul
                  v-if="locationSuggestions.length"
                  class="absolute z-10 mt-1 w-full bg-white border border-ink-200 rounded-sm shadow-lg max-h-48 overflow-auto"
                >
                  <li
                    v-for="s in locationSuggestions"
                    :key="s.placeId"
                    class="px-3 py-2 text-xs hover:bg-ink-50 cursor-pointer"
                    @click="selectLocationSuggestion(s)"
                  >
                    {{ s.description }}
                  </li>
                </ul>
              </div>
              <p v-if="locationWard || locationProvince" class="text-[11px] text-ink-500 flex items-center gap-1">
                <MapPin :size="12" class="shrink-0" />
                <span>{{ [locationWard, locationProvince].filter(Boolean).join(', ') }}</span>
              </p>
            </div>

            <div class="space-y-2">
              <p class="text-xs text-ink-600">Hoặc kéo ghim đến đúng vị trí trên bản đồ</p>
              <MapTilerMap
                ref="mapRef"
                :center="mapCenter"
                :markers="locationMarkers"
                click-to-move="picker"
                height-class="h-56"
                @marker-move="onLocationMarkerMove"
              />
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1">Bán kính hoạt động (km)</label>
              <input
                v-model.number="locationRadiusKm"
                type="number" min="1" max="100" step="1"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num"
              />
              <p class="text-[11px] text-ink-500 mt-1">Khách hàng nằm ngoài bán kính này sẽ không thấy bạn khi quét thợ.</p>
            </div>
          </div>

          <div class="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 shrink-0">
            <FhButton variant="ghost" size="sm" :disabled="savingLocation" @click="showLocationModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton variant="primary" size="sm" :loading="savingLocation" @click="handleSaveLocation">
              Lưu vị trí
            </FhButton>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
