<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import {
  Wrench,
  Zap,
  Droplet,
  Key,
  ShieldCheck,
  ArrowRight,
  ChevronRight,
} from 'lucide-vue-next';
import {
  FhButton,
} from '../../components';

const router = useRouter();

useSmoothScroll();

const categories = [
  {
    name: 'Sửa điện lạnh & Máy lạnh',
    desc: 'Vệ sinh, nạp gas, sửa bo mạch, không lạnh',
    icon: Zap,
    count: '34 thợ sẵn sàng',
    price: 'từ 180.000 ₫',
  },
  {
    name: 'Điện & Nước dân dụng',
    desc: 'Rò rỉ nước, chập điện, lắp bóng đèn, máy bơm',
    icon: Droplet,
    count: '28 thợ sẵn sàng',
    price: 'từ 150.000 ₫',
  },
  {
    name: 'Thiết bị bếp & Gia dụng',
    desc: 'Bếp từ, máy giặt, lò vi sóng, máy hút mùi',
    icon: Wrench,
    count: '19 thợ sẵn sàng',
    price: 'từ 200.000 ₫',
  },
  {
    name: 'Khoá cửa & An ninh',
    desc: 'Khoá điện tử, khoá vân tay, bản lề cửa',
    icon: Key,
    count: '14 thợ sẵn sàng',
    price: 'từ 160.000 ₫',
  },
];

const steps = [
  {
    num: '01',
    title: 'Gửi sự cố & AI chẩn đoán',
    desc: 'Mô tả tình trạng lỗi và đính kèm hình ảnh. AI FixHome tự động ước tính nguyên nhân và khung giá.',
  },
  {
    num: '02',
    title: 'Ghép thợ trong 15 phút',
    desc: 'Hệ thống gợi ý tối đa 5 thợ gần nhất có tay nghề phù hợp. Thợ đến tận nơi với xác thực GPS geofence.',
  },
  {
    num: '03',
    title: 'Báo giá tách bạch rõ ràng',
    desc: 'Thợ chụp ảnh hiện trạng và lập bảng báo giá tách riêng tiền công thợ và thiết bị thay thế.',
  },
  {
    num: '04',
    title: 'Nghiệm thu & Bảo hành điện tử',
    desc: 'Chụp ảnh sau sửa chữa, hoá đơn điện tử minh bạch kèm thời hạn bảo hành cam kết từ 30-90 ngày.',
  },
];
</script>

