<script setup lang="ts">
import { ref } from 'vue';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { Search } from 'lucide-vue-next';

import {
  FhButton,
  FhStatusPill,
  FhTimeline,
  type TimelineStep,
} from '../../components';

const orderCode = ref('');
const phone = ref('');
const searched = ref(false);
const loading = ref(false);

useSmoothScroll();

const mockFoundOrder = ref<{
  code: string;
  service: string;
  status: string;
  technician: string;
  steps: TimelineStep[];
} | null>(null);

const handleTrack = () => {
  if (!orderCode.value.trim() || !phone.value.trim()) return;
  loading.value = true;

  setTimeout(() => {
    loading.value = false;
    searched.value = true;
    mockFoundOrder.value = {
      code: orderCode.value.trim().toUpperCase(),
      service: 'Vệ sinh & Bơm ga máy lạnh Inverter Daikin',
      status: 'UNDER_REPAIR',
      technician: 'Trần Văn Hoàng (0903 000 001)',
      steps: [
        {
          key: '1',
          label: 'Khách hàng tạo yêu cầu sửa chữa',
          timestamp: '13:00 Hôm nay',
          actor: 'Khách hàng',
          completed: true,
        },
        {
          key: '2',
          label: 'Kỹ thuật viên nhận đơn & xuất phát',
          timestamp: '13:15 Hôm nay',
          actor: 'Trần Văn Hoàng',
          completed: true,
        },
        {
          key: '3',
          label: 'Check-in GPS tại địa chỉ khách hàng',
          timestamp: '13:40 Hôm nay',
          actor: 'Hệ thống xác thực (Hợp lệ)',
          completed: true,
        },
        {
          key: '4',
          label: 'Đang tiến hành sửa chữa & kiểm tra',
          timestamp: 'Hiện tại',
          actor: 'Trần Văn Hoàng',
          current: true,
        },
        {
          key: '5',
          label: 'Chụp ảnh nghiệm thu & Hoàn tất',
          completed: false,
        },
      ],
    };
  }, 600);
};
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 py-24 space-y-12">
    <div class="text-center space-y-4 max-w-2xl mx-auto">
      <div class="w-16 h-16 bg-slate-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm">
        <Search :size="28" />
      </div>
      <h1 class="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
        Tra cứu tiến độ <br class="hidden sm:block"/>đơn sửa chữa
      </h1>
      <p class="text-slate-500 text-lg font-medium pt-2">
        Nhập mã đơn hàng và số điện thoại đã đăng ký để kiểm tra trạng thái thực tế của kỹ thuật viên.
      </p>
    </div>

    <!-- Search Form Box -->
    <div class="bg-white border border-slate-200 rounded-4xl p-8 md:p-12 shadow-xl shadow-slate-200/50 relative z-10 max-w-3xl mx-auto">
      <form class="space-y-6" @submit.prevent="handleTrack">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="block text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Mã đơn hàng
            </label>
            <input
              v-model="orderCode"
              type="text"
              required
              placeholder="Ví dụ: FH-8821"
              class="w-full h-14 px-5 text-sm bg-slate-50 border border-slate-200 rounded-2xl uppercase font-num focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 shadow-sm transition-all text-slate-900"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Số điện thoại
            </label>
            <input
              v-model="phone"
              type="tel"
              required
              placeholder="Ví dụ: 0901234567"
              class="w-full h-14 px-5 text-sm bg-slate-50 border border-slate-200 rounded-2xl font-num focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 shadow-sm transition-all text-slate-900"
            />
          </div>
        </div>

        <div class="pt-4">
          <FhButton type="submit" variant="primary" size="lg" block class="rounded-full shadow-lg shadow-brand-500/25 h-14 text-base" :loading="loading">
            <Search :size="18" class="mr-2" />
            Tra cứu thông tin
          </FhButton>
        </div>
      </form>
    </div>

    <!-- Results Display -->
    <div v-if="searched && mockFoundOrder" class="space-y-6 pt-4 max-w-3xl mx-auto">
      <div class="bg-white border border-slate-200 rounded-4xl p-8 md:p-10 shadow-xl shadow-slate-200/50">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">{{ mockFoundOrder.code }}</span>
            <h3 class="text-xl font-bold text-slate-900 mb-2">{{ mockFoundOrder.service }}</h3>
            <p class="text-sm font-medium text-slate-500">Thợ phụ trách: {{ mockFoundOrder.technician }}</p>
          </div>
          <FhStatusPill :status="mockFoundOrder.status" />
        </div>

        <!-- Timeline -->
        <div class="pt-8">
          <h4 class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">Tiến trình thực hiện</h4>
          <FhTimeline :steps="mockFoundOrder.steps" />
        </div>
      </div>
    </div>
  </div>
</template>
