<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { FhButton, FhCard, FhSkeleton } from '..';
import { CONSOLE_LOAD_ERROR, consoleTextarea } from './console-ui';
import { bookingsApi, type TechnicianCandidate } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import {
  supportCasesApi,
  type InterruptionAction,
  type ReplacementOptions,
  type ResolveInterruptionPayload,
  type SupportCaseDetail,
} from '../../api/support-cases.api';

const props = defineProps<{ supportCase: SupportCaseDetail }>();
const emit = defineEmits<{ (e: 'done', message: string): void }>();

const candidates = ref<TechnicianCandidate[]>([]);
const options = ref<ReplacementOptions | null>(null);
const loading = ref(true);
const candidateError = ref(false);
const loadError = ref(false);
const chosen = ref('');
const reason = ref('');
const busy = ref(false);
const error = ref('');
const pendingAction = ref<InterruptionAction | null>(null);
const pendingCommand = ref<ResolveInterruptionPayload | null>(null);
const needsPreflight = ref(false);
const confirmOpen = ref(false);
let loadGeneration = 0;

const direct = computed(() => options.value?.actions.DIRECT_REASSIGN_SOLO);
const closeForRebook = computed(() => options.value?.actions.CLOSE_FOR_REBOOK);
const reject = computed(() => options.value?.actions.REJECT_REQUEST);
const reasonMessages: Record<string, string> = {
  CASE_NOT_ACTIVE: 'Yêu cầu đã được xử lý.',
  ORDER_NOT_UNDER_REPAIR: 'Đơn không còn ở trạng thái đang sửa.',
  COMPLETION_REQUESTED: 'Đơn đã yêu cầu hoàn tất.',
  INVOICE_EXISTS: 'Đã có hóa đơn cho đơn này.',
  PAYMENT_EXPOSURE: 'Đơn có trạng thái thanh toán cần được kiểm tra.',
  VOUCHER_EXPOSURE: 'Đơn có ưu đãi đang được giữ hoặc sử dụng.',
  PARTS_CUSTODY_REVIEW: 'Linh kiện còn nghĩa vụ cần được xử lý.',
  VISIT_GROUP_CHILD: 'Không thể chuyển riêng thợ cho một thiết bị trong lượt.',
  APPROVED_QUOTE: 'Báo giá đã được khách duyệt; không thể chuyển sang thợ mới.',
};
const explainReasons = (reasons: string[]) => reasons.map(code => reasonMessages[code] ?? 'Cần tải lại điều kiện xử lý từ máy chủ.');

async function bookingIdOf(): Promise<string> {
  const directId = props.supportCase.bookingId || props.supportCase.booking?.id;
  if (directId) return directId;
  if (!props.supportCase.serviceOrderId) return '';
  return (await ordersApi.getOrder(props.supportCase.serviceOrderId)).bookingId ?? '';
}

async function load() {
  const request = ++loadGeneration;
  loading.value = true;
  loadError.value = false;
  candidateError.value = false;
  error.value = '';
  options.value = null;
  candidates.value = [];
  chosen.value = '';
  try {
    const result = await supportCasesApi.replacementOptions(props.supportCase.id);
    if (request !== loadGeneration || result.caseId !== props.supportCase.id
      || result.serviceOrderId !== props.supportCase.serviceOrderId) return;
    options.value = result;
    if (result.actions.DIRECT_REASSIGN_SOLO.allowed) {
      try {
        const bookingId = await bookingIdOf();
        if (!bookingId) throw new Error('Booking unavailable');
        const list = await bookingsApi.getCandidates(bookingId);
        if (request !== loadGeneration) return;
        candidates.value = list.filter(candidate => candidate.id !== props.supportCase.technicianId);
        if (pendingCommand.value?.action === 'DIRECT_REASSIGN_SOLO' && candidates.value.some(candidate => candidate.id === pendingCommand.value?.technicianId)) {
          chosen.value = pendingCommand.value.technicianId!;
        }
      } catch {
        if (request === loadGeneration) candidateError.value = true;
      }
    }
    if (needsPreflight.value && result.caseVersion !== pendingCommand.value?.expectedCaseVersion) {
      pendingCommand.value = null;
      pendingAction.value = null;
      needsPreflight.value = false;
    }
  } catch {
    if (request === loadGeneration) loadError.value = true;
  } finally {
    if (request === loadGeneration) loading.value = false;
  }
}

