<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { getHttpStatus } from '../api/client';
import { deliveryPhysicalBlockerLabels, isDeliveryPhysicalRequestId, w3DeliveryPhysicalApi,
  type DeliveryPhysicalPreview } from '../api/w3-delivery-physical.api';
import FhButton from './FhButton.vue';
import FhSkeleton from './FhSkeleton.vue';

const props = defineProps<{ requestId: string; fulfillmentMethod: string; audience: 'customer' | 'technician' }>();
const auth = useAuthStore();
const titleId = useId();
const visible = computed(() => props.fulfillmentMethod === 'delivery' && isDeliveryPhysicalRequestId(props.requestId)
  && !!auth.user?.id && auth.isAuthenticated
  && ((props.audience === 'customer' && auth.userRole === 'CUSTOMER')
    || (props.audience === 'technician' && auth.userRole === 'TECHNICIAN')));
const state = ref<'loading' | 'ready' | 'unavailable' | 'forbidden' | 'error'>('loading');
const preview = ref<DeliveryPhysicalPreview | null>(null);
let generation = 0;
const reasonLabels = {
  LEGACY_OR_NOT_ENROLLED: 'Yêu cầu này chưa thuộc phạm vi giao linh kiện mới.',
  SCOPE_OR_PARTS_SOURCE_UNVERIFIED: 'Chưa xác minh được phạm vi hoặc nguồn linh kiện của yêu cầu.',
  SHIPPING_APPROVAL_SOURCE_UNVERIFIED: 'Chưa xác minh được phê duyệt phí giao. Cần quản lý dịch vụ hỗ trợ.',
} as const;
const steps = ['Giữ linh kiện tại kho', 'Xuất linh kiện cho đơn vị giao hàng', 'Giao linh kiện', 'Xác nhận kỹ thuật viên nhận'];
// W-16: on the paid path the server reports the recorded step; each step up to it is done.
const STEP_REACHED: Record<string, number> = { RESERVED: 1, ISSUED_TO_COURIER: 2, DISPATCH_RECORDED: 3, TECHNICIAN_RECEIVED: 4 };
const progress = computed(() => preview.value?.progress ?? null);
// A delivery outside the new paid-delivery flow follows the usual part status
// (ready, delivering, received); "not eligible" here only confused people.
const legacyRequest = computed(() => state.value === 'ready' && !progress.value
  && preview.value?.eligibility !== 'PENDING_ASSISTANCE' && preview.value?.reason === 'LEGACY_OR_NOT_ENROLLED');
const reached = computed(() => STEP_REACHED[progress.value?.status ?? ''] ?? 0);
const money = (value: number | null) => (value === null ? 'Chưa xác định' : `${value.toLocaleString('vi-VN')} ₫`);
async function load() {
  const current = ++generation;
  preview.value = null;
  state.value = 'loading';
  if (!visible.value) return;
  const requestId = props.requestId;
  try {
    const result = await w3DeliveryPhysicalApi.preview(requestId);
    if (current !== generation) return;
    preview.value = result;
    state.value = 'ready';
  } catch (error) {
    if (current !== generation) return;
    const status = getHttpStatus(error);
    state.value = status === 404 || status === 503 ? 'unavailable' : status === 401 || status === 403 ? 'forbidden' : 'error';
  }
}
watch(() => [props.requestId, props.fulfillmentMethod, props.audience, auth.user?.id, auth.userRole, auth.token],
  () => { void load(); }, { immediate: true, flush: 'sync' });
onUnmounted(() => { generation++; });
</script>

