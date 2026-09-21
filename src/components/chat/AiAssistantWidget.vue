<script setup lang="ts">
// src/components/chat/AiAssistantWidget.vue
//
// The AI assistant, as a floating panel beside the human chat.
//
// Deliberately a separate button from ChatFloatingWidget. They look alike and
// do entirely different things - one reaches a technician, the other reaches a
// model - and a customer who cannot tell them apart will send a real question
// into the wrong one. Different icon, different colour, different wording.
//
// Nothing is persisted. Closing the panel ends the conversation, which is the
// right behaviour for a diagnosis assistant: yesterday's washing machine has
// nothing to do with today's question.

import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Bot, X, Image as ImageIcon, Send, RotateCcw, CalendarPlus, AlertTriangle } from 'lucide-vue-next';
import ChatTypingDots from './ChatTypingDots.vue';
import {
  aiApi,
  looksLikeAQuestion,
  AI_MAX_IMAGES,
  type AiReply,
  type RecommendedService,
} from '../../api/ai.api';
import { prepareForAi, shrinkForRetry, type PickedImage } from '../../utils/image-for-ai';

/** The service drops a session after an hour of silence. Told, not discovered. */
const SESSION_IDLE_MINUTES = 60;

/**
 * How long the acknowledgement stays alone before the answer can land. The
 * model often replies in under a second, and an answer arriving while the
 * customer is still reading "em đang xem ạ" reads like neither was meant.
 */
const ACKNOWLEDGEMENT_DWELL_MS = 900;

const GREETING =
  'Dạ em chào anh/chị, em là trợ lý của FixHome ạ. Anh/chị đang gặp vấn đề gì ở ' +
  'nhà mình thì kể em nghe, hoặc gửi em tấm ảnh thiết bị để em xem giúp nhé.';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  images?: string[];
  reply?: AiReply;
  isAcknowledgement?: boolean;
}

const router = useRouter();

const isOpen = ref(false);
const messages = ref<ChatMessage[]>([{ id: 'greeting', sender: 'bot', text: GREETING }]);
const input = ref('');
const pending = ref<PickedImage[]>([]);
const isThinking = ref(false);
const turnCount = ref(0);
const problem = ref('');

/** Server-issued, never invented here: the field accepts any string, so two
 *  clients that both made one up would share a conversation. */
const sessionId = ref<string | null>(null);

/**
 * The service the customer is currently about to order.
 *
 * Pinned to the bottom of the panel rather than rendered into a message,
 * because a button inside a message scrolls away as soon as the assistant says
 * anything else. Replaced - never appended to - so asking to switch changes
 * what the button books instead of leaving two contradictory buttons.
 */
const pinnedService = ref<RecommendedService | null>(null);

const holdingLines = ref<Record<string, string[]>>({});
const thread = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

let messageCounter = 0;
const nextId = () => `m${Date.now()}_${messageCounter++}`;

const canSend = computed(
  () => (input.value.trim().length > 0 || pending.value.length > 0) && !isThinking.value,
);

async function scrollToEnd() {
  await nextTick();
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight;
}

function holdingLineFor(situation: string): string {
  const group = holdingLines.value[situation] || holdingLines.value.first_text || [];
  if (group.length === 0) return 'Dạ em nhận được rồi ạ, anh/chị chờ em xem một chút nhé.';
  return group[Math.floor(Math.random() * group.length)];
}

async function toggle() {
  isOpen.value = !isOpen.value;
  if (isOpen.value && Object.keys(holdingLines.value).length === 0) {
    holdingLines.value = await aiApi.acknowledgements();
  }
  if (isOpen.value) void scrollToEnd();
}

function startOver() {
  sessionId.value = null;
  pinnedService.value = null;
  pending.value = [];
  input.value = '';
  turnCount.value = 0;
  problem.value = '';
  messages.value = [{ id: nextId(), sender: 'bot', text: GREETING }];
}

async function onFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  const chosen = Array.from(target.files || []);
  target.value = '';
  if (chosen.length === 0) return;

  const result = await prepareForAi(chosen, pending.value.length);
  problem.value = result.problemVi || '';
  if (result.images.length > 0) {
    pending.value = [...pending.value, ...result.images].slice(0, AI_MAX_IMAGES);
  }
}

