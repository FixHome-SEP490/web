<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, Undo2, Check, AlertCircle, Package } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import type { PartReturnLineItem } from '../../utils/order-part-returns';
import {
  partRequestsApi,
  createIdempotencyKey,
} from '../../api/part-requests.api';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{
  isOpen: boolean;
  item: PartReturnLineItem | null;
  warehouseAllocated?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', payload: { quantity: number; message: string }): void;
}>();

const quantity = ref<number>(1);
const condition = ref<'normal' | 'faulty' | 'scratched'>('normal');
const note = ref<string>('');
const isSubmitting = ref<boolean>(false);
const errorMessage = ref<string | null>(null);

const maxQty = computed(() => props.item?.maxAcceptQty ?? 0);

watch(
  () => props.item,
  (newItem) => {
    if (newItem) {
      quantity.value = newItem.maxAcceptQty > 0 ? newItem.maxAcceptQty : 1;
      condition.value = 'normal';
      note.value = '';
      errorMessage.value = null;
    }
  },
  { immediate: true },
);

const handleClose = () => {
  if (isSubmitting.value) return;
  emit('close');
};

const handleConfirm = async () => {
  if (!props.item || isSubmitting.value) return;
  errorMessage.value = null;

  const qty = Number(quantity.value);
  if (!Number.isInteger(qty) || qty < 1 || qty > maxQty.value) {
    errorMessage.value = `Số lượng nhận thực tế phải là số nguyên từ 1 đến ${maxQty.value}.`;
    return;
  }

  isSubmitting.value = true;
  try {
    const raw = props.item.raw;
    await partRequestsApi.acceptReturn(raw.partRequestId, raw.partRequestItemId, {
      quantity: qty,
      expectedVersion: raw.version,
      idempotencyKey: createIdempotencyKey('accept'),
    });

    const isWarehouse = props.warehouseAllocated || raw.warehouseAllocated;
    const msg = isWarehouse
      ? qty < props.item.awaitingManagerQty
        ? 'Đã nhận một phần tại kho và cập nhật tồn thực tế. Phần còn lại vẫn chờ nhận.'
        : 'Đã nhận linh kiện tại kho và cập nhật tồn thực tế.'
      : qty < props.item.awaitingManagerQty
        ? 'Đã ghi nhận số lượng nhận thực tế. Phần còn lại vẫn chờ nhận.'
        : 'Đã ghi nhận số linh kiện đã nhận.';

    emit('success', { quantity: qty, message: msg });
  } catch (err: unknown) {
    errorMessage.value = userFacingError(err, 'Chưa ghi nhận được linh kiện hoàn trả, vui lòng thử lại.');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isOpen && item"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-return-title"
      @click.self="handleClose"
    >
      <div
        class="relative w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] border border-ink-200/90 bg-white shadow-xl animate-scale-up"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-ink-100 bg-ink-50/70 px-5 py-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Undo2 :size="18" aria-hidden="true" />
            </div>
            <div>
              <h3 id="modal-return-title" class="text-base font-semibold text-ink-900">
                Xác nhận hoàn trả linh kiện
              </h3>
              <p class="text-xs text-ink-500">Tiếp nhận và cập nhật vào kho thực tế</p>
            </div>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
            aria-label="Đóng"
            @click="handleClose"
          >
            <X :size="18" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <!-- Part Details Card -->
          <div class="rounded-lg border border-ink-100 bg-ink-50/50 p-3.5">
            <div class="flex items-start gap-3">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-600">
                <Package :size="20" />
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="text-sm font-semibold text-ink-900 break-words">{{ item.partNameSnapshot }}</h4>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <span class="rounded bg-ink-100 px-1.5 py-0.5 font-num font-medium text-ink-700">SKU: {{ item.sku }}</span>
                  <span>Đơn vị: <strong class="text-ink-700">{{ item.unit }}</strong></span>
                </div>
              </div>
            </div>

            <!-- Quantities Grid -->
            <div class="mt-3.5 grid grid-cols-4 gap-2 border-t border-ink-100 pt-3 text-center">
              <div class="rounded bg-white p-2 border border-ink-100">
                <div class="text-[11px] text-ink-500">Đã nhận</div>
                <div class="font-num text-sm font-semibold text-ink-900">{{ item.issuedQty }}</div>
              </div>
              <div class="rounded bg-white p-2 border border-ink-100">
                <div class="text-[11px] text-ink-500">Đã dùng</div>
                <div class="font-num text-sm font-semibold text-ink-900">{{ item.usedQty }}</div>
              </div>
              <div class="rounded bg-white p-2 border border-ink-100">
                <div class="text-[11px] text-ink-500">Đã trả</div>
                <div class="font-num text-sm font-semibold text-ink-900">{{ item.managerAcceptedQty }}</div>
              </div>
              <div class="rounded bg-warning-50/70 p-2 border border-warning-200/60">
                <div class="text-[11px] text-warning-700 font-medium">Có thể trả</div>
                <div class="font-num text-sm font-bold text-warning-800">{{ maxQty }}</div>
              </div>
            </div>
          </div>

          <!-- Quantity Input Field -->
          <div>
            <label for="return-modal-qty" class="block text-xs font-medium text-ink-700 mb-1">
              Số lượng thực nhận lại <span class="text-danger-600">*</span>
            </label>
            <div class="flex items-center gap-3">
              <input
                id="return-modal-qty"
                v-model.number="quantity"
                type="number"
                min="1"
                :max="maxQty"
                step="1"
                inputmode="numeric"
                class="min-h-10 w-32 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-num font-semibold text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span class="text-xs text-ink-500">
                Tối đa: <strong class="font-num text-ink-800">{{ maxQty }}</strong> {{ item.unit }}
              </span>
            </div>
          </div>

          <!-- Part Condition Select -->
          <div>
            <label for="return-condition" class="block text-xs font-medium text-ink-700 mb-1">
              Tình trạng linh kiện tiếp nhận
            </label>
            <select
              id="return-condition"
              v-model="condition"
              class="w-full min-h-10 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="normal">Bình thường, còn nguyên vẹn / chưa sử dụng</option>
              <option value="faulty">Linh kiện có dấu hiệu lỗi / hỏng</option>
              <option value="scratched">Đã bóc hộp / trầy xước bên ngoài</option>
            </select>
          </div>

          <!-- Warehouse notice if allocated -->
          <div
            v-if="item.warehouseAllocated || warehouseAllocated"
            class="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-xs text-brand-800"
          >
            <Package :size="16" class="shrink-0 text-brand-600" />
            <span>Linh kiện được cấp từ kho FixHome. Số lượng nhận sẽ được cộng hoàn trực tiếp vào tồn kho khả dụng.</span>
          </div>

          <!-- Note Textarea -->
          <div>
            <label for="return-note" class="block text-xs font-medium text-ink-700 mb-1">
              Ghi chú tiếp nhận (tùy chọn)
            </label>
            <textarea
              id="return-note"
              v-model="note"
              rows="2"
              placeholder="Nhập ghi chú về tình trạng linh kiện, kiểm đếm thực tế..."
              class="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            ></textarea>
          </div>

          <!-- Error Alert -->
          <div
            v-if="errorMessage"
            role="alert"
            class="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 text-xs text-danger-700"
          >
            <AlertCircle :size="16" class="mt-0.5 shrink-0 text-danger-600" />
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-end gap-3 border-t border-ink-100 bg-ink-50/40 px-5 py-3.5">
          <FhButton variant="secondary" size="md" :disabled="isSubmitting" @click="handleClose">
            Hủy
          </FhButton>
          <FhButton
            variant="primary"
            size="md"
            :loading="isSubmitting"
            :disabled="isSubmitting || maxQty < 1"
            @click="handleConfirm"
          >
            <Check :size="16" class="mr-1.5" />
            Xác nhận đã nhận
          </FhButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
