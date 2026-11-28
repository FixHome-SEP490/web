<script setup lang="ts">
/**
 * Linh kiện hỏng bảo hành (FixHome Console, Quản lý dịch vụ)
 * The manager counts faulty units in line by line, sends them to the manufacturer and records its verdict.
 * The manager never judges the part: the manufacturer does.
 */
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { AlertTriangle, Check, ChevronRight, PackageCheck, Search, Truck } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhConfirmDialog from '../FhConfirmDialog.vue';
import FhSkeleton from '../FhSkeleton.vue';
import FaultyReceiveModal from './FaultyReceiveModal.vue';
import ManufacturerResultModal from './ManufacturerResultModal.vue';
import { consoleSearchField, CONSOLE_LOAD_ERROR } from './console-ui';
import { partRequestsApi, type PartRequest, type PartRequestItem } from '../../api/part-requests.api';
import { useAuthStore } from '../../stores/auth';
import { usePartReturnsRefresh } from '../../composables/usePartReturnsRefresh';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import {
  faultyBucket, faultyPartStatusLabels, faultyPartStatusTones, faultyReceivedText, faultyToneClasses,
} from '../../utils/warranty-claim';
import { vnDateTimeString } from '../../utils/vn-time';

const PAGE_SIZE = 50;
type Bucket = ReturnType<typeof faultyBucket> | 'overdue';

const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));

