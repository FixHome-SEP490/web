<script setup lang="ts">
// src/components/chat/ChatFloatingWidget.vue
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '../../stores/chat.store';
import { useAuthStore } from '../../stores/auth.store';
import ChatThread from './ChatThread.vue';
import {
  MessageSquare,
  X,
  Search,
  ExternalLink,
  Minus,
  ChevronUp,
} from 'lucide-vue-next';
import { isSameVnDay, vnDateString, vnTimeString } from '../../utils/vn-time';

const router = useRouter();
const route = useRoute();

// The messages page already is the full chat; a second launcher there only duplicates it.
const onMessagesPage = computed(() => /^\/(app|tech)\/messages/.test(route.path));
const chatStore = useChatStore();
const authStore = useAuthStore();

const searchQuery = ref('');
const isMinimized = ref(false);

// Reset minimize state whenever a new conversation is chosen or widget is reopened
watch(
  () => [chatStore.isWidgetOpen, chatStore.activeConversationId],
  ([open, activeId]) => {
    if (open && activeId) {
      isMinimized.value = false;
    }
  },
);

const filteredConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return chatStore.conversations;
  return chatStore.conversations.filter(
    (c) =>
      c.counterpart.fullName.toLowerCase().includes(query) ||
      (c.serviceName && c.serviceName.toLowerCase().includes(query)) ||
      (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(query)),
  );
});

function formatTime(isoString: string | null) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = isSameVnDay(d, now);
    if (isToday) {
      return vnTimeString(d, { hour: '2-digit', minute: '2-digit' });
    }
    return vnDateString(d, { month: 'numeric', day: 'numeric' });
  } catch {
    return '';
  }
}

function handleExpandToPage() {
  chatStore.closeWidget();
  isMinimized.value = false;
  const role = authStore.user?.role?.toUpperCase();
  if (role === 'TECHNICIAN') {
    void router.push('/tech/messages');
  } else {
    void router.push('/app/messages');
  }
}

function handleCloseWidget() {
  chatStore.closeWidget();
  isMinimized.value = false;
}

function handleToggleWidget() {
  if (!chatStore.isWidgetOpen) {
    chatStore.toggleAiPanel(false);
    chatStore.toggleWidget(true);
    isMinimized.value = false;
  } else if (isMinimized.value) {
    isMinimized.value = false;
  } else {
    chatStore.closeWidget();
  }
}
</script>

