<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  MapPin,
  CheckCircle2,
  Calendar,
  Briefcase,
  ShieldCheck,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import {
  FhCard,
  FhMoney,
  FhButton,
  FhSkeleton,
} from '../../components';
import { useAuthStore } from '../../stores/auth';
import {
  techniciansApi,
  type TechnicianProfileData,
  type TechnicianSkillItem,
  type TechnicianServiceAreaItem,
} from '../../api/technicians.api';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const actionLoading = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const profile = ref<TechnicianProfileData | null>(null);
const skills = ref<TechnicianSkillItem[]>([]);
const serviceAreas = ref<TechnicianServiceAreaItem[]>([]);

// Editable fields
const editBio = ref('');
const editYearsExperience = ref(0);
const editIsAvailable = ref(true);

// Add service area form
const newProvinceCode = ref('HCM');
const newDistrictCode = ref('Quận 1');

const loadProfileData = async () => {
  try {
    loading.value = true;
    const [p, s, a] = await Promise.all([
      techniciansApi.getProfile(),
      techniciansApi.getSkills(),
      techniciansApi.getServiceAreas(),
    ]);
    profile.value = p;
    skills.value = s;
    serviceAreas.value = a;

    editBio.value = p.bio || '';
    editYearsExperience.value = p.yearsExperience || 0;
    editIsAvailable.value = p.isAvailable;
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải thông tin hồ sơ kỹ thuật viên.',
    };
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadProfileData();
});

const handleSaveProfile = async () => {
  try {
    actionLoading.value = true;
    message.value = null;
    const updated = await techniciansApi.updateProfile({
      bio: editBio.value.trim(),
      yearsExperience: editYearsExperience.value,
      isAvailable: editIsAvailable.value,
    });
    profile.value = updated;
    message.value = { type: 'success', text: 'Cập nhật thông tin hồ sơ thành công!' };
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể cập nhật hồ sơ.',
    };
  } finally {
    actionLoading.value = false;
  }
};

const handleAddArea = async () => {
  if (!newDistrictCode.value.trim()) return;

  const exists = serviceAreas.value.some(
    (a) => a.districtCode.toLowerCase() === newDistrictCode.value.trim().toLowerCase(),
  );
  if (exists) {
    message.value = { type: 'error', text: 'Khu vực này đã có trong danh sách phục vụ của bạn!' };
    return;
  }

  const updatedAreas = [
    ...serviceAreas.value.map((a) => ({ provinceCode: a.provinceCode, districtCode: a.districtCode })),
    { provinceCode: newProvinceCode.value, districtCode: newDistrictCode.value.trim() },
  ];

  try {
    actionLoading.value = true;
    message.value = null;
    serviceAreas.value = await techniciansApi.updateServiceAreas(updatedAreas);
    message.value = { type: 'success', text: 'Đã thêm khu vực phục vụ thành công!' };
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể lưu khu vực hoạt động.',
    };
  } finally {
    actionLoading.value = false;
  }
};

