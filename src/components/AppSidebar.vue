<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useId, watch } from 'vue';
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

withDefaults(defineProps<{
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
const profileMenu = ref<HTMLElement | null>(null);
const profileTrigger = ref<HTMLButtonElement | null>(null);
const profileMenuId = useId();
const avatarFailed = ref(false);
const fullName = computed(() => authStore.user?.fullName?.trim() || 'T\u00e0i kho\u1ea3n');
const userAvatar = computed(() => authStore.user?.avatarUrl);
const userInitial = computed(() => fullName.value.charAt(0).toLocaleUpperCase('vi'));

watch(userAvatar, () => { avatarFailed.value = false; });
watch(() => route.fullPath, () => { showProfileDropdown.value = false; });

const closeProfileMenu = (restoreFocus = false) => {
  showProfileDropdown.value = false;
  if (restoreFocus) profileTrigger.value?.focus();
};
const handleOutsideClick = (event: PointerEvent) => {
  if (event.target instanceof Node && !profileMenu.value?.contains(event.target)) {
    closeProfileMenu();
  }
};
const handleProfileFocusOut = (event: FocusEvent) => {
  if (!(event.relatedTarget instanceof Node) || !profileMenu.value?.contains(event.relatedTarget)) {
    closeProfileMenu();
  }
};
onMounted(() => document.addEventListener('pointerdown', handleOutsideClick));
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsideClick));

const hoveredItem = ref<{ label: string, top: number } | null>(null);

const showTooltip = (event: MouseEvent, label: string) => {
  if (!isCollapsed.value) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  hoveredItem.value = {
    label,
    top: rect.top + (rect.height / 2)
  };
};

const hideTooltip = () => {
  hoveredItem.value = null;
};

const handleLogout = async () => {
  closeProfileMenu();
  if (authStore.logout) {
    await authStore.logout();
  }
  // Full reload (not router.push): wipes every Pinia store's in-memory state
  // (chat socket, cached lists, etc.) so a later login never shows stale
  // data left over from the previous session.
  window.location.href = '/login';
};

const isActive = (path: string) => {
  return route.path === path || (path !== '/console' && route.path.startsWith(`${path}/`));
};
</script>

<template>
  <aside
    class="sidebar-root h-screen sticky top-0 flex flex-col justify-between transition-all duration-300 select-none z-30"
    :class="[
      isCollapsed ? 'sidebar-collapsed w-20' : 'sidebar-expanded w-64',
    ]"
  >
    <!-- Collapse Trigger -->
    <button
      class="absolute -right-3 top-8 w-6 h-6 bg-brand-600 rounded-full flex items-center justify-center text-white shadow-md hover:bg-brand-500 transition-colors z-50 focus:outline-none"
      @click="isCollapsed = !isCollapsed"
    >
      <component :is="isCollapsed ? ChevronRight : ChevronLeft" :size="14" stroke-width="3" />
    </button>

    <div class="flex-1 min-h-0 flex flex-col pt-8">
      <!-- Brand Logo -->
      <div class="px-6 mb-10 flex items-center gap-3">
        <img :src="'/logo.png'" alt="FixHome" class="w-9 h-9 object-contain rounded-xl shrink-0 bg-white p-0.5 shadow-xs" />
        <span 
          class="text-xl font-bold text-white tracking-wide transition-opacity duration-300"
          :class="isCollapsed ? 'opacity-0 w-0 invisible absolute' : 'opacity-100'"
        >
          {{ title }}
        </span>
      </div>

      <!-- Navigation -->
      <div class="nav-container flex-1 overflow-y-auto">
        <div v-for="(group, idx) in navigation" :key="idx" class="mb-4">
          <div
            v-if="group.group"
            class="px-8 text-[10px] font-bold uppercase tracking-wider text-[#6b6f99] mb-3 transition-opacity duration-300 whitespace-nowrap overflow-hidden"
            :class="isCollapsed ? 'opacity-0 h-0 invisible' : 'opacity-100 h-auto'"
          >
            {{ group.group }}
          </div>
          
          <div class="flex flex-col gap-2">
            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="nav-item group"
              :class="{ 'active': isActive(item.path) }"
              @mouseenter="(e) => showTooltip(e, item.label)"
              @mouseleave="hideTooltip"
            >
              <div class="icon-wrapper shrink-0">
                <component :is="item.icon" :size="20" stroke-width="2.5" />
              </div>
              <span 
                class="transition-opacity duration-300 whitespace-nowrap overflow-hidden"
                :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'"
              >
                {{ item.label }}
              </span>
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- User profile -->
    <div class="shrink-0 pb-2">
      <div
        ref="profileMenu"
        class="relative"
        @keydown.esc.stop.prevent="closeProfileMenu(true)"
        @focusout="handleProfileFocusOut"
      >
        <button
          ref="profileTrigger"
          type="button"
          class="profile-trigger flex w-full items-center gap-3 rounded-xl p-2 text-white transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="[
            isCollapsed ? 'justify-center' : 'text-left',
            showProfileDropdown ? 'bg-white/25 shadow-inner' : 'bg-transparent hover:bg-white/10'
          ]"
          :aria-label="fullName"
          :aria-expanded="showProfileDropdown"
          :aria-controls="profileMenuId"
          :title="fullName"
          @click="showProfileDropdown = !showProfileDropdown"
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full profile-avatar text-sm font-semibold">
            <img v-if="userAvatar && !avatarFailed" :src="userAvatar" alt="" class="h-full w-full object-cover" @error="avatarFailed = true" />
            <span v-else aria-hidden="true">{{ userInitial }}</span>
          </span>
          <span v-if="!isCollapsed" class="min-w-0 flex-1 truncate text-sm font-semibold">{{ fullName }}</span>
        </button>
        <Transition name="profile-dropdown">
          <div
            v-if="showProfileDropdown"
            :id="profileMenuId"
            class="profile-dropdown absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border border-[#474a6b] bg-[#272a44] p-1.5 text-sm shadow-2xl backdrop-blur-md"
            :class="isCollapsed ? 'w-48' : 'w-full'"
          >
            <button
              type="button"
              class="profile-logout group flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold text-rose-300 transition-all duration-200 hover:bg-rose-500/20 hover:text-rose-100 active:bg-rose-500/40 focus-visible:outline-2"
              @click="handleLogout"
            >
              <LogOut :size="18" aria-hidden="true" class="shrink-0 text-rose-400 transition-colors group-hover:text-rose-300" />
              <span>Logout</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Global Tooltip Teleport -->
    <Teleport to="body">
      <div 
        v-if="hoveredItem && isCollapsed"
        class="fixed left-24 px-3 py-2 bg-[#272a44] text-white text-xs font-semibold rounded-lg z-[9999] shadow-xl border border-[#353854] pointer-events-none transform -translate-y-1/2 whitespace-nowrap"
        :style="{ top: hoveredItem.top + 'px' }"
      >
        {{ hoveredItem.label }}
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar-root {
  --sidebar-accent: #5b5fd8;
  background-color: #353854;
  color: #a0a3bd;
}

