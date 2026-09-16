<script setup lang="ts">
import { ShieldCheck, Wrench } from 'lucide-vue-next';
</script>


<template>
  <div class="min-h-screen flex items-center justify-center bg-brand-500 p-4 sm:p-8">
    <div class="w-full max-w-6xl bg-white border border-slate-100 rounded-4xl sm:rounded-[2.5rem] flex flex-col lg:flex-row overflow-hidden shadow-2xl shadow-slate-200/50 min-h-150">
      
      <!-- Left Column (Light Side) -->
      <div class="hidden lg:flex w-1/2 relative bg-slate-50 text-slate-900 p-12 xl:p-14 flex-col justify-between border-r border-slate-100">
        <!-- Faint Grid Background -->
        <div 
          class="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style="background-image: linear-gradient(rgba(0, 0, 0, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 1) 1px, transparent 1px); background-size: 40px 40px;"
        ></div>

        <!-- Top: Logo & Label -->
        <div class="relative z-10 flex items-center justify-between">
          <router-link to="/" class="inline-flex items-center gap-3">
            <div class="w-9 h-9 rounded-sm bg-brand-500 flex items-center justify-center text-white shadow-md">
              <Wrench :size="20" :stroke-width="2.5" />
            </div>
            <div>
              <span class="text-xl font-bold tracking-tight text-slate-900">Fix<span class="text-brand-500">Home</span></span>
              <span class="block text-[10px] font-medium text-slate-500 uppercase tracking-widest leading-none mt-0.5">Dịch vụ sửa nhà</span>
            </div>
          </router-link>
          <div class="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">
            Kỹ thuật gia đình
          </div>
        </div>

        <!-- Middle: Headline -->
        <div class="relative z-10 space-y-6 mt-16">
          <div class="text-xs uppercase tracking-[0.15em] font-bold text-brand-600">
            Dịch vụ kỹ thuật tại nhà
          </div>
          <h1 class="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.15] text-slate-900">
            Mọi thiết bị,<br/>được xử lý đúng<br/>chuẩn kỹ thuật.
          </h1>
          <p class="text-slate-600 text-sm xl:text-base leading-relaxed max-w-[90%] font-medium">
            Đội thợ được đào tạo bài bản, báo giá minh bạch và bảo hành rõ ràng cho từng hạng mục.
          </p>
        </div>

        <!-- Bottom: Stats & Footer -->
        <div class="relative z-10 mt-16 space-y-12">
          <!-- Stats Grid -->
          <div class="grid grid-cols-3 gap-6">
            <div>
              <div class="font-bold text-2xl xl:text-3xl text-brand-600 mb-1">12.400+</div>
              <div class="text-xs text-slate-500 font-medium">Hạng mục hoàn thành</div>
            </div>
            <div>
              <div class="font-bold text-2xl xl:text-3xl text-brand-600 mb-1">4.9/5</div>
              <div class="text-xs text-slate-500 font-medium">Điểm đánh giá</div>
            </div>
            <div>
              <div class="font-bold text-2xl xl:text-3xl text-brand-600 mb-1">45p</div>
              <div class="text-xs text-slate-500 font-medium">Thời gian phản hồi</div>
            </div>
          </div>

          <!-- Footer Note -->
          <div class="flex items-center gap-3 text-xs text-slate-500 font-bold">
            <ShieldCheck :size="16" class="text-brand-600" />
            <span>Đang trực 24/7 - Bảo hành 12 tháng</span>
          </div>
        </div>
      </div>

      <!-- Right Column (Form Side) -->
      <div class="w-full lg:w-1/2 bg-white p-6 sm:p-12 xl:p-16 flex flex-col">
        <!-- Top Auth Toggle -->
        <div class="flex justify-center lg:justify-end mb-12">
          <div class="inline-flex bg-slate-100 rounded-full p-1 w-full lg:w-auto">
            <router-link 
              to="/login"
              class="flex-1 lg:w-32 py-2.5 px-4 text-center text-sm font-bold rounded-lg transition-colors"
              :class="$route.path === '/login' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'"
            >
              Đăng nhập
            </router-link>
            <router-link 
              to="/register"
              class="flex-1 lg:w-32 py-2.5 px-4 text-center text-sm font-bold rounded-lg transition-colors"
              :class="$route.path === '/register' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'"
            >
              Đăng ký
            </router-link>
          </div>
        </div>

        <!-- Dynamic Form Slot -->
        <div class="flex-1 flex flex-col justify-center max-w-105 w-full mx-auto">
          <router-view />
        </div>
      </div>
    </div>
  </div>
</template>
