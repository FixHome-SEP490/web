<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  MapPin,
  CheckCircle2,
  Calendar,
  Clock,
  Briefcase,
  AlertCircle,
} from 'lucide-vue-next';
import { FhButton, FhCard, FhStatusPill, FhMoney } from '../../components';
import { useAuthStore } from '../../stores/auth';
import { technicianProfileApi, type TechnicianProfileView } from '../../api/technician-profile.api';
import {
  technicianVerificationApi,
  type MyVerification,
} from '../../api/technician-verification.api';

const DAY_LABELS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const authStore = useAuthStore();

const loading = ref(true);
const profile = ref<TechnicianProfileView | null>(null);
const verification = ref<MyVerification | null>(null);

const bioDraft = ref('');
const yearsExperienceDraft = ref(0);
const isAvailable = ref(true);
const isSaving = ref(false);
const saveSuccess = ref(false);
const errorMessage = ref('');

const verificationStatus = computed(() => verification.value?.status ?? 'PENDING');
const verificationLabel = computed(() => {
  switch (verificationStatus.value) {
    case 'VERIFIED':
      return 'ĐÃ XÁC THỰC LÝ LỊCH';
    case 'REJECTED':
      return 'HỒ SƠ BỊ TỪ CHỐI';
    default:
      return verification.value ? 'ĐANG CHỜ DUYỆT' : 'CHƯA XÁC MINH';
  }
});

