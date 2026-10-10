<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  MapPin,
  Calendar,
  ChevronRight,
  Navigation,
  MessageSquare,
  Phone,
  Briefcase,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import { ordersApi, isHistoricalOrder, type HistoricalOrderItem, type ServiceOrderItem } from '../../api/orders.api';
import { useChatStore } from '../../stores/chat.store';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString } from '../../utils/vn-time';

const router = useRouter();
const chatStore = useChatStore();

type JobTab = 'all' | 'pending' | 'in_progress' | 'completed';

const activeTab = ref<JobTab>('all');
const loading = ref(true);
const loadError = ref('');
const actionLoading = ref<string | null>(null);
const jobs = ref<ServiceOrderItem[]>([]);
const historicalJobs = ref<HistoricalOrderItem[]>([]);

const loadJobs = async () => {
  loadError.value = '';
  try {
    const list = await ordersApi.getTechnicianJobs();
    jobs.value = list.filter((item): item is ServiceOrderItem => !isHistoricalOrder(item));
    historicalJobs.value = list.filter(isHistoricalOrder);
  } catch (err) {
    jobs.value = [];
    historicalJobs.value = [];
    loadError.value = userFacingError(err, 'Không thể tải danh sách công việc. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
};

const retry = async () => {
  loading.value = true;
  await loadJobs();
};

onMounted(() => {
  loadJobs();
});

const filteredJobs = computed(() => {
  return jobs.value.filter((job) => {
    const s = String(job.status).toUpperCase();
    if (activeTab.value === 'pending') {
      return ['ACCEPTED', 'EN_ROUTE'].includes(s);
    }
    if (activeTab.value === 'in_progress') {
      return ['UNDER_REPAIR', 'IN_PROGRESS'].includes(s);
    }
    if (activeTab.value === 'completed') {
      return s === 'COMPLETED';
    }
    return true;
  });
});

const visibleHistoricalJobs = computed(() => {
  if (activeTab.value === 'all') return historicalJobs.value;
  if (activeTab.value === 'completed') return historicalJobs.value.filter(job => job.status === 'COMPLETED');
  return [];
});
const pendingCount = computed(() => {
  return jobs.value.filter((j) => ['ACCEPTED', 'EN_ROUTE'].includes(String(j.status).toUpperCase())).length;
});

const inProgressCount = computed(() => {
  return jobs.value.filter((j) => ['UNDER_REPAIR', 'IN_PROGRESS'].includes(String(j.status).toUpperCase())).length;
});

const completedCount = computed(() => {
  return jobs.value.filter((j) => String(j.status).toUpperCase() === 'COMPLETED').length;
});

const tabs = computed(() => [
  { key: 'all' as const, label: 'Tất cả', count: jobs.value.length + historicalJobs.value.length },
  { key: 'pending' as const, label: 'Cần di chuyển', count: pendingCount.value },
  { key: 'in_progress' as const, label: 'Đang sửa chữa', count: inProgressCount.value },
  { key: 'completed' as const, label: 'Hoàn thành', count: completedCount.value },
]);

// Quick action: start moving to customer's home
const handleEnRoute = async (job: ServiceOrderItem) => {
  actionLoading.value = job.id;
  try {
    await ordersApi.enRoute(job.id);
    toast.success('Đã cập nhật: bạn đang trên đường tới nhà khách hàng.');
    await loadJobs();
  } catch (err: unknown) {
    toast.error(userFacingError(err, 'Không thể cập nhật trạng thái di chuyển. Vui lòng thử lại.'));
  } finally {
    actionLoading.value = null;
  }
};

const handleChatWithCustomer = async (job: ServiceOrderItem) => {
  const bookingId = job.bookingId || job.id;
  await chatStore.openConversationForBooking(bookingId);
  chatStore.toggleWidget(true);
};

const getGoogleMapsUrl = (job: ServiceOrderItem) => {
  if (job.destination?.lat != null && job.destination?.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${job.destination.lat},${job.destination.lng}`;
  }
  if (job.addressSummary) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.addressSummary)}`;
  }
  return null;
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
const secondaryAction = `h-10 px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors ${focusRing}`;
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Công việc</h1>

    <!-- Filter tabs -->
    <div
      class="flex items-center gap-1 p-1 bg-ink-100/80 rounded-2xl overflow-x-auto no-scrollbar text-sm font-semibold select-none"
      role="tablist"
      aria-label="Lọc công việc"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="h-10 px-4 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap"
        :class="[
          focusRing,
          activeTab === tab.key ? 'bg-white text-brand-700 shadow-xs' : 'text-ink-600 hover:text-ink-900',
        ]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span
          v-if="tab.key === 'all' || tab.count > 0"
          class="min-w-5 h-5 px-1.5 rounded-full text-xs font-num inline-flex items-center justify-center"
          :class="activeTab === tab.key ? 'bg-brand-50 text-brand-700' : 'bg-ink-200/60 text-ink-600'"
        >
          {{ tab.count }}
        </span>
      </button>
    </div>

    <!-- Loading: rows shaped like the list -->
    <div v-if="loading" class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải công việc">
      <div v-for="i in 3" :key="i" class="p-5 sm:p-6 space-y-3">
        <FhSkeleton width="35%" height="16px" />
        <FhSkeleton width="65%" height="22px" />
        <FhSkeleton width="85%" height="16px" />
        <FhSkeleton width="50%" height="40px" rounded="md" />
      </div>
    </div>

    <div
      v-else-if="loadError"
      role="alert"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3"
    >
      <span>{{ loadError }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="retry">Thử lại</FhButton>
    </div>

    <div
      v-else-if="filteredJobs.length === 0 && visibleHistoricalJobs.length === 0"
      class="text-center py-14 px-6 bg-white rounded-2xl border border-ink-200 space-y-3"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 mx-auto flex items-center justify-center">
        <Briefcase :size="24" />
      </div>
      <h3 class="text-base font-semibold text-ink-900">
        {{ activeTab === 'all' ? 'Chưa có công việc nào' : 'Không có công việc ở mục này' }}
      </h3>
      <p v-if="activeTab === 'all'" class="text-sm text-ink-500">Đơn bạn nhận sẽ hiện ở đây.</p>
    </div>

    <!-- One surface, one row per job -->
    <ul v-else class="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100 overflow-hidden">
      <li
        v-for="job in filteredJobs"
        :key="job.id"
        class="p-5 sm:p-6 flex gap-3 hover:bg-ink-25 transition-colors cursor-pointer"
        :data-testid="`technician-job-${job.id}`"
        @click="router.push(`/tech/jobs/${job.id}`)"
      >
        <div class="flex-1 min-w-0 space-y-3">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span class="font-num text-ink-500 whitespace-nowrap">#{{ job.code }}</span>
              <FhStatusPill :status="job.status" />
              <span class="inline-flex items-center gap-1 text-ink-600 whitespace-nowrap">
                <Calendar :size="14" class="text-ink-400" />
                {{ vnDateString(job.scheduledAt) }}
              </span>
            </div>
            <h3 class="font-semibold text-base sm:text-lg text-ink-900 text-balance">{{ job.serviceName }}</h3>
            <p class="text-sm text-ink-900">
              {{ job.customerName }}
              <span v-if="job.customerPhone" class="ml-1 font-num text-ink-500 whitespace-nowrap">{{ job.customerPhone }}</span>
            </p>
            <p class="text-sm text-ink-600 flex items-start gap-1.5">
              <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
              <span class="text-pretty">{{ job.addressSummary }}</span>
            </p>
          </div>

          <dl class="grid grid-cols-3 gap-3 max-w-md text-sm">
            <div class="min-w-0">
              <dt class="text-ink-500 whitespace-nowrap">Tiền công</dt>
              <dd class="font-num text-ink-900 whitespace-nowrap"><FhMoney :amount="job.laborTotal" /></dd>
            </div>
            <div class="min-w-0">
              <dt class="text-ink-500 whitespace-nowrap">Vật tư</dt>
              <dd class="font-num text-ink-900 whitespace-nowrap"><FhMoney :amount="job.partsTotal" /></dd>
            </div>
            <div class="min-w-0">
              <dt class="text-ink-500 whitespace-nowrap">Dự kiến thu</dt>
              <dd class="font-num font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="job.grandTotal" /></dd>
            </div>
          </dl>

          <div class="flex flex-wrap items-center gap-2">
            <FhButton
              v-if="String(job.status).toUpperCase() === 'ACCEPTED'"
              variant="primary"
              size="sm"
              class="h-10"
              :loading="actionLoading === job.id"
              @click.stop="handleEnRoute(job)"
            >
              <Navigation :size="16" />
              Bắt đầu di chuyển
            </FhButton>
            <a
              v-if="getGoogleMapsUrl(job)"
              :href="getGoogleMapsUrl(job)!"
              target="_blank"
              rel="noopener noreferrer"
              :class="secondaryAction"
              @click.stop
            >
              <Navigation :size="16" class="text-ink-500" />
              Chỉ đường
            </a>
            <button
              type="button"
              :class="secondaryAction"
              @click.stop="handleChatWithCustomer(job)"
            >
              <MessageSquare :size="16" class="text-ink-500" />
              Nhắn tin
            </button>
            <a
              v-if="job.customerPhone"
              :href="`tel:${job.customerPhone}`"
              :class="secondaryAction"
              @click.stop
            >
              <Phone :size="16" class="text-ink-500" />
              Gọi điện
            </a>
          </div>
        </div>
        <router-link
          :to="`/tech/jobs/${job.id}`"
          class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:bg-ink-100 hover:text-ink-700 hidden sm:flex items-center justify-center shrink-0 self-center"
          :class="focusRing"
          aria-label="Mở chi tiết công việc"
          @click.stop
        >
          <ChevronRight :size="20" aria-hidden="true" />
        </router-link>
      </li>

      <!-- Old orders: a short summary only, no customer details -->
      <li
        v-for="entry in visibleHistoricalJobs"
        :key="entry.id"
        data-testid="technician-historical-order"
      >
        <button
          type="button"
          class="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
          :class="focusRing"
          @click="router.push(`/tech/jobs/${entry.id}`)"
        >
          <span class="flex-1 min-w-0 space-y-1">
            <span class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span class="font-num text-ink-700 whitespace-nowrap">#{{ entry.code }}</span>
              <FhStatusPill :status="entry.status" />
              <span class="text-ink-500 whitespace-nowrap">{{ vnDateString(entry.createdAt) }}</span>
            </span>
            <span class="block text-sm text-ink-500">Đơn cũ, chỉ xem tóm tắt.</span>
          </span>
          <ChevronRight :size="18" class="text-ink-400 shrink-0" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>
