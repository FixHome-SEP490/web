<script setup lang="ts">
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-vue-next';

useSmoothScroll();
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-24 space-y-20">
    <!-- Header -->
    <div class="text-center space-y-6">
      <div class="text-xs font-bold text-brand-600 tracking-widest uppercase">Quyết định nghiệp vụ D-02</div>
      <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
        Chính sách giá & <br class="hidden sm:block"/>Tách bạch chi phí
      </h1>
      <p class="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed font-medium">
        FixHome là nền tảng đầu tiên tại Việt Nam áp dụng nguyên tắc bắt buộc tách riêng Tiền công và Tiền vật tư trên toàn bộ chu trình dịch vụ.
      </p>
    </div>

    <!-- Rule Highlight Card -->
    <div class="p-8 sm:p-10 bg-brand-50 rounded-[2.5rem] border border-brand-100 flex flex-col sm:flex-row gap-8 items-start">
      <div class="w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/30">
        <ShieldCheck :size="32" stroke-width="2" />
      </div>
      <div class="space-y-4 text-brand-950">
        <h3 class="text-2xl font-bold text-brand-900">Cam kết 3 Không về Giá cả:</h3>
        <ul class="space-y-3 font-medium text-brand-900/80 leading-relaxed text-base">
          <li class="flex gap-3 items-start"><span class="mt-1 text-brand-600 font-bold">•</span> <span><strong>Không gộp giá:</strong> Tuyệt đối không cho phép báo giá "trọn gói mập mờ" không tách rõ linh kiện.</span></li>
          <li class="flex gap-3 items-start"><span class="mt-1 text-brand-600 font-bold">•</span> <span><strong>Không tự ý phát sinh:</strong> Chi phí phát sinh trong lúc sửa bắt buộc phải lập phiếu yêu cầu và khách hàng bấm xác nhận trên app mới được tính tiền.</span></li>
          <li class="flex gap-3 items-start"><span class="mt-1 text-brand-600 font-bold">•</span> <span><strong>Không ép giá:</strong> Mọi dịch vụ đều có khung giá tham khảo được công khai trong danh mục.</span></li>
        </ul>
      </div>
    </div>

    <!-- Cost Breakdown Interactive Component Demo -->
    <div class="space-y-12">
      <div class="text-center space-y-4 max-w-2xl mx-auto">
        <h2 class="text-3xl font-bold text-slate-900 tracking-tight">Cách thể hiện báo giá trên hệ thống</h2>
        <p class="text-lg text-slate-500 font-medium">
          Dưới đây là bảng báo giá mẫu chuẩn mực hiển thị trên điện thoại của khách hàng trước khi bấm đồng ý:
        </p>
      </div>

      <div class="max-w-3xl mx-auto bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50">
        <div class="p-8 md:p-10 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 gap-4">
          <div>
            <div class="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-2">Hoá đơn mẫu (Chờ bạn duyệt)</div>
            <div class="font-bold text-lg text-slate-900">Thay tụ & nạp gas máy lạnh 1.5 HP</div>
          </div>
          <div class="text-xs text-slate-400 sm:text-right">
            Mã đơn<br/><span class="font-bold text-slate-900 text-sm">FH-8821</span>
          </div>
        </div>
        
        <div class="p-8 md:p-10 space-y-6 text-base font-medium">
          <div class="flex justify-between items-center">
            <span class="text-slate-500">Tiền công thợ (Kiểm tra & thay tụ)</span>
            <span class="font-bold text-slate-900 font-num">200.000 ₫</span>
          </div>
          <div class="w-full h-px border-t border-dashed border-slate-200"></div>
          <div class="flex justify-between items-center">
            <span class="text-slate-500">Vật tư & Linh kiện (Tụ kích 45uF chính hãng)</span>
            <span class="font-bold text-slate-900 font-num">350.000 ₫</span>
          </div>
        </div>
        
        <div class="bg-slate-50 p-8 md:p-10 flex flex-col sm:flex-row justify-between items-start sm:items-center border-t border-slate-100 gap-4">
          <div>
            <div class="text-[11px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Tổng cộng</div>
            <div class="text-sm text-brand-600 font-semibold flex items-center gap-1.5">
              <ShieldCheck :size="16" /> Bảo hành 90 ngày
            </div>
          </div>
          <span class="text-3xl md:text-4xl font-extrabold text-slate-900 font-num tracking-tight">550.000 ₫</span>
        </div>
      </div>
    </div>

    <!-- Additional Cost Sub-workflow -->
    <div class="space-y-12 pt-16 border-t border-slate-100">
      <h2 class="text-3xl font-bold text-slate-900 tracking-tight text-center">Quy định về chi phí phát sinh</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div class="p-8 md:p-10 rounded-[2.5rem] bg-white border border-slate-200 shadow-xl shadow-slate-200/40 space-y-6">
          <div class="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-6">
             <CheckCircle2 :size="28" />
          </div>
          <h4 class="text-2xl font-bold text-slate-900">
            Khi nào được phát sinh?
          </h4>
          <p class="text-base text-slate-500 leading-relaxed font-medium">
            Chỉ khi trong quá trình tháo lắp thực tế (trạng thái UNDER_REPAIR), thợ phát hiện thêm lỗi ẩn mà mắt thường không thấy lúc khảo sát ban đầu. Thợ phải chụp ảnh bằng chứng linh kiện hỏng.
          </p>
        </div>

        <div class="p-8 md:p-10 rounded-[2.5rem] bg-white border border-slate-200 shadow-xl shadow-slate-200/40 space-y-6">
          <div class="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mb-6">
             <AlertCircle :size="28" />
          </div>
          <h4 class="text-2xl font-bold text-slate-900">
            Nếu khách hàng từ chối?
          </h4>
          <p class="text-base text-slate-500 leading-relaxed font-medium">
            Khách hàng có quyền từ chối (Reject) chi phí phát sinh bất kỳ lúc nào. Thợ sẽ chỉ tiếp tục hoàn thiện theo đúng nội dung và số tiền của báo giá ban đầu đã duyệt.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
