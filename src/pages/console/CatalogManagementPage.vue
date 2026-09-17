<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Plus, Edit2, Power, FolderKanban, Wrench } from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhTable,
  FhStatusPill,
  FhMoney,
  FhConfirmDialog,
  FhSkeleton,
} from '../../components';
import {
  catalogApi,
  type ServiceCategory,
  type ServiceItem,
} from '../../api/catalog.api';

const activeTab = ref<'categories' | 'services'>('categories');
const loading = ref(true);
const error = ref('');
const successMessage = ref('');

const categories = ref<ServiceCategory[]>([]);
const services = ref<ServiceItem[]>([]);

// Filter & Search
const searchQuery = ref('');
const selectedCategoryFilter = ref('ALL');

// Modals
const showCategoryModal = ref(false);
const showServiceModal = ref(false);
const showConfirmModal = ref(false);
const confirmLoading = ref(false);
const confirmAction = ref<(() => Promise<void>) | null>(null);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmSuccessMessage = ref('');

// Category Form
const categoryForm = ref<Partial<ServiceCategory>>({
  name: '',
  code: '',
  slug: '',
  iconKey: '',
  sortOrder: 0,
  description: '',
  isActive: true,
});
const isEditingCategory = ref(false);

// Service Form
const serviceForm = ref<Partial<ServiceItem>>({
  categoryId: '',
  name: '',
  code: '',
  basePrice: 150000,
  minPrice: 100000,
  maxPrice: 500000,
  pricingMode: 'inspection_required' as 'inspection_required' | 'fixed_price',
  unit: 'máy',
  fixedPrice: 150000,
  scopeDescription: '',
  estimatedMinutes: 60,
  description: '',
  isActive: true,
});
const isEditingService = ref(false);

const loadData = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [cats, svcs] = await Promise.all([
      catalogApi.getAdminCategories(),
      catalogApi.getAdminServices({ limit: 100 }),
    ]);
    categories.value = cats;
    services.value = svcs.data;
  } catch (reason) {
    if (typeof reason === 'object' && reason !== null && 'response' in reason) {
      const response = (reason as { response?: { data?: { message?: unknown } } }).response;
      error.value = typeof response?.data?.message === 'string'
        ? response.data.message
        : 'Không thể tải danh mục từ Backend.';
    } else {
      error.value = 'Không thể tải danh mục từ Backend.';
    }
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadData();
});

// Filtered Lists
const isSkeleton = (row: unknown): boolean => !!(row as Record<string, unknown>)._isSkeleton;

const filteredCategories = computed<(ServiceCategory & { _isSkeleton?: boolean })[]>(() => {
  if (loading.value) {
    return Array.from({ length: 5 }).map((_, i) => ({
      id: `skeleton-cat-${i}`,
      _isSkeleton: true,
      name: '',
      code: '',
      slug: '',
      iconKey: '',
      sortOrder: i + 1,
      description: '',
      isActive: true,
    } as unknown as ServiceCategory & { _isSkeleton: boolean }));
  }
  if (!searchQuery.value) return categories.value;
  const q = searchQuery.value.toLowerCase();
  return categories.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
});

const filteredServices = computed<(ServiceItem & { _isSkeleton?: boolean })[]>(() => {
  if (loading.value) {
    return Array.from({ length: 5 }).map((_, i) => ({
      id: `skeleton-svc-${i}`,
      _isSkeleton: true,
      categoryId: '',
      name: '',
      code: '',
      slug: '',
      basePrice: 0,
      minPrice: 0,
      maxPrice: 0,
      pricingMode: 'inspection_required',
      unit: '',
      fixedPrice: 0,
      scopeDescription: '',
      estimatedMinutes: 0,
      description: '',
      isActive: true,
    } as unknown as ServiceItem & { _isSkeleton: boolean }));
  }
  return services.value.filter((s) => {
    const matchCat =
      selectedCategoryFilter.value === 'ALL' ||
      s.categoryId === selectedCategoryFilter.value;
    const matchSearch =
      !searchQuery.value ||
      s.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchCat && matchSearch;
  });
});

// Category Actions
const openAddCategory = () => {
  isEditingCategory.value = false;
  categoryForm.value = {
    name: '',
    code: '',
    slug: '',
    iconKey: 'Wrench',
    sortOrder: categories.value.length + 1,
    description: '',
    isActive: true,
  };
  showCategoryModal.value = true;
};

const openEditCategory = (cat: ServiceCategory) => {
  isEditingCategory.value = true;
  categoryForm.value = { ...cat };
  showCategoryModal.value = true;
};

