<script setup lang="ts">
// src/pages/chat/MessagesPage.vue
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useChatStore } from '../../stores/chat.store';
import ChatThread from '../../components/chat/ChatThread.vue';
import {
  MessageSquare,
  Search,
  Filter,
} from 'lucide-vue-next';

const route = useRoute();
const chatStore = useChatStore();

const searchQuery = ref('');
const filterUnreadOnly = ref(false);

const filteredConversations = computed(() => {
  let list = chatStore.conversations;
  if (filterUnreadOnly.value) {
    list = list.filter((c) => (c.unreadCount || 0) > 0);
  }
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return list;
  return list.filter(
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

onMounted(async () => {
  await chatStore.fetchConversations();
  const queryId = route.query.id as string | undefined;
  const bookingId = route.query.bookingId as string | undefined;

  if (queryId) {
    await chatStore.selectConversation(queryId);
  } else if (bookingId) {
    await chatStore.openConversationForBooking(bookingId);
  } else if (chatStore.conversations.length > 0 && !chatStore.activeConversationId) {
    // Select first conversation by default on desktop
    await chatStore.selectConversation(chatStore.conversations[0].id);
  }
});

watch(
  () => route.query.id,
  (newId) => {
    if (newId && typeof newId === 'string') {
      void chatStore.selectConversation(newId);
    }
  },
);
</script>

<template>
  <div class="h-[calc(100vh-64px)] flex bg-ink-50 overflow-hidden">
    <!-- Left Panel: Conversation List -->
    <aside class="w-full md:w-80 lg:w-96 bg-white border-r border-ink-200 flex flex-col flex-shrink-0">
      <!-- Search & Filters Header -->
      <div class="p-4 border-b border-ink-200 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-bold text-ink-900 tracking-tight">Hộp thư tin nhắn</h1>
            <span
              v-if="chatStore.totalUnreadCount > 0"
              class="px-2 py-0.5 text-xs font-bold rounded-full bg-brand-600 text-white font-num leading-none"
            >
              {{ chatStore.totalUnreadCount }}
            </span>
          </div>

          <button
            type="button"
            class="p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors"
            :class="filterUnreadOnly ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'"
            @click="filterUnreadOnly = !filterUnreadOnly"
            title="Lọc tin chưa đọc"
          >
            <Filter :size="13" />
            <span class="hidden sm:inline">Chưa đọc</span>
          </button>
        </div>

        <div class="relative">
          <Search :size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm kiếm theo tên, dịch vụ..."
            class="w-full pl-9 pr-4 py-2 text-xs bg-ink-50 border border-ink-200 rounded-xl outline-none focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500 transition-all text-ink-900 placeholder:text-ink-400"
          />
        </div>
      </div>

      <!-- Conversations Scrollable Feed -->
      <div class="flex-1 overflow-y-auto divide-y divide-ink-100">
        <!-- Loading -->
        <div
          v-if="chatStore.loadingConversations && chatStore.conversations.length === 0"
          class="p-8 text-center text-sm text-ink-400"
        >
          Đang tải danh sách hội thoại...
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredConversations.length === 0"
          class="p-8 text-center text-ink-500"
        >
          <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-3">
            <MessageSquare :size="24" />
          </div>
          <p class="text-sm font-semibold text-ink-800">Không tìm thấy hội thoại</p>
          <p class="text-xs text-ink-500 mt-1">
            {{ searchQuery ? 'Không có kết quả phù hợp với từ khóa.' : 'Bạn chưa có cuộc trò chuyện nào.' }}
          </p>
        </div>

        <!-- Conversation Item -->
        <button
          v-for="conv in filteredConversations"
          :key="conv.id"
          type="button"
          class="w-full p-3.5 flex items-start gap-3 text-left transition-colors relative"
          :class="[
            chatStore.activeConversationId === conv.id
              ? 'bg-brand-50/80 border-l-4 border-brand-600'
              : 'hover:bg-ink-50'
          ]"
          @click="chatStore.selectConversation(conv.id)"
        >
          <!-- Avatar -->
          <div class="relative flex-shrink-0">
            <div class="w-11 h-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-brand-200">
              <img
                v-if="conv.counterpart?.avatarUrl"
                :src="conv.counterpart.avatarUrl"
                :alt="conv.counterpart.fullName"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ conv.counterpart?.fullName?.charAt(0) || 'U' }}</span>
            </div>
            <!-- Online indicator -->
            <span
              v-if="chatStore.activeConversationId === conv.id && chatStore.isSocketConnected"
              class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-600 border-2 border-white"
            ></span>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">
              <h3 class="text-sm font-bold text-ink-900 truncate">
                {{ conv.counterpart?.fullName }}
              </h3>
              <span class="text-[11px] text-ink-400 font-num flex-shrink-0">
                {{ formatTime(conv.lastMessageAt) }}
              </span>
            </div>

            <!-- Service Tag -->
            <div v-if="conv.serviceName" class="text-xs text-brand-600 font-medium truncate mb-1">
              {{ conv.serviceName }}
            </div>

            <!-- Last message snippet -->
            <div class="flex items-center justify-between gap-2">
              <p
                class="text-xs truncate"
                :class="conv.unreadCount > 0 ? 'font-bold text-ink-900' : 'text-ink-500'"
              >
                {{ conv.lastMessagePreview || 'Bắt đầu cuộc trò chuyện' }}
              </p>

              <!-- Unread Badge -->
              <span
                v-if="conv.unreadCount > 0"
                class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-brand-600 text-white font-num leading-none flex-shrink-0"
              >
                {{ conv.unreadCount }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </aside>

    <!-- Right Panel: Chat Thread -->
    <main class="flex-1 hidden md:flex flex-col bg-white overflow-hidden">
      <ChatThread
        v-if="chatStore.activeConversationId"
        :conversation-id="chatStore.activeConversationId"
        full-height
      />

      <div
        v-else
        class="h-full flex flex-col items-center justify-center p-8 text-center text-ink-400 bg-ink-25"
      >
        <div class="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 shadow-xs">
          <MessageSquare :size="32" />
        </div>
        <h2 class="text-base font-bold text-ink-800">Chọn cuộc trò chuyện</h2>
        <p class="text-xs text-ink-500 mt-1 max-w-xs">
          Chọn một cuộc trò chuyện từ danh sách bên trái để xem lịch sử và trao đổi trực tiếp với Kỹ thuật viên.
        </p>
      </div>
    </main>
  </div>
</template>
