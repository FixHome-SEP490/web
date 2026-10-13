<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  ArrowLeft,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  RotateCcw,
  Clock,
  KeyRound,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { extractApiErrorMessage, validateEmail } from '../../utils/input-validation';

const router = useRouter();
const authStore = useAuthStore();

// Steps:
// 1 = Enter Email
// 2 = Enter 6-digit OTP
// 3 = Enter New Password
// 4 = Complete Success
const currentStep = ref<1 | 2 | 3 | 4>(1);

const email = ref('');
const otpDigits = ref<string[]>(['', '', '', '', '', '']);
const otpInputRefs = ref<HTMLInputElement[]>([]);

const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const touchedEmail = ref(false);
const touchedNewPassword = ref(false);
const touchedConfirmPassword = ref(false);
const isPasswordFocused = ref(false);

const isCooldown = ref(false);
const resendCooldown = ref(0);
let cooldownInterval: ReturnType<typeof setInterval> | null = null;

// 5-minute expiry countdown for OTP
const expireSeconds = ref(300);
let expireInterval: ReturnType<typeof setInterval> | null = null;

// Validation rules
const emailIssue = computed(() => validateEmail(email.value));
const emailError = computed(() => (touchedEmail.value ? emailIssue.value : ''));

const isOtpComplete = computed(() => otpDigits.value.every((d) => d.length === 1));
const otpCode = computed(() => otpDigits.value.join(''));

const formattedExpireTime = computed(() => {
  if (expireSeconds.value <= 0) return 'Đã hết hạn';
  const m = Math.floor(expireSeconds.value / 60);
  const s = expireSeconds.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

const passwordRules = computed(() => ({
  minLength: newPassword.value.length >= 8,
  hasLower: /[a-z]/.test(newPassword.value),
  hasUpper: /[A-Z]/.test(newPassword.value),
  hasNumber: /[0-9]/.test(newPassword.value),
  hasSpecial: /[^A-Za-z0-9]/.test(newPassword.value),
}));

const strengthScore = computed(() => Object.values(passwordRules.value).filter(Boolean).length);
const barColors = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];

const passwordError = computed(() => {
  if (!touchedNewPassword.value) return '';
  if (!newPassword.value) return 'Mật khẩu không được bỏ trống';
  if (strengthScore.value < 5) return 'Mật khẩu chưa đủ điều kiện an toàn';
  return '';
});

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

const startExpireTimer = () => {
  expireSeconds.value = 300;
  if (expireInterval) clearInterval(expireInterval);
  expireInterval = setInterval(() => {
    if (expireSeconds.value > 0) {
      expireSeconds.value -= 1;
    } else {
      if (expireInterval) clearInterval(expireInterval);
    }
  }, 1000);
};

onUnmounted(() => {
  if (cooldownInterval) clearInterval(cooldownInterval);
  if (expireInterval) clearInterval(expireInterval);
});

const goToStep = (step: 1 | 2 | 3) => {
  currentStep.value = step;
  if (step === 2) {
    nextTick(() => {
      otpInputRefs.value[0]?.focus();
    });
  }
};

// Step 1: Request OTP
const handleRequestOtp = async () => {
  if (isCooldown.value || authStore.loading) return;
  touchedEmail.value = true;

  if (emailIssue.value) {
    toast.error(emailIssue.value);
    return;
  }

  isCooldown.value = true;
  try {
    const res = await authStore.forgotPassword(email.value.trim().toLowerCase());
    toast.success('Mã OTP đã được gửi!', {
      description: res?.message || 'Vui lòng kiểm tra email của bạn để lấy mã xác thực 6 số.',
    });
    currentStep.value = 2;
    startCooldown(60);
    startExpireTimer();
    nextTick(() => {
      otpDigits.value = ['', '', '', '', '', ''];
      otpInputRefs.value[0]?.focus();
    });
  } catch (err: unknown) {
    const msg = extractApiErrorMessage(
      err,
      'Không thể gửi mã đặt lại mật khẩu. Vui lòng kiểm tra lại email.',
    );
    toast.error(msg);
  } finally {
    setTimeout(() => {
      isCooldown.value = false;
    }, 1500);
  }
};

// Step 2 OTP Grid Handlers
const handleOtpInput = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, ''); // only digits

  if (value.length > 0) {
    otpDigits.value[index] = value.slice(-1);
    if (index < 5) {
      otpInputRefs.value[index + 1]?.focus();
    }
  } else {
    otpDigits.value[index] = '';
  }

  if (isOtpComplete.value) {
    handleConfirmOtp();
  }
};

