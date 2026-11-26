<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  X,
  User,
  Package,
  Eye,
  Undo2,
  Check,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhSkeleton from '../FhSkeleton.vue';
import type { OrderPartReturnSummary, PartReturnLineItem } from '../../utils/order-part-returns';

const props = defineProps<{
  order: OrderPartReturnSummary | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'return-part', item?: PartReturnLineItem): void;
}>();

const router = useRouter();

const canReturn = computed(() => {
  if (!props.order) return false;
  return props.order.items.some((i) => i.awaitingManagerQty > 0 || i.maxAcceptQty > 0);
});

const handleNavigateDetail = () => {
  if (!props.order) return;
  router.push(`/console/part-returns/${props.order.orderId}`);
};

const handleOpenReturn = () => {
  if (!props.order) return;
  const targetItem = props.order.items.find((i) => i.maxAcceptQty > 0) || props.order.items[0];
  emit('return-part', targetItem);
};

// Stepper status calculation
const step2Active = computed(() => props.order?.returnStatus === 'in_use');
const step2Done = computed(() => props.order?.returnStatus !== 'in_use');
const step3Active = computed(() => props.order?.returnStatus === 'awaiting_return');
const step3Done = computed(() => props.order?.returnStatus === 'returned');
const step4Done = computed(() => props.order?.returnStatus === 'returned');
</script>

