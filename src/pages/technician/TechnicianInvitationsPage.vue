<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue';
import { toast } from 'vue-sonner';
import { useRouter } from 'vue-router';
import { Mail, Clock, MapPin, Check, ChevronRight, X, Sparkles, Navigation } from 'lucide-vue-next';
import {
  BookingMediaViewer,
  FhButton,
  FhCountdown,
  FhMoney,
  FhSkeleton,
} from '../../components';
import AiSummaryDialog from '../../components/technician/AiSummaryDialog.vue';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { sessionLabel } from '../../utils/booking-session';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { affectedBy } from '../../lib/query-keys';
import { sharedQueries } from '../../lib/queries';

const invitationSession = (inv: InvitationItem) => sessionLabel({
  bookingMode: inv.booking?.bookingMode,
  slot: inv.booking?.slot,
  start: inv.booking?.preferredStartAt,
});

const router = useRouter();

const cache = useCacheUpdates();
const responding = ref(false);

// Cached with the dashboard's copy: a return visit shows the last list at once.
const invitationsQuery = useCachedQuery(sharedQueries.technicianInvitations);
const loading = invitationsQuery.loading;
const invitations = computed<InvitationItem[]>(() => invitationsQuery.data.value ?? []);
const loadError = computed(() =>
  invitationsQuery.error.value ? 'Không thể tải danh sách lời mời. Vui lòng thử lại.' : '',
);
const loadInvitations = () => invitationsQuery.refetch();

// "Tự nhận việc" (PO 10/10/2026): new invitations are accepted for the technician. Switching it on
// also takes the ones waiting now, so the list is reloaded.
const profileQuery = useCachedQuery(sharedQueries.technicianProfile);
const autoAccept = computed<boolean | null>(() =>
  profileQuery.error.value || !profileQuery.data.value ? null : profileQuery.data.value.autoAcceptInvitations,
);
const savingAutoAccept = ref(false);
const autoAcceptError = ref('');
const toggleAutoAccept = async () => {
  if (autoAccept.value === null || savingAutoAccept.value) return;
  const next = !autoAccept.value;
  savingAutoAccept.value = true;
  autoAcceptError.value = '';
  try {
    const saved = (await technicianProfileApi.updateMyProfile({ autoAcceptInvitations: next })).autoAcceptInvitations;
    if (profileQuery.data.value) profileQuery.setData({ ...profileQuery.data.value, autoAcceptInvitations: saved });
    cache.markChanged(affectedBy.technicianSettings);
    if (next) await loadInvitations();
  } catch {
    autoAcceptError.value = 'Chưa đổi được chế độ tự nhận việc. Vui lòng thử lại.';
  } finally {
    savingAutoAccept.value = false;
  }
};

const detailInvitation = ref<InvitationItem | null>(null);

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !detailInvitation.value || responding.value) return;
  // The AI summary opens over the detail; Escape closes it first.
  if (aiSummaryOpen.value) aiSummaryOpen.value = false;
  else detailInvitation.value = null;
};
watch(detailInvitation, (open) => {
  if (open) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

// PO 18/10/2026: how far the job is, never where exactly. The server measures from the
// technician's work address (or a fresh GPS fix for come-now jobs) and sends only a band.
const distanceText = (inv: InvitationItem): string => {
  const band = inv.booking?.distanceBand;
  if (!band) return '';
  if (band.minKm === 0 && band.maxKm != null) return `Cách bạn dưới ${band.maxKm} km`;
  if (band.maxKm == null) return `Cách bạn hơn ${band.minKm} km`;
  return `Cách bạn khoảng ${band.minKm}-${band.maxKm} km`;
};
const isFixedPrice = (inv: InvitationItem) => String(inv.booking?.pricingMode ?? '').toLowerCase() === 'fixed_price';
const aiSummaryOpen = ref(false);
watch(detailInvitation, () => { aiSummaryOpen.value = false; });

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
    const result = await bookingsApi.respondInvitation(inv.id, 'ACCEPT');
    if (!result.serviceOrderId) throw new Error('Missing ServiceOrder ID');
    void cache.refresh(affectedBy.invitationResponse);
    await router.push({ name: 'tech-job-detail', params: { id: result.serviceOrderId } });
  } catch {
    toast.error('Chưa xác nhận được trạng thái nhận đơn. Hãy kiểm tra danh sách công việc trước khi thử nhận lại.');
  } finally {
    responding.value = false;
  }
};

