<script setup lang="ts">
import ChangePasswordCard from '../../components/account/ChangePasswordCard.vue';
import ReputationCard from '../../components/account/ReputationCard.vue';
import { ref, onMounted, computed } from 'vue';
import {
  MapPin,
  CheckCircle2,
  Camera,
  Star,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Plus,
  Trash2,
  X,
  Search,
  UploadCloud,
  AlertCircle,
  ChevronRight,
} from 'lucide-vue-next';
import {
  FhButton,
  FhConfirmDialog,
  FhSkeleton,
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
import { reviewsApi, type Review } from '../../api/reviews.api';
import { vnDateString } from '../../utils/vn-time';
import { hasRating, ratingLabel } from '../../utils/formatters';
import { userFacingError } from '../../utils/user-facing-error';

const authStore = useAuthStore();

// ----------------- State & Navigation -----------------
type TabKey = 'info' | 'services' | 'schedule' | 'location' | 'reviews';
const activeTab = ref<TabKey>('info');
const profileTabs: { key: TabKey; label: string }[] = [
  { key: 'info', label: 'Thông tin' },
  { key: 'services', label: 'Dịch vụ và giá công' },
  { key: 'schedule', label: 'Lịch làm việc' },
  { key: 'location', label: 'Khu vực nhận việc' },
  { key: 'reviews', label: 'Đánh giá' },
];

/** A checklist row either opens its tab here or, for identity, links away. */
const openChecklistItem = (item: { targetTab: TabKey; to?: string }) => {
  if (!item.to) activeTab.value = item.targetTab;
};

const loading = ref(true);
const loadError = ref('');
const technicianProfile = ref<TechnicianProfileView | null>(null);
const kycVerification = ref<MyVerification | null>(null);
const saveFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null);

// ----------------- Reviews State -----------------
const reviewsList = ref<Review[]>([]);
const loadingReviews = ref(false);
const reviewsTotal = ref(0);

const loadReviews = async () => {
  const techUserId = authStore.user?.id;
  if (!techUserId) return;
  loadingReviews.value = true;
  try {
    const res = await reviewsApi.getByTechnician(techUserId, 1, 50);
    reviewsList.value = res.data || [];
    reviewsTotal.value = res.total;
  } catch {
    reviewsList.value = [];
    reviewsTotal.value = 0;
  } finally {
    loadingReviews.value = false;
  }
};

const starDistribution = computed(() => {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const total = reviewsList.value.length;
  for (const r of reviewsList.value) {
    const value = Number(r.rating);
    if (!Number.isFinite(value) || value < 1) continue;
    const score = Math.max(1, Math.min(5, Math.round(value)));
    counts[score] = (counts[score] || 0) + 1;
  }
  return {
    counts,
    total,
    percentages: {
      5: total > 0 ? Math.round((counts[5] / total) * 100) : 0,
      4: total > 0 ? Math.round((counts[4] / total) * 100) : 0,
      3: total > 0 ? Math.round((counts[3] / total) * 100) : 0,
      2: total > 0 ? Math.round((counts[2] / total) * 100) : 0,
      1: total > 0 ? Math.round((counts[1] / total) * 100) : 0,
    },
  };
});

const parseReviewComment = (rawComment?: string | null) => {
  if (!rawComment) return { tags: [] as string[], text: '' };
  const raw = rawComment.trim();
  const match = raw.match(/^\[(.*?)\]\s*(.*)$/s);
  if (match) {
    const tags = match[1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const text = match[2]?.trim() || '';
    return { tags, text };
  }
  return { tags: [] as string[], text: raw };
};

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
    showFeedback('Đã lưu lịch làm việc.');
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể lưu lịch làm việc. Vui lòng thử lại.'), 'error');
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
  showFeedback('Đã áp dụng cho Thứ Hai đến Thứ Sáu. Bấm Lưu để giữ.');
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
  showFeedback('Đã áp dụng cho cả tuần. Bấm Lưu để giữ.');
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
    showFeedback('Vui lòng chọn ngày bắt đầu và ngày kết thúc.', 'error');
    return;
  }
  if (newTimeOff.value.startDate > newTimeOff.value.endDate) {
    showFeedback('Ngày kết thúc phải từ ngày bắt đầu trở đi.', 'error');
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
    showFeedback('Đã thêm ngày nghỉ.');
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể thêm ngày nghỉ. Vui lòng kiểm tra lại khoảng ngày.'), 'error');
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
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể xoá ngày nghỉ. Vui lòng thử lại.'), 'error');
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

/** True when the row differs from what is saved, so its save button shows. */
const isSkillDirty = (serviceId: string): boolean => {
  const draft = skillDrafts.value[serviceId];
  if (!draft) return false;
  const offering = myOfferings.value.get(serviceId);
  if (!offering) return draft.enabled;
  const savedPrice = offering.listedLaborPrice != null ? String(offering.listedLaborPrice) : '';
  const savedWarranty = offering.typicalWarrantyDays != null ? String(offering.typicalWarrantyDays) : '30';
  return (
    draft.enabled !== offering.isActive ||
    String(draft.listedLaborPrice ?? '') !== savedPrice ||
    String(draft.typicalWarrantyDays ?? '') !== savedWarranty ||
    draft.level !== (offering.level ?? 'INTERMEDIATE')
  );
};

const isFixedPrice = (service: ServiceItem) => String(service.pricingMode).toLowerCase() === 'fixed_price';

const SKILL_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt chứng chỉ',
  verified: 'Đã duyệt chứng chỉ',
  rejected: 'Chứng chỉ bị từ chối',
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
    showFeedback(`Đã lưu "${service.name}".`);
  } catch (err) {
    showFeedback(userFacingError(err, `Không thể lưu "${service.name}". Vui lòng thử lại.`), 'error');
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
    showFeedback('Đã gửi chứng chỉ. FixHome sẽ xem xét.');
    await loadServicesAndOfferings();
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể gửi chứng chỉ. Vui lòng thử lại.'), 'error');
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
    showFeedback('Vui lòng tìm địa chỉ hoặc chọn vị trí trên bản đồ.', 'error');
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
    showFeedback('Đã lưu khu vực nhận việc.');
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể lưu vị trí. Vui lòng thử lại.'), 'error');
  } finally {
    savingLocation.value = false;
  }
};

