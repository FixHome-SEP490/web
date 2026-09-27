<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import {
  Wrench,
  Zap,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Smartphone,
  Bot,
  MessageSquare,
  Download,
  Wind,
  Droplets,
  Thermometer,
  Flame,
  Zap as ZapIcon
} from 'lucide-vue-next';
import Marquee from '@selemondev/vue3-marquee';
import '@selemondev/vue3-marquee/style.css';
import {
  FhButton,
} from '../../components';

const router = useRouter();
useSmoothScroll();

const activeSection = ref('start');

const timelineItems = [
  { id: 'start', label: 'Bắt đầu' },
  { id: 'intro', label: 'Tổng quan FixHome' },
  { id: 'steps', label: 'Trải nghiệm App' },
  { id: 'ai', label: 'Khám phá với AI' },
  { id: 'commitment', label: 'Cam kết' },
];

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          activeSection.value = entry.target.id;
        }
      });
    },
    { threshold: 0.3, rootMargin: "-10% 0px -40% 0px" }
  );

  timelineItems.forEach((item) => {
    const el = document.getElementById(item.id);
    if (el) observer.observe(el);
  });

  onUnmounted(() => {
    observer.disconnect();
  });
});

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
};

const steps = [
  {
    num: '01',
    title: 'Mở ứng dụng',
    desc: 'Truy cập FixHome trên điện thoại của bạn, chọn dịch vụ cần thiết hoặc để AI gợi ý.',
  },
  {
    num: '02',
    title: 'Gửi yêu cầu',
    desc: 'Chụp ảnh sự cố, mô tả ngắn gọn. Hệ thống sẽ tiếp nhận ngay lập tức.',
  },
  {
    num: '03',
    title: 'Ghép thợ gần nhất',
    desc: 'AI tìm kiếm và kết nối bạn với chuyên gia gần nhất trong vòng 15 phút.',
  },
  {
    num: '04',
    title: 'Hoàn thành & Đánh giá',
    desc: 'Nghiệm thu công việc, thanh toán minh bạch và nhận bảo hành điện tử.',
  },
];
</script>

