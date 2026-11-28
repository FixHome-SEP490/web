<script setup lang="ts">
/**
 * Hoàn trả linh kiện (FixHome Console)
 * Hai việc tách riêng: linh kiện cấp cho thợ nhưng chưa dùng được trả về kho, và linh kiện hỏng của bảo hành
 * được kho nhận, gửi hãng và ghi kết quả của hãng.
 */
import { ref } from 'vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import FaultyPartsBoard from '../../components/console/FaultyPartsBoard.vue';
import PartReturnsQueue from '../../components/console/PartReturnsQueue.vue';

type Tab = 'unused' | 'faulty';

const tab = ref<Tab>('unused');
const count = ref<number | null>(null);
const tabs = () => [
  { key: 'unused' as const, label: 'Linh kiện chưa dùng', count: count.value },
  { key: 'faulty' as const, label: 'Linh kiện hỏng bảo hành' },
];
</script>

<template>
  <div class="space-y-5">
    <ConsoleTabs v-model="tab" :tabs="tabs()" aria-label="Loại hoàn trả linh kiện" />
    <PartReturnsQueue v-show="tab === 'unused'" @count="count = $event" />
    <FaultyPartsBoard v-if="tab === 'faulty'" />
  </div>
</template>
