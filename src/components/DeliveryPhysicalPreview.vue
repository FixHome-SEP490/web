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
  <section v-if="visible" :aria-labelledby="titleId" :aria-busy="state === 'loading'"
    class="min-w-0 space-y-3 rounded-xl border border-ink-200 bg-ink-25 p-4 text-sm text-ink-700"
    data-testid="delivery-physical-preview">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h4 :id="titleId" class="font-semibold text-ink-900">Trạng thái giao linh kiện</h4>
      <span class="text-xs font-medium text-ink-600">Chỉ xem</span>
    </div>
    <p class="break-all text-xs text-ink-600">Mã yêu cầu: {{ requestId }}</p>
    <div role="status" aria-live="polite">
      <template v-if="state === 'loading'">
        <span class="sr-only">Đang kiểm tra trạng thái giao linh kiện…</span>
        <FhSkeleton class="h-5 w-full max-w-sm" />
      </template>
      <p v-else-if="state === 'unavailable'">Chưa có thông tin giao linh kiện khả dụng. Vui lòng kiểm tra lại sau.</p>
      <p v-else-if="state === 'forbidden'">Bạn không có quyền xem nội dung này.</p>
      <template v-else-if="preview">
        <p class="font-medium text-ink-900">{{ preview.eligibility === 'PENDING_ASSISTANCE' ? 'Cần hỗ trợ' : 'Chưa đủ điều kiện' }}</p>
        <p class="mt-1">{{ reasonLabels[preview.reason] }}</p>
      </template>
    </div>
    <p v-if="state === 'error'" role="alert" class="text-danger-700">Chưa thể kiểm tra trạng thái giao linh kiện. Vui lòng thử lại.</p>
    <template v-if="state === 'ready' && preview">
      <p>Thông tin chỉ để tham khảo tại thời điểm kiểm tra, chưa xác nhận giao nhận hoặc phê duyệt chi phí.</p>
      <dl class="grid gap-3 sm:grid-cols-2">
        <div><dt class="font-medium text-ink-900">Chứng từ giao nhận</dt><dd>{{ preview.evidence === 'NOT_RECORDED' ? 'Chưa ghi nhận' : 'Đã ghi nhận, chưa được xác minh độc lập' }}</dd></div>
        <div><dt class="font-medium text-ink-900">Phí giao thực tế</dt><dd>Chưa xác định</dd></div>
        <div><dt class="font-medium text-ink-900">Thanh toán cho đơn vị giao hàng</dt><dd>Chưa ghi nhận thanh toán</dd></div>
        <div><dt class="font-medium text-ink-900">Thực hiện tài chính</dt><dd>Chưa mở</dd></div>
      </dl>
      <p v-if="preview.lastAssessment">Có bản đánh giá trước (phiên bản {{ preview.lastAssessment.version }}); đây chưa phải xác nhận giao nhận.</p>
      <ul class="space-y-1" aria-label="Các bước giao nhận chưa mở">
        <li v-for="step in steps" :key="step">{{ step }}: <span class="font-medium">Chưa mở</span></li>
      </ul>
      <details class="min-w-0">
        <summary class="min-h-11 cursor-pointer py-3 font-medium text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-600">Điều kiện chưa xác minh</summary>
        <ul class="list-disc space-y-1 pl-5">
          <li v-for="blocker in preview.blockers" :key="blocker">{{ deliveryPhysicalBlockerLabels[blocker] }}</li>
        </ul>
      </details>
    </template>
    <FhButton v-if="state === 'ready' || state === 'error'" variant="secondary" @click="load">
      {{ state === 'error' ? 'Thử lại' : 'Kiểm tra lại' }}
    </FhButton>
  </section>
</template>
