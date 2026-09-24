<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Package,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Truck,
  RotateCcw,
  Check,
  Send,
  Loader2,
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

// Form state for creating pre-repair parts request
const showCreateForm = ref(false);
const fulfillmentMethod = ref<FulfillmentMethod>('pickup');
const requestReason = ref('');
const selectedItems = ref<Array<{ partCatalogId: string; quantity: number; note: string; partName: string; price: number }>>([]);
const selectedCatalogPartId = ref('');
const selectedQuantity = ref(1);
const itemNote = ref('');

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

const loadPartRequests = async () => {
  try {
    loading.value = true;
    partRequests.value = await partRequestsApi.getByOrderId(props.orderId);
  } catch (err: unknown) {
    actionError.value = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể tải danh sách yêu cầu linh kiện.';
  } finally {
    loading.value = false;
  }
};

const loadCatalog = async () => {
  try {
    const res = await partsCatalogApi.getCatalog({ limit: 100 });
    catalogParts.value = res.data;
  } catch {
    // Ignore catalog load errors
  }
};

onMounted(() => {
  void loadPartRequests();
  void loadCatalog();
});

const addItemToForm = () => {
  if (!selectedCatalogPartId.value) return;
  const part = catalogParts.value.find((p) => p.id === selectedCatalogPartId.value);
  if (!part) return;

  const existing = selectedItems.value.find((i) => i.partCatalogId === part.id);
  if (existing) {
    existing.quantity += selectedQuantity.value;
  } else {
    selectedItems.value.push({
      partCatalogId: part.id,
      partName: part.name,
      price: part.sellingPrice,
      quantity: selectedQuantity.value,
      note: itemNote.value,
    });
  }

  selectedCatalogPartId.value = '';
  selectedQuantity.value = 1;
  itemNote.value = '';
};

