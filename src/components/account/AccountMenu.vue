<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import {
  Bell,
  History,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  User,
  Wallet,
  TicketPercent,
  Wrench,
} from 'lucide-vue-next';
import AccountAvatarBadge from './AccountAvatarBadge.vue';
import { useAuthStore } from '../../stores/auth';
import {
  accountMenuLinks,
  roleHeaderAction,
  roleLabel,
  type AccountMenuContext,
  type AccountMenuIcon,
} from '../../utils/account-menu';

// The avatar button and its menu, shared by the public header and the customer
// header so both show the same account items.
const props = defineProps<{ context: AccountMenuContext }>();
const emit = defineEmits<{ (e: 'logout'): void }>();

const authStore = useAuthStore();
const route = useRoute();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const icons: Record<AccountMenuIcon, Component> = {
  orders: Wrench,
  history: History,
  warranty: ShieldCheck,
  wallet: Wallet,
  vouchers: TicketPercent,
  notifications: Bell,
  profile: User,
  area: LayoutGrid,
};

const links = computed(() => accountMenuLinks(authStore.userRole, props.context));
const accountLinks = computed(() => links.value.filter((item) => item.group === 'account'));
const activityLinks = computed(() => links.value.filter((item) => item.group === 'activity'));
// On a phone the header has no room for the role button, so it moves in here.
const narrowAction = computed(() => (props.context === 'public' ? roleHeaderAction(authStore.userRole) : null));

function visibleMenuItems(): HTMLElement[] {
  const panel = panelRef.value;
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter((el) => {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      return window.getComputedStyle(el).display !== 'none';
    }
    return true;
  });
}

function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) {
    void nextTick(() => triggerRef.value?.focus());
  }
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !event.composedPath().includes(root.value)) close();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    close(true);
  }
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  open.value = true;
  void nextTick(() => {
    const items = visibleMenuItems();
    const target = event.key === 'ArrowUp' ? items[items.length - 1] : items[0];
    target?.focus();
  });
}

function onMenuKeydown(event: KeyboardEvent) {
  const items = visibleMenuItems();
  if (items.length === 0) return;
  const activeIndex = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    items[(activeIndex + 1) % items.length]?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    items[(activeIndex - 1 + items.length) % items.length]?.focus();
  } else if (event.key === 'Home') {
    event.preventDefault();
    items[0]?.focus();
  } else if (event.key === 'End') {
    event.preventDefault();
    items[items.length - 1]?.focus();
  }
}

function logout() {
  close();
  emit('logout');
}

watch(() => route?.fullPath, () => close());
onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="group flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-out hover:bg-ink-100/75 enabled:active:scale-[0.96] motion-reduce:transition-none motion-reduce:enabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1"
      aria-label="Tài khoản"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="account-menu-trigger"
      @click="open = !open"
      @keydown="onTriggerKeydown"
    >
      <AccountAvatarBadge
        :name="authStore.user?.fullName"
        :avatar-url="authStore.user?.avatarUrl"
        :open="open"
      />
    </button>

    <Transition
      enter-active-class="transition-[opacity,transform] ease-out duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0 scale-95 -translate-y-1.5"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-[opacity,transform] ease-in duration-100 motion-reduce:transition-none"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1.5"
    >
      <div
        v-if="open"
        ref="panelRef"
        role="menu"
        aria-label="Menu tài khoản"
        class="origin-top-right absolute right-0 z-50 mt-2 w-[min(18.5rem,calc(100vw-2rem))] max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-(--shadow-e3) ring-1 ring-ink-900/[0.06]"
        data-testid="account-menu"
        @keydown="onMenuKeydown"
      >
        <div class="flex items-center gap-3 border-b border-ink-100 bg-gradient-to-br from-brand-50/70 via-white to-ink-50/70 px-4 py-3.5">
          <AccountAvatarBadge
            :name="authStore.user?.fullName"
            :avatar-url="authStore.user?.avatarUrl"
            :show-chevron="false"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ink-900">{{ authStore.user?.fullName || 'Người dùng' }}</p>
            <p v-if="authStore.user?.email" class="truncate text-xs text-ink-600">{{ authStore.user.email }}</p>
            <span
              v-if="context === 'public'"
              class="mt-1.5 inline-block whitespace-nowrap rounded-md bg-brand-100/75 px-2 py-0.5 text-[11px] font-semibold text-brand-700"
            >
              {{ roleLabel(authStore.userRole) }}
            </span>
          </div>
        </div>

        <div class="space-y-1 p-2 text-sm text-ink-700">
          <router-link
            v-if="narrowAction"
            role="menuitem"
            :to="narrowAction.to"
            class="flex sm:hidden min-h-11 items-center gap-3 rounded-lg bg-brand-50/70 px-2.5 py-2 font-semibold text-brand-700 whitespace-nowrap transition-[background-color,color] duration-150 ease-out hover:bg-brand-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 motion-reduce:transition-none"
            data-testid="menu-role-action"
            @click="close()"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100/80 text-brand-700" aria-hidden="true">
              <LayoutGrid :size="16" />
            </span>
            <span>{{ narrowAction.label }}</span>
          </router-link>

          <router-link
            v-for="link in accountLinks"
            :key="link.testId"
            role="menuitem"
            :to="link.to"
            class="group/item min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-[background-color,color] duration-150 ease-out hover:bg-ink-50 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 motion-reduce:transition-none"
            active-class="bg-brand-50/80 text-brand-700 font-semibold [&_.menu-icon-tile]:bg-brand-100/80 [&_.menu-icon-tile]:text-brand-700"
            :class="link.hiddenOnWide ? 'flex lg:hidden' : 'flex'"
            :data-testid="link.testId"
            @click="close()"
          >
            <span class="menu-icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-600 transition-colors duration-150 group-hover/item:bg-ink-100 group-hover/item:text-ink-900" aria-hidden="true">
              <component :is="icons[link.icon]" :size="16" />
            </span>
            <span>{{ link.label }}</span>
          </router-link>

          <div v-if="accountLinks.length && activityLinks.length" role="separator" class="my-1 h-px bg-ink-100" />

          <router-link
            v-for="link in activityLinks"
            :key="link.testId"
            role="menuitem"
            :to="link.to"
            class="group/item min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-[background-color,color] duration-150 ease-out hover:bg-ink-50 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 motion-reduce:transition-none"
            active-class="bg-brand-50/80 text-brand-700 font-semibold [&_.menu-icon-tile]:bg-brand-100/80 [&_.menu-icon-tile]:text-brand-700"
            :class="link.hiddenOnWide ? 'flex lg:hidden' : 'flex'"
            :data-testid="link.testId"
            @click="close()"
          >
            <span class="menu-icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-600 transition-colors duration-150 group-hover/item:bg-ink-100 group-hover/item:text-ink-900" aria-hidden="true">
              <component :is="icons[link.icon]" :size="16" />
            </span>
            <span>{{ link.label }}</span>
          </router-link>
        </div>

        <div class="border-t border-ink-100 p-2">
          <button
            role="menuitem"
            type="button"
            class="group/logout flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-danger-600 whitespace-nowrap transition-[background-color,color,transform] duration-150 ease-out hover:bg-danger-50 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:enabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-danger-600"
            data-testid="menu-logout"
            @click="logout"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger-50/75 text-danger-600 transition-colors duration-150 group-hover/logout:bg-danger-100/80" aria-hidden="true">
              <LogOut :size="16" />
            </span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
