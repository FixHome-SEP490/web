<script setup lang="ts">
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import {
  ShieldCheck,
  DollarSign,
  Calendar,
  Award,
  ArrowRight,
} from 'lucide-vue-next';

useSmoothScroll();
</script>


<template>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-24 space-y-20">
    <div class="text-center space-y-6">
      <div class="text-xs font-bold text-brand-600 tracking-widest uppercase">Cộng đồng thợ lành nghề</div>
      <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
        Hợp tác cùng <br class="hidden sm:block"/>nền tảng FixHome
      </h1>
      <p class="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed font-medium">
        Nhận đơn hàng liên tục trong khu vực hoạt động của bạn, minh bạch thu nhập và được bảo vệ quyền lợi khi làm việc.
      </p>
    </div>

    <!-- Benefits Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
      <div class="bg-white border border-slate-200 rounded-4xl p-8 shadow-xl shadow-slate-200/40 space-y-6 hover:-translate-y-1 transition-transform duration-300">
        <div class="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <DollarSign :size="24" />
        </div>
        <h3 class="text-2xl font-bold text-slate-900">Thu nhập xứng đáng</h3>
        <p class="text-base text-slate-500 leading-relaxed font-medium">
          Tỷ lệ hoa hồng hợp lý, nhận tiền công đầy đủ ngay sau khi khách hàng xác nhận hoàn tất đơn hàng.
        </p>
      </div>

      <div class="bg-white border border-slate-200 rounded-4xl p-8 shadow-xl shadow-slate-200/40 space-y-6 hover:-translate-y-1 transition-transform duration-300">
        <div class="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
          <Calendar :size="24" />
        </div>
        <h3 class="text-2xl font-bold text-slate-900">Chủ động thời gian</h3>
        <p class="text-base text-slate-500 leading-relaxed font-medium">
          Tự do bật/tắt chế độ "Đang nhận việc", cài đặt lịch làm việc theo ngày trong tuần và đăng ký nghỉ phép linh hoạt.
        </p>
      </div>

      <div class="bg-white border border-slate-200 rounded-4xl p-8 shadow-xl shadow-slate-200/40 space-y-6 hover:-translate-y-1 transition-transform duration-300">
        <div class="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
          <Award :size="24" />
        </div>
        <h3 class="text-2xl font-bold text-slate-900">Đánh giá công bằng</h3>
        <p class="text-base text-slate-500 leading-relaxed font-medium">
          Điểm số uy tín và xếp hạng sao chỉ dựa trên đánh giá từ khách hàng thật của đơn hàng đã hoàn tất (D-09).
        </p>
      </div>
    </div>

    <!-- Verification Info per P4.3 -->
    <div class="p-10 sm:p-16 bg-[#0a192f] text-white rounded-[2.5rem] space-y-8 shadow-2xl">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 border border-brand-500/30">
           <ShieldCheck :size="32" stroke-width="2" />
        </div>
        <h3 class="text-2xl sm:text-3xl font-bold tracking-tight">Quy trình gia nhập (P4.3)</h3>
      </div>
      <p class="text-lg text-slate-300 leading-relaxed max-w-4xl">
        Để đảm bảo an toàn cho các hộ gia đình, kỹ thuật viên đăng ký tài khoản, hoàn tất hồ sơ, giấy tờ tùy thân
        và kỹ năng nhận sửa. Quản trị viên FixHome duyệt hồ sơ trước khi bạn được bật nhận việc.
      </p>

      <div class="pt-8 mt-8 border-t border-slate-700/50">
        <router-link
          to="/register"
          class="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-brand-600 hover:bg-brand-500 text-white font-semibold whitespace-nowrap transition-colors"
        >
          Đăng ký tài khoản kỹ thuật viên
          <ArrowRight :size="18" />
        </router-link>
      </div>
    </div>
  </div>
</template>