function confirm(action: InterruptionAction) {
  if (busy.value) return;
  error.value = '';
  if (pendingCommand.value) {
    error.value = 'Đang có lệnh chưa xác nhận. Hãy thử lại đúng lệnh hoặc tải lại trạng thái trước.';
    return;
  }
  if (!options.value?.actions[action].allowed) return;
  const text = reason.value.trim();
  if (text.length < 10 || text.length > 2000) {
    error.value = text.length > 2000 ? 'Lý do không được vượt quá 2.000 ký tự.' : 'Ghi lý do, tối thiểu 10 ký tự.';
    return;
  }
  if (action === 'DIRECT_REASSIGN_SOLO' && (!chosen.value || !candidates.value.some(candidate => candidate.id === chosen.value))) {
    error.value = 'Chọn kỹ thuật viên đủ điều kiện theo danh sách máy chủ.';
    return;
  }
  pendingAction.value = action;
  confirmOpen.value = true;
}

const confirmationText = computed(() => {
  switch (pendingAction.value) {
    case 'DIRECT_REASSIGN_SOLO': return 'Thợ hiện tại sẽ rời đơn. Đơn trở về trạng thái chờ thợ mới; thợ mới cần check-in và thực hiện báo giá riêng. Không chuyển báo giá, thanh toán, ưu đãi hoặc linh kiện.';
    case 'CLOSE_FOR_REBOOK': return 'Đơn cũ sẽ kết thúc theo kết quả gián đoạn. Không chuyển báo giá, thanh toán, ưu đãi hoặc linh kiện sang đơn mới; khách cần chọn lịch và xác nhận giá mới.';
    case 'REJECT_REQUEST': return 'Yêu cầu sẽ bị từ chối. Đơn vẫn giữ nguyên với kỹ thuật viên hiện tại và được bỏ giữ hoàn tất.';
    default: return '';
  }
});

async function runCommand() {
  const action = pendingAction.value;
  if (busy.value || !action || !options.value) return;
  const text = reason.value.trim();
  if (!pendingCommand.value) {
    const commandId = globalThis.crypto?.randomUUID?.();
    if (!commandId) {
      error.value = 'Không thể tạo mã an toàn cho lệnh này. Vui lòng tải lại trang.';
      return;
    }
    pendingCommand.value = {
      commandId,
      expectedCaseVersion: options.value.caseVersion,
      action,
      reason: text,
      ...(action === 'DIRECT_REASSIGN_SOLO' ? { technicianId: chosen.value } : {}),
    };
  }
  busy.value = true;
  error.value = '';
  try {
    const result = await supportCasesApi.resolveInterruption(props.supportCase.id, pendingCommand.value);
    if (result.case.id !== props.supportCase.id || result.order.id !== options.value.serviceOrderId) {
      throw new Error('Backend returned a result for another case or order.');
    }
    const technicianName = candidates.value.find(candidate => candidate.id === pendingCommand.value?.technicianId)?.fullName;
    const message = action === 'DIRECT_REASSIGN_SOLO'
      ? `Kết quả đã được cập nhật: đơn chuyển sang ${result.order.status}; ${technicianName ?? 'thợ mới'} cần check-in.`
      : action === 'CLOSE_FOR_REBOOK'
        ? `Kết quả đã được cập nhật: đơn chuyển sang ${result.order.status}; khách cần xác nhận lịch và giá mới.`
        : `Kết quả đã được cập nhật: yêu cầu ${result.case.status === 'rejected' ? 'bị từ chối' : 'đã xử lý'}, đơn giữ trạng thái ${result.order.status}.`;
    pendingCommand.value = null;
    pendingAction.value = null;
    confirmOpen.value = false;
    needsPreflight.value = false;
    emit('done', message);
  } catch (reasonValue) {
    const status = reasonValue && typeof reasonValue === 'object' && 'response' in reasonValue
      ? (reasonValue as { response?: { status?: number } }).response?.status : undefined;
    if (status === 409) {
      needsPreflight.value = true;
      error.value = 'Trạng thái yêu cầu đã thay đổi. Tải lại điều kiện xử lý trước khi tiếp tục.';
    } else {
      error.value = 'Chưa xác nhận được kết quả. Có thể thử lại đúng lệnh an toàn; không tạo lệnh mới.';
    }
  } finally {
    busy.value = false;
  }
}

