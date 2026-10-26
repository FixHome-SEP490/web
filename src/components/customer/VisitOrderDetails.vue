<script setup lang="ts">
import { computed, ref } from 'vue';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import FhCostBreakdown from '../FhCostBreakdown.vue';
import type { AdditionalCostRecord, EvidenceType } from '../../api/orders.api';
import type { VisitOrderDetails } from '../../composables/useVisitOrderDetails';
import { orderBilling, billingAmount } from '../../utils/order-billing';
import { canDecideOfficialQuotation } from '../../utils/quotation-decision';

const props = defineProps<{ details: VisitOrderDetails; disabled: boolean }>();
const emit = defineEmits<{
  quote: [action: 'APPROVE' | 'REJECT'];
  cost: [id: string, action: 'APPROVE' | 'REJECT', externalConsent: boolean];
  retry: [];
}>();
const consent = ref<Record<string, boolean>>({});
// Reuse the same display reconciliation as CustomerOrderDetail; never build a bill here.
const billing = computed(() => orderBilling(props.details.order, props.details.invoice, props.details.costs));
const quoteReady = computed(() => canDecideOfficialQuotation(props.details.order));
const visibleQuote = computed(() => ['sent', 'approved', 'accepted', 'rejected'].includes(String(props.details.order.quotation?.status).toLowerCase()));
const labels: Record<AdditionalCostRecord['status'], string> = {
  PENDING_APPROVAL: 'Chờ bạn duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', EXPIRED: 'Hết hạn chờ duyệt', CANCELLED: 'Đã huỷ',
};
const evidenceLabels: Record<EvidenceType, string> = {
  before: 'Ảnh trước sửa chữa', after: 'Ảnh sau sửa chữa',
  additional: 'Ảnh bổ sung', checkin_face: 'Ảnh check-in',
};
const hasExternal = (cost: AdditionalCostRecord) => cost.items.some(item => item.partSource === 'external');
const canDecide = (cost: AdditionalCostRecord) => props.details.order.status.toUpperCase() === 'UNDER_REPAIR'
  && !props.details.order.completionRequestedAt && cost.status === 'PENDING_APPROVAL'
  && (!cost.expiresAt || new Date(cost.expiresAt).getTime() > Date.now());
const costTotal = (cost: AdditionalCostRecord) => {
  const amounts = [billingAmount(cost.totalLaborDelta), billingAmount(cost.totalPartsDelta), billingAmount(cost.shippingFee ?? 0)];
  return amounts.every(amount => amount !== null) ? amounts.reduce<number>((total, amount) => total + amount!, 0) : null;
};
</script>