/** A sentence built from the structured fields, for the branches with no prose. */
function composeFromFields(reply: AiReply): string {
  const questions = reply.clarification?.questionsVi || [];
  if (questions.length > 0) return 'Dạ em cần hỏi thêm một chút để chẩn cho đúng ạ.';
  const faults = reply.suspectedFaults || [];
  if (faults.length > 0) {
    return `Dạ em xem rồi ạ, khả năng là ${faults[0].nameVi.toLowerCase()}.`;
  }
  if (reply.device) {
    return `Dạ em thấy đây là ${reply.device.nameVi.toLowerCase()} ạ. Anh/chị kể thêm hiện tượng giúp em nhé.`;
  }
  return 'Dạ anh/chị mô tả thêm giúp em một chút để em xem cho đúng ạ.';
}

async function send() {
  const text = input.value.trim();
  const images = pending.value;
  if (!text && images.length === 0) return;

  const isQuestion = images.length === 0 && looksLikeAQuestion(text);
  const situation =
    images.length > 0
      ? 'first_photo'
      : turnCount.value > 0
        ? 'follow_up'
        : isQuestion
          ? 'general_question'
          : 'first_text';

  messages.value.push({
    id: nextId(),
    sender: 'user',
    text,
    images: images.map((i) => i.dataUrl),
  });
  messages.value.push({
    id: nextId(),
    sender: 'bot',
    text: holdingLineFor(situation),
    isAcknowledgement: true,
  });
  input.value = '';
  pending.value = [];
  problem.value = '';
  isThinking.value = true;
  void scrollToEnd();

  const ask = (payload: string[]) =>
    isQuestion
      ? aiApi.ask({ question: text, sessionId: sessionId.value })
      : aiApi.analyze({ description: text, images: payload, sessionId: sessionId.value });

  const [firstTry] = await Promise.all([
    ask(images.map((i) => i.dataUrl)),
    new Promise((resolve) => setTimeout(resolve, ACKNOWLEDGEMENT_DWELL_MS)),
  ]);

  // A send that fails with photographs attached is usually the photographs. On
  // a weak connection the request never completes and the customer is told the
  // assistant is unreachable when the assistant is fine. One retry at roughly
  // a tenth of the bytes turns that into an answer.
  let reply = firstTry;
  if (reply.status === 'unavailable' && images.length > 0) {
    messages.value.push({
      id: nextId(),
      sender: 'bot',
      text: 'Mạng hơi yếu nên ảnh chưa gửi được, em thử lại với ảnh nhẹ hơn nhé...',
      isAcknowledgement: true,
    });
    void scrollToEnd();
    const smaller = await shrinkForRetry(images);
    if (smaller.length > 0) reply = await ask(smaller);
  }

  if (reply.sessionId) sessionId.value = reply.sessionId;
  turnCount.value += 1;

  const offered = reply.recommendedServices?.[0];
  if (offered) pinnedService.value = offered;

  messages.value.push({
    id: nextId(),
    sender: 'bot',
    text: reply.messageVi?.trim() || reply.answerVi?.trim() || composeFromFields(reply),
    reply,
  });
  isThinking.value = false;
  void scrollToEnd();
}

/** Chat does not book. It carries the service into the booking flow. */
function goToBooking() {
  const service = pinnedService.value;
  if (!service) return;
  isOpen.value = false;
  void router.push({
    name: 'new-booking',
    query: {
      // The id when the backend could resolve the catalogue code, and the name
      // as a fallback for the wizard's own matching when it could not.
      serviceId: service.serviceId || undefined,
      q: service.nameVi,
    },
  });
}

function money(value: number) {
  return `${value.toLocaleString('vi-VN')}đ`;
}

function priceLabel(reply: AiReply): string | null {
  const price = reply.priceEstimate;
  if (!price) return null;
  if (price.max && price.max > price.min) return `${money(price.min)} – ${money(price.max)}`;
  return `Từ ${money(price.min)}`;
}
</script>

