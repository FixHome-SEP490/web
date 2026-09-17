<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { Clock, ShieldCheck, CheckCircle2, ChevronRight, Star, ArrowLeft, Wrench } from 'lucide-vue-next';
import { FhButton, FhMoney, FhStatusPill } from '../../components';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';

const route = useRoute();
const router = useRouter();
const slug = route.params.slug as string;

const loading = ref(true);
const service = ref<ServiceItem | null>(null);

useSmoothScroll();

// Fallback mock if backend is unavailable
const fallbackService: ServiceItem = {
  id: 'mock-1',
  categoryId: 'cat-1',
  name: 'Vệ sinh & bảo dưỡng máy lạnh',
  code: 'VE_SINH_DIEU_HOA',
  slug: 've-sinh-dieu-hoa',
  description: 'Vệ sinh dàn nóng, dàn lạnh bằng máy xịt áp lực chuyên dụng, kiểm tra áp suất gas và độ ồn hoạt động.',
  basePrice: 200000,
  minPrice: 150000,
  maxPrice: 400000,
  basePriceMin: 150000,
  basePriceMax: 400000,
  estimatedMinutes: 45,
  isActive: true,
  category: {
    id: 'cat-1',
    name: 'Điện lạnh',
    code: 'DIEN_LANH',
    sortOrder: 1,
    isActive: true,
  },
};

onMounted(async () => {
  try {
    const data = await catalogApi.getService(slug);
    service.value = data;
  } catch {
    service.value = fallbackService;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 space-y-12">
    <!-- Breadcrumb & Back -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <nav class="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <router-link to="/" class="hover:text-slate-900 transition-colors">Trang chủ</router-link>
        <ChevronRight :size="12" />
        <router-link to="/services" class="hover:text-slate-900 transition-colors">Bảng giá dịch vụ</router-link>
        <ChevronRight :size="12" />
        <span class="text-slate-900 truncate">{{ service?.name ?? 'Chi tiết dịch vụ' }}</span>
      </nav>

      <button
        class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-wider"
        @click="router.back()"
      >
        <ArrowLeft :size="14" /> Quay lại
      </button>
    </div>

    <div v-if="service" class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-20 items-start">
      <!-- Left Column -->
      <div class="space-y-16">
        <!-- Header Hero -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 mb-2">
             <FhStatusPill status="COMPLETED" :label="service.category?.name ?? 'Dịch vụ chuẩn'" class="bg-brand-50 text-brand-700" />
             <span class="flex items-center gap-1.5 text-sm text-slate-600 font-semibold font-num">
               <Star :size="14" class="fill-amber-400 text-amber-400" /> 4.9 (1.2k+ đánh giá)
             </span>
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
             {{ service.name }}
          </h1>
          <p class="text-lg sm:text-xl text-slate-500 font-medium leading-relaxed max-w-2xl">
             {{ service.description }}
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-10 border-t border-slate-100">
            <div class="space-y-2.5">
              <Clock :size="24" class="text-brand-500" />
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Thời lượng</div>
              <div class="text-sm font-semibold text-slate-900">~{{ service.estimatedMinutes }} phút</div>
            </div>
            <div class="space-y-2.5">
              <ShieldCheck :size="24" class="text-brand-500" />
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Bảo hành</div>
              <div class="text-sm font-semibold text-slate-900">30 – 90 ngày</div>
            </div>
            <div class="space-y-2.5">
              <CheckCircle2 :size="24" class="text-brand-500" />
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Xác thực</div>
              <div class="text-sm font-semibold text-slate-900">100% Lý lịch rõ ràng</div>
            </div>
          </div>
        </div>

        <!-- Price Transparency Section -->
        <div>
           <div class="text-xs font-semibold text-brand-600 tracking-wider uppercase mb-3">Minh bạch</div>
           <h2 class="text-3xl font-bold text-slate-900 tracking-tight mb-8">Quy chuẩn chi phí (D-02)</h2>
           
           <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
             <div class="p-8 rounded-4xl bg-brand-50/50 border border-brand-100 space-y-4">
               <h4 class="font-bold text-brand-900 flex items-center gap-2">
                 <CheckCircle2 :size="20" class="text-brand-600" /> Tiền công kỹ thuật
               </h4>
               <p class="text-sm text-brand-900/70 leading-relaxed font-medium">
                 Là phí kiểm tra, dò lỗi và thao tác kỹ thuật của thợ. Báo giá công luôn cố định theo bảng giá chuẩn niêm yết, cam kết không phát sinh vô lý.
               </p>
             </div>

             <div class="p-8 rounded-4xl bg-slate-50 border border-slate-200 space-y-4">
               <h4 class="font-bold text-slate-900 flex items-center gap-2">
                 <CheckCircle2 :size="20" class="text-slate-400" /> Tiền linh kiện
               </h4>
               <p class="text-sm text-slate-500 leading-relaxed font-medium">
                 Chỉ tính khi linh kiện cũ hỏng cần thay mới. Thợ phải xuất trình mã linh kiện, giá đại lý và chỉ được mua khi có sự đồng ý của bạn.
               </p>
             </div>
           </div>
        </div>
      </div>

      <!-- Right Column (Booking Sticky) -->
      <div class="sticky top-28 space-y-6">
        <div class="bg-white border border-slate-200 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl shadow-slate-200/50">
           <div class="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-900 mb-8 border border-slate-100">
             <Wrench :size="24" />
           </div>
           
           <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Giá công tham khảo</div>
           <div class="text-4xl sm:text-5xl font-extrabold text-slate-900 font-num tracking-tight mb-10">
             <FhMoney :amount="service.minPrice ?? service.basePrice ?? 150000" />
           </div>

           <div class="space-y-4">
              <FhButton variant="primary" size="lg" class="w-full rounded-full shadow-lg shadow-brand-500/25 h-14 text-base" @click="router.push('/register')">
                 Đặt thợ ngay bây giờ
              </FhButton>
              <FhButton variant="secondary" size="lg" class="w-full rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 h-14 text-base font-semibold" @click="router.push('/contact')">
                 Tư vấn thêm
              </FhButton>
           </div>
           
           <div class="mt-8 pt-8 border-t border-slate-100 text-xs text-slate-500 font-medium leading-relaxed text-center">
             Kỹ thuật viên gần bạn nhất sẽ tiếp nhận và có mặt trong 30 – 45 phút.
           </div>
        </div>
      </div>
    </div>
  </div>
</template>
