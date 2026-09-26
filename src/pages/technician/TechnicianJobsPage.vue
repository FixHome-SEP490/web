<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Wrench,
  MapPin,
  Calendar,
  User,
  ChevronRight,
  Navigation,
  MessageSquare,
  Phone,
  Briefcase,
  Sparkles,
  Inbox,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCostBreakdown,
  FhMoney,
} from '../../components';
import { ordersApi, isHistoricalOrder, type HistoricalOrderItem, type ServiceOrderItem, type CanonicalOrderStatus } from '../../api/orders.api';
import { useChatStore } from '../../stores/chat.store';

const router = useRouter();
const chatStore = useChatStore();

type JobTab = 'all' | 'pending' | 'in_progress' | 'completed';

const activeTab = ref<JobTab>('all');
const loading = ref(true);
const actionLoading = ref<string | null>(null);
const jobs = ref<ServiceOrderItem[]>([]);
const historicalJobs = ref<HistoricalOrderItem[]>([]);

const loadJobs = async () => {
  try {
    const list = await ordersApi.getTechnicianJobs();
    jobs.value = list.filter((item): item is ServiceOrderItem => !isHistoricalOrder(item));
    historicalJobs.value = list.filter(isHistoricalOrder);
  } catch {
    jobs.value = [];
    historicalJobs.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadJobs();
});