// ----------------- Profile Completeness Metric -----------------
const profileCompleteness = computed(() => {
  let score = 0;
  const items: { label: string; done: boolean; targetTab: TabKey; to?: string }[] = [];

  // 1. Avatar
  const hasAvatar = Boolean(avatarUrl.value);
  if (hasAvatar) score += 15;
  items.push({ label: 'Ảnh đại diện', done: hasAvatar, targetTab: 'info' });

  // 2. Personal contact & bio
  const hasBio = Boolean(technicianProfile.value?.bio && technicianProfile.value.bio.trim().length > 10);
  const hasPhone = Boolean(authStore.user?.phoneNumber);
  const hasInfo = hasBio && hasPhone;
  if (hasInfo) score += 20;
  items.push({ label: 'Số điện thoại và giới thiệu', done: hasInfo, targetTab: 'info' });

  // 3. KYC Status
  const isKycVerified = kycVerification.value?.status === 'VERIFIED';
  if (isKycVerified) score += 25;
  items.push({ label: 'Xác minh danh tính', done: isKycVerified, targetTab: 'info', to: '/tech/kyc' });

  // 4. Skills
  const activeSkillsCount = technicianProfile.value?.skills.length ?? 0;
  const hasSkills = activeSkillsCount > 0;
  if (hasSkills) score += 20;
  items.push({ label: 'Dịch vụ nhận làm', done: hasSkills, targetTab: 'services' });

  // 5. Working schedule
  const hasSchedule = uniqueSchedule.value.length > 0;
  if (hasSchedule) score += 10;
  items.push({ label: 'Lịch làm việc', done: hasSchedule, targetTab: 'schedule' });

  // 6. Location & Radius
  const hasLocation = Boolean(technicianAddress.value?.lat && technicianAddress.value?.lng);
  if (hasLocation) score += 10;
  items.push({ label: 'Khu vực nhận việc', done: hasLocation, targetTab: 'location' });

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
  } catch (err) {
    loadError.value = userFacingError(err, 'Không thể tải hồ sơ. Vui lòng thử lại.');
  }
};

const loadAll = async () => {
  loading.value = true;
  loadError.value = '';
  await loadProfile();
  await Promise.all([loadServicesAndOfferings(), loadTimeOff(), loadReviews()]);
  loading.value = false;
};

onMounted(loadAll);

