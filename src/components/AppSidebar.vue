<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Camera,
} from 'lucide-vue-next';
import AvatarDialog from './account/AvatarDialog.vue';
import { useRoutePrefetch } from '../composables/useCachedQuery';

import type { Component } from 'vue';

export interface NavItem {
  label: string;
  path?: string;
  to?: string;
  icon: Component;
  exact?: boolean;
  badge?: string | number | null | (() => string | number | null);
}

export interface NavGroup {
  group?: string;
  title?: string;
  items: NavItem[];
}

withDefaults(defineProps<{
  navigation: NavGroup[];
  title?: string;
  subtitle?: string;
  homePath?: string;
  showProfile?: boolean;
}>(), {
  title: 'FixHome',
  subtitle: 'Console',
  homePath: '/',
  showProfile: true,
});

// Narrow screens start collapsed (icons only): the full 16rem sidebar left a
// phone about 130px for the page, and every console page overflowed.
const NARROW = '(max-width: 1023px)';
const isCollapsed = ref(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches);
const collapseOnNarrowResize = () => {
  if (window.matchMedia?.(NARROW).matches) isCollapsed.value = true;
};
onMounted(() => window.addEventListener('resize', collapseOnNarrowResize));
onBeforeUnmount(() => window.removeEventListener('resize', collapseOnNarrowResize));
const route = useRoute();
const authStore = useAuthStore();
const prefetchRoute = useRoutePrefetch();
const showProfileDropdown = ref(false);
// Staff have no profile page; the avatar is changed from this menu (PO 10/10/2026).
const showAvatarDialog = ref(false);
const openAvatarDialog = () => {
  showProfileDropdown.value = false;
  showAvatarDialog.value = true;
};
const profileMenu = ref<HTMLElement | null>(null);
const profileTrigger = ref<HTMLButtonElement | null>(null);
const profileMenuId = useId();
const avatarFailed = ref(false);
const fullName = computed(() => authStore.user?.fullName?.trim() || 'Tài khoản');
const userAvatar = computed(() => authStore.user?.avatarUrl);
const userInitial = computed(() => fullName.value.charAt(0).toLocaleUpperCase('vi'));

watch(userAvatar, () => { avatarFailed.value = false; });
watch(() => route?.fullPath, () => {
  showProfileDropdown.value = false;
  hideTooltip();
});

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

const getItemPath = (item: NavItem): string => item.path || item.to || '';
const getGroupTitle = (group: NavGroup): string => group.group || group.title || '';

const getBadge = (item: NavItem): string | null => {
  if (!item.badge) return null;
  const val = typeof item.badge === 'function' ? item.badge() : item.badge;
  return val !== null && val !== undefined && val !== '' ? String(val) : null;
};

