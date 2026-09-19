<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Mail, Clock, MapPin, CheckCircle2, XCircle, ChevronRight, X } from 'lucide-vue-next';
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
const loadError = ref('');

const loadInvitations = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    invitations.value = await bookingsApi.getMyInvitations();
  } catch {
    loadError.value = 'Không thể tải danh sách lời mời. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
};

onMounted(loadInvitations);

const detailInvitation = ref<InvitationItem | null>(null);

const urgencyLabel = (urgency?: string) => {
  switch (String(urgency).toLowerCase()) {
    case 'high': return 'Khẩn cấp';
    case 'critical': return 'Cực khẩn';
    default: return '';
  }
};

const handleAccept = async (inv: InvitationItem) => {
  responding.value = true;
  try {
    await bookingsApi.respondInvitation(inv.id, 'ACCEPT');
    alert('Nhận đơn thành công! Đang chuyển bạn đến workspace thực thi công việc.');
    router.push('/tech/jobs');
  } catch {
    alert('Không thể nhận đơn (có thể đã có thợ khác nhận trước hoặc hết hạn).');
  } finally {
    responding.value = false;
  }
};

const handleDecline = async (inv: InvitationItem) => {
  try {
    await bookingsApi.respondInvitation(inv.id, 'DECLINE');
    invitations.value = invitations.value.filter((i) => i.id !== inv.id);
    if (detailInvitation.value?.id === inv.id) detailInvitation.value = null;
  } catch {
    alert('Chưa thể từ chối lời mời. Vui lòng thử lại.');
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
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

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang kiểm tra thư mời...
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ loadError }}</span>
      <button class="font-semibold underline" type="button" @click="loadInvitations">Thử lại</button>
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
        class="border-l-4 border-l-brand-600 space-y-4"
      >
        <!-- Top: TTL Countdown & Priority -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-brand-700">Ưu tiên số #{{ inv.priorityOrder }}</span>
            <span class="text-ink-400">•</span>
            <span class="text-ink-500">Mã đơn: {{ inv.bookingId }}</span>
          </div>

          <!-- Countdown Timer Component (P7.7) -->
          <div class="flex items-center gap-2 text-xs">
            <span class="text-ink-500 flex items-center gap-1">
              <Clock :size="14" class="text-danger-500" /> Hết hạn sau:
            </span>
            <FhCountdown :expires-at="inv.expiresAt" />
          </div>
        </div>

        <!-- Summary: service & address (always visible); click opens full-detail modal -->
        <button
          type="button"
          class="w-full space-y-2 text-left text-xs sm:text-sm"
          @click="detailInvitation = inv"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-bold text-base text-ink-900">
              {{ inv.booking?.serviceName }}
            </h3>
            <span class="text-xs font-semibold text-brand-600 flex items-center gap-1 shrink-0">
              Xem chi tiết <ChevronRight :size="14" />
            </span>
          </div>

          <div class="text-xs text-ink-600 flex items-center gap-1.5">
            <MapPin :size="14" class="text-brand-600 shrink-0" />
            {{ inv.booking?.addressSummary }}
          </div>
        </button>

        <!-- Actions -->
        <div class="pt-3 border-t border-ink-100 flex items-center justify-end gap-3">
          <FhButton
            variant="ghost"
            size="md"
            @click="handleDecline(inv)"
          >
            <XCircle :size="16" class="mr-1.5 text-ink-400" /> Bỏ qua
          </FhButton>

          <FhButton
            variant="primary"
            size="md"
            :loading="responding"
            @click="handleAccept(inv)"
          >
            <CheckCircle2 :size="16" class="mr-1.5" /> Chấp nhận đơn này
          </FhButton>
        </div>
      </FhCard>
    </div>

    <!-- Full-detail modal -->
    <div
      v-if="detailInvitation"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
      @click.self="detailInvitation = null"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-base font-bold text-ink-900">{{ detailInvitation.booking?.serviceName }}</h3>
          <button type="button" class="text-ink-400 hover:text-ink-700 shrink-0" @click="detailInvitation = null">
            <X :size="18" />
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-bold text-brand-700">Ưu tiên số #{{ detailInvitation.priorityOrder }}</span>
          <span class="text-ink-400">•</span>
          <span class="text-ink-500">Mã đơn: {{ detailInvitation.bookingId }}</span>
          <FhCountdown :expires-at="detailInvitation.expiresAt" />
        </div>

        <div class="text-xs text-ink-600 flex items-center gap-1.5">
          <MapPin :size="14" class="text-brand-600 shrink-0" />
          {{ detailInvitation.booking?.addressSummary }}
        </div>

        <div v-if="urgencyLabel(detailInvitation.booking?.urgency) || (detailInvitation.booking?.quantity ?? 0) > 1" class="flex flex-wrap items-center gap-2">
          <span
            v-if="urgencyLabel(detailInvitation.booking?.urgency)"
            class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-danger-50 text-danger-700 border border-danger-200"
          >
            {{ urgencyLabel(detailInvitation.booking?.urgency) }}
          </span>
          <span v-if="detailInvitation.booking?.quantity && detailInvitation.booking.quantity > 1" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ink-100 text-ink-600">
            SL: {{ detailInvitation.booking.quantity }}
          </span>
        </div>

        <p class="text-xs text-ink-700 p-3 rounded bg-ink-50 border border-ink-200 leading-relaxed">
          "{{ detailInvitation.booking?.description }}"
        </p>

        <div v-if="detailInvitation.booking?.mediaUrls?.length" class="flex flex-wrap gap-2">
          <a
            v-for="url in detailInvitation.booking.mediaUrls"
            :key="url"
            :href="url"
            target="_blank"
            rel="noopener"
            class="w-20 h-20 rounded-lg overflow-hidden border border-ink-200 shrink-0 hover:border-brand-400 transition-colors"
          >
            <img :src="url" alt="Ảnh hiện trạng thiết bị" class="w-full h-full object-cover" />
          </a>
        </div>

        <div class="flex gap-2 pt-2 border-t border-ink-100">
          <FhButton variant="ghost" size="md" class="flex-1" @click="handleDecline(detailInvitation)">
            <XCircle :size="16" class="mr-1.5 text-ink-400" /> Bỏ qua
          </FhButton>
          <FhButton variant="primary" size="md" class="flex-1" :loading="responding" @click="handleAccept(detailInvitation)">
            <CheckCircle2 :size="16" class="mr-1.5" /> Chấp nhận đơn này
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
