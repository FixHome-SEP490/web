<script setup lang="ts">
// Verify the account email and phone number from the profile. A code is sent
// (email, or SMS to the saved phone number) and typed back here; the backend
// then flags the contact as verified. Changing the phone number resets its flag.
import { computed, ref } from 'vue';
import { BadgeCheck, Mail, Smartphone } from 'lucide-vue-next';
import { FhButton } from '..';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../stores/auth';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { toast } from 'vue-sonner';

type Kind = 'email' | 'phone';

const authStore = useAuthStore();

const rows = computed(() => [
  {
    kind: 'email' as Kind,
    label: 'Email',
    icon: Mail,
    value: authStore.user?.email ?? '',
    verified: !!authStore.user?.isEmailVerified,
  },
  {
    kind: 'phone' as Kind,
    label: 'Số điện thoại',
    icon: Smartphone,
    value: authStore.user?.phoneNumber ?? '',
    verified: !!authStore.user?.isPhoneVerified,
  },
]);

const active = ref<Kind | null>(null);
const otp = ref('');
const busy = ref(false);
const error = ref('');
const info = ref('');

async function send(kind: Kind) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await authApi.sendVerification(kind);
    active.value = kind;
    otp.value = '';
    info.value = kind === 'email' ? 'Đã gửi mã tới email của bạn.' : 'Đã gửi mã qua SMS tới số điện thoại của bạn.';
  } catch (reason) {
    error.value = extractApiErrorMessage(reason, 'Chưa gửi được mã xác thực, thử lại sau.');
  } finally {
    busy.value = false;
  }
}

async function confirm() {
  if (busy.value || !active.value) return;
  error.value = '';
  if (!/^\d{6}$/.test(otp.value.trim())) {
    error.value = 'Mã xác thực gồm 6 chữ số.';
    return;
  }
  busy.value = true;
  try {
    await authApi.confirmVerification(active.value, otp.value.trim());
    await authStore.fetchProfile();
    toast.success(active.value === 'email' ? 'Đã xác thực email.' : 'Đã xác thực số điện thoại.');
    cancel();
  } catch (reason) {
    error.value = extractApiErrorMessage(reason, 'Mã xác thực không đúng hoặc đã hết hạn.');
  } finally {
    busy.value = false;
  }
}

function cancel() {
  active.value = null;
  otp.value = '';
  error.value = '';
  info.value = '';
}
</script>

<template>
  <div class="bg-white rounded-2xl border border-ink-200/80 p-5 shadow-xs space-y-3.5" data-testid="contact-verification-card">
    <div class="flex items-center gap-2">
      <BadgeCheck :size="18" class="text-brand-600" />
      <h2 class="text-base font-bold text-ink-900">Xác thực liên hệ</h2>
    </div>

    <ul class="divide-y divide-ink-100">
      <li v-for="row in rows" :key="row.kind" class="py-3 first:pt-0 last:pb-0 space-y-2.5">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <component :is="row.icon" :size="16" class="text-ink-400 shrink-0" />
            <div class="min-w-0">
              <p class="text-xs font-medium text-ink-500">{{ row.label }}</p>
              <p class="text-sm font-semibold text-ink-900 truncate font-num">{{ row.value || 'Chưa có' }}</p>
            </div>
          </div>
          <span v-if="row.verified" class="text-xs font-semibold text-emerald-600 shrink-0">Đã xác thực</span>
          <FhButton
            v-else-if="row.value && active !== row.kind"
            variant="secondary"
            size="sm"
            :loading="busy"
            @click="send(row.kind)"
          >
            Xác thực
          </FhButton>
          <span v-else-if="!row.value" class="text-xs font-medium text-ink-400 shrink-0">Cập nhật trước</span>
        </div>

        <form v-if="active === row.kind" class="space-y-2.5" @submit.prevent="confirm">
          <p class="text-xs text-brand-700 font-medium bg-brand-50/80 p-2.5 rounded-lg border border-brand-100">{{ info }}</p>
          <input
            v-model="otp"
            inputmode="numeric"
            maxlength="6"
            autocomplete="one-time-code"
            placeholder="Nhập 6 chữ số"
            class="h-9 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 font-num"
          />
          <div class="flex flex-wrap items-center gap-2">
            <FhButton type="submit" size="sm" :loading="busy">Xác nhận</FhButton>
            <FhButton type="button" variant="ghost" size="sm" :disabled="busy" @click="send(row.kind)">Gửi lại mã</FhButton>
            <FhButton type="button" variant="ghost" size="sm" :disabled="busy" @click="cancel">Huỷ</FhButton>
          </div>
        </form>
      </li>
    </ul>

    <p v-if="error" class="text-xs font-medium text-danger-700 bg-danger-50 p-2 rounded-lg border border-danger-100" role="alert">
      {{ error }}
    </p>
  </div>
</template>
