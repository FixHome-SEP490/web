<script setup lang="ts">
import { computed } from 'vue';
import { missingPartsText, type PartsSourcing } from '../utils/parts-sourcing';

/** F3: the "parts not sourced yet" note on a pending quote, for the customer or the technician. */
const props = defineProps<{ sourcing: PartsSourcing | null; audience: 'customer' | 'technician'; checking?: boolean }>();
defineEmits<{ recheck: [] }>();

const shown = computed(() => props.sourcing?.status === 'unavailable');
const parts = computed(() => missingPartsText(props.sourcing?.missing ?? []));
</script>

<template>
  <div v-if="shown" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900 space-y-2" role="status" data-testid="parts-sourcing-note">
    <p class="font-semibold">Linh kiện chưa có nguồn cấp</p>
    <p v-if="parts">Chưa có kho FixHome nào đủ: {{ parts }}.</p>
    <p v-if="audience === 'customer'">Báo giá này chưa duyệt được. Kỹ thuật viên sẽ gửi báo giá khác hoặc chờ kho bổ sung. Bạn vẫn có thể từ chối báo giá.</p>
    <p v-else>Khách chưa duyệt được báo giá này. Bấm "Gửi lại báo giá khác" để bỏ hoặc đổi linh kiện thiếu, hoặc chờ kho bổ sung rồi nhờ khách duyệt lại.</p>
    <button type="button" class="min-h-10 text-sm font-medium text-brand-700 hover:underline disabled:opacity-60" :disabled="checking"
      data-testid="parts-sourcing-recheck" @click="$emit('recheck')">
      {{ checking ? 'Đang kiểm tra kho…' : 'Kiểm tra lại kho' }}
    </button>
  </div>
</template>