const showTooltip = (event: MouseEvent, label: string, badge?: string | null) => {
  if (!isCollapsed.value) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  hoveredItem.value = {
    label: badge ? `${label} (${badge})` : label,
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

const isActive = (item: NavItem) => {
  const p = getItemPath(item);
  if (!p) return false;
  const currentPath = route?.path || '';
  if (!currentPath) return false;
  if (item.exact || p === '/console' || p === '/tech' || p === '/admin' || p === '/') {
    return currentPath === p;
  }
  return currentPath === p || currentPath.startsWith(`${p}/`);
};
</script>

<template>
  <aside
    class="sidebar-root h-screen sticky top-0 flex flex-col justify-between overflow-x-hidden select-none z-30 transition-[width] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none will-change-[width]"
    :class="[
      isCollapsed ? 'sidebar-collapsed w-20' : 'sidebar-expanded w-64',
    ]"
  >
    <div class="flex-1 min-h-0 flex flex-col pt-5">
      <!-- Header Area (Logo & Trigger): constant geometry so logo never jumps -->
      <div class="relative mb-5 px-4 flex items-center h-12 shrink-0">
        <!-- Expanded Mode: Logo & Brand on left + Collapse button on right -->
        <template v-if="!isCollapsed">
          <router-link :to="homePath" class="flex items-center min-w-0 flex-1 pr-9 group/brand focus-visible:outline-none" aria-label="FixHome">
            <div class="w-12 h-11 shrink-0 flex items-center justify-center">
              <img :src="'/logo.png'" alt="FixHome" class="w-9 h-9 object-contain rounded-xl shrink-0 bg-white p-0.5 shadow-xs border border-ink-200/60 transition-transform duration-150 group-hover/brand:scale-105" />
            </div>
            <div class="flex flex-col leading-tight min-w-0 pl-0.5">
              <span class="text-lg font-bold tracking-tight whitespace-nowrap truncate">
                <template v-if="title === 'FixHome'">
                  <span class="text-brand-600">Fix</span><span class="text-success-600">Home</span>
                </template>
                <template v-else>
                  <span class="text-ink-900">{{ title }}</span>
                </template>
              </span>
              <span v-if="subtitle" class="text-xs text-ink-500 font-medium whitespace-nowrap truncate">
                {{ subtitle }}
              </span>
            </div>
          </router-link>

          <button
            type="button"
            class="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 text-ink-400 hover:text-brand-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 flex items-center justify-center rounded-lg hover:bg-brand-50 active:scale-95 cursor-pointer"
            title="Thu gọn menu"
            aria-label="Thu gọn menu"
            @click="isCollapsed = true"
          >
            <PanelLeftClose :size="18" />
          </button>
        </template>

        <!-- Collapsed Mode: Top Logo Button aligned on exact same 48px left axis -->
        <button
          v-else
          type="button"
          class="group/logo relative w-12 h-11 rounded-xl flex items-center justify-center transition-colors duration-150 hover:bg-brand-50 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          title="Mở rộng menu"
          aria-label="Mở rộng menu"
          @click="isCollapsed = false"
          @mouseenter="(e) => showTooltip(e, 'Mở rộng menu')"
          @mouseleave="hideTooltip"
        >
          <img
            :src="'/logo.png'"
            alt="FixHome"
            class="w-9 h-9 object-contain rounded-xl bg-white p-0.5 shadow-xs border border-ink-200/60 transition-opacity duration-150 group-hover/logo:opacity-0"
          />
          <PanelLeftOpen
            :size="19"
            class="absolute text-ink-500 group-hover/logo:text-brand-600 opacity-0 group-hover/logo:opacity-100 transition-opacity duration-150"
          />
        </button>
      </div>

      <!-- Navigation: fixed icon column (w-12) and constant group header height (h-6) prevent vertical & horizontal jitter -->
      <div class="nav-container flex-1 overflow-y-auto overflow-x-hidden px-4">
        <div v-for="(group, idx) in navigation" :key="idx" class="mb-4 last:mb-2">
          <div
            v-if="getGroupTitle(group)"
            class="relative h-6 mb-1 flex items-center px-3 overflow-hidden"
          >
            <span
              class="text-[11px] font-semibold tracking-wider uppercase text-ink-400 whitespace-nowrap truncate transition-opacity duration-150"
              :class="isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'"
            >
              {{ getGroupTitle(group) }}
            </span>
            <span
              aria-hidden="true"
              class="absolute left-1/2 -translate-x-1/2 w-5 h-px rounded-full bg-ink-200 transition-opacity duration-150"
              :class="isCollapsed ? 'opacity-100' : 'opacity-0'"
            />
          </div>

          <div class="flex flex-col gap-1">
            <router-link
              v-for="item in group.items"
              :key="getItemPath(item)"
              :to="getItemPath(item)"
              class="nav-item group flex h-11 w-full items-center rounded-xl overflow-hidden transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              :class="
                isActive(item)
                  ? 'active bg-brand-50 text-brand-700 font-semibold shadow-2xs ring-1 ring-brand-500/15'
                  : 'text-ink-600 font-medium hover:bg-ink-100/70 hover:text-ink-900'
              "
              @mouseenter="(e) => { showTooltip(e, item.label, getBadge(item)); prefetchRoute(getItemPath(item)); }"
              @focus="prefetchRoute(getItemPath(item))"
              @mouseleave="hideTooltip"
            >
              <div class="icon-wrapper w-12 h-11 shrink-0 relative flex items-center justify-center">
                <component
                  :is="item.icon"
                  :size="20"
                  :stroke-width="isActive(item) ? 2.25 : 2"
                  class="transition-transform duration-150 group-hover:scale-105"
                />
                <span
                  v-if="getBadge(item)"
                  class="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold font-num inline-flex items-center justify-center ring-2 ring-white transition-opacity duration-150"
                  :class="isCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'"
                >
                  {{ getBadge(item) }}
                </span>
              </div>

              <span
                class="flex-1 min-w-0 pr-2 text-sm whitespace-nowrap overflow-hidden truncate transition-[opacity,transform] duration-150"
                :class="isCollapsed ? 'opacity-0 -translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0'"
              >
                {{ item.label }}
              </span>

              <span
                v-if="getBadge(item)"
                class="mr-3 min-w-5 h-5 px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-semibold font-num inline-flex items-center justify-center shrink-0 transition-opacity duration-150"
                :class="isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'"
              >
                {{ getBadge(item) }}
              </span>
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- User profile -->
    <div v-if="showProfile" class="shrink-0 px-4 pb-3 pt-2 border-t border-ink-100/80">
      <div
        ref="profileMenu"
        class="relative"
        @keydown.esc.stop.prevent="closeProfileMenu(true)"
        @focusout="handleProfileFocusOut"
      >
        <button
          ref="profileTrigger"
          type="button"
          class="profile-trigger flex h-11 w-full items-center rounded-xl overflow-hidden text-ink-700 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="[
            showProfileDropdown ? 'bg-ink-100 text-ink-900' : 'bg-transparent hover:bg-ink-100/70'
          ]"
          :aria-label="fullName"
          :aria-expanded="showProfileDropdown"
          :aria-controls="profileMenuId"
          :title="fullName"
          @click="showProfileDropdown = !showProfileDropdown"
        >
          <span class="w-12 h-11 shrink-0 flex items-center justify-center">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full profile-avatar text-sm font-semibold shadow-2xs">
              <img v-if="userAvatar && !avatarFailed" :src="userAvatar" alt="" class="h-full w-full object-cover" @error="avatarFailed = true" />
              <span v-else aria-hidden="true">{{ userInitial }}</span>
            </span>
          </span>
          <span
            class="min-w-0 flex-1 pr-3 text-left truncate text-sm font-semibold transition-[opacity,transform] duration-150"
            :class="isCollapsed ? 'opacity-0 -translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0'"
          >
            {{ fullName }}
          </span>
        </button>
        <Transition name="profile-dropdown">
          <div
            v-if="showProfileDropdown"
            :id="profileMenuId"
            class="profile-dropdown absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-2xl border border-ink-200 bg-white p-1.5 text-sm shadow-xl"
            :class="isCollapsed ? 'w-48' : 'w-full'"
          >
            <button
              type="button"
              class="group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold text-ink-700 transition-colors duration-150 hover:bg-ink-50 focus-visible:outline-2"
              data-testid="change-avatar"
              @click="openAvatarDialog"
            >
              <Camera :size="18" aria-hidden="true" class="shrink-0 text-ink-500" />
              <span>Đổi ảnh đại diện</span>
            </button>
            <button
              type="button"
              class="profile-logout group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold text-danger-600 transition-colors duration-150 hover:bg-danger-50 hover:text-danger-700 active:bg-danger-100 focus-visible:outline-2"
              @click="handleLogout"
            >
              <LogOut :size="18" aria-hidden="true" class="shrink-0 text-danger-500 transition-colors group-hover:text-danger-600" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <Teleport to="body">
      <AvatarDialog :open="showAvatarDialog" @close="showAvatarDialog = false" />
    </Teleport>

    <!-- Global Tooltip Teleport -->
    <Teleport to="body">
      <div
        v-if="hoveredItem && isCollapsed"
        class="fixed left-22 px-3 py-1.5 bg-ink-900 text-white text-xs font-semibold rounded-lg z-[9999] shadow-lg border border-ink-800 pointer-events-none -translate-y-1/2 whitespace-nowrap"
        :style="{ top: hoveredItem.top + 'px' }"
      >
        {{ hoveredItem.label }}
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar-root {
  --sidebar-accent: var(--color-brand-600, #2563eb);
  background-color: #ffffff;
  color: var(--color-ink-600, #475569);
  border-right: 1px solid var(--color-ink-200, #e2e8f0);
}

/* Custom Scrollbar for Nav */
.nav-container {
  scrollbar-width: none;
}
.nav-container::-webkit-scrollbar {
  display: none;
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
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom left;
}

.profile-dropdown-enter-from,
.profile-dropdown-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}
</style>
