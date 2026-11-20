<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertCircle, AlertTriangle, ArrowLeft, Check, Minus, Package, Plus, Send, X } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import FhButton from '../FhButton.vue';
import {
  partRequestsApi,
  createIdempotencyKey,
  type PartCustodyReturnRecord,
} from '../../api/part-requests.api';
import { partCustodyQuantities } from '../../utils/part-custody-quantities';
import { userFacingError } from '../../utils/user-facing-error';

interface Props {
  open: boolean;
  orderId: string;
  items: PartCustodyReturnRecord[];
  initialItemId?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', record: PartCustodyReturnRecord): void;
}>();

// Only parts that still have units to declare
const returnableItems = ref<PartCustodyReturnRecord[]>([]);

watch(
  () => [props.open, props.items],
  () => {
    returnableItems.value = props.items.filter(
      (item) => partCustodyQuantities(item).remainingToDeclare > 0,
    );
  },
  { immediate: true, deep: true },
);

const selectedItemId = ref<string>('');
const quantity = ref<number>(1);
const step = ref<'form' | 'confirm'>('form');
const isSubmitting = ref(false);
const errorText = ref<string | null>(null);
const conflictRetried = ref(false);

const selectedRecord = computed(() =>
  returnableItems.value.find((i) => i.partRequestItemId === selectedItemId.value),
);

const maxQty = computed(() => {
  if (!selectedRecord.value) return 0;
  return partCustodyQuantities(selectedRecord.value).remainingToDeclare;
});

const awaitingManagerQty = computed(() => {
  if (!selectedRecord.value) return 0;
  return partCustodyQuantities(selectedRecord.value).awaitingManager;
});

const isValidQuantity = computed(() => {
  const q = Number(quantity.value);
  return Number.isInteger(q) && q >= 1 && q <= maxQty.value;
});

// Watch open state to reset form
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      step.value = 'form';
      errorText.value = null;
      conflictRetried.value = false;
      const initial = props.initialItemId
        ? returnableItems.value.find((i) => i.partRequestItemId === props.initialItemId)
        : null;
      selectedItemId.value = initial?.partRequestItemId || returnableItems.value[0]?.partRequestItemId || '';
      quantity.value = 1;
    }
  },
  { immediate: true },
);

// Watch selected item change to reset quantity
watch(selectedItemId, () => {
  quantity.value = 1;
  errorText.value = null;
});

const setMaxQuantity = () => {
  quantity.value = maxQty.value;
};

const increment = () => {
  if (quantity.value < maxQty.value) {
    quantity.value++;
  }
};

const decrement = () => {
  if (quantity.value > 1) {
    quantity.value--;
  }
};

const goToConfirm = () => {
  if (!isValidQuantity.value) {
    errorText.value = `Vui lòng nhập số lượng hợp lệ từ 1 đến ${maxQty.value}.`;
    return;
  }
  errorText.value = null;
  step.value = 'confirm';
};

const handleClose = () => {
  if (isSubmitting.value) return;
  emit('close');
};

const handleRefreshConflict = async () => {
  try {
    const updated = await partRequestsApi.getReturnsByOrderId(props.orderId);
    returnableItems.value = updated.filter(
      (item) => partCustodyQuantities(item).remainingToDeclare > 0,
    );
    if (!returnableItems.value.some((i) => i.partRequestItemId === selectedItemId.value)) {
      selectedItemId.value = returnableItems.value[0]?.partRequestItemId || '';
    }
    if (quantity.value > maxQty.value) {
      quantity.value = Math.max(1, maxQty.value);
    }
  } catch {
    // Keep current
  }
};

