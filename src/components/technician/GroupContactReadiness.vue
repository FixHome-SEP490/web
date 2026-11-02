<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import FhButton from '../FhButton.vue';
import { groupStopApi, type ContactKind, type ContactReadiness, type GroupStopPort } from '../../api/group-stop.api';
const props = defineProps<{ groupId: string; orderId: string; phone?: string | null; port: GroupStopPort; disabled: boolean }>();
const emit = defineEmits<{ readiness: [ready: boolean] }>();
const result = ref<ContactReadiness | null>(null);
const busy = ref(false);
const failed = ref(false);
const error = ref('');
const now = ref(Date.now());
const receivedAt = ref(Date.now());
const pendingKind = ref<ContactKind | null>(props.port.pendingContact(props.groupId, props.orderId));
const phone = computed(() => props.phone && /^\+?[\d ()-]{8,20}$/.test(props.phone) ? props.phone.replace(/[ ()-]/g, '') : null);
const serverNow = computed(() => result.value ? Date.parse(result.value.serverNow) + Math.max(0, now.value - receivedAt.value) : 0);
const remaining = computed(() => result.value?.nextEligibleAt ? Math.max(0, Math.ceil((Date.parse(result.value.nextEligibleAt) - serverNow.value) / 1000)) : null);
const countdown = computed(() => remaining.value === null ? 'Chưa có lần gọi đầu' : `${Math.floor(remaining.value / 60)}:${String(remaining.value % 60).padStart(2, '0')}`);
const callWaiting = computed(() => !!result.value?.nextCallAt && Date.parse(result.value.nextCallAt) > serverNow.value);
let generation = 0;
let disposed = false;
async function read() {
  const request = ++generation;
  try {
    const data = await groupStopApi.readiness(props.groupId, props.orderId);
    if (disposed || request !== generation) return;
    result.value = data; receivedAt.value = Date.now(); now.value = Date.now(); failed.value = false;
    emit('readiness', data.ready);
  } catch { if (!disposed && request === generation) { failed.value = true; emit('readiness', false); } }
}
async function contact(kind: ContactKind) {
  if (busy.value || props.disabled || (pendingKind.value && pendingKind.value !== kind)) return;
  if (!pendingKind.value && (kind === 'CALL_ATTEMPT' ? !phone.value || callWaiting.value : result.value?.notificationSent)) return;
  ++generation;
  busy.value = true; error.value = ''; emit('readiness', false);
  try {
    await props.port.contact(props.groupId, props.orderId, kind);
    if (disposed) return;
    pendingKind.value = null;
    await read();
  } catch { if (!disposed) { pendingKind.value = kind; error.value = 'Chưa xác nhận được lần liên hệ. Thử đối chiếu cùng thao tác; không ghi nhận là đã kết nối cuộc gọi.'; } }
  finally { if (!disposed) busy.value = false; }
}
function call() {
  if (!phone.value || props.disabled || busy.value || callWaiting.value || pendingKind.value) return;
  // Opens the dialler only; this is an attempt and never proof the customer answered.
  window.location.href = `tel:${phone.value}`;
  void contact('CALL_ATTEMPT');
}
watch(() => [props.groupId, props.orderId], () => { result.value = null; void read(); });
onMounted(read);
const tick = setInterval(() => { now.value = Date.now(); }, 1000);
const poll = setInterval(() => { if (!busy.value && !props.disabled && document.visibilityState !== 'hidden') void read(); }, 15000);
onBeforeUnmount(() => { disposed = true; ++generation; clearInterval(tick); clearInterval(poll); });
</script>
<template>
  <section class="space-y-2 rounded-xl border border-ink-200 p-3" aria-label="Xác minh liên hệ khách hàng" data-testid="group-contact-readiness">
    <p>Cần check-in hợp lệ, 2 lần gọi cách nhau ít nhất 5 phút, một thông báo trong ứng dụng và chờ đủ 10 phút từ lần gọi đầu. Không xác nhận khách đã nghe máy hoặc tự quy trách nhiệm.</p>
    <p v-if="result">Đã ghi nhận {{ result.contactCount }} lần gọi · {{ result.callsSpaced ? 'Đủ khoảng cách gọi' : 'Chưa đủ khoảng cách gọi' }} · {{ result.notificationSent ? 'Đã gửi thông báo' : 'Chưa gửi thông báo' }}</p>
    <p data-testid="group-countdown">Thời gian chờ còn lại: {{ countdown }}. {{ result?.ready && !failed ? 'Máy chủ xác nhận đủ điều kiện liên hệ.' : 'Cần máy chủ xác nhận trước khi dừng.' }}</p>
    <p v-if="!phone">Chưa có số điện thoại hợp lệ để mở cuộc gọi.</p>
    <p v-if="failed" role="alert">Chưa đọc được điều kiện liên hệ. Thử kiểm tra lại; chưa thể dừng lượt.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <FhButton v-if="pendingKind" variant="secondary" size="md" :disabled="busy || disabled" data-testid="contact-reconcile" @click="contact(pendingKind)">Đối chiếu lần liên hệ trước</FhButton>
      <template v-else>
        <FhButton variant="secondary" size="md" :disabled="disabled || busy || !phone || callWaiting" data-testid="contact-call" @click="call">Gọi khách và ghi nhận lần thử</FhButton>
        <FhButton variant="secondary" size="md" :disabled="disabled || busy || result?.notificationSent" data-testid="contact-notice" @click="contact('IN_APP_NOTIFICATION')">Gửi thông báo trong ứng dụng</FhButton>
      </template>
      <FhButton variant="ghost" size="md" :disabled="busy || disabled" data-testid="contact-refresh" @click="read">Kiểm tra điều kiện</FhButton>
    </div>
  </section>
</template>
