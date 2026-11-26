<script setup lang="ts">
// Chi tiết một giấy tờ của thợ: ảnh, thông tin đã khai, nhóm áp dụng, trạng thái và lý do từ chối; Xóa nằm trong đây (ẩn khi giấy tờ bị khóa).
import { computed, ref, useId, watch } from 'vue';
import { X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { technicianProfileApi } from '../../api/technician-profile.api';
import type { PaperStatusView } from './skill-papers';

const props = defineProps<{
  open: boolean;
  title: string;
  /** Nơi xin link ảnh; để trống cho tệp không phải ảnh. */
  photo?: { serviceId: string; documentId: string; mimeType: string } | null;
  facts: { label: string; value: string }[];
  status?: PaperStatusView | null;
  /** Lý do từ chối: chỉ hiện khi trạng thái là từ chối. */
  reason?: string | null;
  categories?: string[];
  canDelete?: boolean;
  deleting?: boolean;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'delete'): void }>();

const titleId = `evidence-detail-${useId()}`;
// Link giữ cùng giấy tờ của nó: một hộp thoại phục vụ nhiều giấy tờ, không được hiện ảnh của giấy tờ trước.
const loaded = ref<{ documentId: string; url: string } | null>(null);
const failed = ref(false);

watch(
  () => [props.open, props.photo?.documentId] as const,
  async ([open]) => {
    failed.value = false;
    const photo = props.photo;
    if (!open || !photo) return;
    try {
      const url = await technicianProfileApi.getSkillEvidenceAccess(photo.serviceId, photo.documentId);
      if (url) loaded.value = { documentId: photo.documentId, url };
      else failed.value = true;
    } catch {
      failed.value = true;
    }
  },
  { immediate: true },
);

const url = computed(() => (loaded.value && loaded.value.documentId === props.photo?.documentId ? loaded.value.url : null));
const isImage = computed(() => !!props.photo?.mimeType.startsWith('image/'));
const toneClass = computed(() => {
  switch (props.status?.tone) {
    case 'success': return 'bg-success-50 text-success-700 border-success-200';
    case 'danger': return 'bg-danger-50 text-danger-700 border-danger-200';
    case 'info': return 'bg-info-50 text-info-600 border-ink-200';
    default: return 'bg-warning-50 text-warning-700 border-warning-200';
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60" @click.self="emit('close')">
      <div role="dialog" aria-modal="true" :aria-labelledby="titleId" data-testid="evidence-detail"
        class="bg-white rounded-lg border border-ink-200 shadow-(--shadow-e3) max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <h3 :id="titleId" class="text-lg font-semibold text-ink-900 text-balance">{{ title }}</h3>
          <button type="button" aria-label="Đóng" data-testid="evidence-detail-close" class="text-ink-400 hover:text-ink-700 p-1 rounded" @click="emit('close')">
            <X :size="20" />
          </button>
        </div>

        <div v-if="photo && isImage" class="rounded-xl bg-ink-100 overflow-hidden aspect-4/3 flex items-center justify-center">
          <a v-if="url" :href="url" target="_blank" rel="noopener" class="block w-full h-full">
            <img :src="url" :alt="title" data-testid="evidence-detail-photo" class="w-full h-full object-contain" />
          </a>
          <span v-else-if="failed" class="text-sm text-ink-500 px-4 text-center">Chưa tải được ảnh. Vui lòng thử lại.</span>
          <span v-else class="text-sm text-ink-500">Đang tải ảnh…</span>
        </div>
        <a v-else-if="url" :href="url" target="_blank" rel="noopener" class="inline-block text-sm font-semibold text-brand-700 underline">Mở tệp</a>

        <span v-if="status" class="inline-block px-2.5 py-1 rounded-full text-xs font-semibold border" :class="toneClass" data-testid="evidence-detail-status">{{ status.label }}</span>
        <p v-if="status?.tone === 'danger'" class="text-sm text-danger-700 text-pretty" data-testid="evidence-detail-reason">
          Lý do từ chối: {{ reason?.trim() || 'Không có lý do chi tiết từ FixHome' }}
        </p>
        <p v-if="status?.lock" class="text-sm text-ink-500">{{ status.lock }}</p>

        <dl v-if="facts.length" class="space-y-2 text-sm">
          <div v-for="f in facts" :key="f.label">
            <dt class="text-ink-500">{{ f.label }}</dt>
            <dd class="font-medium text-ink-900">{{ f.value }}</dd>
          </div>
        </dl>
        <p v-else class="text-sm text-ink-500">Giấy tờ này chưa có thông tin chi tiết.</p>
        <div v-if="categories?.length" class="text-sm">
          <p class="text-ink-500">Áp dụng cho</p>
          <p class="font-medium text-ink-900">{{ categories.join(', ') }}</p>
        </div>

        <div v-if="canDelete" class="pt-2">
          <FhButton variant="danger" size="md" class="w-full" :loading="deleting" data-testid="evidence-detail-delete" @click="emit('delete')">Xóa giấy tờ này</FhButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
