<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ShieldCheck, Calendar, Wrench, Clock, AlertCircle } from 'lucide-vue-next';
import { FhButton, FhCard } from '../../components';
import { ordersApi, type WarrantyItem } from '../../api/orders.api';

const router = useRouter();

const loading = ref(true);
const warranties = ref<WarrantyItem[]>([]);

onMounted(async () => {
  try {
    const list = await ordersApi.getWarranties();
    warranties.value = list;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ShieldCheck class="text-success-600" :size="24" />
          Bảo hành & Gói đảm bảo còn hiệu lực
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Quản lý minh bạch chính sách bảo hành chính hãng FixHome và các gói đảm bảo linh kiện ngoài (External Part Assurance).
        </p>
      </div>

      <FhButton variant="secondary" size="sm" @click="router.push('/app/orders')">
        Xem tất cả đơn
      </FhButton>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải danh sách bảo hành...
    </div>

    <div v-else-if="warranties.length === 0" class="text-center py-16 bg-white rounded-[var(--radius-md)] border border-ink-200">
      <ShieldCheck :size="40" class="mx-auto text-ink-300 mb-2" />
      <h3 class="text-sm font-bold text-ink-800">Chưa có gói bảo hành hoặc đảm bảo nào</h3>
      <p class="text-xs text-ink-500 mt-1">Các hạng mục thay thế linh kiện sẽ tự động xuất hiện tại đây sau khi hoàn tất đơn.</p>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FhCard
        v-for="w in warranties"
        :key="w.id"
        class="flex flex-col justify-between space-y-4"
      >
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-bold text-ink-900">{{ w.orderCode }}</span>
            <span
              v-if="(w as any).note === 'EXTERNAL_ASSURANCE'"
              class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300"
            >
              EXTERNAL PART ASSURANCE
            </span>
            <span
              v-else
              class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300"
            >
              FIXHOME WARRANTY
            </span>
          </div>

          <h3 class="font-bold text-sm text-ink-900">{{ w.serviceName }}</h3>

          <!-- Distinction between FixHome Warranty and External Assurance per Section 23 -->
          <div
            v-if="(w as any).note === 'EXTERNAL_ASSURANCE'"
            class="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1"
          >
            <div class="font-bold flex items-center gap-1">
              <AlertCircle :size="13" class="text-amber-600" />
              Gói đảm bảo linh kiện ngoài (30 ngày)
            </div>
            <p class="text-[11px] text-amber-900 leading-relaxed">
              FixHome sẽ liên hệ và điều phối kỹ thuật viên thực hiện đơn quay lại kiểm tra khi có phản ánh.
            </p>
          </div>

          <div
            v-else
            class="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1"
          >
            <div class="font-bold flex items-center gap-1">
              <ShieldCheck :size="13" class="text-emerald-600" />
              Bảo hành chính hãng FixHome
            </div>
            <p class="text-[11px] text-emerald-800 leading-relaxed">
              Áp dụng chính sách bảo hành tiêu chuẩn và 1 đổi 1 linh kiện của FixHome.
            </p>
          </div>

          <div class="p-2.5 rounded bg-ink-50 border border-ink-200 text-xs text-ink-800">
            <strong>Hạng mục:</strong> {{ w.itemDescription || 'Linh kiện thay thế theo đơn' }}
          </div>

          <div class="text-xs text-ink-500 space-y-1">
            <div class="flex items-center gap-1.5">
              <Calendar :size="13" /> Hiệu lực từ: {{ new Date(w.startsAt).toLocaleDateString('vi-VN') }}
            </div>
            <div class="flex items-center gap-1.5 font-semibold text-brand-700">
              <Clock :size="13" /> Hết hạn vào: {{ new Date(w.expiresAt).toLocaleDateString('vi-VN') }}
            </div>
            <div class="flex items-center gap-1.5">
              <Wrench :size="13" /> Kỹ thuật viên: {{ w.technicianName }}
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-ink-100 flex items-center justify-between">
          <span
            class="text-[11px] font-semibold"
            :class="(w as any).note === 'EXTERNAL_ASSURANCE' ? 'text-amber-700' : 'text-emerald-700'"
          >
            {{ (w as any).note === 'EXTERNAL_ASSURANCE' ? 'Hỗ trợ điều phối thợ' : '100% miễn phí công thợ' }}
          </span>
          <FhButton
            variant="secondary"
            size="sm"
            @click="router.push('/app/bookings/new')"
          >
            {{ (w as any).note === 'EXTERNAL_ASSURANCE' ? 'Yêu cầu kiểm tra lại' : 'Yêu cầu bảo hành' }}
          </FhButton>
        </div>
      </FhCard>
    </div>
  </div>
</template>
