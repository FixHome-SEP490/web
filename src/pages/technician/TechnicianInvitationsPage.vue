<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Mail,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  AlertTriangle,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCard,
  FhCountdown,
} from '../../components';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';

const router = useRouter();

const loading = ref(true);
const invitations = ref<InvitationItem[]>([]);
const responding = ref(false);
const activeModalInvitation = ref<InvitationItem | null>(null);

const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

onMounted(async () => {
  try {
    const list = await bookingsApi.getMyInvitations();
    invitations.value = list;
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải danh sách lời mời nhận việc.',
    };
  } finally {
    loading.value = false;
  }
});

const handleAccept = async (inv: InvitationItem) => {
  responding.value = true;
  actionMessage.value = null;
  try {
    await bookingsApi.respondInvitation(inv.id, 'ACCEPT');
    activeModalInvitation.value = null;
    actionMessage.value = {
      type: 'success',
      text: 'Nhận đơn thành công! Đang chuyển bạn đến workspace thực thi công việc...',
    };
    setTimeout(() => {
      router.push('/tech/jobs');
    }, 800);
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể nhận đơn (có thể đã có thợ khác nhận trước hoặc hết hạn).',
    };
  } finally {
    responding.value = false;
  }
};

const handleDecline = async (inv: InvitationItem) => {
  responding.value = true;
  actionMessage.value = null;
  try {
    await bookingsApi.respondInvitation(inv.id, 'DECLINE');
    invitations.value = invitations.value.filter((i) => i.id !== inv.id);
    activeModalInvitation.value = null;
    actionMessage.value = {
      type: 'success',
      text: 'Đã từ chối lời mời nhận việc thành công.',
    };
  } catch (err) {
    // If decline API fails, DO NOT remove invitation from UI! Keep item and show error.
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể từ chối lời mời. Vui lòng kiểm tra kết nối mạng và thử lại.',
    };
  } finally {
    responding.value = false;
  }
};

const openDetailModal = (inv: InvitationItem) => {
  activeModalInvitation.value = inv;
};

