<script setup lang="ts">
// src/components/chat/ChatMessageItem.vue
import { ref, computed, nextTick } from 'vue';
import type { ChatMessage } from '../../api/messaging.api';
import { MoreVertical, Edit2, Trash2 } from 'lucide-vue-next';

const props = defineProps<{
  message: ChatMessage;
  isMe: boolean;
  counterpartName?: string;
  counterpartAvatar?: string | null;
}>();

const emit = defineEmits<{
  (e: 'edit', messageId: string, content: string): void;
  (e: 'delete', messageId: string): void;
}>();

const isEditing = ref(false);
const editContent = ref('');
const showMenu = ref(false);
const editInputRef = ref<HTMLTextAreaElement | null>(null);

const timeString = computed(() => {
  try {
    const d = new Date(props.message.createdAt);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
});

function startEdit() {
  editContent.value = props.message.content;
  isEditing.value = true;
  showMenu.value = false;
  void nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
}

function cancelEdit() {
  isEditing.value = false;
  editContent.value = '';
}

function submitEdit() {
  if (!editContent.value.trim() || editContent.value.trim() === props.message.content) {
    cancelEdit();
    return;
  }
  emit('edit', props.message.id, editContent.value.trim());
  isEditing.value = false;
}

function confirmDelete() {
  showMenu.value = false;
  if (confirm('Bạn có chắc chắn muốn gỡ tin nhắn này không?')) {
    emit('delete', props.message.id);
  }
}
</script>

<template>
  <div
    class="flex gap-2 group w-full mb-3 select-text"
    :class="isMe ? 'justify-end' : 'justify-start'"
  >
    <!-- Counterpart Avatar (only if not me) -->
    <div
      v-if="!isMe"
      class="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex-shrink-0 flex items-center justify-center font-bold text-xs self-end overflow-hidden border border-brand-200"
    >
      <img
        v-if="counterpartAvatar"
        :src="counterpartAvatar"
        :alt="counterpartName || 'Avatar'"
        class="w-full h-full object-cover"
      />
      <span v-else>{{ counterpartName?.charAt(0) || 'U' }}</span>
    </div>

    <!-- Message Bubble Area -->
    <div
      class="flex flex-col max-w-[78%] relative"
      :class="isMe ? 'items-end' : 'items-start'"
    >
      <!-- Action menu for my message -->
      <div
        v-if="isMe && !message.isDeleted && !isEditing"
        class="absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center z-10"
      >
        <div class="relative">
          <button
            type="button"
            class="p-1 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
            @click="showMenu = !showMenu"
            title="Thao tác"
          >
            <MoreVertical :size="14" />
          </button>

          <!-- Dropdown menu -->
          <div
            v-if="showMenu"
            class="absolute right-0 bottom-full mb-1 w-28 bg-white rounded-md border border-ink-200 shadow-md py-1 z-20 text-xs text-ink-700 divide-y divide-ink-100"
            @click.stop
          >
            <button
              type="button"
              class="w-full px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-ink-50 text-left font-medium"
              @click="startEdit"
            >
              <Edit2 :size="12" />
              <span>Chỉnh sửa</span>
            </button>
            <button
              type="button"
              class="w-full px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-danger-50 text-danger-600 text-left font-medium"
              @click="confirmDelete"
            >
              <Trash2 :size="12" />
              <span>Gỡ tin nhắn</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Editing Mode Box -->
      <div
        v-if="isEditing"
        class="w-full min-w-[220px] bg-white border border-brand-300 rounded-xl p-2 shadow-xs"
      >
        <textarea
          ref="editInputRef"
          v-model="editContent"
          rows="2"
          class="w-full text-sm text-ink-900 border-none outline-none resize-none bg-transparent"
          @keydown.enter.exact.prevent="submitEdit"
          @keydown.esc="cancelEdit"
        ></textarea>
        <div class="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-ink-100">
          <button
            type="button"
            class="px-2 py-1 text-xs rounded text-ink-600 hover:bg-ink-100"
            @click="cancelEdit"
          >
            Huỷ
          </button>
          <button
            type="button"
            class="px-2 py-1 text-xs rounded bg-brand-600 text-white hover:bg-brand-700 font-medium"
            @click="submitEdit"
          >
            Lưu
          </button>
        </div>
      </div>

      <!-- Normal Bubble -->
      <div
        v-else
        class="px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap rounded-2xl"
        :class="[
          message.isDeleted
            ? 'bg-ink-100 text-ink-400 italic text-xs py-1.5'
            : isMe
              ? 'bg-brand-600 text-white rounded-br-xs shadow-xs'
              : 'bg-ink-100 text-ink-900 rounded-bl-xs'
        ]"
      >
        <span v-if="message.isDeleted">
          Tin nhắn đã được gỡ
        </span>
        <span v-else>
          {{ message.content }}
        </span>
      </div>

      <!-- Timestamp & Metadata -->
      <div
        class="flex items-center gap-1 mt-0.5 text-[10px]"
        :class="isMe ? 'text-ink-400 justify-end' : 'text-ink-400 justify-start ml-1'"
      >
        <span v-if="message.editedAt && !message.isDeleted" class="italic text-[10px]">
          (đã sửa)
        </span>
        <span class="font-num">{{ timeString }}</span>
      </div>
    </div>
  </div>
</template>
