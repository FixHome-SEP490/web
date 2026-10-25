<script setup lang="ts">
/**
 * Live camera capture for the technician's job photos (PO 11/10/2026): the check-in face, the
 * photo before and after the repair are taken with the camera, never picked from the gallery.
 * There is deliberately no file-picker fallback.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, Loader2, RefreshCw, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const props = defineProps<{
  mode: 'face' | 'product';
  title: string;
  multiple?: boolean;
  maxShots?: number;
}>();

const emit = defineEmits<{
  (e: 'capture', file: File | File[]): void;
  (e: 'close'): void;
}>();

type Phase = 'starting' | 'live' | 'still' | 'error';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

const phase = ref<Phase>('starting');
const errorText = ref('');
const shotError = ref('');
const busy = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
const dialogEl = ref<HTMLElement | null>(null);
const stillUrl = ref<string | null>(null);
let stillFile: File | null = null;
const capturedShots = ref<Array<{ file: File; url: string }>>([]);
const multiple = computed(() => props.mode === 'product' && props.multiple === true);
const maxShots = computed(() => Math.max(1, Math.min(20, Math.floor(props.maxShots ?? 20))));
const canCaptureMore = computed(() => !multiple.value || capturedShots.value.length < maxShots.value);
let stream: MediaStream | null = null;
let disposed = false;
let previousFocus: HTMLElement | null = null;

const isFace = computed(() => props.mode === 'face');
const hint = computed(() => (isFace.value ? 'Đưa khuôn mặt vào khung' : 'Đưa máy vào khung'));

// Optional: browsers with the Shape Detection API let the shutter wait for one face in the oval.
interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}
interface FaceDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedFace[]>;
}
type FaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;

let detector: FaceDetectorLike | null = null;
let detectTimer: ReturnType<typeof setTimeout> | null = null;
const detectorActive = ref(false);
const faceInGuide = ref(false);
const shutterEnabled = computed(
  () => phase.value === 'live' && !busy.value && canCaptureMore.value && (!isFace.value || !detectorActive.value || faceInGuide.value),
);

function stopDetection() {
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = null;
}

function faceInsideOval(face: DetectedFace, width: number, height: number): boolean {
  if (!width || !height) return false;
  const box = face.boundingBox;
  const cx = (box.x + box.width / 2) / width;
  const cy = (box.y + box.height / 2) / height;
  const sizeOk = box.width / width >= 0.15;
  // The oval sits in the middle of the frame: centre (0.5, 0.45), radii about a third of each side.
  const inside = ((cx - 0.5) / 0.3) ** 2 + ((cy - 0.45) / 0.33) ** 2 <= 1;
  return sizeOk && inside;
}

function startDetection() {
  stopDetection();
  if (!isFace.value || disposed) return;
  const Ctor = (globalThis as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (typeof Ctor !== 'function') {
    detectorActive.value = false;
    return;
  }
  try {
    detector = detector ?? new Ctor({ fastMode: true, maxDetectedFaces: 2 });
  } catch {
    detectorActive.value = false;
    return;
  }
  detectorActive.value = true;
  const tick = async () => {
    if (disposed || phase.value !== 'live' || !detector || !videoEl.value) return;
    try {
      const faces = await detector.detect(videoEl.value);
      const video = videoEl.value;
      faceInGuide.value =
        faces.length === 1 && !!video && faceInsideOval(faces[0], video.videoWidth, video.videoHeight);
    } catch {
      // The detector is only a help; if it fails the shutter works as usual.
      detectorActive.value = false;
      return;
    }
    if (!disposed && phase.value === 'live') detectTimer = setTimeout(tick, 400);
  };
  detectTimer = setTimeout(tick, 300);
}

function stopStream() {
  stopDetection();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  if (videoEl.value) videoEl.value.srcObject = null;
}

function clearStill() {
  if (stillUrl.value) {
    try {
      URL.revokeObjectURL(stillUrl.value);
    } catch {
      /* nothing to release */
    }
  }
  stillUrl.value = null;
  stillFile = null;
}

function clearCapturedShots() {
  for (const shot of capturedShots.value) {
    try { URL.revokeObjectURL(shot.url); } catch { /* nothing to release */ }
  }
  capturedShots.value = [];
}

function cameraErrorText(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'Không tìm thấy camera trên thiết bị này. Hãy dùng điện thoại có camera rồi thử lại.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'Camera đang được ứng dụng khác dùng. Hãy tắt ứng dụng đó rồi thử lại.';
  }
  return 'Không mở được camera. Hãy cho phép trình duyệt dùng camera rồi thử lại.';
}

async function requestStream(): Promise<MediaStream> {
  const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!devices || typeof devices.getUserMedia !== 'function') {
    // Insecure page or an old browser: the camera API is hidden.
    const hidden = new Error('camera unavailable');
    hidden.name = 'NotAllowedError';
    throw hidden;
  }
  const video: MediaTrackConstraints = isFace.value
    ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }
    : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } };
  try {
    return await devices.getUserMedia({ video, audio: false });
  } catch (error) {
    // Some laptops reject the size hints; any camera is better than none.
    if ((error as { name?: string } | null)?.name === 'OverconstrainedError') {
      return devices.getUserMedia({ video: true, audio: false });
    }
    throw error;
  }
}