// ----------------- Actions -----------------
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
    showFeedback('Đã lưu thay đổi.');
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể lưu hồ sơ. Vui lòng thử lại.'), 'error');
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
    showFeedback('Đã cập nhật ảnh đại diện.');
  } catch (err) {
    showFeedback(userFacingError(err, 'Không thể cập nhật ảnh đại diện. Vui lòng thử lại.'), 'error');
  } finally {
    savingAvatar.value = false;
  }
};
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6 pb-16">
    <!-- Save feedback -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="saveFeedback"
        class="fixed top-20 right-4 sm:right-6 left-4 sm:left-auto sm:max-w-sm z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium"
        :class="
          saveFeedback.type === 'success'
            ? 'bg-success-900/90 text-white border-success-500/50'
            : 'bg-danger-900/90 text-white border-danger-500/50'
        "
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 v-if="saveFeedback.type === 'success'" :size="18" class="text-success-400 shrink-0" />
        <AlertCircle v-else :size="18" class="text-danger-400 shrink-0" />
        <span class="min-w-0 text-pretty">{{ saveFeedback.message }}</span>
      </div>
    </Transition>

    <!-- Loading: same shape as the page -->
    <div v-if="loading" class="space-y-6" aria-busy="true" aria-label="Đang tải hồ sơ">
      <div class="p-5 sm:p-6 rounded-2xl bg-white border border-ink-200/80 flex items-center gap-5">
        <div class="shrink-0"><FhSkeleton width="80px" height="80px" rounded="lg" /></div>
        <div class="flex-1 space-y-3">
          <FhSkeleton width="220px" height="24px" />
          <FhSkeleton width="320px" height="16px" />
        </div>
      </div>
      <FhSkeleton height="52px" rounded="lg" />
      <div class="p-6 rounded-2xl bg-white border border-ink-200/80 space-y-5">
        <FhSkeleton width="200px" height="20px" />
        <FhSkeleton height="44px" :count="4" />
      </div>
    </div>

    <!-- Load failed -->
    <div
      v-else-if="loadError"
      class="px-4 py-3 rounded-2xl border border-danger-200 bg-danger-50 text-danger-700 flex items-center gap-3"
    >
      <AlertCircle :size="18" class="text-danger-600 shrink-0" />
      <p class="min-w-0 flex-1 text-sm font-medium">{{ loadError }}</p>
      <FhButton variant="secondary" size="sm" @click="loadAll">Thử lại</FhButton>
    </div>

    <template v-else-if="technicianProfile">
      <!-- Identity -->
      <section class="p-5 sm:p-6 rounded-2xl bg-white border border-ink-200/80 shadow-xs flex items-center gap-4 sm:gap-5">
        <div class="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0">
          <div class="w-full h-full rounded-2xl overflow-hidden border border-ink-200 bg-ink-100 text-ink-500 flex items-center justify-center">
            <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="Ảnh đại diện" />
            <span v-else class="text-2xl font-bold">{{ authStore.user?.fullName?.charAt(0) ?? 'T' }}</span>
          </div>
          <button
            type="button"
            class="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-white border border-ink-200 text-ink-700 hover:bg-ink-50 shadow-sm flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Đổi ảnh đại diện"
            title="Đổi ảnh đại diện"
            @click="openAvatarModal"
          >
            <Camera :size="16" />
          </button>
        </div>

        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 class="min-w-0 text-xl sm:text-2xl font-bold text-ink-900 tracking-tight text-balance">
              {{ authStore.user?.fullName || 'Kỹ thuật viên' }}
            </h1>
            <span
              v-if="kycVerification?.status === 'VERIFIED'"
              class="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200 text-xs font-semibold"
            >
              <ShieldCheck :size="14" /> Đã xác minh danh tính
            </span>
            <span
              v-else-if="kycVerification?.status === 'PENDING'"
              class="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-warning-50 text-warning-700 border border-warning-200 text-xs font-semibold"
            >
              <ShieldQuestion :size="14" /> Chờ duyệt danh tính
            </span>
            <span
              v-else
              class="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-200 text-xs font-semibold"
            >
              <ShieldAlert :size="14" /> Chưa xác minh danh tính
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
            <span class="whitespace-nowrap">{{ technicianProfile.yearsExperience }} năm kinh nghiệm</span>
            <span class="whitespace-nowrap inline-flex items-center gap-1">
              <Star :size="14" class="text-warning-400 fill-warning-400" />
              <template v-if="hasRating(technicianProfile.averageRating, technicianProfile.ratingCount)">
                <strong class="font-semibold text-ink-900 font-num">{{ ratingLabel(technicianProfile.averageRating, technicianProfile.ratingCount) }}</strong>
                ({{ technicianProfile.ratingCount }} đánh giá)
              </template>
              <template v-else>Chưa có đánh giá</template>
            </span>
            <span class="whitespace-nowrap">
              Độ tin cậy
              <strong class="font-semibold text-ink-900 font-num">{{ technicianProfile.reliabilityScore != null ? `${technicianProfile.reliabilityScore}%` : '—' }}</strong>
            </span>
          </div>

          <p class="text-sm text-ink-500 flex items-center gap-1.5 min-w-0">
            <MapPin :size="14" class="text-ink-400 shrink-0" />
            <span v-if="technicianAddress" class="truncate" :title="technicianAddress.line1">
              {{ technicianAddress.line1 }}
            </span>
            <span v-else class="truncate">Chưa có địa chỉ nhận việc</span>
            <span class="shrink-0 whitespace-nowrap">· {{ technicianProfile.serviceRadiusKm }} km</span>
          </p>
        </div>
      </section>

      <!-- Tabs -->
      <div class="bg-white rounded-2xl border border-ink-200 p-1.5 flex items-center gap-1 overflow-x-auto" role="tablist">
        <button
          v-for="t in profileTabs"
          :key="t.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === t.key"
          class="flex-1 shrink-0 min-w-max h-10 px-4 rounded-xl text-sm flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          :class="activeTab === t.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-100/70'"
          @click="activeTab = t.key"
        >
          <span>{{ t.label }}</span>
          <span
            v-if="t.key === 'services' && technicianProfile.skills.length > 0"
            class="px-1.5 rounded-full text-xs font-num font-semibold"
            :class="activeTab === t.key ? 'bg-white text-brand-700' : 'bg-ink-100 text-ink-600'"
          >
            {{ technicianProfile.skills.length }}
          </span>
        </button>
      </div>

      <!-- TAB: Thông tin -->
      <div v-if="activeTab === 'info'" class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div class="lg:col-span-2 space-y-6">
          <!-- Identity check status: only when something is left to do -->
          <div
            v-if="kycVerification?.status === 'REJECTED'"
            class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div class="min-w-0 flex-1 text-sm space-y-0.5">
              <p class="font-semibold">Hồ sơ xác minh danh tính bị từ chối.</p>
              <p v-if="kycVerification.rejectionReason" class="text-pretty">Lý do: {{ kycVerification.rejectionReason }}</p>
            </div>
            <router-link
              to="/tech/kyc"
              class="shrink-0 inline-flex items-center justify-center h-10 px-4 rounded-xl bg-danger-600 text-white text-sm font-semibold whitespace-nowrap hover:bg-danger-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-600 focus-visible:ring-offset-2"
            >
              Nộp lại hồ sơ
            </router-link>
          </div>
          <div
            v-else-if="kycVerification?.status === 'PENDING'"
            class="px-4 py-3 rounded-2xl bg-warning-50 border border-warning-200 text-warning-800 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <p class="min-w-0 flex-1 text-sm text-pretty">
              Hồ sơ danh tính đang chờ duyệt. Vui lòng đến trụ sở FixHome để xác minh.
            </p>
            <router-link
              to="/tech/kyc"
              class="shrink-0 inline-flex items-center h-10 px-3 rounded-xl text-sm font-semibold text-warning-800 hover:bg-warning-100 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Xem tiến trình
            </router-link>
          </div>
          <div
            v-else-if="kycVerification?.status !== 'VERIFIED'"
            class="px-4 py-3 rounded-2xl bg-warning-50 border border-warning-200 text-warning-800 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <p class="min-w-0 flex-1 text-sm text-pretty">Bạn chưa gửi hồ sơ xác minh danh tính.</p>
            <router-link
              to="/tech/kyc"
              class="shrink-0 inline-flex items-center justify-center h-10 px-4 rounded-xl bg-brand-600 text-white text-sm font-semibold whitespace-nowrap hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Xác minh ngay
            </router-link>
          </div>

          <!-- Public profile form -->
          <section class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 sm:p-6 space-y-5">
            <h2 class="text-lg font-semibold text-ink-900">Thông tin hiển thị cho khách hàng</h2>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label for="tp-full-name" class="block font-medium text-ink-700 mb-1.5">Họ và tên *</label>
                <input
                  id="tp-full-name"
                  v-model="fullName"
                  type="text"
                  autocomplete="name"
                  placeholder="VD: Nguyễn Văn Hoàng"
                  class="w-full h-11 px-3.5 bg-white border border-ink-200 rounded-xl text-[15px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div>
                <label for="tp-phone" class="block font-medium text-ink-700 mb-1.5">Số điện thoại *</label>
                <input
                  id="tp-phone"
                  v-model="phoneNumber"
                  type="tel"
                  autocomplete="tel"
                  placeholder="0912 345 678"
                  class="w-full h-11 px-3.5 bg-white border border-ink-200 rounded-xl text-[15px] font-num focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div>
                <label for="tp-email" class="block font-medium text-ink-700 mb-1.5">Email</label>
                <input
                  id="tp-email"
                  :value="authStore.user?.email"
                  type="email"
                  readonly
                  disabled
                  class="w-full h-11 px-3.5 bg-ink-100/70 border border-ink-200 rounded-xl text-[15px] text-ink-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label for="tp-years" class="block font-medium text-ink-700 mb-1.5">Số năm kinh nghiệm *</label>
                <input
                  id="tp-years"
                  v-model.number="yearsExperience"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="60"
                  class="w-full h-11 px-3.5 bg-white border border-ink-200 rounded-xl text-[15px] font-num focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div class="sm:col-span-2">
                <label for="tp-bio" class="block font-medium text-ink-700 mb-1.5">Giới thiệu</label>
                <textarea
                  id="tp-bio"
                  v-model="bio"
                  rows="4"
                  placeholder="VD: 8 năm sửa điều hoà, tủ lạnh, máy giặt. Đúng hẹn, báo đúng giá."
                  class="w-full p-3.5 bg-white border border-ink-200 rounded-xl text-[15px] leading-relaxed focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                ></textarea>
              </div>
            </div>

            <div class="flex justify-end pt-4 border-t border-ink-100">
              <FhButton variant="primary" size="md" :loading="isSavingInfo" @click="handleSaveProfileInfo">
                Lưu thay đổi
              </FhButton>
            </div>
          </section>
        </div>

        <div class="space-y-6">
          <!-- Profile completeness: one list, each row goes where it is fixed -->
          <section class="bg-white rounded-2xl border border-ink-200/80 shadow-xs overflow-hidden">
            <div class="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold text-ink-900">Hoàn thiện hồ sơ</h3>
              <span class="font-num font-semibold text-ink-900 whitespace-nowrap">{{ profileCompleteness.score }}%</span>
            </div>
            <ul class="divide-y divide-ink-100 border-t border-ink-100">
              <li v-for="item in profileCompleteness.items" :key="item.label">
                <component
                  :is="item.to ? 'router-link' : 'button'"
                  :to="item.to"
                  :type="item.to ? undefined : 'button'"
                  class="w-full min-h-12 px-5 py-2.5 flex items-center gap-3 text-left text-sm hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                  @click="openChecklistItem(item)"
                >
                  <CheckCircle2 v-if="item.done" :size="18" class="text-success-600 shrink-0" />
                  <span v-else class="w-[18px] h-[18px] rounded-full border-2 border-ink-300 shrink-0" aria-hidden="true" />
                  <span class="min-w-0 flex-1" :class="item.done ? 'text-ink-900' : 'text-ink-600'">{{ item.label }}</span>
                  <ChevronRight :size="16" class="text-ink-400 shrink-0" />
                </component>
              </li>
            </ul>
          </section>
          <ReputationCard role="technician" />
          <ChangePasswordCard />
        </div>
      </div>

      <!-- TAB: Dịch vụ và giá công -->
      <div v-if="activeTab === 'services'" class="space-y-4">
        <div class="flex flex-col md:flex-row gap-3">
          <div class="relative flex-1">
            <label for="tp-service-search" class="sr-only">Tìm dịch vụ</label>
            <input
              id="tp-service-search"
              v-model="serviceSearchQuery"
              type="search"
              placeholder="Tìm dịch vụ"
              class="w-full h-11 pl-10 pr-4 bg-white border border-ink-200 rounded-xl text-[15px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          </div>
          <div class="grid grid-cols-2 md:flex gap-3">
            <select
              v-model="selectedCategoryId"
              aria-label="Chuyên mục"
              class="h-11 px-3 bg-white border border-ink-200 rounded-xl text-sm text-ink-700 focus:outline-none focus:border-brand-600"
            >
              <option value="ALL">Tất cả chuyên mục</option>
              <option v-for="cat in catalogCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
            <select
              v-model="selectedSkillFilter"
              aria-label="Trạng thái"
              class="h-11 px-3 bg-white border border-ink-200 rounded-xl text-sm text-ink-700 focus:outline-none focus:border-brand-600"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang nhận làm</option>
              <option value="VERIFIED">Đã duyệt chứng chỉ</option>
              <option value="PENDING">Chờ duyệt chứng chỉ</option>
            </select>
          </div>
        </div>

        <div v-if="loadingSkills" class="p-5 rounded-2xl bg-white border border-ink-200/80" aria-busy="true">
          <FhSkeleton height="56px" :count="6" />
        </div>

        <div
          v-else-if="filteredServices.length === 0"
          class="py-12 px-4 text-center bg-white rounded-2xl border border-ink-200/80 text-sm text-ink-500"
        >
          Không tìm thấy dịch vụ phù hợp.
        </div>

        <ul v-else class="bg-white rounded-2xl border border-ink-200/80 shadow-xs divide-y divide-ink-100">
          <li v-for="service in filteredServices" :key="service.id" class="p-4 sm:p-5 space-y-4">
            <div class="flex items-center gap-3">
              <label class="relative inline-flex items-center cursor-pointer shrink-0 p-2 -m-2">
                <input
                  v-model="skillDrafts[service.id].enabled"
                  type="checkbox"
                  class="sr-only peer"
                  :aria-label="`Nhận làm ${service.name}`"
                />
                <span
                  class="w-11 h-6 bg-ink-200 rounded-full peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-ink-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 peer-checked:after:border-white"
                ></span>
              </label>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 class="font-semibold text-ink-900 text-[15px]">{{ service.name }}</h3>
                  <span
                    class="whitespace-nowrap px-2 py-0.5 rounded-md text-xs font-medium"
                    :class="isFixedPrice(service) ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600'"
                  >
                    {{ isFixedPrice(service) ? 'Giá cố định' : 'Giá theo khảo sát' }}
                  </span>
                  <span
                    v-if="myOfferings.get(service.id)"
                    class="whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border"
                    :class="{
                      'bg-warning-50 text-warning-700 border-warning-200': myOfferings.get(service.id)?.verificationStatus === 'pending',
                      'bg-success-50 text-success-700 border-success-200': myOfferings.get(service.id)?.verificationStatus === 'verified',
                      'bg-danger-50 text-danger-700 border-danger-200': myOfferings.get(service.id)?.verificationStatus === 'rejected',
                    }"
                  >
                    {{ SKILL_STATUS_LABELS[myOfferings.get(service.id)?.verificationStatus ?? 'pending'] }}
                  </span>
                </div>
                <p
                  v-if="service.description || service.scopeDescription"
                  class="text-sm text-ink-500 truncate"
                  :title="service.description || service.scopeDescription || undefined"
                >
                  {{ service.description || service.scopeDescription }}
                </p>
              </div>

              <FhButton
                v-if="isSkillDirty(service.id) || savingSkillId === service.id"
                size="sm"
                variant="primary"
                :loading="savingSkillId === service.id"
                @click="handleSaveSkill(service)"
              >
                Lưu
              </FhButton>
            </div>

            <div v-if="skillDrafts[service.id]?.enabled" class="sm:pl-14 space-y-3">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <label :for="`tp-price-${service.id}`" class="block font-medium text-ink-700 mb-1">Giá công (₫)</label>
                  <input
                    :id="`tp-price-${service.id}`"
                    v-model="skillDrafts[service.id].listedLaborPrice"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="10000"
                    :disabled="isFixedPrice(service)"
                    :placeholder="isFixedPrice(service) ? 'Theo giá cố định' : 'VD: 150000'"
                    class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl font-num disabled:bg-ink-100 disabled:text-ink-500 focus:outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label :for="`tp-warranty-${service.id}`" class="block font-medium text-ink-700 mb-1">Bảo hành (ngày)</label>
                  <input
                    :id="`tp-warranty-${service.id}`"
                    v-model="skillDrafts[service.id].typicalWarrantyDays"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="365"
                    placeholder="30"
                    class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl font-num focus:outline-none focus:border-brand-600"
                  />
                </div>
                <div class="col-span-2 sm:col-span-1">
                  <label :for="`tp-level-${service.id}`" class="block font-medium text-ink-700 mb-1">Tay nghề</label>
                  <select
                    :id="`tp-level-${service.id}`"
                    v-model="skillDrafts[service.id].level"
                    class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600"
                  >
                    <option value="BEGINNER">Thợ mới</option>
                    <option value="INTERMEDIATE">Thợ lành nghề</option>
                    <option value="ADVANCED">Thợ kỹ thuật cao</option>
                    <option value="EXPERT">Chuyên gia</option>
                  </select>
                </div>
              </div>

              <div
                v-if="myOfferings.get(service.id)?.verificationStatus !== 'verified'"
                class="flex flex-wrap items-center gap-2"
              >
                <label
                  class="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white border border-ink-200 text-ink-700 text-sm font-semibold hover:bg-ink-50 cursor-pointer whitespace-nowrap focus-within:ring-2 focus-within:ring-brand-600"
                >
                  <UploadCloud :size="16" />
                  <span>{{ evidenceUploadingId === service.id ? 'Đang tải lên…' : 'Tải lên chứng chỉ' }}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    class="sr-only"
                    :disabled="evidenceUploadingId === service.id"
                    @change="handleUploadEvidence(service.id, $event)"
                  />
                </label>
                <button
                  v-if="myOfferings.get(service.id)?.verificationStatus === 'rejected' && rejectionReasons[service.id] === undefined"
                  type="button"
                  class="h-10 px-3 rounded-xl text-sm font-semibold text-danger-600 hover:bg-danger-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-600"
                  @click="showRejectionReason(service.id)"
                >
                  Xem lý do từ chối
                </button>
              </div>

              <p v-if="rejectionReasons[service.id]" class="text-sm text-danger-700 text-pretty">
                Lý do từ chối: {{ rejectionReasons[service.id] }}
              </p>
            </div>
          </li>
        </ul>
      </div>

      <!-- TAB: Lịch làm việc -->
      <div v-if="activeTab === 'schedule'" class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section class="lg:col-span-2 bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 sm:p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-ink-900">Lịch làm việc hằng tuần</h2>
            <div class="flex items-center gap-2" role="group" aria-label="Áp dụng nhanh">
              <button
                type="button"
                class="h-10 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                @click="applyMonToFriPreset"
              >
                Thứ Hai – Thứ Sáu
              </button>
              <button
                type="button"
                class="h-10 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                @click="applyAllWeekPreset"
              >
                Cả tuần
              </button>
            </div>
          </div>

          <ul class="divide-y divide-ink-100 border-y border-ink-100">
            <li
              v-for="(slot, day) in weeklyScheduleDraft"
              :key="day"
              class="py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            >
              <label class="flex items-center gap-3 cursor-pointer min-h-10">
                <input v-model="slot.enabled" type="checkbox" class="sr-only peer" :aria-label="`Làm việc ${DAY_NAMES[day]}`" />
                <span
                  class="w-11 h-6 bg-ink-200 rounded-full peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 relative shrink-0 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-ink-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 peer-checked:after:border-white"
                ></span>
                <span class="w-20 text-sm font-semibold whitespace-nowrap" :class="slot.enabled ? 'text-ink-900' : 'text-ink-500'">{{ DAY_NAMES[day] }}</span>
              </label>

              <div v-if="slot.enabled" class="flex items-center gap-2 text-sm">
                <input
                  v-model="slot.startTime"
                  type="time"
                  :aria-label="`Giờ bắt đầu ${DAY_NAMES[day]}`"
                  class="h-10 px-2.5 bg-white border border-ink-200 rounded-xl font-num text-ink-900 focus:outline-none focus:border-brand-600"
                />
                <span class="text-ink-400" aria-hidden="true">–</span>
                <input
                  v-model="slot.endTime"
                  type="time"
                  :aria-label="`Giờ kết thúc ${DAY_NAMES[day]}`"
                  class="h-10 px-2.5 bg-white border border-ink-200 rounded-xl font-num text-ink-900 focus:outline-none focus:border-brand-600"
                />
              </div>
              <span v-else class="text-sm text-ink-400">Nghỉ</span>
            </li>
          </ul>

          <div class="flex justify-end">
            <FhButton variant="primary" size="md" :loading="savingSchedule" @click="handleSaveSchedule">
              Lưu lịch làm việc
            </FhButton>
          </div>
        </section>

        <section class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 sm:p-6 space-y-4">
          <h3 class="text-base font-semibold text-ink-900">Ngày nghỉ</h3>

          <div class="space-y-3 text-sm">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="tp-off-start" class="block font-medium text-ink-700 mb-1">Từ ngày</label>
                <input
                  id="tp-off-start"
                  v-model="newTimeOff.startDate"
                  type="date"
                  class="w-full h-11 px-2.5 bg-white border border-ink-200 rounded-xl font-num focus:outline-none focus:border-brand-600"
                />
              </div>
              <div>
                <label for="tp-off-end" class="block font-medium text-ink-700 mb-1">Đến ngày</label>
                <input
                  id="tp-off-end"
                  v-model="newTimeOff.endDate"
                  type="date"
                  class="w-full h-11 px-2.5 bg-white border border-ink-200 rounded-xl font-num focus:outline-none focus:border-brand-600"
                />
              </div>
            </div>
            <div>
              <label for="tp-off-reason" class="block font-medium text-ink-700 mb-1">Lý do (không bắt buộc)</label>
              <input
                id="tp-off-reason"
                v-model="newTimeOff.reason"
                type="text"
                placeholder="VD: Việc gia đình"
                class="w-full h-11 px-3 bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600"
              />
            </div>
            <FhButton
              variant="secondary"
              size="md"
              block
              :loading="savingTimeOff"
              :disabled="!newTimeOff.startDate || !newTimeOff.endDate"
              @click="handleAddTimeOff"
            >
              <Plus :size="16" /> Thêm ngày nghỉ
            </FhButton>
          </div>

          <div v-if="loadingTimeOff" aria-busy="true"><FhSkeleton height="48px" :count="2" /></div>
          <p v-else-if="timeOffList.length === 0" class="text-sm text-ink-500 pt-1">Chưa có ngày nghỉ nào.</p>
          <ul v-else class="divide-y divide-ink-100 border-t border-ink-100">
            <li v-for="t in timeOffList" :key="t.id" class="py-2.5 flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-ink-900 font-num whitespace-nowrap">
                  {{ vnDateString(t.startAt) }} – {{ vnDateString(t.endAt) }}
                </p>
                <p v-if="t.reason" class="text-sm text-ink-500 truncate">{{ t.reason }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 w-10 h-10 flex items-center justify-center text-ink-500 hover:text-danger-600 hover:bg-danger-50 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-600"
                aria-label="Xoá ngày nghỉ"
                title="Xoá ngày nghỉ"
                @click="confirmDeleteTimeOff = t"
              >
                <Trash2 :size="16" />
              </button>
            </li>
          </ul>
        </section>
      </div>

      <!-- TAB: Khu vực nhận việc -->
      <section v-if="activeTab === 'location'" class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 sm:p-6 space-y-5">
        <h2 class="text-lg font-semibold text-ink-900">Khu vực nhận việc</h2>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div class="lg:col-span-2 space-y-1.5">
            <label for="tp-location" class="block text-sm font-medium text-ink-700">Địa chỉ xuất phát *</label>
            <div class="relative">
              <input
                id="tp-location"
                v-model="locationLine1"
                type="text"
                autocomplete="off"
                placeholder="VD: 25 Ngõ 12 Đội Cấn"
                class="w-full h-11 pl-10 pr-4 bg-white border border-ink-200 rounded-xl text-[15px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                @input="onLocationSearchInput"
              />
              <MapPin :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />

              <ul
                v-if="locationSuggestions.length"
                class="absolute z-20 mt-1 w-full bg-white border border-ink-200 rounded-xl shadow-xl max-h-56 overflow-auto divide-y divide-ink-100 text-sm"
              >
                <li v-for="s in locationSuggestions" :key="s.placeId">
                  <button
                    type="button"
                    class="w-full text-left px-4 py-2.5 hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2.5 focus:outline-none focus-visible:bg-brand-50"
                    @click="selectLocationSuggestion(s)"
                  >
                    <MapPin :size="14" class="text-ink-400 shrink-0" />
                    <span>{{ s.description }}</span>
                  </button>
                </li>
              </ul>
            </div>
            <p v-if="locationWard || locationDistrict || locationProvince" class="text-sm text-ink-500">
              {{ [locationWard, locationDistrict, locationProvince].filter(Boolean).join(', ') }}
            </p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <label for="tp-radius" class="text-sm font-medium text-ink-700">Bán kính nhận việc</label>
              <span class="font-num font-semibold text-ink-900 whitespace-nowrap">{{ locationRadiusKm }} km</span>
            </div>
            <input
              id="tp-radius"
              v-model.number="locationRadiusKm"
              type="range"
              min="1"
              max="40"
              step="1"
              class="w-full h-10 accent-brand-600 cursor-pointer"
            />
            <div class="flex justify-between text-xs text-ink-400">
              <span>1 km</span>
              <span>40 km</span>
            </div>
          </div>
        </div>

        <div class="space-y-1.5">
          <p class="text-sm text-ink-500">Kéo ghim để chỉnh đúng vị trí.</p>
          <div class="rounded-2xl overflow-hidden border border-ink-200">
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

        <div class="flex justify-end pt-4 border-t border-ink-100">
          <FhButton variant="primary" size="md" :loading="savingLocation" @click="handleSaveLocation">
            Lưu khu vực
          </FhButton>
        </div>
      </section>

      <!-- TAB: Đánh giá -->
      <div v-else-if="activeTab === 'reviews'" class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section class="bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 sm:p-6 space-y-5">
          <div class="text-center space-y-1">
            <template v-if="hasRating(technicianProfile.averageRating, technicianProfile.ratingCount)">
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-5xl font-bold font-num text-ink-900">{{ ratingLabel(technicianProfile.averageRating, technicianProfile.ratingCount) }}</span>
                <span class="text-xl font-semibold text-ink-400 font-num">/5</span>
              </div>
              <div class="flex items-center justify-center gap-1" :aria-label="`${ratingLabel(technicianProfile.averageRating, technicianProfile.ratingCount)} trên 5 sao`">
                <Star
                  v-for="s in 5"
                  :key="s"
                  :size="20"
                  :class="s <= Math.round(Number(technicianProfile.averageRating)) ? 'text-warning-400 fill-warning-400' : 'text-ink-200'"
                />
              </div>
              <p class="text-sm text-ink-500">{{ technicianProfile.ratingCount }} lượt đánh giá</p>
            </template>
            <p v-else class="text-base font-semibold text-ink-500 py-4">Chưa có đánh giá</p>
          </div>

          <div class="space-y-2">
            <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="flex items-center gap-2.5 text-sm">
              <span class="w-8 font-num text-ink-700 flex items-center gap-0.5 whitespace-nowrap">
                {{ star }} <Star :size="12" class="fill-warning-400 text-warning-400" />
              </span>
              <div class="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :class="star >= 3 ? 'bg-warning-400' : 'bg-danger-400'"
                  :style="{ width: `${starDistribution.percentages[star]}%` }"
                ></div>
              </div>
              <span class="w-16 text-right font-num text-ink-500 text-xs whitespace-nowrap">
                {{ starDistribution.counts[star] }} ({{ starDistribution.percentages[star] }}%)
              </span>
            </div>
          </div>
        </section>

        <section class="lg:col-span-2 bg-white rounded-2xl border border-ink-200/80 shadow-xs p-5 sm:p-6 space-y-4">
          <h3 class="text-base font-semibold text-ink-900">
            Nhận xét <span class="font-num text-ink-500 font-normal">({{ reviewsList.length }})</span>
          </h3>

          <div v-if="loadingReviews" aria-busy="true"><FhSkeleton height="72px" :count="3" /></div>

          <p v-else-if="reviewsList.length === 0" class="py-8 text-center text-sm text-ink-500">Chưa có nhận xét nào.</p>

          <ul v-else class="divide-y divide-ink-100">
            <li v-for="r in reviewsList" :key="r.id" class="py-4 first:pt-0 last:pb-0 space-y-2">
              <div class="flex items-start gap-3">
                <div class="w-9 h-9 rounded-full bg-ink-100 text-ink-600 font-semibold text-sm flex items-center justify-center shrink-0">
                  {{ (r.customerName || 'K').charAt(0) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-3">
                    <span class="min-w-0 truncate font-semibold text-ink-900 text-sm">{{ r.customerName || 'Khách hàng FixHome' }}</span>
                    <span class="shrink-0 text-xs font-num text-ink-400 whitespace-nowrap">{{ vnDateString(r.createdAt) }}</span>
                  </div>
                  <div class="flex items-center gap-0.5 mt-0.5" :aria-label="`${r.rating} trên 5 sao`">
                    <Star
                      v-for="s in 5"
                      :key="s"
                      :size="13"
                      :class="s <= r.rating ? 'text-warning-400 fill-warning-400' : 'text-ink-200'"
                    />
                  </div>
                </div>
              </div>

              <div v-if="parseReviewComment(r.comment).tags.length > 0" class="flex flex-wrap gap-1.5 pl-12">
                <span
                  v-for="tag in parseReviewComment(r.comment).tags"
                  :key="tag"
                  class="whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700"
                >
                  {{ tag }}
                </span>
              </div>

              <p v-if="parseReviewComment(r.comment).text" class="pl-12 text-sm text-ink-800 leading-relaxed text-pretty">
                {{ parseReviewComment(r.comment).text }}
              </p>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- Confirm Delete Time Off Dialog -->
    <FhConfirmDialog
      :open="!!confirmDeleteTimeOff"
      title="Xoá ngày nghỉ?"
      consequence="Sau khi xoá, bạn có thể được giao việc trong những ngày này."
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
        @keydown.esc="!savingAvatar && (showAvatarModal = false)"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-avatar-title"
          class="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5"
        >
          <div class="flex items-center justify-between gap-3">
            <h3 id="tp-avatar-title" class="text-lg font-bold text-ink-900">Ảnh đại diện</h3>
            <button
              type="button"
              class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              aria-label="Đóng"
              @click="showAvatarModal = false"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="flex items-center gap-4">
            <div class="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border border-ink-200 bg-ink-100 flex items-center justify-center">
              <img v-if="newAvatarUrl" :src="newAvatarUrl" class="w-full h-full object-cover" alt="Xem trước ảnh đại diện" />
              <span v-else class="text-2xl font-bold text-ink-400">{{ authStore.user?.fullName?.charAt(0) ?? 'T' }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <label for="tp-avatar-url" class="block text-sm font-medium text-ink-700 mb-1.5">Liên kết ảnh</label>
              <input
                id="tp-avatar-url"
                v-model="newAvatarUrl"
                type="url"
                placeholder="https://…"
                class="w-full h-11 px-3.5 bg-white border border-ink-200 rounded-xl text-[15px] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <FhButton variant="secondary" size="md" @click="showAvatarModal = false">Huỷ</FhButton>
            <FhButton variant="primary" size="md" :loading="savingAvatar" @click="handleSaveAvatar">
              Lưu ảnh
            </FhButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
