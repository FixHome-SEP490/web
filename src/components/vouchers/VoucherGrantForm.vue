<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import FhButton from '../FhButton.vue';
import VoucherStatePanel from './VoucherStatePanel.vue';
import { adminUsersApi, type AdminUserRecord } from '../../api/admin-users.api';
import { vouchersApi } from '../../api/vouchers.api';
import { getHttpStatus } from '../../api/client';
import { userFacingError } from '../../utils/user-facing-error';
import type { VoucherOffer } from './voucher-model';

const props = defineProps<{ campaigns: VoucherOffer[]; canManage: boolean }>();
const personalCampaigns = computed(() => props.campaigns.filter(c => c.kind === 'PERSONAL'));
const campaignId = ref('');
const search = ref('');
const customers = ref<AdminUserRecord[]>([]);
const selected = ref<AdminUserRecord | null>(null);
const searching = ref(false);
const searched = ref(false);
const page = ref(1);
const totalPages = ref(1);
const searchError = ref('');
const busy = ref(false);
const uncertain = ref(false);
const message = ref('');
const failed = ref(false);
let grantId: string | null = null;
let sequence = 0;
let session = 0;
const selectedCampaign = computed(() => personalCampaigns.value.find(c => c.id === campaignId.value));
const canGrant = computed(() => props.canManage && selected.value && selectedCampaign.value?.status === 'ACTIVE' && !busy.value);
watch([campaignId, selected], () => { if (!uncertain.value) { grantId = null; message.value = ''; } }, { flush: 'sync' });
watch(search, () => { sequence++; customers.value = []; searched.value = false; searching.value = false; });
watch(() => props.canManage, allowed => { if (!allowed) { session++; sequence++; customers.value = []; selected.value = null; busy.value = false; message.value = ''; } });
onBeforeUnmount(() => { session++; sequence++; });
async function findCustomers(nextPage = 1) {
  if (!props.canManage || searching.value || uncertain.value || busy.value || search.value.trim().length < 2) return;
  const request = ++sequence;
  searching.value = true;
  searchError.value = '';
  try {
    const result = await adminUsersApi.getUsers({ search: search.value.trim(), role: 'customer', status: 'active', page: nextPage, limit: 10 });
    if (request !== sequence) return;
    customers.value = result.data.filter(c => c.role === 'customer' && c.status === 'active' && c.isActive);
    page.value = nextPage;
    totalPages.value = result.meta.totalPages;
    searched.value = true;
  } catch (error) {
    if (request === sequence) searchError.value = userFacingError(error, 'Chưa tìm được khách hàng. Vui lòng thử lại.');
  } finally { if (request === sequence) searching.value = false; }
}
async function grant() {
  if (!canGrant.value || !selected.value) return;
  grantId ??= crypto.randomUUID();
  const request = session;
  busy.value = true;
  message.value = '';
  try {
    await vouchersApi.grant(campaignId.value, { customerId: selected.value.id, grantId });
    if (request !== session) return;
    uncertain.value = false;
    selected.value = null;
    grantId = null;
    failed.value = false;
    message.value = 'Đã cấp voucher cá nhân.';
  } catch (error) {
    if (request !== session) return;
    const status = getHttpStatus(error);
    uncertain.value = status === undefined || status >= 500;
    failed.value = true;
    message.value = uncertain.value
      ? 'Chưa xác nhận được kết quả. Thử lại cùng yêu cầu để đối chiếu, không tạo lượt cấp mới.'
      : userFacingError(error, 'Chưa cấp được voucher. Kiểm tra lại khách hàng và chiến dịch.');
  } finally { if (request === session) busy.value = false; }
}
</script>

