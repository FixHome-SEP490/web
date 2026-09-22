<script setup lang="ts">
import { ref } from 'vue';
import { DollarSign, Calendar, Wallet, ArrowUpRight, Download } from 'lucide-vue-next';

import { FhMoney, FhTable, FhButton } from '../../components';

const showWalletDemo = import.meta.env.DEV;
const payouts = ref([
  {
    orderCode: 'DEMO-0042',
    date: '10/09/2026',
    customer: 'Khách demo 1',
    gross: 400000,
    platformFee: 60000,
    net: 340000,
    status: 'COMPLETED',
  },
  {
    orderCode: 'DEMO-0019',
    date: '08/09/2026',
    customer: 'Khách demo 2',
    gross: 250000,
    platformFee: 37500,
    net: 212500,
    status: 'COMPLETED',
  },
  {
    orderCode: 'DEMO-0081',
    date: '05/09/2026',
    customer: 'Khách demo 3',
    gross: 500000,
    platformFee: 75000,
    net: 425000,
    status: 'COMPLETED',
  },
]);

</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <template v-if="showWalletDemo">
    <div data-testid="wallet-demo-notice" role="note" class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>DEMO — Dữ liệu minh họa, không phải tiền thật.</strong>
      Số dư, doanh thu, phí nền tảng và lịch sử bên dưới là ví dụ giao diện; chưa kết nối Wallet hoặc ngân hàng. Trang này không thể rút tiền hay tạo giao dịch. Quy tắc Linh kiện/Wallet đang chờ nhóm chốt.
    </div>
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
          <DollarSign class="text-brand-600" :size="24" />
          <span>Thu Nhập & Quyết Toán</span>
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Các số liệu dưới đây chỉ để xem trước giao diện; không dùng tỷ lệ phí minh họa làm quy tắc nghiệp vụ.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton variant="secondary" size="sm" disabled>
          <Download :size="14" class="mr-1.5" /> Xuất đối soát (DEMO — chưa hỗ trợ)
        </FhButton>
      </div>
    </div>

    <!-- Hero Wallet Balance Card (Mobile Style) -->
    <div class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-blue-700 via-brand-600 to-indigo-700 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-6">
      <div class="space-y-1.5">
        <div class="flex items-center gap-2 text-xs font-semibold text-blue-200">
          <Wallet :size="16" class="text-amber-300" />
          <span>Số dư minh họa (DEMO — không thể rút)</span>
        </div>
        <div class="text-3xl sm:text-4xl font-extrabold font-num tracking-tight">
          3.850.000 <span class="text-lg font-sans font-bold">VNĐ</span>
        </div>
        <p class="text-xs text-blue-100 flex items-center gap-1.5 pt-1">
          Chưa kết nối ngân hàng — số dư bên trên chỉ để minh họa
        </p>
      </div>

      <button
        type="button"
        class="px-5 py-3 rounded-2xl bg-white text-brand-700 hover:bg-blue-50 active:scale-95 text-xs font-extrabold shrink-0 transition-all shadow-sm flex items-center justify-center gap-2"
        disabled aria-disabled="true" title="Chức năng rút tiền chưa được triển khai"
      >
        <span>Rút tiền chưa hỗ trợ (DEMO)</span>
        <ArrowUpRight :size="16" />
      </button>
    </div>

    <!-- 4 Gradient Stat Cards (Matching Mobile Home Overview) -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-sky-100 via-sky-50 to-white border border-sky-200/80 shadow-xs space-y-1">
        <span class="text-xs font-bold text-sky-800">Thực nhận tháng này</span>
        <div class="text-lg sm:text-2xl font-extrabold text-sky-950 font-num">
          12.450.000 <span class="text-xs font-sans font-bold text-sky-700">đ</span>
        </div>
        <p class="text-[11px] text-sky-600 font-medium">+15% so với tháng trước</p>
      </div>

      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-white border border-amber-200/80 shadow-xs space-y-1">
        <span class="text-xs font-bold text-amber-800">Đơn hoàn tất</span>
        <div class="text-lg sm:text-2xl font-extrabold text-amber-950 font-num">
          28 <span class="text-xs font-sans font-bold text-amber-700">đơn</span>
        </div>
        <p class="text-[11px] text-amber-600 font-medium">Tỷ lệ thành công 96%</p>
      </div>

      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-100 via-emerald-50 to-white border border-emerald-200/80 shadow-xs space-y-1">
        <span class="text-xs font-bold text-emerald-800">Đánh giá sao</span>
        <div class="text-lg sm:text-2xl font-extrabold text-emerald-950 font-num">
          4.95 <span class="text-xs font-sans font-bold text-emerald-700">★</span>
        </div>
        <p class="text-[11px] text-emerald-600 font-medium">Từ 148 khách hàng</p>
      </div>

      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-100 via-indigo-50 to-white border border-indigo-200/80 shadow-xs space-y-1">
        <span class="text-xs font-bold text-indigo-800">Phí nền tảng (DEMO)</span>
        <div class="text-lg sm:text-2xl font-extrabold text-indigo-950 font-num">
          Chưa chốt
        </div>
        <p class="text-[11px] text-indigo-600 font-medium">Chỉ minh họa giao diện, không phải quy tắc tính phí</p>
      </div>
    </div>

    <!-- Payout History Table Card -->
    <div class="bg-white rounded-3xl border border-ink-200/80 p-5 sm:p-6 shadow-xs space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-bold text-ink-900">Lịch sử các đơn đã quyết toán</h2>
        <span class="text-xs text-ink-500 font-medium">3 đơn gần nhất</span>
      </div>

      <FhTable
        :columns="[
          { key: 'orderCode', label: 'Mã đơn' },
          { key: 'date', label: 'Ngày thực hiện' },
          { key: 'customer', label: 'Khách hàng' },
          { key: 'gross', label: 'Tổng thu', align: 'right' },
          { key: 'platformFee', label: 'Phí nền tảng (mẫu)', align: 'right' },
          { key: 'net', label: 'Thực nhận (mẫu)', align: 'right' },
        ]"
        :rows="payouts"
      >
        <template #cell-orderCode="{ row }">
          <span class="font-mono text-xs font-bold text-ink-900">{{ row.orderCode }}</span>
        </template>

        <template #cell-date="{ row }">
          <span class="text-xs text-ink-500 flex items-center gap-1 font-medium">
            <Calendar :size="13" class="text-brand-600" /> {{ row.date }}
          </span>
        </template>

        <template #cell-customer="{ row }">
          <span class="text-xs font-semibold text-ink-800">{{ row.customer }}</span>
        </template>

        <template #cell-gross="{ row }">
          <span class="font-num text-xs font-bold text-ink-700">
            <FhMoney :amount="row.gross" />
          </span>
        </template>

        <template #cell-platformFee="{ row }">
          <span class="font-num text-xs font-bold text-danger-600">
            -<FhMoney :amount="row.platformFee" />
          </span>
        </template>

        <template #cell-net="{ row }">
          <span class="font-num text-xs font-extrabold text-emerald-600">
            +<FhMoney :amount="row.net" />
          </span>
        </template>
      </FhTable>
    </div>
    </template>
    <div v-else role="status" class="rounded-xl border border-ink-200 bg-ink-50 p-5 text-sm text-ink-700">
      Thu nhập và Wallet đang chờ nhóm chốt nghiệp vụ và tích hợp Backend. Không hiển thị số dư hoặc giao dịch giả trong bản phát hành.
    </div>
  </div>
</template>
