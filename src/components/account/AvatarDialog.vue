<script setup lang="ts">
// src/components/account/AvatarDialog.vue
// One avatar dialog for every role (PO 10/10/2026): pick a picture from the device,
// see it, save. The picture is cropped square and shrunk here, uploaded to the media
// store, and its URL saved on the account. No link typing.
import { onBeforeUnmount, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { mediaApi } from '../../api/media.api';
import { profileApi } from '../../api/profile.api';
import { useAuthStore } from '../../stores/auth';
import { looksLikeImage, squareAvatar } from '../../utils/image-for-ai';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [url: string] }>();

const authStore = useAuthStore();
const fileInput = ref<HTMLInputElement | null>(null);
const picked = ref<File | null>(null);
const preview = ref('');
const preparing = ref(false);
const saving = ref(false);
const problem = ref('');

const releasePreview = () => {
  if (preview.value.startsWith('blob:')) URL.revokeObjectURL(preview.value);
  preview.value = '';
};

watch(
  () => props.open,
  (open) => {
    picked.value = null;
    problem.value = '';
    releasePreview();
    if (open) preview.value = authStore.user?.avatarUrl ?? '';
  },
  { immediate: true },
);
onBeforeUnmount(releasePreview);

const choose = () => fileInput.value?.click();

const onPick = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  problem.value = '';
  if (!looksLikeImage(file)) {
    problem.value = 'Hãy chọn một tấm ảnh.';
    return;
  }
  preparing.value = true;
  const avatar = await squareAvatar(file);
  preparing.value = false;
  if (!avatar) {
    problem.value = 'Không đọc được ảnh này. Thử ảnh khác nhé.';
    return;
  }
  releasePreview();
  picked.value = avatar;
  preview.value = URL.createObjectURL(avatar);
};

const close = () => {
  if (!saving.value) emit('close');
};

const save = async () => {
  if (!picked.value) return;
  saving.value = true;
  problem.value = '';
  try {
    const { url } = await mediaApi.upload(picked.value);
    await profileApi.updateMe({ avatarUrl: url });
    await authStore.fetchProfile();
    emit('saved', url);
    emit('close');
  } catch {
    problem.value = 'Chưa lưu được ảnh. Vui lòng thử lại.';
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
      @click.self="close"
      @keydown.esc="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-dialog-title"
        class="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-5"
        data-testid="avatar-dialog"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 id="avatar-dialog-title" class="text-lg font-bold text-ink-900">Ảnh đại diện</h3>
          <button
            type="button"
            class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Đóng"
            @click="close"
          >
            <X :size="18" />
          </button>
        </div>

        <button
          type="button"
          class="group relative mx-auto block w-36 h-36 rounded-full overflow-hidden border border-ink-200 bg-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          aria-label="Chọn ảnh từ máy"
          :disabled="saving"
          @click="choose"
        >
          <img v-if="preview" :src="preview" alt="Xem trước ảnh đại diện" class="w-full h-full object-cover" data-testid="avatar-preview" />
          <span v-else class="w-full h-full flex items-center justify-center text-4xl font-bold text-ink-400">
            {{ authStore.user?.fullName?.charAt(0) ?? '?' }}
          </span>
          <span class="absolute inset-0 flex items-center justify-center bg-ink-950/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera :size="24" />
          </span>
          <span v-if="preparing" class="absolute inset-0 bg-white/70 animate-pulse" aria-hidden="true" />
        </button>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          data-testid="avatar-file"
          @change="onPick"
        />

        <p v-if="problem" class="text-sm text-center text-danger-700" role="alert">{{ problem }}</p>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <FhButton variant="secondary" size="md" :disabled="saving" @click="picked ? choose() : close()">
            {{ picked ? 'Chọn ảnh khác' : 'Huỷ' }}
          </FhButton>
          <FhButton v-if="picked" variant="primary" size="md" :loading="saving" @click="save">Lưu ảnh</FhButton>
          <FhButton v-else variant="primary" size="md" :loading="preparing" @click="choose">Chọn ảnh từ máy</FhButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
