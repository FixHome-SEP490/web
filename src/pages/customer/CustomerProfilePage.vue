<script setup lang="ts">
import AvatarDialog from '../../components/account/AvatarDialog.vue';
import ChangePasswordCard from '../../components/account/ChangePasswordCard.vue';
import ReputationCard from '../../components/account/ReputationCard.vue';
import { ref, onMounted } from 'vue';
import { MapPin, Plus, Trash2, Check, Pencil, Camera, X } from 'lucide-vue-next';
import {
  FhButton,
  FhConfirmDialog,
  FhSkeleton,
  MapTilerMap,
  type MapMarker,
} from '../../components';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();

const fullName = ref('');
const phoneNumber = ref('');
const avatarUrl = ref('');
const isSaving = ref(false);
const saveSuccess = ref(false);

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
    addressForm.value.line1 = place.formattedAddress || place.description || addressForm.value.line1;
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
      const suggestions = await geoApi.autocomplete(query);
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
    alert('Vui lòng nhập đủ vĩ độ và kinh độ.');
    return;
  }
  const lat = Number(addressLat.value);
  const lng = Number(addressLng.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    alert('Toạ độ không hợp lệ.');
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
    alert('Đã ghim toạ độ trên bản đồ, nhưng không tra được địa chỉ tương ứng.');
  } finally {
    searchingByCoords.value = false;
  }
};

const locateAddress = () => {
  invalidateEditLocation();
  const requestEpoch = addressGeoEpoch;
  if (!navigator.geolocation) return alert('Thiết bị không hỗ trợ định vị.');
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
  }, () => alert('Không thể lấy vị trí. Hãy cấp quyền hoặc nhập tọa độ địa chỉ.'), { timeout: 10000 });
};

