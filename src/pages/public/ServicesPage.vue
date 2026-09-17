<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { Search, Clock } from 'lucide-vue-next';

import { FhButton, FhMoney } from '../../components';

const router = useRouter();
const selectedCategory = ref('ALL');
const searchQuery = ref('');

useSmoothScroll();

const categories = [
  { id: 'ALL', name: 'Tất cả dịch vụ' },
  { id: 'DIEN_LANH', name: 'Điện lạnh' },
  { id: 'DIEN_NUOC', name: 'Điện nước' },
  { id: 'GIA_DUNG', name: 'Gia dụng' },
  { id: 'KHOA_CUA', name: 'Khoá cửa' },
];

const services = [
  {
    id: 'srv-01',
    category: 'DIEN_LANH',
    name: 'Vệ sinh máy lạnh treo tường (≤ 2.0 HP)',
    desc: 'Xịt rửa dàn nóng, dàn lạnh bằng bạt chuyên dụng, kiểm tra áp suất gas và độ ồn.',
    minPrice: 180000,
    maxPrice: 250000,
    duration: 45,
  },
  {
    id: 'srv-02',
    category: 'DIEN_LANH',
    name: 'Nạp gas bổ sung R32 / R410A',
    desc: 'Kiểm tra rò rỉ khớp nối zắc co, nạp gas bổ sung chuẩn áp suất kỹ thuật.',
    minPrice: 200000,
    maxPrice: 350000,
    duration: 30,
  },
  {
    id: 'srv-03',
    category: 'DIEN_NUOC',
    name: 'Sửa rò rỉ đường ống nước âm tường',
    desc: 'Dò tìm điểm rò rỉ, đục cắt và thay thế đoạn ống nhiệt PPR hoặc PVC hỏng.',
    minPrice: 250000,
    maxPrice: 450000,
    duration: 90,
  },
  {
    id: 'srv-04',
    category: 'DIEN_NUOC',
    name: 'Thay thế & lắp mới vòi sen, vòi lavabo',
    desc: 'Tháo dỡ thiết bị cũ, cuốn băng tan và lắp đặt thiết bị mới chống thấm.',
    minPrice: 150000,
    maxPrice: 220000,
    duration: 40,
  },
  {
    id: 'srv-05',
    category: 'GIA_DUNG',
    name: 'Sửa bo mạch máy giặt không vắt / lỗi mã',
    desc: 'Kiểm tra cảm biến mực nước, công tắc cửa và sửa chữa linh kiện điều khiển.',
    minPrice: 350000,
    maxPrice: 650000,
    duration: 60,
  },
  {
    id: 'srv-06',
    category: 'KHOA_CUA',
    name: 'Lắp đặt khoá điện tử / khoá vân tay',
    desc: 'Khoan đục cửa gỗ hoặc nhôm kính, cài đặt vân tay, mật mã và thẻ từ.',
    minPrice: 300000,
    maxPrice: 500000,
    duration: 60,
  },
];

const filteredServices = computed(() => {
  return services.filter((s) => {
    const matchCat = selectedCategory.value === 'ALL' || s.category === selectedCategory.value;
    const matchSearch =
      !searchQuery.value ||
      s.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      s.desc.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchCat && matchSearch;
  });
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-24 space-y-12">
    <div class="text-center space-y-4 max-w-2xl mx-auto">
      <h1 class="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
        Bảng giá dịch vụ <br class="hidden sm:block"/>tham khảo
      </h1>
      <p class="text-slate-500 text-base sm:text-lg">
        Biểu giá công thợ tham khảo theo tiêu chuẩn kỹ thuật FixHome. Giá thực tế phụ thuộc khảo sát và loại linh kiện thay thế.
      </p>

      <!-- Search Box -->
      <div class="relative max-w-md mx-auto mt-6">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm kiếm dịch vụ (ví dụ: máy lạnh, ống nước...)"
          class="w-full h-14 pl-12 pr-6 text-sm bg-slate-50 border border-slate-200 rounded-full text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 shadow-sm transition-all"
        />
        <Search class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" :size="20" />
      </div>
    </div>

    <!-- Category Filter Tabs -->
    <div class="flex items-center justify-center gap-3 overflow-x-auto pb-4 no-scrollbar">
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="px-5 py-2.5 rounded-full text-sm font-semibold select-none transition-all shrink-0"
        :class="[
          selectedCategory === cat.id
            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900',
        ]"
        @click="selectedCategory = cat.id"
      >
        {{ cat.name }}
      </button>
    </div>

    <!-- Services Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      <div
        v-for="srv in filteredServices"
        :key="srv.id"
        class="bg-white border border-slate-200 rounded-4xl p-8 flex flex-col justify-between hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300 transition-all cursor-pointer"
        @click="router.push('/services/' + srv.id)"
      >
        <div class="space-y-4">
          <div class="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span class="flex items-center gap-1.5 font-num">
              <Clock :size="14" /> ~{{ srv.duration }} phút
            </span>
            <span class="text-brand-600 font-semibold bg-brand-50 px-2.5 py-1 rounded-full">Bảo hành 30-90 ngày</span>
          </div>

          <h3 class="text-xl font-bold text-slate-900 leading-snug">
            {{ srv.name }}
          </h3>

          <p class="text-sm text-slate-500 leading-relaxed font-medium">
            {{ srv.desc }}
          </p>
        </div>

        <div class="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Giá công tham khảo</div>
            <div class="text-base font-bold font-num text-slate-900">
              <FhMoney :amount="srv.minPrice" /> – <FhMoney :amount="srv.maxPrice" />
            </div>
          </div>

          <FhButton variant="primary" size="md" class="rounded-full shadow-md shadow-brand-500/20 h-10 px-5" @click.stop="router.push('/register')">
            Đặt thợ
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