const removeItemFromForm = (index: number) => {
  selectedItems.value.splice(index, 1);
};

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
    await loadPartRequests();
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể tạo yêu cầu linh kiện.';
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
    actionError.value = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Mã QR không hợp lệ hoặc không khớp.';
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

    actionSuccess.value = status === 'used' ? 'Đã ghi nhận linh kiện ĐÃ DÙNG.' : 'Đã ghi nhận linh kiện HOÀN TRẢ.';
    await loadPartRequests();
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể cập nhật trạng thái linh kiện.';
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
      <div class="rounded-lg bg-brand-50/60 border border-brand-200 p-3 text-brand-900 space-y-1">
        <p class="font-bold flex items-center gap-1.5 text-[11px]">
          <Package :size="14" class="text-brand-600" />
          QUY TẮC QUẢN LÝ LINH KIỆN FIXHOME:
        </p>
        <ul class="list-disc list-inside space-y-0.5 text-[11px] text-ink-700">
          <li><strong>Linh kiện dự kiến:</strong> Lấy trước từ kho FixHome để mang theo, <em>không tự động tính tiền khách hàng</em>.</li>
          <li><strong>Tính phí khách hàng:</strong> Khách chỉ trả tiền cho linh kiện <em>thực tế được sử dụng (USED)</em> và đã được khách duyệt qua Báo giá / Chi phí phát sinh.</li>
          <li><strong>Linh kiện không dùng:</strong> Đánh dấu <em>Hoàn trả (RETURNED)</em> và không tính vào chi phí đơn hàng.</li>
        </ul>
      </div>

      <!-- Action: Create Pre-Repair Request (Only in ACCEPTED state) -->
      <div v-if="isAccepted && !hasActivePreRepair" class="p-3 border border-ink-200 rounded-lg bg-ink-50/50 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-bold text-ink-900 text-xs">Chuẩn bị linh kiện trước khi đi (Pre-Repair)</h4>
            <p class="text-ink-600 text-[11px]">Dựa vào chẩn đoán AI và ảnh của khách, bạn có thể xin mang theo linh kiện dự kiến.</p>
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
        <div v-if="showCreateForm" class="space-y-3 pt-2 border-t border-ink-200">
          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1">Phương thức nhận linh kiện</label>
              <select
                v-model="fulfillmentMethod"
                class="w-full text-xs rounded border border-ink-200 p-2 bg-white"
              >
                <option value="pickup">Tự lấy tại kho FixHome (PICKUP)</option>
                <option value="delivery">Yêu cầu giao hàng tới địa chỉ (DELIVERY)</option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1">Ghi chú / Lý do yêu cầu</label>
              <input
                v-model="requestReason"
                type="text"
                placeholder="VD: Nghi hỏng bo mạch chính hoặc cảm biến nhiệt"
                class="w-full text-xs rounded border border-ink-200 p-2 bg-white"
              />
            </div>
          </div>

          <!-- Add Item Selector -->
          <div class="p-2.5 rounded border border-brand-200 bg-brand-50/30 space-y-2">
            <h5 class="font-semibold text-brand-900 text-[11px]">Chọn linh kiện từ danh mục FixHome</h5>
            <div class="grid sm:grid-cols-12 gap-2">
              <div class="sm:col-span-6">
                <select
                  v-model="selectedCatalogPartId"
                  class="w-full text-xs rounded border border-ink-200 p-1.5 bg-white"
                >
                  <option value="" disabled>-- Chọn linh kiện chính hãng --</option>
                  <option
                    v-for="part in catalogParts"
                    :key="part.id"
                    :value="part.id"
                  >
                    {{ part.name }} ({{ part.sku || 'No SKU' }}) - {{ part.sellingPrice?.toLocaleString('vi-VN') }} đ
                  </option>
                </select>
              </div>

              <div class="sm:col-span-2">
                <input
                  v-model.number="selectedQuantity"
                  type="number"
                  min="1"
                  max="10"
                  placeholder="SL"
                  class="w-full text-xs rounded border border-ink-200 p-1.5 bg-white text-center"
                />
              </div>

              <div class="sm:col-span-3">
                <input
                  v-model="itemNote"
                  type="text"
                  placeholder="Ghi chú item"
                  class="w-full text-xs rounded border border-ink-200 p-1.5 bg-white"
                />
              </div>

              <div class="sm:col-span-1">
                <button
                  type="button"
                  class="w-full h-full min-h-[30px] rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs flex items-center justify-center"
                  :disabled="!selectedCatalogPartId"
                  @click="addItemToForm"
                >
                  <Plus :size="14" />
                </button>
              </div>
            </div>
          </div>

          <!-- Selected Items Table -->
          <div v-if="selectedItems.length > 0" class="space-y-1.5">
            <h5 class="font-semibold text-ink-800 text-[11px]">Danh sách linh kiện đã chọn ({{ selectedItems.length }} mục):</h5>
            <div class="border border-ink-200 rounded overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-ink-100 text-ink-700 font-semibold">
                  <tr>
                    <th class="p-2">Tên linh kiện</th>
                    <th class="p-2 text-center">Số lượng</th>
                    <th class="p-2 text-right">Đơn giá niêm yết</th>
                    <th class="p-2">Ghi chú</th>
                    <th class="p-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  <tr v-for="(item, idx) in selectedItems" :key="idx" class="hover:bg-ink-50">
                    <td class="p-2 font-medium text-ink-900">{{ item.partName }}</td>
                    <td class="p-2 text-center">{{ item.quantity }}</td>
                    <td class="p-2 text-right font-num"><FhMoney :amount="item.price" /></td>
                    <td class="p-2 text-ink-500">{{ item.note || '-' }}</td>
                    <td class="p-2 text-center">
                      <button
                        type="button"
                        class="text-danger-600 hover:text-danger-800 p-1"
                        @click="removeItemFromForm(idx)"
                      >
                        <Trash2 :size="13" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

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
      <div v-if="loading" class="text-center py-4 text-ink-400">
        <Loader2 :size="18" class="animate-spin inline mr-1.5" /> Đang tải thông tin linh kiện...
      </div>

      <div v-else-if="partRequests.length === 0 && !showCreateForm" class="text-center py-6 text-ink-500 border border-dashed border-ink-200 rounded-lg">
        <Package :size="24" class="mx-auto text-ink-400 mb-1" />
        <p class="font-medium">Chưa có yêu cầu linh kiện nào cho đơn hàng này.</p>
        <p class="text-[11px] text-ink-400">Nếu cần linh kiện dự kiến trước khi đi hoặc phát sinh khi sửa, hãy tạo yêu cầu tại đây.</p>
      </div>

      <div v-else class="space-y-4">
        <h4 class="font-bold text-ink-900 text-xs">Lịch sử yêu cầu linh kiện ({{ partRequests.length }} đợt)</h4>

        <div
          v-for="pr in partRequests"
          :key="pr.id"
          class="border border-ink-200 rounded-lg bg-white overflow-hidden shadow-xs space-y-3 p-3.5"
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
            v-if="(pr.fulfillmentMethod === 'pickup' && pr.status === 'ready') || (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering')"
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
            <div class="border border-ink-150 rounded overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-ink-50 text-ink-600 font-semibold">
                  <tr>
                    <th class="p-2">Linh kiện</th>
                    <th class="p-2 text-center">Số lượng</th>
                    <th class="p-2 text-right">Đơn giá</th>
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
                    <td class="p-2 text-center">{{ item.quantity }}</td>
                    <td class="p-2 text-right font-num"><FhMoney :amount="item.unitPriceSnapshot" /></td>
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
                        :class="item.usageStatus === 'used' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300'"
                        :disabled="actionLoading"
                        @click="handleUpdateUsage(pr.id, item.id, 'used')"
                      >
                        Đã Dùng
                      </button>
                      <button
                        type="button"
                        class="px-2 py-1 rounded text-[11px] font-semibold transition-colors"
                        :class="item.usageStatus === 'returned' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300'"
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
