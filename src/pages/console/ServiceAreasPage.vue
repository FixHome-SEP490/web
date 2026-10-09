<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Plus } from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhConfirmDialog } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { consoleField, consoleLabel } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import { serviceAreasApi, type ServiceArea } from '../../api/service-areas.api';

const loading = ref(true);
const loadError = ref(false);
const serviceAreas = ref<ServiceArea[]>([]);
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

onMounted(() => {
  loadAreas();
});

const filteredAreas = computed(() => {
  return serviceAreas.value.filter((area) => {
    const matchProvince =
      selectedProvince.value === 'ALL' ||
      area.provinceCode === selectedProvince.value;
    const matchSearch =
      !searchQuery.value ||
      area.districtName.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      area.districtCode.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      area.provinceName.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchProvince && matchSearch;
  });
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
  if (areaForm.value.provinceCode === '01') {
    areaForm.value.provinceName = 'Hà Nội';
  } else if (areaForm.value.provinceCode === '79') {
    areaForm.value.provinceName = 'TP. Hồ Chí Minh';
  } else if (areaForm.value.provinceCode === '48') {
    areaForm.value.provinceName = 'Đà Nẵng';
  }
};

const saveArea = async () => {
  if (!areaForm.value.provinceCode || !areaForm.value.districtCode || !areaForm.value.districtName) {
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
    <ConsolePageHeader title="Khu vực phục vụ" :count="loading || loadError ? null : filteredAreas.length">
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openAddArea">
          <Plus :size="16" aria-hidden="true" /> Thêm khu vực
        </FhButton>
      </template>
    </ConsolePageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm quận, huyện hoặc mã" label="Tìm khu vực" />
      <select v-model="selectedProvince" :class="consoleField" aria-label="Tỉnh, thành phố">
        <option value="ALL">Tất cả tỉnh, thành</option>
        <option value="01">Hà Nội</option>
        <option value="79">TP. Hồ Chí Minh</option>
        <option value="48">Đà Nẵng</option>
      </select>
    </div>

    <p v-if="actionError" class="text-sm text-danger-600" role="alert">{{ actionError }}</p>

    <ConsoleLoadError v-if="loadError" @retry="loadAreas" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="filteredAreas"
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

    <!-- Add / edit dialog -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="area-form-title"
      @keydown.esc="showModal = false"
    >
      <form class="bg-white rounded-[var(--radius-md)] max-w-md w-full p-6 shadow-xl space-y-5" @submit.prevent="saveArea">
        <h3 id="area-form-title" class="text-lg font-semibold text-ink-900">
          {{ isEditing ? 'Sửa khu vực' : 'Thêm khu vực' }}
        </h3>

        <div class="space-y-4">
          <label :class="consoleLabel">
            Tỉnh, thành phố
            <select v-model="areaForm.provinceCode" :class="consoleField" @change="onProvinceChange">
              <option value="01">Hà Nội</option>
              <option value="79">TP. Hồ Chí Minh</option>
              <option value="48">Đà Nẵng</option>
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
        </div>

        <p v-if="formError" class="text-sm text-danger-600" role="alert">{{ formError }}</p>

        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="showModal = false">Huỷ</FhButton>
          <FhButton type="submit" variant="primary" size="sm" :loading="saving">Lưu khu vực</FhButton>
        </div>
      </form>
    </div>

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