const saveCategory = async () => {
  if (!categoryForm.value.name || !categoryForm.value.code) {
    error.value = 'Tên và mã danh mục là bắt buộc.';
    return;
  }
  error.value = '';
  successMessage.value = '';
  try {
    if (isEditingCategory.value && categoryForm.value.id) {
      await catalogApi.updateCategory(categoryForm.value.id, categoryForm.value);
    } else {
      await catalogApi.createCategory(categoryForm.value);
    }
    showCategoryModal.value = false;
    successMessage.value = 'Đã lưu danh mục từ Backend.';
    await loadData();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Không thể lưu danh mục. Vui lòng kiểm tra mã hoặc quyền truy cập.';
  }
};

const triggerToggleCategory = (cat: ServiceCategory) => {
  confirmTitle.value = cat.isActive ? 'Tạm dừng danh mục' : 'Kích hoạt danh mục';
  confirmMessage.value = `Bạn có chắc muốn ${cat.isActive ? 'tạm dừng' : 'kích hoạt'} danh mục "${cat.name}"?`;
  confirmSuccessMessage.value = `Đã ${cat.isActive ? 'tạm dừng' : 'kích hoạt'} danh mục từ Backend.`;
  confirmAction.value = async () => {
    await catalogApi.toggleCategoryStatus(cat.id, !cat.isActive);
    await loadData();
  };
  showConfirmModal.value = true;
};

// Service Actions
const openAddService = () => {
  isEditingService.value = false;
  serviceForm.value = {
    categoryId: categories.value[0]?.id ?? '',
    name: '',
    slug: '',
    basePrice: 150000,
    minPrice: 100000,
    maxPrice: 500000,
    pricingMode: 'inspection_required',
    unit: 'máy',
    fixedPrice: 150000,
    scopeDescription: '',
    estimatedMinutes: 60,
    description: '',
    isActive: true,
  };
  showServiceModal.value = true;
};

const openEditService = (svc: ServiceItem) => {
  isEditingService.value = true;
  serviceForm.value = { ...svc };
  showServiceModal.value = true;
};

const saveService = async () => {
  if (!serviceForm.value.name || !serviceForm.value.code || !serviceForm.value.categoryId) {
    error.value = 'Danh mục, tên và mã dịch vụ là bắt buộc.';
    return;
  }
  error.value = '';
  successMessage.value = '';
  try {
    if (isEditingService.value && serviceForm.value.id) {
      await catalogApi.updateService(serviceForm.value.id, serviceForm.value);
    } else {
      await catalogApi.createService(serviceForm.value);
    }
    showServiceModal.value = false;
    successMessage.value = 'Đã lưu dịch vụ từ Backend.';
    await loadData();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Không thể lưu dịch vụ. Vui lòng kiểm tra dữ liệu.';
  }
};

const triggerToggleService = (svc: ServiceItem) => {
  confirmTitle.value = svc.isActive ? 'Tạm dừng dịch vụ' : 'Kích hoạt dịch vụ';
  confirmMessage.value = `Bạn có chắc muốn ${svc.isActive ? 'tạm dừng' : 'kích hoạt'} dịch vụ "${svc.name}"?`;
  confirmSuccessMessage.value = `Đã ${svc.isActive ? 'tạm dừng' : 'kích hoạt'} dịch vụ từ Backend.`;
  confirmAction.value = async () => {
    await catalogApi.toggleServiceStatus(svc.id, !svc.isActive);
    await loadData();
  };
  showConfirmModal.value = true;
};

