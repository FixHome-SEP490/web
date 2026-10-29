<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, ImagePlus, Trash2, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import CameraCapture from './CameraCapture.vue';
import { CannotContinueError, uploadCannotContinueEvidence, type CannotContinuePort, type CannotContinueReasonCode, type CustomerContinuation } from '../../api/platform-continuation.api';
import type { TechnicianReportReasonClass } from '../../api/support-cases.api';
import { ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../../api/media.api';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{
  orderId: string; bookingId: string; visitGroupId: string | null; allowed: boolean;
  parts: Array<{ id: string; label: string }>; partsKnown: boolean; port: CannotContinuePort;
}>();
const emit = defineEmits<{ close: []; parts: []; recorded: [result: CustomerContinuation] }>();
const pending = props.port.pending(props.orderId);
const reasonClass = ref<TechnicianReportReasonClass>(pending?.reasonClass ?? 'technician_skill_gap');
const reasonCode = ref<CannotContinueReasonCode>(pending?.reasonCode ?? 'skill_gap');
const reason = ref(pending?.reason ?? '');
const confirmedIntent = ref(!!pending);
const locked = ref(!!pending);
const retryAllowed = ref(true);
const busy = ref(false);
const uploading = ref(false);
const error = ref('');
const camera = ref(false);
const dialog = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const cameraButton = ref<InstanceType<typeof FhButton> | null>(null);
const photos = ref<Array<{ file: File; url: string; evidenceId: string | null; error: string }>>([]);
const restoredIds = pending?.photoEvidenceIds ?? [];
const options: { value: CannotContinueReasonCode; label: string }[] = [
  { value: 'device_too_old', label: 'Thiết bị đã quá cũ' },
  { value: 'severe_damage', label: 'Thiết bị hư hỏng nặng' },
  { value: 'no_compatible_part', label: 'Không có linh kiện phù hợp' },
  { value: 'manufacturer_warranty_or_workshop', label: 'Cần trung tâm hoặc bảo hành hãng' },
  { value: 'dispute_or_other', label: 'Tranh chấp hoặc tình huống khác' },
];
const ready = computed(() => props.allowed && retryAllowed.value && !busy.value && !uploading.value
  && confirmedIntent.value && reason.value.trim().length >= 10 && reason.value.trim().length <= 2000
  && photos.value.every(photo => !!photo.evidenceId));
