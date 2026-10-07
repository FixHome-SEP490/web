<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import {
  PanelLeftClose,
  PanelLeftOpen,
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

// Narrow screens start collapsed (icons only): the full 16rem sidebar left a
// phone about 130px for the page, and every console page overflowed.
const NARROW = '(max-width: 1023px)';
const isCollapsed = ref(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches);
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
    <div class="flex-1 min-h-0 flex flex-col pt-6">
      <!-- Header Area (Logo & Trigger) -->
      <div 
        class="relative mb-8 flex items-center h-12 transition-all duration-200"
        :class="isCollapsed ? 'justify-center px-0' : 'px-5'"
      >
        <!-- Expanded Mode: Logo & Brand on left -->
        <template v-if="!isCollapsed">
          <div class="flex items-center gap-3 pr-10 min-w-0">
            <img :src="'/logo.png'" alt="FixHome" class="w-9 h-9 object-contain rounded-xl shrink-0 bg-white p-0.5 shadow-xs" />
            <span class="text-lg font-bold text-slate-900 tracking-wide whitespace-nowrap truncate">
              {{ title }}
            </span>
          </div>

          <!-- Collapse Trigger: Separate in Top-Right Corner -->
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 transition-all duration-200 focus:outline-none flex items-center justify-center p-2 rounded-lg hover:bg-brand-50 cursor-pointer"
            title="Thu gọn Sidebar"
            @click="isCollapsed = true"
          >
            <PanelLeftClose :size="20" />
          </button>
        </template>

        <!-- Collapsed Mode: Top Logo Button with Hover-to-Open -->
        <button
          v-else
          type="button"
          class="group/logo relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:bg-brand-50 cursor-pointer focus:outline-none"
          title="Mở rộng Sidebar"
          @click="isCollapsed = false"
          @mouseenter="(e) => showTooltip(e, 'Mở rộng Sidebar')"
          @mouseleave="hideTooltip"
        >
          <!-- Default: Logo -->
          <img 
            :src="'/logo.png'" 
            alt="FixHome" 
            class="w-9 h-9 object-contain rounded-xl bg-white p-0.5 shadow-xs transition-opacity duration-200 group-hover/logo:opacity-0" 
          />
          <!-- Hover: PanelLeftOpen Icon (only on hovering this logo section) -->
          <PanelLeftOpen 
            :size="20" 
            class="absolute text-slate-400 group-hover/logo:text-brand-600 opacity-0 group-hover/logo:opacity-100 transition-opacity duration-200" 
          />
        </button>
      </div>

      <!-- Navigation -->
      <div class="nav-container flex-1 overflow-y-auto">
        <div v-for="(group, idx) in navigation" :key="idx" class="mb-4">
          <div
            v-if="group.group"
            class="px-8 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 transition-opacity duration-300 whitespace-nowrap overflow-hidden"
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
          class="profile-trigger flex w-full items-center gap-3 rounded-xl p-2 text-slate-700 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="[
            isCollapsed ? 'justify-center' : 'text-left',
            showProfileDropdown ? 'bg-slate-100 shadow-inner' : 'bg-transparent hover:bg-slate-50'
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
            class="profile-dropdown absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl"
            :class="isCollapsed ? 'w-48' : 'w-full'"
          >
            <button
              type="button"
              class="profile-logout group flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-semibold text-rose-600 transition-all duration-200 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 focus-visible:outline-2"
              @click="handleLogout"
            >
              <LogOut :size="18" aria-hidden="true" class="shrink-0 text-rose-500 transition-colors group-hover:text-rose-600" />
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
        class="fixed left-24 px-3 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg z-[9999] shadow-xl border border-slate-700 pointer-events-none transform -translate-y-1/2 whitespace-nowrap"
        :style="{ top: hoveredItem.top + 'px' }"
      >
        {{ hoveredItem.label }}
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar-root {
  --sidebar-accent: #3b82f6;
  background-color: #ffffff;
  color: #64748b;
  border-right: 1px solid #e2e8f0;
}

/* Custom Scrollbar for Nav */
.nav-container {
  scrollbar-width: none;
}
.nav-container::-webkit-scrollbar {
  display: none;
}

/* Nav Item Base */
.nav-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: #64748b;
  transition: all 0.2s ease;
  font-weight: 600;
  font-size: 0.9rem;
  position: relative;
}

.nav-item:hover:not(.active) {
  color: #0f172a;
  background-color: #f1f5f9;
}

/* --- Expanded State --- */
.sidebar-expanded .nav-item {
  padding: 0.875rem 1.5rem;
  border-radius: 24px 0 0 24px;
  width: calc(100% + 1px);
}

.sidebar-expanded .nav-item.active {
  background-color: #eff6ff; /* Matches brand blue-50 */
  color: #2563eb; /* Brand text */
  border-right: 1px solid #eff6ff;
}

/* Inverted Border Radius for Expanded Active Item */
.sidebar-expanded .nav-item::before,
.sidebar-expanded .nav-item::after {
  content: '';
  position: absolute;
  right: 1px;
  width: 24px;
  height: 24px;
  background-color: transparent;
  pointer-events: none;
  opacity: 0;
}

.sidebar-expanded .nav-item.active::before,
.sidebar-expanded .nav-item.active::after {
  opacity: 1;
}

.sidebar-expanded .nav-item::before {
  top: -24px;
  border-bottom-right-radius: 24px;
  box-shadow: 12px 12px 0 12px #eff6ff;
}

.sidebar-expanded .nav-item::after {
  bottom: -24px;
  border-top-right-radius: 24px;
  box-shadow: 12px -12px 0 12px #eff6ff;
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
  background-color: #eff6ff;
  color: #2563eb;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
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