<template>
  <div class="max-w-3xl space-y-5">
    <VoucherStatePanel v-if="!canManage" state="denied" />
    <VoucherStatePanel v-else-if="!personalCampaigns.length" state="empty" title="Chưa có chiến dịch cá nhân" message="Tạo chiến dịch loại Ưu đãi cá nhân trước khi cấp cho khách hàng." />
    <template v-else>
      <div><h2 class="text-lg font-semibold text-ink-900">Cấp voucher cá nhân</h2><p class="mt-1 text-sm leading-6 text-ink-600">Chọn chiến dịch và đúng tài khoản nhận. Cấp thủ công được ghi nhận riêng, không thay thế voucher bù tự động cho sự cố sửa chữa.</p></div>
      <label for="voucher-grant-campaign" class="block text-sm font-medium text-ink-800">Chiến dịch cá nhân<select id="voucher-grant-campaign" v-model="campaignId" :disabled="busy || uncertain" class="grant-field"><option value="">Chọn chiến dịch</option><option v-for="campaign in personalCampaigns" :key="campaign.id" :value="campaign.id" :disabled="campaign.status !== 'ACTIVE'">{{ campaign.title }}{{ campaign.status === 'ACTIVE' ? '' : ' · Tạm dừng' }}</option></select></label>
      <form data-testid="voucher-customer-search" class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="findCustomers()">
        <label for="voucher-grant-search" class="block min-w-0 flex-1 text-sm font-medium text-ink-800">Tìm khách hàng<input id="voucher-grant-search" v-model="search" type="search" :disabled="busy || uncertain" class="grant-field" placeholder="Tên, email hoặc số điện thoại" autocomplete="off" /></label>
        <FhButton type="submit" variant="secondary" size="md" :loading="searching" :disabled="busy || uncertain || search.trim().length < 2 || searching">Tìm khách hàng</FhButton>
      </form>
      <p v-if="searchError" role="alert" class="text-sm text-danger-800">{{ searchError }}</p>
      <p v-else-if="searched && !customers.length" role="status" class="text-sm text-ink-600">Không có khách hàng đang hoạt động phù hợp.</p>
      <ul v-if="customers.length" class="divide-y divide-ink-100 rounded-[var(--radius-md)] border border-ink-200 bg-white" aria-label="Kết quả tìm khách hàng"><li v-for="customer in customers" :key="customer.id"><button type="button" data-testid="voucher-grant-customer" :aria-pressed="selected?.id === customer.id" :disabled="busy || uncertain" class="flex min-h-14 w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-ink-50 aria-pressed:bg-brand-50" @click="selected = customer"><span class="text-sm font-semibold text-ink-900">{{ customer.fullName }}</span><span class="text-xs text-ink-600 wrap-anywhere">{{ customer.email }}{{ customer.phoneNumber ? ` · ${customer.phoneNumber}` : '' }}</span></button></li></ul>
      <div v-if="totalPages > 1" class="flex items-center justify-between gap-2"><FhButton variant="secondary" size="md" :disabled="page <= 1 || searching || busy || uncertain" @click="findCustomers(page - 1)">Trước</FhButton><span class="text-sm text-ink-600">{{ page }} / {{ totalPages }}</span><FhButton variant="secondary" size="md" :disabled="page >= totalPages || searching || busy || uncertain" @click="findCustomers(page + 1)">Sau</FhButton></div>
      <form data-testid="voucher-grant-form" class="space-y-3 border-t border-ink-200 pt-4" @submit.prevent="grant">
        <p v-if="selected" class="text-sm leading-6 text-ink-800">Cấp cho <strong>{{ selected.fullName }}</strong>{{ selectedCampaign ? ` từ ${selectedCampaign.title}.` : '.' }}</p>
        <p v-if="message" :role="failed ? 'alert' : 'status'" class="text-sm leading-6" :class="failed ? 'text-danger-800' : 'text-success-800'">{{ message }}</p>
        <FhButton type="submit" size="md" :loading="busy" :disabled="!canGrant" aria-label="Cấp voucher cá nhân">{{ uncertain ? 'Thử lại cùng yêu cầu' : 'Cấp voucher cá nhân' }}</FhButton>
      </form>
    </template>
  </div>
</template>

<style scoped>
.grant-field { display: block; width: 100%; min-width: 0; min-height: 44px; margin-top: 6px; border: 1px solid var(--color-ink-500); border-radius: var(--radius-sm); padding: 10px 12px; background: white; font-size: 16px; }
:is(button, input, select):focus-visible { outline: 2px solid var(--color-brand-600); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