const handleDecline = async (inv: InvitationItem) => {
  try {
    await bookingsApi.respondInvitation(inv.id, 'DECLINE');
    if (invitationsQuery.data.value) invitationsQuery.setData(invitationsQuery.data.value.filter((i) => i.id !== inv.id));
    cache.markChanged(affectedBy.invitationResponse);
    if (detailInvitation.value?.id === inv.id) detailInvitation.value = null;
  } catch {
    toast.error('Chưa thể từ chối lời mời. Vui lòng thử lại.');
  }
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div class="flex items-center gap-3 min-w-0">
        <h1 class="min-w-0 text-2xl font-bold text-ink-900 tracking-tight">Lời mời nhận việc</h1>
        <span
          v-if="!loading && !loadError && invitations.length > 0"
          class="whitespace-nowrap text-sm font-medium font-num h-7 px-3 rounded-full bg-brand-50 text-brand-700 inline-flex items-center"
        >
          {{ invitations.length }} đang chờ
        </span>
      </div>
      <button
        v-if="autoAccept !== null"
        type="button"
        role="switch"
        :aria-checked="autoAccept"
        :disabled="savingAutoAccept"
        class="inline-flex items-center gap-3 h-11 pl-4 pr-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-60 whitespace-nowrap"
        data-testid="auto-accept-toggle"
        @click="toggleAutoAccept"
      >
        Tự nhận việc
        <span
          class="relative w-11 h-6 rounded-full transition-colors"
          :class="autoAccept ? 'bg-brand-600' : 'bg-ink-200'"
          aria-hidden="true"
        >
          <span
            class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white border transition-transform"
            :class="autoAccept ? 'translate-x-5 border-white' : 'border-ink-300'"
          />
        </span>
      </button>
    </div>
    <p v-if="autoAcceptError" class="text-sm text-danger-700" role="alert">{{ autoAcceptError }}</p>

    <div v-if="loading" class="space-y-4" aria-busy="true" aria-label="Đang tải lời mời">
      <div v-for="i in 2" :key="i" class="p-5 sm:p-6 rounded-2xl bg-white border border-ink-200 space-y-3">
        <FhSkeleton width="30%" height="16px" />
        <FhSkeleton width="60%" height="22px" />
        <FhSkeleton width="80%" height="16px" />
        <div class="flex justify-end gap-3 pt-1">
          <FhSkeleton width="96px" height="44px" rounded="md" />
        </div>
      </div>
    </div>

    <div
      v-else-if="loadError"
      class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3"
      role="alert"
    >
      <span>{{ loadError }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="loadInvitations">Thử lại</FhButton>
    </div>

    <div v-else-if="invitations.length === 0" class="text-center py-14 px-6 bg-white rounded-2xl border border-ink-200 space-y-3">
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 mx-auto flex items-center justify-center">
        <Mail :size="24" />
      </div>
      <h3 class="text-base font-semibold text-ink-900">Không có lời mời nào đang chờ</h3>
      <p class="text-sm text-ink-500">{{ autoAccept ? 'Lời mời mới sẽ được tự nhận và chuyển sang Công việc.' : 'Lời mời mới sẽ hiện ở đây.' }}</p>
    </div>

    <!-- Each invitation is its own decision, so its own card -->
    <div v-else class="space-y-4">
      <article
        v-for="inv in invitations"
        :key="inv.id"
        class="rounded-2xl bg-white border border-ink-200 overflow-hidden"
        :data-testid="`invitation-${inv.id}`"
      >
        <!-- Summary (service, area, session); opens the full detail -->
        <button
          type="button"
          class="w-full p-5 sm:p-6 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
          :class="focusRing"
          @click="detailInvitation = inv"
        >
          <span class="flex-1 min-w-0 space-y-1.5">
            <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span class="font-semibold text-brand-700 whitespace-nowrap">Ưu tiên số {{ inv.priorityOrder }}</span>
              <FhCountdown :expires-at="inv.expiresAt" />
            </span>
            <span class="block font-semibold text-lg text-ink-900 text-balance">
              {{ inv.booking?.serviceName }}
            </span>
            <span class="text-sm text-ink-600 flex items-start gap-1.5">
              <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
              <span class="text-pretty">
                {{ inv.booking?.addressSummary }}<template v-if="distanceText(inv)"> · <span class="whitespace-nowrap" data-testid="invitation-distance">{{ distanceText(inv) }}</span></template>
              </span>
            </span>
            <span v-if="inv.booking?.description" class="block text-sm text-ink-700 line-clamp-2 text-pretty" data-testid="invitation-description">
              {{ inv.booking.description }}
            </span>
            <span class="text-sm text-ink-600 flex items-center gap-1.5" data-testid="invitation-session">
              <Clock :size="15" class="text-ink-400 shrink-0" />
              <strong class="font-semibold text-ink-900">{{ invitationSession(inv) }}</strong>
            </span>
          </span>
          <ChevronRight :size="20" class="text-ink-400 shrink-0" aria-hidden="true" />
        </button>

        <div class="px-5 sm:px-6 py-3 border-t border-ink-100 grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
          <FhButton variant="secondary" size="md" @click.stop="handleDecline(inv)">
            Từ chối
          </FhButton>
          <FhButton variant="primary" size="md" :loading="responding" @click.stop="handleAccept(inv)">
            <Check :size="16" /> Chấp nhận đơn này
          </FhButton>
        </div>
      </article>
    </div>

    <!-- Full detail -->
    <div
      v-if="detailInvitation"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 overscroll-contain"
      @click.self="detailInvitation = null"
    >
      <div
        class="bg-white rounded-[var(--radius-lg)] max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitation-detail-title"
      >
        <div class="flex items-start justify-between gap-3">
          <h3 id="invitation-detail-title" class="text-lg font-semibold text-ink-900 text-balance">{{ detailInvitation.booking?.serviceName }}</h3>
          <button
            type="button"
            class="w-10 h-10 -mr-2 -mt-2 rounded-xl text-ink-500 hover:bg-ink-100 hover:text-ink-700 flex items-center justify-center shrink-0"
            :class="focusRing"
            aria-label="Đóng"
            @click="detailInvitation = null"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="font-semibold text-brand-700 whitespace-nowrap">Ưu tiên số {{ detailInvitation.priorityOrder }}</span>
          <FhCountdown :expires-at="detailInvitation.expiresAt" />
          <span
            v-if="urgencyLabel(detailInvitation.booking?.urgency)"
            class="h-6 px-2 rounded-lg text-xs font-medium bg-danger-50 text-danger-700 inline-flex items-center whitespace-nowrap"
          >
            {{ urgencyLabel(detailInvitation.booking?.urgency) }}
          </span>
          <span
            v-if="detailInvitation.booking?.quantity && detailInvitation.booking.quantity > 1"
            class="h-6 px-2 rounded-lg text-xs font-medium bg-ink-100 text-ink-600 inline-flex items-center whitespace-nowrap"
          >
            Số lượng: {{ detailInvitation.booking.quantity }}
          </span>
        </div>

        <div class="space-y-1.5 text-sm">
          <p class="text-ink-700 flex items-start gap-1.5">
            <MapPin :size="15" class="text-ink-400 shrink-0 mt-0.5" />
            <span class="text-pretty">{{ detailInvitation.booking?.addressSummary }}</span>
          </p>
          <p v-if="distanceText(detailInvitation)" class="text-ink-700 flex items-center gap-1.5" data-testid="invitation-detail-distance">
            <Navigation :size="15" class="text-ink-400 shrink-0" />
            <span>{{ distanceText(detailInvitation) }}</span>
          </p>
          <p class="text-ink-700 flex items-center gap-1.5" data-testid="invitation-detail-session">
            <Clock :size="15" class="text-ink-400 shrink-0" />
            <strong class="font-semibold text-ink-900">{{ invitationSession(detailInvitation) }}</strong>
          </p>
        </div>

        <section class="space-y-2 border-t border-ink-100 pt-4" data-testid="invitation-detail-problem">
          <h4 class="text-sm font-semibold text-ink-900">Khách mô tả</h4>
          <p v-if="detailInvitation.booking?.description" class="text-sm text-ink-800 whitespace-pre-line text-pretty" data-testid="invitation-detail-description">{{ detailInvitation.booking.description }}</p>
          <p v-else class="text-sm text-ink-500">Khách chưa ghi mô tả.</p>
          <p class="text-sm text-ink-700" data-testid="invitation-detail-price">
            <template v-if="isFixedPrice(detailInvitation) && detailInvitation.booking?.fixedUnitPrice != null">
              Giá niêm yết <strong class="font-semibold text-ink-900 whitespace-nowrap"><FhMoney :amount="detailInvitation.booking.fixedUnitPrice" /></strong><span v-if="(detailInvitation.booking?.quantity ?? 1) > 1" class="whitespace-nowrap"> × {{ detailInvitation.booking?.quantity }}</span>
            </template>
            <template v-else>Báo giá sau khi kiểm tra tại nhà khách</template>
          </p>
          <button
            v-if="detailInvitation.booking?.aiSummary"
            type="button"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
            :class="focusRing"
            data-testid="invitation-detail-ai-summary"
            @click="aiSummaryOpen = true"
          >
            <Sparkles :size="15" /> Xem tóm tắt vấn đề từ AI
          </button>
        </section>

        <BookingMediaViewer
          v-if="detailInvitation.booking?.media?.length"
          :booking-id="detailInvitation.bookingId"
          :media="detailInvitation.booking.media"
        />

        <p class="rounded-xl bg-warning-50 border border-warning-200 px-3 py-2 text-sm text-warning-800 text-pretty" data-testid="invitation-detail-privacy">
          Địa chỉ cụ thể, số điện thoại và ghi chú riêng của khách hiện sau khi bạn nhận đơn.
        </p>

        <div class="grid grid-cols-2 gap-2.5 pt-4 border-t border-ink-100">
          <FhButton variant="secondary" size="md" @click="handleDecline(detailInvitation)">
            Từ chối
          </FhButton>
          <FhButton variant="primary" size="md" :loading="responding" @click="handleAccept(detailInvitation)">
            <Check :size="16" /> Chấp nhận đơn này
          </FhButton>
        </div>
      </div>
    </div>

    <AiSummaryDialog
      v-if="detailInvitation?.booking?.aiSummary"
      :open="aiSummaryOpen"
      :summary="detailInvitation.booking.aiSummary"
      :description="detailInvitation.booking.description"
      :booking-id="detailInvitation.bookingId"
      :media="detailInvitation.booking.media"
      @close="aiSummaryOpen = false"
    />
  </div>
</template>
