<script setup lang="ts">
// BUG 177: the admin decides what a service manager may do. Each switch adds or removes
// one permission of the service manager role; the change applies to every SM within a minute.
import { computed, onMounted, ref } from 'vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import { CONSOLE_LOAD_ERROR } from '../../../components/console/console-ui';
import { adminControlsApi, type SmPermission } from '../../../api/admin-controls.api';
import { userFacingError } from '../../../utils/user-facing-error';

const rows = ref<SmPermission[]>([]);
const loading = ref(true);
const error = ref('');
const savingCode = ref<string | null>(null);
const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

const groups = computed(() => {
  const map = new Map<string, SmPermission[]>();
  for (const row of rows.value) {
    if (!map.has(row.group)) map.set(row.group, []);
    map.get(row.group)!.push(row);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
});
const grantedCount = computed(() => rows.value.filter((r) => r.granted).length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await adminControlsApi.listSmPermissions();
  } catch (reason) {
    error.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

async function toggle(row: SmPermission) {
  if (savingCode.value) return;
  savingCode.value = row.code;
  message.value = null;
  const next = !row.granted;
  try {
    rows.value = await adminControlsApi.setSmPermission(row.code, next);
    message.value = { tone: 'success', text: `${next ? 'Đã cho phép' : 'Đã tắt'}: ${row.label}.` };
  } catch (reason) {
    message.value = { tone: 'error', text: userFacingError(reason, 'Chưa lưu được, vui lòng thử lại.') };
  } finally {
    savingCode.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Phân quyền quản lý dịch vụ" :count="loading || error ? null : grantedCount" />
    <p class="text-sm text-ink-600">Bật hoặc tắt việc quản lý dịch vụ được làm. Thay đổi áp dụng cho mọi tài khoản quản lý dịch vụ trong khoảng một phút.</p>
    <p v-if="message" :role="message.tone === 'error' ? 'alert' : 'status'" class="rounded-[var(--radius-sm)] border px-4 py-3 text-sm" :class="message.tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'">{{ message.text }}</p>
    <ConsoleLoadError v-if="error" :message="error" @retry="load" />
    <p v-else-if="loading" class="text-sm text-ink-500" role="status">Đang tải…</p>
    <section v-for="g in groups" v-else :key="g.group" class="rounded-[var(--radius-md)] border border-ink-200/90 bg-white shadow-(--shadow-e1)">
      <h2 class="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-900">{{ g.group }}</h2>
      <ul class="divide-y divide-ink-100">
        <li v-for="row in g.items" :key="row.code" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="text-sm text-ink-800">{{ row.label }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="row.granted"
            :aria-label="row.label"
            :data-testid="`sm-perm-${row.code}`"
            :disabled="savingCode !== null"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-60"
            :class="row.granted ? 'bg-brand-600' : 'bg-ink-300'"
            @click="toggle(row)"
          >
            <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="row.granted ? 'translate-x-5' : 'translate-x-0.5'" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
