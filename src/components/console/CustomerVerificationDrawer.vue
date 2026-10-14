<script setup lang="ts">
// One customer's identity check for the admin (PO 14/10/2026): the details the
// customer confirmed as on the card, both sides of the card (short-lived
// signed links) and, while pending, Approve or Reject.
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhSkeleton from '../FhSkeleton.vue';
import FhStatusPill from '../FhStatusPill.vue';
import { adminCustomerVerificationsApi } from '../../api/admin-customer-verifications.api';
import { genderLabels, type CustomerGender, type CustomerVerification } from '../../api/customer-verification.api';
import { formatDayKey } from '../../utils/formatters';
import { vnDateTimeString } from '../../utils/vn-time';
import { verificationStatusPill } from './customer-verification-labels';

const props = defineProps<{ verification: CustomerVerification | null; busy?: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'approve', verification: CustomerVerification): void;
  (e: 'reject', verification: CustomerVerification): void;
}>();

const SIDES = [
  { type: 'citizen_id_front', label: 'Mặt trước CCCD' },
  { type: 'citizen_id_back', label: 'Mặt sau CCCD' },
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
const genderText = (value: string) => genderLabels[value as CustomerGender] ?? '—';
</script>

<template>
  <Teleport to="body">
    <div v-if="verification" class="fixed inset-0 z-50 flex justify-end" @keydown.esc="emit('close')">
      <div class="absolute inset-0 bg-ink-900/50" aria-hidden="true" @click="emit('close')"></div>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-drawer-title"
        class="relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
        data-testid="customer-verification-drawer"
      >
        <header class="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div class="min-w-0">
            <h2 id="cv-drawer-title" class="text-lg font-bold text-ink-900">Xác minh danh tính khách hàng</h2>
            <p class="flex flex-wrap items-center gap-2 text-sm text-ink-500">
              <span class="truncate">{{ verification.customer?.fullName || verification.fullName }}</span>
              <FhStatusPill :status="pill.status" :label="pill.label" />
            </p>
          </div>
          <button type="button" class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Đóng" @click="emit('close')">
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <p v-if="verification.status === 'rejected' && verification.rejectionReason" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-800">
            Lý do từ chối: {{ verification.rejectionReason }}
          </p>

          <section class="space-y-2">
            <h3 class="font-semibold text-ink-900">Thông tin trên CCCD</h3>
            <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200">
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Họ và tên</dt><dd class="text-right font-medium text-ink-900">{{ verification.fullName }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Ngày sinh</dt><dd class="font-num font-medium text-ink-900">{{ formatDayKey(verification.dateOfBirth) }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Giới tính</dt><dd class="font-medium text-ink-900">{{ genderText(verification.gender) }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Số CCCD</dt><dd class="font-num font-medium text-ink-900">{{ verification.citizenIdNumber }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="shrink-0 text-ink-500">Nơi thường trú</dt><dd class="text-right font-medium text-ink-900">{{ verification.address }}</dd></div>
            </dl>
          </section>

          <section class="space-y-2">
            <h3 class="font-semibold text-ink-900">Ảnh CCCD</h3>
            <div class="grid grid-cols-2 gap-3">
              <figure v-for="side in sides" :key="side.type" class="min-w-0 space-y-1">
                <div class="flex aspect-[1.6/1] items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50">
                  <template v-if="side.doc">
                    <FhSkeleton v-if="images[side.doc.id]?.loading" height="100%" rounded="md" />
                    <a v-else-if="images[side.doc.id]?.url" :href="images[side.doc.id]?.url" target="_blank" rel="noopener noreferrer" class="block h-full w-full" :title="`Mở ${side.label.toLowerCase()} cỡ lớn`">
                      <img :src="images[side.doc.id]?.url" :alt="side.label" class="h-full w-full object-contain" />
                    </a>
                    <button v-else type="button" class="text-sm font-medium text-brand-700 hover:underline" @click="loadImage(verification.id, side.doc.id)">Chưa mở được ảnh, thử lại</button>
                  </template>
                  <span v-else class="text-ink-400">Chưa có ảnh</span>
                </div>
                <figcaption class="text-center text-ink-600">{{ side.label }}</figcaption>
              </figure>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="font-semibold text-ink-900">Tài khoản</h3>
            <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200">
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Tên trên tài khoản</dt><dd class="text-right font-medium text-ink-900">{{ verification.customer?.fullName || '—' }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Email</dt><dd class="break-all text-right font-medium text-ink-900">{{ verification.customer?.email || '—' }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Số điện thoại</dt><dd class="font-num font-medium text-ink-900">{{ verification.customer?.phoneNumber || '—' }}</dd></div>
              <div class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-500">Ngày gửi</dt><dd class="font-num font-medium text-ink-900">{{ vnDateTimeString(verification.submittedAt) }}</dd></div>
              <div v-if="verification.reviewedAt" class="flex justify-between gap-3 px-3 py-2">
                <dt class="text-ink-500">Người duyệt</dt>
                <dd class="text-right font-medium text-ink-900">{{ verification.reviewedBy?.fullName || '—' }} · <span class="font-num whitespace-nowrap">{{ vnDateTimeString(verification.reviewedAt) }}</span></dd>
              </div>
            </dl>
          </section>
        </div>

        <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
          <FhButton variant="secondary" size="sm" @click="emit('close')">Đóng</FhButton>
          <template v-if="verification.status === 'pending'">
            <FhButton variant="danger" size="sm" :disabled="busy" data-testid="cv-drawer-reject" @click="emit('reject', verification)">Từ chối</FhButton>
            <FhButton size="sm" :loading="busy" data-testid="cv-drawer-approve" @click="emit('approve', verification)">Duyệt hồ sơ</FhButton>
          </template>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