<template>
  <div
    class="flex flex-col h-full bg-white border border-ink-200/90 rounded-[var(--radius-md)] shadow-(--shadow-e1) overflow-hidden"
    aria-label="Panel xem nhanh chi tiết đơn hoàn trả"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-ink-100 bg-ink-50/70 px-5 py-4">
      <div class="min-w-0 pr-2">
        <h3 class="text-base font-bold text-ink-900 truncate">
          Chi tiết đơn hàng <span class="font-num text-brand-600">{{ order ? order.orderCode : '' }}</span>
        </h3>
      </div>
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
        aria-label="Đóng panel xem nhanh"
        @click="emit('close')"
      >
        <X :size="18" />
      </button>
    </div>

    <!-- Loading Skeleton State -->
    <div v-if="loading" class="p-5 space-y-4 flex-1 overflow-y-auto" aria-busy="true">
      <FhSkeleton height="60px" rounded="md" />
      <FhSkeleton height="140px" rounded="md" />
      <FhSkeleton height="160px" rounded="md" />
    </div>

    <!-- Empty/No Order Selected State -->
    <div v-else-if="!order" class="flex-1 flex flex-col items-center justify-center p-8 text-center text-ink-500">
      <Package :size="40" class="text-ink-300 mb-3" />
      <p class="text-sm font-medium">Chọn một đơn sửa chữa từ danh sách để xem nhanh thông tin.</p>
    </div>

    <!-- Content Area -->
    <div v-else class="flex-1 overflow-y-auto p-5 space-y-5">
      <!-- 4-step Stepper -->
      <div class="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
        <div class="relative flex items-center justify-between">
          <!-- Connecting Line -->
          <div class="absolute left-4 right-4 top-3 h-0.5 bg-ink-200 -z-0"></div>
          <div
            class="absolute left-4 top-3 h-0.5 bg-brand-600 -z-0 transition-all duration-300"
            :style="{
              width: step4Done ? '100%' : step3Done ? '66%' : step2Done ? '33%' : '0%',
            }"
          ></div>

          <!-- Step 1: Lấy linh kiện -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-xs">
              <Check :size="12" stroke-width="3" />
            </div>
            <span class="mt-1.5 text-xs font-semibold text-ink-800">Lấy linh kiện</span>
            <span class="text-[11px] font-num text-ink-500">{{ order.pickupDate }}</span>
          </div>

          <!-- Step 2: Đang sử dụng -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors"
              :class="
                step2Done
                  ? 'bg-brand-600 text-white'
                  : step2Active
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'border border-ink-300 bg-white text-ink-400'
              "
            >
              <Check v-if="step2Done" :size="12" stroke-width="3" />
              <span v-else>2</span>
            </div>
            <span
              class="mt-1.5 text-xs font-semibold"
              :class="step2Active ? 'text-brand-700' : 'text-ink-800'"
            >
              Đang sử dụng
            </span>
            <span class="text-[11px] text-ink-500">
              {{ step2Active ? 'Đang thi công' : step2Done ? 'Đã thi công' : 'Chưa đến' }}
            </span>
          </div>

          <!-- Step 3: Trả linh kiện -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors"
              :class="
                step3Done
                  ? 'bg-brand-600 text-white'
                  : step3Active
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'border border-ink-300 bg-white text-ink-400'
              "
            >
              <Check v-if="step3Done" :size="12" stroke-width="3" />
              <span v-else>3</span>
            </div>
            <span
              class="mt-1.5 text-xs font-semibold"
              :class="step3Active ? 'text-brand-700' : 'text-ink-800'"
            >
              Trả linh kiện
            </span>
            <span class="text-[11px] text-ink-500">
              {{ step3Active ? 'Chờ nhận' : step3Done ? 'Đã trả' : 'Chưa thực hiện' }}
            </span>
          </div>

          <!-- Step 4: Hoàn tất -->
          <div class="relative z-10 flex flex-col items-center text-center">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors"
              :class="
                step4Done
                  ? 'bg-success-600 text-white'
                  : 'border border-ink-300 bg-white text-ink-400'
              "
            >
              <Check v-if="step4Done" :size="12" stroke-width="3" />
              <span v-else>4</span>
            </div>
            <span
              class="mt-1.5 text-xs font-semibold"
              :class="step4Done ? 'text-success-700' : 'text-ink-600'"
            >
              Hoàn tất
            </span>
            <span class="text-[11px] text-ink-500">{{ step4Done ? 'Đã đối soát' : '—' }}</span>
          </div>
        </div>
      </div>

      <!-- General Info Card -->
      <div class="rounded-xl border border-ink-200/80 bg-white p-4 space-y-3">
        <h4 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
          <User :size="14" class="text-brand-600" />
          Thông tin chung
        </h4>

        <div class="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
          <div>
            <span class="text-ink-500 block mb-0.5">Khách hàng</span>
            <span class="font-semibold text-ink-900 block truncate">{{ order.customerName }}</span>
          </div>

          <div>
            <span class="text-ink-500 block mb-0.5">Dịch vụ</span>
            <span class="font-semibold text-ink-900 block truncate" :title="order.serviceName">{{ order.serviceName }}</span>
          </div>

          <div>
            <span class="text-ink-500 block mb-0.5">Kỹ thuật viên</span>
            <span class="font-semibold text-ink-900 block truncate">{{ order.technicianName }}</span>
          </div>

          <div>
            <span class="text-ink-500 block mb-0.5">Ngày lấy</span>
            <span class="font-semibold font-num text-ink-900 block">{{ order.pickupDate }}</span>
          </div>

          <div class="col-span-2">
            <span class="text-ink-500 block mb-0.5">Hạn hoàn trả</span>
            <span class="font-semibold font-num text-ink-900 block">{{ order.dueDate }}</span>
          </div>
        </div>
      </div>

      <!-- Parts List Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            <Package :size="14" class="text-brand-600" />
            Danh sách linh kiện đã lấy ({{ order.items.length }})
          </h4>
        </div>

        <div class="divide-y divide-ink-100 rounded-xl border border-ink-200/80 bg-white overflow-hidden">
          <div
            v-for="item in order.items"
            :key="item.id"
            class="flex items-center justify-between gap-3 p-3 hover:bg-ink-50/60 transition-colors"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
                <Package :size="18" />
              </div>
              <div class="min-w-0">
                <span class="block text-xs font-semibold text-ink-900 truncate" :title="item.partNameSnapshot">
                  {{ item.partNameSnapshot }}
                </span>
                <span class="block text-[11px] font-num text-ink-500">
                  {{ item.issuedQty }} {{ item.unit }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span
                class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium"
                :class="item.statusTone"
              >
                {{ item.statusLabel }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Panel Footer Actions -->
    <div
      v-if="order"
      class="border-t border-ink-100 bg-ink-50/60 p-4 grid grid-cols-2 gap-3 shrink-0"
    >
      <FhButton
        variant="secondary"
        size="md"
        class="w-full text-xs font-semibold justify-center"
        @click="handleNavigateDetail"
      >
        <Eye :size="15" class="mr-1.5 text-brand-600" />
        Xem chi tiết
      </FhButton>

      <FhButton
        variant="primary"
        size="md"
        class="w-full text-xs font-semibold justify-center"
        :disabled="!canReturn"
        @click="handleOpenReturn"
      >
        <Undo2 :size="15" class="mr-1.5" />
        Trả linh kiện
      </FhButton>
    </div>
  </div>
</template>
