<script setup lang="ts">
// One customer's identity check for the admin (PO 14/10/2026): the details the
// customer confirmed as on the card, both sides of the card (short-lived
// signed links) and, while pending, Approve or Reject.
import { computed, ref, watch } from 'vue';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  IdCard,
  CreditCard,
  Loader2,
  Calendar,
  Maximize2,
  Image as ImageIcon,
} from 'lucide-vue-next';
import { adminCustomerVerificationsApi } from '../../api/admin-customer-verifications.api';
import { genderLabels, type CustomerGender, type CustomerVerification } from '../../api/customer-verification.api';
import { formatDayKey } from '../../utils/formatters';
import { vnDateTimeString } from '../../utils/vn-time';
import { verificationStatusPill } from './customer-verification-labels';
import { useCanDecideReview } from '../../composables/useCanDecideReview';

const canDecide = useCanDecideReview();

const props = defineProps<{ verification: CustomerVerification | null; busy?: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'approve', verification: CustomerVerification): void;
  (e: 'reject', verification: CustomerVerification): void;
}>();

const SIDES = [
  { type: 'citizen_id_front', label: 'CCCD mặt trước' },
  { type: 'citizen_id_back', label: 'CCCD mặt sau' },
] as const;

const images = ref<Record<string, { url: string; loading: boolean; failed: boolean }>>({});

async function loadImage(verificationId: string, documentId: string) {
  images.value[documentId] = { url: '', loading: true, failed: false };
  try {
    const url = await adminCustomerVerificationsApi.getDocumentAccess(verificationId, documentId);
    if (props.verification?.id === verificationId) images.value[documentId] = { url, loading: false, failed: false };
  } catch {
    if (props.verification?.id === verificationId) images.value[documentId] = { url: '', loading: false, failed: true };
  }
}

watch(
  () => props.verification?.id,
  () => {
    images.value = {};
    const v = props.verification;
    if (!v) return;
    for (const doc of v.documents) void loadImage(v.id, doc.id);
  },
  { immediate: true },
);

const sides = computed(() =>
  SIDES.map((side) => ({ ...side, doc: props.verification?.documents.find((d) => d.documentType === side.type) ?? null })),
);
const pill = computed(() => verificationStatusPill(props.verification?.status));
const genderText = (value?: string | null) => genderLabels[value as CustomerGender] ?? value ?? '—';

const isPending = (status?: string) => status === 'pending';
const isVerified = (status?: string) => status === 'verified';
const isRejected = (status?: string) => status === 'rejected';

