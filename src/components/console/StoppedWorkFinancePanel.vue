<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronDown, Layers } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { useAuthStore } from '../../stores/auth';
import { stoppedWorkFinanceApi, type StoppedWorkFinance } from '../../api/stopped-work-finance.api';

const props = defineProps<{ orderId: string }>();
const auth = useAuthStore();
const canRead = computed(() => ['SERVICE_MANAGER', 'ADMIN'].includes(auth.userRole ?? '') && auth.hasPermission('order:read_related'));
const result = ref<StoppedWorkFinance | null>(null);
const busy = ref(false);
const error = ref(false);
const checked = ref(false);
const isOpen = ref(false);
let generation = 0;

watch(() => [props.orderId, canRead.value], () => {
  ++generation;
  result.value = null;
  checked.value = false;
  busy.value = false;
  error.value = false;
});

onBeforeUnmount(() => {
  ++generation;
});

async function read() {
  if (!canRead.value || busy.value) return;
  const request = ++generation;
  busy.value = true;
  error.value = false;
  try {
    const data = await stoppedWorkFinanceApi.get(props.orderId);
    if (request === generation && canRead.value) {
      result.value = data;
      checked.value = true;
    }
  } catch {
    if (request === generation) {
      result.value = null;
      error.value = true;
    }
  } finally {
    if (request === generation) busy.value = false;
  }
}

function toggleCollapse() {
  isOpen.value = !isOpen.value;
  if (isOpen.value && !checked.value && !result.value && !busy.value) {
    void read();
  }
}

const reasons = computed(() => result.value?.reasonCodes.map(code => {
  if (code === 'FAILED_WORK_NOT_PROVEN') return 'Chưa đủ chứng cứ kết luận sửa chữa thất bại hoặc miễn phí.';
  if (code === 'STOP_PROOF_INVALID_OR_NOT_FINALIZED') return 'Chứng cứ dừng công việc cần kiểm tra.';
  if (code === 'ORDER_PAYMENT_REQUIRES_REVIEW') return 'Thanh toán cũ cần đối soát.';
  if (code === 'EVIDENCE_UNAVAILABLE') return 'Chưa đọc đủ chứng từ; không được suy ra không có nghĩa vụ.';
  return 'Có chứng từ cũ cần đối soát riêng.';
}).filter((label, i, rows) => rows.indexOf(label) === i) ?? []);
</script>

<template>
  <section
    v-if="canRead"
    class="rounded-2xl border border-slate-100 bg-white p-5 text-sm shadow-xs transition-shadow hover:shadow-sm"
    aria-label="Đối soát công việc gián đoạn"
    data-testid="staff-stopped-work-finance"
  >
    <div
      class="flex items-center justify-between cursor-pointer select-none"
      @click="toggleCollapse"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Layers :size="18" />
        </div>
        <div class="min-w-0">
          <h2 class="font-semibold text-slate-900 text-sm sm:text-base">Đối soát công việc gián đoạn</h2>
          <p class="text-xs text-slate-500 truncate">Kiểm tra nghĩa vụ cũ và các ràng buộc liên quan trước khi xử lý thay đổi.</p>
        </div>
      </div>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
        :aria-expanded="isOpen"
        aria-label="Đối soát công việc gián đoạn"
        @click.stop="toggleCollapse"
      >
        <ChevronDown :size="18" class="transition-transform duration-200" :class="{ 'rotate-180': isOpen }" />
      </button>
    </div>

    <div v-show="isOpen" class="mt-4 pt-4 border-t border-slate-100 space-y-3">
      <FhButton variant="secondary" size="md" :loading="busy" :disabled="busy" @click="read">
        {{ error ? 'Thử lại' : 'Kiểm tra nghĩa vụ cũ' }}
      </FhButton>
      <Transition name="fh-fade-slide">
        <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-700">
          Chưa đọc được thông tin đối soát. Vui lòng thử lại.
        </p>
      </Transition>
      <div v-if="!error && result" class="space-y-2 rounded-[var(--radius-sm)] border border-ink-100 bg-ink-50/60 p-3">
        <p class="font-medium text-ink-900">
          {{ result.customer.state === 'VERIFIED_WORK_STOPPED_UNBILLED' ? 'Công việc đã dừng, chưa phát hiện chứng từ thu tiền.' : 'Nghĩa vụ tài chính cần đối soát.' }}
        </p>
        <p class="text-ink-700">Báo giá cũ chỉ để xem lịch sử. Số tiền phải trả và hoàn tiền: Chưa xác định.</p>
        <ul class="list-disc pl-5 text-ink-700"><li v-for="reason in reasons" :key="reason">{{ reason }}</li></ul>
        <p v-if="result.evidence.invoices?.length" class="text-ink-800">
          Hóa đơn cần đối chiếu: <span class="font-num font-semibold text-ink-900">{{ result.evidence.invoices.length }}</span>
        </p>
        <router-link
          v-if="auth.userRole === 'SERVICE_MANAGER' && (result.evidence.partRequests?.length || result.evidence.partCustodies?.length)"
          to="/console/part-returns"
          class="inline-block font-medium text-brand-700 hover:underline"
        >
          Kiểm tra linh kiện hoàn trả
        </router-link>
        <p class="text-xs text-ink-600">Thông tin chỉ để đối chiếu, chưa thực hiện thu tiền, hoàn tiền hoặc nhận kho. Khách vẫn được đặt lịch mới độc lập.</p>
      </div>
      <p v-else-if="!error && checked" class="text-ink-500">
        Chưa có thông tin đối soát công việc gián đoạn cho đơn này.
      </p>
    </div>
  </section>
</template>
