<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { AppSidebar } from '../components';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import {
  consoleNavigation,
  consoleRoleLabels,
  type ConsoleRole,
} from '../components/console/console-navigation';

const route = useRoute();
const authStore = useAuthStore();

const role = computed(() => authStore.userRole);
const navigation = computed(() => consoleNavigation(role.value));
const roleLabel = computed(() => consoleRoleLabels[role.value as ConsoleRole] ?? '');

// Browser tab follows the page: "{Tiêu đề} | FixHome".
watch(
  () => route.meta?.title,
  (title) => {
    if (typeof document !== 'undefined') document.title = title ? `${String(title)} | FixHome` : 'FixHome';
  },
  { immediate: true },
);
</script>

<template>
  <div class="min-h-screen flex bg-ink-50 text-ink-900">
    <AppSidebar :navigation="navigation" />

    <div class="flex-1 flex flex-col min-w-0">
      <header class="sticky top-0 z-40 flex h-14 items-center justify-end gap-4 border-b border-ink-200 bg-white px-6 lg:px-8">
        <NotificationBellDropdown />
        <span v-if="roleLabel" class="hidden whitespace-nowrap text-sm font-medium text-ink-600 sm:inline">{{ roleLabel }}</span>
      </header>

      <!-- Console content: max 1440px wide -->
      <main class="flex-1 w-full max-w-360 mx-auto p-6 lg:p-8">
        <router-view />
      </main>
    </div>
  </div>
</template>
