<script setup lang="ts">
import { ref } from 'vue';
import { DollarSign, Calendar, Wallet, ArrowUpRight, ShieldCheck, Download } from 'lucide-vue-next';

import { FhMoney, FhTable, FhButton } from '../../components';

const payouts = ref([
  {
    orderCode: 'FH-20260910-0042',
    date: '10/09/2026',
    customer: 'Trần Văn Nam',
    gross: 400000,
    platformFee: 60000,
    net: 340000,
    status: 'COMPLETED',
  },
  {
    orderCode: 'FH-20260908-0019',
    date: '08/09/2026',
    customer: 'Lê Hoàng Anh',
    gross: 250000,
    platformFee: 37500,
    net: 212500,
    status: 'COMPLETED',
  },
  {
    orderCode: 'FH-20260905-0081',
    date: '05/09/2026',
    customer: 'Phạm Thuỳ Linh',
    gross: 500000,
    platformFee: 75000,
    net: 425000,
    status: 'COMPLETED',
  },
]);

const handleWithdraw = () => {
  window.alert('Yêu cầu rút tiền đã được gửi tới bộ phận Tài vụ FixHome. Tiền sẽ về tài khoản ngân hàng liên kết trong 1-2 giờ làm việc.');
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
          <DollarSign class="text-brand-600" :size="24" />
          <span>Thu Nhập & Quyết Toán</span>
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Theo dõi doanh thu công thợ thực nhận (85%), đối soát hoa hồng nền tảng và lịch sử thanh toán.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton variant="secondary" size="sm">
          <Download :size="14" class="mr-1.5" /> Xuất đối soát
        </FhButton>
      </div>
    </div>

    <!-- Hero Wallet Balance Card (Mobile Style) -->
    <div class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-blue-700 via-brand-600 to-indigo-700 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-6">
      <div class="space-y-1.5">
        <div class="flex items-center gap-2 text-xs font-semibold text-blue-200">
          <Wallet :size="16" class="text-amber-300" />
          <span>Số dư ví khả dụng (Có thể rút ngay)</span>
        </div>
        <div class="text-3xl sm:text-4xl font-extrabold font-num tracking-tight">
          3.850.000 <span class="text-lg font-sans font-bold">VNĐ</span>
        </div>
        <p class="text-xs text-blue-100 flex items-center gap-1.5 pt-1">
          <ShieldCheck :size="14" class="text-emerald-300" />
          Đã liên kết tài khoản Vietcombank (***8921)
        </p>
      </div>

      <button
        type="button"
        class="px-5 py-3 rounded-2xl bg-white text-brand-700 hover:bg-blue-50 active:scale-95 text-xs font-extrabold shrink-0 transition-all shadow-sm flex items-center justify-center gap-2"
        @click="handleWithdraw"
      >
        <span>Rút tiền về ngân hàng</span>
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
        <span class="text-xs font-bold text-indigo-800">Tỷ lệ chia sẻ</span>
        <div class="text-lg sm:text-2xl font-extrabold text-indigo-950 font-num">
          85% <span class="text-xs font-sans font-bold text-indigo-700">KTV</span>
        </div>
        <p class="text-[11px] text-indigo-600 font-medium">Phí nền tảng cố định 15%</p>
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
          { key: 'platformFee', label: 'Phí nền tảng (15%)', align: 'right' },
          { key: 'net', label: 'Thực nhận (85%)', align: 'right' },
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
  </div>
</template>
