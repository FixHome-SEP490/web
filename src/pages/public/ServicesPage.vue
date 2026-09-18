<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { Search, Clock } from 'lucide-vue-next';

import { FhButton, FhMoney, FhSkeleton, FhEmptyState } from '../../components';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';

const router = useRouter();
const selectedCategoryId = ref('ALL');
const searchQuery = ref('');

const loading = ref(true);
const loadError = ref('');
const categories = ref<ServiceCategory[]>([]);

useSmoothScroll();

const allServices = computed<ServiceItem[]>(() =>
  categories.value.flatMap((cat) => cat.services ?? []),
);

const filteredServices = computed(() => {
  return allServices.value.filter((s) => {
    const matchCat = selectedCategoryId.value === 'ALL' || s.categoryId === selectedCategoryId.value;
    const q = searchQuery.value.trim().toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
});

function isFixedPrice(service: ServiceItem): boolean {
  const mode = service.pricingMode?.toLowerCase();
  return mode === 'fixed_price' || (service.fixedPrice != null && service.fixedPrice > 0);
}

function goToDetail(service: ServiceItem) {
  router.push('/services/' + (service.slug ?? service.id));
}

async function loadCatalog() {
  loading.value = true;
  loadError.value = '';
  try {
    categories.value = await catalogApi.getCategories(true);
  } catch {
    categories.value = [];
    loadError.value = 'Không thể tải danh mục dịch vụ từ hệ thống. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadCatalog);
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-24 space-y-12">
    <div class="text-center space-y-4 max-w-2xl mx-auto">
      <h1 class="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
        Bảng giá dịch vụ <br class="hidden sm:block"/>tham khảo
      </h1>
      <p class="text-slate-500 text-base sm:text-lg">
        Biểu giá công thợ tham khảo theo tiêu chuẩn kỹ thuật FixHome. Giá thực tế phụ thuộc khảo sát và loại linh kiện thay thế.
      </p>

      <!-- Search Box -->
      <div class="relative max-w-md mx-auto mt-6">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm kiếm dịch vụ (ví dụ: máy lạnh, ống nước...)"
          class="w-full h-14 pl-12 pr-6 text-sm bg-slate-50 border border-slate-200 rounded-full text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 shadow-sm transition-all"
        />
        <Search class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" :size="20" />
      </div>
    </div>

    <!-- Category Filter Tabs -->
    <div v-if="!loading && !loadError" class="flex items-center justify-center gap-3 overflow-x-auto pb-4 no-scrollbar">
      <button
        class="px-5 py-2.5 rounded-full text-sm font-semibold select-none transition-all shrink-0"
        :class="[
          selectedCategoryId === 'ALL'
            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900',
        ]"
        @click="selectedCategoryId = 'ALL'"
      >
        Tất cả dịch vụ
      </button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="px-5 py-2.5 rounded-full text-sm font-semibold select-none transition-all shrink-0"
        :class="[
          selectedCategoryId === cat.id
            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900',
        ]"
        @click="selectedCategoryId = cat.id"
      >
        {{ cat.name }}
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      <div v-for="i in 6" :key="i" class="bg-white border border-slate-200 rounded-4xl p-8 space-y-4">
        <FhSkeleton height="14px" width="40%" />
        <FhSkeleton height="24px" width="90%" />
        <FhSkeleton height="14px" :count="2" />
        <FhSkeleton height="32px" width="50%" />
      </div>
    </div>

    <!-- Error state -->
    <FhEmptyState
      v-else-if="loadError"
      title="Không tải được danh mục dịch vụ"
      :description="loadError"
      action-text="Thử lại"
      @action="loadCatalog"
    />

    <!-- Empty state -->
    <FhEmptyState
      v-else-if="filteredServices.length === 0"
      title="Không tìm thấy dịch vụ phù hợp"
      description="Hãy thử đổi từ khoá tìm kiếm hoặc chọn danh mục khác."
    />

    <!-- Services Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      <div
        v-for="srv in filteredServices"
        :key="srv.id"
        class="bg-white border border-slate-200 rounded-4xl p-8 flex flex-col justify-between hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300 transition-all cursor-pointer"
        @click="goToDetail(srv)"
      >
        <div class="space-y-4">
          <div class="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span class="flex items-center gap-1.5 font-num">
              <Clock :size="14" /> ~{{ srv.estimatedMinutes }} phút
            </span>
            <span class="text-brand-600 font-semibold bg-brand-50 px-2.5 py-1 rounded-full">
              {{ isFixedPrice(srv) ? 'Giá cố định' : 'Cần khảo sát' }}
            </span>
          </div>

          <h3 class="text-xl font-bold text-slate-900 leading-snug">
            {{ srv.name }}
          </h3>

          <p class="text-sm text-slate-500 leading-relaxed font-medium">
            {{ srv.description }}
          </p>
        </div>

        <div class="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              {{ isFixedPrice(srv) ? 'Giá niêm yết' : 'Giá công tham khảo' }}
            </div>
            <div class="text-base font-bold font-num text-slate-900">
              <template v-if="isFixedPrice(srv)">
                <FhMoney :amount="srv.fixedPrice ?? srv.basePrice ?? 0" />
              </template>
              <template v-else>
                <FhMoney :amount="srv.minPrice ?? srv.basePrice ?? 0" /> – <FhMoney :amount="srv.maxPrice ?? srv.basePrice ?? 0" />
              </template>
            </div>
          </div>

          <FhButton variant="primary" size="md" class="rounded-full shadow-md shadow-brand-500/20 h-10 px-5" @click.stop="router.push('/register')">
            Đặt thợ
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