const handleOtpKeyDown = (index: number, event: KeyboardEvent) => {
  if (event.key === 'Backspace') {
    if (!otpDigits.value[index] && index > 0) {
      otpDigits.value[index - 1] = '';
      otpInputRefs.value[index - 1]?.focus();
    } else {
      otpDigits.value[index] = '';
    }
  } else if (event.key === 'ArrowLeft' && index > 0) {
    otpInputRefs.value[index - 1]?.focus();
  } else if (event.key === 'ArrowRight' && index < 5) {
    otpInputRefs.value[index + 1]?.focus();
  }
};

const handleOtpPaste = (event: ClipboardEvent) => {
  event.preventDefault();
  const pasteData = event.clipboardData?.getData('text') || '';
  const cleanDigits = pasteData.replace(/\D/g, '').slice(0, 6);
  if (!cleanDigits) return;

  for (let i = 0; i < 6; i++) {
    otpDigits.value[i] = cleanDigits[i] || '';
  }

  const nextFocusIndex = Math.min(cleanDigits.length, 5);
  otpInputRefs.value[nextFocusIndex]?.focus();

  if (cleanDigits.length === 6) {
    handleConfirmOtp();
  }
};

const handleConfirmOtp = () => {
  if (!isOtpComplete.value) {
    toast.error('Vui lòng nhập đầy đủ mã OTP 6 chữ số');
    return;
  }
  if (expireSeconds.value <= 0) {
    toast.error('Mã OTP đã hết hạn. Vui lòng bấm Gửi lại mã.');
    return;
  }
  // Proceed to Step 3 (Set New Password)
  currentStep.value = 3;
};

// Resend OTP in Step 2
const handleResendOtp = async () => {
  if (resendCooldown.value > 0 || authStore.loading) return;

  try {
    const res = await authStore.forgotPassword(email.value.trim().toLowerCase());
    toast.success('Mã OTP mới đã được gửi!', {
      description: res?.message || 'Mã xác thực mới đã được gửi tới email của bạn.',
    });
    otpDigits.value = ['', '', '', '', '', ''];
    startCooldown(60);
    startExpireTimer();
    nextTick(() => {
      otpInputRefs.value[0]?.focus();
    });
  } catch (err: unknown) {
    const msg = extractApiErrorMessage(
      err,
      'Không thể gửi lại mã OTP. Vui lòng thử lại sau.',
    );
    toast.error(msg);
  }
};

// Step 3: Submit Reset Password with OTP & New Password
const handleResetPassword = async () => {
  if (isCooldown.value || authStore.loading) return;
  touchedNewPassword.value = true;
  touchedConfirmPassword.value = true;

  if (!isOtpComplete.value) {
    toast.error('Mã OTP không hợp lệ. Vui lòng nhập lại mã OTP.');
    currentStep.value = 2;
    return;
  }

  if (strengthScore.value < 5) {
    toast.error('Mật khẩu chưa đủ mạnh. Vui lòng kiểm tra lại các yêu cầu.');
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    toast.error('Mật khẩu xác nhận không khớp');
    return;
  }

  isCooldown.value = true;
  try {
    const res = await authStore.resetPassword({
      email: email.value.trim().toLowerCase(),
      otp: otpCode.value,
      newPassword: newPassword.value,
    });
    toast.success('Đặt lại mật khẩu thành công!', {
      description: res?.message || 'Bạn đã có thể đăng nhập bằng mật khẩu mới.',
    });
    currentStep.value = 4;
  } catch (err: unknown) {
    const msg = extractApiErrorMessage(
      err,
      'Đặt lại mật khẩu thất bại. Mã OTP có thể không đúng hoặc đã hết hạn.',
    );
    toast.error(msg);
    // If error mentions OTP, guide user back to step 2
    if (msg.toLowerCase().includes('otp')) {
      currentStep.value = 2;
      nextTick(() => {
        otpDigits.value = ['', '', '', '', '', ''];
        otpInputRefs.value[0]?.focus();
      });
    }
  } finally {
    setTimeout(() => {
      isCooldown.value = false;
    }, 1500);
  }
};
</script>