const recordCode = computed(() => {
  const v = props.verification;
  if (!v) return '—';
  return v.citizenIdNumber || v.id || '—';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-drawer">
      <div
        v-if="verification"
        class="fixed inset-0 z-50 flex justify-end bg-ink-950/50 backdrop-blur-[2px]"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-drawer-title"
          class="fh-drawer-panel relative flex h-full w-full max-w-2xl flex-col border-l border-ink-200/80 bg-white shadow-(--shadow-e3)"
          data-testid="customer-verification-drawer"
        >
          <!-- Header -->
          <header class="flex items-start justify-between gap-3 border-b border-ink-100 bg-white px-6 py-5 shrink-0">
            <div class="min-w-0 space-y-1">
              <h2 id="cv-drawer-title" class="text-xl font-bold tracking-tight text-ink-900">
                Xác minh danh tính
              </h2>

              <!-- Name & Status Badge -->
              <div class="flex flex-wrap items-center gap-2 pt-0.5">
                <span class="text-base font-bold text-ink-900 truncate">
                  {{ verification.customer?.fullName || verification.fullName }}
                </span>
                <span
                  v-if="isVerified(verification.status)"
                  class="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
                >
                  <CheckCircle2 :size="13" class="text-emerald-600" />
                  <span>{{ pill.label }}</span>
                </span>
                <span
                  v-else-if="isRejected(verification.status)"
                  class="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
                >
                  <XCircle :size="13" class="text-rose-600" />
                  <span>{{ pill.label }}</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
                >
                  <Clock :size="13" class="text-amber-600" />
                  <span>{{ pill.label }}</span>
                </span>
              </div>

              <!-- Subtitle: Record Code & Date -->
              <div class="flex flex-wrap items-center gap-3 text-xs text-ink-500 pt-1">
                <div class="flex items-center gap-1.5 font-num">
                  <IdCard :size="14" class="text-ink-400" />
                  <span>Mã hồ sơ: <strong class="font-semibold text-ink-700">{{ recordCode }}</strong></span>
                </div>
                <span class="text-ink-300" aria-hidden="true">|</span>
                <div class="flex items-center gap-1.5 font-num">
                  <Calendar :size="14" class="text-ink-400" />
                  <span>Ngày gửi: <span class="text-ink-700">{{ vnDateTimeString(verification.submittedAt) }}</span></span>
                </div>
              </div>
            </div>

            <!-- Close button -->
            <button
              type="button"
              class="rounded-xl p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
              aria-label="Đóng"
              @click="emit('close')"
            >
              <X :size="20" />
            </button>
          </header>

          <!-- Body content (Scrollable) -->
          <div class="flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-5 text-sm">
            <!-- 1. Thông tin cá nhân -->
            <section class="space-y-3">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <User class="text-brand-600" :size="18" />
                <span>Thông tin cá nhân</span>
              </h3>
              <div class="divide-y divide-ink-100">
                <div class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Họ và tên đầy đủ</span>
                  <span class="font-semibold text-ink-900 text-right">{{ verification.fullName }}</span>
                </div>
                <div class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Số CCCD / Định danh</span>
                  <span class="font-num font-medium text-ink-900 text-right">{{ verification.citizenIdNumber }}</span>
                </div>
                <div class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Ngày sinh</span>
                  <span class="font-num font-medium text-ink-900 text-right">{{ formatDayKey(verification.dateOfBirth) }}</span>
                </div>
                <div class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Giới tính</span>
                  <span class="font-medium text-ink-900 text-right">{{ genderText(verification.gender) }}</span>
                </div>
                <div class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Số điện thoại</span>
                  <span class="font-num font-medium text-ink-900 text-right">{{ verification.customer?.phoneNumber || '—' }}</span>
                </div>
                <div class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Email</span>
                  <span class="font-medium text-ink-900 break-all text-right">{{ verification.customer?.email || '—' }}</span>
                </div>
                <div v-if="verification.address" class="flex items-center justify-between py-2 text-sm">
                  <span class="text-ink-500">Nơi thường trú</span>
                  <span class="font-medium text-ink-900 text-right max-w-xs">{{ verification.address }}</span>
                </div>
              </div>
            </section>

            <!-- 2. Giấy tờ xác minh -->
            <section class="space-y-3">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <IdCard class="text-brand-600" :size="18" />
                <span>Giấy tờ xác minh</span>
              </h3>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div v-for="side in sides" :key="side.type" class="space-y-1.5">
                  <div class="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                    <CreditCard class="text-brand-600" :size="14" />
                    <span>{{ side.label }}</span>
                  </div>

                  <div class="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-100 transition-all hover:border-brand-400 hover:shadow-xs">
                    <template v-if="side.doc">
                      <div v-if="images[side.doc.id]?.loading" class="flex h-full w-full items-center justify-center">
                        <Loader2 class="animate-spin text-brand-500" :size="20" />
                      </div>
                      <a
                        v-else-if="images[side.doc.id]?.url"
                        :href="images[side.doc.id]?.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block h-full w-full"
                        :title="`Mở ${side.label.toLowerCase()} cỡ lớn`"
                      >
                        <img
                          :src="images[side.doc.id]?.url"
                          :alt="side.label"
                          class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div class="absolute inset-0 bg-ink-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Maximize2 class="text-white drop-shadow-sm" :size="20" />
                        </div>
                      </a>
                      <button
                        v-else
                        type="button"
                        class="flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-medium text-brand-700 hover:underline cursor-pointer"
                        @click="loadImage(verification.id, side.doc.id)"
                      >
                        <ImageIcon :size="22" class="text-ink-400" />
                        <span>Chưa mở được ảnh, thử lại</span>
                      </button>
                    </template>
                    <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                      <ImageIcon :size="22" class="text-ink-300" />
                      <span class="text-2xs">Chưa có ảnh</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 3. Lý do từ chối (Chỉ hiện khi trạng thái là REJECTED) -->
            <section v-if="isRejected(verification.status)" class="space-y-2.5">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-danger-700">
                <XCircle class="text-danger-600" :size="18" />
                <span>Lý do từ chối</span>
              </h3>

              <div class="rounded-2xl border border-danger-200/80 bg-danger-50/70 p-4">
                <p class="text-sm font-medium text-danger-900 leading-relaxed break-words whitespace-pre-wrap">
                  {{ verification.rejectionReason || 'Chưa có thông tin lý do từ chối.' }}
                </p>
              </div>
            </section>
          </div>

          <!-- Footer -->
          <footer class="flex items-center justify-between gap-3 border-t border-ink-100 bg-white px-6 py-4 shrink-0">
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center rounded-xl border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
              @click="emit('close')"
            >
              Đóng
            </button>

            <!-- Action buttons when status is PENDING -->
            <div v-if="canDecide && isPending(verification.status)" class="flex items-center gap-2.5">
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-danger-200 bg-danger-50 px-3.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-100 hover:border-danger-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 disabled:opacity-50 cursor-pointer"
                :disabled="busy"
                data-testid="cv-drawer-reject"
                @click="emit('reject', verification)"
              >
                <XCircle :size="15" />
                <span>Từ chối</span>
              </button>

              <button
                type="button"
                class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 cursor-pointer"
                :disabled="busy"
                data-testid="cv-drawer-approve"
                @click="emit('approve', verification)"
              >
                <Loader2 v-if="busy" class="animate-spin" :size="15" />
                <CheckCircle2 v-else :size="15" />
                <span>Duyệt hồ sơ</span>
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
