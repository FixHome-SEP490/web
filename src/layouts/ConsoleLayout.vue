<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { AppSidebar } from '../components';
import {
  LayoutDashboard,
  KanbanSquare,
  UserPlus,
  Users,
  UserCheck,
  Ban,
  ShieldAlert,
  FolderKanban,
  Package,
  Sliders,
  LifeBuoy,
  Receipt,
  ScrollText,
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
      { label: 'Gán thợ thủ công', path: '/console/bookings', icon: UserPlus },
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
