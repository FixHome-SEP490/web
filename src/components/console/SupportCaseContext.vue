<script setup lang="ts">
// Read-only context of a support case: the order, its invoice and the cash
// declaration, shown in words and money only (no ids, no raw statuses).
import { ExternalLink } from 'lucide-vue-next';
import FhCard from '../FhCard.vue';
import FhMoney from '../FhMoney.vue';
import FhStatusPill from '../FhStatusPill.vue';
import type { SupportCaseDetail } from '../../api/support-cases.api';
import { formatSupportDate, isSafeEvidenceLink } from '../../pages/console/support-cases.utils';
import {
  bookingStatusLabel,
  cashSettlementLabel,
  moneyTone,
  orderStatusLabel,
  paymentStatusLabel,
} from './console-labels';

defineProps<{ supportCase: SupportCaseDetail }>();

function openEvidence(value: string) {
  if (!isSafeEvidenceLink(value)) return;
  window.open(value, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <FhCard v-if="supportCase.serviceOrder" title="Đơn sửa chữa">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <router-link
          :to="`/console/orders/${supportCase.serviceOrder.id}`"
          class="whitespace-nowrap font-num font-medium text-brand-700 hover:underline"
        >{{ supportCase.serviceOrder.code }}</router-link>
        <FhStatusPill :status="supportCase.serviceOrder.status" :label="orderStatusLabel(supportCase.serviceOrder.status)" />
        <FhStatusPill :status="moneyTone(supportCase.serviceOrder.paymentStatus)" :label="paymentStatusLabel(supportCase.serviceOrder.paymentStatus)" />
      </div>
      <dl class="space-y-2.5 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Tiền công</dt><dd><FhMoney :amount="supportCase.serviceOrder.laborTotal" /></dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Linh kiện</dt><dd><FhMoney :amount="supportCase.serviceOrder.partsTotal" /></dd></div>
        <div class="flex justify-between gap-3 border-t border-ink-100 pt-2.5"><dt class="font-medium text-ink-900">Tổng</dt><dd><FhMoney :amount="supportCase.serviceOrder.grandTotal" emphasis /></dd></div>
      </dl>
    </FhCard>

    <FhCard v-if="supportCase.invoice" title="Hoá đơn">
      <template #action>
        <FhStatusPill :status="moneyTone(supportCase.invoice.paymentStatus)" :label="paymentStatusLabel(supportCase.invoice.paymentStatus)" />
      </template>
      <dl class="space-y-2.5 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Tiền công</dt><dd><FhMoney :amount="supportCase.invoice.laborTotal" /></dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Linh kiện</dt><dd><FhMoney :amount="supportCase.invoice.partsTotal" /></dd></div>
        <div class="flex justify-between gap-3 border-t border-ink-100 pt-2.5"><dt class="font-medium text-ink-900">Tổng</dt><dd><FhMoney :amount="supportCase.invoice.grandTotal" emphasis /></dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Xuất lúc</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.invoice.issuedAt) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Trả lúc</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.invoice.paidAt) }}</dd></div>
      </dl>
    </FhCard>

    <FhCard v-if="supportCase.cashSettlement" title="Tiền mặt">
      <template #action>
        <FhStatusPill :status="moneyTone(supportCase.cashSettlement.status)" :label="cashSettlementLabel(supportCase.cashSettlement.status)" />
      </template>
      <dl class="space-y-2.5 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Thợ khai</dt><dd><FhMoney :amount="supportCase.cashSettlement.declaredAmount" emphasis /></dd></div>
        <div class="flex justify-between gap-3">
          <dt class="text-ink-500">Đã xác nhận</dt>
          <dd><FhMoney v-if="supportCase.cashSettlement.confirmedAmount != null" :amount="supportCase.cashSettlement.confirmedAmount" /><span v-else class="text-ink-400">—</span></dd>
        </div>
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Khai lúc</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.cashSettlement.declaredAt) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-500">Xác nhận lúc</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.cashSettlement.confirmedAt) }}</dd></div>
      </dl>
      <p v-if="supportCase.cashSettlement.technicianNotes" class="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-700 text-pretty">
        {{ supportCase.cashSettlement.technicianNotes }}
      </p>
      <div v-if="supportCase.cashSettlement.receiptEvidenceUrl" class="mt-3 border-t border-ink-100 pt-3 text-sm">
        <a
          v-if="isSafeEvidenceLink(supportCase.cashSettlement.receiptEvidenceUrl)"
          :href="supportCase.cashSettlement.receiptEvidenceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
          @click.prevent="openEvidence(supportCase.cashSettlement.receiptEvidenceUrl)"
        >Xem biên nhận <ExternalLink :size="14" aria-hidden="true" /></a>
        <span v-else class="break-all text-ink-700">{{ supportCase.cashSettlement.receiptEvidenceUrl }}</span>
      </div>
    </FhCard>

    <FhCard v-if="supportCase.booking" title="Yêu cầu đặt lịch">
      <FhStatusPill :status="supportCase.booking.status" :label="bookingStatusLabel(supportCase.booking.status)" />
    </FhCard>
  </div>
</template>
