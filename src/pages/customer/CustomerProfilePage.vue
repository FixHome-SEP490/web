<script setup lang="ts">
import { tidyAddressText } from '../../utils/address-text';
import { addressFieldError, addressLocationError, normalizeAddressText } from '../../utils/address-input';
import AvatarDialog from '../../components/account/AvatarDialog.vue';
import ChangePasswordCard from '../../components/account/ChangePasswordCard.vue';
import ReputationCard from '../../components/account/ReputationCard.vue';
import { computed, ref, onMounted, watch } from 'vue';
import {
  MapPin, Plus, Camera, X, ShieldCheck,
  LocateFixed, AlertCircle, Navigation
} from 'lucide-vue-next';
import {
  FhButton,
  FhConfirmDialog,
  FhSkeleton,
  FhEmptyState,
  MapTilerMap,
  type MapMarker,
} from '../../components';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { useAuthStore } from '../../stores/auth';
import { toast } from 'vue-sonner';
import { validateFullName, validatePhoneNumber } from '../../utils/input-validation';
import { userFacingError } from '../../utils/user-facing-error';
import { customerVerificationApi } from '../../api/customer-verification.api';
import { useCachedQuery } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { formatDayKey } from '../../utils/formatters';

const authStore = useAuthStore();

const LABEL_PRESETS = ['Nhà riêng', 'Văn phòng', 'Nhà bố mẹ', 'Căn hộ'];
const setAddressLabel = (preset: string) => {
  addressForm.value.label = preset;
  labelError.value = '';
};

// After the identity check is approved (PO 14/10/2026) the name and date of
// birth are the ones on the citizen ID card: shown with a note, not editable
// (the server refuses a change anyway).
const identityQuery = useCachedQuery({
  key: queryKeys.identity.customer,
  fetch: () => customerVerificationApi.getMine(),
  // The API sends roles in lower case ('customer'); compare without case.
  enabled: () => authStore.user?.role?.toUpperCase() === 'CUSTOMER',
});
const identityVerified = computed(() => identityQuery.data.value?.status === 'verified');
const verifiedBirthDate = computed(() => {
  const state = identityQuery.data.value;
  return state?.status === 'verified' ? state.verification?.dateOfBirth || state.profile.dateOfBirth || null : null;
});

const fullName = ref('');
const phoneNumber = ref('');
const avatarUrl = ref('');
const isSaving = ref(false);
// Shown under the form instead of a browser alert (PO 12/10/2026), with the real reason.
const profileError = ref('');

const addresses = ref<UserAddress[]>([]);
const addressesFailed = ref(false);
const loadingAddresses = ref(false);

// Modals
const showEditProfileModal = ref(false);
const showAvatarModal = ref(false);

// Address Modal
const showAddressModal = ref(false);
const editingAddressId = ref<string | null>(null);
const originalAddress = ref<UserAddress | null>(null);
const editLocationVerified = ref(false);
const addressError = ref('');
// Lỗi theo từng ô, hiện ngay dưới ô đó (lỗi 29, PO 01/11/2026).
const labelError = ref('');
const line1Error = ref('');
const locationError = ref('');
const savingAddress = ref(false);
const addressForm = ref({
  label: 'Nhà riêng',
  line1: '',
  ward: '',
  district: '',
  province: '',
  isDefault: false,
});

// Delete Confirmation
const showDeleteConfirm = ref(false);
const addressToDelete = ref<string | null>(null);
const addressLat = ref<number | ''>('');
const addressLng = ref<number | ''>('');
const mapCenter = ref({ lat: 21.0285, lng: 105.8542 }); // Hanoi, used until an address is picked
const mapRef = ref<InstanceType<typeof MapTilerMap> | null>(null);
const addressMarkers = ref<MapMarker[]>([]);
const addressSuggestions = ref<PlaceSuggestion[]>([]);
const searchingAddress = ref(false);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let addressGeoEpoch = 0;

const sameArea = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.normalize('NFC').trim().toLocaleLowerCase('vi') === b.normalize('NFC').trim().toLocaleLowerCase('vi');

const validCoordinates = (lat: number | '', lng: number | '') =>
  lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

const clearAddressFieldErrors = () => {
  labelError.value = '';
  line1Error.value = '';
  locationError.value = '';
};
watch(() => addressForm.value.label, () => { labelError.value = ''; });
watch(() => addressForm.value.line1, () => { line1Error.value = ''; });
watch([addressLat, addressLng], () => { locationError.value = ''; });

/**
 * Same rule as the API: plain address text and both coordinates. Area names come from the map
 * lookup, so a bad one is reported under the address line where the person picked it.
 */