<template>
  <div class="mt-4 space-y-5 border-t border-ink-100 pt-4" data-testid="visit-inline-details" :aria-busy="disabled">
    <section v-if="visibleQuote" class="space-y-3" data-testid="visit-inline-quotation">
      <h3 class="text-base font-semibold text-ink-900">{{ quoteReady ? 'Báo giá chờ bạn duyệt' : 'Báo giá của máy này' }}</h3>
      <p v-if="['approved', 'accepted'].includes(String(details.order.quotation?.status).toLowerCase())" class="text-sm font-medium text-success-700">Đã duyệt báo giá</p>
      <p v-if="String(details.order.quotation?.status).toLowerCase() === 'rejected'" class="text-sm text-ink-600">Đã từ chối báo giá</p>
      <ul class="divide-y divide-ink-100 text-sm">
        <li v-for="(item, index) in details.order.quotation?.items" :key="index" class="flex flex-wrap items-start justify-between gap-2 py-2">
          <span class="min-w-0 flex-1 basis-44 break-words text-ink-700">{{ item.description }}<span class="block text-xs text-ink-600">{{ item.type === 'LABOR' ? 'Tiền công' : 'Linh kiện' }} · {{ item.quantity }} × <FhMoney :amount="item.unitPrice" /><template v-if="item.partSource === 'fixhome'"> · FixHome</template><template v-if="item.partSource === 'external'"> · Linh kiện ngoài, không được FixHome bảo hành</template></span></span>
          <FhMoney :amount="item.lineTotal" class="font-medium text-ink-900" />
        </li>
      </ul>
      <FhCostBreakdown v-if="quoteReady && billing.labor !== null && billing.parts !== null && billing.total !== null" :labor-total="billing.labor" :parts-total="billing.parts" :grand-total="billing.total" compact />
      <div v-if="quoteReady" class="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
        <FhButton variant="secondary" size="md" :disabled="disabled" data-testid="visit-quote-reject" @click="emit('quote', 'REJECT')">Từ chối báo giá</FhButton>
        <FhButton size="md" :disabled="disabled" data-testid="visit-quote-approve" @click="emit('quote', 'APPROVE')">Duyệt báo giá</FhButton>
      </div>
    </section>

    <section v-if="details.costs.length || details.costsError" class="space-y-3" data-testid="visit-inline-additional">
      <h3 class="text-base font-semibold text-ink-900">Chi phí phát sinh</h3>
      <p v-if="details.costsError" role="alert" class="text-sm text-danger-700">Chưa tải được chi phí phát sinh. <FhButton variant="ghost" size="md" :disabled="disabled" @click="emit('retry')">Thử lại</FhButton></p>
      <article v-for="cost in details.costs" :key="cost.id" class="space-y-3 border-t border-ink-100 pt-3" :data-testid="`visit-cost-${cost.id}`">
        <div class="flex flex-wrap items-start justify-between gap-2 text-sm">
          <p class="min-w-0 flex-1 basis-40 break-words font-medium text-ink-900">{{ cost.reason }}</p>
          <FhMoney v-if="costTotal(cost) !== null" :amount="costTotal(cost)" class="font-semibold text-ink-900" /><span v-else>Chưa xác định</span>
        </div>
        <p class="text-sm" :class="cost.status === 'PENDING_APPROVAL' ? 'font-medium text-warning-800' : 'text-ink-600'">{{ labels[cost.status] || 'Trạng thái chưa xác định' }}</p>
        <ul class="space-y-2 text-sm text-ink-700">
          <li v-for="item in cost.items" :key="item.id" class="flex flex-wrap justify-between gap-2">
            <span class="min-w-0 flex-1 basis-40 break-words">{{ item.description }}<span class="block text-xs text-ink-600">{{ item.quantity }} × <FhMoney :amount="item.unitPrice" /><template v-if="item.partSource === 'fixhome'"> · FixHome</template></span></span><FhMoney :amount="item.lineTotal" />
          </li>
          <li v-if="Number(cost.shippingFee) > 0" class="flex justify-between gap-2"><span>Phí giao linh kiện</span><FhMoney :amount="cost.shippingFee" /></li>
        </ul>
        <div v-if="cost.evidenceUrls?.length" class="flex flex-wrap gap-2"><img v-for="url in cost.evidenceUrls" :key="url" :src="url" alt="Ảnh chi phí phát sinh của máy này" loading="lazy" class="h-20 w-20 rounded-lg object-cover" /></div>
        <label v-if="hasExternal(cost) && canDecide(cost)" class="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-warning-50 p-3 text-sm text-warning-800">
          <input v-model="consent[cost.id]" type="checkbox" class="mt-1 h-5 w-5 shrink-0 accent-brand-600" :disabled="disabled" :data-testid="`visit-external-consent-${cost.id}`" />
          <span>Tôi đã hiểu và đồng ý dùng linh kiện ngoài, không do FixHome cung cấp và không được FixHome bảo hành.</span>
        </label>
        <div v-if="canDecide(cost)" class="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
          <FhButton variant="secondary" size="md" :disabled="disabled" :data-testid="`visit-cost-reject-${cost.id}`" @click="emit('cost', cost.id, 'REJECT', false)">Từ chối</FhButton>
          <FhButton size="md" :disabled="disabled || (hasExternal(cost) && !consent[cost.id])" :data-testid="`visit-cost-approve-${cost.id}`" @click="emit('cost', cost.id, 'APPROVE', !!consent[cost.id])">Đồng ý chi phí</FhButton>
        </div>
      </article>
    </section>

    <section v-if="!quoteReady" class="space-y-3" aria-label="Chi phí của máy này">
      <h3 class="text-base font-semibold text-ink-900">{{ billing.final ? 'Hóa đơn cuối cùng' : 'Tạm tính theo báo giá đã duyệt' }}</h3>
      <p v-if="details.invoiceError" role="alert" class="text-sm text-danger-700">Chưa tải được hóa đơn cuối cùng. <FhButton variant="ghost" size="md" :disabled="disabled" @click="emit('retry')">Thử lại</FhButton></p>
      <FhCostBreakdown v-else-if="billing.labor !== null && billing.parts !== null && billing.total !== null" :labor-total="billing.labor" :parts-total="billing.parts" :grand-total="billing.total" compact />
      <p v-else class="text-sm text-ink-600">Kỹ thuật viên sẽ báo giá sau khi kiểm tra tại nhà.</p>
      <p class="text-sm text-ink-600">Thanh toán một lần ở mục Thanh toán cả lượt.</p>
    </section>
    <section v-if="details.evidence.length || details.evidenceError" class="space-y-3">
      <h3 class="text-base font-semibold text-ink-900">Ảnh và ghi chú của kỹ thuật viên</h3>
      <p v-if="details.evidenceError" class="text-sm text-ink-600">Chưa tải được ảnh của máy này.</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <figure v-for="photo in details.evidence" :key="photo.id" class="min-w-0 space-y-2">
          <img :src="photo.mediaUrl" :alt="evidenceLabels[photo.type] || 'Ảnh hiện trường của máy này'" loading="lazy" class="aspect-square w-full rounded-xl object-cover" />
          <figcaption class="space-y-1 break-words text-sm text-ink-700">
            <span class="block font-medium text-ink-900">{{ evidenceLabels[photo.type] || 'Ảnh hiện trường' }}</span>
            <span v-if="photo.note" class="block whitespace-pre-line">{{ photo.note }}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>
