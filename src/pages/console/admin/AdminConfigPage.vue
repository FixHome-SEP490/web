<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Sliders, Edit2, Search, RefreshCw } from 'lucide-vue-next';
import { FhButton, FhCard, FhTable, type TableColumn } from '../../../components';
import {
  adminConfigApi,
  type AdminConfigItem,
  type ConfigEffectStatus,
  type ConfigValueType,
} from '../../../api/admin-config.api';

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
  { key: 'matching.max_shortlist', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 10, description: 'Số Technician tối đa trong shortlist.' },
  { key: 'matching.mode', valueType: 'enum', effectStatus: 'STALE_REVIEW', enumValues: ['SEQUENTIAL'], description: 'Chế độ mời Technician; v1.4 yêu cầu tuần tự.' },
  { key: 'matching.invitation_ttl_minutes', valueType: 'int', effectStatus: 'ACTIVE', min: 5, max: 1440, description: 'Thời gian hết hạn lời mời (phút).' },
  { key: 'geofence.radius_meters', valueType: 'int', effectStatus: 'TO_WIRE', min: 10, max: 5000, description: 'Bán kính geofence cho check-in.' },
  { key: 'geofence.min_gps_accuracy_meters', valueType: 'int', effectStatus: 'ACTIVE', min: 5, max: 500, description: 'Ngưỡng độ chính xác GPS tối thiểu.' },
  { key: 'evidence.before.min_count', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 10, description: 'Số ảnh BEFORE tối thiểu.' },
  { key: 'evidence.after.min_count', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 10, description: 'Số ảnh AFTER tối thiểu.' },
  { key: 'evidence.max_file_mb', valueType: 'int', effectStatus: 'TO_WIRE', min: 1, max: 50, description: 'Dung lượng tối đa cho evidence (MB).' },
  { key: 'strike.window.days', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 365, description: 'Cửa sổ hiệu lực của strike (ngày).' },
  { key: 'strike.customer.threshold', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 20, description: 'Ngưỡng strike Customer trước suspension.' },
  { key: 'strike.technician.threshold', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 20, description: 'Ngưỡng strike Technician trước suspension.' },
  { key: 'customer.suspension.hours', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 8760, description: 'Thời gian suspension Customer (giờ).' },
  { key: 'technician.suspension.hours', valueType: 'int', effectStatus: 'ACTIVE', min: 1, max: 8760, description: 'Thời gian suspension Technician (giờ).' },
  { key: 'cancel.grace_minutes_after_accept', valueType: 'int', effectStatus: 'ACTIVE', min: 0, max: 120, description: 'Thời gian grace sau Accept (phút).' },
  { key: 'compensation.arrival.amount', valueType: 'bigint', effectStatus: 'STALE_REVIEW', min: 0, max: 0, description: 'Semantics compensation arrival đã bị loại khỏi v1.4.' },
  { key: 'commission.base', valueType: 'enum', effectStatus: 'TO_WIRE', enumValues: ['LABOR'], description: 'Cơ sở tính commission; v1.4 chỉ tính LABOR.' },
  { key: 'commission.rate_bps', valueType: 'int', effectStatus: 'TO_WIRE', min: 0, max: 5000, description: 'Commission theo basis points (1000 = 10%).' },
  { key: 'additional_cost.approval_ttl_minutes', valueType: 'int', effectStatus: 'STALE_REVIEW', min: 5, max: 1440, description: 'Thời gian chờ duyệt Additional Cost (phút).' },
  { key: 'warranty.default_days', valueType: 'int', effectStatus: 'TO_WIRE', min: 0, max: 3650, description: 'Warranty mặc định (ngày).' },
  { key: 'warranty.max_days', valueType: 'int', effectStatus: 'TO_WIRE', min: 0, max: 3650, description: 'Warranty tối đa (ngày).' },
  { key: 'ai.provider', valueType: 'enum', effectStatus: 'TO_WIRE', enumValues: ['stub', 'gemini', 'openai', 'fixhome'], description: 'Provider AI hiện tại.' },
  { key: 'ai.timeout_ms', valueType: 'int', effectStatus: 'TO_WIRE', min: 1000, max: 60000, description: 'Timeout cho AI (milliseconds).' },
  { key: 'ai.rate_limit_per_user_per_hour', valueType: 'int', effectStatus: 'TO_WIRE', min: 1, max: 1000, description: 'Số request AI tối đa mỗi user mỗi giờ.' },
  { key: 'payment.mode', valueType: 'enum', effectStatus: 'NOT_IMPLEMENTED', enumValues: ['DEMO', 'LIVE'], description: 'Chế độ thanh toán; provider verification thuộc Wave 3.' },
];

const columns: TableColumn[] = [
  { key: 'key', label: 'Config key', width: '250px' },
  { key: 'value', label: 'Giá trị', width: '160px' },
  { key: 'description', label: 'Ý nghĩa nghiệp vụ' },
  { key: 'effectStatus', label: 'Hiệu lực', width: '150px' },
  { key: 'actions', label: 'Thao tác', width: '90px' },
];

const searchQuery = ref('');
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
      description: remote?.description || definition.description,
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
      description: config.description || 'Config chưa có trong registry của Web.',
      consumerEvidence: config.consumerEvidence,
      updatedAt: config.updatedAt,
      available: true,
    }));
  const query = searchQuery.value.trim().toLowerCase();
  return [...knownRows, ...unknownRows].filter((row) =>
    !query || `${row.key} ${row.description} ${row.effectStatus}`.toLowerCase().includes(query),
  );
});

