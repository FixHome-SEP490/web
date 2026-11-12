<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import {
  Bell,
  ClipboardList,
  History,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  User,
  Wallet,
  TicketPercent,
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

const icons: Record<AccountMenuIcon, Component> = {
  orders: ClipboardList,
  history: History,
  warranty: ShieldCheck,
  wallet: Wallet,
  vouchers: TicketPercent,
  notifications: Bell,
  profile: User,
  area: LayoutGrid,
};

const links = computed(() => accountMenuLinks(authStore.userRole, props.context));
// On a phone the header has no room for the role button, so it moves in here.
const narrowAction = computed(() => (props.context === 'public' ? roleHeaderAction(authStore.userRole) : null));

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
      class="group flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1"
      aria-label="Tài khoản"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="account-menu-trigger"
      @click="open = !open"
    >
      <AccountAvatarBadge
        :name="authStore.user?.fullName"
        :avatar-url="authStore.user?.avatarUrl"
        :open="open"
      />
    </button>

    <Transition
      enter-active-class="transition ease-out duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0 scale-95 -translate-y-1.5"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-100 motion-reduce:transition-none"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1.5"
    >
      <div
        v-if="open"
        class="absolute right-0 mt-2 w-64 rounded-2xl bg-white py-1.5 shadow-(--shadow-e3) ring-1 ring-ink-900/[0.06] z-50 divide-y divide-ink-100"
        data-testid="account-menu"
      >
        <div class="flex items-center gap-3 px-4 py-3">
          <AccountAvatarBadge
            :name="authStore.user?.fullName"
            :avatar-url="authStore.user?.avatarUrl"
            :show-chevron="false"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ink-900 truncate">{{ authStore.user?.fullName || 'Người dùng' }}</p>
            <p class="text-xs text-ink-500 truncate">{{ authStore.user?.email }}</p>
            <span
              v-if="context === 'public'"
              class="inline-block mt-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-brand-50 text-brand-700 whitespace-nowrap"
            >
              {{ roleLabel(authStore.userRole) }}
            </span>
          </div>
        </div>

        <div class="py-1.5 text-sm text-ink-700">
          <router-link
            v-if="narrowAction"
            :to="narrowAction.to"
            class="mx-1.5 flex sm:hidden items-center gap-3 rounded-xl px-3 py-2 whitespace-nowrap transition-colors hover:bg-ink-50 hover:text-ink-950"
            data-testid="menu-role-action"
            @click="close"
          >
            <LayoutGrid :size="16" class="text-ink-500 shrink-0" aria-hidden="true" />
            {{ narrowAction.label }}
          </router-link>
          <router-link
            v-for="link in links"
            :key="link.testId"
            :to="link.to"
            class="mx-1.5 items-center gap-3 rounded-xl px-3 py-2 whitespace-nowrap transition-colors hover:bg-ink-50 hover:text-ink-950"
            active-class="bg-brand-50/70 text-brand-700 font-medium"
            :class="link.hiddenOnWide ? 'flex lg:hidden' : 'flex'"
            :data-testid="link.testId"
            @click="close"
          >
            <component :is="icons[link.icon]" :size="16" class="text-ink-500 shrink-0" aria-hidden="true" />
            {{ link.label }}
          </router-link>
        </div>

        <div class="pt-1.5 pb-0.5">
          <button
            type="button"
            class="mx-1.5 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50 w-[calc(100%-0.75rem)] text-left whitespace-nowrap"
            data-testid="menu-logout"
            @click="logout"
          >
            <LogOut :size="16" class="shrink-0" aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
