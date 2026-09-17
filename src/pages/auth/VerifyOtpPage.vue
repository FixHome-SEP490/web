<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft, Clock, RotateCcw } from 'lucide-vue-next';
import { FhButton } from '../../components';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref((route.query.email as string) || '');
const digits = ref<string[]>(['', '', '', '', '', '']);
const inputRefs = ref<HTMLInputElement[]>([]);
const errorMessage = ref('');
const successMessage = ref('');
const resendCooldown = ref(60);
let cooldownInterval: ReturnType<typeof setInterval> | null = null;

// 5-minute expiry countdown
const expireSeconds = ref(300);
let expireInterval: ReturnType<typeof setInterval> | null = null;

const isComplete = computed(() => digits.value.every((d) => d.length === 1));
const otpCode = computed(() => digits.value.join(''));

const formattedExpireTime = computed(() => {
  if (expireSeconds.value <= 0) return 'Đã hết hạn';
  const m = Math.floor(expireSeconds.value / 60);
  const s = expireSeconds.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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

onMounted(() => {
  if (!email.value) {
    router.replace('/register');
    return;
  }
  startCooldown(60);
  startExpireTimer();
  nextTick(() => {
    inputRefs.value[0]?.focus();
  });
});

onUnmounted(() => {
  if (cooldownInterval) clearInterval(cooldownInterval);
  if (expireInterval) clearInterval(expireInterval);
});

const handleInput = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, ''); // only digits

  errorMessage.value = '';
  successMessage.value = '';

  if (value.length > 0) {
    digits.value[index] = value.slice(-1); // take the last entered char
    if (index < 5) {
      inputRefs.value[index + 1]?.focus();
    }
  } else {
    digits.value[index] = '';
  }

  // Auto-submit if all digits are entered
  if (isComplete.value) {
    handleVerify();
  }
};

const handleKeyDown = (index: number, event: KeyboardEvent) => {
  if (event.key === 'Backspace') {
    if (!digits.value[index] && index > 0) {
      digits.value[index - 1] = '';
      inputRefs.value[index - 1]?.focus();
    } else {
      digits.value[index] = '';
    }
  } else if (event.key === 'ArrowLeft' && index > 0) {
    inputRefs.value[index - 1]?.focus();
  } else if (event.key === 'ArrowRight' && index < 5) {
    inputRefs.value[index + 1]?.focus();
  }
};

const handlePaste = (event: ClipboardEvent) => {
  event.preventDefault();
  const pasteData = event.clipboardData?.getData('text') || '';
  const cleanDigits = pasteData.replace(/\D/g, '').slice(0, 6);

  if (!cleanDigits) return;

  for (let i = 0; i < 6; i++) {
    digits.value[i] = cleanDigits[i] || '';
  }

  const nextFocusIndex = Math.min(cleanDigits.length, 5);
  inputRefs.value[nextFocusIndex]?.focus();

  if (cleanDigits.length === 6) {
    handleVerify();
  }
};

const handleVerify = async () => {
  if (!isComplete.value) {
    errorMessage.value = 'Vui lòng nhập đầy đủ mã OTP 6 chữ số';
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';

  try {
    await authStore.verifyRegisterOtp({
      email: email.value.trim().toLowerCase(),
      otp: otpCode.value,
    });
    // Successful verify triggers login session and redirects to customer app
    router.push('/app');
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
    errorMessage.value =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      'Mã OTP không chính xác hoặc đã hết hạn';

    // Highlight and focus on the first box again
    nextTick(() => {
      inputRefs.value[0]?.focus();
      inputRefs.value[0]?.select();
    });
  }
};

const handleResend = async () => {
  if (resendCooldown.value > 0 || authStore.loading) return;

  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await authStore.resendRegisterOtp(email.value.trim().toLowerCase());
    successMessage.value = res?.message || 'Mã OTP mới đã được gửi đến email của bạn!';
    digits.value = ['', '', '', '', '', ''];
    startCooldown(60);
    startExpireTimer();
    nextTick(() => {
      inputRefs.value[0]?.focus();
    });
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
    <!-- Navigation Back Link -->
    <div>
      <router-link
        to="/register"
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-brand-600 transition-colors group"
      >
        <ArrowLeft :size="15" class="transition-transform group-hover:-translate-x-0.5" />
        Quay lại đăng ký
      </router-link>
    </div>

    <!-- Header Section -->
    <div class="space-y-2 text-center sm:text-left">
      <h2 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Xác thực tài khoản</h2>
      <p class="text-sm text-ink-500 leading-relaxed">
        Nhập mã OTP 6 chữ số vừa được gửi đến địa chỉ email:
      </p>
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-brand-50 border border-brand-200/60 text-brand-900 text-xs font-medium">
        <Mail :size="14" class="text-brand-600 shrink-0" />
        <span class="font-semibold">{{ email }}</span>
      </div>
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

    <form class="space-y-6" @submit.prevent="handleVerify">
      <!-- 6-Digit OTP Input Grid -->
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-ink-700 mb-3 text-center sm:text-left">
          Mã xác thực OTP (6 chữ số)
        </label>
        <div class="flex items-center justify-between gap-2 sm:gap-3" @paste="handlePaste">
          <input
            v-for="(digit, idx) in digits"
            :key="idx"
            :ref="(el) => (inputRefs[idx] = el as HTMLInputElement)"
            :value="digit"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="1"
            autocomplete="one-time-code"
            class="w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold font-num bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-all shadow-sm"
            :class="{ 'border-brand-600 ring-2 ring-brand-600/20': digit }"
            @input="handleInput(idx, $event)"
            @keydown="handleKeyDown(idx, $event)"
          />
        </div>
      </div>

      <!-- Expiry Countdown & Resend Info -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-500 pt-1">
        <div class="flex items-center gap-1.5 font-num" :class="expireSeconds < 60 ? 'text-danger-600 font-bold' : ''">
          <Clock :size="14" />
          <span>Thời hạn mã: {{ formattedExpireTime }}</span>
        </div>

        <div>
          <button
            v-if="resendCooldown === 0"
            type="button"
            class="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-semibold cursor-pointer transition-colors"
            @click="handleResend"
          >
            <RotateCcw :size="13" />
            Gửi lại mã OTP
          </button>
          <span v-else class="text-ink-400 font-num">
            Gửi lại mã sau ({{ resendCooldown }}s)
          </span>
        </div>
      </div>

      <!-- Submit Action -->
      <FhButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :loading="authStore.loading"
        :disabled="!isComplete || expireSeconds <= 0"
        class="mt-2"
      >
        Xác nhận & Kích hoạt tài khoản
      </FhButton>
    </form>

    <!-- Footer Links -->
    <div class="text-center text-sm text-ink-600 pt-2">
      Chưa nhận được email? Kiểm tra hộp thư Rác/Spam hoặc
      <router-link to="/login" class="text-brand-600 hover:text-brand-700 font-semibold ml-1">
        Đăng nhập
      </router-link>
    </div>
  </div>
</template>
