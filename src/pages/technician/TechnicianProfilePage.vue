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
  ShieldAlert,
  ShieldQuestion,
  Check,
  Plus,
  Trash2,
  X,
  Search,
  UploadCloud,
  AlertCircle,
  Award,
  Sparkles,
  ChevronRight,
  Briefcase,
  FileCheck2,
  RefreshCw,
  Power,
  Navigation,
} from 'lucide-vue-next';
import {
  FhButton,
  FhConfirmDialog,
  FhStatusPill,
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
import {
  technicianVerificationApi,
  type MyVerification,
} from '../../api/technician-verification.api';
import { catalogApi, type ServiceItem, type ServiceCategory } from '../../api/catalog.api';

const authStore = useAuthStore();

// ----------------- State & Navigation -----------------
type TabKey = 'info' | 'services' | 'schedule' | 'location';
const activeTab = ref<TabKey>('info');

const loading = ref(true);
const loadError = ref('');
const technicianProfile = ref<TechnicianProfileView | null>(null);
const kycVerification = ref<MyVerification | null>(null);
const togglingAvailability = ref(false);
const saveFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null);

let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
  saveFeedback.value = { type, message };
  feedbackTimeout = setTimeout(() => {
    saveFeedback.value = null;
  }, 4000);
};

// ----------------- Profile Info -----------------
const fullName = ref('');
const phoneNumber = ref('');
const bio = ref('');
const yearsExperience = ref(0);
const isSavingInfo = ref(false);

const avatarUrl = ref('');
const showAvatarModal = ref(false);
const newAvatarUrl = ref('');
const savingAvatar = ref(false);

// ----------------- Lịch làm việc -----------------
const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const savingSchedule = ref(false);
const weeklyScheduleDraft = ref(
  Array.from({ length: 7 }, () => ({ enabled: false, startTime: '08:00', endTime: '18:00' })),
);

const initScheduleDraft = () => {
  const byDay = new Map(uniqueSchedule.value.map((s) => [s.dayOfWeek, s]));
  weeklyScheduleDraft.value = Array.from({ length: 7 }, (_, day) => {
    const existing = byDay.get(day);
    return existing
      ? { enabled: true, startTime: existing.startTime, endTime: existing.endTime }
      : { enabled: false, startTime: '08:00', endTime: '18:00' };
  });
};

const handleSaveSchedule = async () => {
  savingSchedule.value = true;
  try {
    const schedules = weeklyScheduleDraft.value
      .map((slot, dayOfWeek) => ({ ...slot, dayOfWeek }))
      .filter((slot) => slot.enabled)
      .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
    await technicianProfileApi.updateMySchedule(schedules);
    await loadProfile();
    showFeedback('Lịch làm việc hàng tuần đã được cập nhật thành công!');
  } catch {
    showFeedback('Không thể cập nhật lịch làm việc. Vui lòng thử lại.', 'error');
  } finally {
    savingSchedule.value = false;
  }
};

const applyMonToFriPreset = () => {
  const monStart = weeklyScheduleDraft.value[1].startTime || '08:00';
  const monEnd = weeklyScheduleDraft.value[1].endTime || '18:00';
  for (let day = 1; day <= 5; day++) {
    weeklyScheduleDraft.value[day] = {
      enabled: true,
      startTime: monStart,
      endTime: monEnd,
    };
  }
  showFeedback('Đã áp dụng giờ làm cho Thứ 2 - Thứ 6');
};

const applyAllWeekPreset = () => {
  const baseStart = weeklyScheduleDraft.value[1].startTime || '08:00';
  const baseEnd = weeklyScheduleDraft.value[1].endTime || '18:00';
  for (let day = 0; day < 7; day++) {
    weeklyScheduleDraft.value[day] = {
      enabled: true,
      startTime: baseStart,
      endTime: baseEnd,
    };
  }
  showFeedback('Đã bật nhận việc cho tất cả 7 ngày trong tuần');
};

// ----------------- Ngày nghỉ (Time Off) -----------------
const timeOffList = ref<TechnicianTimeOffView[]>([]);
const loadingTimeOff = ref(false);
const savingTimeOff = ref(false);
const newTimeOff = ref({ startDate: '', endDate: '', reason: '' });
const confirmDeleteTimeOff = ref<TechnicianTimeOffView | null>(null);
const deletingTimeOff = ref(false);

const loadTimeOff = async () => {
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
  if (!newTimeOff.value.startDate || !newTimeOff.value.endDate) {
    showFeedback('Vui lòng chọn ngày bắt đầu và kết thúc', 'error');
    return;
  }
  if (newTimeOff.value.startDate > newTimeOff.value.endDate) {
    showFeedback('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu', 'error');
    return;
  }
  savingTimeOff.value = true;
  try {
    await technicianProfileApi.createTimeOff({
      startAt: `${newTimeOff.value.startDate}T00:00:00`,
      endAt: `${newTimeOff.value.endDate}T23:59:59`,
      reason: newTimeOff.value.reason.trim() || undefined,
    });
    newTimeOff.value = { startDate: '', endDate: '', reason: '' };
    await loadTimeOff();
    showFeedback('Đã thêm khoảng thời gian nghỉ thành công!');
  } catch {
    showFeedback('Không thể thêm ngày nghỉ. Vui lòng kiểm tra lại khoảng ngày.', 'error');
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
    showFeedback('Đã xoá ngày nghỉ.');
  } catch {
    showFeedback('Không thể xoá ngày nghỉ. Vui lòng thử lại.', 'error');
  } finally {
    deletingTimeOff.value = false;
  }
};

// ----------------- Kỹ năng / Dịch vụ -----------------
const loadingSkills = ref(false);
const catalogServices = ref<ServiceItem[]>([]);
const catalogCategories = ref<ServiceCategory[]>([]);
const myOfferings = ref<Map<string, TechnicianServiceOfferingView>>(new Map());
const skillDrafts = ref<
  Record<string, { enabled: boolean; listedLaborPrice: string; typicalWarrantyDays: string; level: string }>
>({});
const savingSkillId = ref<string | null>(null);
const serviceSearchQuery = ref('');
const selectedCategoryId = ref<string>('ALL');
const selectedSkillFilter = ref<'ALL' | 'ACTIVE' | 'VERIFIED' | 'PENDING'>('ALL');

const evidenceUploadingId = ref<string | null>(null);
const rejectionReasons = ref<Record<string, string | null>>({});

const loadServicesAndOfferings = async () => {
  loadingSkills.value = true;
  try {
    const [servicesRes, categoriesRes, offerings] = await Promise.all([
      catalogApi.getServices({ limit: 100 }),
      catalogApi.getCategories().catch(() => []),
      technicianProfileApi.getMyServices(),
    ]);
    catalogServices.value = servicesRes.data;
    catalogCategories.value = categoriesRes;
    myOfferings.value = new Map(offerings.map((o) => [o.serviceId, o]));

    const drafts: typeof skillDrafts.value = {};
    for (const service of servicesRes.data) {
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

const filteredServices = computed(() => {
  let list = catalogServices.value;

  if (selectedCategoryId.value !== 'ALL') {
    list = list.filter((s) => s.categoryId === selectedCategoryId.value);
  }

  if (serviceSearchQuery.value.trim()) {
    const q = serviceSearchQuery.value.toLowerCase().trim();
    list = list.filter((s) => s.name.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q));
  }

  if (selectedSkillFilter.value === 'ACTIVE') {
    list = list.filter((s) => skillDrafts.value[s.id]?.enabled);
  } else if (selectedSkillFilter.value === 'VERIFIED') {
    list = list.filter((s) => myOfferings.value.get(s.id)?.verificationStatus === 'verified');
  } else if (selectedSkillFilter.value === 'PENDING') {
    list = list.filter((s) => myOfferings.value.get(s.id)?.verificationStatus === 'pending');
  }

  return list;
});

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
    showFeedback(`Đã lưu cấu hình dịch vụ "${service.name}"`);
  } catch {
    showFeedback(`Không thể lưu kỹ năng "${service.name}". Vui lòng thử lại.`, 'error');
  } finally {
    savingSkillId.value = null;
  }
};

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
    showFeedback('Đã tải lên hồ sơ tín chỉ thành công. Quản trị viên FixHome sẽ xem xét hồ sơ của bạn.');
    await loadServicesAndOfferings();
  } catch {
    showFeedback('Không thể gửi hồ sơ tín chỉ. Vui lòng thử lại.', 'error');
  } finally {
    evidenceUploadingId.value = null;
  }
};

