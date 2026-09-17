<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import {
  Sparkles,
  MapPin,
  FileSpreadsheet,
  ShieldCheck,
  ArrowRight,
} from 'lucide-vue-next';
import { FhButton } from '../../components';

const router = useRouter();

useSmoothScroll();

const steps = [
  {
    step: 'Bước 1',
    title: 'Gửi yêu cầu & AI chẩn đoán sơ bộ',
    desc: 'Chọn loại thiết bị hư hỏng, mô tả hiện tượng và tải lên ảnh hoặc video chụp trực tiếp. Mô hình AI của FixHome sẽ đối chiếu kho dữ liệu kỹ thuật để ước lượng mã linh kiện có thể hư và dự toán khung giá tham khảo.',
    icon: Sparkles,
  },
  {
    step: 'Bước 2',
    title: 'Ghép thợ gần nhất & Check-in GPS',
    desc: 'Hệ thống tự động lọc danh sách tối đa 5 thợ có kỹ năng tương ứng trong bán kính hoạt động. Khi đến nhà bạn, thợ bắt buộc phải thực hiện Check-in GPS qua ứng dụng trong vòng bán kính 300 mét (geofence).',
    icon: MapPin,
  },
  {
    step: 'Bước 3',
    title: 'Khảo sát hiện trường & Báo giá minh bạch',
    desc: 'Thợ chụp ảnh hiện trạng (BEFORE evidence) và tạo bảng báo giá chi tiết trên hệ thống, tách riêng từng đồng tiền công và tiền thiết bị/linh kiện thay thế. Bạn kiểm tra và bấm xác nhận trên điện thoại thì thợ mới được phép bắt tay vào sửa chữa.',
    icon: FileSpreadsheet,
  },
  {
    step: 'Bước 4',
    title: 'Nghiệm thu & Nhận bảo hành điện tử',
    desc: 'Sau khi sửa xong, thợ chụp ảnh hoàn thành (AFTER evidence) và kiểm tra vận hành trước sự chứng kiến của bạn. Hệ thống xuất hoá đơn điện tử có hiệu lực pháp lý và kích hoạt tem bảo hành điện tử từ 30 đến 90 ngày.',
    icon: ShieldCheck,
  },
];
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-24 space-y-20">
    <!-- Header -->
    <div class="text-center space-y-6">
      <div class="text-xs font-bold text-brand-600 tracking-widest uppercase">Quy chuẩn dịch vụ</div>
      <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
        Cách thức hoạt động <br class="hidden sm:block"/>tại FixHome
      </h1>
      <p class="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed font-medium">
        Chúng tôi xây dựng quy trình sửa chữa khép kín, minh bạch và có bằng chứng xác thực ở từng bước để loại bỏ hoàn toàn tình trạng chặt chém.
      </p>
    </div>

    <!-- 4 Steps Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
      <div
        v-for="(s, idx) in steps"
        :key="s.step"
        class="bg-white rounded-4xl border border-slate-200 p-8 shadow-xl shadow-slate-200/40 relative flex flex-col items-start hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
      >
        <div class="w-16 h-16 rounded-full bg-slate-50 text-brand-600 flex items-center justify-center mb-8 border border-slate-100">
          <component :is="s.icon" :size="28" :stroke-width="2" />
        </div>

        <div class="space-y-4 flex-1">
          <div class="text-[11px] font-bold uppercase tracking-widest text-slate-400 font-num">Bước 0{{ idx + 1 }}</div>
          <h3 class="text-xl font-bold text-slate-900 leading-snug">
            {{ s.title }}
          </h3>
          <p class="text-sm text-slate-500 leading-relaxed font-medium">
            {{ s.desc }}
          </p>
        </div>
      </div>
    </div>

    <!-- Call to action -->
    <div class="text-center space-y-8 pt-10">
      <h3 class="text-3xl font-bold text-slate-900 tracking-tight">Bạn đã sẵn sàng trải nghiệm dịch vụ?</h3>
      <div class="flex justify-center gap-4">
        <FhButton variant="primary" size="lg" class="rounded-full shadow-lg shadow-brand-500/25 h-14 px-10 text-base" @click="router.push('/register')">
          Tạo yêu cầu sửa chữa
          <ArrowRight :size="18" class="ml-2" />
        </FhButton>
      </div>
    </div>
  </div>
</template>
