<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-vue-next';

import type { Component } from 'vue';

export interface NavItem {
  label: string;
  path: string;
  icon: Component;
}

export interface NavGroup {
  group?: string;
  items: NavItem[];
}

const props = withDefaults(defineProps<{
  navigation: NavGroup[];
  title?: string;
  subtitle?: string;
}>(), {
  title: 'FixHome',
  subtitle: 'Console'
});

const isCollapsed = ref(false);
const route = useRoute();
const authStore = useAuthStore();
const showProfileDropdown = ref(false);

const handleLogout = async () => {
  if (authStore.logout) {
    await authStore.logout();
  }
  // Full reload (not router.push): wipes every Pinia store's in-memory state
  // (chat socket, cached lists, etc.) so a later login never shows stale
  // data left over from the previous session.
  window.location.href = '/login';
};

const userAvatar = computed(() => authStore.user?.avatarUrl);
const userInitial = computed(() => {
  const name = authStore.user?.fullName || authStore.user?.email || 'A';
  return name.charAt(0).toUpperCase();
});

const toggleDropdown = () => {
  showProfileDropdown.value = !showProfileDropdown.value;
};

// Compute HTML for title to colorize "Home" like in the original layout
const htmlTitle = computed(() => {
  if (props.title === 'FixHome') {
    return 'Fix<span class="text-brand-400">Home</span>';
  }
  return props.title;
});
</script>

<template>
  <aside
    class="sticky top-0 h-screen z-30 bg-gray-900 text-white flex flex-col justify-between transition-all duration-300 shrink-0 select-none border-r border-gray-800"
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
    <div>
      <div class="h-16 flex items-center px-4 border-b border-gray-800 overflow-hidden whitespace-nowrap">
        <router-link to="/console" class="flex items-center gap-2.5">
          <img :src="'/logo.png'" alt="FixHome" class="w-9 h-9 object-contain rounded-xl shrink-0 bg-white p-0.5 shadow-xs" />
          <div class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">
            <span class="text-lg font-bold tracking-tight" v-html="htmlTitle"></span>
            <span class="block text-[10px] font-semibold text-brand-300 uppercase tracking-widest -mt-1">
              {{ subtitle }}
            </span>
          </div>
        </router-link>
      </div>

      <!-- Navigation Menu -->
      <div class="p-3 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)] sidebar-nav-scroll">
        <div v-for="group in navigation" :key="group.group || 'default'" class="space-y-1">
          <div
            v-if="group.group"
            class="px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 transition-opacity duration-300 whitespace-nowrap overflow-hidden"
            :class="isCollapsed ? 'opacity-0 h-0 invisible' : 'opacity-100 h-auto'"
          >
            {{ group.group }}
          </div>

          <router-link
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="group flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-700 transition-colors whitespace-nowrap overflow-hidden relative"
            :class="[
              route.path === item.path || (item.path !== '/console' && route.path.startsWith(`${item.path}/`))
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-300',
            ]"
          >
            <component :is="item.icon" :size="18" class="shrink-0" />
            <span class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">{{ item.label }}</span>
            
            <!-- Tooltip for collapsed state -->
            <div 
              v-if="isCollapsed" 
              class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg border border-gray-700 pointer-events-none"
            >
              {{ item.label }}
            </div>
          </router-link>
        </div>
      </div>
    </div>

    <!-- User Profile & Dropdown -->
    <div class="p-3 border-t border-gray-800 relative">
      <!-- Click out overlay -->
      <div v-if="showProfileDropdown" class="fixed inset-0 z-40" @click="showProfileDropdown = false"></div>

      <!-- Dropdown Menu -->
      <div 
        v-if="showProfileDropdown" 
        class="absolute bottom-full left-3 mb-2 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 py-1"
      >
        <button 
          @click="handleLogout" 
          class="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
        >
          <LogOut :size="16" />
          Đăng xuất
        </button>
      </div>

      <div 
        class="flex items-center gap-2.5 px-2 py-1.5 rounded-sm hover:bg-gray-800 cursor-pointer transition-colors relative z-40"
        @click="toggleDropdown"
      >
        <div class="w-8 h-8 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
          <img v-if="userAvatar" :src="userAvatar" alt="Avatar" class="w-full h-full object-cover" />
          <span v-else>{{ userInitial }}</span>
        </div>
        
        <div class="transition-opacity duration-300 flex-1 min-w-0" :class="isCollapsed ? 'opacity-0 w-0 invisible absolute' : 'opacity-100 w-auto'">
          <p class="text-xs font-semibold text-white truncate">{{ authStore.user?.fullName }}</p>
          <p class="text-[11px] text-gray-400 truncate">{{ authStore.user?.role }}</p>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-nav-scroll::-webkit-scrollbar {
  width: 4px;
}
.sidebar-nav-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-nav-scroll::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 4px;
}
.sidebar-nav-scroll:hover::-webkit-scrollbar-thumb {
  background: #4b5563;
}
</style>
