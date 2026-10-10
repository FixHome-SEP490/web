<script setup lang="ts">
/**
 * Nút "Đăng nhập với Google", dùng chung cho trang đăng nhập và đăng ký.
 *
 * Nút do chính Google vẽ vào phần tử bên dưới, nên hình thức luôn đúng quy định
 * thương hiệu và tự lo phần bàn phím với trình đọc màn hình.
 *
 * Chưa điền VITE_GOOGLE_CLIENT_ID thì component tự ẩn hoàn toàn, thay vì hiện
 * một nút bấm vào không có gì xảy ra.
 */
import { onMounted, ref } from 'vue';
import {
  isGoogleSignInConfigured,
  renderGoogleButton,
} from '../../services/google-identity.service';

const props = withDefaults(
  defineProps<{
    /** Đổi chữ trên nút cho hợp ngữ cảnh trang đang đứng. */
    text?: 'signin_with' | 'signup_with';
  }>(),
  { text: 'signin_with' },
);

const emit = defineEmits<{
  (event: 'credential', idToken: string): void;
  (event: 'error', message: string): void;
}>();

const host = ref<HTMLElement | null>(null);
const configured = isGoogleSignInConfigured();
const failed = ref(false);

onMounted(async () => {
  if (!configured || !host.value) return;
  try {
    await renderGoogleButton(
      host.value,
      (idToken) => emit('credential', idToken),
      { text: props.text, width: host.value.offsetWidth || undefined },
    );
  } catch (err) {
    // Mạng chặn accounts.google.com là chuyện có thật ở một số nơi. Nói thẳng
    // ra để người dùng biết chuyển sang đăng nhập bằng mật khẩu.
    failed.value = true;
    emit(
      'error',
      err instanceof Error
        ? err.message
        : 'Không tải được đăng nhập Google',
    );
  }
});
</script>

<template>
  <div v-if="configured" class="w-full">
    <!-- Premium Separator -->
    <div class="relative flex py-2 items-center mb-4 mt-2">
      <div class="grow border-t border-slate-200/80"></div>
      <span class="shrink-0 mx-4 text-[11.5px] font-bold tracking-wide text-slate-400">
        Hoặc tiếp tục với
      </span>
      <div class="grow border-t border-slate-200/80"></div>
    </div>

    <!-- Google Button -->
    <div class="w-full flex justify-center cursor-pointer">
      <div ref="host" class="w-full flex justify-center cursor-pointer"></div>
    </div>

    <p v-if="failed" class="mt-3 text-center text-[11px] text-red-500 font-medium">
      Không tải được đăng nhập Google. Bạn vẫn có thể dùng mật khẩu.
    </p>
  </div>
</template>
