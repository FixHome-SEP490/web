<script setup lang="ts">
// Customer identity check (PO 14/10/2026), needed once before the first
// withdrawal: both sides of the citizen ID card and the details as printed on
// it. No face photo or video. Pending: wait; rejected: the reason and the form
// again; verified: never asked again.
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { AlertCircle, Camera, CheckCircle2, ShieldCheck } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import {
  CUSTOMER_KYC_MAX_FILE_SIZE,
  CUSTOMER_KYC_MIME_TYPES,
  customerVerificationApi,
  type CustomerGender,
  type CustomerKycDocumentType,
  type CustomerKycMimeType,
  type CustomerKycState,
  type SubmitCustomerKycDocument,
} from '../../api/customer-verification.api';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import {
  validateAddressText,
  validateBirthDate,
  validateCitizenId,
  validateFullName,
} from '../../utils/input-validation';
import { formatDayKey } from '../../utils/formatters';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString, vnDayKey } from '../../utils/vn-time';

const WALLET_LINK = '/app/wallet?action=withdraw';

const identity = useCachedQuery({ key: queryKeys.identity.customer, fetch: () => customerVerificationApi.getMine() });
const state = computed<CustomerKycState | null>(() => identity.data.value ?? null);
const loadError = computed(() =>
  identity.error.value ? userFacingError(identity.error.value, 'Chưa tải được trạng thái xác minh, vui lòng thử lại.') : '',
);
const cache = useCacheUpdates();

const showForm = computed(() => state.value?.status === 'none' || state.value?.status === 'rejected');

// ---- Form ------------------------------------------------------------------
const form = reactive({ fullName: '', dateOfBirth: '', gender: '' as CustomerGender | '', citizenIdNumber: '', address: '' });
const errors = ref<Record<string, string>>({});
const submitError = ref('');
const submitting = ref(false);
const justSubmitted = ref(false);

const isGender = (value: unknown): value is CustomerGender => value === 'male' || value === 'female' || value === 'other';

// Prefill once from what the profile and the last submission already hold.
let prefilled = false;
watch(
  state,
  (value) => {
    if (!value || prefilled) return;
    prefilled = true;
    const last = value.verification;
    form.fullName = value.profile.fullName || last?.fullName || '';
    form.dateOfBirth = (value.profile.dateOfBirth || last?.dateOfBirth || '').slice(0, 10);
    const gender = value.profile.gender ?? last?.gender;
    form.gender = isGender(gender) ? gender : '';
    form.citizenIdNumber = value.profile.citizenIdNumber || last?.citizenIdNumber || '';
    form.address = value.profile.address || last?.address || '';
  },
  { immediate: true },
);

/** Today in Vietnam: a birth date cannot be later. */
const todayKey = vnDayKey();

// ---- Two photos of the card --------------------------------------------------
interface Side {
  key: 'front' | 'back';
  documentType: CustomerKycDocumentType;
  label: string;
  file: File | null;
  previewUrl: string;
  error: string;
}
const sides = reactive<Side[]>([
  { key: 'front', documentType: 'citizen_id_front', label: 'Mặt trước CCCD', file: null, previewUrl: '', error: '' },
  { key: 'back', documentType: 'citizen_id_back', label: 'Mặt sau CCCD', file: null, previewUrl: '', error: '' },
]);
const EXTENSIONS: Record<CustomerKycMimeType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FILE_NAMES: Record<Side['key'], string> = { front: 'cccd-mat-truoc', back: 'cccd-mat-sau' };

function previewOf(file: File): string {
  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}
function releasePreview(side: Side) {
  if (side.previewUrl) {
    try {
      URL.revokeObjectURL(side.previewUrl);
    } catch {
      // Nothing to release.
    }
  }
  side.previewUrl = '';
}

