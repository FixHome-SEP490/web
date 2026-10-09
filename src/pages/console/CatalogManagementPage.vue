<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Plus } from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhMoney, FhConfirmDialog } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
import {
  catalogApi,
  type ServiceCategory,
  type ServiceItem,
} from '../../api/catalog.api';
import { userFacingError } from '../../utils/user-facing-error';

const activeTab = ref<'categories' | 'services'>('categories');
const loading = ref(true);
const error = ref('');
const loadError = ref('');
const formError = ref('');
const saving = ref(false);
const successMessage = ref('');

const categoryColumns: ConsoleColumn[] = [
  { key: 'sortOrder', label: 'Thứ tự', width: '72px' },
  { key: 'name', label: 'Danh mục' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];
const serviceColumns: ConsoleColumn[] = [
  { key: 'name', label: 'Dịch vụ' },
  { key: 'category', label: 'Danh mục', hideBelow: 'xl' },
  { key: 'priceRange', label: 'Giá công', align: 'right' },
  { key: 'duration', label: 'Thời lượng', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];

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
  loadError.value = '';
  try {
    const [cats, svcs] = await Promise.all([
      catalogApi.getAdminCategories(),
      catalogApi.getAdminServices({ limit: 100 }),
    ]);
    categories.value = cats;
    services.value = svcs.data;
  } catch (reason) {
    loadError.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadData();
});

const tabs = computed(() => [
  { key: 'categories' as const, label: 'Danh mục', count: loading.value ? null : categories.value.length },
  { key: 'services' as const, label: 'Dịch vụ', count: loading.value ? null : services.value.length },
]);

const filteredCategories = computed(() => {
  if (!searchQuery.value) return categories.value;
  const q = searchQuery.value.toLowerCase();
  return categories.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
});

const filteredServices = computed(() => {
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
  formError.value = '';
  showCategoryModal.value = true;
};

const openEditCategory = (cat: ServiceCategory) => {
  isEditingCategory.value = true;
  categoryForm.value = { ...cat };
  formError.value = '';
  showCategoryModal.value = true;
};

const saveCategory = async () => {
  if (!categoryForm.value.name || !categoryForm.value.code) {
    formError.value = 'Điền tên và mã danh mục.';
    return;
  }
  if (saving.value) return;
  saving.value = true;
  formError.value = '';
  successMessage.value = '';
  try {
    if (isEditingCategory.value && categoryForm.value.id) {
      await catalogApi.updateCategory(categoryForm.value.id, categoryForm.value);
    } else {
      await catalogApi.createCategory(categoryForm.value);
    }
    showCategoryModal.value = false;
    successMessage.value = 'Đã lưu danh mục.';
    await loadData();
  } catch (reason) {
    formError.value = userFacingError(reason, 'Chưa lưu được danh mục. Kiểm tra lại mã danh mục.');
  } finally {
    saving.value = false;
  }
};

const triggerToggleCategory = (cat: ServiceCategory) => {
  confirmTitle.value = cat.isActive ? 'Tạm dừng danh mục' : 'Kích hoạt danh mục';
  confirmMessage.value = `Bạn có chắc muốn ${cat.isActive ? 'tạm dừng' : 'kích hoạt'} danh mục "${cat.name}"?`;
  confirmSuccessMessage.value = `Đã ${cat.isActive ? 'tạm dừng' : 'kích hoạt'} danh mục.`;
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
  formError.value = '';
  showServiceModal.value = true;
};

const openEditService = (svc: ServiceItem) => {
  isEditingService.value = true;
  serviceForm.value = { ...svc };
  formError.value = '';
  showServiceModal.value = true;
};

const saveService = async () => {
  if (!serviceForm.value.name || !serviceForm.value.code || !serviceForm.value.categoryId) {
    formError.value = 'Chọn danh mục, điền tên và mã dịch vụ.';
    return;
  }
  if (saving.value) return;
  saving.value = true;
  formError.value = '';
  successMessage.value = '';
  try {
    if (isEditingService.value && serviceForm.value.id) {
      await catalogApi.updateService(serviceForm.value.id, serviceForm.value);
    } else {
      await catalogApi.createService(serviceForm.value);
    }
    showServiceModal.value = false;
    successMessage.value = 'Đã lưu dịch vụ.';
    await loadData();
  } catch (reason) {
    formError.value = userFacingError(reason, 'Chưa lưu được dịch vụ. Kiểm tra lại thông tin.');
  } finally {
    saving.value = false;
  }
};

const triggerToggleService = (svc: ServiceItem) => {
  confirmTitle.value = svc.isActive ? 'Tạm dừng dịch vụ' : 'Kích hoạt dịch vụ';
  confirmMessage.value = `Bạn có chắc muốn ${svc.isActive ? 'tạm dừng' : 'kích hoạt'} dịch vụ "${svc.name}"?`;
  confirmSuccessMessage.value = `Đã ${svc.isActive ? 'tạm dừng' : 'kích hoạt'} dịch vụ.`;
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
    error.value = userFacingError(reason, 'Chưa cập nhật được trạng thái, vui lòng thử lại.');
  } finally {
    confirmLoading.value = false;
  }
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Dịch vụ và bảng giá">
      <template #actions>
        <FhButton v-if="activeTab === 'categories'" variant="primary" size="sm" @click="openAddCategory">
          <Plus :size="16" aria-hidden="true" /> Thêm danh mục
        </FhButton>
        <FhButton v-else variant="primary" size="sm" :disabled="!categories.length" @click="openAddService">
          <Plus :size="16" aria-hidden="true" /> Thêm dịch vụ
        </FhButton>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadData">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <ConsoleTabs v-model="activeTab" :tabs="tabs" />

    <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm theo tên hoặc mã" label="Tìm trong danh mục" />
      <select v-if="activeTab === 'services'" v-model="selectedCategoryFilter" :class="consoleField" aria-label="Lọc theo danh mục">
        <option value="ALL">Tất cả danh mục</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
      </select>
    </div>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadData" />

    <!-- Categories -->
    <ConsoleTable
      v-else-if="activeTab === 'categories'"
      :columns="categoryColumns"
      :rows="filteredCategories"
      :loading="loading"
      empty-text="Chưa có danh mục."
    >
      <template #cell-sortOrder="{ row }">
        <span class="font-num text-ink-500">{{ row.sortOrder }}</span>
      </template>
      <template #cell-name="{ row }">
        <div class="font-medium text-ink-900">{{ row.name }}</div>
        <div class="line-clamp-1 max-w-96 text-xs text-ink-500" :title="row.description ?? undefined">{{ row.description }}</div>
      </template>
      <template #cell-status="{ row }">
        <FhStatusPill :status="row.isActive ? 'COMPLETED' : 'CANCELLED'" :label="row.isActive ? 'Hoạt động' : 'Tạm dừng'" />
      </template>
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="openEditCategory(row)">Sửa</FhButton>
          <ConsoleMoreMenu label="Thao tác khác với danh mục">
            <ConsoleMenuItem :danger="row.isActive" @click="triggerToggleCategory(row)">
              {{ row.isActive ? 'Tạm dừng danh mục' : 'Kích hoạt danh mục' }}
            </ConsoleMenuItem>
          </ConsoleMoreMenu>
        </div>
      </template>
    </ConsoleTable>

    <!-- Services -->
    <ConsoleTable
      v-else
      :columns="serviceColumns"
      :rows="filteredServices"
      :loading="loading"
      empty-text="Chưa có dịch vụ."
    >
      <template #cell-name="{ row }">
        <div class="font-medium text-ink-900">{{ row.name }}</div>
        <div class="line-clamp-1 max-w-80 text-xs text-ink-500" :title="row.description ?? undefined">{{ row.description }}</div>
      </template>
      <template #cell-category="{ row }">
        <span class="whitespace-nowrap text-ink-700">{{ row.category?.name || categories.find((c) => c.id === row.categoryId)?.name || '—' }}</span>
      </template>
      <template #cell-priceRange="{ row }">
        <span class="whitespace-nowrap">
          <FhMoney :amount="row.minPrice ?? row.basePrice ?? 0" />
          <span class="text-ink-400"> – </span>
          <FhMoney :amount="row.maxPrice ?? row.basePrice ?? 0" />
        </span>
      </template>
      <template #cell-duration="{ row }">
        <span class="whitespace-nowrap font-num text-ink-600">~{{ row.estimatedMinutes }}&nbsp;phút</span>
      </template>
      <template #cell-status="{ row }">
        <FhStatusPill :status="row.isActive ? 'COMPLETED' : 'CANCELLED'" :label="row.isActive ? 'Hoạt động' : 'Tạm dừng'" />
      </template>
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="openEditService(row)">Sửa</FhButton>
          <ConsoleMoreMenu label="Thao tác khác với dịch vụ">
            <ConsoleMenuItem :danger="row.isActive" @click="triggerToggleService(row)">
              {{ row.isActive ? 'Tạm dừng dịch vụ' : 'Kích hoạt dịch vụ' }}
            </ConsoleMenuItem>
          </ConsoleMoreMenu>
        </div>
      </template>
    </ConsoleTable>

    <!-- Category dialog -->
    <div
      v-if="showCategoryModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-form-title"
      @keydown.esc="showCategoryModal = false"
    >
      <form class="bg-white rounded-md max-w-lg w-full p-6 shadow-xl space-y-5" @submit.prevent="saveCategory">
        <h3 id="category-form-title" class="text-lg font-semibold text-ink-900">
          {{ isEditingCategory ? 'Sửa danh mục' : 'Thêm danh mục' }}
        </h3>

        <div class="space-y-4">
          <label :class="consoleLabel">
            Tên danh mục
            <input v-model="categoryForm.name" type="text" :class="consoleField" placeholder="Ví dụ: Điện lạnh" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label :class="consoleLabel">
              Mã (in hoa, không dấu)
              <input v-model="categoryForm.code" type="text" :disabled="isEditingCategory" :class="consoleField" class="disabled:bg-ink-100" placeholder="DIEN_LANH" />
            </label>
            <label :class="consoleLabel">
              Đường dẫn
              <input v-model="categoryForm.slug" type="text" :class="consoleField" placeholder="dien-lanh" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label :class="consoleLabel">
              Biểu tượng
              <input v-model="categoryForm.iconKey" type="text" :class="consoleField" placeholder="Snowflake" />
            </label>
            <label :class="consoleLabel">
              Thứ tự hiển thị
              <input v-model.number="categoryForm.sortOrder" type="number" :class="consoleField" class="font-num" />
            </label>
          </div>
          <label :class="consoleLabel">
            Mô tả ngắn
            <textarea v-model="categoryForm.description" rows="2" :class="consoleTextarea"></textarea>
          </label>
        </div>

        <p v-if="formError" class="text-sm text-danger-600" role="alert">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="showCategoryModal = false">Huỷ</FhButton>
          <FhButton type="submit" variant="primary" size="sm" :loading="saving">Lưu danh mục</FhButton>
        </div>
      </form>
    </div>

    <!-- Service dialog -->
    <div
      v-if="showServiceModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-form-title"
      @keydown.esc="showServiceModal = false"
    >
      <form class="bg-white rounded-md max-w-lg w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto" @submit.prevent="saveService">
        <h3 id="service-form-title" class="text-lg font-semibold text-ink-900">
          {{ isEditingService ? 'Sửa dịch vụ' : 'Thêm dịch vụ' }}
        </h3>

        <div class="space-y-4">
          <label :class="consoleLabel">
            Danh mục
            <select v-model="serviceForm.categoryId" :class="consoleField">
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label :class="consoleLabel">
            Tên dịch vụ
            <input v-model="serviceForm.name" type="text" :class="consoleField" placeholder="Ví dụ: Vệ sinh máy lạnh treo tường" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label :class="consoleLabel">
              Mã (in hoa, không dấu)
              <input v-model="serviceForm.code" type="text" :disabled="isEditingService" :class="consoleField" class="disabled:bg-ink-100" placeholder="VE_SINH_ML" />
            </label>
            <label :class="consoleLabel">
              Đường dẫn
              <input v-model="serviceForm.slug" type="text" :class="consoleField" placeholder="ve-sinh-may-lanh" />
            </label>
          </div>

          <label :class="consoleLabel">
            Cách tính giá
            <select v-model="serviceForm.pricingMode" :class="consoleField">
              <option value="inspection_required">Khảo sát rồi báo giá tại chỗ</option>
              <option value="fixed_price">Giá trọn gói</option>
            </select>
            <span class="text-xs font-normal text-ink-500">
              {{ serviceForm.pricingMode === 'fixed_price' ? 'Khách thấy giá ngay khi đặt, thợ không lập báo giá.' : 'Thợ khảo sát rồi lập báo giá công và vật tư để khách duyệt.' }}
            </span>
          </label>

          <div v-if="serviceForm.pricingMode === 'fixed_price'" class="grid grid-cols-2 gap-3">
            <label :class="consoleLabel">
              Giá trọn gói (₫)
              <input v-model.number="serviceForm.fixedPrice" type="number" step="10000" inputmode="numeric" :class="consoleField" class="font-num" placeholder="180000" />
            </label>
            <label :class="consoleLabel">
              Đơn vị tính
              <input v-model="serviceForm.unit" type="text" :class="consoleField" placeholder="chiếc, máy, bộ" />
            </label>
            <label :class="consoleLabel" class="col-span-2">
              Phạm vi công việc
              <textarea v-model="serviceForm.scopeDescription" rows="2" :class="consoleTextarea" placeholder="Ví dụ: vệ sinh lưới lọc, xịt rửa dàn lạnh, kiểm tra gas"></textarea>
            </label>
          </div>

          <div v-if="serviceForm.pricingMode === 'inspection_required'" class="grid grid-cols-3 gap-3">
            <label :class="consoleLabel">
              Giá thấp nhất (₫)
              <input v-model.number="serviceForm.minPrice" type="number" step="10000" inputmode="numeric" :class="consoleField" class="font-num" />
            </label>
            <label :class="consoleLabel">
              Giá cao nhất (₫)
              <input v-model.number="serviceForm.maxPrice" type="number" step="10000" inputmode="numeric" :class="consoleField" class="font-num" />
            </label>
            <label :class="consoleLabel">
              Thời lượng (phút)
              <input v-model.number="serviceForm.estimatedMinutes" type="number" inputmode="numeric" :class="consoleField" class="font-num" />
            </label>
          </div>

          <label :class="consoleLabel">
            Mô tả công việc
            <textarea v-model="serviceForm.description" rows="2" :class="consoleTextarea"></textarea>
          </label>
        </div>

        <p v-if="formError" class="text-sm text-danger-600" role="alert">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="showServiceModal = false">Huỷ</FhButton>
          <FhButton type="submit" variant="primary" size="sm" :loading="saving">Lưu dịch vụ</FhButton>
        </div>
      </form>
    </div>

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
