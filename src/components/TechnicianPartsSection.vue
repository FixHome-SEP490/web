<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Package,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Truck,
  RotateCcw,
  Check,
  Send,
  Loader2,
  Search,
  ShieldCheck,
  X,
  Wrench,
  Tag,
  Clock,
  Layers,
} from 'lucide-vue-next';
import { FhButton, FhCard, FhMoney } from './index';
import {
  partRequestsApi,
  type PartRequest,
  type FulfillmentMethod,
} from '../api/part-requests.api';
import { partsCatalogApi } from '../api/parts-catalog.api';
import type { FixHomePart } from '../api/admin-parts.api';

const props = defineProps<{
  orderId: string;
  orderStatus: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'parts-updated'): void;
}>();

const loading = ref(true);
const actionLoading = ref(false);
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);

const partRequests = ref<PartRequest[]>([]);
const catalogParts = ref<FixHomePart[]>([]);
const searchResults = ref<FixHomePart[]>([]);
const partsMap = ref<Map<string, FixHomePart>>(new Map());

// Form state for creating pre-repair parts request
const showCreateForm = ref(false);
const fulfillmentMethod = ref<FulfillmentMethod>('pickup');
const requestReason = ref('');

export interface SelectedPartItem {
  partCatalogId: string;
  partName: string;
  sku: string | null;
  price: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  quantity: number;
  note: string;
}

const selectedItems = ref<SelectedPartItem[]>([]);

// Search & Part Picker state
const searchQuery = ref('');
const activeCategory = ref('ALL');
const isSearchingCatalog = ref(false);
const showSearchDropdown = ref(false);
const selectedPart = ref<FixHomePart | null>(null);
const selectedQuantity = ref(1);
const itemNote = ref('');
const searchContainerRef = ref<HTMLElement | null>(null);

const CATEGORY_TABS = [
  { label: 'Tất cả linh kiện', value: 'ALL' },
  { label: 'Điều hòa / Máy lạnh', value: 'Điều hòa' },
  { label: 'Máy giặt', value: 'Máy giặt' },
  { label: 'Tủ lạnh', value: 'Tủ lạnh' },
  { label: 'Bình nóng lạnh', value: 'Bình nóng lạnh' },
  { label: 'Quạt / Thiết bị khác', value: 'Quạt' },
];

// QR Handover modal/input state
const showQrInput = ref<string | null>(null); // requestId
const qrTokenInput = ref('');

const isAccepted = computed(() => props.orderStatus?.toUpperCase() === 'ACCEPTED');
const isUnderRepair = computed(() => props.orderStatus?.toUpperCase() === 'UNDER_REPAIR');
const hasActivePreRepair = computed(() =>
  partRequests.value.some(
    (pr) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled',
  ),
);

const selectedTotalQuantity = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + item.quantity, 0),
);

const selectedTotalPrice = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + item.quantity * item.price, 0),
);

const activePartEstimatedPrice = computed(() => {
  if (!selectedPart.value) return 0;
  return selectedPart.value.sellingPrice * Math.max(1, selectedQuantity.value);
});

// Format warranty helpers
const formatWarrantyDays = (days?: number | null, policy?: string | null): string => {
  if (days && days > 0) {
    if (days >= 360) {
      const years = Math.round(days / 365);
      return `${years > 0 ? years : 1} năm (${days} ngày)`;
    }
    if (days >= 30) {
      const months = Math.round(days / 30);
      return `${months} tháng (${days} ngày)`;
    }
    return `${days} ngày`;
  }
  if (policy) return policy;
  return 'Bảo hành chính hãng FixHome';
};

const getWarrantyBadge = (days?: number | null): string => {
  if (days && days > 0) {
    if (days >= 360) return `BH ${Math.round(days / 365)} năm`;
    if (days >= 30) return `BH ${Math.round(days / 30)} tháng`;
    return `BH ${days} ngày`;
  }
  return 'BH chính hãng';
};

const getPartWarrantyFromHistory = (item: { partCatalogId?: string | null }) => {
  if (item.partCatalogId && partsMap.value.has(item.partCatalogId)) {
    const part = partsMap.value.get(item.partCatalogId);
    return getWarrantyBadge(part?.warrantyDays);
  }
  return null;
};

// Data loading
const loadPartRequests = async () => {
  try {
    loading.value = true;
    partRequests.value = await partRequestsApi.getByOrderId(props.orderId);
  } catch (err: unknown) {
    actionError.value =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Không thể tải danh sách yêu cầu linh kiện.';
  } finally {
    loading.value = false;
  }
};