const loadConfigs = async () => {
  loading.value = true;
  error.value = '';
  try {
    remoteConfigs.value = await adminConfigApi.getConfigs();
  } catch (reason) {
    remoteConfigs.value = [];
    error.value = reason instanceof Error
      ? reason.message
      : 'Không thể tải cấu hình từ Backend.';
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
    return 'Giá trị boolean chỉ nhận true hoặc false.';
  }
  if (config.valueType === 'enum' && config.enumValues && !config.enumValues.includes(trimmed)) {
    return `Giá trị phải là một trong: ${config.enumValues.join(', ')}.`;
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
    successMessage.value = `Đã cập nhật ${updated.key} từ Backend.`;
    showEditModal.value = false;
    configToEdit.value = null;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Không thể cập nhật cấu hình.';
  } finally {
    saveLoading.value = false;
  }
};

const statusLabel = (status: ConfigEffectStatus) => {
  switch (status) {
    case 'ACTIVE': return 'ACTIVE';
    case 'TO_WIRE': return 'TO_WIRE';
    case 'NOT_IMPLEMENTED': return 'NOT IMPLEMENTED';
    case 'STALE_REVIEW': return 'STALE / REVIEW';
  }
};

const statusClass = (status: ConfigEffectStatus) => ({
  'bg-success-50 text-success-700': status === 'ACTIVE',
  'bg-warning-50 text-warning-700': status === 'TO_WIRE',
  'bg-ink-100 text-ink-600': status === 'NOT_IMPLEMENTED',
  'bg-danger-50 text-danger-700': status === 'STALE_REVIEW',
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Sliders class="text-brand-600" :size="24" />
          Cấu hình Hệ thống (24)
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Giá trị được đọc từ Backend; trạng thái cho biết config đã có hiệu lực hay còn chờ wiring.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :loading="loading" @click="loadConfigs">
        <RefreshCw :size="15" /> Làm mới
      </FhButton>
    </div>

    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadConfigs">Thử lại</button>
    </div>
    <div v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
      {{ successMessage }}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div class="relative flex-1 min-w-[240px] max-w-sm">
        <label class="sr-only" for="config-search">Tìm config</label>
        <input id="config-search" v-model="searchQuery" type="search" placeholder="Tìm theo key, mô tả hoặc trạng thái..." class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white" />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
        <span class="px-2 py-1 rounded bg-success-50 text-success-700">ACTIVE</span>
        <span class="px-2 py-1 rounded bg-warning-50 text-warning-700">TO_WIRE</span>
        <span class="px-2 py-1 rounded bg-ink-100 text-ink-600">NOT IMPLEMENTED</span>
        <span class="px-2 py-1 rounded bg-danger-50 text-danger-700">STALE / REVIEW</span>
      </div>
    </div>

    <FhCard>
      <FhTable :columns="columns" :rows="configRows" :loading="loading" :empty-text="error ? 'Không thể hiển thị cấu hình.' : 'Không có config phù hợp.'">
        <template #cell-key="{ row }">
          <code class="text-xs font-mono font-bold text-brand-800">{{ row.key }}</code>
          <span class="text-[10px] text-ink-400 block font-mono">Kiểu: {{ row.valueType }}</span>
        </template>
        <template #cell-value="{ row }">
          <span v-if="row.value !== null" class="font-mono text-xs font-bold text-ink-900 bg-ink-100 px-2 py-0.5 rounded">{{ row.value }}</span>
          <span v-else class="text-xs italic text-ink-400">Chưa tải từ Backend</span>
        </template>
        <template #cell-description="{ row }">
          <span class="text-xs text-ink-600 leading-relaxed">{{ row.description }}</span>
          <span v-if="row.consumerEvidence" class="block mt-1 text-[10px] text-ink-400">{{ row.consumerEvidence }}</span>
        </template>
        <template #cell-effectStatus="{ row }">
          <span class="px-2 py-1 rounded text-[10px] font-semibold whitespace-nowrap" :class="statusClass(row.effectStatus)">{{ statusLabel(row.effectStatus) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="p-2 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-ink-500 hover:text-brand-600 hover:bg-ink-100" type="button" title="Chỉnh sửa cấu hình" :disabled="!canEdit(row)" @click="openEdit(row)">
            <Edit2 :size="15" />
          </button>
        </template>
      </FhTable>
    </FhCard>

    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4">
      <div class="bg-white rounded-[var(--radius-md)] max-w-md w-full p-6 shadow-xl space-y-4 text-xs">
        <h3 class="text-base font-bold text-ink-900">Chỉnh sửa Config</h3>
        <div>
          <label class="block font-semibold text-ink-700 mb-1" for="config-key">Config key</label>
          <input id="config-key" :value="configToEdit?.key" disabled class="w-full h-9 px-3 bg-ink-100 border border-ink-200 rounded font-mono text-ink-600 cursor-not-allowed" />
        </div>
        <div>
          <label class="block font-semibold text-ink-700 mb-1" for="config-value">Giá trị mới *</label>
          <select v-if="configToEdit?.enumValues?.length" id="config-value" v-model="editValue" class="w-full h-9 px-3 bg-white border border-ink-200 rounded font-mono focus:outline-none focus:border-brand-600">
            <option v-for="option in configToEdit.enumValues" :key="option" :value="option">{{ option }}</option>
          </select>
          <input v-else id="config-value" v-model="editValue" type="text" class="w-full h-9 px-3 bg-white border border-ink-200 rounded font-mono focus:outline-none focus:border-brand-600" />
          <p v-if="validationError" class="mt-1 text-danger-600" role="alert">{{ validationError }}</p>
        </div>
        <p class="text-[11px] text-ink-500 leading-relaxed">{{ configToEdit?.description }}</p>
        <div class="flex justify-end gap-2 pt-2 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" :disabled="saveLoading" @click="showEditModal = false">Huỷ</FhButton>
          <FhButton variant="primary" size="sm" :loading="saveLoading" @click="saveConfig">Lưu tham số</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
