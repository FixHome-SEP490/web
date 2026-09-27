<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { PhoneCall, ShieldCheck, Search, Menu, X, LayoutDashboard, LogOut, ChevronDown } from 'lucide-vue-next';

import { FhButton } from '../components';

const router = useRouter();
const authStore = useAuthStore();
const isScrolled = ref(false);
const mobileMenuOpen = ref(false);
const avatarMenuOpen = ref(false);

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20;
};

onMounted(async () => {
  window.addEventListener('scroll', handleScroll);
  handleScroll();
  // If token exists but profile not yet loaded, fetch it silently
  if (authStore.token && !authStore.user) {
    try {
      await authStore.fetchProfile();
    } catch {
      // ignore – user simply appears as guest
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});

/** Where the "Dashboard" button takes the logged-in user */
const dashboardRoute = computed(() => {
  const role = authStore.userRole;
  if (role === 'ADMIN' || role === 'SERVICE_MANAGER') return '/console';
  if (role === 'TECHNICIAN') return '/tech';
  return '/app';
});

const handleLogout = async () => {
  avatarMenuOpen.value = false;
  await authStore.logout();
  window.location.href = '/';
};
</script>

<template>
  <div class="min-h-screen flex flex-col bg-ink-50 text-ink-900">
    <!-- Header: Transparent -> Solid on scroll per P6.1 -->
    <header
      class="fixed top-0 left-0 right-0 z-40 transition-all duration-200"
      :class="[
        isScrolled
          ? 'bg-white/95 backdrop-blur-md border-b border-ink-200 shadow-(--shadow-e1) py-3.5'
          : 'bg-transparent py-5',
      ]"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <!-- Logo -->
        <router-link to="/" class="inline-flex items-center gap-2.5 group">
          <img :src="'/logo.png'" alt="FixHome" class="w-10 h-10 object-contain rounded-xl shadow-xs group-hover:scale-105 transition-transform" />
          <div>
            <span class="text-xl font-extrabold text-ink-900 tracking-tight">Fix<span class="text-brand-600">Home</span></span>
            <span class="block text-[10px] font-medium text-ink-500 -mt-0.5 tracking-wider uppercase">Sửa chữa gia đình</span>
          </div>
        </router-link>

        <!-- Desktop Navigation Links -->
        <nav class="hidden md:flex items-center gap-8 text-sm font-medium text-ink-700">
          <router-link to="/services" class="hover:text-brand-600 transition-colors">Dịch vụ</router-link>
          <router-link to="/how-it-works" class="hover:text-brand-600 transition-colors">Cách hoạt động</router-link>
          <router-link to="/for-technicians" class="hover:text-brand-600 transition-colors">Dành cho Thợ</router-link>
          <router-link to="/pricing-policy" class="hover:text-brand-600 transition-colors">Chính sách giá</router-link>
          <router-link to="/track" class="inline-flex items-center gap-1.5 hover:text-brand-600 transition-colors">
            <Search :size="15" />
            Tra cứu đơn
          </router-link>
        </nav>

        <!-- Right Actions: auth-aware -->
        <div class="hidden sm:flex items-center gap-3">
          <!-- LOGGED IN: show Dashboard button + Avatar dropdown -->
          <template v-if="authStore.isAuthenticated">
            <FhButton variant="primary" size="sm" @click="router.push(dashboardRoute)">
              <LayoutDashboard :size="16" />
              Vào trang quản lý
            </FhButton>

            <!-- Avatar dropdown -->
            <div class="relative">
              <button
                class="flex items-center gap-1.5 p-1 rounded-full hover:bg-ink-100 transition-colors"
                @click="avatarMenuOpen = !avatarMenuOpen"
              >
                <div class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center text-sm border border-brand-200 overflow-hidden">
                  <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'U' }}</span>
                </div>
                <ChevronDown :size="14" class="text-ink-500" />
              </button>

              <div
                v-if="avatarMenuOpen"
                class="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-ink-200 shadow-lg py-2 z-50 divide-y divide-ink-100"
                @click="avatarMenuOpen = false"
              >
                <div class="px-4 py-2">
                  <p class="text-sm font-semibold text-ink-900 truncate">{{ authStore.user?.fullName }}</p>
                  <p class="text-xs text-ink-500 truncate">{{ authStore.user?.email }}</p>
                </div>
                <div class="py-1 text-sm text-ink-700">
                  <button
                    class="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 w-full text-left"
                    @click="router.push(dashboardRoute)"
                  >
                    <LayoutDashboard :size="16" />
                    Trang quản lý
                  </button>
                </div>
                <div class="py-1">
                  <button
                    class="flex items-center gap-2.5 px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 w-full text-left"
                    @click="handleLogout"
                  >
                    <LogOut :size="16" />
                    Đăng xuất
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- GUEST: show login / register -->
          <template v-else>
            <FhButton variant="ghost" size="sm" @click="router.push('/login')">
              Đăng nhập
            </FhButton>
            <FhButton variant="primary" size="sm" @click="router.push('/register')">
              Đăng ký ngay
            </FhButton>
          </template>
        </div>

        <!-- Mobile Menu Trigger -->
        <button
          class="md:hidden p-2 text-ink-700 hover:text-ink-900 rounded-sm"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <Menu v-if="!mobileMenuOpen" :size="24" />
          <X v-else :size="24" />
        </button>
      </div>

      <!-- Mobile Dropdown Menu -->
      <div
        v-if="mobileMenuOpen"
        class="md:hidden bg-white border-b border-ink-200 px-4 py-6 space-y-4 shadow-(--shadow-e2)"
      >
        <div class="flex flex-col space-y-3 text-base font-medium">
          <router-link to="/services" class="py-1 text-ink-800" @click="mobileMenuOpen = false">Dịch vụ</router-link>
          <router-link to="/how-it-works" class="py-1 text-ink-800" @click="mobileMenuOpen = false">Cách hoạt động</router-link>
          <router-link to="/for-technicians" class="py-1 text-ink-800" @click="mobileMenuOpen = false">Dành cho Thợ</router-link>
          <router-link to="/pricing-policy" class="py-1 text-ink-800" @click="mobileMenuOpen = false">Chính sách giá</router-link>
          <router-link to="/track" class="py-1 text-ink-800 flex items-center gap-2" @click="mobileMenuOpen = false">
            <Search :size="16" />
            Tra cứu đơn
          </router-link>
        </div>
        <div class="pt-4 border-t border-ink-100 flex flex-col gap-2">
          <!-- Mobile: auth-aware buttons -->
          <template v-if="authStore.isAuthenticated">
            <div class="px-1 py-2 text-sm font-medium text-ink-700 flex items-center gap-2">
              <div class="w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center text-xs border border-brand-200 overflow-hidden">
                <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" class="w-full h-full object-cover" />
                <span v-else>{{ authStore.user?.fullName?.charAt(0) ?? 'U' }}</span>
              </div>
              <span class="truncate">{{ authStore.user?.fullName }}</span>
            </div>
            <FhButton variant="primary" size="md" block @click="router.push(dashboardRoute); mobileMenuOpen = false;">
              <LayoutDashboard :size="16" />
              Vào trang quản lý
            </FhButton>
            <FhButton variant="ghost" size="md" block @click="handleLogout; mobileMenuOpen = false;">
              Đăng xuất
            </FhButton>
          </template>
          <template v-else>
            <FhButton variant="secondary" size="md" block @click="router.push('/login'); mobileMenuOpen = false;">
              Đăng nhập
            </FhButton>
            <FhButton variant="primary" size="md" block @click="router.push('/register'); mobileMenuOpen = false;">
              Đăng ký tài khoản
            </FhButton>
          </template>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 pt-20">
      <router-view />
    </main>

    <!-- Comprehensive Footer per P6.1 -->
    <footer class="bg-white border-t border-ink-200 pt-16 pb-12 mt-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-10">
          <!-- Col 1: Brand -->
          <div class="space-y-4 md:col-span-1">
            <div class="inline-flex items-center gap-2.5">
              <img :src="'/logo.png'" alt="FixHome" class="w-9 h-9 object-contain rounded-lg" />
              <span class="text-xl font-extrabold text-ink-900 tracking-tight">Fix<span class="text-brand-600">Home</span></span>
            </div>
            <p class="text-sm text-ink-600 leading-relaxed">
              Nền tảng công nghệ kết nối thợ sửa chữa gia đình hàng đầu. Minh bạch tiền công và vật tư.
            </p>
            <div class="inline-flex items-center gap-2 text-xs text-ink-500">
              <ShieldCheck :size="16" class="text-success-600" />
              Bảo vệ quyền lợi khách hàng 100%
            </div>
          </div>

          <!-- Col 2: Services -->
          <div>
            <h4 class="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Dịch vụ chính</h4>
            <ul class="space-y-2.5 text-sm text-ink-600">
              <li><router-link to="/services/dien-lanh" class="hover:text-brand-600 transition-colors">Sửa chữa máy lạnh</router-link></li>
              <li><router-link to="/services/dien-nuoc" class="hover:text-brand-600 transition-colors">Điện &amp; Nước dân dụng</router-link></li>
              <li><router-link to="/services/thiet-bi-bep" class="hover:text-brand-600 transition-colors">Thiết bị bếp &amp; gia dụng</router-link></li>
              <li><router-link to="/services/khoa-cua" class="hover:text-brand-600 transition-colors">Khoá cửa &amp; An ninh</router-link></li>
            </ul>
          </div>

          <!-- Col 3: Links -->
          <div>
            <h4 class="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Thông tin</h4>
            <ul class="space-y-2.5 text-sm text-ink-600">
              <li><router-link to="/how-it-works" class="hover:text-brand-600 transition-colors">Quy trình sửa chữa</router-link></li>
              <li><router-link to="/for-technicians" class="hover:text-brand-600 transition-colors">Gia nhập đội ngũ thợ</router-link></li>
              <li><router-link to="/pricing-policy" class="hover:text-brand-600 transition-colors">Chính sách công &amp; vật tư</router-link></li>
              <li><router-link to="/track" class="hover:text-brand-600 transition-colors">Tra cứu tiến độ đơn</router-link></li>
            </ul>
          </div>

          <!-- Col 4: Contact -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Hỗ trợ khẩn cấp</h4>
            <div class="flex items-center gap-3 text-brand-600 font-num font-bold text-lg">
              <PhoneCall :size="20" />
              1900 8888 (24/7)
            </div>
            <p class="text-xs text-ink-500">
              Tổng đài xử lý sự cố khẩn cấp và bảo hành toàn quốc.
            </p>
          </div>
        </div>

        <div class="mt-12 pt-8 border-t border-ink-100 flex flex-col sm:flex-row items-center justify-between text-xs text-ink-500 gap-4">
          <div>© 2026 FixHome Vietnam. Đồ án tốt nghiệp SEP490.</div>
          <div class="flex gap-6">
            <span>Điều khoản sử dụng</span>
            <span>Chính sách bảo mật</span>
            <span>Chính sách giải quyết tranh chấp</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
