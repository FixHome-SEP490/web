<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X,
} from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import WarrantyClaimCard from '../../components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal from '../../components/customer/WarrantyClaimModal.vue';
import { ordersApi, type OrderWarrantyGroup, type WarrantyClaimView } from '../../api/orders.api';
import { isOpenClaim } from '../../utils/warranty-claim';
import { vnDateString } from '../../utils/vn-time';

const loading = ref(true);
const loadFailed = ref(false);
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
    loadFailed.value = false;
    warrantyOrders.value = await ordersApi.getOrderWarrantiesGrouped();
  } catch {
    // A short line and a retry button instead of the server text (PO 10/10/2026).
    loadFailed.value = true;
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

onMounted(() => {
  loadWarranties();
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-5 pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Bảo hành</h1>

    <!-- Result of the last action -->
    <div
      v-if="actionMessage"
      role="status"
      class="p-3.5 rounded-2xl text-sm flex items-center gap-2.5"
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
      <span class="flex-1 text-pretty">{{ actionMessage.text }}</span>
      <button
        type="button"
        class="text-ink-400 hover:text-ink-700 shrink-0"
        aria-label="Đóng"
        @click="actionMessage = null"
      >
        <X :size="18" />
      </button>
    </div>

    <!-- Loading: the shape of the cards -->
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-5" aria-busy="true" aria-label="Đang tải bảo hành">
      <div v-for="i in 2" :key="i" class="rounded-2xl bg-white border border-ink-200 p-5 space-y-3">
        <FhSkeleton width="60%" height="20px" />
        <FhSkeleton width="40%" height="14px" />
        <FhSkeleton height="16px" :count="3" />
      </div>
    </div>

    <!-- Could not load -->
    <div
      v-else-if="loadFailed"
      class="rounded-2xl bg-white border border-ink-200 p-6 flex flex-col items-center text-center gap-3"
      data-testid="warranties-load-error"
    >
      <p class="text-sm text-ink-700">Chưa tải được bảo hành, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="sm" @click="loadWarranties">Thử lại</FhButton>
    </div>

    <!-- Empty -->
    <div
      v-else-if="warrantyOrders.length === 0"
      class="text-center py-12 px-6 bg-white rounded-2xl border border-ink-200 space-y-2"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-3">
        <ShieldCheck :size="24" />
      </div>
      <h2 class="text-base font-semibold text-ink-900">Chưa có đơn nào đang được bảo hành</h2>
      <p class="text-sm text-ink-500 max-w-md mx-auto text-pretty">
        Đơn hoàn tất và đã thanh toán sẽ có bảo hành ở đây.
      </p>
    </div>

    <!-- One surface per order -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
      <section
        v-for="order in warrantyOrders"
        :key="order.orderId"
        class="rounded-2xl bg-white border border-ink-200 shadow-(--shadow-e1) p-5 space-y-4"
        :data-testid="`warranty-order-${order.orderId}`"
      >
        <div class="flex items-start justify-between gap-3">
          <router-link
            :to="`/app/orders/${order.orderId}`"
            class="min-w-0 group"
            :title="`Xem đơn ${order.orderCode}`"
          >
            <h2 class="font-semibold text-base text-ink-900 group-hover:text-brand-700 transition-colors text-pretty">
              {{ order.serviceName }}
            </h2>
            <p class="text-sm text-ink-500 font-num mt-0.5 inline-flex items-center gap-1 whitespace-nowrap">
              {{ order.orderCode }} <ChevronRight :size="14" />
            </p>
          </router-link>

          <span
            v-if="hasOpenClaim(order)"
            class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 bg-warning-50 text-warning-800 border border-warning-200"
          >
            Đang xử lý bảo hành
          </span>
          <span
            v-else-if="order.hasActiveCoverage"
            class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 bg-success-50 text-success-700 border border-success-200"
          >
            Còn {{ getDaysRemaining(order.maxExpiresAt) }}&nbsp;ngày
          </span>
          <span
            v-else
            class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 bg-ink-100 text-ink-600 border border-ink-200"
          >
            Hết hạn bảo hành
          </span>
        </div>

        <!-- Covered items -->
        <ul class="divide-y divide-ink-100 border-y border-ink-100 text-sm">
          <li v-for="item in order.coverages" :key="item.id" class="flex items-center justify-between gap-3 py-2.5">
            <span class="min-w-0 truncate text-ink-900" :title="item.itemDescription">{{ item.itemDescription }}</span>
            <span class="flex items-center gap-2 shrink-0 whitespace-nowrap">
              <span class="text-ink-500 font-num">{{ formatDate(item.expiresAt) }}</span>
              <span
                class="px-2 py-0.5 rounded-full text-xs font-medium"
                :class="item.status === 'ACTIVE' ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-500'"
              >
                {{ item.status === 'ACTIVE' ? 'Còn hạn' : 'Hết hạn' }}
              </span>
            </span>
          </li>
        </ul>

        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt class="text-ink-500">Bắt đầu</dt>
          <dd class="text-right font-num text-ink-900">{{ formatDate(order.minStartsAt) }}</dd>
          <dt class="text-ink-500">Hết hạn muộn nhất</dt>
          <dd class="text-right font-num font-medium text-ink-900">{{ formatDate(order.maxExpiresAt) }}</dd>
          <dt class="text-ink-500">Kỹ thuật viên</dt>
          <dd class="text-right text-ink-900">
            {{ order.technicianName }}
            <a
              v-if="order.technicianPhone"
              :href="`tel:${order.technicianPhone}`"
              class="text-ink-500 font-num whitespace-nowrap hover:text-brand-700"
            >{{ order.technicianPhone }}</a>
          </dd>
        </dl>

        <div v-if="order.claims.length" class="space-y-2">
          <WarrantyClaimCard
            v-for="claim in order.claims"
            :key="claim.id"
            :claim="claim"
            :coverage-label="coverageLabel(order, claim)"
            @updated="onClaimUpdated(order, $event)"
          />
        </div>

        <div class="flex justify-end">
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="allCoveragesBusy(order)"
            :title="allCoveragesBusy(order) ? 'Mọi hạng mục đang có yêu cầu chưa xử lý xong' : 'Gửi yêu cầu bảo hành'"
            @click="openClaimModal(order)"
          >
            Yêu cầu bảo hành
          </FhButton>
        </div>
      </section>
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
