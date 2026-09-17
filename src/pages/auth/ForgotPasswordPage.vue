<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, KeyRound } from 'lucide-vue-next';
import { FhButton } from '../../components';

const router = useRouter();
const authStore = useAuthStore();

// Steps: 1 = Enter Email, 2 = Enter OTP & New Password, 3 = Success
const currentStep = ref<1 | 2 | 3>(1);

const email = ref('');
const otp = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);

const errorMessage = ref('');
const successMessage = ref('');
const resendCooldown = ref(0);
let cooldownInterval: ReturnType<typeof setInterval> | null = null;

const startCooldown = (seconds = 60) => {
  resendCooldown.value = seconds;
  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    if (resendCooldown.value > 0) {
      resendCooldown.value -= 1;
    } else {
      if (cooldownInterval) clearInterval(cooldownInterval);
    }
  }, 1000);
};

// Step 1: Request OTP
const handleRequestOtp = async () => {
  if (!email.value) {
    errorMessage.value = 'Vui lòng nhập địa chỉ email của bạn';
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await authStore.forgotPassword(email.value.trim().toLowerCase());
    successMessage.value = res?.message || 'Mã OTP đặt lại mật khẩu đã được gửi đến email của bạn!';
    currentStep.value = 2;
    startCooldown(60);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
    errorMessage.value =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      'Không thể gửi yêu cầu đặt lại mật khẩu. Vui lòng thử lại.';
  }
};

// Step 2: Submit Reset Password
const handleResetPassword = async () => {
  if (!otp.value || otp.value.length !== 6) {
    errorMessage.value = 'Vui lòng nhập mã OTP 6 chữ số';
    return;
  }

  if (newPassword.value.length < 8) {
    errorMessage.value = 'Mật khẩu mới phải có ít nhất 8 ký tự';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Mật khẩu xác nhận không khớp';
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await authStore.resetPassword({
      email: email.value.trim().toLowerCase(),
      otp: otp.value.trim(),
      newPassword: newPassword.value,
    });
    successMessage.value = res?.message || 'Đặt lại mật khẩu thành công!';
    currentStep.value = 3;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
    errorMessage.value =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      'Đặt lại mật khẩu thất bại. Mã OTP có thể không đúng hoặc đã hết hạn.';
  }
};

