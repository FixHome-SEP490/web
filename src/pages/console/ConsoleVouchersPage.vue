<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleVoucherWorkspace from '../../components/vouchers/ConsoleVoucherWorkspace.vue';
import { voucherAdapter, type VoucherOffer, type VoucherCampaignDraft } from '../../components/vouchers/voucher-model';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { getHttpStatus } from '../../api/client';
import { useAuthStore } from '../../stores/auth.store';
import { userFacingError } from '../../utils/user-facing-error';

const authStore = useAuthStore();
const adminId = computed(() => authStore.userRole === 'ADMIN' ? authStore.user?.id ?? null : null);
const state = ref<'loading' | 'ready' | 'error' | 'denied'>('loading');
const campaigns = ref<VoucherOffer[]>([]);
const categories = ref<ServiceCategory[]>([]);
const services = ref<ServiceItem[]>([]);
const criteriaError = ref('');
const criteriaLoading = ref(false);
const message = ref('');
const feedback = ref('');
const feedbackError = ref(false);
const busy = ref(false);
let loadSequence = 0;
let criteriaSequence = 0;
let sessionSequence = 0;
const pendingCommands = new Map<string, string>();
function commandIdFor(key: string): string {
  let id = pendingCommands.get(key);
  if (!id) { id = crypto.randomUUID(); pendingCommands.set(key, id); }
  return id;
}

async function load() {
  const sequence = ++loadSequence;
  campaigns.value = [];
  message.value = '';
  if (!adminId.value) {
    state.value = 'denied';
    message.value = 'Trang này chỉ dành cho Quản trị viên.';
    return;
  }
  state.value = 'loading';
  try {
    const snapshot = await voucherAdapter.loadAdminSnapshot();
    if (sequence !== loadSequence) return;
    campaigns.value = snapshot.campaigns;
    state.value = 'ready';
  } catch (error) {
    if (sequence !== loadSequence) return;
    state.value = [401, 403].includes(getHttpStatus(error) ?? 0) ? 'denied' : 'error';
    message.value = userFacingError(error, 'Chưa tải được chiến dịch. Vui lòng thử lại.');
  }
}

async function loadCriteria() {
  const sequence = ++criteriaSequence;
  criteriaError.value = '';
  categories.value = [];
  services.value = [];
  if (!adminId.value) return;
  criteriaLoading.value = true;
  try {
    const [categoryRows, first] = await Promise.all([
      catalogApi.getAdminCategories(), catalogApi.getAdminServices({ page: 1, limit: 100 }),
    ]);
    const rows = [...first.data];
    for (let page = 2; page <= first.meta.totalPages; page++) {
      if (sequence !== criteriaSequence) return;
      rows.push(...(await catalogApi.getAdminServices({ page, limit: 100 })).data);
    }
    if (sequence !== criteriaSequence) return;
    categories.value = categoryRows;
    services.value = rows;
  } catch (error) {
    if (sequence !== criteriaSequence) return;
    criteriaError.value = userFacingError(error, 'Chưa tải được danh mục và dịch vụ. Hãy thử lại để chọn điều kiện.');
  } finally {
    if (sequence === criteriaSequence) criteriaLoading.value = false;
  }
}
watch(adminId, () => {
  sessionSequence++;
  busy.value = false;
  pendingCommands.clear();
  feedback.value = '';
  void load();
  void loadCriteria();
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { sessionSequence++; loadSequence++; criteriaSequence++; });

async function runAction(action: () => Promise<void>, success: string) {
  if (!adminId.value || busy.value || state.value !== 'ready') return;
  const session = sessionSequence;
  busy.value = true;
  feedback.value = '';
  try {
    await action();
    if (session !== sessionSequence) return;
    feedbackError.value = false;
    feedback.value = success;
  } catch (error) {
    if (session !== sessionSequence) return;
    feedbackError.value = true;
    feedback.value = userFacingError(error, 'Chưa xác nhận được kết quả. Hãy tải lại danh sách để kiểm tra trước khi thử lại.');
  } finally {
    if (session === sessionSequence) busy.value = false;
  }
}
function createCampaign(draft: VoucherCampaignDraft) {
  const key = `create:${JSON.stringify(draft)}`;
  return runAction(async () => { await voucherAdapter.createCampaign(draft, commandIdFor(key)); pendingCommands.delete(key); await load(); }, 'Đã lưu chiến dịch ưu đãi.');
}
function updateDraftCampaign(id: string, draft: VoucherCampaignDraft) {
  const row = campaigns.value.find(c => c.id === id);
  if (row?.campaignLifecycle !== 'DRAFT' || !row.campaignVersion) return;
  const key = `edit:${id}:${row.campaignVersion}:${JSON.stringify(draft)}`;
  return runAction(async () => {
    const updated = await voucherAdapter.updateDraftCampaign(id, draft, row.campaignVersion!, commandIdFor(key));
    pendingCommands.delete(key);
    campaigns.value = campaigns.value.map(c => c.id === id ? updated : c);
  }, 'Đã lưu thay đổi bản nháp.');
}
function transitionCampaign(id: string, next: 'PUBLISHED' | 'PAUSED' | 'ARCHIVED') {
  const row = campaigns.value.find(c => c.id === id);
  if (!row?.campaignVersion || row.campaignLifecycle === 'ARCHIVED') return;
  const key = `lifecycle:${id}:${row.campaignVersion}:${next}`;
  const session = sessionSequence;
  return runAction(async () => {
    const updated = await voucherAdapter.transitionCampaign(id, next, row.campaignVersion!, commandIdFor(key));
    pendingCommands.delete(key);
    if (session === sessionSequence) campaigns.value = campaigns.value.map(c => c.id === id ? updated : c);
  }, next === 'PUBLISHED' ? 'Đã phát hành hoặc mở lại chiến dịch.' : next === 'PAUSED' ? 'Đã tạm dừng chiến dịch.' : 'Đã lưu trữ chiến dịch.');
}
function setCampaignStatus(id: string, active: boolean) {
  const session = sessionSequence;
  return runAction(async () => {
    const updated = await voucherAdapter.setCampaignActive(id, active);
    if (session === sessionSequence) campaigns.value = campaigns.value.map(c => c.id === id ? updated : c);
  }, active ? 'Đã bật chiến dịch.' : 'Đã tạm dừng chiến dịch.');
}
</script>

<template>
  <div lang="vi" class="space-y-5" data-testid="console-vouchers-page">
    <ConsolePageHeader title="Quản lý ưu đãi" />
    <ConsoleVoucherWorkspace
      :key="adminId ?? 'guest'"
      :state="state" :campaigns="campaigns" :connected="true"
      :can-manage="Boolean(adminId)" :busy="busy" :message="message"
      :feedback="feedback" :feedback-error="feedbackError"
      :categories="categories" :services="services" :criteria-error="criteriaError" :criteria-loading="criteriaLoading"
      @retry="load" @retry-criteria="loadCriteria" @create-campaign="createCampaign" @set-campaign-status="setCampaignStatus"
      @update-draft-campaign="updateDraftCampaign" @transition-campaign="transitionCampaign"
    />
  </div>
</template>
