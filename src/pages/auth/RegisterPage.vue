<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Eye, EyeOff, CheckCircle2, Circle } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import GoogleSignInButton from '../../components/common/GoogleSignInButton.vue';

const router = useRouter();
const authStore = useAuthStore();

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

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^0[35789][0-9]{8}$/;

const isEmailValid = computed(() => emailRegex.test(email.value.trim()));
const isPhoneValid = computed(() => !phoneNumber.value.trim() || phoneRegex.test(phoneNumber.value.trim()));
const isFullNameValid = computed(() => fullName.value.trim().length >= 2);

const emailError = computed(() => touchedEmail.value ? (!email.value.trim() ? 'Email không được bỏ trống' : (!isEmailValid.value ? 'Email sai định dạng' : '')) : '');
const fullNameError = computed(() => touchedFullName.value ? (!fullName.value.trim() ? 'Họ tên không được bỏ trống' : (!isFullNameValid.value ? 'Họ tên tối thiểu 2 ký tự' : '')) : '');
const phoneError = computed(() => touchedPhone.value ? (phoneNumber.value.trim() && !isPhoneValid.value ? 'SĐT không hợp lệ (VD: 0901234567)' : '') : '');

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

const handleRegister = async () => {
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

  errorMessage.value = '';
  try {
    const res = await authStore.register({
      fullName: fullName.value,
      email: email.value,
      phoneNumber: phoneNumber.value || undefined,
      password: password.value,
    });
    router.push({
      path: '/verify-otp',
      query: { email: (res?.email || email.value).trim().toLowerCase() },
    });
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
    errorMessage.value =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      'Đăng ký tài khoản thất bại. Email hoặc Số điện thoại có thể đã tồn tại.';
  }
};
</script>