const rows = ref<PartRequest[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');

const filter = ref<Bucket | null>(null);
const search = ref('');
const selectedId = ref<string | null>(null);
const picked = ref<string[]>([]);

const receiveRequest = ref<PartRequest | null>(null);
const resultRequest = ref<PartRequest | null>(null);
const resultItems = ref<PartRequestItem[]>([]);
const shipping = ref(false);
const shipOpen = ref(false);

const code = (r: PartRequest) => `PR-${r.id.substring(0, 8).toUpperCase()}`;
const statusOf = (item: PartRequestItem) => item.faultyStatus ?? 'awaiting';
const missingUnits = (r: PartRequest) => r.items.reduce((sum, item) => sum + (['awaiting', 'partial'].includes(statusOf(item)) ? item.quantity - (item.faultyReceivedQty ?? 0) : 0), 0);
const isOverdue = (r: PartRequest) => !!r.faultyReturnDueAt && new Date(r.faultyReturnDueAt).getTime() < Date.now() && missingUnits(r) > 0;
const bucketOf = (r: PartRequest): Bucket => (isOverdue(r) ? 'overdue' : faultyBucket(r.items));

const load = async (more = false) => {
  if (more) loadingMore.value = true;
  else if (!rows.value.length) loading.value = true;
  try {
    const nextPage = more ? page.value + 1 : 1;
    const result = await partRequestsApi.getAll({ requestType: 'warranty', pageSize: PAGE_SIZE, page: nextPage });
    // Only requests whose replacement reached the technician have a faulty part to bring back.
    const open = result.data.filter((r) => ['received', 'completed'].includes(r.status.toLowerCase()) && r.items.some((i) => i.faultyStatus));
    rows.value = more ? [...rows.value, ...open] : open;
    page.value = nextPage;
    hasMore.value = nextPage * PAGE_SIZE < result.total;
    error.value = '';
  } catch {
    error.value = CONSOLE_LOAD_ERROR;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const tiles = computed(() => {
  const count = (bucket: Bucket) => rows.value.filter((r) => bucketOf(r) === bucket).length;
  return [
    { key: 'waiting' as const, label: 'Chờ xác nhận nhận', value: count('waiting'), tone: 'text-ink-900' },
    { key: 'partial' as const, label: 'Nhận thiếu', value: count('partial'), tone: 'text-warning-700' },
    { key: 'to_ship' as const, label: 'Chờ gửi hãng', value: count('to_ship'), tone: 'text-warning-700' },
    { key: 'at_manufacturer' as const, label: 'Đang ở hãng', value: count('at_manufacturer'), tone: 'text-info-600' },
    { key: 'overdue' as const, label: 'Quá hạn nộp', value: count('overdue'), tone: 'text-danger-700' },
  ];
});

const visibleRows = computed(() => {
  const q = search.value.trim().replace(/^PR-/i, '').toLowerCase();
  return rows.value.filter((r) => {
    if (filter.value && bucketOf(r) !== filter.value) return false;
    if (!q) return true;
    return r.id.toLowerCase().includes(q) || r.items.some((i) => i.partNameSnapshot.toLowerCase().includes(q));
  });
});

const selected = computed(() => rows.value.find((r) => r.id === selectedId.value) ?? null);

const toggleTile = (key: Bucket) => { filter.value = filter.value === key ? null : key; };
const select = (r: PartRequest) => {
  selectedId.value = selectedId.value === r.id ? null : r.id;
  picked.value = [];
};

const dueText = (r: PartRequest) => {
  if (!r.faultyReturnDueAt) return 'Chờ thợ nhận linh kiện thay thế';
  if (missingUnits(r) === 0) return 'Đã nhận đủ';
  const overdue = isOverdue(r);
  return `${overdue ? 'Quá hạn nộp' : 'Hạn nộp'} ${vnDateTimeString(r.faultyReturnDueAt)}${overdue && r.faultyReturnChargedAt ? ', đã trừ ví phần chưa nhận' : ''}`;
};

const summaryLabel = (r: PartRequest) => {
  const bucket = bucketOf(r);
  return bucket === 'overdue' ? 'Quá hạn nộp'
    : bucket === 'waiting' ? 'Chờ xác nhận nhận'
      : bucket === 'partial' ? 'Nhận thiếu'
        : bucket === 'to_ship' ? 'Chờ gửi hãng'
          : bucket === 'at_manufacturer' ? 'Đang ở hãng' : 'Đã có kết quả';
};
const summaryTone = (r: PartRequest) => {
  const bucket = bucketOf(r);
  return faultyToneClasses[bucket === 'overdue' ? 'danger' : bucket === 'waiting' ? 'neutral' : bucket === 'at_manufacturer' ? 'info' : bucket === 'done' ? 'success' : 'warning'];
};

const progress = (r: PartRequest) => {
  const total = r.items.reduce((sum, i) => sum + i.quantity, 0);
  const got = r.items.reduce((sum, i) => sum + (i.faultyReceivedQty ?? 0), 0);
  return { got, total, pct: total ? Math.round((got / total) * 100) : 0 };
};

/** The four steps a faulty part goes through; the first one not done is the current step. */
const steps = (r: PartRequest) => {
  const all = r.items.map(statusOf);
  const counted = all.every((s) => !['awaiting', 'partial'].includes(s));
  const sent = all.every((s) => ['sent_to_manufacturer', 'manufacturer_accepted', 'manufacturer_rejected'].includes(s));
  const judged = all.every((s) => ['manufacturer_accepted', 'manufacturer_rejected'].includes(s));
  const flags = [!!r.faultyReturnedAt || counted, counted, sent, judged];
  const current = flags.findIndex((done) => !done);
  return ['Thợ nộp', 'Kho nhận', 'Gửi hãng', 'Kết quả hãng'].map((label, index) => ({ label, done: flags[index], current: index === current }));
};

const selectable = (item: PartRequestItem) => ['partial', 'received', 'sent_to_manufacturer'].includes(statusOf(item));
const pickedItems = computed(() => (selected.value?.items ?? []).filter((i) => picked.value.includes(i.id)));
const canReceive = computed(() => !!selected.value && selected.value.items.some((i) => ['awaiting', 'partial'].includes(statusOf(i)) && i.quantity > (i.faultyReceivedQty ?? 0)));
const canShip = computed(() => pickedItems.value.length > 0 && pickedItems.value.every((i) => ['partial', 'received'].includes(statusOf(i))));
const canJudge = computed(() => pickedItems.value.length > 0 && pickedItems.value.every((i) => statusOf(i) === 'sent_to_manufacturer'));

const replace = (updated: PartRequest) => {
  rows.value = rows.value.map((r) => (r.id === updated.id ? { ...updated, items: updated.items } : r));
  picked.value = [];
};

const onReceived = (updated: PartRequest) => {
  receiveRequest.value = null;
  replace(updated);
  toast.success('Đã xác nhận nhận linh kiện hỏng.');
};

const ship = async () => {
  if (!selected.value || shipping.value) return;
  shipping.value = true;
  try {
    replace(await partRequestsApi.sendFaultyToManufacturer(selected.value.id, { itemIds: picked.value }));
    shipOpen.value = false;
    toast.success('Đã chuyển sang trạng thái gửi hãng.');
  } catch (reason) {
    toast.error(getSupportErrorMessage(reason, 'Chưa gửi hãng được. Vui lòng thử lại.'));
  } finally {
    shipping.value = false;
  }
};

const openResult = () => {
  if (!selected.value) return;
  resultRequest.value = selected.value;
  resultItems.value = pickedItems.value;
};
const onJudged = (updated: PartRequest) => {
  resultRequest.value = null;
  resultItems.value = [];
  replace(updated);
  toast.success('Đã ghi kết quả của hãng.');
};

usePartReturnsRefresh(() => load());
onMounted(() => void load());
</script>

<template>
  <section class="space-y-4" data-testid="faulty-parts-board" aria-label="Linh kiện hỏng bảo hành">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <button
        v-for="tile in tiles"
        :key="tile.key"
        type="button"
        :aria-pressed="filter === tile.key"
        class="flex min-h-[76px] flex-col items-start justify-between rounded-xl border bg-white px-4 py-3 text-left shadow-(--shadow-e1) transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="filter === tile.key ? 'border-brand-600 bg-brand-50/60' : 'border-ink-200/90 hover:bg-ink-50'"
        @click="toggleTile(tile.key)"
      >
        <span class="text-xs font-medium text-ink-600">{{ tile.label }}</span>
        <span class="font-num text-2xl font-bold" :class="tile.tone">{{ tile.value }}</span>
      </button>
    </div>

    <div class="relative max-w-md">
      <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      <input v-model="search" type="search" :class="consoleSearchField" placeholder="Tìm mã PR hoặc tên linh kiện" aria-label="Tìm linh kiện hỏng" />
    </div>

    <div v-if="loading" class="space-y-3"><FhSkeleton height="76px" :count="3" /></div>
    <p v-else-if="error" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{{ error }}</p>
    <div v-else-if="!visibleRows.length" class="rounded-xl border border-dashed border-ink-200 bg-white px-5 py-10 text-center text-sm text-ink-500">
      {{ filter || search ? 'Không có yêu cầu nào khớp bộ lọc.' : 'Chưa có linh kiện hỏng nào cần xử lý.' }}
    </div>

    <div v-else class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <ul class="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200/90 bg-white shadow-(--shadow-e1)">
        <li v-for="r in visibleRows" :key="r.id">
          <button
            type="button"
            class="flex w-full min-h-[72px] items-center gap-3 px-4 py-3 text-left transition-colors duration-150 cursor-pointer hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
            :class="selectedId === r.id ? 'bg-brand-50/60' : ''"
            :aria-expanded="selectedId === r.id"
            @click="select(r)"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                <span class="font-num font-semibold text-ink-700">{{ code(r) }}</span>
                <span :class="isOverdue(r) ? 'font-medium text-danger-700' : ''">{{ dueText(r) }}</span>
              </div>
              <div class="break-words text-sm font-semibold text-ink-900">{{ r.items.map((i) => `${i.partNameSnapshot} × ${i.quantity}`).join(', ') }}</div>
              <div class="flex items-center gap-2" :aria-label="`Đã nhận ${progress(r).got}/${progress(r).total} đơn vị`">
                <div class="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100"><div class="h-full rounded-full bg-brand-600" :style="{ width: `${progress(r).pct}%` }"></div></div>
                <span class="font-num text-xs text-ink-600">{{ progress(r).got }}/{{ progress(r).total }}</span>
              </div>
            </div>
            <span class="inline-flex shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium" :class="summaryTone(r)">{{ summaryLabel(r) }}</span>
            <ChevronRight :size="16" class="shrink-0 text-ink-400 transition-transform duration-150" :class="selectedId === r.id ? 'rotate-90' : ''" aria-hidden="true" />
          </button>
        </li>
        <li v-if="hasMore" class="px-4 py-3 text-center">
          <FhButton variant="ghost" size="sm" :loading="loadingMore" @click="load(true)">Xem thêm</FhButton>
        </li>
      </ul>

      <aside v-if="selected" class="space-y-4 rounded-xl border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1) lg:sticky lg:top-4" aria-label="Chi tiết linh kiện hỏng">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-num text-sm font-bold text-ink-900">{{ code(selected) }}</h3>
          <router-link
            :to="selected.warrantyClaimId ? `/console/warranty/${selected.warrantyClaimId}` : `/console/orders/${selected.serviceOrderId}`"
            class="text-xs font-medium text-brand-700 hover:underline"
          >Xem yêu cầu bảo hành</router-link>
        </div>

        <ol class="grid grid-cols-4 gap-1.5" aria-label="Tiến trình">
          <li v-for="(step, index) in steps(selected)" :key="step.label" class="space-y-1">
            <div class="h-1.5 rounded-full" :class="step.done ? 'bg-success-600' : step.current ? 'bg-brand-600' : 'bg-ink-200'"></div>
            <div class="flex items-center gap-1 text-[11px] leading-tight" :class="step.current ? 'font-semibold text-ink-900' : 'text-ink-500'">
              <Check v-if="step.done" :size="12" class="shrink-0 text-success-700" aria-hidden="true" />
              <span class="font-num" v-else>{{ index + 1 }}.</span>
              <span>{{ step.label }}</span>
            </div>
          </li>
        </ol>

        <p v-if="isOverdue(selected)" class="flex items-start gap-2 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-800">
          <AlertTriangle :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{{ dueText(selected) }}. Xác nhận đã nhận sẽ hoàn lại ví phần tương ứng.</span>
        </p>

        <ul class="space-y-2">
          <li v-for="item in selected.items" :key="item.id" class="rounded-[var(--radius-sm)] border border-ink-200 p-3">
            <div class="flex items-start gap-2.5">
              <input
                v-if="canOperate && selectable(item)"
                v-model="picked"
                type="checkbox"
                :value="item.id"
                class="mt-1 size-4 accent-brand-600"
                :aria-label="`Chọn ${item.partNameSnapshot}`"
              />
              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="break-words text-sm font-semibold text-ink-900">{{ item.partNameSnapshot }}</div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="inline-flex rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium" :class="faultyToneClasses[faultyPartStatusTones[statusOf(item)]]">{{ faultyPartStatusLabels[statusOf(item)] }}</span>
                  <span class="font-num text-xs text-ink-600">{{ faultyReceivedText(item) }}</span>
                </div>
                <p v-if="item.faultyResultNote" class="text-xs text-ink-600 text-pretty">{{ item.faultyResultNote }}</p>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="canOperate" class="flex flex-col gap-2 border-t border-ink-100 pt-3 sm:flex-row sm:flex-wrap">
          <FhButton v-if="canReceive" variant="primary" size="md" class="w-full sm:w-auto" @click="receiveRequest = selected">
            <PackageCheck :size="16" aria-hidden="true" /> Xác nhận đã nhận
          </FhButton>
          <FhButton variant="secondary" size="md" class="w-full sm:w-auto" :disabled="!canShip" @click="shipOpen = true">
            <Truck :size="16" aria-hidden="true" /> Gửi hãng
          </FhButton>
          <FhButton variant="secondary" size="md" class="w-full sm:w-auto" :disabled="!canJudge" @click="openResult">Ghi kết quả hãng</FhButton>
          <p class="w-full text-xs text-ink-500">Tick các linh kiện đã nhận để gửi hãng, hoặc đã gửi để ghi kết quả của hãng.</p>
        </div>
      </aside>
    </div>

    <FaultyReceiveModal :request="receiveRequest" @close="receiveRequest = null" @done="onReceived" />
    <ManufacturerResultModal :request="resultRequest" :items="resultItems" @close="resultRequest = null; resultItems = []" @done="onJudged" />
    <FhConfirmDialog
      :open="shipOpen"
      title="Gửi linh kiện hỏng cho hãng?"
      :consequence="`${pickedItems.map((i) => `${i.partNameSnapshot} × ${i.faultyReceivedQty ?? 0}`).join(', ')} sẽ chuyển sang trạng thái đã gửi hãng và không nhận bù thêm được nữa.`"
      confirm-text="Gửi hãng"
      :danger="false"
      :loading="shipping"
      @confirm="ship"
      @cancel="shipOpen = false"
    />
  </section>
</template>
