<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, X } from 'lucide-vue-next';
import { FhButton, FhMoney, FhStatusPill, FhConfirmDialog } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel, consoleTextarea } from '../../../components/console/console-ui';
import { userFacingError } from '../../../utils/user-facing-error';
import {
  adminPartsApi,
  type FixHomePart,
  type CreatePartPayload,
  type UpdatePartPayload,
} from '../../../api/admin-parts.api';
import { vnDateString } from '../../../utils/vn-time';

// ── Table columns ──────────────────────────────────────────────────────────
const columns: ConsoleColumn[] = [
  { key: 'name', label: 'Linh kiện' },
  { key: 'sku', label: 'Mã SKU', hideBelow: 'xl' },
  { key: 'sellingPrice', label: 'Giá bán', align: 'right' },
  { key: 'warranty', label: 'Bảo hành', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];

// ── List state ─────────────────────────────────────────────────────────────
const parts = ref<FixHomePart[]>([]);
const loading = ref(true);
const error = ref('');
const loadError = ref('');
const successMessage = ref('');
const searchQuery = ref('');
const activeFilter = ref<'ALL' | 'true' | 'false'>('ALL');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
let latestRequest = 0;

const router = useRouter();
const detailPart = ref<FixHomePart | null>(null);
const openDetail = (part: FixHomePart) => {
  detailPart.value = part;
};

// Plain Vietnamese reasons from the server are kept; codes and English never show.
const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

const loadParts = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await adminPartsApi.getParts({
      page: page.value,
      limit: pageSize,
      search: searchQuery.value.trim() || undefined,
      isActive: activeFilter.value === 'ALL' ? undefined : activeFilter.value === 'true',
    });
    if (requestId !== latestRequest) return;
    parts.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    parts.value = [];
    total.value = 0;
    loadError.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => {
  void loadParts();
});

watch([searchQuery, activeFilter], () => {
  successMessage.value = '';
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadParts();
  }
});

watch(page, (next, prev) => {
  if (next !== prev) void loadParts();
});


// ── Activate / Deactivate ──────────────────────────────────────────────────
const partToToggle = ref<FixHomePart | null>(null);
const showStatusModal = ref(false);
const mutationLoading = ref(false);

const triggerToggle = (part: FixHomePart) => {
  partToToggle.value = part;
  showStatusModal.value = true;
  error.value = '';
  successMessage.value = '';
};

const confirmToggle = async () => {
  if (!partToToggle.value || mutationLoading.value) return;
  mutationLoading.value = true;
  error.value = '';
  try {
    const updated = await adminPartsApi.setPartStatus(
      partToToggle.value.id,
      !partToToggle.value.isActive,
    );
    const idx = parts.value.findIndex((p) => p.id === updated.id);
    if (idx >= 0) parts.value[idx] = updated;
    successMessage.value = `Đã ${updated.isActive ? 'dùng lại' : 'ngừng dùng'} "${updated.name}".`;
    showStatusModal.value = false;
    partToToggle.value = null;
    await loadParts();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa đổi được trạng thái linh kiện, vui lòng thử lại.');
  } finally {
    mutationLoading.value = false;
  }
};

// ── Create / Edit form ─────────────────────────────────────────────────────
const showForm = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editingPart = ref<FixHomePart | null>(null);
const formLoading = ref(false);
const formError = ref('');

const formData = ref({
  sku: '',
  name: '',
  description: '',
  sellingPrice: '',
  warrantyDays: '',
  warrantyPolicy: '',
});

function resetForm() {
  formData.value = {
    sku: '',
    name: '',
    description: '',
    sellingPrice: '',
    warrantyDays: '',
    warrantyPolicy: '',
  };
  formError.value = '';
}

function openCreate() {
  formMode.value = 'create';
  editingPart.value = null;
  resetForm();
  showForm.value = true;
}

function openEdit(part: FixHomePart) {
  formMode.value = 'edit';
  editingPart.value = part;
  formData.value = {
    sku: part.sku ?? '',
    name: part.name,
    description: part.description ?? '',
    sellingPrice: String(part.sellingPrice),
    warrantyDays: part.warrantyDays != null ? String(part.warrantyDays) : '',
    warrantyPolicy: part.warrantyPolicy ?? '',
  };
  formError.value = '';
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingPart.value = null;
  resetForm();
}

const formTitle = computed(() =>
  formMode.value === 'create' ? 'Thêm linh kiện' : 'Sửa linh kiện',
);