onMounted(async () => {
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
  isSaving.value = true;
  saveSuccess.value = false;
  try {
    const updated = await profileApi.updateMe({
      fullName: fullName.value.trim(),
      phoneNumber: phoneNumber.value.trim() || undefined,
    });
    if (authStore.user && authStore.token) {
      authStore.setAuth(authStore.token, {
        ...authStore.user,
        ...updated,
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
  showAvatarModal.value = true;
};

const openEditProfileModal = () => {
  fullName.value = authStore.user?.fullName || '';
  phoneNumber.value = authStore.user?.phoneNumber || '';
  showEditProfileModal.value = true;
  saveSuccess.value = false;
};

const handleAddAddress = async () => {
  if (!addressForm.value.line1.trim()) {
    alert('Vui lòng tìm hoặc chọn địa chỉ trên bản đồ trước khi lưu.');
    return;
  }
  if (!addressForm.value.province) {
    alert('Chưa xác định được tỉnh/thành. Vui lòng chọn lại vị trí trên bản đồ hoặc tìm địa chỉ khác.');
    return;
  }
  try {
    await profileApi.createAddress({
      lat: addressLat.value === '' ? undefined : Number(addressLat.value),
      lng: addressLng.value === '' ? undefined : Number(addressLng.value),
      label: addressForm.value.label,
      line1: addressForm.value.line1,
      ward: addressForm.value.ward || undefined,
      // Many post-reform Vietnamese addresses have no separate district level; fall back
      // to ward/province so the backend's required field is still satisfied.
      district: addressForm.value.district || addressForm.value.ward || addressForm.value.province,
      province: addressForm.value.province,
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
  } catch {
    alert('Không thể lưu địa chỉ. Vui lòng thử lại.');
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
  const dto = locationChanged ? {
    label: addressForm.value.label.trim(), isDefault: addressForm.value.isDefault,
    line1, ward: addressForm.value.ward,
    district: original.district, province: original.province,
    lat: lat!, lng: lng!,
  } : {
    label: addressForm.value.label.trim(), isDefault: addressForm.value.isDefault,
  };
  savingAddress.value = true;
  try {
    const updated = await profileApi.updateAddress(original.id, dto);
    addresses.value = addresses.value.map(addr => addr.id === original.id ? updated : addr);
    closeAddressModalAfterSave();
    await loadAddresses();
  } catch {
    addressError.value = 'Không thể lưu địa chỉ. Vui lòng thử lại.';
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
    } catch {
      alert('Không thể xoá địa chỉ.');
    }
  }
  showDeleteConfirm.value = false;
  addressToDelete.value = null;
};
</script>

<template>
  <div class="max-w-5xl mx-auto pb-10 space-y-6">
    <!-- Who you are -->
    <section class="flex items-center gap-4">
      <div class="relative w-16 h-16 shrink-0">
        <div class="w-full h-full rounded-full bg-brand-100 text-brand-700 font-bold text-2xl overflow-hidden flex items-center justify-center">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="w-full h-full object-cover" />
          <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'U' }}</span>
        </div>
        <button
          type="button"
          class="absolute -bottom-1 -right-1 w-8 h-8 bg-white hover:bg-ink-100 text-ink-700 rounded-full flex items-center justify-center border border-ink-200 shadow-sm transition-colors"
          title="Đổi ảnh đại diện"
          aria-label="Đổi ảnh đại diện"
          @click="openAvatarModal"
        >
          <Camera :size="16" />
        </button>
      </div>
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight text-balance">{{ authStore.user?.fullName || 'Người dùng' }}</h1>
        <p class="text-sm text-ink-500 truncate">{{ authStore.user?.email }}</p>
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
      <div class="space-y-6">
        <!-- Personal details -->
        <section class="bg-white rounded-2xl border border-ink-200 p-5">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h2 class="text-lg font-semibold text-ink-900">Thông tin cá nhân</h2>
            <FhButton variant="secondary" size="sm" @click="openEditProfileModal">
              <Pencil :size="14" /> Sửa
            </FhButton>
          </div>
          <dl class="divide-y divide-ink-100 text-sm">
            <div class="flex items-center justify-between gap-3 py-2.5">
              <dt class="text-ink-500">Họ và tên</dt>
              <dd class="font-medium text-ink-900 text-right">{{ authStore.user?.fullName }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 py-2.5">
              <dt class="text-ink-500">Số điện thoại</dt>
              <dd class="font-medium text-ink-900 font-num whitespace-nowrap">{{ authStore.user?.phoneNumber || 'Chưa có' }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 py-2.5">
              <dt class="text-ink-500 shrink-0">Email</dt>
              <dd class="font-medium text-ink-900 text-right break-all">{{ authStore.user?.email }}</dd>
            </div>
          </dl>
        </section>
        <ReputationCard role="customer" />
        <ChangePasswordCard />
      </div>

      <!-- Address book -->
      <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
        <div class="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 class="text-lg font-semibold text-ink-900">Sổ địa chỉ</h2>
          <FhButton variant="secondary" size="sm" data-testid="add-saved-address" @click="openAddAddress">
            <Plus :size="16" /> Thêm địa chỉ
          </FhButton>
        </div>

        <div v-if="loadingAddresses && addresses.length === 0" class="px-5 pb-5 space-y-4" aria-busy="true" aria-label="Đang tải địa chỉ">
          <div v-for="i in 2" :key="i" class="space-y-2">
            <FhSkeleton width="30%" height="16px" />
            <FhSkeleton width="70%" height="14px" />
          </div>
        </div>

        <div v-else-if="addressesFailed" class="px-5 pb-5 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-ink-700">Chưa tải được sổ địa chỉ, vui lòng thử lại.</p>
          <FhButton variant="secondary" size="sm" @click="loadAddresses">Thử lại</FhButton>
        </div>

        <p v-else-if="addresses.length === 0" class="px-5 pb-6 text-sm text-ink-500 text-pretty">
          Chưa có địa chỉ nào. Thêm nhà riêng hoặc văn phòng để đặt thợ nhanh hơn.
        </p>

        <ul v-else class="divide-y divide-ink-100 border-t border-ink-100">
          <li v-for="addr in addresses" :key="addr.id" class="px-5 py-4 flex items-start gap-3">
            <MapPin :size="18" class="text-ink-500 shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1 space-y-0.5">
              <p class="flex items-center gap-2">
                <span class="font-semibold text-sm text-ink-900">{{ addr.label || 'Địa chỉ' }}</span>
                <span v-if="addr.isDefault" class="inline-flex items-center h-5 px-1.5 rounded-md text-xs font-medium bg-brand-50 text-brand-700 whitespace-nowrap">
                  Mặc định
                </span>
              </p>
              <p class="text-sm text-ink-800 text-pretty">{{ addr.line1 }}</p>
              <p class="text-sm text-ink-500 text-pretty">{{ addr.ward ? addr.ward + ', ' : '' }}{{ addr.district }}, {{ addr.province }}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                :data-testid="`edit-saved-address-${addr.id}`"
                class="w-9 h-9 flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 rounded-xl"
                title="Sửa địa chỉ"
                aria-label="Sửa địa chỉ"
                @click="openEditAddress(addr)"
              >
                <Pencil :size="16" />
              </button>
              <button
                type="button"
                class="w-9 h-9 flex items-center justify-center text-ink-500 hover:text-danger-600 hover:bg-danger-50 rounded-xl"
                title="Xoá địa chỉ"
                aria-label="Xoá địa chỉ"
                @click="triggerDeleteAddress(addr.id)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <!-- Modals -->

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

    <AvatarDialog :open="showAvatarModal" @close="showAvatarModal = false" @saved="(url) => (avatarUrl = url)" />

    <!-- Add Address Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showAddressModal"
        data-testid="saved-address-modal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      >
      <div class="bg-white rounded-md max-w-md w-full shadow-xl flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between px-6 pt-6 shrink-0">
          <h3 class="text-lg font-bold text-ink-900">
            {{ editingAddressId ? 'Sửa địa chỉ đã lưu' : 'Thêm địa chỉ' }}
          </h3>
          <button
            type="button"
            aria-label="Đóng"
            class="p-1.5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
            @click="closeAddressModal"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="space-y-4 text-xs px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <div>
            <label class="block font-semibold text-ink-700 mb-1">Tên nhãn gợi nhớ</label>
            <input
              v-model="addressForm.label" data-testid="saved-address-label"
              type="text"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
              placeholder="Nhà riêng, Văn phòng, Nhà bố mẹ..."
            />
          </div>

          <div class="space-y-2">
            <label class="block font-semibold text-ink-700 mb-1">Địa chỉ (số nhà, tên đường...) *</label>
            <div class="relative">
              <input
                v-model="addressForm.line1" data-testid="saved-address-line1"
                type="text"
                placeholder="Tìm địa chỉ, ví dụ: Số 25 Ngõ 12 Đội Cấn"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
                @input="onAddressSearchInput"
              />
              <ul
                v-if="addressSuggestions.length"
                class="absolute z-10 mt-1 w-full bg-white border border-ink-200 rounded-sm shadow-lg max-h-48 overflow-auto"
              >
                <li
                  v-for="s in addressSuggestions"
                  :key="s.placeId"
                  class="px-3 py-2 text-xs hover:bg-ink-50 cursor-pointer"
                  @click="selectAddressSuggestion(s)"
                >
                  {{ s.description }}
                </li>
              </ul>
            </div>
            <p v-if="addressForm.ward || addressForm.province" class="text-xs text-ink-500 flex items-center gap-1">
              <MapPin :size="12" class="shrink-0" />
              <span>{{ [addressForm.ward, addressForm.province].filter(Boolean).join(', ') }}</span>
            </p>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-ink-600">Hoặc chọn vị trí chính xác trên bản đồ (cần để đặt lịch và xác nhận thợ đến nơi)</p>
            <FhButton variant="ghost" size="sm" @click="locateAddress">Dùng vị trí hiện tại khi đang ở địa chỉ này</FhButton>
            <MapTilerMap
              ref="mapRef"
              :center="mapCenter"
              :markers="addressMarkers"
              click-to-move="picker"
              height-class="h-56"
              @marker-move="onMapMarkerMove"
            />
            <div class="grid grid-cols-2 gap-2">
              <input v-model.number="addressLat" data-testid="saved-address-lat" @input="invalidateEditLocation" aria-label="Vĩ độ" placeholder="Vĩ độ" type="number" min="-90" max="90" step="any" class="border p-2 rounded" />
              <input v-model.number="addressLng" data-testid="saved-address-lng" @input="invalidateEditLocation" aria-label="Kinh độ" placeholder="Kinh độ" type="number" min="-180" max="180" step="any" class="border p-2 rounded" />
            </div>
            <FhButton
              variant="ghost"
              size="sm"
              :disabled="searchingByCoords"
              :loading="searchingByCoords"
              @click="searchByCoordinates" data-testid="verify-saved-address-coordinates"
            >
              Tìm theo toạ độ này
            </FhButton>
          </div>
          <label class="flex items-center gap-2 cursor-pointer pt-1">
            <input
              v-model="addressForm.isDefault" data-testid="saved-address-default"
              type="checkbox"
              class="rounded text-brand-600 focus:ring-brand-500"
            />
            <span class="text-xs text-ink-700 font-medium">Đặt làm địa chỉ mặc định khi tạo đơn</span>
          </label>
        </div>

        <p v-if="addressError" data-testid="saved-address-error" role="alert" class="px-6 py-2 text-xs text-danger-700">{{ addressError }}</p>
        <p v-if="editingAddressId" class="px-6 text-xs text-ink-500">Sửa địa chỉ đã lưu không làm thay đổi địa chỉ của các đơn đã tạo trước đây.</p>
        <div class="flex justify-end gap-3 px-6 py-4 border-t border-ink-100 shrink-0">
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
