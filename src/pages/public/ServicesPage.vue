<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Search,
  Clock,
  ShieldCheck,
  Tag,
  ChevronRight,
  X,
  Wrench,
  CheckCircle2,
} from 'lucide-vue-next';
import { FhButton, FhCard, FhMoney } from '../../components';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';

const router = useRouter();

const loading = ref(true);
const selectedCategoryId = ref('ALL');
const searchQuery = ref('');
const categories = ref<ServiceCategory[]>([]);
const services = ref<ServiceItem[]>([]);
const activeModalService = ref<ServiceItem | null>(null);

const fallbackCategories: ServiceCategory[] = [
  { id: 'ALL', name: 'Tất cả dịch vụ', code: 'ALL', sortOrder: 0, isActive: true },
  { id: 'cat-dien-lanh', name: 'Điện lạnh', code: 'DIEN_LANH', sortOrder: 1, isActive: true },
  { id: 'cat-dien-nuoc', name: 'Điện & Nước', code: 'DIEN_NUOC', sortOrder: 2, isActive: true },
  { id: 'cat-gia-dung', name: 'Thiết bị gia dụng', code: 'GIA_DUNG', sortOrder: 3, isActive: true },
  { id: 'cat-khoa-cua', name: 'Khoá cửa & An ninh', code: 'KHOA_CUA', sortOrder: 4, isActive: true },
];

const fallbackServices: ServiceItem[] = [
  {
    id: 'srv-01',
    categoryId: 'cat-dien-lanh',
    name: 'Vệ sinh máy lạnh treo tường (≤ 2.0 HP)',
    code: 'VS_ML_01',
    description: 'Xịt rửa dàn nóng, dàn lạnh bằng bạt chuyên dụng, kiểm tra áp suất gas và khử khuẩn vi sinh.',
    pricingMode: 'FIXED_PRICE',
    fixedPrice: 180000,
    basePrice: 180000,
    minPrice: 180000,
    maxPrice: 250000,
    estimatedMinutes: 45,
    isActive: true,
    scopeDescription: 'Bao gồm vệ sinh lưới lọc, quạt lồng sóc, lá nhôm tản nhiệt, thông máng xả nước.',
  },
  {
    id: 'srv-02',
    categoryId: 'cat-dien-lanh',
    name: 'Nạp gas bổ sung R32 / R410A',
    code: 'NAP_GAS_02',
    description: 'Kiểm tra rò rỉ khớp nối zắc co, nạp gas bổ sung chuẩn áp suất kỹ thuật của hãng.',
    pricingMode: 'FIXED_PRICE',
    fixedPrice: 250000,
    basePrice: 250000,
    minPrice: 200000,
    maxPrice: 350000,
    estimatedMinutes: 30,
    isActive: true,
    scopeDescription: 'Đo kiểm dòng điện máy nén, đo áp suất gas hồi, kiểm tra độ lạnh cửa gió.',
  },
  {
    id: 'srv-03',
    categoryId: 'cat-dien-nuoc',
    name: 'Sửa rò rỉ đường ống nước âm tường',
    code: 'SUA_RO_NUOC_03',
    description: 'Dò tìm điểm rò rỉ áp lực, đục khoét tối thiểu và thay thế đoạn ống nhiệt PPR hoặc PVC hỏng.',
    pricingMode: 'INSPECTION_REQUIRED',
    basePrice: 250000,
    minPrice: 250000,
    maxPrice: 450000,
    estimatedMinutes: 90,
    isActive: true,
    scopeDescription: 'Khảo sát hiện trường, phát hiện điểm rò rỉ ngầm, hàn nối phụ kiện PPR chịu nhiệt.',
  },
  {
    id: 'srv-04',
    categoryId: 'cat-dien-nuoc',
    name: 'Thay thế & lắp mới vòi sen, vòi lavabo',
    code: 'THAY_VOI_04',
    description: 'Tháo dỡ thiết bị cũ cẩn thận, cuốn băng tan chống thấm và lắp đặt thiết bị mới an toàn.',
    pricingMode: 'FIXED_PRICE',
    fixedPrice: 150000,
    basePrice: 150000,
    minPrice: 150000,
    maxPrice: 220000,
    estimatedMinutes: 40,
    isActive: true,
    scopeDescription: 'Lắp đặt củ sen, dây sen, bát sen, thử nước áp suất cao kiểm tra rò rỉ.',
  },
  {
    id: 'srv-05',
    categoryId: 'cat-gia-dung',
    name: 'Sửa bo mạch máy giặt không vắt / báo lỗi',
    code: 'SUA_MAY_GIAT_05',
    description: 'Kiểm tra cảm biến mực nước, công tắc từ cửa, tụ đề mô tơ và phục hồi mạch vi xử lý.',
    pricingMode: 'INSPECTION_REQUIRED',
    basePrice: 350000,
    minPrice: 350000,
    maxPrice: 650000,
    estimatedMinutes: 60,
    isActive: true,
    scopeDescription: 'Kiểm tra lỗi hiển thị, thay rơle hoặc IC công suất, chạy thử chương trình vắt.',
  },
  {
    id: 'srv-06',
    categoryId: 'cat-khoa-cua',
    name: 'Lắp đặt khoá điện tử vân tay thông minh',
    code: 'KHOA_VAN_TAY_06',
    description: 'Khoan đục cửa gỗ/nhôm kính chính xác, cài đặt mã chủ, vân tay, thẻ từ và hướng dẫn sử dụng.',
    pricingMode: 'FIXED_PRICE',
    fixedPrice: 350000,
    basePrice: 350000,
    minPrice: 300000,
    maxPrice: 500000,
    estimatedMinutes: 60,
    isActive: true,
    scopeDescription: 'Đục mộng ruột khóa, kết nối dây tín hiệu, cấu hình ứng dụng mở từ xa.',
  },
];

