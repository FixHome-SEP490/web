<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Crown, Wrench } from 'lucide-vue-next';
import { catalogApi, type ServiceCategory } from '../../api/catalog.api';
import { useReferenceData } from '../../composables/useCachedQuery';
import { queryKeys } from '../../lib/query-keys';
import { FhEmptyState, FhSkeleton } from '../index';
import { getCategoryArtworkUrl } from '../../utils/service-presentation';

const categories = ref<ServiceCategory[]>([]);
const loading = ref(true);
const error = ref(false);

const activeCategories = computed(() => categories.value.filter((category) => category.isActive));
const visibleCategories = computed(() => activeCategories.value.slice(0, 6));

interface CategoryWithHighlight extends ServiceCategory {
  isPopular?: boolean;
  isFeatured?: boolean;
  popular?: boolean;
  featured?: boolean;
}

function isFeaturedCategory(category: ServiceCategory): boolean {
  const item = category as CategoryWithHighlight;
  return Boolean(item.isPopular || item.isFeatured || item.popular || item.featured);
}

function cardAppearanceClass(index: number, category: ServiceCategory): string {
  if (index === 0 || isFeaturedCategory(category)) {
    return 'card-featured bg-gradient-to-br from-[#EEF5FF] via-[#F4F9FF] to-white border border-blue-200/90 shadow-[0_4px_16px_rgba(37,99,235,0.06)] hover:border-brand-400';
  }
  return 'card-standard bg-white border border-[#E1E9F5] shadow-[0_2px_12px_rgba(37,99,235,0.04)] hover:border-brand-300';
}

function buttonAppearanceClass(index: number, category: ServiceCategory): string {
  if (index === 0 || isFeaturedCategory(category)) {
    return 'bg-brand-600 text-white shadow-xs group-hover:bg-brand-700';
  }
  return 'bg-[#EFF6FF] text-brand-600 group-hover:bg-brand-600 group-hover:text-white';
}

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
  <section class="landing-section bg-transparent" aria-labelledby="services-title">
    <div class="landing-container">
      <!-- Section Header -->
      <div class="mb-8 flex flex-col justify-between gap-5 sm:mb-10 sm:flex-row sm:items-end">
        <div class="max-w-2xl">
          <div class="inline-flex items-center gap-1.5 rounded-full bg-[#DDEBFF] px-3.5 py-1 text-xs font-semibold text-brand-600 sm:text-sm shadow-2xs">
            <Wrench :size="14" class="text-brand-600 shrink-0" aria-hidden="true" />
            <span>Danh mục dịch vụ</span>
          </div>
          <h2 id="services-title" class="services-title mt-3">Dịch vụ cho ngôi nhà của bạn</h2>
          <p class="landing-description mt-3 max-w-[62ch]">
            Tùy dịch vụ, bạn xem giá công theo loại máy hoặc nhận báo giá sau khảo sát.
          </p>
        </div>

        <router-link
          to="/services"
          class="landing-all-services-link group inline-flex shrink-0 items-center gap-2 rounded-full border border-brand-500 bg-white px-5 py-2.5 text-sm font-semibold text-brand-600 shadow-2xs transition-all duration-200 hover:border-brand-600 hover:bg-brand-50/80 hover:text-brand-700 hover:shadow-xs active:scale-[0.98]"
        >
          <span>Xem tất cả dịch vụ</span>
          <ArrowRight :size="16" class="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </router-link>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="loading"
        role="status"
        aria-label="Đang tải danh mục dịch vụ"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5"
      >
        <div
          v-for="item in 6"
          :key="item"
          class="flex items-center gap-4 rounded-[20px] border border-[#E1E9F5] bg-white p-4 sm:p-5 shadow-2xs"
          aria-hidden="true"
        >
          <FhSkeleton width="96px" height="96px" class="rounded-2xl shrink-0" />
          <div class="flex-1 min-w-0 py-1">
            <FhSkeleton width="65%" height="22px" />
            <FhSkeleton class="mt-2.5" width="92%" height="15px" />
            <FhSkeleton class="mt-1.5" width="75%" height="15px" />
            <FhSkeleton class="mt-3.5 rounded-full" width="115px" height="32px" />
          </div>
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

      <!-- Dynamic Service Category Cards: 3 cols desktop, 2 cols tablet, 1 col mobile -->
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        <router-link
          v-for="(category, index) in visibleCategories"
          :key="category.id"
          :to="{ name: 'services', query: { category: category.id } }"
          class="service-card group relative flex min-w-0 flex-row items-center gap-3.5 sm:gap-4 lg:gap-5 rounded-[20px] p-4 sm:p-5 lg:p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(37,99,235,0.08)] cursor-pointer"
          :class="cardAppearanceClass(index, category)"
        >
          <!-- Featured Badge (Only shown if current data confirms it is popular / featured) -->
          <div
            v-if="isFeaturedCategory(category)"
            class="absolute top-3 left-4 sm:top-3.5 sm:left-5 z-10"
          >
            <span class="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-2xs">
              <Crown :size="12" class="fill-current" aria-hidden="true" />
              Dịch vụ phổ biến
            </span>
          </div>

          <!-- Left: Illustration Artwork -->
          <div
            class="flex h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32 shrink-0 items-center justify-center transition-transform duration-300 ease-out group-hover:scale-105"
            :class="{ 'mt-3 sm:mt-2': isFeaturedCategory(category) }"
          >
            <img
              :src="getCategoryArtworkUrl(category)"
              :alt="category.name"
              loading="lazy"
              class="h-full w-full object-contain drop-shadow-xs select-none pointer-events-none"
              aria-hidden="true"
            />
          </div>

          <!-- Right: Service Details & Action -->
          <div class="flex flex-1 min-w-0 flex-col justify-between self-stretch py-0.5">
            <div>
              <h3 class="text-base sm:text-lg lg:text-[19px] font-bold text-ink-900 tracking-tight transition-colors duration-200 group-hover:text-brand-600 leading-snug">
                {{ category.name }}
              </h3>
              <p class="mt-1 sm:mt-1.5 line-clamp-2 text-xs sm:text-[13px] lg:text-[13.5px] leading-relaxed text-ink-600">
                {{ categoryDescription(category) }}
              </p>
            </div>

            <div class="mt-3.5 sm:mt-4 pt-0.5">
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-[13px] font-semibold transition-all duration-200"
                :class="buttonAppearanceClass(index, category)"
              >
                <span>Xem dịch vụ</span>
                <ArrowRight :size="14" class="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </div>
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

.service-card {
  min-height: 168px;
}

@media (min-width: 640px) {
  .service-card {
    min-height: 180px;
  }
}

@media (min-width: 1024px) {
  .service-card {
    min-height: 188px;
  }
}
</style>