const checkAddressFields = (opts: { location: boolean }): boolean => {
  labelError.value = addressFieldError('Tên gợi nhớ', addressForm.value.label, { max: 100 });
  line1Error.value = addressFieldError('Địa chỉ cụ thể', addressForm.value.line1, { max: 255, required: true }) ||
    addressFieldError('Phường, xã', addressForm.value.ward, { max: 100 }) ||
    addressFieldError('Quận, huyện', addressForm.value.district, { max: 100 }) ||
    addressFieldError('Tỉnh, thành phố', addressForm.value.province, { max: 100 });
  locationError.value = opts.location ? addressLocationError(addressLat.value, addressLng.value) : '';
  return !labelError.value && !line1Error.value && !locationError.value;
};

const resetAddressForm = () => {
  addressGeoEpoch++;
  if (searchDebounce) clearTimeout(searchDebounce);
  if (reverseDebounce) clearTimeout(reverseDebounce);
  searchDebounce = null;
  reverseDebounce = null;
  addressForm.value = { label: 'Nhà riêng', line1: '', ward: '', district: '', province: '', isDefault: false };
  addressLat.value = '';
  addressLng.value = '';
  addressMarkers.value = [];
  addressSuggestions.value = [];
  searchingAddress.value = false;
  searchingByCoords.value = false;
  editLocationVerified.value = false;
  addressError.value = '';
  clearAddressFieldErrors();
  originalAddress.value = null;
  editingAddressId.value = null;
  mapCenter.value = { lat: 21.0285, lng: 105.8542 };
};
const openAddAddress = () => {
  if (savingAddress.value) return;
  resetAddressForm();
  showAddressModal.value = true;
};
const openEditAddress = (addr: UserAddress) => {
  if (savingAddress.value) return;
  resetAddressForm();
  originalAddress.value = { ...addr };
  editingAddressId.value = addr.id;
  addressForm.value = {
    label: addr.label ?? '', line1: addr.line1, ward: addr.ward ?? '',
    district: addr.district, province: addr.province, isDefault: addr.isDefault,
  };
  if (addr.lat != null && addr.lng != null && validCoordinates(Number(addr.lat), Number(addr.lng))) {
    addressLat.value = Number(addr.lat);
    addressLng.value = Number(addr.lng);
    mapCenter.value = { lat: Number(addr.lat), lng: Number(addr.lng) };
    addressMarkers.value = [{ id: 'picker', lat: Number(addr.lat), lng: Number(addr.lng), draggable: true, color: '#dc2626' }];
  }
  showAddressModal.value = true;
};
const closeAddressModal = () => {
  if (savingAddress.value) return;
  showAddressModal.value = false;
  resetAddressForm();
};
const invalidateEditLocation = () => {
  addressGeoEpoch++;
  if (!editingAddressId.value) return;
  editLocationVerified.value = false;
  addressError.value = '';
};
// Admin-area fields (ward/district/province) are never typed by hand anymore — they're
// always derived from a map/search/coordinate lookup. Vietnam's post-reform addressing
// often has no district level, so we fall back to ward/province to keep the field the
// backend still requires non-empty without bothering the user about it.
const applyPlace = (lat: number, lng: number, place?: { formattedAddress?: string; description?: string; ward?: string; district?: string; province?: string }) => {
  addressLat.value = lat;
  addressLng.value = lng;
  addressMarkers.value = [{ id: 'picker', lat, lng, draggable: true, color: '#dc2626' }];
  if (place) {
    const picked = place.formattedAddress || place.description;
    addressForm.value.line1 = picked ? tidyAddressText(picked) : addressForm.value.line1;
    addressForm.value.ward = originalAddress.value ? (place.ward || '') : (place.ward || addressForm.value.ward);
    addressForm.value.district = place.district || addressForm.value.district;
    addressForm.value.province = place.province || addressForm.value.province;
    if (originalAddress.value) {
      editLocationVerified.value = Boolean((place.formattedAddress || place.description) && place.province && place.district &&
        sameArea(place.province, originalAddress.value.province) &&
        sameArea(place.district, originalAddress.value.district));
      addressError.value = editLocationVerified.value ? '' : 'Không thể đổi sang khu vực khác tại đây. Vui lòng thêm địa chỉ mới.';
    }
  }
};

let reverseDebounce: ReturnType<typeof setTimeout> | null = null;
const onMapMarkerMove = (_id: string, lat: number, lng: number) => {
  invalidateEditLocation();
  const requestEpoch = addressGeoEpoch;
  addressLat.value = lat;
  addressLng.value = lng;
  addressMarkers.value = [{ id: 'picker', lat, lng, draggable: true, color: '#dc2626' }];
  if (reverseDebounce) clearTimeout(reverseDebounce);
  reverseDebounce = setTimeout(async () => {
    try {
      const place = await geoApi.reverse(lat, lng);
      if (requestEpoch !== addressGeoEpoch || !showAddressModal.value) return;
      applyPlace(lat, lng, place);
    } catch {
      // Keep the pin where the user dropped it even if reverse lookup fails.
    }
  }, 500);
};

