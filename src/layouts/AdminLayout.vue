<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <AppSidebar 
      :navigation="navigation" 
      subtitle="Admin Panel"
    />

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <header class="h-16 bg-white shadow flex items-center justify-between px-6">
        <h2 class="text-lg font-semibold text-gray-800">
          <!-- Page title can be set via route meta -->
        </h2>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">
            {{ authStore.user?.fullName ?? 'User' }}
          </span>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 p-6 bg-gray-50">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../stores';
import { AppSidebar } from '../components';
import { LayoutDashboard } from 'lucide-vue-next';

const authStore = useAuthStore();

const navigation = computed(() => [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }
    ]
  }
]);
</script>