const getStatusBadge = (status: CanonicalOrderStatus) => {
  const s = String(status).toUpperCase();
  switch (s) {
    case 'ACCEPTED':
      return { label: 'Chờ di chuyển', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'EN_ROUTE':
      return { label: 'Đang trên đường', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'UNDER_REPAIR':
    case 'IN_PROGRESS':
      return { label: 'Đang sửa chữa', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'COMPLETED':
      return { label: 'Hoàn thành', bg: 'bg-ink-100 text-ink-700 border-ink-200' };
    case 'CANCELLED':
      return { label: 'Đã huỷ', bg: 'bg-rose-100 text-rose-700 border-rose-200' };
    default:
      return { label: s, bg: 'bg-ink-100 text-ink-700 border-ink-200' };
  }
};

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

// Quick action: start moving to customer's home
const handleEnRoute = async (job: ServiceOrderItem) => {
  actionLoading.value = job.id;
  try {
    await ordersApi.enRoute(job.id);
    window.alert('Đã cập nhật: Bạn đang trên đường di chuyển tới nhà khách hàng.');
    await loadJobs();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể cập nhật trạng thái di chuyển.';
    window.alert(message);
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
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
          <Wrench class="text-brand-600" :size="24" />
          <span>Đơn Nhận Việc & Thực Thi</span>
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Quản lý tiến trình xử lý đơn hàng: di chuyển, check-in GPS, lập báo giá và hoàn tất nghiệm thu.
        </p>
      </div>

      <FhButton variant="secondary" size="sm" @click="router.push('/tech/invitations')">
        <Inbox :size="15" class="mr-1.5" /> Hộp thư mời nhận đơn
      </FhButton>
    </div>

    <!-- Filter Tabs (Matching Mobile Style) -->
    <div class="flex items-center gap-2 p-1 bg-ink-100/80 rounded-2xl overflow-x-auto no-scrollbar text-xs font-bold select-none">
      <button
        type="button"
        class="px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        :class="
          activeTab === 'all'
            ? 'bg-white text-brand-700 shadow-xs font-extrabold'
            : 'text-ink-600 hover:text-ink-900'
        "
        @click="activeTab = 'all'"
      >
        <span>Tất cả</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] font-num" :class="activeTab === 'all' ? 'bg-brand-50 text-brand-700' : 'bg-ink-200/60 text-ink-500'">
          {{ jobs.length + historicalJobs.length }}
        </span>
      </button>

      <button
        type="button"
        class="px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        :class="
          activeTab === 'pending'
            ? 'bg-white text-amber-700 shadow-xs font-extrabold'
            : 'text-ink-600 hover:text-ink-900'
        "
        @click="activeTab = 'pending'"
      >
        <span>Cần di chuyển</span>
        <span v-if="pendingCount > 0" class="px-1.5 py-0.2 rounded-full text-[10px] font-num bg-amber-100 text-amber-800">
          {{ pendingCount }}
        </span>
      </button>

      <button
        type="button"
        class="px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        :class="
          activeTab === 'in_progress'
            ? 'bg-white text-blue-700 shadow-xs font-extrabold'
            : 'text-ink-600 hover:text-ink-900'
        "
        @click="activeTab = 'in_progress'"
      >
        <span>Đang sửa chữa</span>
        <span v-if="inProgressCount > 0" class="px-1.5 py-0.2 rounded-full text-[10px] font-num bg-blue-100 text-blue-800">
          {{ inProgressCount }}
        </span>
      </button>

      <button
        type="button"
        class="px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        :class="
          activeTab === 'completed'
            ? 'bg-white text-ink-900 shadow-xs font-extrabold'
            : 'text-ink-600 hover:text-ink-900'
        "
        @click="activeTab = 'completed'"
      >
        <span>Hoàn thành</span>
        <span v-if="completedCount > 0" class="px-1.5 py-0.2 rounded-full text-[10px] font-num bg-ink-200 text-ink-700">
          {{ completedCount }}
        </span>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16 text-xs text-ink-500 font-medium">
      <Sparkles class="animate-spin text-brand-600 mx-auto mb-2" :size="28" />
      Đang tải danh sách công việc...
    </div>

    <!-- Empty State (Matching Mobile Style) -->
    <div
      v-else-if="filteredJobs.length === 0 && visibleHistoricalJobs.length === 0"
      class="text-center py-16 px-6 bg-white rounded-3xl border border-ink-200/80 shadow-xs space-y-3"
    >
      <div class="w-16 h-16 rounded-2xl bg-ink-100 text-ink-400 mx-auto flex items-center justify-center">
        <Briefcase :size="32" />
      </div>
      <h3 class="text-base font-extrabold text-ink-900">Chưa có công việc nào</h3>
      <p class="text-xs text-ink-500 max-w-sm mx-auto">
        Các đơn sửa chữa mới từ khách hàng hoặc lời mời phù hợp sẽ hiển thị ở đây khi bạn sẵn sàng nhận việc.
      </p>
    </div>

    <!-- Jobs List (Mobile Card Style) -->
    <div v-else class="space-y-4">
      <div
        v-for="job in filteredJobs"
        :key="job.id"
        class="bg-white rounded-3xl border border-ink-200/80 p-5 sm:p-6 shadow-xs hover:border-brand-300 hover:shadow-md transition-all space-y-4"
      >
        <!-- Card Top Bar: Code + Badge + Schedule -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3.5">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-bold text-ink-900">#{{ job.code }}</span>
            <span class="text-ink-300 text-xs">•</span>
            <span class="text-xs text-ink-500 flex items-center gap-1 font-medium">
              <Calendar :size="13" class="text-brand-600" />
              {{ new Date(job.scheduledAt).toLocaleDateString('vi-VN') }}
            </span>
          </div>

          <span
            class="px-2.5 py-1 rounded-full text-xs font-bold border"
            :class="getStatusBadge(job.status).bg"
          >
            {{ getStatusBadge(job.status).label }}
          </span>
        </div>

        <!-- Service Info & Customer Info Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <h3 class="font-extrabold text-base text-ink-900">
              {{ job.serviceName }}
            </h3>
            <p class="text-xs text-ink-600 flex items-start gap-1.5 leading-relaxed">
              <MapPin :size="14" class="text-brand-600 shrink-0 mt-0.5" />
              <span>{{ job.addressSummary }}</span>
            </p>
          </div>

          <div class="space-y-1.5 sm:text-right bg-ink-50/70 sm:bg-transparent p-3 sm:p-0 rounded-2xl">
            <div class="text-xs font-bold text-ink-900 flex items-center gap-1.5 sm:justify-end">
              <User :size="14" class="text-ink-400" />
              <span>Khách: {{ job.customerName }}</span>
            </div>
            <a
              :href="`tel:${job.customerPhone}`"
              class="inline-flex items-center gap-1 text-xs font-mono font-bold text-brand-600 hover:underline"
            >
              <Phone :size="12" /> {{ job.customerPhone }}
            </a>
          </div>
        </div>

        <!-- Cost Breakdown Bar & Action Buttons -->
        <div class="pt-4 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex-1 max-w-sm">
            <FhCostBreakdown :labor-total="job.laborTotal" :parts-total="job.partsTotal" />
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 flex-wrap">
            <div class="text-right mr-1">
              <span class="text-[11px] text-ink-400 block font-medium">Dự kiến thu:</span>
              <span class="text-sm sm:text-base font-extrabold font-num text-brand-700">
                <FhMoney :amount="job.grandTotal" />
              </span>
            </div>

            <!-- Quick Action: En Route Button if ACCEPTED -->
            <button
              v-if="String(job.status).toUpperCase() === 'ACCEPTED'"
              type="button"
              :disabled="actionLoading === job.id"
              class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
              @click.stop="handleEnRoute(job)"
            >
              <Navigation :size="14" />
              <span>Bắt đầu di chuyển</span>
            </button>

            <!-- Google Maps Directions Link -->
            <a
              v-if="getGoogleMapsUrl(job)"
              :href="getGoogleMapsUrl(job)!"
              target="_blank"
              rel="noopener noreferrer"
              class="px-2.5 py-2 rounded-xl bg-ink-100 hover:bg-ink-200 active:scale-95 text-ink-700 text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Mở chỉ đường trên Google Maps"
              @click.stop
            >
              <Navigation :size="13" class="text-brand-600" />
              <span>Chỉ đường</span>
            </a>

            <!-- Quick Chat with Customer Button -->
            <button
              type="button"
              class="px-3 py-2 rounded-xl bg-ink-100 hover:bg-ink-200 active:scale-95 text-ink-700 text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Nhắn tin với khách hàng"
              @click.stop="handleChatWithCustomer(job)"
            >
              <MessageSquare :size="14" class="text-brand-600" />
              <span>Nhắn tin</span>
            </button>

            <!-- Primary Open Workspace Button -->
            <FhButton variant="primary" size="sm" @click="router.push(`/tech/jobs/${job.id}`)">
              Vào Workspace <ChevronRight :size="14" class="ml-0.5" />
            </FhButton>
          </div>
        </div>
      </div>
      <div v-for="entry in visibleHistoricalJobs" :key="entry.id"
        data-testid="technician-historical-order"
        class="rounded-2xl border border-ink-200 bg-white p-5 space-y-2">
        <p class="text-xs font-bold text-ink-900">Mã đơn: {{ entry.code }}</p>
        <p class="text-xs text-ink-600">Trạng thái: {{ getStatusBadge(entry.status).label }}</p>
        <p class="text-xs text-ink-500">Ngày ghi nhận: {{ new Date(entry.createdAt).toLocaleDateString('vi-VN') }}</p>
        <p class="text-xs text-ink-500">Lịch sử công việc rút gọn. Không còn quyền xem thông tin riêng tư của khách.</p>
        <button type="button" class="text-xs font-semibold text-brand-700 underline"
          @click="router.push(`/tech/jobs/${entry.id}`)">Xem lịch sử đơn</button>
      </div>
    </div>
  </div>
</template>