onMounted(async () => {
  try {
    loading.value = true;
    const [catList, srvRes] = await Promise.all([
      catalogApi.getCategories(true).catch(() => []),
      catalogApi.getServices({ limit: 50 }).catch(() => ({ data: [], meta: { total: 0 } })),
    ]);

    if (catList && catList.length > 0) {
      categories.value = [{ id: 'ALL', name: 'Tất cả dịch vụ', code: 'ALL', sortOrder: 0, isActive: true }, ...catList];
    } else {
      categories.value = fallbackCategories;
    }

    if (srvRes && Array.isArray(srvRes.data) && srvRes.data.length > 0) {
      services.value = srvRes.data;
    } else {
      services.value = fallbackServices;
    }
  } catch {
    categories.value = fallbackCategories;
    services.value = fallbackServices;
  } finally {
    loading.value = false;
  }
});

const filteredServices = computed(() => {
  return services.value.filter((s) => {
    const matchCat =
      selectedCategoryId.value === 'ALL' ||
      s.categoryId === selectedCategoryId.value ||
      (s.category && s.category.id === selectedCategoryId.value);

    const q = searchQuery.value.trim().toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      s.code.toLowerCase().includes(q);

    return matchCat && matchSearch;
  });
});

const handleBookService = (srv: ServiceItem) => {
  router.push(`/app/bookings/new?serviceId=${srv.id}`);
};

const openDetailModal = (srv: ServiceItem) => {
  activeModalService.value = srv;
};