const sortedSchedules = computed(() =>
  [...(profile.value?.schedules ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
);

const loadData = async () => {
  loading.value = true;
  try {
    const [profileData, verificationData] = await Promise.all([
      technicianProfileApi.getMyProfile(),
      technicianVerificationApi.getMyVerification(),
    ]);
    profile.value = profileData;
    verification.value = verificationData;
    bioDraft.value = profileData.bio ?? '';
    yearsExperienceDraft.value = profileData.yearsExperience;
    isAvailable.value = profileData.isAvailable;
  } catch {
    errorMessage.value = 'Không thể tải hồ sơ kỹ thuật viên. Vui lòng tải lại trang.';
  } finally {
    loading.value = false;
  }
};

onMounted(loadData);

const handleSaveProfile = async () => {
  isSaving.value = true;
  saveSuccess.value = false;
  errorMessage.value = '';
  try {
    profile.value = await technicianProfileApi.updateMyProfile({
      bio: bioDraft.value.trim(),
      yearsExperience: yearsExperienceDraft.value,
      isAvailable: isAvailable.value,
    });
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 3000);
  } catch {
    errorMessage.value = 'Không thể cập nhật hồ sơ. Vui lòng thử lại.';
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight">
          Hồ sơ Kỹ thuật viên & Kỹ năng
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Hồ sơ nghiệp vụ đã được Service Manager xác thực danh tính và chứng chỉ hành nghề.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs font-semibold text-ink-700">Trạng thái nhận việc:</span>
        <button
          class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5"
          :class="isAvailable ? 'bg-success-50 text-success-700 border border-success-200' : 'bg-ink-100 text-ink-600'"
          @click="isAvailable = !isAvailable"
        >
          <span class="w-2 h-2 rounded-full" :class="isAvailable ? 'bg-success-500' : 'bg-ink-400'"></span>
          {{ isAvailable ? 'Đang sẵn sàng' : 'Tạm dừng nhận việc' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400 text-xs">Đang tải hồ sơ...</div>

    <template v-else-if="profile">
      <div
        v-if="errorMessage"
        class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2 bg-danger-50 text-danger-800 border border-danger-200"
      >
        <AlertCircle :size="16" class="text-danger-600 shrink-0" />
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Identity & Verification Banner -->
      <div class="bg-white rounded-[var(--radius-md)] border border-ink-200 p-6 shadow-[var(--shadow-e1)] flex flex-col sm:flex-row items-center gap-6">
        <div class="w-20 h-20 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-2xl shrink-0 shadow-md">
          {{ authStore.user?.fullName?.charAt(0) ?? 'T' }}
        </div>

        <div class="flex-1 space-y-2 text-center sm:text-left">
          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 class="text-xl font-bold text-ink-900">{{ authStore.user?.fullName }}</h2>
            <FhStatusPill :status="verificationStatus" :label="verificationLabel" />
          </div>

          <p v-if="verificationStatus !== 'VERIFIED'" class="text-xs">
            <router-link to="/tech/kyc" class="text-brand-600 font-semibold hover:underline">
              Hoàn tất xác minh KYC →
            </router-link>
          </p>

          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-1 text-xs text-ink-500">
            <span class="flex items-center gap-1 font-semibold text-amber-600">
              ★ {{ profile.averageRating }} ({{ profile.ratingCount }} đánh giá)
            </span>
            <span>•</span>
            <span class="flex items-center gap-1">
              <Briefcase :size="14" class="text-brand-600" />
              {{ profile.yearsExperience }} năm kinh nghiệm
            </span>
            <span>•</span>
            <span class="text-success-600 font-semibold">
              Độ tin cậy: {{ profile.reliabilityScore }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Editable profile fields -->
      <FhCard title="Chỉnh sửa hồ sơ">
        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-semibold text-ink-700 mb-1.5">Giới thiệu bản thân</label>
            <textarea
              v-model="bioDraft"
              rows="4"
              maxlength="2000"
              class="w-full px-3.5 py-2.5 bg-white border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600"
              placeholder="Giới thiệu ngắn về kinh nghiệm, chuyên môn của bạn..."
            />
          </div>

          <div class="max-w-xs">
            <label class="block font-semibold text-ink-700 mb-1.5">Số năm kinh nghiệm</label>
            <input
              v-model.number="yearsExperienceDraft"
              type="number"
              min="0"
              max="80"
              class="w-full h-10 px-3.5 bg-white border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 font-num"
            />
          </div>

          <div class="flex items-center justify-between pt-2">
            <span v-if="saveSuccess" class="text-xs font-semibold text-success-600 flex items-center gap-1">
              <CheckCircle2 :size="14" /> Đã lưu thay đổi
            </span>
            <span v-else></span>
            <FhButton :loading="isSaving" @click="handleSaveProfile">Lưu thay đổi</FhButton>
          </div>
        </div>
      </FhCard>

      <!-- Skills & Service Areas Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Verified Skills -->
        <FhCard title="Kỹ năng chuyên môn đã duyệt">
          <div v-if="profile.skills.length === 0" class="text-xs text-ink-400 py-2">
            Chưa có kỹ năng nào được đăng ký.
          </div>
          <div class="space-y-2.5">
            <div
              v-for="skill in profile.skills"
              :key="skill.serviceName"
              class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200/80 flex items-center justify-between"
            >
              <div class="flex items-center gap-2">
                <CheckCircle2 :size="15" class="text-brand-600 shrink-0" />
                <span class="text-xs font-semibold text-ink-800">{{ skill.serviceName }}</span>
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
        <FhCard title="Khu vực hoạt động đăng ký">
          <div v-if="profile.serviceAreas.length === 0" class="text-xs text-ink-400 py-2">
            Chưa đăng ký khu vực hoạt động.
          </div>
          <div class="space-y-2.5">
            <div
              v-for="area in profile.serviceAreas"
              :key="`${area.provinceCode}-${area.districtCode}`"
              class="p-2.5 rounded-[var(--radius-sm)] bg-ink-50 border border-ink-200/80 flex items-center justify-between"
            >
              <div class="flex items-center gap-2">
                <MapPin :size="15" class="text-brand-600 shrink-0" />
                <span class="text-xs font-medium text-ink-800">{{ area.districtCode }}</span>
              </div>
              <span class="text-[11px] text-ink-500">{{ area.provinceCode }}</span>
            </div>
          </div>
        </FhCard>
      </div>

      <!-- Working Schedule -->
      <FhCard title="Khung giờ nhận việc tiêu chuẩn">
        <div v-if="sortedSchedules.length === 0" class="text-xs text-ink-400 py-2">
          Chưa cấu hình lịch làm việc.
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div
            v-for="slot in sortedSchedules"
            :key="`${slot.dayOfWeek}-${slot.startTime}`"
            class="p-3 rounded-[var(--radius-sm)] bg-white border border-ink-200 flex items-center justify-between"
          >
            <span class="font-semibold text-ink-700 flex items-center gap-1.5">
              <Calendar :size="14" class="text-brand-600" /> {{ DAY_LABELS[slot.dayOfWeek] }}
            </span>
            <span class="font-num font-bold text-brand-700 flex items-center gap-1">
              <Clock :size="13" /> {{ slot.startTime }} – {{ slot.endTime }}
            </span>
          </div>
        </div>

        <p class="text-[11px] text-ink-400 mt-4 flex items-center gap-1">
          <AlertCircle :size="13" />
          Để thay đổi khu vực hoạt động hoặc kỹ năng chuyên môn, vui lòng liên hệ Service Manager khu vực.
        </p>
      </FhCard>
    </template>
  </div>
</template>
