<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Eye, EyeOff } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import GoogleSignInButton from '../../components/common/GoogleSignInButton.vue';
import { extractApiErrorMessage } from '../../utils/input-validation';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const identifier = ref('');
const password = ref('');
const showPassword = ref(false);
const errorMessage = ref('');

import { technicianOnboardingApi } from '../../api/technician-onboarding.api';

/** Đăng nhập bằng mật khẩu hay bằng Google thì chặng sau đều giống nhau. */
const goAfterLogin = async (user: { fullName?: string; role?: string }) => {
  const redirect = (route.query.redirect as string) || '';
  if (redirect) {
    router.push(redirect);
    return;
  }

  toast.success('Đăng nhập thành công!', { description: `Chào mừng ${user.fullName || 'bạn'} quay lại.` });

  const role = user.role?.toUpperCase();
  if (role === 'ADMIN' || role === 'SERVICE_MANAGER') {
    router.push('/console');
  } else if (role === 'TECHNICIAN') {
    try {
      const statusRes = await technicianOnboardingApi.getStatus();
      if (statusRes.onboardingStatus !== 'approved' && statusRes.verificationStatus !== 'verified') {
        router.push('/tech/onboarding');
        return;
      }
    } catch {
      // ignore, fallback to /tech
    }
    router.push('/tech');
  } else {
    router.push('/app');
  }
};

const handleGoogleCredential = async (idToken: string) => {
  errorMessage.value = '';
  try {
    goAfterLogin(await authStore.loginWithGoogle(idToken));
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string } } } };
    errorMessage.value =
      error?.response?.data?.error?.message || 'Đăng nhập bằng Google thất bại';
    toast.error(errorMessage.value);
  }
};

const isCooldown = ref(false);

const handleLogin = async () => {
  if (isCooldown.value || authStore.loading) return;
  if (!identifier.value || !password.value) {
    errorMessage.value = 'Vui lòng điền đầy đủ email/SĐT và mật khẩu';
    return;
  }

  isCooldown.value = true;
  errorMessage.value = '';
  try {
    goAfterLogin(
      await authStore.login({
        email: identifier.value,
        identifier: identifier.value,
        password: password.value,
      }),
    );
  } catch (err: unknown) {
    errorMessage.value = extractApiErrorMessage(
      err,
      'Email/Số điện thoại hoặc mật khẩu không chính xác',
    );
    toast.error(errorMessage.value);
  } finally {
    setTimeout(() => {
      isCooldown.value = false;
    }, 2000);
  }
};
</script>

<template>
  <div class="w-full flex flex-col">
    <!-- Header -->
    <div class="text-left mb-8 space-y-2">
      <h2 class="text-3xl font-black text-slate-900 tracking-tight">Mừng bạn quay lại</h2>
      <p class="text-slate-500 font-medium">
        Đăng nhập để tiếp tục sử dụng các dịch vụ của FixHome.
      </p>
    </div>

    <form class="space-y-5" @submit.prevent="handleLogin">
      <!-- Identifier Input -->
      <div class="space-y-1.5">
        <label class="block text-[13px] font-bold text-slate-700">
          Email hoặc Số điện thoại <span class="text-red-500">*</span>
        </label>
        <input
          v-model="identifier"
          type="text"
          required
          placeholder="Nhập email hoặc SĐT"
          class="w-full h-12 px-4 text-sm bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200"
        />
      </div>

      <!-- Password Input -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="block text-[13px] font-bold text-slate-700">
            Mật khẩu <span class="text-red-500">*</span>
          </label>
          <router-link
            to="/forgot-password"
            class="text-[13px] text-brand-600 hover:text-brand-700 font-bold transition-colors"
          >
            Quên mật khẩu?
          </router-link>
        </div>
        <div class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            placeholder="Nhập mật khẩu"
            class="w-full h-12 pl-4 pr-11 text-sm bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="18" />
          </button>
        </div>
      </div>

      <!-- Remember me -->
      <div class="flex items-center gap-2.5 pt-1">
        <div class="relative flex items-center">
          <input type="checkbox" id="remember" class="peer w-5 h-5 appearance-none border-2 border-slate-200 rounded text-brand-500 checked:bg-brand-500 checked:border-brand-500 focus:ring-brand-500 focus:ring-offset-0 transition-colors cursor-pointer" />
          <svg class="absolute inset-0 w-5 h-5 p-0.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <label for="remember" class="text-[13px] text-slate-600 font-semibold cursor-pointer select-none">Ghi nhớ đăng nhập</label>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="w-full h-10 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold border border-slate-300 rounded-xl transition-all mt-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
        :disabled="authStore.loading || isCooldown"
        :class="(authStore.loading || isCooldown) ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'"
      >
        <span v-if="authStore.loading" class="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></span>
        <span>{{ authStore.loading ? 'Đang xử lý...' : 'Đăng nhập' }}</span>
      </button>
    </form>

    <div class="mt-4">
      <GoogleSignInButton
        text="signin_with"
        @credential="handleGoogleCredential"
        @error="(message: string) => (errorMessage = message)"
        class="w-full"
      />
    </div>

    <!-- Register Link (Mobile fallback) -->
    <div class="text-center text-[13px] text-slate-500 font-medium lg:hidden pt-8">
      Chưa có tài khoản?
      <router-link to="/register" class="text-brand-600 hover:text-brand-700 font-bold ml-1">
        Đăng ký miễn phí
      </router-link>
    </div>
  </div>
</template>
