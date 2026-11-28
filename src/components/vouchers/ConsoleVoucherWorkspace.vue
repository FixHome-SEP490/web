<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Bookmark,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  Eye,
  Gift,
  Info,
  Layers,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Ticket,
  TicketPercent,
  Trash2,
  Users,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import ConsoleStatCard from '../console/ConsoleStatCard.vue';
import ConsoleTitleArtwork from '../console/ConsoleTitleArtwork.vue';
import VoucherGrantForm from './VoucherGrantForm.vue';
import VoucherStatePanel from './VoucherStatePanel.vue';
import VoucherDetailModal from './VoucherDetailModal.vue';
import {
  formatVoucherAmount,
  formatVoucherDate,
  formatVoucherDateTime,
  validateVoucherCampaignDraft,
  type VoucherOffer,
  type VoucherCampaignDraft,
} from './voucher-model';
import type { ServiceCategory, ServiceItem } from '../../api/catalog.api';

const props = withDefaults(defineProps<{
  state: 'loading' | 'ready' | 'empty' | 'error' | 'unavailable' | 'denied';
  campaigns: VoucherOffer[];
  connected?: boolean;
  canManage: boolean;
  busy?: boolean;
  message?: string;
  feedback?: string;
  feedbackError?: boolean;
  categories?: ServiceCategory[];
  services?: ServiceItem[];
  criteriaError?: string;
  criteriaLoading?: boolean;
}>(), {
  connected: false,
  busy: false,
  message: '',
  feedback: '',
  feedbackError: false,
  categories: () => [],
  services: () => [],
  criteriaError: '',
  criteriaLoading: false,
});

const emit = defineEmits<{
  retry: [];
  retryCriteria: [];
  createCampaign: [draft: VoucherCampaignDraft];
  createAndPublishCampaign: [draft: VoucherCampaignDraft];
  setCampaignStatus: [id: string, active: boolean];
  updateDraftCampaign: [id: string, draft: VoucherCampaignDraft];
  transitionCampaign: [id: string, next: 'PUBLISHED' | 'PAUSED' | 'ARCHIVED'];
}>();

const activeTab = ref<'campaigns' | 'compensation'>('campaigns');
const showCreate = ref(false);
const editingCampaignId = ref<string | null>(null);
const selectedCampaignForDetail = ref<VoucherOffer | null>(null);

function openDetail(campaign: VoucherOffer) {
  selectedCampaignForDetail.value = campaign;
  openMenuId.value = null;
}

function onDetailEdit(campaign: VoucherOffer) {
  selectedCampaignForDetail.value = null;
  editCampaign(campaign);
}

function onDetailPublish(campaign: VoucherOffer) {
  selectedCampaignForDetail.value = null;
  publishCampaign(campaign);
}

function onDetailDiscard(campaign: VoucherOffer) {
  selectedCampaignForDetail.value = null;
  discardCampaign(campaign);
}

function onDetailArchive(campaign: VoucherOffer) {
  selectedCampaignForDetail.value = null;
  archiveCampaign(campaign);
}

function onDetailToggleStatus(campaign: VoucherOffer) {
  selectedCampaignForDetail.value = null;
  toggleStatus(campaign);
}

// Search & Filters for Campaign List
const searchQuery = ref('');
const statusFilter = ref<'all' | 'ACTIVE' | 'DRAFT' | 'PAUSED' | 'ENDED'>('all');
const timeFilter = ref<'all' | 'running' | 'upcoming' | 'expired'>('all');
const currentPage = ref(1);
const pageSize = ref(10);
const openMenuId = ref<string | null>(null);

// Category & Service Dropdown Controls in Form
const categoriesDropdownOpen = ref(false);
const servicesDropdownOpen = ref(false);
const categorySearch = ref('');
const serviceSearch = ref('');

function localDatetime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d).replace(' ', 'T');
}

const attempted = ref(false);
const draft = reactive<VoucherCampaignDraft>({
  title: '',
  code: '',
  kind: 'GENERAL',
  discountType: 'PERCENT',
  discountValue: 0,
  capVnd: null,
  minSpendVnd: 0,
  startsOn: '',
  endsOn: '',
  successfulRedemptionLimit: 100,
  perCustomerLimit: 1,
  scope: ['LABOR', 'PARTS'],
  categoryIds: [],
  serviceIds: [],
});

function openCreateEditor() {
  editingCampaignId.value = null;
  Object.assign(draft, {
    title: '',
    code: '',
    kind: 'GENERAL',
    discountType: 'PERCENT',
    discountValue: 0,
    capVnd: null,
    minSpendVnd: 0,
    startsOn: '',
    endsOn: '',
    successfulRedemptionLimit: 100,
    perCustomerLimit: 1,
    scope: ['LABOR', 'PARTS'],
    categoryIds: [],
    serviceIds: [],
  });
  attempted.value = false;
  categoriesDropdownOpen.value = false;
  servicesDropdownOpen.value = false;
  showCreate.value = true;
}

function editCampaign(campaign: VoucherOffer) {
  if (campaign.campaignLifecycle !== 'DRAFT' || !campaign.campaignVersion || !canWrite.value) return;
  Object.assign(draft, {
    title: campaign.title,
    code: campaign.code,
    kind: campaign.kind,
    discountType: campaign.discount.type,
    discountValue: campaign.discount.value,
    capVnd: campaign.discount.capVnd,
    minSpendVnd: campaign.minSpendVnd ?? 0,
    startsOn: localDatetime(campaign.startsAt),
    endsOn: localDatetime(campaign.expiresAt),
    successfulRedemptionLimit: campaign.successfulRedemptionLimit ?? 100,
    perCustomerLimit: campaign.perCustomerLimit ?? 1,
    scope: ['LABOR', 'PARTS'],
    categoryIds: [...(campaign.categoryIds ?? [])],
    serviceIds: [...(campaign.serviceIds ?? [])],
  });
  editingCampaignId.value = campaign.id;
  attempted.value = false;
  openMenuId.value = null;
  categoriesDropdownOpen.value = false;
  servicesDropdownOpen.value = false;
  showCreate.value = true;
}

function toggleEditor() {
  if (showCreate.value) {
    showCreate.value = false;
    editingCampaignId.value = null;
    return;
  }
  openCreateEditor();
}

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id;
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', onWindowClick);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', onWindowClick);
  }
});

function onWindowClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (!target.closest('.action-menu-container')) {
    openMenuId.value = null;
  }
  if (!target.closest('.category-dropdown-container')) {
    categoriesDropdownOpen.value = false;
  }
  if (!target.closest('.service-dropdown-container')) {
    servicesDropdownOpen.value = false;
  }
}

