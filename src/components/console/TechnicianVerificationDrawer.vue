<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  X,
  CheckCircle2,
  XCircle,
  User,
  MapPin,
  Briefcase,
  FileBadge,
  Loader2,
  Image as ImageIcon,
  Video,
} from 'lucide-vue-next';
import type { TechnicianVerification } from '../../api/admin-verifications.api';
import { adminVerificationsApi } from '../../api/admin-verifications.api';
import { vietnamProvincesApi, type Province } from '../../api/vietnam-provinces.api';

const props = defineProps<{
  open: boolean;
  verification: TechnicianVerification | null;
  loadingApprove?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'approve', verification: TechnicianVerification): void;
  (e: 'reject', verification: TechnicianVerification): void;
  (e: 'preview', title: string, url: string): void;
}>();

const close = () => {
  emit('update:open', false);
};

const provinces = ref<Province[]>([]);
watch(() => props.open, async (isOpen) => {
  if (isOpen && provinces.value.length === 0) {
    try {
      provinces.value = await vietnamProvincesApi.getProvincesWithDistricts();
    } catch (e) {
      console.error('Failed to fetch provinces', e);
    }
  }
}, { immediate: true });

// Map document types to human readable formats and categorize them
const documents = computed(() => {
  if (!props.verification?.documents) return [];
  return props.verification.documents;
});

const frontIdDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'citizen_id_front'));
const backIdDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'citizen_id_back'));
const facePhotoDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'face_photo'));
const faceVideoDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'face_video'));

const technician = computed(() => props.verification?.technician);

// Profile fields read from the verification record the backend sends; a field it
// does not send stays null and the drawer shows a dash, never a made-up value.
const profileInfo = computed(() => {
  const v = props.verification;
  if (!v) return null;
  return {
    cccd: v.identityCardNumber || null,
    dob: v.dateOfBirth || null,
    gender: v.gender || null,
    yearsExperience: v.yearsExperience || null,
    skills: v.skills || [],
    bio: v.bio || null,
    address: v.address || null,
    serviceRadiusKm: v.serviceRadiusKm || null,
    serviceAreas: v.serviceAreas || [],
  };
});

const formattedServiceAreas = computed(() => {
  if (!profileInfo.value?.serviceAreas?.length) return [];
  if (!provinces.value.length) return profileInfo.value.serviceAreas;

  return profileInfo.value.serviceAreas.map(areaStr => {
    // Expected format: `${districtCode}, ${provinceCode}`
    const parts = areaStr.split(',').map(s => s.trim());
    if (parts.length === 2) {
      const districtCode = Number(parts[0]);
      const provinceCode = Number(parts[1]);
      const province = provinces.value.find(p => p.code === provinceCode);
      if (province && province.districts) {
        const district = province.districts.find(d => d.code === districtCode);
        if (district) {
          return `${district.name}, ${province.name}`;
        }
      }
    }
    return areaStr;
  });
});

const documentUrls = ref<Record<string, string>>({});
const isLoadingUrls = ref(false);

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.verification) {
    isLoadingUrls.value = true;
    documentUrls.value = {};
    const promises = props.verification.documents.map(async (doc) => {
      if (doc.id) {
        try {
          const url = await adminVerificationsApi.getDocumentAccess(props.verification!.id, doc.id);
          documentUrls.value[doc.id] = url;
        } catch (e) {
          console.error(e);
        }
      }
    });
    await Promise.all(promises);
    isLoadingUrls.value = false;
  } else {
    documentUrls.value = {};
  }
});

const handleApprove = () => {
  if (props.verification) {
    emit('approve', props.verification);
  }
};

const handleReject = () => {
  if (props.verification) {
    emit('reject', props.verification);
  }
};

const handlePreview = (title: string, documentId: string) => {
  // We emit the preview event to the parent so it can use its existing preview modal logic 
  // which calls the secure access API
  emit('preview', title, documentId);
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
};

