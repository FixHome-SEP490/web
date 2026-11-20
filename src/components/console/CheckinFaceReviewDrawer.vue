<script setup lang="ts">
// One check-in face held for the service manager (PO 20/11/2026): the photo taken at check-in beside the
// face registered with the technician's identity check (short-lived signed links), and Approve or Reject.
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhSkeleton from '../FhSkeleton.vue';
import FhStatusPill from '../FhStatusPill.vue';
import { checkinFaceReviewsApi, type CheckinFaceReviewDetail } from '../../api/checkin-face-reviews.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';
import { checkinFaceStatusPill } from './checkin-face-labels';

const props = defineProps<{ reviewId: string | null; busy?: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'approve', review: CheckinFaceReviewDetail): void;
  (e: 'reject', review: CheckinFaceReviewDetail): void;
}>();

const detail = ref<CheckinFaceReviewDetail | null>(null);
const loading = ref(false);
const error = ref('');

async function load(id: string) {
  loading.value = true;
  error.value = '';
  try {
    const result = await checkinFaceReviewsApi.get(id);
    if (props.reviewId === id) detail.value = result;
  } catch (reason) {
    if (props.reviewId === id) error.value = userFacingError(reason, 'Chưa mở được yêu cầu này. Vui lòng thử lại.');
  } finally {
    if (props.reviewId === id) loading.value = false;
  }
}

watch(
  () => props.reviewId,
  (id) => {
    detail.value = null;
    error.value = '';
    if (id) void load(id);
  },
  { immediate: true },
);

const photos = computed(() => [
  { key: 'checkin', label: 'Ảnh check-in', url: detail.value?.checkinPhotoUrl ?? null },
  { key: 'registered', label: 'Ảnh khuôn mặt đã đăng ký', url: detail.value?.registeredPhotoUrl ?? null },
]);
const pill = computed(() => checkinFaceStatusPill(detail.value?.status));
const similarityText = computed(() => (detail.value?.similarity == null ? 'Chưa so khớp được' : `${detail.value.similarity}%`));
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-drawer">
      <div v-if="reviewId" class="fixed inset-0 z-50 flex justify-end bg-ink-950/50" @click.self="emit('close')" @keydown.esc="emit('close')">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="cf-drawer-title"
          class="fh-drawer-panel relative flex h-full w-full max-w-xl flex-col border-l border-ink-200/80 bg-white shadow-(--shadow-e3)"
          data-testid="checkin-face-drawer"
        >
          <header class="flex items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-4">
            <div class="min-w-0">
              <h2 id="cf-drawer-title" class="text-lg font-bold text-ink-900">Xác nhận khuôn mặt check-in</h2>
              <p v-if="detail" class="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-500">
                <span class="truncate">{{ detail.technicianName }}</span>
                <FhStatusPill :status="pill.status" :label="pill.label" />
              </p>
            </div>
            <button type="button" class="rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer" aria-label="Đóng" @click="emit('close')">
              <X :size="18" aria-hidden="true" />
            </button>
          </header>

          <div class="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 text-sm">
            <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-800" role="alert">{{ error }}</p>
            <FhSkeleton v-else-if="loading || !detail" height="12rem" rounded="md" />

            <template v-else>
              <p v-if="detail.status === 'rejected' && detail.reviewNote" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-800">
                Lý do từ chối: {{ detail.reviewNote }}
              </p>

              <section class="space-y-2">
                <h3 class="font-semibold text-ink-900">So sánh khuôn mặt</h3>
                <div class="grid grid-cols-2 gap-3">
                  <figure v-for="photo in photos" :key="photo.key" class="min-w-0 space-y-1">
                    <div class="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50">
                      <a v-if="photo.url" :href="photo.url" target="_blank" rel="noopener noreferrer" class="block h-full w-full" :title="`Mở ${photo.label.toLowerCase()} cỡ lớn`">
                        <img :src="photo.url" :alt="photo.label" class="h-full w-full object-contain" />
                      </a>
                      <span v-else class="px-2 text-center text-ink-400">Chưa mở được ảnh</span>
                    </div>
                    <figcaption class="text-center text-xs font-medium text-ink-600">{{ photo.label }}</figcaption>
                  </figure>
                </div>
              </section>

              <section class="space-y-2">
                <h3 class="font-semibold text-ink-900">Thông tin</h3>
                <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40">
                  <div class="flex justify-between gap-3 px-3.5 py-2.5"><dt class="text-ink-500">Độ khớp ảnh đăng ký</dt><dd class="font-num font-medium text-ink-900" data-testid="cf-similarity">{{ similarityText }}</dd></div>
                  <div class="flex justify-between gap-3 px-3.5 py-2.5"><dt class="text-ink-500">Số lần đã chụp lại</dt><dd class="font-num font-medium text-ink-900">{{ detail.retakeCount }}</dd></div>
                  <div class="flex justify-between gap-3 px-3.5 py-2.5">
                    <dt class="text-ink-500">Đơn sửa chữa</dt>
                    <dd class="font-medium text-ink-900"><RouterLink class="font-num text-brand-700 hover:underline" :to="`/console/orders/${detail.orderId}`">{{ detail.orderCode }}</RouterLink></dd>
                  </div>
                  <div class="flex justify-between gap-3 px-3.5 py-2.5"><dt class="text-ink-500">Gửi lúc</dt><dd class="font-num font-medium text-ink-900">{{ vnDateTimeString(detail.createdAt) }}</dd></div>
                  <div v-if="detail.reviewedAt" class="flex justify-between gap-3 px-3.5 py-2.5"><dt class="text-ink-500">Xử lý lúc</dt><dd class="font-num font-medium text-ink-900">{{ vnDateTimeString(detail.reviewedAt) }}</dd></div>
                </dl>
              </section>
            </template>
          </div>

          <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3.5">
            <FhButton variant="secondary" size="sm" @click="emit('close')">Đóng</FhButton>
            <template v-if="detail && detail.status === 'pending'">
              <FhButton variant="danger" size="sm" :disabled="busy" data-testid="cf-drawer-reject" @click="emit('reject', detail)">Từ chối ảnh check-in</FhButton>
              <FhButton size="sm" :loading="busy" data-testid="cf-drawer-approve" @click="emit('approve', detail)">Duyệt ảnh check-in</FhButton>
            </template>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
