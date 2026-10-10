<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Eye, EyeOff, CheckCircle2, Circle, User, Wrench, ShieldCheck } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import GoogleSignInButton from '../../components/common/GoogleSignInButton.vue';
import {
  extractApiErrorMessage,
  validateEmail,
  validateFullName,
  validatePhoneNumber,
} from '../../utils/input-validation';

const router = useRouter();
const authStore = useAuthStore();

const selectedRole = ref<'customer' | 'technician'>('customer');

/**
 * Đăng ký bằng Google bỏ qua luôn bước nhập OTP, vì Google đã xác minh email.
 * Tài khoản tạo ra là CUSTOMER và vào thẳng khu vực khách hàng.
 */
const handleGoogleCredential = async (idToken: string) => {
  errorMessage.value = '';
  try {
    const user = await authStore.loginWithGoogle(idToken);
    toast.success('Tạo tài khoản thành công!', {
      description: `Chào mừng ${user.fullName || 'bạn'} đến với FixHome.`,
    });
    const role = user.role?.toUpperCase();
    router.push(role === 'TECHNICIAN' ? '/tech' : '/app');
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string } } } };
    errorMessage.value =
      error?.response?.data?.error?.message || 'Đăng ký bằng Google thất bại';
    toast.error(errorMessage.value);
  }
};

const fullName = ref('');
const email = ref('');
const phoneNumber = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const errorMessage = ref('');

const touchedEmail = ref(false);
const touchedFullName = ref(false);
const touchedPhone = ref(false);
const touchedPassword = ref(false);
const isPasswordFocused = ref(false);

// Luật ký tự giữ đúng bản backend, xem src/utils/input-validation.ts.
const emailIssue = computed(() => validateEmail(email.value));
const fullNameIssue = computed(() => validateFullName(fullName.value));
const phoneIssue = computed(() => validatePhoneNumber(phoneNumber.value));

const emailError = computed(() => (touchedEmail.value ? emailIssue.value : ''));
const fullNameError = computed(() => (touchedFullName.value ? fullNameIssue.value : ''));
const phoneError = computed(() => (touchedPhone.value ? phoneIssue.value : ''));

const passwordRules = computed(() => ({
  minLength: password.value.length >= 8,
  hasLower: /[a-z]/.test(password.value),
  hasUpper: /[A-Z]/.test(password.value),
  hasNumber: /[0-9]/.test(password.value),
  hasSpecial: /[^A-Za-z0-9]/.test(password.value),
}));

const strengthScore = computed(() => Object.values(passwordRules.value).filter(Boolean).length);
const barColors = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];

const passwordError = computed(() => {
  if (!touchedPassword.value) return '';
  if (!password.value) return 'Mật khẩu không được bỏ trống';
  if (strengthScore.value < 5) return 'Mật khẩu chưa đủ điều kiện an toàn';
  return '';
});

const isCooldown = ref(false);

const handleRegister = async () => {
  if (isCooldown.value || authStore.loading) return;
  touchedEmail.value = true;
  touchedFullName.value = true;
  touchedPhone.value = true;
  touchedPassword.value = true;

  if (emailError.value || fullNameError.value || phoneError.value) {
    errorMessage.value = 'Vui lòng kiểm tra lại thông tin.';
    return toast.error('Vui lòng kiểm tra lại thông tin.');
  }

  if (strengthScore.value < 5) {
    errorMessage.value = 'Mật khẩu chưa đủ mạnh. Vui lòng kiểm tra lại các yêu cầu.';
    return toast.error('Mật khẩu chưa đủ mạnh. Vui lòng kiểm tra lại các yêu cầu.');
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Mật khẩu xác nhận không khớp';
    return toast.error('Mật khẩu xác nhận không khớp');
  }

  isCooldown.value = true;
  errorMessage.value = '';
  try {
    const res = await authStore.register({
      fullName: fullName.value,
      email: email.value,
      phoneNumber: phoneNumber.value || undefined,
      password: password.value,
      role: selectedRole.value,
    });
    router.push({
      path: '/verify-otp',
      query: {
        email: (res?.email || email.value).trim().toLowerCase(),
        role: selectedRole.value,
      },
    });
  } catch (err: unknown) {
    // Khi ValidationPipe chặn, `error.message` chỉ là "Validation failed"; lý do
    // thật nằm trong mảng `details` nên phải đọc qua helper.
    errorMessage.value = extractApiErrorMessage(
      err,
      'Đăng ký tài khoản thất bại. Email hoặc Số điện thoại có thể đã tồn tại.',
    );
  }
  finally {
    setTimeout(() => {
      isCooldown.value = false;
    }, 2000);
  }
};
</script>