const STATUS_TEXT: Record<string, string> = { PENDING: 'Đang chờ duyệt', VERIFIED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const statusText = computed(() => STATUS_TEXT[String(props.verification?.status ?? '').toUpperCase()] ?? 'Trạng thái chưa xác định');
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="fixed inset-0 z-50 flex justify-end">
      <!-- Backdrop -->
      <div 
        class="absolute inset-0 bg-black/50 backdrop-blur-sm drawer-backdrop" 
        @click="close"
      ></div>
      
      <!-- Panel -->
      <div
        class="relative w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col drawer-panel"
      >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <div class="flex flex-col">
          <h2 class="text-xl font-bold text-gray-900 flex items-center gap-2">
            Hồ sơ kỹ thuật viên
          </h2>
          <p class="flex flex-wrap items-center gap-2 text-sm text-gray-500 font-medium">
            {{ technician?.fullName || 'Kỹ thuật viên' }}
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  :class="{
                    'bg-amber-100 text-amber-700': verification?.status === 'PENDING',
                    'bg-green-100 text-green-700': verification?.status === 'VERIFIED',
                    'bg-red-100 text-red-700': verification?.status === 'REJECTED'
                  }">
              {{ statusText }}
            </span>
          </p>
        </div>
        <button
          type="button"
          class="p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Đóng"
          @click="close"
        >
          <X :size="24" />
        </button>
      </div>

      <!-- Body -->
      <div v-if="verification" class="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
        
        <!-- 1. Thông tin cá nhân & Pháp lý -->
        <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
            <User class="text-brand-600" :size="20" />
            Thông tin cá nhân
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Họ và tên đầy đủ</p>
              <p class="text-sm font-semibold text-gray-900">{{ technician?.fullName || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Số CCCD / Định danh</p>
              <p class="text-sm font-mono font-semibold text-gray-900">{{ profileInfo?.cccd || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Ngày sinh</p>
              <p class="text-sm font-semibold text-gray-900">{{ formatDate(profileInfo?.dob || '') }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Giới tính</p>
              <p class="text-sm font-semibold text-gray-900">{{ profileInfo?.gender || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Số điện thoại</p>
              <p class="text-sm font-mono font-semibold text-gray-900">{{ technician?.phoneNumber || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Email</p>
              <p class="text-sm font-semibold text-gray-900">{{ technician?.email || '—' }}</p>
            </div>
          </div>
        </section>

        <!-- 2. Hồ sơ định danh eKYC -->
        <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
            <FileBadge class="text-brand-600" :size="20" />
            Giấy tờ xác minh
          </h3>
          
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
            <!-- Mặt trước -->
            <div class="space-y-2">
              <p class="text-xs font-semibold text-gray-600 text-center">CCCD mặt trước</p>
              <button 
                class="w-full aspect-[1.6/1] bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group p-1"
                @click="frontIdDoc?.id ? handlePreview('CCCD mặt trước', frontIdDoc.id) : null"
                :disabled="!frontIdDoc?.id"
                title="Nhấn để xem lớn"
              >
                <template v-if="frontIdDoc?.id">
                  <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                    <Loader2 class="animate-spin text-brand-500" :size="24" />
                  </div>
                  <img v-else-if="documentUrls[frontIdDoc.id]" :src="documentUrls[frontIdDoc.id]" class="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform" />
                  <div v-else class="flex flex-col items-center gap-2">
                    <ImageIcon class="text-brand-500 group-hover:scale-110 transition-transform" :size="32" />
                    <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                  </div>
                </template>
                <span v-else class="text-xs font-medium text-gray-400">Chưa tải lên</span>
              </button>
            </div>
            
            <!-- Mặt sau -->
            <div class="space-y-2">
              <p class="text-xs font-semibold text-gray-600 text-center">CCCD mặt sau</p>
              <button 
                class="w-full aspect-[1.6/1] bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group p-1"
                @click="backIdDoc?.id ? handlePreview('CCCD mặt sau', backIdDoc.id) : null"
                :disabled="!backIdDoc?.id"
                title="Nhấn để xem lớn"
              >
                <template v-if="backIdDoc?.id">
                  <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                    <Loader2 class="animate-spin text-brand-500" :size="24" />
                  </div>
                  <img v-else-if="documentUrls[backIdDoc.id]" :src="documentUrls[backIdDoc.id]" class="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform" />
                  <div v-else class="flex flex-col items-center gap-2">
                    <ImageIcon class="text-brand-500 group-hover:scale-110 transition-transform" :size="32" />
                    <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                  </div>
                </template>
                <span v-else class="text-xs font-medium text-gray-400">Chưa tải lên</span>
              </button>
            </div>
            
            <!-- Chân dung / Video -->
            <div class="space-y-2">
              <p class="text-xs font-semibold text-gray-600 text-center">Khuôn mặt</p>
              <button 
                class="w-full aspect-[1.6/1] bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group p-1"
                @click="(facePhotoDoc?.id || faceVideoDoc?.id) ? handlePreview('Xác minh khuôn mặt', (facePhotoDoc?.id || faceVideoDoc?.id) as string) : null"
                :disabled="!facePhotoDoc?.id && !faceVideoDoc?.id"
                title="Nhấn để xem lớn"
              >
                <template v-if="facePhotoDoc?.id || faceVideoDoc?.id">
                  <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                    <Loader2 class="animate-spin text-brand-500" :size="24" />
                  </div>
                  <template v-else-if="facePhotoDoc?.id && documentUrls[facePhotoDoc.id]">
                    <img :src="documentUrls[facePhotoDoc.id]" class="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform" />
                  </template>
                  <template v-else-if="faceVideoDoc?.id && documentUrls[faceVideoDoc.id]">
                    <div class="w-full h-full relative rounded-lg overflow-hidden bg-black flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Video class="text-white opacity-70 absolute z-10" :size="32" />
                      <video :src="documentUrls[faceVideoDoc.id]" class="w-full h-full object-cover opacity-50"></video>
                    </div>
                  </template>
                  <div v-else class="flex flex-col items-center gap-2">
                    <Video v-if="faceVideoDoc" class="text-brand-500 group-hover:scale-110 transition-transform" :size="32" />
                    <ImageIcon v-else-if="facePhotoDoc" class="text-brand-500 group-hover:scale-110 transition-transform" :size="32" />
                    <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                  </div>
                </template>
                <span v-else class="text-xs font-medium text-gray-400">Chưa tải lên</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 3. Chuyên môn & Kinh nghiệm -->
        <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
            <Briefcase class="text-brand-600" :size="20" />
            Chuyên môn
          </h3>
          
          <div class="space-y-5">
            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm font-medium text-gray-500">Kinh nghiệm</span>
              <span class="inline-flex items-center justify-center px-3 py-1 bg-brand-50 text-brand-700 font-bold text-sm rounded-lg border border-brand-100">
                {{ profileInfo?.yearsExperience != null ? `${profileInfo.yearsExperience} năm` : '—' }}
              </span>
            </div>
            
            <div>
              <p class="text-sm font-medium text-gray-500 mb-2">Dịch vụ đăng ký</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="(skill, index) in profileInfo?.skills" :key="index" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-800 text-sm font-semibold rounded-lg border border-gray-200">
                  {{ skill.name }}
                  <span class="text-xs font-normal text-gray-500 bg-white px-1.5 rounded border border-gray-200">{{ skill.level }}</span>
                </span>
                <span v-if="!profileInfo?.skills?.length" class="text-sm text-gray-400 font-medium italic">Chưa cập nhật</span>
              </div>
            </div>
            
            <div>
              <p class="text-sm font-medium text-gray-500 mb-2">Giới thiệu</p>
              <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm text-gray-700 leading-relaxed italic">
                {{ profileInfo?.bio ? `"${profileInfo.bio}"` : 'Chưa cập nhật giới thiệu' }}
              </div>
            </div>
          </div>
        </section>

        <!-- 4. Địa chỉ & Khu vực hoạt động -->
        <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
            <MapPin class="text-brand-600" :size="20" />
            Địa chỉ và khu vực
          </h3>
          
          <div class="space-y-4">
            <div>
              <p class="text-xs text-gray-500 font-medium mb-1">Địa chỉ</p>
              <p class="text-sm font-semibold text-gray-900">{{ profileInfo?.address || '—' }}</p>
            </div>
            
            <div>
              <p class="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
 Bán kính nhận việc
                <span class="font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">{{ profileInfo?.serviceRadiusKm != null ? `${profileInfo.serviceRadiusKm} km` : '—' }}</span>
              </p>
              <p class="text-sm font-medium text-gray-500 mb-2 mt-4">Khu vực nhận việc</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="area in formattedServiceAreas" :key="area" class="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-md border border-green-200">
                  {{ area }}
                </span>
                <span v-if="!formattedServiceAreas.length" class="text-sm text-gray-400 font-medium italic">Chưa cập nhật</span>
              </div>
            </div>
          </div>
        </section>
        
      </div>

      <!-- Footer Actions -->
      <div v-if="verification?.status === 'PENDING'" class="p-6 bg-white border-t border-gray-100 shrink-0 flex items-center justify-between">
        <button 
          @click="close"
          class="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors focus:ring-4 focus:ring-gray-100"
        >
          Đóng
        </button>
        <div class="flex gap-3">
          <button 
            @click="handleReject"
            class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors focus:ring-4 focus:ring-red-50"
            :disabled="loadingApprove"
          >
            <XCircle :size="18" />
            Từ chối
          </button>
          <button 
            @click="handleApprove"
            class="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-colors focus:ring-4 focus:ring-green-100 shadow-sm disabled:opacity-70"
            :disabled="loadingApprove"
          >
            <Loader2 v-if="loadingApprove" class="animate-spin" :size="18" />
            <CheckCircle2 v-else :size="18" />
            Duyệt hồ sơ
          </button>
        </div>
      </div>
      <div v-else class="p-6 bg-white border-t border-gray-100 shrink-0 flex items-center justify-end">
         <button 
          @click="close"
          class="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors focus:ring-4 focus:ring-gray-100"
        >
          Đóng
        </button>
      </div>
    </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

/* Animate the panel sliding in/out */
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(100%);
}
</style>
