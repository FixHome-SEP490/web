<script setup lang="ts">
// The thread and composer of a conversation with the assistant. Shared by the
// floating assistant and the booking form's diagnosis step; the owner keeps
// the conversation (useAiConversation) and puts its own action in the
// `pinned` slot - "Đặt thợ" in the assistant, "Đổi dịch vụ" in the form.
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { Bot, X, Image as ImageIcon, Send, AlertTriangle, Play, Check, RotateCw, Film } from 'lucide-vue-next';
import ChatTypingDots from './ChatTypingDots.vue';
import {
  AI_CHAT_MAX_IMAGES,
  AI_MAX_VIDEOS,
  AI_VIDEO_TYPES,
  DESCRIBE_BEFORE_SEND,
  VIDEO_NOT_ANALYSED,
  photoLabel,
  priceLabel,
  priceBreakdown,
  quickReplies,
  type AiChatMessage,
  type AiConversation,
  type ChatAttachment,
} from '../../composables/useAiConversation';

/** Photos for the assistant, and short videos that only travel with the booking (PO 18/10/2026). */
const ACCEPT = ['image/*', '.heic', '.heif', ...AI_VIDEO_TYPES].join(',');

const props = withDefaults(
  defineProps<{
    conversation: AiConversation;
    placeholder?: string;
  }>(),
  { placeholder: 'Nhà mình đang gặp vấn đề gì ạ?' },
);

// reactive() unwraps the refs, so the template reads c.messages, not .value.
const c = reactive(props.conversation);
// Videos (PO 18/10/2026); a conversation built without them shows none.
const pendingVideos = computed(() => c.pendingVideos ?? []);
/** At most three photos and two videos in the whole conversation (PO 18/10/2026). */
const imagesUsed = computed(() => c.imagesUsed ?? c.pending.length);
const videosUsed = computed(() => c.videosUsed ?? pendingVideos.value.length);
const attachmentsById = computed(() => new Map((c.attachments ?? []).map((item: ChatAttachment) => [item.id, item])));

function attachmentsOf(message: AiChatMessage): ChatAttachment[] {
  return (message.attachmentIds ?? []).flatMap((id) => {
    const item = attachmentsById.value.get(id);
    return item ? [item] : [];
  });
}

const composer = ref<HTMLTextAreaElement | null>(null);

/** What each sent photo was read as, per message and photo; null until the reply says. */
const photoLabels = computed(() =>
  c.messages.map((message: AiChatMessage, messageIndex: number) =>
    (message.images ?? []).map((_src: string, imageIndex: number) => photoLabel(c.messages, messageIndex, imageIndex)),
  ),
);

/** A tap on a photo's label: the composer gets "Ảnh 2 là " for the customer to finish. */
function correctPhoto(correction: string) {
  c.input = correction;
  nextTick(() => {
    const box = composer.value;
    if (!box) return;
    box.focus();
    box.setSelectionRange(correction.length, correction.length);
  });
}

