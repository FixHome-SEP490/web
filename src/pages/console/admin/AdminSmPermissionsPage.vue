<script setup lang="ts">
// BUG 177: the admin decides what a service manager may do. Each switch adds or removes
// one permission of the service manager role; the change applies to every SM within a minute.
// BUG 261: the admin may also pick one service manager account and set its permissions
// over the role. An account without its own setting follows the role; "Về mặc định theo
// vai trò" drops the account setting.
import { computed, onMounted, ref } from 'vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import { CONSOLE_LOAD_ERROR } from '../../../components/console/console-ui';
import {
  adminControlsApi,
  type SmAccount,
  type SmAccountPermission,
  type SmPermission,
} from '../../../api/admin-controls.api';
import { userFacingError } from '../../../utils/user-facing-error';

type Row = SmPermission & Partial<Pick<SmAccountPermission, 'roleGranted' | 'overridden'>>;

const rows = ref<Row[]>([]);
const accounts = ref<SmAccount[]>([]);
/** '' = the whole role; otherwise one service manager account id. */
const target = ref('');
const loading = ref(true);
const error = ref('');
const savingCode = ref<string | null>(null);
const resetting = ref(false);
const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

const account = computed(() => accounts.value.find((a) => a.id === target.value) ?? null);
const groups = computed(() => {
  const map = new Map<string, Row[]>();
  for (const row of rows.value) {
    if (!map.has(row.group)) map.set(row.group, []);
    map.get(row.group)!.push(row);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
});
const grantedCount = computed(() => rows.value.filter((r) => r.granted).length);

function applyAccount(user: SmAccount, permissions: SmAccountPermission[]) {
  rows.value = permissions;
  accounts.value = accounts.value.map((a) => (a.id === user.id ? { ...a, customized: user.customized } : a));
}

async function loadRows() {
  if (!target.value) {
    rows.value = await adminControlsApi.listSmPermissions();
    return;
  }
  const result = await adminControlsApi.getSmAccountPermissions(target.value);
  applyAccount(result.user, result.permissions);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [list] = await Promise.all([adminControlsApi.listSmAccounts(), loadRows()]);
    accounts.value = list;
  } catch (reason) {
    error.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

async function changeTarget() {
  message.value = null;
  loading.value = true;
  error.value = '';
  try {
    await loadRows();
  } catch (reason) {
    error.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

async function toggle(row: Row) {
  if (savingCode.value || resetting.value) return;
  savingCode.value = row.code;
  message.value = null;
  const next = !row.granted;
  try {
    if (target.value) {
      const result = await adminControlsApi.setSmAccountPermission(target.value, row.code, next);
      applyAccount(result.user, result.permissions);
    } else {
      rows.value = await adminControlsApi.setSmPermission(row.code, next);
    }
    const who = account.value ? ` cho ${account.value.fullName}` : '';
    message.value = { tone: 'success', text: `${next ? 'Đã cho phép' : 'Đã tắt'}${who}: ${row.label}.` };
  } catch (reason) {
    message.value = { tone: 'error', text: userFacingError(reason, 'Chưa lưu được, vui lòng thử lại.') };
  } finally {
    savingCode.value = null;
  }
}

async function resetAccount() {
  if (!target.value || resetting.value || savingCode.value) return;
  resetting.value = true;
  message.value = null;
  try {
    const result = await adminControlsApi.resetSmAccountPermissions(target.value);
    applyAccount(result.user, result.permissions);
    message.value = { tone: 'success', text: `${result.user.fullName} đã về quyền mặc định theo vai trò.` };
  } catch (reason) {
    message.value = { tone: 'error', text: userFacingError(reason, 'Chưa lưu được, vui lòng thử lại.') };
  } finally {
    resetting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Phân quyền quản lý dịch vụ" :count="loading || error ? null : grantedCount" />
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink-700 sm:max-w-md">
        Áp dụng cho
        <select
          v-model="target"
          data-testid="sm-perm-target"
          class="rounded-[var(--radius-sm)] border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900"
          :disabled="savingCode !== null || resetting"
          @change="changeTarget"
        >
          <option value="">Tất cả quản lý dịch vụ (theo vai trò)</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.fullName }} · {{ a.email }}{{ a.customized ? ' · đặt riêng' : '' }}</option>
        </select>
      </label>
      <button
        v-if="account"
        type="button"
        data-testid="sm-perm-reset"
        class="rounded-[var(--radius-sm)] border border-ink-300 bg-white px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!account.customized || resetting || savingCode !== null"
        @click="resetAccount"
      >
        Về mặc định theo vai trò
      </button>
    </div>
    <p v-if="account" class="text-sm text-ink-600">
      Chỉ áp dụng cho tài khoản {{ account.fullName }}. Quyền chưa đặt riêng thì theo vai trò. Tài khoản thấy thay đổi ở lần tải trang kế tiếp.
    </p>
    <p v-else class="text-sm text-ink-600">Bật hoặc tắt việc quản lý dịch vụ được làm. Thay đổi áp dụng cho mọi tài khoản chưa đặt riêng trong khoảng một phút.</p>
    <p v-if="message" :role="message.tone === 'error' ? 'alert' : 'status'" class="rounded-[var(--radius-sm)] border px-4 py-3 text-sm" :class="message.tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'">{{ message.text }}</p>
    <ConsoleLoadError v-if="error" :message="error" @retry="load" />
    <p v-else-if="loading" class="text-sm text-ink-500" role="status">Đang tải…</p>
    <section v-for="g in groups" v-else :key="g.group" class="rounded-[var(--radius-md)] border border-ink-200/90 bg-white shadow-(--shadow-e1)">
      <h2 class="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-900">{{ g.group }}</h2>
      <ul class="divide-y divide-ink-100">
        <li v-for="row in g.items" :key="row.code" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="min-w-0 text-sm text-ink-800">
            {{ row.label }}
            <span v-if="account && row.overridden" class="ml-2 text-xs text-warning-700" :data-testid="`sm-perm-own-${row.code}`">Đặt riêng, vai trò {{ row.roleGranted ? 'đang bật' : 'đang tắt' }}</span>
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="row.granted"
            :aria-label="row.label"
            :data-testid="`sm-perm-${row.code}`"
            :disabled="savingCode !== null || resetting"
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