function retryCommand() {
  if (!pendingCommand.value || busy.value) return;
  pendingAction.value = pendingCommand.value.action;
  void runCommand();
}

function cancelConfirmation() {
  if (busy.value || pendingCommand.value) return;
  confirmOpen.value = false;
  pendingAction.value = null;
}

watch(() => props.supportCase.id, () => {
  pendingCommand.value = null;
  pendingAction.value = null;
  needsPreflight.value = false;
  void load();
});
onMounted(load);
</script>

<template>
  <FhCard title="Đổi thợ hoặc xử lý yêu cầu" data-testid="replacement-panel">
    <p class="mb-4 text-sm text-ink-600 text-pretty">Mỗi quyết định được máy chủ kiểm tra và ghi nhận cùng với trạng thái đơn. Tiền, ưu đãi, báo giá và linh kiện không được chuyển sang thợ khác.</p>
    <FhSkeleton v-if="loading" height="40px" :count="3" />
    <div v-else-if="loadError" class="text-sm text-ink-700" role="alert">{{ CONSOLE_LOAD_ERROR }} <button type="button" class="ml-1 font-medium text-brand-700 hover:underline" @click="load">Thử lại</button></div>
    <template v-else-if="options">
      <div class="mb-4 grid gap-2 rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700 sm:grid-cols-2" data-testid="replacement-preflight-flags">
        <p>Báo giá đã duyệt: <strong>{{ options.flags.approvedQuote ? 'Có' : 'Không' }}</strong></p>
        <p>Hóa đơn: <strong>{{ options.flags.invoice ? 'Có' : 'Không' }}</strong></p>
        <p>Thanh toán: <strong>{{ options.flags.payment ? 'Cần kiểm tra' : 'Chưa ghi nhận' }}</strong></p>
        <p>Ưu đãi: <strong>{{ options.flags.voucher ? 'Có liên quan' : 'Không' }}</strong></p>
        <p>Linh kiện: <strong>{{ options.flags.parts ? 'Còn nghĩa vụ' : 'Không' }}</strong></p>
        <p>Thiết bị chưa xong trong lượt: <strong>{{ options.flags.incompleteSiblings ? 'Có' : 'Không' }}</strong></p>
      </div>

      <div v-if="direct?.allowed" class="space-y-2">
        <p class="text-sm font-semibold text-ink-900">Có thể đổi thợ trực tiếp</p>
        <p v-if="candidateError" class="text-sm text-danger-700" role="alert">{{ CONSOLE_LOAD_ERROR }} <button type="button" class="ml-1 font-medium text-brand-700 hover:underline" @click="load">Thử lại</button></p>
        <p v-else-if="candidates.length === 0" class="text-sm text-ink-600">Chưa có thợ khác đủ điều kiện theo dữ liệu hiện tại.</p>
        <div v-else class="max-h-64 space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Thợ nhận đơn">
          <label v-for="candidate in candidates" :key="candidate.id" class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm" :class="chosen === candidate.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'" :data-testid="`replacement-candidate-${candidate.id}`">
            <span class="flex min-w-0 items-center gap-2"><input v-model="chosen" type="radio" :value="candidate.id" /><span class="truncate font-semibold text-ink-900">{{ candidate.fullName }}</span></span>
            <span class="shrink-0 whitespace-nowrap text-xs text-ink-500"><template v-if="typeof candidate.distanceKm === 'number'">{{ candidate.distanceKm.toFixed(1) }}&nbsp;km</template><template v-if="typeof candidate.completedOrdersCount === 'number'"> · {{ candidate.completedOrdersCount }} đơn đã làm</template></span>
          </label>
        </div>
      </div>
      <div v-else class="space-y-1 text-sm text-warning-800" data-testid="replacement-direct-blocked">
        <p class="font-semibold">Chưa thể đổi thợ trực tiếp</p>
        <ul class="list-inside list-disc"><li v-for="message in explainReasons(direct?.reasons ?? [])" :key="message">{{ message }}</li></ul>
      </div>

      <div v-if="!closeForRebook?.allowed" class="mt-3 space-y-1 text-sm text-ink-600" data-testid="replacement-close-blocked">
        <p class="font-medium">Chưa thể kết thúc đơn để đặt lại</p>
        <ul class="list-inside list-disc"><li v-for="message in explainReasons(closeForRebook?.reasons ?? [])" :key="message">{{ message }}</li></ul>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <FhButton v-if="direct?.allowed && candidates.length" size="md" :disabled="busy || !!pendingCommand" data-testid="replacement-action-DIRECT_REASSIGN_SOLO" @click="confirm('DIRECT_REASSIGN_SOLO')">Đổi thợ trực tiếp</FhButton>
        <FhButton v-if="closeForRebook?.allowed" variant="secondary" size="md" :disabled="busy || !!pendingCommand" data-testid="replacement-action-CLOSE_FOR_REBOOK" @click="confirm('CLOSE_FOR_REBOOK')">Kết thúc đơn để khách đặt lại</FhButton>
        <FhButton v-if="reject?.allowed" variant="secondary" size="md" :disabled="busy || !!pendingCommand" data-testid="replacement-action-REJECT_REQUEST" @click="confirm('REJECT_REQUEST')">Từ chối yêu cầu</FhButton>
        <FhButton variant="ghost" size="md" :disabled="busy" data-testid="replacement-options-retry" @click="load">Tải lại điều kiện</FhButton>
      </div>

      <label class="mt-4 flex flex-col gap-1.5 text-sm font-medium text-ink-700">Lý do xử lý (10–2.000 ký tự)
        <textarea v-model="reason" rows="3" maxlength="2000" :class="consoleTextarea" data-testid="replacement-reason" />
      </label>
      <p v-if="error" class="mt-2 text-sm text-danger-700" role="alert">{{ error }}</p>
      <FhButton v-if="pendingCommand && !needsPreflight" variant="secondary" size="md" :loading="busy" :disabled="busy" data-testid="replacement-command-retry" @click="retryCommand">Thử lại đúng lệnh</FhButton>
      <FhButton v-if="needsPreflight" variant="secondary" size="md" :disabled="busy" data-testid="replacement-command-refresh" @click="load">Tải lại trạng thái</FhButton>
    </template>

    <div v-if="confirmOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="cancelConfirmation">
      <section class="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="replacement-confirm-title" data-testid="replacement-confirm-dialog">
        <h2 id="replacement-confirm-title" class="text-lg font-semibold text-ink-900">Xác nhận xử lý yêu cầu</h2>
        <p class="text-sm text-ink-700">{{ confirmationText }}</p>
        <p class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">Điều kiện được kiểm tra lại khi gửi. Nếu có thay đổi, máy chủ từ chối và yêu cầu tải lại trạng thái.</p>
        <div class="flex justify-end gap-2"><FhButton variant="ghost" size="md" :disabled="busy || !!pendingCommand" @click="cancelConfirmation">Quay lại</FhButton><FhButton size="md" :loading="busy" :disabled="busy" data-testid="replacement-confirm" @click="runCommand">Xác nhận</FhButton></div>
      </section>
    </div>
  </FhCard>
</template>