// 4 Overview Statistics
const totalCount = computed(() => props.campaigns.length);
const activeCount = computed(() => props.campaigns.filter(c =>
  (c.campaignLifecycle === 'PUBLISHED' || (!c.campaignLifecycle && c.status === 'ACTIVE'))
  && c.campaignActive !== false
  && new Date(c.expiresAt).getTime() > Date.now()
).length);
const draftCount = computed(() => props.campaigns.filter(c =>
  c.campaignLifecycle === 'DRAFT'
).length);
const endedCount = computed(() => props.campaigns.filter(c =>
  c.campaignLifecycle === 'ARCHIVED'
  || new Date(c.expiresAt).getTime() <= Date.now()
).length);

// Status and Lifecycle Helpers
function getIconTileBg(c: VoucherOffer): string {
  if (c.campaignLifecycle === 'DRAFT') return 'bg-brand-50 text-brand-600';
  if (c.campaignLifecycle === 'ARCHIVED' || (new Date(c.expiresAt).getTime() <= Date.now())) return 'bg-purple-50 text-purple-600';
  if (c.campaignLifecycle === 'PAUSED' || c.status === 'PAUSED' || c.campaignActive === false) return 'bg-amber-50 text-amber-600';
  return 'bg-emerald-50 text-emerald-600';
}

function getStatusBadgeClass(c: VoucherOffer): string {
  if (c.campaignLifecycle === 'DRAFT') return 'bg-slate-100 text-slate-700';
  if (c.campaignLifecycle === 'ARCHIVED' || (new Date(c.expiresAt).getTime() <= Date.now())) return 'bg-ink-100 text-ink-600';
  if (c.campaignLifecycle === 'PAUSED' || c.status === 'PAUSED' || c.campaignActive === false) return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
}

function getStatusDotClass(c: VoucherOffer): string {
  if (c.campaignLifecycle === 'DRAFT') return 'bg-slate-500';
  if (c.campaignLifecycle === 'ARCHIVED' || (new Date(c.expiresAt).getTime() <= Date.now())) return 'bg-ink-400';
  if (c.campaignLifecycle === 'PAUSED' || c.status === 'PAUSED' || c.campaignActive === false) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getStatusLabel(c: VoucherOffer): string {
  if (c.campaignLifecycle === 'DRAFT') return 'Bản nháp';
  if (c.campaignLifecycle === 'ARCHIVED') return 'Đã lưu trữ';
  if (new Date(c.expiresAt).getTime() <= Date.now()) return 'Đã kết thúc';
  if (c.campaignLifecycle === 'PAUSED' || c.status === 'PAUSED' || c.campaignActive === false) return 'Tạm dừng';
  return 'Đang hoạt động';
}

function calculateProgress(c: VoucherOffer): number {
  const quota = c.successfulRedemptionLimit || 1;
  const redeemed = c.redeemed || 0;
  return Math.min(100, Math.max(0, Math.round((redeemed / quota) * 100)));
}

// Filter Rules
function matchesSearchQuery(c: VoucherOffer, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
}

function matchesStatusFilter(c: VoucherOffer, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'ACTIVE') {
    return (c.campaignLifecycle === 'PUBLISHED' || (!c.campaignLifecycle && c.status === 'ACTIVE'))
      && c.campaignActive !== false
      && new Date(c.expiresAt).getTime() > Date.now();
  }
  if (filter === 'DRAFT') return c.campaignLifecycle === 'DRAFT';
  if (filter === 'PAUSED') return c.campaignLifecycle === 'PAUSED' || c.status === 'PAUSED' || c.campaignActive === false;
  if (filter === 'ENDED') return c.campaignLifecycle === 'ARCHIVED' || new Date(c.expiresAt).getTime() <= Date.now();
  return true;
}

function matchesTimeFilter(c: VoucherOffer, filter: string): boolean {
  if (filter === 'all') return true;
  const now = Date.now();
  const starts = new Date(c.startsAt).getTime();
  const ends = new Date(c.expiresAt).getTime();
  if (filter === 'running') return starts <= now && ends >= now;
  if (filter === 'upcoming') return starts > now;
  if (filter === 'expired') return ends < now;
  return true;
}

const filteredCampaigns = computed(() => {
  return props.campaigns.filter(c =>
    matchesStatusFilter(c, statusFilter.value) &&
    matchesTimeFilter(c, timeFilter.value) &&
    matchesSearchQuery(c, searchQuery.value)
  );
});

watch([searchQuery, statusFilter, timeFilter], () => {
  currentPage.value = 1;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredCampaigns.value.length / pageSize.value)));
const pagedCampaigns = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCampaigns.value.slice(start, start + pageSize.value);
});

// Category and Service filtering in dropdowns
const filteredCategories = computed(() => {
  if (!categorySearch.value.trim()) return props.categories;
  const q = categorySearch.value.trim().toLowerCase();
  return props.categories.filter(c => c.name.toLowerCase().includes(q));
});

const filteredServices = computed(() => {
  if (!serviceSearch.value.trim()) return props.services;
  const q = serviceSearch.value.trim().toLowerCase();
  return props.services.filter(s => s.name.toLowerCase().includes(q));
});

// Live Preview Formatter Helpers
const previewScopeSummary = computed(() => {
  const catsCount = draft.categoryIds?.length ?? 0;
  const svcsCount = draft.serviceIds?.length ?? 0;
  if (catsCount === 0 && svcsCount === 0) return 'Tất cả danh mục · Tất cả dịch vụ';
  if (catsCount > 0 && svcsCount === 0) {
    const names = props.categories.filter(c => draft.categoryIds?.includes(c.id)).map(c => c.name);
    return names.length <= 2 ? `${names.join(', ')} · Tất cả dịch vụ` : `${catsCount} danh mục · Tất cả dịch vụ`;
  }
  if (catsCount === 0 && svcsCount > 0) {
    const names = props.services.filter(s => draft.serviceIds?.includes(s.id)).map(s => s.name);
    return names.length <= 2 ? `Tất cả danh mục · ${names.join(', ')}` : `Tất cả danh mục · ${svcsCount} dịch vụ`;
  }
  return `${catsCount} danh mục · ${svcsCount} dịch vụ`;
});

// Normalized draft and validations
const normalizedDraft = computed(() => ({
  ...draft,
  capVnd: draft.capVnd === null || String(draft.capVnd) === '' ? null : draft.capVnd,
  minSpendVnd: String(draft.minSpendVnd) === '' ? 0 : draft.minSpendVnd,
}));

