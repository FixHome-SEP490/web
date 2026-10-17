<script setup lang="ts">
// src/components/chat/ChatThread.vue
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useChatStore } from '../../stores/chat.store';
import { useAuthStore } from '../../stores/auth.store';
import ChatMessageItem from './ChatMessageItem.vue';
import ChatTypingDots from './ChatTypingDots.vue';
import {
  Send,
  ArrowLeft,
  X,
  ExternalLink,
  Minus,
  ChevronUp,
  Lock,
  ChevronDown,
  Wrench,
  UserCheck,
  Phone,
  Paperclip,
  ShieldCheck,
} from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
import { useCallStore } from '../../stores/call.store';
import { CHAT_IMAGE_TYPES, CHAT_VIDEO_TYPES, chatAttachmentProblem } from '../../api/messaging.api';

const props = withDefaults(
  defineProps<{
    conversationId: string;
    showCloseButton?: boolean;
    showExpandButton?: boolean;
    showMinimizeButton?: boolean;
    isMinimized?: boolean;
    showBackButton?: boolean;
    fullHeight?: boolean;
  }>(),
  {
    showCloseButton: false,
    showExpandButton: false,
    showMinimizeButton: false,
    isMinimized: false,
    showBackButton: false,
    fullHeight: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'expand'): void;
  (e: 'minimize'): void;
  (e: 'restore'): void;
  (e: 'back'): void;
}>();

const chatStore = useChatStore();
const authStore = useAuthStore();

const messageInput = ref('');
const sending = ref(false);
const scrollContainer = ref<HTMLDivElement | null>(null);
const shouldAutoScroll = ref(true);
const showScrollToBottom = ref(false);

const conversation = computed(() => {
  return (
    chatStore.conversations.find((c) => c.id === props.conversationId) ||
    chatStore.activeConversation
  );
});

const messages = computed(() => {
  return chatStore.messages[props.conversationId] || [];
});

const canSend = computed(() => {
  if (!conversation.value) return false;
  // The backend already decides this - status is ACTIVE and the viewer is a
  // participant - so asking the same question again here bought nothing and
  // cost everything: it compared against 'ACTIVE' while the wire carries
  // 'active', so every open conversation rendered as "Khung trò chuyện đã
  // đóng" and the whole feature looked unbuilt. The mobile app reads canSend
  // alone, which is why it worked.
  return conversation.value.canSend !== false;
});

/** PO 18/10/2026: the order is done, so the chat is closed until a warranty claim reopens it. */
const closedByCompletion = computed(() => conversation.value?.closedReason === 'order_completed');
const viewerIsCustomer = computed(() => authStore.hasRole('customer'));

// Photos and short videos in the chat (PO 18/10/2026).
const fileInput = ref<HTMLInputElement | null>(null);
const attachError = ref('');
const acceptTypes = [...CHAT_IMAGE_TYPES, ...CHAT_VIDEO_TYPES].join(',');

function pickAttachment() {
  attachError.value = '';
  fileInput.value?.click();
}

async function onAttachmentPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || sending.value || !canSend.value) return;
  const problem = chatAttachmentProblem(file);
  if (problem) {
    attachError.value = problem;
    return;
  }
  const caption = messageInput.value.trim();
  sending.value = true;
  attachError.value = '';
  messageInput.value = '';
  try {
    await chatStore.sendAttachment(file, caption);
    scrollToBottom(true);
  } catch {
    messageInput.value = caption;
    attachError.value = file.type.startsWith('video/')
      ? 'Chưa gửi được video, vui lòng thử lại.'
      : 'Chưa gửi được ảnh, vui lòng thử lại.';
  } finally {
    sending.value = false;
  }
}

const callStore = useCallStore();

const callButtonTitle = computed(() => {
  if (callStore.isBusy) return 'Đang có cuộc gọi khác';
  if (!chatStore.isSocketConnected) return 'Mất kết nối, chưa gọi được';
  return 'Gọi thoại';
});

function startVoiceCall() {
  void callStore.startCall(props.conversationId);
}

const counterpartRoleLabel = computed(() => {
  const role = conversation.value?.counterpart?.role?.toUpperCase();
  if (role === 'TECHNICIAN') return 'Kỹ thuật viên';
  if (role === 'CUSTOMER') return 'Khách hàng';
  return 'Người dùng';
});

