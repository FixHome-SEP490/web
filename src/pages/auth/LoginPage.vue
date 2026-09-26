<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { Eye, EyeOff } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { extractApiErrorMessage } from '../../utils/input-validation';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const identifier = ref('');
const password = ref('');
const showPassword = ref(false);
const errorMessage = ref('');

const demoAccounts = [
  { label: '👑 Admin', email: 'admin@fixhome.vn', role: 'ADMIN' },
  { label: '👔 SM (Quản lý)', email: 'sm.hcm@fixhome.vn', role: 'SERVICE_MANAGER' },
  { label: '🔧 Thợ sửa', email: 'tech1@fixhome.vn', role: 'TECHNICIAN' },
  { label: '👤 Khách hàng', email: 'customer1@fixhome.vn', role: 'CUSTOMER' },
  { label: '⚠️ Khách bị khoá', email: 'customer.suspended@fixhome.vn', role: 'CUSTOMER' },
];

const fillDemo = (email: string) => {
  identifier.value = email;
  password.value = 'Password123!';
  errorMessage.value = '';
};

const handleLogin = async () => {
  if (!identifier.value || !password.value) {
    errorMessage.value = 'Vui lòng điền đầy đủ email/SĐT và mật khẩu';
    return;
  }

  errorMessage.value = '';
  try {
    const user = await authStore.login({
      email: identifier.value,
      identifier: identifier.value,
      password: password.value,
    });

    // Redirect based on role or original intended route
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
      router.push('/tech');
    } else {
      router.push('/app');
    }
  } catch (err: unknown) {
    errorMessage.value = extractApiErrorMessage(
      err,
      'Email/Số điện thoại hoặc mật khẩu không chính xác',
    );
    toast.error(errorMessage.value);
  }
};
</script>

<template>
  <div class="w-full flex flex-col space-y-6">
    <!-- Breadcrumb -->
    <div class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
      Trang chủ / Đăng nhập
    </div>

    <!-- Header -->
    <div class="space-y-1 text-left mb-4">
      <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight">Chào mừng trở lại</h2>
      <p class="text-sm text-slate-500 font-medium">
        Đăng nhập để theo dõi yêu cầu và lịch hẹn của bạn.
      </p>
    </div>

    <form class="space-y-5" @submit.prevent="handleLogin">
      <!-- Identifier Input -->
      <div>
        <label class="block text-xs font-bold text-slate-800 mb-2">
          Email hoặc Số điện thoại <span class="text-red-500">*</span>
        </label>
        <input
          v-model="identifier"
          type="text"
          required
          placeholder="bạn@vidu.vn hoặc 090 123 4567"
          class="w-full h-12 px-4 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
        />
      </div>

      <!-- Password Input -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="block text-xs font-bold text-slate-800">
            Mật khẩu
          </label>
          <router-link
            to="/forgot-password"
            class="text-[11px] text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            Quên mật khẩu?
          </router-link>
        </div>
        <div class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            placeholder="••••••••"
            class="w-full h-12 pl-4 pr-11 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm transition-shadow"
          />
          <button
            type="button"
            class="absolute right-4 top-[0.85rem] text-slate-400 hover:text-slate-600 transition-colors"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="18" />
          </button>
        </div>
      </div>

      <!-- Remember me -->
      <div class="flex items-center gap-2 mt-2">
        <input type="checkbox" id="remember" class="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
        <label for="remember" class="text-xs text-slate-500 font-medium cursor-pointer">Ghi nhớ thiết bị này</label>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="w-full h-12 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors mt-2"
        :disabled="authStore.loading"
      >
        <span v-if="authStore.loading">Đang xử lý...</span>
        <span v-else>Đăng nhập</span>
      </button>
    </form>

    <!-- Demo Account Quick Selector -->
    <div class="pt-8">
      <div class="relative flex py-4 items-center mb-4">
        <div class="grow border-t border-slate-200"></div>
        <span class="shrink-0 mx-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">Tài khoản Demo</span>
        <div class="grow border-t border-slate-200"></div>
      </div>
      
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          v-for="demo in demoAccounts"
          :key="demo.email"
          type="button"
          class="p-3 text-left rounded-xl bg-white border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all group"
          @click="fillDemo(demo.email)"
        >
          <div class="text-[11px] font-bold text-slate-900 group-hover:text-brand-600 transition-colors">{{ demo.label }}</div>
          <div class="text-[9px] text-slate-500 mt-0.5 truncate">{{ demo.role }}</div>
        </button>
      </div>
    </div>

    <!-- Register Link (Mobile fallback) -->
    <div class="text-center text-xs text-slate-500 font-medium lg:hidden pt-4">
      Chưa có tài khoản?
      <router-link to="/register" class="text-slate-900 hover:underline font-bold ml-1">
        Đăng ký miễn phí
      </router-link>
    </div>
  </div>
</template>
