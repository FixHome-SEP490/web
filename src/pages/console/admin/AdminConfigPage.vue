<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { FhButton } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../../components/console/ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel } from '../../../components/console/console-ui';
import {
  adminConfigApi,
  type AdminConfigItem,
  type ConfigEffectStatus,
  type ConfigValueType,
} from '../../../api/admin-config.api';
import { userFacingError } from '../../../utils/user-facing-error';

interface ConfigDefinition {
  key: string;
  description: string;
  valueType: ConfigValueType;
  effectStatus: ConfigEffectStatus;
  consumerEvidence?: string | null;
  min?: number;
  max?: number;
  enumValues?: string[];
}

interface ConfigRow extends ConfigDefinition {
  value: string | null;
  updatedAt: string;
  available: boolean;
}

const configDefinitions: ConfigDefinition[] = [
  { key: 'matching.max_shortlist', valueType: 'int', effectStatus: 'NOT_IMPLEMENTED', min: 1, max: 2, description: 'Số kỹ thuật viên khách được chọn (cố định 1 đến 2, chỉ để tham khảo).' },
  { key: 'matching.mode', valueType: 'enum', effectStatus: 'STALE_REVIEW', enumValues: ['SEQUENTIAL'], description: 'Cách mời kỹ thuật viên.' },
  { key: 'matching.invitation_ttl_minutes', valueType: 'int', effectStatus: 'ACTIVE', min: 5, max: 1440, description: 'Thời gian lời mời còn hiệu lực (phút).' },
  { key: 'geofence.radius_meters', valueType: 'int', effectStatus: 'TO_WIRE', min: 10, max: 5000, description: 'Bán kính xác nhận đã đến nơi (mét).' },
  { key: 'geofence.min_gps_accuracy_meters', valueType: 'int', effectStatus: 'ACTIVE', min: 5, max: 500, description: 'Sai số GPS tối đa khi xác nhận đến nơi (mét).' },
  { key: 'evidence.before.min_count', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 10, description: 'Số ảnh trước sửa chữa tối thiểu.' },
  { key: 'evidence.after.min_count', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 10, description: 'Số ảnh sau sửa chữa tối thiểu.' },
  { key: 'evidence.max_file_mb', valueType: 'int', effectStatus: 'TO_WIRE', min: 1, max: 50, description: 'Dung lượng tối đa mỗi ảnh bằng chứng (MB).' },
  { key: 'strike.window.days', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 365, description: 'Số ngày một lần vi phạm còn được tính.' },
  { key: 'strike.customer.threshold', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 20, description: 'Số lần vi phạm của khách trước khi bị tạm khoá.' },
  { key: 'strike.technician.threshold', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 20, description: 'Số lần vi phạm của kỹ thuật viên trước khi bị tạm khoá.' },
  { key: 'customer.suspension.hours', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 8760, description: 'Thời gian tạm khoá khách (giờ).' },
  { key: 'technician.suspension.hours', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 8760, description: 'Thời gian tạm khoá kỹ thuật viên (giờ).' },
  { key: 'cancel.grace_minutes_after_accept', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 120, description: 'Số phút sau khi thợ nhận đơn mà huỷ vẫn không bị tính vi phạm.' },
  { key: 'order.departure_grace_minutes', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 240, description: 'Số phút sau giờ hẹn mà kỹ thuật viên chưa xuất phát thì gửi cảnh báo.' },
  { key: 'order.departure_cancel_minutes', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 240, description: 'Số phút sau cảnh báo mà kỹ thuật viên vẫn chưa xuất phát thì tự huỷ đơn.' },
  { key: 'compensation.arrival.amount', valueType: 'bigint', effectStatus: 'STALE_REVIEW', min: 0, max: 0, description: 'Tiền bù khi thợ đã đến nơi (không còn dùng).' },
  { key: 'commission.base', valueType: 'enum', effectStatus: 'TO_WIRE', enumValues: ['LABOR'], description: 'Hoa hồng tính trên phần nào của đơn (chỉ tiền công).' },
  { key: 'commission.rate_bps', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 5000, description: 'Tỷ lệ hoa hồng, tính theo phần vạn (1000 = 10%).' },
  { key: 'additional_cost.approval_ttl_minutes', valueType: 'int', effectStatus: 'STALE_REVIEW', min: 5, max: 1440, description: 'Thời gian chờ khách duyệt chi phí phát sinh (phút).' },
  { key: 'warranty.default_days', valueType: 'int', effectStatus: 'TO_WIRE', min: 0, max: 3650, description: 'Thời hạn bảo hành mặc định (ngày).' },
  { key: 'warranty.max_days', valueType: 'int', effectStatus: 'TO_WIRE', min: 0, max: 3650, description: 'Thời hạn bảo hành tối đa (ngày).' },
  { key: 'ai.provider', valueType: 'enum', effectStatus: 'TO_WIRE', enumValues: ['stub', 'fixhome'], description: 'Nguồn chẩn đoán AI đang dùng.' },
  { key: 'ai.timeout_ms', valueType: 'int', effectStatus: 'TO_WIRE', min: 1000, max: 60000, description: 'Thời gian chờ AI trả lời tối đa (mili giây).' },
  { key: 'ai.rate_limit_per_user_per_hour', valueType: 'int', effectStatus: 'TO_WIRE', min: 1, max: 1000, description: 'Số lần hỏi AI tối đa của mỗi người trong một giờ.' },
  { key: 'payment.mode', valueType: 'enum', effectStatus: 'NOT_IMPLEMENTED', enumValues: ['DEMO', 'LIVE'], description: 'Chế độ thanh toán.' },
];