<template>
  <div class="bg-white selection:bg-brand-200 selection:text-brand-900 font-sans">
    <!-- Hero Section -->
    <section class="pt-24 lg:pt-32 pb-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <!-- Left Column -->
          <div class="max-w-2xl">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-8 h-px bg-brand-500"></div>
              <div class="text-xs font-bold text-brand-600 tracking-widest uppercase">Trải nghiệm dịch vụ</div>
            </div>
            <h1 class="text-5xl sm:text-6xl lg:text-[4.5rem] font-bold tracking-tight text-slate-900 leading-[1.05] mb-6">
              Chăm sóc ngôi nhà như một <span class="text-brand-600">dịch vụ concierge.</span>
            </h1>
            <p class="text-xl text-slate-500 font-medium mb-10 max-w-xl leading-relaxed">
              Không còn nỗi lo ép giá, thợ vẽ bệnh. FixHome kết nối bạn với chuyên gia gần nhất, báo giá vật tư và công thợ tách bạch rõ ràng.
            </p>
            
            <div class="flex flex-col sm:flex-row items-center gap-4 mb-10">
              <FhButton variant="primary" size="lg" class="w-full sm:w-auto rounded-full px-8 h-12 shadow-md shadow-brand-500/20" @click="router.push('/register')">
                Đặt thợ ngay bây giờ
              </FhButton>
              <FhButton variant="secondary" size="lg" class="w-full sm:w-auto rounded-full px-8 h-12 bg-white border border-slate-200 hover:bg-slate-50" @click="router.push('/pricing-policy')">
                Xem bảng giá
              </FhButton>
            </div>

            <div class="flex flex-wrap items-center gap-4 sm:gap-6 text-sm font-semibold text-slate-500">
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-brand-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Thợ xác minh 100%
              </div>
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-brand-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Đánh giá 4.9/5
              </div>
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-brand-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Bảo hành 90 ngày
              </div>
            </div>
          </div>

          <!-- Right Column / Hero Image -->
          <div class="relative w-full rounded-3xl overflow-hidden aspect-4/5 bg-slate-100 hidden sm:block">
            <img src="https://www.dienlanhhungcuong.com/Upload/Editor/07022026072202thosuamaylanh-d486.jpg" alt="Professional toolkit" class="w-full h-full object-cover object-center" />
            
            <div class="absolute bottom-4 left-4 right-4 bg-[#0a192f]/90 backdrop-blur-md rounded-2xl p-5 text-white flex justify-between items-center shadow-xl">
              <div>
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Đơn hàng mẫu</div>
                <div class="text-sm font-semibold">Vệ sinh máy lạnh · Đang sửa chữa</div>
              </div>
              <div class="w-10 h-10 rounded-full border border-white/20 bg-white/5 flex items-center justify-center shrink-0">
                <Zap :size="18" class="text-brand-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Services Section -->
    <section class="py-24 bg-slate-50/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col md:flex-row md:justify-between md:items-end border-b border-slate-200 pb-8 mb-4 gap-4">
          <div>
            <div class="text-xs font-semibold text-brand-600 tracking-wider uppercase mb-3">Mạng lưới thợ chuyên nghiệp</div>
            <h2 class="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">Mỗi hạng mục, một <br class="hidden md:block"/>tiêu chuẩn riêng.</h2>
          </div>
          <button class="text-sm font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors" @click="router.push('/services')">
            Xem tất cả <ChevronRight :size="16" />
          </button>
        </div>

        <div class="flex flex-col">
          <div v-for="(cat, idx) in categories" :key="cat.name" class="group flex flex-col sm:flex-row sm:items-center py-6 border-b border-slate-200 hover:bg-white transition-colors cursor-pointer px-4 -mx-4 rounded-2xl gap-4 sm:gap-0" @click="router.push('/services')">
            <div class="w-12 font-medium text-slate-400 font-num">0{{ idx + 1 }}</div>
            <div class="flex-1">
              <div class="font-bold text-lg text-slate-900 group-hover:text-brand-600 transition-colors">{{ cat.name }}</div>
              <div class="text-sm text-slate-500 font-medium mt-1">{{ cat.desc }}</div>
            </div>
            
            <div class="hidden lg:block w-70 text-sm text-brand-600 font-semibold">
              Kiểm tra & Chẩn đoán bệnh
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              <div class="font-semibold text-slate-900 font-num">{{ cat.price }}</div>
              <div class="text-slate-300 group-hover:text-brand-600 transition-colors">
                <ArrowRight :size="20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Cost Breakdown -->
    <section class="py-24 bg-slate-50/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div class="text-xs font-semibold text-brand-600 tracking-wider uppercase mb-3">Minh bạch</div>
            <h2 class="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight leading-[1.1] mb-6">Số tiền rõ ràng trước <br class="hidden md:block"/>khi bạn gật đầu.</h2>
            <p class="text-lg text-slate-500 font-medium leading-relaxed max-w-lg">
              Báo giá vật tư sẽ được liệt kê tách bạch với công thợ. Không có bất kỳ khoản phí ẩn nào sau khi công việc hoàn thành.
            </p>
          </div>

          <div class="w-full bg-white border border-slate-200 rounded-4xl overflow-hidden shadow-xl shadow-slate-200/50">
            <div class="p-8 md:p-10 flex justify-between items-start border-b border-slate-100 gap-4">
              <div>
                <div class="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-2">Hoá đơn mẫu</div>
                <div class="font-bold text-lg text-slate-900">Vệ sinh bảo dưỡng máy lạnh Inverter</div>
              </div>
              <div class="text-xs text-slate-400 text-right">
                Mã đơn<br/><span class="font-bold text-slate-900 text-sm">FH-8821</span>
              </div>
            </div>
            
            <div class="p-8 md:p-10 space-y-6 text-base font-medium">
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Tiền công thợ (Mã: D-02)</span>
                <span class="font-bold text-slate-900 font-num">180.000 ₫</span>
              </div>
              <div class="w-full h-px border-t border-dashed border-slate-200"></div>
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Vật tư & Linh kiện (Ga R32)</span>
                <span class="font-bold text-slate-900 font-num">250.000 ₫</span>
              </div>
            </div>
            
            <div class="bg-slate-50 p-8 md:p-10 flex flex-col sm:flex-row justify-between items-start sm:items-center border-t border-slate-100 gap-4">
              <div>
                <div class="text-[11px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Tổng cộng</div>
                <div class="text-sm text-brand-600 font-semibold flex items-center gap-1.5">
                  <ShieldCheck :size="16" /> Bảo hành 90 ngày cho công thợ
                </div>
              </div>
              <span class="text-3xl md:text-4xl font-extrabold text-slate-900 font-num tracking-tight">430.000 ₫</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4 Steps Process -->
    <section class="py-24 bg-[#0a192f] text-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="mb-20">
          <div class="text-xs font-semibold text-brand-400 tracking-wider uppercase mb-3">Quy trình làm việc</div>
          <h2 class="text-3xl md:text-5xl font-bold tracking-tight">Sửa nhà dễ dàng <br class="hidden md:block"/>trong 4 bước.</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative mt-4">
          <!-- Active Line -->
          <div class="hidden lg:block absolute top-1.25 left-0 w-full h-px bg-slate-800 z-0">
             <div class="w-[30%] h-full bg-brand-500"></div>
          </div>

          <div v-for="(step, idx) in steps" :key="step.num" class="relative">
            <!-- Node Point -->
            <div class="hidden lg:block absolute -top-1 left-0 w-3 h-3 rounded-full bg-[#0a192f] border-2 border-slate-700 z-10" :class="{ 'border-brand-500 bg-brand-500': idx === 0 }"></div>

            <div class="text-sm font-bold text-brand-400 mb-6 font-num lg:mt-8">{{ step.num }}</div>
            <h3 class="text-xl font-bold mb-4">{{ step.title }}</h3>
            <p class="text-sm text-slate-400 leading-relaxed font-medium">
              {{ step.desc }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Bottom CTA -->
    <section class="py-24 bg-white">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div class="bg-slate-50 rounded-[3rem] p-12 md:p-20 shadow-sm border border-slate-100">
          <div class="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm text-brand-600">
             <Wrench :size="24" stroke-width="2.5" />
          </div>
          
          <h2 class="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-6">
            Đang gặp sự cố <br class="hidden sm:block"/>thiết bị tại nhà?
          </h2>
          
          <p class="text-base text-slate-500 font-medium max-w-lg mx-auto mb-10 leading-relaxed">
            Tìm hiểu ngay hoặc gọi điện cho chuyên gia để được tư vấn miễn phí.
          </p>
          
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <FhButton variant="primary" size="lg" class="rounded-full px-8 h-12 w-full sm:w-auto shadow-md shadow-brand-500/20" @click="router.push('/contact')">
              Gọi 1800 8888
            </FhButton>
            <FhButton variant="secondary" size="lg" class="rounded-full px-8 h-12 bg-white border border-slate-200 hover:bg-slate-50 w-full sm:w-auto text-slate-700" @click="router.push('/pricing-policy')">
              Xem bảng giá
            </FhButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