// Resend OTP in Step 2
const handleResendOtp = async () => {
  if (resendCooldown.value > 0 || authStore.loading) return;

  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await authStore.forgotPassword(email.value.trim().toLowerCase());
    successMessage.value = res?.message || 'Mã OTP mới đã được gửi đến email của bạn!';
    startCooldown(60);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
    errorMessage.value =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      'Không thể gửi lại mã OTP. Vui lòng thử lại sau.';
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Back Navigation -->
    <div>
      <router-link
        to="/login"
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-brand-600 transition-colors group"
      >
        <ArrowLeft :size="15" class="transition-transform group-hover:-translate-x-0.5" />
        Quay lại đăng nhập
      </router-link>
    </div>

    <!-- Header Section -->
    <div class="space-y-2 text-center sm:text-left">
      <h2 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
        {{ currentStep === 3 ? 'Đổi mật khẩu thành công' : 'Quên mật khẩu' }}
      </h2>
      <p class="text-sm text-ink-500">
        <template v-if="currentStep === 1">
          Nhập địa chỉ email đăng ký để nhận mã OTP đặt lại mật khẩu.
        </template>
        <template v-else-if="currentStep === 2">
          Nhập mã OTP vừa nhận qua email và thiết lập mật khẩu mới.
        </template>
        <template v-else>
          Mật khẩu tài khoản của bạn đã được cập nhật an toàn.
        </template>
      </p>
    </div>

    <!-- Error Alert Box -->
    <div
      v-if="errorMessage"
      class="p-3.5 rounded-[var(--radius-sm)] bg-danger-50 border border-danger-200 text-danger-800 text-sm flex items-start gap-2.5"
    >
      <AlertCircle :size="18" class="text-danger-600 shrink-0 mt-0.5" />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Success Alert Box -->
    <div
      v-if="successMessage"
      class="p-3.5 rounded-[var(--radius-sm)] bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-2.5"
    >
      <CheckCircle2 :size="18" class="text-emerald-600 shrink-0 mt-0.5" />
      <span>{{ successMessage }}</span>
    </div>

    <!-- STEP 1: Enter Email -->
    <form v-if="currentStep === 1" class="space-y-4" @submit.prevent="handleRequestOtp">
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-ink-700 mb-1.5">
          Email tài khoản <span class="text-danger-600">*</span>
        </label>
        <div class="relative">
          <input
            v-model="email"
            type="email"
            required
            placeholder="example@fixhome.vn"
            class="w-full h-11 pl-10 pr-4 text-sm bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
          <Mail class="absolute left-3.5 top-3 text-ink-400" :size="17" />
        </div>
      </div>

      <FhButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :loading="authStore.loading"
        class="mt-2"
      >
        Gửi mã xác thực OTP
      </FhButton>
    </form>

    <!-- STEP 2: Enter OTP & New Password -->
    <form v-else-if="currentStep === 2" class="space-y-4" @submit.prevent="handleResetPassword">
      <!-- Target Email Badge -->
      <div class="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-brand-50 border border-brand-200 text-xs">
        <div class="flex items-center gap-2 text-brand-900">
          <Mail :size="15" class="text-brand-600" />
          <span>Mã gửi tới: <strong>{{ email }}</strong></span>
        </div>
        <button
          type="button"
          class="text-brand-600 hover:text-brand-800 font-semibold cursor-pointer underline"
          @click="currentStep = 1"
        >
          Đổi email
        </button>
      </div>

      <!-- OTP Input -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="block text-xs font-semibold uppercase tracking-wider text-ink-700">
            Mã xác thực OTP (6 chữ số) <span class="text-danger-600">*</span>
          </label>
          <button
            v-if="resendCooldown === 0"
            type="button"
            class="text-xs text-brand-600 hover:text-brand-700 font-semibold cursor-pointer"
            @click="handleResendOtp"
          >
            Gửi lại mã
          </button>
          <span v-else class="text-xs text-ink-400 font-num">
            Gửi lại sau {{ resendCooldown }}s
          </span>
        </div>
        <div class="relative">
          <input
            v-model="otp"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            required
            placeholder="123456"
            class="w-full h-11 pl-10 pr-4 text-sm font-bold tracking-widest bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-900 placeholder:text-ink-400 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
          <KeyRound class="absolute left-3.5 top-3 text-ink-400" :size="17" />
        </div>
      </div>

      <!-- New Password -->
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-ink-700 mb-1.5">
          Mật khẩu mới (≥ 8 ký tự) <span class="text-danger-600">*</span>
        </label>
        <div class="relative">
          <input
            v-model="newPassword"
            :type="showPassword ? 'text' : 'password'"
            required
            minlength="8"
            placeholder="••••••••"
            class="w-full h-11 pl-10 pr-11 text-sm bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
          <Lock class="absolute left-3.5 top-3 text-ink-400" :size="17" />
          <button
            type="button"
            class="absolute right-3.5 top-3 text-ink-400 hover:text-ink-600 p-0.5 cursor-pointer"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="17" />
          </button>
        </div>
      </div>

      <!-- Confirm New Password -->
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-ink-700 mb-1.5">
          Xác nhận mật khẩu mới <span class="text-danger-600">*</span>
        </label>
        <div class="relative">
          <input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            required
            placeholder="••••••••"
            class="w-full h-11 pl-10 pr-4 text-sm bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
          <Lock class="absolute left-3.5 top-3 text-ink-400" :size="17" />
        </div>
      </div>

      <FhButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :loading="authStore.loading"
        class="mt-2"
      >
        Cập nhật mật khẩu mới
      </FhButton>
    </form>

    <!-- STEP 3: Complete Success State -->
    <div v-else class="text-center space-y-5 py-4">
      <div class="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
        <CheckCircle2 :size="36" />
      </div>
      <p class="text-sm text-ink-600">
        Bạn có thể đăng nhập ngay bây giờ bằng mật khẩu mới của mình.
      </p>
      <FhButton
        variant="primary"
        size="lg"
        block
        @click="router.push('/login')"
      >
        Chuyển đến trang Đăng nhập
      </FhButton>
    </div>
  </div>
</template>
