<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Package,
  Plus,
  Pencil,
  PowerOff,
  Power,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  History,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhTable,
  FhStatusPill,
  FhConfirmDialog,
  type TableColumn,
} from '../../../components';
import {
  adminPartsApi,
  type FixHomePart,
  type CreatePartPayload,
  type UpdatePartPayload,
} from '../../../api/admin-parts.api';

// ── Table columns ──────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'sku', label: 'SKU', width: '110px' },
  { key: 'name', label: 'Tên linh kiện' },
  { key: 'sellingPrice', label: 'Giá bán (VNĐ)', width: '140px' },
  { key: 'warranty', label: 'Bảo hành', width: '120px' },
  { key: 'status', label: 'Trạng thái', width: '120px' },
  { key: 'actions', label: 'Thao tác', width: '120px' },
];

// ── List state ─────────────────────────────────────────────────────────────
const parts = ref<FixHomePart[]>([]);
const loading = ref(true);
const error = ref('');
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

function getErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason !== null && 'response' in reason) {
    const res = (reason as {
      response?: { data?: { message?: unknown; error?: { message?: unknown } } };
    }).response;
    if (typeof res?.data?.error?.message === 'string') return res.data.error.message;
    if (typeof res?.data?.message === 'string') return res.data.message;
  }
  return fallback;
}

const loadParts = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
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
    error.value = getErrorMessage(reason, 'Không thể tải danh sách linh kiện từ Backend.');
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

// ── Format helpers ─────────────────────────────────────────────────────────
const formatPrice = (value: number) =>
  new Intl.NumberFormat('vi-VN').format(value);


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
    successMessage.value = `Đã ${updated.isActive ? 'kích hoạt' : 'vô hiệu hoá'} linh kiện "${updated.name}".`;
    showStatusModal.value = false;
    partToToggle.value = null;
    await loadParts();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Không thể cập nhật trạng thái linh kiện.');
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
  formMode.value === 'create' ? 'Thêm linh kiện mới' : 'Chỉnh sửa linh kiện',
);