const onAddressSearchInput = () => {
  invalidateEditLocation();
  const requestEpoch = addressGeoEpoch;
  if (searchDebounce) clearTimeout(searchDebounce);
  const query = addressForm.value.line1.trim();
  if (query.length < 3) { addressSuggestions.value = []; return; }
  searchDebounce = setTimeout(async () => {
    searchingAddress.value = true;
    try {
      // Places near the customer's saved address come first.
      const home = addresses.value.find((a) => a.isDefault && a.lat != null && a.lng != null) ?? addresses.value.find((a) => a.lat != null && a.lng != null);
      const suggestions = await geoApi.autocomplete(query, home ? { lat: Number(home.lat), lng: Number(home.lng) } : null);
      if (requestEpoch === addressGeoEpoch && showAddressModal.value) addressSuggestions.value = suggestions;
    } catch {
      if (requestEpoch === addressGeoEpoch) addressSuggestions.value = [];
    } finally {
      searchingAddress.value = false;
    }
  }, 350);
};

const selectAddressSuggestion = (suggestion: PlaceSuggestion) => {
  invalidateEditLocation();
  addressSuggestions.value = [];
  mapCenter.value = { lat: suggestion.lat, lng: suggestion.lng };
  applyPlace(suggestion.lat, suggestion.lng, suggestion);
  mapRef.value?.flyTo(suggestion.lat, suggestion.lng);
};

const searchingByCoords = ref(false);
const searchByCoordinates = async () => {
  if (searchingByCoords.value) return;
  invalidateEditLocation();
  const requestEpoch = addressGeoEpoch;
  if (addressLat.value === '' || addressLng.value === '') {
    toast.warning('Vui lòng nhập đủ vĩ độ và kinh độ.');
    return;
  }
  const lat = Number(addressLat.value);
  const lng = Number(addressLng.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    toast.warning('Toạ độ không hợp lệ.');
    return;
  }
  searchingByCoords.value = true;
  try {
    const place = await geoApi.reverse(lat, lng);
    if (requestEpoch !== addressGeoEpoch || !showAddressModal.value) return;
    mapCenter.value = { lat, lng };
    applyPlace(lat, lng, place);
    mapRef.value?.flyTo(lat, lng);
  } catch {
    if (requestEpoch !== addressGeoEpoch || !showAddressModal.value) return;
    // Reverse geocode failed (e.g. remote water/unmapped area); still center the map on the coordinates.
    mapCenter.value = { lat, lng };
    applyPlace(lat, lng);
    mapRef.value?.flyTo(lat, lng);
    toast.warning('Đã ghim toạ độ trên bản đồ, nhưng không tra được địa chỉ tương ứng.');
  } finally {
    searchingByCoords.value = false;
  }
};

const locateAddress = () => {
  invalidateEditLocation();
  const requestEpoch = addressGeoEpoch;
  if (!navigator.geolocation) return void toast.error('Thiết bị không hỗ trợ định vị.');
  navigator.geolocation.getCurrentPosition(async position => {
    if (requestEpoch !== addressGeoEpoch || !showAddressModal.value) return;
    const { latitude, longitude } = position.coords;
    mapCenter.value = { lat: latitude, lng: longitude };
    applyPlace(latitude, longitude);
    mapRef.value?.flyTo(latitude, longitude);
    try {
      const place = await geoApi.reverse(latitude, longitude);
      if (requestEpoch !== addressGeoEpoch || !showAddressModal.value) return;
      applyPlace(latitude, longitude, place);
    } catch {
      // Keep the raw coordinates pinned even if reverse lookup fails.
    }
  }, () => toast.error('Không thể lấy vị trí. Hãy cấp quyền hoặc nhập tọa độ địa chỉ.'), { timeout: 10000 });
};

onMounted(async () => {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (authStore.user) {
    fullName.value = authStore.user.fullName;
    phoneNumber.value = authStore.user.phoneNumber ?? '';
    avatarUrl.value = authStore.user.avatarUrl ?? '';
  }
  await loadAddresses();
});

const loadAddresses = async () => {
  loadingAddresses.value = true;
  addressesFailed.value = false;
  try {
    const data = await profileApi.getAddresses();
    addresses.value = data;
  } catch {
    // Keep the last verified address list when a refresh temporarily fails;
    // with nothing on screen yet, offer a retry instead.
    if (addresses.value.length === 0) addressesFailed.value = true;
  } finally {
    loadingAddresses.value = false;
  }
};

const handleSaveProfile = async () => {
  const locked = identityVerified.value;
  profileError.value = (locked ? '' : validateFullName(fullName.value)) || validatePhoneNumber(phoneNumber.value);
  if (profileError.value) return;
  isSaving.value = true;
  try {
    const updated = await profileApi.updateMe({
      // A verified name is never sent: it can no longer change.
      fullName: locked ? undefined : fullName.value.trim(),
      phoneNumber: phoneNumber.value.trim() || undefined,
    });
    if (authStore.user && authStore.token) {
      authStore.setAuth(authStore.token, {
        ...authStore.user,
        ...updated,
        role: authStore.user.role,
      });
    }
    await authStore.fetchProfile();
    showEditProfileModal.value = false;
    toast.success('Đã cập nhật thông tin cá nhân.');
  } catch (err) {
    profileError.value = userFacingError(err, 'Không thể cập nhật hồ sơ. Vui lòng thử lại.');
  } finally {
    isSaving.value = false;
  }
};