<template>
  <div class="bg-white selection:bg-brand-200 selection:text-brand-900 font-sans relative">
    
    <!-- Vertical Timeline Indicator (Desktop only) -->
    <nav class="hidden xl:flex fixed right-8 top-1/2 -translate-y-1/2 z-50 flex-col gap-10">
      <a 
        v-for="(item, idx) in timelineItems" 
        :key="item.id" 
        :href="`#${item.id}`"
        class="group relative flex items-center justify-center w-6 h-6"
        @click.prevent="scrollToSection(item.id)"
      >
        <!-- Line connecting nodes -->
        <div v-if="idx !== timelineItems.length - 1" 
             class="absolute top-6 left-1/2 -translate-x-1/2 w-0.5 h-10 transition-colors duration-500"
             :class="idx < timelineItems.findIndex(t => t.id === activeSection) ? 'bg-blue-500' : 'bg-slate-200'">
        </div>
        
        <!-- Node point -->
        <div v-if="activeSection === item.id" class="absolute w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shadow-sm">
           <div class="w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
              <div class="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
           </div>
        </div>
        <div v-else class="w-2.5 h-2.5 rounded-full transition-all duration-300"
             :class="idx < timelineItems.findIndex(t => t.id === activeSection) ? 'bg-blue-500' : 'bg-slate-300 group-hover:bg-blue-400'">
        </div>
        
        <!-- Label tooltip -->
        <div 
          class="absolute right-12 transition-all duration-300 pointer-events-none"
          :class="activeSection === item.id ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0'"
        >
          <div class="bg-slate-900 text-white text-sm font-bold py-2.5 px-6 rounded-full whitespace-nowrap shadow-xl">
            {{ item.label }}
          </div>
        </div>
      </a>
    </nav>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 xl:px-2 2xl:px-4">
      
      <!-- Section 1: Start -->
      <section id="start" class="min-h-screen pt-28 pb-16 flex flex-col justify-center">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <!-- Left Content -->
          <div class="lg:col-span-7 relative z-10">
            
            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#0f172a] leading-[1.1] mb-6">
              Kết nối đội ngũ <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-blue-800">thợ chuyên nghiệp</span><br/>
              ngay gần bạn
            </h1>
            
            <p class="text-lg text-slate-600 font-medium mb-10 max-w-xl leading-relaxed">
              AI kết nối khách hàng với đúng thợ, đúng nhu cầu, mang đến dịch vụ sửa chữa nhanh chóng, an toàn và minh bạch.
            </p>
            
            <div class="flex flex-col sm:flex-row items-center gap-4 mb-12">
              <button class="group flex items-center justify-center gap-3 bg-blue-400 hover:bg-blue-500 text-white w-full sm:w-auto rounded-full px-8 h-14 font-bold text-lg transition-all shadow-[0_8px_30px_rgb(251,191,36,0.3)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.5)] hover:-translate-y-1">
                <Download :size="16" class="text-white fill-current" />
                Vào website
              </button>
              <button class="group flex items-center justify-center gap-3 bg-blue-400 hover:bg-blue-500 text-white w-full sm:w-auto rounded-full px-8 h-14 font-bold text-lg transition-all shadow-[0_8px_30px_rgb(251,191,36,0.3)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.5)] hover:-translate-y-1">
                <Download :size="16" class="text-white fill-current" />
                Tải ngay
              </button>
            </div>
          </div>
          
          <!-- Right Image / Mockup -->
          <div class="lg:col-span-5 relative hidden md:block">
            <!-- Decorative blur background -->
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-400 rounded-full blur-[100px] opacity-20 -z-10"></div>
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-amber-400 rounded-full blur-[80px] opacity-20 -z-10 translate-x-10 translate-y-10"></div>
            <img src="/UI%20mobile.png" alt="App UI" class="w-[320px] h-[650px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-cover z-20" />
          </div>
        </div>
      </section>

      <!-- Section 2: Intro -->
      <section id="intro" class="min-h-screen py-24 flex flex-col justify-center border-t border-slate-200/60 relative">
        <div class="absolute top-1/4 left-0 w-64 h-64 bg-blue-100 rounded-full blur-[80px] opacity-50 pointer-events-none -z-10"></div>
        <div class="absolute bottom-0 right-0 w-80 h-80 bg-brand-100 rounded-full blur-[100px] opacity-40 pointer-events-none -z-10"></div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center relative z-10">
          <!-- Left: Visuals / Stats -->
          <div class="order-2 lg:order-1 relative">
            
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 flex flex-col justify-center items-center text-center hover:-translate-y-1 transition-transform">
                <div class="text-3xl font-extrabold text-brand-600 mb-1">10K+</div>
                <div class="text-sm font-medium text-slate-500">Thợ uy tín</div>
              </div>
              <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 flex flex-col justify-center items-center text-center hover:-translate-y-1 transition-transform">
                <div class="text-3xl font-extrabold text-blue-600 mb-1">15 Phút</div>
                <div class="text-sm font-medium text-slate-500">Có mặt ngay</div>
              </div>
              <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 flex flex-col justify-center items-center text-center hover:-translate-y-1 transition-transform">
                <div class="text-3xl font-extrabold text-emerald-500 mb-1">99%</div>
                <div class="text-sm font-medium text-slate-500">Khách hài lòng</div>
              </div>
              <div class="bg-brand-600 p-6 rounded-3xl shadow-lg shadow-brand-500/30 flex flex-col justify-center items-center text-center hover:-translate-y-1 transition-transform">
                <div class="text-3xl font-extrabold text-white mb-1">24/7</div>
                <div class="text-sm font-medium text-brand-100">Hỗ trợ AI</div>
              </div>
            </div>
          </div>
          
          <!-- Right: Text Content -->
          <div class="order-1 lg:order-2">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-50 border border-slate-200 shadow-sm mb-6">
              <span class="text-sm font-bold tracking-widest uppercase text-brand-600">Về chúng tôi</span>
            </div>
            <h2 class="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
              Kết Nối Đúng Thợ – <br/>
              Đúng Nhu Cầu Với <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-blue-800">Công Nghệ AI</span>
            </h2>
            <p class="text-lg text-slate-600 font-medium leading-relaxed mb-6">
              <strong class="text-slate-900">FixHome</strong> là nền tảng kết nối khách hàng với đội ngũ kỹ thuật viên sửa chữa nhà ở đã được xác minh, mang đến trải nghiệm tìm thợ và sử dụng dịch vụ nhanh chóng, an toàn và minh bạch.
            </p>
            <p class="text-lg text-slate-600 font-medium leading-relaxed">
              Với sự hỗ trợ của công nghệ AI, FixHome giúp khách hàng mô tả vấn đề, cung cấp hình ảnh và nhận được đánh giá ban đầu để lựa chọn những kỹ thuật viên phù hợp nhất với nhu cầu.
            </p>
          </div>
        </div>

        <!-- Service Marquee -->
        <div class="mt-24 relative z-10 w-full overflow-hidden">
          <p class="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Các dịch vụ nổi bật</p>
          <Marquee :pauseOnHover="true" :fade="true" :duration="40" class="py-2">
            <!-- Service 1 -->
            <div class="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm mx-3 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
              <div class="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                <Wind :size="20" />
              </div>
              <span class="font-bold text-slate-700 whitespace-nowrap">Sửa máy lạnh</span>
            </div>
            <!-- Service 2 -->
            <div class="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm mx-3 hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer">
              <div class="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center">
                <Droplets :size="20" />
              </div>
              <span class="font-bold text-slate-700 whitespace-nowrap">Sửa máy giặt</span>
            </div>
            <!-- Service 3 -->
            <div class="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm mx-3 hover:shadow-md hover:border-cyan-200 transition-all cursor-pointer">
              <div class="w-10 h-10 bg-cyan-50 text-cyan-500 rounded-xl flex items-center justify-center">
                <Thermometer :size="20" />
              </div>
              <span class="font-bold text-slate-700 whitespace-nowrap">Sửa tủ lạnh</span>
            </div>
            <!-- Service 4 -->
            <div class="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm mx-3 hover:shadow-md hover:border-amber-200 transition-all cursor-pointer">
              <div class="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
                <ZapIcon :size="20" />
              </div>
              <span class="font-bold text-slate-700 whitespace-nowrap">Sửa điện nước</span>
            </div>
            <!-- Service 5 -->
            <div class="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm mx-3 hover:shadow-md hover:border-orange-200 transition-all cursor-pointer">
              <div class="w-10 h-10 bg-orange-50 text-orange-500 rounded-xl flex items-center justify-center">
                <Flame :size="20" />
              </div>
              <span class="font-bold text-slate-700 whitespace-nowrap">Sửa bếp từ, hồng ngoại</span>
            </div>
            <!-- Service 6 -->
            <div class="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm mx-3 hover:shadow-md hover:border-purple-200 transition-all cursor-pointer">
              <div class="w-10 h-10 bg-purple-50 text-purple-500 rounded-xl flex items-center justify-center">
                <Wrench :size="20" />
              </div>
              <span class="font-bold text-slate-700 whitespace-nowrap">Thông tắc bồn cầu</span>
            </div>
          </Marquee>
        </div>
      </section>

      <!-- Section 3: Steps -->
      <section id="steps" class="min-h-screen py-24 flex flex-col justify-center border-t border-slate-200/60">
        <div class="mb-16 text-center lg:text-left">
          <div class="text-sm font-bold text-brand-600 tracking-widest uppercase mb-3">Trải nghiệm dịch vụ</div>
          <h2 class="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">4 Bước đơn giản để <br class="hidden lg:block"/>giải quyết sự cố</h2>
        </div>

        <div class="relative mt-8">
          <!-- Horizontal connector for desktop -->
          <div class="hidden lg:block absolute top-[40px] left-0 w-full h-[2px] bg-slate-200 z-0">
             <div class="h-full bg-brand-500 w-[75%]"></div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 relative z-10">
            <div v-for="(step, idx) in steps" :key="step.num" class="relative group bg-white lg:bg-transparent p-6 lg:p-0 rounded-2xl shadow-sm lg:shadow-none border border-slate-100 lg:border-none">
              
              <div class="w-20 h-20 rounded-full bg-white border-[4px] border-slate-100 shadow-lg flex items-center justify-center text-2xl font-extrabold text-brand-600 mb-6 lg:mx-auto lg:mb-8 group-hover:border-brand-500 group-hover:scale-110 transition-all duration-300" :class="{ 'border-brand-500': idx <= 2 }">
                {{ step.num }}
              </div>

              <div class="lg:text-center">
                <h3 class="text-lg font-bold text-slate-900 mb-2 group-hover:text-brand-600 transition-colors">{{ step.title }}</h3>
                <p class="text-sm text-slate-500 font-medium leading-relaxed">{{ step.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 4: AI -->
      <section id="ai" class="min-h-screen py-24 flex flex-col justify-center border-t border-slate-200/60">
        <div class="bg-[#0a192f] rounded-[3rem] p-8 md:p-12 lg:p-20 text-white overflow-hidden relative shadow-2xl">
          <!-- AI Background Effects -->
          <div class="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
          <div class="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center relative z-10">
            <div class="lg:col-span-6">
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-8 backdrop-blur-md">
                <Sparkles :size="16" class="text-amber-400" />
                <span class="text-sm font-bold tracking-wider uppercase text-brand-100">Công nghệ đột phá</span>
              </div>
              
              <h2 class="text-3xl md:text-4xl font-extrabold tracking-tight leading-[1.1] mb-6">
                AIDiagnosis & <br/>AI Chatbot trợ lý
              </h2>
              
              <p class="text-base text-slate-300 font-medium mb-10 leading-relaxed">
                Không biết gọi thợ gì? Đừng lo. Chỉ cần chụp ảnh sự cố hoặc chat với trợ lý ảo, AI của chúng tôi sẽ tự động phân tích, chẩn đoán bệnh và gợi ý thợ phù hợp nhất kèm dự toán chi phí.
              </p>

              <div class="space-y-6">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-2xl bg-brand-500/20 flex items-center justify-center shrink-0 border border-brand-400/30">
                    <Smartphone :size="24" class="text-brand-400" />
                  </div>
                  <div>
                    <h4 class="text-base font-bold mb-1">Chụp ảnh chẩn đoán</h4>
                    <p class="text-slate-400 text-sm">Nhận diện thiết bị và tình trạng hỏng hóc qua hình ảnh với độ chính xác 95%.</p>
                  </div>
                </div>
                
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center shrink-0 border border-purple-400/30">
                    <MessageSquare :size="24" class="text-purple-400" />
                  </div>
                  <div>
                    <h4 class="text-base font-bold mb-1">Trợ lý ảo thông minh 24/7</h4>
                    <p class="text-slate-400 text-sm">Tư vấn cách xử lý sơ bộ để đảm bảo an toàn trước khi thợ đến.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI Chat UI Mockup -->
            <div class="lg:col-span-6 relative">
              <!-- Decorative ring -->
              <div class="absolute inset-0 bg-gradient-to-tr from-brand-500/20 to-purple-500/20 rounded-[2.5rem] rotate-3 blur-sm"></div>
              
              <div class="bg-[#112240] border border-white/10 rounded-3xl p-6 shadow-2xl relative z-10 backdrop-blur-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                  <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                      <Bot :size="20" class="text-white" />
                    </div>
                    <div>
                      <div class="font-bold text-white">FixHome AI</div>
                      <div class="text-xs text-brand-400 flex items-center gap-1 font-medium">
                        <div class="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></div> Đang trực tuyến
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-1.5">
                    <div class="w-3 h-3 rounded-full bg-slate-600"></div>
                    <div class="w-3 h-3 rounded-full bg-slate-600"></div>
                    <div class="w-3 h-3 rounded-full bg-slate-600"></div>
                  </div>
                </div>
                
                <div class="space-y-5 mb-6">
                  <div class="flex gap-3 justify-end">
                    <div class="bg-brand-600 text-white rounded-2xl rounded-tr-sm p-3.5 text-sm max-w-[85%] shadow-md">
                      Máy giặt nhà mình bị kêu to lúc vắt, rung lắc mạnh lắm.
                    </div>
                  </div>
                  
                  <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-brand-600/50 flex items-center justify-center shrink-0 mt-1">
                      <Bot :size="14" class="text-white" />
                    </div>
                    <div class="bg-white/5 border border-white/10 text-slate-300 rounded-2xl rounded-tl-sm p-4 text-sm max-w-[85%] shadow-md">
                      <p class="mb-3">Dựa vào mô tả, có thể máy giặt của bạn gặp vấn đề về:</p>
                      <ul class="list-disc pl-4 space-y-1.5 mb-4 text-white font-medium">
                        <li>Hỏng phuộc nhún (lò xo giảm xóc)</li>
                        <li>Lỏng ốc chảng ba hoặc mòn bạc đạn</li>
                      </ul>
                      <div class="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 flex flex-col gap-3">
                        <div class="flex items-center gap-2">
                           <Wrench :size="16" class="text-brand-400" />
                           <span class="font-bold text-white text-xs">Thợ sửa điện lạnh</span>
                        </div>
                        <div class="flex items-center justify-between">
                          <div class="text-[11px] text-brand-300">Giá tham khảo: 150k - 350k</div>
                          <button class="bg-brand-500 hover:bg-brand-600 text-white text-[11px] font-bold px-4 py-1.5 rounded-full transition-colors">Đặt thợ ngay</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="relative mt-2">
                  <input type="text" placeholder="Hỏi trợ lý AI..." class="w-full bg-white/5 border border-white/10 rounded-full py-3.5 px-5 text-sm focus:outline-none focus:border-brand-500 focus:bg-white/10 text-white placeholder:text-slate-500 transition-all cursor-not-allowed" disabled />
                  <button class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center hover:bg-brand-600 transition-colors shadow-lg cursor-not-allowed">
                    <ArrowRight :size="16" class="text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 5: Commitment & CTA -->
      <section id="commitment" class="min-h-screen py-24 flex flex-col justify-center border-t border-slate-200/60 relative">
        <!-- Background gradient for the whole section -->
        <div class="absolute inset-0 bg-gradient-to-b from-transparent to-brand-50/20 -z-10 rounded-t-[4rem]"></div>
        
        <div class="flex flex-col items-center text-center relative z-10 mb-16 px-4">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-100 mb-6">
            <span class="text-sm font-bold tracking-widest uppercase text-brand-700">Cam kết dịch vụ</span>
          </div>
          
          <h2 class="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6 leading-[1.15]">
            Trải nghiệm dịch vụ <span class="text-brand-600">an tâm nhất</span>
          </h2>
          
          <p class="text-lg text-slate-600 font-medium mb-10 leading-relaxed max-w-2xl">
            Hàng ngàn thợ chuyên nghiệp đang chờ đón bạn. Tải ứng dụng ngay để việc sửa chữa nhà cửa không còn là nỗi lo.
          </p>
          
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <FhButton variant="primary" size="lg" class="rounded-full px-8 h-14 w-full sm:w-auto shadow-md shadow-brand-500/20 text-base font-bold hover:-translate-y-1 transition-all" @click="router.push('/register')">
              Tải ứng dụng miễn phí
            </FhButton>
            <FhButton variant="secondary" size="lg" class="rounded-full px-8 h-14 bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 w-full sm:w-auto text-slate-700 text-base font-bold hover:-translate-y-1 transition-all" @click="router.push('/pricing-policy')">
              Xem bảng giá chi tiết
            </FhButton>
          </div>
        </div>

        <div class="w-full overflow-hidden relative z-10">
          <Marquee :pauseOnHover="true" :fade="true" class="py-4">
            <div class="w-[320px] bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 transition-all duration-300 group mx-4">
              <div class="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-5 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Zap :size="24" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Chi tiết đầy đủ</h3>
              <p class="text-slate-500 text-sm font-medium leading-relaxed">Thông tin thợ, quy trình làm việc và chi phí hiển thị rõ ràng trước khi xác nhận.</p>
            </div>
            
            <div class="w-[320px] bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300 group mx-4">
              <div class="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-5 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <ShieldCheck :size="24" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Thợ uy tín</h3>
              <p class="text-slate-500 text-sm font-medium leading-relaxed">100% thợ được xác minh danh tính, kiểm tra tay nghề và đánh giá liên tục.</p>
            </div>

            <div class="w-[320px] bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:border-amber-200 hover:-translate-y-1 transition-all duration-300 group mx-4">
              <div class="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-5 text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <CheckCircle2 :size="24" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Minh bạch</h3>
              <p class="text-slate-500 text-sm font-medium leading-relaxed">Báo giá công khai trước khi làm. Tách biệt rõ ràng tiền công và vật tư.</p>
            </div>

            <div class="w-[320px] bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:border-purple-200 hover:-translate-y-1 transition-all duration-300 group mx-4">
              <div class="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-5 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Wrench :size="24" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Bảo hành dài hạn</h3>
              <p class="text-slate-500 text-sm font-medium leading-relaxed">An tâm tuyệt đối với chính sách bảo hành điện tử lên đến 90 ngày.</p>
            </div>
          </Marquee>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
html {
  scroll-behavior: smooth;
}
.font-num {
  font-variant-numeric: tabular-nums;
}
.animate-bounce-slow {
  animation: bounce 3s infinite;
}
@keyframes bounce {
  0%, 100% {
    transform: translateY(-5%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}
</style>
