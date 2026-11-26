<script setup lang="ts">
/**
 * Hoàn trả linh kiện (FixHome Console)
 * Quản lý và theo dõi việc hoàn trả các linh kiện sau khi hoàn thành đơn sửa chữa.
 */
import { ref } from 'vue';
import PartReturnsQueue from '../../components/console/PartReturnsQueue.vue';

const count = ref<number | null>(null);
</script>

<template>
  <div class="space-y-5">
    <PartReturnsQueue @count="count = $event" />
  </div>
</template>
