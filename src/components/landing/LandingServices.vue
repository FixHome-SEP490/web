<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import { categoryIcon } from '../booking/service-icons';
import { catalogApi, type ServiceCategory } from '../../api/catalog.api';
import { useReferenceData } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { FhEmptyState, FhSkeleton } from '../index';

const categories = ref<ServiceCategory[]>([]);
const loading = ref(true);
const error = ref(false);

const activeCategories = computed(() => categories.value.filter((category) => category.isActive));
const visibleCategories = computed(() => activeCategories.value.slice(0, 6));

const gridLayoutClass = computed(() => {
  const count = visibleCategories.value.length;
  if (count <= 4) {
    return 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4';
  }
  return 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4';
});

// Do not expose catalog rollout notes in public highlights.
function categoryDescription(category: ServiceCategory): string {
  const description = category.description?.trim();
  if (description && !/chưa\s+kích\s+hoạt|catalog\s*v2/i.test(description)) return description;
  const fallback: Record<string, string> = {
    CAT_AC: 'Vệ sinh, bảo dưỡng và sửa máy lạnh.',
    CAT_LAUNDRY: 'Vệ sinh và sửa chữa máy giặt, máy sấy.',
    CAT_FRIDGE: 'Kiểm tra, bảo dưỡng và sửa tủ lạnh.',
    CAT_RO: 'Thay lõi, bảo dưỡng và sửa máy lọc nước.',
    CAT_HEATER: 'Kiểm tra và sửa chữa bình nóng lạnh.',
    CAT_KITCHEN: 'Bảo dưỡng và sửa chữa thiết bị nhà bếp.',
  };
  return fallback[category.code] || `Khám phá dịch vụ ${category.name.toLocaleLowerCase('vi-VN')} tại nhà.`;
}

const reference = useReferenceData();

async function loadCategories() {
  loading.value = true;
  error.value = false;
  try {
    categories.value = await reference(queryKeys.reference.categories({ activeOnly: true }), () => catalogApi.getCategories(true));
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
  <section class="landing-section bg-ink-25/60" aria-labelledby="services-title">
    <div class="landing-container">
      <div class="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div class="max-w-xl">
          <p class="landing-eyebrow">Bắt đầu từ điều bạn cần</p>
          <h2 id="services-title" class="services-title">Dịch vụ cho ngôi nhà của bạn</h2>
          <p class="landing-description max-w-[62ch]">
            Tùy dịch vụ, bạn xem giá công theo loại máy hoặc nhận báo giá sau khảo sát.
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
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <div
          v-for="item in 4"
          :key="item"
          class="rounded-2xl border border-ink-200/80 bg-white p-5"
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
          v-for="category in visibleCategories"
          :key="category.id"
          :to="{ name: 'services', query: { category: category.id } }"
          class="service-card group flex min-h-[224px] min-w-0 flex-col justify-between rounded-2xl border border-ink-200/80 bg-white p-5 transition-colors duration-200 hover:border-brand-300 sm:p-6"
        >
          <div>
            <div class="flex items-center justify-between">
              <span
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
              >
                <component
                  :is="categoryIcon(category)"
                  :size="22"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
              </span>
            </div>

            <div class="mt-4 min-w-0">
              <h3 class="text-base font-semibold text-ink-900 transition-colors group-hover:text-brand-700 sm:text-[17px]">
                {{ category.name }}
              </h3>
              <p class="mt-2 line-clamp-2 text-[15px] leading-6 text-ink-600">
                {{ categoryDescription(category) }}
              </p>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
            <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
              Xem dịch vụ
              <ArrowRight :size="16" aria-hidden="true" />
            </span>
          </div>
        </router-link>
      </div>
    </div>
  </section>
</template>

<style scoped>
.services-title {
  font-size: clamp(1.8rem, 3vw, 2.25rem);
  line-height: 1.15;
  letter-spacing: -0.035em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}
</style>