async function submitForm() {
  formError.value = '';
  const name = formData.value.name.trim();
  if (!name) {
    formError.value = 'Tên linh kiện là bắt buộc.';
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
    formError.value = getErrorMessage(reason, 'Không thể lưu linh kiện. Vui lòng thử lại.');
  } finally {
    formLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Package class="text-brand-600" :size="24" />
          Danh mục Linh kiện FixHome
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Quản lý catalog linh kiện do FixHome cung cấp: giá bán, bảo hành và trạng thái hoạt động.
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <FhButton variant="secondary" size="sm" @click="router.push('/console/part-requests')">
          <History :size="15" /> Lịch sử Parts Request (Audit)
        </FhButton>
        <FhButton variant="secondary" size="sm" :loading="loading" @click="loadParts">
          <RefreshCw :size="15" /> Làm mới
        </FhButton>
        <FhButton variant="primary" size="sm" @click="openCreate">
          <Plus :size="15" /> Thêm linh kiện
        </FhButton>
      </div>
    </div>

    <!-- Scope disclaimer banner -->
    <div class="p-3 bg-blue-50/60 border border-blue-200 rounded-[var(--radius-sm)] text-xs text-blue-900 flex items-start gap-2">
      <Package :size="16" class="text-blue-600 mt-0.5 shrink-0" />
      <div>
        <span class="font-bold">Phạm vi Catalog FixHome:</span> Quản lý bảng giá niêm yết, chính sách bảo hành và trạng thái hoạt động của từng linh kiện. Hệ thống vận hành theo cơ chế <em>Parts Request & Handover Tracking</em>, không triển khai quản lý kho bãi / tồn kho (không quản lý nhập/xuất kho hay nhà cung cấp).
      </div>
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadParts">Thử lại</button>
    </div>

    <!-- Success banner -->
    <div
      v-if="successMessage"
      class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800"
      role="status"
    >
      {{ successMessage }}
    </div>

    <!-- Filters -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]"
    >
      <div class="relative flex-1 min-w-[240px] max-w-sm">
        <label class="sr-only" for="admin-parts-search">Tìm linh kiện</label>
        <input
          id="admin-parts-search"
          v-model="searchQuery"
          type="search"
          maxlength="200"
          placeholder="Tìm theo tên, SKU hoặc mô tả..."
          class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>

      <label class="flex items-center gap-2 text-xs text-ink-500">
        Trạng thái:
        <select
          v-model="activeFilter"
          class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700"
        >
          <option value="ALL">Tất cả</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Đã vô hiệu</option>
        </select>
      </label>
    </div>

    <!-- Table -->
    <FhCard>
      <FhTable
        :columns="columns"
        :rows="parts"
        :loading="loading"
        :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có linh kiện phù hợp.'"
      >
        <template #cell-sku="{ row }">
          <span class="text-xs font-mono text-ink-500">{{ row.sku ?? '—' }}</span>
        </template>

        <template #cell-name="{ row }">
          <div class="font-semibold text-xs text-ink-900">{{ row.name }}</div>
          <div v-if="row.description" class="text-[11px] text-ink-400 truncate max-w-[260px]">
            {{ row.description }}
          </div>
        </template>

        <template #cell-sellingPrice="{ row }">
          <span class="text-xs font-num text-ink-800">
            {{ formatPrice(Number(row.sellingPrice)) }} đ
          </span>
        </template>

        <template #cell-warranty="{ row }">
          <span v-if="row.warrantyDays != null" class="text-xs text-ink-700">
            {{ row.warrantyDays }} ngày
          </span>
          <span v-else class="text-[11px] text-ink-400 italic">Không bảo hành</span>
        </template>

        <template #cell-status="{ row }">
          <FhStatusPill
            :status="row.isActive ? 'active' : 'inactive'"
            :label="row.isActive ? 'Hoạt động' : 'Vô hiệu'"
          />
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center gap-1">
            <button
              class="p-2 rounded text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors"
              title="Xem chi tiết"
              type="button"
              @click="openDetail(row)"
            >
              <Eye :size="14" />
            </button>
            <button
              class="p-2 rounded text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors"
              title="Chỉnh sửa"
              type="button"
              @click="openEdit(row)"
            >
              <Pencil :size="14" />
            </button>
            <button
              class="p-2 rounded transition-colors"
              :class="
                row.isActive
                  ? 'text-danger-500 hover:bg-danger-50'
                  : 'text-success-600 hover:bg-success-50'
              "
              :title="row.isActive ? 'Vô hiệu hoá' : 'Kích hoạt lại'"
              type="button"
              @click="triggerToggle(row)"
            >
              <PowerOff v-if="row.isActive" :size="14" />
              <Power v-else :size="14" />
            </button>
          </div>
        </template>
      </FhTable>
    </FhCard>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-ink-500">
      <span>Trang {{ page }} / {{ totalPages }} · {{ total }} linh kiện</span>
      <div class="flex items-center gap-2">
        <button
          class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40"
          type="button"
          :disabled="page <= 1 || loading"
          aria-label="Trang trước"
          @click="page--"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40"
          type="button"
          :disabled="page >= totalPages || loading"
          aria-label="Trang sau"
          @click="page++"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <!-- Activate / Deactivate confirmation dialog -->
    <FhConfirmDialog
      :open="showStatusModal"
      :loading="mutationLoading"
      :title="
        partToToggle?.isActive ? 'Vô hiệu hoá linh kiện' : 'Kích hoạt linh kiện'
      "
      :consequence="
        partToToggle?.isActive
          ? 'Linh kiện sẽ không xuất hiện trong báo giá mới sau khi Backend xác nhận.'
          : 'Backend sẽ kích hoạt lại linh kiện sau khi xác nhận thay đổi.'
      "
      :confirm-text="partToToggle?.isActive ? 'Vô hiệu hoá' : 'Kích hoạt'"
      cancel-text="Quay lại"
      @confirm="confirmToggle"
      @cancel="showStatusModal = false"
    />

    <!-- Create / Edit side panel (inline modal) -->
    <Teleport to="body">
      <div
        v-if="showForm"
        class="fixed inset-0 z-50 flex items-start justify-end bg-ink-900/40"
        @click.self="closeForm"
      >
        <div
          class="relative h-full w-full max-w-lg bg-white shadow-xl flex flex-col overflow-y-auto"
        >
          <!-- Panel header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-ink-200">
            <h2 class="text-base font-bold text-ink-900 flex items-center gap-2">
              <Package :size="18" class="text-brand-600" />
              {{ formTitle }}
            </h2>
            <button
              class="p-1.5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
              type="button"
              aria-label="Đóng"
              @click="closeForm"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Form body -->
          <form class="flex-1 px-6 py-5 space-y-5" @submit.prevent="submitForm">
            <!-- Form error -->
            <div
              v-if="formError"
              class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
              role="alert"
            >
              {{ formError }}
            </div>

            <!-- Name (required) -->
            <div class="space-y-1">
              <label class="block text-xs font-semibold text-ink-700" for="part-name">
                Tên linh kiện <span class="text-danger-500">*</span>
              </label>
              <input
                id="part-name"
                v-model="formData.name"
                type="text"
                required
                maxlength="200"
                placeholder="Ví dụ: Quạt tản nhiệt laptop 5V"
                class="w-full h-9 px-3 text-xs border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 bg-white"
              />
            </div>

            <!-- SKU (optional) -->
            <div class="space-y-1">
              <label class="block text-xs font-semibold text-ink-700" for="part-sku">
                SKU <span class="text-ink-400 font-normal">(tuỳ chọn)</span>
              </label>
              <input
                id="part-sku"
                v-model="formData.sku"
                type="text"
                maxlength="100"
                placeholder="Ví dụ: FH-FAN-5V-001"
                class="w-full h-9 px-3 text-xs border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 bg-white font-mono"
              />
            </div>

            <!-- Description (optional) -->
            <div class="space-y-1">
              <label class="block text-xs font-semibold text-ink-700" for="part-description">
                Mô tả <span class="text-ink-400 font-normal">(tuỳ chọn)</span>
              </label>
              <textarea
                id="part-description"
                v-model="formData.description"
                rows="3"
                maxlength="5000"
                placeholder="Thông tin thêm về linh kiện..."
                class="w-full px-3 py-2 text-xs border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 bg-white resize-none"
              />
            </div>

            <!-- Selling price (required) -->
            <div class="space-y-1">
              <label class="block text-xs font-semibold text-ink-700" for="part-price">
                Giá bán (VNĐ) <span class="text-danger-500">*</span>
              </label>
              <input
                id="part-price"
                v-model="formData.sellingPrice"
                type="number"
                min="0"
                step="0.01"
                max="9999999999.99"
                required
                placeholder="0"
                class="w-full h-9 px-3 text-xs border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 bg-white font-num"
              />
            </div>

            <!-- Warranty days (optional) -->
            <div class="space-y-1">
              <label class="block text-xs font-semibold text-ink-700" for="part-warranty-days">
                Số ngày bảo hành <span class="text-ink-400 font-normal">(tuỳ chọn)</span>
              </label>
              <input
                id="part-warranty-days"
                v-model="formData.warrantyDays"
                type="number"
                min="0"
                max="3650"
                step="1"
                placeholder="Ví dụ: 365"
                class="w-full h-9 px-3 text-xs border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 bg-white font-num"
              />
              <p class="text-[11px] text-ink-400">Để trống nếu linh kiện không có bảo hành.</p>
            </div>

            <!-- Warranty policy (optional) -->
            <div class="space-y-1">
              <label class="block text-xs font-semibold text-ink-700" for="part-warranty-policy">
                Chính sách bảo hành <span class="text-ink-400 font-normal">(tuỳ chọn)</span>
              </label>
              <textarea
                id="part-warranty-policy"
                v-model="formData.warrantyPolicy"
                rows="3"
                maxlength="5000"
                placeholder="Mô tả điều kiện, phạm vi và ngoại lệ bảo hành..."
                class="w-full px-3 py-2 text-xs border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 bg-white resize-none"
              />
            </div>
          </form>

          <!-- Panel footer -->
          <div class="px-6 py-4 border-t border-ink-200 flex items-center justify-end gap-3">
            <FhButton variant="secondary" size="sm" :disabled="formLoading" @click="closeForm">
              Huỷ
            </FhButton>
            <FhButton
              variant="primary"
              size="sm"
              :loading="formLoading"
              @click="submitForm"
            >
              {{ formMode === 'create' ? 'Thêm linh kiện' : 'Lưu thay đổi' }}
            </FhButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Part Detail Modal -->
    <div
      v-if="detailPart"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      @click.self="detailPart = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
          <div class="flex items-center gap-2">
            <Package class="text-brand-600" :size="20" />
            <h3 class="font-bold text-ink-900 text-base">Chi tiết Linh kiện Catalog</h3>
          </div>
          <button class="text-ink-400 hover:text-ink-700 text-lg font-bold" @click="detailPart = null">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-2 p-3 bg-ink-50 rounded border border-ink-200">
            <div>
              <span class="text-ink-400 block text-[11px]">Mã SKU:</span>
              <span class="font-mono font-bold text-ink-900">{{ detailPart.sku || 'Chưa đặt SKU' }}</span>
            </div>
            <div>
              <span class="text-ink-400 block text-[11px]">Trạng thái:</span>
              <FhStatusPill
                :status="detailPart.isActive ? 'active' : 'inactive'"
                :label="detailPart.isActive ? 'Đang hoạt động' : 'Đã vô hiệu'"
              />
            </div>
            <div class="col-span-2">
              <span class="text-ink-400 block text-[11px]">Tên linh kiện:</span>
              <span class="font-semibold text-sm text-ink-900">{{ detailPart.name }}</span>
            </div>
            <div>
              <span class="text-ink-400 block text-[11px]">Giá bán niêm yết:</span>
              <span class="font-bold text-brand-700 text-sm font-num">{{ formatPrice(Number(detailPart.sellingPrice)) }} đ</span>
            </div>
            <div>
              <span class="text-ink-400 block text-[11px]">Thời gian bảo hành:</span>
              <span class="font-semibold text-ink-800">{{ detailPart.warrantyDays != null ? `${detailPart.warrantyDays} ngày` : 'Không bảo hành' }}</span>
            </div>
          </div>

          <div v-if="detailPart.description" class="space-y-1">
            <span class="text-ink-500 font-medium block">Mô tả linh kiện:</span>
            <div class="p-2.5 bg-white border border-ink-200 rounded text-ink-700 whitespace-pre-line leading-relaxed">
              {{ detailPart.description }}
            </div>
          </div>

          <div v-if="detailPart.warrantyPolicy" class="space-y-1">
            <span class="text-ink-500 font-medium block">Chính sách bảo hành:</span>
            <div class="p-2.5 bg-ink-50 border border-ink-200 rounded text-ink-700 whitespace-pre-line leading-relaxed">
              {{ detailPart.warrantyPolicy }}
            </div>
          </div>

          <div class="flex items-center justify-between text-[11px] text-ink-400 pt-1 border-t border-ink-100">
            <span>Ngày tạo: {{ new Date(detailPart.createdAt).toLocaleDateString('vi-VN') }}</span>
            <span>Cập nhật: {{ new Date(detailPart.updatedAt).toLocaleDateString('vi-VN') }}</span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-ink-100">
          <button
            type="button"
            class="text-xs text-brand-600 hover:underline flex items-center gap-1 font-semibold"
            @click="detailPart = null; router.push('/console/part-requests')"
          >
            <History :size="13" /> Xem lịch sử yêu cầu của linh kiện này
          </button>
          <div class="flex gap-2">
            <FhButton variant="secondary" size="sm" @click="detailPart = null">Đóng</FhButton>
            <FhButton
              variant="primary"
              size="sm"
              @click="const p = detailPart; detailPart = null; if (p) openEdit(p)"
            >
              <Pencil :size="13" /> Chỉnh sửa
            </FhButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
