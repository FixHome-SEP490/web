<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  MapPin,
  CheckCircle2,
  Calendar,
  Clock,
  AlertCircle,
  Phone,
  Mail,
  Camera,
  Star,
  ShieldCheck,
  Pencil,
  Check
} from 'lucide-vue-next';
import {
  FhCard,
  FhMoney,
  FhButton,
} from '../../components';
import { useAuthStore } from '../../stores/auth';
import { profileApi } from '../../api/profile.api';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';
import { serviceAreasApi } from '../../api/service-areas.api';

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
const areaNames = ref(new Map<string, { provinceName: string; districtName: string }>());
const togglingAvailability = ref(false);

const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// Seed schedule rows have duplicates for the same day; keep one per dayOfWeek.
const uniqueSchedule = computed(() => {
  const seen = new Map<number, { dayOfWeek: number; startTime: string; endTime: string }>();
  for (const s of technicianProfile.value?.schedules ?? []) {
    if (!seen.has(s.dayOfWeek)) seen.set(s.dayOfWeek, s);
  }
  return [...seen.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
});

const areaLabel = (area: { provinceCode: string; districtCode: string }) => {
  const found = areaNames.value.get(`${area.provinceCode}|${area.districtCode}`);
  return found ? { province: found.provinceName, district: found.districtName } : { province: area.provinceCode, district: area.districtCode };
};

const loadProfile = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const [profile, areas] = await Promise.all([
      technicianProfileApi.getMyProfile(),
      serviceAreasApi.getServiceAreas().catch(() => []),
    ]);
    technicianProfile.value = profile;
    areaNames.value = new Map(areas.map((a) => [`${a.provinceCode}|${a.districtCode}`, { provinceName: a.provinceName, districtName: a.districtName }]));
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
      </div>

      <!-- Right Column (Cards - Skills & Areas) -->
      <div class="space-y-6">
        
        <!-- Verified Skills -->
        <FhCard title="Kỹ năng chuyên môn đã duyệt">
          <template #action>
            <span class="text-[11px] text-ink-400 font-mono">{{ technicianProfile.skills.length }} dịch vụ</span>
          </template>

          <div class="space-y-2.5">
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

        <!-- Service Areas -->
        <FhCard title="Khu vực hoạt động đăng ký">
          <template #action>
            <span class="text-[11px] text-ink-400 font-mono">{{ technicianProfile.serviceAreas.length }} quận</span>
          </template>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="area in technicianProfile.serviceAreas"
              :key="`${area.provinceCode}-${area.districtCode}`"
              class="p-3 rounded-sm bg-white border border-ink-200/80 flex items-center justify-between shadow-sm hover:border-brand-400 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
            >
              <div class="flex items-center gap-2.5">
                <MapPin :size="16" class="text-brand-600 shrink-0" />
                <span class="text-sm font-medium text-ink-800">{{ areaLabel(area).district }}</span>
              </div>
              <span class="text-[11px] text-ink-500">{{ areaLabel(area).province }}</span>
            </div>
          </div>
        </FhCard>

        <div class="p-4 rounded-md bg-info-50 border border-info-200 flex items-start gap-3">
          <AlertCircle :size="18" class="text-info-600 shrink-0 mt-0.5" />
          <p class="text-sm text-info-800">
            Để thay đổi khu vực hoạt động hoặc kỹ năng chuyên môn, vui lòng liên hệ Service Manager khu vực của bạn.
          </p>
        </div>

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

  </div>
</template>