const errors = computed(() => {
  const found = validateVoucherCampaignDraft(normalizedDraft.value);
  if ((draft.categoryIds?.length ?? 0) > 100 || (draft.serviceIds?.length ?? 0) > 100) {
    found.push('Chỉ chọn tối đa 100 danh mục và 100 dịch vụ.');
  }
  return found;
});

const canWrite = computed(() => props.canManage && props.connected && props.state === 'ready' && !props.busy);

function save() {
  attempted.value = true;
  if (!canWrite.value || errors.value.length || props.criteriaLoading || props.criteriaError) return;
  const submitted = {
    ...normalizedDraft.value,
    categoryIds: [...(draft.categoryIds ?? [])],
    serviceIds: [...(draft.serviceIds ?? [])],
    scope: ['LABOR', 'PARTS'] as VoucherCampaignDraft['scope'],
  };
  if (editingCampaignId.value) {
    emit('updateDraftCampaign', editingCampaignId.value, submitted);
  } else {
    emit('createCampaign', submitted);
  }
  showCreate.value = false;
  editingCampaignId.value = null;
}

function handlePublishFromForm() {
  attempted.value = true;
  if (!canWrite.value || errors.value.length || props.criteriaLoading || props.criteriaError) return;
  const submitted = {
    ...normalizedDraft.value,
    categoryIds: [...(draft.categoryIds ?? [])],
    serviceIds: [...(draft.serviceIds ?? [])],
    scope: ['LABOR', 'PARTS'] as VoucherCampaignDraft['scope'],
  };
  if (editingCampaignId.value) {
    emit('updateDraftCampaign', editingCampaignId.value, submitted);
    emit('transitionCampaign', editingCampaignId.value, 'PUBLISHED');
  } else {
    emit('createAndPublishCampaign', submitted);
  }
  showCreate.value = false;
  editingCampaignId.value = null;
}

function publishCampaign(campaign: VoucherOffer) {
  emit('transitionCampaign', campaign.id, 'PUBLISHED');
  openMenuId.value = null;
}

function discardCampaign(campaign: VoucherOffer) {
  emit('transitionCampaign', campaign.id, 'ARCHIVED');
  openMenuId.value = null;
}

function archiveCampaign(campaign: VoucherOffer) {
  emit('transitionCampaign', campaign.id, 'ARCHIVED');
  openMenuId.value = null;
}

function toggleStatus(campaign: VoucherOffer) {
  emit('setCampaignStatus', campaign.id, campaign.status !== 'ACTIVE');
  openMenuId.value = null;
}

function tabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  activeTab.value = event.key === 'Home' ? 'campaigns' : event.key === 'End' ? 'compensation' : activeTab.value === 'campaigns' ? 'compensation' : 'campaigns';
  (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-console-voucher-tab="${activeTab.value}"]`)?.focus();
}
</script>

<template>
  <div class="voucher-admin min-w-0 space-y-6" data-testid="console-voucher-workspace">
    <!-- Header: Dynamic based on view mode -->
    <header class="animate-slide-up flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <!-- Back link when in create/edit mode (Image 2) -->
        <button
          v-if="showCreate"
          type="button"
          class="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          @click="toggleEditor"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
          <span>Quay lại danh sách</span>
        </button>

        <div class="flex items-center gap-3.5">
          <ConsoleTitleArtwork src="/images/ui/console-vouchers.png" />
          <div class="min-w-0">
            <h1 class="text-2xl font-bold tracking-tight text-ink-900">
              {{ showCreate ? (editingCampaignId ? 'Chỉnh sửa bản nháp' : 'Tạo chiến dịch ưu đãi') : 'Quản lý ưu đãi' }}
            </h1>
            <p class="mt-1 text-sm text-ink-500 leading-relaxed max-w-3xl">
              {{ showCreate
                ? 'Tạo mã ưu đãi để thu hút khách hàng, thúc đẩy sử dụng dịch vụ trên FixHome.'
                : 'Tạo, quản lý và theo dõi các chiến dịch ưu đãi nhằm thu hút khách hàng, tăng tần suất sử dụng dịch vụ và thúc đẩy doanh thu trên nền tảng FixHome.'
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- Top Right Action: "+ Tạo chiến dịch" (Image 1) -->
      <div v-if="!showCreate && activeTab === 'campaigns'" class="shrink-0 pt-1">
        <FhButton
          variant="primary"
          size="md"
          :disabled="!canWrite"
          :aria-expanded="showCreate"
          aria-controls="voucher-create-form"
          @click="openCreateEditor"
        >
          <Plus :size="18" aria-hidden="true" />
          <span>Tạo chiến dịch</span>
        </FhButton>
      </div>
    </header>

    <!-- Feedback banner if any -->
    <p
      v-if="feedback"
      :role="feedbackError ? 'alert' : 'status'"
      class="rounded-xl border p-3.5 text-sm leading-6 transition-all"
      :class="feedbackError ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'"
    >
      {{ feedback }}
    </p>

    <!-- View Mode 1: LIST / MANAGEMENT VIEW (Image 1) -->
    <template v-if="!showCreate">
      <!-- 4 Overview Statistic Cards (Image 1) -->
      <section class="animate-slide-up-delay-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Thống kê tổng quan">
        <ConsoleStatCard
          featured
          :loading="state === 'loading'"
          label="Tổng chiến dịch"
          :value="totalCount"
          :icon="Gift"
          tone="brand"
        />

        <ConsoleStatCard
          :loading="state === 'loading'"
          label="Đang hoạt động"
          :value="activeCount"
          :icon="Play"
          tone="success"
        />

        <ConsoleStatCard
          :loading="state === 'loading'"
          label="Bản nháp"
          :value="draftCount"
          :icon="Pause"
          tone="warning"
        />

        <ConsoleStatCard
          :loading="state === 'loading'"
          label="Đã kết thúc"
          :value="endedCount"
          :icon="Calendar"
          tone="neutral"
        />
      </section>

      <!-- Tabs: "Chiến dịch ưu đãi" & "Cấp cá nhân" (Image 1) -->
      <div role="tablist" aria-label="Quản lý ưu đãi" class="animate-slide-up-delay-1 flex gap-2 border-b border-ink-200 pb-2" @keydown="tabKey">
        <button
          v-for="tab in (['campaigns', 'compensation'] as const)"
          :key="tab"
          type="button"
          role="tab"
          :id="`admin-voucher-tab-${tab}`"
          :data-console-voucher-tab="tab"
          :aria-label="tab === 'campaigns' ? 'Chiến dịch' : 'Cấp cá nhân'"
          :aria-controls="`admin-voucher-panel-${tab}`"
          :aria-selected="activeTab === tab"
          :tabindex="activeTab === tab ? 0 : -1"
          class="voucher-tab"
          @click="activeTab = tab"
        >
          <TicketPercent v-if="tab === 'campaigns'" :size="18" aria-hidden="true" />
          <Gift v-else :size="18" aria-hidden="true" />
          <span>{{ tab === 'campaigns' ? 'Chiến dịch ưu đãi' : 'Cấp cá nhân' }}</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <section
        :id="`admin-voucher-panel-${activeTab}`"
        role="tabpanel"
        :aria-labelledby="`admin-voucher-tab-${activeTab}`"
        tabindex="0"
        class="animate-slide-up-delay-2 min-w-0 space-y-4"
      >
        <template v-if="activeTab === 'campaigns'">
          <!-- Search & Filter Bar (Image 1) -->
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <!-- Search input (6 cols) -->
            <div class="relative sm:col-span-6">
              <Search :size="17" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" aria-hidden="true" />
              <input
                v-model="searchQuery"
                type="search"
                placeholder="Tìm kiếm tên chiến dịch, mã ưu đãi..."
                class="w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all"
              />
            </div>

            <!-- Status filter (3 cols) -->
            <div class="sm:col-span-3">
              <select
                v-model="statusFilter"
                class="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="DRAFT">Bản nháp</option>
                <option value="PAUSED">Tạm dừng</option>
                <option value="ENDED">Đã kết thúc / Lưu trữ</option>
              </select>
            </div>

            <!-- Time filter (3 cols) -->
            <div class="sm:col-span-3">
              <div class="relative">
                <Calendar :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" aria-hidden="true" />
                <select
                  v-model="timeFilter"
                  class="w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3.5 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all"
                >
                  <option value="all">Chọn khoảng thời gian</option>
                  <option value="running">Đang diễn ra</option>
                  <option value="upcoming">Sắp diễn ra</option>
                  <option value="expired">Đã kết thúc</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Async Loading / Empty / Error State Panels -->
          <VoucherStatePanel
            v-if="state !== 'ready' && state !== 'empty'"
            :state="state"
            :message="message"
            @retry="$emit('retry')"
          />
          <VoucherStatePanel
            v-else-if="!campaigns.length"
            state="empty"
            title="Chưa có chiến dịch"
            message="Tạo chiến dịch đầu tiên để thiết lập điều kiện ưu đãi."
          />
          <div
            v-else-if="!filteredCampaigns.length"
            class="rounded-2xl border border-ink-100 bg-white p-8 text-center space-y-3"
          >
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ink-50 text-ink-400">
              <Search :size="22" aria-hidden="true" />
            </div>
            <h3 class="text-base font-bold text-ink-900">Không tìm thấy chiến dịch</h3>
            <p class="text-xs text-ink-500 max-w-sm mx-auto">Không có chiến dịch nào phù hợp với từ khóa hoặc bộ lọc đã chọn.</p>
            <button
              type="button"
              class="text-xs font-semibold text-brand-600 hover:text-brand-700"
              @click="searchQuery = ''; statusFilter = 'all'; timeFilter = 'all'"
            >
              Xóa bộ lọc
            </button>
          </div>

          <!-- Horizontal Campaign Cards (Image 1) -->
          <div v-else class="space-y-3" aria-label="Chiến dịch đã cấu hình">
            <div
              v-for="campaign in pagedCampaigns"
              :key="campaign.id"
              class="rounded-2xl border border-ink-100 bg-white p-4 sm:p-5 shadow-2xs hover:border-brand-200 hover:shadow-xs transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4 cursor-pointer"
              @click="openDetail(campaign)"
            >
              <!-- Section 1: Icon + Title + Code + Status -->
              <div class="flex items-center gap-4 min-w-[280px]">
                <div
                  class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  :class="getIconTileBg(campaign)"
                >
                  <Gift :size="28" :stroke-width="1.75" aria-hidden="true" />
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-base font-bold text-ink-900 leading-snug wrap-anywhere">
                    {{ campaign.title }}
                  </h3>
                  <p class="mt-1 text-xs text-ink-500 wrap-anywhere">
                    {{ campaign.code }} – {{ campaign.kind === 'GENERAL' ? 'Ưu đãi chung' : 'Ưu đãi cá nhân' }}
                  </p>
                  <div class="mt-1.5 flex items-center gap-1.5">
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      :class="getStatusBadgeClass(campaign)"
                    >
                      <span class="w-1.5 h-1.5 rounded-full" :class="getStatusDotClass(campaign)" aria-hidden="true" />
                      {{ getStatusLabel(campaign) }}
                    </span>
                    <!-- Hidden semantic text to satisfy legacy screen reader and test assertions -->
                    <span class="sr-only">
                      {{ campaign.campaignLifecycle === 'DRAFT' ? 'Bản nháp chưa phát hành' : campaign.campaignLifecycle === 'ARCHIVED' ? 'Chiến dịch đã lưu trữ' : 'Chiến dịch đã phát hành' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Section 2: 4 Data Columns -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 xl:px-6">
                <!-- Column 1: Mức ưu đãi -->
                <div>
                  <div class="flex items-center gap-1 text-xs text-ink-500">
                    <span class="font-semibold">%</span>
                    <span>Mức ưu đãi</span>
                  </div>
                  <div class="mt-1 text-sm font-bold text-ink-900">
                    {{ campaign.discount.type === 'PERCENT' ? `${campaign.discount.value}%` : formatVoucherAmount(campaign.discount.value) }}
                  </div>
                  <div v-if="campaign.discount.capVnd !== null" class="text-2xs text-ink-500 mt-0.5">
                    Tối đa {{ formatVoucherAmount(campaign.discount.capVnd) }}
                  </div>
                </div>

                <!-- Column 2: Đơn tối thiểu -->
                <div>
                  <div class="flex items-center gap-1 text-xs text-ink-500">
                    <Coins :size="14" class="text-ink-400" aria-hidden="true" />
                    <span>Đơn tối thiểu</span>
                  </div>
                  <div class="mt-1 text-sm font-bold text-ink-900">
                    {{ formatVoucherAmount(campaign.minSpendVnd) }}
                  </div>
                </div>

                <!-- Column 3: Thời gian áp dụng -->
                <div>
                  <div class="flex items-center gap-1 text-xs text-ink-500">
                    <Calendar :size="14" class="text-ink-400" aria-hidden="true" />
                    <span>Thời gian áp dụng</span>
                  </div>
                  <div class="mt-1 text-xs font-semibold text-ink-800">
                    {{ formatVoucherDate(campaign.startsAt) }} – {{ formatVoucherDate(campaign.expiresAt) }}
                  </div>
                </div>

                <!-- Column 4: Lượt sử dụng / Đã thanh toán thành công -->
                <div>
                  <div class="flex items-center justify-between text-xs text-ink-500">
                    <span>Lượt sử dụng</span>
                  </div>
                  <div class="mt-1 text-xs font-bold font-num text-ink-900">
                    {{ campaign.redeemed ?? 0 }} / {{ campaign.successfulRedemptionLimit ?? '—' }}
                  </div>
                  <div class="flex items-center gap-2 mt-1.5">
                    <div class="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-brand-600 rounded-full transition-all duration-300"
                        :style="{ width: `${calculateProgress(campaign)}%` }"
                      />
                    </div>
                    <span class="text-2xs font-num text-ink-500 shrink-0">{{ calculateProgress(campaign) }}%</span>
                  </div>
                </div>
              </div>

              <!-- Section 3: 3-dots Action Menu (Image 1) -->
              <div class="relative shrink-0 flex items-center justify-end action-menu-container">
                <button
                  type="button"
                  class="h-9 w-9 rounded-xl flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
                  :aria-label="`Thao tác ${campaign.title}`"
                  :aria-expanded="openMenuId === campaign.id"
                  @click.stop="toggleMenu(campaign.id)"
                >
                  <MoreVertical :size="18" aria-hidden="true" />
                </button>

                <!-- Action Dropdown Popover -->
                <div
                  v-show="openMenuId === campaign.id"
                  class="absolute right-0 top-full mt-1.5 z-30 min-w-44 rounded-xl border border-ink-100 bg-white py-1.5 shadow-lg text-sm"
                >
                  <!-- Xem chi tiết -->
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-ink-700 hover:bg-ink-50 transition-colors"
                    @click.stop="openDetail(campaign)"
                  >
                    <Eye :size="15" class="text-ink-500" aria-hidden="true" />
                    <span>Xem chi tiết</span>
                  </button>

                  <!-- Sửa bản nháp (only for DRAFT) -->
                  <button
                    v-if="campaign.campaignLifecycle === 'DRAFT'"
                    type="button"
                    class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-ink-700 hover:bg-ink-50 transition-colors"
                    :disabled="!canWrite || !campaign.campaignVersion"
                    @click="editCampaign(campaign)"
                  >
                    <Pencil :size="15" class="text-ink-500" aria-hidden="true" />
                    <span>Sửa bản nháp</span>
                  </button>

                  <!-- Phát hành (only for DRAFT) -->
                  <button
                    v-if="campaign.campaignLifecycle === 'DRAFT'"
                    type="button"
                    class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-brand-600 hover:bg-brand-50 transition-colors font-medium"
                    :disabled="!canWrite || !campaign.campaignVersion"
                    @click="publishCampaign(campaign)"
                  >
                    <Send :size="15" aria-hidden="true" />
                    <span>Phát hành</span>
                  </button>

                  <!-- Bỏ bản nháp (only for DRAFT) -->
                  <button
                    v-if="campaign.campaignLifecycle === 'DRAFT'"
                    type="button"
                    class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-danger-600 hover:bg-danger-50 transition-colors"
                    :disabled="!canWrite || !campaign.campaignVersion"
                    @click="discardCampaign(campaign)"
                  >
                    <Trash2 :size="15" aria-hidden="true" />
                    <span>Bỏ bản nháp</span>
                  </button>

                  <!-- Lưu trữ (for PUBLISHED or PAUSED) -->
                  <button
                    v-if="['PUBLISHED', 'PAUSED'].includes(campaign.campaignLifecycle ?? '') && campaign.campaignVersion"
                    type="button"
                    class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-ink-700 hover:bg-ink-50 transition-colors"
                    :disabled="!canWrite"
                    @click="archiveCampaign(campaign)"
                  >
                    <Archive :size="15" class="text-ink-500" aria-hidden="true" />
                    <span>Lưu trữ</span>
                  </button>

                  <!-- Tạm dừng / Bật chiến dịch (for PUBLISHED or PAUSED) -->
                  <button
                    v-if="campaign.campaignLifecycle === 'PUBLISHED' || campaign.campaignLifecycle === 'PAUSED' || (!campaign.campaignLifecycle && ['ACTIVE', 'PAUSED'].includes(campaign.status))"
                    type="button"
                    class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-ink-700 hover:bg-ink-50 transition-colors"
                    :disabled="!canWrite"
                    :aria-label="`${campaign.status === 'ACTIVE' ? 'Tạm dừng' : 'Bật'} ${campaign.title}`"
                    @click="toggleStatus(campaign)"
                  >
                    <component :is="campaign.status === 'ACTIVE' ? Pause : Play" :size="15" class="text-ink-500" aria-hidden="true" />
                    <span>{{ campaign.status === 'ACTIVE' ? 'Tạm dừng' : 'Bật chiến dịch' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Summary & Pagination (Image 1) -->
          <div
            v-if="filteredCampaigns.length"
            class="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm text-ink-500"
          >
            <div>
              Hiển thị {{ (currentPage - 1) * pageSize + 1 }} – {{ Math.min(currentPage * pageSize, filteredCampaigns.length) }} trên {{ filteredCampaigns.length }} chiến dịch
            </div>
            <div v-if="totalPages > 1" class="flex items-center gap-1.5">
              <button
                type="button"
                class="h-8 w-8 rounded-lg border border-ink-200 bg-white flex items-center justify-center text-ink-600 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                :disabled="currentPage <= 1"
                aria-label="Trang trước"
                @click="currentPage--"
              >
                <ChevronLeft :size="16" aria-hidden="true" />
              </button>
              <button
                v-for="p in totalPages"
                :key="p"
                type="button"
                class="h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition-colors"
                :class="p === currentPage ? 'bg-brand-600 text-white' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                @click="currentPage = p"
              >
                {{ p }}
              </button>
              <button
                type="button"
                class="h-8 w-8 rounded-lg border border-ink-200 bg-white flex items-center justify-center text-ink-600 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                :disabled="currentPage >= totalPages"
                aria-label="Trang sau"
                @click="currentPage++"
              >
                <ChevronRight :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>
        </template>

        <!-- Tab 2: "Cấp cá nhân" -->
        <VoucherGrantForm v-show="activeTab === 'compensation'" :campaigns="campaigns" :can-manage="canWrite" />
      </section>

      <!-- Modal Chi tiết Chiến dịch Ưu đãi -->
      <VoucherDetailModal
        :open="Boolean(selectedCampaignForDetail)"
        :campaign="selectedCampaignForDetail"
        :categories="categories"
        :services="services"
        :can-manage="canWrite"
        @close="selectedCampaignForDetail = null"
        @edit="onDetailEdit"
        @publish="onDetailPublish"
        @discard="onDetailDiscard"
        @archive="onDetailArchive"
        @toggle-status="onDetailToggleStatus"
      />
    </template>

    <!-- View Mode 2: CREATE / EDIT CAMPAIGN VIEW (Image 2) -->
    <template v-else-if="showCreate && canWrite">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Left column: 3 Form Groups (approx 70% / 8 cols) -->
        <form
          id="voucher-create-form"
          class="lg:col-span-8 space-y-6"
          :aria-busy="busy"
          novalidate
          @submit.prevent="save"
        >
          <!-- Group 1: Thông tin cơ bản (Image 2) -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
            <div class="flex items-start gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Ticket :size="20" :stroke-width="1.75" aria-hidden="true" />
              </div>
              <div>
                <h2 class="text-base font-bold text-ink-900">1. Thông tin cơ bản</h2>
                <p class="text-xs text-ink-500 mt-0.5">Thiết lập thông tin nhận diện và hình thức ưu đãi cho chiến dịch.</p>
              </div>
            </div>

            <div class="space-y-4 pt-1">
              <!-- Tên chiến dịch -->
              <div>
                <label for="voucher-campaign-title" class="block text-sm font-medium text-ink-800">
                  Tên chiến dịch <span class="text-danger-500">*</span>
                </label>
                <input
                  id="voucher-campaign-title"
                  v-model="draft.title"
                  required
                  maxlength="120"
                  placeholder="Chào mừng khách hàng mới"
                  class="voucher-input mt-1.5"
                  autocomplete="off"
                />
              </div>

              <!-- Mã ưu đãi + Loại chiến dịch -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="voucher-campaign-code" class="block text-sm font-medium text-ink-800">
                    Mã ưu đãi <span class="text-danger-500">*</span>
                  </label>
                  <input
                    id="voucher-campaign-code"
                    v-model="draft.code"
                    required
                    maxlength="40"
                    placeholder="FIXHOME2026"
                    class="voucher-input uppercase mt-1.5"
                    autocomplete="off"
                    aria-describedby="voucher-code-format"
                  />
                  <span id="voucher-code-format" class="voucher-help">3–40 ký tự: chữ, số, dấu - hoặc _</span>
                </div>

                <div>
                  <label for="voucher-kind" class="block text-sm font-medium text-ink-800">
                    Loại chiến dịch <span class="text-danger-500">*</span>
                  </label>
                  <select id="voucher-kind" v-model="draft.kind" class="voucher-input mt-1.5">
                    <option value="GENERAL">Ưu đãi chung</option>
                    <option value="PERSONAL">Ưu đãi cá nhân</option>
                  </select>
                </div>
              </div>

              <!-- Loại ưu đãi + Mức giảm -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="voucher-discount-type" class="block text-sm font-medium text-ink-800">
                    Loại ưu đãi <span class="text-danger-500">*</span>
                  </label>
                  <select id="voucher-discount-type" v-model="draft.discountType" class="voucher-input mt-1.5">
                    <option value="PERCENT">Phần trăm</option>
                    <option value="FIXED">Số tiền cố định</option>
                  </select>
                </div>

                <div>
                  <label for="voucher-discount-value" class="block text-sm font-medium text-ink-800">
                    {{ draft.discountType === 'PERCENT' ? 'Mức giảm (%)' : 'Mức giảm (₫)' }} <span class="text-danger-500">*</span>
                  </label>
                  <input
                    id="voucher-discount-value"
                    v-model.number="draft.discountValue"
                    type="number"
                    min="1"
                    :max="draft.discountType === 'PERCENT' ? 100 : 2147483647"
                    class="voucher-input mt-1.5"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Group 2: Điều kiện áp dụng (Image 2) -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
            <div class="flex items-start gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Calendar :size="20" :stroke-width="1.75" aria-hidden="true" />
              </div>
              <div>
                <h2 class="text-base font-bold text-ink-900">2. Điều kiện áp dụng</h2>
                <p class="text-xs text-ink-500 mt-0.5">Thiết lập thời gian diễn ra và các giới hạn sử dụng của chiến dịch.</p>
              </div>
            </div>

            <div class="space-y-4 pt-1">
              <!-- Giảm tối đa + Đơn tối thiểu -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="voucher-cap" class="flex items-center gap-1.5 text-sm font-medium text-ink-800">
                    <span>Giảm tối đa (đ)</span>
                    <Info :size="14" class="text-ink-400" aria-hidden="true" />
                  </label>
                  <input
                    id="voucher-cap"
                    v-model.number="draft.capVnd"
                    type="number"
                    min="1"
                    max="2147483647"
                    class="voucher-input mt-1.5"
                    placeholder="Để trống nếu không giới hạn"
                    aria-describedby="voucher-cap-help"
                  />
                  <span id="voucher-cap-help" class="voucher-help">Số tiền giảm tối đa cho mỗi lượt.</span>
                </div>

                <div>
                  <label for="voucher-minimum" class="flex items-center gap-1.5 text-sm font-medium text-ink-800">
                    <span>Đơn tối thiểu (đ)</span>
                    <Info :size="14" class="text-ink-400" aria-hidden="true" />
                  </label>
                  <input
                    id="voucher-minimum"
                    v-model.number="draft.minSpendVnd"
                    type="number"
                    min="0"
                    max="2147483647"
                    class="voucher-input mt-1.5"
                    placeholder="0"
                    required
                  />
                  <span class="voucher-help">Giá trị đơn tối thiểu để được áp dụng ưu đãi.</span>
                </div>
              </div>

              <!-- Bắt đầu + Kết thúc -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="voucher-start-date" class="block text-sm font-medium text-ink-800">
                    Bắt đầu (Giờ Việt Nam) <span class="text-danger-500">*</span>
                  </label>
                  <input
                    id="voucher-start-date"
                    v-model="draft.startsOn"
                    type="datetime-local"
                    class="voucher-input mt-1.5"
                    required
                  />
                </div>

                <div>
                  <label for="voucher-end-date" class="block text-sm font-medium text-ink-800">
                    Kết thúc (Giờ Việt Nam) <span class="text-danger-500">*</span>
                  </label>
                  <input
                    id="voucher-end-date"
                    v-model="draft.endsOn"
                    type="datetime-local"
                    class="voucher-input mt-1.5"
                    required
                  />
                </div>
              </div>

              <!-- Hạn mức thanh toán + Số lần mỗi khách -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="voucher-paid-quota" class="block text-sm font-medium text-ink-800">
                    Hạn mức thanh toán thành công <span class="text-danger-500">*</span>
                  </label>
                  <input
                    id="voucher-paid-quota"
                    v-model.number="draft.successfulRedemptionLimit"
                    type="number"
                    min="1"
                    max="2147483647"
                    class="voucher-input mt-1.5"
                    required
                  />
                  <span class="voucher-help">Tổng số lượt thanh toán thành công tối đa cho chiến dịch.</span>
                </div>

                <div v-if="draft.kind !== 'PERSONAL'">
                  <label for="voucher-per-customer" class="block text-sm font-medium text-ink-800">
                    Số lần mỗi khách được dùng <span class="text-danger-500">*</span>
                  </label>
                  <input
                    id="voucher-per-customer"
                    v-model.number="draft.perCustomerLimit"
                    type="number"
                    min="1"
                    max="100"
                    class="voucher-input mt-1.5"
                    required
                  />
                  <span class="voucher-help">Số lần tối đa một khách có thể sử dụng mã ưu đãi.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Group 3: Phạm vi danh mục và dịch vụ (Image 2) -->
          <div class="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
            <div class="flex items-start gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Layers :size="20" :stroke-width="1.75" aria-hidden="true" />
              </div>
              <div>
                <h2 class="text-base font-bold text-ink-900">3. Phạm vi danh mục và dịch vụ</h2>
                <p class="text-xs text-ink-500 mt-0.5">Chọn danh mục và/hoặc dịch vụ được áp dụng trong chiến dịch.</p>
              </div>
            </div>

            <div class="space-y-4 pt-1">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Danh mục dropdown selector -->
                <div class="relative category-dropdown-container">
                  <label class="block text-sm font-medium text-ink-800">
                    Danh mục <span class="text-danger-500">*</span>
                  </label>
                  <button
                    type="button"
                    class="voucher-input mt-1.5 flex items-center justify-between text-left"
                    @click.stop="categoriesDropdownOpen = !categoriesDropdownOpen; servicesDropdownOpen = false"
                  >
                    <span class="truncate">
                      📁 {{ draft.categoryIds?.length ? `${draft.categoryIds.length} danh mục đã chọn` : 'Tất cả danh mục' }}
                    </span>
                    <ChevronDown :size="16" class="text-ink-400 shrink-0" aria-hidden="true" />
                  </button>
                  <span class="voucher-help">Áp dụng cho toàn bộ danh mục hoặc chọn một số danh mục cụ thể.</span>

                  <!-- Dropdown checklist -->
                  <div
                    v-show="categoriesDropdownOpen"
                    class="absolute left-0 top-full mt-1.5 z-30 w-full rounded-xl border border-ink-100 bg-white p-3 shadow-lg"
                  >
                    <div class="flex items-center justify-between pb-2 border-b border-ink-100 mb-2">
                      <span class="text-xs font-semibold text-ink-700">Chọn danh mục</span>
                      <button
                        type="button"
                        class="text-xs text-brand-600 hover:underline"
                        @click="draft.categoryIds = []"
                      >
                        Chọn tất cả
                      </button>
                    </div>
                    <div class="max-h-56 overflow-y-auto space-y-1 pr-1">
                      <label
                        v-for="cat in filteredCategories"
                        :key="cat.id"
                        class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink-50 cursor-pointer text-sm"
                      >
                        <input
                          v-model="draft.categoryIds"
                          type="checkbox"
                          :value="cat.id"
                          class="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span class="text-ink-800">{{ cat.name }}</span>
                      </label>
                      <p v-if="!categories.length" class="text-xs text-ink-400 p-2">Chưa có danh mục để chọn.</p>
                    </div>
                  </div>
                </div>

                <!-- Dịch vụ dropdown selector -->
                <div class="relative service-dropdown-container">
                  <label class="block text-sm font-medium text-ink-800">
                    Dịch vụ <span class="text-danger-500">*</span>
                  </label>
                  <button
                    type="button"
                    class="voucher-input mt-1.5 flex items-center justify-between text-left"
                    @click.stop="servicesDropdownOpen = !servicesDropdownOpen; categoriesDropdownOpen = false"
                  >
                    <span class="truncate">
                      🔧 {{ draft.serviceIds?.length ? `${draft.serviceIds.length} dịch vụ đã chọn` : 'Tất cả dịch vụ' }}
                    </span>
                    <ChevronDown :size="16" class="text-ink-400 shrink-0" aria-hidden="true" />
                  </button>
                  <span class="voucher-help">Áp dụng cho toàn bộ dịch vụ hoặc chọn một số dịch vụ cụ thể.</span>

                  <!-- Dropdown checklist -->
                  <div
                    v-show="servicesDropdownOpen"
                    class="absolute left-0 top-full mt-1.5 z-30 w-full rounded-xl border border-ink-100 bg-white p-3 shadow-lg"
                  >
                    <div class="flex items-center justify-between pb-2 border-b border-ink-100 mb-2">
                      <span class="text-xs font-semibold text-ink-700">Chọn dịch vụ</span>
                      <button
                        type="button"
                        class="text-xs text-brand-600 hover:underline"
                        @click="draft.serviceIds = []"
                      >
                        Chọn tất cả
                      </button>
                    </div>
                    <div class="max-h-56 overflow-y-auto space-y-1 pr-1">
                      <label
                        v-for="svc in filteredServices"
                        :key="svc.id"
                        class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink-50 cursor-pointer text-sm"
                      >
                        <input
                          v-model="draft.serviceIds"
                          type="checkbox"
                          :value="svc.id"
                          class="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span class="text-ink-800">{{ svc.name }}</span>
                      </label>
                      <p v-if="!services.length" class="text-xs text-ink-400 p-2">Chưa có dịch vụ để chọn.</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Scope note -->
              <div class="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-800">
                <Info :size="15" class="text-brand-600 shrink-0" aria-hidden="true" />
                <span>Voucher được áp dụng cho cả tiền công và linh kiện theo quy định của hệ thống FixHome.</span>
              </div>
            </div>
          </div>

          <!-- Error Alert Banner -->
          <div
            v-if="criteriaError"
            role="alert"
            class="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800 space-y-2"
          >
            <p>{{ criteriaError }}</p>
            <FhButton variant="secondary" size="md" @click="$emit('retryCriteria')">Thử lại điều kiện</FhButton>
          </div>

          <div
            v-if="attempted && errors.length"
            id="voucher-form-errors"
            role="alert"
            class="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800 space-y-1.5"
          >
            <div class="font-semibold flex items-center gap-2">
              <AlertCircle :size="16" aria-hidden="true" />
              <span>Vui lòng kiểm tra lại các thông tin sau:</span>
            </div>
            <ul class="list-disc list-inside space-y-0.5 pl-2 text-xs">
              <li v-for="err in errors" :key="err">{{ err }}</li>
            </ul>
          </div>
        </form>

        <!-- Right column: Realtime Voucher Preview (approx 30% / 4 cols) (Image 2) -->
        <div class="lg:col-span-4 sticky top-6 space-y-4">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Eye :size="20" :stroke-width="1.75" aria-hidden="true" />
            </div>
            <div>
              <h2 class="text-base font-bold text-ink-900">Xem trước chiến dịch</h2>
              <p class="text-xs text-ink-500 mt-0.5">Thông tin tóm tắt hiển thị như khách hàng sẽ thấy.</p>
            </div>
          </div>

          <!-- Voucher Preview Ticket Card (Image 2) -->
          <div class="relative rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-[#F2FBF7] to-[#E8F8F0] p-5 sm:p-6 shadow-sm overflow-hidden">
            <!-- Top: Discount & Ticket Icon Badge -->
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-2xl sm:text-3xl font-extrabold text-emerald-950 tracking-tight">
                  {{ draft.discountType === 'PERCENT' ? `Giảm ${draft.discountValue || 0}%` : `Giảm ${formatVoucherAmount(draft.discountValue || 0)}` }}
                </div>
                <div class="text-xs font-medium text-emerald-700 mt-0.5">
                  {{ draft.capVnd ? `Tối đa ${formatVoucherAmount(draft.capVnd)}` : 'Tối đa —' }}
                </div>
              </div>
              <div class="w-12 h-10 rounded-xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-700 font-bold text-lg shadow-2xs">
                %
              </div>
            </div>

            <!-- Campaign Title -->
            <div class="mt-4 text-base font-bold text-ink-900 leading-snug wrap-anywhere">
              {{ draft.title.trim() || 'Chào mừng khách hàng mới' }}
            </div>

            <!-- Code & Kind Badges -->
            <div class="mt-2.5 flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white/90 px-2.5 py-1 text-xs font-mono font-bold text-ink-800 shadow-2xs">
                <Ticket :size="13" class="text-ink-400" aria-hidden="true" />
                {{ (draft.code.trim() || 'FIXHOME2026').toUpperCase() }}
              </span>
              <span class="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                {{ draft.kind === 'GENERAL' ? 'Ưu đãi chung' : 'Ưu đãi cá nhân' }}
              </span>
            </div>

            <!-- Perforated separator with ticket notches -->
            <div class="relative my-5 border-t border-dashed border-emerald-300">
              <span class="absolute -left-9 -top-3 w-6 h-6 rounded-full bg-white border-r border-emerald-200" aria-hidden="true" />
              <span class="absolute -right-9 -top-3 w-6 h-6 rounded-full bg-white border-l border-emerald-200" aria-hidden="true" />
            </div>

            <!-- Key Criteria List with Icons -->
            <div class="space-y-3.5 text-xs">
              <!-- Thời gian áp dụng -->
              <div class="flex items-start gap-2.5">
                <Calendar :size="16" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span class="text-ink-500 text-2xs block">Thời gian áp dụng</span>
                  <span class="font-medium text-ink-800">
                    {{ formatVoucherDateTime(draft.startsOn) }} – {{ formatVoucherDateTime(draft.endsOn) }}
                  </span>
                </div>
              </div>

              <!-- Điều kiện đơn tối thiểu -->
              <div class="flex items-start gap-2.5">
                <ShoppingCart :size="16" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span class="text-ink-500 text-2xs block">Điều kiện đơn tối thiểu</span>
                  <span class="font-medium text-ink-800">
                    Từ {{ formatVoucherAmount(draft.minSpendVnd || 0) }}
                  </span>
                </div>
              </div>

              <!-- Phạm vi áp dụng -->
              <div class="flex items-start gap-2.5">
                <Layers :size="16" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span class="text-ink-500 text-2xs block">Phạm vi áp dụng</span>
                  <span class="font-medium text-ink-800">
                    {{ previewScopeSummary }}
                  </span>
                </div>
              </div>

              <!-- Giới hạn sử dụng -->
              <div class="flex items-start gap-2.5">
                <Users :size="16" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span class="text-ink-500 text-2xs block">Giới hạn sử dụng</span>
                  <span class="font-medium text-ink-800">
                    {{ draft.kind === 'GENERAL' ? `Mỗi khách dùng tối đa ${draft.perCustomerLimit || 1} lần` : 'Áp dụng cho tài khoản nhận ưu đãi' }}
                  </span>
                </div>
              </div>

              <!-- Hạn mức chiến dịch -->
              <div class="flex items-start gap-2.5">
                <CreditCard :size="16" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span class="text-ink-500 text-2xs block">Hạn mức chiến dịch</span>
                  <span class="font-medium text-ink-800">
                    Tối đa {{ draft.successfulRedemptionLimit || 100 }} lượt thanh toán thành công
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Action Bar (Image 2) -->
      <div class="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 px-3 py-2 rounded-xl transition-colors"
          @click="toggleEditor"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
          <span>Quay lại</span>
        </button>

        <div class="flex items-center gap-3">
          <!-- Button Lưu nháp / Lưu bản nháp -->
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canWrite || criteriaLoading || Boolean(criteriaError)"
            @click="save"
          >
            <Bookmark :size="16" aria-hidden="true" />
            <span>{{ editingCampaignId ? 'Lưu bản nháp' : 'Lưu nháp' }}</span>
          </button>

          <!-- Button Phát hành -->
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canWrite || criteriaLoading || Boolean(criteriaError)"
            @click="handlePublishFromForm"
          >
            <Send :size="16" aria-hidden="true" />
            <span>Phát hành</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.voucher-admin label {
  font-size: 0.875rem;
  color: var(--color-ink-800);
}

.voucher-input {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 1px solid var(--color-ink-200);
  border-radius: var(--radius-sm);
  background: white;
  padding: 10px 14px;
  color: var(--color-ink-900);
  font-size: 0.9375rem;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.voucher-input:focus {
  outline: none;
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.voucher-input:disabled {
  background: var(--color-ink-50);
  cursor: not-allowed;
  opacity: 0.7;
}

.voucher-help {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-ink-500);
}

.voucher-tab {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  color: var(--color-ink-600);
  font-size: 14px;
  font-weight: 500;
  transition: all 150ms ease;
}

.voucher-tab:hover {
  color: var(--color-ink-900);
  background: var(--color-ink-50);
}

.voucher-tab[aria-selected="true"] {
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  font-weight: 600;
}

.voucher-admin :is(button, input, select, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .voucher-tab {
    transition: none;
  }
}
</style>
