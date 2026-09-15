<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Upload,
} from 'lucide-vue-next';
import { FhCard, FhButton, FhSkeleton } from '../../components';
import {
  techniciansApi,
  type VerificationData,
  type VerificationDocument,
} from '../../api/technicians.api';

const loading = ref(true);
const actionLoading = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const verification = ref<VerificationData | null>(null);

// Form for submission
const citizenIdFront = ref('');
const citizenIdBack = ref('');
const certificateUrl = ref('');

const loadVerification = async () => {
  try {
    loading.value = true;
    error.value = null;
    verification.value = await techniciansApi.getVerification();
  } catch {
    // If not submitted yet, API might return 404 or empty
    verification.value = { status: 'NOT_SUBMITTED' };
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadVerification();
});

const handleSubmitKYC = async () => {
  if (!citizenIdFront.value.trim() || !citizenIdBack.value.trim()) {
    error.value = 'Vui lòng cung cấp đầy đủ liên kết ảnh CCCD/CMND mặt trước và mặt sau!';
    return;
  }

  try {
    actionLoading.value = true;
    error.value = null;
    successMessage.value = null;

    const documents: VerificationDocument[] = [
      {
        documentType: 'CITIZEN_ID_FRONT',
        fileUrl: citizenIdFront.value.trim(),
        fileName: 'citizen_id_front.jpg',
        fileSize: 1024 * 500,
        mimeType: 'image/jpeg',
      },
      {
        documentType: 'CITIZEN_ID_BACK',
        fileUrl: citizenIdBack.value.trim(),
        fileName: 'citizen_id_back.jpg',
        fileSize: 1024 * 500,
        mimeType: 'image/jpeg',
      },
    ];

    if (certificateUrl.value.trim()) {
      documents.push({
        documentType: 'TECHNICAL_CERTIFICATE',
        fileUrl: certificateUrl.value.trim(),
        fileName: 'technical_certificate.jpg',
        fileSize: 1024 * 800,
        mimeType: 'image/jpeg',
      });
    }

    await techniciansApi.submitVerification(documents);
    successMessage.value = 'Hồ sơ xác minh đã được gửi thành công! Quản trị viên (Admin) sẽ xét duyệt hồ sơ của bạn.';
    await loadVerification();
  } catch (err) {
    error.value = (err as Error)?.message || 'Không thể gửi hồ sơ xác minh.';
  } finally {
    actionLoading.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
        <ShieldCheck class="text-brand-600" :size="24" />
        Xác Minh Danh Tính & Năng Lực (KYC)
      </h1>
      <p class="text-xs text-ink-500 mt-1">
        Quy định FixHome: Tất cả kỹ thuật viên phải được Quản trị viên (Admin) phê duyệt hồ sơ CCCD và chứng chỉ hành nghề trước khi nhận việc.
      </p>
    </div>

    <!-- Alert / Feedback -->
    <div
      v-if="error"
      class="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700 text-xs flex items-center justify-between"
    >
      <span>{{ error }}</span>
      <button class="font-bold underline" @click="error = null">Đóng</button>
    </div>

    <div
      v-if="successMessage"
      class="p-4 bg-success-50 border border-success-200 rounded-lg text-success-800 text-xs flex items-center gap-2"
    >
      <CheckCircle2 :size="16" />
      <span>{{ successMessage }}</span>
    </div>

    <div v-if="loading" class="space-y-4">
      <FhSkeleton height="120px" />
      <FhSkeleton height="260px" />
    </div>

    <div v-else class="space-y-6">
      <!-- Status Card -->
      <FhCard title="Trạng thái xác minh hồ sơ">
        <div class="space-y-4 text-xs">
          <!-- APPROVED -->
          <div
            v-if="verification?.status === 'APPROVED'"
            class="p-4 rounded-lg bg-success-50 border border-success-200 text-success-900 flex items-start gap-3"
          >
            <ShieldCheck :size="24" class="text-success-600 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-sm">Hồ sơ đã được phê duyệt (APPROVED)</h4>
              <p class="text-success-700 mt-1">
                Tài khoản kỹ thuật viên của bạn đã được Quản trị viên (Admin) xác minh đầy đủ. Bạn có thể bật trạng thái sẵn sàng và nhận các yêu cầu sửa chữa trên toàn hệ thống FixHome.
              </p>
            </div>
          </div>

          <!-- PENDING -->
          <div
            v-else-if="verification?.status === 'PENDING'"
            class="p-4 rounded-lg bg-warning-50 border border-warning-200 text-warning-900 flex items-start gap-3"
          >
            <Clock :size="24" class="text-warning-600 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-sm">Hồ sơ đang chờ xét duyệt (PENDING)</h4>
              <p class="text-warning-700 mt-1">
                Hồ sơ định danh của bạn đã được ghi nhận vào hệ thống và đang trong hàng đợi xử lý của Quản trị viên (Admin). Quá trình này thường diễn ra trong vòng 24 giờ làm việc.
              </p>
            </div>
          </div>

          <!-- REJECTED -->
          <div
            v-else-if="verification?.status === 'REJECTED'"
            class="p-4 rounded-lg bg-danger-50 border border-danger-200 text-danger-900 flex items-start gap-3"
          >
            <ShieldAlert :size="24" class="text-danger-600 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-sm">Hồ sơ bị từ chối (REJECTED)</h4>
              <p class="text-danger-700 mt-1">
                Lý do từ chối: <strong>{{ verification.rejectReason || 'Thông tin tài liệu không hợp lệ hoặc hình ảnh mờ.' }}</strong>
              </p>
              <p class="text-danger-600 mt-1">
                Vui lòng kiểm tra lại tài liệu và gửi lại hồ sơ xác minh bên dưới.
              </p>
            </div>
          </div>

          <!-- NOT_SUBMITTED -->
          <div
            v-else
            class="p-4 rounded-lg bg-ink-50 border border-ink-200 text-ink-700 flex items-start gap-3"
          >
            <AlertCircle :size="24" class="text-ink-500 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-sm text-ink-900">Chưa nộp hồ sơ xác minh (NOT_SUBMITTED)</h4>
              <p class="text-ink-500 mt-1">
                Bạn cần hoàn thiện thông tin định danh và tải lên ảnh CCCD để được Admin kích hoạt quyền nhận việc.
              </p>
            </div>
          </div>
        </div>
      </FhCard>

      <!-- Submission Form (Visible if NOT_SUBMITTED or REJECTED) -->
      <FhCard
        v-if="!verification || verification.status === 'NOT_SUBMITTED' || verification.status === 'REJECTED'"
        title="Nộp hồ sơ định danh kỹ thuật viên"
      >
        <form class="space-y-4 text-xs" @submit.prevent="handleSubmitKYC">
          <p class="text-ink-500">
            Điền URL ảnh lưu trữ đám mây (Cloudinary) cho tài liệu định danh của bạn:
          </p>

          <div class="space-y-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">
                Ảnh CCCD / CMND mặt trước <span class="text-danger-500">*</span>:
              </label>
              <div class="flex items-center gap-2">
                <input
                  v-model="citizenIdFront"
                  type="url"
                  placeholder="https://res.cloudinary.com/demo/image/upload/id_front.jpg"
                  required
                  class="w-full h-9 px-3 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600 font-mono"
                />
              </div>
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1">
                Ảnh CCCD / CMND mặt sau <span class="text-danger-500">*</span>:
              </label>
              <div class="flex items-center gap-2">
                <input
                  v-model="citizenIdBack"
                  type="url"
                  placeholder="https://res.cloudinary.com/demo/image/upload/id_back.jpg"
                  required
                  class="w-full h-9 px-3 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600 font-mono"
                />
              </div>
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1">
                Chứng chỉ nghề / Bằng cấp kỹ thuật (Tuỳ chọn):
              </label>
              <div class="flex items-center gap-2">
                <input
                  v-model="certificateUrl"
                  type="url"
                  placeholder="https://res.cloudinary.com/demo/image/upload/certificate.jpg"
                  class="w-full h-9 px-3 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600 font-mono"
                />
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-ink-100 flex justify-end">
            <FhButton
              type="submit"
              variant="primary"
              size="md"
              :disabled="actionLoading"
            >
              <Upload :size="15" class="mr-1.5" />
              Gửi hồ sơ xác minh (Admin duyệt)
            </FhButton>
          </div>
        </form>
      </FhCard>
    </div>
  </div>
</template>