<template>
  <div v-if="authStore.isAuthenticated && !onMessagesPage">
    <!-- Chat Window Popup (Anchored at bottom, located to the left of the round FAB icon) -->
    <transition
      enter-active-class="transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu origin-bottom sm:origin-bottom-right"
      enter-from-class="opacity-0 translate-y-8 scale-90 sm:scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-[cubic-bezier(0.4,0,1,1)] transform-gpu origin-bottom sm:origin-bottom-right"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-8 scale-90 sm:scale-95"
    >
      <div
        v-if="chatStore.isWidgetOpen"
        class="fixed z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bottom-[var(--fh-dock,0px)] right-2 left-2 sm:left-auto sm:right-22 md:right-24 sm:bottom-0 w-auto sm:w-[380px] md:w-[400px] bg-white rounded-2xl sm:rounded-b-none sm:rounded-t-2xl border border-ink-200 sm:border-b-0 shadow-2xl flex flex-col overflow-hidden"
        :class="[
          isMinimized
            ? 'h-[57px] shadow-lg'
            : 'h-[520px] max-h-[calc(100dvh_-_var(--fh-dock,0px)_-_1rem)] sm:max-h-[calc(100dvh_-_2rem)]'
        ]"
      >
        <!-- Mode 1: Active Thread View -->
        <ChatThread
          v-if="chatStore.activeConversationId"
          :conversation-id="chatStore.activeConversationId"
          full-height
          show-back-button
          show-close-button
          show-expand-button
          show-minimize-button
          :is-minimized="isMinimized"
          @back="chatStore.activeConversationId = null"
          @close="handleCloseWidget"
          @minimize="isMinimized = true"
          @restore="isMinimized = false"
          @expand="handleExpandToPage"
        />

        <!-- Mode 2: Inbox Conversation List -->
        <div v-else class="flex flex-col h-full bg-white">
          <!-- Inbox Header -->
          <div
            class="px-3.5 py-2.5 border-b border-ink-200 bg-white flex items-center justify-between transition-colors select-none"
            :class="isMinimized ? 'cursor-pointer hover:bg-ink-50' : ''"
            @click="isMinimized ? (isMinimized = false) : undefined"
          >
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                <MessageSquare :size="18" />
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-bold text-ink-900 leading-tight">Tin nhắn</h3>
                <p v-if="!isMinimized" class="text-xs text-ink-500 truncate mt-0.5">
                  <span v-if="chatStore.totalUnreadCount > 0" class="text-brand-600 font-semibold">
                    {{ chatStore.totalUnreadCount }} tin nhắn mới
                  </span>
                  <span v-else>{{ authStore.user?.role?.toUpperCase() === 'TECHNICIAN' ? 'Trao đổi với khách hàng' : 'Trao đổi với kỹ thuật viên' }}</span>
                </p>
              </div>
            </div>

            <!-- Inbox Header Actions: Vào page chat -> Thu gọn -> Thoát -->
            <div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
              <button
                v-if="!isMinimized"
                type="button"
                class="p-1.5 text-ink-500 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
                @click.stop="handleExpandToPage"
                title="Mở trong trang Tin nhắn đầy đủ"
                aria-label="Mở trong trang Tin nhắn đầy đủ"
              >
                <ExternalLink :size="17" />
              </button>
              <button
                type="button"
                class="p-1.5 text-ink-500 hover:text-ink-900 rounded-lg hover:bg-ink-100 transition-colors"
                @click.stop="isMinimized = !isMinimized"
                :title="isMinimized ? 'Mở rộng danh sách tin nhắn' : 'Thu gọn danh sách tin nhắn'"
                :aria-label="isMinimized ? 'Mở rộng' : 'Thu gọn'"
              >
                <ChevronUp v-if="isMinimized" :size="17" />
                <Minus v-else :size="17" />
              </button>
              <button
                type="button"
                class="p-1.5 text-ink-500 hover:text-danger-600 rounded-lg hover:bg-danger-50 transition-colors"
                @click.stop="handleCloseWidget"
                title="Đóng cửa sổ"
                aria-label="Đóng cửa sổ"
              >
                <X :size="17" />
              </button>
            </div>
          </div>

          <!-- Body of Inbox (Search, List, Footer) hidden when minimized -->
          <transition
            enter-active-class="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-200 ease-[cubic-bezier(0.4,0,1,1)]"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div v-show="!isMinimized" class="flex-1 flex flex-col min-h-0 overflow-hidden">
              <!-- Search Bar -->
              <div class="p-2.5 border-b border-ink-100 bg-ink-25">
                <div class="relative">
                  <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Tìm hội thoại, dịch vụ..."
                    class="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-ink-200 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all text-ink-900"
                  />
                </div>
              </div>

              <!-- Conversations List -->
              <div class="flex-1 overflow-y-auto divide-y divide-ink-100">
                <!-- Loading -->
                <div
                  v-if="chatStore.loadingConversations && chatStore.conversations.length === 0"
                  class="p-6 text-center text-xs text-ink-400"
                >
                  Đang tải danh sách tin nhắn...
                </div>

                <!-- Empty List -->
                <div
                  v-else-if="filteredConversations.length === 0"
                  class="h-full flex flex-col items-center justify-center p-6 text-center text-ink-400"
                >
                  <MessageSquare :size="32" class="text-ink-300 mb-2" />
                  <p class="text-xs font-medium text-ink-700">Chưa có cuộc trò chuyện nào</p>
                  <p class="text-[11px] text-ink-400 mt-0.5">
                    Khi có đơn dịch vụ được nhận, khung trò chuyện sẽ tự động xuất hiện tại đây.
                  </p>
                </div>

                <!-- Items -->
                <button
                  v-for="conv in filteredConversations"
                  :key="conv.id"
                  type="button"
                  class="w-full p-3 flex items-start gap-2.5 text-left hover:bg-ink-50 transition-colors relative group"
                  :class="{ 'bg-brand-50/40': conv.unreadCount > 0 }"
                  @click="chatStore.selectConversation(conv.id)"
                >
                  <!-- Avatar -->
                  <div class="relative flex-shrink-0 mt-0.5">
                    <div class="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-brand-200">
                      <img
                        v-if="conv.counterpart?.avatarUrl"
                        :src="conv.counterpart.avatarUrl"
                        :alt="conv.counterpart.fullName"
                        class="w-full h-full object-cover"
                      />
                      <span v-else>{{ conv.counterpart?.fullName?.charAt(0) || 'U' }}</span>
                    </div>
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1 mb-0.5">
                      <h4 class="text-xs font-bold text-ink-900 truncate">
                        {{ conv.counterpart?.fullName }}
                      </h4>
                      <span class="text-[10px] text-ink-400 flex-shrink-0 font-num">
                        {{ formatTime(conv.lastMessageAt) }}
                      </span>
                    </div>

                    <!-- Service tag -->
                    <div v-if="conv.serviceName" class="text-[11px] text-brand-600 font-medium truncate mb-0.5">
                      {{ conv.serviceName }}
                    </div>

                    <!-- Preview text -->
                    <p
                      class="text-xs truncate"
                      :class="conv.unreadCount > 0 ? 'font-semibold text-ink-900' : 'text-ink-500'"
                    >
                      {{ conv.lastMessagePreview || 'Bắt đầu cuộc trò chuyện' }}
                    </p>
                  </div>

                  <!-- Unread badge -->
                  <div v-if="conv.unreadCount > 0" class="flex-shrink-0 self-center">
                    <span class="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-600 text-white font-num leading-none">
                      {{ conv.unreadCount }}
                    </span>
                  </div>
                </button>
              </div>

              <!-- Footer: Mở toàn bộ trang Tin nhắn -->
              <div class="p-2.5 border-t border-ink-100 bg-ink-25 text-center flex-shrink-0">
                <button
                  type="button"
                  class="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1.5"
                  @click="handleExpandToPage"
                >
                  <span>Xem tất cả trong trang Tin nhắn</span>
                  <ExternalLink :size="13" />
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </transition>

    <!-- Floating Action Button (FAB) (Fixed at bottom right) -->
    <div
      class="fixed bottom-[var(--fh-dock,1.25rem)] right-4 sm:right-5 z-40"
    >
      <button
        type="button"
        class="relative w-13 h-13 rounded-full text-white flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-105 active:scale-95 cursor-pointer shadow-lg hover:shadow-xl"
        :class="[
          chatStore.isWidgetOpen && !isMinimized
            ? 'bg-brand-700 ring-4 ring-brand-100'
            : 'bg-brand-600 hover:bg-brand-700'
        ]"
        :aria-label="chatStore.isWidgetOpen ? (isMinimized ? 'Mở lại tin nhắn' : 'Thu gọn tin nhắn') : 'Mở tin nhắn'"
        @click="handleToggleWidget"
        :title="chatStore.isWidgetOpen ? (isMinimized ? 'Mở lại khung chat' : 'Đóng / Thu gọn chat') : 'Mở tin nhắn hỗ trợ'"
      >
        <MessageSquare :size="24" class="transition-transform duration-300" :class="chatStore.isWidgetOpen ? 'scale-90' : 'scale-100'" />

        <!-- Total Unread Badge -->
        <span
          v-if="chatStore.totalUnreadCount > 0"
          class="absolute -top-1 -right-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-danger-600 text-white font-num leading-none border-2 border-white shadow-xs"
        >
          {{ chatStore.totalUnreadCount > 99 ? '99+' : chatStore.totalUnreadCount }}
        </span>
      </button>
    </div>
  </div>
</template>