let disposed = false;
const sourceOrderId = props.orderId;
const current = () => !disposed && sourceOrderId === props.orderId && props.allowed;
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';
function close() { if (!busy.value && !uploading.value) emit('close'); }
function changeClass() { reasonCode.value = reasonClass.value === 'technician_skill_gap' ? 'skill_gap' : 'dispute_or_other'; }
function keydown(event: KeyboardEvent) {
  if (camera.value) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); }
  if (event.key !== 'Tab') return;
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type=file]), textarea:not(:disabled), select:not(:disabled)') ?? [])];
  const first = controls[0]; const last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
  await nextTick(); if (!disposed) dialog.value?.focus();
});
onBeforeUnmount(() => {
  disposed = true; photos.value.forEach(photo => URL.revokeObjectURL(photo.url));
  document.body.style.overflow = previousOverflow; previousFocus?.focus();
});
async function upload(photo: typeof photos.value[number]) {
  photo.error = '';
  try {
    const data = await uploadCannotContinueEvidence(sourceOrderId, photo.file);
    if (current()) photo.evidenceId = data.evidenceId;
  } catch (err) { if (current()) photo.error = userFacingError(err, 'Chưa tải được ảnh. Thử lại hoặc xóa ảnh này.'); }
}
async function addFiles(files: File[]) {
  camera.value = false;
  if (!current() || locked.value || busy.value || uploading.value) return;
  error.value = '';
  if (photos.value.length + files.length > 3) { error.value = 'Chọn tối đa 3 ảnh chứng cứ.'; return; }
  if (files.some(file => !ALLOWED_MEDIA_MIME_TYPES.includes(file.type) || file.size > MAX_MEDIA_SIZE_BYTES)) {
    error.value = 'Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.'; return;
  }
  uploading.value = true;
  const offset = photos.value.length;
  photos.value.push(...files.map(file => ({ file, url: URL.createObjectURL(file), evidenceId: null, error: '' })));
  await Promise.all(photos.value.slice(offset).map(upload));
  if (current()) uploading.value = false;
}
function filesChanged(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])]; input.value = ''; void addFiles(files);
}
async function retryPhoto(index: number) {
  const photo = photos.value[index];
  if (!photo || locked.value || busy.value || uploading.value || !current()) return;
  uploading.value = true; await upload(photo); if (current()) uploading.value = false;
}
function removePhoto(index: number) {
  if (locked.value || busy.value || uploading.value) return;
  const [photo] = photos.value.splice(index, 1); if (photo) URL.revokeObjectURL(photo.url);
}
async function closeCamera() { camera.value = false; await nextTick(); if (current()) cameraButton.value?.$el.focus(); }
async function submit() {
  if (!ready.value) return;
  busy.value = true; error.value = '';
  try {
    const result = await props.port.send(sourceOrderId, props.bookingId, props.visitGroupId, {
      reasonClass: reasonClass.value, reasonCode: reasonCode.value, reason: reason.value,
      photoEvidenceIds: [...restoredIds, ...photos.value.map(photo => photo.evidenceId!)],
    });
    if (current()) emit('recorded', result);
  } catch (err) {
    if (current()) {
      locked.value = !(err instanceof CannotContinueError) || err.locked;
      retryAllowed.value = !(err instanceof CannotContinueError) || err.uncertain || !err.locked;
      error.value = userFacingError(err, 'Chưa xác nhận được kết quả. Vui lòng thử lại cùng nội dung.');
    }
  } finally { if (current()) busy.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 sm:items-center sm:p-4" @click.self="close" @keydown="keydown">
      <section ref="dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="cannot-continue-title" aria-describedby="cannot-continue-hint" :aria-busy="busy || uploading" class="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-ink-700 shadow-(--shadow-e3) outline-none sm:rounded-2xl sm:p-6" data-testid="cannot-continue-dialog">
        <header class="flex items-start justify-between gap-2">
          <h2 id="cannot-continue-title" class="text-lg font-semibold text-ink-900">Không thể tiếp tục công việc</h2>
          <button type="button" :disabled="busy || uploading" aria-label="Đóng" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-600" @click="close"><X :size="20" /></button>
        </header>
        <p id="cannot-continue-hint">Gửi ý định dừng vì bạn không thể tiếp tục. Ghi nhận này chưa đồng nghĩa đơn đã hủy. Báo giá, tiền và nghĩa vụ linh kiện cũ được giữ để đối soát; không tự hoàn tiền.</p>
        <p>Chỉ cần hỗ trợ và vẫn tiếp tục được: dùng “Báo cáo hỗ trợ”. Thiết bị thực sự không thể sửa: dùng “Không sửa được máy này”.</p>
        <fieldset :disabled="locked || busy" class="space-y-3">
          <label class="block space-y-1"><span class="font-medium">Nhóm lý do</span><select v-model="reasonClass" class="min-h-11 w-full rounded-xl border border-ink-300 bg-white px-3 focus:ring-2 focus:ring-brand-600" @change="changeClass"><option value="technician_skill_gap">Thiếu kỹ năng hoặc lỗi thao tác</option><option value="non_technician_exception">Ngoại lệ khác</option></select></label>
          <label v-if="reasonClass === 'non_technician_exception'" class="block space-y-1"><span class="font-medium">Lý do</span><select v-model="reasonCode" class="min-h-11 w-full rounded-xl border border-ink-300 bg-white px-3 focus:ring-2 focus:ring-brand-600"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label class="block space-y-1"><span class="font-medium">Mô tả tình huống (bắt buộc)</span><textarea v-model="reason" :disabled="locked || busy" rows="3" maxlength="2000" aria-required="true" aria-describedby="cannot-continue-reason-hint" class="w-full rounded-xl border border-ink-300 px-3 py-2 focus:ring-2 focus:ring-brand-600" /><span id="cannot-continue-reason-hint" class="block text-xs text-ink-600">10–2.000 ký tự</span></label>
        </fieldset>
        <fieldset :disabled="locked || busy || uploading" class="space-y-2">
          <legend class="font-medium">Ảnh chứng cứ (không bắt buộc, tối đa 3)</legend>
          <p>Ảnh riêng tư của đơn này, chỉ người có quyền mới xem được.</p>
          <p v-if="restoredIds.length">Đã giữ {{ restoredIds.length }} ảnh chứng cứ cho lần thử lại.</p>
          <div class="flex flex-wrap gap-2"><FhButton ref="cameraButton" variant="secondary" size="md" :disabled="locked || busy || uploading || photos.length >= 3" @click="camera = true"><Camera :size="18" />Chụp ảnh</FhButton><FhButton variant="secondary" size="md" :disabled="locked || busy || uploading || photos.length >= 3" @click="fileInput?.click()"><ImagePlus :size="18" />Tải ảnh</FhButton></div>
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" aria-label="Chọn ảnh chứng cứ" :disabled="locked || busy || uploading" @change="filesChanged" />
          <p v-if="uploading" role="status">Đang tải ảnh…</p>
          <ul v-if="photos.length" class="grid grid-cols-3 gap-2"><li v-for="(photo, index) in photos" :key="photo.url" class="min-w-0"><img :src="photo.url" :alt="`Ảnh chứng cứ ${index + 1}`" class="aspect-square w-full rounded-xl object-cover" /><button type="button" :disabled="locked || busy || uploading" :aria-label="`Xóa ảnh ${index + 1}`" class="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg focus-visible:ring-2 focus-visible:ring-brand-600" @click="removePhoto(index)"><Trash2 :size="16" />Xóa</button><p v-if="photo.error" role="alert" class="break-words text-danger-700">{{ photo.error }}</p><FhButton v-if="photo.error" variant="secondary" size="md" :disabled="locked || busy || uploading" @click="retryPhoto(index)">Thử lại ảnh</FhButton></li></ul>
        </fieldset>
        <div v-if="parts.length || !partsKnown" class="space-y-2 rounded-xl bg-warning-50 p-3 text-warning-800">
          <p v-if="!partsKnown">Chưa kiểm tra đủ linh kiện; không thể kết luận đã trả hết.</p>
          <p v-if="parts.length">Linh kiện FixHome đã nhận: {{ parts.map(part => part.label).join('; ') }}.</p>
          <p>Ghi nhận số thực dùng và khai số thực trả ở phần Linh kiện. Quản lý dịch vụ phải kiểm đếm và nhận thực tế; gửi yêu cầu này không xác nhận kho đã nhận.</p>
          <FhButton variant="secondary" size="md" :disabled="busy || uploading" data-testid="cannot-continue-parts" @click="emit('parts')">Mở phần linh kiện</FhButton>
        </div>
        <label class="flex min-h-11 cursor-pointer items-start gap-3"><input v-model="confirmedIntent" type="checkbox" :disabled="locked || busy" class="mt-1 h-4 w-4 shrink-0 accent-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600" data-testid="cannot-continue-confirm-intent" /><span>Tôi xác nhận không thể tiếp tục, không chỉ yêu cầu hỗ trợ.</span></label>
        <p v-if="error" role="alert" class="text-danger-700">{{ error }}</p>
        <footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><FhButton variant="secondary" size="md" :disabled="busy || uploading" @click="close">Quay lại</FhButton><FhButton variant="danger" size="md" :disabled="!ready" :loading="busy" data-testid="cannot-continue-submit" @click="submit">{{ locked ? 'Thử lại cùng nội dung' : 'Xác nhận không thể tiếp tục' }}</FhButton></footer>
      </section>
    </div>
    <CameraCapture v-if="camera" mode="product" title="Chụp ảnh chứng cứ" multiple :max-shots="3 - photos.length" @capture="files => addFiles(Array.isArray(files) ? files : [files])" @close="closeCamera" />
  </Teleport>
</template>
