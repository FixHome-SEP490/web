<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X,
  Search,
  Phone,
  Wrench,
  ShieldAlert,
} from 'lucide-vue-next';
import { FhButton, FhPagination, FhSkeleton, FhStatusPill } from '../../components';
import WarrantyClaimCard from '../../components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal from '../../components/customer/WarrantyClaimModal.vue';
import { coverageKindLabel, ordersApi, type OrderWarrantyGroup, type WarrantyClaimView } from '../../api/orders.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { isOpenClaim } from '../../utils/warranty-claim';
import { vnDateString } from '../../utils/vn-time';

const PAGE_SIZE = 10;
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const cache = useCacheUpdates();

// Ten completed orders per page; warranties are read for those orders only.
const {
  page,
  items: warrantyOrders,
  total,
  loading,
  error: loadFailed,
  load: loadWarranties,
  prefetch,
} = usePagedList<OrderWarrantyGroup>({
  key: () => queryKeys.warranty.customerOrders({}),
  pageSize: PAGE_SIZE,
  fetch: (p, size) => ordersApi.getOrderWarrantiesPage(p, size),
});

// Filter and search state
type WarrantyTab = 'ALL' | 'ACTIVE' | 'PROCESSING' | 'EXPIRED';
const activeTab = ref<WarrantyTab>('ALL');
const searchQuery = ref('');

// Tab sliding indicator animation
const tabListRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({
  opacity: '0',
});

function updateTabIndicator() {
  const activeEl = tabRefs.value[activeTab.value];
  const container = tabListRef.value;
  if (!activeEl || !container) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = activeEl.offsetLeft;
  const top = activeEl.offsetTop;
  const width = activeEl.offsetWidth;
  const height = activeEl.offsetHeight;

  indicatorStyle.value = {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: width > 0 ? '1' : '0',
  };
}

function selectTab(key: WarrantyTab) {
  activeTab.value = key;
  const el = tabRefs.value[key];
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

watch([activeTab, warrantyOrders], () => {
  nextTick(updateTabIndicator);
});

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

const tabs = computed(() => [
  { key: 'ALL' as const, label: 'Tất cả', count: warrantyOrders.value.length },
  {
    key: 'ACTIVE' as const,
    label: 'Còn hiệu lực',
    count: warrantyOrders.value.filter((o) => o.hasActiveCoverage && !hasOpenClaim(o)).length,
  },
  {
    key: 'PROCESSING' as const,
    label: 'Đang xử lý',
    count: warrantyOrders.value.filter((o) => hasOpenClaim(o)).length,
  },
  {
    key: 'EXPIRED' as const,
    label: 'Đã hết hạn',
    count: warrantyOrders.value.filter((o) => !o.hasActiveCoverage && !hasOpenClaim(o)).length,
  },
]);

const filteredWarrantyOrders = computed(() => {
  let list = warrantyOrders.value;

  if (activeTab.value === 'ACTIVE') {
    list = list.filter((o) => o.hasActiveCoverage && !hasOpenClaim(o));
  } else if (activeTab.value === 'PROCESSING') {
    list = list.filter((o) => hasOpenClaim(o));
  } else if (activeTab.value === 'EXPIRED') {
    list = list.filter((o) => !o.hasActiveCoverage && !hasOpenClaim(o));
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((o) => {
      const codeMatch = o.orderCode?.toLowerCase().includes(q);
      const serviceMatch = o.serviceName?.toLowerCase().includes(q);
      const techMatch = o.technicianName?.toLowerCase().includes(q);
      const coverageMatch = o.coverages?.some((c) => c.itemDescription?.toLowerCase().includes(q));
      return codeMatch || serviceMatch || techMatch || coverageMatch;
    });
  }

  return list;
});
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
  cache.markChanged(affectedBy.warrantyChange);
  actionMessage.value = {
    type: 'success',
    text: `Đã gửi yêu cầu bảo hành cho đơn ${order.orderCode}. Kỹ thuật viên phụ trách sẽ liên hệ với bạn sớm.`,
  };
};

