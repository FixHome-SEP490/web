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
        FixHome bắt buộc tách riêng Tiền công và Tiền vật tư trên toàn bộ chu trình dịch vụ.
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
          <li class="flex gap-3 items-start"><span class="mt-1 text-brand-600 font-bold">•</span> <span><strong>Không ép giá:</strong> Giá niêm yết và giá tham khảo của dịch vụ được công khai trong danh mục.</span></li>
        </ul>
      </div>
    </div>

    <!-- How a quotation is laid out (text only, no sample figures) -->
    <div class="space-y-12">
      <div class="text-center space-y-4 max-w-2xl mx-auto">
        <h2 class="text-3xl font-bold text-slate-900 tracking-tight">Cách thể hiện báo giá trên hệ thống</h2>
        <p class="text-lg text-slate-500 font-medium">
          Trước khi bạn bấm đồng ý, báo giá trên ứng dụng tách riêng từng phần để bạn biết mình trả tiền cho việc gì:
        </p>
      </div>

      <ul class="max-w-3xl mx-auto bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50 divide-y divide-slate-100 text-base font-medium">
        <li class="p-8 md:p-10 space-y-1.5">
          <div class="font-bold text-slate-900">Tiền công kỹ thuật</div>
          <p class="text-slate-500">Công kiểm tra và sửa chữa của kỹ thuật viên, theo giá niêm yết hoặc báo giá sau khi kiểm tra.</p>
        </li>
        <li class="p-8 md:p-10 space-y-1.5">
          <div class="font-bold text-slate-900">Vật tư và linh kiện</div>
          <p class="text-slate-500">Từng linh kiện được ghi tên, số lượng và đơn giá riêng, không gộp vào tiền công.</p>
        </li>
        <li class="bg-slate-50 p-8 md:p-10 space-y-1.5">
          <div class="font-bold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck :size="18" class="text-brand-600" /> Tổng cộng và bảo hành
          </div>
          <p class="text-slate-500">Tổng tiền bạn duyệt là số tiền được tính. Thời hạn bảo hành ghi trên phiếu bảo hành của đơn sau khi hoàn tất.</p>
        </li>
      </ul>
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
