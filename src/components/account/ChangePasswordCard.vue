<script setup lang="ts">
// Change password from the profile, same flow as the mobile Security screen:
// a code is sent to the account's own email, then the code and the new
// password set it. Every session ends afterwards, so the user signs in again.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { KeyRound } from 'lucide-vue-next';
import { FhButton } from '..';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../stores/auth';
import { extractApiErrorMessage, validatePassword } from '../../utils/input-validation';
import { toast } from 'vue-sonner';

const authStore = useAuthStore();
const router = useRouter();
const email = computed(() => authStore.user?.email ?? '');

const step = ref<'idle' | 'code'>('idle');
const otp = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const busy = ref(false);
const error = ref('');
const info = ref('');

async function sendCode() {
  if (!email.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await authApi.forgotPassword({ email: email.value });
    step.value = 'code';
    info.value = `Đã gửi mã xác nhận tới ${email.value}.`;
  } catch (reason) {
    error.value = extractApiErrorMessage(reason, 'Chưa gửi được mã xác nhận, thử lại sau.');
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (busy.value) return;
  error.value = '';
  if (!/^\d{6}$/.test(otp.value.trim())) {
    error.value = 'Mã xác nhận gồm 6 chữ số.';
    return;
  }
  const passwordError = validatePassword(newPassword.value);
  if (passwordError) {
    error.value = passwordError;
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Hai lần nhập mật khẩu mới chưa khớp.';
    return;
  }
  busy.value = true;
  try {
    await authApi.resetPassword({ email: email.value, otp: otp.value.trim(), newPassword: newPassword.value });
    await authStore.logout();
    toast.success('Đã đổi mật khẩu. Mời bạn đăng nhập lại.');
    await router.push('/login');
  } catch (reason) {
    error.value = extractApiErrorMessage(reason, 'Chưa đổi được mật khẩu, kiểm tra lại mã xác nhận.');
  } finally {
    busy.value = false;
  }
}

function cancel() {
  step.value = 'idle';
  otp.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  error.value = '';
  info.value = '';
}
</script>

<template>
  <div class="bg-white rounded-2xl border border-ink-200/80 p-5 shadow-xs space-y-3.5" data-testid="change-password-card">
    <div class="flex items-center gap-2">
      <KeyRound :size="18" class="text-brand-600" />
      <h2 class="text-base font-bold text-ink-900">Đổi mật khẩu</h2>
    </div>

    <template v-if="step === 'idle'">
      <p class="text-xs text-ink-500 leading-relaxed">
        Mã xác nhận sẽ được gửi tới email <span class="font-medium text-ink-800">{{ email }}</span>. Đổi xong bạn đăng nhập lại.
      </p>
      <FhButton variant="secondary" size="sm" :loading="busy" :disabled="!email" @click="sendCode">
        Gửi mã xác nhận
      </FhButton>
    </template>

    <form v-else class="space-y-3 pt-1" @submit.prevent="submit">
      <p v-if="info" class="text-xs text-brand-700 font-medium bg-brand-50/80 p-2.5 rounded-lg border border-brand-100">
        {{ info }}
      </p>
      <label class="flex flex-col gap-1 text-xs font-medium text-ink-700">
        Mã xác nhận (OTP)
        <input
          v-model="otp"
          inputmode="numeric"
          maxlength="6"
          autocomplete="one-time-code"
          placeholder="Nhập 6 chữ số"
          class="h-9 rounded-xl border border-ink-200 bg-white px-3 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-brand-500 font-num"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-medium text-ink-700">
        Mật khẩu mới
        <input
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Tối thiểu 6 ký tự"
          class="h-9 rounded-xl border border-ink-200 bg-white px-3 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-medium text-ink-700">
        Nhập lại mật khẩu mới
        <input
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Nhập lại mật khẩu mới"
          class="h-9 rounded-xl border border-ink-200 bg-white px-3 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </label>

      <p v-if="error" class="text-xs font-medium text-danger-700 bg-danger-50 p-2 rounded-lg border border-danger-100" role="alert">
        {{ error }}
      </p>

      <div class="flex flex-wrap items-center gap-2 pt-1">
        <FhButton type="submit" size="sm" :loading="busy">Đổi mật khẩu</FhButton>
        <FhButton type="button" variant="ghost" size="sm" :disabled="busy" @click="sendCode">Gửi lại mã</FhButton>
        <FhButton type="button" variant="ghost" size="sm" :disabled="busy" @click="cancel">Huỷ</FhButton>
      </div>
    </form>
    <p v-if="step === 'idle' && error" class="text-xs font-medium text-danger-700 bg-danger-50 p-2 rounded-lg border border-danger-100" role="alert">
      {{ error }}
    </p>
  </div>
</template>