const closeDetailModal = () => {
  activeModalService.value = null;
};
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-10">
    <!-- Header Hero -->
    <div class="text-center space-y-4 max-w-2xl mx-auto">
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold">
        <ShieldCheck :size="14" /> Tiêu chuẩn minh bạch & Kỹ thuật viên FixHome
      </div>

      <h1 class="text-3xl sm:text-4xl font-bold text-ink-900 tracking-tight">
        Bảng giá dịch vụ sửa chữa chuẩn hóa
      </h1>
      <p class="text-ink-600 text-sm sm:text-base">
        Biểu giá công thợ niêm yết theo quy chuẩn kỹ thuật FixHome. Phân tách rõ ràng tiền công và linh kiện phụ tùng.
      </p>

      <!-- Search Box -->
      <div class="relative max-w-md mx-auto pt-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm kiếm dịch vụ (điều hòa, chập điện, vòi nước...)"
          class="w-full h-11 pl-10 pr-4 text-sm bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 shadow-sm"
        />
        <Search class="absolute left-3.5 top-5 text-ink-400" :size="17" />
      </div>
    </div>

    <!-- Category Filter Tabs -->
    <div class="flex items-center justify-center gap-2 overflow-x-auto pb-2">
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-semibold select-none transition-colors shrink-0"
        :class="[
          selectedCategoryId === cat.id
            ? 'bg-brand-600 text-white shadow-sm'
            : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-100',
        ]"
        @click="selectedCategoryId = cat.id"
      >
        {{ cat.name }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải danh mục dịch vụ...
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredServices.length === 0"
      class="text-center py-16 bg-white rounded-xl border border-ink-200 space-y-3"
    >
      <Wrench :size="40" class="mx-auto text-ink-300" />
      <h3 class="text-sm font-bold text-ink-800">Không tìm thấy dịch vụ phù hợp</h3>
      <p class="text-xs text-ink-500">Vui lòng thử từ khoá khác hoặc chọn lại danh mục.</p>
    </div>

    <!-- Services Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <FhCard
        v-for="srv in filteredServices"
        :key="srv.id"
        class="flex flex-col justify-between cursor-pointer hover:border-brand-400 transition-all hover:shadow-md"
        @click="openDetailModal(srv)"
      >
        <div class="space-y-3">
          <div class="flex items-center justify-between text-xs text-ink-500">
            <span class="flex items-center gap-1 font-num">
              <Clock :size="13" /> ~{{ srv.estimatedMinutes || 45 }} phút
            </span>
            <span
              class="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
              :class="srv.pricingMode === 'FIXED_PRICE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-brand-50 text-brand-700 border border-brand-200'"
            >
              {{ srv.pricingMode === 'FIXED_PRICE' ? 'Giá niêm yết' : 'Khảo sát báo giá' }}
            </span>
          </div>

          <h3 class="text-base font-bold text-ink-900 leading-snug hover:text-brand-600 transition-colors">
            {{ srv.name }}
          </h3>

          <p class="text-xs text-ink-600 leading-relaxed line-clamp-2">
            {{ srv.description }}
          </p>

          <div class="flex items-center gap-1.5 text-[11px] text-success-700 font-medium">
            <ShieldCheck :size="14" /> Bảo hành điện tử 30 - 90 ngày
          </div>
        </div>

        <div class="pt-4 mt-4 border-t border-ink-100 flex items-center justify-between gap-2">
          <div>
            <div class="text-[11px] text-ink-400">
              {{ srv.pricingMode === 'FIXED_PRICE' ? 'Giá trọn gói:' : 'Giá công tham khảo:' }}
            </div>
            <div class="text-sm font-bold font-num text-brand-700">
              <template v-if="srv.pricingMode === 'FIXED_PRICE' && srv.fixedPrice">
                <FhMoney :amount="srv.fixedPrice" />
              </template>
              <template v-else-if="srv.minPrice && srv.maxPrice">
                <FhMoney :amount="srv.minPrice" /> – <FhMoney :amount="srv.maxPrice" />
              </template>
              <template v-else>
                <FhMoney :amount="srv.basePrice || 150000" />
              </template>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="text-xs font-semibold text-ink-600 hover:text-ink-900 px-2 py-1 rounded"
              @click.stop="openDetailModal(srv)"
            >
              Chi tiết
            </button>

            <FhButton
              variant="primary"
              size="sm"
              @click.stop="handleBookService(srv)"
            >
              Đặt thợ <ChevronRight :size="13" class="ml-0.5" />
            </FhButton>
          </div>
        </div>
      </FhCard>
    </div>

    <!-- Service Detail Modal -->
    <div
      v-if="activeModalService"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
      @click.self="closeDetailModal"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-5">
        <div class="flex items-start justify-between border-b border-ink-100 pb-3">
          <div class="space-y-1">
            <span class="font-mono text-[11px] text-ink-400 uppercase">MÃ DỊCH VỤ: {{ activeModalService.code }}</span>
            <h2 class="text-lg font-bold text-ink-900 leading-snug">{{ activeModalService.name }}</h2>
          </div>
          <button class="text-ink-400 hover:text-ink-600 p-1" @click="closeDetailModal">
            <X :size="20" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <div>
            <h4 class="font-bold text-ink-800 uppercase text-[11px] mb-1">Mô tả công việc:</h4>
            <p class="text-ink-600 leading-relaxed">{{ activeModalService.description }}</p>
          </div>

          <div v-if="activeModalService.scopeDescription">
            <h4 class="font-bold text-ink-800 uppercase text-[11px] mb-1">Phạm vi công việc chuẩn:</h4>
            <p class="text-ink-600 leading-relaxed bg-ink-50 p-2.5 rounded border border-ink-200">
              {{ activeModalService.scopeDescription }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2">
            <div class="p-3 bg-brand-50 rounded-lg border border-brand-100">
              <span class="text-brand-600 text-[11px] block font-medium">Thời gian thi công dự kiến:</span>
              <span class="font-bold text-brand-900 text-sm flex items-center gap-1 mt-0.5">
                <Clock :size="14" /> ~{{ activeModalService.estimatedMinutes || 45 }} phút
              </span>
            </div>

            <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <span class="text-emerald-600 text-[11px] block font-medium">Mô hình giá:</span>
              <span class="font-bold text-emerald-900 text-sm flex items-center gap-1 mt-0.5">
                <Tag :size="14" />
                {{ activeModalService.pricingMode === 'FIXED_PRICE' ? 'Giá cố định niêm yết' : 'Khảo sát báo giá' }}
              </span>
            </div>
          </div>

          <div class="p-3 bg-ink-50 rounded-lg space-y-1">
            <span class="text-ink-500 text-[11px]">Giá công tiêu chuẩn FixHome:</span>
            <div class="text-base font-bold font-num text-brand-700">
              <template v-if="activeModalService.pricingMode === 'FIXED_PRICE' && activeModalService.fixedPrice">
                <FhMoney :amount="activeModalService.fixedPrice" />
              </template>
              <template v-else-if="activeModalService.minPrice && activeModalService.maxPrice">
                <FhMoney :amount="activeModalService.minPrice" /> – <FhMoney :amount="activeModalService.maxPrice" />
              </template>
              <template v-else>
                <FhMoney :amount="activeModalService.basePrice || 150000" />
              </template>
            </div>
            <p class="text-[10px] text-ink-400">
              * Giá trên là tiền công kỹ thuật. Phụ tùng linh kiện (nếu cần thay) sẽ được lập báo giá phân tách minh bạch trước khi thợ tiến hành.
            </p>
          </div>

          <div class="flex items-center gap-2 text-success-700 bg-success-50/70 p-2.5 rounded border border-success-200">
            <CheckCircle2 :size="16" class="shrink-0" />
            <span class="text-[11px] font-medium">Cam kết bảo hành điện tử chính hãng từ 30 đến 90 ngày sau sửa.</span>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-ink-100">
          <FhButton variant="secondary" size="sm" @click="closeDetailModal">
            Đóng
          </FhButton>
          <FhButton variant="primary" size="sm" @click="handleBookService(activeModalService)">
            Đặt lịch thợ ngay <ChevronRight :size="14" class="ml-1" />
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
