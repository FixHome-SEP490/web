<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Wrench,
  Phone,
  Mail,
  CheckCircle2,
  Package,
  Layers,
  Undo2,
  FileText,
  History,
  AlertTriangle,
  RotateCcw,
  Check,
} from 'lucide-vue-next';
import FhButton from '../../components/FhButton.vue';
import FhSkeleton from '../../components/FhSkeleton.vue';
import PartReturnProcessModal from '../../components/console/PartReturnProcessModal.vue';
import {
  partRequestsApi,
  type PartCustodyReturnRecord,
} from '../../api/part-requests.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import {
  buildOrderReturnSummary,
  formatVnDateTime,
  type OrderPartReturnSummary,
  type PartReturnLineItem,
} from '../../utils/order-part-returns';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));
const orderId = computed(() => String(route.params.orderId || ''));

const loading = ref<boolean>(true);
const loadError = ref<string | null>(null);
const orderSummary = ref<OrderPartReturnSummary | null>(null);
const activeTab = ref<'items' | 'history' | 'notes'>('items');

// Modal state
const modalOpen = ref<boolean>(false);
const activeModalItem = ref<PartReturnLineItem | null>(null);
const generalReturnNote = ref<string>('');
const toastMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const showToast = (type: 'success' | 'error', text: string) => {
  toastMessage.value = { type, text };
  setTimeout(() => {
    if (toastMessage.value?.text === text) toastMessage.value = null;
  }, 4000);
};

// Stepper states
const isFullySettled = computed(() => orderSummary.value?.returnStatus === 'returned');
const isAwaiting = computed(() => orderSummary.value?.returnStatus === 'awaiting_return');
const isInUse = computed(() => orderSummary.value?.returnStatus === 'in_use');

const step2Done = computed(() => !isInUse.value);
const step3Active = computed(() => isAwaiting.value);
const step3Done = computed(() => isFullySettled.value);
const step4Done = computed(() => isFullySettled.value);

const loadOrderDetail = async () => {
  if (!orderId.value) {
    loadError.value = 'Mã đơn sửa chữa không hợp lệ.';
    loading.value = false;
    return;
  }

  loading.value = true;
  loadError.value = null;

  try {
    const [returns, orderData] = await Promise.all([
      partRequestsApi.getReturnsByOrderId(orderId.value).catch(() => [] as PartCustodyReturnRecord[]),
      ordersApi.getOrder(orderId.value).catch(() => null as ServiceOrderItem | null),
    ]);

    if (!returns.length && !orderData) {
      loadError.value = 'Không tìm thấy thông tin hoàn trả của đơn sửa chữa này.';
      loading.value = false;
      return;
    }

    orderSummary.value = buildOrderReturnSummary(orderId.value, returns, orderData);
  } catch {
    loadError.value = 'Không thể tải chi tiết hoàn trả linh kiện. Vui lòng thử lại sau.';
  } finally {
    loading.value = false;
  }
};

const openReturnModal = (item?: PartReturnLineItem) => {
  if (!orderSummary.value) return;
  if (item) {
    activeModalItem.value = item;
  } else {
    // Pick the first item that has maxAcceptQty > 0 or first pending
    const candidate = orderSummary.value.items.find((i) => i.maxAcceptQty > 0) || orderSummary.value.items[0];
    activeModalItem.value = candidate;
  }
  modalOpen.value = true;
};

const handleModalSuccess = async (payload: { quantity: number; message: string }) => {
  modalOpen.value = false;
  showToast('success', payload.message);
  await loadOrderDetail();
};

onMounted(() => {
  void loadOrderDetail();
});
</script>

