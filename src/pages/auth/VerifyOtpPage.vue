<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Mail, ArrowLeft, Clock, RotateCcw } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { extractApiErrorMessage } from '../../utils/input-validation';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref((route.query.email as string) || '');
const digits = ref<string[]>(['', '', '', '', '', '']);
const inputRefs = ref<HTMLInputElement[]>([]);
const errorMessage = ref('');
const isCooldown = ref(false);

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
  if (isCooldown.value || authStore.loading) return;

  if (!isComplete.value) {
    errorMessage.value = 'Vui lòng nhập đầy đủ mã OTP 6 chữ số';
    toast.error(errorMessage.value);
    return;
  }

  if (expireSeconds.value <= 0) {
    errorMessage.value = 'Mã OTP đã hết hạn. Vui lòng bấm Gửi lại mã.';
    toast.error(errorMessage.value);
    return;
  }

  isCooldown.value = true;
  errorMessage.value = '';

  try {
    const verifiedUser = await authStore.verifyRegisterOtp({
      email: email.value.trim().toLowerCase(),
      otp: otpCode.value,
    });

    toast.success('Xác thực tài khoản thành công!', {
      description: `Chào mừng ${verifiedUser?.fullName || 'bạn'} đến với FixHome.`,
    });

    // Check if user is technician: route to onboarding wizard
    const role = (verifiedUser?.role || (route.query.role as string) || '').toUpperCase();
    if (role === 'TECHNICIAN') {
      router.push('/tech/onboarding');
    } else {
      router.push('/app');
    }
  } catch (err: unknown) {
    errorMessage.value = extractApiErrorMessage(
      err,
      'Mã OTP không chính xác hoặc đã hết hạn. Vui lòng thử lại.',
    );
    toast.error(errorMessage.value);

    // Highlight and refocus on the first box
    nextTick(() => {
      inputRefs.value[0]?.focus();
      inputRefs.value[0]?.select();
    });
  } finally {
    setTimeout(() => {
      isCooldown.value = false;
    }, 1500);
  }
};

const handleResend = async () => {
  if (resendCooldown.value > 0 || authStore.loading) return;

  errorMessage.value = '';

  try {
    const res = await authStore.resendRegisterOtp(email.value.trim().toLowerCase());
    toast.success('Mã OTP mới đã được gửi!', {
      description: res?.message || 'Vui lòng kiểm tra email của bạn.',
    });
    digits.value = ['', '', '', '', '', ''];
    startCooldown(60);
    startExpireTimer();
    nextTick(() => {
      inputRefs.value[0]?.focus();
    });
  } catch (err: unknown) {
    errorMessage.value = extractApiErrorMessage(
      err,
      'Không thể gửi lại mã OTP. Vui lòng thử lại sau.',
    );
    toast.error(errorMessage.value);
  }
};
</script>

<template>
  <div class="w-full flex flex-col">
    <!-- Back Navigation -->
    <div class="mb-5">
      <router-link
        to="/register"
        class="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors group cursor-pointer"
      >
        <ArrowLeft :size="16" class="transition-transform group-hover:-translate-x-0.5 text-slate-400 group-hover:text-slate-700" />
        Quay lại đăng ký
      </router-link>
    </div>

    <!-- Header Section -->
    <div class="text-left mb-6 space-y-1.5">
      <h2 class="text-3xl font-black text-slate-900 tracking-tight">Xác thực tài khoản</h2>
      <p class="text-slate-500 font-medium text-[13px] leading-relaxed">
        Nhập mã OTP 6 chữ số vừa được gửi đến địa chỉ email của bạn.
      </p>
    </div>

    <!-- Redesigned Target Email Badge -->
    <div class="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs mb-5">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 text-brand-600">
          <Mail :size="15" />
        </div>
        <div class="min-w-0 text-left">
          <p class="text-[11px] font-semibold text-slate-400 leading-tight">Mã gửi đến email</p>
          <p class="text-[13px] font-bold text-slate-800 truncate leading-snug">{{ email }}</p>
        </div>
      </div>
      <router-link
        to="/register"
        class="text-[12px] text-brand-600 hover:text-brand-700 font-bold px-2.5 py-1.5 rounded-lg hover:bg-brand-50/70 transition-colors cursor-pointer shrink-0"
      >
        Đổi email
      </router-link>
    </div>

    <form class="space-y-5" @submit.prevent="handleVerify">
      <!-- 6-Digit OTP Input Grid -->
      <div class="space-y-2">
        <label class="block text-[13px] font-bold text-slate-700">
          Mã xác thực OTP <span class="text-red-500">*</span>
        </label>
        <div class="flex items-center justify-between gap-2 sm:gap-2.5" @paste="handlePaste">
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
            class="w-12 h-14 sm:w-13 sm:h-15 text-center text-xl sm:text-2xl font-bold bg-slate-50/50 border rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200 shadow-sm"
            :class="[
              digit ? 'border-brand-500 bg-white ring-2 ring-brand-500/15' : 'border-slate-200',
              errorMessage ? 'border-red-400' : ''
            ]"
            @input="handleInput(idx, $event)"
            @keydown="handleKeyDown(idx, $event)"
          />
        </div>
        <p v-if="errorMessage" class="text-[11px] leading-tight text-red-500 font-medium pt-0.5">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Expiry Countdown & Resend Info -->
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
            @click="handleResend"
          >
            <RotateCcw :size="13" />
            Gửi lại mã OTP
          </button>
          <span v-else class="text-[12px] text-slate-400 font-medium">
            Gửi lại sau {{ resendCooldown }}s
          </span>
        </div>
      </div>

      <!-- Submit Action -->
      <button
        type="submit"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all mt-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:shadow-none"
        :disabled="!isComplete || expireSeconds <= 0 || authStore.loading || isCooldown"
      >
        <span
          v-if="authStore.loading"
          class="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"
        ></span>
        <span>{{ authStore.loading ? 'Đang xác thực...' : 'Xác thực & Kích hoạt tài khoản' }}</span>
      </button>
    </form>

    <!-- Footer Links -->
    <div class="text-center text-[13px] text-slate-500 font-medium pt-6">
      Chưa nhận được email? Kiểm tra hộp thư Rác (Spam) hoặc
      <router-link to="/login" class="text-brand-600 hover:text-brand-700 font-bold ml-1">
        Đăng nhập
      </router-link>
    </div>
  </div>
</template>
