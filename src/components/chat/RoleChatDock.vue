<script setup lang="ts">
// Chat bubble, assistant and incoming calls for pages that sit outside the
// customer and technician layouts (public pages, technician onboarding), so a
// signed-in customer or technician can reach their chat from every page they
// see. Customers also get the assistant; staff and guests get nothing here.
import { computed, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import { useCallStore } from '../../stores/call.store';
import { UserRole } from '../../types/auth.types';
import ChatFloatingWidget from './ChatFloatingWidget.vue';
import AiAssistantWidget from './AiAssistantWidget.vue';
import CallOverlay from './CallOverlay.vue';

const authStore = useAuthStore();
const chatStore = useChatStore();
const callStore = useCallStore();

const isCustomer = computed(() => authStore.isAuthenticated && authStore.hasRole(UserRole.CUSTOMER));
const isTechnician = computed(() => authStore.isAuthenticated && authStore.hasRole(UserRole.TECHNICIAN));
const hasChat = computed(() => isCustomer.value || isTechnician.value);

watch(
  hasChat,
  (chat) => {
    if (!chat) return;
    // Both are idempotent, and the in-app layouts call them too.
    chatStore.initSocket();
    callStore.initCallSignalling();
  },
  { immediate: true },
);
</script>

<template>
  <template v-if="hasChat">
    <ChatFloatingWidget />
    <AiAssistantWidget v-if="isCustomer" />
    <CallOverlay />
  </template>
</template>
