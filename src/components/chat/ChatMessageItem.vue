<script setup lang="ts">
// src/components/chat/ChatMessageItem.vue
import { ref, computed, nextTick } from 'vue';
import type { ChatMessage } from '../../api/messaging.api';
import { MoreVertical, Edit2, Trash2 } from 'lucide-vue-next';
import { vnTimeString } from '../../utils/vn-time';
import ChatAttachmentView from './ChatAttachmentView.vue';

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
    return vnTimeString(d, { hour: '2-digit', minute: '2-digit' });
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
      class="w-7 h-7 rounded-full bg-brand-50 text-brand-700 flex-shrink-0 flex items-center justify-center font-semibold text-xs self-end overflow-hidden ring-1 ring-brand-200/80"
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
        class="absolute -left-8 top-1 transition-opacity flex items-center z-10"
        :class="showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'"
      >
        <div class="relative">
          <button
            type="button"
            class="w-7 h-7 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-100 transition-colors"
            @click="showMenu = !showMenu"
            title="Thao tác"
          >
            <MoreVertical :size="14" />
          </button>

          <!-- Dropdown menu -->
          <Transition
            enter-active-class="transition ease-out duration-120 motion-reduce:transition-none"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition ease-in duration-100 motion-reduce:transition-none"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="showMenu"
              class="absolute right-0 bottom-full mb-1.5 w-32 bg-white rounded-xl ring-1 ring-ink-900/[0.06] shadow-(--shadow-e2) p-1 z-20 text-xs text-ink-700 space-y-0.5"
              @click.stop
            >
              <button
                type="button"
                class="w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-ink-50 text-left font-medium transition-colors"
                @click="startEdit"
              >
                <Edit2 :size="12" />
                <span>Chỉnh sửa</span>
              </button>
              <button
                type="button"
                class="w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-danger-50 text-danger-600 text-left font-medium transition-colors"
                @click="confirmDelete"
              >
                <Trash2 :size="12" />
                <span>Gỡ tin nhắn</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Editing Mode Box -->
      <div
        v-if="isEditing"
        class="w-full min-w-[220px] bg-white border border-brand-300 rounded-2xl p-2.5 ring-2 ring-brand-500/15"
      >
        <textarea
          ref="editInputRef"
          v-model="editContent"
          rows="2"
          class="w-full text-sm text-ink-900 border-none outline-none resize-none bg-transparent"
          @keydown.enter.exact.prevent="submitEdit"
          @keydown.esc="cancelEdit"
        ></textarea>
        <div class="flex items-center justify-end gap-1.5 mt-1.5 pt-1.5 border-t border-ink-100">
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-medium rounded-lg text-ink-600 hover:bg-ink-100 transition-colors"
            @click="cancelEdit"
          >
            Huỷ
          </button>
          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium transition-colors"
            @click="submitEdit"
          >
            Lưu
          </button>
        </div>
      </div>

      <!-- Photo or video (PO 18/10/2026), above its caption -->
      <ChatAttachmentView
        v-if="!isEditing && message.attachment && !message.isDeleted"
        :message="message"
        :is-me="isMe"
        :class="message.content ? 'mb-1' : ''"
      />

      <!-- Normal Bubble -->
      <div
        v-if="!isEditing && (message.isDeleted || message.content || !message.attachment)"
        class="px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap rounded-2xl"
        :class="[
          message.isDeleted
            ? 'bg-ink-100/75 text-ink-500 italic text-xs py-1.5 px-3'
            : isMe
              ? 'bg-brand-600 text-white rounded-br-sm'
              : 'bg-white text-ink-900 ring-1 ring-ink-200/80 shadow-2xs rounded-bl-sm'
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
        class="flex items-center gap-1 mt-1 text-[11px] text-ink-400"
        :class="isMe ? 'justify-end' : 'justify-start ml-1'"
      >
        <span v-if="message.isAutomated && !message.isDeleted" data-testid="message-automated" class="whitespace-nowrap">Tin nhắn tự động ·</span>
        <span v-if="message.editedAt && !message.isDeleted" class="italic">
          (đã sửa)
        </span>
        <span class="font-num">{{ timeString }}</span>
      </div>
    </div>
  </div>
</template>
