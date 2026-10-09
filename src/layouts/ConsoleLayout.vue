<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { AppSidebar } from '../components';
import NotificationBellDropdown from '../components/notifications/NotificationBellDropdown.vue';
import {
  LayoutDashboard,
  KanbanSquare,
  UserPlus,
  Users,
  UserCheck,
  Award,
  Ban,
  ShieldCheck,
  FolderKanban,
  Package,
  Sliders,
  LifeBuoy,
  Receipt,
  ScrollText,
  Boxes,
  Wallet,
  Home,
  ChevronRight,
  MapPinned,
  Gauge,
} from 'lucide-vue-next';


const route = useRoute();
const authStore = useAuthStore();

const isAdmin = computed(() => authStore.userRole === 'ADMIN');
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const navigation = computed(() => [
  {
    group: 'Vận hành & hỗ trợ',
    items: [
      { label: 'Tổng quan vận hành', path: '/console', icon: LayoutDashboard },
      { label: 'Board đơn sửa chữa', path: '/console/orders', icon: KanbanSquare },
      { label: 'Yêu cầu linh kiện', path: '/console/part-requests', icon: Boxes },
      { label: 'Gán thợ thủ công', path: '/console/bookings', icon: UserPlus },
      { label: 'Ví & Rút tiền KTV', path: '/console/wallets', icon: Wallet },
      { label: 'Khu vực phục vụ', path: '/console/service-areas', icon: MapPinned },
        ...(isServiceManager.value
        ? [
            { label: 'Hàng đợi hỗ trợ', path: '/console/support', icon: LifeBuoy },
            { label: 'Yêu cầu bảo hành', path: '/console/warranty', icon: ShieldCheck },
            { label: 'Huỷ đơn & Khiếu nại', path: '/console/cancellations', icon: Ban },
            { label: 'Điểm uy tín', path: '/console/reputation', icon: Gauge },
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
            { label: 'Duyệt kỹ năng thợ', path: '/console/admin/skill-verifications', icon: Award },
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
</script>

<template>
  <div class="min-h-screen flex bg-ink-50 text-ink-900">
    <!-- Sidebar -->
    <AppSidebar 
      :navigation="navigation" 
      :subtitle="isAdmin ? 'Admin Console' : 'Manager Console'"
    />

    <!-- Main Workspace -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Premium Topbar -->
      <header class="h-16 lg:h-[72px] bg-white/80 backdrop-blur-md border-b border-ink-200/80 px-6 lg:px-10 flex items-center justify-between sticky top-0 z-40 shadow-sm transition-all">
        <!-- Breadcrumb / Route Title -->
        <div class="flex items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-50 text-ink-500 text-sm font-medium hover:bg-ink-100 hover:text-ink-700 transition-colors cursor-pointer border border-transparent hover:border-ink-200">
            <Home :size="16" />
            <span class="hidden sm:inline">Console</span>
          </div>
          <ChevronRight :size="16" class="text-ink-300" />
          <h1 class="text-base sm:text-lg font-bold text-ink-900 tracking-tight">{{ route.meta?.title ?? 'Dashboard' }}</h1>
        </div>

        <div class="flex items-center gap-3 sm:gap-5">

          <div class="w-px h-6 bg-ink-200 hidden md:block"></div>

          <NotificationBellDropdown />
          
          <div class="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-brand-50 border border-brand-200/60 shadow-xs">
            <div class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
            </div>
            <span class="text-xs font-bold text-brand-700 uppercase tracking-wider">{{ authStore.user?.role }}</span>
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
