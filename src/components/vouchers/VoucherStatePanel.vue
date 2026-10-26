<script setup lang="ts">
import { AlertCircle, Inbox, LoaderCircle, LockKeyhole } from 'lucide-vue-next';
import FhSkeleton from '../FhSkeleton.vue';
import FhButton from '../FhButton.vue';

type PanelState = 'loading' | 'empty' | 'error' | 'unavailable' | 'denied';

withDefaults(defineProps<{
  state: PanelState;
  title?: string;
  message?: string;
  retryLabel?: string;
}>(), {
  title: '',
  message: '',
  retryLabel: 'Thử lại',
});

defineEmits<{ retry: [] }>();

const panelContent = {
  loading: { icon: LoaderCircle, title: 'Đang tải ưu đãi…', message: 'Thông tin sẽ xuất hiện khi máy chủ xác nhận.' },
  empty: { icon: Inbox, title: 'Chưa có ưu đãi', message: 'Ưu đãi đủ điều kiện sẽ xuất hiện tại đây.' },
  error: { icon: AlertCircle, title: 'Chưa tải được ưu đãi', message: 'Vui lòng thử lại sau.' },
  unavailable: { icon: LockKeyhole, title: 'Ưu đãi chưa khả dụng', message: 'Dịch vụ voucher chưa được kết nối. Không có ưu đãi nào được lưu hoặc áp dụng.' },
  denied: { icon: LockKeyhole, title: 'Bạn không có quyền xem nội dung này', message: 'Trang này chỉ dành cho Quản trị viên.' },
} as const;
</script>

<template>
  <section
    class="flex flex-col items-center rounded-[var(--radius-md)] border border-ink-200 bg-white px-5 py-9 text-center sm:px-8"
    :role="state === 'error' || state === 'denied' ? 'alert' : 'status'"
    :aria-live="state === 'loading' ? 'polite' : undefined"
    data-testid="voucher-state-panel"
  >
    <div v-if="state === 'loading'" class="mb-4 w-full space-y-4" aria-hidden="true">
      <FhSkeleton height="24px" width="40%" />
      <FhSkeleton height="80px" width="100%" />
      <FhSkeleton height="80px" width="100%" />
    </div>
    <div v-else class="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] bg-ink-50 text-ink-700" aria-hidden="true">
      <component :is="panelContent[state].icon" :size="22" />
    </div>
    <h2 class="text-base font-semibold text-ink-900">{{ title || panelContent[state].title }}</h2>
    <p class="mt-2 max-w-lg text-sm leading-6 text-ink-600">{{ message || panelContent[state].message }}</p>
    <FhButton v-if="state === 'error'" class="mt-5" variant="secondary" size="md" :aria-label="retryLabel" @click="$emit('retry')">
      {{ retryLabel }}
    </FhButton>
  </section>
</template>