<template>
  <section v-if="visible && !legacyRequest" :aria-labelledby="titleId" :aria-busy="state === 'loading'"
    class="min-w-0 space-y-3 rounded-[var(--radius-md)] border border-ink-200 bg-ink-25/80 p-4 text-sm text-ink-700"
    data-testid="delivery-physical-preview">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 :id="titleId" class="font-semibold text-ink-900">Trạng thái giao linh kiện</h4>
      <span class="rounded-full bg-ink-100 border border-ink-200/80 px-2.5 py-0.5 text-xs font-medium text-ink-600">Chỉ xem</span>
    </div>
    <div role="status" aria-live="polite">
      <template v-if="state === 'loading'">
        <span class="sr-only">Đang kiểm tra trạng thái giao linh kiện…</span>
        <FhSkeleton class="h-5 w-full max-w-sm" />
      </template>
      <p v-else-if="state === 'unavailable'" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-ink-700">Chưa có thông tin giao linh kiện khả dụng. Vui lòng kiểm tra lại sau.</p>
      <p v-else-if="state === 'forbidden'" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-700">Bạn không có quyền xem nội dung này.</p>
      <div v-else-if="preview && progress" class="rounded-[var(--radius-sm)] border px-3 py-2.5" :class="reached >= 4 ? 'border-success-200 bg-success-50/70' : 'border-brand-200 bg-brand-50/60'">
        <p class="font-semibold" :class="reached >= 4 ? 'text-success-800' : 'text-brand-800'">{{ reached >= 4 ? 'Kỹ thuật viên đã nhận linh kiện' : reached > 0 ? 'Đang giao linh kiện' : 'Đã thoả thuận phí giao' }}</p>
      </div>
      <div
        v-else-if="preview"
        class="rounded-[var(--radius-sm)] border px-3 py-2.5"
        :class="preview.eligibility === 'PENDING_ASSISTANCE' ? 'border-warning-200 bg-warning-50/75' : 'border-ink-200 bg-white'"
      >
        <p class="font-semibold" :class="preview.eligibility === 'PENDING_ASSISTANCE' ? 'text-warning-800' : 'text-ink-900'">
          {{ preview.eligibility === 'PENDING_ASSISTANCE' ? 'Cần hỗ trợ' : 'Chưa đủ điều kiện' }}
        </p>
        <p class="mt-1 text-xs sm:text-sm text-ink-700">{{ reasonLabels[preview.reason] }}</p>
      </div>
    </div>
    <p v-if="state === 'error'" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-700">Chưa thể kiểm tra trạng thái giao linh kiện. Vui lòng thử lại.</p>
    <template v-if="state === 'ready' && preview && progress">
      <dl class="grid gap-3 rounded-[var(--radius-sm)] border border-ink-100 bg-white p-3 sm:grid-cols-2">
        <div><dt class="text-xs font-medium text-ink-500">Phí giao thực tế</dt><dd class="mt-0.5 font-num font-semibold text-ink-900">{{ money(progress.actualShippingFee) }}</dd></div>
        <div><dt class="text-xs font-medium text-ink-500">Khách trả / Kỹ thuật viên chịu</dt><dd class="mt-0.5 font-num font-semibold text-ink-900">{{ money(progress.customerShippingShare) }} / {{ money(progress.technicianShippingShare) }}</dd></div>
      </dl>
      <ul class="space-y-1.5 rounded-[var(--radius-sm)] border border-ink-100 bg-white p-3 text-xs sm:text-sm" aria-label="Các bước giao nhận">
        <li v-for="(step, index) in steps" :key="step" class="flex items-center justify-between gap-2">
          <span class="text-ink-700">{{ step }}:</span>
          <span class="font-medium shrink-0" :class="index < reached ? 'text-success-700' : 'text-ink-500'">{{ index < reached ? 'Đã xong' : 'Chưa tới' }}</span>
        </li>
      </ul>
    </template>
    <!-- BUG DETECTOR 242: one status line up front; the rest opens on demand. -->
    <details v-else-if="state === 'ready' && preview" class="min-w-0 rounded-[var(--radius-sm)] border border-ink-200/80 bg-white px-3">
      <summary class="min-h-11 cursor-pointer py-2.5 font-medium text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">Xem chi tiết giao nhận</summary>
      <div class="space-y-3 border-t border-ink-100 py-3">
      <p class="break-all font-mono text-xs text-ink-500">Mã yêu cầu: {{ requestId }}</p>
      <p class="text-xs text-ink-600">Thông tin chỉ để tham khảo tại thời điểm kiểm tra, chưa xác nhận giao nhận hoặc phê duyệt chi phí.</p>
      <dl class="grid gap-3 rounded-[var(--radius-sm)] bg-ink-25 p-3 sm:grid-cols-2">
        <div><dt class="text-xs font-medium text-ink-500">Chứng từ giao nhận</dt><dd class="mt-0.5 font-medium text-ink-900">{{ preview.evidence === 'NOT_RECORDED' ? 'Chưa ghi nhận' : 'Đã ghi nhận, chưa được xác minh độc lập' }}</dd></div>
        <div><dt class="text-xs font-medium text-ink-500">Phí giao thực tế</dt><dd class="mt-0.5 font-medium text-ink-900">Chưa xác định</dd></div>
        <div><dt class="text-xs font-medium text-ink-500">Thanh toán cho đơn vị giao hàng</dt><dd class="mt-0.5 font-medium text-ink-900">Chưa ghi nhận thanh toán</dd></div>
        <div><dt class="text-xs font-medium text-ink-500">Thực hiện tài chính</dt><dd class="mt-0.5 font-medium text-ink-900">Chưa mở</dd></div>
      </dl>
      <p v-if="preview.lastAssessment" class="text-xs text-ink-600">Có bản đánh giá trước (phiên bản {{ preview.lastAssessment.version }}); đây chưa phải xác nhận giao nhận.</p>
      <ul class="space-y-1 text-xs sm:text-sm" aria-label="Các bước giao nhận chưa mở">
        <li v-for="step in steps" :key="step" class="flex items-center justify-between gap-2">
          <span class="text-ink-700">{{ step }}:</span>
          <span class="font-medium text-ink-500 shrink-0">Chưa mở</span>
        </li>
      </ul>
      <div class="min-w-0">
        <p class="font-medium text-ink-900">Điều kiện chưa xác minh</p>
        <ul class="mt-1 list-disc space-y-1 pl-5 text-xs sm:text-sm text-ink-600">
          <li v-for="blocker in preview.blockers" :key="blocker">{{ deliveryPhysicalBlockerLabels[blocker] }}</li>
        </ul>
      </div>
      </div>
    </details>
    <p v-if="state === 'ready' && preview && progress" class="break-all font-mono text-xs text-ink-500">Mã yêu cầu: {{ requestId }}</p>
    <FhButton v-if="state === 'ready' || state === 'error'" variant="secondary" size="sm" @click="load">
      {{ state === 'error' ? 'Thử lại' : 'Kiểm tra lại' }}
    </FhButton>
  </section>
</template>