const handleRemoveArea = async (districtCode: string) => {
  const updatedAreas = serviceAreas.value
    .filter((a) => a.districtCode !== districtCode)
    .map((a) => ({ provinceCode: a.provinceCode, districtCode: a.districtCode }));

  try {
    actionLoading.value = true;
    message.value = null;
    serviceAreas.value = await techniciansApi.updateServiceAreas(updatedAreas);
    message.value = { type: 'success', text: 'Đã xoá khu vực phục vụ thành công!' };
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể cập nhật khu vực hoạt động.',
    };
  } finally {
    actionLoading.value = false;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight">
          Hồ sơ Kỹ thuật viên & Năng lực
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Hồ sơ nghiệp vụ, khu vực hoạt động và kỹ năng phục vụ khách hàng trên FixHome.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton variant="secondary" size="md" @click="router.push('/tech/verification')">
          <ShieldCheck :size="15" class="mr-1.5" />
          Hồ sơ KYC
        </FhButton>
        <FhButton variant="secondary" size="md" @click="router.push('/tech/schedule')">
          <Calendar :size="15" class="mr-1.5" />
          Lịch làm việc
        </FhButton>
      </div>
    </div>

    <!-- Alert / Feedback Banner -->
    <div
      v-if="message"
      class="p-4 rounded-lg text-xs flex items-center justify-between"
      :class="message.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <span>{{ message.text }}</span>
      <button class="font-bold underline" @click="message = null">Đóng</button>
    </div>

    <div v-if="loading" class="space-y-4">
      <FhSkeleton height="140px" />
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FhSkeleton height="250px" />
        <FhSkeleton height="250px" />
      </div>
    </div>

    <template v-else-if="profile">
      <!-- Identity & Verification Banner -->
      <div class="bg-white rounded-[var(--radius-md)] border border-ink-200 p-6 shadow-[var(--shadow-e1)] flex flex-col sm:flex-row items-center gap-6">
        <div class="w-20 h-20 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-2xl shrink-0 shadow-md">
          {{ authStore.user?.fullName?.charAt(0) ?? 'T' }}
        </div>

        <div class="flex-1 space-y-2 text-center sm:text-left">
          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 class="text-xl font-bold text-ink-900">{{ authStore.user?.fullName }}</h2>
            <span
              class="text-xs px-2.5 py-0.5 rounded font-bold uppercase"
              :class="profile.verificationStatus === 'APPROVED' ? 'bg-success-50 text-success-700 border border-success-200' : (profile.verificationStatus === 'PENDING' ? 'bg-warning-50 text-warning-700 border border-warning-200' : 'bg-ink-100 text-ink-600')"
            >
              {{ profile.verificationStatus === 'APPROVED' ? 'Đã xác thực Admin' : (profile.verificationStatus === 'PENDING' ? 'Chờ Admin duyệt' : 'Chưa xác thực') }}
            </span>
          </div>

          <p class="text-xs text-ink-600 max-w-xl">
            {{ profile.bio || 'Chưa cập nhật phần giới thiệu kinh nghiệm bản thân.' }}
          </p>

          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-1 text-xs text-ink-500">
            <span class="flex items-center gap-1 font-semibold text-amber-600">
              ★ {{ Number(profile.averageRating).toFixed(2) }} ({{ profile.ratingCount }} đánh giá)
            </span>
            <span>•</span>
            <span class="flex items-center gap-1">
              <Briefcase :size="14" class="text-brand-600" />
              {{ profile.yearsExperience }} năm kinh nghiệm
            </span>
            <span>•</span>
            <span class="text-success-600 font-semibold">
              Độ tin cậy: {{ profile.reliabilityScore }}/100
            </span>
          </div>
        </div>
      </div>

      <!-- Edit Profile Bio & Experience Form -->
      <FhCard title="Thông tin cá nhân & Giới thiệu">
        <form class="space-y-4 text-xs" @submit.prevent="handleSaveProfile">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Số năm kinh nghiệm làm nghề:</label>
              <input
                v-model.number="editYearsExperience"
                type="number"
                min="0"
                max="50"
                class="w-full h-9 px-3 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
              />
            </div>

            <div class="flex items-center gap-3 pt-5">
              <input
                id="isAvailableToggle"
                v-model="editIsAvailable"
                type="checkbox"
                class="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <label for="isAvailableToggle" class="font-semibold text-ink-800 cursor-pointer">
                Sẵn sàng nhận các cuốc sửa chữa mới
              </label>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-ink-700 mb-1">Tiểu sử & Chuyên môn:</label>
            <textarea
              v-model="editBio"
              rows="3"
              placeholder="Mô tả kỹ năng, thế mạnh, các dòng máy thiết bị bạn chuyên sửa chữa..."
              class="w-full p-3 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
            />
          </div>

          <div class="flex justify-end">
            <FhButton type="submit" variant="primary" size="sm" :disabled="actionLoading">
              Lưu thay đổi hồ sơ
            </FhButton>
          </div>
        </form>
      </FhCard>

      <!-- Skills & Service Areas Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Verified Skills -->
        <FhCard title="Dịch vụ & Kỹ năng kỹ thuật viên">
          <template #action>
            <span class="text-[11px] text-ink-400 font-mono">{{ skills.length }} dịch vụ</span>
          </template>

          <div v-if="skills.length === 0" class="py-8 text-center text-xs text-ink-400 italic">
            Chưa có dịch vụ nào trong danh sách kỹ năng.
          </div>

          <div v-else class="space-y-2.5">
            <div
              v-for="skill in skills"
              :key="skill.id"
              class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200/80 flex items-center justify-between"
            >
              <div class="flex items-center gap-2">
                <CheckCircle2 :size="15" class="text-brand-600 shrink-0" />
                <span class="text-xs font-semibold text-ink-800">
                  {{ skill.service?.name || 'Dịch vụ FixHome' }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="skill.listedLaborPrice" class="text-[11px] font-num text-brand-700 font-bold">
                  <FhMoney :amount="skill.listedLaborPrice" />
                </span>
                <span class="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-white text-brand-700 border border-brand-200">
                  {{ skill.level }}
                </span>
              </div>
            </div>
          </div>
        </FhCard>

        <!-- Service Areas -->
        <FhCard title="Khu vực phục vụ hoạt động">
          <template #action>
            <span class="text-[11px] text-ink-400 font-mono">{{ serviceAreas.length }} khu vực</span>
          </template>

          <div class="space-y-4 text-xs">
            <!-- Add Area Form -->
            <div class="flex gap-2">
              <select
                v-model="newProvinceCode"
                class="h-8 px-2 bg-white border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
              >
                <option value="HCM">TP. HCM</option>
                <option value="HN">Hà Nội</option>
                <option value="DN">Đà Nẵng</option>
              </select>
              <input
                v-model="newDistrictCode"
                type="text"
                placeholder="Nhập tên quận/huyện..."
                class="flex-1 h-8 px-2 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
              />
              <FhButton variant="primary" size="sm" :disabled="actionLoading" @click="handleAddArea">
                <Plus :size="14" /> Thêm
              </FhButton>
            </div>

            <!-- Areas List -->
            <div v-if="serviceAreas.length === 0" class="py-6 text-center text-xs text-ink-400 italic">
              Chưa có khu vực phục vụ nào được thiết lập. Hãy thêm quận/huyện để hệ thống matching đơn hàng.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="area in serviceAreas"
                :key="area.id || area.districtCode"
                class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200/80 flex items-center justify-between"
              >
                <div class="flex items-center gap-2">
                  <MapPin :size="15" class="text-brand-600 shrink-0" />
                  <span class="text-xs font-medium text-ink-800">{{ area.districtCode }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-[11px] text-ink-500">{{ area.provinceCode }}</span>
                  <button
                    class="text-ink-400 hover:text-danger-500"
                    title="Xoá khu vực"
                    @click="handleRemoveArea(area.districtCode)"
                  >
                    <Trash2 :size="13" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </FhCard>
      </div>
    </template>
  </div>
</template>