<template>
  <div class="w-full flex flex-col">
    <!-- Header -->
    <div class="text-left mb-3 space-y-1">
      <h2 class="text-[1.75rem] font-black text-slate-900 tracking-tight leading-tight">
        Tạo tài khoản mới
      </h2>
      <p class="h-5 flex items-center gap-1.5 text-[12px] text-slate-500 font-medium">
        <ShieldCheck v-if="selectedRole === 'technician'" :size="14" class="shrink-0 text-blue-500" />
        <span class="truncate">
          {{ selectedRole === 'technician' ? 'Sau khi đăng ký, bổ sung hồ sơ chuyên môn và CCCD để xác thực.' : 'Đặt lịch sửa chữa nhanh chóng.' }}
        </span>
      </p>
    </div>

    <!-- Role Selection (Pills) -->
    <div class="flex items-center gap-3 mb-2.5">
      <button
        type="button"
        @click="selectedRole = 'customer'"
        class="flex-1 flex items-center justify-center gap-2 py-2 border rounded-xl text-[13px] font-bold transition-all duration-200"
        :class="selectedRole === 'customer' ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'"
      >
        <User :size="16" :class="selectedRole === 'customer' ? 'text-brand-600' : 'text-slate-400'" />
        Khách hàng
      </button>
      <button
        type="button"
        @click="selectedRole = 'technician'"
        class="flex-1 flex items-center justify-center gap-2 py-2 border rounded-xl text-[13px] font-bold transition-all duration-200"
        :class="selectedRole === 'technician' ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'"
      >
        <Wrench :size="16" :class="selectedRole === 'technician' ? 'text-brand-600' : 'text-slate-400'" />
        Thợ sửa chữa
      </button>
    </div>

    <form class="space-y-2.5" @submit.prevent="handleRegister">
      <!-- Full Name -->
      <div class="space-y-1">
        <label class="block text-[12px] font-bold text-slate-700">Họ và tên <span class="text-red-500">*</span></label>
        <input
          v-model="fullName"
          @blur="touchedFullName = true"
          type="text"
          placeholder="Nguyễn Văn A"
          class="w-full h-10 px-3.5 text-[13px] bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          :class="fullNameError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="fullNameError" class="text-[10px] leading-tight text-red-500 font-medium">{{ fullNameError }}</p>
      </div>

      <!-- Phone -->
      <div class="space-y-1">
        <label class="block text-[12px] font-bold text-slate-700">Số điện thoại</label>
        <input
          v-model="phoneNumber"
          @blur="touchedPhone = true"
          type="tel"
          placeholder="091 234 5678"
          class="w-full h-10 px-3.5 text-[13px] bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          :class="phoneError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="phoneError" class="text-[10px] leading-tight text-red-500 font-medium">{{ phoneError }}</p>
      </div>

      <!-- Email -->
      <div class="space-y-1">
        <label class="block text-[12px] font-bold text-slate-700">Email <span class="text-red-500">*</span></label>
        <input
          v-model="email"
          @blur="touchedEmail = true"
          type="email"
          placeholder="customer@example.com"
          class="w-full h-10 px-3.5 text-[13px] bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          :class="emailError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="emailError" class="text-[10px] leading-tight text-red-500 font-medium">{{ emailError }}</p>
      </div>

      <!-- Password -->
      <div class="space-y-1">
        <label class="block text-[12px] font-bold text-slate-700">Mật khẩu <span class="text-red-500">*</span></label>
        <div class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            @focus="isPasswordFocused = true"
            @blur="isPasswordFocused = false; touchedPassword = true"
            placeholder="Tạo mật khẩu"
            class="w-full h-10 pl-3.5 pr-10 text-[13px] bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            :class="passwordError ? 'border-red-500' : 'border-slate-200'"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="16" />
          </button>

          <!-- Password Strength Popover -->
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
                  <component :is="passwordRules.minLength ? CheckCircle2 : Circle" :size="12" :class="passwordRules.minLength ? 'text-green-600' : 'text-slate-400'" />
                  <span :class="passwordRules.minLength ? 'text-slate-700 font-medium' : 'text-slate-500'">8+ ký tự</span>
                </div>
                <div class="flex items-center gap-2 text-[11px]">
                  <component :is="passwordRules.hasUpper && passwordRules.hasLower ? CheckCircle2 : Circle" :size="12" :class="passwordRules.hasUpper && passwordRules.hasLower ? 'text-green-600' : 'text-slate-400'" />
                  <span :class="passwordRules.hasUpper && passwordRules.hasLower ? 'text-slate-700 font-medium' : 'text-slate-500'">Chữ hoa & chữ thường</span>
                </div>
                <div class="flex items-center gap-2 text-[11px]">
                  <component :is="passwordRules.hasNumber && passwordRules.hasSpecial ? CheckCircle2 : Circle" :size="12" :class="passwordRules.hasNumber && passwordRules.hasSpecial ? 'text-green-600' : 'text-slate-400'" />
                  <span :class="passwordRules.hasNumber && passwordRules.hasSpecial ? 'text-slate-700 font-medium' : 'text-slate-500'">Số & ký tự đặc biệt (@, #...)</span>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <p v-if="passwordError" class="text-[10px] leading-tight text-red-500 font-medium">{{ passwordError }}</p>
      </div>

      <!-- Confirm Password -->
      <div class="space-y-1">
        <label class="block text-[12px] font-bold text-slate-700">Xác nhận mật khẩu <span class="text-red-500">*</span></label>
        <div class="relative">
          <input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Nhập lại mật khẩu"
            class="w-full h-10 pl-3.5 pr-10 text-[13px] bg-slate-50/50 border rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            :class="(confirmPassword.length > 0 && confirmPassword !== password) ? 'border-red-500' : 'border-slate-200'"
          />
        </div>
        <p v-if="confirmPassword.length > 0 && confirmPassword !== password" class="text-[10px] leading-tight text-red-500 font-medium">
          Mật khẩu xác nhận không khớp
        </p>
      </div>

      <button
        type="submit"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all mt-3 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
        :disabled="authStore.loading || isCooldown"
        :class="(authStore.loading || isCooldown) ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'"
      >
        <span v-if="authStore.loading" class="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></span>
        <span>{{ authStore.loading ? 'Đang xử lý...' : 'Đăng ký tài khoản' }}</span>
      </button>
    </form>

    <div class="mt-4">
      <GoogleSignInButton
        text="signup_with"
        @credential="handleGoogleCredential"
        @error="(message: string) => (errorMessage = message)"
        class="w-full"
      />
    </div>
  </div>
</template>