const handleConfirm = async () => {
  if (!confirmAction.value || confirmLoading.value) return;
  confirmLoading.value = true;
  error.value = '';
  try {
    await confirmAction.value();
    successMessage.value = confirmSuccessMessage.value;
    showConfirmModal.value = false;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Không thể cập nhật trạng thái.';
  } finally {
    confirmLoading.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight">
          Quản lý Danh mục & Bảng giá Dịch vụ
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Thiết lập danh mục phân loại, chuẩn hóa mã dịch vụ và khoảng giá công thợ theo quy chuẩn FixHome.
        </p>
      </div>

    </div>

    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-sm border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadData">Thử lại</button>
    </div>
    <div
      v-if="successMessage"
      class="rounded-sm border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800"
      role="status"
    >
      {{ successMessage }}
    </div>

    <!-- Tab Bar -->
    <div class="flex items-center gap-2 border-b border-ink-200">
      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px"
        :class="[
          activeTab === 'categories'
            ? 'border-brand-600 text-brand-700'
            : 'border-transparent text-ink-500 hover:text-ink-800',
        ]"
        @click="activeTab = 'categories'"
      >
        <FolderKanban :size="16" />
        <span>Danh mục dịch vụ ({{ categories.length }})</span>
      </button>

      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px"
        :class="[
          activeTab === 'services'
            ? 'border-brand-600 text-brand-700'
            : 'border-transparent text-ink-500 hover:text-ink-800',
        ]"
        @click="activeTab = 'services'"
      >
        <Wrench :size="16" />
        <span>Dịch vụ kỹ thuật ({{ services.length }})</span>
      </button>
    </div>


    <!-- Tab 1: Categories Table -->
    <FhCard v-if="activeTab === 'categories'">
      <FhTable
        :columns="[
          { key: 'sortOrder', label: 'STT', width: '60px' },
          { key: 'name', label: 'Tên danh mục' },
          { key: 'code', label: 'Mã (Code)' },
          { key: 'slug', label: 'Slug' },
          { key: 'status', label: 'Trạng thái', width: '120px' },
          { key: 'actions', label: 'Thao tác', width: '140px' },
        ]"
        :rows="filteredCategories"
        searchable
        v-model:searchQuery="searchQuery"
        search-placeholder="Tìm theo tên hoặc mã code..."
        :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Chưa có danh mục.'"
      >
        <template #toolbar>
          <FhButton variant="primary" size="sm" @click="openAddCategory">
            <Plus :size="16" class="mr-1.5" /> Thêm danh mục
          </FhButton>
          <button @click="loadData" class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors mr-2" title="Làm mới">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          </button>
        </template>

        <template #cell-sortOrder="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="20px" height="16px" />
          <span v-else class="font-num font-semibold text-xs text-ink-500">{{ row.sortOrder }}</span>
        </template>

        <template #cell-name="{ row }">
          <div v-if="isSkeleton(row)">
            <FhSkeleton width="120px" height="16px" class="mb-1" />
            <FhSkeleton width="180px" height="12px" />
          </div>
          <div v-else>
            <div class="font-semibold text-ink-900">{{ row.name }}</div>
            <div class="text-[11px] text-ink-400 line-clamp-1">{{ row.description }}</div>
          </div>
        </template>

        <template #cell-code="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="80px" height="16px" />
          <code v-else class="text-xs px-2 py-0.5 rounded bg-ink-100 text-ink-700 font-mono">{{ row.code }}</code>
        </template>

        <template #cell-slug="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="80px" height="16px" />
          <span v-else class="text-xs text-ink-500 font-mono">{{ row.slug || '—' }}</span>
        </template>

        <template #cell-status="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="70px" height="16px" />
          <FhStatusPill v-else :status="row.isActive ? 'COMPLETED' : 'CANCELLED'" :label="row.isActive ? 'Hoạt động' : 'Tạm dừng'" />
        </template>

        <template #cell-actions="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="40px" height="16px" />
          <div v-else class="flex items-center gap-1.5">
            <button
              class="p-1.5 text-ink-500 hover:text-brand-600 rounded hover:bg-ink-100 transition-colors"
              title="Chỉnh sửa"
              @click="openEditCategory(row)"
            >
              <Edit2 :size="15" />
            </button>
            <button
              class="p-1.5 rounded transition-colors"
              :class="row.isActive ? 'text-danger-500 hover:bg-danger-50' : 'text-success-600 hover:bg-success-50'"
              :title="row.isActive ? 'Tạm dừng' : 'Kích hoạt'"
              @click="triggerToggleCategory(row)"
            >
              <Power :size="15" />
            </button>
          </div>
        </template>
      </FhTable>
    </FhCard>

    <!-- Tab 2: Services Table -->
    <FhCard v-if="activeTab === 'services'">
      <FhTable
        :columns="[
          { key: 'name', label: 'Tên dịch vụ' },
          { key: 'category', label: 'Danh mục' },
          { key: 'code', label: 'Mã' },
          { key: 'priceRange', label: 'Khoảng giá công' },
          { key: 'duration', label: 'Ước tính', width: '100px' },
          { key: 'status', label: 'Trạng thái', width: '110px' },
          { key: 'actions', label: 'Thao tác', width: '130px' },
        ]"
        :rows="filteredServices"
        searchable
        v-model:searchQuery="searchQuery"
        search-placeholder="Tìm theo tên hoặc mã code..."
        :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Chưa có dịch vụ.'"
      >
        <template #toolbar>
          <div class="flex items-center gap-2">
            <span class="text-xs text-ink-500">Lọc danh mục:</span>
            <select
              v-model="selectedCategoryFilter"
              class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-sm text-ink-700 focus:outline-none focus:border-brand-600"
            >
              <option value="ALL">Tất cả danh mục</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <FhButton variant="primary" size="sm" @click="openAddService">
            <Plus :size="16" class="mr-1.5" /> Thêm dịch vụ
          </FhButton>
          <button @click="loadData" class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors mr-2" title="Làm mới">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          </button>
        </template>

        <template #cell-name="{ row }">
          <div v-if="isSkeleton(row)">
            <FhSkeleton width="120px" height="16px" class="mb-1" />
            <FhSkeleton width="180px" height="12px" />
          </div>
          <div v-else>
            <div class="font-semibold text-ink-900">{{ row.name }}</div>
            <div class="text-[11px] text-ink-400 line-clamp-1">{{ row.description }}</div>
          </div>
        </template>

        <template #cell-category="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="80px" height="16px" />
          <span v-else class="text-xs font-medium text-ink-700">
            {{ row.category?.name || categories.find((c) => c.id === row.categoryId)?.name || '—' }}
          </span>
        </template>

        <template #cell-code="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="80px" height="16px" />
          <code v-else class="text-xs px-1.5 py-0.5 rounded bg-ink-100 text-ink-700 font-mono">{{ row.code }}</code>
        </template>

        <template #cell-priceRange="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="16px" />
          <div v-else class="text-xs font-bold font-num text-brand-700">
            <FhMoney :amount="row.minPrice ?? row.basePrice ?? 0" />
            –
            <FhMoney :amount="row.maxPrice ?? row.basePrice ?? 0" />
          </div>
        </template>

        <template #cell-duration="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="40px" height="16px" />
          <span v-else class="text-xs text-ink-600 font-num">~{{ row.estimatedMinutes }}p</span>
        </template>

        <template #cell-status="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="70px" height="16px" />
          <FhStatusPill v-else :status="row.isActive ? 'COMPLETED' : 'CANCELLED'" :label="row.isActive ? 'Hoạt động' : 'Tạm dừng'" />
        </template>

        <template #cell-actions="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="40px" height="16px" />
          <div v-else class="flex items-center gap-1.5">
            <button
              class="p-1.5 text-ink-500 hover:text-brand-600 rounded hover:bg-ink-100 transition-colors"
              title="Chỉnh sửa"
              @click="openEditService(row)"
            >
              <Edit2 :size="15" />
            </button>
            <button
              class="p-1.5 rounded transition-colors"
              :class="row.isActive ? 'text-danger-500 hover:bg-danger-50' : 'text-success-600 hover:bg-success-50'"
              :title="row.isActive ? 'Tạm dừng' : 'Kích hoạt'"
              @click="triggerToggleService(row)"
            >
              <Power :size="15" />
            </button>
          </div>
        </template>
      </FhTable>
    </FhCard>

    <!-- Modal: Category Edit/Create -->
    <div
      v-if="showCategoryModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-md max-w-lg w-full p-6 shadow-xl space-y-5">
        <h3 class="text-lg font-bold text-ink-900">
          {{ isEditingCategory ? 'Chỉnh sửa Danh mục' : 'Thêm Danh mục Mới' }}
        </h3>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-semibold text-ink-700 mb-1">Tên danh mục *</label>
            <input
              v-model="categoryForm.name"
              type="text"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
              placeholder="Ví dụ: Điện lạnh"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Mã Code (viết hoa) *</label>
              <input
                v-model="categoryForm.code"
                type="text"
                :disabled="isEditingCategory"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 disabled:bg-ink-100 font-mono"
                placeholder="DIEN_LANH"
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Slug URL</label>
              <input
                v-model="categoryForm.slug"
                type="text"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-mono"
                placeholder="dien-lanh"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Icon Key</label>
              <input
                v-model="categoryForm.iconKey"
                type="text"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
                placeholder="Snowflake, Zap, Lock..."
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Thứ tự hiển thị</label>
              <input
                v-model.number="categoryForm.sortOrder"
                type="number"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num"
              />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-ink-700 mb-1">Mô tả ngắn</label>
            <textarea
              v-model="categoryForm.description"
              rows="2"
              class="w-full p-2.5 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
              placeholder="Mô tả về nhóm dịch vụ..."
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showCategoryModal = false">
            Huỷ bỏ
          </FhButton>
          <FhButton variant="primary" size="sm" @click="saveCategory">
            Lưu danh mục
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Modal: Service Edit/Create -->
    <div
      v-if="showServiceModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-md max-w-lg w-full p-6 shadow-xl space-y-5">
        <h3 class="text-lg font-bold text-ink-900">
          {{ isEditingService ? 'Chỉnh sửa Dịch vụ' : 'Thêm Dịch vụ Mới' }}
        </h3>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-semibold text-ink-700 mb-1">Thuộc danh mục *</label>
            <select
              v-model="serviceForm.categoryId"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
            >
              <option v-for="c in categories" :key="c.id" :value="c.id">
                {{ c.name }} ({{ c.code }})
              </option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-ink-700 mb-1">Tên dịch vụ *</label>
            <input
              v-model="serviceForm.name"
              type="text"
              class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
              placeholder="Ví dụ: Vệ sinh máy lạnh treo tường"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Mã Code (viết hoa) *</label>
              <input
                v-model="serviceForm.code"
                type="text"
                :disabled="isEditingService"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 disabled:bg-ink-100 font-mono"
                placeholder="VE_SINH_ML"
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Slug URL</label>
              <input
                v-model="serviceForm.slug"
                type="text"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-mono"
                placeholder="ve-sinh-may-lanh"
              />
            </div>
          </div>

          <!-- Spec v1.2 Dual Pricing Mode -->
          <div class="p-3 bg-brand-50/50 rounded border border-brand-200 space-y-3">
            <div>
              <label class="block font-semibold text-brand-900 mb-1">Mô hình Định giá (Spec v1.2) *</label>
              <select
                v-model="serviceForm.pricingMode"
                class="w-full h-9 px-3 bg-white border border-brand-300 rounded focus:outline-none focus:border-brand-600 font-semibold text-xs"
              >
                <option value="inspection_required">1. Khảo sát báo giá tại chỗ (Inspection Required)</option>
                <option value="fixed_price">2. Trọn gói chuẩn hoá (Fixed Price Package)</option>
              </select>
              <p class="text-[10px] text-ink-500 mt-1">
                {{ serviceForm.pricingMode === 'fixed_price' ? 'Khách hàng thấy giá cố định ngay khi đặt, không cần thợ lập báo giá khảo sát.' : 'Thợ đến khảo sát thực tế, lập báo giá phân tách công & vật tư để khách duyệt.' }}
              </p>
            </div>

            <div v-if="serviceForm.pricingMode === 'fixed_price'" class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block font-semibold text-ink-700 mb-1">Giá trọn gói cố định (VNĐ) *</label>
                <input
                  v-model.number="serviceForm.fixedPrice"
                  type="number"
                  step="10000"
                  class="w-full h-8 px-2.5 bg-white border border-ink-200 rounded font-num font-bold text-xs"
                  placeholder="VD: 180000"
                />
              </div>
              <div>
                <label class="block font-semibold text-ink-700 mb-1">Đơn vị tính (Unit) *</label>
                <input
                  v-model="serviceForm.unit"
                  type="text"
                  class="w-full h-8 px-2.5 bg-white border border-ink-200 rounded text-xs"
                  placeholder="VD: chiếc, máy, bộ, m2"
                />
              </div>
              <div class="col-span-2">
                <label class="block font-semibold text-ink-700 mb-1">Phạm vi công việc chuẩn (Scope Description)</label>
                <textarea
                  v-model="serviceForm.scopeDescription"
                  rows="2"
                  class="w-full p-2 bg-white border border-ink-200 rounded text-xs"
                  placeholder="Ghi rõ phạm vi gói (VD: Vệ sinh lưới lọc, xịt rửa dàn lạnh, kiểm tra gas)"
                ></textarea>
              </div>
            </div>
          </div>

          <div v-if="serviceForm.pricingMode === 'inspection_required'" class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Giá tối thiểu (VNĐ)</label>
              <input
                v-model.number="serviceForm.minPrice"
                type="number"
                step="10000"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num"
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Giá tối đa (VNĐ)</label>
              <input
                v-model.number="serviceForm.maxPrice"
                type="number"
                step="10000"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num"
              />
            </div>
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Thời lượng (phút)</label>
              <input
                v-model.number="serviceForm.estimatedMinutes"
                type="number"
                class="w-full h-9 px-3 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600 font-num"
              />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-ink-700 mb-1">Mô tả chi tiết công việc</label>
            <textarea
              v-model="serviceForm.description"
              rows="2"
              class="w-full p-2.5 bg-white border border-ink-200 rounded-sm focus:outline-none focus:border-brand-600"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showServiceModal = false">
            Huỷ bỏ
          </FhButton>
          <FhButton variant="primary" size="sm" @click="saveService">
            Lưu dịch vụ
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Confirm Dialog -->
    <FhConfirmDialog
      :open="showConfirmModal"
      :title="confirmTitle"
      :consequence="confirmMessage"
      :loading="confirmLoading"
      confirm-text="Xác nhận"
      cancel-text="Huỷ"
      @confirm="handleConfirm"
      @cancel="showConfirmModal = false"
    />
  </div>
</template>