const openAvatarModal = () => {
  showAvatarModal.value = true;
};

const openEditProfileModal = () => {
  fullName.value = authStore.user?.fullName || '';
  phoneNumber.value = authStore.user?.phoneNumber || '';
  showEditProfileModal.value = true;
  profileError.value = '';
};

const handleAddAddress = async () => {
  if (!addressForm.value.line1.trim()) {
    toast.warning('Vui lòng tìm hoặc chọn địa chỉ trên bản đồ trước khi lưu.');
    return;
  }
  if (!addressForm.value.province) {
    toast.warning('Chưa xác định được tỉnh/thành. Vui lòng chọn lại vị trí trên bản đồ hoặc tìm địa chỉ khác.');
    return;
  }
  addressError.value = '';
  if (!checkAddressFields({ location: true })) return;
  try {
    await profileApi.createAddress({
      lat: Number(addressLat.value),
      lng: Number(addressLng.value),
      label: normalizeAddressText(addressForm.value.label),
      line1: normalizeAddressText(addressForm.value.line1),
      ward: addressForm.value.ward ? normalizeAddressText(addressForm.value.ward) : undefined,
      // Many post-reform Vietnamese addresses have no separate district level; fall back
      // to ward/province so the backend's required field is still satisfied.
      district: normalizeAddressText(addressForm.value.district || addressForm.value.ward || addressForm.value.province),
      province: normalizeAddressText(addressForm.value.province),
      isDefault: addressForm.value.isDefault,
    });
    showAddressModal.value = false;
    addressLat.value = '';
    addressLng.value = '';
    addressMarkers.value = [];
    addressSuggestions.value = [];
    addressForm.value = {
      label: 'Nhà riêng',
      line1: '',
      ward: '',
      district: '',
      province: '',
      isDefault: false,
    };
    await loadAddresses();
    toast.success('Đã thêm địa chỉ mới.');
  } catch (err) {
    // Shown inside the form, next to what the person has to fix.
    addressError.value = userFacingError(err, 'Không thể lưu địa chỉ. Vui lòng thử lại.');
  }
};

const handleSaveAddress = async () => {
  if (savingAddress.value) return;
  if (!editingAddressId.value) {
    savingAddress.value = true;
    try { await handleAddAddress(); } finally { savingAddress.value = false; }
    return;
  }
  const original = originalAddress.value;
  if (!original) return;
  addressError.value = '';
  const line1 = addressForm.value.line1.trim();
  if (!line1 || !addressForm.value.province.trim() || !addressForm.value.district.trim()) {
    addressError.value = 'Vui lòng chọn địa chỉ đầy đủ trước khi lưu.';
    return;
  }
  const areaChanged = !sameArea(original.province, addressForm.value.province) ||
    !sameArea(original.district, addressForm.value.district);
  if (areaChanged) {
    addressError.value = 'Không thể đổi sang khu vực khác tại đây. Vui lòng thêm địa chỉ mới.';
    return;
  }
  const lat = addressLat.value === '' ? null : Number(addressLat.value);
  const lng = addressLng.value === '' ? null : Number(addressLng.value);
  const locationChanged = line1 !== original.line1.trim() ||
    (addressForm.value.ward || '') !== (original.ward || '') ||
    lat !== (original.lat == null ? null : Number(original.lat)) ||
    lng !== (original.lng == null ? null : Number(original.lng));
  if (locationChanged && (!editLocationVerified.value || !validCoordinates(addressLat.value, addressLng.value))) {
    addressError.value = 'Địa chỉ hoặc vị trí đã thay đổi. Vui lòng xác nhận lại vị trí trên bản đồ trước khi lưu.';
    return;
  }
  // An address saved before 01/11 without a pin is refused by the API on any change until it is
  // pinned, so ask for the pin here instead of sending.
  const storedPin = original.lat != null && original.lng != null;
  if (!checkAddressFields({ location: locationChanged || !storedPin })) return;
  const dto = locationChanged ? {
    label: normalizeAddressText(addressForm.value.label), isDefault: addressForm.value.isDefault,
    line1: normalizeAddressText(line1), ward: normalizeAddressText(addressForm.value.ward),
    district: original.district, province: original.province,
    lat: lat!, lng: lng!,
  } : {
    label: normalizeAddressText(addressForm.value.label), isDefault: addressForm.value.isDefault,
  };
  savingAddress.value = true;
  try {
    const updated = await profileApi.updateAddress(original.id, dto);
    addresses.value = addresses.value.map(addr => addr.id === original.id ? updated : addr);
    closeAddressModalAfterSave();
    await loadAddresses();
    toast.success('Đã cập nhật địa chỉ.');
  } catch (err) {
    addressError.value = userFacingError(err, 'Không thể lưu địa chỉ. Vui lòng thử lại.');
  } finally {
    savingAddress.value = false;
  }
};
// Close only after an acknowledged server update, independently of the in-flight guard.
const closeAddressModalAfterSave = () => {
  showAddressModal.value = false;
  resetAddressForm();
};
const triggerDeleteAddress = (id: string) => {
  addressToDelete.value = id;
  showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
  if (addressToDelete.value) {
    try {
      await profileApi.deleteAddress(addressToDelete.value);
      await loadAddresses();
    } catch (err) {
      toast.error(userFacingError(err, 'Không thể xoá địa chỉ.'));
    }
  }
  showDeleteConfirm.value = false;
  addressToDelete.value = null;
};