const closeDetailModal = () => {
  activeModalInvitation.value = null;
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-16">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Mail class="text-brand-600" :size="24" />
          Hộp Thư Mời Nhận Việc (Inbox)
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Khách hàng đã chọn bạn vào danh sách đề xuất. Hãy phản hồi trước khi hết thời gian chờ (TTL).
        </p>
      </div>

      <span class="text-xs font-bold font-num px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
        {{ invitations.length }} lời mời đang chờ
      </span>
    </div>

    <!-- Action / Error Message Banner -->
    <div
      v-if="actionMessage"
      class="p-3 rounded-[var(--radius-sm)] text-xs font-medium flex items-center justify-between transition-all"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <div class="flex items-center gap-2">
        <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
        <AlertTriangle v-else :size="16" class="text-danger-600 shrink-0" />
        <span>{{ actionMessage.text }}</span>
      </div>
      <button class="text-ink-400 hover:text-ink-700 ml-2" @click="actionMessage = null">
        <X :size="14" />
      </button>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang kiểm tra thư mời...
    </div>

    <div v-else-if="invitations.length === 0" class="text-center py-16 bg-white rounded-[var(--radius-md)] border border-ink-200 space-y-2">
      <Mail :size="40" class="mx-auto text-ink-300" />
      <h3 class="text-sm font-bold text-ink-800">Không có lời mời nào đang chờ</h3>
      <p class="text-xs text-ink-500">Khi có khách hàng ở khu vực của bạn cần thợ, thông báo sẽ hiển thị tại đây.</p>
    </div>

    <div v-else class="space-y-4">
      <FhCard
        v-for="inv in invitations"
        :key="inv.id"
        class="border-l-4 border-l-brand-600 space-y-4 cursor-pointer hover:border-brand-300 transition-colors"
        @click="openDetailModal(inv)"
      >
        <!-- Top: TTL Countdown & Priority -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-brand-700">Ưu tiên số #{{ inv.priorityOrder }}</span>
            <span class="text-ink-400">•</span>
            <span class="text-ink-500 font-mono">Mã đơn: {{ inv.bookingId }}</span>
          </div>

          <!-- Countdown Timer Component -->
          <div class="flex items-center gap-2 text-xs">
            <span class="text-ink-500 flex items-center gap-1">
              <Clock :size="14" class="text-danger-500" /> Hết hạn sau:
            </span>
            <FhCountdown :expires-at="inv.expiresAt" />
          </div>
        </div>

        <!-- Service & Address details -->
        <div class="space-y-2 text-xs sm:text-sm">
          <h3 class="font-bold text-base text-ink-900 hover:text-brand-600 transition-colors">
            {{ inv.booking?.serviceName }}
          </h3>

          <div class="text-xs text-ink-600 flex items-center gap-1.5">
            <MapPin :size="14" class="text-brand-600 shrink-0" />
            {{ inv.booking?.addressSummary }}
          </div>

          <p class="text-xs text-ink-700 p-3 rounded bg-ink-50 border border-ink-200 leading-relaxed line-clamp-2">
            "{{ inv.booking?.description }}"
          </p>
        </div>

        <!-- Actions -->
        <div class="pt-3 border-t border-ink-100 flex items-center justify-between gap-3">
          <button
            type="button"
            class="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-brand-50"
            @click.stop="openDetailModal(inv)"
          >
            <Eye :size="14" /> Xem chi tiết sự cố
          </button>

          <div class="flex items-center gap-2">
            <FhButton
              variant="ghost"
              size="sm"
              @click.stop="handleDecline(inv)"
            >
              <XCircle :size="15" class="mr-1 text-ink-400" /> Bỏ qua
            </FhButton>

            <FhButton
              variant="primary"
              size="sm"
              :loading="responding"
              @click.stop="handleAccept(inv)"
            >
              <CheckCircle2 :size="15" class="mr-1" /> Chấp nhận đơn này
            </FhButton>
          </div>
        </div>
      </FhCard>
    </div>

    <!-- Issue Detail Modal -->
    <div
      v-if="activeModalInvitation"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
      @click.self="closeDetailModal"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-5">
        <div class="flex items-start justify-between border-b border-ink-100 pb-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2 text-[11px] font-mono text-ink-400">
              <span>ƯU TIÊN #{{ activeModalInvitation.priorityOrder }}</span>
              <span>•</span>
              <span>ĐƠN: {{ activeModalInvitation.bookingId }}</span>
            </div>
            <h2 class="text-lg font-bold text-ink-900 leading-snug">
              {{ activeModalInvitation.booking?.serviceName }}
            </h2>
          </div>
          <button class="text-ink-400 hover:text-ink-600 p-1" @click="closeDetailModal">
            <X :size="20" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Countdown Warning -->
          <div class="p-3 bg-danger-50 rounded-lg border border-danger-200 flex items-center justify-between text-danger-900 font-semibold">
            <span class="flex items-center gap-1.5">
              <AlertTriangle :size="16" class="text-danger-600" /> Thời gian phản hồi còn lại:
            </span>
            <FhCountdown :expires-at="activeModalInvitation.expiresAt" />
          </div>

          <!-- Location Info -->
          <div class="p-3 bg-ink-50 rounded-lg border border-ink-200 space-y-1">
            <span class="text-ink-500 font-medium block">Địa điểm sửa chữa:</span>
            <p class="font-semibold text-ink-900 flex items-center gap-1.5">
              <MapPin :size="15" class="text-brand-600 shrink-0" />
              {{ activeModalInvitation.booking?.addressSummary }}
            </p>
          </div>

          <!-- Problem Description -->
          <div class="space-y-1.5">
            <h4 class="font-bold text-ink-800 uppercase text-[11px]">Mô tả hiện trạng sự cố từ khách:</h4>
            <div class="p-3.5 rounded bg-brand-50/40 border border-brand-200 text-ink-800 leading-relaxed text-xs">
              {{ activeModalInvitation.booking?.description || 'Không có mô tả chi tiết từ khách.' }}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-ink-100">
          <FhButton variant="secondary" size="sm" @click="handleDecline(activeModalInvitation)">
            <XCircle :size="14" class="mr-1 text-ink-500" /> Bỏ qua đơn
          </FhButton>
          <FhButton
            variant="primary"
            size="sm"
            :loading="responding"
            @click="handleAccept(activeModalInvitation)"
          >
            <CheckCircle2 :size="14" class="mr-1" /> Chấp nhận & Nhận việc ngay
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