const showRejectionReason = async (serviceId: string) => {
  if (rejectionReasons.value[serviceId] !== undefined) return;
  const verification = await technicianProfileApi.getSkillVerification(serviceId).catch(() => null);
  rejectionReasons.value[serviceId] = verification?.rejectionReason ?? 'Không có lý do chi tiết từ FixHome';
};

// ----------------- Vị trí & Bán kính hoạt động -----------------
const technicianAddress = ref<UserAddress | null>(null);
const savingLocation = ref(false);
const locationLine1 = ref('');
const locationWard = ref('');
const locationDistrict = ref('');
const locationProvince = ref('');
const locationLat = ref<number | ''>('');
const locationLng = ref<number | ''>('');
const locationRadiusKm = ref(10);
const mapCenter = ref({ lat: 21.0285, lng: 105.8542 });
const mapRef = ref<InstanceType<typeof MapTilerMap> | null>(null);
const locationMarkers = ref<MapMarker[]>([]);
const locationSuggestions = ref<PlaceSuggestion[]>([]);
const searchingLocation = ref(false);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let reverseDebounce: ReturnType<typeof setTimeout> | null = null;

const applyPlace = (
  lat: number,
  lng: number,
  place?: { formattedAddress?: string; description?: string; ward?: string; district?: string; province?: string },
) => {
  locationLat.value = lat;
  locationLng.value = lng;
  locationMarkers.value = [{ id: 'picker', lat, lng, draggable: true, color: '#2563eb' }];
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
  locationMarkers.value = [{ id: 'picker', lat, lng, draggable: true, color: '#2563eb' }];
  if (reverseDebounce) clearTimeout(reverseDebounce);
  reverseDebounce = setTimeout(async () => {
    try {
      const place = await geoApi.reverse(lat, lng);
      applyPlace(lat, lng, place);
    } catch {
      // Keep pin even if reverse lookup fails
    }
  }, 400);
};

const onLocationSearchInput = () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  const query = locationLine1.value.trim();
  if (query.length < 3) {
    locationSuggestions.value = [];
    return;
  }
  searchDebounce = setTimeout(async () => {
    searchingLocation.value = true;
    try {
      locationSuggestions.value = await geoApi.autocomplete(query);
    } catch {
      locationSuggestions.value = [];
    } finally {
      searchingLocation.value = false;
    }
  }, 300);
};

const selectLocationSuggestion = (suggestion: PlaceSuggestion) => {
  locationSuggestions.value = [];
  mapCenter.value = { lat: suggestion.lat, lng: suggestion.lng };
  applyPlace(suggestion.lat, suggestion.lng, suggestion);
  mapRef.value?.flyTo(suggestion.lat, suggestion.lng);
};

const syncLocationStateFromAddress = () => {
  const addr = technicianAddress.value;
  locationLine1.value = addr?.line1 ?? '';
  locationWard.value = addr?.ward ?? '';
  locationDistrict.value = addr?.district ?? '';
  locationProvince.value = addr?.province ?? '';
  locationLat.value = addr?.lat ?? '';
  locationLng.value = addr?.lng ?? '';
  locationRadiusKm.value = technicianProfile.value?.serviceRadiusKm ?? 10;
  locationMarkers.value =
    addr?.lat != null && addr?.lng != null
      ? [{ id: 'picker', lat: Number(addr.lat), lng: Number(addr.lng), draggable: true, color: '#2563eb' }]
      : [];
  mapCenter.value =
    addr?.lat != null && addr?.lng != null
      ? { lat: Number(addr.lat), lng: Number(addr.lng) }
      : { lat: 21.0285, lng: 105.8542 };
};

const handleSaveLocation = async () => {
  if (!locationLine1.value.trim() || locationLat.value === '' || locationLng.value === '') {
    showFeedback('Vui lòng tìm kiếm hoặc chọn vị trí trên bản đồ trước khi lưu.', 'error');
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
    if (technicianAddress.value) {
      await profileApi.updateAddress(technicianAddress.value.id, addressDto);
    } else {
      await profileApi.createAddress(addressDto);
    }
    await technicianProfileApi.updateMyProfile({ serviceRadiusKm: locationRadiusKm.value });
    await loadProfile();
    showFeedback('Địa chỉ hoạt động và bán kính nhận việc đã được cập nhật!');
  } catch {
    showFeedback('Không thể lưu vị trí. Vui lòng kiểm tra lại.', 'error');
  } finally {
    savingLocation.value = false;
  }
};

// ----------------- Profile Completeness Metric -----------------
const profileCompleteness = computed(() => {
  let score = 0;
  const items: { label: string; done: boolean; targetTab: TabKey }[] = [];

  // 1. Avatar
  const hasAvatar = Boolean(avatarUrl.value);
  if (hasAvatar) score += 15;
  items.push({ label: 'Ảnh đại diện thợ chuyên nghiệp', done: hasAvatar, targetTab: 'info' });

  // 2. Personal contact & bio
  const hasBio = Boolean(technicianProfile.value?.bio && technicianProfile.value.bio.trim().length > 10);
  const hasPhone = Boolean(authStore.user?.phoneNumber);
  const hasInfo = hasBio && hasPhone;
  if (hasInfo) score += 20;
  items.push({ label: 'Số điện thoại & giới thiệu kinh nghiệm', done: hasInfo, targetTab: 'info' });

  // 3. KYC Status
  const isKycVerified = kycVerification.value?.status === 'VERIFIED';
  if (isKycVerified) score += 25;
  items.push({ label: 'Xác minh danh tính (CCCD & Video)', done: isKycVerified, targetTab: 'info' });

  // 4. Skills
  const activeSkillsCount = technicianProfile.value?.skills.length ?? 0;
  const hasSkills = activeSkillsCount > 0;
  if (hasSkills) score += 20;
  items.push({ label: 'Kỹ năng & dịch vụ sửa chữa', done: hasSkills, targetTab: 'services' });

  // 5. Working schedule
  const hasSchedule = uniqueSchedule.value.length > 0;
  if (hasSchedule) score += 10;
  items.push({ label: 'Lịch nhận việc hàng tuần', done: hasSchedule, targetTab: 'schedule' });

  // 6. Location & Radius
  const hasLocation = Boolean(technicianAddress.value?.lat && technicianAddress.value?.lng);
  if (hasLocation) score += 10;
  items.push({ label: 'Địa chỉ hoạt động & bán kính', done: hasLocation, targetTab: 'location' });

  return {
    score: Math.min(score, 100),
    items,
  };
});