<template>
  <div class="w-full flex flex-col">
    <!-- Back Navigation -->
    <div class="mb-5">
      <router-link
        v-if="currentStep === 1"
        to="/login"
        class="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors group cursor-pointer"
      >
        <ArrowLeft :size="16" class="transition-transform group-hover:-translate-x-0.5 text-slate-400 group-hover:text-slate-700" />
        Quay lại đăng nhập
      </router-link>

      <button
        v-else-if="currentStep === 2"
        type="button"
        @click="goToStep(1)"
        class="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors group cursor-pointer"
      >
        <ArrowLeft :size="16" class="transition-transform group-hover:-translate-x-0.5 text-slate-400 group-hover:text-slate-700" />
        Quay lại nhập email
      </button>

      <button
        v-else-if="currentStep === 3"
        type="button"
        @click="goToStep(2)"
        class="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors group cursor-pointer"
      >
        <ArrowLeft :size="16" class="transition-transform group-hover:-translate-x-0.5 text-slate-400 group-hover:text-slate-700" />
        Quay lại bước OTP
      </button>
    </div>

    <!-- Step Progress Indicator -->
    <div v-if="currentStep < 4" class="flex items-center gap-2 mb-6">
      <div class="flex items-center gap-1.5 flex-1">
        <div
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :class="currentStep >= 1 ? 'bg-brand-500' : 'bg-slate-200'"
        ></div>
        <div
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :class="currentStep >= 2 ? 'bg-brand-500' : 'bg-slate-200'"
        ></div>
        <div
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :class="currentStep >= 3 ? 'bg-brand-500' : 'bg-slate-200'"
        ></div>
      </div>
      <span class="text-[11px] font-bold text-slate-400">
        Bước {{ currentStep }}/3
      </span>
    </div>

    <!-- Header Section -->
    <div class="text-left mb-6 space-y-1.5">
      <h2 class="text-3xl font-black text-slate-900 tracking-tight">
        <template v-if="currentStep === 1">Quên mật khẩu?</template>
        <template v-else-if="currentStep === 2">Xác thực mã OTP</template>
        <template v-else-if="currentStep === 3">Tạo mật khẩu mới</template>
        <template v-else>Thành công!</template>
      </h2>
      <p class="text-slate-500 font-medium text-[13px] leading-relaxed">
        <template v-if="currentStep === 1">
          Nhập email đã đăng ký tài khoản FixHome để nhận mã OTP khôi phục.
        </template>
        <template v-else-if="currentStep === 2">
          Nhập mã OTP 6 chữ số vừa được gửi đến email của bạn.
        </template>
        <template v-else-if="currentStep === 3">
          Thiết lập mật khẩu mới an toàn cho tài khoản của bạn.
        </template>
        <template v-else>
          Mật khẩu của bạn đã được cập nhật thành công. Vui lòng đăng nhập lại.
        </template>
      </p>
    </div>

    <!-- STEP 1: Enter Email Form -->
    <form v-if="currentStep === 1" class="space-y-4" @submit.prevent="handleRequestOtp">
      <div class="space-y-1.5">
        <label class="block text-[13px] font-bold text-slate-700">
          Email tài khoản <span class="text-red-500">*</span>
        </label>
        <input
          v-model="email"
          @blur="touchedEmail = true"
          type="email"
          required
          placeholder="customer@example.com"
          class="w-full h-12 px-4 text-sm bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200"
          :class="emailError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="emailError" class="text-[11px] leading-tight text-red-500 font-medium">
          {{ emailError }}
        </p>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all mt-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:shadow-none"
        :disabled="authStore.loading || isCooldown"
      >
        <span
          v-if="authStore.loading"
          class="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"
        ></span>
        <span>{{ authStore.loading ? 'Đang gửi mã...' : 'Gửi mã xác thực OTP' }}</span>
      </button>

      <!-- Bottom link -->
      <div class="text-center text-[13px] text-slate-500 font-medium pt-4">
        Nhớ mật khẩu?
        <router-link to="/login" class="text-brand-600 hover:text-brand-700 font-bold ml-1">
          Đăng nhập ngay
        </router-link>
      </div>
    </form>

    <!-- STEP 2: Enter 6-Digit OTP Grid Form -->
    <form v-else-if="currentStep === 2" class="space-y-5" @submit.prevent="handleConfirmOtp">
      <!-- Redesigned Target Email Badge -->
      <div class="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 text-brand-600">
            <Mail :size="15" />
          </div>
          <div class="min-w-0 text-left">
            <p class="text-[11px] font-semibold text-slate-400 leading-tight">Mã gửi đến email</p>
            <p class="text-[13px] font-bold text-slate-800 truncate leading-snug">{{ email }}</p>
          </div>
        </div>
        <button
          type="button"
          class="text-[12px] text-brand-600 hover:text-brand-700 font-bold px-2.5 py-1.5 rounded-lg hover:bg-brand-50/70 transition-colors cursor-pointer shrink-0"
          @click="goToStep(1)"
        >
          Đổi email
        </button>
      </div>

      <!-- 6-Digit OTP Input Grid -->
      <div class="space-y-2">
        <label class="block text-[13px] font-bold text-slate-700">
          Mã xác thực OTP (6 chữ số) <span class="text-red-500">*</span>
        </label>
        <div class="flex items-center justify-between gap-2 sm:gap-2.5" @paste="handleOtpPaste">
          <input
            v-for="(digit, idx) in otpDigits"
            :key="idx"
            :ref="(el) => (otpInputRefs[idx] = el as HTMLInputElement)"
            :value="digit"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="1"
            autocomplete="one-time-code"
            class="w-12 h-14 sm:w-13 sm:h-15 text-center text-xl sm:text-2xl font-bold bg-slate-50/50 border rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200 shadow-sm"
            :class="digit ? 'border-brand-500 bg-white ring-2 ring-brand-500/15' : 'border-slate-200'"
            @input="handleOtpInput(idx, $event)"
            @keydown="handleOtpKeyDown(idx, $event)"
          />
        </div>
      </div>

      <!-- Expiry Countdown & Resend Row -->
      <div class="flex items-center justify-between text-xs text-slate-500 pt-0.5">
        <div
          class="flex items-center gap-1.5 font-medium"
          :class="expireSeconds < 60 ? 'text-red-500 font-bold animate-pulse' : ''"
        >
          <Clock :size="14" class="shrink-0" />
          <span>Thời hạn: <strong class="font-bold">{{ formattedExpireTime }}</strong></span>
        </div>

        <div>
          <button
            v-if="resendCooldown === 0"
            type="button"
            class="inline-flex items-center gap-1 text-[12px] text-brand-600 hover:text-brand-700 font-bold cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="authStore.loading"
            @click="handleResendOtp"
          >
            <RotateCcw :size="13" />
            Gửi lại mã
          </button>
          <span v-else class="text-[12px] text-slate-400 font-medium">
            Gửi lại sau {{ resendCooldown }}s
          </span>
        </div>
      </div>

      <!-- Continue to Step 3 Button -->
      <button
        type="submit"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all mt-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:shadow-none"
        :disabled="!isOtpComplete || expireSeconds <= 0 || authStore.loading || isCooldown"
      >
        <span>Tiếp tục đặt mật khẩu</span>
      </button>
    </form>

    <!-- STEP 3: Enter New Password Form -->
    <form v-else-if="currentStep === 3" class="space-y-4" @submit.prevent="handleResetPassword">
      <!-- Target Email Badge Mini -->
      <div class="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 text-brand-600">
            <KeyRound :size="15" />
          </div>
          <div class="min-w-0 text-left">
            <p class="text-[11px] font-semibold text-slate-400 leading-tight">Mã OTP đã nhập</p>
            <p class="text-[13px] font-bold text-slate-800 tracking-wider leading-snug">
              {{ otpDigits.join(' ') }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="text-[12px] text-brand-600 hover:text-brand-700 font-bold px-2.5 py-1.5 rounded-lg hover:bg-brand-50/70 transition-colors cursor-pointer shrink-0"
          @click="goToStep(2)"
        >
          Nhập lại OTP
        </button>
      </div>

      <!-- New Password -->
      <div class="space-y-1.5">
        <label class="block text-[13px] font-bold text-slate-700">
          Mật khẩu mới <span class="text-red-500">*</span>
        </label>
        <div class="relative">
          <input
            v-model="newPassword"
            :type="showPassword ? 'text' : 'password'"
            @focus="isPasswordFocused = true"
            @blur="isPasswordFocused = false; touchedNewPassword = true"
            required
            placeholder="Tạo mật khẩu mới"
            class="w-full h-11 pl-4 pr-11 text-sm bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200"
            :class="passwordError ? 'border-red-500' : 'border-slate-200'"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="18" />
          </button>

          <!-- Password Strength Popover (consistent with RegisterPage) -->
          <Transition
            enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0 translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-150"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-1"
          >
            <div
              v-if="isPasswordFocused"
              class="absolute z-20 left-0 top-[calc(100%+0.5rem)] w-[280px] bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 p-3 pointer-events-none"
            >
              <div class="flex gap-1 mb-2.5">
                <div
                  v-for="index in 5"
                  :key="index"
                  class="h-1 flex-1 rounded-full transition-colors duration-300"
                  :style="{ backgroundColor: strengthScore >= index ? barColors[strengthScore - 1] : '#E2E8F0' }"
                ></div>
              </div>
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2 text-[11px]">
                  <component
                    :is="passwordRules.minLength ? CheckCircle2 : Circle"
                    :size="12"
                    :class="passwordRules.minLength ? 'text-green-600' : 'text-slate-400'"
                  />
                  <span :class="passwordRules.minLength ? 'text-slate-700 font-medium' : 'text-slate-500'">8+ ký tự</span>
                </div>
                <div class="flex items-center gap-2 text-[11px]">
                  <component
                    :is="passwordRules.hasUpper && passwordRules.hasLower ? CheckCircle2 : Circle"
                    :size="12"
                    :class="passwordRules.hasUpper && passwordRules.hasLower ? 'text-green-600' : 'text-slate-400'"
                  />
                  <span :class="passwordRules.hasUpper && passwordRules.hasLower ? 'text-slate-700 font-medium' : 'text-slate-500'">Chữ hoa & chữ thường</span>
                </div>
                <div class="flex items-center gap-2 text-[11px]">
                  <component
                    :is="passwordRules.hasNumber && passwordRules.hasSpecial ? CheckCircle2 : Circle"
                    :size="12"
                    :class="passwordRules.hasNumber && passwordRules.hasSpecial ? 'text-green-600' : 'text-slate-400'"
                  />
                  <span :class="passwordRules.hasNumber && passwordRules.hasSpecial ? 'text-slate-700 font-medium' : 'text-slate-500'">Số & ký tự đặc biệt (@, #...)</span>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <p v-if="passwordError" class="text-[11px] leading-tight text-red-500 font-medium">
          {{ passwordError }}
        </p>
      </div>

      <!-- Confirm New Password -->
      <div class="space-y-1.5">
        <label class="block text-[13px] font-bold text-slate-700">
          Xác nhận mật khẩu mới <span class="text-red-500">*</span>
        </label>
        <div class="relative">
          <input
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            @blur="touchedConfirmPassword = true"
            required
            placeholder="Nhập lại mật khẩu mới"
            class="w-full h-11 pl-4 pr-11 text-sm bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200"
            :class="(confirmPassword.length > 0 && confirmPassword !== newPassword) ? 'border-red-500' : 'border-slate-200'"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
            @click="showConfirmPassword = !showConfirmPassword"
          >
            <component :is="showConfirmPassword ? EyeOff : Eye" :size="18" />
          </button>
        </div>
        <p v-if="confirmPassword.length > 0 && confirmPassword !== newPassword" class="text-[11px] leading-tight text-red-500 font-medium">
          Mật khẩu xác nhận không khớp
        </p>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all mt-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:shadow-none"
        :disabled="authStore.loading || isCooldown || strengthScore < 5 || newPassword !== confirmPassword"
      >
        <span
          v-if="authStore.loading"
          class="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"
        ></span>
        <span>{{ authStore.loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu mới' }}</span>
      </button>
    </form>

    <!-- STEP 4: Complete Success State -->
    <div v-else class="text-center space-y-6 py-4">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm shadow-emerald-500/10">
        <CheckCircle2 :size="34" class="stroke-[2.5]" />
      </div>

      <div class="space-y-2">
        <h3 class="text-xl font-black text-slate-900 tracking-tight">
          Đặt lại mật khẩu thành công!
        </h3>
        <p class="text-sm text-slate-500 font-medium">
          Tài khoản của bạn đã được cập nhật mật khẩu mới. Bạn có thể đăng nhập ngay bây giờ.
        </p>
      </div>

      <button
        type="button"
        @click="router.push('/login')"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md cursor-pointer"
      >
        <span>Chuyển đến trang Đăng nhập</span>
      </button>
    </div>
  </div>
</template>
