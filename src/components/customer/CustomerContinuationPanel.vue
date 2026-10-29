<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import FhButton from '../FhButton.vue';
import FhSkeleton from '../FhSkeleton.vue';
import { customerContinuationApi, type CustomerContinuation } from '../../api/platform-continuation.api';
import { onOrderChange, onResync } from '../../services/live-updates';
import { useQueryClient } from '@tanstack/vue-query';

const props = defineProps<{ orderId: string; bookingId: string; visitGroupId: string | null; orderStatus: string }>();
const router = useRouter();
const result = ref<CustomerContinuation | null>(null);
const loading = ref(false);
const failed = ref(false);
let generation = 0;
let disposed = false;
let scope = '';
let stopOrder = () => {};
async function read() {
  const request = ++generation;
  const nextScope = `${props.orderId}:${props.bookingId}:${props.visitGroupId ?? ''}`;
  // A different device/order must not keep showing the previous source receipt.
  if (nextScope !== scope) { scope = nextScope; result.value = null; failed.value = false; }
  if (!props.orderId || !props.bookingId) { loading.value = false; return; }
  loading.value = true;
  try {
    const data = await customerContinuationApi.get(props.orderId, props.bookingId, props.visitGroupId);
    if (!disposed && request === generation) { result.value = data; failed.value = false; }
  } catch { if (!disposed && request === generation) failed.value = true; }
  finally { if (!disposed && request === generation) loading.value = false; }
}
watch(() => [props.orderId, props.bookingId, props.visitGroupId, props.orderStatus], () => {
  stopOrder();
  stopOrder = onOrderChange(props.orderId, read);
  void read();
}, { immediate: true });
const stopResync = onResync(read);
// Logout/account switch clears the query cache. Invalidate an in-flight private read too.
const stopCache = useQueryClient().getQueryCache().subscribe(event => {
  if (event.type === 'removed') { ++generation; result.value = null; loading.value = false; }
});
function wake() { if (document.visibilityState !== 'hidden') void read(); }
onMounted(() => { window.addEventListener('focus', wake); window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake); });
onBeforeUnmount(() => {
  disposed = true; ++generation; stopOrder(); stopResync(); stopCache();
  window.removeEventListener('focus', wake); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake);
});
function newBooking() {
  if (!loading.value && result.value?.customerContinuation.eligible && result.value.customerContinuation.independentNewBookingAllowed) void router.push('/app/bookings/new');
}
</script>

<template>
  <section v-if="loading || failed || result?.customerContinuation.eligible" class="min-w-0 space-y-3 rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-700" aria-label="Tiếp tục sau gián đoạn" data-testid="customer-continuation">
    <FhSkeleton v-if="loading" height="20px" :count="2" aria-label="Đang kiểm tra gián đoạn" />
    <div v-else-if="failed" role="alert" class="space-y-2">
      <p>Chưa kiểm tra được quyền đặt lịch sau gián đoạn. Dữ liệu đơn cũ vẫn được giữ nguyên.</p>
      <FhButton variant="secondary" size="md" data-testid="continuation-retry" @click="read">Thử lại</FhButton>
    </div>
    <template v-else-if="result?.customerContinuation.eligible">
      <h3 class="font-semibold text-ink-900">Đã ghi nhận gián đoạn</h3>
      <p>Đơn cũ chưa được hủy. Báo giá, thanh toán và nghĩa vụ linh kiện của đơn cũ được giữ nguyên để đối soát riêng.</p>
      <p>Khai trả linh kiện chưa phải xác nhận đã nhận kho. Quản lý dịch vụ phải kiểm đếm và nhận thực tế; linh kiện cũ chưa có sổ theo dõi vẫn cần kiểm tra.</p>
      <p>Bạn có thể đặt lịch mới độc lập, không cần chờ xử lý đơn cũ. Hãy chọn lịch và xác nhận giá mới; tiền và ưu đãi cũ không chuyển sang đơn mới.</p>
      <FhButton v-if="result.customerContinuation.independentNewBookingAllowed" size="md" data-testid="continuation-new-booking" @click="newBooking">Đặt lịch mới</FhButton>
      <p class="text-ink-600">Đặt lại với thông tin điền sẵn chưa sẵn sàng.</p>
    </template>
  </section>
</template>
