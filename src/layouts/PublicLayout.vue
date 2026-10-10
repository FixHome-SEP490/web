<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Menu, X, ArrowRight, LayoutGrid, CalendarPlus, ShieldCheck, Sparkles } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { FhButton } from '../components';
import AccountMenu from '../components/account/AccountMenu.vue';
import RoleChatDock from '../components/chat/RoleChatDock.vue';
import { roleAreaLink, roleHeaderAction } from '../utils/account-menu';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const mobileMenuOpen = ref(false);
const menuTrigger = ref<HTMLButtonElement | null>(null);
const header = ref<HTMLElement | null>(null);
const isScrolled = ref(false);

// Same order as the sections on the landing page.
const navigation = [
  { label: 'Dịch vụ', to: '/services' },
  { label: 'Phân tích sự cố bằng AI', to: '/#ai' },
  { label: 'Cách hoạt động', to: '/#how-it-works' },
  { label: 'Về FixHome', to: '/#trust' },
];

// The page looks the same for every role; only this one button differs.
const headerAction = computed(() => roleHeaderAction(authStore.userRole));
const areaLink = computed(() => roleAreaLink(authStore.userRole));

function handleScroll() {
  isScrolled.value = window.scrollY > 20;
}

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
  },
);
async function closeMenu(restoreFocus = false) {
  mobileMenuOpen.value = false;
  if (restoreFocus) {
    await nextTick();
    menuTrigger.value?.focus();
  }
}
function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileMenuOpen.value) void closeMenu(true);
}
function handleOutsideClick(event: MouseEvent) {
  if (header.value && !event.composedPath().includes(header.value)) void closeMenu();
}
async function logout() {
  mobileMenuOpen.value = false;
  await authStore.logout();
  await router.push('/');
}
onMounted(() => {
  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('click', handleOutsideClick);
});
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <div class="public-shell flex min-h-screen flex-col bg-white text-ink-900">
    <a href="#main-content" class="skip-link">Đến nội dung chính</a>
    <header
      ref="header"
      class="sticky top-0 z-40 border-b transition-all duration-300"
      :class="isScrolled ? 'border-ink-200/80 bg-white/95 backdrop-blur-md shadow-(--shadow-e1)' : 'border-ink-200 bg-white'"
    >
      <div
        class="public-container flex items-center justify-between gap-4 transition-all duration-300"
        :class="isScrolled ? 'min-h-[66px] py-2' : 'min-h-20 py-3'"
      >
        <router-link to="/" aria-label="FixHome — Trang chủ" class="inline-flex shrink-0 items-center gap-2.5">
          <img :src="'/logo.png'" alt="" width="44" height="44" class="h-11 w-11 object-contain transition-transform duration-200 hover:scale-105" />
          <span class="text-xl font-bold tracking-tight">
            <span class="text-brand-600">Fix</span><span class="text-green-600">Home</span>
          </span>
        </router-link>
        <nav aria-label="Điều hướng chính" class="hidden items-center gap-7 xl:flex">
          <router-link v-for="item in navigation" :key="item.to" :to="item.to" class="public-nav-link">
            {{ item.label }}
          </router-link>
        </nav>
        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
          <template v-if="authStore.isAuthenticated">
            <!-- On a phone this button moves into the account menu. -->
            <div v-if="headerAction" class="hidden sm:block">
              <FhButton data-testid="header-role-action" @click="router.push(headerAction.to)">
                <CalendarPlus v-if="authStore.userRole === 'CUSTOMER'" :size="18" aria-hidden="true" />
                <LayoutGrid v-else :size="18" aria-hidden="true" />
                <span>{{ headerAction.label }}</span>
              </FhButton>
            </div>
            <AccountMenu context="public" @logout="logout" />
          </template>
          <template v-else>
            <div class="hidden xl:block">
              <router-link to="/login" class="public-nav-link">Đăng nhập</router-link>
            </div>
            <div class="hidden sm:block">
              <FhButton @click="router.push('/app/bookings/new')">
                Đặt lịch sửa chữa
                <ArrowRight :size="16" aria-hidden="true" />
              </FhButton>
            </div>
          </template>
          <button
            ref="menuTrigger"
            type="button"
            class="flex h-12 w-12 items-center justify-center rounded-sm border border-ink-200 xl:hidden"
            :aria-label="mobileMenuOpen ? 'Đóng menu' : 'Mở menu'"
            :aria-expanded="mobileMenuOpen"
            aria-controls="public-mobile-menu"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <X v-if="mobileMenuOpen" :size="24" aria-hidden="true" />
            <Menu v-else :size="24" aria-hidden="true" />
          </button>
        </div>
      </div>
      <!-- Site navigation only; account items live in the avatar menu. -->
      <nav
        v-if="mobileMenuOpen"
        id="public-mobile-menu"
        aria-label="Điều hướng trên di động"
        class="absolute inset-x-0 top-full flex max-h-[calc(100dvh-80px)] flex-col overflow-y-auto border-b border-ink-200 bg-white px-4 pb-6 shadow-(--shadow-e2) xl:hidden"
      >
        <router-link
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="public-nav-link border-b border-ink-100 py-3"
          @click="closeMenu()"
        >
          {{ item.label }}
        </router-link>
        <router-link to="/track" class="public-nav-link py-3" @click="closeMenu()">
          Tra cứu đơn sửa chữa
        </router-link>
        <div v-if="!authStore.isAuthenticated" class="mt-4 grid gap-3">
          <FhButton block @click="router.push('/app/bookings/new')">Đặt lịch sửa chữa</FhButton>
          <router-link to="/login" class="public-nav-link justify-center" @click="closeMenu()">
            Đăng nhập
          </router-link>
        </div>
      </nav>
    </header>
    <main id="main-content" tabindex="-1" class="min-w-0 flex-1"><router-view /></main>
    <footer class="relative overflow-hidden border-t border-slate-800 bg-[#0B132B] text-slate-300">
      <!-- Ambient Brand Glow at Top -->
      <div
        class="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-52 w-full max-w-4xl rounded-full bg-brand-600/15 blur-3xl"
        aria-hidden="true"
      ></div>

      <!-- City Skyline Architecture Graphic Background -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex items-end justify-center select-none overflow-hidden"
        aria-hidden="true"
      >
        <img
          :src="'/images/footer-skyline-gradient.webp'"
          alt=""
          loading="lazy"
          decoding="async"
          class="w-full max-w-[1920px] h-48 sm:h-64 md:h-80 lg:h-96 object-cover object-bottom opacity-40 filter brightness-110 contrast-125"
          style="mask-image: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 55%, transparent 100%); -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 55%, transparent 100%);"
        />
      </div>

      <!-- Subtle ground baseline highlight -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"></div>

      <div class="public-container relative z-10 pt-14 pb-8">
        <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
          <!-- Brand & Description -->
          <div class="space-y-4">
            <router-link
              to="/"
              class="inline-flex min-h-12 items-center gap-2.5 group"
              aria-label="FixHome — Trang chủ"
            >
              <img :src="'/logo.png'" alt="" width="44" height="44" class="h-11 w-11 object-contain rounded-xl bg-white p-0.5 shadow-sm transition-transform group-hover:scale-105" />
              <span class="text-2xl font-bold tracking-tight text-white">
                <span class="text-blue-500">Fix</span><span class="text-green-500">Home</span>
              </span>
            </router-link>
            <p class="max-w-sm text-sm leading-6 text-slate-400">
              Kết nối kỹ thuật viên sửa chữa tại nhà uy tín, hỗ trợ chẩn đoán sự cố sơ bộ bằng AI và cam kết chi phí minh bạch.
            </p>
            <div class="flex flex-wrap gap-2 pt-1 text-xs">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-slate-300 border border-slate-700/60">
                <ShieldCheck :size="13" class="text-emerald-400" />
                <span>Kỹ thuật viên xác minh</span>
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-slate-300 border border-slate-700/60">
                <Sparkles :size="13" class="text-blue-400" />
                <span>AI hỗ trợ chẩn đoán</span>
              </span>
            </div>
          </div>

          <!-- Services Column -->
          <div>
            <h2 class="mb-4 text-xs font-bold uppercase tracking-wider text-slate-200">
              Dịch vụ
            </h2>
            <ul class="text-sm">
              <li><router-link to="/services" class="public-footer-link">Danh mục dịch vụ</router-link></li>
              <li>
                <router-link to="/pricing-policy" class="public-footer-link">Chính sách giá minh bạch</router-link>
              </li>
              <li>
                <router-link to="/app/bookings/new" class="public-footer-link">Đặt lịch sửa chữa</router-link>
              </li>
              <li>
                <router-link to="/track" class="public-footer-link">Tra cứu đơn sửa chữa</router-link>
              </li>
            </ul>
          </div>

          <!-- About Column -->
          <div>
            <h2 class="mb-4 text-xs font-bold uppercase tracking-wider text-slate-200">
              Về FixHome
            </h2>
            <ul class="text-sm">
              <li>
                <router-link to="/how-it-works" class="public-footer-link">Quy trình hoạt động</router-link>
              </li>
              <li><router-link to="/#ai" class="public-footer-link">Phân tích sự cố bằng AI</router-link></li>
              <li>
                <router-link to="/for-technicians" class="public-footer-link">
                  Dành cho kỹ thuật viên
                </router-link>
              </li>
              <li>
                <router-link to="/#questions" class="public-footer-link">Câu hỏi thường gặp</router-link>
              </li>
            </ul>
          </div>

          <!-- Account Column -->
          <div>
            <h2 class="mb-4 text-xs font-bold uppercase tracking-wider text-slate-200">
              Tài khoản
            </h2>
            <ul class="space-y-3 text-sm text-slate-400">
              <li>
                <router-link
                  :to="areaLink?.to ?? '/login'"
                  class="public-footer-link text-blue-400 hover:text-blue-300 font-medium"
                >
                  <span>{{ areaLink?.label ?? 'Đăng nhập tài khoản' }}</span>
                  <ArrowRight :size="14" class="ml-1" />
                </router-link>
              </li>
            </ul>
          </div>
        </div>

        <div
          class="mt-12 flex flex-col justify-between gap-3 border-t border-slate-800/80 pt-6 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center"
        >
          <span>© {{ new Date().getFullYear() }} FixHome. Đồ án tốt nghiệp SEP490.</span>
          <span class="text-slate-400">Chăm sóc ngôi nhà, bắt đầu từ sự an tâm.</span>
        </div>
      </div>
    </footer>

    <!-- Signed-in customers and technicians keep their chat on public pages. -->
    <RoleChatDock />
  </div>
</template>

<style scoped>
.public-container {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: 24px;
}
.public-nav-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-ink-700);
  transition: color 0.15s ease;
}
.public-nav-link:hover {
  color: var(--color-brand-600);
}
.public-footer-link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding-block: 4px;
  color: #94a3b8;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.public-footer-link:hover {
  color: #60a5fa;
  transform: translateX(4px);
}
.public-shell :is(a, button):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 4px;
}
.skip-link {
  position: fixed;
  left: 16px;
  top: -100px;
  z-index: 50;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: var(--color-brand-600);
  color: white;
}
.skip-link:focus {
  top: 8px;
}
#main-content {
  scroll-margin-top: 80px;
}
@media (max-width: 767px) {
  .public-container {
    padding-inline: 16px;
  }
}
</style>
