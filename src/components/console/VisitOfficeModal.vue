<script setup lang="ts">
import { ref } from 'vue';
import { Building2, Plus, X } from 'lucide-vue-next';
import VisitOfficeForm from './VisitOfficeForm.vue';
import FhConfirmDialog from '../FhConfirmDialog.vue';
import type { VisitOfficeInput } from '../../api/admin-office-visits.api';

defineProps<{
  open: boolean;
  saving?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: VisitOfficeInput): void;
}>();

const formRef = ref<InstanceType<typeof VisitOfficeForm> | null>(null);
const isDirty = ref(false);
const showDiscardDialog = ref(false);

const handleDirtyChange = (dirty: boolean) => {
  isDirty.value = dirty;
};

const triggerClose = () => {
  if (isDirty.value) {
    showDiscardDialog.value = true;
  } else {
    emit('close');
  }
};

const confirmDiscard = () => {
  showDiscardDialog.value = false;
  isDirty.value = false;
  emit('close');
};

const handleFormSubmit = (payload: VisitOfficeInput) => {
  emit('save', payload);
};

const submitForm = () => {
  formRef.value?.handleSubmit();
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-office-modal-title"
        @click.self="triggerClose"
        @keydown.esc="triggerClose"
      >
        <div class="fh-modal-panel flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl">
          <!-- Modal Header -->
          <div class="flex items-center justify-between border-b border-ink-100 bg-white px-6 py-4.5">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Building2 :size="20" :stroke-width="2" />
              </div>
              <div>
                <h2 id="add-office-modal-title" class="text-base font-bold text-ink-900">
                  Thêm trụ sở
                </h2>
                <p class="text-xs text-ink-500">
                  Cấu hình điểm tiếp nhận hồ sơ định danh cho thợ.
                </p>
              </div>
            </div>
            <button
              type="button"
              class="cursor-pointer rounded-xl p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Đóng"
              @click="triggerClose"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Modal Scrollable Body -->
          <div class="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            <VisitOfficeForm
              ref="formRef"
              :saving="saving"
              :server-error="error"
              :show-footer="false"
              @submit="handleFormSubmit"
              @dirty-change="handleDirtyChange"
            />
          </div>

          <!-- Modal Fixed Footer -->
          <div class="flex items-center justify-end gap-2.5 border-t border-ink-100 bg-ink-25/50 px-6 py-3.5">
            <button
              type="button"
              class="inline-flex h-9.5 items-center justify-center rounded-xl border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
              :disabled="saving"
              @click="triggerClose"
            >
              Hủy
            </button>
            <button
              type="button"
              class="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 cursor-pointer"
              :disabled="saving"
              @click="submitForm"
            >
              <span v-if="saving" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              <Plus v-else :size="15" :stroke-width="2.5" />
              <span>Tạo trụ sở</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Discard confirmation -->
    <FhConfirmDialog
      :open="showDiscardDialog"
      title="Hủy bỏ thay đổi?"
      consequence="Các thông tin bạn vừa nhập sẽ không được lưu nếu bạn đóng hộp thoại này."
      confirm-text="Đóng và hủy bỏ"
      cancel-text="Tiếp tục nhập"
      :danger="true"
      @confirm="confirmDiscard"
      @cancel="showDiscardDialog = false"
    />
  </Teleport>
</template>