async function submitForm() {
  formError.value = '';
  const name = formData.value.name.trim();
  if (!name) {
    formError.value = 'Nhập tên linh kiện.';
    return;
  }
  const priceText = formData.value.sellingPrice.trim();
  const priceRaw = Number(priceText);
  const priceDecimals = priceText.includes('.') ? (priceText.split('.')[1]?.length ?? 0) : 0;
  if (
    !priceText ||
    !Number.isFinite(priceRaw) ||
    priceRaw < 0 ||
    priceRaw > 9999999999.99 ||
    priceDecimals > 2
  ) {
    formError.value = 'Giá bán phải từ 0 đến 9.999.999.999,99 và tối đa 2 chữ số thập phân.';
    return;
  }
  const warrantyDaysRaw = formData.value.warrantyDays.trim();
  const warrantyDays = warrantyDaysRaw === '' ? null : Number(warrantyDaysRaw);
  if (
    warrantyDays !== null &&
    (!Number.isInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 3650)
  ) {
    formError.value = 'Số ngày bảo hành phải là số nguyên từ 0 đến 3650.';
    return;
  }

  formLoading.value = true;
  try {
    if (formMode.value === 'create') {
      const payload: CreatePartPayload = {
        sku: formData.value.sku.trim() || null,
        name,
        description: formData.value.description.trim() || null,
        sellingPrice: priceRaw,
        warrantyDays,
        warrantyPolicy: formData.value.warrantyPolicy.trim() || null,
      };
      await adminPartsApi.createPart(payload);
      successMessage.value = `Đã thêm linh kiện "${name}".`;
    } else {
      if (!editingPart.value) return;
      const payload: UpdatePartPayload = {
        sku: formData.value.sku.trim() || null,
        name,
        description: formData.value.description.trim() || null,
        sellingPrice: priceRaw,
        warrantyDays,
        warrantyPolicy: formData.value.warrantyPolicy.trim() || null,
      };
      const updated = await adminPartsApi.updatePart(editingPart.value.id, payload);
      const idx = parts.value.findIndex((p) => p.id === updated.id);
      if (idx >= 0) parts.value[idx] = updated;
      successMessage.value = `Đã cập nhật linh kiện "${updated.name}".`;
    }
    closeForm();
    if (formMode.value === 'create') {
      page.value = 1;
      void loadParts();
    }
  } catch (reason) {
    formError.value = getErrorMessage(reason, 'Chưa lưu được linh kiện, vui lòng thử lại.');
  } finally {
    formLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Danh mục linh kiện" :count="loading || loadError ? null : total">
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openCreate">
          <Plus :size="16" aria-hidden="true" /> Thêm linh kiện
        </FhButton>
        <ConsoleMoreMenu>
          <ConsoleMenuItem @click="router.push('/console/part-requests')">Xem yêu cầu linh kiện</ConsoleMenuItem>
          <ConsoleMenuItem :disabled="loading" @click="loadParts">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm tên, mã SKU, mô tả" label="Tìm linh kiện" />
      <select v-model="activeFilter" :class="consoleField" aria-label="Trạng thái">
        <option value="ALL">Tất cả trạng thái</option>
        <option value="true">Đang dùng</option>
        <option value="false">Ngừng dùng</option>
      </select>
    </div>

    <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadParts" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="parts"
      :loading="loading"
      empty-text="Không có linh kiện phù hợp."
    >
      <template #cell-name="{ row }">
        <button
          type="button"
          class="text-left font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          @click="openDetail(row)"
        >{{ row.name }}</button>
        <div v-if="row.description" class="max-w-72 truncate text-xs text-ink-500" :title="row.description">{{ row.description }}</div>
      </template>
      <template #cell-sku="{ row }">
        <span class="whitespace-nowrap font-num text-ink-600">{{ row.sku ?? '—' }}</span>
      </template>
      <template #cell-sellingPrice="{ row }">
        <FhMoney :amount="Number(row.sellingPrice)" />
      </template>
      <template #cell-warranty="{ row }">
        <span v-if="row.warrantyDays != null" class="whitespace-nowrap text-ink-700">{{ row.warrantyDays }}&nbsp;ngày</span>
        <span v-else class="whitespace-nowrap text-ink-400">Không bảo hành</span>
      </template>
      <template #cell-status="{ row }">
        <FhStatusPill :status="row.isActive ? 'active' : 'inactive'" :label="row.isActive ? 'Đang dùng' : 'Ngừng dùng'" />
      </template>
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="openEdit(row)">Sửa</FhButton>
          <ConsoleMoreMenu label="Thao tác khác với linh kiện">
            <ConsoleMenuItem :danger="row.isActive" @click="triggerToggle(row)">
              {{ row.isActive ? 'Ngừng dùng' : 'Dùng lại' }}
            </ConsoleMenuItem>
          </ConsoleMoreMenu>
        </div>
      </template>
    </ConsoleTable>

    <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />

    <FhConfirmDialog
      :open="showStatusModal"
      :loading="mutationLoading"
      :title="partToToggle?.isActive ? 'Ngừng dùng linh kiện' : 'Dùng lại linh kiện'"
      :consequence="partToToggle?.isActive ? 'Linh kiện không còn xuất hiện trong báo giá mới.' : 'Linh kiện được dùng lại trong báo giá mới.'"
      :confirm-text="partToToggle?.isActive ? 'Ngừng dùng' : 'Dùng lại'"
      cancel-text="Quay lại"
      :danger="!!partToToggle?.isActive"
      @confirm="confirmToggle"
      @cancel="showStatusModal = false"
    />

    <!-- Create / edit side panel -->
    <Teleport to="body">
      <div
        v-if="showForm"
        class="fixed inset-0 z-50 flex items-start justify-end bg-ink-900/40"
        @click.self="closeForm"
        @keydown.esc="closeForm"
      >
        <div
          class="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="part-form-title"
        >
          <div class="flex items-center justify-between border-b border-ink-200 px-6 py-4">
            <h2 id="part-form-title" class="text-base font-semibold text-ink-900">{{ formTitle }}</h2>
            <button class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" type="button" aria-label="Đóng" @click="closeForm">
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <form id="part-form" class="flex-1 space-y-5 px-6 py-5" @submit.prevent="submitForm">
            <p v-if="formError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ formError }}</p>
            <label :class="consoleLabel" for="part-name">
              Tên linh kiện
              <input id="part-name" v-model="formData.name" type="text" required maxlength="200" placeholder="Ví dụ: Quạt tản nhiệt 5V" :class="consoleField" class="h-10" />
            </label>
            <label :class="consoleLabel" for="part-sku">
              Mã SKU (không bắt buộc)
              <input id="part-sku" v-model="formData.sku" type="text" maxlength="100" placeholder="Ví dụ: FH-FAN-5V-001" :class="consoleField" class="h-10 font-num" />
            </label>
            <label :class="consoleLabel" for="part-description">
              Mô tả (không bắt buộc)
              <textarea id="part-description" v-model="formData.description" rows="3" maxlength="5000" :class="consoleTextarea" class="resize-none" />
            </label>
            <label :class="consoleLabel" for="part-price">
              Giá bán (₫)
              <input id="part-price" v-model="formData.sellingPrice" type="number" min="0" step="0.01" max="9999999999.99" required inputmode="decimal" placeholder="0" :class="consoleField" class="h-10 font-num" />
            </label>
            <label :class="consoleLabel" for="part-warranty-days">
              Số ngày bảo hành (để trống nếu không bảo hành)
              <input id="part-warranty-days" v-model="formData.warrantyDays" type="number" min="0" max="3650" step="1" inputmode="numeric" placeholder="Ví dụ: 365" :class="consoleField" class="h-10 font-num" />
            </label>
            <label :class="consoleLabel" for="part-warranty-policy">
              Chính sách bảo hành (không bắt buộc)
              <textarea id="part-warranty-policy" v-model="formData.warrantyPolicy" rows="3" maxlength="5000" placeholder="Điều kiện, phạm vi và ngoại lệ bảo hành" :class="consoleTextarea" class="resize-none" />
            </label>
          </form>

          <div class="flex items-center justify-end gap-2 border-t border-ink-200 px-6 py-4">
            <FhButton variant="secondary" size="sm" :disabled="formLoading" @click="closeForm">Huỷ</FhButton>
            <FhButton variant="primary" size="sm" :loading="formLoading" @click="submitForm">
              {{ formMode === 'create' ? 'Thêm linh kiện' : 'Lưu thay đổi' }}
            </FhButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Part detail -->
    <div
      v-if="detailPart"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="part-detail-title"
      @click.self="detailPart = null"
      @keydown.esc="detailPart = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 id="part-detail-title" class="text-base font-semibold text-ink-900">{{ detailPart.name }}</h3>
            <p class="font-num text-sm text-ink-500">{{ detailPart.sku || 'Chưa đặt mã SKU' }}</p>
          </div>
          <button type="button" class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="detailPart = null">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Trạng thái</dt><dd><FhStatusPill :status="detailPart.isActive ? 'active' : 'inactive'" :label="detailPart.isActive ? 'Đang dùng' : 'Ngừng dùng'" /></dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Giá bán</dt><dd><FhMoney :amount="Number(detailPart.sellingPrice)" /></dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Bảo hành</dt><dd class="text-ink-900">{{ detailPart.warrantyDays != null ? `${detailPart.warrantyDays} ngày` : 'Không bảo hành' }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Ngày tạo</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ vnDateString(detailPart.createdAt) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Cập nhật</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ vnDateString(detailPart.updatedAt) }}</dd></div>
        </dl>

        <div v-if="detailPart.description" class="border-t border-ink-100 pt-3 text-sm">
          <div class="mb-1 text-ink-500">Mô tả</div>
          <p class="whitespace-pre-line text-ink-800">{{ detailPart.description }}</p>
        </div>
        <div v-if="detailPart.warrantyPolicy" class="border-t border-ink-100 pt-3 text-sm">
          <div class="mb-1 text-ink-500">Chính sách bảo hành</div>
          <p class="whitespace-pre-line text-ink-800">{{ detailPart.warrantyPolicy }}</p>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <FhButton variant="secondary" size="sm" @click="detailPart = null">Đóng</FhButton>
          <FhButton variant="primary" size="sm" @click="const p = detailPart; detailPart = null; if (p) openEdit(p)">Sửa</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
