<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ShieldCheck, Calendar, Wrench, Clock, AlertCircle, CheckCircle2 } from 'lucide-vue-next';
import { FhButton, FhCard } from '../../components';
import { ordersApi, type WarrantyItem } from '../../api/orders.api';

const router = useRouter();

const loading = ref(true);
const warranties = ref<WarrantyItem[]>([]);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Warranty Claim Modal State
const showClaimModal = ref(false);
const selectedWarranty = ref<WarrantyItem | null>(null);
const claimDescription = ref('');
const submittingClaim = ref(false);

const openClaimModal = (w: WarrantyItem) => {
  selectedWarranty.value = w;
  claimDescription.value = '';
  actionMessage.value = null;
  showClaimModal.value = true;
};

const handleSubmitClaim = async () => {
  if (!selectedWarranty.value?.orderId) return;
  if (!claimDescription.value.trim()) {
    actionMessage.value = {
      type: 'error',
      text: 'Vui lòng nhập mô tả sự cố để thợ nắm được tình trạng thiết bị.',
    };
    return;
  }
  try {
    submittingClaim.value = true;
    actionMessage.value = null;
    await ordersApi.createWarrantyClaim(selectedWarranty.value.orderId, {
      description: claimDescription.value.trim(),
    });
    showClaimModal.value = false;
    actionMessage.value = {
      type: 'success',
      text: 'Yêu cầu bảo hành đã được gửi thành công! Kỹ thuật viên phụ trách và Quản lý dịch vụ sẽ liên hệ để xử lý.',
    };
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể gửi yêu cầu bảo hành.',
    };
  } finally {
    submittingClaim.value = false;
  }
};

onMounted(async () => {
  try {
    const list = await ordersApi.getWarranties();
    warranties.value = list;
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải danh sách bảo hành.',
    };
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

    <!-- Alert / Action Banner -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-[var(--radius-sm)] text-xs font-medium flex items-center justify-between transition-all"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <div class="flex items-center gap-2">
        <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
        <AlertCircle v-else :size="16" class="text-danger-600 shrink-0" />
        <span>{{ actionMessage.text }}</span>
      </div>
      <button class="text-ink-400 hover:text-ink-700 ml-2" @click="actionMessage = null">
        &times;
      </button>
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
            @click="openClaimModal(w)"
          >
            {{ (w as any).note === 'EXTERNAL_ASSURANCE' ? 'Yêu cầu kiểm tra lại' : 'Yêu cầu bảo hành' }}
          </FhButton>
        </div>
      </FhCard>
    </div>

    <!-- Warranty Claim Modal (Task 11) -->
    <div
      v-if="showClaimModal && selectedWarranty"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4 shadow-xl">
        <div class="space-y-1">
          <h3 class="text-base font-bold text-ink-900 flex items-center gap-2">
            <ShieldCheck class="text-brand-600" :size="20" />
            Yêu cầu Bảo hành / Kiểm tra lại
          </h3>
          <p class="text-xs text-ink-500">
            Đơn hàng: <strong class="text-ink-800 font-mono">{{ selectedWarranty.orderCode }}</strong> — {{ selectedWarranty.serviceName }}
          </p>
        </div>

        <div class="p-3 bg-ink-50 rounded border border-ink-200 text-xs space-y-1 text-ink-700">
          <div><strong>Hạng mục:</strong> {{ selectedWarranty.itemDescription || 'Linh kiện thay thế' }}</div>
          <div><strong>Thời hạn bảo hành:</strong> Đến {{ new Date(selectedWarranty.expiresAt).toLocaleDateString('vi-VN') }}</div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-ink-700">Mô tả sự cố hoặc hiện tượng lỗi tái phát:</label>
          <textarea
            v-model="claimDescription"
            rows="3"
            placeholder="Ví dụ: Máy lạnh chảy nước trở lại tại vị trí ống đồng vừa thay..."
            class="w-full p-2.5 bg-white border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
          ></textarea>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-ink-100">
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="submittingClaim"
            @click="showClaimModal = false"
          >
            Hủy
          </FhButton>
          <FhButton
            variant="primary"
            size="sm"
            :disabled="submittingClaim"
            @click="handleSubmitClaim"
          >
            {{ submittingClaim ? 'Đang gửi...' : 'Gửi yêu cầu bảo hành' }}
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