async function startCamera() {
  stopStream();
  clearStill();
  phase.value = 'starting';
  errorText.value = '';
  shotError.value = '';
  faceInGuide.value = false;
  try {
    const opened = await requestStream();
    if (disposed) {
      opened.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = opened;
    phase.value = 'live';
    await nextTick();
    const video = videoEl.value;
    if (video) {
      video.srcObject = opened;
      try {
        await video.play();
      } catch {
        /* autoplay with muted + playsinline normally starts by itself */
      }
    }
    startDetection();
    focusFirst();
  } catch (error) {
    if (disposed) return;
    stopStream();
    errorText.value = cameraErrorText(error);
    phase.value = 'error';
    await nextTick();
    focusFirst();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY);
    } catch {
      resolve(null);
    }
  });
}

async function shoot() {
  const video = videoEl.value;
  if (!video || !shutterEnabled.value) return;
  busy.value = true;
  shotError.value = '';
  try {
    const sourceWidth = video.videoWidth || video.clientWidth || 1280;
    const sourceHeight = video.videoHeight || video.clientHeight || 960;
    const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    // The preview of the front camera is mirrored only on screen; the frame itself is the
    // true image, so drawing it as is keeps the saved photo un-mirrored.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToJpeg(canvas);
    if (!blob) throw new Error('no blob');
    const prefix = isFace.value ? 'checkin-face' : 'photo';
    stillFile = new File([blob], `${prefix}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stillUrl.value = URL.createObjectURL(blob);
    stopDetection();
    phase.value = 'still';
    await nextTick();
    focusFirst();
  } catch {
    shotError.value = 'Chưa chụp được ảnh. Vui lòng thử lại.';
  } finally {
    busy.value = false;
  }
}

function retake() {
  clearStill();
  shotError.value = '';
  if (stream) {
    phase.value = 'live';
    void nextTick(() => {
      if (videoEl.value && stream) {
        videoEl.value.srcObject = stream;
        Promise.resolve()
          .then(() => videoEl.value?.play())
          .catch(() => {
            /* autoplay with muted + playsinline normally starts by itself */
          });
      }
      startDetection();
      focusFirst();
    });
  } else {
    void startCamera();
  }
}

function usePhoto() {
  if (!stillFile) return;
  const file = stillFile;
  if (multiple.value) {
    const url = stillUrl.value;
    if (!url || !canCaptureMore.value) return;
    capturedShots.value.push({ file, url });
    stillFile = null;
    stillUrl.value = null;
    shotError.value = '';
    phase.value = 'live';
    void nextTick(() => {
      if (videoEl.value && stream) {
        videoEl.value.srcObject = stream;
        Promise.resolve().then(() => videoEl.value?.play()).catch(() => undefined);
      }
      startDetection();
      focusFirst();
    });
    return;
  }
  stopStream();
  emit('capture', file);
}

function removeCapturedShot(index: number) {
  const [removed] = capturedShots.value.splice(index, 1);
  if (removed) {
    try { URL.revokeObjectURL(removed.url); } catch { /* nothing to release */ }
  }
}

function submitCapturedShots() {
  if (!multiple.value || capturedShots.value.length === 0 || busy.value) return;
  const files = capturedShots.value.map((shot) => shot.file);
  stopStream();
  emit('capture', files);
}

function close() {
  if (busy.value) return;
  stopStream();
  clearStill();
  clearCapturedShots();
  emit('close');
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function focusables(): HTMLElement[] {
  return dialogEl.value ? Array.from(dialogEl.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

function focusFirst() {
  const preferred = dialogEl.value?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
  (preferred ?? focusables()[0])?.focus?.();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables();
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || !dialogEl.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialogEl.value?.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  disposed = false;
  previousFocus = (document.activeElement as HTMLElement | null) ?? null;
  window.addEventListener('keydown', onKeydown);
  void startCamera();
});

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('keydown', onKeydown);
  stopStream();
  clearStill();
  clearCapturedShots();
  previousFocus?.focus?.();
});
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4 bg-ink-900/80" data-testid="camera-capture">
    <div
      ref="dialogEl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
      class="relative w-full max-h-[100dvh] sm:max-w-md sm:max-h-[calc(100dvh-2rem)] bg-ink-900 text-white sm:rounded-[20px] overflow-hidden flex flex-col"
    >
      <div class="flex items-center justify-between gap-3 px-4 h-14 shrink-0">
        <h2 id="camera-capture-title" class="text-base font-semibold truncate">{{ title }}</h2>
        <button
          type="button"
          class="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Đóng camera"
          :disabled="busy"
          data-testid="camera-close"
          @click="close"
        >
          <X :size="20" />
        </button>
      </div>

      <!-- The preview gives up height when kept photos and the send button need room, so the buttons stay on screen. -->
      <div class="relative flex-1 min-h-0 sm:flex-initial sm:aspect-[3/4] bg-black overflow-hidden">
        <!-- Live preview; the front camera is mirrored on screen like a mirror -->
        <video
          v-show="phase === 'live' || phase === 'starting'"
          ref="videoEl"
          class="absolute inset-0 w-full h-full object-cover"
          :class="{ '-scale-x-100': isFace }"
          autoplay
          playsinline
          muted
          aria-hidden="true"
        />
        <img
          v-if="phase === 'still' && stillUrl"
          :src="stillUrl"
          alt="Ảnh vừa chụp"
          class="absolute inset-0 w-full h-full object-cover"
          :class="{ '-scale-x-100': isFace }"
          data-testid="camera-still"
        />

        <!-- Guide: the frame stays clear, the rest is dimmed -->
        <svg
          v-if="phase === 'live' || phase === 'starting'"
          class="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 300 400"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <mask id="camera-guide-mask">
              <rect width="300" height="400" fill="white" />
              <ellipse v-if="isFace" cx="150" cy="180" rx="92" ry="122" fill="black" />
              <rect v-else x="30" y="70" width="240" height="240" rx="24" fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(0,0,0,0.55)" mask="url(#camera-guide-mask)" />
          <ellipse
            v-if="isFace"
            cx="150"
            cy="180"
            rx="92"
            ry="122"
            fill="none"
            stroke-width="3"
            :stroke="detectorActive && faceInGuide ? 'var(--color-success-500, #22c55e)' : 'white'"
            data-testid="camera-face-guide"
          />
          <rect v-else x="30" y="70" width="240" height="240" rx="24" fill="none" stroke="white" stroke-width="3" data-testid="camera-product-guide" />
        </svg>

        <p
          v-if="phase === 'live'"
          class="absolute inset-x-0 bottom-4 px-4 text-center text-sm font-medium text-white"
          role="status"
        >
          {{ hint }}
        </p>

        <div v-if="phase === 'starting'" class="absolute inset-0 flex items-center justify-center" aria-busy="true">
          <Loader2 :size="28" class="animate-spin text-white/80" />
          <span class="sr-only">Đang mở camera</span>
        </div>

        <div
          v-if="phase === 'error'"
          class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
          role="alert"
          data-testid="camera-error"
        >
          <p class="text-sm text-white text-pretty">{{ errorText }}</p>
          <FhButton variant="secondary" data-autofocus @click="startCamera">
            <RefreshCw :size="16" /> Thử lại
          </FhButton>
        </div>
      </div>

      <div class="shrink-0 px-4 py-5 sm:py-6 flex flex-col items-center gap-3">
        <p v-if="shotError" class="text-sm text-danger-200" role="alert">{{ shotError }}</p>
        <div v-if="multiple && capturedShots.length" class="w-full space-y-2" aria-label="Ảnh đã chụp">
          <p class="text-xs text-white/80">Đã chụp {{ capturedShots.length }}/{{ maxShots }} ảnh</p>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <div v-for="(shot, index) in capturedShots" :key="shot.url" class="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/30" data-testid="camera-thumbnail">
              <img :src="shot.url" :alt="`Ảnh đã chụp ${index + 1}`" class="h-full w-full object-cover" />
              <button type="button" class="absolute right-0 top-0 h-7 w-7 rounded-bl-lg bg-ink-900/80 text-white" :aria-label="`Bỏ ảnh ${index + 1}`" data-testid="camera-remove-shot" @click="removeCapturedShot(index)">
                <X :size="14" class="mx-auto" />
              </button>
            </div>
          </div>
        </div>
        <button
          v-if="phase === 'live' || phase === 'starting'"
          type="button"
          class="w-[72px] h-[72px] rounded-full bg-white ring-4 ring-white/30 text-ink-900 flex items-center justify-center transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-brand-500"
          aria-label="Chụp ảnh"
          :disabled="!shutterEnabled"
          data-autofocus
          data-testid="camera-shutter"
          @click="shoot"
        >
          <Loader2 v-if="busy" :size="26" class="animate-spin" />
          <Camera v-else :size="26" />
        </button>
        <p v-if="multiple && !canCaptureMore" role="status" class="text-xs text-white/80">Đã đạt tối đa {{ maxShots }} ảnh.</p>
        <FhButton
          v-if="multiple && capturedShots.length && phase === 'live'"
          variant="primary"
          block
          data-testid="camera-submit-batch"
          @click="submitCapturedShots"
        >
          Gửi {{ capturedShots.length }} ảnh
        </FhButton>
        <div v-else-if="phase === 'still'" class="w-full grid grid-cols-2 gap-2">
          <FhButton variant="secondary" data-testid="camera-retake" @click="retake">Chụp lại</FhButton>
          <FhButton variant="primary" data-autofocus data-testid="camera-use" @click="usePhoto">{{ multiple ? 'Giữ ảnh, chụp tiếp' : 'Dùng ảnh này' }}</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
