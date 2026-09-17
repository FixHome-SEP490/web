<script setup lang="ts">
// src/components/chat/ChatFloatingWidget.vue
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../../stores/chat.store';
import { useAuthStore } from '../../stores/auth.store';
import ChatThread from './ChatThread.vue';
import {
  MessageSquare,
  X,
  Search,
  Maximize2,
} from 'lucide-vue-next';

const router = useRouter();
const chatStore = useChatStore();
const authStore = useAuthStore();

const searchQuery = ref('');

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
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' });
  } catch {
    return '';
  }
}

function handleExpandToPage() {
  chatStore.closeWidget();
  const role = authStore.user?.role?.toUpperCase();
  if (role === 'TECHNICIAN') {
    void router.push('/tech/messages');
  } else {
    void router.push('/app/messages');
  }
}
</script>

<template>
  <div v-if="authStore.isAuthenticated" class="fixed bottom-5 right-5 z-40 flex flex-col items-end">
    <!-- Chat Window Popup -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-4"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4"
    >
      <div
        v-if="chatStore.isWidgetOpen"
        class="mb-3 w-[370px] sm:w-[400px] h-[520px] max-h-[calc(100vh-100px)] bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) flex flex-col overflow-hidden"
      >
        <!-- Mode 1: Active Thread View -->
        <ChatThread
          v-if="chatStore.activeConversationId"
          :conversation-id="chatStore.activeConversationId"
          full-height
          show-back-button
          show-close-button
          show-expand-button
          @back="chatStore.activeConversationId = null"
          @close="chatStore.closeWidget()"
          @expand="handleExpandToPage"
        />

        <!-- Mode 2: Inbox Conversation List -->
        <div v-else class="flex flex-col h-full bg-white">
          <!-- Inbox Header -->
          <div class="p-3.5 border-b border-ink-200 bg-white flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <MessageSquare :size="18" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-ink-900 leading-tight">Tin nhắn</h3>
                <p class="text-xs text-ink-500">
                  <span v-if="chatStore.totalUnreadCount > 0" class="text-brand-600 font-semibold">
                    {{ chatStore.totalUnreadCount }} tin nhắn mới
                  </span>
                  <span v-else>Trao đổi với kỹ thuật viên</span>
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button
                type="button"
                class="p-1.5 text-ink-400 hover:text-ink-700 rounded-md hover:bg-ink-100 transition-colors"
                @click="handleExpandToPage"
                title="Mở toàn màn hình"
              >
                <Maximize2 :size="16" />
              </button>
              <button
                type="button"
                class="p-1.5 text-ink-400 hover:text-ink-700 rounded-md hover:bg-ink-100 transition-colors"
                @click="chatStore.closeWidget()"
                title="Đóng cửa sổ"
              >
                <X :size="18" />
              </button>
            </div>
          </div>

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
        </div>
      </div>
    </transition>

    <!-- Floating Action Button (FAB) -->
    <button
      type="button"
      class="relative w-13 h-13 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg hover:bg-brand-700 hover:shadow-xl hover:scale-105 active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-brand-200"
      @click="chatStore.toggleWidget()"
      :title="chatStore.isWidgetOpen ? 'Đóng chat' : 'Mở tin nhắn hỗ trợ'"
    >
      <X v-if="chatStore.isWidgetOpen" :size="24" />
      <MessageSquare v-else :size="24" />

      <!-- Total Unread Badge -->
      <span
        v-if="!chatStore.isWidgetOpen && chatStore.totalUnreadCount > 0"
        class="absolute -top-1 -right-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-danger-600 text-white font-num leading-none shadow-sm border-2 border-white animate-pulse"
      >
        {{ chatStore.totalUnreadCount > 99 ? '99+' : chatStore.totalUnreadCount }}
      </span>
    </button>
  </div>
</template>
