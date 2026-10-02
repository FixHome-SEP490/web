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
// nothing to do with today's question. The conversation itself lives in
// useAiConversation, shared with the booking form's diagnosis step.

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bot, X, RotateCcw, CalendarPlus } from 'lucide-vue-next';
import AiConversationThread from './AiConversationThread.vue';
import { useChatStore } from '../../stores/chat.store';
import { useAiConversation, SESSION_IDLE_MINUTES } from '../../composables/useAiConversation';

const GREETING =
  'Dạ em chào anh/chị, em là trợ lý của FixHome ạ. Anh/chị đang gặp vấn đề gì ở ' +
  'nhà mình thì kể em nghe, hoặc gửi em tấm ảnh thiết bị để em xem giúp nhé.';

const router = useRouter();
const chatStore = useChatStore();
const route = useRoute();

// Sits above the chat launcher; takes its place while open (the chat launcher
// hides then) or where there is no chat launcher, on the messages page.
const stackedAboveChat = computed(
  () => !isOpen.value && !/^\/(app|tech)\/messages/.test(route.path),
);
// Shared with the chat panel so the two never open together.
const isOpen = computed({
  get: () => chatStore.isAiPanelOpen,
  set: (open: boolean) => chatStore.toggleAiPanel(open),
});

const conversation = useAiConversation({ greeting: GREETING });
const { turnCount, pinnedService, sessionId, startOver, loadHoldingLines, customerWords } = conversation;

async function toggle() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) await loadHoldingLines();
}

/**
 * Chat does not book. It carries the service, the customer's own words and the
 * conversation into the booking flow; the backend turns the conversation into
 * the summary the technician receives on accepting.
 */
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
      aiSession: sessionId.value || undefined,
      desc: customerWords() || undefined,
    },
  });
}
</script>

<template>
  <div
    class="fixed right-4 sm:right-5 z-40 flex flex-col items-end"
    :class="stackedAboveChat ? 'bottom-[calc(var(--fh-dock,1.25rem)_+_4rem)]' : 'bottom-[var(--fh-dock,1.25rem)]'"
  >
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="isOpen"
        class="mb-3 w-[calc(100vw_-_2rem)] sm:w-[26rem] h-[32rem] max-h-[calc(100dvh_-_var(--fh-dock,1.25rem)_-_6rem)] rounded-2xl bg-white shadow-(--shadow-e3) border border-ink-200 flex flex-col overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
          <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
            <Bot :size="17" class="text-brand-700" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-ink-900 leading-tight">Trợ lý FixHome</p>
            <p class="text-xs text-ink-500 leading-tight">
              {{
                turnCount > 0
                  ? `Đang nhớ cuộc trò chuyện · quên sau ${SESSION_IDLE_MINUTES} phút`
                  : 'Chẩn đoán sơ bộ, không thay thợ'
              }}
            </p>
          </div>
          <button
            type="button"
            class="p-1.5 rounded-lg text-ink-400 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-transparent"
            :disabled="turnCount === 0"
            title="Bắt đầu phiên mới"
            aria-label="Bắt đầu phiên mới"
            @click="startOver"
          >
            <RotateCcw :size="16" />
          </button>
        </div>

        <AiConversationThread :conversation="conversation" class="flex-1 min-h-0">
          <!-- Pinned booking. Stays put; replaced when the assistant changes it. -->
          <template #pinned>
            <div v-if="pinnedService" class="flex items-center gap-3 px-3.5 py-2.5 bg-brand-50 border-t border-brand-100">
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-brand-700">Dịch vụ đang chọn</p>
                <p class="text-sm font-bold text-ink-900 truncate">{{ pinnedService.nameVi }}</p>
                <p class="text-xs text-ink-500">Muốn loại khác, cứ nhắn em đổi ạ</p>
              </div>
              <button
                type="button"
                data-testid="ai-book-technician"
                class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 whitespace-nowrap"
                @click="goToBooking"
              >
                <CalendarPlus :size="14" />
                Đặt thợ
              </button>
            </div>
          </template>
        </AiConversationThread>
      </div>
    </transition>

    <!-- Its own look, white with a robot, so it is never mistaken for the
         solid chat button that reaches a real technician. -->
    <button
      v-if="!chatStore.isWidgetOpen"
      type="button"
      class="w-13 h-13 rounded-full bg-white border border-ink-200 text-brand-600 flex items-center justify-center shadow-(--shadow-e2) hover:bg-brand-50 active:scale-95 transition-[background-color,transform] duration-150"
      :aria-label="isOpen ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI'"
      :title="isOpen ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI'"
      @click="toggle"
    >
      <X v-if="isOpen" :size="24" />
      <Bot v-else :size="24" />
    </button>
  </div>
</template>