<template>
  <div class="w-full flex flex-col space-y-6">
    <!-- Breadcrumb -->
    <div class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
      Trang chủ / Đăng ký
    </div>

    <!-- Header -->
    <div class="space-y-1 text-left mb-4">
      <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight">Tạo tài khoản khách hàng</h2>
      <p class="text-sm text-slate-500 font-medium">
        Đặt lịch sửa chữa nhanh chóng và quản lý bảo hành dễ dàng.
      </p>
    </div>

    <form class="space-y-5" @submit.prevent="handleRegister">
      <!-- Full Name -->
      <div>
        <label class="block text-xs font-bold text-slate-800 mb-2">
          Họ và tên <span class="text-red-500">*</span>
        </label>
        <input
          v-model="fullName"
          @blur="touchedFullName = true"
          type="text"
          placeholder="Nguyễn Văn A"
          class="w-full h-12 px-4 text-sm bg-white border rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
          :class="fullNameError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="fullNameError" class="text-xs text-red-500 font-medium mt-1.5">{{ fullNameError }}</p>
      </div>

      <!-- Email -->
      <div>
        <label class="block text-xs font-bold text-slate-800 mb-2">
          Email <span class="text-red-500">*</span>
        </label>
        <input
          v-model="email"
          @blur="touchedEmail = true"
          type="email"
          placeholder="customer@example.com"
          class="w-full h-12 px-4 text-sm bg-white border rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
          :class="emailError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="emailError" class="text-xs text-red-500 font-medium mt-1.5">{{ emailError }}</p>
      </div>

      <!-- Phone -->
      <div>
        <label class="block text-xs font-bold text-slate-800 mb-2">
          Số điện thoại
        </label>
        <input
          v-model="phoneNumber"
          @blur="touchedPhone = true"
          type="tel"
          placeholder="091 234 5678"
          class="w-full h-12 px-4 text-sm bg-white border rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
          :class="phoneError ? 'border-red-500' : 'border-slate-200'"
        />
        <p v-if="phoneError" class="text-xs text-red-500 font-medium mt-1.5">{{ phoneError }}</p>
      </div>

      <!-- Password -->
      <div>
        <label class="block text-xs font-bold text-slate-800 mb-2">
          Mật khẩu <span class="text-red-500">*</span>
        </label>
        <div class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            @focus="isPasswordFocused = true"
            @blur="isPasswordFocused = false; touchedPassword = true"
            placeholder="••••••••"
            class="w-full h-12 pl-4 pr-11 text-sm bg-white border rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
            :class="passwordError ? 'border-red-500' : 'border-slate-200'"
          />
          <button
            type="button"
            class="absolute right-4 top-[0.85rem] text-slate-400 hover:text-slate-600 transition-colors"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="18" />
          </button>

          <!-- Password Strength Tracker Popover -->
          <Transition
            enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-150"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-2"
          >
            <div 
              v-if="isPasswordFocused" 
              class="absolute z-20 left-0 top-[calc(100%+0.5rem)] w-full bg-white border border-slate-200 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] p-4 pointer-events-none"
            >
              <div class="flex gap-1.5 mb-4">
                <div 
                  v-for="index in 5" 
                  :key="index"
                  class="h-1.5 flex-1 rounded-full transition-colors"
                  :style="{ backgroundColor: strengthScore >= index ? barColors[strengthScore - 1] : '#E5E7EB' }"
                ></div>
              </div>
              <div class="flex flex-col gap-2.5">
                <div class="flex items-center gap-2 text-xs">
                  <component :is="passwordRules.minLength ? CheckCircle2 : Circle" :size="14" :class="passwordRules.minLength ? 'text-green-500' : 'text-slate-300'" />
                  <span :class="passwordRules.minLength ? 'text-green-600 font-bold' : 'text-slate-500 font-medium'">Ít nhất 8 ký tự</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <component :is="passwordRules.hasLower ? CheckCircle2 : Circle" :size="14" :class="passwordRules.hasLower ? 'text-green-500' : 'text-slate-300'" />
                  <span :class="passwordRules.hasLower ? 'text-green-600 font-bold' : 'text-slate-500 font-medium'">1 chữ viết thường</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <component :is="passwordRules.hasUpper ? CheckCircle2 : Circle" :size="14" :class="passwordRules.hasUpper ? 'text-green-500' : 'text-slate-300'" />
                  <span :class="passwordRules.hasUpper ? 'text-green-600 font-bold' : 'text-slate-500 font-medium'">1 chữ viết hoa</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <component :is="passwordRules.hasNumber ? CheckCircle2 : Circle" :size="14" :class="passwordRules.hasNumber ? 'text-green-500' : 'text-slate-300'" />
                  <span :class="passwordRules.hasNumber ? 'text-green-600 font-bold' : 'text-slate-500 font-medium'">1 chữ số</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <component :is="passwordRules.hasSpecial ? CheckCircle2 : Circle" :size="14" :class="passwordRules.hasSpecial ? 'text-green-500' : 'text-slate-300'" />
                  <span :class="passwordRules.hasSpecial ? 'text-green-600 font-bold' : 'text-slate-500 font-medium'">1 ký tự đặc biệt</span>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <p v-if="passwordError" class="text-xs text-red-500 font-medium mt-1.5">{{ passwordError }}</p>
      </div>

      <!-- Confirm Password -->
      <div>
        <label class="block text-xs font-bold text-slate-800 mb-2">
          Xác nhận mật khẩu <span class="text-red-500">*</span>
        </label>
        <div class="relative">
          <input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            placeholder="••••••••"
            class="w-full h-12 pl-4 pr-11 text-sm bg-white border rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
            :class="(confirmPassword.length > 0 && confirmPassword !== password) ? 'border-red-500' : 'border-slate-200'"
          />
          <button
            type="button"
            class="absolute right-4 top-[0.85rem] text-slate-400 hover:text-slate-600 transition-colors"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="18" />
          </button>
        </div>
        <p v-if="confirmPassword.length > 0 && confirmPassword !== password" class="text-xs text-red-500 font-medium mt-1.5">
          Mật khẩu xác nhận không khớp
        </p>
      </div>

      <button
        type="submit"
        class="w-full h-12 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors mt-2 shadow-md shadow-brand-500/20"
        :disabled="authStore.loading"
      >
        <span v-if="authStore.loading">Đang xử lý...</span>
        <span v-else>Đăng ký tài khoản</span>
      </button>
    </form>

    <GoogleSignInButton
      text="signup_with"
      @credential="handleGoogleCredential"
      @error="(message: string) => (errorMessage = message)"
    />

    <div class="text-center text-xs text-slate-500 font-medium pt-4">
      Đã có tài khoản?
      <router-link to="/login" class="text-slate-900 hover:underline font-bold ml-1">
        Đăng nhập
      </router-link>
    </div>
  </div>
</template>
