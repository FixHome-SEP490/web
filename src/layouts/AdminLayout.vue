<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <aside
      class="bg-gray-900 text-white flex flex-col transition-all duration-300 relative shrink-0"
      :class="isCollapsed ? 'w-18' : 'w-64'"
    >
      <!-- Collapse Trigger (Floating) -->
      <button
        class="absolute -right-3 top-6 w-6 h-6 bg-brand-600 rounded-full flex items-center justify-center text-white shadow-md hover:bg-brand-500 transition-colors z-50 focus:outline-none"
        @click="isCollapsed = !isCollapsed"
      >
        <component :is="isCollapsed ? ChevronRight : ChevronLeft" :size="14" stroke-width="3" />
      </button>

      <!-- Brand -->
      <div class="h-16 border-b border-gray-700 flex items-center px-4 overflow-hidden whitespace-nowrap">
        <div class="flex items-center gap-3">
          <img src="../assets/logo.png" alt="FixHome Logo" class="w-10 h-10 rounded-lg bg-white p-1 object-contain shrink-0" />
          <div class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">
            <h1 class="text-xl font-bold leading-none">FixHome</h1>
            <p class="text-xs text-gray-400 mt-1">Admin Panel</p>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 p-3 space-y-1 overflow-x-hidden">
        <router-link
          to="/dashboard"
          class="flex items-center gap-3 px-3 py-2.5 rounded hover:bg-gray-700 transition-colors whitespace-nowrap overflow-hidden"
          :title="isCollapsed ? 'Dashboard' : ''"
        >
          <LayoutDashboard :size="20" class="shrink-0" />
          <span class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">Dashboard</span>
        </router-link>
        <!-- TODO: Add navigation links as features are implemented -->
      </nav>

      <!-- Logout -->
      <div class="p-3 border-t border-gray-700 overflow-hidden whitespace-nowrap">
        <button
          class="w-full flex items-center gap-3 px-3 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors text-sm"
          :class="isCollapsed ? 'justify-center' : 'justify-start'"
          @click="handleLogout"
          :title="isCollapsed ? 'Logout' : ''"
        >
          <LogOut :size="20" class="shrink-0" />
          <span class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">Logout</span>
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <header class="h-16 bg-white shadow flex items-center justify-between px-6">
        <h2 class="text-lg font-semibold text-gray-800">
          <!-- Page title can be set via route meta -->
        </h2>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">
            {{ authStore.user?.fullName ?? 'User' }}
          </span>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 p-6 bg-gray-50">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores';
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  LayoutDashboard
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();
const isCollapsed = ref(false);

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>
