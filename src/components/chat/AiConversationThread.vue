<script setup lang="ts">
// The thread and composer of a conversation with the assistant. Shared by the
// floating assistant and the booking form's diagnosis step; the owner keeps
// the conversation (useAiConversation) and puts its own action in the
// `pinned` slot - "Đặt thợ" in the assistant, "Đổi dịch vụ" in the form.
import { nextTick, reactive, ref, watch } from 'vue';
import { Bot, X, Image as ImageIcon, Send, AlertTriangle } from 'lucide-vue-next';
import ChatTypingDots from './ChatTypingDots.vue';
import { AI_MAX_IMAGES } from '../../api/ai.api';
import { DESCRIBE_BEFORE_SEND, priceLabel, type AiConversation } from '../../composables/useAiConversation';

const props = withDefaults(
  defineProps<{
    conversation: AiConversation;
    placeholder?: string;
  }>(),
  { placeholder: 'Nhà mình đang gặp vấn đề gì ạ?' },
);

// reactive() unwraps the refs, so the template reads c.messages, not .value.
const c = reactive(props.conversation);
const thread = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function scrollToEnd() {
  await nextTick();
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight;
}

watch(() => [c.messages.length, c.isThinking], scrollToEnd, { immediate: true });

async function onFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  const chosen = Array.from(target.files || []);
  target.value = '';
  await c.addFiles(chosen);
}

defineExpose({ scrollToEnd });
</script>

<template>
  <div class="flex flex-col min-h-0 h-full">
    <!-- Thread -->
    <div ref="thread" class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 bg-ink-50/40" data-testid="ai-thread">
      <div v-for="message in c.messages" :key="message.id">
        <div v-if="message.sender === 'user'" class="flex justify-end">
          <div class="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 text-white px-3.5 py-2">
            <div v-if="message.images?.length" class="flex flex-wrap gap-1.5 mb-1.5">
              <img v-for="(src, index) in message.images" :key="index" :src="src" alt="" class="w-20 h-20 object-cover rounded-lg" />
            </div>
            <p v-if="message.text" class="text-sm leading-relaxed whitespace-pre-wrap break-words">{{ message.text }}</p>
          </div>
        </div>

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
                <p class="text-xs font-semibold text-warning-800 mb-1">Em hỏi thêm một chút, anh/chị trả lời ở ô bên dưới nhé</p>
                <p v-for="(question, index) in message.reply.clarification.questionsVi" :key="index" class="text-sm text-warning-900 leading-relaxed">{{ question }}</p>
              </div>

              <div v-if="priceLabel(message.reply)" class="flex items-center justify-between gap-3 pt-2 border-t border-ink-100">
                <span class="text-xs text-ink-500">Chi phí tham khảo</span>
                <span class="text-sm font-semibold text-ink-900 font-num whitespace-nowrap">{{ priceLabel(message.reply) }}</span>
              </div>
              <p v-if="message.reply.priceEstimate?.requiresAssessment" class="text-xs text-ink-500">Thợ xem tận nơi rồi mới báo giá chính xác ạ.</p>

              <p v-if="message.reply.disclaimerVi" class="text-xs text-ink-400 leading-snug">{{ message.reply.disclaimerVi }}</p>
            </div>
          </div>
        </div>
      </div>

      <ChatTypingDots v-if="c.isThinking" />
    </div>

    <slot name="pinned" />

    <!-- Picked images -->
    <div v-if="c.pending.length" class="flex items-center gap-2 px-3.5 py-2 border-t border-ink-100">
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
      <span class="text-xs text-ink-500 whitespace-nowrap">{{ c.pending.length }}/{{ AI_MAX_IMAGES }} ảnh</span>
    </div>
    <p v-if="c.problem" class="px-3.5 pb-1 text-xs text-danger-600">{{ c.problem }}</p>
    <p v-else-if="c.needsDescription" class="px-3.5 pb-1 text-xs text-warning-700" data-testid="ai-needs-description">{{ DESCRIBE_BEFORE_SEND }}</p>

    <!-- Composer -->
    <div class="flex items-end gap-2 px-3 py-2.5 border-t border-ink-100 bg-white">
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" @change="onFiles" />
      <button type="button" class="p-2 rounded-lg text-brand-600 hover:bg-brand-50" title="Gửi ảnh thiết bị" aria-label="Gửi ảnh thiết bị" @click="fileInput?.click()">
        <ImageIcon :size="19" />
      </button>
      <textarea
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
