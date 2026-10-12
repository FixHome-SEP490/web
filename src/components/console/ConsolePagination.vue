<script setup lang="ts">
// The console uses the same numbered pager as the customer and technician
// pages, so every list in FixHome pages the same way.
import FhPagination from '../FhPagination.vue';

withDefaults(
  defineProps<{
    page: number;
    totalPages?: number | null;
    total?: number | null;
    pageSize?: number;
    disabled?: boolean;
  }>(),
  { totalPages: null, total: null, pageSize: 20, disabled: false },
);
defineEmits<{ (e: 'update:page', value: number): void; (e: 'prefetch', value: number): void }>();
</script>

<template>
  <FhPagination
    :page="page"
    :total-pages="totalPages"
    :total="total"
    :page-size="pageSize"
    :disabled="disabled"
    @update:page="$emit('update:page', $event)"
    @prefetch="$emit('prefetch', $event)"
  />
</template>
