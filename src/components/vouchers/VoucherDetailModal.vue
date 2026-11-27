<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Archive,
  Calendar,
  Check,
  Copy,
  CreditCard,
  Info,
  Layers,
  Pause,
  Pencil,
  Play,
  Send,
  ShoppingCart,
  Ticket,
  Trash2,
  X,
} from 'lucide-vue-next';
import {
  formatVoucherAmount,
  formatVoucherDate,
  formatVoucherDateTime,
  type VoucherOffer,
} from './voucher-model';
import type { ServiceCategory, ServiceItem } from '../../api/catalog.api';

const props = defineProps<{
  open: boolean;
  campaign: VoucherOffer | null;
  categories?: ServiceCategory[];
  services?: ServiceItem[];
  canManage?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit', campaign: VoucherOffer): void;
  (e: 'publish', campaign: VoucherOffer): void;
  (e: 'discard', campaign: VoucherOffer): void;
  (e: 'archive', campaign: VoucherOffer): void;
  (e: 'toggleStatus', campaign: VoucherOffer): void;
}>();

const copied = ref(false);

function copyCode(code: string) {
  if (!code) return;
  void navigator.clipboard.writeText(code);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

const statusBadge = computed(() => {
  if (!props.campaign) return { label: '', badgeClass: '', dotClass: '' };
  const c = props.campaign;
  if (c.campaignLifecycle === 'DRAFT') {
    return { label: 'Bản nháp', badgeClass: 'bg-slate-100 text-slate-700', dotClass: 'bg-slate-500' };
  }
  if (c.campaignLifecycle === 'ARCHIVED') {
    return { label: 'Đã lưu trữ', badgeClass: 'bg-ink-100 text-ink-600', dotClass: 'bg-ink-400' };
  }
  if (new Date(c.expiresAt).getTime() <= Date.now()) {
    return { label: 'Đã kết thúc', badgeClass: 'bg-ink-100 text-ink-600', dotClass: 'bg-ink-400' };
  }
  if (c.campaignLifecycle === 'PAUSED' || c.status === 'PAUSED' || c.campaignActive === false) {
    return { label: 'Tạm dừng', badgeClass: 'bg-amber-50 text-amber-700', dotClass: 'bg-amber-500' };
  }
  return { label: 'Đang hoạt động', badgeClass: 'bg-emerald-50 text-emerald-700', dotClass: 'bg-emerald-500' };
});

const progress = computed(() => {
  if (!props.campaign) return 0;
  const quota = props.campaign.successfulRedemptionLimit || 1;
  const redeemed = props.campaign.redeemed || 0;
  return Math.min(100, Math.max(0, Math.round((redeemed / quota) * 100)));
});

const selectedCategoryNames = computed(() => {
  if (!props.campaign || !props.categories) return [];
  const ids = props.campaign.categoryIds || [];
  return props.categories.filter(c => ids.includes(c.id)).map(c => c.name);
});

const selectedServiceNames = computed(() => {
  if (!props.campaign || !props.services) return [];
  const ids = props.campaign.serviceIds || [];
  return props.services.filter(s => ids.includes(s.id)).map(s => s.name);
});

const previewScopeText = computed(() => {
  const cats = selectedCategoryNames.value;
  const svcs = selectedServiceNames.value;
  if (cats.length === 0 && svcs.length === 0) return 'Tất cả danh mục · Tất cả dịch vụ';
  if (cats.length > 0 && svcs.length === 0) {
    return cats.length <= 2 ? `${cats.join(', ')} · Tất cả dịch vụ` : `${cats.length} danh mục · Tất cả dịch vụ`;
  }
  if (cats.length === 0 && svcs.length > 0) {
    return svcs.length <= 2 ? `Tất cả danh mục · ${svcs.join(', ')}` : `Tất cả danh mục · ${svcs.length} dịch vụ`;
  }
  return `${cats.length} danh mục · ${svcs.length} dịch vụ`;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div
        v-if="open && campaign"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-xs overflow-y-auto"
        @click.self="emit('close')"
      >
        <div
          role="dialog"
          aria-modal="true"
          class="relative w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl transition-all"
        >
          <!-- Header -->
          <div class="flex items-start justify-between border-b border-ink-100 px-6 py-4.5 bg-ink-25/50">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Ticket :size="22" :stroke-width="1.75" aria-hidden="true" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-bold text-ink-900 leading-snug">
                    {{ campaign.title }}
                  </h2>
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    :class="statusBadge.badgeClass"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="statusBadge.dotClass" aria-hidden="true" />
                    {{ statusBadge.label }}
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-ink-500 font-mono">
                  Mã: {{ campaign.code }} · {{ campaign.kind === 'GENERAL' ? 'Ưu đãi chung' : 'Ưu đãi cá nhân' }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="rounded-lg p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors focus:outline-none"
              aria-label="Đóng chi tiết"
              @click="emit('close')"
            >
              <X :size="20" aria-hidden="true" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- 1. Voucher Ticket Summary -->
            <div class="relative rounded-[var(--radius-md)] border border-ink-200 bg-ink-25 p-5 sm:p-6 shadow-(--shadow-e1) overflow-hidden">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-2xl sm:text-3xl font-extrabold text-ink-900 tracking-tight font-num">
                    {{ campaign.discount.type === 'PERCENT' ? `Giảm ${campaign.discount.value}%` : `Giảm ${formatVoucherAmount(campaign.discount.value)}` }}
                  </div>
                  <div class="text-xs font-medium text-ink-600 mt-0.5">
                    {{ campaign.discount.capVnd ? `Tối đa ${formatVoucherAmount(campaign.discount.capVnd)}` : 'Tối đa — Không giới hạn' }}
                  </div>
                </div>
                <div class="w-11 h-9 rounded-[var(--radius-sm)] bg-success-50 border border-success-200 flex items-center justify-center text-success-700 font-bold text-base">
                  %
                </div>
              </div>

              <div class="mt-4 text-base font-bold text-ink-900 leading-snug wrap-anywhere">
                {{ campaign.title }}
              </div>

              <!-- Badges with Copy Action -->
              <div class="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white/90 px-2.5 py-1 text-xs font-mono font-bold text-ink-800 shadow-2xs hover:bg-white transition-all cursor-pointer"
                  title="Nhấn để sao chép mã ưu đãi"
                  @click="copyCode(campaign.code)"
                >
                  <component :is="copied ? Check : Copy" :size="13" :class="copied ? 'text-success-600' : 'text-ink-400'" aria-hidden="true" />
                  <span>{{ campaign.code }}</span>
                  <span class="text-3xs font-sans text-ink-400 font-normal ml-0.5">{{ copied ? 'Đã chép' : 'Sao chép' }}</span>
                </button>
                <span class="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                  {{ campaign.kind === 'GENERAL' ? 'Ưu đãi chung' : 'Ưu đãi cá nhân' }}
                </span>
              </div>

              <!-- Ticket perforation divider -->
              <div class="relative my-4.5 border-t border-dashed border-emerald-300">
                <span class="absolute -left-9 -top-3 w-6 h-6 rounded-full bg-white border-r border-emerald-200" aria-hidden="true" />
                <span class="absolute -right-9 -top-3 w-6 h-6 rounded-full bg-white border-l border-emerald-200" aria-hidden="true" />
              </div>

              <!-- Quick Criteria summary on ticket -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="flex items-start gap-2">
                  <Calendar :size="15" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span class="text-ink-500 text-2xs block">Thời gian áp dụng</span>
                    <span class="font-medium text-ink-800">
                      {{ formatVoucherDate(campaign.startsAt) }} – {{ formatVoucherDate(campaign.expiresAt) }}
                    </span>
                  </div>
                </div>

                <div class="flex items-start gap-2">
                  <ShoppingCart :size="15" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span class="text-ink-500 text-2xs block">Đơn tối thiểu</span>
                    <span class="font-medium text-ink-800">
                      {{ formatVoucherAmount(campaign.minSpendVnd) }}
                    </span>
                  </div>
                </div>

                <div class="flex items-start gap-2">
                  <Layers :size="15" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span class="text-ink-500 text-2xs block">Phạm vi áp dụng</span>
                    <span class="font-medium text-ink-800">
                      {{ previewScopeText }}
                    </span>
                  </div>
                </div>

                <div class="flex items-start gap-2">
                  <CreditCard :size="15" class="text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span class="text-ink-500 text-2xs block">Đã thanh toán thành công</span>
                    <span class="font-medium text-ink-800 font-num">
                      {{ campaign.redeemed ?? 0 }} / {{ campaign.successfulRedemptionLimit ?? '—' }} ({{ progress }}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. Detailed Parameters Grid -->
            <div class="space-y-3">
              <h3 class="text-sm font-bold text-ink-900 uppercase tracking-wider text-overline">
                Thông số chi tiết của chiến dịch
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <!-- Mức ưu đãi -->
                <div class="rounded-xl border border-ink-100 bg-ink-25/50 p-3.5 space-y-1">
                  <span class="text-xs text-ink-500">Mức ưu đãi & Hình thức</span>
                  <div class="font-semibold text-ink-900">
                    {{ campaign.discount.type === 'PERCENT' ? `Giảm ${campaign.discount.value}%` : `Giảm ${formatVoucherAmount(campaign.discount.value)}` }}
                  </div>
                  <div class="text-xs text-ink-600">
                    {{ campaign.discount.type === 'PERCENT' ? 'Tính theo tỷ lệ % đơn hàng' : 'Trừ trực tiếp số tiền cố định' }}
                  </div>
                </div>

                <!-- Giảm tối đa -->
                <div class="rounded-xl border border-ink-100 bg-ink-25/50 p-3.5 space-y-1">
                  <span class="text-xs text-ink-500">Mức giảm tối đa mỗi đơn</span>
                  <div class="font-semibold text-ink-900">
                    {{ campaign.discount.capVnd ? formatVoucherAmount(campaign.discount.capVnd) : 'Không giới hạn mức giảm' }}
                  </div>
                  <div class="text-xs text-ink-600">
                    {{ campaign.discount.capVnd ? 'Hệ thống tự chặn mức giảm tại trần này' : 'Áp dụng đủ % theo giá trị đơn' }}
                  </div>
                </div>

                <!-- Thời gian bắt đầu -->
                <div class="rounded-xl border border-ink-100 bg-ink-25/50 p-3.5 space-y-1">
                  <span class="text-xs text-ink-500">Bắt đầu hiệu lực (Việt Nam)</span>
                  <div class="font-semibold text-ink-900">
                    {{ formatVoucherDateTime(campaign.startsAt) }}
                  </div>
                </div>

                <!-- Thời gian kết thúc -->
                <div class="rounded-xl border border-ink-100 bg-ink-25/50 p-3.5 space-y-1">
                  <span class="text-xs text-ink-500">Hết hiệu lực (Việt Nam)</span>
                  <div class="font-semibold text-ink-900">
                    {{ formatVoucherDateTime(campaign.expiresAt) }}
                  </div>
                </div>

                <!-- Hạn mức thanh toán -->
                <div class="rounded-xl border border-ink-100 bg-ink-25/50 p-3.5 space-y-1 sm:col-span-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-ink-500">Tiến độ thanh toán thành công</span>
                    <span class="text-xs font-semibold font-num text-ink-900">
                      {{ campaign.redeemed ?? 0 }} / {{ campaign.successfulRedemptionLimit ?? '—' }} lượt ({{ progress }}%)
                    </span>
                  </div>
                  <div class="h-2 w-full bg-ink-100 rounded-full overflow-hidden mt-1">
                    <div
                      class="h-full bg-brand-600 rounded-full transition-all duration-300"
                      :style="{ width: `${progress}%` }"
                    />
                  </div>
                  <p class="text-xs text-ink-500 leading-relaxed mt-1">
                    Hạn mức chỉ tính trên các đơn hàng thanh toán thành công. Khách hàng lưu mã vào ví không làm giảm hạn mức này.
                  </p>
                </div>
              </div>
            </div>

            <!-- 3. Category & Service Scope Breakdown -->
            <div class="space-y-3">
              <h3 class="text-sm font-bold text-ink-900 uppercase tracking-wider text-overline">
                Phạm vi danh mục & Dịch vụ áp dụng
              </h3>
              <div class="rounded-xl border border-ink-100 bg-ink-25/50 p-4 space-y-3">
                <!-- Danh mục -->
                <div>
                  <div class="text-xs font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
                    <span>Danh mục áp dụng:</span>
                    <span class="text-ink-500 font-normal">
                      {{ selectedCategoryNames.length ? `${selectedCategoryNames.length} danh mục được chọn` : 'Tất cả danh mục' }}
                    </span>
                  </div>
                  <div v-if="selectedCategoryNames.length" class="flex flex-wrap gap-1.5">
                    <span
                      v-for="name in selectedCategoryNames"
                      :key="name"
                      class="inline-flex items-center rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800"
                    >
                      📁 {{ name }}
                    </span>
                  </div>
                  <p v-else class="text-xs text-ink-600 italic">
                    Áp dụng cho toàn bộ danh mục dịch vụ trên hệ thống FixHome.
                  </p>
                </div>

                <!-- Dịch vụ -->
                <div class="pt-2 border-t border-ink-100">
                  <div class="text-xs font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
                    <span>Dịch vụ áp dụng:</span>
                    <span class="text-ink-500 font-normal">
                      {{ selectedServiceNames.length ? `${selectedServiceNames.length} dịch vụ được chọn` : 'Tất cả dịch vụ' }}
                    </span>
                  </div>
                  <div v-if="selectedServiceNames.length" class="flex flex-wrap gap-1.5">
                    <span
                      v-for="name in selectedServiceNames"
                      :key="name"
                      class="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-800"
                    >
                      🔧 {{ name }}
                    </span>
                  </div>
                  <p v-else class="text-xs text-ink-600 italic">
                    Áp dụng cho toàn bộ dịch vụ kỹ thuật trên hệ thống FixHome.
                  </p>
                </div>

                <!-- Thành phần -->
                <div class="pt-2 border-t border-ink-100 flex items-center gap-2 text-xs text-ink-600">
                  <Info :size="14" class="text-brand-600 shrink-0" aria-hidden="true" />
                  <span>Quy tắc thanh toán: Ưu đãi áp dụng chung cho cả tiền công kỹ thuật và chi phí linh kiện.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-6 py-4 bg-ink-25/50">
            <button
              type="button"
              class="px-4 py-2 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
              @click="emit('close')"
            >
              Đóng
            </button>

            <!-- Contextual actions based on campaign lifecycle -->
            <div v-if="canManage" class="flex flex-wrap items-center gap-2">
              <!-- Actions for DRAFT -->
              <template v-if="campaign.campaignLifecycle === 'DRAFT'">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
                  @click="emit('edit', campaign)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                  <span>Sửa bản nháp</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
                  @click="emit('publish', campaign)"
                >
                  <Send :size="15" aria-hidden="true" />
                  <span>Phát hành ngay</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-danger-200 bg-danger-50 text-sm font-medium text-danger-700 hover:bg-danger-100 transition-colors"
                  @click="emit('discard', campaign)"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                  <span>Bỏ bản nháp</span>
                </button>
              </template>

              <!-- Actions for PUBLISHED or PAUSED -->
              <template v-else-if="campaign.campaignLifecycle === 'PUBLISHED' || campaign.campaignLifecycle === 'PAUSED'">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
                  @click="emit('toggleStatus', campaign)"
                >
                  <component :is="campaign.status === 'ACTIVE' ? Pause : Play" :size="15" aria-hidden="true" />
                  <span>{{ campaign.status === 'ACTIVE' ? 'Tạm dừng chiến dịch' : 'Bật lại chiến dịch' }}</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
                  @click="emit('archive', campaign)"
                >
                  <Archive :size="15" aria-hidden="true" />
                  <span>Lưu trữ</span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