/* Custom Scrollbar for Nav */
.nav-container::-webkit-scrollbar {
  width: 4px;
}
.nav-container::-webkit-scrollbar-track {
  background: transparent;
}
.nav-container::-webkit-scrollbar-thumb {
  background: #474a6b;
  border-radius: 4px;
}
.nav-container:hover::-webkit-scrollbar-thumb {
  background: #5b5fd8;
}

/* Nav Item Base */
.nav-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: #a0a3bd;
  transition: all 0.3s ease;
  font-weight: 600;
  font-size: 0.9rem;
  position: relative;
}

.nav-item:hover:not(.active) {
  color: #ffffff;
}

/* --- Expanded State --- */
.sidebar-expanded .nav-item {
  padding: 0.875rem 1.5rem;
  border-radius: 24px 0 0 24px;
  width: 100%;
}

.sidebar-expanded .nav-item.active {
  background-color: #272a44;
  color: #ffffff;
}

/* Inverted Border Radius for Expanded Active Item */
.sidebar-expanded .nav-item::before,
.sidebar-expanded .nav-item::after {
  content: '';
  position: absolute;
  right: 0;
  width: 24px;
  height: 24px;
  background-color: transparent;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.sidebar-expanded .nav-item.active::before,
.sidebar-expanded .nav-item.active::after {
  opacity: 1;
}

.sidebar-expanded .nav-item::before {
  top: -24px;
  border-bottom-right-radius: 24px;
  box-shadow: 12px 12px 0 12px #272a44;
}

.sidebar-expanded .nav-item::after {
  bottom: -24px;
  border-top-right-radius: 24px;
  box-shadow: 12px -12px 0 12px #272a44;
}

/* --- Collapsed State --- */
.sidebar-collapsed .nav-item {
  padding: 16px;
  margin: 0 8px;
  border-radius: 16px;
  justify-content: center;
  width: calc(100% - 16px);
  gap: 0;
}

.sidebar-collapsed .nav-item .icon-wrapper {
  margin: 0;
}

.sidebar-collapsed .nav-item.active {
  background-color: #272a44;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.profile-trigger,
.profile-logout {
  cursor: pointer;
  outline-color: var(--sidebar-accent);
}

.profile-avatar {
  background-color: var(--sidebar-accent);
  color: white;
}

/* Profile Dropdown Transition */
.profile-dropdown-enter-active,
.profile-dropdown-leave-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom center;
}

.profile-dropdown-enter-from,
.profile-dropdown-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>