<template>
  <div class="fixed bottom-5 right-24 z-40 flex flex-col items-end">
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="isOpen"
        class="mb-3 w-[22rem] sm:w-[26rem] h-[32rem] rounded-2xl bg-white shadow-2xl border border-ink-100 flex flex-col overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
          <div class="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
            <Bot :size="17" class="text-violet-700" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-ink-900 leading-tight">Trợ lý FixHome</p>
            <p class="text-[11px] text-ink-500 leading-tight">
              {{
                turnCount > 0
                  ? `Đang nhớ cuộc trò chuyện · quên sau ${SESSION_IDLE_MINUTES} phút`
                  : 'Chẩn đoán sơ bộ, không thay thợ'
              }}
            </p>
          </div>
          <button
            type="button"
            class="p-1.5 rounded-lg text-ink-400 hover:text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-transparent"
            :disabled="turnCount === 0"
            title="Bắt đầu phiên mới"
            @click="startOver"
          >
            <RotateCcw :size="16" />
          </button>
        </div>

        <!-- Thread -->
        <div ref="thread" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-ink-50/40">
          <div v-for="message in messages" :key="message.id">
            <div v-if="message.sender === 'user'" class="flex justify-end">
              <div class="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 text-white px-3.5 py-2">
                <div v-if="message.images?.length" class="flex flex-wrap gap-1.5 mb-1.5">
                  <img
                    v-for="(src, index) in message.images"
                    :key="index"
                    :src="src"
                    alt=""
                    class="w-20 h-20 object-cover rounded-lg"
                  />
                </div>
                <p v-if="message.text" class="text-sm leading-relaxed whitespace-pre-wrap">
                  {{ message.text }}
                </p>
              </div>
            </div>

            <div v-else class="flex gap-2">
              <div
                class="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5"
              >
                <Bot :size="14" class="text-violet-700" />
              </div>
              <div class="flex-1 min-w-0 space-y-2">
                <div
                  class="rounded-2xl rounded-bl-sm px-3.5 py-2 border"
                  :class="
                    message.isAcknowledgement
                      ? 'bg-ink-100/70 border-ink-100 text-ink-500 italic'
                      : 'bg-white border-ink-100 text-ink-900'
                  "
                >
                  <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ message.text }}</p>
                </div>

                <!-- What it found. No booking button here: that is pinned below. -->
                <div
                  v-if="message.reply && !message.isAcknowledgement"
                  class="rounded-xl border border-ink-100 bg-white p-3 space-y-2.5"
                >
                  <!-- Safety first, literally: a warning read after a list of
                       faults is a warning nobody acted on. -->
                  <div
                    v-if="message.reply.urgency === 'HIGH' && message.reply.suggestedActionsVi?.length"
                    class="rounded-lg border border-danger-200 bg-danger-50 p-2.5"
                  >
                    <div class="flex items-center gap-1.5 mb-1">
                      <AlertTriangle :size="14" class="text-danger-700" />
                      <span class="text-xs font-extrabold text-danger-700">
                        Anh/chị làm ngay giúp em
                      </span>
                    </div>
                    <p
                      v-for="(action, index) in message.reply.suggestedActionsVi"
                      :key="index"
                      class="text-[13px] text-danger-900 leading-relaxed"
                    >
                      {{ index + 1 }}. {{ action }}
                    </p>
                  </div>

                  <div v-if="message.reply.device" class="flex flex-wrap gap-1.5">
                    <span class="px-2 py-0.5 rounded-full bg-ink-100 text-xs font-semibold text-ink-900">
                      {{ message.reply.device.nameVi }}
                    </span>
                  </div>

                  <div v-if="message.reply.suspectedFaults?.length">
                    <p class="text-[10px] font-bold uppercase tracking-wide text-ink-500 mb-1">
                      Có thể là
                    </p>
                    <p
                      v-for="fault in message.reply.suspectedFaults"
                      :key="fault.faultCode"
                      class="text-[13px] text-ink-900 leading-relaxed"
                    >
                      • {{ fault.nameVi }}
                    </p>
                  </div>

                  <div
                    v-if="message.reply.urgency !== 'HIGH' && message.reply.suggestedActionsVi?.length"
                  >
                    <p class="text-[10px] font-bold uppercase tracking-wide text-ink-500 mb-1">
                      Anh/chị có thể làm trước
                    </p>
                    <p
                      v-for="(action, index) in message.reply.suggestedActionsVi"
                      :key="index"
                      class="text-[13px] text-ink-900 leading-relaxed"
                    >
                      • {{ action }}
                    </p>
                  </div>

                  <div v-if="message.reply.clarification?.questionsVi?.length">
                    <p class="text-[10px] font-bold uppercase tracking-wide text-ink-500 mb-1">
                      Em hỏi thêm một chút ạ
                    </p>
                    <p
                      v-for="(question, index) in message.reply.clarification.questionsVi"
                      :key="index"
                      class="text-[13px] text-ink-900 leading-relaxed"
                    >
                      {{ question }}
                    </p>
                  </div>

                  <div
                    v-if="priceLabel(message.reply)"
                    class="flex items-center justify-between pt-2 border-t border-ink-100"
                  >
                    <span class="text-xs text-ink-500">Chi phí tham khảo</span>
                    <span class="text-sm font-extrabold text-ink-900 font-num">
                      {{ priceLabel(message.reply) }}
                    </span>
                  </div>
                  <p
                    v-if="message.reply.priceEstimate?.requiresAssessment"
                    class="text-[11px] text-ink-500"
                  >
                    Thợ xem tận nơi rồi mới báo giá chính xác ạ.
                  </p>

                  <p v-if="message.reply.disclaimerVi" class="text-[10px] text-ink-400 leading-snug">
                    {{ message.reply.disclaimerVi }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ChatTypingDots v-if="isThinking" />
        </div>

        <!-- Pinned booking. Stays put; replaced when the assistant changes it. -->
        <div
          v-if="pinnedService"
          class="flex items-center gap-3 px-3.5 py-2.5 bg-brand-50 border-t border-brand-100"
        >
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-wide text-brand-700">
              Dịch vụ đang chọn
            </p>
            <p class="text-sm font-bold text-ink-900 truncate">{{ pinnedService.nameVi }}</p>
            <p class="text-[11px] text-ink-500">Muốn loại khác, cứ nhắn em đổi ạ</p>
          </div>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700"
            @click="goToBooking"
          >
            <CalendarPlus :size="14" />
            Đặt thợ
          </button>
        </div>

        <!-- Picked images -->
        <div v-if="pending.length" class="flex items-center gap-2 px-3.5 py-2 border-t border-ink-100">
          <div v-for="(image, index) in pending" :key="index" class="relative">
            <img :src="image.dataUrl" alt="" class="w-14 h-14 object-cover rounded-lg" />
            <button
              type="button"
              class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ink-900 text-white flex items-center justify-center"
              title="Bỏ ảnh này"
              @click="pending = pending.filter((_, i) => i !== index)"
            >
              <X :size="11" />
            </button>
          </div>
          <span class="text-[11px] text-ink-500">{{ pending.length }}/{{ AI_MAX_IMAGES }} ảnh</span>
        </div>
        <p v-if="problem" class="px-3.5 pb-1 text-[11px] text-danger-600">{{ problem }}</p>

        <!-- Composer -->
        <div class="flex items-end gap-2 px-3 py-2.5 border-t border-ink-100">
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            class="hidden"
            @change="onFiles"
          />
          <button
            type="button"
            class="p-2 rounded-lg text-brand-600 hover:bg-brand-50"
            title="Gửi ảnh thiết bị"
            @click="fileInput?.click()"
          >
            <ImageIcon :size="19" />
          </button>
          <textarea
            v-model="input"
            rows="1"
            placeholder="Nhà mình đang gặp vấn đề gì ạ?"
            class="flex-1 resize-none rounded-xl bg-ink-100/70 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 max-h-28"
            @keydown.enter.exact.prevent="canSend && send()"
          ></textarea>
          <button
            type="button"
            class="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center disabled:bg-ink-300"
            :disabled="!canSend"
            title="Gửi"
            @click="send"
          >
            <Send :size="16" />
          </button>
        </div>
      </div>
    </transition>

    <!-- Its own button, violet and a robot, so it is never mistaken for the
         thread that reaches a real technician. -->
    <button
      type="button"
      class="w-13 h-13 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg hover:bg-violet-700 hover:shadow-xl hover:scale-105 active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-violet-200"
      :title="isOpen ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI'"
      @click="toggle"
    >
      <X v-if="isOpen" :size="24" />
      <Bot v-else :size="24" />
    </button>
  </div>
</template>
