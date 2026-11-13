<script setup lang="ts">
// TECH 42 (PO 13/11/2026): the technician's own note on this order, saved on the server so web
// and mobile show the same text. Customers and managers never see it.
import { onMounted, ref, watch } from 'vue';
import apiClient from '../../api/client';
import { FhButton } from '..';
import { consoleTextarea } from '../console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{ orderId: string }>();
const note = ref('');
const saved = ref('');
const loading = ref(true);
const saving = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);
let ticket = 0;

async function load() {
  const current = ++ticket;
  loading.value = true;
  message.value = null;
  try {
    const res = await apiClient.get<{ data?: { note?: string } }>(`/service-orders/${props.orderId}/my-note`);
    if (current !== ticket) return;
    note.value = saved.value = res.data?.data?.note ?? '';
  } catch (reason) {
    if (current === ticket) message.value = { ok: false, text: userFacingError(reason, 'Chưa tải được ghi chú.') };
  } finally {
    if (current === ticket) loading.value = false;
  }
}

async function save() {
  if (saving.value) return;
  const text = note.value.trim();
  if (text.length > 2000) { message.value = { ok: false, text: 'Ghi chú tối đa 2.000 ký tự.' }; return; }
  saving.value = true;
  message.value = null;
  try {
    const res = await apiClient.put<{ data?: { note?: string } }>(`/service-orders/${props.orderId}/my-note`, { note: text });
    note.value = saved.value = res.data?.data?.note ?? text;
    message.value = { ok: true, text: text ? 'Đã lưu ghi chú.' : 'Đã xoá ghi chú.' };
  } catch (reason) {
    message.value = { ok: false, text: userFacingError(reason, 'Chưa lưu được ghi chú. Vui lòng thử lại.') };
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(() => props.orderId, () => { void load(); });
</script>

<template>
  <section class="space-y-3 rounded-2xl border border-ink-200/90 bg-white p-5 text-sm shadow-2xs" data-testid="tech-private-note">
    <div class="space-y-0.5">
      <h2 class="text-base font-semibold text-ink-900">Ghi chú riêng</h2>
      <p class="text-xs text-ink-500">Chỉ bạn thấy, đồng bộ với ứng dụng điện thoại.</p>
    </div>
    <textarea
      v-model="note"
      rows="3"
      maxlength="2000"
      placeholder="Thêm ghi chú riêng cho đơn này…"
      :disabled="loading"
      :class="consoleTextarea"
      aria-label="Ghi chú riêng của bạn"
    />
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-ink-500 font-num">{{ note.length }}/2.000</span>
      <FhButton variant="secondary" size="sm" :loading="saving" :disabled="loading || saving || note.trim() === saved" @click="save">Lưu ghi chú</FhButton>
    </div>
    <p v-if="message" :class="message.ok ? 'text-success-700' : 'text-danger-600'" class="text-xs" :role="message.ok ? 'status' : 'alert'">{{ message.text }}</p>
  </section>
</template>
