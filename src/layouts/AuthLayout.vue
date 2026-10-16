<script setup lang="ts">
import { ShieldCheck, Star } from 'lucide-vue-next';
import technicianImage from '../assets/auth-technician.png';
</script>

<template>
  <div class="min-h-screen lg:h-screen lg:overflow-hidden flex bg-slate-50 font-sans">
    <!-- Left Column (Visual/Brand) -->
    <section class="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-slate-100" aria-label="Giới thiệu FixHome">
      <img
        :src="technicianImage"
        alt="Kỹ thuật viên FixHome đang làm việc tại nhà khách hàng"
        class="absolute inset-0 h-full w-full object-cover object-[58%_center]"
      />
      <div class="absolute inset-0 bg-white/5"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-white/95 via-white/30 to-transparent"></div>
      <div class="absolute inset-0 bg-gradient-to-r from-white/35 via-transparent to-transparent"></div>
      
      <!-- Content -->
      <div class="relative z-10 w-full h-full p-10 xl:p-14 2xl:p-16 flex flex-col">
        <!-- Logo -->
        <router-link to="/" class="inline-flex items-center gap-3 self-start group rounded-2xl bg-white/95 p-2 pr-4 shadow-lg shadow-slate-950/10 backdrop-blur-sm">
            <div class="bg-white p-1 rounded-xl">
              <img :src="'/logo.png'" alt="FixHome" class="w-8 h-8 object-contain rounded-lg" />
            </div>
            <span class="text-2xl font-black tracking-tight text-slate-900">Fix<span class="text-green-600">Home</span></span>
        </router-link>

        <!-- Message -->
        <div class="mt-auto max-w-xl space-y-4 xl:space-y-5">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/75 border border-white/80 shadow-sm backdrop-blur-md">
            <Star :size="14" class="text-amber-500 fill-amber-500" />
            <span class="text-xs font-bold text-slate-700 tracking-wide uppercase">Dịch vụ tận tâm, đúng chuẩn</span>
          </div>

          <h1 class="max-w-lg text-4xl xl:text-5xl 2xl:text-[3.5rem] font-black tracking-tight leading-[1.08] text-slate-900">
            An tâm sửa chữa,<br />vững lòng tổ ấm.
          </h1>
          <p class="text-slate-700 text-base xl:text-lg max-w-lg font-medium leading-relaxed">
            Kết nối cùng kỹ thuật viên đã xác thực, báo giá minh bạch và bảo hành rõ ràng cho mọi dịch vụ tại nhà.
          </p>

          <!-- Trust Badges -->
          <div class="flex flex-wrap items-center gap-x-7 gap-y-3 pt-3 text-sm font-semibold text-slate-700">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-emerald-50/90 border border-emerald-200 flex items-center justify-center backdrop-blur-sm">
                <ShieldCheck :size="17" class="text-emerald-600" />
              </div>
              <span>Bảo hành điện tử</span>
            </div>
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-blue-50/90 border border-blue-200 flex items-center justify-center backdrop-blur-sm">
                <ShieldCheck :size="17" class="text-blue-600" />
              </div>
              <span>Thợ đã xác thực</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Right Column (Form) -->
    <main class="w-full lg:w-1/2 flex flex-col bg-white lg:h-screen lg:overflow-hidden">
      <div class="flex-1 min-h-0 flex flex-col px-6 sm:px-12 xl:px-20 2xl:px-24 py-6 lg:py-7 2xl:py-9 relative">

        <!-- Mobile Logo -->
        <div class="lg:hidden flex justify-center mb-8">
          <router-link to="/" class="inline-flex items-center gap-2 group">
            <div class="bg-slate-50 p-2 rounded-2xl shadow-sm group-hover:scale-105 transition-transform">
              <img :src="'/logo.png'" alt="FixHome" class="w-8 h-8 object-contain rounded-lg" />
            </div>
            <span class="text-2xl font-black tracking-tight text-slate-900">Fix<span class="text-green-600">Home</span></span>
          </router-link>
        </div>

        <!-- Auth Toggle -->
        <div class="flex justify-center lg:justify-end mb-5 2xl:mb-7 shrink-0">
          <div class="inline-flex bg-slate-100/80 backdrop-blur-md rounded-full p-1.5 w-full sm:w-auto border border-slate-200/50 gap-1">
            <router-link 
              to="/login"
              class="flex-1 sm:w-32 py-2.5 px-4 text-center text-sm font-bold rounded-full transition-all duration-200"
              :class="$route.path === '/login' ? 'bg-white text-slate-900 shadow-sm shadow-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'"
            >
              Đăng nhập
            </router-link>
            <router-link 
              to="/register"
              class="flex-1 sm:w-32 py-2.5 px-4 text-center text-sm font-bold rounded-full transition-all duration-200"
              :class="$route.path === '/register' ? 'bg-white text-slate-900 shadow-sm shadow-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'"
            >
              Đăng ký
            </router-link>
          </div>
        </div>

        <!-- Dynamic Form -->
        <div class="w-full max-w-[400px] mx-auto flex-1 min-h-0 flex flex-col justify-center">
          <router-view v-slot="{ Component }">
            <Transition name="fade" mode="out-in">
              <component :is="Component" />
            </Transition>
          </router-view>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
