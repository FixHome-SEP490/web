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
  <div class="bg-white shadow-(--shadow-e1) rounded-md p-5 border border-ink-100" data-testid="change-password-card">
    <div class="flex items-center gap-2 mb-3">
      <KeyRound :size="18" class="text-brand-600" />
      <h2 class="text-lg font-bold text-ink-900">Đổi mật khẩu</h2>
    </div>
    <template v-if="step === 'idle'">
      <p class="text-sm text-ink-600 mb-4">Mã xác nhận sẽ được gửi tới email của tài khoản. Đổi xong bạn đăng nhập lại.</p>
      <FhButton variant="secondary" size="sm" :loading="busy" :disabled="!email" @click="sendCode">Gửi mã xác nhận</FhButton>
    </template>
    <form v-else class="space-y-3" @submit.prevent="submit">
      <p v-if="info" class="text-sm text-ink-600">{{ info }}</p>
      <label class="flex flex-col gap-1 text-xs font-semibold text-ink-700">
        Mã xác nhận
        <input v-model="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="h-10 rounded-[var(--radius-sm)] border border-ink-200 px-3 text-sm font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-ink-700">
        Mật khẩu mới
        <input v-model="newPassword" type="password" autocomplete="new-password" class="h-10 rounded-[var(--radius-sm)] border border-ink-200 px-3 text-sm font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-ink-700">
        Nhập lại mật khẩu mới
        <input v-model="confirmPassword" type="password" autocomplete="new-password" class="h-10 rounded-[var(--radius-sm)] border border-ink-200 px-3 text-sm font-normal" />
      </label>
      <p v-if="error" class="text-sm text-danger-700" role="alert">{{ error }}</p>
      <div class="flex flex-wrap gap-2">
        <FhButton type="submit" size="sm" :loading="busy">Đổi mật khẩu</FhButton>
        <FhButton type="button" variant="ghost" size="sm" :disabled="busy" @click="sendCode">Gửi lại mã</FhButton>
        <FhButton type="button" variant="ghost" size="sm" :disabled="busy" @click="cancel">Huỷ</FhButton>
      </div>
    </form>
    <p v-if="step === 'idle' && error" class="mt-3 text-sm text-danger-700" role="alert">{{ error }}</p>
  </div>
</template>
