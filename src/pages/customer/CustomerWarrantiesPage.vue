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
  X,
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
          <ShieldCheck class="text-brand-600" :size="24" />
          Bảo hành
        </h1>
        <p class="text-sm text-ink-500 mt-1 text-pretty">
          Hạng mục còn bảo hành trong từng đơn sửa chữa, và các yêu cầu bảo hành bạn đã gửi.
        </p>
      </div>

      <FhButton variant="secondary" size="sm" @click="router.push('/app/orders')">
        Xem tất cả đơn
      </FhButton>
    </div>

    <!-- Alert / Toast Banner -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-2xl text-sm font-medium flex items-center gap-2.5"
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
        aria-label="Đóng"
        @click="actionMessage = null"
      >
        <X :size="18" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" role="status" class="text-center py-16 text-sm text-ink-500">
      <Loader2 :size="20" class="animate-spin inline mr-2 text-brand-600" />
      Đang tải bảo hành…
    </div>

    <!-- Empty State -->
    <div
      v-else-if="warrantyOrders.length === 0"
      class="text-center py-14 px-6 bg-white rounded-2xl border border-ink-200 space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto">
        <ShieldCheck :size="24" />
      </div>
      <h3 class="text-base font-semibold text-ink-900">Chưa có đơn nào đang được bảo hành</h3>
      <p class="text-sm text-ink-500 max-w-md mx-auto text-pretty">
        Khi đơn sửa chữa hoàn tất nghiệm thu và thanh toán, các gói bảo hành dịch vụ cùng linh kiện thay thế sẽ tự động kích hoạt tại đây.
      </p>
      <div class="pt-2">
        <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
          Đặt lịch sửa chữa
        </FhButton>
      </div>
    </div>

    <!-- Orders Warranty Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <FhCard
        v-for="order in warrantyOrders"
        :key="order.orderId"
        class="flex flex-col justify-between space-y-4"
      >
        <div class="space-y-3.5">
          <!-- Card Header: Order Code & Badges -->
          <div class="flex items-center justify-between gap-2 border-b border-ink-100 pb-2.5">
            <button
              type="button"
              class="font-num text-sm font-semibold text-brand-700 hover:text-brand-800 flex items-center gap-1 group"
              title="Bấm để xem chi tiết đơn hàng này"
              @click="goToOrderDetail(order.orderId)"
            >
              <span class="whitespace-nowrap">{{ order.orderCode }}</span>
              <ArrowUpRight :size="13" class="opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>

            <!-- Status Pill -->
            <div class="flex items-center gap-1.5">
              <span
                v-if="hasOpenClaim(order)"
                class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-warning-50 text-warning-800 border border-warning-200"
              >
                Đang xử lý bảo hành
              </span>
              <span
                v-else-if="order.hasActiveCoverage"
                class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-success-50 text-success-700 border border-success-200"
              >
                Còn {{ getDaysRemaining(order.maxExpiresAt) }} ngày
              </span>
              <span
                v-else
                class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-ink-100 text-ink-600 border border-ink-200"
              >
                Hết hạn bảo hành
              </span>
            </div>
          </div>

          <!-- Order Title -->
          <div>
            <h3
              class="font-semibold text-base text-ink-900 cursor-pointer hover:text-brand-700 transition-colors"
              @click="goToOrderDetail(order.orderId)"
            >
              {{ order.serviceName }}
            </h3>
          </div>

          <!-- Covered Items Inside Order -->
          <div class="p-3 rounded-xl bg-ink-50 border border-ink-100 space-y-2">
            <div class="flex items-center justify-between text-sm font-medium text-ink-800">
              <span class="flex items-center gap-1.5">
                <PackageCheck :size="14" class="text-brand-600" />
                Hạng mục được bảo hành ({{ order.coverages.length }})
              </span>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="item in order.coverages"
                :key="item.id"
                class="flex items-center justify-between gap-2 text-sm py-1.5 px-2.5 rounded-lg bg-white border border-ink-100"
              >
                <div class="flex items-center gap-1.5 text-ink-900 min-w-0">
                  <CheckCircle2 :size="14" class="text-ink-400 shrink-0" />
                  <span class="truncate" :title="item.itemDescription">{{ item.itemDescription }}</span>
                </div>
                <div class="flex items-center gap-2 text-xs shrink-0 font-num whitespace-nowrap">
                  <span class="text-ink-500">Hạn: {{ formatDate(item.expiresAt) }}</span>
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium"
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
          <div class="text-sm text-ink-600 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-ink-500">
                <Calendar :size="14" /> Bắt đầu bảo hành
              </span>
              <span class="font-medium font-num">{{ formatDate(order.minStartsAt) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-ink-500">
                <Clock :size="14" /> Hết hạn muộn nhất
              </span>
              <span class="font-medium text-ink-900 font-num">{{ formatDate(order.maxExpiresAt) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="flex items-center gap-1.5 text-ink-500 shrink-0">
                <Wrench :size="14" /> Kỹ thuật viên
              </span>
              <span class="font-medium text-ink-900 text-right">
                {{ order.technicianName }}
                <span v-if="order.technicianPhone" class="text-ink-500 font-num whitespace-nowrap">
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
        <div class="pt-3 border-t border-ink-100 flex items-center justify-end gap-2">
          <div class="flex items-center gap-2">
            <FhButton
              variant="secondary"
              size="sm"
              @click="goToOrderDetail(order.orderId)"
            >
              Xem đơn
            </FhButton>

            <FhButton
              variant="primary"
              size="sm"
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