<template>
  <div class="space-y-6 pb-12 animate-fade-in" aria-label="Chi tiết hoàn trả linh kiện theo đơn">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-xs text-ink-500" aria-label="Breadcrumb">
      <router-link
        to="/console/part-returns"
        class="inline-flex items-center gap-1.5 font-medium text-ink-600 hover:text-brand-600 transition-colors"
      >
        <ArrowLeft :size="14" />
        Hoàn trả linh kiện
      </router-link>
      <span>/</span>
      <span class="text-ink-800 font-medium">Chi tiết đơn hoàn trả</span>
    </nav>

    <!-- Page Header -->
    <header class="animate-slide-up flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-ink-900">Chi tiết hoàn trả linh kiện</h1>
        <p class="mt-1 text-sm text-ink-500">Quản lý và đối soát linh kiện theo đơn sửa chữa.</p>
      </div>
    </header>

    <!-- Toast Notification -->
    <Transition name="fh-fade-slide">
      <div
        v-if="toastMessage"
        class="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm shadow-xs"
        :class="toastMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-800 border-danger-200'"
        :role="toastMessage.type === 'success' ? 'status' : 'alert'"
      >
        <div class="flex items-center gap-2">
          <CheckCircle2 v-if="toastMessage.type === 'success'" :size="16" class="text-success-600" />
          <AlertTriangle v-else :size="16" class="text-danger-600" />
          <span>{{ toastMessage.text }}</span>
        </div>
        <button
          type="button"
          class="text-xs font-semibold hover:underline cursor-pointer"
          @click="toastMessage = null"
        >
          Đóng
        </button>
      </div>
    </Transition>

    <!-- Loading State -->
    <div v-if="loading" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FhSkeleton height="130px" rounded="md" />
        <FhSkeleton height="130px" rounded="md" />
        <FhSkeleton height="130px" rounded="md" />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FhSkeleton height="400px" rounded="md" class="lg:col-span-2" />
        <FhSkeleton height="400px" rounded="md" />
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="loadError"
      role="alert"
      class="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-danger-200 bg-white"
    >
      <AlertTriangle :size="36" class="text-danger-600 mb-3" />
      <h3 class="text-base font-semibold text-ink-900">{{ loadError }}</h3>
      <p class="text-xs text-ink-500 mt-1 mb-4">Vui lòng kiểm tra lại kết nối hoặc quyền truy cập của Service Manager.</p>
      <FhButton variant="secondary" size="md" @click="loadOrderDetail">Thử lại</FhButton>
    </div>

    <!-- Main Content -->
    <template v-else-if="orderSummary">
      <!-- 3 Top Info Cards -->
      <section class="animate-slide-up-delay-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch" aria-label="Thông tin tổng quan đơn">
        <!-- Card 1: Đơn sửa chữa -->
        <div class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) flex flex-col justify-between">
          <div class="flex items-start gap-3.5">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-100">
              <Wrench :size="22" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-medium text-ink-500">Đơn sửa chữa</span>
                <span
                  class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold"
                  :class="orderSummary.returnStatusTone"
                >
                  {{ orderSummary.returnStatusLabel }}
                </span>
              </div>
              <h2 class="mt-0.5 text-base font-bold font-num text-ink-900 truncate">
                {{ orderSummary.orderCode }}
              </h2>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-ink-100 space-y-1.5 text-xs">
            <div class="flex items-center gap-2 text-ink-600">
              <span class="text-ink-400">Dịch vụ:</span>
              <strong class="text-ink-900 font-medium truncate">{{ orderSummary.serviceName }}</strong>
            </div>
            <div class="flex items-center gap-2 text-ink-600">
              <span class="text-ink-400">Ngày lấy:</span>
              <span class="font-num font-medium text-ink-800">{{ orderSummary.pickupDate }}</span>
            </div>
            <div class="flex items-start gap-2 text-ink-600">
              <span class="text-ink-400 shrink-0">Địa chỉ:</span>
              <span class="text-ink-800 truncate" :title="orderSummary.customerAddress">{{ orderSummary.customerAddress }}</span>
            </div>
          </div>
        </div>

        <!-- Card 2: Kỹ thuật viên -->
        <div class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) flex flex-col justify-between">
          <div class="flex items-start gap-3.5">
            <div class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700 overflow-hidden border border-ink-200 font-bold">
              <img
                v-if="orderSummary.technicianAvatar"
                :src="orderSummary.technicianAvatar"
                :alt="orderSummary.technicianName"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ orderSummary.technicianName.charAt(0) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <span class="text-xs font-medium text-ink-500">Kỹ thuật viên</span>
              <h3 class="text-base font-bold text-ink-900 truncate">{{ orderSummary.technicianName }}</h3>
              <span class="font-num text-xs font-medium text-ink-500">{{ orderSummary.technicianCode }}</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-ink-100 space-y-1.5 text-xs">
            <div class="flex items-center gap-2 text-ink-600">
              <Phone :size="13" class="text-ink-400" />
              <span class="font-num font-medium text-ink-800">{{ orderSummary.technicianPhone }}</span>
            </div>
            <div class="flex items-center gap-2 text-ink-600 truncate">
              <Mail :size="13" class="text-ink-400 shrink-0" />
              <span class="text-ink-800 truncate font-num">{{ orderSummary.technicianEmail }}</span>
            </div>
          </div>
        </div>

        <!-- Card 3: Tiến trình xử lý hoàn trả -->
        <div class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) flex flex-col justify-between">
          <div>
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink-500">Tiến trình xử lý hoàn trả</h3>
          </div>

          <!-- Stepper 4 steps -->
          <div class="mt-4 relative flex items-center justify-between">
            <div class="absolute left-3 right-3 top-3.5 h-0.5 bg-ink-200 -z-0"></div>
            <div
              class="absolute left-3 top-3.5 h-0.5 bg-brand-600 -z-0 transition-all duration-300"
              :style="{
                width: step4Done ? '100%' : step3Done ? '66%' : step2Done ? '33%' : '0%',
              }"
            ></div>

            <!-- Step 1: Đã nhận -->
            <div class="relative z-10 flex flex-col items-center text-center">
              <div class="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow-xs">
                <Check :size="14" stroke-width="3" />
              </div>
              <span class="mt-1.5 text-[11px] font-semibold text-ink-800">Đã nhận<br>linh kiện</span>
            </div>

            <!-- Step 2: Chờ hoàn trả -->
            <div class="relative z-10 flex flex-col items-center text-center">
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors"
                :class="
                  step2Done
                    ? 'bg-brand-600 text-white'
                    : 'border-2 border-brand-600 bg-white text-brand-600 ring-3 ring-brand-100'
                "
              >
                <Check v-if="step2Done" :size="14" stroke-width="3" />
                <span v-else>2</span>
              </div>
              <span class="mt-1.5 text-[11px] font-semibold text-ink-800">Chờ<br>hoàn trả</span>
            </div>

            <!-- Step 3: Đối soát -->
            <div class="relative z-10 flex flex-col items-center text-center">
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors"
                :class="
                  step3Done
                    ? 'bg-brand-600 text-white'
                    : step3Active
                      ? 'border-2 border-brand-600 bg-white text-brand-600 ring-3 ring-brand-100'
                      : 'border border-ink-300 bg-white text-ink-400'
                "
              >
                <Check v-if="step3Done" :size="14" stroke-width="3" />
                <span v-else>3</span>
              </div>
              <span class="mt-1.5 text-[11px] font-semibold text-ink-800">Đối soát</span>
            </div>

            <!-- Step 4: Hoàn tất -->
            <div class="relative z-10 flex flex-col items-center text-center">
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors"
                :class="
                  step4Done
                    ? 'bg-success-600 text-white'
                    : 'border border-ink-300 bg-white text-ink-400'
                "
              >
                <Check v-if="step4Done" :size="14" stroke-width="3" />
                <span v-else>4</span>
              </div>
              <span class="mt-1.5 text-[11px] font-semibold text-ink-800">Hoàn tất</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Main Layout: 2 Columns -->
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" aria-label="Nội dung chi tiết hoàn trả">
        <!-- Left Content Area (2 Cols) -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Navigation Tabs -->
          <div class="flex items-center gap-6 border-b border-ink-200">
            <button
              type="button"
              class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer"
              :class="activeTab === 'items' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
              @click="activeTab = 'items'"
            >
              Danh sách linh kiện ({{ orderSummary.items.length }})
              <span
                v-if="activeTab === 'items'"
                class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
              ></span>
            </button>

            <button
              type="button"
              class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer"
              :class="activeTab === 'history' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
              @click="activeTab = 'history'"
            >
              Lịch sử xử lý
              <span
                v-if="activeTab === 'history'"
                class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
              ></span>
            </button>

            <button
              type="button"
              class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer"
              :class="activeTab === 'notes' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
              @click="activeTab = 'notes'"
            >
              Ghi chú
              <span
                v-if="activeTab === 'notes'"
                class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
              ></span>
            </button>
          </div>

          <!-- Tab 1: Danh sách linh kiện -->
          <div v-if="activeTab === 'items'" class="rounded-xl border border-ink-200/90 bg-white overflow-hidden shadow-(--shadow-e1)">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-ink-50/70 border-b border-ink-100 text-ink-600 font-semibold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th class="py-3.5 pl-4 pr-2 w-10">#</th>
                    <th class="py-3.5 px-3">Linh kiện</th>
                    <th class="py-3.5 px-3 text-center">Đã nhận</th>
                    <th class="py-3.5 px-3 text-center">Đã dùng</th>
                    <th class="py-3.5 px-3 text-center">Đã trả</th>
                    <th class="py-3.5 px-3 text-center">Cần trả</th>
                    <th class="py-3.5 px-3 text-center">Trạng thái</th>
                    <th class="py-3.5 pr-4 pl-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  <tr
                    v-for="(item, index) in orderSummary.items"
                    :key="item.id"
                    class="hover:bg-ink-50/60 transition-colors"
                  >
                    <td class="py-3.5 pl-4 pr-2 font-num font-medium text-ink-500">
                      {{ index + 1 }}
                    </td>
                    <td class="py-3.5 px-3">
                      <div class="flex items-center gap-3">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 border border-ink-200">
                          <Package :size="18" />
                        </div>
                        <div class="min-w-0">
                          <div class="font-semibold text-ink-900 break-words" :title="item.partNameSnapshot">
                            {{ item.partNameSnapshot }}
                          </div>
                          <div class="text-[11px] font-num text-ink-500">
                            SKU: {{ item.sku }} · {{ item.unit }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3.5 px-3 text-center font-num font-medium text-ink-900">
                      {{ item.issuedQty }}
                    </td>
                    <td class="py-3.5 px-3 text-center font-num font-medium text-ink-900">
                      {{ item.usedQty }}
                    </td>
                    <td class="py-3.5 px-3 text-center font-num font-medium text-ink-900">
                      {{ item.managerAcceptedQty }}
                    </td>
                    <td class="py-3.5 px-3 text-center font-num font-bold" :class="item.outstandingQty > 0 ? 'text-warning-800' : 'text-ink-400'">
                      {{ item.outstandingQty }}
                    </td>
                    <td class="py-3.5 px-3 text-center">
                      <span
                        class="inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                        :class="item.statusTone"
                      >
                        {{ item.statusLabel }}
                      </span>
                    </td>
                    <td class="py-3.5 pr-4 pl-3 text-right">
                      <FhButton
                        variant="secondary"
                        size="sm"
                        class="text-xs"
                        :disabled="!canOperate || item.maxAcceptQty < 1"
                        @click="openReturnModal(item)"
                      >
                        <Undo2 :size="13" class="mr-1 text-brand-600" />
                        Hoàn trả
                      </FhButton>
                    </td>
                  </tr>
                </tbody>
                <tfoot class="border-t-2 border-ink-200 bg-ink-50/60 font-semibold text-ink-900">
                  <tr>
                    <td colspan="2" class="py-3 pl-4 text-xs font-bold">Tổng cộng</td>
                    <td class="py-3 px-3 text-center font-num">{{ orderSummary.totalIssuedQty }}</td>
                    <td class="py-3 px-3 text-center font-num">{{ orderSummary.totalUsedQty }}</td>
                    <td class="py-3 px-3 text-center font-num">{{ orderSummary.totalReturnedQty }}</td>
                    <td class="py-3 px-3 text-center font-num text-warning-800 font-bold">{{ orderSummary.totalOutstandingQty }}</td>
                    <td colspan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- Tab 2: Lịch sử xử lý -->
          <div v-else-if="activeTab === 'history'" class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1)">
            <h4 class="text-xs font-bold uppercase tracking-wider text-ink-500 mb-4 flex items-center gap-2">
              <History :size="15" class="text-brand-600" />
              Tiến trình và lịch sử đối soát
            </h4>

            <div v-if="!orderSummary.history || !orderSummary.history.length" class="py-8 text-center text-xs text-ink-500">
              Chưa có lịch sử xử lý bổ sung.
            </div>

            <ol v-else class="relative border-l border-ink-200 ml-3 space-y-6">
              <li
                v-for="h in orderSummary.history"
                :key="h.id"
                class="ml-6"
              >
                <span class="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-brand-600 ring-4 ring-white">
                  <CheckCircle2 :size="12" />
                </span>
                <div class="flex items-center justify-between gap-4">
                  <h5 class="text-xs font-bold text-ink-900">{{ h.action }}</h5>
                  <time class="text-[11px] font-num text-ink-400">{{ formatVnDateTime(h.occurredAt) }}</time>
                </div>
                <p class="text-xs text-ink-600 mt-0.5">{{ h.description }}</p>
                <div v-if="h.partName" class="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
                  <span class="font-medium text-ink-700">{{ h.partName }}</span>
                  <span v-if="h.quantity" class="font-num font-semibold">· SL: {{ h.quantity }}</span>
                  <span>· Thực hiện bởi: {{ h.actorName }}</span>
                </div>
              </li>
            </ol>
          </div>

          <!-- Tab 3: Ghi chú -->
          <div v-else-if="activeTab === 'notes'" class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-ink-500 flex items-center gap-2">
              <FileText :size="15" class="text-brand-600" />
              Ghi chú liên quan
            </h4>

            <div v-if="!orderSummary.notes || !orderSummary.notes.length" class="py-6 text-center text-xs text-ink-500">
              Không có ghi chú nào về đơn này.
            </div>

            <ul v-else class="divide-y divide-ink-100 text-xs text-ink-700">
              <li v-for="(n, idx) in orderSummary.notes" :key="idx" class="py-2.5 flex items-start gap-2">
                <span class="h-1.5 w-1.5 rounded-full bg-brand-600 mt-1.5 shrink-0"></span>
                <span>{{ n }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Right Summary Sidebar (1 Col) -->
        <div class="space-y-4">
          <!-- Card: Tổng quan đơn hàng -->
          <div class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-ink-500">Tổng quan đơn hàng</h4>

            <div class="space-y-3 text-xs">
              <div class="flex items-center justify-between pb-2 border-b border-ink-100">
                <span class="flex items-center gap-2 text-ink-600">
                  <Package :size="16" class="text-ink-400" />
                  Tổng linh kiện đã nhận
                </span>
                <span class="font-num font-bold text-ink-900 text-sm">{{ orderSummary.totalIssuedQty }}</span>
              </div>

              <div class="flex items-center justify-between pb-2 border-b border-ink-100">
                <span class="flex items-center gap-2 text-ink-600">
                  <Wrench :size="16" class="text-ink-400" />
                  Đã sử dụng
                </span>
                <span class="font-num font-bold text-ink-900 text-sm">{{ orderSummary.totalUsedQty }}</span>
              </div>

              <div class="flex items-center justify-between pb-2 border-b border-ink-100">
                <span class="flex items-center gap-2 text-ink-600">
                  <RotateCcw :size="16" class="text-ink-400" />
                  Đã hoàn trả
                </span>
                <span class="font-num font-bold text-ink-900 text-sm">{{ orderSummary.totalReturnedQty }}</span>
              </div>

              <div class="flex items-center justify-between pt-1">
                <span class="flex items-center gap-2 text-warning-800 font-semibold">
                  <Layers :size="16" class="text-warning-600" />
                  Cần hoàn trả
                </span>
                <span class="font-num font-bold text-warning-800 text-base">{{ orderSummary.totalOutstandingQty }}</span>
              </div>
            </div>
          </div>

          <!-- Card: Ghi chú hoàn trả -->
          <div class="rounded-xl border border-ink-200/90 bg-white p-5 shadow-(--shadow-e1) space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-ink-500 flex items-center gap-2">
              <FileText :size="15" class="text-brand-600" />
              Ghi chú hoàn trả
            </h4>

            <textarea
              v-model="generalReturnNote"
              rows="4"
              placeholder="Nhập ghi chú về tình trạng linh kiện, số lượng thực nhận..."
              class="w-full rounded-lg border border-ink-200 bg-ink-50/40 p-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            ></textarea>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-3 pt-2">
            <FhButton
              variant="secondary"
              size="md"
              class="w-full justify-center text-xs font-semibold"
              @click="router.push('/console/part-returns')"
            >
              <ArrowLeft :size="15" class="mr-1.5" />
              Quay lại
            </FhButton>

            <FhButton
              variant="primary"
              size="md"
              class="w-full justify-center text-xs font-semibold"
              :disabled="!canOperate || orderSummary.totalOutstandingQty === 0"
              @click="openReturnModal()"
            >
              <Check :size="15" class="mr-1.5" />
              Xác nhận hoàn trả
            </FhButton>
          </div>
        </div>
      </section>
    </template>

    <!-- Return Modal -->
    <PartReturnProcessModal
      :is-open="modalOpen"
      :item="activeModalItem"
      @close="modalOpen = false"
      @success="handleModalSuccess"
    />
  </div>
</template>