const handleSubmit = async () => {
  if (isSubmitting.value || !selectedRecord.value || !isValidQuantity.value) return;

  isSubmitting.value = true;
  errorText.value = null;

  const target = selectedRecord.value;
  const submitQty = Number(quantity.value);
  const idempotencyKey = createIdempotencyKey('tech-return');

  try {
    const res = await partRequestsApi.declareReturn(
      target.partRequestId,
      target.partRequestItemId,
      {
        quantity: submitQty,
        expectedVersion: target.version,
        idempotencyKey,
      },
    );

    toast.success('Đã khai trả linh kiện. Vui lòng chờ quản lý xác nhận thực nhận.');
    emit('success', res || target);
    emit('close');
  } catch (err: unknown) {
    // Check for 409 Conflict (version mismatch or state modified)
    const isConflict =
      (err as { response?: { status?: number } })?.response?.status === 409 ||
      (err as { status?: number })?.status === 409;

    if (isConflict) {
      conflictRetried.value = true;
      errorText.value = 'Dữ liệu linh kiện đã thay đổi hoặc xung đột phiên bản. Hệ thống đã tải lại dữ liệu mới nhất, vui lòng kiểm tra lại số lượng.';
      step.value = 'form';
      await handleRefreshConflict();
    } else {
      errorText.value = userFacingError(err, 'Chưa thể gửi khai trả linh kiện. Vui lòng thử lại.');
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="declare-return-title"
        @keydown.esc="handleClose"
      >
        <div
          class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl transition-all space-y-5"
          data-testid="declare-part-return-modal"
        >
          <!-- Header -->
          <div class="flex items-start justify-between border-b border-ink-100 pb-4">
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-100 shrink-0">
                <Package :size="22" :stroke-width="1.8" />
              </div>
              <div>
                <h2 id="declare-return-title" class="text-lg font-bold text-ink-900 leading-snug">
                  {{ step === 'confirm' ? 'Xác nhận khai trả linh kiện' : 'Khai trả linh kiện về kho' }}
                </h2>
                <p class="text-xs text-ink-500 mt-0.5">
                  {{ step === 'confirm' ? 'Kiểm tra thông tin trước khi gửi lên hệ thống' : 'Theo dõi và khai báo số lượng hoàn trả cho Quản lý Dịch vụ' }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              aria-label="Đóng modal"
              :disabled="isSubmitting"
              @click="handleClose"
            >
              <X :size="20" />
            </button>
          </div>

          <!-- Empty returnable items guard -->
          <div v-if="!selectedRecord" class="py-6 text-center text-sm text-ink-600 space-y-3">
            <p>Hiện không có linh kiện nào đủ điều kiện khai trả trong công việc này.</p>
            <FhButton variant="secondary" size="md" @click="handleClose">Đóng</FhButton>
          </div>

          <div v-else class="space-y-4">
            <!-- Step 1: Form -->
            <div v-if="step === 'form'" class="space-y-4" data-testid="declare-step-form">
              <!-- Item Selector if multiple returnable items -->
              <div v-if="returnableItems.length > 1" class="space-y-1.5">
                <label class="block text-xs font-semibold text-ink-700">Chọn linh kiện khai trả</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="item in returnableItems"
                    :key="item.partRequestItemId"
                    type="button"
                    class="h-9 px-3 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5"
                    :class="selectedItemId === item.partRequestItemId
                      ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold shadow-2xs'
                      : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                    @click="selectedItemId = item.partRequestItemId"
                  >
                    <span>{{ item.partNameSnapshot }}</span>
                    <span class="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 font-num">
                      còn {{ partCustodyQuantities(item).remainingToDeclare }}
                    </span>
                  </button>
                </div>
              </div>

              <!-- Selected Part Details Card -->
              <div class="rounded-xl border border-ink-100 bg-ink-50/60 p-4 space-y-2.5">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="font-bold text-sm text-ink-900">{{ selectedRecord.partNameSnapshot }}</span>
                  <span class="text-xs font-medium text-ink-500 font-num">ID: {{ selectedRecord.partRequestItemId.substring(0, 8) }}</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-ink-200/60 text-xs">
                  <div>
                    <span class="text-ink-500 block">Đã nhận</span>
                    <span class="font-bold font-num text-ink-900">{{ selectedRecord.issuedQty }}</span>
                  </div>
                  <div>
                    <span class="text-ink-500 block">Đã dùng</span>
                    <span class="font-bold font-num text-ink-900">{{ selectedRecord.usedQty }}</span>
                  </div>
                  <div>
                    <span class="text-ink-500 block">Chờ nhận</span>
                    <span class="font-bold font-num text-blue-700">{{ awaitingManagerQty }}</span>
                  </div>
                  <div>
                    <span class="text-ink-500 block">Được phép khai</span>
                    <span class="font-bold font-num text-amber-700 text-sm">{{ maxQty }}</span>
                  </div>
                </div>
              </div>

              <!-- Quantity Input Stepper -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label for="declare-qty-input" class="text-xs font-semibold text-ink-700">
                    Số lượng khai trả <span class="text-danger-600">*</span>
                  </label>
                  <button
                    type="button"
                    class="text-xs font-medium text-brand-600 hover:underline"
                    @click="setMaxQuantity"
                  >
                    Khai trả tối đa ({{ maxQty }})
                  </button>
                </div>

                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="h-11 w-11 rounded-xl border border-ink-200 bg-white flex items-center justify-center text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    :disabled="quantity <= 1"
                    aria-label="Giảm 1"
                    @click="decrement"
                  >
                    <Minus :size="18" />
                  </button>
                  <div class="flex-1">
                    <input
                      id="declare-qty-input"
                      v-model.number="quantity"
                      type="number"
                      min="1"
                      :max="maxQty"
                      step="1"
                      inputmode="numeric"
                      class="h-11 w-full rounded-xl border border-ink-300 bg-white px-4 text-center font-bold text-lg font-num text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      data-testid="declare-qty-input"
                    />
                  </div>
                  <button
                    type="button"
                    class="h-11 w-11 rounded-xl border border-ink-200 bg-white flex items-center justify-center text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    :disabled="quantity >= maxQty"
                    aria-label="Tăng 1"
                    @click="increment"
                  >
                    <Plus :size="18" />
                  </button>
                </div>
                <p class="text-xs text-ink-500">
                  Số lượng cho phép khai trả: từ <strong class="font-num">1</strong> đến <strong class="font-num">{{ maxQty }}</strong>.
                </p>
              </div>

              <!-- Notice Box -->
              <div class="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                <AlertCircle :size="16" class="shrink-0 text-amber-600 mt-0.5" />
                <p class="leading-relaxed">
                  Quản lý Dịch vụ sẽ kiểm đếm và xác nhận số lượng thực tế khi bạn bàn giao tại kho. Khai trả chỉ là bước ghi nhận ý định hoàn trả, chưa đồng nghĩa đã hoàn tất nghĩa vụ linh kiện.
                </p>
              </div>

              <!-- Error Alert -->
              <div v-if="errorText" class="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700" role="alert" data-testid="declare-error">
                <AlertTriangle :size="16" class="shrink-0 text-danger-600 mt-0.5" />
                <p>{{ errorText }}</p>
              </div>

              <!-- Footer Actions -->
              <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-ink-100">
                <FhButton variant="secondary" size="md" @click="handleClose">Huỷ bỏ</FhButton>
                <FhButton
                  variant="primary"
                  size="md"
                  :disabled="!isValidQuantity"
                  data-testid="declare-next-button"
                  @click="goToConfirm"
                >
                  Tiếp tục
                </FhButton>
              </div>
            </div>

            <!-- Step 2: Confirmation -->
            <div v-else class="space-y-4" data-testid="declare-step-confirm">
              <div class="rounded-xl border border-ink-200 bg-ink-50/40 p-4 space-y-3">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-ink-600">Linh kiện:</span>
                  <span class="font-bold text-ink-900">{{ selectedRecord.partNameSnapshot }}</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-ink-600">Số lượng khai trả:</span>
                  <span class="font-bold font-num text-brand-700 text-base">{{ quantity }} linh kiện</span>
                </div>
                <div class="flex items-center justify-between text-sm border-t border-ink-200/60 pt-2 text-xs">
                  <span class="text-ink-500">Còn lại cần khai sau đợt này:</span>
                  <span class="font-semibold font-num text-ink-700">{{ maxQty - quantity }} linh kiện</span>
                </div>
              </div>

              <div class="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 flex items-start gap-2.5">
                <Check :size="16" class="shrink-0 text-blue-600 mt-0.5" />
                <p class="leading-relaxed">
                  Sau khi xác nhận gửi, thông tin khai trả sẽ hiển thị ở hàng đợi của Quản lý Dịch vụ. Bạn vui lòng mang linh kiện tới kho để được đối soát và xác nhận thực nhận.
                </p>
              </div>

              <!-- Error Alert in confirm -->
              <div v-if="errorText" class="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700" role="alert" data-testid="declare-error">
                <AlertTriangle :size="16" class="shrink-0 text-danger-600 mt-0.5" />
                <p>{{ errorText }}</p>
              </div>

              <!-- Footer Actions -->
              <div class="flex items-center justify-between pt-2 border-t border-ink-100">
                <FhButton
                  variant="secondary"
                  size="md"
                  :disabled="isSubmitting"
                  @click="step = 'form'"
                >
                  <ArrowLeft :size="16" class="mr-1.5" /> Quay lại
                </FhButton>

                <FhButton
                  variant="primary"
                  size="md"
                  :loading="isSubmitting"
                  :disabled="isSubmitting"
                  data-testid="declare-submit-button"
                  @click="handleSubmit"
                >
                  <Send v-if="!isSubmitting" :size="16" class="mr-1.5" />
                  Xác nhận gửi khai trả
                </FhButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
