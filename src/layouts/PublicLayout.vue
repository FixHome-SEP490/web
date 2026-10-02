<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Menu,
  X,
  ArrowRight,
  LogOut,
  LayoutGrid,
  ChevronDown,
  User,
  ClipboardList,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { FhButton } from '../components';
import RoleChatDock from '../components/chat/RoleChatDock.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const mobileMenuOpen = ref(false);
const userMenuOpen = ref(false);
const menuTrigger = ref<HTMLButtonElement | null>(null);
const header = ref<HTMLElement | null>(null);
const isScrolled = ref(false);

const navigation = [
  { label: 'Dịch vụ', to: '/services' },
  { label: 'Cách hoạt động', to: '/#how-it-works' },
  { label: 'Phân tích sự cố bằng AI', to: '/#ai' },
  { label: 'Về FixHome', to: '/#trust' },
];

const accountRoute = computed(() => {
  if (authStore.userRole === 'ADMIN' || authStore.userRole === 'SERVICE_MANAGER') return '/console';
  if (authStore.userRole === 'TECHNICIAN') return '/tech';
  return '/app';
});

const userInitial = computed(() => {
  return authStore.user?.fullName?.charAt(0)?.toUpperCase() || 'U';
});

const roleLabel = computed(() => {
  switch (authStore.userRole) {
    case 'ADMIN':
      return 'Quản trị viên';
    case 'SERVICE_MANAGER':
      return 'Quản lý dịch vụ';
    case 'TECHNICIAN':
      return 'Kỹ thuật viên';
    case 'CUSTOMER':
      return 'Khách hàng';
    default:
      return 'Thành viên';
  }
});