const columns: ConsoleColumn[] = [
  { key: 'description', label: 'Tham số' },
  { key: 'value', label: 'Giá trị', align: 'right' },
  { key: 'effectStatus', label: 'Hiệu lực', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];

const STATUS_LABELS: Record<ConfigEffectStatus, string> = {
  ACTIVE: 'Đang áp dụng',
  TO_WIRE: 'Chưa nối vào hệ thống',
  NOT_IMPLEMENTED: 'Chưa dùng',
  STALE_REVIEW: 'Cần xem lại',
};
// Words for the enum values a parameter can take.
const VALUE_LABELS: Record<string, string> = {
  SEQUENTIAL: 'Mời lần lượt',
  SIMULTANEOUS: 'Mời cùng lúc',
  LABOR: 'Tiền công',
  stub: 'Không gọi AI',
  fixhome: 'AI của FixHome',
  DEMO: 'Thử nghiệm',
  LIVE: 'Thật',
  true: 'Bật',
  false: 'Tắt',
};
const valueLabel = (value: string) => VALUE_LABELS[value] ?? value;

const searchQuery = ref('');
const statusFilter = ref<ConfigEffectStatus | ''>('');
const loadFailed = ref(false);
const remoteConfigs = ref<AdminConfigItem[]>([]);
const loading = ref(true);
const error = ref('');
const successMessage = ref('');

const configRows = computed<ConfigRow[]>(() => {
  const remoteByKey = new Map(remoteConfigs.value.map((config) => [config.key, config]));
  const knownKeys = new Set(configDefinitions.map((definition) => definition.key));
  const knownRows = configDefinitions.map((definition) => {
    const remote = remoteByKey.get(definition.key);
    return {
      ...definition,
      ...(remote ?? {}),
      value: remote?.value ?? null,
      // The Vietnamese wording here wins over the server's internal description.
      description: definition.description || remote?.description || '',
      effectStatus: remote?.effectStatus ?? definition.effectStatus,
      consumerEvidence: remote?.consumerEvidence ?? definition.consumerEvidence ?? null,
      updatedAt: remote?.updatedAt ?? '',
      available: Boolean(remote),
    };
  });
  const unknownRows = remoteConfigs.value
    .filter((config) => !knownKeys.has(config.key))
    .map((config) => ({
      key: config.key,
      value: config.value,
      valueType: config.valueType,
      effectStatus: config.effectStatus ?? 'NOT_IMPLEMENTED',
      description: config.description || 'Tham số khác',
      consumerEvidence: config.consumerEvidence,
      updatedAt: config.updatedAt,
      available: true,
    }));
  const query = searchQuery.value.trim().toLowerCase();
  return [...knownRows, ...unknownRows].filter((row) =>
    (!statusFilter.value || row.effectStatus === statusFilter.value)
    && (!query || `${row.key} ${row.description} ${STATUS_LABELS[row.effectStatus] ?? ''}`.toLowerCase().includes(query)),
  );
});

const loadConfigs = async () => {
  loading.value = true;
  error.value = '';
  loadFailed.value = false;
  try {
    remoteConfigs.value = await adminConfigApi.getConfigs();
  } catch (reason) {
    remoteConfigs.value = [];
    loadFailed.value = true;
    error.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void loadConfigs();
});

const configToEdit = ref<ConfigRow | null>(null);
const editValue = ref('');
const showEditModal = ref(false);
const saveLoading = ref(false);
const validationError = ref('');

const canEdit = (config: ConfigRow) =>
  config.available && config.effectStatus !== 'STALE_REVIEW' && config.effectStatus !== 'NOT_IMPLEMENTED';

const openEdit = (config: ConfigRow) => {
  if (!canEdit(config) || config.value === null) return;
  configToEdit.value = config;
  editValue.value = config.value;
  validationError.value = '';
  showEditModal.value = true;
};

const validateValue = (config: ConfigRow, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return 'Giá trị không được để trống.';
  if ((config.valueType === 'int' || config.valueType === 'bigint') && !/^-?\d+$/.test(trimmed)) {
    return 'Giá trị phải là số nguyên.';
  }
  if (config.valueType === 'boolean' && trimmed !== 'true' && trimmed !== 'false') {
    return 'Chỉ nhận Bật hoặc Tắt.';
  }
  if (config.valueType === 'enum' && config.enumValues && !config.enumValues.includes(trimmed)) {
    return `Chọn một trong: ${config.enumValues.map(valueLabel).join(', ')}.`;
  }
  if (config.valueType === 'int' || config.valueType === 'bigint') {
    const numericValue = Number(trimmed);
    if (config.min !== undefined && numericValue < config.min) return `Giá trị tối thiểu là ${config.min}.`;
    if (config.max !== undefined && numericValue > config.max) return `Giá trị tối đa là ${config.max}.`;
  }
  return '';
};

const saveConfig = async () => {
  if (!configToEdit.value || saveLoading.value) return;
  validationError.value = validateValue(configToEdit.value, editValue.value);
  if (validationError.value) return;

  saveLoading.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const updated = await adminConfigApi.updateConfig(configToEdit.value.key, editValue.value.trim());
    const index = remoteConfigs.value.findIndex((config) => config.key === updated.key);
    if (index >= 0) remoteConfigs.value[index] = updated;
    else remoteConfigs.value.push(updated);
    successMessage.value = `Đã lưu "${configToEdit.value.description}".`;
    showEditModal.value = false;
    configToEdit.value = null;
  } catch (reason) {
    validationError.value = userFacingError(reason, 'Chưa lưu được tham số, vui lòng thử lại.');
  } finally {
    saveLoading.value = false;
  }
};

