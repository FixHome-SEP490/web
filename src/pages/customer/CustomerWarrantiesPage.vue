<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  ShieldCheck,
  Calendar,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  PackageCheck,
  Loader2,
} from 'lucide-vue-next';
import { FhButton, FhCard } from '../../components';
import WarrantyClaimCard from '../../components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal from '../../components/customer/WarrantyClaimModal.vue';
import { ordersApi, type OrderWarrantyGroup, type WarrantyClaimView } from '../../api/orders.api';
import { isOpenClaim } from '../../utils/warranty-claim';
import { vnDateString } from '../../utils/vn-time';

const router = useRouter();

const loading = ref(true);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const warrantyOrders = ref<OrderWarrantyGroup[]>([]);

// Modal Yêu cầu bảo hành trực tiếp
const showClaimModal = ref(false);
const selectedOrderForClaim = ref<OrderWarrantyGroup | null>(null);

const hasOpenClaim = (order: OrderWarrantyGroup) => order.claims.some((claim) => isOpenClaim(claim.status));
const busyCoverageIds = (order: OrderWarrantyGroup) =>
  order.claims.filter((claim) => isOpenClaim(claim.status)).map((claim) => claim.warrantyCoverageId);
const allCoveragesBusy = (order: OrderWarrantyGroup) =>
  order.coverages.every((coverage) => busyCoverageIds(order).includes(coverage.id));
const coverageLabel = (order: OrderWarrantyGroup, claim: WarrantyClaimView) =>
  order.coverages.find((coverage) => coverage.id === claim.warrantyCoverageId)?.itemDescription;

const loadWarranties = async () => {
  try {
    loading.value = true;
    warrantyOrders.value = await ordersApi.getOrderWarrantiesGrouped();
  } catch (err: unknown) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải danh sách bảo hành.',
    };
  } finally {
    loading.value = false;
  }
};

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : vnDateString(d);
  } catch {
    return val;
  }
};

