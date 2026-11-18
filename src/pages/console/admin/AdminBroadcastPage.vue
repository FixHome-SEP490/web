<script setup lang="ts">
// BUG 176: one notification to every active account of the chosen group.
import { computed, ref } from 'vue';
import { FhButton } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import { consoleField, consoleLabel } from '../../../components/console/console-ui';
import { adminControlsApi, type BroadcastAudience } from '../../../api/admin-controls.api';
import { userFacingError } from '../../../utils/user-facing-error';

const AUDIENCES: Array<{ value: BroadcastAudience; label: string }> = [
  { value: 'all', label: 'Mọi người dùng (khách, kỹ thuật viên, quản lý dịch vụ)' },
  { value: 'customer', label: 'Khách hàng' },
  { value: 'technician', label: 'Kỹ thuật viên' },
  { value: 'service_manager', label: 'Quản lý dịch vụ' },
];
const TITLE_MAX = 200;
const MESSAGE_MAX = 2000;

const title = ref('');
const body = ref('');
const audience = ref<BroadcastAudience>('all');
const confirming = ref(false);
const sending = ref(false);
const result = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

const audienceLabel = computed(() => AUDIENCES.find((a) => a.value === audience.value)?.label ?? '');
const canSend = computed(() => title.value.trim().length > 0 && body.value.trim().length > 0 && title.value.length <= TITLE_MAX && body.value.length <= MESSAGE_MAX);

async function send() {
  if (!canSend.value || sending.value) return;
  sending.value = true;
  result.value = null;
  try {
    const recipients = await adminControlsApi.broadcast({ title: title.value.trim(), message: body.value.trim(), audience: audience.value });
    result.value = { tone: 'success', text: `Đã gửi tới ${recipients.toLocaleString('vi-VN')} người dùng.` };
    title.value = '';
    body.value = '';
  } catch (reason) {
    result.value = { tone: 'error', text: userFacingError(reason, 'Chưa gửi được, vui lòng thử lại.') };
  } finally {
    sending.value = false;
    confirming.value = false;
  }
}
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Gửi thông báo toàn hệ thống" />
    <p v-if="result" :role="result.tone === 'error' ? 'alert' : 'status'" data-testid="broadcast-result" class="rounded-[var(--radius-sm)] border px-4 py-3 text-sm" :class="result.tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'">{{ result.text }}</p>
    <form class="space-y-4 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1)" @submit.prevent="confirming = true">
      <label :class="consoleLabel">Gửi tới
        <select v-model="audience" :class="[consoleField, 'w-full']" data-testid="broadcast-audience">
          <option v-for="a in AUDIENCES" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </label>
      <label :class="consoleLabel">Tiêu đề
        <input v-model="title" :maxlength="TITLE_MAX" required :class="[consoleField, 'w-full']" data-testid="broadcast-title" placeholder="Ví dụ: Bảo trì hệ thống tối nay" />
        <span class="text-xs font-normal text-ink-500">{{ title.length }}/{{ TITLE_MAX }}</span>
      </label>
      <label :class="consoleLabel">Nội dung
        <textarea v-model="body" :maxlength="MESSAGE_MAX" required rows="5" :class="[consoleField, 'w-full h-auto py-2']" data-testid="broadcast-message" />
        <span class="text-xs font-normal text-ink-500">{{ body.length }}/{{ MESSAGE_MAX }}</span>
      </label>
      <div v-if="!confirming" class="flex justify-end">
        <FhButton type="submit" size="sm" :disabled="!canSend" data-testid="broadcast-submit">Gửi thông báo</FhButton>
      </div>
      <div v-else class="flex flex-wrap items-center justify-end gap-2 rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 px-3 py-2">
        <span class="mr-auto text-sm text-warning-800">Gửi tới: {{ audienceLabel }}. Thông báo không thu hồi được.</span>
        <FhButton type="button" variant="secondary" size="sm" :disabled="sending" @click="confirming = false">Huỷ</FhButton>
        <FhButton type="button" size="sm" :loading="sending" data-testid="broadcast-confirm" @click="send">Xác nhận gửi</FhButton>
      </div>
    </form>
  </div>
</template>