const statusLabel = (status: ConfigEffectStatus) => STATUS_LABELS[status] ?? 'Chưa rõ';

const statusClass = (status: ConfigEffectStatus) => ({
  'bg-success-50 text-success-700': status === 'ACTIVE',
  'bg-warning-50 text-warning-700': status === 'TO_WIRE',
  'bg-ink-100 text-ink-600': status === 'NOT_IMPLEMENTED',
  'bg-danger-50 text-danger-700': status === 'STALE_REVIEW',
});
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Cấu hình hệ thống" :count="loading || error ? null : configRows.length">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadConfigs">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm tham số" label="Tìm tham số cấu hình" />
      <select v-model="statusFilter" :class="consoleField" aria-label="Lọc theo hiệu lực">
        <option value="">Mọi trạng thái</option>
        <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
      {{ successMessage }}
    </p>
    <p v-if="error && !loadFailed" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>

    <ConsoleLoadError v-if="loadFailed" :message="error" @retry="loadConfigs" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="configRows"
      :loading="loading"
      :row-key="(row) => row.key"
      empty-text="Không có tham số phù hợp."
    >
      <template #cell-description="{ row }">
        <div class="max-w-xl text-ink-900 text-pretty">{{ row.description }}</div>
      </template>
      <template #cell-value="{ row }">
        <span v-if="row.value !== null" class="whitespace-nowrap font-num font-medium text-ink-900">{{ valueLabel(row.value) }}</span>
        <span v-else class="whitespace-nowrap text-ink-400">Chưa có</span>
      </template>
      <template #cell-effectStatus="{ row }">
        <span class="whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium" :class="statusClass(row.effectStatus)">{{ statusLabel(row.effectStatus) }}</span>
      </template>
      <template #cell-actions="{ row }">
        <FhButton v-if="canEdit(row)" variant="secondary" size="sm" @click="openEdit(row)">Sửa</FhButton>
      </template>
    </ConsoleTable>

    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-edit-title"
      @keydown.esc="showEditModal = false"
    >
      <form class="bg-white rounded-[var(--radius-md)] max-w-md w-full p-6 shadow-xl space-y-4" @submit.prevent="saveConfig">
        <h3 id="config-edit-title" class="text-base font-semibold text-ink-900 text-pretty">{{ configToEdit?.description }}</h3>
        <label :class="consoleLabel" for="config-value">
          Giá trị mới
          <select v-if="configToEdit?.enumValues?.length" id="config-value" v-model="editValue" :class="consoleField">
            <option v-for="option in configToEdit.enumValues" :key="option" :value="option">{{ valueLabel(option) }}</option>
          </select>
          <input v-else id="config-value" v-model="editValue" type="text" :class="consoleField" class="font-num" />
        </label>
        <p v-if="configToEdit && (configToEdit.min !== undefined || configToEdit.max !== undefined)" class="text-xs text-ink-500">
          Từ <span class="font-num">{{ configToEdit.min ?? '—' }}</span> đến <span class="font-num">{{ configToEdit.max ?? '—' }}</span>
        </p>
        <p v-if="validationError" class="text-sm text-danger-600" role="alert">{{ validationError }}</p>
        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" :disabled="saveLoading" @click="showEditModal = false">Huỷ</FhButton>
          <FhButton type="submit" variant="primary" size="sm" :loading="saveLoading">Lưu</FhButton>
        </div>
      </form>
    </div>
  </div>
</template>
