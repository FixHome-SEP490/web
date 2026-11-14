<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import {
  ChevronRight,
  X,
  Search,
  Phone,
  ShieldAlert,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { FhButton, FhPagination, FhSkeleton, FhStatusPill } from '../../components';
import WarrantyClaimCard from '../../components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal from '../../components/customer/WarrantyClaimModal.vue';
import { ordersApi, type OrderWarrantyGroup, type WarrantyClaimView } from '../../api/orders.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { isOpenClaim } from '../../utils/warranty-claim';
import { getServiceArtworkUrl } from '../../utils/service-presentation';
import { vnDateString } from '../../utils/vn-time';

const PAGE_SIZE = 10;
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
const expandedOrders = ref<Record<string, boolean>>({});

const toggleExpandOrder = (orderId: string) => {
  expandedOrders.value[orderId] = !expandedOrders.value[orderId];
};

const visibleCoverages = (order: OrderWarrantyGroup) =>
  expandedOrders.value[order.orderId] ? order.coverages : order.coverages.slice(0, 3);

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
  toast.success(`Đã gửi yêu cầu bảo hành cho đơn ${order.orderCode}. Kỹ thuật viên phụ trách sẽ liên hệ với bạn sớm.`);
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
  <div class="w-full space-y-6 pb-12">
    <!-- Header -->
    <div class="space-y-1 animate-slide-up">
      <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Bảo hành</h1>
      <p class="text-sm text-ink-500">
        Theo dõi quyền lợi bảo hành các dịch vụ đã hoàn thành và gửi yêu cầu bảo hành trực tiếp.
      </p>
    </div>

    <!-- Search & Filter bar (shown when there are warranty orders or active search) -->
    <div
      v-if="!loading && !loadFailed && warrantyOrders.length > 0"
      class="space-y-3 animate-slide-up-delay-1"
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
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" aria-busy="true" aria-label="Đang tải bảo hành">
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
      class="rounded-2xl bg-white border border-ink-200/80 p-8 flex flex-col items-center text-center gap-3"
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
      class="text-center py-14 px-6 bg-white rounded-2xl border border-ink-200/80 space-y-3"
    >
      <div class="mx-auto mb-3 max-w-[150px] sm:max-w-[170px] flex items-center justify-center">
        <img
          :src="'/images/home-appliance-repair.png'"
          alt=""
          class="w-full h-auto max-h-36 object-contain drop-shadow-sm select-none pointer-events-none"
          loading="lazy"
        />
      </div>
      <h2 class="text-base sm:text-lg font-semibold text-ink-900">Chưa có đơn nào đang được bảo hành</h2>
      <p class="text-sm text-ink-500 max-w-md mx-auto text-pretty">
        Đơn sửa chữa hoàn tất và đã thanh toán sẽ tự động kích hoạt gói bảo hành minh bạch tại đây.
      </p>
    </div>

    <!-- Search / Filter Empty -->
    <div
      v-else-if="filteredWarrantyOrders.length === 0 && warrantyOrders.length > 0"
      class="text-center py-12 px-6 bg-white rounded-2xl border border-ink-200/80 space-y-3"
    >
      <div class="mx-auto mb-2 max-w-[120px] flex items-center justify-center">
        <img
          :src="'/images/ui/empty-state-search-service.png'"
          alt=""
          class="w-full h-auto max-h-24 object-contain drop-shadow-sm select-none pointer-events-none"
          loading="lazy"
        />
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
      class="py-8 px-6 bg-white rounded-2xl border border-ink-200/80 text-center text-sm text-ink-600"
      data-testid="warranties-page-empty"
    >
      Các đơn ở trang này không có bảo hành.
    </p>

    <!-- One surface per order -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-slide-up-delay-2">
      <section
        v-for="order in filteredWarrantyOrders"
        :key="order.orderId"
        class="rounded-2xl bg-white border border-ink-200/80 p-5 sm:p-6 hover:border-ink-300 transition-[border-color] flex flex-col justify-between h-full"
        :data-testid="`warranty-order-${order.orderId}`"
      >
        <div class="space-y-4 flex-1 flex flex-col">
          <!-- Header: Service Artwork + Service Title + Status + Metadata Strip -->
          <div class="flex items-start gap-3.5">
            <router-link
              :to="`/app/orders/${order.orderId}`"
              class="w-14 h-14 rounded-[10px] bg-brand-50/70 border border-brand-100/80 flex items-center justify-center shrink-0 p-1.5 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              :title="`Xem đơn ${order.orderCode}`"
            >
              <img
                :src="getServiceArtworkUrl({ name: order.serviceName })"
                :alt="order.serviceName"
                class="w-full h-full object-contain select-none pointer-events-none group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform duration-150 ease-out"
                loading="lazy"
              />
            </router-link>

            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex items-start justify-between gap-2.5">
                <router-link
                  :to="`/app/orders/${order.orderId}`"
                  class="min-w-0 flex-1 group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  :title="`Xem đơn ${order.orderCode}`"
                >
                  <h2 class="font-bold text-base sm:text-[17px] leading-snug text-ink-900 group-hover:text-brand-600 transition-colors text-pretty line-clamp-2">
                    {{ order.serviceName }}
                  </h2>
                </router-link>

                <!-- Primary Status Badge -->
                <FhStatusPill
                  v-if="hasOpenClaim(order)"
                  status="PENDING_APPROVAL"
                  label="Đang xử lý"
                  pulse
                  class="shrink-0"
                />
                <FhStatusPill
                  v-else-if="order.hasActiveCoverage"
                  status="ACTIVE"
                  :label="`Còn ${getDaysRemaining(order.maxExpiresAt)} ngày`"
                  class="shrink-0"
                />
                <FhStatusPill
                  v-else
                  status="CANCELLED"
                  label="Hết hạn"
                  class="shrink-0"
                />
              </div>

              <!-- Flat Metadata Line -->
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500 font-num">
                <router-link
                  :to="`/app/orders/${order.orderId}`"
                  class="font-medium text-ink-700 hover:text-brand-600 transition-colors"
                >
                  #{{ order.orderCode }}
                </router-link>
                <span aria-hidden="true">·</span>
                <span>{{ formatDate(order.minStartsAt) }} – {{ formatDate(order.maxExpiresAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Covered Items Breakdown -->
          <div class="space-y-1.5 flex-1 flex flex-col justify-start pt-1">
            <p class="text-xs font-medium text-ink-500">
              Hạng mục ({{ order.coverages.length }})
            </p>

            <ul class="divide-y divide-ink-100 border-t border-b border-ink-100 text-xs">
              <li
                v-for="item in visibleCoverages(order)"
                :key="item.id"
                class="flex items-center justify-between gap-3 py-2.5"
              >
                <span class="min-w-0 truncate font-medium text-ink-800" :title="item.itemDescription">
                  {{ item.itemDescription }}
                </span>
                <span
                  class="font-num whitespace-nowrap shrink-0"
                  :class="item.status === 'ACTIVE' ? 'text-ink-600 font-medium' : 'text-ink-400'"
                >
                  {{ item.status === 'ACTIVE' ? formatDate(item.expiresAt) : 'Hết hạn' }}
                </span>
              </li>
            </ul>

            <button
              v-if="order.coverages.length > 3"
              type="button"
              class="self-start text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors py-1 cursor-pointer"
              @click="toggleExpandOrder(order.orderId)"
            >
              {{ expandedOrders[order.orderId] ? 'Thu gọn' : `+${order.coverages.length - 3} hạng mục khác` }}
            </button>
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

        <!-- Technician & Action Footer (Single clean row) -->
        <div class="pt-4 mt-4 border-t border-ink-100 flex items-center justify-between gap-3">
          <div v-if="order.technicianName" class="min-w-0 flex-1 space-y-0.5 text-xs">
            <p class="font-medium text-ink-800 truncate">{{ order.technicianName }}</p>
            <a
              v-if="order.technicianPhone"
              :href="`tel:${order.technicianPhone}`"
              class="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-num font-medium transition-colors"
              :title="`Gọi ${order.technicianPhone}`"
            >
              <Phone :size="11" />
              {{ order.technicianPhone }}
            </a>
          </div>
          <router-link
            v-else
            :to="`/app/orders/${order.orderId}`"
            class="inline-flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-brand-600 transition-colors"
          >
            <span>Chi tiết đơn</span>
            <ChevronRight :size="13" />
          </router-link>

          <FhButton
            variant="secondary"
            size="sm"
            class="shrink-0"
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
