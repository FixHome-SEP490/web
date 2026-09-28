<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import {
  ArrowRight,
  Wrench,
  Wind,
  Snowflake,
  Droplets,
  Zap,
  Refrigerator,
  WashingMachine,
  Flame,
  Utensils,
  Lock,
  ShieldCheck,
} from 'lucide-vue-next';
import { catalogApi, type ServiceCategory } from '../../api/catalog.api';
import { FhEmptyState, FhSkeleton } from '../index';

const categories = ref<ServiceCategory[]>([]);
const loading = ref(true);
const error = ref(false);

const visibleCategories = computed(() =>
  categories.value.filter((category) => category.isActive).slice(0, 6),
);

// Balanced grid layout: 2x2 centered grid if 4 categories, 3x2 if 6 categories
const gridLayoutClass = computed(() => {
  const count = visibleCategories.value.length;
  if (count <= 4) {
    return 'max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6';
  }
  return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6';
});

// Semantic icon map supporting various key formats
const iconMap: Record<string, Component> = {
  snowflake: Snowflake,
  wind: Wind,
  droplets: Droplets,
  zap: Zap,
  refrigerator: Refrigerator,
  'washing-machine': WashingMachine,
  washingmachine: WashingMachine,
  flame: Flame,
  utensils: Utensils,
  lock: Lock,
  shield: ShieldCheck,
  wrench: Wrench,
};

function getCategoryIcon(key?: string | null) {
  if (!key) return Wrench;
  const normalized = key.toLowerCase().trim();
  return iconMap[normalized] || Wrench;
}

async function loadCategories() {
  loading.value = true;
  error.value = false;
  try {
    categories.value = await catalogApi.getCategories(true);
  } catch {
    error.value = true;
    categories.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadCategories);
</script>

<template>
  <section class="landing-section bg-white" aria-labelledby="services-title">
    <div class="landing-container">
      <div class="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div class="max-w-xl">
          <p class="landing-eyebrow">Bắt đầu từ điều bạn cần</p>
          <h2 id="services-title" class="services-title">Dịch vụ cho ngôi nhà của bạn</h2>
          <p class="landing-description">
            Chọn nhóm thiết bị để xem chi tiết các hạng mục sửa chữa, bảo trì và khoảng giá tham khảo.
          </p>
        </div>
        <router-link to="/services" class="landing-text-link shrink-0">
          Xem tất cả dịch vụ
          <ArrowRight :size="18" aria-hidden="true" />
        </router-link>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="loading"
        role="status"
        aria-label="Đang tải danh mục dịch vụ"
        class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div
          v-for="item in 4"
          :key="item"
          class="rounded-xl border border-ink-200/80 bg-white p-6 shadow-xs"
          aria-hidden="true"
        >
          <FhSkeleton width="48px" height="48px" class="rounded-xl" />
          <FhSkeleton class="mt-5" width="65%" height="20px" />
          <FhSkeleton class="mt-3" width="90%" height="16px" />
          <FhSkeleton class="mt-4" width="35%" height="16px" />
        </div>
      </div>

      <!-- Error state -->
      <FhEmptyState
        v-else-if="error"
        title="Chưa tải được danh mục dịch vụ"
        description="Vui lòng kiểm tra kết nối mạng và thử lại."
        action-text="Thử lại"
        @action="loadCategories"
      />

      <!-- Empty state -->
      <FhEmptyState
        v-else-if="!visibleCategories.length"
        title="Danh mục dịch vụ đang được cập nhật"
        description="Bạn có thể tìm hiểu quy trình sửa chữa trong lúc chờ các dịch vụ được mở."
      />

      <!-- Dynamic Service Category Cards -->
      <div v-else :class="gridLayoutClass">
        <router-link
          v-for="(category, index) in visibleCategories"
          :key="category.id"
          :to="{ name: 'services', query: { category: category.id } }"
          class="service-card group flex min-w-0 flex-col justify-between rounded-xl border border-ink-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-(--shadow-e2)"
          :style="{ animationDelay: `${index * 80}ms` }"
        >
          <div>
            <div class="flex items-center justify-between">
              <span
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white"
              >
                <component
                  :is="getCategoryIcon(category.iconKey)"
                  :size="22"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
              </span>
              <span class="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600 group-hover:bg-brand-50 group-hover:text-brand-700 transition-colors">
                Chính hãng & bảo hành
              </span>
            </div>

            <div class="mt-4 min-w-0">
              <h3 class="text-base sm:text-[17px] font-semibold text-ink-900 group-hover:text-brand-600 transition-colors">
                {{ category.name }}
              </h3>
              <p class="mt-2 text-sm leading-6 text-ink-600 line-clamp-2">
                {{ category.description || 'Xem dịch vụ và thông tin sửa chữa.' }}
              </p>
            </div>
          </div>

          <div class="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
              Xem dịch vụ
              <ArrowRight :size="15" class="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
            </span>
            <span class="text-xs text-ink-500 font-num">Xem bảng giá</span>
          </div>
        </router-link>
      </div>
    </div>
  </section>
</template>

<style scoped>
.services-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .services-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .services-title {
    font-size: 34px;
  }
}

.service-card {
  animation: cardFadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes cardFadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .service-card {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