// Scroll handling
function handleScroll() {
  if (!scrollContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;

  // If scrolled up more than 100px from bottom, stop auto-scrolling
  const isNearBottom = scrollHeight - (scrollTop + clientHeight) < 100;
  shouldAutoScroll.value = isNearBottom;
  showScrollToBottom.value = !isNearBottom;

  // Load older messages when scrolled near top
  if (scrollTop < 40 && !chatStore.loadingMore) {
    void chatStore.loadOlderMessages(props.conversationId);
  }
}

function scrollToBottom(smooth = true) {
  void nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTo({
        top: scrollContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      showScrollToBottom.value = false;
      shouldAutoScroll.value = true;
    }
  });
}

// Watch incoming messages to scroll if near bottom
watch(
  () => messages.value.length,
  (newLen, oldLen) => {
    if (newLen > oldLen && shouldAutoScroll.value) {
      scrollToBottom();
    }
  },
);

// Initial load
onMounted(async () => {
  if (props.conversationId) {
    await chatStore.selectConversation(props.conversationId);
    scrollToBottom(false);
  }
});

watch(
  () => props.conversationId,
  async (newId) => {
    if (newId) {
      await chatStore.selectConversation(newId);
      scrollToBottom(false);
    }
  },
);

// Typing handling
function onInputKeyup(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void handleSend();
    return;
  }
  chatStore.sendTyping(messageInput.value.length > 0);
}

async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || sending.value || !canSend.value) return;

  sending.value = true;
  messageInput.value = '';
  try {
    await chatStore.sendMessage(text);
    scrollToBottom(true);
  } catch (err) {
    console.error('Failed to send message:', err);
    messageInput.value = text; // restore on error
  } finally {
    sending.value = false;
  }
}

function handleEdit(messageId: string, content: string) {
  void chatStore.editMessage(messageId, content);
}

function handleDelete(messageId: string) {
  void chatStore.deleteMessage(messageId);
}

function handleHeaderClick() {
  if (props.isMinimized) {
    emit('restore');
  }
}
</script>

