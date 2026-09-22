<script setup lang="ts">
import { computed, ref } from 'vue';

// Client-only example for discussing UX. Never pass these rows into the real quotation form/API.
const sampleLaborVnd = 120_000;
const demoParts = [
  { id: 'demo-seal', name: 'Gioăng thay thế (mẫu)', unitPrice: 45_000 },
  { id: 'demo-filter', name: 'Lưới lọc (mẫu)', unitPrice: 75_000 },
  { id: 'demo-cable', name: 'Dây nguồn (mẫu)', unitPrice: 90_000 },
] as const;
const selectedIds = ref<string[]>([]);
const selectedParts = computed(() => demoParts.filter(part => selectedIds.value.includes(part.id)));
const demoPartsTotal = computed(() => selectedParts.value.reduce((sum, part) => sum + part.unitPrice, 0));
const demoTotal = computed(() => sampleLaborVnd + demoPartsTotal.value);
const vnd = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
const toggle = (id: string) => {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(selected => selected !== id)
    : [...selectedIds.value, id];
};
</script>

<template>
  <section data-testid="parts-quotation-demo" role="note" class="rounded-xl border border-sky-300 bg-sky-50 p-3 space-y-3 text-xs text-sky-950">
    <h4 class="font-bold text-sm">DEMO — Chọn linh kiện để xem trước báo giá mẫu</h4>
    <p>Đây là dữ liệu giả để hình dung cách chọn linh kiện và cộng tiền công. Không lấy từ kho/cửa hàng, không có giá hoặc bảo hành chính thức; <strong>không thêm vào báo giá thật và không gửi API</strong>.</p>
    <div role="group" aria-label="Danh sách linh kiện mẫu" class="grid sm:grid-cols-3 gap-2">
      <label v-for="part in demoParts" :key="part.id" class="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-white p-2 cursor-pointer">
        <span class="flex items-center gap-2"><input type="checkbox" :checked="selectedIds.includes(part.id)" @change="toggle(part.id)" />{{ part.name }}</span>
        <strong class="font-num whitespace-nowrap">{{ vnd(part.unitPrice) }}</strong>
      </label>
    </div>
    <div class="rounded-lg bg-white border border-sky-200 p-3 space-y-1" data-testid="parts-demo-cost-breakdown">
      <p>Tiền công mẫu: <strong>{{ vnd(sampleLaborVnd) }}</strong></p>
      <p data-testid="parts-demo-selected">Linh kiện mẫu đã chọn: <strong>{{ selectedParts.length }}</strong> — {{ vnd(demoPartsTotal) }}</p>
      <p data-testid="parts-demo-total">Tổng báo giá mẫu: <strong>{{ vnd(demoTotal) }}</strong></p>
    </div>
    <p class="font-semibold">Để gửi báo giá thật cho khách, thợ phải tự nhập và xác nhận biểu mẫu báo giá riêng bên dưới. Việc chọn mẫu ở đây không ảnh hưởng ServiceOrder, số dư ví hoặc thanh toán.</p>
  </section>
</template>