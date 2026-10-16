<script setup lang="ts">
// src/components/chat/AiAssistantWidget.vue
//
// The AI assistant, as a floating panel beside the human chat.
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bot, X, RotateCcw, CalendarPlus, Minus, ChevronUp } from 'lucide-vue-next';
import AiConversationThread from './AiConversationThread.vue';
import { useChatStore } from '../../stores/chat.store';
import { useSharedAiConversation, SESSION_IDLE_MINUTES } from '../../composables/useAiConversation';

const router = useRouter();
const chatStore = useChatStore();
const route = useRoute();

const isAiMinimized = ref(false);

// Sits above the chat launcher except on the messages page where there is no human chat launcher.
const stackedAboveChat = computed(
  () => !/^\/(app|tech)\/messages/.test(route.path),
);

// Shared with the chat panel so the two never open together.
const isOpen = computed({
  get: () => chatStore.isAiPanelOpen,
  set: (open: boolean) => chatStore.toggleAiPanel(open),
});

// Shared with the booking form, which continues it after "Đặt thợ".
const conversation = useSharedAiConversation();

/** Pages that hold the assistant conversation themselves (the booking form). */
const hiddenHere = computed(() => route.meta?.hidesAssistant === true);
const { turnCount, pinnedService, sessionId, startOver, loadHoldingLines, customerWords, isThinking } = conversation;

/**
 * The booking card shows only once the assistant has finished answering. While
 * a follow-up is being worked on, the service it pinned may be about to change,
 * and a button offering the old one beside a reply still being written reads
 * as the assistant answering before it has listened.
 */
const showBooking = computed(() => !!pinnedService.value && !isThinking.value);

async function toggle() {
  const nextOpen = !isOpen.value;
  if (nextOpen) {
    // Explicitly close human chat widget so opening AI modal immediately hides Message modal
    chatStore.closeWidget();
    isAiMinimized.value = false;
  }
  isOpen.value = nextOpen;
  if (nextOpen) {
    await loadHoldingLines();
  }
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
    name: 'ai-booking',
    query: {
      serviceId: service.serviceId || undefined,
      q: service.nameVi,
      aiSession: sessionId.value || undefined,
      desc: customerWords() || undefined,
    },
  });
}
</script>

<template>
  <div v-if="!hiddenHere">
    <!-- AI Assistant Modal Popup (Anchored at bottom, located to the left of the round FAB icons - same position and alignment as Message modal) -->
    <transition
      enter-active-class="transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu origin-bottom sm:origin-bottom-right"
      enter-from-class="opacity-0 translate-y-8 scale-90 sm:scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-[cubic-bezier(0.4,0,1,1)] transform-gpu origin-bottom sm:origin-bottom-right"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-6 scale-90 sm:scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bottom-[var(--fh-dock,0px)] right-2 left-2 sm:left-auto sm:right-22 md:right-24 sm:bottom-0 w-auto sm:w-[380px] md:w-[400px] bg-white rounded-2xl sm:rounded-b-none sm:rounded-t-2xl border border-ink-200 sm:border-b-0 shadow-2xl flex flex-col overflow-hidden"
        :class="[
          isAiMinimized
            ? 'h-[57px] shadow-lg'
            : 'h-[520px] max-h-[calc(100dvh_-_var(--fh-dock,0px)_-_1rem)] sm:max-h-[calc(100dvh_-_2rem)]'
        ]"
      >
        <!-- Header -->
        <div
          class="px-3.5 py-2.5 border-b border-ink-100 bg-white flex items-center justify-between gap-2 flex-shrink-0 transition-colors"
          :class="isAiMinimized ? 'cursor-pointer hover:bg-ink-50 select-none' : ''"
          @click="isAiMinimized ? (isAiMinimized = false) : null"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <Bot :size="17" class="text-brand-700" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-bold text-ink-900 leading-tight">Trợ lý FixHome</p>
              <p v-if="!isAiMinimized" class="text-xs text-ink-500 leading-tight truncate mt-0.5">
                {{
                  turnCount > 0
                    ? `Đang nhớ cuộc trò chuyện · quên sau ${SESSION_IDLE_MINUTES} phút`
                    : 'Chẩn đoán sơ bộ, không thay thợ'
                }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
            <button
              v-if="!isAiMinimized"
              type="button"
              class="p-1.5 rounded-lg text-ink-400 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              :disabled="turnCount === 0"
              title="Bắt đầu phiên mới"
              aria-label="Bắt đầu phiên mới"
              @click.stop="startOver"
            >
              <RotateCcw :size="16" />
            </button>
            <button
              type="button"
              class="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
              :title="isAiMinimized ? 'Mở rộng trợ lý AI' : 'Thu gọn trợ lý AI'"
              :aria-label="isAiMinimized ? 'Mở rộng trợ lý AI' : 'Thu gọn trợ lý AI'"
              @click.stop="isAiMinimized = !isAiMinimized"
            >
              <ChevronUp v-if="isAiMinimized" :size="16" />
              <Minus v-else :size="16" />
            </button>
            <button
              type="button"
              class="p-1.5 rounded-lg text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
              title="Đóng trợ lý AI"
              aria-label="Đóng trợ lý AI"
              @click.stop="toggle"
            >
              <X :size="17" />
            </button>
          </div>
        </div>

        <!-- Body with transition -->
        <transition
          enter-active-class="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div v-show="!isAiMinimized" class="flex-1 min-h-0 flex flex-col">
            <AiConversationThread :conversation="conversation" class="flex-1 min-h-0">
              <!-- Pinned booking. Stays put; replaced when the assistant changes it. -->
              <template #pinned>
                <transition
                  enter-active-class="transition duration-200 ease-out"
                  enter-from-class="opacity-0 translate-y-1"
                  leave-active-class="transition duration-100 ease-in"
                  leave-to-class="opacity-0"
                >
                <div v-if="showBooking && pinnedService" class="flex items-center gap-3 px-3.5 py-2.5 bg-brand-50 border-t border-brand-100 flex-shrink-0">
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
                </transition>
              </template>
            </AiConversationThread>
          </div>
        </transition>
      </div>
    </transition>

    <!-- Floating Action Button for AI (always fixed above the chat FAB) -->
    <div
      class="fixed right-4 sm:right-5 z-40"
      :class="stackedAboveChat ? 'bottom-[calc(var(--fh-dock,1.25rem)_+_4rem)]' : 'bottom-[var(--fh-dock,1.25rem)]'"
    >
      <button
        type="button"
        class="w-13 h-13 rounded-full border flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-105 active:scale-95 cursor-pointer shadow-lg hover:shadow-xl"
        :class="[
          isOpen
            ? 'bg-brand-50 border-brand-400 text-brand-700 ring-4 ring-brand-100 shadow-xl'
            : 'bg-white border-ink-200 text-brand-600 shadow-(--shadow-e2) hover:bg-brand-50'
        ]"
        :aria-label="isOpen ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI'"
        :title="isOpen ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI'"
        @click="toggle"
      >
        <X v-if="isOpen" :size="24" />
        <Bot v-else :size="24" />
      </button>
    </div>
  </div>
</template>