const percent = (fraction: number) => `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;

/** Where a sent photo or video is on its way to the technician, in plain words. */
function attachmentStatus(item: ChatAttachment): string {
  const what = item.kind === 'video' ? 'Video' : 'Ảnh';
  if (item.state === 'preparing') return item.kind === 'video' ? `Đang nén video ${percent(item.video?.progress ?? 0)}` : 'Đang chuẩn bị ảnh';
  if (item.state === 'ready') return `${what} chờ gửi cho thợ`;
  if (item.state === 'uploading') return item.retrying ? 'Mạng chập chờn, đang gửi lại' : `Đang gửi ${what.toLowerCase()} cho thợ ${percent(item.progress)}`;
  if (item.state === 'done') return `${what} đã gửi kèm cho thợ`;
  return item.error || 'Chưa gửi được';
}

const ACTIVE = new Set(['preparing', 'ready', 'uploading']);

/**
 * Found in the browser 18/10/2026: the thread scrolls to the newest reply, so
 * the status under the customer's own message is out of sight while a video is
 * still going up. One line above the composer says it the whole time, with the
 * retry, until everything has arrived.
 */
const uploadSummary = computed(() => {
  const uploads = c.uploads;
  if (!uploads?.total) return null;
  if (uploads.failed) return { failed: true, text: `${uploads.failed} ảnh/video chưa gửi được cho thợ` };
  if ((c.attachments ?? []).some((item: ChatAttachment) => item.state === 'uploading' && item.retrying)) {
    return { failed: false, text: 'Mạng chập chờn, đang gửi lại ảnh, video cho thợ' };
  }
  if (uploads.busy) return { failed: false, text: `Đang gửi ảnh, video cho thợ ${percent(uploads.progress)}` };
  return null;
});
const thread = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function scrollToEnd() {
  await nextTick();
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight;
}

watch(() => [c.messages.length, c.isThinking, c.messages[c.messages.length - 1]?.text], scrollToEnd, { immediate: true });

async function onFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  const chosen = Array.from(target.files || []);
  target.value = '';
  await c.addFiles(chosen);
}

/** The newest assistant reply, the only one whose question can still be answered. */
const latestReplyId = computed(() => {
  for (let i = c.messages.length - 1; i >= 0; i -= 1) {
    const message = c.messages[i];
    if (message.sender === 'user') return null;
    if (message.reply && !message.isAcknowledgement) return message.id;
  }
  return null;
});

function answersFor(message: AiChatMessage): string[] {
  if (c.isThinking || message.id !== latestReplyId.value) return [];
  return quickReplies(message.reply?.clarification?.questionsVi?.[0]);
}

function answer(text: string) {
  void c.sendTurn(text, []);
}

// No "Đúng ý / Chưa đúng" buttons (PO 26/10/2026). A customer who disagrees
// says so in the conversation ("sai rồi", "không phải bệnh đó"); the assistant
// notices, and Backend keeps it with the conversation for the team.

defineExpose({ scrollToEnd });
</script>

<template>
  <div class="flex flex-col min-h-0 h-full">
    <!-- Thread -->
    <div ref="thread" class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 bg-ink-50/40" data-testid="ai-thread">
      <div v-for="(message, messageIndex) in c.messages" :key="message.id">
        <div v-if="message.sender === 'user'" class="flex justify-end">
          <div class="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 text-white px-3.5 py-2">
            <div v-if="message.images?.length" class="flex flex-wrap gap-1.5 mb-1.5">
              <div v-for="(src, index) in message.images" :key="index" class="flex flex-col items-center gap-1 w-20">
                <img :src="src" alt="" class="w-20 h-20 object-cover rounded-lg" />
                <button
                  v-if="photoLabels[messageIndex]?.[index]"
                  type="button"
                  class="max-w-full line-clamp-2 break-words text-center rounded-xl px-2 py-0.5 text-[11px] leading-4 bg-white/20 hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/60"
                  :class="photoLabels[messageIndex][index]!.uncertain ? 'ring-1 ring-warning-300' : ''"
                  :title="`Bấm để sửa nếu ảnh ${index + 1} không phải thiết bị này`"
                  :aria-label="`Ảnh ${index + 1}: ${photoLabels[messageIndex][index]!.text}. Bấm để sửa`"
                  data-testid="ai-photo-label"
                  @click="correctPhoto(photoLabels[messageIndex][index]!.correction)"
                >
                  {{ photoLabels[messageIndex][index]!.text }}
                </button>
              </div>
            </div>
            <div v-if="message.videos?.length" class="flex flex-wrap gap-1.5 mb-1.5" data-testid="ai-message-videos">
              <video
                v-for="(src, index) in message.videos"
                :key="index"
                :src="src"
                controls
                playsinline
                preload="metadata"
                class="w-44 max-w-full rounded-lg bg-ink-900"
              ></video>
            </div>
            <p v-if="message.text" class="text-sm leading-relaxed whitespace-pre-wrap break-words">{{ message.text }}</p>
          </div>
        </div>
        <template v-if="message.sender === 'user'">
          <p v-if="message.videos?.length" class="mt-1 text-right text-xs text-ink-500" data-testid="ai-video-note">
            {{ VIDEO_NOT_ANALYSED }}
          </p>
          <!-- PO 18/10/2026: what goes with the booking is sent now, in the background; each says how far it is. -->
          <ul v-if="attachmentsOf(message).length" class="mt-1 flex flex-col items-end gap-1" data-testid="ai-attachment-status">
            <li
              v-for="item in attachmentsOf(message)"
              :key="item.id"
              class="flex items-center gap-1.5 text-xs"
              :class="item.state === 'failed' ? 'text-danger-700' : item.state === 'done' ? 'text-success-700' : 'text-ink-500'"
              :data-state="item.state"
            >
              <Check v-if="item.state === 'done'" :size="13" aria-hidden="true" />
              <AlertTriangle v-else-if="item.state === 'failed'" :size="13" aria-hidden="true" />
              <Film v-else-if="item.kind === 'video'" :size="13" aria-hidden="true" />
              <ImageIcon v-else :size="13" aria-hidden="true" />
              <span>{{ attachmentStatus(item) }}</span>
              <span
                v-if="ACTIVE.has(item.state)"
                class="h-1 w-14 overflow-hidden rounded-full bg-ink-100"
                role="progressbar"
                :aria-valuenow="Math.round((item.state === 'preparing' ? item.video?.progress ?? 0 : item.progress) * 100)"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span class="block h-full bg-brand-500 transition-[width] duration-300" :style="{ width: percent(item.state === 'preparing' ? item.video?.progress ?? 0 : item.progress) }"></span>
              </span>
              <button
                v-if="item.state === 'failed'"
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-brand-700 hover:bg-brand-50"
                data-testid="ai-attachment-retry"
                @click="c.retryUpload(item.id)"
              >
                <RotateCw :size="12" aria-hidden="true" /> Thử lại
              </button>
            </li>
            <li v-for="item in attachmentsOf(message).filter((entry) => entry.video?.trimmed)" :key="`${item.id}-trim`" class="text-xs text-warning-700">
              Video dài hơn 60 giây nên chỉ gửi 60 giây đầu.
            </li>
          </ul>
        </template>

        <div v-else class="flex gap-2">
          <div class="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
            <Bot :size="14" class="text-brand-700" />
          </div>
          <div class="flex-1 min-w-0 space-y-2">
            <div
              class="rounded-2xl rounded-bl-sm px-3.5 py-2 border"
              :class="message.isAcknowledgement ? 'bg-ink-100/70 border-ink-100 text-ink-500 italic' : 'bg-white border-ink-100 text-ink-900'"
            >
              <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">{{ message.text }}</p>
            </div>

            <!-- What it found. The booking action lives in the pinned slot. -->
            <div
              v-if="message.reply && !message.isAcknowledgement && message.reply.status !== 'unavailable'"
              class="rounded-xl border border-ink-100 bg-white p-3 space-y-2.5"
              data-testid="ai-reply-details"
            >
              <!-- Safety first: a warning read after a list of faults is a warning nobody acted on. -->
              <div
                v-if="message.reply.urgency === 'HIGH' && message.reply.suggestedActionsVi?.length"
                class="rounded-lg border border-danger-200 bg-danger-50 p-2.5"
              >
                <div class="flex items-center gap-1.5 mb-1">
                  <AlertTriangle :size="14" class="text-danger-700" />
                  <span class="text-xs font-semibold text-danger-700">Anh/chị làm ngay giúp em</span>
                </div>
                <p v-for="(action, index) in message.reply.suggestedActionsVi" :key="index" class="text-sm text-danger-900 leading-relaxed">
                  {{ index + 1 }}. {{ action }}
                </p>
              </div>

              <div v-if="message.reply.device" class="flex flex-wrap gap-1.5">
                <span class="px-2 py-0.5 rounded-full bg-ink-100 text-xs font-semibold text-ink-900">{{ message.reply.device.nameVi }}</span>
              </div>

              <div v-if="message.reply.suspectedFaults?.length">
                <p class="text-xs font-semibold text-ink-500 mb-1">Có thể là</p>
                <p v-for="fault in message.reply.suspectedFaults" :key="fault.faultCode" class="text-sm text-ink-900 leading-relaxed">• {{ fault.nameVi }}</p>
              </div>

              <div v-if="message.reply.urgency !== 'HIGH' && message.reply.suggestedActionsVi?.length">
                <p class="text-xs font-semibold text-ink-500 mb-1">Anh/chị có thể làm trước</p>
                <p v-for="(action, index) in message.reply.suggestedActionsVi" :key="index" class="text-sm text-ink-900 leading-relaxed">• {{ action }}</p>
              </div>

              <div v-if="message.reply.clarification?.questionsVi?.length" class="rounded-lg bg-warning-50 border border-warning-200 p-2.5" data-testid="ai-questions">
                <p class="text-xs font-semibold text-warning-800 mb-1">{{ answersFor(message).length ? 'Em hỏi thêm một chút, anh/chị bấm chọn hoặc trả lời ở ô bên dưới nhé' : 'Em hỏi thêm một chút, anh/chị trả lời ở ô bên dưới nhé' }}</p>
                <p v-for="(question, index) in message.reply.clarification.questionsVi" :key="index" class="text-sm text-warning-900 leading-relaxed">{{ question }}</p>
                <div v-if="answersFor(message).length" class="flex flex-wrap gap-2 mt-2" data-testid="ai-quick-replies">
                  <button
                    v-for="choice in answersFor(message)"
                    :key="choice"
                    type="button"
                    class="px-3.5 py-1.5 rounded-full border border-warning-300 bg-white text-sm font-semibold text-ink-900 hover:bg-warning-100 active:scale-95 transition-[background-color,transform] duration-150"
                    @click="answer(choice)"
                  >
                    {{ choice }}
                  </button>
                </div>
              </div>

              <div v-if="priceLabel(message.reply)" class="flex items-center justify-between gap-3 pt-2 border-t border-ink-100">
                <span class="text-xs text-ink-500">Chi phí tham khảo</span>
                <span class="text-sm font-semibold text-ink-900 font-num whitespace-nowrap">{{ priceLabel(message.reply) }}</span>
              </div>
              <p v-if="priceBreakdown(message.reply)" class="text-xs text-ink-500" data-testid="ai-price-breakdown">{{ priceBreakdown(message.reply) }}</p>
              <p v-if="message.reply.priceEstimate?.requiresAssessment" class="text-xs text-ink-500">Thợ xem tận nơi rồi mới báo giá chính xác ạ.</p>

              <p v-if="message.reply.disclaimerVi" class="text-xs text-ink-400 leading-snug">{{ message.reply.disclaimerVi }}</p>
            </div>
          </div>
        </div>
      </div>

      <ChatTypingDots v-if="c.isThinking && !c.isRevealing" />
    </div>

    <slot name="pinned" />

    <div
      v-if="uploadSummary"
      class="flex items-center gap-2 border-t border-ink-100 px-3.5 py-1.5 text-xs"
      :class="uploadSummary.failed ? 'bg-danger-50 text-danger-700' : 'bg-white text-ink-600'"
      data-testid="ai-upload-summary"
      role="status"
    >
      <AlertTriangle v-if="uploadSummary.failed" :size="13" class="shrink-0" aria-hidden="true" />
      <Film v-else :size="13" class="shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate">{{ uploadSummary.text }}</span>
      <span class="shrink-0 text-ink-500">Ảnh {{ imagesUsed }}/{{ AI_CHAT_MAX_IMAGES }} · Video {{ videosUsed }}/{{ AI_MAX_VIDEOS }}</span>
      <button
        v-if="uploadSummary.failed"
        type="button"
        class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-brand-700 hover:bg-brand-50"
        data-testid="ai-upload-summary-retry"
        @click="c.retryFailed()"
      >
        <RotateCw :size="12" aria-hidden="true" /> Thử lại
      </button>
    </div>

    <!-- Picked images and videos -->
    <div v-if="c.pending.length || pendingVideos.length" class="flex flex-wrap items-center gap-2 px-3.5 py-2 border-t border-ink-100">
      <div v-for="(image, index) in c.pending" :key="index" class="relative">
        <img :src="image.dataUrl" alt="" class="w-14 h-14 object-cover rounded-lg" />
        <button
          type="button"
          class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ink-900 text-white flex items-center justify-center"
          title="Bỏ ảnh này"
          aria-label="Bỏ ảnh này"
          @click="c.removePending(index)"
        >
          <X :size="11" />
        </button>
      </div>
      <div v-for="(video, index) in pendingVideos" :key="video.id" class="relative" data-testid="ai-pending-video" :data-state="video.state">
        <video :src="video.url" muted playsinline preload="metadata" class="w-14 h-14 object-cover rounded-lg bg-ink-900" aria-hidden="true"></video>
        <span v-if="video.state === 'preparing'" class="absolute inset-0 flex items-center justify-center rounded-lg bg-ink-900/60 text-[11px] font-semibold text-white" :aria-label="`Đang nén video ${percent(video.progress)}`">
          {{ percent(video.progress) }}
        </span>
        <span v-else class="absolute inset-0 flex items-center justify-center text-white"><Play :size="16" /></span>
        <button
          type="button"
          class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ink-900 text-white flex items-center justify-center"
          title="Bỏ video này"
          aria-label="Bỏ video này"
          @click="c.removePendingVideo(index)"
        >
          <X :size="11" />
        </button>
      </div>
      <span class="text-xs text-ink-500 whitespace-nowrap" data-testid="ai-attachment-count">
        Ảnh {{ imagesUsed }}/{{ AI_CHAT_MAX_IMAGES }} · Video {{ videosUsed }}/{{ AI_MAX_VIDEOS }}
      </span>
      <p v-if="pendingVideos.some((video) => video.state === 'preparing')" class="basis-full text-xs text-ink-500">
        Đang nén video cho nhẹ trước khi gửi, anh/chị cứ nhắn tiếp ạ.
      </p>
      <p v-if="pendingVideos.length" class="basis-full text-xs text-ink-500">{{ VIDEO_NOT_ANALYSED }}</p>
    </div>
    <p v-if="c.problem" class="px-3.5 pb-1 text-xs text-danger-600">{{ c.problem }}</p>
    <p v-else-if="c.needsDescription" class="px-3.5 pb-1 text-xs text-warning-700" data-testid="ai-needs-description">{{ DESCRIBE_BEFORE_SEND }}</p>

    <!-- Composer -->
    <div class="flex items-end gap-2 px-3 py-2.5 border-t border-ink-100 bg-white">
      <input ref="fileInput" type="file" :accept="ACCEPT" multiple class="hidden" data-testid="ai-file-input" @change="onFiles" />
      <button type="button" class="p-2 rounded-lg text-brand-600 hover:bg-brand-50" title="Gửi ảnh hoặc video thiết bị" aria-label="Gửi ảnh hoặc video thiết bị" @click="fileInput?.click()">
        <ImageIcon :size="19" />
      </button>
      <textarea
        ref="composer"
        v-model="c.input"
        rows="1"
        :placeholder="placeholder"
        data-testid="ai-input"
        class="flex-1 resize-none rounded-xl bg-ink-100/70 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 max-h-28"
        @keydown.enter.exact.prevent="c.canSend && c.send()"
      ></textarea>
      <button
        type="button"
        class="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center disabled:bg-ink-300 shrink-0"
        :disabled="!c.canSend"
        title="Gửi"
        aria-label="Gửi"
        data-testid="ai-send"
        @click="c.send()"
      >
        <Send :size="16" />
      </button>
    </div>
  </div>
</template>
