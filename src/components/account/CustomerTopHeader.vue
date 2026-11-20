<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bot,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  Home,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TicketPercent,
} from 'lucide-vue-next';
import { FhButton } from '../index';
import NotificationBellDropdown from '../notifications/NotificationBellDropdown.vue';
import AccountMenu from './AccountMenu.vue';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat.store';
import { useRoutePrefetch } from '../../composables/useCachedQuery';

const props = withDefaults(defineProps<{
  isSuspended?: boolean;
  scrolled?: boolean;
}>(), {
  isSuspended: false,
  scrolled: false,
});

const emit = defineEmits<{ (e: 'logout'): void }>();

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();
const prefetchRoute = useRoutePrefetch();

const navItems = [
  { to: '/app', label: 'Trang chủ', icon: Home, exact: true },
  { to: '/app/orders', label: 'Đơn sửa chữa', icon: ClipboardList, exact: false },
  { to: '/app/warranties', label: 'Bảo hành', icon: ShieldCheck, exact: false },
  { to: '/app/messages', label: 'Tin nhắn', icon: MessageSquare, exact: false },
  { to: '/app/vouchers', label: 'Ưu đãi', icon: TicketPercent, exact: false },
  { to: '/', label: 'Giới thiệu', icon: Sparkles, exact: true },
];

const desktopNavRef = ref<HTMLElement | null>(null);
const compactDesktopNavRef = ref<HTMLElement | null>(null);
const compactDesktopOverflowButtonRef = ref<HTMLElement | null>(null);
const compactDesktopOverflowPanelRef = ref<HTMLElement | null>(null);
const navItemRefs = ref<Record<string, HTMLElement | null>>({});
const navIndicatorStyle = ref<Record<string, string>>({ opacity: '0' });
const desktopOverflowOpen = ref(false);

const wideDesktopMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(min-width: 1440px)')
  : null;
const isWideDesktop = ref(wideDesktopMedia?.matches ?? false);

const unread = computed(() => (chatStore.totalUnreadCount > 99 ? '99+' : String(chatStore.totalUnreadCount)));

const activeNavItem = computed(() => {
  const currentPath = router.currentRoute.value?.path || '';
  return navItems.find((item) => (item.exact ? currentPath === item.to : currentPath.startsWith(item.to))) ?? null;
});

const compactDesktopNavActive = computed(() => Boolean(activeNavItem.value));

function setNavItemRef(to: string, el: unknown) {
  if (!el) return;
  const domEl = (typeof el === 'object' && el !== null && '$el' in el)
    ? (el as { $el: HTMLElement }).$el
    : (el as HTMLElement);
  if (domEl && typeof domEl === 'object') {
    navItemRefs.value[to] = domEl;
  }
}

function updateNavIndicator() {
  const currentPath = router.currentRoute.value?.path || '';
  const activeItem = navItems.find((item) =>
    item.exact ? currentPath === item.to : currentPath.startsWith(item.to),
  );
  if (!isWideDesktop.value) {
    navIndicatorStyle.value = { opacity: '0' };
    return;
  }
  const nav = desktopNavRef.value;
  const el = activeItem && navItemRefs.value[activeItem.to];
  if (!activeItem || !nav || !el || el.offsetWidth === 0) {
    navIndicatorStyle.value = { opacity: '0' };
    return;
  }
  navIndicatorStyle.value = {
    transform: `translate3d(${el.offsetLeft}px, 0, 0)`,
    width: `${el.offsetWidth}px`,
    opacity: '1',
  };
}

function closeDesktopOverflow(returnFocus = false) {
  desktopOverflowOpen.value = false;
  if (returnFocus) {
    void nextTick(() => compactDesktopOverflowButtonRef.value?.focus());
  }
}

function onNavItemClick(event: MouseEvent, to: string, closeOverflow = false) {
  if (closeOverflow) closeDesktopOverflow();
  if (to === '/' && router.currentRoute.value?.path === '/') {
    event.preventDefault();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }
}

function onDesktopOverflowTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown') return;
  event.preventDefault();
  desktopOverflowOpen.value = true;
  void nextTick(() => compactDesktopOverflowPanelRef.value?.querySelector<HTMLElement>('a')?.focus());
}

