<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, ImagePlus, Trash2, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import CameraCapture from './CameraCapture.vue';
import { blockedFailedRepair, failedRepairKey, FAILED_REPAIR_UNAVAILABLE } from '../../api/failed-repair.api';
import { FailedRepairReportError } from '../../api/technician-failed-repair.api';
import { REPAIR_FAILURE_REASONS, type RepairFailureReason } from '../../api/visit-groups.api';
import { ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../../api/media.api';
import { userFacingError } from '../../utils/user-facing-error';

const props = defineProps<{ orderId: string; parts: Array<{ id: string; label: string }>; partsReady: boolean }>();
const emit = defineEmits<{ close: []; reported: [] }>();
const api = inject(failedRepairKey, blockedFailedRepair);
const reason = ref<RepairFailureReason | ''>('');
const note = ref('');
const dispositions = ref<Record<string, 'installed' | 'returned' | ''>>({});
const photos = ref<Array<{ id: number; file: File; url: string; evidenceId: string | null; error: string }>>([]);
const busy = ref(false);
const uploading = ref(false);
const uncertain = ref(false);
const canReconcile = ref(false);
const error = ref('');
const camera = ref(false);
const cameraButton = ref<InstanceType<typeof FhButton> | null>(null);
const input = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
let nextId = 0;
let disposed = false;
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';
const ready = computed(() => api.available && props.partsReady && !!reason.value && !busy.value && !uploading.value && !uncertain.value
  && props.parts.every(part => !!dispositions.value[part.id]) && photos.value.every(photo => !!photo.evidenceId));

function close() { if (!busy.value && !uploading.value) emit('close'); }
async function closeCamera() {
  camera.value = false;
  await nextTick();
  if (!disposed) cameraButton.value?.$el.focus();
}
function keydown(event: KeyboardEvent) {
  if (camera.value) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); }
  if (event.key !== 'Tab') return;
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') ?? []).filter(el => el.getAttribute('type') !== 'file');
  const first = elements[0]; const last = elements.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  await nextTick(); dialog.value?.focus();
});
onBeforeUnmount(() => {
  disposed = true;
  photos.value.forEach(photo => URL.revokeObjectURL(photo.url));
  document.body.style.overflow = previousOverflow;
  previousFocus?.focus();
});
async function upload(photo: typeof photos.value[number]) {
  photo.error = '';
  try {
    const result = await api.uploadEvidence(props.orderId, photo.file);
    if (!result.evidenceId?.trim()) throw new Error('Invalid private upload');
    if (!disposed && photos.value.includes(photo)) photo.evidenceId = result.evidenceId;
  } catch (err) {
    if (!disposed) photo.error = userFacingError(err, 'Chưa tải được ảnh. Thử lại hoặc xóa ảnh này.');
  }
}
async function addFiles(files: File[]) {
  camera.value = false;
  if (!api.evidenceAvailable || uploading.value || busy.value || uncertain.value) return;
  error.value = '';
  if (photos.value.length + files.length > 3) { error.value = 'Tối đa 3 ảnh. Hãy chọn lại hoặc xóa bớt ảnh.'; return; }
  if (files.some(file => !ALLOWED_MEDIA_MIME_TYPES.includes(file.type) || file.size > MAX_MEDIA_SIZE_BYTES)) {
    error.value = 'Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.'; return;
  }
  uploading.value = true;
  const added = files.map(file => ({ id: nextId++, file, url: URL.createObjectURL(file), evidenceId: null as string | null, error: '' }));
  photos.value.push(...added);
  // Upload the reactive entries so previews/error/retry state updates together.
  await Promise.all(photos.value.filter(photo => added.some(item => item.id === photo.id)).map(upload));
  if (!disposed) uploading.value = false;
}
async function retry(id: number) {
  if (uploading.value || busy.value || uncertain.value) return;
  const photo = photos.value.find(item => item.id === id);
  if (!photo) return;
  uploading.value = true;
  await upload(photo);
  if (!disposed) uploading.value = false;
}
function remove(id: number) {
  if (uploading.value || busy.value || uncertain.value) return;
  const index = photos.value.findIndex(photo => photo.id === id);
  if (index < 0) return;
  URL.revokeObjectURL(photos.value[index]!.url);
  photos.value.splice(index, 1);
}
function filesChanged(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files ?? []);
  target.value = '';
  void addFiles(files);
}
async function confirm() {
  if (!ready.value || !reason.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.report(props.orderId, { reason: reason.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
      photoEvidenceIds: photos.value.map(photo => photo.evidenceId!),
      parts: props.parts.map(part => ({ partRequestId: part.id, outcome: dispositions.value[part.id] as 'installed' | 'returned' })),
    });
    if (!disposed) emit('reported');
  } catch (err) {
    if (!disposed) {
      uncertain.value = !(err instanceof FailedRepairReportError) || err.locked;
      canReconcile.value = err instanceof FailedRepairReportError && err.uncertain && !!api.reconcileReport;
      error.value = userFacingError(err, 'Chưa xác nhận được kết quả. Đóng hộp thoại và tải lại công việc để kiểm tra trước khi gửi lại.');
    }
  } finally { if (!disposed) busy.value = false; }
}
async function reconcile() {
  if (busy.value || uploading.value || !canReconcile.value || !api.reconcileReport) return;
  busy.value = true;
  try {
    await api.reconcileReport(props.orderId);
    if (!disposed) emit('reported');
  } catch (err) {
    if (!disposed) {
      canReconcile.value = !(err instanceof FailedRepairReportError) || err.uncertain;
      error.value = userFacingError(err, 'Chưa xác nhận được kết quả. Kiểm tra kết nối rồi thử lại.');
    }
  } finally { if (!disposed) busy.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 sm:items-center sm:p-4" @click.self="close" @keydown="keydown">
      <section ref="dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="repair-failed-title" aria-describedby="repair-failed-hint" :aria-busy="busy || uploading" class="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-(--shadow-e3) outline-none sm:rounded-2xl sm:p-6" data-testid="repair-failed-dialog">
        <header class="flex items-start justify-between gap-2"><div><h2 id="repair-failed-title" class="text-lg font-semibold text-ink-900">Không sửa được máy này</h2><p id="repair-failed-hint" class="mt-1 text-sm text-ink-600">Ghi nhận kết quả riêng của máy đang mở.</p></div><button type="button" aria-label="Đóng" :disabled="busy || uploading" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" @click="close"><X :size="20" /></button></header>
        <p v-if="!api.available" role="status" class="rounded-xl bg-warning-50 p-3 text-sm text-warning-800">{{ FAILED_REPAIR_UNAVAILABLE }}</p>
        <fieldset :disabled="busy || uncertain" class="space-y-1"><legend class="mb-2 text-sm font-semibold text-ink-900">Lý do <span class="font-normal">(bắt buộc)</span></legend><label v-for="option in REPAIR_FAILURE_REASONS" :key="option.code" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-800 hover:bg-ink-50" :class="reason === option.code ? 'bg-brand-50' : ''"><input v-model="reason" type="radio" name="repair-failed-reason" :value="option.code" class="h-4 w-4 accent-brand-600 focus-visible:outline-2 focus-visible:outline-brand-600" :data-testid="`repair-failed-reason-${option.code}`" required />{{ option.label }}</label></fieldset>
        <label class="block space-y-2 text-sm text-ink-800"><span>Ghi thêm (không bắt buộc)</span><textarea v-model="note" :disabled="busy || uncertain" maxlength="500" rows="2" class="w-full rounded-xl border border-ink-300 p-3 focus:outline-none focus:ring-2 focus:ring-brand-600" /></label>
        <fieldset :disabled="busy || uncertain" class="space-y-2"><legend class="text-sm font-semibold text-ink-900">Ảnh chứng cứ <span class="font-normal text-ink-600">(không bắt buộc, {{ photos.length }}/3)</span></legend>
          <p class="text-xs text-ink-600">Ảnh riêng tư, chỉ người được cấp quyền mới xem được.</p>
          <div class="flex flex-wrap gap-2"><FhButton ref="cameraButton" variant="secondary" size="md" :disabled="!api.evidenceAvailable || photos.length >= 3 || uploading || uncertain" @click="camera = true"><Camera :size="18" />Chụp ảnh</FhButton><FhButton variant="secondary" size="md" :disabled="!api.evidenceAvailable || photos.length >= 3 || uploading || uncertain" @click="input?.click()"><ImagePlus :size="18" />Tải ảnh</FhButton></div>
          <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" aria-label="Chọn ảnh chứng cứ" :disabled="!api.evidenceAvailable || busy || uploading || uncertain" @change="filesChanged" />
          <p v-if="!api.evidenceAvailable" class="text-xs text-ink-600">Tải ảnh riêng tư hiện chưa sẵn sàng.</p>
          <p v-if="uploading" role="status" class="text-sm text-ink-600">Đang tải ảnh…</p>
          <ul v-if="photos.length" class="grid grid-cols-3 gap-2"><li v-for="(photo, index) in photos" :key="photo.id" class="min-w-0"><img :src="photo.url" :alt="`Ảnh chứng cứ ${index + 1}`" class="aspect-square w-full rounded-xl object-cover" /><button type="button" :aria-label="`Xóa ảnh ${index + 1}`" :disabled="uploading || busy || uncertain" class="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-sm text-ink-700 focus-visible:ring-2 focus-visible:ring-brand-600" @click="remove(photo.id)"><Trash2 :size="16" />Xóa</button><p v-if="photo.error" role="alert" class="break-words text-xs text-danger-700">{{ photo.error }}</p><FhButton v-if="photo.error" variant="secondary" size="md" :disabled="uploading || uncertain" @click="retry(photo.id)">Thử lại</FhButton></li></ul>
        </fieldset>
        <fieldset v-if="parts.length" :disabled="busy || uncertain" class="space-y-3" data-testid="repair-failed-parts"><legend class="mb-2 text-sm font-semibold text-ink-900">Linh kiện đã nhận của máy này</legend><label v-for="part in parts" :key="part.id" class="block space-y-2 text-sm text-ink-800"><span class="break-words">{{ part.label }}</span><select v-model="dispositions[part.id]" required class="min-h-11 w-full rounded-xl border border-ink-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-brand-600"><option :value="undefined" disabled>Chọn tình trạng linh kiện</option><option value="installed">Đã lắp</option><option value="returned">Chưa lắp, cần khai trả</option></select></label></fieldset>
        <p v-if="!partsReady" role="alert" class="text-sm text-danger-700">Chưa kiểm tra được linh kiện của máy. Đóng và tải lại công việc trước khi báo.</p>
        <p class="rounded-xl bg-warning-50 p-3 text-sm text-warning-800">Khai trả chưa xác nhận kho đã nhận; Quản lý Dịch vụ xác nhận số lượng thực tế. Lịch sử các máy khác được giữ nguyên.</p>
        <p v-if="error" role="alert" class="text-sm text-danger-700">{{ error }}</p>
        <FhButton v-if="canReconcile" variant="secondary" size="md" :disabled="busy || uploading" :loading="busy" data-testid="repair-failed-reconcile" @click="reconcile">Kiểm tra kết quả</FhButton>
        <footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><FhButton variant="secondary" size="md" :disabled="busy || uploading" @click="close">Quay lại</FhButton><FhButton variant="danger" size="md" :disabled="!ready" :loading="busy" data-testid="repair-failed-confirm" @click="confirm">Xác nhận không sửa được</FhButton></footer>
      </section>
    </div>
    <CameraCapture v-if="camera" mode="product" title="Chụp ảnh chứng cứ" multiple :max-shots="3 - photos.length" @capture="files => addFiles(Array.isArray(files) ? files : [files])" @close="closeCamera" />
  </Teleport>
</template>