// ----------------- Lifecycle & Loaders -----------------
const uniqueSchedule = computed(() => {
  const seen = new Map<number, { dayOfWeek: number; startTime: string; endTime: string }>();
  for (const s of technicianProfile.value?.schedules ?? []) {
    if (!seen.has(s.dayOfWeek)) seen.set(s.dayOfWeek, s);
  }
  return [...seen.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
});

const loadProfile = async () => {
  try {
    const [profile, addresses, kyc] = await Promise.all([
      technicianProfileApi.getMyProfile(),
      profileApi.getAddresses().catch(() => []),
      technicianVerificationApi.getMyVerification().catch(() => null),
    ]);
    technicianProfile.value = profile;
    technicianAddress.value = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
    kycVerification.value = kyc;

    fullName.value = authStore.user?.fullName || '';
    phoneNumber.value = authStore.user?.phoneNumber || '';
    bio.value = profile.bio || '';
    yearsExperience.value = profile.yearsExperience || 0;
    avatarUrl.value = authStore.user?.avatarUrl ?? '';

    initScheduleDraft();
    syncLocationStateFromAddress();
  } catch {
    loadError.value = 'Không thể tải hồ sơ kỹ thuật viên. Vui lòng kiểm tra kết nối mạng và thử lại.';
  }
};

onMounted(async () => {
  loading.value = true;
  await loadProfile();
  await Promise.all([loadServicesAndOfferings(), loadTimeOff()]);
  loading.value = false;
});

// ----------------- Availability & Actions -----------------
const toggleAvailability = async () => {
  if (!technicianProfile.value || togglingAvailability.value) return;
  const next = !technicianProfile.value.isAvailable;
  togglingAvailability.value = true;
  try {
    technicianProfile.value = await technicianProfileApi.updateMyProfile({ isAvailable: next });
    showFeedback(
      next
        ? 'Bạn đang BẬT nhận đơn. Khách hàng trong khu vực có thể tìm thấy bạn!'
        : 'Đã chuyển sang trạng thái TẠM NGHỈ. Hệ thống sẽ không điều phối đơn mới.',
    );
  } catch {
    showFeedback('Không thể cập nhật trạng thái nhận việc. Vui lòng thử lại.', 'error');
  } finally {
    togglingAvailability.value = false;
  }
};

const handleSaveProfileInfo = async () => {
  isSavingInfo.value = true;
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
    await authStore.fetchProfile();
    showFeedback('Thông tin cá nhân đã được lưu thành công!');
  } catch {
    showFeedback('Không thể cập nhật hồ sơ cá nhân. Vui lòng thử lại.', 'error');
  } finally {
    isSavingInfo.value = false;
  }
};

const openAvatarModal = () => {
  newAvatarUrl.value = avatarUrl.value;
  showAvatarModal.value = true;
};