const loadCatalog = async () => {
  try {
    const res = await partsCatalogApi.getCatalog({ limit: 100 });
    catalogParts.value = res.data;
    searchResults.value = res.data;
    for (const p of res.data) {
      partsMap.value.set(p.id, p);
    }
  } catch {
    // Ignore catalog load errors
  }
};

// Search handling with debouncing
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const onSearchInput = () => {
  showSearchDropdown.value = true;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    void executeSearch();
  }, 250);
};

const selectCategory = (categoryVal: string) => {
  activeCategory.value = categoryVal;
  showSearchDropdown.value = true;
  void executeSearch();
};

const clearSearch = () => {
  searchQuery.value = '';
  activeCategory.value = 'ALL';
  searchResults.value = catalogParts.value;
};

const executeSearch = async () => {
  const query = searchQuery.value.trim();
  const cat = activeCategory.value !== 'ALL' ? activeCategory.value : '';
  const effectiveSearch = query || cat;

  if (!effectiveSearch) {
    searchResults.value = catalogParts.value;
    return;
  }

  try {
    isSearchingCatalog.value = true;
    const res = await partsCatalogApi.getCatalog({ search: effectiveSearch, limit: 50 });
    searchResults.value = res.data;
    for (const p of res.data) {
      partsMap.value.set(p.id, p);
    }
  } catch {
    // Local fallback search
    searchResults.value = catalogParts.value.filter(
      (p) =>
        p.name.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(effectiveSearch.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(effectiveSearch.toLowerCase())),
    );
  } finally {
    isSearchingCatalog.value = false;
  }
};

const selectPartForForm = (part: FixHomePart) => {
  selectedPart.value = part;
  selectedQuantity.value = 1;
  itemNote.value = '';
  showSearchDropdown.value = false;
};

const clearSelectedPart = () => {
  selectedPart.value = null;
  selectedQuantity.value = 1;
  itemNote.value = '';
};

const addItemToForm = () => {
  if (!selectedPart.value) return;
  const part = selectedPart.value;

  const existing = selectedItems.value.find((i) => i.partCatalogId === part.id);
  if (existing) {
    existing.quantity += Math.max(1, selectedQuantity.value);
    if (itemNote.value.trim() && !existing.note) {
      existing.note = itemNote.value.trim();
    }
  } else {
    selectedItems.value.push({
      partCatalogId: part.id,
      partName: part.name,
      sku: part.sku,
      price: part.sellingPrice,
      warrantyDays: part.warrantyDays,
      warrantyPolicy: part.warrantyPolicy,
      quantity: Math.max(1, selectedQuantity.value),
      note: itemNote.value.trim(),
    });
  }

  clearSelectedPart();
};

const removeItemFromForm = (index: number) => {
  selectedItems.value.splice(index, 1);
};

const increaseQuantity = (index: number) => {
  if (selectedItems.value[index]) {
    selectedItems.value[index].quantity += 1;
  }
};

const decreaseQuantity = (index: number) => {
  if (selectedItems.value[index]) {
    if (selectedItems.value[index].quantity > 1) {
      selectedItems.value[index].quantity -= 1;
    } else {
      removeItemFromForm(index);
    }
  }
};

const handleClickOutside = (e: MouseEvent) => {
  if (searchContainerRef.value && !searchContainerRef.value.contains(e.target as Node)) {
    showSearchDropdown.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  void loadPartRequests();
  void loadCatalog();
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
});

const submitPreRepairRequest = async () => {
  if (selectedItems.value.length === 0) {
    actionError.value = 'Vui lòng chọn ít nhất 1 linh kiện từ danh mục FixHome.';
    return;
  }

  try {
    actionLoading.value = true;
    actionError.value = null;
    actionSuccess.value = null;

    await partRequestsApi.createPreRepair(props.orderId, {
      items: selectedItems.value.map((i) => ({
        partCatalogId: i.partCatalogId,
        quantity: i.quantity,
        note: i.note,
      })),
      fulfillmentMethod: fulfillmentMethod.value,
      reason: requestReason.value || 'Linh kiện dự kiến trước khi đi kiểm tra',
    });

    actionSuccess.value = 'Đã gửi yêu cầu linh kiện dự kiến tới Quản lý dịch vụ!';
    showCreateForm.value = false;
    selectedItems.value = [];
    requestReason.value = '';
    clearSelectedPart();
    await loadPartRequests();
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Không thể tạo yêu cầu linh kiện.';
  } finally {
    actionLoading.value = false;
  }
};