const handleSetDefaultAddress = async (addr: UserAddress) => {
  if (addr.isDefault || savingAddress.value) return;
  savingAddress.value = true;
  try {
    await profileApi.updateAddress(addr.id, {
      label: normalizeAddressText(addr.label ?? 'Địa chỉ'),
      isDefault: true,
    });
    toast.success(`Đã đặt "${addr.label || 'Địa chỉ'}" làm địa chỉ mặc định.`);
    await loadAddresses();
  } catch (err) {
    toast.error(userFacingError(err, 'Không thể đặt làm mặc định.'));
  } finally {
    savingAddress.value = false;
  }
};
</script>

<template>
  <div class="w-full space-y-6 pb-12">
    <!-- Who you are - Hero Profile Card -->
    <section class="bg-white rounded-2xl border border-ink-200/80 p-6 sm:p-7 shadow-xs animate-slide-up-hero">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div class="flex items-center gap-4 sm:gap-5">
          <!-- Avatar with camera button -->
          <div class="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-ink-900 text-white font-semibold text-2xl flex items-center justify-center shrink-0 ring-1 ring-ink-200/80">
            <img v-if="avatarUrl" :src="avatarUrl" alt="" class="w-full h-full object-cover rounded-full" />
            <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'U' }}</span>
            <button
              type="button"
              class="absolute bottom-0 right-0 w-7 h-7 bg-white text-ink-600 hover:text-ink-900 rounded-full flex items-center justify-center border border-ink-200 shadow-2xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              title="Đổi ảnh đại diện"
              aria-label="Đổi ảnh đại diện"
              @click="openAvatarModal"
            >
              <Camera :size="13" />
            </button>
          </div>

          <!-- Name & Contact -->
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight truncate">
                {{ authStore.user?.fullName || 'Người dùng' }}
              </h1>
              <ShieldCheck v-if="identityVerified" :size="20" class="text-emerald-600 shrink-0" title="Tài khoản đã xác thực" />
            </div>
            <p class="text-sm text-ink-500 font-normal">
              {{ authStore.user?.email }}
              <span v-if="authStore.user?.phoneNumber" class="text-ink-300 mx-1.5">·</span>
              <span v-if="authStore.user?.phoneNumber" class="font-num">{{ authStore.user?.phoneNumber }}</span>
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start animate-slide-up-content">
      <div class="space-y-6">
        <!-- Personal details -->
        <section class="bg-white rounded-2xl border border-ink-200/80 p-5 sm:p-6 shadow-xs">
          <div class="flex items-center justify-between pb-3.5 mb-2 border-b border-ink-100">
            <h2 class="text-base font-bold text-ink-900">Thông tin cá nhân</h2>
            <button
              type="button"
              class="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
              @click="openEditProfileModal"
            >
              Sửa
            </button>
          </div>

          <dl class="divide-y divide-ink-100/80 text-sm">
            <div class="py-3 flex items-center justify-between gap-4">
              <dt class="text-xs font-medium text-ink-500 shrink-0">Họ và tên</dt>
              <dd class="text-right min-w-0">
                <span class="font-semibold text-ink-900" data-testid="profile-name">{{ authStore.user?.fullName }}</span>
                <span v-if="identityVerified" class="block text-[11px] text-emerald-600 font-medium" data-testid="profile-name-verified">
                  Đã xác minh theo CCCD
                </span>
              </dd>
            </div>

            <div v-if="verifiedBirthDate" class="py-3 flex items-center justify-between gap-4" data-testid="profile-dob">
              <dt class="text-xs font-medium text-ink-500 shrink-0">Ngày sinh</dt>
              <dd class="text-right min-w-0">
                <span class="font-semibold text-ink-900 font-num">{{ formatDayKey(verifiedBirthDate) }}</span>
                <span class="block text-[11px] text-emerald-600 font-medium">
                  Đã xác minh theo CCCD
                </span>
              </dd>
            </div>

            <div class="py-3 flex items-center justify-between gap-4">
              <dt class="text-xs font-medium text-ink-500 shrink-0">Số điện thoại</dt>
              <dd class="font-semibold text-ink-900 font-num text-right">{{ authStore.user?.phoneNumber || 'Chưa có' }}</dd>
            </div>

            <div class="py-3 flex items-center justify-between gap-4">
              <dt class="text-xs font-medium text-ink-500 shrink-0">Email</dt>
              <dd class="font-semibold text-ink-900 text-right truncate max-w-[200px]">{{ authStore.user?.email }}</dd>
            </div>
          </dl>
        </section>
        <ReputationCard role="customer" />
        <ChangePasswordCard />
      </div>

      <!-- Address book -->
      <section class="bg-white rounded-2xl border border-ink-200/80 shadow-xs overflow-hidden">
        <div class="flex items-center justify-between px-6 py-5 border-b border-ink-100">
          <div class="flex items-center gap-2">
            <h2 class="text-base sm:text-lg font-bold text-ink-900">Sổ địa chỉ</h2>
            <span class="text-xs font-medium text-ink-400 font-num">({{ addresses.length }})</span>
          </div>
          <FhButton variant="primary" size="sm" data-testid="add-saved-address" @click="openAddAddress">
            <Plus :size="15" /> Thêm địa chỉ
          </FhButton>
        </div>

        <div v-if="loadingAddresses && addresses.length === 0" class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true" aria-label="Đang tải địa chỉ">
          <div v-for="i in 4" :key="i" class="p-4 rounded-xl border border-ink-100 space-y-2">
            <FhSkeleton width="30%" height="18px" />
            <FhSkeleton width="75%" height="16px" />
            <FhSkeleton width="50%" height="14px" />
          </div>
        </div>

        <div v-else-if="addressesFailed" class="p-6 flex flex-wrap items-center justify-between gap-3 bg-danger-50/40 rounded-xl m-4 border border-danger-100">
          <p class="text-sm text-danger-800">Chưa tải được sổ địa chỉ, vui lòng thử lại.</p>
          <FhButton variant="secondary" size="sm" @click="loadAddresses">Thử lại</FhButton>
        </div>

        <div v-else-if="addresses.length === 0" class="py-10">
          <FhEmptyState
            title="Chưa có địa chỉ nào"
            description="Lưu địa chỉ giúp đặt lịch kỹ thuật viên FixHome nhanh chóng hơn."
            action-text="Thêm địa chỉ ngay"
            :illustration="'/images/ui/empty-state-search-service.png'"
            @action="openAddAddress"
          />
        </div>

        <div v-else class="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <article
            v-for="addr in addresses"
            :key="addr.id"
            class="rounded-xl border p-4 sm:p-5 flex flex-col justify-between transition-all duration-150 bg-white"
            :class="addr.isDefault ? 'border-brand-500/50 ring-1 ring-brand-500/20 shadow-xs' : 'border-ink-200/80 hover:border-ink-300'"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-bold text-sm text-ink-900 truncate">{{ addr.label || 'Địa chỉ' }}</span>
                  <span v-if="addr.isDefault" class="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200/60 whitespace-nowrap">
                    Mặc định
                  </span>
                </div>

                <div class="flex items-center gap-2 text-xs font-medium shrink-0">
                  <button
                    type="button"
                    :data-testid="`edit-saved-address-${addr.id}`"
                    class="text-ink-500 hover:text-ink-900 cursor-pointer transition-colors"
                    @click="openEditAddress(addr)"
                  >
                    Sửa
                  </button>
                  <span class="text-ink-300">·</span>
                  <button
                    type="button"
                    class="text-ink-400 hover:text-danger-600 cursor-pointer transition-colors"
                    @click="triggerDeleteAddress(addr.id)"
                  >
                    Xoá
                  </button>
                </div>
              </div>

              <div>
                <p class="text-sm font-semibold text-ink-900 leading-snug">
                  {{ tidyAddressText(addr.line1) }}
                </p>
                <p class="text-xs text-ink-500 mt-1">
                  {{ [addr.ward, addr.district, addr.province].filter(Boolean).join(', ') }}
                </p>
              </div>
            </div>

            <div v-if="!addr.isDefault" class="pt-3 mt-3 border-t border-ink-100 flex items-center justify-end">
              <button
                type="button"
                class="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
                :disabled="savingAddress"
                @click="handleSetDefaultAddress(addr)"
              >
                Đặt làm mặc định
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- Modals -->

    <!-- Edit Profile Modal -->
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showEditProfileModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
        @click.self="showEditProfileModal = false"
      >
        <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 border border-ink-100 animate-modal-in">
          <div class="flex items-center justify-between pb-2 border-b border-ink-100">
            <h3 class="text-lg font-bold text-ink-900">
              Chỉnh sửa thông tin
            </h3>
            <button
              type="button"
              class="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors cursor-pointer"
              aria-label="Đóng"
              @click="showEditProfileModal = false"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="space-y-4 text-sm">
            <div v-if="identityVerified" data-testid="profile-fullname-locked">
              <label class="block font-semibold text-ink-700 mb-1.5">Họ và tên</label>
              <div class="h-10 px-3.5 flex items-center justify-between bg-ink-50 border border-ink-200 rounded-xl text-ink-800 font-medium">
                <span>{{ authStore.user?.fullName }}</span>
                <ShieldCheck :size="16" class="text-emerald-600 shrink-0" />
              </div>
              <p class="mt-1 text-xs text-ink-500 text-pretty">Đã xác minh theo CCCD nên không đổi được.</p>
            </div>
            <div v-else>
              <label class="block font-semibold text-ink-700 mb-1.5">Họ và tên</label>
              <input
                v-model="fullName"
                type="text"
                data-testid="profile-fullname"
                class="w-full h-10 px-3.5 bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 text-ink-900 transition-all"
                placeholder="Nhập họ và tên đầy đủ"
              />
            </div>
            
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Số điện thoại</label>
              <input
                v-model="phoneNumber"
                type="text"
                data-testid="profile-phone"
                class="w-full h-10 px-3.5 bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 font-num text-ink-900 transition-all"
                placeholder="0912345678"
              />
            </div>
            
            <p v-if="profileError" role="alert" class="text-xs text-danger-600 font-medium flex items-center gap-1" data-testid="profile-error">
              <AlertCircle :size="14" class="shrink-0" /> {{ profileError }}
            </p>
          </div>

          <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
            <FhButton variant="ghost" size="sm" @click="showEditProfileModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton variant="primary" size="sm" :loading="isSaving" data-testid="profile-save" @click="handleSaveProfile">
              Lưu thay đổi
            </FhButton>
          </div>
        </div>
      </div>
    </Transition>

    <AvatarDialog :open="showAvatarModal" @close="showAvatarModal = false" @saved="(url) => (avatarUrl = url)" />

    <!-- Add Address Modal -->
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showAddressModal"
        data-testid="saved-address-modal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
        @click.self="closeAddressModal"
      >
        <div class="bg-white rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[92vh] border border-ink-100 overflow-hidden animate-modal-in">
          <div class="flex items-center justify-between px-6 pt-5 pb-3 border-b border-ink-100 shrink-0">
            <div>
              <h3 class="text-lg font-bold text-ink-900">
                {{ editingAddressId ? 'Sửa địa chỉ đã lưu' : 'Thêm địa chỉ mới' }}
              </h3>
              <p class="text-xs text-ink-500 mt-0.5">Xác định vị trí chính xác để kỹ thuật viên phục vụ tận nhà</p>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              class="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors cursor-pointer"
              @click="closeAddressModal"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="space-y-4 text-xs px-6 py-5 overflow-y-auto flex-1 min-h-0">
            <!-- Label selection with quick chips -->
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5">Tên gợi nhớ</label>
              <div class="flex flex-wrap gap-1.5 mb-2">
                <button
                  v-for="preset in LABEL_PRESETS"
                  :key="preset"
                  type="button"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  :class="addressForm.label === preset ? 'bg-brand-50 text-brand-700 border border-brand-200 font-semibold' : 'bg-ink-50 text-ink-600 hover:bg-ink-100 border border-ink-200/60'"
                  @click="setAddressLabel(preset)"
                >
                  {{ preset }}
                </button>
              </div>
              <input
                v-model="addressForm.label"
                data-testid="saved-address-label"
                type="text"
                class="w-full h-10 px-3.5 bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 text-sm transition-all"
                placeholder="Ví dụ: Nhà riêng, Văn phòng, Nhà bố mẹ..."
                :aria-invalid="labelError ? 'true' : undefined"
              />
              <p v-if="labelError" data-testid="saved-address-label-error" role="alert" class="mt-1 text-xs text-danger-700 font-medium">{{ labelError }}</p>
            </div>

            <!-- Address search and autocomplete -->
            <div class="space-y-2">
              <label class="block font-semibold text-ink-700 mb-1">Địa chỉ cụ thể (số nhà, tên đường...) *</label>
              <div class="relative">
                <input
                  v-model="addressForm.line1"
                  data-testid="saved-address-line1"
                  type="text"
                  placeholder="Tìm kiếm địa chỉ, ví dụ: 25 Đội Cấn hoặc Landmark 81"
                  class="w-full h-10 px-3.5 bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 text-sm transition-all"
                  :aria-invalid="line1Error ? 'true' : undefined"
                  @input="onAddressSearchInput"
                />
                <ul
                  v-if="addressSuggestions.length"
                  class="absolute z-20 mt-1.5 w-full bg-white border border-ink-200 rounded-xl shadow-xl max-h-48 overflow-auto divide-y divide-ink-100"
                >
                  <li
                    v-for="s in addressSuggestions"
                    :key="s.placeId"
                    class="px-3.5 py-2.5 text-xs hover:bg-brand-50/70 hover:text-brand-900 cursor-pointer flex items-center gap-2 transition-colors"
                    @click="selectAddressSuggestion(s)"
                  >
                    <MapPin :size="14" class="text-brand-500 shrink-0" />
                    <span class="truncate">{{ s.description }}</span>
                  </li>
                </ul>
              </div>
              <p v-if="line1Error" data-testid="saved-address-line1-error" role="alert" class="text-xs text-danger-700 font-medium">{{ line1Error }}</p>
              <div v-if="addressForm.ward || addressForm.province" class="text-xs text-ink-600 flex items-center gap-1.5 bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-200/60">
                <MapPin :size="13" class="text-brand-600 shrink-0" />
                <span class="font-medium">{{ [addressForm.ward, addressForm.district, addressForm.province].filter(Boolean).join(', ') }}</span>
              </div>
            </div>

            <!-- Interactive Map & Coordinates -->
            <div class="space-y-2.5 pt-1">
              <div class="flex items-center justify-between gap-2">
                <label class="block font-semibold text-ink-700">Định vị trên bản đồ</label>
                <button
                  type="button"
                  class="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                  @click="locateAddress"
                >
                  <LocateFixed :size="13" /> Dùng vị trí hiện tại
                </button>
              </div>

              <div class="rounded-xl overflow-hidden border border-ink-200 shadow-2xs">
                <MapTilerMap
                  ref="mapRef"
                  :center="mapCenter"
                  :markers="addressMarkers"
                  click-to-move="picker"
                  height-class="h-56"
                  @marker-move="onMapMarkerMove"
                />
              </div>

              <!-- Coordinates section with quick verify -->
              <div class="rounded-xl border border-ink-200/80 bg-ink-50/60 p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-ink-700 flex items-center gap-1">
                    <Navigation :size="12" class="text-ink-500" /> Toạ độ GPS (Vĩ độ / Kinh độ)
                  </span>
                  <button
                    type="button"
                    class="text-xs font-semibold text-brand-600 hover:text-brand-700 cursor-pointer disabled:opacity-50"
                    :disabled="searchingByCoords"
                    @click="searchByCoordinates"
                    data-testid="verify-saved-address-coordinates"
                  >
                    {{ searchingByCoords ? 'Đang tìm...' : 'Tìm vị trí toạ độ' }}
                  </button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input
                    v-model.number="addressLat"
                    data-testid="saved-address-lat"
                    @input="invalidateEditLocation"
                    aria-label="Vĩ độ"
                    placeholder="Vĩ độ (Lat)"
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-num"
                  />
                  <input
                    v-model.number="addressLng"
                    data-testid="saved-address-lng"
                    @input="invalidateEditLocation"
                    aria-label="Kinh độ"
                    placeholder="Kinh độ (Lng)"
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-num"
                  />
                </div>
                <p v-if="locationError" data-testid="saved-address-location-error" role="alert" class="text-xs text-danger-700 font-medium">{{ locationError }}</p>
              </div>
            </div>

            <!-- Set as Default -->
            <label class="flex items-center gap-2.5 cursor-pointer pt-1 select-none">
              <input
                v-model="addressForm.isDefault"
                data-testid="saved-address-default"
                type="checkbox"
                class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <span class="text-xs text-ink-800 font-medium">Đặt làm địa chỉ mặc định khi tạo đơn</span>
            </label>
          </div>

          <p v-if="addressError" data-testid="saved-address-error" role="alert" class="px-6 py-2 text-xs text-danger-700 font-medium bg-danger-50 border-t border-danger-100">{{ addressError }}</p>
          <p v-if="editingAddressId" class="px-6 py-1.5 text-xs text-ink-500 bg-ink-50/50">Sửa địa chỉ đã lưu không làm thay đổi địa chỉ của các đơn đã tạo trước đây.</p>
          
          <div class="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 shrink-0 bg-white">
            <FhButton variant="ghost" size="sm" data-testid="cancel-saved-address" :disabled="savingAddress" @click="closeAddressModal">
              Huỷ bỏ
            </FhButton>
            <FhButton variant="primary" size="sm" data-testid="save-saved-address" :loading="savingAddress" @click="handleSaveAddress">
              {{ editingAddressId ? 'Lưu thay đổi' : 'Lưu địa chỉ' }}
            </FhButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Confirm Delete Modal -->
    <FhConfirmDialog
      :open="showDeleteConfirm"
      title="Xoá địa chỉ"
      consequence="Địa chỉ này sẽ bị xoá vĩnh viễn khỏi sổ địa chỉ của bạn."
      confirm-text="Xoá"
      cancel-text="Giữ lại"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<style scoped>
@keyframes slideUpEntrance {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-up-hero {
  animation: slideUpEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.animate-slide-up-content {
  animation: slideUpEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both;
}

@keyframes modalIn {
  0% {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-modal-in {
  animation: modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .animate-slide-up-hero,
  .animate-slide-up-content,
  .animate-modal-in {
    animation: none !important;
    transform: none !important;
  }
}
</style>
