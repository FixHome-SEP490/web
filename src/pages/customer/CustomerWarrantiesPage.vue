<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  ShieldCheck,
  Calendar,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  PackageCheck,
  X,
  Send,
  Loader2,
} from 'lucide-vue-next';
import { FhButton, FhCard } from '../../components';
import { ordersApi, type OrderWarrantyGroup } from '../../api/orders.api';

const router = useRouter();

const loading = ref(true);
const actionLoading = ref(false);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const warrantyOrders = ref<OrderWarrantyGroup[]>([]);

// Modal Yêu cầu bảo hành trực tiếp
const showClaimModal = ref(false);
const selectedOrderForClaim = ref<OrderWarrantyGroup | null>(null);
const claimDescription = ref('');

const loadWarranties = async () => {
  try {
    loading.value = true;
    warrantyOrders.value = await ordersApi.getOrderWarrantiesGrouped();
  } catch (err: unknown) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải danh sách bảo hành.',
    };
  } finally {
    loading.value = false;
  }
};

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toLocaleDateString('vi-VN');
  } catch {
    return val;
  }
};

const getDaysRemaining = (expiresAt: string) => {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const openClaimModal = (order: OrderWarrantyGroup) => {
  selectedOrderForClaim.value = order;
  claimDescription.value = '';
  showClaimModal.value = true;
};

const submitClaim = async () => {
  if (!selectedOrderForClaim.value) return;
  if (!claimDescription.value.trim()) {
    actionMessage.value = {
      type: 'error',
      text: 'Vui lòng mô tả chi tiết sự cố cần bảo hành!',
    };
    return;
  }

  try {
    actionLoading.value = true;
    actionMessage.value = null;

    await ordersApi.createWarrantyClaim(
      selectedOrderForClaim.value.orderId,
      claimDescription.value.trim(),
    );

    actionMessage.value = {
      type: 'success',
      text: `Đã gửi yêu cầu bảo hành cho đơn hàng ${selectedOrderForClaim.value.orderCode} thành công! Kỹ thuật viên và FixHome sẽ liên hệ lại với bạn sớm nhất.`,
    };

    // Cập nhật trạng thái cục bộ
    selectedOrderForClaim.value.activeClaim = {
      id: 'new',
      description: claimDescription.value.trim(),
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
    };

    showClaimModal.value = false;
    claimDescription.value = '';
  } catch (err: unknown) {
    actionMessage.value = {
      type: 'error',
      text:
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        'Không thể gửi yêu cầu bảo hành.',
    };
  } finally {
    actionLoading.value = false;
  }
};

const goToOrderDetail = (orderId: string) => {
  router.push(`/app/orders/${orderId}`);
};

onMounted(() => {
  loadWarranties();
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ShieldCheck class="text-emerald-600" :size="26" />
          Bảo hành Điện tử theo Đơn hàng
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Tất cả linh kiện và dịch vụ sửa chữa của FixHome được quản lý bảo hành tập trung theo từng đơn hàng.
        </p>
      </div>

      <FhButton variant="secondary" size="sm" @click="router.push('/app/orders')">
        Xem tất cả đơn
      </FhButton>
    </div>

    <!-- Alert / Toast Banner -->
    <div
      v-if="actionMessage"
      class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all shadow-xs"
      :class="
        actionMessage.type === 'success'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-rose-50 text-rose-800 border border-rose-200'
      "
    >
      <CheckCircle2
        v-if="actionMessage.type === 'success'"
        :size="16"
        class="text-emerald-600 shrink-0"
      />
      <AlertCircle v-else :size="16" class="text-rose-600 shrink-0" />
      <span class="flex-1">{{ actionMessage.text }}</span>
      <button
        type="button"
        class="text-ink-400 hover:text-ink-700 ml-2"
        @click="actionMessage = null"
      >
        ✕
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16 text-ink-400">
      <Loader2 :size="24" class="animate-spin inline mr-2 text-brand-600" />
      Đang tải danh sách bảo hành theo đơn...
    </div>

    <!-- Empty State -->
    <div
      v-else-if="warrantyOrders.length === 0"
      class="text-center py-16 bg-white rounded-[var(--radius-md)] border border-ink-200 shadow-xs space-y-2"
    >
      <ShieldCheck :size="48" class="mx-auto text-ink-300 mb-1" />
      <h3 class="text-base font-bold text-ink-800">Chưa có đơn hàng nào có bảo hành</h3>
      <p class="text-xs text-ink-500 max-w-md mx-auto">
        Khi đơn sửa chữa hoàn tất nghiệm thu và thanh toán, các gói bảo hành dịch vụ cùng linh kiện thay thế sẽ tự động kích hoạt tại đây.
      </p>
      <div class="pt-2">
        <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
          Đặt thợ sửa chữa ngay
        </FhButton>
      </div>
    </div>

    <!-- Orders Warranty Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <FhCard
        v-for="order in warrantyOrders"
        :key="order.orderId"
        class="flex flex-col justify-between space-y-4 hover:border-brand-300 transition-all shadow-xs"
      >
        <div class="space-y-3.5">
          <!-- Card Header: Order Code & Badges -->
          <div class="flex items-center justify-between gap-2 border-b border-ink-100 pb-2.5">
            <button
              type="button"
              class="font-mono text-xs font-bold text-brand-700 hover:text-brand-900 flex items-center gap-1 group"
              title="Bấm để xem chi tiết đơn hàng này"
              @click="goToOrderDetail(order.orderId)"
            >
              <span>{{ order.orderCode }}</span>
              <ArrowUpRight :size="13" class="opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>

            <!-- Status Pill -->
            <div class="flex items-center gap-1.5">
              <span
                v-if="order.activeClaim"
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
              >
                ĐANG XỬ LÝ BẢO HÀNH
              </span>
              <span
                v-else-if="order.hasActiveCoverage"
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                CÒN HIỆU LỰC (Còn {{ getDaysRemaining(order.maxExpiresAt) }} ngày)
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300"
              >
                HẾT HẠN BẢO HÀNH
              </span>
            </div>
          </div>

          <!-- Order Title -->
          <div>
            <h3
              class="font-bold text-sm text-ink-900 cursor-pointer hover:text-brand-700 transition-colors"
              @click="goToOrderDetail(order.orderId)"
            >
              {{ order.serviceName }}
            </h3>
            <p class="text-[11px] text-ink-400 mt-0.5">
              Đơn hàng hoàn tất · Được bảo vệ bởi chính sách bảo hành điện tử FixHome
            </p>
          </div>

          <!-- Covered Items Inside Order -->
          <div class="p-3 rounded-lg bg-ink-50/80 border border-ink-200 space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-ink-800">
              <span class="flex items-center gap-1.5">
                <PackageCheck :size="14" class="text-brand-600" />
                Hạng mục bảo hành trong đơn ({{ order.coverages.length }} mục):
              </span>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="item in order.coverages"
                :key="item.id"
                class="flex items-center justify-between text-xs py-1 px-2 rounded bg-white border border-ink-150 shadow-2xs"
              >
                <div class="flex items-center gap-1.5 font-medium text-ink-900 truncate mr-2">
                  <CheckCircle2 :size="13" class="text-emerald-600 shrink-0" />
                  <span class="truncate" :title="item.itemDescription">{{ item.itemDescription }}</span>
                </div>
                <div class="flex items-center gap-2 text-[11px] shrink-0 font-num">
                  <span class="text-ink-500">Hạn: {{ formatDate(item.expiresAt) }}</span>
                  <span
                    class="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                    :class="
                      item.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-100 text-gray-500'
                    "
                  >
                    {{ item.status === 'ACTIVE' ? 'Còn hạn' : 'Hết hạn' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Metadata: Dates & Technician -->
          <div class="text-xs text-ink-600 space-y-1 bg-ink-25/50 p-2.5 rounded-lg border border-ink-100">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 text-ink-500">
                <Calendar :size="13" /> Kích hoạt từ:
              </span>
              <span class="font-medium font-num">{{ formatDate(order.minStartsAt) }}</span>
            </div>
            <div class="flex items-center justify-between font-semibold">
              <span class="flex items-center gap-1.5 text-brand-700">
                <Clock :size="13" /> Hạn bảo hành tối đa:
              </span>
              <span class="text-brand-800 font-num">{{ formatDate(order.maxExpiresAt) }}</span>
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-ink-100">
              <span class="flex items-center gap-1.5 text-ink-500">
                <Wrench :size="13" /> Kỹ thuật viên:
              </span>
              <span class="font-medium text-ink-900">
                {{ order.technicianName }}
                <span v-if="order.technicianPhone" class="text-ink-400 font-mono text-[11px]">
                  ({{ order.technicianPhone }})
                </span>
              </span>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="pt-3 border-t border-ink-100 flex items-center justify-between gap-2">
          <span class="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
            <ShieldCheck :size="13" class="text-emerald-600" />
            100% miễn phí công thợ
          </span>

          <div class="flex items-center gap-2">
            <FhButton
              variant="secondary"
              size="sm"
              class="text-xs"
              @click="goToOrderDetail(order.orderId)"
            >
              Xem đơn hàng
            </FhButton>

            <!-- Claim button -->
            <FhButton
              v-if="order.activeClaim"
              variant="ghost"
              size="sm"
              class="border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs"
              @click="goToOrderDetail(order.orderId)"
            >
              Xem tiến độ
            </FhButton>
            <FhButton
              v-else
              variant="primary"
              size="sm"
              class="text-xs"
              :disabled="!order.hasActiveCoverage"
              :title="!order.hasActiveCoverage ? 'Đơn hàng đã hết thời hạn bảo hành' : 'Yêu cầu thợ kiểm tra hỗ trợ bảo hành'"
              @click="openClaimModal(order)"
            >
              Yêu cầu hỗ trợ
            </FhButton>
          </div>
        </div>
      </FhCard>
    </div>

    <!-- Modal Yêu cầu Hỗ trợ Bảo hành Điện tử -->
    <div
      v-if="showClaimModal && selectedOrderForClaim"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-ink-200">
        <div class="flex items-center justify-between border-b border-ink-100 pb-3">
          <div class="flex items-center gap-2 text-ink-900 font-bold text-base">
            <ShieldCheck class="text-emerald-600" :size="20" />
            <span>Yêu cầu Hỗ trợ Bảo hành</span>
          </div>
          <button
            type="button"
            class="text-ink-400 hover:text-ink-700 p-1 rounded-full hover:bg-ink-100"
            @click="showClaimModal = false"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="space-y-2 text-xs">
          <div class="bg-ink-50 p-2.5 rounded-lg border border-ink-150 space-y-1">
            <p>
              <strong>Đơn hàng:</strong>
              <span class="font-mono text-brand-700 font-bold ml-1">
                {{ selectedOrderForClaim.orderCode }}
              </span>
            </p>
            <p>
              <strong>Dịch vụ:</strong>
              <span class="text-ink-900 ml-1">{{ selectedOrderForClaim.serviceName }}</span>
            </p>
            <p>
              <strong>Kỹ thuật viên:</strong>
              <span class="text-ink-900 ml-1">{{ selectedOrderForClaim.technicianName }}</span>
            </p>
          </div>

          <div>
            <label class="block font-semibold text-ink-800 mb-1">
              Mô tả chi tiết sự cố hoặc hiện tượng lỗi tái phát:
              <span class="text-rose-500">*</span>
            </label>
            <textarea
              v-model="claimDescription"
              rows="4"
              placeholder="VD: Sau khi bảo dưỡng 3 ngày điều hòa chảy nước ở góc trái hoặc không lạnh, cần thợ qua kiểm tra lại..."
              class="w-full p-3 bg-white border border-ink-300 rounded-lg text-xs text-ink-900 focus:outline-brand-600"
            ></textarea>
          </div>

          <p class="text-[11px] text-ink-500 leading-relaxed">
            💡 Kỹ thuật viên phụ trách hoặc tổng đài hỗ trợ FixHome sẽ liên hệ với bạn trong vòng 24 giờ để xếp lịch bảo hành hoàn toàn miễn phí.
          </p>
        </div>

        <div class="flex gap-2.5 pt-2 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" class="flex-1" @click="showClaimModal = false">
            Hủy bỏ
          </FhButton>
          <FhButton
            variant="primary"
            size="sm"
            class="flex-1"
            :disabled="!claimDescription.trim() || actionLoading"
            @click="submitClaim"
          >
            <Loader2 v-if="actionLoading" :size="14" class="animate-spin mr-1.5" />
            <Send v-else :size="14" class="mr-1.5" />
            Gửi yêu cầu bảo hành
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
