<script setup lang="ts">
import { ref } from 'vue';
import { Building2, Check, X } from 'lucide-vue-next';
import VisitOfficeForm from './VisitOfficeForm.vue';
import FhConfirmDialog from '../FhConfirmDialog.vue';
import type { VisitOffice, VisitOfficeInput } from '../../api/admin-office-visits.api';

defineProps<{
  open: boolean;
  office: VisitOffice | null;
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
    <Transition name="fh-drawer">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex justify-end bg-ink-950/50 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-office-drawer-title"
        @click.self="triggerClose"
        @keydown.esc="triggerClose"
      >
        <div class="fh-drawer-panel relative flex h-full w-full max-w-[560px] flex-col border-l border-ink-100 bg-white shadow-2xl">
          <!-- Drawer Header -->
          <header class="flex items-center justify-between border-b border-ink-100 bg-white px-6 py-5 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Building2 :size="22" :stroke-width="2" />
              </div>
              <div class="min-w-0">
                <h2 id="edit-office-drawer-title" class="truncate text-base font-bold text-ink-900">
                  Chỉnh sửa trụ sở
                </h2>
                <p class="truncate text-xs text-ink-500">
                  Cập nhật thông tin trụ sở nhận hồ sơ.
                </p>
              </div>
            </div>
            <button
              type="button"
              class="cursor-pointer rounded-xl p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
              aria-label="Đóng"
              @click="triggerClose"
            >
              <X :size="20" />
            </button>
          </header>

          <!-- Drawer Scrollable Body -->
          <div class="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            <VisitOfficeForm
              v-if="office"
              ref="formRef"
              :initial-data="office"
              :saving="saving"
              :server-error="error"
              :show-footer="false"
              @submit="handleFormSubmit"
              @dirty-change="handleDirtyChange"
            />
          </div>

          <!-- Drawer Sticky Footer -->
          <footer class="flex items-center justify-end gap-2.5 border-t border-ink-100 bg-white px-6 py-4 shrink-0 shadow-xs">
            <button
              type="button"
              class="inline-flex h-9.5 items-center justify-center rounded-xl border border-ink-200 bg-white px-4.5 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
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
              <Check v-else :size="15" :stroke-width="2.5" />
              <span>Lưu thay đổi</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- Discard confirmation -->
    <FhConfirmDialog
      :open="showDiscardDialog"
      title="Hủy bỏ thay đổi?"
      consequence="Bạn có những thay đổi chưa được lưu. Nếu đóng, các thay đổi này sẽ bị hủy bỏ."
      confirm-text="Đóng và hủy bỏ"
      cancel-text="Tiếp tục chỉnh sửa"
      :danger="true"
      @confirm="confirmDiscard"
      @cancel="showDiscardDialog = false"
    />
  </Teleport>
</template>