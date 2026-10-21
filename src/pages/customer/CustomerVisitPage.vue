<script setup lang="ts">
/**
 * One visit of up to three devices (PO 21/10/2026): one technician with every
 * skill takes them all, each device is quoted and repaired on its own, and the
 * customer pays once, after every device has its result, for the devices
 * repaired only. Matching, the one reschedule and cancelling act on the whole
 * visit here; each device's order page shows its own quote and photos.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Banknote, ChevronRight, Wallet, X } from 'lucide-vue-next';
import { FhBackLink, FhButton, FhMoney, FhSkeleton } from '../../components';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import { visitGroupsApi, type Visit, type VisitCheckout, type VisitDeviceState } from '../../api/visit-groups.api';
import { customerWalletApi } from '../../api/customer-wallet.api';
import { sessionLabel, upcomingSessions, type BookingSlot, type SessionOption } from '../../utils/booking-session';
import { userFacingError } from '../../utils/user-facing-error';

const route = useRoute();
const router = useRouter();
const visitId = route.params.id as string;

const visit = ref<Visit | null>(null);
const checkout = ref<VisitCheckout | null>(null);
const loading = ref(true);
const loadError = ref('');
const busy = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

async function load() {
  loadError.value = '';
  try {
    visit.value = await visitGroupsApi.get(visitId);
    checkout.value = await visitGroupsApi.checkout(visitId).catch(() => null);
  } catch (err) {
    loadError.value = userFacingError(err, 'Không tải được lượt sửa. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const lead = computed(() => visit.value?.items.find((item) => item.booking?.id === visit.value?.leadBookingId)?.booking ?? null);
const cancelled = computed(() => visit.value?.status === 'cancelled');
const held = computed(() => (checkout.value?.devices ?? []).some((device) => device.serviceOrderId));
const matchingState = computed(() => lead.value?.status ?? 'SUBMITTED');
const canChooseTechnician = computed(() => !cancelled.value && !held.value && ['SUBMITTED', 'CLOSED'].includes(matchingState.value));
const rescheduled = computed(() => (visit.value?.items ?? []).some((item) => (item.booking?.rescheduleCount ?? 0) >= 1));
const repairStarted = computed(() => (checkout.value?.devices ?? []).some((device) => device.state !== 'open'));
const canReschedule = computed(() => !cancelled.value && !rescheduled.value && !repairStarted.value);
const canCancel = computed(() => !cancelled.value && !repairStarted.value);

const sessionText = computed(() => visit.value ? sessionLabel({ bookingMode: visit.value.bookingMode, slot: visit.value.slot, start: visit.value.preferredStartAt }) : '');

const STATE_LABEL: Record<VisitDeviceState, string> = {
  succeeded: 'Đã sửa xong',
  failed: 'Không sửa được, không tính tiền',
  quote_declined: 'Bạn không duyệt báo giá, không tính tiền',
  cancelled: 'Đã huỷ',
  open: 'Đang xử lý',
};
function deviceOf(bookingId: string | undefined) {
  return checkout.value?.devices.find((device) => device.bookingId === bookingId) ?? null;
}
function statusText(item: Visit['items'][number]): string {
  const device = deviceOf(item.booking?.id);
  if (cancelled.value) return 'Đã huỷ';
  if (device?.serviceOrderId) return STATE_LABEL[device.state];
  if (matchingState.value === 'MATCHING') return 'Đang chờ thợ nhận';
  if (matchingState.value === 'CLOSED') return 'Chưa có thợ nhận';
  return 'Chưa chọn thợ';
}

// ── Reschedule, once for the whole visit ──
const rescheduleOpen = ref(false);
const sessions = ref<SessionOption[]>([]);
const chosenSession = ref<{ date: string; slot: BookingSlot } | null>(null);
async function openReschedule() {
  rescheduleOpen.value = true;
  chosenSession.value = null;
  sessions.value = upcomingSessions(14);
  if (held.value && visit.value?.leadBookingId) {
    sessions.value = await visitGroupsApi.availableSessions(visit.value.leadBookingId).catch(() => upcomingSessions(14));
  }
}
async function saveReschedule() {
  if (!chosenSession.value || busy.value) return;
  busy.value = true;
  try {
    visit.value = await visitGroupsApi.reschedule(visitId, chosenSession.value);
    rescheduleOpen.value = false;
    message.value = { type: 'success', text: 'Đã đổi lịch hẹn cho cả lượt sửa.' };
    await load();
  } catch (err) {
    message.value = { type: 'error', text: userFacingError(err, 'Chưa đổi được lịch. Vui lòng chọn buổi khác.') };
  } finally {
    busy.value = false;
  }
}

// ── Cancel the whole visit ──
const cancelOpen = ref(false);
async function confirmCancel() {
  if (busy.value) return;
  busy.value = true;
  try {
    await visitGroupsApi.cancel(visitId, 'Khách huỷ lượt sửa');
    cancelOpen.value = false;
    message.value = { type: 'success', text: 'Đã huỷ lượt sửa.' };
    await load();
  } catch (err) {
    message.value = { type: 'error', text: userFacingError(err, 'Chưa huỷ được lượt sửa.') };
  } finally {
    busy.value = false;
  }
}

// ── One payment for the visit ──
type PayMethod = 'wallet' | 'vnpay' | 'cash';
const payMethod = ref<PayMethod>('wallet');
const walletBalance = ref<number | null>(null);
const walletCovers = computed(() => walletBalance.value !== null && checkout.value !== null && walletBalance.value >= checkout.value.total);
const vnpayAllowed = computed(() => (checkout.value?.total ?? 0) >= 5000);
const payMethods = computed<PayMethod[]>(() => (['wallet', 'vnpay', 'cash'] as PayMethod[]).filter((method) => method !== 'vnpay' || vnpayAllowed.value));
async function loadWallet() {
  walletBalance.value = await customerWalletApi.summary(1, 1).then((wallet) => wallet.balance).catch(() => null);
}
onMounted(loadWallet);

async function payWithWallet() {
  if (busy.value || !walletCovers.value) return;
  busy.value = true;
  try {
    const result = await visitGroupsApi.payWithWallet(visitId);
    message.value = { type: 'success', text: `Đã thanh toán ${result.amount.toLocaleString('vi-VN')} ₫ bằng ví cho cả lượt.` };
    await Promise.all([load(), loadWallet()]);
  } catch (err) {
    message.value = { type: 'error', text: userFacingError(err, 'Chưa thanh toán được bằng ví.') };
  } finally {
    busy.value = false;
  }
}
async function payWithVnpay() {
  if (busy.value) return;
  busy.value = true;
  try {
    window.location.href = await visitGroupsApi.vnpayUrl(visitId);
  } catch (err) {
    message.value = { type: 'error', text: userFacingError(err, 'Chưa mở được trang thanh toán VNPay. Vui lòng thử lại.') };
    busy.value = false;
  }
}
async function answerCash(agreed: boolean) {
  if (busy.value) return;
  busy.value = true;
  try {
    await visitGroupsApi.confirmCash(visitId, agreed, agreed ? undefined : 'Số tiền mặt chưa đúng');
    message.value = agreed
      ? { type: 'success', text: 'Đã xác nhận trả tiền mặt cho cả lượt.' }
      : { type: 'success', text: 'Đã báo FixHome kiểm tra lại số tiền mặt.' };
    await load();
  } catch (err) {
    message.value = { type: 'error', text: userFacingError(err, agreed ? 'Chưa xác nhận được.' : 'Đã ghi nhận, FixHome sẽ liên hệ để kiểm tra.') };
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-5 pb-16" data-testid="customer-visit">
    <FhBackLink label="Đơn của tôi" @click="router.push('/app/orders')" />

    <FhSkeleton v-if="loading" class="h-40 rounded-2xl" />
    <div v-else-if="loadError" role="alert" class="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
      {{ loadError }}
      <FhButton variant="secondary" size="sm" class="ml-2" @click="load">Thử lại</FhButton>
    </div>

    <template v-else-if="visit">
      <header class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight text-ink-900">Lượt sửa {{ visit.items.length }} thiết bị</h1>
        <p class="text-sm text-ink-600">{{ sessionText }}<template v-if="cancelled"> · Đã huỷ</template></p>
      </header>

      <p
        v-if="message"
        role="status"
        class="rounded-xl border px-3.5 py-2.5 text-sm"
        :class="message.type === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'"
      >{{ message.text }}</p>

      <section class="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white" data-testid="visit-device-list">
        <component
          :is="deviceOf(item.booking?.id)?.serviceOrderId ? 'router-link' : 'div'"
          v-for="item in visit.items"
          :key="item.id"
          :to="deviceOf(item.booking?.id)?.serviceOrderId ? `/app/orders/${deviceOf(item.booking?.id)?.serviceOrderId}` : undefined"
          class="flex items-center gap-3 px-5 py-4 sm:px-6"
          :class="deviceOf(item.booking?.id)?.serviceOrderId ? 'hover:bg-ink-25' : ''"
          :data-testid="`visit-device-${item.sequence}`"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium text-ink-900">Máy {{ item.sequence }}: {{ item.booking?.serviceName }}<span v-if="item.deviceLabel" class="font-normal text-ink-500"> · {{ item.deviceLabel }}</span></p>
            <p class="text-sm text-ink-500">{{ statusText(item) }}</p>
          </div>
          <span v-if="deviceOf(item.booking?.id)?.state === 'succeeded'" class="whitespace-nowrap text-sm font-semibold text-ink-900 font-num"><FhMoney :amount="deviceOf(item.booking?.id)!.amount" /></span>
          <ChevronRight v-if="deviceOf(item.booking?.id)?.serviceOrderId" :size="18" class="shrink-0 text-ink-400" aria-hidden="true" />
        </component>
      </section>

      <section v-if="!cancelled" class="flex flex-wrap gap-2.5">
        <FhButton v-if="canChooseTechnician" variant="primary" size="md" data-testid="visit-choose-technician" @click="router.push(`/app/visits/${visitId}/candidates`)">
          {{ matchingState === 'CLOSED' ? 'Chọn thợ khác' : 'Chọn kỹ thuật viên' }}
        </FhButton>
        <FhButton v-if="canReschedule" variant="secondary" size="md" data-testid="visit-reschedule" @click="openReschedule">Đổi lịch hẹn</FhButton>
        <FhButton v-else-if="rescheduled && !repairStarted" variant="secondary" size="md" disabled data-testid="visit-reschedule-used">Đã đổi lịch một lần</FhButton>
        <FhButton v-if="canCancel" variant="ghost" size="md" class="text-danger-700" data-testid="visit-cancel" @click="cancelOpen = true">Huỷ lượt sửa</FhButton>
      </section>

      <!-- One payment for the devices repaired, once every device has its result. -->
      <section v-if="checkout && held" class="space-y-3 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-sm sm:px-6" data-testid="visit-checkout">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="font-semibold text-ink-900">Thanh toán cả lượt</h2>
          <span v-if="checkout.paid" class="font-semibold text-success-700">Đã thanh toán</span>
          <span v-else class="text-xl font-semibold text-brand-700 font-num"><FhMoney :amount="checkout.total" /></span>
        </div>
        <p v-if="checkout.waiting > 0" class="text-ink-600">Còn {{ checkout.waiting }} thiết bị đang xử lý. Bạn thanh toán một lần khi mọi thiết bị đã có kết quả, chỉ cho các máy sửa được.</p>

        <template v-else-if="checkout.ready">
          <div v-if="checkout.pendingCash" class="space-y-2 rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-warning-900" data-testid="visit-cash-pending">
            <p>Thợ báo đã nhận <strong class="font-num"><FhMoney :amount="checkout.pendingCash.amount" /></strong> tiền mặt cho cả lượt. Bạn xác nhận đúng số tiền đã trả.</p>
            <div class="flex flex-wrap gap-2">
              <FhButton size="md" :loading="busy" data-testid="visit-cash-confirm" @click="answerCash(true)">Đúng, tôi đã trả</FhButton>
              <FhButton variant="secondary" size="md" :disabled="busy" data-testid="visit-cash-dispute" @click="answerCash(false)">Chưa đúng</FhButton>
            </div>
          </div>
          <template v-else>
            <div class="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200" role="radiogroup" aria-label="Cách thanh toán" data-testid="visit-pay-methods">
              <button
                v-for="method in payMethods"
                :key="method"
                type="button"
                role="radio"
                :aria-checked="payMethod === method"
                class="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors"
                :class="payMethod === method ? 'bg-brand-50' : 'bg-white hover:bg-ink-50'"
                :data-testid="`visit-pay-method-${method}`"
                :disabled="busy"
                @click="payMethod = method"
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700" aria-hidden="true">
                  <Wallet v-if="method === 'wallet'" :size="18" />
                  <span v-else-if="method === 'vnpay'" class="text-[10px] font-extrabold leading-none tracking-tight"><span class="text-[#005BAA]">VN</span><span class="text-[#ED1C24]">PAY</span></span>
                  <Banknote v-else :size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-ink-900">{{ method === 'wallet' ? 'Ví FixHome' : method === 'vnpay' ? 'VNPay' : 'Tiền mặt' }}</span>
                  <span v-if="method === 'wallet'" class="block text-xs" :class="walletBalance !== null && !walletCovers ? 'text-warning-800' : 'text-ink-500'">
                    <template v-if="walletBalance === null">Đang xem số dư…</template>
                    <template v-else>Số dư <span class="font-num"><FhMoney :amount="walletBalance" /></span><template v-if="!walletCovers"> · không đủ</template></template>
                  </span>
                  <span v-else-if="method === 'vnpay'" class="block text-xs text-ink-500">ATM, thẻ quốc tế, QR</span>
                  <span v-else class="block text-xs text-ink-500">Trả trực tiếp cho kỹ thuật viên</span>
                </span>
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2" :class="payMethod === method ? 'border-brand-600' : 'border-ink-300'" aria-hidden="true"><span v-if="payMethod === method" class="h-2.5 w-2.5 rounded-full bg-brand-600"></span></span>
              </button>
            </div>
            <p v-if="payMethod === 'wallet' && walletBalance !== null && !walletCovers" class="text-ink-600">
              Ví chưa đủ tiền. <router-link to="/app/wallet" class="font-semibold text-brand-700 underline">Nạp thêm vào ví</router-link> hoặc chọn cách khác.
            </p>
            <p v-else-if="payMethod === 'cash'" class="text-ink-600">Đưa tiền cho kỹ thuật viên. Thợ báo số tiền của cả lượt, bạn xác nhận lại tại trang này.</p>
            <FhButton v-if="payMethod === 'wallet'" class="w-full" size="lg" :disabled="!walletCovers || busy" :loading="busy" data-testid="visit-pay-wallet" @click="payWithWallet">Trả bằng ví</FhButton>
            <FhButton v-else-if="payMethod === 'vnpay'" class="w-full" size="lg" :disabled="busy" :loading="busy" data-testid="visit-pay-vnpay" @click="payWithVnpay">Thanh toán qua VNPay</FhButton>
          </template>
        </template>
      </section>
    </template>

    <!-- Reschedule -->
    <div v-if="rescheduleOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="rescheduleOpen = false">
      <div class="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[var(--radius-lg)] bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="visit-reschedule-title">
        <div class="flex items-start justify-between gap-3">
          <h2 id="visit-reschedule-title" class="text-lg font-semibold text-ink-900">Đổi lịch cho cả lượt</h2>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100" aria-label="Đóng" @click="rescheduleOpen = false"><X :size="18" /></button>
        </div>
        <p class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">Mỗi lượt sửa chỉ đổi lịch được một lần, mọi thiết bị đổi cùng nhau.</p>
        <BookingSessionPicker v-model="chosenSession" :sessions="sessions" busy-hint="Thợ đã có lịch buổi này" />
        <FhButton class="w-full" size="lg" :disabled="!chosenSession || busy" :loading="busy" data-testid="visit-reschedule-save" @click="saveReschedule">Lưu lịch mới</FhButton>
      </div>
    </div>

    <!-- Cancel -->
    <div v-if="cancelOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="cancelOpen = false">
      <div class="w-full max-w-md space-y-4 rounded-[var(--radius-lg)] bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="visit-cancel-title">
        <h2 id="visit-cancel-title" class="text-lg font-semibold text-ink-900">Huỷ cả lượt sửa?</h2>
        <p class="text-sm text-ink-600 text-pretty">Mọi thiết bị trong lượt đều huỷ.<template v-if="held"> Thợ đã nhận lượt này nên bạn bị trừ điểm uy tín như huỷ một đơn đã có thợ.</template></p>
        <div class="flex justify-end gap-2.5">
          <FhButton variant="secondary" size="md" :disabled="busy" @click="cancelOpen = false">Không</FhButton>
          <FhButton variant="danger" size="md" :loading="busy" data-testid="visit-cancel-confirm" @click="confirmCancel">Huỷ lượt sửa</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
