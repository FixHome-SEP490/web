<script setup lang="ts">
import { foldForSearch } from '../../utils/formatters';
import { ref, onMounted, computed, watch } from 'vue';
import { Plus, RotateCcw, X } from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhConfirmDialog } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { consoleField, consoleLabel } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import { serviceAreasApi, type ServiceArea } from '../../api/service-areas.api';
import { vietnamProvincesApi } from '../../api/vietnam-provinces.api';
import { slicePage } from '../../api/paging';
import { useQueryPage } from '../../composables/useQueryState';

interface ProvinceOption {
  code: string;
  name: string;
}

const DEFAULT_PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '79', name: 'TP. Hồ Chí Minh' },
  { code: '48', name: 'Đà Nẵng' },
];

const loading = ref(true);
const loadError = ref(false);
const serviceAreas = ref<ServiceArea[]>([]);
const loadedProvinces = ref<ProvinceOption[]>([]);
const formError = ref('');
const actionError = ref('');
const saving = ref(false);

const columns: ConsoleColumn[] = [
  { key: 'districtName', label: 'Quận, huyện' },
  { key: 'province', label: 'Tỉnh, thành phố' },
  { key: 'districtCode', label: 'Mã', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

// Filters
const selectedProvince = ref('ALL');
const searchQuery = ref('');

// Modals
const showModal = ref(false);
const isEditing = ref(false);
const areaForm = ref<Partial<ServiceArea>>({
  provinceCode: '01',
  provinceName: 'Hà Nội',
  districtCode: '',
  districtName: '',
  isActive: true,
});

const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref<(() => Promise<void>) | null>(null);

const loadAreas = async () => {
  loading.value = true;
  loadError.value = false;
  try {
    serviceAreas.value = await serviceAreasApi.getServiceAreas();
  } catch {
    // Real data only (PO 07/10/2026): a failed load says so and offers a retry.
    serviceAreas.value = [];
    loadError.value = true;
  } finally {
    loading.value = false;
  }
};

const loadProvinces = async () => {
  try {
    const items = await vietnamProvincesApi.getProvinces(1);
    if (!Array.isArray(items) || items.length === 0) return;
    loadedProvinces.value = items
      .map((item) => ({
        code: String(item.code ?? '').trim().padStart(2, '0'),
        name: String(item.name ?? '').trim(),
      }))
      .filter((item) => item.code && item.name);
  } catch {
    // Fallback to DEFAULT_PROVINCES and existing service areas
  }
};

onMounted(() => {
  loadAreas();
  void loadProvinces();
});

const provinceOptions = computed<ProvinceOption[]>(() => {
  const byCode = new Map<string, ProvinceOption>();
  for (const item of DEFAULT_PROVINCES) {
    byCode.set(item.code, item);
  }
  for (const item of loadedProvinces.value) {
    if (!byCode.has(item.code)) {
      byCode.set(item.code, item);
    }
  }
  for (const area of serviceAreas.value) {
    const code = area.provinceCode?.trim();
    const name = area.provinceName?.trim();
    if (code && name && !byCode.has(code)) {
      byCode.set(code, { code, name });
    }
  }
  const currentCode = areaForm.value.provinceCode?.trim();
  const currentName = areaForm.value.provinceName?.trim();
  if (currentCode && currentName && !byCode.has(currentCode)) {
    byCode.set(currentCode, { code: currentCode, name: currentName });
  }
  return Array.from(byCode.values());
});

const filteredAreas = computed(() => {
  return serviceAreas.value.filter((area) => {
    const matchProvince =
      selectedProvince.value === 'ALL' ||
      area.provinceCode === selectedProvince.value;
    const matchSearch =
      !searchQuery.value ||
      [area.districtName, area.districtCode, area.provinceName].some((text) => foldForSearch(text).includes(foldForSearch(searchQuery.value.trim())));
    return matchProvince && matchSearch;
  });
});

// The endpoint returns every area (a short admin list), so it is paged here.
const PAGE_SIZE = 20;
const page = useQueryPage();
const areaPage = computed(() => slicePage(filteredAreas.value, page.value, PAGE_SIZE));
watch([selectedProvince, searchQuery], () => {
  page.value = 1;
});

const openAddArea = () => {
  isEditing.value = false;
  formError.value = '';
  areaForm.value = {
    provinceCode: '01',
    provinceName: 'Hà Nội',
    districtCode: '',
    districtName: '',
    isActive: true,
  };
  showModal.value = true;
};

const openEditArea = (area: ServiceArea) => {
  isEditing.value = true;
  formError.value = '';
  areaForm.value = { ...area };
  showModal.value = true;
};

const onProvinceChange = () => {
  const matched = provinceOptions.value.find((prov) => prov.code === areaForm.value.provinceCode);
  if (matched) {
    areaForm.value.provinceName = matched.name;
  }
};

const saveArea = async () => {
  if (!areaForm.value.provinceCode?.trim() || !areaForm.value.districtCode?.trim() || !areaForm.value.districtName?.trim()) {
    formError.value = 'Điền đủ tỉnh, mã và tên quận, huyện.';
    return;
  }
  if (saving.value) return;
  saving.value = true;
  formError.value = '';
  try {
    if (isEditing.value && areaForm.value.id) {
      await serviceAreasApi.updateServiceArea(areaForm.value.id, areaForm.value);
    } else {
      await serviceAreasApi.createServiceArea({
        provinceCode: areaForm.value.provinceCode!,
        provinceName: areaForm.value.provinceName || 'Hà Nội',
        districtCode: areaForm.value.districtCode!,
        districtName: areaForm.value.districtName!,
        isActive: areaForm.value.isActive ?? true,
      });
    }
    showModal.value = false;
    await loadAreas();
  } catch (err) {
    formError.value = userFacingError(err, 'Chưa lưu được khu vực. Kiểm tra lại mã quận, huyện.');
  } finally {
    saving.value = false;
  }
};

const triggerToggle = (area: ServiceArea) => {
  confirmTitle.value = area.isActive ? 'Tạm dừng khu vực' : 'Mở lại khu vực';
  confirmMessage.value = `Bạn có chắc muốn ${area.isActive ? 'tạm dừng' : 'mở lại'} tiếp nhận đơn tại "${area.districtName}, ${area.provinceName}"?`;
  confirmAction.value = async () => {
    try {
      await serviceAreasApi.toggleStatus(area.id, !area.isActive);
      await loadAreas();
    } catch (err) {
      actionError.value = userFacingError(err, 'Chưa đổi được trạng thái khu vực, vui lòng thử lại.');
    }
  };
  showConfirmModal.value = true;
};

const hasFilters = computed(() => Boolean(searchQuery.value.trim()) || selectedProvince.value !== 'ALL');
const resetFilters = () => {
  searchQuery.value = '';
  selectedProvince.value = 'ALL';
};

const handleConfirm = async () => {
  actionError.value = '';
  if (confirmAction.value) {
    await confirmAction.value();
  }
  showConfirmModal.value = false;
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Khu vực phục vụ" :count="loading || loadError ? null : filteredAreas.length">
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openAddArea">
          <Plus :size="16" aria-hidden="true" /> Thêm khu vực
        </FhButton>
      </template>
    </ConsolePageHeader>

    <div class="animate-slide-up-delay-1 flex flex-wrap items-center gap-2.5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-3 shadow-(--shadow-e1)">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm quận, huyện hoặc mã" label="Tìm khu vực" />
      <select v-model="selectedProvince" :class="consoleField" aria-label="Tỉnh, thành phố">
        <option value="ALL">Tất cả tỉnh, thành</option>
        <option v-for="prov in provinceOptions" :key="prov.code" :value="prov.code">{{ prov.name }}</option>
      </select>
      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
        @click="resetFilters"
      >
        <RotateCcw :size="14" aria-hidden="true" />
        Đặt lại
      </button>
    </div>

    <Transition name="fh-fade-slide">
      <p v-if="actionError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-2.5 text-sm text-danger-800" role="alert">{{ actionError }}</p>
    </Transition>

    <div class="animate-slide-up-delay-2 space-y-5">
      <ConsoleLoadError v-if="loadError" @retry="loadAreas" />
      <ConsoleTable
        v-else
        :columns="columns"
        :rows="areaPage.items"
        :loading="loading"
        empty-text="Không có khu vực nào phù hợp."
      >
        <template #cell-districtName="{ row }">
          <span class="font-medium text-ink-900">{{ row.districtName }}</span>
        </template>
        <template #cell-province="{ row }">
          <span class="whitespace-nowrap text-ink-700">{{ row.provinceName }}</span>
        </template>
        <template #cell-districtCode="{ row }">
          <span class="font-num text-ink-600">{{ row.districtCode }}</span>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill
            :status="row.isActive ? 'COMPLETED' : 'CANCELLED'"
            :label="row.isActive ? 'Đang phục vụ' : 'Tạm dừng'"
          />
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-2">
            <FhButton variant="secondary" size="sm" @click="openEditArea(row)">Sửa</FhButton>
            <ConsoleMoreMenu label="Thao tác khác với khu vực">
              <ConsoleMenuItem :danger="row.isActive" @click="triggerToggle(row)">
                {{ row.isActive ? 'Tạm dừng khu vực' : 'Mở lại khu vực' }}
              </ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </template>
      </ConsoleTable>
      <ConsolePagination v-if="!loadError" v-model:page="page" :total="areaPage.total" :page-size="PAGE_SIZE" />
    </div>

    <!-- Add / edit dialog -->
    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="showModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="area-form-title"
          @click.self="showModal = false"
          @keydown.esc="showModal = false"
        >
          <form class="fh-modal-panel flex w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-white shadow-(--shadow-e3)" @submit.prevent="saveArea">
            <div class="flex items-center justify-between border-b border-ink-200 bg-ink-25/60 px-6 py-4">
              <h3 id="area-form-title" class="text-base font-semibold text-ink-900">
                {{ isEditing ? 'Sửa khu vực' : 'Thêm khu vực' }}
              </h3>
              <button type="button" class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="showModal = false">
                <X :size="18" aria-hidden="true" />
              </button>
            </div>

            <div class="space-y-4 px-6 py-5">
              <label :class="consoleLabel">
                Tỉnh, thành phố
                <select v-model="areaForm.provinceCode" :class="consoleField" @change="onProvinceChange">
                  <option v-for="prov in provinceOptions" :key="prov.code" :value="prov.code">{{ prov.name }}</option>
                </select>
              </label>
              <label :class="consoleLabel">
                Mã quận, huyện
                <input
                  v-model="areaForm.districtCode"
                  type="text"
                  :disabled="isEditing"
                  :class="consoleField"
                  class="font-num disabled:bg-ink-100"
                  placeholder="Ví dụ: 760"
                />
              </label>
              <label :class="consoleLabel">
                Tên quận, huyện
                <input
                  v-model="areaForm.districtName"
                  type="text"
                  :class="consoleField"
                  placeholder="Ví dụ: Quận 1"
                />
              </label>
              <Transition name="fh-fade-slide">
                <p v-if="formError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">{{ formError }}</p>
              </Transition>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-25/60 px-6 py-4">
              <FhButton variant="secondary" size="sm" @click="showModal = false">Huỷ</FhButton>
              <FhButton type="submit" variant="primary" size="sm" :loading="saving">Lưu khu vực</FhButton>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <FhConfirmDialog
      :open="showConfirmModal"
      :title="confirmTitle"
      :consequence="confirmMessage"
      confirm-text="Xác nhận"
      cancel-text="Huỷ"
      @confirm="handleConfirm"
      @cancel="showConfirmModal = false"
    />
  </div>
</template>