function handleScroll() {
  isScrolled.value = window.scrollY > 20;
}

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
    userMenuOpen.value = false;
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
  if (event.key === 'Escape') {
    if (mobileMenuOpen.value) void closeMenu(true);
    userMenuOpen.value = false;
  }
}
function handleOutsideClick(event: MouseEvent) {
  // Close mobile and user menus if click is outside header / user menu
  if (header.value && !event.composedPath().includes(header.value)) {
    void closeMenu();
    userMenuOpen.value = false;
  }
}
async function logout() {
  mobileMenuOpen.value = false;
  userMenuOpen.value = false;
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
        <div class="hidden items-center gap-3.5 xl:flex">
          <template v-if="authStore.isAuthenticated">
            <!-- Vào trang quản lý button matching user's design -->
            <FhButton
              variant="primary"
              size="md"
              class="flex items-center gap-2 shadow-xs"
              @click="router.push(accountRoute)"
            >
              <LayoutGrid :size="18" aria-hidden="true" />
              <span>Vào trang quản lý</span>
            </FhButton>

            <!-- User Avatar & Dropdown Menu -->
            <div class="relative">
              <button
                type="button"
                class="flex items-center gap-1.5 p-1 rounded-full hover:bg-ink-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                :aria-expanded="userMenuOpen"
                aria-haspopup="true"
                aria-label="Menu tài khoản"
                @click="userMenuOpen = !userMenuOpen"
              >
                <!-- Avatar circle -->
                <div class="h-9 w-9 rounded-full border-2 border-brand-200 overflow-hidden bg-brand-50 flex items-center justify-center text-brand-700 font-bold text-sm shadow-xs">
                  <img
                    v-if="authStore.user?.avatarUrl"
                    :src="authStore.user.avatarUrl"
                    class="h-full w-full object-cover"
                    alt="Avatar"
                  />
                  <span v-else>{{ userInitial }}</span>
                </div>
                <!-- Chevron down -->
                <ChevronDown
                  :size="15"
                  class="text-ink-600 transition-transform duration-200"
                  :class="{ 'rotate-180': userMenuOpen }"
                  aria-hidden="true"
                />
              </button>

              <!-- Dropdown Menu -->
              <div
                v-show="userMenuOpen"
                class="absolute right-0 mt-2.5 w-60 rounded-xl border border-ink-200 bg-white py-2 shadow-(--shadow-e3) z-50 divide-y divide-ink-100"
              >
                <!-- User Profile Header -->
                <div class="px-4 py-2.5">
                  <p class="text-sm font-bold text-ink-900 truncate">{{ authStore.user?.fullName || 'Người dùng' }}</p>
                  <p class="text-xs text-ink-500 truncate mt-0.5">{{ authStore.user?.email || '' }}</p>
                  <span class="inline-block mt-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-brand-50 text-brand-700 border border-brand-100">
                    {{ roleLabel }}
                  </span>
                </div>

                <!-- Navigation Links in Dropdown -->
                <div class="py-1.5 text-sm text-ink-700">
                  <router-link
                    :to="accountRoute"
                    class="flex items-center gap-2.5 px-4 py-2 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                    @click="userMenuOpen = false"
                  >
                    <LayoutGrid :size="16" class="text-ink-500" />
                    <span>Tài khoản</span>
                  </router-link>
                  <router-link
                    v-if="authStore.userRole === 'CUSTOMER'"
                    to="/app/orders"
                    class="flex items-center gap-2.5 px-4 py-2 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                    @click="userMenuOpen = false"
                  >
                    <ClipboardList :size="16" class="text-ink-500" />
                    <span>Đơn sửa chữa của tôi</span>
                  </router-link>
                  <router-link
                    v-else-if="authStore.userRole === 'TECHNICIAN'"
                    to="/tech/jobs"
                    class="flex items-center gap-2.5 px-4 py-2 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                    @click="userMenuOpen = false"
                  >
                    <ClipboardList :size="16" class="text-ink-500" />
                    <span>Đơn nhận việc</span>
                  </router-link>
                  <router-link
                    v-else-if="authStore.userRole === 'ADMIN' || authStore.userRole === 'SERVICE_MANAGER'"
                    to="/console/orders"
                    class="flex items-center gap-2.5 px-4 py-2 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                    @click="userMenuOpen = false"
                  >
                    <ClipboardList :size="16" class="text-ink-500" />
                    <span>Quản lý đơn</span>
                  </router-link>
                  <router-link
                    v-if="authStore.userRole === 'CUSTOMER'"
                    to="/app/profile"
                    class="flex items-center gap-2.5 px-4 py-2 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                    @click="userMenuOpen = false"
                  >
                    <User :size="16" class="text-ink-500" />
                    <span>Hồ sơ cá nhân</span>
                  </router-link>
                </div>

                <!-- Logout Action -->
                <div class="pt-1.5 pb-1">
                  <button
                    type="button"
                    class="flex items-center gap-2.5 px-4 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50 w-full text-left transition-colors"
                    @click="logout"
                  >
                    <LogOut :size="16" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <router-link to="/login" class="public-nav-link">Đăng nhập</router-link>
            <FhButton @click="router.push('/app/bookings/new')">
              Đặt lịch sửa chữa
              <ArrowRight :size="16" aria-hidden="true" />
            </FhButton>
          </template>
        </div>

        <div class="flex items-center gap-3 xl:hidden">
          <template v-if="authStore.isAuthenticated">
            <FhButton size="sm" class="flex items-center gap-1.5" @click="router.push(accountRoute)">
              <LayoutGrid :size="16" />
              <span class="hidden sm:inline">Vào trang quản lý</span>
            </FhButton>
          </template>
          <div v-else class="hidden sm:block">
            <FhButton @click="router.push('/app/bookings/new')">Đặt lịch sửa chữa</FhButton>
          </div>
          <button
            ref="menuTrigger"
            type="button"
            class="flex h-12 w-12 items-center justify-center rounded-sm border border-ink-200"
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
      <nav
        v-if="mobileMenuOpen"
        id="public-mobile-menu"
        aria-label="Điều hướng trên di động"
        class="absolute inset-x-0 top-full max-h-[calc(100dvh-80px)] overflow-y-auto border-b border-ink-200 bg-white px-4 pb-6 shadow-(--shadow-e2) xl:hidden"
      >
        <router-link
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="public-nav-link flex border-b border-ink-100 py-3"
          @click="closeMenu()"
        >
          {{ item.label }}
        </router-link>
        <router-link to="/track" class="public-nav-link flex py-3" @click="closeMenu()">
          Tra cứu đơn sửa chữa
        </router-link>
        <div class="mt-4 grid gap-3">
          <template v-if="authStore.isAuthenticated">
            <div class="flex items-center gap-3 p-3 rounded-xl bg-ink-50 border border-ink-100">
              <div class="h-10 w-10 rounded-full border-2 border-brand-200 overflow-hidden bg-brand-50 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="h-full w-full object-cover" />
                <span v-else>{{ userInitial }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-ink-900 truncate">{{ authStore.user?.fullName || 'Người dùng' }}</p>
                <p class="text-xs text-ink-500 truncate">{{ authStore.user?.email || '' }}</p>
                <span class="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                  {{ roleLabel }}
                </span>
              </div>
            </div>
            <FhButton block class="flex items-center justify-center gap-2" @click="router.push(accountRoute); closeMenu();">
              <LayoutGrid :size="16" />
              <span>Vào trang quản lý</span>
            </FhButton>
            <router-link :to="accountRoute" class="public-nav-link justify-center font-medium" @click="closeMenu()">
              Tài khoản
            </router-link>
            <FhButton variant="ghost" block @click="logout">Đăng xuất</FhButton>
          </template>
          <template v-else>
            <FhButton block @click="router.push('/app/bookings/new')">Đặt lịch sửa chữa</FhButton>
            <router-link to="/login" class="public-nav-link justify-center" @click="closeMenu()">
              Đăng nhập
            </router-link>
          </template>
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

          <!-- Contact & Region Column -->
          <div>
            <h2 class="mb-4 text-xs font-bold uppercase tracking-wider text-slate-200">
              Khu vực & Hỗ trợ
            </h2>
            <ul class="space-y-3 text-sm text-slate-400">
              <li class="flex items-start gap-2.5">
                <MapPin :size="16" class="text-blue-400 shrink-0 mt-0.5" />
                <span class="leading-snug">Khu Công nghệ cao, TP. Thủ Đức, TP. Hồ Chí Minh</span>
              </li>
              <li class="flex items-center gap-2.5">
                <Phone :size="16" class="text-blue-400 shrink-0" />
                <span>Hotline: <strong class="text-slate-200 font-semibold">1900 xxxx</strong> (8:00 - 20:00)</span>
              </li>
              <li class="flex items-center gap-2.5">
                <Mail :size="16" class="text-blue-400 shrink-0" />
                <span>hotro@fixhome.vn</span>
              </li>
              <li class="pt-1">
                <router-link
                  :to="authStore.isAuthenticated ? accountRoute : '/login'"
                  class="public-footer-link text-blue-400 hover:text-blue-300 font-medium"
                >
                  <span>{{ authStore.isAuthenticated ? 'Vào trang quản lý' : 'Đăng nhập tài khoản' }}</span>
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
