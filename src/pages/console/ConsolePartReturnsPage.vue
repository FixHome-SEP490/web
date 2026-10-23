<script setup lang="ts">
/**
 * Hoàn trả linh kiện (BUG DETECTOR 10): one place for the Service Manager to
 * receive the parts technicians declared they are bringing back, apart from
 * the part requests list.
 */
import { ref } from 'vue';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import PartReturnsQueue from '../../components/console/PartReturnsQueue.vue';

const count = ref<number | null>(null);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Hoàn trả linh kiện" :count="count" />
    <PartReturnsQueue @count="count = $event" />
  </div>
</template>