<template>
  <div
    class="flex flex-col bg-white overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
    :class="[
      fullHeight
        ? (isMinimized ? 'h-[57px]' : 'h-full')
        : (isMinimized ? 'h-[57px]' : 'h-[500px]')
    ]"
  >
    <!-- Thread Header -->
    <header
      class="px-3.5 py-2.5 bg-white border-b border-ink-200 flex items-center justify-between gap-2 flex-shrink-0 shadow-xs z-10 transition-colors"
      :class="isMinimized ? 'cursor-pointer hover:bg-ink-50 select-none' : ''"
      @click="handleHeaderClick"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <!-- Back button (only shown when not minimized) -->
        <button
          v-if="showBackButton && !isMinimized"
          type="button"
          class="p-1 -ml-1 text-ink-500 hover:text-ink-900 rounded-md hover:bg-ink-100 transition-colors flex-shrink-0"
          @click.stop="emit('back')"
          title="Quay lại danh sách"
          aria-label="Quay lại danh sách"
        >
          <ArrowLeft :size="18" />
        </button>

        <!-- Avatar -->
        <div class="relative flex-shrink-0">
          <div class="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-brand-200">
            <img
              v-if="conversation?.counterpart?.avatarUrl"
              :src="conversation.counterpart.avatarUrl"
              :alt="conversation.counterpart.fullName"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ conversation?.counterpart?.fullName?.charAt(0) || 'U' }}</span>
          </div>
          <!-- Online status dot -->
          <span
            class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
            :class="chatStore.isSocketConnected ? 'bg-success-600' : 'bg-ink-300'"
            :title="chatStore.isSocketConnected ? 'Đã kết nối' : 'Đang kết nối lại…'"
          ></span>
        </div>

        <!-- Name & Details -->
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <h3 class="text-sm font-bold text-ink-900 truncate">
              {{ conversation?.counterpart?.fullName || 'Đang tải...' }}
            </h3>
            <span
              v-if="!isMinimized"
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-ink-100 text-ink-600 leading-none flex-shrink-0"
            >
              <Wrench v-if="conversation?.counterpart?.role === 'TECHNICIAN'" :size="10" />
              <UserCheck v-else :size="10" />
              {{ counterpartRoleLabel }}
            </span>
          </div>
          <p v-if="!isMinimized" class="text-xs text-ink-500 truncate mt-0.5">
            <span v-if="conversation?.serviceName" class="font-medium text-brand-600">
              {{ conversation.serviceName }}
            </span>
            <span v-else>Cuộc trò chuyện theo đơn</span>
          </p>
        </div>
      </div>

      <!-- Header Actions: Phone -> Vào trang chat -> Thu gọn -> Thoát -->
      <div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <!-- 1. Phone (Voice call) -->
        <button
          v-if="canSend && !isMinimized"
          type="button"
          class="p-1.5 text-ink-500 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="callStore.isBusy || !chatStore.isSocketConnected"
          :title="callButtonTitle"
          :aria-label="callButtonTitle"
          @click.stop="startVoiceCall"
        >
          <Phone :size="17" />
        </button>

        <!-- 2. Vào trang chat (Mở trang tin nhắn đầy đủ) -->
        <button
          v-if="showExpandButton && !isMinimized"
          type="button"
          class="p-1.5 text-ink-500 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
          @click.stop="emit('expand')"
          title="Mở trong trang Tin nhắn đầy đủ"
          aria-label="Mở trong trang Tin nhắn đầy đủ"
        >
          <ExternalLink :size="17" />
        </button>

        <!-- 3. Thu gọn / Mở rộng -->
        <button
          v-if="showMinimizeButton"
          type="button"
          class="p-1.5 text-ink-500 hover:text-ink-900 rounded-lg hover:bg-ink-100 transition-colors"
          @click.stop="isMinimized ? emit('restore') : emit('minimize')"
          :title="isMinimized ? 'Mở rộng khung chat' : 'Thu gọn khung chat'"
          :aria-label="isMinimized ? 'Mở rộng khung chat' : 'Thu gọn khung chat'"
        >
          <ChevronUp v-if="isMinimized" :size="17" />
          <Minus v-else :size="17" />
        </button>

        <!-- 4. Thoát (Đóng chat) -->
        <button
          v-if="showCloseButton"
          type="button"
          class="p-1.5 text-ink-500 hover:text-danger-600 rounded-lg hover:bg-danger-50 transition-colors"
          @click.stop="emit('close')"
          title="Đóng chat"
          aria-label="Đóng chat"
        >
          <X :size="17" />
        </button>
      </div>
    </header>

    <!-- Body Content (Stream & Composer, hidden when minimized) -->
    <transition
      enter-active-class="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-show="!isMinimized" class="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <!-- Read-only Banner (if applicable) -->
        <div
          v-if="!canSend && conversation && closedByCompletion"
          class="px-3 py-2 bg-warning-50 border-b border-warning-200 text-warning-800 text-xs flex flex-wrap items-center gap-x-2 gap-y-1.5 flex-shrink-0"
          data-testid="chat-closed-completed"
        >
          <Lock :size="14" class="flex-shrink-0 text-warning-600" />
          <span class="flex-1 min-w-[180px]">
            {{ viewerIsCustomer
              ? 'Đơn đã hoàn tất nên cuộc trò chuyện đã khoá. Nếu thiết bị gặp lại vấn đề, hãy gửi yêu cầu bảo hành để nhắn tin lại với kỹ thuật viên.'
              : 'Đơn đã hoàn tất nên cuộc trò chuyện đã khoá. Khi khách gửi yêu cầu bảo hành, cuộc trò chuyện sẽ mở lại.' }}
          </span>
          <RouterLink
            v-if="viewerIsCustomer && conversation.serviceOrderId"
            :to="{ name: 'customer-order-detail', params: { id: conversation.serviceOrderId }, query: { claimWarranty: 'true' } }"
            class="inline-flex items-center gap-1 rounded-lg bg-white border border-warning-300 px-2.5 py-1 font-semibold text-warning-800 hover:bg-warning-100 whitespace-nowrap"
            data-testid="chat-claim-warranty"
          >
            <ShieldCheck :size="13" /> Yêu cầu bảo hành
          </RouterLink>
        </div>
        <div
          v-else-if="!canSend && conversation"
          class="px-3 py-2 bg-warning-50 border-b border-warning-200 text-warning-800 text-xs flex items-center gap-2 flex-shrink-0"
        >
          <Lock :size="14" class="flex-shrink-0 text-warning-600" />
          <span>Cuộc trò chuyện này đang ở chế độ chỉ đọc do đơn dịch vụ đã chuyển trạng thái.</span>
        </div>

        <!-- Message Stream -->
        <div
          ref="scrollContainer"
          class="flex-1 overflow-y-auto p-4 bg-ink-25 relative"
          @scroll="handleScroll"
        >
          <!-- Loading older indicator -->
          <div v-if="chatStore.loadingMore" class="text-center py-2 text-xs text-ink-400">
            Đang tải tin nhắn cũ...
          </div>

          <!-- Empty Conversation State -->
          <div
            v-if="!chatStore.loadingMessages && messages.length === 0"
            class="h-full flex flex-col items-center justify-center text-center p-6 text-ink-500"
          >
            <div class="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
              <Send :size="20" />
            </div>
            <p class="text-sm font-semibold text-ink-800">Chưa có tin nhắn nào</p>
            <p class="text-xs text-ink-500 mt-1 max-w-[220px]">
              Hãy gửi tin nhắn để trao đổi chi tiết về tình trạng thiết bị và thời gian sửa chữa.
            </p>
          </div>

          <!-- Message Items -->
          <template v-else>
            <ChatMessageItem
              v-for="msg in messages"
              :key="msg.id"
              :message="msg"
              :is-me="msg.senderId === authStore.user?.id"
              :counterpart-name="conversation?.counterpart?.fullName"
              :counterpart-avatar="conversation?.counterpart?.avatarUrl"
              @edit="handleEdit"
              @delete="handleDelete"
            />
          </template>

          <!-- Typing Indicator Bubble -->
          <div
            v-if="chatStore.isCounterpartTyping"
            class="flex items-center gap-2 mb-2 text-xs text-ink-500"
          >
            <ChatTypingDots />
            <span class="italic text-[11px]">
              {{ conversation?.counterpart?.fullName || 'Đối phương' }} đang soạn tin...
            </span>
          </div>

          <!-- Scroll to bottom pill button -->
          <button
            v-if="showScrollToBottom"
            type="button"
            class="sticky bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-brand-600 text-white text-xs font-semibold shadow-md flex items-center gap-1 hover:bg-brand-700 transition-all z-10"
            @click="scrollToBottom(true)"
          >
            <span>Tin nhắn mới</span>
            <ChevronDown :size="14" />
          </button>
        </div>

        <!-- Message Composer / Input Area -->
        <footer class="p-3 bg-white border-t border-ink-200 flex-shrink-0">
          <p v-if="canSend && attachError" class="mb-2 text-xs text-danger-700" role="alert" data-testid="chat-attach-error">{{ attachError }}</p>
          <form
            v-if="canSend"
            class="flex items-end gap-2"
            @submit.prevent="handleSend"
          >
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              :accept="acceptTypes"
              data-testid="chat-attach-input"
              @change="onAttachmentPicked"
            />
            <button
              type="button"
              class="p-2.5 rounded-xl border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              title="Gửi ảnh hoặc video"
              aria-label="Gửi ảnh hoặc video"
              :disabled="sending"
              data-testid="chat-attach"
              @click="pickAttachment"
            >
              <Paperclip :size="18" />
            </button>
            <div class="flex-1 bg-ink-50 border border-ink-200 rounded-xl focus-within:border-brand-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-brand-500 transition-all px-3 py-2">
              <textarea
                v-model="messageInput"
                rows="1"
                placeholder="Nhập tin nhắn... (Enter để gửi)"
                class="w-full bg-transparent border-none outline-none text-sm text-ink-900 placeholder:text-ink-400 resize-none max-h-24"
                :disabled="sending"
                @keydown="onInputKeyup"
              ></textarea>
            </div>

            <button
              type="submit"
              :disabled="!messageInput.trim() || sending"
              class="p-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs flex-shrink-0"
              title="Gửi tin nhắn"
            >
              <Send :size="18" />
            </button>
          </form>

          <div
            v-else
            class="py-2 text-center text-xs text-ink-400 bg-ink-50 rounded-lg border border-ink-200"
          >
            {{ closedByCompletion ? 'Cuộc trò chuyện đã khoá vì đơn đã hoàn tất' : 'Khung trò chuyện đã đóng' }}
          </div>
        </footer>
      </div>
    </transition>
  </div>
</template>