const getDaysRemaining = (expiresAt: string) => {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const openClaimModal = (order: OrderWarrantyGroup) => {
  selectedOrderForClaim.value = order;
  showClaimModal.value = true;
};

const onClaimSubmitted = (claim: WarrantyClaimView) => {
  const order = selectedOrderForClaim.value;
  showClaimModal.value = false;
  if (!order) return;
  order.claims = [claim, ...order.claims];
  actionMessage.value = {
    type: 'success',
    text: `Đã gửi yêu cầu bảo hành cho đơn ${order.orderCode}. Kỹ thuật viên phụ trách sẽ liên hệ với bạn sớm.`,
  };
};

const onClaimUpdated = (order: OrderWarrantyGroup, claim: WarrantyClaimView) => {
  order.claims = order.claims.map((existing) => (existing.id === claim.id ? claim : existing));
};

const goToOrderDetail = (orderId: string) => {
  router.push(`/app/orders/${orderId}`);
};

onMounted(() => {
  loadWarranties();
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ShieldCheck class="text-success-600" :size="26" />
          Bảo hành Điện tử theo Đơn hàng
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Tất cả linh kiện và dịch vụ sửa chữa của FixHome được quản lý bảo hành tập trung theo từng đơn hàng.
        </p>
      </div>

      <FhButton variant="secondary" size="sm" @click="router.push('/app/orders')">
        Xem tất cả đơn
      </FhButton>
    </div>

    <!-- Alert / Toast Banner -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all shadow-xs"
      :class="
        actionMessage.type === 'success'
          ? 'bg-success-50 text-success-800 border border-success-200'
          : 'bg-danger-50 text-danger-800 border border-danger-200'
      "
    >
      <CheckCircle2
        v-if="actionMessage.type === 'success'"
        :size="16"
        class="text-success-600 shrink-0"
      />
      <AlertCircle v-else :size="16" class="text-danger-600 shrink-0" />
      <span class="flex-1">{{ actionMessage.text }}</span>
      <button
        type="button"
        class="text-ink-400 hover:text-ink-700 ml-2"
        @click="actionMessage = null"
      >
        ✕
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16 text-ink-400">
      <Loader2 :size="24" class="animate-spin inline mr-2 text-brand-600" />
      Đang tải danh sách bảo hành theo đơn...
    </div>

    <!-- Empty State -->
    <div
      v-else-if="warrantyOrders.length === 0"
      class="text-center py-16 bg-white rounded-[var(--radius-md)] border border-ink-200 shadow-xs space-y-2"
    >
      <ShieldCheck :size="48" class="mx-auto text-ink-300 mb-1" />
      <h3 class="text-base font-bold text-ink-800">Chưa có đơn hàng nào có bảo hành</h3>
      <p class="text-xs text-ink-500 max-w-md mx-auto">
        Khi đơn sửa chữa hoàn tất nghiệm thu và thanh toán, các gói bảo hành dịch vụ cùng linh kiện thay thế sẽ tự động kích hoạt tại đây.
      </p>
      <div class="pt-2">
        <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
          Đặt thợ sửa chữa ngay
        </FhButton>
      </div>
    </div>

    <!-- Orders Warranty Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <FhCard
        v-for="order in warrantyOrders"
        :key="order.orderId"
        class="flex flex-col justify-between space-y-4 hover:border-brand-300 transition-all shadow-xs"
      >
        <div class="space-y-3.5">
          <!-- Card Header: Order Code & Badges -->
          <div class="flex items-center justify-between gap-2 border-b border-ink-100 pb-2.5">
            <button
              type="button"
              class="font-mono text-xs font-bold text-brand-700 hover:text-brand-900 flex items-center gap-1 group"
              title="Bấm để xem chi tiết đơn hàng này"
              @click="goToOrderDetail(order.orderId)"
            >
              <span>{{ order.orderCode }}</span>
              <ArrowUpRight :size="13" class="opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>

            <!-- Status Pill -->
            <div class="flex items-center gap-1.5">
              <span
                v-if="hasOpenClaim(order)"
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-warning-100 text-warning-900 border border-warning-300"
              >
                ĐANG XỬ LÝ BẢO HÀNH
              </span>
              <span
                v-else-if="order.hasActiveCoverage"
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-success-100 text-success-800 border border-success-300 flex items-center gap-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-success-500 inline-block animate-pulse"></span>
                CÒN HIỆU LỰC (Còn {{ getDaysRemaining(order.maxExpiresAt) }} ngày)
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-ink-100 text-ink-700 border border-ink-300"
              >
                HẾT HẠN BẢO HÀNH
              </span>
            </div>
          </div>

          <!-- Order Title -->
          <div>
            <h3
              class="font-bold text-sm text-ink-900 cursor-pointer hover:text-brand-700 transition-colors"
              @click="goToOrderDetail(order.orderId)"
            >
              {{ order.serviceName }}
            </h3>
            <p class="text-[11px] text-ink-400 mt-0.5">
              Đơn hàng hoàn tất · Được bảo vệ bởi chính sách bảo hành điện tử FixHome
            </p>
          </div>

          <!-- Covered Items Inside Order -->
          <div class="p-3 rounded-lg bg-ink-50/80 border border-ink-200 space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-ink-800">
              <span class="flex items-center gap-1.5">
                <PackageCheck :size="14" class="text-brand-600" />
                Hạng mục bảo hành trong đơn ({{ order.coverages.length }} mục):
              </span>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="item in order.coverages"
                :key="item.id"
                class="flex items-center justify-between text-xs py-1 px-2 rounded bg-white border border-ink-150 shadow-2xs"
              >
                <div class="flex items-center gap-1.5 font-medium text-ink-900 truncate mr-2">
                  <CheckCircle2 :size="13" class="text-success-600 shrink-0" />
                  <span class="truncate" :title="item.itemDescription">{{ item.itemDescription }}</span>
                </div>
                <div class="flex items-center gap-2 text-[11px] shrink-0 font-num">
                  <span class="text-ink-500">Hạn: {{ formatDate(item.expiresAt) }}</span>
                  <span
                    class="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                    :class="
                      item.status === 'ACTIVE'
                        ? 'bg-success-50 text-success-700 border border-success-200'
                        : 'bg-ink-100 text-ink-500'
                    "
                  >
                    {{ item.status === 'ACTIVE' ? 'Còn hạn' : 'Hết hạn' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Metadata: Dates & Technician -->
          <div class="text-xs text-ink-600 space-y-1 bg-ink-25/50 p-2.5 rounded-lg border border-ink-100">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-ink-500">
                <Calendar :size="13" /> Kích hoạt từ:
              </span>
              <span class="font-medium font-num">{{ formatDate(order.minStartsAt) }}</span>
            </div>
            <div class="flex items-center justify-between font-semibold">
              <span class="flex items-center gap-1.5 text-brand-700">
                <Clock :size="13" /> Hạn bảo hành tối đa:
              </span>
              <span class="text-brand-800 font-num">{{ formatDate(order.maxExpiresAt) }}</span>
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-ink-100">
              <span class="flex items-center gap-1.5 text-ink-500">
                <Wrench :size="13" /> Kỹ thuật viên:
              </span>
              <span class="font-medium text-ink-900">
                {{ order.technicianName }}
                <span v-if="order.technicianPhone" class="text-ink-400 font-mono text-[11px]">
                  ({{ order.technicianPhone }})
                </span>
              </span>
            </div>
          </div>
        </div>

        <div v-if="order.claims.length" class="space-y-2">
          <WarrantyClaimCard
            v-for="claim in order.claims"
            :key="claim.id"
            :claim="claim"
            :coverage-label="coverageLabel(order, claim)"
            @updated="onClaimUpdated(order, $event)"
          />
        </div>

        <!-- Footer Actions -->
        <div class="pt-3 border-t border-ink-100 flex items-center justify-between gap-2">
          <span class="text-[11px] text-success-700 font-semibold flex items-center gap-1">
            <ShieldCheck :size="13" class="text-success-600" />
            100% miễn phí công thợ
          </span>

          <div class="flex items-center gap-2">
            <FhButton
              variant="secondary"
              size="sm"
              class="text-xs"
              @click="goToOrderDetail(order.orderId)"
            >
              Xem đơn hàng
            </FhButton>

            <FhButton
              variant="primary"
              size="sm"
              class="text-xs"
              :disabled="allCoveragesBusy(order)"
              :title="allCoveragesBusy(order) ? 'Mọi hạng mục đang có yêu cầu chưa xử lý xong' : 'Gửi yêu cầu bảo hành'"
              @click="openClaimModal(order)"
            >
              Yêu cầu bảo hành
            </FhButton>
          </div>
        </div>
      </FhCard>
    </div>

    <WarrantyClaimModal
      v-if="selectedOrderForClaim"
      :open="showClaimModal"
      :order-id="selectedOrderForClaim.orderId"
      :order-code="selectedOrderForClaim.orderCode"
      :service-name="selectedOrderForClaim.serviceName"
      :technician-name="selectedOrderForClaim.technicianName"
      :coverages="selectedOrderForClaim.coverages"
      :busy-coverage-ids="busyCoverageIds(selectedOrderForClaim)"
      @close="showClaimModal = false"
      @submitted="onClaimSubmitted"
    />
  </div>
</template>
