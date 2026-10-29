<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Gift, Plus, TicketPercent } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import VoucherGrantForm from './VoucherGrantForm.vue';
import VoucherStatePanel from './VoucherStatePanel.vue';
import { formatVoucherAmount, formatVoucherDate, validateVoucherCampaignDraft, type VoucherOffer, type VoucherCampaignDraft } from './voucher-model';
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
}>(), { connected: false, busy: false, message: '', feedback: '', feedbackError: false, categories: () => [], services: () => [], criteriaError: '', criteriaLoading: false });
const emit = defineEmits<{
  retry: []; retryCriteria: [];
  createCampaign: [draft: VoucherCampaignDraft];
  setCampaignStatus: [id: string, active: boolean];
  updateDraftCampaign: [id: string, draft: VoucherCampaignDraft];
  transitionCampaign: [id: string, next: 'PUBLISHED' | 'PAUSED' | 'ARCHIVED'];
}>();
const activeTab = ref<'campaigns' | 'compensation'>('campaigns');
const showCreate = ref(false);
const editingCampaignId = ref<string | null>(null);
function localDatetime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d).replace(' ', 'T');
}
const attempted = ref(false);
const draft = reactive<VoucherCampaignDraft>({
  title: '', code: '', kind: 'GENERAL', discountType: 'PERCENT', discountValue: 0,
  capVnd: null, minSpendVnd: 0, startsOn: '', endsOn: '', successfulRedemptionLimit: 100,
  perCustomerLimit: 1, scope: ['LABOR', 'PARTS'], categoryIds: [], serviceIds: [],
});
function editCampaign(campaign: VoucherOffer) {
  if (campaign.campaignLifecycle !== 'DRAFT' || !campaign.campaignVersion || !canWrite.value) return;
  Object.assign(draft, {
    title: campaign.title, code: campaign.code, kind: campaign.kind,
    discountType: campaign.discount.type, discountValue: campaign.discount.value,
    capVnd: campaign.discount.capVnd, minSpendVnd: campaign.minSpendVnd ?? 0,
    startsOn: localDatetime(campaign.startsAt), endsOn: localDatetime(campaign.expiresAt),
    successfulRedemptionLimit: campaign.successfulRedemptionLimit ?? 100,
    perCustomerLimit: 1, scope: ['LABOR', 'PARTS'],
    categoryIds: [...(campaign.categoryIds ?? [])], serviceIds: [...(campaign.serviceIds ?? [])],
  });
  editingCampaignId.value = campaign.id;
  showCreate.value = true;
  attempted.value = false;
}
function toggleEditor() {
  if (showCreate.value) { showCreate.value = false; editingCampaignId.value = null; return; }
  editingCampaignId.value = null;
  showCreate.value = true;
  attempted.value = false;
}
function campaignLifecycleLabel(c: VoucherOffer): string {
  return c.campaignLifecycle === 'DRAFT' ? 'Bản nháp'
    : c.campaignLifecycle === 'ARCHIVED' ? 'Đã lưu trữ'
      : c.campaignLifecycle === 'PAUSED' || (!c.campaignLifecycle && c.status === 'PAUSED') ? 'Tạm dừng' : 'Đang phát hành';
}
const normalizedDraft = computed(() => ({ ...draft,
  capVnd: draft.capVnd === null || String(draft.capVnd) === '' ? null : draft.capVnd,
  minSpendVnd: String(draft.minSpendVnd) === '' ? 0 : draft.minSpendVnd,
}));
const errors = computed(() => {
  const found = validateVoucherCampaignDraft(normalizedDraft.value);
  if ((draft.categoryIds?.length ?? 0) > 100 || (draft.serviceIds?.length ?? 0) > 100) found.push('Chỉ chọn tối đa 100 danh mục và 100 dịch vụ.');
  if (draft.categoryIds?.length && draft.serviceIds?.some(id => !props.services.some(s => s.id === id && draft.categoryIds?.includes(s.categoryId)))) found.push('Dịch vụ đã chọn phải thuộc danh mục đã chọn.');
  return found;
});
const canWrite = computed(() => props.canManage && props.connected && props.state === 'ready' && !props.busy);
function save() {
  attempted.value = true;
  if (!canWrite.value || errors.value.length || props.criteriaLoading || props.criteriaError) return;
  const submitted = { ...normalizedDraft.value, categoryIds: [...(draft.categoryIds ?? [])], serviceIds: [...(draft.serviceIds ?? [])], scope: ['LABOR', 'PARTS'] as VoucherCampaignDraft['scope'] };
  if (editingCampaignId.value) emit('updateDraftCampaign', editingCampaignId.value, submitted);
  else emit('createCampaign', submitted);
}
function tabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  activeTab.value = event.key === 'Home' ? 'campaigns' : event.key === 'End' ? 'compensation' : activeTab.value === 'campaigns' ? 'compensation' : 'campaigns';
  (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-console-voucher-tab="${activeTab.value}"]`)?.focus();
}
</script>

<template>
  <div class="voucher-admin min-w-0 space-y-5" data-testid="console-voucher-workspace">
    <p class="rounded-[var(--radius-sm)] border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-6 text-ink-700" role="note" data-testid="voucher-funding-gate">Tạo bản nháp, sau đó bấm Phát hành để khách sử dụng. Số lượng là lượt thanh toán thành công; một khách chỉ dùng mã chung một lần. Thanh toán chỉ giảm giá khi máy chủ xác nhận đủ điều kiện.</p>
    <div role="tablist" aria-label="Quản lý ưu đãi" class="flex gap-2 border-b border-ink-200 pb-2" @keydown="tabKey">
      <button v-for="tab in (['campaigns', 'compensation'] as const)" :key="tab" type="button" role="tab" :id="`admin-voucher-tab-${tab}`" :data-console-voucher-tab="tab" :aria-label="tab === 'campaigns' ? 'Chiến dịch' : 'Cấp cá nhân'" :aria-controls="`admin-voucher-panel-${tab}`" :aria-selected="activeTab === tab" :tabindex="activeTab === tab ? 0 : -1" class="voucher-tab" @click="activeTab = tab">
        <TicketPercent v-if="tab === 'campaigns'" :size="18" aria-hidden="true" /><Gift v-else :size="18" aria-hidden="true" />
        {{ tab === 'campaigns' ? 'Chiến dịch' : 'Cấp cá nhân' }}
      </button>
    </div>
    <p v-if="feedback" :role="feedbackError ? 'alert' : 'status'" class="rounded-[var(--radius-sm)] border p-3 text-sm leading-6" :class="feedbackError ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'">{{ feedback }}</p>
    <section :id="`admin-voucher-panel-${activeTab}`" role="tabpanel" :aria-labelledby="`admin-voucher-tab-${activeTab}`" tabindex="0" class="min-w-0 space-y-5">
      <template v-if="activeTab === 'campaigns'">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="text-lg font-semibold text-ink-900">Chiến dịch ưu đãi</h2><p class="mt-1 text-sm text-ink-600">Tối đa 100 chiến dịch mới nhất. Điều khoản đã lưu không thể chỉnh sửa.</p></div>
          <FhButton variant="primary" size="md" :disabled="!canWrite" :aria-expanded="showCreate" aria-controls="voucher-create-form" @click="toggleEditor"><Plus :size="18" aria-hidden="true" />{{ showCreate ? 'Đóng biểu mẫu' : 'Tạo chiến dịch' }}</FhButton>
        </div>
        <form v-if="showCreate && canWrite" id="voucher-create-form" class="space-y-5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-4 sm:p-6" :aria-busy="busy" novalidate @submit.prevent="save">
          <div><h3 class="text-base font-semibold text-ink-900">{{ editingCampaignId ? 'Sửa bản nháp' : 'Tạo bản nháp' }}</h3><p class="mt-1 text-sm text-ink-600">Thông tin được lưu khi dịch vụ xác nhận thành công.</p></div>
          <fieldset :disabled="!canWrite" class="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend class="sr-only">Điều khoản chiến dịch</legend>
            <label class="sm:col-span-2" for="voucher-campaign-title">Tên chiến dịch<input id="voucher-campaign-title" v-model="draft.title" required maxlength="120" class="voucher-field" autocomplete="off" /></label>
            <label for="voucher-campaign-code">Mã ưu đãi<input id="voucher-campaign-code" v-model="draft.code" required maxlength="40" class="voucher-field uppercase" autocomplete="off" aria-describedby="voucher-code-format" /><span id="voucher-code-format" class="voucher-help">3–40 ký tự chữ, số, dấu - hoặc _</span></label>
            <label for="voucher-kind">Loại chiến dịch<select id="voucher-kind" v-model="draft.kind" class="voucher-field"><option value="GENERAL">Ưu đãi chung</option><option value="PERSONAL">Ưu đãi cá nhân</option></select></label>
            <label for="voucher-discount-type">Loại ưu đãi<select id="voucher-discount-type" v-model="draft.discountType" class="voucher-field"><option value="PERCENT">Phần trăm</option><option value="FIXED">Số tiền cố định</option></select></label>
            <label for="voucher-discount-value">{{ draft.discountType === 'PERCENT' ? 'Mức giảm (%)' : 'Mức giảm (₫)' }}<input id="voucher-discount-value" v-model.number="draft.discountValue" type="number" min="1" :max="draft.discountType === 'PERCENT' ? 100 : 2147483647" class="voucher-field" required /></label>
            <label for="voucher-cap">Giảm tối đa (₫)<input id="voucher-cap" v-model.number="draft.capVnd" type="number" min="1" max="2147483647" class="voucher-field" aria-describedby="voucher-cap-help" /><span id="voucher-cap-help" class="voucher-help">Để trống nếu không giới hạn</span></label>
            <label for="voucher-minimum">Đơn tối thiểu (₫)<input id="voucher-minimum" v-model.number="draft.minSpendVnd" type="number" min="0" max="2147483647" class="voucher-field" required /></label>
            <label for="voucher-start-date">Bắt đầu (giờ Việt Nam)<input id="voucher-start-date" v-model="draft.startsOn" type="datetime-local" class="voucher-field" required /></label>
            <label for="voucher-end-date">Kết thúc (giờ Việt Nam)<input id="voucher-end-date" v-model="draft.endsOn" type="datetime-local" class="voucher-field" required /></label>
            <label for="voucher-paid-quota">Hạn mức thanh toán thành công<input id="voucher-paid-quota" v-model.number="draft.successfulRedemptionLimit" aria-label="Hạn mức thanh toán thành công" type="number" min="1" max="2147483647" class="voucher-field" required /><span class="voucher-help">Lưu vào ví không tiêu hao hạn mức này.</span></label>
            <label for="voucher-per-customer">Số lần dùng mỗi khách<input id="voucher-per-customer" value="1" readonly class="voucher-field" /><span class="voucher-help">Ưu đãi chung: một lần cho mỗi khách.</span></label>
          </fieldset>
          <fieldset :disabled="!canWrite || criteriaLoading || Boolean(criteriaError)" class="space-y-3 border-t border-ink-100 pt-4">
            <legend class="text-sm font-semibold text-ink-900">Điều kiện danh mục và dịch vụ</legend>
            <p class="text-sm leading-6 text-ink-600">Không chọn nghĩa là không giới hạn theo nhóm đó. Khi chọn cả hai, dịch vụ phải đồng thời thuộc danh mục đã chọn. Phạm vi luôn gồm tiền công và linh kiện.</p>
            <p v-if="criteriaLoading" role="status" class="text-sm text-ink-600">Đang tải điều kiện…</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <details class="rounded-[var(--radius-sm)] border border-ink-200 p-3"><summary class="min-h-11 cursor-pointer text-sm font-medium">Danh mục · {{ draft.categoryIds?.length || 'Tất cả' }}</summary><div class="max-h-64 overflow-y-auto"><label v-for="category in categories" :key="category.id" class="flex min-h-11 items-center gap-3 py-2"><input v-model="draft.categoryIds" type="checkbox" :value="category.id" class="h-4 w-4 shrink-0" />{{ category.name }}</label><p v-if="!categories.length" class="voucher-help">Chưa có danh mục để chọn.</p></div></details>
              <details class="rounded-[var(--radius-sm)] border border-ink-200 p-3"><summary class="min-h-11 cursor-pointer text-sm font-medium">Dịch vụ · {{ draft.serviceIds?.length || 'Tất cả' }}</summary><div class="max-h-64 overflow-y-auto"><label v-for="service in services" :key="service.id" class="flex min-h-11 items-center gap-3 py-2"><input v-model="draft.serviceIds" type="checkbox" :value="service.id" class="h-4 w-4 shrink-0" />{{ service.name }}</label><p v-if="!services.length" class="voucher-help">Chưa có dịch vụ để chọn.</p></div></details>
            </div>
          </fieldset>
          <div v-if="criteriaError" role="alert" class="text-sm text-danger-800"><p>{{ criteriaError }}</p><FhButton variant="secondary" size="md" @click="$emit('retryCriteria')">Thử lại điều kiện</FhButton></div>
          <ul v-if="attempted && errors.length" id="voucher-form-errors" role="alert" class="space-y-1 text-sm text-danger-800"><li v-for="error in errors" :key="error">{{ error }}</li></ul>
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 pt-4"><p class="text-sm text-ink-600">{{ draft.discountType === 'PERCENT' ? `${draft.discountValue}%` : formatVoucherAmount(draft.discountValue) }} · Tiền công và linh kiện</p><FhButton type="submit" size="md" aria-label="Lưu bản nháp" :loading="busy" :disabled="!canWrite || criteriaLoading || Boolean(criteriaError)" :aria-describedby="attempted && errors.length ? 'voucher-form-errors' : undefined">{{ editingCampaignId ? 'Lưu bản nháp' : 'Tạo bản nháp' }}</FhButton></div>
        </form>
        <VoucherStatePanel v-if="state !== 'ready' && state !== 'empty'" :state="state" :message="message" @retry="$emit('retry')" />
        <VoucherStatePanel v-else-if="!campaigns.length" state="empty" title="Chưa có chiến dịch" message="Tạo chiến dịch đầu tiên để thiết lập điều kiện ưu đãi." />
        <ul v-else class="divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white" aria-label="Chiến dịch đã cấu hình">
          <li v-for="campaign in campaigns" :key="campaign.id" class="space-y-4 p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0"><h3 class="text-base font-semibold text-ink-900 wrap-anywhere">{{ campaign.title }}</h3><p class="mt-1 text-sm text-ink-600 wrap-anywhere">{{ campaign.code }} · {{ campaign.kind === 'GENERAL' ? 'Ưu đãi chung' : 'Ưu đãi cá nhân' }}</p></div>
              <span class="rounded-full px-3 py-1 text-xs font-medium" :class="campaign.campaignLifecycle === 'PUBLISHED' || (!campaign.campaignLifecycle && campaign.status === 'ACTIVE') ? 'bg-success-50 text-success-800' : 'bg-ink-100 text-ink-700'">{{ campaignLifecycleLabel(campaign) }}</span>
            </div>
            <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt class="text-ink-600">Mức ưu đãi</dt><dd class="mt-1 font-medium">{{ campaign.discount.type === 'PERCENT' ? `${campaign.discount.value}%` : formatVoucherAmount(campaign.discount.value) }}<span v-if="campaign.discount.capVnd !== null" class="block text-xs font-normal text-ink-600">Tối đa {{ formatVoucherAmount(campaign.discount.capVnd) }}</span></dd></div>
              <div><dt class="text-ink-600">Đơn tối thiểu</dt><dd class="mt-1 font-medium">{{ formatVoucherAmount(campaign.minSpendVnd) }}</dd></div>
              <div><dt class="text-ink-600">Thời gian (Việt Nam)</dt><dd class="mt-1">{{ formatVoucherDate(campaign.startsAt) }} – {{ formatVoucherDate(campaign.expiresAt) }}</dd></div>
              <div><dt class="text-ink-600">Đã thanh toán thành công</dt><dd class="mt-1 font-num font-semibold">{{ campaign.redeemed ?? 'Chưa xác nhận' }} / {{ campaign.successfulRedemptionLimit ?? '—' }}</dd><progress v-if="campaign.redeemed !== undefined && campaign.successfulRedemptionLimit" :value="campaign.redeemed" :max="campaign.successfulRedemptionLimit" :aria-label="`Tiến độ ${campaign.title}`" class="mt-2 h-1.5 w-full accent-brand-600" /></div>
            </dl>
            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3"><p class="text-xs leading-5 text-ink-600">{{ campaign.campaignLifecycle === 'DRAFT' ? 'Bản nháp chưa phát hành' : campaign.campaignLifecycle === 'ARCHIVED' ? 'Chiến dịch đã lưu trữ' : 'Chiến dịch đã phát hành' }} · {{ campaign.categoryIds?.length || 'Tất cả' }} danh mục · {{ campaign.serviceIds?.length || 'Tất cả' }} dịch vụ. Số chỗ đang giữ chưa được cung cấp.</p><div class="flex flex-wrap gap-2">
  <FhButton v-if="campaign.campaignLifecycle === 'DRAFT'" variant="secondary" size="md" :disabled="!canWrite || !campaign.campaignVersion" @click="editCampaign(campaign)">Sửa bản nháp</FhButton>
  <FhButton v-if="campaign.campaignLifecycle === 'DRAFT'" variant="primary" size="md" :disabled="!canWrite || !campaign.campaignVersion" @click="emit('transitionCampaign', campaign.id, 'PUBLISHED')">Phát hành</FhButton>
  <FhButton v-if="campaign.campaignLifecycle === 'DRAFT'" variant="secondary" size="md" :disabled="!canWrite || !campaign.campaignVersion" @click="emit('transitionCampaign', campaign.id, 'ARCHIVED')">Bỏ bản nháp</FhButton>
  <FhButton v-if="['PUBLISHED', 'PAUSED'].includes(campaign.campaignLifecycle ?? '') && campaign.campaignVersion" variant="secondary" size="md" :disabled="!canWrite" @click="emit('transitionCampaign', campaign.id, 'ARCHIVED')">Lưu trữ</FhButton>
  <FhButton v-if="campaign.campaignLifecycle === 'PUBLISHED' || campaign.campaignLifecycle === 'PAUSED' || (!campaign.campaignLifecycle && ['ACTIVE', 'PAUSED'].includes(campaign.status))" variant="secondary" size="md" :disabled="!canWrite" :aria-label="`${campaign.status === 'ACTIVE' ? 'Tạm dừng' : 'Bật'} ${campaign.title}`" @click="emit('setCampaignStatus', campaign.id, campaign.status !== 'ACTIVE')">{{ campaign.status === 'ACTIVE' ? 'Tạm dừng' : 'Bật chiến dịch' }}</FhButton></div></div>
          </li>
        </ul>
      </template>
      <VoucherGrantForm v-show="activeTab === 'compensation'" :campaigns="campaigns" :can-manage="canWrite" />
    </section>
  </div>
</template>

<style scoped>
.voucher-admin label { font-size: 0.875rem; color: var(--color-ink-800); }
.voucher-field { display: block; width: 100%; min-width: 0; min-height: 44px; margin-top: 6px; border: 1px solid var(--color-ink-500); border-radius: var(--radius-sm); background: white; padding: 10px 12px; color: var(--color-ink-900); font-size: 1rem; }
.voucher-help { display: block; margin-top: 6px; font-size: 12px; line-height: 20px; color: var(--color-ink-600); }
.voucher-tab { display: inline-flex; min-height: 44px; align-items: center; gap: 8px; border-radius: var(--radius-sm); padding: 8px 12px; color: var(--color-ink-700); font-size: 14px; font-weight: 500; transition: background-color 120ms ease; }
.voucher-tab[aria-selected="true"] { background: var(--color-brand-50); color: var(--color-brand-800); }
.voucher-admin :is(button, input, select, summary, [tabindex]):focus-visible { outline: 2px solid var(--color-brand-600); outline-offset: 2px; }
.voucher-field:disabled, fieldset:disabled .voucher-field { background: var(--color-ink-50); cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .voucher-tab { transition: none; } }
</style>
