<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import {
  Wrench,
  LayoutDashboard,
  KanbanSquare,
  Users,
  UserCheck,
  Ban,
  ShieldAlert,
  FolderKanban,
  Package,
  Sliders,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Receipt,
  ScrollText,
} from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const isCollapsed = ref(false);

const isAdmin = computed(() => authStore.userRole === 'ADMIN');
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const navigation = computed(() => [
  {
    group: 'Vận hành & hỗ trợ',
    items: [
      { label: 'Tổng quan vận hành', path: '/console', icon: LayoutDashboard },
      { label: 'Board đơn sửa chữa', path: '/console/orders', icon: KanbanSquare },
        ...(isServiceManager.value
        ? [
            { label: 'Hàng đợi hỗ trợ', path: '/console/support', icon: LifeBuoy },
            { label: 'Huỷ đơn & Khiếu nại', path: '/console/cancellations', icon: Ban },
            { label: 'Vi phạm & Khoá tài khoản', path: '/console/strikes', icon: ShieldAlert },
          ]
        : []),
    ],
  },
  ...(isAdmin.value
    ? [
        {
          group: 'Quản trị & governance',
          items: [
            { label: 'Kỹ thuật viên & Duyệt KYC', path: '/console/technicians', icon: UserCheck },
            { label: 'Danh mục & Bảng giá', path: '/console/catalog', icon: FolderKanban },
            { label: 'Danh mục linh kiện', path: '/console/admin/parts', icon: Package },
            { label: 'Quản lý người dùng', path: '/console/admin/users', icon: Users },
            { label: 'Cấu hình hệ thống (24)', path: '/console/admin/config', icon: Sliders },
            { label: 'Công nợ Platform', path: '/console/admin/platform-dues', icon: Receipt },
            { label: 'Nhật ký kiểm toán', path: '/console/admin/audit-logs', icon: ScrollText },
          ],
        },
      ]
    : []),
]);

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<template>
  <div class="min-h-screen flex bg-ink-50 text-ink-900">
    <!-- Left Sidebar: collapsible 240px / 72px per P6.1 -->
    <aside
      class="sticky top-0 h-screen z-30 bg-gray-900 text-white flex flex-col justify-between transition-all duration-300 shrink-0 select-none border-r border-gray-800"
      :class="isCollapsed ? 'w-18' : 'w-64'"
    >
      <!-- Collapse Trigger (Floating) -->
      <button
        class="absolute -right-3 top-6 w-6 h-6 bg-brand-600 rounded-full flex items-center justify-center text-white shadow-md hover:bg-brand-500 transition-colors z-50 focus:outline-none"
        @click="isCollapsed = !isCollapsed"
      >
        <component :is="isCollapsed ? ChevronRight : ChevronLeft" :size="14" stroke-width="3" />
      </button>

      <!-- Brand -->
      <div>
        <div class="h-16 flex items-center px-4 border-b border-gray-800 overflow-hidden whitespace-nowrap">
          <router-link to="/console" class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-sm bg-brand-600 flex items-center justify-center text-white shrink-0">
              <Wrench :size="20" />
            </div>
            <div class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">
              <span class="text-lg font-bold tracking-tight">Fix<span class="text-brand-400">Home</span></span>
              <span class="block text-[10px] font-semibold text-brand-300 uppercase tracking-widest -mt-1">
                {{ isAdmin ? 'Admin Console' : 'Manager Console' }}
              </span>
            </div>
          </router-link>
        </div>

        <!-- Navigation Menu -->
        <div class="p-3 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
          <div v-for="group in navigation" :key="group.group" class="space-y-1">
            <div
              class="px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 transition-opacity duration-300 whitespace-nowrap overflow-hidden"
              :class="isCollapsed ? 'opacity-0 h-0 invisible' : 'opacity-100 h-auto'"
            >
              {{ group.group }}
            </div>

            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-700 transition-colors whitespace-nowrap overflow-hidden"
              :class="[
                route.path === item.path || (item.path !== '/console' && route.path.startsWith(`${item.path}/`))
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-300',
              ]"
              :title="isCollapsed ? item.label : ''"
            >
              <component :is="item.icon" :size="18" class="shrink-0" />
              <span class="transition-opacity duration-300" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">{{ item.label }}</span>
            </router-link>
          </div>
        </div>
      </div>

      <!-- User Profile & Logout at Bottom -->
      <div class="p-3 border-t border-gray-800 overflow-hidden whitespace-nowrap">
        <div class="flex items-center gap-2.5 px-2 py-1.5 rounded-sm">
          <div class="w-8 h-8 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
            {{ authStore.user?.fullName?.charAt(0) ?? 'A' }}
          </div>
          <div class="transition-opacity duration-300 flex-1 min-w-0" :class="isCollapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto'">
            <p class="text-xs font-semibold text-white truncate">{{ authStore.user?.fullName }}</p>
            <p class="text-[11px] text-gray-400 truncate">{{ authStore.user?.role }}</p>
          </div>
          <button
            class="text-gray-400 hover:text-red-400 p-1 rounded transition-all duration-300 shrink-0"
            :class="isCollapsed ? 'opacity-0 w-0 invisible absolute' : 'opacity-100 w-auto relative'"
            title="Đăng xuất"
            @click="handleLogout"
          >
            <LogOut :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Workspace -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Topbar with Breadcrumbs per P6.1 -->
      <header class="h-16 bg-white border-b border-ink-200 px-6 sm:px-8 flex items-center justify-between shadow-(--shadow-e1)">
        <!-- Breadcrumb / Route Title -->
        <div class="flex items-center gap-2 text-sm text-ink-500">
          <span class="font-medium text-ink-700">Console</span>
          <span>/</span>
          <span class="font-semibold text-ink-900">{{ route.meta?.title ?? 'Dashboard' }}</span>
        </div>

        <div class="flex items-center gap-4">
          <div class="text-xs font-semibold px-2.5 py-1 rounded bg-brand-50 text-brand-700 border border-brand-200 uppercase">
            {{ authStore.user?.role }}
          </div>
        </div>
      </header>

      <!-- Main Content Container: max-width 1440px per P7.4 -->
      <main class="flex-1 p-6 sm:p-8 max-w-360 w-full mx-auto">
        <router-view />
      </main>
    </div>
  </div>
</template>