const handleSaveAvatar = async () => {
  savingAvatar.value = true;
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
    showAvatarModal.value = false;
    showFeedback('Đã cập nhật ảnh đại diện mới.');
  } catch {
    showFeedback('Không thể cập nhật ảnh đại diện. Vui lòng thử lại.', 'error');
  } finally {
    savingAvatar.value = false;
  }
};
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6 pb-16">
    <!-- Toast Feedback Notification -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="saveFeedback"
        class="fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border text-sm font-semibold backdrop-blur-md"
        :class="
          saveFeedback.type === 'success'
            ? 'bg-emerald-900/90 text-white border-emerald-500/50'
            : 'bg-rose-900/90 text-white border-rose-500/50'
        "
        role="alert"
      >
        <CheckCircle2 v-if="saveFeedback.type === 'success'" :size="18" class="text-emerald-400 shrink-0" />
        <AlertCircle v-else :size="18" class="text-rose-400 shrink-0" />
        <span>{{ saveFeedback.message }}</span>
      </div>
    </Transition>

    <!-- Loading Skeleton State -->
    <div v-if="loading" class="space-y-6 animate-pulse">
      <div class="h-64 rounded-3xl bg-ink-200/70"></div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="h-28 rounded-2xl bg-ink-100"></div>
        <div class="h-28 rounded-2xl bg-ink-100"></div>
        <div class="h-28 rounded-2xl bg-ink-100"></div>
        <div class="h-28 rounded-2xl bg-ink-100"></div>
      </div>
      <div class="h-96 rounded-2xl bg-ink-100"></div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="loadError"
      class="p-6 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 flex items-center justify-between gap-4"
    >
      <div class="flex items-center gap-3">
        <AlertCircle :size="24" class="text-rose-600 shrink-0" />
        <div>
          <h3 class="font-bold text-base">Đã xảy ra lỗi khi tải hồ sơ</h3>
          <p class="text-sm text-rose-700 mt-0.5">{{ loadError }}</p>
        </div>
      </div>
      <FhButton variant="primary" size="sm" @click="loadProfile">
        <RefreshCw :size="15" /> Thử lại
      </FhButton>
    </div>

    <template v-else-if="technicianProfile">
      <!-- 1. EXECUTIVE HERO BANNER: Identity, Availability & Quick Status -->
      <div
        class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-brand-950 to-brand-900 text-white p-6 sm:p-8 shadow-xl border border-white/10"
      >
        <!-- Background Ambient Glow & Patterns -->
        <div
          class="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500/15 blur-3xl pointer-events-none"
        ></div>
        <div
          class="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"
        ></div>

        <div class="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <!-- Left: Avatar + Identity + Key Chips -->
          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <!-- Avatar with Camera Button & Online Pulse Ring -->
            <div class="relative w-28 h-28 shrink-0">
              <div
                class="w-full h-full rounded-2xl border-2 shadow-lg overflow-hidden flex items-center justify-center transition-transform hover:scale-105"
                :class="
                  technicianProfile.isAvailable
                    ? 'border-emerald-400/80 bg-brand-900 text-brand-200 ring-4 ring-emerald-500/20'
                    : 'border-ink-600 bg-ink-800 text-ink-300 ring-4 ring-ink-700/20'
                "
              >
                <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="Avatar" />
                <span v-else class="text-4xl font-extrabold font-num">
                  {{ authStore.user?.fullName?.charAt(0) ?? 'T' }}
                </span>
              </div>

              <!-- Edit Avatar Button -->
              <button
                type="button"
                @click="openAvatarModal"
                class="absolute -bottom-1 -right-1 w-9 h-9 rounded-xl bg-brand-600 hover:bg-brand-500 text-white shadow-md flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer border border-white/30"
                title="Thay đổi ảnh đại diện"
              >
                <Camera :size="16" />
              </button>
            </div>

            <!-- Identity Information -->
            <div class="text-center sm:text-left space-y-2">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h1 class="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
                </h1>

                <!-- KYC Badge -->
                <div
                  v-if="kycVerification?.status === 'VERIFIED'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold"
                  title="Hồ sơ danh tính CCCD đã được FixHome xác thực"
                >
                  <ShieldCheck :size="14" class="text-emerald-400" />
                  <span>Đã định danh CCCD</span>
                </div>
                <div
                  v-else-if="kycVerification?.status === 'PENDING'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold"
                  title="CCCD đang chờ Admin FixHome phê duyệt"
                >
                  <ShieldQuestion :size="14" class="text-amber-400" />
                  <span>Chờ duyệt CCCD</span>
                </div>
                <router-link
                  v-else
                  to="/tech/kyc"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                >
                  <ShieldAlert :size="14" class="text-rose-400" />
                  <span>Chưa xác minh KYC &rarr;</span>
                </router-link>
              </div>

              <!-- Subtitle & Meta -->
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs font-medium text-ink-300">
                <span class="flex items-center gap-1.5">
                  <Briefcase :size="14" class="text-brand-400" />
                  {{ technicianProfile.yearsExperience }} năm kinh nghiệm thực tế
                </span>
                <span class="hidden sm:inline text-ink-600">•</span>
                <span class="flex items-center gap-1.5">
                  <Star :size="14" class="text-amber-400 fill-amber-400" />
                  <strong class="text-white">{{ technicianProfile.averageRating }}</strong> ({{ technicianProfile.ratingCount }} đánh giá)
                </span>
                <span class="hidden sm:inline text-ink-600">•</span>
                <span class="flex items-center gap-1.5">
                  <Award :size="14" class="text-cyan-400" />
                  Độ tin cậy: <strong class="text-white">{{ technicianProfile.reliabilityScore }}%</strong>
                </span>
              </div>

              <!-- Location Quick Badge -->
              <p class="text-xs text-ink-300/90 flex items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                <MapPin :size="13" class="text-rose-400 shrink-0" />
                <span v-if="technicianAddress">
                  {{ technicianAddress.line1 }}, {{ [technicianAddress.ward, technicianAddress.district].filter(Boolean).join(', ') }}
                  (bán kính {{ technicianProfile.serviceRadiusKm }} km)
                </span>
                <span v-else class="text-amber-300">Chưa cài đặt địa chỉ nhận đơn</span>
              </p>
            </div>
          </div>

          <!-- Right: Availability Master Switch & Quick Action -->
          <div class="flex flex-col items-center lg:items-end gap-3 shrink-0 pt-2 lg:pt-0">
            <div class="text-xs font-bold uppercase tracking-wider text-ink-400">
              Trạng thái tiếp nhận việc:
            </div>

            <!-- Big Availability Toggle Button -->
            <button
              type="button"
              :disabled="togglingAvailability"
              @click="toggleAvailability"
              class="group relative inline-flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-sm shadow-lg transition-all duration-300 hover:scale-102 active:scale-98 cursor-pointer disabled:opacity-60 border"
              :class="
                technicianProfile.isAvailable
                  ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-400/40 ring-4 ring-emerald-500/20'
                  : 'bg-ink-800 hover:bg-ink-700 text-ink-300 border-ink-600 ring-4 ring-ink-700/20'
              "
            >
              <span
                class="w-3.5 h-3.5 rounded-full transition-transform group-hover:scale-110 flex items-center justify-center"
                :class="technicianProfile.isAvailable ? 'bg-white shadow-xs' : 'bg-ink-500'"
              >
                <Power :size="10" :class="technicianProfile.isAvailable ? 'text-emerald-600' : 'text-ink-900'" />
              </span>
              <span>
                {{ technicianProfile.isAvailable ? 'Đang sẵn sàng nhận việc' : 'Tạm dừng nhận việc' }}
              </span>
            </button>

            <!-- Completeness Mini Bar -->
            <div class="w-full sm:w-60 bg-white/10 rounded-xl p-2.5 border border-white/10 text-xs space-y-1.5">
              <div class="flex items-center justify-between font-semibold">
                <span class="text-ink-300 flex items-center gap-1">
                  <Sparkles :size="13" class="text-brand-300" />
                  Độ hoàn thiện hồ sơ
                </span>
                <span class="font-num font-bold text-emerald-300">{{ profileCompleteness.score }}%</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="profileCompleteness.score >= 80 ? 'bg-emerald-400' : profileCompleteness.score >= 50 ? 'bg-amber-400' : 'bg-rose-400'"
                  :style="{ width: `${profileCompleteness.score}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. METRICS OVERVIEW CARDS (Desktop 4-column KPI strip) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- KPI 1: Đánh giá -->
        <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs hover:border-brand-300 transition-all flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
            <Star :size="24" class="fill-amber-500 text-amber-500" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase text-ink-500">Đánh giá khách hàng</div>
            <div class="flex items-baseline gap-1.5 mt-0.5">
              <span class="text-2xl font-black font-num text-ink-900">{{ technicianProfile.averageRating }}</span>
              <span class="text-xs text-ink-500 font-medium">/ 5.0 ({{ technicianProfile.ratingCount }} lượt)</span>
            </div>
          </div>
        </div>

        <!-- KPI 2: Điểm tin cậy -->
        <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs hover:border-brand-300 transition-all flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
            <ShieldCheck :size="24" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase text-ink-500">Điểm độ tin cậy</div>
            <div class="flex items-baseline gap-1.5 mt-0.5">
              <span class="text-2xl font-black font-num text-emerald-700">{{ technicianProfile.reliabilityScore }}%</span>
              <span class="text-xs font-semibold text-emerald-600">Chuẩn nhận việc</span>
            </div>
          </div>
        </div>

        <!-- KPI 3: Dịch vụ đảm nhận -->
        <div
          class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs hover:border-brand-300 transition-all flex items-center gap-4 cursor-pointer"
          @click="activeTab = 'services'"
        >
          <div class="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-200">
            <FileCheck2 :size="24" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase text-ink-500">Dịch vụ nhận làm</div>
            <div class="flex items-baseline gap-1.5 mt-0.5">
              <span class="text-2xl font-black font-num text-ink-900">{{ technicianProfile.skills.length }}</span>
              <span class="text-xs text-brand-600 font-bold hover:underline">Quản lý giá &rarr;</span>
            </div>
          </div>
        </div>

        <!-- KPI 4: Bán kính phủ sóng -->
        <div
          class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs hover:border-brand-300 transition-all flex items-center gap-4 cursor-pointer"
          @click="activeTab = 'location'"
        >
          <div class="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 border border-violet-200">
            <Navigation :size="24" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase text-ink-500">Bán kính quét đơn</div>
            <div class="flex items-baseline gap-1.5 mt-0.5">
              <span class="text-2xl font-black font-num text-violet-700">{{ technicianProfile.serviceRadiusKm }} km</span>
              <span class="text-xs text-violet-600 font-bold hover:underline">Xem bản đồ &rarr;</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. DESKTOP TAB NAVIGATION (Sticky-friendly, clear segmentation) -->
      <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-1.5 flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          class="flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          :class="
            activeTab === 'info'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100/70'
          "
          @click="activeTab = 'info'"
        >
          <Briefcase :size="16" />
          <span>Hồ sơ cá nhân &amp; KYC</span>
        </button>

        <button
          type="button"
          class="flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer relative"
          :class="
            activeTab === 'services'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100/70'
          "
          @click="activeTab = 'services'"
        >
          <FileCheck2 :size="16" />
          <span>Kỹ năng &amp; Đơn giá công</span>
          <span
            v-if="technicianProfile.skills.length > 0"
            class="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-num font-bold"
            :class="activeTab === 'services' ? 'bg-white text-brand-700' : 'bg-brand-100 text-brand-700'"
          >
            {{ technicianProfile.skills.length }}
          </span>
        </button>

        <button
          type="button"
          class="flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          :class="
            activeTab === 'schedule'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100/70'
          "
          @click="activeTab = 'schedule'"
        >
          <Calendar :size="16" />
          <span>Thời gian &amp; Lịch nghỉ</span>
        </button>

        <button
          type="button"
          class="flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          :class="
            activeTab === 'location'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100/70'
          "
          @click="activeTab = 'location'"
        >
          <MapPin :size="16" />
          <span>Khu vực &amp; Bản đồ quét</span>
        </button>
      </div>

      <!-- 4. TAB CONTENTS -->

      <!-- TAB 1: THÔNG TIN CÁ NHÂN & KYC -->
      <div v-if="activeTab === 'info'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Form thông tin cá nhân (2 cols) -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-6 space-y-6">
            <div class="flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <h2 class="text-lg font-bold text-ink-900">Thông tin hiển thị cho khách hàng</h2>
                <p class="text-xs text-ink-500 mt-0.5">Khách hàng sẽ thấy họ tên, lời giới thiệu và kinh nghiệm của bạn khi book lịch.</p>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <!-- Họ và tên -->
              <div>
                <label class="block font-semibold text-ink-800 mb-1.5">Họ và tên thợ *</label>
                <input
                  v-model="fullName"
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn Hoàng"
                  class="w-full h-10 px-3.5 bg-ink-25 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:border-brand-600 transition-colors"
                />
              </div>

              <!-- Số điện thoại -->
              <div>
                <label class="block font-semibold text-ink-800 mb-1.5">Số điện thoại liên hệ *</label>
                <div class="relative">
                  <input
                    v-model="phoneNumber"
                    type="text"
                    placeholder="0912 345 678"
                    class="w-full h-10 pl-9 pr-3.5 bg-ink-25 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:border-brand-600 font-num transition-colors"
                  />
                  <Phone :size="16" class="absolute left-3 top-3 text-ink-400 pointer-events-none" />
                </div>
              </div>

              <!-- Email (Readonly) -->
              <div>
                <label class="block font-semibold text-ink-800 mb-1.5">Địa chỉ Email tài khoản</label>
                <div class="relative">
                  <input
                    :value="authStore.user?.email"
                    type="email"
                    readonly
                    disabled
                    class="w-full h-10 pl-9 pr-3.5 bg-ink-100/70 border border-ink-200 rounded-xl text-ink-600 cursor-not-allowed text-xs font-mono"
                  />
                  <Mail :size="16" class="absolute left-3 top-3 text-ink-400 pointer-events-none" />
                </div>
                <p class="text-[11px] text-ink-400 mt-1">Email được đồng bộ cùng tài khoản đăng nhập.</p>
              </div>

              <!-- Số năm kinh nghiệm -->
              <div>
                <label class="block font-semibold text-ink-800 mb-1.5">Kinh nghiệm trong nghề (năm) *</label>
                <input
                  v-model.number="yearsExperience"
                  type="number"
                  min="0"
                  max="60"
                  class="w-full h-10 px-3.5 bg-ink-25 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:border-brand-600 font-num transition-colors"
                />
              </div>

              <!-- Lời giới thiệu / Bio -->
              <div class="sm:col-span-2">
                <label class="block font-semibold text-ink-800 mb-1.5">Lời giới thiệu chuyên môn &amp; cam kết dịch vụ</label>
                <textarea
                  v-model="bio"
                  rows="4"
                  placeholder="Ví dụ: Tôi có hơn 8 năm kinh nghiệm chuyên sâu về điện lạnh tử lạnh, máy giặt, điều hoà các hãng Panasonic, Daikin, LG. Cam kết đúng hẹn, chẩn đoán đúng bệnh, báo đúng giá và bảo hành dài hạn."
                  class="w-full p-3.5 bg-ink-25 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:border-brand-600 leading-relaxed transition-colors text-sm"
                ></textarea>
                <p class="text-[11px] text-ink-500 mt-1">Lời giới thiệu chân thành và rõ ràng giúp khách hàng tin tưởng và chọn bạn nhiều hơn 40%.</p>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center justify-end gap-3 pt-4 border-t border-ink-100">
              <FhButton variant="primary" size="md" :loading="isSavingInfo" @click="handleSaveProfileInfo">
                <Check :size="16" /> Lưu thay đổi hồ sơ
              </FhButton>
            </div>
          </div>
        </div>

        <!-- Right: Trạng thái KYC & Checklist chất lượng (1 col) -->
        <div class="space-y-6">
          <!-- Card KYC Status -->
          <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-6 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-ink-900 text-base">Xác minh danh tính (KYC)</h3>
              <FhStatusPill
                :status="
                  kycVerification?.status === 'VERIFIED'
                    ? 'COMPLETED'
                    : kycVerification?.status === 'PENDING'
                      ? 'PENDING'
                      : 'FAILED'
                "
                :label="
                  kycVerification?.status === 'VERIFIED'
                    ? 'Đã duyệt'
                    : kycVerification?.status === 'PENDING'
                      ? 'Chờ duyệt'
                      : 'Chưa đạt'
                "
              />
            </div>

            <!-- KYC Details Box -->
            <div
              v-if="kycVerification?.status === 'VERIFIED'"
              class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-800"
            >
              <div class="flex items-center gap-2 font-bold text-emerald-900">
                <ShieldCheck :size="18" class="text-emerald-600" />
                Hồ sơ định danh đã được chứng thực
              </div>
              <p>Bạn đã hoàn tất đối soát CCCD 2 mặt và video nhận diện khuôn mặt FPT.AI. Tài khoản có độ tin cậy tuyệt đối.</p>
              <router-link
                to="/tech/kyc"
                class="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-900 underline pt-1"
              >
                Xem chi tiết hồ sơ KYC &rarr;
              </router-link>
            </div>

            <div
              v-else-if="kycVerification?.status === 'PENDING'"
              class="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-xs text-amber-800"
            >
              <div class="flex items-center gap-2 font-bold text-amber-900">
                <Clock :size="18" class="text-amber-600" />
                Hồ sơ đang chờ phê duyệt
              </div>
              <p>Quản trị viên FixHome đang đối chiếu CCCD và video khuôn mặt của bạn. Dự kiến hoàn tất trong 24 giờ.</p>
              <router-link
                to="/tech/kyc"
                class="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 underline pt-1"
              >
                Kiểm tra tiến trình &rarr;
              </router-link>
            </div>

            <div
              v-else-if="kycVerification?.status === 'REJECTED'"
              class="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2 text-xs text-rose-800"
            >
              <div class="flex items-center gap-2 font-bold text-rose-900">
                <AlertCircle :size="18" class="text-rose-600" />
                Hồ sơ bị từ chối phê duyệt
              </div>
              <p v-if="kycVerification.rejectionReason" class="font-medium text-rose-700">
                Lý do: {{ kycVerification.rejectionReason }}
              </p>
              <router-link
                to="/tech/kyc"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-colors mt-2"
              >
                Nộp lại hồ sơ CCCD ngay
              </router-link>
            </div>

            <div v-else class="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-2 text-xs text-ink-700">
              <div class="flex items-center gap-2 font-bold text-ink-900">
                <ShieldAlert :size="18" class="text-amber-600" />
                Chưa gửi hồ sơ xác minh CCCD
              </div>
              <p>Để nhận các đơn sửa chữa giá trị cao và hiển thị huy hiệu xác thực, hãy chụp CCCD và quay video xác minh.</p>
              <router-link
                to="/tech/kyc"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 transition-colors mt-1"
              >
                Xác thực ngay tại đây &rarr;
              </router-link>
            </div>
          </div>

          <!-- Quality Checklist -->
          <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-6 space-y-4">
            <h3 class="font-bold text-ink-900 text-base">Checklist hoàn thiện hồ sơ</h3>
            <div class="space-y-3">
              <div
                v-for="(item, idx) in profileCompleteness.items"
                :key="idx"
                class="flex items-center justify-between gap-3 text-xs p-2.5 rounded-xl border transition-colors cursor-pointer"
                :class="item.done ? 'bg-emerald-50/50 border-emerald-200 text-ink-800' : 'bg-ink-50 border-ink-200 text-ink-600 hover:border-brand-400'"
                @click="activeTab = item.targetTab"
              >
                <div class="flex items-center gap-2">
                  <CheckCircle2 v-if="item.done" :size="16" class="text-emerald-600 shrink-0" />
                  <div v-else class="w-4 h-4 rounded-full border border-ink-400 shrink-0"></div>
                  <span :class="{ 'font-semibold text-ink-900': item.done }">{{ item.label }}</span>
                </div>
                <ChevronRight :size="14" class="text-ink-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: KỸ NĂNG & BẢNG GIÁ CÔNG (SERVICES & PRICING) -->
      <div v-if="activeTab === 'services'" class="space-y-6">
        <!-- Control Strip: Search, Categories, Status filter -->
        <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 space-y-4">
          <div class="flex flex-col md:flex-row items-center justify-between gap-4">
            <!-- Search bar -->
            <div class="relative w-full md:w-96">
              <input
                v-model="serviceSearchQuery"
                type="text"
                placeholder="Tìm kiếm dịch vụ (ví dụ: máy lạnh, điện nước, rò rỉ...)"
                class="w-full h-10 pl-10 pr-4 bg-ink-25 border border-ink-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-brand-600 transition-colors"
              />
              <Search :size="16" class="absolute left-3.5 top-3 text-ink-400 pointer-events-none" />
            </div>

            <!-- Filters -->
            <div class="flex items-center gap-3 w-full md:w-auto">
              <!-- Category select -->
              <select
                v-model="selectedCategoryId"
                class="h-10 px-3 bg-ink-25 border border-ink-200 rounded-xl text-xs font-semibold text-ink-700 focus:bg-white focus:outline-none focus:border-brand-600"
              >
                <option value="ALL">Tất cả chuyên mục</option>
                <option v-for="cat in catalogCategories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>

              <!-- Status select -->
              <select
                v-model="selectedSkillFilter"
                class="h-10 px-3 bg-ink-25 border border-ink-200 rounded-xl text-xs font-semibold text-ink-700 focus:bg-white focus:outline-none focus:border-brand-600"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang bật nhận làm</option>
                <option value="VERIFIED">Đã cấp chứng chỉ</option>
                <option value="PENDING">Chờ FixHome duyệt</option>
              </select>
            </div>
          </div>

          <!-- Helper Banner -->
          <div class="flex items-start gap-3 p-3.5 rounded-xl bg-brand-50 border border-brand-200 text-xs text-brand-800">
            <Sparkles :size="18" class="text-brand-600 shrink-0 mt-0.5" />
            <div>
              <p class="font-semibold">Quy định nhận đơn chuyên môn FixHome:</p>
              <p class="text-ink-600 mt-0.5">
                Khi bật nhận dịch vụ, bạn có thể thiết lập giá công dự kiến và cam kết bảo hành. Đối với các kỹ năng đòi hỏi chứng chỉ, hãy đính kèm bằng nghề/chứng nhận đào tạo để chuyên viên kiểm duyệt và ưu tiên điều phối đơn cao cấp.
              </p>
            </div>
          </div>
        </div>

        <!-- Services List -->
        <div v-if="loadingSkills" class="py-16 text-center text-ink-400 text-sm">
          Đang tải danh mục dịch vụ...
        </div>

        <div v-else-if="filteredServices.length === 0" class="py-16 text-center bg-white rounded-2xl border border-ink-200 text-ink-500 text-sm space-y-2">
          <FileCheck2 :size="32" class="mx-auto text-ink-400" />
          <p class="font-semibold">Không tìm thấy dịch vụ nào phù hợp</p>
          <p class="text-xs text-ink-400">Hãy thử đổi từ khoá tìm kiếm hoặc chọn chuyên mục khác.</p>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="service in filteredServices"
            :key="service.id"
            class="bg-white rounded-2xl border transition-all p-5 shadow-xs"
            :class="
              skillDrafts[service.id]?.enabled
                ? 'border-brand-300 ring-2 ring-brand-500/10'
                : 'border-ink-200/80 hover:border-ink-300'
            "
          >
            <!-- Card Header: Switch + Name + Pricing Mode + Status Badge -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ink-100">
              <div class="flex items-start sm:items-center gap-3">
                <!-- Master Toggle Switch for this service -->
                <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5 sm:mt-0">
                  <input
                    type="checkbox"
                    v-model="skillDrafts[service.id].enabled"
                    class="sr-only peer"
                  />
                  <div
                    class="w-11 h-6 bg-ink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"
                  ></div>
                </label>

                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-bold text-ink-900 text-base">{{ service.name }}</h3>
                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      :class="
                        String(service.pricingMode).toLowerCase() === 'fixed_price'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      "
                    >
                      {{ String(service.pricingMode).toLowerCase() === 'fixed_price' ? 'Giá cố định' : 'Giá khảo sát / Công' }}
                    </span>
                  </div>
                  <p class="text-xs text-ink-500 mt-0.5 line-clamp-1">
                    {{ service.description || service.scopeDescription || 'Dịch vụ sửa chữa kỹ thuật tiêu chuẩn' }}
                  </p>
                </div>
              </div>

              <!-- Verification status badge & Save button -->
              <div class="flex items-center gap-2 self-end sm:self-center">
                <!-- Certification Status Pill -->
                <span
                  v-if="myOfferings.get(service.id)"
                  class="px-2.5 py-1 rounded-full text-xs font-bold"
                  :class="{
                    'bg-amber-50 text-amber-700 border border-amber-200':
                      myOfferings.get(service.id)?.verificationStatus === 'pending',
                    'bg-emerald-50 text-emerald-700 border border-emerald-200':
                      myOfferings.get(service.id)?.verificationStatus === 'verified',
                    'bg-rose-50 text-rose-700 border border-rose-200':
                      myOfferings.get(service.id)?.verificationStatus === 'rejected',
                  }"
                >
                  {{
                    { pending: 'Chờ duyệt chứng chỉ', verified: 'Đã cấp chứng chỉ', rejected: 'Bị từ chối' }[
                      myOfferings.get(service.id)?.verificationStatus ?? 'pending'
                    ]
                  }}
                </span>

                <FhButton
                  size="sm"
                  variant="primary"
                  :loading="savingSkillId === service.id"
                  @click="handleSaveSkill(service)"
                >
                  <Check :size="14" /> Lưu cấu hình
                </FhButton>
              </div>
            </div>

            <!-- Parameters Grid (only when enabled) -->
            <div v-if="skillDrafts[service.id]?.enabled" class="pt-4 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <!-- Giá công niêm yết -->
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">
                    Giá công niêm yết (VNĐ)
                    <span v-if="String(service.pricingMode).toLowerCase() === 'fixed_price'" class="text-ink-400 font-normal">
                      (Cố định theo hệ thống)
                    </span>
                  </label>
                  <div class="relative">
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      v-model="skillDrafts[service.id].listedLaborPrice"
                      :disabled="String(service.pricingMode).toLowerCase() === 'fixed_price'"
                      class="w-full h-9 px-3 bg-ink-25 border border-ink-200 rounded-xl font-num disabled:opacity-50 disabled:bg-ink-100"
                      :placeholder="String(service.pricingMode).toLowerCase() === 'fixed_price' ? 'Đã cố định' : 'VD: 150000'"
                    />
                  </div>
                </div>

                <!-- Cam kết bảo hành -->
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">Cam kết bảo hành (ngày)</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    v-model="skillDrafts[service.id].typicalWarrantyDays"
                    class="w-full h-9 px-3 bg-ink-25 border border-ink-200 rounded-xl font-num"
                    placeholder="30"
                  />
                </div>

                <!-- Trình độ tay nghề -->
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">Cấp độ tay nghề của bạn</label>
                  <select
                    v-model="skillDrafts[service.id].level"
                    class="w-full h-9 px-3 bg-ink-25 border border-ink-200 rounded-xl font-semibold"
                  >
                    <option value="BEGINNER">Thợ mới (BEGINNER)</option>
                    <option value="INTERMEDIATE">Thợ lành nghề (INTERMEDIATE)</option>
                    <option value="ADVANCED">Thợ kỹ thuật cao (ADVANCED)</option>
                    <option value="EXPERT">Chuyên gia tay nghề (EXPERT)</option>
                  </select>
                </div>
              </div>

              <!-- Evidence Upload & Verification Detail -->
              <div class="p-3.5 rounded-xl bg-ink-50/70 border border-ink-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div class="flex items-center gap-2.5">
                  <Award :size="18" class="text-brand-600 shrink-0" />
                  <div>
                    <span class="font-semibold text-ink-800">Chứng chỉ hành nghề chuyên môn: </span>
                    <span class="text-ink-600">
                      {{
                        myOfferings.get(service.id)?.verificationStatus === 'verified'
                          ? 'Chứng chỉ của bạn đã được kiểm duyệt và chấp thuận.'
                          : 'Đính kèm bằng trung cấp, chứng chỉ nghề hoặc giấy chứng nhận hãng để tăng tỷ lệ nhận đơn.'
                      }}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <!-- Rejection reason button -->
                  <button
                    v-if="myOfferings.get(service.id)?.verificationStatus === 'rejected'"
                    type="button"
                    class="text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                    @click="showRejectionReason(service.id)"
                  >
                    Xem lý do từ chối
                  </button>

                  <!-- Upload file trigger -->
                  <label
                    v-if="myOfferings.get(service.id)?.verificationStatus !== 'verified'"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-brand-300 text-brand-700 font-bold hover:bg-brand-50 cursor-pointer shadow-xs transition-colors"
                  >
                    <UploadCloud :size="14" />
                    <span>{{ evidenceUploadingId === service.id ? 'Đang tải lên...' : 'Tải lên chứng chỉ' }}</span>
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

              <!-- Rejection Reason Alert if clicked -->
              <div
                v-if="rejectionReasons[service.id]"
                class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
              >
                <AlertCircle :size="16" class="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong class="font-bold">Phản hồi từ bộ phận thẩm định:</strong>
                  <p class="mt-0.5">{{ rejectionReasons[service.id] }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: THỜI GIAN & LỊCH LÀM VIỆC (SCHEDULE & TIME OFF) -->
      <div v-if="activeTab === 'schedule'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Weekly Working Schedule (2 cols) -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-6 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink-100 pb-4">
              <div>
                <h2 class="text-lg font-bold text-ink-900">Lịch làm việc cố định hàng tuần</h2>
                <p class="text-xs text-ink-500 mt-0.5">Khách hàng chỉ có thể đặt lịch hẹn vào các khung giờ bạn đã bật.</p>
              </div>

              <!-- Quick Presets -->
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  @click="applyMonToFriPreset"
                  class="px-2.5 py-1.5 rounded-lg bg-ink-100 hover:bg-ink-200 text-ink-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  T2 - T6
                </button>
                <button
                  type="button"
                  @click="applyAllWeekPreset"
                  class="px-2.5 py-1.5 rounded-lg bg-ink-100 hover:bg-ink-200 text-ink-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cả tuần (T2 - CN)
                </button>
              </div>
            </div>

            <!-- Days Grid / Rows -->
            <div class="space-y-3">
              <div
                v-for="(slot, day) in weeklyScheduleDraft"
                :key="day"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all"
                :class="
                  slot.enabled
                    ? 'bg-white border-brand-200 shadow-xs'
                    : 'bg-ink-50/60 border-ink-200/60 opacity-70'
                "
              >
                <!-- Day label + Toggle -->
                <div class="flex items-center gap-3">
                  <label class="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" v-model="slot.enabled" class="sr-only peer" />
                    <div
                      class="w-10 h-5 bg-ink-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"
                    ></div>
                  </label>
                  <div>
                    <span class="font-bold text-sm text-ink-900">{{ DAY_NAMES[day] }}</span>
                    <span
                      class="ml-2 text-[11px] font-bold px-1.5 py-0.2 rounded"
                      :class="slot.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'"
                    >
                      {{ slot.enabled ? 'Nhận việc' : 'Nghỉ' }}
                    </span>
                  </div>
                </div>

                <!-- Time Inputs -->
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-ink-500 font-medium">Từ:</span>
                  <input
                    type="time"
                    v-model="slot.startTime"
                    :disabled="!slot.enabled"
                    class="h-9 px-2.5 bg-ink-25 border border-ink-200 rounded-lg font-num font-bold text-ink-800 disabled:opacity-40"
                  />
                  <span class="text-ink-400">–</span>
                  <span class="text-ink-500 font-medium">Đến:</span>
                  <input
                    type="time"
                    v-model="slot.endTime"
                    :disabled="!slot.enabled"
                    class="h-9 px-2.5 bg-ink-25 border border-ink-200 rounded-lg font-num font-bold text-ink-800 disabled:opacity-40"
                  />
                </div>
              </div>
            </div>

            <!-- Save Schedule CTA -->
            <div class="flex justify-end pt-4 border-t border-ink-100">
              <FhButton variant="primary" size="md" :loading="savingSchedule" @click="handleSaveSchedule">
                <Check :size="16" /> Lưu lịch làm việc tuần
              </FhButton>
            </div>
          </div>
        </div>

        <!-- Time Off Management (1 col) -->
        <div class="space-y-6">
          <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-6 space-y-5">
            <div>
              <h3 class="font-bold text-ink-900 text-base">Đăng ký ngày nghỉ / Vắng mặt</h3>
              <p class="text-xs text-ink-500 mt-0.5">Hệ thống sẽ tự động khóa nhận lịch trong những khoảng ngày này.</p>
            </div>

            <!-- Add Time Off Form -->
            <div class="space-y-3.5 text-xs p-4 rounded-xl bg-ink-25 border border-ink-200">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">Từ ngày *</label>
                  <input
                    type="date"
                    v-model="newTimeOff.startDate"
                    class="w-full h-9 px-2.5 bg-white border border-ink-200 rounded-lg font-num"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-ink-700 mb-1">Đến ngày *</label>
                  <input
                    type="date"
                    v-model="newTimeOff.endDate"
                    class="w-full h-9 px-2.5 bg-white border border-ink-200 rounded-lg font-num"
                  />
                </div>
              </div>

              <div>
                <label class="block font-semibold text-ink-700 mb-1">Lý do nghỉ (tùy chọn)</label>
                <input
                  type="text"
                  v-model="newTimeOff.reason"
                  placeholder="Về quê, việc gia đình, khám bệnh..."
                  class="w-full h-9 px-3 bg-white border border-ink-200 rounded-lg text-xs"
                />
              </div>

              <FhButton
                variant="secondary"
                size="sm"
                block
                :loading="savingTimeOff"
                :disabled="!newTimeOff.startDate || !newTimeOff.endDate"
                @click="handleAddTimeOff"
              >
                <Plus :size="14" /> Thêm khoảng ngày nghỉ
              </FhButton>
            </div>

            <!-- Time Off List -->
            <div class="space-y-2.5 pt-2">
              <div class="text-xs font-bold uppercase tracking-wider text-ink-500">
                Các đợt nghỉ đã lên lịch ({{ timeOffList.length }})
              </div>

              <div v-if="loadingTimeOff" class="text-xs text-ink-400 py-3 text-center">
                Đang tải danh sách ngày nghỉ...
              </div>

              <div v-else-if="timeOffList.length === 0" class="text-xs text-ink-500 py-6 text-center border border-dashed border-ink-200 rounded-xl">
                Bạn chưa có lịch nghỉ nào.
              </div>

              <div
                v-for="t in timeOffList"
                :key="t.id"
                class="flex items-center justify-between gap-3 p-3 rounded-xl bg-ink-25 border border-ink-200 hover:border-ink-300 transition-colors"
              >
                <div class="min-w-0">
                  <p class="font-bold text-xs text-ink-900 font-num">
                    {{ new Date(t.startAt).toLocaleDateString('vi-VN') }} – {{ new Date(t.endAt).toLocaleDateString('vi-VN') }}
                  </p>
                  <p v-if="t.reason" class="text-[11px] text-ink-500 truncate mt-0.5">
                    {{ t.reason }}
                  </p>
                </div>
                <button
                  type="button"
                  class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Xoá lịch nghỉ"
                  @click="confirmDeleteTimeOff = t"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 4: KHU VỰC HOẠT ĐỘNG & BẢN ĐỒ (LOCATION & MAP) -->
      <div v-if="activeTab === 'location'" class="space-y-6">
        <div class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-6 space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink-100 pb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Địa chỉ hoạt động &amp; Bán kính quét đơn</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                FixHome dựa vào vị trí này để ghép các cuốc sửa chữa gần bạn nhất, tối ưu thời gian di chuyển.
              </p>
            </div>
            <FhButton variant="primary" size="md" :loading="savingLocation" @click="handleSaveLocation">
              <Check :size="16" /> Lưu vị trí &amp; Bán kính
            </FhButton>
          </div>

          <!-- Address Autocomplete Search & Radius Inputs -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <!-- Address input with autocomplete dropdown -->
            <div class="lg:col-span-2 space-y-2">
              <label class="block font-semibold text-xs text-ink-800">
                Địa chỉ điểm xuất phát (Số nhà, ngõ/đường, phường xã) *
              </label>
              <div class="relative">
                <input
                  v-model="locationLine1"
                  type="text"
                  placeholder="Nhập địa chỉ nhà hoặc cửa hàng (VD: 25 Ngõ 12 Đội Cấn...)"
                  class="w-full h-10 pl-10 pr-4 bg-ink-25 border border-ink-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-brand-600 transition-colors"
                  @input="onLocationSearchInput"
                />
                <MapPin :size="16" class="absolute left-3.5 top-3 text-ink-400 pointer-events-none" />

                <!-- Suggestions Dropdown -->
                <ul
                  v-if="locationSuggestions.length"
                  class="absolute z-20 mt-1 w-full bg-white border border-ink-200 rounded-xl shadow-xl max-h-56 overflow-auto divide-y divide-ink-100 text-xs"
                >
                  <li
                    v-for="s in locationSuggestions"
                    :key="s.placeId"
                    class="px-4 py-2.5 hover:bg-brand-50 hover:text-brand-700 cursor-pointer flex items-center gap-2.5 transition-colors"
                    @click="selectLocationSuggestion(s)"
                  >
                    <MapPin :size="14" class="text-brand-600 shrink-0" />
                    <span>{{ s.description }}</span>
                  </li>
                </ul>
              </div>

              <!-- Selected Address Chips -->
              <div v-if="locationWard || locationDistrict || locationProvince" class="flex flex-wrap items-center gap-2 pt-1 text-xs text-ink-600">
                <span class="font-semibold text-ink-700">Khu vực nhận diện:</span>
                <span v-if="locationWard" class="px-2 py-0.5 rounded bg-ink-100 text-ink-700 font-medium">
                  {{ locationWard }}
                </span>
                <span v-if="locationDistrict" class="px-2 py-0.5 rounded bg-ink-100 text-ink-700 font-medium">
                  {{ locationDistrict }}
                </span>
                <span v-if="locationProvince" class="px-2 py-0.5 rounded bg-ink-100 text-ink-700 font-medium">
                  {{ locationProvince }}
                </span>
              </div>
            </div>

            <!-- Service Radius Slider & Input -->
            <div class="space-y-2 p-4 rounded-xl bg-brand-50/60 border border-brand-200 text-xs">
              <div class="flex items-center justify-between font-bold text-ink-900">
                <span>Bán kính nhận việc</span>
                <span class="font-num text-brand-700 text-base">{{ locationRadiusKm }} km</span>
              </div>

              <input
                type="range"
                min="1"
                max="50"
                step="1"
                v-model.number="locationRadiusKm"
                class="w-full accent-brand-600 cursor-pointer"
              />

              <div class="flex justify-between text-[11px] text-ink-500">
                <span>1 km (Gần)</span>
                <span>25 km</span>
                <span>50 km (Rộng)</span>
              </div>
              <p class="text-[11px] text-ink-500">
                Khách hàng nằm ngoài bán kính {{ locationRadiusKm }} km sẽ không thể thấy bạn khi tìm thợ.
              </p>
            </div>
          </div>

          <!-- Embedded MapTiler Interactive Map -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-ink-600">
              <span class="font-semibold">Vị trí ghim trên bản đồ (Bạn có thể kéo thả ghim đến đúng toạ độ):</span>
              <span v-if="locationLat && locationLng" class="font-num text-ink-400">
                Toạ độ: {{ Number(locationLat).toFixed(4) }}, {{ Number(locationLng).toFixed(4) }}
              </span>
            </div>

            <div class="rounded-2xl overflow-hidden border border-ink-200 shadow-inner">
              <MapTilerMap
                ref="mapRef"
                :center="mapCenter"
                :markers="locationMarkers"
                click-to-move="picker"
                height-class="h-80 sm:h-96"
                @marker-move="onLocationMarkerMove"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Confirm Delete Time Off Dialog -->
    <FhConfirmDialog
      :open="!!confirmDeleteTimeOff"
      title="Xoá khoảng ngày nghỉ"
      consequence="Sau khi xoá, hệ thống có thể phân bổ các đơn sửa chữa trong khoảng thời gian này cho bạn."
      :loading="deletingTimeOff"
      @confirm="handleDeleteTimeOff"
      @cancel="confirmDeleteTimeOff = null"
    />

    <!-- Avatar Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showAvatarModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
        @click.self="showAvatarModal = false"
      >
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-ink-900">Cập nhật ảnh đại diện kỹ thuật viên</h3>
            <button
              type="button"
              class="p-1 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 cursor-pointer"
              @click="showAvatarModal = false"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="space-y-4 text-xs">
            <!-- Preview -->
            <div class="flex items-center justify-center py-2">
              <div class="w-24 h-24 rounded-2xl overflow-hidden border-2 border-brand-500 shadow-md bg-ink-100 flex items-center justify-center">
                <img v-if="newAvatarUrl" :src="newAvatarUrl" class="w-full h-full object-cover" alt="Preview" />
                <span v-else class="text-3xl font-bold font-num text-ink-400">
                  {{ authStore.user?.fullName?.charAt(0) ?? 'T' }}
                </span>
              </div>
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Đường dẫn ảnh đại diện (URL)</label>
              <input
                v-model="newAvatarUrl"
                type="text"
                placeholder="https://images.unsplash.com/... hoặc ảnh trực tuyến"
                class="w-full h-10 px-3.5 bg-ink-25 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:border-brand-600"
              />
              <p class="text-[11px] text-ink-500 mt-1">Dán liên kết ảnh chân dung rõ mặt, lịch sự để khách hàng an tâm lựa chọn.</p>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
            <FhButton variant="ghost" size="sm" @click="showAvatarModal = false">Huỷ bỏ</FhButton>
            <FhButton variant="primary" size="sm" :loading="savingAvatar" @click="handleSaveAvatar">
              Lưu ảnh mới
            </FhButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