const handleReceiveQr = async (requestId: string) => {
  if (!qrTokenInput.value.trim()) {
    actionError.value = 'Vui lòng nhập hoặc quét mã QR token!';
    return;
  }

  try {
    actionLoading.value = true;
    actionError.value = null;
    actionSuccess.value = null;

    await partRequestsApi.receiveByQr(requestId, {
      qrToken: qrTokenInput.value.trim(),
    });

    actionSuccess.value = 'Xác nhận nhận linh kiện thành công! Giờ bạn có thể tiến hành sửa chữa.';
    showQrInput.value = null;
    qrTokenInput.value = '';
    await loadPartRequests();
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Mã QR không hợp lệ hoặc không khớp.';
  } finally {
    actionLoading.value = false;
  }
};

const handleUpdateUsage = async (
  requestId: string,
  itemId: string,
  status: 'used' | 'returned',
) => {
  try {
    actionLoading.value = true;
    actionError.value = null;

    await partRequestsApi.updateItemUsage(requestId, itemId, {
      usageStatus: status,
    });

    actionSuccess.value =
      status === 'used' ? 'Đã ghi nhận linh kiện ĐÃ DÙNG.' : 'Đã ghi nhận linh kiện HOÀN TRẢ.';
    await loadPartRequests();
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Không thể cập nhật trạng thái linh kiện.';
  } finally {
    actionLoading.value = false;
  }
};

const formatStatusText = (status: string) => {
  switch (status.toLowerCase()) {
    case 'requested':
      return 'Đã gửi - Chờ kho chuẩn bị';
    case 'ready':
      return 'Sẵn sàng nhận';
    case 'delivering':
      return 'Đang giao hàng';
    case 'received':
      return 'Đã nhận linh kiện';
    case 'completed':
      return 'Đã hoàn thành';
    case 'cancelled':
      return 'Đã huỷ';
    default:
      return status;
  }
};

const getStatusBadgeClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'requested':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'ready':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'delivering':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'received':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'completed':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'cancelled':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-ink-100 text-ink-800 border-ink-200';
  }
};
</script>