function onDesktopOverflowDocumentClick(event: MouseEvent) {
  const nav = compactDesktopNavRef.value;
  if (desktopOverflowOpen.value && nav && !event.composedPath().includes(nav)) {
    closeDesktopOverflow();
  }
}

function onDesktopOverflowDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && desktopOverflowOpen.value) {
    event.preventDefault();
    closeDesktopOverflow(true);
  }
}

function onWideDesktopChange(event: MediaQueryListEvent) {
  isWideDesktop.value = event.matches;
  closeDesktopOverflow();
  void nextTick(updateNavIndicator);
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateNavIndicator);
  }
  document.addEventListener('click', onDesktopOverflowDocumentClick);
  document.addEventListener('keydown', onDesktopOverflowDocumentKeydown);
  wideDesktopMedia?.addEventListener('change', onWideDesktopChange);
  void nextTick(() => {
    updateNavIndicator();
    setTimeout(updateNavIndicator, 60);
  });
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateNavIndicator);
  }
  document.removeEventListener('click', onDesktopOverflowDocumentClick);
  document.removeEventListener('keydown', onDesktopOverflowDocumentKeydown);
  wideDesktopMedia?.removeEventListener('change', onWideDesktopChange);
});

watch(
  () => router.currentRoute.value?.path,
  () => {
    closeDesktopOverflow();
    void nextTick(updateNavIndicator);
  },
);
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b transition-colors duration-200 backdrop-blur-md"
    :class="props.scrolled ? 'border-transparent bg-white/95 shadow-(--shadow-e1)' : 'border-ink-200/80 bg-white/95'"
  >
    <div class="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
      <div class="flex items-center gap-3 sm:gap-5 min-w-0">
        <router-link to="/" class="inline-flex items-center gap-2.5 shrink-0 group" aria-label="FixHome — Trang chủ">
          <img :src="'/logo.png'" alt="" class="w-9 h-9 object-contain rounded-xl group-hover:scale-105 transition-transform" />
          <span class="text-xl font-bold tracking-tight whitespace-nowrap"><span class="text-brand-600">Fix</span><span class="text-success-600">Home</span></span>
        </router-link>

        <nav
          v-show="isWideDesktop"
          ref="desktopNavRef"
          class="hidden min-[1440px]:flex items-center h-16 gap-0.5 text-sm font-medium text-ink-600 relative"
          aria-label="Điều hướng chính"
          data-testid="customer-desktop-nav"
        >
          <!-- Sliding active indicator bar -->
          <div
            class="pointer-events-none absolute bottom-0 left-0 h-[2.5px] bg-brand-600 rounded-t-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
            :style="navIndicatorStyle"
            aria-hidden="true"
          />

          <router-link
            v-for="item in navItems"
            :key="item.to"
            :ref="(el) => setNavItemRef(item.to, el)"
            :to="item.to"
            @mouseenter="prefetchRoute(item.to)"
            @focus="prefetchRoute(item.to)"
            @click="onNavItemClick($event, item.to)"
            class="h-10 px-2.5 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-ink-50 hover:text-ink-950 transition-colors"
            :active-class="item.exact ? '' : 'text-brand-700 font-semibold'"
            :exact-active-class="item.exact ? 'text-brand-700 font-semibold' : ''"
          >
            <component :is="item.icon" :size="16" :stroke-width="1.8" class="shrink-0" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.to === '/app/messages' && chatStore.totalUnreadCount > 0"
              class="min-w-4.5 h-4.5 px-1.5 rounded-full bg-danger-600 text-white text-[10px] font-bold font-num inline-flex items-center justify-center leading-none shadow-2xs"
            >
              {{ unread }}
            </span>
          </router-link>
        </nav>

        <nav
          v-show="!isWideDesktop"
          ref="compactDesktopNavRef"
          class="flex min-[1440px]:hidden items-center h-16 relative"
          aria-label="Điều hướng chính"
        >
          <button
            ref="compactDesktopOverflowButtonRef"
            type="button"
            class="h-9 px-3 sm:px-3.5 rounded-full border inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            :class="compactDesktopNavActive
              ? 'border-brand-200 bg-brand-50/75 text-brand-700 font-semibold'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 hover:text-ink-950'"
            :aria-label="desktopOverflowOpen ? 'Đóng điều hướng thêm' : 'Mở điều hướng thêm'"
            aria-controls="customer-desktop-nav-overflow"
            :aria-expanded="desktopOverflowOpen"
            data-testid="customer-desktop-nav-overflow-trigger"
            @click="desktopOverflowOpen = !desktopOverflowOpen"
            @keydown="onDesktopOverflowTriggerKeydown"
          >
            <component :is="activeNavItem?.icon ?? LayoutGrid" :size="16" :stroke-width="1.8" class="shrink-0" aria-hidden="true" />
            <span class="hidden min-[440px]:inline">{{ activeNavItem?.label ?? 'Điều hướng' }}</span>
            <span
              v-if="chatStore.totalUnreadCount > 0 && activeNavItem?.to !== '/app/messages'"
              class="h-1.5 w-1.5 rounded-full bg-danger-600 shrink-0"
              aria-hidden="true"
            />
            <ChevronDown
              :size="15"
              class="shrink-0 transition-transform duration-200 motion-reduce:transition-none"
              :class="desktopOverflowOpen ? 'rotate-180' : ''"
              aria-hidden="true"
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
              v-show="desktopOverflowOpen"
              id="customer-desktop-nav-overflow"
              ref="compactDesktopOverflowPanelRef"
              class="absolute left-0 top-full z-50 mt-1 min-w-56 overflow-hidden rounded-2xl bg-white p-1.5 text-sm text-ink-700 shadow-(--shadow-e3) ring-1 ring-ink-900/[0.06]"
              data-testid="customer-desktop-nav-overflow"
            >
              <template v-if="desktopOverflowOpen">
                <router-link
                  v-for="item in navItems"
                  :key="item.to"
                  :to="item.to"
                  class="flex h-10 items-center gap-3 rounded-xl px-3 whitespace-nowrap transition-colors hover:bg-ink-50 hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-600"
                  :active-class="item.exact ? '' : 'bg-brand-50/75 text-brand-700 font-semibold'"
                  :exact-active-class="item.exact ? 'bg-brand-50/75 text-brand-700 font-semibold' : ''"
                  @mouseenter="prefetchRoute(item.to)"
                  @focus="prefetchRoute(item.to)"
                  @click="onNavItemClick($event, item.to, true)"
                >
                  <component :is="item.icon" :size="17" :stroke-width="1.8" class="shrink-0" aria-hidden="true" />
                  <span>{{ item.label }}</span>
                  <span
                    v-if="item.to === '/app/messages' && chatStore.totalUnreadCount > 0"
                    class="ml-auto min-w-4.5 h-4.5 px-1.5 rounded-full bg-danger-600 text-white text-[10px] font-bold font-num inline-flex items-center justify-center leading-none shadow-2xs"
                  >
                    {{ unread }}
                  </span>
                </router-link>
              </template>
            </div>
          </Transition>
        </nav>
      </div>

      <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <FhButton
          variant="primary"
          size="sm"
          :disabled="props.isSuspended"
          :title="props.isSuspended ? 'Tài khoản đang bị tạm khoá đặt dịch vụ' : 'Tạo yêu cầu sửa chữa mới'"
          aria-label="Đặt thợ ngay"
          data-testid="header-role-action"
          @click="router.push('/app/bookings/new')"
        >
          <CalendarPlus :size="16" />
          <span class="hidden sm:inline lg:hidden xl:inline whitespace-nowrap">Đặt thợ ngay</span>
        </FhButton>

        <FhButton
          variant="secondary"
          size="sm"
          :disabled="props.isSuspended"
          title="Mô tả sự cố để trợ lý AI chẩn đoán rồi đặt thợ"
          aria-label="Chẩn đoán bằng AI"
          data-testid="header-ai-booking"
          @click="router.push('/app/bookings/ai')"
        >
          <Bot :size="16" class="text-brand-600" />
          <span class="hidden sm:inline lg:hidden xl:inline whitespace-nowrap">Chẩn đoán bằng AI</span>
        </FhButton>

        <span class="hidden sm:block h-5 w-px bg-ink-200 mx-0.5" aria-hidden="true" />

        <div class="flex items-center gap-1.5">
          <NotificationBellDropdown v-if="authStore.isAuthenticated" />
          <AccountMenu context="customer-app" @logout="emit('logout')" />
        </div>
      </div>
    </div>
  </header>
</template>
