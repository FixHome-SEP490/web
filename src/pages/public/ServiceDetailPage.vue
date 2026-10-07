<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { Clock, ShieldCheck, CheckCircle2, ChevronRight, ArrowLeft, Wrench } from 'lucide-vue-next';
import { FhButton, FhMoney, FhStatusPill, FhSkeleton, FhEmptyState } from '../../components';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';

const route = useRoute();
const router = useRouter();
const slug = route.params.slug as string;

const loading = ref(true);
const loadError = ref('');
const service = ref<ServiceItem | null>(null);

useSmoothScroll();

function isFixedPrice(s: ServiceItem): boolean {
  const mode = s.pricingMode?.toLowerCase();
  return mode === 'fixed_price' || (s.fixedPrice != null && s.fixedPrice > 0);
}

/** A price range only when the catalog actually has one; never a made-up 0 ₫. */
function hasPriceRange(s: ServiceItem): boolean {
  return (s.minPrice ?? 0) > 0 && (s.maxPrice ?? 0) > 0;
}

function bookService(s: ServiceItem) {
  // Guests are sent to sign-in by the router guard and come back here after.
  router.push({ path: '/app/bookings/new', query: { serviceId: s.id } });
}

async function loadService() {
  loading.value = true;
  loadError.value = '';
  try {
    service.value = await catalogApi.getService(slug);
  } catch {
    service.value = null;
    loadError.value = 'Không tìm thấy dịch vụ này hoặc không thể kết nối tới hệ thống. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadService);
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

    <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-20 items-start">
      <div class="space-y-6">
        <FhSkeleton height="32px" width="60%" />
        <FhSkeleton height="48px" width="90%" />
        <FhSkeleton height="16px" :count="3" />
      </div>
      <FhSkeleton height="320px" rounded="lg" />
    </div>

    <FhEmptyState
      v-else-if="loadError"
      title="Không tải được dịch vụ"
      :description="loadError"
      action-text="Thử lại"
      @action="loadService"
    >
      <template #extra>
        <router-link to="/services" class="text-xs font-semibold text-brand-600 hover:underline mt-2 block">
          Quay lại bảng giá dịch vụ
        </router-link>
      </template>
    </FhEmptyState>

    <div v-else-if="service" class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-20 items-start">
      <!-- Left Column -->
      <div class="space-y-16">
        <!-- Header Hero -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 mb-2">
             <FhStatusPill status="COMPLETED" :label="service.category?.name ?? 'Dịch vụ chuẩn'" class="bg-brand-50 text-brand-700" />
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
             {{ service.name }}
          </h1>
          <p class="text-lg sm:text-xl text-slate-500 font-medium leading-relaxed max-w-2xl">
             {{ service.description }}
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-10 border-t border-slate-100">
            <div v-if="service.estimatedMinutes > 0" class="space-y-2.5">
              <Clock :size="24" class="text-brand-500" />
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Thời lượng</div>
              <div class="text-sm font-semibold text-slate-900">~{{ service.estimatedMinutes }} phút</div>
            </div>
            <div class="space-y-2.5">
              <ShieldCheck :size="24" class="text-brand-500" />
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Bảo hành</div>
              <div class="text-sm font-semibold text-slate-900">Ghi trên phiếu bảo hành của đơn</div>
            </div>
            <div class="space-y-2.5">
              <CheckCircle2 :size="24" class="text-brand-500" />
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Xác thực</div>
              <div class="text-sm font-semibold text-slate-900">Kỹ thuật viên đã duyệt hồ sơ</div>
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
                 Là phí kiểm tra, dò lỗi và thao tác kỹ thuật của thợ. Dịch vụ giá niêm yết tính theo giá niêm yết; dịch vụ cần kiểm tra thì kỹ thuật viên gửi báo giá để bạn duyệt trước khi sửa.
               </p>
             </div>

             <div class="p-8 rounded-4xl bg-slate-50 border border-slate-200 space-y-4">
               <h4 class="font-bold text-slate-900 flex items-center gap-2">
                 <CheckCircle2 :size="20" class="text-slate-400" /> Tiền linh kiện
               </h4>
               <p class="text-sm text-slate-500 leading-relaxed font-medium">
                 Chỉ tính khi linh kiện cũ hỏng cần thay mới. Giá lấy theo danh mục linh kiện của FixHome và chỉ được tính khi bạn đồng ý.
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
           
           <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
             {{ isFixedPrice(service) ? 'Giá niêm yết' : 'Giá công tham khảo' }}
           </div>
           <div class="text-4xl sm:text-5xl font-extrabold text-slate-900 font-num tracking-tight mb-10">
             <template v-if="isFixedPrice(service) && (service.fixedPrice ?? service.basePrice)">
               <FhMoney :amount="service.fixedPrice ?? service.basePrice ?? 0" />
             </template>
             <template v-else-if="!isFixedPrice(service) && hasPriceRange(service)">
               <FhMoney :amount="service.minPrice ?? 0" /> – <FhMoney :amount="service.maxPrice ?? 0" />
             </template>
             <span v-else class="block text-xl font-semibold text-slate-500 font-sans tracking-normal">Báo giá sau khi kiểm tra</span>
           </div>

           <div class="space-y-4">
              <FhButton variant="primary" size="lg" class="w-full rounded-full shadow-lg shadow-brand-500/25 h-14 text-base" @click="bookService(service)">
                 Đặt thợ ngay bây giờ
              </FhButton>
              <FhButton variant="secondary" size="lg" class="w-full rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 h-14 text-base font-semibold" @click="router.push('/how-it-works')">
                 Xem quy trình đặt thợ
              </FhButton>
           </div>
           
           <div class="mt-8 pt-8 border-t border-slate-100 text-xs text-slate-500 font-medium leading-relaxed text-center">
             Bạn chọn giờ hẹn và 1 đến 2 kỹ thuật viên phù hợp khi đặt lịch.
           </div>
        </div>
      </div>
    </div>
  </div>
</template>