<template>
  <FhCard title="Linh kiện sửa chữa (Flow 1 & 2)">
    <div class="space-y-4 text-xs">
      <!-- Alerts -->
      <div
        v-if="actionSuccess"
        class="p-3 rounded-lg bg-success-50 text-success-800 border border-success-200 flex items-center gap-2"
      >
        <CheckCircle2 :size="15" class="text-success-600 shrink-0" />
        <span>{{ actionSuccess }}</span>
      </div>

      <div
        v-if="actionError"
        class="p-3 rounded-lg bg-danger-50 text-danger-800 border border-danger-200 flex items-center gap-2"
      >
        <AlertCircle :size="15" class="text-danger-600 shrink-0" />
        <span>{{ actionError }}</span>
      </div>

      <!-- Flow explanation rule banner -->
      <div class="rounded-lg bg-brand-50/70 border border-brand-200 p-3 text-brand-900 space-y-1.5">
        <p class="font-bold flex items-center gap-1.5 text-[11px] text-brand-800">
          <Package :size="14" class="text-brand-600" />
          QUY TẮC QUẢN LÝ LINH KIỆN FIXHOME:
        </p>
        <ul class="list-disc list-inside space-y-0.5 text-[11px] text-ink-700">
          <li>
            <strong>Linh kiện dự kiến:</strong> Lấy trước từ kho FixHome để mang theo khi đến nhà khách,
            <em>không tự động tính tiền khách hàng</em>.
          </li>
          <li>
            <strong>Tính phí khách hàng:</strong> Khách chỉ thanh toán cho linh kiện
            <em>thực tế được sử dụng (USED)</em> và đã được khách duyệt qua Báo giá / Chi phí phát sinh.
          </li>
          <li>
            <strong>Linh kiện không dùng:</strong> Đánh dấu <em>Hoàn trả (RETURNED)</em> mang về kho, hoàn toàn
            không tính vào chi phí đơn hàng.
          </li>
        </ul>
      </div>

      <!-- Action: Create Pre-Repair Request (Only in ACCEPTED state) -->
      <div
        v-if="isAccepted && !hasActivePreRepair"
        class="p-4 border border-ink-200 rounded-xl bg-white shadow-xs space-y-4"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 class="font-bold text-ink-900 text-sm flex items-center gap-1.5">
              <Wrench :size="16" class="text-brand-600" />
              Chuẩn bị linh kiện trước khi đi (Pre-Repair)
            </h4>
            <p class="text-ink-600 text-xs">
              Dựa vào mô tả hỏng hóc, chẩn đoán AI và ảnh của khách, bạn có thể xin cấp linh kiện dự kiến mang theo.
            </p>
          </div>
          <FhButton
            v-if="!showCreateForm"
            variant="primary"
            size="sm"
            @click="showCreateForm = true"
          >
            <Plus :size="14" class="mr-1" /> Tạo yêu cầu linh kiện
          </FhButton>
        </div>

        <!-- Pre-Repair Form -->
        <div v-if="showCreateForm" class="space-y-4 pt-3 border-t border-ink-200">
          <!-- Fulfillment & Reason inputs -->
          <div class="grid sm:grid-cols-2 gap-3 bg-ink-50/60 p-3 rounded-lg border border-ink-150">
            <div>
              <label class="block font-semibold text-ink-800 mb-1 text-xs">Phương thức nhận linh kiện</label>
              <select
                v-model="fulfillmentMethod"
                class="w-full text-xs rounded border border-ink-300 p-2 bg-white text-ink-900 focus:outline-brand-500"
              >
                <option value="pickup">🏪 Tự lấy tại kho FixHome (PICKUP)</option>
                <option value="delivery">🚚 Yêu cầu giao hàng tới địa chỉ (DELIVERY)</option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-ink-800 mb-1 text-xs">Ghi chú / Lý do yêu cầu linh kiện</label>
              <input
                v-model="requestReason"
                type="text"
                placeholder="VD: Nghi hỏng bo mạch chính hoặc cảm biến nhiệt độ"
                class="w-full text-xs rounded border border-ink-300 p-2 bg-white text-ink-900 focus:outline-brand-500"
              />
            </div>
          </div>

          <!-- SMART PART PICKER COMPONENT -->
          <div class="p-3.5 rounded-xl border border-brand-200 bg-brand-50/20 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h5 class="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                  <Search :size="14" class="text-brand-600" />
                  Tìm kiếm & Chọn linh kiện chính hãng FixHome
                </h5>
                <p class="text-[11px] text-ink-500">
                  Tra cứu trong danh mục 790+ linh kiện chính hãng. Xem ngay giá niêm yết và thời hạn bảo hành.
                </p>
              </div>
              <span class="text-[11px] font-medium text-brand-700 bg-brand-100/70 px-2 py-0.5 rounded-full">
                {{ catalogParts.length > 0 ? `${catalogParts.length}+ linh kiện sẵn có` : 'Đang kết nối kho' }}
              </span>
            </div>

            <!-- Category filter tags -->
            <div class="flex flex-wrap gap-1.5 pt-0.5">
              <button
                v-for="cat in CATEGORY_TABS"
                :key="cat.value"
                type="button"
                class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                :class="
                  activeCategory === cat.value
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-ink-700 hover:bg-brand-50 border border-ink-200'
                "
                @click="selectCategory(cat.value)"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Search input bar with Dropdown -->
            <div ref="searchContainerRef" class="relative">
              <div class="relative flex items-center">
                <Search :size="15" class="absolute left-3 text-ink-400 pointer-events-none" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Gõ tên linh kiện (Bo mạch, Block, Van xả...), mã SKU (AC001) hoặc hãng (Daikin, Panasonic)..."
                  class="w-full text-xs rounded-lg border border-ink-300 pl-9 pr-16 py-2 bg-white text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-hidden transition-all"
                  @focus="showSearchDropdown = true"
                  @input="onSearchInput"
                />
                <div class="absolute right-2.5 flex items-center gap-1">
                  <Loader2 v-if="isSearchingCatalog" :size="14" class="animate-spin text-brand-600" />
                  <button
                    v-if="searchQuery || activeCategory !== 'ALL'"
                    type="button"
                    class="text-ink-400 hover:text-ink-700 p-0.5 rounded"
                    title="Xóa tìm kiếm"
                    @click="clearSearch"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>

              <!-- Search results popover -->
              <div
                v-if="showSearchDropdown"
                class="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white rounded-xl shadow-xl border border-ink-200 max-h-72 overflow-y-auto divide-y divide-ink-100"
              >
                <div v-if="isSearchingCatalog" class="p-3 text-center text-ink-400 text-xs">
                  <Loader2 :size="15" class="animate-spin inline mr-1 text-brand-600" /> Đang tìm kiếm trong kho linh kiện...
                </div>

                <div
                  v-else-if="searchResults.length === 0"
                  class="p-4 text-center text-ink-500 text-xs space-y-1"
                >
                  <Package :size="20" class="mx-auto text-ink-300" />
                  <p class="font-medium text-ink-700">Không tìm thấy linh kiện phù hợp</p>
                  <p class="text-[11px] text-ink-400">
                    Hãy thử tìm bằng từ khoá chung (ví dụ: "Block", "Van", "Cảm biến", "Bo mạch") hoặc mã SKU.
                  </p>
                </div>

                <div
                  v-for="part in searchResults"
                  :key="part.id"
                  class="p-2.5 hover:bg-brand-50/70 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  @click="selectPartForForm(part)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="font-semibold text-ink-900 group-hover:text-brand-700 transition-colors truncate">
                        {{ part.name }}
                      </span>
                      <span
                        v-if="part.sku"
                        class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-ink-100 text-ink-600 shrink-0"
                      >
                        {{ part.sku }}
                      </span>
                    </div>
                    <p
                      v-if="part.description"
                      class="text-[11px] text-ink-500 truncate"
                    >
                      {{ part.description }}
                    </p>
                  </div>

                  <div class="text-right shrink-0 space-y-1">
                    <div class="font-num font-bold text-xs text-brand-700">
                      <FhMoney :amount="part.sellingPrice" />
                    </div>
                    <span
                      class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      <ShieldCheck :size="12" />
                      {{ getWarrantyBadge(part.warrantyDays) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SPOTLIGHT CARD: Khi thợ đã click chọn 1 linh kiện -->
            <div
              v-if="selectedPart"
              class="border-2 border-brand-500 bg-brand-50/40 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-200"
            >
              <!-- Card Header -->
              <div class="flex items-start justify-between gap-2 border-b border-brand-200/80 pb-2.5">
                <div class="flex items-start gap-2.5">
                  <div class="p-2 rounded-lg bg-brand-600 text-white shrink-0 mt-0.5 shadow-xs">
                    <Wrench :size="16" />
                  </div>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="font-bold text-ink-900 text-sm">
                        {{ selectedPart.name }}
                      </h4>
                      <span
                        v-if="selectedPart.sku"
                        class="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-brand-100 text-brand-800 border border-brand-300"
                      >
                        SKU: {{ selectedPart.sku }}
                      </span>
                    </div>
                    <p v-if="selectedPart.description" class="text-[11px] text-ink-600 mt-0.5 line-clamp-1">
                      {{ selectedPart.description }}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  class="text-ink-400 hover:text-ink-700 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-ink-200 flex items-center gap-1 transition-all"
                  @click="clearSelectedPart"
                >
                  <X :size="14" /> Đổi linh kiện khác
                </button>
              </div>

              <!-- Price & Warranty Spotlight Metrics -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <!-- Price block -->
                <div class="bg-white p-2.5 rounded-lg border border-brand-200/60 shadow-xs space-y-0.5">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1">
                    <Tag :size="12" class="text-brand-600" /> Giá niêm yết FixHome
                  </span>
                  <div class="text-base font-bold text-brand-700 font-num">
                    <FhMoney :amount="selectedPart.sellingPrice" />
                  </div>
                </div>

                <!-- Warranty duration block -->
                <div class="bg-white p-2.5 rounded-lg border border-emerald-200 shadow-xs space-y-0.5">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <ShieldCheck :size="12" class="text-emerald-600" /> Thời hạn bảo hành
                  </span>
                  <div class="text-xs font-bold text-emerald-700 flex items-center gap-1">
                    <span class="text-sm font-extrabold">
                      {{ formatWarrantyDays(selectedPart.warrantyDays, selectedPart.warrantyPolicy) }}
                    </span>
                  </div>
                </div>

                <!-- Warranty policy block -->
                <div class="bg-white p-2.5 rounded-lg border border-ink-200 shadow-xs space-y-0.5">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1">
                    <Clock :size="12" class="text-ink-500" /> Chính sách bảo hành
                  </span>
                  <p class="text-[11px] text-ink-700 font-medium line-clamp-2">
                    {{ selectedPart.warrantyPolicy || 'Bảo hành chính hãng theo chính sách FixHome' }}
                  </p>
                </div>
              </div>

              <!-- Add to Request Action Controls -->
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <!-- Quantity & Total -->
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1 bg-white p-1 rounded-lg border border-ink-200">
                    <span class="text-[11px] font-semibold text-ink-600 px-1.5">SL:</span>
                    <button
                      type="button"
                      class="h-7 w-7 rounded bg-ink-100 hover:bg-ink-200 text-ink-800 font-bold flex items-center justify-center transition-colors disabled:opacity-50"
                      :disabled="selectedQuantity <= 1"
                      @click="selectedQuantity = Math.max(1, selectedQuantity - 1)"
                    >
                      <Minus :size="13" />
                    </button>
                    <input
                      v-model.number="selectedQuantity"
                      type="number"
                      min="1"
                      max="50"
                      class="w-10 h-7 text-xs font-bold font-num text-center bg-transparent border-0 outline-hidden"
                    />
                    <button
                      type="button"
                      class="h-7 w-7 rounded bg-ink-100 hover:bg-ink-200 text-ink-800 font-bold flex items-center justify-center transition-colors"
                      @click="selectedQuantity += 1"
                    >
                      <Plus :size="13" />
                    </button>
                  </div>

                  <div class="text-xs">
                    <span class="text-ink-500">Tạm tính:</span>
                    <strong class="text-brand-900 font-num ml-1 font-bold">
                      <FhMoney :amount="activePartEstimatedPrice" />
                    </strong>
                  </div>
                </div>

                <!-- Note and Add Button -->
                <div class="flex items-center gap-2 flex-1 sm:max-w-md">
                  <input
                    v-model="itemNote"
                    type="text"
                    placeholder="Ghi chú item (VD: mang sơ cua, thay buồng lạnh)..."
                    class="flex-1 text-xs rounded border border-ink-300 p-1.5 bg-white text-ink-900 placeholder:text-ink-400"
                  />
                  <button
                    type="button"
                    class="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all shrink-0 cursor-pointer"
                    @click="addItemToForm"
                  >
                    <Plus :size="14" /> Thêm vào danh sách
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Selected Items Table -->
          <div v-if="selectedItems.length > 0" class="space-y-2">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-ink-900 text-xs flex items-center gap-1.5">
                <Layers :size="14" class="text-brand-600" />
                Danh sách linh kiện dự kiến mang theo ({{ selectedItems.length }} loại)
              </h5>
              <span class="text-[11px] text-ink-500">
                Tổng số lượng: <strong class="text-brand-700">{{ selectedTotalQuantity }}</strong>
              </span>
            </div>

            <div class="border border-ink-200 rounded-xl overflow-hidden shadow-xs bg-white">
              <table class="w-full text-left text-xs">
                <thead class="bg-ink-100 text-ink-700 font-semibold border-b border-ink-200">
                  <tr>
                    <th class="p-2.5">Linh kiện & Mã SKU</th>
                    <th class="p-2.5 text-center">Bảo hành</th>
                    <th class="p-2.5 text-right">Đơn giá niêm yết</th>
                    <th class="p-2.5 text-center">Số lượng</th>
                    <th class="p-2.5 text-right">Thành tiền tạm tính</th>
                    <th class="p-2.5">Ghi chú</th>
                    <th class="p-2.5 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  <tr v-for="(item, idx) in selectedItems" :key="idx" class="hover:bg-ink-50/70 transition-colors">
                    <td class="p-2.5">
                      <div class="font-semibold text-ink-900">{{ item.partName }}</div>
                      <span v-if="item.sku" class="font-mono text-[10px] text-ink-500">
                        {{ item.sku }}
                      </span>
                    </td>
                    <td class="p-2.5 text-center">
                      <span
                        class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                        :title="item.warrantyPolicy || undefined"
                      >
                        <ShieldCheck :size="11" />
                        {{ getWarrantyBadge(item.warrantyDays) }}
                      </span>
                    </td>
                    <td class="p-2.5 text-right font-num text-ink-700">
                      <FhMoney :amount="item.price" />
                    </td>
                    <td class="p-2.5 text-center">
                      <div class="inline-flex items-center gap-1 bg-ink-50 px-1 py-0.5 rounded border border-ink-200">
                        <button
                          type="button"
                          class="p-0.5 hover:bg-ink-200 rounded text-ink-600"
                          @click="decreaseQuantity(idx)"
                        >
                          <Minus :size="11" />
                        </button>
                        <span class="w-6 text-center font-bold font-num text-xs">{{ item.quantity }}</span>
                        <button
                          type="button"
                          class="p-0.5 hover:bg-ink-200 rounded text-ink-600"
                          @click="increaseQuantity(idx)"
                        >
                          <Plus :size="11" />
                        </button>
                      </div>
                    </td>
                    <td class="p-2.5 text-right font-num font-bold text-brand-700">
                      <FhMoney :amount="item.price * item.quantity" />
                    </td>
                    <td class="p-2.5 text-ink-500">
                      {{ item.note || '-' }}
                    </td>
                    <td class="p-2.5 text-center">
                      <button
                        type="button"
                        class="text-danger-600 hover:text-danger-800 p-1 rounded hover:bg-danger-50 transition-colors"
                        title="Xoá linh kiện"
                        @click="removeItemFromForm(idx)"
                      >
                        <Trash2 :size="14" />
                      </button>
                    </td>
                  </tr>
                </tbody>
                <!-- Table Footer Summary -->
                <tfoot class="bg-brand-50/50 border-t border-brand-200 text-xs">
                  <tr>
                    <td colspan="4" class="p-2.5 font-bold text-brand-900 text-right">
                      Tổng giá trị linh kiện dự kiến mang theo:
                    </td>
                    <td class="p-2.5 text-right font-num font-extrabold text-brand-700 text-sm">
                      <FhMoney :amount="selectedTotalPrice" />
                    </td>
                    <td colspan="2" class="p-2.5 text-[11px] text-ink-500 italic">
                      * Chưa tính vào hoá đơn khách
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="flex items-center justify-end gap-2 pt-2">
            <FhButton variant="ghost" size="sm" @click="showCreateForm = false">Hủy bỏ</FhButton>
            <FhButton
              variant="primary"
              size="sm"
              :disabled="selectedItems.length === 0 || actionLoading"
              @click="submitPreRepairRequest"
            >
              <Send :size="14" class="mr-1" /> Gửi yêu cầu tới Quản lý
            </FhButton>
          </div>
        </div>
      </div>

      <!-- Part Requests List -->
      <div v-if="loading" class="text-center py-6 text-ink-400">
        <Loader2 :size="20" class="animate-spin inline mr-1.5 text-brand-600" /> Đang tải thông tin linh kiện...
      </div>

      <div
        v-else-if="partRequests.length === 0 && !showCreateForm"
        class="text-center py-8 text-ink-500 border border-dashed border-ink-200 rounded-xl bg-ink-25"
      >
        <Package :size="28" class="mx-auto text-ink-400 mb-1.5" />
        <p class="font-semibold text-ink-800">Chưa có yêu cầu linh kiện nào cho đơn hàng này.</p>
        <p class="text-[11px] text-ink-400">
          Nếu cần linh kiện dự kiến trước khi đi hoặc phát sinh khi sửa, hãy bấm "Tạo yêu cầu linh kiện" ở trên.
        </p>
      </div>

      <div v-else class="space-y-4">
        <h4 class="font-bold text-ink-900 text-xs">Lịch sử yêu cầu linh kiện ({{ partRequests.length }} đợt)</h4>

        <div
          v-for="pr in partRequests"
          :key="pr.id"
          class="border border-ink-200 rounded-xl bg-white overflow-hidden shadow-xs space-y-3 p-3.5"
        >
          <!-- Request Header -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                :class="getStatusBadgeClass(pr.status)"
              >
                {{ formatStatusText(pr.status) }}
              </span>

              <span
                v-if="pr.requestType === 'pre_repair'"
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
              >
                Trước sửa chữa
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
              >
                Phát sinh khi sửa
              </span>

              <span class="text-ink-500 text-[11px] flex items-center gap-1">
                <Truck v-if="pr.fulfillmentMethod === 'delivery'" :size="13" />
                <Package v-else :size="13" />
                {{ pr.fulfillmentMethod === 'delivery' ? 'Giao hàng' : 'Tự lấy tại kho' }}
              </span>
            </div>

            <span class="text-[11px] text-ink-400 font-num">
              {{ new Date(pr.createdAt).toLocaleString('vi-VN') }}
            </span>
          </div>

          <!-- Reason & Notes -->
          <p v-if="pr.reason" class="text-xs text-ink-700">
            <strong>Lý do:</strong> {{ pr.reason }}
          </p>

          <!-- Delivery Shipping Fee if any -->
          <div v-if="pr.shippingFee > 0" class="text-xs text-brand-700 font-medium">
            Phí giao hàng: <FhMoney :amount="pr.shippingFee" />
          </div>

          <!-- QR Handover Action (When READY or DELIVERING) -->
          <div
            v-if="
              (pr.fulfillmentMethod === 'pickup' && pr.status === 'ready') ||
              (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering')
            "
            class="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-2"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-blue-900 font-bold">
                <QrCode :size="16" class="text-blue-600 shrink-0" />
                <span>Linh kiện đã sẵn sàng bàn giao!</span>
              </div>
              <FhButton
                v-if="showQrInput !== pr.id"
                variant="primary"
                size="sm"
                @click="showQrInput = pr.id"
              >
                Nhận linh kiện (Quét QR)
              </FhButton>
            </div>

            <p class="text-[11px] text-blue-800">
              Quản lý dịch vụ đã chuẩn bị xong. Khi bạn đến kho hoặc nhận từ người giao, hãy quét hoặc nhập mã QR token để xác nhận:
            </p>

            <!-- Input QR Token form -->
            <div v-if="showQrInput === pr.id" class="flex items-center gap-2 pt-1">
              <input
                v-model="qrTokenInput"
                type="text"
                placeholder="Nhập mã QR token (VD: FH-PR-...)"
                class="flex-1 text-xs rounded border border-blue-300 p-2 bg-white"
              />
              <FhButton
                variant="primary"
                size="sm"
                :disabled="!qrTokenInput.trim() || actionLoading"
                @click="handleReceiveQr(pr.id)"
              >
                <Check :size="14" class="mr-1" /> Xác nhận đã nhận
              </FhButton>
              <FhButton variant="ghost" size="sm" @click="showQrInput = null">Hủy</FhButton>
            </div>
          </div>

          <!-- Received Badge -->
          <div
            v-if="pr.receivedAt"
            class="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded flex items-center gap-1.5"
          >
            <CheckCircle2 :size="14" class="text-emerald-600" />
            <span>Đã nhận bàn giao lúc: {{ new Date(pr.receivedAt).toLocaleString('vi-VN') }}</span>
          </div>

          <!-- Items list in this request -->
          <div class="space-y-1">
            <h5 class="font-semibold text-ink-800 text-[11px]">Chi tiết linh kiện:</h5>
            <div class="border border-ink-150 rounded-lg overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-ink-50 text-ink-600 font-semibold">
                  <tr>
                    <th class="p-2">Linh kiện</th>
                    <th class="p-2 text-center">Bảo hành</th>
                    <th class="p-2 text-center">Số lượng</th>
                    <th class="p-2 text-right">Đơn giá</th>
                    <th class="p-2 text-right">Thành tiền</th>
                    <th class="p-2 text-center">Trạng thái sử dụng</th>
                    <th v-if="isUnderRepair && pr.status === 'received'" class="p-2 text-right">Thao tác sau sửa</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  <tr v-for="item in pr.items" :key="item.id" class="hover:bg-ink-50/50">
                    <td class="p-2 font-medium text-ink-900">
                      {{ item.partNameSnapshot }}
                      <span v-if="item.note" class="block text-[10px] text-ink-500 font-normal">
                        Ghi chú: {{ item.note }}
                      </span>
                    </td>
                    <td class="p-2 text-center">
                      <span
                        v-if="getPartWarrantyFromHistory(item)"
                        class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        <ShieldCheck :size="11" />
                        {{ getPartWarrantyFromHistory(item) }}
                      </span>
                      <span v-else class="text-[10px] text-ink-400">-</span>
                    </td>
                    <td class="p-2 text-center">{{ item.quantity }}</td>
                    <td class="p-2 text-right font-num"><FhMoney :amount="item.unitPriceSnapshot" /></td>
                    <td class="p-2 text-right font-num font-semibold text-ink-800">
                      <FhMoney :amount="item.unitPriceSnapshot * item.quantity" />
                    </td>
                    <td class="p-2 text-center">
                      <span
                        v-if="item.usageStatus === 'used'"
                        class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1"
                      >
                        <Check :size="11" /> ĐÃ DÙNG
                      </span>
                      <span
                        v-else-if="item.usageStatus === 'returned'"
                        class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1"
                      >
                        <RotateCcw :size="11" /> HOÀN TRẢ
                      </span>
                      <span
                        v-else
                        class="px-2 py-0.5 rounded text-[10px] font-medium bg-ink-100 text-ink-600"
                      >
                        Chưa ghi nhận
                      </span>
                    </td>
                    <!-- Action buttons during repair completion -->
                    <td v-if="isUnderRepair && pr.status === 'received'" class="p-2 text-right space-x-1">
                      <button
                        type="button"
                        class="px-2 py-1 rounded text-[11px] font-semibold transition-colors"
                        :class="
                          item.usageStatus === 'used'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300'
                        "
                        :disabled="actionLoading"
                        @click="handleUpdateUsage(pr.id, item.id, 'used')"
                      >
                        Đã Dùng
                      </button>
                      <button
                        type="button"
                        class="px-2 py-1 rounded text-[11px] font-semibold transition-colors"
                        :class="
                          item.usageStatus === 'returned'
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300'
                        "
                        :disabled="actionLoading"
                        @click="handleUpdateUsage(pr.id, item.id, 'returned')"
                      >
                        Hoàn Trả
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </FhCard>
</template>