/** Checks a picked photo; returns the reason it cannot be used, or ''. */
function checkPhoto(file: File): string {
  if (!CUSTOMER_KYC_MIME_TYPES.includes(file.type as CustomerKycMimeType)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (file.size <= 0) return 'Ảnh bị lỗi, vui lòng chọn ảnh khác.';
  if (file.size > CUSTOMER_KYC_MAX_FILE_SIZE) return 'Ảnh lớn hơn 10 MB, vui lòng chọn ảnh khác.';
  return '';
}

function onPick(side: Side, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const problem = checkPhoto(file);
  if (problem) {
    side.error = problem;
    return;
  }
  releasePreview(side);
  side.file = file;
  side.previewUrl = previewOf(file);
  side.error = '';
}

onBeforeUnmount(() => sides.forEach(releasePreview));

function validate(): boolean {
  const next: Record<string, string> = {};
  const name = validateFullName(form.fullName);
  if (name) next.fullName = name;
  const dob = validateBirthDate(form.dateOfBirth, 18);
  if (dob) next.dateOfBirth = dob;
  if (!isGender(form.gender)) next.gender = 'Vui lòng chọn giới tính';
  const id = validateCitizenId(form.citizenIdNumber);
  if (id) next.citizenIdNumber = id;
  const address = validateAddressText(form.address);
  if (address) next.address = address;
  for (const side of sides) {
    if (!side.file) side.error = `Vui lòng chọn ảnh ${side.label.toLowerCase()}.`;
  }
  errors.value = next;
  return Object.keys(next).length === 0 && sides.every((side) => side.file && !side.error);
}

async function uploadSide(side: Side): Promise<SubmitCustomerKycDocument> {
  const file = side.file as File;
  const mimeType = file.type as CustomerKycMimeType;
  const slot = await customerVerificationApi.requestUploadUrl(mimeType);
  await customerVerificationApi.uploadToSignedUrl(slot.uploadUrl, mimeType, file);
  return {
    documentType: side.documentType,
    storageObjectPath: slot.storageObjectPath,
    fileName: `${FILE_NAMES[side.key]}.${EXTENSIONS[mimeType]}`,
    fileSize: file.size,
    mimeType,
  };
}

async function submit() {
  if (submitting.value) return;
  submitError.value = '';
  if (!validate()) return;
  submitting.value = true;
  try {
    // One side after the other: each gets its own private upload address.
    const documents: SubmitCustomerKycDocument[] = [];
    for (const side of sides) documents.push(await uploadSide(side));
    const result = await customerVerificationApi.submit({
      fullName: form.fullName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender as CustomerGender,
      citizenIdNumber: form.citizenIdNumber.trim(),
      address: form.address.trim(),
      documents,
    });
    identity.setData(result);
    // The wallet decides the next withdrawal step from this status.
    cache.markChanged([queryKeys.wallet.all]);
    justSubmitted.value = true;
    sides.forEach((side) => {
      releasePreview(side);
      side.file = null;
    });
  } catch (err) {
    submitError.value = userFacingError(err, 'Chưa gửi được hồ sơ xác minh, vui lòng thử lại.');
  } finally {
    submitting.value = false;
  }
}

const fieldClass =
  'w-full h-11 rounded-xl border border-ink-200 bg-white px-3 text-base sm:text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-5 pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight text-balance">Xác minh danh tính</h1>

    <!-- Loading: the shape of the status block -->
    <section v-if="identity.loading.value" class="rounded-2xl border border-ink-200 bg-white p-5 space-y-3" aria-busy="true" aria-label="Đang tải trạng thái xác minh">
      <FhSkeleton width="55%" height="20px" />
      <FhSkeleton height="14px" :count="3" />
    </section>

    <section v-else-if="loadError && !state" class="rounded-2xl border border-ink-200 bg-white p-5 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-ink-700">{{ loadError }}</p>
      <FhButton variant="secondary" size="sm" @click="identity.refetch()">Thử lại</FhButton>
    </section>

    <template v-else-if="state">
      <!-- Verified: never asked again -->
      <section v-if="state.status === 'verified'" class="rounded-2xl border border-ink-200 bg-white p-5 space-y-4" data-testid="kyc-verified">
        <div class="flex items-start gap-3">
          <ShieldCheck :size="22" class="text-success-600 shrink-0 mt-0.5" />
          <div class="min-w-0 space-y-1">
            <h2 class="text-lg font-semibold text-ink-900">Đã xác minh danh tính</h2>
            <p class="text-sm text-ink-600 text-pretty">Bạn có thể rút tiền trong ví về tài khoản ngân hàng đứng tên mình.</p>
          </div>
        </div>
        <dl class="divide-y divide-ink-100 text-sm border-t border-ink-100">
          <div class="flex items-center justify-between gap-3 py-2.5">
            <dt class="text-ink-500">Họ và tên</dt>
            <dd class="font-medium text-ink-900 text-right">{{ state.verification?.verifiedFullName || state.verification?.fullName || state.profile.fullName }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3 py-2.5">
            <dt class="text-ink-500">Ngày sinh</dt>
            <dd class="font-medium text-ink-900 font-num whitespace-nowrap">{{ formatDayKey(state.verification?.dateOfBirth || state.profile.dateOfBirth) }}</dd>
          </div>
        </dl>
        <router-link :to="WALLET_LINK" class="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white whitespace-nowrap hover:bg-brand-700">Về ví để rút tiền</router-link>
      </section>

      <!-- Pending: wait for FixHome -->
      <section v-else-if="state.status === 'pending'" class="rounded-2xl border border-ink-200 bg-white p-5 space-y-4" data-testid="kyc-pending">
        <p v-if="justSubmitted" role="status" class="rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800 flex items-start gap-2">
          <CheckCircle2 :size="16" class="shrink-0 mt-0.5" /> <span class="text-pretty">Đã gửi hồ sơ xác minh.</span>
        </p>
        <p class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 text-pretty">
          Hồ sơ xác minh đang chờ duyệt. Bạn sẽ nhận thông báo khi FixHome duyệt xong, sau đó rút được tiền.
        </p>
        <dl v-if="state.verification" class="divide-y divide-ink-100 text-sm">
          <div class="flex items-center justify-between gap-3 py-2.5">
            <dt class="text-ink-500">Họ và tên</dt>
            <dd class="font-medium text-ink-900 text-right">{{ state.verification.fullName }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3 py-2.5">
            <dt class="text-ink-500">Số CCCD</dt>
            <dd class="font-medium text-ink-900 font-num whitespace-nowrap">{{ state.verification.citizenIdNumber }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3 py-2.5">
            <dt class="text-ink-500">Đã gửi lúc</dt>
            <dd class="font-medium text-ink-900 font-num whitespace-nowrap">{{ vnDateTimeString(state.verification.submittedAt) }}</dd>
          </div>
        </dl>
        <router-link :to="WALLET_LINK" class="inline-flex h-10 items-center rounded-xl border border-ink-200 px-4 text-sm font-semibold text-ink-800 whitespace-nowrap hover:bg-ink-50">Về ví của tôi</router-link>
      </section>

      <!-- Rejected: why, then the form again -->
      <div v-if="state.status === 'rejected'" role="alert" data-testid="kyc-rejected" class="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800 flex items-start gap-3">
        <AlertCircle :size="18" class="shrink-0 mt-0.5 text-danger-600" />
        <div class="min-w-0 space-y-0.5">
          <p class="font-semibold">Hồ sơ xác minh chưa được duyệt</p>
          <p class="text-pretty">{{ state.rejectionReason || 'Ảnh hoặc thông tin chưa đúng. Vui lòng gửi lại.' }}</p>
        </div>
      </div>

      <form v-if="showForm" class="rounded-2xl border border-ink-200 bg-white p-5 space-y-5" data-testid="kyc-form" novalidate @submit.prevent="submit">
        <p class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 text-pretty">
          Cần một lần trước khi rút tiền lần đầu. Thông tin phải giống trên CCCD; sau khi được duyệt, họ tên và ngày sinh không đổi được nữa.
        </p>

        <div class="space-y-4 text-sm">
          <div class="space-y-1.5">
            <label for="kyc-fullname" class="block font-medium text-ink-700">Họ và tên</label>
            <input id="kyc-fullname" v-model="form.fullName" type="text" maxlength="200" autocomplete="name" data-testid="kyc-fullname" :class="fieldClass" />
            <p v-if="errors.fullName" class="text-sm text-danger-600" data-testid="kyc-error-fullName">{{ errors.fullName }}</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5 min-w-0">
              <label for="kyc-dob" class="block font-medium text-ink-700">Ngày sinh</label>
              <input id="kyc-dob" v-model="form.dateOfBirth" type="date" :max="todayKey" data-testid="kyc-dob" :class="fieldClass" />
              <p v-if="errors.dateOfBirth" class="text-sm text-danger-600" data-testid="kyc-error-dateOfBirth">{{ errors.dateOfBirth }}</p>
            </div>
            <div class="space-y-1.5 min-w-0">
              <label for="kyc-gender" class="block font-medium text-ink-700">Giới tính</label>
              <select id="kyc-gender" v-model="form.gender" data-testid="kyc-gender" :class="fieldClass">
                <option value="" disabled>Chọn giới tính</option>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
              <p v-if="errors.gender" class="text-sm text-danger-600" data-testid="kyc-error-gender">{{ errors.gender }}</p>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="kyc-cccd" class="block font-medium text-ink-700">Số CCCD</label>
            <input id="kyc-cccd" v-model="form.citizenIdNumber" type="text" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="12 chữ số" data-testid="kyc-cccd" :class="[fieldClass, 'font-num']" />
            <p v-if="errors.citizenIdNumber" class="text-sm text-danger-600" data-testid="kyc-error-citizenIdNumber">{{ errors.citizenIdNumber }}</p>
          </div>

          <div class="space-y-1.5">
            <label for="kyc-address" class="block font-medium text-ink-700">Nơi thường trú</label>
            <textarea id="kyc-address" v-model="form.address" rows="2" maxlength="500" data-testid="kyc-address" class="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-base sm:text-sm text-ink-900 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"></textarea>
            <p v-if="errors.address" class="text-sm text-danger-600" data-testid="kyc-error-address">{{ errors.address }}</p>
          </div>
        </div>

        <!-- Both sides of the card -->
        <div class="grid grid-cols-2 gap-3">
          <div v-for="side in sides" :key="side.key" class="min-w-0 space-y-1.5">
            <label
              class="relative flex aspect-[1.6/1] w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-ink-500 transition-colors focus-within:ring-2 focus-within:ring-brand-500"
              :class="side.file ? 'border-success-500 bg-success-50/50' : 'border-ink-300 hover:border-brand-500'"
            >
              <img v-if="side.previewUrl" :src="side.previewUrl" alt="" class="absolute inset-0 h-full w-full object-cover" />
              <template v-else>
                <Camera :size="22" aria-hidden="true" />
                <span class="text-sm font-medium whitespace-nowrap">{{ side.file ? 'Đã chọn ảnh' : 'Chọn ảnh' }}</span>
              </template>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="sr-only"
                :aria-label="side.label"
                :data-testid="`kyc-${side.key}-input`"
                @change="onPick(side, $event)"
              />
            </label>
            <p class="text-sm font-semibold text-ink-800 text-center whitespace-nowrap">{{ side.label }}</p>
            <p v-if="side.error" class="text-sm text-danger-600 text-pretty" :data-testid="`kyc-error-${side.key}`">{{ side.error }}</p>
          </div>
        </div>
        <p class="text-sm text-ink-500 text-pretty">Ảnh JPG, PNG hoặc WebP, tối đa 10 MB, chụp rõ cả bốn góc thẻ.</p>

        <p v-if="submitError" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800 text-pretty" data-testid="kyc-submit-error">{{ submitError }}</p>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <router-link :to="WALLET_LINK" class="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink-700 whitespace-nowrap hover:bg-ink-100">Để sau</router-link>
          <FhButton type="submit" size="md" :loading="submitting" data-testid="kyc-submit">Gửi hồ sơ xác minh</FhButton>
        </div>
      </form>
    </template>
  </div>
</template>
