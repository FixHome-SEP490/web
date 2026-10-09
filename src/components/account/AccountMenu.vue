<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import {
  Bell,
  ChevronDown,
  ClipboardList,
  History,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  User,
  Wallet,
} from 'lucide-vue-next';
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

const icons: Record<AccountMenuIcon, Component> = {
  orders: ClipboardList,
  history: History,
  warranty: ShieldCheck,
  wallet: Wallet,
  notifications: Bell,
  profile: User,
  area: LayoutGrid,
};

const links = computed(() => accountMenuLinks(authStore.userRole, props.context));
// On a phone the header has no room for the role button, so it moves in here.
const narrowAction = computed(() => (props.context === 'public' ? roleHeaderAction(authStore.userRole) : null));
const initial = computed(() => authStore.user?.fullName?.charAt(0)?.toUpperCase() || 'U');

function close() {
  open.value = false;
}
function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !event.composedPath().includes(root.value)) close();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}
function logout() {
  close();
  emit('logout');
}

watch(() => route?.fullPath, close);
onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 p-1 rounded-full hover:bg-ink-100 transition-colors"
      aria-label="Tài khoản"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="account-menu-trigger"
      @click="open = !open"
    >
      <span class="w-8 h-8 rounded-full bg-brand-50 text-brand-700 font-semibold flex items-center justify-center text-sm border border-brand-100 overflow-hidden">
        <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-full h-full object-cover" />
        <span v-else>{{ initial }}</span>
      </span>
      <ChevronDown :size="16" class="text-ink-400 hidden sm:block" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) py-2 z-50 divide-y divide-ink-100"
      data-testid="account-menu"
    >
      <div class="px-4 py-2.5">
        <p class="text-sm font-semibold text-ink-900 truncate">{{ authStore.user?.fullName || 'Người dùng' }}</p>
        <p class="text-xs text-ink-500 truncate">{{ authStore.user?.email }}</p>
        <span
          v-if="context === 'public'"
          class="inline-block mt-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-brand-50 text-brand-700 border border-brand-100 whitespace-nowrap"
        >
          {{ roleLabel(authStore.userRole) }}
        </span>
      </div>

      <div class="py-1 text-sm text-ink-700">
        <router-link
          v-if="narrowAction"
          :to="narrowAction.to"
          class="flex sm:hidden items-center gap-3 px-4 py-2.5 whitespace-nowrap hover:bg-ink-50"
          data-testid="menu-role-action"
          @click="close"
        >
          <LayoutGrid :size="16" class="text-ink-500" aria-hidden="true" />
          {{ narrowAction.label }}
        </router-link>
        <router-link
          v-for="link in links"
          :key="link.testId"
          :to="link.to"
          class="items-center gap-3 px-4 py-2.5 whitespace-nowrap hover:bg-ink-50"
          :class="link.hiddenOnWide ? 'flex lg:hidden' : 'flex'"
          :data-testid="link.testId"
          @click="close"
        >
          <component :is="icons[link.icon]" :size="16" class="text-ink-500" aria-hidden="true" />
          {{ link.label }}
        </router-link>
      </div>

      <div class="py-1">
        <button
          type="button"
          class="flex items-center gap-3 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 w-full text-left whitespace-nowrap"
          data-testid="menu-logout"
          @click="logout"
        >
          <LogOut :size="16" aria-hidden="true" />
          Đăng xuất
        </button>
      </div>
    </div>
  </div>
</template>