const onClaimUpdated = (order: OrderWarrantyGroup, claim: WarrantyClaimView) => {
  order.claims = order.claims.map((existing) => (existing.id === claim.id ? claim : existing));
  cache.markChanged(affectedBy.warrantyChange);
};

onMounted(() => {
  nextTick(() => {
    updateTabIndicator();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateTabIndicator);
    }
  });
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6 pb-12">
    <!-- Header -->
    <div class="space-y-1">
      <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Bảo hành</h1>
      <p class="text-sm text-ink-500">
        Theo dõi quyền lợi bảo hành các dịch vụ đã hoàn thành và gửi yêu cầu bảo hành trực tiếp.
      </p>
    </div>

    <!-- Result of the last action -->
    <div
      v-if="actionMessage"
      role="status"
      class="p-4 rounded-2xl text-sm flex items-center gap-3 transition-all"
      :class="
        actionMessage.type === 'success'
          ? 'bg-success-50 text-success-800 border border-success-200'
          : 'bg-danger-50 text-danger-800 border border-danger-200'
      "
    >
      <CheckCircle2
        v-if="actionMessage.type === 'success'"
        :size="18"
        class="text-success-600 shrink-0"
      />
      <AlertCircle v-else :size="18" class="text-danger-600 shrink-0" />
      <span class="flex-1 text-pretty font-medium">{{ actionMessage.text }}</span>
      <button
        type="button"
        class="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-ink-100 transition-colors shrink-0"
        aria-label="Đóng"
        @click="actionMessage = null"
      >
        <X :size="16" />
      </button>
    </div>

    <!-- Search & Filter bar (shown when there are warranty orders or active search) -->
    <div
      v-if="!loading && !loadFailed && warrantyOrders.length > 0"
      class="space-y-3"
    >
      <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <!-- Interactive animated sliding tab bar -->
        <div
          ref="tabListRef"
          class="relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 select-none scrollbar-none"
          role="tablist"
          aria-label="Lọc bảo hành"
        >
          <!-- Sliding active indicator pill -->
          <div
            class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
            :style="indicatorStyle"
            aria-hidden="true"
          />

          <button
            v-for="t in tabs"
            :key="t.key"
            :ref="(el) => { tabRefs[t.key] = el as HTMLElement }"
            type="button"
            role="tab"
            :aria-selected="activeTab === t.key"
            class="relative z-10 flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-medium transition-colors"
            :class="activeTab === t.key ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
            @click="selectTab(t.key)"
          >
            <span>{{ t.label }}</span>
            <span
              class="inline-flex items-center rounded-full px-1.5 py-0.2 font-num text-xs transition-colors"
              :class="activeTab === t.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-ink-200/60 text-ink-600'"
            >
              {{ t.count }}
            </span>
          </button>
        </div>

        <!-- Search input -->
        <div class="relative w-full sm:w-72">
          <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Tìm theo mã đơn, dịch vụ..."
            class="w-full h-10 pl-9 pr-8 bg-white border border-ink-200 rounded-xl text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 p-0.5 rounded-md"
            aria-label="Xoá tìm kiếm"
            @click="searchQuery = ''"
          >
            <X :size="14" />
          </button>
        </div>
      </div>
    </div>

    <!-- Loading: the shape of the cards -->
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-5" aria-busy="true" aria-label="Đang tải bảo hành">
      <div v-for="i in 2" :key="i" class="rounded-2xl bg-white border border-ink-200 p-5 sm:p-6 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <FhSkeleton width="60%" height="22px" />
          <FhSkeleton width="90px" height="24px" class="rounded-full" />
        </div>
        <FhSkeleton width="35%" height="16px" />
        <FhSkeleton height="16px" :count="3" />
        <div class="pt-2 flex justify-end">
          <FhSkeleton width="120px" height="36px" class="rounded-xl" />
        </div>
      </div>
    </div>

    <!-- Could not load -->
    <div
      v-else-if="loadFailed"
      class="rounded-2xl bg-white border border-ink-200 p-8 flex flex-col items-center text-center gap-3 shadow-xs"
      data-testid="warranties-load-error"
    >
      <div class="w-12 h-12 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center">
        <ShieldAlert :size="24" />
      </div>
      <p class="text-sm font-medium text-ink-700">Chưa tải được bảo hành, vui lòng thử lại.</p>
      <FhButton variant="secondary" size="sm" @click="loadWarranties">Thử lại</FhButton>
    </div>

    <!-- Empty completely -->
    <div
      v-else-if="warrantyOrders.length === 0 && total <= PAGE_SIZE"
      class="text-center py-16 px-6 bg-white rounded-2xl border border-ink-200 space-y-3 shadow-xs"
    >
      <div class="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-2">
        <ShieldCheck :size="28" />
      </div>
      <h2 class="text-base sm:text-lg font-semibold text-ink-900">Chưa có đơn nào đang được bảo hành</h2>
      <p class="text-sm text-ink-500 max-w-md mx-auto text-pretty">
        Đơn hoàn tất và đã thanh toán sẽ có bảo hành ở đây.
      </p>
    </div>

    <!-- Search / Filter Empty -->
    <div
      v-else-if="filteredWarrantyOrders.length === 0 && warrantyOrders.length > 0"
      class="text-center py-12 px-6 bg-white rounded-2xl border border-ink-200 space-y-2 shadow-xs"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-2">
        <Search :size="20" />
      </div>
      <h2 class="text-base font-semibold text-ink-900">Không tìm thấy đơn bảo hành phù hợp</h2>
      <p class="text-sm text-ink-500 max-w-md mx-auto text-pretty">
        Thử thay đổi từ khoá tìm kiếm hoặc chuyển sang bộ lọc khác.
      </p>
      <div class="pt-2">
        <button
          type="button"
          class="text-sm font-medium text-brand-600 hover:text-brand-700 underline"
          @click="searchQuery = ''; activeTab = 'ALL'"
        >
          Đặt lại bộ lọc
        </button>
      </div>
    </div>

    <p
      v-else-if="warrantyOrders.length === 0"
      class="py-8 px-6 bg-white rounded-2xl border border-ink-200 text-center text-sm text-ink-600"
      data-testid="warranties-page-empty"
    >
      Các đơn ở trang này không có bảo hành.
    </p>

    <!-- One surface per order -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <section
        v-for="order in filteredWarrantyOrders"
        :key="order.orderId"
        class="rounded-3xl bg-white border border-ink-200/90 shadow-(--shadow-e1) p-5 sm:p-6 hover:border-brand-200 hover:shadow-(--shadow-e2) transition-all flex flex-col justify-between h-full"
        :data-testid="`warranty-order-${order.orderId}`"
      >
        <div class="space-y-4 flex-1 flex flex-col">
          <!-- Top Row: Service Title, Order Code & Status Badge -->
          <div class="flex items-start justify-between gap-3 min-h-[44px]">
            <router-link
              :to="`/app/orders/${order.orderId}`"
              class="min-w-0 group block"
              :title="`Xem đơn ${order.orderCode}`"
            >
              <h2 class="font-bold text-base sm:text-lg text-ink-900 group-hover:text-brand-600 transition-colors text-pretty line-clamp-1">
                {{ order.serviceName }}
              </h2>
              <p class="text-xs text-ink-500 font-num mt-0.5 inline-flex items-center gap-1 whitespace-nowrap">
                #{{ order.orderCode }}
                <ChevronRight :size="13" class="text-ink-400 group-hover:translate-x-0.5 transition-transform" />
              </p>
            </router-link>

            <!-- Status Badge -->
            <FhStatusPill
              v-if="hasOpenClaim(order)"
              status="PENDING_APPROVAL"
              label="Đang xử lý bảo hành"
              pulse
            />
            <FhStatusPill
              v-else-if="order.hasActiveCoverage"
              status="ACTIVE"
              :label="`Còn ${getDaysRemaining(order.maxExpiresAt)} ngày`"
            />
            <FhStatusPill
              v-else
              status="CANCELLED"
              label="Hết hạn bảo hành"
            />
          </div>

          <!-- Middle: Time & Technician info card -->
          <div class="rounded-2xl bg-ink-50/70 border border-ink-100/80 p-3.5 space-y-2 text-xs">
            <div class="grid grid-cols-2 gap-2 text-ink-600">
              <div class="space-y-0.5">
                <span class="text-ink-400 text-[11px] block">Kích hoạt bảo hành</span>
                <span class="font-num font-medium text-ink-900">{{ formatDate(order.minStartsAt) }}</span>
              </div>
              <div class="space-y-0.5">
                <span class="text-ink-400 text-[11px] block">Hạn bảo hành muộn nhất</span>
                <span class="font-num font-bold text-ink-900">{{ formatDate(order.maxExpiresAt) }}</span>
              </div>
            </div>

            <div v-if="order.technicianName" class="pt-2 border-t border-ink-100/70 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-medium text-ink-900 truncate">{{ order.technicianName }}</span>
              </div>
              <a
                v-if="order.technicianPhone"
                :href="`tel:${order.technicianPhone}`"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-ink-200 text-ink-700 hover:text-brand-700 hover:border-brand-300 font-num text-xs font-medium transition-colors shrink-0"
                :title="`Gọi ${order.technicianPhone}`"
              >
                <Phone :size="11" class="text-brand-600" />
                {{ order.technicianPhone }}
              </a>
            </div>
          </div>

          <!-- Covered Items Breakdown -->
          <div class="space-y-1.5 flex-1 flex flex-col justify-start">
            <div class="flex items-center justify-between text-xs text-ink-500">
              <span class="font-medium flex items-center gap-1.5">
                <Wrench :size="13" class="text-ink-400" />
                Hạng mục bảo hành
              </span>
              <span class="text-[11px] font-num text-ink-400">{{ order.coverages.length }} hạng mục</span>
            </div>

            <div class="rounded-2xl border border-ink-100 bg-white overflow-hidden divide-y divide-ink-100/80 text-xs max-h-36 overflow-y-auto">
              <div
                v-for="item in order.coverages"
                :key="item.id"
                class="flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-ink-50/50 transition-colors"
              >
                <span class="min-w-0 truncate font-medium text-ink-800" :title="item.itemDescription">
                  <span v-if="coverageKindLabel(item.kind)" class="text-ink-500 font-normal">{{ coverageKindLabel(item.kind) }} · </span>{{ item.itemDescription }}
                </span>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-ink-400 font-num text-[11px]">{{ formatDate(item.expiresAt) }}</span>
                  <FhStatusPill
                    :status="item.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'"
                    :label="item.status === 'ACTIVE' ? 'Còn hạn' : 'Hết hạn'"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Active Claims (if any) -->
          <div v-if="order.claims.length" class="space-y-2 pt-1">
            <WarrantyClaimCard
              v-for="claim in order.claims"
              :key="claim.id"
              :claim="claim"
              :coverage-label="coverageLabel(order, claim)"
              @updated="onClaimUpdated(order, $event)"
            />
          </div>
        </div>

        <!-- Action Footer (Sticky at bottom of each card) -->
        <div class="pt-4 mt-4 border-t border-ink-100 flex items-center justify-between gap-3">
          <router-link
            :to="`/app/orders/${order.orderId}`"
            class="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            <span>Chi tiết đơn</span>
            <ChevronRight :size="13" />
          </router-link>

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

    <FhPagination
      v-if="!loading && !loadFailed"
      v-model:page="page"
      :page-size="PAGE_SIZE"
      :total="total"
      @prefetch="prefetch"
    />

    <!-- Direct Warranty Claim Modal -->
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
