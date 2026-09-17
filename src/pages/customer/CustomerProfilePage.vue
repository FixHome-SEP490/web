<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { User, MapPin, Plus, Trash2, Check, Star, Pencil, Phone, Mail, Camera } from 'lucide-vue-next';
import {
  FhButton,
  FhConfirmDialog,
} from '../../components';
import { profileApi, type UserAddress } from '../../api/profile.api';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();

const fullName = ref('');
const phoneNumber = ref('');
const avatarUrl = ref('');
const isSaving = ref(false);
const saveSuccess = ref(false);

const addresses = ref<UserAddress[]>([]);
const loadingAddresses = ref(false);

// Modals
const showEditProfileModal = ref(false);
const showAvatarModal = ref(false);
const newAvatarUrl = ref('');

// Address Modal
const showAddressModal = ref(false);
const addressForm = ref({
  label: 'Nhà riêng',
  line1: '',
  ward: '',
  district: '',
  province: 'Hà Nội',
  isDefault: false,
});

// Delete Confirmation
const showDeleteConfirm = ref(false);
const addressToDelete = ref<string | null>(null);
const addressLat = ref<number | ''>('');
const addressLng = ref<number | ''>('');

const locateAddress = () => {
  if (!navigator.geolocation) return alert('Thiết bị không hỗ trợ định vị.');
  navigator.geolocation.getCurrentPosition(position => {
    addressLat.value = position.coords.latitude;
    addressLng.value = position.coords.longitude;
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
  try {
    const data = await profileApi.getAddresses();
    addresses.value = data;
  } catch {
    addresses.value = [];
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

const openAvatarModal = () => {
  newAvatarUrl.value = avatarUrl.value;
  showAvatarModal.value = true;
};

const openEditProfileModal = () => {
  fullName.value = authStore.user?.fullName || '';
  phoneNumber.value = authStore.user?.phoneNumber || '';
  showEditProfileModal.value = true;
  saveSuccess.value = false;
};

const handleAddAddress = async () => {
  if (!addressForm.value.line1 || !addressForm.value.district || !addressForm.value.province) {
    alert('Vui lòng điền đủ địa chỉ số nhà, quận/huyện và tỉnh/thành.');
    return;
  }
  try {
    await profileApi.createAddress({
      lat: addressLat.value === '' ? undefined : Number(addressLat.value),
      lng: addressLng.value === '' ? undefined : Number(addressLng.value),
      label: addressForm.value.label,
      line1: addressForm.value.line1,
      ward: addressForm.value.ward || undefined,
      district: addressForm.value.district,
      province: addressForm.value.province,
      isDefault: addressForm.value.isDefault,
    });
    showAddressModal.value = false;
    addressLat.value = '';
    addressLng.value = '';
    addressForm.value = {
      label: 'Nhà riêng',
      line1: '',
      ward: '',
      district: '',
      province: 'Hà Nội',
      isDefault: false,
    };
    await loadAddresses();
  } catch {
    alert('Không thể lưu địa chỉ. Vui lòng thử lại.');
  }
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
  <div class="max-w-6xl mx-auto pb-10">
    
    <!-- Profile Header (Facebook Style) -->
    <div class="bg-white shadow-(--shadow-e1) rounded-b-lg px-6 pt-10 pb-2 mb-6">
      <div class="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6 border-b border-ink-200 pb-6">
        <!-- Avatar & Name -->
        <div class="flex flex-col sm:flex-row items-center gap-6">
          <!-- Avatar with Camera Button -->
          <div class="relative w-32 h-32 -mt-5 shrink-0">
            <div class="w-full h-full rounded-full border-4 border-white shadow-md bg-brand-100 text-brand-700 font-bold text-5xl overflow-hidden flex items-center justify-center">
               <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" />
               <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'U' }}</span>
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
            <h1 class="text-3xl font-bold text-ink-900 tracking-tight">{{ authStore.user?.fullName || 'Người dùng' }}</h1>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-3">
          <FhButton variant="primary" size="md" @click="showAddressModal = true">
            <Plus :size="16" class="mr-1.5" /> Thêm địa chỉ mới
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Main Content (2 Columns) -->
    <div class="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 px-4 sm:px-0">
      
      <!-- Left Column (Thông tin cá nhân - Readonly List) -->
      <div class="space-y-6">
        <div class="bg-white shadow-(--shadow-e1) rounded-md p-5 border border-ink-100">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-ink-900">Thông tin cá nhân</h2>
            <button 
              @click="openEditProfileModal"
              class="p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 rounded-full transition-all duration-300 hover:rotate-12"
              title="Chỉnh sửa thông tin"
            >
              <Pencil :size="18" />
            </button>
          </div>
          
          <div class="space-y-4 text-sm">
            <div class="flex items-center gap-3 text-ink-800 font-medium">
              <User :size="20" class="text-ink-400 shrink-0" />
              <span>{{ authStore.user?.fullName }}</span>
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
      </div>

      <!-- Right Column (Sổ địa chỉ) -->
      <div class="space-y-6">
        <div class="bg-white shadow(--shadow-e1) rounded-md p-5 border border-ink-100">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-ink-900">Sổ địa chỉ</h2>
          </div>
          
          <div v-if="addresses.length === 0" class="text-center py-10 bg-ink-50 rounded-sm border border-ink-200 border-dashed">
            <MapPin :size="32" class="mx-auto text-ink-400 mb-2" />
            <h4 class="text-sm font-bold text-ink-800">Chưa có địa chỉ nào</h4>
            <p class="text-xs text-ink-500 max-w-xs mx-auto mt-1 mb-4">
              Thêm địa chỉ nhà riêng hoặc văn phòng để gọi thợ tiện lợi hơn.
            </p>
            <FhButton variant="secondary" size="sm" @click="showAddressModal = true" class="bg-ink-100">
              <Plus :size="15" class="mr-1" /> Thêm địa chỉ mới
            </FhButton>
          </div>
          
          <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div
              v-for="addr in addresses"
              :key="addr.id"
              class="p-4 rounded-sm bg-white border border-ink-200 hover:border-brand-400 hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-3 relative group"
            >
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-sm text-ink-900 flex items-center gap-1.5">
                    <MapPin :size="16" class="text-brand-600" /> {{ addr.label || 'Địa chỉ' }}
                  </span>
                  <span v-if="addr.isDefault" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                    <Star :size="11" class="fill-brand-600" /> Mặc định
                  </span>
                </div>
                <p class="text-sm text-ink-800 font-medium">{{ addr.line1 }}</p>
                <p class="text-xs text-ink-500">{{ addr.ward ? addr.ward + ', ' : '' }}{{ addr.district }}, {{ addr.province }}</p>
              </div>
              <div class="pt-2 border-t border-ink-100 flex items-center justify-end">
                <button class="p-1.5 text-ink-400 hover:text-danger-500 hover:bg-danger-50 rounded transition-all duration-300 hover:scale-110 active:scale-95" title="Xoá địa chỉ" @click="triggerDeleteAddress(addr.id)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      >
      <div class="bg-white rounded-md max-w-md w-full p-6 shadow-xl space-y-5">
        <h3 class="text-lg font-bold text-ink-900">
          Thêm Địa chỉ Mới
        </h3>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-semibold text-ink-700 mb-1">Tên nhãn gợi nhớ</label>
            <input
              v-model="addressForm.label"
              type="text"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
              placeholder="Nhà riêng, Văn phòng, Nhà bố mẹ..."
            />
          </div>

          <div>
            <label class="block font-semibold text-ink-700 mb-1">Số nhà, tên đường / tòa nhà *</label>
            <input
              v-model="addressForm.line1"
              type="text"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
              placeholder="Ví dụ: Số 25 Ngõ 12 Đội Cấn"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Phường / Xã</label>
              <input
                v-model="addressForm.ward"
                type="text"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
                placeholder="Phường Đội Cấn"
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Quận / Huyện *</label>
              <input
                v-model="addressForm.district"
                type="text"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
                placeholder="Quận Ba Đình"
              />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-ink-700 mb-1">Tỉnh / Thành phố *</label>
            <select
              v-model="addressForm.province"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
            >
              <option value="Hà Nội">Hà Nội</option>
              <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
              <option value="Đà Nẵng">Đà Nẵng</option>
            </select>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-ink-600">Tọa độ nơi sửa chữa (cần để đặt lịch và xác nhận thợ đến nơi)</p>
            <FhButton variant="ghost" size="sm" @click="locateAddress">Dùng vị trí hiện tại khi đang ở địa chỉ này</FhButton>
            <div class="grid grid-cols-2 gap-2">
              <input v-model.number="addressLat" aria-label="Vĩ độ" placeholder="Vĩ độ" type="number" min="-90" max="90" step="any" class="border p-2 rounded" />
              <input v-model.number="addressLng" aria-label="Kinh độ" placeholder="Kinh độ" type="number" min="-180" max="180" step="any" class="border p-2 rounded" />
            </div>
          </div>
          <label class="flex items-center gap-2 cursor-pointer pt-1">
            <input
              v-model="addressForm.isDefault"
              type="checkbox"
              class="rounded text-brand-600 focus:ring-brand-500"
            />
            <span class="text-xs text-ink-700 font-medium">Đặt làm địa chỉ mặc định khi tạo đơn</span>
          </label>
        </div>

        <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showAddressModal = false">
            Huỷ bỏ
          </FhButton>
          <FhButton variant="primary" size="sm" @click="handleAddAddress">
            Lưu địa chỉ
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
