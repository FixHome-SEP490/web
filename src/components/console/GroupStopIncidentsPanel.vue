<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import FhButton from '../FhButton.vue';
import { useAuthStore } from '../../stores/auth';
import { groupStopApi, type GroupStopIncident } from '../../api/group-stop.api';
import { consoleOrderContextApi } from '../../api/console-order-context.api';
import { orderStatusLabel, paymentStatusLabel } from './console-labels';
import { vnDateTimeString } from '../../utils/vn-time';
const props = defineProps<{ orderId: string; groupId?: string | null }>();
const auth = useAuthStore();
const canRead = computed(() => ['SERVICE_MANAGER', 'ADMIN'].includes(auth.userRole ?? '') && auth.hasPermission('support:read_all') && auth.hasPermission('order:read_related'));
const rows = ref<GroupStopIncident[]>([]);
const busy = ref(false);
const error = ref(false);
const group = ref<string | null>(null);
let generation = 0;
async function read() {
  const request = ++generation;
  rows.value = []; error.value = false; group.value = null;
  if (!canRead.value) return;
  busy.value = true;
  try {
    let groupId = props.groupId;
    if (groupId === undefined) {
      const order = await consoleOrderContextApi.getConsoleOrderContext(props.orderId);
      if (order.id !== props.orderId) throw new Error('Mismatched order');
      groupId = order.visitGroupId;
    }
    if (request !== generation) return;
    group.value = groupId ?? null;
    if (!groupId) return;
    const incidents = await groupStopApi.incidents(groupId);
    if (request === generation && canRead.value) rows.value = incidents;
  } catch { if (request === generation) error.value = true; }
  finally { if (request === generation) busy.value = false; }
}
watch(() => [props.orderId, props.groupId, canRead.value], read, { immediate: true });
onBeforeUnmount(() => { ++generation; });
</script>
<template>
  <section v-if="canRead && (busy || error || group)" class="space-y-3 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 text-sm shadow-(--shadow-e1)" aria-label="Sự cố dừng cả lượt" :aria-busy="busy" data-testid="group-stop-incidents">
    <h2 class="font-semibold text-ink-900">Sự cố dừng cả lượt</h2>
    <p v-if="busy" class="text-ink-600">Đang kiểm tra hồ sơ lượt…</p>
    <p v-else-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-700">Chưa đọc được hồ sơ lượt. Chưa thể kết luận trạng thái các máy.</p>
    <template v-else>
      <p v-if="!rows.length" class="text-ink-500">Chưa có biên nhận dừng cả lượt.</p>
      <article v-for="incident in rows" :key="incident.commandId" class="space-y-3 border-t border-ink-100 pt-3" data-testid="group-stop-incident">
        <h3 class="font-medium text-ink-900">Một báo cáo cả lượt · <span class="font-num">{{ vnDateTimeString(incident.recordedAt) }}</span></h3>
        <p class="text-ink-700">Đã dừng <span class="font-num font-semibold text-ink-900">{{ incident.result.stopped.length }}</span> máy; giữ nguyên <span class="font-num font-semibold text-ink-900">{{ incident.result.preserved.length }}</span> máy. Tiền, báo giá và nghĩa vụ linh kiện cũ được giữ để đối soát; không tự quy trách nhiệm hoặc phát sinh phí.</p>
        <ul class="space-y-1 text-ink-600"><li v-for="proof in incident.contactEvidence" :key="proof.id">{{ proof.after.kind === 'CALL_ATTEMPT' ? 'Lần thử gọi, chưa xác minh kết nối' : 'Thông báo trong ứng dụng' }} · <span class="font-num">{{ vnDateTimeString(proof.createdAt) }}</span></li></ul>
        <ul class="space-y-3">
          <li v-for="(child, index) in incident.children" :key="child.bookingId" class="rounded-[var(--radius-sm)] border border-ink-100 bg-ink-50/60 p-3 space-y-1">
            <p class="font-medium text-ink-900">Máy <span class="font-num">{{ index + 1 }}</span> · {{ incident.result.stopped.some(row => row.orderId === child.orderId) ? 'Đã dừng công việc' : 'Giữ nguyên kết quả' }}</p>
            <p class="text-ink-600">{{ child.orderStatus ? orderStatusLabel(child.orderStatus) : 'Trạng thái chưa xác định' }} · {{ child.paymentStatus ? paymentStatusLabel(child.paymentStatus) : 'Thanh toán chưa xác định' }}<template v-if="child.completionRequestedAt"> · Đã yêu cầu hoàn tất</template></p>
            <router-link v-if="child.orderId" :to="`/console/orders/${child.orderId}`" class="inline-flex min-h-9 items-center font-medium text-brand-700 hover:underline">Xem đơn máy {{ index + 1 }}</router-link>
            <div class="flex flex-wrap gap-3"><router-link v-for="(item, caseIndex) in child.cases" :key="item.id" :to="`/console/support/${item.id}`" class="inline-flex min-h-9 items-center font-medium text-brand-700 hover:underline">Hồ sơ máy {{ index + 1 }} · {{ caseIndex + 1 }}</router-link></div>
          </li>
        </ul>
        <router-link v-if="auth.userRole === 'SERVICE_MANAGER'" to="/console/part-returns" class="inline-flex min-h-9 items-center font-medium text-brand-700 hover:underline">Kiểm tra linh kiện hoàn trả</router-link>
        <p v-else class="text-ink-600">Quản trị viên xem hồ sơ; xử lý vận hành, tài chính và nhận linh kiện thuộc quyền quản lý dịch vụ hiện có.</p>
      </article>
    </template>
    <FhButton variant="secondary" size="md" :disabled="busy" @click="read">{{ error ? 'Thử lại' : 'Kiểm tra hồ sơ mới nhất' }}</FhButton>
  </section>
</template>
