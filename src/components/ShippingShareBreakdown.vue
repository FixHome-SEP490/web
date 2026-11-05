<script setup lang="ts">
import { computed } from 'vue';
import FhMoney from './FhMoney.vue';
import { readShippingPolicy, type ShippingPolicySnapshot } from '../utils/shipping-policy';

const props = withDefaults(defineProps<{
  snapshot: ShippingPolicySnapshot;
  fulfillmentMethod?: 'pickup' | 'delivery' | null;
  role: 'customer' | 'technician' | 'manager';
  compact?: boolean;
}>(), { fulfillmentMethod: 'delivery', compact: true });

const snapshot = computed(() => readShippingPolicy(props.snapshot));
</script>

<template>
  <section
    v-if="fulfillmentMethod !== 'pickup'"
    class="space-y-1 text-sm"
    :class="compact ? 'text-xs' : ''"
    :data-testid="`shipping-share-${role}`"
  >
    <p v-if="snapshot.state === 'error'" role="alert" class="text-danger-700">
      {{ snapshot.message }}
    </p>
    <template v-else-if="snapshot.policyVersion === 'W3_70_30_V1'">
      <div v-if="role !== 'manager'" class="flex flex-wrap justify-between gap-2 text-ink-700">
        <span>Phần khách hàng (70%)</span><FhMoney v-if="snapshot.customerShare !== null" :amount="snapshot.customerShare" /><span v-else>Chưa xác định</span>
      </div>
      <div v-if="role !== 'manager'" class="flex flex-wrap justify-between gap-2 text-ink-700">
        <span>Phần kỹ thuật viên (30%)</span><FhMoney v-if="snapshot.technicianShare !== null" :amount="snapshot.technicianShare" /><span v-else>Chưa xác định</span>
      </div>
      <div v-if="role === 'manager'" class="flex flex-wrap justify-between gap-2 font-medium text-ink-900">
        <span>Tổng phí giao thực tế</span><FhMoney v-if="snapshot.courierCost !== null" :amount="snapshot.courierCost" /><span v-else>Chưa xác định</span>
      </div>
      <div v-if="role === 'technician' && snapshot.technicianNetLabor !== null" class="flex flex-wrap justify-between gap-2 border-t border-ink-100 pt-1 font-medium text-ink-900">
        <span>Tiền công thực nhận sau phí giao</span><FhMoney :amount="snapshot.technicianNetLabor" />
      </div>
    </template>
    <p v-else-if="role === 'technician'" class="text-brand-700 font-medium">
      Phí giao hàng: <FhMoney v-if="snapshot.courierCost !== null" :amount="snapshot.courierCost" /><span v-else>Chưa xác định</span>
    </p>
    <div v-else class="flex flex-wrap justify-between gap-2" :class="role === 'manager' ? 'font-medium text-ink-900' : 'text-ink-700'">
      <span>{{ role === 'manager' ? 'Tổng phí giao hàng' : 'Phí giao linh kiện' }}</span>
      <FhMoney v-if="snapshot.courierCost !== null" :amount="snapshot.courierCost" /><span v-else>Chưa xác định</span>
    </div>
  </section>
</template>
